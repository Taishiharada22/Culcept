"use client";

/**
 * Slice 2 — Calendar Outfit Dashboard data hook
 *
 * 役割:
 *   - 既定では固定 mock VM を返す (SSR / 初回描画は mock = 即時・レイアウトシフトなし)。
 *   - mount 後、 client 側 effect で段階的に実データへ差し替える:
 *       B-1: IndexedDB の画像付き wardrobe → コーデカードを表示用ハイドレーション (proposals)。
 *       B-2: 居住地の Open-Meteo 天気 → hero カードの weather。
 *   - 2 つの実データは **独立スライス** として functional update で合流する
 *     (片方が解決しても他方を上書きしない)。
 *
 * 制約 (CEO/GPT Option B-1 / B-2):
 *   - `generateTodayProposal` / AI / engine / Supabase / DB には触れない (SYNC・理由・分析は mock のまま)。
 *   - wardrobe 空 / IDB 読めない / weather 取得失敗 / 居住地未設定 → 該当スライスは mock を維持 (退化ゼロ)。
 *   - unmount 後に setState しない。 throw しない。
 */

import { useEffect, useState } from "react";

import { MOCK_CALENDAR_OUTFIT_VM } from "./mockCalendarOutfit";
import type { CalendarOutfitVM } from "./types";
import { loadWardrobeImagesFromMyStyleIDB } from "./wardrobeAssets";
import { hydrateOutfitVM } from "./wardrobeToOutfit";
import { fetchOutfitWeather } from "./weatherSource";

export function useCalendarOutfit(): CalendarOutfitVM {
  const [vm, setVm] = useState<CalendarOutfitVM>(MOCK_CALENDAR_OUTFIT_VM);

  useEffect(() => {
    let active = true;

    // B-1: wardrobe 画像 → proposals のみを差し替え (weather など他スライスは保持)。
    loadWardrobeImagesFromMyStyleIDB()
      .then((wardrobe) => {
        if (!active) return;
        if (!wardrobe || wardrobe.length === 0) return; // mock 維持
        const hydrated = hydrateOutfitVM(MOCK_CALENDAR_OUTFIT_VM, wardrobe);
        if (hydrated === MOCK_CALENDAR_OUTFIT_VM) return; // 変化なし → 維持
        setVm((prev) => ({ ...prev, proposals: hydrated.proposals }));
      })
      .catch(() => {
        /* 読み取り失敗 → mock 維持 */
      });

    // B-2: 居住地の天気 → hero カードの weather のみを差し替え。
    fetchOutfitWeather()
      .then((weather) => {
        if (!active || !weather) return; // 取得失敗 / 居住地未設定 → mock 維持
        setVm((prev) => ({ ...prev, weather }));
      })
      .catch(() => {
        /* 取得失敗 → mock 維持 */
      });

    return () => {
      active = false;
    };
  }, []);

  return vm;
}
