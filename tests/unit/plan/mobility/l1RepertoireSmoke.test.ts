/**
 * L1 targeted smoke（A/B/C/D）— 実モジュール経由・mock localStorage round-trip。
 * save(selected/observation) → loadRepertoireBelief → resolveMobilityGuidance の全鎖を通し、
 * CEO smoke 4 観点を決定的に検証する（恒久回帰ガード）。
 *   A: empty observation → v0 と同一（余計な OD 一般化が発火しない）
 *   B: legKey cold ∧ 同 odKey の別 leg 履歴 → odKey fallback で surface
 *   C: legKey に強い履歴 → odKey は override しない
 *   D: sensitive/redacted observation は OD 集約に使われない → surface しない
 */
import { beforeEach, describe, it, expect } from "vitest";
import { saveSelectedMode } from "@/lib/plan/map/selectedModeStore";
import {
  buildObservation,
  saveMobilityObservation,
} from "@/lib/plan/mobility/mobilityObservationStore";
import {
  loadRepertoireBelief,
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
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  });
});

const LEG = "home__work";
const OD = "自宅__会社";
const WEEKDAYS = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]; // Mon-Fri

function seedSelected(day: string, legKey: string, mode: RouteTransportMode): void {
  saveSelectedMode(day, legKey, mode);
}
/** selectedMode + observation を両方録る（実 onSelect と同等）。sensitive=true で redacted。 */
function seedFullLeg(
  day: string,
  legKey: string,
  mode: RouteTransportMode,
  opts: { sensitive?: boolean } = {},
): void {
  saveSelectedMode(day, legKey, mode);
  saveMobilityObservation(
    day,
    legKey,
    buildObservation({
      mode,
      dayISO: day,
      toStartTime: "09:00", // morning
      originText: "自宅",
      destText: "会社",
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
    belief: loadRepertoireBelief(query),
    selectedMode: null, // 未選択 → surface 可
    readOnly: false,
    sensitive: false,
    recallMode: null,
  });
}

describe("L1 repertoire smoke (A/B/C/D)", () => {
  it("A: empty observation → v0 と同一・余計な OD 一般化なし", () => {
    // selectedMode のみ（観測なし）: legKey 3 train
    seedSelected("2026-06-01", LEG, "train");
    seedSelected("2026-06-02", LEG, "train");
    seedSelected("2026-06-03", LEG, "train");
    // repertoire belief == v0 belief（退行ゼロ）
    expect(loadRepertoireBelief(q())).toEqual(loadWeightedModeBelief(LEG));
    const g = guidanceFor(q());
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.surfacedMode).toBe("train"); // 既存 v0 legKey belief がそのまま
  });

  it("B: legKey cold ∧ 同 odKey の別 leg 履歴 → odKey fallback で surface", () => {
    // 対象 legKey は履歴ゼロ（cold）。別 leg(inst1..5)に同 odKey の walk 履歴。
    WEEKDAYS.forEach((d, i) => seedFullLeg(d, `inst${i + 1}__x`, "walk"));
    const g = guidanceFor(q());
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.surfacedMode).toBe("walk"); // OD 一般化で walk が surface
  });

  it("C: legKey に強い履歴 → odKey は override しない", () => {
    // legKey は 5 train（強い）。別 leg は 10 walk（odKey では walk 優勢）。
    WEEKDAYS.forEach((d) => seedFullLeg(d, LEG, "train")); // legKey 5 train
    for (let i = 0; i < 10; i += 1) seedFullLeg("2026-06-01", `inst${i}__x`, "walk"); // OD walk 10
    const g = guidanceFor(q());
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.surfacedMode).toBe("train"); // legKey 優先・walk に override されない
  });

  it("D: sensitive/redacted observation は OD 集約に使われない → surface しない", () => {
    // 対象 legKey は cold。別 leg の観測は sensitive(redacted) → OD に効かない。
    WEEKDAYS.forEach((d, i) => seedFullLeg(d, `inst${i + 1}__x`, "walk", { sensitive: true }));
    const g = guidanceFor(q());
    expect(g.hypothesisCopy).toBeNull(); // 沈黙
    expect(g.surfacedMode).toBeNull();
  });
});
