// app/shops/me/analytics/AnalyticsPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import type { ShopAnalytics, TimeSeriesData, TopProduct } from "@/types/analytics";

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/shops/me", label: "マイショップ", icon: "🏪" },
    { href: "/shops/me/analytics", label: "分析", icon: "📊" },
    { href: "/drops/new", label: "出品", icon: "✨" },
];

interface Props {
    analytics: ShopAnalytics;
    timeSeriesData: TimeSeriesData[];
    topProducts: TopProduct[];
}

// アニメーション付きカウントアップ
function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
    const [displayValue, setDisplayValue] = React.useState(0);

    React.useEffect(() => {
        const duration = 1000;
        const startTime = Date.now();
        const startValue = displayValue;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.round(startValue + (value - startValue) * eased));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value]);

    return (
        <span>
            {prefix}{displayValue.toLocaleString()}{suffix}
        </span>
    );
}

// メトリクスカード
function MetricCard({
    title,
    value,
    icon,
    gradient,
    delay = 0,
}: {
    title: string;
    value: number;
    icon: string;
    gradient: string;
    delay?: number;
}) {
    return (
        <FadeInView delay={delay}>
            <GlassCard className="overflow-hidden">
                <div className="p-6 relative">
                    {/* 背景グロー */}
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 opacity-30`} />

                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-gray-500">{title}</span>
                            <motion.span
                                className="text-2xl"
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 2, repeat: Infinity, delay: delay * 2 }}
                            >
                                {icon}
                            </motion.span>
                        </div>
                        <div className="text-3xl font-bold text-gray-800">
                            <AnimatedNumber value={value} prefix={title === "売上" ? "¥" : ""} />
                        </div>
                    </div>
                </div>
            </GlassCard>
        </FadeInView>
    );
}

// チャートコンポーネント
function GlassChart({
    data,
    timeRange,
}: {
    data: TimeSeriesData[];
    timeRange: string;
}) {
    const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-5xl mb-4"
                >
                    📊
                </motion.div>
                <p className="text-gray-400">データがありません</p>
            </div>
        );
    }

    const maxViews = Math.max(...data.map((d) => d.views), 1);
    const maxClicks = Math.max(...data.map((d) => d.clicks), 1);
    const maxValue = Math.max(maxViews, maxClicks);

    return (
        <div className="space-y-6">
            {/* チャート本体 */}
            <div className="relative h-[240px] w-full">
                {/* グリッドライン */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                    <div
                        key={ratio}
                        className="absolute left-12 right-0 border-t border-gray-200/50"
                        style={{ bottom: `${ratio * 100}%` }}
                    >
                        <span className="absolute -left-12 -translate-y-1/2 text-[10px] text-gray-400 w-10 text-right">
                            {Math.round(maxValue * ratio).toLocaleString()}
                        </span>
                    </div>
                ))}

                {/* バー */}
                <div className="absolute inset-0 left-12 flex items-end justify-between gap-1">
                    {data.map((d, i) => {
                        const viewsHeight = (d.views / maxValue) * 100;
                        const clicksHeight = (d.clicks / maxValue) * 100;
                        const isHovered = hoveredIndex === i;

                        return (
                            <motion.div
                                key={d.date}
                                className="relative flex-1 flex items-end gap-0.5 cursor-pointer"
                                onMouseEnter={() => setHoveredIndex(i)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.02 }}
                            >
                                {/* Views バー */}
                                <motion.div
                                    className="flex-1 bg-gradient-to-t from-violet-500 to-violet-400 rounded-t-sm"
                                    initial={{ height: 0 }}
                                    animate={{
                                        height: `${viewsHeight}%`,
                                        opacity: isHovered ? 1 : 0.7,
                                    }}
                                    transition={{ duration: 0.5, delay: i * 0.02 }}
                                />
                                {/* Clicks バー */}
                                <motion.div
                                    className="flex-1 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t-sm"
                                    initial={{ height: 0 }}
                                    animate={{
                                        height: `${clicksHeight}%`,
                                        opacity: isHovered ? 1 : 0.5,
                                    }}
                                    transition={{ duration: 0.5, delay: i * 0.02 + 0.1 }}
                                />

                                {/* ツールチップ */}
                                <AnimatePresence>
                                    {isHovered && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-white/90 backdrop-blur-sm border border-white/60 shadow-lg text-xs whitespace-nowrap z-10"
                                        >
                                            <div className="font-medium text-gray-700 mb-1">{d.date}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-violet-500">👁️ {d.views.toLocaleString()}</span>
                                                <span className="text-cyan-500">🖱️ {d.clicks.toLocaleString()}</span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* 凡例 */}
            <div className="flex items-center justify-center gap-8">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-violet-500 to-violet-400" />
                    <span className="text-xs text-gray-500">閲覧数</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-cyan-500 to-cyan-400" />
                    <span className="text-xs text-gray-500">クリック数</span>
                </div>
            </div>
        </div>
    );
}

export default function AnalyticsPageClient({ analytics, timeSeriesData, topProducts }: Props) {
    const [timeRange, setTimeRange] = React.useState<"7d" | "30d" | "90d">("30d");

    const filteredData = React.useMemo(() => {
        const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
        return timeSeriesData.slice(-days);
    }, [timeSeriesData, timeRange]);

    const rangeTotals = React.useMemo(() => {
        return filteredData.reduce(
            (acc, day) => ({
                views: acc.views + day.views,
                clicks: acc.clicks + day.clicks,
                sales: acc.sales + day.sales,
                revenue: acc.revenue + day.revenue,
            }),
            { views: 0, clicks: 0, sales: 0, revenue: 0 }
        );
    }, [filteredData]);

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="max-w-6xl mx-auto">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/shops/me"
                                className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-gray-800">Analytics</h1>
                                <p className="text-xs text-gray-400">ショップパフォーマンス分析</p>
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
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg"
                        >
                            <span className="text-lg">📊</span>
                        </motion.div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-40">
                {/* 期間切り替え */}
                <FadeInView>
                    <div className="flex items-center justify-end gap-2 mb-8">
                        {(["7d", "30d", "90d"] as const).map((range) => (
                            <motion.button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                                    timeRange === range
                                        ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/25"
                                        : "bg-white/50 backdrop-blur-sm text-gray-600 hover:bg-white/80 hover:text-gray-800 border border-white/60"
                                }`}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {range === "7d" ? "7日間" : range === "30d" ? "30日間" : "90日間"}
                            </motion.button>
                        ))}
                    </div>
                </FadeInView>

                {/* メトリクスカード */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    <MetricCard
                        title="閲覧数"
                        value={rangeTotals.views}
                        icon="👁️"
                        gradient="from-violet-400/30 to-violet-500/10"
                        delay={0}
                    />
                    <MetricCard
                        title="クリック数"
                        value={rangeTotals.clicks}
                        icon="🖱️"
                        gradient="from-cyan-400/30 to-cyan-500/10"
                        delay={0.1}
                    />
                    <MetricCard
                        title="販売数"
                        value={rangeTotals.sales}
                        icon="🛍️"
                        gradient="from-pink-400/30 to-pink-500/10"
                        delay={0.2}
                    />
                    <MetricCard
                        title="売上"
                        value={rangeTotals.revenue}
                        icon="💰"
                        gradient="from-amber-400/30 to-amber-500/10"
                        delay={0.3}
                    />
                </div>

                {/* ショップ概要 */}
                <FadeInView delay={0.2}>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className="p-6 sm:p-8 relative">
                            {/* 背景グラデーション */}
                            <div className="absolute inset-0 bg-gradient-to-r from-violet-400/5 via-transparent to-cyan-400/5" />

                            <div className="relative">
                                <div className="flex items-center gap-3 mb-6">
                                    <motion.div
                                        whileHover={{ scale: 1.1, rotate: 5 }}
                                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-lg shadow-lg"
                                    >
                                        🏪
                                    </motion.div>
                                    <div>
                                        <h3 className="font-semibold text-gray-800">ショップ概要</h3>
                                        <p className="text-xs text-gray-400">全期間のサマリー</p>
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    {[
                                        { label: "総商品数", value: analytics.total_products, icon: "📦" },
                                        { label: "公開中", value: analytics.published_products, icon: "✅" },
                                        { label: "フォロワー", value: analytics.follower_count, icon: "👥" },
                                        { label: "平均価格", value: Math.round(analytics.average_price), prefix: "¥", icon: "💎" },
                                    ].map((item, idx) => (
                                        <motion.div
                                            key={item.label}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 + idx * 0.1 }}
                                            className="rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 p-4 hover:bg-white/70 transition-all shadow-sm"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-gray-500">{item.label}</span>
                                                <span>{item.icon}</span>
                                            </div>
                                            <div className="text-xl font-bold text-gray-800">
                                                {item.prefix || ""}{item.value.toLocaleString()}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* チャート */}
                <FadeInView delay={0.3}>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className="p-6 sm:p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <motion.div
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-lg shadow-lg"
                                >
                                    📈
                                </motion.div>
                                <div>
                                    <h3 className="font-semibold text-gray-800">閲覧数・クリック数の推移</h3>
                                    <p className="text-xs text-gray-400">過去{timeRange === "7d" ? "7" : timeRange === "30d" ? "30" : "90"}日間のトレンド</p>
                                </div>
                            </div>

                            <GlassChart data={filteredData} timeRange={timeRange} />
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* トップ商品 */}
                <FadeInView delay={0.4}>
                    <GlassCard className="overflow-hidden">
                        <div className="p-6 sm:p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <motion.div
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-lg shadow-lg"
                                >
                                    🏆
                                </motion.div>
                                <div>
                                    <h3 className="font-semibold text-gray-800">人気商品 TOP 10</h3>
                                    <p className="text-xs text-gray-400">最も閲覧された商品</p>
                                </div>
                            </div>

                            {topProducts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <motion.div
                                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="text-5xl mb-4"
                                    >
                                        📊
                                    </motion.div>
                                    <p className="text-gray-400">データがまだありません</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {topProducts.map((product, idx) => (
                                        <motion.div
                                            key={product.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + idx * 0.05 }}
                                            className="group flex items-center gap-4 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 p-4 hover:bg-white/70 hover:border-violet-300/50 transition-all cursor-pointer shadow-sm"
                                        >
                                            <motion.div
                                                whileHover={{ scale: 1.1 }}
                                                className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${
                                                    idx === 0
                                                        ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30"
                                                        : idx === 1
                                                        ? "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700"
                                                        : idx === 2
                                                        ? "bg-gradient-to-br from-amber-600 to-amber-700 text-white"
                                                        : "bg-white/80 border border-white/60 text-gray-500"
                                                }`}
                                            >
                                                {idx + 1}
                                            </motion.div>

                                            {product.cover_image_url && (
                                                <motion.div
                                                    whileHover={{ scale: 1.05 }}
                                                    className="relative"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={product.cover_image_url}
                                                        alt={product.title}
                                                        className="h-14 w-14 rounded-xl border border-white/60 object-cover shadow-sm"
                                                    />
                                                </motion.div>
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-medium text-gray-800 truncate group-hover:text-violet-600 transition-colors">
                                                    {product.title}
                                                </h4>
                                                <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-violet-500">👁️</span>
                                                        {product.views.toLocaleString()}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-cyan-500">🖱️</span>
                                                        {product.clicks.toLocaleString()}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-amber-500">💰</span>
                                                        ¥{product.revenue.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            <svg
                                                className="w-5 h-5 text-gray-300 group-hover:text-violet-500 transition-colors"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </FadeInView>
            </main>

            {/* フローティングナビ */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
                <FloatingNavLight items={NAV_ITEMS} activeHref="/shops/me/analytics" />
            </motion.div>
        </LightBackground>
    );
}
