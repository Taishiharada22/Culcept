// lib/stargazer/weeklyReportGenerator.ts
// Weekly Report Generator — Spotify Wrapped style weekly summary
// 7枚のスライドでユーザーの1週間を物語として振り返る

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export type SlideEmotion =
  | "surprise"
  | "pride"
  | "curiosity"
  | "contemplation"
  | "anticipation";

export interface WeeklyReportSlide {
  id: string;
  type:
    | "opening_impact"
    | "top_axis"
    | "contradiction_highlight"
    | "behavior_pattern"
    | "prediction_review"
    | "growth_trajectory"
    | "next_week_premonition";
  headline: string;
  title: string;
  subtitle?: string;
  mainStat?: string;
  mainStatLabel?: string;
  body: string;
  /** Kept for backward compat — alias of body */
  description: string;
  dataPoint: string;
  emotion: SlideEmotion;
  shareText: string;
  accentColor: string;
  backgroundGradient: string;
  iconEmoji?: string;
  /** Narrative transition text shown before this slide */
  transitionText?: string;
}

export interface WeeklyReport {
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  slides: WeeklyReportSlide[];
  shareableText: string;
  narrativeArc: string;
  generatedAt: number;
}

// ── Palette (7 slides) ──

const SLIDE_PALETTE = [
  {
    accent: "#8B5CF6",
    gradient:
      "linear-gradient(135deg, #0F0B1E 0%, #1E1240 40%, #2D1B69 100%)",
  },
  {
    accent: "#06B6D4",
    gradient:
      "linear-gradient(135deg, #0B1628 0%, #0E2A3E 40%, #164E63 100%)",
  },
  {
    accent: "#F59E0B",
    gradient:
      "linear-gradient(135deg, #1A1207 0%, #362A10 40%, #78350F 100%)",
  },
  {
    accent: "#EC4899",
    gradient:
      "linear-gradient(135deg, #1A0A14 0%, #3B1029 40%, #831843 100%)",
  },
  {
    accent: "#3B82F6",
    gradient:
      "linear-gradient(135deg, #0B1229 0%, #172554 40%, #1E3A8A 100%)",
  },
  {
    accent: "#10B981",
    gradient:
      "linear-gradient(135deg, #071210 0%, #0D2B26 40%, #065F46 100%)",
  },
  {
    accent: "#A855F7",
    gradient:
      "linear-gradient(135deg, #14081E 0%, #2E1065 40%, #4C1D95 100%)",
  },
];

// ── Helpers ──

function getISOWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekDateRange(): {
  start: string;
  end: string;
  weekNumber: number;
  year: number;
} {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return {
    start: fmt(monday),
    end: fmt(sunday),
    weekNumber: getISOWeekNumber(now),
    year: now.getFullYear(),
  };
}

function formatDateJP(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function getAxisLabel(axisId: string): string {
  const axis = TRAIT_AXES.find((a) => a.id === axisId);
  if (!axis) return axisId;
  return `${axis.labelLeft} vs ${axis.labelRight}`;
}

function getAxisShortLabel(axisId: string): string {
  const axis = TRAIT_AXES.find((a) => a.id === axisId);
  if (!axis) return axisId;
  return axis.labelRight;
}

function getAxisLeftLabel(axisId: string): string {
  const axis = TRAIT_AXES.find((a) => a.id === axisId);
  if (!axis) return axisId;
  return axis.labelLeft;
}

// ── Input types ──

export interface WeeklyObservationDetail {
  /** ISO date string for the observation */
  date: string;
  /** Which axes were affected */
  axisChanges?: Record<string, number>;
  /** Day of week 0=Sun..6=Sat */
  dayOfWeek: number;
}

export interface ContradictionDetail {
  axisA: string;
  axisB: string;
  description?: string;
}

export interface PredictionDetail {
  content: string;
  wasCorrect: boolean;
  relatedAxis?: string;
}

export interface WeeklyReportInput {
  axisScores: Record<string, number>;
  previousWeekScores?: Record<string, number>;
  twoWeeksAgoScores?: Record<string, number>;
  observationCount: number;
  weeklyObservationCount: number;
  contradictionCount: number;
  contradictions?: ContradictionDetail[];
  predictionAccuracy?: number;
  predictions?: PredictionDetail[];
  observations?: WeeklyObservationDetail[];
  topInsight?: string;
  streakDays: number;
  /** Total weeks since user started */
  totalWeeks?: number;
  /** 今週の夢のハイライト（オプション） */
  dreamHighlight?: { archetype: string; frequency: number };
  /** 今週のライフイベント数 */
  lifeEventCount?: number;
  /** Hexaflex変化（オプション） */
  hexaflexWeakest?: string;
}

// ── Main Generator ──

export function generateWeeklyReport(params: WeeklyReportInput): WeeklyReport {
  const {
    axisScores,
    previousWeekScores,
    twoWeeksAgoScores,
    observationCount,
    weeklyObservationCount,
    contradictionCount,
    contradictions,
    predictionAccuracy,
    predictions,
    observations,
    topInsight,
    streakDays,
    totalWeeks,
    dreamHighlight,
    lifeEventCount,
    hexaflexWeakest,
  } = params;

  const { start, end, weekNumber, year } = getWeekDateRange();
  const slides: WeeklyReportSlide[] = [];

  // ── Compute derived data ──

  // Find top axis change
  let topAxisId = "";
  let topAxisDelta = 0;
  if (previousWeekScores && Object.keys(previousWeekScores).length > 0) {
    for (const [key, current] of Object.entries(axisScores)) {
      const prev = previousWeekScores[key];
      if (prev !== undefined) {
        const delta = Math.abs(current - prev);
        if (delta > Math.abs(topAxisDelta)) {
          topAxisDelta = current - prev;
          topAxisId = key;
        }
      }
    }
  }
  if (!topAxisId && Object.keys(axisScores).length > 0) {
    const entries = Object.entries(axisScores);
    entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    topAxisId = entries[0][0];
    topAxisDelta = entries[0][1];
  }

  // Find behavioral pattern from observations
  const dayBuckets: Record<number, number> = {};
  if (observations && observations.length > 0) {
    for (const obs of observations) {
      dayBuckets[obs.dayOfWeek] = (dayBuckets[obs.dayOfWeek] || 0) + 1;
    }
  }
  const dayNames = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];
  const sortedDays = Object.entries(dayBuckets).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  );
  const mostActiveDay =
    sortedDays.length > 0 ? dayNames[Number(sortedDays[0][0])] : null;
  const leastActiveDay =
    sortedDays.length > 1
      ? dayNames[Number(sortedDays[sortedDays.length - 1][0])]
      : null;

  // Find best prediction
  const bestPrediction = predictions?.find((p) => p.wasCorrect);
  const accuracy = predictionAccuracy ?? 0;
  const accuracyDisplay = accuracy > 0 ? `${Math.round(accuracy)}%` : "--";

  // Find most interesting contradiction
  const mainContradiction =
    contradictions && contradictions.length > 0 ? contradictions[0] : null;

  // 2-week comparison
  const hasTwoWeekData =
    twoWeeksAgoScores && Object.keys(twoWeeksAgoScores).length > 0;

  const direction = topAxisDelta >= 0 ? "\u2191" : "\u2193";
  const directionLabel = topAxisDelta >= 0 ? "増加" : "減少";
  const deltaPercent = Math.abs(Math.round(topAxisDelta * 100));

  // Indecisive count estimate (observations with small axis changes)
  const indecisiveCount =
    observations?.filter((o) => {
      if (!o.axisChanges) return false;
      const changes = Object.values(o.axisChanges);
      return (
        changes.length > 1 &&
        changes.some((c) => Math.abs(c) < 0.05)
      );
    }).length ?? Math.max(0, Math.floor(weeklyObservationCount * 0.3));

  // ── Slide 1: Opening Impact ──
  const dramaticStat =
    weeklyObservationCount > 0
      ? indecisiveCount > 0
        ? `${weeklyObservationCount}回の判断、${indecisiveCount}回の迷い`
        : `${weeklyObservationCount}回の観測を記録`
      : "観測ゼロの週。沈黙にも座標はある";

  slides.push({
    id: "opening_impact",
    type: "opening_impact",
    headline: "今週のあなた",
    title: `Week ${weekNumber}`,
    subtitle: `${formatDateJP(start)} - ${formatDateJP(end)}`,
    mainStat: String(weeklyObservationCount),
    mainStatLabel: dramaticStat,
    body:
      weeklyObservationCount === 0
        ? "何も選ばなかった週。だが「選ばなかった」という事実そのものが、一つの判断だ。"
        : weeklyObservationCount <= 3
          ? `${weeklyObservationCount}回。少ないが、そこに現れたパターンは濃い。`
          : `${weeklyObservationCount}回の判断の中に、本人がまだ気づいていない法則がある。`,
    description:
      weeklyObservationCount === 0
        ? "何も選ばなかった週。だが「選ばなかった」という事実そのものが、一つの判断だ。"
        : `${weeklyObservationCount}回の判断の中に、本人がまだ気づいていない法則がある。`,
    dataPoint: `観測数: ${weeklyObservationCount} / 累計: ${observationCount}`,
    emotion: "surprise",
    shareText: `深層観測 ${totalWeeks ?? weekNumber}週目の観測記録: ${dramaticStat}。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[0].accent,
    backgroundGradient: SLIDE_PALETTE[0].gradient,
    iconEmoji: weeklyObservationCount === 0 ? "\u{1F30C}" : "\u{1F525}",
  });

  // ── Slide 2: Top Axis Change ──
  const axisWhyText = previousWeekScores
    ? `先週の「${getAxisLeftLabel(topAxisId)}」寄りから、「${getAxisShortLabel(topAxisId)}」方向へ${deltaPercent}%。何がこの移動を引き起こしたか、データはまだ断定しない。`
    : `「${getAxisLabel(topAxisId)}」の軸が最も偏っている。この偏りが無自覚な判断を支配している可能性がある。`;

  slides.push({
    id: "top_axis",
    type: "top_axis",
    headline: "最も揺れた軸",
    title: "今週最も変化した軸",
    subtitle: getAxisLabel(topAxisId),
    mainStat: `${direction} ${deltaPercent}%`,
    mainStatLabel: `${getAxisShortLabel(topAxisId)}が${directionLabel}`,
    body: axisWhyText,
    description: axisWhyText,
    dataPoint: `軸: ${getAxisLabel(topAxisId)} / 変動: ${topAxisDelta >= 0 ? "+" : ""}${Math.round(topAxisDelta * 100)}%`,
    emotion: "curiosity",
    shareText: `今週、私の「${getAxisLabel(topAxisId)}」が${deltaPercent}%動いた。自分の中で何かが変わり始めている。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[1].accent,
    backgroundGradient: SLIDE_PALETTE[1].gradient,
    iconEmoji: "\u{1F30A}",
    transitionText: "最も大きく動いた軸。",
  });

  // ── Slide 3: Contradiction Highlight ──
  let contradictionBody: string;
  let contradictionHeadline: string;
  if (mainContradiction) {
    const aLabel = getAxisShortLabel(mainContradiction.axisA);
    const bLabel = getAxisShortLabel(mainContradiction.axisB);
    contradictionHeadline = "矛盾の検出";
    contradictionBody =
      mainContradiction.description ||
      `「${aLabel}」を求めながら「${bLabel}」も求めている。この矛盾は、あなたにしか生まれない。それだけは確かだ。`;
  } else if (contradictionCount > 0) {
    contradictionHeadline = "矛盾の検出";
    contradictionBody = `${contradictionCount}個の矛盾を検出。矛盾を持たない人間は、まだ自分に出会っていない。`;
  } else {
    contradictionHeadline = "一貫する意志";
    contradictionBody =
      "今週、矛盾は検出されなかった。安定期か、それとも表層しか見えていないか。静かな週ほど、水面下で何かが動いている。";
  }

  slides.push({
    id: "contradiction_highlight",
    type: "contradiction_highlight",
    headline: contradictionHeadline,
    title: "矛盾ハイライト",
    mainStat: String(contradictionCount),
    mainStatLabel:
      contradictionCount > 0 ? "個の矛盾を発見" : "矛盾なし",
    body: contradictionBody,
    description: contradictionBody,
    dataPoint: `矛盾数: ${contradictionCount}${mainContradiction ? ` / 主要: ${getAxisShortLabel(mainContradiction.axisA)} x ${getAxisShortLabel(mainContradiction.axisB)}` : ""}`,
    emotion: "contemplation",
    shareText:
      contradictionCount > 0
        ? `深層観測が検出した矛盾: ${contradictionCount}個。矛盾を持たない人間は、まだ自分に出会っていない。 #深層観測 #Aneurasync`
        : `今週、矛盾なし。安定か、それとも観測の死角か。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[2].accent,
    backgroundGradient: SLIDE_PALETTE[2].gradient,
    iconEmoji: contradictionCount > 0 ? "\u{1F52E}" : "\u{2728}",
    transitionText: "もう一つ、本人が気づいていないデータがある。",
  });

  // ── Slide 4: Behavior Pattern Discovery ──
  let patternBody: string;
  let patternHeadline: string;
  if (mostActiveDay && leastActiveDay && mostActiveDay !== leastActiveDay) {
    patternHeadline = "曜日の二面性";
    patternBody = `${mostActiveDay}と${leastActiveDay}で判断の出方が変わる。${mostActiveDay}は活発、${leastActiveDay}は沈黙。本人は気づいていないが、この周期は一貫している。`;
  } else if (mostActiveDay) {
    patternHeadline = "行動のリズム";
    patternBody = `${mostActiveDay}に判断が集中している。意図的にそうしているのか、無意識か。どちらであれ、パターンは嘘をつかない。`;
  } else {
    patternHeadline = "パターン未検出";
    patternBody =
      "行動パターンの特定にはまだデータが足りない。もう1週間の観測で、輪郭が見え始める。";
  }

  // Enrich with dream & life event data when available
  if (dreamHighlight && dreamHighlight.frequency >= 2) {
    patternBody += `\n夢に「${dreamHighlight.archetype}」の元型が${dreamHighlight.frequency}回。無意識も何かを処理している。`;
  }
  if (lifeEventCount && lifeEventCount > 0) {
    patternBody += `\n今週${lifeEventCount}件のライフイベント。外的事象と内面パターンの相関は、まだ解析中。`;
  }

  slides.push({
    id: "behavior_pattern",
    type: "behavior_pattern",
    headline: patternHeadline,
    title: "行動パターン発見",
    subtitle:
      mostActiveDay && leastActiveDay
        ? `${mostActiveDay} vs ${leastActiveDay}`
        : undefined,
    body: patternBody,
    description: patternBody,
    dataPoint: `最活発: ${mostActiveDay ?? "未特定"} / 最静穏: ${leastActiveDay ?? "未特定"}`,
    emotion: "surprise",
    shareText:
      mostActiveDay && leastActiveDay
        ? `観測事実: ${mostActiveDay}と${leastActiveDay}で判断パターンが変わる。 #深層観測 #Aneurasync`
        : `行動パターン、まだ未検出。観測は続く。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[3].accent,
    backgroundGradient: SLIDE_PALETTE[3].gradient,
    iconEmoji: "\u{1F4CA}",
    transitionText: "数字は嘘をつかない。",
  });

  // ── Slide 5: Prediction Accuracy Review ──
  let predictionBody: string;
  let predictionHeadline: string;
  if (bestPrediction) {
    predictionHeadline = "的中した予測";
    const reasonText = bestPrediction.relatedAxis
      ? `根拠:「${getAxisLabel(bestPrediction.relatedAxis)}」の傾向がこの判断を予測可能にした。`
      : "行動パターンの蓄積がこの予測を可能にした。";
    predictionBody = `「${bestPrediction.content}」――的中。${reasonText}`;
  } else if (accuracy > 0) {
    predictionHeadline = "予測精度";
    predictionBody =
      accuracy >= 70
        ? `的中率${Math.round(accuracy)}%。行動の法則性が高い。裏を返せば、予測を裏切る瞬間が来たとき、それが本当の変化だ。`
        : `的中率${Math.round(accuracy)}%。輪郭が見え始めている段階。予測が外れた箇所にこそ、次の発見がある。`;
  } else {
    predictionHeadline = "予測準備中";
    predictionBody =
      "予測に必要なデータがまだ足りない。観測を重ねれば、行動の法則が浮かび上がる。";
  }

  slides.push({
    id: "prediction_review",
    type: "prediction_review",
    headline: predictionHeadline,
    title: "予測精度レビュー",
    mainStat: accuracyDisplay,
    mainStatLabel: accuracy > 0 ? "的中率" : "データ蓄積中",
    body: predictionBody,
    description: predictionBody,
    dataPoint: `的中率: ${accuracyDisplay}${bestPrediction ? ` / ベスト予測: ${bestPrediction.content.slice(0, 30)}...` : ""}`,
    emotion: "pride",
    shareText:
      accuracy > 0
        ? `深層観測の予測的中率: ${accuracyDisplay}。${totalWeeks ?? weekNumber}週間分の観測データから算出。 #深層観測 #Aneurasync`
        : `深層観測の予測はまだ始まっていない。データが揃うまで、観測は続く。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[4].accent,
    backgroundGradient: SLIDE_PALETTE[4].gradient,
    iconEmoji: "\u{1F3AF}",
    transitionText: "予測と実測の差分。",
  });

  // ── Slide 6: Growth Trajectory ──
  let growthBody: string;
  let growthHeadline: string;
  if (hasTwoWeekData && topAxisId) {
    const twoWeekAgo = twoWeeksAgoScores![topAxisId];
    const current = axisScores[topAxisId];
    if (twoWeekAgo !== undefined) {
      const twoWeekDelta = Math.round((current - twoWeekAgo) * 100);
      const twoWeekDir = twoWeekDelta >= 0 ? "上昇" : "下降";
      growthHeadline = "2週間の軌跡";
      growthBody = `2週間前と比較。「${getAxisLabel(topAxisId)}」は${Math.abs(twoWeekDelta)}%${twoWeekDir}。偶然か、構造的変化か。${streakDays >= 7 ? `${streakDays}日間連続の観測データがある。傾向の信頼度は高い。` : ""}`;
    } else {
      growthHeadline = "観測の蓄積";
      growthBody =
        topInsight ||
        `累計${observationCount}回の観測。データが厚くなるほど、偶然とパターンの区別がつくようになる。`;
    }
  } else {
    growthHeadline = "観測初期";
    growthBody =
      topInsight ||
      (streakDays >= 7
        ? `${streakDays}日連続の観測データあり。2週間分が揃えば、変化の方向が見える。`
        : weeklyObservationCount >= 5
          ? "観測量は十分。来週のデータと突き合わせれば、パターンの精度が上がる。"
          : "データが少ない。週に数回の観測で、判断の傾向が浮かび上がり始める。");
  }

  // Enrich growth trajectory with hexaflex insight
  if (hexaflexWeakest) {
    growthBody += `\n心理的柔軟性の観点で「${hexaflexWeakest}」のスコアが最も低い。次の変化はここから起きる可能性がある。`;
  }

  slides.push({
    id: "growth_trajectory",
    type: "growth_trajectory",
    headline: growthHeadline,
    title: "成長の軌跡",
    subtitle: streakDays > 0 ? `${streakDays}日連続観測中` : undefined,
    mainStat: String(observationCount),
    mainStatLabel: "累計観測数",
    body: growthBody,
    description: growthBody,
    dataPoint: `累計: ${observationCount}観測 / 連続: ${streakDays}日${hasTwoWeekData ? " / 2週間比較あり" : ""}`,
    emotion: "pride",
    shareText: `深層観測による累計${observationCount}回の観測。${streakDays}日連続で自分と向き合い続けている。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[5].accent,
    backgroundGradient: SLIDE_PALETTE[5].gradient,
    iconEmoji: "\u{1F331}",
    transitionText: "ここまでの軌跡を俯瞰する。",
  });

  // ── Slide 7: Next Week Premonition ──
  // Pick second-most-changed axis or a random important axis for the "tested" axis
  let testedAxis = "";
  if (previousWeekScores) {
    let secondDelta = 0;
    for (const [key, current] of Object.entries(axisScores)) {
      if (key === topAxisId) continue;
      const prev = previousWeekScores[key];
      if (prev !== undefined) {
        const delta = Math.abs(current - prev);
        if (delta > Math.abs(secondDelta)) {
          secondDelta = current - prev;
          testedAxis = key;
        }
      }
    }
  }
  if (!testedAxis) {
    // Fallback: pick axis with score closest to 0 (most ambivalent)
    const entries = Object.entries(axisScores);
    entries.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    if (entries.length > 0) testedAxis = entries[0][0];
  }

  const premonitionBody = testedAxis
    ? `今週のデータから推測すると、来週「${getAxisLabel(testedAxis)}」が試される場面が来る。そのとき何を選ぶかで、アーキタイプの形が変わる。`
    : "来週、あなたは今週の自分を振り返って驚く。観測を続ければ、その理由が見える。";

  slides.push({
    id: "next_week_premonition",
    type: "next_week_premonition",
    headline: "来週の予感",
    title: "来週の予感",
    subtitle: testedAxis
      ? `${getAxisLabel(testedAxis)}が試される`
      : undefined,
    body: premonitionBody,
    description: premonitionBody,
    dataPoint: testedAxis
      ? `注目軸: ${getAxisLabel(testedAxis)}`
      : "注目軸: 未定",
    emotion: "anticipation",
    shareText: testedAxis
      ? `来週、「${getAxisLabel(testedAxis)}」が試される。深層観測の予測。 #深層観測 #Aneurasync`
      : `来週の予測はまだ不確定。データが足りない領域がある。 #深層観測 #Aneurasync`,
    accentColor: SLIDE_PALETTE[6].accent,
    backgroundGradient: SLIDE_PALETTE[6].gradient,
    iconEmoji: "\u{1F52D}",
    transitionText: "そして、来週の予測。",
  });

  // ── Generate narrative arc ──
  const narrativeArc = generateNarrativeArc({
    weekNumber,
    weeklyObservationCount,
    topAxisId,
    topAxisDelta,
    contradictionCount,
    accuracy,
    mostActiveDay,
    leastActiveDay,
    streakDays,
    testedAxis,
    mainContradiction,
    bestPrediction,
  });

  // ── Shareable Text (primary — opening impact slide) ──
  const shareableText = slides[0].shareText;

  return {
    weekNumber,
    year,
    startDate: start,
    endDate: end,
    slides,
    shareableText,
    narrativeArc,
    generatedAt: Date.now(),
  };
}

// ── Generate shareable card text per slide ──

export function generateShareableCard(
  report: WeeklyReport,
  slideIndex: number,
): string {
  const slide = report.slides[slideIndex];
  if (!slide) return report.shareableText;
  return slide.shareText;
}

// ── Narrative Arc Generator ──

interface NarrativeArcInput {
  weekNumber: number;
  weeklyObservationCount: number;
  topAxisId: string;
  topAxisDelta: number;
  contradictionCount: number;
  accuracy: number;
  mostActiveDay: string | null;
  leastActiveDay: string | null;
  streakDays: number;
  testedAxis: string;
  mainContradiction: ContradictionDetail | null | undefined;
  bestPrediction: PredictionDetail | null | undefined;
}

export function generateNarrativeArc(data: NarrativeArcInput): string {
  const parts: string[] = [];

  // Act 1: Surprise — Opening
  parts.push(
    `Week ${data.weekNumber}。観測回数${data.weeklyObservationCount}。`,
  );

  // Act 2: Understanding — Axis change
  if (data.topAxisId) {
    const dir = data.topAxisDelta >= 0 ? "右" : "左";
    parts.push(
      `「${getAxisLabel(data.topAxisId)}」の軸が${dir}に動いた。何かが変わり始めている。`,
    );
  }

  // Act 3: Challenge — Contradiction
  if (data.contradictionCount > 0 && data.mainContradiction) {
    parts.push(
      `同時に矛盾を検出。「${getAxisShortLabel(data.mainContradiction.axisA)}」と「${getAxisShortLabel(data.mainContradiction.axisB)}」が共存している。この組み合わせは珍しい。`,
    );
  } else if (data.contradictionCount > 0) {
    parts.push(
      `${data.contradictionCount}個の矛盾を検出。矛盾を持たない人間は、まだ自分に出会っていない。`,
    );
  }

  // Act 4: Pattern
  if (data.mostActiveDay && data.leastActiveDay) {
    parts.push(
      `${data.mostActiveDay}と${data.leastActiveDay}で判断パターンが異なる。この周期性は無意識のものだ。`,
    );
  }

  // Act 5: Pride — Prediction
  if (data.bestPrediction) {
    parts.push(
      `深層観測の予測「${data.bestPrediction.content}」は的中。行動に法則が見え始めている。`,
    );
  } else if (data.accuracy > 0) {
    parts.push(
      `予測的中率${Math.round(data.accuracy)}%。輪郭が見え始めている。`,
    );
  }

  // Act 6: Continuity — Growth
  if (data.streakDays >= 3) {
    parts.push(
      `${data.streakDays}日連続の観測データあり。データ密度が上がるほど、解像度は上がる。`,
    );
  }

  // Act 7: Anticipation — Next week
  if (data.testedAxis) {
    parts.push(
      `来週、「${getAxisLabel(data.testedAxis)}」が試される場面が来る。そのときの選択が、アーキタイプの次の形を決める。`,
    );
  }

  return parts.join("\n\n");
}

// ── localStorage persistence ──

const WEEKLY_REPORT_KEY = "culcept_sg_weekly_report_v1";

/** Clean up old weekly report viewed keys to prevent localStorage bloat */
function cleanupOldWeeklyReportKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${WEEKLY_REPORT_KEY}_viewed_`)) {
        keysToRemove.push(k);
      }
    }
    // Keep only the 4 most recent viewed keys
    if (keysToRemove.length > 4) {
      keysToRemove.sort();
      keysToRemove.slice(0, keysToRemove.length - 4).forEach((k) => {
        localStorage.removeItem(k);
      });
    }
  } catch { /* silent */ }
}

export function saveWeeklyReport(report: WeeklyReport): void {
  if (typeof window === "undefined") return;
  try {
    cleanupOldWeeklyReportKeys();
    localStorage.setItem(WEEKLY_REPORT_KEY, JSON.stringify(report));
  } catch {
    // Quota exceeded — try removing old report and retry
    try {
      localStorage.removeItem(WEEKLY_REPORT_KEY);
      localStorage.setItem(WEEKLY_REPORT_KEY, JSON.stringify(report));
    } catch { /* give up */ }
  }
}

export function loadWeeklyReport(): WeeklyReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WEEKLY_REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WeeklyReport;
  } catch {
    return null;
  }
}

export function hasUnviewedReport(): boolean {
  const report = loadWeeklyReport();
  if (!report) return false;
  const { weekNumber, year } = getWeekDateRange();
  if (report.weekNumber !== weekNumber || report.year !== year) return false;
  const viewedKey = `${WEEKLY_REPORT_KEY}_viewed_${year}_${weekNumber}`;
  return !localStorage.getItem(viewedKey);
}

export function markReportViewed(weekNumber: number, year: number): void {
  if (typeof window === "undefined") return;
  try {
    cleanupOldWeeklyReportKeys();
    const viewedKey = `${WEEKLY_REPORT_KEY}_viewed_${year}_${weekNumber}`;
    localStorage.setItem(viewedKey, "1");
  } catch { /* silent */ }
}
