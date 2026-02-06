import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStyleDrive } from "@/lib/styleDrive";

export const runtime = "nodejs";

export async function POST(
    req: NextRequest,
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

        const body = await req.json();
        const cardId = String(body?.card_id ?? "").trim();
        const vote = Number(body?.vote ?? 0);

        if (!cardId) {
            return NextResponse.json({ error: "card_id required" }, { status: 400 });
        }
        if (![1, 0, -1].includes(vote)) {
            return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
        }

        if (vote === 0) {
            await supabaseAdmin
                .from("style_drive_votes")
                .delete()
                .eq("drive_id", id)
                .eq("card_id", cardId)
                .eq("user_id", auth.user.id);
        } else {
            await supabaseAdmin
                .from("style_drive_votes")
                .upsert(
                    {
                        drive_id: id,
                        card_id: cardId,
                        user_id: auth.user.id,
                        vote,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "drive_id,card_id,user_id" }
                );
        }

        const { data: votes } = await supabaseAdmin
            .from("style_drive_votes")
            .select("vote")
            .eq("drive_id", id)
            .eq("card_id", cardId);

        let upvotes = 0;
        let downvotes = 0;
        (votes ?? []).forEach((v) => {
            if (v.vote === 1) upvotes += 1;
            if (v.vote === -1) downvotes += 1;
        });

        return NextResponse.json({
            success: true,
            card_id: cardId,
            score: upvotes - downvotes,
            upvotes,
            downvotes,
            myVote: vote,
        });
    } catch (error) {
        console.error("Drive vote error:", error);
        return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
    }
}
