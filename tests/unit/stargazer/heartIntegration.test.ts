import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildUnifiedHeartState,
  buildHeartStateAnalytics,
  type HeartStateInputs,
} from "@/lib/stargazer/heartIntegration";
import type { PartsActivationState } from "@/lib/stargazer/partsLens";

// ── helpers ──

function makeInputs(overrides: Partial<HeartStateInputs> = {}): HeartStateInputs {
  return {
    emotionalLoad: 0,
    psychologicalCapacity: 1,
    cognitiveFatigue: 0,
    partsState: null,
    conflictIndicator: null,
    convictionIndicator: null,
    isLateNight: false,
    isHighFatigue: false,
    woundCautionPrompts: [],
    financialPressureHint: null,
    shouldReduceDepth: false,
    ...overrides,
  };
}

function makePartsState(overrides: Partial<PartsActivationState> = {}): PartsActivationState {
  return {
    protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
    vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
    reactive: { activationLevel: 0, dominantMode: null },
    dominantPart: "balanced",
    signalCount: 0,
    signals: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 基本動作
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildUnifiedHeartState", () => {
  describe("基本", () => {
    it("全て平常 → null（注入しない）", () => {
      expect(buildUnifiedHeartState(makeInputs())).toBeNull();
    });

    it("何かしらの状態変化がある → ヘッダーと表出禁止ルールが含まれる", () => {
      const result = buildUnifiedHeartState(makeInputs({ emotionalLoad: 0.8 }));
      expect(result).not.toBeNull();
      expect(result).toContain("僕の中の今の状態");
      expect(result).toContain("表出禁止");
      expect(result).toContain("疲れてるんだね");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // innerWeather（今の揺れ）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("innerWeather → 体感変換", () => {
    it("emotionalLoad > 0.7 → 受け取ること", () => {
      const result = buildUnifiedHeartState(makeInputs({ emotionalLoad: 0.8 }))!;
      expect(result).toContain("受け取る");
    });

    it("emotionalLoad 0.5-0.7 → 重たいもの", () => {
      const result = buildUnifiedHeartState(makeInputs({ emotionalLoad: 0.6 }))!;
      expect(result).toContain("重たい");
    });

    it("psychologicalCapacity < 0.3 → 余力がない", () => {
      const result = buildUnifiedHeartState(makeInputs({ psychologicalCapacity: 0.2 }))!;
      expect(result).toContain("余力");
      expect(result).toContain("最小限");
    });

    it("cognitiveFatigue > 0.7 → 頭が疲れ", () => {
      const result = buildUnifiedHeartState(makeInputs({ cognitiveFatigue: 0.8 }))!;
      expect(result).toContain("頭が疲れ");
    });

    it("isLateNight → 深夜の揺れ", () => {
      const result = buildUnifiedHeartState(makeInputs({ isLateNight: true }))!;
      expect(result).toContain("深夜");
      expect(result).toContain("揺れ");
    });

    it("isHighFatigue（非深夜）→ 疲れが混ざっている", () => {
      const result = buildUnifiedHeartState(makeInputs({ isHighFatigue: true }))!;
      expect(result).toContain("疲れが混ざ");
    });

    it("isHighFatigue + isLateNight → 深夜が優先、疲労は重複しない", () => {
      const result = buildUnifiedHeartState(makeInputs({
        isLateNight: true,
        isHighFatigue: true,
      }))!;
      expect(result).toContain("深夜");
      expect(result).not.toContain("疲れが混ざ");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Parts Lens（パート力学）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("Parts Lens → 体感変換", () => {
    it("partsState null → パート言及なし", () => {
      const result = buildUnifiedHeartState(makeInputs({
        emotionalLoad: 0.8, // 何か他の要素で注入を発生させる
        partsState: null,
      }))!;
      expect(result).not.toContain("守ろう");
      expect(result).not.toContain("逸ら");
    });

    it("protective deflect > 0.5 → 逸らそうとしている", () => {
      const result = buildUnifiedHeartState(makeInputs({
        partsState: makePartsState({
          dominantPart: "protective",
          protective: { activationLevel: 0.6, dominantMode: "deflect", triggerSource: null },
        }),
      }))!;
      expect(result).toContain("逸らそう");
    });

    it("protective rationalize > 0.5 → 理屈で武装", () => {
      const result = buildUnifiedHeartState(makeInputs({
        partsState: makePartsState({
          dominantPart: "protective",
          protective: { activationLevel: 0.6, dominantMode: "rationalize", triggerSource: null },
        }),
      }))!;
      expect(result).toContain("理屈で武装");
    });

    it("vulnerable retreat → 深掘りしない", () => {
      const result = buildUnifiedHeartState(makeInputs({
        partsState: makePartsState({
          dominantPart: "vulnerable",
          vulnerable: { activationLevel: 0.6, isApproaching: true, safetyLevel: "retreat" },
        }),
      }))!;
      expect(result).toContain("深掘りしない");
    });

    it("reactive fight > 0.5 → 怒りのエネルギー", () => {
      const result = buildUnifiedHeartState(makeInputs({
        partsState: makePartsState({
          dominantPart: "reactive",
          reactive: { activationLevel: 0.6, dominantMode: "fight" },
        }),
      }))!;
      expect(result).toContain("怒り");
    });

    it("reactive freeze > 0.5 → 固まっている", () => {
      const result = buildUnifiedHeartState(makeInputs({
        partsState: makePartsState({
          dominantPart: "reactive",
          reactive: { activationLevel: 0.6, dominantMode: "freeze" },
        }),
      }))!;
      expect(result).toContain("固まっている");
    });

    it("dominantPart balanced → パート言及なし", () => {
      const result = buildUnifiedHeartState(makeInputs({
        emotionalLoad: 0.8,
        partsState: makePartsState({ dominantPart: "balanced" }),
      }))!;
      expect(result).not.toContain("守ろう");
      expect(result).not.toContain("固まっ");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // responseTimeEngine（引っかかり/確信）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("responseTimeEngine → 体感変換", () => {
    it("conflictIndicator null → 言及なし", () => {
      const result = buildUnifiedHeartState(makeInputs({
        emotionalLoad: 0.8,
        conflictIndicator: null,
      }))!;
      expect(result).not.toContain("引っかかり");
    });

    it("conflictIndicator > 0.6 → 引っかかり", () => {
      const result = buildUnifiedHeartState(makeInputs({
        conflictIndicator: 0.7,
      }))!;
      expect(result).toContain("引っかかり");
      expect(result).toContain("急がない");
    });

    it("conflictIndicator 0.4-0.6 → 迷い", () => {
      const result = buildUnifiedHeartState(makeInputs({
        conflictIndicator: 0.5,
      }))!;
      expect(result).toContain("迷い");
    });

    it("convictionIndicator > 0.7 → 確信を尊重", () => {
      const result = buildUnifiedHeartState(makeInputs({
        convictionIndicator: 0.8,
      }))!;
      expect(result).toContain("迷いなく");
      expect(result).toContain("尊重");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Wound / Financial / Trap
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("傷 / 経済 / 実行率", () => {
    it("woundCautionPrompts → そのまま含まれる", () => {
      const result = buildUnifiedHeartState(makeInputs({
        woundCautionPrompts: ["見捨てられる恐怖に触れすぎないこと"],
      }))!;
      expect(result).toContain("見捨てられる恐怖");
    });

    it("financialPressureHint → 含まれる", () => {
      const result = buildUnifiedHeartState(makeInputs({
        financialPressureHint: "経済的に余裕がない状況を踏まえること",
      }))!;
      expect(result).toContain("経済的に余裕がない");
    });

    it("shouldReduceDepth → 小さな一歩", () => {
      const result = buildUnifiedHeartState(makeInputs({
        shouldReduceDepth: true,
      }))!;
      expect(result).toContain("小さな一歩");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 統合テスト
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("統合", () => {
    it("複数要素が同時に存在 → 全て含まれる", () => {
      const result = buildUnifiedHeartState(makeInputs({
        emotionalLoad: 0.8,
        psychologicalCapacity: 0.2,
        partsState: makePartsState({
          dominantPart: "protective",
          protective: { activationLevel: 0.7, dominantMode: "rationalize", triggerSource: null },
        }),
        conflictIndicator: 0.7,
        woundCautionPrompts: ["核心の傷に近い"],
        isLateNight: true,
      }))!;

      expect(result).toContain("受け取る");         // emotionalLoad
      expect(result).toContain("余力");              // capacity
      expect(result).toContain("理屈で武装");        // parts
      expect(result).toContain("引っかかり");        // responseTime
      expect(result).toContain("核心の傷に近い");    // wound
      expect(result).toContain("深夜");              // lateNight
    });

    it("旧4ブロックの情報が欠損しない", () => {
      // 旧ブロック1: 相手の状態（capacity/load/fatigue）
      // 旧ブロック2: 応答の粒度調整（shouldReduceDepth）
      // 旧ブロック3: 心理的安全性（woundCautionPrompts）
      // 旧ブロック4: 経済的配慮（financialPressureHint）

      const result = buildUnifiedHeartState(makeInputs({
        psychologicalCapacity: 0.2,        // 旧ブロック1
        emotionalLoad: 0.8,                // 旧ブロック1
        cognitiveFatigue: 0.8,             // 旧ブロック1
        shouldReduceDepth: true,           // 旧ブロック2
        woundCautionPrompts: ["慎重に"],    // 旧ブロック3
        financialPressureHint: "経済的制約", // 旧ブロック4
      }))!;

      // 全ての旧情報が含まれていることを確認
      expect(result).toContain("余力");       // capacity
      expect(result).toContain("受け取る");   // emotional
      expect(result).toContain("頭が疲れ");   // fatigue
      expect(result).toContain("小さな一歩"); // depth
      expect(result).toContain("慎重に");     // wound
      expect(result).toContain("経済的制約"); // financial
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildHeartStateAnalytics", () => {
  it("平常状態 → 全て0", () => {
    const analytics = buildHeartStateAnalytics(makeInputs(), false);
    expect(analytics.heart_state_injected).toBe(false);
    expect(analytics.heart_total_lines).toBe(0);
  });

  it("複数要素あり → カウントが正確", () => {
    const analytics = buildHeartStateAnalytics(makeInputs({
      emotionalLoad: 0.8,
      partsState: makePartsState({
        dominantPart: "protective",
        protective: { activationLevel: 0.7, dominantMode: "deflect", triggerSource: null },
      }),
      conflictIndicator: 0.7,
    }), true);
    expect(analytics.heart_state_injected).toBe(true);
    expect(analytics.heart_weather_lines).toBeGreaterThan(0);
    expect(analytics.heart_parts_lines).toBeGreaterThan(0);
    expect(analytics.heart_tension_lines).toBeGreaterThan(0);
    expect(analytics.heart_total_lines).toBeGreaterThanOrEqual(3);
  });
});
