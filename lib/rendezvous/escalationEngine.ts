// ============================================================
// Phase 6: エスカレーション自動化
// ルールベースの通報処理と自動対応
// ============================================================

import type { ReportReasonCode } from "./types";

export type EscalationAction = {
  action: "log" | "pause" | "disable" | "immediate_pause";
  reason: string;
  requiresAdminReview: boolean;
  notifyAdmin: boolean;
  suppressionDays: number;
};

export type EscalationState = {
  userId: string;
  reportCount: number;
  uniqueReporterCount: number;
  mostSevereReason: ReportReasonCode | null;
  currentLevel: EscalationLevel;
  isPaused: boolean;
  isDisabled: boolean;
};

export type EscalationLevel = 0 | 1 | 2 | 3;

/**
 * 通報を処理し、エスカレーションアクションを決定
 *
 * ルール:
 * - 1件目: ログ記録 + モニタリング
 * - 2件（異なるユーザー）: 自動停止 + 管理者通知
 * - 3件: 無効化 + 手動レビュー要求
 * - sexual_misconduct / hate_or_abuse: 即時停止（件数不問）
 */
export function processReport(
  currentState: EscalationState,
  reportReasonCode: ReportReasonCode,
): EscalationAction {
  // 即時エスカレーション対象
  const IMMEDIATE_ESCALATION: ReportReasonCode[] = [
    "sexual_misconduct",
    "hate_or_abuse",
  ];

  if (IMMEDIATE_ESCALATION.includes(reportReasonCode)) {
    return {
      action: "immediate_pause",
      reason: `即時停止: ${reportReasonCode}`,
      requiresAdminReview: true,
      notifyAdmin: true,
      suppressionDays: 30,
    };
  }

  // 通常エスカレーション
  const newReporterCount = currentState.uniqueReporterCount + 1;

  if (newReporterCount >= 3) {
    return {
      action: "disable",
      reason: `3件以上の通報（${newReporterCount}名のユーザーから）: アカウント無効化`,
      requiresAdminReview: true,
      notifyAdmin: true,
      suppressionDays: 90,
    };
  }

  if (newReporterCount >= 2) {
    return {
      action: "pause",
      reason: `2件の通報（異なるユーザーから）: 自動停止`,
      requiresAdminReview: true,
      notifyAdmin: true,
      suppressionDays: 14,
    };
  }

  // 1件目
  return {
    action: "log",
    reason: `初回通報: ログ記録 + モニタリング開始`,
    requiresAdminReview: false,
    notifyAdmin: false,
    suppressionDays: 0,
  };
}

/**
 * 現在のエスカレーションレベルを計算
 */
export function computeEscalationLevel(state: EscalationState): EscalationLevel {
  if (state.isDisabled) return 3;
  if (state.isPaused) return 2;
  if (state.uniqueReporterCount >= 1) return 1;
  return 0;
}

/**
 * 管理者によるレビュー後のアクション
 */
export function resolveEscalation(
  currentState: EscalationState,
  resolution: "cleared" | "warned" | "suspended" | "banned",
): {
  isPaused: boolean;
  isDisabled: boolean;
  suppressionDays: number;
  message: string;
} {
  switch (resolution) {
    case "cleared":
      return {
        isPaused: false,
        isDisabled: false,
        suppressionDays: 0,
        message: "通報は棄却されました。アカウントは通常状態に復帰します",
      };
    case "warned":
      return {
        isPaused: false,
        isDisabled: false,
        suppressionDays: 0,
        message: "警告が発行されました。アカウントは継続利用可能です",
      };
    case "suspended":
      return {
        isPaused: true,
        isDisabled: false,
        suppressionDays: 30,
        message: "30日間の一時停止が適用されました",
      };
    case "banned":
      return {
        isPaused: false,
        isDisabled: true,
        suppressionDays: 365,
        message: "アカウントが無効化されました",
      };
  }
}
