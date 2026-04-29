/**
 * validatePlanOperation — LLM が出力した operation の妥当性検証
 *
 * CEO 2026-04-30 PR-50: GPT 提唱「予定内容の理解 = LLM、状態遷移の安全性 = コード」
 * の安全性 layer。LLM が誤った operation を出した場合に dispatch する前で弾く。
 *
 * 設計原則:
 *   - **pure**: 副作用なし、env / flag を読まない
 *   - **deterministic**: 同じ入力で同じ出力
 *   - **lenient**: 不明エッジケースは accept (LLM 信頼)、明確な矛盾のみ reject
 *   - **observable**: reject reason は debug / trace 用に enum で出す
 */

import type { Event } from "./eventSchema";
import type { PendingClarify } from "../types";
import type {
  PlanOperation,
  OperationValidationResult,
} from "./planOperation";
import { resolveTargetRef } from "../planning/modifyRouter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ValidateContext {
  /** prior persisted events (modify target / answer event 解決用) */
  priorEvents: Event[];
  /** 当 turn の pendingClarify (answer 検証用) */
  priorPendingClarify: PendingClarify | null;
}

/**
 * 1 件の PlanOperation を context (prior state) と照合して validate する。
 *
 * 検証内容 (operation type 別):
 *
 *   append:
 *     - eventDraft.when / where / what が全 null/empty → reject (append_empty_draft)
 *     - LLM が誤って targetRef を含める → reject (append_with_target_ref)
 *
 *   modify:
 *     - patch が空 → reject (modify_no_patch)
 *     - resolveTargetRef で解決失敗 + prior 複数 → reject (modify_target_unresolved)
 *     - prior 1 件なら single_event_fallback で accept
 *
 *   answer:
 *     - pendingClarify 不在 → reject (answer_no_pending_clarify)
 *     - answer.slot != pendingClarify.slot → reject (answer_slot_mismatch)
 *     - value 空 → reject (answer_empty_value)
 *
 *   noop:
 *     - 常に accept (副作用なし)
 *
 *   それ以外:
 *     - unknown_type で reject
 */
export function validatePlanOperation(
  op: PlanOperation,
  ctx: ValidateContext,
): OperationValidationResult {
  switch (op.type) {
    case "append":
      return validateAppend(op, ctx);
    case "modify":
      return validateModify(op, ctx);
    case "answer":
      return validateAnswer(op, ctx);
    case "noop":
      return { accepted: true, operation: op };
    default: {
      // schema 外の type (将来拡張で fwd-compat)
      const unknown: PlanOperation = op;
      return {
        accepted: false,
        reason: "unknown_type",
        operation: unknown,
      };
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別 validators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateAppend(
  op: PlanOperation & { type: "append" },
  _ctx: ValidateContext,
): OperationValidationResult {
  const draft = op.eventDraft;
  // append_empty_draft: 主要 slot 全部 null/empty → 意味のない append
  const hasWhen =
    (draft.when?.startTime != null && draft.when.startTime !== "") ||
    draft.when?.timeHint != null;
  const hasWhere =
    draft.where?.place_ref != null && draft.where.place_ref !== "";
  const hasWhat =
    (draft.what?.activity != null && draft.what.activity !== "") ||
    (draft.what?.activityCanonical != null &&
      draft.what.activityCanonical !== "");
  if (!hasWhen && !hasWhere && !hasWhat) {
    return {
      accepted: false,
      reason: "append_empty_draft",
      operation: op,
    };
  }
  // append_with_target_ref: schema 上 append には targetRef フィールドが無い (型で防ぐ)
  // 念のため runtime check で type assertion 経由の混入を弾く
  if ((op as unknown as { targetRef?: string }).targetRef) {
    return {
      accepted: false,
      reason: "append_with_target_ref",
      operation: op,
    };
  }
  return { accepted: true, operation: op };
}

function validateModify(
  op: PlanOperation & { type: "modify" },
  ctx: ValidateContext,
): OperationValidationResult {
  // modify_no_patch: patch が空 (どの slot も指定なし) → 何も変更しない
  const patchKeys = Object.keys(op.patch ?? {});
  const hasAnyPatch = patchKeys.some((k) => {
    const v = (op.patch as Record<string, unknown>)[k];
    if (v === null || v === undefined) return false;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  });
  if (!hasAnyPatch) {
    return {
      accepted: false,
      reason: "modify_no_patch",
      operation: op,
    };
  }
  // modify_target_unresolved: targetRef が prior に解決できない
  //   - prior 0 件 → reject (target が無い)
  //   - prior 1 件 → single_event_fallback で accept
  //   - prior 複数 + resolveTargetRef fail → reject
  if (ctx.priorEvents.length === 0) {
    return {
      accepted: false,
      reason: "modify_target_unresolved",
      operation: op,
    };
  }
  if (ctx.priorEvents.length === 1) {
    // single_event_fallback: prior 1 件なら targetRef 解決失敗でも適用可
    return { accepted: true, operation: op };
  }
  // prior 複数: resolveTargetRef で解決を試みる
  if (op.targetRef && op.targetRef.length > 0) {
    const resolution = resolveTargetRef(op.targetRef, ctx.priorEvents);
    if (resolution.event_id) {
      return { accepted: true, operation: op };
    }
  }
  // 解決失敗
  return {
    accepted: false,
    reason: "modify_target_unresolved",
    operation: op,
  };
}

function validateAnswer(
  op: PlanOperation & { type: "answer" },
  ctx: ValidateContext,
): OperationValidationResult {
  // answer_empty_value: 空文字 reject
  if (!op.value || op.value.trim().length === 0) {
    return {
      accepted: false,
      reason: "answer_empty_value",
      operation: op,
    };
  }
  // answer_no_pending_clarify: pendingClarify が無いのに answer が来た
  if (!ctx.priorPendingClarify) {
    return {
      accepted: false,
      reason: "answer_no_pending_clarify",
      operation: op,
    };
  }
  // answer_slot_mismatch: answer.slot != pendingClarify.slot
  if (op.slot !== ctx.priorPendingClarify.slot) {
    return {
      accepted: false,
      reason: "answer_slot_mismatch",
      operation: op,
    };
  }
  return { accepted: true, operation: op };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperations — 配列版
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 複数 operations の一括検証。
 *
 * 戦略 (CEO 確定):
 *   - 全 accept → operations 経路で dispatch
 *   - 1 件以上 reject → events[] fallback 経路 (legacy)
 *     理由: 部分 accept すると state 不整合 risk あり、保守側
 *
 * 戻り値:
 *   - allAccepted: true ですべて applicable
 *   - rejections: 1 件以上の reject reason 列挙 (debug / trace 用)
 */
export interface ValidationBatchResult {
  allAccepted: boolean;
  acceptedOperations: PlanOperation[];
  rejections: Array<{
    operation: PlanOperation;
    reason: string;
  }>;
}

export function validatePlanOperations(
  ops: PlanOperation[],
  ctx: ValidateContext,
): ValidationBatchResult {
  const acceptedOperations: PlanOperation[] = [];
  const rejections: Array<{ operation: PlanOperation; reason: string }> = [];

  for (const op of ops) {
    const result = validatePlanOperation(op, ctx);
    if (result.accepted) {
      acceptedOperations.push(result.operation);
    } else {
      rejections.push({ operation: result.operation, reason: result.reason });
    }
  }

  return {
    allAccepted: rejections.length === 0,
    acceptedOperations,
    rejections,
  };
}
