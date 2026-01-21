// lib/recoLog.ts
"use client";

export const WHERE = {
    // pages
    DROP_DETAIL_VIEW: "drop_detail_view",
    SHOP_DETAIL_VIEW: "shop_detail_view",

    // open / click
    OPEN_DROP_DETAIL: "open_drop_detail",
    OPEN_SHOP: "open_shop",

    // shop page grid -> drop click
    SHOP_DETAIL_DROP_CARD: "shop_detail_drop_card",

    // outbound
    OUTBOUND_BUY: "outbound_buy",
    OUTBOUND_LINK: "outbound_link",
} as const;

export type RecoAction = "click" | "purchase" | "save" | "skip";
export type RecoRating = 1 | 0 | -1;

type AnyObj = Record<string, any>;

function asImp(impressionId: string | null) {
    const s = String(impressionId ?? "").trim();
    return s && s !== "undefined" ? s : "";
}

/**
 * reco action log
 * - impressionId が無い（直アクセス等）なら何もしない
 * - 失敗しても UI を落とさない
 */
export async function logRecoAction(
    impressionId: string | null,
    action: RecoAction,
    meta: AnyObj = {}
) {
    const imp = asImp(impressionId);
    if (!imp) return;

    try {
        await fetch("/api/recommendations/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                impressionId: imp,
                action,
                meta,
            }),
            keepalive: true,
        });
    } catch {
        // 体験優先：黙る
    }
}

/**
 * reco rating log
 * - impressionId が無いなら何もしない
 * - 失敗しても UI を落とさない
 */
export async function logRecoRating(impressionId: string | null, rating: RecoRating) {
    const imp = asImp(impressionId);
    if (!imp) return;

    try {
        await fetch("/api/recommendations/rating", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                impressionId: imp,
                rating,
            }),
            keepalive: true,
        });
    } catch {
        // 体験優先：黙る
    }
}
