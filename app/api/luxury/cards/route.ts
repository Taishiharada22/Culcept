// app/api/luxury/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncLuxuryCards } from "@/lib/luxury/cardsSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        const url = new URL(req.url);
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
        const excludeSeen = url.searchParams.get("excludeSeen") === "true";

        // 全カードを取得（AdminでRLS回避）
        const fetchCards = async () => {
            return await supabaseAdmin
                .from("luxury_cards")
                .select(`
                    card_id,
                    lane_id,
                    image_url,
                    tags,
                    display_order,
                    luxury_lanes (
                        name_ja,
                        name_en,
                        color_primary,
                        icon_emoji
                    )
                `)
                .eq("is_active", true)
                .order("display_order", { ascending: true });
        };

        let { data: cards, error } = await fetchCards();

        if (error) {
            console.error("Error fetching cards:", error);
            return NextResponse.json({ error: "Failed to fetch cards" }, { status: 500 });
        }

        // ローカル追加分を自動同期（必要な場合のみ）
        const sync = await syncLuxuryCards();
        if (sync.synced || !cards || cards.length === 0) {
            const retry = await fetchCards();
            cards = retry.data ?? cards;
        }

        let filteredCards = cards ?? [];

        // 既に見たカードを除外
        if (excludeSeen && auth?.user) {
            const { data: seenImpressions } = await supabaseAdmin
                .from("luxury_impressions")
                .select("card_id")
                .eq("user_id", auth.user.id);

            const seenCardIds = new Set((seenImpressions ?? []).map(i => i.card_id));
            filteredCards = filteredCards.filter(c => !seenCardIds.has(c.card_id));
        }

        // シャッフル
        for (let i = filteredCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filteredCards[i], filteredCards[j]] = [filteredCards[j], filteredCards[i]];
        }

        // リミット適用
        const result = filteredCards.slice(0, limit);

        return NextResponse.json({
            cards: result,
            total: filteredCards.length,
            remaining: Math.max(0, filteredCards.length - limit),
        });
    } catch (err) {
        console.error("Cards API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
