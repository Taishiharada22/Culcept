/**
 * DNA\u5E0C\u5C11\u5EA6 — DNA Rarity Engine
 *
 * Show how unique the user's style profile is using statistical
 * distributions based on style theory. Since we don't have a real
 * user database yet, we use hardcoded population baselines.
 */

import type { StyleDnaVector, StyleDnaPoint } from "./styleDna";
import type { SelectedStyleLane, StyleLaneCode, WardrobeItem } from "./types";
import type { Contradiction } from "./contradictionDetector";

/* ── Types ── */

export interface RarityDimension {
    name: string;
    value: number;
    populationMean: number;
    populationStd: number;
    percentile: number;
    isRare: boolean;
}

export interface RarityProfile {
    overallRarity: number; // 0-100 percentile
    rarityLabel: string;
    dimensions: RarityDimension[];
    uniqueTraits: string[];
    commonTraits: string[];
    archetypeMatch: string;
    archetypeDistance: number;
}

/* ── Population baselines (hardcoded from style theory) ── */

// Most people cluster around casual-clean-simple
const POPULATION_BASELINES: Record<string, { mean: number; std: number }> = {
    "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": { mean: -0.3, std: 0.35 },
    "\u304D\u308C\u3044\u3081\u2194\u30B9\u30C8\u30EA\u30FC\u30C8": { mean: -0.2, std: 0.35 },
    "\u30D5\u30A7\u30DF\u30CB\u30F3\u2194\u30B7\u30E3\u30FC\u30D7": { mean: -0.05, std: 0.4 },
    "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": { mean: -0.35, std: 0.3 },
    "\u5B9A\u756A\u2194\u30C8\u30EC\u30F3\u30C9": { mean: -0.15, std: 0.35 },
    "\u6696\u8272\u2194\u5BD2\u8272": { mean: -0.1, std: 0.4 },
    "\u30DF\u30CB\u30DE\u30EB\u2194\u30DE\u30AD\u30B7\u30DE\u30EB": { mean: -0.3, std: 0.3 },
    "\u81EA\u5DF1\u63A2\u6C42\u5EA6": { mean: -0.4, std: 0.4 },
    "\u591A\u69D8\u6027": { mean: -0.1, std: 0.4 },
    "\u914D\u8272\u8C4A\u304B\u3055": { mean: -0.2, std: 0.4 },
    "\u610F\u5916\u6027": { mean: -0.5, std: 0.35 },
    "\u30B9\u30BF\u30A4\u30EB\u6DF1\u5EA6": { mean: -0.3, std: 0.35 },
};

/* ── Archetypes ── */

interface Archetype {
    name: string;
    label: string;
    vector: Record<string, number>;
}

const ARCHETYPES: Archetype[] = [
    {
        name: "clean_minimal",
        label: "\u30AF\u30EA\u30FC\u30F3\u30DF\u30CB\u30DE\u30EB",
        vector: {
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": -0.2,
            "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": -0.8,
            "\u30DF\u30CB\u30DE\u30EB\u2194\u30DE\u30AD\u30B7\u30DE\u30EB": -0.8,
            "\u5B9A\u756A\u2194\u30C8\u30EC\u30F3\u30C9": -0.3,
        },
    },
    {
        name: "casual_natural",
        label: "\u30AB\u30B8\u30E5\u30A2\u30EB\u30CA\u30C1\u30E5\u30E9\u30EB",
        vector: {
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": -0.6,
            "\u304D\u308C\u3044\u3081\u2194\u30B9\u30C8\u30EA\u30FC\u30C8": -0.3,
            "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": -0.4,
            "\u6696\u8272\u2194\u5BD2\u8272": -0.3,
        },
    },
    {
        name: "street_edge",
        label: "\u30B9\u30C8\u30EA\u30FC\u30C8\u30A8\u30C3\u30B8",
        vector: {
            "\u304D\u308C\u3044\u3081\u2194\u30B9\u30C8\u30EA\u30FC\u30C8": 0.7,
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": -0.3,
            "\u30DF\u30CB\u30DE\u30EB\u2194\u30DE\u30AD\u30B7\u30DE\u30EB": 0.3,
            "\u5B9A\u756A\u2194\u30C8\u30EC\u30F3\u30C9": 0.4,
        },
    },
    {
        name: "elegant_mode",
        label: "\u30A8\u30EC\u30AC\u30F3\u30C8\u30E2\u30FC\u30C9",
        vector: {
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": 0.6,
            "\u304D\u308C\u3044\u3081\u2194\u30B9\u30C8\u30EA\u30FC\u30C8": -0.6,
            "\u30D5\u30A7\u30DF\u30CB\u30F3\u2194\u30B7\u30E3\u30FC\u30D7": -0.3,
            "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": 0.2,
        },
    },
    {
        name: "avant_garde",
        label: "\u30A2\u30D0\u30F3\u30AE\u30E3\u30EB\u30C9",
        vector: {
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": 0.8,
            "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": 0.6,
            "\u30DF\u30CB\u30DE\u30EB\u2194\u30DE\u30AD\u30B7\u30DE\u30EB": 0.5,
            "\u5B9A\u756A\u2194\u30C8\u30EC\u30F3\u30C9": 0.7,
            "\u610F\u5916\u6027": 0.8,
        },
    },
    {
        name: "romantic_feminine",
        label: "\u30ED\u30DE\u30F3\u30C6\u30A3\u30C3\u30AF\u30D5\u30A7\u30DF\u30CB\u30F3",
        vector: {
            "\u30D5\u30A7\u30DF\u30CB\u30F3\u2194\u30B7\u30E3\u30FC\u30D7": -0.7,
            "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": 0.4,
            "\u6696\u8272\u2194\u5BD2\u8272": -0.3,
            "\u304D\u308C\u3044\u3081\u2194\u30B9\u30C8\u30EA\u30FC\u30C8": -0.5,
        },
    },
    {
        name: "classic_trad",
        label: "\u30AF\u30E9\u30B7\u30C3\u30AF\u30C8\u30E9\u30C3\u30C9",
        vector: {
            "\u5B9A\u756A\u2194\u30C8\u30EC\u30F3\u30C9": -0.7,
            "\u304D\u308C\u3044\u3081\u2194\u30B9\u30C8\u30EA\u30FC\u30C8": -0.5,
            "\u30B7\u30F3\u30D7\u30EB\u2194\u88C5\u98FE\u7684": -0.3,
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": 0.1,
        },
    },
    {
        name: "genderless_mix",
        label: "\u30B8\u30A7\u30F3\u30C0\u30FC\u30EC\u30B9\u30DF\u30C3\u30AF\u30B9",
        vector: {
            "\u30D5\u30A7\u30DF\u30CB\u30F3\u2194\u30B7\u30E3\u30FC\u30D7": 0.1,
            "\u30AB\u30B8\u30E5\u30A2\u30EB\u2194\u30E2\u30FC\u30C9": 0.2,
            "\u610F\u5916\u6027": 0.5,
            "\u591A\u69D8\u6027": 0.6,
        },
    },
];

/* ── Wardrobe-derived rarity signals ── */

/** Population baseline frequencies for material families (approximate). */
const MATERIAL_POP_FREQ: Record<string, number> = {
    "material.cotton": 0.4,
    "material.polyester": 0.3,
    "material.denim": 0.2,
    "material.nylon": 0.15,
    "material.wool": 0.12,
    "material.linen": 0.08,
    "material.silk": 0.04,
    "material.cashmere": 0.03,
    "material.leather": 0.06,
    "material.suede": 0.03,
    "material.fleece": 0.1,
    "material.down": 0.05,
    "material.velvet": 0.02,
    "material.corduroy": 0.04,
    "material.tweed": 0.02,
    "material.satin": 0.02,
    "material.mohair": 0.01,
    "material.angora": 0.01,
};

/** Population baseline frequencies for category distribution. */
const CATEGORY_POP_FREQ: Record<string, number> = {
    tops: 0.35,
    bottoms: 0.25,
    outerwear: 0.15,
    shoes: 0.12,
    accessories: 0.08,
    hat: 0.03,
    other: 0.02,
};

interface WardrobeRaritySignal {
    unusualColorCombinations: string[];
    rareMaterials: string[];
    categoryDistributionAnomaly: string | null;
    combinationRarityBonus: number;
}

function analyzeWardrobeRarity(wardrobe: WardrobeItem[]): WardrobeRaritySignal {
    if (wardrobe.length < 3) {
        return {
            unusualColorCombinations: [],
            rareMaterials: [],
            categoryDistributionAnomaly: null,
            combinationRarityBonus: 0,
        };
    }

    let bonus = 0;

    // ── Unusual color combinations ──
    const colorCounts = new Map<string, number>();
    for (const item of wardrobe) {
        const c = item.colorName ?? item.color;
        colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
    }
    const topColors = [...colorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);

    // Unusual pairs: warm+cool dominance, neon+muted, etc.
    const unusualColorCombinations: string[] = [];
    const warmColors = new Set(["\u8D64", "\u30AA\u30EC\u30F3\u30B8", "\u9EC4\u8272", "\u30D4\u30F3\u30AF", "\u30D9\u30FC\u30B8\u30E5", "\u30AD\u30E3\u30E1\u30EB"]);
    const coolColors = new Set(["\u9752", "\u30CD\u30A4\u30D3\u30FC", "\u30B0\u30EC\u30FC", "\u30E9\u30D9\u30F3\u30C0\u30FC", "\u30D6\u30EB\u30FC"]);
    const hasWarm = topColors.some((c) => warmColors.has(c));
    const hasCool = topColors.some((c) => coolColors.has(c));
    if (hasWarm && hasCool && topColors.length >= 2) {
        unusualColorCombinations.push(
            `\u6696\u8272\u7CFB\u300C${topColors.find((c) => warmColors.has(c))}\u300D\u3068\u5BD2\u8272\u7CFB\u300C${topColors.find((c) => coolColors.has(c))}\u300D\u306E\u5171\u5B58`,
        );
        bonus += 5;
    }

    // ── Rare materials ──
    const materialCounts = new Map<string, number>();
    for (const item of wardrobe) {
        for (const mat of item.materialFamily ?? []) {
            materialCounts.set(mat, (materialCounts.get(mat) ?? 0) + 1);
        }
    }
    const rareMaterials: string[] = [];
    for (const [mat, count] of materialCounts) {
        const popFreq = MATERIAL_POP_FREQ[mat] ?? 0.05;
        const userFreq = count / wardrobe.length;
        // User has this material 3x+ more than population average
        if (userFreq > popFreq * 3 && count >= 2) {
            const label = mat.replace("material.", "");
            rareMaterials.push(label);
            bonus += 4;
        }
    }

    // ── Category distribution anomaly ──
    const catCounts = new Map<string, number>();
    for (const item of wardrobe) {
        catCounts.set(item.category, (catCounts.get(item.category) ?? 0) + 1);
    }
    let categoryDistributionAnomaly: string | null = null;
    const catLabels: Record<string, string> = {
        tops: "\u30C8\u30C3\u30D7\u30B9",
        bottoms: "\u30DC\u30C8\u30E0\u30B9",
        outerwear: "\u30A2\u30A6\u30BF\u30FC",
        shoes: "\u9774",
        accessories: "\u30A2\u30AF\u30BB\u30B5\u30EA\u30FC",
        hat: "\u5E3D\u5B50",
        other: "\u305D\u306E\u4ED6",
    };
    for (const [cat, count] of catCounts) {
        const userFreq = count / wardrobe.length;
        const popFreq = CATEGORY_POP_FREQ[cat] ?? 0.05;
        if (userFreq > popFreq * 2.5 && count >= 3) {
            categoryDistributionAnomaly = `\u300C${catLabels[cat] ?? cat}\u300D\u304C\u5168\u4F53\u306E${Math.round(userFreq * 100)}%\uFF08\u5E73\u5747${Math.round(popFreq * 100)}%\uFF09`;
            bonus += 5;
            break;
        }
    }

    return {
        unusualColorCombinations,
        rareMaterials,
        categoryDistributionAnomaly,
        combinationRarityBonus: Math.min(15, bonus),
    };
}

/* ── Statistical helpers ── */

/**
 * Compute percentile using the normal CDF approximation.
 * Returns 0-100.
 */
function normalCdfPercentile(
    value: number,
    mean: number,
    std: number,
): number {
    if (std <= 0) return 50;
    const z = (value - mean) / std;
    // Abramowitz & Stegun approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804 * Math.exp((-z * z) / 2);
    const p =
        d *
        t *
        (0.3193815 +
            t *
                (-0.3565638 +
                    t *
                        (1.781478 +
                            t * (-1.821256 + t * 1.330274))));
    const cdf = z > 0 ? 1 - p : p;
    return Math.round(cdf * 100);
}

function euclideanDistance(
    a: Record<string, number>,
    b: Record<string, number>,
): number {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let sumSq = 0;
    for (const key of allKeys) {
        const diff = (a[key] ?? 0) - (b[key] ?? 0);
        sumSq += diff * diff;
    }
    return Math.sqrt(sumSq);
}

/* ── Rarity labels ── */

export function getRarityLabel(percentile: number): string {
    if (percentile >= 95) return "\u552F\u4E00\u7121\u4E8C";
    if (percentile >= 80) return "\u6975\u3081\u3066\u5E0C\u5C11";
    if (percentile >= 60) return "\u30EC\u30A2";
    if (percentile >= 40) return "\u30E6\u30CB\u30FC\u30AF";
    if (percentile >= 20) return "\u500B\u6027\u7684";
    return "\u30B9\u30BF\u30F3\u30C0\u30FC\u30C9";
}

export function getRarityColor(
    percentile: number,
): { bg: string; text: string; border: string; glow: string } {
    if (percentile >= 95) {
        return {
            bg: "bg-gradient-to-r from-amber-400 via-pink-500 to-violet-500",
            text: "text-white",
            border: "border-amber-300",
            glow: "shadow-amber-400/30",
        };
    }
    if (percentile >= 80) {
        return {
            bg: "bg-gradient-to-r from-amber-300 to-yellow-400",
            text: "text-amber-900",
            border: "border-amber-300",
            glow: "shadow-amber-300/20",
        };
    }
    if (percentile >= 60) {
        return {
            bg: "bg-gradient-to-r from-violet-400 to-purple-500",
            text: "text-white",
            border: "border-violet-300",
            glow: "shadow-violet-400/20",
        };
    }
    if (percentile >= 40) {
        return {
            bg: "bg-gradient-to-r from-blue-400 to-indigo-500",
            text: "text-white",
            border: "border-blue-300",
            glow: "shadow-blue-400/15",
        };
    }
    if (percentile >= 20) {
        return {
            bg: "bg-slate-200",
            text: "text-slate-700",
            border: "border-slate-300",
            glow: "",
        };
    }
    return {
        bg: "bg-slate-100",
        text: "text-slate-500",
        border: "border-slate-200",
        glow: "",
    };
}

/* ── Main computation ── */

/**
 * Compute rarity profile from Style DNA, selected lanes, contradictions,
 * and optional wardrobe items for material/color/category analysis.
 */
export function computeRarity(
    styleDna: StyleDnaVector | null,
    lanes: SelectedStyleLane[],
    contradictions: Contradiction[],
    wardrobe: WardrobeItem[] = [],
): RarityProfile {
    if (!styleDna || styleDna.points.length === 0) {
        return {
            overallRarity: 0,
            rarityLabel: "\u30C7\u30FC\u30BF\u4E0D\u8DB3",
            dimensions: [],
            uniqueTraits: [],
            commonTraits: [],
            archetypeMatch: "\u4E0D\u660E",
            archetypeDistance: 0,
        };
    }

    // Build user vector from DNA points
    const userVector: Record<string, number> = {};
    for (const point of styleDna.points) {
        userVector[point.label] = point.value;
    }

    // Compute per-dimension rarity
    const dimensions: RarityDimension[] = [];
    for (const point of styleDna.points) {
        const baseline = POPULATION_BASELINES[point.label];
        if (!baseline) continue;

        const percentile = normalCdfPercentile(
            point.value,
            baseline.mean,
            baseline.std,
        );
        // Distance from center = rarity
        const distancePercentile = normalCdfPercentile(
            Math.abs(point.value - baseline.mean),
            0,
            baseline.std,
        );

        dimensions.push({
            name: point.label,
            value: point.value,
            populationMean: baseline.mean,
            populationStd: baseline.std,
            percentile: distancePercentile,
            isRare: distancePercentile > 85 || distancePercentile < 15,
        });
    }

    // Combination rarity bonus
    // Certain combinations are rare: minimal+romantic, street+elegant
    const rareCombinations = [
        ["minimal", "feminine"],
        ["street", "elegant"],
        ["mode", "natural"],
        ["vintage", "techwear"],
    ];
    let combinationBonus = 0;
    const laneSet = new Set(lanes.map((l) => l.laneCode));
    for (const [a, b] of rareCombinations) {
        if (laneSet.has(a as StyleLaneCode) && laneSet.has(b as StyleLaneCode)) {
            combinationBonus += 15;
        }
    }

    // Contradiction level adds rarity
    const contradictionBonus = Math.min(
        15,
        contradictions.filter((c) => c.severity === "strong").length * 5 +
            contradictions.filter((c) => c.severity === "notable").length * 3,
    );

    // Wardrobe-derived rarity
    const wardrobeSignals = analyzeWardrobeRarity(wardrobe);
    const wardrobeBonus = wardrobeSignals.combinationRarityBonus;

    // Overall rarity = mean of dimension percentiles + bonuses
    const meanPercentile =
        dimensions.length > 0
            ? dimensions.reduce((s, d) => s + d.percentile, 0) /
              dimensions.length
            : 50;

    const overallRarity = Math.min(
        100,
        Math.round(
            meanPercentile +
                combinationBonus +
                contradictionBonus +
                wardrobeBonus,
        ),
    );

    // Find closest archetype
    let closestArchetype = ARCHETYPES[0];
    let closestDistance = Infinity;
    for (const archetype of ARCHETYPES) {
        const dist = euclideanDistance(userVector, archetype.vector);
        if (dist < closestDistance) {
            closestDistance = dist;
            closestArchetype = archetype;
        }
    }

    // Unique and common traits
    const uniqueTraits = dimensions
        .filter((d) => d.percentile > 75)
        .sort((a, b) => b.percentile - a.percentile)
        .slice(0, 4)
        .map((d) => {
            const direction =
                d.value > d.populationMean
                    ? d.name.split("\u2194")[1]?.trim()
                    : d.name.split("\u2194")[0]?.trim();
            return `${direction ?? d.name}\u5BFE\u308A\uFF08\u4E0A\u4F4D${100 - d.percentile}%\uFF09`;
        });

    // Add wardrobe-derived unique traits
    for (const colorCombo of wardrobeSignals.unusualColorCombinations) {
        uniqueTraits.push(colorCombo);
    }
    for (const mat of wardrobeSignals.rareMaterials) {
        uniqueTraits.push(`${mat}\u7D20\u6750\u3078\u306E\u96C6\u4E2D`);
    }
    if (wardrobeSignals.categoryDistributionAnomaly) {
        uniqueTraits.push(wardrobeSignals.categoryDistributionAnomaly);
    }

    const commonTraits = dimensions
        .filter((d) => d.percentile >= 30 && d.percentile <= 70)
        .slice(0, 3)
        .map((d) => d.name);

    return {
        overallRarity,
        rarityLabel: getRarityLabel(overallRarity),
        dimensions,
        uniqueTraits,
        commonTraits,
        archetypeMatch: closestArchetype.label,
        archetypeDistance: Math.round(closestDistance * 100) / 100,
    };
}

/**
 * Generate a compelling Japanese narrative about what makes this person's
 * style unique. Integrates DNA dimensions, wardrobe signals, and archetype
 * distance into a rich, personal story.
 */
export function getUniqueTraitNarrative(profile: RarityProfile): string {
    if (profile.dimensions.length === 0) {
        return "\u30C7\u30FC\u30BF\u304C\u5897\u3048\u308B\u3068\u3001\u3042\u306A\u305F\u306E\u30E6\u30CB\u30FC\u30AF\u3055\u304C\u898B\u3048\u3066\u304D\u307E\u3059\u3002";
    }

    const rarityPct = profile.overallRarity;
    const approxPct = Math.max(1, 100 - rarityPct);

    // Find the top 2 rare dimensions for narrative detail
    const rareDims = profile.dimensions
        .filter((d) => d.percentile > 70)
        .sort((a, b) => b.percentile - a.percentile)
        .slice(0, 2);

    // Build dimension detail snippet
    let dimDetail = "";
    if (rareDims.length >= 2) {
        const dir0 = rareDims[0].value > rareDims[0].populationMean
            ? rareDims[0].name.split("\u2194")[1]?.trim()
            : rareDims[0].name.split("\u2194")[0]?.trim();
        const dir1 = rareDims[1].value > rareDims[1].populationMean
            ? rareDims[1].name.split("\u2194")[1]?.trim()
            : rareDims[1].name.split("\u2194")[0]?.trim();
        if (dir0 && dir1) {
            dimDetail = `\u300C${dir0}\u300D\u3068\u300C${dir1}\u300D\u3092\u540C\u6642\u306B\u30B3\u30A2\u306B\u636E\u3048\u308B\u4EBA\u306F\u3001\u63A8\u5B9A\u3067\u5168\u4F53\u306E${approxPct < 10 ? approxPct.toFixed(1) : approxPct}%\u3002`;
        }
    } else if (rareDims.length === 1) {
        const dir0 = rareDims[0].value > rareDims[0].populationMean
            ? rareDims[0].name.split("\u2194")[1]?.trim()
            : rareDims[0].name.split("\u2194")[0]?.trim();
        if (dir0) {
            dimDetail = `\u300C${dir0}\u300D\u3078\u306E\u50BE\u5012\u304C\u7279\u306B\u5F37\u304F\u3001\u4E0A\u4F4D${100 - rareDims[0].percentile}%\u306B\u5165\u308B\u6C34\u6E96\u3067\u3059\u3002`;
        }
    }

    // Build wardrobe-specific detail
    const wardrobeDetails: string[] = [];
    for (const trait of profile.uniqueTraits) {
        if (trait.includes("\u7D20\u6750") || trait.includes("\u5171\u5B58") || trait.includes("%")) {
            wardrobeDetails.push(trait);
        }
    }
    const wardrobeSnippet =
        wardrobeDetails.length > 0
            ? `\u3057\u304B\u3082${wardrobeDetails[0]}\u306E\u306F\u3001\u3053\u306E\u7D44\u307F\u5408\u308F\u305B\u306E\u4E2D\u3067\u3082\u3055\u3089\u306B\u5E0C\u5C11\u3067\u3059\u3002`
            : "";

    if (rarityPct >= 80) {
        return `\u3042\u306A\u305F\u306E\u3088\u3046\u306A\u7D44\u307F\u5408\u308F\u305B\u306F\u3001\u63A8\u5B9A\u3067\u5168\u4F53\u306E${approxPct}%\u306E\u4EBA\u306B\u3057\u304B\u898B\u3089\u308C\u307E\u305B\u3093\u3002${dimDetail}${wardrobeSnippet}\u6700\u3082\u8FD1\u3044\u578B\u306F\u300C${profile.archetypeMatch}\u300D\u3067\u3059\u304C\u3001\u305D\u3053\u304B\u3089\u306E\u8DDD\u96E2\u304C${profile.archetypeDistance}\u2014\u2014\u578B\u306B\u53CE\u307E\u3089\u306A\u3044\u306E\u304C\u3042\u306A\u305F\u306E\u500B\u6027\u3067\u3059\u3002`;
    }
    if (rarityPct >= 50) {
        return `\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306F\u300C${profile.archetypeMatch}\u300D\u306B\u8FD1\u3044\u3067\u3059\u304C\u3001${dimDetail}${profile.uniqueTraits.length > 0 && !dimDetail ? `\u300C${profile.uniqueTraits[0]}\u300D\u306A\u3069\u306E` : ""}\u72EC\u81EA\u306E\u8981\u7D20\u304C\u3042\u306A\u305F\u3092\u5DEE\u5225\u5316\u3057\u3066\u3044\u307E\u3059\u3002${wardrobeSnippet}`;
    }
    return `\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306F\u300C${profile.archetypeMatch}\u300D\u306B\u8FD1\u3044\u3001\u591A\u304F\u306E\u4EBA\u3068\u5171\u901A\u3059\u308B\u5B89\u5B9A\u3057\u305F\u30D0\u30E9\u30F3\u30B9\u3067\u3059\u3002${wardrobeSnippet}\u3053\u308C\u306F\u60AA\u3044\u3053\u3068\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u2014\u2014\u78E8\u304D\u4E0A\u3052\u3089\u308C\u305F\u5B9A\u756A\u306E\u7F8E\u3057\u3055\u304C\u3042\u308A\u307E\u3059\u3002`;
}

/**
 * Analyze combination rarity: pairs/triples of dimensions that are
 * rare together even if individually common.
 */
export function analyzeCombinationRarity(
    profile: RarityProfile,
): Array<{ dimensions: string[]; combinedRarity: number; narrative: string }> {
    const results: Array<{
        dimensions: string[];
        combinedRarity: number;
        narrative: string;
    }> = [];

    const dims = profile.dimensions;
    if (dims.length < 2) return results;

    // Check pairs
    for (let i = 0; i < dims.length; i++) {
        for (let j = i + 1; j < dims.length; j++) {
            const a = dims[i];
            const b = dims[j];
            // Two dimensions that are both moderately unusual (>60th percentile)
            // become very unusual together (multiplicative)
            if (a.percentile > 60 && b.percentile > 60) {
                const combined = Math.min(
                    99,
                    Math.round(
                        100 -
                            ((100 - a.percentile) / 100) *
                                ((100 - b.percentile) / 100) *
                                100,
                    ),
                );
                if (combined >= 75) {
                    const dirA =
                        a.value > a.populationMean
                            ? a.name.split("\u2194")[1]?.trim()
                            : a.name.split("\u2194")[0]?.trim();
                    const dirB =
                        b.value > b.populationMean
                            ? b.name.split("\u2194")[1]?.trim()
                            : b.name.split("\u2194")[0]?.trim();
                    results.push({
                        dimensions: [a.name, b.name],
                        combinedRarity: combined,
                        narrative: `\u300C${dirA ?? a.name}\u300D\u3068\u300C${dirB ?? b.name}\u300D\u304C\u540C\u6642\u306B\u5F37\u3044\u4EBA\u306F\u3001\u5168\u4F53\u306E\u7D04${100 - combined}%\u3057\u304B\u3044\u307E\u305B\u3093\u3002`,
                    });
                }
            }
        }
    }

    // Sort by combined rarity descending
    results.sort((a, b) => b.combinedRarity - a.combinedRarity);
    return results.slice(0, 5);
}
