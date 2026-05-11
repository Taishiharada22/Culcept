/**
 * CoAlter Stage 1/2/3 (movie) — Three-Stage Pipeline Diagnostics
 *
 * 三段式 §6 M2 / mainstream plan §3.3 元 D-3-e / handover §6 D-2-e /
 * D-2-e 設計レビュー §5 (structural scaffold).
 *
 * 三段式本線 (`runThreeStagePipeline`) 1 回の event 単位 diagnostics 型と、
 * sub-module diagnostics (D-1-b candidatePool / D-2-b areaExpansion) からの
 * 集約 helper。
 *
 * 設計原則 (CEO 採用 D-2-e v2 §5):
 *   - **event 単位**: 集計値 (success rate / fail rate) は持たない。Step E の
 *     analytics 層で SQL ベース集計する (CEO 補正 2 整合)
 *   - **6 fields 固定**: Stage 2 raw / filtered + Stage 3 prefetch hit /
 *     fallback source / area tier / state
 *   - **console.info 不使用** (D-2-e1 凍結禁止事項)
 *   - **pure function**: `buildThreeStageDiagnostics` は副作用ゼロ、決定論
 *
 * D-2-e1 scope (structural scaffold complete):
 *   - 本 file は型 + pure helper のみ
 *   - movieOrchestrator / flags.ts への wiring は **D-2-e2** で別 phase
 *   - 実 fetcher / 実 LLM 接続は **D-2-e3** で別 phase
 *
 * 凍結線整合 (handover §4.2):
 *   - import は candidatePool / areaExpansion / theaterResolver の型のみ
 *   - 既存 movieOrchestrator / webConnector / movieCatalog touch なし
 *   - COALTER_THREE_STAGE flag 追加なし (D-2-e2 で別 phase)
 */

import type { AreaExpansionResult, AreaExpansionState, AreaExpansionTier } from "./areaExpansion";
import type { CandidatePoolDiagnostics } from "./candidatePool";
import type { Stage3FallbackSource } from "./theaterResolver";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types — ThreeStageDiagnostics (event 単位、6 fields 固定)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 三段式本線 1 event 分の diagnostics (6 fields 固定):
 *
 *   - `stage2CandidateRawCount`: dedup 後の raw pool 数 (Soft filter 前)
 *   - `stage2CandidateFilteredCount`: Soft Availability Filter 通過後の数
 *   - `stage3PrefetchCacheHit`: D-2-d prefetched cache に top pick title が hit したか
 *   - `stage3FallbackSourceUsed`: Stage 3 確定 source ("none" = tier2_fail or 全 source empty)
 *   - `stage3AreaTier`: 確定 tier (0 = user 指定 / 1 = 隣接 / 2 = fail)
 *   - `stage3State`: 確定 state ("success" / "tier1_expanded_success" / "tier2_fail")
 */
export type ThreeStageDiagnostics = {
  stage2CandidateRawCount: number;
  stage2CandidateFilteredCount: number;
  stage3PrefetchCacheHit: boolean;
  stage3FallbackSourceUsed: Stage3FallbackSource | "none";
  stage3AreaTier: AreaExpansionTier;
  stage3State: AreaExpansionState;
};

/** `buildThreeStageDiagnostics` の入力。 */
export type BuildThreeStageDiagnosticsInput = {
  poolDiagnostics: CandidatePoolDiagnostics;
  prefetchCacheHit: boolean;
  areaResult: AreaExpansionResult;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — buildThreeStageDiagnostics (pure function)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * sub-module 出力から `ThreeStageDiagnostics` を構築する pure function。
 *
 *   - 副作用ゼロ (時間 / random / DB / network 不参照)
 *   - 入力 mutate なし
 *   - 同 input → 同 output (決定論)
 *
 * D-2-e1 では本 helper は `threeStagePipeline.ts` から呼ばれる想定だが、
 * 単独でも import 可能 (test / 集約用途のため独立に export)。
 */
export function buildThreeStageDiagnostics(
  input: BuildThreeStageDiagnosticsInput,
): ThreeStageDiagnostics {
  const { poolDiagnostics, prefetchCacheHit, areaResult } = input;
  return {
    stage2CandidateRawCount: poolDiagnostics.rawTotal,
    stage2CandidateFilteredCount: poolDiagnostics.softFilterPassed,
    stage3PrefetchCacheHit: prefetchCacheHit,
    stage3FallbackSourceUsed: areaResult.stage3FallbackSourceUsed,
    stage3AreaTier: areaResult.tier,
    stage3State: areaResult.state,
  };
}
