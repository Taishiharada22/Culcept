// Rendezvous: アバター先行型接続機能
// 分身同士が先に出会い、相互成立した接続だけを本人に届ける

export { evaluatePair, reasonCodesToTexts, cautionCodesToTexts } from "./evaluate";
export { evaluateDirection } from "./evaluateDirection";
export { similarityScore, complementScore, mixedFitScore } from "./similarityScore";
export { getCategoryWeights } from "./categoryWeights";
export { computeCategoryAffinity } from "./categoryAffinity";
export { isMutual, getThreshold } from "./thresholds";
export { buildLabel, buildOverallScore, toSyncPercent } from "./buildLabel";
export { reasonTextMap, cautionTextMap, collectReasonCodes, collectCautionCodes } from "./buildReasons";
export { serializeCard, serializeDetail } from "./serializer";
export { loadMyStyleProfileMap, buildMyStyleContextLens } from "./myStyleLens";

export type {
  RendezvousCategory,
  RendezvousCandidateState,
  RendezvousUserState,
  MatchingVector,
  ReasonCode,
  CautionCode,
  RendezvousProfile,
  RendezvousPreferences,
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousCardDTO,
  RendezvousDetailDTO,
  RendezvousFeedResponse,
  RendezvousListTab,
  EvaluationInput,
  EvaluationResult,
  EvaluatePairResult,
  CategoryWeights,
  ContextMatchScore,
  MatchExplanation,
} from "./types";
