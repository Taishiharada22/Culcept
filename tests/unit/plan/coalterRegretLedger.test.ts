import { describe, it, expect } from "vitest";

import {
  COALTER_DEMO_REGRET_LEDGER,
  deriveNextTripConstraints,
  regretReflectionLabels,
  regretToIntentOverride,
} from "@/app/(culcept)/plan/tabs/coalter/coalterRegretLedger";
import { mergeIntentOverridesConservative, buildCoAlterSolverIntentOverride } from "@/app/(culcept)/plan/tabs/coalter/coalterSolverPersonalization";
import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";

describe("P3 M6 後悔台帳（後悔→軸差分→次回制約→反映・read-only）", () => {
  it("demo 台帳 → 次回制約（移動控えめ・詰め込みすぎない）", () => {
    const cons = deriveNextTripConstraints(COALTER_DEMO_REGRET_LEDGER);
    const axes = cons.map((c) => c.axis);
    expect(axes).toContain("mobility");
    expect(axes).toContain("pace");
    expect(cons.every((c) => c.direction === "reduce")).toBe(true);
    const labels = regretReflectionLabels(cons);
    expect(labels.some((l) => l.includes("移動を控えめ"))).toBe(true);
    expect(labels.some((l) => l.includes("詰め込み"))).toBe(true);
  });

  it("次回制約 → intent override（reduce → 低 fatigue + 低詰め込み上限）", () => {
    const ov = regretToIntentOverride(deriveNextTripConstraints(COALTER_DEMO_REGRET_LEDGER));
    expect(ov.fatigueSignals?.combined).toBe(2);
    expect(ov.cognitiveLoadCeilingPerDay).toBe(3);
  });

  it("conservative merge: personalization と後悔 reduce を重ねると、より控えめ側に寄る", () => {
    const pers = buildCoAlterSolverIntentOverride(
      COALTER_DEMO_PERSONALIZATION.travel.self,
      COALTER_DEMO_PERSONALIZATION.travel.partner,
    );
    const regret = regretToIntentOverride(deriveNextTripConstraints(COALTER_DEMO_REGRET_LEDGER));
    const merged = mergeIntentOverridesConservative(pers, regret);
    // 両者 2 / 3 → min も 2 / 3（控えめ維持）。
    expect(merged.fatigueSignals?.combined).toBe(2);
    expect(merged.cognitiveLoadCeilingPerDay).toBe(3);
  });

  it("conservative merge: 活発(personalization) でも後悔 reduce があれば控えめ側へ", () => {
    const bold = { fatigueSignals: { transitFatigue: 4, onSiteFatigue: 4, combined: 4 } as const, cognitiveLoadCeilingPerDay: 6 };
    const regret = regretToIntentOverride(deriveNextTripConstraints(COALTER_DEMO_REGRET_LEDGER));
    const merged = mergeIntentOverridesConservative(bold, regret);
    expect(merged.fatigueSignals?.combined).toBe(2); // min(4,2)
    expect(merged.cognitiveLoadCeilingPerDay).toBe(3); // min(6,3)
  });

  it("honesty: 空台帳 → 次回制約なし（捏造しない）", () => {
    expect(deriveNextTripConstraints([])).toEqual([]);
    expect(regretToIntentOverride([])).toEqual({});
  });
});
