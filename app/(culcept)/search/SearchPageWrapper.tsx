// app/search/SearchPageWrapper.tsx
"use client";

import Link from "next/link";
import AISearchBar from "@/components/search/AISearchBar";
import ProductCard from "@/components/products/ProductCard";

interface SearchPageWrapperProps {
    query: string;
    products: any[];
    interpretation: any;
}

export default function SearchPageWrapper({
    query,
    products,
    interpretation,
}: SearchPageWrapperProps) {
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            {/* ヘッダー */}
            <header className="border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-3 mb-4">
                        <Link
                            href="/"
                            className="w-9 h-9 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-lg font-semibold">AI Search</h1>
                            <p className="text-xs text-white/40">自然言語で検索</p>
                        </div>
                    </div>

                    {/* 検索バー */}
                    <AISearchBar initialQuery={query} />
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
                {/* クエリ解釈 */}
                {interpretation && (
                    <div className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm">✨</span>
                            <span className="text-sm font-medium text-white/70">AIの解釈</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-white/[0.08] text-xs text-white/70">
                                {interpretation.intent}
                            </span>
                            {Object.entries(interpretation.extracted_filters || {}).map(([key, value]) => (
                                <span key={key} className="px-2.5 py-1 rounded-full bg-white/[0.05] text-xs text-white/50">
                                    {key}: {String(value)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 検索結果 */}
                {products.length > 0 ? (
                    <>
                        <div className="text-sm text-white/40 mb-4">
                            {products.length} 件の結果
                        </div>
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className="rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden hover:bg-white/[0.04] hover:border-white/10 transition-all"
                                >
                                    <ProductCard product={product} />
                                    {product.match_reason && (
                                        <div className="px-3 pb-3">
                                            <div className="text-xs text-white/40 flex items-center gap-1">
                                                <span>✓</span>
                                                <span>{product.match_reason}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                ) : query ? (
                    <div className="text-center py-20">
                        <div className="text-4xl mb-4 opacity-30">🔍</div>
                        <h3 className="text-lg font-medium text-white/80 mb-2">
                            「{query}」の検索結果がありません
                        </h3>
                        <p className="text-sm text-white/40 mb-6">
                            別のキーワードで試してみてください
                        </p>
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="text-4xl mb-4 opacity-30">✨</div>
                        <h3 className="text-lg font-medium text-white/80 mb-3">
                            自然な言葉で検索できます
                        </h3>
                        <p className="text-sm text-white/40 mb-6">
                            例えば...
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {[
                                "90年代のヴィンテージデニム",
                                "1万円以下のジャケット",
                                "春に着れる軽めのアウター",
                            ].map((example) => (
                                <Link
                                    key={example}
                                    href={`/search?q=${encodeURIComponent(example)}`}
                                    className="px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.08] text-sm text-white/60 hover:bg-white/10 hover:text-white transition-all"
                                >
                                    {example}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
