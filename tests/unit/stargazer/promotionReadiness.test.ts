import { describe, it, expect } from "vitest";
import {
  evaluatePromotionReadiness,
  updateTrackingBuffers,
  DEFAULT_HDM_PHASE_STATE,
  type HdmPhaseState,
  type HdmPhaseInputs,
} from "@/lib/stargazer/hdmPhase";
import type { TrustLevel } from "@/lib/stargazer/alterUnderstanding";

// ── helpers ──

function makeState(overrides: Partial<HdmPhaseState> = {}): HdmPhaseState {
  return { ...DEFAULT_HDM_PHASE_STATE, ...overrides };
}

function makeInputs(overrides: Partial<HdmPhaseInputs> = {}): HdmPhaseInputs {
  return {
    sessionsCompleted: 0,
    currentSessionTurnCount: 0,
    totalTurnCount: 0,
    continuousTrust: 0,
    earnedTrustTotal: 0,
    selfDisclosureDepth: 0,
    causalMapConfidence: 0,
    repairSuccessRate: null,
    understandingCoverage: 0,
    defensePredictionStreak: 0,
    voluntaryTopicExpansionCount: 0,
    ...overrides,
  };
}

// Phase 3→4 の全条件を満たす状態
function readyFor3to4() {
  return {
    state: makeState({
      currentPhase: 3,
      phase3TurnCount: 30,
      recentRuptureFlags: [false, false, false, false, false],
      recentDignityViolations: [false, false, false],
      recentProtectiveSpikes: [false, false, false],
    }),
    inputs: makeInputs({
      sessionsCompleted: 15,
      totalTurnCount: 100,
    }),
    trust: 3 as TrustLevel,
  };
}

// Phase 4→5 の全条件を満たす状態
function readyFor4to5() {
  return {
    state: makeState({
      currentPhase: 4,
      phase4TurnCount: 20,
      p4FireCount: 3,
      recentRuptureFlags: [false, false, false, false, false],
      recentDignityViolations: [false, false, false],
    }),
    inputs: makeInputs({
      sessionsCompleted: 40,
      totalTurnCount: 300,
    }),
    trust: 4 as TrustLevel,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluatePromotionReadiness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluatePromotionReadiness", () => {
  describe("Phase 0-2, 5 → null（判定不要）", () => {
    it.each([0, 1, 2, 5] as const)("Phase %d → null", (phase) => {
      const result = evaluatePromotionReadiness(
        makeState({ currentPhase: phase }),
        makeInputs(),
        0 as TrustLevel,
      );
      expect(result).toBeNull();
    });
  });

  describe("3→4 昇格判定", () => {
    it("全条件充足 → recommend: true", () => {
      const { state, inputs, trust } = readyFor3to4();
      const result = evaluatePromotionReadiness(state, inputs, trust);
      expect(result).not.toBeNull();
      expect(result!.recommend).toBe(true);
      expect(result!.transition).toBe("3→4");
      expect(result!.missingConditions).toHaveLength(0);
    });

    it("sessions 不足 → recommend: false", () => {
      const { state, inputs, trust } = readyFor3to4();
      inputs.sessionsCompleted = 14;
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("sessions"))).toBe(true);
    });

    it("trust 不足 → recommend: false", () => {
      const { state, inputs } = readyFor3to4();
      const result = evaluatePromotionReadiness(state, inputs, 2 as TrustLevel)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("trust"))).toBe(true);
    });

    it("phase3TurnCount 不足 → recommend: false", () => {
      const { state, inputs, trust } = readyFor3to4();
      state.phase3TurnCount = 29;
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("phase3Turns"))).toBe(true);
    });

    it("直近 rupture あり → recommend: false", () => {
      const { state, inputs, trust } = readyFor3to4();
      state.recentRuptureFlags = [false, false, true];
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("rupture"))).toBe(true);
    });

    it("dignity violation あり → recommend: false", () => {
      const { state, inputs, trust } = readyFor3to4();
      state.recentDignityViolations = [false, true, false];
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("dignity"))).toBe(true);
    });

    it("protective spike あり → recommend: false", () => {
      const { state, inputs, trust } = readyFor3to4();
      state.recentProtectiveSpikes = [true, false, false];
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("protective"))).toBe(true);
    });
  });

  describe("4→5 昇格判定", () => {
    it("全条件充足 → recommend: true", () => {
      const { state, inputs, trust } = readyFor4to5();
      const result = evaluatePromotionReadiness(state, inputs, trust);
      expect(result).not.toBeNull();
      expect(result!.recommend).toBe(true);
      expect(result!.transition).toBe("4→5");
      expect(result!.missingConditions).toHaveLength(0);
    });

    it("trust 不足 → recommend: false", () => {
      const { state, inputs } = readyFor4to5();
      const result = evaluatePromotionReadiness(state, inputs, 3 as TrustLevel)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("trust"))).toBe(true);
    });

    it("p4FireCount 不足 → recommend: false", () => {
      const { state, inputs, trust } = readyFor4to5();
      state.p4FireCount = 2;
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
      expect(result.missingConditions.some(c => c.includes("p4Fire"))).toBe(true);
    });

    it("phase4TurnCount 不足 → recommend: false", () => {
      const { state, inputs, trust } = readyFor4to5();
      state.phase4TurnCount = 19;
      const result = evaluatePromotionReadiness(state, inputs, trust)!;
      expect(result.recommend).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// updateTrackingBuffers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("updateTrackingBuffers", () => {
  it("dignity + spike を追加、固定長バッファ（最大10件）", () => {
    const state = makeState({ currentPhase: 3 });
    const updated = updateTrackingBuffers(state, true, false, false);
    expect(updated.recentDignityViolations).toEqual([true]);
    expect(updated.recentProtectiveSpikes).toEqual([false]);
  });

  it("11件目で先頭が切り落とされる", () => {
    const existing = new Array(10).fill(false) as boolean[];
    const state = makeState({
      currentPhase: 3,
      recentDignityViolations: existing,
    });
    const updated = updateTrackingBuffers(state, true, false, false);
    expect(updated.recentDignityViolations).toHaveLength(10);
    expect(updated.recentDignityViolations![9]).toBe(true);
    expect(updated.recentDignityViolations![0]).toBe(false);
  });

  it("Phase 3 滞在中 → phase3TurnCount をインクリメント", () => {
    const state = makeState({ currentPhase: 3, phase3TurnCount: 5 });
    const updated = updateTrackingBuffers(state, false, false, false);
    expect(updated.phase3TurnCount).toBe(6);
  });

  it("Phase 4 滞在中 → phase4TurnCount をインクリメント", () => {
    const state = makeState({ currentPhase: 4, phase4TurnCount: 10 });
    const updated = updateTrackingBuffers(state, false, false, false);
    expect(updated.phase4TurnCount).toBe(11);
  });

  it("Phase 3 で初回 → phase3EnteredAt が設定される", () => {
    const state = makeState({ currentPhase: 3 });
    const updated = updateTrackingBuffers(state, false, false, false);
    expect(updated.phase3EnteredAt).not.toBeNull();
  });

  it("Phase 3 で既存 → phase3EnteredAt は変更されない", () => {
    const existing = "2026-01-01T00:00:00.000Z";
    const state = makeState({ currentPhase: 3, phase3EnteredAt: existing });
    const updated = updateTrackingBuffers(state, false, false, false);
    expect(updated.phase3EnteredAt).toBe(existing);
  });

  it("p4Fired → p4FireCount をインクリメント", () => {
    const state = makeState({ currentPhase: 4, p4FireCount: 2 });
    const updated = updateTrackingBuffers(state, false, false, true);
    expect(updated.p4FireCount).toBe(3);
  });

  it("p4 not fired → p4FireCount 変化なし", () => {
    const state = makeState({ currentPhase: 4, p4FireCount: 2 });
    const updated = updateTrackingBuffers(state, false, false, false);
    expect(updated.p4FireCount).toBe(2);
  });
});
