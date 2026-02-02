// app/api/notifications/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import webpush from "web-push";

export const runtime = "nodejs";

// VAPID設定
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@culcept.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface NotificationPayload {
    user_id?: string;
    user_ids?: string[];
    type: string;
    title: string;
    body: string;
    url?: string;
    image?: string;
    tag?: string;
    actions?: { action: string; title: string }[];
    data?: Record<string, any>;
}

/**
 * 通知送信API（内部用/管理者用）
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        // 管理者チェック（または内部API呼び出し）
        const apiKey = request.headers.get("x-api-key");
        const isInternal = apiKey === process.env.INTERNAL_API_KEY;

        if (!isInternal && !auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload: NotificationPayload = await request.json();

        if (!payload.type || !payload.title) {
            return NextResponse.json(
                { error: "type and title are required" },
                { status: 400 }
            );
        }

        // 対象ユーザーを特定
        let targetUserIds: string[] = [];

        if (payload.user_id) {
            targetUserIds = [payload.user_id];
        } else if (payload.user_ids) {
            targetUserIds = payload.user_ids;
        } else {
            return NextResponse.json(
                { error: "user_id or user_ids required" },
                { status: 400 }
            );
        }

        const results = {
            push_sent: 0,
            push_failed: 0,
            db_saved: 0,
            db_failed: 0,
        };

        // 各ユーザーに通知を送信
        for (const userId of targetUserIds) {
            // 1. ユーザーの通知設定を確認
            const { data: prefs } = await supabase
                .from("user_notification_preferences")
                .select("preferences")
                .eq("user_id", userId)
                .single();

            const userPrefs = prefs?.preferences || {};

            // 通知タイプに基づいて送信可否を判定
            if (!shouldSendNotification(payload.type, userPrefs)) {
                continue;
            }

            // おやすみモードチェック
            if (isQuietHours(userPrefs)) {
                continue;
            }

            // 2. DB保存（notifications テーブル）
            const { error: dbError } = await supabase.from("notifications").insert({
                user_id: userId,
                type: payload.type,
                title: payload.title,
                body: payload.body,
                link: payload.url,
                data: payload.data,
                read_at: null,
            });

            if (dbError) {
                console.error("DB insert error:", dbError);
                results.db_failed++;
            } else {
                results.db_saved++;
            }

            // 3. プッシュ通知送信
            if (userPrefs.push_enabled !== false) {
                const { data: subscription } = await supabase
                    .from("push_subscriptions")
                    .select("endpoint, keys")
                    .eq("user_id", userId)
                    .single();

                if (subscription && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
                    try {
                        await webpush.sendNotification(
                            {
                                endpoint: subscription.endpoint,
                                keys: subscription.keys,
                            },
                            JSON.stringify({
                                title: payload.title,
                                body: payload.body,
                                url: payload.url || "/",
                                tag: payload.tag || payload.type,
                                image: payload.image,
                                actions: payload.actions,
                            })
                        );
                        results.push_sent++;
                    } catch (pushError: any) {
                        console.error("Push send error:", pushError);
                        results.push_failed++;

                        // 410 Gone = サブスクリプション無効
                        if (pushError.statusCode === 410) {
                            await supabase
                                .from("push_subscriptions")
                                .delete()
                                .eq("user_id", userId);
                        }
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            results,
        });
    } catch (error) {
        console.error("Send notification error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/**
 * 通知タイプに基づいて送信可否を判定
 */
function shouldSendNotification(
    type: string,
    prefs: Record<string, any>
): boolean {
    const typeMap: Record<string, string> = {
        new_item: "new_items",
        price_drop: "price_drops",
        restock: "restock",
        seller_new_item: "favorite_seller",
        like: "likes_on_items",
        follow: "new_followers",
        message: "messages",
        purchase: "purchase_updates",
        weekly_digest: "weekly_digest",
        recommendation: "recommendations",
    };

    const prefKey = typeMap[type];
    if (!prefKey) return true; // 未定義のタイプはデフォルト送信

    return prefs[prefKey] !== false;
}

/**
 * おやすみモード中かどうかをチェック
 */
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

    // 日をまたぐ場合（例: 22:00-08:00）
    if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // 同日の場合（例: 12:00-14:00）
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
