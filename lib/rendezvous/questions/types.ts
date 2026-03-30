// ============================================================
// Rendezvous Question System 型定義
// 友達 / 恋愛 / Orbiter / cocreation の4文脈を
// 共通質問 + 重み解釈で成立させるデータモデル
// ============================================================

// ---------- Context Type ----------

/** 接続文脈: 質問を分けるのではなく、解釈（重み）を分ける */
export type ContextType = "friend" | "romance" | "orbiter" | "cocreation";

export const ALL_CONTEXTS: ContextType[] = [
  "romance",
  "friend",
  "orbiter",
  "cocreation",
];

export const CONTEXT_LABELS: Record<ContextType, string> = {
  friend: "友達",
  romance: "恋愛",
  orbiter: "Orbiter",
  cocreation: "共創",
};

export const CONTEXT_COLORS: Record<ContextType, string> = {
  friend: "#4AEAFF",
  romance: "#FF6B9D",
  orbiter: "#8B5CF6",
  cocreation: "#F59E0B",
};

/**
 * 文脈ごとの背景グラデーション (乳白ベース / 透明感優先)
 * friend = 淡いシアン, romance = 淡いローズ,
 * orbiter = 淡いバイオレット, cocreation = 淡いアンバーゴールド
 */
export const CONTEXT_BACKGROUND_GRADIENTS: Record<ContextType, string> = {
  friend:
    "linear-gradient(180deg, #E8FFFE 0%, #F0FFFE 40%, #F8F7FF 100%)",
  romance:
    "linear-gradient(180deg, #FFF0F5 0%, #FFF5F8 40%, #FFF8FA 100%)",
  orbiter:
    "linear-gradient(180deg, #F3EEFF 0%, #F5F0FF 40%, #FAF5FF 100%)",
  cocreation:
    "linear-gradient(180deg, #FDF8EE 0%, #FBF5E8 40%, #FFFCF5 100%)",
};

// ---------- Context Exploration State ----------

/**
 * 文脈ごとの探索状態 (enum的な単一状態)
 * - inactive: 分身を送り出していない
 * - active: 探索中
 * - paused: 一時停止中
 */
export type ContextExplorationState = "inactive" | "active" | "paused";

export const CONTEXT_EXPLORATION_STATE_LABELS: Record<
  ContextExplorationState,
  string
> = {
  inactive: "未開始",
  active: "探索中",
  paused: "一時停止中",
};

/** 文脈ごとの探索状態マップ */
export type ContextStatesMap = Record<ContextType, ContextExplorationState>;

/** デフォルトの文脈状態 (全て未開始) */
export const DEFAULT_CONTEXT_STATES: ContextStatesMap = {
  friend: "inactive",
  romance: "inactive",
  orbiter: "inactive",
  cocreation: "inactive",
};

// ---------- Matching Pattern ----------

/** 判定方法: 全部「一致すれば高い」にしない */
export type MatchingPattern =
  | "similarity" // 一致が望ましい (金銭感覚, 将来像, 生活リズム)
  | "complementary" // 補完が望ましい (行動力, 計画性と柔軟性)
  | "importance_dependent"; // 重要度によって影響度が変わる (趣味一致, 休日)

// ---------- Question Master ----------

export type QuestionMaster = {
  id: string;
  key: string;
  title: string;
  prompt: string;
  description?: string;
  category: QuestionCategory;
  answerType: "scale" | "single_choice" | "multi_choice";
  scaleMin?: number;
  scaleMax?: number;
  options?: {
    value: string;
    label: string;
    score?: number;
  }[];
  matchingPattern: MatchingPattern;
  systemWeights: {
    friend: number; // 1..5
    romance: number; // 1..5
    orbiter: number; // 1..5
    cocreation: number; // 1..5
  };
  /** システム優先度。高いほど一般論を崩しにくい (0..1) */
  rigidity: number;
  featureMapping: {
    featureKey: FeatureKey;
    contribution: number; // -1.0 .. +1.0
  }[];
  /** 毎日質問対象に含めてよいか */
  dailyEligible: boolean;
  /** 初回コア診断対象か */
  coreEligible: boolean;
};

export type QuestionCategory =
  | "tempo" // 会話・テンポ
  | "distance" // 距離感
  | "values" // 価値観
  | "lifestyle" // 生活
  | "conflict"; // 衝突と修復

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  tempo: "会話・テンポ",
  distance: "距離感",
  values: "価値観",
  lifestyle: "生活",
  conflict: "衝突と修復",
};

// ---------- User Question Response ----------

export type UserQuestionResponse = {
  userId: string;
  questionId: string;
  answerValue: string | number | string[];
  importanceByContext: {
    friend: number; // 1..5
    romance: number; // 1..5
    orbiter: number; // 1..5
    cocreation: number; // 1..5
  };
  flexibilityByContext?: {
    friend: number; // 1..5, 高いほどズレ許容
    romance: number;
    orbiter: number;
    cocreation: number;
  };
  answeredAt: string;
  source: "onboarding" | "daily_update" | "manual_edit";
};

// ---------- User Feature Vector ----------

export type FeatureKey =
  | "calmness"
  | "novelty"
  | "emotional_openness"
  | "pace_match_preference"
  | "value_alignment"
  | "long_term_stability"
  | "playfulness"
  | "depth"
  | "independence"
  | "attachment_style_preference"
  | "lifestyle_regularity"
  | "conflict_repair_orientation"
  | "intimacy_pacing";

export type UserFeatureVector = {
  userId: string;
  features: Partial<Record<FeatureKey, number>>; // 0..1
  updatedAt: string;
};

// ---------- User Dynamic Preference (可変層 / 当日層) ----------

export type UserDynamicPreference = {
  userId: string;
  contextBias: {
    friend: number; // 0..1, 文脈の開き度合い
    romance: number;
    orbiter: number;
    cocreation: number;
  };
  moodAdjustments: {
    calmness?: number; // -1..1 delta
    novelty?: number;
    depth?: number;
    socialEnergy?: number;
  };
  validUntil: string;
  source: "daily_update";
};

// ---------- Context Score (文脈別スコア) ----------

export type ContextScoreResult = {
  friend: number; // 0..100
  romance: number;
  orbiter: number;
  cocreation: number;
  bestContext: ContextType;
  questionBreakdown: QuestionScoreEntry[];
};

export type QuestionScoreEntry = {
  questionId: string;
  questionTitle: string;
  category: QuestionCategory;
  scores: {
    friend: number; // 0..1
    romance: number;
    orbiter: number;
    cocreation: number;
  };
  /** この質問が各文脈でどれだけ効いたか */
  effectiveWeights: {
    friend: number;
    romance: number;
    orbiter: number;
    cocreation: number;
  };
};

// ---------- Context Reason (理由文生成用) ----------

export type ContextReason = {
  context: ContextType;
  score: number;
  topFactors: {
    questionTitle: string;
    category: QuestionCategory;
    description: string;
    impact: "positive" | "caution";
  }[];
  summary: string;
  recommendedTone?: string;
};

// ---------- Layer Weights (3層合成の重み) ----------

export type LayerWeights = {
  fixed: number; // 固定層
  variable: number; // 可変層
  daily: number; // 当日層
};

// ---------- Onboarding Progress ----------

export type OnboardingProgress = {
  userId: string;
  totalQuestions: number;
  answeredQuestions: number;
  completedAt?: string;
  featureVectorReady: boolean;
};

// ---------- Daily Question ----------

export type DailyQuestionSet = {
  userId: string;
  date: string;
  questions: QuestionMaster[];
  answeredCount: number;
};
