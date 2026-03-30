import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  selectSyncQuestion,
  computeAnswerResonance,
  SYNC_QUESTIONS,
} from "@/lib/rendezvous/syncExperience";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

type RouteCtx = { params: Promise<{ candidateId: string }> };

// ============================================================
// GET /api/rendezvous/[candidateId]/sync
// 現在のセッション取得 or 新規作成
// ============================================================

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { candidateId } = await ctx.params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify user belongs to this candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category")
      .eq("id", candidateId)
      .single();

    if (
      !candidate ||
      (candidate.user_a !== user.id && candidate.user_b !== user.id)
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const iAmA = candidate.user_a === user.id;

    // Check for active (non-completed) session
    const { data: activeSession } = await supabaseAdmin
      .from("rendezvous_sync_sessions")
      .select("*")
      .eq("candidate_id", candidateId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession) {
      const question = SYNC_QUESTIONS.find(
        (q) => q.id === activeSession.question_id,
      );
      return NextResponse.json({
        ok: true,
        session: mapSession(activeSession, iAmA),
        question: question ?? null,
        iAmA,
      });
    }

    // Check if user wants to create via query param
    const shouldCreate =
      req.nextUrl.searchParams.get("create") === "true";

    if (!shouldCreate) {
      // Return recent completed sessions
      const { data: history } = await supabaseAdmin
        .from("rendezvous_sync_sessions")
        .select("*")
        .eq("candidate_id", candidateId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(10);

      return NextResponse.json({
        ok: true,
        session: null,
        question: null,
        history: (history ?? []).map((s: Record<string, unknown>) =>
          mapSession(s, iAmA),
        ),
        iAmA,
      });
    }

    // ── Create new session ──
    // Get previously used question IDs
    const { data: previousSessions } = await supabaseAdmin
      .from("rendezvous_sync_sessions")
      .select("question_id")
      .eq("candidate_id", candidateId);

    const usedIds = (previousSessions ?? []).map(
      (s: Record<string, unknown>) => s.question_id as string,
    );

    // Get message count for stage determination
    const { count: messageCount } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    const question = selectSyncQuestion(
      candidate.category as RendezvousCategory,
      usedIds,
      messageCount ?? 0,
    );

    if (!question) {
      return NextResponse.json(
        { error: "すべての質問を使い切りました", code: "NO_QUESTIONS" },
        { status: 400 },
      );
    }

    const { data: newSession, error } = await supabaseAdmin
      .from("rendezvous_sync_sessions")
      .insert({
        candidate_id: candidateId,
        question_id: question.id,
        status: "waiting",
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      session: mapSession(newSession, iAmA),
      question,
      iAmA,
    });
  } catch (err: unknown) {
    console.error("[sync] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ============================================================
// POST /api/rendezvous/[candidateId]/sync
// 回答送信 / ステータス更新
// ============================================================

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { candidateId } = await ctx.params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category")
      .eq("id", candidateId)
      .single();

    if (
      !candidate ||
      (candidate.user_a !== user.id && candidate.user_b !== user.id)
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const iAmA = candidate.user_a === user.id;
    const body = await req.json();
    const { action, sessionId } = body as {
      action: string;
      sessionId: string;
    };

    // Verify session belongs to this candidate
    const { data: session } = await supabaseAdmin
      .from("rendezvous_sync_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("candidate_id", candidateId)
      .single();

    if (!session)
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );

    // ── Action: ready (mark user as ready) ──
    if (action === "ready") {
      // Check if both users now marked ready by looking at status
      // If waiting → check if this makes both ready
      if (session.status === "waiting") {
        // First user ready → both_ready (simplified: we transition to answering directly)
        // In a real-time system this would use presence channels
        const otherAnswer = iAmA
          ? session.user_b_answered_at
          : session.user_a_answered_at;

        // If the other side hasn't signaled yet, mark as both_ready
        // For simplicity, after both_ready we immediately go to answering
        await supabaseAdmin
          .from("rendezvous_sync_sessions")
          .update({ status: "both_ready" })
          .eq("id", sessionId);

        // Auto-transition to answering after a short period
        // (in production this would be handled by realtime subscription)
        setTimeout(async () => {
          const { data: current } = await supabaseAdmin
            .from("rendezvous_sync_sessions")
            .select("status")
            .eq("id", sessionId)
            .single();
          if (current?.status === "both_ready") {
            await supabaseAdmin
              .from("rendezvous_sync_sessions")
              .update({ status: "answering" })
              .eq("id", sessionId);
          }
        }, 4000); // 3s countdown + 1s buffer
      }

      return NextResponse.json({ ok: true });
    }

    // ── Action: answer ──
    if (action === "answer") {
      const { answer } = body as { answer: string; action: string; sessionId: string };

      const answerColumn = iAmA ? "user_a_answer" : "user_b_answer";
      const answeredAtColumn = iAmA
        ? "user_a_answered_at"
        : "user_b_answered_at";

      await supabaseAdmin
        .from("rendezvous_sync_sessions")
        .update({
          [answerColumn]: answer,
          [answeredAtColumn]: new Date().toISOString(),
        })
        .eq("id", sessionId);

      // Refresh session to check if both answered
      const { data: updated } = await supabaseAdmin
        .from("rendezvous_sync_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (updated?.user_a_answer && updated?.user_b_answer) {
        // Both answered - compute resonance
        const question = SYNC_QUESTIONS.find(
          (q) => q.id === updated.question_id,
        );

        if (question) {
          const resonance = computeAnswerResonance(
            question,
            updated.user_a_answer as string,
            updated.user_b_answer as string,
          );

          await supabaseAdmin
            .from("rendezvous_sync_sessions")
            .update({
              status: "revealing",
              resonance_score: resonance.score,
              resonance_insight: resonance.insight,
              resonance_type: resonance.type,
            })
            .eq("id", sessionId);

          // Auto-transition to completed after reveal
          setTimeout(async () => {
            await supabaseAdmin
              .from("rendezvous_sync_sessions")
              .update({ status: "completed" })
              .eq("id", sessionId);
          }, 5000);

          return NextResponse.json({
            ok: true,
            resonance: {
              score: resonance.score,
              insight: resonance.insight,
              type: resonance.type,
            },
          });
        }
      }

      return NextResponse.json({ ok: true, bothAnswered: false });
    }

    // ── Action: complete (manually close) ──
    if (action === "complete") {
      await supabaseAdmin
        .from("rendezvous_sync_sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 },
    );
  } catch (err: unknown) {
    console.error("[sync] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ============================================================
// Helpers
// ============================================================

function mapSession(
  row: Record<string, unknown>,
  iAmA: boolean,
): {
  id: string;
  candidateId: string;
  questionId: string;
  status: string;
  myAnswer: string | null;
  theirAnswer: string | null;
  myAnsweredAt: string | null;
  theirAnsweredAt: string | null;
  resonanceScore: number | undefined;
  resonanceInsight: string | undefined;
  resonanceType: string | undefined;
  createdAt: string;
} {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    questionId: row.question_id as string,
    status: row.status as string,
    myAnswer: (iAmA ? row.user_a_answer : row.user_b_answer) as string | null,
    theirAnswer: (iAmA ? row.user_b_answer : row.user_a_answer) as string | null,
    myAnsweredAt: (iAmA
      ? row.user_a_answered_at
      : row.user_b_answered_at) as string | null,
    theirAnsweredAt: (iAmA
      ? row.user_b_answered_at
      : row.user_a_answered_at) as string | null,
    resonanceScore: row.resonance_score as number | undefined,
    resonanceInsight: row.resonance_insight as string | undefined,
    resonanceType: row.resonance_type as string | undefined,
    createdAt: row.created_at as string,
  };
}
