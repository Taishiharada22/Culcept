/**
 * Axis Health Check — 軸の健全性を自動監査
 *
 * Layer 1: 構造監査（ビルド時/CI実行）
 *   - questions.ts, contradictionDetector.ts, alterInsightCardBuilder.ts を静的走査
 * Layer 2: runtime実効監査（月次、Phase 3で実装）
 *
 * @see docs/design/stargazer-alter-axis-architecture.md §4-C, §5
 */

import { type TraitAxisKey, TRAIT_AXIS_KEYS } from "./traitAxes";
import {
  AXIS_REGISTRY,
  type AxisDomain,
  type AxisRegistryEntry,
  isFrozenAxis,
} from "./axisRegistry";

// ─── Types ─────────────────────────────────────────────────

/** Layer 1: 構造監査（ビルド時/CI実行） */
export interface StructuralHealth {
  /** questions.tsでこの軸にマップされている質問数 */
  questionCount: number;
  /** CROSS_AXIS_RULESでこの軸を参照するルール数 */
  contradictionRuleCount: number;
  /** AXIS_INSIGHT_RULESでこの軸を参照するルール数 */
  insightRuleCount: number;
  /** AXIS_FALLBACK_TEXTSにエントリがあるか */
  hasFallbackText: boolean;
  /** axisRegistryにcausalAffinity 2軸以上があるか */
  hasCausalAffinity: boolean;
  /** axisRegistryにcontextReelTemplateがあるか */
  hasContextReelTemplate: boolean;
  /** 重み付き構造スコア */
  structuralScore: number;
}

/** Layer 2: runtime実効監査（月次。Phase 3で実装予定） */
export interface RuntimeHealth {
  periodStart: string;
  periodEnd: string;
  eligibleUserCount: number;
  contradictionFireCount: number;
  contradictionFireRate: number;
  insightCardSelectedCount: number;
  insightCardDisplayRate: number;
  derivedFactContribution: number;
  derivedFactAdoptionRate: number;
  positiveReactionRate: number;
  sampleSize: number;
  runtimeScore: number;
}

export interface AxisHealthReport {
  axisId: TraitAxisKey;
  domain: AxisDomain;
  tier: "core" | "expansion" | "frozen";
  structural: StructuralHealth | null;  // frozen軸はnull
  runtime: RuntimeHealth | null;        // Phase 3まではnull
  status: "healthy" | "weak" | "ghost" | "frozen";
  statusReason: string;
  forwardTo?: TraitAxisKey;
  frozenAt?: string;
}

// ─── Weights ───────────────────────────────────────────────

const W_QUESTION = 3;
const W_CONTRA = 2;
const W_INSIGHT = 2;
const W_FALLBACK = 1;
const W_CAUSAL = 1;
const W_CTX = 1;

// StructuralScore最大値 = 3*3 + 2*2 + 2*2 + 1 + 1 + 1 = 20

// ─── Domain Minimum Requirements ───────────────────────────

interface DomainRequirement {
  minStructuralScore: number;
  requiredChecks: (s: StructuralHealth) => { pass: boolean; reason: string };
}

const DOMAIN_REQUIREMENTS: Record<AxisDomain, DomainRequirement> = {
  judgment: {
    minStructuralScore: 12,
    requiredChecks: (s) => {
      if (s.questionCount < 3) return { pass: false, reason: "questionCount < 3" };
      if (s.contradictionRuleCount < 1) return { pass: false, reason: "contradictionRuleCount < 1" };
      return { pass: true, reason: "" };
    },
  },
  relational: {
    minStructuralScore: 10,
    requiredChecks: (s) => {
      if (s.questionCount < 2) return { pass: false, reason: "questionCount < 2" };
      if (s.insightRuleCount < 1) return { pass: false, reason: "insightRuleCount < 1" };
      return { pass: true, reason: "" };
    },
  },
  boundary: {
    minStructuralScore: 8,
    requiredChecks: (s) => {
      if (s.questionCount < 2) return { pass: false, reason: "questionCount < 2" };
      if (!s.hasCausalAffinity) return { pass: false, reason: "hasCausalAffinity = false" };
      return { pass: true, reason: "" };
    },
  },
  emotional: {
    minStructuralScore: 12,
    requiredChecks: (s) => {
      if (s.questionCount < 3) return { pass: false, reason: "questionCount < 3" };
      if (s.contradictionRuleCount < 1) return { pass: false, reason: "contradictionRuleCount < 1" };
      if (s.insightRuleCount < 1) return { pass: false, reason: "insightRuleCount < 1" };
      return { pass: true, reason: "" };
    },
  },
  cognitive: {
    minStructuralScore: 10,
    requiredChecks: (s) => {
      if (s.questionCount < 3) return { pass: false, reason: "questionCount < 3" };
      if (s.insightRuleCount < 1) return { pass: false, reason: "insightRuleCount < 1" };
      return { pass: true, reason: "" };
    },
  },
  energy: {
    minStructuralScore: 8,
    requiredChecks: (s) => {
      if (s.questionCount < 2) return { pass: false, reason: "questionCount < 2" };
      if (!s.hasContextReelTemplate) return { pass: false, reason: "hasContextReelTemplate = false" };
      return { pass: true, reason: "" };
    },
  },
  identity: {
    minStructuralScore: 10,
    requiredChecks: (s) => {
      if (s.questionCount < 2) return { pass: false, reason: "questionCount < 2" };
      if (s.contradictionRuleCount < 1) return { pass: false, reason: "contradictionRuleCount < 1" };
      return { pass: true, reason: "" };
    },
  },
  aesthetic: {
    minStructuralScore: 8,
    requiredChecks: (s) => {
      if (s.questionCount < 2) return { pass: false, reason: "questionCount < 2" };
      if (!s.hasContextReelTemplate) return { pass: false, reason: "hasContextReelTemplate = false" };
      return { pass: true, reason: "" };
    },
  },
};

// ─── Data Sources ──────────────────────────────────────────
// 各消費側ファイルから参照データを受け取る型
// （実際のimportはcircular dependencyを避けるため、呼び出し側で注入）

export interface HealthCheckDataSources {
  /** questions.tsから: 軸→質問数マップ */
  questionCountMap: Map<TraitAxisKey, number>;
  /** contradictionDetector.tsから: 各ルールが参照する軸ペアのリスト */
  contradictionAxes: Array<[TraitAxisKey, TraitAxisKey]>;
  /** alterInsightCardBuilder.tsから: 各ルールが参照する軸のリスト */
  insightRuleAxes: TraitAxisKey[][];
  /** alterInsightCardBuilder.tsから: fallbackテキストがある軸 */
  fallbackTextAxes: Set<TraitAxisKey>;
}

// ─── Layer 1: Structural Audit ─────────────────────────────

/**
 * 単一軸の構造監査
 */
function auditStructural(
  axisId: TraitAxisKey,
  entry: AxisRegistryEntry,
  sources: HealthCheckDataSources,
): StructuralHealth {
  const questionCount = sources.questionCountMap.get(axisId) ?? 0;

  const contradictionRuleCount = sources.contradictionAxes.filter(
    ([a, b]) => a === axisId || b === axisId,
  ).length;

  const insightRuleCount = sources.insightRuleAxes.filter(
    (axes) => axes.includes(axisId),
  ).length;

  const hasFallbackText = sources.fallbackTextAxes.has(axisId)
    || (entry.fallbackInsightLeft !== "" && entry.fallbackInsightRight !== "");

  const hasCausalAffinity = entry.causalAffinity.length >= 2;

  const hasContextReelTemplate = entry.contextReelTemplate !== "";

  const structuralScore =
    Math.min(questionCount, 3) * W_QUESTION
    + Math.min(contradictionRuleCount, 2) * W_CONTRA
    + Math.min(insightRuleCount, 2) * W_INSIGHT
    + (hasFallbackText ? 1 : 0) * W_FALLBACK
    + (hasCausalAffinity ? 1 : 0) * W_CAUSAL
    + (hasContextReelTemplate ? 1 : 0) * W_CTX;

  return {
    questionCount,
    contradictionRuleCount,
    insightRuleCount,
    hasFallbackText,
    hasCausalAffinity,
    hasContextReelTemplate,
    structuralScore,
  };
}

/**
 * 全軸の構造監査を実行
 */
export function scanAllAxes(
  sources: HealthCheckDataSources,
): AxisHealthReport[] {
  const reports: AxisHealthReport[] = [];

  for (const axisId of TRAIT_AXIS_KEYS) {
    const entry = AXIS_REGISTRY.get(axisId);
    if (!entry) {
      reports.push({
        axisId,
        domain: "identity", // fallback
        tier: "core",
        structural: null,
        runtime: null,
        status: "ghost",
        statusReason: `axisRegistryに未登録`,
      });
      continue;
    }

    // frozen軸
    if (isFrozenAxis(entry)) {
      reports.push({
        axisId,
        domain: entry.domain,
        tier: "frozen",
        structural: null,
        runtime: null,
        status: "frozen",
        statusReason: entry.frozenReason,
        forwardTo: entry.forwardTo,
        frozenAt: entry.frozenAt,
      });
      continue;
    }

    // 通常軸: 構造監査
    const structural = auditStructural(axisId, entry, sources);
    const domainReq = DOMAIN_REQUIREMENTS[entry.domain];

    let status: AxisHealthReport["status"];
    let statusReason: string;

    if (structural.questionCount === 0) {
      status = "ghost";
      statusReason = "質問数0 — 観測データが取れない";
    } else {
      const reqCheck = domainReq.requiredChecks(structural);
      if (structural.structuralScore < domainReq.minStructuralScore) {
        status = "weak";
        statusReason = `structuralScore ${structural.structuralScore} < domain最低要件 ${domainReq.minStructuralScore}`;
      } else if (!reqCheck.pass) {
        status = "weak";
        statusReason = `必須項目未達: ${reqCheck.reason}`;
      } else {
        // runtime = null (Phase 1): 構造監査のみで判定
        status = "healthy";
        statusReason = `構造監査合格 (score=${structural.structuralScore}, domain=${entry.domain})`;
      }
    }

    reports.push({
      axisId,
      domain: entry.domain,
      tier: entry.tier as "core" | "expansion",
      structural,
      runtime: null, // Phase 3で実装
      status,
      statusReason,
    });
  }

  return reports;
}

// ─── Summary ───────────────────────────────────────────────

export interface HealthSummary {
  total: number;
  healthy: number;
  weak: number;
  ghost: number;
  frozen: number;
  /** 構造接続率: healthy / (total - frozen) */
  structuralConnectionRate: number;
  /** domain別内訳 */
  byDomain: Record<AxisDomain, { total: number; healthy: number; weak: number; ghost: number }>;
}

export function summarizeHealth(reports: AxisHealthReport[]): HealthSummary {
  const summary: HealthSummary = {
    total: reports.length,
    healthy: 0,
    weak: 0,
    ghost: 0,
    frozen: 0,
    structuralConnectionRate: 0,
    byDomain: {} as HealthSummary["byDomain"],
  };

  const domains: AxisDomain[] = [
    "judgment", "relational", "boundary", "emotional",
    "cognitive", "energy", "identity", "aesthetic",
  ];
  for (const d of domains) {
    summary.byDomain[d] = { total: 0, healthy: 0, weak: 0, ghost: 0 };
  }

  for (const r of reports) {
    switch (r.status) {
      case "healthy": summary.healthy++; break;
      case "weak": summary.weak++; break;
      case "ghost": summary.ghost++; break;
      case "frozen": summary.frozen++; break;
    }

    if (r.domain in summary.byDomain) {
      summary.byDomain[r.domain].total++;
      if (r.status === "healthy") summary.byDomain[r.domain].healthy++;
      if (r.status === "weak") summary.byDomain[r.domain].weak++;
      if (r.status === "ghost") summary.byDomain[r.domain].ghost++;
    }
  }

  const nonFrozen = summary.total - summary.frozen;
  summary.structuralConnectionRate = nonFrozen > 0
    ? summary.healthy / nonFrozen
    : 0;

  return summary;
}
