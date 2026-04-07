/**
 * P2-3 Parts Lens Tests
 *
 * 検証対象:
 * 1. Signal detection — 各パートのパターン検出
 * 2. 2-signal requirement — 1信号では起動しない
 * 3. Parts activation — 推定ロジック
 * 4. Rolling smoothing — 非対称 EMA
 * 5. Exile contact ban — ハード制約
 * 6. P1.5 override — 制約出力
 * 7. Prompt block — 内部感覚ブロック
 * 8. Analytics — 分析データ
 * 9. dominantPart unclear vs balanced
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  detectPartsSignals,
  estimatePartsActivation,
  applyRollingSmoothing,
  computePartsP15Override,
  buildPartsLensPromptBlock,
  buildPartsLensAnalytics,
  EXILE_CONTACT_BAN,
  type PartsSignalInput,
  type PartsActivationState,
} from "@/lib/stargazer/partsLens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: base input with no signals
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const baseInput: PartsSignalInput = {
  message: "今日は天気がいいですね",
  hasContradictionHint: false,
  hasStrongDomainContradiction: false,
  narrativeShiftDetected: false,
  bodySignalDetected: false,
  previousState: null,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Signal Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectPartsSignals()", () => {
  it("Protective: deflect パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "大したことないよ、話変えるけど" });
    expect(result.names).toContain("protective_pattern");
    expect(result.protective.mode).toBe("deflect");
  });

  it("Protective: rationalize パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "冷静に考えれば仕方ない" });
    expect(result.names).toContain("protective_pattern");
    expect(result.protective.mode).toBe("rationalize");
  });

  it("Protective: minimize パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "別にいい、気にしてない" });
    expect(result.names).toContain("protective_pattern");
    expect(result.protective.mode).toBe("minimize");
  });

  it("Vulnerable: 基本パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "本当は怖いんだ、どうしたらいいか分からない" });
    expect(result.names).toContain("vulnerable_pattern");
    expect(result.vulnerable.level).toBeGreaterThan(0.3);
  });

  it("Vulnerable: deep パターン → Exile territory", () => {
    const result = detectPartsSignals({ ...baseInput, message: "誰にも言えなかったけど、あの時からずっと" });
    expect(result.vulnerable.deep).toBe(true);
    expect(result.vulnerable.level).toBeGreaterThanOrEqual(0.8);
  });

  it("Reactive: fight パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "ムカつく、もう許せない！！" });
    expect(result.names).toContain("reactive_pattern");
    expect(result.reactive.mode).toBe("fight");
  });

  it("Reactive: freeze パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "分からない分からない、頭が真っ白" });
    expect(result.names).toContain("reactive_pattern");
    expect(result.reactive.mode).toBe("freeze");
  });

  it("Reactive: flight パターン検出", () => {
    const result = detectPartsSignals({ ...baseInput, message: "もういいや、関わりたくない" });
    expect(result.names).toContain("reactive_pattern");
    expect(result.reactive.mode).toBe("flight");
  });

  it("Contradiction signal → names に含まれる", () => {
    const result = detectPartsSignals({ ...baseInput, hasContradictionHint: true });
    expect(result.names).toContain("cross_session_contradiction");
  });

  it("Narrative shift signal → names に含まれる", () => {
    const result = detectPartsSignals({ ...baseInput, narrativeShiftDetected: true });
    expect(result.names).toContain("narrative_shift");
  });

  it("Body signal → names に含まれる", () => {
    const result = detectPartsSignals({ ...baseInput, bodySignalDetected: true });
    expect(result.names).toContain("body_signal");
  });

  it("Hedging shift → 2回以上で検出", () => {
    const result = detectPartsSignals({
      ...baseInput,
      message: "かもしれない、たぶんそう気がする",
    });
    expect(result.names).toContain("hedging_shift");
  });

  it("信号なし → names が空", () => {
    const result = detectPartsSignals(baseInput);
    expect(result.names).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 2-Signal Requirement
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("2-signal requirement", () => {
  it("1信号のみ → dominantPart=unclear", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      hasContradictionHint: true,
      // contradiction 単独 → 1信号
    });
    expect(state.dominantPart).toBe("unclear");
    expect(state.signalCount).toBe(1);
  });

  it("0信号 → dominantPart=unclear", () => {
    const state = estimatePartsActivation(baseInput);
    expect(state.dominantPart).toBe("unclear");
    expect(state.signalCount).toBe(0);
  });

  it("2信号以上 → parts 推定が起動", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      message: "大したことないよ",
      hasContradictionHint: true,
      // contradiction + protective → 2信号
    });
    expect(state.signalCount).toBeGreaterThanOrEqual(2);
    expect(state.dominantPart).not.toBe("unclear");
  });

  it("contradiction 単独では起動しない（修正C検証）", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      hasContradictionHint: true,
      hasStrongDomainContradiction: false,
      // メッセージにはパターンなし
    });
    expect(state.dominantPart).toBe("unclear");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Parts Activation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("estimatePartsActivation()", () => {
  it("Protective + contradiction → protective dominant", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      message: "大したことない、仕方ないよ",
      hasContradictionHint: true,
    });
    expect(state.dominantPart).toBe("protective");
    expect(state.protective.activationLevel).toBeGreaterThan(0.3);
  });

  it("Vulnerable + body signal → vulnerable dominant", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      message: "本当は怖いんだ、助けて",
      bodySignalDetected: true,
    });
    expect(state.dominantPart).toBe("vulnerable");
    expect(state.vulnerable.activationLevel).toBeGreaterThan(0.3);
  });

  it("Reactive + narrative shift → reactive dominant", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      message: "ムカつく！許せない！",
      narrativeShiftDetected: true,
    });
    expect(state.dominantPart).toBe("reactive");
    expect(state.reactive.activationLevel).toBeGreaterThan(0.3);
  });

  it("Deep vulnerable + protective → safetyLevel=retreat", () => {
    const state = estimatePartsActivation({
      ...baseInput,
      message: "誰にも言えなかった。でも大したことない",
      hasContradictionHint: true,
    });
    // deep vulnerable detected + protective (minimize) → Exile territory
    expect(state.vulnerable.isApproaching).toBe(true);
    expect(state.vulnerable.safetyLevel).toBe("retreat");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Rolling Smoothing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyRollingSmoothing()", () => {
  const activeState: PartsActivationState = {
    protective: { activationLevel: 0.8, dominantMode: "deflect", triggerSource: null },
    vulnerable: { activationLevel: 0.2, isApproaching: false, safetyLevel: "safe" },
    reactive: { activationLevel: 0.1, dominantMode: null },
    dominantPart: "protective",
    signalCount: 3,
    signals: ["cross_session_contradiction", "protective_pattern", "narrative_shift"],
  };

  const inactiveState: PartsActivationState = {
    protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
    vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
    reactive: { activationLevel: 0, dominantMode: null },
    dominantPart: "unclear",
    signalCount: 0,
    signals: [],
  };

  it("previous=null → current がそのまま返る", () => {
    const result = applyRollingSmoothing(activeState, null);
    expect(result.protective.activationLevel).toBe(0.8);
  });

  it("活性化方向（上昇）→ α=0.6 で smoothing", () => {
    // current=0.8, previous=0.2 → 0.6*0.8 + 0.4*0.2 = 0.48+0.08 = 0.56
    const result = applyRollingSmoothing(activeState, {
      ...inactiveState,
      protective: { activationLevel: 0.2, dominantMode: null, triggerSource: null },
    });
    expect(result.protective.activationLevel).toBeCloseTo(0.56);
  });

  it("非活性化方向（下降）→ α=0.8 で素早く解除", () => {
    // current=0, previous=0.8 → 0.8*0 + 0.2*0.8 = 0.16
    const result = applyRollingSmoothing(inactiveState, activeState);
    expect(result.protective.activationLevel).toBeCloseTo(0.16);
  });

  it("非対称: 下降は上昇より速い", () => {
    // 上昇: 0→0.8: 0.6*0.8+0.4*0 = 0.48 (diff from 0: +0.48)
    const rising = applyRollingSmoothing(activeState, inactiveState);
    // 下降: 0.8→0: 0.8*0+0.2*0.8 = 0.16 (diff from 0.8: -0.64)
    const falling = applyRollingSmoothing(inactiveState, activeState);

    // 下降後の残留(0.16)は上昇後の到達(0.48)の1/3 → 下降が速い
    expect(falling.protective.activationLevel).toBeLessThan(rising.protective.activationLevel);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Exile Contact Ban
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EXILE_CONTACT_BAN", () => {
  it("禁止ルール6項目を全て含む", () => {
    expect(EXILE_CONTACT_BAN).toContain("前進」してはならない");
    expect(EXILE_CONTACT_BAN).toContain("深掘り");
    expect(EXILE_CONTACT_BAN).toContain("IFS 用語");
    expect(EXILE_CONTACT_BAN).toContain("トラウマ");
    expect(EXILE_CONTACT_BAN).toContain("静かに受け止める");
    expect(EXILE_CONTACT_BAN).toContain("ペースはユーザーに委ねる");
  });

  it("retreat 時の prompt block に EXILE_CONTACT_BAN が含まれる", () => {
    const state: PartsActivationState = {
      protective: { activationLevel: 0.5, dominantMode: "minimize", triggerSource: null },
      vulnerable: { activationLevel: 0.8, isApproaching: true, safetyLevel: "retreat" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "vulnerable",
      signalCount: 3,
      signals: ["vulnerable_pattern", "protective_pattern", "body_signal"],
    };
    const block = buildPartsLensPromptBlock(state);
    expect(block).not.toBeNull();
    expect(block).toContain("Exile 接触禁止ルール");
    expect(block).toContain("前進」してはならない");
  });

  it("safe 時は EXILE_CONTACT_BAN が含まれない", () => {
    const state: PartsActivationState = {
      protective: { activationLevel: 0.6, dominantMode: "deflect", triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "protective",
      signalCount: 2,
      signals: ["protective_pattern", "contradiction"],
    };
    const block = buildPartsLensPromptBlock(state);
    expect(block).not.toBeNull();
    expect(block).not.toContain("Exile 接触禁止ルール");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. P1.5 Override
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computePartsP15Override()", () => {
  it("unclear → 制約なし", () => {
    const override = computePartsP15Override({
      protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "unclear",
      signalCount: 0,
      signals: [],
    });
    expect(override.claimStrengthCap).toBeNull();
    expect(override.forcedResponseMode).toBeNull();
    expect(override.hedgingRequired).toBe(false);
  });

  it("Protective 高活性 → claimStrengthCap=probe", () => {
    const override = computePartsP15Override({
      protective: { activationLevel: 0.7, dominantMode: "deflect", triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "protective",
      signalCount: 2,
      signals: [],
    });
    expect(override.claimStrengthCap).toBe("probe");
  });

  it("Vulnerable + retreat → repair + hold + hedging", () => {
    const override = computePartsP15Override({
      protective: { activationLevel: 0.5, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0.8, isApproaching: true, safetyLevel: "retreat" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "vulnerable",
      signalCount: 3,
      signals: [],
    });
    expect(override.forcedResponseMode).toBe("repair");
    expect(override.claimStrengthCap).toBe("hold");
    expect(override.hedgingRequired).toBe(true);
  });

  it("Vulnerable + caution → probe + hedging（repair なし）", () => {
    const override = computePartsP15Override({
      protective: { activationLevel: 0.2, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0.5, isApproaching: false, safetyLevel: "caution" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "vulnerable",
      signalCount: 2,
      signals: [],
    });
    expect(override.forcedResponseMode).toBeNull();
    expect(override.claimStrengthCap).toBe("probe");
    expect(override.hedgingRequired).toBe(true);
  });

  it("Reactive 高活性 → hedging 必須", () => {
    const override = computePartsP15Override({
      protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0.7, dominantMode: "fight" },
      dominantPart: "reactive",
      signalCount: 2,
      signals: [],
    });
    expect(override.hedgingRequired).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPartsLensPromptBlock()", () => {
  it("unclear → null", () => {
    const block = buildPartsLensPromptBlock({
      protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "unclear",
      signalCount: 0,
      signals: [],
    });
    expect(block).toBeNull();
  });

  it("balanced → null", () => {
    const block = buildPartsLensPromptBlock({
      protective: { activationLevel: 0.1, dominantMode: null, triggerSource: null },
      vulnerable: { activationLevel: 0.1, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0.1, dominantMode: null },
      dominantPart: "balanced",
      signalCount: 2,
      signals: [],
    });
    expect(block).toBeNull();
  });

  it("Protective dominant → 挑発禁止の指示を含む", () => {
    const block = buildPartsLensPromptBlock({
      protective: { activationLevel: 0.6, dominantMode: "rationalize", triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "protective",
      signalCount: 2,
      signals: [],
    });
    expect(block).toContain("理屈で感情を処理しようとしている");
    expect(block).toContain("挑発");
  });

  it("表出禁止ルールを常に含む", () => {
    const block = buildPartsLensPromptBlock({
      protective: { activationLevel: 0.6, dominantMode: "deflect", triggerSource: null },
      vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "protective",
      signalCount: 2,
      signals: [],
    });
    expect(block).toContain("ラベルを貼らないこと");
    expect(block).toContain("パート分析を口に出さない");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPartsLensAnalytics()", () => {
  it("全フィールドを記録", () => {
    const analytics = buildPartsLensAnalytics({
      protective: { activationLevel: 0.6, dominantMode: "deflect", triggerSource: "cross_session_contradiction" },
      vulnerable: { activationLevel: 0.3, isApproaching: false, safetyLevel: "caution" },
      reactive: { activationLevel: 0, dominantMode: null },
      dominantPart: "protective",
      signalCount: 3,
      signals: ["cross_session_contradiction", "protective_pattern", "narrative_shift"],
    });
    expect(analytics.parts_dominant).toBe("protective");
    expect(analytics.parts_signal_count).toBe(3);
    expect(analytics.parts_protective_level).toBe(0.6);
    expect(analytics.parts_protective_mode).toBe("deflect");
    expect(analytics.parts_vulnerable_safety).toBe("caution");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. unclear vs balanced
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("unclear vs balanced（修正D検証）", () => {
  it("信号不足 → unclear（balanced ではない）", () => {
    const state = estimatePartsActivation(baseInput);
    expect(state.dominantPart).toBe("unclear");
    // balanced ではないことを明示検証
    expect(state.dominantPart).not.toBe("balanced");
  });

  it("2信号以上 + 全て低活性 → balanced", () => {
    // 2信号あるが、メッセージにパターンがない場合
    const state = estimatePartsActivation({
      ...baseInput,
      hasContradictionHint: true,
      narrativeShiftDetected: true,
      // メッセージ自体は中立
    });
    expect(state.signalCount).toBeGreaterThanOrEqual(2);
    expect(state.dominantPart).toBe("balanced");
  });
});
