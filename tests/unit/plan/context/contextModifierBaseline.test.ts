import { describe, it, expect } from "vitest";
import { buildContextModifier, contextReasonLine, type ContextSnapshot, type ContextSource } from "@/lib/plan/context/contextModifier";
import type { DensityBaseline } from "@/lib/plan/context/contextBaseline";

const OBS: ContextSource = "observed";
function snap(density: "sparse" | "balanced" | "packed"): ContextSnapshot {
  return { density: { value: density, source: OBS } };
}
function baseline(typical: "sparse" | "balanced" | "packed" | null, sufficient: boolean, n = 8): DensityBaseline {
  return { typical, n, sufficient };
}

describe("buildContextModifier — A2-4 baseline 相対化", () => {
  it("★baseline 不在 → 一般則（後方互換・packed=tightens notable general）", () => {
    const f = buildContextModifier(snap("packed")).factors.find((x) => x.signal === "density")!;
    expect(f).toMatchObject({ direction: "tightens", strength: "notable", grounding: "general" });
  });
  it("★baseline insufficient → 一般則 fallback", () => {
    const f = buildContextModifier(snap("packed"), undefined, { density: baseline("sparse", false, 3) }).factors.find((x) => x.signal === "density")!;
    expect(f.grounding).toBe("general");
  });
  it("★today==typical → density factor を出さない（あなたの普段通り）", () => {
    const m = buildContextModifier(snap("packed"), undefined, { density: baseline("packed", true) });
    expect(m.factors.find((x) => x.signal === "density")).toBeUndefined();
    expect(m.overallTilt).toBe("unknown"); // 他に factor なし
  });
  it("★today=packed・typical=sparse（delta+2）→ tightens notable personal", () => {
    const f = buildContextModifier(snap("packed"), undefined, { density: baseline("sparse", true) }).factors.find((x) => x.signal === "density")!;
    expect(f).toMatchObject({ direction: "tightens", strength: "notable", grounding: "personal" });
    expect(f.basis).toContain("あなたにしては");
  });
  it("today=packed・typical=balanced（delta+1）→ tightens slight personal", () => {
    const f = buildContextModifier(snap("packed"), undefined, { density: baseline("balanced", true) }).factors.find((x) => x.signal === "density")!;
    expect(f).toMatchObject({ direction: "tightens", strength: "slight", grounding: "personal" });
  });
  it("★today=sparse・typical=packed（delta-2）→ eases notable personal", () => {
    const f = buildContextModifier(snap("sparse"), undefined, { density: baseline("packed", true) }).factors.find((x) => x.signal === "density")!;
    expect(f).toMatchObject({ direction: "eases", strength: "notable", grounding: "personal" });
  });
  it("today=balanced・typical=sparse（delta+1）→ tightens slight personal", () => {
    const f = buildContextModifier(snap("balanced"), undefined, { density: baseline("sparse", true) }).factors.find((x) => x.signal === "density")!;
    expect(f).toMatchObject({ direction: "tightens", strength: "slight", grounding: "personal" });
  });
});

describe("contextReasonLine — A2-4 personal の文言", () => {
  it("★personal tightening → 「いつもより多めの予定」を含む・数字なし", () => {
    const line = contextReasonLine(buildContextModifier(snap("packed"), undefined, { density: baseline("sparse", true) }));
    expect(line).toContain("いつもより多めの予定");
    expect(line).not.toMatch(/[0-9]/);
  });
  it("today==typical（普段通り）→ reason null（沈黙）", () => {
    expect(contextReasonLine(buildContextModifier(snap("packed"), undefined, { density: baseline("packed", true) }))).toBeNull();
  });
});
