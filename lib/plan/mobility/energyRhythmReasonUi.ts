/**
 * lib/plan/mobility/energyRhythmReasonUi.ts
 *   — Energy Rhythm UI: 移動手段カードの **reason-only / read-only** 1 行補助（pure core + flag）
 *
 * ★目的（CEO 2026-06-09 承認・Movement Tolerance と同型 reason-only）: 「いつ活動しているか」の観測を
 *   **本人に見える 1 行**で控えめに添える。ranking / scoring / Day Rehearsal には **反映しない**（読むだけ）。
 *
 * ★スコープと配置（honesty）:
 *   - energy rhythm は **day-level の standing profile**（timeband 分布）。leg カードでは **その leg の timeband に
 *     一致した時のみ** 1 行（contextually relevant・出すぎ防止）。文言は「{時間帯}は活動の記録が…」と
 *     standing-profile 文ゆえ leg 固有を誤表現しない。
 *   - ★movement tolerance（per-leg・別軸）と **同一スロットを共有し AT MOST 1 行**（呼び側が優先順で 1 つに絞る）。
 *
 * ★表示規律（CEO 制約・Movement Tolerance UI と同一）:
 *   - flag default **OFF** ∧ dev-only（production hard block）。flag OFF→完全不変。
 *   - sparse（not_enough）/ 一致 signal なし → null（沈黙）。sensitive/readOnly は呼び側が沈黙。
 *   - raw count / score / confidence / 内部値は出さない（reason 文字列のみ）。trait（朝型/夜型）にしない。
 */
import type { MobilityObservation, Timeband } from "@/lib/plan/mobility/mobilityObservationStore";
import { buildEnergyRhythm, energyRhythmReasonLine } from "@/lib/plan/mobility/energyRhythm";

/**
 * ★Energy Rhythm reason-only UI flag（**default OFF**・dev-only）。
 * gate の `process.env.NODE_ENV !== "production"` により **dev のみ ON・production は hard block**。
 * ★ranking / scoring / Day Rehearsal には影響しない（reason 表示のみ・read-only）。
 */
export const ENERGY_RHYTHM_REASON_UI_ENABLED = false;

/** 活動時間帯 reason を出してよいか（flag ON ∧ 非 production・default OFF）。 */
export function isEnergyRhythmReasonUiEnabled(): boolean {
  return ENERGY_RHYTHM_REASON_UI_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/**
 * ★その leg の timeband に一致する活動水準 signal があれば 1 行（pure・read-only）。
 *   not_enough / その timeband が typical（沈黙）→ null。day-level profile を leg-context で 1 行に絞る。
 */
export function energyRhythmReasonForTimeband(
  observations: readonly MobilityObservation[],
  timeband: Timeband,
): string | null {
  const readiness = buildEnergyRhythm(observations);
  if (readiness.status !== "ready") return null;
  const signal = readiness.signals.find((s) => s.timeband === timeband);
  return signal ? energyRhythmReasonLine(signal) : null;
}
