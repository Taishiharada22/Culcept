// app/api/stargazer/daily-observation/route.ts
// 継続観測API — 日次観測プランの生成と結果保存

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import { generateDailyPlan } from "@/lib/stargazer/dailyOrchestrator";
import {
  ALL_QUESTION_VARIANTS,
  CONTINUOUS_OBSERVATION_AXES,
} from "@/lib/stargazer/questionVariants";
import { recordQuestionServed } from "@/lib/stargazer/questionPool";
import { updateQuestionQuality } from "@/lib/stargazer/questionQuality";
import {
  SHADOW_PLAY_QUESTIONS,
  shadowPlayAnswerToAxisUpdates,
} from "@/lib/stargazer/shadowPlayQuestions";
import { stage3AnswerToSnapshots } from "@/lib/stargazer/stage3Bridge";
import {
  deserializeBeliefs,
  updateFromDailyObservation,
  serializeBeliefs,
  type DailyObservationInput,
} from "@/lib/stargazer/bayesianAxisUpdater";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

type DailyObservationStatePayload = {
  energy?: string;
  emotion?: string;
  social?: string;
  timeOfDay?: string;
  timestamp?: string;
} | null;

type DailyAnswerPayload = {
  variantId: string;
  score: number;
  responseTimeMs?: number;
  optionId?: string;
};

type StoredDailyRawAnswers = {
  answers?: DailyAnswerPayload[];
  deltaAnswer?: {
    axisId?: string;
    delta?: number;
    previousScore?: number;
  } | null;
  reobservationAnswer?: (DailyAnswerPayload & { previousDate?: string }) | null;
  shadowPlayAnswers?: {
    shadowPlayId: string;
    optionId: string;
    primaryAxis: string;
    score: number;
    responseTimeMs: number;
  }[] | null;
  stage3Answers?: {
    questionId: string;
    optionId: string;
    responseTimeMs?: number;
  }[] | null;
  observationState?: DailyObservationStatePayload;
  isPartial?: boolean;
  completedAt?: string | null;
} | null;

function isValidDateString(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getObservationDate(input?: string | null): string {
  if (isValidDateString(input ?? null)) {
    return input as string;
  }
  return new Date().toISOString().split("T")[0];
}

function isPartialState(rawAnswers: StoredDailyRawAnswers): boolean {
  return rawAnswers?.isPartial === true;
}

async function buildCompletedObservation(
  rawAnswers: DailyAnswerPayload[],
  rawObservationState: DailyObservationStatePayload,
  completedAt: string | null,
  observationDate: string,
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
) {
  const poolVariantIds = rawAnswers
    .map((answer) => answer.variantId)
    .filter((variantId) => variantId.startsWith("pool_"));

  const poolVariantAxisMap = new Map<string, string>();
  if (poolVariantIds.length > 0) {
    const { data: poolRows } = await supabase
      .from("stargazer_question_pool")
      .select("question_key, axis_id")
      .in("question_key", poolVariantIds);

    for (const row of poolRows ?? []) {
      poolVariantAxisMap.set(row.question_key, row.axis_id);
    }
  }

  const answers = rawAnswers.map((answer) => {
    const hardcodedVariant = ALL_QUESTION_VARIANTS.find(
      (variant) => variant.id === answer.variantId,
    );
    const deltaAxisId = answer.variantId.startsWith("delta:")
      ? answer.variantId.replace("delta:", "")
      : null;

    // 適応的Q2のaxis_idを解決
    let adaptiveAxisId: string | null = null;
    if (answer.variantId.startsWith("adaptive_q2_")) {
      const parts = answer.variantId.split("_");
      const timestampPart = parts[parts.length - 1];
      const isTimestamp = /^\d+$/.test(timestampPart);
      const axisIdParts = isTimestamp ? parts.slice(2, -1) : parts.slice(2);
      adaptiveAxisId = axisIdParts.join("_") || null;
    }

    return {
      questionId: answer.variantId,
      optionId: answer.optionId ?? String(answer.score),
      responseTimeMs: answer.responseTimeMs ?? 0,
      axisId:
        deltaAxisId ??
        adaptiveAxisId ??
        poolVariantAxisMap.get(answer.variantId) ??
        hardcodedVariant?.axisId,
    };
  });

  return {
    date: observationDate,
    answers,
    capturedState: rawObservationState,
    completedAt: completedAt ?? new Date().toISOString(),
  };
}

/**
 * Fire-and-forget: Analyze free text with AI and save results to free_text_analysis
 */
async function analyzeFreeTextInBackground(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  observationDate: string,
  freeText: string,
): Promise<void> {
  try {
    const result = await runAI({
      taskType: "stargazer_free_text_analysis",
      metadata: { ...makeStargazerRunMetadata({ feature: "daily_observation" }), userId, observationDate },
      systemPrompt: `You are an observation analyst. Analyze the user's free-form text from their daily observation session.
Extract:
1. emotional_tone: one of "positive", "negative", "neutral", "mixed"
2. key_themes: 1-3 short keywords (in Japanese) capturing the main topics
3. potential_contradictions: brief note (in Japanese) if the text seems to contradict typical observation patterns, or null

Respond in JSON only: {"emotional_tone":"...","key_themes":["..."],"potential_contradictions":"..." or null}`,
      prompt: freeText,
      requireJson: true,
    });

    if (result.success && result.text) {
      let analysis: unknown;
      try {
        // Extract JSON from the response (handle markdown code blocks)
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        analysis = { raw: result.text, parse_error: true };
      }

      if (analysis) {
        await supabase
          .from("stargazer_daily_states")
          .update({ free_text_analysis: analysis })
          .eq("user_id", userId)
          .eq("observation_date", observationDate);
      }
    }
  } catch (err) {
    console.error("[daily-observation] Free text analysis failed:", err);
    // Non-blocking — don't propagate
  }
}

/**
 * GET: 今日の観測プランを生成して返す
 */
export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Handle ?dates=30 — return list of observation dates for calendar heatmap
    const urlObj = new URL(request.url);
    const datesParam = urlObj.searchParams.get("dates");
    if (datesParam) {
      const dayCount = Math.min(Number(datesParam) || 30, 90);
      const since = new Date();
      since.setDate(since.getDate() - dayCount);
      const { data: dailyStates } = await supabase
        .from("stargazer_daily_states")
        .select("observation_date")
        .eq("user_id", user.id)
        .gte("observation_date", since.toISOString().split("T")[0])
        .order("observation_date", { ascending: false });
      return NextResponse.json({
        observationDates: (dailyStates ?? []).map((s: { observation_date: string }) => s.observation_date),
      });
    }

    // プロフィール取得（axis_beliefs も読み出し — EIG質問選択に使用）
    const { data: profile } = await supabase
      .from("stargazer_profiles")
      .select("total_sessions, observation_mode, axis_beliefs")
      .eq("user_id", user.id)
      .single();

    const totalSessions = profile?.total_sessions || 0;

    // 直近7日の観測履歴を取得
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentSnapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, variant_id, context, created_at, session_date")
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    // 全期間の軸別観測回数 (variant_id含む — 再観測用)
    const { data: allSnapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, context, session_date, created_at, variant_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const url = new URL(request.url);
    const today = getObservationDate(url.searchParams.get("date"));
    const checkOnly = url.searchParams.get("checkOnly") === "1";
    const observationState: DailyObservationStatePayload = {
      energy: url.searchParams.get("energy") ?? undefined,
      emotion: url.searchParams.get("emotion") ?? undefined,
      social: url.searchParams.get("social") ?? undefined,
      timeOfDay: url.searchParams.get("timeOfDay") ?? undefined,
      timestamp: url.searchParams.get("timestamp") ?? undefined,
    };

    // 今日すでに観測済みか
    const { data: todayState } = await supabase
      .from("stargazer_daily_states")
      .select("id, raw_answers, created_at")
      .eq("user_id", user.id)
      .eq("observation_date", today)
      .single();

    const storedRawAnswers = (todayState?.raw_answers as StoredDailyRawAnswers) ?? null;

    if (todayState && !isPartialState(storedRawAnswers)) {
      const rawAnswers = Array.isArray(
        storedRawAnswers?.answers,
      )
        ? ((storedRawAnswers?.answers ?? []) as DailyAnswerPayload[])
        : [];
      const reobservationAnswer = storedRawAnswers?.reobservationAnswer ?? null;
      const deltaAnswer = storedRawAnswers?.deltaAnswer ?? null;
      const normalizedAnswers = [...rawAnswers];
      if (reobservationAnswer?.variantId) {
        normalizedAnswers.push(reobservationAnswer);
      }
      if (deltaAnswer?.axisId) {
        normalizedAnswers.push({
          variantId: `delta:${deltaAnswer.axisId}`,
          score: deltaAnswer.delta ?? 0,
          optionId: `delta:${deltaAnswer.delta ?? 0}`,
        });
      }
      const rawObservationState = storedRawAnswers?.observationState ?? null;
      const completedObservation = await buildCompletedObservation(
        normalizedAnswers,
        rawObservationState,
        storedRawAnswers?.completedAt ?? (todayState.created_at || null),
        today,
        supabase,
      );
      return NextResponse.json({
        ok: true,
        alreadyCompleted: true,
        totalSessions,
        completedObservation,
      });
    }

    if (checkOnly) {
      return NextResponse.json({
        ok: true,
        alreadyCompleted: false,
        totalSessions,
      });
    }

    // 履歴構築
    const history = CONTINUOUS_OBSERVATION_AXES.map((axisId) => {
      const axisAll = (allSnapshots || []).filter((s) => s.axis_id === axisId);
      const axisRecent = (recentSnapshots || []).filter(
        (s) => s.axis_id === axisId
      );

      const contextCounts: Record<string, number> = {};
      for (const s of axisAll) {
        const ctx = s.context || "global";
        contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
      }

      const lastEntry = axisAll[0];

      // バリアント履歴: 再観測で同じ質問を再度出すため
      const variantHistory = axisAll
        .filter((s) => s.variant_id)
        .map((s) => ({
          variantId: s.variant_id as string,
          score: Number(s.score),
          date: s.session_date,
        }));

      return {
        axisId,
        totalObservations: axisAll.length,
        lastObservedAt: lastEntry?.created_at || null,
        recentVariantIds: axisRecent
          .map((s) => s.variant_id)
          .filter(Boolean) as string[],
        contextCounts,
        lastScore: lastEntry ? Number(lastEntry.score) : undefined,
        lastScoreDate: lastEntry?.session_date || undefined,
        variantHistory,
      };
    });

    // axis_beliefs を deserialize して EIG ベース質問選択に使用
    const planBeliefs = profile?.axis_beliefs
      ? deserializeBeliefs(profile.axis_beliefs as Record<string, { mu: number; precision: number }>)
      : undefined;

    const plan = await generateDailyPlan(history, totalSessions, {
      supabase,
      userId: user.id,
      observationState,
      beliefs: planBeliefs,
    });

    const servedPoolQuestionKeys = [
      ...plan.stateQuestions.map((q) => q.id),
      ...plan.contextQuestions.map((q) => q.id),
      ...plan.deepQuestions.map((q) => q.id),
      ...(plan.reobservation ? [plan.reobservation.variant.id] : []),
    ].filter((id) => id.startsWith("pool_"));

    for (const questionKey of servedPoolQuestionKeys) {
      await recordQuestionServed(user.id, questionKey, supabase, today);
    }

    return NextResponse.json({
      ok: true,
      alreadyCompleted: false,
      plan,
      totalSessions,
    });
  } catch (error) {
    console.error("Failed to generate daily observation plan:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST: 完了した観測結果を保存
 */
export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      answers,
      deltaAnswer,
      observationState,
      reobservationAnswer,
      shadowPlayAnswers,
      stage3Answers,
      observationDate,
      isPartial,
      freeText,
    } = body as {
      answers: {
        variantId: string;
        score: number;
        responseTimeMs?: number;
        optionId?: string;
      }[];
      deltaAnswer?: {
        axisId: string;
        delta: number;
        previousScore: number;
      };
      observationState?: {
        energy: string;
        emotion: string;
        social: string;
        timeOfDay: string;
        timestamp: string;
      } | null;
      reobservationAnswer?: {
        variantId: string;
        score: number;
        previousScore: number;
        previousDate: string;
        responseTimeMs?: number;
      };
      shadowPlayAnswers?: {
        shadowPlayId: string;
        optionId: string;
        primaryAxis: string;
        score: number;
        responseTimeMs: number;
      }[];
      stage3Answers?: {
        questionId: string;
        optionId: string;
        responseTimeMs?: number;
      }[];
      observationDate?: string;
      isPartial?: boolean;
      freeText?: string;
    };

    if (!answers || answers.length === 0) {
      return NextResponse.json(
        { error: "No answers provided" },
        { status: 400 }
      );
    }

    const today = getObservationDate(observationDate);

    const rawAnswersPayload: StoredDailyRawAnswers = {
      answers,
      deltaAnswer: deltaAnswer || null,
      reobservationAnswer: reobservationAnswer || null,
      shadowPlayAnswers: shadowPlayAnswers || null,
      stage3Answers: stage3Answers || null,
      observationState: observationState || null,
      isPartial: !!isPartial,
      completedAt: isPartial ? null : new Date().toISOString(),
    };

    const { data: existingDailyState } = await supabase
      .from("stargazer_daily_states")
      .select("id, raw_answers")
      .eq("user_id", user.id)
      .eq("observation_date", today)
      .maybeSingle();

    const existingRawAnswers = (existingDailyState?.raw_answers as StoredDailyRawAnswers) ?? null;
    const alreadyCompleted = Boolean(existingDailyState && !isPartialState(existingRawAnswers));

    // Sanitize freeText
    const sanitizedFreeText = typeof freeText === "string"
      ? freeText.trim().slice(0, 200) || null
      : null;

    if (isPartial) {
      const partialUpsert: Record<string, unknown> = {
        user_id: user.id,
        observation_date: today,
        raw_answers: rawAnswersPayload,
      };
      if (sanitizedFreeText) {
        partialUpsert.free_text = sanitizedFreeText;
      }
      await supabase.from("stargazer_daily_states").upsert(
        partialUpsert,
        { onConflict: "user_id,observation_date" }
      );

      // Fire-and-forget AI analysis of free text
      if (sanitizedFreeText) {
        analyzeFreeTextInBackground(supabase, user.id, today, sanitizedFreeText).catch(() => {});
      }

      return NextResponse.json({
        ok: true,
        savedCount: 0,
        isPartial: true,
      });
    }

    if (alreadyCompleted) {
      return NextResponse.json({
        ok: true,
        savedCount: 0,
        alreadyCompleted: true,
        isPartial: false,
      });
    }

    // 1. axis_snapshotsに保存 (状態タグ付き)
    // Pool質問とハードコード質問の両方に対応
    const poolVariantIds = answers
      .filter((a) => a.variantId.startsWith("pool_"))
      .map((a) => a.variantId);

    // Pool質問のvariant情報をDBから取得
    let poolVariantMap = new Map<
      string,
      { axisId: string; layer: string; context: string | null }
    >();
    if (poolVariantIds.length > 0) {
      const { data: poolRows } = await supabase
        .from("stargazer_question_pool")
        .select("question_key, axis_id, observation_layer, variant_json")
        .in("question_key", poolVariantIds);

      if (poolRows) {
        for (const row of poolRows) {
          const vj = row.variant_json as { context?: string } | null;
          poolVariantMap.set(row.question_key, {
            axisId: row.axis_id,
            layer: row.observation_layer,
            context: vj?.context || null,
          });
        }
      }
    }

    const snapshots = answers
      .map((ans) => {
        // Pool質問を先にチェック
        const poolInfo = poolVariantMap.get(ans.variantId);
        if (poolInfo) {
          return {
            user_id: user.id,
            axis_id: poolInfo.axisId,
            score: ans.score,
            confidence: 0.4, // 日次観測: オンボーディング(0.8)より低い重み
            context: poolInfo.context,
            observation_layer: poolInfo.layer,
            variant_id: ans.variantId,
            session_date: today,
            ...(observationState ? { observation_state: observationState } : {}),
          };
        }

        // 適応的Q2質問 (adaptive_q2_{axisId}_{timestamp})
        if (ans.variantId.startsWith("adaptive_q2_")) {
          const parts = ans.variantId.split("_");
          // adaptive_q2_{axisId}_{timestamp} — axisIdはparts[2]以降(タイムスタンプ前)
          // 例: adaptive_q2_emotional_variability_1710000000000
          // partsの最後がタイムスタンプ(数字のみ)
          const timestampPart = parts[parts.length - 1];
          const isTimestamp = /^\d+$/.test(timestampPart);
          const axisIdParts = isTimestamp ? parts.slice(2, -1) : parts.slice(2);
          const adaptiveAxisId = axisIdParts.join("_");
          if (adaptiveAxisId) {
            return {
              user_id: user.id,
              axis_id: adaptiveAxisId,
              score: ans.score,
              confidence: 0.5, // 適応的Q2: 通常の日次(0.4)より少し高い重み
              context: null,
              observation_layer: "adaptive_q2",
              variant_id: ans.variantId,
              session_date: today,
              ...(observationState ? { observation_state: observationState } : {}),
            };
          }
        }

        // ハードコード質問
        const variant = ALL_QUESTION_VARIANTS.find(
          (v) => v.id === ans.variantId,
        );
        if (!variant) return null;
        return {
          user_id: user.id,
          axis_id: variant.axisId,
          score: ans.score,
          confidence: 0.4, // 日次観測: オンボーディング(0.8)より低い重み
          context: variant.context || null,
          observation_layer: variant.layer,
          variant_id: variant.id,
          session_date: today,
          ...(observationState ? { observation_state: observationState } : {}),
        };
      })
      .filter(Boolean);

    if (snapshots.length > 0) {
      await supabase.from("stargazer_axis_snapshots").insert(snapshots);
    }

    // 1.5. Pool質問の使用記録と品質更新
    for (const ans of answers) {
      if (ans.variantId.startsWith("pool_")) {
        await updateQuestionQuality(
          ans.variantId,
          user.id,
          ans.score,
          ans.responseTimeMs ?? 0,
          supabase,
          today,
        );
      }
    }

    // 2. deltaAnswerがあれば保存
    if (deltaAnswer) {
      const newScore = deltaAnswer.previousScore + deltaAnswer.delta;
      const clampedScore = Math.max(-1, Math.min(1, newScore));
      await supabase.from("stargazer_axis_snapshots").insert({
        user_id: user.id,
        axis_id: deltaAnswer.axisId,
        score: clampedScore,
        observation_layer: "delta",
        session_date: today,
        ...(observationState ? { observation_state: observationState } : {}),
      });
    }

    // 2.5. reobservationAnswerがあれば保存 (再観測: 同じ質問を再度出して揺らぎ測定)
    if (reobservationAnswer) {
      const variant = ALL_QUESTION_VARIANTS.find(
        (v) => v.id === reobservationAnswer.variantId
      );
      if (variant) {
        await supabase.from("stargazer_axis_snapshots").insert({
          user_id: user.id,
          axis_id: variant.axisId,
          score: reobservationAnswer.score,
          observation_layer: "reobservation",
          variant_id: reobservationAnswer.variantId,
          session_date: today,
          ...(observationState ? { observation_state: observationState } : {}),
        });
      }
    }

    // 2.7. shadowPlayAnswersがあれば保存 (影絵: 投影法による深層観測)
    if (shadowPlayAnswers && shadowPlayAnswers.length > 0) {
      const shadowSnapshots = [];
      for (const spAnswer of shadowPlayAnswers) {
        const question = SHADOW_PLAY_QUESTIONS.find(q => q.id === spAnswer.shadowPlayId);
        if (!question) continue;

        // 影絵質問の回答を軸スコア更新に変換
        const axisUpdates = shadowPlayAnswerToAxisUpdates(question, spAnswer.optionId);
        for (const update of axisUpdates) {
          shadowSnapshots.push({
            user_id: user.id,
            axis_id: update.axisId,
            score: update.score * update.weight,
            confidence: update.weight,
            context: null,
            observation_layer: "shadow_play",
            variant_id: spAnswer.shadowPlayId,
            session_date: today,
            ...(observationState ? { observation_state: observationState } : {}),
          });
        }
      }
      if (shadowSnapshots.length > 0) {
        await supabase.from("stargazer_axis_snapshots").insert(shadowSnapshots);
      }
    }

    // 2.8. stage3Answersがあれば保存 (Stage 3: 深層シナリオ質問)
    if (stage3Answers && stage3Answers.length > 0) {
      const s3Snapshots = stage3Answers.flatMap((s3Answer) =>
        stage3AnswerToSnapshots(
          s3Answer.questionId,
          s3Answer.optionId,
          user.id,
          today,
          observationState ?? null,
        ),
      );
      if (s3Snapshots.length > 0) {
        await supabase.from("stargazer_axis_snapshots").insert(s3Snapshots);
      }
    }

    // 3. daily_statesに集計保存
    const axisScores: Record<string, number[]> = {};
    for (const ans of answers) {
      // Pool質問のaxis_idを取得
      const poolInfo = poolVariantMap.get(ans.variantId);
      let axisId =
        poolInfo?.axisId ??
        ALL_QUESTION_VARIANTS.find((v) => v.id === ans.variantId)?.axisId;

      // 適応的Q2のaxis_idを解決
      if (!axisId && ans.variantId.startsWith("adaptive_q2_")) {
        const parts = ans.variantId.split("_");
        const timestampPart = parts[parts.length - 1];
        const isTimestamp = /^\d+$/.test(timestampPart);
        const axisIdParts = isTimestamp ? parts.slice(2, -1) : parts.slice(2);
        axisId = axisIdParts.join("_") || undefined;
      }

      if (!axisId) continue;
      if (!axisScores[axisId]) axisScores[axisId] = [];
      axisScores[axisId].push(ans.score);
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const selfAlignment = avg(axisScores["public_private_gap"] || []);
    const interpersonalEnergy = avg(axisScores["intimacy_pace"] || []);
    const emotionalTemp = avg(axisScores["emotional_variability"] || []);
    const boundarySense = avg(axisScores["boundary_awareness"] || []);

    const dailyStateUpsert: Record<string, unknown> = {
      user_id: user.id,
      observation_date: today,
      self_alignment: selfAlignment,
      interpersonal_energy: interpersonalEnergy,
      emotional_temp: emotionalTemp,
      boundary_sense: boundarySense,
      raw_answers: rawAnswersPayload,
    };
    if (sanitizedFreeText) {
      dailyStateUpsert.free_text = sanitizedFreeText;
    }
    await supabase.from("stargazer_daily_states").upsert(
      dailyStateUpsert,
      { onConflict: "user_id,observation_date" }
    );

    // Fire-and-forget AI analysis of free text
    if (sanitizedFreeText) {
      analyzeFreeTextInBackground(supabase, user.id, today, sanitizedFreeText).catch(() => {});
    }

    // 4. プロフィール更新 — total_sessions increment (partial保存時はスキップ)
    if (!isPartial) {
      const { data: currentProfile } = await supabase
        .from("stargazer_profiles")
        .select("total_sessions")
        .eq("user_id", user.id)
        .single();

      // ── ベイズ信念の逐次更新 ──
      let beliefsUpdate: Record<string, unknown> = {};
      try {
        const { data: profileForBeliefs } = await supabase
          .from("stargazer_profiles")
          .select("axis_beliefs, median_response_time_ms")
          .eq("user_id", user.id)
          .single();

        const currentBeliefs = deserializeBeliefs(
          profileForBeliefs?.axis_beliefs as Record<string, { mu: number; precision: number }> | null
        );

        // 日次回答を DailyObservationInput に変換
        const dailyInputs: DailyObservationInput[] = [];
        for (const ans of answers) {
          if (ans.score != null && typeof ans.score === "number") {
            // 軸IDの解決: variantIdからaxisIdを取得
            const variant = ALL_QUESTION_VARIANTS.find((v) => v.id === ans.variantId);
            const axisId = variant?.axisId as TraitAxisKey | undefined;
            if (axisId) {
              dailyInputs.push({
                axisId,
                score: ans.score,
                weight: 1.0,
                responseTimeMs: ans.responseTimeMs,
                observationState: observationState ?? undefined,
              });
            }
          }
        }

        if (dailyInputs.length > 0) {
          const updatedBeliefs = updateFromDailyObservation(
            currentBeliefs,
            dailyInputs,
            profileForBeliefs?.median_response_time_ms ?? undefined,
          );
          beliefsUpdate = { axis_beliefs: serializeBeliefs(updatedBeliefs) };
        }
      } catch {
        // beliefs更新失敗は致命的ではない — ログのみ
        console.warn("[daily-observation] Failed to update beliefs, skipping");
      }

      await supabase
        .from("stargazer_profiles")
        .update({
          total_sessions:
            (currentProfile?.total_sessions || 0) +
            (alreadyCompleted ? 0 : 1),
          last_observation_at: new Date().toISOString(),
          observation_mode: "continuous",
          ...beliefsUpdate,
        })
        .eq("user_id", user.id);
    }

    // 5. ストリーク情報をサーバーサイドで計算してレスポンスに含める
    // クライアント側の streakIntelligence がこのデータで更新される
    let streakData: {
      questionCount: number;
      newContradictions: number;
      axisCoverage: number;
      averageResponseTimeMs: number;
      hadAnswerChanges: boolean;
    } | null = null;

    if (!isPartial && !alreadyCompleted) {
      // 回答した軸のユニーク数
      const axisSet = new Set<string>();
      for (const ans of answers) {
        const poolInfo = poolVariantMap.get(ans.variantId);
        const axisId =
          poolInfo?.axisId ??
          ALL_QUESTION_VARIANTS.find((v) => v.id === ans.variantId)?.axisId;
        if (axisId) axisSet.add(axisId);
      }

      // 平均応答時間
      const responseTimes = answers
        .map((a) => a.responseTimeMs)
        .filter((t): t is number => t != null && t > 0);
      const avgResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 3000;

      // 回答変更があったか (reobservation で前回と異なるスコアが証拠)
      const hadChanges = !!reobservationAnswer &&
        reobservationAnswer.score !== reobservationAnswer.previousScore;

      // 矛盾検出数: deltaAnswer がある場合は変化の証拠、shadowPlay は深層観測
      const contradictionIndicators =
        (deltaAnswer ? 1 : 0) +
        ((shadowPlayAnswers?.length ?? 0) > 2 ? 1 : 0);

      streakData = {
        questionCount: answers.length,
        newContradictions: contradictionIndicators,
        axisCoverage: axisSet.size,
        averageResponseTimeMs: Math.round(avgResponseTime),
        hadAnswerChanges: hadChanges,
      };
    }

    // Generate Aha Insight after observation (fire-and-forget enrichment)
    let ahaInsight: { insight: string; category: string; source: string } | null = null;
    try {
      const { getNextAhaInsight } = await import("@/lib/stargazer/ahaOrchestrator");
      const { data: coreStar } = await supabase
        .from("stargazer_core_star")
        .select("archetype_code, axis_scores")
        .eq("user_id", user.id)
        .maybeSingle();

      if (coreStar?.axis_scores) {
        const result = await getNextAhaInsight(user.id, {
          currentFeature: "observation",
          recentPatterns: [],
          axisScores: coreStar.axis_scores as Record<string, number>,
          archetypeCode: coreStar.archetype_code ?? "unknown",
          previousInsightIds: [],
          sessionNumber: snapshots.length,
          timeOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
        });
        if (result) {
          ahaInsight = {
            insight: result.insight,
            category: result.category,
            source: result.source,
          };
        }
      }
    } catch (e) {
      console.warn("[daily-observation] ahaOrchestrator failed:", e);
    }

    return NextResponse.json({
      ok: true,
      savedCount: snapshots.length,
      isPartial: !!isPartial,
      streakData,
      ahaInsight,
    });
  } catch (error) {
    console.error("Failed to save daily observation:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
