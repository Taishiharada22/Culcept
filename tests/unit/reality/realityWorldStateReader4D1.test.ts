/**
 * 4-D1 Full WorldState Reader Wiring（server-only・**fake client tests のみ**・実 read なし）。
 *   column-restricted 契約・anchor→schedule→WorldState・interval-complement windows・context null・sensitive redact・
 *   invalid skip・fail-open・WorldState+memory→pipeline redacted。
 */
import { describe, it, expect } from "vitest";
import { createSupabaseWorldStateSourcePorts } from "@/lib/plan/reality/assembly/supabase-worldstate-source-ports";
import { assembleWorldState } from "@/lib/plan/reality/assembly/world-state-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";
import { ANCHOR_COLUMNS_SQL, type ColumnRestrictedAnchorRow } from "@/lib/plan/reality/integration/dev-runtime-adapter";

const NOW = Date.parse("2026-06-20T09:00:00.000Z");
function arow(over: Partial<ColumnRestrictedAnchorRow> = {}): ColumnRestrictedAnchorRow {
  return { id: "a1", start_time: "11:00", end_time: "12:00", rigidity: "hard", sensitive_category: null, ...over };
}
function fakeClient(rows: ColumnRestrictedAnchorRow[], rec: { cols?: string } = {}, error: { message: string } | null = null) {
  const chain = { select(c: string) { rec.cols = c; return chain; }, eq() { return chain; }, limit() { return Promise.resolve({ data: error ? null : rows, error }); } };
  return { from() { return chain as never; } };
}
const ports = (rows: ColumnRestrictedAnchorRow[], rec = {}, error: { message: string } | null = null) =>
  createSupabaseWorldStateSourcePorts(fakeClient(rows, rec, error), "u1", "2026-06-20");

describe("4-D1 wiring — column 契約 / schedule", () => {
  it("column-restricted select（ANCHOR_COLUMNS_SQL・title/raw なし）", async () => {
    const rec: { cols?: string } = {};
    await ports([arow()], rec).readSchedule();
    expect(rec.cols).toBe(ANCHOR_COLUMNS_SQL);
    expect(rec.cols).not.toMatch(/title|location|raw|\*/i);
  });
  it("readSchedule → PlanItemSnapshot（title 持ち込まない）", async () => {
    const snaps = await ports([arow()]).readSchedule();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.startMin).toBe(660);
    expect(snaps[0]!.title).toBeUndefined();
  });
});

describe("4-D1 assembleWorldState（anchor path）", () => {
  it("todaySchedule + interval-complement windows + context null", async () => {
    const ws = await assembleWorldState(ports([arow()]), "2026-06-20", 540);
    expect(ws.todaySchedule).toHaveLength(1);
    expect(ws.todaySchedule[0]!.label).toBeNull();
    expect(ws.context).toBeNull(); // server で読めない
    expect(ws.availableWindows).toEqual([{ startMinute: 360, endMinute: 660, meaning: null }, { startMinute: 720, endMinute: 1380, meaning: null }]); // 660-720 を除く終日
  });
  it("sensitive anchor: 出力に raw 値が漏れない", async () => {
    const ws = await assembleWorldState(ports([arow({ rigidity: "soft", sensitive_category: "medical" })]), "2026-06-20", 540);
    expect(JSON.stringify(ws)).not.toContain("medical");
    expect(ws.todaySchedule[0]!.protection).toBe("user_declared"); // sensitive→governance のみ
  });
  it("invalid time → skip（捏造しない）", async () => {
    expect((await assembleWorldState(ports([arow({ start_time: "bad" })]), "2026-06-20", 540)).todaySchedule).toHaveLength(0);
  });
  it("reader error → fail-open（schedule 空・終日 1 窓）", async () => {
    const ws = await assembleWorldState(ports([], {}, { message: "boom" }), "2026-06-20", 540);
    expect(ws.todaySchedule).toEqual([]);
    expect(ws.availableWindows).toEqual([{ startMinute: 360, endMinute: 1380, meaning: null }]);
  });
});

describe("4-D1 WorldState + memory → pipeline", () => {
  it("assembled WorldState を pipeline に通す（redacted・recommended あり）", async () => {
    const ws = await assembleWorldState(ports([arow({ rigidity: "soft", sensitive_category: "medical" })]), "2026-06-20", 540);
    const env = runRealityPipeline({ memoryItems: [], worldState: ws, permissionLevel: 2, nowMs: NOW });
    expect(env.recommended).not.toBeNull();
    expect(JSON.stringify(env)).not.toMatch(/medical|seed_?ref|personality|怠惰/i);
  });
});
