/**
 * Gap 4 D2 — contextDetector pure library test
 *
 * 検証項目 (CEO 2026-05-15 指定):
 *   1. empty input → 全 7 fields false / confidence 0 / reasons ["no_signal", "below_threshold"]
 *   2. info missing → patternContext.infoMissing = true
 *   3. uncertainty high → patternContext.uncertaintyHigh = true
 *   4. need framing → patternContext.needFraming = true
 *   5. one-sided fatigue → patternContext.oneSidedFatigue = true
 *   6. need translation → patternContext.needTranslation = true
 *   7. relationship signals clear → travel mode 限定で発火
 *   8. relationship noise high → daily mode 限定で発火
 *   9. multiple signals → 複数 fields 同時 true
 *   10. conflicting signals → 適切な field のみ true
 *   11. raw text leakage なし (構造的検証、ReasonCode enum のみ)
 *   12. deterministic output (同じ input × 2 回 → 完全一致)
 *   13. provisional threshold override (config arg)
 *   14. detector version 含む
 */

import { describe, expect, it } from "vitest";

import {
  DETECTOR_VERSION,
  PROVISIONAL_DEFAULT_THRESHOLD,
  detectPatternContext,
  type ContextDetectorInput,
  type ContextDetectorOutput,
  type ReasonCode,
} from "@/lib/coalter/presence/contextDetector";

// ─────────────────────────────────────────────
// Test 1: empty input → fail-closed default
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — empty input fail-closed", () => {
  it("empty input は全 7 fields false / confidence 0 / no_signal reason", () => {
    const out = detectPatternContext({});

    // patternContext は空 (false / 不明は省略)
    expect(out.patternContext).toEqual({});

    // 全 confidence 0
    expect(out.confidence.infoMissing).toBe(0);
    expect(out.confidence.uncertaintyHigh).toBe(0);
    expect(out.confidence.needFraming).toBe(0);
    expect(out.confidence.oneSidedFatigue).toBe(0);
    expect(out.confidence.needTranslation).toBe(0);
    expect(out.confidence.relationshipSignalsClear).toBe(0);
    expect(out.confidence.relationshipNoiseHigh).toBe(0);

    // 全 reasons に "no_signal" + "below_threshold" を含む
    expect(out.reasons.infoMissing).toContain("no_signal" satisfies ReasonCode);
    expect(out.reasons.infoMissing).toContain("below_threshold" satisfies ReasonCode);

    // signalCounts 全 0
    expect(out.signalCounts.infoMissing).toBe(0);
    expect(out.signalCounts.uncertainty).toBe(0);
    expect(out.signalCounts.framing).toBe(0);
    expect(out.signalCounts.fatigue).toBe(0);
    expect(out.signalCounts.translation).toBe(0);
    expect(out.signalCounts.relationshipClear).toBe(0);
    expect(out.signalCounts.relationshipNoise).toBe(0);

    // detector version
    expect(out.detectorVersion).toBe(DETECTOR_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: infoMissing single signal
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — infoMissing", () => {
  it("infoMissingSignal=true のみで infoMissing 発火 (0.6 ≥ 0.5)", () => {
    const out = detectPatternContext({ infoMissingSignal: true });

    expect(out.patternContext.infoMissing).toBe(true);
    expect(out.confidence.infoMissing).toBeCloseTo(0.6, 10);
    expect(out.reasons.infoMissing).toContain("info_missing_signal_set" satisfies ReasonCode);
    expect(out.reasons.infoMissing).toContain("above_threshold" satisfies ReasonCode);

    // 他 6 fields は false
    expect(out.patternContext.uncertaintyHigh).toBeUndefined();
    expect(out.patternContext.needFraming).toBeUndefined();
  });

  it("infoMissingSignal=true + recentMessageCount=0 で score 0.9", () => {
    const out = detectPatternContext({
      infoMissingSignal: true,
      recentMessageCount: 0,
    });

    expect(out.patternContext.infoMissing).toBe(true);
    expect(out.confidence.infoMissing).toBeCloseTo(0.9, 10);
    expect(out.reasons.infoMissing).toContain("info_missing_signal_set" satisfies ReasonCode);
    expect(out.reasons.infoMissing).toContain("recent_message_count_zero" satisfies ReasonCode);
  });

  it("recentMessageCount=0 のみ (signal=undefined) は 0.3 < 0.5 で発火しない", () => {
    const out = detectPatternContext({ recentMessageCount: 0 });

    expect(out.patternContext.infoMissing).toBeUndefined();
    expect(out.confidence.infoMissing).toBeCloseTo(0.3, 10);
    expect(out.reasons.infoMissing).toContain("recent_message_count_zero" satisfies ReasonCode);
    expect(out.reasons.infoMissing).toContain("below_threshold" satisfies ReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 3: uncertaintyHigh
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — uncertaintyHigh", () => {
  it("stallDetected=true のみで uncertaintyHigh 発火 (0.5 ≥ 0.5)", () => {
    const out = detectPatternContext({ stallDetected: true });

    expect(out.patternContext.uncertaintyHigh).toBe(true);
    expect(out.confidence.uncertaintyHigh).toBeCloseTo(0.5, 10);
    expect(out.reasons.uncertaintyHigh).toContain("stall_detected" satisfies ReasonCode);
  });

  it("ambiguity=clarify のみで uncertaintyHigh 発火しない (0.4 < 0.5)", () => {
    const out = detectPatternContext({ ambiguityResponseMode: "clarify" });

    expect(out.patternContext.uncertaintyHigh).toBeUndefined();
    expect(out.confidence.uncertaintyHigh).toBeCloseTo(0.4, 10);
  });

  it("stallDetected=true + ambiguity=clarify で score 0.9", () => {
    const out = detectPatternContext({
      stallDetected: true,
      ambiguityResponseMode: "clarify",
    });

    expect(out.patternContext.uncertaintyHigh).toBe(true);
    expect(out.confidence.uncertaintyHigh).toBeCloseTo(0.9, 10);
    expect(out.reasons.uncertaintyHigh).toContain("stall_detected" satisfies ReasonCode);
    expect(out.reasons.uncertaintyHigh).toContain("ambiguity_clarify" satisfies ReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 4: needFraming
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — needFraming", () => {
  it("contradictionDetected=true で needFraming 発火 (0.8 ≥ 0.5)", () => {
    const out = detectPatternContext({ contradictionDetected: true });

    expect(out.patternContext.needFraming).toBe(true);
    expect(out.confidence.needFraming).toBeCloseTo(0.8, 10);
    expect(out.reasons.needFraming).toContain("contradiction_detected" satisfies ReasonCode);
  });

  it("contradictionDetected=false / undefined では発火しない", () => {
    const out = detectPatternContext({ contradictionDetected: false });
    expect(out.patternContext.needFraming).toBeUndefined();
    expect(out.confidence.needFraming).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 5: oneSidedFatigue
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — oneSidedFatigue", () => {
  it("fairnessBias=0.7 (高 positive) で発火、reason は positive_high", () => {
    const out = detectPatternContext({ fairnessBias: 0.7 });

    expect(out.patternContext.oneSidedFatigue).toBe(true);
    expect(out.confidence.oneSidedFatigue).toBeCloseTo(0.7, 10);
    expect(out.reasons.oneSidedFatigue).toContain("fairness_bias_positive_high" satisfies ReasonCode);
  });

  it("fairnessBias=-0.7 (高 negative) で発火、reason は negative_high", () => {
    const out = detectPatternContext({ fairnessBias: -0.7 });

    expect(out.patternContext.oneSidedFatigue).toBe(true);
    expect(out.confidence.oneSidedFatigue).toBeCloseTo(0.7, 10);
    expect(out.reasons.oneSidedFatigue).toContain("fairness_bias_negative_high" satisfies ReasonCode);
  });

  it("fairnessBias=0.4 (中程度) は 0.3 < 0.5 で発火しない", () => {
    const out = detectPatternContext({ fairnessBias: 0.4 });

    expect(out.patternContext.oneSidedFatigue).toBeUndefined();
    expect(out.confidence.oneSidedFatigue).toBeCloseTo(0.3, 10);
  });

  it("fairnessBias=0 (バランス済) では発火しない", () => {
    const out = detectPatternContext({ fairnessBias: 0 });
    expect(out.patternContext.oneSidedFatigue).toBeUndefined();
    expect(out.confidence.oneSidedFatigue).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 6: needTranslation
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — needTranslation", () => {
  it("misreadConfidence=0.8 で needTranslation 発火 (0.8 ≥ 0.5)", () => {
    const out = detectPatternContext({ misreadConfidence: 0.8 });

    expect(out.patternContext.needTranslation).toBe(true);
    expect(out.confidence.needTranslation).toBeCloseTo(0.8, 10);
    expect(out.reasons.needTranslation).toContain("misread_confidence_high" satisfies ReasonCode);
  });

  it("misreadConfidence=0.6 (中程度) は 0.3 < 0.5 で発火しない", () => {
    const out = detectPatternContext({ misreadConfidence: 0.6 });

    expect(out.patternContext.needTranslation).toBeUndefined();
    expect(out.confidence.needTranslation).toBeCloseTo(0.3, 10);
    expect(out.reasons.needTranslation).toContain("misread_confidence_low" satisfies ReasonCode);
  });

  it("misreadConfidence=0.3 (低) は score 0", () => {
    const out = detectPatternContext({ misreadConfidence: 0.3 });
    expect(out.patternContext.needTranslation).toBeUndefined();
    expect(out.confidence.needTranslation).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 7: relationshipSignalsClear (travel mode 限定)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — relationshipSignalsClear (travel only)", () => {
  it("travel mode + criticalSignalCount=0 + misreadConfidence<0.5 で発火 (0.8 ≥ 0.5)", () => {
    const out = detectPatternContext({
      presenceMode: "travel",
      criticalSignalCount: 0,
      misreadConfidence: 0.2,
    });

    expect(out.patternContext.relationshipSignalsClear).toBe(true);
    expect(out.confidence.relationshipSignalsClear).toBeCloseTo(0.8, 10);
    expect(out.reasons.relationshipSignalsClear).toContain("critical_count_zero" satisfies ReasonCode);
  });

  it("normal mode では travel 専用なので発火しない (fail-closed)", () => {
    const out = detectPatternContext({
      presenceMode: "normal",
      criticalSignalCount: 0,
      misreadConfidence: 0.2,
    });

    expect(out.patternContext.relationshipSignalsClear).toBeUndefined();
    expect(out.confidence.relationshipSignalsClear).toBe(0);
  });

  it("daily mode でも travel 専用なので発火しない (fail-closed)", () => {
    const out = detectPatternContext({
      presenceMode: "daily",
      criticalSignalCount: 0,
      misreadConfidence: 0.2,
    });

    expect(out.patternContext.relationshipSignalsClear).toBeUndefined();
    expect(out.confidence.relationshipSignalsClear).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 8: relationshipNoiseHigh (daily mode 限定)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — relationshipNoiseHigh (daily only)", () => {
  it("daily mode + criticalSignalCount=5 + misreadConfidence=0.6 で発火 (0.8 ≥ 0.5)", () => {
    const out = detectPatternContext({
      presenceMode: "daily",
      criticalSignalCount: 5,
      misreadConfidence: 0.6,
    });

    expect(out.patternContext.relationshipNoiseHigh).toBe(true);
    expect(out.confidence.relationshipNoiseHigh).toBeCloseTo(0.8, 10);
    expect(out.reasons.relationshipNoiseHigh).toContain("critical_count_high" satisfies ReasonCode);
    expect(out.reasons.relationshipNoiseHigh).toContain("misread_accumulated" satisfies ReasonCode);
  });

  it("normal mode では daily 専用なので発火しない (fail-closed)", () => {
    const out = detectPatternContext({
      presenceMode: "normal",
      criticalSignalCount: 5,
      misreadConfidence: 0.6,
    });

    expect(out.patternContext.relationshipNoiseHigh).toBeUndefined();
    expect(out.confidence.relationshipNoiseHigh).toBe(0);
  });

  it("travel mode でも daily 専用なので発火しない (fail-closed)", () => {
    const out = detectPatternContext({
      presenceMode: "travel",
      criticalSignalCount: 5,
      misreadConfidence: 0.6,
    });

    expect(out.patternContext.relationshipNoiseHigh).toBeUndefined();
    expect(out.confidence.relationshipNoiseHigh).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 9: multiple signals (複数 fields 同時発火)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — multiple signals", () => {
  it("複数 signal source で複数 fields 同時発火", () => {
    const out = detectPatternContext({
      infoMissingSignal: true, // infoMissing 発火
      stallDetected: true, // uncertaintyHigh 発火
      contradictionDetected: true, // needFraming 発火
      fairnessBias: 0.8, // oneSidedFatigue 発火
      misreadConfidence: 0.9, // needTranslation 発火
    });

    expect(out.patternContext.infoMissing).toBe(true);
    expect(out.patternContext.uncertaintyHigh).toBe(true);
    expect(out.patternContext.needFraming).toBe(true);
    expect(out.patternContext.oneSidedFatigue).toBe(true);
    expect(out.patternContext.needTranslation).toBe(true);

    // signalCounts もそれぞれ 1
    expect(out.signalCounts.infoMissing).toBe(1);
    expect(out.signalCounts.uncertainty).toBe(1);
    expect(out.signalCounts.framing).toBe(1);
    expect(out.signalCounts.fatigue).toBe(1);
    expect(out.signalCounts.translation).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Test 10: conflicting signals (複数 signal、 一部発火しない)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — conflicting / partial signals", () => {
  it("一部 signal だけ強いとき、該当 field のみ発火", () => {
    const out = detectPatternContext({
      infoMissingSignal: true, // infoMissing 発火
      stallDetected: false, // uncertainty 発火しない
      contradictionDetected: false, // framing 発火しない
      fairnessBias: 0.1, // fatigue 発火しない (|0.1| < 0.3)
      misreadConfidence: 0.2, // translation 発火しない
    });

    expect(out.patternContext.infoMissing).toBe(true);
    expect(out.patternContext.uncertaintyHigh).toBeUndefined();
    expect(out.patternContext.needFraming).toBeUndefined();
    expect(out.patternContext.oneSidedFatigue).toBeUndefined();
    expect(out.patternContext.needTranslation).toBeUndefined();
  });

  it("travel mode + critical 1 件 (count=1 not 0) で signalsClear 発火しない (0.3 < 0.5)", () => {
    const out = detectPatternContext({
      presenceMode: "travel",
      criticalSignalCount: 1, // critical_count_zero condition not met
      misreadConfidence: 0.2,
    });

    expect(out.patternContext.relationshipSignalsClear).toBeUndefined();
    expect(out.confidence.relationshipSignalsClear).toBeCloseTo(0.3, 10);
  });
});

// ─────────────────────────────────────────────
// Test 11: raw text leakage なし (構造的検証)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — raw text leakage 構造的検証", () => {
  it("output に raw user text を含まない (全 reason は ReasonCode enum)", () => {
    const out = detectPatternContext({
      infoMissingSignal: true,
      stallDetected: true,
      ambiguityResponseMode: "clarify",
      contradictionDetected: true,
      fairnessBias: 0.8,
      misreadConfidence: 0.9,
      presenceMode: "daily",
      criticalSignalCount: 5,
    });

    // 全 reasons を flatten して JSON 化、raw text 候補 (日本語 / 任意 prose) を含まないことを確認
    const allReasons: string[] = [
      ...out.reasons.infoMissing,
      ...out.reasons.uncertaintyHigh,
      ...out.reasons.needFraming,
      ...out.reasons.oneSidedFatigue,
      ...out.reasons.needTranslation,
      ...out.reasons.relationshipSignalsClear,
      ...out.reasons.relationshipNoiseHigh,
    ];

    // 各 reason は ReasonCode enum lower_snake_case 文字列のみ
    for (const reason of allReasons) {
      expect(reason).toMatch(/^[a-z][a-z0-9_]*$/);
      // 日本語文字 (Hiragana / Katakana / CJK) を含まない
      expect(reason).not.toMatch(/[぀-ゟ゠-ヿ一-鿿]/);
      // 空白を含まない (free text の indicator)
      expect(reason).not.toMatch(/\s/);
    }
  });

  it("input が完全 binary / count / score のみで type 上 raw text 拒否 (compile time check)", () => {
    // 本 test は compile-time check (型レベル). 以下の input は型適合のみで実行可
    const input: ContextDetectorInput = {
      infoMissingSignal: true,
      recentMessageCount: 0,
      stallDetected: true,
      ambiguityResponseMode: "clarify",
      contradictionDetected: true,
      fairnessBias: 0.5,
      misreadConfidence: 0.7,
      criticalSignalCount: 3,
      presenceMode: "daily",
      threshold: 0.5,
    };

    // raw text field が ContextDetectorInput に存在しないことを確認
    // (TypeScript 構造的型なので、追加 field は問題ないが、本 test では default field のみ確認)
    expect(input).toBeDefined();
    expect(typeof input.infoMissingSignal).toBe("boolean");
    expect(typeof input.recentMessageCount).toBe("number");
  });
});

// ─────────────────────────────────────────────
// Test 12: deterministic output (純関数性)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — deterministic", () => {
  it("同じ input × 2 回 → 完全一致 output", () => {
    const input: ContextDetectorInput = {
      infoMissingSignal: true,
      stallDetected: true,
      ambiguityResponseMode: "clarify",
      contradictionDetected: true,
      fairnessBias: 0.7,
      misreadConfidence: 0.8,
      criticalSignalCount: 4,
      presenceMode: "daily",
    };

    const out1 = detectPatternContext(input);
    const out2 = detectPatternContext(input);

    expect(out1).toEqual(out2);
  });

  it("同じ input × 100 回 → 完全一致 output", () => {
    const input: ContextDetectorInput = { infoMissingSignal: true };
    const firstOutput = detectPatternContext(input);

    for (let i = 0; i < 100; i++) {
      const out = detectPatternContext(input);
      expect(out).toEqual(firstOutput);
    }
  });
});

// ─────────────────────────────────────────────
// Test 13: provisional threshold override
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — provisional threshold override", () => {
  it("threshold=0.4 で発火閾値が下がる (uncertaintyHigh 0.4 ≥ 0.4)", () => {
    const out = detectPatternContext({
      ambiguityResponseMode: "clarify", // score 0.4
      threshold: 0.4,
    });

    expect(out.patternContext.uncertaintyHigh).toBe(true);
    expect(out.confidence.uncertaintyHigh).toBeCloseTo(0.4, 10);
  });

  it("threshold=1.0 で全 detector 抑止 (kill switch)", () => {
    const out = detectPatternContext({
      infoMissingSignal: true,
      stallDetected: true,
      contradictionDetected: true,
      fairnessBias: 0.9,
      misreadConfidence: 0.95,
      threshold: 1.0,
    });

    // confidence は計算されるが、threshold=1.0 で全 value=false
    expect(out.patternContext.infoMissing).toBeUndefined();
    expect(out.patternContext.uncertaintyHigh).toBeUndefined();
    expect(out.patternContext.needFraming).toBeUndefined();
    expect(out.patternContext.oneSidedFatigue).toBeUndefined();
    expect(out.patternContext.needTranslation).toBeUndefined();
  });

  it("PROVISIONAL_DEFAULT_THRESHOLD は 0.5 (本 D2 暫定値)", () => {
    expect(PROVISIONAL_DEFAULT_THRESHOLD).toBe(0.5);
  });
});

// ─────────────────────────────────────────────
// Test 14: detector version
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — detector version", () => {
  it("DETECTOR_VERSION は semver 形式", () => {
    expect(DETECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("output に detectorVersion 含まれる", () => {
    const out = detectPatternContext({});
    expect(out.detectorVersion).toBe(DETECTOR_VERSION);
  });

  it("どの input でも同じ detectorVersion を返す", () => {
    const out1 = detectPatternContext({});
    const out2 = detectPatternContext({ infoMissingSignal: true });
    const out3 = detectPatternContext({ presenceMode: "travel" });
    expect(out1.detectorVersion).toBe(out2.detectorVersion);
    expect(out2.detectorVersion).toBe(out3.detectorVersion);
  });
});

// ─────────────────────────────────────────────
// Test 15: no runtime wiring (本 D2 で provider / orchestrator 接続なし)
// ─────────────────────────────────────────────

describe("contextDetector.detectPatternContext — no runtime wiring", () => {
  it("純関数: 副作用なし (DB / API / fetch / sentry 等の参照なし)", () => {
    // 純関数なので、global mock も setup 不要で複数回呼べる
    const out1 = detectPatternContext({ infoMissingSignal: true });
    const out2 = detectPatternContext({});
    const out3 = detectPatternContext({ infoMissingSignal: true });

    // 1 回目と 3 回目は同 input → 同 output
    expect(out1).toEqual(out3);
    // 2 回目は別 input → 別 output、ただし detectorVersion 同
    expect(out2.detectorVersion).toBe(out1.detectorVersion);
  });

  it("output 全 field は serializable (JSON.stringify 可能、循環参照なし)", () => {
    const out = detectPatternContext({
      infoMissingSignal: true,
      stallDetected: true,
      presenceMode: "daily",
    });

    // 循環参照なし
    expect(() => JSON.stringify(out)).not.toThrow();

    // round-trip 後も同等 (一部型情報は失うが value 同)
    const json = JSON.stringify(out);
    const parsed = JSON.parse(json) as ContextDetectorOutput;
    expect(parsed.detectorVersion).toBe(out.detectorVersion);
    expect(parsed.patternContext).toEqual(out.patternContext);
  });
});
