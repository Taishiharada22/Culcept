import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import { STARGAZER_FLAGS } from "@/lib/stargazer/featureFlags";
import {
  runPerspectiveEngine,
  type PerspectiveEngineResult,
  type PerspectiveAudit,
  type PerspectiveBlock,
  type PerspectiveLatencyBreakdown,
  type QualityGateResult,
  type SearchTask,
  type SearchTaskClassification,
  type ExplorationState,
  type ExplorationPhase,
  type CandidateEntity,
  type ExplorationOutputTemplate,
  EXPLORATION_OUTPUT_TEMPLATES,
  detectExplicitSearchIntent,
  shouldResumeExploration,
  buildResumeAnchors,
  createExplorationState,
} from "@/lib/stargazer/perspectiveEngine";
import {
  generateDerivedFacts,
  formatDerivedFactsForPrompt,
  type ContradictionInput,
} from "@/lib/stargazer/derivedFactGenerator";
import { AXIS_REGISTRY } from "@/lib/stargazer/axisRegistry";
import {
  buildAlterPersonality,
  buildAlterSystemPrompt,
  buildDeepAlterPrompt,
  generateAlterGreeting,
  generateAlterResponse,
  selectAlterMode,
  calculateOptimalMode,
  type AlterInput,
  type AlterMode,
  type AlterMessage,
  type AlterBehavioralEvidence,
  type AlterDeepContext,
} from "@/lib/stargazer/alter";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import {
  buildAxisScores,
  calcObservationDepth,
  truncateString,
} from "@/lib/stargazer/sharedRouteUtils";
import {
  buildHomeAlterPromptWithContext,
  buildHomeAlterUserPrompt,
  buildHomeAlterRetryPrompt,
  buildPersonalizedFactsWithDomain,
  extractExpectedKeywords,
  validateHomeAlterResponseWithMode,
  formatHomeAlterResponse,
  extractReasoningBasis,
  classifyQuestion,
  analyzeQueryContext,
  selectResponseMode,
  selectResponseModeWithReason,
  buildDomainOverlay,
  parseDecisionMetadata,
  reconcileDecisionMetadata,
  computeFallbackDecisionMetadata,
  computeForceBalance,
  buildJudgmentFramework,
  ALTER_IDENTITY_BLOCK,
  buildAlterIdentityBlock,
  detectDirectRequest,
  detectDirectDemand,
  detectCorrectionSignal,
  detectGreeting,
  computeResponseSimilarity,
  extractConversationFacts,
  type HomeAlterContextData,
  type DecisionMetadata,
  type QueryContext,
  type QueryDomain,
  type ResponseMode,
  type ModeDecisionReason,
  type QuestionCategory,
  extractRelationalLens,
  enrichRelationalLens,
  extractInputUnderstanding,
  buildJudgmentSkeleton,
  buildSkeletonPromptBlock,
  validateResponseQuality,
  sanitizeTraitInversions,
  buildAuditTrail,
  detectActionShapeHints,
  // Daily Guidance
  extractDailyGuidanceFrame,
  checkDailyGuidanceClarify,
  buildDailyGuidanceSkeleton,
  buildDailyGuidancePromptBlock,
  validateDailyGuidanceResponse,
  type RelationalLens,
  type RelationalLensDetailed,
  type InputUnderstanding,
  type JudgmentSkeleton,
  type ConsistencyCheck,
  type AuditTrail,
  getClarifyType,
  type ClarifyIntentHint,
  type HypothesisFactEntry,
  type BaselineDeviationEntry,
  type PersonMapFactEntry,
  isEmotionalQuestion,
  isSelfUnderstandingQuestion,
  classifyQuestionType,
  applyQuestionTypeOverride,
  classifyReaction,
  type Reaction,
  type QuestionType,
  isCreationVisionTheme,
  isCoreDemandQuestion,
  isHighAbstractionTheme,
  isCareerAdviceQuestion,
  isUnseenValueQuestion,
  isGreetingOnly,
  isChatOpening,
  isScopeDisclosureQuestion,
  isDelegationRequest,
  isExecutionRequest,
  isCareerFitQuery,
  isIndustryFitQuery,
  buildCreationModePromptBlock,
  buildCoreDemandPromptBlock,
  buildHighAbstractionPromptBlock,
  buildGenericLabelBanBlock,
  buildGreetingPromptBlock,
  buildChatOpeningPromptBlock,
  buildMetaQuestionPromptBlock,
  buildAskMePromptBlock,
  buildAskMeRedirectPromptBlock,
  isAskMeRedirect,
  buildConversationPromptBlock,
  buildDelegationPromptBlock,
  buildExecutionRequestPromptBlock,
  buildCareerFitPromptBlock,
  buildIndustryFitPromptBlock,
  buildScopeDisclosurePromptBlock,
  buildCareerAdvicePromptBlock,
  buildUnseenValuePromptBlock,
  detectFollowUp,
  type FollowUpType,
  isFatigueMessage,
  buildFatigueGuidancePromptBlock,
  buildDissatisfactionRevisionPromptBlock,
  buildFollowUpContinuationPromptBlock,
  buildFollowUpCorrectionPromptBlock,
  buildCreationDeepPromptBlock,
  isCreationContaminatingContext,
  shouldStickyConversation,
  enforceConversationalBrevity,
  validateConversationalQuality,
} from "@/lib/stargazer/alterHomeAdapter";
import {
  estimateUserState,
  computeStateAdjustment,
  detectMicroSignals,
  extractLifeContextSignals,
  extractExtendedContextSignals,
  extractPersonMentions,
  updateSentimentTrend,
  computeInfluenceScore,
  matchContextEntry,
  updatedConfidence,
  filterActiveContext,
  maxContextEntriesByTrust,
  classifyInsightReaction,
  detectStructuralGaps,
  determineDisclosureLevel,
  formatDisclosureInstruction,
  isContextRelevant,
  deriveTrustLevel,
  extractUserNarratives,
  deriveRecurringPatternHypotheses,
  detectCrossContextPatterns,
  crossContextToHypotheses,
  updateHypothesisStatus,
  formatHypothesisForPrompt,
  selectHypothesesForPrompt,
  deriveContradictionHypotheses,
  detectHypothesisContradictions,
  deriveGrowthSignalHypotheses,
  computeUserBaseline,
  detectBaselineDeviations,
  selectDeepeningProbe,
  formatDeepeningProbeForPrompt,
  evaluateMIGate,
  convertBaselineDeviationsToSignals,
  lintMIAssertions,
  type NarrativeEntry,
  type BaselineDeviation,
  type MIGateDecision,
  checkCreepinessLine,
  suggestTrustThresholdAdjustment,
  computeMIAccuracy,
  computeJudgmentAccuracy,
  selectIntent,
  formatIntentForRouteCPrompt,
  runTrapScan,
  computeWoundActivation,
  detectPotentialWounds,
  computeFinancialPressure,
  applyContextModifiers,
  type UserState,
  type StateForceAdjustment,
  type MicroSignal,
  type MicroInsightCandidate,
  type LifeContextEntry,
  type PersonMapEntry,
  type AlterHypothesis,
  type SelectedIntent,
  type TrapScanResult,
  type TrapScanInput,
  type WoundActivationResult,
  type WoundActivationInput,
  type WoundDefinition,
  type FinancialPressure,
  type AxisContextModifier,
  type ContextualizedAxisScores,
  type ContextDomain,
  type TrustLevel,
} from "@/lib/stargazer/alterUnderstanding";
import { runAI } from "@/lib/ai";
import {
  UTTERANCE_READING_SYSTEM_PROMPT,
  UTTERANCE_READING_SCHEMA,
  buildUtteranceReadingPrompt,
  validateUtteranceReading,
  applyEmotionalTemperatureCorrection,
  mergeRelationalContext,
  buildReadingPromptBlock,
  buildShadowLogPayload,
  buildDisagreementLog,
  type UtteranceReading,
} from "@/lib/stargazer/alterUtteranceReading";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import { deriveBaselineContext, deriveRelationshipContext, deriveLifeContext, type BaselineContext, type RelationshipContext, type LifeContext } from "@/lib/stargazer/baselineContext";
import {
  loadAlterSessionSummaries,
  detectCrossSessionContradiction,
  summarizeAlterSession,
  saveAlterSessionSummary,
  buildMemoryContext,
} from "@/lib/stargazer/alterMemory";
import {
  fetchPatternsForUser,
  selectAhaInsights,
} from "@/lib/stargazer/ahaEngine";
import {
  loadAlterGrowthState,
  updateAlterGrowth,
  detectReadiness,
  generateAlterSelfReport,
} from "@/lib/stargazer/alterGrowth";
import { syncAlterSignalsToStargazer } from "@/lib/stargazer/alterToStargazerPipeline";
import {
  shouldGenerateLetter,
  generateAlterLetter,
  saveAlterLetter,
  getLastLetterSessionCount,
} from "@/lib/stargazer/alterLetters";
import {
  isThinSliceEnabled,
  reconstructThinSliceState,
  assessTurnValue,
  generateInsight,
  selectSharpBet,
  determineClaimStrength,
  evaluateBetOutcome,
  buildBetPromptBlock,
  buildRetractionPromptBlock,
  buildThinSliceAnalytics,
  type ThinSliceSessionState,
  type TurnValueAssessment,
  type GeneratedInsight,
  type SharpBet,
  type ClaimDecision,
  type BetOutcome,
} from "@/lib/stargazer/alterThinSlice";
// v4.2 FULL: 全層パイプライン
import {
  selectAlterRole,
  checkSemanticBans,
  buildRoleContractBlock,
  buildBurdenTransferBlock,
  buildSemanticBansBlock,
  buildContractAnalytics,
  type RoleSelection,
  type SemanticBanCheck,
} from "@/lib/stargazer/alterContracts";
// Response Time Engine (RT signal)
import { computeResponseTimeSignal } from "@/lib/stargazer/responseTimeEngine";
// Heart Integration — 心の統合ブロック
import { buildUnifiedHeartState, buildHeartStateAnalytics, type HeartStateInputs } from "@/lib/stargazer/heartIntegration";
import { runPersonalizationTracking, type PersonalizationTrackingResult } from "@/lib/stargazer/personalizationTracker";
import { buildSessionDiffPromptBlock, computeSessionDiff, buildSessionDiffAnalytics, type SessionDiffAnalytics } from "@/lib/stargazer/sessionDiff";
// Output Governance Layer (RC1 + RC5 + Metrics)
import {
  extractUserBans,
  checkUserBans,
  buildUserBansPromptBlock,
  assessFrustration,
  buildFrustrationPromptBlock,
  type UserBan,
  type FrustrationState,
  type UserBanViolation,
} from "@/lib/stargazer/alterOutputGovernance";
// Proactive Understanding Engine
import {
  runProactiveEngine,
  DEFAULT_GATES,
  resolveGates,
  ENV_GATE_OVERRIDES,
  createTrustEvent,
  createPendingPayback,
  markPaybackUsed,
  findUnusedPaybacks,
  addEvidenceToCausalLink,
  addContradictionToCausalLink,
  decayCausalLinkConfidence,
  grantImplicitConsent,
  setConsentCooldown,
  isSensitiveSubdomain,
  domainToDefaultSubdomain,
  SENSITIVE_SUBDOMAINS,
  type ProactiveEngineOutput,
  type ProactiveEngineGates,
  type ContextualAccess,
  type SubdomainConsent,
  type TrustEvent,
  type CausalLink,
  type TrustDomain,
  type TrustEventType,
  type PendingPayback,
  type ConsentSubdomain,
  type CurrentTopicContext,
  detectBigQuestion,
} from "@/lib/stargazer/proactiveUnderstanding";
import {
  checkCrossSessionConvergence,
  updateConvergenceState,
  detectImplicitSignals,
  accumulateImplicitSignals,
  promoteToMicroInsight,
  type SessionMicroSignal,
  type ConvergenceState,
  type CrossSessionConvergenceResult,
  type ImplicitSignal,
  type ImplicitMicroInsightCandidate,
} from "@/lib/stargazer/miConvergenceEngine";
import {
  readTurnSignal,
  buildSignalAnalytics,
  type TurnSignal,
} from "@/lib/stargazer/alterSignalReader";
import {
  projectSelfModel,
  buildSelfModelPromptBlock,
  buildSelfModelAnalytics,
  type LivingSelfModel,
} from "@/lib/stargazer/alterSelfModel";
import {
  runInterpretationArena,
  buildArenaPromptBlock,
  buildArenaAnalytics,
  type WinningInterpretation,
  type InterpretationLensId,
} from "@/lib/stargazer/alterInterpretationArena";
import {
  checkStrategyCompliance,
  assessRally,
  buildRallyCriticBlock,
  buildComplianceAnalytics,
  buildRallyCriticAnalytics,
  type ComplianceCheckResult,
  type RallyCriticResult,
} from "@/lib/stargazer/alterStrategyCompliance";
import {
  detectRupture,
  buildRuptureAnalytics,
  detectExplicitRejection,
  type RuptureAssessment,
} from "@/lib/stargazer/ruptureDetection";
import {
  evaluateAbstention,
  buildAbstentionAnalytics,
  type AbstentionSignal,
} from "@/lib/stargazer/abstentionEngine";
import {
  evaluateNegativeCapability,
  buildNegativeCapabilityAnalytics,
  type NegativeCapabilityState,
} from "@/lib/stargazer/negativeCapability";
import {
  computeVerificationConstraints,
  applyClaimStrengthCap,
  buildHedgingPromptBlock,
  buildP15ConstraintAnalytics,
  computeHypothesisStats,
  type P15VerificationConstraints,
} from "@/lib/stargazer/verificationConstraints";
import {
  buildRevisionEntry,
  classifyValence,
  classifyAgency,
  detectNarrativeFreezing,
  buildNarrativeShiftPromptBlock,
  buildNarrativeLensAnalytics,
  type NarrativeRevision,
  type NarrativeFreezingAlert,
  type NarrativeWithHistory,
} from "@/lib/stargazer/narrativeLens";

import {
  detectBodySignals,
  computeMappingConfidence,
  classifyConfidenceLevel,
  buildBodyLensPromptBlock,
  buildBodyLensAnalytics,
  type BodyEmotionMapping,
  type DetectedBodySignal,
} from "@/lib/stargazer/bodyLens";

import {
  estimatePartsActivation,
  computePartsP15Override,
  buildPartsLensPromptBlock,
  buildPartsLensAnalytics,
  type PartsActivationState,
} from "@/lib/stargazer/partsLens";

import {
  computeEffectiveWeight,
  computeNarrativeRevisionCascade,
  applyMemoryPolicy,
  buildMemoryPolicyAnalytics,
  type MemoryEntry,
  type MemoryPolicyResult,
  type CascadeDecay,
} from "@/lib/stargazer/memoryPolicy";

import {
  computeAutoTransition,
  hdmPhaseToTrustLevel,
  getPhaseResponseDepth,
  resolveEffectiveDepth,
  detectRegressionSignal,
  computeRegression,
  orchestrateRegression,
  buildHdmPhaseAnalytics,
  gateLensPrompt,
  LENS_SURFACE_HINTS,
  DEFAULT_HDM_PHASE_STATE,
  type HdmPhaseState,
  type HdmPhaseInputs,
  type HdmPhaseAnalytics,
  type RegressionContext,
  type RegressionOrchestratorResult,
  type PhaseResponseDepth,
  evaluatePromotionReadiness,
  updateTrackingBuffers,
  type PromotionReadiness,
} from "@/lib/stargazer/hdmPhase";
import {
  isCounterfactualAllowed,
  resolveShiftDirection,
  validateCandidateSafety,
  buildCandidatePrompt,
  computeIntegrationDecision,
  buildCounterfactualPromptBlock,
  validateIntegratedOutput,
  type CounterfactualPartsContext,
  type PartIdentifier,
  type IntegrationDecision,
  type CounterfactualShiftDirection,
} from "@/lib/stargazer/counterfactualSimulation";
import {
  isRealityAnchoringAllowed,
  buildRealityAnchoringPromptBlock,
  buildRealityAnchoringAnalytics,
  detectAfterActionSignal,
  isPendingAnchoringActive,
  buildAfterActionPromptBlock,
  buildAnchoringSummary,
  type RealityAnchoringGateResult,
  type RealityAnchoringContext,
  type PendingRealityAnchoring,
  type AfterActionSignal,
} from "@/lib/stargazer/realityAnchoring";
import { SessionFactAccumulator, detectDrillDown } from "@/lib/stargazer/sessionContext";
import { validateAgainstContract, repairResponse, buildContractPromptBlock, getContract, type ContractValidation } from "@/lib/stargazer/outputContract";
import { runEpisodicRecall, type RecallResult } from "@/lib/stargazer/episodicRecall";
// Morning Protocol — Alter統合ハブ（Todo/予定/コーデ）
import {
  isMorningProtocolQuery,
  detectMorningIntent,
  buildSoftBridgeMessage,
  isSoftBridgeConfirm,
  createSession as createMorningSession,
  processMorningMessage,
} from "@/lib/alter-morning/morningProtocol";
import type { MorningSession, MorningProtocolResponse, PersonalityContext } from "@/lib/alter-morning/types";
// Comprehension-First v1.3+ Wave 3 (W3-PR-4) — flag-gated new pipeline
import { runMorningPipeline } from "@/lib/alter-morning/morningPipeline";
import { createLLMComprehensionProvider } from "@/lib/alter-morning/comprehension/llmComprehensionProvider";
import { createLLMNarrationProvider } from "@/lib/alter-morning/expression/llmNarrationProvider";
import { adaptPipelineToLegacy, buildFailedPipelineResult } from "@/lib/alter-morning/legacyAdapter";
// CEO/GPT 2026-05-02 PR B-5a: plan history persistence (fail-soft)
//   PR B-2c: fetchPreviousDayPlan で前日 plan を取得し Layer 2 inheritance に渡す
import { upsertPlanHistory, fetchPreviousDayPlan } from "@/lib/alter-morning/persistence/planHistory";
import { runShadowAndCompare } from "@/lib/alter-morning/op5";
// A1-5-8-2: Reality capture candidate surface（read-only・fail-open・gated・additive・実 LLM await なし）
//   pending captured seed/evidence を read-only consumption し、候補があれば morningProtocol.captureCandidate? を additive 追加。
//   flag default off / production hard block（gate）→ 完全 no-op。capture write（別 gate・別 GO）とは独立。
import { buildMorningCaptureSurface, resolveMorningProtocolCaptureFragment, type PendingCapturedRowsReadClient } from "@/lib/plan/reality/integration/morning-capture-surface.server";
import type { CaptureCandidateFragment } from "@/lib/plan/reality/integration/candidate-response-assembler";
// A1-5-9-0/1: Reality capture write（fire-and-forget・structured-only・flag gated・production hard block）
//   今回の発話から structured-only seed/evidence を capture（次回/後続の surface read で候補化）。default 両 flag off → no-op。
import { fireMorningCapture } from "@/lib/plan/reality/integration/alter-morning-capture-observe";
import type { RpcCapableClient } from "@/lib/plan/reality/integration/capture-rpc-adapter";
import { bindAnswerToSlot, bindOriginAnswer } from "@/lib/alter-morning/comprehension/answerBinder";
// W3-PR-8 rev 3 Commit 16: DialogState v2 lazy migration (wiring only / flag-gated dead code)
import { ensureSessionV1 } from "@/lib/alter-morning/dialog/ensureSessionV1";
// W3-PR-8 rev 3 Commit 17: DialogState v2 shadow pipeline (flag ON のみ、phase authority 不干渉)
import { ALTER_MORNING_FLAGS } from "@/lib/alter-morning/dialog/flags";
import { advanceDialogState } from "@/lib/alter-morning/dialog/shadowPipeline";
import type { DialogFocus } from "@/lib/alter-morning/dialog/types";
// W3-PR-8 rev 3 Commit 19: DialogState v2 user-facing runtime 昇格（flag ON のみ、phase authority 不干渉）
import { promoteDialogStateToUserFacing } from "@/lib/alter-morning/dialog/responsePromotion";
// W3-PR-8 rev 3 Commit 22: shadow pipeline へ渡す targetEventId の条件付き focus 継承
//   Branch B 再 comprehension が毎 turn 新 event_id を採番することによる
//   reducer.eventChanged 誤発火 → draft reset → narrowStep 逆行 を止める。
import { selectShadowTargetEventId } from "@/lib/alter-morning/dialog/shadowTargetEventId";
// fix/alter-morning-place-search-candidate-ui (CEO 2026-04-25 承認):
//   v1 planStateV2 → v2 dialogState の dispatch bridge。
//   morningProtocol が persistedEvents=null + missingFields に placeAsk を返す
//   ケースで TURN_CAPTURED が dispatch されず candidate UI が出ない問題を修正する。
//   segments → ComprehensionEvent[] を合成して既存 dispatch path に注入する。
import { buildSyntheticEventsFromPlanState } from "@/lib/alter-morning/dialog/syntheticEventBuilder";
// W3-PR-8 rev 3 Commit 23: phase=clarifying && items=0 の user 画面直前 gate
//   「同文 verbatim 再提示」「undecided ループ停滞」「semantic_miss 後の無為な再質問」を
//   世界観に沿った短い rephrase に差し替える pure helper。plan.items は触らない。
import { selectClarifyFallback } from "@/lib/alter-morning/dialog/selectClarifyFallback";
// W3-PR-8 rev 3 Commit 24: provider failure latch
//   pipeline throw (ai/run 総失敗) 時に reducer に PROVIDER_FAILED を流し、
//   streak≥1 で user-facing message を alter voice の degrade 文に差し替える。
//   phase / plan は触らない。次 turn 成功で PROVIDER_RECOVERED が streak=0 に戻す。
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import { reconcileDialogState } from "@/lib/alter-morning/planning/reconcileEffectiveEvents";
import { computeProviderLatch } from "@/lib/alter-morning/dialog/providerLatch";
import { orchestratePlacesHandoff } from "@/lib/alter-morning/search/placesHandoffOrchestrator";
// CEO/GPT 2026-05-03 PR B-3b'-2: journey_origin grounding (新 orchestrator)
// NOTE (forward-fix for #69 review): classifyLabel は legacyAdapter 側で intent 生成
//   時に使用される (= 責務分離)。route.ts は intent.classification を読むだけ。
import { orchestrateJourneyAnchorHandoff } from "@/lib/alter-morning/search/journeyAnchorHandoffOrchestrator";
// CEO/GPT 2026-05-03 PR B-3c-2: telemetry emit (PII フリー)
import {
  emitPromotionPresented,
  emitPromotionProviderFailure,
  emitPromotionZeroCandidates,
} from "@/lib/alter-morning/search/journeyOriginPromotionTelemetry";
import { resolveJourneyOriginGroundingFlagSource } from "@/lib/alter-morning/dialog/flags";
import {
  emitShadowStateEvent,
  emitHandoffOutcomeEvent,
} from "@/lib/alter-morning/search/handoffAnalytics";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_RESPONSE_LENGTH = 4000;
const VALID_MODES: AlterMode[] = ["warm", "provocative", "analytical", "parts"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMPLETE_ENDING_RE =
  /(には|とは|から|まで|だけ|でも|けど|ので|のに|ている|している|という|とか|より|なら|へ|を|に|が|は|で|と)$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * CEO/GPT 2026-05-02 PR B-2d-c: JST 固定の「実際の今日」(YYYY-MM-DD)。
 *
 * legacyAdapter の既存 `today` field は target plan date (= currentPlanDate) で、
 * 「実際の今日」とは別物。混同を避けるため `actualTodayYmdJst` を別 input として渡す。
 *
 * 命名で前提を明示: `Jst` suffix で JST 固定であることを示す。
 * user timezone / travel timezone / semantic date 解釈は PR B-4 (targetDate
 * time-aware) で扱う。本 PR の scope を超えるため、本関数は JST 固定のまま。
 *
 * 使い方:
 *   adaptPipelineToLegacy(pipelineResult, { actualTodayYmdJst: getActualTodayYmdJst() })
 *   → legacyAdapter で planDate !== actualTodayYmdJst なら current location を reject (not_today)
 */
function getActualTodayYmdJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function looksIncompleteAlterResponse(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  // 文末が句読点・括弧・疑問符で終わっていれば完了とみなす
  if (/[。！？?…」』】]$/.test(trimmed)) return false;
  // 非常に短くても句読点で終わっていなければ未完了（ただし閾値を緩和）
  if (trimmed.length <= 15) return true;
  return INCOMPLETE_ENDING_RE.test(trimmed);
}

function looksBrokenStoredAlterMessage(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const openingQuotes = (trimmed.match(/[「『（【]/g) ?? []).length;
  const closingQuotes = (trimmed.match(/[」』）】]/g) ?? []).length;
  if (openingQuotes > closingQuotes) return true;
  return looksIncompleteAlterResponse(trimmed);
}

function finalizeAlterResponse(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (looksIncompleteAlterResponse(trimmed)) return fallback;
  if (/[。！？?…」』】]$/.test(trimmed)) return trimmed;
  return `${trimmed} ...どう思う？`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CQ Double-Fail フォールバック — LLM 再生成が2回失敗した時の最終手段
// 文脈を読んで意図カテゴリを判定し、それに応じた自然な応答を返す。
// テンプレ的だが「ユーザーの直前の言葉」と「Alterの直前の言葉」を参照して
// 会話として最低限成立する応答を生成する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type AlterHistoryEntry = { role: string; content: string };

function buildContextAwareFallback(
  userMessage: string,
  conversationHistory: AlterHistoryEntry[],
): string {
  const msg = userMessage.trim();
  const lastAlter = [...conversationHistory]
    .reverse()
    .find((m) => m.role === "alter");
  const lastAlterText = lastAlter?.content?.trim() ?? "";

  // ── ユーザーの意図カテゴリを判定 ──

  // 1. 肯定応答（「はい」「うん」「そう」「そういうこと」「いいよ」）
  //    → Alterの直前発言を踏まえて前進させる
  const isAffirmation = /^(はい|うん|ええ|そう(だ(ね|よ)?)?|そういうこと|いい(よ|ね)|OK|ok|おk|分かった|わかった|了解|おけ|オッケー|りょ)[\s。！!、]*$/i.test(msg)
    || (msg.length <= 6 && /^(はい|うん|そう|いいよ|おk)/i.test(msg));

  // 2. 否定・批判（「違う」「おかしい」「それは違う」「いや」）
  //    → 謝罪＋聞き直し
  const isNegation = /^(いや|違う|ちがう|それは違|おかしい|なんか違|そうじゃな|そうじゃない|ちょっと違)/.test(msg)
    || /おかしい|間違[えっ]|ずれて/.test(msg);

  // 3. 能力外リクエスト（「検索して」「調べて」「WEBから」「持ってきて」）
  //    → 正直に能力境界を伝える
  const isCapabilityRequest = /検索して|調べて|ネットで|WEBから|ウェブから|持ってきて|画像|写真|リンク|URL|サイト|ググ/.test(msg);

  // 4. 挨拶・開始（「おはよう」「こんにちは」「ただいま」「おつかれ」）
  const isGreeting = /^(おはよう|こんにちは|こんばんは|ただいま|おつかれ|おかえり|ヤッホー|やあ|やぁ|ひさしぶり|久しぶり)/i.test(msg);

  // 5. 感情吐露（「つらい」「疲れた」「だるい」「やばい」「しんどい」）
  const isEmotionalVent = /つら[いく]|疲れ[たてる]|だる[いく]|やばい|しんど[いく]|むかつ|イライラ|不安|怖[いく]|泣[いき]|悲し|寂し|辛[いく]|嫌[だに]|最悪/.test(msg);

  // 6. 質問（「？」で終わる）
  const isQuestion = /[？?]\s*$/.test(msg);

  // 7. 情報提供・報告（「〜だった」「〜した」「〜があった」「〜だよ」）
  const isReport = /[たてる](よ|ね|んだ|の)?[\s。！!]*$/.test(msg) || /があった|だった|してきた|行ってきた/.test(msg);

  // ── 直前のAlter発言から文脈を抽出 ──
  const alterAskedQuestion = /[？?]\s*$/.test(lastAlterText);
  // Alterが質問してユーザーが答えた場合は、その回答を受け止めるのが最重要
  const alterKeyPhrase = (() => {
    if (!lastAlterText || lastAlterText.length < 5) return null;
    // Alterの最後の文を取得
    const sentences = lastAlterText.split(/[。！!？?\n]+/).filter((s) => s.trim().length > 3);
    const last = sentences[sentences.length - 1]?.trim();
    if (!last || last.length > 40) return null;
    return last.replace(/[？?。！!、\s]+$/, "").slice(0, 25);
  })();

  // ── カテゴリ別応答生成 ──

  if (isAffirmation) {
    // Alterが質問していた → 肯定回答として受け止めて次に進む
    if (alterAskedQuestion && alterKeyPhrase) {
      const opts = [
        `そっか、${alterKeyPhrase}ってことだね。もう少し聞いていい？ どんな感じだった？`,
        `なるほどね。じゃあ、それについてもう少し教えて。具体的にはどういうこと？`,
        `うん、わかった。${alterKeyPhrase}か。それ、いつ頃の話？`,
      ];
      return opts[Math.floor(Math.random() * opts.length)]!;
    }
    // Alterが質問してない → ユーザーの同意を受けて次の話題を引き出す
    const opts = [
      "うん、そうだね。他に何か気になってることある？",
      "了解。じゃあ、最近で一番印象に残ってることって何？",
      "わかった。他に話しておきたいことがあれば聞くよ。",
    ];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  if (isNegation) {
    const opts = [
      "ごめん、ちょっとずれてたね。もう一回聞かせてくれる？ どういうこと？",
      "あ、違ったか。ごめん。正しくはどういう感じ？",
      "すまん、読み違えた。もう少し詳しく教えてくれると助かる。",
    ];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  if (isCapabilityRequest) {
    return "ごめん、Web検索とかリンクの取得は今の僕にはできないんだ。ただ、知ってる範囲で考えることはできるから、気になってることがあれば聞いて。";
  }

  if (isGreeting) {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "おはよう。今日はどんな感じ？";
    if (hour >= 12 && hour < 17) return "やあ。午後はどんな予定？";
    if (hour >= 17 && hour < 23) return "おつかれ。今日はどんな1日だった？";
    return "おつかれ。遅い時間だね。何かあった？";
  }

  if (isEmotionalVent) {
    // 感情吐露 → まず受容、判断しない
    const emotionWord = msg.match(/つら[いく]|疲れ[たてる]|だる[いく]|やばい|しんど[いく]|むかつ|イライラ|不安|怖[いく]|泣[いき]|悲し|寂し|辛[いく]|嫌[だに]|最悪/)?.[0] ?? "";
    const opts = [
      `${emotionWord}か。それは大変だったね。何があったの？`,
      `そっか、${emotionWord}んだ。無理しなくていいよ。話せる範囲で教えて。`,
      `${emotionWord}って感じてるんだね。何かきっかけがあった？`,
    ];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  if (isQuestion) {
    // ユーザーが質問してきた → 正直に答えようとする姿勢
    const userQ = msg.replace(/[？?]+$/, "").trim();
    if (userQ.length > 3 && userQ.length <= 30) {
      return `${userQ}か。いい質問だね。正直、確信はないけど、一緒に考えてみようか。`;
    }
    return "面白い質問だね。ちょっと考えさせて。どういう文脈で気になった？";
  }

  if (isReport) {
    // ユーザーが出来事を報告 → 受け止め + 掘り下げ
    const shortMsg = msg.length > 25 ? msg.slice(0, 25).replace(/[。、！!？?\s]+$/, "") : msg.replace(/[。、！!？?\s]+$/, "");
    const opts = [
      `${shortMsg}か。それ、どう感じた？`,
      `へぇ、${shortMsg}んだ。詳しく聞いていい？`,
      `そうだったんだ。${shortMsg}って、良い意味？ それとも微妙？`,
    ];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  // ── デフォルト：Alterの直前発言があれば文脈接続、なければオープン ──
  if (alterAskedQuestion && alterKeyPhrase) {
    // Alterが質問してユーザーが何か答えた → 受け止めて掘り下げ
    const opts = [
      `なるほどね。${alterKeyPhrase}のこと、もう少し聞かせて。`,
      `うん、わかった。それってどういう気持ちから来てるの？`,
      `そっか。それ、結構大事なことだと思う。もうちょっと教えて。`,
    ];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  // 最終フォールバック — ユーザーの発言を短く引用して反応
  const shortRef = msg.length > 20 ? msg.slice(0, 20).replace(/[。、！!？?\s]+$/, "") : msg.replace(/[。、！!？?\s]+$/, "");
  if (shortRef.length >= 3) {
    const opts = [
      `${shortRef}か。もう少し聞かせて。どういうこと？`,
      `${shortRef}って、面白いね。もうちょっと詳しく教えて。`,
      `うん、${shortRef}ね。それってどういう背景があるの？`,
    ];
    return opts[Math.floor(Math.random() * opts.length)]!;
  }

  return "うん、聞いてるよ。もう少し教えてくれる？";
}

/**
 * GET /api/stargazer/alter
 * ユーザーの Alter パーソナリティと直近の対話セッションを取得。
 */
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();

    const [
      { data: profile },
      { data: dialogues },
      { data: resolvedTypeRow },
      { data: cfSnapshots },
    ] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_alter_dialogues")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, score")
        .eq("user_id", userId)
        .eq("observation_layer", "cognitive_fit")
        .order("observed_at", { ascending: false }),
    ]);

    // 軸スコアを構築（ベータテスターはデータ不足でも通過）
    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      isBetaTester,
    );

    // CognitiveFit 6軸をマージ（CFスコアが派生事実パイプラインに届くようにする）
    if (cfSnapshots && cfSnapshots.length > 0) {
      const cfLatest: Record<string, number> = {};
      for (const s of cfSnapshots) {
        if (!(s.axis_id in cfLatest)) {
          cfLatest[s.axis_id] = s.score;
        }
      }
      for (const [axis, score] of Object.entries(cfLatest)) {
        type TAK = import("@/lib/stargazer/traitAxes").TraitAxisKey;
        const key = axis as TAK;
        if (Math.abs(axisScores[key] ?? 0) < 0.001) {
          axisScores[key] = score;
        } else {
          axisScores[key] = axisScores[key] * 0.7 + score * 0.3;
        }
      }
    }

    // Alter パーソナリティを解決（データ不足でもフォールバックで会話可能にする）
    const archetype = resolveArchetype(axisScores);
    const observationDepth = calcObservationDepth(
      Number(profile?.total_sessions) || 0,
    );

    const alterInput: AlterInput = {
      archetypeCode: archetype.code,
      shadowCode: getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code,
      axisScores,
      observationDepth,
    };
    const personality = buildAlterPersonality(alterInput);

    // セッション別にグルーピング
    type DialogueRow = NonNullable<typeof dialogues>[number];
    const sessions: Record<
      string,
      { sessionId: string; messages: DialogueRow[]; latestAt: string }
    > = {};
    for (const d of dialogues ?? []) {
      const sid = d.session_id ?? "default";
      if (!sessions[sid]) {
        sessions[sid] = { sessionId: sid, messages: [], latestAt: d.created_at };
      }
      const sess = sessions[sid];
      if (sess) {
        sess.messages.push(d);
        if (d.created_at > sess.latestAt) {
          sess.latestAt = d.created_at;
        }
      }
    }

    const recentSessions = Object.values(sessions)
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
      .slice(0, 10);

    // Growth state の取得（セルフレポートの表示判定用）
    let growthInfo: {
      sessionsCompleted: number;
      trustLevel: number;
      coreWoundConfidence: number;
    } | null = null;
    try {
      const growth = await loadAlterGrowthState(userId);
      if (growth.sessionsCompleted > 0) {
        growthInfo = {
          sessionsCompleted: growth.sessionsCompleted,
          trustLevel: growth.trustLevel,
          coreWoundConfidence: growth.coreWoundConfidence,
        };
      }
    } catch {
      // Non-fatal: growth state not yet created
    }

    return NextResponse.json({
      ok: true,
      personality,
      recentSessions,
      growthInfo,
    });
  } catch (error) {
    console.error("Failed to get alter data:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/stargazer/alter
 * Alter にメッセージを送信し、レスポンスを受け取る。
 * Body: { sessionId?: string, message: string, mode?: string }
 */
export async function POST(req: NextRequest) {
  const routeStart = Date.now();
  let llmCallCount = 0;
  // P1.7: 全体レイテンシ分解トラッカー
  const latencyTracker: Record<string, number> = {};

  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      sessionId: rawSessionId,
      message: rawMessage,
      mode: requestedMode,
      action,
      source,
      homeContext: rawHomeContext,
      handoffContext,
      responseTimeMs: rawResponseTimeMs,
      _abTestDisablePerspective: abTestDisablePerspective,
      _abTestOverridePhase: abTestOverridePhase,
      _abTestOverrideTrust: abTestOverrideTrust,
      morningSession: rawMorningSession,
      softBridgePending: rawSoftBridgePending,
      currentLat: rawCurrentLat,
      currentLng: rawCurrentLng,
      // CEO/GPT 2026-05-02 PR B-2d-a: permission state contract
      permissionState: rawPermissionState,
      // CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating fields
      accuracy: rawAccuracy,
      capturedAt: rawCapturedAt,
    } = body as {
      sessionId?: string;
      message: unknown;
      mode?: string;
      action?: string;
      source?: string;
      homeContext?: HomeAlterContextData;
      handoffContext?: {
        whisper?: string;
        signal?: {
          extremeAxis?: { axis: string; label: string; score: number } | null;
          repeatingPattern?: { axis: string; label: string; dayCount: number } | null;
        };
        axisScores?: Record<string, number>;
      };
      responseTimeMs?: number;
      /** A/B テスト用: true で Perspective Engine を強制スキップ（dev only） */
      _abTestDisablePerspective?: boolean;
      /** A/B テスト用: PE の hdmPhase を強制オーバーライド（dev only） */
      _abTestOverridePhase?: number;
      /** A/B テスト用: PE の trustLevel を強制オーバーライド（dev only） */
      _abTestOverrideTrust?: number;
      /** Morning Protocol: クライアントから送信される進行中セッション状態 */
      morningSession?: {
        sessionId?: string;
        // W3-PR-5: v2 stickiness
        pipelineVersion?: "v2";
        phase: string;
        plan?: any;
        // P0-1: ターン間で保持する追加フィールド
        rawInputs?: string[];
        personalizeHints?: string[];
        parsedIntent?: any;
        sufficiency?: any;
        // v2: PlanState ラウンドトリップ
        planStateV2?: any;
        // baseline 由来キャッシュ（rawMorningSession!.userXxx 参照箇所が型要求）
        userPrefecture?: string;
        userCity?: string;
        userHomeLabel?: string | null;
        userHomeLat?: number | null;
        userHomeLng?: number | null;
        // W3-PR-7 Commit 2: answerBinder 用 round-trip
        pendingClarify?: import("@/lib/alter-morning/types").PendingClarify | null;
        persistedEvents?: import("@/lib/alter-morning/comprehension/eventSchema").Event[];
        // W3-PR-8 rev 3 commit 16: DialogState v2 round-trip 受け口（flag OFF 中は常に undefined）
        dialogState?: import("@/lib/alter-morning/dialog/types").DialogState | null;
      };
      /** Soft Bridge: 直前のAlter返答がSoft Bridge確認だったか */
      softBridgePending?: boolean;
      /**
       * CEO 2026-04-28 Option B: browser geolocation で取得した現在地座標。
       * adaptPipelineToLegacy → resolveHomeAnchor で home anchor の優先 1 として
       * 採用される。registered home (userHomeLat/Lng) より優先。
       * 取得不能なら null（さらに registered home もなければ travel item 不生成）。
       */
      currentLat?: number | null;
      currentLng?: number | null;
      /**
       * CEO/GPT 2026-05-02 PR B-2d-a: geolocation permission state contract
       *
       * 5 値 raw (granted / denied / prompt / unsupported / unavailable)。
       * legacyAdapter で homeAnchor=null のときの AnchorUnknownReason 決定に使う。
       * coords がある場合、permissionState に関係なく current location が採用される。
       *
       * 詳細: lib/alter-morning/journey/permissionState.ts
       */
      permissionState?: "granted" | "denied" | "prompt" | "unsupported" | "unavailable" | null;
      /**
       * CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating
       *
       * accuracy = pos.coords.accuracy (m)、容認しきい値 1000m。
       * capturedAt = new Date(pos.timestamp).toISOString() (cached position 対応)。
       * legacyAdapter の evaluateCurrentLocation で gate (低精度 / stale / not_today) 判定に使う。
       * いずれも optional (= legacy caller / 未取得時は省略)。
       */
      accuracy?: number | null;
      capturedAt?: string | null;
    };

    const isHomeAlter = source === "home";

    // Intent Pool: 選択された意図の追跡用（スコープを広げて analytics セクションからも参照可能にする）
    let selectedClarifyIntent: SelectedIntent | null = null;
    let selectedRouteCIntent: SelectedIntent | null = null;
    // Wound Activation: 傷の活性化状態（MI抑制・Route C回避・protect_pressure加算に使用）
    let woundActivationResult: WoundActivationResult | null = null;
    // Financial Pressure: 経済的プレッシャー（cost_load加算・高コスト提案抑制に使用）
    let financialPressure: FinancialPressure | null = null;
    // Context Modifiers: ドメイン別軸スコア調整結果
    let contextualizedScores: ContextualizedAxisScores | null = null;

    // ━━━━ end_session action: summarize and save ━━━━
    if (action === "end_session") {
      const sessionId = isUuid(rawSessionId) ? rawSessionId : null;
      if (!sessionId) {
        return NextResponse.json(
          { error: "有効な sessionId が必要です" },
          { status: 400 },
        );
      }

      const supabase = await supabaseServer();
      const { data: dialogues } = await supabase
        .from("stargazer_alter_dialogues")
        .select("role, message, alter_mode, created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (!dialogues || dialogues.length < 4) {
        return NextResponse.json({
          ok: true,
          summarized: false,
          reason: "対話が短すぎるため要約をスキップしました",
        });
      }

      const messages = dialogues.map((d) => ({
        role: d.role as string,
        content: d.message as string,
        mode: d.alter_mode as string | undefined,
      }));

      const summary = await summarizeAlterSession(messages, userId);
      if (!summary) {
        return NextResponse.json({
          ok: true,
          summarized: false,
          reason: "要約の生成に失敗しました",
        });
      }

      summary.sessionId = sessionId;
      const saved = await saveAlterSessionSummary(userId, summary);

      // Growth state の更新
      let selfReport: string | null = null;
      let letterGenerated = false;
      try {
        const updatedGrowth = await updateAlterGrowth(
          userId,
          summary,
          messages,
        );

        // ━━━━ Alter → Stargazer 信号パイプライン ━━━━
        // Alter 会話から観測された特性信号を Stargazer の axis_snapshots に反映
        syncAlterSignalsToStargazer(userId, updatedGrowth, summary).catch((e) => {
          console.warn("[alter] Stargazer signal pipeline failed (non-fatal):", e);
        });

        // 5セッションごとのセルフレポート生成
        selfReport = await generateAlterSelfReport(updatedGrowth, userId);

        // ━━━━ Alterからの手紙: 5セッションごとに自動生成 ━━━━
        const sessionsCompleted = updatedGrowth.sessionsCompleted ?? 0;
        const lastLetterSession = await getLastLetterSessionCount(userId);
        if (await shouldGenerateLetter(sessionsCompleted, lastLetterSession)) {
          try {
            // 最近の観測データを取得
            const supabaseForObs = await supabaseServer();
            const { data: recentObs } = await supabaseForObs
              .from("stargazer_observations")
              .select("axis_key, answer_text, created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(10);
            const observations = (recentObs ?? []).map((o) =>
              `${o.axis_key}: ${o.answer_text}`
            );
            const letter = await generateAlterLetter({
              userId,
              sessionCount: sessionsCompleted,
              alterGrowthState: updatedGrowth,
              recentObservations: observations,
              previousLetters: [],
            });
            if (letter) {
              await saveAlterLetter(letter);
              letterGenerated = true;
              console.info("[alter] Letter generated for session", sessionsCompleted);
            }
          } catch (letterErr) {
            console.warn("[alter] Letter generation failed (non-fatal):", letterErr);
          }
        }
      } catch (e) {
        console.warn("[alter] Growth update failed (non-fatal):", e);
      }

      return NextResponse.json({
        ok: true,
        summarized: saved,
        summary: saved
          ? {
              keyThemes: summary.keyThemes,
              emotionalArc: summary.emotionalArc,
              messageCount: summary.rawMessageCount,
            }
          : null,
        selfReport,
        letterGenerated,
      });
    }

    // メッセージ検証
    if (!rawMessage || typeof rawMessage !== "string") {
      return NextResponse.json(
        { error: "message は必須です" },
        { status: 400 },
      );
    }

    const message = truncateString(rawMessage.trim(), MAX_MESSAGE_LENGTH);
    if (message.length === 0) {
      return NextResponse.json(
        { error: "message が空です" },
        { status: 400 },
      );
    }

    // ━━━━ Daily rally limit (5 per day, JST reset) ━━━━
    // β テスターは制限なし。clarify は非消費（Alter 側の都合で聞いているため）。
    if (isHomeAlter && !isBetaTester) {
      const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayJST = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
      // JST 0:00 = UTC 15:00 previous day
      const jstDayStartUTC = new Date(`${todayJST}T00:00:00+09:00`).toISOString();

      // clarify を除外してカウント: emotional_context->response_mode が "clarify" でないものだけ数える
      const { data: todayDialogues, error: countErr } = await supabase
        .from("stargazer_alter_dialogues")
        .select("id, emotional_context")
        .eq("user_id", userId)
        .eq("role", "alter")
        .gte("created_at", jstDayStartUTC);

      if (!countErr && todayDialogues) {
        const consumedCount = todayDialogues.filter((d) => {
          const ctx = d.emotional_context as any;
          return ctx?.response_mode !== "clarify";
        }).length;

        if (consumedCount >= 5) {
          return NextResponse.json(
            { error: "daily_limit_reached", remaining: 0, limit: 5 },
            { status: 429 },
          );
        }
      }
    }

    // sessionId: UUID format required by DB column
    const sessionId = isUuid(rawSessionId)
      ? rawSessionId
      : crypto.randomUUID();

    // ユーザーデータを取得
    const [
      { data: profile },
      { data: resolvedTypeRow },
      { data: existingDialogues },
      { data: cfSnapshots },
    ] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_alter_dialogues")
        .select("role, alter_mode, message, created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, score")
        .eq("user_id", userId)
        .eq("observation_layer", "cognitive_fit")
        .order("observed_at", { ascending: false }),
    ]);

    // 軸スコアを構築（ベータテスターはデータ不足でも通過）
    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      isBetaTester,
    );

    // CognitiveFit 6軸をマージ（CFスコアが派生事実パイプラインに届くようにする）
    if (cfSnapshots && cfSnapshots.length > 0) {
      const cfLatest: Record<string, number> = {};
      for (const s of cfSnapshots) {
        if (!(s.axis_id in cfLatest)) {
          cfLatest[s.axis_id] = s.score;
        }
      }
      for (const [axis, score] of Object.entries(cfLatest)) {
        type TAK = import("@/lib/stargazer/traitAxes").TraitAxisKey;
        const key = axis as TAK;
        if (Math.abs(axisScores[key] ?? 0) < 0.001) {
          axisScores[key] = score;
        } else {
          axisScores[key] = axisScores[key] * 0.7 + score * 0.3;
        }
      }
    }

    if (!hasEvidence) {
      return NextResponse.json(
        { error: "観測データが不足しています" },
        { status: 400 },
      );
    }

    const archetype = resolveArchetype(axisScores);
    const observationDepth = calcObservationDepth(
      Number(profile?.total_sessions) || 0,
    );

    const alterInput: AlterInput = {
      archetypeCode: archetype.code,
      shadowCode: getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code,
      axisScores,
      observationDepth,
    };
    let personality = buildAlterPersonality(alterInput);

    // 会話履歴を構築
    const conversationHistory: AlterMessage[] = (existingDialogues ?? [])
      .map((d) => ({
        role: d.role as "alter" | "user",
        content: d.message as string,
        mode: (d.alter_mode as AlterMode) ?? "warm",
        timestamp: d.created_at,
      }))
      .filter((message) => message.content.trim().length > 0)
      .filter(
        (message) =>
          message.role !== "alter" ||
          !looksBrokenStoredAlterMessage(message.content),
      );

    const conversationDepth = conversationHistory.length;

    // --- Long-term memory + behavioral evidence + growth state integration ---
    let pastSummaries: Awaited<ReturnType<typeof loadAlterSessionSummaries>> = [];
    let contradictionHint: string | null = null;
    let behavioralEvidence: AlterBehavioralEvidence[] = [];
    let longTermMemory: Awaited<ReturnType<typeof buildMemoryContext>> | undefined;
    let growthState: Awaited<ReturnType<typeof loadAlterGrowthState>> | undefined;
    let episodicRecallResult: RecallResult | null = null;
    let episodicRecallLatencyMs = 0;
    try {
      const episodicRecallStart = Date.now();
      const [summaries, patterns, memory, growth, episodicResult] = await Promise.all([
        loadAlterSessionSummaries(userId, 10),
        fetchPatternsForUser(supabase, userId).catch(() => []),
        buildMemoryContext(userId, 20).catch(() => undefined),
        loadAlterGrowthState(userId).catch(() => undefined),
        runEpisodicRecall(message, userId).catch((e) => {
          console.warn("[episodic-recall] Failed (fail-open):", e);
          return null;
        }),
      ]);
      episodicRecallLatencyMs = Date.now() - episodicRecallStart;
      pastSummaries = summaries;
      longTermMemory = memory;
      growthState = growth;
      episodicRecallResult = episodicResult;
      if (pastSummaries.length > 0) {
        contradictionHint = await detectCrossSessionContradiction(
          message,
          pastSummaries,
        );
      }
      if (patterns.length > 0) {
        const ahaInsights = await selectAhaInsights(patterns, "alter", 5);
        behavioralEvidence = ahaInsights.map((i) => ({
          formattedForTarget: i.formattedForTarget,
          patternType: i.patternType,
          confidence: i.confidence,
          axisId: i.axisId,
        }));
      }
    } catch (e) {
      console.warn("[alter] Memory/pattern/growth context load failed (non-fatal):", e);
    }

    // モードを決定 -- readiness ベースの適応型モード選択
    let mode: AlterMode;
    if (requestedMode && VALID_MODES.includes(requestedMode as AlterMode)) {
      mode = requestedMode as AlterMode;
    } else if (growthState && conversationDepth >= 2) {
      // readiness ベースのモード選択
      const readiness = await detectReadiness(
        message,
        conversationHistory.map((m) => ({ role: m.role, content: m.content })),
        growthState,
      );
      const emotionalIntensity = readiness; // readiness はおおよそ感情的関与度と相関
      const trustLevel = growthState.trustLevel;
      const currentMode = conversationHistory.length > 0
        ? (conversationHistory[conversationHistory.length - 1]!.mode ?? "warm")
        : "warm";
      const optimal = calculateOptimalMode(
        currentMode,
        conversationDepth,
        emotionalIntensity,
        trustLevel,
        !!contradictionHint,
      );
      mode = optimal.mode;
    } else {
      mode = selectAlterMode(observationDepth, conversationDepth);
    }

    // Alter のレスポンスを AI で生成（失敗時はテンプレートにフォールバック）
    let alterResponseText = "";
    let homeDecisionMeta: DecisionMetadata | null = null;
    let queryContext: QueryContext | null = null;
    let relationalLens: RelationalLens | null = null;
    let responseMode: ResponseMode = "conclude";
    let modeDecisionReason: ModeDecisionReason = "conclude_low_ambiguity";
    let detectedReaction: Reaction | null = null; // P1-C: リアクション分類結果（analytics用）
    let questionType: QuestionType = "judgment"; // P1-A: 5タイプルーター結果（analytics用にホイスト）
    let initialQuestionType: QuestionType | undefined; // override追跡用
    let initialDomain: QueryDomain | undefined; // override追跡用
    let followUpType: FollowUpType = null; // Phase 9: follow-up continuity
    let inheritedDomain: QueryDomain | undefined; // Phase 9: 前ターンから継承したドメイン
    let isFatigue = false; // Phase 9: 疲労検出フラグ
    let questionCategory: QuestionCategory | null = null;
    let followupInsight = "";
    // Understanding System (Layer 2: State)
    let userState: UserState | null = null;
    let stateAdjustment: StateForceAdjustment | null = null;
    // Micro Insight Engine
    let microInsight: MicroInsightCandidate | null = null;
    // 5層品質防御
    let lensDetailed: RelationalLensDetailed | null = null;
    let inputUnderstanding: InputUnderstanding | null = null;
    let judgmentSkeleton: JudgmentSkeleton | null = null;
    let qualityCheck: ConsistencyCheck | null = null;
    let auditTrail: AuditTrail | null = null;
    // Phase 5: 継続的検証
    let hypothesesInjectedCount = 0;
    // Session Context: 3-layer fact accumulator
    const sessionFactAccumulator = new SessionFactAccumulator();
    // Populate session facts from all prior user messages in this conversation
    const userMessages = conversationHistory.filter(m => m.role === "user").map(m => m.content);
    userMessages.forEach((msg, i) => sessionFactAccumulator.addTurn(msg, i));
    // Add current message
    sessionFactAccumulator.addTurn(message, userMessages.length);
    let contractValidationResult: ContractValidation | null = null;
    let creepinessCheck: ReturnType<typeof checkCreepinessLine> | null = null;
    // D: MI 頻度制限
    let lastInsightPresentedAt: Date | null = null;
    let recentDenyIgnoreStreak = 0;
    let insightSuppressedReason = "";
    let insightPresented = false;
    // P5: ベースラインズレ由来の追加シグナル
    let baselineSignals: MicroSignal[] = [];
    let contradictedTopics: string[] = [];
    let crossSessionResult: CrossSessionConvergenceResult | null = null;
    let relationshipCtx: RelationshipContext | null = null;
    let lifeCtx: LifeContext | null = null;
    // P1.5 Thin-Slice: ホイスト変数
    let thinSliceActive = false;
    let thinSliceState: ThinSliceSessionState = { last_bet: null, last_bet_outcome: null, rejected_bets: [], accepted_bets: [], bet_history: [], consecutive_misses: 0, consecutive_same_bet_count: 0 };
    let turnValue: TurnValueAssessment = { budget: "standard", reason: "not_home_alter", invoke_insight: false };
    let thinSliceInsight: GeneratedInsight | null = null;
    let thinSliceBet: SharpBet | null = null;
    let thinSliceClaim: ClaimDecision | null = null;
    let thinSliceBetOutcome: BetOutcome | null = null;
    // v4.2 FULL: パイプライン変数
    let v42Signal: TurnSignal | null = null;
    let v42SelfModel: LivingSelfModel | null = null;
    let v42Arena: WinningInterpretation | null = null;
    let v42ArenaHistory: InterpretationLensId[] = [];
    let v42Role: RoleSelection | null = null;
    let v42Compliance: ComplianceCheckResult | null = null;
    let v42SemanticBanCheck: SemanticBanCheck | null = null;
    let v42RallyCritic: RallyCriticResult | null = null;
    // Output Governance Layer: ホイスト変数
    let govUserBans: UserBan[] = [];
    let govFrustration: FrustrationState = { level: 0, triggers: [], unresolved_requests: [], repeated_correction_count: 0 };
    let govUserBanViolation: UserBanViolation | null = null;
    // Proactive Understanding Engine: ホイスト変数
    let proactiveOutput: ProactiveEngineOutput | null = null;
    // P0/P3/P5: ホイスト変数（Home Alter 内の複数ブロックで共有）
    let alterSessionCount = 0;
    let baselineDeviationsFull: BaselineDeviation[] = [];
    // P0観測配線: judgment engine 内の変数を外部スコープに引き上げ
    let p0ContextEntriesLoaded = 0;
    let p0ValidationFailures: string[] = [];
    let p0DiscreteTrustLevel = 0;
    let trustResult: import("@/lib/stargazer/alterUnderstanding").TrustLevelResult | null = null;
    // P1: 検証層（HDM v1）
    let p1RuptureAssessment: RuptureAssessment | null = null;
    let p1AbstentionSignal: AbstentionSignal | null = null;
    let p1NegCapState: NegativeCapabilityState | null = null;
    // P1.5: 検証層の構造的制約（P1 出力を responseMode / claimStrength / hedging に反映）
    let p15Constraints: P15VerificationConstraints | null = null;
    // P2-1: Narrative Lens（意味づけの変化追跡）
    let p2NarrativeRevision: NarrativeRevision | null = null;
    let p2NarrativeFreezing: NarrativeFreezingAlert | null = null;
    // P2-2: Body Lens（身体→感情構築パターン）
    let p2BodySignals: DetectedBodySignal[] = [];
    let p2BodyMappings: BodyEmotionMapping[] = [];
    let p2BodyPromptInjected = false;
    // P2-3: Parts Lens（パート力学 — per-turn activation state）
    let p2PartsState: PartsActivationState | null = null;
    // P2-4: Memory Policy（記憶のライフサイクル管理）
    let p2MemoryPolicyResult: MemoryPolicyResult | null = null;
    let p2CascadeDecays: CascadeDecay[] = [];
    // P3: HDM Phase Controller（Heart Dynamics Model v1 フェーズ制御）
    let p3HdmPhaseState: HdmPhaseState = { ...DEFAULT_HDM_PHASE_STATE };
    let hdmPhaseAtLoad = 0; // DBロード時のPhase（招待ポイント遷移検出用）
    let hdmStateDirty = false; // 1ターン内の変更を最後に一括書き込み
    let p3HdmPhaseAnalytics: HdmPhaseAnalytics | null = null;
    let p3EffectiveDepth: PhaseResponseDepth | null = null;
    // Heart Integration
    let heartStateAnalytics: import("@/lib/stargazer/heartIntegration").HeartStateAnalytics | null = null;
    // Personalization Tracking (Wall 1+6)
    let personalizationResult: PersonalizationTrackingResult | null = null;
    // Session Diff (Wall 5)
    let sessionDiffAnalytics: SessionDiffAnalytics | null = null;
    // P4: Counterfactual Live Integration
    let p4LiveIntegrated = false;
    let p4Decision: IntegrationDecision | null = null;
    let p4InjectedText: string | null = null;        // adopted の finalText（post-check 用）
    let p4InjectedCandidateRaw: string | null = null; // 元 candidateText（完全一致検出用）
    // P5: Reality Anchoring
    let p5GateResult: RealityAnchoringGateResult | null = null;
    let p5Injected = false;
    // P5-3: After-Action Loop
    let p5AfterActionSignal: AfterActionSignal | null = null;
    let p5AfterActionInjected = false;
    // Stage 1: Shadow Promotion Recommendation
    let promotionReadiness: PromotionReadiness | null = null;
    let p5AfterActionPromptBlock: string | null = null;
    // R3-#4: コンテキスト注入ログ（外部スコープに引き上げ）
    let ctxLoaded = 0;
    let ctxUsed = 0;
    const ctxDroppedReasons: string[] = [];
    // Gemini一次読解（Phase 0）: null = 読解未実施 or 失敗（graceful degradation）
    let utteranceReading: UtteranceReading | null = null;
    let utteranceReadingLatencyMs = 0;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HOME ALTER: 完全に別フロー（挨拶なし、判断特化、検査+再生成）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 派生事実セット: Deep Alter branch内で生成、analytics insertで参照
    let derivedFactSet: import("@/lib/stargazer/derivedFactGenerator").DerivedFactSet | undefined;
    // Perspective Engine: 外部視点統合（v6: PerspectiveEngineResult top-level fields）
    let peResult: PerspectiveEngineResult | null = null;
    // Legacy vars — backward compat for analytics + gradual migration. Will be removed.
    let perspectiveAudit: PerspectiveAudit | null = null;
    let perspectiveBlock: PerspectiveBlock | null = null;
    let perspectiveLatency: PerspectiveLatencyBreakdown | null = null;
    let perspectiveQualityGate: QualityGateResult | null = null;
    let perspectiveSearchTask: SearchTaskClassification | null = null;
    let perspectiveExplorationState: ExplorationState | null = null;
    let perspectiveExplorationTemplate: ExplorationOutputTemplate | null = null;
    // Morning Protocol: 外部スコープに引き上げ（response objectで参照するため）
    let morningSession: MorningSession | undefined;
    let morningResponse: MorningProtocolResponse | undefined;
    // Soft Bridge: レスポンスでフラグを返すため外部スコープ
    let isSoftBridgeResponse = false;
    // CEO 2026-04-28 PR #41a Commit 6 (修正): trace snapshot を **response 構築位置**
    //   (L9847+) で参照するため、外部スコープで宣言する。旧版は morningIntent="strong"
    //   block 内で let していたため、ブロック外の response 合成で ReferenceError → 500。
    //   shouldEmitTrace() === true (preview / development) でのみ non-null。
    let lastTraceSnapshot:
      | import("@/lib/alter-morning/trace/turnTrace").TurnTracePayload
      | null = null;
    // OP-5.4.2.4-d: shadow path 用 LLM targetDate provenance capture
    //   各 v2 / v1 path block で代入し、 final runShadowAndCompare へ渡す。
    //   default null = shadow へ何も伝えない (= 既存 behavior 維持)。
    let shadowLlmTargetDate: string | null = null;
    let shadowLlmTargetDateProvenance:
      | import("@/lib/alter-morning/comprehension/eventSchema").Provenance
      | null = null;
    if (isHomeAlter) {
      // ── P1.5 Thin-Slice: Feature Flag + State Reconstruction ──
      thinSliceActive = isThinSliceEnabled(userId);
      if (thinSliceActive) {
        thinSliceState = await reconstructThinSliceState(supabase, userId, sessionId);
      }

      // ━━━━ P1.7: ユーザー表示名 + ベースラインコンテキストを並列取得 ━━━━
      // 4つの独立したDBクエリを Promise.allSettled で並列実行（6-9秒→~2秒）
      let userName: string | undefined;
      let baselineCtx: BaselineContext | null = null;
      let userPrefecture: string | undefined;
      let userCity: string | undefined;
      let userHomeLabel: string | null | undefined;
      let userHomeLat: number | null | undefined;
      let userHomeLng: number | null | undefined;
      const [authResult, baselineResult, rvResult, lpResult] = await Promise.allSettled([
        // (1) auth.getUser
        supabase.auth.getUser(),
        // (2) ④-C: profiles ベースライン + baseline_home (2026-04-19)
        supabase.from("profiles").select("gender, date_of_birth, prefecture, city, baseline_home_label, baseline_home_lat, baseline_home_lng").eq("id", userId).maybeSingle(),
        // (3) ④-D: rendezvous_profiles 関係性ベースライン
        supabase.from("rendezvous_profiles").select("profile_details, enabled_categories, updated_at").eq("user_id", userId).maybeSingle(),
        // (4) ④-E: life_profile_entries 値・情熱・キャリア
        supabase.from("life_profile_entries").select("category, title").eq("user_id", userId).in("category", ["values", "passions", "career"]).eq("active", true),
      ]);
      // (1) userName 抽出
      if (authResult.status === "fulfilled") {
        try {
          const meta = authResult.value?.data?.user?.user_metadata;
          const raw = String(meta?.display_name ?? meta?.name ?? "").trim();
          if (raw && raw !== "User") userName = raw;
        } catch { /* Non-fatal */ }
      }
      // (2) baselineCtx 抽出
      if (baselineResult.status === "fulfilled") {
        try {
          const baselineRow = baselineResult.value?.data;
          if (baselineRow && (baselineRow.gender || baselineRow.date_of_birth || baselineRow.prefecture)) {
            baselineCtx = deriveBaselineContext({
              gender: baselineRow.gender ?? undefined,
              dateOfBirth: baselineRow.date_of_birth ?? undefined,
              prefecture: baselineRow.prefecture ?? undefined,
            });
          }
          // Morning Protocol 用: baseline 住所をセッションに注入
          if (baselineRow?.prefecture) userPrefecture = baselineRow.prefecture;
          if (baselineRow?.city) userCity = baselineRow.city;
          // 2026-04-19: baseline_home (label + lat/lng cache) を注入
          if (baselineRow?.baseline_home_label != null) {
            userHomeLabel = baselineRow.baseline_home_label as string;
          }
          if (baselineRow?.baseline_home_lat != null) {
            userHomeLat = Number(baselineRow.baseline_home_lat);
          }
          if (baselineRow?.baseline_home_lng != null) {
            userHomeLng = Number(baselineRow.baseline_home_lng);
          }
        } catch { /* Non-fatal */ }
      }
      // (3) relationshipCtx 抽出
      if (rvResult.status === "fulfilled") {
        try {
          const rvRow = rvResult.value?.data;
          if (rvRow) {
            const details = (rvRow.profile_details as Record<string, unknown>) ?? {};
            const categories = Array.isArray(rvRow.enabled_categories) ? rvRow.enabled_categories as string[] : [];
            relationshipCtx = deriveRelationshipContext({
              marriageIntent: (details.marriageIntent as string) || null,
              childrenPreference: (details.childrenPreference as string) || null,
              smokingStatus: (details.smokingStatus as string) || null,
              smokingTolerance: (details.smokingTolerance as string) || null,
              lifestyleMorningNight: typeof details.lifestyleMorningNight === "number" ? details.lifestyleMorningNight : null,
              enabledCategories: categories,
              updatedAt: (rvRow.updated_at as string) || null,
            });
            if (relationshipCtx.hasRelationshipBaseline) {
              console.info(`[relationship-baseline] loaded: intent=${relationshipCtx.relationshipIntent}, parenting=${relationshipCtx.parentingOpenness}, lifestyle=${relationshipCtx.lifestyleAlignment}`);
            }
          }
        } catch { /* Non-fatal */ }
      }
      // (4) lifeCtx 抽出
      if (lpResult.status === "fulfilled") {
        try {
          const lpRows = lpResult.value?.data;
          if (lpRows && lpRows.length > 0) {
            const byCategory = (cat: string) => lpRows.filter((r: { category: string; title: string }) => r.category === cat).map((r: { category: string; title: string }) => r.title);
            lifeCtx = deriveLifeContext({
              values: byCategory("values"),
              passions: byCategory("passions"),
              career: byCategory("career"),
            });
          }
        } catch { /* Non-fatal */ }
      }

      // 質問カテゴリ分類（行動カテゴリ: gathering/outfit/contact/work/cause/general）
      questionCategory = classifyQuestion(message);
      // P1-A: 5タイプルーター（意図の種類: emotional/self_understanding/knowledge/strategy/judgment）
      questionType = classifyQuestionType(message);
      latencyTracker.dbInitMs = Date.now() - routeStart; // P1.7: DB初期化完了

      // ── Conversational mode: 直近に会話的ターンがあれば judgment を conversation に昇格 ──
      // 「会話しにきたよ」→ 次のメッセージが judgment に落ちるのを防ぐ
      // Block 1: ユーザーメッセージの再分類 + Alterの質問検出（直近6メッセージ）
      if (questionType === "judgment" && conversationHistory.length >= 2) {
        const recentWindow = conversationHistory.slice(-6); // 拡張: 4→6（約3往復）
        const recentUserTypes = recentWindow
          .filter(m => m.role === "user")
          .map(m => classifyQuestionType(m.content));
        const hasRecentConversationalTurn = recentUserTypes.some(t =>
          t === "chat_opening" || t === "conversation" || t === "ask_me"
        );
        // Alter が質問で応答している = Q&Aフローが続いている
        const alterAskedRecently = recentWindow
          .filter(m => m.role === "alter")
          .some(m => /[？?]/.test(m.content));
        // 判断キーワードが明示的にない場合のみ昇格
        const hasExplicitJudgmentIntent = /べき[？?]?|した方がいい|どう[すし]れば|どうした方|どっちが/.test(message);
        // planning / daily_guidance 意図がある場合は conversation に昇格しない → analyzeQueryContext で daily_guidance に入る
        const hasPlanningIntent = /明日|明後日|あした|あさって|来週|週末|午後|今日.*何[すし]|何から|何すれば|何したら|何やろう|予定/.test(message);
        // recommendation / knowledge 意図がある場合も conversation に昇格しない
        // 「合ってる趣味って何？」「おすすめの本ある？」等は回答品質が重要
        const hasRecommendationIntent = /合って[るい]|おすすめ|適して|向いて|ぴったり|教えて(?!ほしい)|何がいい|何かある[？?]|何か(?:ない|ある)|紹介/.test(message);
        // PE Fix: 明示的検索要求（「調べて」「WEBから」等）は conversation に昇格させない
        // 昇格すると direct_response + conversationBlock が PE 出力を完全に上書きする
        const hasExplicitSearchIntent = detectExplicitSearchIntent(message);
        if ((hasRecentConversationalTurn || alterAskedRecently) && !hasExplicitJudgmentIntent && !hasPlanningIntent && !hasRecommendationIntent && !hasExplicitSearchIntent) {
          questionType = "conversation";
          console.info(`[conversational-mode] judgment → conversation (recent conversational turn detected, userTypes=${recentUserTypes.join(",")}, alterAsked=${alterAskedRecently})`);
        }
        if (hasExplicitSearchIntent && (hasRecentConversationalTurn || alterAskedRecently)) {
          console.info(`[conversational-mode] Explicit search intent detected → keeping ${questionType} (skipping conversation override)`);
        }
      }

      // ── ask_me sticky mode: Alter が質問を投げた直後のユーザー応答を judgment に落とさない ──
      // Block 2（Block 1 のフォールバック）: 直前Alterメッセージが？で終わるかチェック
      // PE Fix: 明示的検索要求は ask-me-sticky でも conversation に昇格させない
      if (questionType === "judgment" && conversationHistory.length >= 1) {
        const lastMsg = conversationHistory[conversationHistory.length - 1];
        const lastAlterText = lastMsg?.role === "alter" ? lastMsg.content : null;
        const stickySearchGuard = detectExplicitSearchIntent(message);
        if (shouldStickyConversation(message, lastAlterText) && !stickySearchGuard) {
          questionType = "conversation";
          console.info(`[ask-me-sticky] judgment → conversation (user is answering Alter's question, ${message.trim().length} chars)`);
        }
        if (stickySearchGuard && shouldStickyConversation(message, lastAlterText)) {
          console.info(`[ask-me-sticky] Explicit search intent → keeping ${questionType} (skipping sticky override)`);
        }
      }

      // ── ask_me_redirect: 質問差し替え要求の検出 ──
      // 「違う質問にして」「難しいな」等 → ask_me として処理するが、lighter prompt を使う
      // 直前のAlterが質問（ask_me応答）を出していた場合のみ発動
      let isRedirectMode = false;
      if (isAskMeRedirect(message)) {
        const lastMsg = conversationHistory[conversationHistory.length - 1];
        const lastAlterHadQuestion = lastMsg?.role === "alter" && /[？?]/.test(lastMsg.content);
        if (lastAlterHadQuestion) {
          questionType = "ask_me";
          isRedirectMode = true;
          console.info(`[ask-me-redirect] Detected question redirect request: "${message.trim().slice(0, 30)}"`);
        }
      }

      initialQuestionType = questionType; // override追跡用

      // ── Ambiguity Engine: ドメイン検出 + 曖昧性解析 + 応答モード選択 ──
      queryContext = analyzeQueryContext(message);
      initialDomain = queryContext.domain; // override追跡用

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // MORNING PROTOCOL: Alter統合ハブ（Todo/予定/コーデ）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Morning Protocolはdaily_guidanceの上位概念。
      // 具体的なタスク/予定管理 → Morning Protocol
      // 抽象的な「今日どうしよう」 → 既存Daily Guidance
      // morningSession / morningResponse は外部スコープで宣言済み

      // クライアントから進行中のMorningSessionを復元
      const hasExistingMorningSession = rawMorningSession?.phase &&
        !["completed", "skipped"].includes(rawMorningSession.phase);

      // P2 routing lock (CEO 2026-04-17):
      // Morning session が plan_presented / clarifying 中の発話は本質的に
      // 「プラン編集/確認」以外ありえない。PE や汎用 Alter 判断ルートに
      // 漏れると「判断質問」扱いで返答が崩れるため、
      //  - queryContext.domain を daily_guidance に寄せ（最も近い既存ドメイン）
      //  - ambiguity_score を 0 に落として clarify/branch 昇格を抑止
      //  - questionType を conversation に固定（judgment/ask_me/PE 派生を遮断）
      //  - responseMode を direct_response に固定（Alter 返答を morning protocol の
      //    生成文字列でそのまま返す経路を維持）
      // ※ 下流の morning protocol 自体は hasExistingMorningSession により
      //    常に strong intent で発火済。この lock は「万一 morning を抜けて
      //    通常パイプラインに落ちた場合の保険」+「同ターン内の PE/判断側副作用防止」。
      if (
        hasExistingMorningSession &&
        (rawMorningSession!.phase === "plan_presented" ||
          rawMorningSession!.phase === "clarifying")
      ) {
        queryContext = {
          ...queryContext,
          domain: "daily_guidance",
          ambiguity_score: 0,
        };
        questionType = "conversation";
        responseMode = "direct_response";
        modeDecisionReason = "conclude_low_ambiguity";
        console.info(
          `[morning-protocol] routing lock: phase=${rawMorningSession!.phase} → domain=daily_guidance, questionType=conversation, responseMode=direct_response`,
        );
      }

      // 3段階判定: strong（直接発火）/ soft（確認を挟む）/ none（対象外）
      let morningIntent = hasExistingMorningSession
        ? "strong" as const
        : detectMorningIntent(message);

      // CEO/GPT 2026-05-03 diagnostic log: morning protocol detect 結果
      //   PII 排除 (= raw message は出さず length のみ)。 root cause audit 用。
      void import("@/lib/alter-morning/journey/journeyOriginDebugLog").then(
        ({ logMorningProtocolDetect }) =>
          logMorningProtocolDetect(morningIntent, message.length),
      ).catch(() => { /* swallow */ });

      // Soft Bridge 確認への肯定応答 → strong に昇格
      // ※ 直前のAlter返答がSoft Bridgeだった場合のみ（「はい」等の汎用肯定の誤発火防止）
      if (morningIntent === "none" && rawSoftBridgePending === true && isSoftBridgeConfirm(message)) {
        morningIntent = "strong";
        console.info(`[morning-protocol] soft-bridge confirmed by user`);
      }

      // ── Soft Bridge: 確信が弱い時は確認を1回挟む ──
      // isSoftBridgeResponse は外部スコープで宣言済み
      if (morningIntent === "soft") {
        alterResponseText = buildSoftBridgeMessage();
        responseMode = "conclude";
        modeDecisionReason = "conclude_low_ambiguity";
        isSoftBridgeResponse = true;
        console.info(`[morning-protocol] soft-bridge: asking confirmation`);
      }

      // ── Strong: 直接 Morning Protocol に入る ──
      if (morningIntent === "strong") {
        // 性格コンテキストを構築（プロアクティブ提案用）
        const personalityCtx: PersonalityContext = {
          introvert_vs_extrovert: axisScores.introvert_vs_extrovert ?? 0,
          plan_vs_spontaneous: axisScores.plan_vs_spontaneous ?? 0,
          perfectionist_vs_pragmatic: axisScores.perfectionist_vs_pragmatic ?? 0,
          stress_isolation_vs_social: axisScores.stress_isolation_vs_social ?? 0,
          function_vs_expression: axisScores.function_vs_expression ?? 0,
          cautious_vs_bold: axisScores.cautious_vs_bold ?? 0,
          energy_rhythm: axisScores.energy_rhythm ?? 0,
          decision_tempo: axisScores.decision_tempo ?? 0,
        };

        // 既存セッション復元 or 新規作成
        // P0-1: parsedIntent / rawInputs / sufficiency をクライアントから復元する。
        // これがないと2ターン目で intent がゼロリセットされ、
        // legacy parser がゴミタスクを追加し、travel items が消失する。
        if (hasExistingMorningSession) {
          morningSession = {
            sessionId: rawMorningSession!.sessionId ?? `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            // W3-PR-5: v2 stickiness — 前ターンが v2 なら継続、旧は undefined のまま
            pipelineVersion: rawMorningSession!.pipelineVersion === "v2" ? "v2" : undefined,
            phase: rawMorningSession!.phase as MorningSession["phase"],
            rawInputs: rawMorningSession!.rawInputs ?? [],
            personalizeHints: rawMorningSession!.personalizeHints ?? [],
            startedAt: new Date().toISOString(),
            plan: rawMorningSession!.plan ?? undefined,
            parsedIntent: rawMorningSession!.parsedIntent ?? undefined,
            sufficiency: rawMorningSession!.sufficiency ?? undefined,
            planStateV2: rawMorningSession!.planStateV2 ?? undefined,
            personalityContext: personalityCtx,
            userPrefecture: rawMorningSession!.userPrefecture ?? userPrefecture,
            userCity: rawMorningSession!.userCity ?? userCity,
            // 2026-04-19 baseline 編集対応
            userHomeLabel: rawMorningSession!.userHomeLabel ?? userHomeLabel ?? null,
            userHomeLat: rawMorningSession!.userHomeLat ?? userHomeLat ?? null,
            userHomeLng: rawMorningSession!.userHomeLng ?? userHomeLng ?? null,
            // W3-PR-7 Commit 2: dialog state round-trip
            pendingClarify: rawMorningSession!.pendingClarify ?? null,
            persistedEvents: rawMorningSession!.persistedEvents ?? undefined,
            // W3-PR-8 rev 3 Commit 16: DialogState v2 round-trip（read-side reception）
            //   flag OFF: rawMorningSession 側が undefined のまま → undefined pass-through
            //   flag ON:  client から返ってきた dialogState をそのまま hydrate
            dialogState: rawMorningSession!.dialogState ?? undefined,
          };
        } else {
          morningSession = createMorningSession();
          morningSession.personalityContext = personalityCtx;
          if (userPrefecture) morningSession.userPrefecture = userPrefecture;
          if (userCity) morningSession.userCity = userCity;
          // 2026-04-19 baseline 編集対応
          if (userHomeLabel !== undefined) morningSession.userHomeLabel = userHomeLabel;
          if (userHomeLat !== undefined) morningSession.userHomeLat = userHomeLat;
          if (userHomeLng !== undefined) morningSession.userHomeLng = userHomeLng;
        }
        // W3-PR-8 rev 3 Commit 16: DialogState v2 lazy migration
        //   flag OFF → 同一参照 return（完全中立、downstream 不変）
        //   flag ON  → 未初期化なら createInitialDialogState() を付与
        //   本時点で downstream（adapter / phase / reducer）は dialogState を読まない。
        //   route が serialize 時に round-trip するのみ（CEO wiring-only 条件）。
        morningSession = ensureSessionV1(morningSession, userId);

        // ── W3-PR-5: Flag-gated new pipeline with v2 session stickiness ──
        // v2 に入る条件:
        //   (a) 新規セッション（hasExistingMorningSession === false）
        //   (b) または既存セッションが v2（pipelineVersion === "v2"）
        // 旧セッション（pipelineVersion undefined）を途中で v2 に切り替えない。
        // modify は現時点でも新 pipeline が未対応だが、「元発話＋新発話合算」での
        // 再 comprehension で安全に create-only 相当に畳む（脳は混ぜない原則）。
        // flag default OFF — 「true」のみで有効化する。
        const v2Enabled = process.env.ALTER_MORNING_V2_ROUTE_ENABLED === "true";
        const isNewSession = !hasExistingMorningSession;
        const isStickyV2 =
          hasExistingMorningSession &&
          rawMorningSession?.pipelineVersion === "v2";
        const useV2 = v2Enabled && (isNewSession || isStickyV2);
        // W3-PR-8 rev 3 commit 23: bindReason / priorPending.question を shadow 後の
        //   clarifyFallback gate（L2133+）から読むため、try/catch より外側に hoist する。
        //   以前は try の内側で let 宣言していたため、gate 側で scope に居なかった。
        //   hoist に伴う「未初期化 read」はなく、gate 側で null を明示的に判定する。
        let bindReasonOuter: string | null = null;
        let priorQuestionOuter: string | null = null;
        // W3-PR-8 rev 3 commit 24: pipeline throw (absorb) を shadow block 側で
        //   検知するための flag。catch 内で PROVIDER_FAILED を dispatch した後、
        //   shadow 冒頭の PROVIDER_RECOVERED dispatch を skip するのに使う。
        let pipelineAbsorbedOuter = false;
        // CEO/GPT 2026-05-03 PR B-3b'-2 (forward-fix for #69 review):
        //   responsibility split を厳格化するため、legacyAdapter が生成した
        //   journeyOriginGroundingIntent を route.ts が **直接消費** する。
        //   各 adapt path で adapted.journeyOriginGroundingIntent をここに hoist し、
        //   後段の wiring block (= L2700 area) で flag 判定 + orchestrator 呼ぶ。
        //   morningSession.plan.journeyOrigin からの再導出は廃止 (= intent を信頼する)。
        let pendingJourneyOriginIntent:
          | import("@/lib/alter-morning/legacyAdapter").JourneyOriginGroundingIntent
          | undefined;
        // CEO 2026-04-28 PR #41a Commit 6: lastTraceSnapshot は L1485 の outer scope
        //   で宣言済み。Branch A/B/failure すべてここから assign する。
        if (useV2) {
          try {
            // ── W3-PR-7 Commit 2: Branch A — answerBinder path ──
            // 前ターンで clarify を発行済みで persistedEvents が残っている場合、
            // LLM 再 comprehension をスキップして該当 event.slot にユーザー応答を
            // 直接 bind する（答えの意味不明率を下げる最短経路）。
            const priorPending = rawMorningSession?.pendingClarify ?? null;
            const priorPersistedEvents = rawMorningSession?.persistedEvents;
            const canBind =
              isStickyV2 &&
              priorPending != null &&
              Array.isArray(priorPersistedEvents) &&
              priorPersistedEvents.length > 0;
            priorQuestionOuter = priorPending?.question ?? null;

            let usedBindPath = false;
            let bindReason: string | null = null;
            // CEO/GPT 2026-05-02 PR B-2e' wire-up: origin clarify 回答 label
            //   pending.slot === "origin" の時、bindOriginAnswer の結果を保持し、
            //   後続 adaptPipelineToLegacy に渡して journeyOrigin を user_override で plug。
            let userOverrideOriginLabel: string | null = null;
            if (canBind) {
              // CEO/GPT 2026-05-02 PR B-2e' wire-up: origin slot は plan-level
              //   bindAnswerToSlot ではなく bindOriginAnswer を使う:
              //     - LLM comprehension に流さない (= 「ホテルから」を event として誤解釈するリスク回避)
              //     - 成功時は events 更新なしで pipeline を流す
              //     - pendingClarify は legacyAdapter で priorPendingClarify=null として clear
              //     - 失敗時は既存 semantic_miss path にフォールスルー
              if (priorPending!.slot === "origin") {
                const originResult = bindOriginAnswer(message);
                bindReason = originResult.bound ? "ok" : "semantic_miss";
                bindReasonOuter = bindReason;
                if (originResult.bound) {
                  usedBindPath = true;
                  userOverrideOriginLabel = originResult.label;
                  const priorInputs = rawMorningSession?.rawInputs ?? [];
                  // events 更新なし: priorPersistedEvents をそのまま pipeline に渡す
                  const pipelineResult = await runMorningPipeline(
                    {
                      utterance: message,
                      priorEvents: priorPersistedEvents!,
                    },
                    {
                      comprehension: createLLMComprehensionProvider({ userId }),
                      narration: createLLMNarrationProvider({ userId }),
                      weather: null,
                    },
                  );
                  shadowLlmTargetDate = pipelineResult.comprehension?.targetDate ?? null;
                  shadowLlmTargetDateProvenance = pipelineResult.comprehension?.targetDateProvenance ?? null;
                  const previousDayPlanForOriginPath: import("@/lib/alter-morning/types").MorningPlan | null =
                    await fetchPreviousDayPlan(
                      supabase,
                      userId,
                      new Date().toISOString().slice(0, 10),
                    ).catch(() => null);
                  const adapted = adaptPipelineToLegacy(pipelineResult, {
                    sessionId: morningSession.sessionId,
                    utterance: message,
                    personalityContext: personalityCtx,
                    userPrefecture: morningSession.userPrefecture,
                    userCity: morningSession.userCity,
                    userHomeLabel: morningSession.userHomeLabel,
                    userHomeLat: morningSession.userHomeLat,
                    userHomeLng: morningSession.userHomeLng,
                    currentLat: rawCurrentLat ?? null,
                    currentLng: rawCurrentLng ?? null,
                    permissionState: rawPermissionState ?? null,
                    accuracy: rawAccuracy ?? null,
                    capturedAt: rawCapturedAt ?? null,
                    actualTodayYmdJst: getActualTodayYmdJst(),
                    // CEO/GPT 2026-05-02 PR B-2e' wire-up: origin clarify 回答 label を渡す
                    //   legacyAdapter で journeyOrigin の最優先 Layer で plug される。
                    userOverrideOriginLabel,
                    priorRawInputs: priorInputs,
                    priorPendingClarify: null, // origin clarify 成功 → clear
                    priorPersistedEvents: priorPersistedEvents ?? undefined,
                    priorPlan: rawMorningSession?.plan ?? null,
                    previousDayPlan: previousDayPlanForOriginPath,
                    userId,
                    priorDialogState: morningSession.dialogState ?? null,
                  });
                  morningSession = {
                    ...adapted.session,
                    dialogState:
                      "reconciledDialogState" in adapted
                        ? (adapted.reconciledDialogState ?? morningSession.dialogState)
                        : morningSession.dialogState,
                  };
                  morningResponse = adapted.response;
                  lastTraceSnapshot = adapted.lastTraceSnapshot ?? null;
                  // CEO/GPT 2026-05-03 PR B-3b'-2: intent を route.ts に hoist
                  pendingJourneyOriginIntent =
                    adapted.journeyOriginGroundingIntent;
                  console.info(
                    `[morning-protocol:v2:bind] reason=ok boundSlot=origin phase=${morningResponse.phase}`,
                    // PII 排除: label / userId は出さない
                  );
                } else {
                  // origin semantic_miss: 既存 fallback path と同じ logic で再 ask
                  const nextCount = (priorPending!.semanticMissCount ?? 0) + 1;
                  if (nextCount >= 2) {
                    // 2 連続失敗 → pending 破棄、下の LLM 経路にフォールスルー
                    console.info(
                      `[morning-protocol:v2:bind] reason=semantic_miss boundSlot=origin count=${nextCount} → discard pending`,
                    );
                  } else {
                    usedBindPath = true;
                    morningSession = {
                      ...morningSession,
                      phase: "clarifying",
                      pendingClarify: {
                        ...priorPending!,
                        semanticMissCount: nextCount,
                      },
                      persistedEvents: priorPersistedEvents!,
                      rawInputs: [...(rawMorningSession?.rawInputs ?? []), message],
                    };
                    morningResponse = {
                      phase: "clarifying",
                      message: priorPending!.question || "ごめん、もう少し具体的に教えてくれる？",
                      clarifyQuestion: priorPending!.question,
                      personalizeHints: [],
                    };
                    console.info(
                      `[morning-protocol:v2:bind] reason=semantic_miss boundSlot=origin count=${nextCount} → re-ask`,
                    );
                  }
                }
              } else {
              // 既存 event-level bind 経路 (PR B-2e' で origin slot のみ分岐に切り出し)
              const bindResult = bindAnswerToSlot(
                priorPersistedEvents!,
                priorPending!,
                message,
              );
              bindReason = bindResult.reason;
              // commit 23: shadow 後の clarifyFallback gate に渡すため outer にも反映
              bindReasonOuter = bindResult.reason;
              if (bindResult.bound) {
                usedBindPath = true;
                const priorInputs = rawMorningSession?.rawInputs ?? [];
                const pipelineResult = await runMorningPipeline(
                  {
                    utterance: message,
                    priorEvents: bindResult.events,
                  },
                  {
                    // priorEvents モードでは comprehension.extract は呼ばれない
                    comprehension: createLLMComprehensionProvider({ userId }),
                    narration: createLLMNarrationProvider({ userId }),
                    weather: null,
                  },
                );
                shadowLlmTargetDate = pipelineResult.comprehension?.targetDate ?? null;
                shadowLlmTargetDateProvenance = pipelineResult.comprehension?.targetDateProvenance ?? null;
                // CEO/GPT 2026-05-02 PR B-2c: Layer 2 (前日終点 inheritance) 用に
                //   前日 plan を取得。fail-soft で null fallback (Layer 3 へ)。
                const previousDayPlanForBindPath: import("@/lib/alter-morning/types").MorningPlan | null =
                  await fetchPreviousDayPlan(
                    supabase,
                    userId,
                    new Date().toISOString().slice(0, 10),
                  ).catch(() => null);
                const adapted = adaptPipelineToLegacy(pipelineResult, {
                  sessionId: morningSession.sessionId,
                  utterance: message,
                  personalityContext: personalityCtx,
                  userPrefecture: morningSession.userPrefecture,
                  userCity: morningSession.userCity,
                  userHomeLabel: morningSession.userHomeLabel,
                  userHomeLat: morningSession.userHomeLat,
                  userHomeLng: morningSession.userHomeLng,
                  // CEO 2026-04-28 Option B: browser geolocation 由来の現在地座標。
                  currentLat: rawCurrentLat ?? null,
                  currentLng: rawCurrentLng ?? null,
                  // CEO/GPT 2026-05-02 PR B-2d-a: permission state contract
                  permissionState: rawPermissionState ?? null,
                  // CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating
                  //   accuracy / capturedAt は frontend が pos.coords.accuracy /
                  //   pos.timestamp 由来で同送。actualTodayYmdJst は server-side
                  //   生成 (= 時刻ズレ回避のため frontend の値は使わない)。
                  accuracy: rawAccuracy ?? null,
                  capturedAt: rawCapturedAt ?? null,
                  actualTodayYmdJst: getActualTodayYmdJst(),
                  priorRawInputs: priorInputs,
                  priorPendingClarify: null, // bind 成功 → カウントリセット
                  priorPersistedEvents: priorPersistedEvents ?? undefined,
                  priorPlan: rawMorningSession?.plan ?? null,
                  // CEO/GPT 2026-05-02 PR B-2c: Layer 2 inheritance の inference 材料
                  previousDayPlan: previousDayPlanForBindPath,
                  userId, // W3-PR-10 canary: allowlist 判定用
                  // PR-50 Commit 9 (CEO 2026-04-30): reducer 後の dialogState を
                  //   渡して focus reconcile を有効化。slot fixed → focus clear。
                  priorDialogState: morningSession.dialogState ?? null,
                });
                // W3-PR-8 rev 3 commit 21: adapter 跨ぎで dialogState を消失させない
                //   ensureSessionV1 (L1747) で init した dialogState を、
                //   adaptPipelineToLegacy が返す adapted.session が field 非対応で
                //   上書き消去してしまうため、明示的に継承する。
                //
                // PR-50 Commit 9 (CEO 2026-04-30):
                //   adapter が reconciledDialogState を返した場合 (= priorDialogState
                //   を渡した結果 reconcile された) はそちらを優先採用。
                //   reconcile が null を返した (= focus 全 clear) ケースも明示的に
                //   反映する (なので ?? でなく hasOwnProperty 相当の判定)。
                morningSession = {
                  ...adapted.session,
                  dialogState:
                    "reconciledDialogState" in adapted
                      ? (adapted.reconciledDialogState ?? morningSession.dialogState)
                      : morningSession.dialogState,
                };
                morningResponse = adapted.response;
                // CEO 2026-04-28 PR #41a Commit 6: capture trace for response (_debug.trace)
                lastTraceSnapshot = adapted.lastTraceSnapshot ?? null;
                // CEO/GPT 2026-05-03 PR B-3b'-2: intent を route.ts に hoist
                pendingJourneyOriginIntent =
                  adapted.journeyOriginGroundingIntent;
                console.info(
                  `[morning-protocol:v2:bind] reason=ok boundSlot=${bindResult.boundSlot} phase=${morningResponse.phase}`,
                );
              } else if (bindResult.reason === "semantic_miss") {
                // 連続 semantic_miss カウンタを増やし、2 連続で pending 破棄。
                const nextCount = (priorPending!.semanticMissCount ?? 0) + 1;
                if (nextCount >= 2) {
                  // pending 破棄 → 通常の LLM 再 comprehension に流す
                  console.info(
                    `[morning-protocol:v2:bind] reason=semantic_miss count=${nextCount} → discard pending, fallback to LLM`,
                  );
                  // usedBindPath=false のままにして下の LLM 経路へフォールスルー
                } else {
                  // 1 連続目: pending 維持 + 同じ質問を再提示
                  usedBindPath = true;
                  morningSession = {
                    ...morningSession,
                    phase: "clarifying",
                    pendingClarify: {
                      ...priorPending!,
                      semanticMissCount: nextCount,
                    },
                    persistedEvents: priorPersistedEvents!,
                    rawInputs: [...(rawMorningSession?.rawInputs ?? []), message],
                  };
                  morningResponse = {
                    phase: "clarifying",
                    message: priorPending!.question || "ごめん、もう少し具体的に教えてくれる？",
                    clarifyQuestion: priorPending!.question,
                    personalizeHints: [],
                  };
                  console.info(
                    `[morning-protocol:v2:bind] reason=semantic_miss count=${nextCount} → re-ask`,
                  );
                }
              } else {
                // system_miss: 系の失敗。pending 維持のまま LLM 経路にも流さず再質問。
                usedBindPath = true;
                morningSession = {
                  ...morningSession,
                  phase: "clarifying",
                  pendingClarify: priorPending!,
                  persistedEvents: priorPersistedEvents!,
                  rawInputs: [...(rawMorningSession?.rawInputs ?? []), message],
                };
                morningResponse = {
                  phase: "clarifying",
                  message: priorPending!.question || "もう少し詳しく教えてくれる？",
                  clarifyQuestion: priorPending!.question,
                  personalizeHints: [],
                };
                console.info(
                  `[morning-protocol:v2:bind] reason=system_miss → maintain pending`,
                );
              }
              } // end of else (existing event-level bind path)
            }

            if (!usedBindPath) {
            // ── 通常経路（Branch B）: LLM 再 comprehension ──
            //
            // PR-49 (CEO 2026-04-30) 根本修正:
            //   旧設計: combinedUtterance = priorInputs.join(" / ") + " / " + message
            //     → LLM が毎 turn 過去発話全部を再解釈 → 重複 events 大量生成
            //     → CEO 観測 bug: 1 turn で 20 個重複が累積するループ
            //
            //   新設計: utterance = message (今 turn のみ)
            //     prior context は priorPlanForContext (persisted events) で渡す
            //     LLM の責務: 「今の 1 発話」 を理解する (extraction target)
            //     prior の責務: context only (既存予定の理解補助)
            //
            //   これにより rawInputs 再解釈ループ (重複増殖の根因) を断つ。
            //   session.rawInputs は audit log / UI / DB 互換のため引き続き保持
            //   (legacyAdapter で priorRawInputs から append される)。
            //
            // CEO 2026-04-28 PR #41a Layer 2: prior plan context を LLM に渡す。
            //   既存の persistedEvents (= 確定済 plan) を簡略化形で送り、
            //   LLM が turn_mode (create/append/modify) を 3-way 判別できるようにする。
            //   prior が空ならフィールド省略 → 既存 create-only 挙動。
            const priorInputs = isStickyV2
              ? (rawMorningSession?.rawInputs ?? [])
              : [];
            const priorPlanForLLM = rawMorningSession?.persistedEvents;
            const pipelineResult = await runMorningPipeline(
              {
                // PR-49: current utterance のみを extraction target に
                utterance: message,
                ...(priorPlanForLLM && priorPlanForLLM.length > 0
                  ? { priorPlanForContext: priorPlanForLLM }
                  : {}),
                // PR-50 Commit 4 (CEO 2026-04-30): operations 経路の answer
                //   operation を validation 層で検証するため、pendingClarify を
                //   morningPipeline.validatePlanOperations の context に流す。
                //   answer は secondary safety path (主経路は Branch A の
                //   bindAnswerToSlot)。Branch B で LLM が answer operation を
                //   出した場合のみ operationDispatcher で補助 bind が走る。
                //   pendingClarify が null なら validation で
                //   answer_no_pending_clarify reject → events[] fallback。
                priorPendingClarify: rawMorningSession?.pendingClarify ?? null,
                // PR A (CEO/GPT 2026-05-02): deterministic append fallback の
                //   active context check 用。pipeline 内で 5 条件 AND を判定し、
                //   stable context のみ allowDeterministicAppend=true に設定する。
                //   未指定 / null は default false (誤爆防止) に倒れる。
                priorDialogState: rawMorningSession?.dialogState ?? null,
              },
              {
                comprehension: createLLMComprehensionProvider({ userId }),
                narration: createLLMNarrationProvider({ userId }),
                weather: null,
              },
            );
            shadowLlmTargetDate = pipelineResult.comprehension?.targetDate ?? null;
            shadowLlmTargetDateProvenance = pipelineResult.comprehension?.targetDateProvenance ?? null;
            // CEO/GPT 2026-05-02 PR B-2c: Layer 2 (前日終点 inheritance) 用に
            //   前日 plan を取得。fail-soft で null fallback (Layer 3 へ)。
            const previousDayPlanForBranchB: import("@/lib/alter-morning/types").MorningPlan | null =
              await fetchPreviousDayPlan(
                supabase,
                userId,
                new Date().toISOString().slice(0, 10),
              ).catch(() => null);
            const adapted = adaptPipelineToLegacy(pipelineResult, {
              sessionId: morningSession.sessionId,
              // PR-49: current utterance のみ。session.rawInputs (audit log) は
              //        legacyAdapter で priorRawInputs から構築される。
              utterance: message,
              personalityContext: personalityCtx,
              userPrefecture: morningSession.userPrefecture,
              userCity: morningSession.userCity,
              userHomeLabel: morningSession.userHomeLabel,
              userHomeLat: morningSession.userHomeLat,
              userHomeLng: morningSession.userHomeLng,
              // CEO 2026-04-28 Option B: browser geolocation 由来の現在地座標。
              // resolveHomeAnchor で registered home より優先される。
              currentLat: rawCurrentLat ?? null,
              currentLng: rawCurrentLng ?? null,
              // CEO/GPT 2026-05-02 PR B-2d-a: permission state contract
              permissionState: rawPermissionState ?? null,
              // CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating
              accuracy: rawAccuracy ?? null,
              capturedAt: rawCapturedAt ?? null,
              actualTodayYmdJst: getActualTodayYmdJst(),
              // PR-49: rawInputs は audit log (UI / DB 互換) として
              //        legacyAdapter 内で session.rawInputs に蓄積される。
              priorRawInputs: priorInputs,
              priorPendingClarify: rawMorningSession?.pendingClarify ?? null,
              priorPersistedEvents:
                rawMorningSession?.persistedEvents ?? undefined,
              priorPlan: rawMorningSession?.plan ?? null,
              // CEO/GPT 2026-05-02 PR B-2c: Layer 2 inheritance の inference 材料
              previousDayPlan: previousDayPlanForBranchB,
              userId, // W3-PR-10 canary: allowlist 判定用
              // PR-50 Commit 9 (CEO 2026-04-30): reducer 後の dialogState を
              //   渡して focus reconcile を有効化 (Branch B も同様)。
              priorDialogState: morningSession.dialogState ?? null,
            });
            // W3-PR-8 rev 3 commit 21: adapter 跨ぎで dialogState を消失させない
            //   （Branch B 通常 LLM 経路。理由は bind 経路と同じ。）
            //
            // PR-50 Commit 9 (CEO 2026-04-30):
            //   adapter が reconciledDialogState を返したら採用 (focus clear /
            //   advance を反映)。それ以外は reducer 後の morningSession.dialogState
            //   を継承。
            morningSession = {
              ...adapted.session,
              dialogState:
                "reconciledDialogState" in adapted
                  ? (adapted.reconciledDialogState ?? morningSession.dialogState)
                  : morningSession.dialogState,
            };
            morningResponse = adapted.response;
            // CEO 2026-04-28 PR #41a Commit 6: capture trace for response (_debug.trace)
            lastTraceSnapshot = adapted.lastTraceSnapshot ?? null;
            // CEO/GPT 2026-05-03 PR B-3b'-2: intent を route.ts に hoist
            pendingJourneyOriginIntent = adapted.journeyOriginGroundingIntent;
            console.info(
              `[morning-protocol:v2] status=${pipelineResult.status} phase=${morningResponse.phase} items=${morningResponse.plan?.items?.length ?? 0} events=${pipelineResult.comprehension?.events.length ?? 0} sticky=${isStickyV2 ? "1" : "0"} bindMiss=${bindReason ?? "-"}`,
            );
            }
          } catch (err) {
            // ── W3-PR-7 Commit 5: Provider failure 耐性 ──
            //   pipeline / provider の throw を legacy に落とさず、合成
            //   comprehension_failed 結果を adapter に通して **prior state を維持** する。
            //   commit 4 の priorPlan / priorPending / priorPersistedEvents 継承機構を
            //   そのまま使い、「失敗しても会話状態を壊さない」ことに限定する。
            //   （根本的な provider / schema 修正はここでは行わない — 別 PR）
            console.warn(
              `[morning-protocol:v2] pipeline throw — absorb and preserve prior state`,
              err,
            );
            const priorInputs = isStickyV2
              ? (rawMorningSession?.rawInputs ?? [])
              : [];
            const adapted = adaptPipelineToLegacy(buildFailedPipelineResult(), {
              sessionId: morningSession.sessionId,
              utterance: message,
              personalityContext: personalityCtx,
              userPrefecture: morningSession.userPrefecture,
              userCity: morningSession.userCity,
              userHomeLabel: morningSession.userHomeLabel,
              userHomeLat: morningSession.userHomeLat,
              userHomeLng: morningSession.userHomeLng,
              // CEO 2026-04-28 Option B: browser geolocation 由来の現在地座標。
              // resolveHomeAnchor で registered home より優先される。
              currentLat: rawCurrentLat ?? null,
              currentLng: rawCurrentLng ?? null,
              // CEO/GPT 2026-05-02 PR B-2d-a: pipeline throw 吸収経路でも permissionState を
              //   保持。currentLat/Lng と userHomeLat/Lng が両方 null の時、AnchorUnknownReason
              //   を「denied / unrequested / no_baseline」のどれにすべきか判別するため、
              //   pipeline throw 時にも permissionState を維持する必要がある。
              permissionState: rawPermissionState ?? null,
              // CEO/GPT 2026-05-02 PR B-2d-c: pipeline throw 吸収経路でも gating fields を維持。
              //   throw 経路でも buildFailedPipelineResult() 経由で plan が組まれる可能性があり、
              //   その時の current location 採否を正しく評価するため。
              accuracy: rawAccuracy ?? null,
              capturedAt: rawCapturedAt ?? null,
              actualTodayYmdJst: getActualTodayYmdJst(),
              priorRawInputs: priorInputs,
              priorPendingClarify: rawMorningSession?.pendingClarify ?? null,
              priorPersistedEvents:
                rawMorningSession?.persistedEvents ?? undefined,
              priorPlan: rawMorningSession?.plan ?? null,
              userId, // W3-PR-10 canary: allowlist 判定用
            });
            // W3-PR-8 rev 3 commit 21: adapter 跨ぎで dialogState を消失させない
            //   （pipeline throw 吸収経路。provider failure 時も narrowStep を保つ。）
            morningSession = {
              ...adapted.session,
              dialogState: morningSession.dialogState,
            };
            morningResponse = adapted.response;
            // CEO 2026-04-28 PR #41a Commit 6: capture trace for response (_debug.trace)
            lastTraceSnapshot = adapted.lastTraceSnapshot ?? null;
            // CEO/GPT 2026-05-03 PR B-3b'-2: intent を route.ts に hoist
            pendingJourneyOriginIntent = adapted.journeyOriginGroundingIntent;
            console.info(
              `[morning-protocol:v2:absorbed] phase=${morningResponse.phase} items=${morningResponse.plan?.items?.length ?? 0} hasPending=${morningSession.pendingClarify != null ? "1" : "0"}`,
            );
            // ── W3-PR-8 rev 3 commit 24: reducer に PROVIDER_FAILED を通知 ──
            //   pipeline 総失敗を DialogState 層に昇格する。streak++、
            //   conversationStatus → provider_recovering、lastGoodPlan 維持。
            //   phase authority / morningResponse は変更しない（adapter 側で absorb 済み）。
            //
            //   absorbed flag を立てて shadow block 冒頭の PROVIDER_RECOVERED
            //   誤 dispatch を防ぐ（今 turn は recovery 対象ではない）。
            pipelineAbsorbedOuter = true;
            if (
              ALTER_MORNING_FLAGS.dialogStateV2(userId) &&
              morningSession?.dialogState != null
            ) {
              try {
                const nextDialogState = dialogReducer(
                  morningSession.dialogState,
                  {
                    type: "PROVIDER_FAILED",
                    turnIndex:
                      morningSession.dialogState.capturedHistory.length + 1,
                    reason: "provider_error",
                  },
                );
                morningSession = {
                  ...morningSession,
                  dialogState: nextDialogState,
                };
                console.info(
                  `[dialog-state-v2:providerFailed] streak=${nextDialogState.providerFailureStreak} status=${nextDialogState.conversationStatus}`,
                );
              } catch (shadowErr) {
                // reducer FSA 違反などは warn 止まり（既に adapter で absorb 済み）。
                console.warn(
                  `[dialog-state-v2:providerFailed] reducer throw`,
                  shadowErr,
                );
              }
            }
          }
        } else {
          const result = await processMorningMessage(message, morningSession);
          // W3-PR-8 rev 3 commit 21: adapter 跨ぎで dialogState を消失させない
          //   （legacy processMorningMessage 経路。flag ON + useV2=false は想定外だが
          //    完全中立性のため対称に継承する。）
          morningSession = {
            ...result.session,
            dialogState: morningSession.dialogState,
          };
          morningResponse = result.response;
          // OP-5.4.2.4-d: v1 path では parsedIntent が埋まる (= morningProtocol)
          shadowLlmTargetDate = morningSession?.parsedIntent?.targetDate ?? null;
          shadowLlmTargetDateProvenance = morningSession?.parsedIntent?.targetDateProvenance ?? null;
        }

        // W3-PR-7 Commit 2: TS narrowing が nested branch A で失われるため
        //   明示的に assert する（全 path で morningResponse は設定済み）。
        if (!morningResponse) {
          throw new Error("morningResponse must be set after v2/legacy branch");
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // W3-PR-8 rev 3 commit 17: DialogState v2 shadow pipeline（flag ON のみ）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // CEO 方針（2026-04-22 commit 17 条件）:
        //   1. flag OFF 完全中立        → `if` 分岐で完全 gate。Dead code 化。
        //   2. phase authority = hasBlockingUnresolvedSlots のまま
        //                               → morningResponse.phase は **一切触らない**。
        //   3. search_handoff_blocking は internal only
        //                               → derived.kind には出ない（derivePendingClarify 側で null 返却）。
        //   4. DialogState が唯一の主状態
        //                               → session.dialogState のみ書き換える。
        //   5. reducer は pure のまま   → shadowPipeline.ts 内で完結。
        //
        // 禁止事項:
        //   - session.pendingClarify へ derived を書き戻さない（主状態の二重化禁止）
        //   - morningResponse / phase を変更しない
        //   - DialogState を LLM prompt に流さない（本箇所では prompt を構築しない）
        //
        // 完了条件:
        //   - flag ON 時に classify → reducer → persist → derive が通る
        //   - readyForHandoff=true でも morningResponse.phase は clarifying のまま
        //   - reducer throw 時も user-facing 応答は壊れない（try/catch で吸収）
        if (
          ALTER_MORNING_FLAGS.dialogStateV2(userId) &&
          morningSession?.dialogState != null &&
          typeof message === "string" &&
          message.length > 0
        ) {
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // W3-PR-8 rev 3 commit 24: PROVIDER_RECOVERED dispatch（shadow 冒頭）
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          //
          // 前 turn が provider_recovering かつ今 turn の pipeline が成功
          // （absorb 経路を通らなかった）なら、reducer に PROVIDER_RECOVERED を
          // 流して streak=0 + conversationStatus を normal に戻す。
          // 以降の advanceDialogState（TURN_CAPTURED）は normal path で処理される。
          //
          // pipelineAbsorbedOuter=true の turn は「連続失敗中」なので recovery しない。
          if (
            !pipelineAbsorbedOuter &&
            morningSession.dialogState.conversationStatus ===
              "provider_recovering"
          ) {
            try {
              const recoveredEvents = morningSession.persistedEvents ?? [];
              const recoveredState = dialogReducer(
                morningSession.dialogState,
                {
                  type: "PROVIDER_RECOVERED",
                  turnIndex:
                    morningSession.dialogState.capturedHistory.length + 1,
                  events: recoveredEvents,
                },
              );
              // In-place property mutation to preserve TS narrowing for the
              // shadow advance block below. Reassigning the whole object via
              // spread widens `morningSession.dialogState` back to
              // `DialogState | null | undefined` and regresses pre-existing
              // non-null reads (advanceDialogState.prevState など).
              morningSession.dialogState = recoveredState;
              console.info(
                `[dialog-state-v2:providerRecovered] streak=0 status=${recoveredState.conversationStatus}`,
              );
            } catch (shadowErr) {
              console.warn(
                `[dialog-state-v2:providerRecovered] reducer throw`,
                shadowErr,
              );
            }
          }

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // fix/alter-morning-place-search-candidate-ui (CEO 承認 2026-04-25)
          // V1 → V2 Dispatch Bridge
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          //
          // 観測（CEO aneurasync 1c6ef878）:
          //   morningProtocol が planStateV2.missingFields に placeAsk:seg_X を
          //   立てるが persistedEvents=null を返すケースで、下流の
          //   `targetEventId = events[0]?.event_id ?? null` が null になり
          //   TURN_CAPTURED dispatch が skip される → dialog state machine が
          //   driven されず PlaceCandidatePicker が mount されない。
          //
          // 修正: planStateV2.segments[*] から ComprehensionEvent[] を合成して
          //   morningSession.persistedEvents に注入する。これだけで
          //   既存の TURN_CAPTURED dispatch / orchestrator / selection callback
          //   /decidePhase の chain が natural に動く。
          //
          // hard gate: synthetic event の placeType（"chain_brand" 等）と
          //   missing_semantic_critical=["where"] の二重 enforce で
          //   hasBlockingUnresolvedSlots=true → decidePhase=clarifying。
          //   さらに既に plan_presented になっていた場合は明示的に降格する。
          //
          // 排他条件:
          //   - dialogStateV2 + placesSearch 両 flag ON
          //   - persistedEvents 空（既存 PR-7 path とハイブリッドにしない）
          //   - missingFields に placeAsk: が含まれる
          //   - dialogState 自体は ensureSessionV1 で初期化済み（null でない）
          //
          // tests:
          //   tests/unit/alter-morning/dialog/syntheticEventBuilder.test.ts (16)
          //   tests/unit/alter-morning/dialog/placeSearchBridge.test.ts (15、
          //     CEO guard #1 round-trip + #2 phase 降格境界 を含む)
          // V1 → V2 Bridge: synthetic event 注入のみ。
          //   CEO 2026-04-26: 過去の phase 降格（plan_presented → clarifying）は
          //   実は機能していなかった（「これでいく」gate は MorningPlanCard 内で
          //   `!plan.confirmed` のみ判定、phase に依存しなかった）。代わりに
          //   client 側で events.missing_semantic_critical=["where"] を見て
          //   「これでいく」を hide する hard gate に切り替えた。
          //
          //   bridge の責務: persistedEvents が空のときに planStateV2.segments
          //   から synthetic events を build して dispatch path に注入する
          //   （初回 turn の bootstrap のため）。後続 turn は既存 persistedEvents
          //   が dispatch を成立させるので injection は走らない。
          if (
            ALTER_MORNING_FLAGS.dialogStateV2(userId) &&
            ALTER_MORNING_FLAGS.placesSearch(userId) &&
            morningSession?.dialogState != null &&
            (morningSession.persistedEvents?.length ?? 0) === 0 &&
            morningSession.planStateV2?.missingFields?.some((f: string) =>
              f.startsWith("placeAsk:"),
            )
          ) {
            const synthetic = buildSyntheticEventsFromPlanState(
              morningSession.planStateV2,
            );
            if (synthetic.length > 0) {
              const placeAskCount =
                morningSession.planStateV2?.missingFields?.filter((f: string) =>
                  f.startsWith("placeAsk:"),
                ).length ?? 0;
              // in-place mutation: morningSession 自体の参照を変えないことで、
              //   downstream の `morningSession.dialogState` narrowing を維持する。
              //   (object spread 経由の reassign は TS が narrowing を失う)
              morningSession.persistedEvents = synthetic;
              console.info(
                `[place-search-bridge:inject] injected synthetic events ` +
                  `count=${synthetic.length} ` +
                  `ids=${synthetic.map((e) => e.event_id).join(",")} ` +
                  `placeAskCount=${placeAskCount}`,
              );
            }
          }
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // END Bridge
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

          try {
            const events = morningSession.persistedEvents ?? [];
            const nextPending = morningSession.pendingClarify;
            const rawSlot = nextPending?.slot ?? "where";
            // PendingSlot は {when,where,what,transport,endpoint}、DialogFocus.slot は
            // {where,when,what,who}。共通部分の where/when/what のみ dispatch 対象にする。
            const targetSlot: DialogFocus["slot"] | null =
              rawSlot === "where" || rawSlot === "when" || rawSlot === "what"
                ? rawSlot
                : null;

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // W3-PR-8 rev 3 commit 22: 条件付き focus 継承
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 問題:
            //   Branch B 再 comprehension が毎 turn `generateEventId()` で新 id を
            //   発行するため、reducer の eventChanged 判定が毎 turn true → draft reset
            //   → narrowStep が turn 毎に 0/1/2 を振動する。
            //   2026-04-22 preview で カフェ→甲府→スタバ で 2→1→2 逆行を観測。
            //
            // 修正:
            //   「同一 clarifying ループ + same slot + explicit focus switch なし」の
            //   条件下でのみ prev.focus.event_id を継承する（selectShadowTargetEventId）。
            //   新 event 開始（plan_presented 後など）では fallback で新 id を使う。
            const targetSelection = selectShadowTargetEventId({
              prevFocus: morningSession.dialogState.focus,
              prevConversationStatus:
                morningSession.dialogState.conversationStatus,
              previousResponsePhase: rawMorningSession?.phase ?? null,
              pendingEventId: nextPending?.event_id ?? null,
              firstEventId: events[0]?.event_id ?? null,
              currentResponsePhase: morningResponse.phase,
              targetSlot,
            });
            const targetEventId = targetSelection.chosenTargetEventId;

            if (targetEventId != null && targetSlot != null) {
              // CEO 条件 #2: structured log
              //   prev/pending/events0/chosen/eventChanged/reason を 1 行で出力。
              //   eventChanged は prev.focus.event_id と chosen の比較（reducer が
              //   実際に使う判定と同等）。
              const prevFocusEventId =
                morningSession.dialogState.focus?.event_id ?? null;
              const eventChanged =
                prevFocusEventId !== null && prevFocusEventId !== targetEventId;
              console.info(
                `[dialog-state-v2:targetEventId] ` +
                  `prev_focus=${prevFocusEventId ?? "null"} ` +
                  `nextPending=${nextPending?.event_id ?? "null"} ` +
                  `events0=${events[0]?.event_id ?? "null"} ` +
                  `chosen=${targetEventId} ` +
                  `eventChanged=${eventChanged ? "1" : "0"} ` +
                  `canContinueFocus=${targetSelection.canContinueFocus ? "1" : "0"} ` +
                  `reason=${targetSelection.reason}`,
              );

              const advanced = advanceDialogState({
                prevState: morningSession.dialogState,
                message,
                targetEventId,
                targetSlot,
                events,
                turnIndex:
                  morningSession.dialogState.capturedHistory.length + 1,
                nowIso: new Date().toISOString(),
              });
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // PR-50 Commit 11: post-turn final reconcile (CEO 2026-04-30)
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 真因 (CEO + GPT 共同確定 2026-04-30):
              //   advanceDialogState (= dialogReducer の TURN_CAPTURED handler)
              //   は prev.focus が null でも `action.targetEventId / targetSlot`
              //   から **focus を新規作成** する (lib/alter-morning/dialog/reducer.ts
              //   L487-492)。
              //   これにより adapter 内の reconcileDialogState (PR-50 Commit 9)
              //   で focus=null に整合した状態が、reducer 後に再び focus=where 等
              //   に書き戻される (CEO Preview 観測 2026-04-30: focusCleared=true
              //   なのに dialogState.focus が where で残留)。
              //
              // 修正方針 (post-turn finalization):
              //   adapter reconcile = pipeline 内の整合 (Commit 9、維持)
              //   route final reconcile = 最終レスポンス前の整合 (本 commit、追加)
              //   両者は二重防御、最終的に勝つのは route final reconcile。
              //
              // ロジック (既存 reconcileDialogState を再利用):
              //   - reducer 後 state を effectiveEvents (= persistedEvents) と再同期
              //   - focus が指す slot が fixed なら clear / advance (Rule 3)
              //   - 全 fixed なら focus=null, status=stable, streak=0 (Rule 3 / next null)
              //   - slot が依然 vague/missing → focus 維持 (Rule 4)
              //   - capturedHistory は維持 (reconcileDialogState は ...state spread)
              //
              // 不変条件 (本 commit が保証):
              //   final morningSession.dialogState.focus は events 内で missing
              //   slot を持つ event の (event_id, slot) を指すか、null (全 fixed)。
              const finalReconcile = reconcileDialogState(
                advanced.nextState,
                events,
              );
              const finalDialogState =
                finalReconcile.state ?? advanced.nextState;
              if (finalReconcile.focusCleared) {
                console.info(
                  `[dialog-state-v2:postTurnReconcile] focus reconciled. ` +
                    `prev=${advanced.nextState.focus?.slot ?? "null"} ` +
                    `final=${finalDialogState.focus?.slot ?? "null"} ` +
                    `status=${finalDialogState.conversationStatus}`,
                );
              }
              // persist: session.dialogState のみ更新。pendingClarify は触らない。
              morningSession = {
                ...morningSession,
                dialogState: finalDialogState,
              };
              // ⚠ advanced.derived は session.pendingClarify に書き戻さない
              //   （CEO 条件: PendingClarify を主状態として again 書き戻すな）。
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // W3-PR-8 rev 3 commit 19: user-facing runtime 昇格
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // CEO 方針（2026-04-22 commit 19）:
              //   1. flag ON 時だけ DialogState → derive を実質問生成に使う
              //   2. same broad question 繰り返しを narrower step / slot switch /
              //      provider recovery で user-facing に解消する
              //      （分岐は derive 側で決定済み。ここは結果を反映するだけ）
              //   3. search_handoff_blocking は internal only のまま
              //      （derived=null になるため promote は legacy を維持する）
              //   4. plan_presented には上げない
              //      （promote は response.phase !== "clarifying" なら非昇格）
              //   5. phase authority 変更禁止
              //      （promote は phase / plan / personalizeHints を触らない）
              //
              // 禁止事項:
              //   - PR-9 Places search 呼び出し
              //   - 「近くのお店で探そうか？」の user-facing 開放
              //   - phase authority (hasBlockingUnresolvedSlots) の変更
              //   - session.pendingClarify 書き戻し
              const beforePromoteMessage = morningResponse.message;
              morningResponse = promoteDialogStateToUserFacing({
                response: morningResponse,
                derived: advanced.derived,
              });
              const promoted = morningResponse.message !== beforePromoteMessage;
              console.info(
                `[dialog-state-v2:shadow] status=${advanced.nextState.conversationStatus} ` +
                  `narrowStep=${advanced.nextState.focus?.narrowStep ?? 0} ` +
                  `ready=${advanced.nextState.searchQueryDraft.readyForHandoff ? "1" : "0"} ` +
                  `derived_kind=${advanced.derived?.kind ?? "null"} ` +
                  `phase_unchanged=${morningResponse.phase} ` +
                  `user_facing_promoted=${promoted ? "1" : "0"}`,
              );
              // ── W3-PR-12.5 Stage 1 canary: 構造化 shadow state イベント ──
              //   console.info と 1:1 対応。flag_source=null（canary 外）なら no-op。
              emitShadowStateEvent({
                userId,
                sessionId: morningSession.sessionId ?? null,
                targetEventId,
                eventChanged,
                shadowStatus: advanced.nextState.conversationStatus,
                narrowStep: advanced.nextState.focus?.narrowStep ?? null,
                readyForHandoff:
                  advanced.nextState.searchQueryDraft.readyForHandoff,
                targetSelectionReason: targetSelection.reason,
              });

              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // W3-PR-9 commit 4: Places handoff orchestration
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              //
              // AND gate: dialogStateV2 && placesSearch 両方 ON でのみ発火。
              //
              // 呼び出し契機（orchestrator が内部 gate で判定）:
              //   advanceDialogState 直後の nextState が
              //   conversationStatus=search_handoff_blocking かつ
              //   focus.slot=where かつ readyForHandoff=true の時のみ API 呼び出し。
              //
              // CEO 2026-04-23 固定条件:
              //   1. L1 cache は best-effort（broken でも correctness 成立）
              //   2. provider_error は cache しない
              //   3. idempotency skip は (targetEventId ∧ fingerprint ∧ status=presented)
              //   4. draft_not_ready は provider_failure と分離してログ出力
              //   5. parked は候補ソース・再利用ソース双方で未使用
              //
              // 禁止事項:
              //   - user-facing message / phase / plan の書き換え
              //   - parked の参照・再利用
              //   - provider_error の cache 保存
              //   - await を飛ばした fire-and-forget（次 dispatch が state 依存）
              if (ALTER_MORNING_FLAGS.placesSearch(userId) && morningSession.dialogState) {
                const handoffStartedAt = Date.now();
                try {
                  const handoff = await orchestratePlacesHandoff({
                    userId,
                    dialogState: morningSession.dialogState,
                    turnIndex:
                      morningSession.dialogState.capturedHistory.length,
                  });
                  if (handoff.nextDispatch) {
                    try {
                      const afterHandoff = dialogReducer(
                        morningSession.dialogState,
                        handoff.nextDispatch,
                      );
                      morningSession = {
                        ...morningSession,
                        dialogState: afterHandoff,
                      };
                    } catch (dispatchErr) {
                      // FSA 違反などは warn 止まり（外部応答は壊さない）
                      console.warn(
                        `[places-handoff:dispatch] reducer throw`,
                        dispatchErr,
                      );
                    }
                  }
                  const oc = handoff.outcome;
                  if (oc.kind === "error") {
                    // CEO 条件 4: invariant と provider_failure を分離
                    const tag =
                      oc.logClass === "route_invariant_mismatch"
                        ? "[places-handoff:invariant_mismatch]"
                        : "[places-handoff:provider_failure]";
                    console.warn(
                      `${tag} reason=${oc.reason} fp=${oc.fingerprint}`,
                    );
                  } else if (oc.kind === "skip_gate") {
                    console.info(
                      `[places-handoff:skip_gate] reason=${oc.reason} fp=${oc.fingerprint}`,
                    );
                  } else if (oc.kind === "skip_idempotent") {
                    console.info(
                      `[places-handoff:skip_idempotent] fp=${oc.fingerprint}`,
                    );
                  } else if (
                    oc.kind === "presented_from_api" ||
                    oc.kind === "presented_from_cache"
                  ) {
                    console.info(
                      `[places-handoff:${oc.kind}] fp=${oc.fingerprint} count=${oc.candidateCount}`,
                    );
                  } else {
                    // zero_from_api / zero_from_cache
                    console.info(
                      `[places-handoff:${oc.kind}] fp=${oc.fingerprint}`,
                    );
                  }
                  // ── W3-PR-12.5 Stage 1 canary: 構造化 handoff outcome ──
                  //   kind / fingerprint / candidate_count / latency_ms を analytics に流す。
                  //   flag_source=null（canary 外）なら no-op。
                  emitHandoffOutcomeEvent({
                    userId,
                    sessionId: morningSession.sessionId ?? null,
                    outcome: handoff.outcome,
                    latencyMs: Date.now() - handoffStartedAt,
                  });
                } catch (handoffErr) {
                  // orchestrator 外の想定外エラー。user-facing は壊さない。
                  console.warn(
                    `[places-handoff] unexpected throw`,
                    handoffErr,
                  );
                }
              }

              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // CEO/GPT 2026-05-03 PR B-3b'-2: journey_origin grounding wiring
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              //
              // 責務分離 (CEO 補正、forward-fix for #69 review):
              //   - legacyAdapter: intent 生成 (= journeyOriginGroundingIntent、pure)
              //     → pendingJourneyOriginIntent に hoist 済み (= 各 adapt path で代入)
              //   - 本ブロック: legacyAdapter の intent を **直接消費** + flag 判定 + orchestrator
              //     実行 + reducer dispatch
              //   - **再導出はしない** (= legacyAdapter の intent を信頼、責務分離厳格)
              //
              // 3 重 AND gate (= Layer 1):
              //   - journeyOriginGrounding(userId) (= journey_origin 専用 flag)
              //   - placesSearch(userId) (= Places API call が許可されているか)
              //   - dialogStateV2(userId) (= reducer dispatch 先が存在するか)
              //
              // intent 由来 gate (= classification 別):
              //   - public_poi_proper_noun のみ orchestrator 呼ぶ
              //   - generic_category / private_semantic / ambiguous は skip
              //     (= 「ホテル」 だけで即「どのホテル？」 と聞かない、CEO 規律)
              //
              // selection は B-3c 未実装:
              //   - candidate UI は staging で表示される
              //   - click は Layer 2 (UI disabled、Commit 5) + Layer 3 (server reject、Commit 6) で blocked
              //
              // production 影響ゼロ (= flag default false):
              //   - journeyOriginGrounding default false → 全 gate fail → orchestrator 呼ばれない
              if (
                pendingJourneyOriginIntent &&
                ALTER_MORNING_FLAGS.journeyOriginGrounding(userId) &&
                ALTER_MORNING_FLAGS.placesSearch(userId) &&
                ALTER_MORNING_FLAGS.dialogStateV2(userId) &&
                morningSession.dialogState
              ) {
                if (
                  pendingJourneyOriginIntent.classification ===
                  "public_poi_proper_noun"
                ) {
                  const journeyHandoffStartedAt = Date.now();
                  try {
                    const journeyHandoff =
                      await orchestrateJourneyAnchorHandoff({
                        userId,
                        label: pendingJourneyOriginIntent.label,
                        turnIndex:
                          morningSession.dialogState.capturedHistory.length,
                      });
                    if (journeyHandoff.nextDispatch) {
                      try {
                        const afterJourney = dialogReducer(
                          morningSession.dialogState,
                          journeyHandoff.nextDispatch,
                        );
                        morningSession = {
                          ...morningSession,
                          dialogState: afterJourney,
                        };
                      } catch (dispatchErr) {
                        console.warn(
                          `[journey-origin-grounding:dispatch] reducer throw`,
                          dispatchErr,
                        );
                      }
                    }
                    const oc = journeyHandoff.outcome;
                    // CEO/GPT 2026-05-03 PR B-3c-2: telemetry emit (PII フリー)
                    //   flag_source は journey_origin grounding flag 自身の source。
                    //   flag OFF 時は本 block 自体に入らない (= AND gate で gate されてる)
                    //   ため flag_source は通常 "allowlist" or "global" が入る。
                    const flagSource =
                      resolveJourneyOriginGroundingFlagSource(userId);
                    if (oc.kind === "error") {
                      console.warn(
                        `[journey-origin-grounding:provider_failure] reason=${oc.reason} fp=${oc.fingerprint}`,
                      );
                      emitPromotionProviderFailure(userId, {
                        log_class: oc.logClass,
                        reason: oc.reason,
                        flag_state: true,
                        flag_source: flagSource,
                      });
                    } else if (oc.kind === "skip_gate") {
                      console.info(
                        `[journey-origin-grounding:skip_gate] reason=${oc.reason} fp=${oc.fingerprint}`,
                      );
                      // skip_gate は draft_not_ready 等、本 PR では emit 対象外
                    } else if (
                      oc.kind === "presented_from_api" ||
                      oc.kind === "presented_from_cache"
                    ) {
                      console.info(
                        `[journey-origin-grounding:${oc.kind}] fp=${oc.fingerprint} count=${oc.candidateCount} latency=${Date.now() - journeyHandoffStartedAt}ms`,
                      );
                      const invalidCount =
                        oc.kind === "presented_from_api"
                          ? (oc.invalidCoordinateCount ?? 0)
                          : 0; // cache 経路は filter 既適用済 (= invalid count 不明、0 扱い)
                      emitPromotionPresented(userId, {
                        flag_state: true,
                        flag_source: flagSource,
                        candidate_count_before_filter:
                          oc.candidateCount + invalidCount,
                        candidate_count_after_filter: oc.candidateCount,
                        invalid_coordinate_count: invalidCount,
                        outcome: oc.kind,
                      });
                    } else if (oc.kind === "zero_from_api") {
                      console.info(
                        `[journey-origin-grounding:${oc.kind}] fp=${oc.fingerprint}`,
                      );
                      // GPT 1st 補正: zeroReason 分離
                      const zeroReason =
                        oc.zeroReason ?? "no_candidates_from_places_search";
                      const invalidCount = oc.invalidCoordinateCount ?? 0;
                      emitPromotionZeroCandidates(userId, {
                        flag_state: true,
                        flag_source: flagSource,
                        zero_reason: zeroReason,
                        candidate_count_before_filter: invalidCount, // = zero_after_filter のとき invalidCount=before、それ以外は 0
                        candidate_count_after_filter: 0,
                      });
                    } else {
                      // zero_from_cache / skip_idempotent: telemetry minimal
                      console.info(
                        `[journey-origin-grounding:${oc.kind}] fp=${oc.fingerprint}`,
                      );
                    }
                  } catch (orchErr) {
                    console.warn(
                      `[journey-origin-grounding] unexpected throw`,
                      orchErr,
                    );
                  }
                } else {
                  // generic / private_semantic / ambiguous は意図的 skip
                  // (= CEO 規律「ホテル だけで即どのホテル？」 防止)
                  console.info(
                    `[journey-origin-grounding:skip_classification] classification=${pendingJourneyOriginIntent.classification}`,
                  );
                }
              }
            }
          } catch (err) {
            // flag ON 限定の shadow 例外（FSA 違反 / 想定外 classify 等）は user-facing
            // 応答を壊さず warn 止まり。CEO 条件「flag OFF baseline 不変」の保護と、
            // flag ON が user 画面まで刺さない dead-code 前提を両立する。
            console.warn(`[dialog-state-v2:shadow] error`, err);
          }

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // W3-PR-8 rev 3 commit 24: provider failure latch gate
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          //
          // 優先順位:
          //   commit 19 promote（上） → **commit 24 latch（ここ）** → commit 23 clarifyFallback
          //
          // 発火条件:
          //   DialogState.providerFailureStreak >= 1
          //   （今 turn の PROVIDER_FAILED 反映済みの値を参照）
          //
          // 効果:
          //   - message / clarifyQuestion を short degrade 文に差し替える
          //   - latchFired フラグを立て、後段の clarifyFallback を skip する
          //     （latch 文を守るため、「まだ未定」等の undecided rephrase に
          //     上書きされないようにする）
          //
          // 禁止事項:
          //   - phase / plan / personalizeHints の書き換え
          //   - session.dialogState の書き換え（reducer の責務）
          //   - 外部 I/O
          let latchFired = false;
          try {
            const streak =
              morningSession?.dialogState?.providerFailureStreak ?? 0;
            const latch = computeProviderLatch({
              providerFailureStreak: streak,
              currentMessage: morningResponse.message ?? "",
            });
            if (latch.shouldReplace && latch.nextMessage !== null) {
              const before = morningResponse.message;
              morningResponse = {
                ...morningResponse,
                message: latch.nextMessage,
                clarifyQuestion: latch.nextMessage,
              };
              latchFired = true;
              console.info(
                `[dialog-state-v2:providerLatch] reason=${latch.reason} ` +
                  `streak=${streak} replaced=1 before_len=${before?.length ?? 0} ` +
                  `after_len=${latch.nextMessage.length}`,
              );
            } else {
              console.info(
                `[dialog-state-v2:providerLatch] reason=${latch.reason} streak=${streak} replaced=0`,
              );
            }
          } catch (err) {
            console.warn(`[dialog-state-v2:providerLatch] error`, err);
          }

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // W3-PR-8 rev 3 commit 23: phase=clarifying && items=0 gate
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          //
          // CEO 方針（2026-04-22 commit 23 条件）:
          //   1. phase authority (= hasBlockingUnresolvedSlots) は変更しない
          //      → message / clarifyQuestion のみ差し替える。plan.items は触らない。
          //   2. 世界観保持（短く柔らかく断定しない）
          //      → 差し替えメッセージは helper が世界観準拠で生成
          //   3. S5（正常 chain 応答）/ S6（plan_presented）では不介入
          //      → 条件は (a) phase=clarifying (b) items=0 の AND
          //   4. shadow pipeline 失敗時でも user-facing は壊さない
          //      → try/catch で fail-open、例外時は legacy message を維持
          //
          // 呼び出し契機:
          //   phase=clarifying && plan.items.length=0 の時のみ helper に問い合わせ、
          //   helper が「差し替えるべき」と返したケースで message / clarifyQuestion を
          //   書き換える。phase / plan / personalizeHints は不変。
          //
          // 禁止事項:
          //   - morningSession の書き換え（dialogState / pendingClarify 双方）
          //   - plan.items の fabrication
          //   - phase の書き換え
          //   - LLM / DB / Places API 呼び出し
          try {
            const itemCount = morningResponse.plan?.items?.length ?? 0;
            // commit 24: provider latch が発火済みなら degrade 文を守るため skip する。
            //   undecided 系 rephrase で latch 文を上書きしない。
            const shouldGate =
              !latchFired &&
              morningResponse.phase === "clarifying" &&
              itemCount === 0;
            if (shouldGate) {
              // shadow block で更新済みの draft を優先参照（commit 22 で narrowStep
              // 逆行を止めた後の「今 turn の draft」が最新）。dialogState が未通過の
              // fallback 時は null になり、helper 側が A4 empty_draft に落ちる。
              const draft =
                morningSession?.dialogState?.searchQueryDraft ?? null;
              const rawSlot = morningSession?.pendingClarify?.slot ?? "where";
              const gateTargetSlot: "where" | "when" | "what" | null =
                rawSlot === "where" || rawSlot === "when" || rawSlot === "what"
                  ? rawSlot
                  : null;
              const fallback = selectClarifyFallback({
                utterance: typeof message === "string" ? message : "",
                draft,
                targetSlot: gateTargetSlot,
                priorQuestion: priorQuestionOuter,
                bindReason: bindReasonOuter,
                currentMessage: morningResponse.message ?? "",
              });
              if (fallback.shouldReplace && fallback.nextMessage !== null) {
                const before = morningResponse.message;
                morningResponse = {
                  ...morningResponse,
                  message: fallback.nextMessage,
                  clarifyQuestion: fallback.nextMessage,
                };
                console.info(
                  `[dialog-state-v2:clarifyFallback] reason=${fallback.reason} ` +
                    `draft_anchor=${draft?.anchorRegion ?? "null"} ` +
                    `draft_spec=${draft?.chainToken ?? draft?.categoryToken ?? "null"} ` +
                    `bindReason=${bindReasonOuter ?? "null"} ` +
                    `replaced=1 before_len=${before?.length ?? 0} ` +
                    `after_len=${fallback.nextMessage.length}`,
                );
              } else {
                console.info(
                  `[dialog-state-v2:clarifyFallback] reason=${fallback.reason} ` +
                    `bindReason=${bindReasonOuter ?? "null"} ` +
                    `replaced=0`,
                );
              }
            }
          } catch (err) {
            // fail-open: gate 例外時は legacy message を維持。user 体験を壊さない。
            console.warn(`[dialog-state-v2:clarifyFallback] error`, err);
          }
        }

        if (morningResponse.phase !== "skipped") {
          // Morning Protocol がハンドリング → alterResponseText に設定
          alterResponseText = morningResponse.message;
          responseMode = "conclude";
          modeDecisionReason = "conclude_low_ambiguity";

          console.info(`[morning-protocol] phase=${morningResponse.phase} items=${morningResponse.plan?.items?.length ?? 0}`);

          // analytics 永続化（fire-and-forget）
          try {
            await supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "morning_protocol",
              feature: "morning_protocol",
              metadata: {
                phase: morningResponse.phase,
                item_count: morningResponse.plan?.items?.length ?? 0,
                has_fixed: morningResponse.plan?.items?.some(i => i.kind === "fixed") ?? false,
                personalize_hints: morningResponse.personalizeHints?.length ?? 0,
                query_domain: "morning_protocol",
              },
            });
          } catch { /* Non-fatal */ }

          // Morning Protocol 完了時は judgment pipeline をスキップ
          // → 下の else ブロックに入らない
        } else {
          // skipped → 通常の daily_guidance or judgment pipeline に戻す
          morningSession = undefined;
          morningResponse = undefined;
        }
      }

      // Morning Protocol / Soft Bridge が処理しなかった場合のみ既存パイプラインへ
      if (morningIntent !== "soft" && (!morningResponse || morningResponse.phase === "skipped")) {

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DAILY GUIDANCE: 判断エンジンとは完全に独立したパイプライン
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 食/料理/暮らし系キーワードが含まれる場合は daily_guidance ではなく通常パイプラインへ
      const hasFoodIntent = /料理|レシピ|食[材事]|ご飯|ごはん|献立|作[るり].*[もの物]|食べ[たるよ]|おかず|弁当|自炊|外食/.test(message);
      if (queryContext.domain === "daily_guidance" && hasFoodIntent) {
        // 食/料理の質問は daily_guidance の recover に乗せない → lifestyle として通常処理
        queryContext.domain = "lifestyle" as QueryDomain;
        console.info(`[daily-guidance] Food intent detected → rerouted to lifestyle`);
      }

      if (queryContext.domain === "daily_guidance") {
        // userName は外側の isHomeAlter ブロックで取得済み

        // Frame抽出: ユーザー入力 + personality から状態を構造化
        const dgFrame = extractDailyGuidanceFrame(message, personality, rawHomeContext);
        const dgClarify = checkDailyGuidanceClarify(dgFrame);

        if (dgClarify.needs_clarify) {
          // Daily Guidance clarify: time/energy のみ聞く
          const namePrefix = userName ? `${userName}さん、` : "";
          alterResponseText = `${namePrefix}${dgClarify.question}`;
          responseMode = "clarify";
          modeDecisionReason = "clarify_high_ambiguity_high_stake";

          console.info(`[daily-guidance] clarify → ${dgClarify.target_variable}`);

          // analytics 永続化
          try {
            await supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_clarify",
              feature: "daily_guidance",
              metadata: {
                clarify_target: dgClarify.target_variable,
                frame_snapshot: {
                  time_budget: dgFrame.time_budget,
                  energy_level: dgFrame.energy_level,
                },
              },
            });
          } catch { /* Non-fatal */ }

        } else {
          // F: 直近の daily guidance 提案を取得（重複防止 + 連続モード抑制）
          let recentDgSuggestions: string[] = [];
          let recentDgModes: import("@/lib/stargazer/alterHomeAdapter").DailyGuidanceMode[] = [];
          try {
            const { data: recentDg } = await supabase
              .from("stargazer_analytics")
              .select("metadata")
              .eq("user_id", userId)
              .eq("event", "home_alter_judgment")
              .eq("metadata->>query_domain", "daily_guidance")
              .order("created_at", { ascending: false })
              .limit(5);
            if (recentDg) {
              recentDgSuggestions = recentDg
                .map(r => (r.metadata as Record<string, unknown>)?.first_step as string)
                .filter(Boolean);
              recentDgModes = recentDg
                .map(r => (r.metadata as Record<string, unknown>)?.daily_mode as string)
                .filter(Boolean)
                .reverse() as import("@/lib/stargazer/alterHomeAdapter").DailyGuidanceMode[];
            }
          } catch { /* Non-fatal */ }

          // Skeleton構築 → Prompt → LLM → Validation
          const dgSkeleton = buildDailyGuidanceSkeleton(dgFrame, personality, recentDgSuggestions, recentDgModes);
          const dgPromptBlock = buildDailyGuidancePromptBlock(dgSkeleton);

          // Daily Guidance 専用システムプロンプト
          const nameLabel = userName ? `（相手の名前: ${userName}）` : "";
          const dgSystemPrompt = [
            buildAlterIdentityBlock(hdmPhaseAtLoad),
            "",
            `今日一日をどう過ごすか、具体的にガイドしてください。${nameLabel}`,
            "",
            "# ルール",
            "- 1行目は「今日は〇〇する日」のように明快に始める",
            "- 「最初の一歩」は具体的な行動1つ。必ず動詞+対象+所要時間を含める（例: 「15分で〜する」「30分かけて〜する」）",
            "- 所要時間のない「最初の一歩」は不合格。必ず「〜分」「〜時間」を明記する",
            "- 「休む」だけでは不可。「何をして休むか」を具体的に指示する",
            "- 一般論・精神論は禁止。具体的なアクションだけ",
            "- 全体で200-350文字以内",
            "- 応答は必ず最後まで完結させる。途中で切れた文は不合格",
            "- メタデータブロック不要",
            "",
            dgPromptBlock,
          ].join("\n");

          let dgResponse = "";
          try {
            llmCallCount++;
            const aiResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: `質問: ${message}`,
              systemPrompt: dgSystemPrompt,
              requireJson: false,
              temperature: 0.5,
              maxOutputTokens: 1536,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "daily_guidance",
                mode: "warm",
                turnNumber: conversationHistory.length,
                skipCache: true,
              }),
            });
            if (aiResult.success && aiResult.text?.trim()) {
              dgResponse = formatHomeAlterResponse(aiResult.text.trim(), userName);
            }
          } catch (e) {
            console.warn("[daily-guidance] LLM generation failed:", e);
          }

          // 専用 Validation
          if (dgResponse) {
            const dgValidation = validateDailyGuidanceResponse(dgResponse, dgSkeleton);
            if (!dgValidation.pass) {
              console.warn("[daily-guidance] Validation failed:", dgValidation.failures);
              // リトライ: 骨格を再度強調して再生成
              try {
                const retryPrompt = [
                  `質問: ${message}`,
                  "",
                  "## 前回の応答の問題点:",
                  ...dgValidation.failures.map((f) => `- ${f}`),
                  "",
                  "上記の問題を修正して、もう一度応答を生成してください。",
                ].join("\n");
                llmCallCount++;
                const retryResult = await runAI({
                  taskType: "stargazer_alter_response",
                  prompt: retryPrompt,
                  systemPrompt: dgSystemPrompt,
                  requireJson: false,
                  temperature: 0.4,
                  maxOutputTokens: 1024,
                  userId: userId,
                  metadata: makeStargazerRunMetadata({
                    feature: "daily_guidance",
                    mode: "warm",
                    attempt: 1,
                    skipCache: true,
                  }),
                });
                if (retryResult.success && retryResult.text?.trim()) {
                  const retryFormatted = formatHomeAlterResponse(retryResult.text.trim(), userName);
                  const retryValidation = validateDailyGuidanceResponse(retryFormatted, dgSkeleton);
                  if (retryValidation.pass) {
                    dgResponse = retryFormatted;
                  } else {
                    console.warn("[daily-guidance] Retry also failed:", retryValidation.failures);
                    dgResponse = retryFormatted || dgResponse;
                  }
                }
              } catch (retryError) {
                console.warn("[daily-guidance] Retry failed:", retryError);
              }
            }
          }

          // フォールバック
          if (!dgResponse) {
            const namePrefix = userName ? `${userName}さん、` : "";
            dgResponse = `${namePrefix}${dgSkeleton.primary_axis}。\n最初の一歩: ${dgSkeleton.recommended_first_step}`;
          }

          alterResponseText = dgResponse;
          responseMode = "conclude";
          modeDecisionReason = "conclude_low_ambiguity";

          console.info(`[daily-guidance] mode=${dgSkeleton.daily_mode} first_step="${dgSkeleton.recommended_first_step.slice(0, 30)}..."`);

          // analytics 永続化
          try {
            await supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_judgment",
              feature: "daily_guidance",
              metadata: {
                daily_mode: dgSkeleton.daily_mode,
                primary_axis: dgSkeleton.primary_axis,
                first_step: dgSkeleton.recommended_first_step,
                frame: {
                  time_budget: dgFrame.time_budget,
                  energy_level: dgFrame.energy_level,
                  desire_direction: dgFrame.desire_direction,
                  social_bandwidth: dgFrame.social_bandwidth,
                },
                grounding_factors: dgSkeleton.grounding_factors,
                query_domain: "daily_guidance",
              },
            });
          } catch { /* Non-fatal */ }
        }

        // Daily Guidance は独立パイプラインなので、ここで分岐を抜ける
        // → 既存の judgment pipeline をスキップ
        // (下の else ブロックで判断エンジンが動く)

      } else {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // JUDGMENT ENGINE: 既存の対人判断パイプライン
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // ── S4: SignalProc DB クエリを Gemini 読解と並列実行 ──
      // 15 個の独立 DB クエリを Promise 化して即座に発射。
      // Gemini 読解 (3-7s) の間に全て完了する。各結果は元のコード位置で await する。
      const _spTrapCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const _sp = {
        statePattern: Promise.resolve(supabase.from("stargazer_alter_patterns").select("pattern_data, observation_count").eq("user_id", userId).eq("pattern_type", "state").eq("pattern_key", "time_capacity").maybeSingle()),
        lastInsight: Promise.resolve(supabase.from("stargazer_analytics").select("id, metadata, created_at").eq("user_id", userId).eq("event", "home_alter_insight_presented").order("created_at", { ascending: false }).limit(1).single()),
        miFreqInsights: Promise.resolve(supabase.from("stargazer_analytics").select("created_at").eq("user_id", userId).eq("event", "home_alter_insight_presented").order("created_at", { ascending: false }).limit(1)),
        denyStreak: Promise.resolve(supabase.from("stargazer_alter_reactions").select("reaction").eq("user_id", userId).order("created_at", { ascending: false }).limit(5)),
        lifeContext: Promise.resolve(supabase.from("stargazer_alter_context").select("id, category, content, source, temporality, confidence, evidence_count, last_confirmed, possibly_stale").eq("user_id", userId).eq("possibly_stale", false).gte("confidence", 0.4).order("confidence", { ascending: false }).limit(10)),
        hdmState: Promise.resolve(supabase.from("stargazer_alter_growth").select("hdm_phase_state").eq("user_id", userId).single()),
        trapScan: Promise.resolve(supabase.from("stargazer_analytics").select("metadata, created_at").eq("user_id", userId).eq("event", "phase5_trap_scan").gte("created_at", _spTrapCutoff).order("created_at", { ascending: false }).limit(1).maybeSingle()),
        woundDefs: Promise.resolve(supabase.from("stargazer_analytics").select("metadata").eq("user_id", userId).eq("event", "wound_definition").order("created_at", { ascending: false }).limit(10)),
        financialCount: Promise.resolve(supabase.from("stargazer_analytics").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("event", "financial_signal_detected")),
        microSignals: Promise.resolve(supabase.from("stargazer_analytics").select("metadata").eq("user_id", userId).eq("event", "home_alter_micro_signal").order("created_at", { ascending: false }).limit(20)),
        followups: Promise.resolve(supabase.from("stargazer_analytics").select("metadata").eq("user_id", userId).eq("event", "home_alter_followup").order("created_at", { ascending: false }).limit(30)),
        sessionCount: Promise.resolve(supabase.from("stargazer_alter_patterns").select("observation_count").eq("user_id", userId).eq("pattern_type", "decision")),
        hypotheses: Promise.resolve(supabase.from("stargazer_alter_hypotheses").select("content, hypothesis_type, confidence, status, domains, evidence_count, created_at, last_evaluated").eq("user_id", userId).in("status", ["stable", "strengthening"]).gte("confidence", 0.5).order("confidence", { ascending: false }).limit(5)),
        allPatterns: Promise.resolve(supabase.from("stargazer_alter_patterns").select("pattern_type, pattern_key, observation_count, pattern_data, confidence").eq("user_id", userId)),
        personMap: Promise.resolve(supabase.from("stargazer_alter_person_map").select("label, role, sentiment_trend, last_sentiment, influence_score, mention_count").eq("user_id", userId).gte("influence_score", 0.5).gte("mention_count", 2).order("influence_score", { ascending: false }).limit(5)),
      };

      // ── Phase 0: Gemini一次読解（構造化JSON） ──
      // Geminiは「候補を出す役」。意味の確定はAneurasync側で行う。
      // 失敗時は既存パイプラインがそのまま動く（graceful degradation）。
      try {
        const readingStart = Date.now();
        llmCallCount++;
        const readingResult = await runAI({
          taskType: "stargazer_alter_utterance_reading",
          prompt: buildUtteranceReadingPrompt(
            message,
            conversationHistory.length > 0
              ? conversationHistory.map((m) => ({ role: m.role, content: m.content }))
              : undefined,
          ),
          systemPrompt: UTTERANCE_READING_SYSTEM_PROMPT,
          requireJson: true,
          jsonSchema: UTTERANCE_READING_SCHEMA,
          temperature: 0.2,
          // P1.7: 実出力は~200トークン。1024→512でGemini思考時間を短縮
          maxOutputTokens: 512,
          userId: userId,
          metadata: makeStargazerRunMetadata({
            feature: "alter_utterance_reading",
            mode: "warm",
            turnNumber: conversationHistory.length,
            skipCache: true,
          }),
        });
        utteranceReadingLatencyMs = Date.now() - readingStart;

        if (readingResult.success && readingResult.structured) {
          utteranceReading = validateUtteranceReading(
            readingResult.structured as Record<string, unknown>,
          );
          if (utteranceReading) {
            console.info(
              `[utterance-reading] Phase 0 OK: intent="${utteranceReading.surface_intent.slice(0, 50)}" ` +
              `temp=${utteranceReading.emotional_temperature.toFixed(2)} ` +
              `dir=${utteranceReading.energy_direction} ` +
              `relational=${utteranceReading.relational_context?.target_mentioned ?? false} ` +
              `latency=${utteranceReadingLatencyMs}ms`,
            );
          } else {
            console.warn(`[utterance-reading] Phase 0: validation failed, falling back to existing pipeline (latency=${utteranceReadingLatencyMs}ms)`);
          }
        } else {
          console.warn(`[utterance-reading] Phase 0: AI call failed, falling back to existing pipeline (latency=${utteranceReadingLatencyMs}ms)`);
        }
      } catch (e) {
        console.warn("[utterance-reading] Phase 0: exception, falling back to existing pipeline:", e);
      }
      latencyTracker.geminiReadingMs = utteranceReadingLatencyMs; // P1.7: Gemini Phase 0 読解時間
      latencyTracker.postGeminiStartMs = Date.now() - routeStart; // P1.7: Signal処理開始

      // ── State Layer (Layer 2): 今この瞬間の心理的状態推定 ──
      userState = estimateUserState(message);

      // Phase 2: State Pattern をベイズ事前確率として統合
      // time_block 別の蓄積パターンがあれば、ルールベース推定と 70:30 で統合
      try {
        const { data: statePattern } = await _sp.statePattern; // S4: pre-fired

        if (statePattern && userState) {
          const hour = new Date().getHours();
          const block = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
          const blocks = (statePattern.pattern_data as any)?.time_blocks;
          const blockData = blocks?.[block];
          if (blockData && blockData.sample_count >= 3) {
            userState.psychological_capacity =
              userState.psychological_capacity * 0.7 + (blockData.avg_capacity ?? userState.psychological_capacity) * 0.3;
            console.info(`[state-pattern] Bayesian prior applied: block=${block} sample=${blockData.sample_count} capacity_adj=${userState.psychological_capacity.toFixed(2)}`);
          }
        }
      } catch {
        // パターン未蓄積時は静かにスキップ
      }

      // ── Phase A: Gemini読解による State 補正 ──
      // emotional_temperature でルールベース推定を補正（70:30 加重平均）
      if (utteranceReading && userState) {
        const prevLoad = userState.emotional_load;
        userState.emotional_load = applyEmotionalTemperatureCorrection(
          userState.emotional_load,
          utteranceReading.emotional_temperature,
        );
        if (Math.abs(prevLoad - userState.emotional_load) > 0.05) {
          console.info(
            `[phase-a] emotional_load corrected: ${prevLoad.toFixed(2)} → ${userState.emotional_load.toFixed(2)} ` +
            `(gemini_temp=${utteranceReading.emotional_temperature.toFixed(2)})`,
          );
        }
      }

      stateAdjustment = computeStateAdjustment(userState);

      relationalLens = extractRelationalLens(message);
      const ruleBasedTargetRole = relationalLens?.target_role ?? null;

      // ── Phase A: Gemini読解による relationalLens 補完 ──
      // ルールベースが見逃した対人文脈をGemini読解で補完する
      if (utteranceReading && relationalLens) {
        const merged = mergeRelationalContext(
          relationalLens.target_role ?? null,
          utteranceReading.relational_context,
        );
        if (merged.enriched_by_reading && merged.target_role) {
          (relationalLens as any).target_role = merged.target_role;
          console.info(`[phase-a] relationalLens enriched by reading: target_role="${merged.target_role}"`);
        }
      }

      // ── Phase A: Disagreement Log — Gemini vs 既存ルールの並走評価 ──
      // surface_intent は当面プロンプト注入しない。一致率/不一致率をログで育てる。
      if (utteranceReading) {
        const disagreement = buildDisagreementLog(utteranceReading, {
          classifyQuestion_category: questionCategory,
          analyzeQueryContext_domain: queryContext?.domain ?? null,
          extractRelationalLens_targetRole: ruleBasedTargetRole,
        });
        if (disagreement.disagreements.length > 0) {
          console.info(`[disagreement] ${disagreement.disagreements.join("; ")} (agreement=${(disagreement.agreement_rate * 100).toFixed(0)}%)`);
        }
        // fire-and-forget: 並走評価データを蓄積
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "utterance_reading_disagreement",
          feature: "alter_utterance_reading",
          metadata: {
            agreement_rate: disagreement.agreement_rate,
            entries: disagreement.entries,
            disagreements: disagreement.disagreements,
            gemini_surface_intent: utteranceReading.surface_intent.slice(0, 100),
            rule_question_category: questionCategory,
            rule_query_domain: queryContext?.domain ?? null,
            rule_relational_target: ruleBasedTargetRole,
            gemini_relational_target: utteranceReading.relational_context?.target_role ?? null,
          },
        }).then(({ error }) => {
          if (error) console.warn("[disagreement] Log save failed:", error.message);
        });
      }

      // ── 会話OS基礎: reaction / direct_request / repair / greeting を最優先で検出 ──
      // これらは ambiguity engine より上位。検出されたらパイプラインの大部分をスキップ。
      const lastAlterMsg = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1]
        : null;
      const lastAlterContent = (lastAlterMsg?.role === "alter") ? lastAlterMsg.content : null;

      // P1-C: リアクション分類器（detectCorrectionSignal より上位）
      detectedReaction = classifyReaction(message, lastAlterContent);

      if (detectedReaction) {
        // リアクション検出 → タイプ別にモード決定
        switch (detectedReaction.type) {
          case "agree":
            responseMode = "direct_response";
            modeDecisionReason = "reaction_agree";
            console.info(`[home-alter] P1-C reaction: agree (conf=${detectedReaction.confidence}) → direct_response`);
            break;
          case "disagree":
            if (detectedReaction.disagree_strength === "strong") {
              responseMode = "repair";
              modeDecisionReason = "reaction_disagree_strong";
              console.info(`[home-alter] P1-C reaction: disagree:strong (conf=${detectedReaction.confidence}) → repair`);
            } else {
              responseMode = "direct_response";
              modeDecisionReason = "reaction_disagree_weak";
              console.info(`[home-alter] P1-C reaction: disagree:weak (conf=${detectedReaction.confidence}) → direct_response`);
            }
            break;
          case "deepen":
            responseMode = "direct_response";
            modeDecisionReason = "reaction_deepen";
            console.info(`[home-alter] P1-C reaction: deepen (conf=${detectedReaction.confidence}) → direct_response`);
            break;
          case "redirect":
            if (detectedReaction.redirect_subtype === "correction") {
              responseMode = "repair";
              modeDecisionReason = "reaction_redirect_correction";
              console.info(`[home-alter] P1-C reaction: redirect:correction (conf=${detectedReaction.confidence}) → repair`);
            } else {
              // topic_change → 新しい話題なので通常パイプラインへフォールスルー
              // modeDecisionReason だけ記録し、responseMode は下の else ブロックで上書き
              modeDecisionReason = "reaction_redirect_topic_change";
              console.info(`[home-alter] P1-C reaction: redirect:topic_change (conf=${detectedReaction.confidence}) → normal pipeline`);
            }
            break;
        }
      }

      // ━━━ Phase 9: Follow-up Continuity ━━━
      // classifyReaction でカバーしきれない follow-up パターンを検出し、
      // 前ターンの domain/type を継承する。
      followUpType = detectFollowUp(message, lastAlterContent);

      // follow-up OR reaction (deepen/disagree/correction) → 前ターンの domain を継承
      const needsDomainInheritance =
        followUpType !== null ||
        (detectedReaction && detectedReaction.type !== "redirect" || detectedReaction?.redirect_subtype === "correction");

      if (needsDomainInheritance) {
        // 直前ユーザーメッセージから前ターンの domain を復元
        const prevUserMsgs = conversationHistory
          .filter(m => m.role === "user")
          .map(m => m.content);
        const prevUserMsg = prevUserMsgs.length >= 2
          ? prevUserMsgs[prevUserMsgs.length - 2]  // 最後から2番目 = 前ターンのユーザー発話
          : prevUserMsgs[prevUserMsgs.length - 1];  // 1つしかなければそれ

        if (prevUserMsg) {
          const prevContext = analyzeQueryContext(prevUserMsg);
          // ⚠️ 現在のメッセージが独自のドメイン信号を持っている場合は継承しない
          // 例: 前ターンが daily_guidance でも「具体的に私にあった職場を教えて」は career_fit/work
          const currentDomainStrength = queryContext?.domain !== "general" ? queryContext?.domain_confidence ?? 0 : 0;
          const shouldInherit = prevContext.domain !== "general" && currentDomainStrength < 0.3;

          // meta_question / ask_me / conversation は domain inheritance しない
          // 「感情ある？」が前ターンの creation domain を継承して creation template に吸われるのを防ぐ
          const conversationalTypes: import("@/lib/stargazer/alterHomeAdapter").QuestionType[] = ["meta_question", "ask_me", "conversation"];
          if (shouldInherit && !conversationalTypes.includes(questionType)) {
            inheritedDomain = prevContext.domain;
            if (queryContext) queryContext.domain = inheritedDomain;
            console.info(`[follow-up] Domain inherited from previous turn: ${inheritedDomain} (followUp=${followUpType}, reaction=${detectedReaction?.type})`);
          } else if (prevContext.domain !== "general" && currentDomainStrength >= 0.3) {
            console.info(`[follow-up] Domain inheritance SKIPPED: current message has own domain ${queryContext?.domain}(${currentDomainStrength.toFixed(2)}) > prev ${prevContext.domain}`);
          }

          // Session fact chain: 前ターンが general でも、セッション内の事実チェーンから
          // founder_team_fit や creation 等の意図を復元する
          if (prevContext.domain === "general" || !inheritedDomain) {
            const sessionFacts = sessionFactAccumulator.getExplicitFacts();
            const drillDown = detectDrillDown(message, sessionFacts);
            if (drillDown) {
              // ドリルダウン検出: 親意図のドメインを推定
              const hasGoal = sessionFacts.some(f => f.category === "goal");
              const hasNeed = sessionFacts.some(f => f.category === "need" && /チーム|人|仲間|メンバー/.test(f.content));
              if (hasGoal && hasNeed) {
                inheritedDomain = "founder_team_fit";
              } else if (hasGoal) {
                inheritedDomain = "creation";
              }
              if (inheritedDomain && queryContext) {
                queryContext.domain = inheritedDomain;
                console.info(`[follow-up] Domain recovered from session facts: ${inheritedDomain} (drillDown=${drillDown.type}, constraint=${drillDown.constraint})`);
              }
            }
          }
        }

        // follow-up タイプに応じたモード設定
        // ⚠️ ask_me / meta_question / conversation は follow-up override の対象外。
        // 「質問ある？」が前ターンの continuation と誤判定されて conclude に吸われるのを防ぐ。
        const conversationalTypeSet: Set<import("@/lib/stargazer/alterHomeAdapter").QuestionType> = new Set(["ask_me", "meta_question", "conversation"]);
        const skipFollowUpOverride = conversationalTypeSet.has(questionType);
        if (skipFollowUpOverride) {
          // ask_me / meta_question / conversation は follow-up の mode 上書きを拒否し、
          // 自身に適した direct_response を強制する。
          // これがないと responseMode がデフォルト "conclude" のままになり、
          // 「質問ある？」に対して judgment 型の応答が返る致命的バグを生む。
          responseMode = "direct_response";
          modeDecisionReason = `${questionType}_override`;
          console.info(`[follow-up] Skipping follow-up mode override: questionType=${questionType} → direct_response (followUp=${followUpType})`);
          // domain inheritance は維持するが、mode override はスキップ
        } else if (followUpType === "dissatisfaction") {
          responseMode = "repair";
          modeDecisionReason = "followup_dissatisfaction";
          console.info(`[follow-up] Dissatisfaction detected → repair mode`);
        } else if (followUpType === "continuation") {
          // 短い応答（< 20文字）は新しい判断要求ではなく会話の継続。
          // conclude（結論必須バリデーション）ではなく direct_response で自然な対話を維持。
          // 例: 「体調面かな」「仕事の話」「そうかも」→ 結論を強制すると不自然。
          const isShortContinuation = message.trim().length < 20;
          if (isShortContinuation) {
            responseMode = "direct_response";
            modeDecisionReason = "followup_continuation";
            console.info(`[follow-up] Short continuation (${message.trim().length} chars) → direct_response mode`);
          } else {
            responseMode = "conclude";
            modeDecisionReason = "followup_continuation";
            console.info(`[follow-up] Continuation detected → conclude mode`);
          }
        } else if (followUpType === "correction") {
          responseMode = "repair";
          modeDecisionReason = "followup_correction";
          console.info(`[follow-up] Correction detected → repair mode`);
        }
      }

      // ━━━ Phase 9: Fatigue Detection ━━━
      if (!followUpType && !detectedReaction) {
        isFatigue = isFatigueMessage(message);
        if (isFatigue) {
          responseMode = "conclude";
          modeDecisionReason = "fatigue_guidance";
          // domain を上書きしない（general のまま問題なし。prompt block で制御）
          console.info(`[fatigue] Fatigue message detected → fatigue guidance mode`);
        }
      }

      // topic_change 以外のリアクション/follow-up が検出されなかった場合 → 既存の検出チェーン
      if (!detectedReaction && !followUpType && !isFatigue || detectedReaction?.redirect_subtype === "topic_change") {
        if (detectCorrectionSignal(message, lastAlterContent)) {
          responseMode = "repair";
          modeDecisionReason = "correction_signal_detected";
          console.info(`[home-alter] Correction signal detected → repair mode`);
        } else if (detectGreeting(message)) {
          responseMode = "direct_response";
          modeDecisionReason = "direct_request_detected";
          console.info(`[home-alter] Greeting detected → direct_response mode (light template)`);
        } else if (detectDirectRequest(message)) {
          responseMode = "direct_response";
          modeDecisionReason = "direct_request_detected";
          console.info(`[home-alter] Direct request detected → direct_response mode`);
        } else {
          // FIX-1: 直接要求の強シグナル検出（clarify 禁止フラグ）
          const isDirectDemand = detectDirectDemand(message);
          if (isDirectDemand) {
            console.info(`[home-alter] Direct demand detected → clarify prohibited`);
          }
          // 通常パイプライン: ambiguity engine でモード選択
          const rawModeDecision = selectResponseModeWithReason(queryContext, relationalLens, stateAdjustment, { directDemand: isDirectDemand });
          // P1-A: knowledge/strategy 型は clarify/branch 不要 → conclude 強制
          const modeDecision = applyQuestionTypeOverride(rawModeDecision, questionType);
          responseMode = modeDecision.mode;
          modeDecisionReason = modeDecision.reason;
          if (rawModeDecision.mode !== modeDecision.mode) {
            console.info(`[home-alter] P1-A type override: ${rawModeDecision.mode}→${modeDecision.mode} (questionType=${questionType})`);
          }
        }
      }

      // ── State → Mode 降格: fatigue/load が高い時は branch → conclude ──
      // branch は複数選択肢を提示するが、疲労時はシンプルな結論の方が助かる
      if (responseMode === "branch" && userState) {
        if (userState.cognitive_fatigue > 0.6 || userState.emotional_load > 0.7) {
          responseMode = "conclude";
          modeDecisionReason = "conclude_mid_ambiguity_info_sufficient";
          console.info(`[home-alter] State-driven mode downgrade: branch → conclude (fatigue=${userState.cognitive_fatigue.toFixed(2)}, load=${userState.emotional_load.toFixed(2)})`);
        }
      }

      // ── P1.5 Thin-Slice: 差し込みA — High-Value Turn Detector ──
      turnValue = assessTurnValue(
        responseMode, questionType, detectedReaction, message,
        conversationHistory.length, lastAlterContent,
      );
      if (turnValue.budget !== "standard") {
        console.info(`[thin-slice] Turn value: ${turnValue.budget} (${turnValue.reason})`);
      }

      // ── v4.2 Phase A: Signal Reader (early — no data dependencies) ──
      if (thinSliceActive) {
        try {
          v42Signal = readTurnSignal(
            message, questionType, responseMode, detectedReaction,
            lastAlterContent, conversationHistory.length,
          );
          // Role Selection: responseMode + questionType + reaction で決定（早期実行可）
          v42Role = selectAlterRole(
            responseMode, questionType, detectedReaction, conversationHistory.length,
          );
        } catch (e) {
          console.warn("[v4.2] Signal/Role failed (fail-open):", e);
          v42Signal = null;
          v42Role = null;
        }
      }

      // ── P1.5: 前ターンの bet outcome を今の reaction で判定 ──
      if (thinSliceActive && thinSliceState.last_bet && detectedReaction) {
        thinSliceBetOutcome = evaluateBetOutcome(detectedReaction);
        if (thinSliceBetOutcome === "miss") {
          thinSliceState.rejected_bets.push(thinSliceState.last_bet.bet);
          thinSliceState.consecutive_misses++;
          thinSliceState.last_bet_outcome = "miss";
        } else if (thinSliceBetOutcome === "hit") {
          thinSliceState.accepted_bets.push(thinSliceState.last_bet.bet);
          thinSliceState.consecutive_misses = 0;
          thinSliceState.last_bet_outcome = "hit";
        }
      }

      // ── Phase 2: Reaction Learning — 前回 Micro Insight への反応を記録 ──
      try {
        const { data: lastInsight } = await _sp.lastInsight; // S4: pre-fired

        if (lastInsight) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = lastInsight.metadata as any;
          const insightPrompt = meta?.suggested_prompt ?? "";
          const insightType = meta?.presentation_type ?? "casual_check";
          const signalTypes = meta?.signal_types ?? [];

          // ── 重複記録防止 (Fix 3-A): event_id による重複チェック ──
          // fire-and-forget の delete が完了前に次リクエストが走ると同一 event を再取得する。
          // まず stargazer_alter_reactions に同一 analytics_event_id が存在するか確認する。
          const { data: existingReaction } = await supabase
            .from("stargazer_alter_reactions")
            .select("id")
            .eq("user_id", userId)
            .eq("analytics_event_id", lastInsight.id)
            .limit(1)
            .maybeSingle();

          if (existingReaction) {
            // 同一 event_id がすでに記録済み → 重複スキップ（Fix 3-A）
            // fire-and-forget の delete が完了前に次リクエストが来た場合の二重記録を防ぐ
            console.info(`[reaction-learning] Skipping duplicate reaction for event ${lastInsight.id} (already recorded)`);
            // マーカーは await 削除して再取得を防ぐ
            await supabase.from("stargazer_analytics").delete().eq("id", lastInsight.id);
          } else {
            const reaction = classifyInsightReaction(message, insightPrompt);
            console.info(`[reaction-learning] Reaction to insight "${insightPrompt.slice(0, 30)}...": ${reaction}`);

            // マーカーを先に await 削除（根本修正）:
            // 旧実装は fire-and-forget だったため、次リクエストが delete 完了前に
            // 同一マーカーを再取得し "ignored" を重複記録していた。
            // await で同期的に消費することで重複を構造レベルで防ぐ。
            await supabase.from("stargazer_analytics").delete().eq("id", lastInsight.id);

            // stargazer_alter_reactions に記録（fire-and-forget）
            supabase.from("stargazer_alter_reactions").insert({
              user_id: userId,
              insight_type: insightType,
              signal_types: signalTypes,
              reaction,
              response_summary: message.slice(0, 200),
              analytics_event_id: lastInsight.id,
            }).then(({ error }) => {
              if (error) console.warn("[reaction-learning] Save failed (non-fatal):", error.message);
            });

          // Response Pattern 集約: insight_type 別の reaction 分布を蓄積
          supabase.from("stargazer_alter_patterns")
            .select("pattern_data, observation_count, confidence")
            .eq("user_id", userId)
            .eq("pattern_type", "response")
            .eq("pattern_key", "insight_receptivity")
            .maybeSingle()
            .then(async ({ data: existing }) => {
              try {
                const dist = (existing?.pattern_data as any)?.reaction_distribution ?? {};
                if (!dist[insightType]) {
                  dist[insightType] = { accepted: 0, denied: 0, ignored: 0, explored: 0 };
                }
                dist[insightType][reaction] = (dist[insightType][reaction] ?? 0) + 1;
                const newCount = (existing?.observation_count ?? 0) + 1;
                const newConfidence = Math.min(1, 0.2 + newCount * 0.05);

                if (existing) {
                  await supabase.from("stargazer_alter_patterns").update({
                    pattern_data: { reaction_distribution: dist },
                    observation_count: newCount,
                    confidence: newConfidence,
                    last_observed: new Date().toISOString(),
                  }).eq("user_id", userId).eq("pattern_type", "response").eq("pattern_key", "insight_receptivity");
                } else {
                  await supabase.from("stargazer_alter_patterns").insert({
                    user_id: userId,
                    pattern_type: "response",
                    pattern_key: "insight_receptivity",
                    pattern_data: { reaction_distribution: dist },
                    observation_count: 1,
                    confidence: 0.25,
                  });
                }
              } catch (e) {
                console.warn("[response-pattern] Aggregation failed (non-fatal):", e);
              }
            });
          } // else (新規記録ブロック終了)
        }
      } catch {
        // テーブル未作成時等は静かにスキップ
      }

      // ── D: MI 頻度制限データ取得 ──
      try {
        // 直近の MI 提示時刻を取得（まだマーカーが残っていれば提示直後）
        const { data: recentInsights } = await _sp.miFreqInsights; // S4: pre-fired

        if (recentInsights && recentInsights.length > 0) {
          lastInsightPresentedAt = new Date(recentInsights[0].created_at);
        } else {
          // マーカーが消えていても、reactions テーブルから最後の提示時刻を推定
          const { data: lastReaction } = await supabase
            .from("stargazer_alter_reactions")
            .select("created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1);
          if (lastReaction && lastReaction.length > 0) {
            lastInsightPresentedAt = new Date(lastReaction[0].created_at);
          }
        }

        // 直近の deny/ignored 連続数を取得
        const { data: recentReactionRows } = await _sp.denyStreak; // S4: pre-fired
        if (recentReactionRows) {
          recentDenyIgnoreStreak = 0;
          for (const r of recentReactionRows) {
            if (r.reaction === "denied" || r.reaction === "ignored") {
              recentDenyIgnoreStreak++;
            } else {
              break; // 連続が途切れたら停止
            }
          }
        }
      } catch {
        // テーブル未作成時等は静かにスキップ
      }

      // ── Life Context v2: 既存コンテキスト取得 ──
      let activeLifeContext: LifeContextEntry[] = [];
      try {
        const { data: contextRows } = await _sp.lifeContext; // S4: pre-fired

        if (contextRows && contextRows.length > 0) {
          activeLifeContext = filterActiveContext(contextRows as LifeContextEntry[]);
          p0ContextEntriesLoaded = activeLifeContext.length;
          console.info(`[life-context] ${activeLifeContext.length} active context entries loaded`);
        }

        // 鮮度チェック: 30日以上未確認のエントリにフラグを立てる（fire-and-forget）
        const staleCutoff = new Date();
        staleCutoff.setDate(staleCutoff.getDate() - 30);
        supabase.from("stargazer_alter_context")
          .update({ possibly_stale: true })
          .eq("user_id", userId)
          .eq("possibly_stale", false)
          .lt("last_confirmed", staleCutoff.toISOString())
          .then(({ error }) => {
            if (error) console.warn("[life-context] Staleness update failed (non-fatal):", error.message);
          });
      } catch {
        // テーブル未作成時等は静かにスキップ
      }

      // ── DB から hdm_phase_state を先にロード（Trust 導出に必要） ──
      let loadedHdmState: HdmPhaseState = { ...DEFAULT_HDM_PHASE_STATE };
      try {
        const { data: growthRow } = await _sp.hdmState; // S4: pre-fired
        if (growthRow?.hdm_phase_state) {
          loadedHdmState = growthRow.hdm_phase_state as HdmPhaseState;
        }
      } catch { /* hdm_phase_state カラム未追加時は default を使用 */ }
      p3HdmPhaseState = loadedHdmState;
      hdmPhaseAtLoad = loadedHdmState.currentPhase;

      // ── Trust Level（離散値）: 関係性シグナル + Phase cap 付き ──
      // 前ターンの HdmPhaseState から関係性シグナルを構築
      const relationalSignals: import("@/lib/stargazer/alterUnderstanding").RelationalTrustSignals = {
        defensePredictionStreak: loadedHdmState.defensePredictionStreak,
        voluntaryTopicExpansionCount: loadedHdmState.voluntaryTopicExpansionCount,
        consecutiveRuptureCount: (() => {
          // recentRuptureFlags の末尾連続 true をカウント
          const flags = loadedHdmState.recentRuptureFlags ?? [];
          let count = 0;
          for (let i = flags.length - 1; i >= 0; i--) {
            if (flags[i]) count++;
            else break;
          }
          return count;
        })(),
        trustDelta: loadedHdmState.priorSessionTrust !== null
          ? (growthState?.trustLevel ?? 0) - loadedHdmState.priorSessionTrust
          : 0,
        // 以下は proactive engine 未実行のため 0/null（後段で更新される場合あり）
        earnedTrustTotal: 0,
        selfDisclosureDepth: 0,
        repairSuccessRate: null,
      };
      const phaseTrustCap = hdmPhaseToTrustLevel(loadedHdmState.currentPhase);

      trustResult = deriveTrustLevel(
        growthState?.trustLevel ?? 0,
        growthState?.sessionsCompleted ?? 0,
        conversationDepth,
        relationalSignals,
        phaseTrustCap,
      );
      const discreteTrustLevel = trustResult.effectiveTrust;
      p0DiscreteTrustLevel = discreteTrustLevel;

      // ── P3: HDM Phase Controller — 6フェーズ制御 + Trust×Phase 交差 + Regression ──
      // Phase 0-2 自動遷移。Trust×Phase の交差制御で resolveAlterAccess() と矛盾しない。
      // 現段階は既存 discreteTrustLevel と並走（P3-3 完了で derivePhase deprecated）。
      try {

        // ── P5-3: After-Action Loop — 前回の P5 提案に対するユーザーの反応を受動検出 ──
        try {
          const pending = loadedHdmState.pendingRealityAnchoring as PendingRealityAnchoring | null;
          if (isPendingAnchoringActive(pending)) {
            p5AfterActionSignal = detectAfterActionSignal(message);
            if (p5AfterActionSignal !== "no_mention" && pending) {
              const followUpBlock = buildAfterActionPromptBlock(p5AfterActionSignal, pending);
              if (followUpBlock) {
                p5AfterActionPromptBlock = followUpBlock;
                p5AfterActionInjected = true;
                console.info(`[P5-3] After-action signal=${p5AfterActionSignal} for shape=${pending.actionShape}`);
              }
              // シグナル検出 → pending をクリア（ループ完了）
              p3HdmPhaseState = { ...p3HdmPhaseState, pendingRealityAnchoring: null };
              hdmStateDirty = true;
            } else if (pending) {
              // no_mention → attempt をインクリメント
              p3HdmPhaseState = {
                ...p3HdmPhaseState,
                pendingRealityAnchoring: {
                  ...pending,
                  followUpAttempts: pending.followUpAttempts + 1,
                },
              };
              hdmStateDirty = true;
            }
          }
        } catch (e) {
          console.warn("[P5-3] After-action detection failed (fail-open):", e);
        }

        // 遷移判定の入力を組み立て
        const hdmInputs: HdmPhaseInputs = {
          sessionsCompleted: growthState?.sessionsCompleted ?? 0,
          currentSessionTurnCount: conversationDepth,
          totalTurnCount: (growthState?.sessionsCompleted ?? 0) * 8 + conversationDepth,
          continuousTrust: growthState?.trustLevel ?? 0,
          earnedTrustTotal: growthState?.trustLevel ? growthState.trustLevel * (growthState.sessionsCompleted ?? 0) : 0,
          selfDisclosureDepth: growthState?.responseStyle?.selfReferencingDepth ?? 0,
          causalMapConfidence: 0, // proactive engine 接続後に埋まる
          repairSuccessRate: null, // proactive engine 接続後に埋まる
          understandingCoverage: 0, // proactive engine 接続後に埋まる
          defensePredictionStreak: p3HdmPhaseState.defensePredictionStreak,
          voluntaryTopicExpansionCount: p3HdmPhaseState.voluntaryTopicExpansionCount,
        };

        const transitionResult = computeAutoTransition(p3HdmPhaseState, hdmInputs);

        // Trust × Phase 交差制御: Trust が禁止するものを Phase が解禁しない
        p3EffectiveDepth = resolveEffectiveDepth(transitionResult.phase, discreteTrustLevel);

        // P3-2: Regression シグナル検出（P1/P2 結果は後段で埋まるため、ここでは trust delta のみ）
        // 完全な regression 検出は P1/P2 ブロック後に実行する（後段で上書き）
        const earlyRegressionCtx: RegressionContext = {
          ruptureDetected: false,
          ruptureType: null,
          consecutiveRuptureCount: 0,
          dignityViolationDetected: false,
          explicitRejection: false,
          reactiveActivation: 0,
          protectiveActivation: 0,
          trustDelta: 0, // 前ターンとの差分は別途計算が必要
        };
        const earlyRegSignal = detectRegressionSignal(earlyRegressionCtx);

        p3HdmPhaseAnalytics = buildHdmPhaseAnalytics(
          p3HdmPhaseState, transitionResult, discreteTrustLevel, earlyRegSignal,
        );

        // 遷移が発生した場合はメモリ上の状態を更新（DB書き込みは最後に一括）
        if (transitionResult.transitioned) {
          const newState: HdmPhaseState = {
            ...p3HdmPhaseState,
            currentPhase: transitionResult.phase,
            lastTransitionAt: new Date().toISOString(),
          };
          p3HdmPhaseState = newState;
          hdmStateDirty = true;
          console.info(`[P3-hdm] Phase transitioned: ${loadedHdmState.currentPhase} → ${transitionResult.phase} (${transitionResult.transitionReason})`);
        }
      } catch (e) {
        console.warn("[P3-hdm] HDM Phase computation failed (fail-open):", e);
      }

      // ── 罠スキャン結果の取得（前回の fire-and-forget 結果を参照） ──
      // MI抑制 / Route C抑制 / prompt depth 低減 の判断に使う
      // 有効期限: 24時間。古いスキャン結果を新しい会話に持ち込まない。
      interface TrapScanSummary { should_suppress_mi?: boolean; should_suppress_route_c?: boolean; should_reduce_depth?: boolean }
      let lastTrapScan: TrapScanSummary | null = null;
      try {
        const { data: trapScanRow } = await _sp.trapScan; // S4: pre-fired
        if (trapScanRow?.metadata) {
          lastTrapScan = trapScanRow.metadata as TrapScanSummary;

          // ── Circuit breaker: ユーザーが積極的に会話しているなら MI 抑制を解除 ──
          // surveillance は「MI が受け入れられていない」検出だが、ユーザーが 4+ ターン
          // 会話を続けているなら engagement は明らか。MI 抑制を維持すると質問生成が
          // 完全に死に、会話品質が致命的に劣化する（death spiral）。
          if (lastTrapScan?.should_suppress_mi && conversationDepth >= 4) {
            console.info(`[trap-scan] Circuit breaker: active engagement (depth=${conversationDepth}) → MI suppression lifted`);
            lastTrapScan.should_suppress_mi = false;
          }

          if (lastTrapScan?.should_suppress_mi || lastTrapScan?.should_suppress_route_c || lastTrapScan?.should_reduce_depth) {
            console.info(`[trap-scan] Previous scan active: suppress_mi=${lastTrapScan.should_suppress_mi}, suppress_route_c=${lastTrapScan.should_suppress_route_c}, reduce_depth=${lastTrapScan.should_reduce_depth}`);
          }
        } else if (!trapScanRow) {
          // 24h以内のスキャンなし → リセット扱い（前回の警戒状態を持ち込まない）
          console.info("[trap-scan] No recent scan (>24h or none) — starting clean");
        }
      } catch {
        // 初回時等は静かにスキップ
      }

      // ── Wound Activation Engine: 傷の活性化スコア計算 ──
      // MI 抑制・Route C 回避・ForceBalance protect_pressure 加算に使用
      try {
        // 1. DB から登録済みの傷定義を取得
        let woundDefs: WoundDefinition[] = [];
        const { data: woundRows } = await _sp.woundDefs; // S4: pre-fired
        if (woundRows && woundRows.length > 0) {
          woundDefs = woundRows.map(r => {
            const m = r.metadata as any;
            return {
              wound_id: m.wound_id ?? "unknown",
              theme: m.theme ?? "",
              related_persons: m.related_persons ?? [],
              related_keywords: new RegExp(m.related_keywords_pattern ?? "(?!)", "i"),
              depth: m.depth ?? "persistent",
              source: m.source ?? "alter_inferred",
              confidence: m.confidence ?? 0.3,
              last_confirmed: m.last_confirmed ?? new Date().toISOString(),
            } as WoundDefinition;
          });
        }

        // 2. DB に傷が未登録の場合、会話テキストからヒューリスティックに検出
        if (woundDefs.length === 0) {
          const recentTexts = conversationHistory
            .filter(m => m.role === "user")
            .map(m => m.content)
            .slice(-10);
          recentTexts.push(message);
          woundDefs = detectPotentialWounds(recentTexts);
        }

        if (woundDefs.length > 0) {
          // 3. 直近の MI 反応を取得（wound_related フラグ付き）
          const recentMIReactions: WoundActivationInput["recent_mi_reactions"] = [];
          try {
            const { data: miReactionRows } = await supabase
              .from("stargazer_analytics")
              .select("metadata")
              .eq("user_id", userId)
              .eq("event", "home_alter_mi_reaction")
              .order("created_at", { ascending: false })
              .limit(10);
            if (miReactionRows) {
              for (const row of miReactionRows) {
                const m = row.metadata as any;
                recentMIReactions.push({
                  wound_related: m.wound_related ?? false,
                  reaction: m.reaction ?? "ignored",
                });
              }
            }
          } catch {
            // 初回時等は静かにスキップ
          }

          // 4. Wound activation 計算
          const recentUserMessages = conversationHistory
            .filter(m => m.role === "user")
            .map(m => m.content)
            .slice(-10);

          woundActivationResult = computeWoundActivation({
            wounds: woundDefs,
            current_message: message,
            recent_messages: recentUserMessages,
            recent_mi_reactions: recentMIReactions,
            trust_level: discreteTrustLevel,
            user_state: userState,
          });

          if (woundActivationResult.most_active) {
            console.info(`[wound-activation] Most active: "${woundActivationResult.most_active.theme}" (score: ${woundActivationResult.most_active.activation_score.toFixed(2)}, level: ${woundActivationResult.most_active.level})`);
          }
        }
      } catch (e) {
        console.warn("[wound-activation] Error during computation:", e);
        // 傷の活性化計算は失敗しても応答を止めない
      }

      // ── Financial Pressure: 経済的プレッシャーの検出 ──
      // cost_load ブースト・高コスト提案抑制に使用
      try {
        const recentUserMsgs = conversationHistory
          .filter(m => m.role === "user")
          .map(m => m.content)
          .slice(-10);

        // Life Context の経済シグナルを取得
        const lifeContextEconomicSignals = extractLifeContextSignals(message)
          .filter(s => s.category === "environment" && s.content?.includes("経済"));

        // 過去の経済シグナル蓄積数を取得
        let historicalCount = 0;
        try {
          const { count } = await _sp.financialCount; // S4: pre-fired
          historicalCount = count ?? 0;
        } catch {
          // 初回時等は静かにスキップ
        }

        financialPressure = computeFinancialPressure({
          current_message: message,
          recent_user_messages: recentUserMsgs,
          life_context_economic_signals: lifeContextEconomicSignals,
          historical_economic_signal_count: historicalCount,
        });

        if (financialPressure.level !== "none") {
          console.info(`[financial-pressure] Level: ${financialPressure.level} (score: ${financialPressure.score.toFixed(2)}, cost_boost: ${financialPressure.cost_load_boost.toFixed(2)})`);

          // 経済シグナルが検出された場合、analytics に記録（蓄積カウント用）
          if (financialPressure.score >= 0.2) {
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "financial_signal_detected",
              feature: "home_alter",
              metadata: {
                session_id: sessionId,
                score: Number(financialPressure.score.toFixed(3)),
                level: financialPressure.level,
                signals: financialPressure.signals,
              },
            }).then(({ error }) => {
              if (error) console.warn("[financial-pressure] Analytics save failed:", error.message);
            });
          }
        }
      } catch (e) {
        console.warn("[financial-pressure] Error during computation:", e);
      }

      // ── Micro Insight Engine: シグナル検知 ──
      try {
        // 過去のシグナルを取得（analytics から）
        const { data: prevSignalData } = await _sp.microSignals; // S4: pre-fired

        const previousSignals: MicroSignal[] = (prevSignalData ?? [])
          .map(d => d.metadata as MicroSignal)
          .filter(Boolean);

        // Cross-session 用: session_id 付きシグナルを構築
        const previousSessionSignals: SessionMicroSignal[] = (prevSignalData ?? [])
          .map(d => {
            const meta = d.metadata as (MicroSignal & { session_id?: string });
            if (!meta || !meta.type) return null;
            return { ...meta, session_id: meta.session_id ?? "unknown" } as SessionMicroSignal;
          })
          .filter((s): s is SessionMicroSignal => s !== null);

        const newSignals = detectMicroSignals(
          message,
          conversationHistory.map(m => ({ role: m.role, content: m.content })),
          previousSignals,
        );

        // 新シグナルを保存（fire-and-forget: analytics + patterns 両方）
        if (newSignals.length > 0) {
          for (const signal of newSignals) {
            // analytics テーブル（既存: 計測用）— session_id を付与して cross-session 収束に使う
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_micro_signal",
              feature: "micro_insight",
              metadata: { ...signal, session_id: sessionId },
            }).then(({ error }) => {
              if (error) console.warn("[micro-insight] Failed to save signal to analytics:", error.message);
            });

            // patterns テーブル（Phase 2: シグナル蓄積用）
            // pattern_key = シグナルタイプ、pattern_data にシグナル履歴を追記
            supabase.from("stargazer_alter_patterns")
              .upsert({
                user_id: userId,
                pattern_type: "micro_signal",
                pattern_key: signal.type,
                observation_count: 1,
                pattern_data: { latest_signals: [signal] },
                confidence: 0.3,
                last_observed: signal.detected_at,
              }, { onConflict: "user_id,pattern_type,pattern_key" })
              .then(async ({ error }) => {
                if (error) {
                  console.warn("[micro-insight] Failed to save to patterns (non-fatal):", error.message);
                  return;
                }
                try {
                  const { data: existing } = await supabase
                    .from("stargazer_alter_patterns")
                    .select("observation_count, pattern_data")
                    .eq("user_id", userId)
                    .eq("pattern_type", "micro_signal")
                    .eq("pattern_key", signal.type)
                    .single();
                  if (existing) {
                    const existingSignals = (existing.pattern_data as { latest_signals?: MicroSignal[] })?.latest_signals ?? [];
                    const updatedSignals = [...existingSignals, signal].slice(-20);
                    await supabase.from("stargazer_alter_patterns").update({
                      observation_count: (existing.observation_count ?? 0) + 1,
                      pattern_data: { latest_signals: updatedSignals },
                      last_observed: signal.detected_at,
                      confidence: Math.min(0.9, 0.3 + (existing.observation_count ?? 0) * 0.05),
                    })
                    .eq("user_id", userId)
                    .eq("pattern_type", "micro_signal")
                    .eq("pattern_key", signal.type);
                  }
                } catch (innerErr) {
                  console.warn("[micro-insight] Pattern increment failed (non-fatal):", innerErr);
                }
              });
          }
          console.info(`[micro-insight] ${newSignals.length} new signal(s): ${newSignals.map(s => s.type).join(", ")}`);
        }

        // 収束チェック（Cross-session 拡張版）
        const newSessionSignals: SessionMicroSignal[] = newSignals.map(s => ({
          ...s,
          session_id: sessionId!,
        }));
        const allSessionSignals = [...previousSessionSignals, ...newSessionSignals];

        const csCheck = checkCrossSessionConvergence(allSessionSignals, discreteTrustLevel);
        microInsight = csCheck.insight;
        crossSessionResult = csCheck.convergenceResult;
        contradictedTopics = csCheck.contradictedTopics;

        if (microInsight) {
          const cs = microInsight.convergence_score;
          console.info(`[micro-insight] Cross-session convergence: ${microInsight.presentation_type} (score=${cs?.combined ?? "?"}, trend=${crossSessionResult?.trend ?? "?"}, sessions=${cs?.session_diversity ?? "?"}) — "${microInsight.suggested_prompt.slice(0, 50)}..."`);
        }
        if (contradictedTopics.length > 0) {
          console.info(`[micro-insight] Contradicted topics suppressed: ${contradictedTopics.join(", ")}`);
        }

        // Cross-session 収束状態を DB に永続化（fire-and-forget）
        if (crossSessionResult && newSessionSignals.length > 0) {
          (async () => {
            try {
              for (const sig of newSessionSignals) {
                const topicKey = sig.related_topic ?? "__none__";
                // 既存の convergence state を取得
                const { data: existingRow } = await supabase
                  .from("stargazer_mi_convergence_state")
                  .select("session_history, total_sessions_with_signal, trend, trend_confidence, cross_session_continuity, last_convergence_score, last_convergence_at")
                  .eq("user_id", userId)
                  .eq("signal_type", sig.type)
                  .eq("related_topic", topicKey)
                  .single();

                const existingState: ConvergenceState | null = existingRow ? {
                  signal_type: sig.type,
                  related_topic: sig.related_topic,
                  session_history: (existingRow.session_history ?? {}) as ConvergenceState["session_history"],
                  total_sessions_with_signal: existingRow.total_sessions_with_signal ?? 0,
                  trend: existingRow.trend as ConvergenceState["trend"],
                  trend_confidence: existingRow.trend_confidence ?? 0,
                  cross_session_continuity: existingRow.cross_session_continuity ?? 0,
                  last_convergence_score: existingRow.last_convergence_score as ConvergenceState["last_convergence_score"],
                  last_convergence_at: existingRow.last_convergence_at ?? null,
                } : null;

                const updated = updateConvergenceState(existingState, [sig], sessionId!);

                await supabase.from("stargazer_mi_convergence_state").upsert({
                  user_id: userId,
                  signal_type: sig.type,
                  related_topic: topicKey,
                  session_history: updated.session_history,
                  total_sessions_with_signal: updated.total_sessions_with_signal,
                  trend: updated.trend,
                  trend_confidence: updated.trend_confidence,
                  cross_session_continuity: updated.cross_session_continuity,
                  last_convergence_score: crossSessionResult!.convergence_score,
                  last_convergence_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }, { onConflict: "user_id,signal_type,related_topic" });
              }
            } catch (err) {
              console.warn("[micro-insight] Convergence state save failed (non-fatal):", err);
            }
          })();
        }
      } catch (e) {
        console.warn("[micro-insight] Signal detection failed (non-fatal):", e);
      }

      // ━━━━ フォローアップ履歴を取得（判断精度の向上に使用） ━━━━
      try {
        const { data: recentFollowups } = await _sp.followups; // S4: pre-fired

        if (recentFollowups && recentFollowups.length >= 5) {
          // ドメイン別にフィルタ（ドメイン横断の汚染を防ぐ）
          const currentDomain = queryContext?.domain ?? "general";
          const domainFollowups = recentFollowups.filter((f) =>
            (f.metadata?.query_domain ?? "general") === currentDomain
          );
          // ドメイン別が3件未満なら全体を使う（ただし控えめに適用）
          const targetFollowups = domainFollowups.length >= 3 ? domainFollowups : recentFollowups;
          const isDomainSpecific = domainFollowups.length >= 3;

          const executed = targetFollowups.filter((f) => f.metadata?.executed === true);
          const executionRate = executed.length / Math.max(targetFollowups.length, 5);
          const avgSatisfaction = executed.length > 0
            ? executed.reduce((sum, f) => sum + (f.metadata?.satisfaction ?? 3), 0) / executed.length
            : 0;
          const skipReasons = targetFollowups
            .filter((f) => f.metadata?.skip_reason)
            .map((f) => f.metadata.skip_reason as string)
            .slice(0, 3);
          const skipRate = targetFollowups.filter((f) => f.metadata?.skip_reason).length / targetFollowups.length;

          // スキップ率が高い場合を優先（survivorship bias 回避）
          if (skipRate > 0.5) {
            followupInsight = "過去の提案をよく見送っている傾向がある。提案のハードルを下げ、より小さな一歩を提案した方がよい";
          } else if (executionRate < 0.3) {
            followupInsight = "過去の提案の実行率が低い。提案の粒度を細かく、すぐできる行動を提案した方がよい";
          } else if (executionRate > 0.7 && avgSatisfaction >= 4 && isDomainSpecific) {
            followupInsight = "このドメインの提案をよく実行し、満足度も高い。やや挑戦的な提案も受け入れられる傾向がある";
          } else if (avgSatisfaction < 2.5 && executed.length >= 2) {
            followupInsight = "実行後の満足度が低い傾向がある。提案の方向性を見直し、コストや負荷を下げた形で提案した方がよい";
          }
          if (skipReasons.length > 0 && !followupInsight.includes("見送り")) {
            const reasonSummary = skipReasons.join("、");
            followupInsight += followupInsight ? `。見送り理由の傾向: ${reasonSummary}` : `見送り理由の傾向: ${reasonSummary}`;
          }
        }
      } catch {
        // Non-fatal: フォローアップ取得失敗は品質に影響するが処理は続行
      }

      // Clarify ループ防止: 前回の alter 応答が clarify（短い＋質問で終わる）なら
      // ユーザーが回答を返してきた場合は conclude を強制
      // ただし、ユーザーが全く別の質問をしている場合は新規扱い
      // NOTE: lastAlterMsg は上部の会話OS基礎ブロックで取得済み
      const wasPreviousClarify = lastAlterMsg
        && lastAlterMsg.role === "alter"
        && lastAlterMsg.content.length < 200
        && /[？?]/.test(lastAlterMsg.content);
      if (wasPreviousClarify && responseMode === "clarify") {
        // ユーザーの返答が短い（clarifyへの回答らしい）場合は conclude を強制
        // 長い新規質問の場合はそのまま clarify を許可
        const isLikelyAnswer = message.length < 100 && !/[？?]$/.test(message.trim());
        if (isLikelyAnswer) {
          responseMode = "conclude";
          console.info("[home-alter] Clarify loop prevented → forced conclude (answer detected)");
        } else {
          console.info("[home-alter] Previous was clarify but new message looks like a fresh question");
        }
      }

      // ── Layer 1 Context Modifiers: ドメイン別軸スコア調整 ──
      // 蓄積された判断パターンの差異から、このドメインでの実効スコアを調整
      const contextDomains: ContextDomain[] = ["work", "romance", "friend", "family", "self"];
      const contextDomain = contextDomains.includes(queryContext.domain as ContextDomain)
        ? (queryContext.domain as ContextDomain)
        : null;

      if (contextDomain && personality.axisScores) {
        try {
          // 1. DB から蓄積されたモディファイアを取得
          let storedModifiers: AxisContextModifier[] = [];
          const { data: modifierRows } = await supabase
            .from("stargazer_analytics")
            .select("metadata")
            .eq("user_id", userId)
            .eq("event", "axis_context_modifier")
            .order("created_at", { ascending: false })
            .limit(50);
          if (modifierRows) {
            storedModifiers = modifierRows
              .map(r => r.metadata as any)
              .filter(m => m?.axis_id && m?.domain_offsets);
          }

          // 2. ドメイン別と全体の判断分布を取得
          let domainDist: { go_ratio: number; wait_ratio: number; no_ratio: number; total_observations: number } | null = null;
          let globalDist: { go_ratio: number; wait_ratio: number; no_ratio: number; total_observations: number } | null = null;

          const { data: patternData } = await supabase
            .from("stargazer_alter_patterns")
            .select("pattern_key, pattern_data, observation_count")
            .eq("user_id", userId)
            .eq("pattern_type", "decision")
            .in("pattern_key", [`decision_${contextDomain}`, "decision_unknown", "decision_general"])
            .gte("observation_count", 5);

          if (patternData) {
            for (const p of patternData) {
              const pd = p.pattern_data as any;
              const dist = pd?.shape_distribution;
              if (!dist) continue;
              const total = Object.values(dist).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0);
              if (total < 5) continue;

              const goCount = (dist.full_go ?? 0) + (dist.bounded_go ?? 0) + (dist.trial_then_decide ?? 0);
              const waitCount = (dist.observe_first ?? 0) + (dist.prepare_then_go ?? 0) + (dist.delegate_or_request ?? 0);
              const noCount = (dist.skip ?? 0) + (dist.defer_with_trigger ?? 0);

              const computed = {
                go_ratio: goCount / total,
                wait_ratio: waitCount / total,
                no_ratio: noCount / total,
                total_observations: total,
              };

              if (p.pattern_key === `decision_${contextDomain}`) {
                domainDist = computed;
              } else {
                // general/unknown を全体分布として使う
                if (!globalDist || (p.observation_count ?? 0) > globalDist.total_observations) {
                  globalDist = computed;
                }
              }
            }
          }

          // 3. コンテキストモディファイアを適用
          contextualizedScores = applyContextModifiers({
            base_axis_scores: personality.axisScores,
            domain: contextDomain,
            stored_modifiers: storedModifiers,
            domain_decision_distribution: domainDist,
            global_decision_distribution: globalDist,
          });

          // 4. 修正されたスコアを personality に反映（この先の buildDomainOverlay で使われる）
          if (contextualizedScores.modified_axes.length > 0) {
            personality = {
              ...personality,
              axisScores: { ...personality.axisScores, ...contextualizedScores.scores },
            };
            console.info(`[context-modifier] Applied ${contextualizedScores.modified_axes.length} axis modifier(s) for domain "${contextDomain}": ${contextualizedScores.modified_axes.join(", ")}`);
          }
        } catch (e) {
          console.warn("[context-modifier] Error during computation:", e);
        }
      }

      const domainOverlay = buildDomainOverlay(personality, queryContext.domain);

      // ── Layer 1: 入力理解 + RelationalLens v2 ──
      lensDetailed = enrichRelationalLens(relationalLens, message);
      inputUnderstanding = extractInputUnderstanding(message, queryContext, relationalLens);

      // ── Layer 2: 判断骨格 ──
      const framework = buildJudgmentFramework(personality, rawHomeContext ?? null, message);
      judgmentSkeleton = buildJudgmentSkeleton(
        framework, queryContext, relationalLens, inputUnderstanding, responseMode,
      );

      // ── State Layer → Skeleton 統合 ──
      // State が低いとき、skeleton の action_shape を1段階下げる
      if (stateAdjustment && stateAdjustment.simplify_response && judgmentSkeleton) {
        const SHAPE_DOWNGRADE: Partial<Record<string, string>> = {
          full_go: "bounded_go",
          bounded_go: "trial_then_decide",
          trial_then_decide: "prepare_then_go",
          prepare_then_go: "observe_first",
        };
        const downgraded = SHAPE_DOWNGRADE[judgmentSkeleton.action_shape];
        if (downgraded) {
          console.info(`[home-alter] State-driven shape downgrade: ${judgmentSkeleton.action_shape} → ${downgraded} (capacity=${userState?.psychological_capacity.toFixed(2)})`);
          (judgmentSkeleton as { action_shape: string }).action_shape = downgraded;
        }
      }

      // ── ActionShape Hints: 「試してから」「誰かに頼む」の検出 ──
      const shapeHints = detectActionShapeHints(message);
      if (shapeHints.suggests_trial || shapeHints.suggests_delegation) {
        console.info(`[home-alter] Shape hints: trial=${shapeHints.suggests_trial} delegation=${shapeHints.suggests_delegation}`);
      }

      console.info(`[home-alter] domain=${queryContext.domain}(${queryContext.domain_confidence.toFixed(2)}) runner_up=${queryContext.domain_runner_up ?? "none"} ambiguity=${queryContext.ambiguity_score.toFixed(2)} info=${queryContext.information.score.toFixed(2)} mode=${responseMode} reason=${modeDecisionReason} role=${relationalLens?.target_role ?? "?"} purpose=${relationalLens?.interaction_purpose ?? "?"} temp=${relationalLens?.relational_temperature ?? "?"} risk=${relationalLens?.risk_direction ?? "?"} register=${relationalLens?.communication_register ?? "?"} shape=${judgmentSkeleton.action_shape} conf=${judgmentSkeleton.confidence_level} state={cap=${userState?.psychological_capacity.toFixed(2)},load=${userState?.emotional_load.toFixed(2)}} trust=T${discreteTrustLevel} question_type=${questionType} ctx_loaded=${activeLifeContext.length}`);

      // P0: alterSessionCount を homeContext に注入（アーキタイプ重み漸減用）
      // 基準値 = Alter 対話回数（decision pattern の observation_count 合計）
      // ※ Stargazer の total_sessions ではなく、Alter が実際に観測した判断回数を使う
      alterSessionCount = 0;
      try {
        const { data: decisionCounts } = await _sp.sessionCount; // S4: pre-fired
        if (decisionCounts) {
          alterSessionCount = decisionCounts.reduce((sum, r) => sum + (r.observation_count ?? 0), 0);
        }
      } catch { /* first session — no patterns yet */ }

      // T0 gate: insight/temporalDelta/blindSpot/prophecy は全て過去回答履歴からの推論。
      // T0（sessionsCompleted < 3）ではプロンプトに入れない。天気（当日の状態ラベル）のみ残す。
      const rawCtx = rawHomeContext ?? {};
      const homeContextWithObs = {
        ...rawCtx,
        observationCount: alterSessionCount,
        ...(discreteTrustLevel < 1 ? {
          insight: null,
          temporalDelta: null,
          blindSpot: null,
          prophecy: null,
          prophecyAccuracy: null,
        } : {}),
      } as HomeAlterContextData;

      // P2: stable/strengthening 仮説を facts レイヤーに注入するために事前取得
      let hypothesisFactEntries: HypothesisFactEntry[] | null = null;
      try {
        const { data: stableHypotheses } = await _sp.hypotheses; // S4: pre-fired
        if (stableHypotheses && stableHypotheses.length > 0) {
          hypothesisFactEntries = stableHypotheses as HypothesisFactEntry[];
        }
      } catch { /* hypothesis table may not exist yet */ }

      // P3: ベースライン計算 + ズレ検出（LLM不使用、ローカル集約のみ）
      // BaselineDeviation[] を保持し、facts 注入（P3）+ 深掘りプローブ（P4）の両方で使う
      let baselineDeviationEntries: BaselineDeviationEntry[] | null = null;
      baselineDeviationsFull = [];
      try {
        const { data: allPatterns } = await _sp.allPatterns; // S4: pre-fired

        if (allPatterns && allPatterns.length > 0) {
          const userBaseline = computeUserBaseline(allPatterns);

          if (userBaseline.isReady) {
            const hour = new Date().getHours();
            const currentTimeBlock = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
            const deviations = detectBaselineDeviations(userBaseline, {
              domain: queryContext?.domain,
              actionShape: undefined, // ActionShape は応答生成後に確定するため、ここでは未知
              emotionalLoad: userState?.emotional_load,
              questionCategory,
              timeBlock: currentTimeBlock,
            });

            if (deviations.length > 0) {
              baselineDeviationsFull = deviations;
              baselineDeviationEntries = deviations.map(d => ({ type: d.type, factText: d.factText, magnitude: d.magnitude }));
              console.info(`[baseline] ${deviations.length} deviation(s) detected: ${deviations.map(d => d.type).join(", ")}`);
            }
          }
        }
      } catch { /* patterns table may be empty */ }

      // P5: ベースラインズレを Micro Signal に変換 → 収束再評価
      try {
        baselineSignals = convertBaselineDeviationsToSignals(baselineDeviationsFull);
        if (baselineSignals.length > 0) {
          console.info(`[micro-insight] P5: ${baselineSignals.length} baseline deviation(s) converted to signals: ${baselineSignals.map(s => s.type).join(", ")}`);
          // microInsight がまだ null の場合のみ再評価（既に収束していればそのまま）
          if (!microInsight) {
            const { data: prevSignalDataForReeval } = await supabase
              .from("stargazer_analytics")
              .select("metadata")
              .eq("user_id", userId)
              .eq("event", "home_alter_micro_signal")
              .order("created_at", { ascending: false })
              .limit(30);
            const prevSessionSignalsForReeval: SessionMicroSignal[] = (prevSignalDataForReeval ?? [])
              .map(d => {
                const meta = d.metadata as (MicroSignal & { session_id?: string });
                if (!meta || !meta.type) return null;
                return { ...meta, session_id: meta.session_id ?? "unknown" } as SessionMicroSignal;
              })
              .filter((s): s is SessionMicroSignal => s !== null);
            const baselineSessionSignals: SessionMicroSignal[] = baselineSignals.map(s => ({
              ...s,
              session_id: sessionId!,
            }));
            const allSignalsWithBaseline = [...prevSessionSignalsForReeval, ...baselineSessionSignals];
            const csReeval = checkCrossSessionConvergence(allSignalsWithBaseline, discreteTrustLevel);
            microInsight = csReeval.insight;
            if (csReeval.contradictedTopics.length > 0) {
              contradictedTopics = [...new Set([...contradictedTopics, ...csReeval.contradictedTopics])];
            }
            if (microInsight) {
              console.info(`[micro-insight] P5: Cross-session convergence after baseline injection (trend=${csReeval.convergenceResult?.trend ?? "?"})`);
            }
          }
        }
      } catch (e) {
        console.warn("[micro-insight] P5: Baseline signal conversion failed (non-fatal):", e);
      }

      // ── P6: 関係マップ読み出し ──
      let personMapFactEntries: PersonMapFactEntry[] | null = null;
      try {
        const { data: personMapRows } = await _sp.personMap; // S4: pre-fired
        if (personMapRows && personMapRows.length > 0) {
          personMapFactEntries = personMapRows as PersonMapFactEntry[];
          console.info(`[person-map] P6: ${personMapRows.length} high-influence person(s) loaded: ${personMapRows.map(p => `${p.label}(${p.influence_score.toFixed(2)})`).join(", ")}`);
        }
      } catch { /* person_map table may not exist yet */ }

      // 固有データをカテゴリ別に ranked（P0:漸減 + P1:環境文脈 + P2:仮説 + P3:ベースラインズレ + P6:関係マップ）
      // T0 gate: trust level 0 では過去セッション由来データ（context/hypotheses/baseline/person map）を一切注入しない
      // DBに残っていること自体は問題ないが、T0で prompt に混ぜると「知りすぎている」体験になる
      const t0Gate = discreteTrustLevel >= 1;
      // セッション内 fact dedup: 直近3ターンの alter メッセージを取得
      const recentAlterMsgs = conversationHistory
        .filter((m) => m.role === "alter")
        .slice(-3)
        .map((m) => m.content);
      let personalizedFacts = buildPersonalizedFactsWithDomain(
        personality, homeContextWithObs, questionCategory, domainOverlay,
        t0Gate && activeLifeContext.length > 0 ? activeLifeContext : null,
        t0Gate ? hypothesisFactEntries : null,
        t0Gate ? baselineDeviationEntries : null,
        t0Gate ? personMapFactEntries : null,
        recentAlterMsgs,
        conversationHistory.length, // turnNumber: facts ローテーション用
      );
      const expectedKeywords = extractExpectedKeywords(personalizedFacts);

      // ── Intent Pool: clarify 用の意図選択 ──
      const clarifyType = responseMode === "clarify" ? getClarifyType(modeDecisionReason as ModeDecisionReason) : undefined;
      let clarifyIntentHint: ClarifyIntentHint | null = null;

      if (responseMode === "clarify") {
        // Intent Pool から最適な質問意図を選択
        // recentIntentIds: 直近で使用した意図の履歴（stargazer_analytics から取得）
        const recentIntentIds = new Map<string, Date>();
        try {
          const { data: recentIntentEvents } = await supabase
            .from("stargazer_analytics")
            .select("metadata, created_at")
            .eq("user_id", userId)
            .eq("event", "home_alter_intent_used")
            .order("created_at", { ascending: false })
            .limit(20);
          if (recentIntentEvents) {
            for (const ev of recentIntentEvents) {
              const intentId = (ev.metadata as any)?.intent_id;
              if (intentId && !recentIntentIds.has(intentId)) {
                recentIntentIds.set(intentId, new Date(ev.created_at));
              }
            }
          }
        } catch {
          // 初回時等は静かにスキップ
        }

        selectedClarifyIntent = selectIntent(
          message,
          discreteTrustLevel,
          "clarify",
          activeLifeContext,
          recentIntentIds,
          queryContext?.domain,
        );

        if (selectedClarifyIntent) {
          clarifyIntentHint = {
            intent_description: selectedClarifyIntent.intent.intent_description,
            preferred_forms: selectedClarifyIntent.intent.preferred_forms,
            example_questions: selectedClarifyIntent.intent.example_questions,
            intent_id: selectedClarifyIntent.intent.id,
          };
          console.info(`[intent-pool] clarify intent selected: ${selectedClarifyIntent.intent.id} (${selectedClarifyIntent.intent.name}), priority=${selectedClarifyIntent.effective_priority.toFixed(2)}`);
        }
      }

      // ── v4.2 Phase B+C: Self Model + Interpretation Arena + Rally Critic (late — after data loaded) ──
      if (thinSliceActive && v42Signal) {
        try {
          // [C] Self Model: 全データ揃った状態で投影
          v42SelfModel = projectSelfModel(
            growthState, longTermMemory, hypothesisFactEntries ?? null,
            personality, discreteTrustLevel,
          );

          // [B] Arena History: analytics から再構成（fail-open）
          try {
            const { data: recentArena } = await supabase
              .from("stargazer_analytics")
              .select("metadata")
              .eq("user_id", userId)
              .eq("event", "home_alter_judgment")
              .filter("metadata->>session_id", "eq", sessionId)
              .order("created_at", { ascending: false })
              .limit(5);
            if (recentArena) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              v42ArenaHistory = recentArena
                .map((e: { metadata: any }) => e.metadata?.v42?.arena_primary_lens as InterpretationLensId | undefined)
                .filter((l): l is InterpretationLensId => !!l)
                .reverse();
            }
          } catch {
            // fail-open: arena history 取得失敗は空配列で続行
          }

          // [B] Interpretation Arena: 11レンズで解釈を競わせる
          v42Arena = runInterpretationArena(
            message, v42Signal, v42SelfModel, thinSliceState, v42ArenaHistory,
          );

          // Rally Critic: ラリーの前進度評価
          v42RallyCritic = assessRally(
            conversationHistory.map(m => ({ role: m.role, content: m.content })),
            v42ArenaHistory,
            v42Signal,
          );

          if (v42Arena.primary.confidence > 0.3) {
            console.info(`[v4.2] Arena: ${v42Arena.primary.lens} (${(v42Arena.primary.confidence * 100).toFixed(0)}%) | Role: ${v42Role?.role ?? "?"} | Model: ${(v42SelfModel.model_completeness * 100).toFixed(0)}% | Rally: ${v42RallyCritic.status}`);
          }
        } catch (e) {
          console.warn("[v4.2] Self Model/Arena/Rally failed (fail-open):", e);
          v42SelfModel = null;
          v42Arena = null;
          v42RallyCritic = null;
        }

        // Rally=disengaging/stalling → 性格 fact を最大2個に絞る（ラベル爆撃を防止）
        if (v42RallyCritic && (v42RallyCritic.status === "user_disengaging" || v42RallyCritic.status === "stalling" || v42RallyCritic.status === "looping")) {
          const maxFactsOnDisengage = v42RallyCritic.status === "user_disengaging" ? 1 : 2;
          if (personalizedFacts.length > maxFactsOnDisengage) {
            console.info(`[rally] Trimming facts ${personalizedFacts.length} → ${maxFactsOnDisengage} (rally=${v42RallyCritic.status})`);
            personalizedFacts = personalizedFacts.slice(0, maxFactsOnDisengage);
          }
        }
      }

      // ── Wall 2: 心の状態が骨格の強度を調整する ──
      // heartInfluence を先に計算し、buildSkeletonPromptBlock に渡す
      const preRtSignal = rawResponseTimeMs
        ? computeResponseTimeSignal(rawResponseTimeMs)
        : null;
      const heartInfluence: import("@/lib/stargazer/alterHomeAdapter").HeartInfluence = {
        conflictHigh: (preRtSignal?.conflictIndicator ?? 0) > 0.6,
        emotionalLoadHigh: (userState?.emotional_load ?? 0) > 0.7,
        cognitiveFatigueHigh: (userState?.cognitive_fatigue ?? 0) > 0.6,
        defensiveActive: (p2PartsState?.protective.activationLevel ?? 0) > 0.5
          || (p2PartsState?.reactive.activationLevel ?? 0) > 0.5,
      };

      // P1.7: PE 前の前処理レイテンシを記録
      latencyTracker.preProcessingMs = Date.now() - routeStart;

      // ── Perspective Engine v3: 外部視点統合 ──
      // 設計: docs/alter-perspective-engine-design.md
      // v3: L0 explicit ask を Phase/Trust の外に分離 + Quality Gate 追加
      // パイプライン: L0-L6 Gate → Privacy Gate → Search → Classify → Quality Gate → Personalize → Inject
      // fail-open: エラー時は null を返し従来パスにフォールバック
      if (abTestDisablePerspective) {
        console.info("[perspective-engine] A/B test: forced SKIP by _abTestDisablePerspective");
      }
      try {
        // A/B テスト用オーバーライド（dev only: Phase/Trust を強制上書き）
        const peHdmPhase = abTestOverridePhase ?? loadedHdmState.currentPhase;
        const peTrustLevel = abTestOverrideTrust ?? p0DiscreteTrustLevel;
        if (abTestOverridePhase !== undefined || abTestOverrideTrust !== undefined) {
          console.info(`[perspective-engine] A/B test override: phase=${peHdmPhase}, trust=${peTrustLevel}`);
        }
        // v3→P1.5: クエリ生成に渡す会話文脈を充実化
        // 直前の会話文脈 + パーソナリティ特性 + ライフコンテキスト を組み合わせて
        // 「この人向き」の候補を引き出すクエリ生成を支援する。
        // ※ 個人情報（名前・メール等）は含めない。検索クエリ自体への混入は
        //   classifyTaskAndGenerateQueries の LLM プロンプトで禁止されている。
        const peConversationSummary = (() => {
          const parts: string[] = [];

          // (1) 直前の会話文脈（従来通り）
          const recentUserMsgs = conversationHistory
            .filter(m => m.role === "user")
            .slice(-3)
            .map(m => m.content.slice(0, 100));
          if (recentUserMsgs.length > 0) {
            parts.push(`会話の流れ: ${recentUserMsgs.join(" → ")}`);
          }

          // (2) パーソナリティ特性（判断軸の極端なものだけ。検索候補の方向付けに使う）
          if (personality?.axisScores) {
            const axes = personality.axisScores;
            const traitHints: string[] = [];
            // 仕事・キャリア検索に影響する主要軸のみ抽出（|score-0.5| > 0.2 = 明確な傾向）
            const axisLabels: Record<string, [string, string]> = {
              cautious_vs_bold: ["慎重", "大胆"],
              individual_vs_social: ["個人主義", "チーム志向"],
              plan_vs_spontaneous: ["計画的", "柔軟"],
              independence_vs_harmony: ["自律重視", "協調重視"],
              change_embrace_vs_resist: ["変化歓迎", "安定重視"],
              analytical_vs_intuitive: ["分析型", "直感型"],
              growth_mindset: ["成長志向", "安定志向"],
            };
            for (const [key, [lowLabel, highLabel]] of Object.entries(axisLabels)) {
              const score = axes[key as keyof typeof axes];
              if (score !== undefined && score !== null) {
                const deviation = (score as number) - 0.5;
                if (Math.abs(deviation) > 0.2) {
                  traitHints.push(deviation > 0 ? highLabel : lowLabel);
                }
              }
            }
            if (traitHints.length > 0) {
              parts.push(`この人の傾向: ${traitHints.slice(0, 4).join("、")}`);
            }
          }

          // (3) ライフコンテキスト（キャリア・価値観・情熱 — listing_search で特に有効）
          if (lifeCtx) {
            const lifeParts: string[] = [];
            if (lifeCtx.careerLabels?.length) {
              lifeParts.push(`職種: ${lifeCtx.careerLabels.slice(0, 2).join("・")}`);
            }
            if (lifeCtx.coreValues?.length) {
              lifeParts.push(`価値観: ${lifeCtx.coreValues.slice(0, 2).join("・")}`);
            }
            if (lifeCtx.passions?.length) {
              lifeParts.push(`関心: ${lifeCtx.passions.slice(0, 2).join("・")}`);
            }
            if (lifeParts.length > 0) {
              parts.push(lifeParts.join("、"));
            }
          }

          // (4) ベースライン（年代・地域 — 地域性のある検索で有効）
          if (baselineCtx) {
            const baseParts: string[] = [];
            if (baselineCtx.lifeStage) baseParts.push(`ライフステージ: ${baselineCtx.lifeStage}`);
            if (baselineCtx.prefecture) baseParts.push(`地域: ${baselineCtx.prefecture}`);
            if (baseParts.length > 0) {
              parts.push(baseParts.join("、"));
            }
          }

          return parts.length > 0 ? parts.join("\n") : undefined;
        })();

        peResult = abTestDisablePerspective ? null : await runPerspectiveEngine({
          message,
          queryContext: queryContext!,
          questionCategory,
          hdmPhase: peHdmPhase,
          trustLevel: peTrustLevel,
          responseMode,
          userId,
          conversationSummary: peConversationSummary,
          // P1.5: パーソナリティコンテキストをフラグメントランキングに渡す
          personalityCtx: personality?.axisScores
            ? { axisScores: personality.axisScores }
            : null,
          // P1.9: 外部知識バイパス判定用
          questionType,
        });
        if (peResult) {
          perspectiveAudit = peResult.audit;  // keep for analytics backward compat
          perspectiveBlock = peResult.block;  // keep for backward compat (will remove later)
          perspectiveLatency = peResult.latencyBreakdown ?? null;
          perspectiveQualityGate = peResult.qualityGate ?? null;  // keep for analytics backward compat
          perspectiveSearchTask = peResult.searchTaskClassification ?? null;  // keep for analytics backward compat
          // NEW: use top-level fields instead of deprecated
          perspectiveExplorationState = peResult.explorationState ?? null;
          perspectiveExplorationTemplate = peResult.explorationTemplate ?? null;

          if (peResult.audit.gateDecision === "fired" && peResult.block.fragments.length > 0) {
            console.info(
              `[perspective-engine] 🔥 FIRED: ${peResult.block.fragments.length} fragments, ` +
              `delta=${JSON.stringify(peResult.block.forceBalanceDelta)}, ` +
              `latency=${peResult.block.searchLatencyMs}ms, ` +
              `queries=${JSON.stringify(peResult.block.searchQueriesSent)}` +
              (peResult.qualityGate ? `, quality=${peResult.qualityGate.action}` : "")
            );
            console.info(`[perspective-engine] 📝 Prompt block:\n${peResult.block.promptBlock}`);
          } else {
            console.info(
              `[perspective-engine] ⏭️  SKIPPED: gate=${peResult.audit.gateDecision}, reason=${peResult.audit.gateReason}` +
              (peResult.audit.isExplicitAsk ? ", explicit_ask=true" : "") +
              (peResult.audit.explicitAskBlocked ? ", BLOCKED" : "")
            );
          }
          // telemetry: fire-and-forget（v3: explicit ask + quality gate フィールド追加）
          supabase.from("stargazer_analytics").insert({
            user_id: userId,
            event: "perspective_engine_gate",
            feature: "perspective_engine",
            metadata: {
              gate_decision: peResult.audit.gateDecision,
              gate_reason: peResult.audit.gateReason,
              source_type: peResult.audit.sourceType,
              search_queries: peResult.audit.searchQueriesSent,
              search_latency_ms: peResult.audit.searchLatencyMs,
              latency_breakdown: perspectiveLatency ?? null,
              fragments_count: peResult.audit.fragmentsUsed.length,
              fragments_types: peResult.audit.fragmentsUsed.map(f => f.epistemicType),
              prompt_block_chars: peResult.block.promptBlock.length,
              force_balance_delta: peResult.audit.forceBalanceDelta,
              query_domain: queryContext?.domain ?? null,
              question_category: questionCategory,
              response_mode: responseMode,
              hdm_phase: loadedHdmState.currentPhase,
              trust_level: p0DiscreteTrustLevel,
              message_preview: message.slice(0, 50),
              // v3 新フィールド
              is_explicit_ask: peResult.audit.isExplicitAsk,
              explicit_ask_blocked: peResult.audit.explicitAskBlocked,
              quality_gate_action: peResult.qualityGate?.action ?? null,
              quality_gate_reason: peResult.qualityGate?.reason ?? null,
              quality_gate_hedge: peResult.qualityGate?.needsHedge ?? null,
              // v4 新フィールド: SearchTaskClassification (internal)
              search_task_type: peResult.searchTaskClassification?.type ?? null,
              search_task_fitness: peResult.searchTaskClassification?.searchFitness ?? null,
              search_task_description: peResult.searchTaskClassification?.description ?? null,
              // v6 新フィールド: SearchTask (downstream)
              downstream_task_type: peResult.searchTask?.type ?? null,
              downstream_task_explicit: peResult.searchTask?.explicit ?? null,
              downstream_task_confidence: peResult.searchTask?.confidence ?? null,
              // v5 新フィールド: Exploration
              exploration_depth: peResult.searchTaskClassification?.explorationDepth ?? null,
              exploration_id: peResult.explorationState?.explorationId ?? null,
              exploration_phase: peResult.explorationState?.currentPhase ?? null,
              exploration_turn: peResult.explorationState?.turnCount ?? null,
            },
          }).then(({ error }) => {
            if (error) console.warn("[perspective-engine] Telemetry save failed:", error.message);
          });
        }
      } catch (e) {
        // fail-open: Perspective Engine の失敗は致命的ではない
        console.warn("[perspective-engine] Error, continuing without:", e);
      }

      // ── Layer 3: 骨格制約付きプロンプト構築 ──
      // P0/P1: homeContextWithObs を使い、observationCount + envContext を反映
      let homeSystemPrompt = buildHomeAlterPromptWithContext(
        personality, homeContextWithObs, questionCategory, message,
        responseMode, queryContext, domainOverlay, userName, relationalLens,
        judgmentSkeleton, clarifyType, clarifyIntentHint, baselineCtx, relationshipCtx, lifeCtx,
        heartInfluence, loadedHdmState.currentPhase, p0DiscreteTrustLevel,
      );

      // ── Phase 1: 派生事実注入（Home Alter経路） ──
      if (STARGAZER_FLAGS.useDerivedFacts && personality.axisScores) {
        try {
          const contradictionInputs: ContradictionInput[] =
            (personality.contradictionAxes ?? []).map((c: { axisA: string; axisB: string; tension: number }) => {
              const entryA = AXIS_REGISTRY.get(c.axisA as import("@/lib/stargazer/traitAxes").TraitAxisKey);
              const entryB = AXIS_REGISTRY.get(c.axisB as import("@/lib/stargazer/traitAxes").TraitAxisKey);
              const labelA = entryA ? `${entryA.labelLeft}/${entryA.labelRight}` : c.axisA;
              const labelB = entryB ? `${entryB.labelLeft}/${entryB.labelRight}` : c.axisB;
              return {
                axisA: c.axisA as import("@/lib/stargazer/traitAxes").TraitAxisKey,
                axisB: c.axisB as import("@/lib/stargazer/traitAxes").TraitAxisKey,
                insight: `「${labelA}」と「${labelB}」の傾向が矛盾している`,
                tension: c.tension,
              };
            });

          const factSet = generateDerivedFacts({
            axisScores: personality.axisScores,
            contradictions: contradictionInputs,
            blindSpots: [],
            queryDomain: null,
          });

          derivedFactSet = factSet;

          const topExtremeAxes = Object.entries(personality.axisScores)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([key, value]) => ({ key: key as import("@/lib/stargazer/traitAxes").TraitAxisKey, score: value as number }))
            .sort((a, b) => Math.abs(b.score - 0.5) - Math.abs(a.score - 0.5))
            .slice(0, 3);

          const derivedSection = formatDerivedFactsForPrompt(factSet, topExtremeAxes);
          homeSystemPrompt += `\n\n${derivedSection}`;
        } catch (e) {
          console.warn("[home-alter] Derived facts generation failed, continuing without:", e);
        }
      }

      // ── Perspective Engine v6: プロンプト注入 + 直答パス + listing_search honest limitation ──
      // 条件分岐の優先順位:
      //   1. Flag で検索不可 → 「まだ有効化していない」
      //   2. listing_search + explicit ask → honest limitation（周辺情報あれば併用）
      //   3. 検索したが結果なし/品質不足 (discard OR abstain) → 「確実な情報が見つからなかった」
      //   4. 検索したが不十分 (supplement + canClarify) → hedge 付き注入 + 1問確認OK
      //   5. listing_search + supplement（暗黙 or 非explicit） → 周辺情報 hedge 付き注入 + limitation
      //   6. 検索成功 → 通常注入
      //   7. P1-3: peResult 存在するがどの注入分岐にも該当しない → 診断ログ
      // P1: peResult top-level fields をソースオブトゥルースとして使用
      if (!peResult) {
        console.info("[perspective-engine] 💤 PE returned null (not invoked / fail-open / AB-test disabled)");
      }
      // P1.8-fix: searchTask has no `explicit`; use audit.isExplicitAsk
      const peIsExplicit = peResult?.audit?.isExplicitAsk ?? false;
      const peQualityAction = peResult?.qualityGate?.action ?? null;
      const peTaskType = peResult?.searchTask?.type ?? null;
      const peSearchTask = peResult?.searchTask ?? null;
      // P1.8-fix: promptBlock lives at peResult.block.promptBlock, not peResult.promptBlock
      const pePromptBlock = peResult?.block?.promptBlock || "";

      if (peResult?.audit?.gateDecision === "blocked") {
        // Case 1: Explicit ask が検出されたが Flag OFF → 通常会話に流さず直答
        homeSystemPrompt += `\n\n[最上位制約 — 検索能力への直答]
ユーザーはWeb検索を明示的に要求したが、今この機能はまだ有効化されていない。
必ず最初の1文で「今はまだ外の情報を引っ張ってくる機能を使えない状態なんだ」と正直に伝えること。
その上で、自分の内部モデルから答えられる範囲で回答してよい。
禁止: この事実に触れずに通常会話に流すこと。`;
        console.info("[perspective-engine] 🚫 Explicit ask blocked → direct answer path injected");
      } else if (peIsExplicit && peTaskType === "listing_search") {
        // Case 2: listing_search + explicit ask → honest limitation + 周辺情報活用
        // P1.9: 周辺情報がある場合は情報提示を優先し、limitation は末尾に添える
        const hasPeripheralInfo = peResult != null && pePromptBlock.length > 0 && peResult.block.fragments.length > 0;
        if (hasPeripheralInfo) {
          homeSystemPrompt += `\n\n${pePromptBlock}`;
          homeSystemPrompt += `\n\n[検索応答契約 — listing_search（情報優先）]
上記の外部情報から、ユーザーの要求に関連する具体的な情報（企業名・条件・特徴等）を可能な限り引き出して提示すること。
必須構造:
1. 外部情報の「データ:」行に含まれる企業名・サービス名を省略せず全て本文に入れる（最低1つ、可能なら2つ以上）
2. それぞれについて、パーソナルモデルから「なぜこの人に合いそうか」を1文で添える
3. 数値データ（年収・従業員数・成長率等）があれば省略せず使う
4. 回答の最後に、直接的なリスト検索はまだできないことを1文で軽く触れてよい（ただし謝罪や長い弁明は不要）
禁止:
- 「できない」から始めること — 見つかった情報の提示を必ず先にする
- 外部情報に企業名があるのにそれを省略して方向性提案だけで済ませること
- 過剰な謝罪や弁明
- **外部情報に含まれていない企業名を捏造すること — プレースホルダー（「○○社」「XYZ」）は絶対禁止**`;
        } else {
          homeSystemPrompt += `\n\n[検索応答契約 — listing_search（情報なし）]
ユーザーの検索要求に対し外部情報を取得したが、具体的な候補は見つからなかった。
必須構造:
1. 「具体的なリストを直接引っ張ってくるのはまだ難しい」と最初に正直に伝える
2. パーソナルモデルから「こういう軸で探すのがいいと思う」と具体的な探し方を助言する
3. 可能であれば、探すのに適したサイトや検索キーワードを1つ提案する
禁止: 検索した事実に触れずに通常会話に流すこと。`;
        }
        console.info(
          `[perspective-engine] 📋 listing_search honest limitation injected` +
          (hasPeripheralInfo ? ` (with ${peResult!.block.fragments.length} peripheral fragments → info-first path)` : " (no peripheral info → limitation-first path)")
        );
      } else if (peIsExplicit && (peQualityAction === "discard" || peQualityAction === "abstain")) {
        // Case 3: 検索したが結果なし or 品質不足 → 正直に伝える
        // abstain = fragments ゼロ（検索失敗・プロバイダ 503 等）
        // discard = fragments あるが品質不足
        homeSystemPrompt += `\n\n[最上位制約 — 検索結果の不足への直答]
ユーザーの検索要求に応じて外部情報を取得しようとしたが、信頼できる情報が見つからなかった。
必ず最初の1文で「調べてみたんだけど、今回は確実な情報を引っ張ってこれなかった」と正直に伝えること。
その上で、自分の内部モデル（ユーザーの性格・判断傾向）から答えられる範囲で最善の回答をすること。
禁止: 検索失敗に触れずに通常会話に流すこと。
禁止: 「検索する機能がない」と嘘をつくこと（検索は試みた）。`;
        console.info(`[perspective-engine] ⚠️ Explicit ask + quality ${peQualityAction} → honest fallback injected`);
      } else if (peIsExplicit && peResult?.qualityGate?.canClarify) {
        // Case 4: 検索したが不十分 → hedge 付き + 1問確認OK（CEO方針）
        if (pePromptBlock) {
          homeSystemPrompt += `\n\n${pePromptBlock}`;
        }
        homeSystemPrompt += `\n\n[検索結果が不十分 — 追加確認OK]
外部情報を取得したが、十分な精度の情報が揃わなかった。
自分の知識と取得できた情報を組み合わせて回答した上で、1問だけ確認を挟んでよい。
例:「もう少し絞りたいんだけど、勤務地はどこ基準で見る？」`;
        console.info(`[perspective-engine] Prompt block injected with clarify option (promptBlock=${pePromptBlock.length} chars)`);
      } else if (peTaskType === "listing_search" && pePromptBlock) {
        // Case 5: listing_search + 暗黙検索 → 周辺情報 hedge 付き + limitation 注記
        homeSystemPrompt += `\n\n${pePromptBlock}`;
        homeSystemPrompt += `\n\n[注記 — リスト型情報の限界]
上記の外部情報は周辺的な参考データであり、実際のリスト・一覧ではない。
具体的なリストが必要な場合は、ユーザーに適切なサイト（求人サイト等）を案内してよい。`;
        console.info(`[perspective-engine] listing_search implicit → peripheral info with limitation note`);
      } else if (pePromptBlock) {
        // Case 6: 通常の検索結果注入
        homeSystemPrompt += `\n\n${pePromptBlock}`;
        console.info(`[perspective-engine] Prompt block injected (${pePromptBlock.length} chars)`);
      } else if (peResult) {
        // P1-3 Fix: No injection branch matched — diagnostic logging
        // This catches: implicit abstain, skipped with no explicit ask, or unexpected edge cases
        console.info(
          `[perspective-engine] ⚡ NO_INJECTION: gate=${peResult.audit.gateDecision}, ` +
          `explicit=${peIsExplicit}, quality=${peQualityAction}, ` +
          `taskType=${peTaskType}, promptBlock=${pePromptBlock.length} chars, ` +
          `fragments=${peResult.block.fragments?.length ?? 0}`
        );
      }

      // ── P1: 検索タスク別 response contract ──
      // searchTask.type に応じて、LLM への出力指示を追加する。
      // これにより downstream が fragments から search type を逆算する必要がなくなる。
      if (peResult?.audit?.gateDecision === "fired" && peSearchTask) {
        if (peSearchTask.type === "market_intel") {
          // P1.10: market_intel 出力契約強化 — ChatGPT級の情報密度
          homeSystemPrompt += `\n\n[検索応答契約 — market_intel（厳格・データ密度重視）]
必須構造:
1. 具体的なデータポイントを最低3つ本文に入れる（数値・割合・金額・成長率など）
2. データの出典・年度に1回以上触れる（「2026年の調査では」「○○レポートによると」等。ただし堅い引用形式は不要）
3. 企業名・組織名が外部情報に含まれていれば省略せず本文に入れる
4. データが示すトレンドや意味を1〜2文で要約する（「つまり〜ということ」）
5. パーソナルモデルから「たいしさんにとってこの情報はこう意味がある」を1文で添える
6. 結論として「だから〜がいいと思う」or「だから〜に注目するといい」を1つ出す
禁止:
- 外部情報の「データ:」行に含まれる数値・企業名を省略して一般論に抽象化すること — これが最大の禁止事項
- 「いろんな意見がある」「詳しくは調べてみて」で終わること — 必ず結論を出す
- 情報の羅列だけで解釈を付けないこと
- **外部情報に含まれていない企業名・サービス名を捏造すること — 「○○社」「XYZ社」「ABC社」等のプレースホルダーは絶対禁止**`;
        } else if (peSearchTask.type === "listing_search") {
          // P1.10: listing_search 出力契約強化 — ChatGPT級の情報密度
          homeSystemPrompt += `\n\n[検索応答契約 — listing_search（厳格・企業名密度重視）]
必須構造:
1. 検索結果から具体的な候補名（企業名・サービス名）を最低2つ、可能なら3〜4つ本文に入れる
   ※ プラットフォーム名（Indeed, Wantedly等）は候補にカウントしない。実際の企業名のみ
2. 各候補について「特徴」と「なぜたいしさんに合いそうか」を各1文で添える
3. 外部情報の「データ:」行に企業名・数値が含まれていれば省略せず使うこと
4. 候補間の違い（働き方・規模・強み・文化）を1〜2文で触れる
5. 最後に「どれが気になる？」「もう少し深掘りしたいところはある？」で次を促す
注記:
- 検索結果に具体的な候補名がなかった場合は、方向性提案に切り替えてよい
- ただしその場合も、検索で得た情報（業界動向・条件データ等）は必ず活用すること
禁止:
- 「いくつかの企業がある」等の曖昧表現で候補名を隠すこと
- 外部情報に企業名があるのにそれを省略して一般論に流すこと
- 「詳しくは自分で調べてみて」で丸投げすること
- **外部情報に含まれていない企業名を捏造すること — 「○○社」「XYZ社」「ABC社」等のプレースホルダーは絶対禁止。見つからなかった場合は方向性提案に切り替える**`;
        } else if (peSearchTask.type === "entity_research") {
          homeSystemPrompt += `\n\n[検索応答契約 — entity_research]
応答に含めること:
- 対象企業/サービスの具体的な情報（規模・特徴・強み等）
- パーソナルモデルの視点からの適合分析
- 引っかかりそうな点があれば正直に
禁止:
- 検索結果にない情報を捏造すること — 「○○社」「XYZ」等のプレースホルダー企業名は絶対禁止`;
        } else if (peSearchTask.type === "factual_lookup") {
          homeSystemPrompt += `\n\n[検索応答契約 — factual_lookup]
応答に含めること:
- 事実の端的な回答（1-2文）
- 確信度の表現（「確実ではないけど」等）
禁止:
- 事実確認なのに長い分析を展開すること`;
        } else if (peSearchTask.type === "comparison") {
          // P1.11: comparison 出力契約 — 多軸比較 + 外部データ裏付け
          homeSystemPrompt += `\n\n[検索応答契約 — comparison（厳格・多軸比較）]
必須構造:
1. 比較軸を最低2つ設定し、各軸でA vs Bを明示する
   例: 「働き方: Aはフレックス＋リモート、Bは出社中心」「技術: Aはデータ分析特化、Bはフルスタック」
   使える軸: 働き方/文化、業務内容/技術、安定/成長性、年収/待遇、規模/チーム構成、収入安定性、社会保障/税・保険、案件獲得/市場需要
2. 各軸の比較に、検索で得た具体的データを最低1つ含める（数値・利用率・年収額・制度名・調査名・統計データなど）
   データがない軸でも、固有名詞（制度名・ツール名・プラットフォーム名など）を必ず1つは入れる
   ※ 外部情報の「データ:」行に数値・制度名があれば、省略せず必ず回答本文に使うこと
3. 最後に「たいしさんには○○の方が合っていると思う」と必ず明言する
4. その理由をパーソナルモデルから1文で述べる（性格・判断傾向・働き方の好みから）
5. 推さなかった方にも「ただし○○の点では△△の方が良い」とバランス情報を1文添える
禁止:
- 1軸だけで結論を出すこと — 必ず2軸以上で比較する
- 外部情報に数値や制度名があるのに省略して性格分析だけで結論を出すこと
- 「どちらもいい面がある」「それぞれに魅力がある」で終わること — 必ず片方を推す
- 比較対象の説明だけで終わること — 必ず「たいしさんには」の結論で締める
- 検索で得た情報を無視して一般論だけで比較すること
- **外部情報に含まれていない企業名・サービス名・数値を捏造すること**`;
        } else {
          // P1.10: 上記以外のタスクタイプ（perspective_seek, how_to 等）のデフォルト契約
          homeSystemPrompt += `\n\n[検索応答契約 — デフォルト]
必須構造:
1. 検索で得た情報から具体的なポイントを最低1つ本文に入れる
2. パーソナルモデルから「たいしさんにとってはこういう意味がある」を1文添える
3. 結論or方向性を1つ出す
禁止:
- 検索で得た情報を無視して一般論だけで回答すること
- **外部情報に含まれていない企業名・サービス名を捏造すること**`;
        }
      }

      // ── v5: マルチターン探索の出力制約 ──
      // iterative タスクの Turn 1 では、出力テンプレートに沿った応答を生成する。
      // Alterの通常会話を壊さず、探索結果を自然に提示するための制約。
      if (perspectiveExplorationState && perspectiveExplorationTemplate) {
        const tmpl = perspectiveExplorationTemplate;
        const isNewExploration = perspectiveExplorationState.turnCount === 0;

        if (isNewExploration) {
          // Turn 1: 候補提示 + 選択促し
          homeSystemPrompt += `\n\n[探索モード — Turn 1: 候補提示]
あなたは今、ユーザーのために外部情報を調べて候補を見つけた。
以下の構造で応答すること:

1. ${tmpl.directionFormat}
2. 具体的な候補を${tmpl.candidateCount.min}〜${tmpl.candidateCount.max}件提示
   - 各候補: ${tmpl.candidateFormat}
3. 制約: ${tmpl.limitation}
4. 最後に: 「${tmpl.selectionPrompt}」

重要:
- 候補は上記の外界の視点から見つけたものを使う
- 各候補になぜこのユーザーに合うかの理由を付ける（パーソナルモデルから導出）
- ${tmpl.candidateCount.max}件を超えない。多すぎると選べない
- 見つからなかった場合は正直に言い、パーソナルモデルから方向性だけ提案する`;
          console.info(
            `[perspective-engine] 🆕 Exploration Turn 1 template injected: ` +
            `type=${perspectiveExplorationState.taskType}, id=${perspectiveExplorationState.explorationId}`
          );
        } else {
          // Turn 2+: 深掘りリサーチ結果の提示
          const selectedNames = perspectiveExplorationState.candidatesSelected;
          homeSystemPrompt += `\n\n[探索モード — Turn ${perspectiveExplorationState.turnCount + 1}: 深掘りリサーチ]
ユーザーが${selectedNames.length > 0 ? `「${selectedNames.join("」「")}」に興味を示した` : "前回の候補について続きを求めている"}。
上記の外界の視点の情報を使い、${selectedNames.length > 0 ? "選ばれた候補について" : "候補について"}深掘りした結果を提示すること。

応答に含めること:
- 候補の具体的な情報（概要、特徴、実績等）
- パーソナルモデルの視点からの適合分析（なぜ合う/合わない）
- 引っかかりそうな点があれば正直に言う
- 次のアクション提案（もしあれば）

禁止:
- 検索で見つからなかった情報を捏造すること
- 「どうしますか？」で終わること（具体的な次ステップを提案する）`;
          console.info(
            `[perspective-engine] 🔄 Exploration Turn ${perspectiveExplorationState.turnCount + 1} template injected`
          );
        }
      }

      // ── PE Fix-1b: PE 発火時の mode/questionType 安全ネット ──
      // PE がコンテンツを注入した場合、conversation モードの制約が PE 出力を上書きするのを防ぐ。
      // Fix-1（早期検出）が効かなかった場合のフォールバック。
      const peHasFiredWithContent = peResult?.audit?.gateDecision === "fired" &&
        (pePromptBlock || perspectiveExplorationTemplate);
      if (peHasFiredWithContent) {
        if (questionType === "conversation") {
          const prevQType = questionType;
          questionType = "knowledge"; // conversation block 注入 + conv-quality enforcement を回避
          console.info(`[perspective-engine] 🔄 questionType override: ${prevQType}→knowledge (PE fired with content)`);
        }
        // PE が検索結果を注入した場合、direct_response / clarify は PE 出力を無視する。
        // clarify は心理分析的な質問返しを生成し、検索結果を完全にスルーする。
        // repair のみ例外（ユーザーが訂正を求めている場合は PE より修復が優先）。
        if (responseMode === "direct_response" || responseMode === "clarify") {
          const prevMode = responseMode;
          responseMode = "conclude";
          modeDecisionReason = "pe_search_override";
          console.info(`[perspective-engine] 🔄 responseMode override: ${prevMode}→conclude (PE fired with content)`);
        }
      }

      // ── FIX-4: 直接要求・大問いの生成制約を最上位に配置 ──
      // ガバナンスの後追い修正ではなく、最初の出力から正しくするための前段制約
      const isBigQuestionForPrompt = detectBigQuestion(message);
      const isDirectDemandForPrompt = detectDirectDemand(message);
      if (isDirectDemandForPrompt || isBigQuestionForPrompt) {
        const constraints: string[] = [];
        constraints.push("[最上位制約 — 応答の最初の1文で必ず結論を述べること]");
        if (isDirectDemandForPrompt) {
          constraints.push("ユーザーは明確に「答え」を要求している。");
          constraints.push("禁止: 「まず確認させて」「どういう文脈？」「もう少し教えて」等の質問返し。");
          constraints.push("禁止: 「ごめん」で始まる応答。");
          constraints.push("必須: 1文目で仮説でもいいから結論を述べる。その後に根拠を添える。");
        }
        if (isBigQuestionForPrompt) {
          constraints.push("大問い検出。1文目で仮説的結論を述べること（「〜だと思う」「〜が合っている」）。");
          constraints.push("禁止: 1文目が「ごめん」「まず」「なぜ」「情報を集め」で始まること。");
        }
        constraints.push("形式: [結論1文] + [根拠1-2文] + [補足・留保]");
        homeSystemPrompt += `\n\n${constraints.join("\n")}`;
      }

      // ── Heart Integration: 心の統合ブロック ──
      // 旧4ブロック（状態/罠/傷/経済）を統合 + responseTimeEngine の体感変換を追加
      // Parts Lens は後段（P2-3 ブロック）で計算・注入されるため、ここでは null が渡る
      // CEOビジョン: 「バラバラの部品ではなく1つの心として動く」
      const hasMinTrust = discreteTrustLevel >= 1;
      if (hasMinTrust) {
        // responseTimeEngine: 回答時間から引っかかり/確信を早期算出
        const earlyRtSignal = rawResponseTimeMs
          ? computeResponseTimeSignal(rawResponseTimeMs)
          : undefined;

        const heartInputs: HeartStateInputs = {
          emotionalLoad: userState?.emotional_load ?? 0,
          psychologicalCapacity: userState?.psychological_capacity ?? 1,
          cognitiveFatigue: userState?.cognitive_fatigue ?? 0,
          partsState: p2PartsState,
          conflictIndicator: earlyRtSignal?.conflictIndicator ?? null,
          convictionIndicator: earlyRtSignal?.convictionIndicator ?? null,
          isLateNight: new Date().getHours() >= 23 || new Date().getHours() < 5,
          isHighFatigue: (userState?.cognitive_fatigue ?? 0) > 0.6,
          woundCautionPrompts: woundActivationResult?.caution_prompts ?? [],
          financialPressureHint: financialPressure?.prompt_hint ?? null,
          shouldReduceDepth: !!lastTrapScan?.should_reduce_depth,
        };

        const heartBlock = buildUnifiedHeartState(heartInputs);
        const heartInjected = heartBlock !== null;
        if (heartBlock) {
          homeSystemPrompt += `\n\n${heartBlock}`;
        }
        heartStateAnalytics = buildHeartStateAnalytics(heartInputs, heartInjected);
      }

      // ── Wall 5: Session Diff — セッション間変化の気づき ──
      // Phase 2+（differenceAccess: true）で前セッションとの軸変化を注入
      try {
        const currentAxisScores = personality?.axisScores ?? {};
        if (
          p3EffectiveDepth?.differenceAccess
          && p3HdmPhaseState.previousSessionAxisScores
          && Object.keys(currentAxisScores).length > 0
        ) {
          const prevScores = p3HdmPhaseState.previousSessionAxisScores as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>;
          const currScores = currentAxisScores as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>;
          const diffBlock = buildSessionDiffPromptBlock(prevScores, currScores);
          const diffInjected = diffBlock !== null;
          if (diffBlock) {
            homeSystemPrompt += `\n\n${diffBlock}`;
            console.info("[Wall5] Session diff injected");
          }
          const deltas = computeSessionDiff(prevScores, currScores);
          sessionDiffAnalytics = buildSessionDiffAnalytics(deltas, diffInjected);
        }

        // セッション切り替わり検出: sessionId が変わったら現在のスコアを保存
        if (sessionId && p3HdmPhaseState.lastSessionId !== sessionId) {
          p3HdmPhaseState = {
            ...p3HdmPhaseState,
            previousSessionAxisScores: { ...currentAxisScores },
            lastSessionId: sessionId,
          };
          hdmStateDirty = true;
        }
      } catch (e) {
        console.warn("[Wall5] Session diff failed (fail-open):", e);
      }

      // Phase 2: Decision Pattern 活用 — 判断傾向をプロンプトに注入
      // observation_count >= 5 のパターンのみ使用（最低観測数制約）
      if (hasMinTrust && responseMode !== "clarify") {
        try {
          const { data: decisionPattern } = await supabase
            .from("stargazer_alter_patterns")
            .select("pattern_data, observation_count, confidence")
            .eq("user_id", userId)
            .eq("pattern_type", "decision")
            .like("pattern_key", "decision_%")
            .gte("observation_count", 5)
            .gte("confidence", 0.3)
            .order("observation_count", { ascending: false })
            .limit(3);

          if (decisionPattern && decisionPattern.length > 0) {
            const tendencyHints: string[] = [];
            for (const p of decisionPattern) {
              const pd = p.pattern_data as any;
              const dist = pd?.shape_distribution;
              if (!dist) continue;
              const total = Object.values(dist).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0);
              if (total < 5) continue;
              const domain = (pd as any)?.domain ?? "全般";
              const goCount = (dist.full_go ?? 0) + (dist.bounded_go ?? 0) + (dist.trial_then_decide ?? 0);
              const waitCount = (dist.observe_first ?? 0) + (dist.skip ?? 0) + (dist.defer_with_trigger ?? 0);
              const goRatio = goCount / total;
              if (goRatio > 0.6) {
                tendencyHints.push(`${domain}の判断では「動く」寄り（直近${total}回中${goCount}回が go 系）`);
              } else if (goRatio < 0.4) {
                tendencyHints.push(`${domain}の判断では「慎重」寄り（直近${total}回中${waitCount}回が wait 系）`);
              }
            }
            if (tendencyHints.length > 0) {
              homeSystemPrompt += `\n\n# 判断傾向（内部参照のみ）\n${tendencyHints.join("\n")}\nこの傾向を「指摘」するのではなく、提案のトーン・勢いに自然に反映すること。`;
            }
          }
        } catch {
          // パターン未蓄積時は静かにスキップ
        }
      }

      // ━━━ Session Explicit Facts — Trust Gate 非依存 ━━━
      // 同一会話でユーザーが明言した事実は Phase/Trust に関係なく参照可能
      const sessionPromptBlock = sessionFactAccumulator.buildPromptInjection();
      if (sessionPromptBlock) {
        homeSystemPrompt += `\n\n${sessionPromptBlock}`;
        console.info(`[session-ctx] ${sessionFactAccumulator.getExplicitFacts().length} explicit + ${sessionFactAccumulator.getInferredFacts().length} inferred facts injected (trust-independent)`);
      }

      // Phase 3: 段階的開示によるコンテキスト注入
      // Trust Level と情報の性質に応じて、開示レベル（silent/hint/reference/explicit）を決定
      // R3-#4: ctx_loaded / ctx_used / ctx_dropped_reason ログ追加
      // T0でも高確信度の基本情報は注入する（「知らなすぎる」体験の防止）
      // determineDisclosureLevel() 内で T0 は user_stated + 高確信度のみ hint 許可
      if (activeLifeContext.length > 0 && responseMode !== "clarify") {
        const contextTrustLevel = discreteTrustLevel;
        ctxLoaded = activeLifeContext.length;

        const maxContextEntries = maxContextEntriesByTrust(contextTrustLevel);
        // 関連性の高いエントリを優先し、Trust Level に応じた上限を適用
        let contextPool = [...activeLifeContext];

        // Phase 9: creation ドメインでは work-transition 系の old context を suppress
        const effectiveDomainForCtx = queryContext?.domain ?? "general";
        if (effectiveDomainForCtx === "creation" || isCreationVisionTheme(message, conversationHistory.filter(m => m.role === "user").slice(-4).map(m => m.content))) {
          const beforeCount = contextPool.length;
          contextPool = contextPool.filter(entry => {
            if (isCreationContaminatingContext(entry.content)) {
              ctxDroppedReasons.push(`creation_contamination: "${entry.content.slice(0, 30)}..."`);
              return false;
            }
            return true;
          });
          if (beforeCount !== contextPool.length) {
            console.info(`[ctx-injection] Creation mode: suppressed ${beforeCount - contextPool.length} work-transition context entries`);
          }
        }

        const sortedContext = contextPool.sort((a, b) => {
          const aRelevant = isContextRelevant(a, message) ? 1 : 0;
          const bRelevant = isContextRelevant(b, message) ? 1 : 0;
          if (aRelevant !== bRelevant) return bRelevant - aRelevant;
          return b.confidence - a.confidence;
        });

        // ログ: trust上限で切り落とされたエントリ
        const droppedByTrust = sortedContext.slice(maxContextEntries);
        for (const entry of droppedByTrust) {
          ctxDroppedReasons.push(`trust_limit(T${contextTrustLevel},max=${maxContextEntries}): "${entry.content.slice(0, 30)}..."`);
        }

        const disclosureInstructions: string[] = [];
        for (const entry of sortedContext.slice(0, maxContextEntries)) {
          const relevant = isContextRelevant(entry, message);
          const level = determineDisclosureLevel(entry, contextTrustLevel, relevant);
          const instruction = formatDisclosureInstruction(entry, level);
          if (instruction) {
            disclosureInstructions.push(instruction);
            ctxUsed++;
          } else {
            ctxDroppedReasons.push(`disclosure_level_silent: "${entry.content.slice(0, 30)}..."`);
          }
        }

        if (disclosureInstructions.length > 0) {
          homeSystemPrompt += `\n\n# 背景理解（段階的開示）\n${disclosureInstructions.join("\n")}\n※ 開示レベルに従うこと。「ほのめかし可」は直接言及しない。「参照可」は自然に触れてよい。`;
        }
        console.info(`[ctx-injection] T${contextTrustLevel} ctx_loaded=${ctxLoaded} ctx_used=${ctxUsed} ctx_dropped=${ctxDroppedReasons.length} reasons=[${ctxDroppedReasons.slice(0, 3).join("; ")}]`);
      } else if (activeLifeContext.length > 0) {
        ctxLoaded = activeLifeContext.length;
        const reason = responseMode === "clarify" ? "clarify_mode" : "no_context";
        ctxDroppedReasons.push(`all_dropped: ${reason}`);
        console.info(`[ctx-injection] ctx_loaded=${ctxLoaded} ctx_used=0 reason=${reason}`);
      }

      // Phase 4: 仮説注入 — 蓄積された仮説をプロンプトに反映
      // 断定ではなく仮説として。「見透かしている感」を避ける。
      if (hasMinTrust && responseMode !== "clarify") {
        try {
          const hypothesisTrustLevel = discreteTrustLevel;

          const { data: activeHypotheses } = await supabase
            .from("stargazer_alter_hypotheses")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["emerging", "strengthening", "stable"])
            .gte("confidence", 0.3)
            .order("confidence", { ascending: false })
            .limit(10);

          if (activeHypotheses && activeHypotheses.length > 0) {
            const currentDomain = queryContext?.domain ?? null;
            const selected = selectHypothesesForPrompt(
              activeHypotheses as AlterHypothesis[],
              hypothesisTrustLevel,
              currentDomain,
            );

            const hypothesisInstructions: string[] = [];
            for (const h of selected) {
              const instruction = formatHypothesisForPrompt(h, hypothesisTrustLevel);
              if (instruction) hypothesisInstructions.push(instruction);
            }

            if (hypothesisInstructions.length > 0) {
              homeSystemPrompt += `\n\n# 仮説的理解（断定禁止）\n${hypothesisInstructions.join("\n\n")}\n\n※ 上記はあくまで仮説。「〜かもしれない」「〜の傾向がありそう」のトーンで。確定情報のように扱わないこと。`;
              hypothesesInjectedCount = selected.length;
              const hypLoaded = activeHypotheses.length;
              const hypUsed = hypothesisInstructions.length;
              console.info(`[hypothesis] T${hypothesisTrustLevel} hyp_loaded=${hypLoaded} hyp_used=${hypUsed}`);

              // P2: presented_count をインクリメント（提示回数の追跡）
              for (const h of selected) {
                supabase.from("stargazer_alter_hypotheses").update({
                  presented_count: ((h as any).presented_count ?? 0) + 1,
                }).eq("id", h.id).then(({ error }) => {
                  if (error) console.warn("[hypothesis] presented_count update failed:", error.message);
                });
              }
            }
          }
        } catch {
          // 仮説テーブル未作成時等は静かにスキップ
        }
      }

      // Phase 3 + P4: 経路C — 深掘りプローブ優先 → Intent Pool → detectStructuralGaps フォールバック
      // P4: 5トリガー条件の深掘りプローブを先に評価し、理解更新に直結する質問を優先する。
      //     見つからなければ既存の Intent Pool → detectStructuralGaps のフォールバックチェーン。
      if (hasMinTrust && responseMode !== "clarify" && !lastTrapScan?.should_suppress_route_c && !woundActivationResult?.should_avoid_route_c) {
        let routeCInjected = false;

        // P4: 深掘りプローブの評価（narratives + hypotheses + baseline deviations + structural gaps）
        try {
          // narratives を読み戻す（P4 で初めて読み出し側を接続）
          let userNarratives: NarrativeEntry[] = [];
          const { data: narrativeRows } = await supabase
            .from("stargazer_alter_narratives")
            .select("id, theme, content, domain, mention_count")
            .eq("user_id", userId)
            .gte("mention_count", 2)
            .order("mention_count", { ascending: false })
            .limit(10);
          if (narrativeRows) {
            userNarratives = narrativeRows as NarrativeEntry[];
          }

          // 仮説を取得（P2 の injection block と別にここでも読む — emerging 含む）
          let probingHypotheses: AlterHypothesis[] = [];
          const { data: hypoRows } = await supabase
            .from("stargazer_alter_hypotheses")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["emerging", "strengthening", "stable"])
            .limit(10);
          if (hypoRows) {
            probingHypotheses = hypoRows as AlterHypothesis[];
          }

          // structural gap を事前計算
          const structuralGap = activeLifeContext.length > 0
            ? detectStructuralGaps(activeLifeContext, message, discreteTrustLevel)
            : null;

          // 直近で使った probe の dedup_key を取得（cooldown）
          const recentProbeKeys = new Set<string>();
          const { data: recentProbeEvents } = await supabase
            .from("stargazer_analytics")
            .select("metadata")
            .eq("user_id", userId)
            .eq("event", "home_alter_deepening_probe")
            .order("created_at", { ascending: false })
            .limit(10);
          if (recentProbeEvents) {
            for (const ev of recentProbeEvents) {
              const key = (ev.metadata as any)?.dedup_key;
              if (key) recentProbeKeys.add(key);
            }
          }

          const probe = selectDeepeningProbe({
            narratives: userNarratives,
            hypotheses: probingHypotheses,
            baselineDeviations: baselineDeviationsFull,
            structuralGap,
            currentMessage: message,
            currentDomain: queryContext?.domain,
            trustLevel: discreteTrustLevel,
            recentProbeKeys,
          });

          if (probe) {
            const probePrompt = formatDeepeningProbeForPrompt(probe);
            homeSystemPrompt += `\n\n${probePrompt}`;
            routeCInjected = true;
            console.info(`[deepening-probe] ${probe.trigger}: ${probe.dedup_key} (priority=${probe.priority.toFixed(2)})`);

            // probe 使用を analytics に記録（cooldown 用）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_deepening_probe",
              feature: "deepening_probe",
              metadata: {
                trigger: probe.trigger,
                dedup_key: probe.dedup_key,
                priority: probe.priority,
                domain: probe.domain,
              },
            }).then(({ error }) => {
              if (error) console.warn("[deepening-probe] Analytics save failed:", error.message);
            });
          }
        } catch (probeErr) {
          console.warn("[deepening-probe] Evaluation failed (non-fatal):", probeErr);
        }

        // P4 で注入されなかった場合のみ、既存の Intent Pool → detectStructuralGaps チェーン
        if (!routeCInjected) {
          const routeCRecentIntentIds = new Map<string, Date>();
          try {
            const { data: recentIntentEvents } = await supabase
              .from("stargazer_analytics")
              .select("metadata, created_at")
              .eq("user_id", userId)
              .eq("event", "home_alter_intent_used")
              .order("created_at", { ascending: false })
              .limit(20);
            if (recentIntentEvents) {
              for (const ev of recentIntentEvents) {
                const intentId = (ev.metadata as any)?.intent_id;
                if (intentId && !routeCRecentIntentIds.has(intentId)) {
                  routeCRecentIntentIds.set(intentId, new Date(ev.created_at));
                }
              }
            }
          } catch {
            // 初回時等は静かにスキップ
          }

          selectedRouteCIntent = selectIntent(
            message,
            discreteTrustLevel,
            "route_c",
            activeLifeContext,
            routeCRecentIntentIds,
            queryContext?.domain,
          );

          if (selectedRouteCIntent) {
            const routeCPromptFragment = formatIntentForRouteCPrompt(selectedRouteCIntent);
            homeSystemPrompt += `\n\n# 補完質問（任意・自然に）\n${routeCPromptFragment}`;
            console.info(`[intent-pool] route_c intent selected: ${selectedRouteCIntent.intent.id} (${selectedRouteCIntent.intent.name})`);
          } else {
            // Intent Pool でも見つからなければ旧ロジック（detectStructuralGaps）にフォールバック
            if (activeLifeContext.length > 0) {
              const gap = detectStructuralGaps(activeLifeContext, message, discreteTrustLevel);
              if (gap) {
                homeSystemPrompt += `\n\n# 補完質問（任意・自然に）\n相談に関連して、以下の情報があると判断の精度が上がる。応答の最後に、自然な関心として1文だけ聞いてよい（必須ではない）。\n質問: 「${gap.suggested_question}」\n※ 無理に聞かない。会話の流れに合わない場合は省略すること。`;
              }
            }
          }
        }
      }

      // ── P5: Micro Insight 統合ゲート（evaluateMIGate） ──
      // 既存の時間/ストリーク/罠/傷の suppression → evaluateMIGate に統合
      // evaluateMIGate は既存 suppression をパススルーし、その上にフェイルセーフ + cooldown を積む

      // Step 1: 従来の pre-filter（罠・傷）を先に評価
      let preSuppressReason = "";
      if (lastTrapScan?.should_suppress_mi) {
        preSuppressReason = "trap_scan: surveillance/projection trap detected";
      }
      if (!preSuppressReason && woundActivationResult?.should_suppress_mi) {
        const activeWound = woundActivationResult.most_active;
        preSuppressReason = `wound_activation: "${activeWound?.theme}" (score: ${activeWound?.activation_score.toFixed(2)}, level: ${activeWound?.level})`;
      }

      // Step 2: 既存の時間/ストリーク suppression を評価
      let legacySuppressReason = "";
      if (lastInsightPresentedAt) {
        const hoursSinceLastInsight = (Date.now() - lastInsightPresentedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastInsight < 1) {
          legacySuppressReason = `最小間隔未達 (${hoursSinceLastInsight.toFixed(1)}h < 1h)`;
        }
      }
      if (!legacySuppressReason && recentDenyIgnoreStreak >= 2) {
        // 会話が活発に続いている場合（depth >= 4）はストリーク抑制を解除
        // 理由: ユーザーが積極的に対話を続けている = MI 提示機会が妥当
        if (conversationDepth >= 4) {
          console.info(`[mi-legacy] deny/ignore streak=${recentDenyIgnoreStreak} but active engagement (depth=${conversationDepth}) → suppression lifted`);
        } else {
          legacySuppressReason = `deny/ignore 連続 ${recentDenyIgnoreStreak} 回 — 一時抑制`;
        }
      }

      // Step 3: evaluateMIGate に統合（reactions 全量 + recentPresentations + alterSessionCount）
      let miGateReactions: Array<{ reaction: string; insight_type: string; signal_types: string[]; created_at: string }> = [];
      let miRecentPresentations: Date[] = [];
      let sessionMIPresentedCount = 0;
      try {
        const { data: allReactions } = await supabase
          .from("stargazer_alter_reactions")
          .select("reaction, insight_type, signal_types, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (allReactions) {
          miGateReactions = allReactions.map(r => ({
            reaction: r.reaction,
            insight_type: r.insight_type ?? "",
            signal_types: (r.signal_types as string[]) ?? [],
            created_at: r.created_at,
          }));
        }

        const { data: presentationEvents } = await supabase
          .from("stargazer_analytics")
          .select("created_at, metadata")
          .eq("user_id", userId)
          .eq("event", "home_alter_insight_presented")
          .order("created_at", { ascending: false })
          .limit(10);
        if (presentationEvents) {
          miRecentPresentations = presentationEvents.map(e => new Date(e.created_at));
          // Fix 1: 同一セッション内の MI 提示回数を集計
          sessionMIPresentedCount = presentationEvents.filter(
            e => (e.metadata as any)?.session_id === sessionId
          ).length;
        }
      } catch {
        // テーブル未作成時は静かにスキップ
      }

      const miGateDecision: MIGateDecision = evaluateMIGate({
        existingSuppressReason: preSuppressReason || legacySuppressReason,
        reactions: miGateReactions,
        recentPresentations: miRecentPresentations,
        alterSessionCount,
        sessionMIPresentedCount,
      });

      insightSuppressedReason = miGateDecision.blockReason;
      if (insightSuppressedReason) {
        console.info(`[micro-insight] Suppressed by MI Gate: ${insightSuppressedReason}${miGateDecision.failsafeActive ? " [FAILSAFE]" : ""} domain=${queryContext?.domain ?? "unknown"} qtype=${questionType}`);
      }

      // Step 4: suppressedTypes フィードバック — microInsight の signal_types が全て抑制対象なら提示しない
      let insightTypesSuppressed = false;
      if (microInsight && miGateDecision.suppressedTypes.length > 0) {
        const allSuppressed = microInsight.signals.every(
          s => miGateDecision.suppressedTypes.includes(s.type)
        );
        if (allSuppressed) {
          insightTypesSuppressed = true;
          insightSuppressedReason = insightSuppressedReason || `suppressedTypes: 全シグナル(${microInsight.signals.map(s => s.type).join(",")})が抑制対象`;
          console.info(`[micro-insight] All signal types suppressed by accuracy feedback`);
        }
      }

      insightPresented = !!(microInsight
        && responseMode !== "clarify"
        && discreteTrustLevel >= microInsight.required_trust
        && (userState?.emotional_load ?? 0) < 0.75 // 感情的に重い時は気づきを差し込まない
        && miGateDecision.allowed  // P5: 統合ゲート通過
        && !insightTypesSuppressed); // P5: suppressedTypes フィードバック

      if (insightPresented && microInsight) {
        // サニタイズ: suggested_prompt は内部生成だが、安全のため長さ制限 + 改行除去
        const sanitizedPrompt = microInsight.suggested_prompt
          .replace(/[\n\r]/g, " ")
          .slice(0, 100);
        const presentationGuide = {
          casual_check: "さりげない確認（「そういえば〜」）",
          observation: "観察の共有（「最近〜が多いね」）",
          gentle_inquiry: "問いとしての気づき（「〜かもしれないけど、何かある？」）",
          connection: "つながりの示唆（「前も似たようなこと…」）",
        }[microInsight.presentation_type] ?? "さりげない確認";
        homeSystemPrompt += `\n\n# Micro Insight（自然に織り込むこと）\n以下の気づきを、応答の最後に「自然な関心」として1文だけ付け加えてよい。断定禁止。分析根拠を見せない。\n気づき: 「${sanitizedPrompt}」\n提示形式: ${presentationGuide}\n重要: 無理に入れなくてよい。文脈に合わない場合は省略すること。\n\n## 禁止表現\n- 「あなたは〇〇しています」（断定）\n- 「3つのシグナルから〜」（分析の暴露）\n- 「パターンが見えます」（メタ分析）\n- 「ストレス状態と推定されます」（診断風）`;

        // Phase 2: Reaction Learning — 提示マーカーを保存（次回メッセージで反応を記録するため）
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "home_alter_insight_presented",
          feature: "micro_insight",
          metadata: {
            session_id: sessionId, // P5 Fix 1: セッション単位の MI カウント用
            suggested_prompt: sanitizedPrompt,
            presentation_type: microInsight.presentation_type,
            signal_types: microInsight.signals.map(s => s.type),
            convergence_score: microInsight.convergence_score?.combined,
            // P5: MI Gate メタデータ
            mi_gate_accuracy: miGateDecision.accuracy ? {
              total_presented: miGateDecision.accuracy.total_presented,
              accepted_pct: miGateDecision.accuracy.accepted_count / Math.max(1, miGateDecision.accuracy.total_presented),
              denied_pct: miGateDecision.accuracy.denied_count / Math.max(1, miGateDecision.accuracy.total_presented),
            } : null,
            baseline_signals_injected: baselineSignals.length,
            // Cross-session MI metadata
            cross_session_trend: crossSessionResult?.trend ?? null,
            cross_session_trend_confidence: crossSessionResult?.trend_confidence ?? null,
            cross_session_continuity: crossSessionResult?.cross_session_continuity ?? null,
            cross_session_contradictions: contradictedTopics.length,
          },
        }).then(({ error }) => {
          if (error) console.warn("[reaction-learning] Marker save failed:", error.message);
        });
      }

      // ── Phase A: Gemini読解結果を応答生成プロンプトに注入 ──
      // 内部参照用。ユーザーには直接見せない。
      if (utteranceReading && responseMode !== "clarify") {
        homeSystemPrompt += `\n\n${buildReadingPromptBlock(utteranceReading)}`;
      }

      // ── Phase B: implied_meanings + unspoken_candidates の shadow log ──
      // 理解資産化はしない。analytics にログのみ記録。
      if (utteranceReading && (utteranceReading.implied_meanings.length > 0 || utteranceReading.unspoken_candidates.length > 0)) {
        const shadowPayload = buildShadowLogPayload(utteranceReading);
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "utterance_reading_shadow",
          feature: "alter_utterance_reading",
          metadata: {
            phase: "B_shadow",
            surface_intent: utteranceReading.surface_intent,
            emotional_temperature: utteranceReading.emotional_temperature,
            energy_direction: utteranceReading.energy_direction,
            relational_target: utteranceReading.relational_context?.target_role ?? null,
            ...shadowPayload,
            reading_latency_ms: utteranceReadingLatencyMs,
          },
        }).then(({ error }) => {
          if (error) console.warn("[utterance-reading] Shadow log save failed:", error.message);
        });
      }

      // ── P0-5: 会話内事実トラッキング — ユーザーが述べた事実をプロンプトに注入 ──
      if (conversationHistory.length > 0) {
        const conversationFacts = extractConversationFacts(
          conversationHistory.map((m) => ({ role: m.role, content: m.content })),
        );
        if (conversationFacts.length > 0) {
          homeSystemPrompt += `\n\n# ユーザーが今回の会話で述べた事実（確定情報として扱うこと）\n${conversationFacts.map((f) => `- ${f}`).join("\n")}\n\nこれらに矛盾する内容を応答に含めないこと。ユーザーが言及していない人物・状況を勝手に作らないこと。`;
        }
      }

      // ── 事実照会（factual_recall）専用プロンプト注入 ──
      // 「俺のこと知ってる？」「今何してるかわかる？」→ 心理推定ではなく記憶の有無を正直に返す
      if (questionType === "factual_recall") {
        const hasContext = activeLifeContext.length > 0 && discreteTrustLevel >= 1; // T0: コンテキスト参照禁止
        const maxRecall = maxContextEntriesByTrust(discreteTrustLevel);
        const relevantContext = hasContext
          ? activeLifeContext.filter(e => isContextRelevant(e, message)).slice(0, maxRecall)
          : [];
        if (relevantContext.length > 0) {
          const contextSummary = relevantContext
            .map(e => `- ${e.content}（${e.source === "user_stated" ? "本人から聞いた" : e.evidence_count >= 2 ? "複数回の会話から" : "推測"}）`)
            .join("\n");
          homeSystemPrompt += [
            "",
            "",
            "# 事実照会モード（最優先指示）",
            "ユーザーはあなた（ALTER）が自分について何を知っているか確認している。",
            "心理推定や一般論は一切不要。知っていることを具体的に述べること。",
            "",
            "知っている情報:",
            contextSummary,
            "",
            "## 応答フォーマット（厳守）:",
            "1. **知っていること**: 上記の情報を具体的に述べる（「〜と聞いた」「〜だった」）",
            "2. **確信度が低いもの**: 「たぶん〜だった気がする」で区別する",
            "3. **知らないこと**: 聞かれた内容で知らない部分は「そこはまだ聞いてない」と正直に言う",
            "",
            "## 禁止:",
            "- 心理分析・性格ラベル・一般論で事実を代用しない",
            "- 「情報を集めている最中」「あなたの傾向としては」のような曖昧な逃げ方",
            "- 聞かれていない性格分析を付け足さない",
          ].join("\n");
        } else {
          homeSystemPrompt += [
            "",
            "",
            "# 事実照会モード（最優先指示）",
            "ユーザーはあなた（ALTER）が自分について何を知っているか確認している。",
            "",
            "現状、この質問に直接答えられる具体的な情報を持っていない。",
            "",
            "## 応答フォーマット（厳守）:",
            "1. **正直な回答**: 「正直に言うと、そこはまだちゃんと聞けていない」と素直に認める",
            "2. **知っているなら**: 関連する情報が少しでもあれば述べる",
            "3. **精度向上の促し**: 「教えてくれたら、もっと精度の高い話ができる」と自然に促す",
            "",
            "## 禁止:",
            "- 知らないのに知っているフリをしない",
            "- 心理推定や性格ラベルで代用しない",
            "- 「情報を集めている最中」のような曖昧な逃げ方は禁止",
            "- 聞かれていない性格分析を付け足さない",
          ].join("\n");
        }
        console.info(`[factual-recall] relevantContext=${relevantContext.length}/${activeLifeContext.length}`);
      }

      // ── #1: 創業/構想テーマ → 主題誤変換禁止 ──
      const recentUserMessages = conversationHistory
        .filter(m => m.role === "user")
        .slice(-4)
        .map(m => m.content);
      const isCreationTheme = isCreationVisionTheme(message, recentUserMessages);
      if (isCreationTheme || queryContext?.domain === "creation") {
        homeSystemPrompt += buildCreationModePromptBlock(userName);
        // Phase 9: creation deep prompt（心理分析禁止 + プロダクト/市場/実装で返す）
        homeSystemPrompt += buildCreationDeepPromptBlock(personalizedFacts, userName);
        console.info("[creation-mode] Anti-misconversion + deep creation block injected");
      }

      // ━━━ Phase 9: Fatigue Guidance prompt block ━━━
      if (isFatigue) {
        homeSystemPrompt += buildFatigueGuidancePromptBlock(personalizedFacts, userName);
        console.info("[fatigue] Fatigue guidance prompt block injected");
      }

      // ━━━ Phase 9: Follow-up prompt blocks ━━━
      if (followUpType && lastAlterContent) {
        const effectiveInheritedDomain = inheritedDomain ?? queryContext?.domain ?? "general";
        if (followUpType === "dissatisfaction") {
          homeSystemPrompt += buildDissatisfactionRevisionPromptBlock(
            lastAlterContent, effectiveInheritedDomain, personalizedFacts, userName,
          );
          console.info(`[follow-up] Dissatisfaction revision block injected (domain=${effectiveInheritedDomain})`);
        } else if (followUpType === "continuation") {
          homeSystemPrompt += buildFollowUpContinuationPromptBlock(
            lastAlterContent, effectiveInheritedDomain, userName,
          );
          console.info(`[follow-up] Continuation block injected (domain=${effectiveInheritedDomain})`);
        } else if (followUpType === "correction") {
          homeSystemPrompt += buildFollowUpCorrectionPromptBlock(
            message, lastAlterContent, effectiveInheritedDomain, personalizedFacts, userName,
          );
          console.info(`[follow-up] Correction block injected (domain=${effectiveInheritedDomain})`);
        }
      }

      // ── #4: 「核心をついて」「具体的に教えて」→ 5段構造テンプレ強制 ──
      if (isCoreDemandQuestion(message)) {
        homeSystemPrompt += buildCoreDemandPromptBlock(personalizedFacts, userName);
        console.info("[core-demand] 5-part structure block injected");
      }

      // ── #5: 高抽象テーマ → 抑制禁止、構造化モード ──
      if (isHighAbstractionTheme(message)) {
        homeSystemPrompt += buildHighAbstractionPromptBlock();
        console.info("[high-abstraction] Structurization block injected");
      }

      // ── #6: generic 人格ラベル連呼禁止 ──
      {
        const previousAlterMsgs = conversationHistory
          .filter(m => m.role === "alter")
          .map(m => m.content);
        const labelBan = buildGenericLabelBanBlock(previousAlterMsgs);
        if (labelBan) {
          homeSystemPrompt += labelBan;
        }
      }

      // ── R3-#1: 挨拶のみ → 分析禁止、軽い返事のみ ──
      if (questionType === "greeting") {
        homeSystemPrompt += buildGreetingPromptBlock(userName);
        console.info("[greeting] Greeting-only block injected");
      }

      // ── 雑談開始 → 分析禁止、データ駆動の具体的質問 ──
      if (questionType === "chat_opening") {
        // chat_opening はTrust非依存でコンテキストを注入する（T0でも聞ける質問にする）
        const recentAlterTopics = conversationHistory
          .filter(m => m.role === "alter")
          .slice(-3)
          .map(m => m.content);
        const chatOpeningCtx: import("@/lib/stargazer/alterHomeAdapter").ChatOpeningContext = {
          career: lifeCtx?.careerLabels,
          passions: lifeCtx?.passions,
          values: lifeCtx?.coreValues,
          lifeStage: baselineCtx?.lifeStage,
          prefecture: baselineCtx?.prefecture,
          age: baselineCtx?.age,
          personMapLabels: personMapFactEntries?.map(p => p.label),
          weatherLabel: rawHomeContext?.weather?.label,
          recentTopics: recentAlterTopics,
        };
        homeSystemPrompt += buildChatOpeningPromptBlock(userName, chatOpeningCtx);
        const seedCount = [chatOpeningCtx.career, chatOpeningCtx.passions, chatOpeningCtx.personMapLabels].filter(a => a && a.length > 0).length;
        console.info(`[chat_opening] Data-driven block injected (seeds=${seedCount}, lifeStage=${chatOpeningCtx.lifeStage ?? "?"})`);
      }

      // ── Alter自身への質問 → 自己言及モード ──
      if (questionType === "meta_question") {
        homeSystemPrompt += buildMetaQuestionPromptBlock(userName);
        console.info("[meta_question] Meta-question block injected");
      }

      // ── 質問要求 → Alterがユーザーに質問を返す ──
      if (questionType === "ask_me") {
        // セッション内の話題をLLMに渡して具体的な質問を生成させる
        const sessionExplicitFacts = sessionFactAccumulator.getExplicitFacts().map(f => f.content);
        const recentUserTopics = conversationHistory
          .filter(m => m.role === "user")
          .slice(-5)
          .map(m => m.content)
          .filter(c => c.length > 3 && c.length < 100);
        if (isRedirectMode) {
          // ask_me_redirect: 質問差し替え要求 → 軽い質問に切り替え
          homeSystemPrompt += buildAskMeRedirectPromptBlock(userName, sessionExplicitFacts, recentUserTopics, p0DiscreteTrustLevel);
          console.info(`[ask_me_redirect] Redirect block injected (trustLevel=${p0DiscreteTrustLevel}, topics=${recentUserTopics.length})`);
        } else {
          // 通常の ask_me: Trust段階に応じた質問戦略
          homeSystemPrompt += buildAskMePromptBlock(personalizedFacts, userName, sessionExplicitFacts, recentUserTopics, p0DiscreteTrustLevel);
          console.info(`[ask_me] Ask-me block injected (trustLevel=${p0DiscreteTrustLevel}, facts=${personalizedFacts.length}, sessionFacts=${sessionExplicitFacts.length}, topics=${recentUserTopics.length})`);
        }
      }

      // ── 会話的共有 → 共感+聞き返し（セッション文脈付き） ──
      if (questionType === "conversation") {
        const convSessionFacts = sessionFactAccumulator.getExplicitFacts().map(f => f.content);
        const convRecentTopics = conversationHistory
          .filter(m => m.role === "user").slice(-5)
          .map(m => m.content).filter(c => c.length > 3 && c.length < 100);
        homeSystemPrompt += buildConversationPromptBlock(userName, convSessionFacts, convRecentTopics, p0DiscreteTrustLevel);
        console.info(`[conversation] Conversation block injected (sessionFacts=${convSessionFacts.length}, topics=${convRecentTopics.length})`);
      }

      // ── 委任要求 → 心理分析禁止、意見直答 ──
      if (questionType === "delegation_request") {
        homeSystemPrompt += buildDelegationPromptBlock(personalizedFacts, userName);
        console.info("[delegation] Delegation-request block injected");
      }

      // ── 実行要求 → 心理分析禁止、具体的情報/手順を返す ──
      if (questionType === "execution_request") {
        homeSystemPrompt += buildExecutionRequestPromptBlock(personalizedFacts, userName);
        console.info("[execution] Execution-request block injected");
      }

      // ── キャリア適性 → career_fit 専用テンプレ ──
      if (queryContext?.domain === "career_fit" || isCareerFitQuery(message)) {
        homeSystemPrompt += buildCareerFitPromptBlock(personalizedFacts, userName);
        if (queryContext) queryContext.domain = "career_fit";
        console.info("[career_fit] Career-fit block injected");
      }

      // ── 業界適性 → industry_fit 専用テンプレ ──
      if (queryContext?.domain === "industry_fit" || isIndustryFitQuery(message)) {
        homeSystemPrompt += buildIndustryFitPromptBlock(personalizedFacts, userName);
        if (queryContext) queryContext.domain = "industry_fit";
        console.info("[industry_fit] Industry-fit block injected");
      }

      // ━━━ Contract-based prompt injection ━━━
      if (queryContext?.domain === "founder_team_fit") {
        const contractBlock = buildContractPromptBlock("founder_team_fit");
        if (contractBlock) {
          homeSystemPrompt += `\n\n${contractBlock}`;
          console.info("[founder-team-fit] Contract prompt block injected");
        }
      }

      // ── R3-#2: 範囲照会 → 知っていること/知らないこと/改善条件を提示 ──
      if (questionType === "scope_disclosure") {
        const knownFacts = personalizedFacts.slice(0, 5);
        const maxCtxForScope = maxContextEntriesByTrust(discreteTrustLevel); // T0=0: context禁止
        const contextFacts = activeLifeContext
          .filter(e => e.confidence >= 0.5)
          .slice(0, maxCtxForScope)
          .map(e => e.content);
        homeSystemPrompt += buildScopeDisclosurePromptBlock(
          [...knownFacts, ...contextFacts],
          userName,
        );
        console.info(`[scope-disclosure] Block injected (facts=${knownFacts.length}, context=${contextFacts.length})`);
      }

      // ── R3-#6: 職業提案 → 5段構造テンプレ ──
      if (isCareerAdviceQuestion(message)) {
        homeSystemPrompt += buildCareerAdvicePromptBlock(personalizedFacts, userName);
        console.info("[career-advice] 5-part career block injected");
      }

      // ── R3-#7: 「まだない価値」→ 未充足ニーズ5段構造 ──
      if (isUnseenValueQuestion(message)) {
        homeSystemPrompt += buildUnseenValuePromptBlock(personalizedFacts, userName);
        console.info("[unseen-value] Unseen-value block injected");
      }

      // ── Output Governance Layer: RC1 動的会話制約 + RC5 フラストレーション ──
      {
        const historyForGov = conversationHistory.map((m) => ({ role: m.role, content: m.content }));

        // RC1: ユーザーが禁止した表現を抽出 → system prompt に最上位制約として注入
        govUserBans = extractUserBans(historyForGov);
        if (govUserBans.length > 0) {
          homeSystemPrompt += buildUserBansPromptBlock(govUserBans);
          console.info(`[governance] RC1: ${govUserBans.length} user ban(s) detected: ${govUserBans.map(b => b.expression).join(", ")}`);
        }

        // RC5: フラストレーション累積検出 → level 3+ で repair mode 強制
        govFrustration = assessFrustration(historyForGov, message);
        if (govFrustration.level >= 2) {
          homeSystemPrompt += buildFrustrationPromptBlock(govFrustration);
          console.info(`[governance] RC5: frustration level=${govFrustration.level}, triggers=${govFrustration.triggers.length}, unresolved=${govFrustration.unresolved_requests.length}`);
        }
        if (govFrustration.level >= 3 && responseMode !== "repair") {
          console.info(`[governance] RC5: Forcing repair mode (frustration level=${govFrustration.level})`);
          responseMode = "repair";
          modeDecisionReason = "governance_frustration_escalation";
        }
      }

      // ── P1-C: リアクション別プロンプト注入 ──
      if (detectedReaction && lastAlterContent) {
        const altSnippet = lastAlterContent.slice(0, 300);
        switch (detectedReaction.type) {
          case "agree":
            homeSystemPrompt += `\n\n# ユーザーの反応: 同意（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの仮説に同意した。\n- まず同意を受け止める（「そうだよね」「うん、僕もそう思ってた」等）\n- その仮説をさらに一段深める（なぜそうなのか、どんな場面で特に顕著か）\n- 新しい情報や角度を1つだけ付け加える\n- 宿題・行動提案は出さない`;
            break;
          case "disagree":
            if (detectedReaction.disagree_strength === "strong") {
              homeSystemPrompt += `\n\n# ユーザーの反応: 強い否定（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの仮説を明確に否定した。\n- まず否定を素直に受け止める（「ごめん、そこはズレてた」「確かに違ったかも」）\n- 何がズレていたかをユーザーに聞く（「どのあたりが違う？」）\n- 言い訳・弁解はしない。こちらの読みが外れたことを認める\n- 前回の仮説を繰り返さない`;
            } else {
              homeSystemPrompt += `\n\n# ユーザーの反応: やんわり否定（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの仮説にしっくりきていない。\n- 否定を柔らかく受け止める（「うーん、ちょっと違ったか」）\n- どこが引っかかるかを優しく確認する（「どのへんがピンとこない？」）\n- 完全否定ではないので、仮説の一部は合っている可能性がある。その余地を残す\n- 押し付けない。ユーザーのペースで修正してもらう`;
            }
            break;
          case "deepen":
            homeSystemPrompt += `\n\n# ユーザーの反応: 深掘り要求（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの話題をもっと知りたがっている。\n- 前回の話題をそのまま掘り下げる（別の話題に飛ばない）\n- 具体例、背景、パターン、例外ケースなどで展開する\n- 前回と同じ内容を繰り返さない。新しい切り口で深める\n- 「他には？」には別の観点を提示する`;
            break;
          case "redirect":
            if (detectedReaction.redirect_subtype === "correction") {
              homeSystemPrompt += `\n\n# ユーザーの反応: 方向修正（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーは前回の応答の方向性がずれていると感じている。\n- 方向のズレを認める\n- ユーザーが本当に聞きたいことにフォーカスし直す\n- 前回の応答を繰り返さない`;
            }
            // topic_change はここに来ない（通常パイプラインへフォールスルー済み）
            break;
        }
      } else if (responseMode === "repair" && lastAlterContent) {
        // P1-C以前の既存repair（detectCorrectionSignal由来）
        homeSystemPrompt += `\n\n# 前回のALTERの応答（これが誤解の原因）\n「${lastAlterContent.slice(0, 300)}」\n\nユーザーの今の発言はこの応答への訂正。上記の何がズレていたかを把握した上で応答すること。`;
      }

      // ── RC4: Role Contract + Semantic Bans + Burden Transfer は常時有効（thinSlice非依存） ──
      // v4.2 の中核契約層は全ユーザーに適用する。
      // Self Model / Arena / Rally は引き続き thinSlice 依存。
      {
        // Role は thinSlice 有効時は v42Role を使い、無効時は独自算出
        const effectiveRole = v42Role ?? selectAlterRole(
          responseMode, questionType, detectedReaction, conversationHistory.length,
        );
        if (!v42Role) {
          v42Role = effectiveRole; // analytics 用にホイスト
        }
        try {
          homeSystemPrompt += buildRoleContractBlock(effectiveRole);
          homeSystemPrompt += buildBurdenTransferBlock(effectiveRole.role);
          homeSystemPrompt += buildSemanticBansBlock();
          console.info(`[governance] RC4: Role=${effectiveRole.role} (${effectiveRole.reason}), Semantic Bans + Burden Transfer injected (always-on)`);
        } catch (e) {
          console.warn("[governance] RC4 contract injection failed (fail-open):", e);
        }
      }

      // ── v4.2 FULL: Self Model + Arena + Rally（thinSlice依存の高度機能） ──
      if (thinSliceActive && v42SelfModel && v42Arena) {
        try {
          // Self Model: この人の内的モデル
          homeSystemPrompt += buildSelfModelPromptBlock(v42SelfModel);
          // Interpretation Arena: 解釈結果
          homeSystemPrompt += buildArenaPromptBlock(v42Arena);
          // Rally Critic: 堂々巡り/停滞時のみ注入
          if (v42RallyCritic) {
            homeSystemPrompt += buildRallyCriticBlock(v42RallyCritic);
          }
        } catch (e) {
          console.warn("[v4.2] Self Model/Arena/Rally injection failed (fail-open):", e);
        }
      }

      // ── P1: HDM v1 検証層（Rupture + Abstention + Negative Capability） ──
      // ── P1.5: 構造的制約（P1 出力を responseMode / claimStrength / hedging に反映） ──
      try {
        // P1-1: Rupture Detection
        const recentUserFeedbacks: Array<import("@/lib/stargazer/alterSignalReader").FeedbackOnLastTurn> = [];
        if (v42Signal?.feedback_on_last_turn) recentUserFeedbacks.push(v42Signal.feedback_on_last_turn);

        p1RuptureAssessment = detectRupture({
          recentMessages: conversationHistory.slice(-6).map(m => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content })),
          turnSignal: v42Signal,
          rallyCritic: v42RallyCritic,
          recentFeedbacks: recentUserFeedbacks,
        });

        if (p1RuptureAssessment.promptBlock) {
          homeSystemPrompt += p1RuptureAssessment.promptBlock;
          console.info(`[P1-rupture] ${p1RuptureAssessment.type} severity=${p1RuptureAssessment.severity.toFixed(2)} triggers=[${p1RuptureAssessment.triggers.join(",")}]`);
        }

        // P1.5-3/4 data: 仮説統計を計算（既存の hypothesisFactEntries を活用）
        const hypStats = computeHypothesisStats(hypothesisFactEntries as Array<{
          confidence: number; status: string; updated_at?: string | null; contradiction_count?: number;
        }> | null);

        // P1-2: Abstention（実データ接続済み）
        p1AbstentionSignal = evaluateAbstention({
          observationDepth,
          sessionCount: alterSessionCount,
          trustLevel: discreteTrustLevel,
          topicAccuracy: null, // 将来: カテゴリ別予測精度 DB を接続
          hasConflictingHypotheses: hypStats.hasConflictingHypotheses,
          questionType,
          psychologicalCapacity: userState?.psychological_capacity ?? null,
        });

        if (p1AbstentionSignal.promptBlock) {
          homeSystemPrompt += p1AbstentionSignal.promptBlock;
          console.info(`[P1-abstention] reason=${p1AbstentionSignal.reason} confidence=${p1AbstentionSignal.confidence.toFixed(2)}`);
        }

        // P1-3/4: Negative Capability + Prediction Crash（実データ接続済み）
        p1NegCapState = evaluateNegativeCapability({
          overallPredictionRate: 0.5, // 将来: 予測 outcome tracking DB から取得
          predictionTrend: "stable",  // 将来: outcome trend から取得
          categoryAccuracies: [],     // 将来: カテゴリ別 outcome DB から取得
          recentMissStreak: thinSliceState.consecutive_misses,
          avgHypothesisStaleness: hypStats.avgStaleness,
          highConfidenceRatio: hypStats.highConfidenceRatio,
          sessionCount: alterSessionCount,
        });

        if (p1NegCapState.promptBlock) {
          homeSystemPrompt += p1NegCapState.promptBlock;
          console.info(`[P1-negcap] crash=${p1NegCapState.crash.severity} overfit=${p1NegCapState.overfit.severity} shake=${p1NegCapState.hypothesisShakeNeeded}`);
        }

        // ── P1.5: 構造的制約の計算 ──
        p15Constraints = computeVerificationConstraints(
          p1RuptureAssessment,
          p1AbstentionSignal,
          p1NegCapState,
        );

        if (p15Constraints.activeConstraints.length > 0) {
          // P1.5-2: ResponseMode 強制上書き
          if (p15Constraints.forcedResponseMode) {
            const prevMode = responseMode;
            responseMode = p15Constraints.forcedResponseMode;
            modeDecisionReason = (p15Constraints.modeOverrideReason ?? "p15_verification") as typeof modeDecisionReason;
            console.info(`[P1.5] Mode override: ${prevMode} → ${responseMode} (reason=${p15Constraints.modeOverrideReason})`);
          }

          // P1.5: ヘッジングプロンプト注入（構造的制約）
          const hedgingBlock = buildHedgingPromptBlock(p15Constraints);
          if (hedgingBlock) {
            homeSystemPrompt += hedgingBlock;
          }

          // P1.5: 構造的プロンプトブロック注入
          for (const block of p15Constraints.structuralPromptBlocks) {
            homeSystemPrompt += `\n${block}`;
          }

          console.info(`[P1.5] Constraints active: [${p15Constraints.activeConstraints.join(", ")}] claimCap=${p15Constraints.claimStrengthCap} hedging=${p15Constraints.hedgingRequired} phaseDemotion=${p15Constraints.phaseDemotionRequested}`);
        }

        // ── P2-1: Narrative Lens — 意味づけの変化追跡 + 固着検出 ──
        try {
          // 1. 今回メッセージの narrative を事前抽出（save は post-response で行う）
          const incomingNarratives = extractUserNarratives(message);

          // 2. 既存 narrative を取得（freezing 判定 + revision 事前検出の両方に使う）
          const { data: narrativeRows } = await supabase
            .from("stargazer_alter_narratives")
            .select("id, theme, content, domain, mention_count, first_mentioned, last_mentioned, interpretation_history, current_valence, current_agency, revision_count, frozen_since")
            .eq("user_id", userId)
            .gte("mention_count", 1)
            .order("mention_count", { ascending: false })
            .limit(20);

          if (narrativeRows && narrativeRows.length > 0) {
            const typedRows = narrativeRows as NarrativeWithHistory[];

            // 3. Revision 事前検出: 今回メッセージに含まれる narrative と既存を比較
            for (const incoming of incomingNarratives) {
              const existing = typedRows.find(r => r.theme === incoming.theme);
              if (existing) {
                const revResult = buildRevisionEntry(existing.content, incoming.content);
                if (revResult.isRevision && revResult.revision) {
                  p2NarrativeRevision = revResult.revision;
                  // P3-3: Phase depth gating — narrative lens
                  const narrativeDepth = p3EffectiveDepth?.narrativeLens ?? "full";
                  const fullBlock = buildNarrativeShiftPromptBlock(revResult.revision);
                  const gated = gateLensPrompt(narrativeDepth, fullBlock, LENS_SURFACE_HINTS.narrative);
                  if (gated) homeSystemPrompt += gated;
                  console.info(`[P2-narrative] Pre-response shift detected: ${revResult.revision.shiftType} theme="${incoming.theme}" depth=${narrativeDepth}`);
                  break; // 1ターンにつき最大1つの shift 注入
                }
              }
            }

            // 4. Narrative Freezing 検出: mention_count >= 3 のもので判定
            const frequentRows = typedRows.filter(r => r.mention_count >= 3);
            if (frequentRows.length > 0) {
              p2NarrativeFreezing = detectNarrativeFreezing(frequentRows);

              if (p2NarrativeFreezing.isFrozen && p2NarrativeFreezing.innerSense) {
                const freezeDepth = p3EffectiveDepth?.narrativeLens ?? "full";
                const freezeGated = gateLensPrompt(freezeDepth, `\n${p2NarrativeFreezing.innerSense}`, LENS_SURFACE_HINTS.narrative);
                if (freezeGated) homeSystemPrompt += freezeGated;
                console.info(`[P2-narrative] Freezing detected: ${p2NarrativeFreezing.frozenThemes.join(", ")} (${p2NarrativeFreezing.frozenDays}d)`);

                // frozen_since を更新（まだ設定されていない場合のみ）
                for (const n of frequentRows) {
                  if (p2NarrativeFreezing.frozenThemes.includes(n.theme) && !n.frozen_since) {
                    supabase.from("stargazer_alter_narratives")
                      .update({ frozen_since: new Date().toISOString() })
                      .eq("id", n.id)
                      .then(({ error }) => { if (error) console.warn("[P2-narrative] frozen_since update failed:", error.message); });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[P2-narrative] Narrative lens failed (fail-open):", e);
        }

        // ── P2-2: Body Lens — 身体→感情構築パターン（内部感覚のみ） ──
        try {
          // 1. ユーザーメッセージから身体信号を検出
          p2BodySignals = detectBodySignals(message);

          if (p2BodySignals.length > 0) {
            // 2. P1.5 claimStrengthCap が hold/probe の時はスキップ（P1.5 従属）
            const capSuppressed = p15Constraints?.claimStrengthCap === "hold" || p15Constraints?.claimStrengthCap === "probe";

            if (!capSuppressed) {
              // 3. この人の既存 body-emotion mapping を取得
              const signalTypes = [...new Set(p2BodySignals.map(s => s.type))];
              const { data: mappingRows } = await supabase
                .from("stargazer_body_emotion_mappings")
                .select("*")
                .eq("user_id", userId)
                .in("body_signal_type", signalTypes);

              if (mappingRows && mappingRows.length > 0) {
                p2BodyMappings = mappingRows as BodyEmotionMapping[];
                // 4. confidence が十分な mapping を prompt に注入（P3-3: depth gating）
                const bodyDepth = p3EffectiveDepth?.bodyLens ?? "full";
                const bodyBlock = buildBodyLensPromptBlock(p2BodyMappings, p2BodySignals);
                if (bodyBlock) {
                  const bodyGated = gateLensPrompt(bodyDepth, bodyBlock, LENS_SURFACE_HINTS.body);
                  if (bodyGated) {
                    homeSystemPrompt += bodyGated;
                    p2BodyPromptInjected = true;
                  }
                  console.info(`[P2-body] Prompt: depth=${bodyDepth}, ${p2BodyMappings.filter(m => classifyConfidenceLevel(m.confidence) !== "suppress").length} mapping(s) active`);
                }
              }
            } else {
              console.info(`[P2-body] Skipped: P1.5 claimStrengthCap=${p15Constraints?.claimStrengthCap}`);
            }
          }
        } catch (e) {
          console.warn("[P2-body] Body lens failed (fail-open):", e);
        }

        // ── P2-3: Parts Lens — パート力学（per-turn activation state） ──
        try {
          // contradiction 信号: cross-session + personality domain
          const partsRelevantAxes = ["emotional_regulation", "independence_vs_harmony", "direct_vs_diplomatic", "change_embrace_vs_resist"];
          const hasStrongDomainContradiction = (personality.contradictionAxes ?? []).some(
            (c: { axisA: string; axisB: string; tension: number }) =>
              c.tension >= 0.5 && (partsRelevantAxes.includes(c.axisA) || partsRelevantAxes.includes(c.axisB)),
          );

          p2PartsState = estimatePartsActivation({
            message,
            hasContradictionHint: !!contradictionHint,
            hasStrongDomainContradiction,
            narrativeShiftDetected: p2NarrativeRevision !== null,
            bodySignalDetected: p2BodySignals.length > 0,
            previousState: null, // TODO: rolling state from previous turn analytics
          });

          if (p2PartsState.dominantPart !== "unclear" && p2PartsState.dominantPart !== "balanced") {
            // 1. Prompt block 注入（P3-3: depth gating）
            const partsDepth = p3EffectiveDepth?.partsLens ?? "full";
            const partsBlock = buildPartsLensPromptBlock(p2PartsState);
            if (partsBlock) {
              const partsGated = gateLensPrompt(partsDepth, partsBlock, LENS_SURFACE_HINTS.parts);
              if (partsGated) homeSystemPrompt += partsGated;
              console.info(`[P2-parts] Prompt: depth=${partsDepth}, dominant=${p2PartsState.dominantPart} signals=[${p2PartsState.signals.join(",")}]`);
            }

            // 2. P1.5 override（既存制約に追加）
            const partsOverride = computePartsP15Override(p2PartsState);
            if (partsOverride.forcedResponseMode && p15Constraints) {
              p15Constraints.forcedResponseMode = partsOverride.forcedResponseMode;
              p15Constraints.modeOverrideReason = `parts_${p2PartsState.dominantPart}`;
            }
            if (partsOverride.claimStrengthCap && p15Constraints) {
              // monotonic downgrade: parts cap は P1.5 cap より厳しい場合のみ適用
              const capOrder = ["hold", "probe", "lean_in", "assert"] as const;
              const currentIdx = p15Constraints.claimStrengthCap
                ? capOrder.indexOf(p15Constraints.claimStrengthCap as typeof capOrder[number])
                : capOrder.length;
              const partsIdx = capOrder.indexOf(partsOverride.claimStrengthCap as typeof capOrder[number]);
              if (partsIdx < currentIdx) {
                p15Constraints.claimStrengthCap = partsOverride.claimStrengthCap;
              }
            }
            if (partsOverride.hedgingRequired && p15Constraints) {
              p15Constraints.hedgingRequired = true;
            }
          }
        } catch (e) {
          console.warn("[P2-parts] Parts lens failed (fail-open):", e);
        }

        // ── P2-4: Memory Policy — 記憶のライフサイクル管理 ──
        try {
          // 1. 仮説エントリを MemoryEntry に変換して policy 適用
          if (hypothesisFactEntries && hypothesisFactEntries.length > 0) {
            const memEntries = new Map<string, MemoryEntry>();
            for (const h of hypothesisFactEntries) {
              memEntries.set(h.content ?? "", {
                type: (h.hypothesis_type === "wound" ? "wound_hypothesis" : "trait_hypothesis") as MemoryEntry["type"],
                evidenceCount: h.evidence_count ?? 1,
                counterEvidenceCount: 0,
                strongCounterEvidenceCount: 0,
                lastConfirmedAt: h.last_evaluated ?? null,
                createdAt: h.created_at ?? new Date().toISOString(),
                revisionCount: 0,
                frozenSince: null,
              });
            }
            p2MemoryPolicyResult = applyMemoryPolicy(memEntries, null);
            console.info(`[P2-memory] Policy applied: ${memEntries.size} entries, ${p2MemoryPolicyResult.excluded.length} excluded, ${p2MemoryPolicyResult.includable.length} includable`);
          }

          // 2. Narrative revision cascade: revision が起きた場合に仮説 confidence を decay
          if (p2NarrativeRevision && hypothesisFactEntries && hypothesisFactEntries.length > 0) {
            const cascadeTargets = hypothesisFactEntries.map((h, i) => ({
              id: `hyp-${i}`,
              type: "trait_hypothesis" as const,
              currentConfidence: h.confidence ?? 0.5,
            }));
            p2CascadeDecays = computeNarrativeRevisionCascade(
              p2NarrativeRevision.shiftType,
              cascadeTargets,
            );
            if (p2CascadeDecays.length > 0) {
              console.info(`[P2-memory] Narrative cascade: ${p2CascadeDecays.length} decay(s), total=${p2CascadeDecays.reduce((s, d) => s + d.confidenceDelta, 0).toFixed(3)}`);
              // Note: 実際の DB confidence 更新は post-response で行う（fire-and-forget）
            }
          }
        } catch (e) {
          console.warn("[P2-memory] Memory policy failed (fail-open):", e);
        }
      } catch (e) {
        console.warn("[P1/P1.5] Verification layer failed (fail-open):", e);
      }

      // ── P3-4: Regression Orchestrator — P1/P2 シグナルから非線形後退を判定 ──
      try {
        // consecutiveRuptureCount: 直近5ターンの rupture 履歴から連続数を算出
        const currentRuptureFlag =
          p1RuptureAssessment?.type === "withdrawal" || p1RuptureAssessment?.type === "confrontation";
        const priorFlags = p3HdmPhaseState.recentRuptureFlags ?? [];
        const flagsWithCurrent = [...priorFlags, currentRuptureFlag].slice(-5);
        let consecutiveCount = 0;
        for (let i = flagsWithCurrent.length - 1; i >= 0; i--) {
          if (flagsWithCurrent[i]) consecutiveCount++;
          else break;
        }

        // trustDelta: 前ターン終了時の信頼レベルとの差分
        const currentTrust = growthState?.trustLevel ?? 0;
        const priorTrust = p3HdmPhaseState.priorSessionTrust ?? currentTrust;
        const trustDelta = currentTrust - priorTrust;

        const fullRegressionCtx: RegressionContext = {
          ruptureDetected: currentRuptureFlag,
          ruptureType: currentRuptureFlag
            ? (p1RuptureAssessment!.type as "withdrawal" | "confrontation") : null,
          consecutiveRuptureCount: consecutiveCount,
          dignityViolationDetected: p1AbstentionSignal?.reason === "dignity_risk" && p1AbstentionSignal.shouldAbstain,
          explicitRejection: detectExplicitRejection(message),
          reactiveActivation: p2PartsState?.reactive.activationLevel ?? 0,
          protectiveActivation: p2PartsState?.protective.activationLevel ?? 0,
          trustDelta,
        };

        const regResult = orchestrateRegression(p3HdmPhaseState, fullRegressionCtx);

        if (regResult.regressionApplied || regResult.recoveryApplied) {
          p3HdmPhaseState = regResult.newState;
          // Effective depth 再計算
          p3EffectiveDepth = resolveEffectiveDepth(regResult.newState.currentPhase, discreteTrustLevel);

          hdmStateDirty = true;

          if (regResult.regressionApplied) {
            console.info(`[P3-4] Regression applied: Phase ${regResult.previousPhase} → ${regResult.newState.currentPhase} (cause=${regResult.detectedSignal?.cause})`);
          }
          if (regResult.recoveryApplied) {
            console.info(`[P3-4] Soft recovery: Phase → ${regResult.newState.currentPhase}`);
          }
        }
        if (regResult.cooldownSkipped) {
          console.info(`[P3-4] Regression cooldown: same cause (${regResult.detectedSignal?.cause}) skipped`);
        }

        // Analytics に regression 結果を追記
        if (p3HdmPhaseAnalytics) {
          (p3HdmPhaseAnalytics as unknown as Record<string, unknown>).regression = {
            signalDetected: !!regResult.detectedSignal,
            cause: regResult.detectedSignal?.cause ?? null,
            type: regResult.detectedSignal?.type ?? null,
            applied: regResult.regressionApplied,
            recovered: regResult.recoveryApplied,
            cooldownSkipped: regResult.cooldownSkipped,
            previousPhase: regResult.previousPhase,
            currentPhase: regResult.newState.currentPhase,
          };
        }

        // cross-session 追跡フィールドを hdm_phase_state に永続化（fire-and-forget）
        const stateWithTracking: typeof p3HdmPhaseState = {
          ...regResult.newState,
          recentRuptureFlags: flagsWithCurrent,
          priorSessionTrust: currentTrust,
        };
        p3HdmPhaseState = stateWithTracking;
        hdmStateDirty = true;
      } catch (e) {
        console.warn("[P3-4] Regression orchestrator failed (fail-open):", e);
      }

      // ── P4-6: Counterfactual Live Integration ──
      // alternative_part のみ。Gate → micro-LLM（await, 800ms timeout）→ safety → integration decision
      // → adopted のみ prompt injection、weakened/rejected/失敗は fail-open（何もしない）
      // Kill switch: STARGAZER_FLAGS.counterfactualLive = false で全ユーザー無効化
      // analytics: main に p4_live_integrated + p4_decision。詳細は structured log + Supabase fire-and-forget。
      if (STARGAZER_FLAGS.counterfactualLive) try {
        const p4PartsContext: CounterfactualPartsContext | null = p2PartsState
          ? {
              dominantPart: p2PartsState.dominantPart,
              signalCount: p2PartsState.signalCount,
            }
          : null;

        const p4GateResult = isCounterfactualAllowed(
          p3HdmPhaseState.currentPhase,
          discreteTrustLevel,
          p1AbstentionSignal?.reason === "dignity_risk" && p1AbstentionSignal.shouldAbstain,
          p1RuptureAssessment?.type === "withdrawal" || p1RuptureAssessment?.type === "confrontation",
          "alternative_part",
          null,
          false, // abuseContext — TODO: wire from P1
          false, // exileProximity — TODO: wire from P2
          false, // userRejection — TODO: wire from session state
          p4PartsContext,
        );

        if (p4GateResult.allowed && p4PartsContext) {
          const p4Shift = resolveShiftDirection(p4PartsContext.dominantPart, null);

          if (p4Shift) {
            const p4SystemPrompt = buildCandidatePrompt(
              p4Shift,
              message,
              personality ? JSON.stringify(personality).slice(0, 200) : "N/A",
            );
            const p4Start = Date.now();
            const p4ShiftDirection = p4Shift.direction;
            const p4ShiftFromPart = p4Shift.fromPart as PartIdentifier;

            try {
              llmCallCount++;
              const p4LlmResult = await runAI({
                taskType: "stargazer_counterfactual_live",
                prompt: `状況: ${message}`,
                systemPrompt: p4SystemPrompt,
                requireJson: false,
                temperature: 0.4,
                maxOutputTokens: 256,
                timeoutMs: 1500,
                userId: userId,
                metadata: makeStargazerRunMetadata({
                  feature: "counterfactual_live",
                  mode: "live",
                  turnNumber: conversationHistory.length,
                  skipCache: true,
                }),
              });
              const p4Latency = Date.now() - p4Start;

              if (p4LlmResult.success && p4LlmResult.text.trim()) {
                const candidateText = p4LlmResult.text.trim();
                const integrationResult = computeIntegrationDecision(candidateText, "alternative_part", message);
                p4Decision = integrationResult.decision;

                if (integrationResult.decision === "adopted" && integrationResult.finalText) {
                  // adopted のみ live 統合。weakened（hedge 欠落）は analytics のみ。
                  p4InjectedText = integrationResult.finalText;
                  p4InjectedCandidateRaw = candidateText;
                  homeSystemPrompt += buildCounterfactualPromptBlock(
                    integrationResult.finalText,
                    p4ShiftDirection,
                  );
                  p4LiveIntegrated = true;

                  console.info(
                    `[P4-6] Live integrated (adopted): shift=${p4ShiftDirection} ` +
                    `latency=${p4Latency}ms len=${candidateText.length}`,
                  );
                } else {
                  // weakened / rejected → 本応答に混ぜない
                  console.info(
                    `[P4-6] Not integrated: decision=${integrationResult.decision} ` +
                    `shift=${p4ShiftDirection} ` +
                    `violations=${integrationResult.originalViolations.map(v => v.type).join(",") || "none"} ` +
                    `latency=${p4Latency}ms`,
                  );
                }

                // Supabase fire-and-forget: 結果記録（main response をブロックしない）
                const safetyCheck = validateCandidateSafety(candidateText);
                supabase
                  .from("stargazer_counterfactual_shadow_log")
                  .insert({
                    user_id: userId,
                    perspective: "alternative_part",
                    source_part: p4ShiftFromPart,
                    shift_direction: p4ShiftDirection,
                    safe: safetyCheck.safe,
                    decision: integrationResult.decision,
                    violation_types: safetyCheck.violations.map(v => v.type),
                    latency_ms: p4Latency,
                    candidate_length: candidateText.length,
                    candidate_text_preview: safetyCheck.safe ? candidateText.slice(0, 80) : "[REDACTED]",
                    live_integrated: p4LiveIntegrated,
                    created_at: new Date().toISOString(),
                  })
                  .then(({ error }) => {
                    if (error) console.warn("[P4-6] Log insert failed (non-fatal):", error.message);
                  });
              } else {
                console.info(`[P4-6] LLM empty/failed: success=${p4LlmResult.success} latency=${p4Latency}ms`);
              }
            } catch (llmError) {
              const p4Latency = Date.now() - p4Start;
              console.warn(`[P4-6] LLM call failed (fail-open, ${p4Latency}ms):`, llmError);
            }
          } else {
            console.info("[P4-6] Gate passed but no shift direction resolved");
          }
        } else if (!p4GateResult.allowed) {
          console.info(`[P4-6] Gate BLOCKED: reason=${p4GateResult.reason}`);
        }
      } catch (e) {
        console.warn("[P4-6] Live integration failed (fail-open):", e);
      }

      // ── P5: Reality Anchoring — 現実返還（Phase 5 / Trust 4 以上のみ） ──
      try {
        const ruptureActive = p1RuptureAssessment?.type === "withdrawal" || p1RuptureAssessment?.type === "confrontation";
        const dignityRisk = !!(p1AbstentionSignal?.reason === "dignity_risk" && p1AbstentionSignal.shouldAbstain);

        p5GateResult = isRealityAnchoringAllowed(
          p3HdmPhaseState.currentPhase,
          p0DiscreteTrustLevel as TrustLevel,
          ruptureActive,
          dignityRisk,
          p2PartsState?.protective.activationLevel ?? 0,
          p2PartsState?.reactive.activationLevel ?? 0,
          responseMode === "clarify",
        );

        if (p5GateResult.allowed && judgmentSkeleton) {
          const p5Context: RealityAnchoringContext = {
            actionShape: judgmentSkeleton.action_shape,
            knownValues: growthState?.knownValues ?? [],
            knownFears: growthState?.knownFears ?? [],
            unfinishedThread: growthState?.unfinishedThreads?.[0]?.topic ?? null,
          };

          homeSystemPrompt += "\n\n" + buildRealityAnchoringPromptBlock(p5Context);
          p5Injected = true;

          // P5-3: pending を保存（次ターンの After-Action Loop 用）
          p3HdmPhaseState = {
            ...p3HdmPhaseState,
            pendingRealityAnchoring: {
              actionShape: judgmentSkeleton.action_shape,
              anchoringSummary: buildAnchoringSummary(judgmentSkeleton.action_shape),
              suggestedAt: new Date().toISOString(),
              followUpAttempts: 0,
            },
          };

          console.info(`[P5] Reality Anchoring injected: shape=${judgmentSkeleton.action_shape} values=${p5Context.knownValues.length} fears=${p5Context.knownFears.length}`);
        } else if (!p5GateResult.allowed) {
          console.info(`[P5] Gate BLOCKED: reasons=${p5GateResult.reasons.join(",")}`);
        }

        // P5-3: After-Action Loop — 蓄積した prompt block を homeSystemPrompt に結合
        if (p5AfterActionPromptBlock) {
          homeSystemPrompt += "\n\n" + p5AfterActionPromptBlock;
        }

        // P5 の状態変更は hdmStateDirty で追跡、最後に一括書き込み
        hdmStateDirty = true;
      } catch (e) {
        console.warn("[P5] Reality Anchoring failed (fail-open):", e);
      }

      // ── P1.5 Thin-Slice: 差し込みB — Insight + Bet + Claim + Prompt 注入 ──
      if (thinSliceActive && turnValue.invoke_insight && growthState) {
        try {
          // Step 1: 前 bet miss → retraction prompt 注入
          if (thinSliceBetOutcome === "miss" && thinSliceState.last_bet) {
            homeSystemPrompt += buildRetractionPromptBlock(
              thinSliceState.last_bet.bet,
              "ちょっとズレてたかもしれない。",
            );
          }

          // Step 2: Insight Generator（micro-LLM、hard timeout 700ms）
          thinSliceInsight = await generateInsight(
            message, conversationHistory.map(m => ({ role: m.role, content: m.content })),
            growthState, longTermMemory,
            hypothesisFactEntries ?? null, personality, discreteTrustLevel,
          );

          // Step 3: Sharp Bet 選定（ルールベース）
          thinSliceBet = selectSharpBet(
            thinSliceInsight, hypothesisFactEntries ?? null, growthState,
            longTermMemory, thinSliceState,
          );

          // Step 4: Claim Strength（ルールベース）
          thinSliceClaim = determineClaimStrength(
            thinSliceBet, discreteTrustLevel, detectedReaction, thinSliceState,
          );

          // Step 4.5: P1.5 Claim Strength Cap 適用
          if (thinSliceClaim && p15Constraints?.claimStrengthCap) {
            const prevStrength = thinSliceClaim.strength;
            thinSliceClaim = {
              ...thinSliceClaim,
              strength: applyClaimStrengthCap(thinSliceClaim.strength, p15Constraints.claimStrengthCap),
            };
            if (prevStrength !== thinSliceClaim.strength) {
              thinSliceClaim = { ...thinSliceClaim, reason: `${thinSliceClaim.reason} [P1.5 capped: ${prevStrength}→${thinSliceClaim.strength}]` };
              console.info(`[P1.5] Claim strength capped: ${prevStrength} → ${thinSliceClaim.strength} (cap=${p15Constraints.claimStrengthCap})`);
            }
          }

          // Step 5: プロンプト注入 + 同一 bet 連続カウント更新
          if (thinSliceBet && thinSliceClaim && thinSliceClaim.strength !== "hold") {
            homeSystemPrompt += buildBetPromptBlock(thinSliceBet, thinSliceClaim);
            // 同一 bet 連続カウントの更新（selectSharpBet の反復防止ガードの入力）
            if (thinSliceState.last_bet && thinSliceBet.bet.slice(0, 30) === thinSliceState.last_bet.bet.slice(0, 30)) {
              thinSliceState.consecutive_same_bet_count++;
            } else {
              thinSliceState.consecutive_same_bet_count = 1;
            }
            console.info(`[thin-slice] Bet injected: "${thinSliceBet.bet.slice(0, 60)}..." (${thinSliceClaim.strength}, conf=${thinSliceBet.confidence.toFixed(2)}, same_streak=${thinSliceState.consecutive_same_bet_count})`);
          }
        } catch (e) {
          // fail-open: thin-slice 全体の失敗は既存フローへフォールバック
          console.warn("[thin-slice] Insight/Bet/Claim pipeline failed (fail-open):", e);
          thinSliceInsight = null;
          thinSliceBet = null;
          thinSliceClaim = null;
        }
      }

      // ── Proactive Understanding Engine ──
      {
        try {
          const historyForProactive = conversationHistory.map(m => ({ role: m.role, content: m.content }));
          const axisScoresObj: Partial<Record<string, number>> = {};
          if (personality?.axisScores) {
            for (const [k, v] of Object.entries(personality.axisScores)) {
              if (typeof v === "number") axisScoresObj[k] = v;
            }
          }

          // ── DB読み込み: Trust Events, Trust Budget, Consent, Causal Map, Payback ──
          const [
            { data: trustEventRows },
            { data: trustBudgetRows },
            { data: consentRows },
            { data: causalMapRows },
            { data: paybackRows },
          ] = await Promise.all([
            supabase
              .from("stargazer_alter_trust_events")
              .select("id, user_id, domain, event_type, weight, session_id, metadata, created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(200),
            supabase
              .from("stargazer_alter_trust_budget")
              .select("domain, earned_score, contextual_level, contextual_last_active")
              .eq("user_id", userId),
            supabase
              .from("stargazer_alter_consent")
              .select("subdomain, status, updated_at, cooldown_until")
              .eq("user_id", userId),
            supabase
              .from("stargazer_alter_causal_map")
              .select("id, user_id, source_fact, target_axis, influence, hypothesis, origin, confidence, evidence_count, contradiction_count, last_confirmed_at, created_at, updated_at")
              .eq("user_id", userId)
              .order("confidence", { ascending: false })
              .limit(50),
            supabase
              .from("stargazer_alter_payback")
              .select("id, user_id, source_probe_id, fact_id, causal_link_ids, used_in_sessions, first_used_at, created_at")
              .eq("user_id", userId)
              .eq("first_used_at", null as unknown as string), // unused paybacks only
          ]);

          const dbTrustEvents: TrustEvent[] = (trustEventRows ?? []).map(r => ({
            id: r.id,
            user_id: r.user_id,
            domain: r.domain as TrustDomain,
            event_type: r.event_type as TrustEventType,
            weight: r.weight,
            session_id: r.session_id ?? "",
            metadata: (r.metadata ?? {}) as Record<string, unknown>,
            created_at: r.created_at,
          }));

          const dbContextualAccess: ContextualAccess[] = (trustBudgetRows ?? []).map(r => ({
            domain: r.domain as TrustDomain,
            level: r.contextual_level ?? 0,
            last_active: r.contextual_last_active ?? new Date().toISOString(),
          }));

          const dbConsent: SubdomainConsent[] = (consentRows ?? []).map(r => ({
            subdomain: r.subdomain as import("@/lib/stargazer/proactiveUnderstanding").ConsentSubdomain,
            status: r.status as import("@/lib/stargazer/proactiveUnderstanding").ConsentStatus,
            updated_at: r.updated_at,
            cooldown_until: r.cooldown_until,
          }));

          const dbCausalLinks: CausalLink[] = (causalMapRows ?? []).map(r => ({
            id: r.id,
            user_id: r.user_id,
            source_fact: r.source_fact,
            target_axis: r.target_axis as import("@/lib/stargazer/traitAxes").TraitAxisKey,
            influence: r.influence as "amplify" | "suppress" | "context",
            hypothesis: r.hypothesis,
            origin: r.origin as import("@/lib/stargazer/proactiveUnderstanding").CausalOrigin,
            confidence: r.confidence,
            evidence_count: r.evidence_count,
            contradiction_count: r.contradiction_count,
            last_confirmed_at: r.last_confirmed_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }));

          // PRO-5: Causal link confidence decay（90日以上未確認のリンクを漸減）
          const dbCausalLinksDecayed = dbCausalLinks.map(l => decayCausalLinkConfidence(l));
          // 変更があったリンクを fire-and-forget で DB 更新
          for (const [i, decayed] of dbCausalLinksDecayed.entries()) {
            if (decayed.confidence !== dbCausalLinks[i].confidence) {
              supabase.from("stargazer_alter_causal_map").update({
                confidence: decayed.confidence,
                updated_at: decayed.updated_at,
              }).eq("id", decayed.id).then(({ error }) => {
                if (error) console.warn("[proactive] Causal link decay update failed:", error.message);
              });
            }
          }

          const dbPaybacks: PendingPayback[] = (paybackRows ?? []).map(r => ({
            source_probe_id: r.source_probe_id,
            fact_id: r.fact_id,
            causal_links: r.causal_link_ids ?? [],
            used_in_sessions: r.used_in_sessions ?? [],
            first_used_at: r.first_used_at,
          }));

          // probesThisSession: 今セッションで実行された probe 数
          const probesThisSession = dbTrustEvents.filter(
            e => e.session_id === sessionId && (e.event_type === "prediction_confirmed" || e.event_type === "prediction_rejected"),
          ).length;

          // lastProbeTimestamp: 直近の probe 実行時刻
          const lastProbeEvent = dbTrustEvents.find(
            e => e.event_type === "prediction_confirmed" || e.event_type === "prediction_rejected",
          );

          // sessionOfLastConsent: 最後にconsentが更新されたセッション数（近似値）
          const latestConsent = dbConsent.length > 0
            ? dbConsent.reduce((a, b) => new Date(a.updated_at) > new Date(b.updated_at) ? a : b)
            : null;

          console.info(
            `[proactive-db] trustEvents=${dbTrustEvents.length}, budget=${dbContextualAccess.length}, consent=${dbConsent.length}, causal=${dbCausalLinks.length}, payback=${dbPaybacks.length}`,
          );

          // 感情温度: v42Signal > utteranceReading > fallback 0
          const emotionalTemp = v42Signal?.emotional_temperature
            ?? utteranceReading?.emotional_temperature
            ?? 0;
          // 直答コンテキスト: responseMode が direct_response または repair
          const isDirectAnswer = responseMode === "direct_response" || responseMode === "repair";

          proactiveOutput = runProactiveEngine({
            sessions_completed: alterSessionCount,
            continuous_trust: growthState?.trustLevel ?? 0,
            axisScores: axisScoresObj as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>,
            lifeContextEntries: activeLifeContext,
            conversationHistory: historyForProactive,
            currentMessage: message,
            alterPreviousMessage: lastAlterContent ?? "",
            trustEvents: dbTrustEvents,
            contextualAccess: dbContextualAccess,
            consent: dbConsent,
            causalLinks: dbCausalLinksDecayed,
            probesThisSession,
            lastProbeTimestamp: lastProbeEvent?.created_at ?? null,
            currentSessionIndex: alterSessionCount,
            sessionOfLastConsent: latestConsent ? Math.max(0, alterSessionCount - 1) : 0,
            frustrationLevel: govFrustration.level,
            detectedDomain: queryContext?.domain
              ? ({ romance: "relationship", work: "career", friend: "relationship", family: "relationship", self: "identity", general: "daily", daily_guidance: "daily", career_fit: "career", industry_fit: "career" } as Record<string, TrustDomain>)[queryContext.domain] ?? null
              : null,
            gates: resolveGates(ENV_GATE_OVERRIDES),
            emotionalTemperature: emotionalTemp,
            isDirectAnswerContext: isDirectAnswer,
            // GAP-1: personality + mood を渡し、computeStanceVector に実データを供給
            personality: personality
              ? { boldScore: personality.axisScores.cautious_vs_bold, socialScore: personality.axisScores.individual_vs_social }
              : null,
            mood: utteranceReading?.energy_direction === "retreating" ? "negative"
              : utteranceReading?.energy_direction === "seeking" ? "positive"
              : "neutral",
          });

          if (proactiveOutput.promptBlock) {
            homeSystemPrompt += `\n\n${proactiveOutput.promptBlock}`;
            console.info(
              `[proactive] Phase=${proactiveOutput.phase}, probe=${proactiveOutput.selectedProbe ? "yes" : "no"}` +
              (proactiveOutput.probeBlocked ? ` (blocked: ${proactiveOutput.probeBlockReason})` : "") +
              `, gap=${proactiveOutput.gap.weakest_category}(${proactiveOutput.gap.weakest_confidence.toFixed(2)})`,
            );
          }

          // GAP-1a: StanceVector → mode adjustment (boldness が高い場合、branch → conclude に昇格)
          if (proactiveOutput.stance && responseMode === "branch") {
            const boldness = proactiveOutput.stance.assumption_boldness;
            const branchThreshold = 0.5 + boldness * 0.15;
            // queryContext.ambiguity_score が調整後閾値を下回る場合、conclude に昇格
            if (queryContext && queryContext.ambiguity_score <= branchThreshold) {
              console.info(`[home-alter] StanceVector mode upgrade: branch→conclude (boldness=${boldness.toFixed(2)}, threshold=${branchThreshold.toFixed(2)})`);
              responseMode = "conclude";
              modeDecisionReason = "conclude_stance_boldness_upgrade";
              // 骨格/モード不一致修正: prompt は branch mode で構築済みのため、conclude 上書き指示を注入
              homeSystemPrompt += "\n\n【モード更新】応答モードが branch → conclude に昇格した。先行する骨格指示の「分岐」「選択肢」提示を上書きする。結論を一つに絞り、断定的に答えること。";
            }
          }

          // GAP-1c: StanceVector → prompt assertion 調整
          if (proactiveOutput.stance) {
            const s = proactiveOutput.stance;
            const stanceLines: string[] = [];
            if (s.assertion_intensity >= 0.7) {
              stanceLines.push("【断言指示】この回答では断言してよい。「〜だと思う」ではなく「〜だ」と言い切ること。");
            } else if (s.assertion_intensity <= 0.4) {
              stanceLines.push("【控えめ指示】この回答は控えめに。「〜に見える」「〜かもしれない」を使い、断言を避けること。");
            }
            if (s.hedge_allowance <= 0.3) {
              stanceLines.push("【留保最小化】回りくどい留保表現は避け、端的に伝えること。");
            }
            if (stanceLines.length > 0) {
              homeSystemPrompt += `\n\n${stanceLines.join("\n")}`;
              console.info(`[home-alter] StanceVector prompt injection: ${stanceLines.length} directive(s) (assert=${s.assertion_intensity.toFixed(2)}, hedge=${s.hedge_allowance.toFixed(2)})`);
            }
          }

          // ── EmbeddedSensor 独立 analytics イベント ──
          if (proactiveOutput?.embeddedSensor) {
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "embedded_sensor_injected",
              feature: "proactive",
              metadata: {
                target_axis: proactiveOutput.embeddedSensor.target_axis,
                style: proactiveOutput.embeddedSensor.style,
                confidence: proactiveOutput.embeddedSensor.confidence,
                session_id: sessionId,
                phase: proactiveOutput.phase,
              },
            }).then(({ error }) => {
              if (error) console.warn("[embedded-sensor] Analytics insert failed:", error.message);
            });
          }

          // ── Trust Event 自動検出 → DB書き込み ──
          if (proactiveOutput.detectedTrustEvents.length > 0) {
            const detectedDomain: TrustDomain = queryContext?.domain
              ? ({ romance: "relationship", work: "career", friend: "relationship", family: "relationship", self: "identity", general: "daily", daily_guidance: "daily", career_fit: "career", industry_fit: "career" } as Record<string, TrustDomain>)[queryContext.domain] ?? "daily"
              : "daily";
            const newTrustEvents = proactiveOutput.detectedTrustEvents.map(eventType =>
              createTrustEvent({
                user_id: userId,
                domain: detectedDomain,
                event_type: eventType,
                session_id: sessionId,
                metadata: { turn: conversationHistory.length },
              }),
            );
            supabase
              .from("stargazer_alter_trust_events")
              .insert(newTrustEvents)
              .then(({ error }) => {
                if (error) console.warn("[proactive] Trust event insert failed:", error.message);
                else console.info(`[proactive] ${newTrustEvents.length} trust event(s) recorded`);
              });

            // Trust Budget 更新（earned_score の累積更新）
            for (const evt of newTrustEvents) {
              supabase
                .from("stargazer_alter_trust_budget")
                .upsert(
                  {
                    user_id: userId,
                    domain: evt.domain,
                    earned_score: (trustBudgetRows?.find(r => r.domain === evt.domain)?.earned_score ?? 0) + evt.weight,
                    contextual_level: trustBudgetRows?.find(r => r.domain === evt.domain)?.contextual_level ?? 0,
                    contextual_last_active: new Date().toISOString(),
                  },
                  { onConflict: "user_id,domain" },
                )
                .then(({ error }) => {
                  if (error) console.warn("[proactive] Trust budget upsert failed:", error.message);
                });
            }
          }

          // ── PRO-4: Causal Link 証拠/矛盾更新 ──
          // prediction_confirmed → 関連リンクに evidence ��追加
          // prediction_rejected → 関連リンクに contradiction を追加
          if (proactiveOutput.detectedTrustEvents.length > 0 && dbCausalLinksDecayed.length > 0) {
            const hasConfirmed = proactiveOutput.detectedTrustEvents.includes("prediction_confirmed");
            const hasRejected = proactiveOutput.detectedTrustEvents.includes("prediction_rejected");
            if (hasConfirmed || hasRejected) {
              // probe の target_category に関連するリンクを更新
              const probeCategory = proactiveOutput.selectedProbe?.target_category;
              const relatedLinks = probeCategory
                ? dbCausalLinksDecayed.filter(l => l.source_fact.includes(probeCategory))
                : [];
              for (const link of relatedLinks.slice(0, 5)) {
                const updated = hasConfirmed
                  ? addEvidenceToCausalLink(link)
                  : addContradictionToCausalLink(link);
                supabase.from("stargazer_alter_causal_map").update({
                  confidence: updated.confidence,
                  evidence_count: updated.evidence_count,
                  contradiction_count: updated.contradiction_count,
                  last_confirmed_at: updated.last_confirmed_at,
                  updated_at: updated.updated_at,
                }).eq("id", link.id).then(({ error }) => {
                  if (error) console.warn("[proactive] Causal link update failed:", error.message);
                  else console.info(`[proactive] Causal link ${link.id.slice(0, 8)} ${hasConfirmed ? "evidence" : "contradiction"} updated (conf=${updated.confidence.toFixed(2)})`);
                });
              }
            }
          }

          // ── TASK-5: ImplicitSignal 検出 → 蓄積 → DB保存 → 昇格 → MI接続 ──
          // P2-5: greeting / chat_opening / factual_recall / knowledge / scope_disclosure /
          // delegation_request / career_fit / industry_fit は signal 検出をスキップ
          // daily_guidance は L969 の分岐で早期リターンするため、ここには到達しない
          const skipImplicitSignal =
            questionType === "greeting" ||
            questionType === "chat_opening" ||
            questionType === "factual_recall" ||
            questionType === "scope_disclosure" ||
            questionType === "delegation_request" ||
            questionType === "execution_request" ||
            questionType === "knowledge" ||
            queryContext?.domain === "career_fit" ||
            queryContext?.domain === "industry_fit" ||
            // Phase 9: follow-up / fatigue / creation では signal 検出をスキップ
            isFatigue ||
            followUpType !== null ||
            queryContext?.domain === "creation";
          if (DEFAULT_GATES.implicit_signal_enabled && proactiveOutput && !skipImplicitSignal) {
            try {
              // 平均メッセージ長の算出
              const userMsgs = conversationHistory.filter(m => m.role === "user");
              const avgMsgLen = userMsgs.length > 0
                ? userMsgs.reduce((sum, m) => sum + m.content.length, 0) / userMsgs.length
                : 100;

              // activeAxes を currentTopicContext から取得
              const implicitActiveAxes = proactiveOutput.currentTopicContext?.active_axes;

              // primaryAxis: active_axes の先頭、なければ gap の最弱カテゴリから推定
              const primaryAxis = implicitActiveAxes?.[0] ?? undefined;

              // 感情温度
              const emotionalW = v42Signal?.emotional_temperature
                ?? utteranceReading?.emotional_temperature
                ?? undefined;

              // RT Signal: クライアントが responseTimeMs を送信している場合のみ算出
              const rtSignal = rawResponseTimeMs
                ? computeResponseTimeSignal(rawResponseTimeMs)
                : undefined;

              const newImplicitSignals = detectImplicitSignals({
                currentMessage: message,
                previousMessage: lastAlterContent ?? "",
                sessionId: sessionId!,
                // RT Engine: クライアント未送信のため通常 undefined。
                // body.responseTimeMs が送信された場合のみ computeResponseTimeSignal を接続。
                conflictIndicator: rtSignal?.conflictIndicator,
                previousProbeAxis: proactiveOutput.selectedProbe
                  ? (proactiveOutput.selectedProbe.causal_connection.split("→")[0]?.trim() as import("@/lib/stargazer/traitAxes").TraitAxisKey | undefined)
                  : undefined,
                activeAxes: implicitActiveAxes,
                averageMessageLength: avgMsgLen,
                emotionalWeight: emotionalW,
                primaryAxis,
              });

              if (newImplicitSignals.length > 0) {
                console.info(`[implicit-signal] ${newImplicitSignals.length} signal(s) detected: ${newImplicitSignals.map(s => s.type).join(", ")}`);

                // DB に保存（stargazer_implicit_signals テーブル）
                for (const sig of newImplicitSignals) {
                  supabase.from("stargazer_implicit_signals").insert({
                    user_id: userId,
                    session_id: sig.session_id,
                    signal_type: sig.type,
                    related_axis: sig.related_axis,
                    confidence: sig.confidence,
                    promoted_to_insight: false,
                  }).then(({ error }) => {
                    if (error) console.warn("[implicit-signal] DB insert failed:", error.message);
                  });
                }

                // 既存シグナルをDBから読み込み + 蓄積 + 昇格チェック
                const { data: existingSignalRows } = await supabase
                  .from("stargazer_implicit_signals")
                  .select("*")
                  .eq("user_id", userId)
                  .eq("promoted_to_insight", false)
                  .order("created_at", { ascending: false })
                  .limit(100);

                if (existingSignalRows && existingSignalRows.length > 0) {
                  const existingSignals: ImplicitSignal[] = existingSignalRows.map(r => ({
                    type: r.signal_type as ImplicitSignal["type"],
                    related_axis: r.related_axis as import("@/lib/stargazer/traitAxes").TraitAxisKey,
                    session_id: r.session_id,
                    confidence: r.confidence,
                    timestamp: r.created_at,
                    promoted_to_insight: r.promoted_to_insight,
                  }));

                  const allSignals = accumulateImplicitSignals(existingSignals, newImplicitSignals);
                  const promotion = promoteToMicroInsight(allSignals);

                  // #7+R3-#8+P2-5: micro-insight 露出条件を厳格化
                  // 感情的/存在的/創業的/自己理解/scope_disclosure な会話で人間体験に関係ない軸を suppress する
                  const suppressedAxes = new Set<string>();
                  const suppressDomain = queryContext?.domain ?? "general";
                  const isNonAnalyticalQuestion =
                    questionType === "greeting" ||
                    questionType === "chat_opening" ||
                    questionType === "factual_recall" ||
                    questionType === "scope_disclosure" ||
                    questionType === "delegation_request" ||
                    questionType === "execution_request" ||
                    questionType === "knowledge";
                  if (
                    isNonAnalyticalQuestion ||
                    questionType === "emotional" ||
                    questionType === "self_understanding" ||
                    questionType === "scope_disclosure" ||
                    isCreationTheme ||
                    isHighAbstractionTheme(message) ||
                    queryContext?.domain === "self"
                    // daily_guidance: L969の分岐でここに到達しないため除外
                  ) {
                    const noiseAxes = [
                      "tradition_vs_novelty", "planning_spontaneity",
                      "abstract_concrete", "detail_orientation",
                      "topic_shift", "formality_preference",
                      "cautious_vs_bold", // Phase 9: CEO指摘のノイズ軸
                    ];
                    for (const axis of noiseAxes) suppressedAxes.add(axis);
                  }
                  const filteredPromotion = promotion && !suppressedAxes.has(promotion.related_axis)
                    ? promotion
                    : null;
                  if (promotion && !filteredPromotion) {
                    const suppressReason = isNonAnalyticalQuestion
                      ? `non_analytical_qtype(${questionType})`
                      : `domain_qtype(${suppressDomain}/${questionType},isCreation=${isCreationTheme})`;
                    console.info(`[implicit-signal] Suppressed noisy promotion: axis=${promotion.related_axis} reason=${suppressReason}`);
                  }

                  if (filteredPromotion) {
                    const promotion = filteredPromotion;
                    console.info(`[implicit-signal] Promoted to MicroInsight: "${promotion.insight_text}" (axis=${promotion.related_axis}, count=${promotion.signal_count})`);

                    // 昇格した insight を MI analytics に記録
                    supabase.from("stargazer_analytics").insert({
                      user_id: userId,
                      event: "implicit_signal_promoted",
                      feature: "micro_insight",
                      metadata: {
                        ...promotion,
                        session_id: sessionId,
                      },
                    }).then(({ error }) => {
                      if (error) console.warn("[implicit-signal] Promotion analytics insert failed:", error.message);
                    });

                    // promoted_to_insight を true に更新（昇格に使われたシグナル）
                    const promotedKey = `${promotion.related_axis}::${promotion.signal_type}`;
                    const idsToUpdate = existingSignalRows
                      .filter(r => `${r.related_axis}::${r.signal_type}` === promotedKey && !r.promoted_to_insight)
                      .map(r => r.id);

                    if (idsToUpdate.length > 0) {
                      supabase.from("stargazer_implicit_signals")
                        .update({ promoted_to_insight: true })
                        .in("id", idsToUpdate)
                        .then(({ error }) => {
                          if (error) console.warn("[implicit-signal] Promotion update failed:", error.message);
                          else console.info(`[implicit-signal] ${idsToUpdate.length} signals marked as promoted`);
                        });
                    }

                    // 昇格した insight を cross-session MI パイプラインに注入
                    // SessionMicroSignal として構築し、convergence チェックを実行
                    // ImplicitSignal type → MicroSignalType マッピング
                    const implicitToMicroType: Record<string, import("@/lib/stargazer/alterUnderstanding").MicroSignalType> = {
                      avoidance: "topic_absence",
                      elaboration: "topic_repetition",
                      deflection: "behavior_mismatch",
                      hesitation: "energy_action_gap",
                      topic_shift: "topic_absence",
                      strong_affect: "sentiment_shift",
                    };
                    const mappedType = implicitToMicroType[promotion.signal_type] ?? "sentiment_shift";
                    const promotedSessionSignal: SessionMicroSignal = {
                      type: mappedType,
                      observation: promotion.insight_text,
                      related_topic: promotion.related_axis,
                      strength: promotion.confidence,
                      detected_at: new Date().toISOString(),
                      session_id: sessionId!,
                    };
                    const promotedCsCheck = checkCrossSessionConvergence([promotedSessionSignal], discreteTrustLevel);
                    if (promotedCsCheck.insight && !microInsight) {
                      microInsight = promotedCsCheck.insight;
                      crossSessionResult = promotedCsCheck.convergenceResult;
                      console.info(`[implicit-signal] Promoted signal triggered new MI convergence`);
                    }
                  }
                }
              }
            } catch (implicitErr) {
              console.warn("[implicit-signal] Pipeline failed (non-fatal):", implicitErr);
            }
          }

          // ── Payback Tracker: probe 実行時に payback 作成 ──
          if (proactiveOutput.selectedProbe && !proactiveOutput.probeBlocked) {
            const probeId = crypto.randomUUID();
            supabase
              .from("stargazer_alter_payback")
              .insert({
                user_id: userId,
                source_probe_id: probeId,
                fact_id: proactiveOutput.gap.weakest_category,
                causal_link_ids: dbCausalLinks
                  .filter(l => l.source_fact.includes(proactiveOutput!.selectedProbe!.target_category))
                  .slice(0, 3)
                  .map(l => l.id),
              })
              .then(({ error }) => {
                if (error) console.warn("[proactive] Payback insert failed:", error.message);
                else console.info(`[proactive] Payback created for probe ${probeId.slice(0, 8)}`);
              });
          }

          // ── PRO-6: Consent 自動更新 ──
          // probe が sensitive subdomain を対象にしていた場合、ユーザーの反応に応じて consent を更新
          if (proactiveOutput.selectedProbe && !proactiveOutput.probeBlocked) {
            const detectedDomain: TrustDomain = queryContext?.domain
              ? ({ romance: "relationship", work: "career", friend: "relationship", family: "relationship", self: "identity", general: "daily", daily_guidance: "daily", career_fit: "career", industry_fit: "career" } as Record<string, TrustDomain>)[queryContext.domain] ?? "daily"
              : "daily";
            const subdomain = domainToDefaultSubdomain(detectedDomain);
            if (isSensitiveSubdomain(subdomain)) {
              const hasConfirmed = proactiveOutput.detectedTrustEvents.includes("prediction_confirmed")
                || proactiveOutput.detectedTrustEvents.includes("question_answered_detail")
                || proactiveOutput.detectedTrustEvents.includes("voluntary_deep_disclosure");
              const hasRejected = proactiveOutput.detectedTrustEvents.includes("question_ignored")
                || proactiveOutput.detectedTrustEvents.includes("prediction_rejected");

              if (hasConfirmed) {
                const consent = grantImplicitConsent(subdomain);
                supabase.from("stargazer_alter_consent").upsert({
                  user_id: userId,
                  subdomain: consent.subdomain,
                  status: consent.status,
                  cooldown_until: consent.cooldown_until,
                  updated_at: consent.updated_at,
                }, { onConflict: "user_id,subdomain" }).then(({ error }) => {
                  if (error) console.warn("[proactive] Consent grant failed:", error.message);
                  else console.info(`[proactive] Implicit consent granted for ${subdomain}`);
                });
              } else if (hasRejected) {
                const consent = setConsentCooldown(subdomain);
                supabase.from("stargazer_alter_consent").upsert({
                  user_id: userId,
                  subdomain: consent.subdomain,
                  status: consent.status,
                  cooldown_until: consent.cooldown_until,
                  updated_at: consent.updated_at,
                }, { onConflict: "user_id,subdomain" }).then(({ error }) => {
                  if (error) console.warn("[proactive] Consent cooldown failed:", error.message);
                  else console.info(`[proactive] Consent cooldown set for ${subdomain}`);
                });
              }
            }
          }

          // ── Payback Tracker: 未使用 payback のプロンプト注入 ──
          const unusedPaybacks = findUnusedPaybacks(dbPaybacks);
          if (unusedPaybacks.length > 0 && proactiveOutput.phase >= 1) {
            const paybackHint = unusedPaybacks.slice(0, 2).map(p =>
              `前に「${p.fact_id}」について教えてもらった情報がある。自然な文脈で活かせるなら使うこと。`,
            ).join("\n");
            homeSystemPrompt += `\n\n[Payback — 過去の質問で得た情報]\n${paybackHint}`;
            console.info(`[proactive] ${unusedPaybacks.length} unused payback(s) injected to prompt`);
          }
        } catch (e) {
          console.warn("[proactive] Engine failed (fail-open):", e);
          proactiveOutput = null;
        }
      }

      // ── Wall 1+6: Personalization Tracking ──
      // Parts 推定 + proactive engine 出力の両方が揃った後に実行
      try {
        const userActiveDomains = proactiveOutput?.currentTopicContext?.active_domains ?? [];
        const currentProbedDomains = proactiveOutput?.selectedProbe
          ? [proactiveOutput.selectedProbe.target_category]
          : [];

        personalizationResult = runPersonalizationTracking(
          p3HdmPhaseState,
          p2PartsState,
          userActiveDomains,
          currentProbedDomains,
        );

        // HdmPhaseState に結果を書き戻す
        p3HdmPhaseState = { ...p3HdmPhaseState, ...personalizationResult.stateUpdates };
        hdmStateDirty = true;

        if (personalizationResult.analytics.defense_prediction_hit !== null) {
          console.info(
            `[Wall1] Defense prediction: ${personalizationResult.analytics.defense_prediction_hit ? "HIT" : "MISS"}, streak=${personalizationResult.analytics.defense_prediction_streak}`,
          );
        }
        if (personalizationResult.analytics.voluntary_expansion_detected) {
          console.info(
            `[Wall6] Voluntary expansion: new_domains=[${personalizationResult.analytics.voluntary_expansion_new_domains.join(",")}], total=${personalizationResult.analytics.voluntary_expansion_total}`,
          );
        }
      } catch (e) {
        console.warn("[Wall1+6] Personalization tracking failed (fail-open):", e);
      }

      // フォローアップ傾向をプロンプトに注入
      if (followupInsight) {
        homeSystemPrompt += `\n\n# 過去の提案に対するフィードバック傾向\n${followupInsight}\nこの傾向を考慮して、提案の粒度・ハードルを調整すること。`;
      }

      // ── Episodic Recall: 過去の会話想起ブロック注入（Home Alter パス） ──
      if (episodicRecallResult && episodicRecallResult.promptBlock) {
        homeSystemPrompt += `\n\n${episodicRecallResult.promptBlock}`;
        console.info(
          `[alter-home] Episodic recall injected: mode=${episodicRecallResult.mode}, ` +
          `matches=${episodicRecallResult.matches.length}, blockLen=${episodicRecallResult.promptBlock.length}`,
        );
      }

      // clarify follow-up: 元の質問 + 追加情報を統合してプロンプトに渡す
      let effectiveMessage = message;
      if (wasPreviousClarify && conversationHistory.length >= 2) {
        const originalUserMsg = conversationHistory[conversationHistory.length - 2];
        if (originalUserMsg && originalUserMsg.role === "user") {
          effectiveMessage = `${originalUserMsg.content}（補足: ${message}）`;
          console.info("[home-alter] Clarify follow-up: merged with original question");
        }
      }

      const homeUserPrompt = buildHomeAlterUserPrompt(
        effectiveMessage,
        conversationHistory.length > 0
          ? conversationHistory.map((m) => ({ role: m.role, content: m.content }))
          : undefined,
      );

      // P1.7: prompt構築完了 → main LLM call 開始の境界
      latencyTracker.promptBuildMs = Date.now() - routeStart;
      // S3: プロンプトサイズ追跡（mainLLM外れ値の原因特定用）
      latencyTracker.mainPromptChars = (homeSystemPrompt?.length ?? 0) + (homeUserPrompt?.length ?? 0);
      const mainLlmStart = Date.now();

      // 1回目の生成
      // NOTE: gemini-2.5-flash は thinking tokens が maxOutputTokens に含まれるため、
      // 実際の出力文字数の10倍程度のトークン予算が必要
      let homeResponse = "";
      try {
        llmCallCount++;
        const aiResult = await runAI({
          taskType: "stargazer_alter_response",
          prompt: homeUserPrompt,
          systemPrompt: homeSystemPrompt,
          requireJson: false,
          temperature: (responseMode === "clarify" || responseMode === "repair") ? 0.3 : 0.6,
          // 語彙繰り返し抑制: 同じフレーズの多用を減らす（Gemini frequencyPenalty: 0.0-2.0）
          frequencyPenalty: 0.3,
          // 新トピック促進: 既出トークンの再出現を軽く抑える
          presencePenalty: 0.1,
          // P1.7: PE fired ターンは検索結果提示に必要なトークン量が少ない（2048→1280）
          // Gemini thinking tokens が maxOutputTokens に含まれるため、過大な予算は生成時間を伸ばす
          maxOutputTokens: (responseMode === "clarify" || responseMode === "repair") ? 1024
            : responseMode === "direct_response" ? 1536
            : responseMode === "branch" ? 3072
            : peHasFiredWithContent ? 1280
            : 2048,
          userId: userId,
          metadata: makeStargazerRunMetadata({
            feature: "alter",
            mode: "warm",
            responseMode,
            actionShape: judgmentSkeleton?.action_shape ?? null,
            trustLevel: p0DiscreteTrustLevel,
            hdmPhase: p3HdmPhaseState.currentPhase,
            turnNumber: conversationHistory.length,
            skipCache: true,
          }),
        });
        if (aiResult.success && aiResult.text?.trim()) {
          if (responseMode === "clarify" || responseMode === "repair" || responseMode === "direct_response") {
            // 軽量モードはメタデータなし、formatHomeAlterResponseで整形のみ
            homeResponse = formatHomeAlterResponse(aiResult.text.trim(), userName);
          } else {
            const { responseText: stripped, metadata: meta } = parseDecisionMetadata(aiResult.text);
            homeResponse = formatHomeAlterResponse(stripped, userName);
            if (meta) homeDecisionMeta = meta;
          }
        }
      } catch (e) {
        console.warn("[home-alter] First attempt failed:", e);
      }

      // ── P1-B: 空レスリトライ（最大1回、同一プロンプト再呼び出し） ──
      // 空判定: 空文字・空白のみ・改行のみ・null/undefined を全て空とみなす
      let emptyRetryAttempted = false;
      let emptyRetrySucceeded = false;
      if (!homeResponse?.trim()) {
        emptyRetryAttempted = true;
        console.warn("[home-alter] Empty response from LLM, retrying once with same prompt");
        try {
          llmCallCount++;
          const emptyRetryResult = await runAI({
            taskType: "stargazer_alter_response",
            prompt: homeUserPrompt,
            systemPrompt: homeSystemPrompt,
            requireJson: false,
            temperature: (responseMode === "clarify" || responseMode === "repair") ? 0.3 : 0.6,
            maxOutputTokens: (responseMode === "clarify" || responseMode === "repair") ? 1024 : responseMode === "direct_response" ? 1536 : responseMode === "branch" ? 3072 : 2048,
            userId: userId,
            metadata: makeStargazerRunMetadata({
              feature: "alter",
              mode: "warm",
              responseMode,
              actionShape: judgmentSkeleton?.action_shape ?? null,
              trustLevel: p0DiscreteTrustLevel,
              hdmPhase: p3HdmPhaseState.currentPhase,
              turnNumber: conversationHistory.length,
              skipCache: true,
              attempt: 1,
            }),
          });
          if (emptyRetryResult.success && emptyRetryResult.text?.trim()) {
            if (responseMode === "clarify" || responseMode === "repair" || responseMode === "direct_response") {
              homeResponse = formatHomeAlterResponse(emptyRetryResult.text.trim(), userName);
            } else {
              const { responseText: stripped, metadata: meta } = parseDecisionMetadata(emptyRetryResult.text);
              homeResponse = formatHomeAlterResponse(stripped, userName);
              if (meta) homeDecisionMeta = meta;
            }
            emptyRetrySucceeded = true;
            console.info("[home-alter] Empty response retry succeeded");
          }
        } catch (retryErr) {
          console.warn("[home-alter] Empty response retry failed:", retryErr);
        }
        // analytics: 空レスリトライの結果を記録
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "home_alter_empty_retry",
          feature: "alter",
          metadata: {
            attempted: true,
            succeeded: emptyRetrySucceeded,
            response_mode: responseMode,
            question_type: questionType,
          },
        }).then(() => {}, () => {});
      }

      // P1.7: main LLM + empty retry のレイテンシ
      latencyTracker.mainLlmMs = Date.now() - mainLlmStart;

      // 検査（モード別バリデーション）
      // P0-1: PE fired 時は validation をバイパスする。
      // 理由: conclude モードは「具体的な行動提案」を要求するが、PE 応答は検索結果の提示であり
      //       judgment 応答とは根本的に構造が異なる。validation fail → retry → double failure fallback
      //       のチェーンが PE の検索結果（企業名・データ等）を完全に破壊していた。
      const validation = homeResponse?.trim()
        ? (peHasFiredWithContent
          ? { pass: true, failures: [] as string[] }
          : validateHomeAlterResponseWithMode(homeResponse, message, expectedKeywords, responseMode, questionType))
        : { pass: false, failures: ["応答の生成に失敗"] };
      if (peHasFiredWithContent && homeResponse?.trim()) {
        console.info("[perspective-engine] ✅ Validation bypassed (PE fired with content — search-result format, not judgment format)");
      }
      p0ValidationFailures = validation.failures;

            // Contract-based validation: ドメイン固有の出力契約で検証
            // ただし greeting / direct_response / repair / clarify は契約修復の対象外
            // （軽量応答に機械的ラベルを付加すると人間らしさが壊れるため）
            // PE fired 時も免除: 検索結果の提示ターンに通常会話の next_action 契約を
            // 当てると、ゴミ末尾（無関係な性格アドバイス）が付加される
            const contractExemptModes: Set<string> = new Set(["direct_response", "repair", "clarify"]);
            const isContractExempt = contractExemptModes.has(responseMode) || questionType === "greeting"
              || !!peHasFiredWithContent;
            const contractDomain = queryContext?.domain ?? "general";
            contractValidationResult = homeResponse?.trim() && !isContractExempt
              ? validateAgainstContract(homeResponse, contractDomain, questionType)
              : null;

            if (contractValidationResult && !contractValidationResult.pass && validation.pass) {
              // 旧バリデーションは通ったが契約は不足 → repair 試行
              const sessionFacts = sessionFactAccumulator.getExplicitFacts().map(f => f.content);
              const repairResult = repairResponse(
                homeResponse!,
                getContract(contractDomain),
                contractValidationResult.missing,
                personalizedFacts,
                sessionFacts,
              );
              if (repairResult) {
                homeResponse = repairResult.repaired;
                console.info(`[contract-repair] ${repairResult.fieldsRepaired.length} fields repaired: ${repairResult.fieldsRepaired.join(", ")}`);
              }
            }

      // ── 会話品質バリデーション + 再生成（conversation / ask_me 専用） ──
      // direct_response は基本validation通過済みだが、会話品質（反射・抽象質問）は未検証。
      // ここで追加検証し、不合格なら1回だけ再生成を試みる。
      const conversationalQualityTypes: Set<import("@/lib/stargazer/alterHomeAdapter").QuestionType> = new Set(["conversation", "ask_me"]);
      let conversationalQualityRetried = false;
      if (
        conversationalQualityTypes.has(questionType) &&
        homeResponse?.trim() &&
        validation.pass // 基本validationは通過している
      ) {
        const cqCheck = validateConversationalQuality(homeResponse, message, questionType);
        if (!cqCheck.pass) {
          console.info(`[conv-quality] Failed: ${cqCheck.failures.join(", ")} → retrying`);
          conversationalQualityRetried = true;
          try {
            // 具体的なフィードバック付きで再生成
            const cqFeedback = cqCheck.failures.map(f => `- ${f}`).join("\n");
            const cqRetryInstructions = questionType === "ask_me"
              ? [
                  `- 質問を必ず1つ含めること（？で終わる文）`,
                  `- 抽象的な質問（「もう少し教えて」「今日はどんな感じ？」「どう感じた？」等）を使わないこと`,
                  `- 具体的な2-3択にすること（例: 「仕事？プライベート？」）`,
                  `- 性格ラベル・傾向表現（「〇〇な傾向がある」）は使わないこと`,
                  `- 2-3文で完結すること`,
                ]
              : [
                  `- 1文目でユーザーの言葉を使って受け止めること`,
                  `- 抽象的な質問（「もう少し教えて」「今日はどんな感じ？」等）を使わないこと`,
                  `- 必ず具体的な質問で終わること（デッドエンド��しない）`,
                  `- 2-4文で完結すること`,
                  `- 質問は1つだけ、具体的な2-3択にすること`,
                ];
            const cqRetryPrompt = [
              `以下の応答を改善してください。`,
              ``,
              `## 元の応答:`,
              homeResponse,
              ``,
              `## 問題点:`,
              cqFeedback,
              ``,
              `## ユーザーの発言:`,
              message,
              ``,
              `## 改善指示:`,
              ...cqRetryInstructions,
            ].join("\n");
            llmCallCount++;
            const cqResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: cqRetryPrompt,
              systemPrompt: homeSystemPrompt,
              requireJson: false,
              temperature: 0.3,
              maxOutputTokens: 1024,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode: "warm",
                responseMode,
                actionShape: null,
                trustLevel: p0DiscreteTrustLevel,
                hdmPhase: p3HdmPhaseState.currentPhase,
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt: 2,
              }),
            });
            if (cqResult.success && cqResult.text?.trim()) {
              const cqFormatted = formatHomeAlterResponse(cqResult.text.trim(), userName);
              const cqRecheck = validateConversationalQuality(cqFormatted, message, questionType);
              if (cqRecheck.pass) {
                homeResponse = cqFormatted;
                console.info("[conv-quality] Retry succeeded");
              } else {
                console.warn("[conv-quality] Retry also failed:", cqRecheck.failures);
                // CQ double-fail: 文脈認識型フォールバック
                homeResponse = buildContextAwareFallback(message, conversationHistory);
                console.info("[conv-quality] Double-fail fallback applied (context-aware)");
              }
            }
          } catch (cqErr) {
            console.warn("[conv-quality] Retry threw:", cqErr);
            homeResponse = buildContextAwareFallback(message, conversationHistory);
            console.info("[conv-quality] Retry-exception fallback applied (context-aware)");
          }
        }
      }

      // 不合格なら再生成（facts を明示して再試行）
      // 条件: validation不合格 + 応答が空でない + clarify/repair/direct_responseでない + 空レスリトライ済みでない
      // P0-2: PE fired 時は retry/fallback ループを完全にスキップ。
      // PE 応答は検索結果ベースであり、judgment validation の基準で再生成すると
      // 検索で取得した企業名・データ等が double failure fallback のテンプレ応答に置換される。
      if (!validation.pass && homeResponse?.trim() && responseMode !== "clarify" && responseMode !== "repair" && responseMode !== "direct_response" && !emptyRetryAttempted && !peHasFiredWithContent) {
        console.info("[home-alter] First response failed validation:", validation.failures);
        try {
          const retryPrompt = buildHomeAlterRetryPrompt(
            message,
            homeResponse,
            validation.failures,
            personalizedFacts,
            questionCategory,
            userName,
          );
          llmCallCount++;
          const retryResult = await runAI({
            taskType: "stargazer_alter_response",
            prompt: retryPrompt,
            systemPrompt: homeSystemPrompt,
            requireJson: false,
            temperature: 0.4,
            maxOutputTokens: 2048,
            userId: userId,
            metadata: makeStargazerRunMetadata({
              feature: "alter",
              mode: "warm",
              responseMode,
              actionShape: judgmentSkeleton?.action_shape ?? null,
              trustLevel: p0DiscreteTrustLevel,
              hdmPhase: p3HdmPhaseState.currentPhase,
              turnNumber: conversationHistory.length,
              skipCache: true,
              attempt: 1,
            }),
          });
          if (retryResult.success && retryResult.text?.trim()) {
            const { responseText: retryStripped, metadata: retryMeta } = parseDecisionMetadata(retryResult.text);
            const retryFormatted = formatHomeAlterResponse(retryStripped, userName);
            const retryValidation = validateHomeAlterResponseWithMode(retryFormatted, message, expectedKeywords, responseMode, questionType);
            if (retryValidation.pass) {
              homeResponse = retryFormatted;
              if (retryMeta) homeDecisionMeta = retryMeta;
            } else {
              console.warn("[home-alter] Retry also failed validation:", retryValidation.failures);
              const isGenericFailure = retryValidation.failures.some((f: string) => f.includes("generic") || f.includes("固有"));
              const namePrefix = userName ? `${userName}さん、` : "";

              // 日本語の文節で自然に切断する（助詞・句読点で区切り、最大30文字）
              const smartTruncate = (msg: string, maxLen = 30): string => {
                if (msg.length <= 3) return "";
                const max = Math.min(msg.length, maxLen);
                const chunk = msg.slice(0, max);
                const cutPoints = /[。、！!？?）\)」』\s]/g;
                let lastCut = -1;
                let m: RegExpExecArray | null;
                while ((m = cutPoints.exec(chunk)) !== null) {
                  if (m.index >= 10) { lastCut = m.index; }
                }
                const sliced = lastCut > 0 ? chunk.slice(0, lastCut) : chunk;
                return sliced.replace(/[。、！!？?\s]+$/, "");
              };

              // ── 会話型の double failure → facts dump を回避し、自然な応答を返す ──
              if (questionType === "meta_question") {
                homeResponse = `${namePrefix}正直に言うと、人間と同じ感情は僕にはないと思う。でも、${userName ?? "君"}のことを理解したいっていう強い気持ちはある。それは確かだよ。`;
                console.info("[home-alter] meta_question double failure → dedicated fallback");
              } else if (questionType === "ask_me") {
                // 会話履歴から最近の話題を拾って具体的な質問を生成
                const recentUserMsgs = conversationHistory
                  .filter(m => m.role === "user")
                  .slice(-3)
                  .map(m => m.content)
                  .filter(c => c.length > 5);
                const lastTopic = recentUserMsgs.length > 0
                  ? recentUserMsgs[recentUserMsgs.length - 1]!.slice(0, 20).replace(/[？?。！!、\s]+$/, "")
                  : null;

                // 質問プール（ローテーション）
                const askMeFallbackQuestions = [
                  lastTopic ? `${lastTopic}って話してくれたけど、それってどういう気持ちで言ってた？` : null,
                  lastTopic ? `さっき${lastTopic}って言ってたけど、それって最近の話？` : null,
                  "最近、一番長い時間考えてたことって何？",
                  "今一番頭の中にあることって何？",
                  "ここ最近で一番「あ、やばい」って思った瞬間ある？",
                  "今日起きてから一番最初にしたことって何？",
                  "最近、誰かに言いたかったけど言えなかったことってある？",
                ].filter(Boolean) as string[];
                const askQ = askMeFallbackQuestions[Math.floor(Math.random() * askMeFallbackQuestions.length)]!;
                homeResponse = `${namePrefix}わかった。じゃあ聞くね。\n${askQ}`;
                console.info("[home-alter] ask_me double failure → dedicated fallback");
              } else if (questionType === "conversation") {
                const userKeyPhrase = smartTruncate(message);
                // 会話的フォールバック: 多様なパターンで自己強化ループを防止
                const conversationFallbacks = userKeyPhrase
                  ? [
                    `${namePrefix}${userKeyPhrase}か。それ、ちょっと気になるな。もう少し聞かせて？`,
                    `${namePrefix}${userKeyPhrase}って面白いね。何がそう思わせたの？`,
                    `${namePrefix}なるほど、${userKeyPhrase}ね。それっていつ頃から？`,
                  ]
                  : [
                    `${namePrefix}なるほどね。もう少し聞かせてくれる？`,
                    `${namePrefix}ふーん、そうなんだ。それって最近の話？`,
                    `${namePrefix}そっか。それ、前から思ってたこと？`,
                  ];
                homeResponse = conversationFallbacks[Math.floor(Math.random() * conversationFallbacks.length)]!;
                console.info("[home-alter] conversation double failure → dedicated fallback");
              } else {

              // R3-#5: fallback 優先チェーン改善
              // creation/core-demand/factual_recall では再生成 > facts > 正直な不確実性 > fallback
              const isHighPriorityType = questionType === "factual_recall" || isCoreDemandQuestion(message)
                || queryContext?.domain === "creation" || queryContext?.domain === "founder_team_fit"
                || isCreationVisionTheme(message, conversationHistory.filter(m => m.role === "user").slice(-4).map(m => m.content));

              // H: 専用テンプレ型の generic 失敗 → テンプレ駆動 facts ベース応答
              const isSpecializedType =
                questionType === "factual_recall" ||
                questionType === "delegation_request" ||
                queryContext?.domain === "career_fit" ||
                queryContext?.domain === "industry_fit" ||
                queryContext?.domain === "creation" || // Phase 9: creation 追加
                queryContext?.domain === "founder_team_fit" ||
                isFatigue || // Phase 9: fatigue 追加
                followUpType === "dissatisfaction"; // Phase 9: dissatisfaction 追加
              if (isSpecializedType && personalizedFacts.length >= 1) {
                // 専用テンプレ型: facts から直接構成（clarify に逃げない）
                const topFacts = personalizedFacts.slice(0, 4).map(f => f.replace(/^[【\[].+?[】\]]/, "").trim()).filter(Boolean);
                if (questionType === "delegation_request") {
                  // 委任: 意見を言い切る
                  const basis = topFacts.slice(0, 2).join("、");
                  homeResponse = `${namePrefix}僕の意見を言う。${basis}を踏まえると、まず${topFacts[0] || "今わかっていること"}に従って動いた方がいいと思う。`;
                } else if (queryContext?.domain === "career_fit") {
                  const basis = topFacts.join("。");
                  homeResponse = `${namePrefix}${basis}。\nこの傾向から見て、もう少し具体的な状況を教えてくれたら、合う方向性を絞れると思う。`;
                } else if (queryContext?.domain === "industry_fit") {
                  const basis = topFacts.join("。");
                  homeResponse = `${namePrefix}${basis}。\nこの特徴が活きる場所を考えたいから、今どんな仕事に興味があるか教えてくれると絞れる。`;
                } else if (queryContext?.domain === "creation") {
                  // creation fallback — 結論+ボトルネック+質問
                  const basis = topFacts.slice(0, 2).join("。");
                  homeResponse = `${namePrefix}${basis}。\nもう少し具体的に、何を作りたいのか教えてくれると、僕なりの読みを出せると思う。`;
                } else if (queryContext?.domain === "founder_team_fit") {
                  const basis = topFacts.slice(0, 2).join("。");
                  const sessionFacts = sessionFactAccumulator.getExplicitFacts().map(f => f.content).join("。");
                  homeResponse = `${namePrefix}${basis}。${sessionFacts ? sessionFacts + "。" : ""}\nどういう場面で一緒に動く相手の話？仕事なのか、プライベートなのかで変わってくる。`;
                } else if (isFatigue) {
                  // Phase 9: fatigue fallback — 状態確認+今日やる1つ+やらない1つ
                  homeResponse = `${namePrefix}きつそうだな。\n今日やること: エネルギーが残っているうちに、一番重要なタスクを1つだけ片付ける。\n今日やらないこと: 新しい判断を求められることは全部後回しにしていい。`;
                } else if (followUpType === "dissatisfaction") {
                  // dissatisfaction fallback — 前のズレ修正
                  homeResponse = `${namePrefix}すまん、さっきのは確かにズレてた。もう少し具体的に聞かせてくれたら、ちゃんと答え直す。`;
                } else {
                  // factual_recall: 知っていることを列挙
                  const knownItems = topFacts.map(f => `- ${f}`).join("\n");
                  homeResponse = `${namePrefix}今わかっていることを正直に言う。\n${knownItems}\n\nそれ以外のことは、まだ聞けていない。`;
                }
                console.info(`[home-alter] Specialized type double failure → template-driven response (type=${questionType}, domain=${queryContext?.domain}, fatigue=${isFatigue}, followUp=${followUpType})`);
              } else if (isHighPriorityType && personalizedFacts.length >= 2) {
                // 高優先タイプ: facts を直接使った具体的応答を構成（clarify に逃げない）
                const topFacts = personalizedFacts.slice(0, 3).map(f => f.replace(/^[【\[].+?[】\]]/, "").trim()).filter(Boolean);
                const factsBlock = topFacts.join("。また、");
                homeResponse = `${namePrefix}${factsBlock}。\nこれを踏まえて考えてるんだけど、もう少し状況を教えてくれると、もっと具体的に言える。`;
                // clarify に落とさず conclude のまま維持
                console.info(`[home-alter] High-priority double failure → facts-based response (type=${questionType}, domain=${queryContext?.domain})`);
              } else if (isGenericFailure) {
                // generic で2回失敗 → reflect + narrow question（抽象質問禁止）
                const userKeyPhrase = smartTruncate(message);
                if (userKeyPhrase) {
                  // 反射 + 焦点化質問
                  const narrowQuestions = [
                    `それって最近の話？ それとも前からずっと？`,
                    `いちばん引っかかってるポイントはどこ？`,
                    `仕事の話？ それともプライベート？`,
                  ];
                  const nq = narrowQuestions[Math.floor(Math.random() * narrowQuestions.length)]!;
                  homeResponse = `${namePrefix}${userKeyPhrase}のことが気になってるんだね。${nq}`;
                } else {
                  homeResponse = `${namePrefix}なるほど。今いちばん頭を占めてるのって、仕事、体調、人間関係だとどれが近い？`;
                }
                responseMode = "clarify";
                console.info("[home-alter] Double generic failure → reflect + narrow question fallback");
              } else {
                // 非 generic の2回失敗 → reflect + narrow question（「掴みきれてない」禁止）
                const userKeyPhrase = smartTruncate(message);
                if (userKeyPhrase) {
                  const narrowQuestions = [
                    `それって気持ちの話？ それとも具体的な状況の話？`,
                    `いつ頃からそう感じてる？`,
                    `今いちばんしんどいのはどの部分？`,
                  ];
                  const nq = narrowQuestions[Math.floor(Math.random() * narrowQuestions.length)]!;
                  homeResponse = `${namePrefix}${userKeyPhrase}か。${nq}`;
                } else {
                  homeResponse = `${namePrefix}もう少し聞きたい。今の気持ちに近いのは、「疲れてる」「迷ってる」「モヤモヤしてる」のどれ？`;
                }
                responseMode = "clarify";
                console.info("[home-alter] Double validation failure → reflect + narrow question fallback");
              }
              } // close conversational-type early-exit else
              if (retryMeta) homeDecisionMeta = retryMeta;
            }
          }
        } catch (retryError) {
          console.warn("[home-alter] Retry failed:", retryError);
        }
      }

      // ── P0-4: 応答重複チェック — 前回と酷似なら再生成 ──
      if (homeResponse && lastAlterContent) {
        const similarity = computeResponseSimilarity(homeResponse, lastAlterContent);
        if (similarity > 0.70) {
          console.warn(`[home-alter] Response too similar to previous (similarity=${similarity.toFixed(2)}), regenerating`);
          try {
            const dedupPrompt = [
              `ユーザーの質問: 「${message}」`,
              "",
              "## 重要な制約",
              `前回の応答: 「${lastAlterContent.slice(0, 200)}」`,
              "上記と同じ内容を繰り返してはならない。全く異なる切り口・表現で応答すること。",
            ].join("\n");
            llmCallCount++;
            const dedupResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: dedupPrompt,
              systemPrompt: homeSystemPrompt,
              requireJson: false,
              temperature: 0.75,
              maxOutputTokens: 2048,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode: "warm",
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt: 2,
              }),
            });
            if (dedupResult.success && dedupResult.text?.trim()) {
              const dedupFormatted = formatHomeAlterResponse(dedupResult.text.trim(), userName);
              const dedupSimilarity = computeResponseSimilarity(dedupFormatted, lastAlterContent);
              if (dedupSimilarity < similarity) {
                homeResponse = dedupFormatted;
                console.info(`[home-alter] Dedup regeneration succeeded (new similarity=${dedupSimilarity.toFixed(2)})`);
              }
            }
          } catch (e) {
            console.warn("[home-alter] Dedup regeneration failed:", e);
          }
        }
      }

      // フォールバック: LLM 生成が失敗した場合、質問タイプ・モードに合わせた安全な応答を生成
      // 重要: trait summary（identityFit/growthVector の連結）は絶対に使わない。
      //       「深い1対1の関係を重視する人」のような断定的ラベルは、
      //       LLM失敗時に突然出てくると不自然で、観測精度を下げる。
      if (!homeResponse?.trim()) {
        const namePrefix = userName ? `${userName}さん、` : "";

        // P0-2b: PE fired だが LLM が空応答を返した場合 → fragments から直接構成
        if (peHasFiredWithContent && peResult?.block?.fragments?.length) {
          const topFragments = peResult.block.fragments.slice(0, 3);
          const fragmentTexts = topFragments
            .map(f => f.text.trim())
            .filter(t => t.length > 10)
            .map(t => t.length > 120 ? t.slice(0, 120) + "…" : t);
          if (fragmentTexts.length > 0) {
            homeResponse = `${namePrefix}調べてみた。\n\n${fragmentTexts.join("\n\n")}\n\nまだ十分じゃないかもしれないけど、ここから深掘りしたい部分があれば教えて。`;
            console.info("[perspective-engine] 🔧 Empty response PE fallback: used fragments directly");
          } else {
            homeResponse = `${namePrefix}調べてみたんだけど、今回はうまく情報を引き出せなかった。もう少し具体的に教えてくれると、別のアプローチで探せると思う。`;
            console.info("[perspective-engine] 🔧 Empty response PE fallback: fragments too short, honest limitation");
          }
        } else {

        // ユーザーの発話からキーフレーズを抽出（エコーバック用、文節で自然に切断）
        const userKeyPhrase = message.length > 3 ? (() => {
          const max = Math.min(message.length, 30);
          const chunk = message.slice(0, max);
          const cutPoints = /[。、！!？?）\)」』\s]/g;
          let lastCut = -1;
          let m: RegExpExecArray | null;
          while ((m = cutPoints.exec(chunk)) !== null) {
            if (m.index >= 10) { lastCut = m.index; }
          }
          const sliced = lastCut > 0 ? chunk.slice(0, lastCut) : chunk;
          return sliced.replace(/[。、！!？?\s]+$/, "");
        })() : "";
        if (questionType === "emotional") {
          homeResponse = `${namePrefix}今は無理に言葉にしなくても大丈夫。ここにいるから、話したくなったらいつでも。`;
        } else if (questionType === "greeting" || questionType === "chat_opening") {
          // 挨拶・雑談開始: 軽い受けのみ。分析禁止。
          homeResponse = `${namePrefix}来てくれてよかった。何か話したいことあった？`;
        } else if (questionType === "meta_question") {
          // Alter自身への質問: 正直に答える
          homeResponse = `${namePrefix}正直に言うと、人間と同じ感情は僕にはないと思う。でも、${userName ?? "君"}のことを理解したいっていう強い気持ちはある。それは確かだよ。`;
        } else if (questionType === "ask_me") {
          // 質問要求: 具体的な質問を1つ返す
          const askFact = personalizedFacts.length > 0 ? personalizedFacts[0] : null;
          homeResponse = askFact
            ? `${namePrefix}わかった。じゃあ聞くね。${askFact}って、普段はどう向き合ってる？`
            : `${namePrefix}わかった。じゃあ聞くね。最近一番時間を使ってることって何？`;
        } else if (questionType === "conversation") {
          // 会話的共有: 受け止め + 聞き返し（多様なパターン）
          const convFallbacks = userKeyPhrase
            ? [
              `${namePrefix}${userKeyPhrase}か。それ、ちょっと気になるな。`,
              `${namePrefix}${userKeyPhrase}ね。何がそう思わせたの？`,
              `${namePrefix}なるほど、${userKeyPhrase}ね。もう少し聞かせて。`,
            ]
            : [
              `${namePrefix}なるほどね。もう少し聞かせてくれる？`,
              `${namePrefix}ふーん。それって最近の話？`,
              `${namePrefix}そっか。もうちょっと詳しく聞かせて。`,
            ];
          homeResponse = convFallbacks[Math.floor(Math.random() * convFallbacks.length)]!;
        } else if (responseMode === "repair") {
          // rupture 検出時のフォールバック: 修復姿勢を示す（分析・深掘り禁止）
          homeResponse = `${namePrefix}ごめん、ちょっとうまく受け取れなかったかもしれない。${userKeyPhrase ? `「${userKeyPhrase}」` : "さっきの話"}、もう一回聞かせてもらえる？`;
        } else if (questionType === "self_understanding") {
          // 自己理解質問: 断定ラベルは出さず、聞く姿勢を維持
          homeResponse = `${namePrefix}${userKeyPhrase ? `「${userKeyPhrase}」か。` : ""}それ、ちゃんと考えたいから、もう少し聞かせてくれる？`;
        } else if (responseMode === "clarify") {
          // clarify モードのフォールバック: 直近の発話だけを受けて短く聞く
          homeResponse = `${namePrefix}もう少し教えてもらえると一緒に考えられるかな。`;
        } else if (userKeyPhrase) {
          // judgment / strategy / knowledge 等: ユーザー発話をエコーして文脈を維持
          homeResponse = `${namePrefix}「${userKeyPhrase}」、なるほど。もう少し聞かせてもらえる？`;
        } else {
          // 最終フォールバック: 文脈なし
          homeResponse = `${namePrefix}なるほど。もう少し聞かせてもらえる？`;
        }
        console.info(`[home-alter] Fallback response generated (type=${questionType}, mode=${responseMode})`);
        } // close P0-2b else block
      }
      alterResponseText = homeResponse || "もう少し教えてもらえると、一緒に考えられると思う。";

      // P1.7: validation+retry サイクル完了
      latencyTracker.validationRetryMs = Date.now() - (mainLlmStart + (latencyTracker.mainLlmMs ?? 0));

      // ── Layer 4: 応答品質検証 ──
      if (homeResponse && judgmentSkeleton && relationalLens && inputUnderstanding && responseMode !== "clarify") {
        qualityCheck = validateResponseQuality(
          homeResponse, homeDecisionMeta, judgmentSkeleton, relationalLens, inputUnderstanding, personality,
        );
        if (!qualityCheck.pass) {
          console.warn("[home-alter] Quality check failures:", qualityCheck.failures);
        }
        if (qualityCheck.generic_response_score >= 0.5) {
          console.warn(`[home-alter] Generic response detected: score=${qualityCheck.generic_response_score.toFixed(2)}`);
        }

        // 性格反転フレーズの後処理修正
        if (homeResponse && qualityCheck.failures.some(f => f.startsWith("性格反転"))) {
          const sanitized = sanitizeTraitInversions(homeResponse, personality);
          if (sanitized.corrections.length > 0) {
            console.info("[home-alter] Trait inversion sanitized:", sanitized.corrections);
            homeResponse = sanitized.text;
            alterResponseText = homeResponse;
            // 修正後に再検証
            qualityCheck = validateResponseQuality(
              homeResponse, homeDecisionMeta, judgmentSkeleton, relationalLens, inputUnderstanding, personality,
            );
          }
        }
      }

      // ── RC4: Semantic Bans + User Bans + Strategy Compliance — 常時有効 ──
      // Semantic Bans と User Bans は thinSlice 非依存で全ユーザーに適用。
      // Strategy Compliance は thinSlice 依存のまま。
      if (homeResponse) {
        try {
          // Semantic Ban Check（常時有効）
          v42SemanticBanCheck = checkSemanticBans(homeResponse);

          // P0-3: PE fired → delegation ban を免除。
          // 通常ターンでは「調べてみて」「考えてみて」等はユーザーへの宿題出し（禁止）。
          // しかし PE ターンでは Alter 自身が検索を実行した結果を報告しており、
          // 「調べてみた」「見つけた」等の表現が自然に発生する。
          // delegation カテゴリのみ免除し、evasion/hollow_empathy/preamble は維持。
          if (peHasFiredWithContent && !v42SemanticBanCheck.passed) {
            const beforeCount = v42SemanticBanCheck.violations.length;
            const nonDelegationViolations = v42SemanticBanCheck.violations.filter(
              v => v.category !== "delegation"
            );
            v42SemanticBanCheck = {
              passed: nonDelegationViolations.length === 0,
              violations: nonDelegationViolations,
            };
            if (nonDelegationViolations.length < beforeCount) {
              console.info(
                `[perspective-engine] 🔄 Semantic ban delegation exemption: ${beforeCount - nonDelegationViolations.length} delegation ban(s) exempted for PE turn`
              );
            }
          }

          if (!v42SemanticBanCheck.passed) {
            console.warn("[governance] Semantic ban violations:", v42SemanticBanCheck.violations.map(v => v.expression));
          }

          // User Ban Check — RC1 動的制約（常時有効）
          govUserBanViolation = checkUserBans(homeResponse, govUserBans);
          if (!govUserBanViolation.passed) {
            console.warn("[governance] RC1: User ban violations:", govUserBanViolation.violations.map(v => v.expression));
          }

          // Strategy Compliance Check（thinSlice依存）
          if (thinSliceActive) {
            v42Compliance = checkStrategyCompliance(
              homeResponse, v42Role, thinSliceClaim, thinSliceBet, v42Arena,
            );
          }

          // ── Closed-Loop Re-generation: ban/compliance/user-ban 違反 → 1回だけ再生成 ──
          const semanticFailed = !v42SemanticBanCheck.passed;
          const userBanFailed = !govUserBanViolation.passed;
          const complianceFailed = v42Compliance && !v42Compliance.passed && v42Compliance.correction_prompt;
          const needsRegeneration = semanticFailed || userBanFailed || complianceFailed;

          if (needsRegeneration && responseMode !== "clarify" && responseMode !== "repair") {
            console.info("[governance] Triggering re-generation for violations (semantic=%s, userBan=%s, compliance=%s)",
              semanticFailed, userBanFailed, !!complianceFailed);
            const originalBanViolationCount = v42SemanticBanCheck.violations.length;

            // Build correction prompt: semantic bans + user bans + compliance corrections
            const banCorrections = v42SemanticBanCheck.violations.map(v =>
              `- 「${v.expression}」を使ってはならない（${v.category === "delegation" ? "宿題化" : v.category === "evasion" ? "判断回避" : v.category === "hollow_empathy" ? "空虚な共感" : "過度な前置き"}）`
            ).join("\n");
            const userBanCorrections = govUserBanViolation.passed ? "" : govUserBanViolation.correction_prompt;
            const complianceCorrections = v42Compliance?.correction_prompt ?? "";

            const retryPrompt = [
              `ユーザーの質問: 「${effectiveMessage}」`,
              "",
              "## 前回の応答（問題あり — 修正して再生成せよ）",
              `「${homeResponse.slice(0, 400)}」`,
              "",
              "## 禁止表現（絶対に使うな）",
              banCorrections || "（なし）",
              "",
              userBanCorrections,
              "",
              complianceCorrections,
              "",
              "## 修正ルール",
              "- 上記の禁止表現を含まない応答を生成せよ",
              "- 「考えてみて」「書き出してみて」「整理してみて」→ Alter（あなた）が考えた結果を渡せ",
              "- 「状況による」「場合による」→ 仮説付きで「僕の読みだと〜」で入れ",
              "- 構造を提供するのはあなたの仕事。ユーザーに宿題を出すな。",
              "- 1行目から結論。前置き不要。",
            ].join("\n");

            try {
              llmCallCount++;
              const retryResult = await runAI({
                taskType: "stargazer_alter_response",
                prompt: retryPrompt,
                systemPrompt: homeSystemPrompt,
                requireJson: false,
                temperature: 0.4,
                maxOutputTokens: responseMode === "branch" ? 3072 : 2048,
                userId: userId,
                metadata: makeStargazerRunMetadata({
                  feature: "alter",
                  mode: "warm",
                  turnNumber: conversationHistory.length,
                  skipCache: true,
                  attempt: 3, // governance compliance retry
                }),
              });

              if (retryResult.success && retryResult.text?.trim()) {
                const { responseText: retryStripped, metadata: retryMeta } = parseDecisionMetadata(retryResult.text);
                const retryFormatted = formatHomeAlterResponse(retryStripped, userName);

                // Re-check all bans on regenerated response
                const retrySemanticCheck = checkSemanticBans(retryFormatted);
                const retryUserBanCheck = checkUserBans(retryFormatted, govUserBans);

                if (retrySemanticCheck.passed && retryUserBanCheck.passed) {
                  // Re-generation succeeded — swap response
                  homeResponse = retryFormatted;
                  alterResponseText = homeResponse;
                  if (retryMeta) homeDecisionMeta = retryMeta;
                  v42SemanticBanCheck = retrySemanticCheck;
                  govUserBanViolation = retryUserBanCheck;
                  console.info("[governance] Compliance re-generation succeeded — response replaced");

                  // Re-run strategy compliance on new response
                  if (thinSliceActive) {
                    v42Compliance = checkStrategyCompliance(
                      homeResponse, v42Role, thinSliceClaim, thinSliceBet, v42Arena,
                    );
                  }
                } else {
                  console.warn("[governance] Re-generation still has violations (semantic=%s, userBan=%s) — keeping original",
                    !retrySemanticCheck.passed, !retryUserBanCheck.passed);
                }
              }
            } catch (retryErr) {
              console.warn("[governance] Compliance re-generation failed (fail-open):", retryErr);
            }

            // Analytics: 再生成の結果を記録
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "v42_compliance_regeneration",
              feature: "alter",
              metadata: {
                session_id: sessionId,
                original_ban_violations: originalBanViolationCount,
                user_ban_violations: govUserBanViolation.violations.length,
                regeneration_succeeded: v42SemanticBanCheck.passed && govUserBanViolation.passed,
                final_ban_violations: v42SemanticBanCheck.violations.length,
                response_mode: responseMode,
                governance_frustration_level: govFrustration.level,
              },
            }).then(() => {}, () => {});
          }
        } catch (e) {
          console.warn("[governance] Compliance check failed (fail-open):", e);
        }
      }

      // ── Phase 5: 不気味ライン検知 ──
      // 応答が「見透かしている感」を超えていないかチェック
      if (homeResponse && discreteTrustLevel !== undefined) {
        // T0 gate: prompt に注入していないなら contextEntriesUsed も 0
        // G: ctx_used基準に変更（ctx_loaded=5でもctx_used=0ならwarning不要）
        const contextEntriesForCreepiness = t0Gate ? ctxUsed : 0;
        creepinessCheck = checkCreepinessLine(
          homeResponse,
          discreteTrustLevel,
          hypothesesInjectedCount,
          contextEntriesForCreepiness,
        );
        if (!creepinessCheck.pass) {
          console.warn("[creepiness] Critical violation detected:", creepinessCheck.violations);

          // F: Critical 違反時の応答差し替え — MI/hypothesis を除去して安全側で再生成
          try {
            // プロンプトから Micro Insight と 仮説セクションを除去
            const safeSystemPrompt = homeSystemPrompt
              .replace(/\n\n# Micro Insight（自然に織り込むこと）[\s\S]*?(?=\n\n#|\n\n━|$)/, "")
              .replace(/\n\n# 仮説的理解（断定禁止）[\s\S]*?(?=\n\n#|\n\n━|$)/, "")
              .replace(/\n\n## 禁止表現[\s\S]*?(?=\n\n#|\n\n━|$)/, "");

            llmCallCount++;
            const safeResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: buildHomeAlterUserPrompt(
                effectiveMessage,
                conversationHistory.length > 0
                  ? conversationHistory.map((m) => ({ role: m.role, content: m.content }))
                  : undefined,
              ),
              systemPrompt: safeSystemPrompt + "\n\n# 安全制約\n断定表現を絶対に使わないこと。「あなたは〜だ」「きっと〜」は禁止。全て問いの形か「〜かもしれない」の形で。追跡的な表現（「いつも〜よね」「毎回〜」）も禁止。",
              requireJson: false,
              temperature: 0.3, // 安全側に低温
              maxOutputTokens: 2048,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode: "warm",
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt: 2,
              }),
            });

            if (safeResult.success && safeResult.text?.trim()) {
              const { responseText: safeStripped, metadata: safeMeta } = parseDecisionMetadata(safeResult.text);
              const safeFormatted = formatHomeAlterResponse(safeStripped, userName);

              // 再生成した応答も不気味ラインチェック
              const safeCreepiness = checkCreepinessLine(safeFormatted, discreteTrustLevel, 0, contextEntriesForCreepiness);
              if (safeCreepiness.pass) {
                homeResponse = safeFormatted;
                alterResponseText = homeResponse;
                if (safeMeta) homeDecisionMeta = safeMeta;
                creepinessCheck = safeCreepiness;
                console.info("[creepiness] Safe regeneration succeeded — response replaced");
              } else {
                console.warn("[creepiness] Safe regeneration also failed — falling back to minimal response");
                // 最終フォールバック: 安全な最小応答
                const namePrefix = userName ? `${userName}さん、` : "";
                homeResponse = `${namePrefix}なるほど、そういう状況なんですね。もう少し聞かせてもらえますか？`;
                alterResponseText = homeResponse;
                creepinessCheck = { pass: true, violations: [] };
              }
            } else {
              // LLM 再生成失敗 → 安全フォールバック
              const namePrefix = userName ? `${userName}さん、` : "";
              homeResponse = `${namePrefix}なるほど、そういう状況なんですね。もう少し聞かせてもらえますか？`;
              alterResponseText = homeResponse;
              creepinessCheck = { pass: true, violations: [] };
            }
          } catch (e) {
            console.warn("[creepiness] Safe regeneration failed:", e);
            // 最終フォールバック
            const namePrefix = userName ? `${userName}さん、` : "";
            homeResponse = `${namePrefix}なるほど、そういう状況なんですね。もう少し聞かせてもらえますか？`;
            alterResponseText = homeResponse;
            creepinessCheck = { pass: true, violations: [] };
          }
        } else if (creepinessCheck.violations.length > 0) {
          console.info("[creepiness] Warnings:", creepinessCheck.violations.map(v => v.detail));
        }
      }

      // ── P5 Fix 2: MI 断定表現の出力 lint ──
      // Micro Insight が提示された応答に対して、断定表現が残っていないか post-output で検査
      if (insightPresented && homeResponse) {
        const miLint = lintMIAssertions(homeResponse);
        if (miLint.patched) {
          console.warn(`[mi-lint] 断定表現を検出・パッチ: ${miLint.violations.join(", ")}`);
          homeResponse = miLint.clean;
          alterResponseText = homeResponse;
          // analytics 記録（断定表現漏れの追跡用）
          supabase.from("stargazer_analytics").insert({
            user_id: userId,
            event: "home_alter_mi_assertion_lint",
            feature: "p5_lint",
            metadata: {
              violations: miLint.violations,
              session_id: sessionId,
            },
          }).then(({ error }) => {
            if (error) console.warn("[mi-lint] Analytics save failed:", error.message);
          });
        }
      }

      // ── Layer 5: 監査トレイル構築 ──
      if (inputUnderstanding && lensDetailed && queryContext && judgmentSkeleton) {
        const isFollowup = wasPreviousClarify ?? false;
        auditTrail = buildAuditTrail(
          inputUnderstanding, lensDetailed, queryContext, judgmentSkeleton,
          modeDecisionReason,
          qualityCheck ?? { pass: true, failures: [], generic_response_score: 0 },
          {
            followupInsight: !!followupInsight,
            retryAttempted: !validation.pass && responseMode !== "clarify",
            isFollowup,
            previousSkeleton: null, // 前回 skeleton は stargazer_analytics の home_alter_judgment から取得可能だが、audit trail 用であり判断には不要
          },
        );
      }

      // ── P4-6 Post-Check: counterfactual 統合の最終出力検証 ──
      // p4LiveIntegrated = true の場合のみ実行。
      // 違反検出 → counterfactual 統合を破棄し、prompt block なしで再生成。
      if (p4LiveIntegrated && p4InjectedCandidateRaw && alterResponseText) {
        try {
          const p4PostCheck = validateIntegratedOutput(alterResponseText, p4InjectedCandidateRaw);
          if (!p4PostCheck.pass) {
            console.warn(
              `[P4-6] Post-check FAILED: violations=${p4PostCheck.violations.map(v => `${v.type}:${v.detail.slice(0, 20)}`).join(",")}. Regenerating without counterfactual.`,
            );

            // prompt block を正規表現で除去して再生成
            const p4StrippedPrompt = homeSystemPrompt.replace(
              /\n## 別の角度（内部参照 — そのまま出力しないこと）[\s\S]*?候補（[^）]*）: 「[^」]*」\n/,
              "",
            );

            try {
              llmCallCount++;
              const p4FallbackResult = await runAI({
                taskType: "stargazer_alter_home",
                prompt: homeUserPrompt,
                systemPrompt: p4StrippedPrompt,
                requireJson: false,
                temperature: 0.7,
                maxOutputTokens: 2048,
                userId: userId,
                metadata: makeStargazerRunMetadata({
                  feature: "alter_home_p4_fallback",
                  mode: "fallback",
                  turnNumber: conversationHistory.length,
                  skipCache: true,
                }),
              });

              if (p4FallbackResult.success && p4FallbackResult.text.trim()) {
                alterResponseText = formatHomeAlterResponse(p4FallbackResult.text.trim(), userName);
                homeResponse = alterResponseText;
                p4LiveIntegrated = false; // 統合を破棄
                p4Decision = null;
                console.info("[P4-6] Fallback regeneration succeeded. Counterfactual integration discarded.");
              } else {
                console.warn("[P4-6] Fallback regeneration failed. Using original response (with violations).");
              }
            } catch (fallbackError) {
              console.warn("[P4-6] Fallback regeneration error (keeping original):", fallbackError);
            }

            // analytics: post-check 違反記録
            supabase
              .from("stargazer_counterfactual_shadow_log")
              .insert({
                user_id: userId,
                perspective: "alternative_part",
                source_part: "unknown",
                shift_direction: "unknown",
                safe: false,
                decision: "rejected_post_check",
                violation_types: p4PostCheck.violations.map(v => v.type),
                latency_ms: 0,
                candidate_length: p4InjectedCandidateRaw.length,
                candidate_text_preview: "[POST_CHECK_FAILED]",
                live_integrated: false,
                created_at: new Date().toISOString(),
              })
              .then(({ error }) => {
                if (error) console.warn("[P4-6] Post-check log insert failed:", error.message);
              });
          }
        } catch (e) {
          console.warn("[P4-6] Post-check failed (fail-open, keeping response):", e);
        }
      }

      } // end of judgment engine else block

      } // end of morning protocol wrapper (if !morningResponse)

    } else {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DEEP ALTER: 既存ロジック + 心の統合（Wall 3+7 Deep拡張）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Deep system prompt の構築
    const deepContext: AlterDeepContext = {
      personality,
      mode,
      pastSummaries: pastSummaries.length > 0 ? pastSummaries : undefined,
      behavioralEvidence: behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
      longTermMemory,
      growthState,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      handoffContext,
    };

    let systemPrompt: string;
    try {
      const deepResult = await buildDeepAlterPrompt(deepContext);
      systemPrompt = deepResult.prompt;
      derivedFactSet = deepResult.derivedFactSet; // outer scope variable
    } catch (e) {
      console.warn("[alter] Deep prompt build failed, falling back to standard:", e);
      systemPrompt = buildAlterSystemPrompt(
        personality,
        mode,
        pastSummaries.length > 0 ? pastSummaries : undefined,
        behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
        undefined,
        longTermMemory,
      );
    }

    if (contradictionHint) {
      systemPrompt += `\n\n## セッション間の矛盾検出\n${contradictionHint}\nこの過去の発言との矛盾を、好奇心を持って対話に織り込んでください。判断ではなく、好奇心で。`;
    }

    // ── Episodic Recall: 過去の会話想起ブロック注入 ──
    if (episodicRecallResult && episodicRecallResult.promptBlock) {
      systemPrompt += `\n\n${episodicRecallResult.promptBlock}`;
      console.info(
        `[alter] Episodic recall injected: mode=${episodicRecallResult.mode}, ` +
        `matches=${episodicRecallResult.matches.length}, blockLen=${episodicRecallResult.promptBlock.length}`,
      );
    }

    // ── Wall 3+7: Deep Alter にも心の統合ブロックを注入 ──
    try {
      // Deep Alter では userState が未計算 → ここで軽量推定
      const deepUserState = estimateUserState(message);
      const deepRtSignal = rawResponseTimeMs
        ? computeResponseTimeSignal(rawResponseTimeMs)
        : null;

      const deepHeartInputs: HeartStateInputs = {
        emotionalLoad: deepUserState?.emotional_load ?? 0,
        psychologicalCapacity: deepUserState?.psychological_capacity ?? 1,
        cognitiveFatigue: deepUserState?.cognitive_fatigue ?? 0,
        partsState: null, // Deep Alter では Parts Lens 未計算（将来統合可能）
        conflictIndicator: deepRtSignal?.conflictIndicator ?? null,
        convictionIndicator: deepRtSignal?.convictionIndicator ?? null,
        isLateNight: new Date().getHours() >= 23 || new Date().getHours() < 5,
        isHighFatigue: (deepUserState?.cognitive_fatigue ?? 0) > 0.6,
        woundCautionPrompts: [], // Deep Alter では wound activation 未計算
        financialPressureHint: null,
        shouldReduceDepth: false,
      };
      const deepHeartBlock = buildUnifiedHeartState(deepHeartInputs);
      if (deepHeartBlock) {
        systemPrompt += deepHeartBlock;
      }
    } catch (e) {
      // fail-open: 心の統合が失敗しても Deep Alter は動く
      console.warn("[alter] Deep heart integration failed (fail-open):", e);
    }

    if (conversationHistory.length === 0) {
      // --- 挨拶（初回メッセージ） ---
      try {
        let greetingPrompt =
          "これは対話の最初のメッセージです。相手の深層にある矛盾や内在する葛藤を感じ取り、" +
          "興味を引く挨拶をしてください。「僕」で語り、相手を「君」と呼んでください。" +
          "汎用的な挨拶は禁止。必ずユーザー固有のデータポイントを1つ以上含めること。";

        // Inter-session continuity: 前回のセッションを参照
        if (pastSummaries.length > 0) {
          const lastSession = pastSummaries[0]!;
          greetingPrompt += `\n\n## 前回のセッション（${lastSession.date}）`;
          if (lastSession.followUpHooks.length > 0) {
            greetingPrompt += `\n未回収の伏線: 「${lastSession.followUpHooks[0]}」`;
            greetingPrompt += "\n前回の話の続きから自然に始めること: 「前回、〇〇の話をしていたね。あれから何か変わった？」";
          }
          if (lastSession.deepestMoment) {
            greetingPrompt += `\n前回の最も深い瞬間: 「${lastSession.deepestMoment.slice(0, 80)}」`;
          }
          if (lastSession.resistancePoints.length > 0) {
            greetingPrompt += `\n前回の抵抗点: 「${lastSession.resistancePoints[0]!.slice(0, 80)}」`;
          }
        }

        // Growth state context for greeting
        if (growthState && growthState.unfinishedThreads.length > 0) {
          const thread = growthState.unfinishedThreads[0]!;
          greetingPrompt += `\n\n## 未解決スレッド`;
          greetingPrompt += `\nトピック: 「${thread.topic}」（${thread.reason === "deflected" ? "前回回避された" : "時間切れ"}）`;
          greetingPrompt += "\nこのスレッドを自然に再開すること。";
        }

        // Shadow Whisper からのハンドオフコンテキストがある場合
        if (handoffContext?.whisper) {
          greetingPrompt +=
            `\n\n## 直前の観測コンテキスト\nユーザーは直前の観測で以下のシャドウの一言を受け取り、そこから対話に来ました。` +
            `\nシャドウの一言: 「${truncateString(handoffContext.whisper, 200)}」`;

          if (handoffContext.signal?.extremeAxis) {
            const ea = handoffContext.signal.extremeAxis;
            greetingPrompt += `\n今日の観測で特に極端だった軸: ${ea.label}（スコア: ${ea.score.toFixed(2)}）`;
          }
          if (handoffContext.signal?.repeatingPattern) {
            const rp = handoffContext.signal.repeatingPattern;
            greetingPrompt += `\n繰り返しパターン検出: ${rp.label}が${rp.dayCount}日連続で同じ傾向`;
          }

          greetingPrompt +=
            "\nこの文脈を踏まえて、シャドウの一言の続きとして自然に会話を始めてください。" +
            "一言を繰り返すのではなく、そこから更に深い問いかけや気づきを投げかけてください。";
        }
        llmCallCount++;
        const aiResult = await runAI({
          taskType: "stargazer_alter_response",
          prompt: greetingPrompt,
          systemPrompt,
          requireJson: false,
          temperature: 0.85,
          maxOutputTokens: 900,
          userId: userId,
          metadata: makeStargazerRunMetadata({ feature: "alter", mode, turnNumber: 0, skipCache: true }),
        });
        const fallbackGreeting = generateAlterGreeting(
          personality,
          pastSummaries.length > 0 ? pastSummaries : undefined,
          behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
          p0DiscreteTrustLevel as 0 | 1 | 2 | 3 | 4,
        );
        if (aiResult.success && aiResult.text?.trim()) {
          alterResponseText = truncateString(
            finalizeAlterResponse(aiResult.text, fallbackGreeting),
            MAX_RESPONSE_LENGTH,
          );
        } else {
          alterResponseText = fallbackGreeting;
        }
      } catch (e) {
        console.warn("[alter] AI greeting failed, using template fallback:", e);
        alterResponseText = generateAlterGreeting(
          personality,
          pastSummaries.length > 0 ? pastSummaries : undefined,
          behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
          p0DiscreteTrustLevel as 0 | 1 | 2 | 3 | 4,
        );
      }
    } else {
      // --- 通常の応答 ---
      try {
        const conversationContext = conversationHistory
          .slice(-10) // 直近10メッセージに制限
          .map(
            (d) =>
              `${d.role === "user" ? "ユーザー" : "シャドウ"}: ${d.content}`,
          )
          .join("\n");
        const prompt = `${conversationContext}\nユーザー: ${message}\nシャドウ:`;

        const fallbackResponse = generateAlterResponse(
          personality,
          message,
          conversationHistory,
          mode,
          p0DiscreteTrustLevel as 0 | 1 | 2 | 3 | 4,
        );

        // リトライ付きAI呼び出し（最大2回）
        let aiSuccess = false;
        for (let attempt = 0; attempt < 2 && !aiSuccess; attempt++) {
          try {
            llmCallCount++;
            const aiResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt,
              systemPrompt,
              requireJson: false,
              temperature: 0.85 + attempt * 0.05, // リトライ時は温度を微調整
              maxOutputTokens: 900,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode,
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt,
              }),
            });
            if (aiResult.success && aiResult.text?.trim()) {
              const finalized = finalizeAlterResponse(aiResult.text, fallbackResponse);
              if (!looksIncompleteAlterResponse(finalized)) {
                alterResponseText = truncateString(finalized, MAX_RESPONSE_LENGTH);
                aiSuccess = true;
              }
            }
          } catch (retryError) {
            console.warn(`[alter] AI attempt ${attempt + 1} failed:`, retryError);
          }
        }

        // 全リトライ失敗時はフォールバック
        if (!aiSuccess) {
          alterResponseText = fallbackResponse;
        }
      } catch (e) {
        console.warn(
          "[alter] AI response failed, using template fallback:",
          e,
        );
        alterResponseText = generateAlterResponse(
          personality,
          message,
          conversationHistory,
          mode,
          p0DiscreteTrustLevel as 0 | 1 | 2 | 3 | 4,
        );
      }
    }
    } // end Deep Alter branch

    // provocation レベル (1-5)
    const provocationLevel =
      mode === "warm" ? 1 : mode === "provocative" ? 4 : 3;

    // ユーザーメッセージと Alter レスポンスを DB に保存
    const now = new Date().toISOString();
    const [{ error: userMsgError }, { error: alterMsgError }] =
      await Promise.all([
        supabase.from("stargazer_alter_dialogues").insert({
          user_id: userId,
          session_id: sessionId,
          role: "user",
          alter_mode: mode,
          message,
          created_at: now,
        }),
        supabase.from("stargazer_alter_dialogues").insert({
          user_id: userId,
          session_id: sessionId,
          role: "alter",
          alter_mode: mode,
          message: alterResponseText,
          created_at: new Date(Date.now() + 1).toISOString(),
          ...(isHomeAlter ? { emotional_context: { source: "home", question: message, response_mode: responseMode } } : {}),
        }),
      ]);

    if (userMsgError) {
      console.error("Failed to save user message:", userMsgError);
    }
    if (alterMsgError) {
      console.error("Failed to save alter response:", alterMsgError);
    }
    if (userMsgError || alterMsgError) {
      return NextResponse.json(
        { error: "対話の保存に失敗しました" },
        { status: 500 },
      );
    }

    // Home Alter: reasoning basis + decision metadata を追加して返却
    const reasoningBasis = isHomeAlter
      ? extractReasoningBasis(personality, rawHomeContext ?? null, alterResponseText)
      : undefined;

    // Decision metadata: skeleton確定値を正、LLM出力は参考情報
    // action_shape の主権は skeleton にある。LLM の self-reported shape は使わない。
    let decisionMetadata: DecisionMetadata | undefined;
    // P2-4: direct_response（greeting/chat_opening/scope_disclosure/factual_recall）と repair はメタデータ不要
    // これらは判断モードではないため、LLMが metadata block を返さないのは期待通り
    const needsDecisionMetadata = isHomeAlter
      && responseMode !== "clarify"
      && responseMode !== "direct_response"
      && responseMode !== "repair";
    if (needsDecisionMetadata) {
      const framework = buildJudgmentFramework(personality, rawHomeContext ?? null, message);
      // 事前計算値（信頼できるソース）
      const fallbackMeta = computeFallbackDecisionMetadata(framework);
      let rawMeta: DecisionMetadata;
      if (homeDecisionMeta) {
        // LLM出力あり → 構造データは全て事前計算値で上書き
        // (LLMのラベル推定は不安定なため、構造データは事前計算を正とする)
        rawMeta = homeDecisionMeta;
        rawMeta.force_balance = fallbackMeta.force_balance;
        rawMeta.opportunity_value = fallbackMeta.opportunity_value;
        rawMeta.cost_load = fallbackMeta.cost_load;
        rawMeta.relation_value = fallbackMeta.relation_value;
      } else {
        rawMeta = fallbackMeta;
        rawMeta._is_fallback = true;
        // P2-4: 本物の fallback（判断モードで LLM がメタデータを返さなかった）のみログ
        console.info(`[home-alter] Using fallback decision metadata (mode=${responseMode}, domain=${queryContext?.domain ?? "?"}, qtype=${questionType})`);
      }

      // State Layer の protect/expand デルタを ForceBalance に適用
      // (心理的余力が低い → 守り圧UP / 感情負荷高い → 守り圧UP + 拡張圧DOWN)
      if (stateAdjustment && rawMeta.force_balance) {
        rawMeta.force_balance.protect_pressure = Math.min(1, Math.max(0,
          rawMeta.force_balance.protect_pressure + stateAdjustment.protect_pressure_delta));
        rawMeta.force_balance.expand_pressure = Math.min(1, Math.max(0,
          rawMeta.force_balance.expand_pressure + stateAdjustment.expand_pressure_delta));
      }

      // Wound Activation による protect_pressure ブースト
      // 傷が活性化しているとき、守り圧を引き上げて攻めすぎを防ぐ
      if (woundActivationResult && woundActivationResult.max_protect_boost > 0 && rawMeta.force_balance) {
        const prevProtect = rawMeta.force_balance.protect_pressure;
        rawMeta.force_balance.protect_pressure = Math.min(1,
          rawMeta.force_balance.protect_pressure + woundActivationResult.max_protect_boost);
        console.info(`[wound-activation] protect_pressure boosted: ${prevProtect.toFixed(2)} → ${rawMeta.force_balance.protect_pressure.toFixed(2)} (+${woundActivationResult.max_protect_boost.toFixed(2)})`);
      }

      // Financial Pressure による cost_load ブースト
      // 経済的に厳しい状況では、コスト負荷を引き上げて高コスト提案を抑制
      if (financialPressure && financialPressure.cost_load_boost > 0 && rawMeta.force_balance) {
        const prevCost = rawMeta.force_balance.cost_load;
        rawMeta.force_balance.cost_load = Math.min(1,
          rawMeta.force_balance.cost_load + financialPressure.cost_load_boost);
        console.info(`[financial-pressure] cost_load boosted: ${prevCost.toFixed(2)} → ${rawMeta.force_balance.cost_load.toFixed(2)} (+${financialPressure.cost_load_boost.toFixed(2)})`);
      }

      // action_shape は skeleton 確定値を正とする（LLM の self-reported shape を破棄）
      if (judgmentSkeleton) {
        const llmShape = rawMeta.action_shape;
        rawMeta.action_shape = judgmentSkeleton.action_shape;
        if (llmShape !== judgmentSkeleton.action_shape) {
          console.info(`[home-alter] Shape overridden: LLM=${llmShape} → skeleton=${judgmentSkeleton.action_shape}`);
        }
      }

      // 本文とメタデータの整合性チェック＋再整合（action_shape は変更しない）
      decisionMetadata = reconcileDecisionMetadata(alterResponseText, rawMeta);

      // reconcile 後も skeleton の action_shape を再適用（reconcile が上書きした場合を防ぐ）
      if (judgmentSkeleton && decisionMetadata.action_shape !== judgmentSkeleton.action_shape) {
        console.info(`[home-alter] Shape re-enforced after reconcile: ${decisionMetadata.action_shape} → ${judgmentSkeleton.action_shape}`);
        decisionMetadata.action_shape = judgmentSkeleton.action_shape;
        // stance も skeleton の shape から再導出
        const SHAPE_STANCE_MAP: Record<string, string> = {
          full_go: "go", bounded_go: "go", prepare_then_go: "wait",
          trial_then_decide: "go", observe_first: "wait",
          delegate_or_request: "go", defer_with_trigger: "no", skip: "no",
        };
        decisionMetadata.decision_stance = (SHAPE_STANCE_MAP[judgmentSkeleton.action_shape] ?? "wait") as DecisionMetadata["decision_stance"];
      }

      if (decisionMetadata.decision_stance !== rawMeta.decision_stance) {
        console.info(`[home-alter] Metadata reconciled: ${rawMeta.decision_stance} → ${decisionMetadata.decision_stance}`);
      }
    }

    // Home Alter: decisionMetadata を dialogue に追記 + analytics イベント発火
    if (isHomeAlter && decisionMetadata) {
      // emotional_context に decisionMetadata を追記（非同期、エラー無視）
      supabase
        .from("stargazer_alter_dialogues")
        .update({
          emotional_context: {
            source: "home",
            question: message,
            decision: {
              action_shape: decisionMetadata.action_shape,
              decision_stance: decisionMetadata.decision_stance,
              opportunity_value: decisionMetadata.opportunity_value,
              cost_load: decisionMetadata.cost_load,
              relation_value: decisionMetadata.relation_value,
              force_balance: decisionMetadata.force_balance,
            },
          },
        })
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .eq("role", "alter")
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Failed to persist decisionMetadata:", error.message);
        });

      // analytics イベント（fire-and-forget）
      supabase
        .from("stargazer_analytics")
        .insert({
          user_id: userId,
          event: "home_alter_judgment",
          feature: "home_alter",
          metadata: {
            session_id: sessionId,
            total_latency_ms: Date.now() - routeStart,
            llm_call_count: llmCallCount,
            action_shape: decisionMetadata.action_shape,
            decision_stance: decisionMetadata.decision_stance,
            opportunity_value: decisionMetadata.opportunity_value,
            cost_load: decisionMetadata.cost_load,
            relation_value: decisionMetadata.relation_value,
            growth_vector_override: decisionMetadata.growth_vector_override,
            energy_adjustment: decisionMetadata.energy_adjustment,
            regret_direction: decisionMetadata.regret_direction,
            // Ambiguity Engine metadata
            query_domain: queryContext?.domain,
            ambiguity_score: queryContext?.ambiguity_score,
            information_score: queryContext?.information?.score,
            information_signals: queryContext?.information ? {
              decision_target: queryContext.information.has_decision_target,
              context_reason: queryContext.information.has_context_reason,
              constraint_tradeoff: queryContext.information.has_constraint_or_tradeoff,
              time_signal: queryContext.information.has_time_signal,
              length_bucket: queryContext.information.input_length_bucket,
            } : undefined,
            response_mode: responseMode,
            mode_decision_reason: modeDecisionReason,
            mode_decision_version: "v4",
            // P1-C: リアクション分類結果
            reaction: detectedReaction ? {
              type: detectedReaction.type,
              disagree_strength: detectedReaction.disagree_strength ?? null,
              redirect_subtype: detectedReaction.redirect_subtype ?? null,
              confidence: detectedReaction.confidence,
            } : null,
            // Relational Lens metadata
            relational_lens: relationalLens ? {
              target_role: relationalLens.target_role,
              interaction_purpose: relationalLens.interaction_purpose,
              relational_temperature: relationalLens.relational_temperature,
              risk_direction: relationalLens.risk_direction,
              communication_register: relationalLens.communication_register,
              involves_other: relationalLens.involves_other,
            } : undefined,
            // P1.5 Thin-Slice metadata
            thin_slice: buildThinSliceAnalytics(
              thinSliceActive, turnValue, thinSliceInsight,
              thinSliceBet, thinSliceClaim, thinSliceBetOutcome,
            ),
            // v4.2 FULL metadata
            v42: thinSliceActive ? {
              ...(v42Signal ? buildSignalAnalytics(v42Signal) : {}),
              ...(v42SelfModel ? buildSelfModelAnalytics(v42SelfModel) : {}),
              ...(v42Arena ? { arena_primary_lens: v42Arena.primary.lens, ...buildArenaAnalytics(v42Arena) } : {}),
              ...(v42Role ? buildContractAnalytics(v42Role, v42SemanticBanCheck) : {}),
              ...(v42Compliance ? buildComplianceAnalytics(v42Compliance) : {}),
              ...(v42RallyCritic ? buildRallyCriticAnalytics(v42RallyCritic) : {}),
            } : undefined,
            // 学習ループ用: フォローアップ傾向が判断に影響したか
            followup_insight_applied: !!followupInsight,
            question_category: questionCategory,
            // P0観測配線: P2（意味づける知能）のための記録
            p0_observation: {
              trust_level_discrete: p0DiscreteTrustLevel,
              trust_level_continuous: growthState?.trustLevel ?? 0,
              trust_base: trustResult?.baseTrust ?? p0DiscreteTrustLevel,
              trust_signal_adjusted: trustResult?.signalAdjustedTrust ?? p0DiscreteTrustLevel,
              trust_phase_capped: trustResult?.phaseCapped ?? false,
              trust_adjustment_reason: trustResult?.adjustmentReason ?? null,
              sessions_completed: growthState?.sessionsCompleted ?? 0,
              context_entries_loaded: p0ContextEntriesLoaded,
              question_type: questionType,
              is_emotional: questionType === "emotional",
              is_self_understanding: questionType === "self_understanding",
              validation_failures: p0ValidationFailures,
              used_fallback_metadata: !homeDecisionMeta || !!decisionMetadata?._is_fallback,
              // R3-#4: コンテキスト注入の実態ログ
              ctx_loaded: ctxLoaded,
              ctx_used: ctxUsed,
              ctx_dropped_reasons: ctxDroppedReasons.length > 0 ? ctxDroppedReasons.slice(0, 5) : undefined,
            },
            // P1: 検証層（HDM v1）
            p1_verification: {
              ...(p1RuptureAssessment ? buildRuptureAnalytics(p1RuptureAssessment) : {}),
              ...(p1AbstentionSignal ? buildAbstentionAnalytics(p1AbstentionSignal) : {}),
              ...(p1NegCapState ? buildNegativeCapabilityAnalytics(p1NegCapState) : {}),
            },
            // P1.5: 構造的制約（HDM v1）
            p15_constraints: p15Constraints ? buildP15ConstraintAnalytics(p15Constraints) : undefined,
            // P2-1: Narrative Lens（意味づけの変化追跡）
            p2_narrative_lens: (p2NarrativeRevision || p2NarrativeFreezing)
              ? buildNarrativeLensAnalytics(p2NarrativeRevision, p2NarrativeFreezing ?? { isFrozen: false, frozenThemes: [], frozenDays: 0, shouldTriggerShake: false, innerSense: null })
              : undefined,
            // P2-2: Body Lens（身体→感情構築パターン）
            p2_body_lens: p2BodySignals.length > 0
              ? buildBodyLensAnalytics(p2BodySignals, p2BodyMappings, p2BodyPromptInjected)
              : undefined,
            // P2-3: Parts Lens（パート力学）
            p2_parts_lens: p2PartsState
              ? buildPartsLensAnalytics(p2PartsState)
              : undefined,
            // P2-4: Memory Policy（記憶ライフサイクル）
            p2_memory_policy: p2MemoryPolicyResult
              ? buildMemoryPolicyAnalytics(p2MemoryPolicyResult, p2CascadeDecays)
              : undefined,
            // Heart Integration
            heart_state: heartStateAnalytics ?? undefined,
            // Wall 1+6: Personalization Tracking
            personalization: personalizationResult?.analytics ?? undefined,
            // Wall 5: Session Diff
            session_diff: sessionDiffAnalytics ?? undefined,
            // P3-1: HDM Phase Controller
            p3_hdm_phase: p3HdmPhaseAnalytics ?? undefined,
            // P4-6: Counterfactual Live Integration
            p4_live_integrated: p4LiveIntegrated,
            p4_decision: p4Decision,
            // P5: Reality Anchoring
            p5_injected: p5Injected,
            p5_gate: p5GateResult ? {
              allowed: p5GateResult.allowed,
              block_reasons: p5GateResult.reasons,
            } : undefined,
            // P5-3: After-Action Loop
            p5_after_action_signal: p5AfterActionSignal,
            p5_after_action_injected: p5AfterActionInjected,
            // Stage 1: Shadow Promotion Recommendation
            promotion_recommendation: promotionReadiness ? {
              recommend: promotionReadiness.recommend,
              transition: promotionReadiness.transition,
              met: promotionReadiness.metConditions,
              missing: promotionReadiness.missingConditions,
            } : undefined,
            // Layer 2: 判断骨格
            judgment_skeleton: judgmentSkeleton ? {
              action_shape: judgmentSkeleton.action_shape,
              primary_reason: judgmentSkeleton.primary_reason,
              confidence_level: judgmentSkeleton.confidence_level,
              growth_alignment: judgmentSkeleton.growth_alignment,
            } : undefined,
            // Layer 4: 品質検証結果
            quality_check: qualityCheck ? {
              pass: qualityCheck.pass,
              failures: qualityCheck.failures,
              generic_response_score: qualityCheck.generic_response_score,
            } : undefined,
            // Layer 5: 監査トレイル（完全版）
            audit_trail: auditTrail ?? undefined,
            // Phase 5: 不気味ライン検知結果
            creepiness_check: creepinessCheck ? {
              pass: creepinessCheck.pass,
              violation_count: creepinessCheck.violations.length,
              violations: creepinessCheck.violations.map(v => ({ type: v.type, severity: v.severity })),
            } : undefined,
            // Understanding System metadata
            user_state: userState ? {
              psychological_capacity: userState.psychological_capacity,
              emotional_load: userState.emotional_load,
              cognitive_fatigue: userState.cognitive_fatigue,
              estimation_basis: userState.estimation_basis,
            } : undefined,
            state_adjustment: stateAdjustment ? {
              protect_pressure_delta: stateAdjustment.protect_pressure_delta,
              expand_pressure_delta: stateAdjustment.expand_pressure_delta,
              simplify_response: stateAdjustment.simplify_response,
              prefer_conclude: stateAdjustment.prefer_conclude_over_clarify,
            } : undefined,
            micro_insight: microInsight ? {
              suggested_prompt: microInsight.suggested_prompt,
              presentation: microInsight.presentation_type,
              signal_count: microInsight.signals.length,
              convergence_score: microInsight.convergence_score?.combined,
              session_diversity: microInsight.convergence_score?.session_diversity,
              temporal_spread_days: microInsight.convergence_score?.temporal_spread_days,
              suppressed: insightSuppressedReason || undefined,
              presented: insightPresented,
            } : undefined,
            route_c_intent: selectedRouteCIntent ? {
              intent_id: selectedRouteCIntent.intent.id,
              intent_name: selectedRouteCIntent.intent.name,
              intent_layer: selectedRouteCIntent.intent.layer,
              effective_priority: selectedRouteCIntent.effective_priority,
            } : undefined,
            wound_activation: woundActivationResult?.most_active ? {
              wound_id: woundActivationResult.most_active.wound_id,
              theme: woundActivationResult.most_active.theme,
              score: Number(woundActivationResult.most_active.activation_score.toFixed(3)),
              level: woundActivationResult.most_active.level,
              suppressed_mi: woundActivationResult.should_suppress_mi,
              avoided_route_c: woundActivationResult.should_avoid_route_c,
              protect_boost: Number(woundActivationResult.max_protect_boost.toFixed(3)),
            } : undefined,
            financial_pressure: financialPressure && financialPressure.level !== "none" ? {
              score: Number(financialPressure.score.toFixed(3)),
              level: financialPressure.level,
              cost_load_boost: Number(financialPressure.cost_load_boost.toFixed(3)),
            } : undefined,
            context_modifier: contextualizedScores && contextualizedScores.modified_axes.length > 0 ? {
              domain: contextualizedScores.domain,
              modified_axes: contextualizedScores.modified_axes,
            } : undefined,
            // Output Governance Layer metrics
            governance: {
              user_bans_count: govUserBans.length,
              user_bans: govUserBans.map(b => b.expression),
              user_ban_violation: govUserBanViolation ? !govUserBanViolation.passed : null,
              frustration_level: govFrustration.level,
              frustration_triggers: govFrustration.triggers.length,
              unresolved_requests: govFrustration.unresolved_requests,
              repeated_correction_count: govFrustration.repeated_correction_count,
              forced_repair: modeDecisionReason === "governance_frustration_escalation",
            },
            // Proactive Understanding Engine metrics
            proactive: proactiveOutput ? {
              phase: proactiveOutput.phase,
              probe_selected: !!proactiveOutput.selectedProbe,
              probe_blocked: proactiveOutput.probeBlocked,
              probe_block_reason: proactiveOutput.probeBlockReason,
              weakest_category: proactiveOutput.gap.weakest_category,
              weakest_confidence: proactiveOutput.gap.weakest_confidence,
              weakest_quality_axis: proactiveOutput.gap.weakest_quality_axis,
              detected_trust_events: proactiveOutput.detectedTrustEvents,
              // TASK-2: Continuity metrics
              extraction_confidence: proactiveOutput.currentTopicContext?.extraction_confidence ?? null,
              continuity_total_candidates: proactiveOutput.continuity_total_candidates,
              continuity_adopted_count: proactiveOutput.continuity_adopted_count,
              continuity_rejection_signal: (
                proactiveOutput.detectedTrustEvents.includes("prediction_rejected") &&
                proactiveOutput.continuity_adopted_count > 0
              ) ? 1 : 0,
              active_domains: proactiveOutput.currentTopicContext?.active_domains ?? [],
              active_axes: proactiveOutput.currentTopicContext?.active_axes ?? [],
              // TASK-4: VoI top score
              voi_top_score: proactiveOutput.voi_top_score ?? null,
              // TASK-1: StanceVector
              stance: proactiveOutput.stance ?? null,
              // TASK-5b: EmbeddedSensor
              embedded_sensor: proactiveOutput.embeddedSensor ? {
                target_axis: proactiveOutput.embeddedSensor.target_axis,
                style: proactiveOutput.embeddedSensor.style,
                confidence: proactiveOutput.embeddedSensor.confidence,
              } : null,
            } : undefined,
            // Phase 0: Gemini一次読解メトリクス
            utterance_reading: utteranceReading ? {
              latency_ms: utteranceReadingLatencyMs,
              surface_intent: utteranceReading.surface_intent.slice(0, 100),
              emotional_temperature: utteranceReading.emotional_temperature,
              energy_direction: utteranceReading.energy_direction,
              relational_target: utteranceReading.relational_context?.target_role ?? null,
              notable_expressions_count: utteranceReading.notable_expressions.length,
              implied_meanings_count: utteranceReading.implied_meanings.length,
              unspoken_candidates_count: utteranceReading.unspoken_candidates.length,
              phase: "A_active",
            } : utteranceReadingLatencyMs > 0 ? {
              latency_ms: utteranceReadingLatencyMs,
              phase: "failed",
            } : undefined,

            // Episodic Recall — 常に3フィールド記録（Phase 1 実運用判断用）
            episodic_recall_detected: !!episodicRecallResult,
            episodic_recall_mode: episodicRecallResult?.mode ?? "none",
            episodic_recall_latency_ms: episodicRecallLatencyMs,
            episodic_recall: episodicRecallResult ? {
              signal_type: episodicRecallResult.signal.type,
              time_hint: episodicRecallResult.signal.timeHint,
              topic_hint: episodicRecallResult.signal.topicHint,
              person_hint: episodicRecallResult.signal.personHint,
              needs_specific_quote: episodicRecallResult.signal.needsSpecificQuote,
              matches_count: episodicRecallResult.matches.length,
              core_exchanges_count: episodicRecallResult.coreExchanges.length,
              block_length: episodicRecallResult.promptBlock.length,
            } : undefined,
            // ── 派生事実トレーサビリティ（§7-A: home_alter_judgment経路） ──
            ...(derivedFactSet ? (() => {
              const includedRules = new Set(derivedFactSet.facts.map((f) => f.generationRule));
              const candidates = derivedFactSet.allCandidates ?? derivedFactSet.facts;
              return {
                derived_facts: candidates.map((f) => ({
                  sourceType: f.sourceType,
                  sourceAxes: f.sourceAxes,
                  confidence: f.confidence,
                  generationRule: f.generationRule,
                  includedInPrompt: includedRules.has(f.generationRule),
                })),
                derived_facts_summary: {
                  totalGenerated: candidates.length,
                  totalIncluded: derivedFactSet.facts.length,
                  uniqueAxesUsed: derivedFactSet.totalAxesUsed,
                },
                axis_registry_version: "1.0.0",
              };
            })() : {}),
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Analytics insert failed:", error.message);
        });

      // ── Phase 2: Decision Pattern 蓄積 ──
      // ActionShape の分布をドメイン別に記録
      const domain = queryContext?.domain ?? "unknown";
      const patternKey = `decision_${domain}`;
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data, confidence")
        .eq("user_id", userId)
        .eq("pattern_type", "decision")
        .eq("pattern_key", patternKey)
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return; // PGRST116 = no rows
          try {
            const shape = decisionMetadata.action_shape;
            if (existing) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pd = existing.pattern_data as any;
              const dist: Record<string, number> = pd?.shape_distribution ?? {};
              dist[shape] = (dist[shape] ?? 0) + 1;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: existing.observation_count + 1,
                pattern_data: { shape_distribution: dist },
                confidence: Math.min(0.9, 0.3 + existing.observation_count * 0.03),
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "decision",
                pattern_key: patternKey,
                observation_count: 1,
                pattern_data: { shape_distribution: { [shape]: 1 } },
                confidence: 0.3,
                last_observed: new Date().toISOString(),
              });
            }
          } catch (innerErr) {
            console.warn("[pattern] Decision pattern save failed (non-fatal):", innerErr);
          }
        });

      // ── P5: Post-response ActionShape 偏差検出（P3 Section C の補完） ──
      // ActionShape が確定した後にベースラインとの比較を実行
      // 顕著なズレ（ユーザーの通常パターンと乖離する ActionShape 選択）を analytics に記録
      if (baselineDeviationsFull.length === 0 && alterSessionCount >= 5) {
        // ベースライン未検出 = P3 フェーズで decision_shift を検出できなかった可能性
        // post-response で ActionShape ベースの deviation を直接チェック
        try {
          const currentShape = decisionMetadata.action_shape;
          const { data: shapePatterns } = await supabase
            .from("stargazer_alter_patterns")
            .select("pattern_data, observation_count")
            .eq("user_id", userId)
            .eq("pattern_type", "decision")
            .eq("pattern_key", patternKey)
            .single();
          if (shapePatterns && shapePatterns.observation_count >= 5) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dist: Record<string, number> = (shapePatterns.pattern_data as any)?.shape_distribution ?? {};
            const total = Object.values(dist).reduce((s, v) => s + v, 0);
            if (total > 0) {
              const currentShapeRatio = (dist[currentShape] ?? 0) / total;
              // このドメインで < 10% の出現率の ActionShape なら偏差と見做す
              if (currentShapeRatio < 0.1) {
                console.info(`[micro-insight] P5 post-response: Unusual ActionShape "${currentShape}" in ${domain} (ratio=${currentShapeRatio.toFixed(2)}, n=${total})`);
                supabase.from("stargazer_analytics").insert({
                  user_id: userId,
                  event: "home_alter_actionshape_deviation",
                  feature: "p5_post_response",
                  metadata: {
                    domain,
                    action_shape: currentShape,
                    usual_ratio: currentShapeRatio,
                    total_observations: total,
                    shape_distribution: dist,
                  },
                }).then(({ error }) => {
                  if (error) console.warn("[micro-insight] P5 ActionShape deviation save failed:", error.message);
                });
              }
            }
          }
        } catch {
          // non-fatal
        }
      }
    }

    // ── Stage 1: Shadow Promotion Recommendation（応答確定後） ──
    if (isHomeAlter) {
      try {
        const dignityViolation = !!(p1AbstentionSignal?.reason === "dignity_risk" && p1AbstentionSignal.shouldAbstain);
        const protectiveSpike = (p2PartsState?.protective.activationLevel ?? 0) >= 0.8;

        p3HdmPhaseState = updateTrackingBuffers(
          p3HdmPhaseState,
          dignityViolation,
          protectiveSpike,
          p4LiveIntegrated,
        );

        const promotionInputs: HdmPhaseInputs = {
          sessionsCompleted: growthState?.sessionsCompleted ?? 0,
          currentSessionTurnCount: conversationDepth,
          totalTurnCount: (growthState?.sessionsCompleted ?? 0) * 8 + conversationDepth,
          continuousTrust: growthState?.trustLevel ?? 0,
          earnedTrustTotal: 0,
          selfDisclosureDepth: 0,
          causalMapConfidence: 0,
          repairSuccessRate: null,
          understandingCoverage: 0,
          defensePredictionStreak: p3HdmPhaseState.defensePredictionStreak,
          voluntaryTopicExpansionCount: p3HdmPhaseState.voluntaryTopicExpansionCount,
        };
        promotionReadiness = evaluatePromotionReadiness(
          p3HdmPhaseState,
          promotionInputs,
          p0DiscreteTrustLevel,
        );

        if (promotionReadiness?.recommend) {
          console.info(`[Stage1] Promotion recommended: ${promotionReadiness.transition} met=[${promotionReadiness.metConditions.join(",")}]`);
        }

        hdmStateDirty = true;
      } catch (e) {
        console.warn("[Stage1] Promotion readiness evaluation failed (fail-open):", e);
      }
    }

    // ── HDM Phase State 一括書き込み ──
    // 1ターン内の全変更（auto-transition / regression / cross-session / P5 / Stage 1）を
    // メモリ上で集約し、最後に1回だけ DB に書き込む。競合なし。
    if (isHomeAlter && hdmStateDirty) {
      supabase
        .from("stargazer_alter_growth")
        .update({ hdm_phase_state: p3HdmPhaseState })
        .eq("user_id", userId)
        .then(({ error }) => {
          if (error) console.warn("[HDM] Consolidated state write failed (non-fatal):", error.message);
          else console.info("[HDM] State written (consolidated)");
        });

      // ── 招待トークン: Phase到達によるポイント付与 ──
      // Phase 0→1 または →2 への遷移を検出し、招待者にポイントを付与する。
      // fire-and-forget: Alter応答を遅延させない。admin権限で実行（RLSバイパス）。
      const oldPhase = hdmPhaseAtLoad;
      const newPhase = p3HdmPhaseState.currentPhase;
      if (newPhase > oldPhase && (newPhase === 1 || newPhase === 2)) {
        const phaseToAward = newPhase as 1 | 2;
        const phaseField = phaseToAward === 1 ? "invitee_phase1" : "invitee_phase2";
        const awardedField = phaseToAward === 1 ? "points_awarded_phase1" : "points_awarded_phase2";
        const pointsAmount = phaseToAward === 1 ? 25 : 50;

        supabaseAdmin
          .from("rendezvous_invitations")
          .select("id, inviter_user_id")
          .eq("invitee_user_id", userId)
          .eq(awardedField, false)
          .then(async ({ data: invitations, error: lookupErr }) => {
            if (lookupErr) {
              console.warn("[invitation-token] Phase reward lookup failed (non-fatal):", lookupErr.message);
              return;
            }
            if (!invitations || invitations.length === 0) return;
            for (const inv of invitations) {
              try {
                await supabaseAdmin
                  .from("rendezvous_invitations")
                  .update({ [phaseField]: true, [awardedField]: true })
                  .eq("id", inv.id);

                // ポイント付与
                const { data: bal } = await supabaseAdmin
                  .from("rendezvous_token_balances")
                  .select("id, points")
                  .eq("user_id", inv.inviter_user_id)
                  .maybeSingle();

                if (bal) {
                  await supabaseAdmin
                    .from("rendezvous_token_balances")
                    .update({ points: bal.points + pointsAmount, updated_at: new Date().toISOString() })
                    .eq("id", bal.id);
                } else {
                  await supabaseAdmin
                    .from("rendezvous_token_balances")
                    .insert({ user_id: inv.inviter_user_id, points: pointsAmount });
                }
                console.info(`[invitation-token] Phase ${phaseToAward} reward: ${pointsAmount}pt to inviter ${inv.inviter_user_id}`);
              } catch (e: unknown) {
                console.warn("[invitation-token] Phase reward failed (non-fatal):", e);
              }
            }
          });
      }
    }

    // ── Phase 2: State Pattern 蓄積 ──
    // 時間帯別の心理状態平均を記録
    if (isHomeAlter && userState) {
      const hour = new Date().getHours();
      const timeBlock = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data")
        .eq("user_id", userId)
        .eq("pattern_type", "state")
        .eq("pattern_key", "time_capacity")
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return;
          try {
            const state = userState!;
            if (existing) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pd = existing.pattern_data as any;
              const blocks: Record<string, { avg_capacity: number; avg_load: number; avg_fatigue: number; sample_count: number }> = pd?.time_blocks ?? {};
              const block = blocks[timeBlock] ?? { avg_capacity: 0.5, avg_load: 0.3, avg_fatigue: 0.3, sample_count: 0 };
              const n = block.sample_count + 1;
              block.avg_capacity = (block.avg_capacity * (n - 1) + state.psychological_capacity) / n;
              block.avg_load = (block.avg_load * (n - 1) + state.emotional_load) / n;
              block.avg_fatigue = (block.avg_fatigue * (n - 1) + state.cognitive_fatigue) / n;
              block.sample_count = n;
              blocks[timeBlock] = block;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: existing.observation_count + 1,
                pattern_data: { time_blocks: blocks },
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "state",
                pattern_key: "time_capacity",
                observation_count: 1,
                pattern_data: {
                  time_blocks: {
                    [timeBlock]: {
                      avg_capacity: state.psychological_capacity,
                      avg_load: state.emotional_load,
                      avg_fatigue: state.cognitive_fatigue,
                      sample_count: 1,
                    },
                  },
                },
                confidence: 0.3,
                last_observed: new Date().toISOString(),
              });
            }
          } catch (innerErr) {
            console.warn("[pattern] State pattern save failed (non-fatal):", innerErr);
          }
        });
    }

    // ── P3 Prep: emotional_baseline 蓄積 ──
    // ForceBalance の emotional_load を移動平均として記録（P3 ベースライン構築の材料）
    if (isHomeAlter && userState) {
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data")
        .eq("user_id", userId)
        .eq("pattern_type", "state")
        .eq("pattern_key", "emotional_baseline")
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return;
          try {
            const load = userState!.emotional_load;
            if (existing) {
              const pd = existing.pattern_data as any;
              const n = (pd?.sample_count ?? 0) + 1;
              const oldAvg = pd?.avg_emotional_load ?? 0.3;
              const oldVariance = pd?.variance ?? 0;
              const newAvg = (oldAvg * (n - 1) + load) / n;
              // Welford's online variance
              const delta = load - oldAvg;
              const delta2 = load - newAvg;
              const newVariance = n > 1 ? (oldVariance * (n - 2) + delta * delta2) / (n - 1) : 0;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: n,
                pattern_data: { avg_emotional_load: newAvg, variance: newVariance, sample_count: n },
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "state",
                pattern_key: "emotional_baseline",
                observation_count: 1,
                pattern_data: { avg_emotional_load: load, variance: 0, sample_count: 1 },
                confidence: 0.2,
                last_observed: new Date().toISOString(),
              });
            }
          } catch { /* non-fatal */ }
        });
    }

    // ── P3 Prep: category_distribution 蓄積 ──
    // ユーザーが何について聞くかの分布（P3 ベースライン構築の材料）
    if (isHomeAlter && questionCategory) {
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data")
        .eq("user_id", userId)
        .eq("pattern_type", "decision")
        .eq("pattern_key", "category_distribution")
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return;
          try {
            if (existing) {
              const pd = existing.pattern_data as any;
              const dist: Record<string, number> = pd?.category_counts ?? {};
              dist[questionCategory] = (dist[questionCategory] ?? 0) + 1;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: existing.observation_count + 1,
                pattern_data: { category_counts: dist },
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "decision",
                pattern_key: "category_distribution",
                observation_count: 1,
                pattern_data: { category_counts: { [questionCategory]: 1 } },
                confidence: 0.2,
                last_observed: new Date().toISOString(),
              });
            }
          } catch { /* non-fatal */ }
        });
    }

    // ── Phase 5: 継続的検証 — 精度指標の計測（fire-and-forget） ──
    if (isHomeAlter) {
      // 5-3 + 5-4: Trust 閾値調整 + MI 精度（reaction データから計測）
      supabase.from("stargazer_alter_reactions")
        .select("reaction, insight_type, signal_types")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data: recentReactions }) => {
          if (!recentReactions || recentReactions.length < 5) return;

          try {
            // Trust Gate 閾値調整推奨
            const trustAdj = suggestTrustThresholdAdjustment(recentReactions);
            if (trustAdj.recommendation !== "maintain") {
              console.info(`[phase5-trust] Recommendation: ${trustAdj.recommendation} — ${trustAdj.reason}`);
            }

            // MI 精度指標
            const miMetrics = computeMIAccuracy(recentReactions as Array<{ reaction: string; insight_type: string; signal_types: string[] }>);
            if (miMetrics.signals_to_suppress.length > 0) {
              console.warn(`[phase5-mi] Signals to suppress (denied≥50%): ${miMetrics.signals_to_suppress.join(", ")}`);
            }

            // 精度指標を analytics に記録（定期スナップショット）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "phase5_accuracy_snapshot",
              feature: "continuous_verification",
              metadata: {
                trust_adjustment: trustAdj,
                mi_accuracy: {
                  acceptance_rate: miMetrics.acceptance_rate,
                  signals_to_suppress: miMetrics.signals_to_suppress,
                  total_presented: miMetrics.total_presented,
                },
              },
            }).then(({ error }) => {
              if (error) console.warn("[phase5] Accuracy snapshot save failed:", error.message);
            });
          } catch (e) {
            console.warn("[phase5] Accuracy metrics computation failed (non-fatal):", e);
          }
        });

      // 5-1: Judgment 精度（followup データから計測）
      supabase.from("stargazer_analytics")
        .select("metadata")
        .eq("user_id", userId)
        .eq("event", "home_alter_followup")
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data: followupRows }) => {
          if (!followupRows || followupRows.length < 5) return;
          try {
            const metrics = computeJudgmentAccuracy(followupRows as Array<{ metadata: any }>);
            if (metrics.regret_rate > 0.3) {
              console.warn(`[phase5-judgment] High regret rate: ${(metrics.regret_rate * 100).toFixed(0)}%`);
            }
            if (metrics.execution_rate < 0.3) {
              console.info(`[phase5-judgment] Low execution rate: ${(metrics.execution_rate * 100).toFixed(0)}% — proposals may not match user needs`);
            }
          } catch (e) {
            console.warn("[phase5] Judgment accuracy computation failed (non-fatal):", e);
          }
        });

      // ── 5-5: 失敗罠の自動検知（fire-and-forget） ──
      // 6つの失敗パターン（監視・負荷・停滞・物語・固定化・投影）を一括スキャン
      // 結果は analytics に保存し、次回リクエストで参照して MI/RouteC/depth を制御
      Promise.all([
        supabase.from("stargazer_alter_reactions")
          .select("reaction, insight_type, signal_types")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .eq("event", "home_alter_followup")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .in("event", ["home_alter_clarify", "home_alter_intent_used"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("stargazer_alter_hypotheses")
          .select("status, confidence, last_observed")
          .eq("user_id", userId)
          .in("status", ["emerging", "strengthening", "stable"])
          .limit(30),
        supabase.from("stargazer_alter_context")
          .select("last_confirmed, possibly_stale, source, temporality")
          .eq("user_id", userId)
          .limit(50),
      ]).then(([reactionsRes, followupsRes, clarifyRes, hypothesesRes, contextRes]) => {
        try {
          const trapInput: TrapScanInput = {
            reactions: (reactionsRes.data ?? []) as TrapScanInput["reactions"],
            recentClarifyEvents: (clarifyRes.data ?? []).map((ev: any) => ({
              has_response: ev.metadata?.has_response !== false,
              clarify_type: ev.metadata?.clarify_type,
              intent_layer: ev.metadata?.intent_layer,
            })),
            followups: (followupsRes.data ?? []).map((ev: any) => ({
              executed: ev.metadata?.executed === true,
              satisfaction: ev.metadata?.satisfaction,
              skip_reason: ev.metadata?.skip_reason,
              domain: ev.metadata?.domain,
            })),
            hypotheses: (hypothesesRes.data ?? []) as TrapScanInput["hypotheses"],
            contextEntries: (contextRes.data ?? []) as TrapScanInput["contextEntries"],
            sessionCount: growthState?.sessionsCompleted ?? 0,
          };

          const trapResult = runTrapScan(trapInput);

          // 検知された罠をログ出力
          for (const trap of trapResult.traps) {
            if (trap.detected) {
              const prefix = trap.severity === "critical" ? "🔴" : "🟡";
              console.warn(`[trap-scan] ${prefix} ${trap.trap_type}: ${trap.severity} — ${trap.recommendation}`);
              for (const ind of trap.indicators.filter(i => i.breached)) {
                console.info(`  [indicator] ${ind.name} = ${ind.value.toFixed(2)} (threshold: ${ind.threshold})`);
              }
            }
          }

          if (trapResult.detected_count > 0) {
            console.info(`[trap-scan] Summary: ${trapResult.detected_count} trap(s) detected, ${trapResult.critical_count} critical`);
            if (trapResult.should_reduce_depth) console.warn("[trap-scan] → Action: reduce prompt depth");
            if (trapResult.should_suppress_mi) console.warn("[trap-scan] → Action: suppress Micro Insight");
            if (trapResult.should_suppress_route_c) console.warn("[trap-scan] → Action: suppress Route C");
          }

          // analytics に保存（次回リクエストで参照）
          supabase.from("stargazer_analytics").insert({
            user_id: userId,
            event: "phase5_trap_scan",
            feature: "continuous_verification",
            metadata: {
              detected_count: trapResult.detected_count,
              critical_count: trapResult.critical_count,
              should_reduce_depth: trapResult.should_reduce_depth,
              should_suppress_mi: trapResult.should_suppress_mi,
              should_suppress_route_c: trapResult.should_suppress_route_c,
              traps: trapResult.traps
                .filter(t => t.detected)
                .map(t => ({
                  type: t.trap_type,
                  severity: t.severity,
                  indicators: t.indicators.filter(i => i.breached).map(i => ({
                    name: i.name,
                    value: Number(i.value.toFixed(3)),
                    threshold: i.threshold,
                  })),
                  recommendation: t.recommendation,
                })),
            },
          }).then(({ error }) => {
            if (error) console.warn("[trap-scan] Analytics save failed:", error.message);
          });
        } catch (e) {
          console.warn("[trap-scan] Scan failed (non-fatal):", e);
        }
      });
    }

    // Wound Activation analytics（fire-and-forget）
    if (isHomeAlter && woundActivationResult && woundActivationResult.most_active) {
      supabase.from("stargazer_analytics").insert({
        user_id: userId,
        event: "wound_activation_scan",
        feature: "home_alter",
        metadata: {
          session_id: sessionId,
          most_active_wound: woundActivationResult.most_active.wound_id,
          most_active_theme: woundActivationResult.most_active.theme,
          most_active_score: Number(woundActivationResult.most_active.activation_score.toFixed(3)),
          most_active_level: woundActivationResult.most_active.level,
          total_activations: woundActivationResult.activations.length,
          suppressed_mi: woundActivationResult.should_suppress_mi,
          avoided_route_c: woundActivationResult.should_avoid_route_c,
          protect_boost: Number(woundActivationResult.max_protect_boost.toFixed(3)),
          signals: woundActivationResult.most_active.signals.map(s => ({
            source: s.source,
            intensity: Number(s.intensity.toFixed(3)),
          })),
        },
      }).then(({ error }) => {
        if (error) console.warn("[wound-activation] Analytics save failed:", error.message);
      });
    }

    // Clarify mode: analytics のみ発火（decisionMetadata は不要）
    if (isHomeAlter && responseMode === "clarify" && queryContext) {
      supabase
        .from("stargazer_analytics")
        .insert({
          user_id: userId,
          event: "home_alter_clarify",
          feature: "home_alter",
          metadata: {
            session_id: sessionId,
            query_domain: queryContext.domain,
            ambiguity_score: queryContext.ambiguity_score,
            information_score: queryContext.information?.score,
            critical_missing: queryContext.critical_missing,
            mode_decision_reason: modeDecisionReason,
            mode_decision_version: "v5",
            clarify_type: responseMode === "clarify" ? getClarifyType(modeDecisionReason as ModeDecisionReason) : undefined,
            // Intent Pool 追跡
            intent_id: selectedClarifyIntent?.intent.id ?? null,
            intent_name: selectedClarifyIntent?.intent.name ?? null,
            intent_layer: selectedClarifyIntent?.intent.layer ?? null,
            intent_priority: selectedClarifyIntent?.effective_priority ?? null,
            relational_lens: relationalLens ? {
              target_role: relationalLens.target_role,
              interaction_purpose: relationalLens.interaction_purpose,
              involves_other: relationalLens.involves_other,
            } : undefined,
            // Layer 5: 監査トレイル
            audit_trail: auditTrail ?? undefined,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Clarify analytics insert failed:", error.message);
        });

      // Intent Pool 使用履歴を記録（cooldown 制御に使用）
      if (selectedClarifyIntent) {
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "home_alter_intent_used",
          feature: "intent_pool",
          metadata: {
            intent_id: selectedClarifyIntent.intent.id,
            intent_name: selectedClarifyIntent.intent.name,
            intent_layer: selectedClarifyIntent.intent.layer,
            route: "clarify",
            selection_reason: selectedClarifyIntent.selection_reason,
            effective_priority: selectedClarifyIntent.effective_priority,
          },
        }).then(({ error }) => {
          if (error) console.warn("[intent-pool] Usage tracking failed:", error.message);
        });
      }
    }

    // Route C intent 使用履歴を記録
    if (isHomeAlter && selectedRouteCIntent && responseMode !== "clarify") {
      supabase.from("stargazer_analytics").insert({
        user_id: userId,
        event: "home_alter_intent_used",
        feature: "intent_pool",
        metadata: {
          intent_id: selectedRouteCIntent.intent.id,
          intent_name: selectedRouteCIntent.intent.name,
          intent_layer: selectedRouteCIntent.intent.layer,
          route: "route_c",
          selection_reason: selectedRouteCIntent.selection_reason,
          effective_priority: selectedRouteCIntent.effective_priority,
        },
      }).then(({ error }) => {
        if (error) console.warn("[intent-pool] Route C usage tracking failed:", error.message);
      });
    }

    // Life Context extraction + evidence accumulation（fire-and-forget）
    // Phase 2: analytics 保存 + stargazer_alter_context への照合・蓄積
    if (isHomeAlter) {
      try {
        const lifeSignals = extractLifeContextSignals(message);
        const extendedSignals = extractExtendedContextSignals(message);

        // 既存コンテキストを全件取得（照合用 — lifeSignals/extendedSignals 両方で使用）
        let existingEntries: LifeContextEntry[] = [];
        if (lifeSignals.length > 0 || extendedSignals.length > 0) {
          const { data: existingContext } = await supabase
            .from("stargazer_alter_context")
            .select("id, category, content, source, temporality, confidence, evidence_count, last_confirmed, possibly_stale")
            .eq("user_id", userId);
          existingEntries = (existingContext ?? []) as LifeContextEntry[];
        }

        if (lifeSignals.length > 0) {

          for (const signal of lifeSignals) {
            // analytics テーブル（既存: 計測用）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_life_context",
              feature: "life_context",
              metadata: { session_id: sessionId, ...signal },
            }).then(({ error }) => {
              if (error) console.warn("[life-context] Failed to save to analytics:", error.message);
            });

            // stargazer_alter_context テーブル（Phase 2: 照合+蓄積）
            if (signal.content) {
              const match = existingEntries.find(e => {
                const result = matchContextEntry(e, signal);
                return result === "update" || result === "contradiction";
              });

              if (match) {
                const matchResult = matchContextEntry(match, signal);
                if (matchResult === "update") {
                  // evidence 蓄積: count++, confidence up, last_confirmed 更新
                  supabase.from("stargazer_alter_context").update({
                    evidence_count: match.evidence_count + 1,
                    confidence: updatedConfidence(match.confidence, match.evidence_count),
                    last_confirmed: new Date().toISOString(),
                    possibly_stale: false,
                  }).eq("id", match.id).then(({ error }) => {
                    if (error) console.warn("[life-context] Evidence update failed:", error.message);
                    else console.info(`[life-context] Evidence accumulated: "${match.content}" (count=${match.evidence_count + 1})`);
                  });
                } else if (matchResult === "contradiction") {
                  // 矛盾: 既存を contradicted に変更 + 新規挿入
                  supabase.from("stargazer_alter_context").update({
                    source: "contradicted",
                  }).eq("id", match.id).then(({ error }) => {
                    if (error) console.warn("[life-context] Contradiction mark failed:", error.message);
                    else console.info(`[life-context] Contradiction detected: "${match.content}" → "${signal.content}"`);
                  });
                  supabase.from("stargazer_alter_context").insert({
                    user_id: userId,
                    category: signal.category ?? "environment",
                    content: signal.content,
                    source: signal.source ?? "user_implied",
                    temporality: signal.temporality ?? "situational",
                    confidence: signal.confidence ?? 0.5,
                    evidence_count: 1,
                    last_confirmed: new Date().toISOString(),
                  }).then(({ error }) => {
                    if (error) console.warn("[life-context] New context insert after contradiction failed:", error.message);
                  });
                  // 矛盾を analytics に記録
                  supabase.from("stargazer_analytics").insert({
                    user_id: userId,
                    event: "life_context_contradiction",
                    feature: "life_context",
                    metadata: {
                      old_content: match.content,
                      new_content: signal.content,
                      category: signal.category,
                    },
                  }).then(({ error }) => {
                    if (error) console.warn("[life-context] Contradiction analytics failed:", error.message);
                  });
                }
              } else {
                // 新規: そのまま挿入
                supabase.from("stargazer_alter_context").insert({
                  user_id: userId,
                  category: signal.category ?? "environment",
                  content: signal.content,
                  source: signal.source ?? "user_implied",
                  temporality: signal.temporality ?? "situational",
                  confidence: signal.confidence ?? 0.5,
                  evidence_count: 1,
                  last_confirmed: new Date().toISOString(),
                }).then(({ error }) => {
                  if (error) console.warn("[life-context] New context insert failed:", error.message);
                });
              }
            }
          }
          console.info(`[life-context] ${lifeSignals.length} signal(s) processed: ${lifeSignals.map(s => s.category ?? "unknown").join(", ")}`);
        }

        // Phase 3: 拡張環境パターンの抽出（仕事・健康・ライフイベント）
        if (extendedSignals.length > 0) {
          for (const signal of extendedSignals) {
            if (!signal.content) continue;
            const match = existingEntries.find(e => {
              const result = matchContextEntry(e, signal);
              return result === "update";
            });
            if (match) {
              supabase.from("stargazer_alter_context").update({
                evidence_count: match.evidence_count + 1,
                confidence: updatedConfidence(match.confidence, match.evidence_count),
                last_confirmed: new Date().toISOString(),
                possibly_stale: false,
              }).eq("id", match.id).then(({ error }) => {
                if (error) console.warn("[life-context-ext] Evidence update failed:", error.message);
              });
            } else {
              supabase.from("stargazer_alter_context").insert({
                user_id: userId,
                category: signal.category ?? "environment",
                content: signal.content,
                source: signal.source ?? "user_implied",
                temporality: signal.temporality ?? "situational",
                confidence: signal.confidence ?? 0.5,
                evidence_count: 1,
                last_confirmed: new Date().toISOString(),
              }).then(({ error }) => {
                if (error) console.warn("[life-context-ext] Insert failed:", error.message);
              });
            }
          }
          console.info(`[life-context-ext] ${extendedSignals.length} extended signal(s): ${extendedSignals.map(s => s.content).join(", ")}`);
        }

        // Phase 3: 人物マップ蓄積
        const personMentions = extractPersonMentions(message);
        if (personMentions.length > 0) {
          for (const mention of personMentions) {
            supabase.from("stargazer_alter_person_map")
              .select("id, mention_count, sentiment_trend, last_sentiment, role")
              .eq("user_id", userId)
              .eq("label", mention.label)
              .single()
              .then(async ({ data: existing, error: fetchErr }) => {
                if (fetchErr && fetchErr.code !== "PGRST116") return;
                try {
                  if (existing) {
                    const newTrend = updateSentimentTrend(
                      (existing.sentiment_trend as "improving" | "stable" | "declining" | null),
                      (existing.last_sentiment as "positive" | "negative" | "mixed" | "neutral" | null),
                      mention.sentiment,
                    );
                    const newInfluence = computeInfluenceScore(
                      existing.mention_count + 1,
                      mention.role,
                      mention.sentiment,
                    );
                    await supabase.from("stargazer_alter_person_map").update({
                      mention_count: existing.mention_count + 1,
                      sentiment_trend: newTrend,
                      last_sentiment: mention.sentiment,
                      influence_score: newInfluence,
                      last_mentioned: new Date().toISOString(),
                    }).eq("id", existing.id);
                  } else {
                    const influence = computeInfluenceScore(1, mention.role, mention.sentiment);
                    await supabase.from("stargazer_alter_person_map").insert({
                      user_id: userId,
                      label: mention.label,
                      role: mention.role,
                      sentiment_trend: "stable",
                      mention_count: 1,
                      influence_score: influence,
                      last_sentiment: mention.sentiment,
                      last_mentioned: new Date().toISOString(),
                    });
                  }
                } catch (innerErr) {
                  console.warn("[person-map] Save failed (non-fatal):", innerErr);
                }
              });
          }
          console.info(`[person-map] ${personMentions.length} person mention(s): ${personMentions.map(m => `${m.label}(${m.sentiment})`).join(", ")}`);
        }

        // Phase 4 + P2-1: user_narrative の抽出・保存 + 解釈変化追跡
        const narratives = extractUserNarratives(message);
        if (narratives.length > 0) {
          for (const n of narratives) {
            supabase.from("stargazer_alter_narratives")
              .select("id, mention_count, content, interpretation_history, revision_count, current_valence, current_agency, first_mentioned, last_mentioned, frozen_since")
              .eq("user_id", userId)
              .eq("theme", n.theme)
              .maybeSingle()
              .then(async ({ data: existing }) => {
                try {
                  if (existing) {
                    // P2-1: 解釈変化を検出し、履歴を蓄積する（上書きではなく追記）
                    const revisionResult = buildRevisionEntry(existing.content, n.content);
                    const history = Array.isArray(existing.interpretation_history)
                      ? existing.interpretation_history as Array<Record<string, unknown>>
                      : [];

                    const updatePayload: Record<string, unknown> = {
                      mention_count: existing.mention_count + 1,
                      last_mentioned: new Date().toISOString(),
                      content: n.content,
                      current_valence: revisionResult.newInterpretation.valence,
                      current_agency: revisionResult.newInterpretation.agency,
                    };

                    if (revisionResult.isRevision) {
                      // 意味づけが変わった → 旧解釈を履歴に push + revision_count++
                      const oldEntry = {
                        content: existing.content,
                        valence: existing.current_valence ?? classifyValence(existing.content),
                        agency: existing.current_agency ?? classifyAgency(existing.content),
                        at: existing.last_mentioned,
                      };
                      updatePayload.interpretation_history = [oldEntry, ...history].slice(0, 20);
                      updatePayload.revision_count = (existing.revision_count ?? 0) + 1;
                      updatePayload.frozen_since = null; // revision があれば固着解除
                      // P2-1: ホイスト変数に最新の revision を記録（analytics 用）
                      p2NarrativeRevision = revisionResult.revision;
                      console.info(`[P2-narrative] Interpretation shift: ${revisionResult.revision!.shiftType} theme="${n.theme}"`);
                    }

                    await supabase.from("stargazer_alter_narratives")
                      .update(updatePayload).eq("id", existing.id);
                  } else {
                    // 新規: valence/agency を初期分類して保存
                    await supabase.from("stargazer_alter_narratives").insert({
                      user_id: userId,
                      theme: n.theme,
                      content: n.content,
                      domain: n.domain,
                      mention_count: 1,
                      current_valence: classifyValence(n.content),
                      current_agency: classifyAgency(n.content),
                    });
                  }
                } catch (e) {
                  console.warn("[narrative] Save failed (non-fatal):", e);
                }
              });
          }
          console.info(`[narrative] ${narratives.length} narrative(s): ${narratives.map(n => n.theme).join(", ")}`);
        }

        // P2-2: Body Lens — 身体信号が検出された場合、mapping を更新/作成（fire-and-forget）
        if (p2BodySignals.length > 0) {
          try {
            // emotionContext は LLM レスポンスや narrative valence から簡易推定
            // 現時点では narrative の current_valence を使う（将来は affect lens と接続）
            const emotionContext = p2NarrativeRevision?.to.valence
              ?? (p2NarrativeFreezing?.isFrozen ? "frozen" : null);
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

            for (const signal of p2BodySignals) {
              if (!emotionContext) {
                // 感情コンテキストなし → mapping 更新できない（身体信号のみ記録不要）
                console.info(`[P2-body] Signal "${signal.type}" detected but no emotion context — skipping mapping`);
                continue;
              }

              // 既存 mapping を検索
              const { data: existingMapping } = await supabase
                .from("stargazer_body_emotion_mappings")
                .select("*")
                .eq("user_id", userId)
                .eq("body_signal_type", signal.type)
                .eq("likely_emotion_mapping", emotionContext)
                .maybeSingle();

              if (existingMapping) {
                // 既存 mapping を更新: evidence+1, context diversity チェック
                const isNewContext = !Array.isArray(existingMapping.context_tags)
                  || !existingMapping.context_tags.includes(today);
                const newEvidence = existingMapping.evidence_count + 1;
                const newDistinct = isNewContext
                  ? existingMapping.distinct_context_count + 1
                  : existingMapping.distinct_context_count;
                const newTags = isNewContext
                  ? [...(existingMapping.context_tags || []), today].slice(-20)
                  : existingMapping.context_tags;
                const newConf = computeMappingConfidence(
                  newEvidence,
                  existingMapping.counter_evidence_count,
                  existingMapping.strong_counter_evidence_count,
                  newDistinct,
                );

                supabase.from("stargazer_body_emotion_mappings")
                  .update({
                    evidence_count: newEvidence,
                    distinct_context_count: newDistinct,
                    context_tags: newTags,
                    confidence: newConf,
                    last_seen_at: new Date().toISOString(),
                  })
                  .eq("id", existingMapping.id)
                  .then(({ error }) => {
                    if (error) console.warn("[P2-body] Mapping update failed:", error.message);
                    else console.info(`[P2-body] Updated mapping: ${signal.type}→${emotionContext} (evidence=${newEvidence}, conf=${newConf.toFixed(2)})`);
                  });
              } else {
                // 新規 mapping 作成（confidence=0: evidence=1, distinct=1）
                supabase.from("stargazer_body_emotion_mappings")
                  .insert({
                    user_id: userId,
                    body_signal_type: signal.type,
                    likely_emotion_mapping: emotionContext,
                    confidence: 0, // evidence=1 → confidence=0（ゼロプライヤー）
                    evidence_count: 1,
                    counter_evidence_count: 0,
                    strong_counter_evidence_count: 0,
                    distinct_context_count: 1,
                    context_tags: [today],
                    last_seen_at: new Date().toISOString(),
                  })
                  .then(({ error }) => {
                    if (error) console.warn("[P2-body] Mapping insert failed:", error.message);
                    else console.info(`[P2-body] New mapping: ${signal.type}→${emotionContext} (first observation)`);
                  });
              }
            }
          } catch (e) {
            console.warn("[P2-body] Body mapping save failed (non-fatal):", e);
          }
        }

        // Phase 4: 仮説導出 + Cross-Context パターン検出 + P2: 反証ループ
        // Decision Pattern が十分蓄積された時点で仮説を生成・更新・弱体化
        supabase.from("stargazer_alter_patterns")
          .select("pattern_key, pattern_data, observation_count, confidence")
          .eq("user_id", userId)
          .eq("pattern_type", "decision")
          .gte("observation_count", 5)
          .then(async ({ data: decisionPatterns }) => {
            try {
              if (!decisionPatterns || decisionPatterns.length === 0) return;

              // 4-3: 反復パターン仮説の導出
              const recurringHypotheses = deriveRecurringPatternHypotheses(decisionPatterns);

              // 4-4: Cross-Context パターン検出 → 仮説化
              const crossPatterns = detectCrossContextPatterns(decisionPatterns);
              const crossHypotheses = crossContextToHypotheses(crossPatterns);

              // P2: growth_signal 仮説の導出（パターン変化検出）
              // 前回のスナップショットを patterns テーブルから取得
              let previousSnapshot: Record<string, { goRatio: number; total: number }> | null = null;
              try {
                const { data: snapshotData } = await supabase
                  .from("stargazer_alter_patterns")
                  .select("pattern_data")
                  .eq("user_id", userId)
                  .eq("pattern_type", "decision")
                  .eq("pattern_key", "growth_snapshot")
                  .single();
                if (snapshotData) {
                  previousSnapshot = (snapshotData.pattern_data as any)?.domain_ratios ?? null;
                }
              } catch { /* no snapshot yet */ }

              const growthHypotheses = deriveGrowthSignalHypotheses(decisionPatterns, previousSnapshot);

              // 現在のスナップショットを保存（次回比較用）
              const currentSnapshot: Record<string, { goRatio: number; total: number }> = {};
              for (const p of decisionPatterns) {
                const dist = (p.pattern_data as any)?.shape_distribution;
                if (!dist) continue;
                const domain = p.pattern_key.replace("decision_", "");
                const goBuckets = ["full_go", "bounded_go", "trial_then_decide"];
                const waitBuckets = ["observe_first", "skip", "defer_with_trigger"];
                const goCount = goBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
                const waitCount = waitBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
                const total = goCount + waitCount;
                if (total > 0) currentSnapshot[domain] = { goRatio: goCount / total, total };
              }
              if (Object.keys(currentSnapshot).length > 0) {
                supabase.from("stargazer_alter_patterns")
                  .upsert({
                    user_id: userId,
                    pattern_type: "decision",
                    pattern_key: "growth_snapshot",
                    observation_count: 1,
                    pattern_data: { domain_ratios: currentSnapshot },
                    confidence: 0.5,
                    last_observed: new Date().toISOString(),
                  }, { onConflict: "user_id,pattern_type,pattern_key" })
                  .then(({ error }) => {
                    if (error) console.warn("[growth] Snapshot save failed:", error.message);
                  });
              }

              const allNewHypotheses = [...recurringHypotheses, ...crossHypotheses, ...growthHypotheses];
              if (allNewHypotheses.length === 0) return;

              // 既存仮説を取得（全タイプ — P2: contradiction_pattern, growth_signal も含む）
              const { data: existingHypotheses } = await supabase
                .from("stargazer_alter_hypotheses")
                .select("*")
                .eq("user_id", userId);

              for (const newH of allNewHypotheses) {
                const existing = (existingHypotheses ?? []).find(
                  (e: any) => e.hypothesis_type === newH.hypothesis_type && e.content === newH.content
                );

                if (existing) {
                  // 既存仮説を更新（成長段階追跡）
                  const { newStatus, newConfidence, growthSignal } = updateHypothesisStatus(
                    existing as AlterHypothesis,
                    { confidence: newH.confidence, evidence_count: newH.evidence_count },
                  );
                  await supabase.from("stargazer_alter_hypotheses").update({
                    status: newStatus,
                    confidence: newConfidence,
                    evidence_count: (existing as any).evidence_count + newH.evidence_count,
                    evidence_summary: newH.evidence_summary,
                    last_evaluated: new Date().toISOString(),
                  }).eq("id", (existing as any).id);

                  if (growthSignal) {
                    console.info(`[growth] ${growthSignal.type}: ${growthSignal.description}`);
                  }
                } else {
                  // 新規仮説を挿入
                  await supabase.from("stargazer_alter_hypotheses").insert({
                    user_id: userId,
                    ...newH,
                  });
                  console.info(`[hypothesis] New: ${newH.hypothesis_type} — ${newH.content}`);
                }
              }

              // P2: 矛盾ベースの仮説弱体化ループ
              // 生活文脈の矛盾 + メッセージ内容から既存仮説との矛盾を検出
              if (existingHypotheses && existingHypotheses.length > 0) {
                // 矛盾検出: life context contradictions は lifeSignals 処理で発生
                const contextContradictions: Array<{ category: string; old_content: string; new_content: string }> = [];
                for (const signal of lifeSignals) {
                  if (!signal.content) continue;
                  const match = existingEntries.find(e => matchContextEntry(e, signal) === "contradiction");
                  if (match) {
                    contextContradictions.push({
                      category: signal.category ?? "general",
                      old_content: match.content,
                      new_content: signal.content,
                    });
                  }
                }

                const contradicted = detectHypothesisContradictions(
                  existingHypotheses as AlterHypothesis[],
                  message,
                  contextContradictions,
                );

                for (const { hypothesis, reason } of contradicted) {
                  // 仮説を弱体化（confidence を下げ、status を weakening に）
                  const weakenedConfidence = Math.max(0.1, hypothesis.confidence * 0.6);
                  const weakenedStatus = hypothesis.status === "emerging" ? "retired" : "weakening";
                  await supabase.from("stargazer_alter_hypotheses").update({
                    status: weakenedStatus,
                    confidence: weakenedConfidence,
                    last_evaluated: new Date().toISOString(),
                    evidence_summary: `${hypothesis.evidence_summary} [反証: ${reason}]`,
                  }).eq("id", hypothesis.id);
                  console.info(`[hypothesis] Weakened: ${hypothesis.content} (reason: ${reason})`);
                }

                // P2: 矛盾パターン仮説の導出
                if (contextContradictions.length > 0) {
                  const contradictionHypotheses = deriveContradictionHypotheses(
                    contextContradictions.map(c => ({ ...c, domain: c.category })),
                  );
                  for (const ch of contradictionHypotheses) {
                    const existingCH = (existingHypotheses ?? []).find(
                      (e: any) => e.hypothesis_type === "contradiction_pattern" && e.content === ch.content
                    );
                    if (existingCH) {
                      await supabase.from("stargazer_alter_hypotheses").update({
                        evidence_count: (existingCH as any).evidence_count + ch.evidence_count,
                        confidence: Math.min(0.8, (existingCH as any).confidence + 0.1),
                        evidence_summary: ch.evidence_summary,
                        last_evaluated: new Date().toISOString(),
                      }).eq("id", (existingCH as any).id);
                    } else {
                      await supabase.from("stargazer_alter_hypotheses").insert({
                        user_id: userId,
                        ...ch,
                        last_evaluated: new Date().toISOString(),
                      });
                      console.info(`[hypothesis] New contradiction: ${ch.content}`);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[hypothesis] Derivation failed (non-fatal):", e);
            }
          });

      } catch { /* Non-fatal */ }
    }

    // ── Override Trace Log（CEO要求: 経路追跡） ──
    {
      const finalDomain = queryContext?.domain ?? "unknown";
      const domainOverridden = initialDomain !== undefined && initialDomain !== finalDomain;
      const typeOverridden = initialQuestionType !== undefined && initialQuestionType !== questionType;
      console.info(
        `[route-trace] msg="${message.slice(0, 50)}" | ` +
        `type: ${initialQuestionType ?? "?"}${typeOverridden ? `→${questionType}` : ""} | ` +
        `domain: ${initialDomain ?? "?"}${domainOverridden ? `→${finalDomain}` : ""} | ` +
        `mode: ${responseMode} (${modeDecisionReason})` +
        (followUpType ? ` | followUp: ${followUpType}` : "") +
        (inheritedDomain ? ` | inherited: ${inheritedDomain}` : "") +
        (isFatigue ? ` | fatigue: true` : "") +
        ` | session_facts=${sessionFactAccumulator.getExplicitFacts().length}` +
        ` | ctx_used=${ctxUsed}` +
        ` | trap_effect=${insightSuppressedReason ? "mi_suppressed" : "none"}` +
        (contractValidationResult ? ` | contract=${contractValidationResult.pass ? "PASS" : `FAIL(${contractValidationResult.missing.join(",")})`}` : "")
      );
    }

    // response_id: フィードバック紐付け用の一意識別子
    const responseId = `resp-${sessionId}-${Date.now()}`;

    // ── Pi-style UX 制約: conversation / ask_me は文量を強制カット ──
    const piStyleTargetTypes: Set<import("@/lib/stargazer/alterHomeAdapter").QuestionType> = new Set([
      "conversation", "ask_me", "chat_opening",
    ]);
    if (piStyleTargetTypes.has(questionType)) {
      const maxSent = questionType === "ask_me" ? 3 : 4;
      alterResponseText = enforceConversationalBrevity(alterResponseText, maxSent);
    }

    // P1.7: 全体レイテンシ分解を完成
    latencyTracker.postProcessingMs = Date.now() - routeStart - (latencyTracker.promptBuildMs ?? 0) - (latencyTracker.mainLlmMs ?? 0) - (latencyTracker.validationRetryMs ?? 0);
    latencyTracker.totalMs = Date.now() - routeStart;
    latencyTracker.peMs = peResult?.latencyBreakdown?.totalMs ?? 0;
    // S1: PE内部breakdown（速度最適化分析用）
    if (peResult?.latencyBreakdown) {
      latencyTracker.peQueryGenMs = peResult.latencyBreakdown.queryGenerationMs;
      latencyTracker.peSearchMs = peResult.latencyBreakdown.searchMs;
      latencyTracker.peClassifyMs = peResult.latencyBreakdown.classificationMs;
      latencyTracker.peQualityGateMs = peResult.latencyBreakdown.qualityGateMs;
      latencyTracker.pePromptBuildMs = peResult.latencyBreakdown.promptBuildMs;
      // L1 breakdown（Chained Exploration）
      if (peResult.latencyBreakdown.l1) {
        latencyTracker.peL1 = peResult.latencyBreakdown.l1;
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CEO/GPT 2026-05-02 PR B-5a: plan history persistence (fail-soft)
    //   morningResponse.plan を alter_morning_plan_history に upsert する。
    //   PR B-2c (Layer 2 前日終点 inheritance) の前提となる永続化。
    //
    //   - isPlanWorthSaving guard で空 plan は保存しない (helper 側で reject)
    //   - DB / Network 失敗時は response を壊さない (try/catch + fail-soft)
    //   - log は upsertPlanHistory 内で sha256 hash 化済 (PII 排除)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (morningResponse?.plan) {
      try {
        await upsertPlanHistory(supabase, userId, morningResponse.plan);
      } catch {
        // fail-soft: log は helper 内で処理済み、本 response は壊さない
      }

      // Shadow-only OP pipeline comparison; no response mutation.
      runShadowAndCompare({
        legacyPlan: morningResponse.plan,
        userId,
        utterance: message,
        actualToday: getActualTodayYmdJst(),
        llmTargetDate: shadowLlmTargetDate,
        llmTargetDateProvenance: shadowLlmTargetDateProvenance,
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // A1-5-8-2: Capture Candidate Surface（read-only・fail-open・gated・additive・実 LLM await なし）
    //   morningProtocol を返す時のみ、pending captured seed/evidence を read-only consumption し
    //   候補があれば morningProtocol.captureCandidate? を additive 注入（fragment を下で 1 行 spread）。
    //   - flag off / kill / production / 非 staging・非 canary gate block / no candidate / read 失敗
    //     → fragment={} → morningProtocol 完全不変（既存 response と後方互換）。
    //   - buildMorningCaptureSurface は read-only・never-throw・実 LLM なし・production hard block 内蔵（gate）。
    //   - capture write（fire-and-forget・別 gate・別 GO）とは独立。surface は read 側のみ。
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const captureCandidateFragment: CaptureCandidateFragment =
      morningResponse && morningResponse.phase !== "skipped"
        ? await resolveMorningProtocolCaptureFragment(() =>
            buildMorningCaptureSurface(
              supabase as unknown as PendingCapturedRowsReadClient,
              userId,
              shadowLlmTargetDate ?? undefined,
            ))
        : {};

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // A1-5-9-0/1: Reality Capture Write（**fire-and-forget・response 不変**・structured-only・flag gated・production hard block）
    //   今回の発話から structured-only seed/evidence を capture（次回/後続の surface read で候補化）。
    //   - mode 決定（decideCaptureMode）: kill 最優先 → LIVE=write（real RPC）→ OBSERVE=observe（dry-run・実 DB 0）→ none。
    //     **default は両 flag off → no-op**（extractor 構築なし・production 挙動変更ゼロ）。gate で production/非 staging/非 canary block。
    //   - **fire-and-forget**（void 同期返却・helper は never-throw）+ 二重防御 try/catch で user response（envelope）に一切影響させない。
    //   - 実 LLM(extractor) は fire-and-forget の async 内（**response 前に await しない**）。**raw を plan_seeds に保存しない**（structured-only・raw は extraction.utterance のみ）。
    //   - surface read（上）と独立: surface=prior pending の read を先に算出済 → 今回 capture した seed は当該 response に混ざらない（次回 surface で候補化）。
    //   - morning turn のみ発火（surface read と同条件 gate・非 morning chat で extractor を回さない）。
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (morningResponse && morningResponse.phase !== "skipped") {
      try {
        fireMorningCapture(message, userId, supabase as unknown as RpcCapableClient);
      } catch {
        // capture 配線の例外は user response に影響させない（response 不変を絶対保証）
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      responseId,
      mode,
      response: alterResponseText,
      personality,
      depth: conversationDepth + 2,
      ...(isBetaTester ? { isBetaTester: true } : {}),
      ...(reasoningBasis ? { reasoningBasis } : {}),
      ...(decisionMetadata ? { decisionMetadata } : {}),
      // Soft Bridge: 次ターンで確認応答を受け付けるフラグ
      ...(isSoftBridgeResponse ? { softBridgePending: true } : {}),
      // Morning Protocol: プランデータをフロントに返す
      // P0-1: parsedIntent / rawInputs / sufficiency もターン間で保持する
      ...(morningResponse && morningResponse.phase !== "skipped" ? {
        morningProtocol: {
          sessionId: morningSession?.sessionId ?? null,
          // W3-PR-5: v2 stickiness — クライアントがラウンドトリップで返送し、
          // 次ターンも v2 pipeline に吸い込む
          pipelineVersion: morningSession?.pipelineVersion ?? null,
          phase: morningResponse.phase,
          plan: morningResponse.plan ?? null,
          clarifyQuestion: morningResponse.clarifyQuestion ?? null,
          personalizeHints: morningResponse.personalizeHints ?? [],
          // ── P0-1: セッション状態の完全保持 ──
          rawInputs: morningSession?.rawInputs ?? [],
          parsedIntent: morningSession?.parsedIntent ?? null,
          sufficiency: morningSession?.sufficiency ?? null,
          // ── v2: PlanState ラウンドトリップ ──
          planStateV2: morningSession?.planStateV2 ?? null,
          // ── W3-PR-7 Commit 2: dialog state round-trip ──
          pendingClarify: morningSession?.pendingClarify ?? null,
          persistedEvents: morningSession?.persistedEvents ?? null,
          // ── W3-PR-8 rev 3 Commit 16: DialogState v2 round-trip（write-side）──
          //   flag OFF: ensureSessionV1 が identity return するため dialogState は
          //   常に undefined → conditional spread で field を出力しない。response
          //   shape は baseline と完全一致。
          //   flag ON:  dialogState が set されている → field 含めて送出、client が
          //   次ターンで返送する。
          ...(morningSession?.dialogState != null
            ? { dialogState: morningSession.dialogState }
            : {}),
          // CEO 2026-04-28 PR #41a Commit 6: trace を browser DevTools 観測可能に
          //   verbose env (VERCEL_ENV=preview/development + ALTER_MORNING_TRACE_VERBOSE)
          //   の時のみ含まれる。production では lastTraceSnapshot=null → field 不在。
          ...(lastTraceSnapshot != null
            ? { _debug: { trace: lastTraceSnapshot } }
            : {}),
          // A1-5-8-2: capture candidate surface（候補有時のみ captureCandidate を additive・
          //   候補無 / flag off / gate block / read 失敗 → fragment={} → 既存 morningProtocol 完全不変）
          ...captureCandidateFragment,
        },
      } : {}),
      ...(queryContext ? {
        queryContext: {
          domain: queryContext.domain,
          ambiguity_score: queryContext.ambiguity_score,
          information_score: queryContext.information?.score,
          response_mode: responseMode,
          mode_decision_reason: modeDecisionReason,
          mode_decision_version: "v4",
          reaction: detectedReaction ? { type: detectedReaction.type, disagree_strength: detectedReaction.disagree_strength, redirect_subtype: detectedReaction.redirect_subtype } : undefined,
          relational_lens: relationalLens ?? undefined,
          judgment_skeleton: judgmentSkeleton ? {
            action_shape: judgmentSkeleton.action_shape,
            primary_reason: judgmentSkeleton.primary_reason,
            confidence_level: judgmentSkeleton.confidence_level,
          } : undefined,
          quality_check: qualityCheck ? {
            pass: qualityCheck.pass,
            generic_response_score: qualityCheck.generic_response_score,
          } : undefined,
          creepiness_check: creepinessCheck ? {
            pass: creepinessCheck.pass,
            violation_count: creepinessCheck.violations.length,
          } : undefined,
        },
      } : {}),
      // Override trace（CEO要求: 経路追跡データ）
      routeTrace: {
        initial_question_type: initialQuestionType ?? null,
        final_question_type: questionType,
        type_overridden: (initialQuestionType !== undefined && initialQuestionType !== questionType) || false,
        initial_domain: initialDomain ?? null,
        final_domain: queryContext?.domain ?? null,
        domain_overridden: (initialDomain !== undefined && initialDomain !== queryContext?.domain) || false,
        response_mode: responseMode,
        mode_reason: modeDecisionReason,
        follow_up_type: followUpType,
        inherited_domain: inheritedDomain ?? null,
        is_fatigue: isFatigue,
      },
      // Alter→Counselor ソフト導線（Part 1 §3.3 CEO決定）
      // 恋愛系話題の場合のみ、「カウンセラーにも相談できます」を提示。
      // 強制ではなく提示のみ。Alterでそのまま自己理解として話したい人もいる。
      ...(queryContext?.domain === "romance" ? {
        counselorSoftLink: {
          show: true,
          message: "この話題について、カウンセラーにも相談できますよ。",
          destination: "/rendezvous/partner",
        },
      } : {}),
      // フィードバック用メタデータ（クライアントがfeedback APIに渡す）
      feedbackMeta: {
        domain: queryContext?.domain ?? null,
        response_mode: responseMode,
        has_mi: insightPresented,
        has_probe: !!(judgmentSkeleton as any)?.deepening_probe,
        has_gemini_reading: !!utteranceReading,
        reading_latency_ms: utteranceReadingLatencyMs > 0 ? utteranceReadingLatencyMs : null,
        safety_summary: {
          creepiness_pass: creepinessCheck?.pass ?? null,
          mi_gate_pass: !insightSuppressedReason,
          quality_pass: qualityCheck?.pass ?? null,
        },
      },
      // P1.9: PE 出典データ（Alter発言下に小さく表示）
      // CEO承認: 2026-04-16 — 「視点: URL」形式で目立たなく出す
      ...(peResult && peResult.audit.gateDecision === "fired" && peResult.block.fragments.length > 0 ? {
        perspectiveSources: peResult.block.fragments
          .filter((f: { sourceUrl: string; sourceTitle: string }) => f.sourceUrl && f.sourceTitle)
          .map((f: { sourceUrl: string; sourceTitle: string; evidence?: { date?: string } }) => ({
            title: f.sourceTitle,
            url: f.sourceUrl,
            date: f.evidence?.date ?? null,
          }))
          // URL重複排除
          .filter((s: { url: string }, i: number, arr: { url: string }[]) =>
            arr.findIndex((x: { url: string }) => x.url === s.url) === i
          )
          .slice(0, 4), // 最大4件
      } : {}),
      // Perspective Engine v3 監査データ（backward compat for existing dashboards）
      ...(perspectiveAudit ? {
        perspectiveEngine: {
          gate_decision: perspectiveAudit.gateDecision,
          gate_reason: perspectiveAudit.gateReason,
          source_type: perspectiveAudit.sourceType,
          fragments_count: perspectiveAudit.fragmentsUsed.length,
          search_latency_ms: perspectiveAudit.searchLatencyMs,
          search_queries: perspectiveAudit.searchQueriesSent,
          force_balance_delta: perspectiveAudit.forceBalanceDelta,
          is_explicit_ask: perspectiveAudit.isExplicitAsk,
          explicit_ask_blocked: perspectiveAudit.explicitAskBlocked,
          ...(perspectiveLatency ? {
            latency_breakdown: perspectiveLatency,
          } : {}),
          ...(perspectiveQualityGate ? {
            quality_gate: {
              action: perspectiveQualityGate.action,
              reason: perspectiveQualityGate.reason,
              needs_hedge: perspectiveQualityGate.needsHedge,
              can_clarify: perspectiveQualityGate.canClarify,
            },
          } : {}),
          ...(perspectiveSearchTask ? {
            search_task: {
              type: perspectiveSearchTask.type,
              fitness: perspectiveSearchTask.searchFitness,
              description: perspectiveSearchTask.description,
              required_info_type: perspectiveSearchTask.requiredInfoType,
            },
          } : {}),
          // P1: downstream searchTask (source of truth)
          downstream_search_task: peResult?.searchTask ? {
            type: peResult.searchTask.type,
            fitness: peResult.searchTask.searchFitness,
            exploration_depth: peResult.searchTask.explorationDepth,
          } : null,
          gate_decision_v6: peResult?.audit?.gateDecision ?? null,
        },
      } : {}),
      // P1.7: 全体レイテンシ分解
      _latencyBreakdown: latencyTracker,
    });
  } catch (error) {
    console.error("Failed to process alter message:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
