// app/(culcept)/calendar/_lib/travel/itineraryConvert.ts
// Location Notes の項目（LocationItem）→ その日の旅程（ScheduleItem）への純変換。
// UI 非依存。store/UI から変換ルールを隔離し、main 接続時もここだけ差し替えれば良い境界。

import type { LocationItem, ScheduleItem } from "./types";

/**
 * LocationItem を「旅程に追加」した際の ScheduleItem を生成する。
 * - id は `added-<元id>` で fixture（s1..）と衝突回避
 * - startTime は空（時刻未定枠）→ ScheduleDetail の時刻カラムは崩さず末尾に積む
 * - categories は ジャンル＋タグ先頭2件、無ければ kind ラベル
 */
export function locationItemToScheduleItem(item: LocationItem): ScheduleItem {
  const categories = [item.genre, ...item.tags.slice(0, 2)].filter(Boolean);
  return {
    id: `added-${item.id}`,
    startTime: "",
    name: item.title,
    subtitle: item.areaLabel,
    categories: categories.length ? categories : [item.kind === "trip" ? "旅行プラン" : "スポット"],
    description: item.description,
    photo: item.photo,
    address: item.address,
  };
}
