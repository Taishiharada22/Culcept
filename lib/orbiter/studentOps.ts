import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureTeacherOutputForStoredRun } from "@/lib/ai/eval";
import { generateTrainingArtifact } from "@/lib/ai/trainingArtifacts";
import { getAIServiceClient } from "@/lib/ai/db";
import { loadPreviousDigest } from "./existentialDigest";
import {
  exportOrbiterTeacherDataset,
  exportOrbiterTrainingDataset,
  type OrbiterTeacherDatasetRow,
  type OrbiterTrainingDatasetRow,
} from "./exportDataset";
import {
  ORBITER_MEMORY_SUMMARY_JSON_SCHEMA,
  refreshOrbiterMemorySummary,
} from "./memorySummary";
import {
  ORBITER_STUDENT_TASK_TYPES,
  type OrbiterTrainingArtifactType,
} from "./studentTrack";
import type {
  OrbiterContext,
  OrbiterIntelligence,
  OrbiterMemoryState,
  OrbiterMemo,
} from "./types";

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function envString(name: string, fallback: string): string {
  const raw = (process.env[name] ?? "").trim();
  return raw || fallback;
}

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function toTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeTeacherRunId(row: TeacherOutputRow): string | null {
  return row.ai_run_id ?? row.source_ai_run_id ?? null;
}

type AIRunRow = {
  id: string;
  created_at: string;
  task_type: string;
  provider: string | null;
  model: string | null;
  prompt_text: string | null;
  system_prompt: string | null;
  response_text: string | null;
  error_message: string | null;
  success: boolean;
  latency_ms: number | null;
  fallback_used: boolean;
  metadata: Record<string, unknown> | null;
};

type TeacherOutputRow = {
  ai_run_id: string | null;
  source_ai_run_id: string | null;
  created_at: string;
};

type EvalRow = {
  ai_run_id: string | null;
  eval_type: string;
  score: number | null;
  passed: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type ArtifactRow = {
  id: string;
  created_at: string;
  artifact_type: string;
  row_count: number;
  status: string;
};

export type OrbiterShadowHealthSummary = {
  lookbackHours: number;
  primaryRuns: number;
  shadowRuns: number;
  successfulPrimaryRuns: number;
  successfulShadowRuns: number;
  teacherCoverageRate: number | null;
  shadowTeacherCoverageRate: number | null;
  shadowEvalCoverageRate: number | null;
  shadowEvalAvgScore: number | null;
  shadowEvalPassRate: number | null;
  fallbackRate: number | null;
  latestArtifacts: {
    training: {
      id: string | null;
      createdAt: string | null;
      rowCount: number;
      status: string | null;
    };
    teacher: {
      id: string | null;
      createdAt: string | null;
      rowCount: number;
      status: string | null;
    };
  };
  failureBreakdown: OrbiterFailureBreakdown[];
  primaryMalformedBreakdown: OrbiterPrimaryMalformedBreakdown;
  primaryProviderFailureBreakdown: OrbiterPrimaryProviderFailureBreakdown;
  requestHealth: OrbiterPrimaryRequestHealth;
  currentPipelineHealth: OrbiterCurrentPipelineHealth;
  dailyTrend: OrbiterStudentTrendPoint[];
};

export type OrbiterFailureBreakdown = {
  kind:
    | "primary_malformed_structured_output"
    | "primary_provider_failure"
    | "shadow_eval_failed";
  count: number;
  lastSeenAt: string | null;
};

export type OrbiterFacetMetric = {
  value: string;
  count: number;
  lastSeenAt: string | null;
};

export type OrbiterPrimaryMalformedBreakdown = {
  total: number;
  byProvider: OrbiterFacetMetric[];
  byModel: OrbiterFacetMetric[];
  byPromptVariant: OrbiterFacetMetric[];
  bySchemaVariant: OrbiterFacetMetric[];
  bySelectedRole: OrbiterFacetMetric[];
  bySelectedModelKey: OrbiterFacetMetric[];
};

export type OrbiterPrimaryProviderFailureBreakdown = {
  total: number;
  byErrorKind: OrbiterFacetMetric[];
  byProvider: OrbiterFacetMetric[];
  byModel: OrbiterFacetMetric[];
  byPromptVariant: OrbiterFacetMetric[];
  bySchemaVariant: OrbiterFacetMetric[];
};

export type OrbiterStudentTrendPoint = {
  bucket: string;
  primaryRuns: number;
  primarySuccesses: number;
  primaryMalformedCount: number;
  primaryProviderFailureCount: number;
  shadowRuns: number;
  shadowSuccesses: number;
  shadowEvalFailedCount: number;
  shadowEvalPassedCount: number;
  teacherCoverageRate: number | null;
  shadowEvalPassRate: number | null;
};

export type OrbiterPrimaryRequestTrendPoint = {
  bucket: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  rescuedSuccessCount: number;
  malformedRequestCount: number;
  providerFailureRequestCount: number;
  successRate: number | null;
  avgAttempts: number | null;
};

export type OrbiterPrimaryRequestHealth = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  avgAttemptsPerRequest: number | null;
  retriedRequestCount: number;
  rescuedSuccessCount: number;
  outcomeBreakdown: OrbiterFacetMetric[];
  dailyTrend: OrbiterPrimaryRequestTrendPoint[];
};

export type OrbiterCurrentPipelineHealth = {
  runCount: number;
  successCount: number;
  successRate: number | null;
  malformedCount: number;
  providerFailureCount: number;
  rescuedSuccessCount: number;
  legacyExcludedRunCount: number;
  promptVariantBreakdown: OrbiterFacetMetric[];
  schemaVariantBreakdown: OrbiterFacetMetric[];
  requestHealth: OrbiterPrimaryRequestHealth;
};

export type OrbiterShadowWarmupSummary = {
  lookbackHours: number;
  requestedActions: number;
  attemptedActions: number;
  completedActions: number;
  primaryRunsCreated: number;
  shadowRunsCreated: number;
  candidateCount: number;
  candidateIds: string[];
  primaryAiRunIds: string[];
  shadowAiRunIds: string[];
  failures: Array<{
    candidateId: string;
    reason: string;
  }>;
};

export type OrbiterTeacherBackfillSummary = {
  lookbackHours: number;
  requestedLimit: number;
  scannedRuns: number;
  candidateRuns: number;
  missingRuns: number;
  inserted: number;
  skipped: number;
  failures: Array<{
    aiRunId: string;
    reason: string;
  }>;
};

export type OrbiterArtifactSampleCheckResult = {
  id: string | null;
  artifactType: OrbiterTrainingArtifactType;
  artifactId: string | null;
  status: "pass" | "warn" | "fail";
  rowCount: number;
  sampleCount: number;
  issues: string[];
  sampleRows: Record<string, unknown>[];
};

export type OrbiterArtifactSampleCheckRun = {
  lookbackHours: number;
  sampleSize: number;
  checks: OrbiterArtifactSampleCheckResult[];
};

async function loadLatestArtifact(args: {
  client: SupabaseClient;
  artifactType: OrbiterTrainingArtifactType;
}): Promise<ArtifactRow | null> {
  const { data, error } = await args.client
    .from("ai_training_artifacts")
    .select("id, created_at, artifact_type, row_count, status")
    .eq("artifact_type", args.artifactType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ArtifactRow | null) ?? null;
}

function getMonitorTimezone(): string {
  return (process.env.ORBITER_MONITOR_TIMEZONE ?? "Asia/Tokyo").trim() || "Asia/Tokyo";
}

function formatDateBucket(value: string, timeZone = getMonitorTimezone()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(value));
}

function isPrimaryMalformedRun(row: AIRunRow): boolean {
  if (row.metadata?.shadowPass === true) return false;
  if (row.success) return false;
  return (row.error_message ?? "").toLowerCase().includes("malformed_structured_output");
}

function isPrimaryProviderFailureRun(row: AIRunRow): boolean {
  if (row.metadata?.shadowPass === true) return false;
  if (row.success) return false;
  return !isPrimaryMalformedRun(row);
}

function isCurrentPrimaryPipelineRun(row: AIRunRow): boolean {
  if (row.metadata?.shadowPass === true) return false;
  return Boolean(
    toTextOrNull(row.metadata?.summaryRequestId) ||
      toTextOrNull(row.metadata?.summaryPromptVariant) ||
      toTextOrNull(row.metadata?.summarySchemaVariant),
  );
}

function inferPrimaryProviderFailureKind(row: AIRunRow): string {
  const message = (row.error_message ?? "").toLowerCase();
  if (!message) return "provider_failure";
  if (message.includes("timeout")) return "provider_timeout";
  if (message.includes("503") || message.includes("unavailable")) {
    return "provider_unavailable";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "rate_limited";
  }
  if (message.includes("api_key_missing")) return "api_key_missing";
  if (message.includes("empty_output")) return "empty_output";
  if (message.includes("http_error")) return "provider_http_error";
  return "provider_failure";
}

function getSummaryPromptVariant(row: AIRunRow): string {
  const explicit = toTextOrNull(row.metadata?.summaryPromptVariant);
  if (explicit) return explicit;

  const attempt = toTextOrNull(row.metadata?.summaryAttempt);
  switch (attempt) {
    case "strict":
      return "strict_base_prompt";
    case "strict_retry":
      return "strict_retry_prompt";
    case "raw_fallback":
      return "raw_fallback_prompt";
    default:
      return "unknown";
  }
}

function getSummarySchemaVariant(row: AIRunRow): string {
  const explicit = toTextOrNull(row.metadata?.summarySchemaVariant);
  if (explicit) return explicit;

  const promptVariant = getSummaryPromptVariant(row);
  if (promptVariant === "raw_fallback_prompt") {
    return "raw_json_recovery";
  }
  if (
    promptVariant === "strict_base_prompt" ||
    promptVariant === "strict_retry_prompt"
  ) {
    return "json_schema_required";
  }
  return "unknown";
}

function summarizeFacet<T>(
  items: T[],
  pickValue: (item: T) => string | null,
  pickTimestamp: (item: T) => string,
): OrbiterFacetMetric[] {
  const summary = new Map<string, { count: number; lastSeenAt: string | null }>();

  for (const item of items) {
    const value = pickValue(item) ?? "unknown";
    const current = summary.get(value);
    const timestamp = pickTimestamp(item);
    const lastSeenAt =
      !current || timestamp.localeCompare(current.lastSeenAt ?? "") > 0
        ? timestamp
        : current.lastSeenAt;
    summary.set(value, {
      count: (current?.count ?? 0) + 1,
      lastSeenAt,
    });
  }

  return Array.from(summary.entries())
    .map(([value, metric]) => ({
      value,
      count: metric.count,
      lastSeenAt: metric.lastSeenAt,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.value.localeCompare(right.value);
    });
}

type OrbiterPrimaryRequestSummary = {
  requestId: string;
  startedAt: string;
  completedAt: string;
  attemptCount: number;
  success: boolean;
  malformedAttemptCount: number;
  providerFailureAttemptCount: number;
  rescuedSuccess: boolean;
  outcome: string;
};

function getPrimaryRequestId(row: AIRunRow): string {
  return toTextOrNull(row.metadata?.summaryRequestId) ?? `legacy:${row.id}`;
}

function inferPrimaryRequestOutcome(args: {
  successRun: AIRunRow | null;
  malformedAttemptCount: number;
  providerFailureAttemptCount: number;
}): string {
  if (args.successRun) {
    if (args.successRun.metadata?.summaryProviderRescueApplied === true) {
      return "provider_rescue_success";
    }
    switch (toTextOrNull(args.successRun.metadata?.summaryAttempt)) {
      case "strict":
        return "strict_success";
      case "strict_retry":
        return "strict_retry_success";
      case "raw_fallback":
        return "raw_fallback_success";
      default:
        return "success_unknown";
    }
  }

  if (args.malformedAttemptCount > 0 && args.providerFailureAttemptCount > 0) {
    return "failed_after_mixed_errors";
  }
  if (args.providerFailureAttemptCount > 0) {
    return "failed_after_provider_failures";
  }
  if (args.malformedAttemptCount > 0) {
    return "failed_after_malformed";
  }
  return "failed_unknown";
}

function buildPrimaryRequestSummaries(
  primaryRuns: AIRunRow[],
): OrbiterPrimaryRequestSummary[] {
  const requestMap = new Map<string, AIRunRow[]>();
  for (const row of primaryRuns) {
    const requestId = getPrimaryRequestId(row);
    const current = requestMap.get(requestId) ?? [];
    current.push(row);
    requestMap.set(requestId, current);
  }

  return Array.from(requestMap.entries())
    .map(([requestId, rows]) => {
      const attempts = [...rows].sort((left, right) =>
        left.created_at.localeCompare(right.created_at),
      );
      const successRun = attempts.find((row) => row.success) ?? null;
      const malformedAttemptCount = attempts.filter((row) =>
        isPrimaryMalformedRun(row),
      ).length;
      const providerFailureAttemptCount = attempts.filter((row) =>
        isPrimaryProviderFailureRun(row),
      ).length;

      return {
        requestId,
        startedAt: attempts[0]?.created_at ?? "",
        completedAt: attempts[attempts.length - 1]?.created_at ?? "",
        attemptCount: attempts.length,
        success: Boolean(successRun),
        malformedAttemptCount,
        providerFailureAttemptCount,
        rescuedSuccess: successRun?.metadata?.summaryProviderRescueApplied === true,
        outcome: inferPrimaryRequestOutcome({
          successRun,
          malformedAttemptCount,
          providerFailureAttemptCount,
        }),
      };
    })
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function summarizePrimaryRequestHealth(args: {
  lookbackHours: number;
  primaryRuns: AIRunRow[];
}): OrbiterPrimaryRequestHealth {
  const requests = buildPrimaryRequestSummaries(args.primaryRuns);
  const lookbackDays = Math.max(1, Math.ceil(args.lookbackHours / 24));
  const points = new Map<
    string,
    OrbiterPrimaryRequestTrendPoint & { totalAttempts: number }
  >();

  for (let offset = lookbackDays - 1; offset >= 0; offset -= 1) {
    const bucket = formatDateBucket(
      new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString(),
    );
    points.set(bucket, {
      bucket,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      rescuedSuccessCount: 0,
      malformedRequestCount: 0,
      providerFailureRequestCount: 0,
      successRate: null,
      avgAttempts: null,
      totalAttempts: 0,
    });
  }

  for (const request of requests) {
    const point = points.get(formatDateBucket(request.startedAt));
    if (!point) continue;
    point.requestCount += 1;
    point.totalAttempts += request.attemptCount;
    if (request.success) {
      point.successCount += 1;
    } else {
      point.failureCount += 1;
    }
    if (request.rescuedSuccess) {
      point.rescuedSuccessCount += 1;
    }
    if (request.malformedAttemptCount > 0) {
      point.malformedRequestCount += 1;
    }
    if (request.providerFailureAttemptCount > 0) {
      point.providerFailureRequestCount += 1;
    }
  }

  const dailyTrend = Array.from(points.values()).map((point) => ({
    bucket: point.bucket,
    requestCount: point.requestCount,
    successCount: point.successCount,
    failureCount: point.failureCount,
    rescuedSuccessCount: point.rescuedSuccessCount,
    malformedRequestCount: point.malformedRequestCount,
    providerFailureRequestCount: point.providerFailureRequestCount,
    successRate:
      point.requestCount > 0 ? point.successCount / point.requestCount : null,
    avgAttempts:
      point.requestCount > 0 ? point.totalAttempts / point.requestCount : null,
  }));

  const successCount = requests.filter((request) => request.success).length;
  const rescuedSuccessCount = requests.filter((request) => request.rescuedSuccess).length;

  return {
    requestCount: requests.length,
    successCount,
    failureCount: Math.max(0, requests.length - successCount),
    successRate: requests.length > 0 ? successCount / requests.length : null,
    avgAttemptsPerRequest: average(requests.map((request) => request.attemptCount)),
    retriedRequestCount: requests.filter((request) => request.attemptCount > 1).length,
    rescuedSuccessCount,
    outcomeBreakdown: summarizeFacet(
      requests,
      (request) => request.outcome,
      (request) => request.completedAt,
    ),
    dailyTrend,
  };
}

function summarizeCurrentPipelineHealth(args: {
  lookbackHours: number;
  primaryRuns: AIRunRow[];
}): OrbiterCurrentPipelineHealth {
  const currentPipelineRuns = args.primaryRuns.filter((row) =>
    isCurrentPrimaryPipelineRun(row),
  );
  const successCount = currentPipelineRuns.filter((row) => row.success).length;
  const malformedCount = currentPipelineRuns.filter((row) =>
    isPrimaryMalformedRun(row),
  ).length;
  const providerFailureCount = currentPipelineRuns.filter((row) =>
    isPrimaryProviderFailureRun(row),
  ).length;
  const rescuedSuccessCount = currentPipelineRuns.filter(
    (row) =>
      row.success && row.metadata?.summaryProviderRescueApplied === true,
  ).length;

  return {
    runCount: currentPipelineRuns.length,
    successCount,
    successRate:
      currentPipelineRuns.length > 0 ? successCount / currentPipelineRuns.length : null,
    malformedCount,
    providerFailureCount,
    rescuedSuccessCount,
    legacyExcludedRunCount: Math.max(0, args.primaryRuns.length - currentPipelineRuns.length),
    promptVariantBreakdown: summarizeFacet(
      currentPipelineRuns,
      (row) => getSummaryPromptVariant(row),
      (row) => row.created_at,
    ),
    schemaVariantBreakdown: summarizeFacet(
      currentPipelineRuns,
      (row) => getSummarySchemaVariant(row),
      (row) => row.created_at,
    ),
    requestHealth: summarizePrimaryRequestHealth({
      lookbackHours: args.lookbackHours,
      primaryRuns: currentPipelineRuns,
    }),
  };
}

function summarizePrimaryMalformedBreakdown(
  primaryRuns: AIRunRow[],
): OrbiterPrimaryMalformedBreakdown {
  const malformedRuns = primaryRuns.filter((row) => isPrimaryMalformedRun(row));

  return {
    total: malformedRuns.length,
    byProvider: summarizeFacet(
      malformedRuns,
      (row) => toTextOrNull(row.provider) ?? "unknown",
      (row) => row.created_at,
    ),
    byModel: summarizeFacet(
      malformedRuns,
      (row) => toTextOrNull(row.model) ?? "unknown",
      (row) => row.created_at,
    ),
    byPromptVariant: summarizeFacet(malformedRuns, (row) =>
      getSummaryPromptVariant(row),
      (row) => row.created_at,
    ),
    bySchemaVariant: summarizeFacet(malformedRuns, (row) =>
      getSummarySchemaVariant(row),
      (row) => row.created_at,
    ),
    bySelectedRole: summarizeFacet(malformedRuns, (row) =>
      toTextOrNull(row.metadata?.selectedRole),
      (row) => row.created_at,
    ),
    bySelectedModelKey: summarizeFacet(malformedRuns, (row) =>
      toTextOrNull(row.metadata?.selectedModelKey),
      (row) => row.created_at,
    ),
  };
}

function summarizePrimaryProviderFailureBreakdown(
  primaryRuns: AIRunRow[],
): OrbiterPrimaryProviderFailureBreakdown {
  const failureRuns = primaryRuns.filter((row) => isPrimaryProviderFailureRun(row));

  return {
    total: failureRuns.length,
    byErrorKind: summarizeFacet(failureRuns, (row) =>
      inferPrimaryProviderFailureKind(row),
      (row) => row.created_at,
    ),
    byProvider: summarizeFacet(
      failureRuns,
      (row) => toTextOrNull(row.provider) ?? "unknown",
      (row) => row.created_at,
    ),
    byModel: summarizeFacet(
      failureRuns,
      (row) => toTextOrNull(row.model) ?? "unknown",
      (row) => row.created_at,
    ),
    byPromptVariant: summarizeFacet(failureRuns, (row) =>
      getSummaryPromptVariant(row),
      (row) => row.created_at,
    ),
    bySchemaVariant: summarizeFacet(failureRuns, (row) =>
      getSummarySchemaVariant(row),
      (row) => row.created_at,
    ),
  };
}

function summarizeFailureBreakdown(args: {
  primaryRuns: AIRunRow[];
  shadowRuns: AIRunRow[];
  evalByRunId: Map<string, EvalRow>;
}): OrbiterFailureBreakdown[] {
  const primaryMalformedRuns = args.primaryRuns.filter((row) => isPrimaryMalformedRun(row));
  const primaryProviderFailureRuns = args.primaryRuns.filter((row) =>
    isPrimaryProviderFailureRun(row),
  );
  const shadowEvalFailedRuns = args.shadowRuns.filter((row) => {
    const evalRow = args.evalByRunId.get(row.id);
    return row.success && evalRow?.passed === false;
  });

  return [
    {
      kind: "primary_malformed_structured_output",
      count: primaryMalformedRuns.length,
      lastSeenAt:
        primaryMalformedRuns.length > 0
          ? primaryMalformedRuns
              .map((row) => row.created_at)
              .sort((left, right) => right.localeCompare(left))[0]
          : null,
    },
    {
      kind: "primary_provider_failure",
      count: primaryProviderFailureRuns.length,
      lastSeenAt:
        primaryProviderFailureRuns.length > 0
          ? primaryProviderFailureRuns
              .map((row) => row.created_at)
              .sort((left, right) => right.localeCompare(left))[0]
          : null,
    },
    {
      kind: "shadow_eval_failed",
      count: shadowEvalFailedRuns.length,
      lastSeenAt:
        shadowEvalFailedRuns.length > 0
          ? shadowEvalFailedRuns
              .map((row) => row.created_at)
              .sort((left, right) => right.localeCompare(left))[0]
          : null,
    },
  ];
}

function buildDailyTrend(args: {
  lookbackHours: number;
  primaryRuns: AIRunRow[];
  shadowRuns: AIRunRow[];
  teacherRunIds: Set<string>;
  evalByRunId: Map<string, EvalRow>;
}): OrbiterStudentTrendPoint[] {
  const lookbackDays = Math.max(1, Math.ceil(args.lookbackHours / 24));
  const points = new Map<string, OrbiterStudentTrendPoint>();

  for (let offset = lookbackDays - 1; offset >= 0; offset -= 1) {
    const bucket = formatDateBucket(
      new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString(),
    );
    points.set(bucket, {
      bucket,
      primaryRuns: 0,
      primarySuccesses: 0,
      primaryMalformedCount: 0,
      primaryProviderFailureCount: 0,
      shadowRuns: 0,
      shadowSuccesses: 0,
      shadowEvalFailedCount: 0,
      shadowEvalPassedCount: 0,
      teacherCoverageRate: null,
      shadowEvalPassRate: null,
    });
  }

  for (const row of args.primaryRuns) {
    const point = points.get(formatDateBucket(row.created_at));
    if (!point) continue;
    point.primaryRuns += 1;
    if (row.success) point.primarySuccesses += 1;
    if (isPrimaryMalformedRun(row)) point.primaryMalformedCount += 1;
    if (isPrimaryProviderFailureRun(row)) point.primaryProviderFailureCount += 1;
  }

  for (const row of args.shadowRuns) {
    const point = points.get(formatDateBucket(row.created_at));
    if (!point) continue;
    point.shadowRuns += 1;
    if (row.success) point.shadowSuccesses += 1;
    const evalRow = args.evalByRunId.get(row.id);
    if (row.success && evalRow?.passed === true) point.shadowEvalPassedCount += 1;
    if (row.success && evalRow?.passed === false) point.shadowEvalFailedCount += 1;
  }

  for (const point of points.values()) {
    const bucketPrimaryRuns = args.primaryRuns.filter(
      (row) => formatDateBucket(row.created_at) === point.bucket,
    );
    const bucketShadowRuns = args.shadowRuns.filter(
      (row) => formatDateBucket(row.created_at) === point.bucket && row.success,
    );
    if (bucketPrimaryRuns.length + bucketShadowRuns.length > 0) {
      const successful = [...bucketPrimaryRuns, ...bucketShadowRuns].filter((row) => row.success);
      point.teacherCoverageRate =
        successful.length > 0
          ? successful.filter((row) => args.teacherRunIds.has(row.id)).length /
            successful.length
          : null;
    }
    const shadowEvalsForBucket = bucketShadowRuns
      .map((row) => args.evalByRunId.get(row.id))
      .filter((row): row is EvalRow => Boolean(row));
    point.shadowEvalPassRate =
      shadowEvalsForBucket.length > 0
        ? shadowEvalsForBucket.filter((row) => row.passed).length /
          shadowEvalsForBucket.length
        : null;
  }

  return Array.from(points.values());
}

export async function getOrbiterShadowHealthSummary(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
}): Promise<OrbiterShadowHealthSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("ORBITER_HEALTH_LOOKBACK_HOURS", 168)),
  );
  const cutoff = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: runs, error: runsError }, { data: teachers, error: teacherError }] =
    await Promise.all([
      client
        .from("ai_runs")
        .select(
          "id, created_at, task_type, provider, model, prompt_text, system_prompt, response_text, error_message, success, latency_ms, fallback_used, metadata",
        )
        .in("task_type", [...ORBITER_STUDENT_TASK_TYPES])
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false }),
      client
        .from("teacher_outputs")
        .select("ai_run_id, source_ai_run_id, created_at")
        .in("task_type", [...ORBITER_STUDENT_TASK_TYPES])
        .gte("created_at", cutoff),
    ]);

  if (runsError) throw new Error(runsError.message);
  if (teacherError) throw new Error(teacherError.message);

  const runRows = (((runs ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
  const teacherRunIds = new Set(
    (((teachers ?? []) as unknown) as TeacherOutputRow[])
      .map(normalizeTeacherRunId)
      .filter((value): value is string => Boolean(value)),
  );

  const shadowRuns = runRows.filter((row) => row.metadata?.shadowPass === true);
  const primaryRuns = runRows.filter((row) => row.metadata?.shadowPass !== true);
  const successfulRuns = runRows.filter((row) => row.success);
  const successfulShadowRuns = shadowRuns.filter((row) => row.success);
  const successfulPrimaryRuns = primaryRuns.filter((row) => row.success);

  const shadowRunIds = successfulShadowRuns.map((row) => row.id);
  let evalRows: EvalRow[] = [];
  if (shadowRunIds.length > 0) {
    const { data, error } = await client
      .from("ai_eval_runs")
      .select("ai_run_id, eval_type, score, passed, created_at, metadata")
      .eq("eval_type", "orbiter_shadow")
      .in("ai_run_id", shadowRunIds);

    if (error) {
      throw new Error(error.message);
    }

    evalRows = ((((data ?? []) as unknown) as EvalRow[]).map((row) => ({
      ...row,
      metadata: asObjectOrNull(row.metadata),
    })));
  }

  const evalByRunId = new Map(
    evalRows
      .filter((row) => row.ai_run_id)
      .map((row) => [row.ai_run_id as string, row]),
  );

  const [latestTrainingArtifact, latestTeacherArtifact] = await Promise.all([
    loadLatestArtifact({
      client,
      artifactType: "orbiter_training_jsonl",
    }),
    loadLatestArtifact({
      client,
      artifactType: "orbiter_teacher_jsonl",
    }),
  ]);

  return {
    lookbackHours,
    primaryRuns: primaryRuns.length,
    shadowRuns: shadowRuns.length,
    successfulPrimaryRuns: successfulPrimaryRuns.length,
    successfulShadowRuns: successfulShadowRuns.length,
    teacherCoverageRate:
      successfulRuns.length > 0
        ? successfulRuns.filter((row) => teacherRunIds.has(row.id)).length /
          successfulRuns.length
        : null,
    shadowTeacherCoverageRate:
      successfulShadowRuns.length > 0
        ? successfulShadowRuns.filter((row) => teacherRunIds.has(row.id)).length /
          successfulShadowRuns.length
        : null,
    shadowEvalCoverageRate:
      successfulShadowRuns.length > 0
        ? successfulShadowRuns.filter((row) => evalByRunId.has(row.id)).length /
          successfulShadowRuns.length
        : null,
    shadowEvalAvgScore: average(evalRows.map((row) => row.score)),
    shadowEvalPassRate:
      evalRows.length > 0
        ? evalRows.filter((row) => row.passed).length / evalRows.length
        : null,
    fallbackRate:
      runRows.length > 0
        ? runRows.filter((row) => row.fallback_used).length / runRows.length
        : null,
    latestArtifacts: {
      training: {
        id: latestTrainingArtifact?.id ?? null,
        createdAt: latestTrainingArtifact?.created_at ?? null,
        rowCount: latestTrainingArtifact?.row_count ?? 0,
        status: latestTrainingArtifact?.status ?? null,
      },
      teacher: {
        id: latestTeacherArtifact?.id ?? null,
        createdAt: latestTeacherArtifact?.created_at ?? null,
        rowCount: latestTeacherArtifact?.row_count ?? 0,
        status: latestTeacherArtifact?.status ?? null,
      },
    },
    failureBreakdown: summarizeFailureBreakdown({
      primaryRuns,
      shadowRuns,
      evalByRunId,
    }),
    primaryMalformedBreakdown: summarizePrimaryMalformedBreakdown(primaryRuns),
    primaryProviderFailureBreakdown:
      summarizePrimaryProviderFailureBreakdown(primaryRuns),
    requestHealth: summarizePrimaryRequestHealth({
      lookbackHours,
      primaryRuns,
    }),
    currentPipelineHealth: summarizeCurrentPipelineHealth({
      lookbackHours,
      primaryRuns,
    }),
    dailyTrend: buildDailyTrend({
      lookbackHours,
      primaryRuns,
      shadowRuns,
      teacherRunIds,
      evalByRunId,
    }),
  };
}

type OrbiterWarmupCandidateRow = {
  user_id: string;
  candidate_id: string;
  state: string | null;
  updated_at: string;
};

const ORBITER_WARMUP_MEMO_TEMPLATES: Array<{
  content: string;
  confidence: number;
  headline: string;
  nextMove: string;
  experimentGoal: string;
  latestMilestone: string;
}> = [
  {
    content: "会話の立ち上がりより、少し間を置いた後の反応の方が自然に伸びている。",
    confidence: 0.64,
    headline: "まだ観測量は少ないが、反応の立ち上がり方に一貫性が見え始めている。",
    nextMove: "反応が伸びる前の間の条件をもう1つ観測する",
    experimentGoal: "初動より後半反応が伸びる条件を見極める",
    latestMilestone: "反応が伸びるタイミングの仮説が立ち始めた",
  },
  {
    content: "短い往復では慎重だが、文脈が少し積まれると応答の温度が上がる傾向がある。",
    confidence: 0.61,
    headline: "短い往復では慎重だが、文脈が積まれると応答が温まる兆しがある。",
    nextMove: "文脈量で反応温度が変わるかを追加観測する",
    experimentGoal: "会話密度と応答温度の相関を観測する",
    latestMilestone: "文脈量に応じた反応差が見え始めた",
  },
  {
    content: "質問よりも、相手の見方を言語化した時の方が自然な自己開示が出やすい。",
    confidence: 0.59,
    headline: "直接質問より、見立てへの反応で自然な自己開示が出やすい可能性がある。",
    nextMove: "問い方と自己開示量の差をもう1回観測する",
    experimentGoal: "問い方の違いが自己開示に与える影響を測る",
    latestMilestone: "自己開示を引き出す言い回しの差が見え始めた",
  },
];

function buildOrbiterWarmupMemoryState(): OrbiterMemoryState {
  return {
    memos: [],
    latestHypothesis: null,
    pendingQuestion: null,
    milestoneCount: 0,
    revisionCount: 0,
  };
}

function buildOrbiterWarmupIntelligence(
  template: (typeof ORBITER_WARMUP_MEMO_TEMPLATES)[number],
): OrbiterIntelligence {
  return {
    attractionProfile: null,
    frictionForecast: null,
    selfStateReport: null,
    sceneRecommendation: null,
    trajectoryForecast: {
      type: "slow_deep",
      typeLabel: "ゆっくり深まる型",
      typeDescription: "急がずに観測を積み重ねるほど理解が深まりやすい",
      phases: [],
      estimatedPace: "slow",
      paceNarrative: "即断よりも観察継続が向いている",
      keyRiskAxis: null,
    },
    dualOutfit: null,
    headline: {
      tone: "tentative",
      intent: "pattern_noticed",
      message: template.headline,
      confidence: 0.56,
    },
    nextMove: {
      type: "reflect",
      suggestion: template.nextMove,
      reason: "Orbiter student warmup で反応パターンの母数を増やす",
      experimentGoal: template.experimentGoal,
      priority: 0.42,
    },
    memoryDigest: {
      hasHypothesis: true,
      latestMilestone: template.latestMilestone,
      revisionCount: 0,
    },
  } as OrbiterIntelligence;
}

function buildOrbiterWarmupMemo(args: {
  template: (typeof ORBITER_WARMUP_MEMO_TEMPLATES)[number];
  actionIndex: number;
}): Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt"> {
  return {
    memoType: "observation",
    content: args.template.content,
    confidence: args.template.confidence,
    linkedMemoId: null,
    metadata: {
      triggerSignal: "student_warmup",
      warmupActionIndex: args.actionIndex,
    },
  };
}

export async function runOrbiterShadowWarmup(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  maxActions?: number;
}): Promise<OrbiterShadowWarmupSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("ORBITER_HEALTH_LOOKBACK_HOURS", 168)),
  );
  const requestedActions = Math.max(
    0,
    Math.trunc(
      args?.maxActions ?? envNumber("ORBITER_SHADOW_WARMUP_MAX_ACTIONS", 1),
    ),
  );
  if (requestedActions <= 0) {
    return {
      lookbackHours,
      requestedActions,
      attemptedActions: 0,
      completedActions: 0,
      primaryRunsCreated: 0,
      shadowRunsCreated: 0,
      candidateCount: 0,
      candidateIds: [],
      primaryAiRunIds: [],
      shadowAiRunIds: [],
      failures: [],
    };
  }

  const candidateLimit = Math.max(
    requestedActions,
    Math.trunc(
      envNumber(
        "ORBITER_SHADOW_WARMUP_CANDIDATE_LIMIT",
        Math.max(3, requestedActions * 2),
      ),
    ),
  );
  const startedAt = new Date().toISOString();
  const { data, error } = await client
    .from("rendezvous_user_states")
    .select("user_id, candidate_id, state, updated_at")
    .order("updated_at", { ascending: false })
    .limit(candidateLimit * 3);

  if (error) {
    throw new Error(error.message);
  }

  const uniqueCandidates = new Map<string, OrbiterWarmupCandidateRow>();
  for (const row of (((data ?? []) as unknown) as OrbiterWarmupCandidateRow[])) {
    if (!row.user_id || !row.candidate_id) continue;
    const key = `${row.user_id}:${row.candidate_id}`;
    if (!uniqueCandidates.has(key)) {
      uniqueCandidates.set(key, row);
    }
    if (uniqueCandidates.size >= candidateLimit) break;
  }

  const selectedCandidates = Array.from(uniqueCandidates.values()).slice(0, requestedActions);
  const primaryAiRunIds: string[] = [];
  const failures: Array<{ candidateId: string; reason: string }> = [];

  for (const [index, row] of selectedCandidates.entries()) {
    const template = ORBITER_WARMUP_MEMO_TEMPLATES[index % ORBITER_WARMUP_MEMO_TEMPLATES.length];
    const currentDigest = await loadPreviousDigest(client, row.user_id);
    const result = await refreshOrbiterMemorySummary({
      supabase: client,
      userId: row.user_id,
      candidateId: row.candidate_id,
      memoryState: buildOrbiterWarmupMemoryState(),
      newMemos: [
        buildOrbiterWarmupMemo({
          template,
          actionIndex: index + 1,
        }),
      ],
      orbiterContext: {
        visitCount: index + 1,
        candidateState: row.state ?? "seen",
        category: "unknown",
        hasReflection: false,
        daysSinceDelivery: 0,
        daysUntilExpiry: null,
        hoursSinceLastVisit: null,
      } satisfies OrbiterContext,
      orbiterIntelligence: buildOrbiterWarmupIntelligence(template),
      currentDigest,
      sessionId: `${row.candidate_id}:orbiter-warmup:${Date.now()}:${index}`,
      persistSummary: false,
      runMetadata: {
        warmupRun: true,
        userFacing: false,
        warmupActionIndex: index + 1,
      },
    });

    if (result.ok && result.aiRunId) {
      primaryAiRunIds.push(result.aiRunId);
      continue;
    }

    failures.push({
      candidateId: row.candidate_id,
      reason: result.reason ?? "warmup_failed",
    });
  }

  const { data: warmupRuns, error: warmupRunsError } = await client
    .from("ai_runs")
    .select("id, metadata, created_at")
    .eq("task_type", "orbiter_memory_summary")
    .gte("created_at", startedAt)
    .order("created_at", { ascending: true });

  if (warmupRunsError) {
    throw new Error(warmupRunsError.message);
  }

  const runRows = (((warmupRuns ?? []) as unknown) as Array<{
    id: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }>).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
  const primaryRuns = runRows.filter(
    (row) => row.metadata?.warmupRun === true && row.metadata?.shadowPass !== true,
  );
  const shadowRuns = runRows.filter(
    (row) =>
      row.metadata?.shadowPass === true &&
      typeof row.metadata?.shadowOfAiRunId === "string" &&
      primaryAiRunIds.includes(String(row.metadata.shadowOfAiRunId)),
  );

  return {
    lookbackHours,
    requestedActions,
    attemptedActions: selectedCandidates.length,
    completedActions: primaryAiRunIds.length,
    primaryRunsCreated: primaryRuns.length,
    shadowRunsCreated: shadowRuns.length,
    candidateCount: selectedCandidates.length,
    candidateIds: selectedCandidates.map((row) => row.candidate_id),
    primaryAiRunIds,
    shadowAiRunIds: shadowRuns.map((row) => row.id),
    failures,
  };
}

export async function backfillOrbiterTeacherOutputs(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  limit?: number;
}): Promise<OrbiterTeacherBackfillSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("ORBITER_TEACHER_BACKFILL_LOOKBACK_HOURS", 168)),
  );
  const requestedLimit = Math.max(
    1,
    Math.trunc(args?.limit ?? envNumber("ORBITER_TEACHER_BACKFILL_LIMIT", 25)),
  );
  const cutoff = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: runs, error: runsError }, { data: teachers, error: teachersError }] =
    await Promise.all([
      client
        .from("ai_runs")
        .select(
          "id, created_at, task_type, provider, model, prompt_text, system_prompt, response_text, error_message, success, latency_ms, fallback_used, metadata",
        )
        .in("task_type", [...ORBITER_STUDENT_TASK_TYPES])
        .eq("success", true)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false }),
      client
        .from("teacher_outputs")
        .select("ai_run_id, source_ai_run_id, created_at")
        .in("task_type", [...ORBITER_STUDENT_TASK_TYPES])
        .gte("created_at", cutoff),
    ]);

  if (runsError) throw new Error(runsError.message);
  if (teachersError) throw new Error(teachersError.message);

  const runRows = (((runs ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
  const teacherRunIds = new Set(
    (((teachers ?? []) as unknown) as TeacherOutputRow[])
      .map(normalizeTeacherRunId)
      .filter((value): value is string => Boolean(value)),
  );

  const missingRuns = runRows
    .filter((row) => !teacherRunIds.has(row.id))
    .slice(0, requestedLimit);

  let inserted = 0;
  let skipped = 0;
  const failures: Array<{ aiRunId: string; reason: string }> = [];

  for (const run of missingRuns) {
    try {
      const result = await ensureTeacherOutputForStoredRun({
        aiRunId: run.id,
        taskType: run.task_type,
        promptText: run.prompt_text ?? "",
        systemPrompt: run.system_prompt ?? null,
        studentProvider: run.provider ?? "gemini",
        studentModel: run.model ?? null,
        studentResponse: run.response_text ?? null,
        studentLatencyMs: run.latency_ms ?? null,
        success: run.success,
        fallbackUsed: run.fallback_used,
        metadata: run.metadata,
        requireJson: true,
        jsonSchema: ORBITER_MEMORY_SUMMARY_JSON_SCHEMA,
        maxOutputTokens: 2048,
        client,
      });

      if (result.inserted) {
        inserted += 1;
      } else {
        skipped += 1;
        if (result.reason && result.reason !== "teacher_already_exists") {
          failures.push({ aiRunId: run.id, reason: result.reason });
        }
      }
    } catch (error) {
      failures.push({
        aiRunId: run.id,
        reason: error instanceof Error ? error.message : "teacher_backfill_failed",
      });
    }
  }

  return {
    lookbackHours,
    requestedLimit,
    scannedRuns: runRows.length,
    candidateRuns: missingRuns.length,
    missingRuns: runRows.filter((row) => !teacherRunIds.has(row.id)).length,
    inserted,
    skipped,
    failures,
  };
}

function toTrainingSampleRow(row: OrbiterTrainingDatasetRow): Record<string, unknown> {
  return {
    aiRunId: row.aiRunId,
    taskType: row.taskType,
    candidateId: row.candidateId,
    success: row.success,
    isShadow: row.isShadow,
    selectedRole: row.selectedRole,
    teacherPresent: Boolean(row.teacherOutput.response),
    evalTypes: row.evals.map((evalRow) => evalRow.evalType),
    hardNegativeKind: row.hardNegative.kind,
    summaryText: row.summary.summaryText,
  };
}

function toTeacherSampleRow(row: OrbiterTeacherDatasetRow): Record<string, unknown> {
  return {
    aiRunId: row.aiRunId,
    taskType: row.taskType,
    candidateId: row.candidateId,
    isShadow: row.isShadow,
    teacherPresent: Boolean(row.teacherResponse),
    teacherProvider: row.teacherProvider,
    evalTypes: row.evals.map((evalRow) => evalRow.evalType),
    summaryText: row.summaryText,
  };
}

async function insertSampleCheckRow(args: {
  client: SupabaseClient;
  artifactType: OrbiterTrainingArtifactType;
  artifactId: string | null;
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  status: "pass" | "warn" | "fail";
  issues: string[];
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await args.client
    .from("ai_artifact_sample_checks")
    .insert({
      track: "orbiter",
      artifact_type: args.artifactType,
      artifact_id: args.artifactId,
      row_count: args.rowCount,
      sample_count: args.sampleRows.length,
      status: args.status,
      issues: args.issues,
      sample_rows: args.sampleRows,
      metadata: args.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.warn(
      "[orbiter/studentOps] failed to insert artifact sample check:",
      error.message,
    );
    return null;
  }

  return data?.id ?? null;
}

export async function runOrbiterArtifactSampleChecks(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  sampleSize?: number;
  limit?: number;
}): Promise<OrbiterArtifactSampleCheckRun> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("ORBITER_ARTIFACT_LOOKBACK_HOURS", 168)),
  );
  const sampleSize = Math.max(
    1,
    Math.trunc(args?.sampleSize ?? envNumber("ORBITER_ARTIFACT_SAMPLE_SIZE", 3)),
  );
  const limit = Math.max(
    sampleSize,
    Math.trunc(args?.limit ?? envNumber("ORBITER_ARTIFACT_EXPORT_LIMIT", 200)),
  );
  const minRows = Math.max(
    1,
    Math.trunc(envNumber("ORBITER_ARTIFACT_MIN_ROWS", 5)),
  );

  const [trainingExport, teacherExport, trainingArtifact, teacherArtifact] =
    await Promise.all([
      exportOrbiterTrainingDataset({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...ORBITER_STUDENT_TASK_TYPES],
      }),
      exportOrbiterTeacherDataset({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...ORBITER_STUDENT_TASK_TYPES],
      }),
      generateTrainingArtifact({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...ORBITER_STUDENT_TASK_TYPES],
        artifactType: "orbiter_training_jsonl",
        notes: `orbiter sample check ${new Date().toISOString()}`,
      }),
      generateTrainingArtifact({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...ORBITER_STUDENT_TASK_TYPES],
        artifactType: "orbiter_teacher_jsonl",
        notes: `orbiter sample check ${new Date().toISOString()}`,
      }),
    ]);

  const trainingRows = [...trainingExport.rows].sort((left, right) =>
    left.createdAt < right.createdAt ? 1 : -1,
  );
  const teacherRows = [...teacherExport.rows].sort((left, right) =>
    left.createdAt < right.createdAt ? 1 : -1,
  );
  const trainingIssues: string[] = [];
  const teacherIssues: string[] = [];

  const trainingSampleRows = trainingRows
    .slice(0, sampleSize)
    .map(toTrainingSampleRow);
  const teacherSampleRows = teacherRows.slice(0, sampleSize).map(toTeacherSampleRow);

  if (trainingRows.length === 0) {
    trainingIssues.push("no_training_rows");
  }
  if (trainingRows.length > 0 && trainingRows.length < minRows) {
    trainingIssues.push("training_row_count_below_minimum");
  }
  if (
    trainingRows
      .slice(0, sampleSize)
      .some((row) => row.success && !row.teacherOutput.response)
  ) {
    trainingIssues.push("sample_training_rows_missing_teacher_output");
  }
  if (
    trainingRows
      .slice(0, sampleSize)
      .some((row) => row.success && !row.isShadow && !row.summary.summaryText)
  ) {
    trainingIssues.push("sample_training_rows_missing_summary");
  }
  if (!trainingRows.some((row) => row.isShadow)) {
    trainingIssues.push("no_shadow_rows_in_window");
  }
  if (!trainingArtifact.ok) {
    trainingIssues.push(`training_artifact:${trainingArtifact.error ?? "unknown_error"}`);
  }

  if (teacherRows.length === 0) {
    teacherIssues.push("no_teacher_rows");
  }
  if (teacherRows.length > 0 && teacherRows.length < minRows) {
    teacherIssues.push("teacher_row_count_below_minimum");
  }
  if (
    teacherRows.slice(0, sampleSize).some((row) =>
      !(row.teacherResponse ?? "").trim() || !row.promptText.trim(),
    )
  ) {
    teacherIssues.push("sample_teacher_rows_invalid");
  }
  if (!teacherArtifact.ok) {
    teacherIssues.push(`teacher_artifact:${teacherArtifact.error ?? "unknown_error"}`);
  }

  const trainingStatus: "pass" | "warn" | "fail" =
    trainingRows.length === 0 ||
    trainingIssues.includes("sample_training_rows_missing_summary")
      ? "fail"
      : trainingIssues.length > 0
        ? "warn"
        : "pass";
  const teacherStatus: "pass" | "warn" | "fail" =
    teacherRows.length === 0 ||
    teacherIssues.includes("sample_teacher_rows_invalid")
      ? "fail"
      : teacherIssues.length > 0
        ? "warn"
        : "pass";

  const [trainingCheckId, teacherCheckId] = await Promise.all([
    insertSampleCheckRow({
      client,
      artifactType: "orbiter_training_jsonl",
      artifactId: trainingArtifact.summary?.id ?? null,
      rowCount: trainingRows.length,
      sampleRows: trainingSampleRows,
      status: trainingStatus,
      issues: trainingIssues,
      metadata: {
        lookbackHours,
        totalRunsScanned: trainingExport.totalRunsScanned,
      },
    }),
    insertSampleCheckRow({
      client,
      artifactType: "orbiter_teacher_jsonl",
      artifactId: teacherArtifact.summary?.id ?? null,
      rowCount: teacherRows.length,
      sampleRows: teacherSampleRows,
      status: teacherStatus,
      issues: teacherIssues,
      metadata: {
        lookbackHours,
        totalRunsScanned: teacherExport.totalRunsScanned,
        artifactMode: envString("AI_TRAINING_ARTIFACT_STORE_MODE", "db"),
      },
    }),
  ]);

  return {
    lookbackHours,
    sampleSize,
    checks: [
      {
        id: trainingCheckId,
        artifactType: "orbiter_training_jsonl",
        artifactId: trainingArtifact.summary?.id ?? null,
        status: trainingStatus,
        rowCount: trainingRows.length,
        sampleCount: trainingSampleRows.length,
        issues: trainingIssues,
        sampleRows: trainingSampleRows,
      },
      {
        id: teacherCheckId,
        artifactType: "orbiter_teacher_jsonl",
        artifactId: teacherArtifact.summary?.id ?? null,
        status: teacherStatus,
        rowCount: teacherRows.length,
        sampleCount: teacherSampleRows.length,
        issues: teacherIssues,
        sampleRows: teacherSampleRows,
      },
    ],
  };
}

export async function listRecentOrbiterArtifactSampleChecks(args?: {
  client?: SupabaseClient | null;
  limit?: number;
}): Promise<OrbiterArtifactSampleCheckResult[]> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const limit = Math.max(1, Math.trunc(args?.limit ?? 10));
  const { data, error } = await client
    .from("ai_artifact_sample_checks")
    .select("id, artifact_type, artifact_id, row_count, sample_count, status, issues, sample_rows")
    .eq("track", "orbiter")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : null,
    artifactType:
      row.artifact_type === "orbiter_teacher_jsonl"
        ? "orbiter_teacher_jsonl"
        : "orbiter_training_jsonl",
    artifactId: typeof row.artifact_id === "string" ? row.artifact_id : null,
    status:
      row.status === "fail" || row.status === "warn" ? row.status : "pass",
    rowCount: Math.max(0, Math.trunc(toNumberOrNull(row.row_count) ?? 0)),
    sampleCount: Math.max(0, Math.trunc(toNumberOrNull(row.sample_count) ?? 0)),
    issues: Array.isArray(row.issues)
      ? row.issues
          .map((issue) => (typeof issue === "string" ? issue : ""))
          .filter(Boolean)
      : [],
    sampleRows: Array.isArray(row.sample_rows)
      ? row.sample_rows.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item),
        )
      : [],
  }));
}
