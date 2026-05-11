/**
 * D-1-b Candidate Pool + Soft Availability Filter 単体テスト (基本)。
 *
 * 検証軸 (mainstream plan §3.2 元 D-2-b):
 *   1. 3 source 並列 fetch + dedup
 *   2. Soft filter score 0.4 未満は除外
 *   3. Soft filter score 0.4 以上は通過
 *   4. Source 失敗時は fail-open (空配列で継続、pool 全体は枯れない)
 *   5. diagnostics 正確性 (rawCounts / rawTotal / softFilterPassed/Rejected)
 *   6. immutability (input pool / query を mutate しない、出力の readonly 性)
 *   7. Soft filter 個別シグナル (nowShowing / wideRelease / areaHint)
 *   8. shape verify (CandidatePoolResult 3 fields)
 *
 * B1 構造 gate (theater 不参照、missing_where reject なし) は別 file
 * `candidatePoolNoMissingWhereDrop.test.ts` で symbol-level + runtime 両面検証。
 */

import { describe, it, expect, vi } from "vitest";
import {
  applySoftAvailabilityFilter,
  buildCandidatePool,
  SOFT_AVAILABILITY_THRESHOLD,
  softAvailabilityScore,
  type CandidatePoolDeps,
  type CandidatePoolResult,
  type CandidateSource,
  type MovieCandidate,
} from "@/lib/coalter/movie/candidatePool";
import type { MovieQuery } from "@/lib/coalter/movie/queryDerivation";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildQuery(overrides: Partial<MovieQuery> = {}): MovieQuery {
  return {
    genres: ["ヒューマンドラマ"],
    mood: "comforting",
    weight: "light",
    length_minutes_max: 120,
    era: "now-showing",
    couple_fit_hints: ["落ち着いて見られる"],
    exclude: [],
    ...overrides,
  };
}

function buildCandidate(
  overrides: Partial<MovieCandidate> = {},
): MovieCandidate {
  return {
    id: overrides.id ?? "candidate-default",
    title: "サンプル作品",
    genres: ["ヒューマンドラマ"],
    releaseStatus: "now-showing",
    sourceProvider: "ranking",
    screenCountEstimate: 30,
    ...overrides,
  };
}

function buildSource(items: readonly MovieCandidate[]): CandidateSource {
  return vi.fn().mockResolvedValue(items);
}

function buildDeps(opts: {
  ranking?: readonly MovieCandidate[];
  exa?: readonly MovieCandidate[];
  personality?: readonly MovieCandidate[];
} = {}): CandidatePoolDeps {
  return {
    rankingSource: buildSource(opts.ranking ?? []),
    exaSource: buildSource(opts.exa ?? []),
    personalityHistorySource: buildSource(opts.personality ?? []),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 3 source 並列 fetch + dedup
// ═══════════════════════════════════════════════════════════════════════════

describe("buildCandidatePool — 3 source 並列 fetch + dedup", () => {
  it("3 source の出力が rawPool に統合される", async () => {
    const deps = buildDeps({
      ranking: [buildCandidate({ id: "r-1", title: "ranking-1" })],
      exa: [buildCandidate({ id: "e-1", title: "exa-1", sourceProvider: "exa" })],
      personality: [
        buildCandidate({
          id: "p-1",
          title: "personality-1",
          sourceProvider: "personality_history",
        }),
      ],
    });
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.rawPool.map((c) => c.id).sort()).toEqual(
      ["e-1", "p-1", "r-1"],
    );
  });

  it("id 重複は最初に来た source を優先 (ranking → exa → personality 順)", async () => {
    const deps = buildDeps({
      ranking: [buildCandidate({ id: "dup", title: "from-ranking" })],
      exa: [
        buildCandidate({
          id: "dup",
          title: "from-exa",
          sourceProvider: "exa",
        }),
      ],
      personality: [
        buildCandidate({
          id: "dup",
          title: "from-personality",
          sourceProvider: "personality_history",
        }),
      ],
    });
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.rawPool).toHaveLength(1);
    expect(result.rawPool[0].title).toBe("from-ranking");
  });

  it("3 source 並列で呼ばれる (各 source 関数が 1 回ずつ実行)", async () => {
    const ranking = vi.fn().mockResolvedValue([]);
    const exa = vi.fn().mockResolvedValue([]);
    const personality = vi.fn().mockResolvedValue([]);
    await buildCandidatePool(
      { query: buildQuery() },
      {
        rankingSource: ranking,
        exaSource: exa,
        personalityHistorySource: personality,
      },
    );
    expect(ranking).toHaveBeenCalledTimes(1);
    expect(exa).toHaveBeenCalledTimes(1);
    expect(personality).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2-3. Soft filter (score >= 0.4 通過、< 0.4 除外)
// ═══════════════════════════════════════════════════════════════════════════

describe("applySoftAvailabilityFilter — score 閾値", () => {
  it("SOFT_AVAILABILITY_THRESHOLD は 0.4 (三段式 §2.3.2)", () => {
    expect(SOFT_AVAILABILITY_THRESHOLD).toBe(0.4);
  });

  it("now-showing + screenCount 20+ + userArea あり → 1.0、通過", () => {
    const c = buildCandidate({
      releaseStatus: "now-showing",
      screenCountEstimate: 50,
    });
    expect(softAvailabilityScore(c, "渋谷")).toBeCloseTo(1.0, 5);
    expect(applySoftAvailabilityFilter([c], "渋谷")).toHaveLength(1);
  });

  it("upcoming + screenCount 5 + userArea null → 0.1、除外", () => {
    const c = buildCandidate({
      releaseStatus: "upcoming",
      screenCountEstimate: 5,
    });
    expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    expect(applySoftAvailabilityFilter([c], null)).toHaveLength(0);
  });

  it("now-showing + screenCount unknown + userArea null → 0.5 (= 0.4+0.1)、通過", () => {
    const c: MovieCandidate = {
      id: "x",
      title: "no-screen",
      genres: [],
      releaseStatus: "now-showing",
      sourceProvider: "ranking",
      // screenCountEstimate undefined → 0.1
    };
    expect(softAvailabilityScore(c, null)).toBeCloseTo(0.5, 5);
    expect(applySoftAvailabilityFilter([c], null)).toHaveLength(1);
  });

  it("limited + screenCount 19 + userArea null → 0.1 (< threshold)、除外", () => {
    const c = buildCandidate({
      releaseStatus: "limited",
      screenCountEstimate: 19,
    });
    expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    expect(applySoftAvailabilityFilter([c], null)).toHaveLength(0);
  });

  it("境界値: now-showing + screenCount 20 + userArea null → 0.7、通過", () => {
    const c = buildCandidate({
      releaseStatus: "now-showing",
      screenCountEstimate: 20,
    });
    expect(softAvailabilityScore(c, null)).toBeCloseTo(0.7, 5);
  });

  it("Soft filter は通過した candidate を順序保持して返す", () => {
    // userArea null 条件で areaHint=0 を強制し、b の score が確実に 0.1 (< 0.4) になる
    // ようにする。a / c は now-showing + screenCount=30 で score=0.5、通過。
    const a = buildCandidate({ id: "a" });
    const b = buildCandidate({
      id: "b",
      releaseStatus: "upcoming",
      screenCountEstimate: 5,
    }); // upcoming(0) + wideRelease(0.1) + areaHint(0) = 0.1、除外
    const c = buildCandidate({ id: "c" });
    const filtered = applySoftAvailabilityFilter([a, b, c], null);
    expect(filtered.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Source 失敗時 fail-open
// ═══════════════════════════════════════════════════════════════════════════

describe("buildCandidatePool — fail-open (source 失敗で pool 全枯れ防止)", () => {
  it("ranking source が throw → 残り 2 source の結果のみで pool 構築", async () => {
    const deps: CandidatePoolDeps = {
      rankingSource: vi.fn().mockRejectedValue(new Error("ranking fetch failed")),
      exaSource: buildSource([buildCandidate({ id: "e" })]),
      personalityHistorySource: buildSource([
        buildCandidate({ id: "p", sourceProvider: "personality_history" }),
      ]),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.rawPool.map((c) => c.id).sort()).toEqual(["e", "p"]);
    expect(result.diagnostics.rawCounts.ranking).toBe(0);
    expect(result.diagnostics.rawCounts.exa).toBe(1);
  });

  it("3 source 全部 throw → empty pool (例外を caller に伝播しない)", async () => {
    const err = new Error("network down");
    const deps: CandidatePoolDeps = {
      rankingSource: vi.fn().mockRejectedValue(err),
      exaSource: vi.fn().mockRejectedValue(err),
      personalityHistorySource: vi.fn().mockRejectedValue(err),
    };
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.rawPool).toEqual([]);
    expect(result.filteredPool).toEqual([]);
    expect(result.diagnostics.rawTotal).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. diagnostics 正確性
// ═══════════════════════════════════════════════════════════════════════════

describe("buildCandidatePool — diagnostics", () => {
  it("rawCounts は source 別 raw 件数を反映 (dedup 前)", async () => {
    const deps = buildDeps({
      ranking: [
        buildCandidate({ id: "r1" }),
        buildCandidate({ id: "r2" }),
      ],
      exa: [buildCandidate({ id: "e1", sourceProvider: "exa" })],
      personality: [],
    });
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.diagnostics.rawCounts).toEqual({
      ranking: 2,
      exa: 1,
      personality_history: 0,
    });
  });

  it("rawTotal = dedup 後の合計", async () => {
    const deps = buildDeps({
      ranking: [buildCandidate({ id: "x" })],
      exa: [buildCandidate({ id: "x", sourceProvider: "exa" })], // 重複
      personality: [],
    });
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.diagnostics.rawTotal).toBe(1);
  });

  it("softFilterPassed + softFilterRejected = rawTotal", async () => {
    const deps = buildDeps({
      ranking: [
        buildCandidate({ id: "pass" }), // pass
        buildCandidate({
          id: "rej",
          releaseStatus: "upcoming",
          screenCountEstimate: 1,
        }), // reject
      ],
    });
    const result = await buildCandidatePool({ query: buildQuery() }, deps);
    expect(result.diagnostics.softFilterPassed).toBe(1);
    expect(result.diagnostics.softFilterRejected).toBe(1);
    expect(
      result.diagnostics.softFilterPassed +
        result.diagnostics.softFilterRejected,
    ).toBe(result.diagnostics.rawTotal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("buildCandidatePool — immutability", () => {
  it("入力 source の配列を mutate しない", async () => {
    const original = [
      buildCandidate({ id: "a" }),
      buildCandidate({ id: "b" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(original));
    const deps = buildDeps({ ranking: original });
    await buildCandidatePool({ query: buildQuery() }, deps);
    expect(original).toEqual(snapshot);
  });

  it("入力 query を mutate しない", async () => {
    const query = buildQuery({ exclude: ["A", "B"] });
    const snapshot = JSON.parse(JSON.stringify(query));
    await buildCandidatePool(
      { query },
      buildDeps({ ranking: [buildCandidate()] }),
    );
    expect(query).toEqual(snapshot);
  });

  it("applySoftAvailabilityFilter は入力 pool を mutate しない", () => {
    const pool = [buildCandidate({ id: "a" }), buildCandidate({ id: "b" })];
    const snapshot = JSON.parse(JSON.stringify(pool));
    applySoftAvailabilityFilter(pool, "渋谷");
    expect(pool).toEqual(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Soft filter 個別シグナル
// ═══════════════════════════════════════════════════════════════════════════

describe("softAvailabilityScore — 3 シグナル個別", () => {
  describe("nowShowing シグナル (0.4 / 0)", () => {
    it("now-showing → 0.4 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "now-showing",
        screenCountEstimate: 0, // wideRelease 0.1
      });
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.5, 5);
    });
    it("limited → 0 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "limited",
        screenCountEstimate: 0,
      });
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    });
    it("upcoming → 0 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "upcoming",
        screenCountEstimate: 0,
      });
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    });
  });

  describe("wideRelease シグナル (0.3 / 0.1)", () => {
    it("screenCount 20+ → 0.3 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "limited",
        screenCountEstimate: 100,
      });
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.3, 5);
    });
    it("screenCount < 20 → 0.1 寄与 (排除しない)", () => {
      const c = buildCandidate({
        releaseStatus: "limited",
        screenCountEstimate: 5,
      });
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    });
    it("screenCount unknown (undefined) → 0.1 寄与 (排除しない)", () => {
      const c: MovieCandidate = {
        id: "x",
        title: "x",
        genres: [],
        releaseStatus: "limited",
        sourceProvider: "ranking",
      };
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    });
  });

  describe("areaHint シグナル (0.3 / 0)", () => {
    it("userArea string → 0.3 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "limited",
        screenCountEstimate: 0,
      });
      expect(softAvailabilityScore(c, "渋谷")).toBeCloseTo(0.4, 5);
    });
    it("userArea null → 0 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "limited",
        screenCountEstimate: 0,
      });
      expect(softAvailabilityScore(c, null)).toBeCloseTo(0.1, 5);
    });
    it("userArea 空文字 → 0 寄与", () => {
      const c = buildCandidate({
        releaseStatus: "limited",
        screenCountEstimate: 0,
      });
      expect(softAvailabilityScore(c, "")).toBeCloseTo(0.1, 5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. shape verify
// ═══════════════════════════════════════════════════════════════════════════

describe("buildCandidatePool — CandidatePoolResult shape", () => {
  it("返り値は rawPool / filteredPool / diagnostics 3 fields のみ", async () => {
    const result: CandidatePoolResult = await buildCandidatePool(
      { query: buildQuery() },
      buildDeps(),
    );
    expect(Object.keys(result).sort()).toEqual([
      "diagnostics",
      "filteredPool",
      "rawPool",
    ]);
  });

  it("diagnostics は 4 fields (rawCounts / rawTotal / softFilterPassed / softFilterRejected)", async () => {
    const result = await buildCandidatePool(
      { query: buildQuery() },
      buildDeps(),
    );
    expect(Object.keys(result.diagnostics).sort()).toEqual([
      "rawCounts",
      "rawTotal",
      "softFilterPassed",
      "softFilterRejected",
    ]);
  });

  it("rawCounts は 3 source key を必ず持つ", async () => {
    const result = await buildCandidatePool(
      { query: buildQuery() },
      buildDeps(),
    );
    expect(Object.keys(result.diagnostics.rawCounts).sort()).toEqual([
      "exa",
      "personality_history",
      "ranking",
    ]);
  });
});
