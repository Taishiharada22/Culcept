// lib/stargazer/notifications.ts
// Stargazer Push Notification Module
//
// Stargazer 各機能から sendPushToUser を呼び出すための薄いラッパー群。
// 各関数はユーザーの Stargazer 固有通知設定を確認してから送信する。

import { sendPushToUser, type PushPayload } from "@/lib/notifications/sendPush";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Stargazer 通知の種類 */
export type StargazerNotificationType =
  | "stargazer_prophecy"
  | "stargazer_blind_spot"
  | "stargazer_verification"
  | "stargazer_weekly"
  | "stargazer_prediction_hit"
  | "stargazer_streak_milestone"
  | "stargazer_accuracy_up"
  | "stargazer_new_pattern";

/** Stargazer 通知設定のデフォルト値 */
const STARGAZER_PREF_DEFAULTS: Record<StargazerNotificationType, boolean> = {
  stargazer_prophecy: true,
  stargazer_blind_spot: true,
  stargazer_verification: true,
  stargazer_weekly: true,
  stargazer_prediction_hit: true,
  stargazer_streak_milestone: true,
  stargazer_accuracy_up: true,
  stargazer_new_pattern: true,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preference Check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの Stargazer 通知設定を確認する。
 * user_notification_preferences テーブルの JSONB preferences カラムから
 * 該当タイプのフラグを読み取り、未設定の場合はデフォルト(true)を返す。
 */
export async function checkStargazerNotificationPreference(
  userId: string,
  type: StargazerNotificationType,
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("user_notification_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();

    const prefs = data?.preferences || {};

    // グローバル push が無効なら全て無効
    if (prefs.push_enabled === false) return false;

    // Stargazer 固有の設定を確認（未設定ならデフォルト値）
    const value = prefs[type];
    return value !== undefined ? Boolean(value) : STARGAZER_PREF_DEFAULTS[type];
  } catch (err) {
    console.error(`[stargazer/notifications] pref check failed userId=${userId}`, err);
    // エラー時はデフォルトで送信許可（通知を落とすよりは届ける方が安全）
    return true;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "...";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notification Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今日の予言を通知する
 */
export async function sendProphecyNotification(
  userId: string,
  prophecyText: string,
): Promise<{ sent: boolean; reason?: string }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_prophecy");
  if (!allowed) return { sent: false, reason: "preference_disabled" };

  const payload: PushPayload = {
    title: "🔮 今日の予言",
    body: truncate(prophecyText, 100),
    url: "/stargazer/prophecy",
    tag: "stargazer-prophecy",
  };

  return sendPushToUser(userId, payload);
}

/**
 * 見えない自分（Blind Spot Drop）を通知する
 */
export async function sendBlindSpotNotification(
  userId: string,
  dropText: string,
): Promise<{ sent: boolean; reason?: string }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_blind_spot");
  if (!allowed) return { sent: false, reason: "preference_disabled" };

  const payload: PushPayload = {
    title: "💧 見えない自分",
    body: truncate(dropText, 100),
    url: "/stargazer/blind-spot",
    tag: "stargazer-blind-spot",
  };

  return sendPushToUser(userId, payload);
}

/**
 * 予言の検証リマインダーを通知する
 */
export async function sendVerificationReminder(
  userId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_verification");
  if (!allowed) return { sent: false, reason: "preference_disabled" };

  const payload: PushPayload = {
    title: "✅ 予言の検証",
    body: "今日の予言は当たりましたか？確認しましょう",
    url: "/stargazer/prophecy",
    tag: "stargazer-verification",
  };

  return sendPushToUser(userId, payload);
}

/**
 * 週次の心の指紋（Psyche Signature）更新を通知する
 */
export async function sendWeeklySignatureNotification(
  userId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_weekly");
  if (!allowed) return { sent: false, reason: "preference_disabled" };

  const payload: PushPayload = {
    title: "✦ 心の指紋が更新されました",
    body: "今週のあなたの心の指紋を確認しましょう",
    url: "/stargazer/signature",
    tag: "stargazer-weekly",
  };

  return sendPushToUser(userId, payload);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bulk Helpers (cron ジョブ向け)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 Stargazer ユーザーに予言通知を一括送信する。
 * cron ジョブ (api/cron/stargazer-prophecy) から呼び出すことを想定。
 *
 * @param entries - userId と prophecyText のペア配列
 * @returns 送信結果のサマリー
 */
export async function sendProphecyNotificationsBulk(
  entries: { userId: string; prophecyText: string }[],
): Promise<{ total: number; sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    entries.map(({ userId, prophecyText }) =>
      sendProphecyNotification(userId, prophecyText),
    ),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.sent) {
      sent++;
    } else {
      skipped++;
    }
  }

  return { total: entries.length, sent, skipped };
}

/**
 * 全 Stargazer ユーザーに検証リマインダーを一括送信する。
 * cron ジョブ (api/cron/stargazer-verification) から呼び出すことを想定。
 */
export async function sendVerificationRemindersBulk(
  userIds: string[],
): Promise<{ total: number; sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    userIds.map((userId) => sendVerificationReminder(userId)),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.sent) {
      sent++;
    } else {
      skipped++;
    }
  }

  return { total: userIds.length, sent, skipped };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Extended Notifications (Sprint 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 予測的中通知: 「3日前の予測が的中しました！」 */
export async function sendPredictionHitNotification(
  userId: string,
  predictionText: string,
): Promise<{ sent: boolean }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_prediction_hit");
  if (!allowed) return { sent: false };

  const preview = predictionText.length > 40 ? predictionText.slice(0, 40) + "…" : predictionText;
  return sendPushToUser(userId, {
    title: "🎯 予測が的中しました",
    body: `「${preview}」— あなたのパターン理解が深まっています`,
    url: "/stargazer/prophecy",
    tag: "sg-prediction-hit",
  });
}

/** ストリークマイルストーン通知 */
export async function sendStreakMilestoneNotification(
  userId: string,
  streakDays: number,
): Promise<{ sent: boolean }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_streak_milestone");
  if (!allowed) return { sent: false };

  const milestoneMessages: Record<number, string> = {
    7: "1週間連続観測達成！ 最初のパターンが見え始める頃です",
    14: "2週間連続！ 曜日パターンの検出が始まりました",
    30: "30日連続 🌕 月の満ち欠け一周分のデータが集まりました",
    60: "60日連続。あなたの季節変動が見え始めています",
    100: "100日連続 ✦ 深層構造の解析が可能になりました",
  };

  const msg = milestoneMessages[streakDays];
  if (!msg) return { sent: false };

  return sendPushToUser(userId, {
    title: `🔥 ${streakDays}日連続観測`,
    body: msg,
    url: "/stargazer",
    tag: `sg-streak-${streakDays}`,
  });
}

/** 精度向上通知 */
export async function sendAccuracyUpNotification(
  userId: string,
  accuracy: number,
): Promise<{ sent: boolean }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_accuracy_up");
  if (!allowed) return { sent: false };

  return sendPushToUser(userId, {
    title: "📈 予測精度が向上しました",
    body: `あなたの予測的中率が${Math.round(accuracy)}%に到達。AIがあなたを理解し始めています`,
    url: "/stargazer",
    tag: "sg-accuracy-up",
  });
}

/** 新パターン発見通知 */
export async function sendNewPatternNotification(
  userId: string,
  patternDescription: string,
): Promise<{ sent: boolean }> {
  const allowed = await checkStargazerNotificationPreference(userId, "stargazer_new_pattern");
  if (!allowed) return { sent: false };

  return sendPushToUser(userId, {
    title: "🔍 新しいパターンが見つかりました",
    body: patternDescription,
    url: "/stargazer",
    tag: "sg-new-pattern",
  });
}
