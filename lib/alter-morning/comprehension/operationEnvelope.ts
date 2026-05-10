/**
 * OperationEnvelope — OP-2 (CEO 2026-05-05)
 *
 * `PlanOperationCandidate` に source / priority / confidence / provenance / trace を
 * 付与する envelope 型 + factory helper。
 *
 * 設計原則:
 *   - generic param は **`PlanOperationCandidate` 専用** (= 既存 `PlanOperation` を包まない)
 *   - factory は pure function (= 副作用なし)
 *   - dispatcher / legacyAdapter に **接続しない**
 *
 * Source 別 priority (= OP-1 doc § 4 で定義、 dispatcher reduce に使用):
 *
 *   | Source                | Priority | 役割                                   |
 *   |-----------------------|----------|----------------------------------------|
 *   | ui_action             | 1000     | user 確定行為、 LLM 出力上書き OK     |
 *   | code_history          | 900      | prior plan の user_override 継承       |
 *   | caller_request        | 850-1000 | UI/route 明示要求                      |
 *   | llm_explicit          | 700      | utterance 由来明示                     |
 *   | llm_inferred          | 500-700  | LLM 推論                               |
 *   | regex_deterministic   | 500-700  | 限定構文での deterministic 抽出        |
 *   | code_history (prev)   | 400      | previous day plan 継承 (文脈継続)      |
 *   | code_location         | 100      | currentLat-Lng / registered_home       |
 *   | system_default        | 100      | 上位 source 全 unknown 時の最終 fallback |
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3.3 / § 4
 */

import type { PlanOperationCandidate } from "./planOperationCandidate";
import type { Provenance } from "./eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source / Confidence enum
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Operation の発生源。 OP-1 § 1 で定義した 8 種。
 *
 * - llm_explicit:        LLM 出力 (= 高 confidence、 utterance 由来明示)
 * - llm_inferred:        LLM 推論 (= 中 confidence、 utterance から推論)
 * - regex_deterministic: regex 抽出 (= 限定構文での deterministic 抽出)
 * - code_history:        履歴 (= prior plan / previous day plan)
 * - code_location:       location service (= currentLat-Lng / registered_home)
 * - ui_action:           user UI 操作 (= candidate tap / clarify answer、 最高信頼)
 * - caller_request:      caller (= route.ts) からの明示要求
 * - system_default:      上位 source 全 unknown 時の最終 fallback (= dispatcher が pipeline 内で生成)
 */
export type OperationSource =
  | "llm_explicit"
  | "llm_inferred"
  | "regex_deterministic"
  | "code_history"
  | "code_location"
  | "ui_action"
  | "caller_request"
  | "system_default";

/**
 * Operation の確信度。 dispatcher の tie-break に使用。
 */
export type OperationConfidence = "high" | "medium" | "low";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trace
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * envelope に optional 付与する trace 情報。 観測 / debug 用。
 *
 * - matchedSpan:     抽出元 utterance の span (= 「東京駅から渋谷へ」 等)
 * - sourceTurnIndex: 抽出 turn (= 過去 turn からの継承の場合は元 turn の index)
 * - ruleId:          regex / code rule の識別子 (= 「fromToTravel」 等)
 */
export interface OperationTrace {
  matchedSpan?: string;
  sourceTurnIndex?: number;
  ruleId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Envelope (= candidate 専用 generic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `PlanOperationCandidate` に source / priority / confidence / provenance / trace を
 * 付与した envelope。
 *
 * 規律:
 *   - generic param は **`PlanOperationCandidate` 専用** (= 既存 `PlanOperation` を包まない)
 *   - 既存 `PlanOperation` (= append / modify / answer / noop) は本 envelope の対象外
 *   - dispatcher は OP-2 では本 envelope を受け取らない (= 未接続)
 *
 * 使用例 (= OP-3 以降で具体的に使用):
 *   const op: SetTargetDateOperationCandidate = { type: "set_target_date", payload: { date: "tomorrow" } };
 *   const envelope = wrapOperation(op, {
 *     source: "llm_explicit", priority: 700, confidence: "high",
 *     provenance: { source_type: "utterance", source_span: ["明日"], provenance_confidence: "high", from_utterance: true },
 *   });
 *   // envelope.type === "set_target_date"
 *   // envelope.source === "llm_explicit"
 */
export type OperationEnvelope<
  T extends PlanOperationCandidate = PlanOperationCandidate,
> = T & {
  source: OperationSource;
  priority: number;
  confidence: OperationConfidence;
  provenance: Provenance;
  trace?: OperationTrace;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * envelope 作成用 metadata。
 */
export interface OperationEnvelopeMeta {
  source: OperationSource;
  priority: number;
  confidence: OperationConfidence;
  provenance: Provenance;
  trace?: OperationTrace;
}

/**
 * `PlanOperationCandidate` に envelope を被せる pure factory。
 *
 * 副作用なし。 dispatcher / legacyAdapter から呼ばれない (= OP-2 では未接続)。
 *
 * @param op   wrap する candidate operation
 * @param meta envelope metadata (= source / priority / confidence / provenance / trace)
 * @returns    `OperationEnvelope<T>` (= op の type を保持した envelope)
 */
export function wrapOperation<T extends PlanOperationCandidate>(
  op: T,
  meta: OperationEnvelopeMeta,
): OperationEnvelope<T> {
  return { ...op, ...meta };
}
