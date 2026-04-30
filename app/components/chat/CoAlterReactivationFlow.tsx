"use client";

/**
 * Stage 4 L4-d — Reactivation Flow (disabled → pending_consent → enabled)
 *
 * 正本: master §5 / 統合契約 §2.1 rev 1 / runtime §3.4
 *
 * disabled → enabled 直接遷移は禁止。本 component は 2-step 経路を統合 UI として提供:
 *   1. disabled 表示 + 「再有効化を提案」button (REENABLE_REQUEST 発火)
 *   2. pending_consent 表示 (相手の同意待ち)
 *   3. CONSENT_GRANTED で enabled (本 component は表示完了、enabled state は親が描画)
 *
 * 不変 (master §5 / 統合契約 §2.1):
 *   - disabled → enabled 直接遷移を UI に出さない (button が pending_consent 経由のみ)
 */

import CoAlterConsentFlow from "./CoAlterConsentFlow";
import CoAlterDisabledUi from "./CoAlterDisabledUi";
import type { ExecutorAvailability } from "@/lib/coalter/presence/types";

export interface CoAlterReactivationFlowProps {
  availability: ExecutorAvailability;
  otherPartyName: string;
  /** 自分が要求側か (REENABLE_REQUEST 発火元) */
  isRequester?: boolean;
  /** REENABLE_REQUEST tap (disabled UI button) */
  onReenableRequest: () => void;
  /** CONSENT_GRANTED 通知 (相手から要求された時) */
  onConsent?: () => void;
  /** CONSENT_REJECTED 通知 */
  onReject?: () => void;
  /** 自分が要求 cancel した時 */
  onCancel?: () => void;
  /** disabled 理由 (任意) */
  disabledReason?: string;
  /** pending_consent 経過時間 (72h タイムアウト判定) */
  consentElapsedMs?: number;
}

export default function CoAlterReactivationFlow({
  availability,
  otherPartyName,
  isRequester = false,
  onReenableRequest,
  onConsent,
  onReject,
  onCancel,
  disabledReason,
  consentElapsedMs,
}: CoAlterReactivationFlowProps) {
  // disabled: 再有効化動線
  if (availability === "disabled") {
    return (
      <CoAlterDisabledUi
        onReenableRequest={onReenableRequest}
        reason={disabledReason}
      />
    );
  }

  // pending_consent: 同意フロー
  if (availability === "pending_consent") {
    return (
      <CoAlterConsentFlow
        isRequester={isRequester}
        otherPartyName={otherPartyName}
        onConsent={onConsent}
        onReject={onReject}
        onCancel={onCancel}
        elapsedMs={consentElapsedMs}
      />
    );
  }

  // enabled / active / inactive は本 component の責務外
  return null;
}
