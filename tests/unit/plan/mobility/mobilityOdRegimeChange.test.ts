/**
 * L3-b-1 — OD 単位 explicitCorrection regime-change（CEO 必須 21 項目）。
 * OD detector / combined regimeFactor(leg 優先 + OD fallback) / buildL3b を実モジュールで検証。
 * 1-18=pure（build helper で 3 store 直接構築）/ 19,21=MemStorage save→load round-trip / 20=MapTab audit(Bash)。
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
import {
  saveSelectedMode,
  EMPTY_SELECTED_MODE_STORE,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import {
  buildFeedbackEntry,
  saveHypothesisFeedback,
  EMPTY_FEEDBACK_STORE,
  type HypothesisFeedbackEntry,
  type HypothesisFeedbackStore,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import {
  computeOdRegimeChange,
  computeCombinedRegimeFactorFn,
} from "@/lib/plan/mobility/mobilitySelectiveForgetting";
import {
  buildL3bPooledBeliefMultiLevel,
  loadL3bPooledBeliefMultiLevel,
  buildL3PooledBeliefMultiLevel,
  buildPooledBeliefMultiLevel,
  type RepertoireQuery,
} from "@/lib/plan/mobility/mobilityRepertoireBelief";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

// ── 共通: 同一 OD の 2 leg（legKey 異なるが origin/dest text 同一 → odKey 同一）+ 別 OD ──
const LEG1 = "homeA__workA";
const LEG2 = "homeB__workB"; // LEG1 と同一 OD（origin/dest text 同一）
const LEG_OTHER = "stnX__shopX"; // 別 OD
const OD = `${normalizeLocationText("自宅")}__${normalizeLocationText("会社")}`; // "自宅__会社"
const OD2 = `${normalizeLocationText("駅")}__${normalizeLocationText("店")}`;

interface E {
  day: string;
  leg: string;
  mode: RouteTransportMode;
  origin?: string;
  dest?: string;
  sensitive?: boolean;
  correctionTo?: RouteTransportMode; // explicitCorrection の chosenMode（mode≠correctionTo なら stale）
  confirm?: boolean;
}
/** 3 store を直接構築（pure・localStorage 不使用）。selected=obs mode。 */
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
    (selByDay[e.day] ??= {})[e.leg] = e.mode; // selected = obs mode（correctionTo≠mode なら feedback は stale）
    if (e.correctionTo) {
      const surfaced: RouteTransportMode = e.correctionTo === "train" ? "walk" : "train"; // ≠chosen → explicitCorrection
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
function q(leg: string, odKey: string | null = OD): RepertoireQuery {
  return { legKey: leg, odKey, timeband: "morning", weekday: "weekday" };
}
const corr = (day: string, leg: string, to: RouteTransportMode): E => ({ day, leg, mode: to, correctionTo: to });

describe("L3-b-1 OD regime detector（computeOdRegimeChange）", () => {
  it("1. OD explicitCorrection 1 回では発火しない", () => {
    const s = build([corr("2026-06-03", LEG1, "walk")]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull();
  });

  it("2. 同じ OD・同じ方向の explicitCorrection 2 回で発火", () => {
    const s = build([corr("2026-06-03", LEG1, "walk"), corr("2026-06-04", LEG2, "walk")]); // 別 leg・同一 OD
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toEqual({ changePoint: "2026-06-03", toMode: "walk" });
  });

  it("3. different direction では発火しない", () => {
    const s = build([corr("2026-06-03", LEG1, "walk"), corr("2026-06-04", LEG2, "bicycle")]); // 異方向
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull();
  });

  it("4. confirmation は発火しない", () => {
    const s = build([
      { day: "2026-06-03", leg: LEG1, mode: "train", confirm: true },
      { day: "2026-06-04", leg: LEG2, mode: "train", confirm: true },
    ]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull();
  });

  it("5. selected-only 変化では発火しない（correction なし）", () => {
    const s = build([
      { day: "2026-06-03", leg: LEG1, mode: "walk" }, // selected walk だが correction なし
      { day: "2026-06-04", leg: LEG2, mode: "walk" },
    ]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull();
  });

  it("6. stale feedback は使わない（selected≠chosenMode は除外）", () => {
    // mode(=selected)=train だが correctionTo=walk → stale。2 件とも stale → 有効 correction 0 → 発火せず
    const s = build([
      { day: "2026-06-03", leg: LEG1, mode: "train", correctionTo: "walk" },
      { day: "2026-06-04", leg: LEG2, mode: "train", correctionTo: "walk" },
    ]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull();
  });

  it("7. selected 最終 mode と chosenMode 不一致なら対象外（1 stale 混入で発火せず）", () => {
    const s = build([
      corr("2026-06-03", LEG1, "walk"), // 有効
      { day: "2026-06-04", leg: LEG2, mode: "train", correctionTo: "walk" }, // stale（selected train≠walk）
    ]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull(); // 有効 1 件のみ → < 2
  });

  it("8. redacted / sensitive observation は OD 集約に使わない", () => {
    const s = build([
      { day: "2026-06-03", leg: LEG1, mode: "walk", correctionTo: "walk", sensitive: true }, // redacted→odKey null
      { day: "2026-06-04", leg: LEG2, mode: "walk", correctionTo: "walk", sensitive: true },
    ]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toBeNull(); // redacted は OD に乗らない
  });

  it("9. OD changePoint は streak 開始日", () => {
    const s = build([
      corr("2026-06-03", LEG1, "walk"),
      corr("2026-06-04", LEG2, "walk"),
      corr("2026-06-05", LEG1, "walk"),
    ]);
    expect(computeOdRegimeChange(s.feedback, s.obs, s.selected, OD, 2)).toEqual({ changePoint: "2026-06-03", toMode: "walk" });
  });
});

describe("L3-b-1 combined regimeFactor（leg 優先 + OD fallback・1 factor）", () => {
  // OD regime（LEG1 d3 + LEG2 d4 の walk・各 leg は 1 件なので leg regime なし）→ OD changePoint d3
  const odRegime = () =>
    build([
      { day: "2026-06-01", leg: LEG1, mode: "train" }, // pre-change obs（correction なし）
      corr("2026-06-03", LEG1, "walk"),
      corr("2026-06-04", LEG2, "walk"),
    ]);

  it("10. changePoint 前の OD 観測だけ λ_od=0.7", () => {
    const s = odRegime();
    const f = computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-06-01", LEG1)).toBeCloseTo(0.7); // d1 < changePoint(d3) → λ_od
  });

  it("11. changePoint 以降は factor 1.0", () => {
    const s = odRegime();
    const f = computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-06-03", LEG1)).toBe(1); // changePoint 当日 → 1.0
    expect(f("2026-06-04", LEG2)).toBe(1); // changePoint 以降 → 1.0
  });

  it("12. legKey regime がある場合は legKey を優先（λ_leg=0.5・λ_od でない）", () => {
    // LEG1 が 2 walk correction → leg regime（cp d3）。OD も regime。LEG1 は leg 優先。
    const s = build([
      { day: "2026-06-01", leg: LEG1, mode: "train" },
      corr("2026-06-03", LEG1, "walk"),
      corr("2026-06-04", LEG1, "walk"),
    ]);
    const f = computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-06-01", LEG1)).toBeCloseTo(0.5); // leg 優先 → λ_leg（0.7 でない）
  });

  it("13. legKey regime がない場合だけ OD regime を使う（λ_od=0.7）", () => {
    const s = odRegime(); // LEG1/LEG2 各 1 correction → leg regime なし → OD fallback
    const f = computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-06-01", LEG1)).toBeCloseTo(0.7); // OD fallback
  });

  it("14. OD regime は別 OD に漏れない", () => {
    const s = build([
      corr("2026-06-03", LEG1, "walk"),
      corr("2026-06-04", LEG2, "walk"), // OD(自宅__会社) regime
      { day: "2026-06-01", leg: LEG_OTHER, mode: "train", origin: "駅", dest: "店" }, // OD2・regime なし
    ]);
    const f = computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-06-01", LEG_OTHER)).toBe(1); // OD2 に regime なし → 漏れない
  });
});

describe("L3-b-1 buildL3b 統合（退行ゼロ / 削除でない / 時間 decay なし）", () => {
  it("15a. OD/leg regime なし → L4-b と完全同一（退行ゼロ）", () => {
    const days = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];
    const s = build(days.map((d) => ({ day: d, leg: LEG1, mode: "train" as RouteTransportMode })));
    expect(buildL3bPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).toEqual(
      buildPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1)),
    );
  });

  it("15b. legKey regime のみ（OD に他 leg なし）→ L3-a と完全同一", () => {
    const s = build([
      { day: "2026-06-01", leg: LEG1, mode: "train" },
      { day: "2026-06-02", leg: LEG1, mode: "train" },
      { day: "2026-06-03", leg: LEG1, mode: "train" },
      corr("2026-06-06", LEG1, "walk"),
      corr("2026-06-07", LEG1, "walk"), // LEG1 leg regime（leg 優先）
    ]);
    expect(buildL3bPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).toEqual(
      buildL3PooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1)),
    );
  });

  it("16. 古い観測を削除しない（OD fallback で weight↓・count>0）", () => {
    const s = build([
      { day: "2026-06-01", leg: LEG2, mode: "train" }, // LEG2 古い train（correction なし → OD fallback）
      { day: "2026-06-02", leg: LEG2, mode: "train" },
      { day: "2026-06-03", leg: LEG2, mode: "train" },
      { day: "2026-06-04", leg: LEG2, mode: "train" },
      corr("2026-06-05", LEG1, "walk"),
      corr("2026-06-06", LEG1, "walk"), // OD regime cp=d5（LEG2 の d1-d4 は pre-change）
    ]);
    const l3b = buildL3bPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG2));
    const pooled = buildPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG2));
    expect(l3b.counts.train ?? 0).toBeGreaterThan(0); // 削除されていない
    expect(l3b.counts.train!).toBeLessThan(pooled.counts.train!); // ×λ_od で低下
  });

  it("17. 素朴 time decay なし（古くても regime なしなら緩めない）", () => {
    const s = build([
      { day: "2026-06-01", leg: LEG1, mode: "train" },
      { day: "2026-06-02", leg: LEG1, mode: "train" },
    ]);
    const f = computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected);
    expect(f("2026-06-01", LEG1)).toBe(1); // 最古でも regime なし → 1（time decay でない）
    expect(buildL3bPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).toEqual(
      buildPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1)),
    );
  });

  it("18. Date.now / new Date を使わない（決定的）", () => {
    const s = build([corr("2026-06-03", LEG1, "walk"), corr("2026-06-04", LEG2, "walk")]);
    const origNow = Date.now;
    Date.now = () => {
      throw new Error("Date.now called");
    };
    try {
      expect(() => computeCombinedRegimeFactorFn(s.feedback, s.obs, s.selected)).not.toThrow();
      expect(() => buildL3bPooledBeliefMultiLevel(s.obs, s.selected, s.feedback, q(LEG1))).not.toThrow();
    } finally {
      Date.now = origNow;
    }
  });
});

// ── 19,21: localStorage round-trip（READ のみ / fetch なし） ──
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
function seedLive(): void {
  // OD regime: LEG1/LEG2 walk correction（同一 OD）+ 古い train
  for (const [day, leg, mode] of [
    ["2026-06-01", LEG2, "train"],
    ["2026-06-02", LEG2, "train"],
  ] as const) {
    saveSelectedMode(day, leg, mode);
    saveMobilityObservation(day, leg, buildObservation({ mode, dayISO: day, toStartTime: "09:00", originText: "自宅", destText: "会社", originSensitive: false, destSensitive: false, readOnly: false }));
  }
  for (const [day, leg] of [
    ["2026-06-05", LEG1],
    ["2026-06-06", LEG2],
  ] as const) {
    saveSelectedMode(day, leg, "walk");
    saveMobilityObservation(day, leg, buildObservation({ mode: "walk", dayISO: day, toStartTime: "09:00", originText: "自宅", destText: "会社", originSensitive: false, destSensitive: false, readOnly: false }));
    saveHypothesisFeedback(day, leg, buildFeedbackEntry({ surfacedMode: "train", chosenMode: "walk", readOnly: false }));
  }
}

describe("L3-b-1 配線パス（loadL3b round-trip）", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: new MemStorage(), writable: true, configurable: true });
  });

  it("19. selectedModeStore / hypothesisFeedbackStore / mobilityObservationStore は READ のみ", () => {
    seedLive();
    const before = { s: localStorage.getItem(SK), f: localStorage.getItem(FK), o: localStorage.getItem(OK) };
    loadL3bPooledBeliefMultiLevel(q(LEG2));
    expect(localStorage.getItem(SK)).toBe(before.s);
    expect(localStorage.getItem(FK)).toBe(before.f);
    expect(localStorage.getItem(OK)).toBe(before.o);
  });

  it("21. Google API / DB / fetch を呼ばない", () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, writable: true, configurable: true });
    seedLive();
    loadL3bPooledBeliefMultiLevel(q(LEG2));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
