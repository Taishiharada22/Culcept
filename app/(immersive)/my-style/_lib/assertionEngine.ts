/**
 * 断言インサイトエンジン — Assertion Engine
 *
 * Generate bold, personal "You are X" statements that feel like
 * the app truly KNOWS the user, backed by concrete data evidence.
 */

import type { SavedState, StyleLaneCode } from "./types";
import type { SwipeLearningState } from "./swipeLearningAxes";
import type { Contradiction } from "./contradictionDetector";
import type { StyleDnaVector } from "./styleDna";
import type { PersonaProfile, CrossPersonaAnalysis } from "./personaEngine";
import { getStyleLaneLabel } from "./catalog";
import { uid } from "./constants";

/* ── Types ── */

export type AssertionCategory =
    | "identity"
    | "pattern"
    | "hidden"
    | "evolution"
    | "contradiction";

export type UserReaction = "agree" | "surprise" | "disagree";

export interface AssertionInsight {
    id: string;
    statement: string;
    evidence: string[];
    category: AssertionCategory;
    confidence: number;
    generatedAt: string;
    userReaction?: UserReaction;
    shareable: boolean;
}

export interface ShareCardData {
    title: string;
    statement: string;
    gradient: [string, string];
    icon: string;
    evidence: string[];
}

const ASSERTION_STORAGE_KEY = "culcept_assertion_insights_v1";
const ASSERTION_REACTION_KEY = "culcept_assertion_reactions_v1";

/* ── Category visual metadata ── */

const CATEGORY_META: Record<
    AssertionCategory,
    { icon: string; gradient: [string, string] }
> = {
    identity: {
        icon: "\u{1F3AF}",
        gradient: ["#6366f1", "#8b5cf6"],
    },
    pattern: {
        icon: "\u{1F52E}",
        gradient: ["#0ea5e9", "#6366f1"],
    },
    hidden: {
        icon: "\u{1F30C}",
        gradient: ["#ec4899", "#8b5cf6"],
    },
    evolution: {
        icon: "\u{1F331}",
        gradient: ["#10b981", "#0ea5e9"],
    },
    contradiction: {
        icon: "\u{1F300}",
        gradient: ["#f59e0b", "#ef4444"],
    },
};

/* ── Helpers ── */

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function dayOfWeekLabel(date: Date): string {
    const labels = [
        "\u65E5\u66DC\u65E5",
        "\u6708\u66DC\u65E5",
        "\u706B\u66DC\u65E5",
        "\u6C34\u66DC\u65E5",
        "\u6728\u66DC\u65E5",
        "\u91D1\u66DC\u65E5",
        "\u571F\u66DC\u65E5",
    ];
    return labels[date.getDay()] ?? "";
}

/* ── Identity assertions (from I am / I seek / I become) ── */

function generateIdentityAssertions(state: SavedState): AssertionInsight[] {
    const results: AssertionInsight[] = [];
    const liked = state.iam.likedTags;
    const disliked = state.iam.dislikedTags;
    const desired = state.iam.desiredImpressions;
    const attracted = state.iseek.attractedWorldviews;
    const unexpected = state.iseek.unexpectedPulls;

    // Strong self-identity assertion
    if (liked.length >= 3 && desired.length >= 1) {
        const likedLabels = liked.slice(0, 3).map((t) => t.code);
        const desiredLabel = desired[0].code;
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306F\u300C${likedLabels.join("\u30FB")}\u300D\u3092\u7E4A\u3044\u306A\u304C\u3089\u3001\u300C${desiredLabel}\u300D\u3068\u3044\u3046\u5370\u8C61\u3092\u6B8B\u305D\u3046\u3068\u3059\u308B\u4EBA\u3067\u3059`,
            evidence: [
                `\u597D\u304D\u306A\u8981\u7D20\u306B${liked.length}\u500B\u306E\u30BF\u30B0\u3092\u9078\u629E`,
                `\u300C${desiredLabel}\u300D\u3092\u7B2C\u4E00\u306E\u5370\u8C61\u76EE\u6A19\u306B\u8A2D\u5B9A`,
            ],
            category: "identity",
            confidence: clamp01(0.6 + liked.length * 0.05),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    // Hidden desire assertion
    if (unexpected.length >= 1 && liked.length >= 2) {
        const mainStyle = liked[0].code;
        const pullLabel = unexpected[0].code;
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u304C\u672C\u5F53\u306B\u6C42\u3081\u3066\u3044\u308B\u306E\u306F\u300C${mainStyle}\u300D\u3067\u306F\u306A\u304F\u300C${mainStyle}\u306B\u898B\u3048\u308B${pullLabel}\u300D\u3067\u3059`,
            evidence: [
                `\u4E3B\u8EF8\u306F\u300C${mainStyle}\u300D\u3060\u304C\u300C${pullLabel}\u300D\u3078\u306E\u5F15\u529B\u304C\u8A18\u9332\u3055\u308C\u3066\u3044\u308B`,
                `\u610F\u5916\u306A\u60F9\u304B\u308C\u3068\u3057\u3066${unexpected.length}\u4EF6\u767B\u9332\u6E08\u307F`,
            ],
            category: "hidden",
            confidence: clamp01(0.55 + unexpected.length * 0.1),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    // Avoidance-based identity
    if (disliked.length >= 2) {
        const avoidLabels = disliked.slice(0, 2).map((t) => t.code);
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306F\u300C${avoidLabels.join("\u300D\u3068\u300C")}\u300D\u3092\u907F\u3051\u308B\u3053\u3068\u3067\u3001\u81EA\u5206\u306E\u8F2A\u90ED\u3092\u5B88\u3063\u3066\u3044\u308B\u4EBA\u3067\u3059`,
            evidence: [
                `${disliked.length}\u500B\u306E\u300C\u907F\u3051\u305F\u3044\u300D\u8981\u7D20\u3092\u660E\u78BA\u306B\u8A2D\u5B9A`,
                `\u597D\u304D\u3088\u308A\u5ACC\u3044\u304C\u81EA\u5DF1\u5B9A\u7FA9\u3092\u5F62\u4F5C\u3063\u3066\u3044\u308B\u50BE\u5411`,
            ],
            category: "identity",
            confidence: clamp01(0.5 + disliked.length * 0.07),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    // I become pattern
    if (state.ibecome.pairs.length >= 2) {
        const topPair = state.ibecome.pairs[0];
        const triggerLabel = topPair.triggerTags[0]?.code ?? "?";
        const resultLabel = topPair.resultTags[0]?.code ?? "?";
        results.push({
            id: uid(),
            statement: `\u300C${triggerLabel}\u300D\u306B\u89E6\u308C\u308B\u3068\u300C${resultLabel}\u300D\u306B\u5909\u5316\u3059\u308B\u2014\u2014\u305D\u308C\u304C\u3042\u306A\u305F\u306E\u5909\u5BB9\u306E\u516C\u5F0F\u3067\u3059`,
            evidence: [
                `I BECOME\u306B${state.ibecome.pairs.length}\u4EF6\u306E\u5909\u5316\u30D1\u30BF\u30FC\u30F3\u3092\u8A18\u9332`,
                `\u6700\u512A\u5148\u306E\u5909\u5316: ${triggerLabel} \u2192 ${resultLabel}`,
            ],
            category: "evolution",
            confidence: clamp01(0.6 + state.ibecome.pairs.length * 0.08),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    return results;
}

/* ── Style DNA-based assertions ── */

function generateDnaAssertions(
    dna: StyleDnaVector | null,
    state: SavedState,
): AssertionInsight[] {
    if (!dna || dna.points.length === 0) return [];
    const results: AssertionInsight[] = [];

    // Find strongest dimension
    const sorted = [...dna.points].sort(
        (a, b) => Math.abs(b.value) - Math.abs(a.value),
    );
    const strongest = sorted[0];
    const secondStrongest = sorted[1];

    if (strongest && Math.abs(strongest.value) > 0.3) {
        const direction =
            strongest.value > 0
                ? strongest.label.split("\u2194")[1]?.trim()
                : strongest.label.split("\u2194")[0]?.trim();
        if (direction) {
            results.push({
                id: uid(),
                statement: `\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306F\u300C\u9759\u3051\u3055\u306E\u4E2D\u306B${direction}\u3092\u96A0\u3059\u300D\u30BF\u30A4\u30D7\u3067\u3059`,
                evidence: [
                    `DNA\u5206\u6790\u3067\u300C${strongest.label}\u300D\u8EF8\u306E\u5F37\u5EA6\u304C${Math.round(Math.abs(strongest.value) * 100)}%`,
                    dna.catchphrase
                        ? `\u7DCF\u5408\u30AD\u30E3\u30C3\u30C1\u30D5\u30EC\u30FC\u30BA: \u300C${dna.catchphrase}\u300D`
                        : "\u7DCF\u5408\u7684\u306A\u30B9\u30BF\u30A4\u30EBDNA\u304B\u3089\u5C0E\u51FA",
                ],
                category: "identity",
                confidence: clamp01(0.5 + Math.abs(strongest.value) * 0.4),
                generatedAt: new Date().toISOString(),
                shareable: true,
            });
        }
    }

    // Combination assertion
    if (
        strongest &&
        secondStrongest &&
        Math.abs(strongest.value) > 0.3 &&
        Math.abs(secondStrongest.value) > 0.25
    ) {
        const dir1 =
            strongest.value > 0
                ? strongest.label.split("\u2194")[1]?.trim()
                : strongest.label.split("\u2194")[0]?.trim();
        const dir2 =
            secondStrongest.value > 0
                ? secondStrongest.label.split("\u2194")[1]?.trim()
                : secondStrongest.label.split("\u2194")[0]?.trim();
        if (dir1 && dir2) {
            results.push({
                id: uid(),
                statement: `\u300C${dir1}\u300D\u3068\u300C${dir2}\u300D\u306E\u7D44\u307F\u5408\u308F\u305B\u2014\u2014\u305D\u308C\u306F\u3042\u306A\u305F\u3060\u3051\u306E\u7F8E\u610F\u8B58\u306E\u914D\u5408\u3067\u3059`,
                evidence: [
                    `\u300C${strongest.label}\u300D\u8EF8: ${Math.round(Math.abs(strongest.value) * 100)}%\u306E\u5F37\u5EA6`,
                    `\u300C${secondStrongest.label}\u300D\u8EF8: ${Math.round(Math.abs(secondStrongest.value) * 100)}%\u306E\u5F37\u5EA6`,
                    `\u3053\u306E2\u8EF8\u306E\u7D44\u307F\u5408\u308F\u305B\u304C\u3042\u306A\u305F\u306EDNA\u306E\u4E2D\u5FC3`,
                ],
                category: "pattern",
                confidence: clamp01(
                    0.55 +
                        (Math.abs(strongest.value) +
                            Math.abs(secondStrongest.value)) *
                            0.2,
                ),
                generatedAt: new Date().toISOString(),
                shareable: true,
            });
        }
    }

    return results;
}

/* ── Contradiction-based assertions ── */

function generateContradictionAssertions(
    contradictions: Contradiction[],
): AssertionInsight[] {
    const results: AssertionInsight[] = [];

    for (const c of contradictions.slice(0, 2)) {
        const labels = c.axisLabel.split(" \u27F7 ");
        const swipeLabel =
            c.swipeDirection < 0 ? labels[0] : labels[1] ?? labels[0];
        const statedLabel =
            c.statedPreference < 0 ? labels[0] : labels[1] ?? labels[0];

        if (c.severity === "strong") {
            results.push({
                id: uid(),
                statement: `\u8868\u3067\u306F\u300C${statedLabel}\u300D\u3092\u597D\u3080\u306E\u306B\u3001\u79D8\u5BC6\u306E\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306B\u306F\u300C${swipeLabel}\u300D\u304C\u6EA2\u308C\u3066\u3044\u308B\u2014\u2014\u305D\u308C\u304C\u3042\u306A\u305F\u306E\u672C\u8CEA\u3067\u3059`,
                evidence: [
                    `\u81EA\u5DF1\u7533\u544A\u3067\u306F\u300C${statedLabel}\u300D\u5BC4\u308A\u3060\u304C\u3001\u30B9\u30EF\u30A4\u30D7\u3067\u306F\u300C${swipeLabel}\u300D\u3092\u7E70\u308A\u8FD4\u3057\u9078\u629E`,
                    `\u4E56\u96E2\u5EA6: ${c.severity}\uFF08${Math.round(Math.abs(c.swipeDirection - c.statedPreference) * 100)}%\uFF09`,
                ],
                category: "contradiction",
                confidence: clamp01(0.7),
                generatedAt: new Date().toISOString(),
                shareable: true,
            });
        } else {
            results.push({
                id: uid(),
                statement: `\u300C${statedLabel}\u300D\u3068\u300C${swipeLabel}\u300D\u306E\u9593\u3067\u63FA\u308C\u3066\u3044\u308B\u3042\u306A\u305F\u3002\u305D\u306E\u63FA\u308C\u3053\u305D\u304C\u6DF1\u3055\u306E\u8A3C\u3067\u3059`,
                evidence: [
                    c.insight,
                    `\u300C${c.axisLabel}\u300D\u8EF8\u3067\u691C\u51FA\u3055\u308C\u305F\u30BA\u30EC`,
                ],
                category: "contradiction",
                confidence: clamp01(0.5),
                generatedAt: new Date().toISOString(),
                shareable: true,
            });
        }
    }

    return results;
}

/* ── Wardrobe pattern assertions ── */

function generateWardrobeAssertions(state: SavedState): AssertionInsight[] {
    const results: AssertionInsight[] = [];
    const wardrobe = state.wardrobe;

    if (wardrobe.length < 3) return results;

    // Color dominance
    const colorCounts = new Map<string, number>();
    for (const item of wardrobe) {
        const color = item.colorName ?? item.color;
        colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
    }
    const sortedColors = [...colorCounts.entries()].sort(
        (a, b) => b[1] - a[1],
    );
    const topColor = sortedColors[0];
    if (topColor && topColor[1] >= 3) {
        const ratio = Math.round((topColor[1] / wardrobe.length) * 100);
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306E\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306E${ratio}%\u306F\u300C${topColor[0]}\u300D\u2014\u2014\u305D\u308C\u306F\u5076\u7136\u3067\u306F\u306A\u304F\u3001\u3042\u306A\u305F\u306E\u5B89\u5168\u57FA\u5730\u3067\u3059`,
            evidence: [
                `${wardrobe.length}\u30A2\u30A4\u30C6\u30E0\u4E2D${topColor[1]}\u70B9\u304C\u300C${topColor[0]}\u300D`,
                `\u7121\u610F\u8B58\u306E\u8272\u5F69\u9078\u629E\u304C\u5FC3\u7406\u7684\u5B89\u5168\u57FA\u5730\u3092\u793A\u3059`,
            ],
            category: "pattern",
            confidence: clamp01(0.5 + ratio / 200),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    // Category balance
    const catCounts = new Map<string, number>();
    for (const item of wardrobe) {
        catCounts.set(item.category, (catCounts.get(item.category) ?? 0) + 1);
    }
    const topCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const catLabels: Record<string, string> = {
        tops: "\u30C8\u30C3\u30D7\u30B9",
        bottoms: "\u30DC\u30C8\u30E0\u30B9",
        outerwear: "\u30A2\u30A6\u30BF\u30FC",
        shoes: "\u9774",
        accessories: "\u30A2\u30AF\u30BB\u30B5\u30EA\u30FC",
        hat: "\u5E3D\u5B50",
        other: "\u305D\u306E\u4ED6",
    };
    if (topCat && topCat[1] >= 3) {
        const catLabel = catLabels[topCat[0]] ?? topCat[0];
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306F\u300C${catLabel}\u300D\u3067\u30B9\u30BF\u30A4\u30EB\u3092\u8A9E\u308B\u4EBA\u3067\u3059\u3002\u305D\u3053\u306B\u6700\u3082\u60C5\u71B1\u3092\u6CE8\u3044\u3067\u3044\u308B`,
            evidence: [
                `\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306E${Math.round((topCat[1] / wardrobe.length) * 100)}%\u304C${catLabel}`,
                `${catCounts.size}\u30AB\u30C6\u30B4\u30EA\u306E\u4E2D\u3067\u6700\u3082\u5145\u5B9F`,
            ],
            category: "pattern",
            confidence: clamp01(0.45 + topCat[1] * 0.05),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    return results;
}

/* ── Persona gap assertions ── */

function generatePersonaAssertions(
    personas: PersonaProfile[],
    crossAnalysis: CrossPersonaAnalysis | null,
): AssertionInsight[] {
    const results: AssertionInsight[] = [];
    if (!crossAnalysis) return results;

    // Check for dramatic persona shifts
    const personasWithLanes = personas.filter(
        (p) => p.styleLanes.length > 0,
    );
    if (personasWithLanes.length >= 2) {
        const uniqueEntries = Object.entries(crossAnalysis.uniqueByPersona);
        for (const [key, unique] of uniqueEntries) {
            if (unique.lanes.length >= 2) {
                const persona = personas.find((p) => p.contextKey === key);
                if (!persona) continue;
                const laneLabels = unique.lanes
                    .slice(0, 2)
                    .map(getStyleLaneLabel);
                results.push({
                    id: uid(),
                    statement: `${persona.label}\u306E\u5834\u9762\u3060\u3051\u3001\u3042\u306A\u305F\u306F\u5168\u304F\u5225\u306E\u4EBA\u306B\u306A\u308B\u3002\u305D\u308C\u306F\u5F31\u3055\u3067\u306F\u306A\u304F\u3001\u3082\u3046\u4E00\u4EBA\u306E\u672C\u7269\u3067\u3059`,
                    evidence: [
                        `${persona.label}\u3067\u306E\u307F\u300C${laneLabels.join("\u30FB")}\u300D\u3092\u9078\u629E`,
                        `\u4ED6\u306E\u30DA\u30EB\u30BD\u30CA\u3068\u5171\u901A\u3057\u306A\u3044\u72EC\u81EA\u306E\u30B9\u30BF\u30A4\u30EB`,
                    ],
                    category: "hidden",
                    confidence: clamp01(0.6),
                    generatedAt: new Date().toISOString(),
                    shareable: true,
                });
                break; // one is enough
            }
        }
    }

    // Core ratio assertion
    if (crossAnalysis.coreRatio < 0.3 && personasWithLanes.length >= 2) {
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306F\u5834\u9762\u3054\u3068\u306B\u5168\u304F\u9055\u3046\u30B9\u30BF\u30A4\u30EB\u3092\u6301\u3064\u300C\u591A\u9762\u4F53\u300D\u3067\u3059\u3002\u305D\u308C\u306F\u8C4A\u304B\u3055\u306E\u8A3C\u3067\u3059`,
            evidence: [
                `\u30DA\u30EB\u30BD\u30CA\u9593\u306E\u5171\u901A\u7387\u304C\u308F\u305A\u304B${Math.round(crossAnalysis.coreRatio * 100)}%`,
                `${personasWithLanes.length}\u3064\u306E\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3067\u305D\u308C\u305E\u308C\u72EC\u7ACB\u3057\u305F\u30B9\u30BF\u30A4\u30EB`,
            ],
            category: "identity",
            confidence: clamp01(0.55),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    return results;
}

/* ── Wear history assertions ── */

function generateWearAssertions(state: SavedState): AssertionInsight[] {
    const results: AssertionInsight[] = [];
    const wearHistory = state.wearHistory;
    if (!wearHistory || Object.keys(wearHistory).length < 5) return results;

    // Analyze wear frequency patterns
    const entries = Object.entries(wearHistory);
    const totalWears = entries.reduce((sum, [, r]) => sum + r.count, 0);
    const sorted = entries.sort((a, b) => b[1].count - a[1].count);
    const topItem = state.wardrobe.find((w) => w.id === sorted[0]?.[0]);

    if (topItem && sorted[0][1].count >= 3) {
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306F\u300C${topItem.name}\u300D\u306B\u7E70\u308A\u8FD4\u3057\u623B\u308B\u4EBA\u3067\u3059\u3002\u305D\u308C\u304C\u3042\u306A\u305F\u306E\u300C\u5FC3\u306E\u5B89\u5168\u57FA\u5730\u300D\u3067\u3059`,
            evidence: [
                `${sorted[0][1].count}\u56DE\u7740\u7528\u2014\u2014\u5168\u4F53${totalWears}\u56DE\u306E\u4E2D\u3067\u6700\u591A`,
                `\u6700\u7D42\u7740\u7528: ${new Date(sorted[0][1].lastWornAt).toLocaleDateString("ja-JP")}`,
            ],
            category: "pattern",
            confidence: clamp01(0.6 + sorted[0][1].count * 0.03),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    return results;
}

/* ── Style lane assertions ── */

function generateStyleLaneAssertions(state: SavedState): AssertionInsight[] {
    const results: AssertionInsight[] = [];
    const core = state.styleSelections.filter((s) => s.bucket === "core");
    const rare = state.styleSelections.filter((s) => s.bucket === "rare");
    const secret = state.styleSelections.filter((s) => s.bucket === "secret");

    if (core.length >= 1 && rare.length >= 1) {
        const coreLabel = getStyleLaneLabel(core[0].laneCode);
        const rareLabel = getStyleLaneLabel(rare[0].laneCode);
        results.push({
            id: uid(),
            statement: `\u666E\u6BB5\u306F\u300C${coreLabel}\u300D\u306E\u4EBA\u3060\u3051\u3069\u3001\u6642\u3005\u300C${rareLabel}\u300D\u304C\u9854\u3092\u51FA\u3059\u2014\u2014\u305D\u306E\u4E8C\u9762\u6027\u304C\u3042\u306A\u305F\u306E\u9B45\u529B\u3067\u3059`,
            evidence: [
                `\u30B3\u30A2\u30B9\u30BF\u30A4\u30EB: ${core.map((s) => getStyleLaneLabel(s.laneCode)).join(", ")}`,
                `\u30EC\u30A2\u30B9\u30BF\u30A4\u30EB: ${rare.map((s) => getStyleLaneLabel(s.laneCode)).join(", ")}`,
            ],
            category: "identity",
            confidence: clamp01(0.55 + (core.length + rare.length) * 0.05),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    if (secret.length >= 1) {
        const secretLabel = getStyleLaneLabel(secret[0].laneCode);
        results.push({
            id: uid(),
            statement: `\u3042\u306A\u305F\u306E\u5FC3\u306E\u5965\u306B\u300C${secretLabel}\u300D\u3078\u306E\u61A7\u308C\u304C\u7720\u3063\u3066\u3044\u308B\u3002\u305D\u308C\u306F\u307E\u3060\u8A00\u8449\u306B\u306A\u3063\u3066\u3044\u306A\u3044\u3060\u3051\u3067\u3059`,
            evidence: [
                `\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u30B9\u30BF\u30A4\u30EB\u3068\u3057\u3066\u300C${secretLabel}\u300D\u3092\u767B\u9332`,
                `\u307E\u3060\u8868\u306B\u51FA\u3057\u3066\u3044\u306A\u3044\u304C\u3001\u78BA\u304B\u306B\u5B58\u5728\u3059\u308B\u5F15\u529B`,
            ],
            category: "hidden",
            confidence: clamp01(0.5),
            generatedAt: new Date().toISOString(),
            shareable: true,
        });
    }

    return results;
}

/* ── Public API ── */

export interface AssertionGenerateInput {
    state: SavedState;
    swipeState: SwipeLearningState | null;
    styleDna: StyleDnaVector | null;
    contradictions: Contradiction[];
    personas: PersonaProfile[];
    crossPersonaAnalysis: CrossPersonaAnalysis | null;
}

/**
 * Generate bold, personal assertion insights from all data sources.
 * Returns 3-7 ranked by confidence and surprise factor.
 */
export function generateAssertions(
    input: AssertionGenerateInput,
): AssertionInsight[] {
    const {
        state,
        styleDna,
        contradictions,
        personas,
        crossPersonaAnalysis,
    } = input;

    const all: AssertionInsight[] = [
        ...generateIdentityAssertions(state),
        ...generateDnaAssertions(styleDna, state),
        ...generateContradictionAssertions(contradictions),
        ...generateWardrobeAssertions(state),
        ...generatePersonaAssertions(personas, crossPersonaAnalysis),
        ...generateWearAssertions(state),
        ...generateStyleLaneAssertions(state),
    ];

    // Apply past reaction feedback to deprioritize disagreed categories
    const reactions = loadReactions();
    const disagreedCategories = new Set<string>();
    for (const r of Object.values(reactions)) {
        if (r.reaction === "disagree") {
            disagreedCategories.add(r.category);
        }
    }

    // Rank: confidence * surprise factor, deprioritize disagreed categories
    const scored = all.map((a) => {
        let score = a.confidence;
        if (a.category === "contradiction" || a.category === "hidden")
            score *= 1.2; // surprise bonus
        if (disagreedCategories.has(a.category)) score *= 0.6;
        return { ...a, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);

    // Return top 3-7 with diversity (at most 2 per category)
    const result: AssertionInsight[] = [];
    const categoryCounts = new Map<string, number>();

    for (const item of scored) {
        const count = categoryCounts.get(item.category) ?? 0;
        if (count >= 2) continue;
        categoryCounts.set(item.category, count + 1);
        // Strip internal score
        const { _score, ...insight } = item;
        result.push(insight);
        if (result.length >= 7) break;
    }

    return result.length >= 3 ? result : result.slice(0, Math.max(1, result.length));
}

/**
 * Generate share card data for an insight.
 */
export function generateShareCard(insight: AssertionInsight): ShareCardData {
    const meta = CATEGORY_META[insight.category];
    return {
        title: "\u65AD\u8A00\u30A4\u30F3\u30B5\u30A4\u30C8",
        statement: insight.statement,
        gradient: meta.gradient,
        icon: meta.icon,
        evidence: insight.evidence,
    };
}

/**
 * Record user reaction to an insight.
 */
export function recordReaction(
    insightId: string,
    category: AssertionCategory,
    reaction: UserReaction,
): void {
    if (typeof window === "undefined") return;
    try {
        const reactions = loadReactions();
        reactions[insightId] = { reaction, category, recordedAt: new Date().toISOString() };
        localStorage.setItem(ASSERTION_REACTION_KEY, JSON.stringify(reactions));
    } catch {
        // silent fail
    }
}

type ReactionRecord = Record<
    string,
    { reaction: UserReaction; category: string; recordedAt: string }
>;

function loadReactions(): ReactionRecord {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(ASSERTION_REACTION_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/**
 * Save generated assertions to localStorage for history.
 */
export function saveAssertionHistory(insights: AssertionInsight[]): void {
    if (typeof window === "undefined") return;
    try {
        const existing = getAssertionHistory();
        const merged = [...insights, ...existing].slice(0, 50);
        localStorage.setItem(ASSERTION_STORAGE_KEY, JSON.stringify(merged));
    } catch {
        // silent fail
    }
}

/**
 * Get past assertion insights.
 */
export function getAssertionHistory(): AssertionInsight[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(ASSERTION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Get category metadata for UI rendering.
 */
export function getCategoryMeta(category: AssertionCategory) {
    return CATEGORY_META[category];
}
