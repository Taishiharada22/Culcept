/**
 * CoAlter 三段式本線 (movie) — runThreeStagePipeline (Stage 2 Curate + Stage 3 Resolve)
 *
 * 三段式 §3 / mainstream plan §3 / handover §6 D-2-e / D-2-e v2 設計レビュー §6.
 *
 * D-1 (Stage 2 Curate) + D-2 (Stage 3 Resolve) を **pure async function** で
 * 結線した本線パイプライン。caller (D-2-e2 で movieOrchestrator) が DI で
 * 全 fetcher / LLM client を注入し、本 file は pure logic + sub-module 呼び出し
 * のみを担う。
 *
 * パイプライン flow:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Stage 1 Understand (= input.lens、別 phase で生成、本 file の外)│
 *   └──────────────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Stage 2 Curate                                                  │
 *   │   D-1-a: deriveMovieQuery(lens) → MovieQuery                     │
 *   │   D-1-b: buildCandidatePool(query, userArea, deps)               │
 *   │   D-1-c: curate(lens, query, filteredPool, deps.llmClient)       │
 *   │     → topPick + alternates                                       │
 *   └──────────────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Stage 3 Resolve (cache hit 判定 → areaExpansion → tierFail)     │
 *   │   prefetched cache に topPick.title hit → skip expansion          │
 *   │   else: D-2-b expandAreaConcentrically                           │
 *   │   tier2_fail → D-2-c buildTierFailNarration                      │
 *   └──────────────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ThreeStagePipelineResult (success / tier1_expanded_success /    │
 *   │  tier2_fail) + ThreeStageDiagnostics (6 fields)                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 設計原則 (CEO 採用 D-2-e v2 §6):
 *   - **DI**: 全 fetcher / LLM client は `ThreeStagePipelineDeps` で外部注入。
 *     本 file は実 fetch / 実 LLM を持たない (D-2-e3 で別 phase 接続)
 *   - **prefetched cache**: `ReadonlyMap<string, TheaterResolverResult>` 型で
 *     D-2-d `prefetchStage3` 出力を直接受け取る (型整合)
 *   - **cache hit conditions**: (a) topPick.title in cache、(b) cache entry の
 *     theaters non-empty。両方満たした場合のみ skip。
 *   - **fail-open**: tier2_fail は正常な分岐 (例外ではない)、narration 付きで返す
 *   - **pure**: side-effect ゼロ、決定論 (sub-module の決定論性に依存)
 *
 * D-2-e1 scope (structural scaffold complete、CEO 採用 D-2-e v2 §3):
 *   - 本 file は型 + pure function のみ
 *   - `movieOrchestrator.ts` への wiring **なし** (D-2-e2 で別 phase)
 *   - `flags.ts` への `COALTER_THREE_STAGE` 追加 **なし** (D-2-e2 で別 phase)
 *   - 実 fetcher / 実 LLM 接続 **なし** (D-2-e3 で別 phase)
 *   - console.info **不使用** (D-2-e 凍結禁止事項)
 *
 * 凍結線整合 (handover §4.2):
 *   - import は D-1-a/b/c + D-2-a/b/c/d の sub-module + understanding 型のみ
 *   - 既存 movieOrchestrator / webConnector / movieCatalog / movieRanker touch なし
 *   - flags.ts touch なし
 *   - COALTER_THREE_STAGE 追加なし
 */

import type { TwoPersonLensToday } from "../understanding/types";
import { deriveMovieQuery } from "./queryDerivation";
import {
  buildCandidatePool,
  type CandidatePoolDeps,
} from "./candidatePool";
import {
  curate,
  type CuratorLLMClient,
  type MovieDomainContext,
  type PersonalityRootedPick,
} from "./curator";
import {
  expandAreaConcentrically,
  type AreaExpansionResult,
} from "./areaExpansion";
import {
  buildTierFailNarration,
  type TierFailState,
} from "./tierFailNarration";
import type {
  TheaterListing,
  TheaterResolverDeps,
  TheaterResolverResult,
} from "./theaterResolver";
import {
  buildThreeStageDiagnostics,
  type ThreeStageDiagnostics,
} from "./diagnostics";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types — Pipeline Input / Deps / Result
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `runThreeStagePipeline` の入力。
 *
 *   - `lens`: Stage 1 Understand 出力 (別 phase 生成)
 *   - `userArea`: ユーザー指定 area (Tier 0)
 *   - `prefetchedTheaters`: D-2-d `prefetchStage3` 出力の Map。caller (D-2-e2 で
 *     movieOrchestrator) が事前に投機的並列 prefetch を起動して渡す想定。空 Map
 *     / undefined 許容 (cache 不使用)
 *   - `movieDomain`: movie 固有 cinematic 文脈 (optional、curator に propagate)
 *
 * **型整合**: `prefetchedTheaters` は D-2-d `PrefetchResult.prefetched` の型と
 * 完全一致 (`ReadonlyMap<string, TheaterResolverResult>`、CEO 補正)。
 */
export type ThreeStagePipelineInput = {
  lens: TwoPersonLensToday;
  userArea: string;
  prefetchedTheaters?: ReadonlyMap<string, TheaterResolverResult>;
  movieDomain?: MovieDomainContext;
};

/** `runThreeStagePipeline` の deps (DI コンテナ)。 */
export type ThreeStagePipelineDeps = {
  candidatePoolDeps: CandidatePoolDeps;
  llmClient: CuratorLLMClient;
  resolverDeps: TheaterResolverDeps;
};

/**
 * Pipeline 結果 (3 分岐 union):
 *
 *   - `success` (tier 0): user 指定 area で found
 *   - `tier1_expanded_success` (tier 1): 隣接 area で found
 *   - `tier2_fail` (tier 2): 全 area fail → tierFail narration 付与
 *
 * 3 分岐すべて `topPick` / `alternates` / `diagnostics` を含む (caller UI が
 * tier2_fail でも alternates を表示できるよう)。
 */
export type ThreeStagePipelineResult =
  | {
      state: "success" | "tier1_expanded_success";
      topPick: PersonalityRootedPick;
      alternates: readonly PersonalityRootedPick[];
      theaters: readonly TheaterListing[];
      foundAtArea: string;
      diagnostics: ThreeStageDiagnostics;
    }
  | {
      state: "tier2_fail";
      topPick: PersonalityRootedPick;
      alternates: readonly PersonalityRootedPick[];
      tierFail: TierFailState;
      diagnostics: ThreeStageDiagnostics;
    };

// ═══════════════════════════════════════════════════════════════════════════
// 2. Cache hit synth (D-2-d prefetched cache → AreaExpansionResult 形に合成)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prefetched cache hit 時に `AreaExpansionResult` 互換 shape を合成する。
 *
 *   - cache hit = prefetch が userArea で resolveTheater を成功させた結果を
 *     そのまま再利用する経路。よって `tier: 0`, `state: "success"`,
 *     `foundAtArea: userArea` で固定
 *   - `stage3FallbackSourceUsed` は cache entry の diagnostics から propagate
 *
 * **caller 責務**: prefetched cache の生成時に candidate.area === userArea で
 * あったことを caller (D-2-e2 で movieOrchestrator) が保証する。D-2-e1 では
 * structural scaffold として title 単独の cache key を採用。
 */
function synthAreaResultFromCache(
  cached: TheaterResolverResult,
  userArea: string,
): AreaExpansionResult {
  return {
    tier: 0,
    state: "success",
    theaters: cached.theaters,
    triedAreas: [userArea],
    foundAtArea: userArea,
    stage3FallbackSourceUsed: cached.diagnostics.stage3FallbackSourceUsed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — runThreeStagePipeline
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 三段式本線パイプライン。
 *
 *   1. **Stage 2 Curate**: query → pool → curate (DI 経由 LLM)
 *   2. **prefetched cache 判定**: topPick.title が cache に hit かつ non-empty
 *      theaters → cache から合成 (skip areaExpansion、cost 削減)
 *   3. **Stage 3 Resolve**: cache miss なら expandAreaConcentrically
 *   4. **tier2_fail narration**: tier2_fail なら buildTierFailNarration を起動
 *   5. **diagnostics 集約**: buildThreeStageDiagnostics (event 単位、6 fields)
 *
 * caller (D-2-e2 で movieOrchestrator) は本関数を `COALTER_THREE_STAGE` flag
 * で gate して呼び出す想定。D-2-e1 scope では caller wiring は **なし**。
 */
export async function runThreeStagePipeline(
  input: ThreeStagePipelineInput,
  deps: ThreeStagePipelineDeps,
): Promise<ThreeStagePipelineResult> {
  // ── Stage 2 Curate ─────────────────────────────────────────────────
  const query = deriveMovieQuery(input.lens);
  const poolResult = await buildCandidatePool(
    { query, userArea: input.userArea },
    deps.candidatePoolDeps,
  );
  const curatorResult = await curate(
    {
      lens: input.lens,
      query,
      candidatePool: poolResult.filteredPool,
      movieDomain: input.movieDomain,
    },
    { llmClient: deps.llmClient },
  );
  const { topPick, alternates } = curatorResult;

  // ── Stage 3 Resolve: cache hit 判定 → areaExpansion ──────────────────
  const cached = input.prefetchedTheaters?.get(topPick.title);
  let cacheHit: boolean;
  let areaResult: AreaExpansionResult;
  if (cached !== undefined && cached.theaters.length > 0) {
    cacheHit = true;
    areaResult = synthAreaResultFromCache(cached, input.userArea);
  } else {
    cacheHit = false;
    areaResult = await expandAreaConcentrically(
      { title: topPick.title, tier0Area: input.userArea },
      { resolverDeps: deps.resolverDeps },
    );
  }

  const diagnostics = buildThreeStageDiagnostics({
    poolDiagnostics: poolResult.diagnostics,
    prefetchCacheHit: cacheHit,
    areaResult,
  });

  // ── tier2_fail narration ───────────────────────────────────────────
  //
  // AreaExpansionResult invariant (D-2-b §1):
  //   - state === "tier2_fail" ⇔ foundAtArea === null
  //   - state in {"success","tier1_expanded_success"} ⇔ foundAtArea is string
  //
  // 防御的に foundAtArea が null の場合も tier2_fail として扱う (invariant 違反は
  // 上位 sub-module バグ、本 file からは narration 経路に倒して fail-open)。
  if (areaResult.state === "tier2_fail" || areaResult.foundAtArea === null) {
    const tierFail = buildTierFailNarration({
      failedTitle: topPick.title,
      area: input.userArea,
      lens: input.lens,
    });
    return {
      state: "tier2_fail",
      topPick,
      alternates,
      tierFail,
      diagnostics,
    };
  }

  return {
    state: areaResult.state,
    topPick,
    alternates,
    theaters: areaResult.theaters,
    foundAtArea: areaResult.foundAtArea,
    diagnostics,
  };
}
