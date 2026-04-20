/**
 * CoAlter Phase 2 — modeRouter unit test (2026-04-19 v0.3 gate 6.A)
 *
 * 目的:
 *   設計書 §1.3 の 8 分岐すべてで RouterTrace が正しく出ることを固定する。
 *   最初の gate: この test が PASS したらフェーズ 6.B（builder 群）へ進む。
 *
 * 固定する 6 フィールド:
 *   - selectedMode
 *   - reason
 *   - triggeredSignals
 *   - suppressedSignals
 *   - previousMode
 *   - questionBudget
 */

import { describe, it, expect } from "vitest";

import { runModeRouter, deriveQuestionBudget } from "@/lib/coalter/modeRouter";
import type {
  ModeRouterInput,
  MisreadSignal,
  ContradictionSignal,
  StallSignal,
  EmotionHeat,
  AmbiguityResponseMode,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// 固定時刻（trace.timestamp の決定性確保）
// ─────────────────────────────────────────────
const FROZEN = new Date("2026-04-19T12:00:00.000Z");

// ─────────────────────────────────────────────
// 信号 fixture（default = すべて沈黙）
// ─────────────────────────────────────────────
const SILENT_MISREAD: MisreadSignal = {
  confidence: 0,
  direction: null,
  anchorMessageId: null,
};
const LOUD_MISREAD: MisreadSignal = {
  confidence: 0.85,
  direction: "a_to_b",
  anchorMessageId: "msg_1",
};
const NO_CONTRADICTION: ContradictionSignal = {
  detected: false,
  axes: [],
  stanceA: null,
  stanceB: null,
};
const WITH_CONTRADICTION: ContradictionSignal = {
  detected: true,
  axes: ["quietness"],
  stanceA: "静かな店がいい",
  stanceB: "賑やかな店がいい",
};
const NO_STALL: StallSignal = { detected: false, consecutiveTurns: 0 };
const WITH_STALL: StallSignal = { detected: true, consecutiveTurns: 3 };

const EMO_LOW: EmotionHeat = { severity: "low", reason: null };
const EMO_MID: EmotionHeat = { severity: "mid", reason: null };

// ─────────────────────────────────────────────
// fixture builder
// ─────────────────────────────────────────────
function input(over: Partial<ModeRouterInput> = {}): ModeRouterInput {
  return {
    previousMode: null,
    previousClarifyTurns: 0,
    previousNegotiateNoProposal: false,
    misread: SILENT_MISREAD,
    contradiction: NO_CONTRADICTION,
    stall: NO_STALL,
    ambiguityResponseMode: null,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════
// 分岐 1: previousNegotiateNoProposal → decision（最優先短絡）
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 1 — previous negotiate proposals=0 → decision（最優先）", () => {
  it("他の信号がどれだけ立っていても、これが立っていれば decision に戻す", () => {
    const trace = runModeRouter(
      input({
        previousNegotiateNoProposal: true,
        // 他の信号もすべて立てる
        misread: LOUD_MISREAD,
        contradiction: WITH_CONTRADICTION,
        stall: WITH_STALL,
        ambiguityResponseMode: "clarify",
        previousMode: "negotiate",
      }),
      EMO_LOW,
      FROZEN,
    );

    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("negotiate_no_proposal_retry_decision");
    // previous_negotiate_no_proposal は「選ばれた分岐の根拠」なので suppressed ではない
    expect(trace.suppressedSignals).not.toContain("previous_negotiate_no_proposal");
    // 他の信号は発火したが抑制された
    expect(trace.triggeredSignals).toContain("previous_negotiate_no_proposal");
    expect(trace.triggeredSignals).toContain("misread");
    expect(trace.triggeredSignals).toContain("contradiction");
    expect(trace.triggeredSignals).toContain("stall");
    expect(trace.suppressedSignals).toContain("misread");
    expect(trace.suppressedSignals).toContain("contradiction");
    expect(trace.suppressedSignals).toContain("stall");
    expect(trace.previousMode).toBe("negotiate");
    expect(trace.questionBudget).toBe(1);
    expect(trace.timestamp).toBe("2026-04-19T12:00:00.000Z");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 2: clarify 自己増殖抑制 → decision
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 2 — clarify self suppression → decision", () => {
  it("previousMode=clarify かつ previousClarifyTurns=1 かつ misread>=0.7", () => {
    const trace = runModeRouter(
      input({
        previousMode: "clarify",
        previousClarifyTurns: 1,
        misread: LOUD_MISREAD,
      }),
      EMO_LOW,
      FROZEN,
    );

    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("clarify_self_suppression");
    expect(trace.triggeredSignals).toContain("previous_clarify_self_suppress");
    expect(trace.triggeredSignals).toContain("misread");
    // 自己抑制が根拠なので suppressed ではない、misread も根拠の一部として除外
    expect(trace.suppressedSignals).not.toContain("previous_clarify_self_suppress");
    expect(trace.suppressedSignals).not.toContain("misread");
    expect(trace.previousMode).toBe("clarify");
  });

  it("previousClarifyTurns=0 なら抑制されず、misread>=0.7 → clarify（分岐 3 へ）", () => {
    const trace = runModeRouter(
      input({
        previousMode: "clarify",
        previousClarifyTurns: 0,
        misread: LOUD_MISREAD,
      }),
      EMO_LOW,
      FROZEN,
    );

    expect(trace.selectedMode).toBe("clarify");
    expect(trace.reason).toBe("misread_dominant");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 3: misread dominant → clarify
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 3 — misread >= 0.7 → clarify", () => {
  it("misread 単独発火", () => {
    const trace = runModeRouter(
      input({ misread: LOUD_MISREAD }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("clarify");
    expect(trace.reason).toBe("misread_dominant");
    expect(trace.triggeredSignals).toEqual(["misread"]);
    expect(trace.suppressedSignals).toEqual([]);
    expect(trace.questionBudget).toBe(1);
  });

  it("misread=0.69 は発火しない（閾値 0.7 境界）", () => {
    const trace = runModeRouter(
      input({ misread: { ...LOUD_MISREAD, confidence: 0.69 } }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("default_decision");
    expect(trace.triggeredSignals).toEqual([]);
  });

  it("misread=0.7 は発火する（閾値境界）", () => {
    const trace = runModeRouter(
      input({ misread: { ...LOUD_MISREAD, confidence: 0.7 } }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("clarify");
    expect(trace.reason).toBe("misread_dominant");
  });

  it("misread と contradiction 両発火 → clarify（治療的順序で misread 優先）", () => {
    const trace = runModeRouter(
      input({
        misread: LOUD_MISREAD,
        contradiction: WITH_CONTRADICTION,
      }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("clarify");
    expect(trace.reason).toBe("misread_dominant");
    expect(trace.suppressedSignals).toContain("contradiction");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 4: contradiction → negotiate
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 4 — contradiction → negotiate", () => {
  it("contradiction 単独", () => {
    const trace = runModeRouter(
      input({ contradiction: WITH_CONTRADICTION }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("negotiate");
    expect(trace.reason).toBe("contradiction_detected");
    expect(trace.triggeredSignals).toEqual(["contradiction"]);
    expect(trace.suppressedSignals).toEqual([]);
  });

  it("contradiction + stall → negotiate（stall が抑制される）", () => {
    const trace = runModeRouter(
      input({
        contradiction: WITH_CONTRADICTION,
        stall: WITH_STALL,
      }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("negotiate");
    expect(trace.reason).toBe("contradiction_detected");
    expect(trace.suppressedSignals).toContain("stall");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 5: stall → decision
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 5 — stall → decision", () => {
  it("stall 単独", () => {
    const trace = runModeRouter(
      input({ stall: WITH_STALL }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("stall_detected");
    expect(trace.triggeredSignals).toEqual(["stall"]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 6: ambiguity conclude / branch → decision
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 6 — ambiguity conclude / branch → decision", () => {
  it("conclude → decision + reason=ambiguity_conclude", () => {
    const trace = runModeRouter(
      input({ ambiguityResponseMode: "conclude" }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("ambiguity_conclude");
    expect(trace.triggeredSignals).toEqual(["ambiguity_conclude"]);
  });

  it("branch → decision + reason=ambiguity_branch", () => {
    const trace = runModeRouter(
      input({ ambiguityResponseMode: "branch" }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("ambiguity_branch");
    expect(trace.triggeredSignals).toEqual(["ambiguity_branch"]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 7: ambiguity clarify → decision（delegate）
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 7 — ambiguity clarify → decision（Ambiguity Engine の clarify と CoAlter clarify は別物）", () => {
  it("clarify → decision + reason=ambiguity_clarify_delegate_decision", () => {
    const trace = runModeRouter(
      input({ ambiguityResponseMode: "clarify" }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("ambiguity_clarify_delegate_decision");
    expect(trace.triggeredSignals).toEqual(["ambiguity_clarify"]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 分岐 8: default → decision
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter 分岐 8 — default → decision（全信号沈黙）", () => {
  it("信号が何も立たない場合は decision", () => {
    const trace = runModeRouter(input(), EMO_LOW, FROZEN);
    expect(trace.selectedMode).toBe("decision");
    expect(trace.reason).toBe("default_decision");
    expect(trace.triggeredSignals).toEqual([]);
    expect(trace.suppressedSignals).toEqual([]);
  });

  it("previousMode があっても信号沈黙なら default", () => {
    const trace = runModeRouter(
      input({ previousMode: "decision", previousClarifyTurns: 0 }),
      EMO_LOW,
      FROZEN,
    );
    expect(trace.reason).toBe("default_decision");
    expect(trace.previousMode).toBe("decision");
  });
});

// ═════════════════════════════════════════════════════════════════════
// questionBudget（Post-modifier と同じ初期値を返す）
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter — questionBudget", () => {
  it("emotion_heat low → 1", () => {
    const trace = runModeRouter(input(), EMO_LOW, FROZEN);
    expect(trace.questionBudget).toBe(1);
  });

  it("emotion_heat mid → 0", () => {
    const trace = runModeRouter(input(), EMO_MID, FROZEN);
    expect(trace.questionBudget).toBe(0);
  });

  it("deriveQuestionBudget 単体 — low/high は 1、mid は 0", () => {
    expect(deriveQuestionBudget({ severity: "low", reason: null })).toBe(1);
    expect(deriveQuestionBudget({ severity: "mid", reason: null })).toBe(0);
    // high は Pre-router gate で弾かれる前提だが、関数単体としては 1 を返す
    expect(deriveQuestionBudget({ severity: "high", reason: null })).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 純関数性（CEO 実装固定条件の契約テスト）
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter — 純関数性契約", () => {
  it("同一入力なら同一出力（now を固定すれば完全に決定的）", () => {
    const i = input({ contradiction: WITH_CONTRADICTION });
    const t1 = runModeRouter(i, EMO_LOW, FROZEN);
    const t2 = runModeRouter(i, EMO_LOW, FROZEN);
    expect(t1).toEqual(t2);
  });

  it("入力オブジェクトを変更しない（immutable）", () => {
    const i = input({ contradiction: WITH_CONTRADICTION });
    const snapshot = JSON.parse(JSON.stringify(i)) as unknown;
    runModeRouter(i, EMO_LOW, FROZEN);
    expect(JSON.parse(JSON.stringify(i))).toEqual(snapshot);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 優先順位の総合テスト（短絡評価順序の固定）
// ═════════════════════════════════════════════════════════════════════

describe("modeRouter — 短絡評価順序の総合固定", () => {
  // すべての信号を立てた "全部入り" を作って、
  // 上から順に previous flag を削り、reason が期待順で遷移することを確認
  const allOn: Partial<ModeRouterInput> = {
    misread: LOUD_MISREAD,
    contradiction: WITH_CONTRADICTION,
    stall: WITH_STALL,
    ambiguityResponseMode: "clarify",
    previousMode: "clarify",
    previousClarifyTurns: 1,
  };

  const cases: Array<{ name: string; over: Partial<ModeRouterInput>; reason: string }> = [
    {
      name: "#1 最優先: negotiateNoProposal",
      over: { ...allOn, previousNegotiateNoProposal: true, previousMode: "negotiate" },
      reason: "negotiate_no_proposal_retry_decision",
    },
    {
      name: "#2 次: clarify_self_suppression",
      over: { ...allOn },
      reason: "clarify_self_suppression",
    },
    {
      name: "#3 次: misread_dominant（previousClarify=0）",
      over: { ...allOn, previousClarifyTurns: 0, previousMode: null },
      reason: "misread_dominant",
    },
    {
      name: "#4 次: contradiction（misread 沈黙）",
      over: { ...allOn, misread: SILENT_MISREAD, previousClarifyTurns: 0, previousMode: null },
      reason: "contradiction_detected",
    },
    {
      name: "#5 次: stall（contradiction 沈黙）",
      over: {
        ...allOn,
        misread: SILENT_MISREAD,
        contradiction: NO_CONTRADICTION,
        previousClarifyTurns: 0,
        previousMode: null,
      },
      reason: "stall_detected",
    },
    {
      name: "#6 次: ambiguity_clarify_delegate_decision（stall 沈黙）",
      over: {
        misread: SILENT_MISREAD,
        contradiction: NO_CONTRADICTION,
        stall: NO_STALL,
        ambiguityResponseMode: "clarify",
      },
      reason: "ambiguity_clarify_delegate_decision",
    },
    {
      name: "#7 次: default（ambiguity null）",
      over: {
        misread: SILENT_MISREAD,
        contradiction: NO_CONTRADICTION,
        stall: NO_STALL,
        ambiguityResponseMode: null,
      },
      reason: "default_decision",
    },
  ];

  it.each(cases)("$name → reason=$reason", ({ over, reason }) => {
    const trace = runModeRouter(input(over), EMO_LOW, FROZEN);
    expect(trace.reason).toBe(reason);
  });
});
