// app/api/battle/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStyleDrive } from "@/lib/styleDrive";

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

        if (id.startsWith("drive-")) {
            const driveBattleId = id.replace("drive-", "");
            const { data: battleRow } = await supabaseAdmin
                .from("style_drive_battles")
                .select("id, drive_id, card_id, challenger_drive_id, challenger_card_id, created_at, status")
                .eq("id", driveBattleId)
                .maybeSingle();

            if (!battleRow) {
                return NextResponse.json({ error: "Not found" }, { status: 404 });
            }

            const cardIds = [battleRow.card_id, battleRow.challenger_card_id].filter(Boolean).map((x) => String(x));
            const { data: cardRows } = await supabaseAdmin
                .from("curated_cards")
                .select("card_id, image_url, title")
                .in("card_id", cardIds);
            const cardMap = new Map((cardRows ?? []).map((c) => [String(c.card_id), c]));

            const mainDrive = getStyleDrive(String(battleRow.drive_id ?? "")) ?? {
                id: String(battleRow.drive_id ?? ""),
                name: "Pulse+",
                icon: "🚗",
            };
            const challengerDrive = getStyleDrive(String(battleRow.challenger_drive_id ?? "")) ?? {
                id: String(battleRow.challenger_drive_id ?? ""),
                name: "Challenger",
                icon: "⚡",
            };

            const mainCard = cardMap.get(String(battleRow.card_id));
            const challengerCard = cardMap.get(String(battleRow.challenger_card_id ?? ""));

            const startDate = new Date(battleRow.created_at ?? new Date().toISOString());
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 3);

            const battle = {
                id,
                title: `${mainDrive.name} vs ${challengerDrive.name}`,
                theme: `🏁 ${mainDrive.name} Pulse+対決`,
                description: "ドライブ内投票の勝者がバトルに参戦しました。",
                status: "voting",
                startAt: startDate.toISOString(),
                endAt: endDate.toISOString(),
                entries: [
                    {
                        id: `drive-${battleRow.id}-a`,
                        user: {
                            id: "drive-a",
                            name: mainDrive.name,
                            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(mainDrive.id)}`,
                        },
                        image: mainCard?.image_url || "https://via.placeholder.com/300x400",
                        items: [
                            {
                                id: mainCard?.card_id || "item",
                                name: mainCard?.title || "Item",
                                image_url: mainCard?.image_url || "https://via.placeholder.com/300x400",
                            },
                        ],
                        votes: Math.floor(Math.random() * 200) + 10,
                        rank: 1,
                    },
                    {
                        id: `drive-${battleRow.id}-b`,
                        user: {
                            id: "drive-b",
                            name: challengerDrive.name,
                            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(challengerDrive.id || "challenger")}`,
                        },
                        image: challengerCard?.image_url || "https://via.placeholder.com/300x400",
                        items: [
                            {
                                id: challengerCard?.card_id || "item",
                                name: challengerCard?.title || "Item",
                                image_url: challengerCard?.image_url || "https://via.placeholder.com/300x400",
                            },
                        ],
                        votes: Math.floor(Math.random() * 200) + 10,
                        rank: 2,
                    },
                ],
                prize: null,
            };

            return NextResponse.json({ battle });
        }

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
