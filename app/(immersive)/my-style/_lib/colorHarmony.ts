/**
 * 色彩調和 — Color Harmony Analysis
 *
 * Provides hex→HSL conversion and color harmony scoring
 * for the flat lay composer and outfit intelligence features.
 */

/* ── Types ── */

export type HSL = { h: number; s: number; l: number };

export type ColorHarmonyResult = {
    score: number; // 0-100
    type: HarmonyType;
    label: string;
    suggestion?: string;
};

export type HarmonyType =
    | "complementary"
    | "analogous"
    | "triadic"
    | "split-complementary"
    | "monochromatic"
    | "neutral"
    | "clash";

/* ── Conversion ── */

export function hexToHsl(hex: string): HSL {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;

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

export function hslToHex(hsl: HSL): string {
    const { h, s, l } = hsl;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ── Harmony analysis ── */

function hueDiff(h1: number, h2: number): number {
    const diff = Math.abs(h1 - h2);
    return Math.min(diff, 360 - diff);
}

function isNeutral(hsl: HSL): boolean {
    return hsl.s < 0.1 || hsl.l < 0.1 || hsl.l > 0.9;
}

export function analyzeColorPair(hex1: string, hex2: string): ColorHarmonyResult {
    const c1 = hexToHsl(hex1);
    const c2 = hexToHsl(hex2);

    // Handle neutrals
    if (isNeutral(c1) || isNeutral(c2)) {
        return { score: 85, type: "neutral", label: "ニュートラル調和" };
    }

    const diff = hueDiff(c1.h, c2.h);

    // Monochromatic (same hue family)
    if (diff < 15) {
        const toneContrast = Math.abs(c1.l - c2.l);
        return {
            score: 75 + toneContrast * 25,
            type: "monochromatic",
            label: "同系色調和",
            suggestion: toneContrast < 0.2 ? "明暗差をつけるとメリハリが出ます" : undefined,
        };
    }

    // Analogous (30-60 degrees)
    if (diff < 60) {
        return { score: 80 + (60 - diff) / 3, type: "analogous", label: "類似色調和" };
    }

    // Triadic (around 120 degrees)
    if (diff >= 100 && diff <= 140) {
        return { score: 75, type: "triadic", label: "トライアド調和" };
    }

    // Split-complementary (around 150 degrees)
    if (diff >= 140 && diff <= 170) {
        return { score: 78, type: "split-complementary", label: "分裂補色調和" };
    }

    // Complementary (around 180 degrees)
    if (diff >= 170) {
        return { score: 82, type: "complementary", label: "補色調和" };
    }

    // Clash zone (60-100 degrees — awkward range)
    return {
        score: 45 + diff / 5,
        type: "clash",
        label: "要注意の組み合わせ",
        suggestion: "間にニュートラルカラーを挟むとまとまりが出ます",
    };
}

/** Analyze harmony of multiple colors together */
export function analyzeColorGroup(hexColors: string[]): {
    overallScore: number;
    pairs: Array<{ hex1: string; hex2: string; result: ColorHarmonyResult }>;
    dominantHarmony: HarmonyType;
    suggestion: string;
} {
    if (hexColors.length < 2) {
        return {
            overallScore: 100,
            pairs: [],
            dominantHarmony: "neutral",
            suggestion: "もう1色追加すると調和分析ができます",
        };
    }

    const pairs: Array<{ hex1: string; hex2: string; result: ColorHarmonyResult }> = [];

    for (let i = 0; i < hexColors.length; i++) {
        for (let j = i + 1; j < hexColors.length; j++) {
            pairs.push({
                hex1: hexColors[i],
                hex2: hexColors[j],
                result: analyzeColorPair(hexColors[i], hexColors[j]),
            });
        }
    }

    const overallScore = Math.round(
        pairs.reduce((sum, p) => sum + p.result.score, 0) / pairs.length,
    );

    // Count harmony types
    const typeCounts = new Map<HarmonyType, number>();
    for (const p of pairs) {
        typeCounts.set(p.result.type, (typeCounts.get(p.result.type) ?? 0) + 1);
    }

    const dominantHarmony = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";

    const suggestion =
        overallScore >= 80
            ? "素晴らしい配色バランスです"
            : overallScore >= 60
              ? "まとまりのある配色です。アクセントを意識するとさらに良くなります"
              : "ニュートラルカラーの追加で調和が取れます";

    return { overallScore, pairs, dominantHarmony, suggestion };
}

/** Get formality level from color */
export function getColorFormality(hex: string): number {
    const hsl = hexToHsl(hex);
    // Dark, desaturated = formal; Bright, saturated = casual
    const formalityFromLightness = 1 - hsl.l;
    const formalityFromSaturation = 1 - hsl.s * 0.5;
    return (formalityFromLightness + formalityFromSaturation) / 2;
}
