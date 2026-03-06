// types/stargazer.ts
// Stargazer v2 — Personality Observatory types

// ── Core Types ──

export interface CoreStar {
  constellationCode: string;
  constellationLabel: string;
  constellationEmoji?: string;
  confidenceScore: number; // 0-1
  changed?: boolean;
  coreTraits?: Record<string, number>;
}

export interface LiveSky {
  dimensions: Record<string, number>;
  updatedAt?: string;
}

export interface ConstellationInfo {
  emoji: string;
  description: string;
  keywords: string[];
}

export interface StarMap {
  coreStar: CoreStar;
  liveSky?: LiveSky;
  constellationInfo?: ConstellationInfo;
}

// ── Visual Styles ──

export interface ResolvedVisualStyle {
  baseColor: string;      // hex e.g. "#fbbf24"
  supportColor: string;   // hex
  accentColor: string;    // hex
  gradient: string;       // CSS gradient
  glowColor: string;      // rgba string
  animationTempo: "slow" | "medium" | "fast";
  atmosphereKeywords: string[];
  orbitEffect: string;
}

// ── Resolved Type ──

export interface ResolvedFamily {
  name: string;
  tagline?: string;
}

export interface ResolvedOrbit {
  key: string;
  tagline?: string;
}

export interface ResolvedDisplay {
  tagline: string;
}

export interface ContextFaces {
  romance?: Record<string, number>;
  work?: Record<string, number>;
  friends?: Record<string, number>;
}

export interface ResolvedType {
  family?: ResolvedFamily;
  orbit?: ResolvedOrbit;
  label?: string;
  display?: ResolvedDisplay;
  visual?: ResolvedVisualStyle;
  contextFaces?: ContextFaces;
}

// ── Personality Profile ──

export interface PersonalityProfile {
  userId: string;
  dimensions: Record<string, number>;
  tags: string[];
  summary?: string;
  updatedAt?: string;
}

// ── Questions & Answers ──

export interface QuestionOption {
  emoji: string;
  label: string;
}

export interface StargazerQuestion {
  id: string;
  text: string;
  category: string;
  optionA: QuestionOption;
  optionB: QuestionOption;
}

export interface CoreObservationQuestion {
  id: string;
  text: string;
  category?: string;
  optionA?: QuestionOption;
  optionB?: QuestionOption;
}

export interface CoreObservationAnswer {
  questionId: string;
  binaryChoice: "A" | "B";
  binaryTimestamp: string;
  totalResponseTimeMs: number;
}

export interface EnhancedDailyAnswer {
  questionId: string;
  binaryChoice: "A" | "B";
  reasonChipId?: string;
  reasonDimensionHints?: Record<string, number>;
  shownAt: string;
  answeredAt: string;
  responseTimeMs: number;
  confidenceSelfReport: number;
  skipped: boolean;
}

// ── Observation Phase ──

export type ObservationPhase = "core" | "initial" | "daily" | "completed" | null;

// ── Contradiction Probe ──

export interface ContradictionProbe {
  id: string;
  dimensionA: string;
  dimensionB: string;
  description: string;
  question: string;
  options: { label: string; value: string }[];
}

// ── Judgment / Simulation ──

export type JudgmentUseCase = "romance_matching" | "friend_matching" | "conversation_message";

export type ConversationContext = "romance" | "friend" | "work" | "community" | "casual";

export interface RomanceMatchingJudgment {
  attractionPoints: string[];
  misalignmentRisks: string[];
  approachSuggestion: string;
  tempoAdvice: string;
}

export interface FriendMatchingJudgment {
  closenessLikelihood: string;
  relationshipStyle: string;
  strengthPoints: string[];
  approachAdvice: string;
}

export interface ConversationMessageJudgment {
  sendOrWait: "send_now" | "wait" | "send_later";
  sendOrWaitReason: string;
  toneDirection: string;
  replyPolicy: string;
}

export type JudgmentResult =
  | RomanceMatchingJudgment
  | FriendMatchingJudgment
  | ConversationMessageJudgment;

// ── Insight Cards ──

export interface InsightCard {
  id: string;
  type: string;
  title: string;
  description: string;
  dimension?: string;
  confidence?: number;
  createdAt?: string;
}

export interface InsightCardCollection {
  cards: InsightCard[];
  totalInsights?: number;
  topDimensions?: string[];
}

// ── Observation Feedback ──

export interface ObservationFeedback {
  saved: boolean;
  observationCount: number;
  coreStar?: CoreStar;
  liveSky?: LiveSky;
  liveSkyChanged: boolean;
  dimensionsUpdated: string[];
  message: string;
}

// ── Observation Stats ──

export interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
}
