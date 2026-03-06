import "server-only";

import { getAIServiceClient } from "./db";

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export type DatasetExportRow = {
  id: string;
  createdAt: string;
  taskType: string;
  provider: string;
  model: string;
  promptText: string;
  systemPrompt: string | null;
  responseText: string;
  structuredJson: Record<string, unknown> | null;
  teacherResponse: string | null;
  evalScore: number | null;
  evalPassed: boolean | null;
  metadata: Record<string, unknown> | null;
};

export type DatasetExportResult = {
  enabled: boolean;
  totalRunsScanned: number;
  rows: DatasetExportRow[];
};

export type DatasetExportFilters = {
  taskTypes?: string[];
  lookbackHours?: number;
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  onlySuccessful?: boolean;
  onlyWithTeacher?: boolean;
  minEvalScore?: number;
};

export async function exportAIDataset(
  filters: DatasetExportFilters,
): Promise<DatasetExportResult> {
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
    .select("id, created_at, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.onlySuccessful !== false) {
    query = query.eq("success", true);
  }

  if (filters.taskTypes && filters.taskTypes.length > 0) {
    query = query.in("task_type", filters.taskTypes);
  }

  if (filters.lookbackHours) {
    const cutoff = new Date(Date.now() - filters.lookbackHours * 60 * 60 * 1000).toISOString();
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

  const runsList = runs ?? [];
  const runIds = runsList.map((r) => r.id);

  let teacherMap: Map<string, string> = new Map();
  if (runIds.length > 0) {
    const { data: teachers } = await client
      .from("teacher_outputs")
      .select("ai_run_id, teacher_response")
      .in("ai_run_id", runIds);

    for (const t of teachers ?? []) {
      teacherMap.set(t.ai_run_id, t.teacher_response);
    }
  }

  let evalMap: Map<string, { score: number; passed: boolean }> = new Map();
  if (runIds.length > 0) {
    const { data: evals } = await client
      .from("ai_eval_runs")
      .select("ai_run_id, score, passed")
      .in("ai_run_id", runIds);

    for (const e of evals ?? []) {
      evalMap.set(e.ai_run_id, { score: e.score, passed: e.passed });
    }
  }

  let rows: DatasetExportRow[] = runsList.map((run) => {
    const teacher = teacherMap.get(run.id) ?? null;
    const evalResult = evalMap.get(run.id) ?? null;

    return {
      id: run.id,
      createdAt: run.created_at,
      taskType: run.task_type,
      provider: run.provider,
      model: run.model ?? "",
      promptText: run.prompt_text,
      systemPrompt: run.system_prompt ?? null,
      responseText: run.response_text ?? "",
      structuredJson: run.structured_json ?? null,
      teacherResponse: teacher,
      evalScore: evalResult?.score ?? null,
      evalPassed: evalResult?.passed ?? null,
      metadata: run.metadata ?? null,
    };
  });

  if (filters.onlyWithTeacher) {
    rows = rows.filter((r) => r.teacherResponse != null);
  }

  if (filters.minEvalScore != null) {
    rows = rows.filter((r) => r.evalScore != null && r.evalScore >= filters.minEvalScore!);
  }

  return {
    enabled: true,
    totalRunsScanned: runsList.length,
    rows,
  };
}

export function toJsonl(rows: DatasetExportRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}
