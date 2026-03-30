// ============================================================
// Orbiter Phase 5: 存在の要約 (Existential Digest)
//
// 全エンジンの出力を統合した「生きた自画像」。
// 4セクション: 原理・成長の縁・死角・旅路。
//
// これは Orbiter の最終出力ではない——これは Orbiter が
// ユーザーについて到達した「現時点での理解」の結晶。
// 前回との差分が、ユーザーの成長を映す鏡になる。
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PrincipleMap,
  ArchetypeResonance,
  DecisionStratigraphy,
  AvoidanceMap,
  OmenForecast,
  OrbiterMaturity,
  ExistentialSection,
  ExistentialDigest,
  StoredDigest,
} from "./types";

// ── Constants ──

const SECTION_TITLES = ["原理", "成長の縁", "死角", "旅路"] as const;

const MATURITY_STAGE_NARRATIVE: Record<string, string> = {
  guide: "まだ探り合いの段階",
  mirror: "パターンが映し返される段階",
  coach: "自分で気づける段階",
  witness: "静かに見届ける段階",
};

// ── Main ──

export function generateExistentialDigest(params: {
  principleMap: PrincipleMap | null;
  archetypeResonance: ArchetypeResonance | null;
  stratigraphy: DecisionStratigraphy | null;
  avoidanceMap: AvoidanceMap | null;
  omenForecast: OmenForecast | null;
  maturity: OrbiterMaturity | null;
  previousDigest: StoredDigest | null;
}): ExistentialDigest | null {
  // Need at least principleMap or archetypeResonance to generate a meaningful digest
  if (!params.principleMap && !params.archetypeResonance) return null;

  const sections: ExistentialSection[] = [
    buildPrincipleSection(params.principleMap),
    buildGrowthEdgeSection(
      params.archetypeResonance,
      params.omenForecast,
      params.stratigraphy,
    ),
    buildBlindSpotSection(params.avoidanceMap, params.principleMap),
    buildJourneySection(params.stratigraphy, params.maturity),
  ];

  // Detect changes from previous digest
  const changedSections = detectChanges(sections, params.previousDigest);

  // Generate essence (one-line summary)
  const essence = generateEssence(params);

  return {
    sections,
    essence,
    changedSections,
    generatedAt: new Date().toISOString(),
    confidence: computeConfidence(params),
  };
}

// ── Section Builders ──

function buildPrincipleSection(
  principleMap: PrincipleMap | null,
): ExistentialSection {
  if (!principleMap) {
    return { title: SECTION_TITLES[0], content: "まだ判断原理が見えていない" };
  }

  const dom = principleMap.principles.find(
    (p) => p.axis === principleMap.dominantPrinciple,
  );
  if (!dom) {
    return { title: SECTION_TITLES[0], content: principleMap.narrative };
  }

  const direction = dom.score > 0
    ? dom.label.split(" ↔ ")[1]
    : dom.label.split(" ↔ ")[0];

  let content = `「${direction}」を軸に判断する人間`;
  if (principleMap.tension) {
    content += `。ただし${principleMap.tension.insight.slice(0, 40)}`;
  }

  return {
    title: SECTION_TITLES[0],
    content: content.slice(0, 80),
  };
}

function buildGrowthEdgeSection(
  archetypeResonance: ArchetypeResonance | null,
  omenForecast: OmenForecast | null,
  stratigraphy: DecisionStratigraphy | null,
): ExistentialSection {
  // Priority: archetype resonance > omen > stratigraphy era
  if (archetypeResonance && archetypeResonance.growthPull > 0.25) {
    return {
      title: SECTION_TITLES[1],
      content: `影の「${archetypeResonance.shadowName}」に手を伸ばしている——${archetypeResonance.growthKey}`.slice(0, 80),
    };
  }

  if (omenForecast && omenForecast.omens.length > 0) {
    return {
      title: SECTION_TITLES[1],
      content: omenForecast.omens[0].prediction.slice(0, 80),
    };
  }

  if (stratigraphy?.currentEra) {
    const era = stratigraphy.currentEra;
    return {
      title: SECTION_TITLES[1],
      content: `「${era.label ?? era.type}」を歩いている`,
    };
  }

  return { title: SECTION_TITLES[1], content: "成長の方向はまだ見えていない" };
}

function buildBlindSpotSection(
  avoidanceMap: AvoidanceMap | null,
  principleMap: PrincipleMap | null,
): ExistentialSection {
  // Priority: avoidance paradoxes > unconscious avoidance > principle counter
  if (avoidanceMap?.paradoxes.length) {
    const paradox = avoidanceMap.paradoxes[0];
    return {
      title: SECTION_TITLES[2],
      content: `「${paradox.statedDesire}」と言いながら「${paradox.actualAvoidance}」を避けている`.slice(0, 80),
    };
  }

  if (avoidanceMap && avoidanceMap.unconsciousRatio > 0.5) {
    return {
      title: SECTION_TITLES[2],
      content: "避けていることの半分以上に無自覚。ネガティブスペースが広い",
    };
  }

  if (principleMap) {
    const withCounter = principleMap.principles.find(
      (p) => p.counterPrinciple != null,
    );
    if (withCounter) {
      return {
        title: SECTION_TITLES[2],
        content: (withCounter.counterPrinciple ?? "").slice(0, 80),
      };
    }
  }

  return { title: SECTION_TITLES[2], content: "死角はまだ検出されていない" };
}

function buildJourneySection(
  stratigraphy: DecisionStratigraphy | null,
  maturity: OrbiterMaturity | null,
): ExistentialSection {
  const parts: string[] = [];

  // Era journey summary
  if (stratigraphy && stratigraphy.eras.length > 1) {
    const firstEra = stratigraphy.eras[0];
    const currentEra = stratigraphy.currentEra;
    if (firstEra && currentEra) {
      parts.push(
        `「${firstEra.label ?? firstEra.type}」から「${currentEra.label ?? currentEra.type}」へ`,
      );
    }
  } else if (stratigraphy?.currentEra) {
    parts.push(
      `今は「${stratigraphy.currentEra.label ?? stratigraphy.currentEra.type}」`,
    );
  }

  // Maturity stage
  if (maturity) {
    const stageNarrative =
      MATURITY_STAGE_NARRATIVE[maturity.stage] ?? maturity.stage;
    parts.push(stageNarrative);
  }

  const content = parts.length > 0
    ? parts.join("。")
    : "旅はまだ始まったばかり";

  return {
    title: SECTION_TITLES[3],
    content: content.slice(0, 80),
  };
}

// ── Change Detection ──

function detectChanges(
  sections: ExistentialSection[],
  previousDigest: StoredDigest | null,
): number[] {
  if (!previousDigest) return sections.map((_, i) => i); // All new

  const changed: number[] = [];
  for (let i = 0; i < sections.length; i++) {
    const prev = previousDigest.sections[i];
    if (!prev || prev.content !== sections[i].content) {
      changed.push(i);
    }
  }
  return changed;
}

// ── Essence Generation ──

function generateEssence(params: {
  principleMap: PrincipleMap | null;
  archetypeResonance: ArchetypeResonance | null;
  stratigraphy: DecisionStratigraphy | null;
}): string {
  const parts: string[] = [];

  if (params.archetypeResonance) {
    parts.push(params.archetypeResonance.archetypeName);
  }

  if (params.principleMap) {
    const dom = params.principleMap.principles.find(
      (p) => p.axis === params.principleMap!.dominantPrinciple,
    );
    if (dom) {
      const direction = dom.score > 0
        ? dom.label.split(" ↔ ")[1]
        : dom.label.split(" ↔ ")[0];
      parts.push(`${direction}の人`);
    }
  }

  if (params.stratigraphy?.currentEra) {
    parts.push(`${params.stratigraphy.currentEra.label ?? "旅の途中"}`);
  }

  return parts.length > 0
    ? parts.join("、").slice(0, 50)
    : "まだ見えていない";
}

// ── Confidence ──

function computeConfidence(params: {
  principleMap: PrincipleMap | null;
  archetypeResonance: ArchetypeResonance | null;
}): number {
  const scores: number[] = [];
  if (params.principleMap) scores.push(params.principleMap.confidence);
  if (params.archetypeResonance) scores.push(params.archetypeResonance.confidence);
  if (scores.length === 0) return 0;
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

// ── Persistence ──

export async function loadPreviousDigest(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredDigest | null> {
  const { data } = await supabase
    .from("orbiter_existential_digests")
    .select("user_id, sections, essence, created_at")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  return {
    userId: data.user_id,
    sections: (data.sections ?? []) as ExistentialSection[],
    essence: data.essence ?? "",
    createdAt: data.created_at,
  };
}

export function persistDigest(
  supabase: SupabaseClient,
  digest: StoredDigest,
): void {
  void (async () => {
    await supabase
      .from("orbiter_existential_digests")
      .upsert(
        {
          user_id: digest.userId,
          sections: digest.sections,
          essence: digest.essence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
  })();
}
