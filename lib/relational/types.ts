// ============================================================
// Relational Intelligence Engine — 型定義
// Phase 1: 既存データからの導出による関係性の知性
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CautionCode } from "@/lib/rendezvous/types";

// ── Feature 1: 相手の前での自分 ("With this person...") ──

export interface TraitInfluence {
  axis: TraitAxisKey;
  axisLabel: string;
  selfScore: number;
  counterpartScore: number;
  direction: "amplified" | "suppressed" | "pulled";
  narrative: string;
}

export interface WithThisPersonResult {
  influences: TraitInfluence[];
  summaryNarratives: string[];
}

// ── Feature 2: 化学反応マップ (Style Chemistry Map) ──

export type ChemistryQuadrant =
  | "resonance"
  | "complement"
  | "friction"
  | "unknown";

export interface ChemistryAxisItem {
  axis: TraitAxisKey;
  axisLabel: string;
  quadrant: ChemistryQuadrant;
  selfScore: number;
  counterpartScore: number;
  similarity: number;
  complement: number;
}

export interface StyleChemistryMap {
  resonance: ChemistryAxisItem[];
  complement: ChemistryAxisItem[];
  friction: ChemistryAxisItem[];
  unknown: ChemistryAxisItem[];
  dominantQuadrant: ChemistryQuadrant;
  summary: string;
}

// ── Feature 3: ズレの前向き表示 ──

export interface PositiveFrictionItem {
  cautionCode: CautionCode;
  trait: string;
  cautionText: string;
  positiveFrame: string;
  growthHint: string;
}

// ── Feature 4: 感覚翻訳 (Style Voice) ──

export interface StyleVoice {
  poeticLine: string;
  sensoryLine: string;
  dominantMood: string;
}

// ── Feature 5: 今の自分 vs 本来の自分 ──

export interface SelfGapItem {
  axis: TraitAxisKey;
  axisLabel: string;
  normalScore: number;
  stressedScore: number;
  gap: number;
  interpretation: string;
  framing: "protective" | "adaptive" | "authentic";
}

export interface SelfGapResult {
  items: SelfGapItem[];
  overallNarrative: string;
  mostShiftedAxis: TraitAxisKey | null;
}

// ── Feature 6: 理解しやすい人 ──

export interface MisreadRisk {
  axis: TraitAxisKey;
  axisLabel: string;
  selfScore: number;
  commonMisinterpretation: string;
  correctReading: string;
}

export interface ReadabilityBonus {
  axis: TraitAxisKey;
  axisLabel: string;
  bonusScore: number;
  narrative: string;
}

export interface ReadabilityResult {
  misreadRisks: MisreadRisk[];
  bonuses: ReadabilityBonus[];
  topBonusNarrative: string | null;
}

// ── Rendezvous DetailDTO に追加する統合フィールド ──

export interface RelationalIntelligence {
  withThisPerson: WithThisPersonResult | null;
  chemistryMap: StyleChemistryMap | null;
  positiveFriction: PositiveFrictionItem[];
  styleVoice: StyleVoice | null;
  readabilityBonuses: ReadabilityBonus[];
}
