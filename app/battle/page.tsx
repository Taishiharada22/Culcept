// app/battle/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Battle {
    id: string;
    title: string;
    theme: string;
    status: "voting" | "upcoming" | "ended";
    endAt: string;
    participants: number;
    entries: {
        id: string;
        user: { name: string; avatar: string };
        image: string;
        votes: number;
    }[];
    prize?: string;
}

export default function BattleListPage() {
    const [battles, setBattles] = useState<Battle[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "voting" | "upcoming">("all");

    useEffect(() => {
        const fetchBattles = async () => {
            try {
                const res = await fetch("/api/battle/list");
                const data = await res.json();
                setBattles(data.battles || []);
            } catch (error) {
                console.error("Failed to fetch battles:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchBattles();
    }, []);

    const filteredBattles = battles.filter((b) => {
        if (filter === "all") return true;
        return b.status === filter;
    });

    const votingCount = battles.filter((b) => b.status === "voting").length;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-white">
                <div className="text-center">
                    <div className="animate-bounce text-5xl mb-4">⚔️</div>
                    <p className="text-slate-600">バトルを読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold mb-2">
                        ⚔️ コーデバトル
                    </h1>
                    <p className="text-slate-600">
                        あなたのスタイリングで勝負！投票で順位を決定
                    </p>
                </div>

                {/* フィルター */}
                <div className="flex justify-center gap-2 mb-8">
                    {(["all", "voting", "upcoming"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-6 py-2 rounded-full font-medium transition-colors ${
                                filter === f
                                    ? "bg-amber-600 text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-50 border"
                            }`}
                        >
                            {f === "all" ? "すべて" : f === "voting" ? `🔥 投票中 (${votingCount})` : "📅 予定"}
                        </button>
                    ))}
                </div>

                {/* バトルリスト */}
                <div className="space-y-6">
                    {filteredBattles.map((battle) => (
                        <Link
                            key={battle.id}
                            href={`/battle/${battle.id}`}
                            className="block bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-lg transition-shadow"
                        >
                            {/* バトルヘッダー */}
                            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm opacity-80">THEME</div>
                                        <h2 className="text-xl font-bold">{battle.theme}</h2>
                                    </div>
                                    <div className="text-right">
                                        {battle.status === "voting" ? (
                                            <div className="flex items-center gap-2">
                                                <span className="animate-pulse">🔥</span>
                                                <span className="font-bold">投票受付中</span>
                                            </div>
                                        ) : battle.status === "upcoming" ? (
                                            <div className="text-sm">
                                                <div>開始まで</div>
                                                <div className="font-bold">
                                                    {new Date(battle.endAt).toLocaleDateString("ja-JP")}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm opacity-80">終了</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* エントリープレビュー */}
                            <div className="p-4">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="flex -space-x-3">
                                        {battle.entries.slice(0, 5).map((entry, i) => (
                                            <img
                                                key={i}
                                                src={entry.user.avatar}
                                                alt={entry.user.name}
                                                className="w-10 h-10 rounded-full border-2 border-white"
                                            />
                                        ))}
                                        {battle.participants > 5 && (
                                            <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-600">
                                                +{battle.participants - 5}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-sm text-slate-600">
                                        {battle.participants}人が参加中
                                    </span>
                                </div>

                                {/* トップエントリー */}
                                {battle.status === "voting" && battle.entries.length >= 2 && (
                                    <div className="grid grid-cols-2 gap-3">
                                        {battle.entries.slice(0, 2).map((entry, i) => (
                                            <div key={entry.id} className="relative">
                                                <img
                                                    src={entry.image}
                                                    alt={entry.user.name}
                                                    className="w-full aspect-[3/4] object-cover rounded-xl"
                                                />
                                                <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg p-2 flex items-center justify-between">
                                                    <span className="text-white text-sm font-medium">
                                                        {entry.user.name}
                                                    </span>
                                                    <span className="text-amber-400 text-sm font-bold">
                                                        {entry.votes}票
                                                    </span>
                                                </div>
                                                {i === 0 && (
                                                    <div className="absolute top-2 left-2 px-2 py-1 bg-amber-500 text-white rounded-full text-xs font-bold">
                                                        👑 1位
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 賞品 */}
                                {battle.prize && (
                                    <div className="mt-4 p-3 bg-amber-50 rounded-xl flex items-center gap-2">
                                        <span className="text-xl">🏆</span>
                                        <span className="text-sm text-amber-800">
                                            優勝賞品: {battle.prize}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>

                {/* エントリーCTA */}
                <div className="mt-12 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-8 text-white text-center">
                    <h2 className="text-2xl font-bold mb-2">バトルに参加しよう！</h2>
                    <p className="opacity-90 mb-4">
                        あなたのコーデで他のユーザーと対決
                    </p>
                    <Link
                        href="/battle/entry"
                        className="inline-block px-8 py-3 bg-white text-amber-600 rounded-xl font-bold hover:bg-amber-50 transition-colors"
                    >
                        エントリーする
                    </Link>
                </div>
            </div>
        </div>
    );
}
