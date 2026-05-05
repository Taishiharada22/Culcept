/**
 * regexTargetDateFactory — OP-3A (CEO 2026-05-05)
 *
 * `extractTargetDate(utterance)` の deterministic 出力を `set_target_date` operation
 * candidate に wrap する **pure factory**。
 *
 * 設計原則:
 *   - input.utterance を `extractTargetDate` (intentParser.ts) に渡すだけ
 *   - 結果が undefined → 空配列 (= 「明日 / 明後日」 等の signal なし)
 *   - 結果あり → 1 envelope (= regex_deterministic / priority 600 / confidence high)
 *
 * provenance:
 *   - extractTargetDate は「明日」「明後日」 等の deterministic regex match で抽出
 *   - これは utterance 由来の確実な signal なので provenance.source_type = "utterance"
 *   - source_span は extractTargetDate が個別 span を返さないため空配列で defensive
 *
 * OP-3A 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は **pure function** (= 副作用なし)
 *   - intentParser.ts の `extractTargetDate` 関数 body は touch しない (= export 修飾子追加のみ)
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 */

import { extractTargetDate } from "../../intentParser";
import type { Provenance } from "../eventSchema";
import type { SetTargetDateOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RegexTargetDateInput {
  /**
   * 解析対象 utterance。
   * 空文字 / 「明日 / 今日 / 明後日」 等 signal なし → factory は空配列を返す。
   */
  utterance: string;

  /** 抽出 turn (= trace 用、 optional) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `extractTargetDate(input.utterance)` を呼び、 deterministic な日付 signal を
 * `set_target_date` candidate envelope に wrap する。
 *
 * 動作:
 *   - utterance 空 → 空配列
 *   - extractTargetDate が undefined → 空配列 (= 「今日」 含め signal なし、
 *     intentParser:911 で「今日」 は明示的に undefined を返す既存挙動を踏襲)
 *   - 結果 string あり → 1 envelope
 *
 * envelope 値:
 *   - source: regex_deterministic
 *   - priority: 600
 *   - confidence: high (= deterministic match)
 *   - provenance: utterance, source_span [] (= extractTargetDate は個別 span 不返却)
 *
 * @param input utterance + sourceTurnIndex (= optional)
 * @returns 0 or 1 件の envelope (= 配列)
 */
export function regexTargetDateFactory(
  input: RegexTargetDateInput,
): OperationEnvelope<SetTargetDateOperationCandidate>[] {
  if (!input.utterance) {
    return [];
  }

  const date = extractTargetDate(input.utterance);
  if (date === undefined) {
    return [];
  }

  const provenance: Provenance = {
    source_type: "utterance",
    source_span: [],
    provenance_confidence: "high",
    from_utterance: true,
  };

  return [
    wrapOperation(
      {
        type: "set_target_date",
        payload: { date },
      },
      {
        source: "regex_deterministic",
        priority: 600,
        confidence: "high",
        provenance,
        ...(input.sourceTurnIndex !== undefined
          ? { trace: { sourceTurnIndex: input.sourceTurnIndex, ruleId: "extractTargetDate" } }
          : { trace: { ruleId: "extractTargetDate" } }),
      },
    ),
  ];
}
