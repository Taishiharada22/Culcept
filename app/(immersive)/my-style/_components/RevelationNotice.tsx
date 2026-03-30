"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, GlassBadge, FadeInView, ProgressRing, GlassModal } from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type { RevealableInsight, RevealRequirement } from "../_lib/progressiveReveal";
import { getNextMilestone, getOverallProgress } from "../_lib/progressiveReveal";

/* ── Requirement type labels ── */

const REQUIREMENT_LABELS: Record<string, string> = {
    wardrobe_count: "\u30A2\u30A4\u30C6\u30E0",
    wear_logs: "\u7740\u7528\u8A18\u9332",
    observation_logs: "\u89B3\u5BDF",
    swipe_phases: "\u30D5\u30A7\u30FC\u30BA",
    identity_tags: "\u30BF\u30B0",
    setups: "\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7",
    days_active: "\u65E5",
    contradiction_sessions: "\u5BFE\u8A71",
};

const CATEGORY_ICONS: Record<string, string> = {
    pattern: "\u{1F52C}",
    prediction: "\u{1F52E}",
    deep_self: "\u{1F30C}",
    evolution: "\u{1F331}",
    relationship: "\u{1F91D}",
};

/* ── Requirement progress bar ── */

function RequirementBar({ req }: { req: RevealRequirement }) {
    const progress = Math.min(1, req.current / req.required);
    const isMet = req.current >= req.required;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
                <span className={isMet ? "text-emerald-600 font-bold" : "text-slate-500"}>
                    {req.label}
                </span>
                <span className={cn("font-mono", isMet ? "text-emerald-600" : "text-slate-400")}>
                    {req.current}/{req.required}
                </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                    className={cn(
                        "h-full rounded-full",
                        isMet
                            ? "bg-emerald-400"
                            : progress > 0.7
                              ? "bg-gradient-to-r from-violet-400 to-rose-400"
                              : "bg-slate-300",
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                />
            </div>
        </div>
    );
}

/* ── Locked insight card ── */

function LockedInsightCard({
    insight,
    isNext,
}: {
    insight: RevealableInsight;
    isNext: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const icon = CATEGORY_ICONS[insight.category] ?? "\u{1F513}";

    return (
        <motion.div
            className={cn(
                "rounded-2xl border p-4 transition-all",
                isNext
                    ? "border-violet-200/60 bg-gradient-to-br from-violet-50/40 to-white/90"
                    : "border-slate-200/40 bg-white/40 backdrop-blur-sm",
            )}
            whileHover={{ scale: 1.01 }}
        >
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left"
            >
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center text-lg",
                            isNext
                                ? "bg-violet-100 shadow-inner"
                                : "bg-slate-100",
                        )}
                    >
                        {"\u{1F512}"}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-bold text-slate-800 truncate">
                            {insight.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {insight.description}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-[13px] font-bold text-slate-700">
                            {Math.round(insight.currentProgress * 100)}%
                        </span>
                    </div>
                </div>

                {/* Compact progress bar */}
                <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                        className={cn(
                            "h-full rounded-full",
                            isNext
                                ? "bg-gradient-to-r from-violet-400 to-rose-400"
                                : "bg-slate-300",
                        )}
                        initial={{ width: 0 }}
                        animate={{
                            width: `${insight.currentProgress * 100}%`,
                        }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                </div>

                {/* Glow animation when close to unlocking */}
                {isNext && insight.currentProgress > 0.7 && (
                    <motion.div
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        animate={{ boxShadow: ["0 0 0 0 rgba(139,92,246,0)", "0 0 15px 2px rgba(139,92,246,0.15)", "0 0 0 0 rgba(139,92,246,0)"] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    />
                )}
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
                            {insight.requirements.map((req) => (
                                <RequirementBar
                                    key={req.type}
                                    req={req}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ── Unlocked insight card ── */

function UnlockedInsightCard({
    insight,
}: {
    insight: RevealableInsight;
}) {
    const [expanded, setExpanded] = useState(false);
    const icon = CATEGORY_ICONS[insight.category] ?? "\u{1F513}";

    return (
        <motion.div
            className="rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/30 to-white/90 p-4"
            whileHover={{ scale: 1.01 }}
        >
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-lg">
                        {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-[14px] font-bold text-slate-800 truncate">
                                {insight.title}
                            </h4>
                            <GlassBadge variant="success" size="sm">
                                {"\u89E3\u653E\u6E08\u307F"}
                            </GlassBadge>
                        </div>
                        {insight.unlockedAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                                {new Date(insight.unlockedAt).toLocaleDateString("ja-JP")}{" "}{"\u306B\u89E3\u653E"}
                            </p>
                        )}
                    </div>
                    <span className="text-slate-400 text-sm">
                        {expanded ? "\u25B2" : "\u25BC"}
                    </span>
                </div>
            </button>

            <AnimatePresence>
                {expanded && insight.content && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 pt-3 border-t border-emerald-200/50">
                            <p className="text-[13px] text-slate-700 leading-relaxed">
                                {insight.content}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ── Unlock celebration modal ── */

function UnlockCelebration({
    insight,
    onClose,
}: {
    insight: RevealableInsight;
    onClose: () => void;
}) {
    const [revealed, setRevealed] = useState(false);
    const icon = CATEGORY_ICONS[insight.category] ?? "\u{1F513}";

    useEffect(() => {
        const timer = setTimeout(() => setRevealed(true), 800);
        return () => clearTimeout(timer);
    }, []);

    return (
        <GlassModal isOpen onClose={onClose} size="sm">
            <div className="text-center space-y-5 py-4">
                {/* Celebration particles */}
                <div className="relative h-20 flex items-center justify-center">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <motion.div
                            key={i}
                            className="absolute w-2 h-2 rounded-full"
                            style={{
                                background: [
                                    "#ec4899",
                                    "#8b5cf6",
                                    "#06b6d4",
                                    "#f59e0b",
                                    "#10b981",
                                    "#6366f1",
                                ][i],
                            }}
                            initial={{ scale: 0, x: 0, y: 0 }}
                            animate={{
                                scale: [0, 1, 0],
                                x: Math.cos((i * Math.PI * 2) / 6) * 60,
                                y: Math.sin((i * Math.PI * 2) / 6) * 60,
                            }}
                            transition={{
                                duration: 1.2,
                                delay: 0.3 + i * 0.1,
                                ease: "easeOut",
                            }}
                        />
                    ))}
                    <motion.div
                        className="text-4xl"
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 200,
                            damping: 15,
                            delay: 0.2,
                        }}
                    >
                        {icon}
                    </motion.div>
                </div>

                <div>
                    <motion.h3
                        className="text-xl font-bold text-slate-900"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        {"\u65B0\u3057\u3044\u30A4\u30F3\u30B5\u30A4\u30C8\u304C\u89E3\u653E\u3055\u308C\u307E\u3057\u305F"}
                    </motion.h3>
                    <motion.p
                        className="text-sm text-slate-500 mt-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                    >
                        {insight.title}
                    </motion.p>
                </div>

                {/* Character-by-character reveal */}
                <AnimatePresence>
                    {revealed && insight.content && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="rounded-2xl bg-slate-50 border border-slate-200/50 p-4"
                        >
                            <p className="text-[14px] text-slate-700 leading-relaxed text-left">
                                {insight.content.split("").map((char, i) => (
                                    <motion.span
                                        key={i}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{
                                            delay: 0.02 * i,
                                            duration: 0.1,
                                        }}
                                    >
                                        {char}
                                    </motion.span>
                                ))}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                >
                    <GlassButton
                        variant="primary"
                        size="sm"
                        onClick={onClose}
                    >
                        {"\u4FDD\u5B58"}
                    </GlassButton>
                </motion.div>
            </div>
        </GlassModal>
    );
}

/* ── Main Component ── */

interface RevelationNoticeV2Props {
    status: RevealableInsight[];
    className?: string;
}

export default function RevelationNoticeV2({
    status,
    className,
}: RevelationNoticeV2Props) {
    const [celebratingInsight, setCelebratingInsight] =
        useState<RevealableInsight | null>(null);
    const [showAll, setShowAll] = useState(false);

    const overall = useMemo(() => getOverallProgress(status), [status]);
    const nextMilestoneData = useMemo(
        () => getNextMilestone(status),
        [status],
    );

    const unlocked = status.filter((s) => s.isUnlocked);
    const locked = status.filter((s) => !s.isUnlocked);

    return (
        <FadeInView className={className}>
            <div className="space-y-4">
                {/* Header with progress ring */}
                <div className="flex items-center gap-4 px-1">
                    <ProgressRing
                        progress={overall.percentage}
                        size={64}
                        strokeWidth={5}
                    >
                        <span className="text-sm font-bold text-slate-900">
                            {overall.unlocked}/{overall.total}
                        </span>
                    </ProgressRing>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900">
                            {"\u6BB5\u968E\u7684\u958B\u793A"}
                        </h3>
                        <p className="text-[13px] text-slate-500">
                            {"\u30C7\u30FC\u30BF\u304C\u5897\u3048\u308B\u307B\u3069\u3001\u6DF1\u3044\u30A4\u30F3\u30B5\u30A4\u30C8\u304C\u898B\u3048\u3066\u304D\u307E\u3059"}
                        </p>
                    </div>
                </div>

                {/* Next milestone highlight */}
                {nextMilestoneData && (
                    <GlassCard
                        variant="gradient"
                        padding="sm"
                        hoverEffect={false}
                    >
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">{"\u{1F3AF}"}</span>
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                    {"\u6B21\u306E\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3"}
                                </span>
                            </div>
                            <p className="text-[14px] font-bold text-slate-800">
                                {nextMilestoneData.insight.title}
                            </p>
                            <p className="text-[12px] text-slate-500">
                                {"\u3042\u3068"}{" "}
                                <span className="font-bold text-violet-600">
                                    {Math.max(
                                        0,
                                        nextMilestoneData.closestRequirement
                                            .required -
                                            nextMilestoneData
                                                .closestRequirement.current,
                                    )}
                                </span>{" "}
                                {REQUIREMENT_LABELS[
                                    nextMilestoneData.closestRequirement.type
                                ] ?? "\u56DE"}{"\u306E\u8A18\u9332\u3067\u300C"}
                                {nextMilestoneData.insight.title}
                                {"\u300D\u304C\u898B\u3048\u3066\u304D\u307E\u3059"}
                            </p>
                            <RequirementBar
                                req={nextMilestoneData.closestRequirement}
                            />
                        </div>
                    </GlassCard>
                )}

                {/* Toggle to show all */}
                <div className="flex items-center justify-center">
                    <button
                        type="button"
                        onClick={() => setShowAll(!showAll)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        {showAll
                            ? "\u25B2 \u7C21\u6F54\u8868\u793A"
                            : `\u25BC \u5168${status.length}\u4EF6\u306E\u30A4\u30F3\u30B5\u30A4\u30C8\u3092\u898B\u308B`}
                    </button>
                </div>

                {/* Full list */}
                <AnimatePresence>
                    {showAll && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="overflow-hidden space-y-2"
                        >
                            {/* Unlocked section */}
                            {unlocked.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider px-1">
                                        {"\u89E3\u653E\u6E08\u307F"}
                                    </h4>
                                    {unlocked.map((insight) => (
                                        <UnlockedInsightCard
                                            key={insight.id}
                                            insight={insight}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Locked section */}
                            {locked.length > 0 && (
                                <div className="space-y-2 mt-3">
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                        {"\u672A\u89E3\u653E"}
                                    </h4>
                                    {locked.map((insight) => (
                                        <LockedInsightCard
                                            key={insight.id}
                                            insight={insight}
                                            isNext={
                                                insight.id ===
                                                nextMilestoneData?.insight.id
                                            }
                                        />
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Unlock celebration */}
            {celebratingInsight && (
                <UnlockCelebration
                    insight={celebratingInsight}
                    onClose={() => setCelebratingInsight(null)}
                />
            )}
        </FadeInView>
    );
}
