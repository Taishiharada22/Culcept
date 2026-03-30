/**
 * Observation Gap Engine — 未観測領域の検出 + 次の探索推薦
 * AI不要。OriginV7Save → ExplorationRecommendation の純関数。
 */

import type { OriginV7Save, LifePeriod, ExplorationAxis } from "./types";
import type { BehavioralLawsResult } from "./behavioralLaws";
import type { EchoTimelineResult } from "./echoTimeline";
import { getPeriodLabel } from "./periods";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type GapType =
  | "unobserved_period"
  | "shallow_period"
  | "missing_era"
  | "missing_activity"
  | "no_turning_point"
  | "no_analytical_frame"
  | "no_residue"
  | "contradiction_unresolved"
  | "echo_unexplored"
  | "no_current_position";

export type ObservationGap = {
  type: GapType;
  period?: LifePeriod;
  description: string;
  priority: "high" | "medium" | "low";
  suggestedAction: string;
  suggestedAxis?: ExplorationAxis;
};

export type ExplorationRecommendation = {
  title: string;
  gaps: ObservationGap[];
  overallCoverage: number;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period list (inline to avoid import issues with const assertion)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ALL_PERIODS: LifePeriod[] = [
  "early_childhood", "elementary", "middle_school", "high_school",
  "late_teens", "early_twenties", "mid_twenties", "thirties",
  "forties_plus",
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メイン導出関数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveObservationGaps(
  save: OriginV7Save,
  laws?: BehavioralLawsResult,
  echoTimeline?: EchoTimelineResult,
): ExplorationRecommendation {
  const gaps: ObservationGap[] = [];

  const chapterPeriods = new Set(save.chapters.map((c) => c.fact.period));
  const eraPeriods = new Set((save.eraAffiliations ?? []).map((e) => e.period));
  const activityPeriods = new Set((save.activities ?? []).map((a) => a.period));

  // 1. 未探索の時代
  for (const period of ALL_PERIODS) {
    if (!chapterPeriods.has(period)) {
      gaps.push({
        type: "unobserved_period",
        period,
        description: `${getPeriodLabel(period)}がまだ探索されていません`,
        priority: "high",
        suggestedAction: `${getPeriodLabel(period)}の記憶を探索する`,
      });
    }
  }

  // 2. 浅い時代（章はあるが深掘り未実施）
  for (const period of chapterPeriods) {
    const periodChapters = save.chapters.filter((c) => c.fact.period === period);
    const hasDeep = periodChapters.some((c) => c.layers && Object.keys(c.layers).length > 2);
    if (!hasDeep && periodChapters.length > 0) {
      gaps.push({
        type: "shallow_period",
        period,
        description: `${getPeriodLabel(period)}は表面的な探索のみ`,
        priority: "medium",
        suggestedAction: `${getPeriodLabel(period)}の断片を深掘りする`,
        suggestedAxis: "daily_flow",
      });
    }
  }

  // 3. era 未登録の時代（章がある period で）
  for (const period of chapterPeriods) {
    if (!eraPeriods.has(period)) {
      gaps.push({
        type: "missing_era",
        period,
        description: `${getPeriodLabel(period)}の時代骨格が未登録`,
        priority: "medium",
        suggestedAction: `${getPeriodLabel(period)}の学校・所属・役割を記録する`,
      });
    }
  }

  // 4. 活動未登録の時代
  for (const period of chapterPeriods) {
    if (!activityPeriods.has(period)) {
      gaps.push({
        type: "missing_activity",
        period,
        description: `${getPeriodLabel(period)}の活動が未登録`,
        priority: "low",
        suggestedAction: `${getPeriodLabel(period)}での活動を記録する`,
      });
    }
  }

  // 5. 転機未登録
  if ((save.turningPoints ?? []).length === 0 && save.chapters.length >= 2) {
    gaps.push({
      type: "no_turning_point",
      description: "転機がまだ記録されていません",
      priority: "medium",
      suggestedAction: "人生の転機を記録する",
    });
  }

  // 6. 分析フレーム未入力
  const unfilled = [
    ...(save.activities ?? []).filter((a) => !a.analyticalFrame),
    ...(save.turningPoints ?? []).filter((t) => !t.analyticalFrame),
  ];
  if (unfilled.length > 0) {
    gaps.push({
      type: "no_analytical_frame",
      description: `${unfilled.length}件の活動/転機の分析が未入力`,
      priority: "low",
      suggestedAction: "活動・転機の分析フレームを記入する",
    });
  }

  // 7. 残留ボード空
  if ((save.residueBoard ?? []).length === 0 && save.chapters.length >= 1) {
    gaps.push({
      type: "no_residue",
      description: "「今に残るもの」がまだ記録されていません",
      priority: "medium",
      suggestedAction: "行動パターン・対人の癖・武器・傷を記録する",
    });
  }

  // 8. 現在地未入力
  if (!save.currentPosition) {
    gaps.push({
      type: "no_current_position",
      description: "現在地点が未入力です",
      priority: "high",
      suggestedAction: "「今の自分」を記録する",
    });
  }

  // 9. 矛盾が検出されたが未深掘り
  if (laws && laws.contradictions.length > 0) {
    gaps.push({
      type: "contradiction_unresolved",
      description: `${laws.contradictions.length}つの内的矛盾が検出されています`,
      priority: "low",
      suggestedAction: "矛盾の背景を探索する",
      suggestedAxis: "unspoken",
    });
  }

  // 10. lost echoes
  if (echoTimeline && echoTimeline.lostEchoes.length > 0) {
    gaps.push({
      type: "echo_unexplored",
      description: `「${echoTimeline.lostEchoes[0]}」など${echoTimeline.lostEchoes.length}個の残響が失われています`,
      priority: "low",
      suggestedAction: "失われた残響の背景を探る",
      suggestedAxis: "loss",
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Overall coverage
  const overallCoverage = calculateCoverage(save);

  return {
    title: "次に探るべきこと",
    gaps: gaps.slice(0, 8),
    overallCoverage,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Coverage 計算
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function calculateCoverage(save: OriginV7Save): number {
  // 理想: 9 periods × (chapter + era + activity) + residue + currentPosition + turningPoint
  // = 9 × 3 + 3 = 30 cells
  const idealCells = 30;
  let filled = 0;

  const chapterPeriods = new Set(save.chapters.map((c) => c.fact.period));
  const eraPeriods = new Set((save.eraAffiliations ?? []).map((e) => e.period));
  const activityPeriods = new Set((save.activities ?? []).map((a) => a.period));

  for (const period of ALL_PERIODS) {
    if (chapterPeriods.has(period)) filled++;
    if (eraPeriods.has(period)) filled++;
    if (activityPeriods.has(period)) filled++;
  }

  if ((save.residueBoard ?? []).length > 0) filled++;
  if (save.currentPosition) filled++;
  if ((save.turningPoints ?? []).length > 0) filled++;

  return Math.min(filled / idealCells, 1);
}
