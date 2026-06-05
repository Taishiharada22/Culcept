import { describe, it, expect } from "vitest";
import {
  buildRepertoireBelief,
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
const OD = "自宅__会社"; // odKey

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
function correction(): HypothesisFeedbackEntry {
  return { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "walk" };
}

interface Leg {
  day: string;
  legKey: string;
  mode: RouteTransportMode;
  originKey?: string | null;
  destKey?: string | null;
  tb?: Timeband;
  wd?: WeekdayBucket;
  privacyClass?: PrivacyClass;
  obsMode?: RouteTransportMode; // observation.mode が selectedStore と異なる stale ケース用
  feedback?: HypothesisFeedbackEntry;
  noObs?: boolean; // observation を作らない（selected のみ）
}
/** legKey 群から selected/obs/feedback の 3 store を一括構築 */
function build(legs: Leg[]) {
  const selByDay: Record<string, Record<string, RouteTransportMode>> = {};
  const obsByDay: Record<string, Record<string, MobilityObservation>> = {};
  const fbByDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const l of legs) {
    (selByDay[l.day] ??= {})[l.legKey] = l.mode;
    if (!l.noObs) {
      (obsByDay[l.day] ??= {})[l.legKey] = {
        mode: l.obsMode ?? l.mode,
        timeband: l.tb ?? "morning",
        weekday: l.wd ?? "weekday",
        originKey: l.originKey === undefined ? "自宅" : l.originKey,
        destKey: l.destKey === undefined ? "会社" : l.destKey,
        privacyClass: l.privacyClass ?? "normal",
      };
    }
    if (l.feedback) (fbByDay[l.day] ??= {})[l.legKey] = l.feedback;
  }
  return { sel: sel(selByDay), obs: obsStore(obsByDay), fb: fb(fbByDay) };
}
/** 同 OD の cross-instance leg を n 本（legKey は inst{i}__x・各別日） */
function odLegs(n: number, mode: RouteTransportMode, opts: Partial<Leg> = {}): Leg[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-05-${String(i + 1).padStart(2, "0")}`,
    legKey: `inst${i}__x`,
    mode,
    ...opts,
  }));
}

describe("buildRepertoireBelief (L1-b・legKey 優先 + odKey fallback)", () => {
  it("1. ★退行ゼロ: empty observation → legKey belief(v0) と完全同一", () => {
    const selStore = sel({ d1: { [LEG]: "train" }, d2: { [LEG]: "train" }, d3: { [LEG]: "train" } });
    const got = buildRepertoireBelief(EMPTY_OBS, selStore, EMPTY_FB, q());
    expect(got).toEqual(buildWeightedModeBelief(selStore, EMPTY_FB, LEG));
  });

  it("2. legKey moderate+ → legKey 優先（odKey は override しない）", () => {
    // legKey 5 train(strong) + OD は 10 walk
    const legKeyData: Leg[] = Array.from({ length: 5 }, (_, i) => ({ day: `2026-04-0${i + 1}`, legKey: LEG, mode: "train" as RouteTransportMode, noObs: true }));
    const { sel: s, obs: o, fb: f } = build([...legKeyData, ...odLegs(10, "walk")]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("train"); // legKey 優先・walk に override されない
    expect(got.counts).toEqual({ train: 5 });
  });

  it("3. legKey cold + odKey moderate+ → odKey で一般化（walk）", () => {
    const { sel: s, obs: o, fb: f } = build([
      { day: "d0", legKey: LEG, mode: "train", noObs: true }, // legKey 1 train = cold(weak)
      ...odLegs(5, "walk"),
    ]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("walk"); // OD 一般化
    expect(got.total).toBe(5);
  });

  it("4. legKey cold + odKey cold → cold legKey belief（gate が沈黙）", () => {
    const { sel: s, obs: o, fb: f } = build([
      { day: "d0", legKey: LEG, mode: "train", noObs: true },
      ...odLegs(1, "walk"),
    ]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("train"); // cold legKey にフォールバック
    expect(got.total).toBe(1);
  });

  it("5. odKey null（sensitive query）→ OD 一般化せず legKey のみ", () => {
    const { sel: s, obs: o, fb: f } = build([
      { day: "d0", legKey: LEG, mode: "train", noObs: true },
      ...odLegs(5, "walk"),
    ]);
    const got = buildRepertoireBelief(o, s, f, q({ odKey: null }));
    expect(got.topMode).toBe("train"); // OD を見ない
    expect(got.total).toBe(1);
  });

  it("6. redacted observation は OD 集約から除外", () => {
    const { sel: s, obs: o, fb: f } = build([
      { day: "d0", legKey: LEG, mode: "train", noObs: true },
      ...odLegs(5, "walk", { privacyClass: "redacted", originKey: null, destKey: null }),
    ]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("train"); // redacted は OD に効かない → cold legKey
    expect(got.total).toBe(1);
  });

  it("7. unknown mode は OD 集約から除外", () => {
    const { sel: s, obs: o, fb: f } = build([
      { day: "d0", legKey: LEG, mode: "train", noObs: true },
      ...odLegs(5, "unknown"),
    ]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("train"); // unknown は数えない
    expect(got.total).toBe(1);
  });

  it("8. OD 集約も precision 加重（correction=2 が効く）", () => {
    const legKeyCold: Leg = { day: "d0", legKey: LEG, mode: "train", noObs: true };
    // OD: walk×1(correction=2) + walk×1(selected=1) = 3
    const odWithCorrection: Leg[] = [
      { day: "2026-05-01", legKey: "i1__x", mode: "walk", feedback: correction() },
      { day: "2026-05-02", legKey: "i2__x", mode: "walk" },
    ];
    const { sel: s, obs: o, fb: f } = build([legKeyCold, ...odWithCorrection]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("walk");
    expect(got.counts).toEqual({ walk: 3 }); // 2(correction) + 1(selected)
  });

  it("9. 階層: odKey×timeband×weekday を最特定で採用（文脈条件付け）", () => {
    const legKeyCold: Leg = { day: "d0", legKey: LEG, mode: "train", noObs: true };
    const morningWalk = odLegs(3, "walk", { tb: "morning", wd: "weekday" }).map((l, i) => ({ ...l, legKey: `m${i}__x` }));
    const eveningTrain = odLegs(3, "train", { tb: "evening", wd: "weekday" }).map((l, i) => ({ ...l, day: `2026-06-0${i + 1}`, legKey: `e${i}__x` }));
    const { sel: s, obs: o, fb: f } = build([legKeyCold, ...morningWalk, ...eveningTrain]);
    const got = buildRepertoireBelief(o, s, f, q({ timeband: "morning", weekday: "weekday" }));
    expect(got.topMode).toBe("walk"); // morning は walk（evening の train は別 timeband で除外）
    expect(got.total).toBe(3);
  });

  it("10. 階層 fallback: 最特定 cell が薄い → 粗い層(odKey×weekday)へ", () => {
    const legKeyCold: Leg = { day: "d0", legKey: LEG, mode: "train", noObs: true };
    // (morning,weekday) は 1 件(cold)、(afternoon,weekday) は 4 件 → odKey×weekday で 5
    const mw = odLegs(1, "walk", { tb: "morning", wd: "weekday" }).map((l) => ({ ...l, legKey: "mw__x" }));
    const aw = odLegs(4, "walk", { tb: "afternoon", wd: "weekday" }).map((l, i) => ({ ...l, day: `2026-06-1${i}`, legKey: `aw${i}__x` }));
    const { sel: s, obs: o, fb: f } = build([legKeyCold, ...mw, ...aw]);
    const got = buildRepertoireBelief(o, s, f, q({ timeband: "morning", weekday: "weekday" }));
    expect(got.topMode).toBe("walk"); // odKey×weekday(5)で moderate+
    expect(got.total).toBe(5);
  });

  it("11. ★mode 正本: OD は selectedStore mode を使う（observation.mode は無視）", () => {
    const legKeyCold: Leg = { day: "d0", legKey: LEG, mode: "train", noObs: true };
    // observation.mode=train(stale) だが selectedStore=walk → walk を採用
    const staleObs = odLegs(5, "walk", { obsMode: "train" });
    const { sel: s, obs: o, fb: f } = build([legKeyCold, ...staleObs]);
    const got = buildRepertoireBelief(o, s, f, q());
    expect(got.topMode).toBe("walk"); // selectedStore 正本
    expect(got.counts).toEqual({ walk: 5 });
  });

  it("12. observation あり・selectedStore 正本欠落 → 除外（不整合は数えない）", () => {
    const legKeyCold: Leg = { day: "d0", legKey: LEG, mode: "train", noObs: true };
    // observation だけ作って selected を消す
    const orphan = odLegs(5, "walk").map((l) => ({ ...l }));
    const { obs: o, fb: f } = build([legKeyCold, ...orphan]);
    const selOnlyLeg = sel({ d0: { [LEG]: "train" } }); // orphan の selected を含めない
    const got = buildRepertoireBelief(o, selOnlyLeg, f, q());
    expect(got.topMode).toBe("train"); // orphan obs は正本欠落で除外 → cold legKey
    expect(got.total).toBe(1);
  });
});
