// lib/genome/filterByVisibility.ts
// PersonaGenome を公開レベルに応じてフィルタリング + cardFront/cardBack 生成

import type { PersonaGenome, GenomeVisualizationData } from "@/lib/aneurasync/personaGenome";
import type { GenomeCardData, VisibilityLevel } from "./cardTypes";
import { getArchetypeDef } from "./archetypeThemes";
import { generatePersonalInsights } from "./dimensionTensions";

/** cardFront/cardBack 生成用の追加データ */
export interface CardExtras {
  /** Stargazer観測データから抽出した最新の関心事 */
  latestCuriosity?: string | null;
  /** 最終観測日時 */
  lastObservedAt?: string | null;
  /** personality_dimensions から変換した5軸データ */
  radarAxes?: {
    analytical: number;
    cautious: number;
    social: number;
    expressive: number;
    independent: number;
  } | null;
  /** AI生成のトーク提案（viewer context） */
  talkSuggestion?: string | null;
  /** ジャーニー統計 */
  journeyStats?: {
    totalObservations: number;
    currentStreak: number;
    bestStreak: number;
    dimensionsCovered: number;
    stability: number;
    firstObservedAt: string | null;
  } | null;
}

/**
 * PersonaGenome + Visualization を公開レベルに応じて GenomeCardData に変換
 * cardFront/cardBack も生成する
 */
export function filterGenomeByVisibility(
  userId: string,
  displayName: string | null,
  avatarUrl: string | null,
  genome: PersonaGenome,
  visualization: GenomeVisualizationData,
  level: VisibilityLevel,
  extras?: CardExtras,
): GenomeCardData {
  const rawLabel = genome.personality.archetypeLabel ?? visualization.overallLabel ?? null;
  const rawCode = genome.personality.archetypeCode ?? null;
  const archetypeDef = getArchetypeDef(rawLabel) ?? getArchetypeDef(rawCode);
  // archetypeDefが見つかったらdefのnameを使う（DBのカタカナ名ではなく正規名）
  const archetypeLabel = archetypeDef?.name ?? rawLabel;

  // ── cardFront 生成 ──
  const cardFront: GenomeCardData["cardFront"] = {
    coreValue: archetypeDef?.motto ?? archetypeDef?.tagline ?? null,
    dilemma: archetypeDef?.innerContradiction ?? null,
    currentCuriosity: extras?.latestCuriosity ?? null,
    lastObservedAt: extras?.lastObservedAt ?? null,
    secretDesire: archetypeDef?.secretDesire ?? null,
    childhoodScene: archetypeDef?.childhoodScene ?? null,
  };

  // ── cardBack 生成 ──
  const bodyTraitParts: string[] = [];
  if (genome.physical.pcSeason4) bodyTraitParts.push(genome.physical.pcSeason4);
  if (genome.physical.bodyBase) bodyTraitParts.push(genome.physical.bodyBase);
  if (genome.physical.faceShape) bodyTraitParts.push(`${genome.physical.faceShape}型`);
  // face_phenotype の印象追加（スコア→テキスト変換）
  const impressionText = deriveFaceImpressionText(genome);
  if (impressionText) bodyTraitParts.push(`印象: ${impressionText}`);

  const cardBack: GenomeCardData["cardBack"] = {
    bodyTraits: bodyTraitParts.length > 0 ? bodyTraitParts.join(" / ") : null,
    radarAxes: extras?.radarAxes ?? buildRadarFromDimensions(genome),
    talkSuggestion: extras?.talkSuggestion ?? null,
    lovePattern: archetypeDef?.lovePattern ?? null,
    midnightThought: archetypeDef?.midnightThought ?? null,
    strengths: archetypeDef?.strengths ?? null,
    blindSpot: archetypeDef?.blindSpots?.[0] ?? null,
    stressResponse: archetypeDef?.stressState ?? null,
    quote: archetypeDef?.quote ?? null,
  };

  // ── パーソナル洞察（次元矛盾から動的生成）──
  const dimScores: Record<string, number> = {};
  for (const d of genome.personality.topDimensions) {
    dimScores[d.id] = d.score;
  }
  const personalInsightsRaw = generatePersonalInsights(dimScores);
  const personalInsights = personalInsightsRaw.length > 0
    ? personalInsightsRaw.map((i) => ({ insight: i.insight, question: i.question }))
    : null;

  // ── ジャーニー統計 ──
  const js = extras?.journeyStats;
  const totalObs = js?.totalObservations ?? 0;
  const cardLevel = totalObs >= 100 ? 4 : totalObs >= 30 ? 3 : totalObs >= 10 ? 2 : 1;
  const cardLevelLabels = ["", "表層", "パターン", "深層", "予測"] as const;
  const daysSinceFirst = js?.firstObservedAt
    ? Math.floor((Date.now() - new Date(js.firstObservedAt).getTime()) / 86400000)
    : 0;
  const journeyStats: GenomeCardData["journeyStats"] = js ? {
    totalObservations: totalObs,
    currentStreak: js.currentStreak,
    bestStreak: js.bestStreak,
    dimensionsCovered: js.dimensionsCovered,
    stability: Math.round(js.stability * 100),
    cardLevel,
    cardLevelLabel: cardLevelLabels[cardLevel],
    daysSinceFirst,
  } : null;

  // ── Lv1: 基本情報 ──
  const base: GenomeCardData = {
    userId,
    displayName,
    avatarUrl,
    archetypeLabel,
    summaryLine: visualization.overallDescription ?? null,
    completeness: Math.round(genome.completeness),
    personalInsights: null,  // Lv2で開示
    journeyStats,
    layerCompleteness: null,
    topTraits: null,
    pcSeason: null,
    topStyleLanes: null,
    genome: null,
    visualization: null,
    // カード面: Lv1でも coreValue は見せる（最低限の自己紹介）
    cardFront: {
      coreValue: cardFront.coreValue,
      dilemma: null,
      currentCuriosity: null,
      lastObservedAt: cardFront.lastObservedAt,
      secretDesire: null,
      childhoodScene: null,
    },
    cardBack: null,
  };

  if (level < 2) return base;

  // ── Lv2: レーダー + 特性 + cardBack の radarAxes ──
  base.layerCompleteness = {
    physical: Math.round(genome.layerCompleteness.physical),
    personality: Math.round(genome.layerCompleteness.personality),
    behavioral: Math.round(genome.layerCompleteness.behavioral),
    social: Math.round(genome.layerCompleteness.social),
  };
  base.topTraits = genome.personality.topDimensions.slice(0, 5).map((d) => ({
    id: d.id,
    label: d.label,
    score: Math.round(d.score * 100),
  }));
  base.pcSeason = genome.physical.pcSeason4;
  base.topStyleLanes = genome.behavioral.taste30d?.laneTop3 ??
    genome.behavioral.taste7d?.laneTop3 ?? null;

  // Lv2: dilemma + currentCuriosity + strengths + quote + personalInsights 開示
  base.personalInsights = personalInsights;
  base.cardFront = {
    ...cardFront,
    secretDesire: null,     // Lv3で開示
    childhoodScene: null,   // Lv3で開示
  };
  base.cardBack = {
    bodyTraits: cardBack.bodyTraits,
    radarAxes: cardBack.radarAxes,
    talkSuggestion: null,       // Lv3で開示
    lovePattern: null,          // Lv3で開示
    midnightThought: null,      // Lv3で開示
    strengths: cardBack.strengths,
    blindSpot: null,            // Lv3で開示
    stressResponse: null,       // Lv3で開示
    quote: cardBack.quote,
  };

  if (level < 3) return base;

  // ── Lv3: 全詳細 ──
  base.genome = genome;
  base.visualization = visualization;
  base.cardFront = cardFront;
  base.cardBack = cardBack;

  return base;
}

/**
 * faceImpression スコアから人間的な印象テキストを導出
 */
function deriveFaceImpressionText(genome: PersonaGenome): string | null {
  const fi = genome.physical.faceImpression;
  if (!fi) return null;
  const traits: string[] = [];
  // 最も強い2特徴を抽出
  const axes: { label: string; value: number }[] = [
    { label: fi.warm_cool > 0 ? "あたたかい" : "クール", value: Math.abs(fi.warm_cool) },
    { label: fi.soft_sharp > 0 ? "やわらかい" : "シャープ", value: Math.abs(fi.soft_sharp) },
    { label: fi.mature_youthful > 0 ? "大人っぽい" : "若々しい", value: Math.abs(fi.mature_youthful) },
    { label: fi.cute_cool > 0 ? "キュート" : "クールビューティ", value: Math.abs(fi.cute_cool) },
    { label: fi.friendly_mysterious > 0 ? "親しみやすい" : "ミステリアス", value: Math.abs(fi.friendly_mysterious) },
  ];
  axes.sort((a, b) => b.value - a.value);
  for (const ax of axes.slice(0, 2)) {
    if (ax.value > 0.2) traits.push(ax.label);
  }
  return traits.length > 0 ? traits.join("で") : null;
}

/**
 * personality_dimensions の15軸から5軸レーダーを導出
 */
function buildRadarFromDimensions(genome: PersonaGenome): {
  analytical: number; cautious: number; social: number; expressive: number; independent: number;
} | null {
  const dims = genome.personality.topDimensions;
  if (dims.length === 0) return null;

  const findDim = (id: string): number => {
    const d = dims.find((dim) => dim.id === id);
    return d ? Math.round(d.score * 100) : 50;
  };

  return {
    analytical: findDim("analytical_vs_intuitive"),
    cautious: findDim("cautious_vs_bold"),
    social: 100 - findDim("introvert_vs_extrovert"),  // extrovert方向が高い = social
    expressive: findDim("function_vs_expression"),
    independent: findDim("independence_vs_harmony"),
  };
}
