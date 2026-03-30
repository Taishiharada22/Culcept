"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { WardrobeItem } from "../_lib/types";
import { fetchTodayOutfit, type TodayOutfit } from "../_lib/calendarBridge";
import { staggerContainer, staggerItem, springSnappy } from "../_lib/animations";

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Category icon map                                                            */
/* ──────────────────────────────────────────────────────────────────────────── */

const CATEGORY_ICONS: Record<string, string> = {
    tops: "👕",
    bottoms: "👖",
    outerwear: "🧥",
    shoes: "👟",
    accessories: "💍",
    hat: "🧢",
    other: "🎀",
    // calendar categories (may differ from wardrobe categories)
    shirt: "👔",
    pants: "👖",
    jacket: "🧥",
    sneakers: "👟",
    bag: "👜",
    dress: "👗",
    skirt: "👗",
    coat: "🧥",
    socks: "🧦",
    watch: "⌚",
};

const CATEGORY_LABELS: Record<string, string> = {
    tops: "トップス",
    bottoms: "ボトムス",
    outerwear: "アウター",
    shoes: "シューズ",
    accessories: "アクセ",
    hat: "帽子",
    other: "その他",
};

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Weather icon map                                                             */
/* ──────────────────────────────────────────────────────────────────────────── */

function weatherIcon(condition: string): string {
    const c = condition.toLowerCase();
    if (c.includes("sun") || c.includes("clear") || c === "晴れ") return "☀️";
    if (c.includes("cloud") || c === "曇り") return "☁️";
    if (c.includes("rain") || c === "雨") return "🌧️";
    if (c.includes("snow") || c === "雪") return "❄️";
    if (c.includes("storm") || c === "嵐") return "⛈️";
    if (c.includes("fog") || c === "霧") return "🌫️";
    return "🌤️";
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  SYNC band colors                                                             */
/* ──────────────────────────────────────────────────────────────────────────── */

const SYNC_BAND_META: Record<string, { color: string; label: string; ring: string }> = {
    excellent: { color: "text-emerald-600", label: "最高", ring: "stroke-emerald-400" },
    good: { color: "text-sky-600", label: "良好", ring: "stroke-sky-400" },
    caution: { color: "text-amber-600", label: "注意", ring: "stroke-amber-400" },
    risk: { color: "text-rose-600", label: "要確認", ring: "stroke-rose-400" },
};

/* ──────────────────────────────────────────────────────────────────────────── */
/*  SyncRing                                                                     */
/* ──────────────────────────────────────────────────────────────────────────── */

function SyncRing({ score, band }: { score: number; band?: string }) {
    const r = 18;
    const progress = score / 100;
    const meta = SYNC_BAND_META[band ?? "good"] ?? SYNC_BAND_META.good;

    return (
        <div className="flex flex-col items-center gap-0.5">
            <div className="relative h-12 w-12">
                <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
                    {/* Track */}
                    <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-slate-200" pathLength="1" />
                    {/* Fill - uses pathLength for clean draw animation */}
                    <motion.circle
                        cx="22"
                        cy="22"
                        r={r}
                        fill="none"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        className={meta.ring}
                        pathLength={1}
                        strokeDasharray="1"
                        strokeDashoffset={0}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: progress, opacity: 1 }}
                        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                    />
                </svg>
                <motion.span
                    className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-700"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, ...springSnappy }}
                >
                    {score}
                </motion.span>
            </div>
            <span className={`text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Skeleton                                                                     */
/* ──────────────────────────────────────────────────────────────────────────── */

function SkeletonWidget() {
    return (
        <div className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-lg p-4">
            <div className="flex items-center gap-4">
                {/* Left skeleton */}
                <div className="flex flex-col gap-1.5 min-w-[72px]">
                    <div className="h-4 w-14 rounded-full bg-slate-200/80 animate-pulse" />
                    <div className="h-3 w-10 rounded-full bg-slate-200/60 animate-pulse" />
                </div>
                {/* Center skeleton chips */}
                <div className="flex-1 flex gap-2 flex-wrap">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-9 w-9 rounded-full bg-slate-200/80 animate-pulse" />
                    ))}
                </div>
                {/* Right skeleton ring */}
                <div className="h-12 w-12 rounded-full bg-slate-200/80 animate-pulse" />
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  ItemChip                                                                     */
/* ──────────────────────────────────────────────────────────────────────────── */

function ItemChip({
    item,
    wardrobeItem,
}: {
    item: TodayOutfit["items"][number];
    wardrobeItem?: WardrobeItem;
}) {
    const [hovered, setHovered] = useState(false);
    const colorHex = wardrobeItem?.colorHex ?? item.colorHex;
    const icon = CATEGORY_ICONS[item.category] ?? CATEGORY_ICONS[wardrobeItem?.category ?? "other"] ?? "🎀";
    const imageUrl = wardrobeItem?.imageUrl ?? item.imageUrl;

    return (
        <div
            className="relative"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Circle */}
            <motion.div
                className="h-10 w-10 rounded-full flex items-center justify-center text-lg border-2 border-white shadow-md overflow-hidden cursor-default select-none"
                style={{
                    backgroundColor: colorHex ?? "#e2e8f0",
                }}
                whileHover={{ scale: 1.12 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
                {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                    <span className="drop-shadow-sm">{icon}</span>
                )}
            </motion.div>

            {/* Hover tooltip */}
            <AnimatePresence>
                {hovered ? (
                    <motion.div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none"
                        initial={{ opacity: 0, y: 4, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                    >
                        <div className="whitespace-nowrap rounded-lg bg-slate-800/90 backdrop-blur px-2.5 py-1 text-[10px] font-medium text-white shadow-lg">
                            <div>{item.name}</div>
                            <div className="text-slate-300 text-[9px]">
                                {CATEGORY_LABELS[item.category] ?? item.category}
                            </div>
                        </div>
                        {/* Arrow */}
                        <div className="mx-auto mt-0.5 h-1.5 w-1.5 rotate-45 bg-slate-800/90" />
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  DateBadge                                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */

function DateBadge({ date, weather }: { date: string; weather?: { temp: number; condition: string } }) {
    const d = new Date(date);
    // Guard against invalid dates on SSR/hydration edge cases
    const isValid = !isNaN(d.getTime());
    const month = isValid ? d.getMonth() + 1 : "--";
    const day = isValid ? d.getDate() : "--";
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dayName = isValid ? dayNames[d.getDay()] : "";

    return (
        <div className="flex flex-col items-start min-w-[60px]">
            <div className="text-[10px] font-semibold text-slate-400 leading-none">
                {month}月{day}日（{dayName}）
            </div>
            {weather ? (
                <div className="mt-1 flex items-center gap-1 relative overflow-hidden">
                    <span className="text-base leading-none">{weatherIcon(weather.condition)}</span>
                    <span className="text-[13px] font-bold text-slate-600 leading-none">
                        {Math.round(weather.temp)}°
                    </span>
                    {/* Subtle shimmer overlay */}
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                            backgroundSize: "200% 100%",
                            animation: "weather-shimmer 3s ease-in-out infinite",
                        }}
                    />
                    <style>{`@keyframes weather-shimmer { 0%,100% { background-position: -200% 0; } 50% { background-position: 200% 0; } }`}</style>
                </div>
            ) : (
                <div className="mt-1 text-[11px] font-bold text-slate-500 leading-none">今日</div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  TodayOutfitWidget — main component                                          */
/* ──────────────────────────────────────────────────────────────────────────── */

interface TodayOutfitWidgetProps {
    wardrobe: WardrobeItem[];
}

type LoadState = "idle" | "loading" | "loaded" | "no-outfit" | "unauthenticated" | "error";

export default function TodayOutfitWidget({ wardrobe }: TodayOutfitWidgetProps) {
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [outfit, setOutfit] = useState<TodayOutfit | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const result = await fetchTodayOutfit();
                if (cancelled) return;

                if (result === null) {
                    // fetchTodayOutfit returns null both for 401 and for "no outfit today".
                    // We distinguish these by trying a lightweight auth probe:
                    // if fetch returned null we just show the "generate" CTA.
                    setLoadState("no-outfit");
                } else {
                    setOutfit(result);
                    setLoadState("loaded");
                }
            } catch {
                if (!cancelled) setLoadState("error");
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    // Build a quick wardrobe lookup for enriching calendar items with color/image
    const wardrobeMap = React.useMemo(() => {
        const m = new Map<string, WardrobeItem>();
        for (const item of wardrobe) m.set(item.id, item);
        return m;
    }, [wardrobe]);

    /* ── Loading skeleton ── */
    if (loadState === "loading") {
        return <SkeletonWidget />;
    }

    /* ── Unauthenticated ── */
    if (loadState === "unauthenticated") {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-2xl border border-dashed border-slate-200/70 bg-white/50 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3"
            >
                <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">📅</span>
                    <div>
                        <div className="text-[13px] font-bold text-slate-700">今日のコーデ</div>
                        <div className="text-[11px] text-slate-400">ログインしてカレンダー連携</div>
                    </div>
                </div>
                <GlassButton href="/login" variant="secondary" size="xs">
                    ログイン
                </GlassButton>
            </motion.div>
        );
    }

    /* ── No outfit for today ── */
    if (loadState === "no-outfit" || loadState === "error" || !outfit) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-2xl border border-dashed border-slate-200/70 bg-white/50 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3"
            >
                <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">👗</span>
                    <div>
                        <div className="text-[13px] font-bold text-slate-700">今日のコーデ未設定</div>
                        <div className="text-[11px] text-slate-400">カレンダーでコーデを生成しよう</div>
                    </div>
                </div>
                <GlassButton href="/calendar" variant="secondary" size="xs">
                    生成する
                </GlassButton>
            </motion.div>
        );
    }

    /* ── Loaded with outfit ── */
    const hasItems = outfit.items.length > 0;
    const hasSyncScore =
        typeof outfit.syncScore === "number" && outfit.syncScore > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
        >
            <GlassCard
                variant="gradient"
                padding="none"
                hoverEffect={false}
                className="px-4 py-3"
            >
                <div className="flex items-center gap-3">
                    {/* ── Left: date + weather ── */}
                    <DateBadge date={outfit.date} weather={outfit.weather} />

                    {/* Divider */}
                    <div className="w-px self-stretch bg-slate-200/70 shrink-0" />

                    {/* ── Center: item chips ── */}
                    <div className="flex-1 min-w-0">
                        {hasItems ? (
                            <motion.div
                                className="flex items-center gap-2 flex-wrap"
                                variants={staggerContainer}
                                initial="initial"
                                animate="animate"
                            >
                                {outfit.items.slice(0, 6).map((item, idx) => (
                                    <motion.div
                                        key={item.id}
                                        variants={staggerItem}
                                        transition={{ ...springSnappy, delay: idx * 0.06 }}
                                    >
                                        <ItemChip
                                            item={item}
                                            wardrobeItem={wardrobeMap.get(item.id)}
                                        />
                                    </motion.div>
                                ))}
                                {outfit.items.length > 6 ? (
                                    <motion.span
                                        className="text-[11px] font-semibold text-slate-400"
                                        variants={staggerItem}
                                    >
                                        +{outfit.items.length - 6}
                                    </motion.span>
                                ) : null}
                            </motion.div>
                        ) : (
                            <span className="text-[12px] text-slate-400">アイテムなし</span>
                        )}
                        {outfit.scene ? (
                            <div className="mt-1 text-[10px] text-slate-400 leading-none truncate">
                                シーン：{outfit.scene}
                            </div>
                        ) : null}
                    </div>

                    {/* ── Right: SYNC score + link ── */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {hasSyncScore ? (
                            <SyncRing
                                score={outfit.syncScore!}
                                band={outfit.syncBand}
                            />
                        ) : null}
                        <Link
                            href="/calendar"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                            カレンダーへ
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                                <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </GlassCard>
        </motion.div>
    );
}
