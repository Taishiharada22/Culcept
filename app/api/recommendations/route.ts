// app/api/recommendations/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight";

// ✅ ③ A/B/C（アルゴ切替）
type Algorithm = "collaborative" | "vector" | "hybrid";

type RecItem = {
    impressionId: string | null;
    role: Role;
    recType: string;
    targetType: TargetType;
    // ✅ ここは「識別子文字列」を返す（drop uuid / shop slug / card_id）
    targetId: string | null;
    rank: number;
    explain?: string | null;
    payload: any;
};

type SwipeCard = {
    card_id: string;
    image_url: string;
    title?: string | null;
    tags: string[];
    price_band?: "low" | "mid" | "high" | "unknown";
    source?: string;
    source_page_url?: string | null;
    photographer_name?: string | null;
    photographer_url?: string | null;
};

function isoDaysAgo(days: number) {
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return d.toISOString();
}

let localCardFilesCache: Set<string> | null = null;
let cardUrlMapCache: Map<string, string> | null = null;

function getLocalCardFiles(): Set<string> {
    if (localCardFilesCache) return localCardFilesCache;
    try {
        const dir = path.join(process.cwd(), "public", "cards");
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        localCardFilesCache = new Set(
            entries.filter((e) => e.isFile()).map((e) => `/cards/${e.name}`)
        );
    } catch {
        localCardFilesCache = new Set();
    }
    return localCardFilesCache;
}

function getCardUrlMap(): Map<string, string> {
    if (cardUrlMapCache) return cardUrlMapCache;
    const map = new Map<string, string>();
    try {
        const mapPath = path.join(process.cwd(), "public", "db_urls.map.json");
        const raw = fs.readFileSync(mapPath, "utf8");
        const rows = JSON.parse(raw);
        if (Array.isArray(rows)) {
            for (const r of rows) {
                const from = String(r?.from ?? "").trim();
                const to = String(r?.to ?? "").trim();
                if (from && to) map.set(from, to);
            }
        }
    } catch {
        // ignore
    }
    cardUrlMapCache = map;
    return map;
}

function seenResetKey(args: {
    userId: string;
    role: Role;
    targetType: TargetType;
    recVersion: number;
    recType?: string;
}) {
    const { userId, role, targetType, recVersion, recType } = args;
    return `reco:seen_reset:${userId}:${role}:${targetType}:${recVersion}:${recType ?? "all"}`;
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

/**
 * =========================
 * ① Cache helpers
 * - Upstash Redis REST (envあり) → Supabase table fallback
 * - 依存パッケージ不要（fetchだけ）
 * =========================
 */
type CacheGetResult = { hit: true; value: any } | { hit: false };

function getUpstashEnv() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_ENDPOINT || "";
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || "";
    if (!url || !token) return null;
    return { url: url.replace(/\/$/, ""), token };
}

async function upstashGetJson(key: string): Promise<CacheGetResult> {
    const env = getUpstashEnv();
    if (!env) return { hit: false };
    try {
        const r = await fetch(`${env.url}/get/${encodeURIComponent(key)}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.token}` },
            cache: "no-store",
        });
        const j: any = await r.json().catch(() => null);
        const raw = j?.result;
        if (!raw) return { hit: false };
        const parsed = JSON.parse(String(raw));
        return { hit: true, value: parsed };
    } catch {
        return { hit: false };
    }
}

async function upstashSetExJson(key: string, ttlSeconds: number, value: any): Promise<boolean> {
    const env = getUpstashEnv();
    if (!env) return false;
    try {
        const payload = JSON.stringify(value);
        const r = await fetch(
            `${env.url}/setex/${encodeURIComponent(key)}/${encodeURIComponent(String(ttlSeconds))}/${encodeURIComponent(payload)}`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${env.token}` },
                cache: "no-store",
            }
        );
        const j: any = await r.json().catch(() => null);
        return Boolean(j?.result);
    } catch {
        return false;
    }
}

/**
 * Supabase fallback:
 * table: recommendation_cache
 * columns (想定):
 * - cache_key text primary key
 * - payload jsonb
 * - expires_at timestamptz
 * - updated_at timestamptz (optional)
 *
 * ※テーブルが無くてもエラーは握りつぶして「キャッシュ無し」で動作します
 */
async function supabaseCacheGetJson(key: string): Promise<CacheGetResult> {
    try {
        const { data, error } = await supabaseAdmin
            .from("recommendation_cache")
            .select("payload, expires_at")
            .eq("cache_key", key)
            .maybeSingle();

        if (error || !data?.payload) return { hit: false };
        const exp = data.expires_at ? new Date(String(data.expires_at)).getTime() : 0;
        if (exp && exp < Date.now()) return { hit: false };
        return { hit: true, value: data.payload };
    } catch {
        return { hit: false };
    }
}

async function supabaseCacheSetExJson(key: string, ttlSeconds: number, value: any): Promise<boolean> {
    try {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
        const { error } = await supabaseAdmin
            .from("recommendation_cache")
            .upsert(
                {
                    cache_key: key,
                    payload: value,
                    expires_at: expiresAt,
                } as any,
                { onConflict: "cache_key" }
            );
        return !error;
    } catch {
        return false;
    }
}

async function cacheGetJson(key: string): Promise<CacheGetResult> {
    // Upstash優先
    const a = await upstashGetJson(key);
    if (a.hit) return a;
    // Supabase fallback
    return await supabaseCacheGetJson(key);
}

async function cacheSetExJson(key: string, ttlSeconds: number, value: any): Promise<boolean> {
    // Upstash優先（成功したら終了）
    const ok = await upstashSetExJson(key, ttlSeconds, value);
    if (ok) return true;
    // Supabase fallback
    return await supabaseCacheSetExJson(key, ttlSeconds, value);
}

/**
 * ③ AB分岐: 安定hash + algo決定
 */
function hashUserIdStable(userId: string): number {
    // FNV-1a 32-bit
    let h = 2166136261;
    for (let i = 0; i < userId.length; i++) {
        h ^= userId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pickAlgorithmForUser(userId: string): { group: 0 | 1 | 2; algorithm: Algorithm } {
    const g = (hashUserIdStable(userId) % 3) as 0 | 1 | 2;
    if (g === 0) return { group: 0, algorithm: "collaborative" };
    if (g === 1) return { group: 1, algorithm: "vector" };
    return { group: 2, algorithm: "hybrid" };
}

function stableNoise01(seed: string): number {
    // 0..1 の安定乱数（同seedで固定）
    const h = hashUserIdStable(seed);
    return (h % 10000) / 10000;
}

function stableNoiseSigned(seed: string): number {
    // -1..1
    return stableNoise01(seed) * 2 - 1;
}

function attachAB(payload: any, group: number, algorithm: Algorithm) {
    return {
        ...(payload ?? {}),
        _ab: { group, algorithm },
    };
}

/**
 * ✅ curated_cards の画像カラム名ゆれを吸収（image_url が無いケース対策）
 * - とにかく「画像っぽい」ものを拾って返す（未設定なら ""）
 */
function pickImageUrl(row: any): string {
    const direct =
        row?.image_url ??
        row?.image_path ??
        row?.image ??
        row?.image_src ??
        row?.public_url ??
        row?.file_url ??
        row?.url ??
        row?.path ??
        row?.storage_path ??
        row?.file_path ??
        "";

    if (direct) return String(direct);

    // JSON/配列系も一応吸う（images: [{url}] / image_urls: ["..."] など）
    if (Array.isArray(row?.image_urls) && row.image_urls.length) return String(row.image_urls[0] ?? "");
    if (Array.isArray(row?.images) && row.images.length) {
        const x = row.images[0];
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return String(x.url ?? x.src ?? x.path ?? "");
    }
    if (row?.images && typeof row.images === "object") {
        const x = row.images;
        return String(x.url ?? x.src ?? x.path ?? "");
    }
    return "";
}

/**
 * ✅ 画像URLを public パスとして正規化
 * - "cards/xxx.png" → "/cards/xxx.png"
 * - "/cards/xxx.png" → そのまま
 * - "http(s)://..." → そのまま
 */
function normalizePublicImageUrl(u: any): string {
    const s = String(u ?? "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return s;
    return `/${s}`;
}

function resolveCardImageUrl(raw: any): string {
    const norm = normalizePublicImageUrl(raw);
    if (!norm) return "";
    if (norm.startsWith("http://") || norm.startsWith("https://")) return norm;
    if (!norm.startsWith("/cards/")) return norm;

    const files = getLocalCardFiles();
    const clean = norm.split("?")[0];
    if (files.has(clean)) return clean;
    try {
        const abs = path.join(process.cwd(), "public", clean);
        if (fs.existsSync(abs)) return clean;
    } catch {
        // ignore
    }

    const map = getCardUrlMap();
    const mapped = map.get(clean) ?? map.get(clean.replace(/^\//, ""));
    if (mapped) {
        const mappedNorm = normalizePublicImageUrl(mapped);
        if (files.has(mappedNorm)) return mappedNorm;
        try {
            const absMapped = path.join(process.cwd(), "public", mappedNorm);
            if (fs.existsSync(absMapped)) return mappedNorm;
        } catch {
            // ignore
        }
    }

    return "";
}

/**
 * ✅ buyer は v=2 をデフォに寄せる（?v= が無ければ fallback を採用）
 */
function getRecVersion(req: Request, fallback: 1 | 2): 1 | 2 {
    const url = new URL(req.url);
    const raw = url.searchParams.get("v");
    if (raw == null || raw === "") return fallback;
    const v = clampInt(raw, 1, 2, fallback);
    return (v === 2 ? 2 : 1) as 1 | 2;
}

function getStream(req: Request): "cards" | "shops" {
    const url = new URL(req.url);
    const s = String(url.searchParams.get("stream") ?? "");
    return s === "shops" ? "shops" : "cards";
}

function isUuid(v: any): boolean {
    const s = String(v ?? "");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function detectRoleAuto(userId: string): Promise<Role> {
    // ✅ StartPage の owner_id 判定と揃える
    const { data: shop } = await supabaseAdmin.from("shops").select("id").eq("owner_id", userId).limit(1).maybeSingle();
    return shop?.id ? "seller" : "buyer";
}

/**
 * 直近表示済みの target_key セット（重複表示回避）
 * v=2 swipeカードは target_type=insight / rec_type=buyer_swipe_card / target_key=card_id
 */
async function loadRecentlySeenSet(
    userId: string,
    role: Role,
    targetType: TargetType,
    recVersion: number,
    recType?: string
) {
    const sinceFloorTs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    let since = isoDaysAgo(14);

    // ✅ reset marker があれば「そこから先」だけを seen にする
    try {
        const key = seenResetKey({ userId, role, targetType, recVersion, recType });
        const reset = await cacheGetJson(key);
        if (reset.hit) {
            const ts = Date.parse(String((reset as any).value?.reset_at ?? (reset as any).value?.ts ?? ""));
            if (Number.isFinite(ts) && ts > sinceFloorTs) {
                since = new Date(ts).toISOString();
            }
        }
    } catch {
        // ignore
    }

    let q = supabaseAdmin
        .from("recommendation_impressions")
        .select("target_key")
        .eq("user_id", userId)
        .eq("role", role)
        .eq("rec_version", recVersion)
        .eq("target_type", targetType)
        .gte("created_at", since)
        .limit(4000);

    if (recType) q = q.eq("rec_type", recType);

    const { data } = await q;

    return new Set(
        (data ?? [])
            .map((x: any) => String(x.target_key ?? ""))
            .map((s: string) => s.trim())
            .filter(Boolean)
    );
}

function countTop(arr: string[], n: number) {
    const m = new Map<string, number>();
    for (const x of arr) {
        const k = (x || "").trim();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([tag, c]) => ({ tag, c }));
}

async function loadUserSignals(userId: string, role: Role, recVersion: number) {
    // ✅ ①: signalsも軽くキャッシュ（5分）
    const sigKey = `reco:sig:${userId}:${role}:${recVersion}`;
    const sigCached = await cacheGetJson(sigKey);
    if (sigCached.hit && sigCached.value) return sigCached.value;

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
            .select("id, role, target_type, rec_type, target_id, target_key, payload, rec_version")
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

    // v=2 swipeカード向け
    const likedTags: string[] = [];
    const dislikedTags: string[] = [];

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

    const addFromSwipeCardPayload = (payload: any, w: number) => {
        const tags = Array.isArray(payload?.tags) ? payload.tags.map(String) : [];
        for (const t of tags) {
            for (let i = 0; i < Math.abs(w); i++) (w > 0 ? likedTags : dislikedTags).push(t);
        }
    };

    // ratings
    for (const r of rates ?? []) {
        const imp = impMap.get(String((r as any).impression_id));
        if (!imp) continue;

        const rating = Number((r as any).rating);
        if (rating === 0) continue;

        const targetType = String((imp as any).target_type || "");
        const payload = (imp as any).payload ?? {};
        const kind = payload?.kind ? String(payload.kind) : "";

        if (targetType === "drop") {
            addFromDropPayload(payload, rating);
            continue;
        }

        // swipeカードは insight に載せる
        if (targetType === "insight" && kind === "swipe_card") {
            addFromSwipeCardPayload(payload, rating);
            continue;
        }
    }

    // actions
    const weightByAction: Record<string, number> = { save: 2, click: 3, purchase: 6 };
    for (const a of acts ?? []) {
        const w = weightByAction[String((a as any).action)] ?? 0;
        if (!w) continue;

        const imp = impMap.get(String((a as any).impression_id));
        if (!imp) continue;

        const targetType = String((imp as any).target_type || "");
        const payload = (imp as any).payload ?? {};
        const kind = payload?.kind ? String(payload.kind) : "";

        if (targetType === "drop") {
            addFromDropPayload(payload, w);
            continue;
        }

        if (targetType === "insight" && kind === "swipe_card") {
            addFromSwipeCardPayload(payload, w);
            continue;
        }
    }

    const avgPrice = priceSeen.length
        ? Math.round(priceSeen.reduce((s, x) => s + x, 0) / priceSeen.length)
        : null;

    const result = {
        likedBrands: uniq(likedBrands).slice(0, 20),
        dislikedBrands: uniq(dislikedBrands).slice(0, 20),
        likedSizes: uniq(likedSizes).slice(0, 20),
        dislikedSizes: uniq(dislikedSizes).slice(0, 20),
        likedShops: uniq(likedShops).slice(0, 20),
        dislikedShops: uniq(dislikedShops).slice(0, 20),
        avgPrice,

        likedTagsTop: countTop(likedTags, 20),
        dislikedTagsTop: countTop(dislikedTags, 20),
    };

    // 5分キャッシュ（失敗しても無視）
    void cacheSetExJson(sigKey, 300, result);
    return result;
}

function priceBand(p: number | null): string {
    if (p == null) return "unknown";
    if (p < 5000) return "<5k";
    if (p < 10000) return "5-10k";
    if (p < 20000) return "10-20k";
    if (p < 30000) return "20-30k";
    return ">=30k";
}

/**
 * Generate personalized recommendation reason
 */
function generateRecommendationReason(
    drop: any,
    signals: any,
    matchType: "brand" | "size" | "shop" | "price" | "trending" | "explore"
): string {
    const reasons: string[] = [];
    const brand = drop.brand ? String(drop.brand) : "";
    const size = drop.size ? String(drop.size) : "";
    const shopSlug = drop.shop_slug ? String(drop.shop_slug) : "";
    const price = moneyNum(drop.display_price ?? drop.price);

    // Brand match
    if (brand && signals.likedBrands?.includes(brand)) {
        reasons.push(`お気に入りブランド「${brand}」`);
    }

    // Size match
    if (size && signals.likedSizes?.includes(size)) {
        reasons.push(`よく選ぶサイズ「${size}」`);
    }

    // Shop match
    if (shopSlug && signals.likedShops?.includes(shopSlug)) {
        reasons.push("お気に入りショップの商品");
    }

    // Price range match
    if (price != null && signals.avgPrice != null) {
        const lo = signals.avgPrice * 0.6;
        const hi = signals.avgPrice * 1.4;
        if (price >= lo && price <= hi) {
            reasons.push("ご予算帯にマッチ");
        }
    }

    // Fallback reasons based on match type
    if (reasons.length === 0) {
        switch (matchType) {
            case "trending":
                reasons.push("今注目のアイテム");
                break;
            case "explore":
                reasons.push("新しいスタイルを発見");
                break;
            case "brand":
                reasons.push(`人気ブランド「${brand}」`);
                break;
            case "price":
                reasons.push("コスパ◎");
                break;
            default:
                reasons.push("あなたにおすすめ");
        }
    }

    return reasons.slice(0, 2).join(" • ");
}

/**
 * Generate reason for swipe card recommendation
 */
function generateSwipeCardReason(
    card: any,
    likedTags: Map<string, number>,
    dislikedTags: Map<string, number>
): string {
    const tags: string[] = Array.isArray(card.tags) ? card.tags : [];
    const matchedLikedTags = tags.filter(t => likedTags.has(t));

    if (matchedLikedTags.length > 0) {
        const topTag = matchedLikedTags[0];
        return `「${topTag}」がお好みのあなたに`;
    }

    // Check if this is exploration (no matches)
    const hasDisliked = tags.some(t => dislikedTags.has(t));
    if (!hasDisliked && tags.length > 0) {
        return `新しいスタイル「${tags[0]}」を発見`;
    }

    return "あなたにおすすめ";
}

// なるべく同一brand/shopが固まらないように上位から間引く（MVPの分散）
function pickDiversified<T>(sorted: T[], n: number, keys: Array<(x: T) => string>): T[] {
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
            if ((picked as any).includes(x as any)) continue;
            picked.push(x);
        }
    }

    return picked.slice(0, n);
}

/* =========================
 * v=2 : Swipe Cards (insight)
 * ========================= */
async function buildBuyerSwipeCardsV2(
    userId: string,
    limit: number,
    recVersion: number,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
    // ✅ seen は毎回最新で効かせる（キャッシュで重複しないように）
    const seen = await loadRecentlySeenSet(userId, "buyer", "insight", recVersion, "buyer_swipe_card");
    const sig = await loadUserSignals(userId, "buyer", recVersion);

    const liked = new Map<string, number>((sig as any).likedTagsTop?.map((x: any) => [String(x.tag), Number(x.c)]) ?? []);
    const disliked = new Map<string, number>(
        (sig as any).dislikedTagsTop?.map((x: any) => [String(x.tag), Number(x.c)]) ?? []
    );

    // ✅ ①: “候補プール”をキャッシュ（1時間）
    const poolKey = `reco:pool:${userId}:${recVersion}:buyer:cards:${algorithm}`;
    const poolCached = await cacheGetJson(poolKey);

    let poolRows: any[] | null = null;

    if (poolCached.hit && Array.isArray(poolCached.value?.rows)) {
        poolRows = poolCached.value.rows;
    } else {
        // ✅ image_url が無いスキーマでも落ちないように select("*") にする
        const { data: cards, error: cardsError } = await supabaseAdmin
            .from("curated_cards")
            .select("*")
            .eq("is_active", true)
            .limit(400);

        if (cardsError) {
            const fb: RecItem[] = [
                {
                    impressionId: null,
                    role: "buyer",
                    recType: "buyer_swipe_cards_error",
                    targetType: "insight",
                    targetId: null,
                    rank: 0,
                    explain: "curated_cards 読み込みエラー",
                    payload: attachAB({ kind: "error", message: String((cardsError as any).message ?? cardsError) }, abGroup, algorithm),
                },
            ];
            return fb.slice(0, limit);
        }

        const rows = (cards ?? [])
            .map((c: any) => {
                const cardId = String(c.card_id ?? "").trim();
                if (!cardId) return null;

                // tags: text[] / string / csv を吸う
                let tags: string[] = [];
                if (Array.isArray(c.tags)) tags = c.tags.map(String);
                else if (typeof c.tags === "string") tags = c.tags.split(",").map((x: string) => x.trim()).filter(Boolean);

                // ✅ スキーマ差を吸収して image を決める
                const rawImg = pickImageUrl(c);
                const img = resolveCardImageUrl(rawImg);
                if (!img) return null; // 画像が無いカードはスキップ（UIが壊れるのを防ぐ）

                // === algoごとにスコアリングを変える（③） ===
                let boost = 0;

                if (algorithm === "collaborative") {
                    // 既存ロジック（嗜好強め）
                    for (const t of tags) boost += Math.min(6, liked.get(t) ?? 0) * 2;
                    for (const t of tags) boost -= Math.min(6, disliked.get(t) ?? 0) * 3;
                } else if (algorithm === "vector") {
                    // “ベクトル類似っぽい”扱い：嗜好は弱め + 安定ノイズで探索寄り
                    for (const t of tags) boost += Math.min(3, liked.get(t) ?? 0) * 1;
                    for (const t of tags) boost -= Math.min(3, disliked.get(t) ?? 0) * 1;
                    boost += stableNoiseSigned(`${userId}:${cardId}`) * 2.0;
                } else {
                    // hybrid：既存 + 少し探索
                    for (const t of tags) boost += Math.min(6, liked.get(t) ?? 0) * 2;
                    for (const t of tags) boost -= Math.min(6, disliked.get(t) ?? 0) * 3;
                    boost += stableNoiseSigned(`${userId}:${cardId}`) * 1.0;
                }

                // Generate personalized reason for this card
                const cardReason = generateSwipeCardReason({ tags }, liked, disliked);

                const payload = attachAB(
                    {
                        kind: "swipe_card",
                        card_id: cardId,
                        // ✅ BuyerSwipeClient が拾うキーを固定
                        image_url: img,
                        title: c.title ?? null,
                        tags,
                        price_band: (c.price_band ?? "unknown") as SwipeCard["price_band"],
                        source: c.source ?? "curated",
                        reason: cardReason, // ✅ 推薦理由を追加
                        credit: {
                            source_page_url: c.source_page_url ?? null,
                            photographer_name: c.photographer_name ?? null,
                            photographer_url: c.photographer_url ?? null,
                        },
                    },
                    abGroup,
                    algorithm
                );

                return {
                    cardId,
                    boost,
                    topTag: tags[0] ?? "",
                    payload,
                };
            })
            .filter(Boolean) as any[];

        rows.sort((a, b) => b.boost - a.boost);

        poolRows = rows;
        // ①: poolを1時間キャッシュ（失敗しても無視）
        void cacheSetExJson(poolKey, 3600, { rows, cached_at: new Date().toISOString() });
    }

    // ✅ poolはキャッシュされても、seenフィルタは毎回適用
    const available = (poolRows ?? []).filter((x: any) => x?.cardId && !seen.has(String(x.cardId)));

    if (!available.length) {
        const fb: RecItem[] = [
            {
                impressionId: null,
                role: "buyer",
                recType: "buyer_swipe_no_cards",
                targetType: "insight",
                targetId: null,
                rank: 0,
                explain: "カード候補が空です（curated_cards が空/無効/全部seen の可能性）",
                payload: attachAB(
                    {
                        kind: "no_cards",
                        hint: "curated_cards に card を追加し、is_active=true を確認してください。",
                        debug: {
                            active_cards: (poolRows ?? []).length,
                            seen_count_14d: seen.size,
                        },
                    },
                    abGroup,
                    algorithm
                ),
            },
        ];
        return fb.slice(0, limit);
    }

    // タグが固まらないよう分散
    const picked = pickDiversified(available, limit, [(x) => x.topTag]);

    // ✅ 「好みサマリー」insight（任意）
    const topTags = ((sig as any).likedTagsTop ?? []).slice(0, 3).map((x: any) => String(x.tag)).filter(Boolean);

    const out: RecItem[] = [];
    if (topTags.length) {
        out.push({
            impressionId: null,
            role: "buyer",
            recType: "buyer_swipe_summary",
            targetType: "insight",
            targetId: null,
            rank: 0,
            explain: "あなたの好み（上位タグ）",
            payload: attachAB({ kind: "swipe_summary", top_tags: topTags }, abGroup, algorithm),
        });
    }

    const baseRank = out.length;

    for (let i = 0; i < picked.length; i++) {
        const x = picked[i];
        out.push({
            impressionId: null,
            role: "buyer",
            recType: "buyer_swipe_card",
            targetType: "insight",
            targetId: x.cardId, // ✅ card_id を targetId として返す
            rank: baseRank + i,
            explain: null,
            payload: x.payload,
        });
    }

    // 返却 rank は詰め直す（rank+target_key で impressionId を安定付与するため）
    return out.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
}

/* =========================
 * v=2 : Shops from Swipe (shop_tags)
 * ========================= */
async function buildBuyerShopsFromSwipeV2(
    userId: string,
    limit: number,
    recVersion: number,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
    if (limit <= 0) return [];

    const sig = await loadUserSignals(userId, "buyer", recVersion);
    const topTags = ((sig as any).likedTagsTop ?? []).slice(0, 6).map((x: any) => String(x.tag)).filter(Boolean);

    if (!topTags.length) {
        const fb: RecItem[] = [
            {
                impressionId: null,
                role: "buyer",
                recType: "buyer_shop_need_swipes",
                targetType: "insight",
                targetId: null,
                rank: 0,
                explain: "まず10枚スワイプして好みを学習します",
                payload: attachAB({ kind: "need_more_swipes" }, abGroup, algorithm),
            },
        ];
        return fb.slice(0, limit);
    }

    // ✅ ①: shops rankingをキャッシュ（1時間）
    const cacheKey = `reco:buyer:shops:${userId}:${recVersion}:${algorithm}`;
    const cached = await cacheGetJson(cacheKey);
    if (cached.hit && Array.isArray(cached.value?.items)) {
        const out = (cached.value.items as RecItem[]).map((x: any, i: number) => ({
            ...x,
            rank: i,
            impressionId: null,
            payload: attachAB(x.payload, abGroup, algorithm),
        }));
        return out.slice(0, limit);
    }

    const { data: st } = await supabaseAdmin
        .from("shop_tags")
        .select("shop_id, tag, item_count")
        .in("tag", topTags as any)
        .limit(2000);

    const score = new Map<string, number>();
    const matched = new Map<string, string[]>();

    for (const r of st ?? []) {
        const shopId = String((r as any).shop_id ?? "");
        const tag = String((r as any).tag ?? "");
        const n = Number((r as any).item_count ?? 0);
        if (!shopId || !tag) continue;

        // algoで重みを変える
        const w =
            algorithm === "vector"
                ? 1
                : (((sig as any).likedTagsTop?.find((x: any) => String(x.tag) === tag)?.c ?? 1) as number);

        const add = Math.max(0, w) * Math.log1p(Math.max(0, n));

        score.set(shopId, (score.get(shopId) ?? 0) + add);
        matched.set(shopId, [...(matched.get(shopId) ?? []), `${tag}(${n})`].slice(0, 10));
    }

    const ranked = Array.from(score.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(limit * 3, 30));

    if (!ranked.length) {
        const fb: RecItem[] = [
            {
                impressionId: null,
                role: "buyer",
                recType: "buyer_shop_no_match",
                targetType: "insight",
                targetId: null,
                rank: 0,
                explain: "ショップタグ辞書（shop_tags）が不足しています",
                payload: attachAB(
                    {
                        kind: "no_shop_tags",
                        hint: "shop_tags に (shop_id, tag, item_count) を追加してください。",
                        top_tags: topTags,
                    },
                    abGroup,
                    algorithm
                ),
            },
        ];
        return fb.slice(0, limit);
    }

    const shopIds = ranked.map(([id]) => id);

    const { data: shops } = await supabaseAdmin
        .from("shops")
        .select("id, slug, name_ja, name_en, avatar_url, headline")
        .in("id", shopIds as any);

    const byId = new Map<string, any>((shops ?? []).map((s: any) => [String(s.id), s]));

    const out: RecItem[] = [];

    // サマリーinsight（任意）
    out.push({
        impressionId: null,
        role: "buyer",
        recType: "buyer_swipe_summary",
        targetType: "insight",
        targetId: null,
        rank: 0,
        explain: "あなたの好み（上位タグ）",
        payload: attachAB({ kind: "swipe_summary", top_tags: topTags }, abGroup, algorithm),
    });

    for (const [sid, sc] of ranked) {
        if (out.length >= limit + 1) break;

        const s = byId.get(String(sid));
        if (!s?.slug) continue;

        out.push({
            impressionId: null,
            role: "buyer",
            recType: "buyer_shop_from_swipe",
            targetType: "shop",
            targetId: String(s.slug), // ✅ shopはslug
            rank: out.length,
            explain: `一致: ${(matched.get(String(sid)) ?? []).slice(0, 3).join(" / ")}`,
            payload: attachAB(
                {
                    shop_id: String(s.id),
                    shop_slug: String(s.slug),
                    shop_name_ja: s.name_ja ?? null,
                    shop_name_en: s.name_en ?? null,
                    shop_avatar_url: s.avatar_url ?? null,
                    shop_headline: s.headline ?? null,
                    matched_tags: matched.get(String(sid)) ?? [],
                    score: sc,
                },
                abGroup,
                algorithm
            ),
        });
    }

    const final = out.slice(0, limit + 1).map((x, i) => ({ ...x, rank: i }));

    // ①: shops結果を1時間キャッシュ（impressionIdはキャッシュしない）
    void cacheSetExJson(cacheKey, 3600, { items: final.map((x) => ({ ...x, impressionId: null })), cached_at: new Date().toISOString() });

    return final;
}

/* =========================
 * v=1 buyer (既存 drop/shop interleave)
 * ========================= */
async function buildBuyerDrops(
    userId: string,
    limit: number,
    recVersion: number,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
    const seen = await loadRecentlySeenSet(userId, "buyer", "drop", recVersion);
    const sig = await loadUserSignals(userId, "buyer", recVersion);

    // ✅ ①: v1 drops候補プールキャッシュ（15分）
    const poolKey = `reco:pool:${userId}:${recVersion}:buyer:drops:${algorithm}`;
    const poolCached = await cacheGetJson(poolKey);

    let pool: any[] | null = null;

    if (poolCached.hit && Array.isArray(poolCached.value?.rows)) {
        pool = poolCached.value.rows;
    } else {
        const { data: candidates } = await supabaseAdmin
            .from("v_drops_ranked_30d_v2")
            .select(
                "id, title, brand, size, condition, price, display_price, cover_image_url, purchase_url, url, hot_score, top_score, shop_slug, shop_name_ja, shop_name_en, shop_avatar_url, shop_headline"
            )
            .order("hot_score", { ascending: false })
            .limit(400);

        // ✅ buyerでも「候補ゼロ」時に必ずinsightを返す
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
                    payload: attachAB(
                        {
                            kind: "no_candidates",
                            hint: "v_drops_ranked_30d_v2 が空 or hot_score が計算されていない可能性。Drop作成/ビュー定義を確認。",
                        },
                        abGroup,
                        algorithm
                    ),
                },
            ];
            return fb.slice(0, limit);
        }

        const rows = (candidates ?? [])
            .map((d: any) => {
                const id = String(d.id);
                if (!id) return null;

                const base = Number(d.hot_score ?? d.top_score ?? 0) || 0;
                const brand = d.brand ? String(d.brand) : "";
                const size = d.size ? String(d.size) : "";
                const shop = d.shop_slug ? String(d.shop_slug) : "";

                let boost = 0;

                if (algorithm === "vector") {
                    // トレンド寄り + 安定ノイズ（探索）
                    boost += stableNoiseSigned(`${userId}:${id}`) * 1.5;
                } else {
                    // collaborative/hybrid はパーソナル寄り
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

                    if (algorithm === "hybrid") {
                        boost += stableNoiseSigned(`${userId}:${id}`) * 0.8;
                    }
                }

                const p = moneyNum(d.display_price ?? d.price);
                const score = base + boost;

                // ✅ Enhanced explanation with personalized reason
                let matchType: "brand" | "size" | "shop" | "price" | "trending" | "explore" = "trending";
                if (brand && sig.likedBrands.includes(brand)) matchType = "brand";
                else if (size && sig.likedSizes.includes(size)) matchType = "size";
                else if (shop && sig.likedShops.includes(shop)) matchType = "shop";
                else if (boost < 0) matchType = "explore";

                const explain = generateRecommendationReason(d, sig, matchType);

                const payload = attachAB(
                    {
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
                    },
                    abGroup,
                    algorithm
                );

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

        rows.sort((a, b) => b.score - a.score);

        pool = rows;

        void cacheSetExJson(poolKey, 900, { rows, cached_at: new Date().toISOString() });
    }

    // ✅ poolキャッシュでも、seenは毎回適用
    const rows = (pool ?? []).filter((x: any) => x?.id && !seen.has(String(x.id)));

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
                payload: attachAB({ kind: "cooldown", note: "14日以内に表示済みの候補が多い可能性があります。" }, abGroup, algorithm),
            },
        ];
        return fb.slice(0, limit);
    }

    // exploit/explore
    const exploreN = Math.max(1, Math.round(limit * 0.2));
    const exploitN = Math.max(0, limit - exploreN);

    const exploit = pickDiversified(rows, exploitN, [(x) => x.brand, (x) => x.shop]);
    const usedIds = new Set(exploit.map((x: any) => x.id));
    const rest = rows.filter((x: any) => !usedIds.has(x.id));

    // explore：brand/price帯が被りにくいように
    const explorePicked: any[] = [];
    const usedBrand = new Set(exploit.map((x: any) => x.brand).filter(Boolean));
    const usedBand = new Set(exploit.map((x: any) => x.band).filter(Boolean));

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
    for (const x of rest) {
        if (explorePicked.length >= exploreN) break;
        if ((explorePicked as any).includes(x)) continue;
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

async function buildBuyerShops(
    userId: string,
    limit: number,
    recVersion: number,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
    if (limit <= 0) return [];

    const seen = await loadRecentlySeenSet(userId, "buyer", "shop", recVersion);
    const sig = await loadUserSignals(userId, "buyer", recVersion);

    // ✅ ①: v1 shops候補プールキャッシュ（30分）
    const poolKey = `reco:pool:${userId}:${recVersion}:buyer:v1shops:${algorithm}`;
    const poolCached = await cacheGetJson(poolKey);

    let pool: any[] | null = null;

    if (poolCached.hit && Array.isArray(poolCached.value?.rows)) {
        pool = poolCached.value.rows;
    } else {
        const { data: shops } = await supabaseAdmin
            .from("v_shops_ranked_30d_v1")
            .select(
                "shop_slug, shop_name_ja, shop_name_en, shop_avatar_url, shop_headline, drops_count, hot_score_avg, hot_score_sum, buy_rate_30d, outbound_30d, buy_clicks_30d"
            )
            .order("hot_score_sum", { ascending: false })
            .limit(200);

        const rows = (shops ?? [])
            .map((s: any) => {
                const slug = String(s.shop_slug ?? "");
                if (!slug) return null;

                const base = Number(s.hot_score_avg ?? 0) || 0;
                const drops = Number(s.drops_count ?? 0) || 0;

                let boost = 0;

                if (algorithm === "vector") {
                    // トレンド寄り + 安定ノイズ
                    boost += stableNoiseSigned(`${userId}:${slug}`) * 1.0;
                } else {
                    if (sig.likedShops.includes(slug)) boost += 6;
                    if (sig.dislikedShops.includes(slug)) boost -= 8;

                    const buyRate = s.buy_rate_30d != null ? Number(s.buy_rate_30d) : null;
                    if (buyRate != null) boost += Math.min(3, Math.max(-3, (buyRate - 0.15) * 10));

                    if (algorithm === "hybrid") {
                        boost += stableNoiseSigned(`${userId}:${slug}`) * 0.6;
                    }
                }

                const score = base + boost + Math.log10(1 + drops);
                const explain =
                    boost >= 5 ? "最近の好みに近い（Shop）" : drops >= 10 ? "人気Dropが多いShop" : "新しい出会い（Shop）";

                const payload = attachAB(
                    {
                        shop_slug: slug,
                        shop_name_ja: s.shop_name_ja ?? null,
                        shop_name_en: s.shop_name_en ?? null,
                        shop_avatar_url: s.shop_avatar_url ?? null,
                        shop_headline: s.shop_headline ?? null,
                        drops_count: s.drops_count ?? null,
                        hot_score_avg: s.hot_score_avg ?? null,
                        buy_rate_30d: s.buy_rate_30d ?? null,
                    },
                    abGroup,
                    algorithm
                );

                return { slug, score, explain, payload };
            })
            .filter(Boolean) as any[];

        rows.sort((a, b) => b.score - a.score);
        pool = rows;

        void cacheSetExJson(poolKey, 1800, { rows, cached_at: new Date().toISOString() });
    }

    // ✅ poolキャッシュでも、seenは毎回適用
    const rows = (pool ?? []).filter((x: any) => x?.slug && !seen.has(String(x.slug)));

    rows.sort((a: any, b: any) => b.score - a.score);
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

async function buildBuyerItems(
    userId: string,
    limit: number,
    recVersion: number,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
    const nShop = limit >= 6 ? Math.min(5, Math.max(1, Math.round(limit * 0.25))) : limit >= 4 ? 1 : 0;
    const nDrop = Math.max(1, limit - nShop);

    const drops = await buildBuyerDrops(userId, nDrop, recVersion, algorithm, abGroup);

    // insightが先頭で返ってきたらそのまま返す（候補ゼロなど）
    if (drops.length && drops[0].targetType === "insight") {
        return drops.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
    }

    const shops = await buildBuyerShops(userId, nShop, recVersion, algorithm, abGroup);

    const out: RecItem[] = [];
    let di = 0;
    let si = 0;
    while (out.length < limit && (di < drops.length || si < shops.length)) {
        for (let k = 0; k < 4 && out.length < limit && di < drops.length; k++) out.push(drops[di++]);
        if (out.length < limit && si < shops.length) out.push(shops[si++]);
    }

    return out.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
}

/* =========================
 * seller（そのまま + AB情報だけ付与）
 * ========================= */
async function buildSellerInsights(
    userId: string,
    limit: number,
    recVersion: number,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
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

    const allPrices = (top ?? []).map((x: any) => moneyNum(x.display_price)).filter((x: any) => x != null) as number[];
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
            payload: attachAB({ kind: "trend_brand", brand, frequency: n }, abGroup, algorithm),
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
            payload: attachAB({ kind: "trend_size", size, frequency: n }, abGroup, algorithm),
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
                payload: attachAB({ kind: "waiting_buyers", combo: key, save_count_30d: n }, abGroup, algorithm),
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
            payload: attachAB(
                {
                    kind: "price_hint",
                    drop_id: String(d.id),
                    title: d.title,
                    brand: d.brand,
                    size: d.size,
                    condition: d.condition,
                    your_price: myPrice,
                    market_median: mid,
                    diff_pct: diffPct,
                    suggestion: diffPct > 0 ? "価格が高め。回転重視なら調整すると売れやすい可能性" : "価格が低め。強気にしても売れる可能性",
                },
                abGroup,
                algorithm
            ),
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
            payload: attachAB(
                {
                    kind: "next_steps",
                    checklist: [
                        "Dropを最低3〜5個出す（学習が効き始める）",
                        "brand / size / condition を必ず入れる（トレンド生成の材料）",
                        "cover画像を設定する（クリック率が上がる）",
                        "priceを入れて相場比較できるようにする",
                    ],
                },
                abGroup,
                algorithm
            ),
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
                payload: attachAB(
                    {
                        kind: "market_price_band",
                        market_median: marketMedian,
                        note: "まずは相場の中心に寄せると回転が出やすい",
                    },
                    abGroup,
                    algorithm
                ),
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
            payload: attachAB(
                {
                    kind: "quality_tip",
                    tips: [
                        "タイトルにブランド名 + アイテム種別（例: STUSSY Knit）",
                        "サイズ表記は統一（S/M/L or 数値）",
                        "状態は選択式で統一（good / well / damaged など）",
                    ],
                },
                abGroup,
                algorithm
            ),
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
                payload: attachAB(
                    {
                        kind: "no_candidates",
                        hint: "v_drops_ranked_30d_v2 が空 or hot_score が計算されてない可能性。まずDropを作る/ビュー定義確認。",
                    },
                    abGroup,
                    algorithm
                ),
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
                payload: attachAB({ kind: "market_price_band", market_median: marketMedian }, abGroup, algorithm),
            });
        }
    }

    return final.slice(0, limit).map((x, i) => ({ ...x, rank: i }));
}

/* =========================
 * buildItems (v=2分岐)
 * ========================= */
async function buildItems(
    userId: string,
    role: Role,
    limit: number,
    recVersion: number,
    req: Request,
    algorithm: Algorithm,
    abGroup: number
): Promise<RecItem[]> {
    if (role === "buyer" && recVersion === 2) {
        const stream = getStream(req);
        if (stream === "shops") return await buildBuyerShopsFromSwipeV2(userId, limit, recVersion, algorithm, abGroup);
        return await buildBuyerSwipeCardsV2(userId, limit, recVersion, algorithm, abGroup);
    }

    if (role === "buyer") return await buildBuyerItems(userId, limit, recVersion, algorithm, abGroup);
    return await buildSellerInsights(userId, limit, recVersion, algorithm, abGroup);
}

/**
 * ✅ impressions insert に失敗してもUIは返す（落とさない）
 * ✅ impressionId は「rank + target_key」で安定マッピング（ズレ耐性）
 */
async function insertImpressionsBestEffort(userId: string, role: Role, recVersion: number, items: RecItem[]) {
    // ✅ ここが重要：target_id は drop(uuid) のみ。その他は target_key に入れる
    const rows = items.map((it) => ({
        user_id: userId,
        role,
        rec_version: recVersion,
        rec_type: it.recType,
        target_type: it.targetType,
        target_id: it.targetType === "drop" && isUuid(it.targetId) ? it.targetId : null,
        target_key: it.targetId ? String(it.targetId) : null,
        rank: it.rank,
        explain: it.explain ?? null,
        payload: it.payload ?? null,
    }));

    if (!rows.length) return { out: items, inserted: [] as any[] };

    const { data, error } = await supabaseAdmin
        .from("recommendation_impressions")
        .insert(rows as any)
        .select("id, rank, target_key");

    if (error || !data) {
        return { out: items.map((x) => ({ ...x, impressionId: null })), inserted: [] as any[] };
    }

    const idByKey = new Map<string, string>();
    for (const x of data ?? []) {
        const k = `${Number((x as any).rank)}:${String((x as any).target_key ?? "")}`;
        idByKey.set(k, String((x as any).id));
    }

    const out = items.map((it) => {
        const k = `${it.rank}:${String(it.targetId ?? "")}`;
        return { ...it, impressionId: idByKey.get(k) ?? null };
    });

    return { out, inserted: data ?? [] };
}

export async function GET(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const roleParam = String(url.searchParams.get("role") ?? "auto");
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? "10") || 10));

    const role: Role = roleParam === "buyer" || roleParam === "seller" ? (roleParam as Role) : await detectRoleAuto(user.id);

    // ✅ buyer は v=2 をデフォにする（?v= があればそっち優先）
    const recVersion = getRecVersion(req, role === "buyer" ? 2 : 1);

    // ✅ ③: AB分岐（buyerのみ有効でOK。sellerでも付与はする）
    const { group: abGroup, algorithm } = pickAlgorithmForUser(user.id);

    // ✅ ①: “最終レスポンス”はseenの影響があるので強キャッシュしない
    // 代わりに build 内で「候補プール」をキャッシュしてる（重複回避できる）
    const items = await buildItems(user.id, role, limit, recVersion, req, algorithm, abGroup);

    // best-effort insert
    const { out } = await insertImpressionsBestEffort(user.id, role, recVersion, items);

    return NextResponse.json({ ok: true, role, recVersion, algorithm, abGroup, items: out });
}

/**
 * =========
 * Cron/Batch用（②で利用）
 * =========
 * - auth不要で “キャッシュ生成だけ” したい時に呼べる内部関数
 */
// 内部関数: route.tsからはエクスポートしない（Next.js制約）
async function precomputeForUser(params: {
    userId: string;
    limit?: number;
    role?: Role;
    recVersion?: 1 | 2;
    stream?: "cards" | "shops";
}) {
    const userId = params.userId;
    const role: Role = params.role ?? "buyer";
    const recVersion = params.recVersion ?? (role === "buyer" ? 2 : 1);
    const limit = Math.min(30, Math.max(1, params.limit ?? 12));

    const { group: abGroup, algorithm } = pickAlgorithmForUser(userId);

    // streamを疑似reqに埋める
    const stream = params.stream ?? "cards";
    const fakeReq = new Request(`https://local/api/recommendations?stream=${stream}`, { method: "GET" });

    // build内が候補プールをキャッシュする
    const items = await buildItems(userId, role, limit, recVersion, fakeReq, algorithm, abGroup);

    return {
        ok: true,
        userId,
        role,
        recVersion,
        stream,
        algorithm,
        abGroup,
        itemsCount: items.length,
    };
}
