"use client";

/**
 * Stage 4 L4-f — RejectionFlows (本番化、preview L1-g 移植)
 *
 * 正本: layout plan v0.3 §7.6 / UI spec §6.6 拒否 3 分類 / §6.7 / §6.8
 *
 * 3 種拒否を 異なる UI で区別:
 *   - mode_escalation (§6.6.1): AutoEscalationBanner 内の「通常に戻す」 chip で発火
 *   - individual_proposal (§6.6.2): 提案カードの「閉じる」導線で発火
 *   - coalter_retreat (§6.6.3): 後退要求 button (本 component の主役)
 *
 * §6.8 非判定性: 警告色禁止、indigo / 落ち着いた色のみ。
 */

import type { RejectionEvent } from "@/lib/coalter/presence/rejectionReducer";

export interface RejectionFlowsProps {
  /** 各拒否 event を上位 reducer に dispatch */
  onReject: (event: RejectionEvent) => void;
  /** 現在の theme (proposal_rejection 用、null なら proposal 拒否 button 非表示) */
  currentTheme?: string;
}

export default function RejectionFlows({
  onReject,
  currentTheme,
}: RejectionFlowsProps) {
  const now = Date.now();

  return (
    <div
      role="region"
      aria-label="CoAlter 拒否 3 分類"
      data-testid="coalter-rejection-flows"
      style={{
        padding: 10,
        background: "#f5f6fa",
        border: "1px solid #c8c8dc",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, color: "#4a4a68" }}>
        いったん間を置く / 介入を控える / 提案を保留する のいずれかを選べます。
      </div>

      {currentTheme && (
        <button
          type="button"
          onClick={() =>
            onReject({
              type: "PROPOSAL_REJECTED",
              theme: currentTheme,
              at: now,
            })
          }
          data-testid="coalter-reject-proposal"
          style={baseBtn}
        >
          この提案は今は保留
        </button>
      )}

      <button
        type="button"
        onClick={() =>
          onReject({
            type: "COALTER_RETREAT_REQUESTED",
            at: now,
          })
        }
        data-testid="coalter-reject-retreat"
        style={baseBtn}
      >
        しばらく見守るだけにして
      </button>
    </div>
  );
}

const baseBtn: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 11,
  background: "#ffffff",
  color: "#1a1a2e",
  border: "1px solid #c8c8dc",
  borderRadius: 4,
  cursor: "pointer",
  textAlign: "left" as const,
};
