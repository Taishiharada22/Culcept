// app/api/live/streams/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 個別ライブストリームを取得
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await supabaseServer();

        // カードから商品データを取得
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, title, tags")
            .eq("is_active", true)
            .limit(6);

        const products = (cards || []).map((card) => ({
            id: card.card_id,
            image_url: card.image_url,
            name: card.title || "Item",
            price: 5000 + Math.floor(Math.random() * 20000),
            stock: Math.floor(Math.random() * 10) + 1,
        }));

        const stream = {
            id,
            title: "春の新作アウター紹介！🌸",
            host: {
                id: "host1",
                name: "StyleMaster Tokyo",
                avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=host1",
            },
            viewers: 256 + Math.floor(Math.random() * 100),
            products,
            status: "live",
        };

        return NextResponse.json({ stream });
    } catch (error) {
        console.error("Live stream error:", error);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
}
