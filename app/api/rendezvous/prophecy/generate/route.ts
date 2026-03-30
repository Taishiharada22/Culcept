import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateProphecy } from "@/lib/rendezvous/prophecyEngine";

// =============================================================================
// POST /api/rendezvous/prophecy/generate
// 予言を生成（アクティブ予言がない場合のみ）
// =============================================================================

export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // アクティブ予言がすでにあるか確認
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_prophecies")
      .select("id")
      .eq("user_id", userId)
      .eq("state", "active")
      .gte("target_date", today)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    // Stargazerプロファイルから主要軸を取得
    let topTraits: { axisId: string; label: string; score: number }[] = [];
    try {
      const { data: profile } = await supabaseAdmin
        .from("stargazer_profiles")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile?.axis_scores && typeof profile.axis_scores === "object") {
        const scores = profile.axis_scores as Record<string, number>;
        topTraits = Object.entries(scores)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 5)
          .map(([key, val]) => ({ axisId: key, label: key, score: val }));
      }
    } catch {
      // Stargazerプロファイルなくても予言は生成可能
    }

    const generated = await generateProphecy({
      userId,
      topTraits: topTraits.length > 0 ? topTraits : undefined,
    });

    // targetDate計算
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + generated.targetDaysFromNow);

    const { data: prophecy, error } = await supabaseAdmin
      .from("rendezvous_prophecies")
      .insert({
        user_id: userId,
        prophecy_text: generated.prophecyText,
        target_date: targetDate.toISOString().slice(0, 10),
        category: generated.category ?? null,
        engineered_via: null, // 実際のペアリングは後で設定
        engineered_params: {
          prophecyType: generated.prophecyType,
          hint: generated.hint,
        },
        state: "active",
      })
      .select("id, prophecy_text, target_date, category, created_at")
      .single();

    if (error) {
      console.error("[prophecy/generate] Insert error:", error);
      return NextResponse.json({ ok: false, error: "Failed to create prophecy" }, { status: 500 });
    }

    const daysUntil = generated.targetDaysFromNow;

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
    console.error("[prophecy/generate] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
