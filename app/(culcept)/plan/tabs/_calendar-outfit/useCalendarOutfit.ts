"use client";

/**
 * Slice 1 — Calendar Outfit Dashboard data hook (mock 返却)
 *
 * CEO Slice 1 制約:
 *   - `generateTodayProposal` 実呼び出し / weather 実取得 / DB / AI は禁止。
 *   - この hook は **mock VM をそのまま返すだけ**。network / localStorage / 現在時刻参照なし。
 *
 * Slice 2 計画 (この hook の中だけが変わる):
 *   - params (wardrobe / date / weather / events / mood / persona) を受け取り、
 *     `@/lib/shared/outfitEngine` の generateTodayProposal を client-safe に呼び、
 *     TodayProposal / SyncScore / GapAnalysis → CalendarOutfitVM へ変換して返す。
 *   - 呼び出し側 (CalendarOutfitDashboard) の使用形は変えない。
 */

import { MOCK_CALENDAR_OUTFIT_VM } from "./mockCalendarOutfit";
import type { CalendarOutfitVM } from "./types";

export function useCalendarOutfit(): CalendarOutfitVM {
  // Slice 1: 固定 mock。Slice 2 で実 engine 結果へ差し替える。
  return MOCK_CALENDAR_OUTFIT_VM;
}
