import type { WardrobeItem, ColorPrefs } from "./types";

export function computeColorPrefs(wardrobe: WardrobeItem[]): ColorPrefs {
    const counts = new Map<string, { hex: string; count: number }>();
    for (const item of wardrobe) {
        if (!item.color) continue;
        const existing = counts.get(item.color);
        if (existing) {
            existing.count += 1;
        } else {
            counts.set(item.color, { hex: item.colorHex ?? "", count: 1 });
        }
    }
    const dominant = Array.from(counts.entries())
        .map(([value, { hex, count }]) => ({ value, hex, count }))
        .sort((a, b) => b.count - a.count);
    return { dominant };
}
