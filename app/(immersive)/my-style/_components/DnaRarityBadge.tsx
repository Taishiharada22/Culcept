"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge, FadeInView } from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type { RarityProfile, RarityDimension } from "../_lib/dnaRarity";
import { getRarityLabel, getRarityColor, getUniqueTraitNarrative } from "../_lib/dnaRarity";

/* ── Radar chart (inline SVG) ── */

function RarityRadar({
    dimensions,
    size = 200,
}: {
    dimensions: RarityDimension[];
    size?: number;
}) {
    if (dimensions.length < 3) return null;

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.38;
    const n = dimensions.length;

    // Background rings
    const rings = [0.25, 0.5, 0.75, 1.0];

    // Population mean polygon
    const meanPoints = dimensions
        .map((d, i) => {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            const r = ((d.populationMean + 1) / 2) * maxR;
            return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
        })
        .join(" ");

    // User polygon
    const userPoints = dimensions
        .map((d, i) => {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            const r = ((d.value + 1) / 2) * maxR;
            return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
        })
        .join(" ");

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background rings */}
            {rings.map((ring) => (
                <circle
                    key={ring}
                    cx={cx}
                    cy={cy}
                    r={maxR * ring}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={0.5}
                    className="text-slate-200"
                />
            ))}

            {/* Axis lines */}
            {dimensions.map((d, i) => {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const x2 = cx + Math.cos(angle) * maxR;
                const y2 = cy + Math.sin(angle) * maxR;
                return (
                    <line
                        key={d.name}
                        x1={cx}
                        y1={cy}
                        x2={x2}
                        y2={y2}
                        stroke="currentColor"
                        strokeWidth={0.5}
                        className="text-slate-200"
                    />
                );
            })}

            {/* Population mean area */}
            <polygon
                points={meanPoints}
                fill="rgba(148,163,184,0.15)"
                stroke="rgba(148,163,184,0.4)"
                strokeWidth={1}
                strokeDasharray="3,3"
            />

            {/* User area */}
            <motion.polygon
                points={userPoints}
                fill="rgba(139,92,246,0.2)"
                stroke="rgba(139,92,246,0.8)"
                strokeWidth={1.5}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
            />

            {/* User points */}
            {dimensions.map((d, i) => {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const r = ((d.value + 1) / 2) * maxR;
                const px = cx + Math.cos(angle) * r;
                const py = cy + Math.sin(angle) * r;
                return (
                    <motion.circle
                        key={d.name}
                        cx={px}
                        cy={py}
                        r={d.isRare ? 4 : 2.5}
                        fill={d.isRare ? "#8b5cf6" : "#94a3b8"}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                    />
                );
            })}

            {/* Labels */}
            {dimensions.map((d, i) => {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const labelR = maxR + 18;
                const lx = cx + Math.cos(angle) * labelR;
                const ly = cy + Math.sin(angle) * labelR;
                // Shorten label to just the first part
                const shortLabel = d.name.includes("\u2194")
                    ? d.name.split("\u2194")[0]
                    : d.name;
                return (
                    <text
                        key={d.name}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className={cn(
                            "text-[8px]",
                            d.isRare ? "fill-violet-600 font-bold" : "fill-slate-400",
                        )}
                    >
                        {shortLabel}
                    </text>
                );
            })}
        </svg>
    );
}

/* ── Trait list ── */

function TraitList({
    label,
    traits,
    highlight,
}: {
    label: string;
    traits: string[];
    highlight: boolean;
}) {
    if (traits.length === 0) return null;

    return (
        <div className="space-y-1.5">
            <span
                className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    highlight ? "text-violet-600" : "text-slate-400",
                )}
            >
                {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
                {traits.map((trait) => (
                    <span
                        key={trait}
                        className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold",
                            highlight
                                ? "bg-violet-100 text-violet-700 border border-violet-200"
                                : "bg-slate-100 text-slate-500 border border-slate-200",
                        )}
                    >
                        {trait}
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ── Main Component ── */

interface DnaRarityBadgeV2Props {
    profile: RarityProfile;
    className?: string;
}

export default function DnaRarityBadgeV2({
    profile,
    className,
}: DnaRarityBadgeV2Props) {
    const [expanded, setExpanded] = useState(false);

    const colorScheme = useMemo(
        () => getRarityColor(profile.overallRarity),
        [profile.overallRarity],
    );
    const narrative = useMemo(
        () => getUniqueTraitNarrative(profile),
        [profile],
    );

    const hasData = profile.dimensions.length > 0;
    const approxPct = Math.max(1, 100 - profile.overallRarity);

    return (
        <FadeInView className={className}>
            <div className="space-y-3">
                {/* Compact badge */}
                <motion.button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="w-full text-left"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                >
                    <GlassCard
                        variant="default"
                        padding="sm"
                        hoverEffect={false}
                    >
                        <div className="flex items-center gap-4">
                            {/* Rarity badge circle */}
                            <div className="relative">
                                <motion.div
                                    className={cn(
                                        "w-14 h-14 rounded-2xl flex items-center justify-center",
                                        colorScheme.bg,
                                    )}
                                    animate={
                                        profile.overallRarity >= 60
                                            ? {
                                                  boxShadow: [
                                                      "0 0 0 0 rgba(139,92,246,0)",
                                                      "0 0 20px 4px rgba(139,92,246,0.2)",
                                                      "0 0 0 0 rgba(139,92,246,0)",
                                                  ],
                                              }
                                            : {}
                                    }
                                    transition={{
                                        duration: 2.5,
                                        repeat: Infinity,
                                    }}
                                >
                                    <span
                                        className={cn(
                                            "text-lg font-black",
                                            colorScheme.text,
                                        )}
                                    >
                                        {profile.overallRarity}
                                    </span>
                                </motion.div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-[15px] font-bold text-slate-900">
                                        DNA{"\u5E0C\u5C11\u5EA6"}
                                    </h3>
                                    <GlassBadge
                                        size="sm"
                                        variant={
                                            profile.overallRarity >= 60
                                                ? "gradient"
                                                : profile.overallRarity >= 40
                                                  ? "info"
                                                  : "default"
                                        }
                                    >
                                        {profile.rarityLabel}
                                    </GlassBadge>
                                </div>
                                <p className="text-[12px] text-slate-500 mt-0.5">
                                    {hasData
                                        ? `\u3042\u306A\u305F\u306E\u3088\u3046\u306A\u7D44\u307F\u5408\u308F\u305B\u306F\u7D04 ${approxPct}% \u306E\u4EBA\u306B\u898B\u3089\u308C\u307E\u3059`
                                        : "\u30C7\u30FC\u30BF\u304C\u5897\u3048\u308B\u3068\u5E0C\u5C11\u5EA6\u304C\u898B\u3048\u3066\u304D\u307E\u3059"}
                                </p>
                            </div>

                            <span className="text-slate-400 text-xs">
                                {expanded ? "\u25B2" : "\u25BC"}
                            </span>
                        </div>
                    </GlassCard>
                </motion.button>

                {/* Expanded detail */}
                <AnimatePresence>
                    {expanded && hasData && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                        >
                            <GlassCard variant="bordered" padding="md">
                                <div className="space-y-5">
                                    {/* Radar chart */}
                                    <div className="flex justify-center">
                                        <RarityRadar
                                            dimensions={profile.dimensions}
                                            size={220}
                                        />
                                    </div>

                                    {/* Legend */}
                                    <div className="flex items-center justify-center gap-4 text-[10px]">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-[2px] bg-violet-500 rounded" />
                                            <span className="text-slate-600">{"\u3042\u306A\u305F"}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-[2px] border-t border-dashed border-slate-400" />
                                            <span className="text-slate-400">{"\u5E73\u5747"}</span>
                                        </div>
                                    </div>

                                    {/* Narrative */}
                                    <div className="rounded-xl bg-slate-50 border border-slate-200/50 p-3">
                                        <p className="text-[13px] text-slate-700 leading-relaxed">
                                            {narrative}
                                        </p>
                                    </div>

                                    {/* Traits */}
                                    <div className="space-y-3">
                                        <TraitList
                                            label={"\u3053\u308C\u306F\u3042\u306A\u305F\u3060\u3051"}
                                            traits={profile.uniqueTraits}
                                            highlight
                                        />
                                        <TraitList
                                            label={"\u591A\u304F\u306E\u4EBA\u3068\u5171\u901A"}
                                            traits={profile.commonTraits}
                                            highlight={false}
                                        />
                                    </div>

                                    {/* Archetype */}
                                    <div className="rounded-xl border border-slate-200/50 bg-white/60 p-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {"\u6700\u3082\u8FD1\u3044\u578B"}
                                                </span>
                                                <p className="text-[14px] font-bold text-slate-800 mt-0.5">
                                                    {profile.archetypeMatch}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {"\u8DDD\u96E2"}
                                                </span>
                                                <p className="text-[14px] font-bold text-slate-800 mt-0.5">
                                                    {profile.archetypeDistance}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-2">
                                            {profile.archetypeDistance > 1.5
                                                ? "\u578B\u306B\u53CE\u307E\u3089\u306A\u3044\u72EC\u81EA\u6027\u304C\u3042\u308A\u307E\u3059"
                                                : profile.archetypeDistance > 0.8
                                                  ? "\u57FA\u672C\u578B\u304B\u3089\u306E\u500B\u6027\u7684\u306A\u6D3E\u751F\u304C\u898B\u3089\u308C\u307E\u3059"
                                                  : "\u3053\u306E\u578B\u306E\u5178\u578B\u7684\u306A\u7279\u5FB4\u3092\u6301\u3063\u3066\u3044\u307E\u3059"}
                                        </p>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </FadeInView>
    );
}
