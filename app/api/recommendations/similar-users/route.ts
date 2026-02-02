// app/api/recommendations/similar-users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 類似ユーザー推薦
 * 同じトップタグを持つユーザーが好きなタグを推薦
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        const userId = auth.user.id;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // 自分の評価からトップ3タグを取得
        const { data: myRatings } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                rating,
                impression:recommendation_impressions!inner(
                    payload,
                    meta
                )
            `
            )
            .eq("user_id", userId)
            .gte("created_at", thirtyDaysAgo.toISOString())
            .gt("rating", 0); // Likeのみ

        if (!myRatings || myRatings.length === 0) {
            return NextResponse.json({
                ok: true,
                similarUsers: [],
                recommendedTags: [],
                message: "まずはカードを評価してください",
            });
        }

        // 自分のトップタグ集計
        const myTagScores: Record<string, number> = {};
        myRatings.forEach((r: any) => {
            const tags: string[] =
                r.impression?.payload?.tags ||
                r.impression?.payload?.meta?.tags ||
                r.impression?.meta?.tags ||
                [];
            tags.forEach((tag: string) => {
                myTagScores[tag] = (myTagScores[tag] || 0) + 1;
            });
        });

        const myTopTags = Object.entries(myTagScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([tag]) => tag);

        if (myTopTags.length === 0) {
            return NextResponse.json({
                ok: true,
                similarUsers: [],
                recommendedTags: [],
                message: "タグが見つかりませんでした",
            });
        }

        // 他のユーザーで同じタグを好むユーザーを探す
        const { data: similarRatings } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                user_id,
                rating,
                impression:recommendation_impressions!inner(
                    payload,
                    meta
                )
            `
            )
            .neq("user_id", userId)
            .gte("created_at", thirtyDaysAgo.toISOString())
            .gt("rating", 0)
            .limit(500);

        if (!similarRatings || similarRatings.length === 0) {
            return NextResponse.json({
                ok: true,
                similarUsers: [],
                recommendedTags: [],
                message: "類似ユーザーが見つかりませんでした",
            });
        }

        // ユーザーごとのタグスコア集計
        const userTagScores: Record<string, Record<string, number>> = {};

        similarRatings.forEach((r: any) => {
            const uid = r.user_id;
            const tags: string[] =
                r.impression?.payload?.tags ||
                r.impression?.payload?.meta?.tags ||
                r.impression?.meta?.tags ||
                [];

            if (!userTagScores[uid]) {
                userTagScores[uid] = {};
            }

            tags.forEach((tag: string) => {
                userTagScores[uid][tag] = (userTagScores[uid][tag] || 0) + 1;
            });
        });

        // 類似度計算（共通トップタグの数）
        const similarUsers: Array<{ userId: string; similarity: number; topTags: string[] }> = [];

        Object.entries(userTagScores).forEach(([uid, tagScores]) => {
            const userTopTags = Object.keys(tagScores)
                .sort((a, b) => tagScores[b] - tagScores[a])
                .slice(0, 5);

            const commonTags = myTopTags.filter((tag) => userTopTags.includes(tag));
            const similarity = commonTags.length;

            if (similarity > 0) {
                similarUsers.push({
                    userId: uid,
                    similarity,
                    topTags: userTopTags,
                });
            }
        });

        // 類似度でソート
        similarUsers.sort((a, b) => b.similarity - a.similarity);

        // 類似ユーザーのトップタグから推薦タグ抽出
        const recommendedTagScores: Record<string, number> = {};

        similarUsers.slice(0, 10).forEach((user) => {
            user.topTags.forEach((tag) => {
                if (!myTopTags.includes(tag)) {
                    recommendedTagScores[tag] = (recommendedTagScores[tag] || 0) + user.similarity;
                }
            });
        });

        const recommendedTags = Object.entries(recommendedTagScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, score]) => ({ tag, score }));

        return NextResponse.json({
            ok: true,
            myTopTags,
            similarUsers: similarUsers.slice(0, 5).map((u) => ({
                similarity: u.similarity,
                topTags: u.topTags.slice(0, 3),
            })),
            recommendedTags,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/similar-users error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
