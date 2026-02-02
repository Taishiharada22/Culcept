// app/api/recommendations/hybrid/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Algorithm = "collaborative" | "vector" | "bandit" | "timeslot" | "graph";

type RecItem = {
    card_id: string;
    score?: number; // raw score
    similarity?: number; // raw score
    image_url?: string;
    tags?: string[];
};

type HybridScore = {
    card_id: string;
    total_score: number;
    scores: Record<Algorithm, number>;
    algorithms_used: Algorithm[];
    image_url?: string;
    tags?: string[];
};

const ALGORITHMS: Algorithm[] = [
    "collaborative",
    "vector",
    "bandit",
    "timeslot",
    "graph",
];

// ✅ Culcept向け：重みはそのまま
const WEIGHTS: Record<Algorithm, number> = {
    collaborative: 0.35,
    vector: 0.3,
    bandit: 0.2,
    timeslot: 0.1,
    graph: 0.05,
};

// =====================
// helpers
// =====================
function safeMax(nums: number[]): number {
    const m = Math.max(...nums);
    return Number.isFinite(m) ? m : 1;
}

function normalizeTags(tags: any): string[] {
    if (!tags) return [];
    if (Array.isArray(tags))
        return tags
            .map(String)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

    return String(tags)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union > 0 ? inter / union : 0;
}

function nowTokyoHour(): number {
    // サーバー環境依存のTZズレ回避（大雑把に +9）
    const d = new Date();
    const utc = d.getUTCHours();
    return (utc + 9) % 24;
}

/**
 * image_url を UI で扱いやすい形に正規化する
 * - "public/..." -> 剥がす
 * - "cards/xxx.png" -> "/cards/xxx.png"
 * - "xxx.png" -> "/cards/xxx.png"
 * - "http(s)://..." -> そのまま
 */
function normalizeImageUrl(u: any): string | undefined {
    if (!u) return undefined;
    let s = String(u).trim();
    if (!s) return undefined;

    // absolute url
    if (s.startsWith("http://") || s.startsWith("https://")) return s;

    // strip leading "public/"
    s = s.replace(/^public\//, "");

    // "cards/..." => "/cards/..."
    if (s.startsWith("cards/")) s = "/" + s;

    // if only filename, attach "/cards/"
    if (!s.startsWith("/")) s = "/cards/" + s;

    return s;
}

/**
 * もしあなたの環境が「_2_2.png が実体」で、
 * API/DB が "_2.png" を返して 404 を出しがちなら、
 * ここで一律補正する（要件に合わせてON）
 */
function fixSuffixIfNeeded(url?: string) {
    if (!url) return url;
    // 例: "/cards/foo_2.png" -> "/cards/foo_2_2.png"
    if (url.endsWith("_2.png")) return url.replace(/_2\.png$/, "_2_2.png");
    return url;
}

/**
 * レコメンド配列の各要素に対して tags / image_url を正規化する
 */
function normalizeRecItems(items: any): RecItem[] {
    const arr: any[] = Array.isArray(items) ? items : [];
    return arr
        .map((r) => {
            const card_id = r?.card_id ? String(r.card_id) : "";
            if (!card_id) return null;

            const score =
                r?.score !== undefined && r?.score !== null ? Number(r.score) : undefined;
            const similarity =
                r?.similarity !== undefined && r?.similarity !== null
                    ? Number(r.similarity)
                    : undefined;

            const tags = normalizeTags(r?.tags);
            const image_url = fixSuffixIfNeeded(normalizeImageUrl(r?.image_url));

            const out: RecItem = { card_id };
            if (Number.isFinite(score as any)) out.score = score;
            if (Number.isFinite(similarity as any)) out.similarity = similarity;
            if (tags.length) out.tags = tags;
            if (image_url) out.image_url = image_url;

            return out;
        })
        .filter(Boolean) as RecItem[];
}

/**
 * サブルートが存在する場合だけ使う（存在しないなら空で返す）
 * - 404 HTMLでも落ちないように text() -> JSON parse
 * - ok フラグが無い/ゆれてる場合も最低限拾えるようにする
 */
async function tryFetchSubroutes(
    req: NextRequest
): Promise<Record<Algorithm, RecItem[]>> {
    // req.url: ".../api/recommendations/hybrid?..." なので "/hybrid" で切る
    const baseUrl = req.url.split("/hybrid")[0];

    const urls: Record<Algorithm, string> = {
        collaborative: `${baseUrl}/collaborative`,
        // vector-similarity のサブルート名が存在する前提（なければ空になるだけ）
        vector: `${baseUrl}/vector-similarity`,
        bandit: `${baseUrl}/bandit?epsilon=0.1&limit=50`,
        timeslot: `${baseUrl}/timeslot`,
        graph: `${baseUrl}/graph`,
    };

    const out: Record<Algorithm, RecItem[]> = {
        collaborative: [],
        vector: [],
        bandit: [],
        timeslot: [],
        graph: [],
    };

    const results = await Promise.allSettled(
        ALGORITHMS.map(async (algo) => {
            const url = urls[algo];
            const r = await fetch(url, {
                // cookie等を引き継ぐ（認証が絡むので）
                headers: req.headers,
                cache: "no-store",
            });

            const text = await r.text();

            // 404 で HTML が返ってくる/空文字などにも耐える
            let json: any = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                json = null;
            }

            return { algo, ok: r.ok, json };
        })
    );

    for (const res of results) {
        if (res.status !== "fulfilled") continue;
        const { algo, ok, json } = res.value;
        if (!ok || !json) continue;

        // ok: true があるならそれを尊重、無い場合は recommendations/items が配列なら採用
        const isOk = json?.ok === true;
        const rawList = json?.recommendations ?? json?.items ?? [];
        const canUse = isOk || Array.isArray(rawList);

        if (!canUse) continue;

        out[algo] = normalizeRecItems(rawList);
    }

    return out;
}

/**
 * ✅ フォールバック（Culcept用）
 * curated_cards.tags とユーザー履歴（存在すれば）で “確実に” 推薦を返す
 */
async function fallbackByTags(
    supabase: any,
    userId: string,
    limit: number
): Promise<Record<Algorithm, RecItem[]>> {
    // cards
    const { data: cards, error: cardsErr } = await supabase
        .from("curated_cards")
        .select("card_id, image_url, tags")
        .eq("is_active", true)
        .limit(2000);

    if (cardsErr) throw cardsErr;

    const allCards: { card_id: string; image_url?: string; tags: string[] }[] = (
        cards || []
    ).map((c: any) => ({
        card_id: String(c.card_id),
        image_url: fixSuffixIfNeeded(normalizeImageUrl(c.image_url)),
        tags: normalizeTags(c.tags),
    }));

    // 可能ならユーザー履歴（テーブル名は環境で違うので候補を試す）
    const ratingTables = [
        "curated_card_ratings",
        "card_ratings",
        "swipe_ratings",
        "recommendation_ratings",
    ];

    let userLikes = new Set<string>();
    let userDislikes = new Set<string>();
    let seen = new Set<string>();
    let historyByHour: Array<{ hour: number; tags: string[]; liked: boolean }> = [];

    for (const tbl of ratingTables) {
        const { data, error } = await supabase
            .from(tbl)
            .select("card_id, rating, created_at")
            .eq("user_id", userId)
            .limit(2000);

        if (error) continue;

        const rows = (data || []) as any[];
        for (const r of rows) {
            const cid = r.card_id ? String(r.card_id) : "";
            if (!cid) continue;
            seen.add(cid);

            const rating = Number(r.rating ?? 0);
            const liked = rating > 0;
            const disliked = rating < 0;

            const card = allCards.find((x) => x.card_id === cid);
            const tags = card?.tags ?? [];

            if (liked) tags.forEach((t) => userLikes.add(t));
            if (disliked) tags.forEach((t) => userDislikes.add(t));

            const createdAt = r.created_at ? new Date(String(r.created_at)) : null;
            const hour = createdAt ? (createdAt.getUTCHours() + 9) % 24 : -1;
            if (hour >= 0) historyByHour.push({ hour, tags, liked });
        }
        // 最初に取れたテーブルだけ使う
        break;
    }

    const likeSet = userLikes;
    const dislikeSet = userDislikes;

    const scored = allCards
        .filter((c) => !seen.has(c.card_id))
        .map((c) => {
            const tagSet = new Set(c.tags);
            const likeSim = jaccard(tagSet, likeSet);
            const dislikeSim = jaccard(tagSet, dislikeSet);
            const base = Math.max(0, likeSim - dislikeSim * 0.8); // dislikeは強めに減点
            return { ...c, baseScore: base };
        });

    // vector: タグ類似を “ベクトル” として扱う
    const vector = scored
        .slice()
        .sort((a, b) => b.baseScore - a.baseScore)
        .slice(0, Math.max(limit * 5, 80))
        .map((c) => ({
            card_id: c.card_id,
            similarity: c.baseScore,
            image_url: c.image_url,
            tags: c.tags,
        }));

    // bandit: baseScore + 探索ノイズ（軽く）
    const bandit = scored
        .slice()
        .map((c) => ({ ...c, banditScore: c.baseScore + Math.random() * 0.08 }))
        .sort((a, b) => b.banditScore - a.banditScore)
        .slice(0, Math.max(limit * 5, 80))
        .map((c) => ({
            card_id: c.card_id,
            score: c.banditScore,
            image_url: c.image_url,
            tags: c.tags,
        }));

    // timeslot: 同じ時間帯で「過去にLikeしたタグ」をブースト
    const currentHour = nowTokyoHour();
    const hourBucket = (h: number) => (h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3); // 0:深夜 1:朝 2:昼 3:夜
    const curB = hourBucket(currentHour);

    const bucketLikes = new Map<string, number>();
    for (const h of historyByHour) {
        if (hourBucket(h.hour) !== curB) continue;
        if (!h.liked) continue;
        for (const t of h.tags) bucketLikes.set(t, (bucketLikes.get(t) || 0) + 1);
    }

    const timeslot = scored
        .slice()
        .map((c) => {
            const boost = c.tags.reduce((acc, t) => acc + (bucketLikes.get(t) || 0), 0);
            return { ...c, timeScore: c.baseScore + boost * 0.02 };
        })
        .sort((a, b) => b.timeScore - a.timeScore)
        .slice(0, Math.max(limit * 5, 80))
        .map((c) => ({
            card_id: c.card_id,
            score: c.timeScore,
            image_url: c.image_url,
            tags: c.tags,
        }));

    // graph: Likeタグの共起（簡易）で2-hopっぽく
    const graphWeights = new Map<string, number>();
    const likedTagsArr = Array.from(likeSet);
    for (const t of likedTagsArr) graphWeights.set(t, (graphWeights.get(t) || 0) + 1);

    const graph = scored
        .slice()
        .map((c) => {
            const g = c.tags.reduce((acc, t) => acc + (graphWeights.get(t) || 0), 0);
            return { ...c, graphScore: c.baseScore + g * 0.015 };
        })
        .sort((a, b) => b.graphScore - a.graphScore)
        .slice(0, Math.max(limit * 5, 80))
        .map((c) => ({
            card_id: c.card_id,
            score: c.graphScore,
            image_url: c.image_url,
            tags: c.tags,
        }));

    // collaborative: 履歴がなければ vector を流用（空よりマシ）
    const collaborative = vector.slice();

    // 履歴が全くない場合：完全ランダムも少し混ぜる（cold start）
    if (likeSet.size === 0 && dislikeSet.size === 0) {
        const shuffled = scored.slice().sort(() => Math.random() - 0.5);
        const randomPick = shuffled.slice(0, Math.max(limit * 3, 60)).map((c) => ({
            card_id: c.card_id,
            score: 0.05 + Math.random() * 0.05,
            image_url: c.image_url,
            tags: c.tags,
        }));
        return {
            collaborative: randomPick,
            vector: randomPick,
            bandit: randomPick,
            timeslot: randomPick,
            graph: randomPick,
        };
    }

    return { collaborative, vector, bandit, timeslot, graph };
}

/**
 * ハイブリッドレコメンダー
 * 複数アルゴリズムの結果を加重平均で統合
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = Math.max(
            1,
            Math.min(50, parseInt(searchParams.get("limit") || "20", 10))
        );

        // 1) サブルートがあるならそれを使う
        const subrouteResults = await tryFetchSubroutes(req);

        const gotAny = ALGORITHMS.some(
            (a) => Array.isArray(subrouteResults[a]) && subrouteResults[a].length > 0
        );

        // 2) ない/死んでるならフォールバックで必ず作る
        const algoResults = gotAny
            ? subrouteResults
            : await fallbackByTags(supabase, auth.user.id, limit);

        // ✅ カードごとのスコア集計
        const cardScores: Record<string, HybridScore> = {};

        for (const algo of ALGORITHMS) {
            const recs = algoResults[algo] || [];
            if (recs.length === 0) continue;

            const rawNums = recs
                .map((r) => Number(r.score ?? r.similarity ?? 0))
                .filter((n) => Number.isFinite(n));
            const maxScore = safeMax(rawNums.length ? rawNums : [1]);

            recs.forEach((rec, idx) => {
                const cardId = rec.card_id;
                if (!cardId) return;

                const rawScore = Number(rec.score ?? rec.similarity ?? 0) || 0;
                const normalizedScore = maxScore > 0 ? rawScore / maxScore : 0;
                const rankBonus = (recs.length - idx) / recs.length;

                const weightedScore = (normalizedScore * 0.7 + rankBonus * 0.3) * WEIGHTS[algo];

                if (!cardScores[cardId]) {
                    cardScores[cardId] = {
                        card_id: cardId,
                        total_score: 0,
                        scores: {} as Record<Algorithm, number>,
                        algorithms_used: [],
                        image_url: fixSuffixIfNeeded(normalizeImageUrl(rec.image_url)),
                        tags: rec.tags ? normalizeTags(rec.tags) : [],
                    };
                }

                cardScores[cardId].total_score += weightedScore;
                cardScores[cardId].scores[algo] = weightedScore;
                cardScores[cardId].algorithms_used.push(algo);

                // tags/image_url が無い場合は埋める
                const normalizedUrl = fixSuffixIfNeeded(normalizeImageUrl(rec.image_url));
                if (!cardScores[cardId].image_url && normalizedUrl) {
                    cardScores[cardId].image_url = normalizedUrl;
                }
                const normalizedTags = rec.tags ? normalizeTags(rec.tags) : [];
                if ((!cardScores[cardId].tags || cardScores[cardId].tags.length === 0) && normalizedTags.length) {
                    cardScores[cardId].tags = normalizedTags;
                }
            });
        }

        const recommendations = Object.values(cardScores)
            .sort((a, b) => b.total_score - a.total_score)
            .slice(0, limit)
            .map((rec, idx) => ({
                ...rec,
                rank: idx + 1,
                total_score: Math.round(rec.total_score * 100) / 100,
                scores: Object.fromEntries(
                    Object.entries(rec.scores).map(([k, v]) => [k, Math.round(v * 100) / 100])
                ),
                algorithm_count: rec.algorithms_used.length,
            }));

        const stats = {
            algorithms_status: ALGORITHMS.map((algo) => ({
                algorithm: algo,
                status: (algoResults[algo]?.length ?? 0) > 0 ? "success" : "failed",
                count: algoResults[algo]?.length ?? 0,
                weight: WEIGHTS[algo],
            })),
            total_candidates: Object.keys(cardScores).length,
            top_algorithms: recommendations
                .slice(0, 10)
                .flatMap((r) => r.algorithms_used)
                .reduce((acc: Record<string, number>, a: string) => {
                    acc[a] = (acc[a] || 0) + 1;
                    return acc;
                }, {}),
            used_fallback: !gotAny,
        };

        return NextResponse.json({
            ok: true,
            recommendations,
            stats,
            weights: WEIGHTS,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/hybrid error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
