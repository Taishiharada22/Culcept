// components/seller/BulkActionsBar.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Product = {
    id: string;
    title: string;
    price: number | null;
};

type Props = {
    selectedProducts: Product[];
    onClearSelection: () => void;
};

export default function BulkActionsBar({ selectedProducts, onClearSelection }: Props) {
    const router = useRouter();
    const [showPriceModal, setShowPriceModal] = React.useState(false);
    const [showTagsModal, setShowTagsModal] = React.useState(false);
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const count = selectedProducts.length;

    if (count === 0) return null;

    const handleBulkAction = async (action: string, payload?: any) => {
        if (!confirm(`Are you sure you want to ${action} ${count} products?`)) {
            return;
        }

        setPending(true);
        setError(null);

        try {
            const res = await fetch("/api/bulk-actions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action,
                    product_ids: selectedProducts.map((p) => p.id),
                    payload,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Bulk action failed");
            }

            alert(`Success! ${data.processed} products ${action}ed`);
            onClearSelection();
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPending(false);
        }
    };

    return (
        <>
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl border-2 border-slate-300 bg-white shadow-2xl p-4 min-w-[600px]">
                <div className="flex items-center justify-between gap-4">
                    {/* Info */}
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-lg font-black text-white">
                            {count}
                        </div>
                        <span className="text-sm font-black text-slate-900">
                            {count} {count === 1 ? "product" : "products"} selected
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleBulkAction("publish")}
                            disabled={pending}
                            className="rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-black text-white transition-all hover:shadow-md disabled:opacity-50"
                        >
                            ✓ Publish
                        </button>

                        <button
                            onClick={() => handleBulkAction("unpublish")}
                            disabled={pending}
                            className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                        >
                            ⊗ Unpublish
                        </button>

                        <button
                            onClick={() => setShowPriceModal(true)}
                            disabled={pending}
                            className="rounded-lg border-2 border-orange-300 bg-orange-50 px-4 py-2 text-xs font-black text-orange-700 transition-all hover:bg-orange-100 disabled:opacity-50"
                        >
                            💰 Update Price
                        </button>

                        <button
                            onClick={() => setShowTagsModal(true)}
                            disabled={pending}
                            className="rounded-lg border-2 border-purple-300 bg-purple-50 px-4 py-2 text-xs font-black text-purple-700 transition-all hover:bg-purple-100 disabled:opacity-50"
                        >
                            🏷️ Edit Tags
                        </button>

                        <button
                            onClick={() => handleBulkAction("delete")}
                            disabled={pending}
                            className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition-all hover:bg-red-100 disabled:opacity-50"
                        >
                            🗑️ Delete
                        </button>

                        <button
                            onClick={onClearSelection}
                            disabled={pending}
                            className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                        >
                            ✕ Clear
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2 text-xs font-bold text-red-700">
                        {error}
                    </div>
                )}

                {pending && (
                    <div className="mt-3 text-center text-xs font-bold text-slate-600">
                        Processing...
                    </div>
                )}
            </div>

            {/* Price Update Modal */}
            {showPriceModal && (
                <PriceUpdateModal
                    selectedCount={count}
                    onConfirm={(type, value) => {
                        handleBulkAction("update_price", { type, value });
                        setShowPriceModal(false);
                    }}
                    onClose={() => setShowPriceModal(false)}
                />
            )}

            {/* Tags Update Modal */}
            {showTagsModal && (
                <TagsUpdateModal
                    selectedCount={count}
                    onConfirm={(action, tags) => {
                        handleBulkAction("update_tags", { action, tags });
                        setShowTagsModal(false);
                    }}
                    onClose={() => setShowTagsModal(false)}
                />
            )}
        </>
    );
}

function PriceUpdateModal({
    selectedCount,
    onConfirm,
    onClose,
}: {
    selectedCount: number;
    onConfirm: (type: "fixed" | "percentage", value: number) => void;
    onClose: () => void;
}) {
    const [type, setType] = React.useState<"fixed" | "percentage">("percentage");
    const [value, setValue] = React.useState("");

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-2xl">
                <h2 className="text-2xl font-black text-slate-900 mb-4">
                    Update Prices
                </h2>

                <p className="text-sm font-semibold text-slate-600 mb-6">
                    Update prices for {selectedCount} products
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-black text-slate-900 mb-2">
                            Update Type
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setType("percentage")}
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-black transition-all ${type === "percentage"
                                        ? "bg-orange-500 text-white"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                            >
                                Percentage
                            </button>
                            <button
                                onClick={() => setType("fixed")}
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-black transition-all ${type === "fixed"
                                        ? "bg-orange-500 text-white"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                            >
                                Fixed Amount
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-black text-slate-900 mb-2">
                            {type === "percentage" ? "Percentage Change" : "Set Price To"}
                        </label>
                        <div className="flex items-center gap-2">
                            {type === "percentage" && (
                                <span className="text-lg font-black text-slate-700">±</span>
                            )}
                            <input
                                type="number"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={type === "percentage" ? "e.g., -10 for 10% off" : "e.g., 5000"}
                                className="flex-1 rounded-lg border-2 border-slate-200 px-4 py-2 text-sm font-semibold focus:border-orange-400 focus:outline-none"
                            />
                            {type === "percentage" && <span className="text-lg font-black text-slate-700">%</span>}
                            {type === "fixed" && <span className="text-lg font-black text-slate-700">¥</span>}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                            {type === "percentage"
                                ? "Use negative for discount (e.g., -10)"
                                : "All selected products will be set to this price"}
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => {
                                const num = Number(value);
                                if (Number.isFinite(num)) {
                                    onConfirm(type, num);
                                }
                            }}
                            className="flex-1 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-sm font-black text-white transition-all hover:shadow-lg"
                        >
                            Update Prices
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TagsUpdateModal({
    selectedCount,
    onConfirm,
    onClose,
}: {
    selectedCount: number;
    onConfirm: (action: "add" | "remove" | "replace", tags: string[]) => void;
    onClose: () => void;
}) {
    const [action, setAction] = React.useState<"add" | "remove" | "replace">("add");
    const [tagInput, setTagInput] = React.useState("");
    const [tags, setTags] = React.useState<string[]>([]);

    const addTag = () => {
        const tag = tagInput.trim().toLowerCase();
        if (tag && !tags.includes(tag)) {
            setTags([...tags, tag]);
            setTagInput("");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-2xl">
                <h2 className="text-2xl font-black text-slate-900 mb-4">
                    Edit Tags
                </h2>

                <p className="text-sm font-semibold text-slate-600 mb-6">
                    Update tags for {selectedCount} products
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-black text-slate-900 mb-2">
                            Action
                        </label>
                        <div className="flex gap-2">
                            {(["add", "remove", "replace"] as const).map((a) => (
                                <button
                                    key={a}
                                    onClick={() => setAction(a)}
                                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-black transition-all ${action === a
                                            ? "bg-purple-500 text-white"
                                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                        }`}
                                >
                                    {a.charAt(0).toUpperCase() + a.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-black text-slate-900 mb-2">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                                placeholder="Enter tag and press Enter"
                                className="flex-1 rounded-lg border-2 border-slate-200 px-4 py-2 text-sm font-semibold focus:border-purple-400 focus:outline-none"
                            />
                            <button
                                onClick={addTag}
                                className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-black text-white transition-all hover:bg-purple-600"
                            >
                                Add
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                                <button
                                    key={tag}
                                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                                    className="rounded-full border-2 border-purple-300 bg-purple-50 px-3 py-1 text-xs font-black text-purple-700 transition-all hover:bg-purple-100"
                                >
                                    {tag} ✕
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => tags.length > 0 && onConfirm(action, tags)}
                            disabled={tags.length === 0}
                            className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3 text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50"
                        >
                            Update Tags
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
