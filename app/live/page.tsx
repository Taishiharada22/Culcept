// app/live/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LiveStream {
    id: string;
    title: string;
    host: {
        id: string;
        name: string;
        avatar: string;
    };
    thumbnail: string;
    viewers: number;
    status: "live" | "scheduled" | "ended";
    scheduledAt?: string;
    products: {
        id: string;
        image_url: string;
        name: string;
        price: number;
    }[];
    tags: string[];
}

export default function LiveListPage() {
    const [streams, setStreams] = useState<LiveStream[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "live" | "scheduled">("all");

    useEffect(() => {
        const fetchStreams = async () => {
            try {
                const res = await fetch("/api/live/streams");
                const data = await res.json();
                setStreams(data.streams || []);
            } catch (error) {
                console.error("Failed to fetch streams:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStreams();
    }, []);

    const filteredStreams = streams.filter((s) => {
        if (filter === "all") return true;
        return s.status === filter;
    });

    const liveCount = streams.filter((s) => s.status === "live").length;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-white">
                <div className="text-center">
                    <div className="animate-pulse text-5xl mb-4">📺</div>
                    <p className="text-slate-600">ライブ配信を読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-red-50 to-white">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <span className="text-red-500">●</span>
                            ライブショッピング
                        </h1>
                        <p className="text-slate-600 mt-1">
                            セラーのライブ配信でリアルタイム購入
                        </p>
                    </div>
                    {liveCount > 0 && (
                        <div className="px-4 py-2 bg-red-100 text-red-700 rounded-full font-bold animate-pulse">
                            {liveCount}件配信中
                        </div>
                    )}
                </div>

                {/* フィルター */}
                <div className="flex gap-2 mb-6">
                    {(["all", "live", "scheduled"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-full font-medium transition-colors ${
                                filter === f
                                    ? "bg-red-600 text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            {f === "all" ? "すべて" : f === "live" ? "🔴 配信中" : "📅 予定"}
                        </button>
                    ))}
                </div>

                {/* ストリームリスト */}
                {filteredStreams.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">📺</div>
                        <p className="text-slate-600">
                            {filter === "live"
                                ? "現在配信中のライブはありません"
                                : "配信予定はありません"}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredStreams.map((stream) => (
                            <Link
                                key={stream.id}
                                href={`/live/${stream.id}`}
                                className="group bg-white rounded-2xl overflow-hidden shadow-sm border hover:shadow-lg transition-shadow"
                            >
                                {/* サムネイル */}
                                <div className="relative aspect-video">
                                    <img
                                        src={stream.thumbnail}
                                        alt={stream.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                    {/* ステータスバッジ */}
                                    <div className="absolute top-3 left-3">
                                        {stream.status === "live" ? (
                                            <div className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-full text-sm font-bold">
                                                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                                LIVE
                                            </div>
                                        ) : (
                                            <div className="px-3 py-1 bg-slate-800/80 text-white rounded-full text-sm">
                                                {stream.scheduledAt
                                                    ? new Date(stream.scheduledAt).toLocaleString("ja-JP", {
                                                          month: "short",
                                                          day: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                      })
                                                    : "予定"}
                                            </div>
                                        )}
                                    </div>
                                    {/* 視聴者数 */}
                                    {stream.status === "live" && (
                                        <div className="absolute bottom-3 right-3 px-3 py-1 bg-black/60 text-white rounded-full text-sm">
                                            👁 {stream.viewers.toLocaleString()}
                                        </div>
                                    )}
                                </div>

                                {/* 情報 */}
                                <div className="p-4">
                                    <h3 className="font-bold text-lg line-clamp-1 mb-2">
                                        {stream.title}
                                    </h3>

                                    {/* ホスト情報 */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <img
                                            src={stream.host.avatar}
                                            alt={stream.host.name}
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                        <span className="text-sm text-slate-600">
                                            {stream.host.name}
                                        </span>
                                    </div>

                                    {/* 商品プレビュー */}
                                    {stream.products.length > 0 && (
                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                            {stream.products.slice(0, 4).map((product) => (
                                                <div
                                                    key={product.id}
                                                    className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden"
                                                >
                                                    <img
                                                        src={product.image_url}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            ))}
                                            {stream.products.length > 4 && (
                                                <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-sm text-slate-500">
                                                    +{stream.products.length - 4}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* タグ */}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {stream.tags.slice(0, 3).map((tag, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs"
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

                {/* セラー向けCTA */}
                <div className="mt-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl p-8 text-white text-center">
                    <h2 className="text-2xl font-bold mb-2">ライブ配信を始めよう！</h2>
                    <p className="opacity-90 mb-4">
                        あなたの商品をライブで紹介して、リアルタイムで販売
                    </p>
                    <Link
                        href="/live/start"
                        className="inline-block px-8 py-3 bg-white text-red-600 rounded-xl font-bold hover:bg-red-50 transition-colors"
                    >
                        配信を開始する
                    </Link>
                </div>
            </div>
        </div>
    );
}
