/**
 * CoAlter AOO Phase B B-3 — `classifyPatternCategoryBucket` invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §9.3 / §6.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3 / §7 / §9.3
 *   - 実装: lib/coalter/mirror/buckets/patternCategoryBucket.ts
 *
 * test 範囲:
 *   - 5 bucket 値マッピング (null_pattern / safety_concern / rupture_signal_high /
 *     rupture_signal_mild / unknown_category)
 *   - null と undefined の区別 (null = null_pattern / undefined = unknown_category)
 *   - canProceed 設計 (B-0 plan §9.3):
 *       null_pattern / rupture_signal_mild → true
 *       safety_concern / rupture_signal_high / unknown_category → false
 *   - Phase A raw "rupture_signal" (severity 不明) → unknown_category fail-closed
 *   - 不明 string / 型外 → unknown_category fail-closed
 *   - 副作用 / mutation / idempotent / PII 非受理
 *   - discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { classifyPatternCategoryBucket } from "@/lib/coalter/mirror/buckets/patternCategoryBucket";
import type { PatternCategoryBucketInput, PatternCategoryBucketResult } from "@/lib/coalter/mirror/types";

describe("B-3 classifyPatternCategoryBucket — 5 値マッピング (canProceed 込み)", () => {
  it("null → null_pattern / canProceed: true (通常評価)", () => {
    const r = classifyPatternCategoryBucket({ category: null });
    expect(r.status).toBe("known");
    expect(r.bucket).toBe("null_pattern");
    expect(r.canProceedToMirrorDecision).toBe(true);
  });

  it('"null_pattern" 明示 → null_pattern / canProceed: true', () => {
    const r = classifyPatternCategoryBucket({ category: "null_pattern" });
    expect(r.bucket).toBe("null_pattern");
    expect(r.canProceedToMirrorDecision).toBe(true);
  });

  it('"rupture_signal_mild" → rupture_signal_mild / canProceed: true (Repair Mirror 候補)', () => {
    const r = classifyPatternCategoryBucket({ category: "rupture_signal_mild" });
    expect(r.bucket).toBe("rupture_signal_mild");
    expect(r.canProceedToMirrorDecision).toBe(true);
  });

  it('"safety_concern" → safety_concern / canProceed: false (Phase B 全期間発話禁止)', () => {
    const r = classifyPatternCategoryBucket({ category: "safety_concern" });
    expect(r.status).toBe("known");
    expect(r.bucket).toBe("safety_concern");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it('"rupture_signal_high" → rupture_signal_high / canProceed: false (STAY_SILENT)', () => {
    const r = classifyPatternCategoryBucket({ category: "rupture_signal_high" });
    expect(r.bucket).toBe("rupture_signal_high");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it('"unknown_category" → unknown_category / canProceed: false (Observe Gate fail)', () => {
    const r = classifyPatternCategoryBucket({ category: "unknown_category" });
    expect(r.status).toBe("unknown");
    expect(r.bucket).toBe("unknown_category");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });
});

describe("B-3 classifyPatternCategoryBucket — null vs undefined 区別", () => {
  it("null = 明示的 'pattern なし' → null_pattern / canProceed: true", () => {
    const r = classifyPatternCategoryBucket({ category: null });
    expect(r.bucket).toBe("null_pattern");
    expect(r.canProceedToMirrorDecision).toBe(true);
  });

  it("undefined = 'caller が情報を持っていない' → unknown_category / canProceed: false", () => {
    const r = classifyPatternCategoryBucket({ category: undefined });
    expect(r.status).toBe("unknown");
    expect(r.bucket).toBe("unknown_category");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it("input field omitted → unknown_category (undefined と同じ)", () => {
    const r = classifyPatternCategoryBucket({});
    expect(r.bucket).toBe("unknown_category");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });
});

describe("B-3 classifyPatternCategoryBucket — Phase A raw / 不明値 fail-closed", () => {
  it('Phase A raw "rupture_signal" (severity 不明) → unknown_category fail-closed', () => {
    // B-3 mirror bucket は caller が severity を判定済の前提。"rupture_signal" 単体は受理しない
    const r = classifyPatternCategoryBucket({
      category: "rupture_signal" as unknown as PatternCategoryBucketInput["category"],
    });
    expect(r.status).toBe("unknown");
    expect(r.bucket).toBe("unknown_category");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it("不明 string (typo / 不正値) → unknown_category fail-closed", () => {
    const cases = ["safety", "rupture", "safety_concer", "RUPTURE_SIGNAL_HIGH", "Safety_Concern", ""];
    for (const v of cases) {
      const r = classifyPatternCategoryBucket({
        category: v as unknown as PatternCategoryBucketInput["category"],
      });
      expect(r.status).toBe("unknown");
      expect(r.bucket).toBe("unknown_category");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("型外 (number / boolean / object / array) → unknown_category fail-closed", () => {
    const cases: Array<unknown> = [0, 1, true, false, {}, [], 3.14];
    for (const v of cases) {
      const r = classifyPatternCategoryBucket({
        category: v as unknown as PatternCategoryBucketInput["category"],
      });
      expect(r.status).toBe("unknown");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });
});

describe("B-3 classifyPatternCategoryBucket — invariants", () => {
  it("input mutation 0", () => {
    const input: PatternCategoryBucketInput = { category: "safety_concern" };
    const snapshot = JSON.stringify(input);
    classifyPatternCategoryBucket(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent", () => {
    const input: PatternCategoryBucketInput = { category: "rupture_signal_mild" };
    expect(classifyPatternCategoryBucket(input)).toEqual(classifyPatternCategoryBucket(input));
  });

  it("出力 shape: known は 3 fields / unknown も 3 fields (raw なし)", () => {
    const validInputs: PatternCategoryBucketInput["category"][] = [
      null,
      "null_pattern",
      "safety_concern",
      "rupture_signal_high",
      "rupture_signal_mild",
      "unknown_category",
      undefined,
    ];
    for (const c of validInputs) {
      const r = classifyPatternCategoryBucket({ category: c });
      expect(Object.keys(r).sort()).toEqual(["bucket", "canProceedToMirrorDecision", "status"]);
    }
  });

  it("PII 非受理: extra fields は output に leak しない", () => {
    const inputWithPII = {
      category: "safety_concern" as const,
      rawText: "leak",
      userId: "user_pii",
      pairStateId: "pair_pii",
      matchedPatternRaw: "safety:suicide_keyword",
    } as unknown as PatternCategoryBucketInput;
    const r = classifyPatternCategoryBucket(inputWithPII);
    const json = JSON.stringify(r);
    for (const sentinel of ["leak", "user_pii", "pair_pii", "matchedPatternRaw", "safety:suicide_keyword"]) {
      expect(json).not.toContain(sentinel);
    }
  });
});

describe("B-3 classifyPatternCategoryBucket — discriminated union narrowing", () => {
  it("known/safety_concern → canProceed === false (型保証)", () => {
    const r: PatternCategoryBucketResult = classifyPatternCategoryBucket({ category: "safety_concern" });
    if (r.status === "known" && r.bucket === "safety_concern") {
      const _proceed: false = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(false);
    } else {
      throw new Error("Expected known/safety_concern");
    }
  });

  it("known/rupture_signal_mild → canProceed === true (Repair candidate 型保証)", () => {
    const r: PatternCategoryBucketResult = classifyPatternCategoryBucket({ category: "rupture_signal_mild" });
    if (r.status === "known" && r.bucket === "rupture_signal_mild") {
      const _proceed: true = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(true);
    } else {
      throw new Error("Expected known/rupture_signal_mild");
    }
  });

  it("known/null_pattern → canProceed === true", () => {
    const r: PatternCategoryBucketResult = classifyPatternCategoryBucket({ category: null });
    if (r.status === "known" && r.bucket === "null_pattern") {
      const _proceed: true = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(true);
    } else {
      throw new Error("Expected known/null_pattern");
    }
  });

  it("unknown/unknown_category → canProceed === false", () => {
    const r: PatternCategoryBucketResult = classifyPatternCategoryBucket({ category: undefined });
    if (r.status === "unknown") {
      const _bucket: "unknown_category" = r.bucket;
      const _proceed: false = r.canProceedToMirrorDecision;
      expect(_bucket).toBe("unknown_category");
      expect(_proceed).toBe(false);
    } else {
      throw new Error("Expected unknown");
    }
  });
});
