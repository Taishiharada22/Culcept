// app/drops/DropCard.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import SavedToggleButton from "@/app/_components/saved/SavedToggleButton";
import RatingStars from "@/components/reviews/RatingStars";

type ToggleRes = { ok: boolean; saved: boolean; error?: string };

type DropLike = {
    id: string;
    title: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    cover_image_url: string | null;

    display_price?: number | null;
    highest_bid_30d?: number | null;
    sale_mode?: "fixed" | "auction" | null;
    is_auction_live?: boolean | null;

    shop_slug?: string | null;
    shop_name_ja?: string | null;
    shop_name_en?: string | null;
    shop_avatar_url?: string | null;
    shop_headline?: string | null;

    // ✅ Reviews (optional)
    average_rating?: number | null;
    review_count?: number | null;
};

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

function shopName(d: DropLike) {
    return d.shop_name_ja || d.shop_name_en || d.shop_slug || "";
}

function fireRecoActionOnce(payload: { impressionId: string; action: string; meta?: any }) {
    try {
        if (typeof window === "undefined") return;

        const where = String(payload?.meta?.where ?? "click");
        const target =
            String(payload?.meta?.drop_id ?? "") ||
            String(payload?.meta?.shop_slug ?? "") ||
            String(payload?.meta?.url ?? "");

        const onceKey = `reco_ping:${payload.impressionId}:${payload.action}:${where}:${target}`;
        if (sessionStorage.getItem(onceKey)) return;
        sessionStorage.setItem(onceKey, "1");

        const url = "/api/recommendations/action";
        const body = JSON.stringify(payload);

        if (navigator.sendBeacon) {
            const ok = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
            if (ok) return;
        }

        fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => { });
    } catch {
        // noop
    }
}

export default function DropCard({
    d,
    imp,
    showSave,
    initialSaved,
    toggleSaveAction,
    clickMeta,
}: {
    d: DropLike;
    imp?: string | null;
    showSave?: boolean;
    initialSaved?: boolean;
    toggleSaveAction?: (id: string) => Promise<ToggleRes>;
    clickMeta?: any;
}) {
    const title = d.title ?? d.id.slice(0, 8);

    // ✅ display_price は number なので .trim() 不要
    const shownPrice = (d.display_price ?? d.price) ?? null;

    const safeImp = (imp ?? "").trim() || null;

    const href = safeImp ? `/drops/${d.id}?imp=${encodeURIComponent(safeImp)}` : `/drops/${d.id}`;

    const shopHref =
        d.shop_slug
            ? safeImp
                ? `/shops/${encodeURIComponent(d.shop_slug)}?imp=${encodeURIComponent(safeImp)}`
                : `/shops/${encodeURIComponent(d.shop_slug)}`
            : null;

    const canSave = !!showSave && !!toggleSaveAction;

    const onDropLinkClick = React.useCallback(() => {
        if (!safeImp) return;
        fireRecoActionOnce({
            impressionId: safeImp,
            action: "click",
            meta: {
                ...(clickMeta ?? {}),
                where: String(clickMeta?.where ?? "drop_card_click"),
                drop_id: d.id,
            },
        });
    }, [safeImp, d.id, clickMeta]);

    const onShopLinkClick = React.useCallback(() => {
        if (!safeImp || !d.shop_slug) return;
        fireRecoActionOnce({
            impressionId: safeImp,
            action: "click",
            meta: {
                ...(clickMeta ?? {}),
                where: String(clickMeta?.where_shop ?? "drop_card_shop_click"),
                drop_id: d.id,
                shop_slug: d.shop_slug,
            },
        });
    }, [safeImp, d.id, d.shop_slug, clickMeta]);

    // ✅ Reviews visibility
    const avg = typeof d.average_rating === "number" ? d.average_rating : Number(d.average_rating ?? NaN);
    const cnt = typeof d.review_count === "number" ? d.review_count : Number(d.review_count ?? NaN);
    const showRating = Number.isFinite(avg) && Number.isFinite(cnt) && cnt > 0 && avg > 0;

    return (
        <article
            className="group relative overflow-hidden rounded-3xl bg-white/70 border border-white/60 backdrop-blur-xl shadow-lg shadow-slate-900/5 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 hover:border-white/90"
            style={{
                animation: "fadeInUp 0.5s ease-out forwards",
                opacity: 0,
            }}
        >
            <style jsx>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>

            {/* Image Container */}
            <Link href={href} onClick={onDropLinkClick} className="block relative aspect-square overflow-hidden bg-slate-100/70">
                {d.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={d.cover_image_url}
                        alt={title}
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-6xl opacity-10">📦</div>
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Status Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {d.sale_mode === "auction" && d.is_auction_live && (
                        <span className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-3 py-1.5 text-xs font-black text-white shadow-lg animate-pulse">
                            🔴 LIVE
                        </span>
                    )}
                </div>

                {/* Save Button */}
                {canSave && (
                    <div className="absolute top-3 right-3 z-10">
                        <SavedToggleButton
                            kind="drop"
                            id={d.id}
                            initialSaved={!!initialSaved}
                            toggleAction={toggleSaveAction!}
                            size="sm"
                        />
                    </div>
                )}
            </Link>

            {/* Content */}
            <div className="p-4 space-y-3">
                {/* Shop Info */}
                {d.shop_slug && shopHref && (
                    <Link href={shopHref} onClick={onShopLinkClick} className="flex items-center gap-2 group/shop no-underline">
                        {d.shop_avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={d.shop_avatar_url}
                                alt={shopName(d)}
                                className="h-6 w-6 rounded-full border border-white/70 object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 border border-white/70" />
                        )}
                        <span className="text-xs font-bold text-slate-600 group-hover/shop:text-violet-600 transition-colors uppercase tracking-wide">
                            {shopName(d)}
                        </span>
                    </Link>
                )}

                {/* Title & Price */}
                <Link href={href} onClick={onDropLinkClick} className="block no-underline">
                    <h3 className="line-clamp-2 text-base font-bold text-slate-900 leading-snug mb-2 group-hover:text-violet-600 transition-colors">
                        {title}
                    </h3>

                    <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                                {[d.brand, d.size, d.condition].filter(Boolean).join(" · ") || " "}
                            </div>
                        </div>

                        {shownPrice != null && (
                            <div className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 px-3 py-1.5 shadow-md">
                                <span className="text-sm font-black text-white">¥{fmt(shownPrice)}</span>
                            </div>
                        )}
                    </div>
                </Link>

                {/* ✅ Reviews */}
                {showRating ? (
                    <div className="flex items-center gap-2 pt-1">
                        <RatingStars rating={avg} size="sm" />
                        <span className="text-xs font-bold text-slate-600">({Math.round(cnt).toLocaleString("ja-JP")})</span>
                    </div>
                ) : null}

                {/* Auction Info */}
                {d.sale_mode === "auction" && Number(d.highest_bid_30d ?? 0) > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-white/60">
                        <span className="text-xs font-semibold text-slate-500">Current Bid:</span>
                        <span className="text-sm font-black text-violet-600">¥{fmt(d.highest_bid_30d)}</span>
                    </div>
                )}
            </div>
        </article>
    );
}
