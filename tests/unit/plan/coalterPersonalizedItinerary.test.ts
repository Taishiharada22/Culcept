import { describe, it, expect } from "vitest";

import { generateTravelItineraries } from "@/lib/coalter/travel/itinerary";
import { buildFitSubjectFromPair } from "@/app/(culcept)/plan/tabs/coalter/coalterFitBridge";
import { selectFittingEntities } from "@/app/(culcept)/plan/tabs/coalter/coalterFitSelection";
import { COALTER_DEMO_ENTITIES } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelEntityCatalog";
import { buildPersonalizedTravelSeeds } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizedSeeds";
import {
  COALTER_DEMO_TRAVEL_SEEDS,
  COALTER_DEMO_PLACE_LABELS,
} from "@/app/(culcept)/plan/tabs/coalter/coalterTravelSeedFixture";
import { buildCoAlterTravelItineraryVM } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelItineraryVM";
import type { FitContext } from "@/lib/shared/travel/fit-types";
import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
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

/** route と同じ合成: fit 選別 → seeds 絞り → solver → VM。 */
function planFor(self: PersonalizationSnapshot, partner: PersonalizationSnapshot) {
  const fitting = selectFittingEntities(COALTER_DEMO_ENTITIES, buildFitSubjectFromPair(self, partner), CTX);
  const ids = new Set(fitting.map((f) => f.placeRefId));
  const seeds = buildPersonalizedTravelSeeds(COALTER_DEMO_TRAVEL_SEEDS, ids);
  return { seeds, vm: buildCoAlterTravelItineraryVM(generateTravelItineraries(seeds), COALTER_DEMO_PLACE_LABELS) };
}

describe("C6-D 性格選別 → 行程の場所が変わる（pipeline 合成・route と同経路）", () => {
  it("calm ペア: seeds から nightlife/thrill が落ち、温泉/自然/旅館 が残る", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const { seeds } = planFor(self, partner);
    const expIds = (seeds.experienceSeeds ?? []).map((s) => s.placeIdCode);
    expect(expIds).toContain("hakone_onsen_daytrip");
    expect(expIds).toContain("hakone_lakeside_walk");
    expect(expIds).not.toContain("hakone_nightlife_bar");
    expect(expIds).not.toContain("hakone_thrill_activity");
    // 宿は維持（overnight feasibility）
    expect((seeds.lodgingSeeds ?? []).length).toBeGreaterThan(0);
  });

  it("calm ペア: 行程ラベルに『にぎやか/アクティブ体験』が出ない（性格選別が live に効く）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const { vm } = planFor(self, partner);
    expect(vm).not.toBeNull();
    const labels = (vm?.candidates ?? []).flatMap((c) => c.days.flatMap((d) => d.nodes.map((n) => n.placeLabel)));
    expect(labels.some((l) => /にぎやか|アクティブ体験/.test(l))).toBe(false);
  });

  it("bold ペア: seeds に thrill が残る（calm と選択が反転＝完全パーソナライズ）", () => {
    const { seeds } = planFor(BOLD, BOLD);
    const expIds = (seeds.experienceSeeds ?? []).map((s) => s.placeIdCode);
    expect(expIds).toContain("hakone_thrill_activity");
    expect(expIds).not.toContain("hakone_lakeside_walk");
  });

  it("move は両端 survivor のみ（孤立 edge を作らない）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const { seeds } = planFor(self, partner);
    const places = new Set<string>(["origin"]);
    for (const d of seeds.destinationSeeds ?? []) places.add(d.placeIdCode);
    for (const e of seeds.experienceSeeds ?? []) places.add(e.placeIdCode);
    for (const l of seeds.lodgingSeeds ?? []) places.add(l.placeIdCode);
    for (const m of seeds.moveSeeds ?? []) {
      expect(places.has(m.fromPlaceIdCode)).toBe(true);
      expect(places.has(m.toPlaceIdCode)).toBe(true);
    }
  });
});
