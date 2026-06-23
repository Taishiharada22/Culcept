import { describe, it, expect } from "vitest";

import { resolveCoAlterPersonalizationPair } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationResolver";
import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: "2026-06-15T00:00:00.000Z" };
}
function snap(userId: string, axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId, asOf: "2026-06-20T00:00:00.000Z", axes, hdm: null, dynamicState: null, decisionMeta: null };
}

describe("P4 personalization resolver（実読み swap 点・既定 demo）", () => {
  it("realSelf なし → demo ペア（挙動不変）", () => {
    const r = resolveCoAlterPersonalizationPair("travel");
    expect(r.self).toBe(COALTER_DEMO_PERSONALIZATION.travel.self);
    expect(r.partner).toBe(COALTER_DEMO_PERSONALIZATION.travel.partner);
  });

  it("realSelf=null → demo ペア（staging fallback）", () => {
    const r = resolveCoAlterPersonalizationPair("daily", { realSelf: null });
    expect(r.self).toBe(COALTER_DEMO_PERSONALIZATION.daily.self);
  });

  it("realSelf 供給 → self は実データ・partner は demo 固定（M2-B/RLS）", () => {
    const real = snap("real-viewer", { tradition_vs_novelty: ax(0.7, 0.8) });
    const r = resolveCoAlterPersonalizationPair("travel", { realSelf: real });
    expect(r.self).toBe(real); // self は実データに swap
    expect(r.self.userId).toBe("real-viewer");
    expect(r.partner).toBe(COALTER_DEMO_PERSONALIZATION.travel.partner); // partner は demo 固定
  });
});
