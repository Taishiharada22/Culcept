import { describe, it, expect } from "vitest";
import {
  buildPersonalPaceDogfoodReadiness,
  summarizeCaptureQuality,
  DOGFOOD_WATCH_ITEMS,
  DOGFOOD_ROLLBACK_CONDITIONS,
  type CaptureQualitySummary,
} from "@/lib/plan/mobility/personalPaceDogfoodReadiness";
import type { PaceActivationReadiness } from "@/lib/plan/mobility/paceActivationReadiness";
import type { PaceShadowActivationReport } from "@/lib/plan/mobility/paceShadowActivation";
import { MOVEMENT_EVENT_SCHEMA_VERSION, type MovementEvent, type MovementEventStore } from "@/lib/plan/mobility/movementEventStore";

const readyReadiness: PaceActivationReadiness = { groups: [], readyForShadowCount: 1, readyForActivationCount: 1, overall: "ready_for_activation" };
const noActivationReadiness: PaceActivationReadiness = { groups: [], readyForShadowCount: 2, readyForActivationCount: 0, overall: "ready_for_shadow" };
const safeShadow: PaceShadowActivationReport = {
  ran: true, readinessOverall: "ready_for_activation", shadow: null,
  concerns: { overPessimism: false, markerExplosion: false, diagnosticWorsening: false, overChange: false }, anyConcern: false,
};
const concernShadow: PaceShadowActivationReport = { ...safeShadow, concerns: { ...safeShadow.concerns, overPessimism: true }, anyConcern: true };
const goodCapture: CaptureQualitySummary = { totalEvents: 10, taggedEvents: 10, nonLowConfidence: 9, bySource: { manual: 6, gps: 4, inferred: 0 } };

function build(over: Partial<Parameters<typeof buildPersonalPaceDogfoodReadiness>[0]> = {}) {
  return buildPersonalPaceDogfoodReadiness({
    readiness: readyReadiness, shadowReport: safeShadow, optInState: "granted", captureQuality: goodCapture, ...over,
  });
}

describe("buildPersonalPaceDogfoodReadiness — 集約判定", () => {
  it("全 check pass → ready_for_dogfood・blockers なし", () => {
    const r = build();
    expect(r.overall).toBe("ready_for_dogfood");
    expect(r.blockers).toHaveLength(0);
    expect(r.checks).toHaveLength(4);
  });
  it("opt-in 未許可 → not_ready + blocker", () => {
    const r = build({ optInState: "not_asked" });
    expect(r.overall).toBe("not_ready");
    expect(r.checks.find((c) => c.key === "opt_in")?.passed).toBe(false);
  });
  it("★ready_for_activation 区間なし → not_ready（sparse を activation 可にしない）", () => {
    const r = build({ readiness: noActivationReadiness });
    expect(r.overall).toBe("not_ready");
    expect(r.checks.find((c) => c.key === "activation_ready_groups")?.passed).toBe(false);
  });
  it("★shadow 懸念あり → not_ready", () => {
    expect(build({ shadowReport: concernShadow }).overall).toBe("not_ready");
  });
  it("★shadow null（未実行）→ not_ready（安全未確認）", () => {
    const r = build({ shadowReport: null });
    expect(r.checks.find((c) => c.key === "shadow_confirmed_safe")?.passed).toBe(false);
  });
  it("capture 品質不足（tag<8）→ not_ready", () => {
    const r = build({ captureQuality: { totalEvents: 3, taggedEvents: 3, nonLowConfidence: 3, bySource: { manual: 3, gps: 0, inferred: 0 } } });
    expect(r.checks.find((c) => c.key === "capture_quality")?.passed).toBe(false);
  });
  it("★detail に raw pace 値（ratio/friction）を含まない", () => {
    const r = build();
    const joined = r.checks.map((c) => c.detail).join(" ");
    expect(joined).not.toContain("ratio");
    expect(joined).not.toContain("friction");
  });
  it("runbook（watch/rollback）を含む", () => {
    const r = build();
    expect(r.watchItems).toBe(DOGFOOD_WATCH_ITEMS);
    expect(r.rollbackConditions).toBe(DOGFOOD_ROLLBACK_CONDITIONS);
    expect(r.watchItems.length).toBeGreaterThan(0);
    expect(r.rollbackConditions.length).toBeGreaterThan(0);
  });
});

describe("summarizeCaptureQuality", () => {
  const ev = (over: Partial<MovementEvent>): MovementEvent => ({
    actualDepartureAt: null, actualArrivalAt: null, completedAt: null, actualDurationMin: 20, confidence: "high", source: "manual", ...over,
  });
  const store: MovementEventStore = {
    version: MOVEMENT_EVENT_SCHEMA_VERSION,
    byDay: {
      "2026-06-06": { a: ev({ mode: "train" }), b: ev({ source: "gps", confidence: "low" }) },
      "2026-06-07": { c: ev({ mode: "walk", source: "gps" }) },
    },
  };
  it("総数 / tag付 / 非低信頼 / source 別を正しく集約", () => {
    const s = summarizeCaptureQuality(store);
    expect(s.totalEvents).toBe(3);
    expect(s.taggedEvents).toBe(2); // a, c に mode
    expect(s.nonLowConfidence).toBe(2); // b が low
    expect(s.bySource).toEqual({ manual: 1, gps: 2, inferred: 0 });
  });
  it("空 store → ゼロ", () => {
    expect(summarizeCaptureQuality({ version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay: {} }).totalEvents).toBe(0);
  });
});
