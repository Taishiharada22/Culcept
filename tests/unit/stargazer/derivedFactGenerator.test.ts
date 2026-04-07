/**
 * derivedFactGenerator.ts — Unit Tests
 *
 * Phase 1 flag-ON実動確認（Level A: unit level）
 * generateDerivedFacts()を直接呼び出し、派生事実5-8文の生成を検証する。
 */

import { describe, it, expect } from "vitest";
import {
  generateDerivedFacts,
  formatDerivedFactsForPrompt,
  serializeDerivedFactsForAnalytics,
  type DerivedFactGeneratorInput,
  type DerivedFactSet,
  type ContradictionInput,
  type BlindSpotInput,
} from "@/lib/stargazer/derivedFactGenerator";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ─── Test Fixtures ────────────────────────────────────────

/**
 * 典型的なユーザーのaxisScores（既存15軸+Stage1の一部をカバー）
 * スコア範囲: 0.0-1.0（0.5が中央）
 */
const MOCK_AXIS_SCORES: Partial<Record<TraitAxisKey, number>> = {
  // 極端な傾向（deviation > 0.2）
  introvert_vs_extrovert: 0.25,       // 明確な内向傾向
  cautious_vs_bold: 0.78,             // 明確な大胆傾向
  analytical_vs_intuitive: 0.72,      // 明確な直感傾向
  plan_vs_spontaneous: 0.18,          // 明確な計画傾向
  independence_vs_harmony: 0.82,      // 明確な調和傾向
  direct_vs_diplomatic: 0.28,         // 明確な直接傾向
  emotional_variability: 0.75,        // 明確な感情変動傾向
  stress_isolation_vs_social: 0.30,   // ストレス時孤立傾向

  // 中程度の傾向（0.3 < deviation < 0.2）
  individual_vs_social: 0.40,
  change_embrace_vs_resist: 0.62,
  tradition_vs_novelty: 0.58,
  intimacy_pace: 0.65,
  reassurance_need: 0.60,
  social_initiative: 0.35,
  boundary_awareness: 0.55,
  relationship_mode_split: 0.48,

  // 中立付近
  function_vs_expression: 0.52,
  minimal_vs_maximal: 0.50,
  perfectionist_vs_pragmatic: 0.47,
  quality_vs_quantity: 0.53,
  classic_vs_trendy: 0.49,

  // Stage 2 / 3 軸
  consent_maturity: 0.70,
  control_tendency: 0.35,
  emotional_regulation: 0.65,
  attachment_style: 0.40,
  locus_of_control: 0.72,
  growth_mindset: 0.68,
  rumination_tendency: 0.75,

  // 判断合理性・効率性
  rational_vs_emotional_decision: 0.30,
  efficiency_vs_process: 0.65,
};

const MOCK_CONTRADICTIONS: ContradictionInput[] = [
  {
    axisA: "cautious_vs_bold",
    axisB: "plan_vs_spontaneous",
    insight: "普段は大胆に動くが、計画性が非常に高い。大胆さと慎重な計画が共存している。",
    tension: 0.85,
  },
  {
    axisA: "independence_vs_harmony",
    axisB: "direct_vs_diplomatic",
    insight: "周囲との調和を重視するのに、伝え方は直接的。意図と表現にギャップがある。",
    tension: 0.72,
  },
];

// ─── Core Tests ───────────────────────────────────────────

describe("generateDerivedFacts", () => {
  describe("基本動作", () => {
    it("5-8文の派生事実を生成する", () => {
      const input: DerivedFactGeneratorInput = {
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      };

      const result = generateDerivedFacts(input);

      expect(result.facts.length).toBeGreaterThanOrEqual(5);
      expect(result.facts.length).toBeLessThanOrEqual(8);
    });

    it("DerivedFactSetの全フィールドが正しい型を持つ", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      });

      expect(result.facts).toBeInstanceOf(Array);
      expect(typeof result.totalAxesUsed).toBe("number");
      expect(result.totalAxesUsed).toBeGreaterThan(0);
      expect(typeof result.generatedAt).toBe("string");
      expect(result.inputScoresSnapshot).toBeDefined();
    });

    it("各DerivedFactの必須フィールドが存在する", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      });

      for (const fact of result.facts) {
        expect(typeof fact.text).toBe("string");
        expect(fact.text.length).toBeGreaterThan(0);
        expect(["contradiction", "blindspot", "personality", "context"]).toContain(fact.sourceType);
        expect(fact.sourceAxes.length).toBeGreaterThan(0);
        expect(fact.confidence).toBeGreaterThanOrEqual(0);
        expect(fact.confidence).toBeLessThanOrEqual(1);
        expect(typeof fact.generationRule).toBe("string");
      }
    });
  });

  describe("Step 1: 矛盾事実", () => {
    it("矛盾入力がある場合、contradiction型の事実が生成される", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      });

      const contradictionFacts = result.facts.filter((f) => f.sourceType === "contradiction");
      expect(contradictionFacts.length).toBeGreaterThan(0);
      expect(contradictionFacts.length).toBeLessThanOrEqual(2);
    });

    it("矛盾事実のsourceAxesに元の軸ペアが含まれる", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      });

      const contradictionFacts = result.facts.filter((f) => f.sourceType === "contradiction");
      for (const fact of contradictionFacts) {
        expect(fact.sourceAxes.length).toBe(2);
      }
    });

    it("矛盾入力が空の場合、contradiction型は生成されない", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: [],
        blindSpots: [],
        queryDomain: null,
      });

      const contradictionFacts = result.facts.filter((f) => f.sourceType === "contradiction");
      expect(contradictionFacts.length).toBe(0);
    });
  });

  describe("Step 3: 人格事実", () => {
    it("personality型の事実が生成される（極端な軸が十分ある場合）", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: [],
        blindSpots: [],
        queryDomain: null,
      });

      const personalityFacts = result.facts.filter(
        (f) => f.sourceType === "personality" && f.generationRule.startsWith("personality:"),
      );
      expect(personalityFacts.length).toBeGreaterThan(0);
    });
  });

  describe("Step 4: 文脈事実", () => {
    it("queryDomainを指定するとcontext型の事実が生成される", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: [],
        blindSpots: [],
        queryDomain: "judgment",
      });

      const contextFacts = result.facts.filter((f) => f.sourceType === "context");
      expect(contextFacts.length).toBeGreaterThan(0);
    });

    it("queryDomain=nullの場合、context型は生成されない", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: [],
        blindSpots: [],
        queryDomain: null,
      });

      const contextFacts = result.facts.filter((f) => f.sourceType === "context");
      expect(contextFacts.length).toBe(0);
    });
  });

  describe("Step 5: 選出制約", () => {
    it("confidence < 0.3 の事実はフィルタされる", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      });

      for (const fact of result.facts) {
        expect(fact.confidence).toBeGreaterThanOrEqual(0.3);
      }
    });

    it("最低5文が保証される（fallbackあり）", () => {
      // 中立付近のスコアのみ（極端な軸なし）
      const neutralScores: Partial<Record<TraitAxisKey, number>> = {
        introvert_vs_extrovert: 0.50,
        cautious_vs_bold: 0.52,
        analytical_vs_intuitive: 0.48,
        plan_vs_spontaneous: 0.51,
        independence_vs_harmony: 0.49,
        direct_vs_diplomatic: 0.50,
        individual_vs_social: 0.51,
        change_embrace_vs_resist: 0.50,
        tradition_vs_novelty: 0.49,
        stress_isolation_vs_social: 0.51,
        function_vs_expression: 0.50,
        minimal_vs_maximal: 0.49,
        perfectionist_vs_pragmatic: 0.50,
        quality_vs_quantity: 0.51,
        classic_vs_trendy: 0.50,
      };

      const result = generateDerivedFacts({
        axisScores: neutralScores,
        contradictions: [],
        blindSpots: [],
        queryDomain: null,
      });

      expect(result.facts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("frozen軸の処理", () => {
    it("frozen軸（boundary_respect等）のスコアが含まれても正常に処理される", () => {
      const scoresWithFrozen: Partial<Record<TraitAxisKey, number>> = {
        ...MOCK_AXIS_SCORES,
        boundary_respect: 0.70,     // frozen → boundary_awareness に転送
        pressure_risk: 0.80,        // frozen → control_tendency に転送
        exclusivity_pressure: 0.65, // frozen → control_tendency に転送
      };

      const result = generateDerivedFacts({
        axisScores: scoresWithFrozen,
        contradictions: [],
        blindSpots: [],
        queryDomain: null,
      });

      // frozen軸がsourceAxesに出現しないこと
      for (const fact of result.facts) {
        expect(fact.sourceAxes).not.toContain("boundary_respect");
        expect(fact.sourceAxes).not.toContain("pressure_risk");
        expect(fact.sourceAxes).not.toContain("exclusivity_pressure");
      }
    });
  });

  describe("トレーサビリティ", () => {
    it("totalAxesUsedが実際のsourceAxesと一致する", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: null,
      });

      const uniqueAxes = new Set(result.facts.flatMap((f) => f.sourceAxes));
      expect(result.totalAxesUsed).toBe(uniqueAxes.size);
    });

    it("generationRuleが全事実で一意ではないがtraceableである", () => {
      const result = generateDerivedFacts({
        axisScores: MOCK_AXIS_SCORES,
        contradictions: MOCK_CONTRADICTIONS,
        blindSpots: [],
        queryDomain: "judgment",
      });

      for (const fact of result.facts) {
        expect(fact.generationRule).toMatch(/^(contradiction|blindspot|personality|context|fallback):/);
      }
    });
  });
});

// ─── formatDerivedFactsForPrompt Tests ────────────────────

describe("formatDerivedFactsForPrompt", () => {
  it("マークダウン形式のプロンプト文字列を生成する", () => {
    const factSet = generateDerivedFacts({
      axisScores: MOCK_AXIS_SCORES,
      contradictions: MOCK_CONTRADICTIONS,
      blindSpots: [],
      queryDomain: null,
    });

    const prompt = formatDerivedFactsForPrompt(factSet);

    expect(prompt).toContain("### この人の判断と行動の特徴");
    // 各事実が箇条書きで含まれる
    for (const fact of factSet.facts) {
      expect(prompt).toContain(`- ${fact.text}`);
    }
  });

  it("topExtremeAxes指定時に生データ参照セクションが追加される", () => {
    const factSet = generateDerivedFacts({
      axisScores: MOCK_AXIS_SCORES,
      contradictions: [],
      blindSpots: [],
      queryDomain: null,
    });

    const topAxes = [
      { key: "cautious_vs_bold" as TraitAxisKey, score: 0.78 },
      { key: "introvert_vs_extrovert" as TraitAxisKey, score: 0.25 },
    ];

    const prompt = formatDerivedFactsForPrompt(factSet, topAxes);

    expect(prompt).toContain("### 生データ参照（確認用）");
    expect(prompt).toContain("0.78");
  });
});

// ─── serializeDerivedFactsForAnalytics Tests ──────────────

describe("serializeDerivedFactsForAnalytics", () => {
  it("analytics用のシリアライズ形式が正しい", () => {
    const factSet = generateDerivedFacts({
      axisScores: MOCK_AXIS_SCORES,
      contradictions: MOCK_CONTRADICTIONS,
      blindSpots: [],
      queryDomain: null,
    });

    const serialized = serializeDerivedFactsForAnalytics(factSet);

    // derived_facts配列（allCandidates = 全候補を返す。facts = 選出分のみ）
    const expectedLength = (factSet.allCandidates ?? factSet.facts).length;
    expect(serialized.derived_facts).toBeInstanceOf(Array);
    expect(serialized.derived_facts.length).toBe(expectedLength);
    for (const df of serialized.derived_facts) {
      expect(df).toHaveProperty("sourceType");
      expect(df).toHaveProperty("sourceAxes");
      expect(df).toHaveProperty("confidence");
      expect(df).toHaveProperty("generationRule");
      expect(df).toHaveProperty("includedInPrompt");
      expect(typeof df.includedInPrompt).toBe("boolean"); // 候補全体を返すため true/false 混在
    }

    // summary
    expect(serialized.derived_facts_summary.totalGenerated).toBe(expectedLength);
    expect(serialized.derived_facts_summary.totalIncluded).toBe(factSet.facts.length);
    expect(serialized.derived_facts_summary.uniqueAxesUsed).toBe(factSet.totalAxesUsed);
  });
});
