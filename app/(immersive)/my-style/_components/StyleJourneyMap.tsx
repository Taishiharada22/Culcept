"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import { analyzeStyleJourney, type StyleJourney, type JourneyPoint, type EraDefinition } from "../_lib/archaeology";
import { getStyleLaneLabel } from "../_lib/catalog";

type Props = {
    state: SavedState;
};

const MAP_W = 320;
const MAP_H = 180;
const PAD = 24;

function journeyPath(points: JourneyPoint[]): string {
    if (points.length < 2) return "";
    const coords = points.map((p) => ({
        x: PAD + p.x * (MAP_W - PAD * 2),
        y: MAP_H - PAD - p.y * (MAP_H - PAD * 2),
    }));

    const parts: string[] = [`M ${coords[0].x} ${coords[0].y}`];
    for (let i = 0; i < coords.length - 1; i++) {
        const curr = coords[i];
        const next = coords[i + 1];
        const cpx = (curr.x + next.x) / 2;
        parts.push(`Q ${cpx} ${curr.y}, ${next.x} ${next.y}`);
    }
    return parts.join(" ");
}

export default function StyleJourneyMap({ state }: Props) {
    const [selectedEra, setSelectedEra] = useState<number | null>(null);
    const journey = useMemo(() => analyzeStyleJourney(state), [state]);

    if (journey.eras.length === 0) {
        return (
            <GlassCard className="p-4 text-center text-sm text-slate-500">
                スナップショットを保存すると、スタイルの旅路が見えてきます
            </GlassCard>
        );
    }

    const pathD = journeyPath(journey.journeyPoints);

    return (
        <div className="space-y-4">
            {/* Journey Map SVG */}
            <GlassCard className="p-3 overflow-hidden">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">
                    Style Journey Map
                </p>
                <svg
                    width="100%"
                    viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                    className="overflow-visible"
                >
                    {/* Grid */}
                    <line x1={PAD} y1={MAP_H - PAD} x2={MAP_W - PAD} y2={MAP_H - PAD} stroke="#e2e8f0" strokeWidth={0.5} />
                    <line x1={PAD} y1={PAD} x2={PAD} y2={MAP_H - PAD} stroke="#e2e8f0" strokeWidth={0.5} />

                    {/* Y-axis label */}
                    <text x={4} y={MAP_H / 2} textAnchor="middle" fill="#94a3b8" fontSize={6} transform={`rotate(-90, 4, ${MAP_H / 2})`}>
                        冒険度
                    </text>
                    <text x={MAP_W / 2} y={MAP_H - 4} textAnchor="middle" fill="#94a3b8" fontSize={6}>
                        時間 →
                    </text>

                    {/* Path */}
                    {pathD && (
                        <motion.path
                            d={pathD}
                            fill="none"
                            stroke="url(#journey-gradient)"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 1.5, ease: "easeInOut" }}
                        />
                    )}

                    <defs>
                        <linearGradient id="journey-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#94a3b8" />
                            <stop offset="50%" stopColor="#f97316" />
                            <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                    </defs>

                    {/* Points */}
                    {journey.journeyPoints.map((p, i) => {
                        const cx = PAD + p.x * (MAP_W - PAD * 2);
                        const cy = MAP_H - PAD - p.y * (MAP_H - PAD * 2);
                        const isSelected = selectedEra === i;
                        return (
                            <g key={i}>
                                <motion.circle
                                    cx={cx}
                                    cy={cy}
                                    r={isSelected ? 7 : 5}
                                    fill={isSelected ? "#f97316" : "#fb923c"}
                                    stroke="white"
                                    strokeWidth={2}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => setSelectedEra(isSelected ? null : i)}
                                    whileHover={{ scale: 1.3 }}
                                />
                                <text
                                    x={cx}
                                    y={cy - 10}
                                    textAnchor="middle"
                                    fill="#64748b"
                                    fontSize={6}
                                    fontWeight="bold"
                                >
                                    {p.era.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </GlassCard>

            {/* Era detail popup */}
            <AnimatePresence>
                {selectedEra !== null && journey.eras[selectedEra] && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                    >
                        <EraDetailCard
                            era={journey.eras[selectedEra]}
                            transition={journey.transitions.find((t) => t.toEra === selectedEra)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Narrative */}
            <GlassCard className="p-4 space-y-2">
                <p className="text-xs text-slate-700 leading-relaxed">{journey.overallNarrative}</p>
                <div className="border-t border-slate-200/50 pt-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Future</p>
                    <p className="text-xs text-orange-600 mt-1">{journey.futurePrediction}</p>
                </div>
            </GlassCard>

            {/* Transitions */}
            {journey.transitions.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-1">
                        Transitions
                    </p>
                    {journey.transitions.map((t, i) => (
                        <GlassCard key={i} className="p-2.5 flex items-center gap-2">
                            <span className="text-xs shrink-0">{t.trigger === "大きな転換期" ? "🌊" : t.trigger === "断捨離期" ? "✂️" : "🌱"}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-slate-700">{t.narrative}</p>
                                <p className="text-[10px] text-slate-400">{t.trigger}</p>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            )}
        </div>
    );
}

function EraDetailCard({
    era,
    transition,
}: {
    era: EraDefinition;
    transition?: { narrative: string; trigger?: string };
}) {
    return (
        <GlassCard className="p-3 border-l-4 border-orange-400">
            <p className="text-xs font-bold text-slate-700">{era.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
                {era.startDate.slice(0, 10)} ～ {era.endDate.slice(0, 10)}
            </p>

            {era.dominantLanes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {era.dominantLanes.map((lane) => (
                        <span key={lane} className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-600">
                            {getStyleLaneLabel(lane)}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                <span>冒険度: {Math.round(era.adventureScore * 100)}%</span>
                <span>アイテム数: {era.wardrobeCount}</span>
            </div>

            {transition && (
                <p className="text-[11px] text-slate-600 mt-2 italic">{transition.narrative}</p>
            )}
            {era.memo && (
                <p className="text-[10px] text-slate-400 mt-1">📝 {era.memo}</p>
            )}
        </GlassCard>
    );
}
