import type { WardrobeItem } from "./types";
import { safeLSSet } from "@/lib/safeLocalStorage";

/* ── Storage Keys ── */
const WEAR_RECORDS_KEY = "culcept_wear_records_v1";
const ITEM_PRICES_KEY = "culcept_item_prices_v1";

/* ── Types ── */

export interface WearRecord {
    itemId: string;
    date: string; // YYYY-MM-DD
    occasion?: string;
}

export interface ItemPriceData {
    price: number;
    purchaseDate?: string;
}

export interface ItemCostData {
    itemId: string;
    purchasePrice?: number;
    purchaseDate?: string;
    wearCount: number;
    costPerWear: number | null;
    lastWornDate?: string;
    averageInterval: number;
    seasonalDistribution: Record<string, number>;
    status: "active" | "sleeping" | "retired";
}

export interface WardrobeStats {
    totalItems: number;
    totalEstimatedValue: number;
    averageCostPerWear: number;
    mostWorn: { item: WardrobeItem; count: number }[];
    leastWorn: { item: WardrobeItem; count: number }[];
    sleepingItems: WardrobeItem[];
    bestValue: { item: WardrobeItem; cpw: number }[];
    worstValue: { item: WardrobeItem; cpw: number }[];
    categoryBreakdown: {
        category: string;
        count: number;
        totalValue: number;
        avgCpw: number;
    }[];
    monthlyWearTrend: { month: string; totalWears: number }[];
}

/* ── Helpers ── */

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function loadJson<T>(key: string, fallback: T): T {
    if (!isBrowser()) return fallback;
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function saveJson<T>(key: string, data: T): void {
    if (!isBrowser()) return;
    safeLSSet(key, JSON.stringify(data));
}

function todayString(): string {
    return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
    const msA = new Date(a).getTime();
    const msB = new Date(b).getTime();
    return Math.abs(Math.round((msB - msA) / (1000 * 60 * 60 * 24)));
}

function getSeason(dateStr: string): string {
    const month = new Date(dateStr).getMonth() + 1;
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
}

function getMonthKey(dateStr: string): string {
    return dateStr.slice(0, 7); // YYYY-MM
}

/* ── Core Functions ── */

/** Record a wear event for an item */
export function recordWear(
    itemId: string,
    date?: string,
    occasion?: string
): void {
    const records = getWearRecords();
    const entry: WearRecord = {
        itemId,
        date: date ?? todayString(),
    };
    if (occasion) entry.occasion = occasion;
    records.push(entry);
    saveJson(WEAR_RECORDS_KEY, records);
}

/** Get all wear records */
export function getWearRecords(): WearRecord[] {
    return loadJson<WearRecord[]>(WEAR_RECORDS_KEY, []);
}

/** Set purchase price for an item */
export function setItemPrice(
    itemId: string,
    price: number,
    purchaseDate?: string
): void {
    const prices = loadJson<Record<string, ItemPriceData>>(ITEM_PRICES_KEY, {});
    prices[itemId] = { price, purchaseDate };
    saveJson(ITEM_PRICES_KEY, prices);
}

/** Get price data for an item */
export function getItemPriceData(itemId: string): ItemPriceData | null {
    const prices = loadJson<Record<string, ItemPriceData>>(ITEM_PRICES_KEY, {});
    return prices[itemId] ?? null;
}

/** Get all item prices */
export function getAllItemPrices(): Record<string, ItemPriceData> {
    return loadJson<Record<string, ItemPriceData>>(ITEM_PRICES_KEY, {});
}

/** Compute cost data for a single item */
export function getItemCostData(
    itemId: string,
    _wardrobeItems: WardrobeItem[]
): ItemCostData {
    const records = getWearRecords().filter((r) => r.itemId === itemId);
    const priceData = getItemPriceData(itemId);
    const wearCount = records.length;
    const costPerWear =
        priceData && wearCount > 0
            ? Math.round(priceData.price / wearCount)
            : null;

    // Sort dates
    const sortedDates = records
        .map((r) => r.date)
        .sort((a, b) => a.localeCompare(b));
    const lastWornDate =
        sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : undefined;

    // Average interval
    let averageInterval = 0;
    if (sortedDates.length >= 2) {
        let totalDays = 0;
        for (let i = 1; i < sortedDates.length; i++) {
            totalDays += daysBetween(sortedDates[i - 1], sortedDates[i]);
        }
        averageInterval = Math.round(totalDays / (sortedDates.length - 1));
    }

    // Seasonal distribution
    const seasonalDistribution: Record<string, number> = {};
    for (const r of records) {
        const season = getSeason(r.date);
        seasonalDistribution[season] = (seasonalDistribution[season] ?? 0) + 1;
    }

    // Status
    const today = todayString();
    let status: "active" | "sleeping" | "retired" = "active";
    if (lastWornDate) {
        const daysSince = daysBetween(lastWornDate, today);
        if (daysSince >= 90) status = "retired";
        else if (daysSince >= 30) status = "sleeping";
    } else {
        status = "sleeping";
    }

    return {
        itemId,
        purchasePrice: priceData?.price,
        purchaseDate: priceData?.purchaseDate,
        wearCount,
        costPerWear,
        lastWornDate,
        averageInterval,
        seasonalDistribution,
        status,
    };
}

/** Compute full wardrobe statistics */
export function getWardrobeStats(wardrobeItems: WardrobeItem[]): WardrobeStats {
    const allRecords = getWearRecords();
    const allPrices = getAllItemPrices();

    // Count wears per item
    const wearCounts: Record<string, number> = {};
    for (const r of allRecords) {
        wearCounts[r.itemId] = (wearCounts[r.itemId] ?? 0) + 1;
    }

    // Total estimated value
    let totalEstimatedValue = 0;
    for (const item of wardrobeItems) {
        const pd = allPrices[item.id];
        if (pd) totalEstimatedValue += pd.price;
    }

    // Items with cost data
    type ItemWithCpw = { item: WardrobeItem; cpw: number; count: number };
    const itemsWithCpw: ItemWithCpw[] = [];
    const itemsWithCount: { item: WardrobeItem; count: number }[] = [];

    for (const item of wardrobeItems) {
        const count = wearCounts[item.id] ?? 0;
        const pd = allPrices[item.id];
        itemsWithCount.push({ item, count });
        if (pd && count > 0) {
            itemsWithCpw.push({
                item,
                cpw: Math.round(pd.price / count),
                count,
            });
        }
    }

    // Sort by count
    const sortedByCount = [...itemsWithCount].sort(
        (a, b) => b.count - a.count
    );
    const mostWorn = sortedByCount.filter((x) => x.count > 0).slice(0, 5);
    const leastWorn = sortedByCount
        .filter((x) => x.count > 0)
        .reverse()
        .slice(0, 5);

    // Best / worst value
    const sortedByCpw = [...itemsWithCpw].sort((a, b) => a.cpw - b.cpw);
    const bestValue = sortedByCpw.slice(0, 5).map((x) => ({
        item: x.item,
        cpw: x.cpw,
    }));
    const worstValue = sortedByCpw
        .reverse()
        .slice(0, 5)
        .map((x) => ({ item: x.item, cpw: x.cpw }));

    // Average cost per wear
    const averageCostPerWear =
        itemsWithCpw.length > 0
            ? Math.round(
                  itemsWithCpw.reduce((sum, x) => sum + x.cpw, 0) /
                      itemsWithCpw.length
              )
            : 0;

    // Sleeping items
    const sleepingItems = getSleepingItems(wardrobeItems);

    // Category breakdown
    const categoryMap: Record<
        string,
        { count: number; totalValue: number; cpwSum: number; cpwCount: number }
    > = {};
    for (const item of wardrobeItems) {
        const cat = item.category;
        if (!categoryMap[cat])
            categoryMap[cat] = {
                count: 0,
                totalValue: 0,
                cpwSum: 0,
                cpwCount: 0,
            };
        categoryMap[cat].count++;
        const pd = allPrices[item.id];
        if (pd) categoryMap[cat].totalValue += pd.price;
        const count = wearCounts[item.id] ?? 0;
        if (pd && count > 0) {
            categoryMap[cat].cpwSum += Math.round(pd.price / count);
            categoryMap[cat].cpwCount++;
        }
    }
    const categoryBreakdown = Object.entries(categoryMap)
        .map(([category, data]) => ({
            category,
            count: data.count,
            totalValue: data.totalValue,
            avgCpw:
                data.cpwCount > 0 ? Math.round(data.cpwSum / data.cpwCount) : 0,
        }))
        .sort((a, b) => b.totalValue - a.totalValue);

    // Monthly wear trend (last 6 months)
    const monthCounts: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthCounts[key] = 0;
    }
    for (const r of allRecords) {
        const mk = getMonthKey(r.date);
        if (mk in monthCounts) {
            monthCounts[mk]++;
        }
    }
    const monthlyWearTrend = Object.entries(monthCounts).map(
        ([month, totalWears]) => ({ month, totalWears })
    );

    return {
        totalItems: wardrobeItems.length,
        totalEstimatedValue,
        averageCostPerWear,
        mostWorn,
        leastWorn,
        sleepingItems,
        bestValue,
        worstValue,
        categoryBreakdown,
        monthlyWearTrend,
    };
}

/** Get wear calendar for a given month (YYYY-MM) */
export function getWearCalendar(
    month: string
): Record<string, string[]> {
    const records = getWearRecords();
    const result: Record<string, string[]> = {};
    for (const r of records) {
        if (r.date.startsWith(month)) {
            if (!result[r.date]) result[r.date] = [];
            result[r.date].push(r.itemId);
        }
    }
    return result;
}

/** Get sleeping items (not worn in thresholdDays) */
export function getSleepingItems(
    wardrobeItems: WardrobeItem[],
    thresholdDays = 30
): WardrobeItem[] {
    const records = getWearRecords();
    const today = todayString();

    // Last worn date per item
    const lastWorn: Record<string, string> = {};
    for (const r of records) {
        if (!lastWorn[r.itemId] || r.date > lastWorn[r.itemId]) {
            lastWorn[r.itemId] = r.date;
        }
    }

    return wardrobeItems.filter((item) => {
        const lw = lastWorn[item.id];
        if (!lw) return true; // never worn
        return daysBetween(lw, today) >= thresholdDays;
    });
}

/** Estimate annual cost per wear based on current wear rate */
export function estimateAnnualCostPerWear(itemId: string): number | null {
    const priceData = getItemPriceData(itemId);
    if (!priceData) return null;

    const records = getWearRecords().filter((r) => r.itemId === itemId);
    if (records.length < 2) return null;

    const sortedDates = records.map((r) => r.date).sort();
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];
    const spanDays = daysBetween(firstDate, lastDate);
    if (spanDays === 0) return null;

    const wearsPerYear = (records.length / spanDays) * 365;
    if (wearsPerYear === 0) return null;

    return Math.round(priceData.price / wearsPerYear);
}

/** Remove a specific wear record */
export function removeWearRecord(itemId: string, date: string): void {
    const records = getWearRecords();
    const idx = records.findIndex(
        (r) => r.itemId === itemId && r.date === date
    );
    if (idx !== -1) {
        records.splice(idx, 1);
        saveJson(WEAR_RECORDS_KEY, records);
    }
}

/** Clear all price data for an item */
export function removeItemPrice(itemId: string): void {
    const prices = loadJson<Record<string, ItemPriceData>>(ITEM_PRICES_KEY, {});
    delete prices[itemId];
    saveJson(ITEM_PRICES_KEY, prices);
}
