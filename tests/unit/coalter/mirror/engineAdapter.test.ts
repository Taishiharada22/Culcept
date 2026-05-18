/**
 * CoAlter AOO Phase B B-5a — engineAdapter invariant test
 *
 * 正本: lib/coalter/mirror/engineAdapter.ts
 *
 * B-5a:
 *   - 全 presence-derived axes → unknown (canProceedToMirrorDecision: false)
 *   - observationNovelty: 0.5 (estimateNovelty placeholder)
 *   - conversationPhase: ctx 由来 (default "unknown")
 *   - timeSinceLastSpeakTurns: MAX_SAFE_INTEGER (初期)
 *   - ruptureFlag: null (presence 読まないため)
 *   - userOverrideSleep: sleepStore default false
 *   - pure / deterministic / side-effect-free (caller への mutation なし)
 *   - PII 非受理 (型に raw text / id field なし)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildMirrorDecisionInput,
  type AdapterContext,
} from "@/lib/coalter/mirror/engineAdapter";
import { __resetForTest as resetSleep, setSleep } from "@/lib/coalter/mirror/sleepStore";
import {
  __resetForTest as resetFreq,
  incrementEngineInvoked,
  incrementVisibleSpeak,
} from "@/lib/coalter/mirror/frequencyCap";
import {
  __resetForTest as resetBridge,
  initializeBridgeOnce,
  disposeBridge,
} from "@/lib/coalter/mirror/presenceMirrorBridge";
import {
  publishPresenceSignal,
  __resetSignalBus,
} from "@/lib/coalter/presence/productionSignalBus";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

// C-2 test fixture: make signal helper
function makeSignal(overrides: Partial<PresenceSignal> = {}): PresenceSignal {
  return {
    kind: "implicit",
    strength: "soft",
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe("B-5a engineAdapter — presence-derived axes すべて unknown", () => {
  beforeEach(() => {
    resetSleep();
    resetFreq();
  });

  it("ctx 空 → modeContext.status === unknown", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.modeContext.status).toBe("unknown");
    expect(input.modeContext.mode).toBeNull();
    expect(input.modeContext.canProceedToMirrorDecision).toBe(false);
  });

  it("alignment / uncertainty / silenceBudget → status unknown, canProceed false", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.alignment.status).toBe("unknown");
    expect(input.alignment.bucket).toBe("unknown");
    expect(input.alignment.canProceedToMirrorDecision).toBe(false);

    expect(input.uncertainty.status).toBe("unknown");
    expect(input.uncertainty.bucket).toBe("unknown");
    expect(input.uncertainty.canProceedToMirrorDecision).toBe(false);

    expect(input.silenceBudget.status).toBe("unknown");
    expect(input.silenceBudget.bucket).toBe("unknown");
    expect(input.silenceBudget.canProceedToMirrorDecision).toBe(false);
  });

  it("patternCategory → status unknown, bucket unknown_category, canProceed false", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.patternCategory.status).toBe("unknown");
    expect(input.patternCategory.bucket).toBe("unknown_category");
    expect(input.patternCategory.canProceedToMirrorDecision).toBe(false);
  });
});

describe("B-5a engineAdapter — mirror-layer 内 state からの axes", () => {
  beforeEach(() => {
    resetSleep();
    resetFreq();
  });

  it("observationNovelty === 0.5 (estimateNovelty placeholder)", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.observationNovelty).toBe(0.5);
  });

  it("ctx.messageCount なし → conversationPhase: unknown", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.conversationPhase).toBe("unknown");
  });

  it("ctx.messageCount=10 → conversationPhase: in_progress", () => {
    const input = buildMirrorDecisionInput({ messageCount: 10 });
    expect(input.conversationPhase).toBe("in_progress");
  });

  it("ctx.messageCount=1 → conversationPhase: greeting", () => {
    const input = buildMirrorDecisionInput({ messageCount: 1 });
    expect(input.conversationPhase).toBe("greeting");
  });

  it("ctx.messageCount=100 → conversationPhase: closing", () => {
    const input = buildMirrorDecisionInput({ messageCount: 100 });
    expect(input.conversationPhase).toBe("closing");
  });

  it("ctx.lastMessageAgeMs > 60s → conversationPhase: closing", () => {
    const input = buildMirrorDecisionInput({
      messageCount: 10,
      lastMessageAgeMs: 70_000,
    });
    expect(input.conversationPhase).toBe("closing");
  });

  it("timeSinceLastSpeakTurns: 初期は MAX_SAFE_INTEGER (Worth Gate 通過)", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.timeSinceLastSpeakTurns).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("timeSinceLastSpeakTurns: visible speak 後は engine invoke 差分", () => {
    incrementEngineInvoked(); // 1
    incrementEngineInvoked(); // 2
    incrementVisibleSpeak(); // lastVisibleSpeakInvokeNumber = 2
    incrementEngineInvoked(); // 3
    incrementEngineInvoked(); // 4
    expect(buildMirrorDecisionInput({}).timeSinceLastSpeakTurns).toBe(2);
  });
});

describe("B-5a engineAdapter — boolean state", () => {
  beforeEach(() => {
    resetSleep();
    resetFreq();
  });

  it("ruptureFlag: null (presence 読まないため、no-op)", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.ruptureFlag).toBeNull();
  });

  it("userOverrideSleep: default false", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.userOverrideSleep).toBe(false);
  });

  it("userOverrideSleep: setSleep(true) 後は true", () => {
    setSleep(true);
    const input = buildMirrorDecisionInput({});
    expect(input.userOverrideSleep).toBe(true);
  });

  it("userOverrideSleep: setSleep(false) 後は false", () => {
    setSleep(true);
    setSleep(false);
    const input = buildMirrorDecisionInput({});
    expect(input.userOverrideSleep).toBe(false);
  });
});

describe("B-5a engineAdapter — invariants", () => {
  beforeEach(() => {
    resetSleep();
    resetFreq();
  });

  it("input mutation なし (ctx は readonly)", () => {
    const ctx: AdapterContext = { messageCount: 10, lastMessageAgeMs: 5000 };
    const snapshot = JSON.stringify(ctx);
    buildMirrorDecisionInput(ctx);
    buildMirrorDecisionInput(ctx);
    expect(JSON.stringify(ctx)).toBe(snapshot);
  });

  it("deterministic (state 変更なしなら同入力で同出力)", () => {
    const ctx: AdapterContext = { messageCount: 10 };
    const a = buildMirrorDecisionInput(ctx);
    const b = buildMirrorDecisionInput(ctx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("PII 非受理: ctx に extra fields 注入しても output に PII 漏れなし", () => {
    const ctxWithPII = {
      messageCount: 10,
      lastMessageAgeMs: 5000,
      rawText: "leak",
      userId: "user_pii",
      messageId: "msg_pii",
      pairId: "pair_pii",
      sessionId: "sess_pii",
      email: "leak@example.com",
    } as unknown as AdapterContext;

    const input = buildMirrorDecisionInput(ctxWithPII);
    const serialized = JSON.stringify(input);

    // PII string が serialized output に**含まれない**
    expect(serialized).not.toContain("leak");
    expect(serialized).not.toContain("user_pii");
    expect(serialized).not.toContain("msg_pii");
    expect(serialized).not.toContain("pair_pii");
    expect(serialized).not.toContain("sess_pii");
    expect(serialized).not.toContain("example.com");
  });

  it("output 構造: MirrorDecisionInput の 10 field のみ", () => {
    const input = buildMirrorDecisionInput({ messageCount: 10 });
    const keys = Object.keys(input).sort();
    expect(keys).toEqual(
      [
        "alignment",
        "conversationPhase",
        "modeContext",
        "observationNovelty",
        "patternCategory",
        "ruptureFlag",
        "silenceBudget",
        "timeSinceLastSpeakTurns",
        "uncertainty",
        "userOverrideSleep",
      ].sort(),
    );
  });

  it("output object は新規 (caller の参照に影響しない)", () => {
    const a = buildMirrorDecisionInput({ messageCount: 10 });
    const b = buildMirrorDecisionInput({ messageCount: 10 });
    expect(a).not.toBe(b); // 別 reference
    expect(a.modeContext).not.toBe(b.modeContext);
    expect(a.alignment).not.toBe(b.alignment);
  });
});

// =============================================================================
// Phase C C-2: presenceMirrorBridge 統合 (patternCategory が known に進む)
// =============================================================================

describe("C-2 engineAdapter — presenceMirrorBridge 統合", () => {
  beforeEach(() => {
    resetSleep();
    resetFreq();
    resetBridge();
    __resetSignalBus();
  });
  afterEach(() => {
    resetBridge();
    __resetSignalBus();
  });

  it("bridge 未 initialize → patternCategory 依然 unknown (regression: B-5a 互換)", () => {
    const input = buildMirrorDecisionInput({});
    expect(input.patternCategory.status).toBe("unknown");
    expect(input.patternCategory.bucket).toBe("unknown_category");
    expect(input.patternCategory.canProceedToMirrorDecision).toBe(false);
  });

  it("bridge initialize + signal なし → patternCategory 依然 unknown (cache 空)", () => {
    initializeBridgeOnce();
    const input = buildMirrorDecisionInput({});
    expect(input.patternCategory.status).toBe("unknown");
    expect(input.patternCategory.bucket).toBe("unknown_category");
  });

  it("bridge initialize + null_pattern signal → patternCategory known (null_pattern, canProceed true)", () => {
    initializeBridgeOnce();
    publishPresenceSignal(makeSignal({ kind: "implicit" })); // → null_pattern
    const input = buildMirrorDecisionInput({});
    expect(input.patternCategory.status).toBe("known");
    expect(input.patternCategory.bucket).toBe("null_pattern");
    if (input.patternCategory.status === "known") {
      expect(input.patternCategory.canProceedToMirrorDecision).toBe(true);
    }
  });

  it("bridge initialize + safety:* signal → patternCategory known (safety_concern, canProceed false)", () => {
    initializeBridgeOnce();
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "safety:risk" } }),
    );
    const input = buildMirrorDecisionInput({});
    expect(input.patternCategory.status).toBe("known");
    expect(input.patternCategory.bucket).toBe("safety_concern");
    if (input.patternCategory.status === "known") {
      expect(input.patternCategory.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("bridge initialize + rupture:* signal → patternCategory known (rupture_signal_high, canProceed false)", () => {
    initializeBridgeOnce();
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "rupture:hostility" } }),
    );
    const input = buildMirrorDecisionInput({});
    expect(input.patternCategory.status).toBe("known");
    expect(input.patternCategory.bucket).toBe("rupture_signal_high");
    if (input.patternCategory.status === "known") {
      expect(input.patternCategory.canProceedToMirrorDecision).toBe(false);
    }
  });

  it("bridge initialize 後でも 他 axis (mode/alignment/uncertainty/silenceBudget) は unknown 維持", () => {
    initializeBridgeOnce();
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    const input = buildMirrorDecisionInput({});
    expect(input.modeContext.status).toBe("unknown");
    expect(input.alignment.status).toBe("unknown");
    expect(input.uncertainty.status).toBe("unknown");
    expect(input.silenceBudget.status).toBe("unknown");
  });

  it("dispose 後 → patternCategory 再び unknown (regression: B-5a 互換)", () => {
    initializeBridgeOnce();
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    expect(buildMirrorDecisionInput({}).patternCategory.status).toBe("known");
    disposeBridge();
    expect(buildMirrorDecisionInput({}).patternCategory.status).toBe("unknown");
  });

  it("PII firewall regression: bridge 経由でも output に PII 漏れなし", () => {
    initializeBridgeOnce();
    publishPresenceSignal(
      makeSignal({
        meta: {
          matchedPattern: "safety:test",
          lastMessageId: "raw_msg_xxx",
          rawText: "PII本音テキスト",
          userId: "user_pii",
          pairId: "pair_pii",
          sessionId: "sess_pii",
        },
      }),
    );
    const input = buildMirrorDecisionInput({});
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("raw_msg_xxx");
    expect(serialized).not.toContain("PII本音テキスト");
    expect(serialized).not.toContain("user_pii");
    expect(serialized).not.toContain("pair_pii");
    expect(serialized).not.toContain("sess_pii");
    // safety:test raw も含まれない (bucket category のみ反映)
    expect(serialized).not.toContain("safety:test");
  });

  it("default STAY_SILENT 維持: bridge known でも他 axis unknown により Observe Gate fail 想定", () => {
    initializeBridgeOnce();
    publishPresenceSignal(makeSignal({ kind: "implicit" })); // null_pattern (canProceed true)
    const input = buildMirrorDecisionInput({});
    // patternCategory は canProceed true だが、他 axis (modeContext / alignment /
    // uncertainty / silenceBudget) が unknown のため、Observe Gate は依然 fail する想定
    // (engine 統合 test は decisionEngine.test.ts でカバー)
    expect(input.modeContext.canProceedToMirrorDecision).toBe(false);
    expect(input.alignment.canProceedToMirrorDecision).toBe(false);
    expect(input.uncertainty.canProceedToMirrorDecision).toBe(false);
    expect(input.silenceBudget.canProceedToMirrorDecision).toBe(false);
  });
});
