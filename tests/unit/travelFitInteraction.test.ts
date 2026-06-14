/**
 * T11-C4-D — interaction execution / veto golden tests
 *
 * 検証対象: fit-core interaction pass（fit-constructs-core executeInteraction/runInteractions 経由）。
 * 設計正本: docs/t11-c4-interaction-execution-plan.md（+ CEO 修正: 安全 unknown を fully-safe にしない）
 *
 * 主眼: perceivedSafety を soft でなく veto_escalation で / 昼夜分離 / 安全 unknown は cap(excellent 不可) /
 *   欠落のみで hardBlock しない / private 安全は full のみ / superadditive は EXCESS のみ / 新 component なし。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFit, toSharedFitView, hasFitActionAuthority, type EvaluateFitConstructInput } from "@/lib/shared/travel/fit-core";
import type { FitContext, FitSubject, FitUserState, TravelObjectState } from "@/lib/shared/travel/fit-types";

const ob = <T,>(value: T, confidence = 0.8) => ({ value, confidence, provenance: "editorial" as const });
const solo = (user: FitUserState): FitSubject => ({ kind: "solo", user });
const comp = (r: ReturnType<typeof evaluateFit>, key: string) => r.components.find((c) => c.key === key)!;
const night: FitContext = { tripMode: "travel", tripIntent: "exploration", timeOfDayBand: "night" };
const day: FitContext = { tripMode: "travel", tripIntent: "exploration", timeOfDayBand: "midday" };
const lodging = (): TravelObjectState => ({ placeRefId: "L", category: "place", roleAffinity: { relaxation: ob(0.7) } });
const soloUser = (): FitSubject => solo({ tolerances: {} });

// ════════════════════════════════════════════════════════════════════════════
describe("1. presence-gated（interaction が発火しない文脈では無効果）", () => {
  it("day 文脈 + safety/baggage/rain 入力無し → labelCap null・safety_escalation 無し", () => {
    // night_safety は night/evening でのみ発火（day は不発火）。baggage/rain も入力無で不発火。
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: day, constructInput: { entityIndicators: { quietness: { nightQuietness: { value: 0.8, confidence: 0.9 } } } } });
    expect(r.labelCap).toBeNull();
    expect(r.hardBlocks.some((b) => b.reason === "safety_escalation")).toBe(false);
  });
  it("constructInput 未供給なら interaction pass 自体が走らない（C3 同一）", () => {
    const a = evaluateFit({ entity: lodging(), subject: soloUser(), context: night });
    expect(a.labelCap).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. IX_night_safety veto_escalation（観測低安全→hardBlock）", () => {
  it("night × solo × 低 nighttimeSafety(観測) → blocked(safety_escalation)", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { perceivedSafety: { nighttimeSafety: { value: 0.1, confidence: 0.9 } } } };
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: night, constructInput: ci });
    expect(r.fitLabel).toBe("blocked");
    expect(r.hardBlocks.some((b) => b.reason === "safety_escalation")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. 昼夜分離（daytimeSafety は nighttimeSafety を代替しない）", () => {
  it("day では低 nighttimeSafety でも発火しない（blocked にならない）", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { perceivedSafety: { nighttimeSafety: { value: 0.1, confidence: 0.9 } } } };
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: day, constructInput: ci });
    expect(r.fitLabel).not.toBe("blocked");
  });
  it("night × daytimeSafety のみ(低)・nighttimeSafety 欠落 → daytime で blocked にしない（平均しない）", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { perceivedSafety: { daytimeSafety: { value: 0.1, confidence: 0.9 } } } };
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: night, constructInput: ci });
    expect(r.fitLabel).not.toBe("blocked"); // daytime は使わない
    expect(r.labelCap).toBe("good"); // ただし nighttime 欠落 → cap
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. 安全 unknown（★corrected ladder）", () => {
  it("nighttimeSafety 欠落 × night × solo → 欠落のみで hardBlock しない", () => {
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: night, constructInput: {} });
    expect(r.fitLabel).not.toBe("blocked");
    expect(r.missingDataQuestions.some((q) => q.reason === "safety_unknown")).toBe(true);
  });
  it("安全 unknown は fully-safe(excellent)を許さない（cap=good）", () => {
    const excellentEntity: TravelObjectState = { placeRefId: "E", category: "lodging", roleAffinity: { base: ob(0.95) }, traits: { quietLively: { value: 0.5, confidence: 0.9 } }, burden: { travelBurden: ob(0.0) }, relational: { solo: ob(0.9) }, priceLevel: ob(0.0) };
    const user = solo({ tolerances: { mobilityTolerance: 0.9 }, traits: { quietLively: { value: 0.5, confidence: 0.9 } }, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }], budgetSensitivity: 0.5 });
    const noCtx = evaluateFit({ entity: excellentEntity, subject: user });
    const nightUnknown = evaluateFit({ entity: excellentEntity, subject: user, context: night, constructInput: {} });
    expect(noCtx.fitLabel).toBe("excellent"); // 安全文脈なしなら excellent
    expect(nightUnknown.fitLabel).not.toBe("excellent"); // night×solo×安全unknown → excellent 不可
    expect(nightUnknown.labelCap).toBe("good");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. private 安全（viewer-specific safety concern）は full のみ・shared に漏れない", () => {
  const entity = lodging();
  const user = soloUser();
  const withPrivate: EvaluateFitConstructInput = { entityIndicators: {}, userPrefs: { self: { perceivedSafety: { value: 0.9, confidence: 0.8, visibility: "private" } } } };
  it("private 安全懸念 → full は blocked・shared は blocked でない", () => {
    const r = evaluateFit({ entity, subject: user, context: night, constructInput: withPrivate });
    expect(r.fitLabel).toBe("blocked"); // private hardBlock
    expect(toSharedFitView(r).fitLabel).not.toBe("blocked"); // shared は private hardBlock を drop
  });
  it("shared 射影は private 安全の有無で一致（confidence/available/signalBasis/reason 非漏洩）", () => {
    const sharedWith = toSharedFitView(evaluateFit({ entity, subject: user, context: night, constructInput: withPrivate }));
    const sharedWithout = toSharedFitView(evaluateFit({ entity, subject: user, context: night, constructInput: {} }));
    expect(sharedWith).toEqual(sharedWithout);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. IX_rain_outdoor_fallback gating", () => {
  const rainCtx = (sev: number): FitContext => ({ tripMode: "travel", tripIntent: "exploration", weatherSeverity: sev });
  const outdoor = { weatherTiming: { outdoorExposureRatio: { value: 0.9, confidence: 0.9 } } };
  it("雨×屋外×fallback 無 → 強 penalty/天候 block", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { ...outdoor, fallbackRouteAvailability: { weatherFallbackQuality: { value: 0.1, confidence: 0.9 } } } };
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: rainCtx(0.9), constructInput: ci });
    expect(r.fitLabel).toBe("blocked"); // severe weather × no fallback → season_or_weather_unavailable
  });
  it("雨×屋外×fallback 有 → mild のみ（block しない）", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { ...outdoor, fallbackRouteAvailability: { weatherFallbackQuality: { value: 0.9, confidence: 0.9 } } } };
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: rainCtx(0.9), constructInput: ci });
    expect(r.fitLabel).not.toBe("blocked");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. IX_baggage_stairs_crowd superadditive（積の EXCESS・線形と二重計上しない）", () => {
  const crowdCtx: FitContext = { tripMode: "travel", tripIntent: "exploration", expectedCrowdLevel: { value: 0.9, confidence: 0.9 } };
  it("荷物×階段×混雑 3 入力高 → burdenFit が 1 入力時より低い（superadditive 発火）", () => {
    const all3: EvaluateFitConstructInput = { entityIndicators: { baggageLoad: { baggageVolumeWeight: { value: 0.9, confidence: 0.9 } }, stairsSlopeLoad: { stairCount: { value: 0.9, confidence: 0.9 } } } };
    const burdenAll = comp(evaluateFit({ entity: lodging(), subject: soloUser(), context: crowdCtx, constructInput: all3 }), "burdenFit").valueFull;
    // crowd ctx 無し（superadditive 非発火・C3 線形のみ）
    const noCrowdCtx: FitContext = { tripMode: "travel", tripIntent: "exploration" };
    const burdenLinear = comp(evaluateFit({ entity: lodging(), subject: soloUser(), context: noCrowdCtx, constructInput: all3 }), "burdenFit").valueFull;
    expect(burdenAll).toBeLessThan(burdenLinear); // 積の excess が追加で効く
  });
  it("1 入力でも欠ければ superadditive 非発火（hallucinate しない）", () => {
    const onlyBag: EvaluateFitConstructInput = { entityIndicators: { baggageLoad: { baggageVolumeWeight: { value: 0.9, confidence: 0.9 } } } };
    const withCrowd = comp(evaluateFit({ entity: lodging(), subject: soloUser(), context: crowdCtx, constructInput: onlyBag }), "burdenFit").valueFull;
    const noCrowd = comp(evaluateFit({ entity: lodging(), subject: soloUser(), context: { tripMode: "travel", tripIntent: "exploration" }, constructInput: onlyBag }), "burdenFit").valueFull;
    expect(withCrowd).toBeCloseTo(noCrowd); // stairs 欠落 → superadditive 非発火・burdenFit 不変
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. confidence 連鎖（低 confidence の安全は hardBlock に昇格しない）", () => {
  it("低 nighttimeSafety だが confidence < MIN → hardBlock せず caution(cap)", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { perceivedSafety: { nighttimeSafety: { value: 0.1, confidence: 0.3 } } } };
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: night, constructInput: ci });
    expect(r.fitLabel).not.toBe("blocked"); // 低 confidence → veto しない
    expect(r.labelCap).toBe("good"); // caution → cap
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. 構造不変条件", () => {
  const ci: EvaluateFitConstructInput = { entityIndicators: { perceivedSafety: { nighttimeSafety: { value: 0.1, confidence: 0.9 } } } };
  it("interaction 後も component は 6 標準キーのみ（新並列スコア無）", () => {
    const r = evaluateFit({ entity: lodging(), subject: soloUser(), context: night, constructInput: ci });
    expect(r.components.map((c) => c.key).sort()).toEqual(["budgetFit", "burdenFit", "recoveryFit", "relationalFit", "roleFit", "traitFit"]);
  });
  it("hasFitActionAuthority は literal false（blocked でも）", () => {
    expect(hasFitActionAuthority(evaluateFit({ entity: lodging(), subject: soloUser(), context: night, constructInput: ci }))).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. import 純度（interaction 実行後も runtime 非依存）", () => {
  it("fit-core / fit-constructs-core は fetch/API/DB/route/UI を import しない", () => {
    for (const f of ["lib/shared/travel/fit-core.ts", "lib/shared/travel/fit-constructs-core.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']@\/app/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
    }
  });
});
