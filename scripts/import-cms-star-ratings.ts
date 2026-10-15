/**
 * Imports CMS Overall Hospital Quality Star Ratings onto providers (#141).
 *
 * Downloads CMS "Hospital General Information" (dataset xubh-q36u), matches
 * each provider to a CMS hospital, and stores the CCN and star rating.
 * Our providers carry no CCN, so matching is by state + ZIP plus name and
 * street address, and it is deliberately strict: a wrong rating is worse
 * than none, so anything uncertain stays unmatched (shown as no rating).
 *
 * Usage (re-run quarterly when CMS refreshes the dataset):
 *   npx tsx --env-file=.env.local scripts/import-cms-star-ratings.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/import-cms-star-ratings.ts
 */

import { writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const DATASET_URL =
  "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/xubh-q36u";

interface CmsHospital {
  "Facility ID": string;
  "Facility Name": string;
  Address: string;
  State: string;
  "ZIP Code": string;
  "Hospital overall rating": string;
}

interface ProviderRow {
  id: string;
  name: string;
  address: string | null;
  state: string | null;
  zip: string | null;
}

interface Match {
  provider: ProviderRow;
  cms: CmsHospital;
  addressMatch: boolean;
  similarity: number;
}

const STREET_ABBR: Record<string, string> = {
  street: "st",
  road: "rd",
  drive: "dr",
  avenue: "ave",
  av: "ave",
  boulevard: "blvd",
  highway: "hwy",
  parkway: "pkwy",
  lane: "ln",
  court: "ct",
  place: "pl",
  circle: "cir",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  route: "rt",
  rte: "rt",
  saint: "st",
  mount: "mt",
  fort: "ft",
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
  expressway: "expy",
  freeway: "fwy",
  terrace: "ter",
  square: "sq",
  plaza: "plz",
  trail: "trl",
};
const DIRECTIONS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);

/** Generic words that say nothing about which hospital it is. */
const GENERIC = new Set(
  "the of and at inc llc lp dba d b a hospital hospitals medical center centre centers health healthcare system systems regional campus clinic clinics care services service memorial general community university facility location department dept co corp corporation company".split(
    " "
  )
);

/** Words that mark a different kind of facility (an LTAC, a clinic...). */
const FACILITY_TYPE = new Set(
  "clinic clinics specialty rehabilitation rehab psych psychiatric psychiatry behavioral ltac ltach ltc hltcu surgery surgical oncology anesthesia outpatient imaging children childrens cancer heart ortho orthopedic orthopaedic women womens sub subacute select kindred encompass vibra nursing hospice emergency er urgent infusion dialysis lab laboratory therapy pediatric neuropsychiatric".split(
    " "
  )
);

/** Health-system brands: two different brands are two different hospitals. */
const BRANDS = new Set(
  "ascension atrium advocate adventhealth banner baptist christus hca tristar methodist mercy kaiser sutter dignity providence intermountain kettering upmc sentara novant wellstar piedmont prisma ochsner ohiohealth mayo cleveland geisinger trinity unitypoint sanford avera essentia aspirus marshfield uchicago northwestern rush corewell beaumont lake uhhospitals bswh steward tenet lifepoint prime select kindred encompass vibra ssm bjc hshs osf carle froedtert allina fairview billings bon secours memorialcare hoag sharp scripps palomar cedars ucla ucsf ucsd uci ucd stanford adventist loma yale hartford nuvance northwell nyu montefiore mountsinai hackensack rwjbarnabas atlantic virtua jefferson penn temple lvhn wvu marshall carilion inova vhc sovah uva bayhealth christiana medstar luminis umms hopkins".split(
    " "
  )
);

const words = (s: string | null | undefined): string[] =>
  (s ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
const streetTokens = (s: string | null | undefined): string[] =>
  words(s).map((t) => STREET_ABBR[t] ?? t);
const letterWords = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/'/g, "")
      .match(/[a-z]+/g) ?? []
  );

/** House number plus the first street word, e.g. ["1108", "ross"]. */
function addressKey(address: string | null): string | null {
  const t = streetTokens(address);
  for (let i = 0; i < t.length; i++) {
    if (/^\d+[a-z]?$/.test(t[i])) {
      const rest = t.slice(i + 1, i + 4).filter((w) => !DIRECTIONS.has(w));
      return `${t[i]} ${rest[0] ?? ""}`;
    }
  }
  return null;
}

function nameTokens(name: string): Set<string> {
  return new Set(
    streetTokens(name).filter((t) => !GENERIC.has(t) && t.length > 1)
  );
}

export function nameSimilarity(a: string, b: string): number {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  const shared = [...A].filter((t) => B.has(t)).length;
  return shared / new Set([...A, ...B]).size;
}

function brands(name: string): Set<string> {
  const t = name
    .toLowerCase()
    .replace("university hospitals", "uhhospitals")
    .replace("mount sinai", "mountsinai");
  return new Set([...letterWords(t)].filter((w) => BRANDS.has(w)));
}

/** True when the two names describe different brands or facility types. */
export function conflictingNames(a: string, b: string): boolean {
  const ba = brands(a);
  const bb = brands(b);
  if (ba.size > 0 && bb.size > 0 && ![...ba].some((x) => bb.has(x))) {
    return true;
  }
  const ta = [...letterWords(a)].filter((w) => FACILITY_TYPE.has(w));
  const tb = new Set([...letterWords(b)].filter((w) => FACILITY_TYPE.has(w)));
  return !ta.every((w) => tb.has(w));
}

const zip5 = (z: string | null | undefined) => z?.match(/\d{5}/)?.[0] ?? null;
const fullName = (s: string) => words(s).join(" ");

export function matchProviders(
  providers: ProviderRow[],
  hospitals: CmsHospital[]
): Match[] {
  const byZip = new Map<string, CmsHospital[]>();
  for (const h of hospitals) {
    const key = `${h.State}|${zip5(h["ZIP Code"])}`;
    byZip.set(key, [...(byZip.get(key) ?? []), h]);
  }

  const matches: Match[] = [];
  for (const provider of providers) {
    const candidates = byZip.get(`${provider.state}|${zip5(provider.zip)}`);
    if (!candidates) continue;
    const providerKey = addressKey(provider.address);
    const scored = candidates
      .map((cms) => {
        const addressMatch =
          providerKey !== null && providerKey === addressKey(cms.Address);
        const similarity = nameSimilarity(provider.name, cms["Facility Name"]);
        const ok =
          ((addressMatch && similarity >= 0.5) || similarity >= 0.75) &&
          !conflictingNames(provider.name, cms["Facility Name"]);
        return { provider, cms, addressMatch, similarity, ok };
      })
      .filter((m) => m.ok)
      .sort(
        (a, b) =>
          Number(b.addressMatch) +
          b.similarity -
          (Number(a.addressMatch) + a.similarity)
      );
    if (scored.length === 0) continue;
    const score = (m: (typeof scored)[number]) =>
      Number(m.addressMatch) + m.similarity;
    if (scored.length > 1 && score(scored[0]) - score(scored[1]) < 0.3) {
      continue; // two plausible CMS hospitals: don't guess
    }
    const { ok: _ok, ...match } = scored[0];
    matches.push(match);
  }

  // A CCN claimed by several providers (campuses, co-located LTACs) keeps only
  // an unambiguous best name match, or exact duplicate provider rows.
  const byCcn = new Map<string, Match[]>();
  for (const m of matches) {
    const ccn = m.cms["Facility ID"];
    byCcn.set(ccn, [...(byCcn.get(ccn) ?? []), m]);
  }
  return [...byCcn.values()].flatMap((group) => {
    if (group.length === 1) return group;
    const best = Math.max(...group.map((m) => m.similarity));
    const top = group.filter((m) => m.similarity === best);
    const names = new Set(top.map((m) => fullName(m.provider.name)));
    return names.size === 1 ? top : [];
  });
}

function starRating(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const meta = await (await fetch(DATASET_URL)).json();
  const csvUrl: string = meta.distribution[0].downloadURL;
  const asOf: string = meta.modified;
  const hospitals = parse(await (await fetch(csvUrl)).text(), {
    columns: true,
    bom: true,
  }) as CmsHospital[];
  console.log(`CMS dataset ${asOf}: ${hospitals.length} hospitals`);

  const providers: ProviderRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, address, state, zip")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    providers.push(...(data as ProviderRow[]));
    if (data.length < 1000) break;
  }

  const matches = matchProviders(providers, hospitals);
  const rated = matches.filter(
    (m) => starRating(m.cms["Hospital overall rating"]) !== null
  );
  console.log(
    `Matched ${matches.length} of ${providers.length} providers; ${rated.length} have a star rating`
  );

  if (dryRun) {
    const report = matches.map((m) => ({
      provider: m.provider.name,
      cms: m.cms["Facility Name"],
      ccn: m.cms["Facility ID"],
      rating: m.cms["Hospital overall rating"],
      addressMatch: m.addressMatch,
      similarity: Number(m.similarity.toFixed(2)),
    }));
    await writeFile("cms-star-matches.json", JSON.stringify(report, null, 2));
    console.log("Dry run: wrote cms-star-matches.json, no database changes");
    return;
  }

  const rows = matches.map((m) => ({
    provider_id: m.provider.id,
    ccn: m.cms["Facility ID"],
    stars: starRating(m.cms["Hospital overall rating"]),
  }));
  const { data, error } = await supabase.rpc("apply_cms_star_ratings", {
    p_rows: rows,
    p_as_of: asOf,
  });
  if (error) throw error;
  console.log(`Updated ${data} providers`);
}

if (process.argv[1]?.endsWith("import-cms-star-ratings.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
