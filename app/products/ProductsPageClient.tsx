// app/products/ProductsPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Product } from "@/types/product";
import ProductCard from "@/components/products/ProductCard";
import ProductQuickView from "@/components/products/ProductQuickView";
import ProductFilters from "@/components/products/ProductFilters";
import { toggleSavedDropAction } from "@/app/_actions/saved";
import { Grid, List } from "lucide-react";

type Props = {
    products: any[];
    error: string | null;
    savedSet: Set<string>;
    userId: string | null;
    imp: string;
    filters: Record<string, string>;
};

export default function ProductsPageClient({
    products,
    error,
    savedSet,
    userId,
    imp,
    filters,
}: Props) {
    const [quickViewProduct, setQuickViewProduct] = React.useState<Product | null>(null);
    const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");

    const clickMeta = {
        where: "products_list_click",
        where_shop: "products_list_shop_click"
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/10 to-purple-50/10">
            {/* Hero Header */}
            <div className="border-b-2 border-slate-200 bg-gradient-to-r from-white via-orange-50/20 to-purple-50/20 py-12">
                <div className="mx-auto max-w-7xl px-6">
                    <div className="flex items-end justify-between gap-6 mb-8">
                        <div>
                            <h1
                                className="text-7xl font-black tracking-tight text-slate-900 mb-3"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                Products
                            </h1>
                            <p className="text-base font-bold text-slate-600">
                                Discover unique items from curated stores
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <Link
                                href={`/products/new?imp=${encodeURIComponent(imp)}`}
                                className="rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 border-2 border-orange-400 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                            >
                                + List Product
                            </Link>

                            <Link
                                href={`/stores/me?imp=${encodeURIComponent(imp)}`}
                                className="rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 border-2 border-purple-400 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                            >
                                My Store
                            </Link>

                            <Link
                                href={`/me/saved?imp=${encodeURIComponent(imp)}`}
                                className="rounded-xl bg-white border-2 border-slate-300 px-6 py-3 text-sm font-black text-slate-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 hover:border-teal-400 hover:text-teal-600 no-underline"
                            >
                                ❤️ Saved
                            </Link>
                        </div>
                    </div>

                    {/* Filters */}
                    <ProductFilters {...filters} />
                </div>
            </div>

            {/* Main Content */}
            <div className="mx-auto max-w-7xl px-6 py-12">
                {error && (
                    <div className="rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-8 shadow-xl mb-8">
                        <div className="text-lg font-black text-red-600 mb-2">Error</div>
                        <div className="text-sm font-semibold text-slate-700">{error}</div>
                    </div>
                )}

                {/* View Mode Toggle */}
                <div className="flex items-center justify-between mb-6">
                    <div className="text-sm font-bold text-slate-600">
                        <span className="text-2xl font-black text-slate-900">{products.length}</span> products found
                    </div>

                    <div className="flex gap-2 bg-white rounded-lg border-2 border-slate-200 p-1">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`
                                rounded-md px-3 py-2 text-sm font-bold transition-all flex items-center gap-2
                                ${viewMode === "grid"
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-600 hover:bg-slate-50"
                                }
                            `}
                        >
                            <Grid className="h-4 w-4" />
                            <span className="hidden sm:inline">Grid</span>
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={`
                                rounded-md px-3 py-2 text-sm font-bold transition-all flex items-center gap-2
                                ${viewMode === "list"
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-600 hover:bg-slate-50"
                                }
                            `}
                        >
                            <List className="h-4 w-4" />
                            <span className="hidden sm:inline">List</span>
                        </button>
                    </div>
                </div>

                {products.length > 0 ? (
                    <div
                        className={
                            viewMode === "grid"
                                ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                                : "grid gap-4"
                        }
                    >
                        {products.map((product: any, idx: number) => (
                            <div
                                key={product.id}
                                style={{
                                    animationDelay: `${idx * 0.03}s`,
                                }}
                            >
                                <ProductCard
                                    product={product}
                                    imp={imp}
                                    clickMeta={clickMeta}
                                    showSave={!!userId}
                                    initialSaved={savedSet.has(product.id)}
                                    toggleSaveAction={toggleSavedDropAction}
                                    onQuickView={setQuickViewProduct}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-16 shadow-xl text-center">
                        <div className="text-8xl mb-6 opacity-20">🔍</div>
                        <h3 className="text-2xl font-black text-slate-900 mb-3">
                            No Products Found
                        </h3>
                        <p className="text-base font-semibold text-slate-600 mb-6">
                            Try adjusting your filters or search terms
                        </p>
                        <Link
                            href="/products"
                            className="inline-block rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                        >
                            Clear All Filters
                        </Link>
                    </div>
                )}
            </div>

            {/* Quick View Modal */}
            {quickViewProduct && (
                <ProductQuickView
                    product={quickViewProduct}
                    onClose={() => setQuickViewProduct(null)}
                    imp={imp}
                />
            )}
        </div>
    );
}
