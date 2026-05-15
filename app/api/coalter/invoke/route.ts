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
import { buildStage1Prefix } from "@/lib/coalter/stage1Narration";
import { isPairInColdStart } from "@/lib/coalter/pairOnboarding";
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
// [Gap 4 D3] Route observation only (additive、default OFF)
//   詳細: lib/coalter/presence/contextDetectionMode.ts JSDoc 参照
import {
  buildGap4RouteObservationFromEnv,
  GAP4_OBSERVATION_MODE_ENV_VAR,
  type ContextDetectorInput,
  type Gap4RouteObservationField,
} from "@/lib/coalter/presence/contextDetectionMode";

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
    //
    // [M1 C3] onboarded_at を一緒に取る。flag OFF 時も取得するが参照しない。
    //   migration 前 schema では列が無く `null` として返る想定。
    const { data: pairState } = await supabase
      .from("coalter_pair_states")
      .select("id, state, user_a, user_b, onboarded_at")
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

    // [M1 1a] Stage 1 Understand snapshot (flag-gated, fail-open, read-only).
    //   - COALTER_STAGE1_LIVE=true のときだけ collector + runUnderstanding() を呼ぶ
    //   - 例外は握り潰して log のみ（invoke の成功レスポンスは壊さない）
    //   - 1a 段階では collector が最小（talk_messages のみ）なので outcome は構造的に
    //     "failed" を返す。これは経路確認の合格条件
    //
    // [M1 Candidate 2] narration 先頭への 1 行反映のため、DB insert より先に計算する。
    //   失敗時 undefined なので narration は no-op、既存 summary を壊さない。
    const stage1Snapshot = COALTER_FLAGS.stage1LiveEnabled
      ? await computeStage1Snapshot({
          supabase,
          threadId,
          pairStateId: pairState.id,
          userA: pairState.user_a,
          userB: pairState.user_b,
          onboardedAt: (pairState as { onboarded_at?: string | null }).onboarded_at ?? null,
        })
      : undefined;

    // [M1 Candidate 2] Stage 1 narration を proposalCard.summary / card.summary に 1 行反映。
    //   - flag `COALTER_STAGE1_NARRATION=true` が必要（stage1LiveEnabled と独立）。
    //   - outcome === "failed" のときは buildStage1Prefix が null を返す → no-op。
    //   - mutation ではなく新オブジェクト差し替え（result._internal などは保持）。
    const narrationPrefix =
      COALTER_FLAGS.stage1NarrationEnabled && stage1Snapshot
        ? buildStage1Prefix(stage1Snapshot)
        : null;
    if (narrationPrefix) {
      result.proposalCard = {
        ...result.proposalCard,
        summary: `${narrationPrefix}\n${result.proposalCard.summary}`,
      };
      if (result.card) {
        result.card = {
          ...result.card,
          summary: `${narrationPrefix}\n${result.card.summary}`,
        };
      }
    }

    // CoAlterメッセージをDBに保存
    //
    // Phase 6.C (2026-04-19) CEO 条件 #3:
    //   routerTrace を coalter_messages.metadata.routerTrace へ永続化する。
    //   card (discriminated union) も metadata.card に保存し、次ターン router 入力
    //   (previousMode / previousNegotiateNoProposal) を復元可能にする。
    //   proposalCard は後方互換のため残す。
    //
    // Candidate 2: narration prefix が付与済みの summary をそのまま保存する。
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

    const responseData: CoAlterOutput = stage1Snapshot
      ? { ...result, stage1: stage1Snapshot }
      : result;

    // [Gap 4 D3] Route observation field (additive、default OFF、CEO 2026-05-16)
    //   - env COALTER_GAP4_OBSERVATION_MODE = "off" / "observe" / "live"
    //   - default OFF → field 完全不在 (既存 response 維持、backward compat)
    //   - observe → detector 走らせる、additive field のみ、UI 不変
    //   - live → 本 D3 PR では activation: false 固定 (D7 で扱う)
    //   - raw user text を detector に渡さない (signalsHint は caller pre-binarized only)
    //   - body.gap4SignalsHint が optional に Partial<ContextDetectorInput> を含む
    //     場合のみ受領、無ければ skippedReason: "insufficient_structured_signals"
    //   - 本 PR では env file / production env / Vercel env 変更なし
    //   - ChatClient / UpperLayerMount / UI / Pattern activation touch なし
    const gap4SignalsHint = (body as InvokeRequest & {
      gap4SignalsHint?: Partial<ContextDetectorInput>;
    }).gap4SignalsHint;
    const gap4Observation: Gap4RouteObservationField | undefined =
      buildGap4RouteObservationFromEnv(
        process.env[GAP4_OBSERVATION_MODE_ENV_VAR],
        gap4SignalsHint,
      );

    // additive: existing client は gap4ContextObservation を無視可能
    //   CoAlterOutput type は本 PR では touch しない (additive cast)
    const responseDataWithObservation: CoAlterOutput =
      gap4Observation !== undefined
        ? ({ ...responseData, gap4ContextObservation: gap4Observation } as CoAlterOutput &
            { gap4ContextObservation: Gap4RouteObservationField })
        : responseData;

    return NextResponse.json<CoAlterApiResponse<CoAlterOutput>>({
      ok: true,
      data: responseDataWithObservation,
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
  /** [M1 C3] onboarded_at 列の値。null or undefined = 未 onboarding (legacy or pre-migration) */
  onboardedAt?: string | null;
};

async function computeStage1Snapshot(
  input: Stage1HelperInput,
): Promise<Stage1Snapshot | undefined> {
  try {
    // [M1 C3] cold-start protection
    //   pairOnboardingEnabled が ON かつ
    //     (a) onboarded_at が null (= 旧ペア or migration 前) かつ
    //     (b) talk_messages が 0 件
    //   のときは Stage 1 を呼ばず undefined を返す。
    //   理由: 会話が 1 件も無い段階で runUnderstanding() を回しても
    //   構造的に outcome="failed" が確定する。narration 層は failed を
    //   hide するが、response に `stage1.outcome=failed` が載ると
    //   「今日」を示唆しないまでも「計測に失敗した 2 人」という情報は漏れる。
    //   snapshot を欠落させる方が情報設計として正しい。
    if (COALTER_FLAGS.pairOnboardingEnabled && !input.onboardedAt) {
      const { count, error: countError } = await input.supabase
        .from("talk_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", input.threadId);
      if (!countError && isPairInColdStart(input.onboardedAt, count ?? 0)) {
        return undefined;
      }
    }

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
