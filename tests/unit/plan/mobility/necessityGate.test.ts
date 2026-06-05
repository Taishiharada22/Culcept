import { describe, it, expect } from "vitest";
import { decideSurface } from "@/lib/plan/mobility/necessityGate";
import type { MobilityHypothesis, ContextNote } from "@/lib/plan/mobility/mobilityHypothesis";

const RAIN_NOTE: ContextNote = { kind: "outdoor_burden", reason: "rain", aboutMode: "walk" };

/** test 用 hypothesis ファクトリ（既定 = surface 可能な moderate habitual） */
function hyp(partial: Partial<MobilityHypothesis>): MobilityHypothesis {
  return {
    legKey: "a__b",
    habitualMode: "train",
    habitualStrength: "moderate",
    contextNote: null,
    todayLikelyMode: "train",
    alternatives: [],
    signalStrength: 0.75,
    ...partial,
  };
}

describe("decideSurface (v0-B necessity gate・沈黙デフォルト)", () => {
  it("sensitive は最優先で沈黙（strong habitual でも）", () => {
    const d = decideSurface(hyp({ habitualStrength: "strong" }), { sensitive: true });
    expect(d).toEqual({ surface: false, reason: "sensitive" });
  });

  it("cold-start（habitualMode null）は沈黙", () => {
    const d = decideSurface(hyp({ habitualMode: null, habitualStrength: "none" }), {});
    expect(d).toEqual({ surface: false, reason: "cold_start" });
  });

  it("weak（観測/一貫性 不足）は沈黙", () => {
    const d = decideSurface(hyp({ habitualStrength: "weak" }), {});
    expect(d).toEqual({ surface: false, reason: "low_signal" });
  });

  it("★weak + contextNote でも沈黙（contextNote だけで過剰表示しない）", () => {
    const d = decideSurface(
      hyp({
        habitualMode: "walk",
        todayLikelyMode: "walk",
        habitualStrength: "weak",
        contextNote: RAIN_NOTE,
      }),
      {},
    );
    expect(d).toEqual({ surface: false, reason: "low_signal" });
  });

  it("moderate は surface（reason surface_habitual）", () => {
    const d = decideSurface(hyp({ habitualStrength: "moderate" }), {});
    expect(d).toEqual({ surface: true, reason: "surface_habitual" });
  });

  it("strong + contextNote は surface（reason surface_with_context）", () => {
    const d = decideSurface(
      hyp({
        habitualMode: "walk",
        todayLikelyMode: "walk",
        habitualStrength: "strong",
        contextNote: RAIN_NOTE,
      }),
      {},
    );
    expect(d).toEqual({ surface: true, reason: "surface_with_context" });
  });

  it("strong・context なしは surface（surface_habitual）", () => {
    const d = decideSurface(hyp({ habitualStrength: "strong" }), {});
    expect(d).toEqual({ surface: true, reason: "surface_habitual" });
  });

  it("gateContext 省略時も動く（既定 = 非 sensitive）", () => {
    const d = decideSurface(hyp({ habitualStrength: "moderate" }));
    expect(d.surface).toBe(true);
  });
});
