/**
 * CoAlter Stage 1 Understand — 決定論的合成 pair 生成器（M0-5 shadow 母数作成用）
 *
 * [CEO lock 2026-04-20 M0-5]
 *   - 本ファイルは test / script からのみ import する想定。prod runtime は触らない。
 *   - 全て決定論: パラメタ → bundle の純関数
 *   - axis 分布 × 疲労 signal × ledger skew の直交組合せを生成
 *
 * 生成次元:
 *   axisProfile: "A-inward" | "A-outward" | "mixed" | "B-outward" | "B-inward"
 *   fatigueLevel: "none" | "some" | "strong"
 *   ledgerSkew: "balanced" | "a-favored" | "b-favored"
 *   celebration: boolean
 *   energyLevel: "high" | "mid" | "low"
 *
 * 総当たり: 5 × 3 × 3 × 2 × 3 = 270 件。必要分だけ cherry-pick する。
 */

import type {
  ConversationObservation,
  ObservationBundle,
  PersonObservation,
  RelationshipObservation,
  UserId,
} from "../types";

export type AxisProfile =
  | "A-inward"
  | "A-outward"
  | "mixed"
  | "B-outward"
  | "B-inward";

export type SyntheticPairParams = {
  id: string;                                        // fixture 識別子
  axisProfile: AxisProfile;
  fatigueLevel: "none" | "some" | "strong";
  ledgerSkew: "balanced" | "a-favored" | "b-favored";
  celebration: boolean;
  energyLevel: "high" | "mid" | "low";
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. Directional axes by profile
// ═══════════════════════════════════════════════════════════════════════════

function axesForPerson(
  side: "a" | "b",
  profile: AxisProfile,
): PersonObservation["stargazer"]["decisionAxes"] {
  // inward = negative side（caution / familiarity / precision）
  // outward = positive side（stimulus / novelty / speed）
  const inwardA = [
    { key: "caution_vs_stimulus", value: -0.55, confidence: 0.7, observedAt: "2026-04-15T10:00:00Z" },
    { key: "novelty_vs_familiarity", value: -0.45, confidence: 0.6, observedAt: "2026-04-14T10:00:00Z" },
    { key: "plan_vs_emergence", value: -0.5, confidence: 0.65, observedAt: "2026-04-13T10:00:00Z" },
  ];
  const outwardA = [
    { key: "caution_vs_stimulus", value: 0.55, confidence: 0.7, observedAt: "2026-04-15T10:00:00Z" },
    { key: "novelty_vs_familiarity", value: 0.5, confidence: 0.6, observedAt: "2026-04-14T10:00:00Z" },
    { key: "speed_vs_precision", value: 0.4, confidence: 0.6, observedAt: "2026-04-13T10:00:00Z" },
  ];
  const inwardB = [
    { key: "caution_vs_stimulus", value: -0.5, confidence: 0.65, observedAt: "2026-04-15T10:00:00Z" },
    { key: "plan_vs_emergence", value: -0.5, confidence: 0.6, observedAt: "2026-04-14T10:00:00Z" },
    { key: "intensity_vs_calm", value: -0.6, confidence: 0.6, observedAt: "2026-04-13T10:00:00Z" },
  ];
  const outwardB = [
    { key: "caution_vs_stimulus", value: 0.58, confidence: 0.66, observedAt: "2026-04-15T10:00:00Z" },
    { key: "novelty_vs_familiarity", value: 0.5, confidence: 0.6, observedAt: "2026-04-14T10:00:00Z" },
    { key: "solo_vs_social", value: 0.5, confidence: 0.6, observedAt: "2026-04-13T10:00:00Z" },
  ];

  if (side === "a") {
    if (profile === "A-inward" || profile === "mixed") return inwardA;
    return outwardA; // A-outward / B-inward / B-outward
  }
  // side === "b"
  if (profile === "B-inward") return inwardB;
  if (profile === "B-outward" || profile === "mixed" || profile === "A-inward" || profile === "A-outward")
    return outwardB;
  return outwardB;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Conversation synthesis — 疲労 / celebration signal を note として埋込
// ═══════════════════════════════════════════════════════════════════════════

function buildConversation(
  p: SyntheticPairParams,
  userA: UserId,
  userB: UserId,
): ConversationObservation {
  const turns: ConversationObservation["turns"] = [];
  // fatigue tokens を必要本数だけ挿入
  if (p.fatigueLevel === "some") {
    turns.push({ senderId: userA, body: "今日は疲れた感じ", createdAt: "2026-04-20T12:00:00Z" });
  }
  if (p.fatigueLevel === "strong") {
    turns.push({ senderId: userA, body: "だるい", createdAt: "2026-04-20T12:00:00Z" });
    turns.push({ senderId: userB, body: "私も眠い", createdAt: "2026-04-20T12:01:00Z" });
  }
  if (p.celebration) {
    turns.push({
      senderId: userA,
      body: "今日は記念日だから特別にしよう",
      createdAt: "2026-04-20T12:02:00Z",
    });
  }
  // 中立 turn を必ず 1 本置く（empty 会話回避）
  turns.push({
    senderId: userB,
    body: "どうしようか",
    createdAt: "2026-04-20T12:03:00Z",
  });

  return {
    turns,
    theme: "food",
    extractedConstraints: {
      date: "2026-04-20",
      location: "渋谷",
      budget: null,
      timeSlot: "evening",
      preferences: [],
    },
    caringIntensity: { a: 0.4, b: 0.5 },
    implicitMood: p.celebration ? "祝祭の気配" : "",
    energyLevel: p.energyLevel,
    conversationArc: p.celebration ? "expanding" : "opening",
    questionGuardState: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Ledger synthesis — skew direction
// ═══════════════════════════════════════════════════════════════════════════

function buildLedger(
  p: SyntheticPairParams,
): RelationshipObservation["fairnessLedger"] {
  const base = [
    { sessionId: "s1", decidedAt: "2026-04-12T18:00:00Z", skew: 0, topic: "food" },
    { sessionId: "s2", decidedAt: "2026-04-05T19:00:00Z", skew: 0, topic: "movie" },
    { sessionId: "s3", decidedAt: "2026-03-29T18:30:00Z", skew: 0, topic: "food" },
  ];
  if (p.ledgerSkew === "a-favored") {
    // a-favored = A 側に寄った決定が多い = 補正は B へ
    return base.map((e, i) => ({ ...e, skew: i === 1 ? 0.4 : 0.6 }));
  }
  if (p.ledgerSkew === "b-favored") {
    return base.map((e, i) => ({ ...e, skew: i === 1 ? -0.4 : -0.6 }));
  }
  return base; // balanced
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Full bundle
// ═══════════════════════════════════════════════════════════════════════════

function buildPerson(
  side: "a" | "b",
  profile: AxisProfile,
  id: string,
): PersonObservation {
  const userId = (`u_syn_${id}_${side}`) as UserId;
  return {
    identity: { userId, displayName: `Synth${side.toUpperCase()}` },
    stargazer: {
      decisionAxes: axesForPerson(side, profile),
      comfortSources: side === "a" ? ["静かな場"] : ["新しい場所"],
      fatigueTriggers: side === "a" ? ["人混み"] : ["反復"],
      recoveryConditions: side === "a" ? ["独りの散歩"] : ["外での運動"],
      unspokenDesires: side === "a" ? ["確かめて進みたい"] : ["試したい"],
      breakingConditions: [],
      stateVariability: null,
      confidenceByAxis: {},
    },
    alter: {
      personalityLens: null,
      recentEmotionalState: null,
      trustLevel: { level: 3, observedAt: "2026-04-18T00:00:00Z" },
      phaseState: { phase: 2, lastTransitionAt: "2026-04-01T00:00:00Z" },
      recentNarratives: [],
    },
    behavioral: {
      recentActivity: [],
      calendarContext: {
        todayDensity: "light",
        tomorrowDensity: "light",
        upcomingAnchors: [],
      },
      wearHistory: [],
    },
    context: {
      location: { residenceArea: "東京都", officeArea: null, dailyRadiusKm: 5 },
      wardrobe: null,
      styleProfile: null,
    },
  };
}

export function buildSyntheticBundle(p: SyntheticPairParams): ObservationBundle {
  const personA = buildPerson("a", p.axisProfile, p.id);
  const personB = buildPerson("b", p.axisProfile, p.id);
  const conversation = buildConversation(p, personA.identity.userId, personB.identity.userId);
  const relationship: RelationshipObservation = {
    sharedHistory: [],
    fairnessLedger: buildLedger(p),
    currentTemperature: p.celebration ? "warm" : "neutral",
    interactionPattern: { pace: "steady", initiator: "balanced", conflictStyle: "mixed" },
    unresolvedThreads: [],
    rupturesAndRepairs: [],
  };

  return {
    personA,
    personB,
    relationship,
    conversation,
    environmental: {
      timestamp: "2026-04-20T12:00:00Z",
      weather: null,
      seasonality: "spring",
      dayType: "weekday",
      timeOfDay: "afternoon",
    },
    dataFreshness: {
      perSection: {
        "personA.stargazer": "2026-04-15T10:00:00Z",
        "personB.stargazer": "2026-04-15T10:00:00Z",
        "conversation.turns": "2026-04-20T12:00:00Z",
      },
    },
    completeness: {
      personA: { stargazer: 0.6, alter: 0.2, behavioral: 0.3, context: 0.4 },
      personB: { stargazer: 0.6, alter: 0.2, behavioral: 0.3, context: 0.4 },
      relationship: p.ledgerSkew === "balanced" ? 0.2 : 0.5,
      conversation: 0.6,
      environmental: 0.4,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Pre-defined 20-case matrix (bootstrap 母数の骨格)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * bootstrap 用 20 ケース: axis profile 5 種 × fatigue × celebration × skew の代表を選択。
 * 全数展開ではなく、signal が重なる経路を優先。
 */
export function buildBootstrapMatrix(): SyntheticPairParams[] {
  const cases: SyntheticPairParams[] = [];
  let i = 0;
  const profiles: AxisProfile[] = ["A-inward", "A-outward", "mixed", "B-outward", "B-inward"];
  const fatigues: Array<"none" | "some" | "strong"> = ["none", "some", "strong"];
  const skews: Array<"balanced" | "a-favored" | "b-favored"> = ["balanced", "a-favored", "b-favored"];

  for (const profile of profiles) {
    // 各 profile につき 4 ケース
    for (const fat of fatigues) {
      cases.push({
        id: `m${String(i++).padStart(2, "0")}`,
        axisProfile: profile,
        fatigueLevel: fat,
        ledgerSkew: skews[i % 3],
        celebration: i % 5 === 0,
        energyLevel: fat === "strong" ? "low" : fat === "some" ? "mid" : "high",
      });
    }
    // 1 celebration ケース追加
    cases.push({
      id: `m${String(i++).padStart(2, "0")}`,
      axisProfile: profile,
      fatigueLevel: "none",
      ledgerSkew: skews[i % 3],
      celebration: true,
      energyLevel: "high",
    });
  }
  return cases; // 5 * 4 = 20
}
