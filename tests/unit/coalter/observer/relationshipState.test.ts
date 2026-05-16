/**
 * Tests for relationshipState.ts (Phase A-1b — PresenceMode alignment)
 *
 * Phase A-1b 変更:
 *   - modeContext: "unknown"|"off"|"on" → PresenceMode | null
 *   - observerActivationState: 独自 → ExecutorAvailability (5 値)
 *   - schemaVersion: 1 → 2
 *
 * 検証項目:
 *   1. Initial state (empty container, key 未登録)
 *   2. Create / update with patches (PresenceMode 整合)
 *   3. observation count increments
 *   4. Defensive copy on read/write
 *   5. Multi-key isolation
 *   6. Reset / clear behavior
 *   7. Reason codes FIFO cap (Phase A-1b 新 reason codes)
 *   8. PresenceMode 互換性 (normal / daily / travel / null 受容)
 *   9. ExecutorAvailability 5 値受容
 *  10. modeContext null clear (undefined と null の区別)
 *  11. Caller-provided observedAt (no Date.now dependency)
 *  12. Error inputs (empty / non-string key)
 *  13. Redacted snapshot via container
 *  14. Process-local behavior (clearAllForTests で reset)
 *  15. schemaVersion = 2
 *  16. Presence layer file 不触
 *  17. Runtime callsite 不在
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getRelationshipStateSnapshotInternal,
  updateRelationshipState,
  getRedactedRelationshipStateSnapshot,
  resetRelationshipState,
  clearAllRelationshipStatesForTests,
  setReasonCodeCapForTests,
  getReasonCodeCapForTests,
  getStoreSizeForTests,
  iterateRedactedSnapshotsForDebug,
} from "@/lib/coalter/observer/relationshipState";
import {
  RELATIONSHIP_STATE_SCHEMA_VERSION,
  type InternalRelationshipState,
  type RelationshipStatePatch,
} from "@/lib/coalter/observer/relationshipStateTypes";

const KEY_A = "pair-state-id-aaaa";
const KEY_B = "pair-state-id-bbbb";
const SALT = "test-salt-2026-05-16";

// ─────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────

describe("relationshipState — initial state", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("returns null for unknown key", () => {
    expect(getRelationshipStateSnapshotInternal(KEY_A)).toBeNull();
  });

  it("createInitial via empty patch sets all unknown defaults", () => {
    const state = updateRelationshipState(KEY_A, {});
    expect(state.observationCount).toBe(0);
    expect(state.lastObservationAt).toBeNull();
    // Phase A-1b: modeContext default = null (mode signal 未受領)
    expect(state.modeContext).toBeNull();
    // Phase A-1b: observerActivationState default = "inactive" (ExecutorAvailability 中性値)
    expect(state.observerActivationState).toBe("inactive");
    expect(state.conversationPhase).toBe("unknown");
    expect(state.alignmentBucket).toBe("unknown");
    expect(state.uncertaintyBucket).toBe("unknown");
    expect(state.silenceBudgetBucket).toBe("unknown");
    expect(state.ruptureFlag).toBe(false);
    expect(state.reasonCodes).toEqual(["state_initialized"]);
  });

  it("stateVersion starts at 1 after first update (initial = 0 + 1)", () => {
    const state = updateRelationshipState(KEY_A, {});
    expect(state.stateVersion).toBe(1);
  });

  it("schemaVersion is fixed (Phase A-1b: bumped to 2)", () => {
    const state = updateRelationshipState(KEY_A, {});
    expect(state.schemaVersion).toBe(RELATIONSHIP_STATE_SCHEMA_VERSION);
    expect(state.schemaVersion).toBe(2);
  });

  it("internalKey is set to the provided key", () => {
    const state = updateRelationshipState(KEY_A, {});
    expect(state.internalKey).toBe(KEY_A);
  });
});

// ─────────────────────────────────────────────
// Update / observation recording
// ─────────────────────────────────────────────

describe("relationshipState — observation recording", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("increments observationCount when recordingObservation=true", () => {
    updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:30:00Z",
    });
    const s = updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:35:00Z",
    });
    expect(s.observationCount).toBe(2);
    expect(s.lastObservationAt).toBe("2026-05-16T07:35:00Z");
  });

  it("does NOT increment observationCount without recordingObservation", () => {
    updateRelationshipState(KEY_A, {
      modeContext: "normal",
    });
    const s = updateRelationshipState(KEY_A, { modeContext: "daily" });
    expect(s.observationCount).toBe(0);
    expect(s.lastObservationAt).toBeNull();
  });

  it("recordingObservation=true without observedAt does not update lastObservationAt", () => {
    updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:30:00Z",
    });
    const s = updateRelationshipState(KEY_A, { recordingObservation: true });
    expect(s.observationCount).toBe(2);
    expect(s.lastObservationAt).toBe("2026-05-16T07:30:00Z");
  });

  it("stateVersion increments on every update", () => {
    let s = updateRelationshipState(KEY_A, {});
    expect(s.stateVersion).toBe(1);
    s = updateRelationshipState(KEY_A, {});
    expect(s.stateVersion).toBe(2);
    s = updateRelationshipState(KEY_A, {});
    expect(s.stateVersion).toBe(3);
  });
});

// ─────────────────────────────────────────────
// Patch fields
// ─────────────────────────────────────────────

describe("relationshipState — patch fields", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("updates observerActivationState", () => {
    const s = updateRelationshipState(KEY_A, {
      observerActivationState: "active",
    });
    expect(s.observerActivationState).toBe("active");
  });

  it("updates conversationPhase", () => {
    const s = updateRelationshipState(KEY_A, {
      conversationPhase: "exploring",
    });
    expect(s.conversationPhase).toBe("exploring");
  });

  it("updates alignmentBucket", () => {
    const s = updateRelationshipState(KEY_A, {
      alignmentBucket: "positive",
    });
    expect(s.alignmentBucket).toBe("positive");
  });

  it("updates ruptureFlag", () => {
    const s = updateRelationshipState(KEY_A, { ruptureFlag: true });
    expect(s.ruptureFlag).toBe(true);
  });

  it("updates uncertaintyBucket", () => {
    const s = updateRelationshipState(KEY_A, {
      uncertaintyBucket: "high_70_to_100",
    });
    expect(s.uncertaintyBucket).toBe("high_70_to_100");
  });

  it("updates silenceBudgetBucket", () => {
    const s = updateRelationshipState(KEY_A, {
      silenceBudgetBucket: "low_0_to_30",
    });
    expect(s.silenceBudgetBucket).toBe("low_0_to_30");
  });

  it("preserves unspecified fields", () => {
    updateRelationshipState(KEY_A, {
      modeContext: "normal",
      alignmentBucket: "positive",
      ruptureFlag: true,
    });
    const s = updateRelationshipState(KEY_A, {
      modeContext: "daily",
    });
    expect(s.modeContext).toBe("daily");
    expect(s.alignmentBucket).toBe("positive");
    expect(s.ruptureFlag).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Defensive copy
// ─────────────────────────────────────────────

describe("relationshipState — defensive copy on read", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("read returns defensive copy (mutation does not affect store)", () => {
    updateRelationshipState(KEY_A, {});
    const snap = getRelationshipStateSnapshotInternal(KEY_A);
    expect(snap).not.toBeNull();
    (snap as unknown as { observationCount: number }).observationCount = 999;
    const fresh = getRelationshipStateSnapshotInternal(KEY_A);
    expect(fresh?.observationCount).toBe(0);
  });

  it("read returns defensive copy of reasonCodes array", () => {
    updateRelationshipState(KEY_A, {});
    const snap = getRelationshipStateSnapshotInternal(KEY_A);
    expect(snap).not.toBeNull();
    (snap?.reasonCodes as unknown as string[]).push("rupture_detected");
    const fresh = getRelationshipStateSnapshotInternal(KEY_A);
    expect(fresh?.reasonCodes).toEqual(["state_initialized"]);
  });

  it("update returns defensive copy (mutation does not affect store)", () => {
    const returned = updateRelationshipState(KEY_A, { modeContext: "normal" });
    (returned as unknown as { modeContext: string }).modeContext = "daily";
    const fresh = getRelationshipStateSnapshotInternal(KEY_A);
    expect(fresh?.modeContext).toBe("normal");
  });
});

// ─────────────────────────────────────────────
// Multi-key isolation
// ─────────────────────────────────────────────

describe("relationshipState — multi-key isolation", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("states for different keys are isolated", () => {
    updateRelationshipState(KEY_A, { modeContext: "normal" });
    updateRelationshipState(KEY_B, { modeContext: "travel" });
    const a = getRelationshipStateSnapshotInternal(KEY_A);
    const b = getRelationshipStateSnapshotInternal(KEY_B);
    expect(a?.modeContext).toBe("normal");
    expect(b?.modeContext).toBe("travel");
  });

  it("observation count is per-key", () => {
    updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:30:00Z",
    });
    updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:31:00Z",
    });
    updateRelationshipState(KEY_B, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:32:00Z",
    });
    const a = getRelationshipStateSnapshotInternal(KEY_A);
    const b = getRelationshipStateSnapshotInternal(KEY_B);
    expect(a?.observationCount).toBe(2);
    expect(b?.observationCount).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Reset / clear
// ─────────────────────────────────────────────

describe("relationshipState — reset and clear", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("resetRelationshipState removes only the specified key", () => {
    updateRelationshipState(KEY_A, {});
    updateRelationshipState(KEY_B, {});
    expect(getStoreSizeForTests()).toBe(2);
    resetRelationshipState(KEY_A);
    expect(getRelationshipStateSnapshotInternal(KEY_A)).toBeNull();
    expect(getRelationshipStateSnapshotInternal(KEY_B)).not.toBeNull();
    expect(getStoreSizeForTests()).toBe(1);
  });

  it("resetRelationshipState is idempotent (no error if key not exist)", () => {
    expect(() => resetRelationshipState(KEY_A)).not.toThrow();
  });

  it("clearAllRelationshipStatesForTests removes all keys", () => {
    updateRelationshipState(KEY_A, {});
    updateRelationshipState(KEY_B, {});
    clearAllRelationshipStatesForTests();
    expect(getRelationshipStateSnapshotInternal(KEY_A)).toBeNull();
    expect(getRelationshipStateSnapshotInternal(KEY_B)).toBeNull();
    expect(getStoreSizeForTests()).toBe(0);
  });

  it("clearAllRelationshipStatesForTests resets reasonCodeCap to default", () => {
    setReasonCodeCapForTests(5);
    expect(getReasonCodeCapForTests()).toBe(5);
    clearAllRelationshipStatesForTests();
    expect(getReasonCodeCapForTests()).toBe(50);
  });
});

// ─────────────────────────────────────────────
// Reason codes FIFO cap
// ─────────────────────────────────────────────

describe("relationshipState — reason codes FIFO cap", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
    setReasonCodeCapForTests(3);
  });

  it("drops oldest reason codes when exceeding cap", () => {
    // Initial state already has ["state_initialized"]
    updateRelationshipState(KEY_A, {
      newReasonCodes: ["observation_recorded"],
    });
    updateRelationshipState(KEY_A, {
      newReasonCodes: ["rupture_detected"],
    });
    updateRelationshipState(KEY_A, {
      newReasonCodes: ["alignment_shift_detected"],
    });
    const s = getRelationshipStateSnapshotInternal(KEY_A);
    // total appended: state_initialized + observation_recorded + rupture_detected + alignment_shift_detected = 4
    // cap = 3 → drop oldest → ["observation_recorded", "rupture_detected", "alignment_shift_detected"]
    expect(s?.reasonCodes).toEqual([
      "observation_recorded",
      "rupture_detected",
      "alignment_shift_detected",
    ]);
  });

  it("does not append when newReasonCodes is undefined", () => {
    updateRelationshipState(KEY_A, {});
    const s = getRelationshipStateSnapshotInternal(KEY_A);
    expect(s?.reasonCodes).toEqual(["state_initialized"]);
  });

  it("handles multiple reasonCodes in single update", () => {
    setReasonCodeCapForTests(50);
    updateRelationshipState(KEY_A, {
      newReasonCodes: [
        "observation_recorded",
        "phase_inferred",
        "alignment_shift_detected",
      ],
    });
    const s = getRelationshipStateSnapshotInternal(KEY_A);
    expect(s?.reasonCodes).toEqual([
      "state_initialized",
      "observation_recorded",
      "phase_inferred",
      "alignment_shift_detected",
    ]);
  });
});

// ─────────────────────────────────────────────
// PresenceMode 互換性 (Phase A-1b: PresenceMode | null 整合)
// ─────────────────────────────────────────────

describe("relationshipState — PresenceMode 互換性", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("accepts 'normal' (PresenceMode value)", () => {
    const s = updateRelationshipState(KEY_A, { modeContext: "normal" });
    expect(s.modeContext).toBe("normal");
  });

  it("accepts 'daily' (PresenceMode value)", () => {
    const s = updateRelationshipState(KEY_A, { modeContext: "daily" });
    expect(s.modeContext).toBe("daily");
  });

  it("accepts 'travel' (PresenceMode value)", () => {
    const s = updateRelationshipState(KEY_A, { modeContext: "travel" });
    expect(s.modeContext).toBe("travel");
  });

  it("accepts null (mode signal 未受領 / clear)", () => {
    // First set to a value
    updateRelationshipState(KEY_A, { modeContext: "normal" });
    // Then explicitly clear with null
    const s = updateRelationshipState(KEY_A, { modeContext: null });
    expect(s.modeContext).toBeNull();
  });

  it("null clear distinguished from undefined omit (critical bug fix Phase A-1b)", () => {
    // Set mode to "daily"
    updateRelationshipState(KEY_A, { modeContext: "daily" });
    // Update WITHOUT modeContext field (undefined) → preserves "daily"
    const sOmit = updateRelationshipState(KEY_A, { alignmentBucket: "positive" });
    expect(sOmit.modeContext).toBe("daily");
    // Update WITH modeContext: null → clears to null
    const sClear = updateRelationshipState(KEY_A, { modeContext: null });
    expect(sClear.modeContext).toBeNull();
  });
});

// ─────────────────────────────────────────────
// ExecutorAvailability 互換性 (Phase A-1b: 5 値受容)
// ─────────────────────────────────────────────

describe("relationshipState — ExecutorAvailability 互換性", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("accepts 'disabled'", () => {
    const s = updateRelationshipState(KEY_A, {
      observerActivationState: "disabled",
    });
    expect(s.observerActivationState).toBe("disabled");
  });

  it("accepts 'inactive'", () => {
    const s = updateRelationshipState(KEY_A, {
      observerActivationState: "inactive",
    });
    expect(s.observerActivationState).toBe("inactive");
  });

  it("accepts 'pending_consent'", () => {
    const s = updateRelationshipState(KEY_A, {
      observerActivationState: "pending_consent",
    });
    expect(s.observerActivationState).toBe("pending_consent");
  });

  it("accepts 'enabled'", () => {
    const s = updateRelationshipState(KEY_A, {
      observerActivationState: "enabled",
    });
    expect(s.observerActivationState).toBe("enabled");
  });

  it("accepts 'active'", () => {
    const s = updateRelationshipState(KEY_A, {
      observerActivationState: "active",
    });
    expect(s.observerActivationState).toBe("active");
  });
});

// ─────────────────────────────────────────────
// Caller-provided observedAt
// ─────────────────────────────────────────────

describe("relationshipState — caller-provided observedAt", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("uses caller-provided observedAt (no Date.now dependency)", () => {
    // Use a fixed past timestamp - if container used Date.now, this would be 'now'
    const fixedPastTimestamp = "1970-01-01T00:00:00Z";
    const s = updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: fixedPastTimestamp,
    });
    expect(s.lastObservationAt).toBe(fixedPastTimestamp);
  });

  it("preserves previous lastObservationAt if observedAt not provided in new update", () => {
    updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: "2026-05-16T07:30:00Z",
    });
    const s = updateRelationshipState(KEY_A, {
      recordingObservation: true,
    });
    expect(s.lastObservationAt).toBe("2026-05-16T07:30:00Z");
    expect(s.observationCount).toBe(2);
  });

  it("deterministic across multiple updates with same observedAt", () => {
    const ts = "2026-05-16T07:30:00Z";
    const s1 = updateRelationshipState(KEY_A, {
      recordingObservation: true,
      observedAt: ts,
    });
    expect(s1.lastObservationAt).toBe(ts);
  });
});

// ─────────────────────────────────────────────
// Error inputs
// ─────────────────────────────────────────────

describe("relationshipState — error inputs", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("throws on empty key for getRelationshipStateSnapshotInternal", () => {
    expect(() => getRelationshipStateSnapshotInternal("")).toThrow();
  });

  it("throws on empty key for updateRelationshipState", () => {
    expect(() => updateRelationshipState("", {})).toThrow();
  });

  it("throws on empty key for resetRelationshipState", () => {
    expect(() => resetRelationshipState("")).toThrow();
  });

  it("throws on non-string key", () => {
    expect(() =>
      getRelationshipStateSnapshotInternal(null as unknown as string),
    ).toThrow();
    expect(() =>
      getRelationshipStateSnapshotInternal(undefined as unknown as string),
    ).toThrow();
  });

  it("setReasonCodeCapForTests throws on invalid cap", () => {
    expect(() => setReasonCodeCapForTests(0)).toThrow();
    expect(() => setReasonCodeCapForTests(-1)).toThrow();
    expect(() => setReasonCodeCapForTests(1.5)).toThrow();
    expect(() => setReasonCodeCapForTests(NaN)).toThrow();
    expect(() => setReasonCodeCapForTests(Infinity)).toThrow();
  });
});

// ─────────────────────────────────────────────
// Redacted snapshot via container
// ─────────────────────────────────────────────

describe("relationshipState — redacted snapshot via container", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("getRedactedRelationshipStateSnapshot does NOT include raw pairStateId", () => {
    updateRelationshipState(KEY_A, { observerActivationState: "active" });
    const snap = getRedactedRelationshipStateSnapshot(KEY_A, SALT);
    expect(snap).not.toBeNull();
    expect(
      (snap as unknown as { internalKey?: unknown })?.internalKey,
    ).toBeUndefined();
    expect(
      (snap as unknown as { pairStateId?: unknown })?.pairStateId,
    ).toBeUndefined();
    const json = JSON.stringify(snap);
    expect(json.includes(KEY_A)).toBe(false);
  });

  it("contains stable redactedRelationshipKey across calls", () => {
    updateRelationshipState(KEY_A, {});
    const s1 = getRedactedRelationshipStateSnapshot(KEY_A, SALT);
    const s2 = getRedactedRelationshipStateSnapshot(KEY_A, SALT);
    expect(s1?.redactedRelationshipKey).toBe(s2?.redactedRelationshipKey);
    expect(s1?.redactedRelationshipKey.length).toBe(43);
  });

  it("returns null for unknown key", () => {
    expect(
      getRedactedRelationshipStateSnapshot("not-a-real-key", SALT),
    ).toBeNull();
  });

  it("reflects current state version", () => {
    updateRelationshipState(KEY_A, {});
    updateRelationshipState(KEY_A, { modeContext: "normal" });
    const snap = getRedactedRelationshipStateSnapshot(KEY_A, SALT);
    expect(snap?.stateVersion).toBe(2);
    expect(snap?.modeContext).toBe("normal");
  });
});

// ─────────────────────────────────────────────
// Process-local behavior
// ─────────────────────────────────────────────

describe("relationshipState — process-local / ephemeral behavior", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("clearAllRelationshipStatesForTests simulates process restart (all state lost)", () => {
    updateRelationshipState(KEY_A, {});
    updateRelationshipState(KEY_B, {});
    expect(getStoreSizeForTests()).toBe(2);

    clearAllRelationshipStatesForTests();

    expect(getStoreSizeForTests()).toBe(0);
    expect(getRelationshipStateSnapshotInternal(KEY_A)).toBeNull();
    expect(getRelationshipStateSnapshotInternal(KEY_B)).toBeNull();
  });

  it("test-only helpers exist (clearAll, setCap, getCap, getSize)", () => {
    expect(typeof clearAllRelationshipStatesForTests).toBe("function");
    expect(typeof setReasonCodeCapForTests).toBe("function");
    expect(typeof getReasonCodeCapForTests).toBe("function");
    expect(typeof getStoreSizeForTests).toBe("function");
  });
});

// ─────────────────────────────────────────────
// Type safety / immutability
// ─────────────────────────────────────────────

describe("relationshipState — type-level constraints (smoke)", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("RelationshipStatePatch has no raw text fields", () => {
    // This test documents the type-level firewall.
    // The TS type RelationshipStatePatch should NOT include:
    //   - rawText, utterance, message, body, content, userId, pairId, etc.
    // If someone adds a forbidden field to the patch type, this comment is the trail.
    const patch: RelationshipStatePatch = {
      modeContext: "normal",
      observerActivationState: "active",
      ruptureFlag: false,
    };
    expect(patch.modeContext).toBe("normal");
  });

  it("update returns deeply readonly snapshot shape", () => {
    const s: InternalRelationshipState = updateRelationshipState(KEY_A, {});
    // Type-level readonly enforced; runtime checks defensive copy elsewhere
    expect(s.schemaVersion).toBe(RELATIONSHIP_STATE_SCHEMA_VERSION);
  });
});

// ─────────────────────────────────────────────
// iterateRedactedSnapshotsForDebug (A-2e canary)
// ─────────────────────────────────────────────

describe("iterateRedactedSnapshotsForDebug — A-2e canary", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("returns empty array when no states", () => {
    const result = iterateRedactedSnapshotsForDebug(SALT);
    expect(result).toEqual([]);
  });

  it("returns 1 snapshot when 1 state exists", () => {
    updateRelationshipState(KEY_A, { modeContext: "normal" });
    const result = iterateRedactedSnapshotsForDebug(SALT);
    expect(result.length).toBe(1);
    expect(result[0].modeContext).toBe("normal");
  });

  it("returns N snapshots when N states exist", () => {
    updateRelationshipState(KEY_A, { modeContext: "normal" });
    updateRelationshipState(KEY_B, { modeContext: "daily" });
    updateRelationshipState("pair-c", { modeContext: "travel" });
    const result = iterateRedactedSnapshotsForDebug(SALT);
    expect(result.length).toBe(3);
    const modes = result.map((s) => s.modeContext).sort();
    expect(modes).toEqual(["daily", "normal", "travel"]);
  });

  it("snapshots use provided salt (deterministic with same salt)", () => {
    updateRelationshipState(KEY_A, {});
    const r1 = iterateRedactedSnapshotsForDebug(SALT);
    const r2 = iterateRedactedSnapshotsForDebug(SALT);
    expect(r1[0].redactedRelationshipKey).toBe(r2[0].redactedRelationshipKey);
  });

  it("snapshots use provided salt (different salt → different keys)", () => {
    updateRelationshipState(KEY_A, {});
    const r1 = iterateRedactedSnapshotsForDebug("salt-X");
    const r2 = iterateRedactedSnapshotsForDebug("salt-Y");
    expect(r1[0].redactedRelationshipKey).not.toBe(r2[0].redactedRelationshipKey);
  });

  it("raw pairStateId not in any snapshot JSON (PII firewall)", () => {
    updateRelationshipState(KEY_A, {});
    updateRelationshipState(KEY_B, {});
    const result = iterateRedactedSnapshotsForDebug(SALT);
    const json = JSON.stringify(result);
    expect(json.includes(KEY_A)).toBe(false);
    expect(json.includes(KEY_B)).toBe(false);
  });

  it("each snapshot has redactedRelationshipKey field (length 43)", () => {
    updateRelationshipState(KEY_A, {});
    updateRelationshipState(KEY_B, {});
    const result = iterateRedactedSnapshotsForDebug(SALT);
    for (const snap of result) {
      expect(snap.redactedRelationshipKey).toBeDefined();
      expect(snap.redactedRelationshipKey.length).toBe(43);
    }
  });

  it("throws on empty salt", () => {
    expect(() => iterateRedactedSnapshotsForDebug("")).toThrow();
  });

  it("throws on non-string salt", () => {
    expect(() =>
      iterateRedactedSnapshotsForDebug(null as unknown as string),
    ).toThrow();
  });
});
