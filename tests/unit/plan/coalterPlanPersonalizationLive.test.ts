import { describe, it, expect } from "vitest";

import { COALTER_DEMO_PERSONALIZATION } from "@/app/(culcept)/plan/tabs/coalter/coalterPersonalizationFixture";
import { buildCoAlterPairTraitReadout } from "@/app/(culcept)/plan/tabs/coalter/coalterPairTraitReadout";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { coalterSessionToTravelEvents } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionToTravelEvents";
import { buildPlanIntelligenceLiveVM } from "@/app/(culcept)/plan/tabs/coalter/planIntelligenceLiveViewModel";
import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import { mapPersonalizationToM2SoftPreference } from "@/lib/shared/travel/personalization-to-m2-soft-preference";
import type { PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";

const PROD = { fixtureAllowed: false } as const;

function softPrefOf(snapshot: PersonalizationSnapshot) {
  return mapPersonalizationToM2SoftPreference(derivePlanParams(snapshot), deriveTravelTraits(snapshot));
}

describe("S2 CoAlter personalization live（demo 軸→derive→soft preference→engine + 2 人 readout）", () => {
  it("TRAVEL: demo self → bounded soft preference（pace=slow + novelty descriptor・raw score 非漏洩）", () => {
    const sp = softPrefOf(COALTER_DEMO_PERSONALIZATION.travel.self);
    expect(sp.pace).toBe("slow"); // density 低 → slow
    expect(sp.descriptors?.some((d) => d.kind === "novelty" && d.value === "novelty")).toBe(true);
    // bounded のみ＝raw axis score / personality dump を持たない
    const rec = sp as Record<string, unknown>;
    expect(rec.axes).toBeUndefined();
    expect(rec.score).toBeUndefined();
  });

  it("honesty: engine に効くのは self のみ（self=新奇 / partner=定番 で soft preference が分かれる）", () => {
    const selfSp = softPrefOf(COALTER_DEMO_PERSONALIZATION.travel.self);
    const partnerSp = softPrefOf(COALTER_DEMO_PERSONALIZATION.travel.partner);
    // route が engine へ渡すのは self（新奇）。partner（定番）は別物＝engine 順位には入らない。
    expect(selfSp.descriptors?.some((d) => d.kind === "novelty" && d.value === "novelty")).toBe(true);
    expect(partnerSp.descriptors?.some((d) => d.kind === "novelty" && d.value === "classic")).toBe(true);
  });

  it("TRAVEL: pair readout が pace 一致と novelty 差を出す（両者 confidence 十分な軸のみ）", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.travel;
    const r = buildCoAlterPairTraitReadout(self, partner, "Mio");
    expect(r.selfReadout.length).toBeGreaterThan(0);
    expect(r.pairReadout.some((l) => l.includes("ゆっくり"))).toBe(true); // pace 一致
    expect(r.pairReadout.some((l) => l.includes("新しさ"))).toBe(true); // novelty 差
    expect(r.pairReadout.some((l) => l.includes("Mio"))).toBe(true); // 相手名が入る
  });

  it("DAILY: pair readout が対人の差を出す", () => {
    const { self, partner } = COALTER_DEMO_PERSONALIZATION.daily;
    const r = buildCoAlterPairTraitReadout(self, partner, "Mio");
    expect(r.pairReadout.some((l) => l.includes("対人") || l.includes("人混み"))).toBe(true);
  });

  it("engine が softPersonalization ありで ready・候補を返す（self 軸を proposal に反映）", () => {
    const events = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(events, PROD, {
      softPersonalization: softPrefOf(COALTER_DEMO_PERSONALIZATION.travel.self),
    });
    expect(result.status).toBe("ready");
    const vm = buildPlanIntelligenceLiveVM(result, {
      personalization: { demo: true, selfReadout: ["ゆっくり過ごす派"], pairReadout: ["お二人ともゆっくり"] },
    });
    expect(vm.status).toBe("ready");
    if (vm.status !== "ready") return;
    expect(vm.candidates.length).toBeGreaterThan(0);
  });

  it("VM: personalization は demo:true 付きで載る / options 不在なら absent（S1 byte 等価）", () => {
    const events = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(events, PROD);

    const without = buildPlanIntelligenceLiveVM(result);
    expect(without.status).toBe("ready");
    if (without.status === "ready") expect(without.personalization).toBeUndefined();

    const withP = buildPlanIntelligenceLiveVM(result, {
      personalization: { demo: true, selfReadout: ["ゆっくり過ごす派"], pairReadout: ["お二人ともゆっくり"] },
    });
    if (withP.status === "ready") {
      expect(withP.personalization?.demo).toBe(true);
      expect(withP.personalization?.selfReadout.length).toBeGreaterThan(0);
    }
  });

  it("VM: 中身が空の readout は載せない（self/pair とも空 → personalization absent）", () => {
    const events = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(events, PROD);
    const vm = buildPlanIntelligenceLiveVM(result, {
      personalization: { demo: true, selfReadout: [], pairReadout: [] },
    });
    if (vm.status === "ready") expect(vm.personalization).toBeUndefined();
  });
});
