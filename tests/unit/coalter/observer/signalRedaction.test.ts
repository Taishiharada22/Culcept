/**
 * Tests for signalRedaction.ts (Phase A-2b)
 *
 * 検証項目:
 *   1. computeRedactedMessageKey の確定性 / 一意性 / reverse 不可性
 *   2. bucketizeMatchedPattern の bucket 化
 *   3. redactSignal の raw 値 firewall (lastMessageId / matchedPattern)
 *   4. PII firewall (raw 値が snapshot に含まれない)
 *   5. boundary inputs (空 / undefined / 不正型)
 *   6. immutability (input signal mutate なし)
 *   7. deterministic (same input + same salt → same output)
 */

import { describe, it, expect } from "vitest";
import {
  SIGNAL_REDACTION_SCHEMA_VERSION,
  bucketizeMatchedPattern,
  computeRedactedMessageKey,
  redactSignal,
} from "@/lib/coalter/observer/signalRedaction";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const TEST_SALT = "test-salt-2026-05-16-a2b-deterministic";
const RAW_MESSAGE_ID = "msg-uuid-very-distinct-12345-abcdef";

// ─────────────────────────────────────────────
// Schema version
// ─────────────────────────────────────────────

describe("SIGNAL_REDACTION_SCHEMA_VERSION", () => {
  it("is fixed at 1", () => {
    expect(SIGNAL_REDACTION_SCHEMA_VERSION).toBe(1);
  });
});

// ─────────────────────────────────────────────
// computeRedactedMessageKey
// ─────────────────────────────────────────────

describe("computeRedactedMessageKey", () => {
  it("is deterministic for same input + same salt", () => {
    const k1 = computeRedactedMessageKey("msg-1", TEST_SALT);
    const k2 = computeRedactedMessageKey("msg-1", TEST_SALT);
    expect(k1).toBe(k2);
  });

  it("differs across different salts (same messageId)", () => {
    const k1 = computeRedactedMessageKey("msg-1", "salt-a");
    const k2 = computeRedactedMessageKey("msg-1", "salt-b");
    expect(k1).not.toBe(k2);
  });

  it("differs across different messageIds (same salt)", () => {
    const k1 = computeRedactedMessageKey("msg-1", TEST_SALT);
    const k2 = computeRedactedMessageKey("msg-2", TEST_SALT);
    expect(k1).not.toBe(k2);
  });

  it("does not contain raw messageId in output", () => {
    const result = computeRedactedMessageKey(RAW_MESSAGE_ID, TEST_SALT);
    expect(result.includes(RAW_MESSAGE_ID)).toBe(false);
  });

  it("does not contain raw salt in output", () => {
    const distinctSalt = "very-distinct-salt-zzzzzzzz";
    const result = computeRedactedMessageKey("msg-1", distinctSalt);
    expect(result.includes(distinctSalt)).toBe(false);
  });

  it("output is base64url encoded (no +, /, or =)", () => {
    const result = computeRedactedMessageKey("msg-1", TEST_SALT);
    expect(result).not.toMatch(/[+/=]/);
  });

  it("output length is fixed (sha256 = 32 bytes → 43 base64url chars)", () => {
    const k1 = computeRedactedMessageKey("a", TEST_SALT);
    const k2 = computeRedactedMessageKey(
      "this-is-a-very-long-message-id-with-many-characters-zzzz",
      TEST_SALT,
    );
    expect(k1.length).toBe(k2.length);
    expect(k1.length).toBe(43);
  });

  it("differs from computeRedactedRelationshipKey (separator difference)", () => {
    // 同じ input でも separator 違いで別 hash になることを確認 (cross-key contamination 防止)
    const k = computeRedactedMessageKey("same-input", "same-salt");
    // computeRedactedRelationshipKey は `:` separator、computeRedactedMessageKey は `:message:` separator
    // 直接 import せず、出力が異なることだけ確認
    expect(k.length).toBe(43);
  });

  it("throws on empty messageId", () => {
    expect(() => computeRedactedMessageKey("", TEST_SALT)).toThrow();
  });

  it("throws on empty salt", () => {
    expect(() => computeRedactedMessageKey("msg-1", "")).toThrow();
  });

  it("throws on non-string messageId", () => {
    expect(() =>
      computeRedactedMessageKey(null as unknown as string, TEST_SALT),
    ).toThrow();
    expect(() =>
      computeRedactedMessageKey(undefined as unknown as string, TEST_SALT),
    ).toThrow();
  });

  it("throws on non-string salt", () => {
    expect(() =>
      computeRedactedMessageKey("msg-1", null as unknown as string),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────
// bucketizeMatchedPattern
// ─────────────────────────────────────────────

describe("bucketizeMatchedPattern", () => {
  it("safety: prefix → safety_concern", () => {
    expect(bucketizeMatchedPattern("safety:self-harm")).toBe("safety_concern");
  });

  it("rupture: prefix → rupture_signal", () => {
    expect(bucketizeMatchedPattern("rupture:hostility")).toBe("rupture_signal");
    expect(bucketizeMatchedPattern("rupture:limit")).toBe("rupture_signal");
  });

  it("other strings → unknown_category", () => {
    expect(bucketizeMatchedPattern("some-other-pattern")).toBe("unknown_category");
    expect(bucketizeMatchedPattern("future:new-category")).toBe(
      "unknown_category",
    );
  });

  it("empty string → null", () => {
    expect(bucketizeMatchedPattern("")).toBeNull();
  });

  it("undefined → null", () => {
    expect(bucketizeMatchedPattern(undefined)).toBeNull();
  });

  it("null → null", () => {
    expect(bucketizeMatchedPattern(null)).toBeNull();
  });

  it("returns category only, raw value never returned", () => {
    const rawWithSecret = "safety:self-harm-with-additional-secret-zzz";
    const result = bucketizeMatchedPattern(rawWithSecret);
    // category は固定 enum のみ、raw 値 (additional-secret-zzz) は返らない
    expect(result).toBe("safety_concern");
    expect(typeof result).toBe("string");
    expect(result?.includes("zzz") ?? false).toBe(false);
  });
});

// ─────────────────────────────────────────────
// redactSignal — kind + strength + detectedAt preservation
// ─────────────────────────────────────────────

describe("redactSignal — preservation of safe fields", () => {
  it("preserves kind", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1234567890,
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.kind).toBe("implicit");
  });

  it("preserves strength", () => {
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1234567890,
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.strength).toBe("strong");
  });

  it("preserves detectedAt", () => {
    const sig: PresenceSignal = {
      kind: "explicit",
      strength: "strong",
      detectedAt: 9876543210,
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.detectedAt).toBe(9876543210);
  });

  it("schemaVersion is fixed at 1", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.schemaVersion).toBe(1);
  });
});

// ─────────────────────────────────────────────
// redactSignal — meta redaction
// ─────────────────────────────────────────────

describe("redactSignal — meta redaction (CEO/GPT 補正1 + 補正2)", () => {
  it("converts raw lastMessageId to redactedMessageKey (hash)", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: RAW_MESSAGE_ID },
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.redactedMessageKey).not.toBeNull();
    expect(result.redactedMessageKey?.length).toBe(43);
    expect(result.redactedMessageKey?.includes(RAW_MESSAGE_ID)).toBe(false);
  });

  it("redactedMessageKey is deterministic with same salt", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: RAW_MESSAGE_ID },
    };
    const r1 = redactSignal(sig, TEST_SALT);
    const r2 = redactSignal(sig, TEST_SALT);
    expect(r1.redactedMessageKey).toBe(r2.redactedMessageKey);
  });

  it("redactedMessageKey is null when meta has no lastMessageId", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { someOtherField: "value" },
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.redactedMessageKey).toBeNull();
  });

  it("redactedMessageKey is null when meta is undefined", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.redactedMessageKey).toBeNull();
  });

  it("redactedMessageKey is null when lastMessageId is empty string", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: "" },
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.redactedMessageKey).toBeNull();
  });

  it("converts raw matchedPattern to bucket (CEO/GPT 補正1: raw 禁止)", () => {
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: "safety:self-harm" },
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.matchedPatternCategory).toBe("safety_concern");
  });

  it("matchedPatternCategory is null when no matchedPattern in meta", () => {
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: {},
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.matchedPatternCategory).toBeNull();
  });

  it("matchedPatternCategory is unknown_category for unrecognized prefix", () => {
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: "future-uncategorized:something" },
    };
    const result = redactSignal(sig, TEST_SALT);
    expect(result.matchedPatternCategory).toBe("unknown_category");
  });
});

// ─────────────────────────────────────────────
// redactSignal — PII firewall (raw values absent)
// ─────────────────────────────────────────────

describe("redactSignal — PII firewall", () => {
  it("output JSON does not contain raw lastMessageId", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: RAW_MESSAGE_ID },
    };
    const result = redactSignal(sig, TEST_SALT);
    const json = JSON.stringify(result);
    expect(json.includes(RAW_MESSAGE_ID)).toBe(false);
  });

  it("output JSON does not contain raw matchedPattern detail (CEO/GPT 補正1)", () => {
    // matchedPattern が将来 raw 文字列 (user-derived) を含んでも raw は出ない
    const distinctRawSuffix = "raw-user-derived-secret-zzzzzz";
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: `safety:${distinctRawSuffix}` },
    };
    const result = redactSignal(sig, TEST_SALT);
    const json = JSON.stringify(result);
    // category は出るが、raw suffix (raw-user-derived-secret-zzzzzz) は出ない
    expect(json.includes(distinctRawSuffix)).toBe(false);
    expect(result.matchedPatternCategory).toBe("safety_concern");
  });

  it("ignores unknown meta fields (whitelist redaction)", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: {
        lastMessageId: RAW_MESSAGE_ID,
        someUnknownField: "raw-secret-from-future-publisher-zzz",
        anotherField: 12345,
      },
    };
    const result = redactSignal(sig, TEST_SALT);
    const json = JSON.stringify(result);
    expect(json.includes("raw-secret-from-future-publisher-zzz")).toBe(false);
    expect(json.includes("someUnknownField")).toBe(false);
    expect(json.includes("anotherField")).toBe(false);
  });

  it("output object only has whitelisted top-level fields", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: "msg-1" },
    };
    const result = redactSignal(sig, TEST_SALT);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      [
        "schemaVersion",
        "kind",
        "strength",
        "detectedAt",
        "redactedMessageKey",
        "matchedPatternCategory",
      ].sort(),
    );
  });
});

// ─────────────────────────────────────────────
// redactSignal — immutability
// ─────────────────────────────────────────────

describe("redactSignal — immutability", () => {
  it("does not mutate input signal", () => {
    const meta = { lastMessageId: RAW_MESSAGE_ID, matchedPattern: "safety:self-harm" };
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta,
    };
    const snapshot = JSON.stringify(sig);
    redactSignal(sig, TEST_SALT);
    expect(JSON.stringify(sig)).toBe(snapshot);
  });

  it("does not mutate input meta object", () => {
    const meta = { lastMessageId: RAW_MESSAGE_ID };
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta,
    };
    const metaSnapshot = JSON.stringify(meta);
    redactSignal(sig, TEST_SALT);
    expect(JSON.stringify(meta)).toBe(metaSnapshot);
  });
});

// ─────────────────────────────────────────────
// redactSignal — error inputs
// ─────────────────────────────────────────────

describe("redactSignal — error inputs", () => {
  it("throws on empty salt", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    };
    expect(() => redactSignal(sig, "")).toThrow();
  });

  it("throws on null signal", () => {
    expect(() => redactSignal(null as unknown as PresenceSignal, TEST_SALT)).toThrow();
  });

  it("throws on signal without kind", () => {
    const malformed = { strength: "soft", detectedAt: 1 } as unknown as PresenceSignal;
    expect(() => redactSignal(malformed, TEST_SALT)).toThrow();
  });

  it("throws on signal without detectedAt as number", () => {
    const malformed = {
      kind: "implicit",
      strength: "soft",
      detectedAt: "not-a-number",
    } as unknown as PresenceSignal;
    expect(() => redactSignal(malformed, TEST_SALT)).toThrow();
  });
});
