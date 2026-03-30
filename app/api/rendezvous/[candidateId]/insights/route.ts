import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateInsight } from "@/lib/rendezvous/insightGenerator";
import { computeStyleChemistryMap } from "@/lib/relational/chemistryMap";
import { computeWithThisPerson } from "@/lib/relational/withThisPerson";
import {
  generateResonanceInsight,
  type ResonanceInsight,
} from "@/lib/rendezvous/matchingResonanceInsights";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { MatchingVector, ReasonCode, CautionCode, RendezvousCategory } from "@/lib/rendezvous/types";

/**
 * GET /api/rendezvous/[candidateId]/insights
 * マッチ後のCompatibility Insightを返す
 * mutual_liked または chat_opened 状態でのみ利用可能
 *
 * v2: Stargazer軸スコアからchemistryMap + withThisPersonも返す
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, state, category, reason_codes, caution_codes, overall_score")
      .eq("id", candidateId)
      .single();

    if (!candidate)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (candidate.user_a !== user.id && candidate.user_b !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only available for mutual matches
    if (candidate.state !== "mutual_liked" && candidate.state !== "chat_opened")
      return NextResponse.json({ error: "Insights available after mutual match" }, { status: 400 });

    const counterpartId = candidate.user_a === user.id ? candidate.user_b : candidate.user_a;

    // Fetch both users' matching vectors + Stargazer axis snapshots in parallel
    const [selfPrefs, otherPrefs, selfAxisRaw, otherAxisRaw] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("matching_vector")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("matching_vector")
        .eq("user_id", counterpartId)
        .maybeSingle(),
      // Stargazer axis snapshots — latest score per axis for self
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, confidence")
        .eq("user_id", user.id)
        .order("session_date", { ascending: false })
        .limit(200),
      // Stargazer axis snapshots — latest score per axis for counterpart
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, confidence")
        .eq("user_id", counterpartId)
        .order("session_date", { ascending: false })
        .limit(200),
    ]);

    const defaultVector: MatchingVector = {
      conversation_temperature: 0.5,
      distance_need: 0.5,
      depth_speed: 0.5,
      stability_need: 0.5,
      stimulation_need: 0.5,
      initiative: 0.5,
      emotional_openness: 0.5,
      conflict_directness: 0.5,
      social_energy: 0.5,
      structure_preference: 0.5,
    };

    const selfVector = (selfPrefs?.data?.matching_vector as MatchingVector) ?? defaultVector;
    const otherVector = (otherPrefs?.data?.matching_vector as MatchingVector) ?? defaultVector;
    const syncPercent = Math.round((candidate.overall_score ?? 0.7) * 100);

    const insight = generateInsight(
      selfVector,
      otherVector,
      (candidate.reason_codes ?? []) as ReasonCode[],
      (candidate.caution_codes ?? []) as CautionCode[],
      candidate.category as RendezvousCategory,
      syncPercent,
    );

    // ── Stargazer deep analysis (chemistryMap + withThisPerson) ──
    const selfScores = aggregateLatestScores(selfAxisRaw?.data ?? []);
    const otherScores = aggregateLatestScores(otherAxisRaw?.data ?? []);
    const selfConfidence = aggregateLatestConfidence(selfAxisRaw?.data ?? []);

    const chemistryMap =
      Object.keys(selfScores).length >= 3 && Object.keys(otherScores).length >= 3
        ? computeStyleChemistryMap(selfScores, otherScores, selfConfidence)
        : null;

    const withThisPerson =
      Object.keys(selfScores).length >= 3 && Object.keys(otherScores).length >= 3
        ? computeWithThisPerson(selfScores, otherScores)
        : null;

    // Generate resonance insight (narrative-driven match interpretation)
    let resonanceInsight: ResonanceInsight | null = null;
    try {
      const { analyzeStrategyBalance } = await import(
        "@/lib/rendezvous/similarityComplementarityMatrix"
      );
      const strategyBalance = analyzeStrategyBalance(
        selfVector,
        otherVector,
        candidate.category as RendezvousCategory,
      );
      resonanceInsight = generateResonanceInsight({
        vectorA: selfVector,
        vectorB: otherVector,
        category: candidate.category as RendezvousCategory,
        overallScore: candidate.overall_score ?? 0.7,
        reasonCodes: (candidate.reason_codes ?? []) as ReasonCode[],
        cautionCodes: (candidate.caution_codes ?? []) as CautionCode[],
        strategyBalance,
      });
    } catch (e) {
      console.warn("[insights] resonance insight generation failed:", e);
    }

    return NextResponse.json({
      ok: true,
      insight,
      syncPercent,
      chemistryMap,
      withThisPerson,
      resonanceInsight,
    });
  } catch (err: any) {
    console.error("[insights] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Aggregate snapshot rows → latest score per axis_id
 * Rows are already ordered by session_date DESC, so first occurrence wins
 */
function aggregateLatestScores(
  rows: { axis_id: string; score: number; confidence?: number }[],
): Partial<Record<TraitAxisKey, number>> {
  const result: Partial<Record<TraitAxisKey, number>> = {};
  for (const row of rows) {
    const key = row.axis_id as TraitAxisKey;
    if (result[key] === undefined && row.score != null) {
      result[key] = row.score;
    }
  }
  return result;
}

function aggregateLatestConfidence(
  rows: { axis_id: string; score: number; confidence?: number }[],
): Partial<Record<TraitAxisKey, number>> {
  const result: Partial<Record<TraitAxisKey, number>> = {};
  for (const row of rows) {
    const key = row.axis_id as TraitAxisKey;
    if (result[key] === undefined && row.confidence != null) {
      result[key] = row.confidence;
    }
  }
  return result;
}
