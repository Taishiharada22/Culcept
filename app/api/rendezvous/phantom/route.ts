import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generatePhantomSignal } from "@/lib/rendezvous/phantomPresence";

// ============================================================
// GET /api/rendezvous/phantom
// Checks for active resonant users and generates phantom signal
// IMPORTANT: Never reveals identity, count, or specifics
// ============================================================

export async function GET(_request: NextRequest) {
  try {
    // Auth
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getHours();

    // 1. Count how many phantom signals already sent today
    const { count: signalsSentToday } = await supabaseAdmin
      .from("rendezvous_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("notification_type", "phantom_signal")
      .gte("created_at", `${todayStr}T00:00:00`)
      .lte("created_at", `${todayStr}T23:59:59`);

    // 2. Find resonant users who have been active recently (last 30 minutes)
    //    We use rendezvous_candidates where this user appears, with high compatibility
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const { data: recentCandidates } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("user_a, user_b, overall_score, category")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .gte("overall_score", 60)
      .not("state", "in", "(expired,dismissed)")
      .limit(50);

    if (!recentCandidates || recentCandidates.length === 0) {
      return NextResponse.json({ ok: true, signal: null });
    }

    // 3. Check which counterpart users were active recently
    const counterpartIds = recentCandidates.map((c) =>
      c.user_a === userId ? c.user_b : c.user_a,
    );

    const { data: activeUsers } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id")
      .in("user_id", counterpartIds)
      .gte("last_active_at", thirtyMinAgo);

    const activeCounterpartIds = new Set(
      (activeUsers ?? []).map((u) => u.user_id),
    );

    // 4. Filter candidates to only those with active counterparts
    const activeCandidates = recentCandidates.filter((c) => {
      const counterpart = c.user_a === userId ? c.user_b : c.user_a;
      return activeCounterpartIds.has(counterpart);
    });

    if (activeCandidates.length === 0) {
      return NextResponse.json({ ok: true, signal: null });
    }

    // 5. Compute resonant count and top score
    const resonantCount = activeCandidates.length;
    const topResonanceScore = Math.max(
      ...activeCandidates.map((c) => c.overall_score ?? 0),
    );
    const topCategory = activeCandidates.reduce(
      (best, c) =>
        (c.overall_score ?? 0) > (best.overall_score ?? 0) ? c : best,
      activeCandidates[0],
    ).category;

    // 6. Generate signal
    const signal = generatePhantomSignal(
      resonantCount,
      topResonanceScore,
      topCategory as Parameters<typeof generatePhantomSignal>[2],
      currentHour,
      signalsSentToday ?? 0,
    );

    // 7. Log signal if generated (for daily limit tracking)
    if (signal) {
      await supabaseAdmin.from("rendezvous_notifications").insert({
        user_id: userId,
        notification_type: "phantom_signal",
        scheduled_for: signal.generatedAt,
        sent_at: signal.generatedAt,
        status: "sent",
        payload: {
          resonanceHint: signal.resonanceHint,
          intensity: signal.intensity,
        },
        created_at: signal.generatedAt,
      });
    }

    return NextResponse.json({ ok: true, signal });
  } catch (err) {
    console.error("[phantom] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
