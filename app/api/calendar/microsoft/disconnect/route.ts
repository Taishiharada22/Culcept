/**
 * Track B TB-2: Microsoft (Outlook) OAuth disconnect route
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-2
 * (= Google disconnect route [P3-A-1-1-f] を mirror)
 *
 * Google との差分:
 *   - Microsoft は Google の revoke endpoint 相当の簡易 API を持たない
 *     → 本 route は **DB delete のみ** (= 保管 refresh_token を破棄、 接続を切る)。
 *   - token revoke が必要な場合は user が Microsoft アカウントの「アクセス権」画面で実施。
 *
 * 不変原則 (= Google と同):
 *   - 取り込み済 anchor data は本 route では削除しない (= 接続のみ切る)
 *   - DB 削除 失敗 → 500 + reason
 */

import { NextResponse } from "next/server";

import { deleteConnection } from "@/lib/oauth/calendarConnectionRepository";
import { supabaseServer } from "@/lib/supabase/server";

export type MicrosoftDisconnectResponse =
  | { readonly ok: true; readonly deleted: boolean }
  | { readonly ok: false; readonly error: string };

export async function POST(): Promise<NextResponse<MicrosoftDisconnectResponse>> {
  // 1. authn
  let userId: string;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      return NextResponse.json(
        { ok: false, error: "ログインが必要です。" },
        { status: 401 },
      );
    }
    userId = data.user.id;
  } catch {
    return NextResponse.json(
      { ok: false, error: "認証に失敗しました。" },
      { status: 500 },
    );
  }

  // 2. DB 削除 (= MS は revoke endpoint なし、 delete のみ)
  const supabase = await supabaseServer();
  const deleteResult = await deleteConnection(supabase, userId, "microsoft");
  if (!deleteResult.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/disconnect] deleteConnection failed", {
        detail: deleteResult.detail,
      });
    }
    return NextResponse.json(
      { ok: false, error: "接続情報の削除に失敗しました。" },
      { status: 500 },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[calendar/microsoft/disconnect] success", {
      userId,
      deleted: deleteResult.deleted,
    });
  }

  return NextResponse.json({ ok: true, deleted: deleteResult.deleted });
}
