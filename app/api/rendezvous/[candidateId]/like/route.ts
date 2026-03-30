import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCounterpartId,
  verifyCandidateBelongsToUser,
} from "@/lib/rendezvous/helpers";
import { checkPartnerGate } from "@/lib/rendezvous/verificationLevel";
import { fetchVerificationProfile } from "@/lib/rendezvous/fetchVerificationProfile";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    // Auth via supabaseServer (user-scoped)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const { candidateId } = await params;
    const userId = auth.user.id;

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
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

    const { candidate, myState } = result;
    const counterpartId = getCounterpartId(candidate, userId);
    const now = new Date().toISOString();

    // Partner gate check: L3 + review_status=approved required
    if (candidate.category === "partner") {
      const vProfile = await fetchVerificationProfile(supabaseAdmin, userId);
      const gate = checkPartnerGate("like", vProfile);
      if (!gate.allowed) {
        return NextResponse.json(
          { ok: false, error: gate.reason, requiredLevel: gate.requiredLevel, currentLevel: gate.currentLevel },
          { status: 403 },
        );
      }
    }

    // Cannot like if already liked/passed/expired
    if (
      myState.state === "liked" ||
      myState.state === "passed" ||
      myState.state === "expired"
    ) {
      return NextResponse.json(
        { ok: false, error: `Cannot like from state: ${myState.state}` },
        { status: 400 },
      );
    }

    // Step 1: Update my user_state to liked
    const { error: likeErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .update({
        state: "liked",
        liked_at: now,
      })
      .eq("id", myState.id);

    if (likeErr) {
      return NextResponse.json(
        { ok: false, error: likeErr.message },
        { status: 500 },
      );
    }

    // Step 2: Check counterpart's state (cross-user read requires admin)
    const { data: counterpartState, error: cpErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("user_id", counterpartId)
      .single();

    if (cpErr) {
      // Rollback my state
      await supabaseAdmin
        .from("rendezvous_user_states")
        .update({ state: myState.state, liked_at: myState.liked_at })
        .eq("id", myState.id);
      return NextResponse.json(
        { ok: false, error: cpErr.message },
        { status: 500 },
      );
    }

    const counterpartLiked = counterpartState?.state === "liked";

    if (counterpartLiked) {
      // Step 3a: Mutual like! Update candidate state
      const { error: mutualErr } = await supabaseAdmin
        .from("rendezvous_candidates")
        .update({
          state: "mutual_liked",
          matched_at: now,
        })
        .eq("id", candidateId);

      if (mutualErr) {
        // Rollback my state
        await supabaseAdmin
          .from("rendezvous_user_states")
          .update({ state: myState.state, liked_at: myState.liked_at })
          .eq("id", myState.id);
        return NextResponse.json(
          { ok: false, error: mutualErr.message },
          { status: 500 },
        );
      }

      // Create chat thread
      const threadId = crypto.randomUUID();
      const { error: chatErr } = await supabaseAdmin
        .from("rendezvous_chats")
        .insert({
          candidate_id: candidateId,
          thread_id: threadId,
          opened_by_user_id: userId,
          opened_at: now,
        });

      if (chatErr) {
        console.error(
          "[rendezvous/like] failed to create chat:",
          chatErr,
        );
        // Not rolling back - mutual like is still valid
      }

      // Log the event
      await supabaseAdmin.from("rendezvous_candidate_logs").insert({
        candidate_id: candidateId,
        event_type: "mutual_liked",
        payload: {
          triggered_by: userId,
          matched_at: now,
          thread_id: threadId,
        },
      });

      // Push notifications for mutual match (delayed — Rendezvous core principle)
      try {
        const { notifyNewMatchDelayed } = await import("@/lib/push/sendPushNotification");
        const [profA, profB] = await Promise.all([
          supabaseAdmin.from("rendezvous_profiles").select("display_name").eq("user_id", candidate.user_a).maybeSingle(),
          supabaseAdmin.from("rendezvous_profiles").select("display_name").eq("user_id", candidate.user_b).maybeSingle(),
        ]);
        notifyNewMatchDelayed(candidate.user_b, profA.data?.display_name ?? "誰か", candidateId).catch(() => {});
        notifyNewMatchDelayed(candidate.user_a, profB.data?.display_name ?? "誰か", candidateId).catch(() => {});
      } catch { /* non-critical */ }

      // Orbiter Signal: Like (mutual)
      const seenAt = myState.seen_at
        ? new Date(myState.seen_at).getTime()
        : null;
      const timeToDecisionMs = seenAt ? Date.now() - seenAt : null;
      await supabaseAdmin
        .from("orbiter_signals")
        .insert({
          user_id: userId,
          candidate_id: candidateId,
          signal_type: "like",
          payload: { decision: "like", timeToDecisionMs },
        }); // fire-and-forget

      return NextResponse.json({
        ok: true,
        status: "mutual_liked",
        threadId,
      });
    } else {
      // Step 3b: One-sided like - update candidate state to a_liked or b_liked
      const isUserA = candidate.user_a === userId;
      const newCandidateState = isUserA ? "a_liked" : "b_liked";

      // Only update if candidate is not already in a_liked/b_liked from other side
      const currentCandidateState = candidate.state;
      const otherSideLiked =
        (isUserA && currentCandidateState === "b_liked") ||
        (!isUserA && currentCandidateState === "a_liked");

      if (otherSideLiked) {
        // Actually this means mutual! The counterpart state check may have missed it
        const { error: mutualErr } = await supabaseAdmin
          .from("rendezvous_candidates")
          .update({
            state: "mutual_liked",
            matched_at: now,
          })
          .eq("id", candidateId);

        if (mutualErr) {
          await supabaseAdmin
            .from("rendezvous_user_states")
            .update({
              state: myState.state,
              liked_at: myState.liked_at,
            })
            .eq("id", myState.id);
          return NextResponse.json(
            { ok: false, error: mutualErr.message },
            { status: 500 },
          );
        }

        const threadId = crypto.randomUUID();
        await supabaseAdmin.from("rendezvous_chats").insert({
          candidate_id: candidateId,
          thread_id: threadId,
          opened_by_user_id: userId,
          opened_at: now,
        });

        await supabaseAdmin.from("rendezvous_candidate_logs").insert({
          candidate_id: candidateId,
          event_type: "mutual_liked",
          payload: {
            triggered_by: userId,
            matched_at: now,
            thread_id: threadId,
          },
        });

        // Push notifications for mutual match (delayed — Rendezvous core principle)
        try {
          const { notifyNewMatchDelayed } = await import("@/lib/push/sendPushNotification");
          const [profA2, profB2] = await Promise.all([
            supabaseAdmin.from("rendezvous_profiles").select("display_name").eq("user_id", candidate.user_a).maybeSingle(),
            supabaseAdmin.from("rendezvous_profiles").select("display_name").eq("user_id", candidate.user_b).maybeSingle(),
          ]);
          notifyNewMatchDelayed(candidate.user_b, profA2.data?.display_name ?? "誰か", candidateId).catch(() => {});
          notifyNewMatchDelayed(candidate.user_a, profB2.data?.display_name ?? "誰か", candidateId).catch(() => {});
        } catch { /* non-critical */ }

        return NextResponse.json({
          ok: true,
          status: "mutual_liked",
          threadId,
        });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("rendezvous_candidates")
        .update({ state: newCandidateState })
        .eq("id", candidateId);

      if (updateErr) {
        // Rollback my state
        await supabaseAdmin
          .from("rendezvous_user_states")
          .update({ state: myState.state, liked_at: myState.liked_at })
          .eq("id", myState.id);
        return NextResponse.json(
          { ok: false, error: updateErr.message },
          { status: 500 },
        );
      }

      // Log the event
      await supabaseAdmin.from("rendezvous_candidate_logs").insert({
        candidate_id: candidateId,
        event_type: "liked",
        payload: { user_id: userId, side: isUserA ? "a" : "b" },
      });

      // Orbiter Signal: Like (one-sided)
      const seenAtOneSide = myState.seen_at
        ? new Date(myState.seen_at).getTime()
        : null;
      const ttdOneSide = seenAtOneSide ? Date.now() - seenAtOneSide : null;
      await supabaseAdmin
        .from("orbiter_signals")
        .insert({
          user_id: userId,
          candidate_id: candidateId,
          signal_type: "like",
          payload: { decision: "like", timeToDecisionMs: ttdOneSide },
        }); // fire-and-forget

      return NextResponse.json({
        ok: true,
        status: "waiting_for_counterpart",
      });
    }
  } catch (err: any) {
    console.error("[rendezvous/like] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
