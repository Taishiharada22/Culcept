/**
 * CoAlter Stage 1 Understand — shadow replay CLI (M0-5 bootstrap)
 *
 * 実行: `npx tsx scripts/coalter/shadow-replay.ts`
 *
 * [CEO lock 2026-04-20 M0-5]
 *   - 実 LLM API は叩かない（決定論 stub のみ）
 *   - prod runtime / DB / analytics に touch しない
 *   - prompt / raw output は出力しない（集約値のみ）
 *
 * 目的:
 *   合成 pair 20 × stub strategy 5 = 100 件の shadow 比較を実行し、
 *   modeAgreement / llmOutcome / latency の**初回分布**を stdout に出す。
 *   集計結果は docs への転記を想定（自動保存しない）。
 */

import { compareTodayReaders } from "@/lib/coalter/understanding/compareTodayReaders";
import {
  STUB_STRATEGIES,
  makeStubClient,
  type StubStrategy,
} from "@/lib/coalter/understanding/__testkit__/adversarialStubs";
import {
  buildBootstrapMatrix,
  buildExtendedMatrix,
  buildSyntheticBundle,
} from "@/lib/coalter/understanding/__testkit__/syntheticPairs";
import type { TodayMode } from "@/lib/coalter/understanding/types";

const FIXED_NOW = "2026-04-20T12:00:00Z";

type Row = {
  caseId: string;
  strategy: StubStrategy;
  modeAgreement: boolean;
  ruleMode: TodayMode;
  llmMode: TodayMode | null;
  confidenceDelta: number | null;
  llmOutcome: "ok" | "fallback" | "error";
  latencyRule: number;
  latencyLlm: number;
};

async function run(): Promise<void> {
  // [M0-6A] default は extended 50 件。CLI 引数 `--legacy` で 20 件 bootstrap。
  const useLegacy = process.argv.includes("--legacy");
  const cases = useLegacy ? buildBootstrapMatrix() : buildExtendedMatrix();
  const rows: Row[] = [];

  for (const p of cases) {
    const bundle = buildSyntheticBundle(p);
    for (const strategy of STUB_STRATEGIES) {
      const client = makeStubClient(strategy);
      const c = await compareTodayReaders(bundle, FIXED_NOW, client);
      rows.push({
        caseId: p.id,
        strategy,
        modeAgreement: c.modeAgreement,
        ruleMode: c.ruleMode,
        llmMode: c.llmMode,
        confidenceDelta: c.confidenceDelta,
        llmOutcome: c.llmOutcome,
        latencyRule: c.latencyMs.rule,
        latencyLlm: c.latencyMs.llm,
      });
    }
  }

  report(rows);
}

function report(rows: Row[]): void {
  const total = rows.length;
  const agree = rows.filter((r) => r.modeAgreement).length;
  const ok = rows.filter((r) => r.llmOutcome === "ok").length;
  const fallback = rows.filter((r) => r.llmOutcome === "fallback").length;
  const err = rows.filter((r) => r.llmOutcome === "error").length;

  const ruleLat = rows.map((r) => r.latencyRule).sort((a, b) => a - b);
  const llmLat = rows.map((r) => r.latencyLlm).sort((a, b) => a - b);

  const modeDist = new Map<TodayMode, number>();
  for (const r of rows) {
    modeDist.set(r.ruleMode, (modeDist.get(r.ruleMode) ?? 0) + 1);
  }

  const cdRows = rows.filter((r) => r.confidenceDelta !== null);
  const cdVals = cdRows.map((r) => r.confidenceDelta as number).sort((a, b) => a - b);

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("CoAlter Stage 1 Understand — shadow replay bootstrap (M0-5)");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log();
  const caseCount = rows.length / STUB_STRATEGIES.length;
  console.log(`総件数: ${total} (${caseCount} cases × ${STUB_STRATEGIES.length} strategies)`);
  console.log();
  console.log("── llmOutcome 分布 ─────────────────────────────────────────────────");
  console.log(`  ok       : ${ok} (${pct(ok, total)})`);
  console.log(`  fallback : ${fallback} (${pct(fallback, total)})`);
  console.log(`  error    : ${err} (${pct(err, total)})`);
  console.log();
  console.log("── modeAgreement ───────────────────────────────────────────────────");
  console.log(`  全体: ${agree}/${total} = ${pct(agree, total)}`);
  for (const strategy of STUB_STRATEGIES) {
    const sub = rows.filter((r) => r.strategy === strategy);
    const subAgree = sub.filter((r) => r.modeAgreement).length;
    console.log(`  ${strategy.padEnd(22)} : ${subAgree}/${sub.length} = ${pct(subAgree, sub.length)}`);
  }
  console.log();
  console.log("── rule-side mode 分布 ─────────────────────────────────────────────");
  for (const [m, n] of modeDist) {
    console.log(`  ${m.padEnd(10)} : ${n} (${pct(n, total)})`);
  }
  console.log();
  console.log("── latency (ms) ────────────────────────────────────────────────────");
  console.log(`  rule  : min=${ruleLat[0]} p50=${pctile(ruleLat, 0.5)} p95=${pctile(ruleLat, 0.95)} max=${ruleLat[ruleLat.length - 1]}`);
  console.log(`  llm   : min=${llmLat[0]} p50=${pctile(llmLat, 0.5)} p95=${pctile(llmLat, 0.95)} max=${llmLat[llmLat.length - 1]}`);
  console.log();
  console.log("── confidenceDelta (llm - rule) ────────────────────────────────────");
  if (cdVals.length === 0) {
    console.log("  n/a (全件 llm fallback/error)");
  } else {
    console.log(`  n=${cdVals.length} min=${cdVals[0]} p50=${pctile(cdVals, 0.5)} p95=${pctile(cdVals, 0.95)} max=${cdVals[cdVals.length - 1]}`);
    const absMedian = pctile(cdVals.map((v) => Math.abs(v)).sort((a, b) => a - b), 0.5);
    console.log(`  |delta| median: ${absMedian}`);
  }
  console.log();
  console.log("═══════════════════════════════════════════════════════════════════");
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
  console.error(err);
  process.exit(1);
});
