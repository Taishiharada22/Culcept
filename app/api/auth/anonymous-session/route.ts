// app/api/auth/anonymous-session/route.ts
// 後ログイン型: 匿名セッション可否チェック API
// サーバーサイドで STARGAZER_ANON_ENABLED フラグを確認し、
// Vercel Dashboard から再デプロイなしで即時無効化可能。
// 実際の signInAnonymously() はクライアント側で実行する（ブラウザセッション確立のため）。

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Feature flag check — サーバーサイド環境変数で即時切替可能
  const enabled = process.env.STARGAZER_ANON_ENABLED !== "false";

  return NextResponse.json({ enabled });
}
