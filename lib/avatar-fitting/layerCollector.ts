// lib/avatar-fitting/layerCollector.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Layer1Data, Layer2Data, Layer3Data, Layer4Data, AllLayerData } from "./types";
import type { DimensionScore, DimensionCategory } from "@/lib/aneurasync/dimensions";
import { selectUserStyleSummaryMaybeSingle } from "@/lib/userStyleSummary";

async function collectLayer1(supabase: SupabaseClient, userId: string): Promise<Layer1Data> {
  const [bodyProfile, bodyMeasurements, pcProfile] = await Promise.all([
    supabase.from("user_body_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_body_measurements").select("measurements,measured_at").eq("user_id", userId).order("measured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("user_personal_color_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const styleVectorRes = await supabase.from("user_style_vector").select("jp_3type,jp_7type").eq("user_id", userId).maybeSingle();

  let coveragePoints = 0;
  const totalPoints = 3;
  if (bodyMeasurements.data?.measurements) coveragePoints += 1;
  if (bodyProfile.data?.cfv) coveragePoints += 1;
  if (pcProfile.data?.labels?.season4) coveragePoints += 1;

  return {
    bodyMeasurements: bodyMeasurements.data?.measurements ?? null,
    bodyType: styleVectorRes.data?.jp_3type ?? null,
    bodyType7: styleVectorRes.data?.jp_7type ?? null,
    cfv: bodyProfile.data?.cfv ?? null,
    pcSeason: pcProfile.data?.labels?.season4 ?? null,
    pcAxes: pcProfile.data?.cpv ? {
      temp: pcProfile.data.cpv.undertone != null ? (pcProfile.data.cpv.undertone > 0 ? 1 : 0) : undefined,
      value: pcProfile.data.cpv.value_L != null ? pcProfile.data.cpv.value_L / 100 : undefined,
      chroma: pcProfile.data.cpv.chroma_C != null ? pcProfile.data.cpv.chroma_C / 100 : undefined,
      contrast: pcProfile.data.cpv.contrast != null ? pcProfile.data.cpv.contrast / 100 : undefined,
      subtype: pcProfile.data?.labels?.season12 ?? undefined,
      conf: pcProfile.data.cpv.confidence ?? 0,
    } : null,
    favoriteColors: [],
    avoidColors: [],
    coverage: totalPoints > 0 ? coveragePoints / totalPoints : 0,
  };
}

async function collectLayer2(supabase: SupabaseClient, userId: string): Promise<Layer2Data> {
  const [prefProfile, styleSummary, personalityDims] = await Promise.all([
    supabase.from("pref_profile").select("silhouette,material,detail,pattern").eq("user_id", userId).maybeSingle(),
    selectUserStyleSummaryMaybeSingle(
      supabase,
      userId,
      "style_tags,wardrobe_colors,wardrobe_categories,quiz_result,mood_keywords,favorite_colors",
      "style_tags,wardrobe_colors,wardrobe_categories,quiz_result",
    ),
    supabase.from("personality_dimensions").select("dimension,category,score,confidence,evidence_count").eq("user_id", userId),
  ]);

  const ssData = styleSummary.data as Record<string, unknown> | null;
  let coveragePoints = 0;
  const totalPoints = 3;
  if (prefProfile.data) coveragePoints += 1;
  if (Array.isArray(ssData?.style_tags) && (ssData.style_tags as string[]).length) coveragePoints += 1;
  if (personalityDims.data?.length) coveragePoints += 1;

  const dimensions: DimensionScore[] = (personalityDims.data ?? []).map((d: any) => ({
    dimension: d.dimension,
    category: d.category as DimensionCategory,
    score: Number(d.score) || 0,
    confidence: Number(d.confidence) || 0,
    evidenceCount: Number(d.evidence_count) || 0,
  }));

  return {
    derivedIAm: null,
    prefProfile: prefProfile.data ? {
      silhouette: prefProfile.data.silhouette,
      material: prefProfile.data.material,
      detail: prefProfile.data.detail,
      pattern: prefProfile.data.pattern,
    } : null,
    styleTags: (Array.isArray(ssData?.style_tags) ? ssData.style_tags : []) as string[],
    moodKeywords: (Array.isArray(ssData?.mood_keywords) ? ssData.mood_keywords : []) as string[],
    personalityDimensions: dimensions,
    coverage: totalPoints > 0 ? coveragePoints / totalPoints : 0,
  };
}

async function collectLayer3(supabase: SupabaseClient, userId: string): Promise<Layer3Data> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [tasteLayers, recentSwipes] = await Promise.all([
    supabase.from("taste_layers_cache").select("layer_7d,layer_30d,updated_at").eq("user_id", userId).maybeSingle(),
    supabase.from("swipe_events").select("id", { head: true, count: "exact" }).eq("user_id", userId).gte("created_at", sevenDaysAgo),
  ]);

  let coveragePoints = 0;
  const totalPoints = 2;
  if (tasteLayers.data?.layer_7d && Object.keys(tasteLayers.data.layer_7d).length > 0) coveragePoints += 1;
  if ((recentSwipes.count ?? 0) > 5) coveragePoints += 1;

  return {
    swipePrefs: null,
    tasteLayers7d: tasteLayers.data?.layer_7d ?? null,
    tasteLayers30d: tasteLayers.data?.layer_30d ?? null,
    recentSwipeCount: recentSwipes.count ?? 0,
    coverage: totalPoints > 0 ? coveragePoints / totalPoints : 0,
  };
}

async function collectLayer4(supabase: SupabaseClient, userId: string): Promise<Layer4Data> {
  const [evaluations, feedbacks] = await Promise.all([
    supabase.from("avatar_fitting_evaluations").select("id,overall_match,band,extracted_attributes,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("avatar_fitting_feedback").select("evaluation_id,user_rating,size_satisfaction,visual_satisfaction,purchased").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  const evals = evaluations.data ?? [];
  const fbs = feedbacks.data ?? [];
  const fbMap = new Map(fbs.map((f: any) => [f.evaluation_id, f]));
  const feedbackWithData = fbs.filter((f: any) => f.user_rating != null);
  const totalEvaluations = evals.length;

  const avgUserRating = feedbackWithData.length > 0 ? feedbackWithData.reduce((s: number, f: any) => s + f.user_rating, 0) / feedbackWithData.length : null;
  const avgSizeSatisfaction = feedbackWithData.length > 0 ? feedbackWithData.reduce((s: number, f: any) => s + (f.size_satisfaction ?? 3), 0) / feedbackWithData.length : null;
  const avgVisualSatisfaction = feedbackWithData.length > 0 ? feedbackWithData.reduce((s: number, f: any) => s + (f.visual_satisfaction ?? 3), 0) / feedbackWithData.length : null;
  const purchaseRate = fbs.length > 0 ? fbs.filter((f: any) => f.purchased).length / fbs.length : null;

  let coverage = 0;
  if (totalEvaluations >= 10 && feedbackWithData.length >= 5) coverage = 1.0;
  else if (totalEvaluations >= 5 && feedbackWithData.length >= 3) coverage = 0.7;
  else if (totalEvaluations >= 1) coverage = 0.3;

  return { totalEvaluations, avgUserRating, avgSizeSatisfaction, avgVisualSatisfaction, purchaseRate, recentFeedbacks: [], coverage };
}

export async function collectAllLayers(supabase: SupabaseClient, userId: string): Promise<AllLayerData> {
  const [l1, l2, l3, l4] = await Promise.all([
    collectLayer1(supabase, userId),
    collectLayer2(supabase, userId),
    collectLayer3(supabase, userId),
    collectLayer4(supabase, userId),
  ]);
  if (l2.prefProfile) {
    l3.swipePrefs = {
      silhouette: l2.prefProfile.silhouette ?? undefined,
      material: l2.prefProfile.material ?? undefined,
      detail: l2.prefProfile.detail ?? undefined,
      pattern: l2.prefProfile.pattern ?? undefined,
    };
  }
  return { l1, l2, l3, l4 };
}
