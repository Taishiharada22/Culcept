/**
 * P3-A-1-1-f: Google Calendar OAuth status route (= 接続状態取得)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.5 + §1.8
 *
 * 役割:
 *   - modal が mount 時 / toggle button click 後に call
 *   - 認証 user × provider='google' の connection 状態を返す
 *   - 不在 user (= 未認証) は { connected: false } で返す (= 情報漏洩防止)
 *
 * 不変原則:
 *   - server-side only
 *   - throw しない (= fail-safe で 200 OK + connected: false 返す)
 *   - secret は返さない (= refresh_token / client_secret は body に含めない)
 */

import { NextResponse } from "next/server";

import { findConnection } from "@/lib/oauth/calendarConnectionRepository";
import { supabaseServer } from "@/lib/supabase/server";

export type CalendarStatusResponse = {
  readonly connected: boolean;
  readonly status?: "active" | "revoked" | "token_expired";
  readonly lastSyncedAt?: string | null;
};

export async function GET(): Promise<NextResponse<CalendarStatusResponse>> {
  // 1. authn
  let userId: string | undefined;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id) {
      userId = data.user.id;
    }
  } catch {
    // auth 失敗 → connected: false で返す (= 情報漏洩防止)
  }

  if (!userId) {
    return NextResponse.json({ connected: false });
  }

  // 2. connection 取得
  const supabase = await supabaseServer();
  const result = await findConnection(supabase, userId, "google");

  if (!result.ok) {
    // DB error も fail-safe で connected: false
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/status] findConnection failed", {
        detail: result.detail,
      });
    }
    return NextResponse.json({ connected: false });
  }

  if (!result.connection) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: result.connection.status === "active",
    status: result.connection.status,
    lastSyncedAt: result.connection.lastSyncedAt,
  });
}
