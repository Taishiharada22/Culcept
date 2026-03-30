import { NextResponse } from "next/server";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateAnimaInsights,
  generateWeeklyLetter,
  type AnimaContext,
  type AnimaCandidateSnapshot,
} from "@/lib/rendezvous/anima";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/rendezvous-anima-generation
 *
 * Cronジョブ: アクティブユーザーごとにAnimaInsightsを生成し、
 * rendezvous_anima_insights テーブルに保存する。
 *
 * 日次実行。各ユーザーにつき1-3件のインサイト生成。
 * 日曜日は追加でweekly_letter生成。
 */
export async function GET(request: Request) {
  const t = await trackCronRun("rendezvous-anima-generation");
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    await t.finish({ ok: false, summary: "unauthorized" });
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const isWeeklyDay = now.getDay() === 0; // Sunday

    // 1. Fetch active profiles (onboarding completed)
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id")
      .eq("is_enabled", true)
      .not("onboarding_completed_at", "is", null);

    if (profErr) {
      console.error("[anima-gen] profiles error:", profErr);
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ ok: true, usersProcessed: 0, insightsGenerated: 0 });
    }

    let usersProcessed = 0;
    let insightsGenerated = 0;

    for (const profile of profiles) {
      const userId = profile.user_id;

      // Skip if already generated today
      const { count: existingToday } = await supabaseAdmin
        .from("rendezvous_anima_insights")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", `${todayStr}T00:00:00`)
        .lte("created_at", `${todayStr}T23:59:59`);

      if ((existingToday ?? 0) > 0) continue;

      // Build AnimaContext
      const ctx = await buildAnimaContext(userId);
      if (!ctx) continue;

      // Generate insights
      const insights = generateAnimaInsights(ctx);

      // Add weekly letter on Sundays
      if (isWeeklyDay) {
        const letter = generateWeeklyLetter(ctx);
        insights.push(letter);
      }

      // Save to DB
      for (const insight of insights) {
        const { error: insertErr } = await supabaseAdmin
          .from("rendezvous_anima_insights")
          .insert({
            user_id: userId,
            insight_type: insight.type,
            message: insight.message,
            subtext: insight.subtext ?? null,
            source: insight.source,
            priority: insight.priority,
            emotional_tone: insight.emotionalTone,
            related_candidate_id: insight.relatedCandidateId ?? null,
            created_at: insight.createdAt,
          });

        if (insertErr) {
          console.warn(`[anima-gen] insert error for user ${userId}:`, insertErr.message);
        } else {
          insightsGenerated++;
        }
      }

      usersProcessed++;
    }

    console.log(
      `[anima-gen] Done: ${usersProcessed} users processed, ${insightsGenerated} insights generated`,
    );

    await t.finish({ ok: true, summary: `users=${usersProcessed}, insights=${insightsGenerated}` });
    return NextResponse.json({
      ok: true,
      usersProcessed,
      insightsGenerated,
      isWeeklyDay,
    });
  } catch (err: any) {
    console.error("[anima-gen] error:", err);
    await t.finish({ ok: false, summary: err.message ?? "fatal" });
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * ユーザーのAnimaContextを構築する
 */
async function buildAnimaContext(userId: string): Promise<AnimaContext | null> {
  try {
    // Fetch candidates
    const { data: candidates } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, category, state, user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .not("state", "in", "(expired,dismissed)");

    if (!candidates || candidates.length === 0) {
      return null;
    }

    // Fetch message counts per candidate
    const candidateSnapshots: AnimaCandidateSnapshot[] = [];
    for (const c of candidates) {
      const { count } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("*", { count: "exact", head: true })
        .eq("candidate_id", c.id);

      const { data: lastMsg } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("created_at")
        .eq("candidate_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      candidateSnapshots.push({
        id: c.id,
        category: c.category,
        state: c.state,
        messageCount: count ?? 0,
        lastMessageAt: lastMsg?.created_at,
      });
    }

    // Fetch streak
    const { data: streakRow } = await supabaseAdmin
      .from("rendezvous_engagement_streaks")
      .select("current_streak")
      .eq("user_id", userId)
      .maybeSingle();

    // Fetch mirror archetype
    const { data: mirrorRow } = await supabaseAdmin
      .from("rendezvous_mirror_profiles")
      .select("archetype")
      .eq("user_id", userId)
      .maybeSingle();

    // Fetch season data
    const { data: seasons } = await supabaseAdmin
      .from("rendezvous_seasons")
      .select("candidate_id, current_season, progress")
      .in(
        "candidate_id",
        candidates.map((c: any) => c.id),
      );

    // Fetch living scores for trajectory
    const candidateIds = candidates.map((c: any) => c.id);
    const { data: livingScores } = await supabaseAdmin
      .from("rendezvous_living_scores")
      .select("candidate_id, living_score, trajectory_direction")
      .in("candidate_id", candidateIds);

    // Fetch observatory adjustments
    const { data: obsAdj } = await supabaseAdmin
      .from("implicit_observatory_adjustments")
      .select("axis, delta, reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      userId,
      candidates: candidateSnapshots,
      recentPatterns: undefined, // Would come from pattern detection
      seasonData: (seasons ?? []).map((s: any) => ({
        candidateId: s.candidate_id,
        currentSeason: s.current_season,
        progress: s.progress ?? 0,
      })),
      mirrorArchetype: mirrorRow?.archetype,
      trajectoryDirections: (livingScores ?? []).map((ls: any) => ({
        candidateId: ls.candidate_id,
        direction: ls.trajectory_direction ?? "stable",
        livingScore: ls.living_score ?? 0.5,
      })),
      observatoryInsights: (obsAdj ?? []).map((a: any) => ({
        axis: a.axis,
        delta: a.delta,
        description: a.reason,
      })),
      streakDays: streakRow?.current_streak ?? 0,
    };
  } catch (err) {
    console.warn(`[anima-gen] context build error for ${userId}:`, err);
    return null;
  }
}
