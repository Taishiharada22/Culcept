/**
 * Cron: Rendezvous 遅延通知ディスパッチ
 * 5分間隔で実行 — pending 状態のキューから送信可能な通知を処理
 *
 * Vercel Cron: "* /5 * * * *" (vercel.json)
 * または手動: POST with CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser, type PushPayload } from "@/lib/notifications/sendPush";

const NOTIFICATION_MESSAGES: Record<
  string,
  { title: string; body: string; url?: string }
> = {
  match_reveal: {
    title: "新しい交差が見つかりました",
    body: "分身があなたとの共鳴を感じた人を見つけました",
    url: "/rendezvous",
  },
  message_received: {
    title: "新しいメッセージ",
    body: "トークに新しいメッセージが届いています",
  },
  avatar_report: {
    title: "分身からの報告",
    body: "分身が新しい観測結果を報告しています",
    url: "/rendezvous",
  },
  daily_resonance: {
    title: "今日の共鳴",
    body: "今日のあなたに共鳴する人がいます",
    url: "/rendezvous",
  },
  nudge: {
    title: "Rendezvous",
    body: "少し覗いてみませんか？",
    url: "/rendezvous",
  },
};

export async function POST(request: NextRequest) {
  const t = await trackCronRun("rendezvous-notification-dispatch");
  try {
    // Auth via CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      await t.finish({ ok: false, summary: "unauthorized" });
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const now = new Date().toISOString();

    // pending で scheduled_for が過ぎたものを取得
    const { data: notifications, error: fetchErr } = await supabaseAdmin
      .from("rendezvous_notification_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 },
      );
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ ok: true, dispatched: 0 });
    }

    let dispatched = 0;
    let failed = 0;

    for (const notif of notifications) {
      try {
        const type = notif.notification_type as string;
        const payload = (notif.payload ?? {}) as Record<string, unknown>;
        const candidateId = payload.candidateId as string | undefined;

        // 通知テキスト生成
        const template = NOTIFICATION_MESSAGES[type] ?? {
          title: "Rendezvous",
          body: "更新があります",
        };

        const pushUrl = candidateId
          ? `/rendezvous/${candidateId}`
          : template.url ?? "/rendezvous";

        // DB通知レコード作成
        await supabaseAdmin.from("notifications").insert({
          user_id: notif.user_id,
          type: `rendezvous_${type}`,
          title: template.title,
          body: template.body,
          link: pushUrl,
          data: { candidateId, notificationType: type, ...payload },
          read_at: null,
        });

        // プッシュ通知送信
        const pushPayload: PushPayload = {
          title: template.title,
          body: template.body,
          url: pushUrl,
          tag: `rendezvous_${type}`,
        };

        const pushResult = await sendPushToUser(notif.user_id, pushPayload);

        // ステータス更新
        await supabaseAdmin
          .from("rendezvous_notification_queue")
          .update({
            status: "sent",
            sent_at: now,
          })
          .eq("id", notif.id);

        if (!pushResult.sent) {
          console.warn(
            `[notification-dispatch] push skipped for ${notif.user_id}: ${pushResult.reason}`,
          );
        }

        dispatched++;
      } catch (innerErr: any) {
        console.error(
          `[notification-dispatch] failed for ${notif.id}:`,
          innerErr,
        );

        // エラー記録して次へ
        await supabaseAdmin
          .from("rendezvous_notification_queue")
          .update({
            status: "failed",
            error: innerErr.message ?? "Unknown error",
          })
          .eq("id", notif.id);

        failed++;
      }
    }

    await t.finish({ ok: failed === 0, summary: `dispatched=${dispatched}, failed=${failed}` });
    return NextResponse.json({ ok: true, dispatched, failed });
  } catch (err: any) {
    console.error("[notification-dispatch] error:", err);
    await t.finish({ ok: false, summary: err.message ?? "fatal" });
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

/** GET handler for Vercel Cron */
export async function GET(request: NextRequest) {
  // Vercel Cron sends GET requests
  return POST(request);
}
