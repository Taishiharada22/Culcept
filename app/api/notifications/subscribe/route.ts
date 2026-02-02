// app/api/notifications/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Web Push通知のサブスクリプション登録
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { subscription, preferences } = await request.json();

        // サブスクリプションを保存
        const { error } = await supabase.from("push_subscriptions").upsert(
            {
                user_id: auth.user.id,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                preferences: preferences || {
                    new_items: true,
                    price_drops: true,
                    restock: true,
                    weekly_digest: true,
                },
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

        if (error) {
            console.error("Failed to save subscription:", error);
            return NextResponse.json({ error: "Failed to save" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Subscription error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

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

        const { data: subscription } = await supabase
            .from("push_subscriptions")
            .select("preferences, created_at")
            .eq("user_id", auth.user.id)
            .single();

        return NextResponse.json({
            enabled: !!subscription,
            preferences: subscription?.preferences || null,
        });
    } catch (error) {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
