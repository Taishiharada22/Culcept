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
    { value: "new", label: "新着順", icon: "🆕" },
    { value: "popular", label: "人気順", icon: "🔥" },
    { value: "price_asc", label: "安い順", icon: "💰" },
    { value: "price_desc", label: "高い順", icon: "💎" },
];

/* ── Price Range Filter ── */
type PriceRange = "all" | "under5k" | "5k-20k" | "20k-50k" | "over50k";
const PRICE_RANGES: { value: PriceRange; label: string; min: number; max: number }[] = [
    { value: "all", label: "すべて", min: 0, max: Infinity },
    { value: "under5k", label: "~¥5,000", min: 0, max: 5000 },
    { value: "5k-20k", label: "¥5,000~¥20,000", min: 5000, max: 20000 },
    { value: "20k-50k", label: "¥20,000~¥50,000", min: 20000, max: 50000 },
    { value: "over50k", label: "¥50,000~", min: 50000, max: Infinity },
];

/* ── Category Filter ── */
type CategoryFilter = "all" | "tops" | "bottoms" | "outerwear" | "shoes" | "accessories";
const CATEGORIES: { value: CategoryFilter; label: string; icon: string }[] = [
    { value: "all", label: "すべて", icon: "🏷️" },
    { value: "tops", label: "トップス", icon: "👕" },
    { value: "bottoms", label: "ボトムス", icon: "👖" },
    { value: "outerwear", label: "アウター", icon: "🧥" },
    { value: "shoes", label: "シューズ", icon: "👟" },
    { value: "accessories", label: "小物", icon: "🧢" },
];

function inferCategory(product: any): string {
    const cat = String(product.category || product.item_type || "").toLowerCase();
    if (["tops", "top", "shirt", "tshirt", "blouse", "knit"].some((k) => cat.includes(k))) return "tops";
    if (["bottoms", "bottom", "pants", "jeans", "skirt", "shorts"].some((k) => cat.includes(k))) return "bottoms";
    if (["outer", "jacket", "coat", "hoodie", "cardigan"].some((k) => cat.includes(k))) return "outerwear";
    if (["shoes", "shoe", "sneaker", "boots", "sandal"].some((k) => cat.includes(k))) return "shoes";
    if (["accessory", "accessories", "hat", "bag", "belt", "watch", "scarf"].some((k) => cat.includes(k))) return "accessories";
    return "other";
}

/* ── Recently Viewed (localStorage) ── */
const RECENT_KEY = "culcept_recent_products_v1";
const MAX_RECENT = 10;

function loadRecent(): string[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    } catch {
        return [];
    }
}

function addRecent(id: string) {
    if (typeof window === "undefined") return;
    try {
        const list = loadRecent().filter((x) => x !== id);
        list.unshift(id);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch { /* ignore */ }
}

/* ── Compare ── */
const MAX_COMPARE = 3;

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
    const [priceRange, setPriceRange] = React.useState<PriceRange>("all");
    const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>("all");
    const [showFilters, setShowFilters] = React.useState(false);
    const [compareIds, setCompareIds] = React.useState<string[]>([]);
    const [showCompare, setShowCompare] = React.useState(false);
    const [recentIds, setRecentIds] = React.useState<string[]>([]);
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        setRecentIds(loadRecent());
    }, []);

    React.useEffect(() => {
        setSavedIds(new Set(savedSet));
    }, [savedSet]);

    /* ── Filtered Products ── */
    const filteredProducts = React.useMemo(() => {
        let items = [...products];
        if (priceRange !== "all") {
            const range = PRICE_RANGES.find((r) => r.value === priceRange);
            if (range) {
                items = items.filter((p) => {
                    const price = p.price || 0;
                    return price >= range.min && price < range.max;
                });
            }
        }
        if (categoryFilter !== "all") {
            items = items.filter((p) => inferCategory(p) === categoryFilter);
        }
        return items;
    }, [products, priceRange, categoryFilter]);

    /* ── Stats ── */
    const stats = React.useMemo(() => {
        const prices = products.map((p) => p.price || 0).filter((p) => p > 0);
        const avg = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
        const brands = new Set(products.map((p) => p.brand).filter(Boolean));
        return { total: products.length, avgPrice: avg, brandCount: brands.size, savedCount: savedIds.size };
    }, [products, savedIds]);

    /* ── Compare Items ── */
    const compareProducts = React.useMemo(() => {
        return compareIds.map((id) => products.find((p) => p.id === id)).filter(Boolean);
    }, [compareIds, products]);

    /* ── Recently Viewed Products ── */
    const recentProducts = React.useMemo(() => {
        if (!mounted) return [];
        return recentIds.map((id) => products.find((p) => p.id === id)).filter(Boolean).slice(0, 5);
    }, [recentIds, products, mounted]);

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

    const toggleCompare = (id: string) => {
        setCompareIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= MAX_COMPARE) return prev;
            return [...prev, id];
        });
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

    const handleProductClick = (id: string) => {
        addRecent(id);
        setRecentIds(loadRecent());
    };

    const activeFilterCount = (priceRange !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0);

    return (
        <LightBackground>
            <main className="pt-6 pb-32 px-4 sm:px-6 max-w-7xl mx-auto space-y-6">
                {/* ── ヘッダー ── */}
                <GlassCard variant="elevated" className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-slate-400">Product Explorer</div>
                            <h1 className="text-2xl font-bold text-slate-900">Products</h1>
                            <p className="text-xs text-slate-500">{filteredProducts.length.toLocaleString()} items</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {mounted && (
                                <div className="hidden sm:flex items-center gap-2 mr-2">
                                    <div className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200">
                                        <span className="text-[10px] font-bold text-violet-600">🏷️ {stats.brandCount}ブランド</span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                                        <span className="text-[10px] font-bold text-emerald-600">💰 平均 ¥{stats.avgPrice.toLocaleString()}</span>
                                    </div>
                                    {stats.savedCount > 0 && (
                                        <div className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200">
                                            <span className="text-[10px] font-bold text-rose-600">❤️ {stats.savedCount}件保存</span>
                                        </div>
                                    )}
                                </div>
                            )}

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

                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`relative p-2.5 rounded-xl border transition-all ${showFilters ? "bg-violet-50 border-violet-200 text-violet-600" : "bg-white/60 border-white/70 text-slate-500 hover:text-slate-700"}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                {activeFilterCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>

                            {compareIds.length > 0 && (
                                <motion.button
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    onClick={() => setShowCompare(true)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                                >
                                    <span className="text-xs">⚖️</span>
                                    <span className="text-xs font-bold">比較 ({compareIds.length})</span>
                                </motion.button>
                            )}

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
                            <GlassButton size="sm" variant="default" onClick={() => handleSearch(searchQuery)}>
                                Search
                            </GlassButton>
                        </div>
                    </div>

                    {/* ── フィルターパネル ── */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-500 mb-2">カテゴリ</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {CATEGORIES.map((cat) => (
                                                <button
                                                    key={cat.value}
                                                    onClick={() => setCategoryFilter(cat.value)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                        categoryFilter === cat.value
                                                            ? "bg-violet-500 text-white shadow-sm"
                                                            : "bg-white/70 text-slate-600 hover:bg-white border border-slate-200"
                                                    }`}
                                                >
                                                    {cat.icon} {cat.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] font-bold text-gray-500 mb-2">価格帯</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PRICE_RANGES.map((range) => (
                                                <button
                                                    key={range.value}
                                                    onClick={() => setPriceRange(range.value)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                        priceRange === range.value
                                                            ? "bg-emerald-500 text-white shadow-sm"
                                                            : "bg-white/70 text-slate-600 hover:bg-white border border-slate-200"
                                                    }`}
                                                >
                                                    {range.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {activeFilterCount > 0 && (
                                        <button
                                            onClick={() => { setPriceRange("all"); setCategoryFilter("all"); }}
                                            className="text-xs text-violet-500 hover:text-violet-700 font-medium underline"
                                        >
                                            フィルターをリセット
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </GlassCard>

                {/* ── ソート ── */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {SORT_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => handleSortChange(opt.value)}
                                className={`flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                                    currentSort === opt.value
                                        ? "bg-slate-900 text-white"
                                        : "bg-white/80 text-slate-600 hover:bg-white border border-slate-200"
                                }`}
                            >
                                <span className="text-xs">{opt.icon}</span>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {filteredProducts.length !== products.length && (
                        <span className="text-xs text-slate-400 font-medium shrink-0 ml-2">
                            {filteredProducts.length}/{products.length}件
                        </span>
                    )}
                </div>

                {/* ── 最近見た商品 ── */}
                {mounted && recentProducts.length > 0 && (
                    <FadeInView>
                        <GlassCard className="p-4">
                            <h2 className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1.5">
                                <span>🕐</span> 最近チェックした商品
                            </h2>
                            <div className="flex gap-3 overflow-x-auto pb-1">
                                {recentProducts.map((product: any) => (
                                    <Link
                                        key={product.id}
                                        href={`/drops/${product.id}`}
                                        className="flex-shrink-0 w-16 group"
                                    >
                                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-white/80 shadow-sm group-hover:shadow-md transition-shadow">
                                            {product.cover_image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={product.cover_image_url} alt={product.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-2xl">👕</div>
                                            )}
                                        </div>
                                        <p className="text-[9px] text-slate-500 truncate mt-1 text-center font-medium">
                                            {product.brand || product.title}
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}

                {/* ── エラー ── */}
                {error && (
                    <GlassCard variant="bordered" className="mb-6 border-red-200 bg-red-50/50">
                        <p className="text-red-600">{error}</p>
                    </GlassCard>
                )}

                {/* ── 商品グリッド ── */}
                {filteredProducts.length === 0 ? (
                    <div className="text-center py-20">
                        <span className="text-6xl mb-4 block">🔍</span>
                        <p className="text-xl font-semibold text-slate-700 mb-2">商品が見つかりません</p>
                        <p className="text-slate-500 mb-6">検索条件やフィルターを変更してみてください</p>
                        <div className="flex justify-center gap-3">
                            <GlassButton href="/products" variant="default">すべての商品を見る</GlassButton>
                            {activeFilterCount > 0 && (
                                <GlassButton variant="gradient" onClick={() => { setPriceRange("all"); setCategoryFilter("all"); }}>
                                    フィルターをリセット
                                </GlassButton>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className={`grid gap-4 ${viewMode === "large" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                        {filteredProducts.map((product, index) => (
                            <FadeInView key={product.id} delay={Math.min(index * 0.03, 0.2)}>
                                <GlassCard variant="elevated" padding="none" hoverEffect>
                                    <div className="relative group">
                                        <Link href={`/drops/${product.id}`} className="block" onClick={() => handleProductClick(product.id)}>
                                            <div className={`relative ${viewMode === "large" ? "aspect-[4/3]" : "aspect-square"} bg-slate-100 overflow-hidden rounded-t-3xl`}>
                                                {product.cover_image_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={product.cover_image_url} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center"><span className="text-5xl">👕</span></div>
                                                )}
                                                <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                                                    {product.condition === "new" && <GlassBadge variant="success" size="sm">新品</GlassBadge>}
                                                    {savedIds.has(product.id) && <GlassBadge variant="gradient" size="sm">❤️ 保存済</GlassBadge>}
                                                </div>
                                                {inferCategory(product) !== "other" && (
                                                    <div className="absolute bottom-2 left-2">
                                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-white/90 backdrop-blur-sm">
                                                            {CATEGORIES.find((c) => c.value === inferCategory(product))?.icon}{" "}
                                                            {CATEGORIES.find((c) => c.value === inferCategory(product))?.label}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </Link>

                                        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    void toggleSaved(product.id);
                                                }}
                                                className={`w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center transition-colors ${savedIds.has(product.id) ? "text-rose-500" : "text-slate-400 hover:text-rose-400"}`}
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
                                                    toggleCompare(product.id);
                                                }}
                                                className={`w-8 h-8 rounded-full backdrop-blur-sm shadow-lg flex items-center justify-center transition-colors text-xs font-bold ${
                                                    compareIds.includes(product.id)
                                                        ? "bg-amber-100 text-amber-700 border border-amber-300"
                                                        : "bg-white/90 text-slate-400 hover:text-amber-500"
                                                }`}
                                                aria-label="比較に追加"
                                                title="比較に追加"
                                            >
                                                ⚖️
                                            </button>
                                        </div>

                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setQuickViewProduct(product);
                                            }}
                                            className="absolute bottom-3 right-3 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Quick View
                                        </button>
                                    </div>

                                    <Link href={`/drops/${product.id}`} className="block" onClick={() => handleProductClick(product.id)}>
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

            {/* ── クイックビュー ── */}
            <AnimatePresence>
                {quickViewProduct && (
                    <GlassModal isOpen={!!quickViewProduct} onClose={() => setQuickViewProduct(null)} title={quickViewProduct.title} size="lg">
                        <ProductQuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
                    </GlassModal>
                )}
            </AnimatePresence>

            {/* ── 比較モーダル ── */}
            <AnimatePresence>
                {showCompare && compareProducts.length > 0 && (
                    <GlassModal isOpen={showCompare} onClose={() => setShowCompare(false)} title="商品を比較" size="lg">
                        <div className="p-4">
                            <div className={`grid gap-4 ${compareProducts.length === 1 ? "grid-cols-1" : compareProducts.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                                {compareProducts.map((product: any) => (
                                    <div key={product.id} className="text-center">
                                        <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 mb-3">
                                            {product.cover_image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={product.cover_image_url} alt={product.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-4xl">👕</div>
                                            )}
                                        </div>
                                        {product.brand && <p className="text-[10px] text-slate-400 font-medium">{product.brand}</p>}
                                        <p className="text-sm font-bold text-slate-800 truncate">{product.title}</p>
                                        <p className="text-lg font-black text-purple-600 mt-1">¥{(product.price || 0).toLocaleString()}</p>
                                        {product.size && <p className="text-xs text-slate-500 mt-1">サイズ: {product.size}</p>}
                                        {product.condition && <p className="text-xs text-slate-500">状態: {product.condition === "new" ? "新品" : "中古"}</p>}
                                        <button
                                            onClick={() => toggleCompare(product.id)}
                                            className="mt-2 text-[10px] text-rose-500 hover:text-rose-700 font-medium underline"
                                        >
                                            比較から外す
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {compareProducts.length >= 2 && (
                                <div className="mt-6 pt-4 border-t border-gray-100">
                                    <h3 className="text-xs font-bold text-gray-600 mb-3">価格比較</h3>
                                    <div className="space-y-2">
                                        {compareProducts
                                            .sort((a: any, b: any) => (a.price || 0) - (b.price || 0))
                                            .map((product: any, i: number) => {
                                                const maxPrice = Math.max(...compareProducts.map((p: any) => p.price || 0));
                                                const pct = maxPrice > 0 ? Math.max(10, ((product.price || 0) / maxPrice) * 100) : 10;
                                                return (
                                                    <div key={product.id} className="flex items-center gap-3">
                                                        <span className="text-xs text-slate-500 w-20 truncate shrink-0">{product.brand || product.title}</span>
                                                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${pct}%` }}
                                                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                                                className={`h-full rounded-full ${i === 0 ? "bg-gradient-to-r from-emerald-400 to-green-400" : "bg-gradient-to-r from-violet-400 to-purple-400"}`}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-700 w-20 text-right shrink-0">¥{(product.price || 0).toLocaleString()}</span>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </GlassModal>
                )}
            </AnimatePresence>

            {/* フローティングナビ */}
            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/products", label: "商品", icon: <span>👕</span>, active: true },
                    { href: "/sns/profile", label: "Presence", icon: <span>🪞</span> },
                    { href: "/social", label: "フィード", icon: <span>📱</span> },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}
