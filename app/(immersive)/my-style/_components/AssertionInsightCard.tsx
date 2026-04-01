"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
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

/* ── Category accent colors ── */

const CATEGORY_ACCENTS: Record<AssertionCategory, string> = {
    identity: "bg-indigo-50 border-indigo-200/60 text-indigo-700",
    pattern: "bg-sky-50 border-sky-200/60 text-sky-700",
    hidden: "bg-pink-50 border-pink-200/60 text-pink-700",
    evolution: "bg-emerald-50 border-emerald-200/60 text-emerald-700",
    contradiction: "bg-amber-50 border-amber-200/60 text-amber-700",
};

const REACTION_CONFIG: Array<{ value: UserReaction; label: string }> = [
    { value: "agree", label: "そう思う" },
    { value: "surprise", label: "驚いた" },
    { value: "disagree", label: "違う気がする" },
];

/* ── Single Assertion (compact) ── */

function SingleAssertion({
    insight,
    onReaction,
}: {
    insight: AssertionInsight;
    onReaction: (id: string, category: AssertionCategory, reaction: UserReaction) => void;
}) {
    const [showEvidence, setShowEvidence] = useState(false);
    const [reacted, setReacted] = useState<UserReaction | undefined>(insight.userReaction);
    const meta = getCategoryMeta(insight.category);

    const handleReaction = (reaction: UserReaction) => {
        setReacted(reaction);
        onReaction(insight.id, insight.category, reaction);
    };

    return (
        <div className={cn("rounded-xl border p-3 space-y-2", CATEGORY_ACCENTS[insight.category])}>
            {/* Category + confidence */}
            <div className="flex items-center gap-1.5">
                <span className="text-sm">{meta.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    {insight.confidence >= 0.8 ? "高確信" : "仮説"}
                </span>
            </div>

            {/* Statement */}
            <p className="text-[13px] font-bold leading-snug">{insight.statement}</p>

            {/* Evidence toggle */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setShowEvidence(!showEvidence)}
                    className="text-[10px] opacity-50 hover:opacity-80 transition"
                >
                    {showEvidence ? "閉じる" : "なぜ？"}
                </button>
                {!reacted && (
                    <div className="flex gap-1 ml-auto">
                        {REACTION_CONFIG.map((r) => (
                            <button
                                key={r.value}
                                type="button"
                                onClick={() => handleReaction(r.value)}
                                className="rounded-full border border-current/20 px-2 py-0.5 text-[9px] font-bold opacity-50 hover:opacity-80 transition"
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                )}
                {reacted && (
                    <span className="ml-auto text-[9px] opacity-40">回答済み</span>
                )}
            </div>

            {/* Evidence */}
            <AnimatePresence>
                {showEvidence && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-1 pt-1">
                            {insight.evidence.map((ev, i) => (
                                <p key={i} className="text-[10px] opacity-60">• {ev}</p>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Main Component ── */

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

    if (insights.length === 0) return null;

    return (
        <div className={className}>
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
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                    {insights.map((insight) => (
                        <div key={insight.id} className="w-full flex-shrink-0 px-0.5">
                            <SingleAssertion insight={insight} onReaction={handleReaction} />
                        </div>
                    ))}
                </motion.div>
            </motion.div>

            {/* Dots */}
            {insights.length > 1 && (
                <div className="flex items-center justify-center gap-1 mt-2">
                    {insights.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setCurrentIndex(i)}
                            className={cn(
                                "h-1 rounded-full transition-all",
                                i === currentIndex ? "w-4 bg-slate-900" : "w-1 bg-slate-300",
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
