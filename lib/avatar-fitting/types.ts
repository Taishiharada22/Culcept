// lib/avatar-fitting/types.ts
// Avatar Fitting Engine - 全型定義

import type { MatchBand } from "@/lib/matchScore/index";
import type { FitScoreResult } from "@/lib/matchScore/fit";
import type { ColorScoreResult, PcAxes, ColorToken } from "@/lib/matchScore/color";
import type { StyleScoreResult, SwipePrefs } from "@/lib/matchScore/style";
import type { DerivedIAm } from "@/lib/profile/deriveIAm";
import type { DimensionScore } from "@/lib/aneurasync/dimensions";

// ─── Gemini 画像解析結果 ───

export type ItemCategory = "tops" | "bottoms" | "outer" | "shoes" | "accessories" | "unknown";

export type ExtractedItemAttributes = {
  category: ItemCategory;
  dominant_colors: ColorToken[];
  style_tags: string[];
  silhouette_tags: string[];
  material_tags: string[];
  estimated_fit: "slim" | "regular" | "relaxed" | "oversized" | null;
  mood_tags: string[];
  raw_response?: string;
};

// ─── 4層データ構造 ───

export type Layer1Data = {
  bodyMeasurements: Record<string, unknown> | null;
  bodyType: string | null;
  bodyType7: string | null;
  cfv: Record<string, number> | null;
  pcSeason: string | null;
  pcAxes: PcAxes | null;
  favoriteColors: string[];
  avoidColors: string[];
  coverage: number;
};

export type Layer2Data = {
  derivedIAm: DerivedIAm | null;
  prefProfile: {
    silhouette?: Record<string, number>;
    material?: Record<string, number>;
    detail?: Record<string, number>;
    pattern?: Record<string, number>;
  } | null;
  styleTags: string[];
  moodKeywords: string[];
  personalityDimensions: DimensionScore[];
  coverage: number;
};

export type Layer3Data = {
  swipePrefs: SwipePrefs | null;
  tasteLayers7d: Record<string, number> | null;
  tasteLayers30d: Record<string, number> | null;
  recentSwipeCount: number;
  coverage: number;
};

export type Layer4Data = {
  totalEvaluations: number;
  avgUserRating: number | null;
  avgSizeSatisfaction: number | null;
  avgVisualSatisfaction: number | null;
  purchaseRate: number | null;
  recentFeedbacks: {
    category: string;
    overall_match: number;
    user_rating: number;
    size_satisfaction: number;
    visual_satisfaction: number;
    purchased: boolean;
  }[];
  coverage: number;
};

export type AllLayerData = {
  l1: Layer1Data;
  l2: Layer2Data;
  l3: Layer3Data;
  l4: Layer4Data;
};

// ─── スコアリング結果 ───

export type SubScoreDetail = {
  score: number;
  reasons: string[];
  adjustedScore: number;
  layerCoverage: number;
};

export type AvatarFittingResult = {
  overallMatch: number;
  band: MatchBand;
  bandReason: string;
  confidence: number;
  sizeScore: SubScoreDetail;
  visualScore: SubScoreDetail;
  colorScore: SubScoreDetail;
  preferenceScore: SubScoreDetail;
  avatarComment: string;
  extractedAttributes: ExtractedItemAttributes;
  layerCoverage: { l1: number; l2: number; l3: number; l4: number };
  weightsUsed: {
    overall: Record<string, number>;
    useCaseWeights: Record<string, Record<string, number>>;
  };
  details: {
    fitResult?: FitScoreResult;
    colorResult?: ColorScoreResult;
    styleResult?: StyleScoreResult;
    iAmCompatibility?: {
      score: number;
      sharedLanes: string[];
      sharedLikes: string[];
      conflicts: string[];
    };
  };
};

// ─── API リクエスト/レスポンス ───

export type ScoreRequest = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  manualCategory?: ItemCategory;
  manualColors?: string[];
};

export type FeedbackRequest = {
  evaluationId: string;
  userRating: number;
  sizeSatisfaction: number;
  visualSatisfaction: number;
  purchased: boolean;
  comment?: string;
};

export type HistoryItem = {
  id: string;
  imageUrl: string | null;
  overallMatch: number;
  band: MatchBand;
  sizeScore: number;
  visualScore: number;
  colorScore: number;
  preferenceScore: number;
  avatarComment: string;
  extractedCategory: string;
  createdAt: string;
  feedback?: {
    userRating: number;
    sizeSatisfaction: number;
    visualSatisfaction: number;
    purchased: boolean;
  };
};
