// app/luxury/swipe/LuxurySwipeClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

interface LuxuryCard {
    card_id: string;
    lane_id: string;
    image_url: string;
    tags: string[] | null;
    luxury_lanes: {
        name_ja: string;
        name_en: string;
        color_primary: string;
        icon_emoji: string;
    };
}

export default function LuxurySwipeClient() {
    const router = useRouter();
    const [cards, setCards] = React.useState<LuxuryCard[]>([]);
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [swiping, setSwiping] = React.useState(false);
    const [swipeDirection, setSwipeDirection] = React.useState<"left" | "right" | null>(null);
    const [stats, setStats] = React.useState({ likes: 0, dislikes: 0, total: 0 });
    const MIN_SWIPES = 20;

    // カードを取得
    const fetchCards = async () => {
        try {
            const res = await fetch("/api/luxury/cards?limit=30&excludeSeen=true");
            const data = await res.json();
            if (data.cards) {
                setCards(data.cards);
            }
        } catch (err) {
            console.error("Failed to fetch cards:", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchCards();
    }, []);

    // スワイプアクション
    const handleSwipe = async (action: "like" | "dislike" | "skip") => {
        if (swiping || currentIndex >= cards.length) return;

        const card = cards[currentIndex];
        setSwiping(true);
        setSwipeDirection(action === "like" ? "right" : "left");

        // 統計更新
        setStats(prev => ({
            ...prev,
            likes: prev.likes + (action === "like" ? 1 : 0),
            dislikes: prev.dislikes + (action === "dislike" ? 1 : 0),
            total: prev.total + 1,
        }));

        try {
            await fetch("/api/luxury/impression", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    card_id: card.card_id,
                    lane_id: card.lane_id,
                    action,
                }),
            });
        } catch (err) {
            console.error("Failed to save impression:", err);
        }

        // 次のカードへ
        setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
            setSwiping(false);
            setSwipeDirection(null);
        }, 300);
    };

    const currentCard = cards[currentIndex];
    const nextCard = cards[currentIndex + 1];
    const isFinished = !loading && currentIndex >= cards.length;
    const noCards = !loading && cards.length === 0;

    // 診断完了チェック（like/dislike が一定数）
    const ratedTotal = stats.likes + stats.dislikes;
    const canSeeResult = ratedTotal >= MIN_SWIPES;

    return (
        <LightBackground>
            {/* ヘッダー */}
            <motion.header
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-white/80 shadow-sm"
            >
                <div className="max-w-xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/luxury"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>

                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">スワイプ診断</p>
                            <p className="text-xs text-gray-400">
                                {stats.total} / {cards.length}
                            </p>
                        </div>

                        {canSeeResult && (
                            <Link
                                href="/luxury/result"
                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-600 text-xs font-medium"
                            >
                                結果を見る
                            </Link>
                        )}
                        {!canSeeResult && <div className="w-20" />}
                    </div>

                    {/* プログレスバー */}
                    <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${(stats.total / Math.max(cards.length, 1)) * 100}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                </div>
            </motion.header>

            <div className="h-32" />

            <main className="max-w-xl mx-auto px-4 pb-32">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-[60vh]">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="w-16 h-16 rounded-full border-4 border-amber-200 border-t-amber-500"
                        />
                        <p className="mt-4 text-gray-500">カードを読み込み中...</p>
                    </div>
                ) : noCards ? (
                    <FadeInView>
                        <GlassCard className="p-8">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-6xl mb-6 block">🗂️</span>
                                <h2 className="text-xl font-bold mb-3 text-gray-800">カードがありません</h2>
                                <p className="text-gray-500 mb-6">
                                    現在表示できるカードがありません。後でもう一度お試しください。
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <motion.button
                                        className="px-6 py-3 rounded-xl bg-white/80 border border-white/80 text-gray-700 font-medium shadow-sm"
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => router.push("/luxury")}
                                    >
                                        戻る
                                    </motion.button>
                                </div>
                            </div>
                        </GlassCard>
                    </FadeInView>
                ) : isFinished && canSeeResult ? (
                    <FadeInView>
                        <GlassCard className="p-8">
                            <div className="flex flex-col items-center justify-center text-center">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="text-7xl mb-6"
                                >
                                    🎉
                                </motion.div>
                                <h2 className="text-2xl font-bold mb-4 text-gray-800">
                                    診断完了！
                                </h2>
                                <p className="text-gray-500 mb-6">
                                    {ratedTotal}枚のカードを評価しました
                                </p>
                                <div className="flex gap-8 mb-8">
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-emerald-500">{stats.likes}</p>
                                        <p className="text-xs text-gray-400">Like</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-rose-500">{stats.dislikes}</p>
                                        <p className="text-xs text-gray-400">Dislike</p>
                                    </div>
                                </div>
                                <Link href="/luxury/result">
                                    <motion.button
                                        className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        結果を見る →
                                    </motion.button>
                                </Link>
                            </div>
                        </GlassCard>
                    </FadeInView>
                ) : isFinished ? (
                    <FadeInView>
                        <GlassCard className="p-8">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-6xl mb-6 block">⏳</span>
                                <h2 className="text-xl font-bold mb-3 text-gray-800">診断に必要な枚数が不足しています</h2>
                                <p className="text-gray-500 mb-6">
                                    さらにカードが必要ですが、現在は表示できるカードがありません。
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <motion.button
                                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30"
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={async () => {
                                            await fetch("/api/luxury/reset", { method: "POST" });
                                            router.push("/luxury");
                                        }}
                                    >
                                        診断をリセット
                                    </motion.button>
                                    <motion.button
                                        className="px-6 py-3 rounded-xl bg-white/80 border border-white/80 text-gray-700 font-medium shadow-sm"
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => router.push("/luxury")}
                                    >
                                        戻る
                                    </motion.button>
                                </div>
                            </div>
                        </GlassCard>
                    </FadeInView>
                ) : (
                    <>
                        {/* カードスタック */}
                        <div className="relative h-[500px] w-full">
                            {/* 次のカード（背景） */}
                            {nextCard && (
                                <motion.div
                                    className="absolute inset-0 rounded-3xl overflow-hidden"
                                    initial={{ scale: 0.95, opacity: 0.5 }}
                                    animate={{ scale: 0.95, opacity: 0.5 }}
                                >
                                    <div
                                        className="w-full h-full bg-cover bg-center"
                                        style={{
                                            backgroundImage: `url(${nextCard.image_url})`,
                                            backgroundColor: "#f3f4f6",
                                        }}
                                    />
                                </motion.div>
                            )}

                            {/* 現在のカード */}
                            {currentCard && (
                                <SwipeCard
                                    card={currentCard}
                                    onSwipe={handleSwipe}
                                    swipeDirection={swipeDirection}
                                />
                            )}
                        </div>

                        {/* アクションボタン */}
                        <div className="flex justify-center gap-6 mt-8">
                            <motion.button
                                onClick={() => handleSwipe("dislike")}
                                disabled={swiping}
                                className="w-16 h-16 rounded-full bg-rose-100 border-2 border-rose-300 flex items-center justify-center text-rose-500 hover:bg-rose-200 disabled:opacity-50 transition-all shadow-lg"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </motion.button>

                            <motion.button
                                onClick={() => handleSwipe("skip")}
                                disabled={swiping}
                                className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-200 disabled:opacity-50 transition-all self-center shadow-md"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
                            </motion.button>

                            <motion.button
                                onClick={() => handleSwipe("like")}
                                disabled={swiping}
                                className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-500 hover:bg-emerald-200 disabled:opacity-50 transition-all shadow-lg"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            </motion.button>
                        </div>

                        {/* ヒント */}
                        <p className="text-center text-xs text-gray-400 mt-6">
                            ← Dislike　|　Skip →　|　Like →
                        </p>
                    </>
                )}
            </main>
        </LightBackground>
    );
}

// スワイプカードコンポーネント
function SwipeCard({
    card,
    onSwipe,
    swipeDirection,
}: {
    card: LuxuryCard;
    onSwipe: (action: "like" | "dislike" | "skip") => void;
    swipeDirection: "left" | "right" | null;
}) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-15, 15]);
    const opacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);

    const likeOpacity = useTransform(x, [0, 100], [0, 1]);
    const dislikeOpacity = useTransform(x, [-100, 0], [1, 0]);

    const handleDragEnd = (_: any, info: any) => {
        if (info.offset.x > 100) {
            onSwipe("like");
        } else if (info.offset.x < -100) {
            onSwipe("dislike");
        }
    };

    return (
        <motion.div
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            style={{ x, rotate }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            animate={{
                x: swipeDirection === "right" ? 500 : swipeDirection === "left" ? -500 : 0,
                opacity: swipeDirection ? 0 : 1,
            }}
            transition={{ duration: 0.3 }}
        >
            <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-white/80 bg-white">
                {/* 画像 */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage: `url(${card.image_url})`,
                        backgroundColor: "#f3f4f6",
                    }}
                />

                {/* グラデーションオーバーレイ */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                {/* Like/Dislike インジケーター */}
                <motion.div
                    className="absolute top-8 right-8 px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold text-lg rotate-12 shadow-lg"
                    style={{ opacity: likeOpacity }}
                >
                    LIKE
                </motion.div>
                <motion.div
                    className="absolute top-8 left-8 px-4 py-2 rounded-lg bg-rose-500 text-white font-bold text-lg -rotate-12 shadow-lg"
                    style={{ opacity: dislikeOpacity }}
                >
                    NOPE
                </motion.div>

                {/* カード情報 */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-center gap-2 mb-2">
                        <span
                            className="px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm"
                            style={{
                                backgroundColor: `${card.luxury_lanes?.color_primary ?? "#888"}40`,
                                color: "#fff",
                            }}
                        >
                            {card.luxury_lanes?.icon_emoji} {card.luxury_lanes?.name_ja ?? "Unknown"}
                        </span>
                    </div>
                    {card.tags && card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {card.tags.slice(0, 4).map(tag => (
                                <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white/90 text-xs"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
