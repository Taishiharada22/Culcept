// lib/stargazer/stressJobCrossRef.ts
// ストレスカスケード × 職種 クロスリファレンス
// この仕事をした場合、ストレスカスケードのどこが崩れやすいかを予測

import type { TraitAxisKey } from "./traitAxes";
import type { StressCascadeResult } from "./stressResponseCascade";
import type { CareerMatch } from "./careerAptitude";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface StressJobInsight {
  jobId: string;
  jobName: string;
  /** この仕事で典型的に負荷がかかる軸 */
  stressAxes: TraitAxisKey[];
  /** ストレスカスケードとの交差点 */
  vulnerablePoint: string;
  /** 具体的な対処法 */
  copingStrategy: string;
  /** リスクレベル (0-1) */
  riskLevel: number;
}

// ── Job Stress Profiles ──
// 各職種で典型的にストレスがかかる軸を定義

const JOB_STRESS_MAP: Record<string, TraitAxisKey[]> = {
  ceo: ["emotional_regulation", "social_initiative", "cautious_vs_bold"],
  manager: ["boundary_awareness", "direct_vs_diplomatic", "emotional_regulation"],
  project_manager: ["plan_vs_spontaneous", "emotional_regulation", "social_initiative"],
  designer: ["perfectionist_vs_pragmatic", "function_vs_expression"],
  writer: ["introvert_vs_extrovert", "perfectionist_vs_pragmatic"],
  content_creator: ["emotional_variability", "social_initiative", "change_embrace_vs_resist"],
  musician_artist: ["emotional_variability", "independence_vs_harmony"],
  researcher: ["introvert_vs_extrovert", "quality_vs_quantity", "perfectionist_vs_pragmatic"],
  data_scientist: ["analytical_vs_intuitive", "introvert_vs_extrovert"],
  strategist: ["direct_vs_diplomatic", "emotional_regulation", "social_initiative"],
  sales: ["rejection_response_maturity", "social_initiative", "emotional_variability"],
  marketing: ["change_embrace_vs_resist", "analytical_vs_intuitive"],
  hr: ["boundary_awareness", "direct_vs_diplomatic", "emotional_regulation"],
  public_relations: ["emotional_regulation", "public_private_gap", "social_initiative"],
  admin: ["change_embrace_vs_resist", "plan_vs_spontaneous"],
  accountant: ["perfectionist_vs_pragmatic", "analytical_vs_intuitive"],
  legal: ["analytical_vs_intuitive", "cautious_vs_bold", "direct_vs_diplomatic"],
  engineer: ["analytical_vs_intuitive", "introvert_vs_extrovert", "perfectionist_vs_pragmatic"],
  product_manager: ["boundary_awareness", "social_initiative", "change_embrace_vs_resist"],
  craftsperson: ["perfectionist_vs_pragmatic", "quality_vs_quantity"],
  teacher: ["boundary_awareness", "emotional_regulation", "social_initiative"],
  counselor: ["boundary_awareness", "emotional_variability", "emotional_regulation"],
  nurse_care: ["emotional_regulation", "boundary_awareness", "emotional_variability"],
  entrepreneur: ["cautious_vs_bold", "emotional_regulation", "stress_isolation_vs_social"],
  freelancer: ["independence_vs_harmony", "stress_isolation_vs_social"],
  investor: ["emotional_variability", "emotional_regulation", "cautious_vs_bold"],
  doctor: ["emotional_regulation", "boundary_awareness", "analytical_vs_intuitive"],
  lawyer: ["direct_vs_diplomatic", "emotional_regulation", "analytical_vs_intuitive"],
  tax_accountant: ["perfectionist_vs_pragmatic", "analytical_vs_intuitive"],
  ux_designer: ["boundary_awareness", "analytical_vs_intuitive", "perfectionist_vs_pragmatic"],
  ai_ml_engineer: ["analytical_vs_intuitive", "introvert_vs_extrovert", "change_embrace_vs_resist"],
  growth_hacker: ["cautious_vs_bold", "change_embrace_vs_resist", "analytical_vs_intuitive"],
  community_manager: ["boundary_awareness", "social_initiative", "emotional_regulation"],
};

// ── Analysis ──

/**
 * 上位キャリアマッチに対して、ストレスカスケードとの交差分析を実行
 */
export function crossReferenceStressAndJobs(
  topMatches: CareerMatch[],
  stressCascade: StressCascadeResult | null,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): StressJobInsight[] {
  if (!stressCascade || stressCascade.cascade.length === 0) return [];

  const vulnerableAxes = stressCascade.cascade.map((step) => step.axis);
  const insights: StressJobInsight[] = [];

  for (const match of topMatches.slice(0, 5)) {
    const jobStressAxes = JOB_STRESS_MAP[match.job.id] ?? [];
    if (jobStressAxes.length === 0) continue;

    // 交差点: この仕事のストレス軸が、ユーザーの脆弱な軸と重なるか
    const overlaps = jobStressAxes.filter((axis) => vulnerableAxes.includes(axis));
    const riskLevel = overlaps.length / Math.max(1, jobStressAxes.length);

    if (overlaps.length === 0) {
      insights.push({
        jobId: match.job.id,
        jobName: match.job.name,
        stressAxes: jobStressAxes,
        vulnerablePoint: "この仕事のストレスポイントとあなたの脆弱な軸は重なっていない。ストレス耐性の面では好相性。",
        copingStrategy: "通常のセルフケアを維持すれば十分。",
        riskLevel: 0.1,
      });
      continue;
    }

    const overlapLabels = overlaps.map((axis) => {
      const def = TRAIT_AXES.find((a) => a.id === axis);
      return def ? `${def.labelLeft}↔${def.labelRight}` : axis;
    });

    const cascadeStep = stressCascade.cascade.find((step) =>
      overlaps.includes(step.axis),
    );

    const vulnerablePoint = `この仕事では「${overlapLabels.join("」「")}」にストレスがかかるが、ここはあなたのストレスカスケードの${cascadeStep?.stage === 1 ? "最初に崩れるポイント" : cascadeStep?.stage === 2 ? "二番目に影響を受けるポイント" : "深層的な脆弱ポイント"}と重なっている。`;

    const copingStrategy = generateCopingStrategy(overlaps, cascadeStep?.stressDirection ?? "amplify");

    insights.push({
      jobId: match.job.id,
      jobName: match.job.name,
      stressAxes: jobStressAxes,
      vulnerablePoint,
      copingStrategy,
      riskLevel,
    });
  }

  return insights;
}

function generateCopingStrategy(
  overlaps: TraitAxisKey[],
  direction: string,
): string {
  if (direction === "freeze") {
    return "この仕事でストレスが溜まると「動けなくなる」パターンに入りやすい。週1回の振り返りで早期に気づく仕組みを作る。身体を動かすことで凍結を解除できる。";
  }
  if (direction === "amplify") {
    return "ストレスが溜まると普段の傾向がさらに極端になる。「いつもより極端だな」と感じたらストレスサイン。意識的に反対側の行動を少しだけ取り入れる。";
  }
  return "ストレス下で普段とは逆の行動が出始める。「自分らしくない」判断をしている時は、一度立ち止まって信頼できる人に相談する。";
}
