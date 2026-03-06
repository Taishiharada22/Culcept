// app/products/ProductsPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Product } from "@/types/product";
import ProductQuickView from "@/components/products/ProductQuickView";
import { toggleSavedDropAction } from "@/app/_actions/saved";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassBadge,
    GlassInput,
    GlassModal,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

type Props = {
    products: any[];
    error: string | null;
    savedSet: Set<string>;
    userId: string | null;
    imp: string;
    filters: Record<string, string>;
};

const SORT_OPTIONS = [
    { value: "new", label: "新着順" },
    { value: "popular", label: "人気順" },
    { value: "price_asc", label: "安い順" },
    { value: "price_desc", label: "高い順" },
];

export default function ProductsPageClient({
    products,
    error,
    savedSet,
    userId,
    imp,
    filters,
}: Props) {
    const [quickViewProduct, setQuickViewProduct] = React.useState<Product | null>(null);
    const [currentSort, setCurrentSort] = React.useState(filters.sort || "new");
    const [viewMode, setViewMode] = React.useState<"grid" | "large">("grid");
    const [searchQuery, setSearchQuery] = React.useState(filters.q || "");
    const [savedIds, setSavedIds] = React.useState<Set<string>>(savedSet);
    const [savingIds, setSavingIds] = React.useState<Set<string>>(new Set());

    React.useEffect(() => {
        setSavedIds(new Set(savedSet));
    }, [savedSet]);

    const toggleSaved = async (id: string) => {
        if (!userId || !toggleSavedDropAction) {
            window.location.href = "/login?next=/products";
            return;
        }
        if (savingIds.has(id)) return;

        setSavingIds((prev) => new Set(prev).add(id));
        const nextSaved = !savedIds.has(id);
        setSavedIds((prev) => {
            const updated = new Set(prev);
            if (nextSaved) updated.add(id);
            else updated.delete(id);
            return updated;
        });

        try {
            const res = await toggleSavedDropAction(id);
            if (!res?.ok) throw new Error(res?.error || "save failed");
        } catch {
            // rollback
            setSavedIds((prev) => {
                const updated = new Set(prev);
                if (nextSaved) updated.delete(id);
                else updated.add(id);
                return updated;
            });
        } finally {
            setSavingIds((prev) => {
                const updated = new Set(prev);
                updated.delete(id);
                return updated;
            });
        }
    };

    const handleSortChange = (sort: string) => {
        setCurrentSort(sort);
        const params = new URLSearchParams(window.location.search);
        params.set("sort", sort);
        window.location.href = `/products?${params.toString()}`;
    };

    const handleSearch = (value: string) => {
        const params = new URLSearchParams(window.location.search);
        if (value.trim()) {
            params.set("q", value);
        } else {
            params.delete("q");
        }
        window.location.href = `/products?${params.toString()}`;
    };

    return (
        <LightBackground>
            <main className="pt-6 pb-32 px-4 sm:px-6 max-w-7xl mx-auto space-y-6">
                <GlassCard variant="elevated" className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-slate-400">Product Explorer</div>
                            <h1 className="text-2xl font-bold text-slate-900">Products</h1>
                            <p className="text-xs text-slate-500">{products.length.toLocaleString()} items</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-white/60 border border-white/70">
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setViewMode("large")}
                                    className={`p-2 rounded-lg transition-all ${viewMode === "large" ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9H4.25A2.25 2.25 0 012 6.75v-2.5zm0 9A2.25 2.25 0 014.25 11h11.5A2.25 2.25 0 0118 13.25v2.5A2.25 2.25 0 0115.75 18H4.25A2.25 2.25 0 012 15.75v-2.5z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>

                            <Link
                                href="/me/saved"
                                className="w-10 h-10 rounded-xl bg-white/60 border border-white/70 hover:bg-rose-100 flex items-center justify-center text-rose-500 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                </svg>
                            </Link>

                            <GlassButton href="/drops/new" variant="gradient" size="sm" className="hidden sm:flex">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                出品
                            </GlassButton>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex-1">
                            <GlassInput
                                placeholder="ブランド、アイテム名で検索..."
                                value={searchQuery}
                                onChange={setSearchQuery}
                                onSubmit={handleSearch}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                }
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {filters.q && <GlassBadge variant="info">「{filters.q}」の検索結果</GlassBadge>}
                            <GlassButton size="sm" variant="secondary" onClick={() => handleSearch(searchQuery)}>
                                Search
                            </GlassButton>
                        </div>
                    </div>
                </GlassCard>
                {/* ソート */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {SORT_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => handleSortChange(opt.value)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                                    currentSort === opt.value
                                        ? "bg-slate-900 text-white"
                                        : "bg-white/80 text-slate-600 hover:bg-white border border-slate-200"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* エラー */}
                {error && (
                    <GlassCard variant="bordered" className="mb-6 border-red-200 bg-red-50/50">
                        <p className="text-red-600">{error}</p>
                    </GlassCard>
                )}

                {/* 商品グリッド */}
                {products.length === 0 ? (
                    <div className="text-center py-20">
                        <span className="text-6xl mb-4 block">🔍</span>
                        <p className="text-xl font-semibold text-slate-700 mb-2">商品が見つかりません</p>
                        <p className="text-slate-500 mb-6">検索条件を変更してみてください</p>
                        <GlassButton href="/products" variant="secondary">すべての商品を見る</GlassButton>
                    </div>
                ) : (
                    <div className={`grid gap-4 ${viewMode === "large" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                        {products.map((product, index) => (
                            <FadeInView key={product.id} delay={Math.min(index * 0.03, 0.2)}>
                                <GlassCard variant="elevated" padding="none" hoverEffect>
                                    <div className="relative">
                                        <Link href={`/drops/${product.id}`} className="block">
                                            <div className={`relative ${viewMode === "large" ? "aspect-[4/3]" : "aspect-square"} bg-slate-100 overflow-hidden rounded-t-3xl`}>
                                            {product.cover_image_url ? (
                                                <img src={product.cover_image_url} alt={product.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center"><span className="text-5xl">👕</span></div>
                                            )}
                                            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                                                {product.condition === "new" && <GlassBadge variant="success" size="sm">新品</GlassBadge>}
                                            </div>
                                            </div>
                                        </Link>

                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                void toggleSaved(product.id);
                                            }}
                                            className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center transition-colors ${savedIds.has(product.id) ? "text-rose-500" : "text-slate-400 hover:text-rose-400"}`}
                                            aria-label="Save product"
                                            disabled={savingIds.has(product.id)}
                                        >
                                            <svg className="w-4 h-4" fill={savedIds.has(product.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setQuickViewProduct(product);
                                            }}
                                            className="absolute bottom-3 right-3 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:bg-white"
                                        >
                                            Quick View
                                        </button>
                                    </div>

                                    <Link href={`/drops/${product.id}`} className="block">
                                        <div className="p-4">
                                            {product.brand && <p className="text-xs font-medium text-slate-500 mb-1">{product.brand}</p>}
                                            <h3 className="font-semibold text-slate-900 truncate">{product.title}</h3>
                                            <div className="flex items-center justify-between mt-2">
                                                <p className="text-lg font-bold text-purple-600">¥{(product.price || 0).toLocaleString()}</p>
                                                {product.size && <GlassBadge variant="default" size="sm">{product.size}</GlassBadge>}
                                            </div>
                                        </div>
                                    </Link>
                                </GlassCard>
                            </FadeInView>
                        ))}
                    </div>
                )}
            </main>

            {/* クイックビュー */}
            <AnimatePresence>
                {quickViewProduct && (
                    <GlassModal isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} title={quickViewProduct.title} size="lg">
                        <ProductQuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
                    </GlassModal>
                )}
            </AnimatePresence>

            {/* フローティングナビ */}
            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/products", label: "商品", icon: <span>👕</span>, active: true },
                    { href: "/social", label: "フィード", icon: <span>📱</span> },
                    { href: "/auction", label: "オークション", icon: <span>🔨</span> },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}
