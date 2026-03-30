/**
 * Weather-Connected Outfit Suggestion -- 天気連動の提案
 *
 * Fetches weather data (Open-Meteo, no API key) and produces
 * outfit suggestions adapted to current conditions.
 */

import type { WardrobeItem } from "./types";
import { safeLSSet } from "@/lib/safeLocalStorage";

/* ── Types ── */

export type WeatherCondition =
    | "sunny"
    | "cloudy"
    | "rainy"
    | "snowy"
    | "windy"
    | "hot"
    | "cold";

export interface WeatherInfo {
    temp: number;
    condition: WeatherCondition;
    humidity: number;
    description: string;
}

export interface WeatherOutfitSuggestion {
    weather: WeatherInfo;
    suggestedItems: WardrobeItem[];
    layeringAdvice: string;
    materialAdvice: string;
    colorMoodAdvice: string;
    practicalNotes: string[];
}

export type TemperatureCategory =
    | "extreme_cold"
    | "cold"
    | "cool"
    | "mild"
    | "warm"
    | "hot"
    | "extreme_hot";

export interface TemperatureCategoryInfo {
    category: TemperatureCategory;
    label: string;
    thicknessLevel: number; // 1-5
    description: string;
}

export interface WeatherFeedback {
    date: string;
    liked: boolean;
}

/* ── Constants ── */

const WEATHER_CACHE_KEY = "culcept_weather_cache_v1";
const WEATHER_FEEDBACK_KEY = "culcept_weather_feedback_v1";
const WEATHER_BACKOFF_KEY = "culcept_weather_backoff_v1";
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
const STALE_CACHE_MAX_MS = 24 * 60 * 60 * 1000; // 24 hours for stale fallback

// Open-Meteo WMO weather code mapping
const WMO_CONDITION: Record<number, WeatherCondition> = {
    0: "sunny",
    1: "sunny",
    2: "cloudy",
    3: "cloudy",
    45: "cloudy",
    48: "cloudy",
    51: "rainy",
    53: "rainy",
    55: "rainy",
    56: "rainy",
    57: "rainy",
    61: "rainy",
    63: "rainy",
    65: "rainy",
    66: "rainy",
    67: "rainy",
    71: "snowy",
    73: "snowy",
    75: "snowy",
    77: "snowy",
    80: "rainy",
    81: "rainy",
    82: "rainy",
    85: "snowy",
    86: "snowy",
    95: "rainy",
    96: "rainy",
    99: "rainy",
};

const CONDITION_LABELS: Record<WeatherCondition, string> = {
    sunny: "晴れ",
    cloudy: "曇り",
    rainy: "雨",
    snowy: "雪",
    windy: "風が強い",
    hot: "暑い",
    cold: "寒い",
};

/* ── Temperature categories ── */

export function getTemperatureCategory(temp: number): TemperatureCategoryInfo {
    if (temp <= -5)
        return {
            category: "extreme_cold",
            label: "極寒",
            thicknessLevel: 5,
            description: "厳重な防寒が必要",
        };
    if (temp <= 5)
        return {
            category: "cold",
            label: "寒い",
            thicknessLevel: 4,
            description: "しっかり重ね着を",
        };
    if (temp <= 12)
        return {
            category: "cool",
            label: "涼しい",
            thicknessLevel: 3,
            description: "羽織りものがあると安心",
        };
    if (temp <= 20)
        return {
            category: "mild",
            label: "快適",
            thicknessLevel: 2,
            description: "過ごしやすい気温",
        };
    if (temp <= 28)
        return {
            category: "warm",
            label: "暖かい",
            thicknessLevel: 1,
            description: "軽装でOK",
        };
    if (temp <= 33)
        return {
            category: "hot",
            label: "暑い",
            thicknessLevel: 1,
            description: "涼しい素材を選んで",
        };
    return {
        category: "extreme_hot",
        label: "猛暑",
        thicknessLevel: 1,
        description: "熱中症に注意、最小限の装い",
    };
}

/* ── Weather fetching ── */

interface CachedWeather {
    weather: WeatherInfo;
    fetchedAt: number;
}

function loadCachedWeather(allowStale = false): CachedWeather | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(WEATHER_CACHE_KEY);
        if (!raw) return null;
        const cached: CachedWeather = JSON.parse(raw);
        const age = Date.now() - cached.fetchedAt;
        if (age > (allowStale ? STALE_CACHE_MAX_MS : CACHE_DURATION_MS)) return null;
        return cached;
    } catch {
        return null;
    }
}

function saveCachedWeather(weather: WeatherInfo): void {
    if (typeof window === "undefined") return;
    const cached: CachedWeather = { weather, fetchedAt: Date.now() };
    safeLSSet(WEATHER_CACHE_KEY, JSON.stringify(cached));
}

/** Check if we are in a rate-limit backoff period. */
function isInBackoff(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const raw = localStorage.getItem(WEATHER_BACKOFF_KEY);
        if (!raw) return false;
        const until = JSON.parse(raw) as number;
        return Date.now() < until;
    } catch {
        return false;
    }
}

function setBackoff(durationMs: number = 5 * 60 * 1000): void {
    if (typeof window === "undefined") return;
    safeLSSet(
        WEATHER_BACKOFF_KEY,
        JSON.stringify(Date.now() + durationMs),
    );
}

/**
 * Result of a weather fetch attempt, including source metadata.
 */
export interface WeatherFetchResult {
    weather: WeatherInfo;
    source: "api" | "cache" | "stale_cache" | "manual" | "fallback";
}

/**
 * Build a WeatherInfo from manual user input (offline fallback).
 */
export function buildManualWeather(
    temp: number,
    condition: WeatherCondition,
): WeatherInfo {
    return {
        temp,
        condition,
        humidity: 50,
        description: `${temp}\u00B0C ${CONDITION_LABELS[condition]} (\u624B\u52D5\u5165\u529B)`,
    };
}

/**
 * Fetch current weather from Open-Meteo (no API key needed).
 * Falls back to Tokyo coordinates if geolocation unavailable.
 *
 * Strategy:
 * 1. Return fresh cache if available (< 1 hour)
 * 2. If in rate-limit backoff, return stale cache or null
 * 3. Attempt API fetch; on 429, set backoff and fall back to stale cache
 * 4. On any failure, return stale cache (< 24 hours) or null
 *
 * Returns null when no data is available at all (triggers manual input UI).
 */
export async function fetchWeather(lat?: number, lon?: number): Promise<WeatherFetchResult> {
    // 1. Fresh cache
    const cached = loadCachedWeather(false);
    if (cached) return { weather: cached.weather, source: "cache" };

    // 2. Backoff check
    if (isInBackoff()) {
        const stale = loadCachedWeather(true);
        if (stale) return { weather: stale.weather, source: "stale_cache" };
        // No cache at all -- caller should show manual input
        throw new WeatherOfflineError();
    }

    // 3. Determine coordinates
    let useLat = lat ?? 35.6762; // Tokyo default
    let useLon = lon ?? 139.6503;
    let geoFailed = false;

    if (lat == null && lon == null && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 5000,
                    maximumAge: 3600000,
                });
            });
            useLat = pos.coords.latitude;
            useLon = pos.coords.longitude;
        } catch {
            geoFailed = true;
            // Use Tokyo defaults
        }
    }

    // 4. API fetch
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${useLat}&longitude=${useLon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;
        const res = await fetch(url);

        // Rate limit -- backoff and use stale cache
        if (res.status === 429) {
            setBackoff(5 * 60 * 1000); // 5 minutes
            const stale = loadCachedWeather(true);
            if (stale) return { weather: stale.weather, source: "stale_cache" };
            throw new WeatherOfflineError();
        }

        if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
        const data = await res.json();

        const current = data.current;
        const temp = Math.round(current.temperature_2m);
        const humidity = current.relative_humidity_2m;
        const wmoCode = current.weather_code;
        const windSpeed = current.wind_speed_10m;

        let condition: WeatherCondition = WMO_CONDITION[wmoCode] ?? "cloudy";

        // Override with temperature extremes
        if (temp >= 33) condition = "hot";
        else if (temp <= -5) condition = "cold";
        // Override with wind
        if (windSpeed > 40 && condition !== "rainy" && condition !== "snowy") {
            condition = "windy";
        }

        const weather: WeatherInfo = {
            temp,
            condition,
            humidity,
            description: `${temp}\u00B0C ${CONDITION_LABELS[condition]}`,
        };

        saveCachedWeather(weather);
        return { weather, source: "api" };
    } catch (err) {
        if (err instanceof WeatherOfflineError) throw err;

        // Try stale cache before giving up
        const stale = loadCachedWeather(true);
        if (stale) return { weather: stale.weather, source: "stale_cache" };

        // Completely offline with no cache -- caller should show manual input
        if (geoFailed) {
            throw new WeatherOfflineError();
        }

        // Fallback - mild weather
        return {
            weather: {
                temp: 20,
                condition: "cloudy",
                humidity: 50,
                description: "20\u00B0C \u66C7\u308A (\u30C7\u30FC\u30BF\u53D6\u5F97\u5931\u6557)",
            },
            source: "fallback",
        };
    }
}

/**
 * Error thrown when weather data is completely unavailable.
 * UI should show manual temperature/condition selector.
 */
export class WeatherOfflineError extends Error {
    constructor() {
        super("Weather data unavailable");
        this.name = "WeatherOfflineError";
    }
}

/* ── Outfit suggestion engine ── */

const THICKNESS_LEVELS: Record<string, number> = {
    thin: 1,
    medium: 2,
    thick: 3,
};

const RAIN_AVOID_MATERIALS = new Set([
    "material.suede",
    "material.silk",
    "material.cashmere",
    "material.linen",
]);

const HOT_PREFER_MATERIALS = new Set([
    "material.linen",
    "material.cotton",
]);

const COLD_PREFER_MATERIALS = new Set([
    "material.wool",
    "material.cashmere",
    "material.fleece",
    "material.down",
]);

function scoreItemForWeather(item: WardrobeItem, weather: WeatherInfo): number {
    let score = 0.5;
    const tempCat = getTemperatureCategory(weather.temp);

    // Season fit
    if (item.season) {
        const isWarm = weather.temp >= 20;
        const seasonOk =
            item.season === "all" ||
            (isWarm && item.season === "ss") ||
            (!isWarm && item.season === "aw");
        score += seasonOk ? 0.2 : -0.3;
    }

    // Thickness fit
    if (item.thickness) {
        const itemThick = THICKNESS_LEVELS[item.thickness] ?? 2;
        const diff = Math.abs(itemThick - tempCat.thicknessLevel);
        score += diff === 0 ? 0.15 : diff === 1 ? 0.05 : -0.1;
    }

    // Material fit for conditions
    if (item.materialFamily) {
        for (const mat of item.materialFamily) {
            if (weather.condition === "rainy" && RAIN_AVOID_MATERIALS.has(mat)) {
                score -= 0.2;
            }
            if (weather.temp >= 28 && HOT_PREFER_MATERIALS.has(mat)) {
                score += 0.1;
            }
            if (weather.temp <= 10 && COLD_PREFER_MATERIALS.has(mat)) {
                score += 0.1;
            }
        }
    }

    // Water resistance for rain
    if (weather.condition === "rainy" && (item.attributes?.water === "repellent" || item.attributes?.water === "waterproof")) {
        score += 0.15;
    }

    return Math.max(0, Math.min(1, score));
}

/**
 * Suggest outfit items adapted to weather conditions.
 */
export function suggestOutfitForWeather(
    weather: WeatherInfo,
    wardrobe: WardrobeItem[],
): WeatherOutfitSuggestion {
    // Score and sort all items
    const scored = wardrobe.map((item) => ({
        item,
        score: scoreItemForWeather(item, weather),
    }));
    scored.sort((a, b) => b.score - a.score);

    // Pick best items by category
    const suggested: WardrobeItem[] = [];
    const pickedCategories = new Set<string>();

    const categoryPriority =
        weather.temp <= 12
            ? ["outerwear", "tops", "bottoms", "shoes", "accessories"]
            : ["tops", "bottoms", "shoes", "outerwear", "accessories"];

    for (const cat of categoryPriority) {
        const best = scored.find(
            (s) => s.item.category === cat && !pickedCategories.has(cat) && s.score > 0.3,
        );
        if (best) {
            suggested.push(best.item);
            pickedCategories.add(cat);
        }
    }

    // Generate advice
    const tempCat = getTemperatureCategory(weather.temp);
    const layeringAdvice = generateLayeringAdvice(weather, tempCat);
    const materialAdvice = generateMaterialAdvice(weather);
    const colorMoodAdvice = generateColorMoodAdvice(weather);
    const practicalNotes = generatePracticalNotes(weather);

    return {
        weather,
        suggestedItems: suggested,
        layeringAdvice,
        materialAdvice,
        colorMoodAdvice,
        practicalNotes,
    };
}

function generateLayeringAdvice(weather: WeatherInfo, tempCat: TemperatureCategoryInfo): string {
    switch (tempCat.category) {
        case "extreme_cold":
            return "インナー + ミドルレイヤー + 厚手アウターの3層構造が必須。首元・手首・足首の防寒も忘れずに。";
        case "cold":
            return "薄手のインナーに中厚のミドルレイヤー、アウターで調整。室内外の温度差に対応できる重ね着を。";
        case "cool":
            return "カーディガンやライトジャケットなど、脱ぎ着しやすい羽織りがあると安心。";
        case "mild":
            return "シャツ1枚でも快適な気温。念のため薄手の羽織りをバッグに。";
        case "warm":
            return "軽装でOK。日差しが強い場合は薄手の長袖で紫外線対策を。";
        case "hot":
        case "extreme_hot":
            return "とにかく涼しく。通気性の良い1枚で、肌の露出と日焼け対策のバランスを。";
    }
}

function generateMaterialAdvice(weather: WeatherInfo): string {
    if (weather.condition === "rainy") {
        return "雨の日はスエードやシルクは避けて。ナイロンやポリエステルなど撥水性のある素材が安心です。レザーもシミに注意。";
    }
    if (weather.temp >= 28) {
        return "リネンやコットンなど通気性の高い天然素材がおすすめ。化繊は蒸れやすいので注意。";
    }
    if (weather.temp <= 5) {
        return "ウール、カシミヤ、フリースなど保温性の高い素材を。ダウンは軽くて暖かい最強の選択肢。";
    }
    if (weather.condition === "windy") {
        return "風を通しにくいナイロンやレザーのアウターが効果的。ニットだけだと風が抜けて寒く感じます。";
    }
    return "今日の気温なら素材の制約は少なめ。好みのテクスチャーを楽しんで。";
}

function generateColorMoodAdvice(weather: WeatherInfo): string {
    if (weather.condition === "sunny") {
        return "晴れの日は明るい色が映えます。白やベージュで爽やかに、もしくはビビッドカラーで気分を上げて。";
    }
    if (weather.condition === "rainy") {
        return "雨の日こそ明るい色で気分をキープ。ダークトーンなら深みのあるネイビーやバーガンディがおすすめ。";
    }
    if (weather.condition === "cloudy") {
        return "曇りの日はニュアンスカラーが美しく見えます。グレー、トープ、ラベンダーなど中間色の出番。";
    }
    if (weather.condition === "snowy") {
        return "雪景色には暖色系が映えます。バーガンディ、キャメル、マスタードで冬らしい装いを。";
    }
    return "今日の天気には、あなたの気分に合う色を自由に選んでOK。";
}

function generatePracticalNotes(weather: WeatherInfo): string[] {
    const notes: string[] = [];

    if (weather.condition === "rainy") {
        notes.push("傘を忘れずに");
        notes.push("足元は撥水シューズがおすすめ");
    }
    if (weather.condition === "snowy") {
        notes.push("滑りにくい靴底を選んで");
        notes.push("防水対策を万全に");
    }
    if (weather.temp >= 30) {
        notes.push("こまめな水分補給を");
        notes.push("帽子やサングラスで日差し対策");
    }
    if (weather.temp <= 0) {
        notes.push("手袋・マフラーで末端の防寒を");
    }
    if (weather.humidity >= 80) {
        notes.push("湿度が高め。蒸れにくい素材を意識");
    }
    if (weather.condition === "windy") {
        notes.push("帽子やスカーフが飛ばされないよう注意");
        notes.push("髪型はまとめ髪がおすすめ");
    }

    return notes;
}

/* ── Weather icon helper ── */

export function getWeatherIcon(condition: WeatherCondition): string {
    const icons: Record<WeatherCondition, string> = {
        sunny: "\u2600\uFE0F",
        cloudy: "\u2601\uFE0F",
        rainy: "\u{1F327}\uFE0F",
        snowy: "\u{1F328}\uFE0F",
        windy: "\u{1F4A8}",
        hot: "\u{1F525}",
        cold: "\u{1F976}",
    };
    return icons[condition] ?? "\u2601\uFE0F";
}

export function getConditionLabel(condition: WeatherCondition): string {
    return CONDITION_LABELS[condition] ?? condition;
}

/* ── Feedback ── */

export function saveWeatherFeedback(liked: boolean): void {
    if (typeof window === "undefined") return;
    try {
        const raw = localStorage.getItem(WEATHER_FEEDBACK_KEY);
        const history: WeatherFeedback[] = raw ? JSON.parse(raw) : [];
        const today = new Date().toISOString().slice(0, 10);
        const idx = history.findIndex((f) => f.date === today);
        if (idx >= 0) {
            history[idx].liked = liked;
        } else {
            history.push({ date: today, liked });
        }
        // Keep last 30
        localStorage.setItem(
            WEATHER_FEEDBACK_KEY,
            JSON.stringify(history.slice(-30)),
        );
    } catch {
        // ignore
    }
}
