/**
 * scripts/axis-healthcheck.ts
 *
 * Layer 1 構造監査 — scanAllAxes を実行し JSON レポートを stdout に出力する。
 * CI / cron から `npx tsx scripts/axis-healthcheck.ts` で呼び出す。
 *
 * HealthCheckDataSources を questions.ts + CF_QUESTIONS + contradictionDetector + alterInsightCardBuilder
 * から構築する。CognitiveFit 質問を questionCountMap に合算することで
 * CF 6 軸の ghost 誤判定を防ぐ。
 */

import { QUESTIONS } from "../lib/stargazer/questions";
import { CF_QUESTIONS, CF_BRANCH_POOL } from "../lib/stargazer/cognitiveFitQuestions";
import { getCrossAxisRulePairs } from "../lib/stargazer/contradictionDetector";
import {
  getInsightRuleAxes,
  getFallbackTextAxes,
} from "../lib/stargazer/alterInsightCardBuilder";
import {
  scanAllAxes,
  summarizeHealth,
  type HealthCheckDataSources,
} from "../lib/stargazer/axisHealthCheck";
import type { TraitAxisKey } from "../lib/stargazer/traitAxes";

// ─── questionCountMap 構築 ──────────────────────────────────
// questions.ts（Core 51 問）+ cognitiveFitQuestions.ts（CF 8 + Branch 6 = 14 問）を合算

function buildQuestionCountMap(): Map<TraitAxisKey, number> {
  const map = new Map<TraitAxisKey, number>();

  // Core questions (questions.ts)
  for (const q of QUESTIONS) {
    for (const axis of q.axes) {
      map.set(axis.key, (map.get(axis.key) ?? 0) + 1);
    }
  }

  // CognitiveFit questions (cognitiveFitQuestions.ts)
  for (const cfQ of [...CF_QUESTIONS, ...CF_BRANCH_POOL]) {
    // CF 質問は options[].weights[].axis 経由で軸を参照する
    const axesInQuestion = new Set<string>();
    for (const opt of cfQ.options) {
      for (const w of opt.weights) {
        axesInQuestion.add(w.axis);
      }
    }
    for (const axis of axesInQuestion) {
      map.set(axis as TraitAxisKey, (map.get(axis as TraitAxisKey) ?? 0) + 1);
    }
  }

  return map;
}

// ─── DataSources 構築 ──────────────────────────────────────

function buildDataSources(): HealthCheckDataSources {
  return {
    questionCountMap: buildQuestionCountMap(),
    contradictionAxes: getCrossAxisRulePairs(),
    insightRuleAxes: getInsightRuleAxes(),
    fallbackTextAxes: getFallbackTextAxes(),
  };
}

// ─── Main ──────────────────────────────────────────────────

function main() {
  const sources = buildDataSources();
  const reports = scanAllAxes(sources);
  const summary = summarizeHealth(reports);

  const output = {
    generated_at: new Date().toISOString(),
    summary,
    axes: reports.map((r) => ({
      axisId: r.axisId,
      domain: r.domain,
      tier: r.tier,
      status: r.status,
      statusReason: r.statusReason,
      structural: r.structural
        ? {
            questionCount: r.structural.questionCount,
            contradictionRuleCount: r.structural.contradictionRuleCount,
            insightRuleCount: r.structural.insightRuleCount,
            hasFallbackText: r.structural.hasFallbackText,
            hasCausalAffinity: r.structural.hasCausalAffinity,
            hasContextReelTemplate: r.structural.hasContextReelTemplate,
            structuralScore: r.structural.structuralScore,
          }
        : null,
      coverage: r.coverage
        ? {
            observation: r.coverage.observation,
            contradiction: r.coverage.contradiction,
            insight: r.coverage.insight,
            fallback: r.coverage.fallback,
            causalAffinity: r.coverage.causalAffinity,
            connectedLayers: r.coverage.connectedLayers,
          }
        : null,
      ...(r.forwardTo ? { forwardTo: r.forwardTo } : {}),
      ...(r.frozenAt ? { frozenAt: r.frozenAt } : {}),
    })),
  };

  // ghost 軸を警告出力
  const ghosts = reports.filter((r) => r.status === "ghost");
  if (ghosts.length > 0) {
    console.error(
      `⚠️  Ghost axes (${ghosts.length}): ${ghosts.map((g) => g.axisId).join(", ")}`,
    );
  }

  // weak 軸を警告出力
  const weaks = reports.filter((r) => r.status === "weak");
  if (weaks.length > 0) {
    console.error(
      `⚠️  Weak axes (${weaks.length}): ${weaks.map((w) => w.axisId).join(", ")}`,
    );
  }

  console.error(
    `✅ Health Check: ${summary.healthy} healthy / ${summary.weak} weak / ${summary.ghost} ghost / ${summary.frozen} frozen (${summary.total} total)`,
  );
  console.error(
    `   Structural connection rate: ${(summary.structuralConnectionRate * 100).toFixed(1)}%`,
  );

  // P3-2: レイヤー別カバレッジ
  const layers = summary.coverageByLayer;
  console.error(
    `   Coverage: observation ${(layers.observation.rate * 100).toFixed(0)}%` +
    ` | contradiction ${(layers.contradiction.rate * 100).toFixed(0)}%` +
    ` | insight ${(layers.insight.rate * 100).toFixed(0)}%` +
    ` | fallback ${(layers.fallback.rate * 100).toFixed(0)}%` +
    ` | causalAffinity ${(layers.causalAffinity.rate * 100).toFixed(0)}%`,
  );

  // JSON を stdout に出力（CI artifact 用）
  console.log(JSON.stringify(output, null, 2));
}

main();
