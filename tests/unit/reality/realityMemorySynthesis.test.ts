/**
 * R1-7 Memory Synthesis（pure）— 5 種 MemoryItem[] を context 単位に統合し R2 出力契約を作る。
 *   conflict→null・direct user correction 最優先・recency(nowMs)・readiness ゲート・confidence≤tentative・usableContexts。
 */
import { describe, it, expect } from "vitest";
import {
  synthesizeMemory,
  READY_MIN_EVIDENCE,
} from "@/lib/plan/reality/learning/memory-synthesis";
import { buildMemoryItem, type MemoryContext, type MemoryItem, type MemoryLeaning } from "@/lib/plan/reality/learning/memory-model";

const NOW = Date.parse("2026-06-15T00:00:00.000Z");
const ctx = (value: string): MemoryContext => ({ dimension: "band", value });

function semantic(value: string, leaning: MemoryLeaning, evidenceCount: number, over: Partial<Parameters<typeof buildMemoryItem>[0]> = {}): MemoryItem {
  return buildMemoryItem({ kind: "semantic", observation: `obs ${value}`, context: ctx(value), evidenceCount, certainty: "tentative", leaning, source: "prm_model_entry", ...over });
}
function correction(value: string, over: Partial<Parameters<typeof buildMemoryItem>[0]>): MemoryItem {
  return buildMemoryItem({ kind: "correction", observation: `corr ${value}`, context: ctx(value), source: "prm_review_decision", ...over });
}
function episodic(value: string, occurredAtISO: string): MemoryItem {
  return buildMemoryItem({ kind: "episodic", observation: `ep ${value}`, context: ctx(value), evidenceCount: 1, occurredAtISO, source: "prm_learning_event" });
}
const find = (s: ReturnType<typeof synthesizeMemory>, value: string) => s.contexts.find((c) => c.context.value === value)!;

describe("R1-7 synthesizeMemory — grouping & net leaning", () => {
  it("context 単位に group・寄り一致は採用", () => {
    const s = synthesizeMemory([semantic("evening", "toward_declining", 6), semantic("morning", "toward_adopting", 6)], NOW);
    expect(s.contexts).toHaveLength(2);
    expect(find(s, "evening").leaning).toBe("toward_declining");
    expect(find(s, "morning").leaning).toBe("toward_adopting");
  });
  it("矛盾する寄り → leaning null（揺れ）", () => {
    const s = synthesizeMemory([semantic("evening", "toward_adopting", 6), semantic("evening", "toward_declining", 6)], NOW);
    expect(find(s, "evening").leaning).toBeNull();
  });
});

describe("R1-7 direct user correction priority", () => {
  it("rejected → suppressed・readiness insufficient・usable に出ない", () => {
    const s = synthesizeMemory([semantic("evening", "toward_declining", 9), correction("evening", { userCorrection: "rejected" })], NOW);
    const c = find(s, "evening");
    expect(c.suppressed).toBe(true);
    expect(c.userVerdict).toBe("suppress");
    expect(c.readiness).toBe("insufficient");
    expect(c.confidence).toBe("low");
    expect(s.usableContexts.find((x) => x.context.value === "evening")).toBeUndefined();
  });
  it("direction_adjusted → 高証拠でも ready にしない（emerging）", () => {
    const s = synthesizeMemory([semantic("evening", "toward_declining", 9), correction("evening", { userCorrection: "direction_adjusted" })], NOW);
    const c = find(s, "evening");
    expect(c.userVerdict).toBe("adjust_direction");
    expect(c.readiness).toBe("emerging");
  });
  it("verdict 優先: suppress が trust_more に勝つ", () => {
    const s = synthesizeMemory([correction("evening", { userConfirmed: true }), correction("evening", { userCorrection: "rejected" })], NOW);
    expect(find(s, "evening").userVerdict).toBe("suppress");
  });
});

describe("R1-7 readiness ゲート", () => {
  it("高証拠 ∧ leaning ∧ 訂正なし → ready・usable に入る", () => {
    const s = synthesizeMemory([semantic("evening", "toward_declining", READY_MIN_EVIDENCE)], NOW);
    const c = find(s, "evening");
    expect(c.readiness).toBe("ready");
    expect(c.confidence).toBe("tentative");
    expect(s.usableContexts.map((x) => x.context.value)).toContain("evening");
  });
  it("中証拠 → emerging（usable に入らない）", () => {
    const s = synthesizeMemory([semantic("evening", "toward_declining", 3)], NOW);
    expect(find(s, "evening").readiness).toBe("emerging");
    expect(s.usableContexts).toHaveLength(0);
  });
  it("薄い証拠 → insufficient", () => {
    expect(find(synthesizeMemory([semantic("evening", "toward_declining", 1)], NOW), "evening").readiness).toBe("insufficient");
  });
  it("trust_more（confirm）は ready を妨げない", () => {
    const s = synthesizeMemory([semantic("evening", "toward_declining", 6), correction("evening", { userConfirmed: true })], NOW);
    expect(find(s, "evening").readiness).toBe("ready");
  });
});

describe("R1-7 recency & confidence", () => {
  it("episodic を nowMs で recency 加重（窓内のみ recent・総数は total）", () => {
    const s = synthesizeMemory(
      [semantic("evening", "toward_declining", 6), episodic("evening", "2026-06-10T00:00:00.000Z"), episodic("evening", "2026-03-01T00:00:00.000Z")],
      NOW,
    );
    const c = find(s, "evening");
    expect(c.totalEpisodes).toBe(2);
    expect(c.recentEpisodes).toBe(1); // 6/10 は窓内・3/1 は窓外
  });
  it("confidence は常に ≤tentative（high にしない）", () => {
    for (const c of synthesizeMemory([semantic("evening", "toward_declining", 99), correction("evening", { userConfirmed: true })], NOW).contexts) {
      expect(["low", "tentative"]).toContain(c.confidence);
    }
  });
});
