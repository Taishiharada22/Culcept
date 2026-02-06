// app/HomePageClient.tsx
"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassInput,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface Props {
    isLoggedIn: boolean;
    userName: string | null;
}

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function HomePageClient({ isLoggedIn, userName }: Props) {
    const [searchQuery, setSearchQuery] = useState("");
    const heroRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    });

    const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
    const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
    const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 100]);

    const handleSearch = (value: string) => {
        if (value.trim()) {
            window.location.href = `/search?q=${encodeURIComponent(value)}`;
        }
    };

    return (
        <LightBackground>
            {/* ヒーローセクション - フルスクリーン */}
            <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
                <motion.div
                    style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
                    className="relative z-10 text-center px-6 max-w-5xl mx-auto"
                >
                    {/* ロゴ/ブランド */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <h1 className="text-6xl sm:text-8xl lg:text-9xl font-bold tracking-tighter">
                            <span className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-400 bg-clip-text text-transparent">
                                Culcept
                            </span>
                        </h1>
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-6 text-xl sm:text-2xl text-gray-400 font-light"
                    >
                        古着との出会いを、再定義する
                    </motion.p>

                    {/* 検索バー */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-12 max-w-2xl mx-auto"
                    >
                        <GlassInput
                            placeholder="90年代 デニムジャケット、ヴィンテージ Tシャツ..."
                            value={searchQuery}
                            onChange={setSearchQuery}
                            onSubmit={handleSearch}
                            size="lg"
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            }
                        />

                        {/* クイックアクション */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="flex flex-wrap justify-center gap-3 mt-6"
                        >
                            <Link
                                href="/visual-search"
                                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/60 backdrop-blur-sm border border-white/80 text-sm text-gray-600 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                            >
                                <span className="text-lg">📷</span>
                                <span>画像で検索</span>
                            </Link>
                            <Link
                                href="/ai-hub"
                                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-500/10 to-cyan-500/10 backdrop-blur-sm border border-violet-300/50 text-sm text-violet-600 hover:from-violet-500/20 hover:to-cyan-500/20 hover:text-violet-700 transition-all duration-300"
                            >
                                <span className="text-lg">✨</span>
                                <span>AIスタイリスト</span>
                            </Link>
                        </motion.div>
                    </motion.div>
                </motion.div>

                {/* スクロールインジケーター */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2"
                >
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="flex flex-col items-center gap-2"
                    >
                        <span className="text-xs text-gray-400 tracking-widest uppercase">Scroll</span>
                        <div className="w-[1px] h-8 bg-gradient-to-b from-gray-400 to-transparent" />
                    </motion.div>
                </motion.div>
            </section>

            {/* メインナビゲーション */}
            <section className="relative py-32 px-6">
                <div className="max-w-6xl mx-auto">
                    <FadeInView>
                        <h2 className="text-sm font-medium text-gray-400 tracking-widest uppercase mb-12 text-center">
                            Explore
                        </h2>
                    </FadeInView>

                    <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
                        {/* 商品から探す */}
                        <FadeInView delay={0.1}>
                            <GlassCard href="/products" variant="elevated" padding="none">
                                <div className="p-8 lg:p-10">
                                    <div className="flex items-start justify-between mb-8">
                                        <motion.div
                                            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/25"
                                            whileHover={{ rotate: [0, -10, 10, 0] }}
                                            transition={{ duration: 0.5 }}
                                        >
                                            <span className="text-3xl">👕</span>
                                        </motion.div>
                                        <motion.svg
                                            className="w-6 h-6 text-gray-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            whileHover={{ x: 5, color: "rgb(107,114,128)" }}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </motion.svg>
                                    </div>
                                    <h3 className="text-2xl lg:text-3xl font-bold mb-3 text-gray-800">商品から探す</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        数千点のヴィンテージアイテムを、
                                        <br />
                                        スマートなフィルターで発見
                                    </p>
                                    <div className="mt-8 flex flex-wrap gap-2">
                                        {["Levi's", "Nike", "Carhartt", "Ralph Lauren"].map((brand) => (
                                            <span key={brand} className="px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                                {brand}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* ショップから探す */}
                        <FadeInView delay={0.2}>
                            <GlassCard href="/shops" variant="elevated" padding="none">
                                <div className="p-8 lg:p-10">
                                    <div className="flex items-start justify-between mb-8">
                                        <motion.div
                                            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25"
                                            whileHover={{ rotate: [0, -10, 10, 0] }}
                                            transition={{ duration: 0.5 }}
                                        >
                                            <span className="text-3xl">🏪</span>
                                        </motion.div>
                                        <motion.svg
                                            className="w-6 h-6 text-gray-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            whileHover={{ x: 5, color: "rgb(107,114,128)" }}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </motion.svg>
                                    </div>
                                    <h3 className="text-2xl lg:text-3xl font-bold mb-3 text-gray-800">ショップから探す</h3>
                                    <p className="text-gray-500 leading-relaxed">
                                        世界観で選ぶ、
                                        <br />
                                        キュレーターたちのセレクト
                                    </p>
                                    <div className="mt-8 flex -space-x-2">
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <div
                                                key={i}
                                                className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 border-2 border-white flex items-center justify-center text-xs font-medium text-white shadow-md"
                                            >
                                                {String.fromCharCode(64 + i)}
                                            </div>
                                        ))}
                                        <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500">
                                            +99
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>
                    </div>
                </div>
            </section>

            {/* AIパーソナライズセクション */}
            <section className="relative py-32 px-6">
                <div className="max-w-6xl mx-auto">
                    <FadeInView>
                        <GlassCard variant="gradient" padding="none" className="overflow-hidden">
                            <div className="relative">
                                {/* 背景グラデーション */}
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 via-cyan-400/10 to-emerald-400/10" />

                                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8 p-8 lg:p-12">
                                    <div className="flex items-start gap-6">
                                        <motion.div
                                            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/25"
                                            animate={{
                                                boxShadow: [
                                                    "0 10px 25px rgba(16,185,129,0.2)",
                                                    "0 10px 40px rgba(16,185,129,0.35)",
                                                    "0 10px 25px rgba(16,185,129,0.2)",
                                                ],
                                            }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                        >
                                            <span className="text-4xl">{isLoggedIn ? "👋" : "✨"}</span>
                                        </motion.div>
                                        <div>
                                            <h2 className="text-2xl lg:text-3xl font-bold mb-2 text-gray-800">
                                                {isLoggedIn ? `おかえりなさい${userName ? `, ${userName}` : ""}` : "AIがあなたの好みを学習"}
                                            </h2>
                                            <p className="text-gray-500 text-lg">
                                                {isLoggedIn
                                                    ? "スワイプを続けて、AIをもっと賢く"
                                                    : "スワイプするだけで、パーソナライズされた体験を"}
                                            </p>
                                        </div>
                                    </div>
                                    <GlassButton
                                        href={isLoggedIn ? "/start" : "/login"}
                                        variant="gradient"
                                        size="lg"
                                    >
                                        {isLoggedIn ? "おすすめを見る" : "始める"}
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </GlassButton>
                                </div>
                            </div>
                        </GlassCard>
                    </FadeInView>
                </div>
            </section>

            {/* 機能ショートカット */}
            <section className="relative py-32 px-6">
                <div className="max-w-6xl mx-auto">
                    <FadeInView>
                        <h2 className="text-sm font-medium text-gray-400 tracking-widest uppercase mb-12 text-center">
                            Quick Access
                        </h2>
                    </FadeInView>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                        {[
                            { href: "/luxury", icon: "💎", label: "Luxury Lane", desc: "スタイル診断", gradient: "from-amber-400 to-yellow-500" },
                            { href: "/calendar", icon: "📅", label: "カレンダー", desc: "1ヶ月コーデ", gradient: "from-cyan-400 to-blue-500" },
                            { href: "/start", icon: "👆", label: "スワイプ", desc: "好みを学習", gradient: "from-pink-400 to-rose-500" },
                            { href: "/ranking", icon: "🔥", label: "ランキング", desc: "今週の人気", gradient: "from-red-400 to-orange-500" },
                            { href: "/products", icon: "👕", label: "商品一覧", desc: "全アイテム", gradient: "from-violet-400 to-purple-500" },
                            { href: "/shops", icon: "🏪", label: "ショップ", desc: "出店者一覧", gradient: "from-emerald-400 to-green-500" },
                        ].map((item, i) => (
                            <FadeInView key={item.href} delay={i * 0.1}>
                                <GlassCard href={item.href} variant="default" padding="none">
                                    <div className="p-6 lg:p-8 text-center">
                                        <motion.div
                                            className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-4 shadow-lg`}
                                            whileHover={{ scale: 1.1, rotate: 5 }}
                                        >
                                            <span className="text-2xl">{item.icon}</span>
                                        </motion.div>
                                        <h3 className="text-lg font-semibold mb-1 text-gray-800">{item.label}</h3>
                                        <p className="text-sm text-gray-400">{item.desc}</p>
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        ))}
                    </div>
                </div>
            </section>

            {/* 出品者向け */}
            <section className="relative py-32 px-6 pb-40">
                <div className="max-w-4xl mx-auto">
                    <FadeInView>
                        <div className="text-center">
                            <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-800">
                                ショップオーナーの方へ
                            </h2>
                            <p className="text-gray-500 text-lg mb-10 max-w-xl mx-auto">
                                あなたのショップを、新しい顧客と繋げる
                            </p>
                            <div className="flex flex-wrap justify-center gap-4">
                                <GlassButton href="/shops/me" variant="secondary" size="lg">
                                    ショップ管理
                                </GlassButton>
                                <GlassButton href="/drops/new" variant="primary" size="lg">
                                    商品を出品
                                </GlassButton>
                            </div>
                        </div>
                    </FadeInView>
                </div>
            </section>

            {/* フッターナビ */}
            <footer className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
                <div className="flex justify-center pb-6">
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 1, type: "spring", stiffness: 100 }}
                        className="pointer-events-auto"
                    >
                        <FloatingNavLight items={NAV_ITEMS} activeHref="/" />
                    </motion.div>
                </div>
            </footer>
        </LightBackground>
    );
}
