/**
 * R3-1 World State Input Contract（pure）— energy/weather 取り出し(consume) + 正規化。
 */
import { describe, it, expect } from "vitest";
import { worldStateEnergy, worldStateWeather, normalizeWorldState, type WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

function ctx(energy: number | undefined, weather: string | undefined): ContextSnapshot {
  return { energy: energy === undefined ? null : { value: energy, source: "observed" }, weather: weather === undefined ? null : { value: weather, source: "observed" } } as unknown as ContextSnapshot;
}
function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 600, todaySchedule: [], availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }], context: ctx(0.6, "rain"), mobility: null, permissionLevel: 2, ...over };
}

describe("R3-1 worldStateEnergy / worldStateWeather — consume", () => {
  it("ContextSnapshot から energy(0..1 clamp)/weather を取り出す・null 安全", () => {
    expect(worldStateEnergy(ws())).toBe(0.6);
    expect(worldStateEnergy(ws({ context: ctx(1.5, "rain") }))).toBe(1); // clamp
    expect(worldStateEnergy(ws({ context: null }))).toBeNull();
    expect(worldStateEnergy(ws({ context: ctx(undefined, "rain") }))).toBeNull();
    expect(worldStateWeather(ws())).toBe("rain");
    expect(worldStateWeather(ws({ context: null }))).toBeNull();
  });
});

describe("R3-1 normalizeWorldState", () => {
  it("nowMinute/permission clamp・無効 window/schedule 除外", () => {
    const n = normalizeWorldState(ws({
      nowMinute: 2000, permissionLevel: 9 as WorldState["permissionLevel"],
      availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }, { startMinute: 100, endMinute: 50, meaning: null }],
      todaySchedule: [{ startMinute: 660, endMinute: 720, label: null, protection: null }, { startMinute: -5, endMinute: 30, label: null, protection: null }],
    }));
    expect(n.nowMinute).toBe(1440);
    expect(n.permissionLevel).toBe(5);
    expect(n.availableWindows).toHaveLength(1);
    expect(n.todaySchedule).toHaveLength(1);
  });
  it("nowMinute NaN→null", () => {
    expect(normalizeWorldState(ws({ nowMinute: Number.NaN })).nowMinute).toBeNull();
  });
});
