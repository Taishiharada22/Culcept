/**
 * P2-2 Body Lens Tests
 *
 * 検証対象:
 * 1. Body signal detection — 身体信号のキーワード検出
 * 2. Mapping confidence — ゼロプライヤー + ラプラス平滑化
 * 3. Confidence level classification — P1.5 連携レベル
 * 4. Evidence update — 証拠蓄積 + 反例 + context diversity
 * 5. Prompt block — 内部感覚ブロック生成
 * 6. Disclosure ban — 表出禁止ルール
 * 7. Analytics — 分析データ生成
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  detectBodySignals,
  computeMappingConfidence,
  classifyConfidenceLevel,
  applyEvidenceUpdate,
  buildBodyLensPromptBlock,
  buildBodyLensAnalytics,
  BODY_DISCLOSURE_BAN,
  type BodyEmotionMapping,
  type DetectedBodySignal,
} from "@/lib/stargazer/bodyLens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Body Signal Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectBodySignals()", () => {
  it("肩こり → tension", () => {
    const signals = detectBodySignals("最近肩こりがひどい");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("tension");
  });

  it("疲れた → fatigue", () => {
    const signals = detectBodySignals("今日はすごく疲れた");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("fatigue");
  });

  it("頭痛 → headache", () => {
    const signals = detectBodySignals("朝から頭痛がする");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("headache");
  });

  it("胃が痛い → stomach", () => {
    const signals = detectBodySignals("胃が痛い");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("stomach");
  });

  it("息苦しい → chest", () => {
    const signals = detectBodySignals("なんか息苦しい");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("chest");
  });

  it("眠れない → sleep", () => {
    const signals = detectBodySignals("最近眠れない日が続く");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("sleep");
  });

  it("食欲がない → appetite", () => {
    const signals = detectBodySignals("食欲がない");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("appetite");
  });

  it("やる気が出ない → energy", () => {
    const signals = detectBodySignals("やる気が出ない");
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe("energy");
  });

  it("複数信号の同時検出", () => {
    const signals = detectBodySignals("頭痛がして肩こりもひどく、疲れた");
    expect(signals.length).toBeGreaterThanOrEqual(3);
    const types = signals.map(s => s.type);
    expect(types).toContain("headache");
    expect(types).toContain("tension");
    expect(types).toContain("fatigue");
  });

  it("身体信号がない → 空配列", () => {
    const signals = detectBodySignals("今日は天気がいい");
    expect(signals).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Mapping Confidence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeMappingConfidence()", () => {
  it("evidence=1 → 0（単発では確信ゼロ）", () => {
    expect(computeMappingConfidence(1, 0, 0, 2)).toBe(0);
  });

  it("evidence=2, counter=0, distinct=2 → 0.25", () => {
    expect(computeMappingConfidence(2, 0, 0, 2)).toBeCloseTo(0.25);
  });

  it("evidence=5, counter=0, distinct=3 → 0.571", () => {
    expect(computeMappingConfidence(5, 0, 0, 3)).toBeCloseTo(4 / 7);
  });

  it("evidence=5, counter=2, distinct=3 → 0.444", () => {
    expect(computeMappingConfidence(5, 2, 0, 3)).toBeCloseTo(4 / 9);
  });

  it("strong counter は2倍の重みで加算", () => {
    // evidence=5, counter=0, strong_counter=1, distinct=3
    // effective_counter = 0 + 1 = 1
    // (5-1) / (5 + 1 + 2) = 4/8 = 0.5
    expect(computeMappingConfidence(5, 0, 1, 3)).toBeCloseTo(0.5);
  });

  it("distinct_context_count < 2 → 0（同一文脈の反復は無効）", () => {
    expect(computeMappingConfidence(10, 0, 0, 1)).toBe(0);
    expect(computeMappingConfidence(10, 0, 0, 0)).toBe(0);
  });

  it("evidence=0 → 0", () => {
    expect(computeMappingConfidence(0, 0, 0, 2)).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Confidence Level
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyConfidenceLevel()", () => {
  it("< 0.2 → suppress", () => {
    expect(classifyConfidenceLevel(0)).toBe("suppress");
    expect(classifyConfidenceLevel(0.19)).toBe("suppress");
  });

  it("0.2-0.5 → hedged", () => {
    expect(classifyConfidenceLevel(0.2)).toBe("hedged");
    expect(classifyConfidenceLevel(0.49)).toBe("hedged");
  });

  it("≥ 0.5 → usable", () => {
    expect(classifyConfidenceLevel(0.5)).toBe("usable");
    expect(classifyConfidenceLevel(0.8)).toBe("usable");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Evidence Update
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyEvidenceUpdate()", () => {
  const baseMapping: BodyEmotionMapping = {
    id: "test-1",
    user_id: "user-1",
    body_signal_type: "tension",
    likely_emotion_mapping: "anxiety",
    confidence: 0,
    evidence_count: 1,
    counter_evidence_count: 0,
    strong_counter_evidence_count: 0,
    distinct_context_count: 1,
    last_seen_at: "2026-04-01T00:00:00Z",
    context_tags: ["仕事中"],
  };

  it("consistent + 新文脈 → evidence+1, distinct+1, confidence再計算", () => {
    const result = applyEvidenceUpdate(baseMapping, {
      bodySignalType: "tension",
      emotionContext: "anxiety",
      isConsistent: true,
      isStrongCounter: false,
      contextTag: "対人場面",
      observedAt: "2026-04-07T00:00:00Z",
    });
    expect(result.evidence_count).toBe(2);
    expect(result.distinct_context_count).toBe(2);
    expect(result.confidence).toBeCloseTo(0.25); // (2-1)/(2+0+2)=0.25
    expect(result.context_tags).toContain("対人場面");
    expect(result.context_tags).toContain("仕事中");
  });

  it("consistent + 既存文脈 → evidence+1, distinct変わらず", () => {
    const result = applyEvidenceUpdate(baseMapping, {
      bodySignalType: "tension",
      emotionContext: "anxiety",
      isConsistent: true,
      isStrongCounter: false,
      contextTag: "仕事中", // 既存タグ
      observedAt: "2026-04-07T00:00:00Z",
    });
    expect(result.evidence_count).toBe(2);
    expect(result.distinct_context_count).toBe(1); // 変わらず
    expect(result.confidence).toBe(0); // distinct < 2 → 0
  });

  it("inconsistent (weak counter) → counter+1", () => {
    const result = applyEvidenceUpdate(baseMapping, {
      bodySignalType: "tension",
      emotionContext: "neutral",
      isConsistent: false,
      isStrongCounter: false,
      contextTag: "休日",
      observedAt: "2026-04-07T00:00:00Z",
    });
    expect(result.evidence_count).toBe(1); // 変わらず
    expect(result.counter_evidence_count).toBe(1);
    expect(result.strong_counter_evidence_count).toBe(0);
  });

  it("strong counter → strong_counter+1", () => {
    const result = applyEvidenceUpdate(baseMapping, {
      bodySignalType: "tension",
      emotionContext: "joy",
      isConsistent: false,
      isStrongCounter: true,
      contextTag: "運動後",
      observedAt: "2026-04-07T00:00:00Z",
    });
    expect(result.evidence_count).toBe(1);
    expect(result.counter_evidence_count).toBe(0); // strong は counter に加算されない
    expect(result.strong_counter_evidence_count).toBe(1);
  });

  it("context_tags は最大20件まで保持", () => {
    const manyTags: BodyEmotionMapping = {
      ...baseMapping,
      context_tags: Array.from({ length: 20 }, (_, i) => `tag-${i}`),
      distinct_context_count: 20,
    };
    const result = applyEvidenceUpdate(manyTags, {
      bodySignalType: "tension",
      emotionContext: "anxiety",
      isConsistent: true,
      isStrongCounter: false,
      contextTag: "new-tag",
      observedAt: "2026-04-07T00:00:00Z",
    });
    expect(result.context_tags!.length).toBe(20);
    expect(result.context_tags![result.context_tags!.length - 1]).toBe("new-tag");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildBodyLensPromptBlock()", () => {
  const highConfMapping: BodyEmotionMapping = {
    id: "m1",
    user_id: "u1",
    body_signal_type: "tension",
    likely_emotion_mapping: "不安",
    confidence: 0.55,
    evidence_count: 6,
    counter_evidence_count: 1,
    strong_counter_evidence_count: 0,
    distinct_context_count: 3,
    last_seen_at: "2026-04-07T00:00:00Z",
    context_tags: ["仕事中", "対人場面", "朝"],
  };

  const lowConfMapping: BodyEmotionMapping = {
    ...highConfMapping,
    id: "m2",
    confidence: 0.1,
    evidence_count: 1,
    distinct_context_count: 1,
  };

  it("confidence が十分 + 信号検出 → prompt block を返す", () => {
    const block = buildBodyLensPromptBlock(
      [highConfMapping],
      [{ type: "tension", matchedText: "肩こり" }],
    );
    expect(block).not.toBeNull();
    expect(block).toContain("身体→感情の構築パターン");
    expect(block).toContain("不安");
    expect(block).toContain("表出禁止ルール");
  });

  it("confidence が低い mapping → suppress されて null", () => {
    const block = buildBodyLensPromptBlock(
      [lowConfMapping],
      [{ type: "tension", matchedText: "肩こり" }],
    );
    expect(block).toBeNull();
  });

  it("信号が検出されない → null", () => {
    const block = buildBodyLensPromptBlock([highConfMapping], []);
    expect(block).toBeNull();
  });

  it("hedged mapping → 「まだ確かではないが」を含む", () => {
    const hedgedMapping: BodyEmotionMapping = {
      ...highConfMapping,
      confidence: 0.3, // hedged range
    };
    const block = buildBodyLensPromptBlock(
      [hedgedMapping],
      [{ type: "tension", matchedText: "肩こり" }],
    );
    expect(block).toContain("まだ確かではないが");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Disclosure Ban
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("BODY_DISCLOSURE_BAN enforcement", () => {
  it("禁止表現6つを含む", () => {
    expect(BODY_DISCLOSURE_BAN).toContain("推定・診断する発言は禁止");
    expect(BODY_DISCLOSURE_BAN).toContain("パターン指摘は禁止");
    expect(BODY_DISCLOSURE_BAN).toContain("過去参照は禁止");
    expect(BODY_DISCLOSURE_BAN).toContain("分析口調は禁止");
    expect(BODY_DISCLOSURE_BAN).toContain("内的感覚のみ");
    expect(BODY_DISCLOSURE_BAN).toContain("静かに受け止めること");
  });

  it("prompt block に表出禁止ルールが含まれる", () => {
    const mapping: BodyEmotionMapping = {
      id: "ban-test",
      user_id: "u1",
      body_signal_type: "fatigue",
      likely_emotion_mapping: "悲しみ",
      confidence: 0.6,
      evidence_count: 8,
      counter_evidence_count: 1,
      strong_counter_evidence_count: 0,
      distinct_context_count: 4,
      last_seen_at: "2026-04-07T00:00:00Z",
      context_tags: ["仕事", "休日", "夜", "朝"],
    };
    const block = buildBodyLensPromptBlock(
      [mapping],
      [{ type: "fatigue", matchedText: "疲れた" }],
    );
    expect(block).toContain("推定・診断する発言は禁止");
    expect(block).toContain("内的感覚のみ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildBodyLensAnalytics()", () => {
  it("検出信号と mapping 情報を記録", () => {
    const signals: DetectedBodySignal[] = [
      { type: "tension", matchedText: "肩こり" },
      { type: "fatigue", matchedText: "疲れた" },
    ];
    const mappings: BodyEmotionMapping[] = [{
      id: "m1",
      user_id: "u1",
      body_signal_type: "tension",
      likely_emotion_mapping: "不安",
      confidence: 0.55,
      evidence_count: 6,
      counter_evidence_count: 1,
      strong_counter_evidence_count: 0,
      distinct_context_count: 3,
      last_seen_at: "2026-04-07T00:00:00Z",
      context_tags: [],
    }];
    const analytics = buildBodyLensAnalytics(signals, mappings, true);
    expect(analytics.body_signals_detected).toEqual(["tension", "fatigue"]);
    expect(analytics.body_signals_count).toBe(2);
    expect(analytics.body_mappings_consulted).toBe(1);
    expect(analytics.body_prompt_injected).toBe(true);
  });

  it("信号なし → count=0", () => {
    const analytics = buildBodyLensAnalytics([], [], false);
    expect(analytics.body_signals_count).toBe(0);
    expect(analytics.body_prompt_injected).toBe(false);
  });
});
