import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/rendezvous/[candidateId]/unmatch
 * マッチ解除 — 相互成立済みの接続を解除する
 *
 * - candidate レコードを unmatch 状態に変更
 * - 相手には非表示（片想い非表示原則準拠）
 * - メッセージ履歴は30日後に自動削除（GDPR対応）
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;

    // candidate レコード取得（自分がuser_aかuser_bか確認）
    const { data: candidate, error: fetchErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, status")
      .eq("id", candidateId)
      .single();

    if (fetchErr || !candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // 自分がこのcandidateの当事者か確認
    const isUserA = candidate.user_a === user.id;
    const isUserB = candidate.user_b === user.id;
    if (!isUserA && !isUserB) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // matched状態でなければアンマッチ不可
    if (candidate.status !== "matched") {
      return NextResponse.json(
        { error: "Can only unmatch a matched candidate" },
        { status: 400 },
      );
    }

    // candidate を unmatched 状態に更新
    const { error: updateErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .update({
        status: "unmatched",
        unmatched_by: user.id,
        unmatched_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    if (updateErr) {
      console.error("[unmatch] Update error:", updateErr);
      return NextResponse.json({ error: "Failed to unmatch" }, { status: 500 });
    }

    // user_statesも更新（両者とも非表示に）
    await supabaseAdmin
      .from("rendezvous_user_states")
      .update({ hidden: true, hidden_reason: "unmatched" })
      .eq("candidate_id", candidateId);

    // メッセージ削除スケジュールをマーク（30日後に自動削除）
    await supabaseAdmin
      .from("rendezvous_messages")
      .update({
        scheduled_delete_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("candidate_id", candidateId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[unmatch] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
