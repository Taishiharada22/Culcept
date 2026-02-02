// components/products/RecentlyViewed.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRecentlyViewed, RecentProduct } from "./RecentlyViewedTracker";
import { Clock, X } from "lucide-react";

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

export default function RecentlyViewed({ currentProductId }: { currentProductId?: string }) {
    const { recent, clearRecent } = useRecentlyViewed();
    const [isExpanded, setIsExpanded] = React.useState(false);

    // Filter out current product
    const filtered = React.useMemo(() => {
        return recent.filter(p => p.id !== currentProductId);
    }, [recent, currentProductId]);

    if (filtered.length === 0) return null;

    const displayItems = isExpanded ? filtered : filtered.slice(0, 6);

    return (
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-teal-100 to-teal-50 p-2.5">
                        <Clock className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Recently Viewed</h3>
                        <p className="text-xs font-semibold text-slate-500">
                            {filtered.length} {filtered.length === 1 ? "product" : "products"}
                        </p>
                    </div>
                </div>

                <button
                    onClick={clearRecent}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50"
                >
                    Clear All
                </button>
            </div>

            {/* Grid */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                {displayItems.map((product) => (
                    <Link
                        key={product.id}
                        href={`/products/${product.id}`}
                        className="group block no-underline"
                    >
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
                            {/* Image */}
                            <div className="relative aspect-square overflow-hidden bg-slate-100">
                                {product.cover_image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={product.cover_image_url}
                                        alt={product.title}
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-4xl opacity-10">
                                        📦
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="p-3 space-y-1">
                                <h4 className="line-clamp-2 text-xs font-bold text-slate-900 leading-snug min-h-[2.5rem]">
                                    {product.title}
                                </h4>
                                {product.price != null && (
                                    <div className="text-sm font-black text-orange-600">
                                        ¥{fmt(product.price)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Show More */}
            {filtered.length > 6 && (
                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="rounded-lg border-2 border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
                    >
                        {isExpanded ? "Show Less" : `Show ${filtered.length - 6} More`}
                    </button>
                </div>
            )}
        </div>
    );
}
