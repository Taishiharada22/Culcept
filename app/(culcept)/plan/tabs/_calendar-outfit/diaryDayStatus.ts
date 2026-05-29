/**
 * Slice 2 (Local Diary Day Dots) — 日付ごとの diary 状態（read-only 集約）
 *
 * 役割:
 *   - DaySelectorStrip に「その日に記録があるか」を極小ドットで示すための状態を、
 *     /plan 隔離 store **だけ**から read-only で集約する。
 *
 * 制約:
 *   - 読むのは `culcept_plan_outfit_selection_v1`（選択）と `culcept_plan_worn_v1`（着用＋感触）のみ。
 *   - **書かない**。学習・server-sync・shared WornHistory には一切触れない。
 *   - SSR / localStorage 不可でも安全（store 側が空を返す）。 pure（render から直接呼んでも安全だが、
 *     呼び出し側は effect/hook 経由で 1 回だけ集約する想定）。
 *
 * 優先度: rated > worn > selected > none（1 日 1 状態に丸める）。
 */

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
