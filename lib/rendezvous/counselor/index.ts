// ============================================================
// Rendezvous AI Counselor — バレルエクスポート
// AI結婚相談所カウンセラー + コーチングシステム
// ============================================================

// 切断分析
export { analyzeDisconnect, buildDisconnectPrompt } from "./disconnectAnalysis";

// 傾向トラッキング
export {
  trackTendency,
  getUserTendencies,
  checkPatternImprovement,
  getTopPatterns,
} from "./tendencyTracker";

// 次の候補提案
export { findNextSuggestion } from "./nextSuggestion";

// ブリーフィング
export { generateBriefing } from "./briefingGenerator";

// アバター仲介
export { generateAvatarIntro } from "./avatarMediation";

// 成長インサイト
export { generateGrowthInsights } from "./growthInsights";

// 安全ブリッジ（行動シグナル → Counselor通知）
export { notifyCounselorSafety, buildCounselorAlert } from "./safetyBridge";

// オーケストレーター（既存資産の上位制御層）
export {
  evaluateRelationshipState,
  recommendAction,
  selectGameForRecommendation,
  selectMissionForRecommendation,
  dispatchNudge,
} from "./orchestrator";

export type {
  RelationshipState,
  RecommendationType,
  CounselorRecommendation,
} from "./orchestrator";

export type { CounselorSafetyAlert } from "./safetyBridge";

// 型定義
export type {
  // 切断理由
  DisconnectReasonCode,
  // 分析結果
  TendencyInsight,
  DisconnectAnalysis,
  // 次の候補
  NextSuggestion,
  // アバター仲介
  AvatarIntroMode,
  AvatarIntroduction,
  // ブリーフィング
  PreConnectionBriefing,
  // ポストレビュー
  InteractionType,
  PostReview,
  PostReviewFeeling,
  // 成長
  GrowthInsight,
  GrowthPattern,
  GrowthImprovement,
  // セッション
  CounselorSessionState,
  CounselorSession,
  RecoveryStep,
  // DB Row Types
  DisconnectAnalysisRow,
  CounselorSessionRow,
  TendencyPatternRow,
  PreBriefingRow,
  AvatarIntroRow,
  PostReviewRow,
} from "./types";

// ラベル定数
export {
  DISCONNECT_REASON_LABELS,
  POST_REVIEW_FEELING_LABELS,
} from "./types";
