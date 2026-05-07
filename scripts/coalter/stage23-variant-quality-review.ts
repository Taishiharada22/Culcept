#!/usr/bin/env npx tsx
/**
 * CoAlter L4-i Phase 2 Stage 2.3 — Variant Quality Review (manual script)
 *
 * 正本: layout plan v0.3 §7.9 / CEO 確定方針 (2026-05-08 設計 v3)
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
 * 実行ガード (2 段、CEO/GPT 補正 2026-05-08):
 *   1. STAGE23_VARIANT_REVIEW=true 必須
 *   2. STAGE23_VARIANT_REVIEW_CONFIRM=35 必須 (sample 数と一致確認)
 *   3. ANTHROPIC_API_KEY 必須 (.env.local から dotenv 読み込み)
 *   4. 開始前 5 秒猶予 (Ctrl+C で abort 可、補助的、env guard が主)
 *
 * 実行方法:
 *   STAGE23_VARIANT_REVIEW=true \
 *   STAGE23_VARIANT_REVIEW_CONFIRM=35 \
 *   npx tsx scripts/coalter/stage23-variant-quality-review.ts
 *
 * 出力 (commit しない、.gitignore で除外):
 *   .tmp/stage23-variant-review-<timestamp>.json (raw data)
 *   .tmp/stage23-variant-review-<timestamp>.md   (CEO 質的 review 用)
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

// ─────────────────────────────────────────────
// guard
// ─────────────────────────────────────────────

function guardEnv(): void {
  if (process.env.STAGE23_VARIANT_REVIEW !== "true") {
    console.error(
      "Refused: STAGE23_VARIANT_REVIEW=true required",
    );
    process.exit(1);
  }
  if (process.env.STAGE23_VARIANT_REVIEW_CONFIRM !== "35") {
    console.error(
      "Refused: STAGE23_VARIANT_REVIEW_CONFIRM=35 required (matches sample count)",
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Refused: ANTHROPIC_API_KEY required (set in .env.local or CLI)",
    );
    process.exit(1);
  }
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

async function main(): Promise<void> {
  guardEnv();

  console.log("─".repeat(60));
  console.log("CoAlter L4-i Phase 2 Stage 2.3 — Variant Quality Review");
  console.log("─".repeat(60));
  console.log("");
  console.log(
    `Estimated LLM calls: ${TOTAL_SAMPLES} minimum, more if retries occur.`,
  );
  console.log(
    `Estimated cost: rough estimate only; depends on model, prompt tokens, and retry count.`,
  );
  console.log("Output: .tmp/stage23-variant-review-<timestamp>.json/md");
  console.log("");
  console.log(
    `Press Ctrl+C within ${ABORT_GRACE_MS / 1000} seconds to abort.`,
  );
  console.log("");
  await sleep(ABORT_GRACE_MS);

  const llmCall = createAnthropicLlmCall({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

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
      { generatedAt: new Date().toISOString(), results },
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

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
