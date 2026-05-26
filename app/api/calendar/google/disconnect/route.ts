/**
 * P3-A-1-1-f: Google Calendar OAuth disconnect route
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.5 + §1.8
 *
 * 役割:
 *   - modal の toggle button click (= 接続中状態) → POST 本 route
 *   - refresh_token を復号 → Google revoke → DB delete
 *   - subscriptions は ON DELETE CASCADE で自動削除
 *
 * 不変原則 (= 親 Q11 採用案 c 「user 選択 + default 保持」 の **接続のみ切る** path):
 *   - 取り込み済 anchor data は本 route では削除しない (= 親 Q11 default 保持)
 *   - 取り込み済 data の削除は別 UI / 別 endpoint (= 設定画面 / 別 phase)
 *   - Google revoke は best-effort (= 失敗しても DB 削除は続行)
 *   - DB 削除 失敗 → 500 + reason 返す
 */

import { NextResponse } from "next/server";

import {
  deleteConnection,
  findConnection,
} from "@/lib/oauth/calendarConnectionRepository";
import { revokeGoogleToken } from "@/lib/oauth/googleCalendarApi";
import { decryptToken } from "@/lib/oauth/tokenCrypto";
import { supabaseServer } from "@/lib/supabase/server";

export type DisconnectResponse =
  | {
      readonly ok: true;
      readonly deleted: boolean;
      readonly revoked: boolean;
      readonly alreadyRevoked: boolean;
    }
  | { readonly ok: false; readonly error: string };

export async function POST(): Promise<NextResponse<DisconnectResponse>> {
  // 1. env (= encryption key 必要、 revoke は env なしでも実行可能だが key なしだと token 取り出せず)
  const tokenEncKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncKey) {
    return NextResponse.json(
      { ok: false, error: "サーバー設定が不完全です。" },
      { status: 500 },
    );
  }

  // 2. authn
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

  const supabase = await supabaseServer();

  // 3. connection 取得 (= refresh_token 復号用)
  const findResult = await findConnection(supabase, userId, "google");
  if (!findResult.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/disconnect] findConnection failed", {
        detail: findResult.detail,
      });
    }
    return NextResponse.json(
      { ok: false, error: "接続情報の取得に失敗しました。" },
      { status: 500 },
    );
  }

  if (!findResult.connection) {
    // 既に存在しない → idempotent success
    return NextResponse.json({
      ok: true,
      deleted: false,
      revoked: false,
      alreadyRevoked: true,
    });
  }

  // 4. Google revoke (= best-effort、 失敗しても DB 削除続行)
  let revoked = false;
  let alreadyRevoked = false;
  try {
    const decrypted = decryptToken(findResult.connection.refreshTokenEncrypted, tokenEncKey);
    if (decrypted.ok) {
      const revokeResult = await revokeGoogleToken(decrypted.plaintext);
      if (revokeResult.ok) {
        revoked = true;
        alreadyRevoked = revokeResult.alreadyRevoked;
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[calendar/google/disconnect] revoke failed (proceeding to delete)", {
          reason: revokeResult.reason,
          detail: revokeResult.detail,
        });
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/disconnect] decrypt failed (proceeding to delete)", {
        reason: decrypted.reason,
      });
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const msg = e instanceof Error ? e.message : "unknown";
      console.warn("[calendar/google/disconnect] revoke threw (proceeding to delete)", {
        msg,
      });
    }
  }

  // 5. DB 削除
  const deleteResult = await deleteConnection(supabase, userId, "google");
  if (!deleteResult.ok) {
    return NextResponse.json(
      { ok: false, error: "接続情報の削除に失敗しました。" },
      { status: 500 },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[calendar/google/disconnect] success", {
      userId,
      revoked,
      alreadyRevoked,
      deleted: deleteResult.deleted,
    });
  }

  return NextResponse.json({
    ok: true,
    deleted: deleteResult.deleted,
    revoked,
    alreadyRevoked,
  });
}
