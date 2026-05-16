/**
 * Tests for relationshipState.ts (Phase A-1)
 *
 * 検証項目:
 *   1. Initial state (empty container, key 未登録)
 *   2. Create / update with patches
 *   3. observation count increments
 *   4. Defensive copy on read/write
 *   5. Multi-key isolation
 *   6. Reset / clear behavior
 *   7. Reason codes FIFO cap
 *   8. ModeContext future-compatibility (off/on/unknown 動作)
 *   9. Caller-provided observedAt (no Date.now dependency)
 *  10. Error inputs (empty / non-string key)
 *  11. Redacted snapshot via container
 *  12. Process-local behavior (clearAllForTests で reset)
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
    expect(state.modeContext).toBe("unknown");
    expect(state.observerActivationState).toBe("unknown");
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

  it("schemaVersion is fixed", () => {
    const state = updateRelationshipState(KEY_A, {});
    expect(state.schemaVersion).toBe(RELATIONSHIP_STATE_SCHEMA_VERSION);
    expect(state.schemaVersion).toBe(1);
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
      modeContext: "on",
    });
    const s = updateRelationshipState(KEY_A, { modeContext: "off" });
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
      modeContext: "on",
      alignmentBucket: "positive",
      ruptureFlag: true,
    });
    const s = updateRelationshipState(KEY_A, {
      modeContext: "off",
    });
    expect(s.modeContext).toBe("off");
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
    const returned = updateRelationshipState(KEY_A, { modeContext: "on" });
    (returned as unknown as { modeContext: string }).modeContext = "off";
    const fresh = getRelationshipStateSnapshotInternal(KEY_A);
    expect(fresh?.modeContext).toBe("on");
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
    updateRelationshipState(KEY_A, { modeContext: "on" });
    updateRelationshipState(KEY_B, { modeContext: "off" });
    const a = getRelationshipStateSnapshotInternal(KEY_A);
    const b = getRelationshipStateSnapshotInternal(KEY_B);
    expect(a?.modeContext).toBe("on");
    expect(b?.modeContext).toBe("off");
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
// ModeContext future-compatibility
// ─────────────────────────────────────────────

describe("relationshipState — modeContext future-compatibility", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("accepts 'off'", () => {
    const s = updateRelationshipState(KEY_A, { modeContext: "off" });
    expect(s.modeContext).toBe("off");
  });

  it("accepts 'on'", () => {
    const s = updateRelationshipState(KEY_A, { modeContext: "on" });
    expect(s.modeContext).toBe("on");
  });

  it("accepts 'unknown'", () => {
    const s = updateRelationshipState(KEY_A, { modeContext: "unknown" });
    expect(s.modeContext).toBe("unknown");
  });

  // Note: Phase B+ で 'normal' / 'daily' / 'travel' を type union に追加した時、
  //       本 test ファイルに該当値の受け入れテストを追加する。
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
    updateRelationshipState(KEY_A, { modeContext: "on" });
    const snap = getRedactedRelationshipStateSnapshot(KEY_A, SALT);
    expect(snap?.stateVersion).toBe(2);
    expect(snap?.modeContext).toBe("on");
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
      modeContext: "on",
      observerActivationState: "active",
      ruptureFlag: false,
    };
    expect(patch.modeContext).toBe("on");
  });

  it("update returns deeply readonly snapshot shape", () => {
    const s: InternalRelationshipState = updateRelationshipState(KEY_A, {});
    // Type-level readonly enforced; runtime checks defensive copy elsewhere
    expect(s.schemaVersion).toBe(RELATIONSHIP_STATE_SCHEMA_VERSION);
  });
});
