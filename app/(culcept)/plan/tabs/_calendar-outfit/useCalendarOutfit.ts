"use client";

/**
 * Slice 2 (Option B-1) — Calendar Outfit Dashboard data hook
 *
 * 役割:
 *   - 既定では固定 mock VM を返す (SSR / 初回描画は mock = 即時・レイアウトシフトなし)。
 *   - mount 後、 client 側 effect で IndexedDB の **画像付き wardrobe** を read-only で読み、
 *     あれば mock のコーデカードを実画像で **表示用ハイドレーション**する。
 *
 * 制約 (CEO/GPT Option B-1):
 *   - `generateTodayProposal` / weather 実取得 / DB / AI / engine には触れない (= まだ推薦しない)。
 *   - wardrobe が空 / IDB 読めない / 失敗 → mock を維持 (退化ゼロ、 throw しない)。
 *   - unmount 後に setState しない。
 *
 * Slice 2 以降 (B-2+) でこの hook の中だけが段階的に実データ化される
 *   (weather → events 写像 → generateTodayProposal → reasons/analysis)。
 */

import { useEffect, useState } from "react";

import { MOCK_CALENDAR_OUTFIT_VM } from "./mockCalendarOutfit";
import type { CalendarOutfitVM } from "./types";
import { loadWardrobeImagesFromMyStyleIDB } from "./wardrobeAssets";
import { hydrateOutfitVM } from "./wardrobeToOutfit";

export function useCalendarOutfit(): CalendarOutfitVM {
  // 初期値は mock。 ハイドレーションで何も変わらない場合、 hydrateOutfitVM は同じ参照を返すため
  // setVm しても React は再描画をスキップする。
  const [vm, setVm] = useState<CalendarOutfitVM>(MOCK_CALENDAR_OUTFIT_VM);

  useEffect(() => {
    let active = true;
    loadWardrobeImagesFromMyStyleIDB()
      .then((wardrobe) => {
        if (!active) return;
        if (!wardrobe || wardrobe.length === 0) return; // mock 維持
        const hydrated = hydrateOutfitVM(MOCK_CALENDAR_OUTFIT_VM, wardrobe);
        if (hydrated !== MOCK_CALENDAR_OUTFIT_VM) setVm(hydrated);
      })
      .catch(() => {
        /* 読み取り失敗 → mock 維持 */
      });
    return () => {
      active = false;
    };
  }, []);

  return vm;
}
