/**
 * D-1-c Narration Coverage 単体テスト (G3 / G4 / G6 担保、handover §5.1)。
 *
 * 検証軸 (mainstream plan §3.2 元 D-2-c):
 *   - **G3**: narration 5 要素充足率 ≥ 90% (unit test で 100% 必須)
 *     → reasoning 5 要素 + narrative すべて非空文字
 *   - **G4**: narration 固有情報率 ≥ 80%
 *     → 汎用語 ("一般的に" / "多くの人が" / "人気の" 等) を含まないほど高
 *   - **G6**: narration の lens 由来引用率 ≥ 70%
 *     → lens フィールド (coreDecisionPrinciples / careAxes / dominantDynamic /
 *        todayReading.mode 等) のキーワードが narration に含まれる率
 *
 * 本テストは `computeNarrationCoverage` (pure function) を mock pick + lens で
 * verify する (CEO 厳禁: 実 LLM 接続なし)。
 */

import { describe, it, expect } from "vitest";
import {
  computeNarrationCoverage,
  NARRATION_COVERAGE_THRESHOLDS,
  type PersonalityRootedPick,
  type PersonalityRootedReasoning,
} from "@/lib/coalter/movie/curator";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildPersonalLens(
  suffix: "a" | "b",
  principles: readonly string[],
  comforts: readonly string[],
): PersonalLens {
  return {
    userId: `user-${suffix}` as UserId,
    displayName: suffix === "a" ? "Aさん" : "Bさん",
    coreDecisionPrinciples: [...principles],
    currentEmotionalHue: `${suffix}-情調`,
    todaySensitivities: [],
    comfortPathways: [...comforts],
    sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
  };
}

function buildLens(
  overrides: Partial<TwoPersonLensToday> = {},
): TwoPersonLensToday {
  return {
    personalLenses: {
      a: buildPersonalLens("a", ["静かに整える"], ["読書"]),
      b: buildPersonalLens("b", ["挑戦より安全"], ["散歩"]),
    },
    relationalLens: {
      temperature: "warm",
      dominantDynamic: "今日は A 主導",
      careAxes: ["B-疲労配慮"],
      avoidElements: ["重い暴力"],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "recover",
      energyBudget: "low",
      timeBudget: "limited",
      implicitIntent: "今日は静かに過ごしたい",
      latentNeeds: [],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: "2026-05-11T00:00:00Z",
    lensVersion: "1.0.0",
    ...overrides,
  };
}

function buildReasoning(
  overrides: Partial<PersonalityRootedReasoning> = {},
): PersonalityRootedReasoning {
  return {
    personA_lens: "Aさんの 静かに整える 傾向に沿う",
    personB_lens: "Bさんの 挑戦より安全 傾向に合う",
    relational_fit: "今日は A 主導 の関係性に乗せる",
    today_hook: "今日のモード recover に呼応",
    veto_guard: "重い暴力 は外した",
    ...overrides,
  };
}

function buildPick(
  overrides: Partial<PersonalityRootedPick> = {},
): PersonalityRootedPick {
  return {
    title: "テスト作品",
    confidence: 0.85,
    reasoning: buildReasoning(),
    narrative:
      "Aさんの 静かに整える 傾向と Bさんの 挑戦より安全 傾向に合わせて、今日は recover モードで提案します。",
    fairnessNote: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 0. NARRATION_COVERAGE_THRESHOLDS 定数
// ═══════════════════════════════════════════════════════════════════════════

describe("NARRATION_COVERAGE_THRESHOLDS — 設計値固定", () => {
  it("G4_UNIQUE_INFO_MIN = 0.8 (handover §5.1)", () => {
    expect(NARRATION_COVERAGE_THRESHOLDS.G4_UNIQUE_INFO_MIN).toBe(0.8);
  });

  it("G6_LENS_CITATION_MIN = 0.7 (handover §5.1)", () => {
    expect(NARRATION_COVERAGE_THRESHOLDS.G6_LENS_CITATION_MIN).toBe(0.7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. G3: 5 要素充足
// ═══════════════════════════════════════════════════════════════════════════

describe("G3 — 5 要素充足 (reasoning 5 + narrative すべて非空)", () => {
  it("全要素 non-empty + narrative non-empty → meetsG3=true", () => {
    const pick = buildPick();
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.meetsG3).toBe(true);
  });

  const fields: Array<keyof PersonalityRootedReasoning> = [
    "personA_lens",
    "personB_lens",
    "relational_fit",
    "today_hook",
    "veto_guard",
  ];

  it.each(fields)("reasoning.%s が空 → meetsG3=false", (field) => {
    const pick = buildPick({
      reasoning: { ...buildReasoning(), [field]: "" },
    });
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.meetsG3).toBe(false);
  });

  it("narrative が空 → meetsG3=false", () => {
    const pick = buildPick({ narrative: "" });
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.meetsG3).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. G4: 固有情報率 (汎用語 hit で減点)
// ═══════════════════════════════════════════════════════════════════════════

describe("G4 — 固有情報率 (汎用語減点、≥ 0.8 で meetsG4)", () => {
  it("汎用語ゼロ → uniqueInfoRatio=1.0、meetsG4=true", () => {
    const pick = buildPick();
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.uniqueInfoRatio).toBeCloseTo(1.0, 5);
    expect(cov.meetsG4).toBe(true);
  });

  it("汎用語 1 hit ('一般的に') → uniqueInfoRatio=0.8 境界、meetsG4=true", () => {
    const pick = buildPick({
      narrative: "Aさんに合いそう。一般的に静かな作品。",
    });
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.uniqueInfoRatio).toBeCloseTo(0.8, 5);
    expect(cov.meetsG4).toBe(true);
  });

  it("汎用語 2 hit ('一般的に' + '多くの人が') → uniqueInfoRatio=0.6、meetsG4=false", () => {
    const pick = buildPick({
      narrative: "一般的に静か。多くの人が好む。",
    });
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.uniqueInfoRatio).toBeCloseTo(0.6, 5);
    expect(cov.meetsG4).toBe(false);
  });

  it("汎用語 5 hit 以上 → uniqueInfoRatio=0、meetsG4=false", () => {
    const pick = buildPick({
      reasoning: {
        ...buildReasoning(),
        personA_lens: "一般的に多くの人が好む",
        personB_lens: "人気のおすすめの作品",
        relational_fit: "話題の作品で誰もが",
      },
      narrative: "一般的に多くの人が人気のおすすめの話題の誰もが好む",
    });
    const cov = computeNarrationCoverage(pick, buildLens());
    expect(cov.uniqueInfoRatio).toBe(0);
    expect(cov.meetsG4).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. G6: lens 由来引用率 (≥ 0.7 で meetsG6)
// ═══════════════════════════════════════════════════════════════════════════

describe("G6 — lens 由来引用率 (≥ 0.7 で meetsG6)", () => {
  it("lens の主要キーワード全部引用 → lensCitationRatio=1.0、meetsG6=true", () => {
    const lens = buildLens(); // a-原理: ["静かに整える"]、b-原理: ["挑戦より安全"]、
                              // a-comfort: ["読書"]、b-comfort: ["散歩"]、
                              // dominant: "今日は A 主導"、care: ["B-疲労配慮"]、
                              // avoid: ["重い暴力"]、mode: "recover"、
                              // intent: "今日は静かに過ごしたい"
    // narration に lens kw を全部入れる
    const pick = buildPick({
      reasoning: {
        personA_lens: "静かに整える + 読書",
        personB_lens: "挑戦より安全 + 散歩",
        relational_fit: "今日は A 主導 + B-疲労配慮",
        today_hook: "recover + 今日は静かに過ごしたい",
        veto_guard: "重い暴力 を回避",
      },
      narrative: "all lens kws covered",
    });
    const cov = computeNarrationCoverage(pick, lens);
    expect(cov.lensCitationRatio).toBeCloseTo(1.0, 5);
    expect(cov.meetsG6).toBe(true);
  });

  it("lens kw を 7 / 9 含む → lensCitationRatio ≈ 0.78、meetsG6=true (≥ 0.7)", () => {
    const lens = buildLens();
    // lens kw 9 個のうち 7 個含める
    const pick = buildPick({
      reasoning: {
        personA_lens: "静かに整える",
        personB_lens: "挑戦より安全",
        relational_fit: "今日は A 主導 + B-疲労配慮",
        today_hook: "recover + 今日は静かに過ごしたい",
        veto_guard: "重い暴力",
      },
      narrative: "minimal narrative",
    });
    const cov = computeNarrationCoverage(pick, lens);
    // 9 kw 中 7 kw (読書 / 散歩 を欠落) hit = 0.778
    expect(cov.lensCitationRatio).toBeGreaterThanOrEqual(0.7);
    expect(cov.meetsG6).toBe(true);
  });

  it("lens kw を 4 / 9 含む → lensCitationRatio ≈ 0.44、meetsG6=false", () => {
    const lens = buildLens();
    const pick = buildPick({
      reasoning: {
        personA_lens: "静かに整える",
        personB_lens: "挑戦より安全",
        relational_fit: "なんとなく合う", // dominant / careAxes 引用なし
        today_hook: "recover", // implicitIntent 引用なし
        veto_guard: "対象なし", // avoidElements 引用なし
      },
      narrative: "lens kw を 4 個のみ含む",
    });
    const cov = computeNarrationCoverage(pick, lens);
    // 9 kw 中 3 kw (静かに整える、挑戦より安全、recover) hit
    expect(cov.lensCitationRatio).toBeLessThan(0.7);
    expect(cov.meetsG6).toBe(false);
  });

  it("lens に kw が空 (新規ペア) → lensCitationRatio=0、meetsG6=false (観測値、gate 失敗で判定)", () => {
    const lensEmpty = buildLens({
      personalLenses: {
        a: buildPersonalLens("a", [], []),
        b: buildPersonalLens("b", [], []),
      },
      relationalLens: {
        temperature: "neutral",
        dominantDynamic: "",
        careAxes: [],
        avoidElements: [],
        interactionPace: "steady",
      },
      todayReading: {
        mode: "maintain",
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "",
        latentNeeds: [],
        confidence: 0.3,
      },
    });
    // mode "maintain" は kw として残る
    // → lens kw = ["maintain"] のみ
    const pick = buildPick({
      narrative: "maintain mode に合わせる",
    });
    const cov = computeNarrationCoverage(pick, lensEmpty);
    expect(cov.lensCitationRatio).toBeCloseTo(1.0, 5); // 1 / 1
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. fairnessNote の扱い (text に含まれる)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeNarrationCoverage — fairnessNote の扱い", () => {
  it("fairnessNote 含む lens kw も lensCitationRatio に反映", () => {
    const lens = buildLens({
      fairnessAdjustment: {
        favorSide: "a",
        rationale: "前回 B 寄りだったので今回は A の好み", // lens kw として加算
        strength: 0.6,
        basedOnSessionCount: 5,
      },
    });
    const pick = buildPick({
      // すべての lens kw を含むように構築
      reasoning: {
        personA_lens: "静かに整える + 読書",
        personB_lens: "挑戦より安全 + 散歩",
        relational_fit: "今日は A 主導 + B-疲労配慮",
        today_hook: "recover + 今日は静かに過ごしたい",
        veto_guard: "重い暴力",
      },
      narrative: "前回 B 寄りだったので今回は A の好み を反映",
      fairnessNote: "前回 B 寄りだったので今回は A の好み",
    });
    const cov = computeNarrationCoverage(pick, lens);
    // 全 lens kw 含む → 1.0 期待
    expect(cov.lensCitationRatio).toBeCloseTo(1.0, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. shape verify
// ═══════════════════════════════════════════════════════════════════════════

describe("NarrationCoverage shape", () => {
  it("返り値は 5 fields (meetsG3 / uniqueInfoRatio / lensCitationRatio / meetsG4 / meetsG6)", () => {
    const cov = computeNarrationCoverage(buildPick(), buildLens());
    expect(Object.keys(cov).sort()).toEqual([
      "lensCitationRatio",
      "meetsG3",
      "meetsG4",
      "meetsG6",
      "uniqueInfoRatio",
    ]);
  });

  it("uniqueInfoRatio / lensCitationRatio は number (0-1)", () => {
    const cov = computeNarrationCoverage(buildPick(), buildLens());
    expect(typeof cov.uniqueInfoRatio).toBe("number");
    expect(typeof cov.lensCitationRatio).toBe("number");
    expect(cov.uniqueInfoRatio).toBeGreaterThanOrEqual(0);
    expect(cov.uniqueInfoRatio).toBeLessThanOrEqual(1);
    expect(cov.lensCitationRatio).toBeGreaterThanOrEqual(0);
    expect(cov.lensCitationRatio).toBeLessThanOrEqual(1);
  });
});
