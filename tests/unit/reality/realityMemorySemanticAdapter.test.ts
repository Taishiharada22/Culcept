/**
 * R1-2 Semantic Memory Adapter（pure）— SecondSelfTendency → MemoryItem(semantic)。
 *   非断定 observation・文脈束縛・certainty≤tentative・rejected 除外・provenance。
 */
import { describe, it, expect } from "vitest";
import {
  tendencyToSemanticMemory,
  tendenciesToSemanticMemory,
} from "@/lib/plan/reality/learning/memory-semantic-adapter";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";

function t(over: Partial<SecondSelfTendency> = {}): SecondSelfTendency {
  return {
    contextDimension: "band",
    contextValue: "evening",
    tendencyDirection: "non_adoption",
    favoredHypothesis: "not_now",
    stillPossible: ["not_selected"],
    evidenceCount: 6,
    counterCount: 1,
    certainty: "tentative",
    reviewed: true,
    userCorrection: null,
    ...over,
  };
}

describe("R1-2 tendencyToSemanticMemory", () => {
  it("semantic MemoryItem へ写す（文脈束縛・provenance・certainty 保持）", () => {
    const m = tendencyToSemanticMemory(t());
    expect(m.kind).toBe("semantic");
    expect(m.context).toEqual({ dimension: "band", value: "evening" });
    expect(m.certainty).toBe("tentative");
    expect(m.evidenceCount).toBe(6);
    expect(m.source).toBe("prm_model_entry");
    expect(m.observation).toContain("夜の予定");
    expect(m.observation).toContain("見送り");
  });
  it("observation は非断定・trait 語なし（全 direction）", () => {
    for (const d of ["adoption", "non_adoption", "deferral"] as const) {
      const m = tendencyToSemanticMemory(t({ tendencyDirection: d }));
      expect(memoryObservationHasViolation(m.observation)).toBe(false);
    }
  });
  it("high 等が来ても certainty は ≤tentative に cap", () => {
    const m = tendencyToSemanticMemory(t({ certainty: "high" as unknown as SecondSelfTendency["certainty"] }));
    expect(m.certainty).toBe("tentative");
  });
});

describe("R1-2 tendenciesToSemanticMemory", () => {
  it("rejected は semantic から除外（本人否定の傾向を一般傾向にしない）", () => {
    const out = tendenciesToSemanticMemory([
      t({ contextValue: "evening" }),
      t({ contextValue: "morning", userCorrection: "rejected" }),
      t({ contextValue: "afternoon", userCorrection: "direction_adjusted" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.context.value).sort()).toEqual(["afternoon", "evening"]);
  });
  it("空 → 空", () => {
    expect(tendenciesToSemanticMemory([])).toEqual([]);
  });
});
