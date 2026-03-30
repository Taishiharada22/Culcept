/**
 * Observation Log -- 「なぜこの服？」
 *
 * 1-tap outfit observation logger.
 * Captures WHY a user chose their outfit today:
 * trigger, context, energy, satisfaction, and optional notes.
 */

import { safeLSSet } from "@/lib/safeLocalStorage";

/* ── Types ── */

export interface ObservationEntry {
    id: string;
    date: string; // YYYY-MM-DD
    timestamp: number;
    itemIds: string[];
    trigger: string;
    freeNote?: string;
    mood: string;
    context: string;
    energy: number; // 1-5
    satisfaction: number; // 1-5
}

export interface ObservationInsight {
    label: string;
    description: string;
    type: "trigger" | "context" | "satisfaction" | "pattern";
    confidence: number; // 0-1
}

export interface TriggerDistribution {
    trigger: string;
    label: string;
    count: number;
    percentage: number;
}

export interface SatisfactionTrend {
    date: string;
    avg: number;
}

export type TriggerOption = {
    id: string;
    label: string;
    icon: string;
};

export type ContextOption = {
    id: string;
    label: string;
};

/* ── Constants ── */

export const STORAGE_KEY_OBSERVATION = "culcept_observation_log_v1";

export const TRIGGER_OPTIONS: TriggerOption[] = [
    { id: "comfort", label: "安心感", icon: "\u{1F6E1}\uFE0F" },
    { id: "impress", label: "印象づけたい", icon: "\u2728" },
    { id: "mood-match", label: "気分に合う", icon: "\u{1F3AF}" },
    { id: "habit", label: "いつもの", icon: "\u{1F504}" },
    { id: "weather", label: "天気対応", icon: "\u{1F324}\uFE0F" },
    { id: "experiment", label: "冒険", icon: "\u{1F9EA}" },
    { id: "social", label: "相手に合わせた", icon: "\u{1F465}" },
    { id: "minimal-effort", label: "楽したい", icon: "\u{1F60C}" },
    { id: "special", label: "特別な日", icon: "\u{1F4AB}" },
    { id: "no-reason", label: "理由なし", icon: "\u2753" },
];

export const CONTEXT_OPTIONS: ContextOption[] = [
    { id: "work", label: "仕事" },
    { id: "casual", label: "カジュアル" },
    { id: "date", label: "デート" },
    { id: "friends", label: "友人と" },
    { id: "home", label: "自宅" },
    { id: "event", label: "イベント" },
    { id: "travel", label: "旅行" },
];

/* ── Helpers ── */

function loadEntries(): ObservationEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY_OBSERVATION);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function persistEntries(entries: ObservationEntry[]): void {
    if (typeof window === "undefined") return;
    safeLSSet(STORAGE_KEY_OBSERVATION, JSON.stringify(entries));
}

function uid(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfWeekLabel(dateStr: string): string {
    const labels = ["日", "月", "火", "水", "木", "金", "土"];
    const d = new Date(dateStr);
    return labels[d.getDay()] ?? "";
}

/* ── Core functions ── */

/**
 * Save an observation entry.
 */
export function saveObservation(
    entry: Omit<ObservationEntry, "id" | "date" | "timestamp">,
): ObservationEntry {
    const full: ObservationEntry = {
        ...entry,
        id: uid(),
        date: todayKey(),
        timestamp: Date.now(),
    };
    const entries = loadEntries();
    entries.push(full);
    // Keep last 180 entries max
    entries.sort((a, b) => b.timestamp - a.timestamp);
    persistEntries(entries.slice(0, 180));
    return full;
}

/**
 * Get observation entries, optionally limited to N days.
 */
export function getObservations(days?: number): ObservationEntry[] {
    const entries = loadEntries();
    if (!days) return entries;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return entries.filter((e) => e.date >= cutoffStr);
}

/**
 * Get today's observation count.
 */
export function getTodayObservationCount(): number {
    const key = todayKey();
    return loadEntries().filter((e) => e.date === key).length;
}

/**
 * Get trigger distribution from entries.
 */
export function getTriggerDistribution(entries: ObservationEntry[]): TriggerDistribution[] {
    if (entries.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const entry of entries) {
        counts[entry.trigger] = (counts[entry.trigger] ?? 0) + 1;
    }

    const total = entries.length;
    const triggerLabelMap = new Map(TRIGGER_OPTIONS.map((t) => [t.id, t.label]));

    return Object.entries(counts)
        .map(([trigger, count]) => ({
            trigger,
            label: triggerLabelMap.get(trigger) ?? trigger,
            count,
            percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Get satisfaction trend over time (grouped by date).
 */
export function getSatisfactionTrend(entries: ObservationEntry[]): SatisfactionTrend[] {
    if (entries.length === 0) return [];

    const grouped: Record<string, number[]> = {};
    for (const entry of entries) {
        if (!grouped[entry.date]) grouped[entry.date] = [];
        grouped[entry.date].push(entry.satisfaction);
    }

    return Object.entries(grouped)
        .map(([date, scores]) => ({
            date,
            avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Analyze observation patterns and produce insights.
 */
export function analyzeObservationPatterns(entries: ObservationEntry[]): ObservationInsight[] {
    if (entries.length < 5) return [];

    const insights: ObservationInsight[] = [];

    // Trigger frequency analysis
    const triggerDist = getTriggerDistribution(entries);
    if (triggerDist.length > 0) {
        const top = triggerDist[0];
        if (top.percentage >= 30) {
            insights.push({
                label: "最も多い選択理由",
                description: `「${top.label}」が全体の${top.percentage}%を占めています`,
                type: "trigger",
                confidence: top.percentage / 100,
            });
        }
    }

    // Day-of-week trigger patterns
    const dowTriggers: Record<string, Record<string, number>> = {};
    for (const entry of entries) {
        const dow = dayOfWeekLabel(entry.date);
        if (!dowTriggers[dow]) dowTriggers[dow] = {};
        dowTriggers[dow][entry.trigger] = (dowTriggers[dow][entry.trigger] ?? 0) + 1;
    }

    const triggerLabelMap = new Map(TRIGGER_OPTIONS.map((t) => [t.id, t.label]));

    for (const [dow, triggers] of Object.entries(dowTriggers)) {
        const sorted = Object.entries(triggers).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
            const total = Object.values(triggers).reduce((a, b) => a + b, 0);
            const [topTrigger, topCount] = sorted[0];
            const ratio = topCount / total;
            if (ratio >= 0.6 && total >= 3) {
                const label = triggerLabelMap.get(topTrigger) ?? topTrigger;
                insights.push({
                    label: `${dow}曜日のパターン`,
                    description: `${dow}曜日は「${label}」が${Math.round(ratio * 100)}%`,
                    type: "pattern",
                    confidence: ratio,
                });
            }
        }
    }

    // Context vs satisfaction correlation
    const contextSatisfaction: Record<string, number[]> = {};
    for (const entry of entries) {
        if (!contextSatisfaction[entry.context]) contextSatisfaction[entry.context] = [];
        contextSatisfaction[entry.context].push(entry.satisfaction);
    }

    const contextLabelMap = new Map(CONTEXT_OPTIONS.map((c) => [c.id, c.label]));

    let bestContext = "";
    let bestAvg = 0;
    for (const [ctx, scores] of Object.entries(contextSatisfaction)) {
        if (scores.length < 2) continue;
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg > bestAvg) {
            bestAvg = avg;
            bestContext = ctx;
        }
    }

    if (bestContext && bestAvg >= 3.5) {
        const label = contextLabelMap.get(bestContext) ?? bestContext;
        insights.push({
            label: "満足度が高いシーン",
            description: `「${label}」の日は満足度が平均${bestAvg.toFixed(1)}と高い`,
            type: "satisfaction",
            confidence: bestAvg / 5,
        });
    }

    // Energy vs trigger
    const energyByTrigger: Record<string, number[]> = {};
    for (const entry of entries) {
        if (!energyByTrigger[entry.trigger]) energyByTrigger[entry.trigger] = [];
        energyByTrigger[entry.trigger].push(entry.energy);
    }

    for (const [trigger, energies] of Object.entries(energyByTrigger)) {
        if (energies.length < 3) continue;
        const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
        const label = triggerLabelMap.get(trigger) ?? trigger;
        if (avgEnergy >= 4) {
            insights.push({
                label: "エネルギーが高い日の選択",
                description: `元気な日は「${label}」を選ぶ傾向`,
                type: "pattern",
                confidence: avgEnergy / 5,
            });
            break; // Only show one
        }
        if (avgEnergy <= 2) {
            insights.push({
                label: "省エネモードの選択",
                description: `エネルギーが低い日は「${label}」に頼りがち`,
                type: "pattern",
                confidence: 1 - avgEnergy / 5,
            });
            break;
        }
    }

    // Satisfaction trend
    const trend = getSatisfactionTrend(entries);
    if (trend.length >= 7) {
        const recentAvg =
            trend.slice(-5).reduce((s, t) => s + t.avg, 0) / Math.min(5, trend.length);
        const olderAvg =
            trend.slice(0, -5).reduce((s, t) => s + t.avg, 0) /
            Math.max(1, trend.length - 5);
        if (recentAvg > olderAvg + 0.3) {
            insights.push({
                label: "満足度の変化",
                description: "最近の満足度が上昇傾向です。自分に合うスタイルが見えてきているかも",
                type: "satisfaction",
                confidence: Math.min(1, (recentAvg - olderAvg) / 2),
            });
        } else if (recentAvg < olderAvg - 0.3) {
            insights.push({
                label: "満足度の変化",
                description: "最近の満足度がやや低下。新しいアプローチを試してみては？",
                type: "satisfaction",
                confidence: Math.min(1, (olderAvg - recentAvg) / 2),
            });
        }
    }

    return insights.slice(0, 6);
}

/**
 * Get overall observation stats.
 */
export function getObservationStats(entries: ObservationEntry[]) {
    if (entries.length === 0)
        return { totalEntries: 0, avgSatisfaction: 0, avgEnergy: 0, topTrigger: null as string | null };

    const avgSatisfaction =
        Math.round(
            (entries.reduce((s, e) => s + e.satisfaction, 0) / entries.length) * 10,
        ) / 10;
    const avgEnergy =
        Math.round((entries.reduce((s, e) => s + e.energy, 0) / entries.length) * 10) /
        10;

    const triggerDist = getTriggerDistribution(entries);
    const topTrigger = triggerDist.length > 0 ? triggerDist[0].label : null;

    return {
        totalEntries: entries.length,
        avgSatisfaction,
        avgEnergy,
        topTrigger,
    };
}
