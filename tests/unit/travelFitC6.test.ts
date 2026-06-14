/**
 * T11-C6-D — deferred interaction second slice golden tests（hotelDrop / earlyMorning）
 *
 * 検証対象: hotelDropPolicy / execHotelDrop / execEarlyMorning（fit-core 統合）。
 * 設計正本: docs/t11-c6-deferred-interaction-second-slice-plan.md
 *   （+ CEO 修正: 明示 droppedState ≠ policy relief / sleepDebt を infer しない）
 *
 * 主眼: ordering 単独・affordance 単独で drop しない / ordering+affordance で relief / 明示 dropped 維持 /
 *   earlyMorning は explicit fatigue のみ（sleepDebt 非推論）superadditive / route authority 無 / privacy。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFit, toSharedFitView, hasFitActionAuthority, doorToDoorBurden, deriveRouteObservations, deriveRouteDecomposition } from "@/lib/shared/travel/fit-core";
import { hotelDropPolicy, executeInteraction } from "@/lib/shared/travel/fit-constructs-core";
import type { FitContext, FitSubject, FitUserState, RouteChainState, TravelObjectState } from "@/lib/shared/travel/fit-types";

const solo = (user: FitUserState): FitSubject => ({ kind: "solo", user });
const soloU = (): FitSubject => solo({ tolerances: {} });
const place = (): TravelObjectState => ({ placeRefId: "P", category: "place", roleAffinity: { relaxation: { value: 0.7, confidence: 0.8, provenance: "editorial" } } });
const comp = (r: ReturnType<typeof evaluateFit>, key: string) => r.components.find((c) => c.key === key)!;
const burdenF = (routeInput: RouteChainState) => comp(evaluateFit({ entity: place(), subject: soloU(), routeInput }), "burdenFit").valueFull;

const baseConn = () => ({ fromRef: "a", toRef: "b", legs: [{ mode: "walk" as const, legKind: "lastMile" as const, timeMin: 20 }], transferNodes: [{ transferType: 2 as const, minTransferMin: 5, pathwayMode: 2 as const }], baggageState: { spatialOccupancy: 0.9, droppedState: "carried" as const } });
const dropOrder = [{ kind: "luggage_drop_enables" as const, subjectRef: "h", objectRef: "d", relaxable: false }];

// ════════════════════════════════════════════════════════════════════════════
describe("1. hotelDrop policy（★ordering+affordance 両方必須・明示 dropped と別）", () => {
  it("ordering 単独では drop しない（hotelDropPolicy=false）", () => {
    expect(hotelDropPolicy({ connection: baseConn(), ordering: dropOrder })).toBe(false);
  });
  it("affordance 単独では drop しない", () => {
    expect(hotelDropPolicy({ connection: { ...baseConn(), dropAffordance: { hotel: true } } })).toBe(false);
  });
  it("ordering + affordance で初めて drop 可能", () => {
    expect(hotelDropPolicy({ connection: { ...baseConn(), dropAffordance: { hotel: true } }, ordering: dropOrder })).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. hotelDrop fit 効果（drop relief は ordering+affordance のみ）", () => {
  const carried: RouteChainState = { connection: baseConn() };
  const orderingOnly: RouteChainState = { connection: baseConn(), ordering: dropOrder };
  const affordanceOnly: RouteChainState = { connection: { ...baseConn(), dropAffordance: { hotel: true } } };
  const both: RouteChainState = { connection: { ...baseConn(), dropAffordance: { hotel: true } }, ordering: dropOrder };
  it("ordering+affordance → 下流 baggage 負荷低減（burdenFit 改善）", () => {
    expect(burdenF(both)).toBeGreaterThan(burdenF(carried));
  });
  it("ordering 単独 / affordance 単独 → relief 無し（carried と同じ）", () => {
    expect(burdenF(orderingOnly)).toBeCloseTo(burdenF(carried));
    expect(burdenF(affordanceOnly)).toBeCloseTo(burdenF(carried));
  });
  it("execHotelDrop は両条件で riskFlag・片方では null", () => {
    expect(executeInteraction("IX_hoteldrop_order_luggage", { isSolo: true, routeChain: both })!.riskFlags[0].code).toBe("luggage_drop_relief");
    expect(executeInteraction("IX_hoteldrop_order_luggage", { isSolo: true, routeChain: orderingOnly })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. 明示 droppedState は policy と独立に有効（before/after distinct）", () => {
  const explicitDropped: RouteChainState = { connection: { ...baseConn(), baggageState: { spatialOccupancy: 0.9, droppedState: "dropped" } } };
  const carried: RouteChainState = { connection: baseConn() };
  it("明示 dropped（ordering/affordance 無）でも baggageBurden=0", () => {
    expect(doorToDoorBurden(explicitDropped).baggageBurden).toBe(0);
    expect(doorToDoorBurden(carried).baggageBurden).toBeGreaterThan(0);
  });
  it("明示 dropped → burdenFit が carried より良い", () => {
    expect(burdenF(explicitDropped)).toBeGreaterThan(burdenF(carried));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. hotelDrop は itinerary を solve/reorder せず authority も作らない", () => {
  const both: RouteChainState = { connection: { ...baseConn(), dropAffordance: { hotel: true } }, ordering: dropOrder };
  it("hotelDropPolicy は boolean を返すのみ（ordering を mutate しない）", () => {
    const o = [...dropOrder];
    hotelDropPolicy(both);
    expect(both.ordering).toEqual(o); // 順序確定しない
  });
  it("routeInput 供給後も hasFitActionAuthority false・component 6 キー不変", () => {
    const r = evaluateFit({ entity: place(), subject: soloU(), routeInput: both });
    expect(hasFitActionAuthority(r)).toBe(false);
    expect(r.components.map((c) => c.key).sort()).toEqual(["budgetFit", "burdenFit", "recoveryFit", "relationalFit", "roleFit", "traitFit"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. C5.1 意味論不変（routeChainBurden 集約・walkingLoad 歩行専用）", () => {
  const rc: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 100, inVehicleKind: "in_vehicle" }], transferNodes: [], terminals: [{ kind: "security", overheadMin: 50 }] } };
  it("総 route 負荷は routeChainBurden（walkingLoad でない）", () => {
    const d = deriveRouteObservations(rc);
    expect(d.routeChainBurden!.doorToDoorTotalNorm).toBeDefined();
    expect(d.walkingLoad).toBeUndefined();
  });
  it("walkingLoad は分解 sub-observation で歩行専用のまま", () => {
    const railWalk: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [{ mode: "walk", legKind: "firstMile", timeMin: 10 }], transferNodes: [] } };
    expect(deriveRouteDecomposition(railWalk).walkingLoad!.walkingDistanceKm!.value).toBeLessThan(0.3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. earlyMorning superadditive（★explicit fatigue のみ・sleepDebt 非推論）", () => {
  const ctxEarly = (fatigue?: number): FitContext => ({ tripMode: "travel", tripIntent: "work", timeOfDayBand: "early_morning", ...(fatigue !== undefined ? { todayFatigueSpike: fatigue } : {}) });
  const routeTerminal: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 100, inVehicleKind: "in_vehicle" }], transferNodes: [], terminals: [{ kind: "security", overheadMin: 60 }] } };
  const routeNoTerminal: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 100, inVehicleKind: "in_vehicle" }], transferNodes: [] } };
  const bF = (ctx: FitContext, rc: RouteChainState) => comp(evaluateFit({ entity: place(), subject: soloU(), context: ctx, routeInput: rc }), "burdenFit").valueFull;
  it("早朝×terminal×explicit fatigue → burdenFit 低下（superadditive）", () => {
    expect(bF(ctxEarly(0.8), routeTerminal)).toBeLessThan(bF(ctxEarly(undefined), routeTerminal)); // fatigue 有 < fatigue 無
  });
  it("★sleepDebt を infer しない: explicit fatigue 無 → 非発火", () => {
    const r = evaluateFit({ entity: place(), subject: soloU(), context: ctxEarly(undefined), routeInput: routeTerminal });
    expect(executeInteraction("IX_earlymorning_terminal_sleepdebt", { isSolo: true, ctx: ctxEarly(undefined), routeChain: routeTerminal })).toBeNull();
    expect(r.labelCap).toBeNull();
  });
  it("terminal burden 無 → 非発火（hallucinate しない）", () => {
    expect(executeInteraction("IX_earlymorning_terminal_sleepdebt", { isSolo: true, ctx: ctxEarly(0.8), routeChain: routeNoTerminal })).toBeNull();
  });
  it("早朝でない（day）→ 非発火", () => {
    const ctxDay: FitContext = { tripMode: "travel", tripIntent: "work", timeOfDayBand: "midday", todayFatigueSpike: 0.8 };
    expect(executeInteraction("IX_earlymorning_terminal_sleepdebt", { isSolo: true, ctx: ctxDay, routeChain: routeTerminal })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. cancel_weather は fit-core 非実行（T6 readiness-facing）", () => {
  it("IX_cancel_weather は C6 wired interaction に無い（executeInteraction null）", () => {
    expect(executeInteraction("IX_cancel_weather", { isSolo: true })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. private fatigue/mobility 懸念は full のみ・shared 非漏洩", () => {
  const both: RouteChainState = { connection: { ...baseConn(), dropAffordance: { hotel: true } }, ordering: dropOrder };
  const privMob = { userPrefs: { self: { walkingLoad: { value: 0.9, confidence: 0.8, visibility: "private" as const } } } };
  it("private mobility → full burdenFit が shared より低い", () => {
    const b = comp(evaluateFit({ entity: place(), subject: soloU(), routeInput: both, constructInput: privMob }), "burdenFit");
    expect(b.valueFull).toBeLessThan(b.valueShared);
  });
  it("shared 射影は private 有無で一致（逆算不能）", () => {
    const withP = toSharedFitView(evaluateFit({ entity: place(), subject: soloU(), routeInput: both, constructInput: privMob }));
    const without = toSharedFitView(evaluateFit({ entity: place(), subject: soloU(), routeInput: both }));
    expect(withP).toEqual(without);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. import 純度", () => {
  it("fit-core / fit-constructs-core は fetch/route/weather/API/DB/UI を import しない", () => {
    for (const f of ["lib/shared/travel/fit-core.ts", "lib/shared/travel/fit-constructs-core.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
    }
  });
});
