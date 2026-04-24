/**
 * CoAlter Stage 1 Understand — U1-U5 gate measurement harness (B-2 / B-3, 2026-04-24)
 *
 * Spec 位置づけ:
 *   本 docstring が正本（docstring-as-spec、live smoke と同方針）。
 *   2026-04-24 Step B 再定義（docs/coalter-handoff-2026-04-22.md §2 rev 3）
 *   で B-2 / B-3 の自律範囲として新設された計測 harness。
 *
 * 何を測るか（docs/coalter-movie-three-stage-design.md §12.3 準拠）:
 *   U1. outcome success 率（success / total）        閾値 ≥ 95%
 *   U2. sourcedFrom 2 カテゴリ以上埋まり率（両者）   閾値 ≥ 90%
 *   U3. understanding_confidence 中央値                閾値 ≥ 0.60
 *   U4. latency p95（runUnderstanding 単体の経過 ms） 閾値 ≤ 5000ms
 *   U5. 同一ペア × 複数 session の min-Jaccard が 0.95 以上の pair 率 閾値 ≥ 95%
 *
 * α 範囲（本 harness）の射程と限界:
 *   - 既存 code touch 0（emitter / diagnostics にも patch しない）
 *   - U1-U4 は runUnderstanding 戻り値 + harness 側 performance.now() から算出
 *   - U5 は **same-bundle determinism** の検証まで。同一 pair を同一 bundle で
 *     N session 走らせ coreDecisionPrinciples が決定論的に一致することを確認する。
 *     真の cross-session consistency（conversation 差分 / 環境差分の下での安定性）は
 *     β 範囲（preview 実測、B-6）で評価する
 *
 * 設計選択:
 *   - diagnostics emitter は経由しない（kill switch に依存せず計測したい）
 *   - outcome は harness 側で judgeOutcome() を再呼び出しして算出
 *     （emitter 出力と判定式は同じ、index.ts の public API を使う）
 *
 * 実行:
 *   npx tsx scripts/coalter/understanding-u-gate.ts
 *
 * 出力:
 *   stdout に U1-U5 と distribution を表形式で出す。
 *   結果は docs/coalter-handoff-2026-04-22.md に rev 追記する運用。自動書込はしない。
 *
 * CEO 承認改訂履歴:
 *   2026-04-24 Step B-2/B-3: 本 harness 新設（α 範囲の自律実行、CEO 承認済「順序 B-1 → B-4 → B-2 → B-3」）
 *   (以降の CEO 追加指示はここに年月日付きで追記する)
 */

import {
  judgeOutcome,
  runUnderstanding,
} from "@/lib/coalter/understanding/index";
import {
  buildExtendedMatrix,
  buildSyntheticBundle,
  type SyntheticPairParams,
} from "@/lib/coalter/understanding/__testkit__/syntheticPairs";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UnderstandingOutcome,
} from "@/lib/coalter/understanding/types";

const SESSIONS_PER_PAIR = 3;
const PAIR_SAMPLE_SIZE = 10;
const NOWS: string[] = [
  "2026-04-24T08:00:00Z",
  "2026-04-24T13:00:00Z",
  "2026-04-24T20:00:00Z",
];

/**
 * pair sampling 戦略:
 *  - default: stride=5 で 50 件 extended matrix から 10 件を mode 横断に抽出
 *    (buildExtendedMatrix は 5 mode × 10 件なので stride=5 で各 mode 2 件ずつ)
 *  - --legacy: slice(0, 10) で先頭 10 件（recover mode のみに偏る）
 */
function selectPairs(all: SyntheticPairParams[]): SyntheticPairParams[] {
  if (process.argv.includes("--legacy")) {
    return all.slice(0, PAIR_SAMPLE_SIZE);
  }
  const stride = Math.max(1, Math.floor(all.length / PAIR_SAMPLE_SIZE));
  const out: SyntheticPairParams[] = [];
  for (let i = 0; i < all.length && out.length < PAIR_SAMPLE_SIZE; i += stride) {
    out.push(all[i]!);
  }
  return out;
}

type RunRecord = {
  pairId: string;
  sessionIndex: number;
  now: string;
  outcome: UnderstandingOutcome | "crashed";
  confidence: number | null;
  sourcedFilledA: boolean;
  sourcedFilledB: boolean;
  latencyMs: number;
  lens: TwoPersonLensToday | null;
  error?: string;
};

async function main(): Promise<void> {
  const allPairs = buildExtendedMatrix();
  const pairs = selectPairs(allPairs);
  const samplingMode = process.argv.includes("--legacy") ? "legacy (first 10, recover mode only)" : "stride=5 (mode-cross)";

  const runs: RunRecord[] = [];
  for (const p of pairs) {
    for (let s = 0; s < SESSIONS_PER_PAIR; s++) {
      const now = NOWS[s] ?? NOWS[0];
      runs.push(await runSingle(p, s, now));
    }
  }

  report(runs, pairs.length, SESSIONS_PER_PAIR, samplingMode);
}

async function runSingle(
  p: SyntheticPairParams,
  sessionIndex: number,
  now: string,
): Promise<RunRecord> {
  const bundle = buildSyntheticBundle(p);
  const start = performance.now();
  try {
    const lens = await runUnderstanding(bundle, now, `${p.id}-s${sessionIndex}`);
    const latencyMs = performance.now() - start;
    const outcome = recomputeOutcome(lens);
    return {
      pairId: p.id,
      sessionIndex,
      now,
      outcome,
      confidence: lens.understanding_confidence,
      sourcedFilledA: countFilledCategories(lens.personalLenses.a) >= 2,
      sourcedFilledB: countFilledCategories(lens.personalLenses.b) >= 2,
      latencyMs,
      lens,
    };
  } catch (err) {
    const latencyMs = performance.now() - start;
    return {
      pairId: p.id,
      sessionIndex,
      now,
      outcome: "crashed",
      confidence: null,
      sourcedFilledA: false,
      sourcedFilledB: false,
      latencyMs,
      lens: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function countFilledCategories(lens: PersonalLens): number {
  let count = 0;
  if (lens.sourcedFrom.stargazer.length > 0) count++;
  if (lens.sourcedFrom.alter.length > 0) count++;
  if (lens.sourcedFrom.behavioral.length > 0) count++;
  return count;
}

function recomputeOutcome(lens: TwoPersonLensToday): UnderstandingOutcome {
  // emitter に依存せず、index.ts 公開の judgeOutcome を再呼び出しして
  // 同じ判定式で outcome を再構築する。
  const sourceCoverage = {
    a: {
      stargazerCount: lens.personalLenses.a.sourcedFrom.stargazer.length,
      alterCount: lens.personalLenses.a.sourcedFrom.alter.length,
      behavioralCount: lens.personalLenses.a.sourcedFrom.behavioral.length,
    },
    b: {
      stargazerCount: lens.personalLenses.b.sourcedFrom.stargazer.length,
      alterCount: lens.personalLenses.b.sourcedFrom.alter.length,
      behavioralCount: lens.personalLenses.b.sourcedFrom.behavioral.length,
    },
  };
  return judgeOutcome({
    confidence: lens.understanding_confidence,
    missingDomains: lens.dataGaps,
    sourceCoverage,
  });
}

function report(runs: RunRecord[], pairCount: number, sessionsPerPair: number, samplingMode: string): void {
  const total = runs.length;

  // ── U1: outcome success rate ────────────────────────────────────────────
  const successCount = runs.filter((r) => r.outcome === "success").length;
  const degradedCount = runs.filter((r) => r.outcome === "degraded").length;
  const failedCount = runs.filter((r) => r.outcome === "failed").length;
  const crashedCount = runs.filter((r) => r.outcome === "crashed").length;
  const u1Strict = successCount / total;
  const u1Loose = (successCount + degradedCount) / total;

  // ── U2: sourcedFrom ≥2 categories ───────────────────────────────────────
  const u2Count = runs.filter((r) => r.sourcedFilledA && r.sourcedFilledB).length;
  const u2 = u2Count / total;

  // ── U3: understanding_confidence distribution ──────────────────────────
  const confidences = runs
    .map((r) => r.confidence)
    .filter((c): c is number => c !== null)
    .sort((a, b) => a - b);
  const u3P25 = percentile(confidences, 0.25);
  const u3P50 = percentile(confidences, 0.5);
  const u3P75 = percentile(confidences, 0.75);

  // ── U4: latency distribution ────────────────────────────────────────────
  const latencies = runs.map((r) => r.latencyMs).sort((a, b) => a - b);
  const u4P50 = percentile(latencies, 0.5);
  const u4P95 = percentile(latencies, 0.95);
  const u4P99 = percentile(latencies, 0.99);

  // ── U5: same-bundle determinism（α 範囲の限界つき） ─────────────────────
  const pairGroups = groupBy(
    runs.filter((r) => r.lens !== null),
    (r) => r.pairId,
  );
  const perPairMinJaccard: Array<{ pairId: string; minJaccard: number }> = [];
  for (const [pairId, group] of Object.entries(pairGroups)) {
    if (group.length < 2) continue;
    let minJaccard = Infinity;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const aI = new Set(group[i]!.lens!.personalLenses.a.coreDecisionPrinciples);
        const aJ = new Set(group[j]!.lens!.personalLenses.a.coreDecisionPrinciples);
        const bI = new Set(group[i]!.lens!.personalLenses.b.coreDecisionPrinciples);
        const bJ = new Set(group[j]!.lens!.personalLenses.b.coreDecisionPrinciples);
        const jPair = Math.min(jaccard(aI, aJ), jaccard(bI, bJ));
        if (jPair < minJaccard) minJaccard = jPair;
      }
    }
    if (Number.isFinite(minJaccard)) {
      perPairMinJaccard.push({ pairId, minJaccard });
    }
  }
  const u5Count = perPairMinJaccard.filter((x) => x.minJaccard >= 0.95).length;
  const u5Denom = perPairMinJaccard.length;
  const u5 = u5Denom > 0 ? u5Count / u5Denom : null;
  const u5WorstPair =
    perPairMinJaccard.length > 0
      ? perPairMinJaccard.reduce((acc, x) => (x.minJaccard < acc.minJaccard ? x : acc))
      : null;

  // ── print ─────────────────────────────────────────────────────────────
  const bar = "━".repeat(72);
  console.log(bar);
  console.log(
    `CoAlter Stage 1 Understand — U1-U5 initial measurement  (2026-04-24 B-2/B-3)`,
  );
  console.log(
    `fixture: ${total} runs  (${pairCount} pairs × ${sessionsPerPair} sessions, same-bundle)`,
  );
  console.log(`sampling: ${samplingMode}`);
  console.log(bar);
  console.log();

  console.log("U1  outcome success rate              threshold ≥ 95%");
  console.log(
    `    strict (success only):      ${pct(u1Strict)}   [${successCount}/${total}]`,
  );
  console.log(
    `    loose  (success+degraded):  ${pct(u1Loose)}   [${successCount + degradedCount}/${total}]`,
  );
  console.log(
    `    breakdown: success=${successCount}  degraded=${degradedCount}  failed=${failedCount}  crashed=${crashedCount}`,
  );
  console.log();

  console.log("U2  sourcedFrom ≥2 categories (A∧B)   threshold ≥ 90%");
  console.log(`    ${pct(u2)}   [${u2Count}/${total}]`);
  console.log();

  console.log("U3  understanding_confidence          threshold p50 ≥ 0.60");
  console.log(`    p25: ${fmt3(u3P25)}`);
  console.log(`    p50: ${fmt3(u3P50)}   ← U3 target`);
  console.log(`    p75: ${fmt3(u3P75)}`);
  console.log();

  console.log("U4  latency ms                        threshold p95 ≤ 5000ms");
  console.log(`    p50: ${fmt1(u4P50)} ms`);
  console.log(`    p95: ${fmt1(u4P95)} ms   ← U4 target`);
  console.log(`    p99: ${fmt1(u4P99)} ms`);
  console.log();

  console.log("U5  same-bundle determinism Jaccard   threshold ≥ 95%");
  console.log("    (α 範囲: same-bundle 決定論検証。真の cross-session は β 範囲)");
  if (u5 === null) {
    console.log(`    — insufficient multi-session pairs`);
  } else {
    console.log(
      `    pairs with min-Jaccard ≥ 0.95: ${pct(u5)}   [${u5Count}/${u5Denom}]`,
    );
    if (u5WorstPair) {
      console.log(
        `    worst pair: ${u5WorstPair.pairId}  minJaccard=${fmt3(u5WorstPair.minJaccard)}`,
      );
    }
  }
  console.log();

  console.log(bar);
  console.log("gate check:");
  console.log(`  U1 (strict ≥ 95%): ${u1Strict >= 0.95 ? "PASS" : "FAIL"}`);
  console.log(`  U2 (≥ 90%):        ${u2 >= 0.9 ? "PASS" : "FAIL"}`);
  console.log(
    `  U3 (p50 ≥ 0.60):   ${u3P50 !== null && u3P50 >= 0.6 ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  U4 (p95 ≤ 5000ms): ${u4P95 !== null && u4P95 <= 5000 ? "PASS" : "FAIL"}`,
  );
  console.log(`  U5 (≥ 95%):        ${u5 !== null && u5 >= 0.95 ? "PASS" : u5 === null ? "N/A" : "FAIL"}`);
  console.log(bar);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const t of items) {
    const k = key(t);
    if (!out[k]) out[k] = [];
    out[k]!.push(t);
  }
  return out;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function fmt3(x: number | null): string {
  return x === null ? "—" : x.toFixed(3);
}

function fmt1(x: number | null): string {
  return x === null ? "—" : x.toFixed(1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
