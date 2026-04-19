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
  // δ M0-6C: sample 群の signal 多様性確認用。rule 分岐に直結する 8 信号を保持。
  signals: {
    energyLevel: string;
    conversationArc: string;
    fatigueSignal: string;
    celebrationSignal: string;
    caringGapBucket: string;
    implicitMoodNonEmpty: string;
    renLeaningA: string;
    renLeaningB: string;
    calendarDensityA: string;
    calendarDensityB: string;
  };
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

  // [CEO lock 2026-04-20 案 B] shadow 評価の統計精度は n≒30-50 で安定。
  // cases 全量ではなく最新 N 件（tail）を評価対象にする。
  // cases[] は export CLI 側で created_at ASC 順。tail = 最新。
  const maxCases = parseMaxCases(process.env.COALTER_SHADOW_MAX_CASES);
  const selected =
    maxCases !== null && doc.cases.length > maxCases
      ? doc.cases.slice(-maxCases)
      : doc.cases;

  const rows: Row[] = [];
  for (const c of selected) {
    const row = await evaluateCase(c, client);
    rows.push(row);
  }

  report(doc.pairHash, rows, {
    totalCasesInFile: doc.cases.length,
    evaluatedCases: selected.length,
  });
}

function parseMaxCases(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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

  const ci = c.compressedInput;
  const gap = Math.abs(ci.caringIntensity.a - ci.caringIntensity.b);
  const caringGapBucket =
    gap < 0.05 ? "~0" : gap < 0.1 ? "<0.1" : gap < 0.2 ? "<0.2" : ">=0.2";

  return {
    caseId: c.caseId,
    ruleMode: c.ruleSnapshot.mode,
    llmMode: llmReading?.mode ?? null,
    modeAgreement: llmReading ? llmReading.mode === c.ruleSnapshot.mode : false,
    confidenceDelta: cd,
    llmOutcome: res.outcome,
    llmLatencyMs: elapsed,
    signals: {
      energyLevel: ci.energyLevel,
      conversationArc: ci.conversationArc,
      fatigueSignal: ci.fatigueSignal,
      celebrationSignal: String(ci.celebrationSignal),
      caringGapBucket,
      implicitMoodNonEmpty: ci.implicitMood.trim().length > 0 ? "yes" : "no",
      renLeaningA: String(ci.renLeaning.a),
      renLeaningB: String(ci.renLeaning.b),
      calendarDensityA: String(ci.calendarDensity.a ?? "null"),
      calendarDensityB: String(ci.calendarDensity.b ?? "null"),
    },
  };
}

function report(
  pairHash: string,
  rows: Row[],
  meta: { totalCasesInFile: number; evaluatedCases: number },
): void {
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
  console.log(
    `対象: file 内 ${meta.totalCasesInFile} cases 中 ${meta.evaluatedCases} cases を評価（最新 tail）`,
  );
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
  console.log("── llm-side mode 分布 ──────────────────────────────────────────────");
  const llmDist = new Map<string, number>();
  for (const r of rows) {
    const k = r.llmMode ?? "(null)";
    llmDist.set(k, (llmDist.get(k) ?? 0) + 1);
  }
  for (const [m, n] of llmDist) {
    console.log(`  ${m.padEnd(10)} : ${n} (${pct(n, total)})`);
  }
  console.log();
  console.log("── 混同行列 (rule × llm) ───────────────────────────────────────────");
  const LLM_MODES = ["recover", "celebrate", "maintain", "connect", "challenge", "(null)"];
  console.log("  rule \\ llm  " + LLM_MODES.map((m) => m.padStart(10)).join(""));
  for (const rm of MODES) {
    const subset = rows.filter((r) => r.ruleMode === rm);
    if (subset.length === 0) continue;
    const counts = LLM_MODES.map(
      (lm) =>
        subset.filter((r) => (r.llmMode ?? "(null)") === lm).length,
    );
    console.log(
      `  ${rm.padEnd(11)} ` + counts.map((c) => String(c).padStart(10)).join(""),
    );
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
  // δ M0-6C: signal entropy — tail sample が構造的に variation を持っているかを見る
  console.log("── signal entropy (bit) — tail sample の多様性指標 ─────────────────");
  const signalKeys: (keyof Row["signals"])[] = [
    "energyLevel",
    "conversationArc",
    "fatigueSignal",
    "celebrationSignal",
    "caringGapBucket",
    "implicitMoodNonEmpty",
    "renLeaningA",
    "renLeaningB",
    "calendarDensityA",
    "calendarDensityB",
  ];
  for (const k of signalKeys) {
    const values = rows.map((r) => r.signals[k]);
    const h = shannonEntropy(values);
    const distinct = new Set(values).size;
    console.log(
      `  ${k.padEnd(22)}: H=${h.toFixed(3)} distinct=${distinct}`,
    );
  }
  console.log();
  console.log("═══════════════════════════════════════════════════════════════════");
}

function shannonEntropy(values: string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / values.length;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
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
