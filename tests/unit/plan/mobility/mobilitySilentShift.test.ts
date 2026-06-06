/**
 * L3-b-2 — selected-only 持続シフト検出（CEO 必須 20 項目）。最弱信号ゆえ最も厳しい発火条件。
 * silent detector / full regimeFactor(leg>OD>silent) / buildL3b2 を実モジュールで検証。
 * 1-18=pure（build helper で 3 store 直接）/ 16,20=MemStorage round-trip / 19=MapTab audit(Bash)。
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  buildObservation,
  normalizeLocationText,
  saveMobilityObservation,
  EMPTY_OBSERVATION_STORE,
  type MobilityObservation,
  type MobilityObservationStore,
} from "@/lib/plan/mobility/mobilityObservationStore";
import { saveSelectedMode, EMPTY_SELECTED_MODE_STORE, type SelectedModeStore } from "@/lib/plan/map/selectedModeStore";
import {
  buildFeedbackEntry,
  saveHypothesisFeedback,
  EMPTY_FEEDBACK_STORE,
  type HypothesisFeedbackEntry,
  type HypothesisFeedbackStore,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import {
  computeSilentShiftRegimeChange,
  computeFullRegimeFactorFn,
} from "@/lib/plan/mobility/mobilitySelectiveForgetting";
import {
  buildL3b2PooledBeliefMultiLevel,
  loadL3b2PooledBeliefMultiLevel,
  buildL3bPooledBeliefMultiLevel,
  buildPooledBeliefMultiLevel,
  type RepertoireQuery,
} from "@/lib/plan/mobility/mobilityRepertoireBelief";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

const LEG1 = "homeA__workA";
const LEG2 = "homeB__workB"; // LEG1 と同一 OD
const OD = `${normalizeLocationText("自宅")}__${normalizeLocationText("会社")}`;
const DAYS = Array.from({ length: 20 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);

interface E {
  day: string;
  leg: string;
  mode: RouteTransportMode;
  origin?: string;
  dest?: string;
  sensitive?: boolean;
  correctionTo?: RouteTransportMode;
  confirm?: boolean;
}
function build(entries: E[]): { obs: MobilityObservationStore; selected: SelectedModeStore; feedback: HypothesisFeedbackStore } {
  const obsByDay: Record<string, Record<string, MobilityObservation>> = {};
  const selByDay: Record<string, Record<string, RouteTransportMode>> = {};
  const fbByDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const e of entries) {
    (obsByDay[e.day] ??= {})[e.leg] = buildObservation({
      mode: e.mode,
      dayISO: e.day,
      toStartTime: "09:00",
      originText: e.origin ?? "自宅",
      destText: e.dest ?? "会社",
      originSensitive: e.sensitive ?? false,
      destSensitive: e.sensitive ?? false,
      readOnly: false,
    })!;
    (selByDay[e.day] ??= {})[e.leg] = e.mode;
    if (e.correctionTo) {
      const surfaced: RouteTransportMode = e.correctionTo === "train" ? "walk" : "train";
      fbByDay[e.day] ??= {};
      fbByDay[e.day]![e.leg] = buildFeedbackEntry({ surfacedMode: surfaced, chosenMode: e.correctionTo, readOnly: false })!;
    } else if (e.confirm) {
      fbByDay[e.day] ??= {};
      fbByDay[e.day]![e.leg] = buildFeedbackEntry({ surfacedMode: e.mode, chosenMode: e.mode, readOnly: false })!;
    }
  }
  return {
    obs: { ...EMPTY_OBSERVATION_STORE, byDay: obsByDay },
    selected: { ...EMPTY_SELECTED_MODE_STORE, byDay: selByDay },
    feedback: { ...EMPTY_FEEDBACK_STORE, byDay: fbByDay },
  };
}
function seq(leg: string, fromIdx: number, mode: RouteTransportMode, count: number): E[] {
  return Array.from({ length: count }, (_, i) => ({ day: DAYS[fromIdx + i]!, leg, mode }));
}
function q(leg: string, odKey: string | null = OD): RepertoireQuery {
  return { legKey: leg, odKey, timeband: "morning", weekday: "weekday" };
}

describe("L3-b-2 silent shift detector（computeSilentShiftRegimeChange）", () => {
  it("1. selected 1〜3 回では発火しない", () => {
    for (const k of [1, 2, 3]) {
      const s = build([...seq(LEG1, 0, "train", 4), ...seq(LEG1, 4, "walk", k)]);
      expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
    }
  });

  it("2. selected 4 回連続で同じ別 mode なら発火", () => {
    const s = build([...seq(LEG1, 0, "train", 4), ...seq(LEG1, 4, "walk", 4)]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toEqual({ changePoint: DAYS[4], toMode: "walk" });
  });

  it("3. historical baseline が弱い（total<min）場合は発火しない", () => {
    const s = build([...seq(LEG1, 0, "train", 3), ...seq(LEG1, 3, "walk", 6)]); // baseline 3 train < 4
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
  });

  it("4. historical baseline が split の場合は発火しない", () => {
    // baseline = train/walk 2:2（topShare 0.5 < 0.6）+ recent 4 bicycle
    const s = build([
      { day: DAYS[0], leg: LEG1, mode: "train" },
      { day: DAYS[1], leg: LEG1, mode: "walk" },
      { day: DAYS[2], leg: LEG1, mode: "train" },
      { day: DAYS[3], leg: LEG1, mode: "walk" },
      ...seq(LEG1, 4, "bicycle", 4),
    ]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
  });

  it("5. recent selected がバラバラなら発火しない", () => {
    const s = build([
      ...seq(LEG1, 0, "train", 4),
      { day: DAYS[4], leg: LEG1, mode: "walk" },
      { day: DAYS[5], leg: LEG1, mode: "train" },
      { day: DAYS[6], leg: LEG1, mode: "walk" },
      { day: DAYS[7], leg: LEG1, mode: "bicycle" }, // recent streak=1 < 4
    ]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
  });

  it("6. explicitCorrection は selected-only detector では使わない", () => {
    // selected は 8 train（shift なし）。walk への correction を足しても detector は selected を見る → null
    const s = build([
      ...seq(LEG1, 0, "train", 4),
      ...[4, 5, 6, 7].map((i) => ({ day: DAYS[i]!, leg: LEG1, mode: "train" as RouteTransportMode, correctionTo: "walk" as RouteTransportMode })),
    ]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
  });

  it("7. confirmation は selected-only detector では使わない", () => {
    const s = build([...seq(LEG1, 0, "train", 4), ...[4, 5, 6, 7].map((i) => ({ day: DAYS[i]!, leg: LEG1, mode: "train" as RouteTransportMode, confirm: true }))]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
  });

  it("8. time gap だけでは発火しない（全 train・shift なし）", () => {
    const s = build([
      { day: "2026-01-01", leg: LEG1, mode: "train" },
      { day: "2026-02-01", leg: LEG1, mode: "train" },
      { day: "2026-03-01", leg: LEG1, mode: "train" },
      { day: "2026-04-01", leg: LEG1, mode: "train" },
      { day: "2026-05-01", leg: LEG1, mode: "train" },
      { day: "2026-06-01", leg: LEG1, mode: "train" },
    ]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)).toBeNull();
  });

  it("9. changePoint は recent streak の開始日", () => {
    const s = build([...seq(LEG1, 0, "train", 5), ...seq(LEG1, 5, "walk", 4)]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)!.changePoint).toBe(DAYS[5]);
  });
});

describe("L3-b-2 full regimeFactor（leg>OD>silent）+ buildL3b2", () => {
  const shift = () => build([...seq(LEG1, 0, "train", 4), ...seq(LEG1, 4, "walk", 4)]); // silent shift cp=d5

  it("10. pre-change の観測だけ λ_silent=0.8", () => {
    const f = computeFullRegimeFactorFn(shift().feedback, shift().obs, shift().selected);
    expect(f(DAYS[0], LEG1)).toBeCloseTo(0.8);
  });

  it("11. post-change は factor 1.0", () => {
    const f = computeFullRegimeFactorFn(shift().feedback, shift().obs, shift().selected);
    expect(f(DAYS[4], LEG1)).toBe(1); // changePoint 当日
    expect(f(DAYS[5], LEG1)).toBe(1);
  });

  it("12. 観測は削除されず weight だけ下がる", () => {
    const s = shift();
    const l3b2 = buildL3b2PooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1));
    expect(l3b2.counts.train ?? 0).toBeGreaterThan(0);
    expect(l3b2.counts.train!).toBeLessThan(buildPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1)).counts.train!);
  });

  it("13a. no shift（regime なし）→ L4-b と完全同一", () => {
    const s = build(seq(LEG1, 0, "train", 5));
    expect(buildL3b2PooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).toEqual(
      buildPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1)),
    );
  });

  it("13b. leg regime あり・silent なし → L3-b-1 と完全同一", () => {
    const s = build([
      ...seq(LEG1, 0, "train", 3),
      { day: DAYS[5], leg: LEG1, mode: "walk", correctionTo: "walk" },
      { day: DAYS[6], leg: LEG1, mode: "walk", correctionTo: "walk" }, // leg regime（silent は 2<4 で不発火）
    ]);
    expect(buildL3b2PooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).toEqual(
      buildL3bPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1)),
    );
  });

  it("14. silent shift は legKey-local（同一 OD の別 leg に波及しない・OD 集約に使わない）", () => {
    const s = build([
      ...seq(LEG1, 0, "train", 4),
      ...seq(LEG1, 4, "walk", 4), // LEG1 silent shift
      ...seq(LEG2, 0, "train", 4), // LEG2（同一 OD）shift なし
    ]);
    const f = computeFullRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f(DAYS[0], LEG2)).toBe(1); // LEG1 の silent は LEG2 へ波及しない（OD 集約しない）
  });

  it("15. silent detector は selected を使い feedback の影響を受けない（stale 含む）", () => {
    const s = build([
      ...seq(LEG1, 0, "train", 4),
      ...seq(LEG1, 4, "walk", 3),
      { day: DAYS[7], leg: LEG1, mode: "walk", correctionTo: "bicycle" }, // selected walk・feedback bicycle(stale)
    ]);
    expect(computeSilentShiftRegimeChange(s.selected, LEG1)!.toMode).toBe("walk"); // selected(walk)・feedback(bicycle)無視
  });

  it("17. Date.now / new Date を使わない（決定的）", () => {
    const s = shift();
    const orig = Date.now;
    Date.now = () => {
      throw new Error("Date.now called");
    };
    try {
      expect(() => computeFullRegimeFactorFn(s.feedback, s.obs, s.selected)).not.toThrow();
      expect(() => buildL3b2PooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).not.toThrow();
    } finally {
      Date.now = orig;
    }
  });

  it("18. 素朴 time decay なし（古くても shift なしなら緩めない）", () => {
    const s = build([
      { day: "2026-01-01", leg: LEG1, mode: "train" },
      { day: "2026-03-01", leg: LEG1, mode: "train" },
      { day: "2026-06-01", leg: LEG1, mode: "train" },
    ]);
    const f = computeFullRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-01-01", LEG1)).toBe(1);
  });
});

// ── 16,20: localStorage round-trip ──
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  key(i: number): string | null {
    return Array.from(this.m.keys())[i] ?? null;
  }
}
const SK = "aneurasync.plan.map.selectedMode.v1";
const FK = "aneurasync.plan.map.hypothesisFeedback.v1";
const OK = "aneurasync.plan.map.mobilityObservation.v1";
function seedShiftLive(): void {
  const days = [...DAYS.slice(0, 4).map((d) => [d, "train"] as const), ...DAYS.slice(4, 8).map((d) => [d, "walk"] as const)];
  for (const [day, mode] of days) {
    saveSelectedMode(day, LEG1, mode);
    saveMobilityObservation(day, LEG1, buildObservation({ mode, dayISO: day, toStartTime: "09:00", originText: "自宅", destText: "会社", originSensitive: false, destSensitive: false, readOnly: false }));
  }
}

describe("L3-b-2 配線パス（loadL3b2 round-trip）", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: new MemStorage(), writable: true, configurable: true });
  });

  it("16. 3 store は READ のみ", () => {
    seedShiftLive();
    const before = { s: localStorage.getItem(SK), f: localStorage.getItem(FK), o: localStorage.getItem(OK) };
    loadL3b2PooledBeliefMultiLevel(q(LEG1));
    expect(localStorage.getItem(SK)).toBe(before.s);
    expect(localStorage.getItem(FK)).toBe(before.f);
    expect(localStorage.getItem(OK)).toBe(before.o);
  });

  it("20. Google API / DB / fetch を呼ばない", () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, writable: true, configurable: true });
    seedShiftLive();
    loadL3b2PooledBeliefMultiLevel(q(LEG1));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
