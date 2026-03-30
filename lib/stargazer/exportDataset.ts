import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIServiceClient } from "@/lib/ai/db";
import type { DatasetExportFilters } from "@/lib/ai/exportDataset";
import { inferStargazerHardNegativeKind } from "./trainingAssets";
import { STARGAZER_STUDENT_TASK_TYPES } from "./studentTrack";

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
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
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

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("could not find the column")
  );
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

type CandidateRow = {
  id: string;
  created_at: string;
  batch_id: string | null;
  ai_run_id: string | null;
  task_type: string;
  source_stage: string;
  entity_type: "question" | "lens";
  axis_id: string | null;
  lens_id: string | null;
  candidate_index: number;
  request_context: Record<string, unknown> | null;
  candidate_json: Record<string, unknown> | null;
  normalized_output: Record<string, unknown> | null;
  acceptance_status: "accepted" | "rejected";
  accepted_entity_id: string | null;
  rejection_reason: string | null;
  downstream_metrics: Record<string, unknown> | null;
};

type AIRunRow = {
  id: string;
  created_at: string;
  task_type: string;
  provider: string;
  model: string | null;
  prompt_text: string;
  system_prompt: string | null;
  response_text: string | null;
  structured_json: Record<string, unknown> | unknown[] | null;
  success: boolean;
  fallback_used: boolean | null;
  metadata: Record<string, unknown> | null;
};

type TeacherOutputRow = {
  ai_run_id: string | null;
  source_ai_run_id: string | null;
  teacher_response: string | null;
  teacher_response_text: string | null;
  teacher_provider: string;
  teacher_model: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type EvalRow = {
  ai_run_id: string;
  eval_type: string;
  score: number | null;
  passed: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type QuestionPoolRow = {
  question_key: string;
  variant_json: Record<string, unknown> | null;
  axis_id: string;
  primary_lens_id: string | null;
  depth_score: number | null;
  probe_type: string | null;
  quality_score: number | null;
  quality_metrics: Record<string, unknown> | null;
  times_shown: number | null;
  times_answered: number | null;
  avg_response_time_ms: number | null;
  score_variance: number | null;
  parent_question_keys: string[];
};

type LensRow = {
  id: string;
  name_ja: string;
  description: string;
  status: string;
  discovery_source: string | null;
  questions_generated: number | null;
  avg_quality: number | null;
  quality_metrics: Record<string, unknown> | null;
  related_axes: string[];
  probing_targets: string[];
};

type ShownRow = {
  user_id: string;
  question_key: string;
  shown_at: string;
  answered: boolean;
  score: number | null;
  response_time_ms: number | null;
  created_at: string;
};

export type StargazerQuestionDownstreamMetrics = {
  entityType: "question";
  acceptedEntityId: string;
  axisId: string | null;
  lensId: string | null;
  depthScore: number | null;
  probeType: string | null;
  timesShown: number;
  timesAnswered: number;
  answerRate: number | null;
  skipRate: number | null;
  avgResponseTimeMs: number | null;
  avgScore: number | null;
  followupSuccessCount: number;
  followupRate: number | null;
  qualityScore: number | null;
  qualityMetrics: Record<string, unknown> | null;
  shownHistory: Array<{
    userId: string;
    shownAt: string;
    answered: boolean;
    score: number | null;
    responseTimeMs: number | null;
  }>;
};

export type StargazerLensDownstreamMetrics = {
  entityType: "lens";
  acceptedEntityId: string;
  status: string;
  relatedAxes: string[];
  probingTargets: string[];
  questionCount: number;
  shownQuestionCount: number;
  timesShown: number;
  timesAnswered: number;
  answerRate: number | null;
  skipRate: number | null;
  avgResponseTimeMs: number | null;
  avgScore: number | null;
  followupSuccessCount: number;
  followupRate: number | null;
  avgQualityScore: number | null;
  qualityMetrics: Record<string, unknown> | null;
};

export type StargazerRunOutcomeSummary = {
  totalCandidates: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  adoptionRate: number | null;
  observedAcceptedCount: number;
  servedAcceptedRate: number | null;
  timesShown: number;
  timesAnswered: number;
  answerRate: number | null;
  skipRate: number | null;
  followupSuccessCount: number;
  followupRate: number | null;
  avgQualityScore: number | null;
  downstreamScore: number | null;
};

export type StargazerHardNegativeLabel = {
  isHardNegative: boolean;
  kind: string | null;
  reasons: string[];
};

export type StargazerTrainingDatasetRow = {
  id: string;
  createdAt: string;
  batchId: string | null;
  aiRunId: string | null;
  taskType: string;
  sourceStage: string;
  entityType: "question" | "lens";
  candidateIndex: number;
  axisId: string | null;
  lensId: string | null;
  acceptanceStatus: "accepted" | "rejected";
  acceptedEntityId: string | null;
  rejectionReason: string | null;
  requestContext: Record<string, unknown> | null;
  candidateJson: Record<string, unknown> | null;
  normalizedOutput: Record<string, unknown> | null;
  aiRun: {
    id: string | null;
    createdAt: string | null;
    provider: string | null;
    model: string | null;
    promptText: string | null;
    systemPrompt: string | null;
    responseText: string | null;
    structuredJson: Record<string, unknown> | unknown[] | null;
    metadata: Record<string, unknown> | null;
    success: boolean | null;
    fallbackUsed: boolean | null;
  };
  teacherOutput: {
    response: string | null;
    provider: string | null;
    model: string | null;
    createdAt: string | null;
    metadata: Record<string, unknown> | null;
  };
  evals: Array<{
    evalType: string;
    score: number | null;
    passed: boolean;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  acceptedEntity: Record<string, unknown> | null;
  downstreamMetrics:
    | StargazerQuestionDownstreamMetrics
    | StargazerLensDownstreamMetrics
    | null;
  storedDownstreamMetrics: Record<string, unknown> | null;
  runOutcomeSummary: StargazerRunOutcomeSummary | null;
  hardNegative: StargazerHardNegativeLabel;
};

export type StargazerTeacherDatasetRow = {
  id: string;
  createdAt: string;
  aiRunId: string;
  taskType: string;
  provider: string;
  model: string;
  promptText: string;
  systemPrompt: string | null;
  responseText: string | null;
  teacherResponse: string | null;
  acceptedEntityIds: string[];
  rejectedCount: number;
  outcomeSummary: StargazerRunOutcomeSummary | null;
  hardNegativeCount: number;
  hardNegativeKinds: string[];
  evals: Array<{
    evalType: string;
    score: number | null;
    passed: boolean;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  metadata: Record<string, unknown> | null;
};

export type StargazerTrainingExportResult = {
  enabled: boolean;
  totalCandidatesScanned: number;
  rows: StargazerTrainingDatasetRow[];
};

export type StargazerTeacherExportResult = {
  enabled: boolean;
  totalRunsScanned: number;
  rows: StargazerTeacherDatasetRow[];
};

function normalizeTeacherRunId(row: TeacherOutputRow): string | null {
  return row.ai_run_id ?? row.source_ai_run_id ?? null;
}

function normalizeTeacherResponse(row: TeacherOutputRow): string | null {
  const response = (row.teacher_response ?? row.teacher_response_text ?? "").trim();
  return response ? response : null;
}


function normalizeRunOutcomeSummary(
  summary: StargazerRunOutcomeSummary | null,
): StargazerRunOutcomeSummary | null {
  if (!summary) return null;

  const minTimesShownForScore = envNumber(
    "STARGAZER_RUN_SCORE_MIN_TIMES_SHOWN",
    5,
  );

  if (
    summary.downstreamScore != null &&
    summary.timesShown < minTimesShownForScore
  ) {
    return {
      ...summary,
      downstreamScore: null,
    };
  }

  return summary;
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

async function loadCandidateRows(
  client: SupabaseClient,
  filters: DatasetExportFilters,
  options?: { aiRunIds?: string[] },
): Promise<CandidateRow[]> {
  const limit = filters.limit ?? 500;
  let query = client
    .from("stargazer_generation_candidates")
    .select(
      "id, created_at, batch_id, ai_run_id, task_type, source_stage, entity_type, axis_id, lens_id, candidate_index, request_context, candidate_json, normalized_output, acceptance_status, accepted_entity_id, rejection_reason, downstream_metrics",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.taskTypes && filters.taskTypes.length > 0) {
    query = query.in("task_type", filters.taskTypes);
  }

  if (filters.lookbackHours) {
    const cutoff = new Date(
      Date.now() - filters.lookbackHours * 60 * 60 * 1000,
    ).toISOString();
    query = query.gte("created_at", cutoff);
  }

  if (filters.createdAfter) {
    query = query.gte("created_at", filters.createdAfter);
  }

  if (filters.createdBefore) {
    query = query.lte("created_at", filters.createdBefore);
  }

  if (options?.aiRunIds && options.aiRunIds.length > 0) {
    query = query.in("ai_run_id", options.aiRunIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (((data ?? []) as unknown) as CandidateRow[]).map((row) => ({
    ...row,
    request_context: asObjectOrNull(row.request_context),
    candidate_json: asObjectOrNull(row.candidate_json),
    normalized_output: asObjectOrNull(row.normalized_output),
    downstream_metrics: asObjectOrNull(row.downstream_metrics),
  }));
}

async function loadAiRunsByFilters(
  client: SupabaseClient,
  filters: DatasetExportFilters,
  options?: { limitOverride?: number },
): Promise<AIRunRow[]> {
  const limit = Math.max(1, options?.limitOverride ?? filters.limit ?? 500);
  let query = client
    .from("ai_runs")
    .select(
      "id, created_at, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, success, fallback_used, metadata",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.onlySuccessful !== false) {
    query = query.eq("success", true);
  }

  const taskTypes =
    filters.taskTypes && filters.taskTypes.length > 0
      ? filters.taskTypes
      : [...STARGAZER_STUDENT_TASK_TYPES];
  query = query.in("task_type", taskTypes);

  if (filters.lookbackHours) {
    const cutoff = new Date(
      Date.now() - filters.lookbackHours * 60 * 60 * 1000,
    ).toISOString();
    query = query.gte("created_at", cutoff);
  }

  if (filters.createdAfter) {
    query = query.gte("created_at", filters.createdAfter);
  }

  if (filters.createdBefore) {
    query = query.lte("created_at", filters.createdBefore);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (((data ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
}

async function loadTeacherMapByRunIds(
  client: SupabaseClient,
  runIds: string[],
): Promise<Map<string, TeacherOutputRow>> {
  if (runIds.length === 0) return new Map();

  try {
    const teachersByAiRunId = await selectByChunk<TeacherOutputRow>({
      client,
      table: "teacher_outputs",
      select:
        "ai_run_id, source_ai_run_id, teacher_response, teacher_response_text, teacher_provider, teacher_model, created_at, metadata",
      column: "ai_run_id",
      values: runIds,
    });
    const teachersBySourceRunId = await selectByChunk<TeacherOutputRow>({
      client,
      table: "teacher_outputs",
      select:
        "ai_run_id, source_ai_run_id, teacher_response, teacher_response_text, teacher_provider, teacher_model, created_at, metadata",
      column: "source_ai_run_id",
      values: runIds,
    });

    return new Map(
      [...teachersByAiRunId, ...teachersBySourceRunId]
        .map((row) => {
          const runId = normalizeTeacherRunId(row);
          if (!runId) return null;
          return [
            runId,
            {
              ...row,
              metadata: asObjectOrNull(row.metadata),
            },
          ] as const;
        })
        .filter(Boolean) as Array<readonly [string, TeacherOutputRow]>,
    );
  } catch (error) {
    if (!(error instanceof Error) || !isMissingColumnError(error.message)) {
      throw error;
    }

    try {
      const teachers = await selectByChunk<TeacherOutputRow>({
        client,
        table: "teacher_outputs",
        select:
          "ai_run_id, teacher_response, teacher_provider, teacher_model, created_at, metadata",
        column: "ai_run_id",
        values: runIds,
      });
      return new Map(
        teachers
          .map((row) => {
            const runId = normalizeTeacherRunId(row);
            if (!runId) return null;
            return [
              runId,
              {
                ...row,
                source_ai_run_id: null,
                teacher_response_text: null,
                metadata: asObjectOrNull(row.metadata),
              },
            ] as const;
          })
          .filter(Boolean) as Array<readonly [string, TeacherOutputRow]>,
      );
    } catch (fallbackError) {
      if (
        !(fallbackError instanceof Error) ||
        !isMissingColumnError(fallbackError.message)
      ) {
        throw fallbackError;
      }
      console.warn(
        "[stargazer/exportDataset] teacher_outputs schema not ready, continuing without teacher rows:",
        fallbackError.message,
      );
      return new Map();
    }
  }
}

async function loadEvalMapByRunIds(
  client: SupabaseClient,
  runIds: string[],
): Promise<Map<string, EvalRow[]>> {
  if (runIds.length === 0) return new Map();

  const evalMap = new Map<string, EvalRow[]>();
  try {
    const evalRows = await selectByChunk<EvalRow>({
      client,
      table: "ai_eval_runs",
      select: "ai_run_id, eval_type, score, passed, created_at, metadata",
      column: "ai_run_id",
      values: runIds,
    });

    for (const row of evalRows) {
      const list = evalMap.get(row.ai_run_id) ?? [];
      list.push({
        ...row,
        score: toNumberOrNull(row.score),
        metadata: asObjectOrNull(row.metadata),
      });
      evalMap.set(row.ai_run_id, list);
    }
  } catch (error) {
    if (!(error instanceof Error) || !isMissingColumnError(error.message)) {
      throw error;
    }
    console.warn(
      "[stargazer/exportDataset] ai_eval_runs schema not ready, continuing without eval rows:",
      error.message,
    );
  }

  return evalMap;
}

async function loadQuestionDownstreamMetrics(
  client: SupabaseClient,
  questionKeys: string[],
  historyLimit = 20,
): Promise<Map<string, StargazerQuestionDownstreamMetrics>> {
  const uniqueQuestionKeys = Array.from(new Set(questionKeys));
  const metrics = new Map<string, StargazerQuestionDownstreamMetrics>();

  if (uniqueQuestionKeys.length === 0) return metrics;

  const poolRows = await selectByChunk<QuestionPoolRow>({
    client,
    table: "stargazer_question_pool",
    select:
      "question_key, variant_json, axis_id, primary_lens_id, depth_score, probe_type, quality_score, quality_metrics, times_shown, times_answered, avg_response_time_ms, score_variance, parent_question_keys",
    column: "question_key",
    values: uniqueQuestionKeys,
  });

  const poolMap = new Map(poolRows.map((row) => [row.question_key, row]));
  const relevantLensIds = Array.from(
    new Set(poolRows.map((row) => row.primary_lens_id).filter(Boolean) as string[]),
  );

  let relatedPoolRows = poolRows;
  if (relevantLensIds.length > 0) {
    const relatedRows = await selectByChunk<QuestionPoolRow>({
      client,
      table: "stargazer_question_pool",
      select:
        "question_key, variant_json, axis_id, primary_lens_id, depth_score, probe_type, quality_score, quality_metrics, times_shown, times_answered, avg_response_time_ms, score_variance, parent_question_keys",
      column: "primary_lens_id",
      values: relevantLensIds,
    });

    const merged = new Map<string, QuestionPoolRow>();
    for (const row of [...poolRows, ...relatedRows]) {
      merged.set(row.question_key, {
        ...row,
        quality_metrics: asObjectOrNull(row.quality_metrics),
        parent_question_keys: asStringArray(row.parent_question_keys),
      });
    }
    relatedPoolRows = Array.from(merged.values());
  }

  const relatedQuestionKeys = Array.from(
    new Set(relatedPoolRows.map((row) => row.question_key)),
  );

  const shownRows = await selectByChunk<ShownRow>({
    client,
    table: "stargazer_question_shown",
    select:
      "user_id, question_key, shown_at, answered, score, response_time_ms, created_at",
    column: "question_key",
    values: relatedQuestionKeys,
  });

  const shownByQuestion = new Map<string, ShownRow[]>();
  const answeredBySession = new Map<string, Set<string>>();

  for (const row of shownRows) {
    const normalizedRow: ShownRow = {
      ...row,
      score: toNumberOrNull(row.score),
      response_time_ms: toNumberOrNull(row.response_time_ms),
    };
    const list = shownByQuestion.get(normalizedRow.question_key) ?? [];
    list.push(normalizedRow);
    shownByQuestion.set(normalizedRow.question_key, list);

    if (normalizedRow.answered) {
      const sessionKey = `${normalizedRow.user_id}:${normalizedRow.shown_at}`;
      const answered = answeredBySession.get(sessionKey) ?? new Set<string>();
      answered.add(normalizedRow.question_key);
      answeredBySession.set(sessionKey, answered);
    }
  }

  for (const questionKey of uniqueQuestionKeys) {
    const poolRow = poolMap.get(questionKey);
    if (!poolRow) continue;

    const baseRows = (shownByQuestion.get(questionKey) ?? []).sort((a, b) =>
      a.shown_at < b.shown_at ? 1 : -1,
    );
    const answeredRows = baseRows.filter((row) => row.answered);
    const childKeys = new Set(
      relatedPoolRows
        .filter((row) => row.question_key !== questionKey)
        .filter((row) => {
          const parentKeys = asStringArray(row.parent_question_keys);
          if (parentKeys.includes(questionKey)) return true;
          if (!poolRow.primary_lens_id || row.primary_lens_id !== poolRow.primary_lens_id) {
            return false;
          }
          return (toNumberOrNull(row.depth_score) ?? 0) >
            (toNumberOrNull(poolRow.depth_score) ?? 0);
        })
        .map((row) => row.question_key),
    );

    let followupSuccessCount = 0;
    for (const row of answeredRows) {
      const sessionKey = `${row.user_id}:${row.shown_at}`;
      const answered = answeredBySession.get(sessionKey);
      if (!answered) continue;
      const hasFollowup = Array.from(childKeys).some((childKey) =>
        answered.has(childKey),
      );
      if (hasFollowup) {
        followupSuccessCount += 1;
      }
    }

    const timesShown = Math.max(
      toNumberOrNull(poolRow.times_shown) ?? 0,
      baseRows.length,
    );
    const timesAnswered = Math.max(
      toNumberOrNull(poolRow.times_answered) ?? 0,
      answeredRows.length,
    );
    const answerRate = timesShown > 0 ? timesAnswered / timesShown : null;
    const skipRate = timesShown > 0 ? 1 - timesAnswered / timesShown : null;
    const avgScore =
      average(answeredRows.map((row) => row.score)) ??
      toNumberOrNull(asObjectOrNull(poolRow.quality_metrics)?.avg_score);
    const avgResponseTimeMs =
      average(answeredRows.map((row) => row.response_time_ms)) ??
      toNumberOrNull(poolRow.avg_response_time_ms);

    metrics.set(questionKey, {
      entityType: "question",
      acceptedEntityId: questionKey,
      axisId: poolRow.axis_id ?? null,
      lensId: poolRow.primary_lens_id ?? null,
      depthScore: toNumberOrNull(poolRow.depth_score),
      probeType: poolRow.probe_type ?? null,
      timesShown,
      timesAnswered,
      answerRate,
      skipRate,
      avgResponseTimeMs,
      avgScore,
      followupSuccessCount,
      followupRate:
        timesAnswered > 0 ? followupSuccessCount / timesAnswered : null,
      qualityScore: toNumberOrNull(poolRow.quality_score),
      qualityMetrics: asObjectOrNull(poolRow.quality_metrics),
      shownHistory: baseRows.slice(0, historyLimit).map((row) => ({
        userId: row.user_id,
        shownAt: row.shown_at,
        answered: row.answered,
        score: row.score,
        responseTimeMs: row.response_time_ms,
      })),
    });
  }

  return metrics;
}

function buildLensDownstreamMetrics(args: {
  lensRows: LensRow[];
  lensQuestions: QuestionPoolRow[];
  questionMetrics: Map<string, StargazerQuestionDownstreamMetrics>;
}): Map<string, StargazerLensDownstreamMetrics> {
  const metrics = new Map<string, StargazerLensDownstreamMetrics>();
  const questionsByLens = new Map<string, QuestionPoolRow[]>();

  for (const row of args.lensQuestions) {
    if (!row.primary_lens_id) continue;
    const list = questionsByLens.get(row.primary_lens_id) ?? [];
    list.push(row);
    questionsByLens.set(row.primary_lens_id, list);
  }

  for (const lens of args.lensRows) {
    const questions = questionsByLens.get(lens.id) ?? [];
    const relatedMetrics = questions
      .map((row) => args.questionMetrics.get(row.question_key))
      .filter(Boolean) as StargazerQuestionDownstreamMetrics[];

    const timesShown = relatedMetrics.reduce(
      (sum, row) => sum + row.timesShown,
      0,
    );
    const timesAnswered = relatedMetrics.reduce(
      (sum, row) => sum + row.timesAnswered,
      0,
    );
    const followupSuccessCount = relatedMetrics.reduce(
      (sum, row) => sum + row.followupSuccessCount,
      0,
    );

    metrics.set(lens.id, {
      entityType: "lens",
      acceptedEntityId: lens.id,
      status: lens.status,
      relatedAxes: asStringArray(lens.related_axes),
      probingTargets: asStringArray(lens.probing_targets),
      questionCount: questions.length,
      shownQuestionCount: relatedMetrics.filter((row) => row.timesShown > 0).length,
      timesShown,
      timesAnswered,
      answerRate: timesShown > 0 ? timesAnswered / timesShown : null,
      skipRate: timesShown > 0 ? 1 - timesAnswered / timesShown : null,
      avgResponseTimeMs: average(
        relatedMetrics.map((row) => row.avgResponseTimeMs),
      ),
      avgScore: average(relatedMetrics.map((row) => row.avgScore)),
      followupSuccessCount,
      followupRate:
        timesAnswered > 0 ? followupSuccessCount / timesAnswered : null,
      avgQualityScore:
        average(relatedMetrics.map((row) => row.qualityScore)) ??
        toNumberOrNull(lens.avg_quality),
      qualityMetrics: asObjectOrNull(lens.quality_metrics),
    });
  }

  return metrics;
}

export function summarizeStargazerRunOutcome(args: {
  candidates: CandidateRow[];
  questionMetrics: Map<string, StargazerQuestionDownstreamMetrics>;
  lensMetrics: Map<string, StargazerLensDownstreamMetrics>;
}): StargazerRunOutcomeSummary {
  const minTimesShownForScore = envNumber(
    "STARGAZER_RUN_SCORE_MIN_TIMES_SHOWN",
    5,
  );
  const totalCandidates = args.candidates.length;
  const acceptedCandidates = args.candidates.filter(
    (candidate) => candidate.acceptance_status === "accepted",
  );
  const rejectedCandidates = totalCandidates - acceptedCandidates.length;

  const acceptedMetrics = acceptedCandidates
    .map((candidate) => {
      if (!candidate.accepted_entity_id) return null;
      if (candidate.entity_type === "question") {
        return args.questionMetrics.get(candidate.accepted_entity_id) ?? null;
      }
      return args.lensMetrics.get(candidate.accepted_entity_id) ?? null;
    })
    .filter(Boolean) as Array<
      StargazerQuestionDownstreamMetrics | StargazerLensDownstreamMetrics
    >;

  const observedAcceptedCount = acceptedMetrics.filter((metric) => {
    if (metric.entityType === "question") return metric.timesShown > 0;
    return metric.shownQuestionCount > 0;
  }).length;

  const timesShown = acceptedMetrics.reduce(
    (sum, metric) => sum + metric.timesShown,
    0,
  );
  const timesAnswered = acceptedMetrics.reduce(
    (sum, metric) => sum + metric.timesAnswered,
    0,
  );
  const followupSuccessCount = acceptedMetrics.reduce(
    (sum, metric) => sum + metric.followupSuccessCount,
    0,
  );

  const adoptionRate = totalCandidates > 0 ? acceptedCandidates.length / totalCandidates : null;
  const servedAcceptedRate =
    acceptedCandidates.length > 0
      ? observedAcceptedCount / acceptedCandidates.length
      : null;
  const answerRate = timesShown > 0 ? timesAnswered / timesShown : null;
  const skipRate = timesShown > 0 ? 1 - timesAnswered / timesShown : null;
  const followupRate =
    timesAnswered > 0 ? followupSuccessCount / timesAnswered : null;
  const avgQualityScore = average(
    acceptedMetrics.map((metric) =>
      metric.entityType === "question"
        ? metric.qualityScore
        : metric.avgQualityScore,
    ),
  );

  const downstreamScore =
    adoptionRate == null || timesShown < minTimesShownForScore
      ? null
      : Math.max(
          0,
          Math.min(
            1,
            adoptionRate * 0.25 +
              (servedAcceptedRate ?? 0) * 0.15 +
              (answerRate ?? 0) * 0.3 +
              (followupRate ?? 0) * 0.2 +
              (avgQualityScore ?? 0) * 0.1,
          ),
        );

  return {
    totalCandidates,
    acceptedCandidates: acceptedCandidates.length,
    rejectedCandidates,
    adoptionRate,
    observedAcceptedCount,
    servedAcceptedRate,
    timesShown,
    timesAnswered,
    answerRate,
    skipRate,
    followupSuccessCount,
    followupRate,
    avgQualityScore,
    downstreamScore,
  };
}

export async function loadStargazerTrainingContext(
  client: SupabaseClient,
  filters: DatasetExportFilters,
  options?: { aiRunIds?: string[] },
): Promise<{
  candidates: CandidateRow[];
  aiRunMap: Map<string, AIRunRow>;
  teacherMap: Map<string, TeacherOutputRow>;
  evalMap: Map<string, EvalRow[]>;
  questionMap: Map<string, QuestionPoolRow>;
  lensMap: Map<string, LensRow>;
  questionMetrics: Map<string, StargazerQuestionDownstreamMetrics>;
  lensMetrics: Map<string, StargazerLensDownstreamMetrics>;
  runOutcomeMap: Map<string, StargazerRunOutcomeSummary>;
}> {
  const candidates = await loadCandidateRows(client, filters, options);
  const aiRunIds = Array.from(
    new Set(candidates.map((candidate) => candidate.ai_run_id).filter(Boolean) as string[]),
  );

  const aiRuns = await selectByChunk<AIRunRow>({
    client,
    table: "ai_runs",
    select:
      "id, created_at, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, success, fallback_used, metadata",
    column: "id",
    values: aiRunIds,
  });
  const aiRunMap = new Map(
    aiRuns.map((row) => [
      row.id,
      {
        ...row,
        metadata: asObjectOrNull(row.metadata),
      },
    ]),
  );

  let filteredCandidates = candidates;
  if (filters.onlySuccessful !== false) {
    filteredCandidates = filteredCandidates.filter((candidate) => {
      if (!candidate.ai_run_id) return true;
      return aiRunMap.get(candidate.ai_run_id)?.success !== false;
    });
  }

  const filteredRunIds = Array.from(
    new Set(
      filteredCandidates
        .map((candidate) => candidate.ai_run_id)
        .filter(Boolean) as string[],
    ),
  );

  const teacherMap = await loadTeacherMapByRunIds(client, filteredRunIds);

  if (filters.onlyWithTeacher) {
    filteredCandidates = filteredCandidates.filter((candidate) =>
      candidate.ai_run_id ? teacherMap.has(candidate.ai_run_id) : false,
    );
  }

  const evalMap = await loadEvalMapByRunIds(client, filteredRunIds);

  if (filters.minEvalScore != null) {
    filteredCandidates = filteredCandidates.filter((candidate) => {
      if (!candidate.ai_run_id) return false;
      const evals = evalMap.get(candidate.ai_run_id) ?? [];
      return evals.some((row) => row.score != null && row.score >= filters.minEvalScore!);
    });
  }

  const acceptedQuestionKeys = Array.from(
    new Set(
      filteredCandidates
        .filter(
          (candidate) =>
            candidate.acceptance_status === "accepted" &&
            candidate.entity_type === "question" &&
            candidate.accepted_entity_id,
        )
        .map((candidate) => candidate.accepted_entity_id as string),
    ),
  );

  const acceptedLensIds = Array.from(
    new Set(
      filteredCandidates
        .filter(
          (candidate) =>
            candidate.acceptance_status === "accepted" &&
            candidate.entity_type === "lens" &&
            candidate.accepted_entity_id,
        )
        .map((candidate) => candidate.accepted_entity_id as string),
    ),
  );

  const acceptedQuestionRows = await selectByChunk<QuestionPoolRow>({
    client,
    table: "stargazer_question_pool",
    select:
      "question_key, variant_json, axis_id, primary_lens_id, depth_score, probe_type, quality_score, quality_metrics, times_shown, times_answered, avg_response_time_ms, score_variance, parent_question_keys",
    column: "question_key",
    values: acceptedQuestionKeys,
  });
  const questionMap = new Map(
    acceptedQuestionRows.map((row) => [
      row.question_key,
      {
        ...row,
        variant_json: asObjectOrNull(row.variant_json),
        quality_metrics: asObjectOrNull(row.quality_metrics),
        parent_question_keys: asStringArray(row.parent_question_keys),
      },
    ]),
  );

  const lensRows = await selectByChunk<LensRow>({
    client,
    table: "stargazer_observation_lenses",
    select:
      "id, name_ja, description, status, discovery_source, questions_generated, avg_quality, quality_metrics, related_axes, probing_targets",
    column: "id",
    values: acceptedLensIds,
  });
  const lensMap = new Map(
    lensRows.map((row) => [
      row.id,
      {
        ...row,
        quality_metrics: asObjectOrNull(row.quality_metrics),
        related_axes: asStringArray(row.related_axes),
        probing_targets: asStringArray(row.probing_targets),
      },
    ]),
  );

  const lensQuestionRows = acceptedLensIds.length > 0
    ? await selectByChunk<QuestionPoolRow>({
        client,
        table: "stargazer_question_pool",
        select:
          "question_key, variant_json, axis_id, primary_lens_id, depth_score, probe_type, quality_score, quality_metrics, times_shown, times_answered, avg_response_time_ms, score_variance, parent_question_keys",
        column: "primary_lens_id",
        values: acceptedLensIds,
      })
    : [];

  const questionMetrics = await loadQuestionDownstreamMetrics(
    client,
    Array.from(
      new Set([
        ...acceptedQuestionKeys,
        ...lensQuestionRows.map((row) => row.question_key),
      ]),
    ),
  );
  const lensMetrics = buildLensDownstreamMetrics({
    lensRows: Array.from(lensMap.values()),
    lensQuestions: lensQuestionRows.map((row) => ({
      ...row,
      variant_json: asObjectOrNull(row.variant_json),
      quality_metrics: asObjectOrNull(row.quality_metrics),
      parent_question_keys: asStringArray(row.parent_question_keys),
    })),
    questionMetrics,
  });

  const runOutcomeMap = new Map<string, StargazerRunOutcomeSummary>();
  for (const runId of filteredRunIds) {
    const runCandidates = filteredCandidates.filter(
      (candidate) => candidate.ai_run_id === runId,
    );
    runOutcomeMap.set(
      runId,
      normalizeRunOutcomeSummary(
        summarizeStargazerRunOutcome({
          candidates: runCandidates,
          questionMetrics,
          lensMetrics,
        }),
      )!,
    );
  }

  return {
    candidates: filteredCandidates,
    aiRunMap,
    teacherMap,
    evalMap,
    questionMap,
    lensMap,
    questionMetrics,
    lensMetrics,
    runOutcomeMap,
  };
}

export async function exportStargazerTrainingDataset(
  filters: DatasetExportFilters,
): Promise<StargazerTrainingExportResult> {
  const enabled = envBool("AI_EXPORT_ENABLED", false);
  if (!enabled) {
    return { enabled: false, totalCandidatesScanned: 0, rows: [] };
  }

  const client = getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const context = await loadStargazerTrainingContext(client, filters);

  const rows = context.candidates.map((candidate) => {
    const aiRun = candidate.ai_run_id
      ? context.aiRunMap.get(candidate.ai_run_id) ?? null
      : null;
    const teacher = candidate.ai_run_id
      ? context.teacherMap.get(candidate.ai_run_id) ?? null
      : null;
    const evals = candidate.ai_run_id
      ? (context.evalMap.get(candidate.ai_run_id) ?? [])
      : [];

    const acceptedEntity =
      candidate.acceptance_status !== "accepted" || !candidate.accepted_entity_id
        ? null
        : candidate.entity_type === "question"
          ? context.questionMap.get(candidate.accepted_entity_id) ?? null
          : context.lensMap.get(candidate.accepted_entity_id) ?? null;

    const downstreamMetrics =
      candidate.acceptance_status !== "accepted" || !candidate.accepted_entity_id
        ? null
        : candidate.entity_type === "question"
          ? context.questionMetrics.get(candidate.accepted_entity_id) ?? null
          : context.lensMetrics.get(candidate.accepted_entity_id) ?? null;
    const runOutcomeSummary = normalizeRunOutcomeSummary(
      candidate.ai_run_id
        ? context.runOutcomeMap.get(candidate.ai_run_id) ?? null
        : null,
    );

    return {
      id: candidate.id,
      createdAt: candidate.created_at,
      batchId: candidate.batch_id,
      aiRunId: candidate.ai_run_id,
      taskType: candidate.task_type,
      sourceStage: candidate.source_stage,
      entityType: candidate.entity_type,
      candidateIndex: candidate.candidate_index,
      axisId: candidate.axis_id,
      lensId: candidate.lens_id,
      acceptanceStatus: candidate.acceptance_status,
      acceptedEntityId: candidate.accepted_entity_id,
      rejectionReason: candidate.rejection_reason,
      requestContext: candidate.request_context,
      candidateJson: candidate.candidate_json,
      normalizedOutput: candidate.normalized_output,
      aiRun: {
        id: aiRun?.id ?? null,
        createdAt: aiRun?.created_at ?? null,
        provider: aiRun?.provider ?? null,
        model: aiRun?.model ?? null,
        promptText: aiRun?.prompt_text ?? null,
        systemPrompt: aiRun?.system_prompt ?? null,
        responseText: aiRun?.response_text ?? null,
        structuredJson: aiRun?.structured_json ?? null,
        metadata: aiRun?.metadata ?? null,
        success: aiRun?.success ?? null,
        fallbackUsed: aiRun?.fallback_used ?? null,
      },
      teacherOutput: {
        response: teacher ? normalizeTeacherResponse(teacher) : null,
        provider: teacher?.teacher_provider ?? null,
        model: teacher?.teacher_model ?? null,
        createdAt: teacher?.created_at ?? null,
        metadata: teacher?.metadata ?? null,
      },
      evals: evals.map((evalRow) => ({
        evalType: evalRow.eval_type,
        score: evalRow.score,
        passed: evalRow.passed,
        createdAt: evalRow.created_at,
        metadata: evalRow.metadata ?? null,
      })),
      acceptedEntity,
      downstreamMetrics,
      storedDownstreamMetrics: candidate.downstream_metrics,
      runOutcomeSummary,
      hardNegative: {
        isHardNegative:
          candidate.acceptance_status === "rejected" ||
          inferStargazerHardNegativeKind(candidate.rejection_reason) != null,
        kind: inferStargazerHardNegativeKind(candidate.rejection_reason),
        reasons: candidate.rejection_reason ? [candidate.rejection_reason] : [],
      },
    } satisfies StargazerTrainingDatasetRow;
  });

  return {
    enabled: true,
    totalCandidatesScanned: context.candidates.length,
    rows,
  };
}

export async function exportStargazerTeacherDataset(
  filters: DatasetExportFilters,
): Promise<StargazerTeacherExportResult> {
  const enabled = envBool("AI_EXPORT_ENABLED", false);
  if (!enabled) {
    return { enabled: false, totalRunsScanned: 0, rows: [] };
  }

  const client = getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const targetRowLimit = Math.max(1, filters.limit ?? 500);
  const context = await loadStargazerTrainingContext(client, {
    ...filters,
    limit: Math.max(targetRowLimit * 20, filters.limit ?? 500),
  });
  const rows: StargazerTeacherDatasetRow[] = [];
  const seenRunIds = new Set<string>();

  for (const [runId, aiRun] of context.aiRunMap.entries()) {
    const runCandidates = context.candidates.filter(
      (candidate) => candidate.ai_run_id === runId,
    );
    if (runCandidates.length === 0) continue;

    const teacher = context.teacherMap.get(runId) ?? null;
    const normalizedTeacherResponse = teacher ? normalizeTeacherResponse(teacher) : null;
    if (!normalizedTeacherResponse?.trim()) {
      continue;
    }
    const evals = context.evalMap.get(runId) ?? [];
    const outcomeSummary = normalizeRunOutcomeSummary(
      context.runOutcomeMap.get(runId) ?? null,
    );
    const acceptedEntityIds = runCandidates
      .filter((candidate) => candidate.acceptance_status === "accepted")
      .map((candidate) => candidate.accepted_entity_id)
      .filter(Boolean) as string[];
    const hardNegativeKinds = Array.from(
      new Set(
        runCandidates
          .map((candidate) =>
            inferStargazerHardNegativeKind(candidate.rejection_reason),
          )
          .filter(Boolean) as string[],
      ),
    );

    rows.push({
      id: runId,
      createdAt: aiRun.created_at,
      aiRunId: runId,
      taskType: aiRun.task_type,
      provider: aiRun.provider,
      model: aiRun.model ?? "",
      promptText: aiRun.prompt_text,
      systemPrompt: aiRun.system_prompt ?? null,
      responseText: aiRun.response_text ?? null,
      teacherResponse: normalizedTeacherResponse,
      acceptedEntityIds,
      rejectedCount: runCandidates.filter(
        (candidate) => candidate.acceptance_status === "rejected",
      ).length,
      outcomeSummary,
      hardNegativeCount: runCandidates.filter(
        (candidate) =>
          inferStargazerHardNegativeKind(candidate.rejection_reason) != null,
      ).length,
      hardNegativeKinds,
      evals: evals.map((evalRow) => ({
        evalType: evalRow.eval_type,
        score: evalRow.score,
        passed: evalRow.passed,
        createdAt: evalRow.created_at,
        metadata: evalRow.metadata ?? null,
      })),
      metadata: aiRun.metadata ?? null,
    });
    seenRunIds.add(runId);
  }

  const standaloneRunLimit = Math.max(targetRowLimit * 4, 1000);
  const standaloneRuns = await loadAiRunsByFilters(client, filters, {
    limitOverride: standaloneRunLimit,
  });
  const missingStandaloneRuns = standaloneRuns.filter((run) => {
    if (seenRunIds.has(run.id)) return false;
    if (!run.prompt_text?.trim()) return false;
    if (filters.minEvalScore != null) return true;
    return true;
  });
  const missingStandaloneRunIds = missingStandaloneRuns.map((run) => run.id);
  const standaloneTeacherMap = await loadTeacherMapByRunIds(
    client,
    missingStandaloneRunIds,
  );
  const standaloneEvalMap = await loadEvalMapByRunIds(
    client,
    missingStandaloneRunIds,
  );

  for (const aiRun of missingStandaloneRuns) {
    const teacher = standaloneTeacherMap.get(aiRun.id) ?? null;
    const normalizedTeacherResponse = teacher ? normalizeTeacherResponse(teacher) : null;
    if (!normalizedTeacherResponse?.trim()) {
      continue;
    }

    const evals = standaloneEvalMap.get(aiRun.id) ?? [];
    if (filters.minEvalScore != null) {
      const passedMinEval = evals.some(
        (evalRow) =>
          evalRow.score != null && evalRow.score >= filters.minEvalScore!,
      );
      if (!passedMinEval) {
        continue;
      }
    }

    rows.push({
      id: aiRun.id,
      createdAt: aiRun.created_at,
      aiRunId: aiRun.id,
      taskType: aiRun.task_type,
      provider: aiRun.provider,
      model: aiRun.model ?? "",
      promptText: aiRun.prompt_text,
      systemPrompt: aiRun.system_prompt ?? null,
      responseText: aiRun.response_text ?? null,
      teacherResponse: normalizedTeacherResponse,
      acceptedEntityIds: [],
      rejectedCount: 0,
      outcomeSummary: null,
      hardNegativeCount: 0,
      hardNegativeKinds: [],
      evals: evals.map((evalRow) => ({
        evalType: evalRow.eval_type,
        score: evalRow.score,
        passed: evalRow.passed,
        createdAt: evalRow.created_at,
        metadata: evalRow.metadata ?? null,
      })),
      metadata: aiRun.metadata ?? null,
    });
    seenRunIds.add(aiRun.id);
  }

  rows.sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));

  return {
    enabled: true,
    totalRunsScanned: rows.length,
    rows: rows.slice(0, targetRowLimit),
  };
}
