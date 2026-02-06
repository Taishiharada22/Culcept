import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStyleDrive } from "@/lib/styleDrive";

export const runtime = "nodejs";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const drive = getStyleDrive(id);
        if (!drive) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        const baseQuery = supabaseAdmin
            .from("curated_cards")
            .select("card_id, image_url, title, tags")
            .eq("is_active", true);

        let { data: cards } = await baseQuery.contains("tags", [id]).limit(30);
        if (!cards || cards.length === 0) {
            const fallback = await supabaseAdmin
                .from("curated_cards")
                .select("card_id, image_url, title, tags")
                .eq("is_active", true)
                .limit(30);
            cards = fallback.data ?? [];
        }

        const cardIds = (cards ?? []).map((c) => String(c.card_id)).filter(Boolean);
        if (cardIds.length === 0) {
            return NextResponse.json({ drive, posts: [] });
        }

        const { data: votes } = await supabaseAdmin
            .from("style_drive_votes")
            .select("card_id, vote, user_id")
            .eq("drive_id", id)
            .in("card_id", cardIds);

        const voteMap = new Map<string, { score: number; up: number; down: number; myVote: number }>();
        (votes ?? []).forEach((vote) => {
            const key = String(vote.card_id ?? "");
            if (!key) return;
            const current = voteMap.get(key) ?? { score: 0, up: 0, down: 0, myVote: 0 };
            if (vote.vote === 1) current.up += 1;
            if (vote.vote === -1) current.down += 1;
            current.score = current.up - current.down;
            if (auth?.user?.id && vote.user_id === auth.user.id) {
                current.myVote = vote.vote;
            }
            voteMap.set(key, current);
        });

        const posts = (cards ?? []).map((card) => {
            const stats = voteMap.get(String(card.card_id)) ?? { score: 0, up: 0, down: 0, myVote: 0 };
            return {
                card_id: card.card_id,
                image_url: card.image_url,
                title: card.title || "Outfit",
                tags: card.tags || [],
                score: stats.score,
                upvotes: stats.up,
                downvotes: stats.down,
                myVote: stats.myVote,
            };
        });

        posts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.upvotes ?? 0) - (a.upvotes ?? 0));

        return NextResponse.json({ drive, posts });
    } catch (error) {
        console.error("Drive posts error:", error);
        return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
    }
}
