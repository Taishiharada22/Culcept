import { describe, it, expect } from "vitest";
import {
  buildPhaseBReadinessProgress,
  PHASE_B_DATA_GATE,
  PHASE_B_CHECK_LABEL,
  PHASE_B_OVERALL_DISPLAY,
  PHASE_B_DB_READ_NOTE,
} from "@/lib/plan/mobility/phaseBReadinessProgress";
import {
  MOBILITY_OBSERVATION_SCHEMA_VERSION,
  type MobilityObservationStore,
  type MobilityObservation,
} from "@/lib/plan/mobility/mobilityObservationStore";
import {
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackStore,
  type HypothesisFeedbackEntry,
  type MobilityReason,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";

const EMPTY_OBS: MobilityObservationStore = { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay: {} };
const EMPTY_FB: HypothesisFeedbackStore = { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay: {} };

function obs(): MobilityObservation {
  return { mode: "train", timeband: "morning", weekday: "weekday", originKey: "o", destKey: "d", privacyClass: "normal" };
}
/** dayISO（"2026-06-01" 起点・連続/隔日を選べる）× per-day 件数で観測 store を作る。 */
function obsStore(perDayCounts: number[], opts: { gapDays?: boolean } = {}): MobilityObservationStore {
  const byDay: Record<string, Record<string, MobilityObservation>> = {};
  perDayCounts.forEach((count, i) => {
    const dayNum = 1 + i * (opts.gapDays ? 2 : 1); // gapDays=true で隔日（隣接ペア 0）
    const day = `2026-06-${String(dayNum).padStart(2, "0")}`;
    const legs: Record<string, MobilityObservation> = {};
    for (let k = 0; k < count; k += 1) legs[`leg-${k}`] = obs();
    byDay[day] = legs;
  });
  return { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay };
}
function fbStore(reasons: MobilityReason[]): HypothesisFeedbackStore {
  const byDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  reasons.forEach((r, i) => {
    byDay[`2026-05-${String((i % 27) + 1).padStart(2, "0")}`] = {
      [`leg-${i}`]: { kind: "explicitCorrection", surfacedMode: "walk", chosenMode: "train", reason: r },
    };
  });
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}
// 10 reasons（うち tired 3）= reason gate 充足
const REASONS_OK = fbStore(["tired", "tired", "tired", "scenery", "cheap", "mood", "hurry", "scenery", "cheap", "mood"]);

describe("buildPhaseBReadinessProgress — data gate 判定", () => {
  it("★empty data → 全 check 未達・accumulating", () => {
    const p = buildPhaseBReadinessProgress(EMPTY_OBS, EMPTY_FB);
    expect(p.overall).toBe("accumulating");
    expect(p.checks.every((c) => !c.met)).toBe(true);
  });

  it("★14日未満（10日×3）→ observation_days 未達・accumulating", () => {
    const p = buildPhaseBReadinessProgress(obsStore(Array(10).fill(3)), REASONS_OK);
    expect(p.checks.find((c) => c.key === "observation_days")?.met).toBe(false);
    expect(p.overall).toBe("accumulating");
  });

  it("★14日連続 + median3 + A0 充足 だが 総数<40 → design_review_ready", () => {
    // counts = [1×6, 3×8]: days14・連続ペア13・median3・total30(<40)
    const counts = [...Array(6).fill(1), ...Array(8).fill(3)];
    const p = buildPhaseBReadinessProgress(obsStore(counts), REASONS_OK);
    expect(p.checks.every((c) => c.met)).toBe(true);
    expect(p.totals.totalObservations).toBeLessThan(PHASE_B_DATA_GATE.minTotalObservationsForV0);
    expect(p.overall).toBe("design_review_ready");
  });

  it("★14日連続×3 + A0 充足（総数42≥40）→ v0_candidate", () => {
    const p = buildPhaseBReadinessProgress(obsStore(Array(14).fill(3)), REASONS_OK);
    expect(p.overall).toBe("v0_candidate");
  });

  it("★隔日 14日（隣接ペア 0）→ consecutive_pairs 未達・accumulating", () => {
    const p = buildPhaseBReadinessProgress(obsStore(Array(14).fill(3), { gapDays: true }), REASONS_OK);
    expect(p.checks.find((c) => c.key === "consecutive_pairs")?.met).toBe(false);
    expect(p.overall).toBe("accumulating");
  });

  it("★A0 10件でも tired<3 → reason_count 未達", () => {
    const fb = fbStore(["tired", "tired", "scenery", "cheap", "mood", "hurry", "scenery", "cheap", "mood", "other"]);
    const p = buildPhaseBReadinessProgress(obsStore(Array(14).fill(3)), fb);
    expect(p.checks.find((c) => c.key === "reason_count")?.met).toBe(false);
  });

  it("gate 閾値は doc と同値（14/10/3/10/3/40）", () => {
    expect(PHASE_B_DATA_GATE).toEqual({
      minObservationDays: 14,
      minConsecutiveDayPairs: 10,
      minMedianPerDay: 3,
      minReasonCount: 10,
      minTiredCount: 3,
      minTotalObservationsForV0: 40,
    });
  });
});

describe("表示ラベル — 数字なし・status summary のみ", () => {
  /** 識別子（A0 / B0 / v0 等の slice 名）は許容・raw count/score の数字は禁止。 */
  const stripIdentifiers = (s: string) => s.replace(/A0|B-?0|v0|Phase B/g, "");
  it("★check/overall/DB note の表示文字列に raw 数字・%を含まない（識別子除く）", () => {
    for (const label of Object.values(PHASE_B_CHECK_LABEL)) expect(stripIdentifiers(label)).not.toMatch(/[0-9%]/);
    for (const d of Object.values(PHASE_B_OVERALL_DISPLAY)) expect(stripIdentifiers(`${d.label}${d.action}`)).not.toMatch(/[0-9%]/);
    expect(stripIdentifiers(PHASE_B_DB_READ_NOTE)).not.toMatch(/[0-9%]/);
  });
  it("★DB read 領域は別 status（蓄積 gate と独立の常設 note）", () => {
    expect(PHASE_B_DB_READ_NOTE).toContain("DB read");
    expect(PHASE_B_DB_READ_NOTE).toContain("承認");
  });
});
