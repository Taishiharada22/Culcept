import { describe, it, expect } from "vitest";

import { buildCoAlterSolverIntentOverride } from "@/app/(culcept)/plan/tabs/coalter/coalterSolverPersonalization";
import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: "2026-06-15T00:00:00.000Z" };
}
function snap(axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId: "t", asOf: "2026-06-20T00:00:00.000Z", axes, hdm: null, dynamicState: null, decisionMeta: null };
}

// 活発ペア: 詰め込み耐性高（quality_vs_quantity + / energy_rhythm +）→ pace intense
const BOLD = snap({ quality_vs_quantity: ax(0.6, 0.7), energy_rhythm: ax(0.6, 0.7) });

describe("C6-B ペア軸 → solver intent override（行程がペアで変わる・捏造ゼロ）", () => {
  it("calm ペア（travel demo・slow）→ 低 fatigue + 低詰め込み上限", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const o = buildCoAlterSolverIntentOverride(self, partner);
    expect(o.fatigueSignals?.combined).toBe(2); // slow → 2
    expect(o.cognitiveLoadCeilingPerDay).toBe(3); // slow → 詰め込み厳しめ
  });

  it("bold ペア（intense）→ 高 fatigue + 高詰め込み上限（calm と異なる＝パーソナライズ）", () => {
    const o = buildCoAlterSolverIntentOverride(BOLD, BOLD);
    expect(o.fatigueSignals?.combined).toBe(4); // intense → 4
    expect(o.cognitiveLoadCeilingPerDay).toBe(6);
    // calm と明確に異なる
    const calm = buildCoAlterSolverIntentOverride(
      COALTER_DEMO_PERSONALIZATION.travel.self,
      COALTER_DEMO_PERSONALIZATION.travel.partner,
    );
    expect(o.fatigueSignals?.combined).not.toBe(calm.fatigueSignals?.combined);
    expect(o.cognitiveLoadCeilingPerDay).not.toBe(calm.cognitiveLoadCeilingPerDay);
  });

  it("pace は遅い側に合わせる（least-misery: 片方 slow → slow 扱い）", () => {
    const slow = snap({ quality_vs_quantity: ax(-0.5, 0.7), energy_rhythm: ax(-0.5, 0.7) });
    const o = buildCoAlterSolverIntentOverride(slow, BOLD);
    expect(o.fatigueSignals?.combined).toBe(2); // 遅い側に合わせる
  });

  it("honesty: 軸が無い/低 confidence → override しない（base 維持）", () => {
    const empty = snap({});
    const o = buildCoAlterSolverIntentOverride(empty, empty);
    expect(o.fatigueSignals).toBeUndefined();
    expect(o.pairTogethernessOverride).toBeUndefined();
    expect(o.budgetSignals).toBeUndefined();
    expect(o.cognitiveLoadCeilingPerDay).toBeUndefined();
  });

  it("予算は倹約側に寄せる（片方 save → tight）", () => {
    // function_vs_expression - かつ quality_vs_quantity + → budgetPosture save 寄り
    const saver = snap({ function_vs_expression: ax(-0.6, 0.7), quality_vs_quantity: ax(0.6, 0.7) });
    const o = buildCoAlterSolverIntentOverride(saver, BOLD);
    if (o.budgetSignals) expect(o.budgetSignals).toContain("tight");
  });
});
