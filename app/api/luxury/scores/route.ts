// app/api/luxury/scores/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // ユーザーのLaneスコアを取得
        const { data: scores, error } = await supabase
            .from("luxury_lane_scores")
            .select(`
                lane_id,
                score,
                like_count,
                dislike_count,
                total_count,
                updated_at,
                luxury_lanes (
                    name_ja,
                    name_en,
                    color_primary,
                    color_secondary,
                    icon_emoji,
                    description
                )
            `)
            .eq("user_id", auth.user.id)
            .order("score", { ascending: false });

        if (error) {
            console.error("Error fetching scores:", error);
            return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 });
        }

        // 全Lane情報も取得（スコアがないLaneも含める）
        const { data: allLanes } = await supabase
            .from("luxury_lanes")
            .select("*")
            .order("display_order", { ascending: true });

        // インプレッション統計
        const { data: impressionStats } = await supabase
            .from("luxury_impressions")
            .select("action")
            .eq("user_id", auth.user.id);

        const totalImpressions = impressionStats?.length ?? 0;
        const totalLikes = impressionStats?.filter(i => i.action === "like").length ?? 0;
        const totalDislikes = impressionStats?.filter(i => i.action === "dislike").length ?? 0;

        return NextResponse.json({
            scores: scores ?? [],
            allLanes: allLanes ?? [],
            stats: {
                totalImpressions,
                totalLikes,
                totalDislikes,
                completionRate: allLanes ? Math.round((scores?.length ?? 0) / allLanes.length * 100) : 0,
            },
        });
    } catch (err) {
        console.error("Scores API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
