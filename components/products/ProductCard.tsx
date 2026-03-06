// components/products/ProductCard.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Product } from "@/types/product";

type ToggleRes = { ok: boolean; saved: boolean; error?: string };

// ✅ SavedToggleButtonを内部で定義（インポート不要）
function SavedToggleButton({
    kind,
    id,
    initialSaved,
    toggleAction,
    size = "sm",
}: {
    kind: "product" | "drop";
    id: string;
    initialSaved: boolean;
    toggleAction: (id: string) => Promise<ToggleRes>;
    size?: "sm" | "md" | "lg";
}) {
    const [saved, setSaved] = React.useState(initialSaved);
    const [pending, startTransition] = React.useTransition();
    const [error, setError] = React.useState<string | null>(null);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const sizeClasses = {
        sm: "h-9 w-9 text-base",
        md: "h-11 w-11 text-lg",
        lg: "h-14 w-14 text-2xl",
    };

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setError(null);
        startTransition(async () => {
            try {
                const res = await toggleAction(id);
                if (!res?.ok) {
                    setError(res?.error ?? "Failed");
                    return;
                }
                setSaved(!!res.saved);

                if (res.saved) {
                    setShowSuccess(true);
                    setTimeout(() => setShowSuccess(false), 1000);
                }
            } catch (err: any) {
                setError(String(err?.message ?? "Error"));
            }
        });
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={handleClick}
                disabled={pending}
                className={`
          ${sizeClasses[size]}
          relative rounded-full
          transition-all duration-300
          ${saved
                        ? "bg-gradient-to-br from-red-500 via-pink-500 to-red-600 text-white shadow-lg scale-100"
                        : "bg-white/90 backdrop-blur text-slate-600 border-2 border-slate-200 hover:border-red-400 hover:text-red-500"
                    }
          ${pending ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
          shadow-md hover:shadow-xl
        `}
                aria-label={saved ? `Unsave this ${kind}` : `Save this ${kind}`}
                style={{
                    transform: showSuccess ? "scale(1.2)" : undefined,
                }}
            >
                <span
                    className="transition-transform duration-200"
                    style={{
                        animation: showSuccess ? "heartBeat 0.6s ease-in-out" : undefined,
                    }}
                >
                    {saved ? "❤️" : "🤍"}
                </span>

                {showSuccess && (
                    <span
                        className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"
                        style={{ animationDuration: "0.6s" }}
                    />
                )}
            </button>

            {error && (
                <div
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 whitespace-nowrap rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-xl"
                    style={{
                        animation: "fadeIn 0.2s ease-out",
                    }}
                >
                    {error}
                </div>
            )}

            <style jsx>{`
        @keyframes heartBeat {
          0%,
          100% {
            transform: scale(1);
          }
          25% {
            transform: scale(1.3);
          }
          50% {
            transform: scale(1.1);
          }
          75% {
            transform: scale(1.2);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
        </div>
    );
}

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

function shopName(p: Product) {
    return p.shop_name_ja || p.shop_name_en || p.shop_slug || "";
}

function fireRecoActionOnce(payload: { impressionId: string; action: string; meta?: any }) {
    try {
        if (typeof window === "undefined") return;
        const where = String(payload?.meta?.where ?? "click");
        const target = String(payload?.meta?.product_id ?? "") || String(payload?.meta?.url ?? "");
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
    } catch { }
}

// ✅ /api/track へクリック計測（失敗してもUI壊さない）
async function trackClickViaApi(productId: string) {
    try {
        await fetch("/api/track", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                action: "click",
                product_id: productId,
            }),
            keepalive: true,
        });
    } catch {
        // ignore
    }
}

export default function ProductCard({
    product,
    imp,
    showSave,
    initialSaved,
    toggleSaveAction,
    clickMeta,
    onQuickView,
}: {
    product: Product;
    imp?: string | null;
    showSave?: boolean;
    initialSaved?: boolean;
    toggleSaveAction?: (id: string) => Promise<ToggleRes>;
    clickMeta?: any;
    onQuickView?: (product: Product) => void;
}) {
    const title = product.title ?? product.id.slice(0, 8);
    const shownPrice = (product.display_price ?? product.price) ?? null;
    const safeImp = (imp ?? "").trim() || null;
    const href = safeImp ? `/products/${product.id}?imp=${encodeURIComponent(safeImp)}` : `/products/${product.id}`;
    const [fitColor, setFitColor] = React.useState<{
        fit?: number;
        color?: number;
        fitReason?: string;
        colorReason?: string;
    } | null>(null);

    const shopHref = product.shop_slug
        ? safeImp
            ? `/stores/${encodeURIComponent(product.shop_slug)}?imp=${encodeURIComponent(safeImp)}`
            : `/stores/${encodeURIComponent(product.shop_slug)}`
        : null;

    const canSave = !!showSave && !!toggleSaveAction;

    // ✅ クリック統合：recommendations + /api/track
    const onProductClick = React.useCallback(
        (e: React.MouseEvent) => {
            // 1) Recommendations action (once)
            if (safeImp) {
                fireRecoActionOnce({
                    impressionId: safeImp,
                    action: "click",
                    meta: {
                        ...(clickMeta ?? {}),
                        where: String(clickMeta?.where ?? "product_card_click"),
                        product_id: product.id,
                    },
                });
            }

            // 2) Generic tracking
            // （awaitしない：遷移を止めない / keepalive）
            void trackClickViaApi(product.id);
        },
        [safeImp, product.id, clickMeta]
    );

    const handleQuickView = React.useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onQuickView?.(product);
        },
        [onQuickView, product]
    );

    React.useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch("/api/fit-color-score", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ product_id: product.id }),
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const data = await res.json();
                const item = data?.items?.[0];
                if (!active || !item) return;
                setFitColor({
                    fit: typeof item.fit?.score === "number" ? item.fit.score : undefined,
                    color: typeof item.color?.score === "number" ? item.color.score : undefined,
                    fitReason: item.fit?.reasons?.[0],
                    colorReason: item.color?.reasons?.[0],
                });
            } catch {
                // ignore
            }
        }, 300);
        return () => {
            active = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [product.id]);

    return (
        <article
            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/60 shadow-sm transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 hover:border-slate-300"
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
            <Link href={href} onClick={onProductClick} className="block relative aspect-square overflow-hidden bg-slate-100">
                {product.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={product.cover_image_url}
                        alt={title}
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-6xl opacity-10">📦</div>
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Quick View Button */}
                {onQuickView && (
                    <button
                        onClick={handleQuickView}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white/95 backdrop-blur-sm px-6 py-3 text-sm font-black text-slate-900 shadow-2xl opacity-0 transition-all duration-300 group-hover:opacity-100 hover:scale-105 border border-slate-200"
                    >
                        Quick View
                    </button>
                )}

                {/* Status Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {product.sale_mode === "auction" && product.is_auction_live && (
                        <span className="rounded-lg bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-lg animate-pulse">
                            🔴 LIVE
                        </span>
                    )}
                    {product.sold_at || product.is_sold ? (
                        <span className="rounded-lg bg-slate-900/90 backdrop-blur-sm px-3 py-1.5 text-xs font-black text-white shadow-lg">
                            SOLD
                        </span>
                    ) : null}
                </div>

                {/* Save Button */}
                {canSave && (
                    <div className="absolute top-3 right-3 z-10">
                        <SavedToggleButton kind="product" id={product.id} initialSaved={!!initialSaved} toggleAction={toggleSaveAction!} size="sm" />
                    </div>
                )}
            </Link>

            {/* Content */}
            <div className="p-4 space-y-3">
                {/* Shop Info */}
                {product.shop_slug && shopHref && (
                    <Link href={shopHref} className="flex items-center gap-2 group/shop no-underline">
                        {product.shop_avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={product.shop_avatar_url}
                                alt={shopName(product)}
                                className="h-6 w-6 rounded-full border border-slate-200 object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 border border-purple-200" />
                        )}
                        <span className="text-xs font-bold text-slate-600 group-hover/shop:text-purple-600 transition-colors uppercase tracking-wide">
                            {shopName(product)}
                        </span>
                    </Link>
                )}

                {/* Title & Price */}
                <Link href={href} onClick={onProductClick} className="block no-underline">
                    <h3 className="line-clamp-2 text-base font-bold text-slate-900 leading-snug mb-2 group-hover:text-orange-600 transition-colors">
                        {title}
                    </h3>

                    <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                                {[product.brand, product.size, product.condition].filter(Boolean).join(" · ") || " "}
                            </div>
                        </div>

                        {shownPrice != null && (
                            <div className="shrink-0 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1.5 shadow-md">
                                <span className="text-sm font-black text-white">¥{fmt(shownPrice)}</span>
                            </div>
                        )}
                    </div>
                </Link>

                {/* Auction Info */}
                {product.sale_mode === "auction" && Number(product.highest_bid_30d ?? 0) > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <span className="text-xs font-semibold text-slate-500">Current Bid:</span>
                        <span className="text-sm font-black text-purple-600">¥{fmt(product.highest_bid_30d)}</span>
                    </div>
                )}

                {/* Fit/Color Score */}
                {fitColor && (
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                                フィット {fitColor.fit ?? "--"}点
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
                                カラー {fitColor.color ?? "--"}点
                            </span>
                        </div>
                        {(fitColor.fitReason || fitColor.colorReason) && (
                            <div className="text-[10px] text-slate-500 line-clamp-2">
                                {fitColor.fitReason ? `根拠: ${fitColor.fitReason}` : "根拠: --"}
                                {fitColor.colorReason ? ` / ${fitColor.colorReason}` : ""}
                            </div>
                        )}
                    </div>
                )}

                {/* Tags */}
                {product.tags && product.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                        {product.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md uppercase tracking-wide"
                            >
                                {tag}
                            </span>
                        ))}
                        {product.tags.length > 3 && <span className="text-[10px] font-bold text-slate-400">+{product.tags.length - 3}</span>}
                    </div>
                )}
            </div>
        </article>
    );
}
