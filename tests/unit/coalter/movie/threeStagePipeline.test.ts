/**
 * D-2-e1 threeStagePipeline 単体テスト (structural scaffold)。
 *
 * 検証軸 (D-2-e v2 設計レビュー §6):
 *   1. Stage 2 Curate → Stage 3 Resolve 結線 (sub-module 呼び出し検証)
 *   2. Tier 0 success: state="success", theaters non-empty, foundAtArea=userArea
 *   3. Tier 1 success: state="tier1_expanded_success", foundAtArea=隣接 area
 *   4. Tier 2 fail: state="tier2_fail", tierFail (TierFailState) 付与
 *   5. prefetched cache hit: skip areaExpansion (resolverDeps 呼ばれない)
 *   6. prefetched cache hit + empty theaters: cache miss 扱い → areaExpansion 実行
 *   7. prefetched cache 未指定 (undefined): 通常 areaExpansion
 *   8. prefetched cache hit 時の stage3FallbackSourceUsed propagate
 *   9. diagnostics 6 fields 整合 (poolDiagnostics + cacheHit + areaResult)
 *  10. fail-open: LLM throw → fallback pick → 後続 Stage 3 続行
 *  11. immutability (入力 mutate なし)
 *  12. wiring: deriveMovieQuery / buildCandidatePool / curate / expandAreaConcentrically /
 *      buildTierFailNarration が正しい順序 + 引数で呼ばれる
 *
 * D-2-e1 scope:
 *   - 本 file は **mock / pure** で行う (実 fetcher / 実 LLM 接続なし)
 *   - movieOrchestrator への wiring は **D-2-e2 で別 phase**
 *   - flags.ts への COALTER_THREE_STAGE 追加は **D-2-e2 で別 phase**
 */

import { describe, it, expect, vi } from "vitest";
import {
  runThreeStagePipeline,
  type ThreeStagePipelineDeps,
  type ThreeStagePipelineInput,
} from "@/lib/coalter/movie/threeStagePipeline";
import type { MovieCandidate } from "@/lib/coalter/movie/candidatePool";
import { ADJACENCY_TABLE } from "@/lib/coalter/movie/adjacencyTable";
import type {
  CuratorLLMClient,
  PersonalityRootedReasoning,
} from "@/lib/coalter/movie/curator";
import type {
  TheaterFetcher,
  TheaterListing,
  TheaterResolverDeps,
  TheaterResolverResult,
} from "@/lib/coalter/movie/theaterResolver";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders — lens / candidate / LLM response / fetcher
// ═══════════════════════════════════════════════════════════════════════════

function buildPersonalLens(suffix: "a" | "b"): PersonalLens {
  return {
    userId: `user-${suffix}` as UserId,
    displayName: suffix === "a" ? "Aさん" : "Bさん",
    coreDecisionPrinciples: [`${suffix}-原理-1`],
    currentEmotionalHue: `${suffix}-情調`,
    todaySensitivities: [`${suffix}-敏感-1`],
    comfortPathways: [`${suffix}-回復-1`],
    sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
  };
}

function buildLens(): TwoPersonLensToday {
  return {
    personalLenses: { a: buildPersonalLens("a"), b: buildPersonalLens("b") },
    relationalLens: {
      temperature: "warm",
      dominantDynamic: "今日は A 主導",
      careAxes: ["B-配慮"],
      avoidElements: ["重い暴力"],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "recover",
      energyBudget: "low",
      timeBudget: "limited",
      implicitIntent: "静かに整えたい",
      latentNeeds: ["静かさ"],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: "2026-05-11T00:00:00Z",
    lensVersion: "1.0.0",
  };
}

function buildCandidate(
  id: string,
  title: string,
  overrides: Partial<MovieCandidate> = {},
): MovieCandidate {
  return {
    id,
    title,
    genres: ["ヒューマンドラマ"],
    releaseStatus: "now-showing",
    sourceProvider: "ranking",
    screenCountEstimate: 30,
    synopsis: `${title} のあらすじ`,
    runtimeMin: 110,
    ...overrides,
  };
}

function buildReasoning(): PersonalityRootedReasoning {
  return {
    personA_lens: "Aさんの a-原理-1 を踏まえた",
    personB_lens: "Bさんの b-原理-1 を踏まえた",
    relational_fit: "今日は A 主導 の関係性",
    today_hook: "recover モードに沿う",
    veto_guard: "重い暴力 を外した",
  };
}

function buildLLMResponse(title: string): string {
  return JSON.stringify({
    picks: [
      {
        title,
        confidence: 0.9,
        reasoning: buildReasoning(),
        narrative: "今日のおふたりにそっと寄り添う作品です。",
        fairnessNote: null,
      },
    ],
  });
}

function buildLLMClient(response: string): CuratorLLMClient {
  return vi.fn().mockResolvedValue(response);
}

function buildAreaAwareFetcher(
  areaToListings: Record<string, readonly TheaterListing[]>,
): TheaterFetcher {
  return vi.fn(async (input) => areaToListings[input.area] ?? []);
}

function buildEmptyFetcher(): TheaterFetcher {
  return vi.fn().mockResolvedValue([]);
}

function buildResolverDeps(
  areaToListings: Record<string, readonly TheaterListing[]> = {},
): TheaterResolverDeps {
  return {
    officialFetcher: buildAreaAwareFetcher(areaToListings),
    eigaFetcher: buildEmptyFetcher(),
    yahooFetcher: buildEmptyFetcher(),
    exaFetcher: buildEmptyFetcher(),
  };
}

/** Returns a deps builder using a single candidate pool source. */
function buildDeps(opts: {
  pool: readonly MovieCandidate[];
  llmResponse: string;
  areaToListings?: Record<string, readonly TheaterListing[]>;
}): ThreeStagePipelineDeps {
  const rankingSource = vi.fn(async () => opts.pool);
  const emptySource = vi.fn(async () => [] as readonly MovieCandidate[]);
  return {
    candidatePoolDeps: {
      rankingSource,
      exaSource: emptySource,
      personalityHistorySource: emptySource,
    },
    llmClient: buildLLMClient(opts.llmResponse),
    resolverDeps: buildResolverDeps(opts.areaToListings ?? {}),
  };
}

function buildInput(
  overrides: Partial<ThreeStagePipelineInput> = {},
): ThreeStagePipelineInput {
  return {
    lens: buildLens(),
    userArea: "渋谷",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Tier 0 success
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — Tier 0 success", () => {
  it("候補 pool + LLM pick + userArea で theater found → state='success'", async () => {
    const pool = [buildCandidate("c1", "作品-アルファ")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-アルファ"),
      areaToListings: { 渋谷: [{ theaterName: "TOHO 渋谷", area: "渋谷" }] },
    });
    const result = await runThreeStagePipeline(buildInput(), deps);
    expect(result.state).toBe("success");
    if (result.state !== "success") return;
    expect(result.topPick.title).toBe("作品-アルファ");
    expect(result.theaters).toHaveLength(1);
    expect(result.foundAtArea).toBe("渋谷");
    expect(result.diagnostics.stage3State).toBe("success");
    expect(result.diagnostics.stage3AreaTier).toBe(0);
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("official");
    expect(result.diagnostics.stage3PrefetchCacheHit).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Tier 1 expansion success
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — Tier 1 expansion success", () => {
  it("Tier 0 empty + Tier 1 (隣接 area) で theater found → state='tier1_expanded_success'", async () => {
    const adjacent = ADJACENCY_TABLE.渋谷[0]; // "新宿"
    const pool = [buildCandidate("c1", "作品-ベータ")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-ベータ"),
      areaToListings: {
        [adjacent]: [{ theaterName: "TOHO 新宿", area: adjacent }],
      },
    });
    const result = await runThreeStagePipeline(buildInput(), deps);
    expect(result.state).toBe("tier1_expanded_success");
    if (result.state !== "tier1_expanded_success") return;
    expect(result.foundAtArea).toBe(adjacent);
    expect(result.diagnostics.stage3AreaTier).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Tier 2 fail + tierFail narration
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — tier2_fail (narration 付与)", () => {
  it("全 area empty → state='tier2_fail', tierFail.altSignal=true", async () => {
    const pool = [buildCandidate("c1", "作品-ガンマ")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-ガンマ"),
      areaToListings: {}, // 全 empty
    });
    const result = await runThreeStagePipeline(buildInput(), deps);
    expect(result.state).toBe("tier2_fail");
    if (result.state !== "tier2_fail") return;
    expect(result.tierFail.state).toBe("tier2_fail");
    expect(result.tierFail.altSignal).toBe(true);
    expect(result.tierFail.failedTitle).toBe("作品-ガンマ");
    expect(result.tierFail.area).toBe("渋谷");
    expect(result.tierFail.narration.apologyForToday.length).toBeGreaterThan(0);
    expect(result.diagnostics.stage3State).toBe("tier2_fail");
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("none");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. prefetched cache hit (skip areaExpansion)
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — prefetched cache hit", () => {
  it("topPick.title が cache hit + non-empty → resolverDeps が呼ばれない", async () => {
    const pool = [buildCandidate("c1", "作品-キャッシュ")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-キャッシュ"),
      areaToListings: {}, // resolver は実際には呼ばれない想定
    });
    const cachedResult: TheaterResolverResult = {
      theaters: [{ theaterName: "Prefetch シネマ", area: "渋谷" }],
      diagnostics: {
        stage3FallbackSourceUsed: "eiga",
        attemptedSources: ["official", "eiga"],
        theaterResolverLatencyMs: 100,
      },
    };
    const prefetchedTheaters = new Map<string, TheaterResolverResult>([
      ["作品-キャッシュ", cachedResult],
    ]);
    const result = await runThreeStagePipeline(
      buildInput({ prefetchedTheaters }),
      deps,
    );
    expect(result.state).toBe("success");
    if (result.state !== "success") return;
    expect(result.diagnostics.stage3PrefetchCacheHit).toBe(true);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("Prefetch シネマ");
    // resolverDeps の全 fetcher が呼ばれていない (cost 削減)
    expect(deps.resolverDeps.officialFetcher).not.toHaveBeenCalled();
    expect(deps.resolverDeps.eigaFetcher).not.toHaveBeenCalled();
    expect(deps.resolverDeps.yahooFetcher).not.toHaveBeenCalled();
    expect(deps.resolverDeps.exaFetcher).not.toHaveBeenCalled();
  });

  it("cache hit 時 stage3FallbackSourceUsed は cache entry から propagate", async () => {
    const pool = [buildCandidate("c1", "作品-キャッシュ")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-キャッシュ"),
    });
    const cachedResult: TheaterResolverResult = {
      theaters: [{ theaterName: "シネマ", area: "渋谷" }],
      diagnostics: {
        stage3FallbackSourceUsed: "yahoo",
        attemptedSources: ["official", "eiga", "yahoo"],
        theaterResolverLatencyMs: 200,
      },
    };
    const prefetchedTheaters = new Map<string, TheaterResolverResult>([
      ["作品-キャッシュ", cachedResult],
    ]);
    const result = await runThreeStagePipeline(
      buildInput({ prefetchedTheaters }),
      deps,
    );
    expect(result.diagnostics.stage3FallbackSourceUsed).toBe("yahoo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. prefetched cache が empty theaters の場合 → cache miss 扱い
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — prefetched cache empty entry", () => {
  it("cache hit したが theaters=[] → cache miss 扱い、通常の areaExpansion 実行", async () => {
    const pool = [buildCandidate("c1", "作品-空キャッシュ")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-空キャッシュ"),
      areaToListings: { 渋谷: [{ theaterName: "実 fetch シネマ", area: "渋谷" }] },
    });
    const emptyCachedResult: TheaterResolverResult = {
      theaters: [], // empty
      diagnostics: {
        stage3FallbackSourceUsed: "none",
        attemptedSources: ["official", "eiga", "yahoo", "exa"],
        theaterResolverLatencyMs: 500,
      },
    };
    const prefetchedTheaters = new Map<string, TheaterResolverResult>([
      ["作品-空キャッシュ", emptyCachedResult],
    ]);
    const result = await runThreeStagePipeline(
      buildInput({ prefetchedTheaters }),
      deps,
    );
    expect(result.state).toBe("success");
    if (result.state !== "success") return;
    expect(result.diagnostics.stage3PrefetchCacheHit).toBe(false);
    expect(result.theaters[0].theaterName).toBe("実 fetch シネマ");
    expect(deps.resolverDeps.officialFetcher).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. prefetchedTheaters 未指定 (undefined) → 通常 areaExpansion
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — prefetchedTheaters undefined", () => {
  it("prefetchedTheaters 未指定 → 通常 areaExpansion 実行", async () => {
    const pool = [buildCandidate("c1", "作品-プリフェッチなし")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-プリフェッチなし"),
      areaToListings: { 渋谷: [{ theaterName: "シネマ", area: "渋谷" }] },
    });
    // prefetchedTheaters を渡さない (undefined)
    const result = await runThreeStagePipeline(buildInput(), deps);
    expect(result.state).toBe("success");
    if (result.state !== "success") return;
    expect(result.diagnostics.stage3PrefetchCacheHit).toBe(false);
    expect(deps.resolverDeps.officialFetcher).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. diagnostics 6 fields 整合
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — diagnostics 6 fields", () => {
  it("diagnostics は 6 fields 固定", async () => {
    const pool = [buildCandidate("c1", "作品-診断")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-診断"),
      areaToListings: { 渋谷: [{ theaterName: "シネマ", area: "渋谷" }] },
    });
    const result = await runThreeStagePipeline(buildInput(), deps);
    expect(Object.keys(result.diagnostics).sort()).toEqual([
      "stage2CandidateFilteredCount",
      "stage2CandidateRawCount",
      "stage3AreaTier",
      "stage3FallbackSourceUsed",
      "stage3PrefetchCacheHit",
      "stage3State",
    ]);
  });

  it("stage2CandidateRawCount + FilteredCount は candidatePool 出力と整合", async () => {
    // 3 候補 + Soft filter 通過想定 (now-showing + screenCountEstimate>=20)
    const pool = [
      buildCandidate("c1", "作品-1"),
      buildCandidate("c2", "作品-2"),
      buildCandidate("c3", "作品-3"),
    ];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-1"),
      areaToListings: { 渋谷: [{ theaterName: "シネマ", area: "渋谷" }] },
    });
    const result = await runThreeStagePipeline(buildInput(), deps);
    expect(result.diagnostics.stage2CandidateRawCount).toBe(3);
    expect(result.diagnostics.stage2CandidateFilteredCount).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. fail-open: LLM throw → fallback pick → 後続 Stage 3
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — fail-open (LLM throw)", () => {
  it("LLM throw → curator fallback pick → Stage 3 続行", async () => {
    const pool = [buildCandidate("c1", "作品-フォールバック")];
    const llmClient: CuratorLLMClient = vi
      .fn()
      .mockRejectedValue(new Error("LLM network down"));
    const deps: ThreeStagePipelineDeps = {
      candidatePoolDeps: {
        rankingSource: vi.fn(async () => pool),
        exaSource: vi.fn(async () => []),
        personalityHistorySource: vi.fn(async () => []),
      },
      llmClient,
      resolverDeps: buildResolverDeps({
        渋谷: [{ theaterName: "Fallback シネマ", area: "渋谷" }],
      }),
    };
    const result = await runThreeStagePipeline(buildInput(), deps);
    // LLM 失敗時の curator fallback は pool 先頭を topPick に置く
    expect(result.topPick.title).toBe("作品-フォールバック");
    // Stage 3 は続行 (失敗独立)
    expect(result.state).toBe("success");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — immutability", () => {
  it("入力 input.lens を mutate しない", async () => {
    const pool = [buildCandidate("c1", "作品-不変")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-不変"),
      areaToListings: { 渋谷: [{ theaterName: "シネマ", area: "渋谷" }] },
    });
    const input = buildInput();
    const snapshot = JSON.parse(JSON.stringify(input.lens));
    await runThreeStagePipeline(input, deps);
    expect(input.lens).toEqual(snapshot);
  });

  it("入力 prefetchedTheaters Map を mutate しない (set / delete 呼び出しなし)", async () => {
    const pool = [buildCandidate("c1", "作品-不変2")];
    const deps = buildDeps({
      pool,
      llmResponse: buildLLMResponse("作品-不変2"),
      areaToListings: { 渋谷: [{ theaterName: "シネマ", area: "渋谷" }] },
    });
    const cached: TheaterResolverResult = {
      theaters: [{ theaterName: "プリフェッチ", area: "渋谷" }],
      diagnostics: {
        stage3FallbackSourceUsed: "official",
        attemptedSources: ["official"],
        theaterResolverLatencyMs: 50,
      },
    };
    const prefetchedTheaters = new Map<string, TheaterResolverResult>([
      ["作品-不変2", cached],
    ]);
    const sizeBeforeRun = prefetchedTheaters.size;
    await runThreeStagePipeline(buildInput({ prefetchedTheaters }), deps);
    expect(prefetchedTheaters.size).toBe(sizeBeforeRun);
    expect(prefetchedTheaters.get("作品-不変2")).toBe(cached);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. wiring verify (sub-module 呼び出し順序 + 引数)
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStagePipeline — sub-module wiring", () => {
  it("candidatePoolDeps の 3 source が並列 fetch される (B1 ガード継承)", async () => {
    const pool = [buildCandidate("c1", "作品-結線")];
    const rankingSource = vi.fn(async () => pool);
    const exaSource = vi.fn(async () => [] as readonly MovieCandidate[]);
    const personalityHistorySource = vi.fn(
      async () => [] as readonly MovieCandidate[],
    );
    const deps: ThreeStagePipelineDeps = {
      candidatePoolDeps: {
        rankingSource,
        exaSource,
        personalityHistorySource,
      },
      llmClient: buildLLMClient(buildLLMResponse("作品-結線")),
      resolverDeps: buildResolverDeps({
        渋谷: [{ theaterName: "x", area: "渋谷" }],
      }),
    };
    await runThreeStagePipeline(buildInput(), deps);
    expect(rankingSource).toHaveBeenCalledTimes(1);
    expect(exaSource).toHaveBeenCalledTimes(1);
    expect(personalityHistorySource).toHaveBeenCalledTimes(1);
  });

  it("llmClient は systemPrompt + userPrompt 形式で呼ばれる (curator wiring)", async () => {
    const pool = [buildCandidate("c1", "作品-LLM結線")];
    const llmClient = vi
      .fn<CuratorLLMClient>()
      .mockResolvedValue(buildLLMResponse("作品-LLM結線"));
    const deps: ThreeStagePipelineDeps = {
      candidatePoolDeps: {
        rankingSource: vi.fn(async () => pool),
        exaSource: vi.fn(async () => []),
        personalityHistorySource: vi.fn(async () => []),
      },
      llmClient,
      resolverDeps: buildResolverDeps({
        渋谷: [{ theaterName: "x", area: "渋谷" }],
      }),
    };
    await runThreeStagePipeline(buildInput(), deps);
    expect(llmClient).toHaveBeenCalledTimes(1);
    const call = llmClient.mock.calls[0][0];
    expect(call).toHaveProperty("systemPrompt");
    expect(call).toHaveProperty("userPrompt");
    expect(call.systemPrompt.length).toBeGreaterThan(0);
    expect(call.userPrompt.length).toBeGreaterThan(0);
  });

  it("resolverDeps の officialFetcher が title + tier0Area で呼ばれる (areaExpansion wiring)", async () => {
    const pool = [buildCandidate("c1", "作品-劇場結線")];
    const officialFetcher = vi
      .fn()
      .mockResolvedValue([{ theaterName: "x", area: "渋谷" }]);
    const deps: ThreeStagePipelineDeps = {
      candidatePoolDeps: {
        rankingSource: vi.fn(async () => pool),
        exaSource: vi.fn(async () => []),
        personalityHistorySource: vi.fn(async () => []),
      },
      llmClient: buildLLMClient(buildLLMResponse("作品-劇場結線")),
      resolverDeps: {
        officialFetcher,
        eigaFetcher: buildEmptyFetcher(),
        yahooFetcher: buildEmptyFetcher(),
        exaFetcher: buildEmptyFetcher(),
      },
    };
    await runThreeStagePipeline(buildInput({ userArea: "渋谷" }), deps);
    expect(officialFetcher).toHaveBeenCalled();
    const firstCall = officialFetcher.mock.calls[0][0];
    expect(firstCall.title).toBe("作品-劇場結線");
    expect(firstCall.area).toBe("渋谷");
  });
});
