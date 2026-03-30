// app/auth/callback/route.ts
// Supabase auth callback — code exchange for session
// Handles: email confirmation, password recovery, OAuth

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
      return NextResponse.redirect(`${origin}${next}`);
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
