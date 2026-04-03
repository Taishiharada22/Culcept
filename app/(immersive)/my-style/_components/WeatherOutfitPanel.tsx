"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { WardrobeItem } from "../_lib/types";
import {
    fetchWeather,
    getWeatherIcon,
    getConditionLabel,
    saveWeatherFeedback,
    buildManualWeather,
    weatherInfoToDaily,
    generatePracticalNotes,
    WeatherOfflineError,
    type WeatherInfo,
    type WeatherCondition,
    type WeatherFetchResult,
} from "../_lib/weatherService";
import { generateTodayProposal, type TodayProposal } from "@/lib/shared/outfitEngine";
import { saveWearEvent, updateWearSatisfaction, hasWearEventForDate, hasSatisfactionForDate } from "@/lib/shared/wearEvents";
import WearFeedbackButton from "./WearFeedbackButton";

/* ── Props ── */

interface WeatherOutfitPanelProps {
    wardrobeItems: WardrobeItem[];
}

/* ── Shared location helper ── */

import { fetchSharedLocation } from "@/lib/shared/location";

/* ── Collapsed advice section ── */

function AdviceSection({ title, content }: { title: string; content: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-t border-slate-100">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-2 text-left">
                <span className="text-[12px] font-bold text-slate-600">{title}</span>
                <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-slate-400">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </motion.span>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden pb-2 text-[12px] leading-relaxed text-slate-500">
                        {content}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Manual input (inline) ── */

const MANUAL_CONDITIONS: Array<{ value: WeatherCondition; label: string; icon: string }> = [
    { value: "sunny", label: "晴れ", icon: "☀️" },
    { value: "cloudy", label: "曇り", icon: "☁️" },
    { value: "rainy", label: "雨", icon: "🌧️" },
    { value: "snowy", label: "雪", icon: "🌨️" },
    { value: "windy", label: "風", icon: "💨" },
];

function ManualWeatherInput({ onSubmit }: { onSubmit: (weather: WeatherInfo) => void }) {
    const [temp, setTemp] = useState(20);
    const [condition, setCondition] = useState<WeatherCondition>("cloudy");

    return (
        <div className="space-y-3">
            <p className="text-[11px] font-bold text-amber-700">天気データを取得できません — 手動入力</p>
            <div className="flex items-center gap-3">
                <label className="text-[12px] font-bold text-slate-600">気温</label>
                <input type="range" min={-10} max={42} value={temp} onChange={(e) => setTemp(Number(e.target.value))} className="flex-1 accent-sky-500" />
                <span className="text-[13px] font-bold text-slate-800 w-10 text-right">{temp}°</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {MANUAL_CONDITIONS.map((c) => (
                    <button key={c.value} type="button" onClick={() => setCondition(c.value)}
                        className={cn("rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition",
                            condition === c.value ? "bg-sky-100 text-sky-800 ring-1 ring-sky-300" : "bg-slate-100 text-slate-600")}>
                        {c.icon} {c.label}
                    </button>
                ))}
            </div>
            <button type="button" onClick={() => onSubmit(buildManualWeather(temp, condition))}
                className="w-full rounded-lg bg-slate-900 py-2 text-[12px] font-bold text-white">
                この天気で提案を見る
            </button>
        </div>
    );
}

/* ── Main component ── */

export default function WeatherOutfitPanel({ wardrobeItems }: WeatherOutfitPanelProps) {
    const [loading, setLoading] = useState(true);
    const [weather, setWeather] = useState<WeatherInfo | null>(null);
    const [proposal, setProposal] = useState<TodayProposal | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showManualInput, setShowManualInput] = useState(false);
    const [weatherSource, setWeatherSource] = useState<WeatherFetchResult["source"] | null>(null);
    const [locationName, setLocationName] = useState<string | null>(null);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /* ── Wear acceptance state (via shared wearEvents helpers) ── */
    const [accepted, setAccepted] = useState(() => {
        const today = new Date().toISOString().slice(0, 10);
        return hasWearEventForDate(today);
    });
    const [satisfactionRecorded, setSatisfactionRecorded] = useState(() => {
        const today = new Date().toISOString().slice(0, 10);
        return hasSatisfactionForDate(today);
    });
    const [showSatisfaction, setShowSatisfaction] = useState(accepted && !satisfactionRecorded);

    // shared location から居住地名を取得
    useEffect(() => {
        fetchSharedLocation().then(loc => {
            if (loc?.prefecture) setLocationName(loc.prefecture);
        }).catch(() => {});
    }, []);

    const applyWeather = useCallback((weatherInfo: WeatherInfo, source: WeatherFetchResult["source"]) => {
        setWeather(weatherInfo);
        const daily = weatherInfoToDaily(weatherInfo);
        const todayStr = new Date().toISOString().slice(0, 10);
        const result = generateTodayProposal({
            wardrobe: wardrobeItems,
            date: todayStr,
            weather: daily,
        });
        setProposal(result);
        setWeatherSource(source);
        setShowManualInput(false);
        if (result) {
            try {
                navigator.sendBeacon("/api/stargazer/analytics", JSON.stringify({
                    event: "mystyle_proposal_shown",
                    feature: "my-style",
                    metadata: { item_count: result.main.items.length, sync_score: result.syncScore },
                }));
            } catch { /* ignore */ }
        }
    }, [wardrobeItems]);

    const loadWeather = useCallback(async () => {
        try {
            setLoading(true); setError(null); setShowManualInput(false);
            const result = await fetchWeather();
            applyWeather(result.weather, result.source);
            if (result.source === "stale_cache") {
                fetchWeather().then(({ weather: fresh, source: freshSource }) => { if (freshSource === "api") applyWeather(fresh, freshSource); }).catch(() => {});
            }
        } catch (err) {
            if (err instanceof WeatherOfflineError) setShowManualInput(true);
            else setError("天気情報の取得に失敗しました");
        } finally { setLoading(false); }
    }, [applyWeather]);

    useEffect(() => {
        loadWeather();
        refreshTimerRef.current = setInterval(loadWeather, 60 * 60 * 1000);
        return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }, [loadWeather]);

    const handleFeedback = useCallback((liked: boolean) => { saveWeatherFeedback(liked); }, []);

    if (loading) {
        return (
            <div className="animate-pulse rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-slate-200" />
                    <div className="h-5 w-24 rounded bg-slate-200" />
                </div>
                <div className="mt-3 flex gap-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-36 w-28 rounded-xl bg-slate-200" />)}
                </div>
            </div>
        );
    }

    if (error && !showManualInput) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[12px] text-amber-700">{error}</p>
                <div className="mt-2 flex gap-2">
                    <button type="button" onClick={loadWeather} className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 border border-amber-200">再試行</button>
                    <button type="button" onClick={() => { setError(null); setShowManualInput(true); }} className="text-[11px] text-amber-600 underline">手動入力</button>
                </div>
            </div>
        );
    }

    if (showManualInput) {
        return (
            <div className="rounded-xl border border-slate-200/60 bg-white/80 p-4">
                <ManualWeatherInput onSubmit={(w) => applyWeather(w, "manual")} />
            </div>
        );
    }

    if (!weather) return null;

    const icon = getWeatherIcon(weather.condition);
    const label = getConditionLabel(weather.condition);
    const practicalNotes = generatePracticalNotes(weather);
    const suggestedItems = proposal?.main.items ?? [];

    const handleAcceptProposal = () => {
        const t0 = performance.now();
        setAccepted(true);

        const today = new Date().toISOString().slice(0, 10);
        const itemIds = suggestedItems.map((i) => i.id);

        saveWearEvent({ date: today, itemIds, source: "my-style" });

        const syncMs = performance.now() - t0;
        console.log(`[WeatherOutfitPanel] accept sync: ${syncMs.toFixed(1)}ms`);
        requestAnimationFrame(() => {
            const paintMs = performance.now() - t0;
            console.log(`[WeatherOutfitPanel] accept paint: ${paintMs.toFixed(1)}ms`);
            try {
                navigator.sendBeacon("/api/stargazer/analytics", JSON.stringify({
                    event: "mystyle_proposal_accepted",
                    feature: "my-style",
                    metadata: { item_count: itemIds.length, response_ms: Math.round(paintMs) },
                }));
            } catch { /* ignore */ }
        });

        setTimeout(() => setShowSatisfaction(true), 600);
    };

    const handleSatisfaction = (rating: number) => {
        setSatisfactionRecorded(true);

        const today = new Date().toISOString().slice(0, 10);
        updateWearSatisfaction(today, rating);

        try {
            navigator.sendBeacon("/api/stargazer/analytics", JSON.stringify({
                event: "mystyle_satisfaction_recorded",
                feature: "my-style",
                metadata: { rating },
            }));
        } catch { /* ignore */ }
    };

    return (
        <div className="space-y-3">
            {/* Compact weather line */}
            <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="text-[20px] font-black text-slate-900">{weather.temp}°</span>
                <span className="text-[12px] font-bold text-slate-500">{label}</span>
                {locationName && <span className="text-[11px] text-slate-400 ml-auto">{locationName}</span>}
                {weatherSource === "stale_cache" && <span className="text-[10px] text-amber-500 ml-auto">キャッシュ</span>}
                <button type="button" onClick={() => { if (proposal) { try { navigator.sendBeacon("/api/stargazer/analytics", JSON.stringify({ event: "mystyle_proposal_rejected", feature: "my-style", metadata: { reason: "reload" } })); } catch { /* ignore */ } } loadWeather(); }} className="ml-auto text-slate-400 hover:text-slate-600">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </div>

            {/* Suggested items from shared engine */}
            {suggestedItems.length > 0 ? (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {suggestedItems.map((item) => (
                        <div key={item.id} className="shrink-0 w-16">
                            <div className="overflow-hidden rounded-lg border border-slate-200/50">
                                {item.imageUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={item.imageUrl} alt={item.name} className="w-full aspect-square object-cover" />
                                ) : (
                                    <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}>
                                        <span className="text-sm text-white/80">{item.category === "tops" ? "👕" : item.category === "bottoms" ? "👖" : item.category === "outerwear" ? "🧥" : item.category === "shoes" ? "👟" : "📦"}</span>
                                    </div>
                                )}
                            </div>
                            <p className="mt-0.5 truncate text-[9px] text-slate-500">{item.name}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50/50 p-4 text-center">
                    <p className="text-[13px] font-bold text-slate-600">
                        {wardrobeItems.length < 3
                            ? `あと${3 - wardrobeItems.length}着で提案可能`
                            : "今日の組み合わせが見つかりませんでした"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                        {wardrobeItems.length < 3
                            ? "トップス・ボトムスを登録すると提案が始まります"
                            : "別のカテゴリの服を追加すると提案の幅が広がります"}
                    </p>
                </div>
            )}

            {/* Accept proposal / Satisfaction */}
            {suggestedItems.length > 0 && (
                <WearFeedbackButton
                    accepted={accepted}
                    satisfactionRecorded={satisfactionRecorded}
                    showSatisfaction={showSatisfaction}
                    onAccept={handleAcceptProposal}
                    onSatisfaction={handleSatisfaction}
                />
            )}

            {/* Single practical note line */}
            {practicalNotes.length > 0 && (
                <p className="text-[10px] text-slate-400">{practicalNotes.join(" · ")}</p>
            )}
        </div>
    );
}
