import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SpeedInsight = {
    tag: string;
    fast_like_count: number;
    slow_like_count: number;
    fast_dislike_count: number;
    slow_dislike_count: number;
    avg_speed_ms: number;
    confidence: "strong" | "moderate" | "weak";
};

function safeJson(value: any) {
    if (value == null) return null;
    if (typeof value === "object") return value;
    if (typeof value === "string") {
        const t = value.trim();
        if (!t) return null;
        try {
            return JSON.parse(t);
        } catch {
            return value;
        }
    }
    return value;
}

function normalizeTags(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return [];
        if (t.startsWith("[") && t.endsWith("]")) {
            try {
                const parsed = JSON.parse(t);
                if (Array.isArray(parsed)) return normalizeTags(parsed);
            } catch { }
        }
        return t.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

function extractTagsFromPayload(payload: any): string[] {
    const p = safeJson(payload);
    if (!p || typeof p !== "object") return [];
    return normalizeTags((p as any).tags) || normalizeTags((p as any).meta?.tags);
}

/**
 * 評価スピード学習
 * ※ JOINに依存せず、impression_id 経由で集計（FK無くても動きやすい）
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;
        const fastThreshold = 3000; // 3秒

        // impressions（直近500）
        const impRes = await supabase
            .from("recommendation_impressions")
            .select("id, created_at, payload")
            .eq("user_id", userId)
            .eq("target_type", "insight")
            .order("created_at", { ascending: false })
            .limit(500);

        if (impRes.error) throw impRes.error;

        const impressions = impRes.data || [];

        if (impressions.length === 0) {
            return NextResponse.json({
                ok: true,
                speed_insights: [],
                overall_stats: {},
                message: "評価データがありません",
            });
        }

        const impIds = impressions.map((i: any) => i.id).filter(Boolean);

        // ratings（impression_id で引く）
        const ratingRes = await supabase
            .from("recommendation_ratings")
            .select("rating, created_at, impression_id")
            .eq("user_id", userId)
            .in("impression_id", impIds)
            .order("created_at", { ascending: true })
            .limit(2000);

        if (ratingRes.error) throw ratingRes.error;

        const ratings = ratingRes.data || [];

        // impression_id -> 最初のrating（created_at最小）
        const firstRatingByImp = new Map<string, any>();
        ratings.forEach((r: any) => {
            const key = String(r.impression_id);
            if (!key) return;
            if (!firstRatingByImp.has(key)) {
                firstRatingByImp.set(key, r);
            }
        });

        const tagSpeedData: Record<
            string,
            {
                fast_likes: number;
                slow_likes: number;
                fast_dislikes: number;
                slow_dislikes: number;
                speeds: number[];
            }
        > = {};

        let totalFastLikes = 0;
        let totalSlowLikes = 0;
        let totalFastDislikes = 0;
        let totalSlowDislikes = 0;

        impressions.forEach((imp: any) => {
            const impId = String(imp.id);
            const r = firstRatingByImp.get(impId);
            if (!r) return;

            const impTime = new Date(imp.created_at).getTime();
            const ratingTime = new Date(r.created_at).getTime();
            const timeToRate = ratingTime - impTime;

            if (timeToRate < 0 || timeToRate > 60000) return;

            const isFast = timeToRate <= fastThreshold;
            const rating = Number(r.rating || 0);

            const tags = extractTagsFromPayload(imp.payload);
            if (tags.length === 0) return;

            tags.forEach((tag) => {
                if (!tagSpeedData[tag]) {
                    tagSpeedData[tag] = {
                        fast_likes: 0,
                        slow_likes: 0,
                        fast_dislikes: 0,
                        slow_dislikes: 0,
                        speeds: [],
                    };
                }

                tagSpeedData[tag].speeds.push(timeToRate);

                if (rating > 0) {
                    if (isFast) {
                        tagSpeedData[tag].fast_likes++;
                        totalFastLikes++;
                    } else {
                        tagSpeedData[tag].slow_likes++;
                        totalSlowLikes++;
                    }
                } else if (rating < 0) {
                    if (isFast) {
                        tagSpeedData[tag].fast_dislikes++;
                        totalFastDislikes++;
                    } else {
                        tagSpeedData[tag].slow_dislikes++;
                        totalSlowDislikes++;
                    }
                }
            });
        });

        const speedInsights: SpeedInsight[] = Object.entries(tagSpeedData)
            .map(([tag, data]) => {
                const totalFast = data.fast_likes + data.fast_dislikes;
                const totalSlow = data.slow_likes + data.slow_dislikes;
                const total = totalFast + totalSlow;

                if (total < 3) return null;

                const avgSpeed = data.speeds.reduce((a, b) => a + b, 0) / (data.speeds.length || 1);

                let confidence: "strong" | "moderate" | "weak";
                if (total >= 10) confidence = "strong";
                else if (total >= 5) confidence = "moderate";
                else confidence = "weak";

                return {
                    tag,
                    fast_like_count: data.fast_likes,
                    slow_like_count: data.slow_likes,
                    fast_dislike_count: data.fast_dislikes,
                    slow_dislike_count: data.slow_dislikes,
                    avg_speed_ms: Math.round(avgSpeed),
                    confidence,
                };
            })
            .filter(Boolean) as SpeedInsight[];

        speedInsights.sort((a, b) => {
            const aRate = a.fast_like_count / (a.fast_like_count + a.fast_dislike_count + 0.01);
            const bRate = b.fast_like_count / (b.fast_like_count + b.fast_dislike_count + 0.01);
            return bRate - aRate;
        });

        const avgTimeToLike =
            speedInsights
                .filter((s) => s.fast_like_count + s.slow_like_count > 0)
                .reduce((sum, s) => sum + s.avg_speed_ms, 0) /
            (speedInsights.filter((s) => s.fast_like_count + s.slow_like_count > 0).length || 1);

        const overallStats = {
            total_fast_likes: totalFastLikes,
            total_slow_likes: totalSlowLikes,
            total_fast_dislikes: totalFastDislikes,
            total_slow_dislikes: totalSlowDislikes,
            fast_like_rate: Math.round((totalFastLikes / (totalFastLikes + totalSlowLikes + 0.01)) * 100),
            avg_time_to_like: Math.round(avgTimeToLike || 0),
        };

        const strongInterestTags = speedInsights
            .filter((s) => {
                const rate = s.fast_like_count / (s.fast_like_count + s.fast_dislike_count + 0.01);
                return rate > 0.7 && s.confidence !== "weak";
            })
            .slice(0, 10);

        return NextResponse.json({
            ok: true,
            speed_insights: speedInsights.slice(0, 30),
            strong_interest_tags: strongInterestTags,
            overall_stats: overallStats,
            total_analyzed: impressions.length,
            fast_threshold_ms: fastThreshold,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/speed-learning error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
