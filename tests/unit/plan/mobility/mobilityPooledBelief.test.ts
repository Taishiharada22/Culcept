import { describe, it, expect } from "vitest";
import {
  buildPooledBelief,
  buildRepertoireBelief,
  DEFAULT_POOLING_KAPPA,
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
} from "@/lib/plan/mobility/mobilityObservationStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

const LEG = "home__work";
const OD = "自宅__会社";

function sel(byDay: Record<string, Record<string, RouteTransportMode>>): SelectedModeStore {
  return { version: SELECTED_MODE_STORE_VERSION, byDay };
}
function fb(byDay: Record<string, Record<string, HypothesisFeedbackEntry>>): HypothesisFeedbackStore {
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}
function obsStore(byDay: Record<string, Record<string, MobilityObservation>>): MobilityObservationStore {
  return { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay };
}
const EMPTY_OBS = obsStore({});
const EMPTY_FB = fb({});
function q(p: Partial<RepertoireQuery> = {}): RepertoireQuery {
  return { legKey: LEG, odKey: OD, timeband: "morning", weekday: "weekday", ...p };
}
function correction(chosen: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "explicitCorrection", surfacedMode: "train", chosenMode: chosen };
}
function confirmation(mode: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "confirmation", surfacedMode: mode, chosenMode: mode };
}

interface Leg {
  day: string;
  legKey: string;
  mode: RouteTransportMode;
  originKey?: string | null;
  destKey?: string | null;
  privacyClass?: PrivacyClass;
  obsMode?: RouteTransportMode;
  feedback?: HypothesisFeedbackEntry;
  noObs?: boolean;
}
function build(legs: Leg[]) {
  const selByDay: Record<string, Record<string, RouteTransportMode>> = {};
  const obsByDay: Record<string, Record<string, MobilityObservation>> = {};
  const fbByDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const l of legs) {
    (selByDay[l.day] ??= {})[l.legKey] = l.mode;
    if (!l.noObs) {
      (obsByDay[l.day] ??= {})[l.legKey] = {
        mode: l.obsMode ?? l.mode,
        timeband: "morning",
        weekday: "weekday",
        originKey: l.originKey === undefined ? "自宅" : l.originKey,
        destKey: l.destKey === undefined ? "会社" : l.destKey,
        privacyClass: l.privacyClass ?? "normal",
      };
    }
    if (l.feedback) (fbByDay[l.day] ??= {})[l.legKey] = l.feedback;
  }
  return { sel: sel(selByDay), obs: obsStore(obsByDay), fb: fb(fbByDay) };
}
/** 同 OD の別 leg を n 本（各別日・別 legKey） */
function odLegs(n: number, mode: RouteTransportMode, opts: Partial<Leg> = {}): Leg[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-05-${String(i + 1).padStart(2, "0")}`,
    legKey: `inst${i}__x`,
    mode,
    ...opts,
  }));
}

describe("buildPooledBelief (L4-a partial-pooling・GPT 必須 15 ケース)", () => {
  it("1. empty obs → v0 完全同一", () => {
    const s = sel({ d1: { [LEG]: "train" }, d2: { [LEG]: "train" }, d3: { [LEG]: "train" } });
    expect(buildPooledBelief(EMPTY_OBS, s, EMPTY_FB, q())).toEqual(buildWeightedModeBelief(s, EMPTY_FB, LEG));
  });

  it("2. OD なし(odKey null) → v0 完全同一", () => {
    const s = sel({ d1: { [LEG]: "train" }, d2: { [LEG]: "train" } });
    const { obs } = build(odLegs(5, "walk"));
    expect(buildPooledBelief(obs, s, EMPTY_FB, q({ odKey: null }))).toEqual(buildWeightedModeBelief(s, EMPTY_FB, LEG));
  });

  it("3. cold leg + OD train → train prior（κ·1.0）", () => {
    const { sel: s, obs, fb: f } = build(odLegs(5, "train"));
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.topMode).toBe("train");
    expect(b.total).toBe(DEFAULT_POOLING_KAPPA); // n_leg(0) + κ(3)
    expect(b.counts).toEqual({ train: 3 });
  });

  it("4. weak leg walk + OD train → blend（両方 count に残る）", () => {
    const legWeak: Leg[] = [
      { day: "w1", legKey: LEG, mode: "walk", noObs: true },
      { day: "w2", legKey: LEG, mode: "walk", noObs: true }, // legKey 2 walk = weak
    ];
    const { sel: s, obs, fb: f } = build([...legWeak, ...odLegs(5, "train")]);
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.counts.walk).toBe(2); // leg の walk が残る（捨てない）
    expect(b.counts.train).toBe(3); // κ·p_OD(train=1.0)
    expect(b.total).toBe(5); // 2 + 3
    expect(b.topMode).toBe("train"); // κ=3 で OD 優勢（weak は prior に縮約）
  });

  it("5. strong leg walk + OD train → walk 厳密優先（v0 同一・OD 混入なし）", () => {
    const legStrong: Leg[] = Array.from({ length: 5 }, (_, i) => ({ day: `s${i}`, legKey: LEG, mode: "walk" as RouteTransportMode, noObs: true }));
    const { sel: s, obs, fb: f } = build([...legStrong, ...odLegs(5, "train")]);
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.topMode).toBe("walk");
    expect(b).toEqual(buildWeightedModeBelief(s, f, LEG)); // 厳密 v0
    expect(b.counts.train).toBeUndefined(); // OD train は混ざらない
  });

  it("6. OD contested → topShare 低下（surface しない）", () => {
    const { sel: s, obs, fb: f } = build([...odLegs(3, "train"), ...odLegs(3, "walk").map((l, i) => ({ ...l, day: `2026-05-1${i}` }))]);
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.topShare).toBeCloseTo(0.5); // 拮抗 → < 0.6 → gate 沈黙
  });

  it("7. explicitCorrection が OD prior にも効く（prior を flip）", () => {
    // OD: walk 2件(correction weight2 → 4) + train 3件(selected weight1 → 3) → p_OD walk 4/7 優勢
    const corr: Leg[] = [
      { day: "2026-05-01", legKey: "c1__x", mode: "walk", feedback: correction("walk") },
      { day: "2026-05-02", legKey: "c2__x", mode: "walk", feedback: correction("walk") },
    ];
    const withCorr = build([...corr, ...odLegs(3, "train").map((l, i) => ({ ...l, day: `2026-05-1${i}` }))]);
    expect(buildPooledBelief(withCorr.obs, withCorr.sel, withCorr.fb, q()).topMode).toBe("walk");
    // correction なし（walk 2件 selected weight1 → 2）→ p_OD train 3/5 優勢
    const noCorr = build([
      { day: "2026-05-01", legKey: "c1__x", mode: "walk" },
      { day: "2026-05-02", legKey: "c2__x", mode: "walk" },
      ...odLegs(3, "train").map((l, i) => ({ ...l, day: `2026-05-1${i}` })),
    ]);
    expect(buildPooledBelief(noCorr.obs, noCorr.sel, noCorr.fb, q()).topMode).toBe("train");
  });

  it("8. confirmation は増幅しない（OD prior が selection と同値）", () => {
    const withConf = build(odLegs(3, "train", {}).map((l) => ({ ...l, feedback: confirmation("train") })));
    const plain = build(odLegs(3, "train"));
    expect(buildPooledBelief(withConf.obs, withConf.sel, withConf.fb, q())).toEqual(
      buildPooledBelief(plain.obs, plain.sel, plain.fb, q()),
    );
  });

  it("9. stale feedback は使わない（chosenMode≠最終mode は weight1）", () => {
    // OD: walk(stale correction: chosen=bus≠walk → weight1) + train(selected weight1) → p_OD 50/50
    const stale = build([
      { day: "2026-05-01", legKey: "s1__x", mode: "walk", feedback: { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "bus" } },
      { day: "2026-05-02", legKey: "s2__x", mode: "train" },
    ]);
    const b = buildPooledBelief(stale.obs, stale.sel, stale.fb, q());
    expect(b.counts.walk).toBeCloseTo(1.5); // κ·0.5（weight1 で 50/50・correction の 2 でない）
    expect(b.counts.train).toBeCloseTo(1.5);
  });

  it("10. redacted observation は OD prior に入らない", () => {
    const { sel: s, obs, fb: f } = build(odLegs(5, "walk", { privacyClass: "redacted", originKey: null, destKey: null }));
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.total).toBe(0); // OD prior 空 → cold legKey(empty) → v0
    expect(b).toEqual(buildWeightedModeBelief(s, f, LEG));
  });

  it("11. unknown mode は OD prior に入らない", () => {
    const { sel: s, obs, fb: f } = build(odLegs(5, "unknown"));
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.total).toBe(0); // unknown 除外 → OD 空 → v0
  });

  it("12. κ=0 → leg-only 相当（v0）", () => {
    const legWeak = build([{ day: "w1", legKey: LEG, mode: "walk", noObs: true }]);
    const { obs } = build(odLegs(5, "train"));
    const b = buildPooledBelief(obs, legWeak.sel, legWeak.fb, q(), 0);
    expect(b).toEqual(buildWeightedModeBelief(legWeak.sel, legWeak.fb, LEG));
  });

  it("13. κ=3 pseudo-count 挙動（cold leg + OD train → total=3）", () => {
    const { sel: s, obs, fb: f } = build(odLegs(8, "train")); // OD train 8 件
    const b = buildPooledBelief(obs, s, f, q(), 3);
    expect(b.total).toBe(3); // 0 + κ
    expect(b.counts.train).toBe(3); // κ · p_OD(1.0)
    // κ=6 なら total=6
    expect(buildPooledBelief(obs, s, f, q(), 6).total).toBe(6);
  });

  it("14. selectedStore 正本・observation.mode は正本扱いしない", () => {
    // obs.mode=train(stale)・selectedStore=walk → OD prior は walk
    const { sel: s, obs, fb: f } = build(odLegs(5, "walk", { obsMode: "train" }));
    const b = buildPooledBelief(obs, s, f, q());
    expect(b.topMode).toBe("walk"); // selectedStore 正本
  });

  it("15. 既存 buildRepertoireBelief は温存される（L4 は additive）", () => {
    const s = sel({ d1: { [LEG]: "train" }, d2: { [LEG]: "train" }, d3: { [LEG]: "train" } });
    // L1-b の挙動（moderate legKey → legKey）が変わっていない
    expect(buildRepertoireBelief(EMPTY_OBS, s, EMPTY_FB, q()).topMode).toBe("train");
    expect(buildRepertoireBelief(EMPTY_OBS, s, EMPTY_FB, q())).toEqual(buildWeightedModeBelief(s, EMPTY_FB, LEG));
  });
});
