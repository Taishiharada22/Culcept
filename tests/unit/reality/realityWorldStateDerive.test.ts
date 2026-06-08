/**
 * R3-2 deriveEmptyDayInput（pure）— WorldState + MemorySynthesis → EmptyDayInput。
 *   energy/weather consume・usableContexts=hint・suppressed→excludedContexts・userIntent placeholder。
 */
import { describe, it, expect } from "vitest";
import { deriveEmptyDayInput } from "@/lib/plan/reality/world-state/world-state-derive";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import type { MemorySynthesis, SynthesizedContext } from "@/lib/plan/reality/learning/memory-synthesis";

function ctx(energy: number, weather: string): ContextSnapshot {
  return { energy: { value: energy, source: "observed" }, weather: { value: weather, source: "observed" } } as unknown as ContextSnapshot;
}
function sc(value: string, over: Partial<SynthesizedContext> = {}): SynthesizedContext {
  return { context: { dimension: "band", value }, leaning: "toward_declining", userVerdict: null, suppressed: false, confidence: "tentative", readiness: "ready", recentEpisodes: 1, totalEpisodes: 2, evidenceCount: 6, notes: [], ...over };
}
function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 600, todaySchedule: [{ startMinute: 660, endMinute: 720, label: "会議", protection: "hard_external" }], availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }], context: ctx(0.4, "rain"), mobility: { typicalTravelBufferMin: 20 }, permissionLevel: 2, ...over };
}

describe("R3-2 deriveEmptyDayInput", () => {
  it("WorldState の各 field を EmptyDayInput に写す（energy/weather consume・schedule→hardConstraints）", () => {
    const synth: MemorySynthesis = { contexts: [sc("evening")], usableContexts: [sc("evening")] };
    const inp = deriveEmptyDayInput(ws(), synth);
    expect(inp.date).toBe("2026-06-20");
    expect(inp.energy).toBe(0.4);
    expect(inp.weather).toBe("rain");
    expect(inp.hardConstraints).toHaveLength(1);
    expect(inp.availableWindows).toHaveLength(1);
    expect(inp.mobility).toEqual({ typicalTravelBufferMin: 20 });
    expect(inp.permissionLevel).toBe(2);
    expect(inp.memoryUsableContexts).toHaveLength(1);
    expect(inp.userIntent).toBeNull();
  });
  it("suppressed context を excludedContexts に明示注入・usableContexts は hint", () => {
    const synth: MemorySynthesis = {
      contexts: [sc("evening"), sc("morning", { suppressed: true, readiness: "insufficient" })],
      usableContexts: [sc("evening")],
    };
    const inp = deriveEmptyDayInput(ws(), synth);
    expect(inp.memoryUsableContexts.map((c) => c.context.value)).toEqual(["evening"]);
    expect(inp.excludedContexts.map((c) => c.value)).toEqual(["morning"]); // suppressed → excluded
  });
  it("userIntent は opts で渡せる（placeholder）", () => {
    const synth: MemorySynthesis = { contexts: [], usableContexts: [] };
    expect(deriveEmptyDayInput(ws(), synth, { userIntent: "easy" }).userIntent).toBe("easy");
  });
  it("context null → energy/weather null", () => {
    const synth: MemorySynthesis = { contexts: [], usableContexts: [] };
    const inp = deriveEmptyDayInput(ws({ context: null }), synth);
    expect(inp.energy).toBeNull();
    expect(inp.weather).toBeNull();
  });
});
