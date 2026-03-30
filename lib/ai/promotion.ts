import "server-only";

import { getAIServiceClient } from "./db";
import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
} from "./modelRegistry";

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export type PromotionThresholds = {
  min_sample_size: number;
  min_avg_score: number;
  min_pass_rate: number;
  max_fallback_rate: number;
  min_positive_feedback_rate: number;
  min_feedback_sample_size: number;
};

function getDefaultThresholds(): PromotionThresholds {
  return {
    min_sample_size: envNumber("AI_PROMOTION_MIN_SAMPLE_SIZE", 50),
    min_avg_score: envNumber("AI_PROMOTION_MIN_AVG_SCORE", 0.7),
    min_pass_rate: envNumber("AI_PROMOTION_MIN_PASS_RATE", 0.8),
    max_fallback_rate: envNumber("AI_PROMOTION_MAX_FALLBACK_RATE", 0.1),
    min_positive_feedback_rate: 0.6,
    min_feedback_sample_size: 10,
  };
}

export type PromotionReview = {
  eligible: boolean;
  reason: string;
  metrics: {
    sampleSize: number;
    avgScore: number | null;
    passRate: number | null;
    fallbackRate: number | null;
    positiveFeedbackRate: number | null;
    feedbackSampleSize: number;
  };
  thresholds: PromotionThresholds;
  checks: Array<{
    name: string;
    passed: boolean;
    actual: number | null;
    required: number;
  }>;
};

export async function evaluatePromotionCandidate(args: {
  modelKey: string;
  modelVersion?: string;
  taskType?: string;
  lookbackHours?: number;
  thresholdOverrides?: Partial<PromotionThresholds>;
}): Promise<PromotionReview> {
  const thresholds = {
    ...getDefaultThresholds(),
    ...args.thresholdOverrides,
  };

  const client = getAIServiceClient();
  if (!client) {
    return makeIneligibleReview("service_role_unavailable", thresholds);
  }

  const lookbackHours = args.lookbackHours ?? 168;
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  let runsQuery = client
    .from("ai_runs")
    .select("id, success, fallback_used, metadata")
    .gte("created_at", cutoff);

  if (args.taskType) {
    runsQuery = runsQuery.eq("task_type", args.taskType);
  }

  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) {
    return makeIneligibleReview("db_query_failed", thresholds);
  }

  const candidateRuns = (runs ?? []).filter((r) => {
    const meta = r.metadata as Record<string, unknown> | null;
    return meta?.selectedModelKey === args.modelKey;
  });

  const sampleSize = candidateRuns.length;
  const fallbackCount = candidateRuns.filter((r) => r.fallback_used).length;
  const fallbackRate = sampleSize > 0 ? fallbackCount / sampleSize : null;

  const runIds = candidateRuns.map((r) => r.id);
  let avgScore: number | null = null;
  let passRate: number | null = null;

  if (runIds.length > 0) {
    const { data: evals } = await client
      .from("ai_eval_runs")
      .select("score, passed")
      .in("ai_run_id", runIds);

    if (evals && evals.length > 0) {
      const scores = evals.map((e) => e.score).filter((s): s is number => s != null);
      avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const passCount = evals.filter((e) => e.passed).length;
      passRate = evals.length > 0 ? passCount / evals.length : null;
    }
  }

  let positiveFeedbackRate: number | null = null;
  let feedbackSampleSize = 0;

  if (runIds.length > 0) {
    const { data: feedback } = await client
      .from("ai_feedback")
      .select("rating")
      .in("ai_run_id", runIds);

    if (feedback && feedback.length > 0) {
      feedbackSampleSize = feedback.length;
      const positive = feedback.filter((f) => f.rating > 0).length;
      positiveFeedbackRate = positive / feedback.length;
    }
  }

  const metrics = {
    sampleSize,
    avgScore,
    passRate,
    fallbackRate,
    positiveFeedbackRate,
    feedbackSampleSize,
  };

  const checks: PromotionReview["checks"] = [];

  checks.push({
    name: "min_sample_size",
    passed: sampleSize >= thresholds.min_sample_size,
    actual: sampleSize,
    required: thresholds.min_sample_size,
  });

  checks.push({
    name: "min_avg_score",
    passed: avgScore != null && avgScore >= thresholds.min_avg_score,
    actual: avgScore,
    required: thresholds.min_avg_score,
  });

  checks.push({
    name: "min_pass_rate",
    passed: passRate != null && passRate >= thresholds.min_pass_rate,
    actual: passRate,
    required: thresholds.min_pass_rate,
  });

  checks.push({
    name: "max_fallback_rate",
    passed: fallbackRate != null && fallbackRate <= thresholds.max_fallback_rate,
    actual: fallbackRate,
    required: thresholds.max_fallback_rate,
  });

  const eligible = checks.every((c) => c.passed);

  return {
    eligible,
    reason: eligible ? "all_checks_passed" : "threshold_not_met",
    metrics,
    thresholds,
    checks,
  };
}

function makeIneligibleReview(reason: string, thresholds: PromotionThresholds): PromotionReview {
  return {
    eligible: false,
    reason,
    metrics: {
      sampleSize: 0,
      avgScore: null,
      passRate: null,
      fallbackRate: null,
      positiveFeedbackRate: null,
      feedbackSampleSize: 0,
    },
    thresholds,
    checks: [],
  };
}

export async function compareModelPerformance(args: {
  taskType?: string;
  challengerModelKey: string;
  lookbackHours?: number;
}): Promise<Record<string, unknown>> {
  const client = getAIServiceClient();
  if (!client) return { available: false, reason: "service_client_unavailable" };

  const lookbackHours = args.lookbackHours ?? 168;
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  try {
    let query = client
      .from("ai_runs")
      .select("id, success, fallback_used, latency_ms, metadata")
      .eq("success", true)
      .gte("created_at", cutoff);

    if (args.taskType) {
      query = query.eq("task_type", args.taskType);
    }

    const { data: runs } = await query;
    if (!runs || runs.length === 0) {
      return { available: false, reason: "no_data" };
    }

    const challenger = runs.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      return meta?.selectedModelKey === args.challengerModelKey;
    });

    const champion = runs.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      return meta?.selectedRole === "champion";
    });

    return {
      available: true,
      challenger: {
        count: challenger.length,
        avgLatencyMs: challenger.length > 0
          ? challenger.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / challenger.length
          : null,
        fallbackRate: challenger.length > 0
          ? challenger.filter((r) => r.fallback_used).length / challenger.length
          : null,
      },
      champion: {
        count: champion.length,
        avgLatencyMs: champion.length > 0
          ? champion.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / champion.length
          : null,
        fallbackRate: champion.length > 0
          ? champion.filter((r) => r.fallback_used).length / champion.length
          : null,
      },
    };
  } catch (error) {
    return { available: false, reason: "query_failed" };
  }
}

export async function promoteModelCandidate(args: {
  modelKey: string;
  modelVersion?: string;
  taskType?: string;
  notes?: string;
}): Promise<{
  ok: boolean;
  promotedId?: string;
  demotedIds?: string[];
  error?: string;
}> {
  const client = getAIServiceClient();
  if (!client) return { ok: false, error: "service_role_unavailable" };

  try {
    const registry = await listModelRegistryEntries({ includeInactive: false, limit: 200 });
    if (!registry.ok) return { ok: false, error: "model_registry_unavailable" };

    const currentChampions = registry.rows.filter(
      (r) => getEntryTrafficRole(r) === "champion",
    );

    const demotedIds: string[] = [];
    for (const champ of currentChampions) {
      const { error } = await client
        .from("model_registry")
        .update({
          traffic_role: "shadow",
          is_active: false,
          demoted_at: new Date().toISOString(),
          promotion_status: "demoted",
          notes: `Demoted in favor of ${args.modelKey}`,
        })
        .eq("id", champ.id);

      if (!error) demotedIds.push(champ.id);
    }

    const challenger = registry.rows.find(
      (r) =>
        r.modelKey === args.modelKey &&
        getEntryTrafficRole(r) === "challenger",
    );

    if (challenger) {
      const { error } = await client
        .from("model_registry")
        .update({
          traffic_role: "champion",
          promotion_status: "promoted",
          promoted_at: new Date().toISOString(),
          notes: args.notes ?? "promoted",
        })
        .eq("id", challenger.id);

      if (error) return { ok: false, error: error.message };

      return { ok: true, promotedId: challenger.id, demotedIds };
    }

    return { ok: false, error: "challenger_row_not_found" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "promotion_failed",
    };
  }
}

export type PromotionReviewBatchSummary = {
  enabled: boolean;
  reviewed: number;
  eligible: number;
  insufficient: number;
  keepChampion: number;
  manualReview: number;
  items: Array<Record<string, unknown>>;
};

export async function runPromotionReviewBatch(args: {
  lookbackHours?: number;
}): Promise<PromotionReviewBatchSummary> {
  const enabled = envBool("AI_PROMOTION_CRON_ENABLED", true);
  if (!enabled) {
    return {
      enabled: false,
      reviewed: 0,
      eligible: 0,
      insufficient: 0,
      keepChampion: 0,
      manualReview: 0,
      items: [],
    };
  }

  try {
    const registry = await listModelRegistryEntries({ includeInactive: false, limit: 200 });
    if (!registry.ok) {
      return {
        enabled: true,
        reviewed: 0,
        eligible: 0,
        insufficient: 0,
        keepChampion: 0,
        manualReview: 0,
        items: [],
      };
    }

    const challengers = registry.rows.filter(
      (r) => getEntryTrafficRole(r) === "challenger",
    );

    const items: Array<Record<string, unknown>> = [];
    let eligible = 0;
    let insufficient = 0;

    for (const challenger of challengers) {
      const review = await evaluatePromotionCandidate({
        modelKey: challenger.modelKey,
        modelVersion: challenger.modelVersion,
        lookbackHours: args.lookbackHours,
      });

      if (review.eligible) {
        eligible++;
      } else {
        insufficient++;
      }

      items.push({
        modelKey: challenger.modelKey,
        modelVersion: challenger.modelVersion,
        review,
      });
    }

    return {
      enabled: true,
      reviewed: challengers.length,
      eligible,
      insufficient,
      keepChampion: challengers.length - eligible,
      manualReview: eligible,
      items,
    };
  } catch (error) {
    console.error("[ai/promotion] batch review failed:", error);
    throw error;
  }
}
