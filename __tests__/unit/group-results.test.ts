import { describe, it, expect } from "vitest";
import { groupResultsByProvider } from "@/lib/cpt/group-results";
import type { ChargeResult } from "@/types";

const charge = (over: Partial<ChargeResult>): ChargeResult =>
  ({
    id: over.id ?? "c",
    provider: { id: "p1", name: "Hospital" },
    cpt: "73721",
    billingClass: "facility",
    cashPrice: 5328.63,
    ...over,
  }) as ChargeResult;

describe("groupResultsByProvider", () => {
  it("prices a procedure from its outpatient row, not the inpatient one", () => {
    const [group] = groupResultsByProvider([
      charge({ id: "ip", setting: "inpatient", avgNegotiatedRate: 13632 }),
      charge({ id: "op", setting: "outpatient", avgNegotiatedRate: 880 }),
    ]);
    expect(group.id).toBe("op");
    expect(group.variantCount).toBe(2);
  });

  it("keeps inpatient rows for hospital stays", () => {
    const [group] = groupResultsByProvider([
      charge({
        id: "stay",
        cpt: undefined,
        msDrg: "470",
        setting: "inpatient",
        cashPrice: 30000,
      }),
      charge({
        id: "stay2",
        cpt: undefined,
        msDrg: "470",
        setting: "inpatient",
        cashPrice: 32000,
      }),
    ]);
    expect(group.id).toBe("stay");
  });
});
