// app/api/tribes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { STYLE_DRIVES } from "@/lib/styleDrive";

export const runtime = "nodejs";

/**
 * トライブ一覧取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        // カードを取得してサンプルデータに使用
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, tags")
            .eq("is_active", true)
            .limit(30);

        const cardsByTag: Record<string, typeof cards> = {};
        (cards || []).forEach((card) => {
            card.tags?.forEach((tag: string) => {
                if (!cardsByTag[tag]) cardsByTag[tag] = [];
                cardsByTag[tag].push(card);
            });
        });

        const tribes = STYLE_DRIVES.map((drive) => {
            const relatedCards = cardsByTag[drive.id] || cards?.slice(0, 5) || [];
            return {
                id: drive.id,
                name: drive.name,
                description: drive.description,
                icon: drive.icon,
                members: 1200 + Math.floor(Math.random() * 2400),
                posts: 400 + Math.floor(Math.random() * 1200),
                joined: false,
                featured_items: relatedCards.slice(0, 5).map((c) => ({
                    id: c.card_id,
                    image_url: c.image_url,
                })),
            };
        });

        return NextResponse.json({
            tribes,
            myTribes: auth?.user ? ["casual"] : [],
        });
    } catch (error) {
        console.error("Tribes error:", error);
        return NextResponse.json({ tribes: [], myTribes: [] });
    }
}
