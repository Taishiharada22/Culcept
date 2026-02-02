// app/shops/me/_lib/extractSiteFacts.ts
export type SiteFacts = {
    inputUrl: string;
    finalUrl: string;
    status: number;
    ok: boolean;
    title: string | null;
    og: {
        title: string | null;
        description: string | null;
        image: string | null;
        siteName: string | null;
    };
    jsonld: {
        name: string | null;
        description: string | null;
        url: string | null;
        logo: string | null;
        addressText: string | null;
    };
};

function cleanStr(v: any): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s.length ? s : null;
}

function absUrlMaybe(u: string | null, base: string): string | null {
    if (!u) return null;
    try {
        return new URL(u, base).toString();
    } catch {
        return null;
    }
}

function pickMeta(html: string, attr: "property" | "name", key: string): string | null {
    const re = new RegExp(
        `<meta[^>]+${attr}\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
        "i"
    );
    const m = html.match(re);
    return cleanStr(m?.[1] ?? null);
}

function pickTitle(html: string): string | null {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return cleanStr(m?.[1]?.replace(/\s+/g, " ") ?? null);
}

function extractJsonLd(html: string): any[] {
    const out: any[] = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const raw = (m[1] || "").trim();
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) out.push(...parsed);
            else out.push(parsed);
        } catch {
            // ignore
        }
    }
    return out;
}

function pickSiteFromJsonLd(list: any[], baseUrl: string) {
    // WebSite / Organization あたりを優先
    const candidates = list.filter((x) => x && typeof x === "object");
    const ws =
        candidates.find((x) => String(x["@type"] || "").toLowerCase() === "website") ||
        candidates.find((x) => String(x["@type"] || "").toLowerCase() === "organization") ||
        candidates[0];

    const name = cleanStr(ws?.name ?? null);
    const description = cleanStr(ws?.description ?? null);
    const url = absUrlMaybe(cleanStr(ws?.url ?? null), baseUrl);
    const logo =
        absUrlMaybe(cleanStr(ws?.logo?.url ?? ws?.logo ?? null), baseUrl) ||
        absUrlMaybe(cleanStr(ws?.image?.url ?? ws?.image ?? null), baseUrl);
    const addressText = cleanStr(ws?.address?.streetAddress ?? ws?.address ?? null);

    return { name, description, url, logo, addressText };
}

async function fetchHtml(url: string, ms = 12000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
        const res = await fetch(url, {
            signal: ac.signal,
            redirect: "follow",
            cache: "no-store",
            headers: {
                "user-agent": "CulceptBot/1.0 (+contact: you@example.com)",
                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });
        const status = res.status;
        const finalUrl = res.url || url;
        const text = await res.text().catch(() => "");
        return { status, finalUrl, html: text, ok: res.ok };
    } finally {
        clearTimeout(t);
    }
}

/** ✅ actions.ts が import してる名前 */
export async function fetchSiteFacts(siteUrl: string): Promise<SiteFacts> {
    return extractSiteFacts(siteUrl);
}

/** ✅ 将来別名で呼ばれても死なないように同じ実体を export */
export async function extractSiteFacts(siteUrl: string): Promise<SiteFacts> {
    const inputUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;

    const { status, finalUrl, html, ok } = await fetchHtml(inputUrl, 12000);
    const base = finalUrl;

    const title = pickTitle(html);

    const ogTitle = pickMeta(html, "property", "og:title") ?? pickMeta(html, "name", "twitter:title");
    const ogDesc =
        pickMeta(html, "property", "og:description") ?? pickMeta(html, "name", "description") ?? pickMeta(html, "name", "twitter:description");
    const ogImage =
        absUrlMaybe(pickMeta(html, "property", "og:image") ?? pickMeta(html, "name", "twitter:image"), base);
    const ogSiteName = pickMeta(html, "property", "og:site_name");

    const jsonlds = extractJsonLd(html);
    const j = pickSiteFromJsonLd(jsonlds, base);

    return {
        inputUrl,
        finalUrl,
        status,
        ok,
        title: cleanStr(ogTitle) ?? title,
        og: {
            title: cleanStr(ogTitle),
            description: cleanStr(ogDesc),
            image: ogImage,
            siteName: cleanStr(ogSiteName),
        },
        jsonld: {
            name: j.name,
            description: j.description,
            url: j.url,
            logo: j.logo,
            addressText: j.addressText,
        },
    };
}
