import { describe, expect, it } from "vitest";
import { suggestLocations } from "@/lib/location-suggest";

describe("suggestLocations", () => {
  it("puts big cities first for a city prefix", () => {
    const labels = suggestLocations("hous").map((s) => s.label);
    expect(labels[0]).toBe("Houston, TX");
  });

  it("narrows by state after a comma", () => {
    const labels = suggestLocations("portland, me").map((s) => s.label);
    expect(labels).toEqual(["Portland, ME"]);
  });

  it("completes ZIP prefixes", () => {
    const [first] = suggestLocations("0862");
    expect(first.label).toMatch(/^Trenton, NJ 0862\d$/);
    expect(first.lat).toBeGreaterThan(40);
  });

  it("ignores input that is too short", () => {
    expect(suggestLocations("h")).toEqual([]);
  });
});
