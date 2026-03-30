// ============================================================
// Orbiter Phase 5: Orchestrator v5
// 統合エントリポイント — 全エンジン統合パイプライン
//
// 実行順序 (19ステージ):
//  1. 独立エンジン: Attraction, SelfState, Trajectory
//  2. Cross-wired: Friction (Trajectory影響)
//  3. Cross-wired: Scene (Friction影響)
//  4. Dual Outfit (Scene結果使用)
//  5. Temporal Pulse: 時間知覚計算
//  6. Memory: 内的独白の生成
//  7. Maturity + CrossPatterns (連続値スコア)
//  8. Delta Engine: ユーザーの変化検出
//  9. Avoidance Engine: 回避地図
// 10. Anomaly Engine: 異常アーカイブ
// 11. Stratigraphy Engine: 判断の地層
// 12. Resonance Engine: 越境共鳴
// 13. Principle Map: 判断原理の抽出
// 14. Archetype Resonance: 原型と選択の交差
// 15. Omen Engine: 変化の予兆
// 16. Existential Digest: 存在の要約
// 17. Next Move: 次の観測実験提案
// 18. Reflection Flow: 分岐型リフレクション選択
// 19. Voice Engine: テンプレート辞書ベースのヘッドライン
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { RendezvousCategory, CautionCode } from "@/lib/rendezvous/types";
import type { RendezvousPreferences } from "@/lib/rendezvous/types";
import type { RelationalIntelligence } from "@/lib/relational/types";
import type { AxisDistribution } from "@/lib/stargazer/fluctuationEngine";
import type {
  BreakpointTrigger,
  OrbiterIntelligence,
  OrbiterContext,
  OrbiterMemoryState,
  OrbiterMemo,
  OrbiterMaturity,
  CrossCandidatePattern,
  UserJudgmentProfile,
  FrictionForecast,
  TemporalPulse,
  OrbiterDelta,
  OrbiterAnomaly,
  DecisionEra,
} from "./types";
import type { LikeHistoryItem } from "./signalAccumulator";
import type { ObservationState, AxisSnapshot } from "./selfStateReport";
import type { DeltaSnapshot } from "./deltaEngine";

import { computeAttractionProfile } from "./attractionDiscovery";
import { computeFrictionForecast } from "./frictionForecast";
import { computeSelfStateReport } from "./selfStateReport";
import { computeSceneRecommendation } from "./sceneRecommender";
import { computeTrajectoryForecast } from "./relationshipTrajectory";
import { computeDualOutfit } from "./dualOutfit";
import { generateHeadline } from "./voiceEngine";
import { generateMemos, computeTemporalPulse } from "./memoryEngine";
import { computeMaturity } from "./crossPatternEngine";
import type { CandidateDecision } from "./crossPatternEngine";
import { computeDelta } from "./deltaEngine";
import { computeNextMove } from "./nextMoveEngine";
import { selectReflectionFlow } from "./reflectionFlows";
// Phase 4
import { computeAvoidanceMap } from "./avoidanceEngine";
import { detectAnomaly } from "./anomalyEngine";
import { computeResonance } from "./resonanceEngine";
import { computeStratigraphy } from "./stratigraphyEngine";
// Phase 5
import { computePrincipleMap } from "./principleEngine";
import { computeArchetypeResonance } from "./archetypeResonanceEngine";
import { detectOmens } from "./omenEngine";
import { generateExistentialDigest } from "./existentialDigest";
import type { StoredDigest } from "./types";

export interface OrbiterOrchestratorParams {
  // Phase 1 output
  relationalIntelligence: RelationalIntelligence;

  // Axis scores
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;

  // Attraction Discovery inputs
  likeHistory: LikeHistoryItem[];
  statedPreferences: RendezvousPreferences | null;

  // Friction Forecast inputs
  breakpointTriggers: BreakpointTrigger[];
  category: RendezvousCategory;
  cautionCodes: CautionCode[];

  // Self State Report inputs
  selfDistributions: AxisDistribution[];
  currentObservationState: ObservationState | null;
  recentSnapshots: AxisSnapshot[];

  // Context — 時間意識のための情報
  orbiterContext: OrbiterContext;

  // Memory — 前回までの内的独白 (optional for backward compatibility)
  memoryState?: OrbiterMemoryState | null;

  // Cross-candidate patterns (optional, loaded from route)
  judgmentProfile?: UserJudgmentProfile | null;

  // Delta: 前回のスナップショット (optional)
  previousDeltaSnapshot?: DeltaSnapshot | null;
  // Delta: 現在のスナップショット (optional, built from judgmentProfile)
  currentDeltaSnapshot?: DeltaSnapshot | null;

  // Phase 4: stored anomalies (loaded from DB)
  storedAnomalies?: OrbiterAnomaly[];
  // Phase 4: stored era snapshots (loaded from DB)
  storedEras?: DecisionEra[];
  // Phase 4: latest decision for anomaly detection
  latestDecision?: { decision: "like" | "pass"; timeToDecisionMs: number | null } | null;
  // Phase 4: full decision history for stratigraphy (loaded from crossPatternEngine.loadDecisionHistory)
  decisionHistory?: CandidateDecision[];

  // Phase 5: stored existential digest (loaded from DB)
  previousDigest?: StoredDigest | null;
}

export interface OrbiterOrchestratorResult {
  intelligence: OrbiterIntelligence;
  /** 今回生成されたメモ。呼び出し元で fire-and-forget で保存する */
  newMemos: Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt">[];
  /** Phase 4: 新たに検出された異常。呼び出し元で fire-and-forget で保存する */
  newAnomalies?: Omit<OrbiterAnomaly, "id" | "createdAt">[];
  /** Phase 4: 新しいeraスナップショット。呼び出し元で fire-and-forget で保存する */
  eraSnapshot?: { userId: string; eraType: string; startDate: string; decisionCount: number; metrics: unknown } | null;
  /** Phase 5: 更新された existential digest。呼び出し元で fire-and-forget で保存する */
  newDigest?: StoredDigest | null;
}

/**
 * 全6エンジン + Memory Engine + Voice Engine を統合実行。
 *
 * 純粋関数: DB アクセスなし。メモの永続化は呼び出し元に委ねる。
 */
export function computeOrbiterIntelligence(
  params: OrbiterOrchestratorParams,
): OrbiterIntelligence {
  const result = computeOrbiterFull(params);
  return result.intelligence;
}

/**
 * Full result (intelligence + memos) を返すバージョン。
 * 呼び出し元でメモの永続化が必要な場合に使う。
 */
export function computeOrbiterFull(
  params: OrbiterOrchestratorParams,
): OrbiterOrchestratorResult {
  const memory = params.memoryState ?? null;

  // ── Stage 1: Independent engines ──

  const attractionProfile = computeAttractionProfile({
    statedPreferences: params.statedPreferences,
    likeHistory: params.likeHistory,
  });

  const selfStateReport = computeSelfStateReport({
    distributions: params.selfDistributions,
    currentState: params.currentObservationState,
    recentSnapshots: params.recentSnapshots,
  });

  const trajectoryForecast = computeTrajectoryForecast({
    chemistryMap: params.relationalIntelligence.chemistryMap,
    selfAxisScores: params.selfAxisScores,
    counterpartAxisScores: params.counterpartAxisScores,
    category: params.category,
  });

  // ── Stage 2: Cross-wired Friction ──

  const baseFriction = computeFrictionForecast({
    positiveFriction: params.relationalIntelligence.positiveFriction,
    breakpointTriggers: params.breakpointTriggers,
    selfAxisScores: params.selfAxisScores,
    counterpartAxisScores: params.counterpartAxisScores,
    category: params.category,
  });

  // Cross-wire: Trajectory → Friction severity boost
  const frictionForecast = applyTrajectoryInfluence(baseFriction, trajectoryForecast);

  // Cross-wire: Attraction divergence → SelfState warning enhancement
  if (
    selfStateReport &&
    attractionProfile &&
    attractionProfile.divergences.length > 0 &&
    !selfStateReport.attractionWarning
  ) {
    selfStateReport.attractionWarning =
      "あなたの「好き」の自己認識と実際のパターンにズレがある。" +
      "今の判断が本能によるものか、思い込みによるものか、少し立ち止まって考えてみて";
  }

  // ── Stage 3: Cross-wired Scene ──

  const frictionCautionCodes = frictionForecast
    ? frictionForecast.items
        .filter((i) => i.severity === "high")
        .map((i) => i.cautionCode)
    : [];
  const mergedCautionCodes = [
    ...new Set([...params.cautionCodes, ...frictionCautionCodes]),
  ];

  const sceneRecommendation = computeSceneRecommendation({
    selfAxisScores: params.selfAxisScores,
    counterpartAxisScores: params.counterpartAxisScores,
    category: params.category,
    cautionCodes: mergedCautionCodes,
  });

  // ── Stage 4: Dual Outfit ──

  const bestSceneType = sceneRecommendation.bestFirst.type;
  const dualOutfit = computeDualOutfit({
    selfAxisScores: params.selfAxisScores,
    counterpartAxisScores: params.counterpartAxisScores,
    sceneType: bestSceneType,
  });

  // ── Stage 5: Temporal Pulse ──

  const temporalPulse = computeTemporalPulse(params.orbiterContext, memory ?? {
    memos: [],
    latestHypothesis: null,
    pendingQuestion: null,
    milestoneCount: 0,
    revisionCount: 0,
  });

  // ── Stage 6: Memory — 内的独白の生成 ──

  const newMemos = generateMemos({
    context: params.orbiterContext,
    memory: memory ?? {
      memos: [],
      latestHypothesis: null,
      pendingQuestion: null,
      milestoneCount: 0,
      revisionCount: 0,
    },
    friction: frictionForecast,
    attraction: attractionProfile,
    trajectory: trajectoryForecast,
    selfState: selfStateReport,
  });

  // メモ生成後のメモリ状態を更新 (Voice Engine に渡すため)
  // revision メモがあれば最新のメモリに含める
  const effectiveMemory: OrbiterMemoryState = memory
    ? {
        ...memory,
        memos: [
          ...newMemos.map((m, i) => ({
            ...m,
            id: `new-${i}`,
            userId: "",
            candidateId: "",
            createdAt: new Date().toISOString(),
          })),
          ...memory.memos,
        ].slice(0, 20),
        revisionCount:
          memory.revisionCount +
          newMemos.filter((m) => m.memoType === "revision").length,
      }
    : {
        memos: newMemos.map((m, i) => ({
          ...m,
          id: `new-${i}`,
          userId: "",
          candidateId: "",
          createdAt: new Date().toISOString(),
        })),
        latestHypothesis: null,
        pendingQuestion: null,
        milestoneCount: newMemos.filter((m) => m.memoType === "milestone").length,
        revisionCount: newMemos.filter((m) => m.memoType === "revision").length,
      };

  // ── Stage 7: Maturity + Cross-patterns ──

  const crossPatterns = params.judgmentProfile?.patterns ?? [];
  const maturity = computeMaturity(
    [], // decisions are pre-processed into judgmentProfile.patterns
    effectiveMemory,
    crossPatterns,
  );

  // ── Stage 8: Delta Engine — ユーザーの変化検出 ──

  const delta = params.currentDeltaSnapshot && params.previousDeltaSnapshot
    ? computeDelta(params.currentDeltaSnapshot, params.previousDeltaSnapshot)
    : params.currentDeltaSnapshot
      ? computeDelta(params.currentDeltaSnapshot, null)
      : null;

  // ── Stage 9: Avoidance Engine — 回避地図 ──

  const avoidanceMap = computeAvoidanceMap({
    likeHistory: params.likeHistory,
    statedPreferences: params.statedPreferences,
    attractionProfile,
  });

  // ── Stage 10: Anomaly Engine — 異常アーカイブ ──

  const anomalyArchive = detectAnomaly({
    latestDecision: params.latestDecision ?? null,
    counterpartAxisScores: params.counterpartAxisScores,
    crossPatterns,
    attractionProfile,
    judgmentProfile: params.judgmentProfile ?? null,
    storedAnomalies: params.storedAnomalies ?? [],
    context: params.orbiterContext,
  });

  // ── Stage 11: Stratigraphy Engine — 判断の地層 ──

  const stratigraphy = computeStratigraphy({
    decisionHistory: params.decisionHistory ?? [],
    previousDeltaSnapshot: params.previousDeltaSnapshot ?? null,
    currentDeltaSnapshot: params.currentDeltaSnapshot ?? null,
    delta,
  });

  // Build era snapshot for persistence if new era detected
  let eraSnapshot: OrbiterOrchestratorResult["eraSnapshot"] = null;
  if (stratigraphy?.currentEra && params.storedEras) {
    const lastStored = params.storedEras[0];
    if (!lastStored || lastStored.type !== stratigraphy.currentEra.type) {
      eraSnapshot = {
        userId: "", // filled by caller
        eraType: stratigraphy.currentEra.type,
        startDate: stratigraphy.currentEra.startDate,
        decisionCount: stratigraphy.currentEra.decisionCount,
        metrics: stratigraphy.currentEra.metrics,
      };
    }
  }

  // ── Stage 12: Resonance Engine — 越境共鳴 ──

  const resonance = computeResonance({
    selfAxisScores: params.selfAxisScores,
    attractionProfile,
    avoidanceMap,
    crossPatterns,
    breakpointTriggers: params.breakpointTriggers,
  });

  // ── Stage 13: Principle Map — 判断原理の抽出 ──

  const principleMap = computePrincipleMap({
    likeHistory: params.likeHistory,
    attractionProfile,
    avoidanceMap,
    crossPatterns,
    breakpointTriggers: params.breakpointTriggers,
    selfAxisScores: params.selfAxisScores,
    judgmentProfile: params.judgmentProfile ?? null,
    resonance,
    stratigraphy,
    anomalyArchive,
  });

  // ── Stage 14: Archetype Resonance — 原型と選択の交差 ──

  const archetypeResonance = computeArchetypeResonance({
    selfAxisScores: params.selfAxisScores,
    likeHistory: params.likeHistory,
    avoidanceMap,
    principleMap,
  });

  // ── Stage 15: Omen Engine — 変化の予兆 ──

  const omenForecast = detectOmens({
    principleMap,
    archetypeResonance,
    stratigraphy,
    anomalyArchive,
    delta,
    maturity,
  });

  // ── Stage 16: Existential Digest — 存在の要約 ──

  const existentialDigest = generateExistentialDigest({
    principleMap,
    archetypeResonance,
    stratigraphy,
    avoidanceMap,
    omenForecast,
    maturity,
    previousDigest: params.previousDigest ?? null,
  });

  // Build digest for persistence if generated
  let newDigest: StoredDigest | null = null;
  if (existentialDigest) {
    newDigest = {
      userId: "", // filled by caller
      sections: existentialDigest.sections,
      essence: existentialDigest.essence,
      createdAt: existentialDigest.generatedAt,
    };
  }

  // ── Stage 17: Next Move — 次の観測実験提案 ──

  const nextMove = computeNextMove({
    maturity,
    crossPatterns,
    delta,
    context: params.orbiterContext,
    memory: effectiveMemory,
    temporal: temporalPulse,
  });

  // ── Stage 18: Reflection Flow Selection ──

  const reflectionFlow = selectReflectionFlow(
    params.orbiterContext,
    maturity,
    effectiveMemory,
  );

  // ── Stage 19: Voice Engine — テンプレート辞書ベース ──

  const headline = generateHeadline({
    context: params.orbiterContext,
    selfState: selfStateReport,
    friction: frictionForecast,
    attraction: attractionProfile,
    trajectory: trajectoryForecast,
    scene: sceneRecommendation,
    memory: effectiveMemory,
    temporal: temporalPulse,
    maturity,
    crossPatterns,
    avoidanceMap,
    anomalyArchive,
    resonance,
    stratigraphy,
    // Phase 5
    principleMap,
    archetypeResonance,
    existentialDigest,
    omenForecast,
  });

  // ── Build new anomalies for persistence ──

  const newAnomalies: Omit<OrbiterAnomaly, "id" | "createdAt">[] = anomalyArchive.recent.map((a) => ({
    userId: "", // filled by caller
    candidateId: "", // filled by caller
    anomalyType: a.anomalyType,
    description: a.description,
    expectedOutcome: a.expectedOutcome,
    actualOutcome: a.actualOutcome,
    significance: a.significance,
    becamePattern: a.becamePattern,
    metadata: a.metadata,
  }));

  const intelligence: OrbiterIntelligence = {
    headline,
    attractionProfile,
    frictionForecast,
    selfStateReport,
    sceneRecommendation,
    trajectoryForecast,
    dualOutfit,
    memoryDigest: {
      hasHypothesis: effectiveMemory.latestHypothesis != null ||
        newMemos.some((m) => m.memoType === "hypothesis"),
      revisionCount: effectiveMemory.revisionCount,
      latestMilestone:
        newMemos.find((m) => m.memoType === "milestone")?.content ??
        (memory?.memos.find((m) => m.memoType === "milestone")?.content ?? null),
    },
    temporalPulse,
    crossPatterns: crossPatterns.length > 0 ? crossPatterns : undefined,
    maturity,
    delta,
    nextMove,
    reflectionFlow,
    // Phase 4
    avoidanceMap,
    anomalyArchive,
    resonance,
    stratigraphy,
    // Phase 5
    principleMap,
    archetypeResonance,
    existentialDigest,
    omenForecast,
  };

  return {
    intelligence,
    newMemos,
    newAnomalies: newAnomalies.length > 0 ? newAnomalies : undefined,
    eraSnapshot,
    newDigest,
  };
}

// ── Cross-engine influence helpers ──

function applyTrajectoryInfluence(
  friction: FrictionForecast,
  trajectory: ReturnType<typeof computeTrajectoryForecast>,
): FrictionForecast {
  if (!trajectory || friction.items.length === 0) return friction;

  const boostMap: Record<string, string[]> = {
    fast_intense: ["depth_progression_gap", "emotional_expression_gap"],
    creative_tension: ["conflict_style_gap", "decision_speed_gap"],
    oscillating: ["distance_need_gap", "rhythm_gap"],
  };

  const boostCodes = boostMap[trajectory.type] ?? [];
  if (boostCodes.length === 0) return friction;

  const updatedItems = friction.items.map((item) => {
    if (boostCodes.includes(item.cautionCode) && item.severity !== "high") {
      const nextSeverity = item.severity === "low" ? "medium" : "high";
      return {
        ...item,
        severity: nextSeverity as typeof item.severity,
      };
    }
    return item;
  });

  const severityOrder = { high: 3, medium: 2, low: 1 } as const;
  updatedItems.sort(
    (a, b) => severityOrder[b.severity] - severityOrder[a.severity],
  );

  const highCount = updatedItems.filter((i) => i.severity === "high").length;
  const mediumCount = updatedItems.filter((i) => i.severity === "medium").length;
  let overallRisk = friction.overallRisk;
  if (highCount >= 2) overallRisk = "high";
  else if (highCount >= 1 || mediumCount >= 3) overallRisk = "medium";

  return {
    ...friction,
    items: updatedItems,
    overallRisk,
  };
}
