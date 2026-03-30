// ============================================================
// Orbiter Phase 2+: バレルエクスポート
// ============================================================

// Types
export type {
  // Signal
  OrbiterSignalType,
  DetailViewEndPayload,
  LikePassPayload,
  RevisitPayload,
  ChatSignalPayload,
  // Reflection
  ReflectionQuestion,
  ReflectionType,
  OrbiterReflection,
  // User Model
  AttractionLayer,
  AttractionAxisWeight,
  BreakpointOutcome,
  BreakpointTrigger,
  // Feature 1: Attraction Discovery
  AttractionDivergence,
  AttractionProfile,
  // Feature 2: Friction Forecast
  FrictionSeverity,
  FrictionForecastItem,
  FrictionForecast,
  // Feature 3: Self State Report
  AxisShiftReport,
  DecisionQualityHint,
  SelfStateReport,
  // Feature 4: Scene Recommender
  SceneType,
  SceneRecommendation,
  SceneRecommendationResult,
  // Feature 5: Relationship Trajectory
  TrajectoryType,
  TrajectoryPhase,
  TrajectoryForecast,
  // Feature 6: Dual Outfit
  DualOutfitAdvice,
  // Voice & Headline
  OrbiterTone,
  OrbiterIntent,
  OrbiterHeadline,
  OrbiterContext,
  // Memory
  OrbiterMemoType,
  OrbiterMemo,
  OrbiterMemoryState,
  // Temporal
  TemporalPulse,
  OrbiterMilestoneType,
  OrbiterMilestone,
  // Cross-Candidate
  CrossCandidatePattern,
  CrossPatternType,
  UserJudgmentProfile,
  // Maturity
  OrbiterMaturity,
  OrbiterMaturityStage,
  OrbiterMaturityScore,
  // Delta
  OrbiterDelta,
  DeltaItem,
  DeltaType,
  // Next Move
  NextMoveSuggestion,
  NextMoveType,
  // Branching Reflection
  ReflectionFlow,
  ReflectionNode,
  ReflectionTriggerContext,
  BranchingReflectionResult,
  // Phase 4: Avoidance
  AvoidanceQuality,
  AvoidanceAxis,
  AvoidanceParadox,
  AvoidanceMap,
  // Phase 4: Anomaly
  AnomalyType,
  OrbiterAnomaly,
  AnomalyArchive,
  // Phase 4: Resonance
  ResonanceCorrelation,
  ResonanceInsight,
  CrossDomainResonance,
  // Phase 4: Stratigraphy
  EraType,
  DecisionEra,
  EraTransitionInsight,
  DecisionStratigraphy,
  // Phase 5: Principle Map
  PrincipleAxis,
  DecisionPrinciple,
  PrincipleTension,
  PrincipleMap,
  // Phase 5: Archetype Resonance
  ArchetypeResonance,
  // Phase 5: Existential Digest
  ExistentialSection,
  ExistentialDigest,
  StoredDigest,
  // Phase 5: Omen
  OmenType,
  Omen,
  OmenForecast,
  // Aggregated
  OrbiterIntelligence,
} from "./types";

// Functions
export { computeOrbiterIntelligence, computeOrbiterFull } from "./orchestrator";
export { computeAttractionProfile } from "./attractionDiscovery";
export { computeFrictionForecast } from "./frictionForecast";
export { computeSelfStateReport } from "./selfStateReport";
export { computeSceneRecommendation } from "./sceneRecommender";
export { computeTrajectoryForecast } from "./relationshipTrajectory";
export { computeDualOutfit } from "./dualOutfit";
export { generateHeadline, selectTone, selectIntent } from "./voiceEngine";
export { loadMemoryState, generateMemos, persistMemos, computeTemporalPulse } from "./memoryEngine";
export { loadDecisionHistory, detectCrossPatterns, computeMaturity } from "./crossPatternEngine";
export {
  loadLikeHistory,
  loadSignalSummary,
  loadBreakpointTriggers,
} from "./signalAccumulator";
export type { LikeHistoryItem, SignalSummary } from "./signalAccumulator";
export type { ObservationState, AxisSnapshot } from "./selfStateReport";
export type { DeltaSnapshot } from "./deltaEngine";
export { getTemplate } from "./voiceTemplates";
export type { VoiceTemplate } from "./voiceTemplates";
export { computeDelta, loadPreviousSnapshot, persistSnapshot, buildCurrentSnapshot } from "./deltaEngine";
export { computeNextMove } from "./nextMoveEngine";
export { selectReflectionFlow, getReflectionNode } from "./reflectionFlows";
// Phase 4
export { computeAvoidanceMap } from "./avoidanceEngine";
export { detectAnomaly, predictExpectedOutcome, loadAnomalies, persistAnomaly } from "./anomalyEngine";
export { computeResonance } from "./resonanceEngine";
export { computeStratigraphy, loadEraSnapshots, persistEraSnapshot } from "./stratigraphyEngine";
export type { CandidateDecision } from "./crossPatternEngine";
// Phase 5
export { computePrincipleMap } from "./principleEngine";
export { computeArchetypeResonance } from "./archetypeResonanceEngine";
export { generateExistentialDigest, loadPreviousDigest, persistDigest } from "./existentialDigest";
export { detectOmens } from "./omenEngine";
export {
  refreshOrbiterMemorySummary,
  validateOrbiterMemorySummary,
  ORBITER_MEMORY_SUMMARY_JSON_SCHEMA,
} from "./memorySummary";
export {
  isOrbiterStudentTask,
  isOrbiterTrainingArtifactType,
  ORBITER_STUDENT_TASK_TYPES,
  ORBITER_TRAINING_ARTIFACT_TYPES,
} from "./studentTrack";
export {
  exportOrbiterTeacherDataset,
  exportOrbiterTrainingDataset,
} from "./exportDataset";
export {
  backfillOrbiterTeacherOutputs,
  getOrbiterShadowHealthSummary,
  listRecentOrbiterArtifactSampleChecks,
  runOrbiterArtifactSampleChecks,
} from "./studentOps";
