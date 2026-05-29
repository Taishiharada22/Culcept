/**
 * Track B TB-2: Microsoft (Outlook) OAuth status route (= 接続状態取得)
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-2
 * (= Google status route [P3-A-1-1-f] を mirror、 provider='microsoft')
 *
 * 不変原則: server-side only / throw しない (= fail-safe で connected:false) / secret 非返却。
 */

import { NextResponse } from "next/server";

import { findConnection } from "@/lib/oauth/calendarConnectionRepository";
import { supabaseServer } from "@/lib/supabase/server";

export type MicrosoftStatusResponse = {
  readonly connected: boolean;
  readonly status?: "active" | "revoked" | "token_expired";
  readonly lastSyncedAt?: string | null;
};

export async function GET(): Promise<NextResponse<MicrosoftStatusResponse>> {
  // 1. authn
  let userId: string | undefined;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id) {
      userId = data.user.id;
    }
  } catch {
    // auth 失敗 → connected: false (= 情報漏洩防止)
  }

  if (!userId) {
    return NextResponse.json({ connected: false });
  }

  // 2. connection 取得 (provider='microsoft')
  const supabase = await supabaseServer();
  const result = await findConnection(supabase, userId, "microsoft");

  if (!result.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/status] findConnection failed", {
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
