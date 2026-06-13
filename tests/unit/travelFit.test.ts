/**
 * T11-D — Travel Fit Model golden tests
 *
 * 検証対象: lib/shared/travel/fit-core.ts（fit-types.ts 契約）
 * 設計正本: docs/t11-travel-fit-model-plan.md §7 + docs/t11-travel-object-ontology.md §12（17 件）
 *
 * 重点（CEO/GPT「薄い型で終わらせない」）: 温泉 facet 射影 / hotel・food role / Hiroshima route-chain /
 *   egress 非対称 / hotel-drop ordering / support / FitContext 状態依存 / group least-misery /
 *   privacy 非漏洩 / authority / provenance→confidence のみ / 安全側 missingData / 決定論 / import 純度。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateFit,
  evaluateFitBatch,
  doorToDoorBurden,
  baggageDroppedByOrdering,
  toSharedFitView,
  hasFitActionAuthority,
  aggregateFieldConfidence,
} from "@/lib/shared/travel/fit-core";
import {
  TRAVEL_CATEGORIES,
  type FitContext,
  type FitProvenance,
  type FitSubject,
  type FitUserState,
  type IntendedRole,
  type Observed,
  type OnsenState,
  type ProvenanceSource,
  type RouteChainState,
  type TraitValue,
  type TravelObjectState,
} from "@/lib/shared/travel/fit-types";

// ── builders ──────────────────────────────────────────────────────────────
const ob = <T,>(value: T, confidence = 0.8, provenance: FitProvenance = "editorial"): Observed<T> => ({ value, confidence, provenance });
const unobs = { value: null as null, confidence: 0 as const, reason: "unobserved" as const };
const tv = (value: number, confidence = 0.8, visibility?: "shared" | "private"): TraitValue => ({ value, confidence, ...(visibility ? { visibility } : {}) });
const ir = (category: IntendedRole["category"], role: IntendedRole["role"], weight = 1, confidence = 0.8, visibility?: "shared" | "private"): IntendedRole => ({ category, role, weight, confidence, ...(visibility ? { visibility } : {}) });
const solo = (user: FitUserState): FitSubject => ({ kind: "solo", user });
const src = (sources: ProvenanceSource[]) => ({ sources });

// ════════════════════════════════════════════════════════════════════════════
describe("1. 温泉 facet 射影（同一 OnsenState を category 横断で attach・単一所属を強制しない）", () => {
  const onsen: OnsenState = { springType: ob("sulfur"), kakenagashi: ob(true) };
  const user = solo({ tolerances: {}, traits: { onsenWaterQuality: tv(0.9) }, recoveryStyle: "rest_to_recover" });
  const lodging: TravelObjectState = { placeRefId: "L", category: "lodging", rich: { subtype: "onsen_inn", onsenFacet: onsen }, roleAffinity: { recovery: ob(0.8) }, recovery: { restValue: ob(0.8) } };
  const place: TravelObjectState = { placeRefId: "P", category: "place", rich: { subtype: "onsen_day_use", onsenFacet: onsen }, roleAffinity: { relaxation: ob(0.7) } };
  const area: TravelObjectState = { placeRefId: "A", category: "area", rich: { subtype: "onsen_town", onsenFacet: onsen }, roleAffinity: { area_anchor: ob(0.7) } };

  it("lodging / place / area の 3 host すべてで非 blocked・泉質が rationale に出る", () => {
    for (const e of [lodging, place, area]) {
      const r = evaluateFit({ entity: e, subject: user });
      expect(r.fitLabel).not.toBe("blocked");
      expect(r.rationale.shared).toContain("sulfur");
    }
  });
  it("温泉選好高 → traitFit が中立(0.6)を上回る（facet が fit に反映）", () => {
    const r = evaluateFit({ entity: lodging, subject: user });
    const trait = r.components.find((c) => c.key === "traitFit")!;
    expect(trait.valueFull).toBeGreaterThan(0.6);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. hotel role（同一 lodging を base / destination / luggage_base 希望で別 fit）", () => {
  const lodging: TravelObjectState = { placeRefId: "H", category: "lodging", roleAffinity: { base: ob(0.5), destination: ob(0.9), luggage_base: ob(0.3) } };
  const mk = (role: IntendedRole["role"]) => solo({ tolerances: {}, intendedRoles: [ir("lodging", role)] });

  it("roleFit が希望 role の affinity を反映（base 0.5 / destination 0.9 / luggage_base 0.3）", () => {
    const role = (s: FitSubject) => evaluateFit({ entity: lodging, subject: s }).components.find((c) => c.key === "roleFit")!.valueFull;
    expect(role(mk("base"))).toBeCloseTo(0.5);
    expect(role(mk("destination"))).toBeCloseTo(0.9);
    expect(role(mk("luggage_base"))).toBeCloseTo(0.3);
  });
  it("overall が destination > base > luggage_base の順", () => {
    const ov = (s: FitSubject) => evaluateFit({ entity: lodging, subject: s }).perParticipantFit[0].overall;
    expect(ov(mk("destination"))).toBeGreaterThan(ov(mk("base")));
    expect(ov(mk("base"))).toBeGreaterThan(ov(mk("luggage_base")));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. food role + allergy hard constraint（安全側 fail-closed）", () => {
  const roleAff = { destination_meal: ob(0.9), refuel: ob(0.4) } as const;
  it("destination_meal vs refuel で roleFit が変わる", () => {
    const food: TravelObjectState = { placeRefId: "F", category: "food", roleAffinity: { ...roleAff } };
    const r1 = evaluateFit({ entity: food, subject: solo({ tolerances: {}, intendedRoles: [ir("food", "destination_meal")] }) });
    const r2 = evaluateFit({ entity: food, subject: solo({ tolerances: {}, intendedRoles: [ir("food", "refuel")] }) });
    expect(r1.components.find((c) => c.key === "roleFit")!.valueFull).toBeCloseTo(0.9);
    expect(r2.components.find((c) => c.key === "roleFit")!.valueFull).toBeCloseTo(0.4);
  });

  const allergyUser = solo({ tolerances: {}, hardConstraints: [{ axis: "allergy", descriptor: "allergy:shellfish", severity: "hard", visibility: "shared", provenance: "explicit_user" }] });
  it("allergen 表示 unknown（外食は義務外）→ blocked（満たさず扱い）", () => {
    const e: TravelObjectState = { placeRefId: "FU", category: "food", roleAffinity: { destination_meal: ob(0.7) }, hardProfile: { allergens: { handling: "unknown" } } };
    expect(evaluateFit({ entity: e, subject: allergyUser }).fitLabel).toBe("blocked");
  });
  it("当該 allergen を含む → blocked", () => {
    const e: TravelObjectState = { placeRefId: "FP", category: "food", roleAffinity: { destination_meal: ob(0.7) }, hardProfile: { allergens: { handling: "handled", present: ["shellfish"] } } };
    expect(evaluateFit({ entity: e, subject: allergyUser }).fitLabel).toBe("blocked");
  });
  it("handled かつ当該 allergen 安全 → 非 blocked", () => {
    const e: TravelObjectState = { placeRefId: "FS", category: "food", roleAffinity: { destination_meal: ob(0.7) }, hardProfile: { allergens: { handling: "handled", safe: ["shellfish"] } } };
    expect(evaluateFit({ entity: e, subject: allergyUser }).fitLabel).not.toBe("blocked");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. Hiroshima route-chain（飛行機本体は速いが door-to-door で逆転）", () => {
  const airChain: RouteChainState = {
    connection: {
      fromRef: "tokyo", toRef: "hiroshima",
      legs: [
        { mode: "rail", legKind: "firstMile", timeMin: 30 },
        { mode: "air", legKind: "mainLeg", timeMin: 80, inVehicleKind: "in_vehicle" },
        { mode: "bus", legKind: "lastMile", timeMin: 50 },
      ],
      transferNodes: [{ transferType: 0, minTransferMin: 10 }],
      terminals: [{ kind: "security", overheadMin: 60 }],
    },
  };
  const railChain: RouteChainState = {
    connection: {
      fromRef: "tokyo", toRef: "hiroshima",
      legs: [
        { mode: "walk", legKind: "firstMile", timeMin: 10 },
        { mode: "rail", legKind: "mainLeg", timeMin: 230, inVehicleKind: "in_vehicle" },
        { mode: "walk", legKind: "lastMile", timeMin: 5 },
      ],
      transferNodes: [],
    },
  };
  it("air mainLeg(80) < rail mainLeg(230) なのに door-to-door 総負荷は air > rail", () => {
    const air = doorToDoorBurden(airChain);
    const rail = doorToDoorBurden(railChain);
    expect(air.total).toBeGreaterThan(rail.total);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. egress 非対称（lastMile = firstMile × 3）", () => {
  const mk = (legKind: "firstMile" | "lastMile"): RouteChainState => ({ connection: { fromRef: "a", toRef: "b", legs: [{ mode: "walk", legKind, timeMin: 20 }], transferNodes: [] } });
  it("同一 20 分の leg でも lastMile 不効用は firstMile の 3 倍", () => {
    const first = doorToDoorBurden(mk("firstMile"));
    const last = doorToDoorBurden(mk("lastMile"));
    expect(last.legsBurden).toBeCloseTo(first.legsBurden * 3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. baggage / hotel-drop（ordering 状態が後続 baggageBurden を消す）", () => {
  const chain: RouteChainState = {
    connection: {
      fromRef: "hotel", toRef: "spot",
      legs: [{ mode: "walk", legKind: "lastMile", timeMin: 15 }],
      transferNodes: [{ transferType: 2, minTransferMin: 5, pathwayMode: 2 }],
      baggage: { spatialOccupancy: 0.8 },
    },
    ordering: [{ kind: "luggage_drop_enables", subjectRef: "hotel", objectRef: "spot", relaxable: false }],
  };
  it("ordering に luggage_drop_enables があると判定 true", () => {
    expect(baggageDroppedByOrdering(chain)).toBe(true);
  });
  it("荷物 drop で baggageBurden=0・総負荷が下がる", () => {
    const withBag = doorToDoorBurden(chain, { baggageDropped: false });
    const dropped = doorToDoorBurden(chain, { baggageDropped: baggageDroppedByOrdering(chain) });
    expect(withBag.baggageBurden).toBeGreaterThan(0);
    expect(dropped.baggageBurden).toBe(0);
    expect(dropped.total).toBeLessThan(withBag.total);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. connection は category root でない（関係層であり identity 源でない）", () => {
  it("TRAVEL_CATEGORIES に route / connection を含まない", () => {
    const cats = TRAVEL_CATEGORIES as readonly string[];
    expect(cats).not.toContain("route");
    expect(cats).not.toContain("connection");
  });
  it("ConnectionState は fromRef/toRef を持つ関係であり category を持たない", () => {
    const chain: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [], transferNodes: [] } };
    expect(chain.connection).toHaveProperty("fromRef");
    expect(chain.connection).not.toHaveProperty("category");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. support object（必要 relief が無ければ fail-closed・有れば摩擦低減）", () => {
  const user = solo({ tolerances: {} });
  it("necessity=required で reliefValue 欠落 → support_unavailable で blocked", () => {
    const e: TravelObjectState = { placeRefId: "SU", category: "support", rich: { subtype: "luggage_storage", reliefAxis: "luggage", necessity: "required", reliefValue: unobs as Observed<number> } };
    const r = evaluateFit({ entity: e, subject: user });
    expect(r.fitLabel).toBe("blocked");
    expect(r.hardBlocks.some((b) => b.reason === "support_unavailable")).toBe(true);
  });
  it("reliefValue 高 → 非 blocked（recovery 寄与）", () => {
    const e: TravelObjectState = { placeRefId: "SP", category: "support", rich: { subtype: "luggage_storage", reliefAxis: "luggage", necessity: "required", reliefValue: ob(0.8) } };
    const r = evaluateFit({ entity: e, subject: user });
    expect(r.fitLabel).not.toBe("blocked");
    expect(r.components.find((c) => c.key === "recoveryFit")!.available).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. FitContext 状態依存（base trait を変えず決定論で fit を動かす）", () => {
  const entity: TravelObjectState = { placeRefId: "C", category: "place", roleAffinity: { relaxation: ob(0.7) }, burden: { travelBurden: ob(0.7) } };
  const user: FitUserState = { tolerances: { mobilityTolerance: 0.6 } };
  const ctxFatigue: FitContext = { tripMode: "travel", tripIntent: "recovery", todayFatigueSpike: 0.8 };

  it("todayFatigueSpike=0.8 で burdenFit が低下する", () => {
    const base = evaluateFit({ entity, subject: solo(user) }).components.find((c) => c.key === "burdenFit")!.valueFull;
    const fatig = evaluateFit({ entity, subject: solo(user), context: ctxFatigue }).components.find((c) => c.key === "burdenFit")!.valueFull;
    expect(fatig).toBeLessThan(base);
  });
  it("評価で user の base trait を mutate しない", () => {
    const snapshot = JSON.stringify(user);
    evaluateFit({ entity, subject: solo(user), context: ctxFatigue });
    expect(JSON.stringify(user)).toBe(snapshot);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. group least-misery（平均が良くても 1 人が floor 割れなら poor）", () => {
  const entity: TravelObjectState = {
    placeRefId: "G", category: "lodging",
    roleAffinity: { base: ob(0.7) },
    traits: { quietLively: { value: 0.8, confidence: 0.8 } },
    burden: { travelBurden: ob(0.9) },
  };
  const subject: FitSubject = {
    kind: "group",
    relationship: "friends",
    participants: [
      { participantId: "P1", state: { tolerances: { mobilityTolerance: 0.9 }, traits: { quietLively: tv(0.8) }, intendedRoles: [ir("lodging", "base")] } },
      { participantId: "P2", state: { tolerances: { mobilityTolerance: 0.1 }, traits: { quietLively: tv(-0.8) }, intendedRoles: [ir("lodging", "base")] } },
    ],
  };
  it("floorBreached=true・group fitLabel=poor・worst=P2", () => {
    const r = evaluateFit({ entity, subject });
    expect(r.groupAggregateFit!.floorBreached).toBe(true);
    expect(r.fitLabel).toBe("poor");
    expect(r.groupAggregateFit!.worstParticipantId).toBe("P2");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("11. privacy（private 入力は full に効くが shared から逆算できない）", () => {
  const entity: TravelObjectState = {
    placeRefId: "PR", category: "lodging",
    rich: { onsenFacet: { springType: ob("sulfur") } },
    roleAffinity: { base: ob(0.7), romance: ob(0.95) },
    traits: { quietLively: { value: 0.5, confidence: 0.8 } },
  };
  const withPrivate: FitUserState = {
    tolerances: {},
    traits: { quietLively: tv(0.5), onsenWaterQuality: tv(0.9, 0.8, "private") },
    intendedRoles: [ir("lodging", "base", 0.6), ir("lodging", "romance", 1, 0.8, "private")],
  };
  const withoutPrivate: FitUserState = {
    tolerances: {},
    traits: { quietLively: tv(0.5) },
    intendedRoles: [ir("lodging", "base", 0.6)],
  };

  it("full では private が roleFit を上げる（romance 0.95 を選ぶ）", () => {
    const full = evaluateFit({ entity, subject: solo(withPrivate) });
    expect(full.components.find((c) => c.key === "roleFit")!.valueFull).toBeCloseTo(0.95);
  });
  it("shared 射影は private 有無で完全一致（連続値の逆算不能）", () => {
    const sharedA = toSharedFitView(evaluateFit({ entity, subject: solo(withPrivate) }));
    const sharedB = toSharedFitView(evaluateFit({ entity, subject: solo(withoutPrivate) }));
    expect(sharedA).toEqual(sharedB);
  });
  it("shared JSON に private role 名 'romance' が出現しない", () => {
    const sharedA = toSharedFitView(evaluateFit({ entity, subject: solo(withPrivate) }));
    expect(JSON.stringify(sharedA)).not.toContain("romance");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("12. authority（excellent でも実行権限を生成しない）", () => {
  const entity: TravelObjectState = {
    placeRefId: "AU", category: "lodging",
    roleAffinity: { base: ob(0.95) },
    traits: { quietLively: { value: 0.5, confidence: 0.9 } },
    burden: { travelBurden: ob(0.0) },
    relational: { solo: ob(0.9) },
    priceLevel: ob(0.0),
  };
  const user = solo({ tolerances: { mobilityTolerance: 0.9 }, traits: { quietLively: tv(0.5) }, intendedRoles: [ir("lodging", "base")], budgetSensitivity: 0.5 });
  it("fitLabel=excellent・authoritative=false・hasFitActionAuthority=false", () => {
    const r = evaluateFit({ entity, subject: user });
    expect(r.fitLabel).toBe("excellent");
    expect(r.authoritative).toBe(false);
    expect(hasFitActionAuthority(r)).toBe(false);
  });
  it("shared 射影も authoritative=false", () => {
    const r = toSharedFitView(evaluateFit({ entity, subject: user }));
    expect(r.authoritative).toBe(false);
    expect(hasFitActionAuthority(r)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("13. provenance（source 数/信頼度は confidence のみに効き生値を変えない）", () => {
  const base = (sources: ProvenanceSource[]): TravelObjectState => ({ placeRefId: "PV", category: "lodging", roleAffinity: { base: ob(0.7) }, traits: { quietLively: { value: 0.5, confidence: 0.8 } }, provenance: src(sources) });
  const user = solo({ tolerances: {}, traits: { quietLively: tv(0.5) }, intendedRoles: [ir("lodging", "base")] });
  it("source 1 件 vs 3 件: components/fitLabel 同一・confidence は 3 件が高い", () => {
    const r1 = evaluateFit({ entity: base([{ kind: "explicit_user", reliability: 0.9, independent: true }]), subject: user });
    const r3 = evaluateFit({ entity: base([{ kind: "explicit_user", reliability: 0.9, independent: true }, { kind: "editorial", reliability: 0.8, independent: true }, { kind: "aggregated", reliability: 0.7, independent: true }]), subject: user });
    expect(r1.components).toEqual(r3.components);
    expect(r1.fitLabel).toBe(r3.fitLabel);
    expect(r3.confidence).toBeGreaterThan(r1.confidence);
  });
  it("aggregateFieldConfidence: 独立 source は単調増加・相関 source は割引", () => {
    const indep = aggregateFieldConfidence([{ kind: "editorial", reliability: 0.7, independent: true }, { kind: "aggregated", reliability: 0.7, independent: true }]);
    const corr = aggregateFieldConfidence([{ kind: "editorial", reliability: 0.7, independent: false }, { kind: "aggregated", reliability: 0.7, independent: false }]);
    expect(indep).toBeGreaterThan(corr);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("14. missing data（通常欠損→低 confidence/質問・安全欠損→fail-closed）", () => {
  it("観測がほぼ無い → low_confidence の missingDataQuestion", () => {
    const e: TravelObjectState = { placeRefId: "MD", category: "lodging" };
    const r = evaluateFit({ entity: e, subject: solo({ tolerances: {} }) });
    expect(r.missingDataQuestions.some((q) => q.reason === "low_confidence")).toBe(true);
  });
  it("安全 critical(allergy) 未確認 → blocked かつ safety_unknown 質問", () => {
    const e: TravelObjectState = { placeRefId: "MS", category: "food", roleAffinity: { destination_meal: ob(0.7) }, hardProfile: { allergens: { handling: "unknown" } } };
    const r = evaluateFit({ entity: e, subject: solo({ tolerances: {}, hardConstraints: [{ axis: "allergy", descriptor: "allergy:peanut", severity: "hard", visibility: "shared", provenance: "explicit_user" }] }) });
    expect(r.fitLabel).toBe("blocked");
    expect(r.missingDataQuestions.some((q) => q.reason === "safety_unknown")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("15. 決定論（同一入力→同一出力・batch は placeRefId 安定 sort）", () => {
  const user = solo({ tolerances: { mobilityTolerance: 0.7 }, traits: { quietLively: tv(0.5) }, intendedRoles: [ir("lodging", "base")] });
  const entity: TravelObjectState = { placeRefId: "D", category: "lodging", roleAffinity: { base: ob(0.7) }, traits: { quietLively: { value: 0.5, confidence: 0.8 } }, burden: { travelBurden: ob(0.4) } };
  it("2 回評価で deep-equal", () => {
    expect(evaluateFit({ entity, subject: user })).toEqual(evaluateFit({ entity, subject: user }));
  });
  it("batch は placeRefId 昇順", () => {
    const es: TravelObjectState[] = [{ placeRefId: "z", category: "lodging" }, { placeRefId: "a", category: "lodging" }, { placeRefId: "m", category: "lodging" }];
    expect(evaluateFitBatch(es, user).map((r) => r.placeRefId)).toEqual(["a", "m", "z"]);
  });
  it("solo の groupAggregate.overallScore は perParticipant[0].overall に一致", () => {
    const r = evaluateFit({ entity, subject: user });
    expect(r.groupAggregateFit!.overallScore).toBeCloseTo(r.perParticipantFit[0].overall);
    expect(r.conflicts).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("16. import 純度 / 名前衝突回避（fit-core）", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/shared/travel/fit-core.ts"), "utf8");
  it("fetch/API/DB/Supabase/route/UI を import しない", () => {
    expect(source).not.toMatch(/from ["']next/);
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/from ["']@\/app/);
    expect(source).not.toMatch(/from ["']@\/components/);
    expect(source).not.toMatch(/\bfetch\(/);
  });
  it("proposal-types の FitLabel / readiness / contingency を import しない（名前衝突回避）", () => {
    expect(source).not.toMatch(/from ["']\.\/proposal-types["']/);
    expect(source).not.toMatch(/from ["']\.\/readiness-types["']/);
    expect(source).not.toMatch(/from ["']\.\/contingency-types["']/);
  });
  it("Date.now / Math.random を使わない（決定論）", () => {
    expect(source).not.toMatch(/Date\.now|Math\.random/);
  });
});
