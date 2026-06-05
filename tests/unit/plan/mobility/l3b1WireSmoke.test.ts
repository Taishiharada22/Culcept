/**
 * L3-b-1 配線 targeted smoke（CEO 必須 11 項目）— 実モジュール経由・mock localStorage round-trip。
 * MapTab が swap した loadL3bPooledBeliefMultiLevel を save→load で検証。loadL3/loadPooled と比較。
 *   核: 同一 OD の別 leg(観測のみ)に OD regime が波及（L3-a は波及しない）。
 *   退行ゼロ / OD 発火 / 波及 / leg 優先(二重緩和なし) / 別 OD 非漏洩 / redacted・stale 除外 /
 *   削除でない / READ のみ / fetch なし。MobilityLegCard/copy/UI 不変は Bash audit。
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { saveSelectedMode } from "@/lib/plan/map/selectedModeStore";
import { buildObservation, normalizeLocationText, saveMobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import { saveHypothesisFeedback, buildFeedbackEntry } from "@/lib/plan/mobility/hypothesisFeedbackStore";
import {
  loadL3bPooledBeliefMultiLevel,
  loadL3PooledBeliefMultiLevel,
  loadPooledBeliefMultiLevel,
  type RepertoireQuery,
} from "@/lib/plan/mobility/mobilityRepertoireBelief";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

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
beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemStorage(), writable: true, configurable: true });
});

const LEG1 = "homeA__workA";
const LEG2 = "homeB__workB"; // LEG1 と同一 OD
const LEG_OTHER = "stnX__shopX"; // 別 OD
const OD = `${normalizeLocationText("自宅")}__${normalizeLocationText("会社")}`;
const SK = "aneurasync.plan.map.selectedMode.v1";
const FK = "aneurasync.plan.map.hypothesisFeedback.v1";
const OK = "aneurasync.plan.map.mobilityObservation.v1";

function seedObs(leg: string, day: string, mode: RouteTransportMode, o: { origin?: string; dest?: string; sensitive?: boolean } = {}): void {
  saveSelectedMode(day, leg, mode);
  saveMobilityObservation(
    day,
    leg,
    buildObservation({ mode, dayISO: day, toStartTime: "09:00", originText: o.origin ?? "自宅", destText: o.dest ?? "会社", originSensitive: o.sensitive ?? false, destSensitive: o.sensitive ?? false, readOnly: false }),
  );
}
/** 非 stale correction（selected = chosenMode）。surfaced≠chosen で explicitCorrection。 */
function seedCorr(leg: string, day: string, to: RouteTransportMode, o: { sensitive?: boolean } = {}): void {
  seedObs(leg, day, to, o);
  saveHypothesisFeedback(day, leg, buildFeedbackEntry({ surfacedMode: to === "train" ? "walk" : "train", chosenMode: to, readOnly: false }));
}
/** stale correction（selected=actual ≠ chosenMode to）。 */
function seedStale(leg: string, day: string, to: RouteTransportMode, actual: RouteTransportMode): void {
  seedObs(leg, day, actual);
  saveHypothesisFeedback(day, leg, buildFeedbackEntry({ surfacedMode: to === "train" ? "walk" : "train", chosenMode: to, readOnly: false }));
}
function q(leg: string, odKey: string | null = OD): RepertoireQuery {
  return { legKey: leg, odKey, timeband: "morning", weekday: "weekday" };
}

describe("L3-b-1 wire smoke (11 items)", () => {
  it("1. regime なし → L3-a / L4-b と完全同一（退行ゼロ）", () => {
    ["2026-06-01", "2026-06-02", "2026-06-03"].forEach((d) => seedObs(LEG1, d, "train"));
    expect(loadL3bPooledBeliefMultiLevel(q(LEG1))).toEqual(loadL3PooledBeliefMultiLevel(q(LEG1)));
    expect(loadL3bPooledBeliefMultiLevel(q(LEG1))).toEqual(loadPooledBeliefMultiLevel(q(LEG1)));
  });

  it("2. 同一 OD の別 leg に correction 2 回で OD regime 発火（LEG1 古い観測が緩む）", () => {
    seedObs(LEG1, "2026-06-01", "train");
    seedObs(LEG1, "2026-06-02", "train"); // LEG1 古い train
    seedCorr(LEG1, "2026-06-05", "walk"); // OD correction 1（LEG1 単独は 1 → leg regime なし）
    seedCorr(LEG2, "2026-06-06", "walk"); // OD correction 2（別 leg・OD regime cp=d5）
    const l3b = loadL3bPooledBeliefMultiLevel(q(LEG1));
    const l3a = loadL3PooledBeliefMultiLevel(q(LEG1));
    expect(l3b).not.toEqual(l3a); // OD regime で LEG1 の古い train が緩む（L3-a は LEG1 に leg regime なしで緩めない）
    expect(l3b.counts.train!).toBeLessThan(l3a.counts.train!);
  });

  it("3. OD regime が同一 OD の別 leg（観測のみ）に波及", () => {
    seedCorr(LEG1, "2026-06-05", "walk");
    seedCorr(LEG1, "2026-06-06", "walk"); // LEG1 で OD regime cp=d5
    ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].forEach((d) => seedObs(LEG2, d, "train")); // LEG2 古い train
    ["2026-06-05", "2026-06-06", "2026-06-07"].forEach((d) => seedObs(LEG2, d, "walk")); // LEG2 新 walk（correction なし）
    const l3b = loadL3bPooledBeliefMultiLevel(q(LEG2));
    const l3a = loadL3PooledBeliefMultiLevel(q(LEG2));
    expect(l3b).not.toEqual(l3a); // L3-a は LEG2 に波及しない / L3-b-1 は波及する（核）
    expect(l3b.counts.train!).toBeLessThan(l3a.counts.train!); // LEG2 の古い train が ×λ_od で低下（波及）
  });

  it("4. legKey regime がある leg は leg 優先・OD と二重緩和しない", () => {
    seedObs(LEG1, "2026-06-01", "train");
    seedObs(LEG1, "2026-06-02", "train");
    seedCorr(LEG1, "2026-06-05", "walk");
    seedCorr(LEG1, "2026-06-06", "walk"); // LEG1 leg regime（+ OD regime）。LEG1 のみ
    // LEG1 は leg 優先（λ_leg のみ）→ L3-a と同一（OD で二重緩和されない）
    expect(loadL3bPooledBeliefMultiLevel(q(LEG1))).toEqual(loadL3PooledBeliefMultiLevel(q(LEG1)));
  });

  it("5. 別 OD には漏れない", () => {
    seedCorr(LEG1, "2026-06-05", "walk");
    seedCorr(LEG2, "2026-06-06", "walk"); // OD(自宅__会社) regime
    ["2026-06-01", "2026-06-02", "2026-06-03"].forEach((d) => seedObs(LEG_OTHER, d, "train", { origin: "駅", dest: "店" })); // 別 OD
    expect(loadL3bPooledBeliefMultiLevel(q(LEG_OTHER, `${normalizeLocationText("駅")}__${normalizeLocationText("店")}`))).toEqual(
      loadPooledBeliefMultiLevel(q(LEG_OTHER, `${normalizeLocationText("駅")}__${normalizeLocationText("店")}`)),
    );
  });

  it("6. redacted / sensitive observation は OD 集約に使われない", () => {
    ["2026-06-01", "2026-06-02", "2026-06-03"].forEach((d) => seedObs(LEG2, d, "train")); // LEG2 normal 古い train
    seedCorr(LEG1, "2026-06-05", "walk", { sensitive: true }); // redacted → OD に乗らない
    seedCorr("homeC__workC", "2026-06-06", "walk", { sensitive: true });
    expect(loadL3bPooledBeliefMultiLevel(q(LEG2))).toEqual(loadPooledBeliefMultiLevel(q(LEG2))); // OD regime 不発火
  });

  it("7. stale feedback は使われない", () => {
    ["2026-06-01", "2026-06-02", "2026-06-03"].forEach((d) => seedObs(LEG2, d, "train"));
    seedStale(LEG1, "2026-06-05", "walk", "train"); // selected train ≠ chosenMode walk → stale
    seedStale("homeC__workC", "2026-06-06", "walk", "train");
    expect(loadL3bPooledBeliefMultiLevel(q(LEG2))).toEqual(loadPooledBeliefMultiLevel(q(LEG2))); // OD regime 不発火
  });

  it("8. 古い観測は削除されず weight だけ下がる", () => {
    seedCorr(LEG1, "2026-06-05", "walk");
    seedCorr(LEG1, "2026-06-06", "walk"); // OD regime cp=d5
    ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].forEach((d) => seedObs(LEG2, d, "train"));
    const l3b = loadL3bPooledBeliefMultiLevel(q(LEG2));
    expect(l3b.counts.train ?? 0).toBeGreaterThan(0); // 削除されていない
    expect(l3b.counts.train!).toBeLessThan(loadPooledBeliefMultiLevel(q(LEG2)).counts.train!); // ×λ_od で低下
  });

  it("9. 3 store は READ のみ", () => {
    seedCorr(LEG1, "2026-06-05", "walk");
    seedCorr(LEG2, "2026-06-06", "walk");
    seedObs(LEG2, "2026-06-01", "train");
    const before = { s: localStorage.getItem(SK), f: localStorage.getItem(FK), o: localStorage.getItem(OK) };
    loadL3bPooledBeliefMultiLevel(q(LEG2));
    expect(localStorage.getItem(SK)).toBe(before.s);
    expect(localStorage.getItem(FK)).toBe(before.f);
    expect(localStorage.getItem(OK)).toBe(before.o);
  });

  it("11. Google API / DB / fetch を呼ばない", () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, writable: true, configurable: true });
    seedCorr(LEG1, "2026-06-05", "walk");
    seedCorr(LEG2, "2026-06-06", "walk");
    loadL3bPooledBeliefMultiLevel(q(LEG2));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
