import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser, getCounterpartId } from "@/lib/rendezvous/helpers";
import {
  detectHumanMoments,
  analyzeSilenceProfile,
  computeHumanProofScore,
  generateHumanProofNarrative,
} from "@/lib/rendezvous/humanProof";
import type {
  HumanProofMessage,
  SyncResultInput,
  ActivityInput,
  VectorSnapshotInput,
} from "@/lib/rendezvous/humanProof";
import type { MatchingVector } from "@/lib/rendezvous/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    // Auth
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { candidateId } = await params;
    const userId = auth.user.id;

    // Verify candidate belongs to user
    const result = await verifyCandidateBelongsToUser(supabaseAdmin, candidateId, userId);
    if (!result) {
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
    }

    const { candidate } = result;
    const counterpartId = getCounterpartId(candidate, userId);

    // Parallel fetch all needed data
    const [messagesResult, syncSessionsResult, activitiesResult, myVectorSnapshotsResult, theirVectorSnapshotsResult] =
      await Promise.all([
        // Messages (most recent 500)
        supabaseAdmin
          .from("rendezvous_messages")
          .select("id, sender_id, content, created_at")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
          .limit(500),

        // Sync experience results
        supabaseAdmin
          .from("sync_experience_sessions")
          .select("question_id, user_a_answer, user_b_answer, resonance_type")
          .eq("candidate_id", candidateId)
          .eq("status", "completed"),

        // Activities
        supabaseAdmin
          .from("rendezvous_activities")
          .select("type, user_id, payload, created_at")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
          .limit(100),

        // Vector snapshots for my user (from rendezvous_preferences history or stargazer)
        supabaseAdmin
          .from("rendezvous_preferences")
          .select("matching_vector, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(5),

        // Vector snapshots for counterpart
        supabaseAdmin
          .from("rendezvous_preferences")
          .select("matching_vector, updated_at")
          .eq("user_id", counterpartId)
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);

    // Transform messages
    const messages: HumanProofMessage[] = (messagesResult.data ?? []).map((m: any) => ({
      id: m.id,
      sender_id: m.sender_id,
      content: m.content ?? "",
      created_at: m.created_at,
    }));

    // Transform sync results
    const isUserA = candidate.user_a === userId;
    const syncResults: SyncResultInput[] = (syncSessionsResult.data ?? []).map((s: any) => ({
      questionId: s.question_id,
      myAnswer: isUserA ? s.user_a_answer : s.user_b_answer,
      theirAnswer: isUserA ? s.user_b_answer : s.user_a_answer,
      resonanceType: s.resonance_type,
    }));

    // Transform activities
    const activities: ActivityInput[] = (activitiesResult.data ?? []).map((a: any) => ({
      type: a.type,
      userId: a.user_id,
      payload: a.payload ?? {},
      createdAt: a.created_at,
    }));

    // Transform vector snapshots
    const vectorSnapshots: VectorSnapshotInput[] = [
      ...(myVectorSnapshotsResult.data ?? []).map((p: any) => ({
        userId,
        vector: (p.matching_vector ?? {}) as Partial<MatchingVector>,
        recordedAt: p.updated_at,
      })),
      ...(theirVectorSnapshotsResult.data ?? []).map((p: any) => ({
        userId: counterpartId,
        vector: (p.matching_vector ?? {}) as Partial<MatchingVector>,
        recordedAt: p.updated_at,
      })),
    ];

    // Detect human moments
    const moments = detectHumanMoments(
      candidateId,
      messages,
      syncResults,
      activities,
      vectorSnapshots,
      userId,
    );

    // Analyze silence profile
    const silenceProfile = analyzeSilenceProfile(messages, userId);

    // Compute score + narrative
    const proofScore = computeHumanProofScore(moments);
    const narrative = generateHumanProofNarrative(moments);

    return NextResponse.json({
      ok: true,
      moments,
      silenceProfile,
      proofScore,
      narrative,
    });
  } catch (err: any) {
    console.error("[rendezvous/human-proof] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
