import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStyleDrive } from "@/lib/styleDrive";

export const runtime = "nodejs";

type VoteRow = { drive_id?: string | null; card_id?: string | null; vote?: number | null };

function pickTopCard(votes: VoteRow[]) {
    const scoreMap = new Map<string, number>();
    votes.forEach((v) => {
        const key = String(v.card_id ?? "");
        if (!key) return;
        const prev = scoreMap.get(key) ?? 0;
        scoreMap.set(key, prev + (v.vote ?? 0));
    });
    const ranked = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
    return ranked.map(([card_id]) => card_id);
}

export async function POST(
    _req: NextRequest,
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
        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: driveVotes } = await supabaseAdmin
            .from("style_drive_votes")
            .select("card_id, vote")
            .eq("drive_id", id);

        let [topCardId, secondCardId] = pickTopCard(driveVotes ?? []);

        if (!topCardId) {
            const { data: fallback } = await supabaseAdmin
                .from("curated_cards")
                .select("card_id")
                .eq("is_active", true)
                .contains("tags", [id])
                .limit(2);
            topCardId = fallback?.[0]?.card_id;
            secondCardId = fallback?.[1]?.card_id;
        }

        if (!topCardId) {
            return NextResponse.json({ error: "No cards available" }, { status: 400 });
        }

        const { data: otherVotes } = await supabaseAdmin
            .from("style_drive_votes")
            .select("drive_id, card_id, vote")
            .neq("drive_id", id);

        let challengerCardId = "";
        let challengerDriveId = "";

        if (otherVotes && otherVotes.length > 0) {
            const byDrive = new Map<string, VoteRow[]>();
            otherVotes.forEach((v) => {
                const d = String(v.drive_id ?? "");
                if (!d) return;
                const list = byDrive.get(d) ?? [];
                list.push(v);
                byDrive.set(d, list);
            });

            let bestScore = -Infinity;
            byDrive.forEach((votes, driveId) => {
                const [bestCard] = pickTopCard(votes);
                const score = votes.reduce((sum, v) => sum + (v.vote ?? 0), 0);
                if (bestCard && score > bestScore) {
                    bestScore = score;
                    challengerCardId = bestCard;
                    challengerDriveId = driveId;
                }
            });
        }

        if (!challengerCardId) {
            challengerCardId = secondCardId || topCardId;
            challengerDriveId = id;
        }

        const { data: battle, error: battleError } = await supabaseAdmin
            .from("style_drive_battles")
            .insert({
                drive_id: id,
                card_id: topCardId,
                challenger_drive_id: challengerDriveId,
                challenger_card_id: challengerCardId,
                created_by: auth.user.id,
                status: "voting",
            })
            .select()
            .single();

        if (battleError) {
            console.error("Drive battle insert error:", battleError);
            return NextResponse.json({ error: "Failed to create battle" }, { status: 500 });
        }

        return NextResponse.json({ success: true, battleId: battle.id });
    } catch (error) {
        console.error("Drive battle error:", error);
        return NextResponse.json({ error: "Failed to create battle" }, { status: 500 });
    }
}
