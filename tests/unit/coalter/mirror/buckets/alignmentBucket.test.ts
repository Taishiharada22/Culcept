/**
 * CoAlter AOO Phase B B-3 — `classifyAlignmentBucket` invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 axis 4
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3
 *   - 実装: lib/coalter/mirror/buckets/alignmentBucket.ts
 *
 * test 範囲:
 *   - 5 段階分類 (strongly_negative / negative / neutral / positive / strongly_positive)
 *   - 境界値テスト (-1 / -0.6 / -0.2 / 0.2 / 0.6 / 1.0)
 *   - unknown 経路 (null / undefined / NaN / Infinity / -Infinity / 範囲外 / 型外)
 *   - 副作用 / mutation / idempotent invariant
 *   - PII 非受理 (output に extra leak なし)
 *   - discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { classifyAlignmentBucket } from "@/lib/coalter/mirror/buckets/alignmentBucket";
import type { AlignmentBucketInput, AlignmentBucketResult } from "@/lib/coalter/mirror/types";

describe("B-3 classifyAlignmentBucket — 5 段階分類 (known)", () => {
  it("strongly_negative: -1.0", () => {
    const r = classifyAlignmentBucket({ alignmentSignal: -1.0 });
    expect(r.status).toBe("known");
    expect(r.bucket).toBe("strongly_negative");
    expect(r.raw).toBe(-1.0);
    expect(r.canProceedToMirrorDecision).toBe(true);
  });

  it("strongly_negative: -0.6 (boundary inclusive)", () => {
    const r = classifyAlignmentBucket({ alignmentSignal: -0.6 });
    expect(r.bucket).toBe("strongly_negative");
  });

  it("negative: -0.6+ε to -0.2", () => {
    for (const v of [-0.59, -0.4, -0.21, -0.2]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      expect(r.bucket).toBe(v > -0.2 ? "neutral" : v <= -0.6 ? "strongly_negative" : "negative");
    }
    expect(classifyAlignmentBucket({ alignmentSignal: -0.5 }).bucket).toBe("negative");
  });

  it("neutral: -0.2+ε to 0.2", () => {
    for (const v of [-0.19, 0, 0.1, 0.2]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      expect(r.bucket).toBe("neutral");
    }
  });

  it("positive: 0.2+ε to 0.6", () => {
    for (const v of [0.21, 0.5, 0.6]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      expect(r.bucket).toBe("positive");
    }
  });

  it("strongly_positive: 0.6+ε to 1.0", () => {
    for (const v of [0.61, 0.8, 1.0]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      expect(r.bucket).toBe("strongly_positive");
    }
  });

  it("known all → canProceedToMirrorDecision === true (alignment はすべての level で proceed 可)", () => {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      expect(r.canProceedToMirrorDecision).toBe(true);
    }
  });
});

describe("B-3 classifyAlignmentBucket — unknown 経路 (fail-closed)", () => {
  it("null → unknown / canProceed false", () => {
    const r = classifyAlignmentBucket({ alignmentSignal: null });
    expect(r.status).toBe("unknown");
    expect(r.bucket).toBe("unknown");
    expect(r.raw).toBeNull();
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it("undefined → unknown / canProceed false", () => {
    const r = classifyAlignmentBucket({ alignmentSignal: undefined });
    expect(r.status).toBe("unknown");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it("input that omits field → unknown", () => {
    const r = classifyAlignmentBucket({});
    expect(r.status).toBe("unknown");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it("NaN → unknown", () => {
    const r = classifyAlignmentBucket({ alignmentSignal: NaN });
    expect(r.status).toBe("unknown");
    expect(r.canProceedToMirrorDecision).toBe(false);
  });

  it("Infinity / -Infinity → unknown", () => {
    expect(classifyAlignmentBucket({ alignmentSignal: Infinity }).status).toBe("unknown");
    expect(classifyAlignmentBucket({ alignmentSignal: -Infinity }).status).toBe("unknown");
  });

  it("範囲外 (x < -1 || x > 1) → unknown fail-closed", () => {
    for (const v of [-1.01, -2, 1.01, 2, 100, -100]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      expect(r.status).toBe("unknown");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("型外 (string / object) → unknown fail-closed", () => {
    const cases: Array<unknown> = ["0.5", "1", true, false, {}, [], "abc"];
    for (const v of cases) {
      const r = classifyAlignmentBucket({
        alignmentSignal: v as unknown as AlignmentBucketInput["alignmentSignal"],
      });
      expect(r.status).toBe("unknown");
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });
});

describe("B-3 classifyAlignmentBucket — invariants (pure / mutation / idempotent / shape / PII)", () => {
  it("input mutation 0 (input object 不変)", () => {
    const input: AlignmentBucketInput = { alignmentSignal: 0.5 };
    const snapshot = JSON.stringify(input);
    classifyAlignmentBucket(input);
    classifyAlignmentBucket(input);
    classifyAlignmentBucket(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent (同一入力 → 構造的等価)", () => {
    const input: AlignmentBucketInput = { alignmentSignal: 0.8 };
    const r1 = classifyAlignmentBucket(input);
    const r2 = classifyAlignmentBucket(input);
    expect(r1).toEqual(r2);
  });

  it("出力 shape 厳密 4 fields (status / bucket / raw / canProceedToMirrorDecision)", () => {
    for (const v of [0.5, null, NaN]) {
      const r = classifyAlignmentBucket({ alignmentSignal: v as number });
      expect(Object.keys(r).sort()).toEqual(
        ["bucket", "canProceedToMirrorDecision", "raw", "status"],
      );
    }
  });

  it("triple-equivalence: status / bucket / canProceed 関係性", () => {
    const knownInputs = [0.0, 0.5, -0.5, 1.0, -1.0];
    for (const v of knownInputs) {
      const r = classifyAlignmentBucket({ alignmentSignal: v });
      const byStatus = r.status === "known";
      const byBucket = r.bucket !== "unknown";
      const byProceed = r.canProceedToMirrorDecision === true;
      expect(byStatus).toBe(byBucket);
      expect(byBucket).toBe(byProceed);
    }

    const unknownInputs: Array<unknown> = [null, undefined, NaN, Infinity, 2, -2, "foo"];
    for (const v of unknownInputs) {
      const r = classifyAlignmentBucket({
        alignmentSignal: v as unknown as AlignmentBucketInput["alignmentSignal"],
      });
      expect(r.status).toBe("unknown");
      expect(r.bucket).toBe("unknown");
      expect(r.raw).toBeNull();
      expect(r.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("PII 非受理: extra fields は型外で leak しない", () => {
    const inputWithPII = {
      alignmentSignal: 0.5,
      rawText: "user message leak",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      sessionId: "session_pii",
    } as unknown as AlignmentBucketInput;
    const r = classifyAlignmentBucket(inputWithPII);
    const json = JSON.stringify(r);
    for (const sentinel of ["rawText", "messageId", "userId", "pairStateId", "sessionId", "user message leak", "msg_pii", "user_pii", "pair_pii", "session_pii"]) {
      expect(json).not.toContain(sentinel);
    }
  });
});

describe("B-3 classifyAlignmentBucket — discriminated union narrowing", () => {
  it("status === 'known' で bucket が non-unknown literal に narrow", () => {
    const r: AlignmentBucketResult = classifyAlignmentBucket({ alignmentSignal: 0.5 });
    if (r.status === "known") {
      const _bucket: "strongly_negative" | "negative" | "neutral" | "positive" | "strongly_positive" = r.bucket;
      const _raw: number = r.raw;
      const _proceed: true = r.canProceedToMirrorDecision;
      expect(_bucket).toBe("positive");
      expect(_raw).toBe(0.5);
      expect(_proceed).toBe(true);
    } else {
      throw new Error("Expected known");
    }
  });

  it("status === 'unknown' で raw === null / canProceed === false 型保証", () => {
    const r: AlignmentBucketResult = classifyAlignmentBucket({ alignmentSignal: null });
    if (r.status === "unknown") {
      const _bucket: "unknown" = r.bucket;
      const _raw: null = r.raw;
      const _proceed: false = r.canProceedToMirrorDecision;
      expect(_bucket).toBe("unknown");
      expect(_raw).toBeNull();
      expect(_proceed).toBe(false);
    } else {
      throw new Error("Expected unknown");
    }
  });
});
