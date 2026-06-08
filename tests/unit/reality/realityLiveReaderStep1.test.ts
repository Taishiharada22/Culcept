/**
 * Live Reader Step 1 — server-only reader code + **fake/injected client tests のみ**（実 staging 読まない）。
 *   M1 readEventRows(column 契約/fail-open) / assembleMemoryItems(fake port) / suppressed 除外 /
 *   assembleWorldState(fake port) / 全組立→pipeline / redaction。
 */
import { describe, it, expect } from "vitest";
import { createSupabasePrmLearningEventReader, type PrmLearningEventReadClient } from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { PRM_LEARNING_EVENT_READ_COLUMNS, type PrmLearningEventReadRow } from "@/lib/plan/reality/learning/prm-learning-event-read";
import { assembleMemoryItems, type MemorySourcePorts } from "@/lib/plan/reality/assembly/memory-assembler";
import { assembleWorldState, type WorldStateSourcePorts } from "@/lib/plan/reality/assembly/world-state-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";
import type { PlanItemSnapshot } from "@/lib/plan/reality/change-set";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";

const NOW = Date.parse("2026-06-20T09:00:00.000Z");
function eventRow(over: Partial<PrmLearningEventReadRow> = {}): PrmLearningEventReadRow {
  return { handle: "h", action: "dismiss", desired_date: "2026-06-05", band: "evening", confidence_band: "medium", duration_min: 60, source_kind: "seed_explicit", acted_at: "2026-06-05T19:00:00.000Z", ...over } as PrmLearningEventReadRow;
}
function tend(over: Partial<SecondSelfTendency> = {}): SecondSelfTendency {
  return { contextDimension: "band", contextValue: "evening", tendencyDirection: "adoption", favoredHypothesis: "now", stillPossible: [], evidenceCount: 6, counterCount: 0, certainty: "tentative", reviewed: true, userCorrection: null, ...over };
}
// M1 reader 用 fake client（select 列を記録・preset response 返却）
function fakeM1Client(response: { data: unknown[] | null; error: { message: string } | null }, rec: { cols?: string; table?: string }): PrmLearningEventReadClient {
  const chain = { select(cols: string) { rec.cols = cols; return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return Promise.resolve(response); } };
  return { from(table: string) { rec.table = table; return chain as never; } };
}

describe("Step1 — M1 readEventRows（fake client・column 契約・fail-open）", () => {
  it("column-restricted select（許可列のみ・禁止列を select しない）", async () => {
    const rec: { cols?: string } = {};
    const r = createSupabasePrmLearningEventReader(fakeM1Client({ data: [eventRow()], error: null }, rec), "u1");
    const rows = await r.readEventRows();
    expect(rec.cols).toBe(PRM_LEARNING_EVENT_READ_COLUMNS);
    expect(rec.cols).not.toMatch(/source_ref|user_id|signal|raw|seed/i); // 禁止列なし
    expect(rows).toHaveLength(1);
  });
  it("error → fail-open []", async () => {
    const r = createSupabasePrmLearningEventReader(fakeM1Client({ data: null, error: { message: "x" } }, {}), "u1");
    expect(await r.readEventRows()).toEqual([]);
  });
});

describe("Step1 — assembleMemoryItems（fake port）", () => {
  const ports = (events: PrmLearningEventReadRow[], tends: SecondSelfTendency[]): MemorySourcePorts => ({
    readEventRows: async () => events,
    readSecondSelfTendencies: async () => tends,
  });
  it("M1→episodic / M3→semantic+preference+procedural", async () => {
    const items = await assembleMemoryItems(ports([eventRow()], [tend()]));
    const k = new Set(items.map((i) => i.kind));
    expect(k.has("episodic")).toBe(true);
    expect(k.has("semantic")).toBe(true);
    expect(k.has("preference")).toBe(true);
    expect(k.has("procedural")).toBe(true);
  });
  it("suppressed(rejected) tendency は除外", async () => {
    const items = await assembleMemoryItems(ports([], [tend({ userCorrection: "rejected" })]));
    expect(items).toHaveLength(0);
  });
  it("port が throw → fail-open（他 source は活きる・壊さない）", async () => {
    const items = await assembleMemoryItems({ readEventRows: async () => { throw new Error("boom"); }, readSecondSelfTendencies: async () => [tend()] });
    expect(items.length).toBeGreaterThan(0); // episodic は空・semantic 等は活きる
    expect(items.every((i) => i.kind !== "episodic")).toBe(true);
  });
});

describe("Step1 — assembleWorldState（fake port）+ 全組立→pipeline", () => {
  const ctx = { energy: { value: 0.6, source: "o" }, weather: { value: "rain", source: "o" } } as unknown as ContextSnapshot;
  const wsPorts: WorldStateSourcePorts = {
    readSchedule: async () => [{ itemId: "m", startMin: 660, endMin: 720, title: "会議:機密", governance: { origin: "user", authority: "user_owned", flexibility: "locked", protectionReasons: ["hard_external"] } } as PlanItemSnapshot],
    readGaps: async () => [{ startTime: "09:00", endTime: "11:00" }, { startTime: "13:00", endTime: "16:00" }],
    readContext: async () => ctx,
  };
  it("port → WorldState（schedule redact・gap→windows・context consume）", async () => {
    const w = await assembleWorldState(wsPorts, "2026-06-20", 540);
    expect(w.todaySchedule[0]!.label).toBeNull(); // redact
    expect(w.todaySchedule[0]!.protection).toBe("hard_external");
    expect(w.availableWindows).toHaveLength(2);
    expect(JSON.stringify(w)).not.toContain("機密");
  });
  it("port throw → fail-open（捏造しない）", async () => {
    const w = await assembleWorldState({ readSchedule: async () => { throw new Error("x"); }, readGaps: async () => [], readContext: async () => null }, "2026-06-20", 540);
    expect(w.todaySchedule).toEqual([]);
    expect(w.availableWindows).toEqual([]);
    expect(w.context).toBeNull();
  });
  it("assembled MemoryItem[] + WorldState → runRealityPipeline（redacted・recommended あり）", async () => {
    const memory = await assembleMemoryItems({ readEventRows: async () => [eventRow()], readSecondSelfTendencies: async () => [tend()] });
    const world = await assembleWorldState(wsPorts, "2026-06-20", 540);
    const env = runRealityPipeline({ memoryItems: memory, worldState: world, permissionLevel: 2, nowMs: NOW });
    expect(env.recommended).not.toBeNull();
    expect(JSON.stringify(env)).not.toMatch(/機密|seed_?ref|personality|怠惰/i);
  });
});
