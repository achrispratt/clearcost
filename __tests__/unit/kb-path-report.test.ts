import { describe, it, expect } from "vitest";

import {
  countNewPhrasings,
  highBouncePaths,
  median,
  summarizeMisses,
  summarizePaths,
  type PathStatsRow,
} from "@/lib/kb/path-report";

function row(
  path_hash: string,
  period: string,
  walk_count: number,
  bounce_count: number,
  extra: Partial<PathStatsRow> = {}
): PathStatsRow {
  return {
    path_hash,
    period,
    walk_count,
    click_count: 0,
    save_count: 0,
    bounce_count,
    confidence: null,
    ...extra,
  };
}

describe("summarizePaths", () => {
  it("sums months per path and takes confidence from the latest month", () => {
    const [s] = summarizePaths([
      row("a", "2026-10-01", 10, 4, { confidence: "0.12" }),
      row("a", "2026-09-01", 30, 6, { click_count: 12, confidence: "0.4" }),
    ]);
    expect(s.walks).toBe(40);
    expect(s.bounces).toBe(10);
    expect(s.bounce_rate).toBe(0.25);
    expect(s.click_rate).toBe(0.3);
    expect(s.latest_period).toBe("2026-10-01");
    expect(s.latest_confidence).toBe(0.12);
  });

  it("has null rates with no walks and caps rates at 1", () => {
    const [none, capped] = summarizePaths([
      row("none", "2026-10-01", 0, 3),
      row("capped", "2026-10-01", 2, 7),
    ]);
    expect(none.bounce_rate).toBeNull();
    expect(capped.bounce_rate).toBe(1);
  });
});

describe("median", () => {
  it("handles empty, odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(median([0.3, 0.1, 0.2])).toBe(0.2);
    expect(median([0.4, 0.1, 0.2, 0.3])).toBeCloseTo(0.25);
  });
});

describe("highBouncePaths", () => {
  const summaries = summarizePaths([
    row("bad", "2026-10-01", 100, 50),
    row("worse-but-thin", "2026-10-01", 5, 5),
    row("ok", "2026-10-01", 100, 10),
    row("edge", "2026-10-01", 100, 30),
  ]);

  it("lists paths over the threshold that meet min walks, worst first", () => {
    const { paths, eligible } = highBouncePaths(summaries, {
      minWalks: 10,
      threshold: 0.3,
    });
    expect(paths.map((p) => p.path_hash)).toEqual(["bad"]); // 0.30 is not > 0.30
    expect(eligible).toBe(3);
  });

  it("computes the median only over paths meeting min walks", () => {
    const { medianBounceRate } = highBouncePaths(summaries, {
      minWalks: 10,
      threshold: 0.3,
    });
    expect(medianBounceRate).toBe(0.3);
  });
});

describe("summarizeMisses", () => {
  it("counts distinct sessions per query and drops rare ones", () => {
    const result = summarizeMisses(
      [
        { path_hash: "q1", session_id: "s1", created_at: "2026-10-10" },
        { path_hash: "q1", session_id: "s1", created_at: "2026-10-11" },
        { path_hash: "q1", session_id: "s2", created_at: "2026-10-12" },
        { path_hash: "q2", session_id: "s3", created_at: "2026-10-12" },
        { path_hash: "q3", session_id: "s4", created_at: "2026-10-13" },
        { path_hash: "q3", session_id: "s5", created_at: "2026-10-14" },
        { path_hash: "q3", session_id: "s6", created_at: "2026-10-09" },
      ],
      2
    );
    expect(result).toEqual([
      { query_hash: "q3", sessions: 3, last_seen: "2026-10-14" },
      { query_hash: "q1", sessions: 2, last_seen: "2026-10-12" },
    ]);
  });
});

describe("countNewPhrasings", () => {
  it("counts synonyms per canonical, most first", () => {
    expect(
      countNewPhrasings([
        { canonical_query: "knee mri" },
        { canonical_query: "colonoscopy" },
        { canonical_query: "knee mri" },
      ])
    ).toEqual([
      { canonical_query: "knee mri", phrasings: 2 },
      { canonical_query: "colonoscopy", phrasings: 1 },
    ]);
  });
});
