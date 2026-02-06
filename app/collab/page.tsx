// app/collab/page.tsx
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
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 rounded-full border-4 border-pink-200 border-t-pink-500"
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
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">コラボドロップ</h1>
                            <p className="text-xs text-gray-400">限定コラボを見逃さない</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">DROP</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
                <FadeInView>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-400/15 via-transparent to-rose-400/15" />
                        <div className="relative p-8 text-center">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Collab Drops</h2>
                            <p className="text-gray-500">
                                人気セラーたちの限定コラボレーション
                            </p>
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* ライブバナー */}
                {liveCount > 0 && (
                    <FadeInView delay={0.05}>
                        <GlassCard className="mb-6 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-rose-500/20" />
                            <div className="relative p-4 flex items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-white/80 text-pink-600 text-sm font-semibold">
                                    <span className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-pulse" />
                                    LIVE
                                </div>
                                <span className="text-sm text-gray-600">{liveCount}件のコラボドロップが開催中！</span>
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}

                {/* フィルター */}
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                    {(["all", "live", "upcoming"] as const).map((f) => (
                        <GlassButton
                            key={f}
                            size="sm"
                            variant={filter === f ? "gradient" : "secondary"}
                            onClick={() => setFilter(f)}
                        >
                            {f === "all" ? "すべて" : f === "live" ? "🔥 開催中" : "📅 予定"}
                        </GlassButton>
                    ))}
                </div>

                {/* コラボリスト */}
                <div className="space-y-6">
                    {filteredDrops.map((drop, index) => {
                        const progress = Math.round((drop.soldItems / drop.totalItems) * 100);
                        const timeLeft = new Date(drop.endAt).getTime() - Date.now();
                        const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));

                        return (
                            <FadeInView key={drop.id} delay={0.05 * index}>
                                <Link href={`/collab/${drop.id}`} className="block">
                                    <GlassCard className="overflow-hidden hover:shadow-xl transition-shadow">
                                        <div className="absolute inset-0 bg-gradient-to-br from-pink-400/10 via-transparent to-rose-400/10" />
                                        <div className="relative">
                                            <div className="p-5 border-b border-white/70">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex -space-x-3">
                                                            {drop.sellers.map((seller) => (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    key={seller.id}
                                                                    src={seller.avatar}
                                                                    alt={seller.name}
                                                                    className="w-10 h-10 rounded-full border-2 border-white/80"
                                                                />
                                                            ))}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-800">
                                                                {drop.sellers.map((s) => s.name).join(" × ")}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {drop.sellers.length}人のセラーがコラボ
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {drop.status === "live" && (
                                                            <span className="px-3 py-1 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-600 text-xs font-semibold">
                                                                残り{hoursLeft}時間
                                                            </span>
                                                        )}
                                                        {drop.status === "upcoming" && (
                                                            <span className="px-3 py-1 rounded-full bg-slate-200/60 border border-slate-200 text-slate-600 text-xs font-semibold">
                                                                予定
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-5">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <GlassBadge variant="gradient" size="sm">
                                                        {drop.status === "live" ? "LIVE" : drop.status === "upcoming" ? "UPCOMING" : "ENDED"}
                                                    </GlassBadge>
                                                    <span className="text-xs text-gray-400">Collab Drop</span>
                                                </div>
                                                <h2 className="font-bold text-xl mb-2 text-gray-800">{drop.title}</h2>
                                                <p className="text-gray-500 text-sm mb-4">{drop.description}</p>

                                                <div className="grid grid-cols-4 gap-2 mb-4">
                                                    {drop.items.slice(0, 4).map((item) => (
                                                        <div key={item.id} className="relative rounded-xl overflow-hidden border border-white/70 bg-white/70">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={item.image_url}
                                                                alt={item.name}
                                                                className="w-full aspect-square object-cover"
                                                            />
                                                            <div className="absolute bottom-1 right-1 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                                                                ¥{item.price.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {drop.status === "live" && (
                                                    <div>
                                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                            <span>販売状況</span>
                                                            <span className="font-semibold text-pink-600">
                                                                {drop.soldItems}/{drop.totalItems}点
                                                            </span>
                                                        </div>
                                                        <div className="h-2 bg-white/70 rounded-full overflow-hidden border border-white/80">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"
                                                                style={{ width: `${progress}%` }}
                                                            />
                                                        </div>
                                                        {progress >= 80 && (
                                                            <div className="mt-2 text-xs text-rose-600 font-medium">
                                                                🔥 残りわずか！
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {drop.status === "upcoming" && (
                                                    <div className="text-center py-3 bg-white/70 rounded-xl border border-white/80">
                                                        <div className="text-xs text-gray-500">開始予定</div>
                                                        <div className="font-semibold text-gray-700 text-sm">
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
                                        </div>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        );
                    })}
                </div>

                {/* セラー向けCTA */}
                <FadeInView>
                    <GlassCard className="mt-12 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-rose-500/20" />
                        <div className="relative p-8 text-center">
                            <h2 className="text-2xl font-bold mb-2 text-gray-800">コラボドロップを企画しよう</h2>
                            <p className="text-gray-500 mb-4">
                                他のセラーと協力して限定販売
                            </p>
                            <GlassButton href="/collab/create" variant="gradient" size="lg">
                                コラボを企画する
                            </GlassButton>
                        </div>
                    </GlassCard>
                </FadeInView>
            </main>

            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: "🏠" },
                    { href: "/collab", label: "コラボ", icon: "🤝" },
                    { href: "/battle", label: "バトル", icon: "⚔️" },
                    { href: "/ranking", label: "ランキング", icon: "🏆" },
                    { href: "/my", label: "マイページ", icon: "👤" },
                ]}
                activeHref="/collab"
            />
            <div className="h-24" />
        </LightBackground>
    );
}
