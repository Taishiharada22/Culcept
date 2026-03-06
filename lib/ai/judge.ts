import "server-only";

import { getAIServiceClient } from "./db";

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export type AutoEvalBatchSummary = {
  enabled: boolean;
  dryRun: boolean;
  scanned: number;
  evaluated: number;
  failed: number;
  items: Array<{
    aiRunId: string;
    taskType: string;
    score: number | null;
    passed: boolean;
    error?: string;
  }>;
};

export async function runAutoEvalBatch(args: {
  batchSize?: number;
  lookbackHours?: number;
  taskTypes?: string[];
  allowReeval?: boolean;
  dryRun?: boolean;
}): Promise<AutoEvalBatchSummary> {
  const enabled = envBool("AI_AUTO_EVAL_ENABLED", false);
  const dryRun = args.dryRun ?? false;

  if (!enabled) {
    return {
      enabled: false,
      dryRun,
      scanned: 0,
      evaluated: 0,
      failed: 0,
      items: [],
    };
  }

  const client = getAIServiceClient();
  if (!client) {
    return {
      enabled: true,
      dryRun,
      scanned: 0,
      evaluated: 0,
      failed: 0,
      items: [],
    };
  }

  const batchSize = args.batchSize ?? 10;
  const lookbackHours = args.lookbackHours ?? 24;
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  try {
    let query = client
      .from("ai_runs")
      .select("id, task_type, provider, model, prompt_text, system_prompt, response_text, structured_json, success, metadata")
      .eq("success", true)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(batchSize);

    if (args.taskTypes && args.taskTypes.length > 0) {
      query = query.in("task_type", args.taskTypes);
    }

    const { data: runs, error: runsError } = await query;
    if (runsError) {
      console.warn("[ai/judge] failed to fetch runs:", runsError.message);
      return { enabled: true, dryRun, scanned: 0, evaluated: 0, failed: 0, items: [] };
    }

    const candidates = runs ?? [];

    if (!args.allowReeval && candidates.length > 0) {
      const runIds = candidates.map((r) => r.id);
      const { data: existingEvals } = await client
        .from("ai_eval_runs")
        .select("ai_run_id")
        .in("ai_run_id", runIds);

      const evaluated = new Set((existingEvals ?? []).map((e) => e.ai_run_id));
      const filtered = candidates.filter((r) => !evaluated.has(r.id));
      candidates.length = 0;
      candidates.push(...filtered);
    }

    const items: AutoEvalBatchSummary["items"] = [];

    for (const run of candidates) {
      try {
        const score = evaluateResponse(run);
        const passed = score >= 0.5;

        if (!dryRun) {
          await client.from("ai_eval_runs").insert({
            ai_run_id: run.id,
            task_type: run.task_type,
            eval_type: "auto",
            score,
            passed,
            metadata: { provider: run.provider, model: run.model },
          });
        }

        items.push({
          aiRunId: run.id,
          taskType: run.task_type,
          score,
          passed,
        });
      } catch (error) {
        items.push({
          aiRunId: run.id,
          taskType: run.task_type,
          score: null,
          passed: false,
          error: error instanceof Error ? error.message : "eval_error",
        });
      }
    }

    return {
      enabled: true,
      dryRun,
      scanned: candidates.length,
      evaluated: items.filter((i) => i.score != null).length,
      failed: items.filter((i) => i.score == null).length,
      items,
    };
  } catch (error) {
    console.error("[ai/judge] batch execution failed:", error);
    throw error;
  }
}

function evaluateResponse(run: Record<string, unknown>): number {
  const responseText = String(run.response_text ?? "");
  if (!responseText.trim()) return 0;

  let score = 0.5;

  if (responseText.length > 20) score += 0.1;
  if (responseText.length > 100) score += 0.1;
  if (responseText.length > 500) score += 0.1;

  if (run.structured_json && typeof run.structured_json === "object") {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}
