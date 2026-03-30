// lib/stargazer/questionSeedData.ts
// 初期シード生成計画 — ~500問の質問を優先度順に生成

import { CONTINUOUS_OBSERVATION_AXES } from "./questionVariants";
import { TRAIT_AXIS_KEYS } from "./traitAxes";
import type {
  SubjectContext,
  EnergyTarget,
  PhrasingStyle,
  ObservationAngle,
  QuestionGenerationRequest,
} from "./questionPoolTypes";
import type { TraitAxisKey } from "./traitAxes";

export interface SeedPlan {
  axisId: TraitAxisKey;
  subject: SubjectContext;
  energyTarget: EnergyTarget;
  phrasingStyle: PhrasingStyle;
  angle: ObservationAngle;
  count: number;
}

/**
 * Build the seed generation plan.
 * Priority layers ensure the most impactful questions are generated first.
 *
 * P1: 継続8軸 × 3対象(friends/romantic/family) × direct × self_reflection = 24 × 2問 = 48
 * P2: 全45軸 × self × direct × self_reflection = 45 × 2問 = 90
 * P3: 継続8軸 × 5 energy × direct × self_reflection = 40 × 2問 = 80
 * P4: 継続8軸 × self × 6スタイル × self_reflection = 48 × 2問 = 96
 * P5: 継続8軸 × 2対象 × 3スタイル(scenario/metaphor/hypothetical) × self_reflection = 48 × 2問 = 96
 * P6: 継続8軸 × self × direct × 4角度(comparison/hypothetical/past_recall/future_projection) = 32 × 2問 = 64
 *
 * Total: ~450問
 */
export function buildSeedPlan(): SeedPlan[] {
  const plans: SeedPlan[] = [];
  const seen = new Set<string>();

  function add(plan: SeedPlan) {
    const key = `${plan.axisId}|${plan.subject}|${plan.energyTarget}|${plan.phrasingStyle}|${plan.angle}`;
    if (seen.has(key)) return;
    seen.add(key);
    plans.push(plan);
  }

  const continuous8 = CONTINUOUS_OBSERVATION_AXES as readonly TraitAxisKey[];

  // P1: 継続8軸 × 主要3対象 × direct
  const p1Subjects: SubjectContext[] = ["friends", "romantic_partner", "family"];
  for (const axisId of continuous8) {
    for (const subject of p1Subjects) {
      add({
        axisId,
        subject,
        energyTarget: "neutral",
        phrasingStyle: "direct",
        angle: "self_reflection",
        count: 2,
      });
    }
  }

  // P2: 全45軸 × self × direct (カバレッジ確保)
  for (const axisId of TRAIT_AXIS_KEYS) {
    add({
      axisId,
      subject: "self",
      energyTarget: "neutral",
      phrasingStyle: "direct",
      angle: "self_reflection",
      count: 2,
    });
  }

  // P3: 継続8軸 × 5 energy
  const energies: EnergyTarget[] = [
    "high_energy",
    "low_energy",
    "stressed",
    "relaxed",
    "neutral",
  ];
  for (const axisId of continuous8) {
    for (const energy of energies) {
      add({
        axisId,
        subject: "self",
        energyTarget: energy,
        phrasingStyle: "direct",
        angle: "self_reflection",
        count: 2,
      });
    }
  }

  // P4: 継続8軸 × 6スタイル
  const styles: PhrasingStyle[] = [
    "direct",
    "scenario",
    "metaphor",
    "binary",
    "memory_recall",
    "hypothetical",
  ];
  for (const axisId of continuous8) {
    for (const style of styles) {
      add({
        axisId,
        subject: "self",
        energyTarget: "neutral",
        phrasingStyle: style,
        angle: "self_reflection",
        count: 2,
      });
    }
  }

  // P5: 継続8軸 × 2対象 × 3スタイル
  const p5Subjects: SubjectContext[] = ["friends", "romantic_partner"];
  const p5Styles: PhrasingStyle[] = ["scenario", "metaphor", "hypothetical"];
  for (const axisId of continuous8) {
    for (const subject of p5Subjects) {
      for (const style of p5Styles) {
        add({
          axisId,
          subject,
          energyTarget: "neutral",
          phrasingStyle: style,
          angle: "self_reflection",
          count: 2,
        });
      }
    }
  }

  // P6: 継続8軸 × 4角度
  const angles: ObservationAngle[] = [
    "comparison",
    "hypothetical",
    "past_recall",
    "future_projection",
  ];
  for (const axisId of continuous8) {
    for (const angle of angles) {
      add({
        axisId,
        subject: "self",
        energyTarget: "neutral",
        phrasingStyle: "direct",
        angle,
        count: 2,
      });
    }
  }

  return plans;
}

/**
 * Convert seed plans into batched generation requests.
 * Groups by similar dimensions to improve AI generation quality.
 * Each batch produces ~5-10 questions per AI call.
 */
export function batchSeedPlans(
  plans: SeedPlan[],
  maxPerBatch: number = 5,
): QuestionGenerationRequest[] {
  // Group plans that share axis + subject + style for better AI context
  const groups = new Map<string, SeedPlan[]>();

  for (const plan of plans) {
    const key = `${plan.axisId}|${plan.subject}|${plan.phrasingStyle}`;
    const group = groups.get(key) || [];
    group.push(plan);
    groups.set(key, group);
  }

  const requests: QuestionGenerationRequest[] = [];

  for (const [, group] of groups) {
    // Sum up counts, cap at maxPerBatch
    const totalCount = Math.min(
      group.reduce((sum, p) => sum + p.count, 0),
      maxPerBatch,
    );

    // Use the first plan's dimensions (they share axis/subject/style)
    const first = group[0];
    requests.push({
      axisId: first.axisId,
      subject: first.subject,
      energyTarget: first.energyTarget,
      phrasingStyle: first.phrasingStyle,
      angle: first.angle,
      count: totalCount,
    });
  }

  return requests;
}

/**
 * Estimate the total number of questions the seed plan will generate.
 */
export function estimateSeedCount(): number {
  const plans = buildSeedPlan();
  return plans.reduce((sum, p) => sum + p.count, 0);
}
