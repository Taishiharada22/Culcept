/**
 * Origin Daily Orbit — 通知リマインダー
 * 朝のタスクリマインダー、夜のジャーナルリマインダー、On This Day通知。
 * Push通知インフラ (lib/push/sendPushNotification.ts) を利用。
 */

import { sendPushToUser, type PushPayload } from "@/lib/push/sendPushNotification";

/**
 * 朝のタスクリマインダー（Cronから呼ばれる想定）
 * 昨日の未完了タスクがあれば通知。
 */
export async function sendMorningTaskReminder(
  userId: string,
  pendingCount: number,
  prediction?: string,
): Promise<void> {
  const body = prediction
    ? `${prediction}`
    : pendingCount > 0
    ? `昨日の残り${pendingCount}件を確認しましょう`
    : "今日の計画を立ててみましょう";

  await sendPushToUser(userId, {
    title: "🌅 Originからの朝の一言",
    body,
    url: "/origin",
    tag: "origin-morning",
  });
}

/**
 * 夕方のジャーナルリマインダー
 * 今日のタスクが1つ以上完了していれば通知。
 */
export async function sendEveningJournalReminder(
  userId: string,
  completedCount: number,
): Promise<void> {
  const body = completedCount > 0
    ? `今日は${completedCount}件を完了しました。記録を残しませんか？`
    : "今日はどんな日でしたか？ひとことだけでも書いてみてください";

  await sendPushToUser(userId, {
    title: "📝 今日の記録",
    body,
    url: "/origin",
    tag: "origin-evening",
  });
}

/**
 * On This Day 通知
 * 過去の同日にジャーナルがある場合に通知。
 */
export async function sendOnThisDayReminder(
  userId: string,
  period: string, // "1ヶ月前" etc.
  snippet: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: `✨ ${period}のあなた`,
    body: snippet.length > 80 ? snippet.slice(0, 77) + "..." : snippet,
    url: "/origin",
    tag: "origin-on-this-day",
  });
}

/**
 * 習慣リマインダー
 * 繰り返しタスクが未完了のまま夕方を迎えた場合。
 */
export async function sendHabitReminder(
  userId: string,
  habitText: string,
  streak: number,
): Promise<void> {
  const streakMsg = streak > 0 ? `（${streak}日連続中）` : "";
  await sendPushToUser(userId, {
    title: "🔄 習慣のリマインダー",
    body: `「${habitText}」がまだ未完了です${streakMsg}`,
    url: "/origin",
    tag: `origin-habit-${habitText.slice(0, 10)}`,
  });
}

/**
 * 法則発見通知
 * 新しい行動法則が発見された時。
 */
export async function sendLawDiscoveryNotification(
  userId: string,
  lawText: string,
): Promise<void> {
  await sendPushToUser(userId, {
    title: "🔍 新しい法則を発見",
    body: lawText.length > 80 ? lawText.slice(0, 77) + "..." : lawText,
    url: "/origin",
    tag: "origin-law-discovery",
  });
}
