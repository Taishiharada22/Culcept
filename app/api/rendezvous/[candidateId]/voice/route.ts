import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser, getCounterpartId } from "@/lib/rendezvous/helpers";
import {
  computeVoiceResonance,
  selectVoicePrompt,
  VOICE_PROMPTS,
  type VoiceAnalysis,
} from "@/lib/rendezvous/voiceResonance";

// ============================================================
// POST: 声の分析結果を送信
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;
    const userId = auth.user.id;

    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );
    if (!result)
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });

    const { candidate } = result;
    const isUserA = candidate.user_a === userId;

    const body = await request.json();
    const { promptId, analysis } = body as {
      promptId: string;
      analysis: VoiceAnalysis;
    };

    if (!promptId || !analysis) {
      return NextResponse.json(
        { ok: false, error: "promptId and analysis are required" },
        { status: 400 },
      );
    }

    // プロンプトの存在確認
    const prompt = VOICE_PROMPTS.find((p) => p.id === promptId);
    if (!prompt) {
      return NextResponse.json(
        { ok: false, error: "Invalid promptId" },
        { status: 400 },
      );
    }

    // 既存セッション検索 or 新規作成
    const { data: existingSession } = await supabaseAdmin
      .from("rendezvous_voice_sessions")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("prompt_id", promptId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      // 既に自分が送信済みか確認
      const alreadySubmitted = isUserA
        ? existingSession.user_a_analysis !== null
        : existingSession.user_b_analysis !== null;

      if (alreadySubmitted) {
        return NextResponse.json(
          { ok: false, error: "Already submitted for this prompt" },
          { status: 409 },
        );
      }

      // もう片方が送信済み → 完了
      const otherSubmitted = isUserA
        ? existingSession.user_b_analysis !== null
        : existingSession.user_a_analysis !== null;

      const updateData = isUserA
        ? { user_a_analysis: analysis, user_a_submitted_at: new Date().toISOString() }
        : { user_b_analysis: analysis, user_b_submitted_at: new Date().toISOString() };

      if (otherSubmitted) {
        // 共鳴計算
        const otherAnalysis = (
          isUserA ? existingSession.user_b_analysis : existingSession.user_a_analysis
        ) as VoiceAnalysis;

        const resonance = computeVoiceResonance(
          isUserA ? analysis : otherAnalysis,
          isUserA ? otherAnalysis : analysis,
          prompt.category,
        );

        const { data: updated, error } = await supabaseAdmin
          .from("rendezvous_voice_sessions")
          .update({
            ...updateData,
            status: "completed",
            resonance_score: resonance.resonanceScore,
            resonance_type: resonance.resonanceType,
            resonance_insight: resonance.insight,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({
          ok: true,
          status: "completed",
          resonance,
          sessionId: updated.id,
        });
      } else {
        // 自分が最初の送信者
        const { data: updated, error } = await supabaseAdmin
          .from("rendezvous_voice_sessions")
          .update({
            ...updateData,
            status: "one_submitted",
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({
          ok: true,
          status: "one_submitted",
          sessionId: updated.id,
        });
      }
    } else {
      // 新規セッション作成
      const insertData = {
        candidate_id: candidateId,
        prompt_id: promptId,
        ...(isUserA
          ? { user_a_analysis: analysis, user_a_submitted_at: new Date().toISOString() }
          : { user_b_analysis: analysis, user_b_submitted_at: new Date().toISOString() }),
        status: "one_submitted",
      };

      const { data: session, error } = await supabaseAdmin
        .from("rendezvous_voice_sessions")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        status: "one_submitted",
        sessionId: session.id,
      });
    }
  } catch (err) {
    console.error("[voice POST]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// ============================================================
// GET: 声のセッション状態 + 利用可能なプロンプト取得
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;
    const userId = auth.user.id;

    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );
    if (!result)
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });

    const { candidate } = result;

    // 既存セッション取得
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("rendezvous_voice_sessions")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    if (sessionsError) throw sessionsError;

    // 完了済みセッションの共鳴結果をまとめる
    const completedSessions = (sessions ?? [])
      .filter((s: Record<string, unknown>) => s.status === "completed")
      .map((s: Record<string, unknown>) => ({
        promptId: s.prompt_id as string,
        resonanceScore: s.resonance_score as number,
        resonanceType: s.resonance_type as string,
        insight: s.resonance_insight as string,
        completedAt: s.user_b_submitted_at ?? s.user_a_submitted_at,
      }));

    // 進行中セッション
    const pendingSession = (sessions ?? []).find(
      (s: Record<string, unknown>) => s.status === "one_submitted",
    ) as Record<string, unknown> | undefined;

    // メッセージ数を取得してプロンプト選択に利用
    const { count: messageCount } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    // 使用済みプロンプトID
    const usedPromptIds = (sessions ?? []).map(
      (s: Record<string, unknown>) => s.prompt_id as string,
    );

    // 次のプロンプトを選択
    const nextPrompt = selectVoicePrompt(
      messageCount ?? 0,
      usedPromptIds,
      candidate.category,
    );

    return NextResponse.json({
      ok: true,
      nextPrompt,
      pendingSession: pendingSession
        ? {
            sessionId: pendingSession.id,
            promptId: pendingSession.prompt_id,
            prompt: VOICE_PROMPTS.find(
              (p) => p.id === pendingSession.prompt_id,
            ),
            waitingForOther:
              candidate.user_a === userId
                ? pendingSession.user_a_analysis !== null
                : pendingSession.user_b_analysis !== null,
          }
        : null,
      completedSessions,
      totalSessions: (sessions ?? []).length,
    });
  } catch (err) {
    console.error("[voice GET]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
