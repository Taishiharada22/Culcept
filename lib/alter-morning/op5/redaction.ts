/**
 * redaction — OP-5.2 (CEO 2026-05-06)
 *
 * `ShadowOrchestratorResult` (= OP-5.1 internal / unredacted) を **telemetry-safe**
 * な `RedactedShadowObservation` に変換する pure layer。
 *
 * 設計の核 — type-level boundary:
 *   ShadowOrchestratorResult (= raw 含む、 internal、 OP-5.1 着地済み)
 *           ↓
 *   [redactShadowResult()]   ← OP-5.2 boundary、 pure
 *           ↓
 *   RedactedShadowObservation (= raw 含まない、 型で固定、 telemetry-safe)
 *
 * **核心**: `RedactedShadowObservation` 型に raw field (= utterance / label /
 * userId / lat / lng / coords / payload / matchedSpan / source_span / provenance /
 * trace / emittedCandidates / dispatchResult / morningPlan / planState) が
 * **存在しない**。 これにより type 階層で漏洩を構造的に防止。
 *
 * 出力に含めてよいもの:
 *   - counts (= 各 type の candidate 数)
 *   - operation type / source / confidence enum
 *   - priority bucket ("high" | "medium" | "low") (= 数値そのままは出さない)
 *   - match / mismatch boolean
 *   - reject reason counts
 *   - factoriesInvoked count
 *   - durationMs bucket ("<10ms" | "10-50ms" | "50-100ms" | "100ms+")
 *   - trace.ruleId (= 内部実装識別子、 enum-like で raw でない)
 *
 * 出力に **絶対に含めない**もの:
 *   - raw utterance / raw label / raw user_id
 *   - coordinates (lat / lng)
 *   - full candidate payload
 *   - JourneyAnchorState 全体 (= label / lat / lng を含むため)
 *   - provenance.source_span / trace.matchedSpan (= 生発話 substring)
 *   - emittedCandidates / dispatchResult (= 上記 raw を含む)
 *
 * log level (CEO 2026-05-06 修正点 4):
 *   - "none":    null を返す (= emit しない signal)
 *   - "summary": counts + match boolean + factoriesInvokedCount + durationBucket
 *   - "verbose": summary + selectedSources + priority bucket + confidence +
 *                rejectReasonCounts + ruleIds + travelEdges 集約
 *                **ただし raw は一切なし**
 *
 * hash 値計算 (= label_hash / utterance_hash / user_hash):
 *   OP-5.2 では **実装しない** (CEO 修正点で確認済)。
 *   必要時は別 PR で salt 設計込みで実装。
 *
 * 永続化:
 *   OP-5.2 では **永続化しない** (= DB / log / Sentry / table 全て手を出さない)。
 *   永続化路は OP-5.3 以降で別 phase。
 *
 * 規律 (OP-5.2):
 *   - flags.ts / shadowOrchestrator.ts は **触らない** (= 不変)
 *   - morningPipeline / route / legacyAdapter / DB / telemetry も全て不変
 *   - PR #75 系 module 参照なし
 */

import type { OperationSource, OperationConfidence } from "../comprehension/operationEnvelope";
import type { RejectReason } from "../comprehension/candidateDispatcher";
import type { Op5ShadowLogLevel } from "./flags";
import type { ShadowOrchestratorResult } from "./shadowOrchestrator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bucket types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * priority bucket。 数値そのままは出さない (= 内部実装漏洩抑制)。
 *
 * 境界:
 *   - "high":   800-1000  (= UI 確定 / explicit signal / explicitDayOrigin/End / historyPriorPlan)
 *   - "medium": 400-799   (= LLM / regex / historyPreviousDay / travelEdge)
 *   - "low":    0-399     (= location / system_default)
 */
export type PriorityBucket = "high" | "medium" | "low";

/**
 * durationMs bucket。 数値そのままは出さない (= 内部実装漏洩抑制)。
 */
export type DurationBucket = "<10ms" | "10-50ms" | "50-100ms" | "100ms+";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Redacted observation — discriminated union by `level`
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * summary level の出力 shape。 production 観測想定 (= 最小情報)。
 *
 * **raw は一切なし**:
 *   - utterance / label / userId / lat / lng / coords / payload を含まない
 *   - 各 type の candidate count + dispatcher selected boolean のみ
 *   - source / priority bucket / confidence / reject reason は含まない (= verbose 専用)
 */
export interface RedactedSummaryObservation {
  level: "summary";

  /** 各 type の emitted candidate 数 */
  counts: {
    targetDate: number;
    journeyOrigin: number;
    journeyEnd: number;
    travelEdges: number;
  };

  /** dispatcher が field 別に candidate を選んだか (= boolean のみ) */
  selected: {
    targetDate: boolean;
    journeyOrigin: boolean;
    journeyEnd: boolean;
    travelEdges: boolean; // length > 0
  };

  /** 起動 factory の数 (= 9 のみ想定、 OP-5.1 で固定) */
  factoriesInvokedCount: number;

  /** 実行時間 bucket */
  durationBucket: DurationBucket;
}

/**
 * verbose level の出力 shape。 dev / canary 観測想定。
 *
 * summary + structural metadata。 **依然 raw は一切なし**:
 *   - source enum / priority bucket / confidence は含む (= 内部実装識別子)
 *   - reject reason counts は含む (= reason enum → 件数)
 *   - selectedRuleIds は含む (= trace.ruleId、 enum-like で raw でない)
 *   - travelEdges は count + sources / priorityBuckets の集約のみ
 *   - **utterance / label / coords / payload は禁止**
 */
export interface RedactedVerboseObservation {
  level: "verbose";

  // ─── summary fields ───
  counts: RedactedSummaryObservation["counts"];
  selected: RedactedSummaryObservation["selected"];
  factoriesInvokedCount: number;
  durationBucket: DurationBucket;

  // ─── verbose-only fields ───

  /** dispatcher が選択した envelope の source (= 各 field、 不在なら null) */
  selectedSources: {
    targetDate: OperationSource | null;
    journeyOrigin: OperationSource | null;
    journeyEnd: OperationSource | null;
  };

  /** dispatcher が選択した envelope の priority bucket */
  selectedPriorityBuckets: {
    targetDate: PriorityBucket | null;
    journeyOrigin: PriorityBucket | null;
    journeyEnd: PriorityBucket | null;
  };

  /** dispatcher が選択した envelope の confidence */
  selectedConfidences: {
    targetDate: OperationConfidence | null;
    journeyOrigin: OperationConfidence | null;
    journeyEnd: OperationConfidence | null;
  };

  /** dispatcher が選択した envelope の trace.ruleId (= enum-like、 raw でない) */
  selectedRuleIds: {
    targetDate: string | null;
    journeyOrigin: string | null;
    journeyEnd: string | null;
  };

  /** RejectReason enum → 件数 map */
  rejectReasonCounts: Record<RejectReason, number>;

  /**
   * travelEdges 集約 (= input order 保持の travel edge 群を集約)。
   * 個別 envelope の label / payload は **含めない**、 source / bucket の集合のみ。
   */
  travelEdges: {
    count: number;
    sources: ReadonlyArray<OperationSource>;
    priorityBuckets: ReadonlyArray<PriorityBucket>;
  };
}

/**
 * redaction の最終出力型 (= discriminated union)。
 * caller は `redacted.level` で narrow できる。
 */
export type RedactedShadowObservation =
  | RedactedSummaryObservation
  | RedactedVerboseObservation;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers (= bucket 化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function priorityToBucket(priority: number): PriorityBucket {
  if (priority >= 800) return "high";
  if (priority >= 400) return "medium";
  return "low";
}

function durationToBucket(ms: number): DurationBucket {
  if (ms < 10) return "<10ms";
  if (ms < 50) return "10-50ms";
  if (ms < 100) return "50-100ms";
  return "100ms+";
}

function nullablePriorityBucket(
  priority: number | undefined | null,
): PriorityBucket | null {
  if (priority === undefined || priority === null) return null;
  return priorityToBucket(priority);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry: redactShadowResult
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RedactOptions {
  level: Op5ShadowLogLevel;
}

/**
 * `ShadowOrchestratorResult` (= raw 含む) を `RedactedShadowObservation` に変換する。
 *
 * 動作:
 *   - level === "none" → null (= emit しない signal)
 *   - level === "summary" → 最小 fields
 *   - level === "verbose" → summary + structural metadata
 *
 * 規律 (= test で固定):
 *   - 出力に raw utterance / label / userId / coords / payload / provenance /
 *     trace / emittedCandidates / dispatchResult を **絶対に含まない**
 *   - 出力 type に danger key が **存在しない** (= type-level)
 *   - input mutate しない (= pure)
 *   - 同 input + level で同 output (= deterministic)
 *
 * @param result OP-5.1 shadowOrchestrator の出力 (= internal / unredacted)
 * @param options redact level
 * @returns RedactedShadowObservation または null (= level "none" 時)
 */
export function redactShadowResult(
  result: ShadowOrchestratorResult,
  options: RedactOptions,
): RedactedShadowObservation | null {
  if (options.level === "none") return null;

  // ─── summary fields (= 全 level 共通) ───
  const counts = {
    targetDate: result.emittedCandidates.targetDate.length,
    journeyOrigin: result.emittedCandidates.journeyOrigin.length,
    journeyEnd: result.emittedCandidates.journeyEnd.length,
    travelEdges: result.emittedCandidates.travelEdges.length,
  };

  const selected = {
    targetDate: result.dispatchResult.selectedTargetDateCandidate !== null,
    journeyOrigin:
      result.dispatchResult.selectedJourneyOriginCandidate !== null,
    journeyEnd: result.dispatchResult.selectedJourneyEndCandidate !== null,
    travelEdges:
      result.dispatchResult.selectedTravelEdgeCandidates.length > 0,
  };

  const factoriesInvokedCount = result.meta.factoriesInvoked.length;
  const durationBucket = durationToBucket(result.meta.durationMs);

  if (options.level === "summary") {
    return {
      level: "summary",
      counts,
      selected,
      factoriesInvokedCount,
      durationBucket,
    };
  }

  // ─── verbose: summary + structural metadata ───

  const tdSelected = result.dispatchResult.selectedTargetDateCandidate;
  const joSelected = result.dispatchResult.selectedJourneyOriginCandidate;
  const jeSelected = result.dispatchResult.selectedJourneyEndCandidate;

  const selectedSources = {
    targetDate: tdSelected?.source ?? null,
    journeyOrigin: joSelected?.source ?? null,
    journeyEnd: jeSelected?.source ?? null,
  };

  const selectedPriorityBuckets = {
    targetDate: nullablePriorityBucket(tdSelected?.priority),
    journeyOrigin: nullablePriorityBucket(joSelected?.priority),
    journeyEnd: nullablePriorityBucket(jeSelected?.priority),
  };

  const selectedConfidences = {
    targetDate: tdSelected?.confidence ?? null,
    journeyOrigin: joSelected?.confidence ?? null,
    journeyEnd: jeSelected?.confidence ?? null,
  };

  const selectedRuleIds = {
    targetDate: tdSelected?.trace?.ruleId ?? null,
    journeyOrigin: joSelected?.trace?.ruleId ?? null,
    journeyEnd: jeSelected?.trace?.ruleId ?? null,
  };

  // ─── reject reason counts ───
  const rejectReasonCounts: Record<RejectReason, number> = {
    lower_priority: 0,
    lower_confidence: 0,
    source_tie_break_loser: 0,
    stable_order_loser: 0,
    unhandled_slot_for_op4: 0,
    invalid_target_date: 0,
  };
  for (const r of result.dispatchResult.rejected) {
    rejectReasonCounts[r.reason] = (rejectReasonCounts[r.reason] ?? 0) + 1;
  }

  // ─── travelEdges 集約 (= 個別 payload は出さない、 source / bucket のみ) ───
  const travelEdgesSources: OperationSource[] = [];
  const travelEdgesBuckets: PriorityBucket[] = [];
  for (const env of result.dispatchResult.selectedTravelEdgeCandidates) {
    travelEdgesSources.push(env.source);
    travelEdgesBuckets.push(priorityToBucket(env.priority));
  }

  const travelEdges = {
    count: result.dispatchResult.selectedTravelEdgeCandidates.length,
    sources: travelEdgesSources,
    priorityBuckets: travelEdgesBuckets,
  };

  return {
    level: "verbose",
    counts,
    selected,
    factoriesInvokedCount,
    durationBucket,
    selectedSources,
    selectedPriorityBuckets,
    selectedConfidences,
    selectedRuleIds,
    rejectReasonCounts,
    travelEdges,
  };
}
