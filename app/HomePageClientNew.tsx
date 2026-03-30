// app/HomePageClientNew.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
    LivePulse,
    StatCard,
} from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";
import TalkFab from "./_components/TalkFab";

type Props = {
    isLoggedIn: boolean;
    userName?: string | null;
};

export default function HomePageClientNew({ isLoggedIn, userName }: Props) {
    return (
        <LightBackground>
            <main className="pt-16 pb-32">
                {/* ヒーローセクション */}
                <section className="px-4 sm:px-6 max-w-6xl mx-auto text-center mb-16">
                    <FadeInView>
                        <GlassBadge variant="gradient" className="mb-4">
                            ✨ AI-Powered Self Discovery
                        </GlassBadge>
                    </FadeInView>

                    <FadeInView delay={0.1}>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight mb-6">
                            自分でも気づいていない
                            <br />
                            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                                自分を、観測する。
                            </span>
                        </h1>
                    </FadeInView>

                    <FadeInView delay={0.2}>
                        <p className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto mb-8">
                            毎日の質問に答えるだけで、AIがあなたの分身を育てていく。
                            判断のクセ、矛盾、隠してる本音——もうひとりの自分が、全部見つけてくれる。
                        </p>
                    </FadeInView>

                    <FadeInView delay={0.3}>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <GlassButton
                                href={isLoggedIn ? "/start" : "/login"}
                                variant="gradient"
                                size="lg"
                            >
                                {isLoggedIn ? "おすすめを見る" : "無料で始める"}
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </GlassButton>
                            <GlassButton href="/products" variant="secondary" size="lg">
                                商品を見る
                            </GlassButton>
                        </div>
                    </FadeInView>
                </section>

                {/* AIパーソナル体験 */}
                <section className="px-4 sm:px-6 max-w-6xl mx-auto mb-16">
                    <FadeInView>
                        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">
                            AI Personal Experience
                        </h2>
                    </FadeInView>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
                        {[
                            {
                                href: "/wardrobe",
                                icon: "👔",
                                title: "ワードローブ診断",
                                desc: "手持ち服を分析",
                                badge: "AI",
                                gradient: "from-emerald-500 to-teal-500",
                            },
                            {
                                href: "/avatar-fitting",
                                icon: "👗",
                                title: "フィッティング診断",
                                desc: "分身が相性を判定",
                                badge: "NEW",
                                gradient: "from-pink-500 to-rose-500",
                            },
                            {
                                href: "/start",
                                icon: "🧠",
                                title: "AIスタイル学習",
                                desc: "スワイプで好み学習",
                                badge: "AI",
                                gradient: "from-purple-500 to-indigo-500",
                            },
                            {
                                href: "/calendar",
                                icon: "📅",
                                title: "コーデカレンダー",
                                desc: "毎日のコーデ提案",
                                badge: "AI",
                                gradient: "from-cyan-500 to-blue-500",
                            },
                        ].map((item, i) => (
                            <FadeInView key={item.href} delay={0.1 * i}>
                                <Link href={item.href} className="block group">
                                    <GlassCard variant="elevated" hoverEffect className="relative overflow-hidden">
                                        <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />
                                        <div className="relative p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <motion.div
                                                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-2xl shadow-lg`}
                                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                                >
                                                    {item.icon}
                                                </motion.div>
                                                <GlassBadge variant="gradient" size="sm">
                                                    {item.badge}
                                                </GlassBadge>
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-900 mb-1">{item.title}</h3>
                                            <p className="text-sm text-slate-500">{item.desc}</p>
                                        </div>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        ))}
                    </div>

                    {/* ソーシャル革命 */}
                    <FadeInView>
                        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">
                            Social Revolution
                        </h2>
                    </FadeInView>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            {
                                href: "/live",
                                icon: "📺",
                                title: "ライブショッピング",
                                desc: "ライブ配信で購入",
                                badge: "LIVE",
                                gradient: "from-red-500 to-orange-500",
                                hasLive: true,
                            },
                            {
                                href: "/battle",
                                icon: "⚔️",
                                title: "コーデバトル",
                                desc: "スタイリング対決",
                                badge: "HOT",
                                gradient: "from-amber-500 to-yellow-500",
                            },
                            {
                                href: "/tribes",
                                icon: "👥",
                                title: "スタイルドライブ",
                                desc: "コミュニティ参加",
                                badge: "NEW",
                                gradient: "from-violet-500 to-purple-500",
                            },
                            {
                                href: "/collab",
                                icon: "🤝",
                                title: "コラボドロップ",
                                desc: "合同限定販売",
                                badge: "DROP",
                                gradient: "from-fuchsia-500 to-pink-500",
                            },
                        ].map((item, i) => (
                            <FadeInView key={item.href} delay={0.1 * i}>
                                <Link href={item.href} className="block group">
                                    <GlassCard variant="elevated" hoverEffect className="relative overflow-hidden">
                                        {/* 背景グラデーション */}
                                        <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-5 group-hover:opacity-10 transition-opacity`} />

                                        <div className="relative p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <motion.div
                                                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-2xl shadow-lg`}
                                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                                >
                                                    {item.icon}
                                                </motion.div>
                                                <GlassBadge
                                                    variant={item.hasLive ? "danger" : "gradient"}
                                                    size="sm"
                                                >
                                                    {item.hasLive && <LivePulse className="mr-1" />}
                                                    {item.badge}
                                                </GlassBadge>
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-900 mb-1">{item.title}</h3>
                                            <p className="text-sm text-slate-500">{item.desc}</p>
                                        </div>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        ))}
                    </div>
                </section>

                {/* クイックアクセス */}
                <section className="px-4 sm:px-6 max-w-6xl mx-auto mb-16">
                    <FadeInView>
                        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 text-center">
                            Quick Access
                        </h2>
                    </FadeInView>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        {[
                            { href: "/luxury", icon: "💎", label: "Luxury Lane", desc: "スタイル診断" },
                            { href: "/calendar", icon: "📅", label: "カレンダー", desc: "1ヶ月コーデ" },
                            { href: "/start", icon: "👆", label: "スワイプ", desc: "好みを学習" },
                            { href: "/products", icon: "👕", label: "商品一覧", desc: "全アイテム" },
                            { href: "/shops", icon: "🏪", label: "ショップ", desc: "出店者一覧" },
                            { href: "/ranking", icon: "🔥", label: "ランキング", desc: "今週の人気" },
                            { href: "/genome-card", icon: "🧬", label: "Genome Card", desc: "カード交換" },
                        ].map((item, i) => (
                            <FadeInView key={item.href} delay={0.05 * i}>
                                <Link href={item.href} className="block">
                                    <GlassCard variant="default" hoverEffect className="text-center">
                                        <motion.div
                                            className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 flex items-center justify-center text-2xl"
                                            whileHover={{ scale: 1.1 }}
                                        >
                                            {item.icon}
                                        </motion.div>
                                        <h3 className="font-semibold text-slate-900 text-sm">{item.label}</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        ))}
                    </div>
                </section>

                {/* ウェルカムカード（ログイン時） */}
                {isLoggedIn && (
                    <section className="px-4 sm:px-6 max-w-6xl mx-auto mb-16">
                        <FadeInView>
                            <GlassCard variant="gradient" padding="lg">
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <motion.div
                                            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-3xl shadow-lg"
                                            animate={{
                                                boxShadow: [
                                                    "0 10px 40px rgba(16,185,129,0.3)",
                                                    "0 10px 60px rgba(16,185,129,0.5)",
                                                    "0 10px 40px rgba(16,185,129,0.3)",
                                                ],
                                            }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                        >
                                            👋
                                        </motion.div>
                                        <div>
                                            <h2 className="text-xl lg:text-2xl font-bold text-slate-900">
                                                おかえりなさい{userName && `, ${userName}`}さん
                                            </h2>
                                            <p className="text-slate-500">今日もスワイプで好みを教えてください</p>
                                        </div>
                                    </div>
                                    <GlassButton href="/start" variant="primary" size="lg">
                                        おすすめを見る
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </GlassButton>
                                </div>
                            </GlassCard>
                        </FadeInView>
                    </section>
                )}

                {/* トレンドセクション */}
                <section className="px-4 sm:px-6 max-w-6xl mx-auto mb-16">
                    <FadeInView>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900">トレンドアイテム</h2>
                                <p className="text-slate-500">今週人気のアイテム</p>
                            </div>
                            <GlassButton href="/ranking" variant="ghost" size="sm">
                                すべて見る
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </GlassButton>
                        </div>
                    </FadeInView>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <FadeInView key={i} delay={0.1 * i}>
                                <GlassCard variant="elevated" padding="none" hoverEffect>
                                    <div className="aspect-[3/4] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
                                        <span className="text-5xl">👕</span>
                                        <div className="absolute top-2 right-2">
                                            <GlassBadge variant="danger" size="sm">#{i}</GlassBadge>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs text-slate-500 font-medium">ブランド名</p>
                                        <p className="font-semibold text-slate-900 truncate">サンプルアイテム {i}</p>
                                        <p className="text-purple-600 font-bold mt-1">¥{(9800 + i * 1000).toLocaleString()}</p>
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        ))}
                    </div>
                </section>

                {/* フッター */}
                <section className="px-4 sm:px-6 max-w-6xl mx-auto">
                    <FadeInView>
                        <GlassCard variant="default" padding="lg" className="text-center">
                            <p className="text-slate-500 mb-4">
                                Aneurasyncは、君の最大の理解者である。
                            </p>
                            <div className="flex items-center justify-center gap-4 flex-wrap">
                                <Link href="/legal/terms" className="text-xs text-slate-500 hover:text-slate-700">
                                    利用規約
                                </Link>
                                <Link href="/legal/privacy" className="text-xs text-slate-500 hover:text-slate-700">
                                    プライバシーポリシー
                                </Link>
                                <Link href="/legal/commercial" className="text-xs text-slate-500 hover:text-slate-700">
                                    特定商取引法に基づく表記
                                </Link>
                            </div>
                            <p className="mt-2 text-xs text-slate-400">&copy; 2026 Aneurasync</p>
                        </GlassCard>
                    </FadeInView>
                </section>
            </main>

            {/* Talk FAB（ログイン時のみ） */}
            {isLoggedIn && <TalkFab />}

            {/* フローティングナビ */}
            <FloatingNavLight items={MAIN_NAV} activeHref="/" />
        </LightBackground>
    );
}
