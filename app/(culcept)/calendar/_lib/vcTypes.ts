/**
 * Visual Coordinate (VC) — Types
 * 予定プロファイル → Intent → スロット別候補生成
 */

/* ═══════════════════════════════════════════════
   Slot
   ═══════════════════════════════════════════════ */
export type Slot = "accessory" | "outer" | "top" | "bottom" | "shoes";

export const SLOT_ORDER: Slot[] = [
  "accessory",
  "outer",
  "top",
  "bottom",
  "shoes",
];

export const SLOT_LABELS: Record<Slot, string> = {
  accessory: "装飾品",
  outer: "アウター",
  top: "トップス",
  bottom: "ボトムス",
  shoes: "シューズ",
};

/* ═══════════════════════════════════════════════
   EventType / Enum
   ═══════════════════════════════════════════════ */
export type EventType =
  | "work" | "date" | "friends" | "sports" | "travel"
  | "formal" | "interview" | "party" | "outdoor" | "home" | "errand";

export type VenueType = "indoor" | "outdoor" | "mixed";
export type TimeOfDay = "morning" | "day" | "evening" | "night";
export type TransportMode = "walk" | "bicycle" | "train" | "car" | "taxi" | "bus" | "motorcycle" | "plane";
export type CrowdLevel = "low" | "med" | "high";
export type HumidityLevel = "dry" | "normal" | "humid";
export type WindLevel = "low" | "med" | "high";
export type SunExposure = "none" | "low" | "med" | "high";
export type AcStrength = "none" | "low" | "med" | "high";
export type CarryVolume = "none" | "light" | "medium" | "heavy";

/* ═══════════════════════════════════════════════
   EventContext (Full Event Profile)
   ═══════════════════════════════════════════════ */
export type EventContext = {
  id: string;
  title: string;
  type: EventType;
  startAt: string;        // ISO
  endAt?: string;
  venue?: VenueType;
  locationText?: string;
  dressCode?: "none" | "smart_casual" | "formal" | "business" | "sport";
  priority?: 0 | 1 | 2 | 3;

  /* ── 行動プロファイル（Movement Mix） ── */
  sitRatio?: number;      // 0–1
  walkRatio?: number;     // 0–1
  standRatio?: number;    // 0–1

  /* ── 移動（Transport） ── */
  mainTransport?: TransportMode;
  walkDistanceKm?: number;
  crowdLevel?: CrowdLevel;

  /* ── 環境（Environment） ── */
  acStrength?: AcStrength;
  humidityLevel?: HumidityLevel;
  windLevel?: WindLevel;
  sunExposure?: SunExposure;
  rainRisk?: number;      // 0–1

  /* ── 社会的条件（Impression） ── */
  attentionLevel?: number;   // 0–1
  romanceLevel?: number;     // 0–1
  trustNeed?: number;        // 0–1

  /* ── 快適性 ── */
  comfortPriority?: number;  // 0–1
  sweatRisk?: number;        // 0–1

  /* ── 動作イベント（Moments） ── */
  photoMoment?: number;      // 0–1
  mealMoment?: number;       // 0–1
  presentationMoment?: number; // 0–1
};

/* ═══════════════════════════════════════════════
   WeatherContext
   ═══════════════════════════════════════════════ */
export type WeatherContext = {
  tempC?: number;
  precipMm?: number;
  windMs?: number;
  humidity?: number;
  condition?: "sunny" | "cloudy" | "rain" | "snow";
};

/* ═══════════════════════════════════════════════
   Intent（20軸 — 予定→服選びの全指標）
   ═══════════════════════════════════════════════ */
export type Intent = {
  /* 印象・ドレス */
  formality: number;       // きちんと
  attention: number;       // 目立ち/主役
  minimalism: number;      // 整い/ミニマル
  romance: number;         // デート感
  trust: number;           // 誠実/信頼

  /* 動き */
  mobility: number;        // 動きやすさ
  walkNeed: number;        // 歩き耐性
  bikeNeed: number;        // 自転車適性
  stairsNeed: number;      // 階段耐性

  /* 快適 */
  comfort: number;         // 全体快適
  breathable: number;      // 蒸れ対策
  wrinkleSafe: number;     // シワ耐性
  tightAvoid: number;      // 締め付け回避

  /* 天候 */
  warmthNeed: number;      // 防寒
  rainNeed: number;        // 撥水/雨
  windNeed: number;        // 防風
  uvNeed: number;          // 日差し

  /* 実用 */
  dirtySafe: number;       // 汚れ耐性
  splashSafe: number;      // はね耐性
  pocketNeed: number;      // ポケット必要度

  /* タグ */
  sceneTags: string[];
  bannedTags: string[];
  requiredTags: string[];
};

/** Intent の数値キー一覧（clamp用） */
export const NUMERIC_INTENT_KEYS = [
  "formality", "attention", "minimalism", "romance", "trust",
  "mobility", "walkNeed", "bikeNeed", "stairsNeed",
  "comfort", "breathable", "wrinkleSafe", "tightAvoid",
  "warmthNeed", "rainNeed", "windNeed", "uvNeed",
  "dirtySafe", "splashSafe", "pocketNeed",
] as const;

/* ═══════════════════════════════════════════════
   SavedOutfit / SlotState
   ═══════════════════════════════════════════════ */
export type SavedOutfit = {
  date: string;
  primaryEventId?: string;
  slotItemIds: Partial<Record<Slot, string>>;
  lockedSlots: Slot[];
  intentSnapshot?: Intent;
  createdAt: string;
};

export type SlotState = {
  index: number;
  locked: boolean;
};

/* ═══════════════════════════════════════════════
   Labels / Constants
   ═══════════════════════════════════════════════ */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  work: "仕事",
  date: "デート",
  friends: "友達",
  sports: "スポーツ",
  travel: "旅行",
  formal: "フォーマル",
  interview: "面接",
  party: "パーティー",
  outdoor: "アウトドア",
  home: "おうち",
  errand: "お出かけ",
};

export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  work: "💼", date: "💕", friends: "👯", sports: "🏃",
  travel: "✈️", formal: "👔", interview: "🤝", party: "🎉",
  outdoor: "🏕️", home: "🏠", errand: "🛒",
};

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  walk: "徒歩", bicycle: "自転車", train: "電車", car: "車",
  taxi: "タクシー", bus: "バス", motorcycle: "バイク", plane: "飛行機",
};

export const TRANSPORT_ICONS: Record<TransportMode, string> = {
  walk: "🚶", bicycle: "🚲", train: "🚃", car: "🚗",
  taxi: "🚕", bus: "🚌", motorcycle: "🏍️", plane: "✈️",
};
