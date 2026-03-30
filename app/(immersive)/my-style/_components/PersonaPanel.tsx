"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { SavedState, SeekContextKey, SeekContextProfile, StyleLaneCode } from "../_lib/types";
import { SEEK_CONTEXT_KEYS } from "../_lib/types";
import { buildAllPersonaProfiles, findCrossPersonaCommon, suggestPersonaForDay } from "../_lib/personaEngine";
import { getStyleLaneLabel } from "../_lib/catalog";

type Props = {
    state: SavedState;
    setState: (fn: (prev: SavedState) => SavedState) => void;
};

const CONTEXT_LABELS: Record<SeekContextKey, { label: string; icon: string; color: string }> = {
    romance: { label: "ロマンス", icon: "💕", color: "rose" },
    friend: { label: "フレンド", icon: "🤝", color: "sky" },
    cocreation: { label: "共創", icon: "✨", color: "violet" },
    orbiter: { label: "オービター", icon: "🌙", color: "amber" },
};

const COLOR_CLASSES: Record<string, string> = {
    rose: "bg-rose-500 text-white",
    sky: "bg-sky-500 text-white",
    violet: "bg-violet-500 text-white",
    amber: "bg-amber-500 text-white",
};

const INACTIVE_CLASSES: Record<string, string> = {
    rose: "bg-rose-50 text-rose-600 border-rose-200",
    sky: "bg-sky-50 text-sky-600 border-sky-200",
    violet: "bg-violet-50 text-violet-600 border-violet-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
};

export default function PersonaPanel({ state, setState }: Props) {
    const [activeContext, setActiveContext] = useState<SeekContextKey>("romance");
    const today = suggestPersonaForDay(new Date().getDay());

    const profiles = useMemo(() => buildAllPersonaProfiles(state), [state]);
    const crossAnalysis = useMemo(() => findCrossPersonaCommon(profiles), [profiles]);
    const activeProfile = profiles.find((p) => p.contextKey === activeContext);

    const defaultCtx = (): SeekContextProfile => ({
        preferredLanes: [] as StyleLaneCode[],
        preferredElements: [],
        avoidedElements: [],
        similarityPreference: "mixed" as const,
        memo: "",
    });

    const addLaneToPersona = (lane: StyleLaneCode) => {
        setState((prev) => {
            const seek = { ...prev.seek } as Record<SeekContextKey, SeekContextProfile>;
            const ctx = seek[activeContext] ? { ...seek[activeContext] } : defaultCtx();
            if (ctx.preferredLanes.length >= 3) return prev;
            if (ctx.preferredLanes.includes(lane)) return prev;
            ctx.preferredLanes = [...ctx.preferredLanes, lane];
            seek[activeContext] = ctx;
            return { ...prev, seek } as SavedState;
        });
    };

    const addKeyItem = (itemId: string) => {
        setState((prev) => {
            const seek = { ...prev.seek } as Record<SeekContextKey, SeekContextProfile>;
            const ctx = seek[activeContext] ? { ...seek[activeContext] } : defaultCtx();
            const existing = ctx.keyItemIds ?? [];
            if (existing.length >= 5 || existing.includes(itemId)) return prev;
            ctx.keyItemIds = [...existing, itemId];
            seek[activeContext] = ctx;
            return { ...prev, seek } as SavedState;
        });
    };

    return (
        <div className="space-y-4">
            {/* Persona selector */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {SEEK_CONTEXT_KEYS.map((key) => {
                    const meta = CONTEXT_LABELS[key];
                    const isActive = key === activeContext;
                    return (
                        <button
                            key={key}
                            onClick={() => setActiveContext(key)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                isActive ? COLOR_CLASSES[meta.color] + " border-transparent shadow-md" : INACTIVE_CLASSES[meta.color]
                            }`}
                        >
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                            {key === today && <span className="text-[9px] opacity-70">今日</span>}
                        </button>
                    );
                })}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeContext}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                >
                    {/* Active persona profile */}
                    {activeProfile && (
                        <GlassCard className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-xl">{CONTEXT_LABELS[activeContext].icon}</span>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">{CONTEXT_LABELS[activeContext].label}モード</p>
                                    <p className="text-[11px] text-slate-500">{activeProfile.signature}</p>
                                </div>
                            </div>

                            {/* Style lanes */}
                            <div className="mb-3">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">スタイルレーン</p>
                                {activeProfile.styleLanes.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeProfile.styleLanes.map((lane) => (
                                            <span key={lane} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                {getStyleLaneLabel(lane)}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-slate-400">タップしてスタイルレーンを追加</p>
                                )}
                            </div>

                            {/* Color palette */}
                            <div className="mb-3">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">カラーパレット</p>
                                <div className="flex gap-1.5">
                                    {activeProfile.colorPalette.slice(0, 6).map((c, i) => (
                                        <div
                                            key={i}
                                            className="w-8 h-8 rounded-lg border border-slate-200 shadow-sm"
                                            style={{ backgroundColor: c.hex }}
                                            title={c.value}
                                        />
                                    ))}
                                    {activeProfile.colorPalette.length === 0 && (
                                        <p className="text-[11px] text-slate-400">ワードローブのカラーから自動生成</p>
                                    )}
                                </div>
                            </div>

                            {/* Key items */}
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">キーアイテム</p>
                                {activeProfile.keyItemIds.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeProfile.keyItemIds.map((id) => {
                                            const item = state.wardrobe.find((w) => w.id === id);
                                            if (!item) return null;
                                            return (
                                                <span key={id} className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600 border border-slate-200">
                                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.colorHex ?? "#94a3b8" }} />
                                                    {item.name}
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-1">
                                        {state.wardrobe.slice(0, 6).map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => addKeyItem(item.id)}
                                                className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 border border-slate-200 hover:bg-slate-100 transition"
                                            >
                                                + {item.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    )}

                    {/* Cross-persona analysis */}
                    <GlassCard className="p-4">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">クロス・ペルソナ分析</p>

                        {crossAnalysis.commonLanes.length > 0 ? (
                            <div className="mb-2">
                                <p className="text-[11px] text-slate-600 mb-1">🔗 全ペルソナ共通</p>
                                <div className="flex flex-wrap gap-1">
                                    {crossAnalysis.commonLanes.map((lane) => (
                                        <GlassBadge key={lane} size="sm">{getStyleLaneLabel(lane)}</GlassBadge>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-rose-400"
                                    style={{ width: `${Math.round(crossAnalysis.coreRatio * 100)}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                                共通率 {Math.round(crossAnalysis.coreRatio * 100)}%
                            </span>
                        </div>
                    </GlassCard>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
