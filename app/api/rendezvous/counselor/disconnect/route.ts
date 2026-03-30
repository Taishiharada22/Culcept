import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCounterpartId,
  normalizeUserPair,
  verifyCandidateBelongsToUser,
} from "@/lib/rendezvous/helpers";
import { analyzeDisconnect } from "@/lib/rendezvous/counselor/disconnectAnalysis";
import type { DisconnectReasonCode } from "@/lib/rendezvous/counselor/types";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId, reasonCode, reasonDetail } = (await req.json()) as {
      candidateId: string;
      reasonCode: DisconnectReasonCode;
      reasonDetail?: string;
    };

    if (!candidateId || !reasonCode) {
      return NextResponse.json(
        { error: "candidateId and reasonCode are required" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // Verify candidate belongs to user
    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    const { candidate } = result;
    const counterpartId = getCounterpartId(candidate, userId);

    // Analyze disconnect (AI-powered)
    const analysis = await analyzeDisconnect({
      candidateId,
      disconnectedByUserId: userId,
      reasonCode,
      reasonDetail: reasonDetail ?? undefined,
    });

    // Update candidate state to dismissed
    const { error: updateErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .update({ state: "dismissed" })
      .eq("id", candidateId);

    if (updateErr) {
      console.error("[counselor/disconnect] update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 },
      );
    }

    // Create suppression record (30 day cooldown)
    const [userLow, userHigh] = normalizeUserPair(userId, counterpartId);
    const cooldownUntil = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await supabaseAdmin.from("rendezvous_suppressions").insert({
      user_low: userLow,
      user_high: userHigh,
      suppression_type: "disconnect_cooldown",
      until_at: cooldownUntil,
    });

    // Log the event
    await supabaseAdmin.from("rendezvous_candidate_logs").insert({
      candidate_id: candidateId,
      event_type: "disconnected",
      payload: {
        user_id: userId,
        reason_code: reasonCode,
        reason_detail: reasonDetail ?? null,
        analysis_id: analysis.id,
      },
    });

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/disconnect] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
