import "server-only";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { StargazerGenerationSourceStage } from "@/lib/stargazer/studentTrack";

config({ path: ".env.local" });

const supabaseUrl =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase service role env is missing");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type PoolRow = {
  question_key: string;
  ai_run_id: string | null;
  generation_batch_id: string | null;
  axis_id: string;
  primary_lens_id: string | null;
  source: string | null;
  probe_type: string | null;
  depth_score: number | null;
  variant_json: Record<string, unknown> | null;
};

type AIRunRow = {
  id: string;
  task_type: string;
  metadata: Record<string, unknown> | null;
};

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function inferSourceStage(args: {
  batchId: string | null;
  taskType: string;
  source: string | null;
}): StargazerGenerationSourceStage {
  const batchId = args.batchId ?? "";
  if (batchId.includes("_seed")) return "seed";
  if (batchId.includes("_gen")) return "pool_generate";
  if (args.taskType === "stargazer_question_generation") {
    return batchId.startsWith("growth_") ? "growth_fill" : "pool_generate";
  }
  if (args.taskType === "stargazer_question_expansion") {
    if (batchId.startsWith("growth_") && args.source === "ai_expand") {
      return "growth_expand";
    }
    return batchId.startsWith("growth_") ? "growth_diversify" : "pool_generate";
  }
  return "pool_generate";
}

async function main() {
  const { data: existingRows, error: existingError } = await supabase
    .from("stargazer_generation_candidates")
    .select("accepted_entity_id")
    .eq("acceptance_status", "accepted");

  if (existingError) {
    throw new Error(`Failed to load existing candidates: ${existingError.message}`);
  }

  const existingAcceptedEntityIds = new Set(
    (existingRows ?? [])
      .map((row) => row.accepted_entity_id)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );

  const { data: poolRows, error: poolError } = await supabase
    .from("stargazer_question_pool")
    .select(
      "question_key, ai_run_id, generation_batch_id, axis_id, primary_lens_id, source, probe_type, depth_score, variant_json",
    )
    .not("ai_run_id", "is", null)
    .limit(2000);

  if (poolError) {
    throw new Error(`Failed to load pool rows: ${poolError.message}`);
  }

  const pendingPoolRows = ((poolRows ?? []) as PoolRow[]).filter(
    (row) => row.ai_run_id && !existingAcceptedEntityIds.has(row.question_key),
  );

  if (pendingPoolRows.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          inserted: 0,
          skipped: 0,
          message: "No historical Stargazer question rows required backfill.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const aiRunIds = Array.from(
    new Set(
      pendingPoolRows
        .map((row) => row.ai_run_id)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

  const aiRuns: AIRunRow[] = [];
  for (const chunk of chunkArray(aiRunIds, 200)) {
    const { data, error } = await supabase
      .from("ai_runs")
      .select("id, task_type, metadata")
      .in("id", chunk);

    if (error) {
      throw new Error(`Failed to load ai_runs: ${error.message}`);
    }

    aiRuns.push(
      ...(((data ?? []) as AIRunRow[]).map((row) => ({
        ...row,
        metadata: asObjectOrNull(row.metadata),
      })) as AIRunRow[]),
    );
  }

  const aiRunMap = new Map(aiRuns.map((row) => [row.id, row]));
  const runCounters = new Map<string, number>();
  const insertRows = pendingPoolRows
    .map((row) => {
      const aiRun = row.ai_run_id ? aiRunMap.get(row.ai_run_id) : null;
      if (!row.ai_run_id || !aiRun) return null;

      const nextIndex = runCounters.get(row.ai_run_id) ?? 0;
      runCounters.set(row.ai_run_id, nextIndex + 1);

      const variant = asObjectOrNull(row.variant_json);
      const normalizedOutput = {
        prompt: variant?.prompt ?? null,
        options: Array.isArray(variant?.options) ? variant?.options : [],
      };

      return {
        batch_id: row.generation_batch_id ?? null,
        ai_run_id: row.ai_run_id,
        task_type: aiRun.task_type,
        source_stage: inferSourceStage({
          batchId: row.generation_batch_id,
          taskType: aiRun.task_type,
          source: row.source,
        }),
        entity_type: "question",
        axis_id: row.axis_id,
        lens_id: row.primary_lens_id ?? null,
        candidate_index: nextIndex,
        request_context: aiRun.metadata ?? {},
        candidate_json: normalizedOutput,
        normalized_output: normalizedOutput,
        acceptance_status: "accepted",
        accepted_entity_id: row.question_key,
        rejection_reason: null,
        downstream_metrics: {},
      };
    })
    .filter(Boolean);

  let inserted = 0;
  for (const chunk of chunkArray(insertRows, 200)) {
    const { data, error } = await supabase
      .from("stargazer_generation_candidates")
      .insert(chunk)
      .select("id");

    if (error) {
      throw new Error(`Failed to insert backfill rows: ${error.message}`);
    }

    inserted += data?.length ?? chunk.length;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        inserted,
        skipped: (poolRows?.length ?? 0) - pendingPoolRows.length,
        aiRuns: aiRunIds.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

