"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { WardrobeItem } from "../_lib/types";
import {
    MATERIAL_DB,
    analyzeMaterialTendency,
    checkMaterialPairing,
    type MaterialEntry,
    type MaterialAxis,
} from "../_lib/materialGuide";

type Props = {
    items: WardrobeItem[];
};

/* ── Radar chart for material axes ── */

function MaterialRadar({ axes, size = 100 }: { axes: MaterialAxis; size?: number }) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 12;

    const labels = [
        { key: "warmth", label: "暖かさ", angle: -Math.PI / 2 },
        { key: "luster", label: "光沢", angle: 0 },
        { key: "drape", label: "ドレープ", angle: Math.PI / 2 },
        { key: "durability", label: "耐久性", angle: Math.PI },
    ] as const;

    const points = labels.map((l) => {
        const v = axes[l.key];
        return {
            x: cx + Math.cos(l.angle) * r * v,
            y: cy + Math.sin(l.angle) * r * v,
            lx: cx + Math.cos(l.angle) * (r + 10),
            ly: cy + Math.sin(l.angle) * (r + 10),
            label: l.label,
        };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Grid rings */}
            {[0.25, 0.5, 0.75, 1].map((scale) => (
                <polygon
                    key={scale}
                    points={labels
                        .map((l) => `${cx + Math.cos(l.angle) * r * scale},${cy + Math.sin(l.angle) * r * scale}`)
                        .join(" ")}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={0.5}
                />
            ))}

            {/* Axes lines */}
            {labels.map((l) => (
                <line
                    key={l.key}
                    x1={cx}
                    y1={cy}
                    x2={cx + Math.cos(l.angle) * r}
                    y2={cy + Math.sin(l.angle) * r}
                    stroke="#e2e8f0"
                    strokeWidth={0.5}
                />
            ))}

            {/* Data polygon */}
            <motion.path
                d={pathD}
                fill="rgba(249, 115, 22, 0.2)"
                stroke="#f97316"
                strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
            />

            {/* Points */}
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#f97316" />
            ))}

            {/* Labels */}
            {points.map((p, i) => (
                <text
                    key={i}
                    x={p.lx}
                    y={p.ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#64748b"
                    fontSize={7}
                    fontWeight="bold"
                >
                    {p.label}
                </text>
            ))}
        </svg>
    );
}

/* ── Main panel ── */

type View = "guide" | "tendency";

export default function MaterialLiteracyPanel({ items }: Props) {
    const [view, setView] = useState<View>("guide");
    const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

    const wardrobeMaterials = useMemo(() => {
        const mats: string[] = [];
        for (const item of items) {
            for (const mf of item.materialFamily ?? []) {
                // materialFamily values are like "material.denim" — extract the key part
                const key = mf.replace(/^material\./, "").toLowerCase().replace(/[\s_]+/g, "");
                if (MATERIAL_DB.some((m) => m.key === key)) {
                    mats.push(key);
                }
            }
        }
        return mats;
    }, [items]);

    const tendency = useMemo(
        () => analyzeMaterialTendency(wardrobeMaterials),
        [wardrobeMaterials],
    );

    const selectedEntry = selectedMaterial
        ? MATERIAL_DB.find((m) => m.key === selectedMaterial) ?? null
        : null;

    return (
        <div className="space-y-4">
            {/* View toggle */}
            <div className="flex gap-2">
                {(["guide", "tendency"] as View[]).map((v) => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            view === v
                                ? "bg-orange-500 text-white shadow-md"
                                : "bg-white/60 text-slate-600 hover:bg-white/80"
                        }`}
                    >
                        {v === "guide" ? "📖 素材図鑑" : "📊 傾向分析"}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={view}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {view === "guide" ? (
                        <MaterialGuideView
                            selectedMaterial={selectedMaterial}
                            selectedEntry={selectedEntry}
                            onSelect={setSelectedMaterial}
                        />
                    ) : (
                        <MaterialTendencyView tendency={tendency} />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

/* ── Guide View ── */

function MaterialGuideView({
    selectedMaterial,
    selectedEntry,
    onSelect,
}: {
    selectedMaterial: string | null;
    selectedEntry: MaterialEntry | null;
    onSelect: (key: string | null) => void;
}) {
    return (
        <div className="space-y-3">
            {/* Material grid */}
            <div className="grid grid-cols-3 gap-1.5">
                {MATERIAL_DB.map((mat) => (
                    <button
                        key={mat.key}
                        onClick={() => onSelect(selectedMaterial === mat.key ? null : mat.key)}
                        className={`p-2 rounded-lg text-left transition-all ${
                            selectedMaterial === mat.key
                                ? "bg-orange-50 border border-orange-300 shadow-sm"
                                : "bg-white/60 border border-slate-200/50 hover:bg-white/80"
                        }`}
                    >
                        <p className="text-xs font-medium text-slate-700">{mat.nameJa}</p>
                        <p className="text-[9px] text-slate-400">{mat.name}</p>
                    </button>
                ))}
            </div>

            {/* Selected material detail */}
            <AnimatePresence>
                {selectedEntry && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <GlassCard className="p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-slate-800">
                                        {selectedEntry.nameJa}
                                        <span className="text-slate-400 font-normal ml-1.5 text-xs">
                                            {selectedEntry.name}
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                        {selectedEntry.description}
                                    </p>
                                </div>
                                <MaterialRadar axes={selectedEntry.axes} size={80} />
                            </div>

                            {/* Seasons */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400">シーズン:</span>
                                <div className="flex gap-1">
                                    {selectedEntry.seasons.map((s) => (
                                        <GlassBadge key={s} size="sm">
                                            {s === "spring" ? "🌸 春" : s === "summer" ? "☀️ 夏" : s === "autumn" ? "🍂 秋" : "❄️ 冬"}
                                        </GlassBadge>
                                    ))}
                                </div>
                            </div>

                            {/* Formality & Care */}
                            <div className="flex gap-4 text-[10px]">
                                <div>
                                    <span className="text-slate-400">フォーマリティ: </span>
                                    <span className="text-slate-600 font-mono">
                                        {Math.round(selectedEntry.formality * 10)}/10
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400">ケア難易度: </span>
                                    <span className="text-slate-600 font-mono">
                                        {Math.round(selectedEntry.careLevel * 10)}/10
                                    </span>
                                </div>
                            </div>

                            {/* Pairs with */}
                            <div>
                                <p className="text-[10px] text-slate-400 mb-1">好相性:</p>
                                <div className="flex flex-wrap gap-1">
                                    {selectedEntry.pairsWith.map((k) => {
                                        const m = MATERIAL_DB.find((x) => x.key === k);
                                        return (
                                            <span key={k} className="rounded-full bg-green-50 px-2 py-0.5 text-[9px] text-green-600">
                                                {m?.nameJa ?? k}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            {selectedEntry.avoidWith.length > 0 && (
                                <div>
                                    <p className="text-[10px] text-slate-400 mb-1">要注意:</p>
                                    <div className="flex flex-wrap gap-1">
                                        {selectedEntry.avoidWith.map((k) => {
                                            const m = MATERIAL_DB.find((x) => x.key === k);
                                            return (
                                                <span key={k} className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] text-red-500">
                                                    {m?.nameJa ?? k}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </GlassCard>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Tendency View ── */

function MaterialTendencyView({
    tendency,
}: {
    tendency: ReturnType<typeof analyzeMaterialTendency>;
}) {
    return (
        <div className="space-y-3">
            {/* Radar */}
            <GlassCard className="p-4 flex flex-col items-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">
                    素材傾向
                </p>
                <MaterialRadar axes={tendency.avgAxes} size={140} />
                <p className="text-xs text-slate-600 mt-2 text-center">{tendency.suggestion}</p>
            </GlassCard>

            {/* Missing categories */}
            {tendency.missingCategories.length > 0 && (
                <GlassCard className="p-3">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">
                        足りていない素材カテゴリ
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {tendency.missingCategories.map((cat) => (
                            <GlassBadge key={cat} size="sm">
                                {cat}
                            </GlassBadge>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Dominant materials */}
            {tendency.dominantMaterials.length > 0 && (
                <GlassCard className="p-3">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">
                        よく使う素材
                    </p>
                    <div className="space-y-1.5">
                        {tendency.dominantMaterials.slice(0, 5).map((mat) => (
                            <div key={mat.key} className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-700 w-20 shrink-0">{mat.nameJa}</span>
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-orange-400"
                                        style={{ width: `${((mat.axes.warmth + mat.axes.luster + mat.axes.drape + mat.axes.durability) / 4) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}
        </div>
    );
}
