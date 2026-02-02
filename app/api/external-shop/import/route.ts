// app/api/external-shop/import/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { gunzipSync } from "zlib";

// ✅ aliasじゃなく相対で確実に通す
import { fetchProductFacts } from "./extractProductFacts";

export const runtime = "nodejs";

type ImportedItem = {
    // 取得元（sitemapで見つけたURL）
    source_url: string;
    // 正規化後（finalUrl/canonical等）
    product_url: string;

    title: string | null;
    description: string | null;
    price: number | null;
    currency: string | null;
    availability: string | null;
    image_urls: string[];
    brand: string | null;
    sku: string | null;
};

function normShopUrl(shopUrlRaw: string): string | null {
    try {
        const url = new URL(shopUrlRaw.startsWith("http") ? shopUrlRaw : `https://${shopUrlRaw}`);
        url.hash = "";
        // クエリは残す（必要なサイトもある）けど末尾/は消す
        return url.toString().replace(/\/+$/, "");
    } catch {
        return null;
    }
}

function uniq(arr: string[]) {
    return Array.from(new Set(arr));
}

function cleanStr(v: any): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s.length ? s : null;
}

function cleanImages(v: any): string[] {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    const cleaned = arr
        .filter((x) => typeof x === "string")
        .map((x: string) => x.trim())
        .filter(Boolean);
    return uniq(cleaned);
}

function toNumberOrNull(v: any): number | null {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function normUrlMaybe(u: string): string | null {
    try {
        const url = new URL(u);
        url.hash = "";
        // 末尾/を正規化（/products/xxx/ の違い吸収）
        return url.toString().replace(/\/+$/, "");
    } catch {
        return null;
    }
}

// --- sitemap 取得（最低限：/sitemap.xml + robotsから拾う）
async function fetchText(url: string, ms = 12000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);

    try {
        const res = await fetch(url, {
            signal: ac.signal,
            headers: {
                "user-agent": "CulceptBot/1.0 (+contact: you@example.com)",
                accept: "text/html,application/xml;q=0.9,*/*;q=0.8",
            },
            redirect: "follow",
            cache: "no-store",
        });
        if (!res.ok) throw new Error(`fetch ${res.status}: ${url}`);

        // gz対応: urlが .gz か、Content-Encoding: gzip の場合に展開
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const ce = (res.headers.get("content-encoding") || "").toLowerCase();

        const isGz = url.toLowerCase().endsWith(".gz") || ce.includes("gzip") || ct.includes("gzip");
        if (isGz) {
            const ungz = gunzipSync(buf);
            return ungz.toString("utf-8");
        }

        return buf.toString("utf-8");
    } finally {
        clearTimeout(t);
    }
}

async function discoverSitemapUrls(base: string): Promise<string[]> {
    const out: string[] = [];

    // robots.txt から拾う（相対URLも絶対URL化）
    try {
        const robots = await fetchText(`${base}/robots.txt`, 8000);
        for (const line of robots.split("\n")) {
            const m = line.match(/^sitemap:\s*(.+)\s*$/i);
            if (!m?.[1]) continue;

            const raw = m[1].trim();
            try {
                const abs = new URL(raw, base).toString();
                out.push(abs);
            } catch {
                // ignore
            }
        }
    } catch {
        // ignore
    }

    // 無ければ /sitemap.xml を既定
    if (out.length === 0) out.push(`${base}/sitemap.xml`);

    return Array.from(new Set(out));
}

function extractLocs(xml: string): string[] {
    const locs: string[] = [];
    const re = /<loc>([\s\S]*?)<\/loc>/gi;
    let m: RegExpExecArray | null;

    while ((m = re.exec(xml))) {
        const v = m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
        if (!v) continue;

        // ここで軽くデコードしても良いが、URLとして成立するものだけ拾う
        if (v.startsWith("http://") || v.startsWith("https://")) locs.push(v);
    }
    return locs;
}

async function collectUrls(sitemaps: string[], maxFollow = 10) {
    const urls: string[] = [];
    const queue = [...sitemaps];
    const seen = new Set<string>();
    let followed = 0;

    while (queue.length > 0 && followed < maxFollow) {
        const sm = queue.shift()!;
        if (seen.has(sm)) continue;
        seen.add(sm);
        followed += 1;

        try {
            const xml = await fetchText(sm, 12000);
            const locs = extractLocs(xml);

            // sitemapindex なら子sitemapへ
            if (xml.toLowerCase().includes("<sitemapindex")) {
                queue.push(...locs);
            } else {
                urls.push(...locs);
            }
        } catch {
            // ignore
        }
    }

    return Array.from(new Set(urls));
}

function looksLikeProductUrl(u: string) {
    const s = u.toLowerCase();

    // 除外
    const deny = [
        "/cart",
        "/checkout",
        "/account",
        "/login",
        "/register",
        "/pages/",
        "/page/",
        "/blog",
        "/news",
        "/policy",
        "/terms",
        "/privacy",
        "/search",
        "/collections/", // Shopifyのカテゴリ
        "/category/",
    ];
    if (deny.some((d) => s.includes(d))) return false;

    // 許可
    const allow = ["/products/", "/product/", "/item/", "/items/", "/p/"];
    return allow.some((a) => s.includes(a));
}

// --- 並列で商品取得
async function mapLimit<T, R>(arr: T[], lim: number, fn: (x: T, i: number) => Promise<R | null>): Promise<R[]> {
    const out: (R | null)[] = new Array(arr.length).fill(null);
    let i = 0;

    const workers = new Array(Math.min(lim, arr.length)).fill(0).map(async () => {
        while (true) {
            const idx = i++;
            if (idx >= arr.length) break;
            try {
                out[idx] = await fn(arr[idx], idx);
            } catch {
                out[idx] = null;
            }
        }
    });

    await Promise.all(workers);
    return out.filter((x): x is R => x !== null);
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => null);

    const shopUrlRaw = body?.shopUrl;
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 200);
    const concurrency = Math.min(Math.max(Number(body?.concurrency ?? 4), 1), 8);

    const shopUrl = typeof shopUrlRaw === "string" ? normShopUrl(shopUrlRaw) : null;
    if (!shopUrl) {
        return NextResponse.json({ ok: false, error: "invalid shopUrl" }, { status: 400 });
    }

    // auth
    const sb = await supabaseServer();
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // --- sitemap
    const sitemaps = await discoverSitemapUrls(shopUrl);
    const urls = await collectUrls(sitemaps, 10);

    // URL正規化＋商品っぽいURL抽出
    const productUrls = urls
        .map((u) => normUrlMaybe(u))
        .filter((u): u is string => !!u)
        .filter(looksLikeProductUrl)
        .slice(0, limit);

    // 早期return（候補ゼロ）
    if (productUrls.length === 0) {
        return NextResponse.json({
            ok: true,
            shopUrl,
            sitemaps,
            found_urls: urls.length,
            candidates: 0,
            imported: 0,
            saved: 0,
            items: [],
            note: "product url candidates are 0 (sitemap exists but no product-like paths matched)",
        });
    }

    // --- 並列で商品取得
    const items: ImportedItem[] = await mapLimit(productUrls, concurrency, async (u) => {
        const facts = await fetchProductFacts(u);

        const finalUrl = cleanStr((facts as any)?.finalUrl) ?? u;

        const title = cleanStr((facts as any)?.jsonld?.name) ?? cleanStr((facts as any)?.og?.title) ?? null;
        const description =
            cleanStr((facts as any)?.jsonld?.description) ?? cleanStr((facts as any)?.og?.description) ?? null;

        const price = toNumberOrNull((facts as any)?.jsonld?.price);
        const currency = cleanStr((facts as any)?.jsonld?.currency);
        const availability = cleanStr((facts as any)?.jsonld?.availability);

        const image_urls = cleanImages(
            (facts as any)?.jsonld?.imageUrls ??
            ((facts as any)?.og?.image ? [(facts as any)?.og?.image] : [])
        );

        const brand = cleanStr((facts as any)?.jsonld?.brand);
        const sku = cleanStr((facts as any)?.jsonld?.sku);

        return {
            source_url: u, // ✅ “取得元” を保持
            product_url: finalUrl, // ✅ 正規化URL（canonical/リダイレクト後）
            title,
            description,
            price,
            currency,
            availability,
            image_urls,
            brand,
            sku,
        };
    });

    // --- external_shops 保存
    const { data: shopRow, error: shopErr } = await sb
        .from("external_shops")
        .upsert({ owner_user_id: user.id, shop_url: shopUrl }, { onConflict: "owner_user_id,shop_url" })
        .select("id")
        .single();

    if (shopErr || !shopRow?.id) {
        return NextResponse.json(
            { ok: false, error: "shop_upsert_failed", detail: shopErr?.message ?? null },
            { status: 500 }
        );
    }

    const shopId = shopRow.id as string;

    // --- external_products 保存
    const rows = items.map((p) => ({
        shop_id: shopId,
        source_url: p.source_url, // ✅ 取得元
        product_url: p.product_url, // ✅ 正規化URL
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency,
        availability: p.availability,
        image_urls: p.image_urls ?? [],
        brand: p.brand ?? null,
        sku: p.sku ?? null,
        fetched_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
        const { error: prodErr } = await sb.from("external_products").upsert(rows, { onConflict: "shop_id,product_url" });

        if (prodErr) {
            return NextResponse.json(
                { ok: false, error: "products_upsert_failed", detail: prodErr.message },
                { status: 500 }
            );
        }
    }

    await sb.from("external_shops").update({ last_imported_at: new Date().toISOString() }).eq("id", shopId);

    return NextResponse.json({
        ok: true,
        shopId,
        shopUrl,
        sitemaps,
        found_urls: urls.length,
        candidates: productUrls.length,
        imported: items.length,
        saved: rows.length,
        items,
    });
}
