import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCounterpartId } from "@/lib/rendezvous/helpers";

/**
 * GET /api/rendezvous/[candidateId]/graduation-check
 *
 * 卒業セレモニーの資格チェック。
 * 条件:
 * - mutual_liked or chat_opened
 * - 50通以上のメッセージ
 * - 30日以上の接続
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ eligible: false }, { status: 401 });

    const userId = auth.user.id;

    // Fetch candidate
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (candErr || !candidate) {
      return NextResponse.json({ eligible: false });
    }

    // Check user is part of this candidate
    if (candidate.user_a !== userId && candidate.user_b !== userId) {
      return NextResponse.json({ eligible: false });
    }

    // Check state
    if (candidate.state !== "mutual_liked" && candidate.state !== "chat_opened") {
      return NextResponse.json({ eligible: false });
    }

    // Check days connected
    const matchDate = new Date(candidate.matched_at);
    const now = new Date();
    const daysConnected = Math.floor(
      (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysConnected < 30) {
      return NextResponse.json({ eligible: false, daysConnected });
    }

    // Check message count
    const { count: messageCount } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    if ((messageCount ?? 0) < 50) {
      return NextResponse.json({
        eligible: false,
        messageCount: messageCount ?? 0,
        daysConnected,
      });
    }

    // Check milestones
    const { count: milestoneCount } = await supabaseAdmin
      .from("rendezvous_milestones")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    return NextResponse.json({
      eligible: true,
      messageCount: messageCount ?? 0,
      daysConnected,
      milestoneCount: milestoneCount ?? 0,
    });
  } catch (err: any) {
    console.error("[graduation-check] error:", err);
    return NextResponse.json({ eligible: false });
  }
}
