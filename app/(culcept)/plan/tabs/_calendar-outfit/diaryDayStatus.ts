/**
 * Local Diary Day Dots — 日付ごとの diary 状態（read-only 集約）
 *
 * 役割:
 *   - DaySelectorStrip に「その日に記録があるか」を極小ドットで示すための状態を read-only で集約する。
 *
 * 2 系統（いずれも **書かない**）:
 *   - 同期版 `getDiaryDayStatus` / `buildDiaryStatusMap`: /plan 隔離 store のみ
 *     （`culcept_plan_outfit_selection_v1` + `culcept_plan_worn_v1`）。 即時/fallback 用。
 *   - 非同期版 `loadDiaryStatusMap`（Phase 3-D）: worn/rated は **shared WornHistory read-view**
 *     （plan worn + calendar worn を conflict 解決）から、 selected は selection store から。
 *     これで /calendar 現行着用履歴も dots に反映される（観測 consumer・write/学習/sync なし）。
 *
 * 制約:
 *   - **書かない**（localStorage write / saveWornRecord / server-sync / shared store write いずれも）。
 *   - calendar 履歴は **read-view 経由のみ**（`/calendar/_lib` 直 import 禁止）。
 *   - SSR / localStorage 不可 / read-view 失敗でも安全（空 or plan-only fallback、 throw しない）。
 *
 * 優先度: rated > worn > selected > none（1 日 1 状態に丸める）。
 *   - calendar 由来の `calendar_form` は satisfaction 必須のため通常 rated 扱い。
 */

import { loadWornHistoryView, type WornHistoryView } from "@/lib/shared/wornHistory";

import { getSelectionForDate } from "./outfitSelectionStore";
import { getWornForDate } from "./wornStore";

export type DiaryDayStatus = "none" | "selected" | "worn" | "rated";

/** 指定日の最も進んだ diary 状態を返す（rated > worn > selected > none）。 */
export function getDiaryDayStatus(dayIso: string): DiaryDayStatus {
  const worn = getWornForDate(dayIso);
  if (worn) return worn.satisfaction != null ? "rated" : "worn";
  if (getSelectionForDate(dayIso)) return "selected";
  return "none";
}

/**
 * 複数日の diary 状態を **sparse map**（状態のある日だけ）で返す。
 * none の日は含めない（呼び出し側は `map[iso] ?? "none"`）。
 */
export function buildDiaryStatusMap(dayIsos: string[]): Record<string, DiaryDayStatus> {
  const map: Record<string, DiaryDayStatus> = {};
  for (const iso of dayIsos) {
    const status = getDiaryDayStatus(iso);
    if (status !== "none") map[iso] = status;
  }
  return map;
}

/**
 * read-view ベースの diary 状態（Phase 3-D・観測 consumer・read-only）。
 *   - worn / rated は shared WornHistory read-view（plan worn + calendar worn を conflict 解決）から。
 *   - selected は selection store から（read-view は「着用」だけを扱い、「選択＝意図」は対象外）。
 *   - read-view 失敗時は同期 `buildDiaryStatusMap`（plan-only）へ fallback。 書き込みは一切しない。
 * 優先度は同期版と同じ rated > worn > selected > none（worn entry があれば selection より優先）。
 */
export async function loadDiaryStatusMap(
  dayIsos: string[],
): Promise<Record<string, DiaryDayStatus>> {
  let view: WornHistoryView;
  try {
    view = await loadWornHistoryView({ includeCalendar: true });
  } catch {
    return buildDiaryStatusMap(dayIsos); // read-view 失敗 → plan-only fallback
  }
  const wornByDate = new Map(view.entries.map((e) => [e.date, e]));
  const map: Record<string, DiaryDayStatus> = {};
  for (const iso of dayIsos) {
    const entry = wornByDate.get(iso);
    if (entry) {
      map[iso] = entry.satisfaction != null ? "rated" : "worn";
    } else if (getSelectionForDate(iso)) {
      map[iso] = "selected";
    }
    // none は sparse（含めない）。
  }
  return map;
}
