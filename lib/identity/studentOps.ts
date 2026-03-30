import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredOutput } from "@/lib/ai/types";
import { ensureTeacherOutputForStoredRun } from "@/lib/ai/eval";
import { generateTrainingArtifact } from "@/lib/ai/trainingArtifacts";
import { getAIServiceClient } from "@/lib/ai/db";
import { normalizeStickyMode, selectModelSelectionFromEntries } from "@/lib/ai/modelSelection";
import {
  getEntryTrafficRole,
  isTaskTypeIncluded,
  listModelRegistryEntries,
  type ModelRegistryEntry,
} from "@/lib/ai/modelRegistry";
import {
  exportIdentityTeacherDataset,
  exportIdentityTrainingDataset,
  type IdentityTeacherDatasetRow,
  type IdentityTrainingDatasetRow,
} from "./exportDataset";
import {
  IDENTITY_PROFILE_JSON_SCHEMA,
  parseIdentityProfile,
  refreshIdentityProfile,
} from "./profileUpdate";
import { evaluateIdentityShadow } from "./shadowRun";
import { IDENTITY_STUDENT_MODEL_KEY } from "./studentModelRegistry";
import {
  IDENTITY_STUDENT_TASK_TYPES,
  type IdentityTrainingArtifactType,
} from "./studentTrack";

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envString(name: string, fallback: string): string {
  const raw = (process.env[name] ?? "").trim();
  return raw || fallback;
}

function parseTaskTypeAllowlist(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
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

function normalizeTeacherRunId(row: TeacherOutputRow): string | null {
  return row.ai_run_id ?? row.source_ai_run_id ?? null;
}

type AIRunRow = {
  id: string;
  created_at: string;
  user_id: string | null;
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
  structured_json: Record<string, unknown> | unknown[] | null;
};

type TeacherOutputRow = {
  ai_run_id: string | null;
  source_ai_run_id: string | null;
  created_at: string;
};

type EvalRow = {
  id?: string | null;
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

type SnapshotLinkRow = {
  ai_run_id: string | null;
};

type WarmupShadowRunRow = {
  id: string;
  user_id: string | null;
  created_at: string;
  success: boolean;
  metadata: Record<string, unknown> | null;
};

export type IdentityFacetMetric = {
  value: string;
  count: number;
  lastSeenAt: string | null;
};

export type IdentityPrimaryMalformedBreakdown = {
  total: number;
  byProvider: IdentityFacetMetric[];
  byModel: IdentityFacetMetric[];
  byPromptVariant: IdentityFacetMetric[];
  bySchemaVariant: IdentityFacetMetric[];
  byPromptLengthBucket: IdentityFacetMetric[];
  bySourceDensityBucket: IdentityFacetMetric[];
};

export type IdentityShadowHealthSummary = {
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
  requestHealth: IdentityPrimaryRequestHealth;
  currentPipelineHealth: IdentityCurrentPipelineHealth;
  currentShadowPipelineHealth: IdentityCurrentShadowPipelineHealth;
  primaryMalformedBreakdown: IdentityPrimaryMalformedBreakdown;
  failureBreakdown: Array<{
    kind:
      | "malformed_profile_json"
      | "provider_timeout"
      | "provider_failure"
      | "missing_snapshot_row"
      | "shadow_eval_failed";
    count: number;
    lastSeenAt: string | null;
  }>;
  dailyTrend: Array<{
    bucket: string;
    primaryRuns: number;
    primarySuccesses: number;
    shadowRuns: number;
    shadowSuccesses: number;
    teacherCoverageRate: number | null;
    shadowEvalPassRate: number | null;
  }>;
};

export type IdentityPrimaryRequestHealth = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  avgAttemptsPerRequest: number | null;
  malformedRequestCount: number;
  providerFailureRequestCount: number;
  missingSnapshotRequestCount: number;
  teacherCoverageRate: number | null;
  outcomeBreakdown: IdentityFacetMetric[];
};

export type IdentityCurrentPipelineHealth = {
  runCount: number;
  successCount: number;
  successRate: number | null;
  malformedCount: number;
  providerFailureCount: number;
  missingSnapshotCount: number;
  legacyExcludedRunCount: number;
  promptVariantBreakdown: IdentityFacetMetric[];
  schemaVariantBreakdown: IdentityFacetMetric[];
  routeStrategyBreakdown: IdentityFacetMetric[];
  requestHealth: IdentityPrimaryRequestHealth;
};

export type IdentityCurrentShadowPipelineHealth = {
  runCount: number;
  successCount: number;
  successRate: number | null;
  successfulTeacherCoverageRate: number | null;
  successfulEvalCoverageRate: number | null;
  evalAvgScore: number | null;
  evalPassRate: number | null;
  malformedCount: number;
  providerFailureCount: number;
  evalFailureCount: number;
  legacyExcludedRunCount: number;
  promptVariantBreakdown: IdentityFacetMetric[];
  schemaVariantBreakdown: IdentityFacetMetric[];
  routeStrategyBreakdown: IdentityFacetMetric[];
  sourceDensityBreakdown: IdentityFacetMetric[];
  evalFailurePromptVariantBreakdown: IdentityFacetMetric[];
};

export type IdentityShadowWarmupSummary = {
  lookbackHours: number;
  requestedActions: number;
  plannedActions: number;
  attemptedActions: number;
  completedActions: number;
  primaryRunsCreated: number;
  shadowRunsCreated: number;
  targetCurrentShadowRuns: number;
  baselineCurrentShadowRuns: number;
  remainingCurrentShadowRuns: number;
  userCount: number;
  userIds: string[];
  primaryAiRunIds: string[];
  shadowAiRunIds: string[];
  failures: Array<{
    userId: string;
    reason: string;
  }>;
};

export type IdentityTeacherBackfillSummary = {
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

export type IdentityShadowEvalBackfillSummary = {
  lookbackHours: number;
  requestedLimit: number;
  scannedShadowRuns: number;
  candidateRuns: number;
  inserted: number;
  updated: number;
  skipped: number;
  failures: Array<{
    shadowAiRunId: string;
    reason: string;
  }>;
};

export type IdentityArtifactSampleCheckResult = {
  id: string | null;
  artifactType: IdentityTrainingArtifactType;
  artifactId: string | null;
  status: "pass" | "warn" | "fail";
  rowCount: number;
  sampleCount: number;
  issues: string[];
  sampleRows: Record<string, unknown>[];
};

export type IdentityArtifactSampleCheckRun = {
  lookbackHours: number;
  sampleSize: number;
  checks: IdentityArtifactSampleCheckResult[];
};

export type IdentityShadowPromotionThresholds = {
  minCurrentShadowRuns: number;
  minCurrentShadowSuccessRate: number;
  minCurrentShadowEvalAvgScore: number;
  minCurrentShadowEvalPassRate: number;
  minCurrentShadowTeacherCoverageRate: number;
  minCurrentShadowEvalCoverageRate: number;
  minCurrentPrimaryRequestSuccessRate: number;
  minLatestTrainingRows: number;
  minLatestTeacherRows: number;
  maxArtifactAgeHours: number;
  challengerTrafficWeight: number;
};

export type IdentityReadinessCheckProgress = {
  name: string;
  currentlyPassed: boolean;
  actual: number | null;
  required: number;
  remainingToPass: number | null;
  unit: "runs" | "rate" | "rows" | "hours";
};

export type IdentityShadowPromotionReview = {
  eligible: boolean;
  reason: string;
  candidate: {
    modelKey: string;
    modelVersion: string;
    provider: string;
    providerModel: string | null;
    trafficRole: string | null;
  };
  thresholds: IdentityShadowPromotionThresholds;
  health: IdentityShadowHealthSummary;
  latestArtifacts: {
    training: {
      id: string | null;
      createdAt: string | null;
      ageHours: number | null;
      rowCount: number;
      status: string | null;
    };
    teacher: {
      id: string | null;
      createdAt: string | null;
      ageHours: number | null;
      rowCount: number;
      status: string | null;
    };
  };
  checks: Array<{
    name: string;
    passed: boolean;
    actual: number | null;
    required: number;
  }>;
  readinessProgress: {
    passedCount: number;
    totalCount: number;
    checks: IdentityReadinessCheckProgress[];
    nextChecks: IdentityReadinessCheckProgress[];
  };
  rolloutPlan: {
    targetTrafficRole: "challenger";
    targetTrafficWeight: number;
  };
};

export type IdentityRolloutRegistryRow = {
  id: string;
  modelKey: string;
  modelVersion: string;
  provider: string;
  providerModel: string | null;
  trafficRole: string | null;
  trafficWeight: number | null;
  promotionStatus: string | null;
  isActive: boolean;
  taskTypes: string[] | null;
  scope: "task_specific" | "global";
};

export type IdentityRolloutSelectionPreview = {
  sampleSize: number;
  stickyMode: "user" | "session" | "prompt";
  defaultChallengerPercent: number;
  selectedRoleCounts: Array<{
    role: string;
    count: number;
  }>;
  reasonCounts: IdentityFacetMetric[];
  sampleRows: Array<{
    userId: string;
    selectedRole: string | null;
    selectedModelKey: string | null;
    selectedModelVersion: string | null;
    reason: string;
    rolloutBucket: number | null;
    challengerPercent: number | null;
  }>;
};

export type IdentityRecentRolloutSelection = {
  lookbackHours: number;
  runCount: number;
  selectedRoleCounts: Array<{
    role: string;
    count: number;
  }>;
  reasonCounts: IdentityFacetMetric[];
  latestRunAt: string | null;
};

export type IdentityRolloutState = {
  rolloutEnabled: boolean;
  globalRolloutEnabled: boolean;
  taskScopedEnabled: boolean;
  stickyMode: "user" | "session" | "prompt";
  defaultChallengerPercent: number;
  registryOk: boolean;
  registryError: string | null;
  matchingRegistryRows: IdentityRolloutRegistryRow[];
  selectionPreview: IdentityRolloutSelectionPreview | null;
  recentSelection: IdentityRecentRolloutSelection | null;
};

async function loadLatestArtifact(args: {
  client: SupabaseClient;
  artifactType: IdentityTrainingArtifactType;
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

function computeArtifactAgeHours(createdAt: string | null): number | null {
  if (!createdAt) return null;
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / (60 * 60 * 1000);
}

function readinessCheckUnit(name: string): "runs" | "rate" | "rows" | "hours" {
  if (name.includes("_runs")) return "runs";
  if (name.includes("_rows")) return "rows";
  if (name.includes("_age_hours")) return "hours";
  return "rate";
}

function readinessRemainingToPass(args: {
  name: string;
  actual: number | null;
  required: number;
}): number | null {
  if (args.actual == null) return args.required;
  if (args.name.startsWith("max_")) {
    return Math.max(0, args.actual - args.required);
  }
  return Math.max(0, args.required - args.actual);
}

function getDefaultIdentityShadowPromotionThresholds(): IdentityShadowPromotionThresholds {
  return {
    minCurrentShadowRuns: Math.max(
      1,
      Math.trunc(envNumber("IDENTITY_PROMOTION_MIN_CURRENT_SHADOW_RUNS", 12)),
    ),
    minCurrentShadowSuccessRate: envNumber(
      "IDENTITY_PROMOTION_MIN_CURRENT_SHADOW_SUCCESS_RATE",
      0.85,
    ),
    minCurrentShadowEvalAvgScore: envNumber(
      "IDENTITY_PROMOTION_MIN_CURRENT_SHADOW_EVAL_AVG_SCORE",
      0.85,
    ),
    minCurrentShadowEvalPassRate: envNumber(
      "IDENTITY_PROMOTION_MIN_CURRENT_SHADOW_EVAL_PASS_RATE",
      0.9,
    ),
    minCurrentShadowTeacherCoverageRate: envNumber(
      "IDENTITY_PROMOTION_MIN_CURRENT_SHADOW_TEACHER_COVERAGE_RATE",
      0.95,
    ),
    minCurrentShadowEvalCoverageRate: envNumber(
      "IDENTITY_PROMOTION_MIN_CURRENT_SHADOW_EVAL_COVERAGE_RATE",
      0.95,
    ),
    minCurrentPrimaryRequestSuccessRate: envNumber(
      "IDENTITY_PROMOTION_MIN_CURRENT_PRIMARY_REQUEST_SUCCESS_RATE",
      0.95,
    ),
    minLatestTrainingRows: Math.max(
      1,
      Math.trunc(envNumber("IDENTITY_PROMOTION_MIN_TRAINING_ROWS", 50)),
    ),
    minLatestTeacherRows: Math.max(
      1,
      Math.trunc(envNumber("IDENTITY_PROMOTION_MIN_TEACHER_ROWS", 30)),
    ),
    maxArtifactAgeHours: envNumber(
      "IDENTITY_PROMOTION_MAX_ARTIFACT_AGE_HOURS",
      72,
    ),
    challengerTrafficWeight: Math.max(
      1,
      Math.min(
        100,
        Math.trunc(envNumber("IDENTITY_CHALLENGER_TRAFFIC_WEIGHT", 5)),
      ),
    ),
  };
}

function getMonitorTimezone(): string {
  return (process.env.IDENTITY_MONITOR_TIMEZONE ?? "Asia/Tokyo").trim() || "Asia/Tokyo";
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

function inferRunFailureKind(args: {
  run: AIRunRow;
  hasSnapshot: boolean;
  shadowEvalPassed: boolean | null;
  hasValidProfile: boolean;
}):
  | "malformed_profile_json"
  | "provider_timeout"
  | "provider_failure"
  | "missing_snapshot_row"
  | "shadow_eval_failed"
  | null {
  const metadata = asObjectOrNull(args.run.metadata);
  const isShadow = metadata?.shadowPass === true;
  const shouldPersistSnapshot = metadata?.persistSnapshot !== false && !isShadow;
  const message = (args.run.error_message ?? "").toLowerCase();

  if (!args.run.success) {
    if (
      message.includes("invalid_shadow_profile_payload") ||
      message.includes("invalid_identity_profile_payload") ||
      message.includes("malformed")
    ) {
      return "malformed_profile_json";
    }
    if (message.includes("timeout")) {
      return "provider_timeout";
    }
    return "provider_failure";
  }

  if (!args.hasValidProfile) {
    return "malformed_profile_json";
  }

  if (!isShadow && shouldPersistSnapshot && !args.hasSnapshot) {
    return "missing_snapshot_row";
  }

  if (isShadow && args.shadowEvalPassed === false) {
    return "shadow_eval_failed";
  }

  return null;
}

function summarizeFacet<T>(
  items: T[],
  pickValue: (item: T) => string | null,
  pickTimestamp: (item: T) => string,
): IdentityFacetMetric[] {
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

function getIdentityPromptVariant(row: AIRunRow): string {
  const explicit = toTextOrNull(row.metadata?.profilePromptVariant);
  if (explicit) return explicit;
  const attempt = toTextOrNull(row.metadata?.profileAttempt);
  switch (attempt) {
    case "strict":
      return "identity_base_prompt";
    case "strict_retry":
      return "identity_strict_retry";
    case "raw_fallback":
      return "identity_raw_fallback";
    default:
      return "unknown";
  }
}

function getIdentityShadowPromptVariant(row: AIRunRow): string {
  const explicit = toTextOrNull(row.metadata?.shadowPromptVariant);
  if (explicit) return explicit;
  const shadowAttemptMode = toTextOrNull(row.metadata?.shadowAttemptMode);
  switch (shadowAttemptMode) {
    case "strict":
      return "shadow_strict";
    case "strict_retry":
      return "shadow_strict_retry";
    case "raw_fallback":
      return "shadow_raw_fallback";
    default:
      return getIdentityPromptVariant(row);
  }
}

function getIdentitySchemaVariant(row: AIRunRow): string {
  const explicit = toTextOrNull(row.metadata?.profileSchemaVariant);
  if (explicit) return explicit;
  const promptVariant = getIdentityPromptVariant(row);
  if (promptVariant.includes("raw_fallback")) {
    return "identity_raw_json_recovery";
  }
  return "identity_profile_schema";
}

function getIdentityShadowSchemaVariant(row: AIRunRow): string {
  const explicit = toTextOrNull(row.metadata?.shadowSchemaVariant);
  if (explicit) return explicit;
  return getIdentitySchemaVariant(row);
}

function getPromptLengthBucket(row: AIRunRow): string {
  const length = (row.prompt_text ?? "").length;
  if (length <= 1500) return "short";
  if (length <= 3000) return "medium";
  if (length <= 5000) return "long";
  return "very_long";
}

function getIdentityShadowRouteStrategy(row: AIRunRow): string {
  return (
    toTextOrNull(row.metadata?.shadowRouteStrategy) ??
    toTextOrNull(row.metadata?.profileRouteStrategy) ??
    "unknown"
  );
}

function getSourceDensityBucket(row: AIRunRow): string {
  const sourceCounts = asObjectOrNull(row.metadata?.sourceCounts);
  if (!sourceCounts) return "unknown";
  const total =
    (toNumberOrNull(sourceCounts.stargazerAxisSignals) ?? 0) +
    (toNumberOrNull(sourceCounts.stargazerDailyStates) ?? 0) +
    (toNumberOrNull(sourceCounts.stargazerObservations) ?? 0) +
    (toNumberOrNull(sourceCounts.orbiterMemorySummaries) ?? 0) +
    (toNumberOrNull(sourceCounts.recommendationRatings) ?? 0) +
    (toNumberOrNull(sourceCounts.recommendationActions) ?? 0) +
    (toNumberOrNull(sourceCounts.rendezvousStateRows) ?? 0);
  if (total <= 3) return "very_low";
  if (total <= 10) return "low";
  if (total <= 20) return "medium";
  if (total <= 40) return "high";
  return "very_high";
}

function isTaskSpecificRegistryRow(entry: ModelRegistryEntry, taskType: string): boolean {
  return Array.isArray(entry.taskTypes) && entry.taskTypes.includes(taskType);
}

function normalizeSelectedRole(value: unknown): string {
  const normalized = toTextOrNull(value);
  return normalized ?? "unselected";
}

function mapIdentityRolloutRegistryRow(entry: ModelRegistryEntry): IdentityRolloutRegistryRow {
  return {
    id: entry.id,
    modelKey: entry.modelKey,
    modelVersion: entry.modelVersion,
    provider: entry.provider,
    providerModel: entry.providerModel,
    trafficRole: entry.trafficRole,
    trafficWeight: entry.trafficWeight,
    promotionStatus: entry.promotionStatus,
    isActive: entry.isActive,
    taskTypes: entry.taskTypes,
    scope: isTaskSpecificRegistryRow(entry, IDENTITY_STUDENT_TASK_TYPES[0])
      ? "task_specific"
      : "global",
  };
}

function buildIdentityRolloutSelectionPreview(args: {
  rows: ModelRegistryEntry[];
  sampleSize: number;
}): IdentityRolloutSelectionPreview {
  const stickyMode = normalizeStickyMode(
    envString("AI_MODEL_ROLLOUT_STICKY_MODE", "user"),
  );
  const defaultChallengerPercent = Math.max(
    0,
    Math.min(
      100,
      Math.trunc(envNumber("AI_MODEL_ROLLOUT_DEFAULT_CHALLENGER_PERCENT", 0)),
    ),
  );

  const previewRows = Array.from({ length: args.sampleSize }, (_, index) => {
    const userId = `identity-rollout-preview-${index + 1}-${(index * 7919) % 104729}`;
    const decision = selectModelSelectionFromEntries({
      rows: args.rows,
      params: {
        taskType: IDENTITY_STUDENT_TASK_TYPES[0],
        prompt: "identity rollout preview",
        userId,
        allowFallback: true,
      },
      stickyMode,
      defaultChallengerPercent,
    });

    return {
      userId,
      selectedRole: decision.selectedRole,
      selectedModelKey: decision.selectedModelKey,
      selectedModelVersion: decision.selectedModelVersion,
      reason: decision.reason,
      rolloutBucket: decision.rolloutBucket ?? null,
      challengerPercent: decision.challengerPercent ?? null,
    };
  });

  const roleCounts = new Map<string, number>();
  for (const row of previewRows) {
    const role = normalizeSelectedRole(row.selectedRole);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  return {
    sampleSize: args.sampleSize,
    stickyMode,
    defaultChallengerPercent,
    selectedRoleCounts: Array.from(roleCounts.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        return left.role.localeCompare(right.role);
      }),
    reasonCounts: summarizeFacet(
      previewRows,
      (row) => row.reason,
      () => new Date(0).toISOString(),
    ),
    sampleRows: previewRows.slice(0, 12),
  };
}

type IdentityPrimaryRequestSummary = {
  requestId: string;
  startedAt: string;
  completedAt: string;
  attemptCount: number;
  success: boolean;
  malformedAttemptCount: number;
  providerFailureAttemptCount: number;
  missingSnapshotAttemptCount: number;
  outcome: string;
  teacherCovered: boolean;
};

function inferIdentityRequestOutcome(args: {
  successRun: AIRunRow | null;
  malformedAttemptCount: number;
  providerFailureAttemptCount: number;
  missingSnapshotAttemptCount: number;
}): string {
  if (args.successRun) {
    switch (toTextOrNull(args.successRun.metadata?.profileAttempt)) {
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
  if (args.missingSnapshotAttemptCount > 0) {
    return "failed_after_missing_snapshot";
  }
  if (args.providerFailureAttemptCount > 0 && args.malformedAttemptCount > 0) {
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

function buildIdentityPrimaryRequestSummaries(args: {
  primaryRuns: AIRunRow[];
  validPrimaryRunIds: Set<string>;
  snapshotRunIds: Set<string>;
  teacherRunIds: Set<string>;
}): IdentityPrimaryRequestSummary[] {
  const requestMap = new Map<string, AIRunRow[]>();
  for (const row of args.primaryRuns) {
    const requestId = getRequestId(row);
    const current = requestMap.get(requestId) ?? [];
    current.push(row);
    requestMap.set(requestId, current);
  }

  return Array.from(requestMap.entries())
    .map(([requestId, rows]) => {
      const attempts = [...rows].sort((left, right) =>
        left.created_at.localeCompare(right.created_at),
      );
      const successRun =
        attempts.find((row) => {
          const metadata = asObjectOrNull(row.metadata);
          const shouldPersistSnapshot =
            metadata?.persistSnapshot !== false && metadata?.shadowPass !== true;
          const valid = args.validPrimaryRunIds.has(row.id);
          return valid && (!shouldPersistSnapshot || args.snapshotRunIds.has(row.id));
        }) ?? null;
      const malformedAttemptCount = attempts.filter((row) =>
        inferRunFailureKind({
          run: row,
          hasSnapshot: args.snapshotRunIds.has(row.id),
          shadowEvalPassed: null,
          hasValidProfile: args.validPrimaryRunIds.has(row.id),
        }) === "malformed_profile_json",
      ).length;
      const providerFailureAttemptCount = attempts.filter((row) =>
        inferRunFailureKind({
          run: row,
          hasSnapshot: args.snapshotRunIds.has(row.id),
          shadowEvalPassed: null,
          hasValidProfile: args.validPrimaryRunIds.has(row.id),
        }) === "provider_failure",
      ).length;
      const missingSnapshotAttemptCount = attempts.filter((row) =>
        inferRunFailureKind({
          run: row,
          hasSnapshot: args.snapshotRunIds.has(row.id),
          shadowEvalPassed: null,
          hasValidProfile: args.validPrimaryRunIds.has(row.id),
        }) === "missing_snapshot_row",
      ).length;

      return {
        requestId,
        startedAt: attempts[0]?.created_at ?? "",
        completedAt: attempts[attempts.length - 1]?.created_at ?? "",
        attemptCount: attempts.length,
        success: Boolean(successRun),
        malformedAttemptCount,
        providerFailureAttemptCount,
        missingSnapshotAttemptCount,
        outcome: inferIdentityRequestOutcome({
          successRun,
          malformedAttemptCount,
          providerFailureAttemptCount,
          missingSnapshotAttemptCount,
        }),
        teacherCovered: successRun ? args.teacherRunIds.has(successRun.id) : false,
      };
    })
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function summarizeIdentityPrimaryMalformedBreakdown(
  malformedRuns: AIRunRow[],
): IdentityPrimaryMalformedBreakdown {
  return {
    total: malformedRuns.length,
    byProvider: summarizeFacet(
      malformedRuns,
      (row) => toTextOrNull(row.provider),
      (row) => row.created_at,
    ),
    byModel: summarizeFacet(
      malformedRuns,
      (row) => toTextOrNull(row.model),
      (row) => row.created_at,
    ),
    byPromptVariant: summarizeFacet(
      malformedRuns,
      (row) => getIdentityPromptVariant(row),
      (row) => row.created_at,
    ),
    bySchemaVariant: summarizeFacet(
      malformedRuns,
      (row) => getIdentitySchemaVariant(row),
      (row) => row.created_at,
    ),
    byPromptLengthBucket: summarizeFacet(
      malformedRuns,
      (row) => getPromptLengthBucket(row),
      (row) => row.created_at,
    ),
    bySourceDensityBucket: summarizeFacet(
      malformedRuns,
      (row) => getSourceDensityBucket(row),
      (row) => row.created_at,
    ),
  };
}

function hasValidIdentityProfileRun(row: AIRunRow): boolean {
  if (!row.success) return false;
  return (
    parseIdentityProfile({
      structured: row.structured_json,
      text: row.response_text ?? "",
    }) != null
  );
}

function getRequestId(row: AIRunRow): string {
  const metadata = asObjectOrNull(row.metadata);
  return typeof metadata?.profileRequestId === "string" ? metadata.profileRequestId : row.id;
}

function isCurrentIdentityPipelineRun(row: AIRunRow): boolean {
  const metadata = asObjectOrNull(row.metadata);
  const routeStrategy = toTextOrNull(metadata?.profileRouteStrategy);
  const promptVariant = getIdentityPromptVariant(row);

  if (
    routeStrategy === "standard_json_mode" ||
    routeStrategy === "low_density_template_first"
  ) {
    return true;
  }

  return [
    "identity_base_prompt_v2",
    "identity_strict_retry_v2",
    "identity_raw_fallback_v2",
    "identity_low_density_template_raw_v2",
    "identity_low_density_template_retry_v1",
    "identity_low_density_final_raw_v1",
  ].includes(promptVariant);
}

function isCurrentIdentityShadowPipelineRun(row: AIRunRow): boolean {
  const metadata = asObjectOrNull(row.metadata);
  const routeStrategy = getIdentityShadowRouteStrategy(row);
  const promptVariant = getIdentityShadowPromptVariant(row);

  if (
    routeStrategy === "shadow_low_density_template_first" ||
    routeStrategy === "shadow_standard_json_mode"
  ) {
    return true;
  }

  return [
    "identity_shadow_low_density_template_raw_v1",
    "identity_shadow_low_density_template_retry_v1",
    "identity_shadow_low_density_final_raw_v1",
    "identity_shadow_strict_v1",
    "identity_shadow_strict_retry_v1",
    "identity_shadow_raw_fallback_v1",
  ].includes(promptVariant);
}

function isRetryableTeacherBackfillReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("503") ||
    normalized.includes("unavailable") ||
    normalized.includes("timeout") ||
    normalized.includes("rate limit")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeIdentityRequestHealth(
  requestSummaries: IdentityPrimaryRequestSummary[],
): IdentityPrimaryRequestHealth {
  const successCount = requestSummaries.filter((row) => row.success).length;

  return {
    requestCount: requestSummaries.length,
    successCount,
    failureCount: Math.max(0, requestSummaries.length - successCount),
    successRate:
      requestSummaries.length > 0 ? successCount / requestSummaries.length : null,
    avgAttemptsPerRequest: average(requestSummaries.map((row) => row.attemptCount)),
    malformedRequestCount: requestSummaries.filter(
      (row) => !row.success && row.malformedAttemptCount > 0,
    ).length,
    providerFailureRequestCount: requestSummaries.filter(
      (row) => !row.success && row.providerFailureAttemptCount > 0,
    ).length,
    missingSnapshotRequestCount: requestSummaries.filter(
      (row) => !row.success && row.missingSnapshotAttemptCount > 0,
    ).length,
    teacherCoverageRate:
      successCount > 0
        ? requestSummaries.filter((row) => row.success && row.teacherCovered).length /
          successCount
        : null,
    outcomeBreakdown: summarizeFacet(
      requestSummaries,
      (row) => row.outcome,
      (row) => row.completedAt,
    ),
  };
}

function summarizeCurrentIdentityPipelineHealth(args: {
  primaryRuns: AIRunRow[];
  validPrimaryRunIds: Set<string>;
  snapshotRunIds: Set<string>;
  teacherRunIds: Set<string>;
}): IdentityCurrentPipelineHealth {
  const currentPipelineRuns = args.primaryRuns.filter((row) =>
    isCurrentIdentityPipelineRun(row),
  );
  const currentRequestSummaries = buildIdentityPrimaryRequestSummaries({
    primaryRuns: currentPipelineRuns,
    validPrimaryRunIds: args.validPrimaryRunIds,
    snapshotRunIds: args.snapshotRunIds,
    teacherRunIds: args.teacherRunIds,
  });
  const currentRequestHealth = summarizeIdentityRequestHealth(currentRequestSummaries);
  const malformedCount = currentPipelineRuns.filter(
    (row) =>
      inferRunFailureKind({
        run: row,
        hasSnapshot: args.snapshotRunIds.has(row.id),
        shadowEvalPassed: null,
        hasValidProfile: args.validPrimaryRunIds.has(row.id),
      }) === "malformed_profile_json",
  ).length;
  const providerFailureCount = currentPipelineRuns.filter(
    (row) =>
      inferRunFailureKind({
        run: row,
        hasSnapshot: args.snapshotRunIds.has(row.id),
        shadowEvalPassed: null,
        hasValidProfile: args.validPrimaryRunIds.has(row.id),
      }) === "provider_failure",
  ).length;
  const missingSnapshotCount = currentPipelineRuns.filter(
    (row) =>
      inferRunFailureKind({
        run: row,
        hasSnapshot: args.snapshotRunIds.has(row.id),
        shadowEvalPassed: null,
        hasValidProfile: args.validPrimaryRunIds.has(row.id),
      }) === "missing_snapshot_row",
  ).length;
  const successCount = currentPipelineRuns.filter((row) =>
    args.validPrimaryRunIds.has(row.id) &&
    (row.metadata?.persistSnapshot === false || args.snapshotRunIds.has(row.id)),
  ).length;

  return {
    runCount: currentPipelineRuns.length,
    successCount,
    successRate:
      currentPipelineRuns.length > 0 ? successCount / currentPipelineRuns.length : null,
    malformedCount,
    providerFailureCount,
    missingSnapshotCount,
    legacyExcludedRunCount: Math.max(0, args.primaryRuns.length - currentPipelineRuns.length),
    promptVariantBreakdown: summarizeFacet(
      currentPipelineRuns,
      (row) => getIdentityPromptVariant(row),
      (row) => row.created_at,
    ),
    schemaVariantBreakdown: summarizeFacet(
      currentPipelineRuns,
      (row) => getIdentitySchemaVariant(row),
      (row) => row.created_at,
    ),
    routeStrategyBreakdown: summarizeFacet(
      currentPipelineRuns,
      (row) => toTextOrNull(row.metadata?.profileRouteStrategy),
      (row) => row.created_at,
    ),
    requestHealth: currentRequestHealth,
  };
}

function summarizeCurrentIdentityShadowPipelineHealth(args: {
  shadowRuns: AIRunRow[];
  teacherRunIds: Set<string>;
  evalByRunId: Map<string, EvalRow>;
}): IdentityCurrentShadowPipelineHealth {
  const currentShadowRuns = args.shadowRuns.filter((row) =>
    isCurrentIdentityShadowPipelineRun(row),
  );
  const successfulShadowRuns = currentShadowRuns.filter((row) => row.success);
  const successfulEvalRows = successfulShadowRuns
    .map((row) => args.evalByRunId.get(row.id) ?? null)
    .filter((row): row is EvalRow => Boolean(row));
  const evalFailedRuns = successfulShadowRuns.filter((row) => {
    const evalRow = args.evalByRunId.get(row.id);
    return Boolean(evalRow) && evalRow?.passed === false;
  });
  const malformedCount = currentShadowRuns.filter(
    (row) =>
      inferRunFailureKind({
        run: row,
        hasSnapshot: false,
        shadowEvalPassed: args.evalByRunId.get(row.id)?.passed ?? null,
        hasValidProfile: row.success,
      }) === "malformed_profile_json",
  ).length;
  const providerFailureCount = currentShadowRuns.filter(
    (row) =>
      inferRunFailureKind({
        run: row,
        hasSnapshot: false,
        shadowEvalPassed: args.evalByRunId.get(row.id)?.passed ?? null,
        hasValidProfile: row.success,
      }) === "provider_failure",
  ).length;

  return {
    runCount: currentShadowRuns.length,
    successCount: successfulShadowRuns.length,
    successRate:
      currentShadowRuns.length > 0
        ? successfulShadowRuns.length / currentShadowRuns.length
        : null,
    successfulTeacherCoverageRate:
      successfulShadowRuns.length > 0
        ? successfulShadowRuns.filter((row) => args.teacherRunIds.has(row.id)).length /
          successfulShadowRuns.length
        : null,
    successfulEvalCoverageRate:
      successfulShadowRuns.length > 0
        ? successfulEvalRows.length / successfulShadowRuns.length
        : null,
    evalAvgScore: average(successfulEvalRows.map((row) => row.score)),
    evalPassRate:
      successfulEvalRows.length > 0
        ? successfulEvalRows.filter((row) => row.passed).length / successfulEvalRows.length
        : null,
    malformedCount,
    providerFailureCount,
    evalFailureCount: evalFailedRuns.length,
    legacyExcludedRunCount: Math.max(0, args.shadowRuns.length - currentShadowRuns.length),
    promptVariantBreakdown: summarizeFacet(
      currentShadowRuns,
      (row) => getIdentityShadowPromptVariant(row),
      (row) => row.created_at,
    ),
    schemaVariantBreakdown: summarizeFacet(
      currentShadowRuns,
      (row) => getIdentityShadowSchemaVariant(row),
      (row) => row.created_at,
    ),
    routeStrategyBreakdown: summarizeFacet(
      currentShadowRuns,
      (row) => getIdentityShadowRouteStrategy(row),
      (row) => row.created_at,
    ),
    sourceDensityBreakdown: summarizeFacet(
      currentShadowRuns,
      (row) => getSourceDensityBucket(row),
      (row) => row.created_at,
    ),
    evalFailurePromptVariantBreakdown: summarizeFacet(
      evalFailedRuns,
      (row) => getIdentityShadowPromptVariant(row),
      (row) => row.created_at,
    ),
  };
}

type IdentityWarmupCandidate = {
  userId: string;
  latestAt: string;
  currentShadowRunCount: number;
};

function buildIdentityWarmupPlan(args: {
  candidates: IdentityWarmupCandidate[];
  requestedActions: number;
  targetCurrentShadowRuns: number;
  baselineCurrentShadowRuns: number;
}): {
  plannedUsers: string[];
  plannedActions: number;
  remainingCurrentShadowRuns: number;
} {
  if (args.requestedActions <= 0 || args.candidates.length === 0) {
    return {
      plannedUsers: [],
      plannedActions: 0,
      remainingCurrentShadowRuns: Math.max(
        0,
        args.targetCurrentShadowRuns - args.baselineCurrentShadowRuns,
      ),
    };
  }

  const growthNeed =
    args.targetCurrentShadowRuns > 0
      ? Math.max(0, args.targetCurrentShadowRuns - args.baselineCurrentShadowRuns)
      : args.requestedActions;
  const plannedActions = Math.min(
    args.requestedActions,
    args.targetCurrentShadowRuns > 0 ? growthNeed : args.requestedActions,
  );

  if (plannedActions <= 0) {
    return {
      plannedUsers: [],
      plannedActions: 0,
      remainingCurrentShadowRuns: Math.max(
        0,
        args.targetCurrentShadowRuns - args.baselineCurrentShadowRuns,
      ),
    };
  }

  const mutableCandidates = args.candidates.map((candidate) => ({ ...candidate }));
  const plannedUsers: string[] = [];

  for (let index = 0; index < plannedActions; index += 1) {
    mutableCandidates.sort((left, right) => {
      if (left.currentShadowRunCount !== right.currentShadowRunCount) {
        return left.currentShadowRunCount - right.currentShadowRunCount;
      }
      return right.latestAt.localeCompare(left.latestAt);
    });
    const chosen = mutableCandidates[0];
    plannedUsers.push(chosen.userId);
    chosen.currentShadowRunCount += 1;
  }

  return {
    plannedUsers,
    plannedActions,
    remainingCurrentShadowRuns: Math.max(
      0,
      args.targetCurrentShadowRuns - (args.baselineCurrentShadowRuns + plannedUsers.length),
    ),
  };
}

function matchesIdentityShadowEntry(args: {
  row: ModelRegistryEntry;
  modelKey?: string;
  modelVersion?: string;
}): boolean {
  const trafficRole = getEntryTrafficRole(args.row);
  if (trafficRole !== "shadow" && trafficRole !== "challenger") return false;
  const track = String(args.row.metadata?.studentTrack ?? "");
  if (track !== "identity" && args.row.modelKey !== IDENTITY_STUDENT_MODEL_KEY) {
    return false;
  }
  if (args.modelKey && args.row.modelKey !== args.modelKey) return false;
  if (args.modelVersion && args.row.modelVersion !== args.modelVersion) return false;
  return true;
}

async function resolveIdentityShadowCandidate(args?: {
  modelKey?: string;
  modelVersion?: string;
}): Promise<ModelRegistryEntry> {
  const registry = await listModelRegistryEntries({
    includeInactive: false,
    limit: 200,
  });
  if (!registry.ok) {
    throw new Error(registry.error ?? "model_registry_unavailable");
  }

  const candidates = registry.rows.filter((row) =>
    matchesIdentityShadowEntry({
      row,
      modelKey: args?.modelKey,
      modelVersion: args?.modelVersion,
    }),
  );

  if (candidates.length === 0) {
    throw new Error("shadow_model_not_configured");
  }
  if (candidates.length > 1) {
    throw new Error("shadow_model_ambiguous");
  }

  return candidates[0];
}

function needsLegacyOverallScore(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("overall_score") && normalized.includes("null value");
}

function needsLegacyEvalStatus(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("status") && normalized.includes("null value");
}

async function insertIdentityShadowEvalRow(args: {
  client: SupabaseClient;
  aiRunId: string;
  taskType: string;
  score: number | null;
  passed: boolean;
  metadata: Record<string, unknown>;
}): Promise<void> {
  let { error } = await args.client.from("ai_eval_runs").insert({
    ai_run_id: args.aiRunId,
    task_type: args.taskType,
    eval_type: "identity_shadow",
    score: args.score,
    passed: args.passed,
    metadata: args.metadata,
  });

  if (error && (needsLegacyOverallScore(error.message) || needsLegacyEvalStatus(error.message))) {
    const retry = await args.client.from("ai_eval_runs").insert({
      ai_run_id: args.aiRunId,
      task_type: args.taskType,
      eval_type: "identity_shadow",
      score: args.score,
      overall_score: args.score,
      status: args.passed ? "passed" : "failed",
      passed: args.passed,
      metadata: args.metadata,
    });
    error = retry.error;
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function getIdentityShadowHealthSummary(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
}): Promise<IdentityShadowHealthSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("IDENTITY_HEALTH_LOOKBACK_HOURS", 168)),
  );
  const cutoff = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: runs, error: runsError }, { data: teachers, error: teachersError }] =
    await Promise.all([
      client
        .from("ai_runs")
        .select(
          "id, created_at, user_id, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, error_message, success, latency_ms, fallback_used, metadata",
        )
        .in("task_type", [...IDENTITY_STUDENT_TASK_TYPES])
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false }),
      client
        .from("teacher_outputs")
        .select("ai_run_id, source_ai_run_id, created_at")
        .in("task_type", [...IDENTITY_STUDENT_TASK_TYPES])
        .gte("created_at", cutoff),
    ]);

  if (runsError) throw new Error(runsError.message);
  if (teachersError) throw new Error(teachersError.message);

  const runRows = (((runs ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
  const runIds = runRows.map((row) => row.id);

  const [evalRows, snapshotRows, trainingArtifact, teacherArtifact] = await Promise.all([
    runIds.length > 0
      ? client
          .from("ai_eval_runs")
          .select("ai_run_id, eval_type, score, passed, created_at, metadata")
          .in("ai_run_id", runIds)
          .eq("eval_type", "identity_shadow")
      : Promise.resolve({ data: [], error: null }),
    runIds.length > 0
      ? client
          .from("identity_profile_snapshots")
          .select("ai_run_id")
          .in("ai_run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    loadLatestArtifact({ client, artifactType: "identity_training_jsonl" }),
    loadLatestArtifact({ client, artifactType: "identity_teacher_jsonl" }),
  ]);

  if (evalRows.error) throw new Error(evalRows.error.message);
  if (snapshotRows.error) throw new Error(snapshotRows.error.message);

  const teacherRunIds = new Set(
    (((teachers ?? []) as unknown) as TeacherOutputRow[])
      .map(normalizeTeacherRunId)
      .filter((value): value is string => Boolean(value)),
  );
  const snapshotRunIds = new Set(
    (((snapshotRows.data ?? []) as unknown) as SnapshotLinkRow[])
      .map((row) => row.ai_run_id)
      .filter((value): value is string => Boolean(value)),
  );
  const evalByRunId = new Map<string, EvalRow>();
  for (const row of (((evalRows.data ?? []) as unknown) as EvalRow[])) {
    if (!row.ai_run_id || evalByRunId.has(row.ai_run_id)) continue;
    evalByRunId.set(row.ai_run_id, row);
  }

  const primaryRuns = runRows.filter((row) => row.metadata?.shadowPass !== true);
  const shadowRuns = runRows.filter((row) => row.metadata?.shadowPass === true);
  const shadowEvalRows = shadowRuns
    .map((row) => evalByRunId.get(row.id) ?? null)
    .filter((row): row is EvalRow => Boolean(row));
  const validPrimaryRunIds = new Set(
    primaryRuns.filter((row) => hasValidIdentityProfileRun(row)).map((row) => row.id),
  );

  const failureMap = new Map<
    NonNullable<ReturnType<typeof inferRunFailureKind>>,
    { count: number; lastSeenAt: string | null }
  >();
  for (const row of runRows) {
    const evalRow = evalByRunId.get(row.id) ?? null;
    const kind = inferRunFailureKind({
      run: row,
      hasSnapshot: snapshotRunIds.has(row.id),
      shadowEvalPassed: evalRow?.passed ?? null,
      hasValidProfile: row.metadata?.shadowPass === true || validPrimaryRunIds.has(row.id),
    });
    if (!kind) continue;
    const current = failureMap.get(kind) ?? { count: 0, lastSeenAt: null };
    current.count += 1;
    current.lastSeenAt =
      !current.lastSeenAt || row.created_at > current.lastSeenAt
        ? row.created_at
        : current.lastSeenAt;
    failureMap.set(kind, current);
  }

  const requestSummaries = buildIdentityPrimaryRequestSummaries({
    primaryRuns,
    validPrimaryRunIds,
    snapshotRunIds,
    teacherRunIds,
  });
  const requestHealth = summarizeIdentityRequestHealth(requestSummaries);
  const malformedRuns = primaryRuns.filter(
    (row) =>
      inferRunFailureKind({
        run: row,
        hasSnapshot: snapshotRunIds.has(row.id),
        shadowEvalPassed: null,
        hasValidProfile: validPrimaryRunIds.has(row.id),
      }) === "malformed_profile_json",
  );

  const trendBuckets = new Map<
    string,
    {
      primaryRuns: number;
      primarySuccesses: number;
      primaryTeacherHits: number;
      shadowRuns: number;
      shadowSuccesses: number;
      shadowEvalPassHits: number;
      shadowEvalHits: number;
    }
  >();

  for (const row of primaryRuns) {
    const bucket = formatDateBucket(row.created_at);
    const current = trendBuckets.get(bucket) ?? {
      primaryRuns: 0,
      primarySuccesses: 0,
      primaryTeacherHits: 0,
      shadowRuns: 0,
      shadowSuccesses: 0,
      shadowEvalPassHits: 0,
      shadowEvalHits: 0,
    };
    current.primaryRuns += 1;
    if (row.success) current.primarySuccesses += 1;
    if (teacherRunIds.has(row.id)) current.primaryTeacherHits += 1;
    trendBuckets.set(bucket, current);
  }

  for (const row of shadowRuns) {
    const bucket = formatDateBucket(row.created_at);
    const current = trendBuckets.get(bucket) ?? {
      primaryRuns: 0,
      primarySuccesses: 0,
      primaryTeacherHits: 0,
      shadowRuns: 0,
      shadowSuccesses: 0,
      shadowEvalPassHits: 0,
      shadowEvalHits: 0,
    };
    current.shadowRuns += 1;
    if (row.success) current.shadowSuccesses += 1;
    const evalRow = evalByRunId.get(row.id);
    if (evalRow) {
      current.shadowEvalHits += 1;
      if (evalRow.passed) current.shadowEvalPassHits += 1;
    }
    trendBuckets.set(bucket, current);
  }

  return {
    lookbackHours,
    primaryRuns: primaryRuns.length,
    shadowRuns: shadowRuns.length,
    successfulPrimaryRuns: primaryRuns.filter((row) => row.success).length,
    successfulShadowRuns: shadowRuns.filter((row) => row.success).length,
    teacherCoverageRate:
      requestSummaries.filter((row) => row.success).length > 0
        ? requestSummaries.filter((row) => row.success && row.teacherCovered).length /
          requestSummaries.filter((row) => row.success).length
        : null,
    shadowTeacherCoverageRate:
      shadowRuns.length > 0
        ? shadowRuns.filter((row) => teacherRunIds.has(row.id)).length /
          shadowRuns.length
        : null,
    shadowEvalCoverageRate:
      shadowRuns.length > 0 ? shadowEvalRows.length / shadowRuns.length : null,
    shadowEvalAvgScore: average(shadowEvalRows.map((row) => row.score)),
    shadowEvalPassRate:
      shadowEvalRows.length > 0
        ? shadowEvalRows.filter((row) => row.passed).length / shadowEvalRows.length
        : null,
    fallbackRate:
      primaryRuns.length > 0
        ? primaryRuns.filter((row) => row.fallback_used).length / primaryRuns.length
        : null,
    latestArtifacts: {
      training: {
        id: trainingArtifact?.id ?? null,
        createdAt: trainingArtifact?.created_at ?? null,
        rowCount: trainingArtifact?.row_count ?? 0,
        status: trainingArtifact?.status ?? null,
      },
      teacher: {
        id: teacherArtifact?.id ?? null,
        createdAt: teacherArtifact?.created_at ?? null,
        rowCount: teacherArtifact?.row_count ?? 0,
        status: teacherArtifact?.status ?? null,
      },
    },
    primaryMalformedBreakdown: summarizeIdentityPrimaryMalformedBreakdown(
      malformedRuns,
    ),
    requestHealth,
    currentPipelineHealth: summarizeCurrentIdentityPipelineHealth({
      primaryRuns,
      validPrimaryRunIds,
      snapshotRunIds,
      teacherRunIds,
    }),
    currentShadowPipelineHealth: summarizeCurrentIdentityShadowPipelineHealth({
      shadowRuns,
      teacherRunIds,
      evalByRunId,
    }),
    failureBreakdown: Array.from(failureMap.entries()).map(([kind, value]) => ({
      kind,
      count: value.count,
      lastSeenAt: value.lastSeenAt,
    })),
    dailyTrend: Array.from(trendBuckets.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([bucket, value]) => ({
        bucket,
        primaryRuns: value.primaryRuns,
        primarySuccesses: value.primarySuccesses,
        shadowRuns: value.shadowRuns,
        shadowSuccesses: value.shadowSuccesses,
        teacherCoverageRate:
          value.primaryRuns > 0 ? value.primaryTeacherHits / value.primaryRuns : null,
        shadowEvalPassRate:
          value.shadowEvalHits > 0
            ? value.shadowEvalPassHits / value.shadowEvalHits
            : null,
      })),
  };
}

export async function runIdentityShadowWarmup(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  maxActions?: number;
}): Promise<IdentityShadowWarmupSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("IDENTITY_WARMUP_LOOKBACK_HOURS", 168)),
  );
  const requestedActions = Math.max(
    0,
    Math.trunc(args?.maxActions ?? envNumber("IDENTITY_SHADOW_WARMUP_MAX_ACTIONS", 3)),
  );
  const targetCurrentShadowRuns = Math.max(
    0,
    Math.trunc(envNumber("IDENTITY_SHADOW_WARMUP_TARGET_CURRENT_SHADOW_RUNS", 12)),
  );
  const cutoff = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();
  if (requestedActions === 0) {
    return {
      lookbackHours,
      requestedActions,
      plannedActions: 0,
      attemptedActions: 0,
      completedActions: 0,
      primaryRunsCreated: 0,
      shadowRunsCreated: 0,
      targetCurrentShadowRuns,
      baselineCurrentShadowRuns: 0,
      remainingCurrentShadowRuns: targetCurrentShadowRuns,
      userCount: 0,
      userIds: [],
      primaryAiRunIds: [],
      shadowAiRunIds: [],
      failures: [],
    };
  }

  const startedAt = new Date().toISOString();
  const [profileRows, observationRows, orbiterRows, shadowRunRows] = await Promise.all([
    client
      .from("stargazer_profiles")
      .select("user_id, updated_at")
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(40),
    client
      .from("stargazer_observations")
      .select("user_id, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(40),
    client
      .from("orbiter_memory_summaries")
      .select("user_id, updated_at")
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(40),
    client
      .from("ai_runs")
      .select("id, user_id, created_at, success, metadata")
      .eq("task_type", "identity_profile_update")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (profileRows.error) throw new Error(profileRows.error.message);
  if (observationRows.error) throw new Error(observationRows.error.message);
  if (orbiterRows.error) throw new Error(orbiterRows.error.message);
  if (shadowRunRows.error) throw new Error(shadowRunRows.error.message);

  const latestByUser = new Map<string, string>();
  for (const row of [
    ...(((profileRows.data ?? []) as Array<Record<string, unknown>>) ?? []),
    ...(((observationRows.data ?? []) as Array<Record<string, unknown>>) ?? []),
    ...(((orbiterRows.data ?? []) as Array<Record<string, unknown>>) ?? []),
  ]) {
    const userId = typeof row.user_id === "string" ? row.user_id : null;
    const updatedAt =
      typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.created_at === "string"
          ? row.created_at
          : null;
    if (!userId || !updatedAt) continue;
    const current = latestByUser.get(userId);
    if (!current || updatedAt > current) {
      latestByUser.set(userId, updatedAt);
    }
  }

  const currentShadowRuns = (((shadowRunRows.data ?? []) as unknown) as WarmupShadowRunRow[])
    .map((row) => ({
      ...row,
      metadata: asObjectOrNull(row.metadata),
    }))
    .filter(
      (row) =>
        row.metadata?.shadowPass === true && isCurrentIdentityShadowPipelineRun(row as AIRunRow),
    );
  const currentShadowRunCountByUser = currentShadowRuns.reduce<Map<string, number>>(
    (acc, row) => {
      if (!row.user_id) return acc;
      acc.set(row.user_id, (acc.get(row.user_id) ?? 0) + 1);
      return acc;
    },
    new Map(),
  );
  const baselineCurrentShadowRuns = currentShadowRuns.length;
  const warmupCandidates: IdentityWarmupCandidate[] = Array.from(latestByUser.entries()).map(
    ([userId, latestAt]) => ({
      userId,
      latestAt,
      currentShadowRunCount: currentShadowRunCountByUser.get(userId) ?? 0,
    }),
  );
  const warmupPlan = buildIdentityWarmupPlan({
    candidates: warmupCandidates,
    requestedActions,
    targetCurrentShadowRuns,
    baselineCurrentShadowRuns,
  });
  const selectedUsers = warmupPlan.plannedUsers;

  const primaryAiRunIds: string[] = [];
  const failures: Array<{ userId: string; reason: string }> = [];

  for (const [index, userId] of selectedUsers.entries()) {
    try {
      const result = await refreshIdentityProfile({
        client,
        userId,
        trigger: "student_ops_warmup",
        persistSnapshot: false,
        runMetadata: {
          warmupRun: true,
          warmupRank: index + 1,
          warmupTargetCurrentShadowRuns: targetCurrentShadowRuns,
          warmupBaselineCurrentShadowRuns: baselineCurrentShadowRuns,
        },
      });
      if (result.ok && result.aiRunId) {
        primaryAiRunIds.push(result.aiRunId);
      } else {
        failures.push({
          userId,
          reason: result.reason ?? "warmup_failed",
        });
      }
    } catch (error) {
      failures.push({
        userId,
        reason: error instanceof Error ? error.message : "warmup_failed",
      });
    }
  }

  const { data: warmupRuns, error: warmupRunsError } = await client
    .from("ai_runs")
    .select("id, metadata, created_at")
    .eq("task_type", "identity_profile_update")
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
    plannedActions: warmupPlan.plannedActions,
    attemptedActions: selectedUsers.length,
    completedActions: primaryAiRunIds.length,
    primaryRunsCreated: primaryRuns.length,
    shadowRunsCreated: shadowRuns.length,
    targetCurrentShadowRuns,
    baselineCurrentShadowRuns,
    remainingCurrentShadowRuns: warmupPlan.remainingCurrentShadowRuns,
    userCount: selectedUsers.length,
    userIds: selectedUsers,
    primaryAiRunIds,
    shadowAiRunIds: shadowRuns.map((row) => row.id),
    failures,
  };
}

export async function backfillIdentityShadowEvaluations(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  limit?: number;
}): Promise<IdentityShadowEvalBackfillSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(
      args?.lookbackHours ?? envNumber("IDENTITY_SHADOW_EVAL_BACKFILL_LOOKBACK_HOURS", 168),
    ),
  );
  const requestedLimit = Math.max(
    1,
    Math.trunc(args?.limit ?? envNumber("IDENTITY_SHADOW_EVAL_BACKFILL_LIMIT", 40)),
  );
  const cutoff = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: shadowRuns, error: shadowRunsError } = await client
    .from("ai_runs")
    .select(
      "id, created_at, user_id, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, error_message, success, latency_ms, fallback_used, metadata",
    )
    .eq("task_type", "identity_profile_update")
    .eq("success", true)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(Math.max(requestedLimit * 3, 120));

  if (shadowRunsError) {
    throw new Error(shadowRunsError.message);
  }

  const allRuns = (((shadowRuns ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
  const candidateRuns = allRuns
    .filter(
      (row) =>
        row.metadata?.shadowPass === true && isCurrentIdentityShadowPipelineRun(row),
    )
    .slice(0, requestedLimit);
  const primaryRunIds = Array.from(
    new Set(
      candidateRuns
        .map((row) =>
          typeof row.metadata?.shadowOfAiRunId === "string"
            ? row.metadata.shadowOfAiRunId
            : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let primaryRuns: AIRunRow[] = [];
  if (primaryRunIds.length > 0) {
    const { data, error } = await client
      .from("ai_runs")
      .select(
        "id, created_at, user_id, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, error_message, success, latency_ms, fallback_used, metadata",
      )
      .in("id", primaryRunIds);
    if (error) {
      throw new Error(error.message);
    }
    primaryRuns = (((data ?? []) as unknown) as AIRunRow[]).map((row) => ({
      ...row,
      metadata: asObjectOrNull(row.metadata),
    }));
  }

  const primaryById = new Map(primaryRuns.map((row) => [row.id, row]));
  const { data: evalRows, error: evalRowsError } = await client
    .from("ai_eval_runs")
    .select("id, ai_run_id, eval_type, score, passed, created_at, metadata")
    .eq("eval_type", "identity_shadow")
    .in(
      "ai_run_id",
      candidateRuns.map((row) => row.id),
    );
  if (evalRowsError) {
    throw new Error(evalRowsError.message);
  }

  const existingByRunId = new Map<string, EvalRow>();
  for (const row of (((evalRows ?? []) as unknown) as EvalRow[])) {
    if (!row.ai_run_id || existingByRunId.has(row.ai_run_id)) continue;
    existingByRunId.set(row.ai_run_id, row);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const failures: IdentityShadowEvalBackfillSummary["failures"] = [];

  for (const shadowRun of candidateRuns) {
    const primaryRunId =
      typeof shadowRun.metadata?.shadowOfAiRunId === "string"
        ? shadowRun.metadata.shadowOfAiRunId
        : null;
    if (!primaryRunId) {
      skipped += 1;
      continue;
    }
    const primaryRun = primaryById.get(primaryRunId);
    if (!primaryRun) {
      failures.push({
        shadowAiRunId: shadowRun.id,
        reason: "primary_run_missing",
      });
      continue;
    }

    const evalResult = evaluateIdentityShadow({
      primaryStructured: (primaryRun.structured_json as StructuredOutput | null) ?? null,
      primaryText: primaryRun.response_text ?? "",
      shadowStructured: (shadowRun.structured_json as StructuredOutput | null) ?? null,
      shadowText: shadowRun.response_text ?? "",
    });
    const metadata = {
      ...evalResult.metadata,
      primaryAiRunId: primaryRunId,
    };

    try {
      const existing = existingByRunId.get(shadowRun.id);
      if (existing?.id) {
        const sameScore =
          existing.score != null &&
          evalResult.score != null &&
          Math.abs(existing.score - evalResult.score) < 1e-9;
        if (sameScore && existing.passed === evalResult.passed) {
          skipped += 1;
          continue;
        }
        const { error } = await client
          .from("ai_eval_runs")
          .update({
            score: evalResult.score,
            passed: evalResult.passed,
            metadata,
          })
          .eq("id", existing.id);
        if (error) {
          throw new Error(error.message);
        }
        updated += 1;
        continue;
      }

      await insertIdentityShadowEvalRow({
        client,
        aiRunId: shadowRun.id,
        taskType: shadowRun.task_type,
        score: evalResult.score,
        passed: evalResult.passed,
        metadata,
      });
      inserted += 1;
    } catch (error) {
      failures.push({
        shadowAiRunId: shadowRun.id,
        reason: error instanceof Error ? error.message : "eval_backfill_failed",
      });
    }
  }

  return {
    lookbackHours,
    requestedLimit,
    scannedShadowRuns: allRuns.filter((row) => row.metadata?.shadowPass === true).length,
    candidateRuns: candidateRuns.length,
    inserted,
    updated,
    skipped,
    failures,
  };
}

export async function evaluateIdentityShadowPromotionCandidate(args?: {
  client?: SupabaseClient | null;
  modelKey?: string;
  modelVersion?: string;
  lookbackHours?: number;
  thresholdOverrides?: Partial<IdentityShadowPromotionThresholds>;
}): Promise<IdentityShadowPromotionReview> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const candidate = await resolveIdentityShadowCandidate({
    modelKey: args?.modelKey,
    modelVersion: args?.modelVersion,
  });
  const thresholds = {
    ...getDefaultIdentityShadowPromotionThresholds(),
    ...(args?.thresholdOverrides ?? {}),
  };
  const health = await getIdentityShadowHealthSummary({
    client,
    lookbackHours: args?.lookbackHours,
  });
  const [trainingArtifact, teacherArtifact] = await Promise.all([
    loadLatestArtifact({
      client,
      artifactType: "identity_training_jsonl",
    }),
    loadLatestArtifact({
      client,
      artifactType: "identity_teacher_jsonl",
    }),
  ]);

  const latestArtifacts = {
    training: {
      id: trainingArtifact?.id ?? null,
      createdAt: trainingArtifact?.created_at ?? null,
      ageHours: computeArtifactAgeHours(trainingArtifact?.created_at ?? null),
      rowCount: Math.max(0, trainingArtifact?.row_count ?? 0),
      status: trainingArtifact?.status ?? null,
    },
    teacher: {
      id: teacherArtifact?.id ?? null,
      createdAt: teacherArtifact?.created_at ?? null,
      ageHours: computeArtifactAgeHours(teacherArtifact?.created_at ?? null),
      rowCount: Math.max(0, teacherArtifact?.row_count ?? 0),
      status: teacherArtifact?.status ?? null,
    },
  };

  const currentShadow = health.currentShadowPipelineHealth;
  const currentPrimary = health.currentPipelineHealth.requestHealth;

  const checks: IdentityShadowPromotionReview["checks"] = [
    {
      name: "min_current_shadow_runs",
      passed: currentShadow.runCount >= thresholds.minCurrentShadowRuns,
      actual: currentShadow.runCount,
      required: thresholds.minCurrentShadowRuns,
    },
    {
      name: "min_current_shadow_success_rate",
      passed:
        currentShadow.successRate != null &&
        currentShadow.successRate >= thresholds.minCurrentShadowSuccessRate,
      actual: currentShadow.successRate,
      required: thresholds.minCurrentShadowSuccessRate,
    },
    {
      name: "min_current_shadow_eval_avg_score",
      passed:
        currentShadow.evalAvgScore != null &&
        currentShadow.evalAvgScore >= thresholds.minCurrentShadowEvalAvgScore,
      actual: currentShadow.evalAvgScore,
      required: thresholds.minCurrentShadowEvalAvgScore,
    },
    {
      name: "min_current_shadow_eval_pass_rate",
      passed:
        currentShadow.evalPassRate != null &&
        currentShadow.evalPassRate >= thresholds.minCurrentShadowEvalPassRate,
      actual: currentShadow.evalPassRate,
      required: thresholds.minCurrentShadowEvalPassRate,
    },
    {
      name: "min_current_shadow_teacher_coverage_rate",
      passed:
        currentShadow.successfulTeacherCoverageRate != null &&
        currentShadow.successfulTeacherCoverageRate >=
          thresholds.minCurrentShadowTeacherCoverageRate,
      actual: currentShadow.successfulTeacherCoverageRate,
      required: thresholds.minCurrentShadowTeacherCoverageRate,
    },
    {
      name: "min_current_shadow_eval_coverage_rate",
      passed:
        currentShadow.successfulEvalCoverageRate != null &&
        currentShadow.successfulEvalCoverageRate >=
          thresholds.minCurrentShadowEvalCoverageRate,
      actual: currentShadow.successfulEvalCoverageRate,
      required: thresholds.minCurrentShadowEvalCoverageRate,
    },
    {
      name: "min_current_primary_request_success_rate",
      passed:
        currentPrimary.successRate != null &&
        currentPrimary.successRate >= thresholds.minCurrentPrimaryRequestSuccessRate,
      actual: currentPrimary.successRate,
      required: thresholds.minCurrentPrimaryRequestSuccessRate,
    },
    {
      name: "min_latest_training_rows",
      passed: latestArtifacts.training.rowCount >= thresholds.minLatestTrainingRows,
      actual: latestArtifacts.training.rowCount,
      required: thresholds.minLatestTrainingRows,
    },
    {
      name: "min_latest_teacher_rows",
      passed: latestArtifacts.teacher.rowCount >= thresholds.minLatestTeacherRows,
      actual: latestArtifacts.teacher.rowCount,
      required: thresholds.minLatestTeacherRows,
    },
    {
      name: "max_training_artifact_age_hours",
      passed:
        latestArtifacts.training.ageHours != null &&
        latestArtifacts.training.ageHours <= thresholds.maxArtifactAgeHours,
      actual: latestArtifacts.training.ageHours,
      required: thresholds.maxArtifactAgeHours,
    },
    {
      name: "max_teacher_artifact_age_hours",
      passed:
        latestArtifacts.teacher.ageHours != null &&
        latestArtifacts.teacher.ageHours <= thresholds.maxArtifactAgeHours,
      actual: latestArtifacts.teacher.ageHours,
      required: thresholds.maxArtifactAgeHours,
    },
  ];

  const progress = checks.map((check) => ({
    name: check.name,
    currentlyPassed: check.passed,
    actual: check.actual,
    required: check.required,
    remainingToPass: readinessRemainingToPass({
      name: check.name,
      actual: check.actual,
      required: check.required,
    }),
    unit: readinessCheckUnit(check.name),
  }));
  const eligible = checks.every((check) => check.passed);

  return {
    eligible,
    reason: eligible ? "ready_for_challenger" : "threshold_not_met",
    candidate: {
      modelKey: candidate.modelKey,
      modelVersion: candidate.modelVersion,
      provider: candidate.provider,
      providerModel: candidate.providerModel,
      trafficRole: candidate.trafficRole,
    },
    thresholds,
    health,
    latestArtifacts,
    checks,
    readinessProgress: {
      passedCount: checks.filter((check) => check.passed).length,
      totalCount: checks.length,
      checks: progress,
      nextChecks: progress
        .filter((check) => !check.currentlyPassed)
        .sort((left, right) => {
          const leftRemaining = left.remainingToPass ?? Number.POSITIVE_INFINITY;
          const rightRemaining = right.remainingToPass ?? Number.POSITIVE_INFINITY;
          if (left.unit === right.unit && leftRemaining !== rightRemaining) {
            return leftRemaining - rightRemaining;
          }
          if (left.unit !== right.unit) {
            return left.unit.localeCompare(right.unit);
          }
          return left.name.localeCompare(right.name);
        }),
    },
    rolloutPlan: {
      targetTrafficRole: "challenger",
      targetTrafficWeight: thresholds.challengerTrafficWeight,
    },
  };
}

export async function promoteIdentityShadowToChallenger(args?: {
  client?: SupabaseClient | null;
  modelKey?: string;
  modelVersion?: string;
  trafficWeight?: number;
  notes?: string | null;
}): Promise<{ ok: boolean; updatedId?: string; error?: string }> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    return { ok: false, error: "service_role_unavailable" };
  }

  try {
    const candidate = await resolveIdentityShadowCandidate({
      modelKey: args?.modelKey,
      modelVersion: args?.modelVersion,
    });
    const trafficWeight = Math.max(
      1,
      Math.min(
        100,
        Math.trunc(
          args?.trafficWeight ??
            getDefaultIdentityShadowPromotionThresholds().challengerTrafficWeight,
        ),
      ),
    );

    const { error } = await client
      .from("model_registry")
      .update({
        model_role: "challenger",
        traffic_role: "challenger",
        traffic_weight: trafficWeight,
        promotion_status: "candidate",
        notes:
          args?.notes ??
          `promoted to challenger for identity rollout at ${new Date().toISOString()}`,
      })
      .eq("id", candidate.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, updatedId: candidate.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "promotion_failed",
    };
  }
}

export async function inspectIdentityRolloutState(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  sampleSize?: number;
}): Promise<IdentityRolloutState> {
  const client = args?.client ?? getAIServiceClient();
  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("IDENTITY_HEALTH_LOOKBACK_HOURS", 168)),
  );
  const sampleSize = Math.max(
    1,
    Math.min(100, Math.trunc(args?.sampleSize ?? envNumber("IDENTITY_ROLLOUT_PREVIEW_SAMPLE_SIZE", 40))),
  );
  const globalRolloutEnabled = envBool("AI_MODEL_ROLLOUT_ENABLED", false);
  const stickyMode = normalizeStickyMode(
    envString("AI_MODEL_ROLLOUT_STICKY_MODE", "user"),
  );
  const defaultChallengerPercent = Math.max(
    0,
    Math.min(
      100,
      Math.trunc(envNumber("AI_MODEL_ROLLOUT_DEFAULT_CHALLENGER_PERCENT", 0)),
    ),
  );
  const taskScopedEnabled = parseTaskTypeAllowlist(
    envString("AI_MODEL_ROLLOUT_TASK_TYPES", ""),
  ).includes(IDENTITY_STUDENT_TASK_TYPES[0]);
  const rolloutEnabled = globalRolloutEnabled || taskScopedEnabled;

  const registry = await listModelRegistryEntries({
    includeInactive: false,
    limit: 100,
  });

  if (!registry.ok) {
    return {
      rolloutEnabled,
      globalRolloutEnabled,
      taskScopedEnabled,
      stickyMode,
      defaultChallengerPercent,
      registryOk: false,
      registryError: registry.error ?? "model_registry_unavailable",
      matchingRegistryRows: [],
      selectionPreview: null,
      recentSelection: null,
    };
  }

  const matchingRegistryRows = registry.rows
    .filter((row) => isTaskTypeIncluded(row, IDENTITY_STUDENT_TASK_TYPES[0]))
    .map(mapIdentityRolloutRegistryRow);

  let recentSelection: IdentityRecentRolloutSelection | null = null;
  if (client) {
    const cutoff = new Date(
      Date.now() - lookbackHours * 60 * 60 * 1000,
    ).toISOString();
    const { data: runs, error } = await client
      .from("ai_runs")
      .select("created_at, metadata")
      .eq("task_type", IDENTITY_STUDENT_TASK_TYPES[0])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error) {
      const primaryRuns = ((runs ?? []) as Array<{
        created_at: string;
        metadata: Record<string, unknown> | null;
      }>).filter((run) => {
        const metadata = asObjectOrNull(run.metadata);
        return metadata?.identityShadowRun !== true && !toTextOrNull(metadata?.shadowOfAiRunId);
      });

      const roleCounts = new Map<string, number>();
      for (const run of primaryRuns) {
        const role = normalizeSelectedRole(run.metadata?.selectedRole);
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      }

      recentSelection = {
        lookbackHours,
        runCount: primaryRuns.length,
        selectedRoleCounts: Array.from(roleCounts.entries())
          .map(([role, count]) => ({ role, count }))
          .sort((left, right) => {
            if (right.count !== left.count) return right.count - left.count;
            return left.role.localeCompare(right.role);
          }),
        reasonCounts: summarizeFacet(
          primaryRuns,
          (run) => toTextOrNull(asObjectOrNull(run.metadata)?.modelSelectionReason) ?? "unknown",
          (run) => run.created_at,
        ),
        latestRunAt: primaryRuns[0]?.created_at ?? null,
      };
    }
  }

  return {
    rolloutEnabled,
    globalRolloutEnabled,
    taskScopedEnabled,
    stickyMode,
    defaultChallengerPercent,
    registryOk: true,
    registryError: null,
    matchingRegistryRows,
    selectionPreview: buildIdentityRolloutSelectionPreview({
      rows: registry.rows,
      sampleSize,
    }),
    recentSelection,
  };
}

export async function backfillIdentityTeacherOutputs(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  limit?: number;
}): Promise<IdentityTeacherBackfillSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(
      args?.lookbackHours ?? envNumber("IDENTITY_TEACHER_BACKFILL_LOOKBACK_HOURS", 168),
    ),
  );
  const requestedLimit = Math.max(
    1,
    Math.trunc(args?.limit ?? envNumber("IDENTITY_TEACHER_BACKFILL_LIMIT", 25)),
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
        .in("task_type", [...IDENTITY_STUDENT_TASK_TYPES])
        .eq("success", true)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false }),
      client
        .from("teacher_outputs")
        .select("ai_run_id, source_ai_run_id, created_at")
        .in("task_type", [...IDENTITY_STUDENT_TASK_TYPES])
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
  const retryCount = Math.max(
    1,
    Math.trunc(envNumber("IDENTITY_TEACHER_BACKFILL_RETRY_COUNT", 2)),
  );
  const retryDelayMs = Math.max(
    0,
    Math.trunc(envNumber("IDENTITY_TEACHER_BACKFILL_RETRY_DELAY_MS", 750)),
  );

  for (const run of missingRuns) {
    let handled = false;
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
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
          jsonSchema: IDENTITY_PROFILE_JSON_SCHEMA,
          maxOutputTokens: 3072,
          client,
        });

        if (result.inserted) {
          inserted += 1;
          handled = true;
          break;
        }

        if (
          result.reason &&
          isRetryableTeacherBackfillReason(result.reason) &&
          attempt + 1 < retryCount
        ) {
          await sleep(retryDelayMs);
          continue;
        }

        skipped += 1;
        handled = true;
        if (result.reason && result.reason !== "teacher_already_exists") {
          failures.push({ aiRunId: run.id, reason: result.reason });
        }
        break;
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "teacher_backfill_failed";
        if (isRetryableTeacherBackfillReason(reason) && attempt + 1 < retryCount) {
          await sleep(retryDelayMs);
          continue;
        }
        failures.push({
          aiRunId: run.id,
          reason,
        });
        handled = true;
        break;
      }
    }

    if (!handled) {
      skipped += 1;
      failures.push({
        aiRunId: run.id,
        reason: "teacher_backfill_unhandled",
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

function toTrainingSampleRow(row: IdentityTrainingDatasetRow): Record<string, unknown> {
  return {
    aiRunId: row.aiRunId,
    taskType: row.taskType,
    userId: row.userId,
    runSuccess: row.runSuccess,
    success: row.success,
    isShadow: row.isShadow,
    selectedRole: row.selectedRole,
    teacherPresent: Boolean(row.teacherOutput.response),
    evalTypes: row.evals.map((evalRow) => evalRow.evalType),
    hardNegativeKind: row.hardNegative.kind,
    profileText: row.profile.profileText,
    snapshotId: row.snapshot.id,
  };
}

function toTeacherSampleRow(row: IdentityTeacherDatasetRow): Record<string, unknown> {
  return {
    aiRunId: row.aiRunId,
    taskType: row.taskType,
    userId: row.userId,
    isShadow: row.isShadow,
    teacherPresent: Boolean(row.teacherResponse),
    teacherProvider: row.teacherProvider,
    evalTypes: row.evals.map((evalRow) => evalRow.evalType),
    profileText: row.profileText,
  };
}

async function insertSampleCheckRow(args: {
  client: SupabaseClient;
  artifactType: IdentityTrainingArtifactType;
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
      track: "identity",
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
      "[identity/studentOps] failed to insert artifact sample check:",
      error.message,
    );
    return null;
  }

  return data?.id ?? null;
}

export async function runIdentityArtifactSampleChecks(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  sampleSize?: number;
  limit?: number;
}): Promise<IdentityArtifactSampleCheckRun> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(
    1,
    Math.trunc(args?.lookbackHours ?? envNumber("IDENTITY_ARTIFACT_LOOKBACK_HOURS", 168)),
  );
  const sampleSize = Math.max(
    1,
    Math.trunc(args?.sampleSize ?? envNumber("IDENTITY_ARTIFACT_SAMPLE_SIZE", 3)),
  );
  const limit = Math.max(
    sampleSize,
    Math.trunc(args?.limit ?? envNumber("IDENTITY_ARTIFACT_EXPORT_LIMIT", 200)),
  );
  const minRows = Math.max(
    1,
    Math.trunc(envNumber("IDENTITY_ARTIFACT_MIN_ROWS", 5)),
  );

  const [trainingExport, teacherExport, trainingArtifact, teacherArtifact] =
    await Promise.all([
      exportIdentityTrainingDataset({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...IDENTITY_STUDENT_TASK_TYPES],
      }),
      exportIdentityTeacherDataset({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...IDENTITY_STUDENT_TASK_TYPES],
      }),
      generateTrainingArtifact({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...IDENTITY_STUDENT_TASK_TYPES],
        artifactType: "identity_training_jsonl",
        notes: `identity sample check ${new Date().toISOString()}`,
      }),
      generateTrainingArtifact({
        lookbackHours,
        limit,
        onlySuccessful: false,
        taskTypes: [...IDENTITY_STUDENT_TASK_TYPES],
        artifactType: "identity_teacher_jsonl",
        notes: `identity sample check ${new Date().toISOString()}`,
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
      .some((row) => row.success && !row.profile.profileText)
  ) {
    trainingIssues.push("sample_training_rows_missing_profile");
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
    teacherRows.slice(0, sampleSize).some(
      (row) => !(row.teacherResponse ?? "").trim() || !row.promptText.trim(),
    )
  ) {
    teacherIssues.push("sample_teacher_rows_invalid");
  }
  if (!teacherArtifact.ok) {
    teacherIssues.push(`teacher_artifact:${teacherArtifact.error ?? "unknown_error"}`);
  }

  const trainingStatus: "pass" | "warn" | "fail" =
    trainingRows.length === 0 ||
    trainingIssues.includes("sample_training_rows_missing_profile")
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
      artifactType: "identity_training_jsonl",
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
      artifactType: "identity_teacher_jsonl",
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
        artifactType: "identity_training_jsonl",
        artifactId: trainingArtifact.summary?.id ?? null,
        status: trainingStatus,
        rowCount: trainingRows.length,
        sampleCount: trainingSampleRows.length,
        issues: trainingIssues,
        sampleRows: trainingSampleRows,
      },
      {
        id: teacherCheckId,
        artifactType: "identity_teacher_jsonl",
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

export async function listRecentIdentityArtifactSampleChecks(args?: {
  client?: SupabaseClient | null;
  limit?: number;
}): Promise<IdentityArtifactSampleCheckResult[]> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const limit = Math.max(1, Math.trunc(args?.limit ?? 10));
  const { data, error } = await client
    .from("ai_artifact_sample_checks")
    .select(
      "id, artifact_type, artifact_id, row_count, sample_count, status, issues, sample_rows",
    )
    .eq("track", "identity")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : null,
    artifactType:
      row.artifact_type === "identity_teacher_jsonl"
        ? "identity_teacher_jsonl"
        : "identity_training_jsonl",
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
