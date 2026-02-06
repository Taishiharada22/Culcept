// components/seller/ProductSelectionGrid.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import BulkActionsBar from "./BulkActionsBar";

type Product = {
    id: string;
    title: string;
    price: number | null;
    cover_image_url: string | null;
    status: string | null;
    created_at: string;
};

type Props = {
    products: Product[];
};

export default function ProductSelectionGrid({ products }: Props) {
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === products.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(products.map((p) => p.id)));
        }
    };

    const selectedProducts = products.filter((p) => selectedIds.has(p.id));

    return (
        <>
            {/* Header with Select All */}
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-900">
                    My Products ({products.length})
                </h2>

                <button
                    onClick={toggleAll}
                    className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                >
                    {selectedIds.size === products.length ? "Deselect All" : "Select All"}
                </button>
            </div>

            {/* Product Grid */}
            {products.length === 0 ? (
                <div className="rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-16 text-center">
                    <div className="text-7xl mb-4 opacity-20">📦</div>
                    <h3 className="text-2xl font-black text-slate-900 mb-2">
                        No Products Yet
                    </h3>
                    <p className="text-base font-semibold text-slate-600 mb-6">
                        Start listing your first product
                    </p>
                    <Link
                        href="/drops/new"
                        className="inline-block rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg transition-all hover:shadow-xl hover:scale-105 no-underline"
                    >
                        + List Product
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => {
                        const isSelected = selectedIds.has(product.id);

                        return (
                            <div
                                key={product.id}
                                className={`relative rounded-xl border-2 bg-white transition-all ${isSelected
                                        ? "border-purple-400 shadow-lg"
                                        : "border-slate-200 hover:border-slate-300"
                                    }`}
                            >
                                {/* Selection Checkbox */}
                                <button
                                    onClick={() => toggleSelection(product.id)}
                                    className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-slate-300 bg-white shadow-md transition-all hover:scale-110"
                                >
                                    {isSelected && (
                                        <span className="text-lg text-purple-600">✓</span>
                                    )}
                                </button>

                                {/* Product Image */}
                                <Link href={`/drops/${product.id}`} className="block">
                                    {product.cover_image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={product.cover_image_url}
                                            alt={product.title}
                                            className="h-48 w-full rounded-t-xl object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-48 w-full items-center justify-center rounded-t-xl bg-slate-100 text-4xl opacity-20">
                                            📦
                                        </div>
                                    )}
                                </Link>

                                {/* Product Info */}
                                <div className="p-4">
                                    <Link
                                        href={`/drops/${product.id}`}
                                        className="block no-underline"
                                    >
                                        <h3 className="line-clamp-2 text-sm font-black text-slate-900 mb-2">
                                            {product.title}
                                        </h3>

                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-base font-black text-slate-900">
                                                ¥{(product.price || 0).toLocaleString()}
                                            </div>

                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs font-black ${product.status === "published"
                                                        ? "bg-teal-100 text-teal-700"
                                                        : "bg-slate-100 text-slate-600"
                                                    }`}
                                            >
                                                {product.status || "draft"}
                                            </span>
                                        </div>
                                    </Link>

                                    {/* Quick Actions */}
                                    <div className="mt-3 flex gap-2">
                                        <Link
                                            href={`/drops/${product.id}/edit`}
                                            className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-center text-xs font-black text-slate-700 transition-all hover:bg-slate-50 no-underline"
                                        >
                                            Edit
                                        </Link>
                                        <Link
                                            href={`/drops/${product.id}`}
                                            className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-center text-xs font-black text-slate-700 transition-all hover:bg-slate-50 no-underline"
                                        >
                                            View
                                        </Link>
                                        <Link
                                            href={`/shops/me/products/${product.id}/fit-color`}
                                            className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-center text-xs font-black text-slate-700 transition-all hover:bg-slate-50 no-underline"
                                        >
                                            Fit/Color
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bulk Actions Bar */}
            <BulkActionsBar
                selectedProducts={selectedProducts}
                onClearSelection={() => setSelectedIds(new Set())}
            />
        </>
    );
}
