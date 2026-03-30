// Origin v7 — Memory Exploration Experience
// 記憶探索体験の型定義

/* ─── Life Periods (Step 1) ─── */

export const LIFE_PERIODS = [
  "early_childhood",
  "elementary",
  "middle_school",
  "high_school",
  "late_teens",
  "early_twenties",
  "mid_twenties",
  "thirties",
  "forties_plus",
  "special_period",
] as const;
export type LifePeriod = (typeof LIFE_PERIODS)[number];

export type PeriodDef = {
  id: LifePeriod;
  label: string;
  icon: string;
  ageHint: string;
};

/* ─── Atmosphere (Step 2) ─── */

export type AtmosphereCard = {
  id: string;
  label: string;
  icon: string;
  colorAccent: string;
};

/* ─── Perspective — others' view (Step 3) ─── */

export type PerspectiveCard = {
  id: string;
  label: string;
  icon: string;
};

/* ─── Comparison with now (Step 4) ─── */

export type ComparisonCard = {
  id: string;
  label: string;
  icon: string;
};

/* ─── Memory Triggers (Step 5) ─── */

export const TRIGGER_CATEGORIES = ["place", "thing", "person", "sensation"] as const;
export type TriggerCategory = (typeof TRIGGER_CATEGORIES)[number];

export type TriggerCard = {
  id: string;
  category: TriggerCategory;
  label: string;
  icon: string;
};

export const TRIGGER_CATEGORY_META: Record<
  TriggerCategory,
  { label: string; icon: string }
> = {
  place: { label: "場所", icon: "📍" },
  thing: { label: "もの", icon: "🎒" },
  person: { label: "人", icon: "👤" },
  sensation: { label: "感覚", icon: "🌀" },
};

/* ─── AI Recovery Text (Step 6) ─── */

export type RecoveryText = {
  narrative: string;
  generatedAt: string;
  model: string;
};

/* ─── User Correction (Step 7) ─── */

export type CorrectionLevel = "close" | "slightly_off" | "wrong";

export type UserCorrection = {
  level: CorrectionLevel;
  editedText: string | null;
  correctedAt: string;
};

/* ─── 3 Layers ─── */

export type FactLayer = {
  period: LifePeriod;
  triggers: string[]; // trigger card IDs
};

export type MoodLayer = {
  atmosphere: string; // atmosphere card ID
  perspective: string; // perspective card ID
  comparison: string; // comparison card ID
};

export type MeaningLayer = {
  aiNarrative: RecoveryText;
  correction: UserCorrection;
  finalText: string;
};

/* ─── Feature Connections (Section 17) ─── */

export type ConnectionTarget = "stargazer" | "genome" | "presence";

export type ChapterConnection = {
  target: ConnectionTarget;
  /** 接続を示す一文 (例: "この時期が今の慎重さにつながっているかもしれない") */
  hint: string;
  /** 関連する外部データキー (optional) */
  refKey?: string;
};

/* ─── Chapter ─── */

export type MemoryChapter = {
  id: string;
  /** 章タイトル — その頃の自分像を表す短い言葉 */
  title: string;
  /** 今に残るもの (Echoes) — 2〜4個のタグ */
  echoes: string[];
  fact: FactLayer;
  mood: MoodLayer;
  meaning: MeaningLayer;
  /** 7層データ（optional、後方互換） */
  layers?: ChapterLayers;
  /** 他機能への接続ヒント (Stargazer / Genome / Presence) */
  connections: ChapterConnection[];
  /** 派生元断片のID（派生断片のみ） */
  parentChapterId?: string;
  createdAt: string;
  updatedAt: string;
  revisitCount: number;
};

/* ─── Flow state machine ─── */

export type ExplorationStep =
  | "period_selection"
  | "atmosphere"
  | "perspective"
  | "comparison"
  | "triggers"
  | "ai_recovery"
  | "correction"
  | "save";

export const STEP_ORDER: ExplorationStep[] = [
  "period_selection",
  "atmosphere",
  "perspective",
  "comparison",
  "triggers",
  "ai_recovery",
  "correction",
  "save",
];

/* ─── Draft (in-progress chapter) ─── */

export type DraftChapter = {
  period: LifePeriod | null;
  atmosphere: string | null;
  perspective: string | null;
  comparison: string | null;
  triggers: string[];
  aiNarrative: RecoveryText | null;
  /** AI生成の章タイトル */
  aiTitle: string | null;
  /** AI生成の今に残るもの */
  aiEchoes: string[] | null;
  /** AI生成の層データ */
  aiLayers: ChapterLayers | null;
  correction: UserCorrection | null;
};

export function createEmptyDraft(): DraftChapter {
  return {
    period: null,
    atmosphere: null,
    perspective: null,
    comparison: null,
    triggers: [],
    aiNarrative: null,
    aiTitle: null,
    aiEchoes: null,
    aiLayers: null,
    correction: null,
  };
}

/* ─── Current Position (Step 0) ─── */

export type CurrentPosition = {
  /** 今に残るもの — 3つ程度 */
  remains: string[];
  /** 今探しているもの — 1〜2つ */
  seeking: string[];
  /** 今と昔の差分 — 1〜2つ */
  difference: string[];
  completedAt: string;
};

/* ─── Chapter Layers（断片カードの7層構造） ─── */

export type ChapterLayers = {
  events?: string;           // 何が起きていたか
  innerState?: string;       // その時の内側
  learnedPatterns?: string;  // 覚えた生き方
  presentImpact?: string;    // 今への影響
  nextConnection?: string;   // 次への接続
  place?: string;            // 場所
  lifeScene?: string;        // 生活シーン
  relationships?: string;    // 人間関係
  deepDivePrompts?: string[];// 深掘り質問
};

/* ─── 探索軸 ─── */

export type ExplorationAxis =
  | "place" | "person" | "daily_flow" | "belongings"
  | "difference" | "unspoken" | "pride" | "defense"
  | "loss" | "weapon";

/* ─── 回想ハンドル ─── */

export type MemoryHandle = {
  id: string;
  label: string;
  icon: string;
};

/* ─── 深掘りフロー フェーズ ─── */

export type DeepExplorationPhase =
  | "target_selection"
  | "memory_handles"
  | "daily_structure"
  | "fact_gathering"
  | "inner_state"
  | "learned_patterns"
  | "present_connection"
  | "hypothesis_correction";

/* ─── 深掘りフロー結果 ─── */

export type ExplorationResult = {
  updatedLayers: ChapterLayers;
  newEchoes?: string[];
  newTitle?: string;
  spawnedFragments?: Partial<MemoryChapter>[];
  hypothesis: string;
  correctionLevel: CorrectionLevel;
};

/* ─── v6: Life Domains ─── */

export type LifeDomain = "work" | "romance" | "friendship" | "family" | "solitude";

export const DOMAIN_LABELS: Record<LifeDomain, string> = {
  work: "仕事・活動",
  romance: "恋愛・親密な関係",
  friendship: "友人関係",
  family: "家族",
  solitude: "一人の時間",
};

/* ─── v6: Contradiction Resolution ─── */

export type DomainResolution = {
  domain: LifeDomain;
  winningSide: "A" | "B" | "both" | "neither";
  intensity: number;       // 0-1
  evidence: string | null;
};

export type ContradictionResolution = {
  contradictionId: string;
  sideA: string;
  sideB: string;
  resolutions: DomainResolution[];
  userAnnotation: string | null;
  resolvedAt: string;
};

/* ─── v6: Collapse/Growth Insight (user reaction) ─── */

export type CollapseGrowthInsight = {
  type: "collapse" | "growth";
  sourceId: string;
  userRecognition: "accurate" | "surprising" | "partially" | null;
  userNote: string | null;
  relatedDomains: LifeDomain[];
};

/* ─── v6: Targeted Response (vector refinement) ─── */

export type TargetedResponse = {
  promptId: string;
  dimension: string;
  selectedOptionId: string;
  dimensionEffect: number;
  answeredAt: string;
};

/* ─── v8: Memory Dive (記憶ダイブ) ─── */

export type MemoryDivePhase = "scene" | "senses" | "events" | "inner" | "ripple";

export const DIVE_PHASE_ORDER: MemoryDivePhase[] = [
  "scene", "senses", "events", "inner", "ripple",
];

export type DiveSceneData = {
  year: number | null;
  month: number | null;
  season: string | null;
  place: string;
  placeCard: string | null; // PLACE_CARDS id — card-only path
  people: string[];
  timeOfDay: string | null;
  atmosphere: string | null;
};

export type DiveSensesData = {
  sight: string[];
  sightText: string;
  sound: string[];
  soundText: string;
  smell: string[];
  smellText: string;
  temperature: string | null;
  touch: string[];
  touchText: string;
};

export type DiveEventsData = {
  narrative: string;
  eventType: string | null;
  intensity: number;
  pivotalMoment: string;
};

export type DiveInnerData = {
  emotions: string[];
  thoughts: string;
  unsaid: string;
  unsaidTarget: string | null;
};

export type DiveRippleData = {
  impact: string;
  impactType: string | null;
  counterfactual: string;
  patternStarted: string;
};

export type MemoryDiveDraft = {
  id: string;
  scene: DiveSceneData;
  senses: DiveSensesData | null;
  events: DiveEventsData | null;
  inner: DiveInnerData | null;
  ripple: DiveRippleData | null;
  currentPhase: MemoryDivePhase;
  startedAt: string;
};

export type MemoryGem = {
  id: string;
  diveId: string;
  scene: DiveSceneData;
  senses: DiveSensesData;
  events: DiveEventsData;
  inner: DiveInnerData;
  ripple: DiveRippleData;
  dominantEmotion: string;
  title: string;
  calendarYear: number;
  calendarMonth: number;
  lifePeriod: LifePeriod;
  createdAt: string;
};

/* ─── v8: Daily Micro-Question (デイリー・マイクロ質問) ─── */

export type MicroQuestionCategory =
  | "daily_life" | "relationships" | "emotions" | "decisions"
  | "senses" | "habits" | "objects" | "places" | "people"
  | "firsts" | "seasonal" | "food" | "body" | "dreams";

export type MicroQuestionOption = {
  id: string;
  label: string;
  icon: string;
};

export type MicroQuestion = {
  id: string;
  question: string;
  lifePeriod: LifePeriod;
  category: MicroQuestionCategory;
  options: MicroQuestionOption[];
  allowFreeText: boolean;
};

export type MicroQuestionAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  freeText: string;
  lifePeriod: LifePeriod;
  calendarYear: number | null;
  calendarMonth: number | null;
  answeredAt: string;
};

export type MicroQuestionStreak = {
  currentStreak: number;
  longestStreak: number;
  lastAnsweredDate: string;
  totalAnswered: number;
};

/* ─── v8: Life Calendar (人生カレンダー) ─── */

export type LifeCalendarCell = {
  year: number;
  month: number;
  explorationDepth: number;
  microQuestionIds: string[];
  memoryGemIds: string[];
  chapterIds: string[];
};

/* ─── Full save ─── */

// Re-export workspace types for convenience
export type {
  RootProfile,
  EraAffiliation,
  ActivityEntry,
  TurningPoint,
  ResidueItem,
  AnalyticalFrame,
  ActivePanel,
  RightPanelView,
} from "./workspaceTypes";

export type OriginV7Save = {
  version: 7;
  chapters: MemoryChapter[];
  draft: DraftChapter | null;
  currentPosition: CurrentPosition | null;
  createdAt: string;
  updatedAt: string;
  // ── ワークスペースデータ（optional → 後方互換） ──
  rootProfile?: import("./workspaceTypes").RootProfile;
  eraAffiliations?: import("./workspaceTypes").EraAffiliation[];
  activities?: import("./workspaceTypes").ActivityEntry[];
  turningPoints?: import("./workspaceTypes").TurningPoint[];
  residueBoard?: import("./workspaceTypes").ResidueItem[];
  // ── v6: 自己認識・ベクトル精錬（optional → 後方互換） ──
  contradictionResolutions?: ContradictionResolution[];
  collapseGrowthInsights?: CollapseGrowthInsight[];
  targetedResponses?: TargetedResponse[];
  // ── v8: 記憶ダイブ・マイクロ質問・人生カレンダー（optional → 後方互換） ──
  memoryGems?: MemoryGem[];
  memoryDiveDraft?: MemoryDiveDraft | null;
  microQuestionAnswers?: MicroQuestionAnswer[];
  microQuestionStreak?: MicroQuestionStreak;
  birthYear?: number;
  birthMonth?: number;
};
