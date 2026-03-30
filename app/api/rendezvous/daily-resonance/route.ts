import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateDailyResonance } from "@/lib/rendezvous/dailyResonance";

/**
 * GET /api/rendezvous/daily-resonance
 * 今日の日次共鳴を取得（未生成なら生成して返す）
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);

    // 既に今日の共鳴があるか確認
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_daily_resonances")
      .select("*")
      .eq("user_id", user.id)
      .eq("resonance_date", today)
      .single();

    if (existing) {
      return NextResponse.json({
        resonance: {
          text: existing.resonance_text,
          subtext: existing.resonance_subtext,
          sourceType: existing.source_type,
          date: existing.resonance_date,
        },
      });
    }

    // シグナル収集（直近のスワイプ・閲覧データ）
    const [swipeRes, viewRes] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_swipe_outcomes")
        .select("direction, category, dimensions_at_swipe")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("rendezvous_user_states")
        .select("candidate_id, seen_at")
        .eq("user_id", user.id)
        .not("seen_at", "is", null)
        .order("seen_at", { ascending: false })
        .limit(10),
    ]);

    // スワイプパターンをシグナルに変換
    const recentSwipes = (swipeRes.data ?? [])
      .filter((s) => s.dimensions_at_swipe)
      .map((s) => {
        const dims = s.dimensions_at_swipe as Record<string, number>;
        const topEntry = Object.entries(dims).sort((a, b) => b[1] - a[1])[0];
        return {
          direction: s.direction as "like" | "pass",
          category: s.category,
          topDimension: topEntry?.[0] ?? "unknown",
          topDimensionScore: topEntry?.[1] ?? 0,
        };
      });

    // 共鳴を生成
    const resonance = generateDailyResonance({
      userId: user.id,
      date: new Date(),
      recentSwipes: recentSwipes.length >= 5 ? recentSwipes : undefined,
    });

    // DBに保存（fire-and-forget）
    supabaseAdmin
      .from("rendezvous_daily_resonances")
      .insert({
        user_id: user.id,
        resonance_date: today,
        resonance_text: resonance.text,
        resonance_subtext: resonance.subtext,
        source_type: resonance.sourceType,
      })
      .then(() => {});

    return NextResponse.json({ resonance });
  } catch (err) {
    console.error("[daily-resonance] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
