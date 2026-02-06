// app/api/luxury/impression/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { card_id, lane_id, action } = body;

        if (!card_id || !lane_id || !action) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!["like", "dislike", "skip"].includes(action)) {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        // 1. インプレッションを保存
        const { error: impressionError } = await supabaseAdmin
            .from("luxury_impressions")
            .insert({
                user_id: auth.user.id,
                card_id,
                lane_id,
                action,
            });

        if (impressionError) {
            console.error("Error saving impression:", impressionError);
            return NextResponse.json({ error: "Failed to save impression" }, { status: 500 });
        }

        // 2. Laneスコアを更新
        const { data: existingScore } = await supabaseAdmin
            .from("luxury_lane_scores")
            .select("*")
            .eq("user_id", auth.user.id)
            .eq("lane_id", lane_id)
            .maybeSingle();

        const likeIncrement = action === "like" ? 1 : 0;
        const dislikeIncrement = action === "dislike" ? 1 : 0;
        const totalIncrement = action !== "skip" ? 1 : 0;

        if (existingScore) {
            const newLikes = existingScore.like_count + likeIncrement;
            const newDislikes = existingScore.dislike_count + dislikeIncrement;
            const newTotal = existingScore.total_count + totalIncrement;
            const newScore = calculateScore(newLikes, newDislikes, newTotal);

            const { error: updateError } = await supabaseAdmin
                .from("luxury_lane_scores")
                .update({
                    like_count: newLikes,
                    dislike_count: newDislikes,
                    total_count: newTotal,
                    score: newScore,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingScore.id);
            if (updateError) {
                console.error("Error updating lane score:", updateError);
            }
        } else {
            const newScore = calculateScore(likeIncrement, dislikeIncrement, totalIncrement);

            const { error: insertError } = await supabaseAdmin
                .from("luxury_lane_scores")
                .insert({
                    user_id: auth.user.id,
                    lane_id,
                    like_count: likeIncrement,
                    dislike_count: dislikeIncrement,
                    total_count: totalIncrement,
                    score: newScore,
                });
            if (insertError) {
                console.error("Error inserting lane score:", insertError);
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Impression API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

function calculateScore(likes: number, dislikes: number, total: number): number {
    if (total === 0) return 0;

    // 基本スコア: like率 * 100
    const baseScore = (likes / total) * 100;

    // 信頼度ボーナス: サンプル数が多いほど信頼性UP（最大+10）
    const confidenceBonus = Math.min(total / 10, 1) * 10;

    return Math.min(100, baseScore + confidenceBonus);
}
