"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { SavedState, SuggestedOutfit, WardrobeGap, WardrobeItem, WearRecord } from "../_lib/types";
import {
    generateOutfitSuggestions,
    findSleepingItems,
    analyzeWardrobeGaps,
    computeWearStats,
} from "../_lib/outfitIntelligence";

type Props = {
    state: SavedState;
    setState: (fn: (prev: SavedState) => SavedState) => void;
    pushNotice: (msg: string) => void;
};

/* ── Sub-section toggle ── */
type Section = "outfits" | "sleeping" | "gaps" | "stats";

const SECTION_CHIPS: { id: Section; label: string; icon: string }[] = [
    { id: "outfits", label: "おすすめコーデ", icon: "✨" },
    { id: "sleeping", label: "眠っている服", icon: "💤" },
    { id: "gaps", label: "ワードローブの穴", icon: "🔍" },
    { id: "stats", label: "着用統計", icon: "📊" },
];

export default function OutfitIntelligencePanel({ state, setState, pushNotice }: Props) {
    const [activeSection, setActiveSection] = useState<Section>("outfits");
    const wearHistory = state.wearHistory ?? {};

    const suggestions = useMemo(
        () => generateOutfitSuggestions(state.wardrobe, {}, 6),
        [state.wardrobe],
    );

    const sleepingItems = useMemo(
        () => findSleepingItems(state.wardrobe, wearHistory, state.setups),
        [state.wardrobe, wearHistory, state.setups],
    );

    const gaps = useMemo(() => analyzeWardrobeGaps(state.wardrobe), [state.wardrobe]);

    const wearStats = useMemo(
        () => computeWearStats(state.wardrobe, wearHistory),
        [state.wardrobe, wearHistory],
    );

    const recordWear = (itemId: string) => {
        setState((prev) => {
            const history = { ...(prev.wearHistory ?? {}) };
            const existing = history[itemId] ?? { count: 0, lastWornAt: "", setupIds: [] };
            history[itemId] = {
                ...existing,
                count: existing.count + 1,
                lastWornAt: new Date().toISOString(),
            };
            return { ...prev, wearHistory: history };
        });
        pushNotice("着用を記録しました");
    };

    if (state.wardrobe.length < 2) {
        return (
            <GlassCard className="p-4 text-center text-slate-500 text-sm">
                アイテムを2つ以上登録すると、着回し分析が使えます
            </GlassCard>
        );
    }

    return (
        <div className="space-y-4">
            {/* Section chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {SECTION_CHIPS.map((chip) => (
                    <button
                        key={chip.id}
                        onClick={() => setActiveSection(chip.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                            activeSection === chip.id
                                ? "bg-orange-500 text-white shadow-md"
                                : "bg-white/60 text-slate-600 hover:bg-white/80"
                        }`}
                    >
                        <span>{chip.icon}</span>
                        <span>{chip.label}</span>
                        {chip.id === "sleeping" && sleepingItems.length > 0 && (
                            <span className="ml-1 bg-amber-400 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                                {sleepingItems.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeSection === "outfits" && (
                        <OutfitSuggestions
                            suggestions={suggestions}
                            items={state.wardrobe}
                            onRecordWear={recordWear}
                        />
                    )}
                    {activeSection === "sleeping" && (
                        <SleepingItems items={sleepingItems} wearHistory={wearHistory} onRecordWear={recordWear} />
                    )}
                    {activeSection === "gaps" && <GapAnalysis gaps={gaps} />}
                    {activeSection === "stats" && <WearStatsPanel stats={wearStats} itemCount={state.wardrobe.length} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

/* ── Outfit Suggestions Section ── */

function OutfitSuggestions({
    suggestions,
    items,
    onRecordWear,
}: {
    suggestions: SuggestedOutfit[];
    items: WardrobeItem[];
    onRecordWear: (id: string) => void;
}) {
    const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

    if (suggestions.length === 0) {
        return (
            <GlassCard className="p-4 text-center text-slate-500 text-sm">
                トップスとボトムスを登録すると、コーデ提案が表示されます
            </GlassCard>
        );
    }

    return (
        <div className="space-y-3">
            {suggestions.map((outfit, idx) => (
                <GlassCard key={idx} className="p-3">
                    <div className="flex items-start gap-3">
                        {/* Item thumbnails */}
                        <div className="flex -space-x-2 shrink-0">
                            {outfit.itemIds.map((id) => {
                                const item = itemMap.get(id);
                                if (!item) return null;
                                return (
                                    <div
                                        key={id}
                                        className="w-12 h-12 rounded-lg border-2 border-white bg-slate-100 overflow-hidden shadow-sm"
                                    >
                                        {item.imageUrl ? (
                                            <img
                                                src={item.imageUrl}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div
                                                className="w-full h-full flex items-center justify-center text-lg"
                                                style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}
                                            >
                                                {item.name.slice(0, 1)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex-1 min-w-0">
                            {/* Item names */}
                            <p className="text-xs text-slate-700 font-medium truncate">
                                {outfit.itemIds.map((id) => itemMap.get(id)?.name ?? "").filter(Boolean).join(" × ")}
                            </p>
                            {/* Reasoning */}
                            <p className="text-[11px] text-slate-500 mt-0.5">{outfit.reasoning}</p>
                            {/* Score */}
                            <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400"
                                        style={{ width: `${outfit.score}%` }}
                                    />
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono">{outfit.score}</span>
                            </div>
                        </div>

                        {/* Record wear button */}
                        <button
                            onClick={() => outfit.itemIds.forEach(onRecordWear)}
                            className="shrink-0 text-xs px-2 py-1 rounded-md bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                            title="着用を記録"
                        >
                            👕
                        </button>
                    </div>
                </GlassCard>
            ))}
        </div>
    );
}

/* ── Sleeping Items Section ── */

function SleepingItems({
    items,
    wearHistory,
    onRecordWear,
}: {
    items: WardrobeItem[];
    wearHistory: Record<string, WearRecord>;
    onRecordWear: (id: string) => void;
}) {
    if (items.length === 0) {
        return (
            <GlassCard className="p-4 text-center text-sm">
                <span className="text-green-600">🌟 すべてのアイテムが活躍中！</span>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-2">
            <p className="text-xs text-slate-500 px-1">
                セットアップに未使用、または30日以上着ていないアイテム
            </p>
            <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                    const record = wearHistory[item.id];
                    return (
                        <GlassCard key={item.id} className="p-2.5 relative">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-amber-200"
                                    style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}
                                >
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-sm">
                                            {item.name.slice(0, 1)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">{item.name}</p>
                                    <p className="text-[10px] text-amber-600">
                                        {record?.count ? `${record.count}回着用` : "未着用"}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => onRecordWear(item.id)}
                                className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 hover:bg-amber-100"
                            >
                                着た
                            </button>
                        </GlassCard>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Gap Analysis Section ── */

function GapAnalysis({ gaps }: { gaps: WardrobeGap[] }) {
    if (gaps.length === 0) {
        return (
            <GlassCard className="p-4 text-center text-sm">
                <span className="text-green-600">🎯 バランスの取れたワードローブです！</span>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-2">
            {gaps.map((gap, idx) => (
                <GlassCard key={idx} className="p-3">
                    <div className="flex items-start gap-2">
                        <span className="text-lg shrink-0">
                            {gap.priority >= 8 ? "🚨" : gap.priority >= 5 ? "💡" : "📌"}
                        </span>
                        <div>
                            <p className="text-xs font-medium text-slate-700">{gap.description}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{gap.impact}</p>
                        </div>
                        <GlassBadge
                            variant={gap.priority >= 8 ? "default" : "default"}
                            size="sm"
                            className="shrink-0"
                        >
                            {gap.priority >= 8 ? "重要" : gap.priority >= 5 ? "推奨" : "参考"}
                        </GlassBadge>
                    </div>
                </GlassCard>
            ))}
        </div>
    );
}

/* ── Wear Stats Section ── */

function WearStatsPanel({
    stats,
    itemCount,
}: {
    stats: ReturnType<typeof computeWearStats>;
    itemCount: number;
}) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <GlassCard className="p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{stats.totalWears}</p>
                <p className="text-[10px] text-slate-500">総着用回数</p>
            </GlassCard>
            <GlassCard className="p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{stats.avgWearsPerItem}</p>
                <p className="text-[10px] text-slate-500">平均着用回数</p>
            </GlassCard>
            {stats.mostWorn && (
                <GlassCard className="p-3 col-span-2">
                    <p className="text-[10px] text-slate-500">👑 最も着ている</p>
                    <p className="text-xs font-medium text-slate-700 mt-0.5">
                        {stats.mostWorn.item.name} ({stats.mostWorn.count}回)
                    </p>
                </GlassCard>
            )}
            {stats.leastWorn && (
                <GlassCard className="p-3 col-span-2">
                    <p className="text-[10px] text-slate-500">💤 まだ着ていない</p>
                    <p className="text-xs font-medium text-amber-600 mt-0.5">{stats.leastWorn.item.name}</p>
                </GlassCard>
            )}
            <GlassCard className="p-3 col-span-2">
                <p className="text-[10px] text-slate-500">📦 登録アイテム数</p>
                <p className="text-xs font-medium text-slate-700 mt-0.5">{itemCount}点</p>
            </GlassCard>
        </div>
    );
}
