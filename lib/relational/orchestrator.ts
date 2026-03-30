// ============================================================
// Relational Intelligence Orchestrator
// 6つのエンジンを統合し、RelationalIntelligence を生成
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CautionCode } from "@/lib/rendezvous/types";
import type { RelationalIntelligence } from "./types";
import { computeWithThisPerson } from "./withThisPerson";
import { computeStyleChemistryMap } from "./chemistryMap";
import { computePositiveFriction } from "./positiveFriction";
import { computeStyleVoice } from "./styleVoice";
import { computeReadabilityBonuses } from "./readability";

/** 軸スコアが最低何軸あれば計算するか */
const MIN_AXES_REQUIRED = 5;

function countAxes(scores: Partial<Record<TraitAxisKey, number>>): number {
  return Object.values(scores).filter((v) => v !== undefined).length;
}

export function computeRelationalIntelligence(params: {
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  selfAxisConfidence?: Partial<Record<TraitAxisKey, number>>;
  cautionCodes: CautionCode[];
  counterpartMoodSummary?: string | null;
  counterpartStyleSummary?: string | null;
}): RelationalIntelligence {
  const {
    selfAxisScores,
    counterpartAxisScores,
    selfAxisConfidence,
    cautionCodes,
    counterpartMoodSummary,
    counterpartStyleSummary,
  } = params;

  const selfCount = countAxes(selfAxisScores);
  const cpCount = countAxes(counterpartAxisScores);
  const hasEnoughData =
    selfCount >= MIN_AXES_REQUIRED && cpCount >= MIN_AXES_REQUIRED;

  // Feature 3: ズレの前向き表示 (cautionCodesのみ使用、軸データ不要)
  const positiveFriction = computePositiveFriction(cautionCodes);

  if (!hasEnoughData) {
    return {
      withThisPerson: null,
      chemistryMap: null,
      positiveFriction,
      styleVoice: null,
      readabilityBonuses: [],
    };
  }

  // Feature 1: 相手の前での自分
  const withThisPerson = computeWithThisPerson(
    selfAxisScores,
    counterpartAxisScores,
  );

  // Feature 2: 化学反応マップ
  const chemistryMap = computeStyleChemistryMap(
    selfAxisScores,
    counterpartAxisScores,
    selfAxisConfidence,
  );

  // Feature 4: 感覚翻訳
  const styleVoice = computeStyleVoice(
    counterpartAxisScores,
    counterpartMoodSummary,
    counterpartStyleSummary,
  );

  // Feature 6: 理解しやすい人
  const readabilityResult = computeReadabilityBonuses(
    selfAxisScores,
    counterpartAxisScores,
  );

  return {
    withThisPerson,
    chemistryMap,
    positiveFriction,
    styleVoice,
    readabilityBonuses: readabilityResult.bonuses,
  };
}
