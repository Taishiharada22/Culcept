import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/rendezvous/avatar/baton-change
 * バトン交代を実行 — アバター会話からリアル会話への移行
 * Body: { candidateId: string, conversationId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await request.json();
    const { candidateId, conversationId } = body as {
      candidateId: string;
      conversationId: string;
    };

    if (!candidateId || !conversationId) {
      return NextResponse.json(
        { ok: false, error: "candidateId と conversationId は必須です" },
        { status: 400 },
      );
    }

    // Verify candidate belongs to user
    const { data: cand } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, state, category")
      .eq("id", candidateId)
      .single();

    if (!cand || (cand.user_a !== userId && cand.user_b !== userId)) {
      return NextResponse.json(
        { ok: false, error: "候補者が見つからないか、アクセス権がありません" },
        { status: 403 },
      );
    }

    // Verify conversation exists
    const { data: conv } = await supabaseAdmin
      .from("avatar_conversations")
      .select("id, messages, highlight, summary, status")
      .eq("id", conversationId)
      .eq("candidate_id", candidateId)
      .single();

    if (!conv) {
      return NextResponse.json(
        { ok: false, error: "対象の会話が見つかりません" },
        { status: 404 },
      );
    }

    // Create baton_changes record
    const { error: batonErr } = await supabaseAdmin
      .from("baton_changes")
      .insert({
        candidate_id: candidateId,
        user_id: userId,
        avatar_conversation_id: conversationId,
      });

    if (batonErr) {
      return NextResponse.json({ ok: false, error: batonErr.message }, { status: 500 });
    }

    // Mark conversation as completed
    if (conv.status === "active") {
      await supabaseAdmin
        .from("avatar_conversations")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }

    // Build handoff context from conversation
    const messages = conv.messages as any[];
    const recentMessages = messages.slice(-5); // Last 5 messages for context
    const handoffContext = {
      conversationId: conv.id,
      summary: conv.summary,
      highlight: conv.highlight,
      recentMessages,
      category: cand.category,
      candidateState: cand.state,
    };

    return NextResponse.json({
      ok: true,
      batonChanged: true,
      handoffContext,
    });
  } catch (err: any) {
    console.error("[avatar/baton-change] error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
