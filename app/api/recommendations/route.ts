// app/api/recommendations/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight";

type RecItem = {
    impressionId: string | null;
    role: Role;
    recType: string;
    targetType: TargetType;
    targetId: string | null;
    rank: number;
    explain?: string | null;
    payload: any;
};

function isoDaysAgo(days: number) {
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return d.toISOString();
}

function moneyNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function uniq<T>(arr: T[]) {
    return Array.from(new Set(arr));
}

function clampInt(v: any, lo: number, hi: number, fallback: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function getRecVersion(req: Request): 1 | 2 {
    const url = new URL(req.url);
    const v = clampInt(url.searchParams.get("v"), 1, 2, 1);
    return (v === 2 ? 2 : 1) as 1 | 2;
}

async function detectRoleAuto(userId: string): Promise<Role> {
    const { data: shop } = await supabaseAdmin
        .from("shops")
        .select("id")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle();
    return shop?.id ? "seller" : "buyer";
}

async function loadRecentlySeenSet(userId: string, role: Role, targetType: TargetType, recVersion: number) {
    const since = isoDaysAgo(14);
    const { data } = await supabaseAdmin
        .from("recommendation_impressions")
        .select("target_id")
        .eq("user_id", userId)
        .eq("role", role)
        .eq("rec_version", recVersion)
        .eq("target_type", targetType)
        .gte("created_at", since)
        .limit(4000);

    return new Set((data ?? []).map((x: any) => String(x.target_id)).filter(Boolean));
}

async function loadUserSignals(userId: string, role: Role, recVersion: number) {
    const since = isoDaysAgo(30);

    const { data: rates } = await supabaseAdmin
        .from("recommendation_ratings")
        .select("rating, impression_id, created_at")
        .eq("user_id", userId)
        .eq("rec_version", recVersion)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);

    const { data: acts } = await supabaseAdmin
        .from("recommendation_actions")
        .select("action, meta, impression_id, created_at")
        .eq("user_id", userId)
        .eq("rec_version", recVersion)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);

    const impIds = uniq([
        ...(rates ?? []).map((r: any) => r.impression_id),
        ...(acts ?? []).map((a: any) => a.impression_id),
    ]).filter(Boolean);

    const impMap = new Map<string, any>();
    if (impIds.length) {
        const { data: imps } = await supabaseAdmin
            .from("recommendation_impressions")
            .select("id, role, target_type, rec_type, target_id, payload, rec_version")
            .in("id", impIds as any)
            .eq("role", role)
            .eq("rec_version", recVersion);

        for (const x of imps ?? []) impMap.set(String((x as any).id), x);
    }

    const likedBrands: string[] = [];
    const dislikedBrands: string[] = [];
    const likedSizes: string[] = [];
    const dislikedSizes: string[] = [];
    const likedShops: string[] = [];
    const dislikedShops: string[] = [];
    const priceSeen: number[] = [];

    const addFromDropPayload = (payload: any, w: number) => {
        const brand = payload?.brand ? String(payload.brand) : "";
        const size = payload?.size ? String(payload.size) : "";
        const shopSlug = payload?.shop_slug ? String(payload.shop_slug) : "";
        const price = moneyNum(payload?.price ?? payload?.display_price);

        if (brand) for (let i = 0; i < Math.abs(w); i++) (w > 0 ? likedBrands : dislikedBrands).push(brand);
        if (size) for (let i = 0; i < Math.abs(w); i++) (w > 0 ? likedSizes : dislikedSizes).push(size);
        if (shopSlug) for (let i = 0; i < Math.abs(w); i++) (w > 0 ? likedShops : dislikedShops).push(shopSlug);
        if (price != null) priceSeen.push(price);
    };

    for (const r of rates ?? []) {
        const imp = impMap.get(String((r as any).impression_id));
        if (!imp) continue;
        if ((imp as any).target_type !== "drop") continue;
        const payload = (imp as any).payload ?? {};
        const rating = Number((r as any).rating);
        if (rating === 0) continue;
        addFromDropPayload(payload, rating);
    }

    const weightByAction: Record<string, number> = { save: 2, click: 3, purchase: 6 };
    for (const a of acts ?? []) {
        const w = weightByAction[String((a as any).action)] ?? 0;
        if (!w) continue;
        const imp = impMap.get(String((a as any).impression_id));
        if (!imp) continue;
        if ((imp as any).target_type !== "drop") continue;
        const payload = (imp as any).payload ?? {};
        addFromDropPayload(payload, w);
    }

    const avgPrice = priceSeen.length ? Math.round(priceSeen.reduce((s, x) => s + x, 0) / priceSeen.length) : null;

    return {
        likedBrands: uniq(likedBrands).slice(0, 20),
        dislikedBrands: uniq(dislikedBrands).slice(0, 20),
        likedSizes: uniq(likedSizes).slice(0, 20),
        dislikedSizes: uniq(dislikedSizes).slice(0, 20),
        likedShops: uniq(likedShops).slice(0, 20),
        dislikedShops: uniq(dislikedShops).slice(0, 20),
        avgPrice,
    };
}

function priceBand(p: number | null): string {
    if (p == null) return "unknown";
    if (p < 5000) return "<5k";
    if (p < 10000) return "5-10k";
    if (p < 20000) return "10-20k";
    if (p < 30000) return "20-30k";
    return ">=30k";
}

// なるべく同一brand/shopが固まらないように上位から間引く（MVPの分散）
function pickDiversified<T>(
    sorted: T[],
    n: number,
    keys: Array<(x: T) => string>
): T[] {
    const picked: T[] = [];
    const used = keys.map(() => new Set<string>());

    // 1st pass: なるべく被らないもの
    for (const x of sorted) {
        if (picked.length >= n) break;
        let ok = true;
        keys.forEach((kfn, i) => {
            const k = (kfn(x) || "").trim();
            if (k && used[i].has(k)) ok = false;
        });
        if (!ok) continue;

        picked.push(x);
        keys.forEach((kfn, i) => {
            const k = (kfn(x) || "").trim();
            if (k) used[i].add(k);
        });
    }

    // 2nd pass: 足りなければ普通に埋める
    if (picked.length < n) {
        for (const x of sorted) {
            if (picked.length >= n) break;
            if (picked.includes(x as any)) continue;
            picked.push(x);
        }
    }

    return picked.slice(0, n);
}

async function buildBuyerDrops(userId: string, limit: number, recVersion: number): Promise<RecItem[]> {
    const seen = await loadRecentlySeenSet(userId, "buyer", "drop", recVersion);
    const sig = await loadUserSignals(userId, "buyer", recVersion);

    const { data: candidates } = await supabaseAdmin
        .from("v_drops_ranked_30d_v2")
        .select(
            "id, title, brand, size, condition, price, display_price, cover_image_url, purchase_url, url, hot_score, top_score, shop_slug, shop_name_ja, shop_name_en, shop_avatar_url, shop_headline"
        )
        .order("hot_score", { ascending: false })
        .limit(400);

    // ✅ buyerでも「候補ゼロ」時に必ずinsightを返す（おすすめが消えない）
    if (!candidates || candidates.length === 0) {
        const fb: RecItem[] = [
            {
                impressionId: null,
                role: "buyer",
                recType: "buyer_no_candidates",
                targetType: "insight",
                targetId: null,
                rank: 0,
                explain: "おすすめ候補が空です（ランキングビューが空/未計算の可能性）",
                payload: {
                    kind: "no_candidates",
                    hint: "v_drops_ranked_30d_v2 が空 or hot_score が計算されていない可能性。Drop作成/ビュー定義を確認。",
                },
            },
        ];
        return fb.slice(0, limit);
    }

    const rows = (candidates ?? [])
        .map((d: any) => {
            const id = String(d.id);
            if (!id || seen.has(id)) return null;

            const base = Number(d.hot_score ?? d.top_score ?? 0) || 0;
            const brand = d.brand ? String(d.brand) : "";
            const size = d.size ? String(d.size) : "";
            const shop = d.shop_slug ? String(d.shop_slug) : "";

            let boost = 0;
            if (brand && sig.likedBrands.includes(brand)) boost += 5;
            if (size && sig.likedSizes.includes(size)) boost += 3;
            if (shop && sig.likedShops.includes(shop)) boost += 4;

            if (brand && sig.dislikedBrands.includes(brand)) boost -= 6;
            if (size && sig.dislikedSizes.includes(size)) boost -= 4;
            if (shop && sig.dislikedShops.includes(shop)) boost -= 5;

            const p = moneyNum(d.display_price ?? d.price);
            if (sig.avgPrice != null && p != null) {
                const lo = sig.avgPrice * 0.6;
                const hi = sig.avgPrice * 1.4;
                if (p >= lo && p <= hi) boost += 2;
            }

            const score = base + boost;

            const explain =
                boost >= 6 ? "最近の好みに近い（ブランド/サイズ/ショップ）" : base > 0 ? "いま人気（ホット上位）" : null;

            const payload = {
                id,
                title: d.title,
                brand: d.brand,
                size: d.size,
                condition: d.condition,
                price: d.price,
                display_price: d.display_price,
                cover_image_url: d.cover_image_url,
                purchase_url: d.purchase_url,
                url: d.url,
                shop_slug: d.shop_slug,
                shop_name_ja: d.shop_name_ja,
                shop_name_en: d.shop_name_en,
                shop_avatar_url: d.shop_avatar_url,
                shop_headline: d.shop_headline,
            };

            return {
                id,
                score,
                explain,
                payload,
                brand: brand || "",
                shop: shop || "",
                band: priceBand(p),
            };
        })
        .filter(Boolean) as any[];

    if (!rows.length) {
        const fb: RecItem[] = [
            {
                impressionId: null,
                role: "buyer",
                recType: "buyer_all_seen",
                targetType: "insight",
                targetId: null,
                rank: 0,
                explain: "直近のおすすめを見切っているので、少し時間をおいて再生成してください",
                payload: {
                    kind: "cooldown",
                    note: "14日以内に表示済みの候補が多い可能性があります。",
                },
            },
        ];
        return fb.slice(0, limit);
    }

    rows.sort((a, b) => b.score - a.score);

    // exploit/explore（探索は“分散”を意識して拾う）
    const exploreN = Math.max(1, Math.round(limit * 0.2));
    const exploitN = Math.max(0, limit - exploreN);

    const exploit = pickDiversified(rows, exploitN, [(x) => x.brand, (x) => x.shop]);

    const usedIds = new Set(exploit.map((x: any) => x.id));
    const rest = rows.filter((x: any) => !usedIds.has(x.id));

    // explore：brand/price帯が被りにくいように
    const explorePicked: any[] = [];
    const usedBrand = new Set(exploit.map((x: any) => x.brand).filter(Boolean));
    const usedBand = new Set(exploit.map((x: any) => x.band).filter(Boolean));

    // まず “新しいbrand or 新しい価格帯” を優先
    for (const x of rest) {
        if (explorePicked.length >= exploreN) break;
        const b = x.brand || "";
        const band = x.band || "";
        const ok = (b && !usedBrand.has(b)) || (band && !usedBand.has(band));
        if (!ok) continue;
        explorePicked.push(x);
        if (b) usedBrand.add(b);
        if (band) usedBand.add(band);
    }
    // 足りなければ上から埋める
    for (const x of rest) {
        if (explorePicked.length >= exploreN) break;
        if (explorePicked.includes(x)) continue;
        explorePicked.push(x);
    }

    const picked = [...exploit, ...explorePicked].slice(0, limit);

    return picked.map((x: any, i: number) => ({
        impressionId: null,
        role: "buyer",
        recType: i < exploit.length ? "buyer_drop_personalized" : "buyer_drop_explore",
        targetType: "drop",
        targetId: x.id,
        rank: i,
        explain: x.explain ?? null,
        payload: x.payload,
    }));
}

async function buildBuyerShops(userId: string, limit: number, recVersion: number): Promise<RecItem[]> {
    if (limit <= 0) return [];

    const seen = await loadRecentlySeenSet(userId, "buyer", "shop", recVersion);
    const sig = await loadUserSignals(userId, "buyer", recVersion);

    const { data: shops } = await supabaseAdmin
        .from("v_shops_ranked_30d_v1")
        .select("shop_slug, shop_name_ja, shop_name_en, shop_avatar_url, shop_headline, drops_count, hot_score_avg, hot_score_sum, buy_rate_30d, outbound_30d, buy_clicks_30d")
        .order("hot_score_sum", { ascending: false })
        .limit(200);

    const rows = (shops ?? [])
        .map((s: any) => {
            const slug = String(s.shop_slug ?? "");
            if (!slug || seen.has(slug)) return null;

            const base = Number(s.hot_score_avg ?? 0) || 0;
            const drops = Number(s.drops_count ?? 0) || 0;

            let boost = 0;
            if (sig.likedShops.includes(slug)) boost += 6;
            if (sig.dislikedShops.includes(slug)) boost -= 8;

            // 売れ筋っぽさ（buy_rateは無いこともあるので軽く）
            const buyRate = s.buy_rate_30d != null ? Number(s.buy_rate_30d) : null;
            if (buyRate != null) boost += Math.min(3, Math.max(-3, (buyRate - 0.15) * 10)); // 0.15を基準に軽く加点

            const score = base + boost + Math.log10(1 + drops);

            const explain =
                boost >= 5 ? "最近の好みに近い（Shop）" : drops >= 10 ? "人気Dropが多いShop" : "新しい出会い（Shop）";

            const payload = {
                shop_slug: slug,
                shop_name_ja: s.shop_name_ja ?? null,
                shop_name_en: s.shop_name_en ?? null,
                shop_avatar_url: s.shop_avatar_url ?? null,
                shop_headline: s.shop_headline ?? null,
                drops_count: s.drops_count ?? null,
                hot_score_avg: s.hot_score_avg ?? null,
                buy_rate_30d: s.buy_rate_30d ?? null,
            };

            return { slug, score, explain, payload };
        })
        .filter(Boolean) as any[];

    rows.sort((a, b) => b.score - a.score);

    const picked = pickDiversified(rows, limit, [(x) => x.slug]);

    return picked.map((x: any, i: number) => ({
        impressionId: null,
        role: "buyer",
        recType: i === 0 ? "buyer_shop_top" : "buyer_shop_more",
        targetType: "shop",
        targetId: x.slug,
        rank: i,
        explain: x.explain ?? null,
        payload: x.payload,
    }));
}

async function buildBuyerItems(userId: string, limit: number, recVersion: number): Promise<RecItem[]> {
    // limitが小さい時はdrop優先
    const nShop = limit >= 6 ? Math.min(5, Math.max(1, Math.round(limit * 0.25))) : limit >= 4 ? 1 : 0;
    const nDrop = Math.max(1, limit - nShop);

    const drops = await buildBuyerDrops(userId, nDrop, recVersion);

    // drop側がinsight返している場合（候補ゼロ等）→そのまま返す（shopを混ぜない）
    if (drops.length && drops[0].targetType === "insight") {
        return drops.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
    }

    const shops = await buildBuyerShops(userId, nShop, recVersion);

    // interleave: 4dropごとに1shopを挿す（ある時だけ）
    const out: RecItem[] = [];
    let di = 0;
    let si = 0;
    while (out.length < limit && (di < drops.length || si < shops.length)) {
        // dropを最大4つ
        for (let k = 0; k < 4 && out.length < limit && di < drops.length; k++) {
            out.push(drops[di++]);
        }
        // shopを1つ
        if (out.length < limit && si < shops.length) {
            out.push(shops[si++]);
        }
    }

    return out.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
}

// sellerはあなたの既存ロジックを維持（今貼ってくれた完成版をそのまま採用）
async function buildSellerInsights(userId: string, limit: number, recVersion: number): Promise<RecItem[]> {
    // ここは「あなたが貼った seller 完成版」をそのまま使ってOK。
    // 今回は“全文置換”の都合で、あなたが貼った完成版をそのまま入れてます。

    // ---- ここから（あなたが貼った seller 完成版） ----
    const { data: myDrops } = await supabaseAdmin
        .from("drops")
        .select("id, title, brand, size, condition, price, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80);

    const { data: top } = await supabaseAdmin
        .from("v_drops_ranked_30d_v2")
        .select("id, brand, size, condition, display_price, hot_score")
        .order("hot_score", { ascending: false })
        .limit(400);

    const allPrices = (top ?? [])
        .map((x: any) => moneyNum(x.display_price))
        .filter((x: any) => x != null) as number[];
    allPrices.sort((a, b) => a - b);
    const marketMedian = allPrices.length ? allPrices[Math.floor(allPrices.length / 2)] : null;

    const brandFreq = new Map<string, number>();
    const sizeFreq = new Map<string, number>();
    for (const d of top ?? []) {
        const b = d.brand ? String(d.brand) : "";
        const s = d.size ? String(d.size) : "";
        if (b) brandFreq.set(b, (brandFreq.get(b) ?? 0) + 1);
        if (s) sizeFreq.set(s, (sizeFreq.get(s) ?? 0) + 1);
    }

    const topBrands = Array.from(brandFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topSizes = Array.from(sizeFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const insights: RecItem[] = [];

    for (const [brand, n] of topBrands) {
        insights.push({
            impressionId: null,
            role: "seller",
            recType: "seller_trend_brand",
            targetType: "insight",
            targetId: null,
            rank: insights.length,
            explain: "直近の人気Dropに頻出",
            payload: { kind: "trend_brand", brand, frequency: n },
        });
    }

    for (const [size, n] of topSizes) {
        insights.push({
            impressionId: null,
            role: "seller",
            recType: "seller_trend_size",
            targetType: "insight",
            targetId: null,
            rank: insights.length,
            explain: "直近の人気Dropに多いサイズ傾向",
            payload: { kind: "trend_size", size, frequency: n },
        });
    }

    const since = isoDaysAgo(30);
    const { data: saveActs } = await supabaseAdmin
        .from("recommendation_actions")
        .select("impression_id")
        .eq("action", "save")
        .eq("rec_version", recVersion)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(800);

    const saveImpIds = uniq((saveActs ?? []).map((x: any) => x.impression_id)).filter(Boolean);
    if (saveImpIds.length) {
        const { data: imps } = await supabaseAdmin
            .from("recommendation_impressions")
            .select("id, target_type, payload, rec_version")
            .in("id", saveImpIds as any)
            .eq("target_type", "drop")
            .eq("rec_version", recVersion)
            .limit(800);

        const comboFreq = new Map<string, number>();
        for (const imp of imps ?? []) {
            const p = (imp as any).payload ?? {};
            const b = p.brand ? String(p.brand) : "";
            const s = p.size ? String(p.size) : "";
            const key = [b, s].filter(Boolean).join(" / ");
            if (!key) continue;
            comboFreq.set(key, (comboFreq.get(key) ?? 0) + 1);
        }

        const topCombos = Array.from(comboFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
        for (const [key, n] of topCombos) {
            insights.push({
                impressionId: null,
                role: "seller",
                recType: "seller_waiting_buyers",
                targetType: "insight",
                targetId: null,
                rank: insights.length,
                explain: "最近“保存”が集まりやすい傾向",
                payload: { kind: "waiting_buyers", combo: key, save_count_30d: n },
            });
        }
    }

    const my = myDrops ?? [];
    for (const d of my.slice(0, 10)) {
        const brand = d.brand ? String(d.brand) : "";
        const size = d.size ? String(d.size) : "";
        if (!brand && !size) continue;

        const similars = (top ?? []).filter((x: any) => {
            const b = x.brand ? String(x.brand) : "";
            const s = x.size ? String(x.size) : "";
            const c = x.condition ? String(x.condition) : "";
            const okBrand = brand ? b === brand : true;
            const okSize = size ? s === size : true;
            const okCond = d.condition ? c === String(d.condition) : true;
            return okBrand && okSize && okCond;
        });

        if (similars.length < 6) continue;

        const prices = similars.map((x: any) => moneyNum(x.display_price)).filter((x: any) => x != null) as number[];
        if (!prices.length) continue;

        prices.sort((a, b) => a - b);
        const mid = prices[Math.floor(prices.length / 2)];
        const myPrice = moneyNum(d.price);
        if (myPrice == null) continue;

        const diffPct = Math.round(((myPrice - mid) / mid) * 100);
        if (Math.abs(diffPct) < 25) continue;

        insights.push({
            impressionId: null,
            role: "seller",
            recType: "seller_price_hint",
            targetType: "insight",
            targetId: String(d.id),
            rank: insights.length,
            explain: "近い条件の相場から推定",
            payload: {
                kind: "price_hint",
                drop_id: String(d.id),
                title: d.title,
                brand: d.brand,
                size: d.size,
                condition: d.condition,
                your_price: myPrice,
                market_median: mid,
                diff_pct: diffPct,
                suggestion:
                    diffPct > 0
                        ? "価格が高め。回転重視なら調整すると売れやすい可能性"
                        : "価格が低め。強気にしても売れる可能性",
            },
        });

        if (insights.length >= limit + 5) break;
    }

    const { data: recentRates } = await supabaseAdmin
        .from("recommendation_ratings")
        .select("rating, impression_id")
        .eq("user_id", userId)
        .eq("rec_version", recVersion)
        .order("created_at", { ascending: false })
        .limit(200);

    const ratedImpIds = uniq((recentRates ?? []).map((x: any) => x.impression_id)).filter(Boolean);
    const dislikedKinds = new Set<string>();

    if (ratedImpIds.length) {
        const { data: ratedImps } = await supabaseAdmin
            .from("recommendation_impressions")
            .select("id, payload, role, rec_version")
            .in("id", ratedImpIds as any)
            .eq("role", "seller")
            .eq("rec_version", recVersion);

        const ratingMap = new Map<string, number>();
        for (const r of recentRates ?? []) ratingMap.set(String((r as any).impression_id), Number((r as any).rating));

        for (const imp of ratedImps ?? []) {
            const id = String((imp as any).id);
            const rating = ratingMap.get(id) ?? 0;
            if (rating >= 0) continue;
            const kind = (imp as any)?.payload?.kind ? String((imp as any).payload.kind) : "";
            if (kind) dislikedKinds.add(kind);
        }
    }

    const filterByDisliked = (arr: RecItem[]) => {
        return arr.filter((x) => {
            const kind = x.payload?.kind ? String(x.payload.kind) : "";
            return kind ? !dislikedKinds.has(kind) : true;
        });
    };

    let final = filterByDisliked(insights);
    const topAny = (top ?? []).length > 0;

    if (final.length === 0) {
        const fb: RecItem[] = [];

        fb.push({
            impressionId: null,
            role: "seller",
            recType: "seller_next_steps",
            targetType: "insight",
            targetId: null,
            rank: 0,
            explain: "学習データが薄い or 👎で弾かれたので、まずは土台づくり",
            payload: {
                kind: "next_steps",
                checklist: [
                    "Dropを最低3〜5個出す（学習が効き始める）",
                    "brand / size / condition を必ず入れる（トレンド生成の材料）",
                    "cover画像を設定する（クリック率が上がる）",
                    "priceを入れて相場比較できるようにする",
                ],
            },
        });

        if (marketMedian != null) {
            fb.push({
                impressionId: null,
                role: "seller",
                recType: "seller_market_price_band",
                targetType: "insight",
                targetId: null,
                rank: 1,
                explain: "全体相場の中央値（簡易）",
                payload: {
                    kind: "market_price_band",
                    market_median: marketMedian,
                    note: "まずは相場の中心に寄せると回転が出やすい",
                },
            });
        }

        fb.push({
            impressionId: null,
            role: "seller",
            recType: "seller_quality_tip",
            targetType: "insight",
            targetId: null,
            rank: 2,
            explain: "売れやすさの基本（超MVP）",
            payload: {
                kind: "quality_tip",
                tips: [
                    "タイトルにブランド名 + アイテム種別（例: STUSSY Knit）",
                    "サイズ表記は統一（S/M/L or 数値）",
                    "状態は選択式で統一（good / well / damaged など）",
                ],
            },
        });

        if (!topAny) {
            fb.push({
                impressionId: null,
                role: "seller",
                recType: "seller_no_candidates",
                targetType: "insight",
                targetId: null,
                rank: 3,
                explain: "ランキング候補が空",
                payload: {
                    kind: "no_candidates",
                    hint: "v_drops_ranked_30d_v2 が空 or hot_score が計算されてない可能性。まずDropを作る/ビュー定義確認。",
                },
            });
        }

        final = fb;
    } else {
        if (marketMedian != null && final.length < limit) {
            final.push({
                impressionId: null,
                role: "seller",
                recType: "seller_market_price_band",
                targetType: "insight",
                targetId: null,
                rank: final.length,
                explain: "全体相場の中央値（簡易）",
                payload: { kind: "market_price_band", market_median: marketMedian },
            });
        }
    }

    return final.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
    // ---- ここまで ----
}

async function buildItems(userId: string, role: Role, limit: number, recVersion: number): Promise<RecItem[]> {
    if (role === "buyer") return await buildBuyerItems(userId, limit, recVersion);
    return await buildSellerInsights(userId, limit, recVersion);
}

export async function GET(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const roleParam = String(url.searchParams.get("role") ?? "auto");
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? "10") || 10));
    const recVersion = getRecVersion(req);

    const role: Role =
        roleParam === "buyer" || roleParam === "seller" ? (roleParam as Role) : await detectRoleAuto(user.id);

    const items = await buildItems(user.id, role, limit, recVersion);

    const rows = items.map((it) => ({
        user_id: user.id,
        role,
        rec_version: recVersion,
        rec_type: it.recType,
        target_type: it.targetType,
        target_id: it.targetId,
        rank: it.rank,
        explain: it.explain ?? null,
        payload: it.payload ?? null,
    }));

    let inserted: any[] = [];
    if (rows.length) {
        const { data, error } = await supabaseAdmin
            .from("recommendation_impressions")
            .insert(rows as any)
            .select("id, rank");

        // impressionは無くてもUIは返す（落とさない）
        if (!error) inserted = data ?? [];
    }

    const idByRank = new Map<number, string>();
    for (const x of inserted ?? []) idByRank.set(Number((x as any).rank), String((x as any).id));

    const out = items.map((it) => ({ ...it, impressionId: idByRank.get(it.rank) ?? null }));

    return NextResponse.json({ ok: true, role, recVersion, items: out });
}
