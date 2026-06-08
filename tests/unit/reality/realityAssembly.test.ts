/**
 * Assembly — pure adapter 3つ + fixture 全組立。
 *   gap→AvailableWindow / schedule→HardConstraint(redact) / assembleMemoryItemsFromFixture / fakeWorldState →
 *   runRealityPipeline。redaction・suppressed 不使用・high risk auto なし・missing data 捏造なし。pure・no-DB。
 */
import { describe, it, expect } from "vitest";
import { gapNodesToAvailableWindows, hhmmToMinutes } from "@/lib/plan/reality/assembly/daygraph-windows-adapter";
import { snapshotsToHardConstraints } from "@/lib/plan/reality/assembly/schedule-hardconstraint-mapper";
import { assembleMemoryItemsFromFixture, fakeWorldState } from "@/lib/plan/reality/assembly/fixture-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";
import type { PlanItemSnapshot } from "@/lib/plan/reality/change-set";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

const NOW = Date.parse("2026-06-20T09:00:00.000Z");
function tend(over: Partial<SecondSelfTendency> = {}): SecondSelfTendency {
  return { contextDimension: "band", contextValue: "evening", tendencyDirection: "non_adoption", favoredHypothesis: "not_now", stillPossible: [], evidenceCount: 6, counterCount: 0, certainty: "tentative", reviewed: true, userCorrection: null, ...over };
}
const ctx = (energy: number, weather?: string): ContextSnapshot => ({ energy: { value: energy, source: "o" }, weather: weather ? { value: weather, source: "o" } : null } as unknown as ContextSnapshot);

describe("Assembly — gap → AvailableWindow", () => {
  it("HH:MM→分・無効 skip・meaning 既定 null", () => {
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("bad")).toBeNull();
    expect(hhmmToMinutes("25:00")).toBeNull();
    const w = gapNodesToAvailableWindows([{ startTime: "09:00", endTime: "11:00" }, { startTime: "11:00", endTime: "09:00" }, { startTime: "x", endTime: "y" }]);
    expect(w).toEqual([{ startMinute: 540, endMinute: 660, meaning: null }]); // 逆転/不正 skip
  });
  it("meaningOf resolver で meaning 注入（捏造しない＝注入時のみ）", () => {
    const w = gapNodesToAvailableWindows([{ startTime: "09:00", endTime: "10:00" }], () => "recovery");
    expect(w[0]!.meaning).toBe("recovery");
  });
});

describe("Assembly — schedule → HardConstraint(redact)", () => {
  it("label は redact(null)・protection は governance 由来・時刻欠損 skip", () => {
    const snaps: PlanItemSnapshot[] = [
      { itemId: "a", startMin: 660, endMin: 720, title: "田中さんとランチ", governance: { origin: "user", authority: "user_owned", flexibility: "locked", protectionReasons: ["hard_external"] } },
      { itemId: "b", title: "no time" }, // 時刻欠損 → skip
    ];
    const hc = snapshotsToHardConstraints(snaps);
    expect(hc).toHaveLength(1);
    expect(hc[0]!.label).toBeNull(); // raw title 漏れなし
    expect(hc[0]!.protection).toBe("hard_external");
    expect(JSON.stringify(hc)).not.toContain("田中"); // redact 確認
  });
});

describe("Assembly — fixture 全組立 → pipeline", () => {
  it("assembleMemoryItemsFromFixture: M3 tendency → semantic/preference/procedural", () => {
    const items = assembleMemoryItemsFromFixture({ tendencies: [tend({ tendencyDirection: "adoption" })] });
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.has("semantic")).toBe(true);
    expect(kinds.has("preference")).toBe(true);
    expect(kinds.has("procedural")).toBe(true); // adoption → procedural
  });
  it("suppressed(rejected) tendency は MemoryItem を生まない（不使用）", () => {
    expect(assembleMemoryItemsFromFixture({ tendencies: [tend({ userCorrection: "rejected" })] })).toHaveLength(0);
  });
  it("fakeWorldState → runRealityPipeline: redacted envelope・recommended あり", () => {
    const ws = fakeWorldState({
      date: "2026-06-20", nowMinute: 540,
      gaps: [{ startTime: "09:00", endTime: "11:00" }, { startTime: "13:00", endTime: "16:00" }],
      schedule: [{ itemId: "m", startMin: 660, endMin: 720, title: "会議:機密", governance: { origin: "user", authority: "user_owned", flexibility: "locked", protectionReasons: ["hard_external"] } }],
      context: ctx(0.6, "rain"),
    });
    const env = runRealityPipeline({ memoryItems: assembleMemoryItemsFromFixture({ tendencies: [tend()] }), worldState: ws, permissionLevel: 2, nowMs: NOW });
    expect(env.recommended).not.toBeNull();
    expect(env.changeSetDraft).not.toBeNull();
    expect(JSON.stringify(env)).not.toMatch(/機密|田中|seed_?ref|personality/i); // redaction
  });
  it("high risk action は auto-allowed にならない", () => {
    const ws = fakeWorldState({ date: "2026-06-20", nowMinute: 540, gaps: [{ startTime: "09:00", endTime: "11:00" }] });
    const env = runRealityPipeline({ memoryItems: [], worldState: ws, permissionLevel: 5, nowMs: NOW, requestedAction: { action: "book", flags: ["confirms_booking"] } });
    expect(env.permission.verdict).not.toBe("allowed");
  });
  it("missing data(gap なし): 捏造せず insufficient・draft null・stopReasons", () => {
    const ws = fakeWorldState({ date: "2026-06-20", nowMinute: 540, gaps: [] });
    const env = runRealityPipeline({ memoryItems: [], worldState: ws, permissionLevel: 2, nowMs: NOW });
    expect(env.worldReadiness).toBe("insufficient");
    expect(env.changeSetDraft).toBeNull();
    expect(env.permission.verdict).toBe("insufficient_context");
    expect(env.stopReasons.length).toBeGreaterThan(0);
  });
});
