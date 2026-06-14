/**
 * T11-C3-D — construct rollup wiring golden tests
 *
 * 検証対象: fit-core.ts の presence-gated construct blend（fit-constructs-core.ts の rollup helpers 経由）。
 * 設計正本: docs/t11-c3-construct-rollup-wiring-plan.md
 *
 * 最重要: construct 入力非供給時=legacy 挙動不変（既存 34+29 テスト green）。
 *   構築子 rollup が既存 component を修飾し、private 非漏洩・二重計上なし・新 component なし・no authority。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateFit,
  toSharedFitView,
  hasFitActionAuthority,
  type EvaluateFitConstructInput,
} from "@/lib/shared/travel/fit-core";
import { getMissingDataPolicy } from "@/lib/shared/travel/fit-constructs-core";
import { WIRED_CONSTRUCTS } from "@/lib/shared/travel/fit-constructs";
import type { FitSubject, FitUserState, TravelObjectState } from "@/lib/shared/travel/fit-types";

const ob = <T,>(value: T, confidence = 0.8) => ({ value, confidence, provenance: "editorial" as const });
const solo = (user: FitUserState): FitSubject => ({ kind: "solo", user });
const comp = (r: ReturnType<typeof evaluateFit>, key: string) => r.components.find((c) => c.key === key)!;
const obsI = (value: number, confidence = 0.9) => ({ value, confidence });

// ════════════════════════════════════════════════════════════════════════════
describe("1. legacy 挙動不変（construct 入力非供給=従来と同一）", () => {
  const entity: TravelObjectState = { placeRefId: "L", category: "lodging", roleAffinity: { base: ob(0.7) }, traits: { quietLively: { value: 0.5, confidence: 0.8 } } };
  const user = solo({ tolerances: {}, traits: { quietLively: { value: 0.5, confidence: 0.8 } }, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  it("constructInput 無し vs 空 {} で完全一致", () => {
    const a = evaluateFit({ entity, subject: user });
    const b = evaluateFit({ entity, subject: user, constructInput: {} });
    expect(a).toEqual(b);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. quietness rollup → traitFit・recovery vs stimulation で別方向（valence）", () => {
  const entity: TravelObjectState = { placeRefId: "Q", category: "lodging", roleAffinity: { base: ob(0.7) } };
  const ci: EvaluateFitConstructInput = {
    entityIndicators: { quietness: { nightQuietness: obsI(0.8), ambientNoiseFloorDb: obsI(0.8) } },
    userPrefs: { self: { quietness: { value: 0.9, confidence: 0.8 } } },
  };
  const mk = (rs: FitUserState["recoveryStyle"]): FitSubject => solo({ tolerances: {}, recoveryStyle: rs, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  it("静かな宿は rest_to_recover で stimulation_to_recover より traitFit が高い", () => {
    const rest = comp(evaluateFit({ entity, subject: mk("rest_to_recover"), constructInput: ci }), "traitFit").valueFull;
    const stim = comp(evaluateFit({ entity, subject: mk("stimulation_to_recover"), constructInput: ci }), "traitFit").valueFull;
    expect(rest).toBeGreaterThan(stim);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. mobilityBurden（walking/stairs/transfer/baggage）→ burdenFit", () => {
  const entity: TravelObjectState = { placeRefId: "M", category: "place", roleAffinity: { relaxation: ob(0.7) } };
  const user = solo({ tolerances: { mobilityTolerance: 0.3, stairSlopeTolerance: 0.3 } });
  it("高 mobility 負荷指標 → burdenFit 低下（4 burden construct 集約）", () => {
    const ci: EvaluateFitConstructInput = {
      entityIndicators: {
        walkingLoad: { walkingDistanceKm: obsI(0.9) },
        stairsSlopeLoad: { stairCount: obsI(0.9) },
        transferBurden: { transferCountTyped: obsI(0.9) },
        baggageLoad: { baggageVolumeWeight: obsI(0.9) },
      },
    };
    const withB = comp(evaluateFit({ entity, subject: user, constructInput: ci }), "burdenFit");
    expect(withB.available).toBe(true);
    expect(withB.valueFull).toBeLessThan(0.6);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. mealRoleAffinity → roleFit(food)・hard allergy veto を複製しない", () => {
  const food: TravelObjectState = { placeRefId: "F", category: "food", roleAffinity: { destination_meal: ob(0.4) } };
  const user = solo({ tolerances: {}, intendedRoles: [{ category: "food", role: "destination_meal", weight: 1, confidence: 0.8 }] });
  it("construct mealRole が roleFit を押し上げる（legacy 0.4 と blend）", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { mealRoleAffinity: { destinationMealAffinity: obsI(0.95) } } };
    const base = comp(evaluateFit({ entity: food, subject: user }), "roleFit").valueFull;
    const wired = comp(evaluateFit({ entity: food, subject: user, constructInput: ci }), "roleFit").valueFull;
    expect(wired).toBeGreaterThan(base);
  });
  it("allergy hard-block は construct と無関係に効く（mealRole が veto を迂回しない）", () => {
    const allergyUser = solo({ tolerances: {}, hardConstraints: [{ axis: "allergy", descriptor: "allergy:shellfish", severity: "hard", visibility: "shared", provenance: "explicit_user" }] });
    const unsafe: TravelObjectState = { placeRefId: "FU", category: "food", roleAffinity: { destination_meal: ob(0.7) }, hardProfile: { allergens: { handling: "unknown" } } };
    const ci: EvaluateFitConstructInput = { entityIndicators: { mealRoleAffinity: { destinationMealAffinity: obsI(0.99) } } };
    expect(evaluateFit({ entity: unsafe, subject: allergyUser, constructInput: ci }).fitLabel).toBe("blocked");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. noveltySeeking が local/familiar の方向を変える", () => {
  const novelEntity: TravelObjectState = { placeRefId: "N", category: "place", roleAffinity: { relaxation: ob(0.7) }, traits: { noveltyFamiliar: { value: 0.8, confidence: 0.8 } } };
  const mk = (): FitSubject => solo({ tolerances: {} });
  it("新奇希求 user は novel な対象に高 traitFit・routine 志向 user は低", () => {
    const seek = comp(evaluateFit({ entity: novelEntity, subject: mk(), constructInput: { userPrefs: { self: { noveltySeeking: { value: 0.8, confidence: 0.8 } } } } }), "traitFit").valueFull;
    const routine = comp(evaluateFit({ entity: novelEntity, subject: mk(), constructInput: { userPrefs: { self: { noveltySeeking: { value: -0.8, confidence: 0.8 } } } } }), "traitFit").valueFull;
    expect(seek).toBeGreaterThan(routine);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. hygieneCleanliness → traitFit（aesthetic と別寄与）", () => {
  const entity: TravelObjectState = { placeRefId: "H", category: "lodging", roleAffinity: { base: ob(0.7) } };
  const user = solo({ tolerances: {}, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  it("hygiene 指標+選好 → traitFit が available", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { hygieneCleanliness: { roomBeddingHygiene: obsI(0.9), surfaceWornVsDirty: obsI(0.9) } }, userPrefs: { self: { hygieneCleanliness: { value: 0.9, confidence: 0.8 } } } };
    const t = comp(evaluateFit({ entity, subject: user, constructInput: ci }), "traitFit");
    expect(t.available).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. arrivalFreshness → recoveryFit（実 API 無し）", () => {
  const entity: TravelObjectState = { placeRefId: "A", category: "lodging", roleAffinity: { base: ob(0.7) }, recovery: { restValue: ob(0.4) } };
  const user = solo({ tolerances: {}, recoveryStyle: "rest_to_recover" });
  it("高 arrivalFreshness が recoveryFit を上げる", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { arrivalFreshness: { energyCarryToFirstActivity: obsI(0.9) } } };
    const base = comp(evaluateFit({ entity, subject: user }), "recoveryFit").valueFull;
    const wired = comp(evaluateFit({ entity, subject: user, constructInput: ci }), "recoveryFit").valueFull;
    expect(wired).toBeGreaterThan(base);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. private construct 選好は full に効くが shared 射影に漏れない", () => {
  const entity: TravelObjectState = { placeRefId: "P", category: "lodging", roleAffinity: { base: ob(0.7) } };
  const withPrivate: EvaluateFitConstructInput = {
    entityIndicators: { quietness: { nightQuietness: obsI(0.9) } },
    userPrefs: { self: { quietness: { value: 0.9, confidence: 0.8, visibility: "private" } } },
  };
  const user = solo({ tolerances: {}, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  it("shared 射影は private construct 有無で一致（逆算不能）", () => {
    const sharedA = toSharedFitView(evaluateFit({ entity, subject: user, constructInput: withPrivate }));
    const sharedB = toSharedFitView(evaluateFit({ entity, subject: user, constructInput: {} }));
    expect(sharedA).toEqual(sharedB);
  });
  it("full では private quietness が traitFit に効く", () => {
    const full = evaluateFit({ entity, subject: user, constructInput: withPrivate });
    expect(comp(full, "traitFit").valueFull).toBeGreaterThan(comp(full, "traitFit").valueShared);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. 指標 confidence は quality score（値）を変えない（source→confidence のみ）", () => {
  const entity: TravelObjectState = { placeRefId: "C", category: "lodging", roleAffinity: { base: ob(0.7) } };
  const user = solo({ tolerances: {}, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  it("同一指標値・confidence 差 → traitFit の値は不変（confidence は値を動かさない）", () => {
    const hi = evaluateFit({ entity, subject: user, constructInput: { entityIndicators: { quietness: { nightQuietness: obsI(0.8, 0.95) } }, userPrefs: { self: { quietness: { value: 0.8, confidence: 0.9 } } } } });
    const lo = evaluateFit({ entity, subject: user, constructInput: { entityIndicators: { quietness: { nightQuietness: obsI(0.8, 0.3) } }, userPrefs: { self: { quietness: { value: 0.8, confidence: 0.9 } } } } });
    // 指標 confidence(0.95 vs 0.3)が違っても rollup の score=指標値 由来で同一 → traitFit 値不変
    expect(comp(hi, "traitFit").valueFull).toBeCloseTo(comp(lo, "traitFit").valueFull);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. supersede が二重計上を防ぐ（quietness が quietLively を置換）", () => {
  // legacy quietLively は強い mismatch（user 0.9 vs entity -0.9）→ supersede 無しなら traitFit を下げる
  const entity: TravelObjectState = { placeRefId: "S", category: "lodging", roleAffinity: { base: ob(0.7) }, traits: { quietLively: { value: -0.9, confidence: 0.9 } } };
  const user = solo({ tolerances: {}, recoveryStyle: "rest_to_recover", traits: { quietLively: { value: 0.9, confidence: 0.9 } }, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  it("construct quietness 供給時、legacy quietLively mismatch に引きずられず高 traitFit", () => {
    const ci: EvaluateFitConstructInput = { entityIndicators: { quietness: { nightQuietness: obsI(0.9), ambientNoiseFloorDb: obsI(0.9) } }, userPrefs: { self: { quietness: { value: 0.9, confidence: 0.9 } } } };
    const wired = comp(evaluateFit({ entity, subject: user, constructInput: ci }), "traitFit").valueFull;
    const legacyOnly = comp(evaluateFit({ entity, subject: user }), "traitFit").valueFull;
    expect(legacyOnly).toBeLessThan(0.3); // quietLively mismatch で低い
    expect(wired).toBeGreaterThan(0.7); // construct が supersede し高い（二重に下げない）
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("11. 構造不変条件（新 component なし・authority なし・safety 第一 slice 非配線）", () => {
  const entity: TravelObjectState = { placeRefId: "X", category: "lodging", roleAffinity: { base: ob(0.95) } };
  const user = solo({ tolerances: { mobilityTolerance: 0.9 }, intendedRoles: [{ category: "lodging", role: "base", weight: 1, confidence: 0.8 }] });
  const ci: EvaluateFitConstructInput = { entityIndicators: { quietness: { nightQuietness: obsI(0.9) } }, userPrefs: { self: { quietness: { value: 0.9, confidence: 0.9 } } } };
  it("component は 6 標準キーのみ（新並列スコアを作らない）", () => {
    const r = evaluateFit({ entity, subject: user, constructInput: ci });
    expect(r.components.map((c) => c.key).sort()).toEqual(["budgetFit", "burdenFit", "recoveryFit", "relationalFit", "roleFit", "traitFit"]);
  });
  it("construct 配線後も hasFitActionAuthority は false", () => {
    expect(hasFitActionAuthority(evaluateFit({ entity, subject: user, constructInput: ci }))).toBe(false);
  });
  it("第一 slice の wired construct に safety_critical は無い（perceivedSafety 延期）", () => {
    for (const a of WIRED_CONSTRUCTS) expect(getMissingDataPolicy(a)).not.toBe("safety_critical");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("12. import 純度（construct 配線後も fit-core/fit-constructs-core は runtime 非依存）", () => {
  it("fetch/API/DB/Supabase/route/UI を import しない", () => {
    for (const f of ["lib/shared/travel/fit-core.ts", "lib/shared/travel/fit-constructs-core.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']@\/app/);
      expect(src).not.toMatch(/from ["']@\/components/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
    }
  });
});
