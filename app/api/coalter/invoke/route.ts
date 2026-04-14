/**
 * POST /api/coalter/invoke — CoAlterを起動し5層パイプラインを実行
 *
 * 前提: ペアが enabled 状態であること
 * 結果: ProposalCard を返す
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runCoAlterPipeline } from "@/lib/coalter/engine";
import { createButtonTrigger } from "@/lib/coalter/triggerDetection";
import type { InvokeRequest, CoAlterApiResponse, CoAlterOutput } from "@/lib/coalter/types";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as InvokeRequest;
    const { threadId, message } = body;

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
    }

    // ペア状態を確認
    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("id, state, user_a, user_b")
      .eq("thread_id", threadId)
      .single();

    if (!pairState || pairState.state !== "enabled") {
      return NextResponse.json(
        { ok: false, error: "CoAlter is not enabled for this thread" },
        { status: 400 },
      );
    }

    // 参加者確認
    if (pairState.user_a !== user.id && pairState.user_b !== user.id) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    // アクティブなセッションが既にないか確認
    const { data: activeSession } = await supabase
      .from("coalter_sessions")
      .select("id")
      .eq("pair_state_id", pairState.id)
      .eq("state", "active")
      .limit(1)
      .single();

    if (activeSession) {
      return NextResponse.json(
        { ok: false, error: "A CoAlter session is already active" },
        { status: 409 },
      );
    }

    // トリガー情報
    const trigger = createButtonTrigger(message);

    // セッション作成
    const { data: session, error: sessionError } = await supabase
      .from("coalter_sessions")
      .insert({
        pair_state_id: pairState.id,
        thread_id: threadId,
        mode: "decision",
        state: "active",
        invoked_by: user.id,
        trigger_pattern: trigger.matchedPattern,
        trigger_confidence: trigger.confidence,
      })
      .select("id, pair_state_id, thread_id, mode, state, invoked_by, created_at, ended_at")
      .single();

    if (sessionError || !session) {
      console.error("[CoAlter] Failed to create session:", sessionError);
      return NextResponse.json({ ok: false, error: "Failed to create session" }, { status: 500 });
    }

    // 5層パイプライン実行
    const result: CoAlterOutput = await runCoAlterPipeline(
      supabase,
      {
        threadId,
        invokedBy: user.id,
        trigger,
        userMessage: message,
      },
      {
        id: session.id,
        threadId: session.thread_id,
        threadType: "talk",
        userAId: pairState.user_a,
        userBId: pairState.user_b,
        initiatedBy: session.invoked_by,
        mode: session.mode as "decision",
        state: session.state as "active",
        createdAt: session.created_at,
        endedAt: session.ended_at,
      },
      pairState.id,
      pairState.user_a,
      pairState.user_b,
    );

    // CoAlterメッセージをDBに保存
    await supabase.from("coalter_messages").insert({
      session_id: session.id,
      role: "coalter",
      sender_id: null,
      content: result.proposalCard.summary,
      metadata: { proposalCard: result.proposalCard },
    });

    return NextResponse.json<CoAlterApiResponse<CoAlterOutput>>({
      ok: true,
      data: result,
    });
  } catch (e) {
    console.error("[CoAlter] Invoke error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
