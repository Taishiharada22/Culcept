"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GlassCard,
    GlassBadge,
    GlassButton,
    FadeInView,
} from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type { WardrobeItem } from "../_lib/types";
import {
    TRIGGER_OPTIONS,
    CONTEXT_OPTIONS,
    saveObservation,
    getObservations,
    getTodayObservationCount,
    analyzeObservationPatterns,
    getTriggerDistribution,
    getObservationStats,
    type ObservationEntry,
    type ObservationInsight,
} from "../_lib/observationLog";
import { recordWear } from "../_lib/costPerWear";

/* ── Props ── */

interface ObservationLogButtonProps {
    wardrobeItems: WardrobeItem[];
}

/* ── Sub-components ── */

function StarRating({
    value,
    onChange,
    label,
}: {
    value: number;
    onChange: (v: number) => void;
    label: string;
}) {
    return (
        <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700">
                {label}
            </p>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        className="transition-transform hover:scale-110"
                    >
                        <motion.span
                            className="text-2xl"
                            animate={{
                                scale: star <= value ? 1.1 : 1,
                            }}
                            transition={{ type: "spring", stiffness: 400 }}
                        >
                            {star <= value ? "\u2B50" : "\u2606"}
                        </motion.span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function InsightsSummary({ insights }: { insights: ObservationInsight[] }) {
    if (insights.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-violet-200/60 bg-violet-50/50 p-4"
        >
            <p className="text-xs font-bold uppercase tracking-wider text-violet-500">
                あなたの選択パターン
            </p>
            <div className="mt-2 space-y-2">
                {insights.slice(0, 3).map((insight, i) => (
                    <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 text-violet-400">
                            <svg
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06L5.403 4.343a.75.75 0 10-1.06 1.06l1.06 1.06z" />
                            </svg>
                        </span>
                        <p className="text-xs leading-relaxed text-slate-600">
                            {insight.description}
                        </p>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

function CelebrationEffect() {
    return (
        <motion.div
            className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.5, delay: 0.5 }}
        >
            {[...Array(12)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute h-2 w-2 rounded-full"
                    style={{
                        backgroundColor: [
                            "#ec4899",
                            "#8b5cf6",
                            "#06b6d4",
                            "#f59e0b",
                            "#10b981",
                            "#ef4444",
                        ][i % 6],
                    }}
                    initial={{ x: 0, y: 0, scale: 0 }}
                    animate={{
                        x: Math.cos((i * Math.PI * 2) / 12) * 100,
                        y: Math.sin((i * Math.PI * 2) / 12) * 100,
                        scale: [0, 1.5, 0],
                    }}
                    transition={{ duration: 0.8, delay: i * 0.03 }}
                />
            ))}
        </motion.div>
    );
}

/* ── Bottom Sheet ── */

function ObservationSheet({
    isOpen,
    onClose,
    wardrobeItems,
    onSaved,
}: {
    isOpen: boolean;
    onClose: () => void;
    wardrobeItems: WardrobeItem[];
    onSaved: () => void;
}) {
    const [step, setStep] = useState(0);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [selectedTriggers, setSelectedTriggers] = useState<string[]>([]);
    const [selectedContext, setSelectedContext] = useState("");
    const [energy, setEnergy] = useState(3);
    const [satisfaction, setSatisfaction] = useState(3);
    const [freeNote, setFreeNote] = useState("");
    const [showNote, setShowNote] = useState(false);
    const [saving, setSaving] = useState(false);

    const toggleItem = (id: string) => {
        setSelectedItems((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
        );
    };

    const toggleTrigger = (id: string) => {
        setSelectedTriggers((prev) =>
            prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
        );
    };

    const handleSave = useCallback(() => {
        if (selectedTriggers.length === 0 || !selectedContext) return;
        setSaving(true);

        saveObservation({
            itemIds: selectedItems,
            trigger: selectedTriggers[0],
            freeNote: freeNote || undefined,
            mood: selectedTriggers.join(","),
            context: selectedContext,
            energy,
            satisfaction,
        });

        // Also record wear for cost-per-wear tracking
        for (const itemId of selectedItems) {
            recordWear(itemId, undefined, selectedContext || undefined);
        }

        setTimeout(() => {
            setSaving(false);
            onSaved();
            onClose();
            // Reset
            setStep(0);
            setSelectedItems([]);
            setSelectedTriggers([]);
            setSelectedContext("");
            setEnergy(3);
            setSatisfaction(3);
            setFreeNote("");
            setShowNote(false);
        }, 300);
    }, [
        selectedItems,
        selectedTriggers,
        selectedContext,
        energy,
        satisfaction,
        freeNote,
        onSaved,
        onClose,
    ]);

    const canSave = selectedTriggers.length > 0 && selectedContext !== "";

    // Sort wardrobe: most recently added first
    const sortedItems = [...wardrobeItems].sort((a, b) => {
        const aTime = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const bTime = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return bTime - aTime;
    });

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                        }}
                        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-white bg-white/95 backdrop-blur-2xl shadow-2xl"
                    >
                        {/* Handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="h-1 w-10 rounded-full bg-slate-300" />
                        </div>

                        <div className="px-5 pb-8 pt-2">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-slate-900">
                                    なぜこの服？
                                </h3>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
                                >
                                    <svg
                                        className="h-5 w-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>

                            <p className="mt-1 text-sm text-slate-500">
                                今日の選択を1タップで記録
                            </p>

                            <div className="mt-5 space-y-6">
                                {/* 1. Item selection */}
                                {wardrobeItems.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700">
                                            今日着たアイテム（任意）
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {sortedItems.slice(0, 15).map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() =>
                                                        toggleItem(item.id)
                                                    }
                                                    className={cn(
                                                        "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                                                        selectedItems.includes(
                                                            item.id,
                                                        )
                                                            ? "border-slate-900 bg-slate-900 text-white"
                                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                                                    )}
                                                >
                                                    {item.imageUrl && (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img
                                                            src={item.imageUrl}
                                                            alt=""
                                                            className="h-5 w-5 rounded object-cover"
                                                        />
                                                    )}
                                                    {item.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 2. Trigger selection */}
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">
                                        選んだ理由は？
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {TRIGGER_OPTIONS.map((trigger) => (
                                            <motion.button
                                                key={trigger.id}
                                                type="button"
                                                onClick={() =>
                                                    toggleTrigger(trigger.id)
                                                }
                                                className={cn(
                                                    "rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                                                    selectedTriggers.includes(
                                                        trigger.id,
                                                    )
                                                        ? "border-violet-600 bg-violet-600 text-white shadow-md"
                                                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-300",
                                                )}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                <span className="mr-1">
                                                    {trigger.icon}
                                                </span>
                                                {trigger.label}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* 3. Context */}
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">
                                        どんなシーン？
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {CONTEXT_OPTIONS.map((ctx) => (
                                            <button
                                                key={ctx.id}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedContext(ctx.id)
                                                }
                                                className={cn(
                                                    "rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                                                    selectedContext === ctx.id
                                                        ? "border-slate-900 bg-slate-900 text-white"
                                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                                                )}
                                            >
                                                {ctx.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 4. Energy */}
                                <StarRating
                                    value={energy}
                                    onChange={setEnergy}
                                    label="今日のエネルギー"
                                />

                                {/* 5. Satisfaction */}
                                <StarRating
                                    value={satisfaction}
                                    onChange={setSatisfaction}
                                    label="満足度"
                                />

                                {/* 6. Free text (expandable) */}
                                <div>
                                    {!showNote ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowNote(true)}
                                            className="text-sm text-slate-400 underline decoration-dotted hover:text-slate-600"
                                        >
                                            メモを追加する（任意）
                                        </button>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{
                                                opacity: 1,
                                                height: "auto",
                                            }}
                                        >
                                            <textarea
                                                value={freeNote}
                                                onChange={(e) =>
                                                    setFreeNote(e.target.value)
                                                }
                                                placeholder="今日の服にまつわる気づき..."
                                                rows={3}
                                                className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-violet-400 focus:outline-none"
                                            />
                                        </motion.div>
                                    )}
                                </div>

                                {/* 7. Save button */}
                                <GlassButton
                                    variant="primary"
                                    size="md"
                                    onClick={handleSave}
                                    disabled={!canSave || saving}
                                    loading={saving}
                                    fullWidth
                                >
                                    記録する
                                </GlassButton>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

/* ── Main component ── */

export default function ObservationLogButton({
    wardrobeItems,
}: ObservationLogButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [todayCount, setTodayCount] = useState(0);
    const [showCelebration, setShowCelebration] = useState(false);
    const [insights, setInsights] = useState<ObservationInsight[]>([]);
    const [showInsights, setShowInsights] = useState(false);

    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
        setTodayCount(getTodayObservationCount());
        const entries = getObservations(30);
        if (entries.length >= 7) {
            setInsights(analyzeObservationPatterns(entries));
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    const handleSaved = useCallback(() => {
        setTodayCount(getTodayObservationCount());
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2000);

        // Refresh insights
        const entries = getObservations(30);
        if (entries.length >= 7) {
            setInsights(analyzeObservationPatterns(entries));
        }
    }, []);

    return (
        <>
            {/* Celebration */}
            <AnimatePresence>
                {showCelebration && <CelebrationEffect />}
            </AnimatePresence>

            {/* Floating Action Button */}
            <motion.div
                className="fixed bottom-24 right-4 z-40"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    delay: 0.5,
                }}
            >
                <motion.button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-xl shadow-violet-500/30"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <svg
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                    </svg>

                    {/* Badge */}
                    {todayCount > 0 && (
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow"
                        >
                            {todayCount}
                        </motion.span>
                    )}
                </motion.button>

                {/* Tooltip on first visit */}
                {todayCount === 0 && (
                    <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.5 }}
                        className="absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
                    >
                        なぜこの服？を記録
                        <span className="absolute right-[-6px] top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900" />
                    </motion.div>
                )}
            </motion.div>

            {/* Insight panel (shown after 7+ entries, below the FAB) */}
            {insights.length > 0 && !isOpen && (
                <div className="fixed bottom-40 right-4 z-30">
                    <motion.button
                        type="button"
                        onClick={() => setShowInsights(!showInsights)}
                        className="rounded-full border border-violet-200 bg-violet-50/90 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-md backdrop-blur"
                        whileHover={{ scale: 1.05 }}
                    >
                        パターン分析
                    </motion.button>

                    <AnimatePresence>
                        {showInsights && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute bottom-10 right-0 w-72"
                            >
                                <GlassCard variant="elevated" padding="sm">
                                    <InsightsSummary insights={insights} />
                                </GlassCard>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Bottom Sheet */}
            <ObservationSheet
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                wardrobeItems={wardrobeItems}
                onSaved={handleSaved}
            />
        </>
    );
}
