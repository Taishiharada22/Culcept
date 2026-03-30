"use client";

import { type ReactNode, memo, useCallback, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { GlassCard, FadeInView, GlassBadge } from "@/components/ui/glassmorphism-design";
import { cx, EASE_OUT_EXPO, TONE_CLASSES, labelTag, type ToneKey } from "../_lib/presenceConstants";

/* ─────────────────────── FadeSection ─────────────────────── */

export function FadeSection({
    children,
    delay = 0,
    className,
}: {
    children: ReactNode;
    delay?: number;
    className?: string;
}) {
    return (
        <FadeInView delay={delay} className={className}>
            {children}
        </FadeInView>
    );
}

/* ─────────────────────── PresenceCard ─────────────────────── */

export function PresenceCard({
    children,
    className,
    padding = "md",
    "data-testid": testId,
}: {
    children: ReactNode;
    className?: string;
    padding?: "sm" | "md" | "lg";
    "data-testid"?: string;
}) {
    return (
        <GlassCard variant="elevated" hoverEffect={false} padding={padding} className={className} data-testid={testId}>
            {children}
        </GlassCard>
    );
}

/* ─────────────────────── SectionHeading ─────────────────────── */

export function SectionHeading({
    title,
    subtitle,
    gradient,
}: {
    title: string;
    subtitle?: string;
    gradient?: boolean;
}) {
    return (
        <div className="mb-5">
            <h2
                className={cx(
                    "text-xl font-bold tracking-[-0.02em]",
                    gradient
                        ? "bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 bg-clip-text text-transparent"
                        : "text-slate-950 dark:text-white"
                )}
            >
                {title}
            </h2>
            {subtitle ? (
                <p className="mt-1 text-sm leading-7 text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
        </div>
    );
}

/* ─────────────────────── PresenceChip ─────────────────────── */

export function PresenceChip({ children }: { children: ReactNode }) {
    return (
        <GlassBadge variant="default" size="md">
            {children}
        </GlassBadge>
    );
}

/* ─────────────────────── TonePanel ─────────────────────── */

export const TonePanel = memo(function TonePanel({
    title,
    body,
    tone,
    rightMeta,
    "data-testid": testId,
}: {
    title: string;
    body: string;
    tone: ToneKey;
    rightMeta?: ReactNode;
    "data-testid"?: string;
}) {
    const toneStyle = TONE_CLASSES[tone];
    return (
        <div className={cx("rounded-2xl border p-4", toneStyle.light, toneStyle.dark)} data-testid={testId}>
            <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
                {rightMeta}
            </div>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-300">{body}</p>
        </div>
    );
});

/* ─────────────────────── GapRing ─────────────────────── */

export function GapRing({ percent }: { percent: number }) {
    const size = 100;
    const strokeWidth = 8;
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (percent / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center">
            <svg width={size} height={size} className="-rotate-90">
                <defs>
                    <linearGradient id="gap-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} className="dark:stroke-slate-700" />
                <motion.circle
                    cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke="url(#gap-ring-grad)" strokeWidth={strokeWidth} strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.4, delay: 0.4, ease: EASE_OUT_EXPO }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tracking-tight text-amber-600">{percent}%</span>
                <span className="text-xs font-bold text-slate-400">GAP</span>
            </div>
        </div>
    );
}

/* ─────────────────────── OneWordCard ─────────────────────── */

export const OneWordCard = memo(function OneWordCard({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* fallback */ }
    }, [text]);

    return (
        <motion.div
            className="relative mt-6 overflow-hidden rounded-2xl p-[2px]"
            animate={{
                boxShadow: [
                    "0 0 24px rgba(139,92,246,0.12), 0 0 60px rgba(236,72,153,0.06)",
                    "0 0 36px rgba(139,92,246,0.22), 0 0 80px rgba(236,72,153,0.12)",
                    "0 0 24px rgba(139,92,246,0.12), 0 0 60px rgba(236,72,153,0.06)",
                ],
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
            <motion.div
                className="absolute inset-0 bg-gradient-to-r from-violet-400 via-fuchsia-400 via-amber-300 to-violet-400"
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                style={{ backgroundSize: "200% 100%" }}
            />
            <div className="relative rounded-2xl bg-gradient-to-br from-white via-white to-violet-50/60 p-6 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-base">✧</span>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">
                        誤解をほどく一言
                    </span>
                </div>
                <p className="text-base font-bold leading-[1.8] tracking-[-0.01em] text-slate-800 sm:text-xl dark:text-slate-100">
                    「{text}」
                </p>
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-slate-400">あなたの印象を正しく伝えたいとき、この一言を</p>
                    <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className={cx(
                            "flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all",
                            copied
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                                : "bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:bg-slate-800 dark:text-slate-400"
                        )}
                    >
                        {copied ? <><span>✓</span><span>コピー済み</span></> : <><span>📋</span><span>コピー</span></>}
                    </button>
                </div>
            </div>
        </motion.div>
    );
});

/* ─────────────────────── RadarChart ─────────────────────── */

export const RadarChart = memo(function RadarChart({
    items,
}: {
    items: { axis: string; score: number }[];
}) {
    const size = 320;
    const center = size / 2;
    const radius = 108;
    const angleStep = (Math.PI * 2) / items.length;

    const pointAt = (index: number, value: number) => {
        const angle = index * angleStep - Math.PI / 2;
        const scaledRadius = (value / 100) * radius;
        return { x: center + Math.cos(angle) * scaledRadius, y: center + Math.sin(angle) * scaledRadius };
    };

    const polygon = items.map((item, i) => { const p = pointAt(i, item.score); return `${p.x},${p.y}`; }).join(" ");

    return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-center" data-testid="radar-chart">
            <div className="mx-auto w-full max-w-[360px]">
                <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full">
                    <defs>
                        <linearGradient id="presence-radar-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.24" />
                            <stop offset="100%" stopColor="#f472b6" stopOpacity="0.18" />
                        </linearGradient>
                        <linearGradient id="presence-radar-line" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#7c3aed" />
                            <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                    </defs>
                    {[25, 50, 75, 100].map((level) => {
                        const pts = items.map((_, i) => { const p = pointAt(i, level); return `${p.x},${p.y}`; }).join(" ");
                        return <polygon key={level} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="1" className="dark:stroke-slate-700" />;
                    })}
                    {items.map((_, i) => {
                        const p = pointAt(i, 100);
                        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#d8dee9" strokeWidth="1" className="dark:stroke-slate-700" />;
                    })}
                    <motion.polygon
                        points={polygon} fill="url(#presence-radar-fill)" stroke="url(#presence-radar-line)" strokeWidth="3"
                        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        style={{ transformOrigin: `${center}px ${center}px` }}
                    />
                    {items.map((item, i) => {
                        const p = pointAt(i, item.score);
                        const label = pointAt(i, 122);
                        return (
                            <g key={item.axis}>
                                <circle cx={p.x} cy={p.y} r="5.5" fill="#7c3aed" stroke="#fff" strokeWidth="2.5" />
                                <text x={label.x} y={label.y - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#475569" className="dark:fill-slate-400">{item.axis}</text>
                                <text x={label.x} y={label.y + 11} textAnchor="middle" fontSize="13" fontWeight="800" fill="#7c3aed">{item.score}</text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.axis} className="rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/85">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.axis}</span>
                            <span className="text-base font-bold text-violet-600">{item.score}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-400" style={{ width: `${item.score}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

/* ─────────────────────── StrengthRow ─────────────────────── */

export const StrengthRow = memo(function StrengthRow({
    item,
    index,
}: {
    item: { label: string; score: number; grade: string; description: string };
    index: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-30px" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, x: -12 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.06 * index, ease: EASE_OUT_EXPO }}
            className="rounded-2xl border border-slate-200/90 bg-white/92 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90"
            data-testid={`strength-row-${item.label}`}
        >
            <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.label}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{item.score}</div>
                </div>
                <div className={cx(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    item.grade === "S" ? "bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-700"
                        : item.grade === "A" ? "bg-indigo-100 text-indigo-700"
                        : item.grade === "B" ? "bg-sky-100 text-sky-700"
                        : item.grade === "C" ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                )}>
                    {item.grade}
                </div>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <motion.div
                    initial={{ width: 0 }}
                    animate={isInView ? { width: `${item.score}%` } : {}}
                    transition={{ duration: 0.8, delay: 0.1 * index, ease: EASE_OUT_EXPO }}
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-400"
                />
            </div>
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-400">{item.description}</p>
        </motion.div>
    );
});

/* ─────────────────────── EvidenceAccordion ─────────────────────── */

export function EvidenceAccordion({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    return (
        <details
            open={defaultOpen}
            className="group rounded-2xl border border-slate-200 bg-slate-50/90 p-4 open:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:open:bg-slate-800"
        >
            <summary className="cursor-pointer list-none text-sm font-bold text-slate-900 dark:text-slate-100">
                <div className="flex items-center justify-between gap-4">
                    <span>{title}</span>
                    <span className="text-xs font-semibold text-slate-400 transition group-open:rotate-90">▸</span>
                </div>
            </summary>
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">{children}</div>
        </details>
    );
}

/* ─────────────────────── TagList ─────────────────────── */

export function TagList({ items }: { items: string[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((item) => (
                <span
                    key={item}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                    {labelTag(item)}
                </span>
            ))}
        </div>
    );
}

/* ─────────────────────── EmptyStateCard ─────────────────────── */

export function EmptyStateCard({
    emoji,
    title,
    description,
    ctaHref,
    ctaLabel,
    ctaColor = "violet",
}: {
    emoji: string;
    title: string;
    description: string;
    ctaHref: string;
    ctaLabel: string;
    ctaColor?: "violet" | "emerald";
}) {
    const colors = {
        violet: "bg-violet-50 dark:bg-violet-950",
        emerald: "bg-emerald-50 dark:bg-emerald-950",
    };
    const ctaColors = {
        violet: "from-violet-600 to-fuchsia-500 shadow-[0_14px_30px_rgba(139,92,246,0.25)]",
        emerald: "from-emerald-500 to-teal-500 shadow-[0_14px_30px_rgba(16,185,129,0.25)]",
    };

    return (
        <PresenceCard padding="lg" className="text-center">
            <div className={cx("mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl", colors[ctaColor])}>
                {emoji}
            </div>
            <p className="mt-4 text-xl font-bold text-slate-950 dark:text-white">{title}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            <a
                href={ctaHref}
                className={cx("mt-4 inline-block rounded-full bg-gradient-to-r px-5 py-2 text-sm font-bold text-white no-underline", ctaColors[ctaColor])}
            >
                {ctaLabel}
            </a>
        </PresenceCard>
    );
}

/* ─────────────────────── TabSkeleton ─────────────────────── */

export function TabSkeleton() {
    return (
        <div className="space-y-6" role="status" aria-label="タブコンテンツを読み込み中">
            {/* Card-like skeleton */}
            <div className="animate-pulse rounded-3xl border border-slate-200/40 bg-white/60 p-6 dark:border-slate-700/30 dark:bg-slate-800/40">
                <div className="h-5 w-32 rounded-lg bg-slate-200/80 dark:bg-slate-700" />
                <div className="mt-2 h-3 w-48 rounded bg-slate-200/60 dark:bg-slate-700/60" />
                <div className="mt-6 space-y-3">
                    <div className="h-20 rounded-2xl bg-slate-200/50 dark:bg-slate-700/40" />
                    <div className="h-20 rounded-2xl bg-slate-200/50 dark:bg-slate-700/40" />
                </div>
            </div>
            {/* Second card skeleton */}
            <div className="animate-pulse rounded-3xl border border-slate-200/40 bg-white/60 p-6 dark:border-slate-700/30 dark:bg-slate-800/40">
                <div className="h-5 w-24 rounded-lg bg-slate-200/80 dark:bg-slate-700" />
                <div className="mt-4 h-32 rounded-2xl bg-slate-200/50 dark:bg-slate-700/40" />
            </div>
        </div>
    );
}
