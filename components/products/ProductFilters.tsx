// components/products/ProductFilters.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

type FilterState = {
    q: string;
    shop: string;
    brand: string;
    size: string;
    condition: string;
    tags: string;
    minPrice: string;
    maxPrice: string;
    saleMode: string;
    hasImage: boolean;
    hasBuy: boolean;
    sort: string;
    mine: boolean;
};

const SORT_OPTIONS = [
    { value: "new", label: "Newest" },
    { value: "popular", label: "Popular" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
];

const SIZE_OPTIONS = ["S", "M", "L", "LL"];
const CONDITION_OPTIONS = ["almost_new", "good", "well", "damaged"];

export default function ProductFilters(initialFilters: Partial<FilterState>) {
    const router = useRouter();
    const sp = useSearchParams();

    const [showAdvanced, setShowAdvanced] = React.useState(false);
    const [filters, setFilters] = React.useState<FilterState>({
        q: initialFilters.q ?? "",
        shop: initialFilters.shop ?? "",
        brand: initialFilters.brand ?? "",
        size: initialFilters.size ?? "",
        condition: initialFilters.condition ?? "",
        tags: initialFilters.tags ?? "",
        minPrice: initialFilters.minPrice ?? "",
        maxPrice: initialFilters.maxPrice ?? "",
        saleMode: initialFilters.saleMode ?? "",
        hasImage: initialFilters.hasImage ?? false,
        hasBuy: initialFilters.hasBuy ?? false,
        sort: initialFilters.sort ?? "new",
        mine: initialFilters.mine ?? false,
    });

    const activeFilterCount = React.useMemo(() => {
        let count = 0;
        if (filters.brand) count++;
        if (filters.size) count++;
        if (filters.condition) count++;
        if (filters.tags) count++;
        if (filters.minPrice) count++;
        if (filters.maxPrice) count++;
        if (filters.saleMode) count++;
        if (filters.hasImage) count++;
        if (filters.hasBuy) count++;
        if (filters.mine) count++;
        return count;
    }, [filters]);

    const updateFilter = (key: keyof FilterState, value: string | boolean) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const applyFilters = () => {
        const qs = new URLSearchParams(sp?.toString() ?? "");

        // ✅ 完全修正版: 型安全な処理
        (Object.keys(filters) as Array<keyof FilterState>).forEach((key) => {
            const value = filters[key];

            // 空文字列またはfalseの場合は削除
            if (value === "" || value === false) {
                qs.delete(key);
                return;
            }

            // booleanの場合は "1" にセット
            if (typeof value === "boolean") {
                qs.set(key, "1");
                return;
            }

            // stringの場合はそのままセット
            qs.set(key, value);
        });

        qs.delete("page");
        router.push(`/products?${qs.toString()}`);
    };

    const resetFilters = () => {
        setFilters({
            q: "",
            shop: "",
            brand: "",
            size: "",
            condition: "",
            tags: "",
            minPrice: "",
            maxPrice: "",
            saleMode: "",
            hasImage: false,
            hasBuy: false,
            sort: "new",
            mine: false,
        });
        router.push("/products");
    };

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        value={filters.q}
                        onChange={(e) => updateFilter("q", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                        placeholder="Search products, brands, styles..."
                        className="w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-4 py-4 text-base font-semibold text-slate-900 transition-all duration-200 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                </div>

                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={`
                        relative rounded-xl border-2 px-6 py-4 text-sm font-black transition-all duration-200
                        ${showAdvanced
                            ? "border-orange-400 bg-orange-50 text-orange-600"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }
                    `}
                >
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5" />
                        <span className="hidden sm:inline">Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-black text-white">
                                {activeFilterCount}
                            </span>
                        )}
                    </div>
                </button>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
                <select
                    value={filters.sort}
                    onChange={(e) => {
                        const newSort = e.target.value;
                        updateFilter("sort", newSort);

                        // Auto-apply sort
                        const newFilters = { ...filters, sort: newSort };
                        const qs = new URLSearchParams();

                        // ✅ 完全修正版
                        (Object.keys(newFilters) as Array<keyof FilterState>).forEach((key) => {
                            const value = newFilters[key];

                            if (value === "" || value === false) {
                                return;
                            }

                            if (typeof value === "boolean") {
                                qs.set(key, "1");
                                return;
                            }

                            qs.set(key, value);
                        });

                        router.push(`/products?${qs.toString()}`);
                    }}
                    className="rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-all duration-200 hover:border-slate-300 focus:border-orange-400 focus:outline-none"
                >
                    {SORT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>

                {filters.mine && (
                    <button
                        onClick={() => updateFilter("mine", false)}
                        className="flex items-center gap-2 rounded-lg border-2 border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-700 transition-all hover:bg-purple-100"
                    >
                        My Products
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Advanced Filters */}
            {showAdvanced && (
                <div
                    className="rounded-2xl border-2 border-slate-200 bg-white p-6 space-y-6 shadow-lg"
                    style={{ animation: "slideDown 0.3s ease-out" }}
                >
                    <style jsx>{`
                        @keyframes slideDown {
                            from {
                                opacity: 0;
                                transform: translateY(-20px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                    `}</style>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {/* Brand */}
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                Brand
                            </label>
                            <input
                                type="text"
                                value={filters.brand}
                                onChange={(e) => updateFilter("brand", e.target.value)}
                                placeholder="e.g. Nike"
                                className="w-full rounded-lg border-2 border-slate-200 px-3 py-2.5 text-sm font-semibold transition-all focus:border-orange-400 focus:outline-none"
                            />
                        </div>

                        {/* Size */}
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                Size
                            </label>
                            <select
                                value={filters.size}
                                onChange={(e) => updateFilter("size", e.target.value)}
                                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold transition-all focus:border-orange-400 focus:outline-none"
                            >
                                <option value="">All Sizes</option>
                                {SIZE_OPTIONS.map(size => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>

                        {/* Condition */}
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                Condition
                            </label>
                            <select
                                value={filters.condition}
                                onChange={(e) => updateFilter("condition", e.target.value)}
                                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold transition-all focus:border-orange-400 focus:outline-none"
                            >
                                <option value="">All Conditions</option>
                                {CONDITION_OPTIONS.map(cond => (
                                    <option key={cond} value={cond}>{cond.replace("_", " ")}</option>
                                ))}
                            </select>
                        </div>

                        {/* Price Range */}
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                Min Price
                            </label>
                            <input
                                type="number"
                                value={filters.minPrice}
                                onChange={(e) => updateFilter("minPrice", e.target.value)}
                                placeholder="¥0"
                                className="w-full rounded-lg border-2 border-slate-200 px-3 py-2.5 text-sm font-semibold transition-all focus:border-orange-400 focus:outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                Max Price
                            </label>
                            <input
                                type="number"
                                value={filters.maxPrice}
                                onChange={(e) => updateFilter("maxPrice", e.target.value)}
                                placeholder="¥999,999"
                                className="w-full rounded-lg border-2 border-slate-200 px-3 py-2.5 text-sm font-semibold transition-all focus:border-orange-400 focus:outline-none"
                            />
                        </div>

                        {/* Tags */}
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                Tags
                            </label>
                            <input
                                type="text"
                                value={filters.tags}
                                onChange={(e) => updateFilter("tags", e.target.value)}
                                placeholder="vintage, streetwear"
                                className="w-full rounded-lg border-2 border-slate-200 px-3 py-2.5 text-sm font-semibold transition-all focus:border-orange-400 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.hasImage}
                                onChange={(e) => updateFilter("hasImage", e.target.checked)}
                                className="h-5 w-5 rounded border-slate-300 text-orange-500 focus:ring-2 focus:ring-orange-400"
                            />
                            <span className="text-sm font-bold text-slate-700">Has Images</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.hasBuy}
                                onChange={(e) => updateFilter("hasBuy", e.target.checked)}
                                className="h-5 w-5 rounded border-slate-300 text-orange-500 focus:ring-2 focus:ring-orange-400"
                            />
                            <span className="text-sm font-bold text-slate-700">Has Buy Link</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.mine}
                                onChange={(e) => updateFilter("mine", e.target.checked)}
                                className="h-5 w-5 rounded border-slate-300 text-purple-500 focus:ring-2 focus:ring-purple-400"
                            />
                            <span className="text-sm font-bold text-slate-700">My Products</span>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-slate-200">
                        <button
                            onClick={applyFilters}
                            className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-base font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105"
                        >
                            Apply Filters
                        </button>
                        <button
                            onClick={resetFilters}
                            className="rounded-xl border-2 border-slate-200 bg-white px-6 py-3 text-base font-black text-slate-700 transition-all duration-200 hover:bg-slate-50"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
