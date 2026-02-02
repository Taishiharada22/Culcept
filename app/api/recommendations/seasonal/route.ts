import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Season = "spring" | "summer" | "autumn" | "winter";

const DEFAULT_TZ = "Asia/Tokyo";

function getTz(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    return searchParams.get("tz") || req.headers.get("x-tz") || DEFAULT_TZ;
}

function getMonthInTz(date: Date, tz: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        timeZone: tz,
    }).format(date);
    return Number(parts); // 1-12
}

function getSeason(month: number): Season {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
}

function getSeasonName(season: Season): string {
    const names: Record<Season, string> = {
        spring: "春",
        summer: "夏",
        autumn: "秋",
        winter: "冬",
    };
    return names[season];
}

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

async function loadRatingsWithImpressionPayload(
    supabase: any,
    userId: string,
    sinceIso: string,
    limit: number
): Promise<Array<{ rating: number; created_at: string; payload: any }>> {
    const joinRes = await supabase
        .from("recommendation_ratings")
        .select(
            `
      rating,
      created_at,
      impression:recommendation_impressions!inner(
        payload
      )
    `
        )
        .eq("user_id", userId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (!joinRes.error && Array.isArray(joinRes.data)) {
        return joinRes.data.map((r: any) => ({
            rating: Number(r.rating || 0),
            created_at: r.created_at,
            payload: r.impression?.payload,
        }));
    }

    const baseRes = await supabase
        .from("recommendation_ratings")
        .select("rating, created_at, impression_id")
        .eq("user_id", userId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (baseRes.error) throw baseRes.error;

    const rows = Array.isArray(baseRes.data) ? baseRes.data : [];
    const impIds = Array.from(new Set(rows.map((r: any) => r.impression_id).filter(Boolean)));

    let impById = new Map<string, any>();
    if (impIds.length > 0) {
        const impRes = await supabase
            .from("recommendation_impressions")
            .select("id, payload")
            .in("id", impIds);

        if (impRes.error) throw impRes.error;

        (impRes.data || []).forEach((imp: any) => {
            impById.set(String(imp.id), imp);
        });
    }

    return rows.map((r: any) => ({
        rating: Number(r.rating || 0),
        created_at: r.created_at,
        payload: impById.get(String(r.impression_id))?.payload ?? null,
    }));
}

/**
 * 季節性検出
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;
        const tz = getTz(req);

        const now = new Date();
        const currentMonth = getMonthInTz(now, tz);
        const currentSeason = getSeason(currentMonth);

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const sinceIso = oneYearAgo.toISOString();
        const ratings = await loadRatingsWithImpressionPayload(supabase, userId, sinceIso, 1000);

        if (!ratings || ratings.length === 0) {
            return NextResponse.json({
                ok: true,
                tz,
                current_season: currentSeason,
                seasonal_trends: [],
                recommendations: [],
                message: "まずはカードを評価してください",
            });
        }

        const seasonalData: Record<
            Season,
            { tags: Record<string, { like: number; dislike: number }>; total: number }
        > = {
            spring: { tags: {}, total: 0 },
            summer: { tags: {}, total: 0 },
            autumn: { tags: {}, total: 0 },
            winter: { tags: {}, total: 0 },
        };

        ratings.forEach((r) => {
            const createdAt = new Date(r.created_at);
            const month = getMonthInTz(createdAt, tz);
            const season = getSeason(month);
            const rating = Number(r.rating || 0);

            const tags = extractTagsFromPayload(r.payload);

            seasonalData[season].total++;

            tags.forEach((tag) => {
                if (!seasonalData[season].tags[tag]) {
                    seasonalData[season].tags[tag] = { like: 0, dislike: 0 };
                }
                if (rating > 0) seasonalData[season].tags[tag].like++;
                else if (rating < 0) seasonalData[season].tags[tag].dislike++;
            });
        });

        const seasonalTrends = (Object.entries(seasonalData) as Array<[Season, any]>).map(
            ([season, data]) => {
                const topTags = Object.entries(data.tags)
                    .map(([tag, counts]: any) => ({
                        tag,
                        score: counts.like - counts.dislike,
                        like_count: counts.like,
                    }))
                    .filter((t: any) => t.score > 0)
                    .sort((a: any, b: any) => b.score - a.score)
                    .slice(0, 5);

                return {
                    season,
                    season_name: getSeasonName(season),
                    total_ratings: data.total,
                    top_tags: topTags,
                };
            }
        );

        const currentSeasonData = seasonalData[currentSeason];
        const currentTopTags = Object.entries(currentSeasonData.tags)
            .map(([tag, counts]: any) => ({ tag, score: counts.like - counts.dislike }))
            .filter((t: any) => t.score > 0)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 10)
            .map((t: any) => t.tag);

        let recommendations: any[] = [];

        if (currentTopTags.length > 0) {
            const [cardsRes, seenRes] = await Promise.all([
                supabase
                    .from("curated_cards")
                    .select("card_id, tags, image_url")
                    .eq("is_active", true)
                    .limit(500),
                supabase
                    .from("recommendation_impressions")
                    .select("target_key")
                    .eq("user_id", userId)
                    .eq("target_type", "insight")
                    .limit(2000),
            ]);

            if (cardsRes.error) throw cardsRes.error;
            if (seenRes.error) throw seenRes.error;

            const cards = cardsRes.data || [];
            const seenCardIds = new Set(
                (seenRes.data || []).map((s: any) => String(s.target_key)).filter(Boolean)
            );

            recommendations =
                cards
                    .filter((card: any) => !seenCardIds.has(String(card.card_id)))
                    .map((card: any) => {
                        const tags = normalizeTags(card.tags);
                        const matchedTags = tags.filter((t) => currentTopTags.includes(t));
                        const score = matchedTags.length;
                        return { card_id: card.card_id, tags, image_url: card.image_url, matched_tags: matchedTags, score };
                    })
                    .filter((r: any) => r.score > 0)
                    .sort((a: any, b: any) => b.score - a.score)
                    .slice(0, 20) || [];
        }

        const seasonComparison = seasonalTrends.map((s) => {
            const uniqueTags = s.top_tags.filter((t: any) => {
                return !seasonalTrends
                    .filter((other) => other.season !== s.season)
                    .some((other) => other.top_tags.some((ot: any) => ot.tag === t.tag));
            });

            return {
                season: s.season,
                season_name: s.season_name,
                unique_tags: uniqueTags.map((t: any) => t.tag),
            };
        });

        return NextResponse.json({
            ok: true,
            tz,
            current_season: currentSeason,
            current_season_name: getSeasonName(currentSeason),
            current_month: currentMonth,
            seasonal_trends: seasonalTrends,
            season_comparison: seasonComparison,
            recommendations,
            total_ratings: ratings.length,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/seasonal error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
