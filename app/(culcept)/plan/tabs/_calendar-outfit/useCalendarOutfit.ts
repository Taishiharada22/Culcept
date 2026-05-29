"use client";

/**
 * Slice 2 — Calendar Outfit Dashboard data hook（orchestrator）
 *
 * 既定は固定 mock VM。 mount 後、 client 側で段階的に実データへ差し替える:
 *   - B-1: IndexedDB の画像付き wardrobe
 *   - B-2: 居住地の Open-Meteo 天気 → hero card
 *   - B-3/B-4A: 予定 → コーデ文脈 events
 *   - B-4B: wardrobe × weather × events を engine (generateTodayProposal, facade 経由) に渡し、
 *           **実コーデ提案**で mock proposals を差し替える
 *
 * 設計 (衝突しない単一オーケストレーション):
 *   - materials (wardrobe + weather) は **mount 時に 1 回**取得。
 *   - vm は [materials, anchors, dayIso] で **毎回 mock から再構築**（race しない / 上書き事故なし）。
 *   - 優先順位: engine 提案 > B-1 画像ハイドレート > mock。
 *
 * fallback (退化ゼロ・最重要):
 *   - wardrobe 空 / IDB 不可 / engine import 失敗 / proposal null / throw / weather 未取得
 *     → 該当部分は mock を維持。 engine 接続に失敗しても UI は壊れない。
 *   - SYNC・proposals 以外（理由カード・ワードローブ分析）は mock のまま（B-5 で実データ化）。
 *   - unmount 後に setState しない。
 */

import { useEffect, useState } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { WardrobeItem } from "@/lib/shared/wardrobe";

import { MOCK_CALENDAR_OUTFIT_VM } from "./mockCalendarOutfit";
import type { CalendarOutfitVM, CalendarOutfitWeatherVM } from "./types";
import { loadWardrobeImagesFromMyStyleIDB } from "./wardrobeAssets";
import { hydrateOutfitVM } from "./wardrobeToOutfit";
import { fetchOutfitWeather } from "./weatherSource";
import { anchorsToOutfitEvents } from "./anchorsToOutfitEvents";
import { projectCalendarEvents } from "./outfitEventProjection";
import { generateCalendarOutfitProposal } from "./outfitEngineAdapter";

interface OutfitMaterials {
  wardrobe: WardrobeItem[];
  weather: CalendarOutfitWeatherVM | null;
}

export function useCalendarOutfit({
  anchors,
  dayIso,
}: {
  anchors: ExternalAnchor[];
  dayIso: string;
}): CalendarOutfitVM {
  const [vm, setVm] = useState<CalendarOutfitVM>(MOCK_CALENDAR_OUTFIT_VM);
  const [materials, setMaterials] = useState<OutfitMaterials | null>(null);

  // ── materials を mount 時に 1 回だけ取得（wardrobe + weather、 並列、 失敗は空/null） ──
  useEffect(() => {
    let active = true;
    Promise.all([
      loadWardrobeImagesFromMyStyleIDB().catch(() => [] as WardrobeItem[]),
      fetchOutfitWeather().catch(() => null),
    ]).then(([wardrobe, weather]) => {
      if (active) setMaterials({ wardrobe, weather });
    });
    return () => {
      active = false;
    };
  }, []);

  // ── vm を [materials, anchors, dayIso] で再構築（mock から組み立て直す＝衝突しない） ──
  useEffect(() => {
    if (!materials) return; // materials 未取得の間は mock のまま
    let active = true;

    (async () => {
      const { wardrobe, weather } = materials;
      let next: CalendarOutfitVM = MOCK_CALENDAR_OUTFIT_VM;

      // B-2: 天気レイヤ
      if (weather) next = { ...next, weather };

      if (wardrobe.length > 0) {
        // B-3/B-4A: 選択日の予定 → engine events
        const dayObj = new Date(`${dayIso}T00:00:00.000Z`);
        const events = projectCalendarEvents(anchorsToOutfitEvents(anchors, dayObj));

        // B-4B: engine 接続（失敗時 null）
        const patch = await generateCalendarOutfitProposal({
          wardrobe,
          weather,
          events,
          date: dayIso,
        });
        if (!active) return;

        if (patch) {
          // engine 提案で proposals + SYNC を差し替え（理由・分析は mock のまま）
          next = { ...next, proposals: patch.proposals, sync: patch.sync };
        } else {
          // B-1 fallback: mock proposals を実画像でハイドレート（退化ゼロ）
          const hydrated = hydrateOutfitVM(next, wardrobe);
          if (hydrated !== next) next = hydrated;
        }
      }

      if (active) setVm(next);
    })();

    return () => {
      active = false;
    };
  }, [materials, anchors, dayIso]);

  return vm;
}
