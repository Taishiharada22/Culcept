/**
 * Reality Control OS — R5-3 Permission Gate Evaluation（**pure 判定のみ・no-apply**・barrel 非 export）
 *
 * 設計: docs/r5-permission-asset-audit-and-boundary.md（R5-0）/ permission-model.ts（R5-1）
 *
 * 役割: level + risk + context + authority(governance) から **allowed/confirm_required/blocked/insufficient_context**
 *   を返す pure 判定。**実介入しない**（判定だけ）。reason は redacted（raw/PII を出さない）。
 *
 * 厳守: **高リスクは必ず confirm_required/blocked**（allowed にしない）・固定予定を動かす action は blocked・
 *   文脈不足は insufficient_context・配送/apply しない・pure。
 */

import { isImmovable, type PlanItemGovernance } from "../authority";
import {
  AUTONOMY_FLOOR,
  HIGH_RISK_CONFIRM_FLOOR,
  classifyRisk,
  type ActionKind,
  type PermissionLevel,
  type RiskCategory,
  type RiskFlag,
} from "./permission-model";

export type PermissionVerdict = "allowed" | "confirm_required" | "blocked" | "insufficient_context";

export interface PermissionGateInput {
  readonly action: ActionKind;
  readonly flags: readonly RiskFlag[];
  readonly level: PermissionLevel;
  /** action が既存 item に触る場合の governance（null=新規/非接触）。 */
  readonly governance?: PlanItemGovernance | null;
  /** 判断に必要な文脈が揃っているか。 */
  readonly contextComplete: boolean;
}

export interface PermissionGateResult {
  readonly verdict: PermissionVerdict;
  readonly risk: RiskCategory;
  /** redacted（raw/PII を出さない短い理由）。 */
  readonly reason: string;
}

/**
 * R5-3: 許可判定（pure・no-apply）。高リスクは autonomous にしない。
 */
export function evaluatePermission(input: PermissionGateInput): PermissionGateResult {
  const risk = classifyRisk(input.action, input.flags);

  if (!input.contextComplete) {
    return { verdict: "insufficient_context", risk, reason: "判断に必要な文脈が不足しています" };
  }
  // 固定された予定を動かす action は不可
  if (input.action === "adjust_plan" && input.governance && isImmovable(input.governance)) {
    return { verdict: "blocked", risk, reason: "固定された予定は動かせません" };
  }
  // 高リスクは **autonomous にしない**（必ず confirm_required か blocked）
  if (risk === "high") {
    return input.level >= HIGH_RISK_CONFIRM_FLOOR
      ? { verdict: "confirm_required", risk, reason: "高リスクのため確認が必要です" }
      : { verdict: "blocked", risk, reason: "高リスク・権限不足のため実行できません" };
  }
  // low/elevated: level が floor 以上で allowed・1 つ下で confirm・それ未満 blocked
  const floor = AUTONOMY_FLOOR[input.action] + (risk === "elevated" ? 1 : 0);
  if (input.level >= floor) return { verdict: "allowed", risk, reason: "権限の範囲内です" };
  if (input.level >= floor - 1) return { verdict: "confirm_required", risk, reason: "確認のうえ実行できます" };
  return { verdict: "blocked", risk, reason: "権限が不足しています" };
}
