import { describe, it, expect } from "vitest";

import { generateTravelItineraries } from "@/lib/coalter/travel/itinerary";
import {
  COALTER_DEMO_TRAVEL_SEEDS,
  COALTER_DEMO_PLACE_LABELS,
} from "@/app/(culcept)/plan/tabs/coalter/coalterTravelSeedFixture";
import { buildCoAlterTravelItineraryVM } from "@/app/(culcept)/plan/tabs/coalter/coalterTravelItineraryVM";

describe("C6-A 既存 solver 配線（demo seeds → generateTravelItineraries → 具体行程 VM）", () => {
  it("demo seeds が solver で具体候補を生む（rankedCandidates 非空・blocked でない）", () => {
    const out = generateTravelItineraries(COALTER_DEMO_TRAVEL_SEEDS);
    expect(out.rankedCandidates.length).toBeGreaterThan(0);
  });

  it("VM: 候補は時刻スロット + 解決済み場所名 + anchor/wander + 体力負荷を持つ", () => {
    const out = generateTravelItineraries(COALTER_DEMO_TRAVEL_SEEDS);
    const vm = buildCoAlterTravelItineraryVM(out, COALTER_DEMO_PLACE_LABELS);
    expect(vm).not.toBeNull();
    if (!vm) return;
    expect(vm.candidates.length).toBeGreaterThan(0);
    const c0 = vm.candidates[0];
    expect(c0.days.length).toBeGreaterThan(0);
    const allNodes = c0.days.flatMap((d) => d.nodes);
    expect(allNodes.length).toBeGreaterThan(0);
    expect(allNodes.every((n) => n.timeLabel.length > 0 && n.placeLabel.length > 0)).toBe(true);
    // placeId(opaque) でなく demo 表示名に解決されている
    expect(allNodes.some((n) => /強羅|温泉|美術館|芦ノ湖|湖畔|出発地/.test(n.placeLabel))).toBe(true);
    // 体力負荷 1..5
    expect(allNodes.every((n) => n.fatigue >= 1 && n.fatigue <= 5)).toBe(true);
    expect(c0.paretoLabel.length).toBeGreaterThan(0);
    // 日ラベルが付く（1 泊 2 日 → 宿泊で分割）
    expect(c0.days.every((d) => /日目/.test(d.dayLabel))).toBe(true);
  });

  it("M5 leak 防止: VM 候補は synthesis のみ（perUserA / perUserB を持たない）", () => {
    const out = generateTravelItineraries(COALTER_DEMO_TRAVEL_SEEDS);
    const vm = buildCoAlterTravelItineraryVM(out, COALTER_DEMO_PLACE_LABELS);
    expect(vm).not.toBeNull();
    if (!vm) return;
    for (const c of vm.candidates) {
      const rec = c as unknown as Record<string, unknown>;
      expect(rec.perUserA).toBeUndefined();
      expect(rec.perUserB).toBeUndefined();
      expect(typeof c.synthesis).toBe("string");
    }
  });

  it("M3: 確定(anchor)場所に予約直前リンク（Maps/safe・href あり）が付く", () => {
    const out = generateTravelItineraries(COALTER_DEMO_TRAVEL_SEEDS);
    const vm = buildCoAlterTravelItineraryVM(out, COALTER_DEMO_PLACE_LABELS);
    expect(vm).not.toBeNull();
    if (!vm) return;
    const allNodes = vm.candidates.flatMap((c) => c.days.flatMap((d) => d.nodes));
    const withLinks = allNodes.filter((n) => n.links.length > 0);
    expect(withLinks.length).toBeGreaterThan(0); // 確定場所にリンクが出る
    for (const n of withLinks) {
      for (const lk of n.links) {
        expect(lk.label.length).toBeGreaterThan(0);
        expect(lk.href).toMatch(/^https?:\/\//); // 外部 handoff URL
      }
    }
  });

  it("honesty: rankedCandidates 空 → VM null（カード非表示の根拠）", () => {
    const empty = generateTravelItineraries({ intentOutput: COALTER_DEMO_TRAVEL_SEEDS.intentOutput, destinationSeeds: [] });
    expect(buildCoAlterTravelItineraryVM(empty, COALTER_DEMO_PLACE_LABELS)).toBeNull();
  });
});
