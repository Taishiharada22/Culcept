// app/api/recommendations/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TagScore = { tag: string; score: number };
type WeeklyTrend = { week: string; topTag: string; score: number };
type CategoryScore = { category: string; score: number; tags: string[] };

function clampInt(v: any, lo: number, hi: number, fallback: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/** payload からタグ配列を安全に抽出（metaは使わない） */
function extractTagsFromImpression(imp: any): string[] {
    const p = imp?.payload ?? {};

    // v=2 swipe_card
    if (p?.kind === "swipe_card" && Array.isArray(p?.tags)) {
        return p.tags.map(String).map((s: string) => s.trim()).filter(Boolean);
    }

    // 他の形式でも tags があれば拾う
    if (Array.isArray(p?.tags)) {
        return p.tags.map(String).map((s: string) => s.trim()).filter(Boolean);
    }

    // v=1 drop 系は tags が無いことが多いので、軽く疑似タグ化（任意）
    const out: string[] = [];
    if (p?.brand) out.push(`brand:${String(p.brand)}`);
    if (p?.size) out.push(`size:${String(p.size)}`);
    if (p?.condition) out.push(`cond:${String(p.condition)}`);
    if (p?.shop_slug) out.push(`shop:${String(p.shop_slug)}`);
    return out.map((s) => s.trim()).filter(Boolean);
}

/** カテゴリ判定：tagが token を「含む」ならヒット扱い（top:trucker-jacket 等に対応） */
function tagHasToken(tag: string, token: string) {
    const t = tag.toLowerCase();
    const k = token.toLowerCase();
    return t.includes(k);
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;
        const url = new URL(req.url);

        // デフォは v=2（buyer swipe想定）
        const recVersion = clampInt(url.searchParams.get("v"), 1, 2, 2);

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // 過去30日の rating を取得（impressions join）
        // ✅ meta はselectしない（存在しないため）
        const { data: ratings, error } = await supabase
            .from("recommendation_ratings")
            .select(`
    rating,
    created_at,
    rec_version,
    impression:recommendation_impressions!inner(
      target_key,
      target_type,
      rec_type,
      payload
    )
  `)
            .eq("user_id", userId)
            .eq("rec_version", recVersion) // 任意だけど混線防止におすすめ
            .gte("created_at", thirtyDaysAgo.toISOString())
            .order("created_at", { ascending: true });


        if (error) throw error;

        if (!ratings || ratings.length === 0) {
            return NextResponse.json({
                ok: true,
                recVersion,
                profile: {
                    topTags: [],
                    weeklyTrends: [],
                    categoryScores: [],
                    confidence: 0,
                    totalRatings: 0,
                    likeCount: 0,
                    dislikeCount: 0,
                },
            });
        }

        const tagScores: Record<string, number> = {};
        const weeklyData: Record<string, Record<string, number>> = {};

        let likeCount = 0;
        let dislikeCount = 0;

        for (const r of ratings as any[]) {
            const weight = Number(r.rating ?? 0); // -1,0,1 想定
            if (weight === 1) likeCount++;
            if (weight === -1) dislikeCount++;

            const imp = r.impression ?? {};
            const tags = extractTagsFromImpression(imp);

            // 全体タグ集計
            for (const tag of tags) {
                tagScores[tag] = (tagScores[tag] || 0) + weight;
            }

            // 週次集計
            const weekNum = Math.floor(
                (new Date(r.created_at).getTime() - thirtyDaysAgo.getTime()) / (7 * 24 * 60 * 60 * 1000)
            );
            const weekKey = `Week ${weekNum + 1}`;

            if (!weeklyData[weekKey]) weeklyData[weekKey] = {};
            for (const tag of tags) {
                weeklyData[weekKey][tag] = (weeklyData[weekKey][tag] || 0) + weight;
            }
        }

        const topTags: TagScore[] = Object.entries(tagScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, score]) => ({ tag, score }));

        const weeklyTrends: WeeklyTrend[] = Object.entries(weeklyData)
            .map(([week, tags]) => {
                const topEntry = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
                if (!topEntry) return null;
                return { week, topTag: topEntry[0], score: topEntry[1] };
            })
            .filter(Boolean) as WeeklyTrend[];

        // カテゴリ分類（token一致を "含む" で見る）
        const categories: Record<string, string[]> = {
            アウター: ["jacket", "coat", "blazer", "hoodie", "cardigan", "bomber", "parka", "windbreaker", "outer"],
            トップス: ["shirt", "sweater", "t-shirt", "tee", "polo", "sweatshirt", "vest", "top"],
            ボトムス: ["pants", "jeans", "shorts", "trousers", "chinos", "joggers", "skirt", "bottom"],
            スタイル: ["vintage", "military", "workwear", "streetwear", "casual", "formal", "minimal", "oversized", "style:"],
            素材: ["denim", "leather", "wool", "cotton", "nylon", "canvas", "corduroy"],
            カラー: ["black", "blue", "navy", "olive", "beige", "grey", "white", "brown", "green", "wash:"],
        };

        const categoryScores: CategoryScore[] = Object.entries(categories).map(([category, tokens]) => {
            const matchedTags: string[] = [];
            let score = 0;

            for (const [tag, sc] of Object.entries(tagScores)) {
                if (tokens.some((tk) => tagHasToken(tag, tk))) {
                    matchedTags.push(tag);
                    score += sc;
                }
            }
            // スコア寄与の大きい順にタグを並べたいならここで並べ替えも可能
            return { category, score, tags: matchedTags.slice(0, 20) };
        });

        categoryScores.sort((a, b) => b.score - a.score);

        const totalRatings = ratings.length;
        const confidence = Math.min(100, Math.round((totalRatings / 50) * 100));

        return NextResponse.json({
            ok: true,
            recVersion,
            profile: {
                topTags,
                weeklyTrends,
                categoryScores: categoryScores.slice(0, 6),
                confidence,
                totalRatings,
                likeCount,
                dislikeCount,
            },
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/profile error:", err);
        return NextResponse.json({ ok: false, error: err.message || "Internal server error" }, { status: 500 });
    }
}
