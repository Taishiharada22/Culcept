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
import { COALTER_FLAGS } from "@/lib/coalter/flags";
import {
  runUnderstanding,
  judgeOutcome,
} from "@/lib/coalter/understanding";
import { collectLiveBundle } from "@/lib/coalter/understanding/liveCollector";
import type {
  PersonalLens,
  SourceCoverage,
  TwoPersonLensToday,
  IsoTimestamp,
} from "@/lib/coalter/understanding/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type {
  InvokeRequest,
  CoAlterApiResponse,
  CoAlterOutput,
  Stage1Snapshot,
} from "@/lib/coalter/types";

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
    const { threadId, message, pendingDeltas, avoidKeys } = body;

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
      { pendingDeltas, avoidKeys },
    );

    // CoAlterメッセージをDBに保存
    //
    // Phase 6.C (2026-04-19) CEO 条件 #3:
    //   routerTrace を coalter_messages.metadata.routerTrace へ永続化する。
    //   card (discriminated union) も metadata.card に保存し、次ターン router 入力
    //   (previousMode / previousNegotiateNoProposal) を復元可能にする。
    //   proposalCard は後方互換のため残す。
    await supabase.from("coalter_messages").insert({
      session_id: session.id,
      role: "coalter",
      sender_id: null,
      content: result.proposalCard.summary,
      metadata: {
        proposalCard: result.proposalCard,
        card: result.card ?? null,
        routerTrace: result.routerTrace ?? null,
        gateResult: result.gateResult ?? null,
        executorFallbackReason: result.executorFallbackReason ?? null,
      },
    });

    // [M1 1a] Stage 1 Understand snapshot (flag-gated, fail-open, read-only).
    //   - COALTER_STAGE1_LIVE=true のときだけ collector + runUnderstanding() を呼ぶ
    //   - 例外は握り潰して log のみ（invoke の成功レスポンスは壊さない）
    //   - 1a 段階では collector が最小（talk_messages のみ）なので outcome は構造的に
    //     "failed" を返す。これは経路確認の合格条件
    const stage1Snapshot = COALTER_FLAGS.stage1LiveEnabled
      ? await computeStage1Snapshot({
          supabase,
          threadId,
          pairStateId: pairState.id,
          userA: pairState.user_a,
          userB: pairState.user_b,
        })
      : undefined;

    const responseData: CoAlterOutput = stage1Snapshot
      ? { ...result, stage1: stage1Snapshot }
      : result;

    return NextResponse.json<CoAlterApiResponse<CoAlterOutput>>({
      ok: true,
      data: responseData,
    });
  } catch (e) {
    console.error("[CoAlter] Invoke error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// [M1 1a] Stage 1 snapshot helper
//
//   fail-open: collector / runUnderstanding() の例外は握り潰して undefined を返す。
//   invoke route 側で `stage1` 欠落のまま response を返すことで「Stage 1 が壊れたら
//   invoke も壊れる」を防ぐ。
//
//   `outcome` は runUnderstanding() 本体では diagnostics 経由でしか出ないので、
//   同じ judgeOutcome() で snapshot 化してから discriminated union に載せる。
// ═══════════════════════════════════════════════════════════════════════════

type Stage1HelperInput = {
  supabase: SupabaseClient;
  threadId: string;
  pairStateId: string;
  userA: string;
  userB: string;
};

async function computeStage1Snapshot(
  input: Stage1HelperInput,
): Promise<Stage1Snapshot | undefined> {
  try {
    const now = new Date().toISOString() as IsoTimestamp;
    const { bundle, meta } = await collectLiveBundle({
      supabase: input.supabase,
      threadId: input.threadId,
      pairStateId: input.pairStateId,
      userA: input.userA,
      userB: input.userB,
      now,
    });

    const pairHash = createHash("sha256")
      .update(`${input.userA}|${input.userB}`)
      .digest("hex")
      .slice(0, 16);

    const lens: TwoPersonLensToday = await runUnderstanding(bundle, now, pairHash);

    const sourceCoverage = sourceCoverageFromLens(lens);
    const missingDomains = lens.dataGaps;
    const outcome = judgeOutcome({
      confidence: lens.understanding_confidence,
      missingDomains,
      sourceCoverage,
    });

    if (outcome === "failed") {
      return {
        outcome: "failed",
        understanding_confidence: lens.understanding_confidence,
        lensVersion: lens.lensVersion,
        computedAt: lens.computedAt,
        collectorMeta: meta,
      };
    }

    return {
      outcome,
      understanding_confidence: lens.understanding_confidence,
      todayReading: {
        mode: lens.todayReading.mode,
        energyBudget: lens.todayReading.energyBudget,
        timeBudget: lens.todayReading.timeBudget,
        implicitIntent: lens.todayReading.implicitIntent,
        latentNeeds: lens.todayReading.latentNeeds,
        confidence: lens.todayReading.confidence,
      },
      lensVersion: lens.lensVersion,
      computedAt: lens.computedAt,
      collectorMeta: meta,
    };
  } catch (e) {
    console.error("[CoAlter] Stage1 snapshot failed (fail-open):", e);
    return undefined;
  }
}

function sourceCoverageFromLens(lens: TwoPersonLensToday): SourceCoverage {
  return {
    a: personCoverage(lens.personalLenses.a),
    b: personCoverage(lens.personalLenses.b),
  };
}

function personCoverage(
  p: PersonalLens,
): { stargazerCount: number; alterCount: number; behavioralCount: number } {
  return {
    stargazerCount: p.sourcedFrom.stargazer.length,
    alterCount: p.sourcedFrom.alter.length,
    behavioralCount: p.sourcedFrom.behavioral.length,
  };
}
