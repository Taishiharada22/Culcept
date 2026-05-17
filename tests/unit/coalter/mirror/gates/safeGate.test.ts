/**
 * CoAlter AOO Phase B B-4b — checkSafeGate invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §4.3 / §9.3 / §6.5
 *   - 実装: lib/coalter/mirror/gates/safeGate.ts
 *
 * test 範囲:
 *   - safety_concern / rupture_signal_high で fail
 *   - uncertainty high_70_to_100 で fail
 *   - userOverrideSleep true / null / undefined で fail (precautionary)
 *   - userOverrideSleep false で pass on sleep
 *   - ruptureFlag true で fail
 *   - ruptureFlag null / undefined / false で no-op (asymmetric with userOverrideSleep)
 *   - 全条件安全で passed: true
 *   - 短絡 return 順序 (safety → rupture_high → uncertainty → sleep → ruptureFlag)
 *   - input mutation 0 / idempotent / PII firewall / discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { checkSafeGate } from "@/lib/coalter/mirror/gates/safeGate";
import { MIRROR_STAY_SILENT_REASON } from "@/lib/coalter/mirror/decisionConstants";
import type { GateResult, MirrorDecisionInput } from "@/lib/coalter/mirror/types";

function safeBaseInput(): MirrorDecisionInput {
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
    observationNovelty: 0.8,
    conversationPhase: "in_progress",
    timeSinceLastSpeakTurns: 10,
    ruptureFlag: false,
    userOverrideSleep: false,
  };
}

describe("B-4b checkSafeGate — patternCategory fail", () => {
  it("safety_concern → fail SAFE_SAFETY_CONCERN", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      patternCategory: {
        status: "known",
        bucket: "safety_concern",
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN);
    }
  });

  it("rupture_signal_high → fail SAFE_RUPTURE_HIGH", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      patternCategory: {
        status: "known",
        bucket: "rupture_signal_high",
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH);
    }
  });

  it("rupture_signal_mild / null_pattern → no fail on patternCategory", () => {
    for (const bucket of ["rupture_signal_mild", "null_pattern"] as const) {
      const r = checkSafeGate({
        ...safeBaseInput(),
        patternCategory: {
          status: "known",
          bucket,
          canProceedToMirrorDecision: true,
        },
      });
      expect(r.passed).toBe(true);
    }
  });

  it("patternCategory unknown_category → no-op on SafeGate (Observe Gate で捕捉される設計)", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      patternCategory: {
        status: "unknown",
        bucket: "unknown_category",
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(true);
  });
});

describe("B-4b checkSafeGate — uncertainty fail", () => {
  it("uncertainty high_70_to_100 → fail SAFE_UNCERTAINTY_HIGH", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      uncertainty: {
        status: "known",
        bucket: "high_70_to_100",
        raw: 0.85,
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_UNCERTAINTY_HIGH);
    }
  });

  it("uncertainty low / mid → no fail on uncertainty", () => {
    for (const bucket of ["low_0_to_30", "mid_30_to_70"] as const) {
      const r = checkSafeGate({
        ...safeBaseInput(),
        uncertainty: {
          status: "known",
          bucket,
          raw: 0.2,
          canProceedToMirrorDecision: true,
        },
      });
      expect(r.passed).toBe(true);
    }
  });

  it("uncertainty unknown → no-op on SafeGate (Observe Gate 捕捉設計)", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      uncertainty: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(true);
  });
});

describe("B-4b checkSafeGate — userOverrideSleep fail (precautionary)", () => {
  it("userOverrideSleep === true → fail SAFE_USER_OVERRIDE_SLEEP", () => {
    const r = checkSafeGate({ ...safeBaseInput(), userOverrideSleep: true });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP);
    }
  });

  it("userOverrideSleep === null → fail SAFE_USER_OVERRIDE_SLEEP (precautionary)", () => {
    const r = checkSafeGate({ ...safeBaseInput(), userOverrideSleep: null });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP);
    }
  });

  it("userOverrideSleep === undefined / 省略 → fail SAFE_USER_OVERRIDE_SLEEP (precautionary)", () => {
    for (const r of [
      checkSafeGate({ ...safeBaseInput(), userOverrideSleep: undefined }),
      checkSafeGate({ ...safeBaseInput(), userOverrideSleep: undefined }),
    ]) {
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP);
      }
    }
  });

  it("userOverrideSleep === false → no fail on sleep (明示的に sleep していない)", () => {
    const r = checkSafeGate({ ...safeBaseInput(), userOverrideSleep: false });
    expect(r.passed).toBe(true);
  });
});

describe("B-4b checkSafeGate — ruptureFlag fail (true のみ、asymmetric)", () => {
  it("ruptureFlag === true → fail SAFE_RUPTURE_HIGH", () => {
    const r = checkSafeGate({ ...safeBaseInput(), ruptureFlag: true });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH);
    }
  });

  it("ruptureFlag === false → no fail on ruptureFlag", () => {
    const r = checkSafeGate({ ...safeBaseInput(), ruptureFlag: false });
    expect(r.passed).toBe(true);
  });

  it("ruptureFlag === null → **no-op** (CEO B-4b 仕様: true のみ fail)", () => {
    const r = checkSafeGate({ ...safeBaseInput(), ruptureFlag: null });
    expect(r.passed).toBe(true);
  });

  it("ruptureFlag === undefined / 省略 → **no-op**", () => {
    for (const r of [
      checkSafeGate({ ...safeBaseInput(), ruptureFlag: undefined }),
      checkSafeGate({ ...safeBaseInput() }),
    ]) {
      expect(r.passed).toBe(true);
    }
  });

  it("ruptureFlag asymmetric vs userOverrideSleep: ruptureFlag undefined OK / userOverrideSleep undefined fail", () => {
    // ruptureFlag undefined: safe (CEO 仕様)
    const r1 = checkSafeGate({
      ...safeBaseInput(),
      ruptureFlag: undefined,
      userOverrideSleep: false,
    });
    expect(r1.passed).toBe(true);

    // userOverrideSleep undefined: fail (precautionary)
    const r2 = checkSafeGate({
      ...safeBaseInput(),
      ruptureFlag: false,
      userOverrideSleep: undefined,
    });
    expect(r2.passed).toBe(false);
  });
});

describe("B-4b checkSafeGate — 短絡 return 順序 (CEO 指示順)", () => {
  it("safety_concern + rupture_high → safety_concern 優先", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      patternCategory: {
        status: "known",
        bucket: "safety_concern",
        canProceedToMirrorDecision: false,
      },
      // safety_concern が pattern なので rupture と同時には起きないが、defense-in-depth
      ruptureFlag: true,
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN);
    }
  });

  it("rupture_high pattern + uncertainty high → rupture 優先", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      patternCategory: {
        status: "known",
        bucket: "rupture_signal_high",
        canProceedToMirrorDecision: false,
      },
      uncertainty: {
        status: "known",
        bucket: "high_70_to_100",
        raw: 0.85,
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH);
    }
  });

  it("uncertainty high + sleep true → uncertainty 優先", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      uncertainty: {
        status: "known",
        bucket: "high_70_to_100",
        raw: 0.85,
        canProceedToMirrorDecision: false,
      },
      userOverrideSleep: true,
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_UNCERTAINTY_HIGH);
    }
  });

  it("sleep + ruptureFlag true → sleep 優先", () => {
    const r = checkSafeGate({
      ...safeBaseInput(),
      userOverrideSleep: true,
      ruptureFlag: true,
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP);
    }
  });

  it("ruptureFlag のみ true (他すべて安全) → SAFE_RUPTURE_HIGH (最後の条件)", () => {
    const r = checkSafeGate({ ...safeBaseInput(), ruptureFlag: true });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH);
    }
  });
});

describe("B-4b checkSafeGate — happy path + invariants", () => {
  it("全 5 条件 safe → passed: true", () => {
    const r = checkSafeGate(safeBaseInput());
    expect(r.passed).toBe(true);
  });

  it("input mutation 0", () => {
    const input = safeBaseInput();
    const snapshot = JSON.stringify(input);
    checkSafeGate(input);
    checkSafeGate(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent", () => {
    const input = safeBaseInput();
    expect(checkSafeGate(input)).toEqual(checkSafeGate(input));

    const failed = checkSafeGate({ ...safeBaseInput(), userOverrideSleep: true });
    expect(failed).toEqual(checkSafeGate({ ...safeBaseInput(), userOverrideSleep: true }));
  });

  it("PII 非受理: extra fields は output に leak しない", () => {
    const inputWithPII = {
      ...safeBaseInput(),
      rawText: "safety_keyword_leak",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      matchedPatternRaw: "safety:suicide_keyword",
    } as unknown as MirrorDecisionInput;
    const r = checkSafeGate(inputWithPII);
    const json = JSON.stringify(r);
    for (const s of [
      "safety_keyword_leak",
      "msg_pii",
      "user_pii",
      "pair_pii",
      "matchedPatternRaw",
      "safety:suicide_keyword",
    ]) {
      expect(json).not.toContain(s);
    }
  });
});

describe("B-4b checkSafeGate — discriminated union narrowing", () => {
  it("passed: true 経路", () => {
    const r: GateResult = checkSafeGate(safeBaseInput());
    if (r.passed) {
      const _flag: true = r.passed;
      void _flag;
      expect(r.passed).toBe(true);
    } else {
      throw new Error("Expected passed");
    }
  });

  it("passed: false 経路 — reason 4 値 (safety / rupture / uncertainty / sleep) のいずれか", () => {
    const safeReasons: ReadonlySet<string> = new Set<string>([
      MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN,
      MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH,
      MIRROR_STAY_SILENT_REASON.SAFE_UNCERTAINTY_HIGH,
      MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP,
    ]);
    const r: GateResult = checkSafeGate({
      ...safeBaseInput(),
      userOverrideSleep: true,
    });
    if (!r.passed) {
      const _flag: false = r.passed;
      void _flag;
      expect(safeReasons.has(r.reason)).toBe(true);
    } else {
      throw new Error("Expected failed");
    }
  });
});
