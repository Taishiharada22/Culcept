// app/api/luxury/result/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const MIN_SWIPES = 20;

// Lane別の診断理由テンプレート
const LANE_REASONS: Record<string, string> = {
    timeless_elegance: "クラシックで上品なスタイルがお好みです。時代を超える美しさと洗練された雰囲気を大切にされています。",
    avant_garde: "挑戦的で個性的なファッションに惹かれます。常識にとらわれない革新的なスタイルがあなたの魅力です。",
    modern_minimalist: "洗練されたシンプルさを追求されています。無駄を削ぎ落とした美しさが、あなたの感性を表しています。",
    romantic_luxury: "繊細で女性的な美しさを好まれます。ソフトでドリーミーな雰囲気があなたにぴったりです。",
    bold_statement: "大胆で主張的なスタイルが似合います。強い個性と存在感で周囲を魅了する力をお持ちです。",
    heritage_classic: "伝統と歴史への敬意を感じさせるスタイルがお好みです。時を経て証明された品格を大切にされています。",
    sporty_luxe: "アクティブでありながら上質さを求めています。スポーツとラグジュアリーの融合があなたのスタイルです。",
    artistic_expression: "アートと創造性を大切にされています。ファッションを自己表現のキャンバスとして活用されています。",
    eco_conscious: "サステナビリティと美の両立を追求されています。環境への配慮と上質さを兼ね備えたスタイルです。",
    urban_sophisticate: "都会的で洗練されたスタイルがお似合いです。モダンシティライフを体現するセンスをお持ちです。",
};

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 既存の診断結果を確認
        const { data: existingResult } = await supabaseAdmin
            .from("luxury_results")
            .select("*")
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        // 最新のスコアを取得
        const { data: scoresRaw, error: scoresError } = await supabaseAdmin
            .from("luxury_lane_scores")
            .select(`
                lane_id,
                score,
                like_count,
                dislike_count,
                total_count,
                luxury_lanes (
                    name_ja,
                    name_en,
                    color_primary,
                    color_secondary,
                    icon_emoji,
                    description,
                    keywords,
                    shop_url,
                    shop_slug
                )
            `)
            .eq("user_id", auth.user.id)
            .order("score", { ascending: false });

        if (scoresError) {
            console.error("Error fetching luxury scores:", scoresError);
        }

        const { data: laneRows } = await supabaseAdmin
            .from("luxury_lanes")
            .select("lane_id, name_ja, name_en, color_primary, color_secondary, icon_emoji, description, keywords, shop_url, shop_slug");

        const laneMap = new Map((laneRows ?? []).map((lane) => [lane.lane_id, lane]));
        let scores = (scoresRaw ?? []).map((s) => ({
            ...s,
            luxury_lanes: (s as any).luxury_lanes ?? laneMap.get(s.lane_id) ?? null,
        }));

        // fallback: RLSや更新失敗でスコアが空の場合、impressionsから集計
        if (scores.length === 0) {
            const { data: impressions, error: impError } = await supabaseAdmin
                .from("luxury_impressions")
                .select("lane_id, action")
                .eq("user_id", auth.user.id);

            if (impError) {
                console.error("Error fetching impressions for fallback:", impError);
            }

            const laneAgg = new Map<string, { like: number; dislike: number; total: number }>();
            (impressions ?? []).forEach((imp) => {
                const laneId = String(imp.lane_id ?? "");
                if (!laneId) return;
                const current = laneAgg.get(laneId) ?? { like: 0, dislike: 0, total: 0 };
                if (imp.action === "like") current.like += 1;
                if (imp.action === "dislike") current.dislike += 1;
                if (imp.action !== "skip") current.total += 1;
                laneAgg.set(laneId, current);
            });

            scores = [...laneAgg.entries()]
                .map(([lane_id, counts]) => ({
                    lane_id,
                    like_count: counts.like,
                    dislike_count: counts.dislike,
                    total_count: counts.total,
                    score: calculateScore(counts.like, counts.dislike, counts.total),
                    luxury_lanes: laneMap.get(lane_id) ?? null,
                }))
                .filter((s) => (s.total_count ?? 0) > 0)
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        }

        if (!scores || scores.length === 0) {
            return NextResponse.json({
                hasResult: false,
                message: "スワイプを続けて診断結果を得ましょう！",
            });
        }

        const totalRated = scores.reduce((sum, s) => sum + (s.total_count ?? 0), 0);
        if (totalRated < MIN_SWIPES) {
            return NextResponse.json({
                hasResult: false,
                message: "診断に必要なスワイプ数が不足しています。",
                totalRated,
                required: MIN_SWIPES,
            });
        }

        // トップLane
        const topLane = scores[0];

        // 上位タグを集計（likeしたカードのタグから）
        const { data: likedImpressions } = await supabaseAdmin
            .from("luxury_impressions")
            .select("card_id")
            .eq("user_id", auth.user.id)
            .eq("action", "like");

        const likedCardIds = (likedImpressions ?? []).map(i => i.card_id);

        let topTags: string[] = [];
        if (likedCardIds.length > 0) {
            const { data: likedCards } = await supabaseAdmin
                .from("luxury_cards")
                .select("tags")
                .in("card_id", likedCardIds);

            const tagCounts = new Map<string, number>();
            for (const card of likedCards ?? []) {
                for (const tag of card.tags ?? []) {
                    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
                }
            }

            topTags = [...tagCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag]) => tag);
        }

        // 診断理由を生成
        const baseReason = LANE_REASONS[topLane.lane_id] ?? "あなただけの特別なスタイルが見つかりました。";
        const tagNote = topTags.length > 0
            ? `特に${topTags.slice(0, 3).join("、")}といったキーワードがお似合いです。`
            : "";
        const reason = `${baseReason}${tagNote}`;

        // 結果を保存/更新
        const allScoresJson = scores.reduce((acc, s) => {
            acc[s.lane_id] = {
                score: s.score,
                like_count: s.like_count,
                dislike_count: s.dislike_count,
            };
            return acc;
        }, {} as Record<string, any>);

        const { data: savedResult, error: saveError } = await supabaseAdmin
            .from("luxury_results")
            .upsert({
                user_id: auth.user.id,
                top_lane_id: topLane.lane_id,
                top_tags: topTags,
                reason,
                all_scores: allScoresJson,
                created_at: new Date().toISOString(),
            }, {
                onConflict: "user_id",
            })
            .select()
            .single();

        if (saveError) {
            console.error("Error saving result:", saveError);
        }

        // スコアの分布（レーダーチャート用）
        const scoreDistribution = scores.map(s => ({
            lane_id: s.lane_id,
            lane: (s as any).luxury_lanes,
            score: s.score,
            like_count: s.like_count,
            dislike_count: s.dislike_count,
            total_count: s.total_count,
        }));

        const brandRanking = scores
            .filter((s) => (s.total_count ?? 0) > 0)
            .map((s) => ({
                lane_id: s.lane_id,
                score: s.score,
                like_count: s.like_count,
                dislike_count: s.dislike_count,
                total_count: s.total_count,
                ...(s as any).luxury_lanes,
            }))
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.like_count ?? 0) - (a.like_count ?? 0))
            .slice(0, 6);

        // カード別ランキング
        const { data: impressions } = await supabaseAdmin
            .from("luxury_impressions")
            .select("card_id, lane_id, action")
            .eq("user_id", auth.user.id);

        const cardStats = new Map<string, { lane_id: string; likes: number; dislikes: number; total: number }>();
        (impressions ?? []).forEach((imp) => {
            if (imp.action !== "like" && imp.action !== "dislike") return;
            const key = String(imp.card_id ?? "");
            if (!key) return;
            const cur = cardStats.get(key) ?? { lane_id: String(imp.lane_id ?? ""), likes: 0, dislikes: 0, total: 0 };
            if (imp.action === "like") cur.likes += 1;
            if (imp.action === "dislike") cur.dislikes += 1;
            cur.total += 1;
            cardStats.set(key, cur);
        });

        const rankedCardIds = [...cardStats.entries()]
            .map(([cardId, s]) => {
                const baseScore = s.total > 0 ? (s.likes / s.total) * 100 : 0;
                const confidence = Math.min(s.total / 10, 1) * 10;
                return {
                    card_id: cardId,
                    lane_id: s.lane_id,
                    likes: s.likes,
                    dislikes: s.dislikes,
                    total: s.total,
                    score: Math.min(100, baseScore + confidence),
                };
            })
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.likes ?? 0) - (a.likes ?? 0))
            .slice(0, 12);

        const cardIds = rankedCardIds.map((c) => c.card_id);
        const { data: cardRows } = await supabaseAdmin
            .from("luxury_cards")
            .select("card_id, lane_id, image_url, tags")
            .in("card_id", cardIds);

        const cardMap = new Map<string, any>((cardRows ?? []).map((c) => [String(c.card_id), c]));
        const cardRanking = rankedCardIds
            .map((c) => {
                const meta = cardMap.get(c.card_id);
                if (!meta?.image_url) return null;
                return {
                    card_id: c.card_id,
                    lane_id: meta.lane_id ?? c.lane_id,
                    image_url: meta.image_url,
                    tags: meta.tags ?? [],
                    likes: c.likes,
                    dislikes: c.dislikes,
                    total: c.total,
                    score: c.score,
                };
            })
            .filter(Boolean);

        return NextResponse.json({
            hasResult: true,
            result: {
                topLane: {
                    lane_id: topLane.lane_id,
                    ...(topLane as any).luxury_lanes,
                    score: topLane.score,
                },
                topTags,
                reason,
                scoreDistribution,
                totalImpressions: totalRated,
                brandRanking,
                cardRanking,
            },
        });
    } catch (err) {
        console.error("Result API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

function calculateScore(likes: number, dislikes: number, total: number): number {
    if (total === 0) return 0;
    const baseScore = (likes / total) * 100;
    const confidenceBonus = Math.min(total / 10, 1) * 10;
    return Math.min(100, baseScore + confidenceBonus);
}
