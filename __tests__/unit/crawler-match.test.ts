import { describe, expect, it } from "vitest";
import {
  matchProvider,
  stateFromAddress,
  zipFromAddress,
} from "@/scripts/crawl-mrf";

const p = (id: string, name: string, zip: string | null) => ({ id, name, zip });

describe("crawled file → provider matching", () => {
  it("reads ZIP and state from an MRF address", () => {
    expect(zipFromAddress("6565 Fannin, Houston, TX 77030")).toBe("77030");
    expect(zipFromAddress("1 Main St, Albany, NY 12207-1234")).toBe("12207");
    expect(stateFromAddress("6565 Fannin, Houston, TX 77030")).toBe("TX");
    expect(stateFromAddress("no state here")).toBeNull();
  });

  it("matches on name, helped by a shared ZIP", () => {
    const providers = [
      p("a", "Houston Methodist Hospital", "77030"),
      p("b", "Houston Methodist Sugar Land Hospital", "77479"),
    ];
    expect(
      matchProvider(
        providers,
        ["The Methodist Hospital", "Houston Methodist Hospital"],
        ["77030"]
      )?.provider.id
    ).toBe("a");
  });

  it("does not match a system name to another campus in a different ZIP", () => {
    const providers = [p("suffolk", "NYU Langone Hospital - Suffolk", "11772")];
    expect(
      matchProvider(
        providers,
        ["NYU Langone Tisch Hospital", "NYU Langone"],
        ["10016"]
      )
    ).toBeNull();
  });

  it("refuses to guess between two equally good candidates", () => {
    const providers = [
      p("a", "Mercy Hospital", null),
      p("b", "Mercy Hospital", null),
    ];
    expect(matchProvider(providers, ["Mercy Hospital"], [])).toBeNull();
  });
});
