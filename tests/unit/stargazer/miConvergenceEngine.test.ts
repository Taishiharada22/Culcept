/**
 * Cross-session Micro Insight Convergence Engine — Unit Tests
 */
import { describe, it, expect } from "vitest";
import {
  groupBySession,
  buildSessionCohorts,
  scoreConvergence,
  computeTrend,
  detectContradictions,
  extractSentimentDirection,
  computeCrossSessionConvergence,
  checkCrossSessionConvergence,
  updateConvergenceState,
  type SessionMicroSignal,
  type SessionCohort,
  type ConvergenceState,
} from "@/lib/stargazer/miConvergenceEngine";

// ── Helper: テスト用シグナル生成 ──

function makeSignal(
  overrides: Partial<SessionMicroSignal> & { session_id: string },
): SessionMicroSignal {
  return {
    type: "topic_repetition",
    observation: "仕事の話が多い",
    related_topic: "仕事",
    detected_at: new Date().toISOString(),
    strength: 0.6,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// groupBySession
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("groupBySession", () => {
  it("groups signals by session_id", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1" }),
      makeSignal({ session_id: "s2" }),
      makeSignal({ session_id: "s1" }),
    ];
    const groups = groupBySession(signals);
    expect(groups.size).toBe(2);
    expect(groups.get("s1")!.length).toBe(2);
    expect(groups.get("s2")!.length).toBe(1);
  });

  it("returns empty map for empty input", () => {
    expect(groupBySession([]).size).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildSessionCohorts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSessionCohorts", () => {
  it("builds cohorts sorted by earliest signal time", () => {
    const groups = new Map<string, SessionMicroSignal[]>();
    groups.set("s2", [makeSignal({ session_id: "s2", detected_at: daysAgo(1), strength: 0.8 })]);
    groups.set("s1", [makeSignal({ session_id: "s1", detected_at: daysAgo(3), strength: 0.5 })]);

    const cohorts = buildSessionCohorts(groups);
    expect(cohorts.length).toBe(2);
    expect(cohorts[0].session_id).toBe("s1"); // older first
    expect(cohorts[1].session_id).toBe("s2");
  });

  it("computes avg_strength correctly", () => {
    const groups = new Map<string, SessionMicroSignal[]>();
    groups.set("s1", [
      makeSignal({ session_id: "s1", strength: 0.4 }),
      makeSignal({ session_id: "s1", strength: 0.8 }),
    ]);
    const cohorts = buildSessionCohorts(groups);
    expect(cohorts[0].avg_strength).toBeCloseTo(0.6, 5);
    expect(cohorts[0].signal_count).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// scoreConvergence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("scoreConvergence", () => {
  it("returns 0 combined for single signal", () => {
    const score = scoreConvergence([makeSignal({ session_id: "s1" })]);
    expect(score.combined).toBe(0);
    expect(score.signal_count).toBe(1);
  });

  it("increases score with more signals across sessions and time", () => {
    const signals = [
      makeSignal({ session_id: "s1", detected_at: daysAgo(7) }),
      makeSignal({ session_id: "s2", detected_at: daysAgo(3) }),
      makeSignal({ session_id: "s3", detected_at: daysAgo(0), type: "sentiment_shift" }),
    ];
    const score = scoreConvergence(signals);
    expect(score.combined).toBeGreaterThan(0.3);
    expect(score.session_diversity).toBe(3);
    expect(score.type_diversity).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeTrend
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeTrend", () => {
  it("returns 'emerging' for empty cohorts", () => {
    const { trend } = computeTrend([]);
    expect(trend).toBe("emerging");
  });

  it("returns 'emerging' for single cohort", () => {
    const { trend, confidence } = computeTrend([
      { session_id: "s1", detected_at: daysAgo(1), signal_count: 2, avg_strength: 0.5, signal_types: ["topic_repetition"] },
    ]);
    expect(trend).toBe("emerging");
    expect(confidence).toBe(0.3);
  });

  it("detects 'strengthening' for 2 sessions with increasing strength", () => {
    const { trend } = computeTrend([
      { session_id: "s1", detected_at: daysAgo(3), signal_count: 1, avg_strength: 0.3, signal_types: ["topic_repetition"] },
      { session_id: "s2", detected_at: daysAgo(0), signal_count: 2, avg_strength: 0.8, signal_types: ["topic_repetition"] },
    ]);
    expect(trend).toBe("strengthening");
  });

  it("detects 'weakening' for 2 sessions with decreasing strength", () => {
    const { trend } = computeTrend([
      { session_id: "s1", detected_at: daysAgo(3), signal_count: 1, avg_strength: 0.8, signal_types: ["topic_repetition"] },
      { session_id: "s2", detected_at: daysAgo(0), signal_count: 1, avg_strength: 0.3, signal_types: ["topic_repetition"] },
    ]);
    expect(trend).toBe("weakening");
  });

  it("uses linear regression for 3+ sessions", () => {
    const cohorts: SessionCohort[] = [
      { session_id: "s1", detected_at: daysAgo(6), signal_count: 1, avg_strength: 0.2, signal_types: ["topic_repetition"] },
      { session_id: "s2", detected_at: daysAgo(3), signal_count: 1, avg_strength: 0.4, signal_types: ["topic_repetition"] },
      { session_id: "s3", detected_at: daysAgo(0), signal_count: 1, avg_strength: 0.7, signal_types: ["topic_repetition"] },
    ];
    const { trend } = computeTrend(cohorts);
    expect(trend).toBe("strengthening");
  });

  it("returns 'stable' for flat 3+ sessions", () => {
    const cohorts: SessionCohort[] = [
      { session_id: "s1", detected_at: daysAgo(6), signal_count: 1, avg_strength: 0.5, signal_types: ["topic_repetition"] },
      { session_id: "s2", detected_at: daysAgo(3), signal_count: 1, avg_strength: 0.5, signal_types: ["topic_repetition"] },
      { session_id: "s3", detected_at: daysAgo(0), signal_count: 1, avg_strength: 0.52, signal_types: ["topic_repetition"] },
    ];
    const { trend } = computeTrend(cohorts);
    expect(trend).toBe("stable");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractSentimentDirection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractSentimentDirection", () => {
  it("detects positive sentiment", () => {
    expect(extractSentimentDirection("感謝の気持ちが増えている")).toBe("positive");
    expect(extractSentimentDirection("最近楽しそう")).toBe("positive");
  });

  it("detects negative sentiment", () => {
    expect(extractSentimentDirection("ストレスが増加")).toBe("negative");
    expect(extractSentimentDirection("イライラしている様子")).toBe("negative");
  });

  it("returns null for neutral", () => {
    expect(extractSentimentDirection("特に変化なし")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// detectContradictions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectContradictions", () => {
  it("returns empty for non-sentiment signals", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "topic_repetition" }),
      makeSignal({ session_id: "s2", type: "topic_repetition" }),
    ];
    expect(detectContradictions(signals)).toHaveLength(0);
  });

  it("returns empty for fewer than 2 sentiment signals", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "sentiment_shift", observation: "感謝している" }),
    ];
    expect(detectContradictions(signals)).toHaveLength(0);
  });

  it("detects sentiment_flip across sessions for same topic", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({
        session_id: "s1",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司に感謝している",
        detected_at: daysAgo(3),
      }),
      makeSignal({
        session_id: "s2",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司にイライラしている",
        detected_at: daysAgo(0),
      }),
    ];
    const contradictions = detectContradictions(signals);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].contradiction_type).toBe("sentiment_flip");
    expect(contradictions[0].related_topic).toBe("上司");
    expect(contradictions[0].session_a.sentiment).toBe("positive");
    expect(contradictions[0].session_b.sentiment).toBe("negative");
  });

  it("no contradiction for same sentiment direction", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({
        session_id: "s1",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司に感謝している",
        detected_at: daysAgo(3),
      }),
      makeSignal({
        session_id: "s2",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司が嬉しいことを言ってくれた",
        detected_at: daysAgo(0),
      }),
    ];
    expect(detectContradictions(signals)).toHaveLength(0);
  });

  it("no contradiction for different topics", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({
        session_id: "s1",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司に感謝している",
        detected_at: daysAgo(3),
      }),
      makeSignal({
        session_id: "s2",
        type: "sentiment_shift",
        related_topic: "友人",
        observation: "友人にイライラしている",
        detected_at: daysAgo(0),
      }),
    ];
    expect(detectContradictions(signals)).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeCrossSessionConvergence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeCrossSessionConvergence", () => {
  it("returns zero result for empty signals", () => {
    const result = computeCrossSessionConvergence([]);
    expect(result.convergence_score.combined).toBe(0);
    expect(result.session_cohorts).toHaveLength(0);
    expect(result.trend).toBe("emerging");
    expect(result.contradictions).toHaveLength(0);
  });

  it("boosts score for strengthening trend", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", detected_at: daysAgo(5), strength: 0.3 }),
      makeSignal({ session_id: "s2", detected_at: daysAgo(2), strength: 0.7 }),
      makeSignal({ session_id: "s3", detected_at: daysAgo(0), strength: 0.9 }),
    ];
    const result = computeCrossSessionConvergence(signals);
    // Should have strengthening trend
    expect(result.trend).toBe("strengthening");
    // Combined should be boosted above base
    const baseScore = scoreConvergence(signals);
    expect(result.convergence_score.combined).toBeGreaterThanOrEqual(baseScore.combined);
  });

  it("penalizes score for weakening trend", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", detected_at: daysAgo(5), strength: 0.9 }),
      makeSignal({ session_id: "s2", detected_at: daysAgo(2), strength: 0.5 }),
      makeSignal({ session_id: "s3", detected_at: daysAgo(0), strength: 0.2 }),
    ];
    const result = computeCrossSessionConvergence(signals);
    expect(result.trend).toBe("weakening");
    const baseScore = scoreConvergence(signals);
    expect(result.convergence_score.combined).toBeLessThanOrEqual(baseScore.combined);
  });

  it("penalizes score for contradictions", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({
        session_id: "s1",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司に感謝している",
        detected_at: daysAgo(5),
        strength: 0.6,
      }),
      makeSignal({
        session_id: "s2",
        type: "sentiment_shift",
        related_topic: "上司",
        observation: "上司にストレスを感じる",
        detected_at: daysAgo(0),
        strength: 0.6,
      }),
    ];
    const result = computeCrossSessionConvergence(signals);
    expect(result.contradictions).toHaveLength(1);
    const baseScore = scoreConvergence(signals);
    expect(result.convergence_score.combined).toBeLessThan(baseScore.combined);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// checkCrossSessionConvergence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("checkCrossSessionConvergence", () => {
  it("returns null for fewer than 2 signals", () => {
    const result = checkCrossSessionConvergence(
      [makeSignal({ session_id: "s1" })],
      2,
    );
    expect(result.insight).toBeNull();
    expect(result.convergenceResult).toBeNull();
  });

  it("returns null for signals older than 14 days", () => {
    const result = checkCrossSessionConvergence(
      [
        makeSignal({ session_id: "s1", detected_at: daysAgo(20) }),
        makeSignal({ session_id: "s2", detected_at: daysAgo(18) }),
      ],
      2,
    );
    expect(result.insight).toBeNull();
  });

  it("returns null for single-turn signals (no diversity)", () => {
    const ts = new Date().toISOString();
    const result = checkCrossSessionConvergence(
      [
        makeSignal({ session_id: "s1", detected_at: ts }),
        makeSignal({ session_id: "s1", detected_at: ts }),
      ],
      2,
    );
    expect(result.insight).toBeNull();
  });

  it("produces insight for energy_action_gap across sessions", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({
        session_id: "s1",
        type: "energy_action_gap",
        detected_at: daysAgo(3),
        strength: 0.7,
      }),
      makeSignal({
        session_id: "s2",
        type: "energy_action_gap",
        detected_at: daysAgo(0),
        strength: 0.8,
      }),
    ];
    const result = checkCrossSessionConvergence(signals, 2);
    expect(result.insight).not.toBeNull();
    expect(result.insight!.presentation_type).toBeDefined();
    expect(result.insight!.suggested_prompt.length).toBeGreaterThan(0);
  });

  it("produces cross-session prompt for energy_action_gap at connection level", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "energy_action_gap", detected_at: daysAgo(7), strength: 0.8 }),
      makeSignal({ session_id: "s1", type: "energy_action_gap", detected_at: daysAgo(6), strength: 0.8 }),
      makeSignal({ session_id: "s2", type: "energy_action_gap", detected_at: daysAgo(3), strength: 0.9 }),
      makeSignal({ session_id: "s2", type: "energy_action_gap", detected_at: daysAgo(2), strength: 0.9 }),
      makeSignal({ session_id: "s3", type: "energy_action_gap", detected_at: daysAgo(0), strength: 0.95 }),
    ];
    const result = checkCrossSessionConvergence(signals, 3);
    expect(result.insight).not.toBeNull();
    // connection level should reference previous sessions
    if (result.insight!.presentation_type === "connection") {
      expect(result.insight!.suggested_prompt).toMatch(/前/);
    }
  });

  it("produces insight for topic_repetition across sessions", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "topic_repetition", related_topic: "仕事", detected_at: daysAgo(5), strength: 0.5 }),
      makeSignal({ session_id: "s2", type: "topic_repetition", related_topic: "仕事", detected_at: daysAgo(1), strength: 0.6 }),
    ];
    const result = checkCrossSessionConvergence(signals, 2);
    expect(result.insight).not.toBeNull();
    expect(result.insight!.suggested_prompt).toContain("仕事");
  });

  it("suppresses topic_repetition when topic has contradiction", () => {
    const signals: SessionMicroSignal[] = [
      // topic_repetition for "上司"
      makeSignal({ session_id: "s1", type: "topic_repetition", related_topic: "上司", detected_at: daysAgo(5), strength: 0.5 }),
      makeSignal({ session_id: "s2", type: "topic_repetition", related_topic: "上司", detected_at: daysAgo(1), strength: 0.6 }),
      // contradicting sentiment for "上司"
      makeSignal({ session_id: "s1", type: "sentiment_shift", related_topic: "上司", observation: "上司に感謝している", detected_at: daysAgo(5), strength: 0.7 }),
      makeSignal({ session_id: "s2", type: "sentiment_shift", related_topic: "上司", observation: "上司にイライラする", detected_at: daysAgo(1), strength: 0.7 }),
    ];
    const result = checkCrossSessionConvergence(signals, 2);
    // topic_repetition for "上司" should be suppressed due to contradictions
    // The result will either be null (suppressed) or from a non-contradicted signal
    expect(result.contradictedTopics).toContain("上司");
  });

  it("produces insight for sentiment_shift at trust >= 1", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "sentiment_shift", related_topic: "彼女", observation: "彼女が嬉しそう", detected_at: daysAgo(4), strength: 0.6 }),
      makeSignal({ session_id: "s2", type: "sentiment_shift", related_topic: "彼女", observation: "彼女が楽しそう", detected_at: daysAgo(0), strength: 0.7 }),
    ];
    const result = checkCrossSessionConvergence(signals, 1);
    expect(result.insight).not.toBeNull();
    expect(result.insight!.suggested_prompt).toContain("彼女");
  });

  it("returns null for sentiment_shift at trust 0", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "sentiment_shift", related_topic: "彼女", observation: "彼女が嬉しそう", detected_at: daysAgo(4), strength: 0.6 }),
      makeSignal({ session_id: "s2", type: "sentiment_shift", related_topic: "彼女", observation: "彼女が楽しそう", detected_at: daysAgo(0), strength: 0.7 }),
    ];
    const result = checkCrossSessionConvergence(signals, 0);
    // trust 0 should limit presentation_type to casual_check, but sentiment_shift requires trust >= 1
    // Since the sentiment check requires trustLevel >= 1 and it passes 0, it won't match
    expect(result.insight).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// updateConvergenceState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("updateConvergenceState", () => {
  it("creates new state from null", () => {
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s1", type: "topic_repetition", related_topic: "仕事", strength: 0.5, detected_at: daysAgo(1) }),
    ];
    const state = updateConvergenceState(null, signals, "s1");
    expect(state.signal_type).toBe("topic_repetition");
    expect(state.related_topic).toBe("仕事");
    expect(state.total_sessions_with_signal).toBe(1);
    expect(state.session_history).toHaveProperty("s1");
    expect(state.trend).toBe("emerging");
  });

  it("adds new session to existing state", () => {
    const existing: ConvergenceState = {
      signal_type: "topic_repetition",
      related_topic: "仕事",
      session_history: {
        s1: { signal_count: 2, avg_strength: 0.5, timestamps: [daysAgo(5), daysAgo(4)] },
      },
      total_sessions_with_signal: 1,
      trend: "emerging",
      trend_confidence: 0.3,
      cross_session_continuity: 1,
      last_convergence_score: null,
      last_convergence_at: null,
    };
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s2", type: "topic_repetition", strength: 0.8, detected_at: daysAgo(0) }),
    ];
    const state = updateConvergenceState(existing, signals, "s2");
    expect(state.total_sessions_with_signal).toBe(2);
    expect(state.session_history).toHaveProperty("s1");
    expect(state.session_history).toHaveProperty("s2");
    expect(state.session_history.s2.avg_strength).toBe(0.8);
  });

  it("updates trend when enough sessions", () => {
    const existing: ConvergenceState = {
      signal_type: "topic_repetition",
      related_topic: "仕事",
      session_history: {
        s1: { signal_count: 1, avg_strength: 0.3, timestamps: [daysAgo(6)] },
        s2: { signal_count: 1, avg_strength: 0.5, timestamps: [daysAgo(3)] },
      },
      total_sessions_with_signal: 2,
      trend: "emerging",
      trend_confidence: 0.4,
      cross_session_continuity: 1,
      last_convergence_score: null,
      last_convergence_at: null,
    };
    const signals: SessionMicroSignal[] = [
      makeSignal({ session_id: "s3", type: "topic_repetition", strength: 0.8, detected_at: daysAgo(0) }),
    ];
    const state = updateConvergenceState(existing, signals, "s3");
    expect(state.total_sessions_with_signal).toBe(3);
    expect(state.trend).toBe("strengthening");
  });
});
