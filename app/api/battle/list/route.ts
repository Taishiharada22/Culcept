// app/api/battle/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * バトル一覧を取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();

        // カードからエントリー画像を取得
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url")
            .eq("is_active", true)
            .limit(20);

        const sampleUsers = [
            { name: "StyleKing", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user1" },
            { name: "FashionQueen", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user2" },
            { name: "StreetMaster", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user3" },
            { name: "MinimalGirl", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user4" },
            { name: "VintageKid", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=user5" },
        ];

        const themes = [
            { title: "春コーデ対決", theme: "🌸 春のお出かけスタイル", prize: "¥10,000分のクーポン" },
            { title: "モノトーンバトル", theme: "⬛ モノトーンコーデ", prize: "人気アイテムプレゼント" },
            { title: "カジュアル王決定戦", theme: "👕 最強カジュアル", prize: null },
        ];

        const battles = themes.map((theme, i) => {
            const entries = sampleUsers.slice(0, 4 + i).map((user, j) => ({
                id: `entry-${i}-${j}`,
                user,
                image: cards?.[j + i * 3]?.image_url || "https://via.placeholder.com/300x400",
                votes: Math.floor(Math.random() * 100) + 10,
            }));

            // 投票数でソート
            entries.sort((a, b) => b.votes - a.votes);

            const endDate = new Date();
            endDate.setDate(endDate.getDate() + (i === 0 ? 3 : i === 1 ? 7 : -2));

            return {
                id: `battle-${i}`,
                title: theme.title,
                theme: theme.theme,
                status: i === 0 ? "voting" : i === 1 ? "upcoming" : "ended",
                endAt: endDate.toISOString(),
                participants: entries.length + Math.floor(Math.random() * 20),
                entries,
                prize: theme.prize,
            };
        });

        return NextResponse.json({ battles });
    } catch (error) {
        console.error("Battle list error:", error);
        return NextResponse.json({ battles: [] });
    }
}
