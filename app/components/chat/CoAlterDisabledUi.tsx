"use client";

/**
 * Stage 4 L4-d — CoAlter Disabled UI
 *
 * 正本: master §5 / 統合契約 §2.1 (rev 1) / runtime §3.4
 *
 * disabled 状態の UI:
 *   - 「CoAlter は OFF」表示
 *   - 再有効化動線 (REENABLE_REQUEST event を発火)
 *
 * 不変原則: disabled → enabled 直接遷移は UI 上存在しない (必ず pending_consent 経由)。
 * 再有効化 button tap は availabilityReducer に REENABLE_REQUEST を送り、pending_consent
 * に遷移、その後相手の同意を待つ。
 */

export interface CoAlterDisabledUiProps {
  /** 再有効化リクエスト発火 (REENABLE_REQUEST event を上位 reducer に送る) */
  onReenableRequest: () => void;
  /** disabled になった理由表示 (任意) */
  reason?: string;
}

export default function CoAlterDisabledUi({
  onReenableRequest,
  reason,
}: CoAlterDisabledUiProps) {
  return (
    <div
      role="region"
      aria-label="CoAlter 無効状態"
      data-testid="coalter-disabled-ui"
      style={{
        padding: 14,
        background: "#f5f6fa",
        border: "1px solid #c8c8dc",
        borderRadius: 8,
        fontSize: 12,
        color: "#4a4a68",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#1a1a2e" }}>
        🔵 CoAlter は OFF
      </div>
      {reason && (
        <div style={{ fontSize: 11, marginBottom: 6, fontStyle: "italic" }}>
          {reason}
        </div>
      )}
      <div style={{ fontSize: 11, marginBottom: 10 }}>
        再有効化には相手の再同意が必要です (master §5)。
      </div>
      <button
        type="button"
        onClick={onReenableRequest}
        data-testid="coalter-reenable-request"
        style={{
          padding: "6px 14px",
          fontSize: 12,
          background: "#6366F1",
          color: "#ffffff",
          border: "1px solid #6366F1",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        再有効化を提案
      </button>
    </div>
  );
}
