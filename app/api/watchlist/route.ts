// app/api/watchlist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * ウォッチリスト取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // ウォッチリストを取得
        const { data: watchlist } = await supabase
            .from("watchlist")
            .select(`
                id,
                card_id,
                target_price,
                created_at,
                curated_cards (
                    image_url,
                    title
                )
            `)
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false });

        // カードデータがない場合はサンプルを返す
        if (!watchlist || watchlist.length === 0) {
            // サンプルデータを生成
            const { data: cards } = await supabase
                .from("curated_cards")
                .select("card_id, image_url, title")
                .eq("is_active", true)
                .limit(5);

            const sampleItems = (cards || []).map((card, i) => {
                const originalPrice = 10000 + Math.floor(Math.random() * 20000);
                const dropPercent = i < 2 ? Math.floor(Math.random() * 30) + 10 : 0;
                const currentPrice = Math.floor(originalPrice * (1 - dropPercent / 100));
                const targetPrice = Math.floor(originalPrice * 0.7);

                return {
                    id: `watch-${i}`,
                    card_id: card.card_id,
                    image_url: card.image_url,
                    title: card.title || "Item",
                    current_price: currentPrice,
                    target_price: targetPrice,
                    original_price: originalPrice,
                    price_dropped: currentPrice <= targetPrice,
                    drop_percentage: dropPercent,
                    added_at: new Date().toISOString(),
                    notified: false,
                };
            });

            return NextResponse.json({ items: sampleItems });
        }

        // 実データを整形
        const items = watchlist.map((w: any, i: number) => {
            const card = w.curated_cards;
            const originalPrice = 15000;
            const dropPercent = i < 2 ? 20 : 0;
            const currentPrice = Math.floor(originalPrice * (1 - dropPercent / 100));

            return {
                id: w.id,
                card_id: w.card_id,
                image_url: card?.image_url || "",
                title: card?.title || "Item",
                current_price: currentPrice,
                target_price: w.target_price || 10000,
                original_price: originalPrice,
                price_dropped: currentPrice <= (w.target_price || 10000),
                drop_percentage: dropPercent,
                added_at: w.created_at,
                notified: false,
            };
        });

        return NextResponse.json({ items });
    } catch (error) {
        console.error("Watchlist error:", error);
        return NextResponse.json({ items: [] });
    }
}

/**
 * ウォッチリストに追加
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { card_id, target_price } = await request.json();

        if (!card_id) {
            return NextResponse.json({ error: "Card ID required" }, { status: 400 });
        }

        const { error } = await supabase.from("watchlist").upsert(
            {
                user_id: auth.user.id,
                card_id,
                target_price: target_price || 0,
            },
            { onConflict: "user_id,card_id" }
        );

        if (error) {
            console.error("Add to watchlist error:", error);
            return NextResponse.json({ error: "Failed to add" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Watchlist add error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
