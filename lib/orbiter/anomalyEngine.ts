// ============================================================
// Orbiter Phase 4: 異常アーカイブ (Anomaly Archive)
//
// パターンを壊す瞬間こそ、最も重要なデータポイント。
// 「いつもと違う選択」は、変化の予兆か、無意識の本音。
//
// 予測と実際の乖離を検出し、蓄積する。
// 後から振り返った時、異常が新しいパターンの起点だったと気づく。
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type {
  AttractionProfile,
  CrossCandidatePattern,
  UserJudgmentProfile,
  OrbiterAnomaly,
  AnomalyArchive,
  AnomalyType,
  OrbiterContext,
} from "./types";

// ── Constants ──

const SPEED_ANOMALY_RATIO = 3.0;
const PREDICTION_CONFIDENCE_THRESHOLD = 0.4;
const ATTRACTION_DOT_LIKE_THRESHOLD = 0.3;
const ATTRACTION_DOT_PASS_THRESHOLD = -0.2;
const MAX_RECENT = 5;
const MAX_STORED_LOAD = 10;

// ── Expected Outcome Prediction ──

export function predictExpectedOutcome(
  counterpartScores: Partial<Record<TraitAxisKey, number>>,
  attractionProfile: AttractionProfile | null,
  judgmentProfile: UserJudgmentProfile | null,
): { expected: "like" | "pass"; confidence: number } {
  if (!attractionProfile?.instantAttraction) {
    return { expected: "like", confidence: 0.2 }; // low confidence default
  }

  const topAxes = attractionProfile.instantAttraction.topAxes;
  if (topAxes.length === 0) {
    return { expected: "like", confidence: 0.2 };
  }

  // Weighted dot product between candidate axes and attraction weights
  let dotProduct = 0;
  let totalWeight = 0;

  for (const aw of topAxes) {
    const candidateScore = counterpartScores[aw.axis];
    if (candidateScore == null) continue;

    dotProduct += candidateScore * aw.weight * aw.confidence;
    totalWeight += Math.abs(aw.weight) * aw.confidence;
  }

  if (totalWeight === 0) {
    return { expected: "like", confidence: 0.2 };
  }

  const normalized = dotProduct / totalWeight;
  const profileConfidence = attractionProfile.instantAttraction.confidence;

  if (normalized > ATTRACTION_DOT_LIKE_THRESHOLD) {
    return { expected: "like", confidence: Math.min(0.85, profileConfidence * 0.8 + 0.2) };
  }
  if (normalized < ATTRACTION_DOT_PASS_THRESHOLD) {
    return { expected: "pass", confidence: Math.min(0.85, profileConfidence * 0.7 + 0.15) };
  }

  // Ambiguous zone
  const likeRate = judgmentProfile?.likeRate ?? 0.5;
  return {
    expected: likeRate > 0.5 ? "like" : "pass",
    confidence: 0.3,
  };
}

// ── Anomaly Detection ──

export function detectAnomaly(params: {
  latestDecision: { decision: "like" | "pass"; timeToDecisionMs: number | null } | null;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  crossPatterns: CrossCandidatePattern[];
  attractionProfile: AttractionProfile | null;
  judgmentProfile: UserJudgmentProfile | null;
  storedAnomalies: OrbiterAnomaly[];
  context: OrbiterContext;
}): AnomalyArchive {
  const {
    latestDecision,
    counterpartAxisScores,
    crossPatterns,
    attractionProfile,
    judgmentProfile,
    storedAnomalies,
    context,
  } = params;

  const newAnomalies: Omit<OrbiterAnomaly, "id" | "userId" | "createdAt">[] = [];

  if (latestDecision) {
    // ── Pattern Break ──
    const prediction = predictExpectedOutcome(
      counterpartAxisScores,
      attractionProfile,
      judgmentProfile,
    );

    if (
      prediction.expected !== latestDecision.decision &&
      prediction.confidence > PREDICTION_CONFIDENCE_THRESHOLD
    ) {
      const relatedAxes = extractRelatedAxes(counterpartAxisScores);
      newAnomalies.push({
        candidateId: "", // will be set by caller
        anomalyType: "pattern_break",
        description: prediction.expected === "like"
          ? "好みに合うはずなのにpassした"
          : "好みと違うはずなのにlikeした",
        expectedOutcome: prediction.expected,
        actualOutcome: latestDecision.decision,
        significance: Math.min(0.95, prediction.confidence * 1.1),
        becamePattern: false,
        metadata: { relatedAxes, decisionTimeMs: latestDecision.timeToDecisionMs ?? undefined },
      });
    }

    // ── Surprising Pass ──
    if (
      latestDecision.decision === "pass" &&
      prediction.expected === "like" &&
      prediction.confidence > 0.5 &&
      !newAnomalies.some((a) => a.anomalyType === "pattern_break")
    ) {
      newAnomalies.push({
        candidateId: "",
        anomalyType: "surprising_pass",
        description: "魅力プロフィールに適合するのにpassした",
        expectedOutcome: "like",
        actualOutcome: "pass",
        significance: prediction.confidence * 0.9,
        becamePattern: false,
        metadata: { relatedAxes: extractRelatedAxes(counterpartAxisScores) },
      });
    }

    // ── Speed Anomaly ──
    if (
      latestDecision.timeToDecisionMs != null &&
      judgmentProfile?.avgDecisionTimeMs != null &&
      judgmentProfile.avgDecisionTimeMs > 0
    ) {
      const ratio = latestDecision.timeToDecisionMs / judgmentProfile.avgDecisionTimeMs;
      if (ratio > SPEED_ANOMALY_RATIO || ratio < 1 / SPEED_ANOMALY_RATIO) {
        const isFast = ratio < 1;
        newAnomalies.push({
          candidateId: "",
          anomalyType: "speed_anomaly",
          description: isFast
            ? "普段よりはるかに早い判断"
            : "普段よりはるかに遅い判断",
          expectedOutcome: `平均${Math.round(judgmentProfile.avgDecisionTimeMs / 1000)}秒`,
          actualOutcome: `${Math.round(latestDecision.timeToDecisionMs / 1000)}秒`,
          significance: Math.min(0.8, Math.abs(Math.log(ratio)) * 0.3),
          becamePattern: false,
          metadata: {
            decisionTimeMs: latestDecision.timeToDecisionMs,
            relatedAxes: extractRelatedAxes(counterpartAxisScores),
          },
        });
      }
    }

    // ── Revisit Anomaly ──
    if (
      context.visitCount > 3 &&
      latestDecision.decision === "pass"
    ) {
      newAnomalies.push({
        candidateId: "",
        anomalyType: "revisit_anomaly",
        description: `${context.visitCount}回見てからpassした`,
        expectedOutcome: "深い関心があるように見えた",
        actualOutcome: "pass",
        significance: Math.min(0.85, 0.5 + context.visitCount * 0.05),
        becamePattern: false,
        metadata: { relatedAxes: extractRelatedAxes(counterpartAxisScores) },
      });
    }
  }

  // ── Retrospective Analysis ──

  let hasPatternShift = false;
  let retrospectiveInsight: string | null = null;

  if (storedAnomalies.length > 0 && crossPatterns.length > 0) {
    for (const stored of storedAnomalies) {
      if (stored.becamePattern) continue;

      const relatedAxes = stored.metadata?.relatedAxes ?? [];
      // Check if any current cross-pattern references the same axes
      const matchingPattern = crossPatterns.find((cp) =>
        cp.type === "growth_signal" || cp.type === "consistent_preference",
      );

      if (matchingPattern && relatedAxes.length > 0) {
        // Check if the anomaly's direction matches the new pattern
        if (
          stored.anomalyType === "pattern_break" &&
          stored.actualOutcome !== stored.expectedOutcome
        ) {
          hasPatternShift = true;
          retrospectiveInsight =
            `以前のパターン破壊（${stored.description}）が、今の新しい傾向の起点だった可能性がある。`;
          break;
        }
      }
    }
  }

  // ── Build archive ──

  const allAnomalies = [
    ...newAnomalies,
    ...storedAnomalies.map((a) => ({
      candidateId: a.candidateId,
      anomalyType: a.anomalyType,
      description: a.description,
      expectedOutcome: a.expectedOutcome,
      actualOutcome: a.actualOutcome,
      significance: a.significance,
      becamePattern: hasPatternShift ? true : a.becamePattern,
      metadata: a.metadata,
    })),
  ]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, MAX_RECENT);

  return {
    recent: allAnomalies,
    totalCount: storedAnomalies.length + newAnomalies.length,
    hasPatternShift,
    retrospectiveInsight,
  };
}

// ── Helpers ──

function extractRelatedAxes(
  scores: Partial<Record<TraitAxisKey, number>>,
): TraitAxisKey[] {
  return Object.entries(scores)
    .filter(([, v]) => v != null && Math.abs(v) > 0.3)
    .sort((a, b) => Math.abs(b[1]!) - Math.abs(a[1]!))
    .slice(0, 3)
    .map(([axis]) => axis as TraitAxisKey);
}

// ── DB Functions ──

export async function loadAnomalies(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrbiterAnomaly[]> {
  const { data } = await supabase
    .from("orbiter_anomalies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_STORED_LOAD);

  if (!data || data.length === 0) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    candidateId: row.candidate_id,
    anomalyType: row.anomaly_type as AnomalyType,
    description: row.description,
    expectedOutcome: row.expected_outcome,
    actualOutcome: row.actual_outcome,
    significance: Number(row.significance),
    becamePattern: row.became_pattern,
    metadata: (row.metadata ?? {}) as OrbiterAnomaly["metadata"],
    createdAt: row.created_at,
  }));
}

export function persistAnomaly(
  supabase: SupabaseClient,
  anomaly: Omit<OrbiterAnomaly, "id" | "createdAt">,
): void {
  void (async () => {
    await supabase.from("orbiter_anomalies").insert({
      user_id: anomaly.userId,
      candidate_id: anomaly.candidateId,
      anomaly_type: anomaly.anomalyType,
      description: anomaly.description,
      expected_outcome: anomaly.expectedOutcome,
      actual_outcome: anomaly.actualOutcome,
      significance: anomaly.significance,
      became_pattern: anomaly.becamePattern,
      metadata: anomaly.metadata,
    });
  })();
}
