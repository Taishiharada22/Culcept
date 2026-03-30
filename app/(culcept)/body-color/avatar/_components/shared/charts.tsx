"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { SeasonChoice } from "./types";
import { SEASON_VISUAL } from "./constants";

export function ConstellationChart({
    axes,
    size = 260,
    season,
}: {
    axes: { undertone: number; value_L: number; chroma_C: number; contrast: number };
    size?: number;
    season: SeasonChoice | null;
}) {
    const padding = Math.max(32, size * 0.14);
    const canvasSize = size + padding * 2;
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const r = size * 0.36;
    const labels = [
        { key: "undertone", label: "Warm/Cool", norm: (axes.undertone + 1) / 2, fullLabel: "アンダートーン" },
        { key: "value_L", label: "Value", norm: axes.value_L / 100, fullLabel: "明度 L*" },
        { key: "chroma_C", label: "Chroma", norm: Math.min(axes.chroma_C / 120, 1), fullLabel: "彩度 C*" },
        { key: "contrast", label: "Contrast", norm: axes.contrast, fullLabel: "コントラスト" },
    ];
    const n = labels.length;
    const getXY = (i: number, v: number) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return { x: cx + Math.cos(angle) * r * v, y: cy + Math.sin(angle) * r * v };
    };

    const seasonColors: Record<string, { primary: string; glow: string; bg: string }> = {
        spring: { primary: "#fb923c", glow: "#fcd34d", bg: "rgba(252,211,77,0.06)" },
        summer: { primary: "#a78bfa", glow: "#bae6fd", bg: "rgba(167,139,250,0.06)" },
        autumn: { primary: "#ea580c", glow: "#d97706", bg: "rgba(217,119,6,0.06)" },
        winter: { primary: "#d946ef", glow: "#818cf8", bg: "rgba(99,102,241,0.06)" },
        default: { primary: "#a78bfa", glow: "#6366f1", bg: "rgba(99,102,241,0.06)" },
    };
    const colors = seasonColors[season ?? "default"];
    const dataPoints = labels.map((l, i) => getXY(i, l.norm));

    return (
        <motion.div
            className="relative overflow-visible"
            style={{ width: size, height: size }}
            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${canvasSize} ${canvasSize}`} className="overflow-visible">
                <defs>
                    <filter id="constellation-glow">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <radialGradient id="constellation-center">
                        <stop offset="0%" stopColor={colors.glow} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={colors.glow} stopOpacity="0" />
                    </radialGradient>
                </defs>
                {/* Background glow */}
                <circle cx={cx} cy={cy} r={r * 1.3} fill="url(#constellation-center)" />
                {/* Grid rings */}
                {[0.25, 0.5, 0.75, 1.0].map((level) => (
                    <circle key={level} cx={cx} cy={cy} r={r * level} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="1" strokeDasharray={level < 1 ? "3,6" : "0"} />
                ))}
                {/* Axis lines — faded */}
                {labels.map((_, i) => {
                    const p = getXY(i, 1.05);
                    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.08)" strokeWidth="1" />;
                })}
                {/* Constellation lines — connecting data points */}
                {dataPoints.map((p, i) => {
                    const next = dataPoints[(i + 1) % n];
                    return (
                        <motion.line
                            key={`line-${i}`}
                            x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                            stroke={colors.primary}
                            strokeWidth="2"
                            strokeLinecap="round"
                            filter="url(#constellation-glow)"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.8 }}
                            transition={{ duration: 0.6, delay: 0.3 + i * 0.15, ease: "easeOut" }}
                        />
                    );
                })}
                {/* Data fill — translucent */}
                <motion.polygon
                    points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={colors.bg}
                    stroke="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                />
                {/* Star nodes */}
                {dataPoints.map((p, i) => (
                    <g key={`star-${i}`}>
                        {/* Outer glow */}
                        <motion.circle
                            cx={p.x} cy={p.y} r="12"
                            fill={colors.glow}
                            opacity="0"
                            animate={{ opacity: [0, 0.25, 0], scale: [0.8, 1.5, 0.8] }}
                            transition={{ duration: 3, repeat: Infinity, delay: i * 0.7 }}
                        />
                        {/* Core star */}
                        <motion.circle
                            cx={p.x} cy={p.y} r="6"
                            fill="white"
                            stroke={colors.primary}
                            strokeWidth="2.5"
                            filter="url(#constellation-glow)"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.5 + i * 0.12, type: "spring", stiffness: 500 }}
                        />
                        {/* Inner shine */}
                        <motion.circle
                            cx={p.x} cy={p.y} r="2.5"
                            fill={colors.primary}
                            initial={{ scale: 0 }}
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                        />
                    </g>
                ))}
                {/* Labels */}
                {labels.map((l, i) => {
                    const p = getXY(i, 1.3);
                    const val = Math.round(l.norm * 100);
                    return (
                        <g key={`label-${l.key}`}>
                            <text x={p.x} y={p.y - 8} textAnchor="middle" dominantBaseline="central" className="fill-slate-400 text-[9px] font-bold uppercase tracking-wider">{l.label}</text>
                            <text x={p.x} y={p.y + 6} textAnchor="middle" dominantBaseline="central" className="fill-slate-700 text-[12px] font-black">{val}%</text>
                        </g>
                    );
                })}
            </svg>
        </motion.div>
    );
}

export function ScoreCounter({ value, suffix = "%", label, size = "lg" }: { value: number; suffix?: string; label: string; size?: "sm" | "lg" }) {
    const [displayed, setDisplayed] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let frame: number;
        const start = performance.now();
        const duration = 1200;
        const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            setDisplayed(Math.round(eased * value));
            if (progress < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [value]);
    return (
        <motion.div
            ref={ref}
            className="text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
        >
            <div className={`font-black bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent ${size === "lg" ? "text-5xl sm:text-6xl" : "text-3xl"}`}>
                {displayed}{suffix}
            </div>
            <div className={`mt-1 font-bold text-slate-400 uppercase tracking-[0.2em] ${size === "lg" ? "text-xs" : "text-[10px]"}`}>{label}</div>
        </motion.div>
    );
}

export function SwatchGallery({ swatches, season }: { swatches: { name: string; hex: string }[]; season: SeasonChoice | null }) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const visual = season ? SEASON_VISUAL[season] : null;
    return (
        <div className="flex flex-wrap gap-2.5 justify-center">
            {swatches.map((swatch, i) => (
                <motion.div
                    key={swatch.name}
                    className="group relative flex flex-col items-center cursor-pointer"
                    onHoverStart={() => setHoveredIdx(i)}
                    onHoverEnd={() => setHoveredIdx(null)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Glow */}
                    <motion.div
                        className="absolute -inset-2 rounded-2xl blur-lg"
                        style={{ background: swatch.hex }}
                        animate={{ opacity: hoveredIdx === i ? 0.35 : 0, scale: hoveredIdx === i ? 1.15 : 0.8 }}
                        transition={{ duration: 0.3 }}
                    />
                    {/* Swatch */}
                    <motion.div
                        className="relative w-10 h-10 rounded-xl border-2 border-white shadow-lg"
                        style={{ backgroundColor: swatch.hex }}
                        whileHover={{ scale: 1.15, y: -4, rotate: 2 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                        <div className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-white/30 via-transparent to-transparent" />
                    </motion.div>
                    {/* Label */}
                    <motion.div
                        className="mt-1.5 text-center"
                        animate={{ opacity: hoveredIdx === i ? 1 : 0.7 }}
                    >
                        <div className="text-[9px] font-black text-slate-700 leading-tight max-w-[64px]">{swatch.name}</div>
                        <div className="text-[8px] font-bold text-slate-400 mt-0.5">{swatch.hex}</div>
                    </motion.div>
                </motion.div>
            ))}
        </div>
    );
}

export function RadarChart({
    axes,
    size = 200,
    season,
}: {
    axes: { undertone: number; value_L: number; chroma_C: number; contrast: number };
    size?: number;
    season: SeasonChoice | null;
}) {
    const padding = Math.max(28, size * 0.18);
    const canvasSize = size + padding * 2;
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const r = size * 0.34;
    const labels = [
        { key: "undertone", label: "Warm/Cool", norm: (axes.undertone + 1) / 2 },
        { key: "value_L", label: "明度", norm: axes.value_L / 100 },
        { key: "chroma_C", label: "彩度", norm: Math.min(axes.chroma_C / 120, 1) },
        { key: "contrast", label: "コントラスト", norm: axes.contrast },
    ];
    const n = labels.length;
    const getXY = (i: number, v: number) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return { x: cx + Math.cos(angle) * r * v, y: cy + Math.sin(angle) * r * v };
    };
    const gridLevels = [0.25, 0.5, 0.75, 1.0];
    const gradientId = `radar-fill-${season ?? "default"}`;
    const seasonColors: Record<string, [string, string]> = {
        spring: ["#fcd34d", "#fb923c"],
        summer: ["#bae6fd", "#a78bfa"],
        autumn: ["#d97706", "#ea580c"],
        winter: ["#818cf8", "#d946ef"],
        default: ["#a78bfa", "#6366f1"],
    };
    const [c1, c2] = seasonColors[season ?? "default"];
    const dataPath = labels.map((l, i) => {
        const { x, y } = getXY(i, l.norm);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
    }).join(" ") + "Z";

    return (
        <motion.svg
            width={size}
            height={size}
            viewBox={`0 0 ${canvasSize} ${canvasSize}`}
            className="overflow-visible drop-shadow-lg"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={c1} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={c2} stopOpacity="0.45" />
                </linearGradient>
            </defs>
            {/* Grid */}
            {gridLevels.map((level) => {
                const pts = labels.map((_, i) => { const p = getXY(i, level); return `${p.x},${p.y}`; }).join(" ");
                return <polygon key={level} points={pts} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />;
            })}
            {/* Axes lines */}
            {labels.map((_, i) => {
                const p = getXY(i, 1);
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />;
            })}
            {/* Data polygon */}
            <motion.path
                d={dataPath}
                fill={`url(#${gradientId})`}
                stroke={c2}
                strokeWidth="2.5"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
            />
            {/* Data points */}
            {labels.map((l, i) => {
                const { x, y } = getXY(i, l.norm);
                return (
                    <motion.circle
                        key={l.key}
                        cx={x} cy={y} r="5"
                        fill="white" stroke={c2} strokeWidth="2.5"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 400 }}
                    />
                );
            })}
            {/* Labels */}
            {labels.map((l, i) => {
                const { x, y } = getXY(i, 1.25);
                return (
                    <text
                        key={l.key}
                        x={x} y={y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-slate-500 text-[10px] font-bold"
                    >
                        {l.label}
                    </text>
                );
            })}
        </motion.svg>
    );
}

export function AnimatedGauge({ value, label, max = 100, colorFrom, colorTo, suffix = "%" }: {
    value: number; label: string; max?: number; colorFrom: string; colorTo: string; suffix?: string;
}) {
    const normalized = Math.min(value / max, 1);
    const strokeWidth = 6;
    const r = 28;
    const circumference = 2 * Math.PI * r;
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative">
                <svg width="68" height="68" viewBox="0 0 68 68">
                    <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={strokeWidth} />
                    <motion.circle
                        cx="34" cy="34" r={r} fill="none"
                        stroke={`url(#gauge-${label})`}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference * (1 - normalized) }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        transform="rotate(-90 34 34)"
                    />
                    <defs>
                        <linearGradient id={`gauge-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={colorFrom} />
                            <stop offset="100%" stopColor={colorTo} />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <motion.span
                        className="text-xs font-black text-slate-800"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                    >
                        {Math.round(value)}{suffix}
                    </motion.span>
                </div>
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        </div>
    );
}

export function SeasonWheel({ active, onSelect }: { active: SeasonChoice | null; onSelect: (s: SeasonChoice) => void }) {
    const seasons: SeasonChoice[] = ["spring", "summer", "autumn", "winter"];
    return (
        <div className="relative mx-auto w-[172px] h-[172px]">
            {seasons.map((season, i) => {
                const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
                const x = 86 + Math.cos(angle) * 56;
                const y = 86 + Math.sin(angle) * 56;
                const isActive = active === season;
                const visual = SEASON_VISUAL[season];
                return (
                    <motion.button
                        key={season}
                        type="button"
                        onClick={() => onSelect(season)}
                        className={`absolute flex flex-col items-center justify-center rounded-full transition-all duration-300 ${
                            isActive
                                ? "w-[56px] h-[56px] text-white shadow-2xl ring-3 ring-white/50 z-10"
                                : "w-[44px] h-[44px] bg-white/90 text-slate-600 shadow-lg hover:shadow-xl border border-white/80 z-0"
                        }`}
                        style={{
                            left: x - (isActive ? 28 : 22),
                            top: y - (isActive ? 28 : 22),
                            background: isActive ? visual.background : undefined,
                        }}
                        whileHover={{ scale: 1.12 }}
                        whileTap={{ scale: 0.95 }}
                        animate={isActive ? { scale: [1, 1.08, 1] } : {}}
                        transition={isActive ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
                    >
                        <span className={`text-sm ${isActive ? "" : "text-xs"}`}>{visual.emoji}</span>
                        <span className={`text-[8px] font-black tracking-wide ${isActive ? "text-white/90" : "text-slate-500"}`}>{visual.label}</span>
                    </motion.button>
                );
            })}
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-100 to-fuchsia-50 border border-white/80 shadow-inner flex items-center justify-center">
                    <span className="text-[9px] font-black text-violet-600">
                        {active ? SEASON_VISUAL[active].label : "SELECT"}
                    </span>
                </div>
            </div>
        </div>
    );
}
