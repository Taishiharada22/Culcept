// components/search/VisualSearch.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import type { VisualSearchResult } from "@/types/visual-search";

export default function VisualSearch() {
    const [image, setImage] = React.useState<File | null>(null);
    const [preview, setPreview] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [results, setResults] = React.useState<VisualSearchResult[]>([]);
    const [error, setError] = React.useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setError("Please select an image file");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError("Image must be under 10MB");
            return;
        }

        setImage(file);
        setError(null);

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSearch = async () => {
        if (!image) return;

        setLoading(true);
        setError(null);
        setResults([]);

        try {
            // Convert to base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = (e.target?.result as string).split(",")[1];

                const res = await fetch("/api/visual-search", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ image: base64 }),
                });

                const data = await res.json();

                if (!res.ok || !data.ok) {
                    throw new Error(data.error || "Visual search failed");
                }

                setResults(data.results || []);
            };
            reader.readAsDataURL(image);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-8 text-center shadow-sm">
                <div className="mb-6">
                    <h2 className="text-3xl font-black text-slate-900 mb-2">
                        🔍 Visual Search
                    </h2>
                    <p className="text-base font-semibold text-slate-600">
                        Upload an image to find similar products
                    </p>
                </div>

                {!preview ? (
                    <label className="inline-block cursor-pointer">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div className="rounded-2xl border-4 border-dashed border-purple-300 bg-purple-50 p-12 transition-all hover:border-purple-400 hover:bg-purple-100">
                            <div className="text-6xl mb-4 opacity-40">📸</div>
                            <div className="text-lg font-black text-slate-900 mb-2">
                                Click to Upload Image
                            </div>
                            <div className="text-sm font-semibold text-slate-600">
                                JPG, PNG, or GIF (max 10MB)
                            </div>
                        </div>
                    </label>
                ) : (
                    <div className="space-y-4">
                        {/* Preview */}
                        <div className="relative inline-block rounded-2xl overflow-hidden border-2 border-slate-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={preview}
                                alt="Preview"
                                className="max-h-64 max-w-full object-contain"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-8 py-3 text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50"
                            >
                                {loading ? "Searching..." : "Find Similar Products"}
                            </button>

                            <button
                                onClick={() => {
                                    setImage(null);
                                    setPreview(null);
                                    setResults([]);
                                    setError(null);
                                }}
                                className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-xl bg-red-50 border-2 border-red-200 p-4 text-sm font-bold text-red-700">
                        {error}
                    </div>
                )}
            </div>

            {/* Results */}
            {results.length > 0 && (
                <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900 mb-6">
                        Similar Products ({results.length})
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {results.map((result) => (
                            <Link
                                key={result.product_id}
                                href={`/drops/${result.product_id}`}
                                className="group block rounded-xl border-2 border-slate-200 bg-white overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1 hover:border-purple-300 no-underline"
                            >
                                {/* Similarity Badge */}
                                <div className="relative">
                                    {result.cover_image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={result.cover_image_url}
                                            alt={result.title}
                                            className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-110"
                                        />
                                    ) : (
                                        <div className="flex h-48 w-full items-center justify-center bg-slate-100 text-4xl opacity-20">
                                            📦
                                        </div>
                                    )}

                                    <div className="absolute top-2 right-2 rounded-full bg-purple-500 px-3 py-1 text-xs font-black text-white shadow-lg">
                                        {Math.round(result.similarity_score)}% Match
                                    </div>
                                </div>

                                {/* Product Info */}
                                <div className="p-4">
                                    <h4 className="line-clamp-2 text-sm font-black text-slate-900 mb-2 group-hover:text-purple-600">
                                        {result.title}
                                    </h4>

                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        {result.brand && (
                                            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                                {result.brand}
                                            </span>
                                        )}
                                        {result.price && (
                                            <span className="text-sm font-black text-slate-900">
                                                ¥{result.price.toLocaleString()}
                                            </span>
                                        )}
                                    </div>

                                    {/* Match Features */}
                                    {result.match_features.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {result.match_features.slice(0, 3).map((feature, idx) => (
                                                <span
                                                    key={idx}
                                                    className="rounded-full bg-purple-100 border border-purple-300 px-2 py-0.5 text-xs font-bold text-purple-700"
                                                >
                                                    {feature}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {loading && (
                <div className="rounded-2xl border-2 border-slate-200 bg-white p-16 text-center shadow-sm">
                    <div className="text-6xl mb-4 opacity-20">🔍</div>
                    <div className="text-lg font-black text-slate-900">
                        Analyzing image...
                    </div>
                </div>
            )}
        </div>
    );
}
