"use client";

/**
 * Stage 4 L4-f — AutoEscalationBanner (本番化、preview L1-g 移植)
 *
 * 正本: layout plan v0.3 §7.6 / UI spec §6.4 自動昇格
 *
 * 視覚キュー必須 (§4.4): pulse / urgent / expanded / chip 削減 のいずれか。
 * §6.6.1 ユーザー拒否 chip も併設。
 *
 * §6.8 非判定性: 警告色禁止、indigo 系で urgency を表現。
 */

import type { PresenceMode } from "@/lib/coalter/presence/types";

export interface AutoEscalationBannerProps {
  /** 昇格対象 mode (daily / travel) */
  target: Exclude<PresenceMode, "normal">;
  /** 昇格理由 (mock 文面、speech template が正本) */
  reasonHint?: string;
  /** ユーザーが「通常に戻す」tap (§6.6.1 mode_escalation 拒否) */
  onReject?: () => void;
}

const TARGET_LABEL: Record<"daily" | "travel", string> = {
  daily: "Daily",
  travel: "Travel",
};

export default function AutoEscalationBanner({
  target,
  reasonHint,
  onReject,
}: AutoEscalationBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="CoAlter モード自動昇格通知"
      data-testid="coalter-auto-escalation-banner"
      style={{
        padding: "10px 12px",
        background: "#eef2ff",
        border: "1px solid #6366F1",
        borderRadius: 8,
        animation: "coalterPulse 0.6s ease-out 1",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            fontSize: 10,
            background: "#6366F1",
            color: "#ffffff",
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          ● urgent
        </span>
        <span style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600 }}>
          通常 → {TARGET_LABEL[target]} に切替えるね
        </span>
      </div>
      {reasonHint && (
        <div style={{ fontSize: 11, color: "#4a4a68", lineHeight: 1.6 }}>
          {reasonHint}
        </div>
      )}
      {onReject && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            type="button"
            onClick={onReject}
            data-testid="coalter-auto-escalation-reject"
            aria-label="モード昇格の拒否 (§6.6.1)"
            style={{
              padding: "3px 10px",
              fontSize: 11,
              background: "transparent",
              border: "1px solid #c8c8dc",
              color: "#4a4a68",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            通常に戻す
          </button>
        </div>
      )}
      <style>{`
        @keyframes coalterPulse {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70%  { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>
    </div>
  );
}
