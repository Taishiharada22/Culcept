"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GlassCard,
    GlassBadge,
    GlassButton,
    FadeInView,
    Skeleton,
} from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type { WardrobeItem } from "../_lib/types";
import {
    fetchWeather,
    suggestOutfitForWeather,
    getWeatherIcon,
    getConditionLabel,
    getTemperatureCategory,
    saveWeatherFeedback,
    buildManualWeather,
    WeatherOfflineError,
    type WeatherInfo,
    type WeatherCondition,
    type WeatherOutfitSuggestion,
    type WeatherFetchResult,
} from "../_lib/weatherOutfit";

/* ── Props ── */

interface WeatherOutfitPanelProps {
    wardrobeItems: WardrobeItem[];
}

/* ── Sub-components ── */

function WeatherHeader({ weather }: { weather: WeatherInfo }) {
    const icon = getWeatherIcon(weather.condition);
    const label = getConditionLabel(weather.condition);
    const tempCat = getTemperatureCategory(weather.temp);

    return (
        <div className="flex items-center gap-4">
            <motion.div
                className="text-4xl"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
                {icon}
            </motion.div>
            <div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">
                        {weather.temp}\u00B0C
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                        {label}
                    </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                    <GlassBadge variant="secondary" size="sm">
                        {tempCat.label}
                    </GlassBadge>
                    <span className="text-xs text-slate-400">
                        湿度 {weather.humidity}%
                    </span>
                </div>
            </div>
        </div>
    );
}

function SuggestedItemsScroll({
    items,
}: {
    items: WardrobeItem[];
}) {
    if (items.length === 0) {
        return (
            <p className="py-4 text-center text-sm text-slate-400">
                ワードローブにアイテムを追加すると、天気に合わせた提案ができます
            </p>
        );
    }

    return (
        <div className="mt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                おすすめアイテム
            </p>
            <div className="mt-2 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {items.map((item, idx) => (
                    <motion.div
                        key={item.id}
                        className="flex-none"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                    >
                        <div className="w-24 rounded-xl border border-slate-200/60 bg-white/80 p-2 text-center">
                            {item.imageUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="mx-auto h-16 w-16 rounded-lg object-cover"
                                />
                            ) : (
                                <div
                                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg"
                                    style={{
                                        backgroundColor: item.colorHex ?? "#e2e8f0",
                                    }}
                                >
                                    <span className="text-xs font-bold text-white/80">
                                        {item.category === "tops"
                                            ? "\u{1F455}"
                                            : item.category === "bottoms"
                                              ? "\u{1F456}"
                                              : item.category === "outerwear"
                                                ? "\u{1F9E5}"
                                                : item.category === "shoes"
                                                  ? "\u{1F45F}"
                                                  : "\u{1F4E6}"}
                                    </span>
                                </div>
                            )}
                            <p className="mt-1.5 truncate text-[11px] font-semibold text-slate-700">
                                {item.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                                {item.colorName ?? item.color}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

function AdviceSection({
    title,
    content,
    defaultOpen = false,
}: {
    title: string;
    content: string;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="border-t border-slate-200/40">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between py-3 text-left"
            >
                <span className="text-sm font-semibold text-slate-700">
                    {title}
                </span>
                <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-slate-400"
                >
                    <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </motion.span>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <p className="pb-3 text-sm leading-relaxed text-slate-500">
                            {content}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function FeedbackButtons({ onFeedback }: { onFeedback: (liked: boolean) => void }) {
    const [submitted, setSubmitted] = useState(false);

    const handle = (liked: boolean) => {
        onFeedback(liked);
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-xs text-slate-400"
            >
                フィードバックありがとうございます
            </motion.p>
        );
    }

    return (
        <div className="flex items-center justify-center gap-3 pt-2">
            <span className="text-xs text-slate-400">この提案どう？</span>
            <button
                type="button"
                onClick={() => handle(true)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm transition-all hover:bg-emerald-100"
            >
                {"\uD83D\uDC4D"}
            </button>
            <button
                type="button"
                onClick={() => handle(false)}
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm transition-all hover:bg-red-100"
            >
                {"\uD83D\uDC4E"}
            </button>
        </div>
    );
}

/* ── Manual Weather Input (offline fallback) ── */

const MANUAL_CONDITIONS: Array<{ value: WeatherCondition; label: string; icon: string }> = [
    { value: "sunny", label: "\u6674\u308C", icon: "\u2600\uFE0F" },
    { value: "cloudy", label: "\u66C7\u308A", icon: "\u2601\uFE0F" },
    { value: "rainy", label: "\u96E8", icon: "\uD83C\uDF27\uFE0F" },
    { value: "snowy", label: "\u96EA", icon: "\uD83C\uDF28\uFE0F" },
    { value: "windy", label: "\u98A8", icon: "\uD83D\uDCA8" },
];

function ManualWeatherInput({
    onSubmit,
}: {
    onSubmit: (weather: WeatherInfo) => void;
}) {
    const [temp, setTemp] = useState(20);
    const [condition, setCondition] = useState<WeatherCondition>("cloudy");

    const handleSubmit = () => {
        onSubmit(buildManualWeather(temp, condition));
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-4"
        >
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">
                    {"\u5929\u6C17\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093"}
                </p>
                <p className="mt-1 text-xs text-amber-600">
                    {"\u4ECA\u306E\u6C17\u6E29\u3068\u5929\u6C17\u3092\u624B\u52D5\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044"}
                </p>
            </div>

            {/* Temperature slider */}
            <div>
                <label className="block text-sm font-semibold text-slate-700">
                    {"\u6C17\u6E29"}: {temp}\u00B0C
                </label>
                <input
                    type="range"
                    min={-10}
                    max={42}
                    value={temp}
                    onChange={(e) => setTemp(Number(e.target.value))}
                    className="mt-1 w-full accent-sky-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                    <span>-10\u00B0C</span>
                    <span>42\u00B0C</span>
                </div>
            </div>

            {/* Condition selector */}
            <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">
                    {"\u5929\u6C17"}
                </p>
                <div className="flex flex-wrap gap-2">
                    {MANUAL_CONDITIONS.map((c) => (
                        <button
                            key={c.value}
                            type="button"
                            onClick={() => setCondition(c.value)}
                            className={cn(
                                "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                                condition === c.value
                                    ? "bg-sky-100 text-sky-800 ring-2 ring-sky-300"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                            )}
                        >
                            <span>{c.icon}</span>
                            <span>{c.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <GlassButton
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                className="w-full"
            >
                {"\u3053\u306E\u5929\u6C17\u3067\u63D0\u6848\u3092\u898B\u308B"}
            </GlassButton>
        </motion.div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton variant="circular" width={48} height={48} />
                <div className="space-y-2">
                    <Skeleton width={120} height={28} />
                    <Skeleton width={80} height={16} />
                </div>
            </div>
            <div className="flex gap-3">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="rectangular" width={96} height={100} />
                ))}
            </div>
            <Skeleton width="100%" height={40} />
        </div>
    );
}

/* ── Main component ── */

export default function WeatherOutfitPanel({
    wardrobeItems,
}: WeatherOutfitPanelProps) {
    const [loading, setLoading] = useState(true);
    const [suggestion, setSuggestion] = useState<WeatherOutfitSuggestion | null>(
        null,
    );
    const [error, setError] = useState<string | null>(null);
    const [showManualInput, setShowManualInput] = useState(false);
    const [weatherSource, setWeatherSource] = useState<WeatherFetchResult["source"] | null>(null);
    const [locationRequested, setLocationRequested] = useState(false);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const applyWeather = useCallback(
        (weather: WeatherInfo, source: WeatherFetchResult["source"]) => {
            const result = suggestOutfitForWeather(weather, wardrobeItems);
            setSuggestion(result);
            setWeatherSource(source);
            setShowManualInput(false);
        },
        [wardrobeItems],
    );

    const loadWeather = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setShowManualInput(false);
            const { weather, source } = await fetchWeather();
            applyWeather(weather, source);

            // If we got stale cache, try to refresh in background
            if (source === "stale_cache") {
                fetchWeather()
                    .then(({ weather: fresh, source: freshSource }) => {
                        if (freshSource === "api") applyWeather(fresh, freshSource);
                    })
                    .catch(() => {
                        // silent -- we already have stale data showing
                    });
            }
        } catch (err) {
            if (err instanceof WeatherOfflineError) {
                setShowManualInput(true);
            } else {
                setError("\u5929\u6C17\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
            }
        } finally {
            setLoading(false);
        }
    }, [applyWeather]);

    const handleManualSubmit = useCallback(
        (weather: WeatherInfo) => {
            applyWeather(weather, "manual");
        },
        [applyWeather],
    );

    useEffect(() => {
        loadWeather();

        // Auto-refresh every hour
        refreshTimerRef.current = setInterval(loadWeather, 60 * 60 * 1000);
        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [loadWeather]);

    const handleRequestLocation = useCallback(async () => {
        setLocationRequested(true);
        if (typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    try {
                        setLoading(true);
                        const { weather, source } = await fetchWeather(
                            pos.coords.latitude,
                            pos.coords.longitude,
                        );
                        applyWeather(weather, source);
                    } catch (err) {
                        if (err instanceof WeatherOfflineError) {
                            setShowManualInput(true);
                        } else {
                            setError("\u5929\u6C17\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
                        }
                    } finally {
                        setLoading(false);
                    }
                },
                () => {
                    // Permission denied - use default
                },
                { timeout: 5000 },
            );
        }
    }, [applyWeather]);

    const handleFeedback = useCallback((liked: boolean) => {
        saveWeatherFeedback(liked);
    }, []);

    return (
        <FadeInView>
            <GlassCard variant="default" padding="md">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        天気連動の提案
                    </h3>
                    <GlassButton
                        variant="ghost"
                        size="xs"
                        onClick={loadWeather}
                        disabled={loading}
                    >
                        <svg
                            className={cn(
                                "h-4 w-4",
                                loading && "animate-spin",
                            )}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                    </GlassButton>
                </div>

                {loading && <div className="mt-4"><LoadingSkeleton /></div>}

                {error && !loading && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-sm text-amber-700">{error}</p>
                        <div className="mt-2 flex gap-2">
                            <GlassButton
                                variant="secondary"
                                size="xs"
                                onClick={loadWeather}
                            >
                                {"\u518D\u8A66\u884C"}
                            </GlassButton>
                            <GlassButton
                                variant="ghost"
                                size="xs"
                                onClick={() => { setError(null); setShowManualInput(true); }}
                            >
                                {"\u624B\u52D5\u5165\u529B"}
                            </GlassButton>
                        </div>
                    </div>
                )}

                {showManualInput && !loading && (
                    <ManualWeatherInput onSubmit={handleManualSubmit} />
                )}

                {suggestion && !loading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-4 space-y-3"
                    >
                        <WeatherHeader weather={suggestion.weather} />

                        {/* Source indicator for non-fresh data */}
                        {weatherSource === "stale_cache" && (
                            <GlassBadge variant="warning" size="sm">
                                {"\u30AD\u30E3\u30C3\u30B7\u30E5\u30C7\u30FC\u30BF\uFF08\u66F4\u65B0\u5F85\u3061\uFF09"}
                            </GlassBadge>
                        )}
                        {weatherSource === "manual" && (
                            <GlassBadge variant="secondary" size="sm">
                                {"\u624B\u52D5\u5165\u529B"}
                            </GlassBadge>
                        )}

                        <SuggestedItemsScroll
                            items={suggestion.suggestedItems}
                        />

                        {/* Practical notes */}
                        {suggestion.practicalNotes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {suggestion.practicalNotes.map((note) => (
                                    <GlassBadge
                                        key={note}
                                        variant="warning"
                                        size="sm"
                                    >
                                        {note}
                                    </GlassBadge>
                                ))}
                            </div>
                        )}

                        {/* Collapsible advice sections */}
                        <div className="mt-2">
                            <AdviceSection
                                title="レイヤリングアドバイス"
                                content={suggestion.layeringAdvice}
                                defaultOpen
                            />
                            <AdviceSection
                                title="素材のアドバイス"
                                content={suggestion.materialAdvice}
                            />
                            <AdviceSection
                                title="配色のアドバイス"
                                content={suggestion.colorMoodAdvice}
                            />
                        </div>

                        <FeedbackButtons onFeedback={handleFeedback} />

                        {/* Location request */}
                        {!locationRequested && (
                            <div className="pt-2 text-center">
                                <button
                                    type="button"
                                    onClick={handleRequestLocation}
                                    className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600"
                                >
                                    現在地の天気を使う
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </GlassCard>
        </FadeInView>
    );
}
