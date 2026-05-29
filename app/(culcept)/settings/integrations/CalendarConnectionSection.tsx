"use client";

/**
 * P3-A-1-2 G-α: マイページ > 設定 > 連携 — Google Calendar connection section
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.8
 * decision-log: 2026-05-26 D-e + G-α (= DB 非依存で閉じる UI shell)
 *
 * 役割:
 *   - mount 時 GET /api/calendar/google/status で接続状態取得
 *   - 接続中 → status + 最終同期時刻 + per-calendar toggle (= UI shell、 internal state のみ)
 *   - 未接続 → 「Plan tab から接続してください」 案内 (= 連携自体は Plan modal で行う)
 *   - 切断 → POST /api/calendar/google/disconnect、 status 反転
 *
 * 不変原則 (= D-e 整合):
 *   - DB write なし (= toggle は internal state、 保存は将来 phase)
 *   - subscription list は SAMPLE data (= 実 list は migration apply 後の別 phase)
 *   - 「保存は次回 sync で確定します」 hint 明示 (= user に未完成を伝える)
 *
 * 範囲外:
 *   - subscription 永続化 (= API + DB write、 別 phase)
 *   - real sync (= initial sync の DB persist、 別 phase)
 *   - migration apply (= 別 phase で CEO 慎重判断)
 */

import { useCallback, useEffect, useState } from "react";

import {
  describeAccessRole,
  describeConnectionStatus,
  formatRelativeTime,
  type AccessRole,
  type ConnectionStatus,
} from "./connectionDisplay";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type StatusState =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | {
      kind: "connected";
      status: ConnectionStatus;
      lastSyncedAt: string | null;
    };

type SubscriptionRow = {
  id: string;
  displayName: string;
  accessRole: AccessRole;
  isPrimary: boolean;
  isEnabled: boolean;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sample data (= UI shell、 実 data は migration apply + sync 後)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SAMPLE_SUBSCRIPTIONS: ReadonlyArray<SubscriptionRow> = [
  {
    id: "primary-sample",
    displayName: "メインカレンダー",
    accessRole: "owner",
    isPrimary: true,
    isEnabled: true,
  },
  {
    id: "work-sample",
    displayName: "仕事 (= サンプル)",
    accessRole: "writer",
    isPrimary: false,
    isEnabled: true,
  },
  {
    id: "share-sample",
    displayName: "家族共有 (= サンプル)",
    accessRole: "reader",
    isPrimary: false,
    isEnabled: false,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CalendarConnectionSection(): React.ReactElement {
  const [statusState, setStatusState] = useState<StatusState>({ kind: "loading" });
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([
    ...SAMPLE_SUBSCRIPTIONS,
  ]);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // mount: status fetch
  useEffect(() => {
    let aborted = false;
    fetch("/api/calendar/google/status", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => r.json() as Promise<{
        connected: boolean;
        status?: ConnectionStatus;
        lastSyncedAt?: string | null;
      }>)
      .then((j) => {
        if (aborted) return;
        if (j.connected && j.status) {
          setStatusState({
            kind: "connected",
            status: j.status,
            lastSyncedAt: j.lastSyncedAt ?? null,
          });
        } else {
          setStatusState({ kind: "disconnected" });
        }
      })
      .catch(() => {
        if (aborted) return;
        setStatusState({ kind: "disconnected" });
      });
    return () => {
      aborted = true;
    };
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (statusState.kind !== "connected") return;
    setDisconnectPending(true);
    setDisconnectError(null);
    try {
      const res = await fetch("/api/calendar/google/disconnect", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setStatusState({ kind: "disconnected" });
      } else {
        setDisconnectError(json.error ?? "解除に失敗しました");
      }
    } catch {
      setDisconnectError("解除に失敗しました");
    } finally {
      setDisconnectPending(false);
    }
  }, [statusState.kind]);

  const handleToggleSubscription = useCallback((id: string) => {
    setSubscriptions((rows) =>
      rows.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r)),
    );
  }, []);

  // ━━━ Render ━━━

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="calendar-connection-section"
      aria-label="連携 / Google カレンダー"
    >
      <header className="mb-4 flex items-center gap-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Google カレンダー</h2>
          <p className="text-xs text-slate-500">外部の予定を Aneurasync に取り込む連携</p>
        </div>
      </header>

      {/* ── Loading ── */}
      {statusState.kind === "loading" && (
        <p
          className="text-sm text-slate-500 py-2"
          data-testid="calendar-section-loading"
          role="status"
        >
          接続状態を確認しています…
        </p>
      )}

      {/* ── Disconnected ── */}
      {statusState.kind === "disconnected" && (
        <div data-testid="calendar-section-disconnected">
          <p className="text-sm text-slate-700 mb-3">
            現在、 Google カレンダーには接続していません。
          </p>
          <a
            href="/plan"
            data-testid="calendar-section-go-to-plan"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-purple-700 font-medium underline-offset-2 hover:underline"
          >
            Plan tab から接続する →
          </a>
          <p className="mt-3 text-[11px] text-slate-400">
            Plan tab の 「取り込む」 button から Google カレンダーを接続できます。
          </p>
        </div>
      )}

      {/* ── Connected ── */}
      {statusState.kind === "connected" && (
        <div data-testid="calendar-section-connected">
          {/* status row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  statusState.status === "active"
                    ? "bg-emerald-500"
                    : statusState.status === "token_expired"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              <span
                className="text-sm font-medium text-slate-800"
                data-testid="calendar-section-status-label"
              >
                {describeConnectionStatus(statusState.status)}
              </span>
            </div>
            <span
              className="text-xs text-slate-500"
              data-testid="calendar-section-last-synced"
            >
              最終同期: {formatRelativeTime(statusState.lastSyncedAt)}
            </span>
          </div>

          {/* per-calendar toggle list (= UI shell、 internal state) */}
          <div
            className="mb-5 rounded-xl border border-slate-100 bg-slate-50 p-3"
            data-testid="calendar-section-subscriptions"
          >
            <p className="text-xs font-medium text-slate-600 mb-2">取り込み対象カレンダー</p>
            <ul className="space-y-2">
              {subscriptions.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100"
                  data-testid={`calendar-section-sub-${sub.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">{sub.displayName}</p>
                    <p className="text-[10px] text-slate-400">
                      {describeAccessRole(sub.accessRole)}
                      {sub.isPrimary && " · メイン"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sub.isEnabled}
                    aria-label={`${sub.displayName} の取り込み ${sub.isEnabled ? "オフ" : "オン"}`}
                    onClick={() => handleToggleSubscription(sub.id)}
                    data-testid={`calendar-section-toggle-${sub.id}`}
                    className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors ${
                      sub.isEnabled ? "bg-indigo-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block w-4 h-4 bg-white rounded-full transition-transform ${
                        sub.isEnabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-slate-400 italic">
              ※ 表示はサンプルです。 切替は次回同期で確定します。
            </p>
          </div>

          {/* disconnect button */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnectPending}
              data-testid="calendar-section-disconnect-button"
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {disconnectPending ? "解除しています…" : "接続を解除する"}
            </button>
            {disconnectError && (
              <p
                className="text-xs text-rose-600 text-center"
                role="alert"
                data-testid="calendar-section-disconnect-error"
              >
                {disconnectError}
              </p>
            )}
            <p className="text-[10px] text-slate-400 text-center mt-1">
              解除しても、 これまでに取り込んだ予定は残ります。
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
