/**
 * PlanOperation — LLM の意図表明 / コード側の状態遷移単位
 *
 * CEO 2026-04-30 PR-50 directive (GPT 提唱、CEO 採用):
 *   設計思想:
 *     - **予定内容の理解 = LLM** (raw utterance → 意図 + 内容抽出)
 *     - **状態遷移の安全性 = コード** (operation を validate + dispatch)
 *
 *   旧設計 (PR #41a〜#47):
 *     LLM 出力 = events[] (現在の plan 全体)
 *     コード = events[] を既存 plan に merge (turn_mode / 同一性判定で)
 *     問題: LLM が events[] を出すたびに 既存 + 新規 が混じる → 重複
 *
 *   新設計 (PR-50):
 *     LLM 出力 = operations[] (今 turn の意図のみ)
 *       - append: 新規予定追加
 *       - modify: 既存予定の slot 修正
 *       - answer: pendingClarify への回答
 *       - noop: 予定変更を伴わない発話 (挨拶等)
 *     コード = operations[] を validate + dispatch (既存 plan を operation に従って遷移)
 *
 *   利点:
 *     - LLM の責務が「今 turn の意図」 のみ → 過去予定再生成しない
 *     - operation 単位で validate / dispatch → 状態遷移が確定的
 *     - LLM が間違った operation を出しても validation 層で reject
 *
 * 移行戦略:
 *   PR-50 では LLM が **両方** return 可能 (operations[] 主、events[] fallback):
 *     - LLM が operations[] を出して validation 通過 → operations 経路
 *     - LLM が operations[] 出さない / validation fail → events[] 経路 (legacy)
 *   実機検証で operation 解釈率 ≥ 90% 確認後、events[] fallback を撤去 (PR-52+)。
 */

import type {
  Event,
  WhenSlot,
  WhereSlot,
  WhatSlot,
  TimeHintValue,
  Certainty,
  Provenance,
} from "./eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventDraft — event_id 未発番の event (LLM 出力時の append 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * append operation で LLM が出力する「event の draft」。
 * - event_id は dispatch で fresh 発番される (LLM は触らない、衝突回避)
 * - missing_semantic_critical / missing_solver_blockers は dispatch で再計算
 */
export interface EventDraft {
  /** turn_mode は append 時 always "append" だが、明示性のため field 持つ */
  turn_mode?: "append";
  when: WhenSlot;
  where: WhereSlot;
  what: WhatSlot;
  who: string[];
  transport: string | null;
  certainty: Certainty;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventPatch — modify operation の slot 別 patch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * modify operation で LLM が出力する「prior event への slot 別変更」。
 * 各 field は optional。値が指定された field のみ override される。
 *
 * 注意:
 *   - LLM は cur.what.activity に command 文字列 ("9時を10時に変更") を入れがち
 *   - PR-46 で applyModifyPatch は where/what/who を override しない契約に変更済
 *   - PR-50 (operation 化) でも同契約を踏襲: patch.what / patch.where は受けるが
 *     dispatch 側で慎重に扱う (時刻変更 / 移動手段変更が主用途)
 */
export interface EventPatch {
  when?: {
    startTime?: string | null;
    endTime?: string | null;
    timeHint?: TimeHintValue | null;
    provenance?: Provenance;
  };
  where?: {
    place_ref?: string | null;
    placeType?: string | null;
    provenance?: Provenance;
  };
  what?: {
    activity?: string;
    activityCanonical?: string;
    provenance?: Provenance;
  };
  transport?: string | null;
  who?: string[];
  certainty?: Certainty;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanOperation — 4 種の意図単位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * append — 新規予定追加。
 *
 * 例:
 *   utterance: 「12時に新宿で高橋とランチ」
 *   operation: { type: "append", eventDraft: { when: 12:00, where: 新宿, what: ランチ, who: [高橋] } }
 *
 * dispatch 動作:
 *   - 新 event_id を発番 (衝突回避: generateNonCollidingEventId)
 *   - prior events に push (既存を touch しない)
 */
export interface AppendOperation {
  type: "append";
  eventDraft: EventDraft;
}

/**
 * modify — 既存予定の slot 修正。
 *
 * 例:
 *   utterance: 「9時を10時に変更」
 *   operation: { type: "modify", targetRef: "9時の予定", patch: { when: { startTime: "10:00" } } }
 *
 *   utterance: 「移動手段を車に変更」
 *   operation: { type: "modify", targetRef: "今日の予定", patch: { transport: "車" } }
 *
 * dispatch 動作:
 *   - resolveTargetRef(targetRef, priorEvents) で target event を特定
 *   - 解決失敗 + prior 1 件 → single_event_fallback で apply
 *   - 解決失敗 + prior 複数 → reject (validation で弾く)
 *   - applyModifyPatch(target, patch) で intentional update
 */
export interface ModifyOperation {
  type: "modify";
  targetRef: string;
  patch: EventPatch;
}

/**
 * answer — pendingClarify への回答。
 *
 * 例:
 *   pendingClarify: { event_id: "e1", slot: "where", question: "どのあたり？" }
 *   utterance: 「池袋」
 *   operation: { type: "answer", slot: "where", value: "池袋" }
 *
 * dispatch 動作:
 *   - pendingClarify の event_id + slot に value を bind
 *   - bindAnswerToSlot 経路を再利用
 *   - bind 失敗 → reject (validation で弾く、LLM 経路 fallback)
 */
export interface AnswerOperation {
  type: "answer";
  slot: "when" | "where" | "what" | "transport" | "endpoint";
  value: string;
}

/**
 * noop — 予定変更を伴わない発話。
 *
 * 例:
 *   utterance: 「ありがとう」「OK」「いいね」
 *   operation: { type: "noop", reason: "acknowledgement" }
 *
 *   utterance: 「今日の状態は？」 (= 状態確認、plan 変更しない)
 *   operation: { type: "noop", reason: "status_query" }
 *
 * dispatch 動作:
 *   - 何もしない (events を一切 touch しない)
 *   - response message は LLM が別途生成 (or 既存 narration)
 */
export interface NoopOperation {
  type: "noop";
  reason?: "acknowledgement" | "status_query" | "off_topic" | "other";
}

/**
 * PlanOperation — LLM が出力する意図単位の union。
 *
 * 1 turn に複数 operation を出せる:
 *   utterance: 「9時を10時に変更、ついでに池袋でランチも追加」
 *   operations: [
 *     { type: "modify", targetRef: "9時の予定", patch: { when: { startTime: "10:00" } } },
 *     { type: "append", eventDraft: { when: timeHint:"noon", where: 池袋, what: ランチ } }
 *   ]
 */
export type PlanOperation =
  | AppendOperation
  | ModifyOperation
  | AnswerOperation
  | NoopOperation;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 出力 schema (operations + events fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM 出力の structured schema (PR-50 移行期間).
 *
 * 移行戦略:
 *   - LLM は **両方** return 可能 (operations 主、events fallback)
 *   - コード側で operations 解釈 → validation 通過 → operations 経路
 *   - 失敗 / 不在 → events 経路 (legacy)
 *
 * 実機検証で operation 解釈率 ≥ 90% 確認後、events fallback を撤去 (PR-52+)。
 */
export interface ComprehensionResultWithOperations {
  /** 全体の targetDate (today / tomorrow / YYYY-MM-DD) */
  targetDate: string;
  /**
   * PR-50 主経路: operation 単位で意図を表現。
   * undefined or 空 → events[] fallback 経路へ。
   */
  operations?: PlanOperation[];
  /** 既存 schema (legacy fallback、PR-52+ で撤去予定) */
  events: Event[];
  /** 既存 fields */
  startPoint: {
    place_ref: string | null;
    provenance: Provenance;
  } | null;
  departureTime: {
    value: string | null;
    provenance: Provenance;
  } | null;
  goOut: boolean | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation 結果型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * validatePlanOperation の戻り値。
 *
 * accepted: dispatch で適用可能
 * rejected: コード側で弾く (events[] fallback or noop)
 */
export type OperationValidationResult =
  | { accepted: true; operation: PlanOperation }
  | {
      accepted: false;
      reason:
        | "append_with_target_ref" // append なのに targetRef を持つ → 矛盾
        | "modify_target_unresolved" // modify の targetRef が prior に解決できない
        | "modify_no_patch" // modify の patch が空 (何も変更しない)
        | "answer_no_pending_clarify" // answer なのに pendingClarify が無い
        | "answer_slot_mismatch" // answer.slot が pendingClarify.slot と不一致
        | "answer_empty_value" // answer.value が空
        | "append_empty_draft" // append の eventDraft が空 (when/where/what 全 null)
        | "unknown_type"; // schema 外の type
      operation: PlanOperation; // 元の operation (debug 用)
    };
