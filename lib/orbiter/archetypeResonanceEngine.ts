// ============================================================
// Orbiter Phase 5: 原型共鳴 (Archetype Resonance)
//
// Stargazer 27原型 × Orbiter 選択パターンの交差。
// 「あなたはコマンダー(PEA)。でも選ぶ相手はいつも潜行型。
//  もうひとりの自分(PSD)に手を伸ばしているのか、それとも——」
//
// resolveArchetype(selfAxisScores) → ArchetypeResult
// ARCHETYPE_DEFS[code] → shadowCode, growthKey, shadowTension
// likeHistory counterpartAxisScores → growthPull / comfortRatio
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { ARCHETYPE_DEFS } from "@/lib/stargazer/archetypeTypes";
import type { LikeHistoryItem } from "./signalAccumulator";
import type {
  AvoidanceMap,
  PrincipleMap,
  ArchetypeResonance,
} from "./types";

// ── Constants ──

const MIN_AXIS_SCORES = 5;
const MIN_LIKES = 3;

// ── Main ──

export function computeArchetypeResonance(params: {
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  likeHistory: LikeHistoryItem[];
  avoidanceMap: AvoidanceMap | null;
  principleMap: PrincipleMap | null;
}): ArchetypeResonance | null {
  const { selfAxisScores, likeHistory } = params;

  // Need enough axis data to resolve archetype
  if (Object.keys(selfAxisScores).length < MIN_AXIS_SCORES) return null;

  const archetypeResult = resolveArchetype(selfAxisScores);
  if (!archetypeResult) return null;

  const def = ARCHETYPE_DEFS.find((d) => d.code === archetypeResult.code);
  if (!def) return null;

  const shadowDef = ARCHETYPE_DEFS.find((d) => d.code === def.shadowCode);
  if (!shadowDef) return null;

  const likes = likeHistory.filter((h) => h.decision === "like");
  if (likes.length < MIN_LIKES) {
    // Return archetype info without pull/ratio
    return {
      archetypeCode: def.code,
      archetypeName: def.name,
      shadowCode: shadowDef.code,
      shadowName: shadowDef.name,
      growthKey: def.growthKey,
      growthPull: 0,
      comfortRatio: 0,
      shadowTension: def.shadowTension,
      insight: `あなたの原型は「${def.name}」。影は「${shadowDef.name}」——${def.shadowTension}`,
      confidence: archetypeResult.confidence * 0.5,
    };
  }

  // Compute growthPull: how much the user likes toward shadow direction
  const growthPull = computeGrowthPull(
    likes,
    archetypeResult,
    def,
    shadowDef,
    selfAxisScores,
  );

  // Compute comfortRatio: how much the user likes within their own direction
  const comfortRatio = computeComfortRatio(
    likes,
    archetypeResult,
    selfAxisScores,
  );

  // Generate insight
  const insight = generateInsight(
    def,
    shadowDef,
    growthPull,
    comfortRatio,
    params.principleMap,
  );

  return {
    archetypeCode: def.code,
    archetypeName: def.name,
    shadowCode: shadowDef.code,
    shadowName: shadowDef.name,
    growthKey: def.growthKey,
    growthPull,
    comfortRatio,
    shadowTension: def.shadowTension,
    insight,
    confidence: archetypeResult.confidence,
  };
}

// ── Growth Pull ──

/**
 * 影方向への引力を計算。
 *
 * Layer1/2/3 の各レイヤーで、影の方向と候補者の方向を比較。
 * 影方向に近い候補者を like した割合 = growthPull。
 */
function computeGrowthPull(
  likes: LikeHistoryItem[],
  archetypeResult: ReturnType<typeof resolveArchetype>,
  _selfDef: (typeof ARCHETYPE_DEFS)[number],
  shadowDef: (typeof ARCHETYPE_DEFS)[number],
  _selfAxisScores: Partial<Record<TraitAxisKey, number>>,
): number {
  if (!archetypeResult || likes.length === 0) return 0;

  // Use layer scores to determine shadow direction
  // Shadow's dominant layer values represent the "growth direction"
  const selfLayer1 = archetypeResult.layer1;
  const selfLayer2 = archetypeResult.layer2;
  const selfLayer3 = archetypeResult.layer3;

  // Key axes that differentiate self from shadow
  // Cognition: A/N/S → different core need axes
  const layer1DiffAxes = getLayerDiffAxes(selfLayer1.code, shadowDef.cognition);
  const layer2DiffAxes = getLayerDiffAxes2(selfLayer2.code, shadowDef.emotion);
  const layer3DiffAxes = getLayerDiffAxes3(selfLayer3.code, shadowDef.social);
  const allDiffAxes = [...layer1DiffAxes, ...layer2DiffAxes, ...layer3DiffAxes];

  if (allDiffAxes.length === 0) return 0;

  let shadowAligned = 0;
  let total = 0;

  for (const like of likes) {
    for (const axis of allDiffAxes) {
      const counterVal = like.counterpartAxisScores[axis];
      if (counterVal == null) continue;
      total++;
      // Shadow direction is opposite to self's dominant direction
      // If counterpart is on the shadow's side, count as shadow-aligned
      const selfVal = archetypeResult.layer1.scores[shadowDef.cognition] ?? 0;
      if (Math.sign(counterVal) !== Math.sign(selfVal) || Math.abs(counterVal) > 0.3) {
        shadowAligned++;
      }
    }
  }

  return total > 0 ? shadowAligned / total : 0;
}

// ── Comfort Ratio ──

function computeComfortRatio(
  likes: LikeHistoryItem[],
  archetypeResult: ReturnType<typeof resolveArchetype>,
  selfAxisScores: Partial<Record<TraitAxisKey, number>>,
): number {
  if (!archetypeResult || likes.length === 0) return 0;

  let comfortCount = 0;

  for (const like of likes) {
    let sameDirection = 0;
    let compared = 0;

    for (const [axis, selfVal] of Object.entries(selfAxisScores)) {
      const counterVal = like.counterpartAxisScores[axis as TraitAxisKey];
      if (counterVal == null || selfVal == null) continue;
      compared++;
      // Same direction = comfort zone
      if (Math.sign(counterVal) === Math.sign(selfVal) || Math.abs(counterVal - selfVal) < 0.3) {
        sameDirection++;
      }
    }

    if (compared > 0 && sameDirection / compared > 0.5) {
      comfortCount++;
    }
  }

  return comfortCount / likes.length;
}

// ── Insight Generation ──

function generateInsight(
  selfDef: (typeof ARCHETYPE_DEFS)[number],
  shadowDef: (typeof ARCHETYPE_DEFS)[number],
  growthPull: number,
  comfortRatio: number,
  principleMap: PrincipleMap | null,
): string {
  if (growthPull > 0.4) {
    if (principleMap?.tension) {
      return `影の「${shadowDef.name}」に向かっている。原理の葛藤が影への扉を開いている——${selfDef.growthKey}`;
    }
    return `影の「${shadowDef.name}」に手を伸ばしている。${selfDef.shadowTension}——${selfDef.growthKey}`;
  }

  if (comfortRatio > 0.7) {
    return `「${selfDef.name}」の安全圏に留まっている。まだ影と出会っていない`;
  }

  if (growthPull > 0.25 && comfortRatio < 0.5) {
    return `「${selfDef.name}」と「${shadowDef.name}」の間で揺れている。成長の途上にいる`;
  }

  return `あなたの原型は「${selfDef.name}」。影は「${shadowDef.name}」——${selfDef.shadowTension}`;
}

// ── Layer Difference Axes ──

function getLayerDiffAxes(
  selfCode: string,
  shadowCode: string,
): TraitAxisKey[] {
  if (selfCode === shadowCode) return [];
  // Key axes that differentiate Layer1 types
  const axisMap: Record<string, TraitAxisKey[]> = {
    P: ["perfectionist_vs_pragmatic" as TraitAxisKey, "reassurance_need" as TraitAxisKey],
    B: ["individual_vs_social" as TraitAxisKey, "intimacy_pace" as TraitAxisKey],
    H: ["cautious_vs_bold" as TraitAxisKey, "change_embrace_vs_resist" as TraitAxisKey],
  };
  return axisMap[shadowCode] ?? [];
}

function getLayerDiffAxes2(
  selfCode: string,
  shadowCode: string,
): TraitAxisKey[] {
  if (selfCode === shadowCode) return [];
  const axisMap: Record<string, TraitAxisKey[]> = {
    E: ["analytical_vs_intuitive" as TraitAxisKey],
    I: ["analytical_vs_intuitive" as TraitAxisKey],
    S: ["emotional_variability" as TraitAxisKey],
  };
  return axisMap[shadowCode] ?? [];
}

function getLayerDiffAxes3(
  selfCode: string,
  shadowCode: string,
): TraitAxisKey[] {
  if (selfCode === shadowCode) return [];
  const axisMap: Record<string, TraitAxisKey[]> = {
    A: ["cautious_vs_bold" as TraitAxisKey, "social_initiative" as TraitAxisKey],
    W: ["emotional_regulation" as TraitAxisKey],
    D: ["stress_isolation_vs_social" as TraitAxisKey],
  };
  return axisMap[shadowCode] ?? [];
}
