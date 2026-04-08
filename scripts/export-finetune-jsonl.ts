/**
 * export-finetune-jsonl.ts
 *
 * Gap A: student_eval_cases → fine-tuning JSONL
 *
 * Queries student_eval_cases (curated gold dataset) and exports them
 * as JSONL in OpenAI/Qwen2.5 fine-tuning format.
 *
 * Gap B: mode is pulled from ai_runs.metadata via source_ai_run_id.
 * shape/trust/phase are embedded in the system_prompt by the Judgment OS
 * so they're implicitly captured in the training data.
 *
 * Output: exports/finetune-{YYYY-MM-DD}.jsonl
 *         exports/finetune-{YYYY-MM-DD}.stats.json
 *
 * Usage:
 *   npx tsx scripts/export-finetune-jsonl.ts
 *   DOMAIN=conversation npx tsx scripts/export-finetune-jsonl.ts
 *   TASK_TYPE=stargazer_alter_response npx tsx scripts/export-finetune-jsonl.ts
 *   QUALITY_TIER=gold npx tsx scripts/export-finetune-jsonl.ts
 *   LIMIT=500 npx tsx scripts/export-finetune-jsonl.ts
 */

import "server-only";

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

// ── Config from env ──────────────────────────────────────────────────────────
const LIMIT = Number(process.env.LIMIT ?? "2000");
const DOMAIN_FILTER = process.env.DOMAIN ?? null;            // e.g. "conversation"
const TASK_TYPE_FILTER = process.env.TASK_TYPE ?? null;       // e.g. "stargazer_alter_response"
const QUALITY_TIER = process.env.QUALITY_TIER ?? "gold";      // gold | silver | negative
const INCLUDE_NEGATIVE = process.env.INCLUDE_NEGATIVE === "true";
const OUT_DIR = process.env.OUT_DIR ?? path.join(process.cwd(), "exports");

// ── JSONL entry type ──────────────────────────────────────────────────────────
type FineTuneMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type FineTuneEntry = {
  messages: FineTuneMessage[];
  // Extended metadata — OpenAI ignores unknown fields; other frameworks use these
  _meta: {
    eval_case_id: string;
    task_type: string;
    domain: string;
    difficulty: string;
    quality_tier: string;
    mode: string | null;
    teacher_provider: string | null;
    teacher_model: string | null;
    teacher_latency_ms: number | null;
  };
};

// ── Stats type ───────────────────────────────────────────────────────────────
type ExportStats = {
  exported_at: string;
  filters: {
    domain: string | null;
    task_type: string | null;
    quality_tier: string;
    limit: number;
  };
  total_rows: number;
  by_domain: Record<string, number>;
  by_task_type: Record<string, number>;
  by_difficulty: Record<string, number>;
  by_mode: Record<string, number>;
  skipped_empty_prompt: number;
  skipped_empty_response: number;
};

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("missing_supabase_env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("[export-finetune-jsonl] Querying student_eval_cases...");

  // ── Step 1: Fetch student_eval_cases ──────────────────────────────────────
  let query = supabase
    .from("student_eval_cases")
    .select(`
      id,
      task_type,
      domain,
      difficulty,
      quality_tier,
      prompt_text,
      system_prompt,
      gold_response,
      gold_structured,
      teacher_provider,
      teacher_model,
      teacher_latency_ms,
      source_ai_run_id,
      metadata
    `)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  // Quality tier filter
  if (INCLUDE_NEGATIVE) {
    // include all
  } else if (QUALITY_TIER === "gold") {
    query = query.eq("quality_tier", "gold");
  } else {
    query = query.in("quality_tier", [QUALITY_TIER]);
  }

  if (DOMAIN_FILTER) {
    query = query.eq("domain", DOMAIN_FILTER);
  }
  if (TASK_TYPE_FILTER) {
    query = query.eq("task_type", TASK_TYPE_FILTER);
  }

  const { data: cases, error } = await query;
  if (error) throw new Error(`student_eval_cases query failed: ${error.message}`);
  if (!cases || cases.length === 0) {
    console.warn("[export-finetune-jsonl] No cases found. Check filters or run build-student-eval-set.sql first.");
    process.exit(0);
  }

  console.log(`[export-finetune-jsonl] Found ${cases.length} cases. Fetching ai_runs metadata...`);

  // ── Step 2: Fetch ai_runs.metadata for mode (Gap B) ──────────────────────
  const runIds = cases
    .map((c) => c.source_ai_run_id)
    .filter((id): id is string => Boolean(id));

  const modeMap = new Map<string, string | null>();
  if (runIds.length > 0) {
    // Batch in chunks of 500 to avoid URL length limits
    const chunks: string[][] = [];
    for (let i = 0; i < runIds.length; i += 500) {
      chunks.push(runIds.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const { data: runs } = await supabase
        .from("ai_runs")
        .select("id, metadata")
        .in("id", chunk);
      for (const run of runs ?? []) {
        const meta = run.metadata as Record<string, unknown> | null;
        const mode = typeof meta?.mode === "string" ? meta.mode : null;
        modeMap.set(run.id, mode);
      }
    }
  }

  console.log(`[export-finetune-jsonl] Resolved mode for ${modeMap.size} runs.`);

  // ── Step 3: Build JSONL entries ───────────────────────────────────────────
  const entries: FineTuneEntry[] = [];
  const stats: ExportStats = {
    exported_at: new Date().toISOString(),
    filters: {
      domain: DOMAIN_FILTER,
      task_type: TASK_TYPE_FILTER,
      quality_tier: QUALITY_TIER,
      limit: LIMIT,
    },
    total_rows: 0,
    by_domain: {},
    by_task_type: {},
    by_difficulty: {},
    by_mode: {},
    skipped_empty_prompt: 0,
    skipped_empty_response: 0,
  };

  for (const c of cases) {
    if (!c.prompt_text?.trim()) {
      stats.skipped_empty_prompt++;
      continue;
    }
    if (!c.gold_response?.trim()) {
      stats.skipped_empty_response++;
      continue;
    }

    const mode = c.source_ai_run_id ? (modeMap.get(c.source_ai_run_id) ?? null) : null;

    const messages: FineTuneMessage[] = [];

    // System prompt (contains Alter personality + judgment OS context)
    if (c.system_prompt?.trim()) {
      messages.push({ role: "system", content: c.system_prompt.trim() });
    }

    // User message
    messages.push({ role: "user", content: c.prompt_text.trim() });

    // Assistant response (gold / teacher output)
    messages.push({ role: "assistant", content: c.gold_response.trim() });

    entries.push({
      messages,
      _meta: {
        eval_case_id: c.id,
        task_type: c.task_type,
        domain: c.domain,
        difficulty: c.difficulty,
        quality_tier: c.quality_tier,
        mode,
        teacher_provider: c.teacher_provider ?? null,
        teacher_model: c.teacher_model ?? null,
        teacher_latency_ms: c.teacher_latency_ms ?? null,
      },
    });

    // Stats
    stats.by_domain[c.domain] = (stats.by_domain[c.domain] ?? 0) + 1;
    stats.by_task_type[c.task_type] = (stats.by_task_type[c.task_type] ?? 0) + 1;
    stats.by_difficulty[c.difficulty] = (stats.by_difficulty[c.difficulty] ?? 0) + 1;
    const modeKey = mode ?? "unknown";
    stats.by_mode[modeKey] = (stats.by_mode[modeKey] ?? 0) + 1;
  }

  stats.total_rows = entries.length;

  // ── Step 4: Write output files ────────────────────────────────────────────
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = [
    DOMAIN_FILTER ? `domain-${DOMAIN_FILTER}` : null,
    TASK_TYPE_FILTER ? `task-${TASK_TYPE_FILTER.replace(/[^a-z0-9]/g, "_")}` : null,
  ]
    .filter(Boolean)
    .join("_");
  const baseName = suffix ? `finetune-${dateStr}-${suffix}` : `finetune-${dateStr}`;

  const jsonlPath = path.join(OUT_DIR, `${baseName}.jsonl`);
  const statsPath = path.join(OUT_DIR, `${baseName}.stats.json`);

  // Write JSONL (one JSON object per line, _meta stripped for clean OpenAI format)
  const jsonlLines = entries.map((entry) => JSON.stringify({ messages: entry.messages }));
  fs.writeFileSync(jsonlPath, jsonlLines.join("\n") + "\n", "utf-8");

  // Write full entries with meta (for analytics / Qwen / HuggingFace)
  const fullJsonlPath = path.join(OUT_DIR, `${baseName}.full.jsonl`);
  const fullLines = entries.map((entry) => JSON.stringify(entry));
  fs.writeFileSync(fullJsonlPath, fullLines.join("\n") + "\n", "utf-8");

  // Write stats
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf-8");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n[export-finetune-jsonl] ✓ Export complete");
  console.log(`  OpenAI JSONL:   ${jsonlPath}`);
  console.log(`  Full JSONL:     ${fullJsonlPath}`);
  console.log(`  Stats:          ${statsPath}`);
  console.log(`\n  Total rows:     ${stats.total_rows}`);
  console.log(`  Skipped:        ${stats.skipped_empty_prompt + stats.skipped_empty_response} (empty prompt/response)`);
  console.log(`\n  By domain:`);
  for (const [domain, count] of Object.entries(stats.by_domain).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${domain.padEnd(20)} ${count}`);
  }
  console.log(`\n  By task_type:`);
  for (const [tt, count] of Object.entries(stats.by_task_type).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tt.padEnd(40)} ${count}`);
  }
  console.log(`\n  By difficulty:`);
  for (const [d, count] of Object.entries(stats.by_difficulty)) {
    console.log(`    ${d.padEnd(20)} ${count}`);
  }
  console.log(`\n  By mode (from ai_runs.metadata):`);
  for (const [m, count] of Object.entries(stats.by_mode).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${m.padEnd(20)} ${count}`);
  }

  if (stats.total_rows < 50) {
    console.warn(`\n  [WARN] Only ${stats.total_rows} rows exported.`);
    console.warn("  Run scripts/build-student-eval-set.sql in Supabase SQL editor to populate student_eval_cases.");
  }
}

main().catch((err) => {
  console.error("[export-finetune-jsonl] Fatal:", err);
  process.exit(1);
});
