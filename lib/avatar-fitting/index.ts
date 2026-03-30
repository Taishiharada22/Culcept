// lib/avatar-fitting/index.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvatarFittingResult, ScoreRequest, FeedbackRequest, HistoryItem } from "./types";
import { collectAllLayers } from "./layerCollector";
import { scoreFitting } from "./scorer";
import { analyzeImage, buildManualAttributes } from "./imageAnalyzer";
import { generateAvatarComment } from "./commentGenerator";

export async function evaluateFitting(
  supabase: SupabaseClient,
  userId: string,
  request: ScoreRequest,
  userName?: string,
): Promise<AvatarFittingResult> {
  const [layers, attributes] = await Promise.all([
    collectAllLayers(supabase, userId),
    request.manualCategory
      ? Promise.resolve(buildManualAttributes({ category: request.manualCategory, colors: request.manualColors }))
      : analyzeImage(request.imageBase64, request.mimeType),
  ]);

  const result = scoreFitting(layers, attributes);

  const comment = await generateAvatarComment(
    result,
    layers.l2.personalityDimensions,
    userName,
  ).catch(() => result.avatarComment);

  result.avatarComment = comment;
  return result;
}

export async function saveEvaluation(
  supabase: SupabaseClient,
  userId: string,
  result: AvatarFittingResult,
  imageUrl?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("avatar_fitting_evaluations")
    .insert({
      user_id: userId,
      image_url: imageUrl ?? null,
      extracted_attributes: result.extractedAttributes,
      overall_match: result.overallMatch,
      band: result.band,
      size_score: result.sizeScore.adjustedScore,
      visual_score: result.visualScore.adjustedScore,
      color_score: result.colorScore.adjustedScore,
      preference_score: result.preferenceScore.adjustedScore,
      confidence: result.confidence,
      avatar_comment: result.avatarComment,
      details: result.details,
      layer_coverage: result.layerCoverage,
      weights_used: result.weightsUsed,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[avatar-fitting] Save evaluation error:", error);
    return null;
  }
  return data.id;
}

export async function saveFeedback(
  supabase: SupabaseClient,
  userId: string,
  evaluationId: string,
  feedback: Omit<FeedbackRequest, "evaluationId">,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("avatar_fitting_feedback")
    .insert({
      evaluation_id: evaluationId,
      user_id: userId,
      user_rating: feedback.userRating,
      size_satisfaction: feedback.sizeSatisfaction,
      visual_satisfaction: feedback.visualSatisfaction,
      purchased: feedback.purchased,
      comment: feedback.comment ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[avatar-fitting] Save feedback error:", error);
    return null;
  }
  return data.id;
}

export async function getEvaluationHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<HistoryItem[]> {
  const { data: evals, error } = await supabase
    .from("avatar_fitting_evaluations")
    .select("id,image_url,overall_match,band,size_score,visual_score,color_score,preference_score,avatar_comment,extracted_attributes,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !evals) return [];

  const evalIds = evals.map((e: any) => e.id);
  const { data: feedbacks } = await supabase
    .from("avatar_fitting_feedback")
    .select("evaluation_id,user_rating,size_satisfaction,visual_satisfaction,purchased")
    .in("evaluation_id", evalIds);

  const fbMap = new Map((feedbacks ?? []).map((f: any) => [f.evaluation_id, f]));

  return evals.map((e: any): HistoryItem => {
    const fb = fbMap.get(e.id);
    return {
      id: e.id,
      imageUrl: e.image_url,
      overallMatch: e.overall_match,
      band: e.band,
      sizeScore: e.size_score,
      visualScore: e.visual_score,
      colorScore: e.color_score,
      preferenceScore: e.preference_score,
      avatarComment: e.avatar_comment,
      extractedCategory: e.extracted_attributes?.category ?? "unknown",
      createdAt: e.created_at,
      feedback: fb ? {
        userRating: fb.user_rating,
        sizeSatisfaction: fb.size_satisfaction,
        visualSatisfaction: fb.visual_satisfaction,
        purchased: fb.purchased,
      } : undefined,
    };
  });
}

export type { AvatarFittingResult, ScoreRequest, FeedbackRequest, HistoryItem } from "./types";
