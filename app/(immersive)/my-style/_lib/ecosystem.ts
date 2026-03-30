/**
 * エコシステム・ブリッジ — Cross-Feature Integration Layer
 *
 * Connects Style DNA, Personas, Archaeology, Outfit Intelligence,
 * and Material Literacy into a unified ecosystem.
 */

import type { SavedState, SuggestedOutfit } from "./types";
import type { SwipeLearningState } from "./swipeLearningAxes";
import { computeStyleDna, type StyleDnaVector } from "./styleDna";
import { buildAllPersonaProfiles } from "./personaEngine";
import { analyzeStyleJourney } from "./archaeology";
import { analyzeMaterialTendency, MATERIAL_DB } from "./materialGuide";
import { generateOutfitSuggestions, analyzeWardrobeGaps } from "./outfitIntelligence";

/* ── Types ── */

export type EcosystemInsight = {
    type: "discovery" | "growth" | "contradiction" | "connection" | "prediction";
    title: string;
    description: string;
    emoji: string;
    priority: number; // 0-100, higher = more important
    relatedFeatures: string[];
};

export type EcosystemSnapshot = {
    insights: EcosystemInsight[];
    dnaPersonaAlignment: number; // 0-1: how well DNA matches active persona
    journeyMomentum: "accelerating" | "stable" | "exploring" | "dormant";
    materialDnaConnection: string | null; // narrative connecting material prefs to DNA
    outfitDnaBoost: SuggestedOutfit[]; // outfits that amplify DNA identity
};

/* ── DNA → Persona alignment ── */

function computeDnaPersonaAlignment(
    dna: StyleDnaVector,
    state: SavedState,
): number {
    const profiles = buildAllPersonaProfiles(state);
    if (profiles.length === 0) return 0;

    // Top DNA points sorted by absolute value
    const dnaTopPoints = [...dna.points]
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 4)
        .map(p => p.label.toLowerCase());

    let matchCount = 0;
    let totalChecks = 0;
    for (const profile of profiles) {
        for (const lane of profile.styleLanes) {
            totalChecks++;
            // Match lane codes against top DNA point labels
            const laneInDna = dnaTopPoints.some(label =>
                lane.toLowerCase().includes(label.substring(0, 4)) ||
                label.includes(lane.toLowerCase().substring(0, 4))
            );
            if (laneInDna) matchCount++;
        }
    }

    return totalChecks === 0 ? 0 : Math.min(1, matchCount / Math.max(1, totalChecks * 0.5));
}

/* ── Journey momentum ── */

function detectJourneyMomentum(state: SavedState): EcosystemSnapshot["journeyMomentum"] {
    const journey = analyzeStyleJourney(state);
    if (journey.eras.length < 2) return "dormant";

    const recent = journey.eras.slice(-2);
    const recentAdventure = recent.reduce((s, e) => s + e.adventureScore, 0) / recent.length;
    const allAdventure = journey.eras.reduce((s, e) => s + e.adventureScore, 0) / journey.eras.length;

    if (recentAdventure > allAdventure + 0.15) return "accelerating";
    if (recentAdventure < allAdventure - 0.15) return "exploring";
    return "stable";
}

/* ── Material ↔ DNA narrative ── */

function buildMaterialDnaNarrative(state: SavedState, dna: StyleDnaVector): string | null {
    const wardrobeMaterials: string[] = [];
    for (const item of state.wardrobe) {
        for (const mf of item.materialFamily ?? []) {
            const key = mf.replace(/^material\./, "").toLowerCase().replace(/[\s_]+/g, "");
            if (MATERIAL_DB.some(m => m.key === key)) wardrobeMaterials.push(key);
        }
    }

    if (wardrobeMaterials.length < 2) return null;

    const tendency = analyzeMaterialTendency(wardrobeMaterials);
    const warmthHigh = tendency.avgAxes.warmth > 0.6;
    const lusterHigh = tendency.avgAxes.luster > 0.6;

    // Find the casual_mode point in DNA points array
    const casualPoint = dna.points.find(p => p.label.includes("カジュアル"));
    const casualDna = casualPoint?.value ?? 0;

    if (warmthHigh && casualDna > 0.3) {
        return "暖かみのある素材選びが、カジュアルで親しみやすいDNAを強化している";
    }
    if (lusterHigh && casualDna < -0.2) {
        return "光沢のある素材が、洗練されたクリーンなDNAに共鳴している";
    }
    if (tendency.avgAxes.drape > 0.6) {
        return "ドレープ性の高い素材が、流れるようなスタイルDNAを形作っている";
    }

    return "素材選びにはまだ明確なDNAとの呼応が見えていない — 意識的な選択が鍵";
}

/* ── Insight generation ── */

function generateEcosystemInsights(
    state: SavedState,
    dna: StyleDnaVector,
    swipeState: SwipeLearningState | null,
): EcosystemInsight[] {
    const insights: EcosystemInsight[] = [];

    // 1. Persona diversity insight
    const profiles = buildAllPersonaProfiles(state);
    const allLanes = profiles.flatMap(p => p.styleLanes);
    const uniqueLanes = new Set(allLanes);
    if (uniqueLanes.size >= 4 && profiles.length >= 2) {
        insights.push({
            type: "discovery",
            title: "ペルソナの多面性",
            description: `${uniqueLanes.size}種類のスタイルレーンを使い分けている — 場面ごとに別の自分を演じる力がある`,
            emoji: "🎭",
            priority: 75,
            relatedFeatures: ["persona", "dna"],
        });
    }

    // 2. Wardrobe gap × DNA mismatch
    const gaps = analyzeWardrobeGaps(state.wardrobe);
    const dnaTop = [...dna.points].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    if (gaps.length > 0 && dnaTop) {
        insights.push({
            type: "growth",
            title: "DNA と持ち物のギャップ",
            description: `${dnaTop.label}が強いのに、${gaps[0].category}が足りていない — ここを埋めるとDNAがさらに鮮明になる`,
            emoji: "🔍",
            priority: 80,
            relatedFeatures: ["outfit", "dna", "wardrobe"],
        });
    }

    // 3. Journey prediction
    const journey = analyzeStyleJourney(state);
    if (journey.eras.length >= 2) {
        insights.push({
            type: "prediction",
            title: "スタイル軌道の予測",
            description: journey.futurePrediction,
            emoji: "🔮",
            priority: 60,
            relatedFeatures: ["archaeology", "dna"],
        });
    }

    // 4. Material affinity
    const materialNarrative = buildMaterialDnaNarrative(state, dna);
    if (materialNarrative) {
        insights.push({
            type: "connection",
            title: "素材とDNAの共鳴",
            description: materialNarrative,
            emoji: "🧬",
            priority: 65,
            relatedFeatures: ["material", "dna"],
        });
    }

    // 5. Catchphrase evolution
    if (dna.catchphrase && journey.eras.length > 0) {
        insights.push({
            type: "discovery",
            title: "いまの自分を一言で",
            description: `「${dna.catchphrase}」— これが今のスタイルDNAが導き出した言葉`,
            emoji: "✨",
            priority: 90,
            relatedFeatures: ["dna"],
        });
    }

    return insights.sort((a, b) => b.priority - a.priority);
}

/* ── Public API ── */

export function buildEcosystemSnapshot(
    state: SavedState,
    swipeState: SwipeLearningState | null,
): EcosystemSnapshot {
    const dna = computeStyleDna(state, swipeState);
    const alignment = computeDnaPersonaAlignment(dna, state);
    const momentum = detectJourneyMomentum(state);
    const materialNarrative = buildMaterialDnaNarrative(state, dna);
    const insights = generateEcosystemInsights(state, dna, swipeState);

    // DNA-boosted outfit suggestions
    const outfitDnaBoost = generateOutfitSuggestions(state.wardrobe, {}, 3);

    return {
        insights,
        dnaPersonaAlignment: alignment,
        journeyMomentum: momentum,
        materialDnaConnection: materialNarrative,
        outfitDnaBoost,
    };
}
