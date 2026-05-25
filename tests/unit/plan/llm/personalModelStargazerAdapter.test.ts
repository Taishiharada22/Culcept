/**
 * Phase 3-N Plan P2 Step 3 Stage A + B — Real Stargazer adapter test
 *
 * 設計書: docs/alter-plan-p2-step3-real-pm-readiness.md
 *
 * 検証範囲:
 *   Stage A (= scaffold + safe fallback):
 *     - 空 userId → meta-only Phase 0 (= deterministic 等価)
 *     - 通常 userId + supabase 接続失敗 → meta-only Phase 0 (= fail-open)
 *     - 並列 / mutate 安全
 *   **Stage B (= 本 commit)**: judgmentMode + timePreference 実 wire
 *     - mock supabaseServer で BeliefSet + HdmPhase を注入
 *     - individual_vs_social mu < -0.25 → 「集中型」
 *     - individual_vs_social mu > +0.25 → 「分散型」
 *     - 中庸範囲 + stress_isolation > 0.25 → 「関係エネルギー型」
 *     - 中庸範囲 + stress_isolation 不在 → 「中庸型」
 *     - chronotype 5 軸揃い + chronoScore < -0.15 → 「朝強い」
 *     - chronoScore > +0.15 → 「夜強い」
 *     - else → 「中庸」
 *     - hdmPhase=0/1 → stable 注入されない (= layer gating)
 *     - hdmPhase=2 → stable 注入
 *     - hdmPhase=3 → stable + recent (empty)
 *
 * 用語:
 *   - HDM Phase: PersonalModelMeta.hdmPhase (= 0-5、 readout level gating)
 *   - readiness doc Phase: workflow 全体 Phase 1-6 (= branch / 実装 / test / smoke / commit / canary)
 *   - Stage A-D: adapter file 内の wire enablement sub-stage (= readiness Phase 2 内の段階)
 *
 * 不変原則:
 *   - server-only module を mock
 *   - supabaseServer を mock (= 実 DB 不使用)
 *   - 実 Stargazer module の純粋関数のみ実呼出 (= deserializeBeliefs / analyzeChronotype)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// supabaseServer mock — 各 test で挙動切替
let mockProfileRow: { axis_beliefs: unknown } | null = null;
let mockGrowthRow: { hdm_phase_state: unknown } | null = null;
let supabaseShouldThrow = false;

function buildMockSupabaseClient() {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  if (supabaseShouldThrow) throw new Error("mock supabase error");
                  if (table === "stargazer_profiles") {
                    return { data: mockProfileRow, error: null };
                  }
                  if (table === "stargazer_alter_growth") {
                    return { data: mockGrowthRow, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => buildMockSupabaseClient()),
}));

import { extractPersonalModelFromStargazer } from "@/lib/plan/llm/personalModelStargazerAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * axis_beliefs JSON を組み立てる (= DB row shape)
 *
 * deserializeBeliefs が受ける形 = Record<string, { mu, precision }>
 */
function buildAxisBeliefs(scores: Record<string, number>): Record<string, { mu: number; precision: number }> {
  const out: Record<string, { mu: number; precision: number }> = {};
  for (const [key, mu] of Object.entries(scores)) {
    out[key] = { mu, precision: 4 }; // precision: 中程度の confidence
  }
  return out;
}

/**
 * hdm_phase_state JSON を組み立てる (= DB row shape)
 */
function buildHdmState(phase: number): Record<string, unknown> {
  return {
    currentPhase: phase,
    lastTransitionAt: null,
    manualOverride: null,
    hardRegressionActive: false,
    hardRegressionFloor: null,
    lastSoftRegressionCause: null,
    softRegressionPreviousPhase: null,
    recentRuptureFlags: [],
    priorSessionTrust: null,
    pendingRealityAnchoring: null,
    recentDignityViolations: [],
    recentProtectiveSpikes: [],
    phase3EnteredAt: null,
    phase4EnteredAt: null,
    phase3TurnCount: 0,
    phase4TurnCount: 0,
    p4FireCount: 0,
    lastDefensePrediction: null,
    defensePredictionStreak: 0,
    voluntaryTopicExpansionCount: 0,
    lastProbedDomains: [],
    previousSessionAxisScores: null,
    lastSessionId: null,
  };
}

/** 5 軸を備えた scores (= chronotype が動く最小条件) */
const CHRONOTYPE_BASE_SCORES = {
  plan_vs_spontaneous: 0,
  cautious_vs_bold: 0,
  emotional_variability: 0,
  emotional_regulation: 0,
  analytical_vs_intuitive: 0,
};

beforeEach(() => {
  mockProfileRow = null;
  mockGrowthRow = null;
  supabaseShouldThrow = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage A: safe fallback (= 既存 contract 維持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractPersonalModelFromStargazer (= Stage A scaffold)", () => {
  it("空 userId → meta-only Phase 0 (= deterministic 等価)", async () => {
    const pm = await extractPersonalModelFromStargazer("");

    expect(pm.meta).toBeDefined();
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.meta.trustLevel).toBe(0);
    expect(pm.meta.observationCompleteness).toBe(0);
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("supabase 接続失敗 → meta-only Phase 0 (= fail-open)", async () => {
    supabaseShouldThrow = true;
    const pm = await extractPersonalModelFromStargazer("user-test-001");

    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("プロフィール row 不在 → meta-only Phase 0", async () => {
    mockProfileRow = null;
    mockGrowthRow = null;

    const pm = await extractPersonalModelFromStargazer("user-no-profile");
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
  });

  it("複数呼出が独立 (= mutate なし、 並列安全)", async () => {
    const [pm1, pm2, pm3] = await Promise.all([
      extractPersonalModelFromStargazer("user-a"),
      extractPersonalModelFromStargazer("user-b"),
      extractPersonalModelFromStargazer(""),
    ]);

    expect(pm1.meta.hdmPhase).toBe(0);
    expect(pm2.meta.hdmPhase).toBe(0);
    expect(pm3.meta.hdmPhase).toBe(0);
    expect(pm1).not.toBe(pm2);
  });

  it("PersonalModelV2 shape を満たす (= meta required)", async () => {
    const pm = await extractPersonalModelFromStargazer("user-shape-check");

    expect(pm).toHaveProperty("meta");
    expect(typeof pm.meta.hdmPhase).toBe("number");
    expect(typeof pm.meta.trustLevel).toBe("number");
    expect(typeof pm.meta.observationCompleteness).toBe("number");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage B: judgmentMode 実 wire
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Stage B: judgmentMode 実 wire (= individual_vs_social + stress_isolation_vs_social)", () => {
  it("individual_vs_social = -0.5 → 「集中型」", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        ...CHRONOTYPE_BASE_SCORES,
        individual_vs_social: -0.5,
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-focused");
    expect(pm.meta.hdmPhase).toBe(2);
    expect(pm.stable?.judgmentMode).toBe("集中型");
  });

  it("individual_vs_social = +0.5 → 「分散型」", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        ...CHRONOTYPE_BASE_SCORES,
        individual_vs_social: 0.5,
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-distributed");
    expect(pm.stable?.judgmentMode).toBe("分散型");
  });

  it("中庸範囲 (= |mu| ≤ 0.25) + stress_isolation > 0.25 → 「関係エネルギー型」", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        ...CHRONOTYPE_BASE_SCORES,
        individual_vs_social: 0.1,
        stress_isolation_vs_social: 0.4,
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-relational");
    expect(pm.stable?.judgmentMode).toBe("関係エネルギー型");
  });

  it("中庸範囲 + stress_isolation 不在 → 「中庸型」", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        ...CHRONOTYPE_BASE_SCORES,
        individual_vs_social: 0.1,
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-neutral");
    expect(pm.stable?.judgmentMode).toBe("中庸型");
  });

  it("individual_vs_social 不在 → judgmentMode undefined", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs(CHRONOTYPE_BASE_SCORES), // individual 不在
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-incomplete");
    expect(pm.stable?.judgmentMode).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage B: timePreference 実 wire
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Stage B: timePreference 実 wire (= analyzeChronotype 経由)", () => {
  it("計画的 + 慎重 + 安定 → chronoScore < -0.15 → 「朝強い」", async () => {
    // plan negative + bold negative + emotional low + regulation high + analytical positive
    // = -0.3*(0.3) - 0.4*(0.2) - 0.1*(0.2) - 0.3*(0.15)*(-1) + 0.1*(0.15)
    // = -0.09 - 0.08 - 0.02 + 0.045 + 0.015 = -0.13 → balanced (= 微妙)
    // 朝型を確実にするため、 plan を more negative にする
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        plan_vs_spontaneous: -0.8,
        cautious_vs_bold: -0.5,
        emotional_variability: -0.3,
        emotional_regulation: 0.5,
        analytical_vs_intuitive: 0.3,
        individual_vs_social: 0, // judgmentMode = 中庸型
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-morning");
    expect(pm.stable?.timePreference).toBe("朝強い");
  });

  it("即興 + 大胆 + 感情変動高 → chronoScore > 0.15 → 「夜強い」", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        plan_vs_spontaneous: 0.8,
        cautious_vs_bold: 0.6,
        emotional_variability: 0.6,
        emotional_regulation: -0.4,
        analytical_vs_intuitive: -0.3,
        individual_vs_social: 0,
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-evening");
    expect(pm.stable?.timePreference).toBe("夜強い");
  });

  it("全 0 → balanced → 「中庸」", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        ...CHRONOTYPE_BASE_SCORES,
        individual_vs_social: 0,
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-balanced");
    expect(pm.stable?.timePreference).toBe("中庸");
  });

  it("5 軸未満 → timePreference undefined (= analyzeChronotype null return)", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        individual_vs_social: -0.5, // judgmentMode 出るが chronotype 出ない
      }),
    };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-sparse");
    expect(pm.stable?.judgmentMode).toBe("集中型");
    expect(pm.stable?.timePreference).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage B: Phase gating (= layer 注入 + gating の整合)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Stage B: HdmPhase gating (= layer 注入の Phase 依存)", () => {
  const RICH_SCORES = {
    ...CHRONOTYPE_BASE_SCORES,
    individual_vs_social: -0.5,
  };

  it("hdmPhase = 0 → stable layer 注入されない (= readout meta-only)", async () => {
    mockProfileRow = { axis_beliefs: buildAxisBeliefs(RICH_SCORES) };
    mockGrowthRow = { hdm_phase_state: buildHdmState(0) };

    const pm = await extractPersonalModelFromStargazer("user-phase0");
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
  });

  it("hdmPhase = 1 → stable layer 注入されない", async () => {
    mockProfileRow = { axis_beliefs: buildAxisBeliefs(RICH_SCORES) };
    mockGrowthRow = { hdm_phase_state: buildHdmState(1) };

    const pm = await extractPersonalModelFromStargazer("user-phase1");
    expect(pm.meta.hdmPhase).toBe(1);
    expect(pm.stable).toBeUndefined();
  });

  it("hdmPhase = 2 → stable 注入 (= judgmentMode + timePreference 両方)", async () => {
    mockProfileRow = { axis_beliefs: buildAxisBeliefs(RICH_SCORES) };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-phase2");
    expect(pm.meta.hdmPhase).toBe(2);
    expect(pm.stable?.judgmentMode).toBe("集中型");
    expect(pm.stable?.timePreference).toBe("中庸");
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("hdmPhase = 3 → stable + recent (= recent は Stage B では空 → undefined)", async () => {
    mockProfileRow = { axis_beliefs: buildAxisBeliefs(RICH_SCORES) };
    mockGrowthRow = { hdm_phase_state: buildHdmState(3) };

    const pm = await extractPersonalModelFromStargazer("user-phase3");
    expect(pm.meta.hdmPhase).toBe(3);
    expect(pm.stable?.judgmentMode).toBe("集中型");
    // Stage B では recent layer fields は全 undefined → recent 自体 undefined
    expect(pm.recent).toBeUndefined();
  });

  it("hdmPhase 不正値 (= -1) → 0 fallback", async () => {
    mockProfileRow = { axis_beliefs: buildAxisBeliefs(RICH_SCORES) };
    mockGrowthRow = { hdm_phase_state: { currentPhase: -1 } };

    const pm = await extractPersonalModelFromStargazer("user-invalid-phase");
    // -1 は範囲外 → null → 0 fallback
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage B: 不正 / 欠損 DB row 耐性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Stage B: 不正 / 欠損 DB row 耐性 (= fail-open per field)", () => {
  it("axis_beliefs JSON 不正 → safe fallback meta-only", async () => {
    mockProfileRow = { axis_beliefs: "not-an-object" };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-bad-json");
    // axis_beliefs が非 object → scores null → stable 全 undefined → Phase 2 でも stable undefined
    expect(pm.meta.hdmPhase).toBe(2);
    expect(pm.stable).toBeUndefined();
  });

  it("axis_beliefs 空 object → stable 全 undefined", async () => {
    mockProfileRow = { axis_beliefs: {} };
    mockGrowthRow = { hdm_phase_state: buildHdmState(2) };

    const pm = await extractPersonalModelFromStargazer("user-empty-beliefs");
    expect(pm.stable).toBeUndefined();
  });

  it("hdm_phase_state 不正 → phase 0 fallback", async () => {
    mockProfileRow = {
      axis_beliefs: buildAxisBeliefs({
        ...CHRONOTYPE_BASE_SCORES,
        individual_vs_social: -0.5,
      }),
    };
    mockGrowthRow = { hdm_phase_state: "not-an-object" };

    const pm = await extractPersonalModelFromStargazer("user-bad-hdm");
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
  });
});
