export type Role = "buyer" | "seller";

export function priceBucket(price: number | null | undefined) {
    if (!price || !Number.isFinite(price)) return null;
    if (price < 3000) return "0-3000";
    if (price < 6000) return "3000-6000";
    if (price < 12000) return "6000-12000";
    if (price < 25000) return "12000-25000";
    return "25000+";
}

export function addToJsonCounter(obj: Record<string, number>, key: string, delta: number) {
    const cur = Number(obj[key] ?? 0);
    const next = cur + delta;
    // 0に戻ったら消す（肥大化防止）
    if (Math.abs(next) < 0.00001) {
        delete obj[key];
    } else {
        obj[key] = next;
    }
}

export function clampScore(x: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, x));
}
