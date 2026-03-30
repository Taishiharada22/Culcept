/**
 * スタイルDNA — Style DNA Computation & Visualization Engine
 *
 * Combines swipe learning axes, identity tags, and wardrobe analysis
 * into a unified style DNA vector with blob visualization data.
 */

import type { SavedState, StyleLaneCode } from "./types";
import type { SwipeLearningState } from "./swipeLearningAxes";
import { AXIS_DEFINITIONS } from "./swipeLearningAxes";
import { getStyleLaneLabel } from "./catalog";

/* ── Types ── */

export type StyleDnaPoint = {
    angle: number;
    radius: number;
    label: string;
    value: number;
};

export type StyleDnaVector = {
    points: StyleDnaPoint[];
    catchphrase: string;
    dominantTraits: string[];
    overallIntensity: number;
    gradientColors: [string, string];
};

/* ── DNA dimension definitions ── */

type DnaDimension = {
    key: string;
    label: string;
    compute: (state: SavedState, swipe: SwipeLearningState | null) => number;
};

const DNA_DIMENSIONS: DnaDimension[] = [
    {
        key: "casual_mode",
        label: "カジュアル↔モード",
        compute: (_s, sw) => sw?.axes.casual_mode?.value ?? 0,
    },
    {
        key: "kirei_street",
        label: "きれいめ↔ストリート",
        compute: (_s, sw) => sw?.axes.kirei_street?.value ?? 0,
    },
    {
        key: "feminine_sharp",
        label: "フェミニン↔シャープ",
        compute: (_s, sw) => sw?.axes.feminine_sharp?.value ?? 0,
    },
    {
        key: "simple_decorative",
        label: "シンプル↔装飾的",
        compute: (_s, sw) => sw?.axes.simple_decorative?.value ?? 0,
    },
    {
        key: "classic_trend",
        label: "定番派↔流行派",
        compute: (_s, sw) => sw?.axes.classic_trend?.value ?? 0,
    },
    {
        key: "warm_cool",
        label: "暖色↔寒色",
        compute: (_s, sw) => sw?.axes.warm_cool?.value ?? 0,
    },
    {
        key: "minimal_maximal",
        label: "シンプル↔華やか",
        compute: (_s, sw) => sw?.axes.minimal_maximal?.value ?? 0,
    },
    {
        key: "identity_depth",
        label: "自己探求度",
        compute: (s) => {
            const tags =
                s.iam.likedTags.length +
                s.iam.dislikedTags.length +
                s.iseek.attractedWorldviews.length +
                s.ibecome.pairs.length;
            return Math.min(1, tags / 12) * 2 - 1;
        },
    },
    {
        key: "wardrobe_diversity",
        label: "多様性",
        compute: (s) => {
            const cats = new Set(s.wardrobe.map((i) => i.categoryMain || i.category));
            return Math.min(1, cats.size / 5) * 2 - 1;
        },
    },
    {
        key: "color_richness",
        label: "配色豊かさ",
        compute: (s) => {
            const colors = new Set(s.wardrobe.map((i) => i.color));
            return Math.min(1, colors.size / 8) * 2 - 1;
        },
    },
    {
        key: "unexpected_pull",
        label: "意外性",
        compute: (s) => {
            const pulls = s.unexpectedStyleLanes.length + s.iseek.unexpectedPulls.length;
            return Math.min(1, pulls / 4) * 2 - 1;
        },
    },
    {
        key: "style_depth",
        label: "スタイル深度",
        compute: (s) => {
            const core = s.styleSelections.filter((sl) => sl.bucket === "core").length;
            const rare = s.styleSelections.filter((sl) => sl.bucket === "rare").length;
            const secret = s.styleSelections.filter((sl) => sl.bucket === "secret").length;
            return Math.min(1, (core * 3 + rare * 2 + secret * 1) / 12) * 2 - 1;
        },
    },
];

/* ── Catchphrase dictionary ── */

type TraitWord = { condition: (v: number) => boolean; word: string };

const ADJECTIVE_MAP: Record<string, TraitWord[]> = {
    casual_mode: [
        { condition: (v) => v < -0.4, word: "自然体の" },
        { condition: (v) => v > 0.4, word: "研ぎ澄まされた" },
    ],
    kirei_street: [
        { condition: (v) => v < -0.4, word: "静謐な" },
        { condition: (v) => v > 0.4, word: "衝動的な" },
    ],
    feminine_sharp: [
        { condition: (v) => v < -0.4, word: "柔らかな" },
        { condition: (v) => v > 0.4, word: "鋭角的な" },
    ],
    simple_decorative: [
        { condition: (v) => v < -0.4, word: "削ぎ落とされた" },
        { condition: (v) => v > 0.4, word: "重層的な" },
    ],
    classic_trend: [
        { condition: (v) => v < -0.4, word: "不変の" },
        { condition: (v) => v > 0.4, word: "時代を纏う" },
    ],
    warm_cool: [
        { condition: (v) => v < -0.4, word: "温もりのある" },
        { condition: (v) => v > 0.4, word: "冷涼な" },
    ],
    minimal_maximal: [
        { condition: (v) => v < -0.4, word: "余白を活かした" },
        { condition: (v) => v > 0.4, word: "存在感に満ちた" },
    ],
};

const NOUN_POOL = [
    "美意識の持ち主",
    "スタイルの探求者",
    "感性の設計者",
    "佇まいの人",
    "世界観の体現者",
    "静かな革新者",
    "装いの哲学者",
];

function pickAdjectives(dimensions: Array<{ key: string; value: number }>): string[] {
    const results: string[] = [];
    for (const dim of dimensions) {
        const candidates = ADJECTIVE_MAP[dim.key];
        if (!candidates) continue;
        for (const c of candidates) {
            if (c.condition(dim.value)) {
                results.push(c.word);
                break;
            }
        }
    }
    return results.slice(0, 2);
}

/* ── Gradient color from dominant traits ── */

const TRAIT_COLORS: Record<string, [string, string]> = {
    casual_mode_neg: ["#f8b400", "#ff6b6b"],
    casual_mode_pos: ["#6c5ce7", "#2d3436"],
    kirei_street_neg: ["#c4b5fd", "#818cf8"],
    kirei_street_pos: ["#f97316", "#ef4444"],
    feminine_sharp_neg: ["#f9a8d4", "#f472b6"],
    feminine_sharp_pos: ["#475569", "#1e293b"],
    warm_cool_neg: ["#fbbf24", "#f97316"],
    warm_cool_pos: ["#60a5fa", "#818cf8"],
    default: ["#94a3b8", "#64748b"],
};

function pickGradientColors(dimensions: Array<{ key: string; value: number }>): [string, string] {
    const strongest = [...dimensions].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    if (!strongest || Math.abs(strongest.value) < 0.2) return TRAIT_COLORS.default;
    const suffix = strongest.value < 0 ? "_neg" : "_pos";
    return TRAIT_COLORS[strongest.key + suffix] ?? TRAIT_COLORS.default;
}

/* ── Public API ── */

export function computeStyleDna(
    state: SavedState,
    swipeState: SwipeLearningState | null,
): StyleDnaVector {
    const dimValues = DNA_DIMENSIONS.map((dim) => ({
        key: dim.key,
        label: dim.label,
        value: dim.compute(state, swipeState),
    }));

    // Generate blob points (12 equally spaced)
    const angleStep = (2 * Math.PI) / dimValues.length;
    const points: StyleDnaPoint[] = dimValues.map((dim, i) => ({
        angle: i * angleStep,
        radius: 0.3 + 0.7 * ((dim.value + 1) / 2), // normalize -1..+1 to 0.3..1.0
        label: dim.label,
        value: dim.value,
    }));

    // Catchphrase
    const adjectives = pickAdjectives(dimValues);
    const nounIndex = Math.abs(
        dimValues.reduce((sum, d) => sum + Math.round(d.value * 100), 0)
    ) % NOUN_POOL.length;
    const noun = NOUN_POOL[nounIndex];

    let catchphrase: string;
    if (adjectives.length >= 2) {
        catchphrase = `${adjectives[0]}中に${adjectives[1]}感性を忍ばせる${noun}`;
    } else if (adjectives.length === 1) {
        catchphrase = `${adjectives[0]}${noun}`;
    } else {
        catchphrase = `自分だけのスタイルを探している${noun}`;
    }

    // Dominant traits
    const dominantTraits = [...dimValues]
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 4)
        .map((d) => {
            const sign = d.value > 0 ? "+" : d.value < 0 ? "-" : "=";
            return `${d.label} ${sign}`;
        });

    // Overall intensity
    const overallIntensity =
        dimValues.reduce((sum, d) => sum + Math.abs(d.value), 0) / dimValues.length;

    const gradientColors = pickGradientColors(dimValues);

    return {
        points,
        catchphrase,
        dominantTraits,
        overallIntensity,
        gradientColors,
    };
}

/**
 * Generate SVG path data for the blob shape.
 * Uses cubic bezier curves between adjacent points.
 */
export function generateBlobPath(
    points: StyleDnaPoint[],
    cx: number,
    cy: number,
    baseRadius: number,
): string {
    if (points.length < 3) return "";

    const coords = points.map((p) => ({
        x: cx + Math.cos(p.angle - Math.PI / 2) * p.radius * baseRadius,
        y: cy + Math.sin(p.angle - Math.PI / 2) * p.radius * baseRadius,
    }));

    // Catmull-Rom to Bezier conversion for smooth blob
    const n = coords.length;
    const parts: string[] = [];
    parts.push(`M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`);

    for (let i = 0; i < n; i++) {
        const p0 = coords[(i - 1 + n) % n];
        const p1 = coords[i];
        const p2 = coords[(i + 1) % n];
        const p3 = coords[(i + 2) % n];

        const tension = 0.3;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        parts.push(
            `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
        );
    }

    parts.push("Z");
    return parts.join(" ");
}
