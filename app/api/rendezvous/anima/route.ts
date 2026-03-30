import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateAnimaInsights,
  generateWeeklyLetter,
  selectAnimaVoiceTone,
} from "@/lib/rendezvous/anima";
import type { AnimaContext, AnimaCandidateSnapshot } from "@/lib/rendezvous/anima";
import type { RendezvousCandidate } from "@/lib/rendezvous/types";

// =============================================================================
// GET - Generate Anima insights for the current user
// =============================================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;

    // 1. Fetch candidates
    const { data: rawCandidates } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, category, state, user_a, user_b, created_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .not("state", "in", "(expired,dismissed)")
      .order("created_at", { ascending: false })
      .limit(20);

    const candidates = (rawCandidates ?? []) as Pick<
      RendezvousCandidate,
      "id" | "category" | "state" | "user_a" | "user_b" | "created_at"
    >[];

    // 2. Fetch message counts per candidate
    const candidateSnapshots: AnimaCandidateSnapshot[] = [];
    for (const c of candidates) {
      const { count } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("*", { count: "exact", head: true })
        .eq("candidate_id", c.id);

      // Fetch last message time
      const { data: lastMsg } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("created_at")
        .eq("candidate_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1);

      candidateSnapshots.push({
        id: c.id,
        category: c.category,
        state: c.state,
        messageCount: count ?? 0,
        lastMessageAt: lastMsg?.[0]?.created_at ?? undefined,
      });
    }

    // 3. Fetch mirror archetype (best-effort)
    let mirrorArchetype: string | undefined;
    try {
      const { data: mirrorRow } = await supabaseAdmin
        .from("rendezvous_mirror_profiles")
        .select("archetype")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mirrorArchetype = mirrorRow?.archetype ?? undefined;
    } catch {
      // Table may not exist yet
    }

    // 4. Fetch season data (best-effort)
    let seasonData: AnimaContext["seasonData"];
    try {
      const candidateIds = candidates.map((c) => c.id);
      if (candidateIds.length > 0) {
        const { data: seasonRows } = await supabaseAdmin
          .from("rendezvous_season_snapshots")
          .select("candidate_id, current_season, progress")
          .in("candidate_id", candidateIds)
          .order("created_at", { ascending: false });

        if (seasonRows && seasonRows.length > 0) {
          // Deduplicate: take latest per candidate
          const seen = new Set<string>();
          seasonData = [];
          for (const row of seasonRows) {
            if (!seen.has(row.candidate_id)) {
              seen.add(row.candidate_id);
              seasonData.push({
                candidateId: row.candidate_id,
                currentSeason: row.current_season,
                progress: row.progress ?? 0,
              });
            }
          }
        }
      }
    } catch {
      // Table may not exist yet
    }

    // 5. Fetch trajectory data (best-effort)
    let trajectoryDirections: AnimaContext["trajectoryDirections"];
    try {
      const candidateIds = candidates.map((c) => c.id);
      if (candidateIds.length > 0) {
        const { data: trajRows } = await supabaseAdmin
          .from("rendezvous_living_scores")
          .select("candidate_id, direction, score")
          .eq("user_id", userId)
          .in("candidate_id", candidateIds)
          .order("created_at", { ascending: false });

        if (trajRows && trajRows.length > 0) {
          const seen = new Set<string>();
          trajectoryDirections = [];
          for (const row of trajRows) {
            if (!seen.has(row.candidate_id)) {
              seen.add(row.candidate_id);
              trajectoryDirections.push({
                candidateId: row.candidate_id,
                direction: row.direction ?? "stable",
                livingScore: row.score ?? 50,
              });
            }
          }
        }
      }
    } catch {
      // Table may not exist yet
    }

    // 6. Fetch observatory summary (best-effort)
    let observatoryInsights: AnimaContext["observatoryInsights"];
    try {
      const { data: obsRows } = await supabaseAdmin
        .from("implicit_observatory_adjustments")
        .select("axis, delta, description")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (obsRows && obsRows.length > 0) {
        observatoryInsights = obsRows.map((r: any) => ({
          axis: r.axis,
          delta: r.delta,
          description: r.description ?? undefined,
        }));
      }
    } catch {
      // Table may not exist yet
    }

    // 7. Compute streak (best-effort)
    let streakDays: number | undefined;
    try {
      const { data: streakRow } = await supabaseAdmin
        .from("rendezvous_engagement_streaks")
        .select("streak_days")
        .eq("user_id", userId)
        .maybeSingle();
      streakDays = streakRow?.streak_days ?? undefined;
    } catch {
      // Table may not exist yet
    }

    // 8. Fetch dismissed insights to filter them out
    let dismissedTypes: Set<string> = new Set();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: dismissed } = await supabaseAdmin
        .from("rendezvous_anima_log")
        .select("insight_type")
        .eq("user_id", userId)
        .eq("dismissed", true)
        .gte("created_at", `${today}T00:00:00Z`);

      if (dismissed) {
        dismissedTypes = new Set(dismissed.map((d: any) => d.insight_type));
      }
    } catch {
      // Table may not exist yet
    }

    // 9. Build context & generate
    const animaCtx: AnimaContext = {
      userId,
      candidates: candidateSnapshots,
      mirrorArchetype,
      seasonData,
      trajectoryDirections,
      observatoryInsights,
      streakDays,
    };

    const insights = generateAnimaInsights(animaCtx).filter(
      (i) => !dismissedTypes.has(i.type),
    );

    const tone = selectAnimaVoiceTone(animaCtx);

    // 10. Log generated insights (best-effort)
    try {
      if (insights.length > 0) {
        await supabaseAdmin.from("rendezvous_anima_log").insert(
          insights.map((i) => ({
            user_id: userId,
            insight_type: i.type,
            insight_message: i.message,
            dismissed: false,
          })),
        );
      }
    } catch {
      // Logging failure is non-critical
    }

    return NextResponse.json({ ok: true, insights, tone });
  } catch (err: any) {
    console.error("[rendezvous/anima] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST - Dismiss insight or generate weekly letter
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;
    const body = await req.json();
    const action = body.action as string;

    // ---- Dismiss ----
    if (action === "dismiss") {
      const insightId = body.insightId as string;
      if (!insightId) {
        return NextResponse.json(
          { ok: false, error: "insightId required" },
          { status: 400 },
        );
      }

      // Mark as dismissed in log
      await supabaseAdmin
        .from("rendezvous_anima_log")
        .update({ dismissed: true })
        .eq("user_id", userId)
        .eq("insight_type", body.insightType ?? "unknown");

      return NextResponse.json({ ok: true });
    }

    // ---- Weekly Letter ----
    if (action === "weekly_letter") {
      // Build minimal context for weekly letter
      const { data: rawCandidates } = await supabaseAdmin
        .from("rendezvous_candidates")
        .select("id, category, state, user_a, user_b")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .not("state", "in", "(expired,dismissed)")
        .order("created_at", { ascending: false })
        .limit(20);

      const candidates = (rawCandidates ?? []) as Pick<
        RendezvousCandidate,
        "id" | "category" | "state" | "user_a" | "user_b"
      >[];

      const snapshots: AnimaCandidateSnapshot[] = [];
      for (const c of candidates) {
        const { count } = await supabaseAdmin
          .from("rendezvous_messages")
          .select("*", { count: "exact", head: true })
          .eq("candidate_id", c.id);
        snapshots.push({
          id: c.id,
          category: c.category,
          state: c.state,
          messageCount: count ?? 0,
        });
      }

      // Fetch trajectory for letter
      let trajectoryDirections: AnimaContext["trajectoryDirections"];
      try {
        const candidateIds = candidates.map((c) => c.id);
        if (candidateIds.length > 0) {
          const { data: trajRows } = await supabaseAdmin
            .from("rendezvous_living_scores")
            .select("candidate_id, direction, score")
            .eq("user_id", userId)
            .in("candidate_id", candidateIds)
            .order("created_at", { ascending: false });

          if (trajRows && trajRows.length > 0) {
            const seen = new Set<string>();
            trajectoryDirections = [];
            for (const row of trajRows) {
              if (!seen.has(row.candidate_id)) {
                seen.add(row.candidate_id);
                trajectoryDirections.push({
                  candidateId: row.candidate_id,
                  direction: row.direction ?? "stable",
                  livingScore: row.score ?? 50,
                });
              }
            }
          }
        }
      } catch {
        // best-effort
      }

      const animaCtx: AnimaContext = {
        userId,
        candidates: snapshots,
        trajectoryDirections,
      };

      const letter = generateWeeklyLetter(animaCtx);

      // Log the letter
      try {
        await supabaseAdmin.from("rendezvous_anima_log").insert({
          user_id: userId,
          insight_type: letter.type,
          insight_message: letter.message,
          dismissed: false,
        });
      } catch {
        // non-critical
      }

      return NextResponse.json({ ok: true, letter });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    console.error("[rendezvous/anima] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
