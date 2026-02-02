// app/api/recommendations/tag-rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TagRule = {
    from_tag: string;
    to_tag: string;
    confidence: number; // 0-1
    support: number; // 件数
    lift: number; // 相関の強さ
};

/**
 * タグ共起分析（Association Rules Mining）
 * "denimを好む人はmilitaryも好む" を自動発見
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;
        const minSupport = 3; // 最低3人以上
        const minConfidence = 0.3; // 最低30%

        // ✅ Step 1: 自分がLikeしたタグを取得
        const { data: myRatings } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                impression:recommendation_impressions!inner(
                    payload
                )
            `
            )
            .eq("user_id", userId)
            .eq("rating", 1)
            .limit(100);

        const myTags = new Set<string>();
        myRatings?.forEach((r: any) => {
            const tags: string[] =
                r.impression?.payload?.tags || r.impression?.payload?.meta?.tags || [];
            tags.forEach((tag) => myTags.add(tag));
        });

        if (myTags.size === 0) {
            return NextResponse.json({
                ok: true,
                rules: [],
                my_tags: [],
                message: "まずはカードを評価してください",
            });
        }

        // ✅ Step 2: 全ユーザーのLikeタグを取得
        const { data: allRatings } = await supabase
            .from("recommendation_ratings")
            .select(
                `
                user_id,
                impression:recommendation_impressions!inner(
                    payload
                )
            `
            )
            .eq("rating", 1)
            .limit(1000);

        if (!allRatings || allRatings.length === 0) {
            return NextResponse.json({
                ok: true,
                rules: [],
                my_tags: Array.from(myTags),
                message: "データが不足しています",
            });
        }

        // ユーザーごとのタグセットを構築
        const userTagSets: Record<string, Set<string>> = {};
        allRatings.forEach((r: any) => {
            const uid = r.user_id;
            const tags: string[] =
                r.impression?.payload?.tags || r.impression?.payload?.meta?.tags || [];

            if (!userTagSets[uid]) {
                userTagSets[uid] = new Set();
            }

            tags.forEach((tag) => userTagSets[uid].add(tag));
        });

        const totalUsers = Object.keys(userTagSets).length;

        // ✅ Step 3: タグペアの共起頻度を計算
        const tagPairCounts: Record<string, number> = {};
        const tagCounts: Record<string, number> = {};

        Object.values(userTagSets).forEach((tagSet) => {
            const tags = Array.from(tagSet);

            // 単独タグ頻度
            tags.forEach((tag) => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });

            // ペア頻度
            for (let i = 0; i < tags.length; i++) {
                for (let j = i + 1; j < tags.length; j++) {
                    const pair = [tags[i], tags[j]].sort().join("|");
                    tagPairCounts[pair] = (tagPairCounts[pair] || 0) + 1;
                }
            }
        });

        // ✅ Step 4: Association Rules 計算
        const rules: TagRule[] = [];

        Object.entries(tagPairCounts).forEach(([pair, pairCount]) => {
            if (pairCount < minSupport) return;

            const [tagA, tagB] = pair.split("|");
            const countA = tagCounts[tagA] || 0;
            const countB = tagCounts[tagB] || 0;

            if (countA === 0 || countB === 0) return;

            // Confidence: P(B|A) = count(A,B) / count(A)
            const confidenceAtoB = pairCount / countA;
            const confidenceBtoA = pairCount / countB;

            // Lift: confidence / P(B)
            const liftAtoB = confidenceAtoB / (countB / totalUsers);
            const liftBtoA = confidenceBtoA / (countA / totalUsers);

            // A → B ルール
            if (confidenceAtoB >= minConfidence && myTags.has(tagA) && !myTags.has(tagB)) {
                rules.push({
                    from_tag: tagA,
                    to_tag: tagB,
                    confidence: confidenceAtoB,
                    support: pairCount,
                    lift: liftAtoB,
                });
            }

            // B → A ルール
            if (confidenceBtoA >= minConfidence && myTags.has(tagB) && !myTags.has(tagA)) {
                rules.push({
                    from_tag: tagB,
                    to_tag: tagA,
                    confidence: confidenceBtoA,
                    support: pairCount,
                    lift: liftBtoA,
                });
            }
        });

        // Lift でソート（相関が強い順）
        rules.sort((a, b) => b.lift - a.lift);

        return NextResponse.json({
            ok: true,
            rules: rules.slice(0, 20),
            my_tags: Array.from(myTags),
            total_users: totalUsers,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/tag-rules error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
