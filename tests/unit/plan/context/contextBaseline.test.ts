import { describe, it, expect } from "vitest";
import { buildDensityBaseline, DEFAULT_DENSITY_BASELINE_CONFIG } from "@/lib/plan/context/contextBaseline";
import type { DensityLevel } from "@/lib/plan/context/contextModifier";

const P: DensityLevel = "packed";
const B: DensityLevel = "balanced";
const S: DensityLevel = "sparse";

describe("buildDensityBaseline — 本人の普段（薄いデータで断定しない）", () => {
  it("空 → typical null・sufficient false", () => {
    expect(buildDensityBaseline([])).toEqual({ typical: null, n: 0, sufficient: false });
  });
  it("★n<minDays(5) → 明確な最頻でも sufficient false（薄いデータで personalize しない）", () => {
    const r = buildDensityBaseline([P, P, P]);
    expect(r.typical).toBe("packed");
    expect(r.n).toBe(3);
    expect(r.sufficient).toBe(false);
  });
  it("n≥minDays かつ明確な最頻 → typical=最頻・sufficient true", () => {
    const r = buildDensityBaseline([P, P, P, B, S]);
    expect(r.typical).toBe("packed");
    expect(r.sufficient).toBe(true);
  });
  it("★同率トップ（tie）→ typical null・sufficient false（断定しない）", () => {
    const r = buildDensityBaseline([P, P, S, S, B]); // packed2 sparse2 → tie
    expect(r.typical).toBeNull();
    expect(r.sufficient).toBe(false);
  });
  it("config 既定 minDays=5", () => {
    expect(DEFAULT_DENSITY_BASELINE_CONFIG.minDays).toBe(5);
  });
});
