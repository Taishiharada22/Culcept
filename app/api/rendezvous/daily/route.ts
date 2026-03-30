import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeDeliverySchedule,
  remainingDeliveriesForToday,
  type EngagementHistory,
} from "@/lib/rendezvous/adaptivePacing";

/**
 * GET /api/rendezvous/daily
 * 今日のRendezvousデイリーフック:
 * - 新候補数
 * - 今日の軌道サマリー
 * - デイリーインサイト
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Parallel data fetch
    const [newCandidates, recentEncounters, profile] = await Promise.all([
      // Count new (unseen) candidates
      supabaseAdmin
        .from("rendezvous_user_states")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("state", "unseen"),

      // Count encounters evaluated today
      supabaseAdmin
        .from("encounter_events")
        .select("id", { count: "exact", head: true })
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .gte("created_at", todayStart.toISOString()),

      // Get profile for personalization
      supabaseAdmin
        .from("rendezvous_profiles")
        .select("enabled_categories, display_name")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const newCount = newCandidates.count ?? 0;
    const encounterCount = recentEncounters.count ?? 0;

    // Generate daily insight
    const insights = generateDailyInsight(newCount, encounterCount);

    // Adaptive pacing — compute delivery schedule based on engagement
    let pacing: { recommendedDelayMinutes: number; batchSize: number; deliveryNarrative: string; reason: string } | null = null;
    try {
      const engagement: EngagementHistory = {
        opensLast24h: encounterCount,
        opensLast7d: Math.min(encounterCount * 3, 20), // Rough estimate
        swipesLast24h: encounterCount,
        avgSessionDurationMs: 180_000, // Default 3 min
        daysSinceLastOpen: 0,
        candidatesDeliveredToday: newCount,
      };
      const schedule = computeDeliverySchedule(engagement);
      pacing = {
        recommendedDelayMinutes: schedule.recommendedDelayMinutes,
        batchSize: schedule.batchSize,
        deliveryNarrative: schedule.deliveryNarrative,
        reason: schedule.reason,
      };
    } catch (e) {
      console.warn("[rendezvous/daily] pacing computation failed:", e);
    }

    return NextResponse.json({
      ok: true,
      daily: {
        newCandidateCount: newCount,
        todayEncounterCount: encounterCount,
        insight: insights.text,
        insightEmoji: insights.emoji,
        greeting: getGreeting(),
        pacing,
        remainingDeliveries: remainingDeliveriesForToday(newCount),
      },
    });
  } catch (err: any) {
    console.error("[rendezvous/daily] error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜の静寂の中で";
  if (h < 12) return "おはようございます";
  if (h < 18) return "こんにちは";
  return "こんばんは";
}

function generateDailyInsight(
  newCount: number,
  encounterCount: number,
): { text: string; emoji: string } {
  if (newCount > 0) {
    return {
      text: `${newCount}件の新しい交差があなたを待っています`,
      emoji: "✨",
    };
  }
  if (encounterCount > 0) {
    return {
      text: `今日、あなたの分身は${encounterCount}の軌道を探索しました`,
      emoji: "🌀",
    };
  }
  return {
    text: "分身は静かに軌道を巡回中。新しい交差が見つかり次第お知らせします",
    emoji: "🔭",
  };
}
