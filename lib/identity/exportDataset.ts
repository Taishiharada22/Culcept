import "server-only";

import { getAIServiceClient } from "@/lib/ai/db";
import type { DatasetExportFilters } from "@/lib/ai/exportDataset";
import {
  buildProfileText,
  computeContradictionScore,
  computeProfileConfidence,
  parseIdentityProfile,
  type IdentityProfileRecord,
} from "./profileUpdate";
import { IDENTITY_STUDENT_TASK_TYPES } from "./studentTrack";

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

function inferIdentityHardNegativeKind(args: {
  success: boolean;
  errorMessage: string | null;
  hasSnapshot: boolean;
  shouldPersistSnapshot: boolean;
  isShadow: boolean;
  shadowEvalPassed: boolean | null;
  hasProfile: boolean;
}): string | null {
  if (!args.success) {
    const message = (args.errorMessage ?? "").toLowerCase();
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

  if (!args.hasProfile) {
    return "invalid_profile_payload";
  }

  if (!args.isShadow && args.shouldPersistSnapshot && !args.hasSnapshot) {
    return "missing_snapshot_row";
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

type SnapshotRow = {
  id: string;
  ai_run_id: string | null;
  user_id: string;
  version: number;
  profile_json: Record<string, unknown> | null;
  profile_text: string | null;
  previous_snapshot_id: string | null;
  source_summary: Record<string, unknown> | null;
  contradiction_score: number | null;
  consumer_readiness: Record<string, unknown> | null;
  confidence: number | null;
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

export type IdentityHardNegativeLabel = {
  isHardNegative: boolean;
  kind: string | null;
  reasons: string[];
};

export type IdentityTrainingDatasetRow = {
  id: string;
  createdAt: string;
  aiRunId: string;
  taskType: string;
  userId: string | null;
  sessionId: string | null;
  isShadow: boolean;
  selectedRole: string | null;
  shadowOfAiRunId: string | null;
  promptText: string;
  systemPrompt: string | null;
  responseText: string | null;
  structuredJson: Record<string, unknown> | unknown[] | null;
  provider: string;
  model: string | null;
  runSuccess: boolean;
  success: boolean;
  fallbackUsed: boolean | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  profile: {
    profileJson: IdentityProfileRecord | null;
    profileText: string | null;
    contradictionScore: number | null;
    confidence: number | null;
    consumerReadiness: Record<string, unknown> | null;
  };
  snapshot: {
    id: string | null;
    version: number | null;
    previousSnapshotId: string | null;
    updatedAt: string | null;
    sourceSummary: Record<string, unknown> | null;
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
  hardNegative: IdentityHardNegativeLabel;
};

export type IdentityTeacherDatasetRow = {
  createdAt: string;
  aiRunId: string;
  taskType: string;
  userId: string | null;
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
  profileText: string | null;
  snapshotId: string | null;
  evals: Array<{
    evalType: string;
    score: number | null;
    passed: boolean;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  metadata: Record<string, unknown> | null;
};

export type IdentityTrainingDatasetResult = {
  enabled: boolean;
  totalRunsScanned: number;
  rows: IdentityTrainingDatasetRow[];
};

export type IdentityTeacherDatasetResult = {
  enabled: boolean;
  totalRunsScanned: number;
  rows: IdentityTeacherDatasetRow[];
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

function buildProfileView(args: {
  run: AIRunRow;
  snapshot: SnapshotRow | null;
}): {
  profile: IdentityProfileRecord | null;
  profileText: string | null;
  contradictionScore: number | null;
  confidence: number | null;
  consumerReadiness: Record<string, unknown> | null;
} {
  const snapshotProfile = args.snapshot?.profile_json
    ? parseIdentityProfile({
        structured: args.snapshot.profile_json,
        text: JSON.stringify(args.snapshot.profile_json),
      })
    : null;
  const parsedFromRun = parseIdentityProfile({
    structured: args.run.structured_json,
    text: args.run.response_text ?? "",
  });
  const profile = snapshotProfile ?? parsedFromRun;

  if (!profile) {
    return {
      profile: null,
      profileText: null,
      contradictionScore: null,
      confidence: null,
      consumerReadiness: null,
    };
  }

  return {
    profile,
    profileText: args.snapshot?.profile_text ?? buildProfileText(profile),
    contradictionScore:
      args.snapshot?.contradiction_score ?? computeContradictionScore(profile),
    confidence: args.snapshot?.confidence ?? computeProfileConfidence(profile),
    consumerReadiness:
      args.snapshot?.consumer_readiness ??
      (profile.consumerReadiness as unknown as Record<string, unknown>),
  };
}

export async function exportIdentityTrainingDataset(
  filters: DatasetExportFilters,
): Promise<IdentityTrainingDatasetResult> {
  const enabled = envBool("AI_EXPORT_ENABLED", false);
  if (!enabled) {
    return { enabled: false, totalRunsScanned: 0, rows: [] };
  }

  const client = getAIServiceClient();
  if (!client) {
    throw new Error("service_role_unavailable");
  }

  const limit = filters.limit ?? 500;

  let query = client
    .from("ai_runs")
    .select(
      "id, created_at, user_id, session_id, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, success, fallback_used, error_message, metadata",
    )
    .in("task_type", [...IDENTITY_STUDENT_TASK_TYPES])
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

  const runsList = ((runs ?? []) as unknown) as AIRunRow[];
  const runIds = runsList.map((run) => run.id);

  const [teacherRows, evalRows, snapshotResult] = await Promise.all([
    loadTeacherOutputs({
      client,
      taskTypes: [...IDENTITY_STUDENT_TASK_TYPES],
      runIds,
    }),
    runIds.length > 0
      ? client
          .from("ai_eval_runs")
          .select("ai_run_id, eval_type, score, passed, created_at, metadata")
          .in("ai_run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length > 0
      ? client
          .from("identity_profile_snapshots")
          .select(
            "id, ai_run_id, user_id, version, profile_json, profile_text, previous_snapshot_id, source_summary, contradiction_score, consumer_readiness, confidence, updated_at",
          )
          .in("ai_run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (evalRows.error) {
    throw new Error(evalRows.error.message);
  }
  if (snapshotResult.error) {
    throw new Error(snapshotResult.error.message);
  }

  const teacherByRunId = new Map<string, TeacherOutputRow>();
  for (const row of teacherRows) {
    const runId = normalizeTeacherRunId(row);
    if (!runId || teacherByRunId.has(runId)) continue;
    teacherByRunId.set(runId, row);
  }

  const evalsByRunId = new Map<string, EvalRow[]>();
  for (const row of (((evalRows.data ?? []) as unknown) as EvalRow[])) {
    const list = evalsByRunId.get(row.ai_run_id) ?? [];
    list.push(row);
    evalsByRunId.set(row.ai_run_id, list);
  }

  const snapshotByRunId = new Map<string, SnapshotRow>();
  for (const row of (((snapshotResult.data ?? []) as unknown) as SnapshotRow[])) {
    if (!row.ai_run_id || snapshotByRunId.has(row.ai_run_id)) continue;
    snapshotByRunId.set(row.ai_run_id, row);
  }

  let rows = runsList.map((run): IdentityTrainingDatasetRow => {
    const metadata = asObjectOrNull(run.metadata);
    const teacher = teacherByRunId.get(run.id) ?? null;
    const evals = evalsByRunId.get(run.id) ?? [];
    const snapshot = snapshotByRunId.get(run.id) ?? null;
    const profileView = buildProfileView({ run, snapshot });
    const isShadow = metadata?.shadowPass === true;
    const shouldPersistSnapshot = metadata?.persistSnapshot !== false && !isShadow;
    const shadowEval = evals.find((row) => row.eval_type === "identity_shadow") ?? null;
    const profileSuccess =
      run.success &&
      profileView.profile != null &&
      (isShadow || !shouldPersistSnapshot || snapshot != null);
    const hardNegativeKind = inferIdentityHardNegativeKind({
      success: run.success,
      errorMessage: run.error_message,
      hasSnapshot: snapshot != null,
      shouldPersistSnapshot,
      isShadow,
      shadowEvalPassed: shadowEval?.passed ?? null,
      hasProfile: profileView.profile != null,
    });

    return {
      id: `identity:${run.id}`,
      createdAt: run.created_at,
      aiRunId: run.id,
      taskType: run.task_type,
      userId: run.user_id,
      sessionId: run.session_id,
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
      runSuccess: run.success,
      success: profileSuccess,
      fallbackUsed: run.fallback_used,
      errorMessage: run.error_message,
      metadata,
      profile: {
        profileJson: profileView.profile,
        profileText: profileView.profileText,
        contradictionScore: profileView.contradictionScore,
        confidence: profileView.confidence,
        consumerReadiness: profileView.consumerReadiness,
      },
      snapshot: {
        id: snapshot?.id ?? null,
        version: snapshot?.version ?? null,
        previousSnapshotId: snapshot?.previous_snapshot_id ?? null,
        updatedAt: snapshot?.updated_at ?? null,
        sourceSummary:
          snapshot?.source_summary ??
          (asObjectOrNull(metadata?.sourceCounts) ?? null),
      },
      teacherOutput: {
        response: teacher?.teacher_response ?? teacher?.teacher_response_text ?? null,
        provider: teacher?.teacher_provider ?? null,
        model: teacher?.teacher_model ?? null,
        createdAt: teacher?.created_at ?? null,
        metadata: teacher?.metadata ?? null,
      },
      evals: evals.map((row) => ({
        evalType: row.eval_type,
        score: row.score,
        passed: row.passed,
        createdAt: row.created_at,
        metadata: row.metadata ?? null,
      })),
      hardNegative: {
        isHardNegative: hardNegativeKind != null,
        kind: hardNegativeKind,
        reasons: hardNegativeKind ? [hardNegativeKind] : [],
      },
    };
  });

  if (filters.onlyWithTeacher) {
    rows = rows.filter((row) => (row.teacherOutput.response ?? "").trim().length > 0);
  }

  if (typeof filters.minEvalScore === "number") {
    rows = rows.filter((row) =>
      row.evals.some((evalRow) => (evalRow.score ?? -1) >= filters.minEvalScore!),
    );
  }

  return {
    enabled: true,
    totalRunsScanned: runsList.length,
    rows,
  };
}

export async function exportIdentityTeacherDataset(
  filters: DatasetExportFilters,
): Promise<IdentityTeacherDatasetResult> {
  const training = await exportIdentityTrainingDataset({
    ...filters,
    onlyWithTeacher: true,
  });

  return {
    enabled: training.enabled,
    totalRunsScanned: training.totalRunsScanned,
    rows: training.rows
      .filter((row) => (row.teacherOutput.response ?? "").trim().length > 0)
      .map((row) => ({
        createdAt: row.createdAt,
        aiRunId: row.aiRunId,
        taskType: row.taskType,
        userId: row.userId,
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
        profileText: row.profile.profileText,
        snapshotId: row.snapshot.id,
        evals: row.evals,
        metadata: row.metadata,
      })),
  };
}
