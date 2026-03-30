// components/products/ProductQuickView.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Product } from "@/types/product";
import { X } from "lucide-react";

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

export default function ProductQuickView({
    product,
    onClose,
    imp,
}: {
    product: Product;
    onClose: () => void;
    imp?: string | null;
}) {
    const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
    const shownPrice = (product.display_price ?? product.price) ?? null;
    const detailHref = imp ? `/products/${product.id}?imp=${encodeURIComponent(imp)}` : `/products/${product.id}`;

    // Close on Escape
    React.useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    // Prevent body scroll
    React.useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
            style={{ animation: "fadeIn 0.2s ease-out" }}
        >
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(40px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>

            <div
                className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: "slideUp 0.3s ease-out" }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 rounded-full bg-white/90 backdrop-blur-sm p-2 shadow-lg transition-all duration-200 hover:bg-white hover:scale-110 border border-slate-200"
                >
                    <X className="h-5 w-5 text-slate-700" />
                </button>

                <div className="grid md:grid-cols-2 max-h-[90vh] overflow-y-auto">
                    {/* Left: Image Gallery */}
                    <div className="relative bg-slate-50 p-8">
                        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-white border border-slate-200">
                            {product.cover_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={product.cover_image_url}
                                    alt={product.title}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-8xl opacity-10">
                                    📦
                                </div>
                            )}
                        </div>

                        {/* Status Badge */}
                        {product.sold_at || product.is_sold ? (
                            <div className="absolute top-12 left-12">
                                <span className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white shadow-lg">
                                    SOLD OUT
                                </span>
                            </div>
                        ) : null}
                    </div>

                    {/* Right: Product Info */}
                    <div className="flex flex-col p-8 space-y-6">
                        {/* Shop */}
                        {product.shop_slug && (
                            <Link
                                href={`/stores/${encodeURIComponent(product.shop_slug)}`}
                                className="flex items-center gap-2 group no-underline w-fit"
                            >
                                {product.shop_avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={product.shop_avatar_url}
                                        alt=""
                                        className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                                    />
                                ) : (
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 border border-purple-200" />
                                )}
                                <span className="text-sm font-bold text-slate-600 group-hover:text-purple-600 transition-colors uppercase tracking-wide">
                                    {product.shop_name_ja || product.shop_name_en || product.shop_slug}
                                </span>
                            </Link>
                        )}

                        {/* Title */}
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 leading-tight mb-2">
                                {product.title}
                            </h2>
                            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                                {[product.brand, product.size, product.condition].filter(Boolean).join(" · ")}
                            </div>
                        </div>

                        {/* Price */}
                        {shownPrice != null && (
                            <div className="flex items-baseline gap-3">
                                <div className="text-4xl font-black text-slate-900">
                                    ¥{fmt(shownPrice)}
                                </div>
                                {product.sale_mode === "auction" && (
                                    <span className="text-sm font-bold text-slate-500">
                                        {product.is_auction_live ? "Current Price" : "Starting Price"}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Auction Info */}
                        {product.sale_mode === "auction" && (
                            <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-orange-600 uppercase tracking-wide">
                                        🔴 Live Auction
                                    </span>
                                </div>
                                {product.highest_bid_30d && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-slate-600">Current Bid:</span>
                                        <span className="text-xl font-black text-orange-600">
                                            ¥{fmt(product.highest_bid_30d)}
                                        </span>
                                    </div>
                                )}
                                {product.auction_floor_price && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500">Floor Price:</span>
                                        <span className="text-sm font-bold text-slate-700">
                                            ¥{fmt(product.auction_floor_price)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Description */}
                        {product.description && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                    Description
                                </h3>
                                <p className="text-sm font-medium text-slate-600 leading-relaxed line-clamp-4">
                                    {product.description}
                                </p>
                            </div>
                        )}

                        {/* Tags */}
                        {product.tags && product.tags.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                    Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {product.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg uppercase tracking-wide"
                                        >
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* CTA Buttons */}
                        <div className="flex flex-col gap-3 pt-4 border-t border-slate-200 mt-auto">
                            <Link
                                href={detailHref}
                                className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-center text-base font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                            >
                                View Full Details
                            </Link>

                            {product.purchase_url && !(product.sold_at || product.is_sold) && (
                                <a
                                    href={product.purchase_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full rounded-xl bg-slate-900 px-6 py-4 text-center text-base font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                                >
                                    Buy Now
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
