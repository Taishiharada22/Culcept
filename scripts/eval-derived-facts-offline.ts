/**
 * オフライン評価ゲート — 旧top8 vs derived facts の品質比較
 *
 * 設計書 §12「オフライン評価ゲート（Phase 1 GO前の必須条件）」に基づく。
 *
 * Phase 1 スコープ:
 *   - synthetic fixture (5ケース) で骨格検証
 *   - generateDerivedFacts + _legacyTop8 の出力を並列生成
 *   - LLM呼び出しは行わない（プロンプト比較まで）
 *   - 自動計測可能な3指標を算出
 *
 * 本番ゲート（flag ON前に必須）:
 *   - 実ユーザー20人×5質問 = 100ケース
 *   - LLM呼び出し + 応答生成
 *   - 5指標すべて評価（人手2指標含む）
 *   - 4/5指標PASS + 事実の正確性必須PASS
 *
 * 使い方:
 *   npx tsx scripts/eval-derived-facts-offline.ts
 *
 * @see docs/design/stargazer-alter-axis-architecture.md §12
 */

import * as fs from "fs";
import * as path from "path";
import {
  generateDerivedFacts,
  formatDerivedFactsForPrompt,
  type DerivedFactGeneratorInput,
  type ContradictionInput,
  type DerivedFactSet,
} from "../lib/stargazer/derivedFactGenerator";
import type { TraitAxisKey } from "../lib/stargazer/traitAxes";
import { AXIS_REGISTRY } from "../lib/stargazer/axisRegistry";

// ─── Types ────────────────────────────────────────────────

interface Snapshot {
  id: string;
  description: string;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  contradictions: Array<{ axisA: TraitAxisKey; axisB: TraitAxisKey; tension: number }>;
  questions: string[];
}

interface FixtureFile {
  _meta: { status: string; note: string };
  snapshots: Snapshot[];
}

interface EvalCase {
  snapshotId: string;
  question: string;
  legacyPromptSection: string;
  derivedPromptSection: string;
  derivedFactSet: DerivedFactSet;
  metrics: {
    /** 派生事実が参照するユニーク軸数 */
    derivedAxesCoverage: number;
    /** 旧top8が参照するユニーク軸数 */
    legacyAxesCoverage: number;
    /** 派生事実の平均confidence */
    avgConfidence: number;
    /** 派生事実の数 */
    factCount: number;
    /** sourceType分布 */
    sourceTypeDistribution: Record<string, number>;
  };
}

interface EvalSummary {
  totalCases: number;
  fixtureStatus: string;
  avgDerivedAxesCoverage: number;
  avgLegacyAxesCoverage: number;
  axesCoverageRatio: number; // derived / legacy
  avgConfidence: number;
  avgFactCount: number;
  sourceTypeBreakdown: Record<string, number>;
  /** Phase 1自動判定: 派生事実が旧top8より多くの軸をカバーしているか */
  coveragePass: boolean;
  /** Phase 1自動判定: 全ケースで5-8文の事実が生成されているか */
  factCountPass: boolean;
  /** Phase 1自動判定: 平均confidenceが0.3以上か */
  confidencePass: boolean;
}

// ─── Legacy Top8 再現 ─────────────────────────────────────

function legacyTop8Prompt(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): { prompt: string; axesUsed: TraitAxisKey[] } {
  const axisEntries = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([, a], [, b]) => Math.abs((b as number) - 0.5) - Math.abs((a as number) - 0.5))
    .slice(0, 8);

  const lines = ["### 軸スコア（具体的な数値と意味）", ""];
  const axesUsed: TraitAxisKey[] = [];

  for (const [key, value] of axisEntries) {
    const entry = AXIS_REGISTRY.get(key as TraitAxisKey);
    const label = entry
      ? `${entry.labelLeft}/${entry.labelRight}`
      : key;
    const score = value as number;
    const direction = score >= 0.5
      ? `やや「${entry?.labelRight ?? "右"}」傾向`
      : `やや「${entry?.labelLeft ?? "左"}」傾向`;
    lines.push(`- ${label}: ${score.toFixed(2)} → ${direction}`);
    axesUsed.push(key as TraitAxisKey);
  }

  return { prompt: lines.join("\n"), axesUsed };
}

// ─── Main ─────────────────────────────────────────────────

function main() {
  console.log("=== オフライン評価ゲート: Phase 1 骨格検証 ===\n");

  // Fixture読み込み
  const fixturePath = path.resolve(__dirname, "../tests/fixtures/alter-axis-snapshots.json");
  const raw = fs.readFileSync(fixturePath, "utf-8");
  const fixture: FixtureFile = JSON.parse(raw);

  console.log(`Fixture: ${fixture._meta.status} (${fixture.snapshots.length} snapshots)`);
  console.log(`Note: ${fixture._meta.note}\n`);

  const evalCases: EvalCase[] = [];

  // 各snapshot × 各question でケース生成
  for (const snapshot of fixture.snapshots) {
    const contradictionInputs: ContradictionInput[] = snapshot.contradictions.map((c) => {
      const entryA = AXIS_REGISTRY.get(c.axisA);
      const entryB = AXIS_REGISTRY.get(c.axisB);
      const labelA = entryA ? `${entryA.labelLeft}/${entryA.labelRight}` : c.axisA;
      const labelB = entryB ? `${entryB.labelLeft}/${entryB.labelRight}` : c.axisB;
      return {
        axisA: c.axisA,
        axisB: c.axisB,
        insight: `「${labelA}」と「${labelB}」の傾向が矛盾している`,
        tension: c.tension,
      };
    });

    const derivedInput: DerivedFactGeneratorInput = {
      axisScores: snapshot.axisScores,
      contradictions: contradictionInputs,
      blindSpots: [],
      queryDomain: null,
    };

    const factSet = generateDerivedFacts(derivedInput);

    const topExtremeAxes = Object.entries(snapshot.axisScores)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, value]) => ({ key: key as TraitAxisKey, score: value as number }))
      .sort((a, b) => Math.abs(b.score - 0.5) - Math.abs(a.score - 0.5))
      .slice(0, 3);

    const derivedPrompt = formatDerivedFactsForPrompt(factSet, topExtremeAxes);
    const legacy = legacyTop8Prompt(snapshot.axisScores);

    const sourceTypeDist: Record<string, number> = {};
    for (const f of factSet.facts) {
      sourceTypeDist[f.sourceType] = (sourceTypeDist[f.sourceType] ?? 0) + 1;
    }

    for (const question of snapshot.questions) {
      evalCases.push({
        snapshotId: snapshot.id,
        question,
        legacyPromptSection: legacy.prompt,
        derivedPromptSection: derivedPrompt,
        derivedFactSet: factSet,
        metrics: {
          derivedAxesCoverage: factSet.totalAxesUsed,
          legacyAxesCoverage: legacy.axesUsed.length,
          avgConfidence:
            factSet.facts.reduce((sum, f) => sum + f.confidence, 0) /
            Math.max(factSet.facts.length, 1),
          factCount: factSet.facts.length,
          sourceTypeDistribution: sourceTypeDist,
        },
      });
    }
  }

  // サマリー算出
  const totalCases = evalCases.length;
  const avgDerivedCoverage =
    evalCases.reduce((s, c) => s + c.metrics.derivedAxesCoverage, 0) / totalCases;
  const avgLegacyCoverage =
    evalCases.reduce((s, c) => s + c.metrics.legacyAxesCoverage, 0) / totalCases;
  const avgConfidence =
    evalCases.reduce((s, c) => s + c.metrics.avgConfidence, 0) / totalCases;
  const avgFactCount =
    evalCases.reduce((s, c) => s + c.metrics.factCount, 0) / totalCases;

  const globalSourceType: Record<string, number> = {};
  for (const c of evalCases) {
    for (const [type, count] of Object.entries(c.metrics.sourceTypeDistribution)) {
      globalSourceType[type] = (globalSourceType[type] ?? 0) + count;
    }
  }

  const summary: EvalSummary = {
    totalCases,
    fixtureStatus: fixture._meta.status,
    avgDerivedAxesCoverage: Math.round(avgDerivedCoverage * 10) / 10,
    avgLegacyAxesCoverage: Math.round(avgLegacyCoverage * 10) / 10,
    axesCoverageRatio: Math.round((avgDerivedCoverage / Math.max(avgLegacyCoverage, 1)) * 100) / 100,
    avgConfidence: Math.round(avgConfidence * 1000) / 1000,
    avgFactCount: Math.round(avgFactCount * 10) / 10,
    sourceTypeBreakdown: globalSourceType,
    coveragePass: avgDerivedCoverage >= avgLegacyCoverage * 1.5,
    factCountPass: evalCases.every((c) => c.metrics.factCount >= 5 && c.metrics.factCount <= 8),
    confidencePass: avgConfidence >= 0.3,
  };

  // 出力
  console.log("─── Per-Snapshot Results ────────────────\n");
  const snapshotIds = [...new Set(evalCases.map((c) => c.snapshotId))];
  for (const id of snapshotIds) {
    const cases = evalCases.filter((c) => c.snapshotId === id);
    const first = cases[0];
    const snapshot = fixture.snapshots.find((s) => s.id === id)!;
    console.log(`[${id}] ${snapshot.description}`);
    console.log(`  Derived: ${first.metrics.factCount} facts, ${first.metrics.derivedAxesCoverage} axes`);
    console.log(`  Legacy:  8 labels, ${first.metrics.legacyAxesCoverage} axes`);
    console.log(`  Confidence: ${first.metrics.avgConfidence.toFixed(3)}`);
    console.log(`  Types: ${JSON.stringify(first.metrics.sourceTypeDistribution)}`);
    console.log();
  }

  console.log("─── Summary ────────────────────────────\n");
  console.log(`Total cases: ${summary.totalCases}`);
  console.log(`Fixture: ${summary.fixtureStatus}`);
  console.log(`Avg derived axes coverage: ${summary.avgDerivedAxesCoverage} axes`);
  console.log(`Avg legacy axes coverage:  ${summary.avgLegacyAxesCoverage} axes`);
  console.log(`Coverage ratio (derived/legacy): ${summary.axesCoverageRatio}x`);
  console.log(`Avg confidence: ${summary.avgConfidence}`);
  console.log(`Avg fact count: ${summary.avgFactCount}`);
  console.log(`Source type breakdown: ${JSON.stringify(summary.sourceTypeBreakdown)}`);
  console.log();

  console.log("─── Phase 1 Auto-Checks ────────────────\n");
  console.log(`[${summary.coveragePass ? "PASS" : "FAIL"}] Axes coverage: derived >= legacy × 1.5`);
  console.log(`[${summary.factCountPass ? "PASS" : "FAIL"}] Fact count: 全ケース 5-8文`);
  console.log(`[${summary.confidencePass ? "PASS" : "FAIL"}] Avg confidence >= 0.3`);
  console.log();

  const allPass = summary.coveragePass && summary.factCountPass && summary.confidencePass;
  console.log(`Phase 1 骨格検証: ${allPass ? "ALL PASS ✓" : "SOME FAILED ✗"}`);
  console.log();
  console.log("Note: これはsynthetic dataによる骨格検証です。");
  console.log("本番ゲート（flag ON前）には実ユーザー20人×5質問=100ケースが必要です。");

  // プロンプト比較サンプル出力
  console.log("\n─── Prompt Comparison Sample (User 001, Q1) ────\n");
  const sampleCase = evalCases[0];
  console.log("=== LEGACY (top8) ===");
  console.log(sampleCase.legacyPromptSection);
  console.log("\n=== DERIVED FACTS ===");
  console.log(sampleCase.derivedPromptSection);

  // 結果をJSONで保存
  const outputPath = path.resolve(__dirname, "../docs/eval/derived-facts-v1-phase1.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ summary, cases: evalCases.map((c) => ({
    snapshotId: c.snapshotId,
    question: c.question,
    metrics: c.metrics,
  }))}, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main();
