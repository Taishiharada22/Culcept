export type Platform =
    | "mercari"
    | "rakuma"
    | "yahoo_auction"
    | "yahoo_fleamarket"
    | "grailed"
    | "ebay"
    | "shopify";

function detectPlatform(hostname: string): Platform | null {
    const h = hostname.toLowerCase();

    // Japan
    if (h === "jp.mercari.com" || h.endsWith(".mercari.com")) return "mercari";
    if (h === "fril.jp" || h.endsWith(".fril.jp")) return "rakuma";
    if (h === "auctions.yahoo.co.jp") return "yahoo_auction";
    if (h === "paypayfleamarket.yahoo.co.jp") return "yahoo_fleamarket";

    // Global
    if (h === "www.grailed.com") return "grailed";
    if (h === "www.ebay.com" || h === "ebay.com") return "ebay";
    if (h.endsWith(".myshopify.com")) return "shopify";

    return null;
}

export function isAllowedExternal(
    urlStr: string
):
    | { ok: true; url: URL; platform: Platform }
    | { ok: false; reason: string } {
    let url: URL;
    try {
        url = new URL(urlStr);
    } catch {
        return { ok: false, reason: "Invalid URL" };
    }

    if (url.protocol !== "https:") return { ok: false, reason: "Only https is allowed" };

    const platform = detectPlatform(url.hostname);
    if (!platform) return { ok: false, reason: "Domain not allowed" };

    return { ok: true, url, platform };
}
