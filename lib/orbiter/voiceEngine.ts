// ============================================================
// Orbiter Voice Engine v3
// 「静かだが刺さる声」— テンプレート辞書 + 最小限の動的補足
//
// v2 からの進化:
// - テンプレート辞書 (voiceTemplates.ts) に message を委譲
// - builder 関数は subMessage の動的生成のみ
// - maturity stage で声の長さが自動調整
// - 全メッセージ ≤35文字目標
// ============================================================

import type {
  OrbiterTone,
  OrbiterIntent,
  OrbiterHeadline,
  OrbiterContext,
  OrbiterMemoryState,
  OrbiterMaturity,
  OrbiterMaturityStage,
  CrossCandidatePattern,
  TemporalPulse,
  FrictionForecast,
  SelfStateReport,
  AttractionProfile,
  TrajectoryForecast,
  SceneRecommendationResult,
  // Phase 4
  AvoidanceMap,
  AnomalyArchive,
  CrossDomainResonance,
  DecisionStratigraphy,
  // Phase 5
  PrincipleMap,
  ArchetypeResonance,
  ExistentialDigest,
  OmenForecast,
} from "./types";
import { getTemplate } from "./voiceTemplates";

// ── Tone Selection ──

export function selectTone(
  context: OrbiterContext,
  selfState: SelfStateReport | null,
  memory: OrbiterMemoryState | null,
  temporal: TemporalPulse | null,
): OrbiterTone {
  if (selfState?.decisionQualityHint === "rest_first") return "gentle";
  if (temporal && temporal.urgency >= 0.7) return "honest";
  if (memory?.revisionCount && memory.memos[0]?.memoType === "revision") return "honest";
  if (context.visitCount <= 1) return "curious";
  if (temporal?.visitRhythm === "returning_after_gap") return "tentative";
  if (temporal?.visitRhythm === "obsessive") return "provocative";
  if (context.visitCount >= 3 && (context.candidateState === "seen" || context.candidateState === "delivered")) return "provocative";
  if (context.candidateState === "mutual_liked" || context.candidateState === "chat_opened") return "confident";
  if (context.hasReflection && (memory?.milestoneCount ?? 0) > 0) return "confident";
  if (memory?.latestHypothesis) return "tentative";
  return "tentative";
}

// ── Intent Selection ──

interface IntentCandidate {
  intent: OrbiterIntent;
  priority: number;
  condition: boolean;
}

export function selectIntent(
  context: OrbiterContext,
  selfState: SelfStateReport | null,
  friction: FrictionForecast | null,
  attraction: AttractionProfile | null,
  trajectory: TrajectoryForecast | null,
  memory: OrbiterMemoryState | null,
  temporal: TemporalPulse | null,
  // Phase 4
  phase4?: {
    avoidanceMap?: AvoidanceMap | null;
    anomalyArchive?: AnomalyArchive | null;
    resonance?: CrossDomainResonance | null;
    stratigraphy?: DecisionStratigraphy | null;
  } | null,
  // Phase 5
  phase5?: {
    principleMap?: PrincipleMap | null;
    archetypeResonance?: ArchetypeResonance | null;
    existentialDigest?: ExistentialDigest | null;
    omenForecast?: OmenForecast | null;
  } | null,
): OrbiterIntent {
  const hasRevision = memory?.memos.some(
    (m) => m.memoType === "revision" && m.metadata.visitCount === context.visitCount,
  );

  const candidates: IntentCandidate[] = [
    { intent: "revision", priority: 105, condition: !!hasRevision },
    { intent: "state_warning", priority: 100, condition: selfState?.decisionQualityHint === "rest_first" },
    { intent: "provocation", priority: 95, condition: (temporal?.urgency ?? 0) >= 0.7 && context.candidateState === "seen" },
    { intent: "state_warning", priority: 80, condition: selfState?.decisionQualityHint === "caution" },
    { intent: "first_impression", priority: 70, condition: context.visitCount <= 1 },
    { intent: "delta_report", priority: 68, condition: temporal?.visitRhythm === "returning_after_gap" && memory?.latestHypothesis != null },
    { intent: "provocation", priority: 65, condition: context.visitCount >= 3 && (context.candidateState === "seen" || context.candidateState === "delivered") },
    // Phase 4: anomaly has high priority — pattern breaks are significant
    { intent: "anomaly_noticed", priority: 62, condition: (phase4?.anomalyArchive?.recent?.length ?? 0) > 0 && (phase4?.anomalyArchive?.recent[0]?.significance ?? 0) >= 0.5 },
    { intent: "pattern_noticed", priority: 60, condition: (attraction?.divergences.length ?? 0) > 0 },
    // Phase 4: avoidance paradox is a strong signal
    { intent: "avoidance_insight", priority: 58, condition: (phase4?.avoidanceMap?.paradoxes?.length ?? 0) > 0 && (phase4?.avoidanceMap?.confidence ?? 0) >= 0.4 },
    // Phase 4: era transition marks a shift
    { intent: "era_transition", priority: 56, condition: phase4?.stratigraphy?.latestTransition != null },
    { intent: "encouragement", priority: 55, condition: context.candidateState === "mutual_liked" || context.candidateState === "chat_opened" },
    { intent: "encouragement", priority: 53, condition: context.hasReflection && temporal?.milestone?.type === "reflection_given" },
    { intent: "question", priority: 50, condition: friction?.overallRisk === "high" },
    // Phase 5: principle_revealed — deep structural insight
    { intent: "principle_revealed", priority: 64, condition: (phase5?.principleMap?.confidence ?? 0) >= 0.5 && phase5?.principleMap?.tension != null },
    // Phase 5: shadow_encounter — choosing toward shadow
    { intent: "shadow_encounter", priority: 60, condition: (phase5?.archetypeResonance?.growthPull ?? 0) >= 0.35 && (phase5?.archetypeResonance?.confidence ?? 0) >= 0.4 },
    // Phase 4: resonance is a deeper, quieter signal
    { intent: "resonance", priority: 48, condition: (phase4?.resonance?.insights?.length ?? 0) > 0 && (phase4?.resonance?.insights[0]?.confidence ?? 0) >= 0.4 },
    // Phase 5: omen_detected — pre-transition signal
    { intent: "omen_detected", priority: 54, condition: (phase5?.omenForecast?.omens?.length ?? 0) > 0 && (phase5?.omenForecast?.omens[0]?.confidence ?? 0) >= 0.5 },
    { intent: "delta_report", priority: 45, condition: context.visitCount === 2 },
    // Phase 5: digest_updated — only when something changed
    { intent: "digest_updated", priority: 44, condition: (phase5?.existentialDigest?.changedSections?.length ?? 0) > 0 },
    { intent: "question", priority: 40, condition: trajectory?.type === "creative_tension" },
    { intent: "pattern_noticed", priority: 38, condition: memory?.latestHypothesis != null && context.visitCount >= 3 },
  ];

  const matched = candidates.filter((c) => c.condition).sort((a, b) => b.priority - a.priority);
  return matched[0]?.intent ?? "first_impression";
}

// ── Headline Generation ──

export interface HeadlineParams {
  context: OrbiterContext;
  selfState: SelfStateReport | null;
  friction: FrictionForecast | null;
  attraction: AttractionProfile | null;
  trajectory: TrajectoryForecast | null;
  scene: SceneRecommendationResult | null;
  memory: OrbiterMemoryState | null;
  temporal: TemporalPulse | null;
  maturity?: OrbiterMaturity | null;
  crossPatterns?: CrossCandidatePattern[] | null;
  // Phase 4
  avoidanceMap?: AvoidanceMap | null;
  anomalyArchive?: AnomalyArchive | null;
  resonance?: CrossDomainResonance | null;
  stratigraphy?: DecisionStratigraphy | null;
  // Phase 5
  principleMap?: PrincipleMap | null;
  archetypeResonance?: ArchetypeResonance | null;
  existentialDigest?: ExistentialDigest | null;
  omenForecast?: OmenForecast | null;
}

export function generateHeadline(params: HeadlineParams): OrbiterHeadline {
  const {
    context, selfState, friction, attraction, trajectory,
    scene, memory, temporal, maturity, crossPatterns,
    avoidanceMap, anomalyArchive, resonance, stratigraphy,
    principleMap, archetypeResonance, existentialDigest, omenForecast,
  } = params;

  const stage = maturity?.stage ?? "guide";

  // ── Strategic Silence ──
  if (maturity?.shouldBeSilent) {
    return {
      message: "…",
      subMessage: maturity.silenceReason ?? "見守っている。",
      intent: "encouragement",
      tone: "gentle",
      confidence: 0.9,
    };
  }

  const tone = selectTone(context, selfState, memory, temporal);
  const phase4 = { avoidanceMap, anomalyArchive, resonance, stratigraphy };
  const phase5 = { principleMap, archetypeResonance, existentialDigest, omenForecast };
  const intent = selectIntent(context, selfState, friction, attraction, trajectory, memory, temporal, phase4, phase5);

  // ── Cross-pattern override ──
  if (crossPatterns?.length && stage !== "guide") {
    const top = crossPatterns[0];
    if (
      (top.type === "contradiction" || top.type === "repetition_warning") &&
      intent !== "state_warning" && intent !== "revision" &&
      top.confidence >= 0.5
    ) {
      return buildCrossPatternHeadline(tone, top, stage);
    }
    if (top.type === "growth_signal" && top.confidence >= 0.5 && context.visitCount >= 2) {
      return buildCrossPatternHeadline(tone, top, stage);
    }
  }

  // ── Maturity-aware intent ──
  const eff = modulateIntent(intent, stage);

  // ── Build headline from template + dynamic sub ──
  const tmpl = getTemplate(stage, eff);
  const sub = buildSubMessage(eff, stage, {
    context, selfState, friction, attraction, trajectory, scene, memory, temporal,
    avoidanceMap, anomalyArchive, resonance, stratigraphy,
    principleMap, archetypeResonance, existentialDigest, omenForecast,
  });

  return {
    message: tmpl.message,
    subMessage: sub,
    intent: eff,
    tone,
    confidence: tmpl.defaultConfidence,
  };
}

// ── Intent Modulation ──

function modulateIntent(intent: OrbiterIntent, stage: OrbiterMaturityStage): OrbiterIntent {
  if (stage === "coach") {
    if (intent === "provocation") return "question";
    if (intent === "pattern_noticed") return "question";
    if (intent === "avoidance_insight") return "question"; // Phase 4: coach asks rather than states
    if (intent === "principle_revealed") return "question"; // Phase 5: coach lets user discover
  }
  if (stage === "witness") {
    if (intent === "provocation") return "encouragement";
    if (intent === "first_impression") return "encouragement";
    if (intent === "anomaly_noticed") return "encouragement"; // Phase 4: witness doesn't alarm
    if (intent === "omen_detected") return "encouragement"; // Phase 5: witness watches quietly
    if (intent === "shadow_encounter") return "encouragement"; // Phase 5: witness doesn't intervene
  }
  return intent;
}

// ── Cross-Pattern Headlines ──

function buildCrossPatternHeadline(
  tone: OrbiterTone,
  pattern: CrossCandidatePattern,
  stage: OrbiterMaturityStage,
): OrbiterHeadline {
  const messages: Record<string, Record<string, string>> = {
    contradiction: {
      guide: "選び方に矛盾がある。",
      mirror: "矛盾に気づいてる？",
      coach: "その矛盾、意味がある。",
      witness: "知ってるよね。",
    },
    repetition_warning: {
      guide: "前にも見た景色かもしれない。",
      mirror: "同じパターンを繰り返している。",
      coach: "また同じ道？",
      witness: "…繰り返し。",
    },
    growth_signal: {
      guide: "成長している。",
      mirror: "変わってきたね。",
      coach: "気づいてた？",
      witness: "見てるよ。",
    },
  };

  const msg = messages[pattern.type]?.[stage] ?? messages[pattern.type]?.mirror ?? "パターンが見えている。";

  return {
    message: msg,
    subMessage: pattern.narrative,
    intent: pattern.type === "growth_signal" ? "encouragement" : "pattern_noticed",
    tone: pattern.type === "growth_signal" ? "confident" : stage === "coach" ? "honest" : "tentative",
    confidence: pattern.confidence,
  };
}

// ── Dynamic Sub-Message Builder ──

interface SubMessageContext {
  context: OrbiterContext;
  selfState: SelfStateReport | null;
  friction: FrictionForecast | null;
  attraction: AttractionProfile | null;
  trajectory: TrajectoryForecast | null;
  scene: SceneRecommendationResult | null;
  memory: OrbiterMemoryState | null;
  temporal: TemporalPulse | null;
  // Phase 4
  avoidanceMap?: AvoidanceMap | null;
  anomalyArchive?: AnomalyArchive | null;
  resonance?: CrossDomainResonance | null;
  stratigraphy?: DecisionStratigraphy | null;
  // Phase 5
  principleMap?: PrincipleMap | null;
  archetypeResonance?: ArchetypeResonance | null;
  existentialDigest?: ExistentialDigest | null;
  omenForecast?: OmenForecast | null;
}

function buildSubMessage(
  intent: OrbiterIntent,
  stage: OrbiterMaturityStage,
  ctx: SubMessageContext,
): string | undefined {
  switch (intent) {
    case "state_warning":
      return ctx.selfState?.attractionWarning ?? ctx.selfState?.recommendation;

    case "first_impression":
      if (ctx.friction?.overallRisk === "high") {
        return ctx.friction.items[0]?.scenario.slice(0, 50);
      }
      if (ctx.trajectory) {
        return ctx.trajectory.typeLabel;
      }
      return undefined;

    case "provocation": {
      if (ctx.temporal?.urgency && ctx.temporal.urgency >= 0.7) {
        return `あと${ctx.context.daysUntilExpiry ?? "?"}日`;
      }
      if (ctx.memory?.latestHypothesis) {
        return ctx.memory.latestHypothesis.content.slice(0, 50);
      }
      return `${ctx.context.visitCount}回目の訪問`;
    }

    case "pattern_noticed": {
      if (ctx.attraction?.divergences?.[0]) {
        return ctx.attraction.divergences[0].narrative.slice(0, 60);
      }
      if (ctx.memory?.latestHypothesis) {
        return ctx.memory.latestHypothesis.content.slice(0, 50);
      }
      return undefined;
    }

    case "encouragement": {
      if (ctx.temporal?.milestone?.type === "reflection_given") {
        return "内省が精度を上げる";
      }
      if (ctx.scene?.bestFirst) {
        return `おすすめ: ${ctx.scene.bestFirst.title}`;
      }
      if (ctx.trajectory) {
        return ctx.trajectory.typeLabel;
      }
      return undefined;
    }

    case "question": {
      if (ctx.memory?.pendingQuestion) {
        return ctx.memory.pendingQuestion.content.slice(0, 60);
      }
      if (ctx.friction?.items[0]) {
        const q = FRICTION_QUESTIONS[ctx.friction.items[0].cautionCode];
        return q ?? ctx.friction.items[0].advice.slice(0, 50);
      }
      return undefined;
    }

    case "delta_report": {
      if (ctx.temporal?.visitRhythm === "returning_after_gap" && ctx.memory?.latestHypothesis) {
        const days = ctx.context.hoursSinceLastVisit
          ? Math.floor(ctx.context.hoursSinceLastVisit / 24)
          : null;
        return days
          ? `${days}日ぶり。前回の仮説: ${ctx.memory.latestHypothesis.content.slice(0, 30)}…`
          : ctx.memory.latestHypothesis.content.slice(0, 50);
      }
      if (ctx.friction?.personalizedCount) {
        return `${ctx.friction.personalizedCount}件がパーソナライズ済み`;
      }
      return ctx.trajectory ? `${ctx.trajectory.typeLabel}` : undefined;
    }

    case "revision": {
      const rev = ctx.memory?.memos.find((m) => m.memoType === "revision");
      if (rev) {
        const prev = rev.metadata.previousContent as string | undefined;
        return prev
          ? `「${prev.slice(0, 20)}…」→ ${rev.content.slice(0, 30)}`
          : rev.content.slice(0, 50);
      }
      return "新しいデータが別の可能性を示している";
    }

    // ── Phase 4 ──

    case "avoidance_insight": {
      if (ctx.avoidanceMap?.paradoxes?.[0]) {
        return ctx.avoidanceMap.paradoxes[0].narrative.slice(0, 60);
      }
      if (ctx.avoidanceMap?.insight) {
        return ctx.avoidanceMap.insight.slice(0, 60);
      }
      return undefined;
    }

    case "anomaly_noticed": {
      if (ctx.anomalyArchive?.retrospectiveInsight) {
        return ctx.anomalyArchive.retrospectiveInsight.slice(0, 60);
      }
      if (ctx.anomalyArchive?.recent?.[0]) {
        return ctx.anomalyArchive.recent[0].description.slice(0, 60);
      }
      return undefined;
    }

    case "resonance": {
      if (ctx.resonance?.insights?.[0]) {
        return ctx.resonance.insights[0].insight.slice(0, 60);
      }
      return undefined;
    }

    case "era_transition": {
      if (ctx.stratigraphy?.latestTransition) {
        return ctx.stratigraphy.latestTransition.retrospective.slice(0, 60);
      }
      if (ctx.stratigraphy?.currentEra) {
        return `${ctx.stratigraphy.currentEra.label}: ${ctx.stratigraphy.currentEra.characterization.slice(0, 40)}`;
      }
      return undefined;
    }

    // ── Phase 5 ──

    case "principle_revealed": {
      if (ctx.principleMap?.tension) {
        return ctx.principleMap.tension.insight.slice(0, 60);
      }
      if (ctx.principleMap?.narrative) {
        return ctx.principleMap.narrative.slice(0, 60);
      }
      return undefined;
    }

    case "shadow_encounter": {
      if (ctx.archetypeResonance) {
        return ctx.archetypeResonance.insight.slice(0, 60);
      }
      return undefined;
    }

    case "digest_updated": {
      if (ctx.existentialDigest?.changedSections?.length) {
        const idx = ctx.existentialDigest.changedSections[0];
        const changed = ctx.existentialDigest.sections[idx];
        return changed ? `「${changed.title}」が変わった` : undefined;
      }
      return undefined;
    }

    case "omen_detected": {
      if (ctx.omenForecast?.omens?.[0]) {
        return ctx.omenForecast.omens[0].prediction.slice(0, 60);
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

// ── Friction Question Map ──

const FRICTION_QUESTIONS: Record<string, string> = {
  silence_interpretation_gap: "沈黙が続いた時、どう感じる？",
  conflict_style_gap: "意見がぶつかったら、話す？ 距離を置く？",
  distance_need_gap: "ひとりの時間、どれくらい必要？",
  emotional_expression_gap: "感情を言葉にする？ 態度で示す？",
  depth_progression_gap: "関係を深めるペース、早い方がいい？",
  initiative_gap: "自分から誘う？ 誘われるのを待つ？",
  decision_speed_gap: "直感で決める？ じっくり考える？",
  rhythm_gap: "連絡頻度、高い方がいい？",
};
