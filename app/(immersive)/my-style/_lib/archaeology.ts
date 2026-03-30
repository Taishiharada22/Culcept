/**
 * スタイル考古学 — Style Archaeology Engine
 *
 * Analyzes style evolution over time using state snapshots,
 * generates narrative descriptions and future predictions.
 */

import type { SavedState, StyleLaneCode, StyleSnapshot } from "./types";
import { getStyleLaneLabel } from "./catalog";

/* ── Types ── */

export type EraDefinition = {
    label: string;
    startDate: string;
    endDate: string;
    dominantLanes: StyleLaneCode[];
    wardrobeCount: number;
    adventureScore: number; // 0-1: how experimental this era was
    memo?: string;
};

export type StyleTransition = {
    fromEra: number;
    toEra: number;
    addedLanes: StyleLaneCode[];
    removedLanes: StyleLaneCode[];
    trigger?: string; // inferred trigger
    narrative: string;
};

export type JourneyPoint = {
    x: number; // normalized time 0-1
    y: number; // adventure score 0-1
    era: EraDefinition;
    index: number;
};

export type StyleJourney = {
    eras: EraDefinition[];
    transitions: StyleTransition[];
    journeyPoints: JourneyPoint[];
    overallNarrative: string;
    futurePrediction: string;
};

/* ── Era detection ── */

function computeAdventureScore(selections: SavedState["styleSelections"]): number {
    if (selections.length === 0) return 0;
    const rare = selections.filter((s) => s.bucket === "rare").length;
    const secret = selections.filter((s) => s.bucket === "secret").length;
    const total = selections.length;
    return Math.min(1, (rare * 0.3 + secret * 0.6) / Math.max(1, total * 0.3));
}

function extractErasFromSnapshots(snapshots: StyleSnapshot[]): EraDefinition[] {
    if (snapshots.length === 0) return [];

    return snapshots.map((snap, i) => {
        const lanes = snap.styleSelections?.map((s) => s.laneCode) ?? [];
        const unique = [...new Set(lanes)] as StyleLaneCode[];
        return {
            label: `Era ${i + 1}`,
            startDate: snap.timestamp,
            endDate: snapshots[i + 1]?.timestamp ?? new Date().toISOString(),
            dominantLanes: unique.slice(0, 4),
            wardrobeCount: snap.wardrobeCount ?? 0,
            adventureScore: computeAdventureScore(snap.styleSelections ?? []),
            memo: snap.memo,
        };
    });
}

/* ── Transition analysis ── */

const TRIGGER_MAP: Array<{ condition: (t: StyleTransition) => boolean; label: string }> = [
    { condition: (t) => t.addedLanes.length >= 3, label: "大きな転換期" },
    { condition: (t) => t.removedLanes.length >= 2, label: "断捨離期" },
    { condition: (t) => t.addedLanes.length === 0 && t.removedLanes.length === 0, label: "安定期" },
];

function inferTrigger(transition: StyleTransition): string {
    for (const t of TRIGGER_MAP) {
        if (t.condition(transition)) return t.label;
    }
    return "変化の兆し";
}

function analyzeTransitions(eras: EraDefinition[]): StyleTransition[] {
    const transitions: StyleTransition[] = [];
    for (let i = 0; i < eras.length - 1; i++) {
        const from = new Set(eras[i].dominantLanes);
        const to = new Set(eras[i + 1].dominantLanes);
        const added = eras[i + 1].dominantLanes.filter((l) => !from.has(l));
        const removed = eras[i].dominantLanes.filter((l) => !to.has(l));

        const t: StyleTransition = {
            fromEra: i,
            toEra: i + 1,
            addedLanes: added,
            removedLanes: removed,
            narrative: "",
        };

        t.trigger = inferTrigger(t);
        t.narrative = generateTransitionNarrative(t, eras[i], eras[i + 1]);
        transitions.push(t);
    }
    return transitions;
}

/* ── Narrative generation ── */

function generateTransitionNarrative(
    t: StyleTransition,
    fromEra: EraDefinition,
    toEra: EraDefinition,
): string {
    const parts: string[] = [];

    if (t.addedLanes.length > 0) {
        const names = t.addedLanes.map(getStyleLaneLabel).join("・");
        parts.push(`${names}に惹かれ始め`);
    }
    if (t.removedLanes.length > 0) {
        const names = t.removedLanes.map(getStyleLaneLabel).join("・");
        parts.push(`${names}から離れ`);
    }

    const adventureDelta = toEra.adventureScore - fromEra.adventureScore;
    if (adventureDelta > 0.2) {
        parts.push("冒険心が目覚めた");
    } else if (adventureDelta < -0.2) {
        parts.push("自分軸を固めた");
    }

    return parts.length > 0 ? parts.join("、") + "時期" : "静かな移行期";
}

function generateOverallNarrative(eras: EraDefinition[], transitions: StyleTransition[]): string {
    if (eras.length === 0) return "まだスタイルの旅は始まったばかり。";
    if (eras.length === 1) return "スタイルの探求がスタート。ここから物語が紡がれていく。";

    const avgAdventure = eras.reduce((s, e) => s + e.adventureScore, 0) / eras.length;
    const maxAdventureEra = eras.reduce((a, b) => (a.adventureScore > b.adventureScore ? a : b));
    const recentEra = eras[eras.length - 1];

    const parts: string[] = [];
    parts.push(`${eras.length}つの時代を経て`);

    if (avgAdventure > 0.5) {
        parts.push("常に新しい表現を求め続けてきた");
    } else {
        parts.push("着実に自分らしさを深めてきた");
    }

    if (recentEra.dominantLanes.length > 0) {
        const current = recentEra.dominantLanes.map(getStyleLaneLabel).join("・");
        parts.push(`今は${current}の世界にいる`);
    }

    return parts.join("。") + "。";
}

function generateFuturePrediction(eras: EraDefinition[]): string {
    if (eras.length < 2) return "データが蓄積されると、スタイルの未来が見えてくる。";

    const recent = eras.slice(-3);
    const trend = recent.reduce((sum, e, i) => sum + e.adventureScore * (i + 1), 0) / recent.length;

    if (trend > 0.6) {
        return "まだ見ぬスタイル領域への探求が続きそう。次の変化は近い。";
    } else if (trend > 0.3) {
        return "好みの軸がより鮮明になりつつある。ここから深化のフェーズへ。";
    } else {
        return "確立されたスタイル哲学。微細な変化の中に次の進化の種がある。";
    }
}

/* ── Public API ── */

export function analyzeStyleJourney(state: SavedState): StyleJourney {
    const snapshots = state.styleSnapshots ?? [];
    const eras = extractErasFromSnapshots(snapshots);
    const transitions = analyzeTransitions(eras);

    // Generate journey points for visualization
    const journeyPoints: JourneyPoint[] = eras.map((era, i) => ({
        x: eras.length <= 1 ? 0.5 : i / (eras.length - 1),
        y: era.adventureScore,
        era,
        index: i,
    }));

    return {
        eras,
        transitions,
        journeyPoints,
        overallNarrative: generateOverallNarrative(eras, transitions),
        futurePrediction: generateFuturePrediction(eras),
    };
}

/** Take a snapshot of the current state for history */
export function takeStyleSnapshot(state: SavedState): StyleSnapshot {
    return {
        timestamp: new Date().toISOString(),
        styleSelections: [...state.styleSelections],
        wardrobeCount: state.wardrobe.length,
        memo: undefined,
    };
}
