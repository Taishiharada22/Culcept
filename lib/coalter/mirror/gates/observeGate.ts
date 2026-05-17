/**
 * CoAlter AOO Phase B B-4b — Observe Gate (pure function)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §4.1 / §6
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §6 unknown unified policy
 *   - 型: lib/coalter/mirror/types.ts (B-4a)
 *   - 定数: lib/coalter/mirror/decisionConstants.ts (B-4a)
 *
 * 役割 (B-4b 段階):
 *   Decision Engine の **第 1 段 Gate**。観測の十分性を判定する。
 *   B-2 modeContext / B-3 4 bucket のいずれかが unknown なら fail (fail-closed)。
 *   B-4c ERV / B-4d engine 統合は本 file で行わない。
 *
 * Gate ロジック (CEO B-4b 指示 1):
 *   1. modeContext が unknown → fail OBSERVE_UNKNOWN_MODE_CONTEXT
 *   2. alignment が unknown → fail OBSERVE_UNKNOWN_ALIGNMENT
 *   3. uncertainty が unknown → fail OBSERVE_UNKNOWN_UNCERTAINTY
 *   4. silenceBudget が unknown → fail OBSERVE_UNKNOWN_SILENCE_BUDGET
 *   5. patternCategory が unknown_category → fail OBSERVE_UNKNOWN_PATTERN_CATEGORY
 *   6. すべて known → passed: true
 *
 * 評価順序 (autonomous 設計判断):
 *   - CEO 指示順 (modeContext → alignment → uncertainty → silenceBudget → patternCategory)
 *     に従い、最初の fail axis で短絡 return (first-fail-wins)
 *   - 同じ outcome (STAY_SILENT) でも reason は **最初に検出された axis** を返す
 *     → reproducible / deterministic / 後段 telemetry で原因 axis を一意に識別可能
 *
 * No-Effect Contract:
 *   - pure / deterministic / side-effect-free
 *   - I/O / network / storage / DOM / event / timer / log 一切なし
 *   - input mutation なし
 *   - reason は MIRROR_STAY_SILENT_REASON const 経由のみ使用 (magic string 禁止)
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 / B-2 / B-3 / B-4a zero diff (本 file は read-only で型と定数を利用)
 *   - PII 受理なし (MirrorDecisionInput の宣言型を経由)
 */

import { MIRROR_STAY_SILENT_REASON } from "../decisionConstants";
import type { GateResult, MirrorDecisionInput } from "../types";

/**
 * Observe Gate — 観測の十分性を判定する pure function。
 *
 * 5 axis (modeContext + 4 bucket) のいずれかが unknown / unknown_category なら fail。
 * 全 known なら passed: true。
 *
 * @param input - {@link MirrorDecisionInput} (B-2 + B-3 + B-4 axes)
 * @returns {@link GateResult}
 *   - `{ passed: true }`: 全 axis known
 *   - `{ passed: false, reason }`: 最初に検出された unknown axis の reason
 *
 * @example
 *   checkObserveGate({ modeContext: { status: "known", ... }, ... 全 known })
 *     // → { passed: true }
 *
 *   checkObserveGate({ modeContext: { status: "unknown", ... }, ... })
 *     // → { passed: false, reason: "observe_gate_unknown_modeContext" }
 */
export function checkObserveGate(input: MirrorDecisionInput): GateResult {
  if (input.modeContext.status === "unknown") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT,
    };
  }

  if (input.alignment.status === "unknown") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_ALIGNMENT,
    };
  }

  if (input.uncertainty.status === "unknown") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_UNCERTAINTY,
    };
  }

  if (input.silenceBudget.status === "unknown") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_SILENCE_BUDGET,
    };
  }

  // patternCategory: bucket === "unknown_category" は status === "unknown" と等価
  // (B-3 PatternCategoryBucketResult discriminated union により型保証済)
  if (input.patternCategory.bucket === "unknown_category") {
    return {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_PATTERN_CATEGORY,
    };
  }

  return { passed: true };
}
