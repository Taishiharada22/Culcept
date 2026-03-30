// app/stargazer/_utils/mockData.ts
// Mock data for preview mode (?preview=1)
// 15軸 + 12タイプ対応版

import type {
  StarMap,
  PersonalityProfile,
  ResolvedType,
  InsightCardCollection,
  ObservationStats,
} from "@/types/stargazer";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import { resolveTypeFromScores, type ResolvedResult } from "@/lib/stargazer/typeResolver";

// ── 15軸スコア（北極星寄りのプロファイル）──

export const mockAxisScores: Record<TraitAxisKey, number> = {
  // 既存15軸
  introvert_vs_extrovert: -0.45,
  individual_vs_social: -0.55,
  cautious_vs_bold: -0.40,
  analytical_vs_intuitive: -0.35,
  change_embrace_vs_resist: 0.35,
  plan_vs_spontaneous: -0.30,
  tradition_vs_novelty: -0.15,
  independence_vs_harmony: -0.25,
  direct_vs_diplomatic: 0.10,
  stress_isolation_vs_social: -0.40,
  function_vs_expression: -0.20,
  minimal_vs_maximal: -0.30,
  perfectionist_vs_pragmatic: -0.35,
  quality_vs_quantity: -0.45,
  classic_vs_trendy: -0.20,
  // Stage 1 新6軸
  intimacy_pace: -0.30,
  reassurance_need: 0.15,
  emotional_variability: -0.10,
  social_initiative: -0.25,
  boundary_awareness: 0.35,
  relationship_mode_split: 0.35,
  // Stage 2 新12軸
  boundary_respect: 0.40,
  consent_maturity: 0.35,
  pressure_risk: -0.20,
  escalation_risk: 0,
  friend_mode_fit: 0,
  intent_stability: 0,
  rejection_response_maturity: 0.20,
  control_tendency: -0.15,
  exclusivity_pressure: 0,
  long_term_shift_risk: 0,
  public_private_gap: 0.35,
  emotional_regulation: 0.30,
  // Stage 3 追加軸
  attachment_style: 0,
  locus_of_control: 0,
  growth_mindset: 0,
  shame_vs_guilt: 0,
  rumination_tendency: 0,
  fairness_sensitivity: 0,
  // Cognitive Fit 軸
  abstract_structuring: 0,
  decomposition: 0,
  cognitive_updating: 0,
  decision_tempo: 0,
  social_modeling: 0,
  exploration_closure: 0,
};

// ── ResolvedResult（typeResolver で算出したもののモック）──

export const mockResolvedResult: ResolvedResult = resolveTypeFromScores(mockAxisScores);

// ── DimensionDetail（15軸版）──

export interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

export const mockDimensionDetails: DimensionDetail[] = TRAIT_AXES.map(
  (axis) => ({
    id: axis.id,
    score: mockAxisScores[axis.id],
    confidence: mockResolvedResult.axisConfidences[axis.id],
    evidenceCount: Math.round(
      Math.abs(mockAxisScores[axis.id]) * 30 + 5
    ),
    category: axis.category,
    labelLeft: axis.labelLeft,
    labelRight: axis.labelRight,
  })
);

// ── StarMap ──

export const mockStarMap: StarMap = {
  coreStar: {
    archetypeCode: "ACIO",
    archetypeLabel: "観察者",
    archetypeEmoji: "✦",
    confidenceScore: mockResolvedResult.confidence,
    changed: false,
  },
  liveSky: {
    dimensions: mockAxisScores as unknown as Record<string, number>,
  },
  archetypeInfo: {
    emoji: "✦",
    description: "",
    keywords: ["芯がある", "分析的", "慎重"],
  },
};

// ── ResolvedType（既存インターフェース互換）──

export const mockResolvedType: ResolvedType = {
  family: {
    name: "観察者",
    tagline: "",
  },
  orbit: {
    key: "",
    tagline: "",
  },
  label: "観察者",
  display: {
    tagline: "",
  },
  visual: {
    baseColor: "#c9a96e",
    supportColor: "#e2d4b0",
    accentColor: "#b09050",
    gradient: "linear-gradient(135deg, #c9a96e 0%, #e2d4b0 50%, #b09050 100%)",
    glowColor: "rgba(201,169,110,0.25)",
    animationTempo: "slow",
    atmosphereKeywords: [],
    orbitEffect: "subtle-pulse",
  },
  contextFaces: {
    romance: {
      stress_isolation_vs_social: -0.4,
      direct_vs_diplomatic: 0.3,
    },
    work: {
      analytical_vs_intuitive: -0.5,
      perfectionist_vs_pragmatic: -0.4,
    },
    friends: {
      independence_vs_harmony: -0.1,
      individual_vs_social: -0.3,
    },
  },
  axisScores: mockAxisScores as unknown as Record<string, number>,
};

// ── PersonalityProfile（15軸版）──

export const mockPersonalityProfile: PersonalityProfile = {
  userId: "preview-user",
  dimensions: mockAxisScores as unknown as Record<string, number>,
  tags: ["芯がある", "分析的", "慎重"],
  summary:
    "静かな観察者。深い洞察力と繊細な感受性を持つ。表面的なやり取りよりも、本質的な理解を求める傾向がある。",
};

// ── ObservationStats ──

export const mockObservationStats: ObservationStats = {
  totalAnswered: 87,
  avgResponseTimeMs: 3200,
  fastAnswerCount: 42,
  slowAnswerCount: 12,
  avgHesitation: 0.38,
};

// ── InsightCards ──

export const mockInsightCards: InsightCardCollection = {
  cards: [
    {
      id: "insight-1",
      type: "pattern",
      title: "分析と直感の二面性",
      description:
        "論理的分析と直感的判断を状況に応じて切り替える傾向があります。",
      dimension: "analytical_vs_intuitive",
      confidence: 0.7,
    },
    {
      id: "insight-2",
      type: "contradiction",
      title: "独立と調和の文脈依存",
      description:
        "仕事では独立的、友人関係では協調的という文脈差が見られます。",
      dimension: "independence_vs_harmony",
      confidence: 0.5,
    },
    {
      id: "insight-3",
      type: "evolution",
      title: "表現力の成長",
      description:
        "観測初期と比較して、自己表現の傾向がわずかに強まっています。",
      dimension: "function_vs_expression",
      confidence: 0.4,
    },
  ],
  totalInsights: 3,
  topDimensions: ["analytical_vs_intuitive", "individual_vs_social"],
};

// ── Profile Content (v4 MBTI的コンテンツ) ──

import { generateProfileContent, type ProfileContent } from "@/lib/stargazer/profileContentGenerator";
import { aggregateRadarDimensions, type RadarDimension } from "@/lib/stargazer/radarAggregation";
import { deriveTraitCards, detectContextDifferences } from "@/lib/stargazer/traitCards";

// Generate mock profile content using existing data
const _mockTraitCards = deriveTraitCards(mockAxisScores, {}, mockObservationStats.totalAnswered);
const _mockContextScores: Record<string, Partial<Record<TraitAxisKey, number>>> = {
  friends: {
    ...mockAxisScores,
    introvert_vs_extrovert: (mockAxisScores.introvert_vs_extrovert ?? 0) + 0.3,
    direct_vs_diplomatic: (mockAxisScores.direct_vs_diplomatic ?? 0) - 0.3,
  },
  romance: {
    ...mockAxisScores,
    reassurance_need: (mockAxisScores.reassurance_need ?? 0) + 0.4,
    emotional_variability: (mockAxisScores.emotional_variability ?? 0) + 0.3,
  },
  work: {
    ...mockAxisScores,
    social_initiative: (mockAxisScores.social_initiative ?? 0) + 0.3,
    analytical_vs_intuitive: (mockAxisScores.analytical_vs_intuitive ?? 0) - 0.3,
  },
};
const _mockContextDiffs = detectContextDifferences(_mockContextScores);

export const mockProfileContent: ProfileContent | null = generateProfileContent(
  mockAxisScores,
  _mockTraitCards,
  { code: "observer", label: "観察者", description: "", emoji: "✦", traits: {}, keywords: ["芯がある", "分析的", "慎重"], visual: { palette: ["#c9a96e", "#e2d4b0", "#b09050"], impression: ["静謐", "洞察", "本質", "慎重"], role: "観察者", oneLine: "" } },
  _mockContextDiffs,
  _mockContextScores,
  mockObservationStats.totalAnswered
);

export const mockRadarDimensions: RadarDimension[] = aggregateRadarDimensions(mockAxisScores);

// ── Partner Mock Data ──

import type { PartnerProfile } from "@/lib/stargazer/partnerTypes";

export const mockPartners: PartnerProfile[] = [
  { id: "p1", category: "family", nickname: "母", observationCount: 12 },
  { id: "p2", category: "friend", nickname: "Yuki", observationCount: 8 },
  { id: "p3", category: "romantic", nickname: "あの人", observationCount: 5 },
];

// ── Compatibility ──

interface ContextScore {
  overallScore: number;
  subElements: { label: string; score: number; description?: string }[];
  reasons: string[];
  style: string;
}

interface CompatibilityData {
  romance: ContextScore;
  work: ContextScore;
  friends: ContextScore;
}

export const mockCompatibility: CompatibilityData = {
  romance: {
    overallScore: 42,
    subElements: [
      { label: "共感力", score: 15, description: "相手の感情を感じ取る力" },
      { label: "表現力", score: 30, description: "気持ちを伝える自然さ" },
      { label: "柔軟性", score: 40, description: "相手に合わせる適応力" },
      { label: "直感性", score: 40, description: "理屈より感覚で動ける度合い" },
    ],
    reasons: [
      "感情よりも事実や行動で愛情を示す傾向があります",
      "自分の気持ちを自然に表現でき、関係に透明性をもたらします",
      "少数の深い関係を大切にする傾向があります",
    ],
    style: "理性的で安定した関係を好み、言葉より行動で信頼を示すタイプ",
  },
  work: {
    overallScore: 55,
    subElements: [
      { label: "分析力", score: 60, description: "論理的に物事を整理する力" },
      { label: "協調性", score: 40, description: "チームで動く適性" },
      { label: "発展力", score: 55, description: "新しい視点を取り入れる力" },
      { label: "発信力", score: 30, description: "意見を適切に伝える力" },
    ],
    reasons: [
      "論理的な分析力があり、複雑な課題を整理する力があります",
      "独立して深く考える力があり、個人の専門性を活かした貢献が得意です",
      "新しいアイデアを受け入れる柔軟性があり、変化に適応しやすい傾向です",
    ],
    style: "深い専門性と論理的思考で、本質的な課題解決に貢献するタイプ",
  },
  friends: {
    overallScore: 48,
    subElements: [
      { label: "受容力", score: 40, description: "他者を受け入れる懐の深さ" },
      { label: "共感力", score: 15, description: "友人の気持ちに寄り添う力" },
      { label: "好奇心", score: 55, description: "新しい体験を共有する意欲" },
      { label: "自己開示", score: 30, description: "自分を自然にさらける度合い" },
    ],
    reasons: [
      "少数の深い関係を大切にする傾向があります",
      "新しい体験を共有することを楽しみ、友人関係に刺激をもたらします",
    ],
    style: "独立性を保ちながらも、信頼できる人とは深く繋がるタイプ",
  },
};
