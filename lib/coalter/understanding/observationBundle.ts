/**
 * CoAlter Stage 1 Understand — ObservationBundle 収集 adapter
 *
 * 位置づけ: docs/coalter-movie-three-stage-design.md §2.2.1 / §12.1 準拠。
 *   既存 Stargazer / Alter / CoAlter / conversation / environmental の観測を
 *   Stage 1 の `ObservationBundle` 型に **read-only** で変換する pure adapter。
 *
 * M0-1 scope:
 *   - DB / runtime への接続なし。pure 関数のみ。
 *   - 入力 (CollectorInputs) は source 側の adapter が渡す structural type。
 *     実 collector (Supabase query / Alter client fetch 等) は M0-2 以降で追加。
 *   - 出力は types.ts §1 の `ObservationBundle` 完全互換。
 *   - shadow 限定、既存 movie retrieval / narration / card schema 不触。
 *
 * [CEO lock 2026-04-20 A] このファイルでは `quote` / `summary` を
 *   落とさず保持する（narration が内部で引用するため）が、diagnostics.ts 側では
 *   これらを型レベルで弾く。本 adapter 自体は diagnostics を emit しない。
 */

import type {
  ActivityEvent,
  AlterObservation,
  ArcShape,
  BehavioralObservation,
  BundleCompleteness,
  CalendarSummary,
  ConversationObservation,
  ConversationTurn,
  DataFreshness,
  DataGapSection,
  DecisionAxis,
  EmotionalStateSummary,
  EnvironmentalObservation,
  ExtractedConstraints,
  FairnessRecord,
  HdmPhaseSummary,
  InteractionPattern,
  IsoTimestamp,
  LocationProfile,
  Moment,
  NarrativeFragment,
  ObservationBundle,
  PersonalityLensSummary,
  PersonCompleteness,
  PersonContextObservation,
  PersonObservation,
  QuestionGuardSnapshot,
  RelationalTemperature,
  RelationshipObservation,
  RuptureRepairEvent,
  StargazerObservation,
  StateVariabilityProfile,
  StyleProfileSummary,
  ThemeTag,
  TrustLevelScalar,
  UnresolvedThread,
  UserId,
  WardrobeSummary,
  WearEventSummary,
  WeatherSummary,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. CollectorInputs — 既存コードから引いてくる raw shape
//    ここで受ける型は「既存型の import」ではなく structural type。
//    理由: 既存型に adapter が拘束されると migration で壊れる + test が重くなる。
//    実 collector 側で既存型 → CollectorInputs への thin mapping を別ファイルで書く。
// ═══════════════════════════════════════════════════════════════════════════

export type CollectorInputs = {
  personA: PersonCollectorInput;
  personB: PersonCollectorInput;
  relationship: RelationshipCollectorInput;
  conversation: ConversationCollectorInput;
  environmental: EnvironmentalCollectorInput;
  /** 収集処理の開始時刻。DataFreshness 判定の基準。 */
  collectedAt: IsoTimestamp;
};

export type PersonCollectorInput = {
  userId: UserId;
  displayName: string;
  /** Stargazer 側の結果。欠損時は null。 */
  stargazer: StargazerCollectorInput | null;
  /** Alter 側の結果。欠損時は null。 */
  alter: AlterCollectorInput | null;
  /** 行動観測（Origin / Calendar / Wear）。欠損時は null。 */
  behavioral: BehavioralCollectorInput | null;
  /** 居住地 / ワードローブ / スタイル。欠損時は null。 */
  context: PersonContextCollectorInput | null;
};

export type StargazerCollectorInput = {
  /** Bayesian axis updater の BeliefSet から派生した軸スコア。 */
  axes: DecisionAxis[];
  comfortSources: string[];
  fatigueTriggers: string[];
  recoveryConditions: string[];
  unspokenDesires: string[];
  breakingConditions: string[];
  stateVariability: StateVariabilityProfile | null;
};

export type AlterCollectorInput = {
  personalityLens: PersonalityLensSummary | null;
  recentEmotionalState: EmotionalStateSummary | null;
  trustLevel: TrustLevelScalar | null;
  phaseState: HdmPhaseSummary | null;
  recentNarratives: NarrativeFragment[];
};

export type BehavioralCollectorInput = {
  recentActivity: ActivityEvent[];
  calendarContext: CalendarSummary | null;
  wearHistory: WearEventSummary[];
};

export type PersonContextCollectorInput = {
  location: LocationProfile | null;
  wardrobe: WardrobeSummary | null;
  styleProfile: StyleProfileSummary | null;
};

export type RelationshipCollectorInput = {
  sharedHistory: Moment[];
  fairnessLedger: FairnessRecord[];
  currentTemperature: RelationalTemperature | null;
  interactionPattern: InteractionPattern | null;
  unresolvedThreads: UnresolvedThread[];
  rupturesAndRepairs: RuptureRepairEvent[];
};

export type ConversationCollectorInput = {
  turns: ConversationTurn[];
  theme: ThemeTag;
  extractedConstraints: ExtractedConstraints | null;
  caringIntensity: { a: number; b: number } | null;
  implicitMood: string | null;
  energyLevel: "high" | "mid" | "low" | null;
  conversationArc: ArcShape | null;
  questionGuardState: QuestionGuardSnapshot | null;
};

export type EnvironmentalCollectorInput = {
  timestamp: IsoTimestamp;
  weather: WeatherSummary | null;
  /** 省略時は timestamp から自動判定。 */
  seasonality?: "spring" | "summer" | "autumn" | "winter";
  dayType?: "weekday" | "weekend" | "holiday";
  timeOfDay?: "morning" | "afternoon" | "evening" | "night";
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public adapter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 既存観測から ObservationBundle を組み立てる read-only adapter。
 * 副作用なし。collector 側の欠損は null / 空配列で埋め、completeness / dataFreshness
 * に反映させる。runUnderstanding() はこれを受け取って TwoPersonLensToday を返す。
 */
export function buildObservationBundle(inputs: CollectorInputs): ObservationBundle {
  const personA = composePersonObservation(inputs.personA);
  const personB = composePersonObservation(inputs.personB);
  const relationship = composeRelationshipObservation(inputs.relationship);
  const conversation = composeConversationObservation(inputs.conversation);
  const environmental = composeEnvironmentalObservation(inputs.environmental);

  return {
    personA,
    personB,
    relationship,
    conversation,
    environmental,
    dataFreshness: computeDataFreshness(inputs),
    completeness: computeCompleteness({
      personA: inputs.personA,
      personB: inputs.personB,
      relationship: inputs.relationship,
      conversation: inputs.conversation,
      environmental: inputs.environmental,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Person composers
// ═══════════════════════════════════════════════════════════════════════════

function composePersonObservation(input: PersonCollectorInput): PersonObservation {
  return {
    identity: { userId: input.userId, displayName: input.displayName },
    stargazer: composeStargazerObservation(input.stargazer),
    alter: composeAlterObservation(input.alter),
    behavioral: composeBehavioralObservation(input.behavioral),
    context: composePersonContext(input.context),
  };
}

function composeStargazerObservation(
  input: StargazerCollectorInput | null,
): StargazerObservation {
  if (!input) {
    return {
      decisionAxes: [],
      comfortSources: [],
      fatigueTriggers: [],
      recoveryConditions: [],
      unspokenDesires: [],
      breakingConditions: [],
      stateVariability: null,
      confidenceByAxis: {},
    };
  }
  const confidenceByAxis: Record<string, number> = {};
  for (const axis of input.axes) {
    confidenceByAxis[axis.key] = axis.confidence;
  }
  return {
    decisionAxes: input.axes,
    comfortSources: input.comfortSources,
    fatigueTriggers: input.fatigueTriggers,
    recoveryConditions: input.recoveryConditions,
    unspokenDesires: input.unspokenDesires,
    breakingConditions: input.breakingConditions,
    stateVariability: input.stateVariability,
    confidenceByAxis,
  };
}

function composeAlterObservation(input: AlterCollectorInput | null): AlterObservation {
  if (!input) {
    return {
      personalityLens: null,
      recentEmotionalState: null,
      trustLevel: { level: 0, observedAt: EPOCH },
      phaseState: null,
      recentNarratives: [],
    };
  }
  return {
    personalityLens: input.personalityLens,
    recentEmotionalState: input.recentEmotionalState,
    trustLevel: input.trustLevel ?? { level: 0, observedAt: EPOCH },
    phaseState: input.phaseState,
    recentNarratives: input.recentNarratives,
  };
}

function composeBehavioralObservation(
  input: BehavioralCollectorInput | null,
): BehavioralObservation {
  if (!input) {
    return { recentActivity: [], calendarContext: null, wearHistory: [] };
  }
  return {
    recentActivity: input.recentActivity,
    calendarContext: input.calendarContext,
    wearHistory: input.wearHistory,
  };
}

function composePersonContext(
  input: PersonContextCollectorInput | null,
): PersonContextObservation {
  if (!input) return { location: null, wardrobe: null, styleProfile: null };
  return {
    location: input.location,
    wardrobe: input.wardrobe,
    styleProfile: input.styleProfile,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Relationship / Conversation / Environmental composers
// ═══════════════════════════════════════════════════════════════════════════

function composeRelationshipObservation(
  input: RelationshipCollectorInput,
): RelationshipObservation {
  return {
    sharedHistory: input.sharedHistory,
    fairnessLedger: input.fairnessLedger,
    currentTemperature: input.currentTemperature ?? "neutral",
    interactionPattern: input.interactionPattern ?? {
      pace: "steady",
      initiator: "balanced",
      conflictStyle: "mixed",
    },
    unresolvedThreads: input.unresolvedThreads,
    rupturesAndRepairs: input.rupturesAndRepairs,
  };
}

function composeConversationObservation(
  input: ConversationCollectorInput,
): ConversationObservation {
  return {
    turns: input.turns,
    theme: input.theme,
    extractedConstraints: input.extractedConstraints ?? {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
    },
    caringIntensity: input.caringIntensity ?? { a: 0.5, b: 0.5 },
    implicitMood: input.implicitMood ?? "",
    energyLevel: input.energyLevel ?? "mid",
    conversationArc: input.conversationArc ?? "opening",
    questionGuardState: input.questionGuardState,
  };
}

function composeEnvironmentalObservation(
  input: EnvironmentalCollectorInput,
): EnvironmentalObservation {
  const ts = new Date(input.timestamp);
  return {
    timestamp: input.timestamp,
    weather: input.weather,
    seasonality: input.seasonality ?? inferSeasonality(ts),
    dayType: input.dayType ?? inferDayType(ts),
    timeOfDay: input.timeOfDay ?? inferTimeOfDay(ts),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Completeness & freshness
// ═══════════════════════════════════════════════════════════════════════════

function computeCompleteness(inputs: {
  personA: PersonCollectorInput;
  personB: PersonCollectorInput;
  relationship: RelationshipCollectorInput;
  conversation: ConversationCollectorInput;
  environmental: EnvironmentalCollectorInput;
}): BundleCompleteness {
  return {
    personA: personCompleteness(inputs.personA),
    personB: personCompleteness(inputs.personB),
    relationship: relationshipCompleteness(inputs.relationship),
    conversation: conversationCompleteness(inputs.conversation),
    environmental: environmentalCompleteness(inputs.environmental),
  };
}

function personCompleteness(input: PersonCollectorInput): PersonCompleteness {
  return {
    stargazer: stargazerScore(input.stargazer),
    alter: alterScore(input.alter),
    behavioral: behavioralScore(input.behavioral),
    context: contextScore(input.context),
  };
}

function stargazerScore(input: StargazerCollectorInput | null): number {
  if (!input) return 0;
  // 軸数ベース: 3軸以上で満点に近づく、confidence も加味。
  const axisCount = input.axes.length;
  const axisBreadth = clamp01(axisCount / 5);
  const avgConf =
    axisCount === 0
      ? 0
      : input.axes.reduce((s, a) => s + a.confidence, 0) / axisCount;
  const aux =
    (nonEmptyScore(input.comfortSources) +
      nonEmptyScore(input.fatigueTriggers) +
      nonEmptyScore(input.recoveryConditions)) /
    3;
  return clamp01(0.5 * axisBreadth + 0.3 * avgConf + 0.2 * aux);
}

function alterScore(input: AlterCollectorInput | null): number {
  if (!input) return 0;
  const lens = input.personalityLens ? 1 : 0;
  const emo = input.recentEmotionalState ? 1 : 0;
  const phase = input.phaseState ? 1 : 0;
  const trust = input.trustLevel ? 1 : 0;
  const narr = nonEmptyScore(input.recentNarratives);
  return clamp01((lens + emo + phase + trust + narr) / 5);
}

function behavioralScore(input: BehavioralCollectorInput | null): number {
  if (!input) return 0;
  const activity = clamp01(input.recentActivity.length / 5);
  const cal = input.calendarContext ? 1 : 0;
  const wear = clamp01(input.wearHistory.length / 3);
  return clamp01((activity + cal + wear) / 3);
}

function contextScore(input: PersonContextCollectorInput | null): number {
  if (!input) return 0;
  const loc = input.location ? 1 : 0;
  const ward = input.wardrobe ? 1 : 0;
  const style = input.styleProfile ? 1 : 0;
  return clamp01((loc + ward + style) / 3);
}

function relationshipCompleteness(input: RelationshipCollectorInput): number {
  const hist = clamp01(input.sharedHistory.length / 3);
  const fair = clamp01(input.fairnessLedger.length / 3);
  const temp = input.currentTemperature ? 1 : 0;
  const pat = input.interactionPattern ? 1 : 0;
  const rup = clamp01((input.rupturesAndRepairs.length + 1) / 2); // 0 件でも 0.5
  return clamp01((hist + fair + temp + pat + rup) / 5);
}

function conversationCompleteness(input: ConversationCollectorInput): number {
  const turns = clamp01(input.turns.length / 6);
  const theme = input.theme ? 1 : 0;
  const ec = input.extractedConstraints ? 1 : 0;
  const mood = input.implicitMood ? 1 : 0;
  const arc = input.conversationArc ? 1 : 0;
  return clamp01((turns + theme + ec + mood + arc) / 5);
}

function environmentalCompleteness(input: EnvironmentalCollectorInput): number {
  const ts = input.timestamp ? 1 : 0;
  const w = input.weather ? 1 : 0;
  // 時刻があれば season / day / time は自動推論可 → base 0.6
  return clamp01(0.6 * ts + 0.4 * w);
}

function computeDataFreshness(inputs: CollectorInputs): DataFreshness {
  const perSection: Partial<Record<DataGapSection, IsoTimestamp>> = {};

  // person 別
  assignFreshest(perSection, "personA.stargazer", stargazerObservedAt(inputs.personA.stargazer));
  assignFreshest(perSection, "personA.alter", alterObservedAt(inputs.personA.alter));
  assignFreshest(perSection, "personA.behavioral", behavioralObservedAt(inputs.personA.behavioral));
  assignFreshest(perSection, "personA.context", contextUpdatedAt(inputs.personA.context));
  assignFreshest(perSection, "personB.stargazer", stargazerObservedAt(inputs.personB.stargazer));
  assignFreshest(perSection, "personB.alter", alterObservedAt(inputs.personB.alter));
  assignFreshest(perSection, "personB.behavioral", behavioralObservedAt(inputs.personB.behavioral));
  assignFreshest(perSection, "personB.context", contextUpdatedAt(inputs.personB.context));

  // relationship
  assignFreshest(
    perSection,
    "relationship.sharedHistory",
    latestFromList(inputs.relationship.sharedHistory.map((m) => m.occurredAt)),
  );
  assignFreshest(
    perSection,
    "relationship.fairnessLedger",
    latestFromList(inputs.relationship.fairnessLedger.map((f) => f.decidedAt)),
  );
  assignFreshest(
    perSection,
    "relationship.rupturesAndRepairs",
    latestFromList(inputs.relationship.rupturesAndRepairs.map((r) => r.occurredAt)),
  );

  // conversation / environmental
  assignFreshest(
    perSection,
    "conversation.turns",
    latestFromList(inputs.conversation.turns.map((t) => t.createdAt)),
  );
  assignFreshest(perSection, "environmental", inputs.environmental.timestamp);

  return { perSection };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Helpers
// ═══════════════════════════════════════════════════════════════════════════

const EPOCH: IsoTimestamp = "1970-01-01T00:00:00.000Z";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function nonEmptyScore(list: unknown[]): number {
  return list.length > 0 ? 1 : 0;
}

function assignFreshest(
  target: Partial<Record<DataGapSection, IsoTimestamp>>,
  key: DataGapSection,
  value: IsoTimestamp | null,
): void {
  if (value) target[key] = value;
}

function latestFromList(list: IsoTimestamp[]): IsoTimestamp | null {
  if (list.length === 0) return null;
  let max = list[0];
  for (const t of list) if (t > max) max = t;
  return max;
}

function stargazerObservedAt(input: StargazerCollectorInput | null): IsoTimestamp | null {
  if (!input || input.axes.length === 0) return null;
  return latestFromList(input.axes.map((a) => a.observedAt));
}

function alterObservedAt(input: AlterCollectorInput | null): IsoTimestamp | null {
  if (!input) return null;
  const candidates: IsoTimestamp[] = [];
  if (input.personalityLens) candidates.push(input.personalityLens.lastUpdated);
  if (input.recentEmotionalState) candidates.push(input.recentEmotionalState.observedAt);
  if (input.trustLevel) candidates.push(input.trustLevel.observedAt);
  if (input.phaseState) candidates.push(input.phaseState.lastTransitionAt);
  for (const n of input.recentNarratives) candidates.push(n.observedAt);
  return latestFromList(candidates);
}

function behavioralObservedAt(
  input: BehavioralCollectorInput | null,
): IsoTimestamp | null {
  if (!input) return null;
  const candidates: IsoTimestamp[] = [];
  for (const a of input.recentActivity) candidates.push(a.occurredAt);
  for (const w of input.wearHistory) candidates.push(w.date);
  return latestFromList(candidates);
}

function contextUpdatedAt(input: PersonContextCollectorInput | null): IsoTimestamp | null {
  if (!input?.styleProfile) return null;
  return input.styleProfile.updatedAt;
}

function inferSeasonality(ts: Date): "spring" | "summer" | "autumn" | "winter" {
  const m = ts.getMonth(); // 0-11
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

function inferDayType(ts: Date): "weekday" | "weekend" | "holiday" {
  const d = ts.getDay(); // 0=Sun, 6=Sat
  if (d === 0 || d === 6) return "weekend";
  return "weekday";
}

function inferTimeOfDay(ts: Date): "morning" | "afternoon" | "evening" | "night" {
  const h = ts.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}
