/**
 * Alter Morning Protocol — 場所の性質情報 derive engine
 *
 * CEO方針 2026-04-17:
 *   プラン表示で場所タップ時に出す bottom sheet の「性質情報」を
 *   activity × placeCategory × placeTable.traits から機械的に導出する。
 *   リコメンドの有無に限らず必要 — 仕事ならコンセント/Wi-Fi、
 *   ミーティングなら静かさ/個室、ランチなら雰囲気/予算 を埋める。
 *
 * 入力:
 *   - activityCategory: どの活動か（work/meeting/lunch/...）
 *   - placeCategory: どんな場所か（cafe/restaurant/coworking/...）
 *   - traits: placeTable 由来の特性（indoor/workFriendly/...）
 *
 * 出力: PlacePropertyHints — activity 別に埋めるべきスロットのみ埋める
 *
 * 原則:
 *   - 不明な場合は undefined で返す（"unknown" は明示的に情報なしと
 *     判っている場合のみ使用）
 *   - placeTable traits から推論できるものは "yes"/"no" で確定
 *   - 将来 Places API / Place Details から上書きできるよう開放構造
 */
import type { PlaceCategory, PlaceTraits } from "./placeTable";
import type { ActivityCategory } from "./activityVocabulary";
import type { PlacePropertyHints, HintValue } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Activity → Required slots マッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * activity category ごとに「ユーザーが知りたい性質スロット」を定義。
 * CEO 指示: 仕事→コンセント, ミーティング→静かさ, ランチ→雰囲気 が最重要。
 */
const ACTIVITY_REQUIRED_SLOTS: Record<string, (keyof PlacePropertyHints)[]> = {
  work:     ["outlets", "wifi", "quietness", "longStayOk"],
  study:    ["outlets", "wifi", "quietness", "longStayOk"],
  meeting:  ["quietness", "private", "wifi"],
  reading:  ["quietness", "longStayOk"],
  // 食事系
  lunch:    ["atmosphere", "budget", "reservationRecommended"],
  dinner:   ["atmosphere", "budget", "reservationRecommended", "private"],
  breakfast:["atmosphere", "budget"],
  cafe:     ["wifi", "outlets", "atmosphere", "quietness"],
  drinking: ["atmosphere", "budget", "reservationRecommended"],
  meal:     ["atmosphere", "budget"],
  // 外出系
  shopping: ["parking", "indoor"],
  errand:   ["parking"],
  // 移動
  exercise: ["indoor", "parking"],
  // 社交系
  social:   ["atmosphere", "budget", "reservationRecommended"],
  // 娯楽
  entertainment: ["indoor", "atmosphere"],
  // デフォルト
  _default: ["indoor"],
};

/**
 * ActivityCategory を slot key に正規化する。
 *
 * ActivityCategory は "work_code" / "study_reading" / "social_meal" のような
 * サブ分類込みで提供されるが、性質情報の要求スロットはトップレベル（work / study /
 * meeting / lunch...）で十分区別できるので prefix normalization で吸収する。
 */
function normalizeActivityToSlotKey(activity: string): string {
  const lower = activity.toLowerCase();
  // 特殊ケース: work_meeting は meeting として扱う（静かさ・個室重視）
  if (lower === "work_meeting") return "meeting";
  // social_meal / social_date → meal / social でも良いが social を優先
  if (lower === "social_meal") return "meal";
  if (lower === "social_drink") return "drinking";
  if (lower === "study_reading") return "reading";
  // errand_shopping → shopping
  if (lower === "errand_shopping") return "shopping";
  // prefix stripping
  const underscore = lower.indexOf("_");
  if (underscore > 0) {
    const head = lower.slice(0, underscore);
    if (head in ACTIVITY_REQUIRED_SLOTS) return head;
  }
  // そのまま
  if (lower in ACTIVITY_REQUIRED_SLOTS) return lower;
  return "_default";
}

/** activity string から canonical slot key を返す（fallback 込み） */
function getRequiredSlots(activity?: ActivityCategory | string): (keyof PlacePropertyHints)[] {
  if (!activity) return ACTIVITY_REQUIRED_SLOTS._default;
  const key = normalizeActivityToSlotKey(String(activity));
  return ACTIVITY_REQUIRED_SLOTS[key] ?? ACTIVITY_REQUIRED_SLOTS._default;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlaceCategory 別のデフォルト hint セット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 場所カテゴリ別のデフォルト性質情報。
 * 具体的な店舗情報（Place Details API）が取れない段階での fallback。
 * traits で上書きされる。
 */
const CATEGORY_DEFAULTS: Partial<Record<PlaceCategory, Partial<PlacePropertyHints>>> = {
  cafe: {
    wifi: "yes",
    outlets: "unknown",
    indoor: "yes",
    atmosphere: "落ち着いた",
  },
  fast_food: {
    wifi: "yes",
    outlets: "unknown",
    indoor: "yes",
    quietness: "no",
    atmosphere: "カジュアル",
    budget: "〜1,000円",
  },
  restaurant: {
    indoor: "yes",
    atmosphere: "店舗による",
  },
  library: {
    quietness: "yes",
    wifi: "yes",
    outlets: "yes",
    longStayOk: "yes",
    indoor: "yes",
  },
  coworking: {
    wifi: "yes",
    outlets: "yes",
    quietness: "yes",
    longStayOk: "yes",
    indoor: "yes",
    atmosphere: "集中できる",
  },
  office: {
    wifi: "yes",
    outlets: "yes",
    indoor: "yes",
    private: "yes",
  },
  home: {
    wifi: "yes",
    outlets: "yes",
    quietness: "yes",
    private: "yes",
    longStayOk: "yes",
    indoor: "yes",
  },
  hotel: {
    wifi: "yes",
    indoor: "yes",
    private: "yes",
  },
  hospital: { indoor: "yes", parking: "yes" },
  clinic: { indoor: "yes" },
  shopping: { indoor: "yes", parking: "unknown" },
  convenience_store: { indoor: "yes", parking: "yes" },
  gym: { indoor: "yes", parking: "unknown" },
  park: { indoor: "no" },
  station: { indoor: "unknown", parking: "no" },
  entertainment: { indoor: "yes" },
  other: {},
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// traits → hints 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function traitsToHints(traits?: PlaceTraits): Partial<PlacePropertyHints> {
  if (!traits) return {};
  const out: Partial<PlacePropertyHints> = {};
  if (traits.indoor !== undefined) out.indoor = traits.indoor ? "yes" : "no";
  if (traits.longStayOk !== undefined) out.longStayOk = traits.longStayOk ? "yes" : "no";
  if (traits.noisy !== undefined) out.quietness = traits.noisy ? "no" : "yes";
  // workFriendly は outlets + wifi の両方の代理指標として扱う
  if (traits.workFriendly) {
    out.outlets = "yes";
    out.wifi = "yes";
  }
  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// derivePropertyHints — public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DerivePropertyHintsInput {
  activityCategory?: ActivityCategory | string;
  placeCategory?: PlaceCategory;
  traits?: PlaceTraits;
  /** Places API / Place Details などから取得した既知情報（上書き） */
  override?: Partial<PlacePropertyHints>;
}

/**
 * activity × placeCategory × traits から、活動に必要な性質情報だけを抽出する。
 *
 * - activity が要求しないスロットは含めない（UI 側でノイズにならないように）
 * - traits の指定が最優先（store-specific）、次に category defaults、次に override
 * - 結果が空の場合は undefined を返す
 */
export function derivePropertyHints(input: DerivePropertyHintsInput): PlacePropertyHints | undefined {
  const required = new Set<keyof PlacePropertyHints>(getRequiredSlots(input.activityCategory));
  // 優先順位: override > traits > category defaults
  const categoryDefaults = input.placeCategory ? CATEGORY_DEFAULTS[input.placeCategory] ?? {} : {};
  const traitHints = traitsToHints(input.traits);
  const merged: Partial<PlacePropertyHints> = {
    ...categoryDefaults,
    ...traitHints,
    ...(input.override ?? {}),
  };

  const result: PlacePropertyHints = {};
  let hasAny = false;
  for (const slot of required) {
    const value = merged[slot];
    if (value !== undefined) {
      // string slot（atmosphere, budget）は型を分けて代入
      if (slot === "atmosphere" || slot === "budget") {
        (result[slot] as string | undefined) = value as string;
      } else {
        (result[slot] as HintValue | undefined) = value as HintValue;
      }
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display helpers (UI で使う)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** UI 表示用のラベル（日本語） */
export const HINT_LABELS: Record<keyof PlacePropertyHints, string> = {
  outlets: "コンセント",
  wifi: "Wi-Fi",
  quietness: "静かさ",
  private: "個室・プライベート感",
  longStayOk: "長時間滞在",
  indoor: "屋内",
  atmosphere: "雰囲気",
  budget: "予算",
  parking: "駐車場",
  reservationRecommended: "予約推奨",
};

/** 真偽値スロットの表示文字列化 */
export function formatHintValue(v: HintValue | string | undefined): string {
  if (v === undefined) return "";
  if (v === "yes") return "あり";
  if (v === "no") return "なし";
  if (v === "unknown") return "不明";
  return String(v);
}
