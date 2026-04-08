/**
 * export-finetune-jsonl.ts
 *
 * Train/Val JSONL を teacher_outputs + ai_runs から生成する。
 * student_eval_cases は held-out eval set として除外。
 *
 * ゼロ Next.js 依存: server-only / next/* / App Router モジュールを踏まない。
 * Pure Node + @supabase/supabase-js のみ。
 *
 * Output:
 *   exports/train-{date}.jsonl       ← OpenAI / Qwen fine-tune 用 (messages のみ)
 *   exports/train-{date}.full.jsonl  ← メタデータ付き (analytics / HuggingFace 用)
 *   exports/val-{date}.jsonl         ← validation split (同形式)
 *   exports/train-{date}.stats.json  ← 統計
 *
 * Usage:
 *   npx tsx scripts/export-finetune-jsonl.ts
 *   TASK_TYPE=stargazer_alter_response npx tsx scripts/export-finetune-jsonl.ts
 *   LIMIT=1000 VAL_RATIO=0.15 npx tsx scripts/export-finetune-jsonl.ts
 *   SCOPE=utterance_reading npx tsx scripts/export-finetune-jsonl.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

// ── Config ───────────────────────────────────────────────────────────────────
const LIMIT = Number(process.env.LIMIT ?? "3000");
const TASK_TYPE_FILTER = process.env.TASK_TYPE ?? null;
const VAL_RATIO = Number(process.env.VAL_RATIO ?? "0.10");       // 10% validation
const OUT_DIR = process.env.OUT_DIR ?? path.join(process.cwd(), "exports");
const MIN_TEACHER_LEN = Number(process.env.MIN_TEACHER_LEN ?? "50"); // 50文字未満のteacher除外

// SCOPE shortcuts
const SCOPE = process.env.SCOPE ?? null;
const SCOPE_MAP: Record<string, string[]> = {
  utterance_reading: ["stargazer_alter_utterance_reading"],
  low_risk: [
    "stargazer_alter_utterance_reading",
    "stargazer_alter_response", // greeting / daily_guidance feature
  ],
  all: [], // no filter
};

// ── Types ────────────────────────────────────────────────────────────────────
type FineTuneMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type FineTuneEntry = {
  messages: FineTuneMessage[];
  _meta: {
    source: "teacher_outputs";
    teacher_output_id: string;
    ai_run_id: string;
    task_type: string;
    feature: string | null;
    mode: string | null;
    response_mode: string | null;
    action_shape: string | null;
    trust_level: number | null;
    hdm_phase: number | null;
    teacher_provider: string | null;
    teacher_model: string | null;
    teacher_latency_ms: number | null;
  };
};

type ExportStats = {
  exported_at: string;
  config: {
    task_type_filter: string | null;
    scope: string | null;
    limit: number;
    val_ratio: number;
    min_teacher_len: number;
  };
  eval_set_excluded: number;
  total_candidates: number;
  skipped_empty: number;
  train_rows: number;
  val_rows: number;
  by_task_type: Record<string, number>;
  by_feature: Record<string, number>;
  by_mode: Record<string, number>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Step 1: Load held-out eval set IDs to exclude ─────────────────────────
  console.log("[export] Loading held-out eval set (student_eval_cases)...");

  const { data: evalCases, error: evalError } = await supabase
    .from("student_eval_cases")
    .select("source_ai_run_id")
    .limit(10000);

  if (evalError) {
    console.warn(`[export] student_eval_cases query warning: ${evalError.message}`);
    console.warn("[export] Proceeding without eval set exclusion.");
  }

  const evalRunIds = new Set(
    (evalCases ?? [])
      .map((r) => r.source_ai_run_id)
      .filter((id): id is string => Boolean(id)),
  );
  console.log(`[export] Eval set: ${evalRunIds.size} ai_run_ids to exclude`);

  // ── Step 2: Fetch teacher_outputs + ai_runs ───────────────────────────────
  console.log("[export] Fetching teacher_outputs + ai_runs...");

  // Determine task_type filter
  let taskTypes: string[] | null = null;
  if (SCOPE && SCOPE_MAP[SCOPE]) {
    taskTypes = SCOPE_MAP[SCOPE].length > 0 ? SCOPE_MAP[SCOPE] : null;
  } else if (TASK_TYPE_FILTER) {
    taskTypes = [TASK_TYPE_FILTER];
  }

  // Query teacher_outputs
  let teacherQuery = supabase
    .from("teacher_outputs")
    .select(`
      id,
      ai_run_id,
      task_type,
      teacher_provider,
      teacher_model,
      teacher_response,
      metadata,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (taskTypes && taskTypes.length > 0) {
    teacherQuery = teacherQuery.in("task_type", taskTypes);
  }

  const { data: teacherRows, error: teacherError } = await teacherQuery;
  if (teacherError) throw new Error(`teacher_outputs query failed: ${teacherError.message}`);
  if (!teacherRows || teacherRows.length === 0) {
    console.warn("[export] No teacher_outputs found. Nothing to export.");
    process.exit(0);
  }

  console.log(`[export] Fetched ${teacherRows.length} teacher_outputs`);

  // ── Step 3: Fetch ai_runs for prompt + system_prompt + metadata ───────────
  const runIdsNeeded = teacherRows
    .map((t) => t.ai_run_id)
    .filter((id): id is string => Boolean(id));

  console.log(`[export] Fetching ${runIdsNeeded.length} ai_runs for prompts + metadata...`);

  type RunInfo = {
    prompt_text: string;
    system_prompt: string | null;
    latency_ms: number | null;
    metadata: Record<string, unknown> | null;
  };
  const runMap = new Map<string, RunInfo>();

  for (const ids of chunk(runIdsNeeded, 100)) {
    const { data: runs } = await supabase
      .from("ai_runs")
      .select("id, prompt_text, system_prompt, latency_ms, metadata")
      .in("id", ids);

    for (const r of runs ?? []) {
      runMap.set(r.id, {
        prompt_text: r.prompt_text ?? "",
        system_prompt: r.system_prompt ?? null,
        latency_ms: r.latency_ms ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      });
    }
  }

  console.log(`[export] Resolved ${runMap.size} ai_runs`);

  // ── Step 4: Build entries (excluding eval set) ────────────────────────────
  const entries: FineTuneEntry[] = [];
  let skippedEmpty = 0;
  let evalExcluded = 0;

  for (const t of teacherRows) {
    const aiRunId = t.ai_run_id as string;

    // Exclude held-out eval set
    if (evalRunIds.has(aiRunId)) {
      evalExcluded++;
      continue;
    }

    const teacherResponse = (t.teacher_response as string) ?? "";
    if (teacherResponse.trim().length < MIN_TEACHER_LEN) {
      skippedEmpty++;
      continue;
    }

    const run = runMap.get(aiRunId);
    if (!run || !run.prompt_text?.trim()) {
      skippedEmpty++;
      continue;
    }

    const meta = run.metadata;
    const messages: FineTuneMessage[] = [];

    if (run.system_prompt?.trim()) {
      messages.push({ role: "system", content: run.system_prompt.trim() });
    }
    messages.push({ role: "user", content: run.prompt_text.trim() });
    messages.push({ role: "assistant", content: teacherResponse.trim() });

    entries.push({
      messages,
      _meta: {
        source: "teacher_outputs",
        teacher_output_id: t.id as string,
        ai_run_id: aiRunId,
        task_type: (t.task_type as string) ?? "unknown",
        feature: typeof meta?.feature === "string" ? meta.feature : null,
        mode: typeof meta?.mode === "string" ? meta.mode : null,
        response_mode: typeof meta?.responseMode === "string" ? meta.responseMode : null,
        action_shape: typeof meta?.actionShape === "string" ? meta.actionShape : null,
        trust_level: typeof meta?.trustLevel === "number" ? meta.trustLevel : null,
        hdm_phase: typeof meta?.hdmPhase === "number" ? meta.hdmPhase : null,
        teacher_provider: (t.teacher_provider as string) ?? null,
        teacher_model: (t.teacher_model as string) ?? null,
        teacher_latency_ms: run.latency_ms,
      },
    });
  }

  console.log(`[export] ${entries.length} entries built (eval excluded: ${evalExcluded}, skipped: ${skippedEmpty})`);

  if (entries.length === 0) {
    console.warn("[export] No valid entries. Check teacher_outputs + ai_runs data quality.");
    process.exit(0);
  }

  // ── Step 5: Train/Val split ───────────────────────────────────────────────
  const shuffled = deterministicShuffle(entries, 42);
  const valCount = Math.max(1, Math.floor(shuffled.length * VAL_RATIO));
  const valEntries = shuffled.slice(0, valCount);
  const trainEntries = shuffled.slice(valCount);

  console.log(`[export] Split: train=${trainEntries.length} val=${valEntries.length}`);

  // ── Step 6: Compute stats ─────────────────────────────────────────────────
  const stats: ExportStats = {
    exported_at: new Date().toISOString(),
    config: {
      task_type_filter: TASK_TYPE_FILTER,
      scope: SCOPE,
      limit: LIMIT,
      val_ratio: VAL_RATIO,
      min_teacher_len: MIN_TEACHER_LEN,
    },
    eval_set_excluded: evalExcluded,
    total_candidates: teacherRows.length,
    skipped_empty: skippedEmpty,
    train_rows: trainEntries.length,
    val_rows: valEntries.length,
    by_task_type: {},
    by_feature: {},
    by_mode: {},
  };

  for (const e of entries) {
    const tt = e._meta.task_type;
    stats.by_task_type[tt] = (stats.by_task_type[tt] ?? 0) + 1;
    const feat = e._meta.feature ?? "unknown";
    stats.by_feature[feat] = (stats.by_feature[feat] ?? 0) + 1;
    const mode = e._meta.mode ?? "unknown";
    stats.by_mode[mode] = (stats.by_mode[mode] ?? 0) + 1;
  }

  // ── Step 7: Write files ───────────────────────────────────────────────────
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const scopeTag = SCOPE ?? (TASK_TYPE_FILTER ? TASK_TYPE_FILTER.replace(/[^a-z0-9]/g, "_") : "all");

  function writeJsonl(entries: FineTuneEntry[], label: string) {
    const cleanPath = path.join(OUT_DIR, `${label}-${dateStr}-${scopeTag}.jsonl`);
    const fullPath = path.join(OUT_DIR, `${label}-${dateStr}-${scopeTag}.full.jsonl`);

    const cleanLines = entries.map((e) => JSON.stringify({ messages: e.messages }));
    fs.writeFileSync(cleanPath, cleanLines.join("\n") + "\n", "utf-8");

    const fullLines = entries.map((e) => JSON.stringify(e));
    fs.writeFileSync(fullPath, fullLines.join("\n") + "\n", "utf-8");

    return { cleanPath, fullPath };
  }

  const trainPaths = writeJsonl(trainEntries, "train");
  const valPaths = writeJsonl(valEntries, "val");

  const statsPath = path.join(OUT_DIR, `stats-${dateStr}-${scopeTag}.json`);
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf-8");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n[export] Done.");
  console.log(`  Train JSONL:  ${trainPaths.cleanPath}`);
  console.log(`  Train Full:   ${trainPaths.fullPath}`);
  console.log(`  Val JSONL:    ${valPaths.cleanPath}`);
  console.log(`  Val Full:     ${valPaths.fullPath}`);
  console.log(`  Stats:        ${statsPath}`);
  console.log(`\n  Total entries:      ${entries.length}`);
  console.log(`  Train:              ${trainEntries.length}`);
  console.log(`  Val:                ${valEntries.length}`);
  console.log(`  Eval set excluded:  ${evalExcluded}`);
  console.log(`  Skipped (empty):    ${skippedEmpty}`);

  console.log(`\n  By task_type:`);
  for (const [tt, count] of Object.entries(stats.by_task_type).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tt.padEnd(45)} ${count}`);
  }
  console.log(`\n  By feature:`);
  for (const [f, count] of Object.entries(stats.by_feature).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${f.padEnd(25)} ${count}`);
  }
  console.log(`\n  By mode:`);
  for (const [m, count] of Object.entries(stats.by_mode).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${m.padEnd(25)} ${count}`);
  }
}

main().catch((err) => {
  console.error("[export] Fatal:", err);
  process.exit(1);
});
