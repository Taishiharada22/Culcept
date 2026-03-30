/**
 * 矛盾検出エンジン — Contradiction Detector
 *
 * Compares swipe learning patterns with stated identity preferences
 * to surface unconscious discrepancies and deeper truths.
 */

import type { SavedState } from "./types";
import type { SwipeLearningState } from "./swipeLearningAxes";
import { getCardAxisDeltas } from "./cardAttributeMap";

export type Contradiction = {
    id: string;
    axisKey: string;
    axisLabel: string;
    swipeDirection: number;
    statedPreference: number;
    severity: "mild" | "notable" | "strong";
    insight: string;
};

const AXIS_LABELS: Record<string, [string, string]> = {
    casual_mode: ["カジュアル", "モード"],
    kirei_street: ["きれいめ", "ストリート"],
    feminine_sharp: ["フェミニン", "シャープ"],
    simple_decorative: ["シンプル", "装飾的"],
    classic_trend: ["定番派", "流行派"],
    tight_oversized: ["タイト", "オーバーサイズ"],
    warm_cool: ["暖色", "寒色"],
    minimal_maximal: ["シンプル", "華やか"],
};

/**
 * Detect contradictions between swipe behavior and stated preferences.
 */
export function detectContradictions(
    swipeState: SwipeLearningState | null,
    savedState: SavedState,
): Contradiction[] {
    if (!swipeState) return [];

    const contradictions: Contradiction[] = [];

    // Compute stated preference direction from identity tags
    const statedAxes: Record<string, number> = {};
    const allTags = [
        ...savedState.iam.likedTags.map((t) => t.code),
        ...savedState.iam.naturalSelfTags.map((t) => t.code),
        ...savedState.iseek.attractedElements.map((t) => t.code),
    ];

    // Aggregate tag axis deltas
    const deltas = getCardAxisDeltas(allTags);
    for (const delta of deltas) {
        statedAxes[delta.axis] = (statedAxes[delta.axis] ?? 0) + delta.delta;
    }

    // Normalize stated preferences to -1..+1 range
    for (const key of Object.keys(statedAxes)) {
        statedAxes[key] = Math.max(-1, Math.min(1, statedAxes[key]));
    }

    // Compare with swipe learning axes
    for (const [key, labels] of Object.entries(AXIS_LABELS)) {
        const swipeAxis = swipeState.axes[key];
        const stated = statedAxes[key];

        if (!swipeAxis || swipeAxis.confidence < 0.3) continue;
        if (stated === undefined || Math.abs(stated) < 0.2) continue;

        const diff = Math.abs(swipeAxis.value - stated);

        if (diff < 0.5) continue;

        const severity: Contradiction["severity"] =
            diff >= 0.9 ? "strong" : diff >= 0.7 ? "notable" : "mild";

        const swipeLabel = swipeAxis.value < 0 ? labels[0] : labels[1];
        const statedLabel = stated < 0 ? labels[0] : labels[1];

        const insight = buildInsight(key, swipeLabel, statedLabel, severity);

        contradictions.push({
            id: `c_${key}`,
            axisKey: key,
            axisLabel: `${labels[0]} ⟷ ${labels[1]}`,
            swipeDirection: swipeAxis.value,
            statedPreference: stated,
            severity,
            insight,
        });
    }

    // Sort by severity
    const severityOrder = { strong: 0, notable: 1, mild: 2 };
    contradictions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return contradictions;
}

function buildInsight(
    _key: string,
    swipeLabel: string,
    statedLabel: string,
    severity: Contradiction["severity"],
): string {
    if (severity === "strong") {
        return `言葉では「${statedLabel}」を好むと表現していますが、直感的には「${swipeLabel}」に強く惹かれています。無自覚の本音かもしれません。`;
    }
    if (severity === "notable") {
        return `「${statedLabel}」寄りの自己認識がありつつ、スワイプでは「${swipeLabel}」を選ぶ傾向。意識と直感のズレが興味深いです。`;
    }
    return `「${statedLabel}」志向と言いつつ、「${swipeLabel}」にもやや惹かれるようです。`;
}

/**
 * Get a summary insight for display.
 */
export function getContradictionSummary(contradictions: Contradiction[]): string | null {
    if (contradictions.length === 0) return null;
    const strong = contradictions.filter((c) => c.severity === "strong");
    if (strong.length > 0) {
        return `${strong.length}件の顕著な矛盾を検出 — あなたの無自覚な好みが見えてきました`;
    }
    return `${contradictions.length}件の微細なズレを検出 — 意識と直感の差から本音が浮かびます`;
}
