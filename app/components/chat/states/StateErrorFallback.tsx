"use client";

/**
 * Stage 4 L4-k — Error Fallback
 *
 * 正本: layout plan v0.3 §7.11 / UI spec §6.8 非判定性 (継承)
 *
 * 各 state × mode の error 状態。fail-open で UI を止めず、§6.8 非判定性に従い
 * 警告色を使わない (indigo 系で穏やかに表示)。
 */

import type { PresenceMode, PresenceState } from "@/lib/coalter/presence/types";
import StateAriaWrapper from "./StateAriaWrapper";

export interface StateErrorFallbackProps {
  state: PresenceState;
  mode: PresenceMode;
  /** 開発用 error 表示 (production では出さない) */
  error?: Error;
  /** リトライ button (任意) */
  onRetry?: () => void;
}

export default function StateErrorFallback({
  state,
  mode,
  error,
  onRetry,
}: StateErrorFallbackProps) {
  return (
    <StateAriaWrapper state={state} mode={mode}>
      <div
        data-testid="coalter-state-error-fallback"
        style={{
          padding: "10px 12px",
          background: "#f5f6fa",
          border: "1px solid #c8c8dc",
          borderRadius: 6,
          fontSize: 12,
          color: "#4a4a68",
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 500 }}>
          CoAlter は今、少し離れた位置から見守っています
        </div>
        {error && process.env.NODE_ENV !== "production" && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: "#8888a0",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            (dev) {error.message}
          </div>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid="coalter-state-error-retry"
            style={{
              marginTop: 6,
              padding: "4px 10px",
              fontSize: 11,
              background: "transparent",
              border: "1px solid #c8c8dc",
              color: "#4a4a68",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            もう一度
          </button>
        )}
      </div>
    </StateAriaWrapper>
  );
}
