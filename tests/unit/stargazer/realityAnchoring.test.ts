import { describe, it, expect } from "vitest";
import {
  isRealityAnchoringAllowed,
  buildRealityAnchoringPromptBlock,
  buildRealityAnchoringAnalytics,
  detectAfterActionSignal,
  isPendingAnchoringActive,
  buildAfterActionPromptBlock,
  buildAnchoringSummary,
  type RealityAnchoringContext,
  type PendingRealityAnchoring,
} from "@/lib/stargazer/realityAnchoring";
import type { HdmPhase } from "@/lib/stargazer/hdmPhase";
import type { TrustLevel } from "@/lib/stargazer/alterUnderstanding";

// ── helpers ──

function gate(overrides: {
  phase?: HdmPhase;
  trust?: TrustLevel;
  rupture?: boolean;
  dignity?: boolean;
  protective?: number;
  reactive?: number;
  clarify?: boolean;
} = {}) {
  return isRealityAnchoringAllowed(
    overrides.phase ?? 5,
    overrides.trust ?? 4,
    overrides.rupture ?? false,
    overrides.dignity ?? false,
    overrides.protective ?? 0,
    overrides.reactive ?? 0,
    overrides.clarify ?? false,
  );
}

function makeContext(overrides: Partial<RealityAnchoringContext> = {}): RealityAnchoringContext {
  return {
    actionShape: "trial_then_decide",
    knownValues: [],
    knownFears: [],
    unfinishedThread: null,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isRealityAnchoringAllowed", () => {
  it("Phase 5 + Trust 4 + 全安全 → allowed", () => {
    const result = gate();
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("Phase 4 → blocked_by_phase", () => {
    const result = gate({ phase: 4 });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_phase");
  });

  it("Phase 0 → blocked_by_phase", () => {
    const result = gate({ phase: 0 });
    expect(result.allowed).toBe(false);
  });

  it("Trust 3 → blocked_by_trust", () => {
    const result = gate({ trust: 3 });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_trust");
  });

  it("rupture active → blocked_by_rupture", () => {
    const result = gate({ rupture: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_rupture");
  });

  it("dignity risk → blocked_by_dignity", () => {
    const result = gate({ dignity: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_dignity");
  });

  it("protective spike (0.75) → blocked", () => {
    const result = gate({ protective: 0.75 });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_protective_spike");
  });

  it("protective (0.74) → NOT blocked", () => {
    const result = gate({ protective: 0.74 });
    expect(result.allowed).toBe(true);
  });

  it("reactive spike (0.8) → blocked", () => {
    const result = gate({ reactive: 0.8 });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_reactive_spike");
  });

  it("clarify mode → blocked", () => {
    const result = gate({ clarify: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_clarify_mode");
  });

  it("複数条件同時違反 → 全理由を返す", () => {
    const result = gate({ phase: 3, trust: 2, rupture: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("blocked_by_phase");
    expect(result.reasons).toContain("blocked_by_trust");
    expect(result.reasons).toContain("blocked_by_rupture");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRealityAnchoringPromptBlock", () => {
  it("基本構造: P5 ヘッダー + 制約 + 行動形が含まれる", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext());
    expect(block).toContain("現実返還");
    expect(block).toContain("行動形:");
    expect(block).toContain("自然な次の一歩");
    expect(block).toContain("こうすべき");
  });

  it("skip → 行動提案禁止の制約が含まれる", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext({ actionShape: "skip" }));
    expect(block).toContain("行動提案を絶対にしない");
  });

  it("full_go → 後押しの言葉", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext({ actionShape: "full_go" }));
    expect(block).toContain("後押し");
  });

  it("knownValues が含まれる", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext({
      knownValues: ["安全", "自律"],
    }));
    expect(block).toContain("安全");
    expect(block).toContain("自律");
    expect(block).toContain("価値観に沿った");
  });

  it("knownFears が含まれる", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext({
      knownFears: ["見捨てられること"],
    }));
    expect(block).toContain("見捨てられること");
    expect(block).toContain("恐れを刺激しない");
  });

  it("unfinishedThread が含まれる", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext({
      unfinishedThread: "上司との関係",
    }));
    expect(block).toContain("上司との関係");
  });

  it("knownValues が3件を超える場合は3件まで", () => {
    const block = buildRealityAnchoringPromptBlock(makeContext({
      knownValues: ["v1", "v2", "v3", "v4", "v5"],
    }));
    expect(block).toContain("v1");
    expect(block).toContain("v3");
    expect(block).not.toContain("v4");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRealityAnchoringAnalytics", () => {
  it("allowed + context → 全フィールド", () => {
    const analytics = buildRealityAnchoringAnalytics(
      { allowed: true, reasons: [] },
      makeContext({ knownValues: ["安全"], knownFears: ["拒絶"] }),
    );
    expect(analytics.p5_gate_allowed).toBe(true);
    expect(analytics.p5_action_shape).toBe("trial_then_decide");
    expect(analytics.p5_known_values_count).toBe(1);
    expect(analytics.p5_known_fears_count).toBe(1);
  });

  it("blocked + null context → null フィールド", () => {
    const analytics = buildRealityAnchoringAnalytics(
      { allowed: false, reasons: ["blocked_by_phase"] },
      null,
    );
    expect(analytics.p5_gate_allowed).toBe(false);
    expect(analytics.p5_action_shape).toBeNull();
    expect(analytics.p5_gate_block_reasons).toContain("blocked_by_phase");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P5-3: After-Action Loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makePending(overrides: Partial<PendingRealityAnchoring> = {}): PendingRealityAnchoring {
  return {
    actionShape: "trial_then_decide",
    anchoringSummary: "小さく試してから決める",
    suggestedAt: new Date().toISOString(),
    followUpAttempts: 0,
    ...overrides,
  };
}

describe("detectAfterActionSignal", () => {
  describe("true positive", () => {
    it.each([
      ["やってみた", "did_it"],
      ["試してみたけど微妙だった", "did_it"],
      ["聞いてみた", "did_it"],
      ["やめた", "didnt_do_it"],
      ["結局しなかった", "didnt_do_it"],
      ["できなかった", "didnt_do_it"],
      ["よかった", "felt_good"],
      ["うまくいった", "felt_good"],
      ["すっきりした", "felt_good"],
      ["失敗した", "felt_bad"],
      ["やらなきゃよかった", "felt_bad"],
      ["逆効果だった", "felt_bad"],
    ] as const)("「%s」→ %s", (msg, expected) => {
      expect(detectAfterActionSignal(msg)).toBe(expected);
    });
  });

  it("関係ないメッセージ → no_mention", () => {
    expect(detectAfterActionSignal("今日は天気がいい")).toBe("no_mention");
    expect(detectAfterActionSignal("仕事の相談なんだけど")).toBe("no_mention");
    expect(detectAfterActionSignal("別の話")).toBe("no_mention");
  });

  it("felt_bad は did_it より優先される", () => {
    // 「やってみたけど失敗した」→ felt_bad が優先
    expect(detectAfterActionSignal("やってみたけど失敗した")).toBe("felt_bad");
  });

  it("felt_good は did_it より優先される", () => {
    expect(detectAfterActionSignal("やってみたらよかった")).toBe("felt_good");
  });
});

describe("isPendingAnchoringActive", () => {
  it("null → false", () => {
    expect(isPendingAnchoringActive(null)).toBe(false);
  });

  it("新しい pending → true", () => {
    expect(isPendingAnchoringActive(makePending())).toBe(true);
  });

  it("followUpAttempts >= 3 → false（expire）", () => {
    expect(isPendingAnchoringActive(makePending({ followUpAttempts: 3 }))).toBe(false);
  });

  it("7日以上前 → false（expire）", () => {
    const old = new Date();
    old.setDate(old.getDate() - 8);
    expect(isPendingAnchoringActive(makePending({
      suggestedAt: old.toISOString(),
    }))).toBe(false);
  });

  it("6日前 → true（まだ有効）", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 6);
    expect(isPendingAnchoringActive(makePending({
      suggestedAt: recent.toISOString(),
    }))).toBe(true);
  });
});

describe("buildAfterActionPromptBlock", () => {
  it("no_mention → null（何も注入しない）", () => {
    expect(buildAfterActionPromptBlock("no_mention", makePending())).toBeNull();
  });

  it("did_it → 実行を認める指示", () => {
    const block = buildAfterActionPromptBlock("did_it", makePending());
    expect(block).not.toBeNull();
    expect(block).toContain("実行したようです");
    expect(block).toContain("動けたことに注目");
  });

  it("didnt_do_it → やらなかった判断を否定しない", () => {
    const block = buildAfterActionPromptBlock("didnt_do_it", makePending());
    expect(block).toContain("やらなかったようです");
    expect(block).toContain("否定しない");
  });

  it("felt_good → 自己理解の一致を認める", () => {
    const block = buildAfterActionPromptBlock("felt_good", makePending());
    expect(block).toContain("よかったと感じている");
    expect(block).toContain("一致した証拠");
  });

  it("felt_bad → 共感 + Alter が間違えた可能性", () => {
    const block = buildAfterActionPromptBlock("felt_bad", makePending());
    expect(block).toContain("共感を優先");
    expect(block).toContain("読みがズレていた");
  });

  it("pending の anchoringSummary が含まれる", () => {
    const block = buildAfterActionPromptBlock("did_it", makePending({
      anchoringSummary: "範囲を限定して動く",
    }));
    expect(block).toContain("範囲を限定して動く");
  });
});

describe("buildAnchoringSummary", () => {
  it("ActionShape → 日本語要約", () => {
    expect(buildAnchoringSummary("full_go")).toBe("全力で動く");
    expect(buildAnchoringSummary("skip")).toBe("やめる");
    expect(buildAnchoringSummary("trial_then_decide")).toBe("小さく試してから決める");
    expect(buildAnchoringSummary("observe_first")).toBe("動かず様子を見る");
  });
});
