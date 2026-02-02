// app/api/try-on/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 試着可能なアイテムを取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const url = new URL(request.url);
        const category = url.searchParams.get("category");

        let query = supabase
            .from("curated_cards")
            .select("card_id, image_url, title, tags")
            .eq("is_active", true);

        // カテゴリフィルター
        if (category) {
            query = query.contains("tags", [category]);
        } else {
            // デフォルトは服関連のみ
            query = query.overlaps("tags", [
                "jacket",
                "coat",
                "shirt",
                "hoodie",
                "sweater",
                "tshirt",
                "dress",
                "tops",
                "outerwear",
            ]);
        }

        const { data: cards, error } = await query.limit(20);

        if (error) {
            console.error("Failed to fetch items:", error);
            return NextResponse.json({ items: [] });
        }

        const items = (cards || []).map((card) => ({
            id: card.card_id,
            image_url: card.image_url,
            name: card.title || "Item",
            category: detectCategory(card.tags || []),
        }));

        return NextResponse.json({ items });
    } catch (error) {
        console.error("Try-on items error:", error);
        return NextResponse.json({ items: [] });
    }
}

function detectCategory(tags: string[]): string {
    const categoryMap: Record<string, string[]> = {
        outerwear: ["jacket", "coat", "outerwear", "blazer", "cardigan"],
        tops: ["shirt", "tshirt", "hoodie", "sweater", "tops", "blouse"],
        bottoms: ["pants", "jeans", "shorts", "skirt", "bottoms"],
        dress: ["dress", "onepiece"],
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
        if (tags.some((t) => keywords.includes(t.toLowerCase()))) {
            return category;
        }
    }

    return "other";
}
