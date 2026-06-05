import { describe, it, expect, vi } from "vitest";
import {
  buildPooledBeliefMultiLevel,
  buildPooledBelief,
  buildRepertoireBelief,
  DEFAULT_KAPPA_CONFIG,
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
  type PrivacyClass,
  type Timeband,
  type WeekdayBucket,
} from "@/lib/plan/mobility/mobilityObservationStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

const LEG = "home__work";
const OD = "自宅__会社";
function q(p: Partial<RepertoireQuery> = {}): RepertoireQuery {
  return { legKey: LEG, odKey: OD, timeband: "morning", weekday: "weekday", ...p };
}
function corr(chosen: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "explicitCorrection", surfacedMode: "train", chosenMode: chosen };
}
function conf(mode: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "confirmation", surfacedMode: mode, chosenMode: mode };
}

interface Leg {
  day: string;
  legKey: string;
  mode: RouteTransportMode;
  originKey?: string | null;
  destKey?: string | null;
  timeband?: Timeband;
  weekday?: WeekdayBucket;
  privacyClass?: PrivacyClass;
  obsMode?: RouteTransportMode;
  feedback?: HypothesisFeedbackEntry;
  noObs?: boolean;
}
function build(legs: Leg[]): { sel: SelectedModeStore; obs: MobilityObservationStore; fb: HypothesisFeedbackStore } {
  const sB: Record<string, Record<string, RouteTransportMode>> = {};
  const oB: Record<string, Record<string, MobilityObservation>> = {};
  const fB: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const l of legs) {
    (sB[l.day] ??= {})[l.legKey] = l.mode;
    if (!l.noObs) {
      (oB[l.day] ??= {})[l.legKey] = {
        mode: l.obsMode ?? l.mode,
        timeband: l.timeband ?? "morning",
        weekday: l.weekday ?? "weekday",
        originKey: l.originKey === undefined ? "自宅" : l.originKey,
        destKey: l.destKey === undefined ? "会社" : l.destKey,
        privacyClass: l.privacyClass ?? "normal",
      };
    }
    if (l.feedback) (fB[l.day] ??= {})[l.legKey] = l.feedback;
  }
  return {
    sel: { version: SELECTED_MODE_STORE_VERSION, byDay: sB },
    obs: { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay: oB },
    fb: { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay: fB },
  };
}
/** query OD（自宅→会社）の cross-instance legs */
function odLegs(n: number, mode: RouteTransportMode, opts: Partial<Leg> = {}): Leg[] {
  return Array.from({ length: n }, (_, i) => ({ day: `2026-05-${String(i + 1).padStart(2, "0")}`, legKey: `od${i}__x`, mode, ...opts }));
}
/** 別 odKey（P→Q）の legs → global にのみ寄与 */
function globalLegs(n: number, mode: RouteTransportMode): Leg[] {
  return Array.from({ length: n }, (_, i) => ({ day: `2026-04-${String(i + 1).padStart(2, "0")}`, legKey: `g${i}__x`, mode, originKey: "P", destKey: "Q" }));
}
function legSel(mode: RouteTransportMode, n: number): Leg[] {
  return Array.from({ length: n }, (_, i) => ({ day: `leg${i}`, legKey: LEG, mode, noObs: true }));
}

describe("buildPooledBeliefMultiLevel (L4-b・GPT 必須 20 ケース)", () => {
  it("1. empty obs → v0 完全同一", () => {
    const { sel, obs, fb } = build(legSel("train", 3));
    expect(buildPooledBeliefMultiLevel(obs, sel, fb, q())).toEqual(buildWeightedModeBelief(sel, fb, LEG));
  });

  it("2. root uniform を入れない（empty obs で全 mode smear なし）", () => {
    const { sel, obs, fb } = build(legSel("train", 3));
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q());
    expect(Object.keys(b.counts)).toEqual(["train"]); // train のみ・uniform 拡散なし
    expect(b.total).toBe(3);
  });

  it("3. strong legKey は global/OD に上書きされない（厳密 v0）", () => {
    const { sel, obs, fb } = build([...legSel("walk", 5), ...odLegs(5, "train"), ...globalLegs(5, "train")]);
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q());
    expect(b.topMode).toBe("walk");
    expect(b).toEqual(buildWeightedModeBelief(sel, fb, LEG));
  });

  it("4. cold leg + odKey train → train prior（total=κ_leg）", () => {
    const { sel, obs, fb } = build(odLegs(5, "train"));
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q());
    expect(b.topMode).toBe("train");
    expect(b.total).toBe(DEFAULT_KAPPA_CONFIG.leg); // 0 + κ_leg（OD backing 十分）
  });

  it("5. cold leg + no odKey + global train → 弱い global prior（total=κ_global）", () => {
    const { sel, obs, fb } = build(globalLegs(8, "train"));
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q({ odKey: null }));
    expect(b.topMode).toBe("train");
    expect(b.total).toBe(DEFAULT_KAPPA_CONFIG.global); // 弱い（1）
  });

  it("6. global-only（新 OD・観測なし）で過剰 surface しない（total < moderate）", () => {
    const { sel, obs, fb } = build(globalLegs(8, "train")); // query OD には観測なし
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q());
    expect(b.total).toBe(DEFAULT_KAPPA_CONFIG.global);
    expect(b.total).toBeLessThan(3); // moderate 閾値未満
  });

  it("7. odKey×timeband×weekday が最優先", () => {
    const morningWalk: Leg[] = Array.from({ length: 3 }, (_, i) => ({ day: `mw${i}`, legKey: `mw${i}__x`, mode: "walk", timeband: "morning", weekday: "weekday" }));
    const eveningTrain: Leg[] = Array.from({ length: 3 }, (_, i) => ({ day: `et${i}`, legKey: `et${i}__x`, mode: "train", timeband: "evening", weekday: "weekday" }));
    const { sel, obs, fb } = build([...morningWalk, ...eveningTrain]);
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q({ timeband: "morning", weekday: "weekday" }));
    expect(b.topMode).toBe("walk"); // morning ctx の walk が最優先（evening train は別 ctx）
  });

  it("8. ctx 薄い → odKey×weekday / odKey へ fallback", () => {
    const afternoonTrain: Leg[] = Array.from({ length: 4 }, (_, i) => ({ day: `at${i}`, legKey: `at${i}__x`, mode: "train", timeband: "afternoon", weekday: "weekday" }));
    const { sel, obs, fb } = build(afternoonTrain);
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q({ timeband: "morning", weekday: "weekday" }));
    expect(b.topMode).toBe("train"); // morning ctx 空 → 粗い od(train) へ fallback
  });

  it("9. contested context → topShare 低下（沈黙）", () => {
    const ctxWalk: Leg[] = Array.from({ length: 3 }, (_, i) => ({ day: `cw${i}`, legKey: `cw${i}__x`, mode: "walk", timeband: "morning", weekday: "weekday" }));
    const ctxTrain: Leg[] = Array.from({ length: 3 }, (_, i) => ({ day: `ct${i}`, legKey: `ct${i}__x`, mode: "train", timeband: "morning", weekday: "weekday" }));
    const { sel, obs, fb } = build([...ctxWalk, ...ctxTrain]);
    expect(buildPooledBeliefMultiLevel(obs, sel, fb, q()).topShare).toBeLessThan(0.6);
  });

  it("10. explicitCorrection が global/OD prior に効く", () => {
    const c: Leg[] = [
      { day: "c1", legKey: "c1__x", mode: "walk", feedback: corr("walk") },
      { day: "c2", legKey: "c2__x", mode: "walk", feedback: corr("walk") },
    ];
    const { sel, obs, fb } = build([...c, ...odLegs(3, "train").map((l, i) => ({ ...l, day: `tc${i}` }))]);
    expect(buildPooledBeliefMultiLevel(obs, sel, fb, q()).topMode).toBe("walk"); // correction(weight2)で walk 優勢
  });

  it("11. confirmation は増幅しない", () => {
    const withConf = build(odLegs(3, "train").map((l) => ({ ...l, feedback: conf("train") })));
    const plain = build(odLegs(3, "train"));
    expect(buildPooledBeliefMultiLevel(withConf.obs, withConf.sel, withConf.fb, q())).toEqual(
      buildPooledBeliefMultiLevel(plain.obs, plain.sel, plain.fb, q()),
    );
  });

  it("12. stale feedback は使わない", () => {
    const stale = build([
      { day: "s1", legKey: "s1__x", mode: "walk", feedback: { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "bus" } },
      { day: "s2", legKey: "s2__x", mode: "train" },
    ]);
    const b = buildPooledBeliefMultiLevel(stale.obs, stale.sel, stale.fb, q());
    expect(b.counts.walk).toBeCloseTo(b.counts.train ?? 0); // 50/50（correction の 2 でない）
  });

  it("13. redacted observation は global/OD/context 集計に使わない", () => {
    const { sel, obs, fb } = build(odLegs(5, "walk", { privacyClass: "redacted", originKey: null, destKey: null }));
    const b = buildPooledBeliefMultiLevel(obs, sel, fb, q());
    expect(b.total).toBe(0);
    expect(b).toEqual(buildWeightedModeBelief(sel, fb, LEG));
  });

  it("14. unknown mode 除外", () => {
    const { sel, obs, fb } = build(odLegs(5, "unknown"));
    expect(buildPooledBeliefMultiLevel(obs, sel, fb, q()).total).toBe(0);
  });

  it("15. κ_global_effective が小さい（global 大量でも total=κ_global）", () => {
    const { sel, obs, fb } = build(globalLegs(20, "train"));
    expect(buildPooledBeliefMultiLevel(obs, sel, fb, q({ odKey: null })).total).toBe(DEFAULT_KAPPA_CONFIG.global);
    expect(DEFAULT_KAPPA_CONFIG.global).toBeLessThan(DEFAULT_KAPPA_CONFIG.leg);
  });

  it("16. L4-a buildPooledBelief は温存", () => {
    const { sel, obs, fb } = build(odLegs(5, "train"));
    expect(buildPooledBelief(obs, sel, fb, q()).topMode).toBe("train");
  });

  it("17. buildRepertoireBelief は温存", () => {
    const { sel, obs, fb } = build(legSel("train", 3));
    expect(buildRepertoireBelief(obs, sel, fb, q())).toEqual(buildWeightedModeBelief(sel, fb, LEG));
  });

  it("18. selectedStore 正本・observation.mode は正本扱いしない", () => {
    const { sel, obs, fb } = build(odLegs(5, "walk", { obsMode: "train" }));
    expect(buildPooledBeliefMultiLevel(obs, sel, fb, q()).topMode).toBe("walk");
  });

  // 19. MapTab 未配線 → commit audit（git status・本 unit では対象外）

  it("20. Google API / DB / fetch を呼ばない", () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, writable: true, configurable: true });
    const { sel, obs, fb } = build(odLegs(5, "train"));
    buildPooledBeliefMultiLevel(obs, sel, fb, q());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
