// app/(culcept)/calendar/_components/travel/state/ItineraryContext.tsx
// 「旅程に追加」を Dashboard / Schedule 横断で実反映するための最小ストア。
// fixture の day.schedule は不変のまま、追加分(addedItems)だけ session 内 state で保持し、
// 消費側は useMergedSchedule(day) で合成 schedule を読む。
// main 接続時は本 Provider 内部を実 trip API の mutation+optimistic に差し替えるだけで
// useTravelItinerary / useMergedSchedule の公開シグネチャは不変＝消費側ゼロ改修。
"use client";

import * as React from "react";
import type { LocationItem, ScheduleItem, TripDay } from "../../../_lib/travel/types";
import { locationItemToScheduleItem } from "../../../_lib/travel/itineraryConvert";
// E-1: localStorage 直呼びをやめ、TravelPersonalStore 境界経由（既定は localStorage を Promise でラップ・挙動不変）。
import { getTravelPersonalStore, type StoredAddedEntry } from "../../../_lib/travel/repository";

type AddedEntry = StoredAddedEntry;

interface ItineraryContextValue {
  addedItems: ScheduleItem[];
  addedCount: number;
  /** 追加成功で true、重複（既追加）なら false。 */
  addToItinerary: (item: LocationItem) => boolean;
  removeAdded: (sourceId: string) => void;
  hasAdded: (sourceId: string) => boolean;
}

const ItineraryContext = React.createContext<ItineraryContextValue | null>(null);

export function TravelItineraryProvider({ children }: { children: React.ReactNode }) {
  const [added, setAdded] = React.useState<AddedEntry[]>([]);

  // store から復元（client-only。SSR/hydration mismatch を避けるため mount 後 effect で）。
  // 既定 store=localStorage は即解決。unmount 後は cancelled guard で setState を抑止。
  React.useEffect(() => {
    let cancelled = false;
    void getTravelPersonalStore()
      .readAddedEntries()
      .then((stored) => {
        if (!cancelled && stored.length) setAdded(stored);
      })
      .catch(() => {
        /* fail-soft（復元失敗は空のまま） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 変更時 persist（初回 mount の空 [] で既存データを上書きしないよう skip-first）。fire-and-forget。
  const firstPersist = React.useRef(true);
  React.useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    void getTravelPersonalStore().writeAddedEntries(added).catch(() => {});
  }, [added]);

  const addToItinerary = React.useCallback((item: LocationItem): boolean => {
    let ok = false;
    setAdded((prev) => {
      if (prev.some((a) => a.sourceId === item.id)) {
        ok = false;
        return prev;
      }
      ok = true;
      return [...prev, { sourceId: item.id, item: locationItemToScheduleItem(item) }];
    });
    return ok;
  }, []);

  const removeAdded = React.useCallback((sourceId: string) => {
    setAdded((prev) => prev.filter((a) => a.sourceId !== sourceId));
  }, []);

  const value = React.useMemo<ItineraryContextValue>(() => {
    const ids = new Set(added.map((a) => a.sourceId));
    return {
      addedItems: added.map((a) => a.item),
      addedCount: added.length,
      addToItinerary,
      removeAdded,
      hasAdded: (sourceId: string) => ids.has(sourceId),
    };
  }, [added, addToItinerary, removeAdded]);

  return <ItineraryContext.Provider value={value}>{children}</ItineraryContext.Provider>;
}

export function useTravelItinerary(): ItineraryContextValue {
  const ctx = React.useContext(ItineraryContext);
  if (!ctx) throw new Error("useTravelItinerary must be used within TravelItineraryProvider");
  return ctx;
}

/** fixture schedule＋追加分を合成して読む（Dashboard / Schedule 共通）。 */
export function useMergedSchedule(day: TripDay): ScheduleItem[] {
  const { addedItems } = useTravelItinerary();
  return React.useMemo(() => [...day.schedule, ...addedItems], [day.schedule, addedItems]);
}
