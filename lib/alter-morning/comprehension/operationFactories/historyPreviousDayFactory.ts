/**
 * historyPreviousDayFactory — OP-3B (CEO 2026-05-05)
 *
 * caller が `fetchPreviousDayPlan` を呼んだ後の `previousDayPlan` を input として
 * 受け、 前日 plan の journeyEnd を翌朝 origin の inference 材料に変換した
 * `set_journey_origin` candidate envelope に wrap する **pure factory**。
 *
 * 設計原則 (CEO 2026-05-05 規律):
 *   - factory 内で **`fetchPreviousDayPlan` (= async + Supabase) を呼ばない**
 *   - caller が取得済の MorningPlan を input 経由で受ける
 *   - 既存 helper `previousEndToOrigin` (= pure) を呼ぶだけ
 *   - 既存 helper `isAssumedAnchor` (= pure) で confirmed/assumed を分けて priority 振り分け
 *
 * priority / confidence (= OP-1 § 4.2):
 *   - confirmed (= source != default_round_trip_*): priority 400 / confidence medium
 *   - assumed (= source == previous_day_assumed_endpoint): priority 300 / confidence low
 *   - source: code_history
 *   - provenance: inferred (= 前日由来の推論材料)
 *
 * 動作:
 *   - previousDayPlan null / undefined → 空配列
 *   - previousDayPlan.journeyEnd が unknown → 空配列
 *   - previousEndToOrigin が null (= cascade guard 等) → 空配列
 *   - 変換成功 → 1 envelope (= confirmed/assumed で priority 振り分け)
 *
 * OP-3B 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は pure function
 *   - anchorState.ts / planHistory.ts は touch しない
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 4.2
 */

import type { MorningPlan } from "../../types";
import type { Provenance } from "../eventSchema";
import {
  previousEndToOrigin,
  isAssumedAnchor,
} from "../../journey/anchorState";
import type { SetJourneyOriginOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HistoryPreviousDayInput {
  /**
   * caller が `fetchPreviousDayPlan` を呼んだ後の plan。
   * factory は **fetch しない**。 既に取得済の MorningPlan を受ける。
   */
  previousDayPlan: MorningPlan | null | undefined;

  /** 抽出 turn (= trace 用) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defensive provenance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HISTORY_PREVIOUS_DAY_PROVENANCE: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "medium",
  from_utterance: false,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 前日 plan の journeyEnd を翌朝 origin の inference 材料として
 * `set_journey_origin` candidate envelope に変換する。
 *
 * 内部で `previousEndToOrigin(...)` を呼ぶ。 cascade guard 等で null が返れば
 * factory は空配列を返す。
 *
 * confirmed / assumed の判定:
 *   - 変換後の anchor が `isAssumedAnchor()` で true → assumed (= priority 300)
 *   - false → confirmed (= priority 400)
 *
 * @param input previousDayPlan
 * @returns 0 or 1 件の envelope
 */
export function historyPreviousDayFactory(
  input: HistoryPreviousDayInput,
): OperationEnvelope<SetJourneyOriginOperationCandidate>[] {
  if (!input.previousDayPlan) {
    return [];
  }

  const inheritedOrigin = previousEndToOrigin(input.previousDayPlan.journeyEnd);

  if (!inheritedOrigin) {
    return [];
  }

  // assumed (= previous_day_assumed_endpoint) は priority 300、 それ以外は 400
  const isAssumed = isAssumedAnchor(inheritedOrigin);
  const priority = isAssumed ? 300 : 400;
  const confidence: "low" | "medium" = isAssumed ? "low" : "medium";

  const trace = input.sourceTurnIndex !== undefined
    ? { sourceTurnIndex: input.sourceTurnIndex, ruleId: "historyPreviousDay" }
    : { ruleId: "historyPreviousDay" };

  return [
    wrapOperation(
      {
        type: "set_journey_origin" as const,
        payload: inheritedOrigin,
      },
      {
        source: "code_history",
        priority,
        confidence,
        provenance: HISTORY_PREVIOUS_DAY_PROVENANCE,
        trace,
      },
    ),
  ];
}
