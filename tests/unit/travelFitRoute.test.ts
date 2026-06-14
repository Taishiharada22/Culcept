/**
 * T11-C5-E — ConnectionState / RouteChain deepening golden tests
 *
 * 検証対象: doorToDoorBurden enrich / deriveRouteObservations / routeLockSignals / routeInput 配線。
 * 設計正本: docs/t11-c5-connectionstate-deepening-plan.md（+ CEO 修正: derived provenance / no route authority）
 *
 * 主眼: 三表現統一(ConnectionState→doorToDoor→H_route 構築子→burdenFit/recoveryFit・新 component 無) /
 *   派生値 provenance / live data 偽装しない / route 推薦・予約・scheduling 権限なし / private mobility 非漏洩。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateFit,
  toSharedFitView,
  hasFitActionAuthority,
  doorToDoorBurden,
  deriveRouteObservations,
  deriveRouteDecomposition,
  routeLockSignals,
  type EvaluateFitConstructInput,
} from "@/lib/shared/travel/fit-core";
import { ROUTE_DERIVED_PROVENANCE, type FitContext, type FitSubject, type FitUserState, type RouteChainState, type TravelObjectState } from "@/lib/shared/travel/fit-types";

const solo = (user: FitUserState): FitSubject => ({ kind: "solo", user });
const soloU = (): FitSubject => solo({ tolerances: {} });
const place = (): TravelObjectState => ({ placeRefId: "P", category: "place", roleAffinity: { relaxation: { value: 0.7, confidence: 0.8, provenance: "editorial" } } });
const comp = (r: ReturnType<typeof evaluateFit>, key: string) => r.components.find((c) => c.key === key)!;

const air: RouteChainState = {
  connection: {
    fromRef: "tokyo", toRef: "hiroshima",
    legs: [{ mode: "rail", legKind: "firstMile", timeMin: 30 }, { mode: "air", legKind: "mainLeg", timeMin: 80, inVehicleKind: "in_vehicle" }, { mode: "bus", legKind: "lastMile", timeMin: 50 }],
    transferNodes: [{ transferType: 0, minTransferMin: 10 }],
    terminals: [{ kind: "security", overheadMin: 60 }],
  },
};
const rail: RouteChainState = {
  connection: {
    fromRef: "tokyo", toRef: "hiroshima",
    legs: [{ mode: "walk", legKind: "firstMile", timeMin: 10 }, { mode: "rail", legKind: "mainLeg", timeMin: 230, inVehicleKind: "in_vehicle" }, { mode: "walk", legKind: "lastMile", timeMin: 5 }],
    transferNodes: [],
  },
};

// ════════════════════════════════════════════════════════════════════════════
describe("1. presence-gated（routeInput 無→従来挙動）", () => {
  it("routeInput 無し → burdenFit unavailable（legacy）・有り → available", () => {
    const noRoute = evaluateFit({ entity: place(), subject: soloU() });
    const withRoute = evaluateFit({ entity: place(), subject: soloU(), routeInput: rail });
    expect(comp(noRoute, "burdenFit").available).toBe(false);
    expect(comp(withRoute, "burdenFit").available).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. door-to-door（Hiroshima air vs rail）", () => {
  it("air mainLeg(80)<rail(230) でも door-to-door 総負荷は air>rail", () => {
    expect(doorToDoorBurden(air).total).toBeGreaterThan(doorToDoorBurden(rail).total);
  });
  it("★fit level: egress/terminal で air の burdenFit が rail より低い（main-leg 速度優位を反転）", () => {
    const airFit = comp(evaluateFit({ entity: place(), subject: soloU(), routeInput: air }), "burdenFit").valueFull;
    const railFit = comp(evaluateFit({ entity: place(), subject: soloU(), routeInput: rail }), "burdenFit").valueFull;
    expect(airFit).toBeLessThan(railFit);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. station-to-hotel / terminal / transfer-complexity / PTI が burden に効く", () => {
  const base: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 100, inVehicleKind: "in_vehicle" }], transferNodes: [] } };
  it("station-to-hotel burden が fit を下げる", () => {
    const withSH: RouteChainState = { connection: { ...base.connection, stationToHotelBurden: { walkMin: 30 } } };
    expect(comp(evaluateFit({ entity: place(), subject: soloU(), routeInput: withSH }), "burdenFit").valueFull)
      .toBeLessThan(comp(evaluateFit({ entity: place(), subject: soloU(), routeInput: base }), "burdenFit").valueFull);
  });
  it("transfer complexity が door-to-door を上げる", () => {
    const simple: RouteChainState = { connection: { ...base.connection, transferNodes: [{ transferType: 0, minTransferMin: 5 }] } };
    const complex: RouteChainState = { connection: { ...base.connection, transferNodes: [{ transferType: 0, minTransferMin: 5, transferComplexity: 0.9 }] } };
    expect(doorToDoorBurden(complex).total).toBeGreaterThan(doorToDoorBurden(simple).total);
  });
  it("terminal burden が door-to-door を上げる", () => {
    const withT: RouteChainState = { connection: { ...base.connection, terminals: [{ kind: "security", overheadMin: 40, walkM: 300, queueVariance: 0.5 }] } };
    expect(doorToDoorBurden(withT).total).toBeGreaterThan(doorToDoorBurden(base).total);
  });
  it("PTI/reliability が door-to-door を上げる（実 API 無）", () => {
    const withPTI: RouteChainState = { connection: { ...base.connection, reliability: { planningTimeIndex: 0.9 } } };
    expect(doorToDoorBurden(withPTI).total).toBeGreaterThan(doorToDoorBurden(base).total);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. baggage / hotel drop（before/after drop 状態遷移）", () => {
  const chain = (dropped: "carried" | "dropped"): RouteChainState => ({
    connection: { fromRef: "a", toRef: "b", legs: [{ mode: "walk", legKind: "lastMile", timeMin: 15 }], transferNodes: [{ transferType: 2, minTransferMin: 5, pathwayMode: 2 }], baggageState: { spatialOccupancy: 0.8, droppedState: dropped } },
  });
  it("before-drop(carried) vs after-drop(dropped) で baggageBurden が遷移（dropped=0）", () => {
    expect(doorToDoorBurden(chain("carried")).baggageBurden).toBeGreaterThan(0);
    expect(doorToDoorBurden(chain("dropped")).baggageBurden).toBe(0);
  });
  it("hotel drop で総負荷が下がる", () => {
    expect(doorToDoorBurden(chain("dropped")).total).toBeLessThan(doorToDoorBurden(chain("carried")).total);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. ordering / lock は carry signal のみ（scheduling/solving しない）", () => {
  const withLocks: RouteChainState = {
    connection: rail.connection,
    ordering: [
      { kind: "last_departure_lock", subjectRef: "x", objectRef: "y", relaxable: false },
      { kind: "timed_entry_lock", subjectRef: "x", objectRef: "y", relaxable: false },
      { kind: "open_hours_window_lock", subjectRef: "x", objectRef: "y", relaxable: false },
    ],
  };
  it("last_departure_lock → lastDepartureRisk・timed_entry/open_hours → constraint 数", () => {
    const s = routeLockSignals(withLocks);
    expect(s.lastDepartureRisk).toBe(true);
    expect(s.timedEntryConstraints).toBe(1);
    expect(s.openHoursConstraints).toBe(1);
  });
  it("lock 無し → risk/constraint なし", () => {
    const s = routeLockSignals(rail);
    expect(s.lastDepartureRisk).toBe(false);
    expect(s.timedEntryConstraints).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. route comfort（work/sleep）→ recoveryFit", () => {
  const ctxWork: FitContext = { tripMode: "travel", tripIntent: "work" };
  const longLeg = (extra: object): RouteChainState => ({ connection: { fromRef: "a", toRef: "b", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 200, inVehicleKind: "in_vehicle" }], transferNodes: [], comfort: extra } });
  const user = () => solo({ tolerances: {}, recoveryStyle: "rest_to_recover" });
  it("route workability 高 → recoveryFit が上がる（work-trip）", () => {
    const withW = comp(evaluateFit({ entity: place(), subject: user(), context: ctxWork, routeInput: longLeg({ workability: 0.9 }) }), "recoveryFit").valueFull;
    const without = comp(evaluateFit({ entity: place(), subject: user(), context: ctxWork, routeInput: longLeg({}) }), "recoveryFit").valueFull;
    expect(withW).toBeGreaterThan(without);
  });
  it("route sleepability 高 → 長 leg の recoveryFit が上がる", () => {
    const withS = comp(evaluateFit({ entity: place(), subject: user(), routeInput: longLeg({ sleepability: 0.9 }) }), "recoveryFit").valueFull;
    const without = comp(evaluateFit({ entity: place(), subject: user(), routeInput: longLeg({}) }), "recoveryFit").valueFull;
    expect(withS).toBeGreaterThan(without);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. derived observation（★派生値・live data でない）", () => {
  it("derived observation は derived_from_connection_state provenance を持つ", () => {
    const d = deriveRouteObservations(air);
    expect(d.routeChainBurden!.doorToDoorTotalNorm!.provenance).toBe(ROUTE_DERIVED_PROVENANCE);
    expect(ROUTE_DERIVED_PROVENANCE).toBe("derived_from_connection_state");
  });
  it("derived confidence は入力 completeness を反映（rich>sparse・派生は満点でない）", () => {
    const rich: RouteChainState = { connection: { ...rail.connection, reliability: { planningTimeIndex: 0.5 }, comfort: { workability: 0.5 }, terminals: [{ kind: "security", overheadMin: 10 }], baggageState: { spatialOccupancy: 0.3 }, airportToCityBurden: { applicable: true, accessMin: 10 }, stationToHotelBurden: { walkMin: 5 } } };
    const cRich = deriveRouteObservations(rich).routeChainBurden!.doorToDoorTotalNorm!.confidence;
    const cSparse = deriveRouteObservations(rail).routeChainBurden!.doorToDoorTotalNorm!.confidence;
    expect(cRich).toBeGreaterThan(cSparse);
    expect(cRich).toBeLessThan(1); // 派生は満点にしない
  });
  it("欠落 route data を hallucinate しない（comfort 無→workability/sleepability 派生せず・legs 無→routeChainBurden 無）", () => {
    expect(deriveRouteObservations(rail).workabilityValue).toBeUndefined();
    const empty: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [], transferNodes: [] } };
    expect(deriveRouteObservations(empty).routeChainBurden).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("11. ★C5.1 意味論修正: 総 route 負荷は walkingLoad でなく routeChainBurden", () => {
  it("door-to-door 総負荷は walkingLoad に格納しない（routeChainBurden へ）", () => {
    const d = deriveRouteObservations(air);
    expect(d.walkingLoad).toBeUndefined(); // 総負荷は walkingLoad に入れない
    expect(d.routeChainBurden!.doorToDoorTotalNorm).toBeDefined();
  });
  it("routeChainBurden は terminal/transfer/egress/PTI を含む総負荷を反映（air > rail）", () => {
    const airB = deriveRouteObservations(air).routeChainBurden!.doorToDoorTotalNorm!.value;
    const railB = deriveRouteObservations(rail).routeChainBurden!.doorToDoorTotalNorm!.value;
    expect(airB).toBeGreaterThan(railB); // air は terminal+egress で総負荷大
  });
  it("walkingLoad は歩行専用（分解 sub-observation・歩行 leg のみ・総負荷でない）", () => {
    const decomp = deriveRouteDecomposition(rail);
    // rail は walk firstMile(10)+walk lastMile(5)=15 分のみ → 歩行のみで小さい（総 255 分でない）
    expect(decomp.walkingLoad!.walkingDistanceKm!.value).toBeLessThan(0.5);
    expect(decomp.walkingLoad!.walkingDistanceKm!.provenance).toBe(ROUTE_DERIVED_PROVENANCE);
  });
  it("分解は terminal/transfer/station-hotel/PTI を別 sub-observation に保持（説明用・fit に二重計上しない）", () => {
    const rich: RouteChainState = { connection: { ...air.connection, stationToHotelBurden: { walkMin: 20 }, reliability: { planningTimeIndex: 0.6 } } };
    const d = deriveRouteDecomposition(rich);
    expect(d.transferBurden).toBeDefined();
    expect(d.terminalWalkingBurden).toBeDefined();
    expect(d.stationToHotelBurden).toBeDefined();
    expect(d.reliabilityBurden).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. private mobility/accessibility 懸念は full のみ・shared 非漏洩", () => {
  const privMob: EvaluateFitConstructInput = { userPrefs: { self: { walkingLoad: { value: 0.9, confidence: 0.8, visibility: "private" } } } };
  it("private mobility → full burdenFit が shared より低い", () => {
    const r = evaluateFit({ entity: place(), subject: soloU(), routeInput: rail, constructInput: privMob });
    const b = comp(r, "burdenFit");
    expect(b.valueFull).toBeLessThan(b.valueShared);
  });
  it("shared 射影は private mobility の有無で一致（逆算不能）", () => {
    const withP = toSharedFitView(evaluateFit({ entity: place(), subject: soloU(), routeInput: rail, constructInput: privMob }));
    const without = toSharedFitView(evaluateFit({ entity: place(), subject: soloU(), routeInput: rail }));
    expect(withP).toEqual(without);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. route は authority を生成しない", () => {
  it("routeInput 供給後も hasFitActionAuthority は literal false", () => {
    expect(hasFitActionAuthority(evaluateFit({ entity: place(), subject: soloU(), routeInput: air }))).toBe(false);
  });
  it("component は 6 標準キーのみ（route で新並列スコアを作らない）", () => {
    const r = evaluateFit({ entity: place(), subject: soloU(), routeInput: air });
    expect(r.components.map((c) => c.key).sort()).toEqual(["budgetFit", "burdenFit", "recoveryFit", "relationalFit", "roleFit", "traitFit"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. import 純度", () => {
  it("fit-core / fit-constructs-core は fetch/route/weather/API/DB/UI を import しない", () => {
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
