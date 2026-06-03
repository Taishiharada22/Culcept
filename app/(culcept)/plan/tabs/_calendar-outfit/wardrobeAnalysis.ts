/**
 * Slice 2 (Option B-5B-read) — ワードローブ分析の実データ化（pure / read-only）
 *
 * 役割:
 *   - section ⑥「ワードローブ分析」の 5 小カードを、 mock 固定ではなく
 *     **実 wardrobe（B-1）× weather（B-2）× dayContext（B-4A）** から軽量に推定する。
 *   - 「手持ち服として成立しているか」を静かに伝える（煽らない）。
 *
 * 設計判断 (CEO/GPT B-5B-read):
 *   - 既存に流用できる wardrobe-gap 分析は無い（shared/calendar に該当なし）→ **ローカル軽量分析**。
 *     `/calendar/_lib` も engine も import しない。 pure。
 *   - データが無いのに断定しない：不明は「確認推奨 / 標準 / 不明」へ丸める。
 *   - 5 小カード構造（label / value / tone / icon）は維持。 置き換えるのはデータだけ。
 *
 * 不変原則: pure。 副作用 / I/O / write / DB / engine なし。 wardrobe を mutate しない。
 */

import type { WardrobeItem } from "@/lib/shared/wardrobe";

import { slotOfWardrobe } from "./wardrobeToOutfit";
import type { OutfitDayContext } from "./outfitEventProjection";
import type {
  CalendarOutfitStatVM,
  CalendarOutfitStatusTone,
  CalendarOutfitWeatherVM,
} from "./types";

interface WardrobeAnalysisInput {
  wardrobe: WardrobeItem[];
  weather: CalendarOutfitWeatherVM | null;
  dayContext: OutfitDayContext;
}

type SlotCounts = Record<"tops" | "bottoms" | "outer" | "shoes" | "bag" | "accessory", number>;

function countBySlot(wardrobe: WardrobeItem[]): SlotCounts {
  const counts: SlotCounts = { tops: 0, bottoms: 0, outer: 0, shoes: 0, bag: 0, accessory: 0 };
  for (const item of wardrobe) {
    const slot = slotOfWardrobe(item);
    if (slot) counts[slot] += 1;
  }
  return counts;
}

/** カテゴリ充足の value/tone（>=4 余裕 / >=2 良好 / >=1 最低限 / 0 不足） */
function sufficiency(count: number): { value: string; tone: CalendarOutfitStatusTone } {
  if (count >= 4) return { value: "余裕あり", tone: "good" };
  if (count >= 2) return { value: "良好", tone: "good" };
  if (count >= 1) return { value: "最低限", tone: "neutral" };
  return { value: "不足", tone: "caution" };
}

/** 防水アイテム：attributes.water があれば判定、 無ければ断定しない */
function rainReadiness(
  wardrobe: WardrobeItem[],
  weather: CalendarOutfitWeatherVM | null,
): { value: string; tone: CalendarOutfitStatusTone; caption?: string } {
  let rainCapable = 0;
  let hasWaterData = false;
  for (const item of wardrobe) {
    const w = item.attributes?.water;
    if (w !== undefined && w !== null) hasWaterData = true;
    if (w === "waterproof" || w === "repellent") rainCapable += 1;
  }
  if (rainCapable >= 1) return { value: "備えあり", tone: "good", caption: `${rainCapable}点` };
  if (!hasWaterData) return { value: "確認推奨", tone: "neutral", caption: "情報なし" };
  // データはあるが雨対応ゼロ
  if (weather && weather.pop >= 50) return { value: "やや不足", tone: "caution" };
  return { value: "標準", tone: "neutral" };
}

/** 歩きやすさ：靴の有無 × 当日の移動量（靴の種類までは断定しない） */
function walkability(
  shoesCount: number,
  dayContext: OutfitDayContext,
): { value: string; tone: CalendarOutfitStatusTone } {
  const mobile = dayContext.mobility === "high" || dayContext.mobility === "medium";
  if (mobile) {
    return shoesCount >= 1 ? { value: "良好", tone: "good" } : { value: "やや不足", tone: "caution" };
  }
  return shoesCount >= 1 ? { value: "標準", tone: "neutral" } : { value: "確認推奨", tone: "neutral" };
}

/** カラー相性：色の多様性（簡易、 後で本格化） */
function colorVariety(wardrobe: WardrobeItem[]): { value: string; tone: CalendarOutfitStatusTone; caption?: string } {
  const colors = new Set<string>();
  for (const item of wardrobe) {
    const c = (item.colorHex || item.colorName || item.color || "").trim().toLowerCase();
    if (c) colors.add(c);
  }
  const n = colors.size;
  if (n >= 4) return { value: "とても良い", tone: "accent", caption: `${n}色` };
  if (n >= 2) return { value: "良好", tone: "good", caption: `${n}色` };
  if (n === 1) return { value: "標準", tone: "neutral", caption: "1色" };
  return { value: "不明", tone: "neutral", caption: "情報なし" };
}

/**
 * 実 wardrobe からワードローブ分析 5 カードを生成。
 *   - wardrobe 空 → `null`（呼び出し側は mock 分析を維持）。
 *   - データ不足は断定せず「確認推奨 / 標準 / 不明」へ丸める。
 */
export function buildWardrobeStats(input: WardrobeAnalysisInput): CalendarOutfitStatVM[] | null {
  const { wardrobe, weather, dayContext } = input;
  if (!wardrobe || wardrobe.length === 0) return null;

  const counts = countBySlot(wardrobe);
  const tops = sufficiency(counts.tops);
  const bottoms = sufficiency(counts.bottoms);
  const rain = rainReadiness(wardrobe, weather);
  const walk = walkability(counts.shoes, dayContext);
  const color = colorVariety(wardrobe);

  return [
    { id: "stat-top", icon: "👕", label: "トップス", value: tops.value, tone: tops.tone, caption: `${counts.tops}点` },
    { id: "stat-bottom", icon: "👖", label: "ボトムス", value: bottoms.value, tone: bottoms.tone, caption: `${counts.bottoms}点` },
    { id: "stat-rain", icon: "☔", label: "防水アイテム", value: rain.value, tone: rain.tone, ...(rain.caption ? { caption: rain.caption } : {}) },
    { id: "stat-walk", icon: "👟", label: "歩きやすさ", value: walk.value, tone: walk.tone, caption: `${counts.shoes}点` },
    { id: "stat-color", icon: "🎨", label: "カラー相性", value: color.value, tone: color.tone, ...(color.caption ? { caption: color.caption } : {}) },
  ];
}
