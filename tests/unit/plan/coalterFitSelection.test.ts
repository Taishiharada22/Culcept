import { describe, it, expect } from "vitest";

import { selectFittingEntities } from "@/app/(culcept)/plan/tabs/coalter/coalterFitSelection";
import { buildFitSubjectFromPair, buildFitUserStateFromSnapshot } from "@/app/(culcept)/plan/tabs/coalter/coalterFitBridge";
import { COALTER_DEMO_ENTITIES } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelEntityCatalog";
import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import type { FitContext } from "@/lib/shared/travel/fit-types";
import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

const CTX: FitContext = { tripMode: "travel", tripIntent: "recovery" };

function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: "2026-06-15T00:00:00.000Z" };
}
function snap(axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId: "t", asOf: "2026-06-20T00:00:00.000Z", axes, hdm: null, dynamicState: null, decisionMeta: null };
}
const BOLD = snap({
  introvert_vs_extrovert: ax(0.6, 0.7),
  energy_rhythm: ax(0.6, 0.7),
  quality_vs_quantity: ax(0.6, 0.7),
  tradition_vs_novelty: ax(0.5, 0.7),
});

describe("C6-C 性格 fit 選別（既存 evaluateFit・性格→場所選択）", () => {
  it("calm ペア（travel demo）→ 温泉/自然/旅館 を採用・nightlife/thrill を落とす", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const sel = selectFittingEntities(COALTER_DEMO_ENTITIES, buildFitSubjectFromPair(self, partner), CTX);
    const ids = sel.map((s) => s.placeRefId);
    expect(ids).toContain("hakone_onsen_daytrip");
    expect(ids).toContain("hakone_lakeside_walk");
    expect(ids).toContain("hakone_ryokan_calm");
    // 明確に合わないものは落ちる
    expect(ids).not.toContain("hakone_nightlife_bar");
    expect(ids).not.toContain("hakone_thrill_activity");
  });

  it("bold ペア → thrill を採用・自然/温泉は落ちる（calm と選択が反転＝パーソナライズ）", () => {
    const sel = selectFittingEntities(COALTER_DEMO_ENTITIES, buildFitSubjectFromPair(BOLD, BOLD), CTX);
    const ids = sel.map((s) => s.placeRefId);
    expect(ids).toContain("hakone_thrill_activity");
    expect(ids).not.toContain("hakone_lakeside_walk");
    expect(ids).not.toContain("hakone_onsen_daytrip");
  });

  it("fit 降順で並ぶ・raw score 非漏洩（grade と placeRefId のみ）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const sel = selectFittingEntities(COALTER_DEMO_ENTITIES, buildFitSubjectFromPair(self, partner), CTX);
    expect(sel.length).toBeGreaterThan(0);
    expect(["excellent", "good", "stretch"]).toContain(sel[0].grade);
    // 降順
    const order = { excellent: 4, good: 3, stretch: 2, poor: 1, blocked: 0 } as const;
    for (let i = 1; i < sel.length; i++) expect(order[sel[i - 1].grade]).toBeGreaterThanOrEqual(order[sel[i].grade]);
  });

  it("bridge: 観測軸が無い → FitUserState は traits/tolerances 空（捏造しない）", () => {
    const empty = buildFitUserStateFromSnapshot(snap({}));
    expect(Object.keys(empty.traits ?? {}).length).toBe(0);
    expect(Object.keys(empty.tolerances).length).toBe(0);
    expect(empty.intendedRoles).toBeUndefined();
  });
});
