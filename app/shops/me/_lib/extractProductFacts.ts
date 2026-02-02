// app/shops/me/_lib/extractProductFacts.ts
import "server-only";
import { load, type CheerioAPI } from "cheerio";

export type ProductFacts = {
    sourceUrl: string;
    finalUrl: string;
    og: {
        title: string | null;
        description: string | null;
        image: string | null;
        siteName: string | null;
        url: string | null;
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
        url: string | null;
    };
};

function pickMeta($: CheerioAPI, selector: string): string | null {
    const v = $(selector).attr("content");
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
}

function pickAttr($: CheerioAPI, selector: string, attr: string): string | null {
    const v = $(selector).attr(attr);
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
}

function toAbsUrlMaybe(u: string, base: string): string {
    try {
        if (/^https?:\/\//i.test(u)) return u;
        return new URL(u, base).toString();
    } catch {
        return u;
    }
}

function uniq(arr: string[]) {
    return Array.from(new Set(arr));
}

function normalizeJsonLdNodes(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw["@graph"] && Array.isArray(raw["@graph"])) return raw["@graph"];
    return [raw];
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
                const cand = normalizeJsonLdNodes(n);
                for (const x of cand) {
                    const t = x?.["@type"];
                    const isProduct =
                        t === "Product" || (Array.isArray(t) && t.includes("Product"));
                    if (isProduct) products.push(x);
                }
            }
        } catch {
            // ignore
        }
    }

    return products;
}

function extractFromHtml(html: string, sourceUrl: string, finalUrl: string): ProductFacts {
    const $ = load(html);

    // canonical / og:url
    const canonicalHref = pickAttr($, 'link[rel="canonical"]', "href");
    const ogUrl = pickMeta($, 'meta[property="og:url"]');
    const canonical = canonicalHref ? toAbsUrlMaybe(canonicalHref, finalUrl) : null;
    const ogResolvedUrl = ogUrl ? toAbsUrlMaybe(ogUrl, finalUrl) : null;

    const titleTag = $("title").first().text().trim();
    const ogTitle =
        pickMeta($, 'meta[property="og:title"]') ??
        pickMeta($, 'meta[name="twitter:title"]') ??
        (titleTag || null);

    const ogDesc =
        pickMeta($, 'meta[property="og:description"]') ??
        pickMeta($, 'meta[name="description"]') ??
        pickMeta($, 'meta[name="twitter:description"]') ??
        null;

    const ogImage =
        pickMeta($, 'meta[property="og:image"]') ??
        pickMeta($, 'meta[name="twitter:image"]') ??
        null;

    const ogSiteName = pickMeta($, 'meta[property="og:site_name"]');

    // JSON-LD(Product)
    const products = parseJsonLdProducts($);
    const p = products[0];

    const name =
        (typeof p?.name === "string" && p.name.trim() ? p.name.trim() : null) ?? ogTitle;

    const description =
        (typeof p?.description === "string" && p.description.trim()
            ? p.description.trim()
            : null) ?? ogDesc;

    // images
    let imageUrls: string[] = [];
    const img = p?.image;

    if (typeof img === "string" && img.trim()) imageUrls = [toAbsUrlMaybe(img.trim(), finalUrl)];
    else if (Array.isArray(img)) {
        imageUrls = img
            .filter((x) => typeof x === "string")
            .map((x: string) => toAbsUrlMaybe(x.trim(), finalUrl))
            .filter(Boolean);
    }
    if (imageUrls.length === 0 && ogImage) imageUrls = [toAbsUrlMaybe(ogImage, finalUrl)];
    imageUrls = uniq(imageUrls);

    // offers -> price/currency/availability
    let price: number | null = null;
    let currency: string | null = null;
    let availability: string | null = null;

    const offers = p?.offers;
    const o = Array.isArray(offers) ? offers[0] : offers;

    if (o) {
        const pr = o.price ?? o.lowPrice ?? o?.priceSpecification?.price;
        if (pr != null && pr !== "") {
            const n = Number(pr);
            if (!Number.isNaN(n)) price = n;
        }
        const cur = o.priceCurrency ?? o?.priceSpecification?.priceCurrency;
        currency = typeof cur === "string" && cur.trim() ? cur.trim() : null;

        const av = o.availability;
        availability = typeof av === "string" && av.trim() ? av.trim() : null;
    }

    const brand =
        typeof p?.brand?.name === "string"
            ? p.brand.name.trim() || null
            : typeof p?.brand === "string"
                ? p.brand.trim() || null
                : null;

    const sku = typeof p?.sku === "string" ? p.sku.trim() || null : null;

    const jsonldUrl =
        typeof p?.url === "string" && p.url.trim() ? toAbsUrlMaybe(p.url.trim(), finalUrl) : null;

    return {
        sourceUrl,
        finalUrl,
        og: {
            title: ogTitle,
            description: ogDesc,
            image: ogImage ? toAbsUrlMaybe(ogImage, finalUrl) : null,
            siteName: ogSiteName,
            url: ogResolvedUrl ?? canonical ?? null,
        },
        jsonld: {
            name,
            description,
            price,
            currency,
            availability,
            imageUrls: imageUrls.length ? imageUrls : null,
            brand,
            sku,
            url: jsonldUrl ?? canonical ?? ogResolvedUrl ?? null,
        },
    };
}

export async function fetchProductFacts(sourceUrl: string, ms = 12000): Promise<ProductFacts> {
    const url = String(sourceUrl ?? "").trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("sourceUrl must be http/https");

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);

    try {
        const res = await fetch(url, {
            redirect: "follow",
            signal: ac.signal,
            headers: {
                "user-agent": "CulceptBot/1.0 (+contact: you@example.com)",
                accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            },
        });
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

        const html = await res.text();
        const trimmed = html.length > 2_000_000 ? html.slice(0, 2_000_000) : html;

        const finalUrl = res.url || url;
        return extractFromHtml(trimmed, url, finalUrl);
    } finally {
        clearTimeout(t);
    }
}
