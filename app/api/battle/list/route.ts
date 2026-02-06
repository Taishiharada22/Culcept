// app/api/battle/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStyleDrive } from "@/lib/styleDrive";

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

        const { data: driveBattles } = await supabaseAdmin
            .from("style_drive_battles")
            .select("id, drive_id, card_id, challenger_drive_id, challenger_card_id, created_at, status")
            .order("created_at", { ascending: false })
            .limit(6);

        if (!driveBattles || driveBattles.length === 0) {
            return NextResponse.json({ battles });
        }

        const cardIds = Array.from(
            new Set(
                driveBattles
                    .flatMap((b) => [b.card_id, b.challenger_card_id])
                    .filter(Boolean)
                    .map((id) => String(id))
            )
        );

        const { data: cardRows } = await supabaseAdmin
            .from("curated_cards")
            .select("card_id, image_url, title")
            .in("card_id", cardIds);

        const cardMap = new Map((cardRows ?? []).map((c) => [String(c.card_id), c]));

        const driveBattleItems = driveBattles.map((b) => {
            const mainDrive = getStyleDrive(String(b.drive_id ?? "")) ?? {
                id: String(b.drive_id ?? ""),
                name: "Style Drive",
                icon: "🚗",
            };
            const challengerDrive = getStyleDrive(String(b.challenger_drive_id ?? "")) ?? {
                id: String(b.challenger_drive_id ?? ""),
                name: "Challenger",
                icon: "⚡",
            };

            const mainCard = cardMap.get(String(b.card_id));
            const challengerCard = cardMap.get(String(b.challenger_card_id ?? ""));
            const endDate = new Date(b.created_at ?? new Date().toISOString());
            endDate.setDate(endDate.getDate() + 3);

            return {
                id: `drive-${b.id}`,
                title: `${mainDrive.name} vs ${challengerDrive.name}`,
                theme: `🏁 ${mainDrive.name} ドライブ対決`,
                status: "voting",
                endAt: endDate.toISOString(),
                participants: 2 + Math.floor(Math.random() * 40),
                entries: [
                    {
                        id: `drive-${b.id}-a`,
                        user: {
                            name: mainDrive.name,
                            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(mainDrive.id)}`,
                        },
                        image: mainCard?.image_url || "https://via.placeholder.com/300x400",
                        votes: Math.floor(Math.random() * 200) + 10,
                    },
                    {
                        id: `drive-${b.id}-b`,
                        user: {
                            name: challengerDrive.name,
                            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(challengerDrive.id || "challenger")}`,
                        },
                        image: challengerCard?.image_url || "https://via.placeholder.com/300x400",
                        votes: Math.floor(Math.random() * 200) + 10,
                    },
                ],
                prize: null,
            };
        });

        return NextResponse.json({ battles: [...driveBattleItems, ...battles] });
    } catch (error) {
        console.error("Battle list error:", error);
        return NextResponse.json({ battles: [] });
    }
}
