/**
 * D-2-a theaterResolver fallback source diagnostics 単体テスト。
 *
 * 検証軸 (mainstream plan §3.3 元 D-3-a / D-2 設計レビュー §2.4 / CEO 補正 2):
 *   - `stage3FallbackSourceUsed`: 採用 source が正確に記録される (各 source 成功時)
 *   - `attemptedSources`: 試行順序が SOURCE_ORDER に従う (early-stop 時は途中まで)
 *   - `theaterResolverLatencyMs`: number、>= 0、実行時間に応じて記録される
 *
 * CEO 補正 2 (本セッション 2026-05-11):
 *   - diagnostics は **event 単位** (単発 request の事実) のみ
 *   - 集計 field (`tier2FailRate` 等) は Step E で SQL / analytics 側で算出、
 *     本 file には含めない
 *
 * 本 test の範囲 (基本 test との分離):
 *   - 基本 test (`theaterResolver.test.ts`): fallback 順序 / fail-open / first
 *     non-empty 採用 / immutability 等の挙動 verify
 *   - 本 file: diagnostics field の正確性に集中 (event diagnostics の契約担保)
 */

import { describe, it, expect, vi } from "vitest";
import {
  resolveTheater,
  SOURCE_ORDER,
  type Stage3FallbackSource,
  type TheaterFetcher,
  type TheaterListing,
  type TheaterResolverDeps,
} from "@/lib/coalter/movie/theaterResolver";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildListing(name: string = "劇場-x"): TheaterListing {
  return { theaterName: name, area: "渋谷" };
}

function buildFetcher(items: readonly TheaterListing[]): TheaterFetcher {
  return vi.fn().mockResolvedValue(items);
}

function buildThrowFetcher(): TheaterFetcher {
  return vi.fn().mockRejectedValue(new Error("fetch error"));
}

function buildDeps(opts: {
  official?: readonly TheaterListing[] | "throw";
  eiga?: readonly TheaterListing[] | "throw";
  yahoo?: readonly TheaterListing[] | "throw";
  exa?: readonly TheaterListing[] | "throw";
} = {}): TheaterResolverDeps {
  function f(
    spec: readonly TheaterListing[] | "throw" | undefined,
  ): TheaterFetcher {
    if (spec === "throw") return buildThrowFetcher();
    return buildFetcher(spec ?? []);
  }
  return {
    officialFetcher: f(opts.official),
    eigaFetcher: f(opts.eiga),
    yahooFetcher: f(opts.yahoo),
    exaFetcher: f(opts.exa),
  };
}

const INPUT = { title: "テスト作品", area: "渋谷" };

// ═══════════════════════════════════════════════════════════════════════════
// 1. stage3FallbackSourceUsed: 採用 source の正確性
// ═══════════════════════════════════════════════════════════════════════════

describe("diagnostics.stage3FallbackSourceUsed — 採用 source 正確性 (event 単位)", () => {
  it("official success → 'official'", async () => {
    const deps = buildDeps({ official: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("official");
  });

  it("eiga success (official empty) → 'eiga'", async () => {
    const deps = buildDeps({ official: [], eiga: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("eiga");
  });

  it("yahoo success (official + eiga empty) → 'yahoo'", async () => {
    const deps = buildDeps({
      official: [],
      eiga: [],
      yahoo: [buildListing()],
    });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("yahoo");
  });

  it("exa success (前 3 source empty) → 'exa'", async () => {
    const deps = buildDeps({
      official: [],
      eiga: [],
      yahoo: [],
      exa: [buildListing()],
    });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("exa");
  });

  it("全 source empty → 'none' (構造 sentinel)", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("none");
  });

  it("全 source throw → 'none' (fail-open + sentinel)", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: "throw",
      yahoo: "throw",
      exa: "throw",
    });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("none");
  });

  it("throw を吸収して次 source 採用 (例: official throw → eiga 採用)", async () => {
    const deps = buildDeps({
      official: "throw",
      eiga: [buildListing()],
    });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("eiga");
  });

  it("採用 source は Stage3FallbackSource enum 範囲内のみ", async () => {
    const valid: ReadonlyArray<Stage3FallbackSource | "none"> = [
      "official",
      "eiga",
      "yahoo",
      "exa",
      "none",
    ];
    const cases: TheaterResolverDeps[] = [
      buildDeps({ official: [buildListing()] }),
      buildDeps({ official: [], eiga: [buildListing()] }),
      buildDeps({ official: [], eiga: [], yahoo: [buildListing()] }),
      buildDeps({ official: [], eiga: [], yahoo: [], exa: [buildListing()] }),
      buildDeps({ official: [], eiga: [], yahoo: [], exa: [] }),
    ];
    for (const deps of cases) {
      const result = await resolveTheater(INPUT, deps);
      expect(valid).toContain(result.diagnostics.stage3FallbackSourceUsed);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. attemptedSources: 試行順序の正確性
// ═══════════════════════════════════════════════════════════════════════════

describe("diagnostics.attemptedSources — 試行順序 (SOURCE_ORDER 準拠 + early-stop)", () => {
  it("official success → ['official'] 1 要素のみ (early-stop)", async () => {
    const deps = buildDeps({ official: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.attemptedSources).toEqual(["official"]);
  });

  it("eiga success → ['official', 'eiga'] (途中まで)", async () => {
    const deps = buildDeps({ official: [], eiga: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.attemptedSources).toEqual([
      "official",
      "eiga",
    ]);
  });

  it("yahoo success → ['official', 'eiga', 'yahoo']", async () => {
    const deps = buildDeps({
      official: [],
      eiga: [],
      yahoo: [buildListing()],
    });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.attemptedSources).toEqual([
      "official",
      "eiga",
      "yahoo",
    ]);
  });

  it("exa success → 全 4 source 試行", async () => {
    const deps = buildDeps({
      official: [],
      eiga: [],
      yahoo: [],
      exa: [buildListing()],
    });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.attemptedSources).toEqual([
      "official",
      "eiga",
      "yahoo",
      "exa",
    ]);
  });

  it("全 source empty → 全 4 source 試行 ('none' でも試行は記録)", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.attemptedSources).toEqual([
      "official",
      "eiga",
      "yahoo",
      "exa",
    ]);
  });

  it("attemptedSources は SOURCE_ORDER の prefix (順序固定、B2 構造 gate)", async () => {
    // 各 success ケースで attemptedSources が SOURCE_ORDER の先頭から連続部分列
    const cases: Array<{
      deps: TheaterResolverDeps;
      expectedLength: number;
    }> = [
      { deps: buildDeps({ official: [buildListing()] }), expectedLength: 1 },
      {
        deps: buildDeps({ official: [], eiga: [buildListing()] }),
        expectedLength: 2,
      },
      {
        deps: buildDeps({
          official: [],
          eiga: [],
          yahoo: [buildListing()],
        }),
        expectedLength: 3,
      },
      {
        deps: buildDeps({
          official: [],
          eiga: [],
          yahoo: [],
          exa: [buildListing()],
        }),
        expectedLength: 4,
      },
    ];
    for (const { deps, expectedLength } of cases) {
      const result = await resolveTheater(INPUT, deps);
      const attempted = result.diagnostics.attemptedSources;
      expect(attempted).toHaveLength(expectedLength);
      // SOURCE_ORDER の prefix と一致
      expect(attempted).toEqual(SOURCE_ORDER.slice(0, expectedLength));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. theaterResolverLatencyMs: 実行時間記録
// ═══════════════════════════════════════════════════════════════════════════

describe("diagnostics.theaterResolverLatencyMs — 実行時間記録 (event 単位)", () => {
  it("number 型で返る", async () => {
    const deps = buildDeps({ official: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    expect(typeof result.diagnostics.theaterResolverLatencyMs).toBe("number");
  });

  it(">= 0 (Date.now() は単調非減少なので負値にならない)", async () => {
    const deps = buildDeps({ official: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    expect(result.diagnostics.theaterResolverLatencyMs).toBeGreaterThanOrEqual(
      0,
    );
  });

  it("全 source empty (4 source 試行) でも latency は記録される", async () => {
    const deps = buildDeps({ official: [], eiga: [], yahoo: [], exa: [] });
    const result = await resolveTheater(INPUT, deps);
    expect(typeof result.diagnostics.theaterResolverLatencyMs).toBe("number");
    expect(result.diagnostics.theaterResolverLatencyMs).toBeGreaterThanOrEqual(
      0,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CEO 補正 2 整合: 集計 field 不在 verify (event 単位の契約)
// ═══════════════════════════════════════════════════════════════════════════

describe("diagnostics — CEO 補正 2 (event 単位、集計 field 不在)", () => {
  it("tier2FailRate / successRate / failureCount 等の集計 field を含まない", async () => {
    const deps = buildDeps({ official: [buildListing()] });
    const result = await resolveTheater(INPUT, deps);
    // 集計 field は Step E で SQL / analytics 側で算出、本 file には含めない
    expect(result.diagnostics).not.toHaveProperty("tier2FailRate");
    expect(result.diagnostics).not.toHaveProperty("successRate");
    expect(result.diagnostics).not.toHaveProperty("failureCount");
    expect(result.diagnostics).not.toHaveProperty("attemptCount");
  });

  it("diagnostics の field 数は 3 (event 単位の最小契約)", async () => {
    const result = await resolveTheater(INPUT, buildDeps());
    expect(Object.keys(result.diagnostics)).toHaveLength(3);
  });
});
