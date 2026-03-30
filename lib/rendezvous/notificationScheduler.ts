/**
 * Rendezvous 遅延通知スケジューラ
 *
 * Rendezvous のコア原則: 片想い完全非表示、遅延通知(3h-24h)
 * このモジュールは通知を即送信せず、ユーザーの設定に応じた
 * ディレイを計算してキューに入れる。
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ScheduledNotificationType =
  | "match_reveal"
  | "message_received"
  | "avatar_report"
  | "daily_resonance"
  | "nudge";

export type DelayMode = "fast" | "standard" | "slow";

interface ScheduleOptions {
  /** Rendezvous candidate ID（任意、候補に紐づく通知の場合） */
  candidateId?: string;
  /** 追加ペイロード */
  payload?: Record<string, unknown>;
}

/**
 * 遅延通知をスケジュールする
 *
 * 1. ユーザーの通知設定を読み込み
 * 2. 遅延時間を計算
 * 3. 静穏時間帯を考慮して調整
 * 4. キューに挿入
 */
export async function scheduleDelayedNotification(
  userId: string,
  type: ScheduledNotificationType,
  options: ScheduleOptions = {},
): Promise<{ scheduled: boolean; scheduledFor?: string; error?: string }> {
  try {
    // 1. ユーザーの通知遅延モード取得
    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("notification_delay_mode")
      .eq("user_id", userId)
      .maybeSingle();

    const mode: DelayMode =
      (profile?.notification_delay_mode as DelayMode) ?? "standard";

    // 2. 遅延時間を計算
    const delayMs = calculateDelay(mode, type);
    let scheduledFor = new Date(Date.now() + delayMs);

    // 3. 静穏時間帯チェック — 該当するなら翌朝8時にずらす
    const { data: prefs } = await supabaseAdmin
      .from("user_notification_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();

    const userPrefs = prefs?.preferences as Record<string, any> | undefined;
    if (userPrefs?.quiet_hours_enabled) {
      scheduledFor = adjustForQuietHours(scheduledFor, userPrefs);
    }

    // 4. キューに挿入
    const { error: insertErr } = await supabaseAdmin
      .from("rendezvous_notification_queue")
      .insert({
        user_id: userId,
        notification_type: type,
        payload: {
          ...options.payload,
          candidateId: options.candidateId,
        },
        scheduled_for: scheduledFor.toISOString(),
        status: "pending",
      });

    if (insertErr) {
      console.error(
        "[notificationScheduler] insert error:",
        insertErr.message,
      );
      return { scheduled: false, error: insertErr.message };
    }

    return {
      scheduled: true,
      scheduledFor: scheduledFor.toISOString(),
    };
  } catch (err: any) {
    console.error("[notificationScheduler] error:", err);
    return { scheduled: false, error: err.message ?? "Unknown error" };
  }
}

/**
 * 通知タイプと遅延モードに基づいてディレイを計算
 */
function calculateDelay(mode: DelayMode, type: ScheduledNotificationType): number {
  const HOUR = 60 * 60 * 1000;

  // match_reveal: Rendezvous の核心原則 — 最低3時間ディレイ
  if (type === "match_reveal") {
    switch (mode) {
      case "fast":
        return 3 * HOUR;
      case "standard":
        return randomBetween(3, 6) * HOUR;
      case "slow":
        return randomBetween(6, 24) * HOUR;
      default:
        return 4 * HOUR;
    }
  }

  // message_received: 短めのディレイ
  if (type === "message_received") {
    switch (mode) {
      case "fast":
        return randomBetween(1, 2) * HOUR;
      case "standard":
        return randomBetween(2, 4) * HOUR;
      case "slow":
        return randomBetween(4, 8) * HOUR;
      default:
        return 2 * HOUR;
    }
  }

  // その他 (avatar_report, daily_resonance, nudge): 中間ディレイ
  switch (mode) {
    case "fast":
      return randomBetween(1, 3) * HOUR;
    case "standard":
      return randomBetween(3, 6) * HOUR;
    case "slow":
      return randomBetween(6, 12) * HOUR;
    default:
      return 3 * HOUR;
  }
}

/**
 * 静穏時間帯に該当する場合、翌朝の終了時刻にずらす
 */
function adjustForQuietHours(
  date: Date,
  prefs: Record<string, any>,
): Date {
  const startStr: string = prefs.quiet_hours_start || "22:00";
  const endStr: string = prefs.quiet_hours_end || "08:00";

  const [startH, startM] = startStr.split(":").map(Number);
  const [endH, endM] = endStr.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  let isQuiet = false;
  if (startMinutes > endMinutes) {
    // 22:00-08:00 のようなケース（日をまたぐ）
    isQuiet = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    isQuiet = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  if (!isQuiet) return date;

  // 静穏時間帯終了時刻に調整
  const adjusted = new Date(date);
  if (currentMinutes >= startMinutes) {
    // 今日の夜 → 明日の朝
    adjusted.setDate(adjusted.getDate() + 1);
  }
  adjusted.setHours(endH, endM, 0, 0);
  // 少しランダムオフセット追加（0-30分）
  adjusted.setMinutes(adjusted.getMinutes() + Math.floor(Math.random() * 30));

  return adjusted;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
