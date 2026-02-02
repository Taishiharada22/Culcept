// app/watchlist/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface WatchlistItem {
    id: string;
    card_id: string;
    image_url: string;
    title: string;
    current_price: number;
    target_price: number;
    original_price: number;
    price_dropped: boolean;
    drop_percentage: number;
    added_at: string;
    notified: boolean;
}

export default function WatchlistPage() {
    const [items, setItems] = useState<WatchlistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "dropped" | "watching">("all");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [targetPrice, setTargetPrice] = useState<number>(0);

    useEffect(() => {
        const fetchWatchlist = async () => {
            try {
                const res = await fetch("/api/watchlist");
                const data = await res.json();
                setItems(data.items || []);
            } catch (error) {
                console.error("Failed to fetch watchlist:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchWatchlist();
    }, []);

    const removeItem = async (id: string) => {
        try {
            await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
            setItems((prev) => prev.filter((item) => item.id !== id));
        } catch (error) {
            console.error("Failed to remove:", error);
        }
    };

    const updateTargetPrice = async (id: string, price: number) => {
        try {
            await fetch(`/api/watchlist/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target_price: price }),
            });
            setItems((prev) =>
                prev.map((item) =>
                    item.id === id
                        ? { ...item, target_price: price, price_dropped: item.current_price <= price }
                        : item
                )
            );
            setEditingId(null);
        } catch (error) {
            console.error("Failed to update:", error);
        }
    };

    const filteredItems = items.filter((item) => {
        if (filter === "dropped") return item.price_dropped;
        if (filter === "watching") return !item.price_dropped;
        return true;
    });

    const droppedCount = items.filter((i) => i.price_dropped).length;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50 to-white">
                <div className="text-center">
                    <div className="animate-pulse text-5xl mb-4">💰</div>
                    <p className="text-slate-600">読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center gap-4 mb-6">
                    <Link
                        href="/my"
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">ウォッチリスト</h1>
                        <p className="text-sm text-slate-600">値下げ時に通知を受け取る</p>
                    </div>
                </div>

                {/* 値下げ通知バナー */}
                {droppedCount > 0 && (
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-4 mb-6 text-white">
                        <div className="flex items-center gap-3">
                            <div className="text-3xl">🎉</div>
                            <div>
                                <div className="font-bold">{droppedCount}件が値下げ！</div>
                                <div className="text-sm opacity-90">今がお買い得です</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* フィルター */}
                <div className="flex gap-2 mb-6">
                    {(["all", "dropped", "watching"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-full font-medium transition-colors ${
                                filter === f
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white text-slate-600 border hover:bg-slate-50"
                            }`}
                        >
                            {f === "all"
                                ? `すべて (${items.length})`
                                : f === "dropped"
                                ? `🔥 値下げ (${droppedCount})`
                                : `👁 監視中 (${items.length - droppedCount})`}
                        </button>
                    ))}
                </div>

                {/* アイテムリスト */}
                {filteredItems.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border">
                        <div className="text-5xl mb-4">👀</div>
                        <p className="text-slate-600 mb-4">
                            {filter === "dropped"
                                ? "値下げ中のアイテムはありません"
                                : "ウォッチリストが空です"}
                        </p>
                        <Link
                            href="/"
                            className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium"
                        >
                            アイテムを探す
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                className={`bg-white rounded-2xl border overflow-hidden ${
                                    item.price_dropped ? "border-emerald-300 shadow-emerald-100 shadow-lg" : ""
                                }`}
                            >
                                <div className="flex gap-4 p-4">
                                    {/* 画像 */}
                                    <Link href={`/drops/${item.card_id}`} className="flex-shrink-0">
                                        <img
                                            src={item.image_url}
                                            alt={item.title}
                                            className="w-24 h-24 object-cover rounded-xl"
                                        />
                                    </Link>

                                    {/* 情報 */}
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/drops/${item.card_id}`}>
                                            <h3 className="font-medium line-clamp-1 hover:underline">
                                                {item.title}
                                            </h3>
                                        </Link>

                                        {/* 価格情報 */}
                                        <div className="mt-2">
                                            <div className="flex items-baseline gap-2">
                                                <span
                                                    className={`text-xl font-bold ${
                                                        item.price_dropped ? "text-emerald-600" : ""
                                                    }`}
                                                >
                                                    ¥{item.current_price.toLocaleString()}
                                                </span>
                                                {item.drop_percentage > 0 && (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-sm font-bold">
                                                        -{item.drop_percentage}%
                                                    </span>
                                                )}
                                            </div>
                                            {item.original_price > item.current_price && (
                                                <div className="text-sm text-slate-500 line-through">
                                                    ¥{item.original_price.toLocaleString()}
                                                </div>
                                            )}
                                        </div>

                                        {/* ターゲット価格 */}
                                        <div className="mt-2 flex items-center gap-2">
                                            {editingId === item.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={targetPrice}
                                                        onChange={(e) => setTargetPrice(Number(e.target.value))}
                                                        className="w-24 px-2 py-1 border rounded text-sm"
                                                        placeholder="目標価格"
                                                    />
                                                    <button
                                                        onClick={() => updateTargetPrice(item.id, targetPrice)}
                                                        className="px-2 py-1 bg-emerald-600 text-white rounded text-sm"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="px-2 py-1 text-slate-500 text-sm"
                                                    >
                                                        キャンセル
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-sm text-slate-500">
                                                        目標: ¥{item.target_price.toLocaleString()}
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(item.id);
                                                            setTargetPrice(item.target_price);
                                                        }}
                                                        className="text-sm text-emerald-600 hover:underline"
                                                    >
                                                        変更
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* アクション */}
                                    <div className="flex flex-col gap-2">
                                        {item.price_dropped && (
                                            <Link
                                                href={`/drops/${item.card_id}`}
                                                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                                            >
                                                購入
                                            </Link>
                                        )}
                                        <button
                                            onClick={() => removeItem(item.id)}
                                            className="p-2 text-slate-400 hover:text-red-500"
                                            title="削除"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* 進捗バー */}
                                <div className="px-4 pb-4">
                                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                        <span>目標まで</span>
                                        <span>
                                            {item.current_price <= item.target_price
                                                ? "達成！"
                                                : `あと¥${(item.current_price - item.target_price).toLocaleString()}`}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                item.price_dropped
                                                    ? "bg-emerald-500"
                                                    : "bg-slate-300"
                                            }`}
                                            style={{
                                                width: `${Math.min(100, (item.target_price / item.original_price) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 使い方 */}
                <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                    <h3 className="font-bold mb-2">💡 使い方</h3>
                    <ul className="text-sm text-emerald-800 space-y-1">
                        <li>• 商品詳細ページから「ウォッチリストに追加」</li>
                        <li>• 目標価格を設定すると、値下げ時に通知</li>
                        <li>• プッシュ通知を有効にすると、即座にお知らせ</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
