import { describe, it, expect } from "vitest";
import {
  collapseSharedPriceLists,
  feeScope,
  inpatientStayLabel,
  summarizeAnswer,
} from "@/lib/results/summarize";
import type { CPTCode, ChargeResult } from "@/types";

let seq = 0;
function charge(overrides: Partial<ChargeResult> = {}): ChargeResult {
  seq++;
  return {
    id: `c${seq}`,
    provider: { id: `p${seq}`, name: `Hospital ${seq}` },
    cpt: "73721",
    description: "MRI LOWER EXTREMITY JOINT W/O CONTRAST",
    ...overrides,
  };
}

const kneeMri: CPTCode[] = [
  { code: "73721", description: "MRI knee", category: "Imaging" },
];
const bypass: CPTCode[] = [
  { code: "33533", description: "CABG arterial", category: "Surgery" },
];

function stayRow(msDrg: string, cashPrice: number): ChargeResult {
  return charge({
    cpt: undefined,
    msDrg,
    setting: "inpatient",
    description: "CORONARY BYPASS WITHOUT CARDIAC CATHETERIZATION",
    cashPrice,
  });
}

describe("feeScope", () => {
  it("normalizes billing class values from hospital files", () => {
    expect(feeScope("Facility")).toBe("facility");
    expect(feeScope(" professional ")).toBe("professional");
    expect(feeScope("both")).toBe("complete");
    expect(feeScope(undefined)).toBe("complete");
  });
});

describe("collapseSharedPriceLists", () => {
  it("merges identical price lines from one system's buildings", () => {
    const msk = {
      description: "RADIOLOGY GROUP",
      cashPrice: 350,
      avgNegotiatedRate: 288.59,
    };
    const results = [
      charge({ cashPrice: 280 }),
      charge(msk),
      charge(msk),
      charge({ cashPrice: 3988 }),
      charge(msk),
    ];
    const entries = collapseSharedPriceLists(results);
    expect(entries).toHaveLength(3);
    expect(entries[1].locations).toHaveLength(3);
    expect(entries[1].primary).toBe(results[1]);
  });

  it("leads a shared list with a clinical site, not a counseling office (#172)", () => {
    const msk = { description: "CABG", cashPrice: 15925 };
    const counseling = charge({
      ...msk,
      provider: {
        id: "pc",
        name: "Memorial Sloan Kettering Counseling Center",
      },
    });
    const main = charge({
      ...msk,
      provider: { id: "pm", name: "Memorial Sloan Kettering Cancer Center" },
    });
    const [entry] = collapseSharedPriceLists([counseling, main]);
    expect(entry.primary).toBe(main);
    expect(entry.locations).toEqual([main, counseling]);
  });

  it("keeps different prices and unpriced lines separate", () => {
    const entries = collapseSharedPriceLists([
      charge({ cashPrice: 350 }),
      charge({ cashPrice: 351 }),
      charge({}),
      charge({}),
    ]);
    expect(entries).toHaveLength(4);
  });
});

describe("inpatientStayLabel", () => {
  it("flags bypass surgery and ignores outpatient imaging", () => {
    expect(inpatientStayLabel(bypass)).toBe("heart bypass surgery");
    expect(inpatientStayLabel(kneeMri)).toBeNull();
  });

  it("ignores non-CPT code types", () => {
    expect(
      inpatientStayLabel([
        { code: "33533", description: "", category: "", codeType: "hcpcs" },
      ])
    ).toBeNull();
  });
});

describe("summarizeAnswer", () => {
  it("gives a cash range, median and lowest entry", () => {
    const summary = summarizeAnswer(
      [
        charge({ cashPrice: 3988 }),
        charge({ cashPrice: 280, billingClass: "Facility" }),
        charge({ cashPrice: 283, billingClass: "Facility" }),
      ],
      kneeMri
    );
    expect(summary.state).toBe("priced");
    expect(summary.low).toBe(280);
    expect(summary.high).toBe(3988);
    expect(summary.median).toBe(283);
    expect(summary.lowest?.price.amount).toBe(280);
    expect(summary.basis).toBe("cash");
    expect(summary.scope).toBe("facility");
  });

  it("never uses list prices for the headline range", () => {
    const summary = summarizeAnswer(
      [charge({ cashPrice: 500 }), charge({ grossCharge: 9000 })],
      kneeMri
    );
    expect(summary.high).toBe(500);
    expect(summary.entries).toHaveLength(2);
  });

  it("labels a mix of cash and insured prices", () => {
    const summary = summarizeAnswer(
      [charge({ cashPrice: 500 }), charge({ avgNegotiatedRate: 700 })],
      kneeMri
    );
    expect(summary.basis).toBe("mixed");
  });

  it("says when every price is only a doctor's fee", () => {
    const summary = summarizeAnswer(
      [
        charge({ cashPrice: 900, billingClass: "professional" }),
        charge({ cashPrice: 1200, billingClass: "Professional" }),
      ],
      kneeMri
    );
    expect(summary.state).toBe("doctor_fees_only");
  });

  it("keeps doctor-only fees out of the range when hospital prices exist (#174)", () => {
    const summary = summarizeAnswer(
      [
        charge({ cashPrice: 400, billingClass: "professional" }),
        charge({ cashPrice: 2000, billingClass: "facility" }),
        charge({ cashPrice: 3000 }),
      ],
      kneeMri
    );
    expect(summary.state).toBe("priced");
    expect(summary.low).toBe(2000);
    expect(summary.high).toBe(3000);
    expect(summary.rangeCount).toBe(2);
    expect(summary.lowest?.price.amount).toBe(2000);
    // The doctor-only line is still listed.
    expect(summary.priced).toHaveLength(3);
  });

  it("prices a hospital stay from the typical-severity DRG (#173)", () => {
    const summary = summarizeAnswer(
      [
        charge({ cpt: "33533", cashPrice: 6186, billingClass: "professional" }),
        stayRow("235", 120000),
        stayRow("236", 52000),
        stayRow("236", 61000),
        // A revenue code filed in the DRG column is not a stay price.
        charge({
          cpt: undefined,
          msDrg: "236",
          setting: "inpatient",
          description: "NURSERY LEVEL II",
          cashPrice: 900,
        }),
      ],
      bypass
    );
    expect(summary.state).toBe("priced");
    expect(summary.stayDrg).toBe("236");
    expect(summary.low).toBe(52000);
    expect(summary.high).toBe(61000);
    expect(summary.scope).toBe("facility");
    // Neither the surgeon line nor the complicated-stay DRG is listed.
    expect(summary.entries).toHaveLength(2);
  });

  it("doesn't price a stay from the major-complications DRG alone", () => {
    const summary = summarizeAnswer(
      [charge({ cpt: "33533", cashPrice: 6186 }), stayRow("235", 120000)],
      bypass
    );
    expect(summary.state).toBe("inpatient_unpriced");
    expect(summary.high).toBe(6186);
    expect(summary.entries).toHaveLength(1);
  });

  it("refuses to price an inpatient-stay procedure without DRG data", () => {
    const summary = summarizeAnswer(
      [
        charge({
          cpt: "33533",
          avgNegotiatedRate: 4720,
          billingClass: "Facility",
        }),
        charge({ cpt: "33533", cashPrice: 6186, billingClass: "professional" }),
      ],
      bypass
    );
    expect(summary.state).toBe("inpatient_unpriced");
    expect(summary.inpatientLabel).toBe("heart bypass surgery");
    expect(summary.low).toBe(4720);
    expect(summary.high).toBe(6186);
  });

  it("prices an inpatient procedure normally when DRG rows exist", () => {
    const summary = summarizeAnswer([stayRow("236", 45000)], bypass);
    expect(summary.state).toBe("priced");
  });

  it("reports no prices when nothing usable came back", () => {
    expect(summarizeAnswer([charge({ grossCharge: 100 })], kneeMri).state).toBe(
      "no_prices"
    );
    expect(summarizeAnswer([], kneeMri).state).toBe("no_prices");
  });
});
