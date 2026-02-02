// app/api/recommendations/vector-similarity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TagVector = Record<string, number>;

/**
 * コサイン類似度計算（Pure JavaScript）
 */
function cosineSimilarity(a: TagVector, b: TagVector): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    keys.forEach((key) => {
        const valA = a[key] || 0;
        const valB = b[key] || 0;
        dotProduct += valA * valB;
        normA += valA * valA;
        normB += valB * valB;
    });

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * タグベクトル類似度
 * ユーザーの好みタグベクトルとカードのタグベクトルの類似度を計算
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;

        // ✅ Step 1: ユーザーのタグベクトル構築
        const { data: myRatings } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                rating,
                impression:recommendation_impressions!inner(
                    payload
                )
            `
            )
            .eq("user_id", userId)
            .limit(200);

        const userVector: TagVector = {};

        myRatings?.forEach((r: any) => {
            const tags: string[] =
                r.impression?.payload?.tags || r.impression?.payload?.meta?.tags || [];
            const weight = r.rating as number; // -1, 0, 1

            tags.forEach((tag) => {
                userVector[tag] = (userVector[tag] || 0) + weight;
            });
        });

        if (Object.keys(userVector).length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                user_vector: {},
                message: "まずはカードを評価してください",
            });
        }

        // ✅ Step 2: 全カードのタグベクトルと類似度計算
        const { data: allCards } = await supabase
            .from("curated_cards")
            .select("card_id, tags, image_url")
            .eq("is_active", true)
            .limit(500);

        if (!allCards || allCards.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                user_vector: userVector,
                message: "カードが見つかりませんでした",
            });
        }

        // 既に評価済みのカードIDを取得
        const { data: seenCards } = await supabase
            .from("recommendation_impressions")
            .select("target_key")
            .eq("user_id", userId)
            .eq("target_type", "insight")
            .limit(500);

        const seenCardIds = new Set(
            seenCards?.map((s: any) => s.target_key).filter(Boolean) || []
        );

        // 類似度計算
        const recommendations = allCards
            .filter((card: any) => !seenCardIds.has(card.card_id)) // 未見のみ
            .map((card: any) => {
                const cardVector: TagVector = {};
                const tags = Array.isArray(card.tags) ? card.tags : [];

                tags.forEach((tag: string) => {
                    cardVector[tag] = 1; // カードは binary vector
                });

                const similarity = cosineSimilarity(userVector, cardVector);

                return {
                    card_id: card.card_id,
                    tags: card.tags,
                    image_url: card.image_url,
                    similarity: Math.round(similarity * 100) / 100,
                    matched_tags: tags.filter((t: string) => userVector[t] > 0),
                };
            })
            .filter((r) => r.similarity > 0.1) // 閾値: 0.1以上
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 20);

        return NextResponse.json({
            ok: true,
            recommendations,
            user_vector: userVector,
            total_cards: allCards.length,
            seen_count: seenCardIds.size,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/vector-similarity error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
