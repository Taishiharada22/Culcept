#!/usr/bin/env npx tsx
/**
 * CoAlter L4-i Phase 2 Stage 2.3 — Variant Quality Review (manual script)
 *
 * 正本: layout plan v0.3 §7.9 / CEO 確定方針 (2026-05-08 設計 v3 + v4 案 C)
 *
 * 目的: 7 variant (A/B/C/D/E/F1/F2) × 5 sample = 35 件の LLM 出力を直接
 *       生成し、CEO による質的レビュー対象を取得する。
 *
 * **Stage 2.3 = variant 別 LLM 発話品質レビューのみ** (CEO 厳守)。
 *   - variant 到達性 / state machine routing / UI 到達性 は別 stage。
 *   - ここでは buildPresenceSpeech に variant を直接指定して強制発火し、
 *     LLM 出力 (body / source / retries / latency / validationFailed /
 *     fallbackReason) を観測する。
 *
 * 不可侵 (CEO 厳守):
 *   - tests/ 配下に置かない (CI で自動実行禁止)
 *   - .tmp/ 出力 file は commit しない (.gitignore で除外)
 *   - Sentry に body 本文を送らない (PII 配慮、既存方針)
 *   - ChatClient.tsx / UpperLayerMount.tsx / speech route / validator /
 *     model / max_tokens / UrgentLayer / timeout constant / Production env
 *     を一切触らない
 *   - Anthropic 起因と断定しない
 *   - 数値 PASS でも CEO が「CoAlter らしくない」と判断したら STOP
 *
 * 実行ガード (CEO/GPT 案 C 補正 2026-05-08):
 *   1. STAGE23_VARIANT_REVIEW=true 必須
 *   2. **COALTER_PRESENCE_SPEECH_LLM=true 必須** (LLM gate を ON にしないと
 *       buildPresenceSpeech が即 static path に落ちる、root cause 修正)
 *   3. ANTHROPIC_API_KEY 必須 (.env.local から dotenv 読み込み)
 *   4. mode 排他指定 (必ずどちらか 1 つ):
 *        - STAGE23_VARIANT_REVIEW_PROBE=1     (1-call probe、variant A のみ)
 *        - STAGE23_VARIANT_REVIEW_CONFIRM=35  (35-call 本実行)
 *      両方指定 / どちらも未指定 は refused (誤実行防止)
 *   5. 開始前 5 秒猶予 (Ctrl+C で abort 可、補助的、env guard が主)
 *
 * 実行方法:
 *
 *   # Step 1: probe (1-call、source=llm を確認するまで本実行禁止)
 *   COALTER_PRESENCE_SPEECH_LLM=true \
 *   STAGE23_VARIANT_REVIEW=true \
 *   STAGE23_VARIANT_REVIEW_PROBE=1 \
 *   npx tsx scripts/coalter/stage23-variant-quality-review.ts
 *
 *   # Step 2: probe PASS 後に 35-call 本実行
 *   COALTER_PRESENCE_SPEECH_LLM=true \
 *   STAGE23_VARIANT_REVIEW=true \
 *   STAGE23_VARIANT_REVIEW_CONFIRM=35 \
 *   npx tsx scripts/coalter/stage23-variant-quality-review.ts
 *
 * Probe PASS 判定 (案 C):
 *   - source === "llm"
 *   - latencyMs > 100
 *   - fallbackReason === null
 *
 * 出力 (commit しない、.gitignore で除外):
 *   - probe:   .tmp/stage23-variant-review-probe-<timestamp>.{json,md}
 *   - confirm: .tmp/stage23-variant-review-<timestamp>.{json,md}
 */

// ─────────────────────────────────────────────
// dotenv は guardEnv より前 (CEO/GPT 補正 2)
// ─────────────────────────────────────────────
import { config } from "dotenv";

config({ path: ".env.local" });

// ─────────────────────────────────────────────
// 依存 (Explore で signature 確定済)
// ─────────────────────────────────────────────
import * as fs from "node:fs";
import * as path from "node:path";

import {
  PATTERN_VARIANTS,
  type PatternVariant,
} from "@/lib/coalter/presence/types";
import {
  buildPresenceSpeech,
  setLlmCall,
} from "@/lib/coalter/presence/speechBuilder";
import { createAnthropicLlmCall } from "@/lib/coalter/presence/llmCall";
import type {
  BuildPresenceSpeechInput,
  SpeechOutput,
} from "@/lib/coalter/presence/speechTypes";
// Stage 2.3-diagnostic (Round 5、CEO 確定 2026-05-08): variant E root cause 特定用。
// CEO 厳守: speechValidator / speechPostValidator / speechPromptBuilder / speechTypes
// は import only、変更しない。
import { LENGTH_OVERRIDE_BY_VARIANT } from "@/lib/coalter/presence/speechTypes";
import { buildSpeechPrompt } from "@/lib/coalter/presence/speechPromptBuilder";
import { postValidateSpeech } from "@/lib/coalter/presence/speechPostValidator";
import type {
  SpeechViolation,
  SpeechViolationKind,
} from "@/lib/coalter/presence/speechValidator";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const SAMPLES_PER_VARIANT = 5;
const TOTAL_SAMPLES = SAMPLES_PER_VARIANT * 7; // 35
const RATE_LIMIT_INTERVAL_MS = 2_000;
const ABORT_GRACE_MS = 5_000;

/**
 * variant 別 minimum fixture (Explore 確定)。
 * buildPresenceSpeech は variant 直接指定で強制発火 (selectPattern バイパス)。
 * signal/pairId/threadId 等は不要、4 fields で valid。
 */
const VARIANT_FIXTURES: Record<PatternVariant, BuildPresenceSpeechInput> = {
  A: { variant: "A", state: "S2", mode: "normal", context: {} },
  B: { variant: "B", state: "S3", mode: "normal", context: {} },
  C: { variant: "C", state: "S4", mode: "normal", context: {} },
  D: { variant: "D", state: "S5", mode: "normal", context: {} },
  E: { variant: "E", state: "S5", mode: "normal", context: {} },
  F1: { variant: "F1", state: "S6", mode: "normal", context: {} },
  F2: { variant: "F2", state: "S7", mode: "daily", context: {} },
};

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

interface SampleResult {
  variant: PatternVariant;
  sampleIndex: number;
  body?: string;
  source?: SpeechOutput["source"];
  retries?: number;
  latencyMs?: number;
  validationFailed?: boolean;
  fallbackReason?: SpeechOutput["fallbackReason"];
  appliedLength?: SpeechOutput["appliedLength"];
  tone?: SpeechOutput["tone"];
  error?: string;
}

/**
 * Diagnostic mode 用 sample 結果。
 * raw output × violations の対応関係を完全保持。
 * 文字数 / 文数 / 疑問符数 を rule check 用に算出。
 */
interface DiagnosticSampleResult {
  variant: PatternVariant;
  sampleIndex: number;
  prompt: string;                          // buildSpeechPrompt 出力
  lengthOverride: {
    minSentences: number;
    maxSentences: number;
    minCharsPerSentence: number;
    maxCharsPerSentence: number;
    maxQuestions: number;
  };
  rawAttempts: string[];                   // [initial, retry1, retry2, ...]
  attemptViolations: SpeechViolation[][];  // 各 attempt の violations
  attemptStats: Array<{
    sentenceCount: number;
    questionCount: number;
    sentenceLengths: number[];             // 各文の char 長
    maxSentenceLength: number;
    minSentenceLength: number;
  }>;                                       // 各 attempt の length 統計
  finalText: string;
  retries: number;
  fallbackUsed: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Diagnostic 対象 (CEO 確定 Case A' 2026-05-08): E 10 / A 3 / F2 3 = 合計 16 sample。
 * E は fallback 再現確率高 (前回 3/5)、A/F2 は補助観察 (各前回 1/5)。
 */
const DIAGNOSTIC_TARGETS: ReadonlyArray<{
  variant: PatternVariant;
  samples: number;
}> = [
  { variant: "E", samples: 10 },
  { variant: "A", samples: 3 },
  { variant: "F2", samples: 3 },
];

// ─────────────────────────────────────────────
// guard
// ─────────────────────────────────────────────

type RunMode = "probe" | "confirm" | "diagnostic";

function guardEnv(): { mode: RunMode } {
  if (process.env.STAGE23_VARIANT_REVIEW !== "true") {
    console.error(
      "Refused: STAGE23_VARIANT_REVIEW=true required",
    );
    process.exit(1);
  }
  // CEO/GPT 案 C 補正 2026-05-08: COALTER_PRESENCE_SPEECH_LLM=true がないと
  // buildPresenceSpeech が即 static path に落ちる (lib/coalter/flags.ts:151,
  // lib/coalter/presence/speechBuilder.ts:105)。Stage 2.3 = LLM 出力品質レビュー
  // のため、LLM gate を ON にしないと無効データ (35 件全 source=static) が出る。
  if (process.env.COALTER_PRESENCE_SPEECH_LLM !== "true") {
    console.error(
      "Refused: COALTER_PRESENCE_SPEECH_LLM=true required (LLM gate must be ON, otherwise buildPresenceSpeech returns static path immediately)",
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Refused: ANTHROPIC_API_KEY required (set in .env.local or CLI)",
    );
    process.exit(1);
  }

  // mode 排他指定 (probe / confirm / diagnostic、必ず 1 つ)
  const isProbe = process.env.STAGE23_VARIANT_REVIEW_PROBE === "1";
  const isConfirm = process.env.STAGE23_VARIANT_REVIEW_CONFIRM === "35";
  const isDiagnostic = process.env.STAGE23_VARIANT_REVIEW_DIAGNOSTIC === "1";
  const modeCount = [isProbe, isConfirm, isDiagnostic].filter(Boolean).length;
  if (modeCount > 1) {
    console.error(
      "Refused: PROBE / CONFIRM / DIAGNOSTIC are mutually exclusive (specify exactly 1)",
    );
    process.exit(1);
  }
  if (modeCount === 0) {
    console.error(
      "Refused: must specify exactly 1 mode:\n" +
        "  STAGE23_VARIANT_REVIEW_PROBE=1       (1-call probe, variant A)\n" +
        "  STAGE23_VARIANT_REVIEW_CONFIRM=35    (35-call full run)\n" +
        "  STAGE23_VARIANT_REVIEW_DIAGNOSTIC=1  (E10/A3/F2 3 = 16-call diagnostic)",
    );
    process.exit(1);
  }
  return {
    mode: isProbe ? "probe" : isDiagnostic ? "diagnostic" : "confirm",
  };
}

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
}

function formatMarkdown(results: ReadonlyArray<SampleResult>): string {
  const groupedByVariant = new Map<PatternVariant, SampleResult[]>();
  for (const r of results) {
    if (!groupedByVariant.has(r.variant)) groupedByVariant.set(r.variant, []);
    groupedByVariant.get(r.variant)!.push(r);
  }

  const lines: string[] = [];
  lines.push("# Stage 2.3 Variant Quality Review");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## 数値 metric (自動集計)");
  lines.push("");
  lines.push(
    "| variant | source=llm | fallback | val_failed | retries 0/1/2/-1 | latency p50/max |",
  );
  lines.push(
    "|---------|------------|----------|------------|-------------------|-----------------|",
  );
  for (const variant of PATTERN_VARIANTS) {
    const group = groupedByVariant.get(variant) ?? [];
    const llmCount = group.filter((g) => g.source === "llm").length;
    const fallbackCount = group.filter((g) => g.source === "fallback").length;
    const valFailedCount = group.filter(
      (g) => g.validationFailed === true,
    ).length;
    const r0 = group.filter((g) => g.retries === 0).length;
    const r1 = group.filter((g) => g.retries === 1).length;
    const r2 = group.filter((g) => g.retries === 2).length;
    const rNeg1 = group.filter((g) => g.retries === -1).length;
    const latencies = group
      .map((g) => g.latencyMs)
      .filter((l): l is number => typeof l === "number")
      .sort((a, b) => a - b);
    const p50 =
      latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;
    const max = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
    lines.push(
      `| ${variant} | ${llmCount} | ${fallbackCount} | ${valFailedCount} | ${r0}/${r1}/${r2}/${rNeg1} | ${p50}/${max} |`,
    );
  }
  lines.push("");

  // 全体 PASS/NG 判定
  const totalLlm = results.filter((r) => r.source === "llm").length;
  const totalFallback = results.filter((r) => r.source === "fallback").length;
  const totalValFailed = results.filter(
    (r) => r.validationFailed === true,
  ).length;
  const totalErrors = results.filter((r) => r.error).length;
  // timeout = fallbackReason="timeout" or latencyMs >= 10000
  const totalTimeout = results.filter(
    (r) =>
      r.fallbackReason === "timeout" ||
      (typeof r.latencyMs === "number" && r.latencyMs >= 10_000),
  ).length;

  lines.push("## 全体 PASS/NG 判定 (自動)");
  lines.push("");
  lines.push(
    `- source=llm: **${totalLlm}/${TOTAL_SAMPLES}** (PASS: 32+, NG: 31-)`,
  );
  lines.push(
    `- fallback (合計): **${totalFallback}** (PASS: 0-3, NG: 4+)`,
  );
  lines.push(
    `- validation_failed: **${totalValFailed}** (PASS: 0-2, NG: 3+)`,
  );
  lines.push(`- timeout: **${totalTimeout}** (PASS: 0, NG: 1+)`);
  lines.push(`- script error: **${totalErrors}** (PASS: 0, NG: 1+)`);
  lines.push("");

  // variant 別 sample (CEO 質的 review 対象)
  lines.push("## variant 別 sample (CEO 質的 review)");
  lines.push("");
  for (const variant of PATTERN_VARIANTS) {
    const fixture = VARIANT_FIXTURES[variant];
    lines.push(
      `### Variant ${variant} (state=${fixture.state}, mode=${fixture.mode})`,
    );
    lines.push("");
    const group = groupedByVariant.get(variant) ?? [];
    for (const sample of group) {
      const meta = [
        `source=${sample.source ?? "?"}`,
        `retries=${sample.retries ?? "?"}`,
        `latency=${sample.latencyMs ?? "?"}ms`,
      ];
      if (sample.validationFailed) meta.push("validationFailed=true");
      if (sample.fallbackReason)
        meta.push(`fallbackReason=${sample.fallbackReason}`);
      if (sample.error) meta.push(`ERROR=${sample.error}`);
      lines.push(`**Sample ${sample.sampleIndex + 1}**: ${meta.join(", ")}`);
      lines.push("");
      if (sample.body) {
        lines.push(`> ${sample.body}`);
      }
      lines.push("");
    }
  }

  // CEO 質的 review 観点 (8 項目)
  lines.push("## CEO 質的 review 観点 (8 項目)");
  lines.push("");
  lines.push("各 sample について以下を確認:");
  lines.push("1. 裁いていないか");
  lines.push("2. どちらかの味方をしていないか");
  lines.push("3. 相手の気持ちを勝手に代弁していないか");
  lines.push("4. 断定していないか");
  lines.push("5. 尋問っぽくないか");
  lines.push("6. 追い詰めていないか");
  lines.push("7. CoAlter の距離感として自然か");
  lines.push("8. variant の役割に合っているか");
  lines.push("");
  lines.push("各 variant 5 件中 4 件以上が質的合格なら variant PASS。");
  lines.push("**数値 PASS でも CEO が「CoAlter らしくない」と判断したら STOP。**");
  lines.push("");
  lines.push(
    "Stage 2.3 = variant 別 LLM 発話品質レビューのみ。variant 到達性 / state machine routing / UI 到達性は別 stage。",
  );
  lines.push("");

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// main
// ─────────────────────────────────────────────

async function runProbe(llmCall: ReturnType<typeof createAnthropicLlmCall>): Promise<void> {
  console.log("=== PROBE MODE: 1 sample (variant A) only ===");
  console.log("");
  console.log("Goal: confirm LLM path is reachable before 35-call full run.");
  console.log("Probe PASS criteria:");
  console.log("  - source === 'llm'");
  console.log("  - latencyMs > 100");
  console.log("  - fallbackReason === null");
  console.log("");

  const variant: PatternVariant = "A";
  const fixture = VARIANT_FIXTURES[variant];
  console.log(`Variant ${variant} (${fixture.state}/${fixture.mode}):`);

  const startTime = Date.now();
  let result: SampleResult;
  try {
    setLlmCall(llmCall);
    const speech = await buildPresenceSpeech(fixture);
    const latencyMs = Date.now() - startTime;
    result = {
      variant,
      sampleIndex: 0,
      body: speech.body,
      source: speech.source,
      retries: speech.retries,
      latencyMs,
      validationFailed: speech.validationFailed,
      fallbackReason: speech.fallbackReason,
      appliedLength: speech.appliedLength,
      tone: speech.tone,
    };
    console.log(
      `  [1/1 PROBE] source=${speech.source}, retries=${speech.retries}, latency=${latencyMs}ms, fallbackReason=${speech.fallbackReason ?? "null"}`,
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    result = { variant, sampleIndex: 0, error: errMsg };
    console.log(`  [1/1 PROBE] ERROR: ${errMsg}`);
  } finally {
    setLlmCall(null);
  }

  // PASS 判定
  console.log("");
  console.log("=== PROBE PASS / FAIL JUDGEMENT ===");
  const sourceOk = result.source === "llm";
  const latencyOk = typeof result.latencyMs === "number" && result.latencyMs > 100;
  const fallbackOk = result.fallbackReason === null || result.fallbackReason === undefined;
  console.log(`  source: ${result.source ?? "?"} ${sourceOk ? "✓" : "✗"} (expected: llm)`);
  console.log(`  latencyMs: ${result.latencyMs ?? "?"} ${latencyOk ? "✓" : "✗"} (expected: > 100)`);
  console.log(`  fallbackReason: ${result.fallbackReason ?? "null"} ${fallbackOk ? "✓" : "✗"} (expected: null)`);
  if (result.error) {
    console.log(`  ERROR: ${result.error}`);
  }

  const probePassed = sourceOk && latencyOk && fallbackOk && !result.error;
  console.log("");
  if (probePassed) {
    console.log("→ PROBE PASS — 35-call full run is safe to proceed.");
    console.log("");
    console.log("  Next step (CEO judgement required):");
    console.log("    COALTER_PRESENCE_SPEECH_LLM=true \\");
    console.log("    STAGE23_VARIANT_REVIEW=true \\");
    console.log("    STAGE23_VARIANT_REVIEW_CONFIRM=35 \\");
    console.log("    npx tsx scripts/coalter/stage23-variant-quality-review.ts");
  } else {
    console.log("→ PROBE FAIL — 35-call full run is BLOCKED.");
    console.log("  Investigate: ANTHROPIC_API_KEY validity / LLM gate / SDK call path.");
  }
  console.log("");

  // probe dump (本実行と区別)
  const tmpDir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const timestamp = formatTimestamp();
  const jsonPath = path.join(tmpDir, `stage23-variant-review-probe-${timestamp}.json`);
  const mdPath = path.join(tmpDir, `stage23-variant-review-probe-${timestamp}.md`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), mode: "probe", probePassed, result },
      null,
      2,
    ),
  );
  const probeBody = result.body ? `\n> ${result.body}\n` : "";
  fs.writeFileSync(
    mdPath,
    `# Stage 2.3 Variant Quality Review — PROBE\n\n` +
      `Generated at: ${new Date().toISOString()}\n` +
      `Mode: probe (1-call, variant A only)\n` +
      `Probe PASS: **${probePassed ? "YES" : "NO"}**\n\n` +
      `## Probe result\n\n` +
      `- variant: ${result.variant}\n` +
      `- source: ${result.source ?? "?"} ${sourceOk ? "(✓ pass)" : "(✗ fail)"}\n` +
      `- latencyMs: ${result.latencyMs ?? "?"} ${latencyOk ? "(✓ pass)" : "(✗ fail)"}\n` +
      `- fallbackReason: ${result.fallbackReason ?? "null"} ${fallbackOk ? "(✓ pass)" : "(✗ fail)"}\n` +
      `- retries: ${result.retries ?? "?"}\n` +
      `- validationFailed: ${result.validationFailed ?? false}\n` +
      `${result.error ? `- ERROR: ${result.error}\n` : ""}` +
      probeBody +
      `\n## Decision\n\n` +
      (probePassed
        ? `→ PROBE PASS。35-call full run is safe to proceed (CEO judgement required).\n`
        : `→ PROBE FAIL。Investigate before 35-call run.\n`),
  );
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
}

/**
 * Diagnostic helper: text を文に split (validator と同じロジックで近似)。
 * 句点 (。!？!?) で split、空文字を除外。
 */
function splitSentences(text: string): string[] {
  // 改行も区切りとして扱う
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n+/g, "。");
  const parts = normalized.split(/[。！？!?]/g);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function countQuestions(text: string): number {
  return (text.match(/[？?]/g) ?? []).length;
}

function computeAttemptStats(text: string): DiagnosticSampleResult["attemptStats"][number] {
  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map((s) => s.length);
  const questionCount = countQuestions(text);
  return {
    sentenceCount: sentences.length,
    questionCount,
    sentenceLengths,
    maxSentenceLength: sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0,
    minSentenceLength: sentenceLengths.length > 0 ? Math.min(...sentenceLengths) : 0,
  };
}

function formatDiagnosticMarkdown(samples: ReadonlyArray<DiagnosticSampleResult>): string {
  const lines: string[] = [];
  lines.push("# Stage 2.3-diagnostic — variant E root cause analysis");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Mode: diagnostic (E 10 / A 3 / F2 3 = 16 sample)`);
  lines.push("");

  // 全体集計: variant 別 violation kind 分布
  lines.push("## 全体集計 — variant 別 violation kind 分布");
  lines.push("");
  const kindCounts = new Map<PatternVariant, Map<SpeechViolationKind, number>>();
  for (const s of samples) {
    if (!kindCounts.has(s.variant)) kindCounts.set(s.variant, new Map());
    const m = kindCounts.get(s.variant)!;
    for (const violations of s.attemptViolations) {
      for (const v of violations) {
        m.set(v.kind, (m.get(v.kind) ?? 0) + 1);
      }
    }
  }
  const allKinds: SpeechViolationKind[] = [
    "judgmental",
    "evaluative",
    "speak_for_other",
    "premature_certainty",
    "interrogative",
    "cornering",
    "worldview",
    "length_violation",
  ];
  lines.push(
    "| variant | " + allKinds.join(" | ") + " | total |",
  );
  lines.push("|---------|" + allKinds.map(() => "-------|").join(""));
  for (const [variant, m] of kindCounts.entries()) {
    let total = 0;
    const cells = allKinds.map((k) => {
      const c = m.get(k) ?? 0;
      total += c;
      return String(c);
    });
    lines.push(`| ${variant} | ${cells.join(" | ")} | ${total} |`);
  }
  lines.push("");

  // sample レベル集計
  lines.push("## Sample-level 集計");
  lines.push("");
  lines.push("| variant | sample | retries | fallback? | latency | attempts | total violations |");
  lines.push("|---------|--------|---------|-----------|---------|----------|------------------|");
  for (const s of samples) {
    const totalViolations = s.attemptViolations.reduce((sum, v) => sum + v.length, 0);
    lines.push(
      `| ${s.variant} | ${s.sampleIndex} | ${s.retries} | ${s.fallbackUsed ? "yes" : "no"} | ${s.latencyMs}ms | ${s.rawAttempts.length} | ${totalViolations} |`,
    );
  }
  lines.push("");

  // variant 別 sample 詳細
  for (const variant of ["E", "A", "F2"] as const) {
    const group = samples.filter((s) => s.variant === variant);
    if (group.length === 0) continue;
    lines.push(`## Variant ${variant} sample 詳細`);
    lines.push("");
    lines.push(`Length override: ${JSON.stringify(group[0].lengthOverride)}`);
    lines.push("");
    for (const s of group) {
      lines.push(
        `### Sample ${variant}-${s.sampleIndex} (retries=${s.retries}, fallback=${s.fallbackUsed}, latency=${s.latencyMs}ms)`,
      );
      lines.push("");
      if (s.error) {
        lines.push(`**ERROR**: ${s.error}`);
        lines.push("");
        continue;
      }
      // attempts (raw + violations) — まず prompt は冒頭 1 回のみ展開
      lines.push("<details><summary>Prompt (click to expand)</summary>");
      lines.push("");
      lines.push("```");
      lines.push(s.prompt);
      lines.push("```");
      lines.push("");
      lines.push("</details>");
      lines.push("");
      for (let i = 0; i < s.rawAttempts.length; i++) {
        const raw = s.rawAttempts[i];
        const stat = s.attemptStats[i];
        const violations = s.attemptViolations[i] ?? [];
        const isAccepted = violations.length === 0;
        lines.push(
          `**Attempt ${i + 1}** (${isAccepted ? "✓ ACCEPTED" : `✗ ${violations.length} violations`}):`,
        );
        lines.push("");
        lines.push(`> ${raw.replace(/\n/g, "\n> ")}`);
        lines.push("");
        lines.push(
          `- sentenceCount: ${stat.sentenceCount}, questionCount: ${stat.questionCount}`,
        );
        lines.push(
          `- sentenceLengths: [${stat.sentenceLengths.join(", ")}] (min=${stat.minSentenceLength}, max=${stat.maxSentenceLength})`,
        );
        if (violations.length > 0) {
          lines.push(`- violations:`);
          for (const v of violations) {
            lines.push(
              `  - **${v.kind}** (example: \`${v.example}\`, matched: \`${v.matchedText}\`)`,
            );
          }
        }
        lines.push("");
      }
      lines.push(`**Final**: ${s.fallbackUsed ? "(fallback)" : ""}`);
      lines.push("");
      lines.push(`> ${s.finalText}`);
      lines.push("");
    }
  }

  // 仮説検証セクション
  lines.push("## 仮説検証 (CEO 判断対象)");
  lines.push("");
  lines.push("各 variant の violation kind 分布を見て:");
  lines.push("- **length_violation が dominant** → length 制約 vs 翻訳系 prompt の相性問題仮説");
  lines.push("- **worldview / judgmental 等が dominant** → prompt の禁止表現指示不足");
  lines.push("- **複数 kind 混在** → 複合的問題、修正策複雑化");
  lines.push("");
  lines.push("**Stage 2.3-diagnostic は原因特定用、修正は CEO 判断後**。");
  lines.push("");

  return lines.join("\n");
}

async function runDiagnostic(llmCall: ReturnType<typeof createAnthropicLlmCall>): Promise<void> {
  console.log("=== DIAGNOSTIC MODE: E10 / A3 / F2 3 = 16 sample ===");
  console.log("");
  console.log("Goal: variant E (validator reject 多発) root cause 特定。");
  console.log("各 sample の rawAttempts × attemptViolations を完全保存。");
  console.log("");

  const samples: DiagnosticSampleResult[] = [];

  for (const target of DIAGNOSTIC_TARGETS) {
    const fixture = VARIANT_FIXTURES[target.variant];
    const lengthOverride = LENGTH_OVERRIDE_BY_VARIANT[target.variant];
    const prompt = buildSpeechPrompt(fixture, lengthOverride);

    console.log(
      `Variant ${target.variant} (${fixture.state}/${fixture.mode}, ${target.samples} samples):`,
    );

    for (let i = 0; i < target.samples; i++) {
      const startTime = Date.now();
      const rawAttempts: string[] = [];

      try {
        // 1st LLM call (initial)
        const initialText = await llmCall(prompt);
        rawAttempts.push(initialText);

        // postValidateSpeech に wrapped regenerate を渡して各 retry の raw output を capture
        const wrappedRegenerate = async (): Promise<string> => {
          const output = await llmCall(prompt);
          rawAttempts.push(output);
          return output;
        };

        // diagnostic では fallbackText に dummy (CEO 厳守: speechBuilder の STATIC_MOCK は
        // 内部 const、export されていないため、diagnostic では fallback 内容自体は重要でない
        // = dummy で代替)。重要なのは attemptViolations と rawAttempts。
        const result = await postValidateSpeech(initialText, {
          regenerate: wrappedRegenerate,
          fallbackText: `<diagnostic-fallback-${target.variant}>`,
          override: lengthOverride,
          maxRetries: 2,
        });

        const latencyMs = Date.now() - startTime;
        const attemptStats = rawAttempts.map(computeAttemptStats);

        samples.push({
          variant: target.variant,
          sampleIndex: i,
          prompt,
          lengthOverride,
          rawAttempts,
          attemptViolations: result.attemptViolations.map((v) => [...v]),
          attemptStats,
          finalText: result.finalText,
          retries: result.retries,
          fallbackUsed: result.fallbackUsed,
          latencyMs,
        });
        console.log(
          `  [${i + 1}/${target.samples}] retries=${result.retries}, fallback=${result.fallbackUsed}, latency=${latencyMs}ms, attempts=${rawAttempts.length}, totalViolations=${result.attemptViolations.reduce((s, v) => s + v.length, 0)}`,
        );
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        samples.push({
          variant: target.variant,
          sampleIndex: i,
          prompt,
          lengthOverride,
          rawAttempts,
          attemptViolations: [],
          attemptStats: rawAttempts.map(computeAttemptStats),
          finalText: "",
          retries: -1,
          fallbackUsed: true,
          latencyMs: Date.now() - startTime,
          error: errMsg,
        });
        console.log(`  [${i + 1}/${target.samples}] ERROR: ${errMsg}`);
      }
      // rate limit (各 sample 間)
      if (i < target.samples - 1) await sleep(RATE_LIMIT_INTERVAL_MS);
    }
    // variant 間にも間隔
    await sleep(RATE_LIMIT_INTERVAL_MS);
  }

  // 出力 (CEO/GPT 補正 1: process.cwd() 基準、CEO 厳守: commit しない / Sentry 送らない)
  const tmpDir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const timestamp = formatTimestamp();
  const jsonPath = path.join(
    tmpDir,
    `stage23-variant-review-diagnostic-${timestamp}.json`,
  );
  const mdPath = path.join(
    tmpDir,
    `stage23-variant-review-diagnostic-${timestamp}.md`,
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), mode: "diagnostic", samples },
      null,
      2,
    ),
  );
  fs.writeFileSync(mdPath, formatDiagnosticMarkdown(samples));

  console.log("");
  console.log("─".repeat(60));
  console.log("✓ Diagnostic done.");
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log("");
  console.log(
    "Note: 出力 file は .tmp/ 以下、commit されません (.gitignore 除外)。",
  );
  console.log(
    "Next: CEO が MD を読んで variant 別 violation kind 分布を確認、",
  );
  console.log(
    "      length_violation dominant ? worldview dominant ? を判定 → 修正方針議論。",
  );
}

async function runConfirm(llmCall: ReturnType<typeof createAnthropicLlmCall>): Promise<void> {
  console.log("=== CONFIRM MODE: 35 samples (7 variant × 5) ===");
  console.log("");

  const results: SampleResult[] = [];

  try {
    setLlmCall(llmCall);

    for (const variant of PATTERN_VARIANTS) {
      const fixture = VARIANT_FIXTURES[variant];
      console.log(`Variant ${variant} (${fixture.state}/${fixture.mode}):`);
      for (let i = 0; i < SAMPLES_PER_VARIANT; i++) {
        const startTime = Date.now();
        try {
          const speech = await buildPresenceSpeech(fixture);
          const latencyMs = Date.now() - startTime;
          results.push({
            variant,
            sampleIndex: i,
            body: speech.body,
            source: speech.source,
            retries: speech.retries,
            latencyMs,
            validationFailed: speech.validationFailed,
            fallbackReason: speech.fallbackReason,
            appliedLength: speech.appliedLength,
            tone: speech.tone,
          });
          console.log(
            `  [${i + 1}/${SAMPLES_PER_VARIANT}] source=${speech.source}, retries=${speech.retries}, latency=${latencyMs}ms`,
          );
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          results.push({ variant, sampleIndex: i, error: errMsg });
          console.log(
            `  [${i + 1}/${SAMPLES_PER_VARIANT}] ERROR: ${errMsg}`,
          );
        }
        // rate limit 配慮
        if (i < SAMPLES_PER_VARIANT - 1) {
          await sleep(RATE_LIMIT_INTERVAL_MS);
        }
      }
      // variant 間にも間隔
      await sleep(RATE_LIMIT_INTERVAL_MS);
    }
  } finally {
    // CEO/GPT 補正 4: 終了時に injection 状態を戻す (test 環境再利用時の clean さ)
    setLlmCall(null);
  }

  // 出力 (CEO/GPT 補正 1: process.cwd() 基準)
  const tmpDir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const timestamp = formatTimestamp();
  const jsonPath = path.join(
    tmpDir,
    `stage23-variant-review-${timestamp}.json`,
  );
  const mdPath = path.join(tmpDir, `stage23-variant-review-${timestamp}.md`);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), mode: "confirm", results },
      null,
      2,
    ),
  );
  fs.writeFileSync(mdPath, formatMarkdown(results));

  console.log("");
  console.log("─".repeat(60));
  console.log("✓ Done.");
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log("");
  console.log(
    "Note: 出力 file は .tmp/ 以下、commit されません (.gitignore 除外)。",
  );
  console.log(
    "Next: CEO が MD を読んで質的 review、Claude に共有 → 数値集計 → 総合判定。",
  );
}

async function main(): Promise<void> {
  const { mode } = guardEnv();

  console.log("─".repeat(60));
  console.log("CoAlter L4-i Phase 2 Stage 2.3 — Variant Quality Review");
  console.log(`Mode: ${mode}`);
  console.log("─".repeat(60));
  console.log("");
  if (mode === "probe") {
    console.log("Estimated LLM calls: 1 minimum, more if retries occur.");
  } else if (mode === "diagnostic") {
    const totalDiagSamples = DIAGNOSTIC_TARGETS.reduce(
      (s, t) => s + t.samples,
      0,
    );
    console.log(
      `Estimated LLM calls: ${totalDiagSamples} minimum, more if retries occur (E${DIAGNOSTIC_TARGETS[0].samples}/A${DIAGNOSTIC_TARGETS[1].samples}/F2 ${DIAGNOSTIC_TARGETS[2].samples}).`,
    );
  } else {
    console.log(
      `Estimated LLM calls: ${TOTAL_SAMPLES} minimum, more if retries occur.`,
    );
  }
  console.log(
    `Estimated cost: rough estimate only; depends on model, prompt tokens, and retry count.`,
  );
  if (mode === "probe") {
    console.log("Output: .tmp/stage23-variant-review-probe-<timestamp>.json/md");
  } else if (mode === "diagnostic") {
    console.log(
      "Output: .tmp/stage23-variant-review-diagnostic-<timestamp>.json/md",
    );
  } else {
    console.log("Output: .tmp/stage23-variant-review-<timestamp>.json/md");
  }
  console.log("");
  console.log(
    `Press Ctrl+C within ${ABORT_GRACE_MS / 1000} seconds to abort.`,
  );
  console.log("");
  await sleep(ABORT_GRACE_MS);

  const llmCall = createAnthropicLlmCall({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  if (mode === "probe") {
    await runProbe(llmCall);
  } else if (mode === "diagnostic") {
    await runDiagnostic(llmCall);
  } else {
    await runConfirm(llmCall);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
