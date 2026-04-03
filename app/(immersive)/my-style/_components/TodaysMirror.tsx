"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { WardrobeItem, SelectedStyleLane } from "../_lib/types";
import {
    MOOD_OPTIONS,
    saveMoodEntry,
    getTodayEntry,
    type MoodEntry,
} from "../_lib/todaysMirror";
import WeeklyInsight from "./WeeklyInsight";
import { loadAllWearEvents, saveWearEvent } from "@/lib/shared/wearEvents";

/* ── Daily insight (7 rotating lenses) ── */

const DAILY_LENSES = [
    (items: WardrobeItem[]) => {
        const colors = items.map((i) => i.colorName ?? i.color).filter(Boolean);
        const top = colors.sort((a, b) => colors.filter((c) => c === b).length - colors.filter((c) => c === a).length)[0];
        return top ? `あなたが一番多く持っている色は「${top}」` : null;
    },
    (items: WardrobeItem[]) => {
        const tops = items.filter((i) => i.category === "tops").length;
        const bottoms = items.filter((i) => i.category === "bottoms").length;
        if (tops === 0 && bottoms === 0) return null;
        return tops > bottoms ? "トップスの方が多い — 上半身で印象を変えるタイプ" : "ボトムスの比率が高い — 足元から整えるタイプ";
    },
    (items: WardrobeItem[]) => {
        const casuals = items.filter((i) => i.formality === "casual").length;
        const ratio = items.length > 0 ? Math.round((casuals / items.length) * 100) : 0;
        return ratio > 0 ? `カジュアル率 ${ratio}%` : null;
    },
    (items: WardrobeItem[]) => {
        const outerwear = items.filter((i) => i.category === "outerwear").length;
        return outerwear > 0 ? `アウター ${outerwear}着 — 上から整える力がある` : null;
    },
    (items: WardrobeItem[]) => {
        const accessories = items.filter((i) => i.category === "accessories").length;
        return accessories > 0 ? `アクセサリー ${accessories}点が印象を調律している` : null;
    },
    (items: WardrobeItem[]) => {
        const dark = items.filter((i) => ["black", "navy", "charcoal", "dark_gray"].includes(i.color)).length;
        const ratio = items.length > 0 ? Math.round((dark / items.length) * 100) : 0;
        return ratio > 30 ? `ダーク系 ${ratio}% — 引き締め志向` : null;
    },
    (items: WardrobeItem[]) => {
        const shoes = items.filter((i) => i.category === "shoes").length;
        return shoes > 0 ? `靴 ${shoes}足 — 足元の選択肢は十分？` : null;
    },
];

function getDailyInsight(items: WardrobeItem[]): string | null {
    if (items.length === 0) return null;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const lens = DAILY_LENSES[dayOfYear % DAILY_LENSES.length];
    return lens(items);
}

/* ── Props ── */

interface TodaysMirrorProps {
    wardrobeItems: WardrobeItem[];
    styleSelections: SelectedStyleLane[];
}

/* ── Main component ── */

export default function TodaysMirror({ wardrobeItems, styleSelections }: TodaysMirrorProps) {
    const [selectedMood, setSelectedMood] = useState<string | null>(null);
    const [todayWornIds, setTodayWornIds] = useState<Set<string>>(new Set());
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect */
        setMounted(true);
        const entry = getTodayEntry();
        if (entry) setSelectedMood(entry.morningMood);
        // Load worn item IDs for today from shared wearEvents
        const today = new Date().toISOString().slice(0, 10);
        const events = loadAllWearEvents();
        const ids = new Set<string>();
        for (const e of events) {
            if (e.date === today) for (const id of e.itemIds) ids.add(id);
        }
        setTodayWornIds(ids);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    const handleMoodSelect = useCallback((moodId: string) => {
        setSelectedMood(moodId);
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const entry: MoodEntry = { date: dateStr, morningMood: moodId };
        saveMoodEntry(entry);
        try {
            navigator.sendBeacon("/api/stargazer/analytics", JSON.stringify({
                event: "mystyle_mood_selected",
                feature: "my-style",
                metadata: { mood_id: moodId },
            }));
        } catch { /* ignore */ }
    }, []);

    const handleWearLog = useCallback((itemId: string) => {
        const today = new Date().toISOString().slice(0, 10);
        setTodayWornIds((prev) => {
            if (prev.has(itemId)) return prev;
            // Save to shared wearEvents (single-item event)
            saveWearEvent({ date: today, itemIds: [itemId], source: "my-style" });
            return new Set([...prev, itemId]);
        });
    }, []);

    const dailyInsight = useMemo(() => getDailyInsight(wardrobeItems), [wardrobeItems]);

    if (!mounted) return null;

    return (
        <div className="space-y-2">
            {/* Heading + mood inline */}
            <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-bold text-slate-700">今日、何を選んだ？</h4>
                <div className="flex items-center gap-1">
                    {MOOD_OPTIONS.map((mood) => (
                        <button
                            key={mood.id}
                            type="button"
                            onClick={() => handleMoodSelect(mood.id)}
                            className={cn(
                                "rounded-full w-7 h-7 text-[12px] transition",
                                selectedMood === mood.id
                                    ? "bg-slate-900 text-white ring-1 ring-slate-900/20"
                                    : "text-slate-500 hover:bg-slate-100",
                            )}
                        >
                            {mood.emoji}
                        </button>
                    ))}
                </div>
            </div>

            {/* Compact thumbnail strip */}
            {wardrobeItems.length > 0 && (
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                    {wardrobeItems.slice(0, 16).map((item) => {
                        const isToday = todayWornIds.has(item.id);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleWearLog(item.id)}
                                className={cn(
                                    "relative shrink-0 w-11 h-11 rounded-md overflow-hidden border transition",
                                    isToday ? "border-slate-900" : "border-slate-200/60 hover:border-slate-300",
                                )}
                            >
                                {item.imageUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full" style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }} />
                                )}
                                {isToday && (
                                    <span className="absolute inset-0 bg-slate-900/40 flex items-center justify-center text-[8px] font-bold text-white">✓</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Weekly dots + daily insight — single line */}
            <div className="flex items-center gap-2">
                <WeeklyInsight />
                {dailyInsight && (
                    <p className="text-[10px] text-slate-400 truncate">{dailyInsight}</p>
                )}
            </div>
        </div>
    );
}
