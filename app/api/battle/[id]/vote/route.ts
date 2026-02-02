// app/api/battle/[id]/vote/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * バトルに投票
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { entryId } = await request.json();

        if (!entryId) {
            return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
        }

        // 実際のDBがあれば保存
        // await supabase.from("battle_votes").insert({
        //     battle_id: id,
        //     entry_id: entryId,
        //     user_id: auth.user.id,
        // });

        return NextResponse.json({ success: true, battleId: id, entryId });
    } catch (error) {
        console.error("Vote error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
