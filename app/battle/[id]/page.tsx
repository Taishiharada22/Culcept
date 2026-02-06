// app/battle/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { use } from "react";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

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
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 rounded-full border-4 border-amber-200 border-t-amber-500"
                    />
                </div>
            </LightBackground>
        );
    }

    const vsEntries = battle.entries.slice(vsIndex, vsIndex + 2);
    const rankedEntries = [...battle.entries].sort((a, b) => b.votes - a.votes);

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/battle"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <div className="text-xs text-amber-500 font-semibold">{battle.theme}</div>
                            <div className="text-lg font-bold text-gray-800">{battle.title}</div>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">VS</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
                <div className="flex justify-center mb-6">
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-white/70 border border-white/80 p-1">
                        <GlassButton
                            size="sm"
                            variant={viewMode === "versus" ? "gradient" : "ghost"}
                            onClick={() => setViewMode("versus")}
                        >
                            ⚔️ VS
                        </GlassButton>
                        <GlassButton
                            size="sm"
                            variant={viewMode === "ranking" ? "gradient" : "ghost"}
                            onClick={() => setViewMode("ranking")}
                        >
                            🏆 ランキング
                        </GlassButton>
                    </div>
                </div>

                {viewMode === "versus" ? (
                    <div className="relative">
                        {vsEntries.length >= 2 ? (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    {vsEntries.map((entry, i) => (
                                        <FadeInView key={entry.id} delay={0.05 * i}>
                                            <GlassCard className="overflow-hidden" onClick={() => setSelectedEntry(entry.id)}>
                                                <div className={`absolute inset-0 ${selectedEntry === entry.id ? "bg-amber-400/10" : ""}`} />
                                                <div className="relative">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={entry.image}
                                                        alt={entry.user.name}
                                                        className="w-full aspect-[3/4] object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                                                    <div className="absolute top-4 left-4">
                                                        <span className="px-3 py-1 rounded-full bg-white/70 border border-white/80 text-xs text-gray-700">
                                                            #{entry.rank}
                                                        </span>
                                                    </div>

                                                    <div className="absolute bottom-4 left-4 right-4">
                                                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={entry.user.avatar}
                                                                    alt={entry.user.name}
                                                                    className="w-8 h-8 rounded-full border border-white"
                                                                />
                                                                <span className="font-medium text-gray-800">{entry.user.name}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-amber-600 font-bold">
                                                                    {entry.votes}票
                                                                </span>
                                                                {!battle.myVote && (
                                                                    <GlassButton
                                                                        size="sm"
                                                                        variant="gradient"
                                                                        onClick={() => handleVote(entry.id)}
                                                                        disabled={voting}
                                                                    >
                                                                        投票
                                                                    </GlassButton>
                                                                )}
                                                                {battle.myVote === entry.id && (
                                                                    <span className="text-emerald-500 text-sm font-semibold">✓ 投票済み</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </GlassCard>
                                        </FadeInView>
                                    ))}
                                </div>

                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-2xl font-bold shadow-lg">
                                        VS
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <GlassButton variant="secondary" size="md" onClick={nextVs}>
                                        次のペアを見る →
                                    </GlassButton>
                                </div>
                            </>
                        ) : (
                            <GlassCard className="p-10 text-center">
                                <div className="text-5xl mb-4">⚠️</div>
                                <p className="text-gray-500">エントリーが不足しています</p>
                            </GlassCard>
                        )}
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto space-y-3">
                        {rankedEntries.map((entry, i) => (
                            <FadeInView key={entry.id} delay={0.03 * i}>
                                <GlassCard className="p-4 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-white/70 border border-white/80 flex items-center justify-center font-bold text-lg text-gray-700">
                                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                                    </div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={entry.image}
                                        alt={entry.user.name}
                                        className="w-20 h-20 object-cover rounded-xl border border-white/70"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={entry.user.avatar}
                                                alt={entry.user.name}
                                                className="w-6 h-6 rounded-full border border-white"
                                            />
                                            <span className="font-medium text-gray-800">{entry.user.name}</span>
                                        </div>
                                        <div className="text-amber-600 font-bold mt-1">{entry.votes}票</div>
                                    </div>
                                    {!battle.myVote ? (
                                        <GlassButton
                                            size="sm"
                                            variant="gradient"
                                            onClick={() => handleVote(entry.id)}
                                            disabled={voting}
                                        >
                                            投票
                                        </GlassButton>
                                    ) : battle.myVote === entry.id ? (
                                        <span className="text-emerald-500 text-sm font-semibold">✓</span>
                                    ) : null}
                                </GlassCard>
                            </FadeInView>
                        ))}
                    </div>
                )}

                {battle.prize && (
                    <FadeInView>
                        <GlassCard className="mt-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-400/20 to-orange-400/20" />
                            <div className="relative p-6 text-center">
                                <span className="text-4xl">🏆</span>
                                <h3 className="font-bold text-lg mt-2 text-gray-800">優勝賞品</h3>
                                <p className="text-amber-600 font-bold text-xl">{battle.prize}</p>
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}
            </main>

            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: "🏠" },
                    { href: "/battle", label: "バトル", icon: "⚔️" },
                    { href: "/ranking", label: "ランキング", icon: "🏆" },
                    { href: "/collab", label: "コラボ", icon: "🤝" },
                    { href: "/my", label: "マイページ", icon: "👤" },
                ]}
                activeHref="/battle"
            />
            <div className="h-24" />
        </LightBackground>
    );
}
