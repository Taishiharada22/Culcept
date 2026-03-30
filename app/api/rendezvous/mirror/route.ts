import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCounterpartId } from "@/lib/rendezvous/helpers";
import { buildMirrorProfile } from "@/lib/rendezvous/relationshipMirror";
import { detectUnconsciousPatterns } from "@/lib/rendezvous/unconsciousPatterns";
import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
} from "@/lib/rendezvous/types";

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

    // 1. Fetch all user's candidates
    const { data: rawCandidates, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .not("state", "in", "(expired,dismissed)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (candErr) {
      return NextResponse.json(
        { ok: false, error: candErr.message },
        { status: 500 },
      );
    }

    const candidates = (rawCandidates ?? []) as RendezvousCandidate[];

    if (candidates.length === 0) {
      const emptyMirror = buildMirrorProfile(userId, [], [], []);
      return NextResponse.json({
        ok: true,
        mirror: emptyMirror,
        unconsciousPatterns: [],
      });
    }

    const candidateIds = candidates.map((c) => c.id);

    // 2. Fetch user states for all candidates
    const { data: rawStates, error: stateErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("*")
      .eq("user_id", userId)
      .in("candidate_id", candidateIds);

    if (stateErr) {
      return NextResponse.json(
        { ok: false, error: stateErr.message },
        { status: 500 },
      );
    }

    const userStates = ((rawStates ?? []) as RendezvousUserStateRow[]).map(
      (s) => ({
        candidateId: s.candidate_id,
        state: s.state,
        likedAt: s.liked_at ?? undefined,
        passedAt: s.passed_at ?? undefined,
      }),
    );

    // 3. Fetch message stats (aggregated from rendezvous_messages)
    const messageStats: {
      candidateId: string;
      messageCount: number;
      avgLength: number;
      initiatedByUser: number;
    }[] = [];

    // Batch fetch message counts per candidate
    for (const c of candidates) {
      const threadId = c.id; // thread_id is typically the candidate_id

      const { count: totalCount } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("*", { count: "exact", head: true })
        .eq("candidate_id", c.id);

      const { count: userCount } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("*", { count: "exact", head: true })
        .eq("candidate_id", c.id)
        .eq("sender_id", userId);

      // Get average message length
      const { data: msgs } = await supabaseAdmin
        .from("rendezvous_messages")
        .select("body")
        .eq("candidate_id", c.id)
        .limit(50);

      const bodies = (msgs ?? []).map((m: any) => m.body ?? "");
      const avgLen =
        bodies.length > 0
          ? bodies.reduce((sum: number, b: string) => sum + b.length, 0) /
            bodies.length
          : 0;

      messageStats.push({
        candidateId: c.id,
        messageCount: totalCount ?? 0,
        avgLength: avgLen,
        initiatedByUser: userCount ?? 0,
      });
    }

    // 4. Fetch view logs (from rendezvous_view_logs if available, otherwise approximate)
    let viewLogs: {
      candidateId: string;
      viewDurationMs: number;
      viewCount: number;
      category: import("@/lib/rendezvous/types").RendezvousCategory;
    }[] = [];

    // Try to fetch view logs - table may not exist yet
    try {
      const { data: rawViews } = await supabaseAdmin
        .from("rendezvous_view_logs")
        .select("candidate_id, view_duration_ms, view_count")
        .eq("user_id", userId)
        .in("candidate_id", candidateIds);

      if (rawViews && rawViews.length > 0) {
        const candidateMap = new Map(candidates.map((c) => [c.id, c]));
        viewLogs = rawViews.map((v: any) => ({
          candidateId: v.candidate_id,
          viewDurationMs: v.view_duration_ms ?? 0,
          viewCount: v.view_count ?? 1,
          category: (candidateMap.get(v.candidate_id)?.category ?? "friendship") as import("@/lib/rendezvous/types").RendezvousCategory,
        }));
      }
    } catch {
      // View logs table may not exist yet - continue without it
    }

    // 5. Build mirror profile
    const mirror = buildMirrorProfile(
      userId,
      candidates,
      userStates,
      messageStats,
    );

    // 6. Detect unconscious patterns
    const unconsciousPatterns = detectUnconsciousPatterns(
      userId,
      candidates,
      userStates,
      viewLogs,
      messageStats,
    );

    return NextResponse.json({
      ok: true,
      mirror,
      unconsciousPatterns,
    });
  } catch (err: any) {
    console.error("[rendezvous/mirror] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
