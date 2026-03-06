// app/luxury/LuxuryPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface Lane {
    id: string;
    lane_id: string;
    name_ja: string;
    name_en: string;
    description: string;
    color_primary: string;
    color_secondary: string;
    icon_emoji: string;
    keywords: string[];
}

interface UserProgress {
    totalSwipes: number;
    topLane: { lane_id: string; score: number } | null;
    canSeeResult?: boolean;
}

interface Props {
    lanes: Lane[];
    userProgress: UserProgress | null;
    isLoggedIn: boolean;
}

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/sns/profile", label: "Presence", icon: "🪞" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function LuxuryPageClient({ lanes, userProgress, isLoggedIn }: Props) {
    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-gray-800">
                                <span className="text-2xl">💎</span>
                                Luxury Lane
                            </h1>
                            <p className="text-xs text-gray-400">あなたの"系統"を診断</p>
                        </div>
                    </div>
                    {userProgress && userProgress.canSeeResult && (
                        <Link
                            href="/luxury/result"
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400/20 to-orange-400/20 border border-amber-400/40 text-amber-600 text-sm font-medium hover:from-amber-400/30 hover:to-orange-400/30 transition-all"
                        >
                            結果を見る
                        </Link>
                    )}
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32">
                {/* ヒーローセクション */}
                <FadeInView>
                    <div className="text-center mb-12">
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                rotate: [0, 5, -5, 0],
                            }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="text-7xl mb-6"
                        >
                            💎
                        </motion.div>
                        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600">
                                あなたのラグジュアリーを発見
                            </span>
                        </h2>
                        <p className="text-gray-500 max-w-xl mx-auto">
                            スワイプするだけで、あなたに似合う"ラグジュアリースタイルの系統"がわかります。
                            好みの画像をLike、そうでないものをDislikeして、診断を進めましょう。
                        </p>
                    </div>
                </FadeInView>

                {/* 進捗状況 */}
                {userProgress && userProgress.totalSwipes > 0 && (
                    <FadeInView delay={0.1}>
                        <GlassCard className="mb-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-400/10 via-transparent to-orange-400/10 pointer-events-none" />
                            <div className="p-6 flex items-center justify-between relative">
                                <div>
                                    <p className="text-sm text-gray-500">診断の進捗</p>
                                    <p className="text-2xl font-bold text-gray-800">
                                        {userProgress.totalSwipes} <span className="text-base font-normal text-gray-400">スワイプ</span>
                                    </p>
                                </div>
                                {userProgress.topLane && (
                                    <div className="text-right">
                                        <p className="text-sm text-gray-500">現在のトップ</p>
                                        <p className="text-lg font-semibold text-amber-600">
                                            {lanes.find(l => l.lane_id === userProgress.topLane?.lane_id)?.name_ja ?? "---"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}

                {/* スタートボタン */}
                <FadeInView delay={0.2}>
                    <div className="flex justify-center mb-12">
                        <Link href={isLoggedIn ? "/luxury/swipe" : "/login?next=/luxury/swipe"}>
                            <motion.button
                                className="px-12 py-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-lg shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                {userProgress && userProgress.totalSwipes > 0 ? "診断を続ける" : "診断を始める"}
                                <span className="ml-2">→</span>
                            </motion.button>
                        </Link>
                    </div>
                </FadeInView>

                {/* Lane一覧 */}
                <FadeInView delay={0.3}>
                    <h3 className="text-xl font-bold mb-6 text-center">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-700 to-gray-500">
                            10種類のラグジュアリー系統
                        </span>
                    </h3>
                </FadeInView>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lanes.map((lane, idx) => (
                        <FadeInView key={lane.lane_id} delay={0.3 + idx * 0.05}>
                            <GlassCard className="h-full hover:shadow-lg transition-all duration-300">
                                <div className="p-5 h-full">
                                    <div className="flex items-start gap-3 mb-3">
                                        <span className="text-3xl">{lane.icon_emoji}</span>
                                        <div>
                                            <h4 className="font-bold text-gray-800">{lane.name_ja}</h4>
                                            <p className="text-xs text-gray-400">{lane.name_en}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                                        {lane.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {lane.keywords?.slice(0, 3).map(keyword => (
                                            <span
                                                key={keyword}
                                                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                                style={{
                                                    backgroundColor: `${lane.color_primary}15`,
                                                    color: lane.color_primary,
                                                }}
                                            >
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>
                    ))}
                </div>

                {/* 説明セクション */}
                <FadeInView delay={0.8}>
                    <div className="mt-12 text-center">
                        <h3 className="text-lg font-semibold mb-4 text-gray-700">診断の仕組み</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                            {[
                                { icon: "👆", title: "スワイプ", desc: "画像を右(Like)か左(Dislike)にスワイプ" },
                                { icon: "📊", title: "学習", desc: "あなたの好みをAIが分析・学習" },
                                { icon: "💎", title: "診断", desc: "最も似合う系統と理由を提示" },
                            ].map((step, i) => (
                                <GlassCard key={i} className="p-4">
                                    <span className="text-2xl mb-2 block">{step.icon}</span>
                                    <h4 className="font-medium text-gray-700 mb-1">{step.title}</h4>
                                    <p className="text-xs text-gray-400">{step.desc}</p>
                                </GlassCard>
                            ))}
                        </div>
                    </div>
                </FadeInView>
            </main>

            {/* フローティングナビ */}
            <FloatingNavLight items={NAV_ITEMS} activeHref="/luxury" />
        </LightBackground>
    );
}
