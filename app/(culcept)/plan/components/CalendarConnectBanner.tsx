"use client";

/**
 * P3-A-1-1-h: CalendarConnectBanner — Google OAuth 結果の user feedback banner
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.7
 *
 * 役割:
 *   - callback route が完了 / 失敗時に redirect する URL の query を読み取り、
 *     対応する banner を Plan tab 上部に表示
 *   - dismissible (= user が × で閉じる)
 *   - retry button (= error 系のみ、 modal 再 open trigger)
 *   - a11y: success → role='status' / error → role='alert'
 *
 * Aneurasync 文体 (= ⑦ 状態描写型):
 *   - 「接続しました」 → 「カレンダーが繋がりました」
 *   - 「もう一度試してください」 → 「もう一度やってみますか」
 *   - 詩的にしすぎず、 明瞭 + 柔らかく
 *
 * 不変原則:
 *   - URL query は props で受け取る (= 親が useSearchParams を使う、 本 component は pure)
 *   - dismiss は client state のみ (= URL からの clean 化は親が行う)
 */

import { useState } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CalendarConnectErrorCode =
  | "not_configured"
  | "canceled"
  | "invalid_request"
  | "state_missing"
  | "state_mismatch"
  | "token_invalid_grant"
  | "token_invalid_client"
  | "token_invalid_request"
  | "token_network"
  | "token_missing_refresh_token"
  | "token_unknown"
  | "auth_failed"
  | "db_connection_failed";

export type CalendarConnectBannerStatus =
  | { readonly kind: "success"; readonly partial: boolean }
  | { readonly kind: "canceled" }
  | { readonly kind: "error"; readonly code: CalendarConnectErrorCode; readonly googleError?: string }
  | { readonly kind: "idle" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query → Status parser (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * URL search params (= 名前と値の map) から banner status を導出。
 * pure、 export して test 可能。
 */
export function parseBannerStatus(
  params: Pick<URLSearchParams, "get">,
): CalendarConnectBannerStatus {
  const connected = params.get("calendar_connected");
  const errorCode = params.get("calendar_connect_error");
  const partial = params.get("calendar_connect_partial");

  if (connected === "1") {
    return { kind: "success", partial: partial === "1" };
  }
  if (errorCode) {
    if (errorCode === "canceled") {
      return { kind: "canceled" };
    }
    const allowedCodes: ReadonlyArray<CalendarConnectErrorCode> = [
      "not_configured",
      "canceled",
      "invalid_request",
      "state_missing",
      "state_mismatch",
      "token_invalid_grant",
      "token_invalid_client",
      "token_invalid_request",
      "token_network",
      "token_missing_refresh_token",
      "token_unknown",
      "auth_failed",
      "db_connection_failed",
    ];
    const code = (allowedCodes as ReadonlyArray<string>).includes(errorCode)
      ? (errorCode as CalendarConnectErrorCode)
      : "token_unknown";
    const googleError = params.get("google_error") ?? undefined;
    return googleError ? { kind: "error", code, googleError } : { kind: "error", code };
  }
  return { kind: "idle" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error code → 人間語訳 (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ERROR_MESSAGES: Record<CalendarConnectErrorCode, string> = {
  not_configured: "サーバーの設定が未完了です。 しばらくしてからお試しください。",
  canceled: "接続をやめました。",
  invalid_request: "リクエストが不完全でした。 もう一度やってみますか。",
  state_missing: "セキュリティ情報が見つかりませんでした。 もう一度やってみますか。",
  state_mismatch: "セキュリティチェックで止まりました。 もう一度やってみますか。",
  token_invalid_grant: "認可コードの有効期限が切れていました。 もう一度やってみますか。",
  token_invalid_client: "クライアント情報が一致しませんでした。 管理者にお問い合わせください。",
  token_invalid_request: "認証リクエストの形式が不正でした。 もう一度やってみますか。",
  token_network: "Google との通信に失敗しました。 しばらくしてから再試行してください。",
  token_missing_refresh_token: "認可情報が不完全でした。 もう一度連携をお試しください。",
  token_unknown: "認証中に予期せぬエラーが発生しました。 もう一度やってみますか。",
  auth_failed: "ログイン情報が確認できませんでした。",
  db_connection_failed: "接続情報の保存に失敗しました。 もう一度やってみますか。",
};

export function describeError(code: CalendarConnectErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.token_unknown;
}

/** retry 可能な error か (= 「もう一度試す」 button 表示判定) */
export function isRetryable(code: CalendarConnectErrorCode): boolean {
  // not_configured / token_invalid_client は server 設定問題、 user が retry しても解決しない
  if (code === "not_configured" || code === "token_invalid_client") return false;
  if (code === "auth_failed") return false; // login redirect 必要、 retry button では無理
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Banner component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CalendarConnectBanner({
  status,
  onRetry,
  onDismiss,
}: {
  status: CalendarConnectBannerStatus;
  onRetry?: () => void;
  onDismiss?: () => void;
}): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (status.kind === "idle") return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  // ── success ──
  if (status.kind === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="calendar-connect-banner-success"
        className="mx-auto max-w-2xl mt-3 mb-2 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-start gap-3"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
        </svg>
        <div className="flex-1 text-sm leading-relaxed">
          {status.partial ? (
            <>
              <span className="font-medium">Google カレンダーが繋がりました。</span>
              <br />
              <span className="text-xs text-emerald-700">
                一部のカレンダー取得は次回再試行します。
              </span>
            </>
          ) : (
            <span className="font-medium">Google カレンダーが繋がりました。</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="閉じる"
          data-testid="calendar-connect-banner-dismiss"
          className="text-emerald-700 hover:text-emerald-900 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
      </div>
    );
  }

  // ── canceled (= 軽い toast、 alert にしない) ──
  if (status.kind === "canceled") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="calendar-connect-banner-canceled"
        className="mx-auto max-w-2xl mt-3 mb-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 flex items-center gap-3"
      >
        <span className="flex-1 text-sm">接続をやめました。</span>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="閉じる"
          data-testid="calendar-connect-banner-dismiss"
          className="text-slate-500 hover:text-slate-700 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
      </div>
    );
  }

  // ── error ──
  const message = describeError(status.code);
  const retryable = isRetryable(status.code) && !!onRetry;
  return (
    <div
      role="alert"
      data-testid="calendar-connect-banner-error"
      data-error-code={status.code}
      className="mx-auto max-w-2xl mt-3 mb-2 px-4 py-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-900 flex items-start gap-3"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor" />
      </svg>
      <div className="flex-1 text-sm leading-relaxed">
        <div className="font-medium">{message}</div>
        {status.googleError && (
          <div className="mt-1 text-xs text-rose-700">
            Google: <code className="text-[10px]">{status.googleError}</code>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {retryable && (
          <button
            type="button"
            onClick={onRetry}
            data-testid="calendar-connect-banner-retry"
            className="text-xs px-3 py-1.5 rounded-md border border-rose-300 bg-white text-rose-700 hover:bg-rose-100 transition-colors font-medium"
          >
            もう一度
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="閉じる"
          data-testid="calendar-connect-banner-dismiss"
          className="text-rose-700 hover:text-rose-900"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
