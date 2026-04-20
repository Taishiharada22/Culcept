"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { SeasonChoice } from "./types";
import { SEASON_VISUAL } from "./constants";

/** ScrollReveal — IntersectionObserver-driven entrance animation */
export function ScrollReveal({ children, className = "", delay = 0, direction = "up" }: {
    children: React.ReactNode; className?: string; delay?: number; direction?: "up" | "left" | "right" | "scale";
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    const variants: Record<string, { initial: any; animate: any }> = {
        up: { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 } },
        left: { initial: { opacity: 0, x: -40 }, animate: { opacity: 1, x: 0 } },
        right: { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 } },
        scale: { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 } },
    };
    const v = variants[direction];
    return (
        <motion.div
            ref={ref}
            className={className}
            initial={v.initial}
            animate={visible ? v.animate : v.initial}
            transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}

/** CelebrationBurst — particle explosion on save success */
export function CelebrationBurst({ active }: { active: boolean }) {
    const particles = useMemo(() =>
        Array.from({ length: 40 }, (_, i) => ({
            id: i,
            angle: (i / 40) * Math.PI * 2,
            distance: 60 + Math.random() * 120,
            size: 4 + Math.random() * 8,
            color: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#f97316"][i % 6],
            delay: Math.random() * 0.3,
            shape: i % 3 === 0 ? "circle" : i % 3 === 1 ? "star" : "diamond",
        })), []);
    if (!active) return null;
    return (
        <motion.div
            className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2, delay: 1.5 }}
        >
            {/* Central flash */}
            <motion.div
                className="absolute w-32 h-32 rounded-full bg-white"
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 8, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            />
            {/* Checkmark */}
            <motion.svg
                width="80" height="80" viewBox="0 0 80 80" className="absolute"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
                <circle cx="40" cy="40" r="36" fill="none" stroke="#10b981" strokeWidth="4" opacity="0.3" />
                <motion.path
                    d="M24 42 L35 53 L56 28"
                    fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                />
            </motion.svg>
            {/* Particles */}
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute"
                    style={{
                        width: p.size, height: p.size, backgroundColor: p.color,
                        borderRadius: p.shape === "circle" ? "50%" : p.shape === "diamond" ? "2px" : "1px",
                        transform: p.shape === "diamond" ? "rotate(45deg)" : undefined,
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                        x: Math.cos(p.angle) * p.distance,
                        y: Math.sin(p.angle) * p.distance,
                        opacity: 0, scale: 0,
                    }}
                    transition={{ duration: 1.2, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
                />
            ))}
        </motion.div>
    );
}

/** DNAHelixLoader — cinematic DNA assembly animation */
export function DNAHelixLoader() {
    const strandCount = 12;
    return (
        <div className="flex flex-col items-center gap-6 py-10">
            <div className="relative w-20 h-40">
                {Array.from({ length: strandCount }, (_, i) => {
                    const t = i / strandCount;
                    const y = t * 140;
                    return (
                        <motion.div key={i} className="absolute left-0 right-0 flex items-center justify-between px-1" style={{ top: y }}>
                            <motion.div
                                className="w-3 h-3 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400"
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: [20, -8, 20], opacity: [0, 1, 0.7] }}
                                transition={{ duration: 2, delay: t * 0.15, repeat: Infinity, ease: "easeInOut" }}
                            />
                            <motion.div
                                className="absolute left-1/2 -translate-x-1/2 h-[1px] bg-gradient-to-r from-violet-300/40 via-white/60 to-fuchsia-300/40"
                                style={{ width: "60%" }}
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: [0, 1, 0] }}
                                transition={{ duration: 2, delay: t * 0.15 + 0.3, repeat: Infinity }}
                            />
                            <motion.div
                                className="w-3 h-3 rounded-full bg-gradient-to-br from-fuchsia-400 to-pink-400"
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: [-20, 8, -20], opacity: [0, 1, 0.7] }}
                                transition={{ duration: 2, delay: t * 0.15, repeat: Infinity, ease: "easeInOut" }}
                            />
                        </motion.div>
                    );
                })}
            </div>
            <motion.div
                className="text-sm font-black bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                Phenotype を解析中...
            </motion.div>
        </div>
    );
}

/** MouseGlow — cursor-following aurora glow in hero */
export function MouseGlow() {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    useEffect(() => {
        const el = ref.current?.parentElement;
        if (!el) return;
        const handler = (e: MouseEvent) => {
            const rect = el.getBoundingClientRect();
            setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        };
        el.addEventListener("mousemove", handler);
        return () => el.removeEventListener("mousemove", handler);
    }, []);
    return (
        <motion.div
            ref={ref}
            className="absolute inset-0 pointer-events-none z-[1] hidden sm:block"
            style={{ background: `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, rgba(167,139,250,0.12), transparent 70%)` }}
            animate={{ opacity: pos.x > 0 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
        />
    );
}

/** CompletionConstellation — star map showing feature completion */
export function CompletionConstellation({ sections }: { sections: { key: string; label: string; icon: string; ready: boolean; progress: number }[] }) {
    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 100;
    const points = sections.map((s, i) => {
        const angle = (i / sections.length) * Math.PI * 2 - Math.PI / 2;
        return { ...s, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle };
    });
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="absolute inset-0">
                {/* Connection lines */}
                {points.map((p, i) => {
                    const next = points[(i + 1) % points.length];
                    return (
                        <motion.line
                            key={`line-${i}`}
                            x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                            stroke={p.ready && next.ready ? "rgba(139,92,246,0.4)" : "rgba(148,163,184,0.15)"}
                            strokeWidth={p.ready && next.ready ? 2 : 1}
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 1, delay: i * 0.1 }}
                        />
                    );
                })}
                {/* Cross connections */}
                {points.filter(p => p.ready).map((p, i, arr) => {
                    if (i === 0) return null;
                    const prev = arr[i - 1];
                    return (
                        <motion.line
                            key={`cross-${i}`}
                            x1={prev.x} y1={prev.y} x2={p.x} y2={p.y}
                            stroke="rgba(139,92,246,0.15)" strokeWidth="1" strokeDasharray="4 4"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 + i * 0.1 }}
                        />
                    );
                })}
                {/* Center pulse */}
                <motion.circle
                    cx={cx} cy={cy} r={8} fill="url(#centerGlow)"
                    initial={{ r: 8 }}
                    animate={{ r: [8, 12, 8], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 3, repeat: Infinity }}
                />
                <defs>
                    <radialGradient id="centerGlow">
                        <stop offset="0%" stopColor="rgba(139,92,246,0.8)" />
                        <stop offset="100%" stopColor="rgba(139,92,246,0)" />
                    </radialGradient>
                </defs>
            </svg>
            {/* Star nodes */}
            {points.map((p, i) => (
                <div
                    key={p.key}
                    className="absolute"
                    style={{ left: p.x, top: p.y }}
                >
                    <motion.div
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 300 }}
                    >
                        <motion.div
                            className={`flex h-10 w-10 items-center justify-center rounded-full text-lg shadow-lg ${
                                p.ready
                                    ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-violet-500/30"
                                    : "bg-white/80 border border-slate-200 shadow-slate-200/50"
                            }`}
                            animate={p.ready ? { boxShadow: ["0 0 0 0 rgba(139,92,246,0.4)", "0 0 0 8px rgba(139,92,246,0)", "0 0 0 0 rgba(139,92,246,0.4)"] } : undefined}
                            transition={p.ready ? { duration: 2, repeat: Infinity, delay: i * 0.3 } : undefined}
                        >
                            <span>{p.icon}</span>
                        </motion.div>
                    </motion.div>
                    <div className="absolute left-1/2 top-[30px] flex w-20 -translate-x-1/2 flex-col items-center gap-1 text-center">
                        <span className={`text-[9px] font-black ${p.ready ? "text-violet-600" : "text-slate-400"}`}>{p.label}</span>
                        {p.ready && (
                            <motion.span
                                className="text-[8px] font-bold text-emerald-500"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.8 + i * 0.1 }}
                            >
                                {p.progress}%
                            </motion.span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** EvolutionTimeline — visual journey of phenotype data collection */
export function EvolutionTimeline({ milestones }: { milestones: { label: string; icon: string; date: string | null; status: "done" | "current" | "locked" }[] }) {
    return (
        <div className="relative pl-8">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-violet-300 via-fuchsia-300 to-slate-200" />
            {milestones.map((m, i) => (
                <motion.div
                    key={m.label}
                    className="relative flex items-start gap-4 mb-8 last:mb-0"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Node */}
                    <motion.div
                        className={`absolute -left-8 w-8 h-8 rounded-full flex items-center justify-center text-sm z-10 ${
                            m.status === "done"
                                ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30"
                                : m.status === "current"
                                    ? "bg-white border-2 border-violet-400 text-violet-600 shadow-md"
                                    : "bg-slate-100 text-slate-300 border border-slate-200"
                        }`}
                        animate={m.status === "current" ? { scale: [1, 1.1, 1], boxShadow: ["0 0 0 0 rgba(139,92,246,0.3)", "0 0 0 8px rgba(139,92,246,0)", "0 0 0 0 rgba(139,92,246,0.3)"] } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        {m.icon}
                    </motion.div>
                    {/* Content */}
                    <div className={`flex-1 rounded-2xl p-4 ${
                        m.status === "done"
                            ? "bg-gradient-to-r from-violet-50 to-white border border-violet-100"
                            : m.status === "current"
                                ? "bg-white border-2 border-violet-200 shadow-sm"
                                : "bg-slate-50 border border-slate-100 opacity-50"
                    }`}>
                        <div className="flex items-center justify-between">
                            <span className={`text-sm font-black ${m.status === "locked" ? "text-slate-400" : "text-slate-900"}`}>{m.label}</span>
                            {m.date && <span className="text-[10px] font-bold text-slate-400">{m.date}</span>}
                        </div>
                        {m.status === "done" && (
                            <motion.div
                                className="mt-1 flex items-center gap-1 text-[10px] font-bold text-emerald-500"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 + i * 0.1 }}
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 6.5L5 8.5L9 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                                完了
                            </motion.div>
                        )}
                        {m.status === "current" && (
                            <motion.div
                                className="mt-1 text-[10px] font-bold text-violet-500"
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                入力を待っています...
                            </motion.div>
                        )}
                        {m.status === "locked" && (
                            <div className="mt-1 text-[10px] font-bold text-slate-300">前のステップを完了してください</div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

/** ScrollProgress — fixed gradient line at top showing scroll position */
export function ScrollProgress() {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
        const handler = () => {
            const docH = document.documentElement.scrollHeight - window.innerHeight;
            setProgress(docH > 0 ? window.scrollY / docH : 0);
        };
        window.addEventListener("scroll", handler, { passive: true });
        return () => window.removeEventListener("scroll", handler);
    }, []);
    return (
        <div className="fixed top-0 left-0 right-0 h-[2px] z-[60] pointer-events-none">
            <motion.div
                className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500"
                style={{ width: `${progress * 100}%`, transformOrigin: "left" }}
            />
        </div>
    );
}

/** ColorHarmonyWheel — circular color wheel with user palette mapped */
export function ColorHarmonyWheel({ swatches, season }: { swatches: { name: string; hex: string }[]; season: SeasonChoice | null }) {
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 105;
    const innerR = 70;
    const segments = 24;
    const seasonHueShift: Record<string, number> = { spring: 30, summer: 200, autumn: 20, winter: 260 };
    const baseHue = seasonHueShift[season ?? "spring"];

    return (
        <motion.div
            className="relative mx-auto"
            style={{ width: size, height: size }}
            initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
            <svg width={size} height={size}>
                <defs>
                    <filter id="harmony-shadow">
                        <feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.2" />
                    </filter>
                    <filter id="harmony-glow">
                        <feGaussianBlur stdDeviation="4" />
                    </filter>
                </defs>
                {/* Outer color wheel segments */}
                {Array.from({ length: segments }, (_, i) => {
                    const a1 = (i / segments) * Math.PI * 2 - Math.PI / 2;
                    const a2 = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;
                    const hue = (baseHue + (i / segments) * 360) % 360;
                    return (
                        <motion.path
                            key={i}
                            d={`M${cx + Math.cos(a1) * innerR},${cy + Math.sin(a1) * innerR}
                                L${cx + Math.cos(a1) * outerR},${cy + Math.sin(a1) * outerR}
                                A${outerR},${outerR} 0 0,1 ${cx + Math.cos(a2) * outerR},${cy + Math.sin(a2) * outerR}
                                L${cx + Math.cos(a2) * innerR},${cy + Math.sin(a2) * innerR}
                                A${innerR},${innerR} 0 0,0 ${cx + Math.cos(a1) * innerR},${cy + Math.sin(a1) * innerR}Z`}
                            fill={`hsl(${hue}, 60%, 55%)`}
                            opacity="0.3"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 0.3, scale: 1 }}
                            transition={{ delay: i * 0.02, duration: 0.5 }}
                        />
                    );
                })}
                {/* Inner ring glow */}
                <circle cx={cx} cy={cy} r={innerR - 4} fill="none" stroke="rgba(139,92,246,0.1)" strokeWidth="1" />
                {/* User swatch markers on the wheel */}
                {swatches.slice(0, 8).map((s, i) => {
                    const angle = (i / Math.min(swatches.length, 8)) * Math.PI * 2 - Math.PI / 2;
                    const markerR = (outerR + innerR) / 2;
                    const mx = cx + Math.cos(angle) * markerR;
                    const my = cy + Math.sin(angle) * markerR;
                    return (
                        <g key={s.name}>
                            {/* Radial connection to center */}
                            <motion.line
                                x1={cx} y1={cy} x2={mx} y2={my}
                                stroke={s.hex} strokeWidth="1.5" opacity="0.2"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ delay: 0.8 + i * 0.08, duration: 0.4 }}
                            />
                            {/* Outer glow */}
                            <motion.circle
                                cx={mx} cy={my} r="16" fill={s.hex} opacity="0"
                                filter="url(#harmony-glow)"
                                animate={{ opacity: [0, 0.3, 0] }}
                                transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                            />
                            {/* Swatch dot */}
                            <motion.circle
                                cx={mx} cy={my} r="11"
                                fill={s.hex} stroke="white" strokeWidth="3"
                                filter="url(#harmony-shadow)"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.6 + i * 0.08, type: "spring", stiffness: 300, damping: 15 }}
                            />
                        </g>
                    );
                })}
                {/* Center circle */}
                <circle cx={cx} cy={cy} r="30" fill="white" stroke="rgba(139,92,246,0.15)" strokeWidth="1.5" />
                <text x={cx} y={cy - 5} textAnchor="middle" className="text-[8px] font-black fill-violet-400 uppercase tracking-[0.15em]">Color</text>
                <text x={cx} y={cy + 7} textAnchor="middle" className="text-[8px] font-black fill-violet-400 uppercase tracking-[0.15em]">Harmony</text>
                {/* Swatch count */}
                <motion.text
                    x={cx} y={cy + 20} textAnchor="middle"
                    className="text-[9px] font-bold fill-slate-300"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                >
                    {swatches.length} colors
                </motion.text>
            </svg>
        </motion.div>
    );
}

/** PhenotypeSummaryCard — shareable dark card showing full phenotype overview */
export function PhenotypeSummaryCard({
    season, seasonLabel, progress, faceCount, measureCount, swatches,
}: {
    season: SeasonChoice | null;
    seasonLabel: string;
    progress: number;
    faceCount: number;
    measureCount: number;
    swatches: { name: string; hex: string }[];
}) {
    const vis = season ? SEASON_VISUAL[season] : null;
    return (
        <motion.div
            className="relative overflow-hidden rounded-[2rem] p-8 sm:p-10"
            style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #4c1d95 100%)" }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
        >
            {/* Decorative orbs */}
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-gradient-to-bl from-violet-500/20 to-transparent -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full bg-gradient-to-tr from-fuchsia-500/15 to-transparent translate-y-1/3 -translate-x-1/3" />
            <motion.div
                className="absolute top-1/2 left-1/2 w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)" }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 6, repeat: Infinity }}
            />
            <div className="relative text-white">
                <motion.div
                    className="text-[10px] font-black uppercase tracking-[0.6em] text-violet-400/60"
                    initial={{ letterSpacing: "0em", opacity: 0 }}
                    animate={{ letterSpacing: "0.6em", opacity: 1 }}
                    transition={{ duration: 1.2 }}
                >
                    Phenotype Card
                </motion.div>
                <h3 className="mt-2 text-2xl sm:text-3xl font-black" style={{ fontFeatureSettings: "'palt' 1" }}>
                    あなたのフェノタイプ
                </h3>
                {/* Stats row */}
                <div className="mt-8 grid grid-cols-4 gap-3">
                    {[
                        { val: `${progress}%`, label: "完成度", emoji: null },
                        { val: null, label: seasonLabel || "未判定", emoji: vis?.emoji ?? "—" },
                        { val: `${faceCount}/5`, label: "顔分析", emoji: null },
                        { val: `${measureCount}`, label: "計測項目", emoji: null },
                    ].map((s, i) => (
                        <motion.div
                            key={s.label}
                            className="text-center"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + i * 0.1 }}
                        >
                            <div className="text-2xl sm:text-3xl font-black">
                                {s.emoji ?? s.val}
                            </div>
                            <div className="mt-1 text-[10px] font-bold text-white/40 uppercase tracking-wider">{s.label}</div>
                        </motion.div>
                    ))}
                </div>
                {/* Color palette strip */}
                {swatches.length > 0 && (
                    <div className="mt-7 flex justify-center gap-2.5">
                        {swatches.slice(0, 8).map((s, i) => (
                            <motion.div
                                key={s.name}
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-[2.5px] border-white/25 shadow-lg"
                                style={{ backgroundColor: s.hex }}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.8 + i * 0.06, type: "spring", stiffness: 300 }}
                                whileHover={{ scale: 1.25, y: -4, borderColor: "rgba(255,255,255,0.7)" }}
                            />
                        ))}
                    </div>
                )}
                {/* Watermark */}
                <motion.div
                    className="mt-8 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                >
                    <div className="text-[8px] font-bold text-white/15 uppercase tracking-[0.5em]">Powered by Aneurasync</div>
                </motion.div>
            </div>
        </motion.div>
    );
}

/** GradientBorderCard — rotating conic gradient border wrapper */
export function GradientBorderCard({ children, className = "", speed = 8 }: { children: React.ReactNode; className?: string; speed?: number }) {
    return (
        <div className={`relative rounded-[2rem] p-[2px] overflow-hidden ${className}`}>
            <motion.div
                className="absolute inset-[-50%] w-[200%] h-[200%]"
                style={{ background: "conic-gradient(from 0deg, #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6, #8b5cf6)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative rounded-[calc(2rem-2px)] bg-white overflow-hidden">
                {children}
            </div>
        </div>
    );
}

/** AuroraBackground — season-themed flowing aurora effect */
export function AuroraBackground({ season }: { season: SeasonChoice | null }) {
    const config: Record<SeasonChoice, { stops: string[]; blobs: string[] }> = {
        spring: {
            stops: ["rgba(252,211,77,0.25)", "rgba(251,146,60,0.18)", "rgba(249,168,212,0.15)"],
            blobs: ["#fcd34d", "#fb923c", "#f9a8d4", "#a7f3d0"],
        },
        summer: {
            stops: ["rgba(186,230,253,0.25)", "rgba(167,139,250,0.18)", "rgba(251,207,232,0.12)"],
            blobs: ["#bae6fd", "#a78bfa", "#ddd6fe", "#fbcfe8"],
        },
        autumn: {
            stops: ["rgba(217,119,6,0.22)", "rgba(234,88,12,0.15)", "rgba(5,150,105,0.1)"],
            blobs: ["#d97706", "#ea580c", "#92400e", "#059669"],
        },
        winter: {
            stops: ["rgba(99,102,241,0.22)", "rgba(217,70,239,0.15)", "rgba(241,245,249,0.1)"],
            blobs: ["#818cf8", "#d946ef", "#6366f1", "#f1f5f9"],
        },
    };
    const c = config[season ?? "winter"];
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* Flowing aurora ribbons */}
            {c.blobs.map((color, i) => (
                <motion.div
                    key={i}
                    className="absolute rounded-full blur-3xl"
                    style={{
                        width: `${220 + i * 80}px`,
                        height: `${120 + i * 40}px`,
                        background: `radial-gradient(ellipse, ${color}40, transparent 70%)`,
                        left: `${10 + i * 20}%`,
                        top: `${15 + (i % 2) * 40}%`,
                    }}
                    animate={{
                        x: [0, 60 * (i % 2 === 0 ? 1 : -1), -30 * (i % 2 === 0 ? 1 : -1), 0],
                        y: [0, -30, 20, 0],
                        scale: [1, 1.2, 0.9, 1],
                        opacity: [0.5, 0.8, 0.4, 0.5],
                    }}
                    transition={{
                        duration: 14 + i * 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 1.5,
                    }}
                />
            ))}
            {/* Shimmer line */}
            <motion.div
                className="absolute h-[1px] w-full top-1/2"
                style={{
                    background: `linear-gradient(90deg, transparent, ${c.blobs[0]}30, ${c.blobs[1]}20, transparent)`,
                }}
                animate={{ opacity: [0, 0.6, 0], x: ["-100%", "100%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
        </div>
    );
}

/** CinematicEntry — curtain-reveal entrance wrapper */
export function CinematicEntry({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
        >
            {/* Top curtain */}
            <motion.div
                className="fixed inset-0 z-[100] pointer-events-none bg-gradient-to-b from-slate-900 via-slate-900/80 to-transparent"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
            {children}
        </motion.div>
    );
}

/** SeasonParticles — floating season-themed particles */
export function SeasonParticles({ season, count = 28 }: { season: SeasonChoice | null; count?: number }) {
    const particles = useMemo(() => {
        const config: Record<SeasonChoice, { colors: string[]; shapes: string[] }> = {
            spring: { colors: ["#fcd34d", "#fb923c", "#f9a8d4", "#a7f3d0"], shapes: ["🌸", "✿", "🌿", "☘"] },
            summer: { colors: ["#bae6fd", "#e2e8f0", "#ddd6fe", "#fbcfe8"], shapes: ["🫧", "💧", "✧", "○"] },
            autumn: { colors: ["#d97706", "#ea580c", "#92400e", "#065f46"], shapes: ["🍂", "🍁", "🌾", "◆"] },
            winter: { colors: ["#e2e8f0", "#818cf8", "#d946ef", "#f1f5f9"], shapes: ["❄", "✦", "◇", "✧"] },
        };
        const c = config[season ?? "spring"];
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 6 + Math.random() * 18,
            duration: 12 + Math.random() * 20,
            delay: Math.random() * -20,
            color: c.colors[i % c.colors.length],
            shape: c.shapes[i % c.shapes.length],
            opacity: 0.15 + Math.random() * 0.35,
        }));
    }, [season, count]);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute select-none"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, fontSize: p.size, opacity: p.opacity, color: p.color }}
                    animate={{
                        y: [0, -40, 10, -20, 0],
                        x: [0, 15, -10, 5, 0],
                        rotate: [0, 15, -8, 5, 0],
                        scale: [1, 1.15, 0.95, 1.05, 1],
                    }}
                    transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
                >
                    {p.shape}
                </motion.div>
            ))}
        </div>
    );
}
