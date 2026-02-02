import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

type LikeRow = { cardId: string; payload: any };

async function loadUserLikes(supabase: any, userId: string, limit: number): Promise<LikeRow[]> {
    // JOIN優先
    const joinRes = await supabase
        .from("recommendation_ratings")
        .select(
            `
      rating,
      impression:recommendation_impressions!inner(
        target_key,
        payload
      )
    `
        )
        .eq("user_id", userId)
        .eq("rating", 1)
        .limit(limit);

    if (!joinRes.error && Array.isArray(joinRes.data)) {
        return joinRes.data
            .map((r: any) => ({
                cardId: String(r.impression?.target_key || ""),
                payload: r.impression?.payload,
            }))
            .filter((x: any) => x.cardId);
    }

    // fallback: impression_id → impressions
    const baseRes = await supabase
        .from("recommendation_ratings")
        .select("rating, impression_id")
        .eq("user_id", userId)
        .eq("rating", 1)
        .limit(limit);

    if (baseRes.error) throw baseRes.error;

    const rows = baseRes.data || [];
    const impIds = Array.from(new Set(rows.map((r: any) => r.impression_id).filter(Boolean)));

    if (impIds.length === 0) return [];

    const impRes = await supabase
        .from("recommendation_impressions")
        .select("id, target_key, payload")
        .in("id", impIds);

    if (impRes.error) throw impRes.error;

    const byId = new Map<string, any>();
    (impRes.data || []).forEach((i: any) => byId.set(String(i.id), i));

    return rows
        .map((r: any) => {
            const imp = byId.get(String(r.impression_id));
            return { cardId: String(imp?.target_key || ""), payload: imp?.payload };
        })
        .filter((x: any) => x.cardId);
}

/**
 * グラフベース推薦（2-hop）
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;

        // Step1: Likeしたカード＆タグ
        const userLikes = await loadUserLikes(supabase, userId, 80);

        if (userLikes.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                graph_stats: {},
                message: "まずはカードを評価してください",
            });
        }

        const likedCardIds = new Set<string>();
        const likedTags = new Set<string>();

        userLikes.forEach((x) => {
            likedCardIds.add(String(x.cardId));
            extractTagsFromPayload(x.payload).forEach((t) => likedTags.add(t));
        });

        // Step2: 同タグカード（1-hop）
        const cardsRes = await supabase
            .from("curated_cards")
            .select("card_id, tags, image_url")
            .eq("is_active", true)
            .limit(2000);

        if (cardsRes.error) throw cardsRes.error;

        const allCards = cardsRes.data || [];

        if (allCards.length === 0) {
            return NextResponse.json({
                ok: true,
                recommendations: [],
                graph_stats: {},
                message: "カードが見つかりませんでした",
            });
        }

        const cardScores = allCards
            .filter((card: any) => !likedCardIds.has(String(card.card_id)))
            .map((card: any) => {
                const tags = normalizeTags(card.tags);
                const sharedTags = tags.filter((t) => likedTags.has(t));
                return {
                    card_id: card.card_id,
                    tags,
                    image_url: card.image_url,
                    shared_tags: sharedTags,
                    score: sharedTags.length,
                };
            })
            .filter((c: any) => c.score > 0);

        // Step3: 2-hop（他ユーザー経由）
        const otherLikesRes = await supabase
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
            .limit(3000);

        // JOINが死ぬ環境では、ここも impression_id fallback を入れる必要あり
        if (otherLikesRes.error) throw otherLikesRes.error;

        const otherUsersLikes = otherLikesRes.data || [];

        const similarUsers = new Set<string>();

        otherUsersLikes.forEach((r: any) => {
            const cardId = String(r.impression?.target_key || "");
            if (cardId && likedCardIds.has(cardId)) similarUsers.add(String(r.user_id));
        });

        const twoHopCounts: Record<string, number> = {};
        otherUsersLikes.forEach((r: any) => {
            const uid = String(r.user_id);
            if (!similarUsers.has(uid)) return;
            const cardId = String(r.impression?.target_key || "");
            if (!cardId) return;
            if (likedCardIds.has(cardId)) return;
            twoHopCounts[cardId] = (twoHopCounts[cardId] || 0) + 1;
        });

        // 2-hopスコアを上乗せ
        const scoreById = new Map<string, any>();
        cardScores.forEach((c: any) => scoreById.set(String(c.card_id), c));

        Object.entries(twoHopCounts).forEach(([cardId, cnt]) => {
            const row = scoreById.get(String(cardId));
            if (row) row.score += cnt * 2;
        });

        cardScores.sort((a: any, b: any) => b.score - a.score);

        const graphStats = {
            liked_cards: likedCardIds.size,
            liked_tags: likedTags.size,
            similar_users: similarUsers.size,
            one_hop_candidates: cardScores.filter((c: any) => !twoHopCounts[String(c.card_id)]).length,
            two_hop_candidates: Object.keys(twoHopCounts).length,
        };

        return NextResponse.json({
            ok: true,
            recommendations: cardScores.slice(0, 20),
            graph_stats: graphStats,
            total_candidates: cardScores.length,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/graph error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
