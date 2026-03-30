// app/api/onboarding/route.ts
// Onboarding status check (GET) and completion (POST)

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ─── GET: オンボーディング状態を確認 ───
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      onboarded: !!data?.onboarded_at,
      onboarded_at: data?.onboarded_at ?? null,
    });
  } catch (error) {
    console.error("onboarding GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST: オンボーディング完了（profiles.onboarded_at を更新するのみ） ───
// 初期観測データは /api/stargazer/observations で先に永続化済み
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // body は空でもよい（後方互換のため受け取るが使用しない）
    await req.json().catch(() => ({}));

    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: auth.user.id, onboarded_at: new Date().toISOString() },
        { onConflict: "id" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("onboarding POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
