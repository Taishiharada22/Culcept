/**
 * L3-a 配線 targeted smoke（CEO 必須 12 項目）— 実モジュール経由・mock localStorage round-trip。
 * MapTab が swap した loadL3PooledBeliefMultiLevel を save→load で検証。loadPooledBeliefMultiLevel(L4-b) と比較。
 *   1 regime なし→L4-b 同一 / 2 correction 1 回不発火 / 3 同方向 2 回で発火 /
 *   6 古い観測削除されず weight↓ / 7 selected 変化のみ不発火 / 8 confirmation 不発火 /
 *   10 store READ のみ / 12 fetch 不呼出。4/5/9=detector unit 済・11=MobilityLegCard audit。
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { saveSelectedMode } from "@/lib/plan/map/selectedModeStore";
import { buildObservation, saveMobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import { saveHypothesisFeedback, buildFeedbackEntry } from "@/lib/plan/mobility/hypothesisFeedbackStore";
import {
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

const LEG = "home__work";
const SK = "aneurasync.plan.map.selectedMode.v1";
const FK = "aneurasync.plan.map.hypothesisFeedback.v1";
const OK = "aneurasync.plan.map.mobilityObservation.v1";

function seed(day: string, mode: RouteTransportMode, opts: { correction?: RouteTransportMode; confirmation?: boolean } = {}): void {
  saveSelectedMode(day, LEG, mode);
  saveMobilityObservation(
    day,
    LEG,
    buildObservation({ mode, dayISO: day, toStartTime: "09:00", originText: "自宅", destText: "会社", originSensitive: false, destSensitive: false, readOnly: false }),
  );
  if (opts.correction) {
    saveHypothesisFeedback(day, LEG, buildFeedbackEntry({ surfacedMode: "train", chosenMode: opts.correction, readOnly: false }));
  } else if (opts.confirmation) {
    saveHypothesisFeedback(day, LEG, buildFeedbackEntry({ surfacedMode: mode, chosenMode: mode, readOnly: false }));
  }
}
function q(): RepertoireQuery {
  return { legKey: LEG, odKey: null, timeband: "morning", weekday: "weekday" };
}
const D = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"];

describe("L3-a wire smoke (12 items)", () => {
  it("1. regime-change なし → L4-b と完全同一", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train")); // 5 train・correction なし
    expect(loadL3PooledBeliefMultiLevel(q())).toEqual(loadPooledBeliefMultiLevel(q()));
  });

  it("2. explicitCorrection 1 回では発火しない（L4-b 同一）", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train"));
    seed(D[5]!, "walk", { correction: "walk" }); // 1 correction のみ
    expect(loadL3PooledBeliefMultiLevel(q())).toEqual(loadPooledBeliefMultiLevel(q()));
  });

  it("3. 同方向 explicitCorrection 2 回で regime-change 発火（topMode 逆転）", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train")); // 旧 5 train
    seed(D[5]!, "walk", { correction: "walk" });
    seed(D[6]!, "walk", { correction: "walk" }); // 2 walk correction
    const l3 = loadL3PooledBeliefMultiLevel(q());
    const l4 = loadPooledBeliefMultiLevel(q());
    expect(l4.topMode).toBe("train"); // L3 なし: 旧 train 優勢
    expect(l3.topMode).toBe("walk"); // L3 あり: 旧 train 緩和 → walk
    expect(l3).not.toEqual(l4);
  });

  it("6. 古い観測は削除されず weight だけ下がる", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train"));
    seed(D[5]!, "walk", { correction: "walk" });
    seed(D[6]!, "walk", { correction: "walk" });
    const l3 = loadL3PooledBeliefMultiLevel(q());
    expect(l3.counts.train).toBeGreaterThan(0); // 削除されていない
    const l4 = loadPooledBeliefMultiLevel(q());
    expect(l3.counts.train!).toBeLessThan(l4.counts.train!); // weight は低下（×λ）
  });

  it("7. selected だけの変化では発火しない（correction なし → L4-b 同一）", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train"));
    seed(D[5]!, "walk"); // selected walk だが correction なし
    seed(D[6]!, "walk");
    expect(loadL3PooledBeliefMultiLevel(q())).toEqual(loadPooledBeliefMultiLevel(q()));
  });

  it("8. confirmation では発火しない（L4-b 同一）", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train"));
    seed(D[5]!, "train", { confirmation: true });
    seed(D[6]!, "train", { confirmation: true });
    expect(loadL3PooledBeliefMultiLevel(q())).toEqual(loadPooledBeliefMultiLevel(q()));
  });

  it("10. selectedModeStore / hypothesisFeedbackStore / mobilityObservationStore は READ のみ", () => {
    D.slice(0, 5).forEach((d) => seed(d, "train"));
    seed(D[5]!, "walk", { correction: "walk" });
    seed(D[6]!, "walk", { correction: "walk" });
    const before = { s: localStorage.getItem(SK), f: localStorage.getItem(FK), o: localStorage.getItem(OK) };
    loadL3PooledBeliefMultiLevel(q());
    expect(localStorage.getItem(SK)).toBe(before.s);
    expect(localStorage.getItem(FK)).toBe(before.f);
    expect(localStorage.getItem(OK)).toBe(before.o);
  });

  it("12. Google API / DB / fetch を呼ばない", () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, writable: true, configurable: true });
    D.slice(0, 5).forEach((d) => seed(d, "train"));
    seed(D[5]!, "walk", { correction: "walk" });
    loadL3PooledBeliefMultiLevel(q());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
