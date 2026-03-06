// app/stargazer/_utils/mockData.ts
// Mock data for preview mode (?preview=1)

import type {
  StarMap,
  PersonalityProfile,
  ResolvedType,
  InsightCardCollection,
  ObservationStats,
} from "@/types/stargazer";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

export const mockStarMap: StarMap = {
  coreStar: {
    constellationCode: "LYRA_ALPHA",
    constellationLabel: "静観のリラ",
    constellationEmoji: "🎵",
    confidenceScore: 0.65,
    changed: false,
  },
  liveSky: {
    dimensions: {
      analytical: 0.6,
      expansive: 0.55,
      collaborative: 0.4,
      expressive: 0.3,
      empathic: 0.15,
    },
  },
  constellationInfo: {
    emoji: "🎵",
    description: "繊細で直感的。内なるリズムに忠実に生きる。",
    keywords: ["直感", "繊細", "探究"],
  },
};

export const mockResolvedType: ResolvedType = {
  family: {
    name: "Mirev",
    tagline: "微細な波を感じる者",
  },
  orbit: {
    key: "Core",
    tagline: "揺るがない探究者",
  },
  label: "静観のリラ",
  display: {
    tagline: "静かな深淵に立つ、揺るがない探究者",
  },
  visual: {
    baseColor: "#fbbf24",
    supportColor: "#fde68a",
    accentColor: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fde68a 100%)",
    glowColor: "rgba(251,191,36,0.3)",
    animationTempo: "slow",
    atmosphereKeywords: ["深海", "静寂", "瞑想"],
    orbitEffect: "subtle-pulse",
  },
  contextFaces: {
    romance: { empathic: 0.6, expressive: 0.4 },
    work: { analytical: 0.7, collaborative: 0.5 },
    friends: { expansive: 0.5, collaborative: 0.6 },
  },
};

export const mockPersonalityProfile: PersonalityProfile = {
  userId: "preview-user",
  dimensions: {
    analytical: 0.6,
    expansive: 0.55,
    collaborative: 0.4,
    expressive: 0.3,
    empathic: 0.15,
  },
  tags: ["直感的", "分析的", "内省的"],
  summary: "静かな観察者。深い洞察力と繊細な感受性を持つ。",
};

export const mockDimensionDetails: DimensionDetail[] = [
  { id: "analytical", score: 0.6, confidence: 0.7, evidenceCount: 24, category: "values", labelLeft: "直感的", labelRight: "分析" },
  { id: "expansive", score: 0.55, confidence: 0.65, evidenceCount: 28, category: "decision", labelLeft: "収束", labelRight: "拡散" },
  { id: "collaborative", score: 0.4, confidence: 0.5, evidenceCount: 15, category: "social", labelLeft: "独立", labelRight: "協調" },
  { id: "expressive", score: 0.3, confidence: 0.4, evidenceCount: 6, category: "aesthetic", labelLeft: "内向", labelRight: "表現的" },
  { id: "empathic", score: 0.15, confidence: 0.45, evidenceCount: 8, category: "emotional", labelLeft: "論理", labelRight: "共感" },
];

export const mockObservationStats: ObservationStats = {
  totalAnswered: 87,
  avgResponseTimeMs: 3200,
  fastAnswerCount: 42,
  slowAnswerCount: 12,
  avgHesitation: 0,
};

export const mockInsightCards: InsightCardCollection = {
  cards: [
    {
      id: "insight-1",
      type: "pattern",
      title: "分析と直感の二面性",
      description: "あなたは論理的分析と直感的判断を状況に応じて切り替える傾向があります。",
      dimension: "analytical",
      confidence: 0.7,
    },
    {
      id: "insight-2",
      type: "contradiction",
      title: "協調性の文脈依存",
      description: "仕事では独立的、友人関係では協調的という文脈差が見られます。",
      dimension: "collaborative",
      confidence: 0.5,
    },
  ],
  totalInsights: 2,
  topDimensions: ["analytical", "expansive"],
};
