/**
 * lib/plan/mobility/prgReadinessConsole.ts
 *   — PRG Readiness Evaluator の operator console 補助（flag + 表示 helper + loader）
 *
 * ★目的（CEO 2026-06-09 承認）: PRG 各軸の状態（data不足/dogfood中/activation候補/懸念/休止）を
 *   **operator（/ceo dashboard）に read-only で表示**するための flag・ラベル・loader。
 *
 * ★規律（CEO 制約）:
 *   - dev/operator 専用・flag default OFF・production hard block・**user-facing UI でない**。
 *   - status summary のみ（raw count/score/confidence/内部値を出さない）。
 *   - sparse は accumulating として正直に。activation 候補は stability evidence がある場合だけ。
 *   - Day Rehearsal/Plan/scoring/ranking/activation には反映しない（読むだけ）。pure helper は Date/network なし。
 */
import type { PrgAxisKey, PrgReadinessState, PrgReadinessReport } from "@/lib/plan/mobility/prgReadinessEvaluator";
import { evaluatePrgReadiness, collectMobilityObservationAxes } from "@/lib/plan/mobility/prgReadinessEvaluator";
import { loadAllObservations } from "@/lib/plan/mobility/mobilityObservationStore";
import { isMovementToleranceReasonUiEnabled } from "@/lib/plan/mobility/movementToleranceReasonUi";
import { isEnergyRhythmReasonUiEnabled } from "@/lib/plan/mobility/energyRhythmReasonUi";
import { isPlaceAffinityReasonEnabled } from "@/lib/plan/compose/placeAffinityReasonUi";
import { loadPlaceAffinitySafetyJournal, assessPlaceAffinitySafety } from "@/lib/plan/compose/placeAffinitySafetyJournal";
import { isContextModifierEnabled } from "@/lib/plan/context/contextModifier";
import { isPersonalPaceReflectionEnabled } from "@/lib/plan/dayRehearsal/personalPaceAdapter";

/** ★operator console flag（**default OFF**・dev-only）。production は hard block。 */
export const PRG_READINESS_CONSOLE_ENABLED = false;

/** /ceo に PRG readiness を出してよいか（flag ON ∧ 非 production・default OFF）。 */
export function isPrgReadinessConsoleEnabled(): boolean {
  return PRG_READINESS_CONSOLE_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/** 軸ラベル（日本語・operator 用）。 */
export const PRG_AXIS_LABEL: Record<PrgAxisKey, string> = {
  context: "今日の文脈（A2）",
  place_affinity: "場所の相性",
  movement_tolerance: "移動耐性",
  energy_rhythm: "活動リズム",
  personal_pace: "あなたのペース",
};

/** 状態ラベル + 次アクション（★raw 値を含まない・status summary のみ）。 */
export const PRG_STATE_DISPLAY: Record<PrgReadinessState, { readonly label: string; readonly action: string }> = {
  dormant: { label: "休止", action: "flag OFF（未配信）" },
  accumulating: { label: "蓄積中", action: "観測を貯める（薄いうちは沈黙＝正常）" },
  dogfooding: { label: "観測中", action: "dogfood 観測を継続" },
  needs_attention: { label: "要確認", action: "懸念あり・activation せず review" },
  activation_candidate: { label: "活性化候補", action: "stability 確認済・activation 検討可（CEO）" },
};

/**
 * ★stores から PRG readiness report を作る（imperative・client・fail-open）。
 *   place affinity の stability は safety journal を assess（stable_safe→true / unstable→false / insufficient→null）。
 *   ★flag は実効値（`isXEnabled()`＝flag ∧ 非 production）を渡す＝production では全 dormant 相当。
 */
export function buildPrgReadinessReportFromStores(): PrgReadinessReport {
  const observations = loadAllObservations();
  const safety = assessPlaceAffinitySafety(loadPlaceAffinitySafetyJournal());
  const placeAffinityStable =
    safety.status === "stable_safe" ? true : safety.status === "unstable" ? false : null;

  const mobilityAxes = collectMobilityObservationAxes({
    observations,
    flags: {
      movementTolerance: isMovementToleranceReasonUiEnabled(),
      energyRhythm: isEnergyRhythmReasonUiEnabled(),
      placeAffinity: isPlaceAffinityReasonEnabled(),
    },
    placeAffinityStable,
  });

  // ★context = 決定時 modifier（data 蓄積 gate なし＝flag ON で operational＝dataReady true）。observed は概念なし(0)。
  const contextAxis = {
    axis: "context" as const,
    flagOn: isContextModifierEnabled(),
    dataReady: true,
    stable: null,
    observed: 0,
  };
  // ★personal pace = movementEvent 系・独自 readiness stack（次設計で専用 collector）。現状 flag OFF→dormant。
  const personalPaceAxis = {
    axis: "personal_pace" as const,
    flagOn: isPersonalPaceReflectionEnabled(),
    dataReady: false,
    stable: null,
    observed: 0,
  };

  return evaluatePrgReadiness([contextAxis, ...mobilityAxes, personalPaceAxis]);
}
