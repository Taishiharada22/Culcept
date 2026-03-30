import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIServiceClient } from "@/lib/ai/db";
import type {
  EnergyTarget,
  ObservationAngle,
  PhrasingStyle,
  ProbeTypeExtended,
} from "./questionPoolTypes";
import type { QuestionVariant } from "./questionVariants";
import {
  getRecentlyShownKeys,
  recordQuestionServed,
  selectFromPool,
} from "./questionPool";
import {
  resolveAdaptiveTargetAxis,
  selectStrategy,
  type AdaptiveQuestion,
  type AdaptationStrategy,
  type Q1Context,
} from "./adaptiveQ2";

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function deriveAdaptiveEnergyTarget(ctx: Q1Context): EnergyTarget {
  const responseRatio =
    ctx.averageResponseTimeMs > 0
      ? ctx.responseTimeMs / ctx.averageResponseTimeMs
      : 1;

  if (responseRatio > 1.8) return "stressed";
  if (ctx.responseTimeMs > 8000) return "low_energy";
  if (responseRatio < 0.7) return "high_energy";
  return "neutral";
}

function mapStrategyToPhrasingStyle(strategy: AdaptationStrategy): PhrasingStyle {
  switch (strategy) {
    case "opposite_extreme":
      return "hypothetical";
    case "hesitation_concrete":
      return "scenario";
    case "cross_axis":
      return "direct";
    case "contradiction_probe":
      return "meta_observation";
    case "answer_change_probe":
      return "meta_observation";
  }
}

function mapStrategyToAngle(strategy: AdaptationStrategy): ObservationAngle {
  switch (strategy) {
    case "opposite_extreme":
      return "hypothetical";
    case "hesitation_concrete":
      return "self_reflection";
    case "cross_axis":
      return "comparison";
    case "contradiction_probe":
      return "comparison";
    case "answer_change_probe":
      return "past_recall";
  }
}

function mapStrategyToProbeType(strategy: AdaptationStrategy): ProbeTypeExtended {
  switch (strategy) {
    case "opposite_extreme":
      return "exception";
    case "hesitation_concrete":
      return "reason";
    case "cross_axis":
      return "surface";
    case "contradiction_probe":
      return "contradiction";
    case "answer_change_probe":
      return "unchosen";
  }
}

function deriveDepthScore(strategy: AdaptationStrategy): number {
  switch (strategy) {
    case "contradiction_probe":
    case "answer_change_probe":
      return 3;
    case "hesitation_concrete":
    case "opposite_extreme":
      return 2;
    case "cross_axis":
      return 1;
  }
}

export function buildAdaptiveQuestionKey(args: {
  question: AdaptiveQuestion;
  q1Context: Q1Context;
}): string {
  const payload = {
    sourceAxisId: args.q1Context.axisId,
    targetAxisId: args.question.targetAxisId,
    strategy: args.question.strategy,
    prompt: args.question.prompt,
    options: args.question.options.map((option) => ({
      label: option.label,
      score: roundScore(option.score),
    })),
  };

  const hash = createHash("sha1")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);

  return `pool_adaptive_q2_${args.question.targetAxisId}_${hash}`;
}

export function buildAdaptiveQuestionVariant(args: {
  questionKey: string;
  question: AdaptiveQuestion;
}): QuestionVariant {
  return {
    id: args.questionKey,
    axisId: args.question.targetAxisId,
    prompt: args.question.prompt,
    options: args.question.options.map((option, index) => ({
      id: `aq2_opt_${index}`,
      label: option.label,
      score: roundScore(option.score),
    })),
    layer: "adaptive_q2",
  };
}

export function buildAdaptiveQuestionAssetRow(args: {
  question: AdaptiveQuestion;
  q1Context: Q1Context;
}): Record<string, unknown> {
  const questionKey = buildAdaptiveQuestionKey(args);
  const variant = buildAdaptiveQuestionVariant({
    questionKey,
    question: args.question,
  });

  return {
    question_key: questionKey,
    variant_json: variant,
    axis_id: args.question.targetAxisId,
    observation_layer: "adaptive_q2",
    subject: "self",
    energy_target: deriveAdaptiveEnergyTarget(args.q1Context),
    phrasing_style: mapStrategyToPhrasingStyle(args.question.strategy),
    angle: mapStrategyToAngle(args.question.strategy),
    source: args.question.isFallback ? "hardcoded" : "ai",
    ai_run_id: args.question.sourceAiRunId ?? null,
    quality_score: roundScore(args.question.isFallback ? 0.35 : args.question.qualityScore),
    depth_score: deriveDepthScore(args.question.strategy),
    probe_type: mapStrategyToProbeType(args.question.strategy),
    parent_question_keys: [],
    context_snapshot: {
      adaptiveQ2: {
        generatedAt: new Date().toISOString(),
        sourceAxisId: args.q1Context.axisId,
        strategy: args.question.strategy,
        selectedOptionLabel: args.q1Context.selectedOptionLabel,
        score: args.q1Context.score,
        responseTimeMs: args.q1Context.responseTimeMs,
        averageResponseTimeMs: args.q1Context.averageResponseTimeMs,
        answerChanged: args.q1Context.answerChanged,
        previousAnswerLabel: args.q1Context.previousAnswerLabel ?? null,
        sessionDepth: args.q1Context.sessionDepth ?? 0,
      },
    },
    quality_metrics: {},
    ux_hint: null,
    question_status: "active",
  };
}

export async function persistAdaptiveQuestionAsset(args: {
  question: AdaptiveQuestion;
  q1Context: Q1Context;
}): Promise<string | null> {
  const client = getAIServiceClient();
  if (!client) {
    console.warn("[adaptiveQuestionPool] service client unavailable, skipping asset save");
    return null;
  }

  const row = buildAdaptiveQuestionAssetRow(args);
  const questionKey = row.question_key as string;

  const { error } = await client
    .from("stargazer_question_pool")
    .upsert(row, {
      onConflict: "question_key",
      ignoreDuplicates: true,
    });

  if (error) {
    console.warn("[adaptiveQuestionPool] failed to persist adaptive question:", error.message);
    return null;
  }

  return questionKey;
}

export async function recordAdaptiveQuestionServed(args: {
  userId: string;
  questionKey: string;
  supabase: SupabaseClient;
  q1Context: Q1Context;
  question: AdaptiveQuestion;
}): Promise<void> {
  await recordQuestionServed(args.userId, args.questionKey, args.supabase, undefined, {
    deliverySource: "adaptive_q2",
    servedContext: {
      sourceAxisId: args.q1Context.axisId,
      targetAxisId: args.question.targetAxisId,
      strategy: args.question.strategy,
      selectedOptionLabel: args.q1Context.selectedOptionLabel,
      q1Score: args.q1Context.score,
      responseTimeMs: args.q1Context.responseTimeMs,
      averageResponseTimeMs: args.q1Context.averageResponseTimeMs,
      answerChanged: args.q1Context.answerChanged,
      previousAnswerLabel: args.q1Context.previousAnswerLabel ?? null,
      sessionDepth: args.q1Context.sessionDepth ?? 0,
    },
  });
}

export async function selectAdaptiveQuestionFromPool(args: {
  q1Context: Q1Context;
  userId: string;
  supabase: SupabaseClient;
}): Promise<{ question: AdaptiveQuestion; questionKey: string } | null> {
  const strategy = selectStrategy(args.q1Context);
  const targetAxisId = resolveAdaptiveTargetAxis(args.q1Context, strategy);
  const recentShown = await getRecentlyShownKeys(args.userId, 30, args.supabase);

  const variants = await selectFromPool(
    {
      axisId: targetAxisId,
      layer: "adaptive_q2",
      preferredSubjects: ["self"],
      preferredEnergy: deriveAdaptiveEnergyTarget(args.q1Context),
      preferredStyles: [mapStrategyToPhrasingStyle(strategy)],
      preferredAngles: [mapStrategyToAngle(strategy)],
      preferredProbeTypes: [mapStrategyToProbeType(strategy)],
      excludeQuestionKeys: recentShown,
      minQuality: 0.2,
      limit: 1,
      userSeed: args.userId,
    },
    args.supabase,
  );

  const variant = variants[0];
  if (!variant) return null;

  const { data: row } = await args.supabase
    .from("stargazer_question_pool")
    .select("quality_score, source")
    .eq("question_key", variant.id)
    .maybeSingle();

  return {
    questionKey: variant.id,
    question: {
      prompt: variant.prompt,
      options: variant.options.map((option) => ({
        label: option.label,
        score: option.score,
      })),
      targetAxisId,
      strategy,
      questionKey: variant.id,
      sourceAiRunId: null,
      isFallback: row?.source === "hardcoded",
      qualityScore: Number(row?.quality_score ?? 0.5),
    },
  };
}
