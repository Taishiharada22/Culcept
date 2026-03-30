import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIServiceClient } from "@/lib/ai/db";
import { ensureTeacherOutputForStoredRun } from "@/lib/ai/eval";
import {
  getEntryTrafficRole,
  listModelRegistryEntries,
  type ModelRegistryEntry,
} from "@/lib/ai/modelRegistry";
import { generateTrainingArtifact } from "@/lib/ai/trainingArtifacts";
import {
  analyzePoolState,
  executeGrowth,
  type GrowthAction,
} from "./growthOrchestrator";
import {
  exportStargazerTeacherDataset,
  exportStargazerTrainingDataset,
  type StargazerTeacherDatasetRow,
  type StargazerTrainingDatasetRow,
} from "./exportDataset";
import { inferStargazerHardNegativeKind } from "./trainingAssets";
import {
  STARGAZER_STUDENT_TASK_TYPES,
  type StargazerStudentTaskType,
} from "./studentTrack";
import { STARGAZER_STUDENT_MODEL_KEY } from "./studentModelRegistry";

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

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeTeacherRunId(row: TeacherOutputRow): string | null {
  return row.ai_run_id ?? row.source_ai_run_id ?? null;
}

function stargazerTaskPriority(taskType: string): number {
  if (taskType === "stargazer_question_generation") return 0;
  if (taskType === "stargazer_question_expansion") return 1;
  if (taskType === "stargazer_lens_discovery") return 2;
  if (taskType === "stargazer_observation_analysis") return 3;
  return 9;
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
  success: boolean;
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
  metadata: Record<string, unknown> | null;
};

type CandidateTrendRow = {
  created_at: string;
  rejection_reason: string | null;
};

type GenerationCandidateRow = {
  ai_run_id: string | null;
  created_at: string;
  acceptance_status: "accepted" | "rejected";
  rejection_reason: string | null;
};

type CandidateEvalBreakdownRow = {
  ai_run_id: string | null;
  rejection_reason: string | null;
};

type MonitorSnapshotRow = {
  id: string;
  created_at: string;
  snapshot_date: string;
  lookback_hours: number;
  teacher_coverage_rate: number | null;
  shadow_eval_coverage_rate: number | null;
  shadow_eval_avg_score: number | null;
  shadow_eval_pass_rate: number | null;
  fallback_rate: number | null;
  promotion_eligible: boolean;
  passed_check_count: number;
  total_check_count: number;
  hard_negative_counts: Record<string, unknown> | null;
  task_primary_counts: Record<string, unknown> | null;
  task_shadow_counts: Record<string, unknown> | null;
  readiness_checks: unknown[] | null;
  metadata: Record<string, unknown> | null;
};

export type StargazerShadowTaskHealth = {
  taskType: StargazerStudentTaskType;
  primaryRuns: number;
  shadowRuns: number;
  shadowTeacherCoverageRate: number | null;
  shadowEvalCoverageRate: number | null;
};

export type StargazerShadowEvalTaskBreakdown = {
  taskType: StargazerStudentTaskType;
  shadowRunCount: number;
  evalCount: number;
  passedCount: number;
  passRate: number | null;
  avgScore: number | null;
  missingEvalCount: number;
};

export type StargazerShadowEvalHardNegativeBreakdown = {
  hardNegativeKind: string;
  evalCount: number;
  passedCount: number;
  passRate: number | null;
  avgScore: number | null;
};

export type StargazerGenerationFailureBreakdown = {
  hardNegativeKind: string;
  count: number;
};

export type StargazerGenerationRecentRun = {
  aiRunId: string;
  createdAt: string;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  hardNegativeKinds: StargazerGenerationFailureBreakdown[];
};

export type StargazerGenerationHealthSummary = {
  lookbackHours: number;
  candidateRunCount: number;
  candidateCount: number;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  fullyAcceptedRunCount: number;
  fullyAcceptedRunRate: number | null;
  validationPromptMissingCount: number;
  validationPromptMissingLastSeenAt: string | null;
  topRejectedKinds: StargazerGenerationFailureBreakdown[];
  nextFailureKind: string | null;
  recentRuns: StargazerGenerationRecentRun[];
};

export type StargazerShadowHealthSummary = {
  lookbackHours: number;
  primaryRuns: number;
  shadowRuns: number;
  shadowSuccessRuns: number;
  shadowFailureRuns: number;
  teacherCoverageRate: number | null;
  shadowEvalCoverageRate: number | null;
  shadowEvalAvgScore: number | null;
  shadowEvalPassRate: number | null;
  fallbackRate: number | null;
  taskHealth: StargazerShadowTaskHealth[];
  shadowEvalByTask: StargazerShadowEvalTaskBreakdown[];
  shadowEvalByPrimaryHardNegativeKind: StargazerShadowEvalHardNegativeBreakdown[];
  generationHealth: StargazerGenerationHealthSummary;
};

export type StargazerTeacherBackfillSummary = {
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

export type StargazerShadowWarmupSummary = {
  enabled: boolean;
  reason: string;
  minimums: {
    generationRuns: number;
    expansionRuns: number;
    lensRuns: number;
  };
  before: StargazerShadowHealthSummary;
  plannedActions: GrowthAction[];
  executedActions: GrowthAction[];
  result: {
    aiRunIds: string[];
    questionsGenerated: number;
    lensesDiscovered: number;
    questionsCooled: number;
  } | null;
};

export type StargazerShadowPromotionThresholds = {
  minShadowRuns: number;
  minRunsByTask: Record<string, number>;
  minShadowEvalAvgScore: number;
  minShadowEvalPassRate: number;
  maxShadowFallbackRate: number;
  minTeacherCoverageRate: number;
  minLatestTrainingRows: number;
  minLatestTeacherRows: number;
  maxArtifactAgeHours: number;
  challengerTrafficWeight: number;
};

export type StargazerShadowPromotionReview = {
  eligible: boolean;
  reason: string;
  candidate: {
    modelKey: string;
    modelVersion: string;
    provider: string;
    providerModel: string | null;
    trafficRole: string | null;
  };
  thresholds: StargazerShadowPromotionThresholds;
  health: StargazerShadowHealthSummary;
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
  rolloutPlan: {
    targetTrafficRole: "challenger";
    targetTrafficWeight: number;
  };
};

export type StargazerArtifactSampleCheckResult = {
  id: string | null;
  artifactType: "stargazer_training_jsonl" | "stargazer_teacher_jsonl";
  artifactId: string | null;
  status: "pass" | "warn" | "fail";
  rowCount: number;
  sampleCount: number;
  issues: string[];
  sampleRows: Record<string, unknown>[];
};

export type StargazerArtifactSampleCheckSummary = {
  lookbackHours: number;
  sampleSize: number;
  checks: StargazerArtifactSampleCheckResult[];
};

export type StargazerStudentTrendPoint = {
  bucket: string;
  hardNegativeCounts: Record<string, number>;
  hardNegativeTotal: number;
  generationHardNegativeCounts: Record<string, number>;
  generationHardNegativeTotal: number;
  generationPromptMissingCount: number;
  taskShadowRuns: Record<StargazerStudentTaskType, number>;
  taskPrimaryRuns: Record<StargazerStudentTaskType, number>;
  teacherCoverageRate: number | null;
  promotionEligible: boolean | null;
  passedCheckCount: number | null;
  totalCheckCount: number | null;
};

export type StargazerReadinessCheckProgress = {
  name: string;
  currentlyPassed: boolean;
  actual: number | null;
  required: number;
  firstPassedAt: string | null;
  remainingToPass: number | null;
  unit: "runs" | "rate" | "rows" | "hours";
};

export type StargazerStudentProgressTrends = {
  lookbackDays: number;
  points: StargazerStudentTrendPoint[];
  latest: StargazerStudentTrendPoint | null;
  readinessProgress: {
    eligible: boolean;
    passedCount: number;
    totalCount: number;
    checks: StargazerReadinessCheckProgress[];
    nextChecks: StargazerReadinessCheckProgress[];
  };
};

function getDefaultStargazerShadowPromotionThresholds(): StargazerShadowPromotionThresholds {
  return {
    minShadowRuns: Math.max(
      1,
      Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_SHADOW_RUNS", 100)),
    ),
    minRunsByTask: {
      stargazer_question_generation: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_RUNS_GENERATION", 60)),
      ),
      stargazer_question_expansion: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_RUNS_EXPANSION", 20)),
      ),
      stargazer_lens_discovery: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_RUNS_LENS", 20)),
      ),
      stargazer_observation_analysis: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_RUNS_OBSERVATION", 10)),
      ),
    },
    minShadowEvalAvgScore: envNumber(
      "STARGAZER_PROMOTION_MIN_SHADOW_AVG_SCORE",
      0.85,
    ),
    minShadowEvalPassRate: envNumber(
      "STARGAZER_PROMOTION_MIN_SHADOW_PASS_RATE",
      0.9,
    ),
    maxShadowFallbackRate: envNumber(
      "STARGAZER_PROMOTION_MAX_SHADOW_FALLBACK_RATE",
      0.05,
    ),
    minTeacherCoverageRate: envNumber(
      "STARGAZER_PROMOTION_MIN_TEACHER_COVERAGE_RATE",
      0.95,
    ),
    minLatestTrainingRows: Math.max(
      1,
      Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_TRAINING_ROWS", 100)),
    ),
    minLatestTeacherRows: Math.max(
      1,
      Math.trunc(envNumber("STARGAZER_PROMOTION_MIN_TEACHER_ROWS", 100)),
    ),
    maxArtifactAgeHours: envNumber(
      "STARGAZER_PROMOTION_MAX_ARTIFACT_AGE_HOURS",
      72,
    ),
    challengerTrafficWeight: Math.max(
      1,
      Math.min(
        100,
        Math.trunc(envNumber("STARGAZER_CHALLENGER_TRAFFIC_WEIGHT", 5)),
      ),
    ),
  };
}

async function loadRecentStargazerRuns(
  client: SupabaseClient,
  lookbackHours: number,
): Promise<AIRunRow[]> {
  const cutoff = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await client
    .from("ai_runs")
    .select(
      "id, created_at, task_type, provider, model, prompt_text, system_prompt, response_text, success, fallback_used, metadata",
    )
    .gte("created_at", cutoff)
    .in("task_type", [...STARGAZER_STUDENT_TASK_TYPES]);

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
}

async function selectByChunk<T extends Record<string, unknown>>(args: {
  client: SupabaseClient;
  table: string;
  select: string;
  column: string;
  values: string[];
}): Promise<T[]> {
  if (args.values.length === 0) return [];

  const rows: T[] = [];
  for (const chunk of chunkArray(Array.from(new Set(args.values)), 200)) {
    const { data, error } = await args.client
      .from(args.table)
      .select(args.select)
      .in(args.column, chunk);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...(((data ?? []) as unknown) as T[]));
  }

  return rows;
}

async function loadCandidateHardNegativeKindsForRuns(args: {
  client: SupabaseClient;
  aiRunIds: string[];
}): Promise<Map<string, Set<string>>> {
  const rows = await selectByChunk<CandidateEvalBreakdownRow>({
    client: args.client,
    table: "stargazer_generation_candidates",
    select: "ai_run_id, rejection_reason",
    column: "ai_run_id",
    values: args.aiRunIds,
  });

  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.ai_run_id) continue;
    const kind = inferStargazerHardNegativeKind(row.rejection_reason);
    if (!kind) continue;
    const kinds = map.get(row.ai_run_id) ?? new Set<string>();
    kinds.add(kind);
    map.set(row.ai_run_id, kinds);
  }

  return map;
}

function isMatchingStargazerShadowRun(args: {
  row: AIRunRow;
  modelKey?: string;
  modelVersion?: string;
}): boolean {
  const metadata = args.row.metadata;
  if (metadata?.studentTrack !== "stargazer") return false;
  if (metadata?.shadowPass !== true) return false;

  if (args.modelKey && metadata?.selectedModelKey !== args.modelKey) {
    return false;
  }

  if (args.modelVersion && metadata?.selectedModelVersion !== args.modelVersion) {
    return false;
  }

  return true;
}

function findLatestArtifact(
  rows: ArtifactRow[],
  artifactType: "stargazer_training_jsonl" | "stargazer_teacher_jsonl",
): ArtifactRow | null {
  const matching = rows
    .filter((row) => row.artifact_type === artifactType)
    .sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
  return matching[0] ?? null;
}

function computeArtifactAgeHours(createdAt: string | null): number | null {
  if (!createdAt) return null;
  const value = Date.parse(createdAt);
  if (!Number.isFinite(value)) return null;
  return (Date.now() - value) / (60 * 60 * 1000);
}

function getMonitorTimezone(): string {
  return envString("STARGAZER_STUDENT_MONITOR_TIMEZONE", "Asia/Tokyo");
}

function formatDateBucket(value: string, timeZone = getMonitorTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function emptyTaskCounter(): Record<StargazerStudentTaskType, number> {
  const counter: Partial<Record<StargazerStudentTaskType, number>> = {};
  for (const t of STARGAZER_STUDENT_TASK_TYPES) {
    counter[t] = 0;
  }
  return counter as Record<StargazerStudentTaskType, number>;
}

function normalizeTrendCounts(
  value: Record<string, unknown> | null | undefined,
): Record<string, number> {
  if (!value) return {};
  const entries: Array<[string, number]> = Object.entries(value).map(([key, raw]) => [
    key,
    Math.max(0, Math.trunc(toNumberOrNull(raw) ?? 0)),
  ]);
  return Object.fromEntries(entries.filter(([, count]) => count > 0));
}

function normalizeSnapshotTaskCounts(
  value: Record<string, unknown> | null | undefined,
): Record<StargazerStudentTaskType, number> {
  const base = emptyTaskCounter();
  if (!value) return base;

  for (const taskType of STARGAZER_STUDENT_TASK_TYPES) {
    base[taskType] = Math.max(0, Math.trunc(toNumberOrNull(value[taskType]) ?? 0));
  }

  return base;
}

function normalizeSnapshotChecks(
  value: unknown,
): StargazerShadowPromotionReview["checks"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => !!item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name : "unknown_check",
        passed: row.passed === true,
        actual: toNumberOrNull(row.actual),
        required: toNumberOrNull(row.required) ?? 0,
      };
    });
}

function readinessCheckUnit(name: string): "runs" | "rate" | "rows" | "hours" {
  if (name === "min_shadow_runs" || name.startsWith("min_runs_")) return "runs";
  if (name.startsWith("min_latest_")) return "rows";
  if (name.startsWith("max_") && name.endsWith("_hours")) return "hours";
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

function toTrainingSampleRow(row: StargazerTrainingDatasetRow): Record<string, unknown> {
  const prompt =
    (row.candidateJson?.prompt as string | undefined) ??
    (row.acceptedEntity &&
    typeof row.acceptedEntity === "object" &&
    !Array.isArray(row.acceptedEntity)
      ? ((row.acceptedEntity as Record<string, unknown>).variant_json as Record<string, unknown> | undefined)?.prompt
      : undefined) ??
    row.aiRun.responseText ??
    null;

  return {
    id: row.id,
    aiRunId: row.aiRunId,
    taskType: row.taskType,
    sourceStage: row.sourceStage,
    acceptanceStatus: row.acceptanceStatus,
    hardNegative: row.hardNegative.isHardNegative,
    hardNegativeKind: row.hardNegative.kind,
    prompt,
    teacherPresent: Boolean(row.teacherOutput.response),
    runScore: row.runOutcomeSummary?.downstreamScore ?? null,
    timesShown: row.runOutcomeSummary?.timesShown ?? null,
  };
}

function toTeacherSampleRow(row: StargazerTeacherDatasetRow): Record<string, unknown> {
  return {
    aiRunId: row.aiRunId,
    taskType: row.taskType,
    promptText: row.promptText.slice(0, 160),
    teacherPresent: Boolean((row.teacherResponse ?? "").trim()),
    acceptedEntityCount: row.acceptedEntityIds.length,
    hardNegativeCount: row.hardNegativeCount,
    hardNegativeKinds: row.hardNegativeKinds,
    evalTypes: row.evals.map((evalRow) => evalRow.evalType),
  };
}

function buildTrainingSampleRows(
  rows: StargazerTrainingDatasetRow[],
  sampleSize: number,
): Record<string, unknown>[] {
  if (rows.length === 0) return [];

  const latestRows = rows.slice(0, sampleSize);
  const latestHardNegative = rows.find((row) => row.hardNegative.isHardNegative) ?? null;

  if (!latestHardNegative) {
    return latestRows.map(toTrainingSampleRow);
  }

  const selected = new Map<string, StargazerTrainingDatasetRow>();
  if (sampleSize === 1) {
    selected.set(latestHardNegative.id, latestHardNegative);
  } else {
    for (const row of latestRows.slice(0, sampleSize - 1)) {
      selected.set(row.id, row);
    }
    selected.set(latestHardNegative.id, latestHardNegative);
  }

  return Array.from(selected.values())
    .slice(0, sampleSize)
    .map(toTrainingSampleRow);
}

async function insertSampleCheckRow(args: {
  client: SupabaseClient;
  artifactType: "stargazer_training_jsonl" | "stargazer_teacher_jsonl";
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
      track: "stargazer",
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
      "[stargazer/studentOps] failed to insert artifact sample check:",
      error.message,
    );
    return null;
  }

  return data?.id ?? null;
}

async function loadRecentHardNegativeRows(args: {
  client: SupabaseClient;
  lookbackHours: number;
}): Promise<CandidateTrendRow[]> {
  const cutoff = new Date(
    Date.now() - args.lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await args.client
    .from("stargazer_generation_candidates")
    .select("created_at, rejection_reason")
    .gte("created_at", cutoff)
    .not("rejection_reason", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as CandidateTrendRow[]).map((row) => ({
    created_at: row.created_at,
    rejection_reason: row.rejection_reason,
  }));
}

async function loadRecentGenerationCandidateRows(args: {
  client: SupabaseClient;
  lookbackHours: number;
}): Promise<GenerationCandidateRow[]> {
  const cutoff = new Date(
    Date.now() - args.lookbackHours * 60 * 60 * 1000,
  ).toISOString();
  const limit = Math.max(
    100,
    Math.trunc(envNumber("STARGAZER_GENERATION_HEALTH_MAX_ROWS", 2000)),
  );

  const { data, error } = await args.client
    .from("stargazer_generation_candidates")
    .select("ai_run_id, created_at, acceptance_status, rejection_reason")
    .eq("task_type", "stargazer_question_generation")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as GenerationCandidateRow[]).map((row) => ({
    ai_run_id: row.ai_run_id,
    created_at: row.created_at,
    acceptance_status: row.acceptance_status,
    rejection_reason: row.rejection_reason,
  }));
}

function countHardNegatives(
  rows: CandidateTrendRow[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const kind = inferStargazerHardNegativeKind(row.rejection_reason);
    if (!kind) continue;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function summarizeGenerationHealth(args: {
  lookbackHours: number;
  rows: GenerationCandidateRow[];
}): StargazerGenerationHealthSummary {
  const rejectedRows = args.rows.filter(
    (row) => row.acceptance_status === "rejected",
  );
  const recentRunLimit = Math.max(
    1,
    Math.trunc(envNumber("STARGAZER_GENERATION_HEALTH_RECENT_RUN_LIMIT", 6)),
  );
  const rejectedKindMap = new Map<string, { count: number; lastSeenAt: string }>();
  for (const row of rejectedRows) {
    const kind = inferStargazerHardNegativeKind(row.rejection_reason);
    if (!kind) continue;
    const current = rejectedKindMap.get(kind);
    if (!current) {
      rejectedKindMap.set(kind, {
        count: 1,
        lastSeenAt: row.created_at,
      });
      continue;
    }
    current.count += 1;
    if (row.created_at > current.lastSeenAt) {
      current.lastSeenAt = row.created_at;
    }
  }

  const topRejectedKinds = Array.from(rejectedKindMap.entries())
    .map(([hardNegativeKind, summary]) => ({
      hardNegativeKind,
      count: summary.count,
      lastSeenAt: summary.lastSeenAt,
    }))
    .sort((left, right) =>
      left.count === right.count
        ? right.lastSeenAt.localeCompare(left.lastSeenAt)
        : right.count - left.count,
    );

  const runMap = new Map<
    string,
    {
      createdAt: string;
      candidateCount: number;
      acceptedCount: number;
      rejectedCount: number;
      hardNegativeKinds: Map<string, number>;
    }
  >();

  for (const row of args.rows) {
    if (!row.ai_run_id) continue;
    const current = runMap.get(row.ai_run_id) ?? {
      createdAt: row.created_at,
      candidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      hardNegativeKinds: new Map<string, number>(),
    };
    current.candidateCount += 1;
    if (row.acceptance_status === "accepted") {
      current.acceptedCount += 1;
    } else {
      current.rejectedCount += 1;
      const kind = inferStargazerHardNegativeKind(row.rejection_reason);
      if (kind) {
        current.hardNegativeKinds.set(kind, (current.hardNegativeKinds.get(kind) ?? 0) + 1);
      }
    }
    if (row.created_at > current.createdAt) {
      current.createdAt = row.created_at;
    }
    runMap.set(row.ai_run_id, current);
  }

  const recentRuns = Array.from(runMap.entries())
    .map(([aiRunId, summary]) => ({
      aiRunId,
      createdAt: summary.createdAt,
      candidateCount: summary.candidateCount,
      acceptedCount: summary.acceptedCount,
      rejectedCount: summary.rejectedCount,
      hardNegativeKinds: Array.from(summary.hardNegativeKinds.entries())
        .map(([hardNegativeKind, count]) => ({
          hardNegativeKind,
          count,
        }))
        .sort((left, right) => right.count - left.count),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, recentRunLimit);

  const fullyAcceptedRunCount = Array.from(runMap.values()).filter(
    (summary) => summary.candidateCount > 0 && summary.rejectedCount === 0,
  ).length;
  const promptMissingSummary = topRejectedKinds.find(
    (entry) => entry.hardNegativeKind === "validation_prompt_missing",
  );

  return {
    lookbackHours: args.lookbackHours,
    candidateRunCount: runMap.size,
    candidateCount: args.rows.length,
    acceptedCandidateCount: args.rows.filter(
      (row) => row.acceptance_status === "accepted",
    ).length,
    rejectedCandidateCount: rejectedRows.length,
    fullyAcceptedRunCount,
    fullyAcceptedRunRate: runMap.size > 0 ? fullyAcceptedRunCount / runMap.size : null,
    validationPromptMissingCount: promptMissingSummary?.count ?? 0,
    validationPromptMissingLastSeenAt: promptMissingSummary?.lastSeenAt ?? null,
    topRejectedKinds: topRejectedKinds.map(({ hardNegativeKind, count }) => ({
      hardNegativeKind,
      count,
    })),
    nextFailureKind:
      topRejectedKinds.find(
        (entry) => entry.hardNegativeKind !== "validation_prompt_missing",
      )?.hardNegativeKind ?? null,
    recentRuns,
  };
}

export async function recordStargazerStudentMonitorSnapshot(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  shadowHealth?: StargazerShadowHealthSummary;
  promotionReview?: StargazerShadowPromotionReview;
}): Promise<{ ok: boolean; snapshotId?: string; error?: string }> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    return { ok: false, error: "service_role_unavailable" };
  }

  try {
    const lookbackHours = Math.max(1, Math.trunc(args?.lookbackHours ?? 168));
    const shadowHealth =
      args?.shadowHealth ??
      (await getStargazerShadowHealthSummary({ client, lookbackHours }));
    const promotionReview =
      args?.promotionReview ??
      (await evaluateStargazerShadowPromotionCandidate({ client, lookbackHours }));
    const hardNegativeRows = await loadRecentHardNegativeRows({
      client,
      lookbackHours,
    });
    const hardNegativeCounts = countHardNegatives(hardNegativeRows);
    const taskPrimaryCounts = Object.fromEntries(
      shadowHealth.taskHealth.map((row) => [row.taskType, row.primaryRuns]),
    );
    const taskShadowCounts = Object.fromEntries(
      shadowHealth.taskHealth.map((row) => [row.taskType, row.shadowRuns]),
    );
    const passedCheckCount = promotionReview.checks.filter((check) => check.passed).length;
    const totalCheckCount = promotionReview.checks.length;

    const { data, error } = await client
      .from("stargazer_student_monitor_snapshots")
      .insert({
        snapshot_date: formatDateBucket(new Date().toISOString()),
        lookback_hours: lookbackHours,
        teacher_coverage_rate: shadowHealth.teacherCoverageRate,
        shadow_eval_coverage_rate: shadowHealth.shadowEvalCoverageRate,
        shadow_eval_avg_score: shadowHealth.shadowEvalAvgScore,
        shadow_eval_pass_rate: shadowHealth.shadowEvalPassRate,
        fallback_rate: shadowHealth.fallbackRate,
        promotion_eligible: promotionReview.eligible,
        passed_check_count: passedCheckCount,
        total_check_count: totalCheckCount,
        hard_negative_counts: hardNegativeCounts,
        task_primary_counts: taskPrimaryCounts,
        task_shadow_counts: taskShadowCounts,
        readiness_checks: promotionReview.checks,
        metadata: {
          candidate: promotionReview.candidate,
          rolloutPlan: promotionReview.rolloutPlan,
          shadowEvalByTask: shadowHealth.shadowEvalByTask,
          shadowEvalByPrimaryHardNegativeKind:
            shadowHealth.shadowEvalByPrimaryHardNegativeKind,
          generationHealth: shadowHealth.generationHealth,
        },
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      snapshotId: typeof data?.id === "string" ? data.id : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "snapshot_insert_failed",
    };
  }
}

export async function getStargazerShadowHealthSummary(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  modelKey?: string;
  modelVersion?: string;
}): Promise<StargazerShadowHealthSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(1, Math.trunc(args?.lookbackHours ?? 168));
  const runs = await loadRecentStargazerRuns(client, lookbackHours);
  const generationCandidateRows = await loadRecentGenerationCandidateRows({
    client,
    lookbackHours,
  });
  const generationHealth = summarizeGenerationHealth({
    lookbackHours,
    rows: generationCandidateRows,
  });
  const shadowRuns = runs.filter((row) =>
    isMatchingStargazerShadowRun({
      row,
      modelKey: args?.modelKey,
      modelVersion: args?.modelVersion,
    }),
  );
  const primaryRuns = runs.filter((row) => {
    const metadata = row.metadata;
    return (
      metadata?.studentTrack === "stargazer" &&
      metadata?.shadowPass !== true
    );
  });

  const shadowRunIds = shadowRuns.map((row) => row.id);
  const successfulShadowRuns = shadowRuns.filter((row) => row.success);
  const successfulShadowRunIds = successfulShadowRuns.map((row) => row.id);

  const [teacherRows, evalRows] = await Promise.all([
    (async () => {
      try {
        const [byAiRunId, bySourceRunId] = await Promise.all([
          selectByChunk<TeacherOutputRow>({
            client,
            table: "teacher_outputs",
            select: "ai_run_id, source_ai_run_id, created_at",
            column: "ai_run_id",
            values: shadowRunIds,
          }),
          selectByChunk<TeacherOutputRow>({
            client,
            table: "teacher_outputs",
            select: "ai_run_id, source_ai_run_id, created_at",
            column: "source_ai_run_id",
            values: shadowRunIds,
          }),
        ]);
        return [...byAiRunId, ...bySourceRunId];
      } catch (error) {
        if (!(error instanceof Error) || !error.message.toLowerCase().includes("column")) {
          throw error;
        }
        return selectByChunk<TeacherOutputRow>({
          client,
          table: "teacher_outputs",
          select: "ai_run_id, created_at",
          column: "ai_run_id",
          values: shadowRunIds,
        });
      }
    })(),
    selectByChunk<EvalRow>({
      client,
      table: "ai_eval_runs",
      select: "ai_run_id, eval_type, score, passed, created_at, metadata",
      column: "ai_run_id",
      values: shadowRunIds,
    }),
  ]);

  const shadowTeacherRunIds = new Set(
    teacherRows.map((row) => normalizeTeacherRunId(row)).filter(Boolean) as string[],
  );
  const shadowEvalRows = evalRows.filter(
    (row) => row.eval_type === "stargazer_shadow",
  );
  const shadowEvalRunIds = new Set(
    shadowEvalRows.map((row) => row.ai_run_id).filter(Boolean) as string[],
  );
  const shadowRunMap = new Map(shadowRuns.map((row) => [row.id, row]));
  const primaryAiRunIds = Array.from(
    new Set(
      shadowEvalRows
        .map((row) => {
          const evalMetadata = asObjectOrNull(row.metadata);
          const primaryFromEval = typeof evalMetadata?.primaryAiRunId === "string"
            ? evalMetadata.primaryAiRunId
            : null;
          if (primaryFromEval) return primaryFromEval;
          const shadowRun = row.ai_run_id ? shadowRunMap.get(row.ai_run_id) ?? null : null;
          return typeof shadowRun?.metadata?.shadowOfAiRunId === "string"
            ? shadowRun.metadata.shadowOfAiRunId
            : null;
        })
        .filter(Boolean) as string[],
    ),
  );
  const hardNegativeKindsByPrimaryRun = await loadCandidateHardNegativeKindsForRuns({
    client,
    aiRunIds: primaryAiRunIds,
  });

  const taskHealth = STARGAZER_STUDENT_TASK_TYPES.map((taskType) => {
    const taskPrimaryRuns = primaryRuns.filter((row) => row.task_type === taskType);
    const taskShadowRuns = successfulShadowRuns.filter((row) => row.task_type === taskType);
    const taskShadowRunIds = taskShadowRuns.map((row) => row.id);
    const teacherCoverageRate =
      taskShadowRunIds.length > 0
        ? taskShadowRunIds.filter((id) => shadowTeacherRunIds.has(id)).length /
          taskShadowRunIds.length
        : null;
    const evalCoverageRate =
      taskShadowRunIds.length > 0
        ? taskShadowRunIds.filter((id) => shadowEvalRunIds.has(id)).length /
          taskShadowRunIds.length
        : null;

    return {
      taskType,
      primaryRuns: taskPrimaryRuns.length,
      shadowRuns: taskShadowRuns.length,
      shadowTeacherCoverageRate: teacherCoverageRate,
      shadowEvalCoverageRate: evalCoverageRate,
    };
  });

  const shadowEvalByTask = STARGAZER_STUDENT_TASK_TYPES.map((taskType) => {
    const taskShadowRuns = successfulShadowRuns.filter((row) => row.task_type === taskType);
    const taskShadowRunIds = new Set(taskShadowRuns.map((row) => row.id));
    const taskEvalRows = shadowEvalRows.filter((row) => row.ai_run_id && taskShadowRunIds.has(row.ai_run_id));
    const passedCount = taskEvalRows.filter((row) => row.passed).length;
    return {
      taskType,
      shadowRunCount: taskShadowRuns.length,
      evalCount: taskEvalRows.length,
      passedCount,
      passRate: taskEvalRows.length > 0 ? passedCount / taskEvalRows.length : null,
      avgScore: average(taskEvalRows.map((row) => row.score)),
      missingEvalCount: Math.max(0, taskShadowRuns.length - taskEvalRows.length),
    };
  });

  const hardNegativeEvalBuckets = new Map<
    string,
    { evalCount: number; passedCount: number; scores: number[] }
  >();
  for (const row of shadowEvalRows) {
    const evalMetadata = asObjectOrNull(row.metadata);
    const primaryAiRunId =
      typeof evalMetadata?.primaryAiRunId === "string"
        ? evalMetadata.primaryAiRunId
        : row.ai_run_id
          ? typeof shadowRunMap.get(row.ai_run_id)?.metadata?.shadowOfAiRunId === "string"
            ? String(shadowRunMap.get(row.ai_run_id)?.metadata?.shadowOfAiRunId)
            : null
          : null;
    const kinds = primaryAiRunId
      ? Array.from(hardNegativeKindsByPrimaryRun.get(primaryAiRunId) ?? [])
      : [];
    const bucketKeys = kinds.length > 0 ? kinds : ["no_hard_negative"];

    for (const bucketKey of bucketKeys) {
      const bucket = hardNegativeEvalBuckets.get(bucketKey) ?? {
        evalCount: 0,
        passedCount: 0,
        scores: [],
      };
      bucket.evalCount += 1;
      if (row.passed) bucket.passedCount += 1;
      if (row.score != null) bucket.scores.push(row.score);
      hardNegativeEvalBuckets.set(bucketKey, bucket);
    }
  }

  const shadowEvalByPrimaryHardNegativeKind = Array.from(hardNegativeEvalBuckets.entries())
    .map(([hardNegativeKind, bucket]) => ({
      hardNegativeKind,
      evalCount: bucket.evalCount,
      passedCount: bucket.passedCount,
      passRate: bucket.evalCount > 0 ? bucket.passedCount / bucket.evalCount : null,
      avgScore: average(bucket.scores),
    }))
    .sort((left, right) =>
      left.passRate === right.passRate
        ? right.evalCount - left.evalCount
        : (left.passRate ?? -1) - (right.passRate ?? -1),
    );

  return {
    lookbackHours,
    primaryRuns: primaryRuns.length,
    shadowRuns: shadowRuns.length,
    shadowSuccessRuns: successfulShadowRuns.length,
    shadowFailureRuns: shadowRuns.filter((row) => !row.success).length,
    teacherCoverageRate:
      successfulShadowRunIds.length > 0
        ? successfulShadowRunIds.filter((id) => shadowTeacherRunIds.has(id)).length /
          successfulShadowRunIds.length
        : null,
    shadowEvalCoverageRate:
      successfulShadowRunIds.length > 0
        ? successfulShadowRunIds.filter((id) => shadowEvalRunIds.has(id)).length /
          successfulShadowRunIds.length
        : null,
    shadowEvalAvgScore: average(shadowEvalRows.map((row) => row.score)),
    shadowEvalPassRate:
      shadowEvalRows.length > 0
        ? shadowEvalRows.filter((row) => row.passed).length / shadowEvalRows.length
        : null,
    fallbackRate:
      shadowRuns.length > 0
        ? shadowRuns.filter((row) => row.fallback_used).length / shadowRuns.length
        : null,
    taskHealth,
    shadowEvalByTask,
    shadowEvalByPrimaryHardNegativeKind,
    generationHealth,
  };
}

export async function backfillStargazerTeacherOutputs(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  limit?: number;
}): Promise<StargazerTeacherBackfillSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(1, Math.trunc(args?.lookbackHours ?? 168));
  const requestedLimit = Math.max(
    1,
    Math.trunc(
      args?.limit ??
        envNumber(
          "STARGAZER_TEACHER_BACKFILL_LIMIT",
          getDefaultStargazerShadowPromotionThresholds().minLatestTeacherRows,
        ),
    ),
  );
  const runs = await loadRecentStargazerRuns(client, lookbackHours);
  const candidateRuns = runs.filter(
    (row) => row.success && !!row.prompt_text?.trim(),
  );
  const candidateRunIds = candidateRuns.map((row) => row.id);

  const teacherRows = await (async () => {
    try {
      const [byAiRunId, bySourceRunId] = await Promise.all([
        selectByChunk<TeacherOutputRow>({
          client,
          table: "teacher_outputs",
          select: "ai_run_id, source_ai_run_id, created_at",
          column: "ai_run_id",
          values: candidateRunIds,
        }),
        selectByChunk<TeacherOutputRow>({
          client,
          table: "teacher_outputs",
          select: "ai_run_id, source_ai_run_id, created_at",
          column: "source_ai_run_id",
          values: candidateRunIds,
        }),
      ]);
      return [...byAiRunId, ...bySourceRunId];
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("column")) {
        throw error;
      }
      return selectByChunk<TeacherOutputRow>({
        client,
        table: "teacher_outputs",
        select: "ai_run_id, created_at",
        column: "ai_run_id",
        values: candidateRunIds,
      });
    }
  })();

  const teacherRunIds = new Set(
    teacherRows.map((row) => normalizeTeacherRunId(row)).filter(Boolean) as string[],
  );
  const teacherBackfillConcurrency = Math.max(
    1,
    Math.min(
      8,
      Math.trunc(envNumber("STARGAZER_TEACHER_BACKFILL_CONCURRENCY", 3)),
    ),
  );
  const missingRuns = candidateRuns
    .filter((row) => !teacherRunIds.has(row.id))
    .sort((left, right) => {
      const priorityDiff =
        stargazerTaskPriority(left.task_type) - stargazerTaskPriority(right.task_type);
      if (priorityDiff !== 0) return priorityDiff;
      return left.created_at < right.created_at ? 1 : -1;
    })
    .slice(0, requestedLimit);

  let inserted = 0;
  let skipped = 0;
  const failures: Array<{ aiRunId: string; reason: string }> = [];

  for (const rows of chunkArray(missingRuns, teacherBackfillConcurrency)) {
    const results = await Promise.all(
      rows.map(async (row) => {
        try {
          const result = await ensureTeacherOutputForStoredRun({
            client,
            aiRunId: row.id,
            taskType: row.task_type,
            promptText: row.prompt_text ?? "",
            systemPrompt: row.system_prompt ?? null,
            studentProvider: row.provider ?? "gemini",
            studentModel: row.model ?? null,
            studentResponse: row.response_text ?? null,
            success: row.success,
            fallbackUsed: row.fallback_used,
            metadata: row.metadata ?? null,
          });

          return {
            aiRunId: row.id,
            inserted: result.inserted,
            skipped: !result.inserted,
            reason: result.reason ?? null,
          };
        } catch (error) {
          return {
            aiRunId: row.id,
            inserted: false,
            skipped: false,
            reason:
              error instanceof Error ? error.message : "teacher_backfill_failed",
          };
        }
      }),
    );

    for (const result of results) {
      if (result.inserted) {
        inserted += 1;
        continue;
      }
      if (result.skipped) {
        skipped += 1;
      }
      if (result.reason && result.reason !== "teacher_already_exists") {
        failures.push({
          aiRunId: result.aiRunId,
          reason: result.reason,
        });
      }
    }
  }

  return {
    lookbackHours,
    requestedLimit,
    scannedRuns: runs.length,
    candidateRuns: candidateRuns.length,
    missingRuns: missingRuns.length,
    inserted,
    skipped,
    failures,
  };
}

async function planStargazerShadowWarmupActions(args: {
  client: SupabaseClient;
  health: StargazerShadowHealthSummary;
}): Promise<GrowthAction[]> {
  const promotionThresholds = getDefaultStargazerShadowPromotionThresholds();
  const minimums = {
    generationRuns: Math.max(
      0,
      Math.trunc(
        envNumber(
          "STARGAZER_SHADOW_WARMUP_MIN_GENERATION_RUNS",
          promotionThresholds.minRunsByTask.stargazer_question_generation,
        ),
      ),
    ),
    expansionRuns: Math.max(
      0,
      Math.trunc(
        envNumber(
          "STARGAZER_SHADOW_WARMUP_MIN_EXPANSION_RUNS",
          promotionThresholds.minRunsByTask.stargazer_question_expansion,
        ),
      ),
    ),
    lensRuns: Math.max(
      0,
      Math.trunc(
        envNumber(
          "STARGAZER_SHADOW_WARMUP_MIN_LENS_RUNS",
          promotionThresholds.minRunsByTask.stargazer_lens_discovery,
        ),
      ),
    ),
  };
  const maxActions = Math.max(
    0,
    Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_MAX_ACTIONS", 4)),
  );
  const actions: GrowthAction[] = [];
  if (maxActions === 0) {
    return actions;
  }
  const analysis = await analyzePoolState(args.client);

  const expansionTask = args.health.taskHealth.find(
    (row) => row.taskType === "stargazer_question_expansion",
  );
  const lensTask = args.health.taskHealth.find(
    (row) => row.taskType === "stargazer_lens_discovery",
  );
  const generationTask = args.health.taskHealth.find(
    (row) => row.taskType === "stargazer_question_generation",
  );

  const { data: activeLensRows, error: lensError } = await args.client
    .from("stargazer_observation_lenses")
    .select("id, related_axes, probing_targets, status")
    .eq("status", "active")
    .limit(20);
  if (lensError) {
    throw new Error(lensError.message);
  }

  const preferredLens =
    ((activeLensRows ?? []) as Array<Record<string, unknown>>).find((row) =>
      Array.isArray(row.related_axes) && Array.isArray(row.probing_targets),
    ) ?? null;
  const preferredAxis = Array.isArray(preferredLens?.related_axes)
    ? String(preferredLens?.related_axes[0] ?? "")
    : "";
  const preferredProbe = Array.isArray(preferredLens?.probing_targets)
    ? String(preferredLens?.probing_targets[0] ?? "")
    : "";
  const fallbackAxis = Object.entries(analysis.axisCoverage).sort((left, right) =>
    left[1] - right[1],
  )[0]?.[0] ?? "introvert_vs_extrovert";
  const fallbackProbe =
    analysis.underservedProbeTypes[0] ?? analysis.dominantProbeTypes[0] ?? "reason";

  const deficits: Array<{
    taskType: StargazerStudentTaskType;
    remaining: number;
    scheduled: number;
    weight: number;
  }> = [
    {
      taskType: "stargazer_question_generation",
      remaining: Math.max(0, minimums.generationRuns - (generationTask?.shadowRuns ?? 0)),
      scheduled: 0,
      weight: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_GENERATION_WEIGHT", 3)),
      ),
    },
    {
      taskType: "stargazer_question_expansion",
      remaining: Math.max(0, minimums.expansionRuns - (expansionTask?.shadowRuns ?? 0)),
      scheduled: 0,
      weight: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_EXPANSION_WEIGHT", 2)),
      ),
    },
    {
      taskType: "stargazer_lens_discovery",
      remaining: Math.max(0, minimums.lensRuns - (lensTask?.shadowRuns ?? 0)),
      scheduled: 0,
      weight: Math.max(
        1,
        Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_LENS_WEIGHT", 1)),
      ),
    },
  ];

  while (actions.length < maxActions) {
    const nextTask = deficits
      .filter((entry) => entry.remaining > 0)
      .sort((left, right) =>
        left.scheduled / left.weight === right.scheduled / right.weight
          ? right.remaining - left.remaining
          : left.scheduled / left.weight - right.scheduled / right.weight,
      )[0];

    if (!nextTask) {
      break;
    }

    let nextAction: GrowthAction | null = null;
    if (nextTask.taskType === "stargazer_lens_discovery") {
      nextAction = {
        type: "discover_lens",
        focusHint: fallbackProbe,
      };
    } else if (nextTask.taskType === "stargazer_question_expansion") {
      if (preferredLens?.id) {
        nextAction = {
          type: "expand_probe",
          lensId: String(preferredLens.id),
          probeType: preferredProbe || fallbackProbe,
          depthScore: 2,
          axisId: preferredAxis || fallbackAxis,
        };
      } else {
        nextAction = {
          type: "diversify_observation",
          probeType: fallbackProbe,
        };
      }
    } else {
      nextAction = {
        type: "fill_pool_minimum",
        axisId: fallbackAxis,
        count: 2,
      };
    }

    if (!nextAction) break;
    actions.push(nextAction);
    nextTask.remaining -= 1;
    nextTask.scheduled += 1;
  }

  return actions.slice(0, maxActions);
}

export async function runStargazerShadowWarmup(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
}): Promise<StargazerShadowWarmupSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const before = await getStargazerShadowHealthSummary({
    client,
    lookbackHours: args?.lookbackHours,
  });
  const minimums = {
    generationRuns: Math.max(
      0,
      Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_MIN_GENERATION_RUNS", 0)),
    ),
    expansionRuns: Math.max(
      0,
      Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_MIN_EXPANSION_RUNS", 20)),
    ),
    lensRuns: Math.max(
      0,
      Math.trunc(envNumber("STARGAZER_SHADOW_WARMUP_MIN_LENS_RUNS", 20)),
    ),
  };

  if (!envBool("STARGAZER_SHADOW_WARMUP_ENABLED", true)) {
    return {
      enabled: false,
      reason: "warmup_disabled",
      minimums,
      before,
      plannedActions: [],
      executedActions: [],
      result: null,
    };
  }

  const plannedActions = await planStargazerShadowWarmupActions({
    client,
    health: before,
  });
  if (plannedActions.length === 0) {
    return {
      enabled: true,
      reason: "warmup_not_needed",
      minimums,
      before,
      plannedActions,
      executedActions: [],
      result: null,
    };
  }

  const result = await executeGrowth(plannedActions, client);
  return {
    enabled: true,
    reason: "warmup_executed",
    minimums,
    before,
    plannedActions,
    executedActions: plannedActions,
    result,
  };
}

function matchesStargazerShadowEntry(args: {
  row: ModelRegistryEntry;
  modelKey?: string;
  modelVersion?: string;
}): boolean {
  if (getEntryTrafficRole(args.row) !== "shadow") return false;
  const track = String(args.row.metadata?.studentTrack ?? "");
  if (track !== "stargazer" && args.row.modelKey !== STARGAZER_STUDENT_MODEL_KEY) {
    return false;
  }
  if (args.modelKey && args.row.modelKey !== args.modelKey) return false;
  if (args.modelVersion && args.row.modelVersion !== args.modelVersion) return false;
  return true;
}

async function resolveStargazerShadowCandidate(args?: {
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
    matchesStargazerShadowEntry({
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

export async function evaluateStargazerShadowPromotionCandidate(args?: {
  client?: SupabaseClient | null;
  modelKey?: string;
  modelVersion?: string;
  lookbackHours?: number;
  thresholdOverrides?: Partial<StargazerShadowPromotionThresholds>;
}): Promise<StargazerShadowPromotionReview> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const candidate = await resolveStargazerShadowCandidate({
    modelKey: args?.modelKey,
    modelVersion: args?.modelVersion,
  });

  const thresholds = {
    ...getDefaultStargazerShadowPromotionThresholds(),
    ...(args?.thresholdOverrides ?? {}),
  };
  const health = await getStargazerShadowHealthSummary({
    client,
    lookbackHours: args?.lookbackHours,
    modelKey: candidate.modelKey,
    modelVersion: candidate.modelVersion,
  });

  const { data: artifactRows, error: artifactError } = await client
    .from("ai_training_artifacts")
    .select("id, created_at, artifact_type, row_count, status, metadata")
    .in("artifact_type", [
      "stargazer_training_jsonl",
      "stargazer_teacher_jsonl",
    ])
    .order("created_at", { ascending: false })
    .limit(50);

  if (artifactError) {
    throw new Error(artifactError.message);
  }

  const latestTrainingArtifact = findLatestArtifact(
    ((artifactRows ?? []) as unknown as ArtifactRow[]).map((row) => ({
      ...row,
      metadata: asObjectOrNull(row.metadata),
    })),
    "stargazer_training_jsonl",
  );
  const latestTeacherArtifact = findLatestArtifact(
    ((artifactRows ?? []) as unknown as ArtifactRow[]).map((row) => ({
      ...row,
      metadata: asObjectOrNull(row.metadata),
    })),
    "stargazer_teacher_jsonl",
  );

  const latestArtifacts = {
    training: {
      id: latestTrainingArtifact?.id ?? null,
      createdAt: latestTrainingArtifact?.created_at ?? null,
      ageHours: computeArtifactAgeHours(latestTrainingArtifact?.created_at ?? null),
      rowCount: Math.max(0, latestTrainingArtifact?.row_count ?? 0),
      status: latestTrainingArtifact?.status ?? null,
    },
    teacher: {
      id: latestTeacherArtifact?.id ?? null,
      createdAt: latestTeacherArtifact?.created_at ?? null,
      ageHours: computeArtifactAgeHours(latestTeacherArtifact?.created_at ?? null),
      rowCount: Math.max(0, latestTeacherArtifact?.row_count ?? 0),
      status: latestTeacherArtifact?.status ?? null,
    },
  };

  const checks: StargazerShadowPromotionReview["checks"] = [
    {
      name: "min_shadow_runs",
      passed: health.shadowSuccessRuns >= thresholds.minShadowRuns,
      actual: health.shadowSuccessRuns,
      required: thresholds.minShadowRuns,
    },
    ...STARGAZER_STUDENT_TASK_TYPES.map((taskType) => {
      const task = health.taskHealth.find((row) => row.taskType === taskType);
      const required = thresholds.minRunsByTask[taskType];
      return {
        name: `min_runs_${taskType}`,
        passed: (task?.shadowRuns ?? 0) >= required,
        actual: task?.shadowRuns ?? 0,
        required,
      };
    }),
    {
      name: "min_shadow_eval_avg_score",
      passed:
        health.shadowEvalAvgScore != null &&
        health.shadowEvalAvgScore >= thresholds.minShadowEvalAvgScore,
      actual: health.shadowEvalAvgScore,
      required: thresholds.minShadowEvalAvgScore,
    },
    {
      name: "min_shadow_eval_pass_rate",
      passed:
        health.shadowEvalPassRate != null &&
        health.shadowEvalPassRate >= thresholds.minShadowEvalPassRate,
      actual: health.shadowEvalPassRate,
      required: thresholds.minShadowEvalPassRate,
    },
    {
      name: "max_shadow_fallback_rate",
      passed:
        health.fallbackRate != null &&
        health.fallbackRate <= thresholds.maxShadowFallbackRate,
      actual: health.fallbackRate,
      required: thresholds.maxShadowFallbackRate,
    },
    {
      name: "min_teacher_coverage_rate",
      passed:
        health.teacherCoverageRate != null &&
        health.teacherCoverageRate >= thresholds.minTeacherCoverageRate,
      actual: health.teacherCoverageRate,
      required: thresholds.minTeacherCoverageRate,
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
    rolloutPlan: {
      targetTrafficRole: "challenger",
      targetTrafficWeight: thresholds.challengerTrafficWeight,
    },
  };
}

export async function promoteStargazerShadowToChallenger(args?: {
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
    const candidate = await resolveStargazerShadowCandidate({
      modelKey: args?.modelKey,
      modelVersion: args?.modelVersion,
    });
    const trafficWeight = Math.max(
      1,
      Math.min(
        100,
        Math.trunc(
          args?.trafficWeight ??
            getDefaultStargazerShadowPromotionThresholds().challengerTrafficWeight,
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
          `promoted to challenger for stargazer rollout at ${new Date().toISOString()}`,
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

export async function listRecentStargazerArtifactSampleChecks(args?: {
  client?: SupabaseClient | null;
  limit?: number;
}): Promise<StargazerArtifactSampleCheckResult[]> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const limit = Math.max(1, Math.trunc(args?.limit ?? 10));
  const { data, error } = await client
    .from("ai_artifact_sample_checks")
    .select("id, artifact_type, artifact_id, row_count, sample_count, status, issues, sample_rows, metadata")
    .eq("track", "stargazer")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : null,
    artifactType:
      row.artifact_type === "stargazer_teacher_jsonl"
        ? "stargazer_teacher_jsonl"
        : "stargazer_training_jsonl",
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

async function loadRecentMonitorSnapshots(args: {
  client: SupabaseClient;
  lookbackDays: number;
}): Promise<MonitorSnapshotRow[]> {
  const cutoff = new Date(
    Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await args.client
    .from("stargazer_student_monitor_snapshots")
    .select(
      "id, created_at, snapshot_date, lookback_hours, teacher_coverage_rate, shadow_eval_coverage_rate, shadow_eval_avg_score, shadow_eval_pass_rate, fallback_rate, promotion_eligible, passed_check_count, total_check_count, hard_negative_counts, task_primary_counts, task_shadow_counts, readiness_checks, metadata",
    )
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as MonitorSnapshotRow[]).map((row) => ({
    ...row,
    hard_negative_counts: asObjectOrNull(row.hard_negative_counts),
    task_primary_counts: asObjectOrNull(row.task_primary_counts),
    task_shadow_counts: asObjectOrNull(row.task_shadow_counts),
    metadata: asObjectOrNull(row.metadata),
  }));
}

function aggregateTrendPoints(args: {
  runs: AIRunRow[];
  shadowTeacherRunIds: Set<string>;
  lookbackDays: number;
}): StargazerStudentTrendPoint[] {
  const points = new Map<string, StargazerStudentTrendPoint>();

  for (let offset = args.lookbackDays - 1; offset >= 0; offset -= 1) {
    const day = formatDateBucket(
      new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString(),
    );
    points.set(day, {
      bucket: day,
      hardNegativeCounts: {},
      hardNegativeTotal: 0,
      generationHardNegativeCounts: {},
      generationHardNegativeTotal: 0,
      generationPromptMissingCount: 0,
      taskShadowRuns: emptyTaskCounter(),
      taskPrimaryRuns: emptyTaskCounter(),
      teacherCoverageRate: null,
      promotionEligible: null,
      passedCheckCount: null,
      totalCheckCount: null,
    });
  }

  const shadowRunIdsByDay = new Map<string, string[]>();
  for (const row of args.runs) {
    const bucket = formatDateBucket(row.created_at);
    const point = points.get(bucket);
    if (!point) continue;

    const metadata = row.metadata;
    const isShadow = metadata?.studentTrack === "stargazer" && metadata?.shadowPass === true;
    const isPrimary = metadata?.studentTrack === "stargazer" && metadata?.shadowPass !== true;
    if (isShadow && STARGAZER_STUDENT_TASK_TYPES.includes(row.task_type as StargazerStudentTaskType)) {
      point.taskShadowRuns[row.task_type as StargazerStudentTaskType] += 1;
      if (row.success) {
        const list = shadowRunIdsByDay.get(bucket) ?? [];
        list.push(row.id);
        shadowRunIdsByDay.set(bucket, list);
      }
    }
    if (isPrimary && STARGAZER_STUDENT_TASK_TYPES.includes(row.task_type as StargazerStudentTaskType)) {
      point.taskPrimaryRuns[row.task_type as StargazerStudentTaskType] += 1;
    }
  }

  for (const [bucket, runIds] of shadowRunIdsByDay.entries()) {
    const point = points.get(bucket);
    if (!point || runIds.length === 0) continue;
    point.teacherCoverageRate =
      runIds.filter((runId) => args.shadowTeacherRunIds.has(runId)).length / runIds.length;
  }

  return Array.from(points.values());
}

function mergeSnapshotTrendPoints(args: {
  points: StargazerStudentTrendPoint[];
  snapshots: MonitorSnapshotRow[];
}): StargazerStudentTrendPoint[] {
  const byBucket = new Map(args.points.map((point) => [point.bucket, point]));

  for (const snapshot of args.snapshots) {
    const bucket = snapshot.snapshot_date || formatDateBucket(snapshot.created_at);
    const point =
      byBucket.get(bucket) ??
      ({
        bucket,
        hardNegativeCounts: {},
        hardNegativeTotal: 0,
        generationHardNegativeCounts: {},
        generationHardNegativeTotal: 0,
        generationPromptMissingCount: 0,
        taskShadowRuns: emptyTaskCounter(),
        taskPrimaryRuns: emptyTaskCounter(),
        teacherCoverageRate: null,
        promotionEligible: null,
        passedCheckCount: null,
        totalCheckCount: null,
      } satisfies StargazerStudentTrendPoint);

    if (!byBucket.has(bucket)) {
      point.hardNegativeCounts = normalizeTrendCounts(snapshot.hard_negative_counts);
      point.hardNegativeTotal = Object.values(point.hardNegativeCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      point.taskShadowRuns = normalizeSnapshotTaskCounts(snapshot.task_shadow_counts);
      point.taskPrimaryRuns = normalizeSnapshotTaskCounts(snapshot.task_primary_counts);
    }
    if (point.teacherCoverageRate == null) {
      point.teacherCoverageRate = toNumberOrNull(snapshot.teacher_coverage_rate);
    }
    point.promotionEligible = snapshot.promotion_eligible;
    point.passedCheckCount = Math.max(0, Math.trunc(snapshot.passed_check_count ?? 0));
    point.totalCheckCount = Math.max(0, Math.trunc(snapshot.total_check_count ?? 0));

    byBucket.set(bucket, point);
  }

  return Array.from(byBucket.values()).sort((left, right) =>
    left.bucket < right.bucket ? -1 : 1,
  );
}

export async function getStargazerStudentProgressTrends(args?: {
  client?: SupabaseClient | null;
  lookbackDays?: number;
}): Promise<StargazerStudentProgressTrends> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackDays = Math.max(1, Math.trunc(args?.lookbackDays ?? 14));
  const lookbackHours = lookbackDays * 24;
  const runs = await loadRecentStargazerRuns(client, lookbackHours);
  const runIds = runs.map((row) => row.id);
  const teacherRows = await (async () => {
    try {
      const [byAiRunId, bySourceRunId] = await Promise.all([
        selectByChunk<TeacherOutputRow>({
          client,
          table: "teacher_outputs",
          select: "ai_run_id, source_ai_run_id, created_at",
          column: "ai_run_id",
          values: runIds,
        }),
        selectByChunk<TeacherOutputRow>({
          client,
          table: "teacher_outputs",
          select: "ai_run_id, source_ai_run_id, created_at",
          column: "source_ai_run_id",
          values: runIds,
        }),
      ]);
      return [...byAiRunId, ...bySourceRunId];
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("column")) {
        throw error;
      }
      return selectByChunk<TeacherOutputRow>({
        client,
        table: "teacher_outputs",
        select: "ai_run_id, created_at",
        column: "ai_run_id",
        values: runIds,
      });
    }
  })();
  const shadowTeacherRunIds = new Set(
    teacherRows.map((row) => normalizeTeacherRunId(row)).filter(Boolean) as string[],
  );

  const basePoints = aggregateTrendPoints({
    runs,
    shadowTeacherRunIds,
    lookbackDays,
  });
  const hardNegativeRows = await loadRecentHardNegativeRows({
    client,
    lookbackHours,
  });
  const generationCandidateRows = await loadRecentGenerationCandidateRows({
    client,
    lookbackHours,
  });
  for (const row of hardNegativeRows) {
    const bucket = formatDateBucket(row.created_at);
    const point = basePoints.find((entry) => entry.bucket === bucket);
    if (!point) continue;
    const kind = inferStargazerHardNegativeKind(row.rejection_reason);
    if (!kind) continue;
    point.hardNegativeCounts[kind] = (point.hardNegativeCounts[kind] ?? 0) + 1;
    point.hardNegativeTotal += 1;
  }
  for (const row of generationCandidateRows) {
    if (row.acceptance_status !== "rejected") continue;
    const bucket = formatDateBucket(row.created_at);
    const point = basePoints.find((entry) => entry.bucket === bucket);
    if (!point) continue;
    const kind = inferStargazerHardNegativeKind(row.rejection_reason);
    if (!kind) continue;
    point.generationHardNegativeCounts[kind] =
      (point.generationHardNegativeCounts[kind] ?? 0) + 1;
    point.generationHardNegativeTotal += 1;
    if (kind === "validation_prompt_missing") {
      point.generationPromptMissingCount += 1;
    }
  }

  const snapshots = await loadRecentMonitorSnapshots({
    client,
    lookbackDays,
  }).catch(() => []);
  const points = mergeSnapshotTrendPoints({
    points: basePoints,
    snapshots,
  });

  const latestReview = await evaluateStargazerShadowPromotionCandidate({
    client,
    lookbackHours: Math.max(168, lookbackHours),
  });
  const firstPassedMap = new Map<string, string>();
  for (const snapshot of snapshots) {
    for (const check of normalizeSnapshotChecks(snapshot.readiness_checks)) {
      if (check.passed && !firstPassedMap.has(check.name)) {
        firstPassedMap.set(check.name, snapshot.created_at);
      }
    }
  }

  const checks = latestReview.checks.map((check) => ({
    name: check.name,
    currentlyPassed: check.passed,
    actual: check.actual,
    required: check.required,
    firstPassedAt: firstPassedMap.get(check.name) ?? null,
    remainingToPass: readinessRemainingToPass({
      name: check.name,
      actual: check.actual,
      required: check.required,
    }),
    unit: readinessCheckUnit(check.name),
  }));

  return {
    lookbackDays,
    points,
    latest: points.length > 0 ? points[points.length - 1] : null,
    readinessProgress: {
      eligible: latestReview.eligible,
      passedCount: checks.filter((check) => check.currentlyPassed).length,
      totalCount: checks.length,
      checks,
      nextChecks: checks.filter((check) => !check.currentlyPassed),
    },
  };
}

type PreparedTeacherArtifactWindow = {
  lookbackHours: number;
  limit: number;
  targetRows: number;
  exportResult: Awaited<ReturnType<typeof exportStargazerTeacherDataset>>;
  backfill: StargazerTeacherBackfillSummary | null;
};

async function prepareTeacherArtifactWindow(args: {
  client: SupabaseClient;
  lookbackHours: number;
  limit: number;
  targetRows: number;
}): Promise<PreparedTeacherArtifactWindow> {
  const maxLookbackHours = Math.max(
    args.lookbackHours,
    Math.trunc(
      envNumber("STARGAZER_TEACHER_ARTIFACT_MAX_LOOKBACK_HOURS", 24 * 30),
    ),
  );
  const maxLimit = Math.max(
    args.limit,
    Math.trunc(envNumber("STARGAZER_TEACHER_ARTIFACT_MAX_LIMIT", 5000)),
  );

  let resolvedLookbackHours = args.lookbackHours;
  let resolvedLimit = args.limit;
  let exportResult = await exportStargazerTeacherDataset({
    lookbackHours: resolvedLookbackHours,
    limit: resolvedLimit,
    onlySuccessful: false,
    taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
  });

  while (
    exportResult.rows.length < args.targetRows &&
    resolvedLookbackHours < maxLookbackHours
  ) {
    resolvedLookbackHours = Math.min(maxLookbackHours, resolvedLookbackHours * 2);
    resolvedLimit = Math.min(
      maxLimit,
      Math.max(resolvedLimit * 2, args.targetRows * 2),
    );
    exportResult = await exportStargazerTeacherDataset({
      lookbackHours: resolvedLookbackHours,
      limit: resolvedLimit,
      onlySuccessful: false,
      taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
    });
  }

  let backfill: StargazerTeacherBackfillSummary | null = null;
  if (exportResult.rows.length < args.targetRows) {
    backfill = await backfillStargazerTeacherOutputs({
      client: args.client,
      lookbackHours: resolvedLookbackHours,
      limit: Math.min(
        Math.max(args.targetRows * 2, 48),
        Math.trunc(envNumber("STARGAZER_TEACHER_ARTIFACT_BACKFILL_LIMIT", 240)),
      ),
    });
    exportResult = await exportStargazerTeacherDataset({
      lookbackHours: resolvedLookbackHours,
      limit: resolvedLimit,
      onlySuccessful: false,
      taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
    });
  }

  return {
    lookbackHours: resolvedLookbackHours,
    limit: resolvedLimit,
    targetRows: args.targetRows,
    exportResult,
    backfill,
  };
}

export async function runStargazerArtifactSampleChecks(args?: {
  client?: SupabaseClient | null;
  lookbackHours?: number;
  sampleSize?: number;
  limit?: number;
}): Promise<StargazerArtifactSampleCheckSummary> {
  const client = args?.client ?? getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const lookbackHours = Math.max(1, Math.trunc(args?.lookbackHours ?? 72));
  const sampleSize = Math.max(1, Math.trunc(args?.sampleSize ?? 3));
  const limit = Math.max(20, Math.trunc(args?.limit ?? 300));
  const minRows = Math.max(1, Math.trunc(envNumber("STARGAZER_SAMPLE_CHECK_MIN_ROWS", 10)));
  const teacherTargetRows = Math.max(
    minRows,
    getDefaultStargazerShadowPromotionThresholds().minLatestTeacherRows,
  );
  const minTimesShownForScore = Math.max(
    1,
    Math.trunc(envNumber("STARGAZER_RUN_SCORE_MIN_TIMES_SHOWN", 5)),
  );

  const [trainingExport, preparedTeacherWindow] = await Promise.all([
    exportStargazerTrainingDataset({
      lookbackHours,
      limit,
      onlySuccessful: false,
      taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
    }),
    prepareTeacherArtifactWindow({
      client,
      lookbackHours,
      limit,
      targetRows: teacherTargetRows,
    }),
  ]);
  const teacherExport = preparedTeacherWindow.exportResult;

  const [trainingArtifact, teacherArtifact] = await Promise.all([
    generateTrainingArtifact({
      lookbackHours,
      limit,
      onlySuccessful: false,
      taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
      artifactType: "stargazer_training_jsonl",
      notes: `stargazer sample check ${new Date().toISOString()}`,
    }),
    generateTrainingArtifact({
      lookbackHours: preparedTeacherWindow.lookbackHours,
      limit: preparedTeacherWindow.limit,
      onlySuccessful: false,
      taskTypes: [...STARGAZER_STUDENT_TASK_TYPES],
      artifactType: "stargazer_teacher_jsonl",
      notes: `stargazer sample check ${new Date().toISOString()}`,
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

  const trainingSampleRows = buildTrainingSampleRows(trainingRows, sampleSize);
  const teacherSampleRows = teacherRows
    .slice(0, sampleSize)
    .map(toTeacherSampleRow);

  if (trainingRows.length === 0) {
    trainingIssues.push("no_training_rows");
  }
  if (trainingRows.length > 0 && trainingRows.length < minRows) {
    trainingIssues.push("training_row_count_below_minimum");
  }
  if (
    trainingRows.some((row) =>
      (row.runOutcomeSummary?.timesShown ?? 0) < minTimesShownForScore &&
      row.runOutcomeSummary?.downstreamScore != null,
    )
  ) {
    trainingIssues.push("cold_start_run_score_not_null");
  }
  if (
    trainingRows.slice(0, sampleSize).some((row) => !row.teacherOutput.response)
  ) {
    trainingIssues.push("sample_training_rows_missing_teacher_output");
  }
  if (!trainingRows.some((row) => row.hardNegative.isHardNegative)) {
    trainingIssues.push("no_hard_negative_rows_in_window");
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
    trainingIssues.includes("cold_start_run_score_not_null")
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
      artifactType: "stargazer_training_jsonl",
      artifactId: trainingArtifact.summary?.id ?? null,
      rowCount: trainingRows.length,
      sampleRows: trainingSampleRows,
      status: trainingStatus,
      issues: trainingIssues,
      metadata: {
        lookbackHours,
        totalCandidatesScanned: trainingExport.totalCandidatesScanned,
      },
    }),
    insertSampleCheckRow({
      client,
      artifactType: "stargazer_teacher_jsonl",
      artifactId: teacherArtifact.summary?.id ?? null,
      rowCount: teacherRows.length,
      sampleRows: teacherSampleRows,
      status: teacherStatus,
      issues: teacherIssues,
      metadata: {
        lookbackHours,
        resolvedLookbackHours: preparedTeacherWindow.lookbackHours,
        targetRows: preparedTeacherWindow.targetRows,
        totalRunsScanned: teacherExport.totalRunsScanned,
        teacherBackfill: preparedTeacherWindow.backfill,
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
        artifactType: "stargazer_training_jsonl",
        artifactId: trainingArtifact.summary?.id ?? null,
        status: trainingStatus,
        rowCount: trainingRows.length,
        sampleCount: trainingSampleRows.length,
        issues: trainingIssues,
        sampleRows: trainingSampleRows,
      },
      {
        id: teacherCheckId,
        artifactType: "stargazer_teacher_jsonl",
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
