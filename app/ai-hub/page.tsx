// app/ai-hub/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface StyleSummary {
    topStyle: string;
    styleScore: number;
    fashionAge: number;
    personalColorSeason?: string;
    bodyType?: string;
    likeRate: number;
    totalSwipes: number;
}

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/sns/profile", label: "Presence", icon: "🪞" },
    { href: "/ai-hub", label: "AI Hub", icon: "🧠" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

const STYLE_ICONS: Record<string, string> = {
    casual: "👕",
    formal: "👔",
    street: "🧢",
    minimal: "⬜",
    vintage: "🎸",
    sporty: "🏃",
    smart: "👞",
    romantic: "💕",
    edgy: "🔥",
};

const PERSONAL_COLOR_DATA: Record<string, { icon: string; gradient: string; name: string }> = {
    spring: { icon: "🌸", gradient: "from-yellow-400 to-orange-400", name: "Spring" },
    summer: { icon: "🌊", gradient: "from-blue-400 to-purple-400", name: "Summer" },
    autumn: { icon: "🍂", gradient: "from-orange-500 to-amber-600", name: "Autumn" },
    winter: { icon: "❄️", gradient: "from-blue-600 to-indigo-700", name: "Winter" },
};

const AI_FEATURES = [
    {
        id: "stylist",
        name: "AI Stylist",
        nameJp: "AIスタイリスト",
        description: "チャットでコーデ相談",
        icon: "🤖",
        href: "/stylist",
        gradient: "from-violet-500 to-indigo-500",
        features: ["シーン別", "予算設定", "天気対応"],
    },
    {
        id: "profile",
        name: "Style DNA",
        nameJp: "スタイル分析",
        description: "あなたの好みを解析",
        icon: "🧬",
        href: "/style-profile",
        gradient: "from-cyan-500 to-blue-500",
        features: ["パーソナルカラー", "骨格診断", "進化追跡"],
    },
    {
        id: "coordinate",
        name: "Coordinate Lab",
        nameJp: "コーディネート",
        description: "完璧なコーデを生成",
        icon: "✨",
        href: "/coordinate",
        gradient: "from-rose-500 to-pink-500",
        features: ["シーン別", "完全セット", "価格計算"],
    },
    {
        id: "body-color",
        name: "Body/Color Lab",
        nameJp: "骨格・カラー研究",
        description: "CFV/CPVを保存",
        icon: "🧪",
        href: "/body-color",
        gradient: "from-emerald-500 to-cyan-500",
        features: ["骨格CFV", "ΔE色差", "Fit/Color"],
    },
];

const QUICK_PROMPTS = [
    { text: "デートコーデ", emoji: "💕", color: "rose" },
    { text: "オフィス", emoji: "💼", color: "blue" },
    { text: "1万円以内", emoji: "💰", color: "emerald" },
    { text: "ストリート", emoji: "🧢", color: "orange" },
];

export default function AIHubPage() {
    const [summary, setSummary] = useState<StyleSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const res = await fetch("/api/style-profile");
                const data = await res.json();

                if (data.profile) {
                    setSummary({
                        topStyle: data.profile.dominantStyles[0]?.style || "casual",
                        styleScore: data.profile.dominantStyles[0]?.score || 0,
                        fashionAge: data.profile.fashionAge || 28,
                        personalColorSeason: data.profile.personalColor?.season,
                        bodyType: data.profile.bodyType?.type,
                        likeRate: data.history?.likeRate || 0,
                        totalSwipes: data.history?.total || 0,
                    });
                }
            } catch (error) {
                console.error("Failed to fetch summary:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, []);

    const personalColor = summary?.personalColorSeason
        ? PERSONAL_COLOR_DATA[summary.personalColorSeason]
        : null;

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/my"
                                className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-gray-800">AI Fashion Hub</h1>
                                <p className="text-xs text-gray-400">Your personal style intelligence</p>
                            </div>
                        </div>
                        <motion.div
                            animate={{
                                boxShadow: [
                                    "0 0 20px rgba(139,92,246,0.2)",
                                    "0 0 40px rgba(139,92,246,0.3)",
                                    "0 0 20px rgba(139,92,246,0.2)",
                                ],
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg"
                        >
                            <span className="text-2xl">🧠</span>
                        </motion.div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-40">
                {/* Style Summary Card */}
                <FadeInView>
                    {loading ? (
                        <div className="h-48 rounded-3xl bg-white/50 animate-pulse" />
                    ) : summary ? (
                        <GlassCard variant="gradient" padding="none" className="overflow-hidden mb-8">
                            <div className="relative p-6 sm:p-8">
                                {/* 背景グラデーション */}
                                <div className="absolute inset-0 bg-gradient-to-r from-violet-400/10 via-transparent to-pink-400/10" />

                                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    {/* Left: Style info */}
                                    <div className="flex items-center gap-4">
                                        <motion.div
                                            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-400/20 to-pink-400/20 backdrop-blur-sm flex items-center justify-center text-5xl shadow-lg"
                                            whileHover={{ scale: 1.1, rotate: 5 }}
                                        >
                                            {STYLE_ICONS[summary.topStyle] || "✨"}
                                        </motion.div>
                                        <div>
                                            <p className="text-gray-500 text-sm">Your Style</p>
                                            <h2 className="text-3xl font-black capitalize bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                                                {summary.topStyle}
                                            </h2>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${summary.styleScore}%` }}
                                                        transition={{ delay: 0.5, duration: 1 }}
                                                    />
                                                </div>
                                                <span className="text-sm text-gray-500">{summary.styleScore}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Stats */}
                                    <div className="grid grid-cols-3 gap-4">
                                        {personalColor && (
                                            <div className="text-center">
                                                <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${personalColor.gradient} flex items-center justify-center text-2xl mb-1 shadow-md`}>
                                                    {personalColor.icon}
                                                </div>
                                                <p className="text-xs text-gray-500">{personalColor.name}</p>
                                            </div>
                                        )}

                                        <div className="text-center">
                                            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-black text-lg text-white mb-1 shadow-md">
                                                {summary.fashionAge}
                                            </div>
                                            <p className="text-xs text-gray-500">Fashion Age</p>
                                        </div>

                                        <div className="text-center">
                                            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center font-black text-lg text-white mb-1 shadow-md">
                                                {summary.totalSwipes}
                                            </div>
                                            <p className="text-xs text-gray-500">Swipes</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Learning progress */}
                                <div className="relative mt-6 pt-6 border-t border-gray-200/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-gray-500">AI Learning Progress</span>
                                        <span className="text-sm font-bold text-gray-700">{Math.min(100, summary.totalSwipes)}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 rounded-full"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, summary.totalSwipes)}%` }}
                                            transition={{ delay: 0.8, duration: 1.5 }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    ) : (
                        <GlassCard variant="default" className="mb-8 text-center">
                            <motion.div
                                className="text-6xl mb-4"
                                animate={{ y: [0, -10, 0] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                            >
                                👆
                            </motion.div>
                            <h3 className="text-xl font-bold mb-2 text-gray-800">Start Swiping!</h3>
                            <p className="text-gray-500 mb-4">Swipe to teach AI your style preferences</p>
                            <GlassButton href="/start" variant="gradient">
                                Start Swiping
                            </GlassButton>
                        </GlassCard>
                    )}
                </FadeInView>

                {/* Quick Actions */}
                <FadeInView delay={0.1}>
                    <div className="mb-8">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
                            <span className="text-2xl">⚡</span>
                            Quick Start
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {QUICK_PROMPTS.map((prompt, i) => (
                                <motion.div
                                    key={prompt.text}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <Link
                                        href={`/stylist?prompt=${encodeURIComponent(prompt.text + 'のコーデを提案して')}`}
                                        className="group flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/70 backdrop-blur-sm border border-white/80 hover:bg-white/90 hover:shadow-md transition-all"
                                    >
                                        <span className="text-xl group-hover:scale-125 transition-transform">{prompt.emoji}</span>
                                        <span className="font-medium text-gray-700">{prompt.text}</span>
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </FadeInView>

                {/* AI Features */}
                <FadeInView delay={0.2}>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
                        <span className="text-2xl">🧠</span>
                        AI Features
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {AI_FEATURES.map((feature, index) => (
                            <FadeInView key={feature.id} delay={0.25 + index * 0.08}>
                                <Link href={feature.href} className="block group">
                                    <GlassCard variant="elevated" hoverEffect className="relative overflow-hidden">
                                        <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
                                        <div className="relative p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <motion.div
                                                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-2xl shadow-lg`}
                                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                                >
                                                    {feature.icon}
                                                </motion.div>
                                                <GlassBadge variant="gradient" size="sm">
                                                    AI
                                                </GlassBadge>
                                            </div>
                                            <h4 className="text-lg font-bold text-slate-900">{feature.name}</h4>
                                            <p className="text-sm text-slate-500">{feature.description}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {feature.features.map((f) => (
                                                    <GlassBadge key={f} variant="default" size="sm">
                                                        {f}
                                                    </GlassBadge>
                                                ))}
                                            </div>
                                            <p className="mt-4 text-xs text-slate-400">{feature.nameJp}</p>
                                        </div>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        ))}
                    </div>
                </FadeInView>

                {/* Bottom tip */}
                <FadeInView delay={0.4}>
                    <p className="mt-8 text-center text-gray-400 text-sm">
                        💡 The more you swipe, the smarter AI becomes
                    </p>
                </FadeInView>
            </main>

            {/* フローティングナビ */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
                <FloatingNavLight items={NAV_ITEMS} activeHref="/ai-hub" />
            </motion.div>
        </LightBackground>
    );
}
