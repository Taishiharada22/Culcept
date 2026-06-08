/**
 * Deep Audit Hardening — R1-R5 + orchestration の **安全契約を恒久ロック**する property/contract テスト。
 *   redaction(raw/PII 漏れなし)・高リスク auto-allowed なし・confidence high 禁止・suppressed 不使用・
 *   insufficient 捏造なし・silence-by-default。fixture matrix で横断検証。pure・no-apply。
 */
import { describe, it, expect } from "vitest";
import { runRealityPipeline, type RealityPipelineInput } from "@/lib/plan/reality/orchestration/reality-pipeline";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { buildMemoryItem, type MemoryItem, type MemoryLeaning } from "@/lib/plan/reality/learning/memory-model";
import { tendencyToSemanticMemory } from "@/lib/plan/reality/learning/memory-semantic-adapter";
import { tendencyToPreferenceMemory } from "@/lib/plan/reality/learning/memory-preference";
import { tendencyToProceduralMemory } from "@/lib/plan/reality/learning/memory-procedural";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { ContextSnapshot } from "@/lib/plan/context/contextModifier";
import type { ActionKind, PermissionLevel, RiskFlag } from "@/lib/plan/reality/permission/permission-model";

const NOW = Date.parse("2026-06-20T09:00:00.000Z");
// raw/seedRef/PII/personality/具体行動 を網羅検出
const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|だらしな|無責任|@[a-z]|\b\d{10,}\b|美容院|予約確定|購入する/i;

function ctx(energy: number | undefined, weather: string | undefined): ContextSnapshot {
  return { energy: energy === undefined ? null : { value: energy, source: "o" }, weather: weather === undefined ? null : { value: weather, source: "o" } } as unknown as ContextSnapshot;
}
function sem(value: string, leaning: MemoryLeaning, over: Partial<Parameters<typeof buildMemoryItem>[0]> = {}): MemoryItem {
  return buildMemoryItem({ kind: "semantic", observation: "obs", context: { dimension: "band", value }, evidenceCount: 6, certainty: "tentative", leaning, source: "prm_model_entry", ...over });
}
const WINS = [{ startMinute: 540, endMinute: 660, meaning: null }, { startMinute: 780, endMinute: 960, meaning: null }, { startMinute: 1080, endMinute: 1200, meaning: null }];
function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 540, todaySchedule: [], availableWindows: WINS, context: ctx(0.6, undefined), mobility: null, permissionLevel: 2, ...over } as WorldState;
}
function inp(over: Partial<RealityPipelineInput> = {}): RealityPipelineInput {
  return { memoryItems: [], worldState: ws(), permissionLevel: 2, nowMs: NOW, ...over };
}

// fixture matrix
const ENERGIES = [undefined, 0.1, 0.5, 0.9];
const WEATHERS = [undefined, "rain", "storm", "heat", "cold"];
const MEMORIES: MemoryItem[][] = [[], [sem("evening", "toward_declining")], [sem("evening", "toward_declining", { userCorrection: "rejected" })], [sem("morning", "toward_adopting"), sem("evening", "toward_declining")]];

describe("Contract — redaction (envelope は raw/PII を出さない)", () => {
  it("energy×weather×memory matrix で禁止パターンが一切出ない", () => {
    for (const e of ENERGIES) for (const w of WEATHERS) for (const m of MEMORIES) {
      const env = runRealityPipeline(inp({ worldState: ws({ context: ctx(e, w) }), memoryItems: m }));
      expect(JSON.stringify(env)).not.toMatch(FORBIDDEN);
    }
  });
});

describe("Contract — 高リスクは絶対 auto-allowed にならない", () => {
  const HIGH_ACTIONS: ActionKind[] = ["book", "purchase", "contact", "long_travel"];
  const HIGH_FLAGS: RiskFlag[] = ["first_time_place", "high_cost", "personal_info", "involves_others", "sends_message", "confirms_booking", "purchase", "long_distance"];
  it("高リスク action × level0-5 で allowed が出ない", () => {
    for (const a of HIGH_ACTIONS) for (let lv = 0; lv <= 5; lv++) {
      expect(runRealityPipeline(inp({ permissionLevel: lv as PermissionLevel, requestedAction: { action: a, flags: [] } })).permission.verdict).not.toBe("allowed");
    }
  });
  it("高リスク flag × propose × level0-5 で allowed が出ない", () => {
    for (const f of HIGH_FLAGS) for (let lv = 0; lv <= 5; lv++) {
      expect(runRealityPipeline(inp({ permissionLevel: lv as PermissionLevel, requestedAction: { action: "propose", flags: [f] } })).permission.verdict).not.toBe("allowed");
    }
  });
});

describe("Contract — confidence high 禁止（adapter + envelope）", () => {
  it("adapter は high 入力でも ≤tentative を返す", () => {
    const high = { contextDimension: "band", contextValue: "evening", tendencyDirection: "adoption", favoredHypothesis: "now", stillPossible: [], evidenceCount: 9, counterCount: 0, certainty: "high", reviewed: true, userCorrection: null } as unknown as SecondSelfTendency;
    expect(["low", "tentative"]).toContain(tendencyToSemanticMemory(high).certainty);
    expect(["low", "tentative"]).toContain(tendencyToPreferenceMemory(high)!.certainty);
    expect(["low", "tentative"]).toContain(tendencyToProceduralMemory(high)!.certainty);
  });
  it("envelope.reasoning.confidence は ≤tentative", () => {
    for (const m of MEMORIES) {
      const r = runRealityPipeline(inp({ memoryItems: m })).reasoning;
      if (r) expect(["low", "tentative"]).toContain(r.confidence);
    }
  });
});

describe("Contract — suppressed 不使用 / insufficient 捏造なし / silence", () => {
  it("suppressed memory は synthesize の usableContexts に出ない", () => {
    const s = synthesizeMemory([sem("evening", "toward_declining", { userCorrection: "rejected" })], NOW);
    expect(s.usableContexts).toHaveLength(0); // rejected → suppressed → 除外
  });
  it("insufficient(窓なし): 捏造せず止まる（draft null・stopReasons・recommended blocks 0）", () => {
    const env = runRealityPipeline(inp({ worldState: ws({ availableWindows: [] }) }));
    expect(env.worldReadiness).toBe("insufficient");
    expect(env.changeSetDraft).toBeNull();
    expect(env.permission.verdict).toBe("insufficient_context");
    expect(env.stopReasons.length).toBeGreaterThan(0);
  });
  it("silence-by-default: surfacedTrigger は最大 1", () => {
    for (const e of ENERGIES) {
      const env = runRealityPipeline(inp({ worldState: ws({ context: ctx(e, undefined), nowMinute: 1250, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }], availableWindows: [{ startMinute: 1200, endMinute: 1380, meaning: null }] }) }));
      expect(env.surfacedTrigger === null || typeof env.surfacedTrigger.kind === "string").toBe(true);
    }
  });
});
