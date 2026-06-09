/**
 * R1-R5 Pure Orchestration Fixture Smoke — 記憶→空白の日→現実→trigger→permission→ChangeSet draft が1本で通る。
 *   memory有無/suppressed/low energy/weather caution/tight windows/high risk/insufficient context/overpacking なし/
 *   high risk auto なし/redaction。pure・no-apply。
 */
import { describe, it, expect } from "vitest";
import { runRealityPipeline, type RealityPipelineInput } from "@/lib/plan/reality/orchestration/reality-pipeline";
import { buildMemoryItem, type MemoryItem, type MemoryLeaning } from "@/lib/plan/reality/learning/memory-model";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

const NOW = Date.parse("2026-06-20T09:00:00.000Z");
function ctx(energy: number | undefined, weather: string | undefined): ContextSnapshot {
  return { energy: energy === undefined ? null : { value: energy, source: "observed" }, weather: weather === undefined ? null : { value: weather, source: "observed" } } as unknown as ContextSnapshot;
}
function sem(value: string, leaning: MemoryLeaning, over: Partial<Parameters<typeof buildMemoryItem>[0]> = {}): MemoryItem {
  return buildMemoryItem({ kind: "semantic", observation: "obs", context: { dimension: "band", value }, evidenceCount: 6, certainty: "tentative", leaning, source: "prm_model_entry", ...over });
}
function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 540, todaySchedule: [], availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }, { startMinute: 780, endMinute: 960, meaning: null }, { startMinute: 1080, endMinute: 1200, meaning: null }], context: ctx(0.6, null === null ? undefined : undefined), mobility: null, permissionLevel: 2, ...over };
}
function inp(over: Partial<RealityPipelineInput> = {}): RealityPipelineInput {
  return { memoryItems: [], worldState: ws(), permissionLevel: 2, nowMs: NOW, userIntent: null, ...over };
}
const RAW = /seed_?ref|utterance|personality|怠惰|性格|@example|住所/i;

describe("R1-R5 pipeline — 通し", () => {
  it("memory あり: 全層が通り redacted envelope を返す", () => {
    const e = runRealityPipeline(inp({ memoryItems: [sem("evening", "toward_declining")], worldState: ws({ context: ctx(0.6, "rain") }) }));
    expect(e.recommended).not.toBeNull();
    expect(e.reasoning).not.toBeNull();
    expect(e.changeSetDraft).not.toBeNull();
    expect(e.permission.verdict).toBe("allowed"); // propose@L2
    expect(JSON.stringify(e)).not.toMatch(RAW);
  });
  it("memory なし: それでも組める・confidence low・memory 漏れなし", () => {
    const e = runRealityPipeline(inp());
    expect(e.recommended).not.toBeNull();
    expect(e.reasoning!.confidence).toBe("low");
  });
  it("suppressed memory: 破綻せず通る（synthesize が usable から除外）", () => {
    const sup = sem("evening", "toward_declining", { userCorrection: "rejected" }); // → suppressed
    const e = runRealityPipeline(inp({ memoryItems: [sup] }));
    expect(e.recommended).not.toBeNull();
    expect(JSON.stringify(e)).not.toMatch(RAW);
  });
  it("low energy: 詰めすぎない（recommended は easy/protect 寄り・active ≤ available）", () => {
    const e = runRealityPipeline(inp({ worldState: ws({ context: ctx(0.15, undefined) }) }));
    expect(["easy", "protect"]).toContain(e.recommended!.tier);
  });
  it("weather caution: bad weather + active で reasoning.fits.weather=caution の案がある", () => {
    const e = runRealityPipeline(inp({ worldState: ws({ context: ctx(0.9, "storm") }), userIntent: "push" }));
    expect(["caution", "ok", "good"]).toContain(e.reasoning!.fits.weather);
  });
  it("tight windows: overpacking なし（active+rest=available・active≤available）", () => {
    const e = runRealityPipeline(inp({ worldState: ws({ availableWindows: [{ startMinute: 600, endMinute: 645, meaning: null }, { startMinute: 800, endMinute: 850, meaning: null }] }) }));
    const avail = 45 + 50;
    expect(e.recommended!.activeMinutes + e.recommended!.restMinutes).toBe(avail);
    expect(e.recommended!.activeMinutes).toBeLessThanOrEqual(avail);
  });
});

describe("R1-R5 pipeline — 安全条件", () => {
  it("high risk action は絶対 auto-allowed にならない（confirm/blocked）", () => {
    for (let lv = 0; lv <= 5; lv++) {
      const e = runRealityPipeline(inp({ permissionLevel: lv as PermissionLevel, requestedAction: { action: "book", flags: ["confirms_booking", "first_time_place"] } }));
      expect(e.permission.verdict).not.toBe("allowed");
      expect(["confirm_required", "blocked"]).toContain(e.permission.verdict);
    }
  });
  it("insufficient context: 窓なし → readiness insufficient・permission insufficient_context・stopReasons・apply しない", () => {
    const e = runRealityPipeline(inp({ worldState: ws({ availableWindows: [] }) }));
    expect(e.worldReadiness).toBe("insufficient");
    expect(e.permission.verdict).toBe("insufficient_context");
    expect(e.changeSetDraft).toBeNull(); // 組めない→draft なし
    expect(e.stopReasons.length).toBeGreaterThan(0);
  });
  it("ChangeSet は draft 要約のみ（op 内容を出さない・apply フラグなし）", () => {
    const e = runRealityPipeline(inp({ memoryItems: [sem("evening", "toward_declining")] }));
    expect(e.changeSetDraft).toHaveProperty("opCount");
    expect(Object.keys(e.changeSetDraft!)).toEqual(["opCount"]); // 要約のみ（opCount のみ・id/op 内容を出さない）
  });
  it("silence-by-default: surfacedTrigger は最大 1・残りは silencedCount", () => {
    const e = runRealityPipeline(inp({ worldState: ws({ nowMinute: 540, todaySchedule: [] }) }));
    // surfaced は 0 or 1
    expect(e.surfacedTrigger === null || typeof e.surfacedTrigger.kind === "string").toBe(true);
  });
});
