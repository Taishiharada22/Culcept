/**
 * CoAlter Stage 1 Understand — 型定義（ドメイン非依存）
 *
 * 位置づけ: docs/coalter-movie-two-stage-design.md §2.2 / §12.2 に準拠。
 *   Stage 1 Understand は movie / food / travel / gift 全ドメインで共有する
 *   「2人理解」基盤。このファイルは Input (ObservationBundle) と Output
 *   (TwoPersonLensToday) の完全型のみを定義する。実装ロジックは同ディレクトリ
 *   の別ファイルで段階的に追加する。
 *
 * M0 scope:
 *   - 本ファイルは型のみ。runtime 実装無し
 *   - 既存 movie retrieval / narration / card schema / preview metadata には接続しない
 *   - shadow 限定、feat/baseline-edit には merge しない
 *
 * 外部型への依存: なし（structural type で自己完結）。将来
 *   Stargazer / Alter 既存型と合流させる時は同ディレクトリの
 *   `observationBundle.ts` の adapter で変換する。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 0. Primitive / Shared
// ═══════════════════════════════════════════════════════════════════════════

/** User 識別子の branded type。外部の既存 userId 文字列を assert する。 */
export type UserId = string & { readonly __brand: "UserId" };

/** ISO 8601 timestamp。 */
export type IsoTimestamp = string;

export type LensVersion = "1.0.0";

// ═══════════════════════════════════════════════════════════════════════════
// 1. ObservationBundle — Stage 1 の Input
//    Alter / Stargazer / CoAlter / 今の会話 / 環境 を構造化して受け取る。
//    「ユーザーから得られるもの全てが情報」を表現する。
// ═══════════════════════════════════════════════════════════════════════════

export type ObservationBundle = {
  personA: PersonObservation;
  personB: PersonObservation;
  relationship: RelationshipObservation;
  conversation: ConversationObservation;
  environmental: EnvironmentalObservation;

  /** どの観測がいつ時点のデータか。stale 検知用。 */
  dataFreshness: DataFreshness;

  /**
   * 各セクションの観測密度 0-1。欠損耐性のため understanding_confidence 算出に使う。
   * 新規ペア・初回ユーザーでは低くなるが、それを理由に落とさない。
   */
  completeness: BundleCompleteness;
};

// ─── 1.1 PersonObservation ───────────────────────────────────────────────

export type PersonObservation = {
  identity: { userId: UserId; displayName: string };
  stargazer: StargazerObservation;
  alter: AlterObservation;
  behavioral: BehavioralObservation;
  context: PersonContextObservation;
};

/** Stargazer 由来の判断原理層。既存 Stargazer 型の「要約 view」として取り込む。 */
export type StargazerObservation = {
  decisionAxes: DecisionAxis[];
  comfortSources: string[];
  fatigueTriggers: string[];
  recoveryConditions: string[];
  unspokenDesires: string[];
  breakingConditions: string[];
  stateVariability: StateVariabilityProfile | null;
  /** 軸ごとの観測信頼度 0-1。薄い軸は narration で引用させない判断に使う。 */
  confidenceByAxis: Record<string, number>;
};

export type DecisionAxis = {
  key: string;                  // ex: "caution_vs_stimulus"
  value: number;                // -1..1
  confidence: number;           // 0..1
  observedAt: IsoTimestamp;
};

export type StateVariabilityProfile = {
  /** 疲労時 / 社交後 / 睡眠不足時 等の状態タグと、判断軸の変動方向 */
  shifts: Array<{ stateTag: string; axisKey: string; shift: number }>;
};

/** Alter 由来の personality lens + 心の状態。 */
export type AlterObservation = {
  personalityLens: PersonalityLensSummary | null;
  recentEmotionalState: EmotionalStateSummary | null;
  trustLevel: TrustLevelScalar;
  phaseState: HdmPhaseSummary | null;
  recentNarratives: NarrativeFragment[];
};

export type PersonalityLensSummary = {
  /** Alter の 5 レンズ (affect / parts / mentalization / body / narrative) 要約。 */
  lensesByKey: Record<string, string>;
  lastUpdated: IsoTimestamp;
};

export type EmotionalStateSummary = {
  dominantAffect: string;       // 「落ち着き」「揺らぎ」等
  intensity: number;            // 0-1
  observedAt: IsoTimestamp;
};

export type TrustLevelScalar = {
  level: number;                // 0-5
  observedAt: IsoTimestamp;
};

export type HdmPhaseSummary = {
  phase: number;                // 0-5
  lastTransitionAt: IsoTimestamp;
};

export type NarrativeFragment = {
  kind: "self_description" | "reflection" | "intention";
  summary: string;              // 短文
  observedAt: IsoTimestamp;
};

/** 行動観測（Origin 日記 / Calendar / 着用履歴）。 */
export type BehavioralObservation = {
  recentActivity: ActivityEvent[];
  calendarContext: CalendarSummary | null;
  wearHistory: WearEventSummary[];
};

export type ActivityEvent = {
  kind: string;                 // ex: "origin_diary", "mood_note"
  summary: string;
  occurredAt: IsoTimestamp;
};

export type CalendarSummary = {
  todayDensity: "empty" | "light" | "medium" | "heavy";
  tomorrowDensity: "empty" | "light" | "medium" | "heavy";
  upcomingAnchors: Array<{ title: string; startAt: IsoTimestamp }>;
};

export type WearEventSummary = {
  date: IsoTimestamp;
  moodTag: string | null;
  outfitTag: string | null;
};

/** 環境情報（居住地・ワードローブ・スタイルプロフィール）。 */
export type PersonContextObservation = {
  location: LocationProfile | null;
  wardrobe: WardrobeSummary | null;
  styleProfile: StyleProfileSummary | null;
};

export type LocationProfile = {
  residenceArea: string;        // 都道府県 or 主要エリア名
  officeArea: string | null;
  dailyRadiusKm: number | null;
};

export type WardrobeSummary = {
  itemCount: number;
  dominantStyles: string[];
};

export type StyleProfileSummary = {
  archetype: string | null;
  updatedAt: IsoTimestamp;
};

// ─── 1.2 RelationshipObservation ─────────────────────────────────────────

export type RelationshipObservation = {
  sharedHistory: Moment[];
  fairnessLedger: FairnessRecord[];
  currentTemperature: RelationalTemperature;
  interactionPattern: InteractionPattern;
  unresolvedThreads: UnresolvedThread[];
  rupturesAndRepairs: RuptureRepairEvent[];
};

export type RelationalTemperature = "warm" | "neutral" | "cool";

export type Moment = {
  kind: string;                 // ex: "shared_trip", "conflict_repaired"
  summary: string;
  occurredAt: IsoTimestamp;
};

export type FairnessRecord = {
  sessionId: string;
  decidedAt: IsoTimestamp;
  /** 「どちらに寄った」か。-1..1 で a 寄り〜b 寄り。 */
  skew: number;
  topic: string;                // ex: "movie", "food"
};

export type InteractionPattern = {
  pace: "quick" | "steady" | "slow";
  initiator: "a" | "b" | "balanced";
  conflictStyle: "engage" | "avoid" | "mixed";
};

export type UnresolvedThread = {
  topic: string;
  since: IsoTimestamp;
};

export type RuptureRepairEvent = {
  kind: "rupture" | "repair";
  summary: string;
  occurredAt: IsoTimestamp;
};

// ─── 1.3 ConversationObservation ─────────────────────────────────────────

export type ConversationObservation = {
  turns: ConversationTurn[];
  theme: ThemeTag;
  extractedConstraints: ExtractedConstraints;
  caringIntensity: { a: number; b: number };
  implicitMood: string;
  energyLevel: "high" | "mid" | "low";
  conversationArc: ArcShape;
  questionGuardState: QuestionGuardSnapshot | null;
};

export type ConversationTurn = {
  senderId: UserId;
  body: string;
  createdAt: IsoTimestamp;
};

export type ThemeTag = "movie" | "food" | "travel" | "gift" | "other" | null;

export type ExtractedConstraints = {
  date: string | null;
  location: string | null;
  budget: string | null;
  timeSlot: string | null;
  preferences: string[];
};

export type ArcShape = "opening" | "expanding" | "converging" | "closing";

export type QuestionGuardSnapshot = {
  askedRecently: string[];
  silencedUntil: IsoTimestamp | null;
};

// ─── 1.4 EnvironmentalObservation ────────────────────────────────────────

export type EnvironmentalObservation = {
  timestamp: IsoTimestamp;
  weather: WeatherSummary | null;
  seasonality: "spring" | "summer" | "autumn" | "winter";
  dayType: "weekday" | "weekend" | "holiday";
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
};

export type WeatherSummary = {
  condition: string;            // "sunny" | "rainy" etc
  temperatureC: number | null;
};

// ─── 1.5 Bundle meta ─────────────────────────────────────────────────────

export type DataFreshness = {
  /** セクション毎の最終観測時刻。stale 判定の入力。 */
  perSection: Partial<Record<DataGapSection, IsoTimestamp>>;
};

export type BundleCompleteness = {
  personA: PersonCompleteness;
  personB: PersonCompleteness;
  relationship: number;         // 0-1
  conversation: number;
  environmental: number;
};

export type PersonCompleteness = {
  stargazer: number;            // 0-1
  alter: number;
  behavioral: number;
  context: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. TwoPersonLensToday — Stage 1 の Output
//    narration が「由来」を持って書けるように sourcedFrom を必ず保持する。
// ═══════════════════════════════════════════════════════════════════════════

export type TwoPersonLensToday = {
  personalLenses: { a: PersonalLens; b: PersonalLens };
  relationalLens: RelationalLens;
  todayReading: TodayReading;
  fairnessAdjustment: FairnessAdjustment;
  understanding_confidence: number;   // 0-1
  dataGaps: DataGapSection[];         // section 名のみ、内容テキスト無し
  computedAt: IsoTimestamp;
  lensVersion: LensVersion;
};

// ─── 2.1 PersonalLens ────────────────────────────────────────────────────

export type PersonalLens = {
  userId: UserId;
  displayName: string;
  coreDecisionPrinciples: string[];   // 3-5 本
  currentEmotionalHue: string;        // 1 文
  todaySensitivities: string[];       // 0-5 本
  comfortPathways: string[];          // 2-4 本
  sourcedFrom: PersonalLensSources;
};

export type PersonalLensSources = {
  stargazer: StargazerSourceRef[];
  alter: AlterSourceRef[];
  behavioral: BehavioralSourceRef[];
};

/**
 * [CEO lock 2026-04-20 A] `quote` は Stage 2 narration 生成の内部でのみ参照可。
 * diagnostics / 永続ログ / KPI SQL / analytics event には載せない。
 * M0 で許可されるのは source category / observedAt / source key / coverage count まで。
 */
export type StargazerSourceRef = {
  axisKey: string;
  axisValue: number;                  // -1..1
  observedAt: IsoTimestamp;
  /** 元質問の凝縮（10-40 字）。narration 内部専用、ログ・diagnostics 禁止。 */
  quote: string | null;
};

/**
 * [CEO lock 2026-04-20 A] `summary` は生テキスト相当 → narration 内部専用。
 * diagnostics / ログ / KPI には出さず、Alter の lens カテゴリ名と観測日時のみ集計。
 */
export type AlterSourceRef = {
  lensKey: string;                    // affect / parts / mentalization / body / narrative
  summary: string;                    // narration 内部専用、ログ・diagnostics 禁止
  observedAt: IsoTimestamp;
};

/**
 * [CEO lock 2026-04-20 A] `summary` は生テキスト相当 → narration 内部専用。
 * diagnostics / ログ / KPI には kind と observedAt のみ集計する。
 */
export type BehavioralSourceRef = {
  kind: "origin_diary" | "calendar" | "wear_event";
  summary: string;                    // narration 内部専用、ログ・diagnostics 禁止
  observedAt: IsoTimestamp;
};

// ─── 2.2 RelationalLens ──────────────────────────────────────────────────

export type RelationalLens = {
  temperature: RelationalTemperature;
  dominantDynamic: string;            // 「今日は A が主導、B が共感受容」等
  careAxes: string[];                 // 「B の疲労への配慮」等
  avoidElements: string[];            // veto 合流
  interactionPace: "quick" | "steady" | "slow";
};

// ─── 2.3 TodayReading ────────────────────────────────────────────────────

export type TodayMode =
  | "recover"       // 整える
  | "celebrate"     // 祝う・膨らむ
  | "connect"       // 近づく
  | "challenge"     // 挑む・刺激
  | "maintain";     // 平常

export type TodayReading = {
  mode: TodayMode;
  energyBudget: "high" | "mid" | "low";
  timeBudget: "ample" | "limited" | "tight";
  implicitIntent: string;             // 推測された真意 1 文
  latentNeeds: string[];              // 0-3 本
  confidence: number;                 // 0-1（LLM 自己報告）
};

// ─── 2.4 FairnessAdjustment ──────────────────────────────────────────────

export type FairnessAdjustment = {
  favorSide: "a" | "b" | null;
  rationale: string | null;           // narration 引用可能
  strength: number;                   // 0-1
  basedOnSessionCount: number;
};

// ─── 2.5 DataGapSection ──────────────────────────────────────────────────
// 欠損セクション名の enum。ログにはこれだけ出す。

export type DataGapSection =
  | "personA.stargazer"
  | "personA.alter"
  | "personA.behavioral"
  | "personA.context"
  | "personB.stargazer"
  | "personB.alter"
  | "personB.behavioral"
  | "personB.context"
  | "relationship.sharedHistory"
  | "relationship.fairnessLedger"
  | "relationship.rupturesAndRepairs"
  | "conversation.turns"
  | "environmental";

// ═══════════════════════════════════════════════════════════════════════════
// 3. Diagnostics — §11.C + [CEO lock 2026-04-20 A] 準拠。
//    個人情報 / 生テキスト / quote / summary を一切吐かない。
//    許可されるのは集約値のみ: outcome, confidence, completeness,
//    source category count, observedAt 集約, latency, missing_domains, pairHash。
// ═══════════════════════════════════════════════════════════════════════════

export type UnderstandingOutcome = "success" | "degraded" | "failed";

/**
 * [CoAlter] understanding.diagnostics の payload 型。
 * 許可フィールドのみ。生テキスト / displayName / utterance / narrative は吐かない。
 */
export type UnderstandingDiagnostics = {
  outcome: UnderstandingOutcome;
  lensVersion: LensVersion;
  understanding_confidence: number;   // 0-1
  completeness: BundleCompleteness;
  source_coverage: SourceCoverage;
  latency_ms: LatencyBreakdown;
  missing_domains: DataGapSection[];
  computedAt: IsoTimestamp;
  /** 匿名化済みペア識別子（hash）。userId は吐かない。 */
  pairHash: string;
};

export type SourceCoverage = {
  a: PersonSourceCoverage;
  b: PersonSourceCoverage;
};

export type PersonSourceCoverage = {
  stargazerCount: number;
  alterCount: number;
  behavioralCount: number;
};

export type LatencyBreakdown = {
  total: number;
  collect: number;
  fusion: number;
  todayReader: number;
  fairness: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. Public API signature (declaration only — implementation in separate files)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 1 Understand の公開 API 予定シグネチャ。
 * M0 では型宣言のみ。実装は後続 PR で追加。
 */
export type RunUnderstanding = (
  bundle: ObservationBundle,
) => Promise<TwoPersonLensToday>;
