/**
 * Tests for relationshipStateRedaction.ts (Phase A-1)
 *
 * 検証項目:
 *   1. PII_FORBIDDEN_FIELD_NAMES の完全性
 *   2. computeRedactedRelationshipKey の確定性 / 一意性 / reverse 不可性
 *   3. redactInternalState の field 制約 / 副作用なし
 *   4. containsForbiddenFields の audit 動作
 *   5. PII firewall (redacted snapshot に禁止 field が含まれない)
 */

import { describe, it, expect } from "vitest";
import {
  PII_FORBIDDEN_FIELD_NAMES,
  computeRedactedRelationshipKey,
  redactInternalState,
  containsForbiddenFields,
} from "@/lib/coalter/observer/relationshipStateRedaction";
import {
  RELATIONSHIP_STATE_SCHEMA_VERSION,
  type InternalRelationshipState,
} from "@/lib/coalter/observer/relationshipStateTypes";

// ─────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────

const SAMPLE_INTERNAL_STATE: InternalRelationshipState = {
  schemaVersion: RELATIONSHIP_STATE_SCHEMA_VERSION,
  internalKey: "pair-state-id-sample-12345",
  stateVersion: 5,
  observationCount: 10,
  lastObservationAt: "2026-05-16T07:30:00Z",
  // Phase A-1b: ExecutorAvailability 値（既存 presence layer 整合）
  observerActivationState: "active",
  // Phase A-1b: PresenceMode 値（既存 presence layer 整合）
  modeContext: "normal",
  conversationPhase: "exploring",
  alignmentBucket: "positive",
  ruptureFlag: false,
  uncertaintyBucket: "mid_30_to_70",
  silenceBudgetBucket: "high_70_to_100",
  reasonCodes: ["state_initialized", "observation_recorded"],
};

const TEST_SALT = "test-salt-2026-05-16-deterministic";

// ─────────────────────────────────────────────
// PII_FORBIDDEN_FIELD_NAMES
// ─────────────────────────────────────────────

describe("PII_FORBIDDEN_FIELD_NAMES", () => {
  it("includes user identity fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("userId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("user_id");
  });

  it("includes pair identity fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("pairId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("pair_id");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("pairStateId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("pair_state_id");
  });

  it("includes thread / session fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("threadId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("thread_id");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("sessionId");
  });

  it("includes contact / network fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("email");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("url");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("URL");
  });

  it("includes message / text fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("message");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("utterance");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("text");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("rawText");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("body");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("content");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("note");
  });

  it("includes credential / secret fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("token");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("apiKey");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("api_key");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("secret");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("password");
  });

  it("is read-only (as const)", () => {
    // TypeScript level: readonly tuple
    // Runtime level: array structure
    expect(Array.isArray(PII_FORBIDDEN_FIELD_NAMES)).toBe(true);
    expect(PII_FORBIDDEN_FIELD_NAMES.length).toBeGreaterThan(20);
  });
});

// ─────────────────────────────────────────────
// computeRedactedRelationshipKey
// ─────────────────────────────────────────────

describe("computeRedactedRelationshipKey", () => {
  it("is deterministic for same input + same salt", () => {
    const k1 = computeRedactedRelationshipKey("pair-1", "salt-x");
    const k2 = computeRedactedRelationshipKey("pair-1", "salt-x");
    expect(k1).toBe(k2);
  });

  it("differs across different salts (same key)", () => {
    const k1 = computeRedactedRelationshipKey("pair-1", "salt-x");
    const k2 = computeRedactedRelationshipKey("pair-1", "salt-y");
    expect(k1).not.toBe(k2);
  });

  it("differs across different keys (same salt)", () => {
    const k1 = computeRedactedRelationshipKey("pair-1", "salt-x");
    const k2 = computeRedactedRelationshipKey("pair-2", "salt-x");
    expect(k1).not.toBe(k2);
  });

  it("does not contain raw internalKey in output", () => {
    const distinctKey = "very-distinct-recognizable-string-987654";
    const result = computeRedactedRelationshipKey(distinctKey, "salt");
    expect(result.includes(distinctKey)).toBe(false);
  });

  it("does not contain raw salt in output", () => {
    const distinctSalt = "very-distinct-salt-string-abcdef";
    const result = computeRedactedRelationshipKey("pair-1", distinctSalt);
    expect(result.includes(distinctSalt)).toBe(false);
  });

  it("output is base64url encoded (no +, /, or =)", () => {
    const result = computeRedactedRelationshipKey("pair-1", "salt-x");
    expect(result).not.toMatch(/[+/=]/);
  });

  it("output length is fixed (sha256 = 32 bytes → 43 base64url chars)", () => {
    const k1 = computeRedactedRelationshipKey("a", "salt");
    const k2 = computeRedactedRelationshipKey(
      "this-is-a-very-long-internal-key-with-many-characters",
      "salt",
    );
    expect(k1.length).toBe(k2.length);
    expect(k1.length).toBe(43);
  });

  it("throws on empty internalKey", () => {
    expect(() => computeRedactedRelationshipKey("", "salt")).toThrow();
  });

  it("throws on empty salt", () => {
    expect(() => computeRedactedRelationshipKey("pair-1", "")).toThrow();
  });

  it("throws on non-string internalKey", () => {
    expect(() =>
      computeRedactedRelationshipKey(null as unknown as string, "salt"),
    ).toThrow();
    expect(() =>
      computeRedactedRelationshipKey(undefined as unknown as string, "salt"),
    ).toThrow();
    expect(() =>
      computeRedactedRelationshipKey(123 as unknown as string, "salt"),
    ).toThrow();
  });

  it("throws on non-string salt", () => {
    expect(() =>
      computeRedactedRelationshipKey("pair-1", null as unknown as string),
    ).toThrow();
    expect(() =>
      computeRedactedRelationshipKey("pair-1", undefined as unknown as string),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────
// redactInternalState
// ─────────────────────────────────────────────

describe("redactInternalState", () => {
  it("produces snapshot without internalKey field", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect((snap as unknown as { internalKey?: unknown }).internalKey).toBeUndefined();
  });

  it("produces snapshot with redactedRelationshipKey field", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap.redactedRelationshipKey).toBeDefined();
    expect(typeof snap.redactedRelationshipKey).toBe("string");
    expect(snap.redactedRelationshipKey.length).toBe(43);
  });

  it("preserves schemaVersion", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap.schemaVersion).toBe(RELATIONSHIP_STATE_SCHEMA_VERSION);
  });

  it("preserves stateVersion", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap.stateVersion).toBe(5);
  });

  it("preserves observationCount", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap.observationCount).toBe(10);
  });

  it("preserves lastObservationAt", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap.lastObservationAt).toBe("2026-05-16T07:30:00Z");
  });

  it("preserves all bucket fields", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap.alignmentBucket).toBe("positive");
    expect(snap.uncertaintyBucket).toBe("mid_30_to_70");
    expect(snap.silenceBudgetBucket).toBe("high_70_to_100");
  });

  it("preserves observerActivationState / modeContext / conversationPhase / ruptureFlag", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    // Phase A-1b: ExecutorAvailability "active" / PresenceMode "normal"
    expect(snap.observerActivationState).toBe("active");
    expect(snap.modeContext).toBe("normal");
    expect(snap.conversationPhase).toBe("exploring");
    expect(snap.ruptureFlag).toBe(false);
  });

  it("preserves modeContext = null (no signal received)", () => {
    const stateWithNullMode: InternalRelationshipState = {
      ...SAMPLE_INTERNAL_STATE,
      modeContext: null,
    };
    const snap = redactInternalState(stateWithNullMode, TEST_SALT);
    expect(snap.modeContext).toBeNull();
  });

  it("PresenceMode is NOT PII (kept in redacted snapshot per CEO/GPT 2026-05-16 B3 NO)", () => {
    // PresenceMode ("normal" / "daily" / "travel") は observer 文脈の重要 dimension。
    // PII forbidden list には入れない (B3 NO 判断)。
    for (const mode of ["normal", "daily", "travel"] as const) {
      const state: InternalRelationshipState = {
        ...SAMPLE_INTERNAL_STATE,
        modeContext: mode,
      };
      const snap = redactInternalState(state, TEST_SALT);
      expect(snap.modeContext).toBe(mode);
    }
  });

  it("creates defensive copy of reasonCodes (mutation does not affect original)", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    (snap.reasonCodes as unknown as string[]).push("rupture_detected");
    const snap2 = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(snap2.reasonCodes.length).toBe(2);
  });

  it("does not mutate input state", () => {
    const originalReasonCodesLength = SAMPLE_INTERNAL_STATE.reasonCodes.length;
    redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(SAMPLE_INTERNAL_STATE.reasonCodes.length).toBe(
      originalReasonCodesLength,
    );
  });

  it("output JSON does not contain raw internalKey", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    const json = JSON.stringify(snap);
    expect(json.includes("pair-state-id-sample-12345")).toBe(false);
  });

  it("is deterministic (same input + same salt → identical output)", () => {
    const s1 = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    const s2 = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    expect(s1).toEqual(s2);
  });

  it("produces different redactedRelationshipKey for different salts", () => {
    const s1 = redactInternalState(SAMPLE_INTERNAL_STATE, "salt-a");
    const s2 = redactInternalState(SAMPLE_INTERNAL_STATE, "salt-b");
    expect(s1.redactedRelationshipKey).not.toBe(s2.redactedRelationshipKey);
  });
});

// ─────────────────────────────────────────────
// containsForbiddenFields
// ─────────────────────────────────────────────

describe("containsForbiddenFields", () => {
  it("returns empty array for clean object", () => {
    const clean = { schemaVersion: 1, observationCount: 5, foo: "bar" };
    expect(containsForbiddenFields(clean)).toEqual([]);
  });

  it("detects single PII field", () => {
    const dirty = { schemaVersion: 1, userId: "u-1" };
    const found = containsForbiddenFields(dirty);
    expect(found).toContain("userId");
    expect(found.length).toBe(1);
  });

  it("detects multiple PII fields", () => {
    const dirty = {
      schemaVersion: 1,
      userId: "u-1",
      email: "x@y.z",
      pairStateId: "p-1",
    };
    const found = containsForbiddenFields(dirty);
    expect(found).toContain("userId");
    expect(found).toContain("email");
    expect(found).toContain("pairStateId");
  });

  it("does not mutate input object", () => {
    const original = { userId: "u-1", foo: "bar" };
    const snapshot = JSON.stringify(original);
    containsForbiddenFields(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────
// PII firewall integration
// ─────────────────────────────────────────────

describe("redactInternalState — PII firewall integration", () => {
  it("output object contains no forbidden field names", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    const found = containsForbiddenFields(
      snap as unknown as Record<string, unknown>,
    );
    expect(found).toEqual([]);
  });

  it("output JSON-stringified does not match any PII field name as JSON key", () => {
    const snap = redactInternalState(SAMPLE_INTERNAL_STATE, TEST_SALT);
    const json = JSON.stringify(snap);
    for (const piiField of PII_FORBIDDEN_FIELD_NAMES) {
      // Look for `"<piiField>":` pattern in JSON output (key matching)
      expect(json.includes(`"${piiField}":`)).toBe(false);
    }
  });
});
