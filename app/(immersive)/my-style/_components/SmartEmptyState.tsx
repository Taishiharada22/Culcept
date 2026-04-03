"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    fetchWeather,
    getWeatherIcon,
    getConditionLabel,
    WeatherOfflineError,
    type WeatherInfo,
} from "../_lib/weatherService";

/* ── Props ── */

interface SmartEmptyStateProps {
    onAddPhoto: () => void;
    onQuickAdd: () => void;
    onDemo?: () => void;
}

/* ── Main component ── */

export default function SmartEmptyState({ onAddPhoto, onQuickAdd, onDemo }: SmartEmptyStateProps) {
    const [weather, setWeather] = useState<WeatherInfo | null>(null);
    const [weatherLoading, setWeatherLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await fetchWeather();
                if (!cancelled) setWeather(result.weather);
            } catch {
                // weather unavailable — still show empty state without weather
            } finally {
                if (!cancelled) setWeatherLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-5"
        >
            {/* Weather context — show even before wardrobe exists */}
            {weatherLoading ? (
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-slate-200" />
                    <div className="space-y-1.5 flex-1">
                        <div className="h-4 w-20 rounded bg-slate-200" />
                        <div className="h-3 w-32 rounded bg-slate-200" />
                    </div>
                </div>
            ) : weather ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/80 p-4">
                    <span className="text-2xl">{getWeatherIcon(weather.condition)}</span>
                    <div>
                        <p className="text-[16px] font-black text-slate-900">{weather.temp}° {getConditionLabel(weather.condition)}</p>
                        <p className="text-[12px] text-slate-500">服を登録すると、この天気に合う提案が届きます</p>
                    </div>
                </div>
            ) : null}

            {/* Value proposition */}
            <div className="text-center space-y-3 py-2">
                <h3 className="text-[17px] font-black text-slate-900">
                    今日、何を着よう？
                </h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">
                    1着登録するだけで、天気に合わせた<br />コーデ提案が始まります
                </p>
            </div>

            {/* Proposal placeholder — shows what will appear */}
            <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50/50 p-4">
                <div className="flex gap-2 justify-center">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="w-14 h-14 rounded-lg bg-slate-200/60 flex items-center justify-center">
                            <span className="text-slate-400 text-[18px]">{i === 1 ? "👕" : i === 2 ? "👖" : "👟"}</span>
                        </div>
                    ))}
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-400">
                    ここに今日の提案が表示されます
                </p>
            </div>

            {/* Future value list */}
            <ul className="mx-auto max-w-xs space-y-1.5 text-left">
                {[
                    "天気×気分で毎朝のコーデを提案",
                    "着回し傾向が自動で見える",
                    "自分のスタイルDNAが浮かび上がる",
                ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                        {item}
                    </li>
                ))}
            </ul>

            {/* Action buttons */}
            <div className="space-y-2">
                <button
                    type="button"
                    onClick={onAddPhoto}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-[13px] font-bold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    写真で登録する
                </button>
                <button
                    type="button"
                    onClick={onQuickAdd}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                    テキストで登録する
                </button>
                {onDemo && (
                    <button
                        type="button"
                        onClick={onDemo}
                        className="w-full text-center text-[12px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2 decoration-slate-300 py-1"
                    >
                        デモデータで体験
                    </button>
                )}
            </div>
        </motion.div>
    );
}
