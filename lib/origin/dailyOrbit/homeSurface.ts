/**
 * Home Surface Engine
 * Origin の法則・インサイトをホーム画面に浮上させる。
 * 1日1回まで、最も優先度の高いものを1つ選定。
 */

import type { DailyOrbitStore, OrbitLaw } from "./types";
import { generateBehavioralLaws } from "./behavioralLawEngine";
import { originLoad, originStore } from "./originStorage";
import { loadMemoryGems } from "@/lib/origin/v7/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OriginHomeSurface = {
  type: "new_law" | "law_reminder" | "streak" | "weather_drift" | "milestone" | "memory_echo";
  text: string;
  emoji: string;
  priority: number; // 0-1
  lawId?: string;
};

// ---------------------------------------------------------------------------
// Frequency control (1/day via originStorage)
// ---------------------------------------------------------------------------

const SURFACE_KEY = "home_surface";

function hasShownToday(today: string): boolean {
  const last = originLoad<string>(SURFACE_KEY + "_date");
  return last === today;
}

function markShown(today: string): void {
  originStore(SURFACE_KEY + "_date", today);
}

// ---------------------------------------------------------------------------
// Selection logic
// ---------------------------------------------------------------------------

export function selectHomeSurface(
  store: DailyOrbitStore,
  today: string,
): OriginHomeSurface | null {
  if (hasShownToday(today)) return null;

  const candidates: OriginHomeSurface[] = [];

  // 1. New behavioral law discovered (highest priority)
  try {
    const bLaws = generateBehavioralLaws(store);
    for (const gl of bLaws) {
      if (gl.isNew) {
        candidates.push({
          type: "new_law",
          text: `「${truncate(gl.law.text, 50)}」— 新しい法則が見つかりました`,
          emoji: "✨",
          priority: 1.0,
          lawId: gl.law.id,
        });
      }
    }
  } catch {}

  // 2. Streak milestones
  const streak = store.currentStreak ?? 0;
  if ([7, 14, 21, 30, 60, 90].includes(streak)) {
    candidates.push({
      type: "streak",
      text: `${streak}日連続で記録中。あなたの取扱説明書が着実に育っています`,
      emoji: "🔥",
      priority: 0.7,
    });
  }

  // 3. Law reminder (high-confidence law not seen in 7+ days)
  const allLaws = store.orbitLaws ?? [];
  if (allLaws.length > 0) {
    const lastReminder = originLoad<string>(SURFACE_KEY + "_last_law");
    const highConfLaws = allLaws
      .filter((l) => l.confidence >= 0.8 && l.id !== lastReminder)
      .sort((a, b) => b.confidence - a.confidence);

    if (highConfLaws.length > 0) {
      const law = highConfLaws[0];
      candidates.push({
        type: "law_reminder",
        text: `「${truncate(law.text, 50)}」`,
        emoji: "📖",
        priority: 0.4,
        lawId: law.id,
      });
    }
  }

  // 4. Discovery milestone
  const dayCount = store.firstUsedAt
    ? Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  const milestones = [14, 30, 60, 90];
  if (milestones.includes(dayCount)) {
    candidates.push({
      type: "milestone",
      text: `Origin ${dayCount}日目。${allLaws.length}件の法則が見つかっています`,
      emoji: "🎉",
      priority: 0.6,
    });
  }

  // 5. Memory echo (gems or chapter reminders)
  try {
    const gems = loadMemoryGems();
    if (gems.length > 0) {
      // Pick a random gem to echo
      const gem = gems[Math.floor(Math.random() * gems.length)];
      const title = gem.title || "あの記憶";
      candidates.push({
        type: "memory_echo",
        text: `「${truncate(title, 30)}」— 深層の記憶が、今日のあなたとどう繋がっているでしょう`,
        emoji: "💎",
        priority: 0.5,
      });
    }
  } catch {}

  if (candidates.length === 0) return null;

  // Sort by priority, pick highest
  candidates.sort((a, b) => b.priority - a.priority);
  const chosen = candidates[0];

  markShown(today);
  if (chosen.lawId) {
    originStore(SURFACE_KEY + "_last_law", chosen.lawId);
  }

  return chosen;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
