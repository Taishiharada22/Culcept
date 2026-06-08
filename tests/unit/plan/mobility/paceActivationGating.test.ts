import { describe, it, expect } from "vitest";
import { buildRehearsalPaceResolver } from "@/lib/plan/mobility/personalPaceResolver";
import { isPersonalPaceReflectionEnabled } from "@/lib/plan/dayRehearsal/personalPaceAdapter";
import { DEFAULT_PACE_READINESS_CONFIG } from "@/lib/plan/mobility/paceActivationReadiness";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";
import type { EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";

const events = [{ anchorId: "home" }, { anchorId: "office" }] as unknown as EventNode[];
const anchorById = new Map<string, { locationText?: string | null }>([
  ["home", { locationText: "Home" }],
  ["office", { locationText: "Office" }],
]);
const selectedModes = { "home__office": "train" } as const;
// leg-keyed ready group（resolver は legKey fallback で引く）
function legReady(n: number): PersonalPaceRatioResult {
  return { groupKey: "leg:home__office|train", mode: "train", status: "ready", legKey: "home__office", medianRatio: 1.3, tendency: "tends_longer", strength: n >= 5 ? "established" : "emerging", n };
}

describe("isPersonalPaceReflectionEnabled — 実反映 gate（production hard block）", () => {
  it("flag default OFF ゆえ false（dogfood/dev のみ ON 可・production は常に false）", () => {
    expect(isPersonalPaceReflectionEnabled()).toBe(false);
  });
});

describe("buildRehearsalPaceResolver — ★A1-10 per-group activation gating", () => {
  it("activationReadyOnly なし: ready(n=4=ready_for_shadow)でも反映（既存挙動）", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes, ratios: [legReady(4)] });
    expect(resolver(0)?.status).toBe("ready");
  });
  it("★activationReadyOnly: ready_for_activation(n≥8)は反映", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes, ratios: [legReady(8)], activationReadyOnly: true });
    expect(resolver(0)?.n).toBe(8);
  });
  it("★activationReadyOnly: ready_for_shadow(n=4)は反映しない（null）", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes, ratios: [legReady(4)], activationReadyOnly: true });
    expect(resolver(0)).toBeNull();
  });
  it("activationReadyOnly: 既定閾値は DEFAULT_PACE_READINESS_CONFIG.minForActivation(8)", () => {
    const r7 = buildRehearsalPaceResolver({ events, anchorById, selectedModes, ratios: [legReady(7)], activationReadyOnly: true });
    const r8 = buildRehearsalPaceResolver({ events, anchorById, selectedModes, ratios: [legReady(8)], activationReadyOnly: true });
    expect(r7(0)).toBeNull(); // 7 < 8
    expect(r8(0)).not.toBeNull(); // 8 ≥ 8
    expect(DEFAULT_PACE_READINESS_CONFIG.minForActivation).toBe(8);
  });
  it("minForActivation を下げると ready_for_shadow も反映可（閾値分離の確認）", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes, ratios: [legReady(4)], activationReadyOnly: true, minForActivation: 3 });
    expect(resolver(0)?.n).toBe(4);
  });
});
