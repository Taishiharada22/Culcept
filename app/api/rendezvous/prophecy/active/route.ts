import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// GET /api/rendezvous/prophecy/active
// ユーザーのアクティブ予言を取得
// =============================================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().slice(0, 10);

    // アクティブ予言を取得（期限内のもの）
    const { data: prophecy } = await supabaseAdmin
      .from("rendezvous_prophecies")
      .select("id, prophecy_text, target_date, category, state, created_at")
      .eq("user_id", auth.user.id)
      .eq("state", "active")
      .gte("target_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prophecy) {
      return NextResponse.json({ ok: true, prophecy: null });
    }

    // 残り日数計算
    const targetDate = new Date(prophecy.target_date);
    const now = new Date();
    const daysUntil = Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return NextResponse.json({
      ok: true,
      prophecy: {
        id: prophecy.id,
        text: prophecy.prophecy_text,
        targetDate: prophecy.target_date,
        category: prophecy.category,
        daysUntil,
        createdAt: prophecy.created_at,
      },
    });
  } catch (err) {
    console.error("[prophecy/active] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
