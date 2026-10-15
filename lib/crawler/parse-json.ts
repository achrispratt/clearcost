// Stream-parse a CMS template JSON MRF (v2.x / v3.0). Files run to several GB,
// so the file is never held in memory: a token stream is walked by depth, and
// only the header fields and one standard_charge_information item at a time
// are assembled into objects.

import type { Readable } from "stream";
import { parser } from "stream-json";
import Assembler from "stream-json/Assembler";

import { hasWantedCode, type CodeSet } from "./codes";
import { parseAmount } from "./normalize";
import type { MrfMeta, ParseStats, RawCharge, RawCode } from "./types";

const META_KEYS = new Set([
  "hospital_name",
  "last_updated_on",
  "version",
  "location_name",
  "hospital_address",
  "license_information",
]);

type Json = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === "string"
    ? v.trim() || null
    : typeof v === "number"
      ? String(v)
      : null;

const strList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).map(str).filter((s): s is string => !!s);

function applyMeta(meta: MrfMeta, key: string, value: unknown): void {
  switch (key) {
    case "hospital_name":
      meta.hospitalName = str(value);
      break;
    case "last_updated_on":
      meta.lastUpdatedOn = str(value);
      break;
    case "version":
      meta.version = str(value);
      break;
    case "location_name":
      meta.locationNames = strList(value);
      break;
    case "hospital_address":
      meta.addresses = strList(value);
      break;
    case "license_information":
      meta.licenseState =
        str((value as Json | null)?.state)?.toUpperCase() ?? null;
      break;
  }
}

function itemCodes(item: Json): RawCode[] {
  const codes: RawCode[] = [];
  for (const c of (item.code_information as Json[] | undefined) ?? []) {
    const code = str(c?.code);
    const type = str(c?.type);
    if (code && type) codes.push({ code, type });
  }
  return codes;
}

/** One standard_charge_information item → one RawCharge per standard_charges entry. */
function itemToRawCharges(item: Json): RawCharge[] {
  const codes = itemCodes(item);
  const description = str(item.description);
  return ((item.standard_charges as Json[] | undefined) ?? []).map((sc) => ({
    description,
    codes,
    setting: str(sc.setting),
    billingClass: str(sc.billing_class),
    modifiers: Array.isArray(sc.modifier_code)
      ? strList(sc.modifier_code).join(",") || null
      : str(sc.modifier_code),
    gross: parseAmount(sc.gross_charge),
    cash: parseAmount(sc.discounted_cash),
    min: parseAmount(sc.minimum),
    max: parseAmount(sc.maximum),
    payers: ((sc.payers_information as Json[] | undefined) ?? []).map((p) => ({
      payerName: str(p.payer_name),
      planName: str(p.plan_name),
      dollar: parseAmount(p.standard_charge_dollar),
      methodology: str(p.methodology),
      medianAllowed: parseAmount(p.median_amount),
    })),
  }));
}

/**
 * Yield the standard charges whose item carries a wanted code. `meta` is
 * filled in as the header fields stream past (normally before the charges).
 */
export async function* parseJsonMrf(
  input: Readable,
  codeSet: CodeSet,
  meta: MrfMeta,
  stats: ParseStats
): AsyncGenerator<RawCharge> {
  const tokens = parser({ packValues: true, streamValues: false });
  input.on("error", (err) => tokens.destroy(err));
  input.pipe(tokens);

  let depth = 0;
  let topKey: string | null = null;
  let inCharges = false;
  let asm: Assembler | null = null;
  let asmBase = 0;
  let asmKey: string | null = null; // null = a charge item

  for await (const t of tokens as AsyncIterable<{
    name: string;
    value?: string;
  }>) {
    const opens = t.name === "startObject" || t.name === "startArray";
    const closes = t.name === "endObject" || t.name === "endArray";

    if (!asm) {
      if (depth === 0 && t.name !== "startObject") {
        throw new Error("JSON MRF root is not an object");
      }
      if (depth === 1 && t.name === "keyValue") {
        topKey = t.value ?? null;
        continue;
      }
      const startsMeta =
        depth === 1 && !closes && topKey !== null && META_KEYS.has(topKey);
      const startsItem = depth === 2 && inCharges && t.name === "startObject";
      if (startsMeta || startsItem) {
        asm = new Assembler();
        asmBase = depth;
        asmKey = startsMeta ? topKey : null;
      } else if (
        depth === 1 &&
        topKey === "standard_charge_information" &&
        t.name === "startArray"
      ) {
        inCharges = true;
      } else if (depth === 2 && inCharges && t.name === "endArray") {
        inCharges = false;
      }
    }

    if (opens) depth++;
    else if (closes) depth--;
    if (!asm) continue;

    asm.consume(t);
    if (depth !== asmBase) continue; // value still open

    const value = asm.current as unknown;
    const key = asmKey;
    asm = null;
    if (key !== null) {
      applyMeta(meta, key, value);
      continue;
    }
    stats.scanned++;
    const item = value as Json;
    if (!hasWantedCode(itemCodes(item), codeSet)) continue;
    stats.matched++;
    yield* itemToRawCharges(item);
  }
}
