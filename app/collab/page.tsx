// app/collab/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CollabDrop {
    id: string;
    title: string;
    description: string;
    sellers: {
        id: string;
        name: string;
        avatar: string;
    }[];
    items: {
        id: string;
        image_url: string;
        name: string;
        price: number;
        seller_id: string;
    }[];
    startAt: string;
    endAt: string;
    status: "live" | "upcoming" | "ended";
    totalItems: number;
    soldItems: number;
}

export default function CollabPage() {
    const [drops, setDrops] = useState<CollabDrop[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "live" | "upcoming">("all");

    useEffect(() => {
        const fetchDrops = async () => {
            try {
                const res = await fetch("/api/collab/drops");
                const data = await res.json();
                setDrops(data.drops || []);
            } catch (error) {
                console.error("Failed to fetch drops:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchDrops();
    }, []);

    const filteredDrops = drops.filter((d) => {
        if (filter === "all") return true;
        return d.status === filter;
    });

    const liveCount = drops.filter((d) => d.status === "live").length;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white">
                <div className="text-center">
                    <div className="animate-bounce text-5xl mb-4">🤝</div>
                    <p className="text-slate-600">コラボを読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2">🤝 コラボドロップ</h1>
                    <p className="text-slate-600">
                        人気セラーたちの限定コラボレーション
                    </p>
                </div>

                {/* ライブバナー */}
                {liveCount > 0 && (
                    <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-4 mb-6 text-white">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
                                <span className="font-bold">LIVE</span>
                            </div>
                            <span>{liveCount}件のコラボドロップが開催中！</span>
                        </div>
                    </div>
                )}

                {/* フィルター */}
                <div className="flex justify-center gap-2 mb-8">
                    {(["all", "live", "upcoming"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-6 py-2 rounded-full font-medium transition-colors ${
                                filter === f
                                    ? "bg-pink-600 text-white"
                                    : "bg-white text-slate-600 border hover:bg-slate-50"
                            }`}
                        >
                            {f === "all" ? "すべて" : f === "live" ? "🔥 開催中" : "📅 予定"}
                        </button>
                    ))}
                </div>

                {/* コラボリスト */}
                <div className="space-y-6">
                    {filteredDrops.map((drop) => {
                        const progress = Math.round((drop.soldItems / drop.totalItems) * 100);
                        const timeLeft = new Date(drop.endAt).getTime() - Date.now();
                        const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));

                        return (
                            <Link
                                key={drop.id}
                                href={`/collab/${drop.id}`}
                                className="block bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition-shadow"
                            >
                                {/* セラーヘッダー */}
                                <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-4 text-white">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-3">
                                                {drop.sellers.map((seller) => (
                                                    <img
                                                        key={seller.id}
                                                        src={seller.avatar}
                                                        alt={seller.name}
                                                        className="w-10 h-10 rounded-full border-2 border-white"
                                                    />
                                                ))}
                                            </div>
                                            <div className="ml-2">
                                                <div className="font-bold">
                                                    {drop.sellers.map((s) => s.name).join(" × ")}
                                                </div>
                                                <div className="text-sm opacity-80">
                                                    {drop.sellers.length}人のセラーがコラボ
                                                </div>
                                            </div>
                                        </div>
                                        {drop.status === "live" && (
                                            <div className="flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full">
                                                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                                <span className="text-sm">残り{hoursLeft}時間</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* コンテンツ */}
                                <div className="p-4">
                                    <h2 className="font-bold text-xl mb-2">{drop.title}</h2>
                                    <p className="text-slate-600 text-sm mb-4">{drop.description}</p>

                                    {/* アイテムグリッド */}
                                    <div className="grid grid-cols-4 gap-2 mb-4">
                                        {drop.items.slice(0, 4).map((item) => (
                                            <div key={item.id} className="relative">
                                                <img
                                                    src={item.image_url}
                                                    alt={item.name}
                                                    className="w-full aspect-square object-cover rounded-xl"
                                                />
                                                <div className="absolute bottom-1 right-1 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                                                    ¥{item.price.toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 進捗 */}
                                    {drop.status === "live" && (
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-600">販売状況</span>
                                                <span className="font-bold text-pink-600">
                                                    {drop.soldItems}/{drop.totalItems}点
                                                </span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            {progress >= 80 && (
                                                <div className="mt-2 text-sm text-rose-600 font-medium">
                                                    🔥 残りわずか！
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {drop.status === "upcoming" && (
                                        <div className="text-center py-3 bg-slate-50 rounded-xl">
                                            <div className="text-sm text-slate-600">開始予定</div>
                                            <div className="font-bold">
                                                {new Date(drop.startAt).toLocaleDateString("ja-JP", {
                                                    month: "long",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* セラー向けCTA */}
                <div className="mt-12 bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-8 text-white text-center">
                    <h2 className="text-2xl font-bold mb-2">コラボドロップを企画しよう</h2>
                    <p className="opacity-90 mb-4">
                        他のセラーと協力して限定販売
                    </p>
                    <Link
                        href="/collab/create"
                        className="inline-block px-8 py-3 bg-white text-pink-600 rounded-xl font-bold hover:bg-pink-50 transition-colors"
                    >
                        コラボを企画する
                    </Link>
                </div>
            </div>
        </div>
    );
}
