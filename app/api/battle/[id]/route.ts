// app/api/battle/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * バトル詳細を取得
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await supabaseServer();

        // カードからエントリー画像を取得
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, title")
            .eq("is_active", true)
            .limit(10);

        const sampleUsers = [
            { id: "u1", name: "StyleKing", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user1" },
            { id: "u2", name: "FashionQueen", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user2" },
            { id: "u3", name: "StreetMaster", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user3" },
            { id: "u4", name: "MinimalGirl", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user4" },
            { id: "u5", name: "VintageKid", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user5" },
            { id: "u6", name: "ClassicBoy", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user6" },
        ];

        const entries = sampleUsers.map((user, i) => {
            const votes = Math.floor(Math.random() * 100) + 10;
            return {
                id: `entry-${i}`,
                user,
                image: cards?.[i]?.image_url || "https://via.placeholder.com/300x400",
                items: (cards || []).slice(i, i + 2).map((c) => ({
                    id: c.card_id,
                    name: c.title || "Item",
                    image_url: c.image_url,
                })),
                votes,
                rank: 0,
            };
        });

        // ランク付け
        entries.sort((a, b) => b.votes - a.votes);
        entries.forEach((e, i) => (e.rank = i + 1));

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 2);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 3);

        const battle = {
            id,
            title: "春コーデ対決",
            theme: "🌸 春のお出かけスタイル",
            description: "春にぴったりのコーディネートで勝負！投票で1位を決めよう。",
            status: "voting",
            startAt: startDate.toISOString(),
            endAt: endDate.toISOString(),
            entries,
            prize: "¥10,000分のクーポン",
        };

        return NextResponse.json({ battle });
    } catch (error) {
        console.error("Battle detail error:", error);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
}
