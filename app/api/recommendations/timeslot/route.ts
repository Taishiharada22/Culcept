import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TimeSlot = "morning" | "afternoon" | "evening" | "night";

const DEFAULT_TZ = "Asia/Tokyo";

function getTimeSlot(hour: number): TimeSlot {
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 22) return "evening";
    return "night";
}

function getTz(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    return searchParams.get("tz") || req.headers.get("x-tz") || DEFAULT_TZ;
}

function getHourInTz(date: Date, tz: string): number {
    const s = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: tz,
    }).format(date);
    return Number(s);
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
        // JSON配列っぽい
        if (t.startsWith("[") && t.endsWith("]")) {
            try {
                const parsed = JSON.parse(t);
                if (Array.isArray(parsed)) return normalizeTags(parsed);
            } catch { }
        }
        // "a,b,c" 形式
        return t
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
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
    limit: number
): Promise<Array<{ rating: number; created_at: string; payload: any }>> {
    // まずJOINを試す（FKリレーションがある場合はこれが最速）
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
        .order("created_at", { ascending: false })
        .limit(limit);

    if (!joinRes.error && Array.isArray(joinRes.data)) {
        return joinRes.data.map((r: any) => ({
            rating: Number(r.rating || 0),
            created_at: r.created_at,
            payload: r.impression?.payload,
        }));
    }

    // JOIN失敗（リレーション未定義など）→ fallback: impression_idで引く
    const baseRes = await supabase
        .from("recommendation_ratings")
        .select("rating, created_at, impression_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (baseRes.error) throw baseRes.error;

    const rows = Array.isArray(baseRes.data) ? baseRes.data : [];
    const impIds = Array.from(
        new Set(rows.map((r: any) => r.impression_id).filter(Boolean))
    );

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
 * 時間帯別レコメンド
 * 朝/昼/夜で好みが変わることを学習
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
        const currentHour = getHourInTz(now, tz);
        const currentSlot = getTimeSlot(currentHour);

        const ratings = await loadRatingsWithImpressionPayload(supabase, userId, 500);

        if (!ratings || ratings.length === 0) {
            return NextResponse.json({
                ok: true,
                tz,
                current_slot: currentSlot,
                current_hour: currentHour,
                timeslot_preferences: {},
                recommendations: [],
                message: "まずはカードを評価してください",
            });
        }

        const timeslotPreferences: Record<
            TimeSlot,
            { tags: Record<string, { like: number; dislike: number }>; total: number }
        > = {
            morning: { tags: {}, total: 0 },
            afternoon: { tags: {}, total: 0 },
            evening: { tags: {}, total: 0 },
            night: { tags: {}, total: 0 },
        };

        ratings.forEach((r) => {
            const createdAt = new Date(r.created_at);
            const hour = getHourInTz(createdAt, tz);
            const slot = getTimeSlot(hour);
            const rating = Number(r.rating || 0);

            const tags = extractTagsFromPayload(r.payload);

            timeslotPreferences[slot].total++;

            tags.forEach((tag) => {
                if (!timeslotPreferences[slot].tags[tag]) {
                    timeslotPreferences[slot].tags[tag] = { like: 0, dislike: 0 };
                }
                if (rating > 0) timeslotPreferences[slot].tags[tag].like++;
                else if (rating < 0) timeslotPreferences[slot].tags[tag].dislike++;
            });
        });

        // 現在の時間帯のトップタグ
        const currentPrefs = timeslotPreferences[currentSlot];
        const currentTopTags = Object.entries(currentPrefs.tags)
            .map(([tag, counts]) => ({
                tag,
                score: counts.like - counts.dislike,
                like_count: counts.like,
                dislike_count: counts.dislike,
            }))
            .filter((t) => t.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        // サマリー
        const timeslotSummary = (Object.entries(timeslotPreferences) as Array<[TimeSlot, any]>).map(
            ([slot, prefs]) => {
                const topTags = Object.entries(prefs.tags)
                    .map(([tag, counts]: any) => ({ tag, score: counts.like - counts.dislike }))
                    .filter((t: any) => t.score > 0)
                    .sort((a: any, b: any) => b.score - a.score)
                    .slice(0, 3)
                    .map((t: any) => t.tag);

                return { time_slot: slot, total_ratings: prefs.total, top_tags: topTags };
            }
        );

        // 推薦
        let recommendations: any[] = [];

        if (currentTopTags.length > 0) {
            const topTagNames = currentTopTags.map((t) => t.tag);

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
                        const matchedTags = tags.filter((t) => topTagNames.includes(t));
                        const score = matchedTags.length;

                        return {
                            card_id: card.card_id,
                            tags,
                            image_url: card.image_url,
                            matched_tags: matchedTags,
                            score,
                        };
                    })
                    .filter((r: any) => r.score > 0)
                    .sort((a: any, b: any) => b.score - a.score)
                    .slice(0, 20) || [];
        }

        return NextResponse.json({
            ok: true,
            tz,
            current_slot: currentSlot,
            current_hour: currentHour,
            current_top_tags: currentTopTags,
            timeslot_summary: timeslotSummary,
            recommendations,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/timeslot error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
