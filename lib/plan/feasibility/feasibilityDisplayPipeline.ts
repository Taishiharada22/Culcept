/**
 * Phase 3-M-3a (pure) — Pre-UI Feasibility Display Pipeline Helper
 *
 * 役割:
 *   M-1 `computeDayFeasibility` + M-2a `formatFeasibilityForDisplay` + M-2b assertion
 *   を **pure に合成**する軽量 pipeline helper。 caller (= 将来 M-3b+ UI 接続層) は
 *   既に解決済の `graph` + `overlayResult` を渡すだけで、 warning 化を防御した
 *   safe な display data を得られる。
 *
 * 思想 (= L-4c-pure と対称、 「観測層 pipeline の標準 template」):
 *   - L-4c-pure: anchors / coords / providers → MovementDisplayResult (= 非同期、 重い)
 *   - **M-3a (= 本 helper)**: graph / overlayResult → FeasibilityDisplayResult (= 同期、 軽量)
 *
 *   両者を combine する責任は caller (= UI 接続層) に委ねる:
 *     1. L-4c-pure で overlay 取得 (= async)
 *     2. M-3a で feasibility display 取得 (= sync)
 *     3. 同 transitionKey で UI 表示時に結合
 *
 * 危険境界遵守 (= M-3a では絶対に触れない):
 *   - UI 接続 (= M-3b+ 別 phase、 CEO smoke 必須)
 *   - Calendar / Map / Flow に touch
 *   - Arrival Risk Memory / warning / recommendation / optimization 文言
 *   - DB / env / package / dependency 変更
 *   - localStorage / runtime telemetry sink
 *   - mode 推定 / Routes API
 *
 * M-3a-pure scope (= 2026-05-23 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / fetch 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0 (= M-3b+ は別 audit)
 *   - K phase / L / M-1 / M-2 既存 file 改変 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-3-readiness-audit.md §2 / §6
 *   - lib/plan/transport/movementDisplayPipeline.ts (= L-4c-pure、 対称 pattern)
 *   - lib/plan/feasibility/dayFeasibilityComputation.ts (= M-1)
 *   - lib/plan/feasibility/feasibilityDisplayFormatter.ts (= M-2a)
 *   - lib/plan/feasibility/feasibilityDisplayContract.ts (= M-2b)
 */

import type { DayGraph } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { OverlayResult } from "@/lib/plan/transport/movementSegmentOverlay";

import { computeDayFeasibility } from "./dayFeasibilityComputation";
import { assertFeasibilityDisplayResultCompliance } from "./feasibilityDisplayContract";
import {
  formatFeasibilityForDisplay,
  type FeasibilityDisplayResult,
} from "./feasibilityDisplayFormatter";
import type { DayFeasibilityResult } from "./feasibilityTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * M-3a pipeline 入力。
 *
 * 設計判断 (= readiness audit §2.2、 Option B 軽量 helper):
 *   - caller は L-4c-pure で既に overlay を取得済の前提
 *   - 重複計算 0 (= overlay を再計算しない)
 *   - sync pure (= caller の useMemo / inline 計算可能)
 */
export interface FeasibilityDisplayPipelineInput {
  /** K phase DayGraph (= 同期 pure で生成済) */
  readonly graph: DayGraph;

  /**
   * L overlay result (= L-3c で sanitize 済の PII-free 結果)。
   * caller が L-4c-pure (= runMovementDisplayPipeline) 経由で取得する想定。
   */
  readonly overlayResult: OverlayResult;

  /**
   * Opaque tracing id (= L-3c passthrough 継承、 L-4e telemetry sink の hook)。
   * M-3a では unused、 result に passthrough のみ。
   */
  readonly tracingId?: string;
}

/**
 * M-3a pipeline 出力。
 *
 * 構造的に保持する 2 種類の data:
 *   1. `feasibilityDisplay`: M-2a/M-2b 通過済の display view (= not_applicable 除外、 caller の UI 表示候補)
 *   2. `feasibilityCounts`: M-1 完全 counts (= sufficient / insufficient / notApplicable 全件、 集計用)
 *
 * 思想 (= 革新 1: counts 完全保持):
 *   - display は **見せるもの** (= not_applicable 除外)
 *   - counts は **集計の事実** (= 全件保持)
 *   - caller (= 将来 UI 接続層) は両者を分離利用可能
 */
export interface FeasibilityDisplayPipelineResult {
  /** M-2a/M-2b 通過済 display (= caller の UI 表示候補) */
  readonly feasibilityDisplay: FeasibilityDisplayResult;

  /** M-1 完全 counts (= sufficient / insufficient / notApplicable 全件、 caller の集計用) */
  readonly feasibilityCounts: {
    readonly sufficient: number;
    readonly insufficient: number;
    readonly notApplicable: number;
  };

  /**
   * ★WPM-2a additive: M-1 の raw DayFeasibilityResult（slack/shortfall 分数込み・not_applicable 含む）。
   * 既存 feasibilityDisplay / feasibilityCounts は不変。Day Rehearsal recovery（真の slack＝gap−travel）用。
   */
  readonly feasibilityRaw: DayFeasibilityResult;

  /** tracingId passthrough (= L-3c hook 整合) */
  readonly tracingId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: runFeasibilityDisplayPipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * M-3a pipeline = M-1 + M-2a + M-2b を pure に合成する sync helper。
 *
 * Step:
 *   (1) M-1 `computeDayFeasibility(graph, overlayResult)` (= sync pure)
 *       → DayFeasibilityResult (= 全 transition の sufficient/insufficient/not_applicable)
 *   (2) M-2a `formatFeasibilityForDisplay(feasibility)` (= sync pure)
 *       → FeasibilityDisplayResult (= 「余白 N 分」/「不足 N 分」、 not_applicable 除外)
 *   (3) M-2b `assertFeasibilityDisplayResultCompliance(display)` (= 出荷直前 機械保証)
 *       → 9 invariants 全件 PASS or throw
 *   (4) caller に { feasibilityDisplay, feasibilityCounts, tracingId } を返す
 *
 * 純度保証:
 *   - input (= graph / overlayResult) を mutate しない
 *   - 副作用なし (= no DB, no fetch, no localStorage, no console)
 *   - deterministic (= 同じ input → 同じ output)
 *   - sync (= async なし、 caller は await 不要)
 *
 * 「観測層 3 段構造 pipeline」 思想:
 *   - L-4c-pure (= L) と本 helper (= M-3a) は完全対称 pattern
 *   - N 以降の phase でも同 pattern を継承可能
 *
 * 危険境界遵守 (= M-3a では絶対に触れない):
 *   - UI 接続 / Calendar/Map/Flow / Arrival Risk / localStorage / etc 0
 *
 * @param input graph (= K phase) + overlayResult (= L-3c sanitize 済) + tracingId (= optional)
 * @returns feasibilityDisplay + feasibilityCounts + tracingId (= caller の UI 接続用)
 */
export function runFeasibilityDisplayPipeline(
  input: FeasibilityDisplayPipelineInput,
): FeasibilityDisplayPipelineResult {
  // (1) M-1 computation (= sync pure、 not_applicable / sufficient / insufficient を完全分類)
  const feasibility = computeDayFeasibility(input.graph, input.overlayResult);

  // (2) M-2a format (= sync pure、 not_applicable は map から除外、 「余白/不足 N 分」 のみ)
  const display = formatFeasibilityForDisplay(feasibility);

  // (3) M-2b assertion (= 出荷直前 9 invariants 機械保証、 違反時 throw)
  assertFeasibilityDisplayResultCompliance(display);

  // (4) result 構築 (= display + 完全 counts + tracingId)
  return {
    feasibilityDisplay: display,
    feasibilityCounts: feasibility.counts,
    feasibilityRaw: feasibility, // ★WPM-2a additive（display 不変・recovery 用 raw slack）
    ...(input.tracingId !== undefined ? { tracingId: input.tracingId } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Re-exports (= caller の便利性、 type アクセス統一)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type {
  FeasibilityDisplayResult,
  FeasibilityDisplayView,
  FeasibilityDisplayVariant,
  FeasibilityDisplayTier,
} from "./feasibilityDisplayFormatter";
