// app/explore/ExplorePageClient.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

const ParticleField = dynamic(() => import("@/components/ui/ParticleField"), {
    ssr: false,
});

interface TileProps {
    href: string;
    title: string;
    desc: string;
    badge?: string;
    icon: string;
    gradient: string;
    delay: number;
}

function Tile({ href, title, desc, badge, icon, gradient, delay }: TileProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
        >
            <Link href={href} className="group block h-full">
                <div className="relative rounded-3xl overflow-hidden h-full">
                    {/* Background */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-20 group-hover:opacity-30 transition-opacity`} />
                    <div className="absolute inset-0 bg-white/5 backdrop-blur-sm border border-white/10 group-hover:border-white/20 transition-all rounded-3xl" />

                    {/* Content */}
                    <div className="relative p-6 h-full flex flex-col">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <motion.div
                                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shadow-lg`}
                                whileHover={{ scale: 1.1, rotate: 5 }}
                            >
                                {icon}
                            </motion.div>
                            {badge && (
                                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-bold text-white/80">
                                    {badge}
                                </span>
                            )}
                        </div>

                        <h2 className="text-2xl font-black text-white mb-2">{title}</h2>
                        <p className="text-sm text-white/60 leading-relaxed mb-4 flex-1">{desc}</p>

                        <div className="flex items-center gap-2 text-sm font-bold text-white/80 group-hover:text-white transition-colors">
                            <span>Open</span>
                            <motion.span
                                animate={{ x: [0, 4, 0] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                            >
                                →
                            </motion.span>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

export default function ExplorePageClient() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Background */}
            <div className="fixed inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/20 to-purple-950/20" />
                <ParticleField
                    particleCount={40}
                    colors={["#10B981", "#8B5CF6", "#F97316"]}
                    interactive
                />
            </div>

            <main className="relative z-10 mx-auto max-w-5xl px-4 py-12">
                {/* Header */}
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mb-10"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <motion.div
                            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/30"
                            whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                            🧭
                        </motion.div>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-white via-emerald-200 to-teal-200 bg-clip-text text-transparent">
                                Explore
                            </h1>
                            <p className="text-white/60 mt-1">
                                商品・ショップ・マイページから探索
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Navigation Tiles */}
                <div className="grid gap-5 md:grid-cols-3">
                    <Tile
                        href="/drops"
                        title="服で探す"
                        desc="Hot / Top / New で回遊。比較→購入まで。"
                        icon="👕"
                        gradient="from-orange-500 to-pink-500"
                        delay={0.1}
                    />
                    <Tile
                        href="/shops"
                        title="店で探す"
                        desc="世界観から入る。店→商品へ落とす。"
                        icon="🏪"
                        gradient="from-purple-500 to-indigo-500"
                        delay={0.2}
                    />
                    <Tile
                        href="/me"
                        title="MY PAGE"
                        desc="自分のブランドショップを作る・編集する。出品/管理もここに集約。"
                        badge="Create / Edit"
                        icon="👤"
                        gradient="from-emerald-500 to-teal-500"
                        delay={0.3}
                    />
                </div>

                {/* Quick Access */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-10"
                >
                    <h3 className="text-lg font-bold text-white/60 mb-4">Quick Access</h3>
                    <div className="flex flex-wrap gap-3">
                        {[
                            { href: "/ai-hub", label: "AI Hub", icon: "🧠" },
                            { href: "/start", label: "Swipe", icon: "👆" },
                            { href: "/search", label: "AI Search", icon: "🔮" },
                            { href: "/style-quiz", label: "Style Quiz", icon: "✨" },
                            { href: "/ranking", label: "Ranking", icon: "🏆" },
                        ].map((item, idx) => (
                            <motion.div
                                key={item.href}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.5 + idx * 0.05 }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <Link
                                    href={item.href}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 hover:border-white/20 hover:bg-white/20 transition-all text-sm font-bold"
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
