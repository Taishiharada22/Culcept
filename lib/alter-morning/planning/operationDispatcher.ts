/**
 * Operation Dispatcher — PR-50 Commit 4 (CEO 2026-04-30)
 *
 * Goal:
 *   `acceptedOperations` (validation 通過済) を **既存 primitive を再利用**して
 *   plan state (effectiveEvents) に反映する thin dispatch layer。
 *
 * 設計原則 (CEO 確定):
 *   - **再利用**: applyModifyPatchFromOperation / generateNonCollidingEventId /
 *                 bindAnswerToSlot / resolveTargetRef を呼ぶだけ
 *   - **pure**: 副作用なし、env / flag を読まない
 *   - **observable**: dispatch[] で各 operation の判断経路を返す (trace 用)
 *   - **defensive**: validation を通過していても、bind 失敗等は priorPersistedEvents
 *                    を保持して safe に倒す (data loss 防止)
 *
 * 7 つの必須条件 (CEO 2026-04-30) と本 dispatcher の対応:
 *   1. accepted のみ operation path → caller (legacyAdapter) が fallbackToEvents
 *      を見て分岐。本 dispatcher は accepted 前提で動く
 *   2. invalid → events[] fallback → caller の責務
 *   3. append は既存 event を上書きしない → priorCopy を touch せず newEvents に
 *      push、id 衝突は generateNonCollidingEventId で rename
 *   4. modify は target の指定 field だけ patch → applyModifyPatchFromOperation
 *      が when / transport のみ override (PR-46 contract、Commit 4 暫定)
 *   5. answer は pendingClarify がある時だけ bind → validation で
 *      answer_no_pending_clarify reject 済 + dispatcher 内で defensive null check
 *   6. noop は state を変更しない → priorPersistedEvents をそのまま流す
 *   7. dispatch 後 reconcileEffectiveEvents → caller (legacyAdapter) の責務
 *
 * answer operation の位置づけ (CEO 2026-04-30):
 *   **secondary safety path**。主経路は route.ts Branch A の bindAnswerToSlot
 *   (LLM bypass の高速 path)。Branch A 成功時は operations が空なので本
 *   dispatcher には来ない。Branch B で LLM が answer operation を出した場合
 *   のみ補助的に本 dispatcher の answer case で bind を行う。
 */

import type { Event } from "../comprehension/eventSchema";
import type { PlanOperation } from "../comprehension/planOperation";
import type { PendingClarify } from "../types";
import { bindAnswerToSlot } from "../comprehension/answerBinder";
import {
  applyModifyPatchFromOperation,
  generateNonCollidingEventId,
} from "./eventMergeDispatch";
import { resolveTargetRef } from "./modifyRouter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OperationDispatchInput {
  /** validatePlanOperations を通過した operations。順序は LLM 出力順を尊重 */
  acceptedOperations: PlanOperation[];
  /** 前 turn の persisted events (modify target / answer event 解決の起点) */
  priorPersistedEvents: Event[];
  /**
   * 当 turn 開始時の pendingClarify。
   * answer operation の bind 先解決に使う。
   * Branch B 経由で route.ts → morningPipeline → legacyAdapter まで流れてくる値。
   */
  priorPendingClarify: PendingClarify | null;
}

/**
 * 各 operation の dispatch 結果 (trace / debug 用)。
 *
 * action 列挙:
 *   - "appended": append が新 event として追加
 *   - "appended_renamed": append の id 衝突で fresh id にrename
 *   - "modify_applied": modify が target に解決され patch 適用
 *   - "modify_single_event_fallback": prior 1 件で targetRef 解決失敗 → 単一
 *     event に強制 apply (validation 層と同じ contract)
 *   - "modify_unresolved": validation 層通過後に解決失敗 → state 不変
 *     (defensive、通常は到達しない)
 *   - "answer_bound": bindAnswerToSlot が bound=true で events を更新
 *   - "answer_bind_skipped": pendingClarify が null → state 不変
 *     (validation で reject 済のはずだが defensive)
 *   - "answer_bind_failed": bindAnswerToSlot が bound=false (semantic_miss /
 *     system_miss) → state 不変
 *   - "noop": state 不変
 */
export type OperationAction =
  | "appended"
  | "appended_renamed"
  | "modify_applied"
  | "modify_single_event_fallback"
  | "modify_unresolved"
  | "answer_bound"
  | "answer_bind_skipped"
  | "answer_bind_failed"
  | "noop";

export interface OperationDispatchDecision {
  /** operation の type */
  type: PlanOperation["type"];
  action: OperationAction;
  /** modify / answer の解決 target event_id */
  target_event_id?: string;
  /** modify resolveTargetRef の strategy / confidence */
  strategy?: string;
  confidence?: string | null;
  /** answer のbind 失敗 reason ("semantic_miss" / "system_miss") */
  bindReason?: string;
  /** append で fresh id にrename された場合の新 id */
  renamed_to?: string;
}

export interface OperationDispatchResult {
  /** dispatch 後の events (= effectiveEvents) */
  effectiveEvents: Event[];
  /** 各 operation の dispatch 判断 */
  dispatch: OperationDispatchDecision[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventDraft → Event 変換 (append 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `EventDraft` (LLM 出力の append 単位) を `Event` 型に変換する。
 *
 * 補完する fields:
 *   - **event_id**: caller が生成した fresh id を渡す
 *   - **turn_mode**: "append" 固定 (downstream legacyAdapter / dispatchEventMerge
 *     との互換性のため)
 *   - **target_ref / target_ref_confidence / change_scope**: append には不要、null
 *   - **missing_semantic_critical**: slot 値から再計算
 *     (when.startTime/timeHint 両方 null → "when" / where.place_ref null → "where" /
 *      what.activity 空 → "what")
 *   - **missing_solver_blockers**: 当層では計算しない (downstream の planning 層
 *     が再計算する。append draft は schema 上 transport / endpoint 等の solver
 *     blocker 情報を持たないため、空配列で埋めて downstream に委ねる)
 */
function eventDraftToEvent(
  draft: PlanOperation & { type: "append" },
  fresh_id: string,
): Event {
  const d = draft.eventDraft;
  const missing: ("when" | "where" | "what")[] = [];
  if (d.when.startTime == null && d.when.timeHint == null) missing.push("when");
  if (d.where.place_ref == null || d.where.place_ref.trim() === "") {
    missing.push("where");
  }
  if (!d.what.activity || d.what.activity.trim() === "") missing.push("what");

  return {
    event_id: fresh_id,
    turn_mode: "append",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: d.when,
    where: d.where,
    what: d.what,
    who: d.who,
    transport: d.transport,
    certainty: d.certainty,
    missing_semantic_critical: missing,
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dispatchOperations (public)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * accepted operations を順序通り apply して effectiveEvents を構築する。
 *
 * 動作:
 *   1. priorCopy = [...priorPersistedEvents] を mutable list として保持
 *      (modify で patch、answer で bind される)
 *   2. newEvents = [] (append 専用、priorCopy に influence しない)
 *   3. 各 operation を順に処理:
 *      - append: id 発行 → eventDraftToEvent → newEvents.push
 *      - modify: resolveTargetRef → 解決失敗 + 単一 event なら fallback、
 *                それ以外で解決失敗なら state 不変 (defensive)
 *                解決成功 → applyModifyPatchFromOperation で priorCopy 更新
 *      - answer: pendingClarify null → skip (defensive、validation で reject 済)
 *                bindAnswerToSlot → bound=true なら現在の event 配列 (priorCopy +
 *                newEvents) に対して bind、bound=false なら state 不変
 *      - noop: state 不変
 *   4. 結果: effectiveEvents = priorCopy + newEvents (answer の bind は両方に作用)
 *
 * 1 turn 複数 operation の順序 (CEO 2026-04-30 暫定):
 *   LLM 出力 order を尊重する。混在 case (e.g., modify + append) で順序の重要性
 *   が判明したら別 PR で検討。
 */
export function dispatchOperations(
  input: OperationDispatchInput,
): OperationDispatchResult {
  const priorCopy: Event[] = [...input.priorPersistedEvents];
  const newEvents: Event[] = [];
  const dispatch: OperationDispatchDecision[] = [];

  // answer 経路で events を更新するための helper:
  //   priorCopy と newEvents の組み合わせを bindAnswerToSlot に渡す。
  //   bind 後、event_id が priorCopy / newEvents どちらに属するかで配置を戻す。
  //   bindAnswerToSlot は対象 event 1 件だけを update する invariant を持つ
  //   (answerBinder.ts L340-356)。それを利用して in-place 反映する。
  const applyBindToLists = (boundEvents: Event[]): void => {
    for (let i = 0; i < boundEvents.length; i++) {
      if (i < priorCopy.length) {
        priorCopy[i] = boundEvents[i];
      } else {
        newEvents[i - priorCopy.length] = boundEvents[i];
      }
    }
  };

  for (const op of input.acceptedOperations) {
    switch (op.type) {
      case "append": {
        const collidesPriorOrNew = [...priorCopy, ...newEvents];
        const freshId = generateNonCollidingEventId(collidesPriorOrNew);
        const renamed = collidesPriorOrNew.some(
          (e) => e.event_id === freshId,
        );
        // 注: generateNonCollidingEventId は衝突しない id を返すので renamed は
        //     原理的に false。ただし trace で「id を発行した」事実を残すため、
        //     append draft が事前 id を持たない (Commit 4 設計) 状況での記録
        //     としては action="appended" で十分。
        const newEvent = eventDraftToEvent(op, freshId);
        newEvents.push(newEvent);
        dispatch.push({
          type: "append",
          action: "appended",
          target_event_id: freshId,
          renamed_to: renamed ? freshId : undefined,
        });
        break;
      }

      case "modify": {
        // resolveTargetRef は priorCopy 全体に対して targetRef を解決する。
        // priorCopy は modify 適用済の最新状態を反映するので、複数 modify が
        // 連続する場合でも最新の event_id / slot を見て解決される。
        const resolution = resolveTargetRef(op.targetRef, priorCopy);
        if (resolution.event_id) {
          const targetIdx = priorCopy.findIndex(
            (e) => e.event_id === resolution.event_id,
          );
          if (targetIdx >= 0) {
            priorCopy[targetIdx] = applyModifyPatchFromOperation(
              priorCopy[targetIdx],
              op,
            );
            dispatch.push({
              type: "modify",
              action: "modify_applied",
              target_event_id: resolution.event_id,
              confidence: resolution.confidence,
              strategy: resolution.strategy,
            });
            break;
          }
        }
        // single_event_fallback: validation 層と同じ contract。priorCopy が 1 件なら
        // targetRef 文字列が解決できなくても強制 apply (medium confidence)。
        if (priorCopy.length === 1) {
          priorCopy[0] = applyModifyPatchFromOperation(priorCopy[0], op);
          dispatch.push({
            type: "modify",
            action: "modify_single_event_fallback",
            target_event_id: priorCopy[0].event_id,
            confidence: "medium",
            strategy: "single_event_fallback",
          });
          break;
        }
        // defensive: validation で modify_target_unresolved として reject される
        //   はずなので、accepted 段階で本ブランチに到達するのは異常。state 不変
        //   で safe に倒す (data loss 防止)。
        dispatch.push({
          type: "modify",
          action: "modify_unresolved",
        });
        break;
      }

      case "answer": {
        // secondary safety path (CEO 2026-04-30):
        //   主経路は route.ts Branch A の bindAnswerToSlot。Branch B で LLM が
        //   answer operation を出した場合のみ本 case が動く。
        //
        //   pendingClarify は validation で answer_no_pending_clarify reject
        //   済 + slot mismatch も answer_slot_mismatch reject 済。よって accepted
        //   段階で必ず非 null かつ slot 一致のはず。
        //   defensive null check で safe に倒す (state 不変)。
        if (!input.priorPendingClarify) {
          dispatch.push({
            type: "answer",
            action: "answer_bind_skipped",
          });
          break;
        }
        const currentEvents = [...priorCopy, ...newEvents];
        const result = bindAnswerToSlot(
          currentEvents,
          input.priorPendingClarify,
          op.value,
        );
        if (result.bound) {
          applyBindToLists(result.events);
          dispatch.push({
            type: "answer",
            action: "answer_bound",
            target_event_id: input.priorPendingClarify.event_id,
          });
        } else {
          // bind 失敗 (e.g., where slot に「決めてない」「pending=when なのに
          // 場所文字列」 等で answerBinder が parse 失敗)。state 不変に倒し、
          // events[] fallback と同じ「変えない」挙動に。
          dispatch.push({
            type: "answer",
            action: "answer_bind_failed",
            target_event_id: input.priorPendingClarify.event_id,
            bindReason: result.reason,
          });
        }
        break;
      }

      case "noop": {
        // state 不変。trace に積むだけ。
        dispatch.push({
          type: "noop",
          action: "noop",
        });
        break;
      }
    }
  }

  return {
    effectiveEvents: [...priorCopy, ...newEvents],
    dispatch,
  };
}
