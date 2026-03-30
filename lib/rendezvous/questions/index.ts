// ============================================================
// Rendezvous Question System - Public API
// ============================================================

// Types
export type {
  ContextType,
  MatchingPattern,
  QuestionMaster,
  QuestionCategory,
  UserQuestionResponse,
  UserFeatureVector,
  FeatureKey,
  UserDynamicPreference,
  ContextScoreResult,
  QuestionScoreEntry,
  ContextReason,
  LayerWeights,
  OnboardingProgress,
  DailyQuestionSet,
} from "./types";

export {
  ALL_CONTEXTS,
  CONTEXT_LABELS,
  CONTEXT_COLORS,
  CATEGORY_LABELS,
} from "./types";

// Constants
export {
  DEFAULT_LAYER_WEIGHTS,
  IMPORTANCE_LABELS,
  FLEXIBILITY_LABELS,
  AVATAR_JUDGMENT_LABELS,
  AVATAR_JUDGMENT_COLORS,
  JUDGMENT_GO_THRESHOLD,
  JUDGMENT_HOLD_THRESHOLD,
} from "./constants";
export type { AvatarJudgment } from "./constants";

// Question Master
export {
  QUESTION_MASTER,
  QUESTION_MAP,
  CORE_QUESTIONS,
  DAILY_ELIGIBLE_QUESTIONS,
  groupByCategory,
} from "./questionMaster";

// Scoring
export {
  computeFinalWeight,
  computeQuestionFinalWeight,
  computeQuestionScore,
  computeAnswerCompatibility,
  similarityCompatibility,
  complementaryCompatibility,
  importanceDependentCompatibility,
  computeFlexibilityModifier,
} from "./scoring";

// Context Score
export {
  computeContextScores,
  computeSingleContextScore,
} from "./contextScore";

// Reason Generation
export {
  generateContextReasons,
  computeAvatarJudgment,
  buildAvatarJudgmentText,
} from "./reasonGen";

// Feature Vector
export {
  buildFeatureVector,
  featureVectorSimilarity,
} from "./featureVector";

// Layer Merge
export {
  mergeLayerScores,
  computeFullMergedScores,
} from "./layerMerge";
export type { MergedScoreResult } from "./layerMerge";

// Daily Flow
export {
  selectDailyQuestions,
  processDailyAnswers,
  generateDailyFeedback,
} from "./dailyFlow";
