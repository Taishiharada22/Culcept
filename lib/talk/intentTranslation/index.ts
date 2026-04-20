// lib/talk/intentTranslation/index.ts
// 意図翻訳エンジン — Phase 1 + Phase 2 + Phase 3 公開API
//
// Aneurasync のテキストコミュニケーションにおける
// 「意図-解釈ズレ」の検出・補正・仲介エンジン。
//
// Phase 1: 送信側の伝わり方チェック（readingSimulation）
//   - ルールベース（曖昧表現辞書 + 敬語シフト + 受信者感受性 + 話題繊細さ）
//   - LLM推論（性格プロファイル × 会話文脈 → 意図と解釈のギャップ分析）
//   - 三段階介入モデル（Silent/Passive/Active）
//
// Phase 2: 受信側の意図翻訳（intentReconstruction）
//   - 送信者の意図推定 + 受信者バイアス補正
//   - 💭バブルヒント表示制御
//
// Phase 3: 共同Alter仲介（sharedMediator）
//   - NVC 4要素分析（観察・感情・ニーズ・リクエスト）
//   - Gottman 四騎士パターン検出
//   - 双方向の仲介提案生成

export { simulateReading } from "./readingSimulation";
export { reconstructIntent } from "./intentReconstruction";
export { mediate } from "./sharedMediator";
export { fetchIntentProfile } from "./fetchIntentProfile";

export {
  analyzeNVCRuleBased,
  detectFourHorsemen,
  detectGottmanCascade,
  detectReciprocalEscalation,
  assessEscalation,
} from "./nvcAnalysis";

export {
  enforceSafetyRules,
  SAFETY_RULES,
  SAFETY_PROMPT_BLOCK,
} from "./safetyRules";
export type { SafetyRuleKey } from "./safetyRules";

export {
  resolveInterventionLevel,
  updateCooldownAfterActive,
  resetConsecutiveActive,
  createFreshCooldownState,
} from "./interventionControl";

export {
  detectAmbiguousExpressions,
  adjustProbabilitiesForProfile,
  computeAmbiguityFactor,
  computeTopicWeight,
  classifyKeigoLevel,
  detectKeigoShift,
} from "./japanesePragmatics";

export type {
  // Core types
  ReadingSimulationInput,
  ReadingSimulationResult,
  IntentTranslationProfile,
  IntentInterpretation,
  // Risk
  MisreadRiskFactors,
  MisreadType,
  // Intervention
  InterventionLevel,
  InterventionCooldownState,
  // Japanese pragmatics
  AmbiguousExpressionHit,
  KeigoLevel,
  KeigoShiftSignal,
  // Speech acts
  SpeechActType,
  VADVector,
  // Context
  ConversationTurn,
  RelationshipMeta,
  // Phase 2: Intent Reconstruction
  IntentReconstructionInput,
  IntentReconstructionResult,
  BubbleHintDecision,
  BubbleSkipReason,
  SenderPastPattern,
  // Phase 3: Shared Mediator
  NVCDecomposition,
  FourHorsemanHit,
  GottmanCascade,
  ReciprocalEscalation,
  EscalationState,
  MediationDecision,
  MediationReason,
  MediationSuggestion,
  MediationInput,
  MediationResult,
} from "./types";

export {
  INTENT_TRANSLATION_AXES,
  MAX_ACTIVE_INTERVENTIONS_PER_DAY,
  CONSECUTIVE_ACTIVE_THRESHOLD,
  COOLDOWN_DURATION_MS,
  // Phase 2
  BUBBLE_HINT_RISK_THRESHOLD,
  BUBBLE_HINT_CONFIDENCE_THRESHOLD,
  MAX_BUBBLE_HINTS_PER_DAY,
  BUBBLE_HINT_COOLDOWN_MS,
  // Phase 3
  MEDIATION_ESCALATION_THRESHOLD,
  FOUR_HORSEMEN_ALWAYS_MEDIATE,
  MAX_MEDIATIONS_PER_DAY,
  MEDIATION_COOLDOWN_MS,
} from "./types";
