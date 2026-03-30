// app/(immersive)/stargazer/_components/story/storyDataBuilder.ts
// ストーリースライドのデータ構築 — 既存 profile API レスポンスから全て導出
// 新規 API 不要。純粋関数。

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { ArchetypeResult as BaseArchetypeResult } from "@/lib/stargazer/archetypeResolver";

// API extends ArchetypeResult with display fields from getArchetypeByCode
type ArchetypeResult = BaseArchetypeResult & {
  name?: string;
  emoji?: string;
  tagline?: string;
};
import type { ContradictionMap } from "@/lib/stargazer/contradictionMap";
import type { FacesSlideData } from "./slides/FacesSlide";
import type { MirrorSlideData } from "./slides/MirrorSlide";
import type { DriftSlideData } from "./slides/DriftSlide";

// ── Slide Data Types ──

export interface ArchetypeSlideData {
  emoji: string;
  archetypeLabel: string;
  familyName: string | null;
  familyTagline: string | null;
}

export interface CoreTraitSlideData {
  axisId: TraitAxisKey;
  labelLeft: string;
  labelRight: string;
  score: number; // -1 to 1
  percent: number; // 0-100 (distance from center)
  dominantLabel: string;
  category: string;
}

export type DualitySlideData =
  | {
      kind: "detected";
      axisId: TraitAxisKey;
      labelLeft: string;
      labelRight: string;
      poles: [number, number];
      strength: number;
      insight: string;
    }
  | {
      kind: "undetermined";
      axisId: TraitAxisKey;
      labelLeft: string;
      labelRight: string;
      variance: number;
      score: number;
    };

export interface UnobservedSlideData {
  areas: Array<{
    axisId: TraitAxisKey;
    labelLeft: string;
    labelRight: string;
    category: string;
  }>;
  observedCount: number;
  totalCount: number;
  nextSuggestion: {
    axisId: TraitAxisKey;
    label: string;
  } | null;
}

export interface NextSlideData {
  totalObservations: number;
  todayCount: number;
  hasGenomeCard: boolean;
}

export interface StoryData {
  archetype: ArchetypeSlideData;
  coreTrait: CoreTraitSlideData;
  duality: DualitySlideData;
  unobserved: UnobservedSlideData;
  next: NextSlideData;
  // Unlock slides (null = not yet available)
  faces: FacesSlideData | null;
  mirror: MirrorSlideData | null;
  drift: DriftSlideData | null;
}

// ── Builder ──

export function buildStoryData(params: {
  archetypeResult: ArchetypeResult | null;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  contradictionMap: ContradictionMap | null;
  totalObservations: number;
  todayObservationCount: number;
  contextFaces?: Record<string, Partial<Record<TraitAxisKey, number>>> | null;
  predictionAccuracy?: {
    overallAccuracy: number;
    totalPredictions: number;
    categoryAccuracy: Record<string, { accuracy: number; totalPredictions: number }>;
  } | null;
  reobservationHistory?: Array<{
    axisId: string;
    currentScore: number;
    previousScore: number;
    currentDate: string;
    previousDate: string;
  }> | null;
}): StoryData | null {
  const {
    archetypeResult,
    axisScores,
    contradictionMap,
    totalObservations,
    todayObservationCount,
    contextFaces,
    predictionAccuracy,
    reobservationHistory,
  } = params;

  // archetypeResult が無ければストーリーは構築不可
  if (!archetypeResult) return null;

  // ── 1. ARCHETYPE ──
  const archetype: ArchetypeSlideData = {
    emoji: archetypeResult.emoji || "◆",
    archetypeLabel: archetypeResult.name || archetypeResult.code || "Unknown",
    familyName: archetypeResult.layer1?.code
      ? formatFamilyName(archetypeResult.layer1.code)
      : null,
    familyTagline: archetypeResult.tagline || null,
  };

  // ── 2. CORE TRAIT — |score| が最大の軸 ──
  const scoredAxes = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => ({ key: k as TraitAxisKey, score: v! }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const topAxis = scoredAxes[0];
  if (!topAxis) return null;

  const topDef = TRAIT_AXES.find((a) => a.id === topAxis.key);
  if (!topDef) return null;

  const percent = Math.round(Math.abs(topAxis.score) * 100);
  const dominantLabel =
    topAxis.score < 0 ? topDef.labelLeft : topDef.labelRight;

  const coreTrait: CoreTraitSlideData = {
    axisId: topAxis.key,
    labelLeft: topDef.labelLeft,
    labelRight: topDef.labelRight,
    score: topAxis.score,
    percent,
    dominantLabel,
    category: topDef.category,
  };

  // ── 3. DUALITY ──
  // contradictionMap は三面鏡システム (contradictionMap.ts) の ContradictionMap
  // entries に magnitude 順で矛盾が入っている
  let duality: DualitySlideData;

  if (contradictionMap && contradictionMap.entries.length > 0) {
    const top = contradictionMap.entries[0];
    duality = {
      kind: "detected",
      axisId: top.axisId,
      labelLeft: top.axisLabelLeft,
      labelRight: top.axisLabelRight,
      poles: [
        top.scores.selfPortrait ?? 0,
        top.scores.footprint ?? top.scores.shadowPlay ?? 0,
      ],
      strength: top.magnitude,
      insight: top.insight,
    };
  } else {
    duality = buildUndeterminedDuality(axisScores);
  }

  // ── 4. UNOBSERVED ──
  const observedKeys = new Set(
    Object.entries(axisScores)
      .filter(([, v]) => v !== undefined && v !== 0)
      .map(([k]) => k),
  );
  const unobservedAxes = TRAIT_AXES.filter((a) => !observedKeys.has(a.id));
  const areas = unobservedAxes.slice(0, 3).map((a) => ({
    axisId: a.id,
    labelLeft: a.labelLeft,
    labelRight: a.labelRight,
    category: a.category,
  }));

  const unobserved: UnobservedSlideData = {
    areas,
    observedCount: observedKeys.size,
    totalCount: TRAIT_AXES.length,
    nextSuggestion: unobservedAxes[0]
      ? {
          axisId: unobservedAxes[0].id,
          label: `${unobservedAxes[0].labelLeft} ⇔ ${unobservedAxes[0].labelRight}`,
        }
      : null,
  };

  // ── 5. NEXT ──
  const next: NextSlideData = {
    totalObservations,
    todayCount: todayObservationCount,
    hasGenomeCard: totalObservations >= 10,
  };

  // ── Unlock: FACES ──
  let faces: FacesSlideData | null = null;
  if (contextFaces) {
    const CONTEXT_META: Array<{ key: string; label: string; icon: string }> = [
      { key: "romance", label: "恋愛", icon: "💕" },
      { key: "work", label: "仕事", icon: "💼" },
      { key: "friends", label: "友人", icon: "🧩" },
    ];
    const contexts = CONTEXT_META.map((meta) => {
      const scores = contextFaces[meta.key];
      let topDiff: FacesSlideData["contexts"][0]["topDiff"] = null;
      if (scores && Object.keys(scores).length > 0) {
        const entries = Object.entries(scores)
          .filter(([, v]) => v !== undefined)
          .sort((a, b) => Math.abs(b[1]!) - Math.abs(a[1]!));
        if (entries[0]) {
          const [axisId, score] = entries[0];
          const def = TRAIT_AXES.find((a) => a.id === axisId);
          topDiff = {
            axisId: axisId as TraitAxisKey,
            label: score! < 0 ? (def?.labelLeft ?? axisId) : (def?.labelRight ?? axisId),
            score: score!,
          };
        }
      }
      return { ...meta, topDiff };
    });
    const validContexts = contexts.filter((c) => c.topDiff !== null);
    if (validContexts.length >= 2) {
      faces = { contexts };
    }
  }

  // ── Unlock: MIRROR ──
  let mirror: MirrorSlideData | null = null;
  if (predictionAccuracy && predictionAccuracy.totalPredictions >= 5) {
    const categories = Object.entries(predictionAccuracy.categoryAccuracy);
    let worstCategory: MirrorSlideData["worstCategory"] = null;
    if (categories.length > 0) {
      const sorted = categories.sort((a, b) => a[1].accuracy - b[1].accuracy);
      worstCategory = {
        name: sorted[0][0],
        accuracy: sorted[0][1].accuracy,
      };
    }
    mirror = {
      overallAccuracy: predictionAccuracy.overallAccuracy,
      totalPredictions: predictionAccuracy.totalPredictions,
      worstCategory,
    };
  }

  // ── Unlock: DRIFT ──
  let drift: DriftSlideData | null = null;
  if (reobservationHistory && reobservationHistory.length >= 2) {
    // Find the biggest absolute change
    const sorted = [...reobservationHistory].sort(
      (a, b) => Math.abs(b.currentScore - b.previousScore) - Math.abs(a.currentScore - a.previousScore),
    );
    const top = sorted[0];
    const def = TRAIT_AXES.find((a) => a.id === top.axisId);
    if (def) {
      drift = {
        axisId: top.axisId as TraitAxisKey,
        labelLeft: def.labelLeft,
        labelRight: def.labelRight,
        previousScore: top.previousScore,
        currentScore: top.currentScore,
        previousDate: top.previousDate,
        currentDate: top.currentDate,
      };
    }
  }

  return { archetype, coreTrait, duality, unobserved, next, faces, mirror, drift };
}

// ── Helpers ──

function buildUndeterminedDuality(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): DualitySlideData {
  // スコアが 0 に最も近い軸 = まだ定まっていない
  const entries = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ key: k as TraitAxisKey, score: v! }))
    .sort((a, b) => Math.abs(a.score) - Math.abs(b.score));

  const candidate = entries[0];
  if (!candidate) {
    // フォールバック: 最初のcore軸
    return {
      kind: "undetermined",
      axisId: "introvert_vs_extrovert",
      labelLeft: "内向的",
      labelRight: "外向的",
      variance: 0,
      score: 0,
    };
  }

  const def = TRAIT_AXES.find((a) => a.id === candidate.key);
  return {
    kind: "undetermined",
    axisId: candidate.key,
    labelLeft: def?.labelLeft ?? "",
    labelRight: def?.labelRight ?? "",
    variance: Math.abs(candidate.score),
    score: candidate.score,
  };
}

function formatFamilyName(code: string): string {
  // layer1 code is something like "guardian_anchor" → "Guardian Anchor"
  return code
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
