// app/luxury/result/LuxuryResultClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassModal,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface LaneScore {
    lane_id: string;
    score: number;
    like_count: number;
    dislike_count: number;
    total_count: number;
    lane: {
        name_ja: string;
        name_en: string;
        color_primary: string;
        color_secondary: string;
        icon_emoji: string;
        description: string;
        shop_url?: string | null;
        shop_slug?: string | null;
    };
}

interface ResultData {
    topLane: {
        lane_id: string;
        name_ja: string;
        name_en: string;
        color_primary: string;
        color_secondary: string;
        icon_emoji: string;
        description: string;
        score: number;
    };
    topTags: string[];
    reason: string;
    scoreDistribution: LaneScore[];
    totalImpressions: number;
    brandRanking?: Array<{
        lane_id: string;
        name_ja?: string | null;
        name_en?: string | null;
        color_primary?: string | null;
        color_secondary?: string | null;
        icon_emoji?: string | null;
        shop_url?: string | null;
        shop_slug?: string | null;
        score?: number | null;
        like_count?: number | null;
        dislike_count?: number | null;
        total_count?: number | null;
    }>;
    cardRanking?: Array<{
        card_id: string;
        lane_id?: string | null;
        image_url: string;
        tags?: string[];
        score?: number | null;
        likes?: number | null;
        dislikes?: number | null;
        total?: number | null;
    }>;
}

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function LuxuryResultClient() {
    const router = useRouter();
    const [result, setResult] = React.useState<ResultData | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [showResetConfirm, setShowResetConfirm] = React.useState(false);

    React.useEffect(() => {
        fetchResult();
    }, []);

    const fetchResult = async () => {
        try {
            const res = await fetch("/api/luxury/result");
            const data = await res.json();
            if (data.hasResult) {
                setResult(data.result);
            }
        } catch (err) {
            console.error("Failed to fetch result:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        try {
            await fetch("/api/luxury/reset", { method: "POST" });
            router.push("/luxury");
        } catch (err) {
            console.error("Failed to reset:", err);
        }
    };

    if (loading) {
        return (
            <LightBackground>
                <div className="flex items-center justify-center min-h-screen">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 rounded-full border-4 border-amber-200 border-t-amber-500"
                    />
                </div>
            </LightBackground>
        );
    }

    if (!result) {
        return (
            <LightBackground>
                <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
                    <GlassCard className="p-10 max-w-md">
                        <span className="text-6xl mb-6 block">🔮</span>
                        <h2 className="text-2xl font-bold mb-4 text-gray-800">診断結果がありません</h2>
                        <p className="text-gray-500 mb-8">
                            まずはスワイプ診断を行ってください
                        </p>
                        <Link href="/luxury/swipe">
                            <motion.button
                                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                診断を始める
                            </motion.button>
                        </Link>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    const brandMap = new Map<string, any>(
        (result.brandRanking ?? []).map((b) => [String(b.lane_id ?? ""), b])
    );

    return (
        <LightBackground>
            {/* ヘッダー */}
            <motion.header
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-white/80 shadow-sm"
            >
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/luxury"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-lg font-bold text-gray-800">診断結果</h1>
                        <div className="w-10" />
                    </div>
                </div>
            </motion.header>

            <div className="h-24" />

            <main className="max-w-4xl mx-auto px-4 py-8 pb-32">
                {/* メイン結果カード */}
                <FadeInView>
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", delay: 0.2 }}
                    >
                        <GlassCard className="mb-8 overflow-hidden">
                            <div
                                className="absolute inset-0 opacity-20 pointer-events-none"
                                style={{
                                    background: `linear-gradient(to right, ${result.topLane.color_primary}30, ${result.topLane.color_secondary || result.topLane.color_primary}30)`,
                                }}
                            />
                            <div className="p-8 text-center relative">
                                <motion.div
                                    animate={{
                                        scale: [1, 1.2, 1],
                                        rotate: [0, 10, -10, 0],
                                    }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="text-8xl mb-6"
                                >
                                    {result.topLane.icon_emoji}
                                </motion.div>

                                <p className="text-sm text-gray-500 mb-2">あなたのラグジュアリースタイルは...</p>

                                <h2 className="text-4xl sm:text-5xl font-bold mb-2">
                                    <span
                                        className="bg-clip-text text-transparent"
                                        style={{
                                            backgroundImage: `linear-gradient(to right, ${result.topLane.color_primary}, ${result.topLane.color_secondary || result.topLane.color_primary})`,
                                        }}
                                    >
                                        {result.topLane.name_ja}
                                    </span>
                                </h2>

                                <p className="text-gray-400 text-sm mb-6">{result.topLane.name_en}</p>

                                <div
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                                    style={{ backgroundColor: `${result.topLane.color_primary}15` }}
                                >
                                    <span className="text-2xl font-bold" style={{ color: result.topLane.color_primary }}>
                                        {Math.round(result.topLane.score)}
                                    </span>
                                    <span className="text-sm text-gray-400">マッチ度</span>
                                </div>

                                <p className="text-gray-600 text-lg max-w-lg mx-auto">
                                    {result.reason}
                                </p>
                            </div>
                        </GlassCard>
                    </motion.div>
                </FadeInView>

                {/* タグ */}
                {result.topTags.length > 0 && (
                    <FadeInView delay={0.3}>
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold mb-4 text-center text-gray-700">
                                あなたに似合うキーワード
                            </h3>
                            <div className="flex flex-wrap justify-center gap-2">
                                {result.topTags.map((tag, i) => (
                                    <motion.span
                                        key={tag}
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.4 + i * 0.1 }}
                                        className="px-4 py-2 rounded-full text-sm font-medium"
                                        style={{
                                            backgroundColor: `${result.topLane.color_primary}15`,
                                            color: result.topLane.color_primary,
                                            border: `1px solid ${result.topLane.color_primary}30`,
                                        }}
                                    >
                                        {tag}
                                    </motion.span>
                                ))}
                            </div>
                        </div>
                    </FadeInView>
                )}

                {/* ブランドランキング */}
                {result.brandRanking && result.brandRanking.length > 0 && (
                    <FadeInView delay={0.35}>
                        <GlassCard className="mb-8">
                            <div className="p-6">
                                <h3 className="text-lg font-semibold mb-4 text-center text-gray-700">
                                    あなたに合うブランド
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {result.brandRanking.map((b, i) => {
                                        const score = Math.round(Number(b.score ?? 0));
                                        return (
                                            <div
                                                key={`${b.lane_id}-${i}`}
                                                className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm flex items-center justify-between gap-4"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div
                                                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                                                        style={{ backgroundColor: `${b.color_primary ?? "#999"}20` }}
                                                    >
                                                        {b.icon_emoji ?? "💎"}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-gray-800 truncate">
                                                            {b.name_ja ?? b.lane_id}
                                                        </div>
                                                        <div className="text-xs text-gray-400 truncate">{b.name_en ?? ""}</div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            like {b.like_count ?? 0} / dislike {b.dislike_count ?? 0}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold" style={{ color: b.color_primary ?? "#111" }}>
                                                        {score}%
                                                    </div>
                                                    {b.shop_url && (
                                                        <a
                                                            href={b.shop_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="mt-2 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-white"
                                                        >
                                                            公式サイト
                                                        </a>
                                                    )}
                                                    {!b.shop_url && b.shop_slug && (
                                                        <Link
                                                            href={`/shops/${encodeURIComponent(String(b.shop_slug))}`}
                                                            className="mt-2 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-white"
                                                        >
                                                            ショップを見る
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}

                {/* 服装ランキング */}
                {result.cardRanking && result.cardRanking.length > 0 && (
                    <FadeInView delay={0.4}>
                        <GlassCard className="mb-8">
                            <div className="p-6">
                                <h3 className="text-lg font-semibold mb-4 text-center text-gray-700">
                                    あなたに合う服装
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {result.cardRanking.map((c, i) => {
                                        const brand = c.lane_id ? brandMap.get(String(c.lane_id)) : null;
                                        return (
                                            <div key={`${c.card_id}-${i}`} className="rounded-2xl border border-white/70 bg-white/70 overflow-hidden">
                                                <div className="aspect-[4/5] bg-gray-100">
                                                    <img src={c.image_url} alt={c.card_id} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="p-3">
                                                    <div className="text-xs text-gray-500 truncate">
                                                        {brand?.name_ja ?? brand?.name_en ?? c.lane_id ?? "Brand"}
                                                    </div>
                                                    <div className="text-sm font-semibold text-gray-800">
                                                        {Math.round(Number(c.score ?? 0))}%
                                                    </div>
                                                    <div className="text-[11px] text-gray-500">
                                                        like {c.likes ?? 0} / dislike {c.dislikes ?? 0}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}

                {/* スコア分布 */}
                <FadeInView delay={0.4}>
                    <GlassCard className="mb-8">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-6 text-center text-gray-700">全Laneスコア</h3>
                            <div className="space-y-3">
                                {result.scoreDistribution
                                    .sort((a, b) => b.score - a.score)
                                    .map((lane, i) => (
                                        <motion.div
                                            key={lane.lane_id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + i * 0.05 }}
                                            className="flex items-center gap-3"
                                        >
                                            <span className="text-2xl w-10 text-center">{lane.lane?.icon_emoji}</span>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium text-gray-700">
                                                        {lane.lane?.name_ja}
                                                    </span>
                                                    <span className="text-sm text-gray-500">
                                                        {Math.round(lane.score)}%
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full rounded-full"
                                                        style={{
                                                            backgroundColor: lane.lane?.color_primary ?? "#888",
                                                        }}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${lane.score}%` }}
                                                        transition={{ duration: 0.5, delay: 0.6 + i * 0.05 }}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                            </div>
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* 統計 */}
                <FadeInView delay={0.6}>
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        {[
                            { label: "総スワイプ", value: result.totalImpressions, icon: "👆" },
                            { label: "診断Lane数", value: result.scoreDistribution.length, icon: "📊" },
                            { label: "マッチ度", value: `${Math.round(result.topLane.score)}%`, icon: "💎" },
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 + i * 0.1 }}
                            >
                                <GlassCard className="p-4 text-center">
                                    <span className="text-2xl mb-2 block">{stat.icon}</span>
                                    <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                                    <p className="text-xs text-gray-400">{stat.label}</p>
                                </GlassCard>
                            </motion.div>
                        ))}
                    </div>
                </FadeInView>

                {/* アクションボタン */}
                <FadeInView delay={0.8}>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/luxury/swipe">
                            <motion.button
                                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                もっとスワイプする
                            </motion.button>
                        </Link>
                        <motion.button
                            onClick={() => setShowResetConfirm(true)}
                            className="px-8 py-4 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/60 text-gray-600 font-medium hover:bg-white/80 transition-all shadow-sm"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            診断をリセット
                        </motion.button>
                    </div>
                </FadeInView>
            </main>

            {/* リセット確認モーダル */}
            <AnimatePresence>
                {showResetConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
                        onClick={() => setShowResetConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 max-w-sm w-full border border-white/80 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold mb-2 text-gray-800">診断をリセット</h3>
                            <p className="text-gray-500 text-sm mb-6">
                                すべてのスワイプ履歴と診断結果が削除されます。この操作は取り消せません。
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowResetConfirm(false)}
                                    className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition-all"
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={handleReset}
                                    className="flex-1 py-3 rounded-xl bg-red-100 border border-red-200 text-red-600 font-medium hover:bg-red-200 transition-all"
                                >
                                    リセット
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* フローティングナビ */}
            <FloatingNavLight items={NAV_ITEMS} activeHref="/luxury" />
        </LightBackground>
    );
}
