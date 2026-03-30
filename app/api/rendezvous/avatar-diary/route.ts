import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateDiaryEntry } from "@/lib/rendezvous/avatarGrowthDiary";

/**
 * GET /api/rendezvous/avatar-diary
 * 今日の分身日記を取得（未生成なら生成して返す）
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);

    // 既に今日の日記があるか確認
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_avatar_diary")
      .select("*")
      .eq("user_id", user.id)
      .eq("diary_date", today)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        entry: {
          text: existing.diary_text,
          tone: existing.tone,
          date: existing.diary_date,
        },
      });
    }

    // 今日のシグナルを収集
    const [swipeRes, chatRes] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_swipe_outcomes")
        .select("direction")
        .eq("user_id", user.id)
        .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabaseAdmin
        .from("rendezvous_messages")
        .select("sender_id")
        .or(`sender_id.eq.${user.id}`)
        .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

    const swipes = swipeRes.data ?? [];
    const chats = chatRes.data ?? [];

    const todaySignals = {
      swipeCount: swipes.length,
      likeCount: swipes.filter((s: any) => s.direction === "like").length,
      passCount: swipes.filter((s: any) => s.direction === "pass").length,
      viewingDurationTotal: 0,
      longestViewingDuration: 0,
      chatMessagesSent: chats.filter((c: any) => c.sender_id === user.id).length,
      chatMessagesReceived: chats.filter((c: any) => c.sender_id !== user.id).length,
      daysSinceLastActivity: 0,
      loginHour: new Date().getHours(),
    };

    // 生成してDB保存
    const entry = generateDiaryEntry({
      userId: user.id,
      date: new Date(),
      todaySignals,
    });

    // 保存（fire-and-forget）
    supabaseAdmin
      .from("rendezvous_avatar_diary")
      .insert({
        user_id: user.id,
        diary_date: today,
        diary_text: entry.text,
        tone: entry.tone,
      })
      .then(() => {});

    return NextResponse.json({ entry });
  } catch (err) {
    console.error("[avatar-diary] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
