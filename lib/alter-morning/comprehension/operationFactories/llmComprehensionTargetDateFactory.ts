/**
 * llmComprehensionTargetDateFactory — OP-3A (CEO 2026-05-05)
 *
 * LLM comprehension が抽出した targetDate を `set_target_date` operation candidate に
 * wrap する **pure factory**。
 *
 * 設計原則 (CEO 2026-05-05 規律):
 *   - **provenance なし → 空配列** (= operation を出さない)
 *   - **`targetDate` string の存在だけで operation を出さない**
 *   - その targetDate が user utterance 由来だと **説明できる時だけ** 出す
 *
 *   理由:
 *     既存 LLM comprehension では `targetDate` が常に存在する可能性がある (= LLM が
 *     default 的に "today" を出す等)。 ユーザーが日付を明示していない値まで
 *     `set_target_date` candidate として出すと、 OP-1 § 0 で問題視した
 *     「targetDate wire bug」 を別形で再発させる。
 *
 * provenance.source_type 別の挙動:
 *   - "utterance"   → llm_explicit / priority 700 / confidence high
 *   - "inferred"    → llm_inferred / priority 500 / confidence medium
 *   - "baseline"    → 空配列 (= LLM context での意味が曖昧、 defensive)
 *   - "tool"        → 空配列 (= 同上)
 *   - 未指定 / null → 空配列
 *
 * OP-3A 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は **pure function** (= 副作用なし、 同じ input で同じ output)
 *   - input mutate しない
 *   - LLM provider / active L1_COMPREHENSION_SCHEMA は touch しない
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 */

import type { Provenance } from "../eventSchema";
import type { SetTargetDateOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LlmComprehensionTargetDateInput {
  /**
   * LLM が抽出した targetDate。
   * "today" / "tomorrow" / "day_after_tomorrow" / "YYYY-MM-DD" / null。
   * null や空文字なら factory は空配列を返す (= operation 出さない)。
   */
  targetDate: string | null;

  /**
   * 抽出 provenance。
   *
   * **重要**: provenance が無い / null の場合は operation を出さない (= 空配列)。
   * これは「targetDate が LLM default 値 (= 「今日」 等) として入っている可能性」 を
   * 排除するための CEO 規律。
   */
  provenance?: Provenance | null;

  /** 抽出 turn (= trace 用、 optional) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM comprehension の targetDate を `set_target_date` candidate envelope に wrap する。
 *
 * 出力条件 (= 全部満たす場合のみ 1 envelope を返す):
 *   - input.targetDate が non-null で空文字でない
 *   - input.provenance が non-null
 *   - input.provenance.source_type が "utterance" または "inferred"
 *
 * いずれかを満たさない場合 → 空配列 (= operation 出さない)。
 *
 * @param input LLM 出力 + 抽出 metadata
 * @returns 0 or 1 件の envelope (= 配列、 dispatcher が均一に reduce する形式)
 */
export function llmComprehensionTargetDateFactory(
  input: LlmComprehensionTargetDateInput,
): OperationEnvelope<SetTargetDateOperationCandidate>[] {
  // CEO 規律: targetDate string の存在だけで operation を出さない
  if (!input.targetDate) {
    return [];
  }

  // CEO 規律: provenance なし → 空配列 (= LLM default 値の混入排除)
  if (!input.provenance) {
    return [];
  }

  const provenance = input.provenance;

  // utterance 由来 = 高 priority / 高 confidence
  if (provenance.source_type === "utterance") {
    return [
      wrapOperation(
        {
          type: "set_target_date",
          payload: { date: input.targetDate },
        },
        {
          source: "llm_explicit",
          priority: 700,
          confidence: "high",
          provenance,
          ...(input.sourceTurnIndex !== undefined
            ? { trace: { sourceTurnIndex: input.sourceTurnIndex } }
            : {}),
        },
      ),
    ];
  }

  // inferred 由来 = 低 priority / 中 confidence
  if (provenance.source_type === "inferred") {
    return [
      wrapOperation(
        {
          type: "set_target_date",
          payload: { date: input.targetDate },
        },
        {
          source: "llm_inferred",
          priority: 500,
          confidence: "medium",
          provenance,
          ...(input.sourceTurnIndex !== undefined
            ? { trace: { sourceTurnIndex: input.sourceTurnIndex } }
            : {}),
        },
      ),
    ];
  }

  // baseline / tool / 未知 → 空配列 (= defensive、 LLM 文脈で意味曖昧)
  return [];
}
