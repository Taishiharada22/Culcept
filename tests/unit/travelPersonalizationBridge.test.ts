/**
 * UX-6a — Personalization → M2 soft preference bridge + adapter enrichment 配線 tests
 *
 * 検証: ①mapper が raw score を漏らさず bounded(band/enum/descriptor) に変換 ②低 confidence/default/neutral を drop
 *   ③hard key を産出しない ④adapter: softPersonalization 不在 → 従来 byte 等価 ⑤性格 ON → proposal が変わる。
 *   （explicit 優先・hard key drop は merge helper の travelM2SoftEnrichmentMerge.test.ts が担保＝二重化しない）
 */
import { describe, it, expect } from "vitest";
import { mapPersonalizationToM2SoftPreference } from "@/lib/shared/travel/personalization-to-m2-soft-preference";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import type { DerivedValue, PlanParams, TravelTraitKeyV0, TravelTraitsV0 } from "@/lib/shared/personalization/types";
import type { TravelPlanDisplayInput } from "@/lib/shared/travel/travel-plan-display-adapter-types";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const dv = <T,>(value: T, confidence: number, source: "derived" | "default" = "derived"): DerivedValue<T> => ({ value, confidence, source });
const TRAIT_KEYS: TravelTraitKeyV0[] = ["noveltySeeking", "pacePreference", "crowdTolerance", "planningStyle", "comfortVsAdventure", "experienceDepth", "aestheticOrientation", "socialOrientation"];
const neutralTraits = (): TravelTraitsV0 => ({
  version: "v0",
  traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, dv(0, 0, "default")])) as TravelTraitsV0["traits"],
});
const neutralPlan = (): PlanParams => ({
  paceDefault: dv("normal", 0, "default"),
  densityCap: dv(3, 0, "default"),
  morningness: dv(0.5, 0, "default"),
  noveltyBias: dv(0, 0, "default"),
  precommitPreference: dv(0.5, 0, "default"),
  socialLoadTolerance: dv(0.5, 0, "default"),
  budgetPosture: dv("balanced", 0, "default"),
  bufferMargin: dv(0.5, 0, "default"),
  explanationTone: dv("reason_first", 0, "default"),
});
function calm(): { plan: PlanParams; traits: TravelTraitsV0 } {
  const plan = neutralPlan();
  plan.paceDefault = dv("slow", 0.8);
  plan.noveltyBias = dv(-0.6, 0.7);
  const traits = neutralTraits();
  traits.traits.crowdTolerance = dv(-0.7, 0.7);
  return { plan, traits };
}
function active(): { plan: PlanParams; traits: TravelTraitsV0 } {
  const plan = neutralPlan();
  plan.paceDefault = dv("intense", 0.8);
  plan.noveltyBias = dv(0.6, 0.7);
  const traits = neutralTraits();
  traits.traits.crowdTolerance = dv(0.5, 0.6);
  return { plan, traits };
}

describe("1. mapper: bounded 変換・raw score 非漏洩", () => {
  it("calm 性格 → pace enum + descriptor(kind/value) + confidence band のみ（raw score 非搭載）", () => {
    const { plan, traits } = calm();
    const pref = mapPersonalizationToM2SoftPreference(plan, traits);
    expect(pref.pace).toBe("slow");
    expect(["low", "medium", "high"]).toContain(pref.confidence);
    expect(pref.descriptors).toEqual(
      expect.arrayContaining([
        { kind: "novelty", value: "classic" },
        { kind: "quietness", value: "calm" },
      ]),
    );
    // ★ raw axis score（-0.6 / -0.7 / 0.8）が外に出ていない
    const json = JSON.stringify(pref);
    for (const raw of ["-0.6", "-0.7", "0.8", "0.7"]) expect(json).not.toContain(raw);
  });
  it("active 性格 → pace intense + novelty/crowd descriptor", () => {
    const { plan, traits } = active();
    const pref = mapPersonalizationToM2SoftPreference(plan, traits);
    expect(pref.pace).toBe("intense");
    expect(pref.descriptors).toEqual(
      expect.arrayContaining([
        { kind: "novelty", value: "novelty" },
        { kind: "crowd", value: "crowd" },
      ]),
    );
  });
  it("hard key（destination/date/red_line）を産出しない・visibility は private", () => {
    const pref = mapPersonalizationToM2SoftPreference(calm().plan, calm().traits);
    expect(pref.visibility).toBe("private");
    const json = JSON.stringify(pref);
    for (const f of ["destination", "date", "red_line", "budgetBand", "mobility"]) expect(json).not.toContain(f);
  });
});

describe("2. mapper: 不確実/中立を drop（押し付けない）", () => {
  it("全 default（confidence 0）→ {visibility:'private'} のみ（pace/descriptors/confidence なし）", () => {
    const pref = mapPersonalizationToM2SoftPreference(neutralPlan(), neutralTraits());
    expect(pref).toEqual({ visibility: "private" });
  });
  it("derived だが neutral(deadzone 内 |0.1|) → descriptor を emit しない", () => {
    const plan = neutralPlan();
    plan.noveltyBias = dv(0.1, 0.9); // 高 confidence だが neutral
    const traits = neutralTraits();
    traits.traits.crowdTolerance = dv(0.1, 0.9);
    const pref = mapPersonalizationToM2SoftPreference(plan, traits);
    expect(pref.descriptors).toBeUndefined();
  });
  it("confidence < floor(0.3) → emit しない", () => {
    const plan = neutralPlan();
    plan.paceDefault = dv("slow", 0.2); // 低 confidence
    const pref = mapPersonalizationToM2SoftPreference(plan, neutralTraits());
    expect(pref.pace).toBeUndefined();
  });
});

// ── adapter 配線 ──
const PROD = { fixtureAllowed: false } as const;
const READY: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];
const INPUT: TravelPlanDisplayInput = { events: READY, participantIds: ["P1"], viewerId: "P1" };

describe("3. adapter: softPersonalization 不在 → 従来 byte 等価", () => {
  it("options 不在 と {} は同一・softPersonalization なしは baseline と byte 等価", () => {
    const baseline = buildTravelPlanDisplayResult(INPUT, PROD);
    const withEmpty = buildTravelPlanDisplayResult(INPUT, PROD, {});
    const withUndef = buildTravelPlanDisplayResult(INPUT, PROD, { softPersonalization: undefined });
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(baseline));
    expect(JSON.stringify(withUndef)).toBe(JSON.stringify(baseline));
    expect(baseline.status).toBe("ready");
  });
});

describe("4. adapter: 性格 ON → proposal が変わる", () => {
  const baseline = buildTravelPlanDisplayResult(INPUT, PROD);
  const calmPref = mapPersonalizationToM2SoftPreference(calm().plan, calm().traits);
  const activePref = mapPersonalizationToM2SoftPreference(active().plan, active().traits);
  const calmRes = buildTravelPlanDisplayResult(INPUT, PROD, { softPersonalization: calmPref });
  const activeRes = buildTravelPlanDisplayResult(INPUT, PROD, { softPersonalization: activePref });

  it("calm 性格の結果は baseline と異なる（性格が proposal を変えた）", () => {
    expect(calmRes.status).toBe("ready");
    expect(JSON.stringify(calmRes)).not.toBe(JSON.stringify(baseline));
  });
  it("calm と active で結果が異なる（性格差が proposal 差になる）", () => {
    expect(JSON.stringify(calmRes)).not.toBe(JSON.stringify(activeRes));
  });
  it("性格 ON でも display-safe（authoritative:false・executionAuthority:false 維持）", () => {
    if (calmRes.status !== "ready") throw new Error("ready 期待");
    expect(calmRes.display.packet.authoritative).toBe(false);
    expect(calmRes.display.packet.executionAuthority).toBe(false);
    expect(JSON.stringify(calmRes)).not.toContain("TravelPlanEngineInput");
  });
});
