// app/api/external-shop/import/extractProductFacts.ts
import "server-only";
import { load, type CheerioAPI } from "cheerio";

export type ProductFacts = {
    sourceUrl: string;
    finalUrl: string;
    og: {
        title: string | null;
        description: string | null;
        image: string | null;
    };
    jsonld: {
        name: string | null;
        description: string | null;
        price: number | null;
        currency: string | null;
        availability: string | null;
        imageUrls: string[] | null;
        brand: string | null;
        sku: string | null;
    };
};

function cleanStr(v: any): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}

function toNumberOrNull(v: any): number | null {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function uniq(arr: string[]) {
    return Array.from(new Set(arr));
}

function toAbsUrlMaybe(u: string, base: string): string {
    try {
        if (/^https?:\/\//i.test(u)) return u;
        return new URL(u, base).toString();
    } catch {
        return u;
    }
}

function pickMeta($: CheerioAPI, selector: string): string | null {
    const v = $(selector).attr("content");
    return cleanStr(v);
}

function pickAttr($: CheerioAPI, selector: string, attr: string): string | null {
    const v = $(selector).attr(attr);
    return cleanStr(v);
}

function parseJsonLdProducts($: CheerioAPI): any[] {
    const products: any[] = [];
    const scripts = $('script[type="application/ld+json"]').toArray();

    for (const el of scripts) {
        const raw = $(el).text();
        if (!raw) continue;

        try {
            const json = JSON.parse(raw);
            const nodes = Array.isArray(json) ? json : [json];

            for (const n of nodes) {
                const graph = n?.["@graph"];
                const cand = graph ? (Array.isArray(graph) ? graph : [graph]) : [n];

                for (const x of cand) {
                    const t = x?.["@type"];
                    const isProduct = t === "Product" || (Array.isArray(t) && t.includes("Product"));
                    if (isProduct) products.push(x);
                }
            }
        } catch {
            // ignore
        }
    }

    return products;
}

async function fetchText(url: string, ms = 12000): Promise<{ text: string; finalUrl: string }> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
        const res = await fetch(url, {
            signal: ac.signal,
            headers: {
                "user-agent": "CulceptBot/1.0 (+contact: you@example.com)",
                accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            },
            redirect: "follow",
        });
        if (!res.ok) throw new Error(`fetch ${res.status}: ${url}`);
        const txt = await res.text();
        const trimmed = txt.length > 2_000_000 ? txt.slice(0, 2_000_000) : txt;
        return { text: trimmed, finalUrl: res.url || url };
    } finally {
        clearTimeout(t);
    }
}

export async function fetchProductFacts(sourceUrl: string): Promise<ProductFacts> {
    const src = String(sourceUrl ?? "").trim();
    if (!/^https?:\/\//i.test(src)) throw new Error("sourceUrl must be http/https");

    const res = await fetchText(src, 12000);
    const finalUrl = res.finalUrl || src;

    const $ = load(res.text);

    // canonical / og:url で最終URLをより正規化（あれば）
    const canonicalHref = pickAttr($, 'link[rel="canonical"]', "href");
    const ogUrl = pickMeta($, 'meta[property="og:url"]');
    const preferredUrl =
        canonicalHref ? toAbsUrlMaybe(canonicalHref, finalUrl) :
            ogUrl ? toAbsUrlMaybe(ogUrl, finalUrl) :
                finalUrl;

    const titleTag = cleanStr($("title").first().text());
    const ogTitle = pickMeta($, 'meta[property="og:title"]') ?? titleTag;
    const ogDesc =
        pickMeta($, 'meta[property="og:description"]') ??
        pickMeta($, 'meta[name="description"]') ??
        pickMeta($, 'meta[name="twitter:description"]');
    const ogImage =
        pickMeta($, 'meta[property="og:image"]') ??
        pickMeta($, 'meta[name="twitter:image"]');

    const products = parseJsonLdProducts($);
    const p = products[0];

    // images
    let imageUrls: string[] = [];
    const img = p?.image;
    if (typeof img === "string" && cleanStr(img)) imageUrls = [toAbsUrlMaybe(img.trim(), preferredUrl)];
    else if (Array.isArray(img)) {
        imageUrls = img
            .filter((x: any) => typeof x === "string")
            .map((x: string) => toAbsUrlMaybe(x.trim(), preferredUrl))
            .filter(Boolean);
    }
    if (imageUrls.length === 0 && ogImage) imageUrls = [toAbsUrlMaybe(ogImage, preferredUrl)];
    imageUrls = uniq(imageUrls);

    // offers
    const offers = p?.offers;
    const o = Array.isArray(offers) ? offers[0] : offers;

    const pr = o?.price ?? o?.lowPrice ?? o?.priceSpecification?.price;
    const cur = o?.priceCurrency ?? o?.priceSpecification?.priceCurrency;

    const availability = cleanStr(o?.availability);

    const brand =
        cleanStr(p?.brand?.name) ??
        cleanStr(p?.brand);

    const sku = cleanStr(p?.sku);

    return {
        sourceUrl: src,
        finalUrl: preferredUrl.replace(/#.*$/, ""),
        og: {
            title: ogTitle ?? null,
            description: ogDesc ?? null,
            image: ogImage ?? null,
        },
        jsonld: {
            name: cleanStr(p?.name) ?? null,
            description: cleanStr(p?.description) ?? null,
            price: toNumberOrNull(pr),
            currency: cleanStr(cur),
            availability: availability ?? null,
            imageUrls: imageUrls.length ? imageUrls : null,
            brand: brand ?? null,
            sku: sku ?? null,
        },
    };
}
