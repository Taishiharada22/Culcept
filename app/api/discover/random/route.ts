// app/api/discover/random/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * ランダムアイテム発見（シェイク機能用）
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();

        // ランダムなカードを取得
        const { data: cards, error } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, title, tags")
            .eq("is_active", true);

        if (error || !cards || cards.length === 0) {
            return NextResponse.json({ item: null });
        }

        // ランダム選択
        const randomIndex = Math.floor(Math.random() * cards.length);
        const card = cards[randomIndex];

        return NextResponse.json({
            item: {
                id: card.card_id,
                image_url: card.image_url,
                title: card.title || "Random Item",
                tags: card.tags || [],
            },
        });
    } catch (error) {
        console.error("Random discover error:", error);
        return NextResponse.json({ item: null });
    }
}
