import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateGrowthNudge,
  canShowNudge,
} from "@/lib/rendezvous/growthNudgeEngine";
import type { ReasonCode, CautionCode, RendezvousCategory } from "@/lib/rendezvous/types";
import { computeTrajectoryDirection } from "@/lib/rendezvous/livingScore";

/**
 * GET /api/rendezvous/[candidateId]/nudge
 * 今日のナッジを取得（日1回上限）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, state, category, reason_codes, caution_codes, overall_score, created_at")
      .eq("id", candidateId)
      .single();

    if (!candidate || (candidate.user_a !== user.id && candidate.user_b !== user.id))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Check daily limit
    const { data: lastNudge } = await supabaseAdmin
      .from("rendezvous_growth_nudges")
      .select("created_at")
      .eq("candidate_id", candidateId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!canShowNudge(lastNudge?.created_at ?? null)) {
      return NextResponse.json({ ok: true, nudge: null, reason: "daily_limit" });
    }

    // Gather context for nudge generation
    const [{ count: messageCount }, { data: history }] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_messages")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", candidateId),
      supabaseAdmin
        .from("rendezvous_score_history")
        .select("score, computed_at")
        .eq("candidate_id", candidateId)
        .order("computed_at", { ascending: false })
        .limit(10),
    ]);

    // Last message time
    const { data: lastMsg } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSinceMatch = Math.floor(
      (Date.now() - new Date(candidate.created_at).getTime()) / (1000 * 60 * 60 * 24),
    );

    const lastMessageDaysAgo = lastMsg
      ? Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : daysSinceMatch;

    const direction = computeTrajectoryDirection(
      (history ?? []).map((h) => ({
        score: Number(h.score),
        computed_at: h.computed_at,
      })),
    );

    const nudge = generateGrowthNudge({
      category: candidate.category as RendezvousCategory,
      direction,
      reasonCodes: (candidate.reason_codes ?? []) as ReasonCode[],
      cautionCodes: (candidate.caution_codes ?? []) as CautionCode[],
      daysSinceMatch,
      messageCount: messageCount ?? 0,
      lastMessageDaysAgo,
    });

    if (!nudge) {
      return NextResponse.json({ ok: true, nudge: null });
    }

    // Save nudge for tracking + daily limit
    await supabaseAdmin.from("rendezvous_growth_nudges").insert({
      candidate_id: candidateId,
      user_id: user.id,
      nudge_type: nudge.type,
      nudge_text: nudge.text,
    });

    return NextResponse.json({ ok: true, nudge });
  } catch (err: any) {
    console.error("[nudge] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/rendezvous/[candidateId]/nudge
 * ナッジへのフィードバック (helpful / not_relevant)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { nudgeType, feedback } = body;

    if (!["helpful", "not_relevant"].includes(feedback)) {
      return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    }

    // Update the most recent nudge of this type
    const { data: latestNudge } = await supabaseAdmin
      .from("rendezvous_growth_nudges")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("user_id", user.id)
      .eq("nudge_type", nudgeType)
      .is("feedback", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestNudge) {
      await supabaseAdmin
        .from("rendezvous_growth_nudges")
        .update({ feedback })
        .eq("id", latestNudge.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[nudge feedback] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
