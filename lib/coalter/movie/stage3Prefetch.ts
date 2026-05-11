/**
 * CoAlter Stage 3 Resolve (movie) — Stage 3 Prefetch (投機的並列実行)
 *
 * 三段式 §3 (1 分 budget 内訳) / §6 Phase M2 / mainstream plan §3.3 元 D-3-d /
 * handover §6 D-2-d / D-2 設計レビュー §5.
 *
 * Stage 2 curate で top picks が確定したら、**confidence が閾値以上**の候補に
 * 対して Stage 3 theaterResolver を **並列で投機的に起動**する。budget 内で
 * 完了した結果は Map に格納、後続の Stage 3 本実行時に cache hit させる。
 *
 * 設計原則 (CEO 採用 B1: budgetMs は caller 注入):
 *   - **動的残り budget で race**: 各 prefetch は (deadline - now) の残り時間で
 *     `Promise.race([resolveTheater, timeout])` で動く
 *   - **fail-open**: resolver throw / timeout → 次 candidate に影響なし、その分は
 *     timedOut カウントで diagnostics に記録
 *   - **default confidence threshold 0.8** (CEO 採用、D-2 設計レビュー §5)
 *     - `deps.confidenceThreshold` で override 可能
 *     - 閾値未満は skip + skippedLowConfidenceCount 記録
 *   - **AbortController 不使用**: D-2-d 最小化方針、timeout 後の dangling promise は
 *     GC が回収、theaterResolver 内部 fail-open で実害ゼロ
 *   - **DI**: theaterResolver の deps (4 fetcher) は caller から注入、本 file は
 *     実 fetch を持たない
 *
 * 凍結線整合 (handover §4.2):
 *   - import は theaterResolver (D-2-a) のみ
 *   - 既存 movieOrchestrator / webConnector / movieCatalog touch なし
 *   - COALTER_THREE_STAGE 追加なし (D-2-e で別 phase)
 */

import {
  resolveTheater,
  type TheaterResolverDeps,
  type TheaterResolverResult,
} from "./theaterResolver";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types
// ═══════════════════════════════════════════════════════════════════════════

/** Prefetch 対象候補 (Stage 2 curate の top picks 想定)。 */
export type PrefetchCandidate = {
  title: string;
  area: string;
  /** Stage 2 LLM Ranker の confidence (0-1)、閾値で gate */
  confidence: number;
};

/** prefetchStage3 の入力。 */
export type PrefetchInput = {
  topCandidates: readonly PrefetchCandidate[];
  /**
   * 全体 budget (ms)。caller (D-2-e で movieOrchestrator) から渡される。
   * 三段式 §3 では Stage 3a Tier 0 fetch = 10s が目安だが、prefetch では並列実行
   * のため、caller が残り 1 分 budget の中から適切に割り当てる。
   */
  budgetMs: number;
};

/** prefetchStage3 の deps (DI)。 */
export type PrefetchDeps = {
  resolverDeps: TheaterResolverDeps;
  /** Default 0.8 (CEO 採用、三段式 §3 投機実行条件)。Override 可能。 */
  confidenceThreshold?: number;
};

/**
 * Event 単位 diagnostics (D-2-a と同じ pattern、集計値ではなく単発 request の事実)。
 *
 *   - `attemptedCount`: confidence >= threshold で prefetch 試行した数
 *   - `completedCount`: budget 内に完了した数 (prefetched.size と一致)
 *   - `timedOutCount`: budget 超過 / resolver throw で完了しなかった数
 *   - `budgetExceeded`: 全体 elapsed > budgetMs ならば true
 *   - `skippedLowConfidenceCount`: confidence < threshold で skip した数
 */
export type PrefetchDiagnostics = {
  attemptedCount: number;
  completedCount: number;
  timedOutCount: number;
  budgetExceeded: boolean;
  skippedLowConfidenceCount: number;
};

/** prefetchStage3 の最終結果。 */
export type PrefetchResult = {
  /** title key の Map、budget 内に完了した分のみ。 */
  prefetched: ReadonlyMap<string, TheaterResolverResult>;
  diagnostics: PrefetchDiagnostics;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Default threshold (CEO 採用、三段式 §3)
// ═══════════════════════════════════════════════════════════════════════════

/** Default confidence threshold (CEO 採用、三段式 §3 投機実行条件)。 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — prefetchStage3
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 3 theater resolve を投機的に並列実行する pure async function。
 *
 *   1. confidence >= threshold で candidate を filter (eligible)
 *   2. eligible が空 → 即 return (空 Map + diagnostics 全 0、skippedLowConfidenceCount のみ記録)
 *   3. 各 eligible に対して `resolveTheater` を並列起動
 *      - 動的残り budget (`deadline - Date.now()`) で `Promise.race([resolver, timeout])`
 *      - timeout / throw → timedOut カウント
 *      - 完了 → prefetched Map に格納 + completed カウント
 *   4. `Promise.allSettled` で全 candidate の prefetch 完了を待つ
 *   5. 全体 elapsed > budgetMs → `budgetExceeded: true`
 *
 * **fail-open**: 個別 prefetch の throw / timeout は他 candidate の prefetch に影響しない。
 * caller は本関数の reject を受けない (常に resolve)。
 */
export async function prefetchStage3(
  input: PrefetchInput,
  deps: PrefetchDeps,
): Promise<PrefetchResult> {
  const threshold = deps.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const { topCandidates, budgetMs } = input;

  // ── confidence で filter ────────────────────────────────────────
  const eligible = topCandidates.filter((c) => c.confidence >= threshold);
  const skippedLowConfidenceCount = topCandidates.length - eligible.length;

  // ── eligible 空 → 即 return ─────────────────────────────────────
  if (eligible.length === 0) {
    return {
      prefetched: new Map(),
      diagnostics: {
        attemptedCount: 0,
        completedCount: 0,
        timedOutCount: 0,
        budgetExceeded: false,
        skippedLowConfidenceCount,
      },
    };
  }

  // ── 並列 prefetch + 動的残り budget race ────────────────────────
  const startTime = Date.now();
  const deadline = startTime + budgetMs;
  const prefetched = new Map<string, TheaterResolverResult>();
  let completedCount = 0;
  let timedOutCount = 0;

  await Promise.allSettled(
    eligible.map(async (candidate) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        timedOutCount++;
        return;
      }
      try {
        const winner = await Promise.race<TheaterResolverResult | "timeout">([
          resolveTheater(
            { title: candidate.title, area: candidate.area },
            deps.resolverDeps,
          ),
          new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), remaining),
          ),
        ]);
        if (winner === "timeout") {
          timedOutCount++;
        } else {
          prefetched.set(candidate.title, winner);
          completedCount++;
        }
      } catch {
        // theaterResolver は内部で fail-open するが、念のため二重防御
        timedOutCount++;
      }
    }),
  );

  const elapsed = Date.now() - startTime;
  const budgetExceeded = elapsed > budgetMs;

  return {
    prefetched,
    diagnostics: {
      attemptedCount: eligible.length,
      completedCount,
      timedOutCount,
      budgetExceeded,
      skippedLowConfidenceCount,
    },
  };
}
