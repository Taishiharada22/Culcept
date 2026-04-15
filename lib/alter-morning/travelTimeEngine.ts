/**
 * Travel Time Engine — ヒューリスティック移動時間推定
 *
 * API不要。交通手段 × 距離区分 → 移動時間（分）のマッピング。
 *
 * 設計根拠:
 * - 研究: docs/research/daily-planning-methodology-research.md
 * - 原則: 精度よりも「移動時間がゼロでなくなる」こと自体が最大の改善
 * - 移動時間はユーザーに聞かない — 推定して提示し、ユーザーが修正する
 *
 * ツアー構造:
 *   [自宅] → 移動A → [目的地1] → 移動B → [目的地2] → 移動C → [自宅]
 *   = Hagerstrand 時間地理学のツアーベース構造
 */

import type { TransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";
import type { PlanItem, MainLocation } from "./types";
import type { PlaceCategory } from "./placeTable";
import { lookupTravelTime, isSamePoint } from "./travelTimeTable";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 距離区分
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2地点間の距離の大まかな区分。
 * 正確な住所は不要 — 場所カテゴリとテキストの手がかりから推定する。
 */
export type DistanceCategory = "near" | "city" | "adjacent" | "wide";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヒューリスティック移動時間テーブル（分）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 交通手段 × 距離区分 → 移動時間（分）。
 *
 * データソース: 日本の都市部データ（研究レポートより）
 *   - 車（都市部）: 実効時速17km（信号・渋滞込み）
 *   - 電車: 乗車時間 + 徒歩アクセス + 待ち時間
 *   - 自転車: 都市部平均 時速14.4km
 *   - 徒歩: 時速4.8km（80m/分）
 *
 * null = その交通手段では非現実的な距離（徒歩で広域移動等）
 */
const TRAVEL_TIME_TABLE: Record<string, Record<DistanceCategory, number | null>> = {
  car:        { near: 10, city: 20, adjacent: 30, wide: 45 },
  train:      { near: null, city: 30, adjacent: 40, wide: 60 },
  walk:       { near: 15, city: null, adjacent: null, wide: null },
  bicycle:    { near: 7, city: 20, adjacent: null, wide: null },
  bus:        { near: 15, city: 25, adjacent: 40, wide: 60 },
  taxi:       { near: 8, city: 15, adjacent: 25, wide: 40 },
  motorcycle: { near: 7, city: 15, adjacent: 25, wide: 35 },
};

/**
 * 交通手段別オーバーヘッド（分）
 * 駐車場確保、駅まで徒歩、待ち時間等の加算分
 */
const TRANSPORT_OVERHEAD: Record<string, number> = {
  car: 5,        // 駐車場の確保
  train: 10,     // 駅までの徒歩 + 待ち時間（出発側5分 + 到着側5分）
  walk: 0,
  bicycle: 2,    // 駐輪場の確保
  bus: 5,        // バス停待ち
  taxi: 3,       // 配車/乗車待ち
  motorcycle: 3, // 駐車
};

/** 自宅出発時の追加オーバーヘッド（出発準備） */
const HOME_DEPARTURE_OVERHEAD = 10;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 距離区分の推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 場所カテゴリのデフォルト距離区分。
 *
 * コンビニは近場、病院・銀行は市内移動が一般的。
 * 厳密ではないが「移動時間ゼロ」よりはるかに実用的。
 */
const CATEGORY_DISTANCE_DEFAULT: Record<string, DistanceCategory> = {
  // 近場が多いカテゴリ
  convenience_store: "near",
  park: "near",

  // 市内移動が標準のカテゴリ
  cafe: "city",
  fast_food: "city",
  restaurant: "city",
  library: "city",
  school: "city",
  office: "city",
  hospital: "city",
  clinic: "city",
  shopping: "city",
  station: "city",
  coworking: "city",
  gym: "city",
  entertainment: "city",

  // 遠方もあり得るカテゴリ
  hotel: "adjacent",

  // デフォルト
  home: "near",
  other: "city",
};

/** テキストから近場の手がかりを検出 */
const NEAR_HINTS = /近く|近所|歩いて|すぐ|いつもの|うちの/;
/** テキストから広域の手がかりを検出 */
const WIDE_HINTS = /市に|県に|空港|新幹線|高速/;

/**
 * 場所カテゴリとテキストの手がかりから距離区分を推定する。
 */
export function inferDistance(
  category?: PlaceCategory | string,
  textHint?: string
): DistanceCategory {
  // テキストの手がかりが最優先
  if (textHint) {
    if (NEAR_HINTS.test(textHint)) return "near";
    if (WIDE_HINTS.test(textHint)) return "wide";
  }

  // カテゴリのデフォルト
  if (category) {
    return CATEGORY_DISTANCE_DEFAULT[category] ?? "city";
  }

  // 情報なし → 市内移動をデフォルト
  return "city";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TravelEstimate {
  /** 移動時間（分）— バッファ込み、15分単位に丸め */
  durationMin: number;
  /** 内訳: 純移動時間 */
  rawTravelMin: number;
  /** 内訳: オーバーヘッド */
  overheadMin: number;
  /** 使用した距離区分 */
  distanceCategory: DistanceCategory;
}

/**
 * 2地点間の移動時間を推定する。
 *
 * @param transport - 交通手段（DayConditions.mainTransport）
 * @param fromCategory - 出発地の場所カテゴリ（undefined = 自宅）
 * @param toCategory - 到着地の場所カテゴリ
 * @param isFromHome - 自宅から出発する場合 true（出発準備オーバーヘッド加算）
 * @returns 移動時間推定値（null = その交通手段では非現実的）
 */
export function estimateTravelTime(
  transport: TransportMode | string | undefined,
  fromCategory?: PlaceCategory | string,
  toCategory?: PlaceCategory | string,
  isFromHome: boolean = false
): TravelEstimate | null {
  const mode = normalizeTransport(transport);
  const distance = inferDistance(toCategory);

  // テーブルから基本移動時間を取得
  const table = TRAVEL_TIME_TABLE[mode];
  if (!table) {
    // 未知の交通手段 → car をフォールバック
    return estimateTravelTime("car", fromCategory, toCategory, isFromHome);
  }

  const rawTravel = table[distance];
  if (rawTravel === null) {
    // その交通手段では非現実的 → null
    // ただしフォールバックとして city の値を使う
    const fallback = table["city"];
    if (fallback === null) return null;
    const overhead = (TRANSPORT_OVERHEAD[mode] ?? 0) + (isFromHome ? HOME_DEPARTURE_OVERHEAD : 0);
    return {
      durationMin: roundTo15(fallback + overhead),
      rawTravelMin: fallback,
      overheadMin: overhead,
      distanceCategory: distance,
    };
  }

  const overhead = (TRANSPORT_OVERHEAD[mode] ?? 0) + (isFromHome ? HOME_DEPARTURE_OVERHEAD : 0);
  const total = rawTravel + overhead;

  return {
    durationMin: roundTo15(total),
    rawTravelMin: rawTravel,
    overheadMin: overhead,
    distanceCategory: distance,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ツアー構造の移動アイテム生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PlanItem[] にツアー構造の移動アイテムを挿入する。
 *
 * ツアー構造:
 *   [自宅] → 🚗移動 → [目的地1] → 🚗移動 → [目的地2] → 🚗移動 → [自宅]
 *
 * 挿入ルール:
 *   1. 外出プランの場合のみ挿入（goOut = true）
 *   2. 最初の場所アイテムの前に「自宅→目的地1」の移動を挿入
 *   3. 場所が異なるアイテム間に「目的地A→目的地B」の移動を挿入
 *   4. 最後の場所アイテムの後に「最終地→自宅」の移動を挿入
 *   5. 同じ場所のアイテム間には移動を挿入しない
 *
 * @param items - sequenceOrder でソート済みの PlanItem[]
 * @param transport - 主な交通手段
 * @param goOut - 外出するか
 * @returns 移動アイテムを含む新しい PlanItem[]
 */
export function insertTravelItems(
  items: PlanItem[],
  transport: TransportMode | string | undefined,
  goOut: boolean,
  returnDestination?: string,
): PlanItem[] {
  // 在宅なら移動なし
  if (!goOut) return items;

  // 場所を持つアイテムだけを抽出（travel は除外）
  const locationItems = items.filter(
    (item) => item.kind !== "travel" && item.location != null
  );
  if (locationItems.length === 0) return items;

  const result: PlanItem[] = [];
  let prevLocation: string | undefined = "home"; // 出発地は自宅

  // sequenceOrder 順に処理（items はソート済み前提）
  for (const item of items) {
    if (item.kind === "travel") continue; // 既存の travel は除外（再計算するため）

    const currentLocation = item.location?.canonicalId ?? item.location?.label;

    // 場所が変わった → 移動アイテムを挿入
    if (currentLocation && currentLocation !== prevLocation) {
      const fromLabel = prevLocation === "home" ? "自宅" : findLabelById(items, prevLocation);
      const toLabel = item.location?.label ?? currentLocation;
      const fromCategory = prevLocation === "home" ? "home" : findCategoryById(items, prevLocation);
      const toCategory = item.location?.category;
      const isFromHome = prevLocation === "home";

      // Layer 0/2: travelTimeTable で推定を試みる
      const tableLookup = lookupTravelTime(
        fromLabel, toLabel,
        prevLocation, currentLocation,
      );

      // travelTimeTable にヒット → その値を使用、なければ Layer 1 フォールバック
      const durationMin = tableLookup !== null
        ? roundTo15(tableLookup + (isFromHome ? HOME_DEPARTURE_OVERHEAD : 0))
        : estimateTravelTime(transport, fromCategory, toCategory, isFromHome)?.durationMin;

      if (durationMin) {
        const travelIcon = getTravelIcon(transport);
        result.push({
          id: `travel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: "travel",
          text: `${travelIcon} ${fromLabel}→${toLabel}`,
          what: null,
          durationMin,
          fixedStart: false,
          orderHint: 0,
          sourceTurnIndex: 0,
          completed: false,
          travelFrom: fromLabel,
          travelTo: toLabel,
          travelTransport: normalizeTransport(transport) as TransportMode,
        });
      }

      prevLocation = currentLocation;
    } else if (currentLocation) {
      prevLocation = currentLocation;
    }

    result.push(item);
  }

  // 帰路: 最終目的地 → 帰り先（デフォルト: 自宅。ホテル等もあり得る）
  if (prevLocation && prevLocation !== "home") {
    const fromLabel = findLabelById(items, prevLocation);
    const fromCategory = findCategoryById(items, prevLocation);
    const returnLabel = returnDestination ?? "自宅";
    const returnCategory = returnDestination ? "other" : "home";

    // Layer 0/2 → Layer 1 フォールバック
    const tableLookup = lookupTravelTime(fromLabel, returnLabel, prevLocation, "home");
    const durationMin = tableLookup !== null
      ? roundTo15(tableLookup)
      : estimateTravelTime(transport, fromCategory, returnCategory, false)?.durationMin;

    if (durationMin) {
      const travelIcon = getTravelIcon(transport);
      result.push({
        id: `travel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        kind: "travel",
        text: `${travelIcon} ${fromLabel}→${returnLabel}`,
        what: null,
        durationMin,
        fixedStart: false,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        travelFrom: fromLabel,
        travelTo: returnLabel,
        travelTransport: normalizeTransport(transport) as TransportMode,
      });
    }
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 15分単位に丸める（切り上げ）。研究推奨値 */
function roundTo15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

/** 交通手段を正規化 */
function normalizeTransport(transport: TransportMode | string | undefined): string {
  if (!transport) return "car"; // デフォルト
  const normalized = transport.toLowerCase();
  // 日本語 → 英語マッピング
  const map: Record<string, string> = {
    "電車": "train",
    "車": "car",
    "徒歩": "walk",
    "歩き": "walk",
    "自転車": "bicycle",
    "チャリ": "bicycle",
    "バス": "bus",
    "タクシー": "taxi",
    "バイク": "motorcycle",
  };
  return map[normalized] ?? normalized;
}

/** 交通手段に応じたアイコン */
function getTravelIcon(transport: TransportMode | string | undefined): string {
  const mode = normalizeTransport(transport);
  const icons: Record<string, string> = {
    car: "🚗",
    train: "🚃",
    walk: "🚶",
    bicycle: "🚲",
    bus: "🚌",
    taxi: "🚕",
    motorcycle: "🏍",
  };
  return icons[mode] ?? "🚗";
}

/** items 内から canonicalId or label で場所ラベルを探す */
function findLabelById(items: PlanItem[], id: string | undefined): string {
  if (!id) return "不明";
  for (const item of items) {
    if (item.location?.canonicalId === id) return item.location.label;
    if (item.location?.label === id) return item.location.label;
  }
  return id;
}

/** items 内から canonicalId or label で場所カテゴリを探す */
function findCategoryById(items: PlanItem[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  for (const item of items) {
    if (item.location?.canonicalId === id || item.location?.label === id) {
      return item.location.category;
    }
  }
  return undefined;
}
