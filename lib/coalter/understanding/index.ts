/**
 * CoAlter Stage 1 Understand — 公開エントリ
 *
 * `runUnderstanding(bundle)` は ObservationBundle を受け取り、
 * 各 fusion を呼んで TwoPersonLensToday を組み立てる。
 * diagnostics の発火もここで行う（kill switch は diagnostics.ts 側）。
 *
 * [CEO lock 2026-04-20 M0-3 #3] outcome 判定閾値をここで固定:
 *
 *   ┌───────────┬────────────────────────────────────────────────────────────┐
 *   │ outcome   │ 判定ルール                                                  │
 *   ├───────────┼────────────────────────────────────────────────────────────┤
 *   │ failed    │ 両者の source_coverage が全カテゴリ 0                      │
 *   │           │ OR understanding_confidence < 0.20                          │
 *   │           │ → Stage 2 を走らせない判断の根拠                            │
 *   ├───────────┼────────────────────────────────────────────────────────────┤
 *   │ degraded  │ NOT failed AND                                              │
 *   │           │   (understanding_confidence < 0.50                          │
 *   │           │    OR missing_domains.length >= 4)                          │
 *   │           │ → Stage 2 は走らせるが narration を弱める指示を添える       │
 *   ├───────────┼────────────────────────────────────────────────────────────┤
 *   │ success   │ understanding_confidence >= 0.50                            │
 *   │           │ AND missing_domains.length < 4                              │
 *   │           │ AND 両者ではない (failed 条件に該当しない)                  │
 *   └───────────┴────────────────────────────────────────────────────────────┘
 *
 *   ※ 閾値は `tests/unit/coalter/understanding/outcomeThresholds.test.ts` で
 *      境界値を 1 本 1 本固定（変更したら test も同時に直すこと）。
 *
 * [M0 shadow] 既存 runtime 未接続、feat/baseline-edit に merge せず。
 */

import { compareTodayReaders, type TodayReaderComparison } from "./compareTodayReaders";
import { emitUnderstandingDiagnostics, isLLMShadowEnabled } from "./diagnostics";
import { deriveFairnessAdjustment } from "./fairnessAdjustment";
import { fusePersonalLens } from "./personFusion";
import { fuseRelationalLens } from "./relationalFusion";
import { readTodayRuleBased } from "./todayReader";
import type { TodayReaderLLMClient } from "./todayReaderLLM";
import type {
  DataGapSection,
  IsoTimestamp,
  ObservationBundle,
  PersonalLens,
  TodayReaderComparisonDiag,
  TwoPersonLensToday,
  UnderstandingDiagnostics,
  UnderstandingOutcome,
  SourceCoverage,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Thresholds — 表で固定、変更時は outcomeThresholds.test.ts を必ず更新
// ═══════════════════════════════════════════════════════════════════════════

export const OUTCOME_THRESHOLDS = {
  FAILED_CONFIDENCE_FLOOR: 0.2,
  DEGRADED_CONFIDENCE_FLOOR: 0.5,
  DEGRADED_MISSING_DOMAINS_CEIL: 4,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param bundle 既存観測から合成された ObservationBundle
 * @param now 現在時刻の注入（lock #1: 決定論のため caller 責任）
 * @param pairHash 匿名化済みペア識別子（diagnostics 用）
 * @param options.llmClient DI された LLM client。shadow kill switch が ON かつ
 *   client が渡された場合のみ LLM 側を実行する。本流出力は常に rule-based。
 */
export async function runUnderstanding(
  bundle: ObservationBundle,
  now: IsoTimestamp,
  pairHash: string,
  options: { llmClient?: TodayReaderLLMClient } = {},
): Promise<TwoPersonLensToday> {
  const start = nowMillis(now);

  // ── fusion 呼び出し ────────────────────────────────────────────────
  const collectStart = nowMillis(now);
  // 本 M0-3 では collector は caller 側。ここで計るのは fusion phase のみ。
  const collectLatency = Math.max(0, nowMillis(now) - collectStart);

  const fusionStart = nowMillis(now);
  const personalLensA = fusePersonalLens(bundle.personA);
  const personalLensB = fusePersonalLens(bundle.personB);
  const relationalLens = fuseRelationalLens(
    bundle.relationship,
    bundle.personA,
    bundle.personB,
    bundle.conversation,
  );
  const fusionLatency = Math.max(0, nowMillis(now) - fusionStart);

  const todayStart = nowMillis(now);
  // [CEO lock M0-4 #1/#2] 本流は rule-based のまま。LLM 版は shadow 比較専用。
  const todayReading = readTodayRuleBased(bundle);
  const todayLatency = Math.max(0, nowMillis(now) - todayStart);

  const fairnessStart = nowMillis(now);
  const fairnessAdjustment = deriveFairnessAdjustment(
    bundle.relationship,
    bundle.conversation,
  );
  const fairnessLatency = Math.max(0, nowMillis(now) - fairnessStart);

  // ── understanding_confidence / missing_domains ────────────────────
  const understandingConfidence = todayReading.confidence; // todayReader で既に算出
  const dataGaps = computeMissingDomains(bundle);
  const sourceCoverage = computeSourceCoverage(personalLensA, personalLensB);

  // ── outcome 判定 ──────────────────────────────────────────────────
  const outcome = judgeOutcome({
    confidence: understandingConfidence,
    missingDomains: dataGaps,
    sourceCoverage,
  });

  // ── 組み立て ─────────────────────────────────────────────────────
  const lens: TwoPersonLensToday = {
    personalLenses: { a: personalLensA, b: personalLensB },
    relationalLens,
    todayReading,
    fairnessAdjustment,
    understanding_confidence: understandingConfidence,
    dataGaps,
    computedAt: now,
    lensVersion: "1.0.0",
  };

  // ── shadow 比較（M0-4）— kill switch + client 注入時のみ実行 ─────
  let comparisonDiag: TodayReaderComparisonDiag | undefined;
  if (isLLMShadowEnabled()) {
    const comparison = await compareTodayReaders(bundle, now, options.llmClient);
    comparisonDiag = toComparisonDiag(comparison);
  }

  // ── diagnostics emit（kill switch OFF ならここでも no-op） ─────────
  const totalLatency = Math.max(0, nowMillis(now) - start);
  const diagnostics: UnderstandingDiagnostics = {
    outcome,
    lensVersion: "1.0.0",
    understanding_confidence: understandingConfidence,
    completeness: bundle.completeness,
    source_coverage: sourceCoverage,
    latency_ms: {
      total: totalLatency,
      collect: collectLatency,
      fusion: fusionLatency,
      todayReader: todayLatency,
      fairness: fairnessLatency,
    },
    missing_domains: dataGaps,
    computedAt: now,
    pairHash,
    ...(comparisonDiag ? { todayReaderComparison: comparisonDiag } : {}),
  };
  emitUnderstandingDiagnostics(diagnostics);

  return lens;
}

/**
 * [CEO lock M0-4 #5] compare 出力 → diagnostics shape 移送。
 * 追加フィールドが raw string 化しないことを 1 箇所で担保する。
 */
function toComparisonDiag(c: TodayReaderComparison): TodayReaderComparisonDiag {
  return {
    modeAgreement: c.modeAgreement,
    ruleMode: c.ruleMode,
    llmMode: c.llmMode,
    confidenceDelta: c.confidenceDelta,
    ruleConfidence: c.ruleConfidence,
    llmConfidence: c.llmConfidence,
    latencyMs: c.latencyMs,
    latentNeedsDelta: c.latentNeedsDelta,
    llmOutcome: c.llmOutcome,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Outcome 判定 — §11.C 準拠、test 固定
// ═══════════════════════════════════════════════════════════════════════════

export type OutcomeJudgeInput = {
  confidence: number;
  missingDomains: DataGapSection[];
  sourceCoverage: SourceCoverage;
};

export function judgeOutcome(input: OutcomeJudgeInput): UnderstandingOutcome {
  // failed: 両者の source_coverage 全カテゴリ 0 OR confidence < FAILED_FLOOR
  if (isAllZero(input.sourceCoverage)) return "failed";
  if (input.confidence < OUTCOME_THRESHOLDS.FAILED_CONFIDENCE_FLOOR) return "failed";

  // degraded: confidence < DEGRADED_FLOOR OR missing_domains 多い
  if (input.confidence < OUTCOME_THRESHOLDS.DEGRADED_CONFIDENCE_FLOOR) return "degraded";
  if (input.missingDomains.length >= OUTCOME_THRESHOLDS.DEGRADED_MISSING_DOMAINS_CEIL) {
    return "degraded";
  }

  return "success";
}

function isAllZero(sc: SourceCoverage): boolean {
  const sum =
    sc.a.stargazerCount +
    sc.a.alterCount +
    sc.a.behavioralCount +
    sc.b.stargazerCount +
    sc.b.alterCount +
    sc.b.behavioralCount;
  return sum === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Derived helpers
// ═══════════════════════════════════════════════════════════════════════════

function computeSourceCoverage(
  a: PersonalLens,
  b: PersonalLens,
): SourceCoverage {
  return {
    a: {
      stargazerCount: a.sourcedFrom.stargazer.length,
      alterCount: a.sourcedFrom.alter.length,
      behavioralCount: a.sourcedFrom.behavioral.length,
    },
    b: {
      stargazerCount: b.sourcedFrom.stargazer.length,
      alterCount: b.sourcedFrom.alter.length,
      behavioralCount: b.sourcedFrom.behavioral.length,
    },
  };
}

function computeMissingDomains(bundle: ObservationBundle): DataGapSection[] {
  const gaps: DataGapSection[] = [];
  const c = bundle.completeness;

  // person 別: completeness 0 のセクションを missing として列挙。
  if (c.personA.stargazer === 0) gaps.push("personA.stargazer");
  if (c.personA.alter === 0) gaps.push("personA.alter");
  if (c.personA.behavioral === 0) gaps.push("personA.behavioral");
  if (c.personA.context === 0) gaps.push("personA.context");
  if (c.personB.stargazer === 0) gaps.push("personB.stargazer");
  if (c.personB.alter === 0) gaps.push("personB.alter");
  if (c.personB.behavioral === 0) gaps.push("personB.behavioral");
  if (c.personB.context === 0) gaps.push("personB.context");

  // relationship
  if (bundle.relationship.sharedHistory.length === 0) gaps.push("relationship.sharedHistory");
  if (bundle.relationship.fairnessLedger.length === 0) gaps.push("relationship.fairnessLedger");
  if (bundle.relationship.rupturesAndRepairs.length === 0)
    gaps.push("relationship.rupturesAndRepairs");

  // conversation / environmental
  if (bundle.conversation.turns.length === 0) gaps.push("conversation.turns");
  if (c.environmental === 0) gaps.push("environmental");

  return gaps;
}

function nowMillis(now: IsoTimestamp): number {
  // ISO 文字列から ms を取る。決定論を維持するため caller 注入値のみ参照。
  const t = Date.parse(now);
  return Number.isFinite(t) ? t : 0;
}
