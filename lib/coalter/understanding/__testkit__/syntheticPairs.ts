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
  /**
   * [M0-6A lock] 明示的な mode signal 制御。指定時は buildConversation で反映する。
   *   caringGap: 0.0-1.0 の絶対差。>= 0.2 で rule-based が "connect" に倒す。
   *   arcOverride: 指定時は conversationArc を固定する（celebration とは別口）。
   *   temperature: relationship.currentTemperature の固定値。
   */
  caringGap?: number;
  arcOverride?: "opening" | "expanding" | "converging" | "closing";
  temperature?: "warm" | "cool" | "neutral" | "tense";
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
  turns.push({
    senderId: userB,
    body: "どうしようか",
    createdAt: "2026-04-20T12:03:00Z",
  });

  // [M0-6A] caring gap の設定。caringGap 指定時は a に寄せる形で非対称を生成。
  const gap = p.caringGap ?? 0.1; // default は従来と等価 (0.4 / 0.5)
  const caringA = 0.5 - gap / 2;
  const caringB = 0.5 + gap / 2;

  // [M0-6A] arc の決定順: arcOverride > celebration (expanding) > default (opening)
  const arc: ConversationObservation["conversationArc"] =
    p.arcOverride ?? (p.celebration ? "expanding" : "opening");

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
    caringIntensity: { a: caringA, b: caringB },
    implicitMood: p.celebration ? "祝祭の気配" : "",
    energyLevel: p.energyLevel,
    conversationArc: arc,
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

// ═══════════════════════════════════════════════════════════════════════════
// 6. Extended 50-case matrix (M0-6A): 5 mode × 10 件で直交化
// ═══════════════════════════════════════════════════════════════════════════

/**
 * [CEO lock 2026-04-20 M0-6A]
 *   rule-based todayReader の mode cascade (recover > celebrate > challenge > connect > maintain)
 *   に合わせ、各 mode で最低 10 件の母数を確保する。
 *
 *   bootstrap 20 件では connect/challenge が 0 件だった反省の上書き。
 *   mode ごとの trigger 条件:
 *     recover   : energyLevel=low OR fatigueLevel∈{some,strong}
 *     celebrate : celebration=true かつ上記 recover 条件非該当
 *     challenge : 両者 ren-leaning (profile∈{A-outward,B-outward}) かつ arc=expanding
 *                  かつ fatigueLevel=none かつ celebration=false
 *     connect   : caringGap>=0.3 かつ上記全て非該当 (arc を opening/converging に寄せる)
 *     maintain  : 上記全て非該当（中立パラメタ）
 */
export function buildExtendedMatrix(): SyntheticPairParams[] {
  const cases: SyntheticPairParams[] = [];
  const profiles: AxisProfile[] = ["A-inward", "A-outward", "mixed", "B-outward", "B-inward"];
  const skews: Array<"balanced" | "a-favored" | "b-favored"> = ["balanced", "a-favored", "b-favored"];
  const challengeProfiles: AxisProfile[] = ["A-outward", "B-outward"];
  // connect: challenge に倒れないよう ren-leaning 両立を避ける
  const nonChallengeProfiles: AxisProfile[] = ["A-inward", "mixed", "B-inward"];

  // ── recover × 10 ────────────────────────────────────────────────
  // 半分は energyLevel=low、半分は fatigueLevel 強で発火
  for (let k = 0; k < 10; k++) {
    const profile = profiles[k % profiles.length];
    const useEnergy = k < 5;
    cases.push({
      id: `rec${String(k).padStart(2, "0")}`,
      axisProfile: profile,
      fatigueLevel: useEnergy ? "none" : k % 2 === 0 ? "some" : "strong",
      ledgerSkew: skews[k % 3],
      celebration: false,
      energyLevel: useEnergy ? "low" : "mid",
    });
  }

  // ── celebrate × 10 ──────────────────────────────────────────────
  for (let k = 0; k < 10; k++) {
    const profile = profiles[k % profiles.length];
    cases.push({
      id: `cel${String(k).padStart(2, "0")}`,
      axisProfile: profile,
      fatigueLevel: "none",
      ledgerSkew: skews[k % 3],
      celebration: true,
      energyLevel: k % 2 === 0 ? "high" : "mid",
    });
  }

  // ── challenge × 10 ──────────────────────────────────────────────
  for (let k = 0; k < 10; k++) {
    const profile = challengeProfiles[k % challengeProfiles.length];
    cases.push({
      id: `cha${String(k).padStart(2, "0")}`,
      axisProfile: profile,
      fatigueLevel: "none",
      ledgerSkew: skews[k % 3],
      celebration: false,
      energyLevel: k % 2 === 0 ? "high" : "mid",
      arcOverride: "expanding",
      // caringGap はデフォルト (0.1) のままで connect には倒さない
    });
  }

  // ── connect × 10 ────────────────────────────────────────────────
  // challenge を避けるため non-challenge profile を使う
  // （A-outward/B-outward で arc=expanding にならない形にしたいが、
  //  arc のデフォルトが "opening" なので profile を絞るだけで十分）
  for (let k = 0; k < 10; k++) {
    const profile = nonChallengeProfiles[k % nonChallengeProfiles.length];
    cases.push({
      id: `con${String(k).padStart(2, "0")}`,
      axisProfile: profile,
      fatigueLevel: "none",
      ledgerSkew: skews[k % 3],
      celebration: false,
      energyLevel: k % 2 === 0 ? "high" : "mid",
      caringGap: 0.3 + (k % 3) * 0.1, // 0.3 / 0.4 / 0.5
      arcOverride: "opening",
    });
  }

  // ── maintain × 10 ───────────────────────────────────────────────
  // 全て中立: 疲労なし / 祝祭なし / caringGap 小 / arc=opening
  for (let k = 0; k < 10; k++) {
    const profile = nonChallengeProfiles[k % nonChallengeProfiles.length];
    cases.push({
      id: `mai${String(k).padStart(2, "0")}`,
      axisProfile: profile,
      fatigueLevel: "none",
      ledgerSkew: skews[k % 3],
      celebration: false,
      energyLevel: k % 2 === 0 ? "high" : "mid",
      caringGap: 0.1,
      arcOverride: "opening",
    });
  }

  return cases; // 5 * 10 = 50
}
