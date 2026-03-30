"use client";

import { useEffect, useState } from "react";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import { MEASURE_LABELS } from "@/lib/body/japaneseBodyStats";

interface HistoryEntry {
    measurements: Record<string, unknown>;
    measured_at: string;
}

/** 表示する主要計測フィールド（最大6つ） */
const DISPLAY_KEYS = [
    "chest_circ", "waist_circ", "hip_circ",
    "shoulder_breadth", "inseam", "sleeve_length",
] as const;

function formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function Sparkline({
    data,
    label,
    unit = "cm",
}: {
    data: { value: number; date: string }[];
    label: string;
    unit?: string;
}) {
    if (data.length < 1) return null;

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const latest = values[values.length - 1];
    const first = values[0];
    const diff = latest - first;

    const w = 120;
    const h = 32;
    const pad = 2;

    const points = data
        .map((d, i) => {
            const x = pad + ((w - pad * 2) * i) / Math.max(data.length - 1, 1);
            const y = h - pad - ((d.value - min) / range) * (h - pad * 2);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <div className="flex items-center gap-3" aria-label={`${label}: ${latest}${unit}`}>
            <div className="w-20 text-xs text-slate-500 truncate">{label}</div>
            <svg width={w} height={h} className="shrink-0">
                <polyline
                    points={points}
                    fill="none"
                    stroke="rgba(139,92,246,0.6)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* 最新値のドット */}
                {data.length > 0 && (
                    <circle
                        cx={pad + ((w - pad * 2) * (data.length - 1)) / Math.max(data.length - 1, 1)}
                        cy={h - pad - ((latest - min) / range) * (h - pad * 2)}
                        r={3}
                        fill="#8b5cf6"
                    />
                )}
            </svg>
            <div className="text-right">
                <div className="text-sm font-semibold text-slate-800">{latest}{unit}</div>
                {data.length >= 2 && (
                    <div className={`text-[10px] font-medium ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-amber-600" : "text-slate-400"}`}>
                        {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MeasurementHistoryTimeline() {
    const [history, setHistory] = useState<HistoryEntry[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/body-color/profile?history=true", { cache: "no-store" });
                const json = await res.json();
                setHistory(json?.measurement_history ?? []);
            } catch {
                setHistory([]);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <GlassCard className="p-5">
                <div className="animate-pulse space-y-3">
                    <div className="h-4 w-24 rounded bg-slate-200" />
                    <div className="h-20 rounded bg-slate-100" />
                </div>
            </GlassCard>
        );
    }

    if (!history || history.length < 2) {
        return (
            <GlassCard className="p-5">
                <div className="text-sm font-bold text-slate-700">計測履歴</div>
                <div className="mt-2 text-sm text-slate-500">
                    2回目以降の計測で変化を確認できます。定期的に計測して体型の変化をトラッキングしましょう。
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard className="p-5">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-700">計測履歴</div>
                <GlassBadge variant="info">{history.length}回の記録</GlassBadge>
            </div>

            <div className="mt-4 space-y-3">
                {DISPLAY_KEYS.map((key) => {
                    const data = history
                        .map((entry) => {
                            const raw = entry.measurements?.[key];
                            const value = typeof raw === "number" ? raw : Number(raw);
                            return Number.isFinite(value) && value > 0
                                ? { value, date: formatDate(entry.measured_at) }
                                : null;
                        })
                        .filter(Boolean) as { value: number; date: string }[];

                    if (data.length < 1) return null;

                    return (
                        <Sparkline
                            key={key}
                            data={data}
                            label={MEASURE_LABELS[key] ?? key}
                        />
                    );
                })}
            </div>

            {/* タイムライン */}
            <div className="mt-4 flex items-center gap-1 overflow-x-auto text-[10px] text-slate-400">
                {history.map((entry, i) => (
                    <div key={i} className="flex flex-col items-center">
                        <div className={`h-1.5 w-1.5 rounded-full ${i === history.length - 1 ? "bg-violet-500" : "bg-slate-300"}`} />
                        <span className="mt-0.5">{formatDate(entry.measured_at)}</span>
                    </div>
                ))}
                <GlassBadge variant="gradient" size="sm" className="ml-1">最新</GlassBadge>
            </div>
        </GlassCard>
    );
}
