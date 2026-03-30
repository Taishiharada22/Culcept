// types/stargazer.ts
// Stargazer v4 — Self-Decoding Engine + 3-Layer Archetype System (45軸 × 24アーキタイプ)

// ── Re-exports from lib/stargazer ──

export type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
export type {
  QuestionDefinition,
  ChapterKey,
} from "@/lib/stargazer/questions";

// v2 resolver (used for scoring, not type classification)
export type {
  ResolvedResult,
  TypeMatch,
  QuestionAnswer,
} from "@/lib/stargazer/typeResolver";
export type {
  ReactionTypeCode,
  ReactionTypeDef,
} from "@/lib/stargazer/reactionTypes";

// ── v4 Archetype System (24タイプ: 4軸) ──

export type {
  CognitionCode,
  EmotionCode,
  SocialCode,
  ExecutionCode,
  // Legacy aliases
  Layer1Code,
  Layer2Code,
  Layer3Code,
  Layer4Code,
  ArchetypeCode,
  ArchetypeDef,
  ColorFamily,
  ColorTone,
  ColorGroup,
} from "@/lib/stargazer/archetypeTypes";

export type {
  ArchetypeResult,
} from "@/lib/stargazer/archetypeResolver";

export type {
  RelationshipType,
  CompatibilityResult,
} from "@/lib/stargazer/archetypeCompatibility";

export type {
  ArchetypeTheme,
  ColorPalette,
} from "@/lib/stargazer/archetypeThemes";

// ── v4 Self-Decoding Engine (自己解読エンジン) ──

export type {
  DropTone,
  DropCategory,
  BlindSpotDrop,
} from "@/lib/stargazer/blindSpotDrop";

export type {
  ProphecyCategory,
  DailyProphecy,
  PredictionAccuracy,
} from "@/lib/stargazer/dailyProphecy";

export type {
  WeatherType,
  EmotionalTone,
  DefenseType,
  PressurePoint,
  PressureMap,
  InnerWeather,
} from "@/lib/stargazer/innerWeather";

export type {
  TileState,
  MapTile,
  UnseenMap,
} from "@/lib/stargazer/unseenMap";

export type {
  AlterMode,
  AlterPersonality,
  AlterMessage,
  AlterSession,
  AlterVoice,
} from "@/lib/stargazer/alter";

export type {
  AlterLongTermMemory,
  KeyRevelation,
  RecurringTheme,
  CrossSessionContradiction,
  SessionEmotionalArc,
} from "@/lib/stargazer/alterMemory";

export type {
  DecisionQuery,
  OracleResponse,
  OracleInput,
} from "@/lib/stargazer/decisionOracle";

export type {
  GhostResonanceEntry,
  GhostResonanceInput,
} from "@/lib/stargazer/ghostResonance";

export type {
  PsycheSignature,
  PsycheWrapped,
  WrappedStat,
  ShareCardData,
} from "@/lib/stargazer/psycheSignature";

// ── Core Types ──

export interface CoreStar {
  /** アーキタイプコード (v4: 4次元24タイプ e.g. "ACIO") */
  archetypeCode?: string;
  /** アーキタイプ名 (日本語表示名 e.g. "指揮官") */
  archetypeLabel?: string;
  /** アーキタイプ絵文字 */
  archetypeEmoji?: string;
  confidenceScore: number; // 0-1
  changed?: boolean;
  coreTraits?: Record<string, number>;
  reactionType?: string;
}

export interface LiveSky {
  dimensions: Record<string, number>;
  updatedAt?: string;
}

export interface ArchetypeInfo {
  emoji: string;
  description: string;
  keywords: string[];
}

export interface StarMap {
  coreStar: CoreStar;
  liveSky?: LiveSky;
  archetypeInfo?: ArchetypeInfo;
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
  long_term?: Record<string, number>;
  cross_gender_friendship?: Record<string, number>;
}

export interface ResolvedType {
  family?: ResolvedFamily;
  orbit?: ResolvedOrbit;
  label?: string;
  display?: ResolvedDisplay;
  visual?: ResolvedVisualStyle;
  contextFaces?: ContextFaces;
  /** Archetype code (e.g. ACIO, SVEX) */
  archetypeCode?: string;
  /** 上位3タイプとのマッチスコア */
  topMatches?: { code: string; label: string; emoji: string; score: number }[];
  /** 15軸スコア (-1〜1) */
  axisScores?: Record<string, number>;
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

export type ObservationPhase = "core" | "stage1" | "stage1_done" | "stage2" | "initial" | "daily" | "completed" | null;

// ── Stage Progress ──

export type StargazerStage = "none" | "stage1_active" | "stage1_done" | "stage2_active" | "stage2_done";

export interface StageProgress {
  stage: StargazerStage;
  stage1?: {
    answeredCount: number;
    totalCount: number;
    completedAt?: string;
  };
  stage2?: {
    completedThemeIds: string[];
    totalThemes: number;
    completedAt?: string;
  };
}

// ── Safety Tendency Display ──

export interface SafetyTendencyDisplay {
  label: string;
  description: string;
  level: "stable" | "developing" | "caution_area";
  evidenceCount: number;
}

// ── Matching Integration ──

export interface MatchingIntegrationDisplay {
  friendModeFit: number;
  safetyScore: number;
  trustScore: number;
  compatibilityFlags: string[];
}

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
