// app/battle/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">コーデバトル</h1>
                            <p className="text-xs text-gray-400">投票でランキングを決める</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">BATTLE</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
                <FadeInView>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-400/15 via-transparent to-orange-400/15" />
                        <div className="relative p-8 text-center">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Style Battle Arena</h2>
                            <p className="text-gray-500">
                                あなたのスタイリングで勝負！投票で順位を決定
                            </p>
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* フィルター */}
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                    {(["all", "voting", "upcoming"] as const).map((f) => (
                        <GlassButton
                            key={f}
                            size="sm"
                            variant={filter === f ? "gradient" : "secondary"}
                            onClick={() => setFilter(f)}
                        >
                            {f === "all" ? "すべて" : f === "voting" ? `🔥 投票中 (${votingCount})` : "📅 予定"}
                        </GlassButton>
                    ))}
                </div>

                {/* バトルリスト */}
                <div className="space-y-6">
                    {filteredBattles.map((battle, index) => (
                        <FadeInView key={battle.id} delay={0.04 * index}>
                            <Link href={`/battle/${battle.id}`} className="block">
                                <GlassCard className="overflow-hidden hover:shadow-xl transition-shadow">
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-transparent to-orange-400/10" />
                                    <div className="relative p-5 border-b border-white/70">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                            <div>
                                                <div className="text-xs text-gray-400 mb-1">THEME</div>
                                                <h2 className="text-lg font-bold text-gray-800">{battle.theme}</h2>
                                            </div>
                                            <div className="text-right">
                                                {battle.status === "voting" ? (
                                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 text-xs font-semibold">
                                                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                                        投票受付中
                                                    </span>
                                                ) : battle.status === "upcoming" ? (
                                                    <div className="text-xs text-gray-500">
                                                        開始まで {new Date(battle.endAt).toLocaleDateString("ja-JP")}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-gray-400">終了</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="flex -space-x-3">
                                                {battle.entries.slice(0, 5).map((entry, i) => (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        key={i}
                                                        src={entry.user.avatar}
                                                        alt={entry.user.name}
                                                        className="w-10 h-10 rounded-full border-2 border-white/80"
                                                    />
                                                ))}
                                                {battle.participants > 5 && (
                                                    <div className="w-10 h-10 rounded-full bg-white/70 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-600">
                                                        +{battle.participants - 5}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-sm text-slate-500">
                                                {battle.participants}人が参加中
                                            </span>
                                        </div>

                                        {battle.status === "voting" && battle.entries.length >= 2 && (
                                            <div className="grid grid-cols-2 gap-3">
                                                {battle.entries.slice(0, 2).map((entry, i) => (
                                                    <div key={entry.id} className="relative">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={entry.image}
                                                            alt={entry.user.name}
                                                            className="w-full aspect-[3/4] object-cover rounded-xl border border-white/70"
                                                        />
                                                        <div className="absolute bottom-2 left-2 right-2 bg-white/70 backdrop-blur-sm rounded-lg p-2 flex items-center justify-between">
                                                            <span className="text-gray-700 text-xs font-medium">
                                                                {entry.user.name}
                                                            </span>
                                                            <span className="text-amber-600 text-xs font-bold">
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

                                        {battle.prize && (
                                            <div className="mt-4 p-3 bg-amber-50/70 rounded-xl border border-amber-100 flex items-center gap-2">
                                                <span className="text-xl">🏆</span>
                                                <span className="text-sm text-amber-800">
                                                    優勝賞品: {battle.prize}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </GlassCard>
                            </Link>
                        </FadeInView>
                    ))}
                </div>

                {/* エントリーCTA */}
                <FadeInView>
                    <GlassCard className="mt-12 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-orange-500/20" />
                        <div className="relative p-8 text-center">
                            <h2 className="text-2xl font-bold mb-2 text-gray-800">バトルに参加しよう！</h2>
                            <p className="text-gray-500 mb-4">
                                あなたのコーデで他のユーザーと対決
                            </p>
                            <GlassButton href="/battle/entry" variant="gradient" size="lg">
                                エントリーする
                            </GlassButton>
                        </div>
                    </GlassCard>
                </FadeInView>
            </main>

            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: "🏠" },
                    { href: "/battle", label: "バトル", icon: "⚔️" },
                    { href: "/ranking", label: "ランキング", icon: "🏆" },
                    { href: "/sns/profile", label: "Presence", icon: "🪞" },
                    { href: "/my", label: "マイページ", icon: "👤" },
                ]}
                activeHref="/battle"
            />
            <div className="h-24" />
        </LightBackground>
    );
}
