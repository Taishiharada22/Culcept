import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIServiceClient } from "@/lib/ai/db";
import { loadStargazerTrainingContext } from "./exportDataset";

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

export type StargazerDownstreamEvalResult = {
  available: boolean;
  score: number | null;
  passed: boolean;
  reason: string;
  taskType: string | null;
  metadata: Record<string, unknown>;
};

type EvalThresholds = {
  minScore: number;
  minTimesShown: number;
  minObservedAcceptedCount: number;
};

function getThresholds(): EvalThresholds {
  return {
    minScore: envNumber("STARGAZER_DOWNSTREAM_EVAL_MIN_SCORE", 0.55),
    minTimesShown: envNumber("STARGAZER_DOWNSTREAM_EVAL_MIN_TIMES_SHOWN", 5),
    minObservedAcceptedCount: envNumber(
      "STARGAZER_DOWNSTREAM_EVAL_MIN_OBSERVED_ACCEPTED",
      1,
    ),
  };
}

export async function evaluateStargazerRunDownstream(args: {
  aiRunId: string;
  client?: SupabaseClient | null;
  dryRun?: boolean;
}): Promise<StargazerDownstreamEvalResult> {
  const client = args.client ?? getAIServiceClient();
  if (!client) {
    return {
      available: false,
      score: null,
      passed: false,
      reason: "service_role_unavailable",
      taskType: null,
      metadata: {},
    };
  }

  const context = await loadStargazerTrainingContext(
    client,
    {
      limit: 5000,
      onlySuccessful: false,
    },
    { aiRunIds: [args.aiRunId] },
  );

  const runCandidates = context.candidates.filter(
    (candidate) => candidate.ai_run_id === args.aiRunId,
  );
  if (runCandidates.length === 0) {
    return {
      available: false,
      score: null,
      passed: false,
      reason: "no_candidates",
      taskType: null,
      metadata: {},
    };
  }

  const taskType = runCandidates[0]?.task_type ?? null;
  const thresholds = getThresholds();
  const summary = context.runOutcomeMap.get(args.aiRunId) ?? null;
  if (!summary) {
    return {
      available: false,
      score: null,
      passed: false,
      reason: "summary_unavailable",
      taskType,
      metadata: {},
    };
  }

  const score = summary.downstreamScore;
  const passed =
    score != null &&
    score >= thresholds.minScore &&
    summary.timesShown >= thresholds.minTimesShown &&
    summary.observedAcceptedCount >= thresholds.minObservedAcceptedCount;

  const candidateMetrics = runCandidates.map((candidate) => {
    const metric =
      candidate.acceptance_status !== "accepted" || !candidate.accepted_entity_id
        ? null
        : candidate.entity_type === "question"
          ? context.questionMetrics.get(candidate.accepted_entity_id) ?? null
          : context.lensMetrics.get(candidate.accepted_entity_id) ?? null;

    return {
      candidateId: candidate.id,
      entityType: candidate.entity_type,
      acceptanceStatus: candidate.acceptance_status,
      acceptedEntityId: candidate.accepted_entity_id,
      metric,
    };
  });

  if (!args.dryRun) {
    for (const candidate of runCandidates) {
      const metric =
        candidate.acceptance_status !== "accepted" || !candidate.accepted_entity_id
          ? null
          : candidate.entity_type === "question"
            ? context.questionMetrics.get(candidate.accepted_entity_id) ?? null
            : context.lensMetrics.get(candidate.accepted_entity_id) ?? null;

      if (!metric) continue;

      const { error } = await client
        .from("stargazer_generation_candidates")
        .update({
          downstream_metrics: metric,
        })
        .eq("id", candidate.id);

      if (error) {
        console.warn(
          "[stargazer/downstreamEval] failed to persist candidate metrics:",
          candidate.id,
          error.message,
        );
      }
    }
  }

  const metadata = {
    track: "stargazer",
    summary,
    thresholds,
    candidateMetrics,
  } satisfies Record<string, unknown>;

  return {
    available: true,
    score,
    passed,
    reason: passed ? "downstream_threshold_met" : "downstream_threshold_not_met",
    taskType,
    metadata,
  };
}
