/**
 * CoAlter AOO Phase B B-4b — checkWorthGate invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §4.2
 *   - 実装: lib/coalter/mirror/gates/worthGate.ts
 *
 * test 範囲:
 *   - silence_budget high で fail
 *   - observationNovelty < 0.5 / missing / NaN / Infinity / 範囲外 で fail
 *   - conversationPhase が "in_progress" 以外で fail
 *   - timeSinceLastSpeakTurns < 5 / missing / 浮動小数 / 負数 で fail
 *   - 全条件通過で passed: true
 *   - 短絡 return 順序 (silence → novelty → phase → time)
 *   - 境界値 (novelty = 0.5 / time = 5)
 *   - input mutation 0 / idempotent / PII firewall / discriminated union narrowing
 */

import { describe, it, expect } from "vitest";
import { checkWorthGate } from "@/lib/coalter/mirror/gates/worthGate";
import {
  MIRROR_STAY_SILENT_REASON,
  WORTH_NOVELTY_MIN,
  WORTH_TIME_SINCE_MIN_TURNS,
} from "@/lib/coalter/mirror/decisionConstants";
import type { GateResult, MirrorDecisionInput } from "@/lib/coalter/mirror/types";

function passingBaseInput(): MirrorDecisionInput {
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

describe("B-4b checkWorthGate — silenceBudget high fail", () => {
  it("silenceBudget high_70_to_100 → fail WORTH_SILENCE_BUDGET_HIGH", () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      silenceBudget: {
        status: "known",
        bucket: "high_70_to_100",
        raw: 0.8,
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_SILENCE_BUDGET_HIGH);
    }
  });

  it("silenceBudget low / mid → no fail on silence (他条件で評価)", () => {
    for (const bucket of ["low_0_to_30", "mid_30_to_70"] as const) {
      const r = checkWorthGate({
        ...passingBaseInput(),
        silenceBudget: {
          status: "known",
          bucket,
          raw: 0.2,
          canProceedToMirrorDecision: true,
        },
      });
      expect(r.passed).toBe(true);
    }
  });

  it("silenceBudget unknown → Worth Gate は no-op (Observe Gate で捕捉される設計)", () => {
    // silenceBudget.bucket === "unknown" は "high_70_to_100" に一致しない
    // → 他条件 OK なら Worth Gate passed
    const r = checkWorthGate({
      ...passingBaseInput(),
      silenceBudget: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
    });
    expect(r.passed).toBe(true);
  });
});

describe("B-4b checkWorthGate — observationNovelty fail (numeric validation + threshold)", () => {
  it("novelty < WORTH_NOVELTY_MIN (0.5) → fail WORTH_NOVELTY_LOW", () => {
    for (const v of [0.0, 0.1, 0.3, 0.49]) {
      const r = checkWorthGate({ ...passingBaseInput(), observationNovelty: v });
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_NOVELTY_LOW);
      }
    }
  });

  it(`novelty === ${WORTH_NOVELTY_MIN} (境界 inclusive) → pass on novelty`, () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      observationNovelty: WORTH_NOVELTY_MIN,
    });
    expect(r.passed).toBe(true);
  });

  it("novelty === 0.51 / 0.8 / 1.0 → pass on novelty", () => {
    for (const v of [0.51, 0.8, 1.0]) {
      const r = checkWorthGate({ ...passingBaseInput(), observationNovelty: v });
      expect(r.passed).toBe(true);
    }
  });

  it("novelty null / undefined / 省略 → fail (missing)", () => {
    for (const r of [
      checkWorthGate({ ...passingBaseInput(), observationNovelty: null }),
      checkWorthGate({ ...passingBaseInput(), observationNovelty: undefined }),
      checkWorthGate({ ...passingBaseInput(), observationNovelty: undefined }),
    ]) {
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_NOVELTY_LOW);
      }
    }
  });

  it("novelty NaN / Infinity / -Infinity → fail", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = checkWorthGate({ ...passingBaseInput(), observationNovelty: v });
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_NOVELTY_LOW);
      }
    }
  });

  it("novelty 範囲外 (< 0 or > 1) → fail", () => {
    for (const v of [-0.01, -1, 1.01, 2, 100]) {
      const r = checkWorthGate({ ...passingBaseInput(), observationNovelty: v });
      expect(r.passed).toBe(false);
    }
  });

  it("novelty 型外 (string / object) → fail", () => {
    const cases: Array<unknown> = ["0.8", true, {}, []];
    for (const v of cases) {
      const r = checkWorthGate({
        ...passingBaseInput(),
        observationNovelty: v as unknown as number,
      });
      expect(r.passed).toBe(false);
    }
  });
});

describe("B-4b checkWorthGate — conversationPhase fail", () => {
  it('conversationPhase !== "in_progress" → fail WORTH_CONVERSATION_PHASE_UNSUITABLE', () => {
    const cases = ["greeting", "closing", "emergent", "unknown"] as const;
    for (const phase of cases) {
      const r = checkWorthGate({ ...passingBaseInput(), conversationPhase: phase });
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_CONVERSATION_PHASE_UNSUITABLE);
      }
    }
  });

  it("conversationPhase undefined / 省略 → fail", () => {
    const r = checkWorthGate({ ...passingBaseInput(), conversationPhase: undefined });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_CONVERSATION_PHASE_UNSUITABLE);
    }
  });

  it('conversationPhase === "in_progress" → pass on phase', () => {
    const r = checkWorthGate({ ...passingBaseInput(), conversationPhase: "in_progress" });
    expect(r.passed).toBe(true);
  });
});

describe("B-4b checkWorthGate — timeSinceLastSpeakTurns fail", () => {
  it(`time < WORTH_TIME_SINCE_MIN_TURNS (${WORTH_TIME_SINCE_MIN_TURNS}) → fail`, () => {
    for (const v of [0, 1, 2, 3, 4]) {
      const r = checkWorthGate({ ...passingBaseInput(), timeSinceLastSpeakTurns: v });
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(
          MIRROR_STAY_SILENT_REASON.WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT,
        );
      }
    }
  });

  it(`time === ${WORTH_TIME_SINCE_MIN_TURNS} (境界 inclusive) → pass`, () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      timeSinceLastSpeakTurns: WORTH_TIME_SINCE_MIN_TURNS,
    });
    expect(r.passed).toBe(true);
  });

  it("time 6 / 10 / 100 → pass", () => {
    for (const v of [6, 10, 100]) {
      const r = checkWorthGate({ ...passingBaseInput(), timeSinceLastSpeakTurns: v });
      expect(r.passed).toBe(true);
    }
  });

  it("time null / undefined / 省略 → fail", () => {
    for (const r of [
      checkWorthGate({ ...passingBaseInput(), timeSinceLastSpeakTurns: null }),
      checkWorthGate({ ...passingBaseInput(), timeSinceLastSpeakTurns: undefined }),
    ]) {
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(
          MIRROR_STAY_SILENT_REASON.WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT,
        );
      }
    }
  });

  it("time 浮動小数 / 負数 / NaN / Infinity → fail", () => {
    for (const v of [5.5, 7.3, -1, -5, NaN, Infinity, -Infinity]) {
      const r = checkWorthGate({ ...passingBaseInput(), timeSinceLastSpeakTurns: v });
      expect(r.passed).toBe(false);
    }
  });

  it("time 型外 → fail", () => {
    const cases: Array<unknown> = ["5", true, {}, []];
    for (const v of cases) {
      const r = checkWorthGate({
        ...passingBaseInput(),
        timeSinceLastSpeakTurns: v as unknown as number,
      });
      expect(r.passed).toBe(false);
    }
  });
});

describe("B-4b checkWorthGate — 短絡 return 順序 (silence → novelty → phase → time)", () => {
  it("silence high + novelty low → silence reason 優先", () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      silenceBudget: {
        status: "known",
        bucket: "high_70_to_100",
        raw: 0.8,
        canProceedToMirrorDecision: false,
      },
      observationNovelty: 0.1,
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_SILENCE_BUDGET_HIGH);
    }
  });

  it("novelty low + phase 不適 → novelty 優先", () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      observationNovelty: 0.1,
      conversationPhase: "greeting",
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_NOVELTY_LOW);
    }
  });

  it("phase 不適 + time 短い → phase 優先", () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      conversationPhase: "closing",
      timeSinceLastSpeakTurns: 1,
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_CONVERSATION_PHASE_UNSUITABLE);
    }
  });

  it("4 条件すべて fail → silence reason が最終的に最優先", () => {
    const r = checkWorthGate({
      ...passingBaseInput(),
      silenceBudget: {
        status: "known",
        bucket: "high_70_to_100",
        raw: 0.9,
        canProceedToMirrorDecision: false,
      },
      observationNovelty: 0.1,
      conversationPhase: "greeting",
      timeSinceLastSpeakTurns: 1,
    });
    expect(r.passed).toBe(false);
    if (!r.passed) {
      expect(r.reason).toBe(MIRROR_STAY_SILENT_REASON.WORTH_SILENCE_BUDGET_HIGH);
    }
  });
});

describe("B-4b checkWorthGate — happy path + invariants", () => {
  it("全 4 条件 pass → passed: true", () => {
    const r = checkWorthGate(passingBaseInput());
    expect(r.passed).toBe(true);
  });

  it("input mutation 0", () => {
    const input = passingBaseInput();
    const snapshot = JSON.stringify(input);
    checkWorthGate(input);
    checkWorthGate(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("idempotent", () => {
    const input = passingBaseInput();
    expect(checkWorthGate(input)).toEqual(checkWorthGate(input));

    const failed = checkWorthGate({ ...passingBaseInput(), observationNovelty: 0.1 });
    expect(failed).toEqual(checkWorthGate({ ...passingBaseInput(), observationNovelty: 0.1 }));
  });

  it("PII 非受理: extra fields は output に leak しない", () => {
    const inputWithPII = {
      ...passingBaseInput(),
      rawText: "leak",
      userId: "user_pii",
      messageId: "msg_pii",
    } as unknown as MirrorDecisionInput;
    const r = checkWorthGate(inputWithPII);
    const json = JSON.stringify(r);
    for (const s of ["leak", "user_pii", "msg_pii"]) {
      expect(json).not.toContain(s);
    }
  });
});

describe("B-4b checkWorthGate — discriminated union narrowing", () => {
  it("passed: true 経路", () => {
    const r: GateResult = checkWorthGate(passingBaseInput());
    if (r.passed) {
      const _flag: true = r.passed;
      void _flag;
      expect(r.passed).toBe(true);
    } else {
      throw new Error("Expected passed");
    }
  });

  it("passed: false 経路 — reason 4 値のいずれか", () => {
    const worthReasons: ReadonlySet<string> = new Set<string>([
      MIRROR_STAY_SILENT_REASON.WORTH_SILENCE_BUDGET_HIGH,
      MIRROR_STAY_SILENT_REASON.WORTH_NOVELTY_LOW,
      MIRROR_STAY_SILENT_REASON.WORTH_CONVERSATION_PHASE_UNSUITABLE,
      MIRROR_STAY_SILENT_REASON.WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT,
    ]);
    const r: GateResult = checkWorthGate({
      ...passingBaseInput(),
      observationNovelty: 0.1,
    });
    if (!r.passed) {
      expect(worthReasons.has(r.reason)).toBe(true);
    } else {
      throw new Error("Expected failed");
    }
  });
});
