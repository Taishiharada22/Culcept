import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ---------------------------------------------------------------------------
// GET — 現在のエスカレーション状態を取得
// RendezvousHome → AvatarEscalationCard が消費
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // アクティブなエスカレーション行を取得
    const { data: row } = await supabaseAdmin
      .from("rendezvous_escalation_state")
      .select(
        "id, candidate_id, first_conversation_at, postpone_used_at, baton_changed_at, auto_archived_at",
      )
      .eq("user_id", userId)
      .is("baton_changed_at", null)
      .is("auto_archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row || !row.first_conversation_at) {
      return NextResponse.json({ escalation: null });
    }

    // 日数計算
    const firstConv = new Date(row.first_conversation_at);
    const now = new Date();
    const daysSince = Math.floor(
      (now.getTime() - firstConv.getTime()) / (1000 * 60 * 60 * 24),
    );

    const hasUsedPostpone = !!row.postpone_used_at;
    const mustDecideNow = daysSince >= 4 || (daysSince >= 3 && hasUsedPostpone);
    const autoArchived = daysSince >= 5 || (daysSince >= 4 && hasUsedPostpone);

    // 自動アーカイブ処理
    if (autoArchived && !row.auto_archived_at) {
      await supabaseAdmin
        .from("rendezvous_escalation_state")
        .update({ auto_archived_at: now.toISOString() })
        .eq("id", row.id);
    }

    // アバター提案メッセージ
    let avatarSuggestion: string | null = null;
    if (daysSince >= 3 && !autoArchived) {
      if (mustDecideNow) {
        avatarSuggestion =
          "昨日の延長戦、ここまで温めたよ。今日が最後。会いに行く？";
      } else {
        avatarSuggestion =
          "かなり盛り上がったよ。そろそろ本人に会わせたい…どうする？";
      }
    } else if (daysSince === 2) {
      avatarSuggestion =
        "いい感じに話が進んでるよ。明日には準備が整いそう。";
    }

    // 相手の名前を取得
    let candidateName = "";
    if (row.candidate_id) {
      const { data: cand } = await supabaseAdmin
        .from("rendezvous_candidates")
        .select("user_a, user_b")
        .eq("id", row.candidate_id)
        .maybeSingle();
      if (cand) {
        const counterpartId =
          cand.user_a === userId ? cand.user_b : cand.user_a;
        const { data: profile } = await supabaseAdmin
          .from("rendezvous_profiles")
          .select("display_name")
          .eq("user_id", counterpartId)
          .maybeSingle();
        candidateName = (profile?.display_name as string) ?? "";
      }
    }

    return NextResponse.json({
      escalation: {
        daysSinceFirstConversation: daysSince,
        hasUsedPostpone,
        mustDecideNow,
        autoArchived,
        avatarSuggestion,
      },
      candidateName,
      candidateId: row.candidate_id,
    });
  } catch (err) {
    console.error("[escalation] GET error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
