/**
 * T11-C6.1-D — last departure strand interaction golden tests
 *
 * 検証対象: strandRisk / execLastDepartureStrand（fit-core 統合）。
 * 設計正本: docs/t11-c6.1-last-departure-strand-plan.md
 *   （+ CEO 修正: 既存 label 値のみ使用 / burdenFit は default 不修飾）
 *
 * 主眼: lock+高 delay→strand / lock 無→非発火 / reliability 欠落→安全断定させない(cap+question,not hardBlock) /
 *   burdenFit 不修飾 / delayRisk≠PTI 分離 / fallback で緩和 / private 非漏洩 / no authority。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFit, toSharedFitView, hasFitActionAuthority, deriveRouteObservations } from "@/lib/shared/travel/fit-core";
import { strandRisk, hasLastDepartureLock, executeInteraction } from "@/lib/shared/travel/fit-constructs-core";
import type { FitSubject, FitUserState, RouteChainState, RouteReliabilityState, TravelObjectState } from "@/lib/shared/travel/fit-types";

const solo = (user: FitUserState): FitSubject => ({ kind: "solo", user });
const soloU = (): FitSubject => solo({ tolerances: {} });
const place = (): TravelObjectState => ({ placeRefId: "P", category: "place", roleAffinity: { relaxation: { value: 0.7, confidence: 0.8, provenance: "editorial" } } });
const comp = (r: ReturnType<typeof evaluateFit>, key: string) => r.components.find((c) => c.key === key)!;
const lockOrder = [{ kind: "last_departure_lock" as const, subjectRef: "x", objectRef: "y", relaxable: false }];
const rc = (rel?: RouteReliabilityState, ordering: RouteChainState["ordering"] = lockOrder, legMin = 100): RouteChainState => ({
  connection: { fromRef: "a", toRef: "b", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: legMin, inVehicleKind: "in_vehicle" }], transferNodes: [], ...(rel ? { reliability: rel } : {}) },
  ordering,
});
const r = (routeInput: RouteChainState) => evaluateFit({ entity: place(), subject: soloU(), routeInput });

// ════════════════════════════════════════════════════════════════════════════
describe("1. strand risk 生成（lock + 高 delay × 低 buffer）", () => {
  it("lock + 高 delayRisk + 低 buffer → strand risk 高（>veto floor）", () => {
    expect(strandRisk(rc({ delayRisk: 0.8, bufferIndex: 0.1 }))!).toBeGreaterThan(0.6);
  });
  it("低 delayRisk → strand risk 低（効果なし）", () => {
    expect(strandRisk(rc({ delayRisk: 0.1, bufferIndex: 0.5 }))!).toBeLessThan(0.3);
    expect(executeInteraction("IX_last_departure_strand", { isSolo: true, routeChain: rc({ delayRisk: 0.1, bufferIndex: 0.5 }) })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. gate / missing-data", () => {
  it("last_departure_lock 無 → 非発火（strandRisk=0・interaction null）", () => {
    expect(strandRisk(rc({ delayRisk: 0.9 }, []))).toBe(0);
    expect(executeInteraction("IX_last_departure_strand", { isSolo: true, routeChain: rc({ delayRisk: 0.9 }, []) })).toBeNull();
  });
  it("lock 無 ∧ reliability 欠落 → hallucinate しない（非発火）", () => {
    expect(executeInteraction("IX_last_departure_strand", { isSolo: true, routeChain: rc(undefined, []) })).toBeNull();
  });
  it("★lock 有 ∧ reliability 欠落 → labelCap+question・hardBlock しない", () => {
    expect(strandRisk(rc(undefined, lockOrder))).toBeNull();
    const res = r(rc(undefined, lockOrder));
    expect(res.labelCap).toBe("good");
    expect(res.fitLabel).not.toBe("blocked"); // hardBlock しない
    expect(res.missingDataQuestions.some((q) => q.field === "routeReliability:delayRisk")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. 高 strand は excellent/fully-reliable にならない（既存 label 値 stretch）", () => {
  it("短い route(低 burden)でも高 strand → labelCap=stretch・excellent 不可", () => {
    const shortHigh: RouteChainState = { connection: { fromRef: "a", toRef: "b", legs: [{ mode: "walk", legKind: "lastMile", timeMin: 5 }], transferNodes: [], reliability: { delayRisk: 0.9, bufferIndex: 0.05 } }, ordering: lockOrder };
    const res = r(shortHigh);
    expect(res.labelCap).toBe("stretch");
    expect(res.fitLabel).not.toBe("excellent");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. burdenFit は default 不修飾・delayRisk≠PTI 分離（二重計上しない）", () => {
  it("strand(lock+delayRisk)は burdenFit を変えない（lock 有無で burdenFit 同一）", () => {
    const withLock = comp(r(rc({ delayRisk: 0.9, bufferIndex: 0.1 }, lockOrder)), "burdenFit").valueFull;
    const noLock = comp(r(rc({ delayRisk: 0.9, bufferIndex: 0.1 }, [])), "burdenFit").valueFull;
    expect(withLock).toBeCloseTo(noLock); // strand は burden を足さない
  });
  it("PTI→routeChainBurden(burden) / delayRisk→strand(risk): PTI route の burdenFit < delayRisk route", () => {
    const ptiRoute = rc({ planningTimeIndex: 0.9 }, lockOrder); // PTI=burden
    const delayRoute = rc({ delayRisk: 0.9, bufferIndex: 0.1 }, lockOrder); // delayRisk=strand
    expect(comp(r(ptiRoute), "burdenFit").valueFull).toBeLessThan(comp(r(delayRoute), "burdenFit").valueFull);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. fallback availability が strand を緩和", () => {
  it("fallback 明示供給 → strand risk が下がる", () => {
    const noFb = strandRisk(rc({ delayRisk: 0.8, bufferIndex: 0.1 }))!;
    const withFb = strandRisk(rc({ delayRisk: 0.8, bufferIndex: 0.1, fallbackAvailability: 0.9 }))!;
    expect(withFb).toBeLessThan(noFb);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. schedule/route 選択せず・authority 無・C5.1 不変", () => {
  it("strandRisk は ordering を mutate しない（schedule/solve しない）", () => {
    const route = rc({ delayRisk: 0.8, bufferIndex: 0.1 });
    const before = [...route.ordering!];
    strandRisk(route);
    expect(route.ordering).toEqual(before);
  });
  it("hasFitActionAuthority false・component 6 キー不変", () => {
    const res = r(rc({ delayRisk: 0.8, bufferIndex: 0.1 }));
    expect(hasFitActionAuthority(res)).toBe(false);
    expect(res.components.map((c) => c.key).sort()).toEqual(["budgetFit", "burdenFit", "recoveryFit", "relationalFit", "roleFit", "traitFit"]);
  });
  it("routeChainBurden は集約のまま・walkingLoad は派生に出ない（C5.1）", () => {
    const d = deriveRouteObservations(rc({ delayRisk: 0.8 }));
    expect(d.routeChainBurden!.doorToDoorTotalNorm).toBeDefined();
    expect(d.walkingLoad).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. private mobility/fatigue 懸念は full のみ・shared 非漏洩", () => {
  const strandRoute = rc({ delayRisk: 0.8, bufferIndex: 0.1 });
  const privMob = { userPrefs: { self: { walkingLoad: { value: 0.9, confidence: 0.8, visibility: "private" as const } } } };
  it("private mobility → full burdenFit が shared より低い", () => {
    const b = comp(evaluateFit({ entity: place(), subject: soloU(), routeInput: strandRoute, constructInput: privMob }), "burdenFit");
    expect(b.valueFull).toBeLessThan(b.valueShared);
  });
  it("shared 射影は private 有無で一致（strand cap は shared-safe・private は漏れない）", () => {
    const withP = toSharedFitView(evaluateFit({ entity: place(), subject: soloU(), routeInput: strandRoute, constructInput: privMob }));
    const without = toSharedFitView(evaluateFit({ entity: place(), subject: soloU(), routeInput: strandRoute }));
    expect(withP).toEqual(without);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. import 純度（live timetable/API 断定なし）", () => {
  it("fit-core / fit-constructs-core は fetch/route/weather/timetable/API/DB/UI を import しない", () => {
    for (const f of ["lib/shared/travel/fit-core.ts", "lib/shared/travel/fit-constructs-core.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
    }
  });
  it("hasLastDepartureLock は ordering を読むだけ（boolean）", () => {
    expect(hasLastDepartureLock(rc({ delayRisk: 0.5 }))).toBe(true);
    expect(hasLastDepartureLock(rc({ delayRisk: 0.5 }, []))).toBe(false);
  });
});
