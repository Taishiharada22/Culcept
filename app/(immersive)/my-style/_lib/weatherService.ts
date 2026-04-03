/**
 * Weather Service — 天気データ取得・表示ユーティリティ
 *
 * weatherOutfit.ts から提案生成を除去し、天気データの取得・表示・
 * フィードバック機能のみを提供する。
 * 提案生成は lib/shared/outfitEngine の generateTodayProposal() を使う。
 */

import type { WeatherDaily } from "@/lib/shared/outfitEngine";
import { safeLSSet } from "@/lib/safeLocalStorage";
import { PREFECTURE_COORDS } from "@/lib/shared/location";

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
    thicknessLevel: number;
    description: string;
}

interface WeatherFeedback {
    date: string;
    liked: boolean;
}

/* ── Constants ── */

const WEATHER_CACHE_KEY = "culcept_weather_cache_v1";
const WEATHER_FEEDBACK_KEY = "culcept_weather_feedback_v1";
const WEATHER_BACKOFF_KEY = "culcept_weather_backoff_v1";
const CACHE_DURATION_MS = 60 * 60 * 1000;
const STALE_CACHE_MAX_MS = 24 * 60 * 60 * 1000;

const WMO_CONDITION: Record<number, WeatherCondition> = {
    0: "sunny", 1: "sunny", 2: "cloudy", 3: "cloudy",
    45: "cloudy", 48: "cloudy",
    51: "rainy", 53: "rainy", 55: "rainy", 56: "rainy", 57: "rainy",
    61: "rainy", 63: "rainy", 65: "rainy", 66: "rainy", 67: "rainy",
    71: "snowy", 73: "snowy", 75: "snowy", 77: "snowy",
    80: "rainy", 81: "rainy", 82: "rainy", 85: "snowy", 86: "snowy",
    95: "rainy", 96: "rainy", 99: "rainy",
};

const CONDITION_LABELS: Record<WeatherCondition, string> = {
    sunny: "晴れ", cloudy: "曇り", rainy: "雨", snowy: "雪",
    windy: "風が強い", hot: "暑い", cold: "寒い",
};

/* ── Temperature categories ── */

export function getTemperatureCategory(temp: number): TemperatureCategoryInfo {
    if (temp <= -5) return { category: "extreme_cold", label: "極寒", thicknessLevel: 5, description: "厳重な防寒が必要" };
    if (temp <= 5) return { category: "cold", label: "寒い", thicknessLevel: 4, description: "しっかり重ね着を" };
    if (temp <= 12) return { category: "cool", label: "涼しい", thicknessLevel: 3, description: "羽織りものがあると安心" };
    if (temp <= 20) return { category: "mild", label: "快適", thicknessLevel: 2, description: "過ごしやすい気温" };
    if (temp <= 28) return { category: "warm", label: "暖かい", thicknessLevel: 1, description: "軽装でOK" };
    if (temp <= 33) return { category: "hot", label: "暑い", thicknessLevel: 1, description: "涼しい素材を選んで" };
    return { category: "extreme_hot", label: "猛暑", thicknessLevel: 1, description: "熱中症に注意、最小限の装い" };
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
    } catch { return null; }
}

function saveCachedWeather(weather: WeatherInfo): void {
    if (typeof window === "undefined") return;
    const cached: CachedWeather = { weather, fetchedAt: Date.now() };
    safeLSSet(WEATHER_CACHE_KEY, JSON.stringify(cached));
}

function isInBackoff(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const raw = localStorage.getItem(WEATHER_BACKOFF_KEY);
        if (!raw) return false;
        const until = JSON.parse(raw) as number;
        return Date.now() < until;
    } catch { return false; }
}

function setBackoff(durationMs: number = 5 * 60 * 1000): void {
    if (typeof window === "undefined") return;
    safeLSSet(WEATHER_BACKOFF_KEY, JSON.stringify(Date.now() + durationMs));
}

export interface WeatherFetchResult {
    weather: WeatherInfo;
    source: "api" | "cache" | "stale_cache" | "manual" | "fallback";
}

export class WeatherOfflineError extends Error {
    constructor() {
        super("Weather data unavailable");
        this.name = "WeatherOfflineError";
    }
}

export function buildManualWeather(temp: number, condition: WeatherCondition): WeatherInfo {
    return {
        temp, condition, humidity: 50,
        description: `${temp}\u00B0C ${CONDITION_LABELS[condition]} (\u624B\u52D5\u5165\u529B)`,
    };
}

export async function fetchWeather(lat?: number, lon?: number): Promise<WeatherFetchResult> {
    const cached = loadCachedWeather(false);
    if (cached) return { weather: cached.weather, source: "cache" };

    if (isInBackoff()) {
        const stale = loadCachedWeather(true);
        if (stale) return { weather: stale.weather, source: "stale_cache" };
        throw new WeatherOfflineError();
    }

    let useLat = lat;
    let useLon = lon;
    let geoFailed = false;

    if (useLat == null || useLon == null) {
        try {
            const res = await fetch("/api/weather/subscription", { cache: "no-store" });
            if (res.ok) {
                const json = await res.json();
                const pref = json?.subscription?.prefecture;
                if (pref && PREFECTURE_COORDS[pref]) {
                    useLat = PREFECTURE_COORDS[pref].lat;
                    useLon = PREFECTURE_COORDS[pref].lon;
                }
            }
        } catch { /* shared location unavailable */ }
    }

    if (useLat == null || useLon == null) {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000, maximumAge: 3600000,
                    });
                });
                useLat = pos.coords.latitude;
                useLon = pos.coords.longitude;
            } catch { geoFailed = true; }
        } else { geoFailed = true; }
    }

    if (useLat == null || useLon == null) throw new WeatherOfflineError();

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${useLat}&longitude=${useLon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;
        const res = await fetch(url);

        if (res.status === 429) {
            setBackoff(5 * 60 * 1000);
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
        if (temp >= 33) condition = "hot";
        else if (temp <= -5) condition = "cold";
        if (windSpeed > 40 && condition !== "rainy" && condition !== "snowy") condition = "windy";

        const weather: WeatherInfo = {
            temp, condition, humidity,
            description: `${temp}\u00B0C ${CONDITION_LABELS[condition]}`,
        };

        saveCachedWeather(weather);
        return { weather, source: "api" };
    } catch (err) {
        if (err instanceof WeatherOfflineError) throw err;
        const stale = loadCachedWeather(true);
        if (stale) return { weather: stale.weather, source: "stale_cache" };
        if (geoFailed) throw new WeatherOfflineError();
        return {
            weather: { temp: 20, condition: "cloudy", humidity: 50, description: "20\u00B0C \u66C7\u308A (\u30C7\u30FC\u30BF\u53D6\u5F97\u5931\u6557)" },
            source: "fallback",
        };
    }
}

/* ── Display utilities ── */

export function getWeatherIcon(condition: WeatherCondition): string {
    const icons: Record<WeatherCondition, string> = {
        sunny: "\u2600\uFE0F", cloudy: "\u2601\uFE0F", rainy: "\u{1F327}\uFE0F",
        snowy: "\u{1F328}\uFE0F", windy: "\u{1F4A8}", hot: "\u{1F525}", cold: "\u{1F976}",
    };
    return icons[condition] ?? "\u2601\uFE0F";
}

export function getConditionLabel(condition: WeatherCondition): string {
    return CONDITION_LABELS[condition] ?? condition;
}

/* ── Practical notes (weather-based tips) ── */

export function generatePracticalNotes(weather: WeatherInfo): string[] {
    const notes: string[] = [];
    if (weather.condition === "rainy") { notes.push("傘を忘れずに"); notes.push("足元は撥水シューズがおすすめ"); }
    if (weather.condition === "snowy") { notes.push("滑りにくい靴底を選んで"); notes.push("防水対策を万全に"); }
    if (weather.temp >= 30) { notes.push("こまめな水分補給を"); notes.push("帽子やサングラスで日差し対策"); }
    if (weather.temp <= 0) { notes.push("手袋・マフラーで末端の防寒を"); }
    if (weather.humidity >= 80) { notes.push("湿度が高め。蒸れにくい素材を意識"); }
    if (weather.condition === "windy") { notes.push("帽子やスカーフが飛ばされないよう注意"); notes.push("髪型はまとめ髪がおすすめ"); }
    return notes;
}

/* ── Feedback ── */

export function saveWeatherFeedback(liked: boolean): void {
    if (typeof window === "undefined") return;
    try {
        const raw = localStorage.getItem(WEATHER_FEEDBACK_KEY);
        const history: WeatherFeedback[] = raw ? JSON.parse(raw) : [];
        const today = new Date().toISOString().slice(0, 10);
        const idx = history.findIndex((f) => f.date === today);
        if (idx >= 0) { history[idx].liked = liked; }
        else { history.push({ date: today, liked }); }
        localStorage.setItem(WEATHER_FEEDBACK_KEY, JSON.stringify(history.slice(-30)));
    } catch { /* ignore */ }
}

/* ── WeatherInfo → WeatherDaily 変換 ── */

type WeatherIcon = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "unknown";

const CONDITION_TO_ICON: Record<WeatherCondition, WeatherIcon> = {
    sunny: "sun", cloudy: "cloud", rainy: "rain", snowy: "snow",
    windy: "cloud", hot: "sun", cold: "cloud",
};

export function weatherInfoToDaily(info: WeatherInfo): WeatherDaily {
    const isRain = info.condition === "rainy" || info.condition === "snowy";
    return {
        weather_icon: CONDITION_TO_ICON[info.condition] ?? "cloud",
        temp_max: info.temp,
        temp_min: info.temp - 5,
        pop_max: isRain ? 80 : 10,
        outfit_tag: isRain ? "rain" : "normal",
    };
}
