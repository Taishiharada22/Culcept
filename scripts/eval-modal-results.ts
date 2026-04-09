/**
 * eval-modal-results.ts
 *
 * Modal推論結果を v2 task-aware rubric で評価する。
 * run-baseline-eval.ts と同じ評価ロジックを使用。
 *
 * Usage:
 *   npx tsx scripts/eval-modal-results.ts exports/modal-eval-combined-alter-voice-v1.json
 */

import * as fs from "fs";
import * as path from "path";

// ── 引数 ──
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npx tsx scripts/eval-modal-results.ts <combined.json>");
  process.exit(1);
}

// ━━ Task-type aware rubric (同一定義) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type TaskCategory = "structured" | "generation";

function classifyTask(taskType: string): TaskCategory {
  const structuredPatterns = [
    "utterance_reading", "prediction", "question_generation", "question_expansion",
    "lens_discovery", "adaptive_q2", "observation_analysis", "free_text_analysis",
    "partner_dynamic_questions", "observation_reaction",
  ];
  for (const p of structuredPatterns) {
    if (taskType.includes(p)) return "structured";
  }
  return "generation";
}

type MetricWeights = {
  personalityConsistency: number; validatorPass: number; genericRate: number;
  specificity: number; taskMatch: number; modeMatch: number; directness: number;
};

const RUBRIC: Record<TaskCategory, { weights: MetricWeights; passThreshold: number }> = {
  structured: {
    weights: { taskMatch: 0.40, validatorPass: 0.30, specificity: 0.15, genericRate: 0.05, personalityConsistency: 0.05, modeMatch: 0.00, directness: 0.05 },
    passThreshold: 0.70,
  },
  generation: {
    weights: { personalityConsistency: 0.30, validatorPass: 0.15, genericRate: 0.20, specificity: 0.10, taskMatch: 0.05, modeMatch: 0.05, directness: 0.15 },
    passThreshold: 0.70,
  },
};

// ━━ 6-axis evaluation (同一ロジック) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function compareTaskJudgment(teacher: Record<string, unknown> | null, student: Record<string, unknown> | null): boolean {
  if (!teacher || !student) return false;
  const keys = ["response_mode", "action_shape", "seeking_type", "engagement_level", "emotional_state", "domain"];
  let matches = 0, compared = 0;
  for (const k of keys) { if (k in teacher) { compared++; if (String(teacher[k]) === String(student[k])) matches++; } }
  return compared === 0 || matches / compared >= 0.6;
}

function compareModeSelection(teacher: Record<string, unknown> | null, student: Record<string, unknown> | null): boolean {
  if (!teacher || !student) return false;
  const tm = String(teacher.response_mode ?? teacher.mode ?? "");
  const sm = String(student.response_mode ?? student.mode ?? "");
  return !!tm && !!sm && tm === sm;
}

function checkValidatorCompliance(response: string, structured: Record<string, unknown> | null, taskType: string): boolean {
  const t = response.trim();
  if (!t || t.length < 10) return false;
  if (/^(undefined|null|error|sorry|申し訳)$/i.test(t)) return false;
  if ((taskType.includes("utterance_reading") || taskType.includes("prediction")) && (!structured || Object.keys(structured).length === 0)) return false;
  const jr = (t.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length / t.length;
  if (t.length > 20 && jr < 0.1) return false;
  return true;
}

function detectGenericResponse(response: string): boolean {
  const t = response.trim();
  const patterns = [/それは大変ですね/, /頑張ってください/, /お気持ちはわかります/, /そうですね。?$/, /なるほど。?$/, /一般的に[はは]/, /いろいろな考え方があ/, /人それぞれ/, /大丈夫です[よか]/];
  for (const p of patterns) { if (p.test(t)) return true; }
  if (t.length < 30) return true;
  return false;
}

function checkPersonalityConsistency(_teacher: string, student: string): boolean {
  const markers = {
    firstPerson: /僕[はがもをに]/.test(student),
    directTone: !/(?:かもしれません|と思われます|でしょうか。$)/.test(student),
    casualRegister: !/(?:ございます|いたします|させていただき)/.test(student),
    assertive: /(?:だ[。！]|だと思う|だろう|はず[だ。]|だな|だぜ|だよ|だね)/.test(student),
  };
  return Object.values(markers).filter(Boolean).length >= 3;
}

function scoreDirectness(r: string): number {
  const t = r.trim(); let s = 0.5;
  if (/^[「『]?[あ-ん]{1,3}[、。]/.test(t)) s -= 0.1;
  if (/^[僕俺それこれ]/.test(t)) s += 0.15;
  s -= ((t.match(/(?:かも|たぶん|おそらく|もしかして|一概に)/g) || []).length) * 0.1;
  if (/[。！]$/.test(t)) s += 0.1;
  return Math.max(0, Math.min(1, s));
}

function scoreSpecificity(student: string, teacher: string): number {
  const ss = (student.match(/[0-9０-９]+|「[^」]+」|[A-Z]{2,}/g) || []).length;
  const ts = (teacher.match(/[0-9０-９]+|「[^」]+」|[A-Z]{2,}/g) || []).length;
  if (ts === 0) return ss > 0 ? 1.0 : 0.5;
  return Math.min(1, ss / ts);
}

// ━━ Main ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const data: Array<{
  case: { id: string; task_type: string; domain: string; difficulty: string; gold_response: string; gold_structured: unknown };
  student_response: string;
  student_structured: Record<string, unknown> | null;
  latency_ms: number;
}> = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

type Result = {
  id: string; taskType: string; taskCategory: TaskCategory; domain: string;
  pass: boolean; overallScore: number; personalityConsistent: boolean;
  taskMatch: boolean; validatorPassed: boolean; isGeneric: boolean;
  directnessScore: number; specificityScore: number; latencyMs: number;
};

const results: Result[] = data.map((d) => {
  const c = d.case;
  const taskCategory = classifyTask(c.task_type);
  const rubric = RUBRIC[taskCategory];
  const w = rubric.weights;

  const teacherStructured = c.gold_structured as Record<string, unknown> | null;
  const taskMatch = compareTaskJudgment(teacherStructured, d.student_structured);
  const modeMatch = compareModeSelection(teacherStructured, d.student_structured);
  const validatorPassed = checkValidatorCompliance(d.student_response, d.student_structured, c.task_type);
  const isGeneric = detectGenericResponse(d.student_response);
  const personalityConsistent = checkPersonalityConsistency(c.gold_response, d.student_response);
  const directnessScore = scoreDirectness(d.student_response);
  const specificityScore = scoreSpecificity(d.student_response, c.gold_response);

  const overallScore =
    (personalityConsistent ? 1 : 0) * w.personalityConsistency +
    (validatorPassed ? 1 : 0) * w.validatorPass +
    (isGeneric ? 0 : 1) * w.genericRate +
    specificityScore * w.specificity +
    (taskMatch ? 1 : 0) * w.taskMatch +
    (modeMatch ? 1 : 0) * w.modeMatch +
    directnessScore * w.directness;

  return {
    id: c.id, taskType: c.task_type, taskCategory, domain: c.domain,
    pass: overallScore >= rubric.passThreshold,
    overallScore, personalityConsistent, taskMatch, validatorPassed, isGeneric,
    directnessScore, specificityScore, latencyMs: d.latency_ms,
  };
});

// ── Aggregation ──
function rate(arr: Result[], fn: (r: Result) => boolean): number {
  return arr.length === 0 ? 0 : arr.filter(fn).length / arr.length;
}
function avg(arr: Result[], fn: (r: Result) => number): number {
  return arr.length === 0 ? 0 : arr.reduce((s, r) => s + fn(r), 0) / arr.length;
}

const structured = results.filter((r) => r.taskCategory === "structured");
const generation = results.filter((r) => r.taskCategory === "generation");

const pct = (v: number) => (v * 100).toFixed(1) + "%";
const f2 = (v: number) => v.toFixed(2);

console.log("\n" + "=".repeat(65));
console.log(`  Modal LoRA Eval — v2-task-aware rubric`);
console.log(`  Input: ${inputPath}`);
console.log("=".repeat(65));
console.log(`  Total cases:         ${results.length}`);
console.log(`  Avg latency:         ${avg(results, (r) => r.latencyMs).toFixed(0)}ms`);

console.log("\n── Structured Tasks ──────────────────────────────────────");
console.log(`  Cases:               ${structured.length}`);
console.log(`  Pass rate:           ${pct(rate(structured, (r) => r.pass))}`);
console.log(`  Task match:          ${pct(rate(structured, (r) => r.taskMatch))}`);
console.log(`  Validator pass:      ${pct(rate(structured, (r) => r.validatorPassed))}`);
console.log(`  Avg score:           ${f2(avg(structured, (r) => r.overallScore))}`);

console.log("\n── Generation Tasks ──────────────────────────────────────");
console.log(`  Cases:               ${generation.length}`);
console.log(`  Pass rate:           ${pct(rate(generation, (r) => r.pass))}`);
console.log(`  Personality:         ${pct(rate(generation, (r) => r.personalityConsistent))}`);
console.log(`  Generic rate:        ${pct(rate(generation, (r) => r.isGeneric))}`);
console.log(`  Avg score:           ${f2(avg(generation, (r) => r.overallScore))}`);

console.log("\n── Overall ───────────────────────────────────────────────");
console.log(`  Pass rate:           ${pct(rate(results, (r) => r.pass))}`);
console.log(`  Avg score:           ${f2(avg(results, (r) => r.overallScore))}`);

// Domain breakdown
const domains = [...new Set(results.map((r) => r.domain))];
console.log("\n── By Domain ─────────────────────────────────────────────");
console.log(`  ${"Domain".padEnd(22)} ${"N".padStart(4)}  ${"Pass".padStart(6)}  ${"Person".padStart(6)}  ${"Task".padStart(6)}  ${"Score".padStart(6)}`);
for (const d of domains.sort((a, b) => results.filter((r) => r.domain === b).length - results.filter((r) => r.domain === a).length)) {
  const sub = results.filter((r) => r.domain === d);
  console.log(`  ${d.padEnd(22)} ${String(sub.length).padStart(4)}  ${pct(rate(sub, (r) => r.pass)).padStart(6)}  ${pct(rate(sub, (r) => r.personalityConsistent)).padStart(6)}  ${pct(rate(sub, (r) => r.taskMatch)).padStart(6)}  ${f2(avg(sub, (r) => r.overallScore)).padStart(6)}`);
}

// Task type breakdown
const taskTypes = [...new Set(results.map((r) => r.taskType))];
console.log("\n── By Task Type ──────────────────────────────────────────");
console.log(`  ${"Task Type".padEnd(45)} ${"Cat".padStart(5)} ${"N".padStart(4)}  ${"Pass".padStart(6)}  ${"Score".padStart(6)}`);
for (const tt of taskTypes.sort((a, b) => results.filter((r) => r.taskType === b).length - results.filter((r) => r.taskType === a).length)) {
  const sub = results.filter((r) => r.taskType === tt);
  const cat = classifyTask(tt) === "structured" ? "STR" : "GEN";
  console.log(`  ${tt.padEnd(45)} ${cat.padStart(5)} ${String(sub.length).padStart(4)}  ${pct(rate(sub, (r) => r.pass)).padStart(6)}  ${f2(avg(sub, (r) => r.overallScore)).padStart(6)}`);
}

console.log("\n" + "=".repeat(65));

// Save report
const reportPath = inputPath.replace(".json", "-report.json");
const report = {
  rubricVersion: "v2-task-aware",
  totalCases: results.length,
  structured: { count: structured.length, passRate: rate(structured, (r) => r.pass), taskMatchRate: rate(structured, (r) => r.taskMatch), avgScore: avg(structured, (r) => r.overallScore) },
  generation: { count: generation.length, passRate: rate(generation, (r) => r.pass), personalityRate: rate(generation, (r) => r.personalityConsistent), genericRate: rate(generation, (r) => r.isGeneric), avgScore: avg(generation, (r) => r.overallScore) },
  overallPassRate: rate(results, (r) => r.pass),
  avgScore: avg(results, (r) => r.overallScore),
  avgLatencyMs: avg(results, (r) => r.latencyMs),
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`  Report saved to: ${reportPath}`);
console.log("=".repeat(65));
