import { describe, it, expect } from "vitest";
import {
  detectRegimeChange,
  computeRegimeFactorFn,
  DEFAULT_L3_CONFIG,
} from "@/lib/plan/mobility/mobilitySelectiveForgetting";
import {
  buildL3PooledBeliefMultiLevel,
  buildPooledBeliefMultiLevel,
  type RepertoireQuery,
} from "@/lib/plan/mobility/mobilityRepertoireBelief";
import { buildWeightedModeBelief } from "@/lib/plan/mobility/beliefReadAdapter";
import {
  SELECTED_MODE_STORE_VERSION,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import {
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackEntry,
  type HypothesisFeedbackStore,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import {
  MOBILITY_OBSERVATION_SCHEMA_VERSION,
  type MobilityObservation,
  type MobilityObservationStore,
} from "@/lib/plan/mobility/mobilityObservationStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

const LEG = "home__work";
function fb(byDay: Record<string, Record<string, HypothesisFeedbackEntry>>): HypothesisFeedbackStore {
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}
function corr(chosen: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "explicitCorrection", surfacedMode: "train", chosenMode: chosen };
}
function conf(mode: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "confirmation", surfacedMode: mode, chosenMode: mode };
}
// regime-change シナリオ: 旧 train(d01-d05) + 直近 N walk correction(d06-) を組む
function scenario(opts: { oldTrain: number; newWalkCorr: number }) {
  const selByDay: Record<string, Record<string, RouteTransportMode>> = {};
  const obsByDay: Record<string, Record<string, MobilityObservation>> = {};
  const fbByDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  const ob = (mode: RouteTransportMode): MobilityObservation => ({
    mode,
    timeband: "morning",
    weekday: "weekday",
    originKey: "自宅",
    destKey: "会社",
    privacyClass: "normal",
  });
  let d = 1;
  for (let i = 0; i < opts.oldTrain; i += 1, d += 1) {
    const day = `2026-06-${String(d).padStart(2, "0")}`;
    (selByDay[day] ??= {})[LEG] = "train";
    (obsByDay[day] ??= {})[LEG] = ob("train");
  }
  for (let i = 0; i < opts.newWalkCorr; i += 1, d += 1) {
    const day = `2026-06-${String(d).padStart(2, "0")}`;
    (selByDay[day] ??= {})[LEG] = "walk";
    (obsByDay[day] ??= {})[LEG] = ob("walk");
    (fbByDay[day] ??= {})[LEG] = corr("walk");
  }
  return {
    sel: { version: SELECTED_MODE_STORE_VERSION, byDay: selByDay } as SelectedModeStore,
    obs: { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay: obsByDay } as MobilityObservationStore,
    fb: { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay: fbByDay } as HypothesisFeedbackStore,
  };
}
function q(p: Partial<RepertoireQuery> = {}): RepertoireQuery {
  return { legKey: LEG, odKey: null, timeband: "morning", weekday: "weekday", ...p };
}

describe("detectRegimeChange (L3 検出)", () => {
  it("1. correction なし → null", () => {
    expect(detectRegimeChange(fb({}), LEG, 2)).toBeNull();
    expect(detectRegimeChange(fb({ "2026-06-01": { [LEG]: conf("train") } }), LEG, 2)).toBeNull(); // confirmation は無視
  });
  it("2. correction < N → null", () => {
    expect(detectRegimeChange(fb({ "2026-06-01": { [LEG]: corr("walk") } }), LEG, 2)).toBeNull();
  });
  it("3. N 連続同一 mode → regime-change(changePoint=開始日)", () => {
    const f = fb({ "2026-06-05": { [LEG]: corr("walk") }, "2026-06-06": { [LEG]: corr("walk") } });
    expect(detectRegimeChange(f, LEG, 2)).toEqual({ changePoint: "2026-06-05", toMode: "walk" });
  });
  it("4. 末尾が異なる mode（連続でない）→ null", () => {
    const f = fb({ "2026-06-05": { [LEG]: corr("walk") }, "2026-06-06": { [LEG]: corr("bus") } });
    expect(detectRegimeChange(f, LEG, 2)).toBeNull(); // 末尾連続は walk1 件のみ
  });
  it("5. 古い X + 直近 N 連続 Y → Y(changePoint=Y streak 開始)", () => {
    const f = fb({
      "2026-06-01": { [LEG]: corr("bus") }, // 古い別 correction
      "2026-06-05": { [LEG]: corr("walk") },
      "2026-06-06": { [LEG]: corr("walk") },
    });
    expect(detectRegimeChange(f, LEG, 2)).toEqual({ changePoint: "2026-06-05", toMode: "walk" });
  });
  it("6. ちょうど N → 検出 / N-1 → null", () => {
    const f = fb({ "2026-06-05": { [LEG]: corr("walk") }, "2026-06-06": { [LEG]: corr("walk") }, "2026-06-07": { [LEG]: corr("walk") } });
    expect(detectRegimeChange(f, LEG, 3)?.changePoint).toBe("2026-06-05");
    expect(detectRegimeChange(f, LEG, 4)).toBeNull();
  });
});

describe("computeRegimeFactorFn (L3 重み adapter)", () => {
  it("7. regime-change なし → 恒等（常に 1）", () => {
    const fn = computeRegimeFactorFn(fb({}), DEFAULT_L3_CONFIG);
    expect(fn("2026-01-01", LEG)).toBe(1);
    expect(fn("2099-12-31", "any")).toBe(1);
  });
  it("8. regime-change あり → 古い日 λ / 以降 1 / 他 leg 1", () => {
    const f = fb({ "2026-06-05": { [LEG]: corr("walk") }, "2026-06-06": { [LEG]: corr("walk") } });
    const fn = computeRegimeFactorFn(f, { streakN: 2, lambda: 0.5 });
    expect(fn("2026-06-04", LEG)).toBe(0.5); // change-point(06-05)より古い
    expect(fn("2026-06-05", LEG)).toBe(1); // change-point 以降
    expect(fn("2026-06-04", "other__leg")).toBe(1); // regime-change のない leg
  });
});

describe("L3 weight relaxation + L4 integration", () => {
  it("9. ★古い観測 ×λ(削除でない)・新 mode が surface（旧 5train + 新 2walkcorr）", () => {
    const { sel, fb: f } = scenario({ oldTrain: 5, newWalkCorr: 2 });
    const fn = computeRegimeFactorFn(f, DEFAULT_L3_CONFIG);
    const withL3 = buildWeightedModeBelief(sel, f, LEG, fn);
    const without = buildWeightedModeBelief(sel, f, LEG);
    expect(without.topMode).toBe("train"); // L3 なし: train5 > walk4(correction weight2)
    expect(withL3.topMode).toBe("walk"); // L3 あり: train 2.5(×λ) < walk4 → 逆転
    expect(withL3.counts.train).toBeCloseTo(2.5); // 古い train は削除されず ×0.5 で残る
  });
  it("10. ★no regime-change → buildL3 == buildPooled（退行ゼロ）", () => {
    const { sel, obs, fb: f } = scenario({ oldTrain: 5, newWalkCorr: 0 }); // correction なし
    expect(buildL3PooledBeliefMultiLevel(obs, sel, f, q())).toEqual(buildPooledBeliefMultiLevel(obs, sel, f, q()));
  });
  it("11. regime-change → pooled belief が新 mode 寄りにシフト", () => {
    const { sel, obs, fb: f } = scenario({ oldTrain: 5, newWalkCorr: 2 });
    expect(buildPooledBeliefMultiLevel(obs, sel, f, q()).topMode).toBe("train"); // L3 なし
    expect(buildL3PooledBeliefMultiLevel(obs, sel, f, q()).topMode).toBe("walk"); // L3 あり: 旧緩和→walk
  });
  it("12. λ=1 → 緩和なし（L4-b 同一）", () => {
    const { sel, obs, fb: f } = scenario({ oldTrain: 5, newWalkCorr: 2 });
    expect(buildL3PooledBeliefMultiLevel(obs, sel, f, q(), { streakN: 2, lambda: 1 })).toEqual(
      buildPooledBeliefMultiLevel(obs, sel, f, q()),
    );
  });
  it("13. 古い観測は削除されない（count に残る・weight だけ低下）", () => {
    const { sel, fb: f } = scenario({ oldTrain: 5, newWalkCorr: 2 });
    const b = buildWeightedModeBelief(sel, f, LEG, computeRegimeFactorFn(f, DEFAULT_L3_CONFIG));
    expect(b.counts.train).toBeGreaterThan(0); // 削除されていない
    expect(b.counts.train).toBeLessThan(5); // weight は低下(5→2.5)
  });
});
