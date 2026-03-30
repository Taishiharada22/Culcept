/**
 * 着回しインテリジェンス — Outfit Intelligence Engine
 *
 * Computes item-pair compatibility, auto-generates outfit suggestions,
 * detects sleeping items, and analyzes wardrobe gaps.
 */

import type {
    CompatibilityScore,
    OutfitConstraints,
    SavedSetup,
    SuggestedOutfit,
    WardrobeGap,
    WardrobeItem,
    WearRecord,
} from "./types";
import type { CategoryMain, FormalityCode, SeasonCode, SilhouetteCode } from "./taxonomy";

/* ── Color utilities ── */

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const cleaned = hex.replace("#", "");
    if (cleaned.length !== 6 && cleaned.length !== 3) return null;
    const full =
        cleaned.length === 3
            ? cleaned
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : cleaned;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) return { h: 0, s: 0, l };

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;

    return { h: h * 360, s, l };
}

function hueDiff(h1: number, h2: number): number {
    const d = Math.abs(h1 - h2);
    return Math.min(d, 360 - d);
}

function scoreColorHarmony(hexA?: string, hexB?: string): number {
    if (!hexA || !hexB) return 0.5;
    const a = hexToHsl(hexA);
    const b = hexToHsl(hexB);
    if (!a || !b) return 0.5;

    // Neutrals (very low saturation) go with everything
    if (a.s < 0.1 || b.s < 0.1) return 0.9;

    const diff = hueDiff(a.h, b.h);

    // Monochromatic (same hue)
    if (diff < 15) return 0.95;
    // Analogous (30deg)
    if (diff < 40) return 0.85;
    // Complementary (~180deg)
    if (diff > 150 && diff < 210) return 0.8;
    // Triadic (~120deg)
    if (diff > 100 && diff < 140) return 0.7;
    // Split-complementary
    if (diff > 140 && diff <= 150) return 0.75;
    // Others
    return 0.4;
}

/* ── Formality compatibility ── */

const FORMALITY_LEVELS: Record<string, number> = {
    casual: 0,
    smart: 1,
    dress: 2,
};

function scoreFormalityMatch(a?: FormalityCode, b?: FormalityCode): number {
    if (!a || !b) return 0.5;
    const diff = Math.abs((FORMALITY_LEVELS[a] ?? 1) - (FORMALITY_LEVELS[b] ?? 1));
    if (diff === 0) return 1.0;
    if (diff === 1) return 0.6;
    return 0.2;
}

/* ── Season compatibility ── */

function scoreSeasonMatch(a?: SeasonCode, b?: SeasonCode): number {
    if (!a || !b) return 0.5;
    if (a === "all" || b === "all") return 1.0;
    return a === b ? 1.0 : 0.3;
}

/* ── Material compatibility map ── */

const MATERIAL_COMPAT: Record<string, Record<string, number>> = {
    "material.denim": { "material.leather": 0.9, "material.cotton": 0.9, "material.knit": 0.7, "material.wool": 0.6 },
    "material.leather": { "material.denim": 0.9, "material.wool": 0.8, "material.cotton": 0.7, "material.silk": 0.5 },
    "material.cotton": { "material.denim": 0.9, "material.linen": 0.9, "material.knit": 0.8, "material.leather": 0.7 },
    "material.wool": { "material.leather": 0.8, "material.cashmere": 0.9, "material.cotton": 0.7, "material.silk": 0.6 },
    "material.silk": { "material.cashmere": 0.8, "material.wool": 0.6, "material.linen": 0.7 },
    "material.linen": { "material.cotton": 0.9, "material.silk": 0.7 },
    "material.knit": { "material.cotton": 0.8, "material.denim": 0.7, "material.wool": 0.8 },
    "material.cashmere": { "material.wool": 0.9, "material.silk": 0.8, "material.leather": 0.7 },
    "material.polyester": { "material.tech_nylon": 0.9, "material.cotton": 0.6 },
    "material.tech_nylon": { "material.polyester": 0.9, "material.leather": 0.5 },
    "material.fleece": { "material.tech_nylon": 0.8, "material.denim": 0.6 },
    "material.suede": { "material.leather": 0.9, "material.denim": 0.8, "material.wool": 0.8 },
    "material.down": { "material.tech_nylon": 0.8, "material.denim": 0.6 },
};

function scoreMaterialMatch(a?: string[], b?: string[]): number {
    if (!a?.length || !b?.length) return 0.5;
    let best = 0.5;
    for (const matA of a) {
        for (const matB of b) {
            if (matA === matB) { best = Math.max(best, 0.9); continue; }
            const score = MATERIAL_COMPAT[matA]?.[matB] ?? MATERIAL_COMPAT[matB]?.[matA] ?? 0.5;
            best = Math.max(best, score);
        }
    }
    return best;
}

/* ── Silhouette balance ── */

const SILHOUETTE_LEVELS: Record<string, number> = {
    slim: 0,
    regular: 1,
    loose: 2,
    oversized: 3,
};

function scoreSilhouetteBalance(a?: SilhouetteCode, b?: SilhouetteCode): number {
    if (!a || !b) return 0.5;
    const diff = Math.abs((SILHOUETTE_LEVELS[a] ?? 1) - (SILHOUETTE_LEVELS[b] ?? 1));
    // Contrast pairing (oversized+slim) is very stylish
    if (diff === 3) return 1.0;
    // Good contrast
    if (diff === 2) return 0.85;
    // Similar
    if (diff === 1) return 0.7;
    // Same silhouette — can work but less dynamic
    return 0.6;
}

/* ── Public API ── */

export function computeItemCompatibility(a: WardrobeItem, b: WardrobeItem): CompatibilityScore {
    const colorHarmony = scoreColorHarmony(a.colorHex, b.colorHex);
    const formalityMatch = scoreFormalityMatch(a.formality, b.formality);
    const seasonMatch = scoreSeasonMatch(a.season, b.season);
    const materialMatch = scoreMaterialMatch(a.materialFamily, b.materialFamily);
    const silhouetteBalance = scoreSilhouetteBalance(a.silhouette, b.silhouette);

    const total =
        colorHarmony * 0.4 +
        formalityMatch * 0.2 +
        seasonMatch * 0.15 +
        materialMatch * 0.15 +
        silhouetteBalance * 0.1;

    return { total, colorHarmony, formalityMatch, seasonMatch, materialMatch, silhouetteBalance };
}

/**
 * Generate outfit suggestions from wardrobe items.
 * Each outfit requires at least 1 tops-like + 1 bottoms-like item.
 */
export function generateOutfitSuggestions(
    items: WardrobeItem[],
    constraints: OutfitConstraints = {},
    maxResults = 5,
): SuggestedOutfit[] {
    const tops = items.filter(
        (i) =>
            i.categoryMain === "tops" || i.category === "tops",
    );
    const bottoms = items.filter(
        (i) =>
            i.categoryMain === "bottoms" || i.category === "bottoms",
    );
    const outers = items.filter(
        (i) =>
            i.categoryMain === "outer" || i.category === "outerwear",
    );
    const shoes = items.filter(
        (i) =>
            i.categoryMain === "shoes" || i.category === "shoes",
    );

    if (tops.length === 0 || bottoms.length === 0) return [];

    const mustInclude = new Set(constraints.mustIncludeIds ?? []);
    const exclude = new Set(constraints.excludeIds ?? []);

    const candidates: SuggestedOutfit[] = [];

    for (const top of tops) {
        if (exclude.has(top.id)) continue;
        for (const bottom of bottoms) {
            if (exclude.has(bottom.id)) continue;

            // Season filter
            if (constraints.season) {
                if (top.season && top.season !== "all" && top.season !== constraints.season) continue;
                if (bottom.season && bottom.season !== "all" && bottom.season !== constraints.season) continue;
            }

            // Formality filter
            if (constraints.formality) {
                const fDiff = Math.abs(
                    (FORMALITY_LEVELS[top.formality ?? "smart"] ?? 1) -
                        (FORMALITY_LEVELS[constraints.formality] ?? 1),
                );
                if (fDiff > 1) continue;
            }

            const compat = computeItemCompatibility(top, bottom);
            const outfitItemIds = [top.id, bottom.id];

            // Try adding outerwear
            let bestOuter: WardrobeItem | null = null;
            let outerBonus = 0;
            for (const outer of outers) {
                if (exclude.has(outer.id)) continue;
                if (constraints.season && outer.season && outer.season !== "all" && outer.season !== constraints.season) continue;
                const outerScore =
                    (computeItemCompatibility(outer, top).total + computeItemCompatibility(outer, bottom).total) / 2;
                if (outerScore > outerBonus) {
                    outerBonus = outerScore;
                    bestOuter = outer;
                }
            }
            if (bestOuter) outfitItemIds.push(bestOuter.id);

            // Try adding shoes
            let bestShoe: WardrobeItem | null = null;
            let shoeBonus = 0;
            for (const shoe of shoes) {
                if (exclude.has(shoe.id)) continue;
                const shoeScore =
                    (computeItemCompatibility(shoe, top).total + computeItemCompatibility(shoe, bottom).total) / 2;
                if (shoeScore > shoeBonus) {
                    shoeBonus = shoeScore;
                    bestShoe = shoe;
                }
            }
            if (bestShoe) outfitItemIds.push(bestShoe.id);

            // mustInclude check
            if (mustInclude.size > 0 && ![...mustInclude].every((id) => outfitItemIds.includes(id))) continue;

            const totalScore =
                compat.total * 0.6 + outerBonus * 0.2 + shoeBonus * 0.2;

            const reasoning = buildReasoning(compat, top, bottom, bestOuter, bestShoe);

            candidates.push({
                itemIds: outfitItemIds,
                score: Math.round(totalScore * 100),
                reasoning,
                breakdown: compat,
            });
        }
    }

    candidates.sort((a, b) => b.score - a.score);

    // Deduplicate: avoid suggesting very similar outfits
    const seen = new Set<string>();
    const results: SuggestedOutfit[] = [];
    for (const c of candidates) {
        const key = c.itemIds.slice(0, 2).sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(c);
        if (results.length >= maxResults) break;
    }

    return results;
}

function buildReasoning(
    compat: CompatibilityScore,
    top: WardrobeItem,
    bottom: WardrobeItem,
    outer: WardrobeItem | null,
    shoe: WardrobeItem | null,
): string {
    const parts: string[] = [];
    if (compat.colorHarmony >= 0.85) parts.push("色の相性が抜群");
    else if (compat.colorHarmony >= 0.7) parts.push("配色バランスが良い");
    if (compat.formalityMatch >= 0.9) parts.push("フォーマリティが統一");
    if (compat.silhouetteBalance >= 0.85) parts.push("シルエットの緩急が効いている");
    if (compat.materialMatch >= 0.8) parts.push("素材の調和が取れている");
    if (outer) parts.push(`${outer.name}でレイヤード`);
    if (shoe) parts.push(`${shoe.name}で足元を引き締め`);
    return parts.length > 0 ? parts.join("、") : `${top.name} × ${bottom.name}`;
}

/**
 * Detect items that haven't been used in setups or worn recently.
 */
export function findSleepingItems(
    items: WardrobeItem[],
    wearHistory: Record<string, WearRecord>,
    setups: SavedSetup[],
    thresholdDays = 30,
): WardrobeItem[] {
    const setupItemIds = new Set(setups.flatMap((s) => s.itemIds));
    const now = Date.now();
    const threshold = thresholdDays * 24 * 60 * 60 * 1000;

    return items.filter((item) => {
        const record = wearHistory[item.id];
        if (!record || record.count === 0) {
            return !setupItemIds.has(item.id);
        }
        if (record.lastWornAt) {
            const lastWorn = new Date(record.lastWornAt).getTime();
            if (now - lastWorn > threshold) return true;
        }
        return false;
    });
}

/**
 * Analyze wardrobe gaps — what's missing to maximize outfit potential.
 */
export function analyzeWardrobeGaps(items: WardrobeItem[]): WardrobeGap[] {
    const gaps: WardrobeGap[] = [];
    const countByMain: Record<string, number> = {};

    for (const item of items) {
        const cat = item.categoryMain || item.category || "other";
        countByMain[cat] = (countByMain[cat] || 0) + 1;
    }

    const hasTop = (countByMain["tops"] ?? 0) > 0;
    const hasBottom = (countByMain["bottoms"] ?? 0) > 0;
    const hasOuter = (countByMain["outer"] ?? 0) + (countByMain["outerwear"] ?? 0) > 0;
    const hasShoe = (countByMain["shoes"] ?? 0) > 0;

    if (!hasTop) {
        gaps.push({
            category: "tops" as CategoryMain,
            description: "トップスがありません",
            impact: "コーデの基本となるトップスを追加すると、着回しが大幅に広がります",
            priority: 10,
        });
    }

    if (!hasBottom) {
        gaps.push({
            category: "bottoms" as CategoryMain,
            description: "ボトムスがありません",
            impact: "ボトムスを追加すると、コーデ提案が可能になります",
            priority: 10,
        });
    }

    if (hasTop && hasBottom && !hasOuter) {
        gaps.push({
            category: "outer" as CategoryMain,
            description: "アウターがありません",
            impact: "アウターを追加すると、レイヤードコーデの提案が可能に",
            priority: 7,
        });
    }

    if (hasTop && hasBottom && !hasShoe) {
        gaps.push({
            category: "shoes" as CategoryMain,
            description: "靴の登録がありません",
            impact: "靴を追加すると、足元まで含めたトータルコーデが完成",
            priority: 6,
        });
    }

    // Color diversity check
    const colors = new Set(items.map((i) => i.color).filter(Boolean));
    if (items.length >= 5 && colors.size <= 2) {
        gaps.push({
            category: "tops" as CategoryMain,
            description: "色のバリエーションが少ない",
            impact: "異なる色味のアイテムを加えると、コーデの幅が広がります",
            priority: 5,
        });
    }

    // Formality diversity check
    const formalities = new Set(items.map((i) => i.formality).filter(Boolean));
    if (items.length >= 5 && formalities.size <= 1) {
        gaps.push({
            category: "tops" as CategoryMain,
            description: "フォーマリティの幅が狭い",
            impact: "カジュアルときれいめの両方があると、TPOに応じたコーデが可能に",
            priority: 4,
        });
    }

    // Season check
    const seasons = new Set(items.map((i) => i.season).filter(Boolean));
    if (items.length >= 5 && !seasons.has("aw") && !seasons.has("all")) {
        gaps.push({
            category: "outer" as CategoryMain,
            description: "秋冬アイテムが不足",
            impact: "秋冬用のアイテムを追加すると、通年のコーデが完成",
            priority: 3,
        });
    }
    if (items.length >= 5 && !seasons.has("ss") && !seasons.has("all")) {
        gaps.push({
            category: "tops" as CategoryMain,
            description: "春夏アイテムが不足",
            impact: "春夏用の軽いアイテムを追加すると、通年のコーデが完成",
            priority: 3,
        });
    }

    // Potential outfit count boost
    const topCount = (countByMain["tops"] ?? 0);
    const bottomCount = (countByMain["bottoms"] ?? 0);
    if (topCount >= 2 && bottomCount >= 2) {
        const currentCombos = topCount * bottomCount;
        if (topCount < bottomCount) {
            gaps.push({
                category: "tops" as CategoryMain,
                description: `トップスを1枚追加`,
                impact: `着回しパターンが ${currentCombos} → ${(topCount + 1) * bottomCount} 通りに (+ ${bottomCount} 通り)`,
                priority: 5,
            });
        } else {
            gaps.push({
                category: "bottoms" as CategoryMain,
                description: `ボトムスを1本追加`,
                impact: `着回しパターンが ${currentCombos} → ${topCount * (bottomCount + 1)} 通りに (+ ${topCount} 通り)`,
                priority: 5,
            });
        }
    }

    gaps.sort((a, b) => b.priority - a.priority);
    return gaps;
}

/**
 * Compute wear stats summary for display.
 */
export function computeWearStats(
    items: WardrobeItem[],
    wearHistory: Record<string, WearRecord>,
) {
    let totalWears = 0;
    let mostWorn: { item: WardrobeItem; count: number } | null = null;
    let leastWorn: { item: WardrobeItem; count: number } | null = null;

    for (const item of items) {
        const record = wearHistory[item.id];
        const count = record?.count ?? 0;
        totalWears += count;
        if (!mostWorn || count > mostWorn.count) mostWorn = { item, count };
        if (!leastWorn || count < leastWorn.count) leastWorn = { item, count };
    }

    return {
        totalWears,
        avgWearsPerItem: items.length > 0 ? Math.round(totalWears / items.length * 10) / 10 : 0,
        mostWorn,
        leastWorn: leastWorn?.count === 0 ? leastWorn : null,
    };
}
