"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GlassCard,
    GlassBadge,
    GlassButton,
    GlassModal,
    FadeInView,
} from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type { WardrobeItem } from "../_lib/types";
import { CATEGORIES } from "../_lib/constants";
import {
    getWardrobeStats,
    getItemCostData,
    recordWear,
    setItemPrice,
    getItemPriceData,
    type WardrobeStats,
    type ItemCostData,
} from "../_lib/costPerWear";

/* ── Category label map ── */
const CATEGORY_LABELS: Record<string, string> = {};
for (const c of CATEGORIES) {
    CATEGORY_LABELS[c.value] = `${c.icon} ${c.label}`;
}

/* ── Format helpers ── */
function formatYen(n: number): string {
    if (n >= 10000) return `\u00A5${Math.round(n / 1000)}k`;
    return `\u00A5${n.toLocaleString()}`;
}

function formatMonth(m: string): string {
    const [, month] = m.split("-");
    return `${parseInt(month, 10)}月`;
}

function daysSinceStr(dateStr?: string): string {
    if (!dateStr) return "未着用";
    const days = Math.round(
        (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return "今日";
    if (days === 1) return "昨日";
    return `${days}日前`;
}

/* ── Price Presets ── */
const PRICE_PRESETS = [1000, 3000, 5000, 10000, 30000, 50000];

/* ── Main Component ── */

interface CostPerWearDashboardProps {
    wardrobeItems: WardrobeItem[];
    onRefresh?: () => void;
}

export default function CostPerWearDashboard({
    wardrobeItems,
    onRefresh,
}: CostPerWearDashboardProps) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [priceModalItem, setPriceModalItem] = useState<WardrobeItem | null>(
        null
    );
    const [customPrice, setCustomPrice] = useState("");
    const [purchaseDate, setPurchaseDate] = useState("");
    const [activeSection, setActiveSection] = useState<string | null>(null);

    const stats = useMemo<WardrobeStats>(
        () => getWardrobeStats(wardrobeItems),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [wardrobeItems, refreshKey]
    );

    const refresh = useCallback(() => {
        setRefreshKey((k) => k + 1);
        onRefresh?.();
    }, [onRefresh]);

    const handleRecordWear = useCallback(
        (itemId: string) => {
            recordWear(itemId);
            refresh();
        },
        [refresh]
    );

    const handleSetPrice = useCallback(
        (itemId: string, price: number) => {
            setItemPrice(itemId, price, purchaseDate || undefined);
            setPriceModalItem(null);
            setCustomPrice("");
            setPurchaseDate("");
            refresh();
        },
        [purchaseDate, refresh]
    );

    /* ── Summary cards data ── */
    const summaryCards = [
        {
            label: "総アイテム数",
            value: `${stats.totalItems}`,
            icon: "👗",
            accent: "from-violet-500/10 to-indigo-500/10",
        },
        {
            label: "推定総額",
            value: stats.totalEstimatedValue > 0 ? formatYen(stats.totalEstimatedValue) : "--",
            icon: "💰",
            accent: "from-amber-500/10 to-orange-500/10",
        },
        {
            label: "平均コスパ",
            value: stats.averageCostPerWear > 0 ? `${formatYen(stats.averageCostPerWear)}/回` : "--",
            icon: "📊",
            accent: "from-emerald-500/10 to-teal-500/10",
        },
        {
            label: "休眠アイテム",
            value: `${stats.sleepingItems.length}`,
            icon: "😴",
            accent: "from-rose-500/10 to-pink-500/10",
        },
    ];

    /* ── Max bar height for charts ── */
    const maxMonthlyWears = Math.max(
        ...stats.monthlyWearTrend.map((m) => m.totalWears),
        1
    );
    const maxCategoryValue = Math.max(
        ...stats.categoryBreakdown.map((c) => c.totalValue),
        1
    );

    return (
        <div className="space-y-5">
            {/* ── Summary Cards Row ── */}
            <FadeInView>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                    {summaryCards.map((card) => (
                        <GlassCard
                            key={card.label}
                            className="min-w-[140px] flex-shrink-0"
                            padding="sm"
                            hoverEffect={false}
                        >
                            <div
                                className={cn(
                                    "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-lg mb-2",
                                    card.accent
                                )}
                            >
                                {card.icon}
                            </div>
                            <p className="text-[11px] font-medium text-slate-500">
                                {card.label}
                            </p>
                            <p className="text-lg font-bold text-slate-900 mt-0.5">
                                {card.value}
                            </p>
                        </GlassCard>
                    ))}
                </div>
            </FadeInView>

            {/* ── Best & Worst Value ── */}
            <FadeInView delay={0.05}>
                <GlassCard padding="md">
                    <h3 className="text-base font-bold text-slate-900 mb-3">
                        コスパランキング
                    </h3>

                    {stats.bestValue.length === 0 && stats.worstValue.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-3xl mb-2">📦</p>
                            <p className="text-sm text-slate-500">
                                アイテムに価格を登録して着用を記録すると、
                                <br />
                                コスパランキングが表示されます
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Best Value */}
                            {stats.bestValue.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <GlassBadge variant="success" size="sm">
                                            ベストコスパ
                                        </GlassBadge>
                                    </div>
                                    <div className="space-y-2">
                                        {stats.bestValue.map(({ item, cpw }, i) => (
                                            <ValueRow
                                                key={item.id}
                                                item={item}
                                                cpw={cpw}
                                                rank={i + 1}
                                                accent="emerald"
                                                onRecordWear={handleRecordWear}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Worst Value */}
                            {stats.worstValue.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <GlassBadge variant="warning" size="sm">
                                            もっと着よう
                                        </GlassBadge>
                                    </div>
                                    <div className="space-y-2">
                                        {stats.worstValue.map(({ item, cpw }, i) => (
                                            <ValueRow
                                                key={item.id}
                                                item={item}
                                                cpw={cpw}
                                                rank={i + 1}
                                                accent="amber"
                                                onRecordWear={handleRecordWear}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </GlassCard>
            </FadeInView>

            {/* ── Monthly Wear Trend ── */}
            <FadeInView delay={0.1}>
                <GlassCard padding="md">
                    <h3 className="text-base font-bold text-slate-900 mb-4">
                        月別着用トレンド
                    </h3>
                    {stats.monthlyWearTrend.every((m) => m.totalWears === 0) ? (
                        <div className="text-center py-6">
                            <p className="text-sm text-slate-500">
                                着用を記録するとトレンドが表示されます
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-end justify-between gap-2 h-32">
                            {stats.monthlyWearTrend.map((month) => {
                                const heightPct =
                                    maxMonthlyWears > 0
                                        ? (month.totalWears / maxMonthlyWears) * 100
                                        : 0;
                                return (
                                    <div
                                        key={month.month}
                                        className="flex-1 flex flex-col items-center gap-1"
                                    >
                                        <span className="text-[11px] font-bold text-slate-700">
                                            {month.totalWears > 0 ? month.totalWears : ""}
                                        </span>
                                        <motion.div
                                            className="w-full rounded-t-lg bg-gradient-to-t from-violet-500 to-indigo-400"
                                            initial={{ height: 0 }}
                                            animate={{
                                                height: `${Math.max(heightPct, 4)}%`,
                                            }}
                                            transition={{
                                                duration: 0.6,
                                                ease: "easeOut",
                                            }}
                                        />
                                        <span className="text-[10px] text-slate-500">
                                            {formatMonth(month.month)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </GlassCard>
            </FadeInView>

            {/* ── Category Breakdown ── */}
            <FadeInView delay={0.15}>
                <GlassCard padding="md">
                    <h3 className="text-base font-bold text-slate-900 mb-3">
                        カテゴリ別 投資額
                    </h3>
                    {stats.categoryBreakdown.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">
                            データなし
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {stats.categoryBreakdown.map((cat) => {
                                const widthPct =
                                    maxCategoryValue > 0
                                        ? (cat.totalValue / maxCategoryValue) * 100
                                        : 0;
                                return (
                                    <div key={cat.category}>
                                        <div className="flex items-center justify-between text-[12px] mb-1">
                                            <span className="font-medium text-slate-700">
                                                {CATEGORY_LABELS[cat.category] ?? cat.category}
                                            </span>
                                            <span className="text-slate-500">
                                                {cat.count}点
                                                {cat.totalValue > 0 &&
                                                    ` / ${formatYen(cat.totalValue)}`}
                                                {cat.avgCpw > 0 &&
                                                    ` (${formatYen(cat.avgCpw)}/回)`}
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <motion.div
                                                className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-500"
                                                initial={{ width: 0 }}
                                                animate={{
                                                    width: `${Math.max(widthPct, 2)}%`,
                                                }}
                                                transition={{
                                                    duration: 0.5,
                                                    ease: "easeOut",
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </GlassCard>
            </FadeInView>

            {/* ── Sleeping Items Alert ── */}
            {stats.sleepingItems.length > 0 && (
                <FadeInView delay={0.2}>
                    <GlassCard padding="md">
                        <div className="flex items-center gap-2 mb-3">
                            <h3 className="text-base font-bold text-slate-900">
                                休眠アイテム
                            </h3>
                            <GlassBadge variant="warning" size="sm">
                                {stats.sleepingItems.length}点
                            </GlassBadge>
                        </div>
                        <p className="text-[12px] text-slate-500 mb-3">
                            30日以上着ていないアイテムです
                        </p>
                        <div className="space-y-2">
                            {stats.sleepingItems.slice(0, 5).map((item) => {
                                const costData = getItemCostData(
                                    item.id,
                                    wardrobeItems
                                );
                                return (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/30 p-3"
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                                            {item.imageUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div
                                                    className="w-full h-full"
                                                    style={{
                                                        backgroundColor:
                                                            item.colorHex ?? "#ccc",
                                                    }}
                                                />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-bold text-slate-800 truncate">
                                                {item.name}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                                最後に着た日:{" "}
                                                {daysSinceStr(costData.lastWornDate)}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-1.5 flex-shrink-0">
                                            <GlassButton
                                                variant="primary"
                                                size="xs"
                                                onClick={() =>
                                                    handleRecordWear(item.id)
                                                }
                                            >
                                                明日着る
                                            </GlassButton>
                                        </div>
                                    </div>
                                );
                            })}
                            {stats.sleepingItems.length > 5 && (
                                <p className="text-center text-[12px] text-slate-400 pt-1">
                                    他 {stats.sleepingItems.length - 5} 点
                                </p>
                            )}
                        </div>
                    </GlassCard>
                </FadeInView>
            )}

            {/* ── Most Worn ── */}
            {stats.mostWorn.length > 0 && (
                <FadeInView delay={0.25}>
                    <GlassCard padding="md">
                        <h3 className="text-base font-bold text-slate-900 mb-3">
                            よく着るアイテム TOP5
                        </h3>
                        <div className="space-y-2">
                            {stats.mostWorn.map(({ item, count }, i) => (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/50 p-3"
                                >
                                    <span className="w-6 text-center text-[13px] font-bold text-slate-400">
                                        {i + 1}
                                    </span>
                                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                                        {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={item.imageUrl}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div
                                                className="w-full h-full"
                                                style={{
                                                    backgroundColor:
                                                        item.colorHex ?? "#ccc",
                                                }}
                                            />
                                        )}
                                    </div>
                                    <p className="flex-1 text-[13px] font-medium text-slate-800 truncate">
                                        {item.name}
                                    </p>
                                    <GlassBadge variant="info" size="sm">
                                        {count}回
                                    </GlassBadge>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </FadeInView>
            )}

            {/* ── Quick Price Entry ── */}
            <FadeInView delay={0.3}>
                <GlassCard padding="md">
                    <h3 className="text-base font-bold text-slate-900 mb-2">
                        価格を登録
                    </h3>
                    <p className="text-[12px] text-slate-500 mb-3">
                        価格未登録のアイテムに購入価格を設定しましょう
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {wardrobeItems
                            .filter((item) => !getItemPriceData(item.id))
                            .slice(0, 8)
                            .map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setPriceModalItem(item)}
                                    className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-[12px] font-medium text-slate-600 transition hover:border-violet-400 hover:bg-violet-50/30"
                                >
                                    <div
                                        className="w-5 h-5 rounded flex-shrink-0"
                                        style={{
                                            backgroundColor:
                                                item.colorHex ?? "#ccc",
                                        }}
                                    />
                                    <span className="truncate max-w-[100px]">
                                        {item.name}
                                    </span>
                                    <span className="text-slate-400">+</span>
                                </button>
                            ))}
                        {wardrobeItems.every((i) => getItemPriceData(i.id)) && (
                            <p className="text-[12px] text-emerald-600 py-2">
                                全アイテムに価格が登録済みです
                            </p>
                        )}
                    </div>
                </GlassCard>
            </FadeInView>

            {/* ── Price Entry Modal ── */}
            <GlassModal
                isOpen={!!priceModalItem}
                onClose={() => {
                    setPriceModalItem(null);
                    setCustomPrice("");
                    setPurchaseDate("");
                }}
                title="購入価格を登録"
                size="sm"
            >
                {priceModalItem && (
                    <div className="space-y-4">
                        {/* Item preview */}
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                                {priceModalItem.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={priceModalItem.imageUrl}
                                        alt={priceModalItem.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div
                                        className="w-full h-full"
                                        style={{
                                            backgroundColor:
                                                priceModalItem.colorHex ?? "#ccc",
                                        }}
                                    />
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">
                                    {priceModalItem.name}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                    {CATEGORY_LABELS[priceModalItem.category] ??
                                        priceModalItem.category}
                                </p>
                            </div>
                        </div>

                        {/* Quick presets */}
                        <div>
                            <p className="text-[12px] font-medium text-slate-600 mb-2">
                                クイック選択
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {PRICE_PRESETS.map((price) => (
                                    <button
                                        key={price}
                                        type="button"
                                        onClick={() =>
                                            handleSetPrice(
                                                priceModalItem.id,
                                                price
                                            )
                                        }
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50"
                                    >
                                        {formatYen(price)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom price */}
                        <div>
                            <p className="text-[12px] font-medium text-slate-600 mb-2">
                                カスタム金額
                            </p>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                                        \u00A5
                                    </span>
                                    <input
                                        type="number"
                                        value={customPrice}
                                        onChange={(e) =>
                                            setCustomPrice(e.target.value)
                                        }
                                        placeholder="金額を入力"
                                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pl-7 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400"
                                    />
                                </div>
                                <GlassButton
                                    variant="primary"
                                    size="sm"
                                    disabled={
                                        !customPrice ||
                                        parseInt(customPrice, 10) <= 0
                                    }
                                    onClick={() =>
                                        handleSetPrice(
                                            priceModalItem.id,
                                            parseInt(customPrice, 10)
                                        )
                                    }
                                >
                                    登録
                                </GlassButton>
                            </div>
                        </div>

                        {/* Purchase date (optional) */}
                        <div>
                            <p className="text-[12px] font-medium text-slate-600 mb-2">
                                購入日 (任意)
                            </p>
                            <input
                                type="date"
                                value={purchaseDate}
                                onChange={(e) =>
                                    setPurchaseDate(e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white/80 py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-violet-400"
                            />
                        </div>
                    </div>
                )}
            </GlassModal>
        </div>
    );
}

/* ── Value Row sub-component ── */

function ValueRow({
    item,
    cpw,
    rank,
    accent,
    onRecordWear,
}: {
    item: WardrobeItem;
    cpw: number;
    rank: number;
    accent: "emerald" | "amber";
    onRecordWear: (id: string) => void;
}) {
    const costData = getItemCostData(item.id, []);
    const accentStyles = {
        emerald: "border-emerald-200/60 bg-emerald-50/20",
        amber: "border-amber-200/60 bg-amber-50/20",
    };
    const cpwColor = {
        emerald: "text-emerald-700",
        amber: "text-amber-700",
    };

    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-xl border p-2.5",
                accentStyles[accent]
            )}
        >
            <span className="w-5 text-center text-[12px] font-bold text-slate-400">
                {rank}
            </span>

            {/* Thumbnail */}
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div
                        className="w-full h-full"
                        style={{
                            backgroundColor: item.colorHex ?? "#ccc",
                        }}
                    />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-800 truncate">
                    {item.name}
                </p>
                <p className="text-[10px] text-slate-500">
                    {costData.wearCount}回着用
                    {costData.purchasePrice
                        ? ` / ${formatYen(costData.purchasePrice)}`
                        : ""}
                </p>
            </div>

            {/* CPW */}
            <div className="text-right flex-shrink-0">
                <p className={cn("text-[13px] font-bold", cpwColor[accent])}>
                    {formatYen(cpw)}
                    <span className="text-[10px] font-normal text-slate-400">
                        /回
                    </span>
                </p>
            </div>

            {/* Quick wear button */}
            <button
                type="button"
                onClick={() => onRecordWear(item.id)}
                className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 flex items-center justify-center text-[14px] hover:bg-violet-50 hover:border-violet-300 transition flex-shrink-0"
                title="着用を記録"
            >
                +
            </button>
        </div>
    );
}
