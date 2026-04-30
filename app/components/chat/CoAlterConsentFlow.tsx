"use client";

/**
 * Stage 4 L4-d — 同意フロー UI (pending_consent)
 *
 * 正本: master §5 / 統合契約 §2.1 / runtime §3.4
 *
 * pending_consent 状態の UI:
 *   - 自分が起動要求を出した場合: 相手の同意待ち (相手側に同意要求を表示)
 *   - 相手が起動要求した場合: 自分の同意入力
 *
 * 不変原則 (master §5 / 統合契約 §2.1):
 *   - 相手の同意なしに enabled に進めない
 *   - 72h 無応答 → inactive 復帰
 *   - 強制しない (master §378)
 */

export interface CoAlterConsentFlowProps {
  /** 自分が要求側か (true: 相手の同意待ち / false: 相手から要求された) */
  isRequester: boolean;
  /** 相手の表示名 */
  otherPartyName: string;
  /** 自分が同意した時 (相手から要求された側のみ) */
  onConsent?: () => void;
  /** 自分が拒否した時 (相手から要求された側のみ) */
  onReject?: () => void;
  /** 自分が要求 cancel した時 (要求側のみ) */
  onCancel?: () => void;
  /** 経過時間 (ms)、72h 経過判定用 (本 component は表示のみ、timeout 自動発火は親) */
  elapsedMs?: number;
}

const TIMEOUT_72H_MS = 72 * 60 * 60 * 1000;

export default function CoAlterConsentFlow({
  isRequester,
  otherPartyName,
  onConsent,
  onReject,
  onCancel,
  elapsedMs = 0,
}: CoAlterConsentFlowProps) {
  const isTimedOut = elapsedMs >= TIMEOUT_72H_MS;

  if (isRequester) {
    return (
      <div
        role="status"
        aria-label="CoAlter 同意リクエスト"
        data-testid="coalter-consent-requesting"
        style={{
          padding: 14,
          background: "#eef2ff",
          border: "1px solid #c7d2fe",
          borderRadius: 8,
          fontSize: 12,
          color: "#1a1a2e",
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          🔵 CoAlter 起動の同意を {otherPartyName} さんに送信中
        </div>
        <div style={{ fontSize: 11, color: "#4a4a68" }}>
          相手の同意があれば CoAlter が有効化されます。72h 無応答で自動取り消し。
        </div>
        {isTimedOut && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#8888a0",
              fontStyle: "italic",
            }}
          >
            72h 経過、自動取り消しされました
          </div>
        )}
        {onCancel && !isTimedOut && (
          <button
            type="button"
            onClick={onCancel}
            data-testid="coalter-consent-cancel"
            style={{
              marginTop: 8,
              padding: "4px 10px",
              fontSize: 11,
              background: "transparent",
              border: "1px solid #c8c8dc",
              color: "#4a4a68",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            取り消す
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="CoAlter 同意確認"
      data-testid="coalter-consent-asking"
      style={{
        padding: 14,
        background: "#ffffff",
        border: "1px solid #6366F1",
        borderRadius: 8,
        fontSize: 12,
        color: "#1a1a2e",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        🔵 {otherPartyName} さんが CoAlter の起動を提案しています
      </div>
      <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 10 }}>
        ペアで CoAlter を有効化しますか？
        いつでも opt-out できます。
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onConsent}
          data-testid="coalter-consent-grant"
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
          同意する
        </button>
        <button
          type="button"
          onClick={onReject}
          data-testid="coalter-consent-reject"
          style={{
            padding: "6px 14px",
            fontSize: 12,
            background: "transparent",
            color: "#4a4a68",
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          いまは見送る
        </button>
      </div>
    </div>
  );
}
