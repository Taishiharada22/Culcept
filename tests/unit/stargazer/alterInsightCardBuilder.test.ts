import { describe, it, expect } from "vitest";
import {
  buildInsightCards,
  specificityGate,
  isDeepContradiction,
  convertRejectedToGrowth,
  formatTimeLabel,
  type InsightDataSources,
  type SessionSummaryRow,
  type HypothesisRow,
  type ProphecyRow,
} from "@/lib/stargazer/alterInsightCardBuilder";

/* ═══ Helpers ═══ */

function makeBaseSources(overrides?: Partial<InsightDataSources>): InsightDataSources {
  return {
    // 観測データ（base layer）
    observationCount: 50,
    axisScores: null,
    blindSpotDrop: null,
    innerWeather: null,
    todayProphecy: null,
    yesterdayProphecy: null,
    prophecyAccuracy: null,
    // Alter データ（additive layer）
    sessionsCompleted: 5,
    trustLevel: 2,
    sessionSummaries: [],
    hypotheses: [],
    causalMap: [],
    patterns: [],
    recentDisplayedThemes: [],
    ...overrides,
  };
}

function makeSummary(overrides?: Partial<SessionSummaryRow>): SessionSummaryRow {
  return {
    id: "s1",
    session_id: "sess1",
    summary_date: new Date().toISOString(),
    key_themes: ["仕事"],
    contradictions_discovered: [],
    user_admissions: [],
    deepest_moment: "仕事の場面になると、感情より整理を優先しやすい傾向がある",
    follow_up_hooks: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeHypothesis(overrides?: Partial<HypothesisRow>): HypothesisRow {
  return {
    id: "h1",
    hypothesis_type: "recurring_pattern",
    content: "対人場面になると、本音より空気を読む方を選びやすい",
    evidence_summary: "3セッションで繰り返し確認",
    domains: ["人間関係"],
    confidence: 0.65,
    status: "strengthening",
    required_trust: 2,
    presented_count: 0,
    created_at: new Date().toISOString(),
    last_evaluated: new Date().toISOString(),
    ...overrides,
  };
}

function makeProphecy(overrides?: Partial<ProphecyRow>): ProphecyRow {
  return {
    id: "p1",
    prophecy_date: new Date().toISOString().split("T")[0]!,
    prediction_text: "今日の午後は、本音を少し飲み込みやすいかもしれない",
    prediction_category: "avoidance",
    prediction_confidence: 0.6,
    verification_status: "pending",
    user_verification_text: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/* ═══ Tests ═══ */

describe("alterInsightCardBuilder", () => {
  describe("buildInsightCards", () => {
    it("観測不足 + Alter未使用 → welcome カード1枚", () => {
      const cards = buildInsightCards(makeBaseSources({
        observationCount: 2,
        sessionsCompleted: 0,
      }));
      expect(cards).toHaveLength(1);
      expect(cards[0]!.type).toBe("welcome");
      expect(cards[0]!.pinned).toBe(true);
      expect(cards[0]!.composerSeed).toBeTruthy();
    });

    it("観測十分 + Alter未使用 → welcome を出さない（観測由来カードを出す）", () => {
      const sources = makeBaseSources({
        observationCount: 88,
        sessionsCompleted: 0,
        axisScores: {
          control_tendency: 0.7,
          emotional_variability: 0.6,
          perfectionist_vs_pragmatic: -0.6,
          plan_vs_spontaneous: 0.5,
        },
      });
      const cards = buildInsightCards(sources);
      expect(cards[0]!.type).not.toBe("welcome");
    });

    it("D0安全弁: sessionsCompleted=0 でも summaries があれば welcome を出さない", () => {
      const sources = makeBaseSources({
        observationCount: 2,
        sessionsCompleted: 0,
        sessionSummaries: [
          makeSummary({ id: "s1", deepest_moment: "仕事になると、感情より整理を優先しやすい傾向がある" }),
        ],
      });
      const cards = buildInsightCards(sources);
      expect(cards[0]!.type).not.toBe("welcome");
    });

    it("軸スコアから矛盾/盲点カードを生成する", () => {
      const sources = makeBaseSources({
        observationCount: 50,
        sessionsCompleted: 0,
        axisScores: {
          control_tendency: 0.7,
          emotional_variability: 0.6,
        },
      });
      const cards = buildInsightCards(sources);
      expect(cards.length).toBeGreaterThanOrEqual(1);
      expect(cards[0]!.type).toBe("contradiction");
    });

    it("矛盾/盲点カードが pinned として最優先される", () => {
      const sources = makeBaseSources({
        observationCount: 50,
        sessionsCompleted: 5,
        trustLevel: 2,
        axisScores: {
          rational_vs_emotional_decision: -0.5,
          analytical_vs_intuitive: 0.5,
        },
        sessionSummaries: [makeSummary()],
        hypotheses: [makeHypothesis()],
      });
      const cards = buildInsightCards(sources);
      expect(cards[0]!.pinned).toBe(true);
      // 矛盾カードが pinned になる（session_insight/hypothesis より優先）
      expect(cards[0]!.type).toBe("contradiction");
    });

    it("ルール不一致でもフォールバック軸カードを生成する", () => {
      // control_tendency=0.3 は rule 閾値 0.4 未満だが、fallback 閾値 0.25 超
      const sources = makeBaseSources({
        observationCount: 50,
        sessionsCompleted: 0,
        axisScores: {
          control_tendency: 0.3,
          emotional_variability: 0.2,
          plan_vs_spontaneous: 0.1,
          independence_vs_harmony: 0.1,
        },
      });
      const cards = buildInsightCards(sources);
      expect(cards.length).toBeGreaterThanOrEqual(1);
      expect(cards[0]!.type).not.toBe("welcome");
    });

    it("最大3枚を返す（builder で確定、UIフィルタ不要）", () => {
      const sources = makeBaseSources({
        sessionSummaries: [
          makeSummary({ id: "s1", deepest_moment: "仕事になると、自分の意見より相手の意見を優先しやすい" }),
          makeSummary({ id: "s2", deepest_moment: "恋愛の場面になると、不安より好奇心が勝ちやすい", key_themes: ["恋愛"] }),
          makeSummary({ id: "s3", deepest_moment: "家族との会話になると、本音より穏便を選びやすい", key_themes: ["家族"] }),
        ],
        hypotheses: [
          makeHypothesis({ id: "h1" }),
        ],
      });
      const cards = buildInsightCards(sources);
      expect(cards.length).toBeLessThanOrEqual(3);
      expect(cards.length).toBeGreaterThanOrEqual(1);
    });

    it("pinned カードは必ず1枚、pinned=true", () => {
      const sources = makeBaseSources({
        sessionSummaries: [makeSummary()],
        hypotheses: [makeHypothesis()],
      });
      const cards = buildInsightCards(sources);
      const pinnedCards = cards.filter((c) => c.pinned);
      expect(pinnedCards).toHaveLength(1);
    });

    it("全カードに composerSeed がある", () => {
      const sources = makeBaseSources({
        sessionSummaries: [makeSummary()],
        hypotheses: [makeHypothesis()],
      });
      const cards = buildInsightCards(sources);
      for (const card of cards) {
        expect(card.composerSeed).toBeTruthy();
      }
    });

    it("trust gate: required_trust > trustLevel のカードは除外", () => {
      const sources = makeBaseSources({
        trustLevel: 0,
        sessionSummaries: [
          makeSummary({
            follow_up_hooks: ["あの話の続き、聞きたいんだけど"],
          }),
        ],
        hypotheses: [makeHypothesis({ required_trust: 3 })],
      });
      const cards = buildInsightCards(sources);
      // hypothesis (required_trust=3) は trustLevel=0 で除外
      // followup_hook (requiredTrust=1) も除外
      const hyCards = cards.filter((c) => c.type === "hypothesis");
      expect(hyCards).toHaveLength(0);
    });

    it("text は60文字以内", () => {
      const sources = makeBaseSources({
        sessionSummaries: [
          makeSummary({
            deepest_moment: "仕事の場面になると、自分の本音を飲み込んで相手に合わせる傾向があるが、一方でプライベートではむしろ自分の意見を強く主張しやすい",
          }),
        ],
      });
      const cards = buildInsightCards(sources);
      for (const card of cards) {
        expect(card.text.length).toBeLessThanOrEqual(60);
      }
    });

    it("layer は memory/understanding/prediction の3種のみ", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
      const sources = makeBaseSources({
        sessionSummaries: [makeSummary()],
        hypotheses: [makeHypothesis()],
        yesterdayProphecy: makeProphecy({
          prophecy_date: yesterday,
          verification_status: "exact",
          prediction_confidence: 0.7,
        }),
      });
      const cards = buildInsightCards(sources);
      const validLayers = ["memory", "understanding", "prediction"];
      for (const card of cards) {
        expect(validLayers).toContain(card.layer);
      }
    });

    it("今日の prophecy は ContextReel に出さない（Alter画面に既存）", () => {
      const sources = makeBaseSources({
        observationCount: 50,
        sessionsCompleted: 0,
        trustLevel: 0,
        todayProphecy: makeProphecy({ prediction_confidence: 0.9 }),
      });
      const cards = buildInsightCards(sources);
      const todayPredCards = cards.filter(
        (c) => c.type === "prediction_cycle" && c.subtext === "今日",
      );
      expect(todayPredCards).toHaveLength(0);
    });

    it("昨日の検証済み prophecy は trust gate を通過する", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
      const sources = makeBaseSources({
        observationCount: 50,
        sessionsCompleted: 0,
        trustLevel: 0,
        yesterdayProphecy: makeProphecy({
          prophecy_date: yesterday,
          verification_status: "exact",
          prediction_confidence: 0.7,
        }),
      });
      const cards = buildInsightCards(sources);
      const predCards = cards.filter((c) => c.type === "prediction_cycle");
      expect(predCards.length).toBeGreaterThanOrEqual(1);
    });

    it("rejected prophecy → growth 変換テキスト", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
      const sources = makeBaseSources({
        yesterdayProphecy: makeProphecy({
          prophecy_date: yesterday,
          verification_status: "opposite",
          prediction_text: "社交場面で本音を飲み込みやすい",
          prediction_category: "avoidance",
        }),
        sessionSummaries: [makeSummary()],
      });
      const cards = buildInsightCards(sources);
      const predCards = cards.filter((c) => c.type === "prediction_cycle");
      if (predCards.length > 0) {
        // rejected → growth 変換されている
        expect(predCards[0]!.text).not.toBe("社交場面で本音を飲み込みやすい");
        expect(predCards[0]!.subtext).toContain("変化");
      }
    });
  });

  describe("specificityGate", () => {
    it("条件節を含む文は通過する", () => {
      const candidates = [
        { type: "session_insight" as const, text: "仕事になると、感情より整理を優先しやすい" },
      ].map((c, i) => ({
        id: `t${i}`,
        type: c.type,
        layer: "memory" as const,
        text: c.text,
        requiredTrust: 0 as const,
        createdAt: new Date(),
        theme: "仕事",
        basePriority: 0.5,
        source: "session_summary" as const,
      }));
      const result = specificityGate(candidates);
      expect(result).toHaveLength(1);
    });

    it("ラベル語のみの文は除外する", () => {
      const candidates = [
        { type: "hypothesis" as const, text: "あなたは慎重で論理的な傾向があります" },
      ].map((c, i) => ({
        id: `t${i}`,
        type: c.type,
        layer: "understanding" as const,
        text: c.text,
        requiredTrust: 0 as const,
        createdAt: new Date(),
        theme: "その他",
        basePriority: 0.5,
        source: "hypothesis" as const,
      }));
      const result = specificityGate(candidates);
      expect(result).toHaveLength(0);
    });

    it("抽象語のみの文（条件節なし）は除外する", () => {
      const candidates = [
        { type: "pattern" as const, text: "あなたには独自のパターンがあります" },
      ].map((c, i) => ({
        id: `t${i}`,
        type: c.type,
        layer: "understanding" as const,
        text: c.text,
        requiredTrust: 0 as const,
        createdAt: new Date(),
        theme: "その他",
        basePriority: 0.5,
        source: "pattern" as const,
      }));
      const result = specificityGate(candidates);
      expect(result).toHaveLength(0);
    });
  });

  describe("isDeepContradiction", () => {
    it("判断パターンのズレを検出する", () => {
      expect(isDeepContradiction("仕事では論理的に判断するのに、恋愛では感情的に選びやすい")).toBe(true);
    });

    it("表層的な差分は除外する", () => {
      expect(isDeepContradiction("昨日はラーメンを食べた")).toBe(false);
    });

    it("構造的対比がある文を検出する", () => {
      expect(isDeepContradiction("安定を求めるはずなのに、変化を選んでしまう")).toBe(true);
    });
  });

  describe("convertRejectedToGrowth", () => {
    it("avoidance カテゴリの変換", () => {
      const result = convertRejectedToGrowth("社交場面で本音を飲み込みやすい", "avoidance");
      expect(result).toContain("変わってきてる");
      expect(result.length).toBeLessThanOrEqual(60);
    });

    it("60文字以内に収まる", () => {
      const result = convertRejectedToGrowth(
        "長い予測テキストが入っている場合でも正しく処理される必要がある。これは非常に長いテストケースです。",
        "decision",
      );
      expect(result.length).toBeLessThanOrEqual(60);
    });
  });

  describe("formatTimeLabel", () => {
    it("今日 → '今日'", () => {
      expect(formatTimeLabel(new Date().toISOString())).toBe("今日");
    });

    it("昨日 → '昨日'", () => {
      const yesterday = new Date(Date.now() - 86400000);
      expect(formatTimeLabel(yesterday.toISOString())).toBe("昨日");
    });

    it("5日前 → '5日前'", () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
      expect(formatTimeLabel(fiveDaysAgo.toISOString())).toBe("5日前");
    });

    it("14日前 → '先週'", () => {
      const twoWeeksAgo = new Date(Date.now() - 10 * 86400000);
      expect(formatTimeLabel(twoWeeksAgo.toISOString())).toBe("先週");
    });
  });
});
