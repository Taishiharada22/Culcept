/**
 * Visual Coordinate — Intent Computation (Full)
 * 予定プロファイル → 20軸 Intent の変換ロジック
 *
 * フロー:
 *  1. EventType → BaseIntent（スマートデフォルト）
 *  2. Movement / Transport → 動き系 Intent
 *  3. Environment / Weather → 天候系 Intent
 *  4. Social / Moments → 印象系 Intent
 *  5. DressCode → フォーマリティ補正
 *  6. 全軸 clamp 0..1
 */
import type {
  EventContext, EventType, Intent, TimeOfDay, VenueType,
  WeatherContext, TransportMode, NUMERIC_INTENT_KEYS,
} from "./vcTypes";
import { NUMERIC_INTENT_KEYS as KEYS } from "./vcTypes";

/* ═══════════════════════════════════════════════
   1. EventType → Base Intent（スマートデフォルト）
   各 EventType で、ユーザーが何も詳細入力しなくても
   合理的な Intent が出る "デフォルトプロファイル"
   ═══════════════════════════════════════════════ */
type BaseIntent = Omit<Intent, "sceneTags" | "bannedTags" | "requiredTags"> & { sceneTags: string[] };

const BASE: Record<EventType, BaseIntent> = {
  work: {
    formality: 0.65, attention: 0.25, minimalism: 0.70, romance: 0.00, trust: 0.60,
    mobility: 0.35, walkNeed: 0.30, bikeNeed: 0.00, stairsNeed: 0.20,
    comfort: 0.55, breathable: 0.40, wrinkleSafe: 0.55, tightAvoid: 0.30,
    warmthNeed: 0.30, rainNeed: 0.20, windNeed: 0.15, uvNeed: 0.10,
    dirtySafe: 0.20, splashSafe: 0.15, pocketNeed: 0.40,
    sceneTags: ["work", "clean"],
  },
  date: {
    formality: 0.55, attention: 0.75, minimalism: 0.40, romance: 0.70, trust: 0.30,
    mobility: 0.35, walkNeed: 0.40, bikeNeed: 0.00, stairsNeed: 0.15,
    comfort: 0.50, breathable: 0.40, wrinkleSafe: 0.45, tightAvoid: 0.35,
    warmthNeed: 0.30, rainNeed: 0.20, windNeed: 0.15, uvNeed: 0.15,
    dirtySafe: 0.20, splashSafe: 0.20, pocketNeed: 0.25,
    sceneTags: ["date", "chic"],
  },
  friends: {
    formality: 0.30, attention: 0.35, minimalism: 0.35, romance: 0.00, trust: 0.15,
    mobility: 0.45, walkNeed: 0.35, bikeNeed: 0.00, stairsNeed: 0.15,
    comfort: 0.65, breathable: 0.50, wrinkleSafe: 0.30, tightAvoid: 0.45,
    warmthNeed: 0.25, rainNeed: 0.20, windNeed: 0.10, uvNeed: 0.10,
    dirtySafe: 0.25, splashSafe: 0.15, pocketNeed: 0.35,
    sceneTags: ["friends", "casual"],
  },
  sports: {
    formality: 0.05, attention: 0.10, minimalism: 0.20, romance: 0.00, trust: 0.05,
    mobility: 0.95, walkNeed: 0.60, bikeNeed: 0.10, stairsNeed: 0.30,
    comfort: 0.85, breathable: 0.80, wrinkleSafe: 0.10, tightAvoid: 0.20,
    warmthNeed: 0.30, rainNeed: 0.30, windNeed: 0.25, uvNeed: 0.40,
    dirtySafe: 0.70, splashSafe: 0.50, pocketNeed: 0.30,
    sceneTags: ["sports", "active"],
  },
  travel: {
    formality: 0.20, attention: 0.25, minimalism: 0.35, romance: 0.10, trust: 0.10,
    mobility: 0.65, walkNeed: 0.60, bikeNeed: 0.00, stairsNeed: 0.35,
    comfort: 0.80, breathable: 0.55, wrinkleSafe: 0.55, tightAvoid: 0.55,
    warmthNeed: 0.40, rainNeed: 0.30, windNeed: 0.25, uvNeed: 0.30,
    dirtySafe: 0.40, splashSafe: 0.30, pocketNeed: 0.60,
    sceneTags: ["travel", "functional"],
  },
  formal: {
    formality: 0.95, attention: 0.60, minimalism: 0.55, romance: 0.10, trust: 0.70,
    mobility: 0.15, walkNeed: 0.15, bikeNeed: 0.00, stairsNeed: 0.10,
    comfort: 0.30, breathable: 0.30, wrinkleSafe: 0.70, tightAvoid: 0.20,
    warmthNeed: 0.25, rainNeed: 0.20, windNeed: 0.15, uvNeed: 0.10,
    dirtySafe: 0.30, splashSafe: 0.25, pocketNeed: 0.20,
    sceneTags: ["formal", "dress"],
  },
  interview: {
    formality: 0.90, attention: 0.30, minimalism: 0.75, romance: 0.00, trust: 0.80,
    mobility: 0.20, walkNeed: 0.25, bikeNeed: 0.00, stairsNeed: 0.15,
    comfort: 0.40, breathable: 0.35, wrinkleSafe: 0.65, tightAvoid: 0.25,
    warmthNeed: 0.25, rainNeed: 0.20, windNeed: 0.15, uvNeed: 0.10,
    dirtySafe: 0.25, splashSafe: 0.20, pocketNeed: 0.30,
    sceneTags: ["interview", "work", "clean"],
  },
  party: {
    formality: 0.70, attention: 0.85, minimalism: 0.30, romance: 0.30, trust: 0.20,
    mobility: 0.25, walkNeed: 0.20, bikeNeed: 0.00, stairsNeed: 0.10,
    comfort: 0.35, breathable: 0.35, wrinkleSafe: 0.40, tightAvoid: 0.25,
    warmthNeed: 0.25, rainNeed: 0.15, windNeed: 0.10, uvNeed: 0.05,
    dirtySafe: 0.15, splashSafe: 0.10, pocketNeed: 0.15,
    sceneTags: ["party", "statement"],
  },
  outdoor: {
    formality: 0.15, attention: 0.20, minimalism: 0.35, romance: 0.05, trust: 0.10,
    mobility: 0.70, walkNeed: 0.65, bikeNeed: 0.05, stairsNeed: 0.35,
    comfort: 0.75, breathable: 0.60, wrinkleSafe: 0.15, tightAvoid: 0.40,
    warmthNeed: 0.40, rainNeed: 0.35, windNeed: 0.40, uvNeed: 0.50,
    dirtySafe: 0.60, splashSafe: 0.45, pocketNeed: 0.50,
    sceneTags: ["outdoor", "functional"],
  },
  home: {
    formality: 0.00, attention: 0.05, minimalism: 0.20, romance: 0.00, trust: 0.00,
    mobility: 0.20, walkNeed: 0.05, bikeNeed: 0.00, stairsNeed: 0.05,
    comfort: 0.95, breathable: 0.60, wrinkleSafe: 0.05, tightAvoid: 0.80,
    warmthNeed: 0.30, rainNeed: 0.00, windNeed: 0.00, uvNeed: 0.00,
    dirtySafe: 0.10, splashSafe: 0.05, pocketNeed: 0.10,
    sceneTags: ["home", "relax"],
  },
  errand: {
    formality: 0.15, attention: 0.15, minimalism: 0.30, romance: 0.00, trust: 0.10,
    mobility: 0.50, walkNeed: 0.45, bikeNeed: 0.10, stairsNeed: 0.20,
    comfort: 0.70, breathable: 0.50, wrinkleSafe: 0.20, tightAvoid: 0.50,
    warmthNeed: 0.30, rainNeed: 0.20, windNeed: 0.15, uvNeed: 0.15,
    dirtySafe: 0.30, splashSafe: 0.25, pocketNeed: 0.50,
    sceneTags: ["daily", "casual"],
  },
};

/* ═══════════════════════════════════════════════
   2. 補助関数
   ═══════════════════════════════════════════════ */
function inferTimeOfDay(startAt: string): TimeOfDay {
  try {
    const h = new Date(startAt).getHours();
    if (h < 10) return "morning";
    if (h < 17) return "day";
    if (h < 21) return "evening";
    return "night";
  } catch { return "day"; }
}

function inferVenue(ev: EventContext): VenueType {
  if (ev.venue) return ev.venue;
  const outdoor: EventType[] = ["outdoor", "sports", "travel"];
  const indoor: EventType[] = ["work", "interview", "party", "home"];
  if (outdoor.includes(ev.type)) return "outdoor";
  if (indoor.includes(ev.type)) return "indoor";
  return "mixed";
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/* ═══════════════════════════════════════════════
   3. Movement → Intent
   ═══════════════════════════════════════════════ */
function applyMovement(intent: Intent, ev: EventContext) {
  const sit = ev.sitRatio ?? 0;
  const walk = ev.walkRatio ?? 0;
  const stand = ev.standRatio ?? 0;

  // 移動比率が何か入力されていれば適用
  if (sit + walk + stand > 0) {
    intent.mobility += walk * 0.4 + stand * 0.1;
    intent.wrinkleSafe += sit * 0.4;
    intent.tightAvoid += sit * 0.35 + (ev.comfortPriority ?? 0) * 0.2;
    intent.comfort += sit * 0.1 + (ev.comfortPriority ?? 0) * 0.3;
  }

  // 歩行距離
  if (ev.walkDistanceKm != null && ev.walkDistanceKm > 0) {
    intent.walkNeed += clamp(ev.walkDistanceKm / 5);
    intent.mobility += ev.walkDistanceKm > 3 ? 0.15 : 0.05;
  }
}

/* ═══════════════════════════════════════════════
   4. Transport → Intent
   ═══════════════════════════════════════════════ */
function applyTransport(intent: Intent, ev: EventContext) {
  const t = ev.mainTransport;
  if (!t) return;

  switch (t) {
    case "train":
    case "bus":
      intent.wrinkleSafe += 0.10;
      intent.stairsNeed += 0.15;
      if (ev.crowdLevel === "high") {
        intent.dirtySafe += 0.15;
        intent.tightAvoid += 0.10;
        intent.mobility += 0.10;
      }
      break;
    case "bicycle":
      intent.bikeNeed = Math.max(intent.bikeNeed, 0.80);
      intent.mobility += 0.25;
      intent.tightAvoid += 0.15;
      intent.windNeed += 0.15;
      intent.bannedTags.push("wide_hem"); // ワイドパンツ/ロングスカート注意
      break;
    case "car":
    case "taxi":
      intent.wrinkleSafe += 0.20;
      intent.comfort += 0.10;
      break;
    case "walk":
      intent.walkNeed += 0.30;
      intent.mobility += 0.15;
      intent.comfort += 0.10;
      break;
    case "plane":
      intent.wrinkleSafe += 0.25;
      intent.tightAvoid += 0.20;
      intent.comfort += 0.15;
      intent.pocketNeed += 0.10;
      break;
  }
}

/* ═══════════════════════════════════════════════
   5. Environment → Intent
   ═══════════════════════════════════════════════ */
function applyEnvironment(intent: Intent, ev: EventContext) {
  // 冷房
  if (ev.acStrength === "high") {
    intent.warmthNeed += 0.20;
    intent.sceneTags.push("layered");
  } else if (ev.acStrength === "med") {
    intent.warmthNeed += 0.08;
  }

  // 湿度
  if (ev.humidityLevel === "humid") {
    intent.breathable += 0.25;
    intent.comfort += 0.10;
  }

  // 風
  const wl = ev.windLevel;
  if (wl === "high") intent.windNeed += 0.30;
  else if (wl === "med") intent.windNeed += 0.15;

  // 日差し
  const se = ev.sunExposure;
  if (se === "high") intent.uvNeed += 0.35;
  else if (se === "med") intent.uvNeed += 0.15;

  // 雨リスク（ユーザー入力）
  if (ev.rainRisk != null && ev.rainRisk > 0) {
    intent.rainNeed += ev.rainRisk * 0.5;
    intent.splashSafe += ev.rainRisk * 0.3;
    if (ev.rainRisk > 0.5) intent.requiredTags.push("rain_ok");
  }

  // 汗リスク
  if (ev.sweatRisk != null && ev.sweatRisk > 0.3) {
    intent.breathable += ev.sweatRisk * 0.3;
  }
}

/* ═══════════════════════════════════════════════
   6. Social / Moments → Intent
   ═══════════════════════════════════════════════ */
function applySocial(intent: Intent, ev: EventContext) {
  if (ev.attentionLevel != null) intent.attention += ev.attentionLevel * 0.3;
  if (ev.romanceLevel != null) intent.romance += ev.romanceLevel * 0.4;
  if (ev.trustNeed != null) intent.trust += ev.trustNeed * 0.3;

  // 写真
  if (ev.photoMoment != null && ev.photoMoment > 0.3) {
    intent.attention += ev.photoMoment * 0.15;
    intent.minimalism += ev.photoMoment * 0.10; // 写真映え = 配色整い
  }

  // 食事
  if (ev.mealMoment != null && ev.mealMoment > 0.3) {
    intent.dirtySafe += ev.mealMoment * 0.20;
    intent.splashSafe += ev.mealMoment * 0.15;
    // 白トップス注意（bannedまではしない、スコアで下げる）
  }

  // プレゼン
  if (ev.presentationMoment != null && ev.presentationMoment > 0.3) {
    intent.formality += ev.presentationMoment * 0.15;
    intent.trust += ev.presentationMoment * 0.15;
    intent.attention += ev.presentationMoment * 0.10;
  }
}

/* ═══════════════════════════════════════════════
   6.5. Mood 補正（moodText → Intent）
   ユーザーが「きれいめ」「ラフ」などのムードを指定した場合に
   主観系軸を nudge する。天候・安全・ドレスコード軸は触らない。
   ※ DressCode / Weather は Mood の後に適用されるため、
     hard constraint が自然に mood を上書きする。
   ═══════════════════════════════════════════════ */

type NumericIntentKey = (typeof KEYS)[number];

/**
 * ムードパターン → Intent 軸補正テーブル
 * - 主観軸のみ（formality, attention, minimalism, romance, trust, comfort, tightAvoid, wrinkleSafe, breathable, mobility）
 * - 天候軸（warmthNeed, rainNeed, windNeed, uvNeed）は触らない
 * - 安全軸（dirtySafe, splashSafe）は触らない
 * - デルタは ±0.05〜±0.25 の範囲（nudge であり override ではない）
 */
const MOOD_CORRECTIONS: Record<string, Partial<Record<NumericIntentKey, number>>> = {
  "きれいめ":   { formality: 0.15, attention: 0.10, minimalism: 0.10, trust: 0.05 },
  "カジュアル": { formality: -0.15, comfort: 0.10, tightAvoid: 0.10 },
  "ラフ":       { formality: -0.20, comfort: 0.15, tightAvoid: 0.15, minimalism: -0.10 },
  "かっちり":   { formality: 0.20, trust: 0.10, wrinkleSafe: 0.10 },
  "フォーマル": { formality: 0.25, trust: 0.10, attention: 0.10, wrinkleSafe: 0.10 },
  "楽":         { comfort: 0.20, tightAvoid: 0.15, formality: -0.15 },
  "おしゃれ":   { attention: 0.15, minimalism: 0.10, formality: 0.05 },
  "リラックス": { comfort: 0.15, tightAvoid: 0.10, formality: -0.10, breathable: 0.05 },
  "スポーティ": { mobility: 0.15, comfort: 0.10, breathable: 0.10, formality: -0.15 },
  "シンプル":   { minimalism: 0.15, attention: -0.10 },
  "動きやすい": { mobility: 0.15, walkNeed: 0.10, comfort: 0.10, tightAvoid: 0.10 },
  "大人っぽい": { formality: 0.10, attention: 0.10, minimalism: 0.10, trust: 0.10 },
};

/** ムード補正を Intent に加算する。未知のムード文字列はスキップ。 */
export function applyMoodCorrection(intent: Intent, moodText: string): void {
  const corrections = MOOD_CORRECTIONS[moodText];
  if (!corrections) return;

  for (const [key, delta] of Object.entries(corrections)) {
    intent[key as NumericIntentKey] += delta;
  }
}

/** テスト・診断用: 利用可能なムードパターン一覧を返す */
export function getAvailableMoodPatterns(): string[] {
  return Object.keys(MOOD_CORRECTIONS);
}

/* ═══════════════════════════════════════════════
   7. DressCode 補正
   ═══════════════════════════════════════════════ */
function applyDressCode(intent: Intent, dc: NonNullable<EventContext["dressCode"]>) {
  switch (dc) {
    case "business":
      intent.formality = Math.max(intent.formality, 0.70);
      intent.minimalism += 0.10;
      intent.trust += 0.10;
      break;
    case "formal":
      intent.formality = Math.max(intent.formality, 0.90);
      intent.attention += 0.10;
      intent.wrinkleSafe += 0.10;
      break;
    case "smart_casual":
      intent.formality = Math.max(intent.formality, 0.45);
      break;
    case "sport":
      intent.mobility = Math.max(intent.mobility, 0.80);
      intent.formality = Math.min(intent.formality, 0.15);
      intent.breathable += 0.15;
      break;
  }
}

/* ═══════════════════════════════════════════════
   8. Weather 補正（天気API由来データ）
   ═══════════════════════════════════════════════ */
function applyWeather(intent: Intent, w: WeatherContext) {
  // 雨
  if (w.condition === "rain" || (w.precipMm != null && w.precipMm >= 1)) {
    intent.rainNeed += 0.35;
    intent.splashSafe += 0.25;
    intent.requiredTags.push("rain_ok");
  }

  // 気温
  if (w.tempC != null) {
    const t = w.tempC;
    if (t <= 5) intent.warmthNeed += 0.45;
    else if (t <= 12) intent.warmthNeed += 0.30;
    else if (t <= 18) intent.warmthNeed += 0.15;
    else if (t <= 25) intent.warmthNeed += 0.05;
    else {
      intent.warmthNeed -= 0.10;
      intent.breathable += 0.20;
    }
  }

  // 風
  if (w.windMs != null) {
    if (w.windMs >= 10) intent.windNeed += 0.30;
    else if (w.windMs >= 6) intent.windNeed += 0.15;
  }

  // 湿度
  if (w.humidity != null && w.humidity >= 70) {
    intent.breathable += 0.15;
  }
}

/* ═══════════════════════════════════════════════
   9. Time / Venue 補正
   ═══════════════════════════════════════════════ */
function applyTimeVenue(intent: Intent, ev: EventContext) {
  const tod = inferTimeOfDay(ev.startAt);
  if (tod === "evening" || tod === "night") {
    intent.attention += 0.10;
    intent.formality += 0.05;
  }
  if (tod === "morning") intent.minimalism += 0.05;

  const venue = inferVenue(ev);
  if (venue === "outdoor") {
    intent.windNeed += 0.10;
    intent.uvNeed += 0.10;
    intent.dirtySafe += 0.10;
    intent.mobility += 0.10;
    intent.sceneTags.push("outdoor");
  }
  if (venue === "indoor") {
    intent.comfort += 0.05;
    intent.formality += 0.05;
  }
}

/* ═══════════════════════════════════════════════
   主予定を決定
   ═══════════════════════════════════════════════ */
const EVENT_PRIORITY_ORDER: EventType[] = [
  "interview", "formal", "party", "date", "work",
  "sports", "travel", "outdoor", "friends", "errand", "home",
];

export function computePrimaryEvent(events: EventContext[]): EventContext | null {
  if (events.length === 0) return null;
  if (events.length === 1) return events[0];

  const sorted = [...events].sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;

    const ia = EVENT_PRIORITY_ORDER.indexOf(a.type);
    const ib = EVENT_PRIORITY_ORDER.indexOf(b.type);
    if (ia !== ib) return ia - ib;

    if (a.endAt && b.endAt) {
      const durA = new Date(a.endAt).getTime() - new Date(a.startAt).getTime();
      const durB = new Date(b.endAt).getTime() - new Date(b.startAt).getTime();
      if (durA !== durB) return durB - durA;
    }

    return new Date(b.startAt).getHours() - new Date(a.startAt).getHours();
  });

  return sorted[0];
}

/* ═══════════════════════════════════════════════
   Intent 生成（メイン）
   ═══════════════════════════════════════════════ */
export function computeIntent(primary: EventContext, weather?: WeatherContext, moodText?: string): Intent {
  const base = BASE[primary.type];
  const intent: Intent = {
    // 数値コピー
    formality: base.formality, attention: base.attention, minimalism: base.minimalism,
    romance: base.romance, trust: base.trust,
    mobility: base.mobility, walkNeed: base.walkNeed, bikeNeed: base.bikeNeed, stairsNeed: base.stairsNeed,
    comfort: base.comfort, breathable: base.breathable, wrinkleSafe: base.wrinkleSafe, tightAvoid: base.tightAvoid,
    warmthNeed: base.warmthNeed, rainNeed: base.rainNeed, windNeed: base.windNeed, uvNeed: base.uvNeed,
    dirtySafe: base.dirtySafe, splashSafe: base.splashSafe, pocketNeed: base.pocketNeed,
    // タグコピー
    sceneTags: [...base.sceneTags],
    bannedTags: [],
    requiredTags: [],
  };

  // 各レイヤーの補正を適用
  applyTimeVenue(intent, primary);
  applyMovement(intent, primary);
  applyTransport(intent, primary);
  applyEnvironment(intent, primary);
  applySocial(intent, primary);
  if (moodText) applyMoodCorrection(intent, moodText);
  if (primary.dressCode && primary.dressCode !== "none") applyDressCode(intent, primary.dressCode);
  if (weather) applyWeather(intent, weather);

  // clamp 0..1
  for (const k of KEYS) {
    intent[k] = clamp(intent[k]);
  }

  // タグ重複除去
  intent.sceneTags = [...new Set(intent.sceneTags)];
  intent.bannedTags = [...new Set(intent.bannedTags)];
  intent.requiredTags = [...new Set(intent.requiredTags)];

  return intent;
}

/* ═══════════════════════════════════════════════
   Intent バッジ生成（UI表示用）
   Intent の数値から人間が読めるバッジを返す
   ═══════════════════════════════════════════════ */
export type IntentBadge = {
  label: string;
  color: "purple" | "blue" | "cyan" | "amber" | "rose" | "emerald" | "gray";
};

export function intentToBadges(intent: Intent): IntentBadge[] {
  const badges: IntentBadge[] = [];

  // 印象
  if (intent.formality > 0.6) badges.push({ label: "きちんと", color: "purple" });
  if (intent.attention > 0.6) badges.push({ label: "主役感", color: "rose" });
  if (intent.romance > 0.4) badges.push({ label: "デート", color: "rose" });
  if (intent.trust > 0.5) badges.push({ label: "信頼感", color: "purple" });
  if (intent.minimalism > 0.6) badges.push({ label: "ミニマル", color: "gray" });

  // 動き
  if (intent.walkNeed > 0.5) badges.push({ label: "歩き多", color: "emerald" });
  if (intent.bikeNeed > 0.5) badges.push({ label: "自転車", color: "emerald" });
  if (intent.mobility > 0.6) badges.push({ label: "動きやすさ", color: "emerald" });

  // 快適
  if (intent.wrinkleSafe > 0.5) badges.push({ label: "シワ注意", color: "amber" });
  if (intent.tightAvoid > 0.5) badges.push({ label: "ゆったり", color: "amber" });
  if (intent.breathable > 0.5) badges.push({ label: "通気性", color: "cyan" });

  // 天候
  if (intent.warmthNeed > 0.5) badges.push({ label: "防寒", color: "blue" });
  if (intent.rainNeed > 0.4) badges.push({ label: "雨対策", color: "cyan" });
  if (intent.windNeed > 0.4) badges.push({ label: "防風", color: "blue" });
  if (intent.uvNeed > 0.4) badges.push({ label: "UV対策", color: "amber" });

  // 実用
  if (intent.dirtySafe > 0.4) badges.push({ label: "汚れ耐性", color: "amber" });
  if (intent.splashSafe > 0.4) badges.push({ label: "はね対策", color: "cyan" });

  return badges;
}
