/**
 * Seed Insight Engine
 * Day 1 専用のインサイト生成。履歴不要で即座にユーザーの行動を観測する。
 */

import type { DailyOrbitStore } from "./types";
import { originLoad, originStore } from "./originStorage";

export type SeedInsight = {
  text: string;
  category: "first_task" | "first_texture" | "time_of_day" | "first_journal";
  emoji: string;
};

const SHOWN_KEY = "seed_insight_shown";

/** 既に表示済みのカテゴリ一覧 */
function getShownCategories(): string[] {
  return originLoad<string[]>(SHOWN_KEY) ?? [];
}

function markShown(category: string): void {
  const shown = getShownCategories();
  if (!shown.includes(category)) {
    originStore(SHOWN_KEY, [...shown, category]);
  }
}

/**
 * Day 1-2 専用のインサイトを生成。
 * 返却後に markShown を呼んで重複防止すること。
 */
export function generateSeedInsight(
  store: DailyOrbitStore,
  today: string,
): SeedInsight | null {
  // Day 3 以降は発火しない
  const dayCount = store.firstUsedAt
    ? Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 1;
  if (dayCount > 2) return null;

  const shown = getShownCategories();
  const entry = store.entries[today];

  // 1. 初タスク完了後の感触観察
  if (!shown.includes("first_texture") && entry) {
    const textured = entry.tasks.find((t) => t.completed && t.texture);
    if (textured) {
      const labels: Record<string, string> = {
        satisfying: "達成感",
        relieved: "安堵感",
        just_done: "淡々とした完了感",
      };
      const label = labels[textured.texture!] ?? "完了";
      return {
        text: `初めての完了の感触は「${label}」。この積み重ねが、あなたの行動パターンを映し出します`,
        category: "first_texture",
        emoji: "✨",
      };
    }
  }

  // 2. 初タスク追加の観察
  if (!shown.includes("first_task") && entry && entry.tasks.length > 0) {
    const firstTask = entry.tasks[0];
    const taskText = firstTask.text.length > 20
      ? firstTask.text.slice(0, 20) + "…"
      : firstTask.text;
    return {
      text: `最初に書いたのは「${taskText}」。衝動か義務か好奇心か — ここから観測が始まります`,
      category: "first_task",
      emoji: "🌱",
    };
  }

  // 3. 時間帯の観察
  if (!shown.includes("time_of_day")) {
    const hour = new Date().getHours();
    let timeNote: string;
    if (hour < 6) {
      timeNote = "深夜にOriginを開いた。静けさの中で自分と向き合う時間を選んだようです";
    } else if (hour < 10) {
      timeNote = "朝のうちにOriginを開いた。1日の始まりに自分を整理するタイプかもしれません";
    } else if (hour < 14) {
      timeNote = "昼にOriginを開いた。日常の流れの中で立ち止まる瞬間を作りました";
    } else if (hour < 18) {
      timeNote = "午後にOriginを開いた。1日の折り返しに自分を見つめるタイミングです";
    } else {
      timeNote = "夜にOriginを開いた。1日を振り返る時間を大切にしているようです";
    }
    return {
      text: timeNote,
      category: "time_of_day",
      emoji: "🕐",
    };
  }

  return null;
}

/** Seed insight を表示済みとしてマーク */
export function markSeedInsightShown(category: string): void {
  markShown(category);
}
