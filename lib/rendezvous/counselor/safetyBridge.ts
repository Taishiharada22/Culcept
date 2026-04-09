import "server-only";

// ============================================================
// Safety Bridge — 行動安全シグナル → Counselor 通知
//
// 設計根拠（Phase 2 C7）:
//   safetySignals.ts が検出した行動的安全シグナル（message_escalation等）を
//   Counselor が把握できるよう、orbiter_signals に通知レコードを挿入する。
//   CounselorDashboard はこのレコードを読み取って警告を表示する。
//
// 呼び出し元: app/api/rendezvous/[candidateId]/chat/route.ts
// ============================================================

import type { SafetySignal } from "../safetySignals";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CounselorSafetyAlert = {
  candidateId: string;
  /** シグナル対象ユーザー（行動を起こした側） */
  triggeredByUserId: string;
  /** 相手側ユーザー（保護対象） */
  protectedUserId: string;
  /** 最も深刻なアクション */
  action: "warn" | "hold" | "block";
  /** 検出されたシグナル種別 */
  signalTypes: SafetySignal["type"][];
  /** 最大深刻度 */
  maxSeverity: number;
};

/**
 * 行動安全シグナルが warn 以上の場合、Counselor に通知する。
 *
 * orbiter_signals に `counselor_safety_alert` タイプで挿入。
 * CounselorDashboard がこの signal_type をクエリして警告表示に使う。
 */
export async function notifyCounselorSafety(
  supabase: SupabaseClient,
  alert: CounselorSafetyAlert,
): Promise<void> {
  await supabase.from("orbiter_signals").insert({
    user_id: alert.protectedUserId,
    candidate_id: alert.candidateId,
    signal_type: "counselor_safety_alert",
    payload: {
      triggeredByUserId: alert.triggeredByUserId,
      action: alert.action,
      signalTypes: alert.signalTypes,
      maxSeverity: alert.maxSeverity,
      detectedAt: new Date().toISOString(),
    },
  });
}

/**
 * SafetySignal[] から CounselorSafetyAlert を構築するヘルパー。
 * warn 未満のシグナルしかない場合は null を返す（通知不要）。
 */
export function buildCounselorAlert(params: {
  candidateId: string;
  triggeredByUserId: string;
  protectedUserId: string;
  signals: SafetySignal[];
  action: "warn" | "hold" | "block";
}): CounselorSafetyAlert {
  const { candidateId, triggeredByUserId, protectedUserId, signals, action } = params;
  const maxSeverity = Math.max(...signals.map((s) => s.severity), 0);

  return {
    candidateId,
    triggeredByUserId,
    protectedUserId,
    action,
    signalTypes: signals.map((s) => s.type),
    maxSeverity,
  };
}
