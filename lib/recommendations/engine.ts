// lib/recommendations/engine.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "buyer" | "seller";
export type TargetType = "drop" | "shop" | "insight";

export type RecItem = {
    impressionId: string | null; // APIでimpression作って返すので通常はuuid
    role: Role;
    recType: string;
    targetType: TargetType;
    targetId: string | null;
    rank: number;
    explain?: string | null;
    payload: any;
};

const ACTION_W: Record<string, number> = {
    save: 2,
    click: 3,
    purchase_intent: 4,
    purchase: 6,
};

function priceBand(n: number | null) {
    if (n == null || !Number.isFinite(n)) return "p_unknown";
    if (n < 3000) return "p_0_3k";
    if (n < 8000) return "p_3_8k";
    if (n < 15000) return "p_8_15k";
    if (n < 30000) return "p_15_30k";
    return "p_30k_up";
}

function decayWeight(createdAt: string, base: number) {
    const t = new Date(createdAt).getTime();
    const days = Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24));
    // MVP2+：時間で自然に薄まる（先見越し）
    return base * Math.pow(0.98, days);
}

type Pref = {
    brand: Record<string, number>;
    size: Record<string, number>;
    shop: Record<string, number>;
    price: Record<string, number>;
    cond: Record<string, number>;
};

function emptyPref(): Pref {
    return { brand: {}, size: {}, shop: {}, price: {}, cond: {} };
}

function add(map: Record<string, number>, k: string | null, v: number) {
    if (!k) return;
    const key = String(k).trim().toLowerCase();
    if (!key) return;
    map[key] = (map[key] ?? 0) + v;
}

function scoreDrop(pref: Pref, d: any) {
    const brand = d.brand ? String(d.brand).toLowerCase() : null;
    const size = d.size ? String(d.size).toLowerCase() : null;
    const shop = d.shop_slug ? String(d.shop_slug).toLowerCase() : null;
    const cond = d.condition ? String(d.condition).toLowerCase() : null;
    const pb = priceBand(d.price != null ? Number(d.price) : null);

    let s = 0;
    s += (brand && pref.brand[brand]) || 0;
    s += (size && pref.size[size]) || 0;
    s += (shop && pref.shop[shop]) || 0;
    s += (cond && pref.cond[cond]) || 0;
    s += pref.price[pb] || 0;

    // 軽く正規化（過学習しにくくする）
    return s;
}

export async function buildUserPref(supabase: SupabaseClient, userId: string): Promise<Pref> {
    const pref = emptyPref();

    // ratings
    const { data: rs } = await supabase
        .from("recommendation_ratings")
        .select("rating,created_at,impression_id,recommendation_impressions!inner(payload,role,target_type)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

    for (const r of rs ?? []) {
        const imp: any = (r as any).recommendation_impressions;
        if (!imp || imp.role !== "buyer" || imp.target_type !== "drop") continue;
        const p = imp.payload ?? {};
        const w = decayWeight(String((r as any).created_at), Number((r as any).rating ?? 0));
        add(pref.brand, p.brand ?? null, w);
        add(pref.size, p.size ?? null, w);
        add(pref.shop, p.shop_slug ?? null, w);
        add(pref.cond, p.condition ?? null, w);
        add(pref.price, priceBand(p.price != null ? Number(p.price) : null), w);
    }

    // actions（implicit：強い）
    const { data: as } = await supabase
        .from("recommendation_actions")
        .select("action,created_at,impression_id,meta,recommendation_impressions!inner(payload,role,target_type)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

    for (const a of as ?? []) {
        const imp: any = (a as any).recommendation_impressions;
        if (!imp || imp.role !== "buyer" || imp.target_type !== "drop") continue;
        const p = imp.payload ?? {};
        const base = ACTION_W[String((a as any).action ?? "")] ?? 0;
        const w = decayWeight(String((a as any).created_at), base);
        add(pref.brand, p.brand ?? null, w);
        add(pref.size, p.size ?? null, w);
        add(pref.shop, p.shop_slug ?? null, w);
        add(pref.cond, p.condition ?? null, w);
        add(pref.price, priceBand(p.price != null ? Number(p.price) : null), w);
    }

    return pref;
}

export async function getSeenDropIds(supabase: SupabaseClient, userId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
        .from("recommendation_impressions")
        .select("target_id,created_at")
        .eq("user_id", userId)
        .eq("target_type", "drop")
        .gte("created_at", since)
        .limit(1000);

    const set = new Set<string>();
    for (const r of data ?? []) {
        if (r?.target_id) set.add(String(r.target_id));
    }
    return set;
}

export async function buildBuyerItems(supabase: SupabaseClient, userId: string, limit: number): Promise<RecItem[]> {
    const pref = await buildUserPref(supabase, userId);
    const seen = await getSeenDropIds(supabase, userId);

    // 候補：viewから（tagsは触らない）
    const { data: cand } = await supabase
        .from("v_drops_ranked_30d_v2")
        .select(
            "id,created_at,title,brand,size,condition,price,cover_image_url,purchase_url,url,hot_score,top_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
        )
        .order("hot_score", { ascending: false })
        .limit(400);

    const pool = (cand ?? []).filter((d: any) => d?.id && !seen.has(String(d.id)));

    // MVP4相当：探索枠（20%）
    const exploreN = Math.max(1, Math.round(limit * 0.2));
    const exploitN = Math.max(0, limit - exploreN);

    // exploit（for you）
    const ranked = pool
        .map((d: any) => {
            const base = Number(d.hot_score ?? 0) * 0.1 + Number(d.top_score ?? 0) * 0.02; // 人気も少し混ぜる
            const p = scoreDrop(pref, d);
            return { d, score: base + p };
        })
        .sort((a, b) => b.score - a.score);

    const exploit = ranked.slice(0, exploitN).map((x) => x.d);

    // explore（上位からランダム）
    const explorePool = pool.slice(0, 200);
    const explore: any[] = [];
    for (let i = 0; i < exploreN && explorePool.length; i++) {
        const idx = Math.floor(Math.random() * explorePool.length);
        explore.push(explorePool.splice(idx, 1)[0]);
    }

    const picked = [...exploit, ...explore].slice(0, limit);

    return picked.map((d: any, i: number) => ({
        impressionId: null,
        role: "buyer",
        recType: i < exploit.length ? "buyer_for_you" : "buyer_explore",
        targetType: "drop",
        targetId: String(d.id),
        rank: i,
        explain:
            i < exploit.length
                ? "最近の評価/保存/クリック傾向に近い"
                : "探索枠（新しい出会い）",
        payload: {
            id: d.id,
            title: d.title,
            brand: d.brand,
            size: d.size,
            condition: d.condition,
            price: d.price,
            cover_image_url: d.cover_image_url,
            purchase_url: d.purchase_url,
            url: d.url,
            shop_slug: d.shop_slug,
            shop_name_ja: d.shop_name_ja,
            shop_name_en: d.shop_name_en,
            shop_avatar_url: d.shop_avatar_url,
            shop_headline: d.shop_headline,
        },
    }));
}

export async function buildSellerItems(supabase: SupabaseClient, userId: string, limit: number): Promise<RecItem[]> {
    // MVP2〜5：sellerは “insight中心” にして、後で drop提案/価格提案に拡張できる形に固定
    const { data: shop } = await supabase
        .from("shops")
        .select("id,slug")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    const { data: trend } = await supabase
        .from("v_drops_ranked_30d_v2")
        .select("brand,size,condition,price,hot_score,shop_slug")
        .order("hot_score", { ascending: false })
        .limit(200);

    const topBrands: Record<string, number> = {};
    for (const r of trend ?? []) {
        const b = r?.brand ? String(r.brand).trim() : "";
        if (!b) continue;
        topBrands[b] = (topBrands[b] ?? 0) + 1;
    }

    const brandTop = Object.entries(topBrands)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([brand, cnt]) => ({ brand, cnt }));

    const items: RecItem[] = [];

    items.push({
        impressionId: null,
        role: "seller",
        recType: "seller_trend",
        targetType: "insight",
        targetId: null,
        rank: 0,
        explain: "直近30日でホットスコア上位の傾向から抽出",
        payload: {
            kind: "今週のトレンド（全体）",
            topBrands: brandTop,
            hint: "このブランド/系統を出すと閲覧されやすい",
        },
    });

    items.push({
        impressionId: null,
        role: "seller",
        recType: "seller_next_action",
        targetType: "insight",
        targetId: null,
        rank: 1,
        explain: shop?.slug ? "あなたのShopが検出されました" : "Shop未作成でも使える一般提案",
        payload: {
            kind: "次の一手",
            todo: shop?.slug ? ["売れ筋寄せで1点追加", "価格帯をp_8_15kに寄せた出品も検討"] : ["まずShopを作る", "出品を3点作る", "Buy linkを必ず入れる"],
            shopSlug: shop?.slug ?? null,
        },
    });

    // 残りは埋め（将来は seller_price_hint / seller_waiting_buyers 等へ差し替え）
    for (let i = items.length; i < limit; i++) {
        items.push({
            impressionId: null,
            role: "seller",
            recType: "seller_placeholder",
            targetType: "insight",
            targetId: null,
            rank: i,
            explain: "今後ここに価格提案/需要可視化を追加",
            payload: { kind: "開発枠", note: "MVP5: ABテストや精度比較をここで回す" },
        });
    }

    return items.slice(0, limit);
}
