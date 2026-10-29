import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerCard } from "@/components/results/AnswerCard";
import { summarizeAnswer } from "@/lib/results/summarize";
import type { ChargeResult } from "@/types";

describe("price answer provenance", () => {
  it("labels a constructed visit as an estimate rather than a published cash price", () => {
    const results: ChargeResult[] = [
      {
        id: "visit",
        provider: { id: "p", name: "Hospital" },
        billingClass: "facility",
        encounterEstimate: {
          amount: 480,
          min: 400,
          max: 600,
          basis: "insured",
          scope: "facility",
          source: "facility",
        },
      },
    ];
    const html = renderToStaticMarkup(
      createElement(AnswerCard, {
        summary: summarizeAnswer(results, []),
        codes: [],
        results,
        interpretation: "Office visit",
        locationDisplay: "New York",
      })
    );
    expect(html).toContain("Visit estimates");
    expect(html).toContain("Lowest visit estimate");
    expect(html).not.toContain("Cash prices");
    expect(html).not.toContain("Lowest comparable published price");
  });
});

it("does not add assumed separate fees to a price that already includes both fee classes", () => {
  const codes = [
    { code: "73721", description: "Knee MRI", category: "Imaging" },
  ];
  const results: ChargeResult[] = [
    {
      id: "complete",
      provider: { id: "p", name: "Hospital" },
      cpt: "73721",
      billingClass: "both",
      cashPrice: 500,
    },
  ];
  const html = renderToStaticMarkup(
    createElement(AnswerCard, {
      summary: summarizeAnswer(results, codes),
      codes,
      results,
      interpretation: "MRI",
      locationDisplay: "NYC",
    })
  );
  expect(html).not.toContain("rough estimate, billed separately");
});
