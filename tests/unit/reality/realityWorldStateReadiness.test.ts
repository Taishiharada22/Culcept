/**
 * R3-3 World State Readiness（pure）— 欠損を捏造せず flag・field 別・overall・非断定 notes。
 */
import { describe, it, expect } from "vitest";
import { assessWorldState } from "@/lib/plan/reality/world-state/world-state-readiness";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

function ctx(energy: number | undefined, weather: string | undefined): ContextSnapshot {
  return { energy: energy === undefined ? null : { value: energy, source: "observed" }, weather: weather === undefined ? null : { value: weather, source: "observed" } } as unknown as ContextSnapshot;
}
function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 600, todaySchedule: [], availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }], context: ctx(0.6, "rain"), mobility: null, permissionLevel: 2, ...over };
}
const ASSERT = /あなたは.*です|必ず|絶対|すべきだ/;

describe("R3-3 assessWorldState", () => {
  it("窓なし → insufficient + note（組めない）", () => {
    const r = assessWorldState(ws({ availableWindows: [] }));
    expect(r.overall).toBe("insufficient");
    expect(r.fields.windows).toBe("missing");
    expect(r.notes.join("")).toContain("空き時間");
  });
  it("窓+energy+weather 揃う → ready", () => {
    expect(assessWorldState(ws()).overall).toBe("ready");
  });
  it("窓あり+energy 欠損 → partial + note（捏造しない）", () => {
    const r = assessWorldState(ws({ context: ctx(undefined, "rain") }));
    expect(r.overall).toBe("partial");
    expect(r.fields.energy).toBe("missing");
    expect(r.notes.join("")).toContain("コンディション");
  });
  it("field status と now/mobility 欠損を flag", () => {
    const r = assessWorldState(ws({ nowMinute: null, mobility: null }));
    expect(r.fields.now).toBe("missing");
    expect(r.fields.mobility).toBe("missing");
  });
  it("notes は非断定", () => {
    expect(assessWorldState(ws({ availableWindows: [], context: ctx(undefined, undefined) })).notes.join(" ")).not.toMatch(ASSERT);
  });
});
