/**
 * R1-3 Correction Memory（pure）— 4 種 signal → MemoryItem(correction) + verdict。
 *   非断定 observation・kind 別 provenance(M2 vs M3)・confirmed は訂正でなく肯定・SecondSelfTendency からの deriver。
 */
import { describe, it, expect } from "vitest";
import {
  correctionVerdict,
  correctionRecordToMemory,
  correctionRecordsToMemory,
  tendenciesToCorrectionRecords,
  type CorrectionRecord,
  type CorrectionKind,
} from "@/lib/plan/reality/learning/memory-correction";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";

function rec(over: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return {
    contextDimension: "band",
    contextValue: "evening",
    tendencyDirection: "non_adoption",
    kind: "direction_adjusted",
    evidenceCount: 6,
    counterCount: 1,
    certainty: "tentative",
    ...over,
  };
}
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

describe("R1-3 correctionVerdict — 実行可能 verdict", () => {
  it("4 種 → trust_more/suppress/adjust_direction/narrow_context", () => {
    expect(correctionVerdict("confirmed")).toBe("trust_more");
    expect(correctionVerdict("rejected")).toBe("suppress");
    expect(correctionVerdict("direction_adjusted")).toBe("adjust_direction");
    expect(correctionVerdict("context_refined")).toBe("narrow_context");
  });
});

describe("R1-3 correctionRecordToMemory", () => {
  it("kind 別 provenance（confirm/reject=M2・direction/context=M3）", () => {
    expect(correctionRecordToMemory(rec({ kind: "confirmed" })).source).toBe("prm_review_decision");
    expect(correctionRecordToMemory(rec({ kind: "rejected" })).source).toBe("prm_review_decision");
    expect(correctionRecordToMemory(rec({ kind: "direction_adjusted" })).source).toBe("prm_model_entry");
    expect(correctionRecordToMemory(rec({ kind: "context_refined" })).source).toBe("prm_model_entry");
  });
  it("confirmed は訂正でなく肯定（userConfirmed=true・userCorrection=null）", () => {
    const m = correctionRecordToMemory(rec({ kind: "confirmed" }));
    expect(m.userConfirmed).toBe(true);
    expect(m.userCorrection).toBeNull();
  });
  it("correct 系は userCorrection を保持・userConfirmed=false", () => {
    const m = correctionRecordToMemory(rec({ kind: "direction_adjusted" }));
    expect(m.userConfirmed).toBe(false);
    expect(m.userCorrection).toBe("direction_adjusted");
    expect(m.kind).toBe("correction");
    expect(m.context).toEqual({ dimension: "band", value: "evening" });
  });
  it("observation は非断定・trait 語なし（全 kind）", () => {
    for (const k of ["confirmed", "rejected", "direction_adjusted", "context_refined"] as CorrectionKind[]) {
      const m = correctionRecordToMemory(rec({ kind: k }));
      expect(memoryObservationHasViolation(m.observation)).toBe(false);
      expect(m.observation).toContain("夜の予定");
    }
  });
  it("correctionRecordsToMemory は全件写す", () => {
    expect(correctionRecordsToMemory([rec(), rec({ kind: "context_refined" })])).toHaveLength(2);
  });
});

describe("R1-3 tendenciesToCorrectionRecords — 既存 read から direction/context を導く", () => {
  it("direction_adjusted / context_refined のみ拾う（null/rejected は M3 read に出ないので拾わない）", () => {
    const recs = tendenciesToCorrectionRecords([
      t({ userCorrection: "direction_adjusted" }),
      t({ contextValue: "morning", userCorrection: "context_refined" }),
      t({ contextValue: "afternoon", userCorrection: null }), // 訂正なし → skip
    ]);
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.kind).sort()).toEqual(["context_refined", "direction_adjusted"]);
  });
  it("訂正なしのみ → 空", () => {
    expect(tendenciesToCorrectionRecords([t(), t({ contextValue: "morning" })])).toEqual([]);
  });
});
