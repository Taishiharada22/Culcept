import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";
import {
  detectJourneyStage,
  computeJourneyState,
  type SeasonData,
} from "@/lib/rendezvous/journeyOrchestrator";

// =============================================================================
// GET /api/rendezvous/[candidateId]/journey
// ジャーニーオーケストレーターの状態を返す
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { candidateId } = await params;
    const userId = auth.user.id;

    // Verify candidate belongs to user
    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found" },
        { status: 404 },
      );
    }

    // ---- Parallel data fetching ----
    const [
      messagesResult,
      milestonesResult,
      activitiesResult,
      seasonStateResult,
    ] = await Promise.all([
      // Message count
      supabaseAdmin
        .from("rendezvous_messages")
        .select("id, created_at", { count: "exact" })
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1),
      // Milestones
      supabaseAdmin
        .from("rendezvous_chat_milestones")
        .select("milestone_type, reached_at")
        .eq("candidate_id", candidateId)
        .order("reached_at", { ascending: true }),
      // Completed activities
      supabaseAdmin
        .from("rendezvous_activities")
        .select("activity_type, status")
        .eq("candidate_id", candidateId)
        .in("status", ["completed", "done"]),
      // Season state
      supabaseAdmin
        .from("rendezvous_context_states")
        .select("value")
        .eq("candidate_id", candidateId)
        .eq("key", "relationship_season_history")
        .maybeSingle(),
    ]);

    const messageCount = messagesResult.count ?? 0;

    // Days since first message
    const firstMessageAt = result.candidate.created_at;
    const daysSinceFirst = firstMessageAt
      ? Math.floor(
          (Date.now() - new Date(firstMessageAt).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : 0;

    // Last message days ago
    const lastMessageAt =
      messagesResult.data && messagesResult.data.length > 0
        ? messagesResult.data[0].created_at
        : null;
    const lastMessageDaysAgo = lastMessageAt
      ? Math.floor(
          (Date.now() - new Date(lastMessageAt).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : daysSinceFirst; // If no messages, use daysSinceFirst as fallback

    // Milestones
    const milestones = (milestonesResult.data ?? []).map((r) => ({
      type: r.milestone_type as string,
      reachedAt: r.reached_at as string,
    }));

    // Completed activities
    const completedActivities = (activitiesResult.data ?? []).map(
      (a) => a.activity_type as string,
    );

    // Season data
    let seasonData: SeasonData | null = null;
    if (seasonStateResult.data?.value) {
      try {
        const parsed =
          typeof seasonStateResult.data.value === "string"
            ? JSON.parse(seasonStateResult.data.value)
            : seasonStateResult.data.value;
        if (Array.isArray(parsed)) {
          const lastPhase = parsed[parsed.length - 1];
          seasonData = {
            currentSeason: lastPhase?.season ?? undefined,
            seasonPhaseCount: parsed.length,
          };
        }
      } catch {
        // ignore parse errors
      }
    }

    // ---- Detect stage ----
    const stage = detectJourneyStage(
      messageCount,
      daysSinceFirst,
      milestones.length,
      lastMessageDaysAgo,
    );

    // ---- Compute journey state ----
    const journey = computeJourneyState(
      candidateId,
      stage,
      messageCount,
      milestones,
      completedActivities,
      seasonData,
    );

    return NextResponse.json({ ok: true, journey });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[rendezvous/journey] error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
