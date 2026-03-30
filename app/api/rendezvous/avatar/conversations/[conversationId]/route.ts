import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  learnFromReaction,
  type ReactionType,
  type AvatarMessageSender,
} from "@/lib/rendezvous/avatarLiveEngine";
import type { AvatarSkill } from "@/lib/rendezvous/avatarPersonality";

type RouteParams = { params: Promise<{ conversationId: string }> };

/**
 * GET /api/rendezvous/avatar/conversations/[conversationId]
 * 会話の全メッセージ詳細を取得
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // Fetch conversation
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("avatar_conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convErr || !conv)
      return NextResponse.json({ ok: false, error: "会話が見つかりません" }, { status: 404 });

    // Verify user owns this conversation via candidate
    const { data: cand } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", conv.candidate_id)
      .single();

    if (!cand || (cand.user_a !== userId && cand.user_b !== userId))
      return NextResponse.json({ ok: false, error: "アクセス権がありません" }, { status: 403 });

    // Fetch reactions for this conversation
    const { data: reactions } = await supabaseAdmin
      .from("avatar_reactions")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    // Fetch counterpart profile
    const counterpartId = cand.user_a === userId ? cand.user_b : cand.user_a;
    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("display_name, avatar_asset_url")
      .eq("user_id", counterpartId)
      .single();

    return NextResponse.json({
      ok: true,
      conversation: {
        id: conv.id,
        candidateId: conv.candidate_id,
        messages: conv.messages,
        highlight: conv.highlight,
        summary: conv.summary,
        status: conv.status,
        category: conv.category,
        startedAt: conv.started_at,
        completedAt: conv.completed_at,
      },
      reactions: (reactions ?? []).map((r: any) => ({
        messageIndex: r.message_index,
        reactionType: r.reaction_type,
        createdAt: r.created_at,
      })),
      counterpart: profile
        ? { displayName: profile.display_name, avatarUrl: profile.avatar_asset_url }
        : null,
    });
  } catch (err: any) {
    console.error("[avatar/conversations/[id]] GET error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/rendezvous/avatar/conversations/[conversationId]
 * リアクションを送信し、スキルを更新
 * Body: { messageIndex: number, reactionType: ReactionType }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await request.json();
    const { messageIndex, reactionType } = body as {
      messageIndex: number;
      reactionType: ReactionType;
    };

    if (messageIndex == null || !reactionType) {
      return NextResponse.json(
        { ok: false, error: "messageIndex と reactionType は必須です" },
        { status: 400 },
      );
    }

    const validReactions: ReactionType[] = [
      "fire", "gem", "laugh", "bullseye", "curious", "wrong",
    ];
    if (!validReactions.includes(reactionType)) {
      return NextResponse.json(
        { ok: false, error: "無効なリアクションタイプです" },
        { status: 400 },
      );
    }

    // Verify conversation exists and user has access
    const { data: conv } = await supabaseAdmin
      .from("avatar_conversations")
      .select("id, candidate_id, messages")
      .eq("id", conversationId)
      .single();

    if (!conv)
      return NextResponse.json({ ok: false, error: "会話が見つかりません" }, { status: 404 });

    const { data: cand } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("user_a, user_b")
      .eq("id", conv.candidate_id)
      .single();

    if (!cand || (cand.user_a !== userId && cand.user_b !== userId))
      return NextResponse.json({ ok: false, error: "アクセス権がありません" }, { status: 403 });

    // Validate message index
    const messages = conv.messages as any[];
    if (messageIndex < 0 || messageIndex >= messages.length) {
      return NextResponse.json(
        { ok: false, error: "無効なメッセージインデックスです" },
        { status: 400 },
      );
    }

    // Save reaction
    const { error: reactErr } = await supabaseAdmin
      .from("avatar_reactions")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        message_index: messageIndex,
        reaction_type: reactionType,
      });

    if (reactErr)
      return NextResponse.json({ ok: false, error: reactErr.message }, { status: 500 });

    // Update avatar skills via learnFromReaction
    const { data: skillRow } = await supabaseAdmin
      .from("avatar_skills")
      .select("*")
      .eq("user_id", userId)
      .single();

    const targetMessage = messages[messageIndex] as {
      sender: AvatarMessageSender;
      text: string;
    };

    if (skillRow) {
      const currentSkills = skillRow.skills as AvatarSkill[];
      const updatedSkills = learnFromReaction(
        currentSkills,
        reactionType,
        targetMessage,
      );

      await supabaseAdmin
        .from("avatar_skills")
        .update({ skills: updatedSkills, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      return NextResponse.json({
        ok: true,
        skillsUpdated: true,
        skills: updatedSkills,
      });
    }

    return NextResponse.json({ ok: true, skillsUpdated: false });
  } catch (err: any) {
    console.error("[avatar/conversations/[id]] POST error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
