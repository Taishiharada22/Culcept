/**
 * uiOriginAnswerFactory — OP-3B (CEO 2026-05-05)
 *
 * UI origin clarify への user 回答 (= raw answer string) を、 origin clarify が
 * **active な文脈の時のみ** `resolve_place_candidate(slot=origin)` candidate
 * envelope に wrap する **pure factory**。
 *
 * CEO 2026-05-05 規律 — 文脈ガード必須:
 *   raw answer だけ受けると、 将来接続時に普通の発話まで origin answer として
 *   誤処理する危険がある (= 例: 普通の発話に「自宅」「ホテル」 が入っただけで
 *   resolve_place_candidate 候補化)。
 *
 *   そのため factory は **二重保護**:
 *     1. clarifySlot === "origin" でない → 空配列
 *     2. isOriginClarifyActive !== true → 空配列
 *     3. answer 空文字 → 空配列
 *     4. bindOriginAnswer(answer).bound !== true → 空配列
 *
 *   全条件 PASS → 1 envelope (= slot=origin、 label=bind 結果)
 *
 * priority / confidence (= OP-1 § 4.2):
 *   - priority 1000 (= UI 確定行為、 LLM 出力上書き OK)
 *   - source: ui_action
 *   - confidence: high
 *   - provenance: utterance (= user 明示回答)
 *
 * OP-3B 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は pure function (= 副作用なし、 input mutate しない)
 *   - answerBinder.ts は touch しない (= bindOriginAnswer を import で再利用)
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 4
 */

import type { Provenance } from "../eventSchema";
import { bindOriginAnswer } from "../answerBinder";
import type { ResolvePlaceCandidateOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape (= 文脈ガード必須)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UiOriginAnswerInput {
  /**
   * user の clarify answer raw string。
   * 空文字 → 空配列。
   */
  answer: string;

  /**
   * pendingClarify の slot。
   * "origin" 以外なら factory は空配列を返す (= origin 以外の clarify への
   * 回答は本 factory 対象外)。
   */
  clarifySlot:
    | "origin"
    | "end"
    | "where"
    | "when"
    | "what"
    | "transport"
    | "endpoint"
    | null;

  /**
   * origin clarify が active か。 二重保護の明示 flag。
   * **false なら factory は必ず空配列**を返す (= 普通の発話への誤発火防止)。
   */
  isOriginClarifyActive: boolean;

  /** 抽出 turn (= trace 用) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provenance (= UI 確定行為、 user 明示回答)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const UI_ANSWER_PROVENANCE: Provenance = {
  source_type: "utterance",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: true,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UI origin clarify 文脈で user の clarify answer を `resolve_place_candidate`
 * candidate envelope に wrap する。
 *
 * 文脈ガード (= 4 段階):
 *   1. clarifySlot !== "origin" → 空配列
 *   2. isOriginClarifyActive !== true → 空配列
 *   3. answer 空文字 → 空配列
 *   4. bindOriginAnswer(answer).bound !== true → 空配列
 *
 * 全 PASS → 1 envelope (= slot=origin、 label=bindOriginAnswer 結果)
 *
 * @param input answer + 文脈フラグ
 * @returns 0 or 1 件の envelope
 */
export function uiOriginAnswerFactory(
  input: UiOriginAnswerInput,
): OperationEnvelope<ResolvePlaceCandidateOperationCandidate>[] {
  // 1. clarifySlot !== "origin" → 空配列
  if (input.clarifySlot !== "origin") {
    return [];
  }

  // 2. isOriginClarifyActive !== true → 空配列
  if (input.isOriginClarifyActive !== true) {
    return [];
  }

  // 3. answer 空文字 → 空配列
  if (!input.answer) {
    return [];
  }

  // 4. bindOriginAnswer で normalize、 bound=false (= semantic_miss) → 空配列
  const bindResult = bindOriginAnswer(input.answer);
  if (!bindResult.bound) {
    return [];
  }

  const trace = input.sourceTurnIndex !== undefined
    ? { sourceTurnIndex: input.sourceTurnIndex, ruleId: "uiOriginAnswer" }
    : { ruleId: "uiOriginAnswer" };

  return [
    wrapOperation(
      {
        type: "resolve_place_candidate" as const,
        payload: {
          slot: "origin" as const,
          label: bindResult.label,
        },
      },
      {
        source: "ui_action",
        priority: 1000,
        confidence: "high",
        provenance: UI_ANSWER_PROVENANCE,
        trace,
      },
    ),
  ];
}
