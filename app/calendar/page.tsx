// app/calendar/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DayPlan {
    date: string;
    weather: {
        temp: number;
        condition: "sunny" | "cloudy" | "rainy" | "snowy";
        humidity: number;
    };
    event?: string;
    outfit: {
        id: string;
        image_url: string;
        name: string;
        reason: string;
    }[];
}

interface CalendarData {
    month: string;
    days: DayPlan[];
}

const WEATHER_ICONS: Record<string, string> = {
    sunny: "☀️",
    cloudy: "☁️",
    rainy: "🌧️",
    snowy: "❄️",
};

const WEATHER_BG: Record<string, string> = {
    sunny: "from-amber-100 to-orange-100",
    cloudy: "from-slate-100 to-gray-200",
    rainy: "from-blue-100 to-slate-200",
    snowy: "from-blue-50 to-white",
};

export default function CalendarPage() {
    const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(
        new Date().toISOString().split("T")[0]
    );
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

    useEffect(() => {
        const fetchCalendar = async () => {
            try {
                const res = await fetch("/api/calendar/outfits");
                const data = await res.json();
                setCalendarData(data);
            } catch (error) {
                console.error("Failed to fetch calendar:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchCalendar();
    }, []);

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // カレンダーの日付を生成
    const getDaysInMonth = () => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const days: (number | null)[] = [];

        // 前月の空白
        for (let i = 0; i < startingDay; i++) {
            days.push(null);
        }

        // 当月の日付
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    };

    const getDayPlan = (day: number): DayPlan | undefined => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return calendarData?.days.find((d) => d.date === dateStr);
    };

    const selectedDayPlan = calendarData?.days.find((d) => d.date === selectedDate);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-teal-50 to-white">
                <div className="text-center">
                    <div className="animate-spin text-5xl mb-4">📅</div>
                    <p className="text-slate-600">コーデを準備中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold">コーデカレンダー</h1>
                            <p className="text-sm text-slate-600">天気・予定に合わせて毎日提案</p>
                        </div>
                    </div>
                    <div className="flex bg-slate-100 rounded-xl p-1">
                        <button
                            onClick={() => setViewMode("calendar")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                viewMode === "calendar" ? "bg-white shadow" : ""
                            }`}
                        >
                            📅
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                viewMode === "list" ? "bg-white shadow" : ""
                            }`}
                        >
                            📋
                        </button>
                    </div>
                </div>

                {/* 月表示 */}
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold">
                        {currentYear}年 {currentMonth + 1}月
                    </h2>
                </div>

                {viewMode === "calendar" ? (
                    <>
                        {/* カレンダービュー */}
                        <div className="bg-white rounded-2xl shadow-sm border p-4 mb-6">
                            {/* 曜日ヘッダー */}
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {["日", "月", "火", "水", "木", "金", "土"].map((day, i) => (
                                    <div
                                        key={day}
                                        className={`text-center text-sm font-medium py-2 ${
                                            i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-600"
                                        }`}
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* 日付グリッド */}
                            <div className="grid grid-cols-7 gap-1">
                                {getDaysInMonth().map((day, i) => {
                                    if (day === null) {
                                        return <div key={`empty-${i}`} className="aspect-square" />;
                                    }

                                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const dayPlan = getDayPlan(day);
                                    const isToday = day === today.getDate();
                                    const isSelected = dateStr === selectedDate;
                                    const isPast = new Date(dateStr) < new Date(today.toISOString().split("T")[0]);

                                    return (
                                        <button
                                            key={day}
                                            onClick={() => setSelectedDate(dateStr)}
                                            className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${
                                                isSelected
                                                    ? "bg-teal-600 text-white"
                                                    : isToday
                                                    ? "bg-teal-100 text-teal-800"
                                                    : isPast
                                                    ? "bg-slate-50 text-slate-400"
                                                    : "bg-slate-50 hover:bg-slate-100"
                                            }`}
                                        >
                                            <span className={`text-sm font-medium ${isSelected ? "text-white" : ""}`}>
                                                {day}
                                            </span>
                                            {dayPlan && (
                                                <span className="text-xs mt-0.5">
                                                    {WEATHER_ICONS[dayPlan.weather.condition]}
                                                </span>
                                            )}
                                            {dayPlan?.event && (
                                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-pink-500 rounded-full" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 選択日の詳細 */}
                        {selectedDayPlan && (
                            <div className={`bg-gradient-to-r ${WEATHER_BG[selectedDayPlan.weather.condition]} rounded-2xl p-6 mb-6`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg">
                                            {new Date(selectedDate).toLocaleDateString("ja-JP", {
                                                month: "long",
                                                day: "numeric",
                                                weekday: "short",
                                            })}
                                        </h3>
                                        {selectedDayPlan.event && (
                                            <p className="text-sm text-pink-600 font-medium">
                                                📌 {selectedDayPlan.event}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl">
                                            {WEATHER_ICONS[selectedDayPlan.weather.condition]}
                                        </div>
                                        <div className="text-lg font-bold">
                                            {selectedDayPlan.weather.temp}°C
                                        </div>
                                    </div>
                                </div>

                                <h4 className="font-medium mb-3">💡 おすすめコーデ</h4>
                                <div className="grid grid-cols-3 gap-3">
                                    {selectedDayPlan.outfit.map((item, i) => (
                                        <Link
                                            key={i}
                                            href={`/drops/${item.id}`}
                                            className="bg-white rounded-xl overflow-hidden shadow-sm"
                                        >
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-full aspect-square object-cover"
                                            />
                                            <div className="p-2">
                                                <p className="text-xs text-slate-600 line-clamp-1">
                                                    {item.reason}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    /* リストビュー */
                    <div className="space-y-4">
                        {calendarData?.days
                            .filter((d) => new Date(d.date) >= today)
                            .slice(0, 7)
                            .map((dayPlan) => (
                                <div
                                    key={dayPlan.date}
                                    className={`bg-gradient-to-r ${WEATHER_BG[dayPlan.weather.condition]} rounded-2xl p-4`}
                                >
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="text-center">
                                            <div className="text-3xl">
                                                {WEATHER_ICONS[dayPlan.weather.condition]}
                                            </div>
                                            <div className="text-sm font-bold">{dayPlan.weather.temp}°C</div>
                                        </div>
                                        <div>
                                            <h3 className="font-bold">
                                                {new Date(dayPlan.date).toLocaleDateString("ja-JP", {
                                                    month: "short",
                                                    day: "numeric",
                                                    weekday: "short",
                                                })}
                                            </h3>
                                            {dayPlan.event && (
                                                <p className="text-sm text-pink-600">📌 {dayPlan.event}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {dayPlan.outfit.map((item, i) => (
                                            <Link
                                                key={i}
                                                href={`/drops/${item.id}`}
                                                className="flex-shrink-0 w-20"
                                            >
                                                <img
                                                    src={item.image_url}
                                                    alt={item.name}
                                                    className="w-20 h-20 object-cover rounded-xl"
                                                />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                )}

                {/* ヒント */}
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
                    <p className="text-sm text-teal-800">
                        💡 天気予報と予定を元に、AIが最適なコーデを毎日提案します
                    </p>
                </div>
            </div>
        </div>
    );
}
