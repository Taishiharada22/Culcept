/**
 * R3-4 World State Fixture Smoke — WorldState → assess + derive → generateEmptyDay end-to-end。
 *   schedule/energy/weather 有無・全 null context・suppressed→excluded が生成まで通る・readiness 整合。pure のみ。
 */
import { describe, it, expect } from "vitest";
import { assessWorldState } from "@/lib/plan/reality/world-state/world-state-readiness";
import { deriveEmptyDayInput } from "@/lib/plan/reality/world-state/world-state-derive";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import { generateEmptyDay } from "@/lib/plan/reality/empty-day/empty-day-generator";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import type { MemorySynthesis, SynthesizedContext } from "@/lib/plan/reality/learning/memory-synthesis";

function ctx(energy: number | undefined, weather: string | undefined): ContextSnapshot {
  return { energy: energy === undefined ? null : { value: energy, source: "observed" }, weather: weather === undefined ? null : { value: weather, source: "observed" } } as unknown as ContextSnapshot;
}
function sc(value: string, over: Partial<SynthesizedContext> = {}): SynthesizedContext {
  return { context: { dimension: "band", value }, leaning: "toward_declining", userVerdict: null, suppressed: false, confidence: "tentative", readiness: "ready", recentEpisodes: 1, totalEpisodes: 2, evidenceCount: 6, notes: [], ...over };
}
function ws(over: Partial<WorldState> = {}): WorldState {
  return {
    date: "2026-06-20", nowMinute: 600,
    todaySchedule: [{ startMinute: 660, endMinute: 720, label: "会議", protection: "hard_external" }],
    availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }, { startMinute: 780, endMinute: 960, meaning: null }],
    context: ctx(0.6, null === null ? undefined : undefined) as ContextSnapshot, mobility: null, permissionLevel: 2, ...over,
  };
}
const synth = (usable: SynthesizedContext[], suppressed: string[] = []): MemorySynthesis => ({
  contexts: [...usable, ...suppressed.map((v) => sc(v, { suppressed: true, readiness: "insufficient" }))],
  usableContexts: usable,
});

describe("R3-4 smoke — WorldState → derive → generateEmptyDay", () => {
  it("通常: readiness と生成が整合・3 案・hard constraints 非接触", () => {
    const w = ws({ context: ctx(0.6, "rain") });
    const r = assessWorldState(w);
    expect(r.overall).toBe("ready");
    const inp = deriveEmptyDayInput(w, synth([sc("morning", { leaning: "toward_adopting" })]));
    const out = generateEmptyDay(inp);
    expect(out.proposals.map((p) => p.tier)).toEqual(["protect", "easy", "push"]);
    for (const p of out.proposals) for (const b of p.blocks) {
      // block は available 窓内・hard constraint(660-720) と非重複
      expect(inp.availableWindows.some((aw) => b.startMinute >= aw.startMinute && b.endMinute <= aw.endMinute)).toBe(true);
      expect(b.startMinute < 720 && 660 < b.endMinute && b.startMinute >= 660).toBe(false);
    }
  });
  it("energy/weather 欠損: partial・neutral で生成は通る", () => {
    const w = ws({ context: ctx(undefined, undefined) });
    expect(assessWorldState(w).overall).toBe("partial");
    const out = generateEmptyDay(deriveEmptyDayInput(w, synth([])));
    expect(out.proposals).toHaveLength(3); // neutral energy で組める
  });
  it("全 null context: 生成は neutral で成立", () => {
    const out = generateEmptyDay(deriveEmptyDayInput(ws({ context: null }), synth([])));
    expect(out.recommended).toBe("protect"); // neutral 0.6 → protect
  });
  it("窓なし: insufficient・生成は空 blocks", () => {
    const w = ws({ availableWindows: [] });
    expect(assessWorldState(w).overall).toBe("insufficient");
    const out = generateEmptyDay(deriveEmptyDayInput(w, synth([])));
    expect(out.proposals.every((p) => p.blocks.length === 0)).toBe(true);
  });
  it("suppressed memory は生成まで影響しない（excluded に回る）", () => {
    const inp = deriveEmptyDayInput(ws({ context: ctx(0.6, "rain") }), synth([sc("morning", { leaning: "toward_adopting" })], ["evening"]));
    expect(inp.excludedContexts.map((c) => c.value)).toEqual(["evening"]);
    const out = generateEmptyDay(inp);
    // evening band の block が memoryLeaning を持たない（suppressed ゆえ hint にならない）
    const eveningBlocks = out.proposals.flatMap((p) => p.blocks).filter((b) => b.band === "evening");
    expect(eveningBlocks.every((b) => b.memoryLeaning === null)).toBe(true);
  });
});
