/**
 * buildDayStateRecord — 今日の台帳（User State）を facts + optional inputs から構築する pure 関数
 *
 * 正本: docs/day-state-alter-tab-v0-design.md §3（v0.3）
 * 規律:
 *  - 凍結（HIGH-2 対応）: 初回構築時に estimatesFrozen を取り、以後不変。
 *    補正は applyUserCorrection() が estimates（現在値）だけを更新する。
 *  - personaCoefficients は受領のみ・estimates へ未適用（Stage D 契約）。
 *  - heartHint は optional input（heartIntegration を import しない）。confidence 0.3 上限。
 *  - outingTolerance: grounded signal が 2 未満なら "unknown"（薄い入力で推定しない）。
 *  - dailyMode: 既存 resolveDailyMode は呼び出し側が実行して dailyModeHint で渡す（Stage 1 配線）。
 *    Stage 0 fixture は hint を供給。無ければ保守的 fallback。
 */

import type {
  ConfidentValue,
  DayStateBuildInput,
  DayStateEstimates,
  DayStateFacts,
  DayStateRecordV0,
  DayFeasibilityLevel,
  EnergyLevelValue,
  EstimateFieldKey,
  EvidenceTag,
  OutingToleranceLevel,
  RecoveryNeedLevel,
  ReserveLevel,
  UserCorrection,
  DailyGuidanceMode,
  DensityLevel,
} from "./dayStateTypes";
import { isNightShiftSpan, toFrozenKind } from "./timeOfDay";

// ── 内部定数（画面非表示・fixture 検証対象） ──
const EVENING_SLACK_LOW_MIN = 60;
const LARGE_FREE_BLOCK_MIN = 90;
const LONG_TRAVEL_CHAIN_MIN = 120;
const OUTING_MIN_GROUNDED_SIGNALS = 2;
const HEART_HINT_CONFIDENCE_CAP = 0.3;

function cv<T>(value: T, confidence: number, source: ConfidentValue<T>["source"]): ConfidentValue<T> {
  return { value, confidence, source };
}

function unknownCv<T>(value: T): ConfidentValue<T> {
  return { value, confidence: 0, source: "unknown" };
}

// fallback は既存 predictDensity（dayGraphAttributes.ts:56-59）と同じ閾値を鏡写しにする。
// 正本は呼び出し側が渡す computeDayGraphAttributes の出力（input.density）。
function fallbackDensity(anchorCount: number): DensityLevel {
  if (anchorCount <= 1) return "sparse";
  if (anchorCount <= 3) return "balanced";
  return "packed";
}

function buildFacts(input: DayStateBuildInput): DayStateFacts {
  const events = input.segments.filter((s) => s.kind === "event");
  const gaps = input.segments.filter((s) => s.kind === "gap");
  const travels = input.segments.filter((s) => s.kind === "travel");

  const anchorCount = events.length;
  const bookedMin = events.reduce((sum, s) => sum + s.durationMin, 0);
  const travelChainMin = input.hasUnresolvedTravel
    ? null
    : travels.reduce((sum, s) => sum + s.durationMin, 0);
  const eveningSlackMin = gaps
    .filter((s) => s.timeBucket === "evening" || s.timeBucket === "night")
    .reduce((sum, s) => sum + s.durationMin, 0);
  const largestFreeBlockMin = gaps.reduce((max, s) => Math.max(max, s.durationMin), 0);

  return {
    anchorCount,
    density: input.density ?? fallbackDensity(anchorCount),
    bookedMin,
    travelChainMin,
    eveningSlackMin,
    largestFreeBlockMin,
    shift: {
      kind: input.shift.kind,
      startTime: input.shift.startTime,
      endTime: input.shift.endTime,
      isNightShift:
        input.shift.kind === "work" ? isNightShiftSpan(input.shift.startTime, input.shift.endTime) : false,
    },
    weather: input.weather,
  };
}

function deriveEnergyLevel(input: DayStateBuildInput, facts: DayStateFacts): ConfidentValue<EnergyLevelValue> {
  // ① 本人タップ（最強 evidence）
  if (input.moodCode === "tired") return cv("low", 0.9, "user_confirmed");
  if (input.moodCode === "energetic") return cv("high", 0.9, "user_confirmed");
  // ② 夜勤シグナル
  if (facts.shift.isNightShift === true) return cv("low", 0.5, "inferred");
  // ③ 前日 carryOver の読取は B1 gate 後（Stage 3）— v0 では読まない
  return unknownCv("unknown");
}

function deriveFocusReserve(facts: DayStateFacts): ConfidentValue<ReserveLevel> {
  // v0 の導出は弱い前提（confidence 0.3 上限）。本人補正のみ確度高（applyUserCorrection 経由）
  if (facts.largestFreeBlockMin >= LARGE_FREE_BLOCK_MIN && facts.density !== "packed") {
    return cv("medium", 0.3, "inferred");
  }
  return unknownCv("unknown");
}

function deriveEmotionalReserve(input: DayStateBuildInput): ConfidentValue<ReserveLevel> {
  // ① bodyEcho.chest（本人入力）
  if (input.bodyEchoChest === "tight") return cv("low", 0.85, "user_confirmed");
  if (input.bodyEchoChest === "open") return cv("high", 0.85, "user_confirmed");
  if (input.bodyEchoChest === "normal") return cv("medium", 0.85, "user_confirmed");
  // ② mood / emotion シグナル
  if (
    input.moodCode === "tired" ||
    input.emotionHint === "tired" ||
    input.emotionHint === "anxious" ||
    input.emotionHint === "frustrated"
  ) {
    return cv("low", 0.4, "inferred");
  }
  // ③ 対人予定密度（inferred 0.3 上限）
  if (input.interpersonalLoadHint === "high") return cv("low", 0.3, "inferred");
  // ④ HDM heart 状態（optional input・0.3 上限）
  const hint = input.heartHint;
  if (hint && (hint.psychologicalCapacity !== undefined || hint.emotionalLoad !== undefined)) {
    const capacity = hint.psychologicalCapacity ?? 0.5;
    const load = hint.emotionalLoad ?? 0.5;
    const value: ReserveLevel = capacity >= 0.65 && load <= 0.4 ? "high" : capacity <= 0.35 || load >= 0.7 ? "low" : "medium";
    return cv(value, HEART_HINT_CONFIDENCE_CAP, "inferred");
  }
  return unknownCv("unknown");
}

function deriveOutingTolerance(
  input: DayStateBuildInput,
  facts: DayStateFacts,
): ConfidentValue<OutingToleranceLevel> {
  // grounded signal の数え上げ（実在するもののみ）
  const signals: Array<() => number> = [];
  if (facts.travelChainMin !== null) {
    signals.push(() => (facts.travelChainMin! >= LONG_TRAVEL_CHAIN_MIN ? -1 : facts.travelChainMin! <= 30 ? +1 : 0));
  }
  if (facts.weather !== null) {
    signals.push(() => (facts.weather!.condition === "rainy" || facts.weather!.condition === "snowy" ? -1 : 0));
  }
  if (facts.shift.kind !== "none") {
    signals.push(() => (facts.shift.isNightShift === true ? -1 : 0));
  }
  if (input.estimatedWalkLevel !== undefined) {
    signals.push(() => (input.estimatedWalkLevel === "high" ? -1 : 0));
  }
  if (input.socialBandwidthSignal !== undefined && input.socialBandwidthSignal !== "unknown") {
    // solo_preferred は対人外出のみ低 — 単一値では表現できないため v0 は中立（係数 0）で数える
    signals.push(() => 0);
  }

  if (signals.length < OUTING_MIN_GROUNDED_SIGNALS) return unknownCv("unknown");

  const score = signals.reduce((sum, f) => sum + f(), 0);
  const value: OutingToleranceLevel = score <= -2 ? "low" : score === -1 ? "low" : score >= 1 ? "high" : "medium";
  const confidence = Math.min(0.6, 0.2 + signals.length * 0.1); // 2 signals→0.4? → 0.2+0.2=0.4。上限 0.6
  return cv(value, Math.max(0.3, confidence), "derived");
}

function deriveDayFeasibility(facts: DayStateFacts, hasSegments: boolean): ConfidentValue<DayFeasibilityLevel> {
  if (!hasSegments) return unknownCv("unknown");
  const longTravel = (facts.travelChainMin ?? 0) >= 90;
  if (facts.density === "packed" && longTravel && facts.eveningSlackMin < EVENING_SLACK_LOW_MIN) {
    return cv("likely_fragile", 0.55, "derived");
  }
  if (facts.density === "sparse" && facts.eveningSlackMin >= 120) {
    return cv("likely_steady", 0.55, "derived");
  }
  return cv("mixed", 0.45, "derived");
}

function deriveRecoveryNeed(
  energy: ConfidentValue<EnergyLevelValue>,
  facts: DayStateFacts,
): ConfidentValue<RecoveryNeedLevel> {
  if (energy.value === "unknown") return unknownCv("unknown");
  let value: RecoveryNeedLevel = energy.value === "low" || energy.value === "depleted" ? "high" : "low";
  if (facts.eveningSlackMin < EVENING_SLACK_LOW_MIN) {
    value = value === "low" ? "medium" : "high"; // 1 段階上げ
  }
  return cv(value, energy.confidence * 0.8, energy.source === "user_confirmed" ? "derived" : energy.source);
}

function deriveDailyMode(
  input: DayStateBuildInput,
  energy: ConfidentValue<EnergyLevelValue>,
): ConfidentValue<DailyGuidanceMode> {
  // C-2（W2）: 固定 0.5 を廃止し、呼び出し側が併送する dailyModeHintConfidence を反映（無ければ暫定 0.5）。
  // 0-1 に clamp（不正値の混入を防ぐ）。
  if (input.dailyModeHint) {
    const c = input.dailyModeHintConfidence;
    const confidence = c === undefined ? 0.5 : Math.min(1, Math.max(0, c));
    return cv(input.dailyModeHint, confidence, "derived");
  }
  // 保守的 fallback（既存 resolveDailyMode の配線は Stage 1。低 confidence）
  if (energy.value === "depleted" || energy.value === "low") return cv("recover", 0.3, "inferred");
  return cv("maintenance", 0.2, "inferred");
}

function collectEvidence(input: DayStateBuildInput, facts: DayStateFacts): EvidenceTag[] {
  const tags: EvidenceTag[] = [];
  if (facts.shift.isNightShift === true) tags.push("shift_night");
  else if (facts.shift.kind === "work") tags.push("shift_work");
  else if (facts.shift.kind === "off" || facts.shift.kind === "off_request") tags.push("day_off");
  if (facts.density === "packed") tags.push("dense_schedule");
  if ((facts.travelChainMin ?? 0) >= LONG_TRAVEL_CHAIN_MIN) tags.push("long_travel_chain");
  if (facts.eveningSlackMin < EVENING_SLACK_LOW_MIN) tags.push("low_evening_slack");
  if (facts.largestFreeBlockMin >= LARGE_FREE_BLOCK_MIN) tags.push("large_free_block");
  if (facts.weather?.condition === "rainy" || facts.weather?.condition === "snowy") tags.push("weather_rain");
  if (input.moodCode === "tired") tags.push("user_tired_tap");
  if (input.bodyEchoChest !== undefined || input.emotionHint !== undefined) tags.push("user_mood_input");
  return tags;
}

export function buildDayStateRecord(input: DayStateBuildInput): DayStateRecordV0 {
  const facts = buildFacts(input);
  const energyLevel = deriveEnergyLevel(input, facts);
  const estimates: DayStateEstimates = {
    energyLevel,
    focusReserve: deriveFocusReserve(facts),
    emotionalReserve: deriveEmotionalReserve(input),
    outingTolerance: deriveOutingTolerance(input, facts),
    dayFeasibility: deriveDayFeasibility(facts, input.segments.length > 0),
    recoveryNeed: deriveRecoveryNeed(energyLevel, facts),
    dailyMode: deriveDailyMode(input, energyLevel),
  };

  return {
    schemaVersion: 0,
    date: input.date,
    facts,
    estimates,
    estimatesFrozen: {
      at: input.nowHHMM,
      frozenKind: toFrozenKind(input.nowHHMM),
      // 凍結はディープコピー（以後の補正で current 側だけが変わることを構造的に保証）
      values: JSON.parse(JSON.stringify(estimates)) as DayStateEstimates,
    },
    userInputs: {
      moodCode: input.moodCode,
      sleepQuality: input.sleepQuality,
      corrections: [],
      manualLevels: input.manualLevels,
    },
    evidence: collectEvidence(input, facts),
  };
}

// ── 補正適用（estimates のみ更新。estimatesFrozen は不変） ──

const RESERVE_ORDER: ReserveLevel[] = ["low", "medium", "high"];
const ENERGY_ORDER: EnergyLevelValue[] = ["depleted", "low", "medium", "high"];
const OUTING_ORDER: OutingToleranceLevel[] = ["low", "medium", "high"];

function shiftOrdered<T extends string>(order: readonly T[], current: T, dir: 1 | -1, fallback: T): T {
  const idx = order.indexOf(current);
  if (idx < 0) return fallback; // unknown からの補正は中央へ
  return order[Math.max(0, Math.min(order.length - 1, idx + dir))];
}

/**
 * 系統・カードタップ補正。direction は常に格納値空間（3 系統は全て余力方向）。
 * unknown への "match" は中央値の確認として扱う。dayFeasibility / dailyMode は補正対象外。
 */
export function applyUserCorrection(record: DayStateRecordV0, correction: UserCorrection): DayStateRecordV0 {
  const field: EstimateFieldKey = correction.field;
  // recoveryNeed は系統タップの対象外（§3.2: 内部保持・周辺カード材料のみ）
  if (field === "dayFeasibility" || field === "dailyMode" || field === "recoveryNeed") return record;

  const next: DayStateRecordV0 = {
    ...record,
    estimates: { ...record.estimates },
    userInputs: { ...record.userInputs, corrections: [...record.userInputs.corrections, correction] },
    evidence: record.evidence.includes("user_correction")
      ? record.evidence
      : [...record.evidence, "user_correction"],
  };

  const apply = <T extends string>(cur: ConfidentValue<T>, order: readonly T[], center: T): ConfidentValue<T> => {
    if (correction.direction === "match") {
      const value = order.includes(cur.value) ? cur.value : center;
      return { value, confidence: 0.9, source: "user_confirmed" };
    }
    const dir = correction.direction === "higher" ? 1 : -1;
    return { value: shiftOrdered(order, cur.value, dir, center), confidence: 0.9, source: "user_confirmed" };
  };

  switch (field) {
    case "energyLevel":
      next.estimates.energyLevel = apply(record.estimates.energyLevel, ENERGY_ORDER, "medium");
      break;
    case "focusReserve":
      next.estimates.focusReserve = apply(record.estimates.focusReserve, RESERVE_ORDER, "medium");
      break;
    case "emotionalReserve":
      next.estimates.emotionalReserve = apply(record.estimates.emotionalReserve, RESERVE_ORDER, "medium");
      break;
    case "outingTolerance":
      next.estimates.outingTolerance = apply(record.estimates.outingTolerance, OUTING_ORDER, "medium");
      break;
  }
  return next;
}
