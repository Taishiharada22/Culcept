// lib/shared/timeOfDay.ts
// 時間帯判定ユーティリティ — HOME ロボ + Stargazer 共有

/**
 * 3帯分類 — Stargazer ObserveTab / 会話カテゴリ選択用
 */
export type TimeOfDay = "morning" | "afternoon" | "night";

export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

/**
 * 5帯分類 — HOME ロボ挨拶用（より細かい時間帯）
 */
export type TimeOfDayDetail =
  | "late_night"
  | "morning"
  | "afternoon"
  | "late_afternoon"
  | "evening";

export function getTimeOfDayDetail(): TimeOfDayDetail {
  const h = new Date().getHours();
  if (h < 5) return "late_night";
  if (h < 12) return "morning";
  if (h < 15) return "afternoon";
  if (h < 18) return "late_afternoon";
  return "evening";
}

/**
 * 時間帯別の挨拶テンプレート (HOME ロボ用)
 */
export const TIME_DETAIL_GREETINGS: Record<
  TimeOfDayDetail,
  { emoji: string; text: string }
> = {
  late_night: {
    emoji: "🌌",
    text: "まだ起きてる？ 夜型の観測も貴重なデータ。",
  },
  morning: {
    emoji: "🌅",
    text: "おはよう。朝の頭はクリア — 今日の自分を少し見てみよう。",
  },
  afternoon: {
    emoji: "☀️",
    text: "午後だね。午前中の自分と何か変わった？",
  },
  late_afternoon: {
    emoji: "🌇",
    text: "夕方か。一日の流れが見えてくる時間帯。",
  },
  evening: {
    emoji: "🌙",
    text: "おつかれさま。今日はどんな一日だった？",
  },
};
