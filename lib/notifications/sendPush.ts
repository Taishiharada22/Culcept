/**
 * Push通知送信ユーティリティ
 * web-push VAPIDを使用してブラウザプッシュ通知を送信
 * 内部ジョブから直接呼び出し可能（HTTP round-trip不要）
 */

import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@aneurasync.com";

let vapidConfigured = false;

function ensureVapid() {
  if (!vapidConfigured && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
  return vapidConfigured;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
  actions?: { action: string; title: string }[];
};

/**
 * 指定ユーザーにプッシュ通知を送信
 * @returns sent: true if push was delivered, false if skipped/failed
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: boolean; reason?: string }> {
  if (!ensureVapid()) {
    return { sent: false, reason: "vapid_not_configured" };
  }

  try {
    // Check user's notification preferences
    const { data: prefs } = await supabaseAdmin
      .from("user_notification_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();

    const userPrefs = prefs?.preferences || {};

    if (userPrefs.push_enabled === false) {
      return { sent: false, reason: "push_disabled" };
    }

    // Check quiet hours
    if (isQuietHours(userPrefs)) {
      return { sent: false, reason: "quiet_hours" };
    }

    // Get push subscription
    const { data: subscription } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", userId)
      .maybeSingle();

    if (!subscription) {
      return { sent: false, reason: "no_subscription" };
    }

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || "/rendezvous",
        tag: payload.tag || "rendezvous",
        image: payload.image,
        actions: payload.actions,
      }),
    );

    return { sent: true };
  } catch (err: any) {
    console.error(`[sendPush] userId=${userId} error:`, err?.statusCode, err?.message);

    // 410 Gone = subscription expired
    if (err?.statusCode === 410) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId);
      return { sent: false, reason: "subscription_expired" };
    }

    return { sent: false, reason: "push_error" };
  }
}

function isQuietHours(prefs: Record<string, any>): boolean {
  if (!prefs.quiet_hours_enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = (prefs.quiet_hours_start || "22:00")
    .split(":")
    .map(Number);
  const [endHour, endMin] = (prefs.quiet_hours_end || "08:00")
    .split(":")
    .map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
