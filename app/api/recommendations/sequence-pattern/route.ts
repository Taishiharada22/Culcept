import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Pattern = {
    sequence: string; // "LLL", "DDD", "LDL" など
    next_like_prob: number; // 次にlikeする確率
    count: number; // このパターンの出現回数
};

function toSymbol(rating: number) {
    if (rating > 0) return "L";
    if (rating < 0) return "D";
    return "N";
}

/**
 * 連続評価パターン検出
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;
        const sequenceLength = 3;

        const res = await supabase
            .from("recommendation_ratings")
            .select("rating, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(500);

        if (res.error) throw res.error;

        const ratings = res.data || [];

        if (ratings.length < sequenceLength + 1) {
            return NextResponse.json({
                ok: true,
                patterns: [],
                current_sequence: [],
                prediction: null,
                message: "評価データが不足しています",
            });
        }

        const sequences: Record<string, { next_likes: number; next_total: number }> = {};

        for (let i = 0; i <= ratings.length - sequenceLength - 1; i++) {
            const window = ratings.slice(i, i + sequenceLength);
            const next = ratings[i + sequenceLength];

            const pattern = window.map((r: any) => toSymbol(Number(r.rating || 0))).join("");
            const nextRating = Number(next.rating || 0);

            if (!sequences[pattern]) sequences[pattern] = { next_likes: 0, next_total: 0 };

            sequences[pattern].next_total++;
            if (nextRating > 0) sequences[pattern].next_likes++;
        }

        const patterns: Pattern[] = Object.entries(sequences)
            .map(([seq, stats]) => ({
                sequence: seq,
                next_like_prob: stats.next_total > 0 ? stats.next_likes / stats.next_total : 0,
                count: stats.next_total,
            }))
            .filter((p) => p.count >= 2)
            .sort((a, b) => b.count - a.count);

        const recentRatings = ratings.slice(-sequenceLength);
        const currentSequence = recentRatings.map((r: any) => {
            const rating = Number(r.rating || 0);
            if (rating > 0) return { action: "Like", symbol: "L" };
            if (rating < 0) return { action: "Dislike", symbol: "D" };
            return { action: "Neutral", symbol: "N" };
        });

        const currentPattern = currentSequence.map((s) => s.symbol).join("");
        const matched = patterns.find((p) => p.sequence === currentPattern);

        const prediction = matched
            ? {
                pattern: currentPattern,
                next_like_prob: matched.next_like_prob,
                confidence: matched.count >= 5 ? "high" : "medium",
                recommendation:
                    matched.next_like_prob > 0.6
                        ? "次は気に入る可能性が高いです"
                        : matched.next_like_prob < 0.4
                            ? "スキップしても良いかもしれません"
                            : "どちらとも言えません",
            }
            : null;

        return NextResponse.json({
            ok: true,
            patterns: patterns.slice(0, 20),
            current_sequence: currentSequence,
            current_pattern: currentPattern,
            prediction,
            total_ratings: ratings.length,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/sequence-pattern error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
