/**
 * CoAlter AOO Phase B B-3 — `classifyUncertaintyBucket` invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 axis 5 / §4.3
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3 / §6 / §9
 *   - 実装: lib/coalter/mirror/buckets/uncertaintyBucket.ts
 *
 * test 範囲:
 *   - 3 段階分類 (low_0_to_30 / mid_30_to_70 / high_70_to_100)
 *   - 境界値テスト (0.0 / 0.3 / 0.7 / 1.0)
 *   - canProceed 設計: low/mid → true / high → false (Safe Gate fail) / unknown → false
 *   - unknown 経路 (null / undefined / NaN / Infinity / 範囲外 / 型外)
 *   - 副作用 / mutation / idempotent invariant
 *   - PII 非受理
 *   - discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { classifyUncertaintyBucket } from "@/lib/coalter/mirror/buckets/uncertaintyBucket";
import type { UncertaintyBucketInput, UncertaintyBucketResult } from "@/lib/coalter/mirror/types";

describe("B-3 classifyUncertaintyBucket — 3 段階分類 (known)", () => {
  it("low_0_to_30: 0.0 / 0.1 / 0.299...", () => {
    for (const v of [0.0, 0.1, 0.2, 0.29]) {
      const r = classifyUncertaintyBucket({ uncertainty: v });
      expect(r.status).toBe("known");
      expect(r.bucket).toBe("low_0_to_30");
      expect(r.raw).toBe(v);
      expect(r.canProceedToMirrorDecision).toBe(true);
    }
  });

  it("mid_30_to_70: 0.3 (boundary inclusive) / 0.5 / 0.699...", () => {
    for (const v of [0.3, 0.5, 0.69]) {
      const r = classifyUncertaintyBucket({ uncertainty: v });
      expect(r.status).toBe("known");
      expect(r.bucket).toBe("mid_30_to_70");
      expect(r.canProceedToMirrorDecision).toBe(true);
    }
  });

  it("high_70_to_100: 0.7 (boundary inclusive) / 0.85 / 1.0 — canProceed: false (Safe Gate fail)", () => {
    for (const v of [0.7, 0.85, 1.0]) {
      const r = classifyUncertaintyBucket({ uncertainty: v });
      expect(r.status).toBe("known");
      expect(r.bucket).toBe("high_70_to_100");
      expect(r.raw).toBe(v);
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });
});

describe("B-3 classifyUncertaintyBucket — unknown 経路 (fail-closed)", () => {
  it("null / undefined / omitted field → unknown / canProceed false", () => {
    for (const r of [
      classifyUncertaintyBucket({ uncertainty: null }),
      classifyUncertaintyBucket({ uncertainty: undefined }),
      classifyUncertaintyBucket({}),
    ]) {
      expect(r.status).toBe("unknown");
      expect(r.bucket).toBe("unknown");
      expect(r.raw).toBeNull();
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("NaN / Infinity / -Infinity → unknown", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = classifyUncertaintyBucket({ uncertainty: v });
      expect(r.status).toBe("unknown");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("範囲外 (x < 0 || x > 1) → unknown fail-closed", () => {
    for (const v of [-0.01, -1, 1.01, 2, 100]) {
      const r = classifyUncertaintyBucket({ uncertainty: v });
      expect(r.status).toBe("unknown");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("型外 (string / object / boolean) → unknown fail-closed", () => {
    const cases: Array<unknown> = ["0.5", "high", true, {}, []];
    for (const v of cases) {
      const r = classifyUncertaintyBucket({
        uncertainty: v as unknown as UncertaintyBucketInput["uncertainty"],
      });
      expect(r.status).toBe("unknown");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });
});

describe("B-3 classifyUncertaintyBucket — invariants", () => {
  it("input mutation 0", () => {
    const input: UncertaintyBucketInput = { uncertainty: 0.5 };
    const snapshot = JSON.stringify(input);
    classifyUncertaintyBucket(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent", () => {
    const input: UncertaintyBucketInput = { uncertainty: 0.85 };
    expect(classifyUncertaintyBucket(input)).toEqual(classifyUncertaintyBucket(input));
  });

  it("出力 shape 厳密 4 fields", () => {
    for (const v of [0.5, null, NaN]) {
      const r = classifyUncertaintyBucket({ uncertainty: v as number });
      expect(Object.keys(r).sort()).toEqual(
        ["bucket", "canProceedToMirrorDecision", "raw", "status"],
      );
    }
  });

  it("PII 非受理: extra fields は output に leak しない", () => {
    const inputWithPII = {
      uncertainty: 0.5,
      rawText: "leak this",
      messageId: "msg_id",
      pairStateId: "pair",
    } as unknown as UncertaintyBucketInput;
    const r = classifyUncertaintyBucket(inputWithPII);
    const json = JSON.stringify(r);
    expect(json).not.toContain("leak this");
    expect(json).not.toContain("msg_id");
    expect(json).not.toContain("pair");
  });
});

describe("B-3 classifyUncertaintyBucket — discriminated union narrowing", () => {
  it("status === 'known' / bucket === 'low_0_to_30' で canProceed === true", () => {
    const r: UncertaintyBucketResult = classifyUncertaintyBucket({ uncertainty: 0.1 });
    if (r.status === "known" && r.bucket === "low_0_to_30") {
      const _proceed: true = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(true);
    } else {
      throw new Error("Expected known/low_0_to_30");
    }
  });

  it("status === 'known' / bucket === 'high_70_to_100' で canProceed === false (型保証)", () => {
    const r: UncertaintyBucketResult = classifyUncertaintyBucket({ uncertainty: 0.85 });
    if (r.status === "known" && r.bucket === "high_70_to_100") {
      const _proceed: false = r.canProceedToMirrorDecision;
      expect(_proceed).toBe(false);
    } else {
      throw new Error("Expected known/high_70_to_100");
    }
  });

  it("status === 'unknown' で raw === null / canProceed === false", () => {
    const r: UncertaintyBucketResult = classifyUncertaintyBucket({ uncertainty: null });
    if (r.status === "unknown") {
      const _raw: null = r.raw;
      const _proceed: false = r.canProceedToMirrorDecision;
      expect(_raw).toBeNull();
      expect(_proceed).toBe(false);
    } else {
      throw new Error("Expected unknown");
    }
  });
});
