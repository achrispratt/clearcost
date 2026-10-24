import { describe, it, expect, vi } from "vitest";
import type { Pool as PgPool } from "pg";
import {
  drgVariants,
  dropCrawled,
  overlapParams,
  withoutCrawledRows,
} from "@/lib/data/crawler-overlap";

describe("drgVariants", () => {
  it("covers the bare and zero-padded spellings", () => {
    expect(drgVariants("005")).toEqual(["005", "5"]);
    expect(drgVariants("5")).toEqual(["5", "005"]);
    expect(drgVariants("236")).toEqual(["236"]);
    expect(drgVariants(null)).toEqual([]);
  });
});

describe("overlapParams", () => {
  it("passes one array per column, blanks as null", () => {
    expect(
      overlapParams([
        { provider_id: "p1", cpt: "73721", hcpcs: "", ms_drg: null },
        { provider_id: "p2", cpt: null, hcpcs: null, ms_drg: "005" },
      ])
    ).toEqual([
      ["p1", "p2"],
      ["73721", null],
      [null, null],
      [null, "005,5"],
    ]);
  });
});

describe("dropCrawled", () => {
  it("drops the rows at the 1-based positions the query returned", () => {
    expect(dropCrawled(["a", "b", "c", "d"], [2, 4])).toEqual({
      keep: ["a", "c"],
      crawled: 2,
    });
    expect(dropCrawled(["a"], [])).toEqual({ keep: ["a"], crawled: 0 });
  });
});

describe("withoutCrawledRows", () => {
  it("skips the query for an empty batch", async () => {
    const query = vi.fn();
    const result = await withoutCrawledRows({ query } as unknown as PgPool, []);
    expect(result).toEqual({ keep: [], crawled: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps rows the crawler doesn't cover", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ i: "1" }] });
    const rows = [
      { provider_id: "crawled", cpt: null, hcpcs: null, ms_drg: "236" },
      { provider_id: "oria-only", cpt: null, hcpcs: null, ms_drg: "236" },
    ];
    const result = await withoutCrawledRows(
      { query } as unknown as PgPool,
      rows
    );
    expect(result).toEqual({ keep: [rows[1]], crawled: 1 });
    expect(query.mock.calls[0][1][0]).toEqual(["crawled", "oria-only"]);
  });
});
