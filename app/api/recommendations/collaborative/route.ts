// app/api/recommendations/collaborative/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * セッションベース協調フィルタリング
 * "あなたと似た好みのユーザーが好きなカード"を推薦
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;

        // ✅ Step 1: 自分がLikeしたカードIDを取得
        const { data: myLikes } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                impression:recommendation_impressions!inner(
                    target_key,
                    payload
                )
            `
            )
            .eq("user_id", userId)
            .eq("rating", 1) // Likeのみ
            .limit(50);

        if (!myLikes || myLikes.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                message: "まずはカードを評価してください",
            });
        }

        const myLikedCardIds = myLikes
            .map((r: any) => r.impression?.target_key)
            .filter(Boolean);

        if (myLikedCardIds.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                message: "評価データが不足しています",
            });
        }

        // ✅ Step 2: 同じカードをLikeした他のユーザーを検出
        const { data: similarUsers } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                user_id,
                impression:recommendation_impressions!inner(
                    target_key
                )
            `
            )
            .neq("user_id", userId)
            .eq("rating", 1)
            .in("impression.target_key", myLikedCardIds)
            .limit(500);

        if (!similarUsers || similarUsers.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                message: "類似ユーザーが見つかりませんでした",
            });
        }

        // ユーザーごとの共通カード数を集計
        const userSimilarity: Record<string, number> = {};
        similarUsers.forEach((r: any) => {
            const uid = r.user_id;
            userSimilarity[uid] = (userSimilarity[uid] || 0) + 1;
        });

        // 類似度トップ10ユーザー
        const topSimilarUsers = Object.entries(userSimilarity)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([uid]) => uid);

        if (topSimilarUsers.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                message: "類似ユーザーが見つかりませんでした",
            });
        }

        // ✅ Step 3: 類似ユーザーがLikeしたカードを取得（自分が未評価のもの）
        const { data: theirLikes } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                impression:recommendation_impressions!inner(
                    target_key,
                    payload
                )
            `
            )
            .in("user_id", topSimilarUsers)
            .eq("rating", 1)
            .limit(200);

        if (!theirLikes || theirLikes.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                message: "推薦カードが見つかりませんでした",
            });
        }

        // カードIDごとの推薦スコア（何人がLikeしたか）
        const cardScores: Record<string, { count: number; payload: any }> = {};
        theirLikes.forEach((r: any) => {
            const cardId = r.impression?.target_key;
            if (!cardId || myLikedCardIds.includes(cardId)) return; // 既知カードは除外

            if (!cardScores[cardId]) {
                cardScores[cardId] = { count: 0, payload: r.impression?.payload };
            }
            cardScores[cardId].count++;
        });

        // スコアでソート
        const recommendations = Object.entries(cardScores)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20)
            .map(([cardId, data]) => ({
                card_id: cardId,
                score: data.count,
                payload: data.payload,
            }));

        return NextResponse.json({
            ok: true,
            recommendations,
            similar_user_count: topSimilarUsers.length,
            my_likes_count: myLikedCardIds.length,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/collaborative error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
