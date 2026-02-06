// app/calendar/CalendarPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface OutfitItem {
    card_id: string;
    category: string;
    image_url: string;
    title: string;
    reason: string;
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
    events: { id: string; event_type: string; event_name: string }[];
}

interface CalendarData {
    year: number;
    month: number;
    days: DayData[];
    totalOutfits: number;
}

const WEATHER_ICONS: Record<string, string> = {
    sunny: "☀️",
    cloudy: "☁️",
    rainy: "🌧️",
    snowy: "❄️",
    windy: "💨",
};

const EVENT_ICONS: Record<string, string> = {
    work: "💼",
    meeting: "👔",
    date: "💕",
    party: "🎉",
    casual: "😎",
    outdoor: "🏕️",
    sports: "🏃",
    travel: "✈️",
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function CalendarPageClient() {
    const today = new Date();
    const [currentYear, setCurrentYear] = React.useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = React.useState(today.getMonth() + 1);
    const [calendarData, setCalendarData] = React.useState<CalendarData | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [generating, setGenerating] = React.useState(false);
    const [selectedDay, setSelectedDay] = React.useState<DayData | null>(null);
    const [weatherInput, setWeatherInput] = React.useState({ temp: 20, condition: "sunny" });

    // カレンダーデータ取得
    const fetchCalendar = async () => {
        try {
            const res = await fetch(`/api/calendar/month?year=${currentYear}&month=${currentMonth}`);
            const data = await res.json();
            setCalendarData(data);
        } catch (err) {
            console.error("Failed to fetch calendar:", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        setLoading(true);
        fetchCalendar();
    }, [currentYear, currentMonth]);

    // 1ヶ月分生成
    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const res = await fetch("/api/calendar/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year: currentYear, month: currentMonth }),
            });
            if (res.ok) {
                await fetchCalendar();
            }
        } catch (err) {
            console.error("Failed to generate:", err);
        } finally {
            setGenerating(false);
        }
    };

    // 特定日を再生成
    const handleRegenerate = async (date: string) => {
        try {
            const res = await fetch("/api/calendar/regenerate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, weather: weatherInput }),
            });
            if (res.ok) {
                await fetchCalendar();
                setSelectedDay(null);
            }
        } catch (err) {
            console.error("Failed to regenerate:", err);
        }
    };

    // 月移動
    const goToPrevMonth = () => {
        if (currentMonth === 1) {
            setCurrentYear(y => y - 1);
            setCurrentMonth(12);
        } else {
            setCurrentMonth(m => m - 1);
        }
    };

    const goToNextMonth = () => {
        if (currentMonth === 12) {
            setCurrentYear(y => y + 1);
            setCurrentMonth(1);
        } else {
            setCurrentMonth(m => m + 1);
        }
    };

    // カレンダーグリッド生成
    const generateCalendarGrid = () => {
        const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const grid: (DayData | null)[] = [];

        // 前月の空白
        for (let i = 0; i < firstDay; i++) {
            grid.push(null);
        }

        // 当月の日付
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayData = calendarData?.days.find(d => d.date === dateStr);
            grid.push(dayData ?? { date: dateStr, dayOfWeek: new Date(dateStr).getDay(), outfit: null, events: [] });
        }

        return grid;
    };

    const isToday = (date: string) => {
        return date === today.toISOString().split("T")[0];
    };

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                                <span className="text-2xl">📅</span>
                                AIコーデカレンダー
                            </h1>
                            <p className="text-xs text-gray-400">天気・予定に合わせた1ヶ月コーデ</p>
                        </div>
                    </div>
                    <motion.button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-medium disabled:opacity-50 shadow-lg shadow-violet-500/25"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {generating ? "生成中..." : "1ヶ月分生成"}
                    </motion.button>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-6xl mx-auto px-4 py-8 pb-32">
                {/* 月ナビゲーション */}
                <FadeInView>
                    <div className="flex items-center justify-center gap-6 mb-8">
                        <motion.button
                            onClick={goToPrevMonth}
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </motion.button>
                        <h2 className="text-2xl font-bold text-gray-800">
                            {currentYear}年 {currentMonth}月
                        </h2>
                        <motion.button
                            onClick={goToNextMonth}
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </motion.button>
                    </div>
                </FadeInView>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-[50vh]">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-500"
                        />
                        <p className="mt-4 text-gray-500">カレンダーを読み込み中...</p>
                    </div>
                ) : (
                    <>
                        {/* 曜日ヘッダー */}
                        <FadeInView delay={0.1}>
                            <div className="grid grid-cols-7 gap-2 mb-2">
                                {WEEKDAYS.map((day, i) => (
                                    <div
                                        key={day}
                                        className={`text-center text-sm font-medium py-2 ${
                                            i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-gray-500"
                                        }`}
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>
                        </FadeInView>

                        {/* カレンダーグリッド */}
                        <FadeInView delay={0.2}>
                            <div className="grid grid-cols-7 gap-2">
                                {generateCalendarGrid().map((day, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: i * 0.01 }}
                                    >
                                        {day ? (
                                            <DayCell
                                                day={day}
                                                isToday={isToday(day.date)}
                                                onClick={() => setSelectedDay(day)}
                                            />
                                        ) : (
                                            <div className="aspect-square" />
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </FadeInView>

                        {/* 統計 */}
                        <FadeInView delay={0.3}>
                            <div className="mt-8 grid grid-cols-3 gap-4">
                                {[
                                    { label: "生成済み", value: calendarData?.totalOutfits ?? 0, icon: "👕" },
                                    { label: "今月の日数", value: calendarData?.days.length ?? 0, icon: "📅" },
                                    { label: "イベント数", value: calendarData?.days.reduce((sum, d) => sum + d.events.length, 0) ?? 0, icon: "🎉" },
                                ].map((stat, i) => (
                                    <GlassCard key={stat.label} className="p-4 text-center">
                                        <span className="text-2xl mb-2 block">{stat.icon}</span>
                                        <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                                        <p className="text-xs text-gray-400">{stat.label}</p>
                                    </GlassCard>
                                ))}
                            </div>
                        </FadeInView>
                    </>
                )}
            </main>

            {/* 日付詳細モーダル */}
            <AnimatePresence>
                {selectedDay && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
                        onClick={() => setSelectedDay(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 max-w-lg w-full border border-white/80 shadow-2xl max-h-[80vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* ヘッダー */}
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800">
                                        {new Date(selectedDay.date).toLocaleDateString("ja-JP", {
                                            month: "long",
                                            day: "numeric",
                                            weekday: "short",
                                        })}
                                    </h3>
                                    {selectedDay.events.length > 0 && (
                                        <div className="flex gap-2 mt-1">
                                            {selectedDay.events.map(e => (
                                                <span key={e.id} className="text-sm text-violet-500">
                                                    {EVENT_ICONS[e.event_type] ?? "📌"} {e.event_name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {selectedDay.outfit?.weather_input && (
                                    <div className="text-right">
                                        <span className="text-3xl">
                                            {WEATHER_ICONS[selectedDay.outfit.weather_input.condition] ?? "🌤️"}
                                        </span>
                                        <p className="text-lg font-bold text-gray-800">
                                            {selectedDay.outfit.weather_input.temp}°C
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* コーデ */}
                            {selectedDay.outfit ? (
                                <>
                                    <h4 className="font-medium mb-3 text-gray-700">💡 おすすめコーデ</h4>
                                    <div className="grid grid-cols-3 gap-3 mb-4">
                                        {selectedDay.outfit.outfit_items.map((item, i) => (
                                            <div key={i} className="rounded-xl overflow-hidden bg-gray-100">
                                                {item.image_url ? (
                                                    <img
                                                        src={item.image_url}
                                                        alt={item.title}
                                                        className="w-full aspect-square object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full aspect-square bg-gray-200 flex items-center justify-center text-3xl">
                                                        👕
                                                    </div>
                                                )}
                                                <div className="p-2">
                                                    <p className="text-xs text-gray-500 line-clamp-1">
                                                        {item.reason}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {selectedDay.outfit.style_notes && (
                                        <p className="text-sm text-gray-600 bg-gray-100 rounded-lg p-3 mb-4">
                                            📝 {selectedDay.outfit.style_notes}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <span className="text-4xl mb-4 block">👕</span>
                                    <p className="text-gray-500">コーデが未生成です</p>
                                </div>
                            )}

                            {/* 天気入力 */}
                            <div className="border-t border-gray-200 pt-4 mt-4">
                                <h4 className="font-medium mb-3 text-gray-700">🌤️ 天気を設定して再生成</h4>
                                <div className="flex gap-4 mb-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 block mb-1">気温</label>
                                        <input
                                            type="number"
                                            value={weatherInput.temp}
                                            onChange={e => setWeatherInput(w => ({ ...w, temp: parseInt(e.target.value) || 20 }))}
                                            className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-violet-400"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 block mb-1">天気</label>
                                        <select
                                            value={weatherInput.condition}
                                            onChange={e => setWeatherInput(w => ({ ...w, condition: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-violet-400"
                                        >
                                            <option value="sunny">☀️ 晴れ</option>
                                            <option value="cloudy">☁️ 曇り</option>
                                            <option value="rainy">🌧️ 雨</option>
                                            <option value="snowy">❄️ 雪</option>
                                        </select>
                                    </div>
                                </div>
                                <motion.button
                                    onClick={() => handleRegenerate(selectedDay.date)}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-medium shadow-lg shadow-violet-500/25"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    この日のコーデを再生成
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* フローティングナビ */}
            <FloatingNavLight items={NAV_ITEMS} activeHref="/calendar" />
        </LightBackground>
    );
}

// 日付セルコンポーネント
function DayCell({
    day,
    isToday,
    onClick,
}: {
    day: DayData;
    isToday: boolean;
    onClick: () => void;
}) {
    const dayNum = parseInt(day.date.split("-")[2], 10);
    const hasOutfit = !!day.outfit;
    const hasEvent = day.events.length > 0;

    return (
        <motion.button
            onClick={onClick}
            className={`aspect-square rounded-xl p-2 flex flex-col items-center justify-center relative transition-all ${
                isToday
                    ? "bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-400"
                    : hasOutfit
                    ? "bg-white/70 backdrop-blur-sm border border-white/80 hover:bg-white/90 shadow-sm"
                    : "bg-white/40 backdrop-blur-sm border border-white/60 hover:bg-white/60"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        >
            <span className={`text-sm font-medium ${isToday ? "text-violet-600" : "text-gray-700"}`}>
                {dayNum}
            </span>

            {day.outfit?.weather_input && (
                <span className="text-xs mt-0.5">
                    {WEATHER_ICONS[day.outfit.weather_input.condition] ?? "🌤️"}
                </span>
            )}

            {hasOutfit && day.outfit!.outfit_items.length > 0 && (
                <div className="flex -space-x-1 mt-1">
                    {day.outfit!.outfit_items.slice(0, 3).map((item, i) => (
                        <div
                            key={i}
                            className="w-4 h-4 rounded-full bg-gray-200 border border-white overflow-hidden shadow-sm"
                        >
                            {item.image_url && (
                                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {hasEvent && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-pink-500 rounded-full" />
            )}
        </motion.button>
    );
}
