/**
 * Outfit Bridge — Morning Plan → コーデ提案への変換
 *
 * MorningPlan の PlanItem[] + DayConditions を
 * Calendar の EventContext[] → Intent → 候補に変換し、
 * Alter 画面でインラインコーデ表示できるようにする。
 */

import type { MorningPlan, PlanItem, DayConditions } from "./types";
import type {
  EventContext,
  EventType,
  WeatherContext,
  Intent,
  Slot,
} from "@/app/(culcept)/calendar/_lib/vcTypes";
import { computePrimaryEvent, computeIntent, intentToBadges } from "@/app/(culcept)/calendar/_lib/vcIntent";
import { buildCandidates, type ScoredCandidate } from "@/app/(culcept)/calendar/_lib/vcCandidates";
import { computeSyncScore } from "@/lib/shared/outfitEngine/syncScoring";
import type { WeatherDaily, SyncScore } from "@/app/(culcept)/calendar/_lib/types";
import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanItem → EventContext 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** PlanItem の eventType → EventContext.type マッピング（デフォルト: "home"） */
function resolveEventType(item: PlanItem): EventType {
  return item.eventType ?? "home";
}

/** HH:mm → ISO datetime（今日の日付ベース） */
function toISOTime(date: string, time?: string): string {
  if (!time) return `${date}T09:00:00`;
  const [h, m] = time.split(":").map(Number);
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** DayConditions から EventContext に適用する共通フィールドを生成 */
function dayConditionsOverlay(dc: DayConditions): Partial<EventContext> {
  const overlay: Partial<EventContext> = {};

  if (dc.venue) overlay.venue = dc.venue;
  if (dc.mainTransport) overlay.mainTransport = dc.mainTransport;

  // walkLevel → sitRatio / walkRatio 推定
  if (dc.estimatedWalkLevel === "high") {
    overlay.walkRatio = 0.6;
    overlay.sitRatio = 0.2;
  } else if (dc.estimatedWalkLevel === "medium") {
    overlay.walkRatio = 0.4;
    overlay.sitRatio = 0.4;
  } else if (dc.estimatedWalkLevel === "low") {
    overlay.walkRatio = 0.15;
    overlay.sitRatio = 0.7;
  }

  return overlay;
}

/** PlanItem[] → EventContext[] に変換 */
export function planToEventContexts(plan: MorningPlan): EventContext[] {
  const overlay = dayConditionsOverlay(plan.dayConditions);

  return plan.items
    .filter((item) => !item.completed) // 完了済みは除外
    .map((item): EventContext => {
      const startAt = toISOTime(plan.date, item.startTime);
      const endMinutes = item.durationMin;
      const startDate = new Date(startAt);
      const endDate = new Date(startDate.getTime() + endMinutes * 60 * 1000);

      return {
        id: item.id,
        title: item.text,
        type: resolveEventType(item),
        startAt,
        endAt: endDate.toISOString(),
        // fixed予定はpriority高め
        priority: item.kind === "fixed" ? 2 : 1,
        // DayConditions からの共通設定
        ...overlay,
      };
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 天気変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** OutfitBridgeInput.weather → vcTypes.WeatherContext に変換 */
export function toWeatherContext(weather?: {
  tempMax: number | null;
  tempMin: number | null;
  condition: "sunny" | "cloudy" | "rain" | "snow";
  pop: number | null;
}): WeatherContext | undefined {
  if (!weather) return undefined;

  const avgTemp =
    weather.tempMax != null && weather.tempMin != null
      ? (weather.tempMax + weather.tempMin) / 2
      : weather.tempMax ?? weather.tempMin ?? undefined;

  return {
    tempC: avgTemp ?? undefined,
    condition: weather.condition,
    precipMm: weather.condition === "rain" ? 5 : weather.condition === "snow" ? 3 : 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WeatherDaily 変換（SYNCスコア用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function toWeatherDaily(weather?: {
  tempMax: number | null;
  tempMin: number | null;
  condition: "sunny" | "cloudy" | "rain" | "snow";
  pop: number | null;
}): WeatherDaily | null {
  if (!weather) return null;
  const iconMap: Record<string, WeatherDaily["weather_icon"]> = {
    sunny: "sun", cloudy: "cloud", rain: "rain", snow: "snow",
  };
  return {
    weather_icon: iconMap[weather.condition] ?? "unknown",
    temp_max: weather.tempMax,
    temp_min: weather.tempMin,
    pop_max: weather.pop,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインブリッジ関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OutfitBridgeResult {
  /** 各スロットの候補アイテム（上位7件） */
  candidates: Record<Slot, ScoredCandidate[]>;
  /** 20軸 Intent（デバッグ/表示用） */
  intent: Intent;
  /** 代表イベント */
  primaryEvent: EventContext;
  /** Intent から生成されたバッジ */
  badges: Array<{ label: string; color: string }>;
  /** SYNCスコア（top候補の組み合わせで計算） */
  syncScore: SyncScore | null;
  /** ワードローブが空で提案できなかった */
  noWardrobe: boolean;
}

/**
 * Morning Plan → コーデ候補を生成する。
 * クライアントサイドで実行（ワードローブは localStorage から取得）。
 */
export function generateOutfitFromPlan(
  plan: MorningPlan,
  wardrobe: WardrobeItem[],
  weather?: {
    tempMax: number | null;
    tempMin: number | null;
    condition: "sunny" | "cloudy" | "rain" | "snow";
    pop: number | null;
  },
): OutfitBridgeResult | null {
  // ワードローブが空なら提案不可
  if (wardrobe.length === 0) {
    // ダミーの Intent + candidates を返して UI 側で案内を出す
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    if (!primary) return null;

    const wc = toWeatherContext(weather);
    const intent = computeIntent(primary, wc);

    return {
      candidates: { accessory: [], outer: [], top: [], bottom: [], shoes: [] },
      intent,
      primaryEvent: primary,
      badges: intentToBadges(intent),
      syncScore: null,
      noWardrobe: true,
    };
  }

  // 1. PlanItem[] → EventContext[]
  const events = planToEventContexts(plan);
  if (events.length === 0) return null;

  // 2. 代表イベントを選出
  const primary = computePrimaryEvent(events);
  if (!primary) return null;

  // 3. 天気コンテキスト
  const wc = toWeatherContext(weather);

  // 4. Intent 計算
  const intent = computeIntent(primary, wc);

  // 5. 候補生成
  const candidates = buildCandidates(wardrobe, intent);

  // 6. バッジ
  const badges = intentToBadges(intent);

  // 7. SYNCスコア（各スロットのtop候補で計算）
  const topItems: WardrobeItem[] = [];
  for (const slot of ["top", "bottom", "outer", "shoes", "accessory"] as const) {
    if (candidates[slot].length > 0) {
      topItems.push(candidates[slot][0].item);
    }
  }

  let syncScore: SyncScore | null = null;
  if (topItems.length >= 2) {
    const wd = toWeatherDaily(weather);
    const syncEvents = events.map((e) => ({ event_type: e.type }));
    const month = new Date().getMonth() + 1;
    syncScore = computeSyncScore(topItems, wd, syncEvents, month);
  }

  return {
    candidates,
    intent,
    primaryEvent: primary,
    badges,
    syncScore,
    noWardrobe: false,
  };
}
