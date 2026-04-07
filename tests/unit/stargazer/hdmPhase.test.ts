import { describe, it, expect } from "vitest";
import {
  type HdmPhase,
  type HdmPhaseState,
  type HdmPhaseInputs,
  type RegressionSignal,
  type RegressionContext,
  HDM_PHASE_LABELS,
  HDM_PHASE_LABELS_JA,
  AUTO_TRANSITION_CEILING,
  DEFAULT_HDM_PHASE_STATE,
  LENS_SURFACE_HINTS,
  computeAutoTransition,
  hdmPhaseToTrustLevel,
  getPhaseResponseDepth,
  resolveEffectiveDepth,
  gateLensPrompt,
  computeRegression,
  computeSoftRecovery,
  canRecoverFromHardRegression,
  resolveHardRegression,
  detectRegressionSignal,
  orchestrateRegression,
  buildHdmInputsFromProactive,
  migrateLegacyPhase,
  buildHdmPhaseAnalytics,
} from "@/lib/stargazer/hdmPhase";

// ── helpers ──

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

function makeState(overrides: Partial<HdmPhaseState> = {}): HdmPhaseState {
  return { ...DEFAULT_HDM_PHASE_STATE, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 型定義・定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("HDM Phase 型定義・定数", () => {
  it("6フェーズ全てにラベルが定義されている", () => {
    for (let i = 0; i <= 5; i++) {
      expect(HDM_PHASE_LABELS[i as HdmPhase]).toBeTruthy();
      expect(HDM_PHASE_LABELS_JA[i as HdmPhase]).toBeTruthy();
    }
  });

  it("AUTO_TRANSITION_CEILING は 2", () => {
    expect(AUTO_TRANSITION_CEILING).toBe(2);
  });

  it("デフォルト状態は Phase 0", () => {
    expect(DEFAULT_HDM_PHASE_STATE.currentPhase).toBe(0);
    expect(DEFAULT_HDM_PHASE_STATE.manualOverride).toBeNull();
    expect(DEFAULT_HDM_PHASE_STATE.hardRegressionActive).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Floor 条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Floor 条件", () => {
  it("Phase 0→1: 3セッション + 8ターン + metric → 遷移", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        voluntaryTopicExpansionCount: 2,
      }),
    );
    expect(r.phase).toBe(1);
    expect(r.transitioned).toBe(true);
  });

  it("Phase 0→1: セッション不足 → ブロック", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 2,
        totalTurnCount: 8,
        voluntaryTopicExpansionCount: 2,
      }),
    );
    expect(r.phase).toBe(0);
    expect(r.transitioned).toBe(false);
    expect(r.blockedReason).toContain("floor_not_met");
  });

  it("Phase 0→1: 初回セッション6ターン fallback で遷移", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 0,
        currentSessionTurnCount: 6,
        totalTurnCount: 6,
        voluntaryTopicExpansionCount: 2,
      }),
    );
    expect(r.phase).toBe(1);
    expect(r.transitioned).toBe(true);
  });

  it("Phase 0→1: 初回セッション5ターン → fallback 不足でブロック", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 0,
        currentSessionTurnCount: 5,
        totalTurnCount: 5,
        voluntaryTopicExpansionCount: 2,
      }),
    );
    expect(r.phase).toBe(0);
    expect(r.transitioned).toBe(false);
  });

  it("Phase 1→2: 6セッション + 20ターン + metric → 遷移", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 20,
        defensePredictionStreak: 3,
      }),
    );
    expect(r.phase).toBe(2);
    expect(r.transitioned).toBe(true);
  });

  it("Phase 1→2: セッション不足 → ブロック", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 5,
        totalTurnCount: 20,
        defensePredictionStreak: 3,
      }),
    );
    expect(r.phase).toBe(1);
    expect(r.transitioned).toBe(false);
    expect(r.blockedReason).toContain("floor_not_met");
  });

  it("Phase 1→2: ターン数不足 → ブロック", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 19,
        defensePredictionStreak: 3,
      }),
    );
    expect(r.phase).toBe(1);
    expect(r.transitioned).toBe(false);
  });

  it("Phase 1→2: inSessionFallback は Phase 1→2 には存在しない", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 0,
        currentSessionTurnCount: 100,
        totalTurnCount: 100,
        defensePredictionStreak: 3,
      }),
    );
    expect(r.phase).toBe(1);
    expect(r.transitioned).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Metric 条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Metric 条件", () => {
  it("Phase 0→1: voluntaryTopicExpansion 2回 → metric 達成", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        voluntaryTopicExpansionCount: 2,
      }),
    );
    expect(r.phase1MetricsMet).toBe(true);
    expect(r.phase).toBe(1);
  });

  it("Phase 0→1: earnedTrust 3.0 → 代替パスで metric 達成", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        earnedTrustTotal: 3.0,
      }),
    );
    expect(r.phase1MetricsMet).toBe(true);
    expect(r.phase).toBe(1);
  });

  it("Phase 0→1: selfDisclosureDepth 0.4 → 代替パスで metric 達成", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        selfDisclosureDepth: 0.4,
      }),
    );
    expect(r.phase1MetricsMet).toBe(true);
  });

  it("Phase 0→1: metric 全て不足 → ブロック", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        voluntaryTopicExpansionCount: 1,
        earnedTrustTotal: 2.9,
        selfDisclosureDepth: 0.3,
      }),
    );
    expect(r.phase1MetricsMet).toBe(false);
    expect(r.phase).toBe(0);
    expect(r.blockedReason).toContain("metrics_not_met");
  });

  it("Phase 1→2: defensePredictionStreak 3 → 主条件達成", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 20,
        defensePredictionStreak: 3,
      }),
    );
    expect(r.phase2MetricsMet).toBe(true);
    expect(r.phase).toBe(2);
  });

  it("Phase 1→2: 代替パス（複合2条件以上） → metric 達成", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 20,
        defensePredictionStreak: 0,
        earnedTrustTotal: 8.0,
        selfDisclosureDepth: 0.6,
      }),
    );
    expect(r.phase2MetricsMet).toBe(true);
    expect(r.phase).toBe(2);
  });

  it("Phase 1→2: 代替パス1条件のみ → metric 不足", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 20,
        defensePredictionStreak: 0,
        earnedTrustTotal: 8.0,
        selfDisclosureDepth: 0.5,
      }),
    );
    expect(r.phase2MetricsMet).toBe(false);
    expect(r.phase).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Auto Transition Ceiling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Auto Transition Ceiling", () => {
  it("Phase 2 から 3 へは自動遷移しない", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 2 }),
      makeInputs({
        sessionsCompleted: 100,
        totalTurnCount: 500,
        continuousTrust: 1.0,
        earnedTrustTotal: 100,
        selfDisclosureDepth: 1.0,
        causalMapConfidence: 1.0,
        repairSuccessRate: 1.0,
        understandingCoverage: 1.0,
        defensePredictionStreak: 100,
        voluntaryTopicExpansionCount: 100,
      }),
    );
    expect(r.phase).toBe(2);
    expect(r.transitioned).toBe(false);
    expect(r.blockedReason).toBe("at_auto_ceiling");
  });

  it("Phase 3（manual gate 到達済み）でも自動遷移しない", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 3 }),
      makeInputs({ sessionsCompleted: 100, totalTurnCount: 500 }),
    );
    expect(r.phase).toBe(3);
    expect(r.transitioned).toBe(false);
  });

  it("manual override で ceiling が下がる", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 0, manualOverride: 1 }),
      makeInputs({
        sessionsCompleted: 10,
        totalTurnCount: 50,
        voluntaryTopicExpansionCount: 5,
        defensePredictionStreak: 10,
      }),
    );
    // Phase 0→1 は遷移するが、1→2 は manual override=1 で止まる
    expect(r.phase).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. TrustLevel 派生
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("hdmPhaseToTrustLevel", () => {
  it("Phase 0→T0, 1→T1, 2→T2, 3→T3, 4→T4, 5→T4", () => {
    expect(hdmPhaseToTrustLevel(0)).toBe(0);
    expect(hdmPhaseToTrustLevel(1)).toBe(1);
    expect(hdmPhaseToTrustLevel(2)).toBe(2);
    expect(hdmPhaseToTrustLevel(3)).toBe(3);
    expect(hdmPhaseToTrustLevel(4)).toBe(4);
    expect(hdmPhaseToTrustLevel(5)).toBe(4);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Phase Response Depth マトリクス
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getPhaseResponseDepth", () => {
  it("Phase 0: 全レンズ off, 差分なし, 反事実なし", () => {
    const d = getPhaseResponseDepth(0);
    expect(d.narrativeLens).toBe("off");
    expect(d.bodyLens).toBe("off");
    expect(d.partsLens).toBe("off");
    expect(d.memoryPolicy).toBe("exclude_all");
    expect(d.differenceAccess).toBe(false);
    expect(d.counterfactualAccess).toBe(false);
  });

  it("Phase 1: narrative surface のみ, memory hedged", () => {
    const d = getPhaseResponseDepth(1);
    expect(d.narrativeLens).toBe("surface");
    expect(d.bodyLens).toBe("off");
    expect(d.partsLens).toBe("off");
    expect(d.memoryPolicy).toBe("hedged_only");
    expect(d.differenceAccess).toBe(false);
  });

  it("Phase 2: narrative full, body/parts surface, 差分あり, 反事実なし", () => {
    const d = getPhaseResponseDepth(2);
    expect(d.narrativeLens).toBe("full");
    expect(d.bodyLens).toBe("surface");
    expect(d.partsLens).toBe("surface");
    expect(d.memoryPolicy).toBe("full");
    expect(d.differenceAccess).toBe(true);
    expect(d.counterfactualAccess).toBe(false);
  });

  it("Phase 3: 全レンズ full, 差分あり, 反事実なし（本人化前に多視点解禁しない）", () => {
    const d = getPhaseResponseDepth(3);
    expect(d.narrativeLens).toBe("full");
    expect(d.bodyLens).toBe("full");
    expect(d.partsLens).toBe("full");
    expect(d.memoryPolicy).toBe("full");
    expect(d.differenceAccess).toBe(true);
    expect(d.counterfactualAccess).toBe(false);
  });

  it("Phase 4: 反事実解禁", () => {
    const d = getPhaseResponseDepth(4);
    expect(d.counterfactualAccess).toBe(true);
  });

  it("Phase 5: 全解禁", () => {
    const d = getPhaseResponseDepth(5);
    expect(d.counterfactualAccess).toBe(true);
    expect(d.narrativeLens).toBe("full");
    expect(d.bodyLens).toBe("full");
    expect(d.partsLens).toBe("full");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Regression（後退）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Regression", () => {
  describe("Soft regression", () => {
    it("Phase 2 → soft → Phase 1", () => {
      const signal: RegressionSignal = {
        type: "soft",
        cause: "reactive_spike",
        stepsBack: 1,
        requireRequalification: false,
      };
      const result = computeRegression(makeState({ currentPhase: 2 }), signal);
      expect(result.currentPhase).toBe(1);
      expect(result.hardRegressionActive).toBe(false);
    });

    it("Phase 0 → soft → Phase 0（下限）", () => {
      const signal: RegressionSignal = {
        type: "soft",
        cause: "protective_spike",
        stepsBack: 1,
        requireRequalification: false,
      };
      const result = computeRegression(makeState({ currentPhase: 0 }), signal);
      expect(result.currentPhase).toBe(0);
    });

    it("Soft recovery: spike 解消 → 元の Phase に復帰", () => {
      const regressed = makeState({ currentPhase: 1 });
      const recovered = computeSoftRecovery(regressed, 2, true);
      expect(recovered.currentPhase).toBe(2);
    });

    it("Soft recovery: spike 未解消 → 復帰しない", () => {
      const regressed = makeState({ currentPhase: 1 });
      const recovered = computeSoftRecovery(regressed, 2, false);
      expect(recovered.currentPhase).toBe(1);
    });
  });

  describe("Hard regression", () => {
    it("Phase 2 → hard (2段) → Phase 0 + hardRegressionActive", () => {
      const signal: RegressionSignal = {
        type: "hard",
        cause: "consecutive_rupture",
        stepsBack: 2,
        requireRequalification: true,
      };
      const result = computeRegression(makeState({ currentPhase: 2 }), signal);
      expect(result.currentPhase).toBe(0);
      expect(result.hardRegressionActive).toBe(true);
      expect(result.hardRegressionFloor).toBe(0);
    });

    it("Hard regression 中は soft recovery 不可", () => {
      const state = makeState({
        currentPhase: 0,
        hardRegressionActive: true,
        hardRegressionFloor: 0,
      });
      const recovered = computeSoftRecovery(state, 2, true);
      expect(recovered.currentPhase).toBe(0); // 復帰しない
    });

    it("Hard regression 中の自動遷移はブロック", () => {
      const r = computeAutoTransition(
        makeState({
          currentPhase: 0,
          hardRegressionActive: true,
          hardRegressionFloor: 0,
        }),
        makeInputs({
          sessionsCompleted: 10,
          totalTurnCount: 50,
          voluntaryTopicExpansionCount: 5,
        }),
      );
      expect(r.phase).toBe(0);
      expect(r.transitioned).toBe(false);
      expect(r.blockedReason).toContain("hard_regression_active");
    });

    it("canRecoverFromHardRegression: 条件再達成で true", () => {
      const state = makeState({
        currentPhase: 0,
        hardRegressionActive: true,
        hardRegressionFloor: 0,
      });
      const inputs = makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        voluntaryTopicExpansionCount: 2,
      });
      expect(canRecoverFromHardRegression(state, inputs)).toBe(true);
    });

    it("canRecoverFromHardRegression: 条件不足で false", () => {
      const state = makeState({
        currentPhase: 0,
        hardRegressionActive: true,
        hardRegressionFloor: 0,
      });
      const inputs = makeInputs({
        sessionsCompleted: 1,
        totalTurnCount: 3,
      });
      expect(canRecoverFromHardRegression(state, inputs)).toBe(false);
    });

    it("resolveHardRegression: フラグ解除", () => {
      const state = makeState({
        currentPhase: 1,
        hardRegressionActive: true,
        hardRegressionFloor: 0,
      });
      const resolved = resolveHardRegression(state);
      expect(resolved.hardRegressionActive).toBe(false);
      expect(resolved.hardRegressionFloor).toBeNull();
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 遷移の連続性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("遷移の連続性", () => {
  it("Phase 0→1→2 を段階的に遷移する（1ターンで2段ジャンプしない）", () => {
    // Phase 0→1
    const r1 = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 10,
        totalTurnCount: 50,
        voluntaryTopicExpansionCount: 5,
        defensePredictionStreak: 5,
      }),
    );
    expect(r1.phase).toBe(1); // 0→2 ではなく 0→1

    // Phase 1→2（前のターンの結果を引き継ぐ）
    const r2 = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 10,
        totalTurnCount: 50,
        defensePredictionStreak: 5,
      }),
    );
    expect(r2.phase).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildHdmPhaseAnalytics", () => {
  it("全フィールドが出力される", () => {
    const state = makeState({ currentPhase: 1 });
    const transition = computeAutoTransition(
      state,
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 20,
        defensePredictionStreak: 3,
      }),
    );
    const analytics = buildHdmPhaseAnalytics(state, transition);
    expect(analytics.currentPhase).toBe(2);
    expect(analytics.phaseLabel).toBe("restoration");
    expect(analytics.phaseLabelJa).toBe("心の復元");
    expect(analytics.transitioned).toBe(true);
    expect(analytics.trustLevelDerived).toBe(2);
    expect(analytics.responseDepth.differenceAccess).toBe(true);
    expect(analytics.responseDepth.counterfactualAccess).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. エッジケース
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("エッジケース", () => {
  it("全入力が0でも crash しない", () => {
    const r = computeAutoTransition(makeState(), makeInputs());
    expect(r.phase).toBe(0);
    expect(r.transitioned).toBe(false);
  });

  it("manual override が null なら自動遷移に従う", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 0, manualOverride: null }),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        voluntaryTopicExpansionCount: 2,
      }),
    );
    expect(r.phase).toBe(1);
  });

  it("manual override = 0 なら Phase 0 に留まる", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 0, manualOverride: 0 }),
      makeInputs({
        sessionsCompleted: 10,
        totalTurnCount: 50,
        voluntaryTopicExpansionCount: 5,
      }),
    );
    expect(r.phase).toBe(0);
    expect(r.transitioned).toBe(false);
  });

  it("Phase 4 から hard regression 3段 → Phase 1", () => {
    const signal: RegressionSignal = {
      type: "hard",
      cause: "dignity_violation",
      stepsBack: 3,
      requireRequalification: true,
    };
    const result = computeRegression(makeState({ currentPhase: 4 }), signal);
    expect(result.currentPhase).toBe(1);
    expect(result.hardRegressionActive).toBe(true);
  });

  it("continuousTrust + sessions → Phase 0→1 代替パス", () => {
    const r = computeAutoTransition(
      makeState(),
      makeInputs({
        sessionsCompleted: 3,
        totalTurnCount: 8,
        continuousTrust: 0.2,
      }),
    );
    expect(r.phase1MetricsMet).toBe(true);
    expect(r.phase).toBe(1);
  });

  it("repairSuccessRate が null でも Phase 2 代替パスは動作", () => {
    const r = computeAutoTransition(
      makeState({ currentPhase: 1 }),
      makeInputs({
        sessionsCompleted: 6,
        totalTurnCount: 20,
        repairSuccessRate: null,
        earnedTrustTotal: 8.0,
        continuousTrust: 0.4,
      }),
    );
    expect(r.phase2MetricsMet).toBe(true);
    expect(r.phase).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-2: Trust × Phase 交差制御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveEffectiveDepth (Trust × Phase)", () => {
  it("Phase=2, Trust=2 → Phase 2 のフル深度", () => {
    const d = resolveEffectiveDepth(2, 2);
    expect(d.narrativeLens).toBe("full");
    expect(d.bodyLens).toBe("surface");
    expect(d.partsLens).toBe("surface");
    expect(d.differenceAccess).toBe(true);
  });

  it("Phase=2, Trust=1 → Trust がボトルネック: narrative surface, body/parts off", () => {
    const d = resolveEffectiveDepth(2, 1);
    expect(d.narrativeLens).toBe("surface"); // Phase=full ∩ Trust=surface → surface
    expect(d.bodyLens).toBe("off");          // Phase=surface ∩ Trust=off → off
    expect(d.partsLens).toBe("off");
    expect(d.memoryPolicy).toBe("hedged_only");
    expect(d.differenceAccess).toBe(false);
  });

  it("Phase=2, Trust=0 → Trust が全て禁止", () => {
    const d = resolveEffectiveDepth(2, 0);
    expect(d.narrativeLens).toBe("off");
    expect(d.bodyLens).toBe("off");
    expect(d.partsLens).toBe("off");
    expect(d.memoryPolicy).toBe("exclude_all");
    expect(d.differenceAccess).toBe(false);
    expect(d.counterfactualAccess).toBe(false);
  });

  it("Phase=0, Trust=4 → Phase がボトルネック: 全て off", () => {
    const d = resolveEffectiveDepth(0, 4);
    expect(d.narrativeLens).toBe("off");
    expect(d.bodyLens).toBe("off");
    expect(d.partsLens).toBe("off");
    expect(d.memoryPolicy).toBe("exclude_all");
  });

  it("Phase=4, Trust=3 → Trust が反事実を禁止", () => {
    const d = resolveEffectiveDepth(4, 3);
    expect(d.counterfactualAccess).toBe(false); // Phase=true ∩ Trust=false
    expect(d.narrativeLens).toBe("full");       // 両方 full
    expect(d.bodyLens).toBe("full");
    expect(d.differenceAccess).toBe(true);
  });

  it("Phase=4, Trust=4 → 全解禁", () => {
    const d = resolveEffectiveDepth(4, 4);
    expect(d.counterfactualAccess).toBe(true);
    expect(d.narrativeLens).toBe("full");
    expect(d.bodyLens).toBe("full");
    expect(d.partsLens).toBe("full");
  });

  it("Trust が禁止しているものを Phase が解禁することは絶対にない", () => {
    // Phase 3 は全レンズ full だが、Trust 1 では body/parts off
    const d = resolveEffectiveDepth(3, 1);
    expect(d.bodyLens).toBe("off");
    expect(d.partsLens).toBe("off");
    expect(d.differenceAccess).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-2: Regression トリガー検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRegressionContext(overrides: Partial<RegressionContext> = {}): RegressionContext {
  return {
    ruptureDetected: false,
    ruptureType: null,
    consecutiveRuptureCount: 0,
    dignityViolationDetected: false,
    explicitRejection: false,
    reactiveActivation: 0,
    protectiveActivation: 0,
    trustDelta: 0,
    ...overrides,
  };
}

describe("detectRegressionSignal", () => {
  describe("Hard regression", () => {
    it("dignity violation → hard, 2段, requalification", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        dignityViolationDetected: true,
      }));
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe("hard");
      expect(signal!.cause).toBe("dignity_violation");
      expect(signal!.stepsBack).toBe(2);
      expect(signal!.requireRequalification).toBe(true);
    });

    it("explicit rejection + rupture → hard, 2段", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        explicitRejection: true,
        ruptureDetected: true,
        ruptureType: "confrontation",
      }));
      expect(signal!.type).toBe("hard");
      expect(signal!.cause).toBe("explicit_rejection");
    });

    it("explicit rejection alone (no rupture) → NOT hard（false positive 防止）", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        explicitRejection: true,
      }));
      // rupture なしの拒絶語は冗談・軽い否定の可能性 → hard にしない
      expect(signal === null || signal.cause !== "explicit_rejection").toBe(true);
    });

    it("consecutive rupture 3回 → hard", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        consecutiveRuptureCount: 3,
      }));
      expect(signal!.type).toBe("hard");
      expect(signal!.cause).toBe("consecutive_rupture");
    });

    it("trust crash (-0.3) → hard", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        trustDelta: -0.3,
      }));
      expect(signal!.type).toBe("hard");
      expect(signal!.cause).toBe("trust_crash");
    });

    it("trust crash (-0.29) → hard にならない", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        trustDelta: -0.29,
      }));
      expect(signal).toBeNull();
    });
  });

  describe("Soft regression", () => {
    it("withdrawal rupture → soft, 1段", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        ruptureDetected: true,
        ruptureType: "withdrawal",
      }));
      expect(signal!.type).toBe("soft");
      expect(signal!.cause).toBe("withdrawal");
      expect(signal!.stepsBack).toBe(1);
      expect(signal!.requireRequalification).toBe(false);
    });

    it("confrontation rupture → soft", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        ruptureDetected: true,
        ruptureType: "confrontation",
      }));
      expect(signal!.cause).toBe("confrontation");
    });

    it("reactive spike (0.7) → soft", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        reactiveActivation: 0.7,
      }));
      expect(signal!.type).toBe("soft");
      expect(signal!.cause).toBe("reactive_spike");
    });

    it("reactive (0.69) → no regression", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        reactiveActivation: 0.69,
      }));
      expect(signal).toBeNull();
    });

    it("protective spike (0.8) → soft", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        protectiveActivation: 0.8,
      }));
      expect(signal!.type).toBe("soft");
      expect(signal!.cause).toBe("protective_spike");
    });
  });

  describe("優先順位", () => {
    it("dignity violation + rupture → hard が優先", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        dignityViolationDetected: true,
        ruptureDetected: true,
        ruptureType: "withdrawal",
      }));
      expect(signal!.type).toBe("hard");
      expect(signal!.cause).toBe("dignity_violation");
    });

    it("consecutive rupture + reactive spike → hard が優先", () => {
      const signal = detectRegressionSignal(makeRegressionContext({
        consecutiveRuptureCount: 3,
        reactiveActivation: 0.9,
      }));
      expect(signal!.type).toBe("hard");
      expect(signal!.cause).toBe("consecutive_rupture");
    });
  });

  it("全シグナルなし → null", () => {
    expect(detectRegressionSignal(makeRegressionContext())).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-2: Proactive Metrics Bridge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildHdmInputsFromProactive", () => {
  it("proactive metrics を正しく HDM 入力に変換する", () => {
    const inputs = buildHdmInputsFromProactive(
      10,  // sessions
      5,   // currentTurns
      0.5, // continuousTrust
      {
        earnedTrustTotal: 12.0,
        selfDisclosureDepth: 0.6,
        repairSuccessRate: 0.8,
        understandingCoverage: 0.4,
        causalMapConfidence: 0.3,
      },
      3, // defensePredictionStreak
      4, // voluntaryTopicExpansionCount
    );
    expect(inputs.sessionsCompleted).toBe(10);
    expect(inputs.currentSessionTurnCount).toBe(5);
    expect(inputs.totalTurnCount).toBe(85); // 10*8 + 5
    expect(inputs.continuousTrust).toBe(0.5);
    expect(inputs.earnedTrustTotal).toBe(12.0);
    expect(inputs.selfDisclosureDepth).toBe(0.6);
    expect(inputs.repairSuccessRate).toBe(0.8);
    expect(inputs.understandingCoverage).toBe(0.4);
    expect(inputs.causalMapConfidence).toBe(0.3);
    expect(inputs.defensePredictionStreak).toBe(3);
    expect(inputs.voluntaryTopicExpansionCount).toBe(4);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-2: 旧 Phase → HDM Phase 移行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("migrateLegacyPhase", () => {
  it("旧 Phase 0 → HDM Phase 0", () => {
    expect(migrateLegacyPhase(0)).toBe(0);
  });

  it("旧 Phase 1 → HDM Phase 1", () => {
    expect(migrateLegacyPhase(1)).toBe(1);
  });

  it("旧 Phase 2 → HDM Phase 2", () => {
    expect(migrateLegacyPhase(2)).toBe(2);
  });

  it("旧 Phase 3 → HDM Phase 2（Phase 3 は manual gate のため自動昇格しない）", () => {
    expect(migrateLegacyPhase(3)).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-2: Analytics 拡張
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildHdmPhaseAnalytics (P3-2)", () => {
  it("trustLevel 指定時に effectiveDepth が出力される", () => {
    const state = makeState({ currentPhase: 2 });
    const transition = computeAutoTransition(
      state,
      makeInputs({ sessionsCompleted: 6, totalTurnCount: 20, defensePredictionStreak: 3 }),
    );
    const analytics = buildHdmPhaseAnalytics(state, transition, 1);
    expect(analytics.effectiveDepth).not.toBeNull();
    expect(analytics.effectiveDepth!.narrativeLens).toBe("surface"); // Phase full ∩ Trust surface
    expect(analytics.effectiveDepth!.bodyLens).toBe("off");
  });

  it("trustLevel 未指定時に effectiveDepth が null", () => {
    const state = makeState({ currentPhase: 1 });
    const transition = computeAutoTransition(state, makeInputs());
    const analytics = buildHdmPhaseAnalytics(state, transition);
    expect(analytics.effectiveDepth).toBeNull();
  });

  it("regression signal が analytics に含まれる", () => {
    const state = makeState({ currentPhase: 2 });
    const transition = computeAutoTransition(state, makeInputs());
    const signal: RegressionSignal = { type: "soft", cause: "withdrawal", stepsBack: 1, requireRequalification: false };
    const analytics = buildHdmPhaseAnalytics(state, transition, 2, signal);
    expect(analytics.regressionSignal).not.toBeNull();
    expect(analytics.regressionSignal!.cause).toBe("withdrawal");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-3: gateLensPrompt — 深度別 prompt 注入制御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("gateLensPrompt", () => {
  const fullBlock = "\n[Alter内部感覚] 語りの意味づけが変化している。前回「辛い」→今回「大変」。";
  const surfaceHint = LENS_SURFACE_HINTS.narrative;

  it("depth=off → 空文字列（注入なし）", () => {
    expect(gateLensPrompt("off", fullBlock, surfaceHint)).toBe("");
  });

  it("depth=surface → surfaceHint のみ", () => {
    const result = gateLensPrompt("surface", fullBlock, surfaceHint);
    expect(result).toBe(surfaceHint);
    expect(result).not.toContain("前回「辛い」");
  });

  it("depth=full → fullBlock をそのまま返す", () => {
    expect(gateLensPrompt("full", fullBlock, surfaceHint)).toBe(fullBlock);
  });

  it("fullBlock が空文字でも depth=full → 空文字を返す", () => {
    expect(gateLensPrompt("full", "", surfaceHint)).toBe("");
  });

  it("surfaceHint が空文字でも depth=surface → 空文字を返す", () => {
    expect(gateLensPrompt("surface", fullBlock, "")).toBe("");
  });
});

describe("LENS_SURFACE_HINTS", () => {
  it("3レンズ全てにヒントが定義されている", () => {
    expect(LENS_SURFACE_HINTS.narrative).toBeTruthy();
    expect(LENS_SURFACE_HINTS.body).toBeTruthy();
    expect(LENS_SURFACE_HINTS.parts).toBeTruthy();
  });

  it("ヒントに直接的な分析用語が含まれない", () => {
    // surface ヒントは背景認識のみ。分析・診断的用語を含まない
    for (const hint of Object.values(LENS_SURFACE_HINTS)) {
      expect(hint).not.toContain("分析");
      expect(hint).not.toContain("診断");
      expect(hint).not.toContain("パターン");
      // 各ヒントは「触れない」「言及しない」のいずれかで抑制を指示
      expect(hint).toMatch(/言及しない|触れない/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-3: Phase → Lens depth の一貫性テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 応答深度の段階的解禁（一貫性検証）", () => {
  it("Phase 0→5 でレンズ深度が単調増加する", () => {
    const order = { off: 0, surface: 1, full: 2 };
    let prevNarrative = 0;
    let prevBody = 0;
    let prevParts = 0;

    for (let phase = 0; phase <= 5; phase++) {
      const depth = getPhaseResponseDepth(phase as HdmPhase);
      const n = order[depth.narrativeLens];
      const b = order[depth.bodyLens];
      const p = order[depth.partsLens];

      expect(n).toBeGreaterThanOrEqual(prevNarrative);
      expect(b).toBeGreaterThanOrEqual(prevBody);
      expect(p).toBeGreaterThanOrEqual(prevParts);

      prevNarrative = n;
      prevBody = b;
      prevParts = p;
    }
  });

  it("反事実アクセスは Phase 4 以降でのみ解禁", () => {
    for (let phase = 0; phase <= 3; phase++) {
      expect(getPhaseResponseDepth(phase as HdmPhase).counterfactualAccess).toBe(false);
    }
    expect(getPhaseResponseDepth(4).counterfactualAccess).toBe(true);
    expect(getPhaseResponseDepth(5).counterfactualAccess).toBe(true);
  });

  it("差分アクセスは Phase 2 以降でのみ解禁", () => {
    expect(getPhaseResponseDepth(0).differenceAccess).toBe(false);
    expect(getPhaseResponseDepth(1).differenceAccess).toBe(false);
    expect(getPhaseResponseDepth(2).differenceAccess).toBe(true);
    expect(getPhaseResponseDepth(3).differenceAccess).toBe(true);
  });

  it("Trust が低い場合、どの Phase でも深度は Trust に制限される", () => {
    // Phase 5 + Trust 0 = 全て off
    const d = resolveEffectiveDepth(5, 0);
    expect(d.narrativeLens).toBe("off");
    expect(d.bodyLens).toBe("off");
    expect(d.partsLens).toBe("off");
    expect(d.counterfactualAccess).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-4: orchestrateRegression — 非線形後退のオーケストレーション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P3-4: orchestrateRegression", () => {
  const quietContext = makeRegressionContext(); // シグナルなし

  // ── 基本動作 ──

  it("シグナルなしの場合は state 変更なし", () => {
    const state = makeState({ currentPhase: 2 });
    const r = orchestrateRegression(state, quietContext);
    expect(r.regressionApplied).toBe(false);
    expect(r.recoveryApplied).toBe(false);
    expect(r.cooldownSkipped).toBe(false);
    expect(r.detectedSignal).toBeNull();
    expect(r.newState.currentPhase).toBe(2);
  });

  it("soft regression: rupture withdrawal で Phase 2 → 1", () => {
    const state = makeState({ currentPhase: 2 });
    const ctx = makeRegressionContext({
      ruptureDetected: true,
      ruptureType: "withdrawal",
    });
    const r = orchestrateRegression(state, ctx);
    expect(r.regressionApplied).toBe(true);
    expect(r.detectedSignal?.type).toBe("soft");
    expect(r.detectedSignal?.cause).toBe("withdrawal");
    expect(r.newState.currentPhase).toBe(1);
    expect(r.newState.lastSoftRegressionCause).toBe("withdrawal");
    expect(r.newState.softRegressionPreviousPhase).toBe(2);
    expect(r.previousPhase).toBe(2);
  });

  it("hard regression: dignity violation で Phase 2 → 0", () => {
    const state = makeState({ currentPhase: 2 });
    const ctx = makeRegressionContext({ dignityViolationDetected: true });
    const r = orchestrateRegression(state, ctx);
    expect(r.regressionApplied).toBe(true);
    expect(r.detectedSignal?.type).toBe("hard");
    expect(r.detectedSignal?.cause).toBe("dignity_violation");
    expect(r.newState.currentPhase).toBe(0);
    expect(r.newState.hardRegressionActive).toBe(true);
  });

  it("Phase 0 では soft regression は適用されない（floor）", () => {
    const state = makeState({ currentPhase: 0 });
    const ctx = makeRegressionContext({
      ruptureDetected: true,
      ruptureType: "withdrawal",
    });
    const r = orchestrateRegression(state, ctx);
    // signal は検出されるが、Phase 0 からは下がれない
    expect(r.detectedSignal).not.toBeNull();
    expect(r.regressionApplied).toBe(false);
    expect(r.newState.currentPhase).toBe(0);
  });

  // ── Soft recovery ──

  it("前ターン soft regression → spike 解消で recovery", () => {
    // Phase 2 → withdrawal で Phase 1 に落ちた状態
    const state = makeState({
      currentPhase: 1,
      lastSoftRegressionCause: "withdrawal",
      softRegressionPreviousPhase: 2,
    });
    // 今ターン: spike 解消（rupture なし）
    const r = orchestrateRegression(state, quietContext);
    expect(r.recoveryApplied).toBe(true);
    expect(r.newState.currentPhase).toBe(2);
    expect(r.newState.lastSoftRegressionCause).toBeNull();
    expect(r.newState.softRegressionPreviousPhase).toBeNull();
  });

  it("前ターン soft regression → spike 継続中は recovery しない", () => {
    const state = makeState({
      currentPhase: 1,
      lastSoftRegressionCause: "withdrawal",
      softRegressionPreviousPhase: 2,
    });
    // 今ターン: withdrawal 継続中
    const ctx = makeRegressionContext({
      ruptureDetected: true,
      ruptureType: "withdrawal",
    });
    const r = orchestrateRegression(state, ctx);
    // recovery はしない + cooldown でさらに落ちない
    expect(r.recoveryApplied).toBe(false);
    expect(r.cooldownSkipped).toBe(true);
    expect(r.newState.currentPhase).toBe(1);
  });

  // ── Cooldown ──

  it("同じ cause の soft regression は連続で発火しない (cooldown)", () => {
    // 前ターンで reactive_spike により Phase 2 → 1
    const state = makeState({
      currentPhase: 1,
      lastSoftRegressionCause: "reactive_spike",
      softRegressionPreviousPhase: 2,
    });
    // 今ターン: reactive spike 継続中（同じ cause）
    const ctx = makeRegressionContext({ reactiveActivation: 0.9 });
    const r = orchestrateRegression(state, ctx);
    expect(r.cooldownSkipped).toBe(true);
    expect(r.regressionApplied).toBe(false);
    // Phase は変わらない
    expect(r.newState.currentPhase).toBe(1);
  });

  it("異なる cause であれば cooldown は適用されない", () => {
    // 前ターンで withdrawal により Phase 2 → 1
    const state = makeState({
      currentPhase: 1,
      lastSoftRegressionCause: "withdrawal",
      softRegressionPreviousPhase: 2,
    });
    // 今ターン: withdrawal は解消、reactive spike が新たに発生
    const ctx = makeRegressionContext({ reactiveActivation: 0.9 });
    const r = orchestrateRegression(state, ctx);
    // recovery (withdrawal 解消) + new regression (reactive spike)
    expect(r.recoveryApplied).toBe(true);
    expect(r.cooldownSkipped).toBe(false);
    // Phase: 1 → 2 (recovery) → 1 (reactive spike regression)
    expect(r.regressionApplied).toBe(true);
    expect(r.newState.currentPhase).toBe(1);
    expect(r.newState.lastSoftRegressionCause).toBe("reactive_spike");
  });

  // ── Hard regression は cooldown 対象外 ──

  it("hard regression は cooldown をバイパスする", () => {
    const state = makeState({
      currentPhase: 2,
      lastSoftRegressionCause: "dignity_violation", // 理論上あり得ないが安全性テスト
      softRegressionPreviousPhase: 2,
    });
    const ctx = makeRegressionContext({ dignityViolationDetected: true });
    const r = orchestrateRegression(state, ctx);
    // hard regression は cooldown チェック対象外（soft のみ）
    expect(r.regressionApplied).toBe(true);
    expect(r.cooldownSkipped).toBe(false);
    expect(r.newState.currentPhase).toBe(0);
  });

  // ── Recovery → 即 regression ──

  it("recovery 直後に新しい regression シグナルがあれば適用される", () => {
    // Phase 2 → withdrawal で Phase 1
    const state = makeState({
      currentPhase: 1,
      lastSoftRegressionCause: "withdrawal",
      softRegressionPreviousPhase: 2,
    });
    // 今ターン: withdrawal 解消 + dignity violation（hard）
    const ctx = makeRegressionContext({
      dignityViolationDetected: true,
    });
    const r = orchestrateRegression(state, ctx);
    expect(r.recoveryApplied).toBe(true);
    expect(r.regressionApplied).toBe(true);
    // Phase 1 → 2 (recovery) → 0 (hard regression from 2, -2 steps)
    expect(r.newState.currentPhase).toBe(0);
    expect(r.newState.hardRegressionActive).toBe(true);
  });

  // ── previousPhase tracking ──

  it("previousPhase は入力時の Phase を保持する", () => {
    const state = makeState({ currentPhase: 2 });
    const ctx = makeRegressionContext({
      ruptureDetected: true,
      ruptureType: "confrontation",
    });
    const r = orchestrateRegression(state, ctx);
    expect(r.previousPhase).toBe(2);
    expect(r.newState.currentPhase).toBe(1);
  });

  // ── 連続ターン end-to-end シナリオ ──

  it("3ターンシナリオ: 正常→soft regression→recovery", () => {
    // Turn 1: 正常
    let state = makeState({ currentPhase: 2 });
    let r = orchestrateRegression(state, quietContext);
    expect(r.newState.currentPhase).toBe(2);

    // Turn 2: withdrawal → Phase 1
    const withdrawalCtx = makeRegressionContext({
      ruptureDetected: true,
      ruptureType: "withdrawal",
    });
    r = orchestrateRegression(r.newState, withdrawalCtx);
    expect(r.regressionApplied).toBe(true);
    expect(r.newState.currentPhase).toBe(1);

    // Turn 3: spike 解消 → Phase 2 recovery
    r = orchestrateRegression(r.newState, quietContext);
    expect(r.recoveryApplied).toBe(true);
    expect(r.newState.currentPhase).toBe(2);
    expect(r.newState.lastSoftRegressionCause).toBeNull();
  });
});
