/**
 * CoAlter AOO Phase B B-3 — `classifySilenceBudgetBucket` invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 axis 1 / §4.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3 / §6 / §9
 *   - 実装: lib/coalter/mirror/buckets/silenceBudgetBucket.ts
 *
 * test 範囲:
 *   - 3 段階分類 (low_0_to_30 / mid_30_to_70 / high_70_to_100)
 *   - 境界値テスト (0.0 / 0.3 / 0.7 / 1.0)
 *   - canProceed: low/mid → true / high → false (Worth Gate fail) / unknown → false
 *   - unknown 経路 / 副作用 / mutation / idempotent / PII 非受理
 *   - discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { classifySilenceBudgetBucket } from "@/lib/coalter/mirror/buckets/silenceBudgetBucket";
import type { SilenceBudgetBucketInput, SilenceBudgetBucketResult } from "@/lib/coalter/mirror/types";

describe("B-3 classifySilenceBudgetBucket — 3 段階分類 (known)", () => {
  it("low_0_to_30: 0.0 / 0.1 / 0.299...", () => {
    for (const v of [0.0, 0.1, 0.29]) {
      const r = classifySilenceBudgetBucket({ silenceBudget: v });
      expect(r.bucket).toBe("low_0_to_30");
      expect(r.canProceedToMirrorDecision).toBe(true);
    }
  });

  it("mid_30_to_70: 0.3 (inclusive) / 0.5 / 0.699...", () => {
    for (const v of [0.3, 0.5, 0.69]) {
      const r = classifySilenceBudgetBucket({ silenceBudget: v });
      expect(r.bucket).toBe("mid_30_to_70");
      expect(r.canProceedToMirrorDecision).toBe(true);
    }
  });

  it("high_70_to_100: 0.7 (inclusive) / 0.85 / 1.0 — canProceed: false (Worth Gate fail)", () => {
    for (const v of [0.7, 0.85, 1.0]) {
      const r = classifySilenceBudgetBucket({ silenceBudget: v });
      expect(r.bucket).toBe("high_70_to_100");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });
});

describe("B-3 classifySilenceBudgetBucket — unknown 経路", () => {
  it("null / undefined / omitted → unknown / canProceed false", () => {
    for (const r of [
      classifySilenceBudgetBucket({ silenceBudget: null }),
      classifySilenceBudgetBucket({ silenceBudget: undefined }),
      classifySilenceBudgetBucket({}),
    ]) {
      expect(r.status).toBe("unknown");
      expect(r.bucket).toBe("unknown");
      expect(r.raw).toBeNull();
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("NaN / Infinity → unknown", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(classifySilenceBudgetBucket({ silenceBudget: v }).status).toBe("unknown");
    }
  });

  it("範囲外 → unknown fail-closed", () => {
    for (const v of [-0.01, -1, 1.01, 5]) {
      expect(classifySilenceBudgetBucket({ silenceBudget: v }).status).toBe("unknown");
    }
  });

  it("型外 → unknown", () => {
    const cases: Array<unknown> = ["0.5", true, {}, []];
    for (const v of cases) {
      const r = classifySilenceBudgetBucket({
        silenceBudget: v as unknown as SilenceBudgetBucketInput["silenceBudget"],
      });
      expect(r.status).toBe("unknown");
    }
  });
});

describe("B-3 classifySilenceBudgetBucket — invariants", () => {
  it("input mutation 0", () => {
    const input: SilenceBudgetBucketInput = { silenceBudget: 0.5 };
    const snapshot = JSON.stringify(input);
    classifySilenceBudgetBucket(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent", () => {
    const input: SilenceBudgetBucketInput = { silenceBudget: 0.85 };
    expect(classifySilenceBudgetBucket(input)).toEqual(classifySilenceBudgetBucket(input));
  });

  it("出力 shape 厳密 4 fields", () => {
    for (const v of [0.5, null, NaN]) {
      const r = classifySilenceBudgetBucket({ silenceBudget: v as number });
      expect(Object.keys(r).sort()).toEqual(
        ["bucket", "canProceedToMirrorDecision", "raw", "status"],
      );
    }
  });

  it("PII 非受理: extra fields は output に leak しない", () => {
    const inputWithPII = {
      silenceBudget: 0.5,
      rawText: "leak",
      userId: "user_pii",
    } as unknown as SilenceBudgetBucketInput;
    const r = classifySilenceBudgetBucket(inputWithPII);
    const json = JSON.stringify(r);
    expect(json).not.toContain("leak");
    expect(json).not.toContain("user_pii");
  });
});

describe("B-3 classifySilenceBudgetBucket — discriminated union narrowing", () => {
  it("known/high_70_to_100 → canProceed === false (Worth Gate fail 型保証)", () => {
    const r: SilenceBudgetBucketResult = classifySilenceBudgetBucket({ silenceBudget: 0.9 });
    if (r.status === "known" && r.bucket === "high_70_to_100") {
      const _proceed: false = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(false);
    } else {
      throw new Error("Expected known/high");
    }
  });

  it("known/low_0_to_30 → canProceed === true", () => {
    const r: SilenceBudgetBucketResult = classifySilenceBudgetBucket({ silenceBudget: 0.1 });
    if (r.status === "known" && r.bucket === "low_0_to_30") {
      const _proceed: true = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(true);
    } else {
      throw new Error("Expected known/low");
    }
  });
});
