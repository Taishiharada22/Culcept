// app/api/luxury/reset/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // インプレッションを削除
        await supabase
            .from("luxury_impressions")
            .delete()
            .eq("user_id", auth.user.id);

        // スコアを削除
        await supabase
            .from("luxury_lane_scores")
            .delete()
            .eq("user_id", auth.user.id);

        // 結果を削除
        await supabase
            .from("luxury_results")
            .delete()
            .eq("user_id", auth.user.id);

        return NextResponse.json({ success: true, message: "診断がリセットされました" });
    } catch (err) {
        console.error("Reset API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
