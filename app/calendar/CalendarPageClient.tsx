// app/calendar/CalendarPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import Image, { type ImageLoader } from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

/* ── 型定義 ── */
type CalendarSlotKey = "hat" | "top" | "pants" | "shoes";

interface OutfitItem {
    card_id: string;
    category: string;
    image_url: string;
    title: string;
    reason: string;
}

interface LocalWardrobeItem {
    id: string;
    name: string;
    category: "tops" | "bottoms" | "outerwear" | "shoes" | "accessories" | "hat" | "other";
    color: string;
    imageUrl?: string;
    addedAt: string;
}

interface DayData {
    date: string;
    dayOfWeek: number;
    outfit: {
        id: string;
        outfit_items: OutfitItem[];
        weather_input: { temp: number; condition: string } | null;
        scene: string | null;
        style_notes: string | null;
        is_worn: boolean;
    } | null;
    events: { id: string; event_type: string; event_name: string; office_code?: string | null }[];
    weather_daily: {
        weather_icon: "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "unknown";
        pop_max: number | null;
        temp_min: number | null;
        temp_max: number | null;
        pop_blocks?: { start: string; end: string | null; pop: number }[] | null;
        outfit_tag?: "rain" | "normal" | null;
    } | null;
}

interface CalendarData {
    year: number;
    month: number;
    days: DayData[];
    totalOutfits: number;
}

/* ── 定数 ── */
const WEATHER_ICONS: Record<string, string> = {
    sunny: "☀️", cloudy: "☁️", rainy: "🌧️", snowy: "❄️", windy: "💨",
};
const DAILY_WEATHER_ICONS: Record<string, string> = {
    sun: "☀️", cloud: "☁️", rain: "🌧️", snow: "❄️", storm: "⛈️", fog: "🌫️", unknown: "🌤️",
} as const;
const EVENT_ICONS: Record<string, string> = {
    work: "💼", meeting: "👔", date: "💕", party: "🎉",
    casual: "😎", outdoor: "🏕️", sports: "🏃", travel: "✈️",
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WARDROBE_KEY = "culcept_my_style_v2";
const passthroughLoader: ImageLoader = ({ src }) => src;

const CATEGORY_SLOT_MAP: Record<string, CalendarSlotKey> = {
    tops: "top", top: "top", shirts: "top", shirt: "top",
    outerwear: "top", light_outerwear: "top", outer: "top",
    coat: "top", jacket: "top", accessories: "top", accessory: "top",
    hat: "hat", hats: "hat",
    bottoms: "pants", pants: "pants", skirt: "pants",
    shoes: "shoes", footwear: "shoes",
    rain_gear: "top",
};
const CALENDAR_SLOT_PLACEHOLDER: Record<CalendarSlotKey, string> = {
    hat: "🧢", top: "👕", pants: "👖", shoes: "👟",
};
const CALENDAR_SLOT_LABEL: Record<CalendarSlotKey, string> = {
    hat: "帽子", top: "トップス", pants: "ボトム", shoes: "靴",
};

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/sns/profile", label: "Presence", icon: "🪞" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

/* ── ヘルパー ── */
function buildSeed(date: string, events: DayData["events"]): number {
    const seedBase = date.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const eventSeed = events.map((e) => e.event_type).join("|");
    return seedBase + eventSeed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function normalizeWardrobeCategory(category: string): LocalWardrobeItem["category"] {
    const key = String(category ?? "").toLowerCase().trim();
    if (["tops", "top", "shirt", "shirts", "トップス"].includes(key)) return "tops";
    if (["bottoms", "bottom", "pants", "ボトムス", "ズボン"].includes(key)) return "bottoms";
    if (["outerwear", "outer", "jacket", "coat", "アウター"].includes(key)) return "outerwear";
    if (["shoes", "shoe", "シューズ", "靴"].includes(key)) return "shoes";
    if (["accessories", "accessory", "装飾品", "小物"].includes(key)) return "accessories";
    if (["hat", "hats", "帽子"].includes(key)) return "hat";
    return "other";
}

function buildSlotPools(wardrobe: LocalWardrobeItem[]) {
    const normalized = wardrobe.map((item) => ({ ...item, category: normalizeWardrobeCategory(item.category) }));
    return {
        hats: normalized.filter((w) => w.category === "hat"),
        tops: normalized.filter((w) => w.category === "tops"),
        bottoms: normalized.filter((w) => w.category === "bottoms"),
        shoes: normalized.filter((w) => w.category === "shoes"),
    };
}

function pickIndexed<T>(list: T[], baseIndex: number, offset: number): T | null {
    if (!list.length) return null;
    const raw = (baseIndex + offset) % list.length;
    return list[(raw + list.length) % list.length];
}

/* ── メインコンポーネント ── */
export default function CalendarPageClient() {
    const today = new Date();
    const [currentYear, setCurrentYear] = React.useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = React.useState(today.getMonth() + 1);
    const [calendarData, setCalendarData] = React.useState<CalendarData | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [generating, setGenerating] = React.useState(false);
    const [selectedDay, setSelectedDay] = React.useState<DayData | null>(null);
    const [recommendDate, setRecommendDate] = React.useState<string | null>(null);
    const [wardrobeItems, setWardrobeItems] = React.useState<LocalWardrobeItem[]>([]);
    const [globalOffset, setGlobalOffset] = React.useState(0);
    const [hatIndex, setHatIndex] = React.useState(0);
    const [topIndex, setTopIndex] = React.useState(0);
    const [pantsIndex, setPantsIndex] = React.useState(0);
    const [shoesIndex, setShoesIndex] = React.useState(0);
    const [goodPulse, setGoodPulse] = React.useState(false);
    const [showEventForm, setShowEventForm] = React.useState(false);
    const [eventType, setEventType] = React.useState("work");
    const [eventName, setEventName] = React.useState("");
    const [eventOfficeCode, setEventOfficeCode] = React.useState("");
    const [eventSaving, setEventSaving] = React.useState(false);
    const [officeCode, setOfficeCode] = React.useState("");
    const [officeOptions, setOfficeOptions] = React.useState<Array<{ code: string; name: string }>>([]);
    const [officeLoading, setOfficeLoading] = React.useState(true);
    const [officeSaving, setOfficeSaving] = React.useState(false);
    const [officeMessage, setOfficeMessage] = React.useState<string | null>(null);
    const [showWeatherSettings, setShowWeatherSettings] = React.useState(false);

    /* ── データ取得 ── */
    const fetchCalendar = React.useCallback(async (): Promise<CalendarData | null> => {
        try {
            const res = await fetch(`/api/calendar/month?year=${currentYear}&month=${currentMonth}`, { cache: "no-store" });
            const data = await res.json();
            setCalendarData(data);
            return data;
        } catch (err) {
            console.error("Failed to fetch calendar:", err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [currentYear, currentMonth]);

    React.useEffect(() => { setLoading(true); void fetchCalendar(); }, [fetchCalendar]);

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(WARDROBE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            setWardrobeItems(data.wardrobe ?? []);
        } catch { setWardrobeItems([]); }
    }, []);

    React.useEffect(() => {
        let active = true;
        const loadOffice = async () => {
            setOfficeLoading(true);
            setOfficeMessage(null);
            try {
                const [subRes, officeRes] = await Promise.all([
                    fetch("/api/weather/subscription", { cache: "no-store" }),
                    fetch("/api/weather/offices", { cache: "no-store" }),
                ]);
                const subJson = await subRes.json().catch(() => ({}));
                const officeJson = await officeRes.json().catch(() => ({}));
                if (!active) return;
                if (subJson?.subscription?.office_code) setOfficeCode(String(subJson.subscription.office_code));
                if (Array.isArray(officeJson?.offices)) setOfficeOptions(officeJson.offices);
            } catch { if (!active) return; setOfficeOptions([]); }
            finally { if (!active) return; setOfficeLoading(false); }
        };
        void loadOffice();
        return () => { active = false; };
    }, []);

    React.useEffect(() => { if (!selectedDay) return; setEventOfficeCode(""); }, [selectedDay?.date]);

    /* ── ハンドラー ── */
    const handleSaveOffice = async () => {
        if (!officeCode.trim()) return;
        setOfficeSaving(true); setOfficeMessage(null);
        try {
            const res = await fetch("/api/weather/subscription", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ office_code: officeCode.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) setOfficeMessage("天気設定の保存に失敗しました");
            else { setOfficeMessage("天気設定を保存しました"); await fetchCalendar(); }
        } catch { setOfficeMessage("天気設定の保存に失敗しました"); }
        finally { setOfficeSaving(false); }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const res = await fetch("/api/calendar/generate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year: currentYear, month: currentMonth }),
            });
            if (res.ok) await fetchCalendar();
        } catch (err) { console.error("Failed to generate:", err); }
        finally { setGenerating(false); }
    };

    const handleAddEvent = async () => {
        if (!selectedDay || !eventType) return;
        setEventSaving(true);
        try {
            const res = await fetch("/api/calendar/events", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: selectedDay.date, event_type: eventType,
                    event_name: eventName.trim() || undefined,
                    office_code: eventOfficeCode.trim() || undefined,
                }),
            });
            if (res.ok) {
                const data = await fetchCalendar();
                setSelectedDay(data?.days.find((d) => d.date === selectedDay.date) ?? null);
                setEventName(""); setEventOfficeCode("");
            }
        } catch (err) { console.error("Failed to add event:", err); }
        finally { setEventSaving(false); }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!selectedDay) return;
        try {
            const res = await fetch(`/api/calendar/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            if (res.ok) {
                const data = await fetchCalendar();
                setSelectedDay(data?.days.find((d) => d.date === selectedDay.date) ?? null);
            }
        } catch (err) { console.error("Failed to delete event:", err); }
    };

    const goToPrevMonth = () => {
        if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12); }
        else setCurrentMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1); }
        else setCurrentMonth(m => m + 1);
    };

    /* ── カレンダーグリッド ── */
    const generateCalendarGrid = () => {
        const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const grid: (DayData | null)[] = [];
        for (let i = 0; i < firstDay; i++) grid.push(null);
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayData = calendarData?.days.find(d => d.date === dateStr);
            grid.push(dayData ?? { date: dateStr, dayOfWeek: new Date(dateStr).getDay(), outfit: null, events: [], weather_daily: null });
        }
        return grid;
    };
    const isTodayFn = (date: string) => date === today.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    /* ── スロットプール ── */
    const slotPools = React.useMemo(() => buildSlotPools(wardrobeItems), [wardrobeItems]);

    React.useEffect(() => {
        if (!calendarData?.days.length) return;
        if (recommendDate && calendarData.days.some((day) => day.date === recommendDate)) return;
        const todayDay = calendarData.days.find((day) => day.date === todayStr);
        setRecommendDate(todayDay?.date ?? calendarData.days[0]?.date ?? null);
    }, [calendarData, recommendDate, todayStr]);

    const recommendationDay = React.useMemo(() => {
        if (!calendarData) return null;
        if (recommendDate) { const hit = calendarData.days.find((day) => day.date === recommendDate); if (hit) return hit; }
        return calendarData.days.find((day) => day.date === todayStr) ?? calendarData.days[0] ?? null;
    }, [calendarData, recommendDate, todayStr]);

    const summaryDay = React.useMemo(() => {
        if (selectedDay) return selectedDay;
        if (!calendarData) return null;
        return calendarData.days.find((day) => day.date === todayStr) ?? calendarData.days[0] ?? null;
    }, [selectedDay, calendarData, todayStr]);

    const summaryWeather = summaryDay?.weather_daily ?? null;
    const summaryEmoji = summaryWeather ? DAILY_WEATHER_ICONS[summaryWeather.weather_icon] ?? "🌤️"
        : summaryDay?.outfit?.weather_input ? WEATHER_ICONS[summaryDay.outfit.weather_input.condition] ?? "🌤️" : "—";
    const summaryTemp = summaryWeather ? `${summaryWeather.temp_min ?? "-"}°/${summaryWeather.temp_max ?? "-"}°`
        : summaryDay?.outfit?.weather_input ? `${summaryDay.outfit.weather_input.temp}°C` : "--";
    const summaryPop = summaryWeather?.pop_max != null ? `${summaryWeather.pop_max}%` : null;
    const baseOfficeLabel = React.useMemo(() => {
        if (!officeCode) return "";
        return officeOptions.find((opt) => opt.code === officeCode)?.name ?? "";
    }, [officeCode, officeOptions]);

    const baseIndices = React.useMemo(() => {
        if (!recommendationDay) return { hat: 0, top: 0, pants: 0, shoes: 0 };
        const seed = buildSeed(recommendationDay.date, recommendationDay.events ?? []);
        return {
            hat: slotPools.hats.length ? seed % slotPools.hats.length : 0,
            top: slotPools.tops.length ? (seed + 7) % slotPools.tops.length : 0,
            pants: slotPools.bottoms.length ? (seed + 13) % slotPools.bottoms.length : 0,
            shoes: slotPools.shoes.length ? (seed + 19) % slotPools.shoes.length : 0,
        };
    }, [recommendationDay, slotPools.hats.length, slotPools.tops.length, slotPools.bottoms.length, slotPools.shoes.length]);

    React.useEffect(() => {
        setGlobalOffset(0); setHatIndex(0); setTopIndex(0); setPantsIndex(0); setShoesIndex(0);
        setDetailView("coordinate");
    }, [recommendationDay?.date, slotPools.hats.length, slotPools.tops.length, slotPools.bottoms.length, slotPools.shoes.length]);

    const currentSelection: Record<CalendarSlotKey, LocalWardrobeItem | null> = {
        hat: pickIndexed(slotPools.hats, baseIndices.hat, globalOffset + hatIndex),
        top: pickIndexed(slotPools.tops, baseIndices.top, globalOffset + topIndex),
        pants: pickIndexed(slotPools.bottoms, baseIndices.pants, globalOffset + pantsIndex),
        shoes: pickIndexed(slotPools.shoes, baseIndices.shoes, globalOffset + shoesIndex),
    };

    const handleSlotNext = (slot: CalendarSlotKey) => {
        const poolLength = slot === "hat" ? slotPools.hats.length : slot === "top" ? slotPools.tops.length : slot === "pants" ? slotPools.bottoms.length : slotPools.shoes.length;
        if (poolLength === 0) return;
        if (slot === "hat") setHatIndex(p => p + 1);
        if (slot === "top") setTopIndex(p => p + 1);
        if (slot === "pants") setPantsIndex(p => p + 1);
        if (slot === "shoes") setShoesIndex(p => p + 1);
    };
    const handleSlotPrev = (slot: CalendarSlotKey) => {
        const poolLength = slot === "hat" ? slotPools.hats.length : slot === "top" ? slotPools.tops.length : slot === "pants" ? slotPools.bottoms.length : slotPools.shoes.length;
        if (poolLength === 0) return;
        if (slot === "hat") setHatIndex(p => p - 1);
        if (slot === "top") setTopIndex(p => p - 1);
        if (slot === "pants") setPantsIndex(p => p - 1);
        if (slot === "shoes") setShoesIndex(p => p - 1);
    };

    const handleReplaceAll = () => {
        if (!slotPools.hats.length && !slotPools.tops.length && !slotPools.bottoms.length && !slotPools.shoes.length) return;
        setGlobalOffset(p => p + 1); setHatIndex(0); setTopIndex(0); setPantsIndex(0); setShoesIndex(0);
    };

    const slotCards: Array<{
        key: CalendarSlotKey; label: string; placeholder: string;
        item: LocalWardrobeItem | null; prevItem: LocalWardrobeItem | null; nextItem: LocalWardrobeItem | null; poolLength: number;
    }> = [
        { key: "hat", label: CALENDAR_SLOT_LABEL.hat, placeholder: CALENDAR_SLOT_PLACEHOLDER.hat, item: currentSelection.hat,
          prevItem: pickIndexed(slotPools.hats, baseIndices.hat, globalOffset + hatIndex - 1),
          nextItem: pickIndexed(slotPools.hats, baseIndices.hat, globalOffset + hatIndex + 1), poolLength: slotPools.hats.length },
        { key: "top", label: CALENDAR_SLOT_LABEL.top, placeholder: CALENDAR_SLOT_PLACEHOLDER.top, item: currentSelection.top,
          prevItem: pickIndexed(slotPools.tops, baseIndices.top, globalOffset + topIndex - 1),
          nextItem: pickIndexed(slotPools.tops, baseIndices.top, globalOffset + topIndex + 1), poolLength: slotPools.tops.length },
        { key: "pants", label: CALENDAR_SLOT_LABEL.pants, placeholder: CALENDAR_SLOT_PLACEHOLDER.pants, item: currentSelection.pants,
          prevItem: pickIndexed(slotPools.bottoms, baseIndices.pants, globalOffset + pantsIndex - 1),
          nextItem: pickIndexed(slotPools.bottoms, baseIndices.pants, globalOffset + pantsIndex + 1), poolLength: slotPools.bottoms.length },
        { key: "shoes", label: CALENDAR_SLOT_LABEL.shoes, placeholder: CALENDAR_SLOT_PLACEHOLDER.shoes, item: currentSelection.shoes,
          prevItem: pickIndexed(slotPools.shoes, baseIndices.shoes, globalOffset + shoesIndex - 1),
          nextItem: pickIndexed(slotPools.shoes, baseIndices.shoes, globalOffset + shoesIndex + 1), poolLength: slotPools.shoes.length },
    ];

    const slotToCategory: Record<CalendarSlotKey, string> = { hat: "hat", top: "tops", pants: "bottoms", shoes: "shoes" };

    const handleSaveWardrobeOutfit = async () => {
        if (!selectedDay) return;
        const outfitItems = (Object.entries(currentSelection) as Array<[CalendarSlotKey, LocalWardrobeItem | null]>)
            .filter(([, item]) => Boolean(item))
            .map(([slot, item]) => ({
                card_id: item!.id, category: slotToCategory[slot],
                image_url: item!.imageUrl ?? "", title: item!.name, reason: "MY",
            }));
        if (!outfitItems.length) return;
        const weatherInput = (() => {
            const daily = selectedDay.weather_daily;
            if (!daily) return selectedDay.outfit?.weather_input ?? null;
            const min = daily.temp_min; const max = daily.temp_max;
            const hasMin = typeof min === "number"; const hasMax = typeof max === "number";
            const temp = hasMin && hasMax ? Math.round((min + max) / 2) : hasMax ? Math.round(max!) : hasMin ? Math.round(min!) : null;
            const icon = daily.weather_icon; const tag = daily.outfit_tag;
            let condition = "sunny";
            if (tag === "rain") condition = "rainy";
            else if (icon === "snow") condition = "snowy";
            else if (icon === "cloud" || icon === "fog") condition = "cloudy";
            else if (icon === "rain" || icon === "storm") condition = "rainy";
            return temp != null ? { temp, condition } : selectedDay.outfit?.weather_input ?? null;
        })();
        try {
            const res = await fetch("/api/calendar/day", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: selectedDay.date, outfit_items: outfitItems, is_worn: true, style_notes: "MY SETUP", weather_input: weatherInput }),
            });
            if (res.ok) {
                setGoodPulse(true); setTimeout(() => setGoodPulse(false), 1200);
                const data = await fetchCalendar();
                setSelectedDay(data?.days.find((d) => d.date === selectedDay.date) ?? null);
            }
        } catch (err) { console.error("Failed to save wardrobe outfit:", err); }
    };

    /* ── 今日の天気ヘッダー情報 ── */
    const todayWeather = React.useMemo(() => {
        if (!calendarData) return null;
        const d = calendarData.days.find(day => day.date === todayStr);
        return d?.weather_daily ?? null;
    }, [calendarData, todayStr]);

    const eventCount = calendarData?.days.reduce((sum, d) => sum + d.events.length, 0) ?? 0;
    const outfitCount = calendarData?.days.filter(d => d.outfit?.is_worn).length ?? 0;

    /* ── 月間サマリー統計 ── */
    const monthSummary = React.useMemo(() => {
        if (!calendarData) return null;
        const days = calendarData.days;
        const totalDays = days.length;
        const wornDays = days.filter(d => d.outfit?.is_worn).length;
        const completionRate = totalDays > 0 ? Math.round((wornDays / totalDays) * 100) : 0;
        const rainyDays = days.filter(d => d.weather_daily?.outfit_tag === "rain" || d.weather_daily?.weather_icon === "rain").length;
        const avgTemp = (() => {
            const temps = days.map(d => d.weather_daily?.temp_max).filter((t): t is number => t !== null && t !== undefined);
            return temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null;
        })();
        const eventDays = days.filter(d => d.events.length > 0).length;
        const uniqueCategories = new Set<string>();
        days.forEach(d => {
            d.outfit?.outfit_items?.forEach(item => {
                if (item.category) uniqueCategories.add(item.category);
            });
        });
        return { totalDays, wornDays, completionRate, rainyDays, avgTemp, eventDays, categoryCount: uniqueCategories.size };
    }, [calendarData]);

    /* ── 今日のAIコーデ（ヒーロー用） ── */
    const todayData = React.useMemo(() => {
        if (!calendarData) return null;
        return calendarData.days.find(d => d.date === todayStr) ?? null;
    }, [calendarData, todayStr]);

    const todayOutfitItems = todayData?.outfit?.outfit_items ?? [];
    const hasTodayOutfit = todayOutfitItems.length > 0;

    /* ── 今週のプランナー ── */
    const weekDays = React.useMemo(() => {
        if (!calendarData) return [];
        const todayDate = new Date(todayStr);
        const dayOfWeek = todayDate.getDay();
        const weekStart = new Date(todayDate);
        weekStart.setDate(todayDate.getDate() - dayOfWeek);
        const days: DayData[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const ds = d.toISOString().split("T")[0];
            const hit = calendarData.days.find(dd => dd.date === ds);
            if (hit) days.push(hit);
            else days.push({ date: ds, dayOfWeek: d.getDay(), outfit: null, events: [], weather_daily: null });
        }
        return days;
    }, [calendarData, todayStr]);

    /* ── 着用ストリーク ── */
    const streak = React.useMemo(() => {
        if (!calendarData) return 0;
        const sorted = [...calendarData.days].filter(d => d.date <= todayStr).sort((a, b) => b.date.localeCompare(a.date));
        let count = 0;
        for (const d of sorted) {
            if (d.outfit?.is_worn) count++;
            else break;
        }
        return count;
    }, [calendarData, todayStr]);

    /* ── 天気スタイリングTips ── */
    const stylingTip = React.useMemo(() => {
        const w = todayData?.weather_daily;
        if (!w) return null;
        const temp = w.temp_max ?? w.temp_min ?? null;
        const icon = w.weather_icon;
        const isRain = w.outfit_tag === "rain" || icon === "rain" || icon === "storm";
        if (isRain) return { icon: "☔", text: "防水アウター＋ダークカラーが安心。足元は撥水シューズで", color: "blue" };
        if (icon === "snow") return { icon: "❄️", text: "レイヤードで温度調整。インナーダウン＋ウールコートが最適", color: "indigo" };
        if (temp !== null && temp >= 30) return { icon: "🔥", text: "通気性のいいリネン・薄手コットン素材を。淡色が涼しげ", color: "amber" };
        if (temp !== null && temp >= 25) return { icon: "🌿", text: "半袖Tee＋軽めパンツでリラックス。日差し対策にハット", color: "emerald" };
        if (temp !== null && temp >= 15) return { icon: "🍂", text: "薄手アウター＋ロンTの重ね着がちょうどいい気温帯", color: "orange" };
        if (temp !== null && temp >= 5) return { icon: "🧥", text: "コート必須。マフラー＋手袋で防寒。ニット＋ボトムを暖色で", color: "violet" };
        if (temp !== null && temp < 5) return { icon: "🥶", text: "最大防寒: ダウン＋ヒートテック＋厚手ボトム。暖色でアクセント", color: "slate" };
        return { icon: "🌤️", text: "過ごしやすい天気。好きなスタイルを楽しんで", color: "gray" };
    }, [todayData]);

    /* ── レンダリング ── */
    return (
        <LightBackground>
            {/* ── プレミアムヘッダー ── */}
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="w-9 h-9 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-gray-800">Coordinate Calendar</h1>
                            <p className="text-[10px] text-gray-400 tracking-wide">AI-Powered Daily Styling</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <motion.button onClick={() => setShowWeatherSettings(v => !v)}
                            className="w-9 h-9 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition-all text-sm"
                            whileTap={{ scale: 0.9 }}>
                            🌤️
                        </motion.button>
                        <motion.button onClick={handleGenerate} disabled={generating}
                            className="h-9 px-4 rounded-full bg-gradient-to-r from-violet-500/90 to-indigo-500/90 backdrop-blur-sm text-white text-xs font-semibold disabled:opacity-50 shadow-lg shadow-violet-500/20 border border-white/20"
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                            {generating ? "..." : "AI生成"}
                        </motion.button>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 pb-32">
                {/* ── 天気設定（折りたたみ） ── */}
                <AnimatePresence>
                    {showWeatherSettings && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                            <GlassCard className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-slate-700">天気地域設定（気象庁）</span>
                                    <span className="text-[9px] text-slate-400">JST 05:10 / 11:10 / 17:10 自動更新</span>
                                </div>
                                <div className="flex gap-2">
                                    {officeOptions.length > 0 ? (
                                        <select value={officeCode} onChange={(e) => setOfficeCode(e.target.value)}
                                            className="flex-1 rounded-xl bg-white/80 border border-slate-200/60 px-3 py-2 text-xs text-slate-700 backdrop-blur-sm" disabled={officeLoading}>
                                            <option value="">地域を選択</option>
                                            {officeOptions.map(opt => <option key={opt.code} value={opt.code}>{opt.name}</option>)}
                                        </select>
                                    ) : (
                                        <input value={officeCode} onChange={(e) => setOfficeCode(e.target.value)} placeholder="地域コード（例: 130000）"
                                            className="flex-1 rounded-xl bg-white/80 border border-slate-200/60 px-3 py-2 text-xs text-slate-700 backdrop-blur-sm" disabled={officeLoading} />
                                    )}
                                    <button onClick={handleSaveOffice} disabled={officeSaving || officeLoading || !officeCode.trim()}
                                        className="rounded-xl bg-slate-800 text-white px-4 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 transition">
                                        {officeSaving ? "..." : "保存"}
                                    </button>
                                </div>
                                {officeMessage && <p className="mt-2 text-[10px] text-slate-500">{officeMessage}</p>}
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-[60vh]">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            className="w-12 h-12 rounded-full border-2 border-violet-200 border-t-violet-500" />
                        <p className="mt-4 text-sm text-gray-400">Loading...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* ── ヒーロー：今日の天気 + 月ナビ ── */}
                        <FadeInView>
                            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/60 via-white/40 to-white/20 backdrop-blur-2xl border border-white/50 shadow-[0_8px_60px_-20px_rgba(120,100,200,0.15)] p-5">
                                {/* 装飾 */}
                                <div className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br from-violet-300/20 to-indigo-400/10 blur-3xl" />
                                <div className="pointer-events-none absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-gradient-to-br from-pink-300/15 to-rose-400/5 blur-2xl" />

                                <div className="relative flex items-center justify-between">
                                    {/* 月ナビゲーション */}
                                    <div className="flex items-center gap-3">
                                        <motion.button onClick={goToPrevMonth} className="w-8 h-8 rounded-full bg-white/40 border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition" whileTap={{ scale: 0.85 }}>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                        </motion.button>
                                        <div className="text-center">
                                            <p className="text-2xl font-black tracking-tight text-gray-800">{currentMonth}<span className="text-base font-normal text-gray-400 ml-0.5">月</span></p>
                                            <p className="text-[10px] text-gray-400 -mt-0.5">{currentYear}</p>
                                        </div>
                                        <motion.button onClick={goToNextMonth} className="w-8 h-8 rounded-full bg-white/40 border border-white/50 flex items-center justify-center text-gray-400 hover:bg-white/70 transition" whileTap={{ scale: 0.85 }}>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                        </motion.button>
                                    </div>

                                    {/* 今日の天気サマリー */}
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="flex items-baseline gap-1.5 justify-end">
                                                <span className="text-3xl">{summaryEmoji}</span>
                                                <span className="text-lg font-bold text-gray-700">{summaryTemp}</span>
                                            </div>
                                            {summaryPop && <p className="text-[10px] text-blue-400 mt-0.5">降水確率 {summaryPop}</p>}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 rounded-full bg-white/50 border border-white/60 px-2.5 py-1">
                                                <span className="text-[10px]">👗</span>
                                                <span className="text-[10px] font-bold text-gray-600">{outfitCount}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 rounded-full bg-white/50 border border-white/60 px-2.5 py-1">
                                                <span className="text-[10px]">📌</span>
                                                <span className="text-[10px] font-bold text-gray-600">{eventCount}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </FadeInView>

                        {/* ── 今日のAIコーデ ヒーローカード ── */}
                        {hasTodayOutfit && (
                            <FadeInView delay={0.04}>
                                <motion.button onClick={() => { setRecommendDate(todayStr); setSelectedDay(todayData!); }}
                                    className="w-full text-left relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/50 via-white/30 to-violet-50/20 backdrop-blur-2xl border border-white/40 shadow-[0_12px_50px_-15px_rgba(100,80,200,0.12)] p-4 sm:p-5 group"
                                    whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                                    {/* 装飾 */}
                                    <div className="pointer-events-none absolute -top-16 right-8 w-40 h-40 rounded-full bg-gradient-to-br from-violet-400/10 to-pink-400/5 blur-3xl group-hover:scale-110 transition-transform duration-700" />
                                    <div className="pointer-events-none absolute bottom-0 left-0 w-24 h-24 rounded-full bg-gradient-to-br from-cyan-300/10 to-blue-400/5 blur-2xl" />

                                    <div className="relative flex items-start gap-4">
                                        {/* コーデサムネイルスタック */}
                                        <div className="relative shrink-0 w-28 h-28 sm:w-36 sm:h-36">
                                            {/* 背景カード(2枚目) */}
                                            {todayOutfitItems.length > 1 && todayOutfitItems[1]?.image_url && (
                                                <div className="absolute -right-2 -top-2 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/40 backdrop-blur-md border border-white/40 overflow-hidden shadow-sm rotate-6">
                                                    <Image src={todayOutfitItems[1].image_url} alt="" width={96} height={96}
                                                        className="w-full h-full object-contain opacity-60 p-1" loader={passthroughLoader} unoptimized />
                                                </div>
                                            )}
                                            {/* メインカード */}
                                            <div className="relative z-10 w-full h-full rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 overflow-hidden shadow-lg">
                                                {todayOutfitItems[0]?.image_url ? (
                                                    <Image src={todayOutfitItems[0].image_url} alt={todayOutfitItems[0].title ?? ""} width={200} height={200}
                                                        className="w-full h-full object-contain p-2" loader={passthroughLoader} unoptimized />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">👕</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* テキスト */}
                                        <div className="flex-1 min-w-0 pt-1">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[9px] font-bold tracking-widest text-violet-500 uppercase">Today&apos;s Coordinate</span>
                                                {todayData?.outfit?.is_worn && (
                                                    <span className="text-[8px] font-bold text-emerald-500 bg-emerald-50 rounded-full px-1.5 py-0.5">WORN</span>
                                                )}
                                            </div>
                                            <p className="text-sm font-bold text-gray-700 mb-1.5 truncate">
                                                {todayOutfitItems.map(i => i.title).filter(Boolean).join(" + ") || "AI提案コーデ"}
                                            </p>
                                            {todayData?.outfit?.style_notes && (
                                                <p className="text-[10px] text-gray-400 line-clamp-2 mb-2">{todayData.outfit.style_notes}</p>
                                            )}
                                            {/* アイテムバッジ */}
                                            <div className="flex flex-wrap gap-1">
                                                {todayOutfitItems.slice(0, 4).map((item, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 text-[8px] font-semibold text-gray-500 bg-gray-100/60 rounded-full px-2 py-0.5 backdrop-blur-sm border border-gray-200/30">
                                                        {item.category === "tops" ? "👕" : item.category === "bottoms" ? "👖" : item.category === "shoes" ? "👟" : "👔"}
                                                        {item.title?.split(" ").slice(0, 2).join(" ") ?? item.category}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="mt-2 flex items-center gap-1 text-[9px] text-violet-400 group-hover:text-violet-500 transition">
                                                <span>コーデを編集</span>
                                                <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                </motion.button>
                            </FadeInView>
                        )}

                        {/* ── 天気スタイリングTips ── */}
                        {stylingTip && (
                            <FadeInView delay={0.06}>
                                <div className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl p-3.5 ${
                                    stylingTip.color === "blue" ? "bg-blue-50/30 border-blue-200/30" :
                                    stylingTip.color === "indigo" ? "bg-indigo-50/30 border-indigo-200/30" :
                                    stylingTip.color === "amber" ? "bg-amber-50/30 border-amber-200/30" :
                                    stylingTip.color === "emerald" ? "bg-emerald-50/30 border-emerald-200/30" :
                                    stylingTip.color === "orange" ? "bg-orange-50/30 border-orange-200/30" :
                                    stylingTip.color === "violet" ? "bg-violet-50/30 border-violet-200/30" :
                                    stylingTip.color === "slate" ? "bg-slate-50/30 border-slate-200/30" :
                                    "bg-gray-50/30 border-gray-200/30"
                                }`}>
                                    <div className="flex items-start gap-3">
                                        <span className="text-2xl shrink-0">{stylingTip.icon}</span>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">Styling Tip</p>
                                            <p className="text-xs text-gray-600 font-medium leading-relaxed">{stylingTip.text}</p>
                                        </div>
                                    </div>
                                </div>
                            </FadeInView>
                        )}

                        {/* ── 月間サマリー ── */}
                        {monthSummary && (
                            <FadeInView delay={0.06}>
                                <div className="rounded-2xl bg-white/40 backdrop-blur-sm border border-white/50 p-3 mb-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Monthly Summary</span>
                                        <span className="text-[9px] font-bold text-violet-500">{currentYear}/{currentMonth}</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="text-center">
                                            <div className="relative w-10 h-10 mx-auto">
                                                <svg viewBox="0 0 36 36" className="w-10 h-10 transform -rotate-90">
                                                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
                                                    <circle cx="18" cy="18" r="15" fill="none"
                                                        stroke={monthSummary.completionRate >= 70 ? "#10b981" : monthSummary.completionRate >= 40 ? "#f59e0b" : "#94a3b8"}
                                                        strokeWidth="3" strokeLinecap="round"
                                                        strokeDasharray={`${(monthSummary.completionRate / 100) * 94.2} 94.2`} />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-gray-600">{monthSummary.completionRate}%</span>
                                            </div>
                                            <div className="text-[8px] font-bold text-gray-400 mt-1">コーデ率</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-black text-violet-600">{monthSummary.wornDays}</div>
                                            <div className="text-[8px] font-bold text-gray-400">着用日</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-black text-blue-600">{monthSummary.rainyDays}</div>
                                            <div className="text-[8px] font-bold text-gray-400">雨の日</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-black text-amber-600">{monthSummary.avgTemp ?? "-"}°</div>
                                            <div className="text-[8px] font-bold text-gray-400">平均気温</div>
                                        </div>
                                    </div>
                                </div>
                            </FadeInView>
                        )}

                        {/* ── 週間プランナー ── */}
                        {weekDays.length > 0 && (
                            <FadeInView delay={0.07}>
                                <div>
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">This Week</span>
                                        {streak > 0 && (
                                            <span className="text-[9px] font-bold text-orange-500 bg-orange-50/80 rounded-full px-2 py-0.5 flex items-center gap-1 border border-orange-200/30">
                                                🔥 {streak}日連続コーデ
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                                        {weekDays.map((wd) => {
                                            const isT = wd.date === todayStr;
                                            const dayNum = parseInt(wd.date.split("-")[2], 10);
                                            const wIcon = wd.weather_daily ? DAILY_WEATHER_ICONS[wd.weather_daily.weather_icon] ?? "🌤️" : null;
                                            const hasO = !!wd.outfit?.is_worn;
                                            const firstImg = wd.outfit?.outfit_items?.[0]?.image_url;
                                            return (
                                                <motion.button key={wd.date} onClick={() => { setRecommendDate(wd.date); setSelectedDay(wd); }}
                                                    className={`shrink-0 w-[72px] rounded-2xl overflow-hidden border transition-all ${
                                                        isT ? "bg-violet-50/50 border-violet-300/50 shadow-sm shadow-violet-500/10"
                                                            : hasO ? "bg-white/50 border-white/60 shadow-sm"
                                                            : "bg-white/25 border-white/30"
                                                    }`}
                                                    whileHover={{ y: -3, scale: 1.03 }} whileTap={{ scale: 0.95 }}>
                                                    <div className="p-2 text-center">
                                                        <p className={`text-[9px] font-semibold ${isT ? "text-violet-500" : "text-gray-400"}`}>{WEEKDAYS[wd.dayOfWeek]}</p>
                                                        <p className={`text-sm font-bold ${isT ? "text-violet-600" : "text-gray-600"}`}>{dayNum}</p>
                                                        {wIcon && <p className="text-sm mt-0.5">{wIcon}</p>}
                                                    </div>
                                                    <div className="h-14 bg-gray-50/30 flex items-center justify-center border-t border-white/20">
                                                        {firstImg ? (
                                                            <Image src={firstImg} alt="" width={48} height={48} className="h-12 w-12 object-contain" loader={passthroughLoader} unoptimized />
                                                        ) : hasO ? (
                                                            <span className="text-lg opacity-50">✓</span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </div>
                                                    {wd.events.length > 0 && (
                                                        <div className="px-1.5 py-1 text-center border-t border-white/20">
                                                            <span className="text-[7px] font-semibold text-pink-500 truncate block">{wd.events[0].event_name || wd.events[0].event_type}</span>
                                                        </div>
                                                    )}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </FadeInView>
                        )}

                        {/* ── カレンダーグリッド ── */}
                        <FadeInView delay={0.08}>
                            <div className="rounded-3xl bg-white/30 backdrop-blur-xl border border-white/40 shadow-[0_4px_40px_-15px_rgba(100,80,180,0.1)] p-3 sm:p-4">
                                {/* 曜日ヘッダー */}
                                <div className="grid grid-cols-7 mb-1.5">
                                    {WEEKDAYS.map((day, i) => (
                                        <div key={day} className={`text-center text-[10px] font-semibold py-1.5 tracking-widest uppercase ${
                                            i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-gray-400"
                                        }`}>{day}</div>
                                    ))}
                                </div>
                                {/* グリッド */}
                                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                                    {generateCalendarGrid().map((day, i) => (
                                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.008, duration: 0.3 }}>
                                            {day ? (
                                                <DayCell day={day} isToday={isTodayFn(day.date)} onClick={() => { setRecommendDate(day.date); setSelectedDay(day); }} />
                                            ) : (
                                                <div className="aspect-square" />
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                                <p className="mt-2 text-[9px] text-slate-300 text-right">出典: 気象庁</p>
                            </div>
                        </FadeInView>

                        {/* ── 月間スタイリングレポート ── */}
                        {calendarData && outfitCount > 0 && (
                            <FadeInView delay={0.1}>
                                <div className="rounded-2xl bg-white/25 backdrop-blur-xl border border-white/30 p-4">
                                    <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">Monthly Report</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center rounded-xl bg-white/40 border border-white/50 p-3 backdrop-blur-sm">
                                            <p className="text-2xl font-black text-violet-600">{outfitCount}</p>
                                            <p className="text-[9px] text-gray-400 mt-0.5">コーデ確定</p>
                                        </div>
                                        <div className="text-center rounded-xl bg-white/40 border border-white/50 p-3 backdrop-blur-sm">
                                            <p className="text-2xl font-black text-pink-500">{eventCount}</p>
                                            <p className="text-[9px] text-gray-400 mt-0.5">予定</p>
                                        </div>
                                        <div className="text-center rounded-xl bg-white/40 border border-white/50 p-3 backdrop-blur-sm">
                                            <p className="text-2xl font-black text-orange-500">{streak > 0 ? `${streak}🔥` : "—"}</p>
                                            <p className="text-[9px] text-gray-400 mt-0.5">連続ストリーク</p>
                                        </div>
                                    </div>
                                    {/* よく着たアイテムTop3 */}
                                    {(() => {
                                        const freq: Record<string, { count: number; title: string; img: string }> = {};
                                        for (const d of calendarData.days) {
                                            if (!d.outfit?.is_worn) continue;
                                            for (const item of d.outfit.outfit_items) {
                                                if (!freq[item.card_id]) freq[item.card_id] = { count: 0, title: item.title, img: item.image_url };
                                                freq[item.card_id].count++;
                                            }
                                        }
                                        const top = Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);
                                        if (!top.length) return null;
                                        return (
                                            <div className="mt-3">
                                                <p className="text-[9px] text-gray-400 mb-2">よく着たアイテム</p>
                                                <div className="flex gap-2">
                                                    {top.map((item, i) => (
                                                        <div key={i} className="flex items-center gap-2 rounded-xl bg-white/40 border border-white/50 px-2.5 py-1.5 backdrop-blur-sm">
                                                            {item.img && (
                                                                <div className="w-7 h-7 rounded-lg overflow-hidden bg-gray-50 shrink-0">
                                                                    <Image src={item.img} alt="" width={28} height={28} className="w-full h-full object-contain" loader={passthroughLoader} unoptimized />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="text-[9px] font-bold text-gray-600 truncate max-w-[60px]">{item.title}</p>
                                                                <p className="text-[8px] text-gray-400">{item.count}回</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </FadeInView>
                        )}
                    </div>
                )}
            </main>

            {/* ── 日付詳細モーダル（フルスクリーンシート） ── */}
            <AnimatePresence>
                {selectedDay && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md" onClick={() => setSelectedDay(null)}>
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[32px] bg-white/90 backdrop-blur-2xl border-t border-white/60 shadow-[0_-20px_80px_-10px_rgba(80,60,160,0.15)]"
                            onClick={e => e.stopPropagation()}>

                            {/* ドラッグハンドル */}
                            <div className="sticky top-0 z-10 pt-3 pb-2 bg-white/90 backdrop-blur-xl rounded-t-[32px]">
                                <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto" />
                            </div>

                            <div className="px-5 pb-8 max-w-lg mx-auto">
                                {/* ヘッダー */}
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-800 tracking-tight">
                                            {new Date(selectedDay.date).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
                                        </h3>
                                        {selectedDay.events.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {selectedDay.events.map(e => (
                                                    <span key={e.id} className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50/80 border border-violet-200/50 rounded-full px-2 py-0.5 backdrop-blur-sm">
                                                        {EVENT_ICONS[e.event_type] ?? "📌"} {e.event_name || e.event_type}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {(selectedDay.weather_daily || selectedDay.outfit?.weather_input) && (
                                        <div className="text-right shrink-0">
                                            <span className="text-4xl">
                                                {selectedDay.weather_daily ? DAILY_WEATHER_ICONS[selectedDay.weather_daily.weather_icon] ?? "🌤️"
                                                    : WEATHER_ICONS[selectedDay.outfit!.weather_input!.condition] ?? "🌤️"}
                                            </span>
                                            <p className="text-sm font-bold text-gray-700 mt-0.5">
                                                {selectedDay.weather_daily ? `${selectedDay.weather_daily.temp_min ?? "-"}°/${selectedDay.weather_daily.temp_max ?? "-"}°`
                                                    : `${selectedDay.outfit!.weather_input!.temp}°C`}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* タブ切り替え */}
                                <div className="flex items-center gap-1.5 mb-5 bg-gray-100/60 rounded-2xl p-1 backdrop-blur-sm">
                                    <button onClick={() => setDetailView("coordinate")}
                                        className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                            detailView === "coordinate" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                                        }`}>コーデ</button>
                                    <button onClick={() => setDetailView("schedule")}
                                        className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                            detailView === "schedule" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                                        }`}>予定</button>
                                </div>

                                {detailView === "coordinate" ? (
                                    <>
                                        {selectedDay.weather_daily?.outfit_tag === "rain" && (
                                            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50/80 border border-blue-200/40 px-3 py-1 text-[10px] font-bold text-blue-500 backdrop-blur-sm">
                                                ☔ 雨コーデ推奨
                                            </div>
                                        )}

                                        {/* AI生成コーデ表示 */}
                                        {selectedDay.outfit && selectedDay.outfit.outfit_items.length > 0 && (
                                            <div className="mb-4 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/40 p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[9px] font-bold tracking-widest text-violet-500 uppercase">AI Coordinate</span>
                                                    {selectedDay.outfit.is_worn && (
                                                        <span className="text-[8px] font-bold text-emerald-500 bg-emerald-50/80 rounded-full px-2 py-0.5 border border-emerald-200/30">確定済み</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-1">
                                                    {selectedDay.outfit.outfit_items.map((item, i) => (
                                                        <div key={i} className="shrink-0 w-16 text-center">
                                                            <div className="w-16 h-16 rounded-xl bg-white/60 border border-white/50 overflow-hidden shadow-sm mb-1 flex items-center justify-center">
                                                                {item.image_url ? (
                                                                    <Image src={item.image_url} alt={item.title} width={64} height={64} className="w-full h-full object-contain p-1" loader={passthroughLoader} unoptimized />
                                                                ) : (
                                                                    <span className="text-lg text-gray-300">👕</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[7px] text-gray-500 truncate">{item.title}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {selectedDay.outfit.style_notes && (
                                                    <p className="mt-2 text-[10px] text-gray-500 bg-gray-50/50 rounded-lg px-2.5 py-1.5 leading-relaxed">{selectedDay.outfit.style_notes}</p>
                                                )}
                                            </div>
                                        )}

                                        {/* ── 仮想空間コーデショーケース ── */}
                                        {wardrobeItems.length === 0 ? (
                                            <div className="rounded-3xl bg-gradient-to-b from-gray-50/50 to-gray-100/30 border border-gray-200/40 p-8 text-center backdrop-blur-sm">
                                                <p className="text-6xl mb-3">👗</p>
                                                <p className="text-sm text-gray-500 mb-3">ワードローブを登録してコーデを始めましょう</p>
                                                <Link href="/my-style" className="inline-block rounded-full bg-gray-800 text-white px-5 py-2 text-xs font-bold hover:bg-gray-700 transition no-underline">
                                                    My Styleへ
                                                </Link>
                                            </div>
                                        ) : (
                                            <VirtualSpaceShowcase
                                                slotCards={slotCards}
                                                onSlotNext={handleSlotNext}
                                                onSlotPrev={handleSlotPrev}
                                                onReplaceAll={handleReplaceAll}
                                                onSave={handleSaveWardrobeOutfit}
                                                goodPulse={goodPulse}
                                            />
                                        )}
                                    </>
                                ) : (
                                    /* ── 予定タブ ── */
                                    <div className="space-y-3">
                                        {selectedDay.events.length > 0 && (
                                            <div className="space-y-2">
                                                {selectedDay.events.map(e => (
                                                    <div key={e.id} className="flex items-center justify-between rounded-2xl bg-white/60 border border-white/50 backdrop-blur-sm p-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="text-lg">{EVENT_ICONS[e.event_type] ?? "📌"}</span>
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-700">{e.event_name || e.event_type}</p>
                                                                <p className="text-[10px] text-gray-400">{e.event_type}</p>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => handleDeleteEvent(e.id)} className="w-7 h-7 rounded-full bg-red-50 text-red-400 hover:bg-red-100 text-xs flex items-center justify-center transition">×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {selectedDay.events.length === 0 && <p className="text-xs text-gray-400 text-center py-4">予定はまだありません</p>}

                                        <div className="rounded-2xl bg-gray-50/50 border border-gray-200/40 backdrop-blur-sm p-4">
                                            <p className="text-xs font-bold text-gray-600 mb-3">予定を追加</p>
                                            <div className="flex gap-2 mb-2">
                                                <select value={eventType} onChange={(e) => setEventType(e.target.value)}
                                                    className="flex-1 rounded-xl bg-white/80 border border-gray-200/50 px-3 py-2 text-xs text-gray-600">
                                                    <option value="work">仕事</option><option value="meeting">ミーティング</option>
                                                    <option value="date">デート</option><option value="party">パーティ</option>
                                                    <option value="casual">カジュアル</option><option value="outdoor">アウトドア</option>
                                                    <option value="sports">スポーツ</option><option value="travel">旅行</option>
                                                </select>
                                                <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="予定名"
                                                    className="flex-[1.4] rounded-xl bg-white/80 border border-gray-200/50 px-3 py-2 text-xs text-gray-700" />
                                            </div>
                                            <select value={eventOfficeCode} onChange={(e) => setEventOfficeCode(e.target.value)} disabled={officeLoading}
                                                className="w-full rounded-xl bg-white/80 border border-gray-200/50 px-3 py-2 text-[10px] text-gray-500 mb-2">
                                                <option value="">{baseOfficeLabel ? `いつもの地域（${baseOfficeLabel}）` : "いつもの地域"}</option>
                                                {officeOptions.map(opt => <option key={opt.code} value={opt.code}>{opt.name}</option>)}
                                            </select>
                                            <button onClick={handleAddEvent} disabled={eventSaving}
                                                className="w-full rounded-xl bg-gray-800 text-white px-4 py-2.5 text-xs font-bold hover:bg-gray-700 disabled:opacity-40 transition">
                                                {eventSaving ? "追加中..." : "追加する"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <FloatingNavLight items={NAV_ITEMS} activeHref="/calendar" />
        </LightBackground>
    );
}

/* ════════════════════════════════════════════════════
   仮想空間コーデショーケース
   - メインアイテムを大きく表示
   - 前後にスタンバイアイテムを透明度付きで配置
   - 奥行き感のあるステージ演出
   ════════════════════════════════════════════════════ */
function VirtualSpaceShowcase({
    slotCards,
    onSlotNext,
    onSlotPrev,
    onReplaceAll,
    onSave,
    goodPulse,
}: {
    slotCards: Array<{
        key: CalendarSlotKey; label: string; placeholder: string;
        item: LocalWardrobeItem | null; prevItem: LocalWardrobeItem | null; nextItem: LocalWardrobeItem | null; poolLength: number;
    }>;
    onSlotNext: (slot: CalendarSlotKey) => void;
    onSlotPrev: (slot: CalendarSlotKey) => void;
    onReplaceAll: () => void;
    onSave: () => void;
    goodPulse: boolean;
}) {
    return (
        <div className="relative">
            {/* ── アクションバー ── */}
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-gray-400 font-medium tracking-wide">VIRTUAL FITTING ROOM</p>
                <div className="flex items-center gap-2">
                    <motion.button onClick={onReplaceAll}
                        className="h-8 px-3 rounded-full bg-white/50 border border-white/60 backdrop-blur-sm text-[10px] font-bold text-gray-500 hover:bg-white/80 transition flex items-center gap-1.5"
                        whileTap={{ scale: 0.93 }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        全入替
                    </motion.button>
                    <motion.button onClick={onSave}
                        className="h-8 px-4 rounded-full bg-gradient-to-r from-emerald-400/90 to-teal-500/90 text-white text-[10px] font-bold shadow-lg shadow-emerald-500/20 border border-white/20 flex items-center gap-1.5"
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        確定
                    </motion.button>
                </div>
            </div>

            {/* ── ステージ ── */}
            <div className="relative rounded-[32px] overflow-hidden">
                {/* 背景グラデーション */}
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-white/20 to-slate-100/60" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.04)_0%,transparent_70%)]" />
                {/* ステージ上の光源 */}
                <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-24 bg-gradient-to-b from-white/60 to-transparent blur-2xl" />
                {/* 床面反射 */}
                <div className="pointer-events-none absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-slate-200/30 to-transparent" />
                <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-6 rounded-full bg-slate-300/20 blur-xl" />

                {/* スロットカード */}
                <div className="relative py-4 px-3 space-y-1">
                    {slotCards.map((slot, idx) => (
                        <ShowcaseSlot
                            key={slot.key}
                            slot={slot}
                            index={idx}
                            total={slotCards.length}
                            onNext={() => onSlotNext(slot.key)}
                            onPrev={() => onSlotPrev(slot.key)}
                        />
                    ))}
                </div>
            </div>

            {/* Good Making! リッチアニメーション */}
            <AnimatePresence>
                {goodPulse && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
                        {/* Confetti パーティクル */}
                        {Array.from({ length: 20 }).map((_, i) => {
                            const hue = (i * 37) % 360;
                            const xDir = ((i % 5) - 2) * 60 + ((i * 13) % 40 - 20);
                            const size = 4 + (i % 3) * 2;
                            return (
                                <motion.div key={i}
                                    initial={{ opacity: 1, y: 0, x: 0, rotate: 0, scale: 1 }}
                                    animate={{ opacity: 0, y: -120 - (i % 4) * 40, x: xDir, rotate: (i % 2 === 0 ? 1 : -1) * 360, scale: 0.5 }}
                                    transition={{ duration: 1 + (i % 3) * 0.2, ease: "easeOut", delay: (i % 6) * 0.04 }}
                                    className="absolute rounded-sm"
                                    style={{ width: size, height: size, backgroundColor: `hsl(${hue}, 70%, 60%)`, top: "55%", left: `${35 + (i % 6) * 5}%` }}
                                />
                            );
                        })}
                        {/* ラベル */}
                        <motion.div initial={{ scale: 0.5, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ type: "spring", damping: 12, stiffness: 200 }}
                            className="relative">
                            <div className="rounded-2xl bg-gradient-to-r from-emerald-500/95 to-teal-500/95 backdrop-blur-sm text-white px-6 py-3 text-sm font-black shadow-2xl shadow-emerald-500/30 border border-white/20">
                                Good Making!
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── ショーケーススロット（depth付き） ── */
function ShowcaseSlot({
    slot,
    index,
    total,
    onNext,
    onPrev,
}: {
    slot: {
        key: CalendarSlotKey; label: string; placeholder: string;
        item: LocalWardrobeItem | null; prevItem: LocalWardrobeItem | null; nextItem: LocalWardrobeItem | null; poolLength: number;
    };
    index: number;
    total: number;
    onNext: () => void;
    onPrev: () => void;
}) {
    const [dragX, setDragX] = React.useState(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const dragState = React.useRef<{ active: boolean; pointerId: number | null; startX: number; startY: number; dx: number; dy: number }>({
        active: false, pointerId: null, startX: 0, startY: 0, dx: 0, dy: 0,
    });
    const canSwipe = slot.poolLength > 1;

    const applySwipe = React.useCallback((dx: number, dy: number) => {
        if (!canSwipe || Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return false;
        if (dx < 0) { onNext(); return true; }
        if (dx > 0) { onPrev(); return true; }
        return false;
    }, [canSwipe, onNext, onPrev]);

    const endDrag = React.useCallback((trigger: boolean) => {
        if (trigger) applySwipe(dragState.current.dx, dragState.current.dy);
        dragState.current = { active: false, pointerId: null, startX: 0, startY: 0, dx: 0, dy: 0 };
        setIsDragging(false); setDragX(0);
    }, [applySwipe]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!canSwipe) return;
        dragState.current = { active: true, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 };
        setIsDragging(true); setDragX(0);
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current.active || (dragState.current.pointerId !== null && dragState.current.pointerId !== e.pointerId)) return;
        dragState.current.dx = e.clientX - dragState.current.startX;
        dragState.current.dy = e.clientY - dragState.current.startY;
        setDragX(dragState.current.dx);
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current.active || (dragState.current.pointerId !== null && dragState.current.pointerId !== e.pointerId)) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        endDrag(true);
    };

    // メインアイテムの高さ（トップスとボトムを大きく）
    const heightClass = slot.key === "top" ? "h-40 sm:h-48" : slot.key === "pants" ? "h-36 sm:h-44" : slot.key === "hat" ? "h-24 sm:h-28" : "h-24 sm:h-28";

    return (
        <div className="relative">
            {/* スロットラベル */}
            <div className="flex items-center gap-2 mb-1 ml-2">
                <span className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase">{slot.label}</span>
                {canSwipe && <span className="text-[8px] text-gray-300">← swipe →</span>}
            </div>

            {/* 3カードレイアウト: 前後スタンバイ + メイン */}
            <div className="relative flex items-center justify-center">
                {/* 後ろ左スタンバイ */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-0 w-[22%] pointer-events-none" style={{ perspective: "600px" }}>
                    <motion.div initial={false} animate={{ opacity: 0.35, scale: 0.82, rotateY: 12 }}
                        className="rounded-2xl overflow-hidden bg-white/30 border border-white/30 backdrop-blur-md shadow-sm"
                        style={{ transformStyle: "preserve-3d" }}>
                        <div className={`${slot.key === "top" || slot.key === "pants" ? "h-28 sm:h-36" : "h-16 sm:h-20"} flex items-center justify-center`}>
                            {slot.prevItem?.imageUrl ? (
                                <Image src={slot.prevItem.imageUrl} alt={slot.prevItem.name} width={200} height={300}
                                    className="h-full w-full object-contain opacity-60" loader={passthroughLoader} unoptimized />
                            ) : (
                                <span className="text-xl text-gray-300">{slot.placeholder}</span>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* 後ろ右スタンバイ */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-0 w-[22%] pointer-events-none" style={{ perspective: "600px" }}>
                    <motion.div initial={false} animate={{ opacity: 0.35, scale: 0.82, rotateY: -12 }}
                        className="rounded-2xl overflow-hidden bg-white/30 border border-white/30 backdrop-blur-md shadow-sm"
                        style={{ transformStyle: "preserve-3d" }}>
                        <div className={`${slot.key === "top" || slot.key === "pants" ? "h-28 sm:h-36" : "h-16 sm:h-20"} flex items-center justify-center`}>
                            {slot.nextItem?.imageUrl ? (
                                <Image src={slot.nextItem.imageUrl} alt={slot.nextItem.name} width={200} height={300}
                                    className="h-full w-full object-contain opacity-60" loader={passthroughLoader} unoptimized />
                            ) : (
                                <span className="text-xl text-gray-300">{slot.placeholder}</span>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* メインカード */}
                <div className="relative z-10 w-[60%] mx-auto">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${slot.key}-${slot.item?.id ?? "empty"}`}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={() => endDrag(false)}
                            onPointerLeave={() => { if (dragState.current.active) endDrag(false); }}
                            onKeyDown={(e) => { if (!canSwipe) return; if (e.key === "ArrowLeft") { e.preventDefault(); onPrev(); } if (e.key === "ArrowRight") { e.preventDefault(); onNext(); } }}
                            tabIndex={canSwipe ? 0 : -1}
                            className={`relative rounded-3xl overflow-hidden border shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)] ${
                                slot.item ? "border-white/60 bg-white/70 backdrop-blur-xl" : "border-dashed border-white/40 bg-white/30 backdrop-blur-sm"
                            } ${canSwipe ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                            style={{ transform: `translateX(${dragX * 0.5}px)`, transition: isDragging ? "none" : "transform 250ms cubic-bezier(.4,0,.2,1)", touchAction: "pan-y" }}>

                            {/* 内部光彩 */}
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-transparent" />

                            {/* ナビ矢印 */}
                            {canSwipe && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); onPrev(); }}
                                        className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/60 backdrop-blur-sm border border-white/50 text-gray-400 shadow-sm hover:bg-white/90 transition flex items-center justify-center text-xs">
                                        ‹
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onNext(); }}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/60 backdrop-blur-sm border border-white/50 text-gray-400 shadow-sm hover:bg-white/90 transition flex items-center justify-center text-xs">
                                        ›
                                    </button>
                                </>
                            )}

                            <div className={`w-full ${heightClass} flex items-center justify-center p-2`}>
                                {slot.item?.imageUrl ? (
                                    <Image src={slot.item.imageUrl} alt={slot.item.name} width={720} height={400}
                                        className="h-full w-full object-contain drop-shadow-lg" loader={passthroughLoader} unoptimized />
                                ) : (
                                    <span className="text-4xl opacity-30">{slot.placeholder}</span>
                                )}
                            </div>

                            {/* アイテム名 */}
                            {slot.item && (
                                <div className="absolute bottom-2 left-0 right-0 text-center">
                                    <span className="inline-block rounded-full bg-black/5 backdrop-blur-sm px-3 py-0.5 text-[9px] font-semibold text-gray-500 truncate max-w-[80%]">
                                        {slot.item.name}
                                    </span>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

/* ── 日付セル（プレミアムデザイン） ── */
function DayCell({ day, isToday, onClick }: { day: DayData; isToday: boolean; onClick: () => void }) {
    const dayNum = parseInt(day.date.split("-")[2], 10);
    const hasOutfit = !!day.outfit?.is_worn;
    const hasEvent = day.events.length > 0;
    const daily = day.weather_daily ?? null;
    const weatherEmoji = daily ? DAILY_WEATHER_ICONS[daily.weather_icon] ?? "🌤️"
        : day.outfit?.weather_input ? WEATHER_ICONS[day.outfit.weather_input.condition] ?? "🌤️" : null;
    const tempLabel = daily && (daily.temp_min != null || daily.temp_max != null)
        ? `${daily.temp_min ?? "-"}°/${daily.temp_max ?? "-"}°` : null;
    const isRainOutfit = daily?.outfit_tag === "rain";
    const isSunday = day.dayOfWeek === 0;
    const isSaturday = day.dayOfWeek === 6;

    return (
        <motion.button onClick={onClick}
            className={`relative w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                isToday
                    ? "bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border-[1.5px] border-violet-400/60 shadow-sm shadow-violet-500/10"
                    : hasOutfit
                    ? "bg-white/60 backdrop-blur-sm border border-white/70 shadow-sm hover:bg-white/80"
                    : "bg-white/25 backdrop-blur-sm border border-white/30 hover:bg-white/50"
            }`}
            whileHover={{ scale: 1.06, y: -2 }} whileTap={{ scale: 0.94 }}>

            <span className={`text-[13px] font-bold leading-none ${
                isToday ? "text-violet-600" : isSunday ? "text-rose-400" : isSaturday ? "text-blue-400" : "text-gray-600"
            }`}>{dayNum}</span>

            {weatherEmoji && <span className="text-[11px] leading-none">{weatherEmoji}</span>}
            {tempLabel && <span className="text-[7px] text-gray-400 leading-none">{tempLabel}</span>}

            {/* アウトフィットサムネイル */}
            {hasOutfit && day.outfit!.outfit_items.length > 0 && (
                <div className="flex -space-x-1.5 mt-0.5">
                    {day.outfit!.outfit_items.slice(0, 3).map((item, i) => (
                        <div key={i} className="w-3.5 h-3.5 rounded-full bg-gray-100 border border-white overflow-hidden shadow-sm">
                            {item.image_url && (
                                <Image src={item.image_url} alt="" width={14} height={14} className="w-full h-full object-cover" loader={passthroughLoader} unoptimized />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* バッジ */}
            {day.outfit?.is_worn && (
                <div className="absolute -bottom-0.5 -right-0.5 text-[8px] bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-sm">✓</div>
            )}
            {hasEvent && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-pink-400 rounded-full" />}
            {isRainOutfit && <div className="absolute bottom-0.5 left-0.5 text-[7px]">☔</div>}
        </motion.button>
    );
}
