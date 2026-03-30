/**
 * Celebration Engine
 * 初回イベントやストリークのマイルストーンで祝福を表示する。
 */

import type { DailyOrbitStore } from "./types";
import { originLoad, originStore } from "./originStorage";

export type Celebration = {
  text: string;
  emoji: string;
  type: "first_task" | "first_journal" | "streak_3" | "streak_7" | "streak_14" | "streak_30";
};

const SHOWN_KEY = "celebrations_shown";

function getShown(): string[] {
  return originLoad<string[]>(SHOWN_KEY) ?? [];
}

function markShown(type: string): void {
  const shown = getShown();
  if (!shown.includes(type)) {
    originStore(SHOWN_KEY, [...shown, type]);
  }
}

/**
 * タスク完了時にチェック。初回完了 or ストリーク祝福を返す。
 */
export function checkTaskCelebration(store: DailyOrbitStore): Celebration | null {
  const shown = getShown();

  // 初タスク完了
  const allEntries = Object.values(store.entries);
  const totalCompleted = allEntries.reduce(
    (sum, e) => sum + e.tasks.filter((t) => t.completed).length,
    0,
  );

  if (totalCompleted === 1 && !shown.includes("first_task")) {
    return {
      text: "最初のタスク完了。Originがあなたを観測し始めました",
      emoji: "🌱",
      type: "first_task",
    };
  }

  // ストリーク祝福
  const streak = store.currentStreak;
  const streakMilestones: { threshold: number; type: Celebration["type"]; text: string; emoji: string }[] = [
    { threshold: 3, type: "streak_3", text: "3日連続。最初の気づきが生まれつつあります", emoji: "🌿" },
    { threshold: 7, type: "streak_7", text: "1週間。パターンが見え始めています", emoji: "🌳" },
    { threshold: 14, type: "streak_14", text: "2週間の観測完了。プロフィールタブで法則をチェックしてみてください", emoji: "🌲" },
    { threshold: 30, type: "streak_30", text: "1ヶ月。あなたの取扱説明書が形になってきました", emoji: "🏔" },
  ];

  for (const ms of streakMilestones) {
    if (streak >= ms.threshold && !shown.includes(ms.type)) {
      return { text: ms.text, emoji: ms.emoji, type: ms.type };
    }
  }

  return null;
}

/** 祝福を表示済みとしてマーク */
export function markCelebrationShown(type: string): void {
  markShown(type);
}
