// lib/origin/dailyOrbit/types.ts
// 今日の軌道 — 11層の自己観測システム

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: Surface — タスク
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** タスクの本性 — 「何を」ではなく「なぜ」 */
export type TaskNature = "impulse" | "obligation" | "investment" | "curiosity";

export const TASK_NATURE_META: Record<
  TaskNature,
  { emoji: string; label: string; color: string }
> = {
  impulse: { emoji: "\u{1F525}", label: "\u885d\u52d5", color: "#f97316" },
  obligation: { emoji: "\u26a1", label: "\u7fa9\u52d9", color: "#6366f1" },
  investment: { emoji: "\u{1F331}", label: "\u6295\u8cc7", color: "#22c55e" },
  curiosity: { emoji: "\u{1F48E}", label: "\u597d\u5947\u5fc3", color: "#06b6d4" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: Completion Texture — 完了の感触
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CompletionTexture = "satisfying" | "relieved" | "just_done";

export const TEXTURE_META: Record<
  CompletionTexture,
  { emoji: string; label: string }
> = {
  satisfying: { emoji: "\u2728", label: "\u3059\u3063\u304d\u308a" },
  relieved: { emoji: "\u{1F62E}\u200d\u{1F4A8}", label: "\u307b\u3063\u3068\u3057\u305f" },
  just_done: { emoji: "\u{1F937}", label: "\u3053\u306a\u3057\u305f\u3060\u3051" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 3: Body Echo — 身体の声
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BodyZone = "head" | "chest" | "stomach" | "limbs";

export type BodyFeeling = {
  head?: "heavy" | "light" | "foggy";
  chest?: "tight" | "open" | "normal";
  stomach?: "tense" | "calm";
  limbs?: "heavy" | "light";
};

export type BodyEcho = BodyFeeling & {
  recordedAt: string;
};

export const BODY_ZONE_OPTIONS: Record<
  BodyZone,
  { label: string; options: { value: string; label: string; emoji: string }[] }
> = {
  head: {
    label: "\u982d",
    options: [
      { value: "heavy", label: "\u91cd\u3044", emoji: "\u{1F62B}" },
      { value: "light", label: "\u8efd\u3044", emoji: "\u{1F31F}" },
      { value: "foggy", label: "\u307c\u3093\u3084\u308a", emoji: "\u{1F32B}\uFE0F" },
    ],
  },
  chest: {
    label: "\u80f8",
    options: [
      { value: "tight", label: "\u8a70\u307e\u308b", emoji: "\u{1F610}" },
      { value: "open", label: "\u958b\u3044\u3066\u308b", emoji: "\u{1F60C}" },
      { value: "normal", label: "\u666e\u901a", emoji: "\u2796" },
    ],
  },
  stomach: {
    label: "\u80c3",
    options: [
      { value: "tense", label: "\u304d\u3085\u3063\u3068\u3059\u308b", emoji: "\u{1F616}" },
      { value: "calm", label: "\u843d\u3061\u7740\u3044\u3066\u308b", emoji: "\u{1F60C}" },
    ],
  },
  limbs: {
    label: "\u624b\u8db3",
    options: [
      { value: "heavy", label: "\u3060\u308b\u3044", emoji: "\u{1F971}" },
      { value: "light", label: "\u8efd\u3044", emoji: "\u{1F3C3}" },
    ],
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 4: Stargazer State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DayState = {
  energy?: "very_low" | "low" | "moderate" | "high" | "very_high";
  emotion?:
    | "calm"
    | "anxious"
    | "joyful"
    | "tired"
    | "frustrated"
    | "neutral";
  social?: "alone" | "few_people" | "many_people";
  timeOfDay?: "morning" | "afternoon" | "night" | "late_night";
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 5: Shadow Intention — 内在する意図
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ShadowIntention = {
  text: string;
  recordedAt: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 6: Temporal Dialogue — 昨日の自分との対話
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TemporalResponse = "lets_go" | "not_today" | "naive_past_me";

export const TEMPORAL_RESPONSE_META: Record<
  TemporalResponse,
  { emoji: string; label: string }
> = {
  lets_go: { emoji: "\u{1F4AA}", label: "\u3088\u3057\u3001\u3084\u308d\u3046" },
  not_today: { emoji: "\u{1F300}", label: "\u4eca\u65e5\u306f\u9055\u3046\u304b\u3082" },
  naive_past_me: { emoji: "\u{1F602}", label: "\u7518\u3044\u306a\u3001\u6628\u65e5\u306e\u81ea\u5206" },
};

export type TemporalDialogue = {
  yesterdayMessage: string;
  response: TemporalResponse | null;
  respondedAt: string | null;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 7: Time Texture — 時間の体感
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 0 = 一瞬だった, 100 = 永遠だった */
export type TimeTexture = number;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 8: Night Reflection — 夜の1問
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type NightReflection = {
  question: string;
  answer: string;
  answeredAt: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 9: Self Forecast — 自分予報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SelfForecast = {
  predictedCompletion: number; // 予測完了数
  totalTasks: number;
  hardestTask: string | null; // 一番難しそうなタスク名
  note: string; // 予言テキスト
  actual?: number; // 実際の完了数（夜に記録）
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 10: Orbit Laws — 軌道の法則（蓄積データから導出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type OrbitLaw = {
  id: string;
  text: string; // 法則テキスト（例: "あなたは..."）
  confidence: number; // 0-1
  dataPoints: number; // この法則を支える日数
  discoveredAt: string;
  category:
    | "nature_pattern" // タスクの本性パターン
    | "texture_pattern" // 完了の感触パターン
    | "body_correlation" // 身体と行動の相関
    | "time_pattern" // 時間帯パターン
    | "energy_behavior" // エネルギーと行動の関係
    | "shadow_theme" // 内在する意図のテーマ
    | "temporal_self" // 時間的自己の傾向
    | "not_doing_value" // やらなかったことの価値
    | "contradiction"; // Stargazer軸との矛盾
  /** ユーザーが命名した名前（命名権） */
  userLabel?: string;
  /** 人生の法則に昇格した月 (YYYY-MM) */
  promotedAt?: string;
  /** 何ヶ月連続で検出されたか */
  streak?: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 11: Drifting Tasks — 漂流タスク
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DriftAction = "release" | "anchor" | "transform";

export const DRIFT_ACTION_META: Record<
  DriftAction,
  { emoji: string; label: string; description: string }
> = {
  release: {
    emoji: "\u{1F30A}",
    label: "\u6D41\u3059",
    description: "\u624B\u653E\u3059",
  },
  anchor: {
    emoji: "\u2693",
    label: "\u9328\u3092\u4E0B\u308D\u3059",
    description: "\u4ECA\u65E5\u3084\u308B",
  },
  transform: {
    emoji: "\u{1F52E}",
    label: "\u5909\u3048\u308B",
    description: "\u5225\u306E\u5F62\u306B\u66F8\u304D\u63DB\u3048\u308B",
  },
};

export type DriftingTask = {
  text: string;
  carryCount: number;
  firstDate: string;
  action?: DriftAction;
  transformedText?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core: OrbitTask
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 繰り返しパターン */
export type Recurrence = {
  pattern: "daily" | "weekly" | "weekdays" | "biweekly" | "monthly" | "custom";
  dayOfWeek?: number; // 0=日, 1=月, ...6=土
  dayOfMonth?: number; // 1-31 (monthlyパターン用, 32=月末)
  intervalDays?: number; // customパターン用 (例: 3日ごと)
};

export type OrbitTask = {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string | null;
  /** 引き継ぎ元の日付 (YYYY-MM-DD) */
  carriedFrom?: string | null;
  /** 累計持ち越し回数 */
  carryCount: number;
  /** タスクの本性 */
  nature?: TaskNature;
  /** 完了の感触 */
  texture?: CompletionTexture;
  /** 追加した時刻 (ISO string) — 静かな観測用 */
  addedAt: string;
  /** 繰り返し設定 */
  recurrence?: Recurrence;
  /** 期日 (YYYY-MM-DD) */
  dueDate?: string;
  /** 期限時刻 (HH:mm) */
  dueTime?: string;
  /** サブタスクの親ID（1階層のみ） */
  parentId?: string;
  /** ユーザー定義タグ */
  tags?: string[];
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core: DailyOrbitEntry — 1日分の全レイヤー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DailyOrbitEntry = {
  date: string; // YYYY-MM-DD
  // Layer 1: Tasks
  tasks: OrbitTask[];
  // Layer 3: Body Echo
  bodyEcho: BodyEcho | null;
  // Layer 4: Stargazer state
  dayState: DayState | null;
  // Layer 5: Shadow Intention
  shadowIntention: ShadowIntention | null;
  // Layer 6: Temporal Dialogue
  temporalDialogue: TemporalDialogue | null;
  // Layer 7: Time Texture
  timeTexture: TimeTexture | null;
  // Layer 8: Night Reflection
  reflection: NightReflection | null;
  // Layer 9: Self Forecast
  selfForecast: SelfForecast | null;
  // Prediction Duel: ユーザーの自己予測
  userPrediction: number | null;
  // Metadata
  createdAt: string;
  updatedAt: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Store
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Retention Layer: Self-Resolution — 自己解像度
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SelfResolution = {
  score: number; // 0-100
  updatedAt: string;
  /** 日次の変動履歴（直近30日） */
  history: { date: string; score: number }[];
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Retention Layer: Thread — 糸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type OrbitThread = {
  id: string;
  title: string; // 糸のタイトル（例: "義務との関係"）
  description: string; // 現状の説明
  startDate: string;
  lastUpdated: string;
  /** 糸が生きているか */
  status: "active" | "resolved" | "dormant";
  /** 関連データポイント */
  dataPoints: { date: string; summary: string }[];
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Retention Layer: Turning Point — 分岐点
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TurningPoint = {
  id: string;
  date: string;
  title: string; // 何が変わったか
  description: string; // 変化の説明
  category:
    | "first_action" // 初めて何かした
    | "pattern_break" // パターンが崩れた
    | "shadow_resolved" // 内在する意図が消えた
    | "prediction_surpassed" // 自己予測がシステムを超えた
    | "law_promoted" // 法則が昇格した
    | "absence_return"; // 不在からの帰還
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Retention Layer: Surprise Observation — 不意打ち観測
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SurpriseObservation = {
  id: string;
  date: string;
  text: string;
  type: "dot_connection" | "system_confusion" | "contradiction";
  /** ユーザーの反応（あれば） */
  userResponse?: string;
  respondedAt?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Retention Layer: Discovery Timeline — 発見のタイムライン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DiscoveryMilestone = {
  day: number; // 何日目で解放されるか
  label: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
};

export const DISCOVERY_MILESTONES: Omit<DiscoveryMilestone, "unlocked" | "unlockedAt">[] = [
  { day: 1, label: "\u89b3\u6e2c\u958b\u59cb", description: "\u30bf\u30b9\u30af\u30fb\u8eab\u4f53\u306e\u58f0\u30fb\u591c\u306e1\u554f" },
  { day: 3, label: "\u81ea\u5206\u4e88\u5831", description: "\u30b7\u30b9\u30c6\u30e0\u304c\u3042\u306a\u305f\u306e\u884c\u52d5\u3092\u4e88\u6e2c\u3057\u59cb\u3081\u308b" },
  { day: 5, label: "\u5b8c\u4e86\u3057\u306a\u304b\u3063\u305f\u4fa1\u5024", description: "\u300c\u3084\u3089\u306a\u304b\u3063\u305f\u300d\u3053\u3068\u306e\u610f\u5473\u304c\u898b\u3048\u59cb\u3081\u308b" },
  { day: 7, label: "\u6700\u521d\u306e\u6cd5\u5247", description: "\u3042\u306a\u305f\u56fa\u6709\u306e\u884c\u52d5\u6cd5\u5247\u304c\u767a\u898b\u3055\u308c\u308b" },
  { day: 10, label: "\u4e88\u8a00\u5bfe\u6c7a", description: "\u3042\u306a\u305f vs \u30b7\u30b9\u30c6\u30e0\u3001\u3069\u3061\u3089\u304c\u6b63\u78ba\u304b" },
  { day: 14, label: "\u7cf8\u306e\u767a\u898b", description: "\u65e5\u3005\u306e\u8a18\u9332\u304c\u7269\u8a9e\u306b\u306a\u308a\u59cb\u3081\u308b" },
  { day: 21, label: "\u8eab\u4f53\u00d7\u884c\u52d5\u306e\u76f8\u95a2", description: "\u8eab\u4f53\u304c\u884c\u52d5\u3092\u4e88\u8a00\u3057\u3066\u3044\u305f\u3053\u3068\u304c\u308f\u304b\u308b" },
  { day: 30, label: "\u6708\u306e\u81ea\u753b\u50cf", description: "1\u30f6\u6708\u5206\u306e\u3042\u306a\u305f\u306e\u7269\u8a9e\u304c\u751f\u6210\u3055\u308c\u308b" },
  { day: 60, label: "\u5909\u5316\u306e\u8003\u53e4\u5b66", description: "\u3044\u3064\u3001\u4f55\u304c\u5909\u308f\u3063\u305f\u304b\u304c\u898b\u3048\u308b" },
  { day: 90, label: "\u4eba\u751f\u306e\u6cd5\u5247", description: "\u6cd5\u5247\u304c\u300c\u4eba\u751f\u306e\u6cd5\u5247\u300d\u306b\u6607\u683c\u3059\u308b" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Store
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DailyOrbitStore = {
  version: 2;
  entries: Record<string, DailyOrbitEntry>; // key = YYYY-MM-DD
  /** 発見された軌道の法則 */
  orbitLaws: OrbitLaw[];
  /** 自己解像度 */
  selfResolution: SelfResolution;
  /** 糸（長期テーマ） */
  threads: OrbitThread[];
  /** 分岐点 */
  turningPoints: TurningPoint[];
  /** 不意打ち観測の履歴 */
  surpriseObservations: SurpriseObservation[];
  /** 発見マイルストーンの解放状態 */
  discoveryUnlocked: Record<number, string>; // day → unlockedAt ISO
  /** 初回使用日 */
  firstUsedAt: string | null;
  /** 最終使用日 */
  lastUsedAt: string | null;
  /** 連続使用日数 */
  currentStreak: number;
};
