import { describe, it, expect } from "vitest";
import {
  runPaceShadowActivation,
  isPaceShadowActivationEnabled,
  DAY_REHEARSAL_PACE_SHADOW_ENABLED,
} from "@/lib/plan/mobility/paceShadowActivation";
import { buildRehearsalPaceResolver } from "@/lib/plan/mobility/personalPaceResolver";
import type { RehearsalInput, RehearsalStep, RehearsalTransitionInput } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";
import type { EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";

const ev = (id: string): RehearsalStep["event"] => ({ id, timeBucket: "noon", durationMin: 60, durationAssumed: false, sensitive: false });
const tr = (over: Partial<RehearsalTransitionInput> = {}): RehearsalTransitionInput => ({
  mode: "public_transit", travelMin: 30, travelKnown: true, bufferStatus: "sufficient", slackMin: 60, shortfallMin: null, gapMin: 90, ...over,
});
const input: RehearsalInput = {
  date: "2026-06-08", dayMood: "light", density: "balanced", baseEnergyLevel: null,
  steps: [{ event: ev("a"), transitionAfter: tr() }, { event: ev("b"), transitionAfter: null }],
};
function readyRatio(n: number, over: Partial<PersonalPaceRatioResult> = {}): PersonalPaceRatioResult {
  return { groupKey: `od:g|train`, odKey: "g", mode: "train", status: "ready", medianRatio: 1.5, tendency: "tends_longer", strength: "established", n, ...over };
}
const notEnoughRatio: PersonalPaceRatioResult = { groupKey: "od:x|walk", odKey: "x", mode: "walk", status: "not_enough_signal", n: 2 };
const longer = (): PersonalPaceRatioResult => readyRatio(8);

describe("isPaceShadowActivationEnabled / flag", () => {
  it("flag は default OFF", () => expect(DAY_REHEARSAL_PACE_SHADOW_ENABLED).toBe(false));
  it("default OFF ゆえ enabled は false（production hard block 併用）", () => {
    expect(isPaceShadowActivationEnabled()).toBe(false);
  });
});

describe("runPaceShadowActivation — readiness ゲート", () => {
  it("★not_enough（sparse）→ ran=false・shadow=null・懸念なし（走らせない）", () => {
    const r = runPaceShadowActivation({ rehearsalInput: input, ratios: [notEnoughRatio], resolvePace: () => longer() });
    expect(r.ran).toBe(false);
    expect(r.shadow).toBeNull();
    expect(r.anyConcern).toBe(false);
    expect(r.readinessOverall).toBe("not_enough");
  });
  it("ready_for_activation → ran=true・shadow を返す", () => {
    const r = runPaceShadowActivation({ rehearsalInput: input, ratios: [readyRatio(8)], resolvePace: () => longer() });
    expect(r.ran).toBe(true);
    expect(r.shadow).not.toBeNull();
  });
});

describe("runPaceShadowActivation — 懸念検出", () => {
  it("ready + null resolver（差分なし）→ 懸念なし", () => {
    const r = runPaceShadowActivation({ rehearsalInput: input, ratios: [readyRatio(8)], resolvePace: () => null });
    expect(r.ran).toBe(true);
    expect(r.shadow?.changed).toBe(false);
    expect(r.anyConcern).toBe(false);
  });
  it("★ready + longer（default）→ friction は増えるが clamp で over-change せず（安全＝懸念なし）", () => {
    const r = runPaceShadowActivation({ rehearsalInput: input, ratios: [readyRatio(8)], resolvePace: () => longer() });
    expect(r.shadow?.changed).toBe(true);
    expect(r.concerns.overChange).toBe(false);
    expect(r.concerns.overPessimism).toBe(false);
  });
  it("★閾値極小なら over-change を検出（懸念検出ロジックの確認）", () => {
    const r = runPaceShadowActivation({
      rehearsalInput: input, ratios: [readyRatio(8)], resolvePace: () => longer(),
      shadowConfig: { markerExplosionDelta: 2, overChangeRatio: 0.01 },
    });
    expect(r.concerns.overChange).toBe(true);
    expect(r.anyConcern).toBe(true);
  });
});

describe("buildRehearsalPaceResolver — A1-5/A1-8 共用 resolver", () => {
  const events = [{ anchorId: "home" }, { anchorId: "office" }] as unknown as EventNode[];
  const anchorById = new Map<string, { locationText?: string | null }>([
    ["home", { locationText: "Home" }],
    ["office", { locationText: "Office" }],
  ]);
  const ratios = [readyRatio(8, { groupKey: "leg:home__office|train", odKey: undefined, legKey: "home__office" })];

  it("mode 一致 leg → ready pace を引く（legKey fallback）", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes: { "home__office": "train" }, ratios });
    expect(resolver(0)?.status).toBe("ready");
  });
  it("mode 未選択 → null", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes: {}, ratios });
    expect(resolver(0)).toBeNull();
  });
  it("範囲外 stepIndex → null", () => {
    const resolver = buildRehearsalPaceResolver({ events, anchorById, selectedModes: { "home__office": "train" }, ratios });
    expect(resolver(5)).toBeNull();
  });
});
