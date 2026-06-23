import { describe, it, expect } from "vitest";

import { generateTravelItineraries } from "@/lib/coalter/travel/itinerary";
import { buildCoAlterDayContingency } from "@/app/(culcept)/plan/tabs/coalter/coalterDayContingency";
import { buildCoAlterTravelItineraryVM } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelItineraryVM";
import {
  COALTER_DEMO_TRAVEL_SEEDS,
  COALTER_DEMO_PLACE_LABELS,
} from "@/app/(culcept)/plan/tabs/coalter/coalterTravelSeedFixture";

describe("P2 solver ネイティブ当日分岐（事前分岐・solver 出力由来）", () => {
  it("demo: 疲れ/雨 の分岐が出る（solver の候補/flag から）", () => {
    const out = generateTravelItineraries(COALTER_DEMO_TRAVEL_SEEDS);
    const c = buildCoAlterDayContingency(out);
    expect(c).not.toBeNull();
    if (!c) return;
    const triggers = c.branches.map((b) => b.trigger);
    expect(triggers).toContain("疲れたら");
    expect(triggers).toContain("雨なら");
    for (const b of c.branches) expect(b.advice.length).toBeGreaterThan(0);
  });

  it("候補ゼロ → null（捏造しない）", () => {
    const empty = generateTravelItineraries({ intentOutput: COALTER_DEMO_TRAVEL_SEEDS.intentOutput, destinationSeeds: [] });
    expect(buildCoAlterDayContingency(empty)).toBeNull();
  });

  it("VM: travelItinerary に contingency + readinessNote が載る", () => {
    const out = generateTravelItineraries(COALTER_DEMO_TRAVEL_SEEDS);
    const vm = buildCoAlterTravelItineraryVM(out, COALTER_DEMO_PLACE_LABELS);
    expect(vm).not.toBeNull();
    if (!vm) return;
    expect(vm.contingency?.branches.length).toBeGreaterThan(0);
    expect(typeof vm.readinessNote).toBe("string");
  });
});
