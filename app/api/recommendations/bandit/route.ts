import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * バンディット（Epsilon-Greedy）
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const epsilon = clamp(parseFloat(searchParams.get("epsilon") || "0.1"), 0, 1);
        const limit = clamp(parseInt(searchParams.get("limit") || "20"), 1, 50);

        const userId = auth.user.id;

        // Like履歴（JOINが死ぬ環境ならここもfallbackが必要だけど、まずは現状維持）
        const ratingsRes = await supabase
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
            .eq("rating", 1)
            .limit(300);

        if (ratingsRes.error) throw ratingsRes.error;

        const ratings = ratingsRes.data || [];

        const userTagScores: Record<string, number> = {};

        ratings.forEach((r: any) => {
            const payload = r.impression?.payload;
            const tags = normalizeTags(payload?.tags) || normalizeTags(payload?.meta?.tags);
            tags.forEach((tag) => {
                userTagScores[tag] = (userTagScores[tag] || 0) + 1;
            });
        });

        const topTags = Object.entries(userTagScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag]) => tag);

        const allCardsRes = await supabase
            .from("curated_cards")
            .select("card_id, tags, image_url")
            .eq("is_active", true)
            .limit(1000);

        if (allCardsRes.error) throw allCardsRes.error;

        const allCards = allCardsRes.data || [];

        if (allCards.length === 0) {
            return NextResponse.json({ ok: true, recommendations: [], strategy: {}, message: "カードがありません" });
        }

        const seenRes = await supabase
            .from("recommendation_impressions")
            .select("target_key")
            .eq("user_id", userId)
            .eq("target_type", "insight")
            .limit(3000);

        if (seenRes.error) throw seenRes.error;

        const seenCardIds = new Set((seenRes.data || []).map((s: any) => String(s.target_key)).filter(Boolean));
        const unseenCards = allCards.filter((card: any) => !seenCardIds.has(String(card.card_id)));

        if (unseenCards.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                strategy: { mode: "no_unseen_cards" },
                message: "未見カードがありません",
            });
        }

        const shouldExplore = Math.random() < epsilon;

        let recommendations: any[] = [];
        let strategy: any = {};

        if (shouldExplore || topTags.length === 0) {
            strategy = {
                mode: "explore",
                epsilon,
                reason: topTags.length === 0 ? "no_user_preferences" : "random_exploration",
            };

            recommendations = shuffle(unseenCards).slice(0, limit).map((card: any) => ({
                card_id: card.card_id,
                tags: normalizeTags(card.tags),
                image_url: card.image_url,
                strategy: "explore",
                matched_tags: [],
                score: 0,
            }));
        } else {
            strategy = { mode: "exploit", epsilon, top_tags: topTags };

            recommendations = unseenCards
                .map((card: any) => {
                    const tags = normalizeTags(card.tags);
                    const matchedTags = tags.filter((t) => topTags.includes(t));
                    const score = matchedTags.reduce((sum, tag) => sum + (userTagScores[tag] || 0), 0);

                    return {
                        card_id: card.card_id,
                        tags,
                        image_url: card.image_url,
                        strategy: "exploit",
                        matched_tags: matchedTags,
                        score,
                    };
                })
                .filter((r: any) => r.score > 0)
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, limit);

            if (recommendations.length < limit) {
                const exploitIds = new Set(recommendations.map((r: any) => String(r.card_id)));
                const remaining = shuffle(unseenCards)
                    .filter((c: any) => !exploitIds.has(String(c.card_id)))
                    .slice(0, limit - recommendations.length)
                    .map((card: any) => ({
                        card_id: card.card_id,
                        tags: normalizeTags(card.tags),
                        image_url: card.image_url,
                        strategy: "explore_補完",
                        matched_tags: [],
                        score: 0,
                    }));

                recommendations = [...recommendations, ...remaining];
            }
        }

        const exploitCount = recommendations.filter((r) => r.strategy === "exploit").length;
        const exploreCount = recommendations.filter((r) => String(r.strategy).startsWith("explore")).length;

        return NextResponse.json({
            ok: true,
            recommendations,
            strategy: {
                ...strategy,
                exploit_count: exploitCount,
                explore_count: exploreCount,
                exploit_ratio: Math.round((exploitCount / (recommendations.length || 1)) * 100),
            },
            total_unseen: unseenCards.length,
            total_seen: seenCardIds.size,
            user_top_tags: topTags,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/bandit error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
