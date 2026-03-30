// lib/stargazer/lifeEvents.ts
// ライフイベントトラッカー — 人生の出来事と性格変化の相関を分析
// 心理学的根拠: 生活変化尺度（Holmes & Rahe, 1967）、ライフイベントと性格変化

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import { safeLSSet } from "@/lib/safeLocalStorage";

const STORAGE_KEY = "stargazer_life_events_v1";

export type EventCategory = "relationship" | "career" | "health" | "life" | "internal";

export interface LifeEvent {
  id: string;
  date: string;
  category: EventCategory;
  title: string;
  description?: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  isPositive: boolean;
}

export interface EventAxisCorrelation {
  event: LifeEvent;
  axisChanges: Array<{
    axis: TraitAxisKey;
    axisLabel: string;
    before: number;
    after: number;
    shift: number;
  }>;
}

export const EVENT_CATEGORY_LABELS: Record<EventCategory, { label: string; icon: string }> = {
  relationship: { label: "人間関係", icon: "💞" },
  career: { label: "仕事・キャリア", icon: "💼" },
  health: { label: "健康", icon: "🏥" },
  life: { label: "生活の変化", icon: "🏠" },
  internal: { label: "内面の気づき", icon: "💡" },
};

export function loadEvents(): LifeEvent[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveEvent(event: LifeEvent): void {
  const events = loadEvents();
  events.push(event);
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  safeLSSet(STORAGE_KEY, JSON.stringify(events));
}

export function removeEvent(id: string): void {
  const events = loadEvents().filter((e) => e.id !== id);
  safeLSSet(STORAGE_KEY, JSON.stringify(events));
}

/**
 * ライフイベントと軸スコアの変化を相関分析する
 * localStorageのスナップショットデータと照合
 */
export function correlateWithAxisShifts(
  events: LifeEvent[],
  axisSnapshots: Array<{
    date: string;
    scores: Partial<Record<TraitAxisKey, number>>;
  }>,
): EventAxisCorrelation[] {
  const correlations: EventAxisCorrelation[] = [];

  for (const event of events) {
    const eventDate = new Date(event.date).getTime();

    // Find closest snapshot BEFORE event (within 14 days)
    const before = axisSnapshots
      .filter((s) => {
        const d = new Date(s.date).getTime();
        return d < eventDate && eventDate - d < 14 * 24 * 60 * 60 * 1000;
      })
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )[0];

    // Find closest snapshot AFTER event (within 14 days)
    const after = axisSnapshots
      .filter((s) => {
        const d = new Date(s.date).getTime();
        return d > eventDate && d - eventDate < 14 * 24 * 60 * 60 * 1000;
      })
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )[0];

    if (!before || !after) continue;

    const axisChanges: EventAxisCorrelation["axisChanges"] = [];

    for (const [axis, beforeScore] of Object.entries(before.scores) as [
      TraitAxisKey,
      number,
    ][]) {
      const afterScore = after.scores[axis];
      if (afterScore === undefined) continue;

      const shift = afterScore - beforeScore;
      if (Math.abs(shift) < 0.1) continue; // Only significant changes

      const def = TRAIT_AXES.find((a) => a.id === axis);
      axisChanges.push({
        axis,
        axisLabel: def ? `${def.labelLeft} ↔ ${def.labelRight}` : axis,
        before: beforeScore,
        after: afterScore,
        shift,
      });
    }

    if (axisChanges.length > 0) {
      correlations.push({
        event,
        axisChanges: axisChanges.sort(
          (a, b) => Math.abs(b.shift) - Math.abs(a.shift),
        ),
      });
    }
  }

  return correlations;
}
