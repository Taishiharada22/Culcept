// app/api/notifications/test/route.ts
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import webpush from "web-push";
import { apiOk, apiUnauthorized, apiNotFound, apiError, apiCatch } from "@/lib/api/response";

export const runtime = "nodejs";

// VAPID設定
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@aneurasync.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * テスト通知送信
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return apiUnauthorized();
        }

        // ユーザーのサブスクリプションを取得
        const { data: subscription, error } = await supabase
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("user_id", auth.user.id)
            .single();

        if (error || !subscription) {
            return apiNotFound("Push subscription not found");
        }

        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            return apiError("VAPID keys not configured", 500);
        }

        // テスト通知を送信
        const payload = JSON.stringify({
            title: "🎉 テスト通知",
            body: "Aneurasyncからの通知が正常に届いています！",
            url: "/settings/notifications",
            tag: "test",
            actions: [
                { action: "open", title: "設定を開く" },
                { action: "dismiss", title: "閉じる" },
            ],
        });

        await webpush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys: subscription.keys,
            },
            payload
        );

        return apiOk({ success: true });
    } catch (error: any) {
        // サブスクリプションが無効な場合
        if (error.statusCode === 410) {
            const supabase = await supabaseServer();
            const { data: auth } = await supabase.auth.getUser();
            if (auth?.user) {
                await supabase
                    .from("push_subscriptions")
                    .delete()
                    .eq("user_id", auth.user.id);
            }
            return apiError("Subscription expired, please re-enable", 410);
        }

        return apiCatch(error, "POST /api/notifications/test");
    }
}
