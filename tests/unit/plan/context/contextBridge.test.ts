import { describe, it, expect } from "vitest";
import {
  buildDayContextSnapshot,
  contextToDecisionContext,
  buildContextOutlook,
} from "@/lib/plan/context/contextBridge";
import { buildContextModifier, type ContextSnapshot } from "@/lib/plan/context/contextModifier";

describe("buildDayContextSnapshot — day-level 一次情報 → snapshot", () => {
  it("density は常に observed で載る", () => {
    const s = buildDayContextSnapshot({ density: "packed", baseEnergyLevel: null, travelMinutes: [] });
    expect(s.density).toEqual({ value: "packed", source: "observed" });
  });
  it("energy: null → 載せない / 非null → derived", () => {
    expect(buildDayContextSnapshot({ density: "balanced", baseEnergyLevel: null, travelMinutes: [] }).energy).toBeUndefined();
    expect(buildDayContextSnapshot({ density: "balanced", baseEnergyLevel: 0.2, travelMinutes: [] }).energy).toEqual({ value: 0.2, source: "derived" });
  });
  it("★travelLoad: 既知 0 件 → 載せない（捏造しない）", () => {
    expect(buildDayContextSnapshot({ density: "balanced", baseEnergyLevel: null, travelMinutes: [null, null] }).travelLoad).toBeUndefined();
  });
  it("travelLoad: 合計で light(<30)/moderate(30-89)/heavy(>=90)・既知のみ合計", () => {
    expect(buildDayContextSnapshot({ density: "balanced", baseEnergyLevel: null, travelMinutes: [10, null, 15] }).travelLoad?.value).toBe("light"); // 25
    expect(buildDayContextSnapshot({ density: "balanced", baseEnergyLevel: null, travelMinutes: [30, 20] }).travelLoad?.value).toBe("moderate"); // 50
    expect(buildDayContextSnapshot({ density: "balanced", baseEnergyLevel: null, travelMinutes: [60, 40] }).travelLoad?.value).toBe("heavy"); // 100
  });
  it("★round-trip: packed + 低 energy → modifier が tighter", () => {
    const s = buildDayContextSnapshot({ density: "packed", baseEnergyLevel: 0.15, travelMinutes: [50] });
    expect(buildContextModifier(s).overallTilt).toBe("tighter_than_usual");
  });
});

describe("contextToDecisionContext — mobility への投影", () => {
  it("weather なし → {}", () => {
    expect(contextToDecisionContext({})).toEqual({});
  });
  it("★source 不明の weather → 渡さない（断定回避）", () => {
    expect(contextToDecisionContext({ weather: { value: "rain", source: "unknown" } })).toEqual({});
  });
  it("rain(observed) → {weather:'rain'} / heat → {weather:'heat'}", () => {
    expect(contextToDecisionContext({ weather: { value: "rain", source: "observed" } })).toEqual({ weather: "rain" });
    expect(contextToDecisionContext({ weather: { value: "heat", source: "user" } })).toEqual({ weather: "heat" });
  });
  it("★A2-8: snow/storm(observed) → そのまま投影（屋外負担 note 対象）", () => {
    expect(contextToDecisionContext({ weather: { value: "snow", source: "observed" } })).toEqual({ weather: "snow" });
    expect(contextToDecisionContext({ weather: { value: "storm", source: "observed" } })).toEqual({ weather: "storm" });
  });
  it("cold / normal → {weather:'normal'}（屋外負担 note を出させない）", () => {
    expect(contextToDecisionContext({ weather: { value: "cold", source: "observed" } })).toEqual({ weather: "normal" });
    expect(contextToDecisionContext({ weather: { value: "normal", source: "observed" } })).toEqual({ weather: "normal" });
  });
});

describe("buildContextOutlook — UI view-model（render は A2-3）", () => {
  it("reasonLine / softenConfidence / knownSignalCount を渡す", () => {
    const s: ContextSnapshot = { density: { value: "packed", source: "observed" }, positionInDay: { value: "late", source: "observed" } };
    const m = buildContextModifier(s);
    const o = buildContextOutlook(m);
    expect(o.reasonLine).toContain("余白");
    expect(o.softenConfidence).toBe(m.widenUncertainty);
    expect(o.knownSignalCount).toBe(m.knownSignalCount);
  });
  it("条件なし → reasonLine null・softenConfidence false", () => {
    const o = buildContextOutlook(buildContextModifier({}));
    expect(o.reasonLine).toBeNull();
    expect(o.softenConfidence).toBe(false);
  });
});
