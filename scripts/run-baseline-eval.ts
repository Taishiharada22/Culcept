/**
 * run-baseline-eval.ts
 *
 * Held-out 198件 (student_eval_cases) に対して gpt-4o-mini (素の状態) を実行し、
 * 6軸評価メトリクスのベースラインを計測する。
 *
 * Zero Next.js dependency — pure Node + @supabase/supabase-js + raw OpenAI fetch
 *
 * Output:
 *   exports/baseline-eval-{date}.json   ← 全結果
 *   stdout にサマリーレポート
 *
 * Usage:
 *   npx tsx scripts/run-baseline-eval.ts
 *   LIMIT=20 npx tsx scripts/run-baseline-eval.ts          # 小規模テスト
 *   DOMAIN=utterance_reading npx tsx scripts/run-baseline-eval.ts
 *   MODEL=gpt-4o npx tsx scripts/run-baseline-eval.ts       # モデル変更
 *   CONCURRENCY=3 npx tsx scripts/run-baseline-eval.ts      # 並列数
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

// ── Config ───────────────────────────────────────────────────────────────────
const LIMIT = Number(process.env.LIMIT ?? "10000");
const DOMAIN_FILTER = process.env.DOMAIN ?? null;
const STUDENT_MODEL = process.env.MODEL ?? "gpt-4o-mini";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "5");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? "30000");
const OUT_DIR = process.env.OUT_DIR ?? path.join(process.cwd(), "exports");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6-axis evaluation (inlined from studentEvaluation.ts — no server-only dep)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type StudentComparisonMetrics = {
  taskMatch: boolean;
  modeMatch: boolean;
  validatorPassed: boolean;
  isGeneric: boolean;
  personalityConsistent: boolean;
  directnessScore: number;
  specificityScore: number;
  personalizationScore: number;
  actionabilityScore: number;
  overallScore: number;
  pass: boolean;
};

const METRIC_WEIGHTS = {
  personalityConsistency: 0.25,
  validatorPass: 0.20,
  genericRate: 0.15,
  specificity: 0.15,
  taskMatch: 0.10,
  modeMatch: 0.10,
  directness: 0.05,
} as const;

const PASS_THRESHOLD = 0.70;

function compareTaskJudgment(
  teacher: Record<string, unknown> | null,
  student: Record<string, unknown> | null,
): boolean {
  if (!teacher || !student) return false;
  const judgmentKeys = [
    "response_mode", "action_shape", "seeking_type",
    "engagement_level", "emotional_state", "domain",
  ];
  let matches = 0;
  let compared = 0;
  for (const key of judgmentKeys) {
    if (key in teacher) {
      compared++;
      if (String(teacher[key]) === String(student[key])) matches++;
    }
  }
  return compared === 0 || matches / compared >= 0.6;
}

function compareModeSelection(
  teacher: Record<string, unknown> | null,
  student: Record<string, unknown> | null,
): boolean {
  if (!teacher || !student) return false;
  const teacherMode = String(teacher.response_mode ?? teacher.mode ?? "");
  const studentMode = String(student.response_mode ?? student.mode ?? "");
  if (!teacherMode || !studentMode) return false;
  return teacherMode === studentMode;
}

function checkValidatorCompliance(response: string, structured: Record<string, unknown> | null, taskType: string): boolean {
  const trimmed = response.trim();
  if (!trimmed || trimmed.length < 10) return false;
  if (/^(undefined|null|error|sorry|申し訳)$/i.test(trimmed)) return false;
  if (taskType.includes("utterance_reading") || taskType.includes("prediction")) {
    if (!structured || Object.keys(structured).length === 0) return false;
  }
  const japaneseRatio = (trimmed.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length / trimmed.length;
  if (trimmed.length > 20 && japaneseRatio < 0.1) return false;
  return true;
}

function detectGenericResponse(response: string): boolean {
  const trimmed = response.trim();
  const genericPatterns = [
    /それは大変ですね/, /頑張ってください/, /お気持ちはわかります/,
    /そうですね。?$/, /なるほど。?$/, /一般的に[はは]/,
    /いろいろな考え方があ/, /人それぞれ/, /大丈夫です[よか]/,
  ];
  for (const pattern of genericPatterns) {
    if (pattern.test(trimmed)) return true;
  }
  if (trimmed.length < 30) return true;
  return false;
}

function checkPersonalityConsistency(_teacherResponse: string, studentResponse: string): boolean {
  const markers = {
    firstPerson: /僕[はがもをに]/.test(studentResponse),
    directTone: !/(?:かもしれません|と思われます|でしょうか。$)/.test(studentResponse),
    casualRegister: !/(?:ございます|いたします|させていただき)/.test(studentResponse),
    assertive: /(?:だ[。！]|だと思う|だろう|はず[だ。])/.test(studentResponse) ||
               /(?:だな|だぜ|だよ|だね)/.test(studentResponse),
  };
  return Object.values(markers).filter(Boolean).length >= 3;
}

function scoreDirectness(response: string): number {
  const trimmed = response.trim();
  let score = 0.5;
  if (/^[「『]?[あ-ん]{1,3}[、。]/.test(trimmed)) score -= 0.1;
  if (/^[僕俺それこれ]/.test(trimmed)) score += 0.15;
  const hedges = (trimmed.match(/(?:かも|たぶん|おそらく|もしかして|一概に)/g) || []).length;
  score -= hedges * 0.1;
  if (/[。！]$/.test(trimmed)) score += 0.1;
  return Math.max(0, Math.min(1, score));
}

function scoreSpecificity(studentResponse: string, teacherResponse: string): number {
  const studentSpecifics = (studentResponse.match(/[0-9０-９]+|「[^」]+」|[A-Z]{2,}/g) || []).length;
  const teacherSpecifics = (teacherResponse.match(/[0-9０-９]+|「[^」]+」|[A-Z]{2,}/g) || []).length;
  if (teacherSpecifics === 0) return studentSpecifics > 0 ? 1.0 : 0.5;
  return Math.min(1, studentSpecifics / teacherSpecifics);
}

function scorePersonalization(response: string): number {
  let score = 0.3;
  if (/あなた[はがの]/.test(response) || /君[はがの]/.test(response)) score += 0.2;
  if (/例えば|具体的に|たとえば/.test(response)) score += 0.15;
  if (/前[にも]言って|以前の|覚えて/.test(response)) score += 0.2;
  if (!/一般的|普通は|多くの人/.test(response)) score += 0.15;
  return Math.min(1, score);
}

function scoreActionability(response: string): number {
  let score = 0.3;
  if (/(?:した方がいい|やってみ|始めて|試して|考えて)/.test(response)) score += 0.25;
  if (/(?:今日|明日|今週|まず|最初に|直近)/.test(response)) score += 0.2;
  if (/(?:ステップ|手順|第[一二三]|1\.|①)/.test(response)) score += 0.15;
  if (/(?:なぜなら|理由は|というのは|だから)/.test(response)) score += 0.1;
  return Math.min(1, score);
}

function compareStudentToTeacher(args: {
  teacherResponse: string;
  studentResponse: string;
  teacherStructured: Record<string, unknown> | null;
  studentStructured: Record<string, unknown> | null;
  taskType: string;
}): StudentComparisonMetrics {
  const { teacherResponse, studentResponse, teacherStructured, studentStructured, taskType } = args;
  const taskMatch = compareTaskJudgment(teacherStructured, studentStructured);
  const modeMatch = compareModeSelection(teacherStructured, studentStructured);
  const validatorPassed = checkValidatorCompliance(studentResponse, studentStructured, taskType);
  const isGeneric = detectGenericResponse(studentResponse);
  const personalityConsistent = checkPersonalityConsistency(teacherResponse, studentResponse);
  const directnessScore = scoreDirectness(studentResponse);
  const specificityScore = scoreSpecificity(studentResponse, teacherResponse);
  const personalizationScore = scorePersonalization(studentResponse);
  const actionabilityScore = scoreActionability(studentResponse);
  const overallScore =
    (personalityConsistent ? 1 : 0) * METRIC_WEIGHTS.personalityConsistency +
    (validatorPassed ? 1 : 0) * METRIC_WEIGHTS.validatorPass +
    (isGeneric ? 0 : 1) * METRIC_WEIGHTS.genericRate +
    specificityScore * METRIC_WEIGHTS.specificity +
    (taskMatch ? 1 : 0) * METRIC_WEIGHTS.taskMatch +
    (modeMatch ? 1 : 0) * METRIC_WEIGHTS.modeMatch +
    directnessScore * METRIC_WEIGHTS.directness;
  const pass = overallScore >= PASS_THRESHOLD;
  return {
    taskMatch, modeMatch, validatorPassed, isGeneric, personalityConsistent,
    directnessScore, specificityScore, personalizationScore, actionabilityScore,
    overallScore, pass,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OpenAI call (raw fetch — no SDK, no server-only deps)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callOpenAI(args: {
  systemPrompt: string | null;
  userPrompt: string;
  requireJson: boolean;
  model: string;
}): Promise<{ text: string; structured: Record<string, unknown> | null; latencyMs: number }> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const messages: Array<{ role: string; content: string }> = [];
  if (args.systemPrompt?.trim()) {
    let sys = args.systemPrompt.trim();
    if (args.requireJson) sys += "\n\nYou must return exactly one valid JSON value. Return JSON only. Do not use markdown fences.";
    messages.push({ role: "system", content: sys });
  } else if (args.requireJson) {
    messages.push({ role: "system", content: "You must return exactly one valid JSON value. Return JSON only. Do not use markdown fences." });
  }
  messages.push({ role: "user", content: args.userPrompt.trim() });

  const payload: Record<string, unknown> = {
    model: args.model,
    messages,
    temperature: 0.3,
    max_tokens: 2048,
  };
  if (args.requireJson) {
    payload.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    }

    const raw = await res.json();
    const text = raw?.choices?.[0]?.message?.content?.trim() ?? "";
    const latencyMs = Date.now() - start;

    let structured: Record<string, unknown> | null = null;
    if (args.requireJson && text) {
      try { structured = JSON.parse(text); } catch { /* non-JSON response */ }
    }

    return { text, structured, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Eval runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type EvalCaseResult = {
  evalCaseId: string;
  taskType: string;
  domain: string;
  difficulty: string;
  studentResponse: string;
  studentLatencyMs: number;
  studentError: string | null;
  metrics: StudentComparisonMetrics | null;
};

type EvalReport = {
  model: string;
  evaluatedAt: string;
  totalCases: number;
  completedCases: number;
  errorCases: number;
  overallPassRate: number;
  personalityConsistencyRate: number;
  genericRate: number;
  taskMatchRate: number;
  modeMatchRate: number;
  validatorPassRate: number;
  avgOverallScore: number;
  avgDirectness: number;
  avgSpecificity: number;
  avgPersonalization: number;
  avgActionability: number;
  avgLatencyMs: number;
  byDomain: Record<string, {
    count: number;
    passRate: number;
    personalityConsistencyRate: number;
    genericRate: number;
    taskMatchRate: number;
    modeMatchRate: number;
    avgOverallScore: number;
  }>;
  byTaskType: Record<string, {
    count: number;
    passRate: number;
    avgOverallScore: number;
  }>;
  cases: EvalCaseResult[];
};

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRole) throw new Error("missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Step 1: Load held-out eval cases ──────────────────────────────────────
  console.log(`[eval] Loading held-out eval cases (model=${STUDENT_MODEL})...`);

  let query = supabase
    .from("student_eval_cases")
    .select("id, task_type, domain, difficulty, prompt_text, system_prompt, gold_response, gold_structured")
    .eq("quality_tier", "gold")
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  if (DOMAIN_FILTER) {
    query = query.eq("domain", DOMAIN_FILTER);
  }

  const { data: cases, error } = await query;
  if (error) throw new Error(`student_eval_cases query failed: ${error.message}`);
  if (!cases || cases.length === 0) {
    console.warn("[eval] No eval cases found.");
    process.exit(0);
  }

  console.log(`[eval] Loaded ${cases.length} cases. Running ${STUDENT_MODEL}...`);

  // ── Step 2: Run student model on each case ────────────────────────────────
  let completed = 0;

  const results = await runWithConcurrency(
    cases,
    async (c, idx): Promise<EvalCaseResult> => {
      const isStructured = c.task_type.includes("utterance_reading") || c.task_type.includes("prediction");

      try {
        const { text, structured, latencyMs } = await callOpenAI({
          systemPrompt: c.system_prompt,
          userPrompt: c.prompt_text,
          requireJson: isStructured,
          model: STUDENT_MODEL,
        });

        const goldStructured = c.gold_structured as Record<string, unknown> | null;
        const metrics = compareStudentToTeacher({
          teacherResponse: c.gold_response,
          studentResponse: text,
          teacherStructured: goldStructured,
          studentStructured: structured,
          taskType: c.task_type,
        });

        completed++;
        if (completed % 10 === 0 || completed === cases.length) {
          process.stdout.write(`\r[eval] Progress: ${completed}/${cases.length} (${((completed / cases.length) * 100).toFixed(0)}%)`);
        }

        return {
          evalCaseId: c.id,
          taskType: c.task_type,
          domain: c.domain,
          difficulty: c.difficulty,
          studentResponse: text,
          studentLatencyMs: latencyMs,
          studentError: null,
          metrics,
        };
      } catch (err) {
        completed++;
        return {
          evalCaseId: c.id,
          taskType: c.task_type,
          domain: c.domain,
          difficulty: c.difficulty,
          studentResponse: "",
          studentLatencyMs: 0,
          studentError: err instanceof Error ? err.message : String(err),
          metrics: null,
        };
      }
    },
    CONCURRENCY,
  );

  console.log(""); // newline after progress

  // ── Step 3: Aggregate metrics ─────────────────────────────────────────────
  const completedResults = results.filter((r) => r.metrics !== null);
  const errorResults = results.filter((r) => r.metrics === null);

  function rate(arr: EvalCaseResult[], fn: (m: StudentComparisonMetrics) => boolean): number {
    const valid = arr.filter((r) => r.metrics);
    if (valid.length === 0) return 0;
    return valid.filter((r) => fn(r.metrics!)).length / valid.length;
  }

  function avg(arr: EvalCaseResult[], fn: (m: StudentComparisonMetrics) => number): number {
    const valid = arr.filter((r) => r.metrics);
    if (valid.length === 0) return 0;
    return valid.reduce((sum, r) => sum + fn(r.metrics!), 0) / valid.length;
  }

  // Domain breakdown
  const domains = [...new Set(results.map((r) => r.domain))];
  const byDomain: EvalReport["byDomain"] = {};
  for (const d of domains) {
    const subset = results.filter((r) => r.domain === d);
    byDomain[d] = {
      count: subset.length,
      passRate: rate(subset, (m) => m.pass),
      personalityConsistencyRate: rate(subset, (m) => m.personalityConsistent),
      genericRate: rate(subset, (m) => m.isGeneric),
      taskMatchRate: rate(subset, (m) => m.taskMatch),
      modeMatchRate: rate(subset, (m) => m.modeMatch),
      avgOverallScore: avg(subset, (m) => m.overallScore),
    };
  }

  // Task type breakdown
  const taskTypes = [...new Set(results.map((r) => r.taskType))];
  const byTaskType: EvalReport["byTaskType"] = {};
  for (const tt of taskTypes) {
    const subset = results.filter((r) => r.taskType === tt);
    byTaskType[tt] = {
      count: subset.length,
      passRate: rate(subset, (m) => m.pass),
      avgOverallScore: avg(subset, (m) => m.overallScore),
    };
  }

  const report: EvalReport = {
    model: STUDENT_MODEL,
    evaluatedAt: new Date().toISOString(),
    totalCases: results.length,
    completedCases: completedResults.length,
    errorCases: errorResults.length,
    overallPassRate: rate(results, (m) => m.pass),
    personalityConsistencyRate: rate(results, (m) => m.personalityConsistent),
    genericRate: rate(results, (m) => m.isGeneric),
    taskMatchRate: rate(results, (m) => m.taskMatch),
    modeMatchRate: rate(results, (m) => m.modeMatch),
    validatorPassRate: rate(results, (m) => m.validatorPassed),
    avgOverallScore: avg(results, (m) => m.overallScore),
    avgDirectness: avg(results, (m) => m.directnessScore),
    avgSpecificity: avg(results, (m) => m.specificityScore),
    avgPersonalization: avg(results, (m) => m.personalizationScore),
    avgActionability: avg(results, (m) => m.actionabilityScore),
    avgLatencyMs: completedResults.length > 0
      ? completedResults.reduce((s, r) => s + r.studentLatencyMs, 0) / completedResults.length
      : 0,
    byDomain,
    byTaskType,
    cases: results,
  };

  // ── Step 4: Write output ──────────────────────────────────────────────────
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const modelTag = STUDENT_MODEL.replace(/[^a-z0-9-]/g, "_");
  const outPath = path.join(OUT_DIR, `baseline-eval-${dateStr}-${modelTag}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  // ── Step 5: Print report ──────────────────────────────────────────────────
  const pct = (v: number) => (v * 100).toFixed(1) + "%";
  const f2 = (v: number) => v.toFixed(2);

  console.log("\n" + "=".repeat(65));
  console.log(`  Baseline Eval Report — ${STUDENT_MODEL}`);
  console.log("=".repeat(65));
  console.log(`  Evaluated at:        ${report.evaluatedAt}`);
  console.log(`  Total cases:         ${report.totalCases}`);
  console.log(`  Completed:           ${report.completedCases}`);
  console.log(`  Errors:              ${report.errorCases}`);
  console.log(`  Avg latency:         ${report.avgLatencyMs.toFixed(0)}ms`);

  console.log("\n── Core Metrics ──────────────────────────────────────────");
  console.log(`  Overall pass rate:          ${pct(report.overallPassRate)}`);
  console.log(`  Avg overall score:          ${f2(report.avgOverallScore)}`);
  console.log(`  Personality consistency:    ${pct(report.personalityConsistencyRate)}`);
  console.log(`  Generic rate:               ${pct(report.genericRate)}`);
  console.log(`  Task match:                 ${pct(report.taskMatchRate)}`);
  console.log(`  Mode match:                 ${pct(report.modeMatchRate)}`);
  console.log(`  Validator pass:             ${pct(report.validatorPassRate)}`);

  console.log("\n── Granular Scores ───────────────────────────────────────");
  console.log(`  Avg directness:             ${f2(report.avgDirectness)}`);
  console.log(`  Avg specificity:            ${f2(report.avgSpecificity)}`);
  console.log(`  Avg personalization:        ${f2(report.avgPersonalization)}`);
  console.log(`  Avg actionability:          ${f2(report.avgActionability)}`);

  console.log("\n── By Domain ─────────────────────────────────────────────");
  console.log(`  ${"Domain".padEnd(22)} ${"N".padStart(4)}  ${"Pass".padStart(6)}  ${"Person".padStart(6)}  ${"Generic".padStart(7)}  ${"Task".padStart(6)}  ${"Mode".padStart(6)}  ${"Score".padStart(6)}`);
  for (const [d, s] of Object.entries(byDomain).sort((a, b) => b[1].count - a[1].count)) {
    console.log(
      `  ${d.padEnd(22)} ${String(s.count).padStart(4)}  ${pct(s.passRate).padStart(6)}  ${pct(s.personalityConsistencyRate).padStart(6)}  ${pct(s.genericRate).padStart(7)}  ${pct(s.taskMatchRate).padStart(6)}  ${pct(s.modeMatchRate).padStart(6)}  ${f2(s.avgOverallScore).padStart(6)}`,
    );
  }

  console.log("\n── By Task Type ──────────────────────────────────────────");
  console.log(`  ${"Task Type".padEnd(45)} ${"N".padStart(4)}  ${"Pass".padStart(6)}  ${"Score".padStart(6)}`);
  for (const [tt, s] of Object.entries(byTaskType).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${tt.padEnd(45)} ${String(s.count).padStart(4)}  ${pct(s.passRate).padStart(6)}  ${f2(s.avgOverallScore).padStart(6)}`);
  }

  if (errorResults.length > 0) {
    console.log("\n── Errors ────────────────────────────────────────────────");
    for (const r of errorResults.slice(0, 5)) {
      console.log(`  ${r.evalCaseId.slice(0, 8)} ${r.taskType}: ${r.studentError}`);
    }
    if (errorResults.length > 5) {
      console.log(`  ... and ${errorResults.length - 5} more`);
    }
  }

  console.log("\n" + "=".repeat(65));
  console.log(`  Report saved to: ${outPath}`);
  console.log("=".repeat(65));
}

main().catch((err) => {
  console.error("[eval] Fatal:", err);
  process.exit(1);
});
