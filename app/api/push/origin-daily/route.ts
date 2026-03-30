// app/api/push/origin-daily/route.ts
// Cron: Origin日次通知
// 朝: 「今日の記憶が届いています」→ /origin (マイクロ質問)
// 夜: 「今日の軌道を記録しませんか？」→ /origin (DailyOrbit)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser, type PushPayload } from "@/lib/push/sendPushNotification";

export const dynamic = "force-dynamic";

const MORNING_PAYLOAD: PushPayload = {
  title: "今日の記憶",
  body: "今日の記憶が届いています。ひとつ答えてみませんか？",
  icon: "/icons/icon.svg",
  url: "/origin",
  tag: "origin-daily-morning",
};

const EVENING_PAYLOAD: PushPayload = {
  title: "今日の軌道",
  body: "今日の軌道を記録しませんか？ 1分で終わります。",
  icon: "/icons/icon.svg",
  url: "/origin",
  tag: "origin-daily-evening",
};

export async function POST(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine time of day (JST = UTC+9)
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  const isMorning = jstHour >= 7 && jstHour <= 10;
  const isEvening = jstHour >= 20 && jstHour <= 22;

  if (!isMorning && !isEvening) {
    return NextResponse.json({ skipped: true, reason: "Outside notification window" });
  }

  const payload = isMorning ? MORNING_PAYLOAD : EVENING_PAYLOAD;

  // Get users with push subscriptions who have origin_daily enabled
  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .limit(500);

  if (error || !subscriptions) {
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }

  // Deduplicate user IDs
  const userIds = [...new Set(subscriptions.map((s) => s.user_id))];

  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const result = await sendPushToUser(userId, payload);
      sent += result.sent;
      failed += result.failed;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    type: isMorning ? "morning" : "evening",
    sent,
    failed,
    total: userIds.length,
  });
}
