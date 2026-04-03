/**
 * Today's Mirror -- 毎日の鏡
 *
 * Daily mood-to-style prediction engine.
 * Morning: mood -> predicted style direction.
 * Evening: validate what was actually worn.
 */

import type {
    SelectedStyleLane,
    StyleLaneCode,
    WardrobeItem,
} from "./types";
import { safeLSSet } from "@/lib/safeLocalStorage";

/* ── Types ── */

export interface StylePrediction {
    suggestedLanes: StyleLaneCode[];
    suggestedColors: string[];
    confidence: number;
    reason: string;
}

export interface ActualWear {
    selectedItems: string[];
    feltMood: string;
    surpriseElement?: string;
}

export interface MoodEntry {
    date: string; // YYYY-MM-DD
    morningMood: string;
    predictedStyle?: StylePrediction;
    eveningActual?: ActualWear;
    predictionAccuracy?: number; // 0-1
}

export interface MoodPattern {
    label: string;
    description: string;
    confidence: number;
}

export interface StreakInfo {
    currentStreak: number;
    longestStreak: number;
    totalDays: number;
}

export type MoodOption = {
    id: string;
    label: string;
    emoji: string;
};

/* ── Constants ── */

export const STORAGE_KEY_MIRROR = "culcept_todays_mirror_v1";

export const MOOD_OPTIONS: MoodOption[] = [
    { id: "calm", label: "穏やか", emoji: "\u{1F30A}" },
    { id: "energetic", label: "エネルギッシュ", emoji: "\u26A1" },
    { id: "creative", label: "創造的", emoji: "\u2728" },
    { id: "minimal", label: "シンプルでいたい", emoji: "\u25CB" },
    { id: "bold", label: "攻めたい", emoji: "\u{1F525}" },
    { id: "soft", label: "やわらかく", emoji: "\u2601\uFE0F" },
    { id: "sharp", label: "シャープに", emoji: "\u25C7" },
    { id: "cozy", label: "心地よく", emoji: "\u{1F9F6}" },
];

const MOOD_LANE_AFFINITY: Record<string, StyleLaneCode[]> = {
    calm: ["minimal", "clean", "natural", "frenchcasual"],
    energetic: ["street", "sporty", "techwear", "americancasual"],
    creative: ["mode", "vintage", "street", "rock"],
    minimal: ["minimal", "clean", "koreanclean", "natural"],
    bold: ["mode", "luxury", "rock", "street"],
    soft: ["feminine", "natural", "frenchcasual", "resort"],
    sharp: ["smart-casual", "elegant", "trad", "mannish"],
    cozy: ["natural", "americancasual", "outdoor", "workwear"],
};

const MOOD_COLOR_AFFINITY: Record<string, string[]> = {
    calm: ["navy", "white", "beige", "lightblue"],
    energetic: ["red", "orange", "yellow", "blue"],
    creative: ["purple", "pink", "indigo", "lavender"],
    minimal: ["black", "white", "gray", "charcoal"],
    bold: ["black", "red", "burgundy", "white"],
    soft: ["pink", "cream", "lavender", "beige"],
    sharp: ["black", "navy", "charcoal", "white"],
    cozy: ["brown", "camel", "khaki", "olive"],
};

const MOOD_NARRATIVES: Record<string, string> = {
    calm: "今日は穏やかな空気をまとうのが合いそうです。ニュートラルカラーと自然な素材感で、心の落ち着きを表現して。",
    energetic: "エネルギーに満ちた日は、動きのあるスタイルが映えます。鮮やかな色使いやスポーティなアイテムで、その勢いを形に。",
    creative: "創造的な気分には、型を崩す遊びが効きます。普段選ばないアイテムや色に手を伸ばしてみると、新しい自分に出会えるかも。",
    minimal: "余計なものを削ぎ落としたい日。モノトーンやクリーンなシルエットで、静かな存在感を。",
    bold: "今日は攻めの日。強い色やシャープなシルエットで、自分のモードを周囲に示して。",
    soft: "やわらかく過ごしたい日は、淡い色合いとリラックスしたシルエットが味方です。",
    sharp: "シャープに決めたい気分。構築的なシルエットとダークトーンで、キレのある印象を。",
    cozy: "心地よさを最優先に。温かみのある色と素材で、自分を甘やかす一日を。",
};

/* ── Helpers ── */

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadEntries(): MoodEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY_MIRROR);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function saveEntries(entries: MoodEntry[]): void {
    if (typeof window === "undefined") return;
    safeLSSet(STORAGE_KEY_MIRROR, JSON.stringify(entries));
}

function dayOfWeekLabel(dateStr: string): string {
    const labels = ["日", "月", "火", "水", "木", "金", "土"];
    const d = new Date(dateStr);
    return labels[d.getDay()] ?? "";
}

/* ── Core functions ── */

/**
 * Predict style direction from mood, considering past correlations.
 */
export function predictStyleFromMood(
    mood: string,
    wardrobeItems: WardrobeItem[],
    styleSelections: SelectedStyleLane[],
    pastEntries: MoodEntry[],
): StylePrediction {
    // Base affinity
    const baseLanes = MOOD_LANE_AFFINITY[mood] ?? ["minimal", "clean"];
    const baseColors = MOOD_COLOR_AFFINITY[mood] ?? ["black", "white"];

    // Boost lanes that exist in user's style selections
    const userCoreLanes = new Set(styleSelections.map((s) => s.laneCode));
    const boostedLanes = baseLanes.filter((l) => userCoreLanes.has(l));
    const suggestedLanes = boostedLanes.length >= 2
        ? boostedLanes.slice(0, 3)
        : baseLanes.slice(0, 3);

    // Adjust colors based on wardrobe availability
    const wardrobeColors = new Set(wardrobeItems.map((i) => i.color));
    const availableColors = baseColors.filter((c) => wardrobeColors.has(c));
    const suggestedColors = availableColors.length >= 2
        ? availableColors.slice(0, 4)
        : baseColors.slice(0, 4);

    // Calculate confidence based on past data
    const pastSameMood = pastEntries.filter((e) => e.morningMood === mood);
    let confidence = 0.5;
    if (pastSameMood.length >= 3) {
        const accuracies = pastSameMood
            .filter((e) => e.predictionAccuracy != null)
            .map((e) => e.predictionAccuracy!);
        if (accuracies.length > 0) {
            confidence = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
        }
    }
    // Boost confidence if user has relevant wardrobe items
    if (availableColors.length >= 2) confidence = Math.min(1, confidence + 0.1);

    const reason = MOOD_NARRATIVES[mood] ?? "今日の気分に合うスタイルを提案します。";

    return {
        suggestedLanes,
        suggestedColors,
        confidence: Math.round(confidence * 100) / 100,
        reason,
    };
}

/**
 * Validate prediction vs. actual wear, producing accuracy score.
 */
export function validatePrediction(
    prediction: StylePrediction,
    actualWear: ActualWear,
    wardrobeItems: WardrobeItem[],
): number {
    if (actualWear.selectedItems.length === 0) return 0;

    const itemMap = new Map(wardrobeItems.map((i) => [i.id, i]));
    const wornItems = actualWear.selectedItems
        .map((id) => itemMap.get(id))
        .filter(Boolean) as WardrobeItem[];

    if (wornItems.length === 0) return 0;

    // Color overlap
    const predictedColorSet = new Set(prediction.suggestedColors);
    const wornColors = wornItems.map((i) => i.color);
    const colorHits = wornColors.filter((c) => predictedColorSet.has(c)).length;
    const colorScore = wornColors.length > 0 ? colorHits / wornColors.length : 0;

    // Mood alignment (if the felt mood matches the morning mood)
    const moodScore = actualWear.feltMood === prediction.suggestedLanes[0] ? 1.0 : 0.3;

    // Weighted accuracy
    const accuracy = colorScore * 0.6 + moodScore * 0.4;
    return Math.round(accuracy * 100) / 100;
}

/**
 * Get mood history entries, optionally limited to N days.
 */
export function getMoodHistory(days?: number): MoodEntry[] {
    const entries = loadEntries();
    if (!days) return entries;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return entries.filter((e) => e.date >= cutoffStr);
}

/**
 * Save or update a mood entry.
 */
export function saveMoodEntry(entry: MoodEntry): void {
    const entries = loadEntries();
    const idx = entries.findIndex((e) => e.date === entry.date);
    if (idx >= 0) {
        entries[idx] = entry;
    } else {
        entries.push(entry);
    }
    // Keep last 90 days max
    entries.sort((a, b) => b.date.localeCompare(a.date));
    saveEntries(entries.slice(0, 90));
}

/**
 * Get today's entry if it exists.
 */
export function getTodayEntry(): MoodEntry | null {
    const key = todayKey();
    const entries = loadEntries();
    return entries.find((e) => e.date === key) ?? null;
}

/**
 * Detect mood patterns from history.
 */
export function getMoodPatterns(entries: MoodEntry[]): MoodPattern[] {
    if (entries.length < 5) return [];

    const patterns: MoodPattern[] = [];

    // Day-of-week patterns
    const dayBuckets: Record<string, Record<string, number>> = {};
    for (const entry of entries) {
        const dow = dayOfWeekLabel(entry.date);
        if (!dayBuckets[dow]) dayBuckets[dow] = {};
        dayBuckets[dow][entry.morningMood] = (dayBuckets[dow][entry.morningMood] ?? 0) + 1;
    }

    for (const [dow, moods] of Object.entries(dayBuckets)) {
        const sorted = Object.entries(moods).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
            const [topMood, topCount] = sorted[0];
            const total = Object.values(moods).reduce((a, b) => a + b, 0);
            const ratio = topCount / total;
            if (ratio >= 0.5 && total >= 3) {
                const moodLabel = MOOD_OPTIONS.find((m) => m.id === topMood)?.label ?? topMood;
                patterns.push({
                    label: `${dow}曜日の傾向`,
                    description: `${dow}曜日は「${moodLabel}」を選びやすい (${Math.round(ratio * 100)}%)`,
                    confidence: ratio,
                });
            }
        }
    }

    // Most frequent mood
    const moodCounts: Record<string, number> = {};
    for (const entry of entries) {
        moodCounts[entry.morningMood] = (moodCounts[entry.morningMood] ?? 0) + 1;
    }
    const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
    if (sortedMoods.length >= 2) {
        const topLabel = MOOD_OPTIONS.find((m) => m.id === sortedMoods[0][0])?.label ?? sortedMoods[0][0];
        const topPct = Math.round((sortedMoods[0][1] / entries.length) * 100);
        patterns.push({
            label: "全体の傾向",
            description: `最も多い気分は「${topLabel}」(${topPct}%)`,
            confidence: sortedMoods[0][1] / entries.length,
        });
    }

    // Prediction accuracy trend
    const withAccuracy = entries.filter((e) => e.predictionAccuracy != null);
    if (withAccuracy.length >= 3) {
        const avgAccuracy = withAccuracy.reduce((s, e) => s + (e.predictionAccuracy ?? 0), 0) / withAccuracy.length;
        patterns.push({
            label: "予測精度",
            description: `これまでの予測精度は平均 ${Math.round(avgAccuracy * 100)}%`,
            confidence: avgAccuracy,
        });
    }

    return patterns;
}

/**
 * Get streak information (consecutive days with mood entries).
 */
export function getStreakInfo(): StreakInfo {
    const entries = loadEntries();
    if (entries.length === 0) return { currentStreak: 0, longestStreak: 0, totalDays: 0 };

    const dates = new Set(entries.map((e) => e.date));
    const totalDays = dates.size;

    // Calculate current streak from today
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dates.has(key)) {
            currentStreak++;
        } else {
            break;
        }
    }

    // Calculate longest streak
    const sortedDates = [...dates].sort();
    let longestStreak = 0;
    let tempStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diffMs = curr.getTime() - prev.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            tempStreak++;
        } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return { currentStreak, longestStreak, totalDays };
}

/**
 * Get the current time phase.
 */
export function getTimePhase(): "morning" | "between" | "evening" {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour >= 18) return "evening";
    return "between";
}

/**
 * Get weekly mood dots for mini-chart (last 7 days).
 */
export function getWeeklyMoodDots(): Array<{ date: string; mood: string | null; dayLabel: string }> {
    const entries = loadEntries();
    const dateMap = new Map(entries.map((e) => [e.date, e.morningMood]));
    const dots: Array<{ date: string; mood: string | null; dayLabel: string }> = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dowLabels = ["日", "月", "火", "水", "木", "金", "土"];
        dots.push({
            date: key,
            mood: dateMap.get(key) ?? null,
            dayLabel: dowLabels[d.getDay()],
        });
    }

    return dots;
}

/**
 * Get mood color for display.
 */
export const MOOD_COLORS: Record<string, string> = {
    calm: "#3b82f6",
    energetic: "#f59e0b",
    creative: "#8b5cf6",
    minimal: "#6b7280",
    bold: "#ef4444",
    soft: "#ec4899",
    sharp: "#1e293b",
    cozy: "#92400e",
};
