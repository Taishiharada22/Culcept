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

interface AddedEntry {
  sourceId: string;
  item: ScheduleItem;
}

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
