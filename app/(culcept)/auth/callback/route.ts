// app/auth/callback/route.ts
// Supabase auth callback — code exchange for session
// Handles: email confirmation, password recovery, OAuth

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { mergeAnonymousIntoExistingUser } from "@/lib/auth/mergeAnonymousData";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const type = searchParams.get("type"); // recovery, signup, etc.

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // recovery の場合はパスワード再設定画面へ
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/reset-password`);
      }

      // 匿名→新規登録フロー: メタデータに anonymous_id があればデータをマージ
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const anonymousId = user?.user_metadata?.anonymous_id;
        if (user && anonymousId && anonymousId !== user.id) {
          await mergeAnonymousIntoExistingUser(user.id, anonymousId);
        }
      } catch (mergeErr) {
        console.error("[auth/callback] anonymous merge failed:", mergeErr);
        // マージ失敗は非致命的。通常フローを継続
      }

      // 登録済みフラグ cookie をセット（メール確認後も確実にセット）
      const response = NextResponse.redirect(`${origin}${next}`);
      const ONE_YEAR = 60 * 60 * 24 * 365;
      response.cookies.set("aneurasync_registered", "1", {
        path: "/",
        maxAge: ONE_YEAR * 5,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

    console.error("[auth/callback] Code exchange failed:", error.message);
  }

  // hash fragment (#access_token=...) はサーバーに届かない。
  // クライアント側で処理するため、reset-password ページへ転送。
  // ブラウザが hash を保持したまま遷移する。
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  // fallback: ログインページへ
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
