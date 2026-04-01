"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
} from "../_lib/costPerWear";

/* ── Category label map ── */
const CATEGORY_LABELS: Record<string, string> = {};
for (const c of CATEGORIES) {
    CATEGORY_LABELS[c.value] = `${c.icon} ${c.label}`;
}

/* ── Format helpers ── */
function formatYen(n: number): string {
    if (n >= 10000) return `¥${Math.round(n / 1000)}k`;
    return `¥${n.toLocaleString()}`;
}

function formatMonth(m: string): string {
    const [, month] = m.split("-");
    return `${parseInt(month, 10)}月`;
}

function daysSinceStr(dateStr?: string): string {
    if (!dateStr) return "未着用";
    const days = Math.round((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
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

export default function CostPerWearDashboard({ wardrobeItems, onRefresh }: CostPerWearDashboardProps) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [priceModalItem, setPriceModalItem] = useState<WardrobeItem | null>(null);
    const [customPrice, setCustomPrice] = useState("");
    const [purchaseDate, setPurchaseDate] = useState("");

    const stats = useMemo<WardrobeStats>(
        () => getWardrobeStats(wardrobeItems),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [wardrobeItems, refreshKey]
    );

    const refresh = useCallback(() => { setRefreshKey((k) => k + 1); onRefresh?.(); }, [onRefresh]);
    const handleRecordWear = useCallback((itemId: string) => { recordWear(itemId); refresh(); }, [refresh]);
    const handleSetPrice = useCallback((itemId: string, price: number) => {
        setItemPrice(itemId, price, purchaseDate || undefined);
        setPriceModalItem(null); setCustomPrice(""); setPurchaseDate(""); refresh();
    }, [purchaseDate, refresh]);

    const maxMonthlyWears = Math.max(...stats.monthlyWearTrend.map((m) => m.totalWears), 1);

    return (
        <div className="space-y-3">
            {/* Summary stats — compact inline */}
            <div className="flex items-center gap-4">
                <div className="flex items-baseline gap-1">
                    <span className="text-[18px] font-black text-slate-900">{stats.totalItems}</span>
                    <span className="text-[10px] text-slate-400">アイテム</span>
                </div>
                {stats.totalEstimatedValue > 0 && (
                    <div className="flex items-baseline gap-1">
                        <span className="text-[18px] font-black text-slate-900">{formatYen(stats.totalEstimatedValue)}</span>
                        <span className="text-[10px] text-slate-400">推定総額</span>
                    </div>
                )}
                {stats.averageCostPerWear > 0 && (
                    <div className="flex items-baseline gap-1">
                        <span className="text-[18px] font-black text-slate-900">{formatYen(stats.averageCostPerWear)}</span>
                        <span className="text-[10px] text-slate-400">/回</span>
                    </div>
                )}
            </div>

            {/* Best & Worst Value */}
            {(stats.bestValue.length > 0 || stats.worstValue.length > 0) && (
                <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">コスパランキング</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {stats.bestValue.length > 0 && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-emerald-600">ベストコスパ</span>
                                {stats.bestValue.map(({ item, cpw }, i) => (
                                    <ValueRow key={item.id} item={item} cpw={cpw} rank={i + 1} accent="emerald" onRecordWear={handleRecordWear} />
                                ))}
                            </div>
                        )}
                        {stats.worstValue.length > 0 && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-amber-600">もっと着よう</span>
                                {stats.worstValue.map(({ item, cpw }, i) => (
                                    <ValueRow key={item.id} item={item} cpw={cpw} rank={i + 1} accent="amber" onRecordWear={handleRecordWear} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Monthly Wear Trend */}
            {stats.monthlyWearTrend.some((m) => m.totalWears > 0) && (
                <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">月別着用</h4>
                    <div className="flex items-end justify-between gap-1.5 h-24">
                        {stats.monthlyWearTrend.map((month) => {
                            const heightPct = (month.totalWears / maxMonthlyWears) * 100;
                            return (
                                <div key={month.month} className="flex-1 flex flex-col items-center gap-0.5">
                                    <span className="text-[10px] font-bold text-slate-600">{month.totalWears > 0 ? month.totalWears : ""}</span>
                                    <motion.div className="w-full rounded-t bg-gradient-to-t from-violet-500 to-indigo-400"
                                        initial={{ height: 0 }} animate={{ height: `${Math.max(heightPct, 4)}%` }} transition={{ duration: 0.5 }} />
                                    <span className="text-[9px] text-slate-400">{formatMonth(month.month)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sleeping Items */}
            {stats.sleepingItems.length > 0 && (
                <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                        休眠アイテム <span className="text-amber-500">{stats.sleepingItems.length}点</span>
                    </h4>
                    <div className="space-y-1">
                        {stats.sleepingItems.slice(0, 5).map((item) => {
                            const costData = getItemCostData(item.id, wardrobeItems);
                            return (
                                <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 shadow-sm">
                                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                                        {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full" style={{ backgroundColor: item.colorHex ?? "#ccc" }} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold text-slate-800 truncate">{item.name}</p>
                                        <p className="text-[10px] text-slate-400">{daysSinceStr(costData.lastWornDate)}</p>
                                    </div>
                                    <button type="button" onClick={() => handleRecordWear(item.id)}
                                        className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">明日着る</button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Most Worn */}
            {stats.mostWorn.length > 0 && (
                <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">よく着る TOP5</h4>
                    <div className="space-y-1">
                        {stats.mostWorn.map(({ item, count }, i) => (
                            <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 shadow-sm">
                                <span className="w-5 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                                    {item.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full" style={{ backgroundColor: item.colorHex ?? "#ccc" }} />
                                    )}
                                </div>
                                <p className="flex-1 text-[12px] font-bold text-slate-800 truncate">{item.name}</p>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">{count}回</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Price Entry */}
            <div>
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">価格を登録</h4>
                <div className="flex flex-wrap gap-1.5">
                    {wardrobeItems.filter((item) => !getItemPriceData(item.id)).slice(0, 8).map((item) => (
                        <button key={item.id} type="button" onClick={() => setPriceModalItem(item)}
                            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-violet-400 hover:bg-violet-50/30">
                            <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: item.colorHex ?? "#ccc" }} />
                            <span className="truncate max-w-[80px]">{item.name}</span>
                            <span className="text-slate-400">+</span>
                        </button>
                    ))}
                    {wardrobeItems.every((i) => getItemPriceData(i.id)) && (
                        <p className="text-[11px] text-emerald-600 py-1">全アイテム価格登録済み</p>
                    )}
                </div>
            </div>

            {/* Price Entry Modal */}
            <AnimatePresence>
                {priceModalItem && (
                    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => { setPriceModalItem(null); setCustomPrice(""); setPurchaseDate(""); }}>
                        <motion.div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4"
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                                    {priceModalItem.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={priceModalItem.imageUrl} alt={priceModalItem.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full" style={{ backgroundColor: priceModalItem.colorHex ?? "#ccc" }} />
                                    )}
                                </div>
                                <div>
                                    <p className="text-[13px] font-bold text-slate-900">{priceModalItem.name}</p>
                                    <p className="text-[10px] text-slate-400">{CATEGORY_LABELS[priceModalItem.category] ?? priceModalItem.category}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {PRICE_PRESETS.map((price) => (
                                    <button key={price} type="button" onClick={() => handleSetPrice(priceModalItem.id, price)}
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[12px] font-bold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50">
                                        {formatYen(price)}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">¥</span>
                                    <input type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="金額"
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-6 pr-2 text-[12px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400" />
                                </div>
                                <button type="button" disabled={!customPrice || parseInt(customPrice, 10) <= 0}
                                    onClick={() => handleSetPrice(priceModalItem.id, parseInt(customPrice, 10))}
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                                    登録
                                </button>
                            </div>
                            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} placeholder="購入日（任意）"
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-[12px] text-slate-800 focus:outline-none focus:border-violet-400" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Value Row ── */

function ValueRow({ item, cpw, rank, accent, onRecordWear }: {
    item: WardrobeItem; cpw: number; rank: number; accent: "emerald" | "amber"; onRecordWear: (id: string) => void;
}) {
    const costData = getItemCostData(item.id, []);
    const styles = { emerald: "border-emerald-200/60 bg-emerald-50/20", amber: "border-amber-200/60 bg-amber-50/20" };
    const cpwColor = { emerald: "text-emerald-700", amber: "text-amber-700" };

    return (
        <div className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", styles[accent])}>
            <span className="w-4 text-center text-[11px] font-bold text-slate-400">{rank}</span>
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full" style={{ backgroundColor: item.colorHex ?? "#ccc" }} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">{item.name}</p>
                <p className="text-[9px] text-slate-400">{costData.wearCount}回{costData.purchasePrice ? ` / ${formatYen(costData.purchasePrice)}` : ""}</p>
            </div>
            <span className={cn("text-[12px] font-bold", cpwColor[accent])}>{formatYen(cpw)}<span className="text-[9px] font-normal text-slate-400">/回</span></span>
            <button type="button" onClick={() => onRecordWear(item.id)}
                className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[12px] hover:bg-violet-50 hover:border-violet-300 transition shrink-0">+</button>
        </div>
    );
}
