"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { GlassCard, GlassBadge, FadeInView } from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type {
    AssertionInsight,
    AssertionCategory,
    UserReaction,
} from "../_lib/assertionEngine";
import {
    recordReaction,
    getCategoryMeta,
} from "../_lib/assertionEngine";
import {
    renderShareCard,
    downloadShareCard,
} from "../_lib/shareCardRenderer";

/* ── Category gradient mapping ── */

const CATEGORY_GRADIENTS: Record<AssertionCategory, string> = {
    identity: "from-indigo-500 to-purple-600",
    pattern: "from-sky-500 to-indigo-600",
    hidden: "from-pink-500 to-purple-600",
    evolution: "from-emerald-500 to-cyan-600",
    contradiction: "from-amber-500 to-red-500",
};

const CATEGORY_LABELS: Record<AssertionCategory, string> = {
    identity: "\u30A2\u30A4\u30C7\u30F3\u30C6\u30A3\u30C6\u30A3",
    pattern: "\u30D1\u30BF\u30FC\u30F3",
    hidden: "\u96A0\u3055\u308C\u305F\u81EA\u5206",
    evolution: "\u9032\u5316",
    contradiction: "\u77DB\u76FE",
};

const REACTION_CONFIG: Array<{
    value: UserReaction;
    label: string;
    icon: string;
}> = [
    { value: "agree", label: "\u305D\u3046\u601D\u3046", icon: "\u2714" },
    { value: "surprise", label: "\u9A5A\u3044\u305F", icon: "\u203C" },
    { value: "disagree", label: "\u9055\u3046\u6C17\u304C\u3059\u308B", icon: "\u2026" },
];

/* ── Single Assertion Card ── */

function SingleAssertionCard({
    insight,
    onReaction,
    isActive,
}: {
    insight: AssertionInsight;
    onReaction: (id: string, category: AssertionCategory, reaction: UserReaction) => void;
    isActive: boolean;
}) {
    const [showEvidence, setShowEvidence] = useState(false);
    const [reacted, setReacted] = useState<UserReaction | undefined>(
        insight.userReaction,
    );
    const [sharePreview, setSharePreview] = useState<string | null>(null);
    const [shareLoading, setShareLoading] = useState(false);
    const meta = getCategoryMeta(insight.category);
    const gradient = CATEGORY_GRADIENTS[insight.category];

    const handleReaction = (reaction: UserReaction) => {
        setReacted(reaction);
        onReaction(insight.id, insight.category, reaction);
    };

    const handleShare = async () => {
        if (sharePreview) {
            setSharePreview(null);
            return;
        }
        setShareLoading(true);
        try {
            const dataUrl = await renderShareCard(insight);
            setSharePreview(dataUrl);
        } catch {
            // silent fail
        } finally {
            setShareLoading(false);
        }
    };

    const handleDownload = () => {
        if (sharePreview) {
            const filename = `aneurasync-${insight.category}-${Date.now()}.png`;
            downloadShareCard(sharePreview, filename);
        }
    };

    return (
        <motion.div
            className="w-full flex-shrink-0 px-1"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: isActive ? 1 : 0.5, scale: isActive ? 1 : 0.92 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
            <div
                className={cn(
                    "relative overflow-hidden rounded-3xl p-6 min-h-[280px] flex flex-col justify-between",
                    "bg-gradient-to-br",
                    gradient,
                )}
            >
                {/* Glow orbs */}
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/5 blur-3xl pointer-events-none" />

                {/* Subtle particles */}
                {isActive && (
                    <>
                        {[0, 1, 2, 3].map((i) => (
                            <motion.div
                                key={i}
                                className="absolute w-1 h-1 rounded-full bg-white/30"
                                style={{
                                    left: `${20 + i * 20}%`,
                                    top: `${15 + i * 15}%`,
                                }}
                                animate={{
                                    y: [0, -12, 0],
                                    opacity: [0.2, 0.6, 0.2],
                                }}
                                transition={{
                                    duration: 2.5 + i * 0.5,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: i * 0.4,
                                }}
                            />
                        ))}
                    </>
                )}

                {/* Header */}
                <div className="relative z-10">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{meta.icon}</span>
                        <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
                            {CATEGORY_LABELS[insight.category]}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-[10px] font-bold text-white/40 tracking-wider">
                                {"\u78BA\u4FE1\u5EA6"} {Math.round(insight.confidence * 100)}%
                            </span>
                            {insight.shareable && (
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    disabled={shareLoading}
                                    className="rounded-lg bg-white/15 p-1.5 text-white/60 transition-all hover:bg-white/25 hover:text-white/90"
                                    title={"\u30B7\u30A7\u30A2\u30AB\u30FC\u30C9\u3092\u751F\u6210"}
                                >
                                    <svg className={cn("h-4 w-4", shareLoading && "animate-spin")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {shareLoading ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                        )}
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Statement */}
                <div className="relative z-10 flex-1 flex items-center py-6">
                    <motion.p
                        className="text-lg sm:text-xl font-bold text-white leading-relaxed text-center w-full"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        {insight.statement}
                    </motion.p>
                </div>

                {/* Evidence toggle & reactions */}
                <div className="relative z-10 space-y-3">
                    <button
                        type="button"
                        onClick={() => setShowEvidence(!showEvidence)}
                        className="text-xs font-bold text-white/60 hover:text-white/90 transition-colors"
                    >
                        {showEvidence
                            ? "\u2715 \u9589\u3058\u308B"
                            : "\u25B6 \u306A\u305C\u305D\u3046\u8A00\u3048\u308B\u306E\u304B"}
                    </button>

                    <AnimatePresence>
                        {showEvidence && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                            >
                                <div className="rounded-xl bg-black/15 backdrop-blur-sm p-3 space-y-1.5">
                                    {insight.evidence.map((ev, i) => (
                                        <div
                                            key={i}
                                            className="flex items-start gap-2 text-[12px] text-white/80"
                                        >
                                            <span className="mt-0.5 text-white/40">{"\u2022"}</span>
                                            <span>{ev}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Share preview */}
                    <AnimatePresence>
                        {sharePreview && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                            >
                                <div className="rounded-xl bg-black/20 backdrop-blur-sm p-3 space-y-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={sharePreview}
                                        alt={"\u30B7\u30A7\u30A2\u30AB\u30FC\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC"}
                                        className="w-full rounded-lg"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleDownload}
                                        className="w-full rounded-xl bg-white/20 py-2 text-xs font-bold text-white transition-all hover:bg-white/30"
                                    >
                                        {"\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9"}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Reaction buttons */}
                    <div className="flex items-center gap-2">
                        {REACTION_CONFIG.map((r) => (
                            <button
                                key={r.value}
                                type="button"
                                onClick={() => handleReaction(r.value)}
                                className={cn(
                                    "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                                    reacted === r.value
                                        ? "bg-white text-slate-900 shadow-lg"
                                        : "bg-white/15 text-white/80 hover:bg-white/25",
                                )}
                            >
                                <span className="mr-1">{r.icon}</span>
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/* ── Main Carousel Component ── */

interface AssertionInsightCarouselProps {
    insights: AssertionInsight[];
    className?: string;
}

export default function AssertionInsightCarouselV2({
    insights,
    className,
}: AssertionInsightCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleReaction = useCallback(
        (id: string, category: AssertionCategory, reaction: UserReaction) => {
            recordReaction(id, category, reaction);
        },
        [],
    );

    const handleDragEnd = useCallback(
        (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            const threshold = 50;
            if (info.offset.x < -threshold && currentIndex < insights.length - 1) {
                setCurrentIndex((prev) => prev + 1);
            } else if (info.offset.x > threshold && currentIndex > 0) {
                setCurrentIndex((prev) => prev - 1);
            }
        },
        [currentIndex, insights.length],
    );

    if (insights.length === 0) {
        return (
            <FadeInView>
                <GlassCard className="text-center py-10">
                    <p className="text-3xl mb-3">{"\u{1F52E}"}</p>
                    <p className="text-sm text-slate-500">
                        {"\u30C7\u30FC\u30BF\u304C\u5897\u3048\u308B\u3068\u3001\u3042\u306A\u305F\u3060\u3051\u306E\u65AD\u8A00\u30A4\u30F3\u30B5\u30A4\u30C8\u304C\u751F\u6210\u3055\u308C\u307E\u3059"}
                    </p>
                </GlassCard>
            </FadeInView>
        );
    }

    return (
        <FadeInView className={className}>
            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between px-1">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">
                            {"\u65AD\u8A00\u30A4\u30F3\u30B5\u30A4\u30C8"}
                        </h3>
                        <p className="text-[13px] text-slate-500">
                            {"\u3042\u306A\u305F\u306E\u30C7\u30FC\u30BF\u304C\u8A9E\u308B\u3001\u5927\u80C6\u306A\u65AD\u8A00"}
                        </p>
                    </div>
                    {insights.length > 1 && (
                        <GlassBadge variant="info" size="sm">
                            {currentIndex + 1} / {insights.length}
                        </GlassBadge>
                    )}
                </div>

                {/* Carousel */}
                <motion.div
                    ref={containerRef}
                    className="overflow-hidden"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.15}
                    onDragEnd={handleDragEnd}
                >
                    <motion.div
                        className="flex"
                        animate={{ x: `-${currentIndex * 100}%` }}
                        transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                        }}
                    >
                        {insights.map((insight, i) => (
                            <div
                                key={insight.id}
                                className="w-full flex-shrink-0"
                            >
                                <SingleAssertionCard
                                    insight={insight}
                                    onReaction={handleReaction}
                                    isActive={i === currentIndex}
                                />
                            </div>
                        ))}
                    </motion.div>
                </motion.div>

                {/* Dots */}
                {insights.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5">
                        {insights.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setCurrentIndex(i)}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    i === currentIndex
                                        ? "w-6 bg-slate-900"
                                        : "w-1.5 bg-slate-300 hover:bg-slate-400",
                                )}
                            />
                        ))}
                    </div>
                )}
            </div>
        </FadeInView>
    );
}
