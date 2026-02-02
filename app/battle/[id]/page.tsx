// app/battle/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { use } from "react";

interface Entry {
    id: string;
    user: { id: string; name: string; avatar: string };
    image: string;
    items: { id: string; name: string; image_url: string }[];
    votes: number;
    rank: number;
}

interface BattleDetail {
    id: string;
    title: string;
    theme: string;
    description: string;
    status: "voting" | "upcoming" | "ended";
    startAt: string;
    endAt: string;
    entries: Entry[];
    myVote?: string;
    prize?: string;
}

export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [battle, setBattle] = useState<BattleDetail | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
    const [voting, setVoting] = useState(false);
    const [viewMode, setViewMode] = useState<"versus" | "ranking">("versus");
    const [vsIndex, setVsIndex] = useState(0);

    useEffect(() => {
        const fetchBattle = async () => {
            try {
                const res = await fetch(`/api/battle/${id}`);
                const data = await res.json();
                setBattle(data.battle);
            } catch (error) {
                console.error("Failed to fetch battle:", error);
            }
        };
        fetchBattle();
    }, [id]);

    const handleVote = async (entryId: string) => {
        if (voting || battle?.myVote) return;

        setVoting(true);
        try {
            const res = await fetch(`/api/battle/${id}/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entryId }),
            });

            if (res.ok) {
                setBattle((prev) => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        myVote: entryId,
                        entries: prev.entries.map((e) =>
                            e.id === entryId ? { ...e, votes: e.votes + 1 } : e
                        ),
                    };
                });
            }
        } catch (error) {
            console.error("Vote failed:", error);
        } finally {
            setVoting(false);
        }
    };

    const nextVs = () => {
        if (!battle) return;
        setVsIndex((prev) => (prev + 2) % battle.entries.length);
    };

    if (!battle) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="animate-spin text-4xl">⚔️</div>
            </div>
        );
    }

    const vsEntries = battle.entries.slice(vsIndex, vsIndex + 2);
    const rankedEntries = [...battle.entries].sort((a, b) => b.votes - a.votes);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-black text-white">
            {/* ヘッダー */}
            <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-sm border-b border-white/10">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <Link href="/battle" className="p-2 -ml-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div className="text-center">
                            <div className="text-sm text-amber-400">{battle.theme}</div>
                            <div className="font-bold">{battle.title}</div>
                        </div>
                        <div className="w-10" />
                    </div>
                </div>
            </div>

            {/* ビュー切り替え */}
            <div className="flex justify-center py-4">
                <div className="bg-white/10 rounded-xl p-1 flex">
                    <button
                        onClick={() => setViewMode("versus")}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                            viewMode === "versus" ? "bg-amber-500 text-white" : "text-white/60"
                        }`}
                    >
                        ⚔️ VS
                    </button>
                    <button
                        onClick={() => setViewMode("ranking")}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                            viewMode === "ranking" ? "bg-amber-500 text-white" : "text-white/60"
                        }`}
                    >
                        🏆 ランキング
                    </button>
                </div>
            </div>

            {viewMode === "versus" ? (
                /* VS モード */
                <div className="max-w-4xl mx-auto px-4 py-6">
                    {vsEntries.length >= 2 ? (
                        <>
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                {vsEntries.map((entry, i) => (
                                    <div key={entry.id} className="relative">
                                        <div
                                            className={`rounded-2xl overflow-hidden border-4 transition-all ${
                                                selectedEntry === entry.id
                                                    ? "border-amber-500 scale-105"
                                                    : battle.myVote === entry.id
                                                    ? "border-green-500"
                                                    : "border-transparent"
                                            }`}
                                        >
                                            <img
                                                src={entry.image}
                                                alt={entry.user.name}
                                                className="w-full aspect-[3/4] object-cover"
                                            />
                                        </div>

                                        {/* ユーザー情報 */}
                                        <div className="absolute bottom-4 left-4 right-4">
                                            <div className="bg-black/70 backdrop-blur-sm rounded-xl p-3">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <img
                                                        src={entry.user.avatar}
                                                        alt={entry.user.name}
                                                        className="w-8 h-8 rounded-full"
                                                    />
                                                    <span className="font-medium">{entry.user.name}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-amber-400 font-bold">
                                                        {entry.votes}票
                                                    </span>
                                                    {!battle.myVote && (
                                                        <button
                                                            onClick={() => handleVote(entry.id)}
                                                            disabled={voting}
                                                            className="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 disabled:opacity-50"
                                                        >
                                                            投票
                                                        </button>
                                                    )}
                                                    {battle.myVote === entry.id && (
                                                        <span className="text-green-400 text-sm">✓ 投票済み</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ランク表示 */}
                                        <div className={`absolute top-4 ${i === 0 ? "left-4" : "right-4"}`}>
                                            <div className="px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-sm">
                                                #{entry.rank}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* VS アイコン */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg">
                                    VS
                                </div>
                            </div>

                            {/* 次のペアへ */}
                            <button
                                onClick={nextVs}
                                className="w-full py-4 bg-white/10 rounded-xl font-medium hover:bg-white/20 transition-colors"
                            >
                                次のペアを見る →
                            </button>
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-white/60">エントリーが不足しています</p>
                        </div>
                    )}
                </div>
            ) : (
                /* ランキングモード */
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                    {rankedEntries.map((entry, i) => (
                        <div
                            key={entry.id}
                            className={`flex items-center gap-4 p-4 rounded-2xl ${
                                i === 0
                                    ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/50"
                                    : i === 1
                                    ? "bg-gradient-to-r from-slate-400/20 to-gray-400/20 border border-slate-400/50"
                                    : i === 2
                                    ? "bg-gradient-to-r from-orange-700/20 to-amber-700/20 border border-orange-700/50"
                                    : "bg-white/5"
                            }`}
                        >
                            {/* ランク */}
                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl">
                                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                            </div>

                            {/* 画像 */}
                            <img
                                src={entry.image}
                                alt={entry.user.name}
                                className="w-20 h-20 object-cover rounded-xl"
                            />

                            {/* 情報 */}
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <img
                                        src={entry.user.avatar}
                                        alt={entry.user.name}
                                        className="w-6 h-6 rounded-full"
                                    />
                                    <span className="font-medium">{entry.user.name}</span>
                                </div>
                                <div className="text-amber-400 font-bold mt-1">
                                    {entry.votes}票
                                </div>
                            </div>

                            {/* 投票ボタン */}
                            {!battle.myVote ? (
                                <button
                                    onClick={() => handleVote(entry.id)}
                                    disabled={voting}
                                    className="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 disabled:opacity-50"
                                >
                                    投票
                                </button>
                            ) : battle.myVote === entry.id ? (
                                <span className="text-green-400 text-sm">✓</span>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            {/* 賞品情報 */}
            {battle.prize && (
                <div className="max-w-2xl mx-auto px-4 py-6">
                    <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-2xl p-6 text-center">
                        <span className="text-4xl">🏆</span>
                        <h3 className="font-bold text-lg mt-2">優勝賞品</h3>
                        <p className="text-amber-400 font-bold text-xl">{battle.prize}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
