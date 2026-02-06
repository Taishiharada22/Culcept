// app/my/MyPageClient.tsx
"use client";

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

interface MyPageClientProps {
    isLoggedIn: boolean;
    userName?: string | null;
    userAvatar?: string | null;
}

const MENU_ITEMS = [
    { href: "/my/orders?tab=purchases", icon: "🛒", label: "購入履歴", desc: "過去の購入を確認", gradient: "from-emerald-400 to-teal-400" },
    { href: "/my/orders?tab=sales", icon: "💰", label: "販売履歴", desc: "売上を確認", gradient: "from-amber-400 to-orange-400" },
    { href: "/favorites", icon: "❤️", label: "お気に入り", desc: "保存した商品", gradient: "from-rose-400 to-pink-400" },
    { href: "/my/notifications", icon: "🔔", label: "通知", desc: "お知らせを確認", gradient: "from-blue-400 to-cyan-400" },
    { href: "/settings/notifications", icon: "⚙️", label: "設定", desc: "通知・アカウント設定", gradient: "from-gray-400 to-slate-400" },
];

const QUICK_LINKS = [
    { href: "/start", icon: "👆", label: "スワイプ", desc: "好みを学習" },
    { href: "/ai-hub", icon: "✨", label: "AI Hub", desc: "スタイリスト" },
    { href: "/style-quiz", icon: "🎨", label: "診断", desc: "タイプを発見" },
];

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function MyPageClient({ isLoggedIn, userName, userAvatar }: MyPageClientProps) {
    if (!isLoggedIn) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="text-center max-w-md"
                    >
                        <GlassCard className="p-10">
                            <motion.div
                                initial={{ scale: 0.8 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: "spring" }}
                                className="w-28 h-28 rounded-3xl bg-gradient-to-br from-violet-400/30 to-indigo-400/30 flex items-center justify-center mx-auto mb-8 shadow-xl"
                            >
                                <span className="text-5xl">👤</span>
                            </motion.div>
                            <h1 className="text-3xl font-bold mb-4 text-gray-800">ログインが必要です</h1>
                            <p className="text-gray-500 text-lg mb-10 leading-relaxed">
                                購入履歴やお気に入りを確認するにはログインしてください
                            </p>
                            <GlassButton href="/login?next=/my" variant="primary" size="lg" className="w-full justify-center">
                                ログイン
                                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </GlassButton>
                        </GlassCard>
                    </motion.div>
                </div>
            </LightBackground>
        );
    }

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
                                マイページ
                            </h1>
                            <p className="text-xs text-gray-400">あなたのスタイルハブ</p>
                        </div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 relative">
                <div className="pointer-events-none absolute -top-16 right-0 w-64 h-64 rounded-full bg-gradient-to-br from-fuchsia-400/25 via-pink-300/20 to-amber-200/20 blur-3xl" />
                <div className="pointer-events-none absolute top-56 -left-20 w-56 h-56 rounded-full bg-gradient-to-br from-cyan-300/25 via-violet-300/20 to-transparent blur-3xl" />
                <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 text-2xl text-violet-300/70">✦</div>
                <div className="pointer-events-none absolute top-44 right-10 text-xl text-pink-300/70">✶</div>

                <div className="relative z-10">
                    {/* プロフィールカード */}
                    <FadeInView>
                        <GlassCard className="mb-8 overflow-hidden relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-violet-400/12 via-transparent to-cyan-400/12 pointer-events-none" />
                            <div className="absolute -top-16 -right-10 w-40 h-40 bg-white/35 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute inset-0 rounded-3xl ring-1 ring-white/60 pointer-events-none" />
                            <div className="relative p-8">
                                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                                    <div className="flex items-center gap-5">
                                        <motion.div
                                            whileHover={{ scale: 1.05, rotate: 4 }}
                                            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-500 flex items-center justify-center shadow-xl shadow-violet-500/30"
                                        >
                                            {userAvatar ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={userAvatar} alt="" className="w-full h-full rounded-2xl object-cover" />
                                            ) : (
                                                <span className="text-3xl">👤</span>
                                            )}
                                        </motion.div>
                                        <div>
                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-white/80 text-[11px] font-semibold text-violet-600">
                                                PROFILE
                                                <span className="text-pink-400">✦</span>
                                            </div>
                                            <h2 className="text-2xl font-bold mt-3 text-gray-800">
                                                {userName || "ユーザー"}
                                                <span className="ml-2 text-violet-400">✶</span>
                                            </h2>
                                            <p className="text-gray-500 mt-1">ようこそ、Culceptへ</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <GlassButton href="/settings/profile" variant="secondary" size="sm">
                                            プロフィール編集
                                        </GlassButton>
                                        <GlassButton href="/settings/notifications" variant="ghost" size="sm">
                                            設定
                                        </GlassButton>
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    </FadeInView>

                    {/* AI機能への導線 */}
                    <FadeInView delay={0.1}>
                        <Link href="/ai-hub" className="block mb-8 group">
                            <GlassCard className="overflow-hidden hover:shadow-xl transition-shadow duration-300 relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-violet-400/16 via-transparent to-cyan-400/16" />
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),transparent_55%)] opacity-60" />
                                <motion.div
                                    className="absolute top-0 right-0 w-32 h-32 bg-violet-400/25 rounded-full blur-3xl"
                                    animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
                                    transition={{ duration: 5, repeat: Infinity }}
                                />

                                <div className="p-6 relative">
                                    <div className="relative flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <motion.div
                                                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/30"
                                                animate={{
                                                    boxShadow: [
                                                        "0 10px 40px rgba(139,92,246,0.3)",
                                                        "0 10px 60px rgba(139,92,246,0.5)",
                                                        "0 10px 40px rgba(139,92,246,0.3)",
                                                    ],
                                                }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            >
                                                <span className="text-2xl">✨</span>
                                            </motion.div>
                                            <div>
                                                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-violet-600 mb-2">
                                                    AI FEATURES
                                                </div>
                                                <h3 className="text-xl font-bold mb-1 text-gray-800">AI Fashion Hub</h3>
                                                <p className="text-gray-500">スタイル診断・コーデ提案・画像検索</p>
                                            </div>
                                        </div>
                                        <motion.svg
                                            className="w-6 h-6 text-gray-300 group-hover:text-violet-500"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            whileHover={{ x: 5 }}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </motion.svg>
                                    </div>
                                </div>
                            </GlassCard>
                        </Link>
                    </FadeInView>

                    {/* メニュー */}
                    <div className="mb-10">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-xl">🧭</span>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Menu</h3>
                            <span className="h-px flex-1 bg-gradient-to-r from-slate-200/70 to-transparent" />
                        </div>
                        <div className="space-y-3">
                        {MENU_ITEMS.map((item, index) => (
                            <FadeInView key={item.href} delay={0.15 + index * 0.05}>
                                <Link href={item.href} className="block group">
                                    <GlassCard className="hover:shadow-lg transition-all duration-300">
                                        <div className="relative flex items-center gap-4 p-5">
                                            <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b ${item.gradient}`} />
                                            <motion.div
                                                whileHover={{ scale: 1.1, rotate: 5 }}
                                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-xl shrink-0 shadow-lg`}
                                            >
                                                {item.icon}
                                            </motion.div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-gray-800">{item.label}</div>
                                                <div className="text-sm text-gray-500">{item.desc}</div>
                                            </div>
                                            <motion.svg
                                                className="w-5 h-5 text-gray-300 group-hover:text-gray-600"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                whileHover={{ x: 5 }}
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </motion.svg>
                                        </div>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        ))}
                        </div>
                    </div>

                    {/* クイックリンク */}
                    <FadeInView delay={0.4}>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-xl">⚡</span>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Quick Access</h3>
                            <span className="h-px flex-1 bg-gradient-to-r from-slate-200/70 to-transparent" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {QUICK_LINKS.map((item, index) => (
                                <motion.div
                                    key={item.href}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                >
                                    <Link href={item.href}>
                                        <GlassCard variant="default" hoverEffect className="text-center relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 opacity-70" />
                                            <div className="absolute top-3 right-3 text-[10px] text-amber-400/80">✦</div>
                                            <motion.div
                                                className="relative w-12 h-12 mx-auto mb-3 rounded-xl bg-white/80 border border-white/80 flex items-center justify-center text-2xl shadow-sm"
                                                whileHover={{ scale: 1.1 }}
                                            >
                                                {item.icon}
                                            </motion.div>
                                            <h3 className="relative font-semibold text-slate-900 text-sm">{item.label}</h3>
                                            <p className="relative text-xs text-slate-500 mt-0.5">{item.desc}</p>
                                        </GlassCard>
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </FadeInView>

                    {/* ログアウト */}
                    <FadeInView delay={0.6}>
                        <div className="mt-12 pt-8 border-t border-gray-200/50 text-center">
                            <Link
                                href="/logout"
                                className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                ログアウト
                            </Link>
                        </div>
                    </FadeInView>
                </div>
            </main>

            {/* フローティングナビ */}
            <FloatingNavLight items={NAV_ITEMS} activeHref="/my" />

            <div className="h-24" />
        </LightBackground>
    );
}
