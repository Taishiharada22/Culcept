/**
 * CoAlter Stage 1 Understand — 代表 fixture 2 件
 *
 * 用途:
 *   - personFusion / relationalFusion の単体検証
 *   - U1〜U5 KPI 計測の baseline
 *   - CEO 報告での入出力サンプル
 *
 * 完全決定論のため、fixture にも現在時刻を使わない（全て固定 ISO 文字列）。
 */

import type {
  ConversationObservation,
  ObservationBundle,
  PersonObservation,
  RelationshipObservation,
  UserId,
} from "@/lib/coalter/understanding/types";

const USER_A = "u_aoi_2026" as UserId;
const USER_B = "u_ren_2026" as UserId;
const USER_C = "u_new_pair_x" as UserId;
const USER_D = "u_new_pair_y" as UserId;

// ═══════════════════════════════════════════════════════════════════════════
// Fixture 1: 成熟ペア（観測豊富）
//   2 年越しのペア。Stargazer 6 軸以上観測済み、Alter 5 lens 揃い、
//   関係史も fairness ledger も厚い。understanding_confidence は 0.7 以上を想定。
// ═══════════════════════════════════════════════════════════════════════════

const MATURE_PERSON_A: PersonObservation = {
  identity: { userId: USER_A, displayName: "Aoi" },
  stargazer: {
    decisionAxes: [
      { key: "caution_vs_stimulus", value: -0.62, confidence: 0.71, observedAt: "2026-04-15T10:00:00Z" },
      { key: "plan_vs_emergence", value: -0.55, confidence: 0.68, observedAt: "2026-04-12T22:30:00Z" },
      { key: "solo_vs_social", value: -0.48, confidence: 0.6, observedAt: "2026-04-10T19:20:00Z" },
      { key: "speed_vs_precision", value: -0.4, confidence: 0.55, observedAt: "2026-04-08T09:10:00Z" },
      { key: "intensity_vs_calm", value: -0.7, confidence: 0.65, observedAt: "2026-04-05T14:00:00Z" },
      { key: "intellect_vs_emotion", value: 0.3, confidence: 0.3, observedAt: "2026-04-02T11:40:00Z" }, // conf 低で弾かれる
    ],
    comfortSources: ["朝の静けさ", "予定が整っている日"],
    fatigueTriggers: ["予定変更", "人混み"],
    recoveryConditions: ["7h以上の睡眠", "1人の散歩"],
    unspokenDesires: ["本当は確かめて進みたい"],
    breakingConditions: ["遅刻への急かし"],
    stateVariability: null,
    confidenceByAxis: {},
  },
  alter: {
    personalityLens: {
      lensesByKey: {
        affect: "穏やかさを基調に、強度の高い刺激で一度退く",
        parts: "守る側の Part が前に出やすい",
        mentalization: "相手の意図を一度言語化してから応答",
        body: "肩に緊張が溜まる、呼吸が浅くなる傾向",
        narrative: "「無理をしない自分」が最近の語り",
      },
      lastUpdated: "2026-04-16T08:00:00Z",
    },
    recentEmotionalState: {
      dominantAffect: "落ち着き",
      intensity: 0.55,
      observedAt: "2026-04-18T20:00:00Z",
    },
    trustLevel: { level: 4, observedAt: "2026-04-18T20:00:00Z" },
    phaseState: { phase: 3, lastTransitionAt: "2026-04-01T00:00:00Z" },
    recentNarratives: [
      { kind: "reflection", summary: "急かされると自分が崩れる", observedAt: "2026-04-17T22:00:00Z" },
      { kind: "intention", summary: "今月は整える方に寄せる", observedAt: "2026-04-14T23:00:00Z" },
    ],
  },
  behavioral: {
    recentActivity: [
      { kind: "origin_diary", summary: "朝散歩して落ち着いた", occurredAt: "2026-04-18T07:30:00Z" },
      { kind: "mood_note", summary: "夕方疲れた", occurredAt: "2026-04-17T18:40:00Z" },
    ],
    calendarContext: {
      todayDensity: "light",
      tomorrowDensity: "light",
      upcomingAnchors: [{ title: "歯科", startAt: "2026-04-22T10:00:00Z" }],
    },
    wearHistory: [
      { date: "2026-04-18", moodTag: "calm", outfitTag: "neutral" },
      { date: "2026-04-17", moodTag: "tired", outfitTag: "loose" },
    ],
  },
  context: {
    location: { residenceArea: "東京都世田谷区", officeArea: "渋谷", dailyRadiusKm: 5 },
    wardrobe: { itemCount: 48, dominantStyles: ["soft neutral", "minimal"] },
    styleProfile: { archetype: "soft-minimalist", updatedAt: "2026-04-10T00:00:00Z" },
  },
};

const MATURE_PERSON_B: PersonObservation = {
  identity: { userId: USER_B, displayName: "Ren" },
  stargazer: {
    decisionAxes: [
      { key: "caution_vs_stimulus", value: 0.58, confidence: 0.66, observedAt: "2026-04-14T10:00:00Z" },
      { key: "novelty_vs_familiarity", value: 0.5, confidence: 0.6, observedAt: "2026-04-13T10:00:00Z" },
      { key: "speed_vs_precision", value: 0.45, confidence: 0.58, observedAt: "2026-04-11T10:00:00Z" },
      { key: "solo_vs_social", value: 0.52, confidence: 0.6, observedAt: "2026-04-09T10:00:00Z" },
      { key: "plan_vs_emergence", value: 0.4, confidence: 0.5, observedAt: "2026-04-06T10:00:00Z" },
    ],
    comfortSources: ["新しい場所", "会話の盛り上がり"],
    fatigueTriggers: ["同じ場所の反復", "段取り詰め"],
    recoveryConditions: ["外での運動", "誰かと食事"],
    unspokenDesires: ["もっと試したい"],
    breakingConditions: ["予定縛り"],
    stateVariability: null,
    confidenceByAxis: {},
  },
  alter: {
    personalityLens: {
      lensesByKey: {
        affect: "外に開くほうが整う",
        parts: "探索する Part が強い",
        mentalization: "相手の気配に素早く反応",
        body: "動いていると体調が良い",
        narrative: "「変化の中に自分がいる」",
      },
      lastUpdated: "2026-04-16T08:00:00Z",
    },
    recentEmotionalState: {
      dominantAffect: "好奇心",
      intensity: 0.65,
      observedAt: "2026-04-18T20:00:00Z",
    },
    trustLevel: { level: 4, observedAt: "2026-04-18T20:00:00Z" },
    phaseState: { phase: 3, lastTransitionAt: "2026-04-01T00:00:00Z" },
    recentNarratives: [
      { kind: "self_description", summary: "反復が続くと手が止まる", observedAt: "2026-04-16T10:00:00Z" },
    ],
  },
  behavioral: {
    recentActivity: [
      { kind: "origin_diary", summary: "新しいカフェに入った", occurredAt: "2026-04-18T15:00:00Z" },
    ],
    calendarContext: {
      todayDensity: "medium",
      tomorrowDensity: "light",
      upcomingAnchors: [],
    },
    wearHistory: [{ date: "2026-04-18", moodTag: "curious", outfitTag: "bright" }],
  },
  context: {
    location: { residenceArea: "東京都渋谷区", officeArea: "渋谷", dailyRadiusKm: 8 },
    wardrobe: { itemCount: 62, dominantStyles: ["sporty", "color accent"] },
    styleProfile: { archetype: "explorer", updatedAt: "2026-04-08T00:00:00Z" },
  },
};

const MATURE_RELATIONSHIP: RelationshipObservation = {
  sharedHistory: [
    { kind: "shared_trip", summary: "箱根一泊（落ち着いて過ごした）", occurredAt: "2026-03-08T00:00:00Z" },
    { kind: "conflict_repaired", summary: "予定変更で揉めて、その夜に話して解消", occurredAt: "2026-03-22T00:00:00Z" },
  ],
  fairnessLedger: [
    { sessionId: "s1", decidedAt: "2026-04-12T18:00:00Z", skew: -0.4, topic: "movie" },
    { sessionId: "s2", decidedAt: "2026-04-05T19:00:00Z", skew: 0.3, topic: "food" },
    { sessionId: "s3", decidedAt: "2026-03-29T18:30:00Z", skew: -0.5, topic: "movie" },
  ],
  currentTemperature: "warm",
  interactionPattern: { pace: "steady", initiator: "b", conflictStyle: "engage" },
  unresolvedThreads: [],
  rupturesAndRepairs: [
    { kind: "repair", summary: "3/22 の予定変更件は合意済み", occurredAt: "2026-03-22T23:00:00Z" },
  ],
};

const MATURE_CONVERSATION: ConversationObservation = {
  turns: [
    { senderId: USER_B, body: "金曜どこ行く？", createdAt: "2026-04-20T12:00:00Z" },
    { senderId: USER_A, body: "近場で落ち着けるところがいいな", createdAt: "2026-04-20T12:01:00Z" },
    { senderId: USER_B, body: "新しい場所も気になってるんだけどね", createdAt: "2026-04-20T12:02:00Z" },
    { senderId: USER_A, body: "疲れてるから座れるとこ希望", createdAt: "2026-04-20T12:03:00Z" },
  ],
  theme: "food",
  extractedConstraints: {
    date: "2026-04-24",
    location: "渋谷",
    budget: null,
    timeSlot: "evening",
    preferences: ["座れる", "落ち着ける"],
  },
  caringIntensity: { a: 0.35, b: 0.55 },
  implicitMood: "A は疲労、B は探索気分",
  energyLevel: "mid",
  conversationArc: "expanding",
  questionGuardState: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// Fixture 2: 新規ペア（観測薄い）
//   出会って 2 週間、Stargazer は 2 軸のみ、Alter は personalityLens 欠損。
//   関係史も空。understanding_confidence は 0.3 前後を想定。
//   degrade が正しく効くことを検証する用。
// ═══════════════════════════════════════════════════════════════════════════

const SPARSE_PERSON_A: PersonObservation = {
  identity: { userId: USER_C, displayName: "Sora" },
  stargazer: {
    decisionAxes: [
      { key: "novelty_vs_familiarity", value: 0.42, confidence: 0.32, observedAt: "2026-04-17T10:00:00Z" }, // conf 低で弾かれる
      { key: "intensity_vs_calm", value: -0.3, confidence: 0.38, observedAt: "2026-04-15T10:00:00Z" }, // value 弱で弾かれる
    ],
    comfortSources: [],
    fatigueTriggers: [],
    recoveryConditions: [],
    unspokenDesires: [],
    breakingConditions: [],
    stateVariability: null,
    confidenceByAxis: {},
  },
  alter: {
    personalityLens: null,
    recentEmotionalState: null,
    trustLevel: { level: 1, observedAt: "2026-04-18T00:00:00Z" },
    phaseState: { phase: 0, lastTransitionAt: "2026-04-06T00:00:00Z" },
    recentNarratives: [],
  },
  behavioral: {
    recentActivity: [],
    calendarContext: null,
    wearHistory: [],
  },
  context: {
    location: { residenceArea: "東京都品川区", officeArea: null, dailyRadiusKm: null },
    wardrobe: null,
    styleProfile: null,
  },
};

const SPARSE_PERSON_B: PersonObservation = {
  identity: { userId: USER_D, displayName: "Mio" },
  stargazer: {
    decisionAxes: [],
    comfortSources: [],
    fatigueTriggers: [],
    recoveryConditions: [],
    unspokenDesires: [],
    breakingConditions: [],
    stateVariability: null,
    confidenceByAxis: {},
  },
  alter: {
    personalityLens: null,
    recentEmotionalState: null,
    trustLevel: { level: 1, observedAt: "2026-04-18T00:00:00Z" },
    phaseState: null,
    recentNarratives: [],
  },
  behavioral: {
    recentActivity: [],
    calendarContext: null,
    wearHistory: [],
  },
  context: {
    location: null,
    wardrobe: null,
    styleProfile: null,
  },
};

const SPARSE_RELATIONSHIP: RelationshipObservation = {
  sharedHistory: [],
  fairnessLedger: [],
  currentTemperature: "neutral",
  interactionPattern: { pace: "steady", initiator: "balanced", conflictStyle: "mixed" },
  unresolvedThreads: [],
  rupturesAndRepairs: [],
};

const SPARSE_CONVERSATION: ConversationObservation = {
  turns: [
    { senderId: USER_C, body: "何かしたいね", createdAt: "2026-04-20T11:00:00Z" },
    { senderId: USER_D, body: "だね", createdAt: "2026-04-20T11:01:00Z" },
  ],
  theme: null,
  extractedConstraints: {
    date: null,
    location: null,
    budget: null,
    timeSlot: null,
    preferences: [],
  },
  caringIntensity: { a: 0.5, b: 0.5 },
  implicitMood: "",
  energyLevel: "mid",
  conversationArc: "opening",
  questionGuardState: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// Bundles（fusion 以降で組み合わせて使う場合用）
// ═══════════════════════════════════════════════════════════════════════════

export const MATURE_PAIR = {
  personA: MATURE_PERSON_A,
  personB: MATURE_PERSON_B,
  relationship: MATURE_RELATIONSHIP,
  conversation: MATURE_CONVERSATION,
} as const;

export const SPARSE_PAIR = {
  personA: SPARSE_PERSON_A,
  personB: SPARSE_PERSON_B,
  relationship: SPARSE_RELATIONSHIP,
  conversation: SPARSE_CONVERSATION,
} as const;

export const MATURE_BUNDLE: ObservationBundle = {
  personA: MATURE_PAIR.personA,
  personB: MATURE_PAIR.personB,
  relationship: MATURE_PAIR.relationship,
  conversation: MATURE_PAIR.conversation,
  environmental: {
    timestamp: "2026-04-20T12:00:00Z",
    weather: { condition: "cloudy", temperatureC: 18 },
    seasonality: "spring",
    dayType: "weekday",
    timeOfDay: "afternoon",
  },
  dataFreshness: { perSection: {} },
  completeness: {
    personA: { stargazer: 0.82, alter: 0.8, behavioral: 0.66, context: 1.0 },
    personB: { stargazer: 0.75, alter: 0.7, behavioral: 0.33, context: 0.66 },
    relationship: 0.72,
    conversation: 0.8,
    environmental: 1.0,
  },
};

export const SPARSE_BUNDLE: ObservationBundle = {
  personA: SPARSE_PAIR.personA,
  personB: SPARSE_PAIR.personB,
  relationship: SPARSE_PAIR.relationship,
  conversation: SPARSE_PAIR.conversation,
  environmental: {
    timestamp: "2026-04-20T11:05:00Z",
    weather: null,
    seasonality: "spring",
    dayType: "weekday",
    timeOfDay: "morning",
  },
  dataFreshness: { perSection: {} },
  completeness: {
    personA: { stargazer: 0.2, alter: 0.1, behavioral: 0.0, context: 0.33 },
    personB: { stargazer: 0.0, alter: 0.1, behavioral: 0.0, context: 0.0 },
    relationship: 0.2,
    conversation: 0.5,
    environmental: 0.6,
  },
};
