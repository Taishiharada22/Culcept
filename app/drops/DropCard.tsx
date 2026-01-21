// app/drops/DropCard.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import SavedToggleButton from "@/app/_components/saved/SavedToggleButton";

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
};

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

function shopName(d: DropLike) {
    return d.shop_name_ja || d.shop_name_en || d.shop_slug || "";
}

/**
 * Reco action ping（クリック時に “同じ対象” は1回だけ）
 * - endpoint は既存の /api/recommendations/action を想定
 * - 失敗してもUIは落とさない
 */
function fireRecoActionOnce(payload: { impressionId: string; action: string; meta?: any }) {
    try {
        if (typeof window === "undefined") return;

        const where = String(payload?.meta?.where ?? "click");
        // ✅ 重要：drop_id / shop_slug 単位で1回にする（whereだけだと全クリックが握りつぶされる）
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
    clickMeta?: any; // ← “JSON”だけ渡す（関数禁止）
}) {
    const title = d.title ?? d.id.slice(0, 8);
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

    return (
        <li className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="relative">
                <Link href={href} onClick={onDropLinkClick} className="block no-underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {d.cover_image_url ? (
                        <img
                            src={d.cover_image_url}
                            alt={title}
                            className="h-56 w-full object-cover transition hover:scale-[1.01]"
                            loading="lazy"
                        />
                    ) : (
                        <div className="h-56 w-full bg-zinc-50" />
                    )}

                    <div className="grid gap-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="grid gap-1 min-w-0">
                                <div className="line-clamp-2 text-base font-black text-zinc-900">{title}</div>
                                <div className="text-xs font-semibold text-zinc-600">
                                    {[d.brand, d.size, d.condition].filter(Boolean).join(" · ") || " "}
                                </div>
                            </div>

                            {shownPrice != null ? (
                                <div className="shrink-0 text-sm font-black text-zinc-950">¥{fmt(shownPrice)}</div>
                            ) : null}
                        </div>

                        {d.sale_mode === "auction" && Number(d.highest_bid_30d ?? 0) > 0 ? (
                            <div className="text-xs font-semibold text-zinc-600">
                                bid: <span className="font-black text-zinc-900">¥{fmt(d.highest_bid_30d)}</span>
                                {d.is_auction_live ? (
                                    <span className="ml-2 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-black text-zinc-700">
                                        LIVE
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </Link>

                {/* ★ Saved（Drop） */}
                {canSave ? (
                    <div className="absolute right-3 top-3">
                        <SavedToggleButton
                            kind="drop"
                            id={d.id}
                            initialSaved={!!initialSaved}
                            toggleAction={toggleSaveAction!}
                            size="sm"
                        />
                    </div>
                ) : null}
            </div>

            {/* Shop strip */}
            {d.shop_slug && shopHref ? (
                <div className="border-t border-zinc-100 px-4 py-3">
                    <Link
                        href={shopHref}
                        onClick={onShopLinkClick}
                        className="flex items-center gap-2 text-xs font-black text-zinc-700 no-underline hover:text-zinc-950"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {d.shop_avatar_url ? (
                            <img
                                src={d.shop_avatar_url}
                                alt="shop"
                                className="h-7 w-7 rounded-full border border-zinc-200 object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <span className="h-7 w-7 rounded-full border border-zinc-200 bg-zinc-50" />
                        )}

                        <span className="truncate">{shopName(d)}</span>
                        {d.shop_headline ? (
                            <span className="ml-1 line-clamp-1 text-zinc-500 font-semibold">· {d.shop_headline}</span>
                        ) : null}
                    </Link>
                </div>
            ) : null}
        </li>
    );
}
