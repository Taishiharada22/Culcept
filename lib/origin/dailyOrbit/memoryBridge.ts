/**
 * Memory Bridge
 * 日常層（Daily Orbit）から深層（v7 Memory）への橋渡しロジック。
 * ジャーナルの感情 → 記憶探索の誘導、法則 → 記憶探索の示唆。
 */

import type { DailyOrbitStore, OrbitLaw } from "./types";
import { originCooldown } from "./originStorage";

export type MemoryPrompt = {
  text: string;
  trigger: "emotion" | "law";
};

// 記憶探索を誘発する強い感情タグ
const DEEP_EMOTION_TAGS = ["もやもや", "不安", "孤独", "感謝"];

// 法則カテゴリ → 記憶探索の誘導テキスト
const LAW_MEMORY_MAP: Record<string, string> = {
  nature_pattern: "この「本性パターン」は、いつ頃から続いているのでしょう？",
  shadow_theme: "影の意図の奥に、過去の経験が隠れているかもしれません",
  temporal_self: "時間的な自己の傾向は、人生のどの時期に形づくられたのでしょう",
  contradiction: "この矛盾の根っこに、過去の記憶がありそうですか？",
  emotion_next_day: "感情→翌日の連鎖の起点を、記憶の中に探ってみませんか？",
  not_doing_value: "「やらなかった価値」の原体験を振り返ってみると面白いかもしれません",
};

/**
 * ジャーナル保存後に呼ぶ。記憶探索を誘導するプロンプトを返す（または null）。
 * 3日以上使用後のみ発火。3日に1回の制限あり。
 */
export function shouldPromptMemoryDive(
  emotionTags: string[],
  journalBody: string,
  store: DailyOrbitStore,
): MemoryPrompt | null {
  // 使用開始から3日未満は発火しない
  const dayCount = store.firstUsedAt
    ? Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  if (dayCount < 3) return null;

  // 3日に1回の制限
  if (!originCooldown("memory_bridge", 3 * 24 * 3600 * 1000)) return null;

  // 強い感情タグがあれば誘導
  const deepTag = emotionTags.find((tag) => DEEP_EMOTION_TAGS.includes(tag));
  if (deepTag) {
    return {
      text: `「${deepTag}」の奥に、過去の記憶がありそうですか？`,
      trigger: "emotion",
    };
  }

  // ジャーナル本文にキーワードがあれば
  const keywords = ["昔", "子供の頃", "思い出", "あの時", "前は", "学生時代", "懐かしい"];
  const match = keywords.find((kw) => journalBody.includes(kw));
  if (match) {
    return {
      text: "今日の記録の中に、過去の記憶とつながる手がかりがありそうです",
      trigger: "emotion",
    };
  }

  return null;
}

/**
 * 法則発見時に記憶探索を示唆するテキストを返す。
 */
export function suggestMemoryFromLaw(law: OrbitLaw): string | null {
  return LAW_MEMORY_MAP[law.category] ?? null;
}
