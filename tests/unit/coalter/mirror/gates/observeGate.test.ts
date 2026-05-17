/**
 * CoAlter AOO Phase B B-4b — checkObserveGate invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §4.1 / §6
 *   - 実装: lib/coalter/mirror/gates/observeGate.ts
 *
 * test 範囲:
 *   - 各 axis (modeContext / alignment / uncertainty / silenceBudget / patternCategory)
 *     unknown で正しい fail reason
 *   - 全 known で passed: true
 *   - 短絡 return 順序 (CEO 指示順)
 *   - PII firewall (extra fields は output に leak しない)
 *   - input mutation 0
 *   - idempotent
 *   - discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { checkObserveGate } from "@/lib/coalter/mirror/gates/observeGate";
import { MIRROR_STAY_SILENT_REASON } from "@/lib/coalter/mirror/decisionConstants";
import type { GateResult, MirrorDecisionInput } from "@/lib/coalter/mirror/types";

/**
 * 全 axis known + base optional axes の minimal MirrorDecisionInput を生成する helper。
 * 各 test は本 base から差分のみ overwrite して edge case を作る。
 */
function knownBaseInput(): MirrorDecisionInput {
  return {
    modeContext: {
      status: "known",
      mode: "normal",
      source: "presence_state",
      canProceedToMirrorDecision: true,
    },
    alignment: {
      status: "known",
      bucket: "neutral",
      raw: 0,
      canProceedToMirrorDecision: true,
    },
    uncertainty: {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0.1,
      canProceedToMirrorDecision: true,
    },
    silenceBudget: {
      status: "known",
      bucket: "mid_30_to_70",
      raw: 0.5,
      canProceedToMirrorDecision: true,
    },
    patternCategory: {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    },
    // optional axes (Observe Gate からは参照されない)
    observationNovelty: 0.8,
    conversationPhase: "in_progress",
    timeSinceLastSpeakTurns: 10,
    ruptureFlag: false,
    userOverrideSleep: false,
  };
}

describe("B-4b checkObserveGate — 各 axis unknown で fail (5 axes)", () => {
  it("modeContext unknown → fail OBSERVE_UNKNOWN_MODE_CONTEXT", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT);
    }
  });

  it("alignment unknown → fail OBSERVE_UNKNOWN_ALIGNMENT", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      alignment: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_ALIGNMENT);
    }
  });

  it("uncertainty unknown → fail OBSERVE_UNKNOWN_UNCERTAINTY", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      uncertainty: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_UNCERTAINTY);
    }
  });

  it("silenceBudget unknown → fail OBSERVE_UNKNOWN_SILENCE_BUDGET", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      silenceBudget: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_SILENCE_BUDGET);
    }
  });

  it("patternCategory unknown_category → fail OBSERVE_UNKNOWN_PATTERN_CATEGORY", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      patternCategory: {
        status: "unknown",
        bucket: "unknown_category",
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_PATTERN_CATEGORY);
    }
  });
});

describe("B-4b checkObserveGate — happy path", () => {
  it("全 axis known → passed: true", () => {
    const r = checkObserveGate(knownBaseInput());
    expect(r.passed).toBe(true);
    if (r.passed) {
      // reason field なし
      const reason = (r as { reason?: string }).reason;
      expect(reason).toBeUndefined();
    }
  });

  it("各 known bucket (alignment 5 値) で passed: true", () => {
    const buckets = [
      "strongly_negative",
      "negative",
      "neutral",
      "positive",
      "strongly_positive",
    ] as const;
    for (const bucket of buckets) {
      const input: MirrorDecisionInput = {
        ...knownBaseInput(),
        alignment: {
          status: "known",
          bucket,
          raw: 0,
          canProceedToMirrorDecision: true,
        },
      };
      expect(checkObserveGate(input).passed).toBe(true);
    }
  });
});

describe("B-4b checkObserveGate — 短絡 return 順序 (CEO 指示順)", () => {
  it("modeContext と alignment 両方 unknown → modeContext を優先 reason", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
      alignment: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT);
    }
  });

  it("全 axis unknown → modeContext を最優先 reason", () => {
    const input: MirrorDecisionInput = {
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
      alignment: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      uncertainty: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      silenceBudget: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      patternCategory: {
        status: "unknown",
        bucket: "unknown_category",
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT);
    }
  });

  it("alignment と uncertainty 両方 unknown (modeContext known) → alignment を優先", () => {
    const input: MirrorDecisionInput = {
      ...knownBaseInput(),
      alignment: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      uncertainty: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    };
    const r = checkObserveGate(input);
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_ALIGNMENT);
    }
  });
});

describe("B-4b checkObserveGate — invariants (pure / mutation / idempotent / PII)", () => {
  it("input mutation 0 (input object 不変)", () => {
    const input = knownBaseInput();
    const snapshot = JSON.stringify(input);
    checkObserveGate(input);
    checkObserveGate(input);
    checkObserveGate(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent (同一入力 → 構造的等価)", () => {
    const input = knownBaseInput();
    expect(checkObserveGate(input)).toEqual(checkObserveGate(input));

    const inputUnknown: MirrorDecisionInput = {
      ...knownBaseInput(),
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
    };
    expect(checkObserveGate(inputUnknown)).toEqual(checkObserveGate(inputUnknown));
  });

  it("出力 shape: passed: true → 1 field / passed: false → 2 fields", () => {
    const passed = checkObserveGate(knownBaseInput());
    expect(Object.keys(passed).sort()).toEqual(["passed"]);

    const failed = checkObserveGate({
      ...knownBaseInput(),
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
    });
    expect(Object.keys(failed).sort()).toEqual(["passed", "reason"]);
  });

  it("PII 非受理: extra fields 注入しても output に leak しない", () => {
    const inputWithPII = {
      ...knownBaseInput(),
      rawText: "leak this",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      sessionId: "session_pii",
    } as unknown as MirrorDecisionInput;
    const r = checkObserveGate(inputWithPII);
    const json = JSON.stringify(r);
    for (const sentinel of ["leak this", "msg_pii", "user_pii", "pair_pii", "session_pii", "rawText"]) {
      expect(json).not.toContain(sentinel);
    }
  });

  it("reason は全 5 値が MIRROR_STAY_SILENT_REASON から取得される (magic string 不使用の構造的確認)", () => {
    const observeReasons: ReadonlyArray<string> = [
      MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT,
      MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_ALIGNMENT,
      MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_UNCERTAINTY,
      MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_SILENCE_BUDGET,
      MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_PATTERN_CATEGORY,
    ];
    const observeReasonSet: ReadonlySet<string> = new Set(observeReasons);
    // 各 axis を unknown にして reason 取得 → 全て set に含まれることを確認
    const cases: Array<Partial<MirrorDecisionInput>> = [
      {
        modeContext: {
          status: "unknown",
          mode: null,
          source: "missing",
          canProceedToMirrorDecision: false,
        },
      },
      {
        alignment: {
          status: "unknown",
          bucket: "unknown",
          raw: null,
          canProceedToMirrorDecision: false,
        },
      },
      {
        uncertainty: {
          status: "unknown",
          bucket: "unknown",
          raw: null,
          canProceedToMirrorDecision: false,
        },
      },
      {
        silenceBudget: {
          status: "unknown",
          bucket: "unknown",
          raw: null,
          canProceedToMirrorDecision: false,
        },
      },
      {
        patternCategory: {
          status: "unknown",
          bucket: "unknown_category",
          canProceedToMirrorDecision: false,
        },
      },
    ];
    for (const partial of cases) {
      const r = checkObserveGate({ ...knownBaseInput(), ...partial });
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(observeReasonSet.has(r.reason)).toBe(true);
      }
    }
  });
});

describe("B-4b checkObserveGate — discriminated union narrowing (型保証)", () => {
  it("passed: true 経路", () => {
    const r: GateResult = checkObserveGate(knownBaseInput());
    if (r.passed) {
      const _flag: true = r.passed;
      void _flag;
      expect(r.passed).toBe(true);
    } else {
      throw new Error("Expected passed");
    }
  });

  it("passed: false 経路 — reason は MirrorStaySilentReason 型", () => {
    const r: GateResult = checkObserveGate({
      ...knownBaseInput(),
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
    });
    if (!r.passed) {
      const _flag: false = r.passed;
      void _flag;
      expect(r.reason).toBe("observe_gate_unknown_modeContext");
    } else {
      throw new Error("Expected failed");
    }
  });
});
