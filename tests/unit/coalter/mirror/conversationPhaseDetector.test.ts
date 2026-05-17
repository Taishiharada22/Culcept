/**
 * CoAlter AOO Phase B B-5a — conversationPhaseDetector invariant test
 *
 * 正本: lib/coalter/mirror/conversationPhaseDetector.ts
 */

import { describe, it, expect } from "vitest";
import {
  detectConversationPhase,
  __getThresholdsForTest,
  type ConversationPhaseDetectorInput,
} from "@/lib/coalter/mirror/conversationPhaseDetector";

describe("B-5a conversationPhaseDetector — unknown 経路 (defensive)", () => {
  it("input empty → unknown", () => {
    expect(detectConversationPhase({})).toBe("unknown");
  });

  it("messageCount undefined → unknown", () => {
    expect(detectConversationPhase({ messageCount: undefined })).toBe("unknown");
  });

  it("messageCount NaN → unknown", () => {
    expect(detectConversationPhase({ messageCount: NaN })).toBe("unknown");
  });

  it("messageCount Infinity → unknown", () => {
    expect(detectConversationPhase({ messageCount: Infinity })).toBe("unknown");
  });

  it("messageCount 負数 → unknown", () => {
    expect(detectConversationPhase({ messageCount: -1 })).toBe("unknown");
  });

  it("messageCount 型外 (string) → unknown", () => {
    expect(
      detectConversationPhase({ messageCount: "10" as unknown as number }),
    ).toBe("unknown");
  });
});

describe("B-5a conversationPhaseDetector — greeting (message count < threshold)", () => {
  it("messageCount 0 → greeting", () => {
    expect(detectConversationPhase({ messageCount: 0 })).toBe("greeting");
  });

  it("messageCount 1 → greeting", () => {
    expect(detectConversationPhase({ messageCount: 1 })).toBe("greeting");
  });

  it("messageCount 2 → greeting (threshold 3 未満)", () => {
    expect(detectConversationPhase({ messageCount: 2 })).toBe("greeting");
  });
});

describe("B-5a conversationPhaseDetector — in_progress (中間 message count、idle 未経過)", () => {
  it("messageCount === 3 (threshold) → in_progress", () => {
    expect(detectConversationPhase({ messageCount: 3 })).toBe("in_progress");
  });

  it("messageCount 5 / 10 / 50 → in_progress (idle 不明)", () => {
    for (const c of [5, 10, 50]) {
      expect(detectConversationPhase({ messageCount: c })).toBe("in_progress");
    }
  });

  it("messageCount 50 + idle 5000ms (< 60s) → in_progress", () => {
    expect(
      detectConversationPhase({ messageCount: 50, lastMessageAgeMs: 5000 }),
    ).toBe("in_progress");
  });
});

describe("B-5a conversationPhaseDetector — closing", () => {
  it("messageCount >= 100 → closing", () => {
    expect(detectConversationPhase({ messageCount: 100 })).toBe("closing");
    expect(detectConversationPhase({ messageCount: 150 })).toBe("closing");
  });

  it("idle > 60s → closing", () => {
    expect(
      detectConversationPhase({ messageCount: 10, lastMessageAgeMs: 60001 }),
    ).toBe("closing");
    expect(
      detectConversationPhase({ messageCount: 10, lastMessageAgeMs: 120000 }),
    ).toBe("closing");
  });

  it("messageCount >= 100 が idle 判定より優先", () => {
    expect(
      detectConversationPhase({ messageCount: 100, lastMessageAgeMs: 0 }),
    ).toBe("closing");
  });
});

describe("B-5a conversationPhaseDetector — invariants", () => {
  it("input mutation 0", () => {
    const input: ConversationPhaseDetectorInput = {
      messageCount: 10,
      lastMessageAgeMs: 5000,
    };
    const snapshot = JSON.stringify(input);
    detectConversationPhase(input);
    detectConversationPhase(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("deterministic", () => {
    const input: ConversationPhaseDetectorInput = { messageCount: 10 };
    expect(detectConversationPhase(input)).toBe(detectConversationPhase(input));
  });

  it("thresholds 期待値", () => {
    const t = __getThresholdsForTest();
    expect(t.greetingThreshold).toBe(3);
    expect(t.closingMessageCountThreshold).toBe(100);
    expect(t.closingIdleMsThreshold).toBe(60_000);
  });

  it("PII 非受理: extra fields 注入しても output に影響しない", () => {
    const inputWithPII = {
      messageCount: 10,
      lastMessageAgeMs: 5000,
      rawText: "leak",
      userId: "user_pii",
    } as unknown as ConversationPhaseDetectorInput;
    expect(detectConversationPhase(inputWithPII)).toBe("in_progress");
  });
});
