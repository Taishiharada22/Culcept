// app/start/StartPageWrapper.tsx
"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassBadge,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface StartPageWrapperProps {
    children: ReactNode;
}

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/start", label: "スワイプ", icon: "👆" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function StartPageWrapper({ children }: StartPageWrapperProps) {
    return (
        <LightBackground>
            {/* AI Hub導線 */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="max-w-4xl mx-auto px-4 sm:px-6 py-4"
            >
                <Link href="/ai-hub" className="block group">
                    <GlassCard className="overflow-hidden hover:shadow-xl transition-all duration-300">
                        <div className="p-6 relative">
                            {/* 背景エフェクト */}
                            <div className="absolute inset-0 bg-gradient-to-r from-violet-400/10 via-transparent to-cyan-400/10" />
                            <motion.div
                                className="absolute -top-10 -right-10 w-40 h-40 bg-violet-400/20 rounded-full blur-3xl"
                                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                                transition={{ duration: 4, repeat: Infinity }}
                            />

                            <div className="relative flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <motion.div
                                        className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/30"
                                        animate={{
                                            boxShadow: [
                                                "0 10px 30px rgba(139,92,246,0.3)",
                                                "0 10px 50px rgba(139,92,246,0.5)",
                                                "0 10px 30px rgba(139,92,246,0.3)",
                                            ],
                                        }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    >
                                        <span className="text-xl">✨</span>
                                    </motion.div>
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-slate-400">AI Fashion Hub</div>
                                        <div className="text-lg font-bold text-slate-900">スタイリスト・診断・コーデ提案</div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <GlassBadge variant="gradient" size="sm">
                                                Stylist
                                            </GlassBadge>
                                            <GlassBadge variant="info" size="sm">
                                                診断
                                            </GlassBadge>
                                            <GlassBadge size="sm" className="bg-white/70 text-slate-600 border-white/70">
                                                Calendar
                                            </GlassBadge>
                                        </div>
                                    </div>
                                </div>
                                <motion.svg
                                    className="w-5 h-5 text-gray-300 group-hover:text-violet-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    whileHover={{ x: 5 }}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </motion.svg>
                            </div>

                            <div className="relative mt-4 grid gap-2 sm:grid-cols-3 text-xs text-slate-600">
                                <div className="rounded-2xl border border-white/70 bg-white/60 px-3 py-2">
                                    🎨 パーソナルカラー診断
                                </div>
                                <div className="rounded-2xl border border-white/70 bg-white/60 px-3 py-2">
                                    🧠 Style DNA の可視化
                                </div>
                                <div className="rounded-2xl border border-white/70 bg-white/60 px-3 py-2">
                                    📅 シーン別コーデ提案
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </Link>
            </motion.div>

            {/* メインコンテンツ */}
            <motion.main
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="max-w-4xl mx-auto px-4 sm:px-6 pb-40 pt-6"
            >
                {children}
            </motion.main>

            {/* ヒント & フローティングナビ */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3"
            >
                {/* ヒント */}
                <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-500/10 to-cyan-500/10 backdrop-blur-xl border border-white/60 text-xs text-gray-600 shadow-lg"
                >
                    <span className="mr-1">👆</span> スワイプするほど精度が上がります
                </motion.div>

                {/* ナビ */}
                <FloatingNavLight items={NAV_ITEMS} activeHref="/start" />
            </motion.div>
        </LightBackground>
    );
}
