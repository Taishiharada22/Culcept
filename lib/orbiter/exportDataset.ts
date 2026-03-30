import "server-only";

import { getAIServiceClient } from "@/lib/ai/db";
import type { DatasetExportFilters } from "@/lib/ai/exportDataset";
import { ORBITER_STUDENT_TASK_TYPES } from "./studentTrack";

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTeacherRunId(row: TeacherOutputRow): string | null {
  return row.ai_run_id ?? row.source_ai_run_id ?? null;
}

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("could not find the column")
  );
}

function inferOrbiterHardNegativeKind(args: {
  success: boolean;
  errorMessage: string | null;
  hasSummary: boolean;
  shouldPersistSummary: boolean;
  isShadow: boolean;
  shadowEvalPassed: boolean | null;
}): string | null {
  if (!args.success) {
    const message = (args.errorMessage ?? "").toLowerCase();
    if (message.includes("malformed_structured_output")) {
      return "malformed_structured_output";
    }
    if (message.includes("timeout")) {
      return "provider_timeout";
    }
    return "provider_failure";
  }

  if (!args.isShadow && args.shouldPersistSummary && !args.hasSummary) {
    return "missing_summary_row";
  }

  if (args.isShadow && args.shadowEvalPassed === false) {
    return "shadow_eval_failed";
  }

  return null;
}

type AIRunRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  session_id: string | null;
  task_type: string;
  provider: string;
  model: string | null;
  prompt_text: string;
  system_prompt: string | null;
  response_text: string | null;
  structured_json: Record<string, unknown> | unknown[] | null;
  success: boolean;
  fallback_used: boolean | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

type SummaryRow = {
  ai_run_id: string | null;
  user_id: string;
  candidate_id: string;
  summary_text: string;
  summary_json: Record<string, unknown> | null;
  source_memo_count: number | null;
  source_new_memo_count: number | null;
  quality_metrics: Record<string, unknown> | null;
  updated_at: string;
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

export type OrbiterHardNegativeLabel = {
  isHardNegative: boolean;
  kind: string | null;
  reasons: string[];
};

export type OrbiterTrainingDatasetRow = {
  id: string;
  createdAt: string;
  aiRunId: string;
  taskType: string;
  userId: string | null;
  sessionId: string | null;
  candidateId: string | null;
  visitCount: number | null;
  isShadow: boolean;
  selectedRole: string | null;
  shadowOfAiRunId: string | null;
  promptText: string;
  systemPrompt: string | null;
  responseText: string | null;
  structuredJson: Record<string, unknown> | unknown[] | null;
  provider: string;
  model: string | null;
  success: boolean;
  fallbackUsed: boolean | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  summary: {
    summaryText: string | null;
    summaryJson: Record<string, unknown> | null;
    sourceMemoCount: number | null;
    sourceNewMemoCount: number | null;
    qualityMetrics: Record<string, unknown> | null;
    updatedAt: string | null;
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
  hardNegative: OrbiterHardNegativeLabel;
};

export type OrbiterTeacherDatasetRow = {
  createdAt: string;
  aiRunId: string;
  taskType: string;
  userId: string | null;
  candidateId: string | null;
  isShadow: boolean;
  selectedRole: string | null;
  shadowOfAiRunId: string | null;
  promptText: string;
  systemPrompt: string | null;
  responseText: string | null;
  teacherResponse: string | null;
  provider: string;
  model: string | null;
  teacherProvider: string | null;
  teacherModel: string | null;
  summaryText: string | null;
  summaryJson: Record<string, unknown> | null;
  evals: Array<{
    evalType: string;
    score: number | null;
    passed: boolean;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  metadata: Record<string, unknown> | null;
};

export type OrbiterTrainingDatasetResult = {
  enabled: boolean;
  totalRunsScanned: number;
  rows: OrbiterTrainingDatasetRow[];
};

export type OrbiterTeacherDatasetResult = {
  enabled: boolean;
  totalRunsScanned: number;
  rows: OrbiterTeacherDatasetRow[];
};

async function loadTeacherOutputs(args: {
  client: ReturnType<typeof getAIServiceClient>;
  taskTypes: string[];
  runIds: string[];
}): Promise<TeacherOutputRow[]> {
  if (!args.client || args.runIds.length === 0) return [];

  let query = args.client
    .from("teacher_outputs")
    .select(
      "ai_run_id, source_ai_run_id, teacher_response, teacher_response_text, teacher_provider, teacher_model, created_at, metadata",
    )
    .in("task_type", args.taskTypes);

  const { data, error } = await query;
  if (error && isMissingColumnError(error.message)) {
    const fallback = await args.client
      .from("teacher_outputs")
      .select(
        "ai_run_id, teacher_response, teacher_provider, teacher_model, created_at, metadata",
      )
      .in("task_type", args.taskTypes);
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    return (((fallback.data ?? []) as unknown) as TeacherOutputRow[]).filter((row) => {
      const runId = normalizeTeacherRunId(row);
      return runId != null && args.runIds.includes(runId);
    });
  }

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as TeacherOutputRow[]).filter((row) => {
    const runId = normalizeTeacherRunId(row);
    return runId != null && args.runIds.includes(runId);
  });
}

export async function exportOrbiterTrainingDataset(
  filters: DatasetExportFilters,
): Promise<OrbiterTrainingDatasetResult> {
  const enabled = envBool("AI_EXPORT_ENABLED", false);
  if (!enabled) {
    return { enabled: false, totalRunsScanned: 0, rows: [] };
  }

  const client = getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const taskTypes =
    filters.taskTypes && filters.taskTypes.length > 0
      ? filters.taskTypes
      : [...ORBITER_STUDENT_TASK_TYPES];
  const limit = filters.limit ?? 500;

  let query = client
    .from("ai_runs")
    .select(
      "id, created_at, user_id, session_id, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, success, fallback_used, error_message, metadata",
    )
    .in("task_type", taskTypes)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.onlySuccessful !== false) {
    query = query.eq("success", true);
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

  const { data: runs, error: runsError } = await query;
  if (runsError) throw new Error(runsError.message);

  const runsList = (((runs ?? []) as unknown) as AIRunRow[]).map((row) => ({
    ...row,
    metadata: asObjectOrNull(row.metadata),
  }));
  const runIds = runsList.map((row) => row.id);

  const [teacherRows, evalRowsResult, summaryRowsResult] = await Promise.all([
    loadTeacherOutputs({ client, taskTypes, runIds }),
    runIds.length === 0
      ? Promise.resolve({ data: [] as EvalRow[], error: null })
      : client
          .from("ai_eval_runs")
          .select("ai_run_id, eval_type, score, passed, created_at, metadata")
          .in("ai_run_id", runIds),
    runIds.length === 0
      ? Promise.resolve({ data: [] as SummaryRow[], error: null })
      : client
          .from("orbiter_memory_summaries")
          .select(
            "ai_run_id, user_id, candidate_id, summary_text, summary_json, source_memo_count, source_new_memo_count, quality_metrics, updated_at",
          )
          .in("ai_run_id", runIds),
  ]);

  if (evalRowsResult.error) throw new Error(evalRowsResult.error.message);
  if (summaryRowsResult.error) throw new Error(summaryRowsResult.error.message);

  const teacherByRunId = new Map<string, TeacherOutputRow>();
  for (const row of teacherRows) {
    const runId = normalizeTeacherRunId(row);
    if (!runId || teacherByRunId.has(runId)) continue;
    teacherByRunId.set(runId, {
      ...row,
      metadata: asObjectOrNull(row.metadata),
    });
  }

  const evalsByRunId = new Map<string, EvalRow[]>();
  for (const row of (((evalRowsResult.data ?? []) as unknown) as EvalRow[])) {
    const current = evalsByRunId.get(row.ai_run_id) ?? [];
    current.push({
      ...row,
      metadata: asObjectOrNull(row.metadata),
    });
    evalsByRunId.set(row.ai_run_id, current);
  }

  const summaryByRunId = new Map<string, SummaryRow>();
  for (const row of (((summaryRowsResult.data ?? []) as unknown) as SummaryRow[])) {
    if (!row.ai_run_id || summaryByRunId.has(row.ai_run_id)) continue;
    summaryByRunId.set(row.ai_run_id, {
      ...row,
      summary_json: asObjectOrNull(row.summary_json),
      quality_metrics: asObjectOrNull(row.quality_metrics),
    });
  }

  let rows = runsList.map((run) => {
    const metadata = run.metadata;
    const teacher = teacherByRunId.get(run.id) ?? null;
    const evals = evalsByRunId.get(run.id) ?? [];
    const shadowEval =
      evals.find((row) => row.eval_type === "orbiter_shadow") ?? null;
    const summary = summaryByRunId.get(run.id) ?? null;
    const structuredSummary = asObjectOrNull(run.structured_json);
    const derivedSummaryJson = summary?.summary_json ?? structuredSummary ?? null;
    const derivedSummaryText =
      summary?.summary_text ??
      (typeof structuredSummary?.summary === "string"
        ? structuredSummary.summary
        : null);
    const isShadow = metadata?.shadowPass === true;
    const hardNegativeKind = inferOrbiterHardNegativeKind({
      success: run.success,
      errorMessage: run.error_message,
      hasSummary: summary != null,
      shouldPersistSummary: metadata?.persistSummary !== false,
      isShadow,
      shadowEvalPassed: shadowEval?.passed ?? null,
    });

    return {
      id: run.id,
      createdAt: run.created_at,
      aiRunId: run.id,
      taskType: run.task_type,
      userId: run.user_id,
      sessionId: run.session_id,
      candidateId:
        typeof metadata?.candidateId === "string" ? metadata.candidateId : null,
      visitCount: toNumberOrNull(metadata?.visitCount),
      isShadow,
      selectedRole:
        typeof metadata?.selectedRole === "string" ? metadata.selectedRole : null,
      shadowOfAiRunId:
        typeof metadata?.shadowOfAiRunId === "string"
          ? metadata.shadowOfAiRunId
          : null,
      promptText: run.prompt_text,
      systemPrompt: run.system_prompt,
      responseText: run.response_text,
      structuredJson: run.structured_json,
      provider: run.provider,
      model: run.model,
      success: run.success,
      fallbackUsed: run.fallback_used,
      errorMessage: run.error_message,
      metadata,
      summary: {
        summaryText: derivedSummaryText,
        summaryJson: derivedSummaryJson,
        sourceMemoCount: summary?.source_memo_count ?? null,
        sourceNewMemoCount: summary?.source_new_memo_count ?? null,
        qualityMetrics: summary?.quality_metrics ?? null,
        updatedAt: summary?.updated_at ?? null,
      },
      teacherOutput: {
        response:
          teacher?.teacher_response ?? teacher?.teacher_response_text ?? null,
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
      hardNegative: {
        isHardNegative: hardNegativeKind != null,
        kind: hardNegativeKind,
        reasons: hardNegativeKind ? [hardNegativeKind] : [],
      },
    } satisfies OrbiterTrainingDatasetRow;
  });

  if (filters.onlyWithTeacher) {
    rows = rows.filter((row) => Boolean(row.teacherOutput.response));
  }
  if (filters.minEvalScore != null) {
    rows = rows.filter((row) => {
      const bestScore = row.evals.reduce<number | null>((best, evalRow) => {
        if (evalRow.score == null) return best;
        if (best == null) return evalRow.score;
        return Math.max(best, evalRow.score);
      }, null);
      return bestScore != null && bestScore >= filters.minEvalScore!;
    });
  }

  return {
    enabled: true,
    totalRunsScanned: runsList.length,
    rows,
  };
}

export async function exportOrbiterTeacherDataset(
  filters: DatasetExportFilters,
): Promise<OrbiterTeacherDatasetResult> {
  const exportResult = await exportOrbiterTrainingDataset(filters);
  if (!exportResult.enabled) {
    return { enabled: false, totalRunsScanned: 0, rows: [] };
  }

  const rows = exportResult.rows
    .filter((row) => (row.teacherOutput.response ?? "").trim().length > 0)
    .map((row) => ({
      createdAt: row.createdAt,
      aiRunId: row.aiRunId,
      taskType: row.taskType,
      userId: row.userId,
      candidateId: row.candidateId,
      isShadow: row.isShadow,
      selectedRole: row.selectedRole,
      shadowOfAiRunId: row.shadowOfAiRunId,
      promptText: row.promptText,
      systemPrompt: row.systemPrompt,
      responseText: row.responseText,
      teacherResponse: row.teacherOutput.response,
      provider: row.provider,
      model: row.model,
      teacherProvider: row.teacherOutput.provider,
      teacherModel: row.teacherOutput.model,
      summaryText: row.summary.summaryText,
      summaryJson: row.summary.summaryJson,
      evals: row.evals,
      metadata: row.metadata,
    }));

  return {
    enabled: true,
    totalRunsScanned: exportResult.totalRunsScanned,
    rows,
  };
}
