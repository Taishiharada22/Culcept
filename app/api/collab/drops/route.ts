// app/api/collab/drops/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * コラボドロップ一覧取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();

        // カードを取得
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, title")
            .eq("is_active", true)
            .limit(20);

        // サンプルセラー
        const sellers = [
            { id: "s1", name: "StyleMaster", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=seller1" },
            { id: "s2", name: "FashionQueen", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=seller2" },
            { id: "s3", name: "StreetWear JP", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=seller3" },
            { id: "s4", name: "Vintage Tokyo", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=seller4" },
        ];

        // コラボドロップデータ
        const now = new Date();
        const drops = [
            {
                id: "collab-1",
                title: "Spring Collection 2026",
                description: "春の新作を3人のセラーが共同で厳選。限定50点のみの特別コレクション。",
                sellers: [sellers[0], sellers[1], sellers[2]],
                status: "live",
                startAt: new Date(now.getTime() - 24 * 3600000).toISOString(),
                endAt: new Date(now.getTime() + 48 * 3600000).toISOString(),
                totalItems: 50,
                soldItems: 38,
            },
            {
                id: "collab-2",
                title: "Vintage × Street Fusion",
                description: "ヴィンテージとストリートの融合。新しいスタイルの提案。",
                sellers: [sellers[2], sellers[3]],
                status: "live",
                startAt: new Date(now.getTime() - 12 * 3600000).toISOString(),
                endAt: new Date(now.getTime() + 36 * 3600000).toISOString(),
                totalItems: 30,
                soldItems: 12,
            },
            {
                id: "collab-3",
                title: "Summer Preview",
                description: "一足早い夏のプレビューコレクション。",
                sellers: [sellers[0], sellers[3]],
                status: "upcoming",
                startAt: new Date(now.getTime() + 72 * 3600000).toISOString(),
                endAt: new Date(now.getTime() + 144 * 3600000).toISOString(),
                totalItems: 40,
                soldItems: 0,
            },
        ];

        // アイテムを割り当て
        const dropsWithItems = drops.map((drop, i) => ({
            ...drop,
            items: (cards || []).slice(i * 4, i * 4 + 4).map((card, j) => ({
                id: card.card_id,
                image_url: card.image_url,
                name: card.title || "Item",
                price: 5000 + Math.floor(Math.random() * 15000),
                seller_id: drop.sellers[j % drop.sellers.length].id,
            })),
        }));

        return NextResponse.json({ drops: dropsWithItems });
    } catch (error) {
        console.error("Collab drops error:", error);
        return NextResponse.json({ drops: [] });
    }
}
