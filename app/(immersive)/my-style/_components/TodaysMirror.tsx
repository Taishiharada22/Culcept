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
import type { WardrobeItem, SelectedStyleLane } from "../_lib/types";
import {
    MOOD_OPTIONS,
    MOOD_COLORS,
    predictStyleFromMood,
    validatePrediction,
    saveMoodEntry,
    getTodayEntry,
    getStreakInfo,
    getTimePhase,
    getWeeklyMoodDots,
    getMoodHistory,
    getMoodPatterns,
    type MoodEntry,
    type StylePrediction,
    type MoodPattern,
    type StreakInfo,
} from "../_lib/todaysMirror";

/* ── Props ── */

interface TodaysMirrorProps {
    wardrobeItems: WardrobeItem[];
    styleSelections: SelectedStyleLane[];
}

/* ── Sub-components ── */

function MoodPill({
    mood,
    selected,
    onSelect,
}: {
    mood: (typeof MOOD_OPTIONS)[number];
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <motion.button
            type="button"
            onClick={onSelect}
            className={cn(
                "rounded-full border px-4 py-2.5 text-sm font-semibold transition-all",
                selected
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                    : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white",
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        >
            <span className="mr-1.5">{mood.emoji}</span>
            {mood.label}
        </motion.button>
    );
}

function WeeklyMoodChart() {
    const dots = getWeeklyMoodDots();

    return (
        <div className="flex items-center gap-2">
            {dots.map((dot) => (
                <div key={dot.date} className="flex flex-col items-center gap-1">
                    <motion.div
                        className="h-3 w-3 rounded-full border border-white/50"
                        style={{
                            backgroundColor: dot.mood
                                ? MOOD_COLORS[dot.mood] ?? "#94a3b8"
                                : "#e2e8f0",
                        }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.05 * dots.indexOf(dot) }}
                    />
                    <span className="text-[10px] text-slate-400">{dot.dayLabel}</span>
                </div>
            ))}
        </div>
    );
}

function StreakBadge({ streak }: { streak: StreakInfo }) {
    if (streak.currentStreak === 0) return null;
    return (
        <GlassBadge variant="gradient" size="sm">
            連続 {streak.currentStreak} 日目
        </GlassBadge>
    );
}

function PredictionCard({ prediction }: { prediction: StylePrediction }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-5 space-y-4"
        >
            <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/90 to-slate-50/80 p-5">
                <p className="text-sm leading-relaxed text-slate-600">
                    {prediction.reason}
                </p>

                <div className="mt-4 space-y-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            おすすめスタイル
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {prediction.suggestedLanes.map((lane) => (
                                <span
                                    key={lane}
                                    className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
                                >
                                    {lane}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            おすすめカラー
                        </p>
                        <div className="mt-1.5 flex gap-2">
                            {prediction.suggestedColors.map((color) => (
                                <div
                                    key={color}
                                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1"
                                >
                                    <span className="text-xs text-slate-600">
                                        {color}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                            <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                                initial={{ width: 0 }}
                                animate={{
                                    width: `${Math.round(prediction.confidence * 100)}%`,
                                }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                            />
                        </div>
                        <span className="text-xs font-semibold text-slate-500">
                            精度 {Math.round(prediction.confidence * 100)}%
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function EveningValidation({
    todayEntry,
    wardrobeItems,
    onSave,
}: {
    todayEntry: MoodEntry;
    wardrobeItems: WardrobeItem[];
    onSave: (updated: MoodEntry) => void;
}) {
    const [selectedItems, setSelectedItems] = useState<string[]>(
        todayEntry.eveningActual?.selectedItems ?? [],
    );
    const [feltMood, setFeltMood] = useState(
        todayEntry.eveningActual?.feltMood ?? "",
    );
    const [saved, setSaved] = useState(!!todayEntry.eveningActual);

    const toggleItem = (id: string) => {
        setSelectedItems((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
        );
    };

    const handleSave = () => {
        const actualWear = {
            selectedItems,
            feltMood,
        };
        const accuracy = validatePrediction(
            todayEntry.predictedStyle,
            actualWear,
            wardrobeItems,
        );
        const updated: MoodEntry = {
            ...todayEntry,
            eveningActual: actualWear,
            predictionAccuracy: accuracy,
        };
        saveMoodEntry(updated);
        onSave(updated);
        setSaved(true);
    };

    if (saved && todayEntry.predictionAccuracy != null) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-center"
            >
                <p className="text-lg font-bold text-emerald-800">
                    今日の予測精度: {Math.round(todayEntry.predictionAccuracy * 100)}%
                </p>
                <p className="mt-1 text-sm text-emerald-600">
                    記録完了! お疲れさまでした
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-4"
        >
            <div>
                <p className="text-sm font-bold text-slate-700">
                    今日着たアイテムを選んでください
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {wardrobeItems.slice(0, 20).map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className={cn(
                                "rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                                selectedItems.includes(item.id)
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            )}
                        >
                            {item.imageUrl ? (
                                <div className="flex items-center gap-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        className="h-6 w-6 rounded object-cover"
                                    />
                                    <span>{item.name}</span>
                                </div>
                            ) : (
                                item.name
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <p className="text-sm font-bold text-slate-700">
                    今日の気分はどうでしたか？
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {MOOD_OPTIONS.map((m) => (
                        <MoodPill
                            key={m.id}
                            mood={m}
                            selected={feltMood === m.id}
                            onSelect={() => setFeltMood(m.id)}
                        />
                    ))}
                </div>
            </div>

            <GlassButton
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={selectedItems.length === 0 || !feltMood}
                fullWidth
            >
                答え合わせを記録する
            </GlassButton>
        </motion.div>
    );
}

function PatternsPanel({ patterns }: { patterns: MoodPattern[] }) {
    if (patterns.length === 0) return null;

    return (
        <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                あなたのパターン
            </p>
            {patterns.map((p, i) => (
                <motion.div
                    key={p.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="rounded-xl border border-slate-200/60 bg-white/60 px-4 py-3"
                >
                    <p className="text-xs font-bold text-slate-700">{p.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>
                </motion.div>
            ))}
        </div>
    );
}

/* ── Main component ── */

export default function TodaysMirror({
    wardrobeItems,
    styleSelections,
}: TodaysMirrorProps) {
    const [phase, setPhase] = useState<"morning" | "between" | "evening">("between");
    const [todayEntry, setTodayEntry] = useState<MoodEntry | null>(null);
    const [selectedMood, setSelectedMood] = useState<string | null>(null);
    const [prediction, setPrediction] = useState<StylePrediction | null>(null);
    const [streak, setStreak] = useState<StreakInfo>({
        currentStreak: 0,
        longestStreak: 0,
        totalDays: 0,
    });
    const [patterns, setPatterns] = useState<MoodPattern[]>([]);

    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
        setPhase(getTimePhase());
        const entry = getTodayEntry();
        setTodayEntry(entry);
        if (entry) {
            setSelectedMood(entry.morningMood);
            setPrediction(entry.predictedStyle);
        }
        setStreak(getStreakInfo());

        const history = getMoodHistory(30);
        setPatterns(getMoodPatterns(history));
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    const handleMoodSelect = useCallback(
        (moodId: string) => {
            setSelectedMood(moodId);

            const pastEntries = getMoodHistory(60);
            const pred = predictStyleFromMood(
                moodId,
                wardrobeItems,
                styleSelections,
                pastEntries,
            );
            setPrediction(pred);

            const today = new Date();
            const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

            const entry: MoodEntry = {
                date: dateStr,
                morningMood: moodId,
                predictedStyle: pred,
                eveningActual: todayEntry?.eveningActual,
                predictionAccuracy: todayEntry?.predictionAccuracy,
            };
            saveMoodEntry(entry);
            setTodayEntry(entry);
            setStreak(getStreakInfo());
        },
        [wardrobeItems, styleSelections, todayEntry],
    );

    const handleEveningSave = useCallback((updated: MoodEntry) => {
        setTodayEntry(updated);
    }, []);

    const phaseTitle =
        phase === "morning"
            ? "おはようございます"
            : phase === "evening"
              ? "答え合わせの時間"
              : "今日の予測";

    const phaseSubtitle =
        phase === "morning"
            ? "今の気分を教えてください"
            : phase === "evening"
              ? "今日はどんな服を着ましたか？"
              : todayEntry
                ? "今日のスタイル方向をチェック"
                : "朝の気分を記録しましょう";

    return (
        <FadeInView>
            <GlassCard variant="gradient" padding="lg">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">
                            毎日の鏡
                        </h3>
                        <p className="mt-0.5 text-sm text-slate-500">
                            {phaseTitle} - {phaseSubtitle}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <StreakBadge streak={streak} />
                    </div>
                </div>

                {/* Weekly mood mini chart */}
                <div className="mt-4">
                    <WeeklyMoodChart />
                </div>

                {/* Morning: mood selection */}
                {(phase === "morning" || (phase === "between" && !todayEntry)) && (
                    <div className="mt-5">
                        <p className="mb-3 text-sm font-semibold text-slate-700">
                            今の気分は？
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {MOOD_OPTIONS.map((mood) => (
                                <MoodPill
                                    key={mood.id}
                                    mood={mood}
                                    selected={selectedMood === mood.id}
                                    onSelect={() => handleMoodSelect(mood.id)}
                                />
                            ))}
                        </div>

                        <AnimatePresence mode="wait">
                            {prediction && (
                                <PredictionCard
                                    key="prediction"
                                    prediction={prediction}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* Between: show today's prediction as reminder */}
                {phase === "between" && todayEntry && prediction && (
                    <div className="mt-5">
                        <div className="flex items-center gap-2">
                            <GlassBadge variant="info" size="sm">
                                {MOOD_OPTIONS.find((m) => m.id === todayEntry.morningMood)
                                    ?.emoji ?? ""}{" "}
                                {MOOD_OPTIONS.find((m) => m.id === todayEntry.morningMood)
                                    ?.label ?? todayEntry.morningMood}
                            </GlassBadge>
                        </div>
                        <PredictionCard prediction={prediction} />
                    </div>
                )}

                {/* Evening: validation */}
                {phase === "evening" && todayEntry && (
                    <EveningValidation
                        todayEntry={todayEntry}
                        wardrobeItems={wardrobeItems}
                        onSave={handleEveningSave}
                    />
                )}

                {/* Evening: no morning entry */}
                {phase === "evening" && !todayEntry && (
                    <div className="mt-5">
                        <p className="text-sm text-slate-500">
                            今朝の気分は記録されていません。明日の朝に試してみてください。
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                            今の気分を記録しておく？
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {MOOD_OPTIONS.map((mood) => (
                                <MoodPill
                                    key={mood.id}
                                    mood={mood}
                                    selected={selectedMood === mood.id}
                                    onSelect={() => handleMoodSelect(mood.id)}
                                />
                            ))}
                        </div>
                        <AnimatePresence mode="wait">
                            {prediction && (
                                <PredictionCard
                                    key="pred-evening"
                                    prediction={prediction}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* Patterns section */}
                <PatternsPanel patterns={patterns} />

                {/* Stats footer */}
                {streak.totalDays > 0 && (
                    <div className="mt-4 flex items-center gap-4 border-t border-slate-200/40 pt-3">
                        <div className="text-center">
                            <p className="text-lg font-bold text-slate-900">
                                {streak.totalDays}
                            </p>
                            <p className="text-[10px] text-slate-400">記録日数</p>
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold text-slate-900">
                                {streak.longestStreak}
                            </p>
                            <p className="text-[10px] text-slate-400">最長連続</p>
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold text-slate-900">
                                {streak.currentStreak}
                            </p>
                            <p className="text-[10px] text-slate-400">今の連続</p>
                        </div>
                    </div>
                )}
            </GlassCard>
        </FadeInView>
    );
}
