/**
 * L4-b 配線 targeted smoke（CEO 必須 7 項目）— 実モジュール経由・mock localStorage round-trip。
 * MapTab が swap した loadPooledBeliefMultiLevel を save→load→guidance の全鎖で検証。
 *   1 empty obs → v0/L1 同一 / 2 strong legKey 非上書き / 3 cold+OD prior 効く /
 *   4 cold+global-only 過剰 surface しない / 5 context 優先 / 6 redacted/sensitive 不使用 /
 *   7 existing UI/copy/MobilityLegCard 不変（= commit audit・本 unit 対象外）。
 */
import { beforeEach, describe, it, expect } from "vitest";
import { saveSelectedMode } from "@/lib/plan/map/selectedModeStore";
import { buildObservation, saveMobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import {
  loadPooledBeliefMultiLevel,
  type RepertoireQuery,
} from "@/lib/plan/mobility/mobilityRepertoireBelief";
import { loadWeightedModeBelief } from "@/lib/plan/mobility/beliefReadAdapter";
import { resolveMobilityGuidance } from "@/lib/plan/mobility/mobilityGuidance";
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

const LEG = "home__work";
const OD = "自宅__会社";
const WEEKDAYS = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]; // Mon-Fri

function seedSel(day: string, legKey: string, mode: RouteTransportMode): void {
  saveSelectedMode(day, legKey, mode);
}
function seedLeg(
  day: string,
  legKey: string,
  mode: RouteTransportMode,
  opts: { startTime?: string; origin?: string; dest?: string; sensitive?: boolean } = {},
): void {
  saveSelectedMode(day, legKey, mode);
  saveMobilityObservation(
    day,
    legKey,
    buildObservation({
      mode,
      dayISO: day,
      toStartTime: opts.startTime ?? "09:00",
      originText: opts.origin ?? "自宅",
      destText: opts.dest ?? "会社",
      originSensitive: !!opts.sensitive,
      destSensitive: false,
      readOnly: false,
    }),
  );
}
function q(p: Partial<RepertoireQuery> = {}): RepertoireQuery {
  return { legKey: LEG, odKey: OD, timeband: "morning", weekday: "weekday", ...p };
}
function guidanceFor(query: RepertoireQuery) {
  return resolveMobilityGuidance({
    belief: loadPooledBeliefMultiLevel(query),
    selectedMode: null,
    readOnly: false,
    sensitive: false,
    recallMode: null,
  });
}

describe("L4-b wire smoke (7 items)", () => {
  it("1. empty obs → v0/L1 と同一（余計な pooling なし）", () => {
    seedSel("2026-06-01", LEG, "train");
    seedSel("2026-06-02", LEG, "train");
    seedSel("2026-06-03", LEG, "train");
    expect(loadPooledBeliefMultiLevel(q())).toEqual(loadWeightedModeBelief(LEG)); // v0 完全同一
    expect(guidanceFor(q()).surfacedMode).toBe("train");
  });

  it("2. strong legKey は global / OD に上書きされない", () => {
    WEEKDAYS.forEach((d) => seedSel(d, LEG, "walk")); // legKey 5 walk = strong
    WEEKDAYS.forEach((d, i) => seedLeg(d, `od${i}__x`, "train")); // OD train（同 odKey）
    expect(guidanceFor(q()).surfacedMode).toBe("walk"); // 厳密 legKey
  });

  it("3. cold leg + OD prior → OD が効く", () => {
    WEEKDAYS.forEach((d, i) => seedLeg(d, `od${i}__x`, "train")); // 対象 legKey は履歴ゼロ・OD 5 train
    expect(guidanceFor(q()).surfacedMode).toBe("train"); // OD 一般化
  });

  it("4. cold leg + global-only（新 OD）→ 過剰 surface しない（沈黙）", () => {
    // global は train だが query OD には観測なし（別 odKey P→Q）
    WEEKDAYS.forEach((d, i) => seedLeg(d, `g${i}__x`, "train", { origin: "P", dest: "Q" }));
    const g = guidanceFor(q());
    expect(g.hypothesisCopy).toBeNull(); // global 弱(total≈1)→weak→沈黙
    expect(g.surfacedMode).toBeNull();
  });

  it("5. context prior がある場合 context が優先される", () => {
    // morning weekday に walk 3 / evening weekday に train 3（同 OD）
    ["2026-06-01", "2026-06-02", "2026-06-03"].forEach((d, i) => seedLeg(d, `mw${i}__x`, "walk", { startTime: "09:00" }));
    ["2026-06-04", "2026-06-05", "2026-06-08"].forEach((d, i) => seedLeg(d, `et${i}__x`, "train", { startTime: "19:00" }));
    expect(guidanceFor(q({ timeband: "morning", weekday: "weekday" })).surfacedMode).toBe("walk"); // morning ctx 優先
  });

  it("6. redacted / sensitive observation は使われない（沈黙）", () => {
    WEEKDAYS.forEach((d, i) => seedLeg(d, `s${i}__x`, "train", { sensitive: true })); // sensitive→redacted
    const g = guidanceFor(q());
    expect(g.hypothesisCopy).toBeNull(); // redacted は OD/global に効かない → cold → 沈黙
    expect(g.surfacedMode).toBeNull();
  });

  // 7. existing UI / copy / MobilityLegCard 不変 = commit audit（MobilityLegCard 無変更・mobility test PASS・tsc 0）
});
