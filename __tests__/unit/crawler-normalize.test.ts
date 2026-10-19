import { Readable } from "stream";
import { describe, expect, it } from "vitest";
import { buildCodeSet, classifyCode, normalizeDrg } from "@/lib/crawler/codes";
import {
  negotiatedStats,
  normalizeMethodology,
  parseAmount,
  toCrawledCharge,
} from "@/lib/crawler/normalize";
import { parseCsvMrf } from "@/lib/crawler/parse-csv";
import { parseJsonMrf } from "@/lib/crawler/parse-json";
import type { MrfMeta, ParseStats, RawCharge } from "@/lib/crawler/types";

const codeSet = buildCodeSet(["73721", "G0121", "470", "5"]);
const emptyMeta = (): MrfMeta => ({
  hospitalName: null,
  lastUpdatedOn: null,
  version: null,
  locationNames: [],
  addresses: [],
  licenseState: null,
});
const source = { mrfUrl: "https://example.org/x.json", meta: emptyMeta() };

const rate = (
  dollar: number | null,
  methodology: string | null = "case rate"
) => ({
  payerName: "Payer",
  planName: "Plan",
  dollar,
  methodology,
  medianAllowed: null,
});

const raw = (overrides: Partial<RawCharge>): RawCharge => ({
  description: "MRI KNEE WITHOUT CONTRAST RT",
  codes: [{ code: "73721", type: "CPT" }],
  setting: " Outpatient ",
  billingClass: "Faciltiy",
  modifiers: null,
  gross: 2000,
  cash: 800,
  min: 400,
  max: 1200,
  payers: [],
  ...overrides,
});

async function collect(gen: AsyncGenerator<RawCharge>): Promise<RawCharge[]> {
  const out: RawCharge[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

describe("code set", () => {
  it("normalizes DRG spellings to three digits", () => {
    expect(normalizeDrg("5")).toBe("005");
    expect(normalizeDrg("0470")).toBe("470");
    expect(normalizeDrg("MS-DRG 470")).toBe("470");
    expect(normalizeDrg("470A")).toBeNull();
  });

  it("splits procedures from DRGs and classifies file codes", () => {
    expect([...codeSet.drgs].sort()).toEqual(["005", "470"]);
    expect(classifyCode({ code: "73721", type: "CPT" }, codeSet)).toEqual({
      column: "cpt",
      code: "73721",
    });
    expect(classifyCode({ code: "73721", type: "hcpcs" }, codeSet)).toEqual({
      column: "hcpcs",
      code: "73721",
    });
    expect(classifyCode({ code: "005", type: "MS-DRG" }, codeSet)).toEqual({
      column: "ms_drg",
      code: "005",
    });
    expect(classifyCode({ code: "470", type: "APR-DRG" }, codeSet)).toBeNull();
    expect(classifyCode({ code: "0610", type: "RC" }, codeSet)).toBeNull();
  });
});

describe("parseAmount / normalizeMethodology", () => {
  it("parses numbers and money strings, rejects junk", () => {
    expect(parseAmount(12.5)).toBe(12.5);
    expect(parseAmount("$1,234.50")).toBe(1234.5);
    expect(parseAmount("N/A")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("folds methodology spellings", () => {
    expect(normalizeMethodology("Per_Diem")).toBe("per diem");
    expect(normalizeMethodology(" PER-DIEM ")).toBe("per diem");
    expect(normalizeMethodology("")).toBeNull();
  });
});

describe("negotiatedStats", () => {
  it("averages positive dollar rates for a procedure, per diem included", () => {
    expect(
      negotiatedStats(
        [rate(100), rate(300, "per diem"), rate(0), rate(null)],
        false
      )
    ).toEqual({ avg: 200, min: 100, max: 300, count: 2, perDiemExcluded: 0 });
  });

  it("leaves per-diem rates out of a stay's stats (#185)", () => {
    expect(
      negotiatedStats(
        [rate(40000), rate(20000, "case rate"), rate(4000, "Per Diem")],
        true
      )
    ).toEqual({
      avg: 30000,
      min: 20000,
      max: 40000,
      count: 2,
      perDiemExcluded: 1,
    });
  });

  it("leaves out placeholder rates far under the median (#184)", () => {
    expect(
      negotiatedStats(
        [rate(0.01), rate(1.15), rate(1800), rate(2000), rate(2200), rate(600)],
        false
      )
    ).toEqual({ avg: 1650, min: 600, max: 2200, count: 4, perDiemExcluded: 0 });
  });

  it("returns no stats when a stay only has per-diem rates", () => {
    expect(negotiatedStats([rate(4000, "per diem")], true)).toEqual({
      avg: null,
      min: null,
      max: null,
      count: null,
      perDiemExcluded: 1,
    });
  });
});

describe("toCrawledCharge", () => {
  it("maps a standard charge to the charges row shape", () => {
    const row = toCrawledCharge(
      raw({
        codes: [
          { code: "73721", type: "CPT" },
          { code: "0610", type: "RC" },
          { code: "123456", type: "CDM" },
        ],
        payers: [rate(500), rate(700)],
      }),
      codeSet,
      source
    );
    expect(row).toMatchObject({
      setting: "outpatient",
      billing_class: "facility",
      cpt: "73721",
      hcpcs: null,
      ms_drg: null,
      revenue_code: "0610",
      laterality: "right",
      body_site: "knee",
      gross_charge: 2000,
      cash_price: 800,
      min_price: 400,
      max_price: 1200,
      avg_negotiated_rate: 600,
      min_negotiated_rate: 500,
      max_negotiated_rate: 700,
      payer_count: 2,
      source: "cms_mrf",
    });
  });

  it("keeps placeholder cash prices as published (filtered at display, #184)", () => {
    expect(
      toCrawledCharge(raw({ cash: 0.01 }), codeSet, source)?.cash_price
    ).toBe(0.01);
  });

  it("skips charges with no wanted code", () => {
    expect(
      toCrawledCharge(
        raw({ codes: [{ code: "99999", type: "CPT" }] }),
        codeSet,
        source
      )
    ).toBeNull();
  });

  it("prices a DRG stay without per-diem rates and keeps the allowed median", () => {
    const row = toCrawledCharge(
      raw({
        description: "MAJOR HIP AND KNEE JOINT REPLACEMENT WITHOUT MCC",
        codes: [{ code: "470", type: "MS-DRG" }],
        setting: "inpatient",
        payers: [
          { ...rate(30000), medianAllowed: 28000 },
          { ...rate(3500, "per diem"), medianAllowed: 26000 },
          { ...rate(null, "other"), medianAllowed: 18000 },
        ],
      }),
      codeSet,
      source
    );
    expect(row).toMatchObject({
      ms_drg: "470",
      avg_negotiated_rate: 30000,
      payer_count: 1,
      per_diem_rates_excluded: 1,
      allowed_amount_median: 26000,
    });
  });
});

describe("parseJsonMrf", () => {
  it("streams header fields and only the items with wanted codes", async () => {
    const doc = {
      hospital_name: "Example Hospital",
      last_updated_on: "2026-04-01",
      version: "3.0.0",
      location_name: ["Example Hospital"],
      hospital_address: ["1 Main St, Springfield, IL 62701"],
      license_information: { license_number: "123", state: "il" },
      standard_charge_information: [
        {
          description: "Unrelated drug",
          code_information: [{ code: "12345678901", type: "NDC" }],
          standard_charges: [{ setting: "outpatient", gross_charge: 5 }],
        },
        {
          description: "MRI knee",
          code_information: [{ code: "73721", type: "CPT" }],
          standard_charges: [
            {
              setting: "outpatient",
              gross_charge: 2000,
              discounted_cash: 800,
              minimum: 500,
              maximum: 700,
              modifier_code: ["TC"],
              billing_class: "facility",
              payers_information: [
                {
                  payer_name: "Aetna",
                  plan_name: "PPO",
                  standard_charge_dollar: 500,
                  methodology: "fee schedule",
                },
                {
                  payer_name: "Cigna",
                  plan_name: "All",
                  standard_charge_dollar: 700,
                  median_amount: 650,
                  methodology: "fee schedule",
                },
              ],
            },
            { setting: "inpatient", gross_charge: 2500 },
          ],
        },
      ],
      modifier_information: [],
    };
    const meta = emptyMeta();
    const stats: ParseStats = { scanned: 0, matched: 0 };
    const charges = await collect(
      parseJsonMrf(Readable.from([JSON.stringify(doc)]), codeSet, meta, stats)
    );
    expect(meta).toMatchObject({
      hospitalName: "Example Hospital",
      version: "3.0.0",
      licenseState: "IL",
      addresses: ["1 Main St, Springfield, IL 62701"],
    });
    expect(stats).toEqual({ scanned: 2, matched: 1 });
    expect(charges).toHaveLength(2);
    expect(charges[0]).toMatchObject({
      description: "MRI knee",
      setting: "outpatient",
      modifiers: "TC",
      cash: 800,
      payers: [
        { payerName: "Aetna", dollar: 500, medianAllowed: null },
        { payerName: "Cigna", dollar: 700, medianAllowed: 650 },
      ],
    });
    expect(charges[1]).toMatchObject({ setting: "inpatient", gross: 2500 });
  });
});

describe("parseJsonMrf key order", () => {
  it("reads header fields that come after the charges", async () => {
    const doc = {
      standard_charge_information: [
        {
          description: "Stay",
          code_information: [{ code: "470", type: "MS-DRG" }],
          standard_charges: [{ setting: "inpatient", gross_charge: 90000 }],
        },
      ],
      hospital_name: "Late Header Hospital",
    };
    const meta = emptyMeta();
    const charges = await collect(
      parseJsonMrf(Readable.from([JSON.stringify(doc)]), codeSet, meta, {
        scanned: 0,
        matched: 0,
      })
    );
    expect(charges).toHaveLength(1);
    expect(meta.hospitalName).toBe("Late Header Hospital");
  });
});

const csvHeader =
  "hospital_name,last_updated_on,version,location_name,hospital_address,license_number|NY\n" +
  'Example Hospital,2026-01-01,3.0.0,Main|North,"1 Main St, Albany, NY 12207|2 North Rd, Albany, NY 12208",H123\n';

describe("parseCsvMrf", () => {
  it("groups tall rows back into one charge per item", async () => {
    const csv =
      csvHeader +
      "description,code|1,code|1|type,code|2,code|2|type,setting,standard_charge|gross,standard_charge|discounted_cash," +
      "payer_name,plan_name,standard_charge|negotiated_dollar,median_amount,standard_charge|min,standard_charge|max," +
      "standard_charge|methodology,billing_class\n" +
      "MRI knee,73721,CPT,0610,RC,outpatient,2000,800,Aetna,PPO,500,,500,700,fee schedule,facility\n" +
      "MRI knee,73721,CPT,0610,RC,outpatient,2000,800,Cigna,All,700,650,500,700,fee schedule,facility\n" +
      "Aspirin,12345678901,NDC,,,outpatient,1,1,Aetna,PPO,1,,1,1,fee schedule,facility\n";
    const meta = emptyMeta();
    const stats: ParseStats = { scanned: 0, matched: 0 };
    const charges = await collect(
      parseCsvMrf(Readable.from([csv]), codeSet, meta, stats)
    );
    expect(meta).toMatchObject({
      hospitalName: "Example Hospital",
      locationNames: ["Main", "North"],
      licenseState: "NY",
    });
    expect(stats).toEqual({ scanned: 3, matched: 2, csvLayout: "tall" });
    expect(charges).toHaveLength(1);
    expect(
      charges[0].payers.map((p) => [p.payerName, p.dollar, p.medianAllowed])
    ).toEqual([
      ["Aetna", 500, null],
      ["Cigna", 700, 650],
    ]);
  });

  it("keeps one item together when contract groups have their own min/max", async () => {
    const csv =
      csvHeader +
      "description,code|1,code|1|type,setting,payer_name,plan_name,standard_charge|negotiated_dollar," +
      "standard_charge|min,standard_charge|max,standard_charge|methodology\n" +
      "MRI knee,73721,CPT,outpatient,UHC,Medicare Advantage,251.97,239.37,440.95,other\n" +
      "MRI knee,73721,CPT,outpatient,BCBS,PPO,1922.28,339.36,1991.76,other\n" +
      "MRI knee,73721,CPT,inpatient,BCBS,PPO,1991.76,339.36,1991.76,other\n";
    const charges = await collect(
      parseCsvMrf(Readable.from([csv]), codeSet, emptyMeta(), {
        scanned: 0,
        matched: 0,
      })
    );
    expect(charges).toHaveLength(2);
    expect(charges[0]).toMatchObject({
      setting: "outpatient",
      min: 239.37,
      max: 1991.76,
    });
    expect(charges[0].payers.map((p) => p.dollar)).toEqual([251.97, 1922.28]);
  });

  it("reads payer columns from a wide header", async () => {
    const csv =
      csvHeader +
      "description,code|1,code|1|type,setting,standard_charge|gross,standard_charge|discounted_cash," +
      "standard_charge|Aetna|PPO|negotiated_dollar,standard_charge|Aetna|PPO|methodology," +
      "median_amount|Aetna|PPO," +
      "standard_charge|Cigna | All Plans|negotiated_dollar,standard_charge|Cigna | All Plans|methodology," +
      "median_amount|Cigna | All Plans,modifiers\n" +
      "Stay,470,MS-DRG,inpatient,90000,,40000,case rate,38000,4000,per diem,36000,\n" +
      "MRI,73721,HCPCS,outpatient,2000,800,,,,,,,26|TC\n";
    const stats: ParseStats = { scanned: 0, matched: 0 };
    const charges = await collect(
      parseCsvMrf(Readable.from([csv]), codeSet, emptyMeta(), stats)
    );
    expect(stats.csvLayout).toBe("wide");
    expect(charges).toHaveLength(2);
    expect(charges[0].payers).toEqual([
      {
        payerName: "Aetna",
        planName: "PPO",
        dollar: 40000,
        methodology: "case rate",
        medianAllowed: 38000,
      },
      {
        payerName: "Cigna",
        planName: "All Plans",
        dollar: 4000,
        methodology: "per diem",
        medianAllowed: 36000,
      },
    ]);
    expect(charges[1]).toMatchObject({ modifiers: "26,TC", payers: [] });
    expect(toCrawledCharge(charges[0], codeSet, source)).toMatchObject({
      ms_drg: "470",
      avg_negotiated_rate: 40000,
      per_diem_rates_excluded: 1,
    });
  });

  it("rejects CSVs that are not in the CMS template layout", async () => {
    const csv = "a,b\n1,2\nfoo,bar\n1,2\n";
    await expect(
      collect(
        parseCsvMrf(Readable.from([csv]), codeSet, emptyMeta(), {
          scanned: 0,
          matched: 0,
        })
      )
    ).rejects.toThrow(/CMS template/);
  });
});
