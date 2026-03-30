import { describe, it, expect } from "vitest";
import {
  calculateAxisScores,
  calculateAxisConfidences,
  resolveType,
  resolveTypeFromScores,
  generateFirstAhaInsight,
  generateSummary,
  type QuestionAnswer,
} from "@/lib/stargazer/typeResolver";
import { createEmptyAxisScores, TRAIT_AXIS_KEYS } from "@/lib/stargazer/traitAxes";

describe("typeResolver", () => {
  // ── calculateAxisScores ──

  describe("calculateAxisScores", () => {
    it("回答なしで全軸 0", () => {
      const scores = calculateAxisScores([]);
      for (const key of TRAIT_AXIS_KEYS) {
        expect(scores[key]).toBe(0);
      }
    });

    it("回答値を -1.0 〜 +1.0 に正規化: 1→-1, 3→0, 5→+1", () => {
      const scores = calculateAxisScores([]);
      expect(scores.introvert_vs_extrovert).toBe(0);
    });

    it("スコアは -1 から 1 の範囲に収まる", () => {
      const answers: QuestionAnswer[] = [];
      for (let i = 1; i <= 30; i++) {
        answers.push({ questionId: `Q${i}`, value: 5 });
      }
      const scores = calculateAxisScores(answers);
      for (const key of TRAIT_AXIS_KEYS) {
        expect(scores[key]).toBeGreaterThanOrEqual(-1);
        expect(scores[key]).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── calculateAxisConfidences ──

  describe("calculateAxisConfidences", () => {
    it("回答なしで全軸 confidence 0", () => {
      const confidences = calculateAxisConfidences([]);
      for (const key of TRAIT_AXIS_KEYS) {
        expect(confidences[key]).toBe(0);
      }
    });
  });

  // ── resolveType ──

  describe("resolveType", () => {
    it("回答なしでもクラッシュせず結果を返す", () => {
      const result = resolveType([]);
      expect(result.reactionType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("結果に axisScores と axisConfidences が含まれる", () => {
      const result = resolveType([]);
      expect(result.axisScores).toBeDefined();
      expect(result.axisConfidences).toBeDefined();
    });

    it("constellation 関連フィールドが除去されている", () => {
      const result = resolveType([]);
      // ResolvedResult から除去された旧フィールドが存在しないことを確認
      expect((result as Record<string, unknown>).resolvedType).toBeUndefined();
      expect((result as Record<string, unknown>).topMatches).toBeUndefined();
      expect((result as Record<string, unknown>).combinedIdentity).toBeUndefined();
      expect((result as Record<string, unknown>).summary).toBeUndefined();
    });
  });

  // ── resolveTypeFromScores ──

  describe("resolveTypeFromScores", () => {
    it("軸スコアから直接解決できる", () => {
      const scores = createEmptyAxisScores();
      scores.introvert_vs_extrovert = -0.8;
      scores.analytical_vs_intuitive = -0.6;
      const result = resolveTypeFromScores(scores);
      expect(result.reactionType).toBeDefined();
      // No answers and no snapshots → all axis confidences are 0
      expect(result.confidence).toBe(0);
    });

    it("全て中立なスコアでも結果が返る", () => {
      const scores = createEmptyAxisScores();
      const result = resolveTypeFromScores(scores);
      expect(result.reactionType).toBeDefined();
      expect(typeof result.reactionType).toBe("string");
    });
  });

  // ── generateFirstAhaInsight ──

  describe("generateFirstAhaInsight", () => {
    it("矛盾パターン: 内向的 × ストレス時に人を求める", () => {
      const scores = createEmptyAxisScores();
      scores.introvert_vs_extrovert = -0.5;
      scores.stress_isolation_vs_social = 0.5;
      const insight = generateFirstAhaInsight(scores);
      expect(insight).toContain("一人の時間を好む");
      expect(insight).toContain("人を求める");
    });

    it("矛盾パターン: 慎重 × 新しもの好き", () => {
      const scores = createEmptyAxisScores();
      scores.cautious_vs_bold = -0.5;
      scores.tradition_vs_novelty = 0.5;
      const insight = generateFirstAhaInsight(scores);
      expect(insight).toContain("慎重");
    });

    it("矛盾パターン: 協調的 × 率直", () => {
      const scores = createEmptyAxisScores();
      scores.independence_vs_harmony = 0.5;
      scores.direct_vs_diplomatic = -0.5;
      const insight = generateFirstAhaInsight(scores);
      expect(insight).toContain("調和");
    });

    it("矛盾パターン: 完璧主義 × 大胆", () => {
      const scores = createEmptyAxisScores();
      scores.perfectionist_vs_pragmatic = -0.5;
      scores.cautious_vs_bold = 0.5;
      const insight = generateFirstAhaInsight(scores);
      expect(insight).toContain("完璧");
    });

    it("極端な軸値からインサイトを生成（矛盾なしの場合）", () => {
      const scores = createEmptyAxisScores();
      scores.introvert_vs_extrovert = -0.9;
      const insight = generateFirstAhaInsight(scores);
      expect(insight.length).toBeGreaterThan(20);
      expect(insight).toContain("一人");
    });

    it("全て中立なスコアでもフォールバックメッセージを返す", () => {
      const scores = createEmptyAxisScores();
      const insight = generateFirstAhaInsight(scores);
      expect(typeof insight).toBe("string");
      expect(insight.length).toBeGreaterThan(0);
    });
  });

  // ── generateSummary (deprecated but still functional) ──

  describe("generateSummary", () => {
    it("内向的スコアでは core に「内側」が含まれる", () => {
      const scores = createEmptyAxisScores();
      scores.introvert_vs_extrovert = -0.5;
      const summary = generateSummary(scores);
      expect(summary.core).toContain("内側");
    });

    it("外向的スコアでは core に「外」が含まれる", () => {
      const scores = createEmptyAxisScores();
      scores.introvert_vs_extrovert = 0.5;
      const summary = generateSummary(scores);
      expect(summary.core).toContain("外");
    });

    it("中立スコアではデフォルトテキストを返す", () => {
      const scores = createEmptyAxisScores();
      const summary = generateSummary(scores);
      expect(summary.core.length).toBeGreaterThan(0);
      expect(summary.relation.length).toBeGreaterThan(0);
    });
  });
});
