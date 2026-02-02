// app/api/live/streams/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * ライブストリーム一覧を取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();

        // カードから商品データを取得
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, title, tags")
            .eq("is_active", true)
            .limit(20);

        // サンプルストリームデータを生成
        const sampleHosts = [
            { id: "host1", name: "StyleMaster Tokyo", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=host1" },
            { id: "host2", name: "Fashion Queen", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=host2" },
            { id: "host3", name: "StreetWear JP", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=host3" },
            { id: "host4", name: "Vintage Lover", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=host4" },
        ];

        const sampleTitles = [
            "春の新作アウター紹介！🌸",
            "今週のおすすめコーデ特集",
            "限定セール！早い者勝ち🔥",
            "Q&Aしながらスタイリング提案",
            "ストリートファッション最前線",
        ];

        const streams = [];

        // ライブ配信中
        for (let i = 0; i < 2; i++) {
            const host = sampleHosts[i];
            const products = (cards || []).slice(i * 3, i * 3 + 3).map((card) => ({
                id: card.card_id,
                image_url: card.image_url,
                name: card.title || "Item",
                price: 5000 + Math.floor(Math.random() * 20000),
                stock: Math.floor(Math.random() * 10) + 1,
            }));

            streams.push({
                id: `live-${i}`,
                title: sampleTitles[i],
                host,
                thumbnail: products[0]?.image_url || "https://via.placeholder.com/400x300",
                viewers: 100 + Math.floor(Math.random() * 500),
                status: "live",
                products,
                tags: ["fashion", "live", i === 0 ? "outerwear" : "coordinate"],
            });
        }

        // 予定
        for (let i = 2; i < 4; i++) {
            const host = sampleHosts[i];
            const products = (cards || []).slice(i * 3, i * 3 + 3).map((card) => ({
                id: card.card_id,
                image_url: card.image_url,
                name: card.title || "Item",
                price: 5000 + Math.floor(Math.random() * 20000),
                stock: Math.floor(Math.random() * 10) + 1,
            }));

            const scheduledDate = new Date();
            scheduledDate.setDate(scheduledDate.getDate() + (i - 1));
            scheduledDate.setHours(19, 0, 0, 0);

            streams.push({
                id: `scheduled-${i}`,
                title: sampleTitles[i],
                host,
                thumbnail: products[0]?.image_url || "https://via.placeholder.com/400x300",
                viewers: 0,
                status: "scheduled",
                scheduledAt: scheduledDate.toISOString(),
                products,
                tags: ["fashion", "upcoming", i === 2 ? "vintage" : "street"],
            });
        }

        return NextResponse.json({ streams });
    } catch (error) {
        console.error("Live streams error:", error);
        return NextResponse.json({ streams: [] });
    }
}
