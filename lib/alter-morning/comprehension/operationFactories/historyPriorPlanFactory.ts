/**
 * historyPriorPlanFactory — OP-3B (CEO 2026-05-05)
 *
 * caller が取得済の `priorPlan` (= 当日の plan turn 跨ぎ継承) と `samePlanDate`
 * flag を input として受け、 STRONG_PRIOR_ORIGIN_SOURCES に該当する prior origin
 * を `set_journey_origin` candidate envelope に wrap する **pure factory**。
 *
 * 設計原則 (CEO 2026-05-05 規律):
 *   - factory 内で **DB / Supabase / fetch / async I/O を一切呼ばない**
 *   - caller が取得済の priorPlan を input 経由で受ける (= legacyAdapter が input.priorPlan で持つ)
 *   - 既存 helper `preserveStrongPriorOrigin` (= pure) を呼ぶだけ
 *
 * priority / confidence (= OP-1 § 4.2):
 *   - priority 900 (= STRONG_PRIOR_ORIGIN_SOURCES、 same-plan で守るべき prior)
 *   - source: code_history
 *   - confidence: high (= user_override / user_declared 等の継承)
 *   - provenance: priorPlan.journeyOrigin の provenance を継承可能 (= ただし
 *     JourneyAnchorState には provenance field がないため、 defensive で inferred)
 *
 * 動作:
 *   - priorPlan null → 空配列
 *   - samePlanDate=false → 空配列 (= 別日 plan は弱い fallback、 priorPlan factory 出さない)
 *   - priorPlan.journeyOrigin が unknown → 空配列
 *   - priorPlan.journeyOrigin.source が STRONG_PRIOR_ORIGIN_SOURCES に含まれない → 空配列
 *   - 全 PASS → 1 envelope
 *
 * OP-3B 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は pure function
 *   - anchorState.ts は touch しない (= preserveStrongPriorOrigin を import で再利用)
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 4.2
 */

import type { MorningPlan } from "../../types";
import type { Provenance } from "../eventSchema";
import { preserveStrongPriorOrigin } from "../../journey/anchorState";
import type { SetJourneyOriginOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HistoryPriorPlanInput {
  /**
   * caller が DB / state から取得済の prior plan (= 当日 plan の turn 跨ぎ継承)。
   * legacyAdapter の input.priorPlan に該当。
   */
  priorPlan: MorningPlan | null | undefined;

  /**
   * priorPlan.date === currentPlanDate か。
   * 別日 plan の prior は弱い fallback として扱うので samePlanDate=false なら
   * factory は空配列を返す (= 既存 preserveStrongPriorOrigin の規律踏襲)。
   */
  samePlanDate: boolean;

  /** 抽出 turn (= trace 用) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defensive provenance (= history 由来は inferred、 JourneyAnchorState に
// provenance field が存在しないため defensive default)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HISTORY_PRIOR_PROVENANCE: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: false,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * priorPlan の journeyOrigin が STRONG_PRIOR_ORIGIN_SOURCES に該当する場合、
 * `set_journey_origin` candidate envelope を 1 件返す。
 *
 * 内部で `preserveStrongPriorOrigin(...)` を呼ぶ。 該当しなければ null が返るので
 * factory は空配列を返す。
 *
 * @param input priorPlan + samePlanDate
 * @returns 0 or 1 件の envelope
 */
export function historyPriorPlanFactory(
  input: HistoryPriorPlanInput,
): OperationEnvelope<SetJourneyOriginOperationCandidate>[] {
  if (!input.priorPlan) {
    return [];
  }

  const preserved = preserveStrongPriorOrigin(input.priorPlan.journeyOrigin, {
    samePlanDate: input.samePlanDate,
  });

  if (!preserved) {
    return [];
  }

  const trace = input.sourceTurnIndex !== undefined
    ? { sourceTurnIndex: input.sourceTurnIndex, ruleId: "historyPriorPlan" }
    : { ruleId: "historyPriorPlan" };

  return [
    wrapOperation(
      {
        type: "set_journey_origin" as const,
        payload: preserved,
      },
      {
        source: "code_history",
        priority: 900,
        confidence: "high",
        provenance: HISTORY_PRIOR_PROVENANCE,
        trace,
      },
    ),
  ];
}
