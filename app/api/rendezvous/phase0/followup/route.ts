import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Phase 0: フォローアップ（持続性追跡）API
 *
 * GET  — 前回のフィードバックから2週間経過しているかチェック
 * POST — フォローアップ回答を保存
 */

const FOLLOWUP_DELAY_MS = 14 * 24 * 60 * 60 * 1000; // 2週間

export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 最新のフィードバックを取得（followupがまだないもの）
  const { data: feedback } = await supabaseAdmin
    .from("rendezvous_phase0_feedback")
    .select("id, pair_key, created_at, followup_at, followup_change_happened, insight_snapshot")
    .eq("user_id", user.id)
    .is("followup_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!feedback) {
    return NextResponse.json({ needsFollowup: false, reason: "no_feedback" });
  }

  const createdAt = new Date(feedback.created_at).getTime();
  const now = Date.now();
  const elapsed = now - createdAt;

  if (elapsed < FOLLOWUP_DELAY_MS) {
    const daysLeft = Math.ceil((FOLLOWUP_DELAY_MS - elapsed) / (24 * 60 * 60 * 1000));
    return NextResponse.json({
      needsFollowup: false,
      reason: "too_early",
      daysLeft,
      feedbackId: feedback.id,
    });
  }

  // 2週間経過 → フォローアップが必要
  return NextResponse.json({
    needsFollowup: true,
    feedbackId: feedback.id,
    pairKey: feedback.pair_key,
    originalNarrative: (feedback.insight_snapshot as Record<string, unknown>)?.narrative ?? null,
    daysSince: Math.floor(elapsed / (24 * 60 * 60 * 1000)),
  });
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { feedbackId, changeHappened, followupText } = body;

  if (!feedbackId) {
    return NextResponse.json({ error: "feedbackId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("rendezvous_phase0_feedback")
    .update({
      followup_at: new Date().toISOString(),
      followup_change_happened: changeHappened ?? false,
      followup_text: followupText ?? null,
    })
    .eq("id", feedbackId)
    .eq("user_id", user.id);

  if (error) {
    console.warn("[phase0] Followup save failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
