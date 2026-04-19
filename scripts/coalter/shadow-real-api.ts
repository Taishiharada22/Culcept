/**
 * CoAlter Stage 1 Understand — 実 API shadow runner (M0-6B)
 *
 * 実行: `npx tsx scripts/coalter/shadow-real-api.ts`
 *
 * [CEO lock 2026-04-20 M0-6B]
 *   - 本 runner は ZDR 確認済 + key 発行済 + code-review PASS + shadow 実行承認
 *     が揃ってから実行する（起動時 fail-fast あり）
 *   - prod runtime / DB / analytics に一切 touch しない
 *   - stdout は **集約値のみ**。implicitIntent / latentNeeds / prompt などの
 *     raw string は一切出さない。shadow-replay.ts の出力形式を踏襲する
 *
 * 入力: `COALTER_PAIR_FILE` 環境変数で指定した internal-pair-*.json
 * 出力: llmOutcome 分布 / modeAgreement / confidenceDelta / latency (p50/p95/p99)
 */

import fs from "node:fs";
import { readTodayLLM } from "@/lib/coalter/understanding/todayReaderLLM";
import { createRealApiAdapter } from "@/lib/coalter/understanding/realApiAdapter";
import type {
  InternalPairCase,
  InternalPairExportV1,
} from "@/lib/coalter/understanding/__testkit__/internalPairSchema";
import type { TodayMode } from "@/lib/coalter/understanding/types";

type Row = {
  caseId: string;
  ruleMode: TodayMode;
  llmMode: TodayMode | null;
  modeAgreement: boolean;
  confidenceDelta: number | null;
  llmOutcome: "ok" | "fallback" | "error";
  llmLatencyMs: number;
};

async function run(): Promise<void> {
  const pairFile = required("COALTER_PAIR_FILE");
  const apiKey = required("COALTER_UNDERSTANDING_SHADOW_API_KEY");
  const zdrVerified = process.env.COALTER_SHADOW_ZDR_VERIFIED === "1";

  const raw = fs.readFileSync(pairFile, "utf8");
  const doc = JSON.parse(raw) as InternalPairExportV1;
  if (doc.schemaVersion !== "coalter.internal_pair.v1") {
    throw new Error(
      `shadow-real-api: unexpected schemaVersion=${doc.schemaVersion}`,
    );
  }

  // 起動時 fail-fast（zdrVerified=false でここで throw）
  const client = createRealApiAdapter({ apiKey, zdrVerified });

  const rows: Row[] = [];
  for (const c of doc.cases) {
    const row = await evaluateCase(c, client);
    rows.push(row);
  }

  report(doc.pairHash, rows);
}

async function evaluateCase(
  c: InternalPairCase,
  client: ReturnType<typeof createRealApiAdapter>,
): Promise<Row> {
  const t0 = Date.now();
  const res = await readTodayLLM(c.compressedInput, client);
  const elapsed = Math.max(0, Date.now() - t0);

  const llmReading = res.outcome === "ok" ? res.reading : null;
  const cd =
    llmReading === null
      ? null
      : Math.round(
          (llmReading.confidence - c.ruleSnapshot.confidence) * 1000,
        ) / 1000;

  return {
    caseId: c.caseId,
    ruleMode: c.ruleSnapshot.mode,
    llmMode: llmReading?.mode ?? null,
    modeAgreement: llmReading ? llmReading.mode === c.ruleSnapshot.mode : false,
    confidenceDelta: cd,
    llmOutcome: res.outcome,
    llmLatencyMs: elapsed,
  };
}

function report(pairHash: string, rows: Row[]): void {
  const total = rows.length;
  const agree = rows.filter((r) => r.modeAgreement).length;
  const ok = rows.filter((r) => r.llmOutcome === "ok").length;
  const fb = rows.filter((r) => r.llmOutcome === "fallback").length;
  const er = rows.filter((r) => r.llmOutcome === "error").length;

  const latencies = rows.map((r) => r.llmLatencyMs).sort((a, b) => a - b);
  const cd = rows
    .map((r) => r.confidenceDelta)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const modeDist = new Map<TodayMode, number>();
  for (const r of rows) {
    modeDist.set(r.ruleMode, (modeDist.get(r.ruleMode) ?? 0) + 1);
  }

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`CoAlter Stage 1 Understand — real API shadow (M0-6B) pairHash=${pairHash}`);
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log();
  console.log(`総件数: ${total}`);
  console.log();
  console.log("── llmOutcome 分布 ─────────────────────────────────────────────────");
  console.log(`  ok       : ${ok} (${pct(ok, total)})`);
  console.log(`  fallback : ${fb} (${pct(fb, total)})`);
  console.log(`  error    : ${er} (${pct(er, total)})`);
  console.log();
  console.log("── modeAgreement ───────────────────────────────────────────────────");
  console.log(`  全体: ${agree}/${total} = ${pct(agree, total)}`);
  console.log();
  console.log("── mode 別 modeAgreement (rule-side mode で集計) ───────────────────");
  const MODES: TodayMode[] = ["recover", "celebrate", "maintain", "connect", "challenge"];
  for (const m of MODES) {
    const sub = rows.filter((r) => r.ruleMode === m);
    const subAgree = sub.filter((r) => r.modeAgreement).length;
    if (sub.length === 0) {
      console.log(`  ${m.padEnd(10)} : 件数 0（このランでは該当なし）`);
    } else {
      console.log(`  ${m.padEnd(10)} : ${subAgree}/${sub.length} = ${pct(subAgree, sub.length)}`);
    }
  }
  console.log();
  console.log("── rule-side mode 分布 ─────────────────────────────────────────────");
  for (const [m, n] of modeDist) {
    console.log(`  ${m.padEnd(10)} : ${n} (${pct(n, total)})`);
  }
  console.log();
  console.log("── llm latency (ms) ────────────────────────────────────────────────");
  if (latencies.length === 0) {
    console.log("  n/a");
  } else {
    console.log(
      `  min=${latencies[0]} p50=${pctile(latencies, 0.5)} p95=${pctile(latencies, 0.95)} p99=${pctile(latencies, 0.99)} max=${latencies[latencies.length - 1]}`,
    );
  }
  console.log();
  console.log("── confidenceDelta (llm - rule) ────────────────────────────────────");
  if (cd.length === 0) {
    console.log("  n/a (全件 llm fallback/error)");
  } else {
    console.log(
      `  n=${cd.length} min=${cd[0]} p50=${pctile(cd, 0.5)} p95=${pctile(cd, 0.95)} max=${cd[cd.length - 1]}`,
    );
    const absMed = pctile(
      cd.map((v) => Math.abs(v)).sort((a, b) => a - b),
      0.5,
    );
    console.log(`  |delta| median: ${absMed}`);
  }
  console.log();
  console.log("═══════════════════════════════════════════════════════════════════");
}

function required(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`shadow-real-api: env ${name} is required`);
  }
  return v;
}

function pct(n: number, d: number): string {
  if (d === 0) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[shadow-real-api] fatal: ${msg}`);
  process.exit(1);
});
