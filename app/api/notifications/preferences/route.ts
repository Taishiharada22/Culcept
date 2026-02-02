// app/api/notifications/preferences/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 通知設定の取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // user_notification_preferences テーブルから取得
        const { data: prefs, error } = await supabase
            .from("user_notification_preferences")
            .select("*")
            .eq("user_id", auth.user.id)
            .single();

        if (error && error.code !== "PGRST116") {
            // PGRST116 = row not found
            console.error("Failed to fetch preferences:", error);
            return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
        }

        // デフォルト設定
        const defaultPreferences = {
            new_items: true,
            price_drops: true,
            restock: true,
            favorite_seller: true,
            likes_on_items: true,
            new_followers: true,
            messages: true,
            purchase_updates: true,
            weekly_digest: true,
            recommendations: false,
            push_enabled: false,
            email_enabled: true,
            quiet_hours_enabled: false,
            quiet_hours_start: "22:00",
            quiet_hours_end: "08:00",
        };

        return NextResponse.json({
            preferences: prefs?.preferences || defaultPreferences,
            created_at: prefs?.created_at || null,
            updated_at: prefs?.updated_at || null,
        });
    } catch (error) {
        console.error("Get preferences error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/**
 * 通知設定の更新
 */
export async function PUT(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { preferences } = await request.json();

        if (!preferences) {
            return NextResponse.json({ error: "Preferences required" }, { status: 400 });
        }

        // upsert で保存
        const { error } = await supabase.from("user_notification_preferences").upsert(
            {
                user_id: auth.user.id,
                preferences,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

        if (error) {
            console.error("Failed to save preferences:", error);
            return NextResponse.json({ error: "Failed to save" }, { status: 500 });
        }

        // push_subscriptions テーブルも更新（プッシュ関連の設定を同期）
        if (preferences.push_enabled !== undefined) {
            await supabase
                .from("push_subscriptions")
                .update({
                    preferences: {
                        new_items: preferences.new_items,
                        price_drops: preferences.price_drops,
                        restock: preferences.restock,
                        weekly_digest: preferences.weekly_digest,
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", auth.user.id);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Update preferences error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
