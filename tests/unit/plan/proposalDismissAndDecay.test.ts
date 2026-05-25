/**
 * Phase 3-J-3: Dismiss action + Half-Life Decay + 7 day memory integration
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-3 / §10.1 Smoke 6, 9 / §10.6 Smoke 51-52
 *
 * 検証対象:
 *   - halfLifeDecay: applyDecay (= confidence × 0.85^N) + resetOnAccept + isInLongSilence
 *   - dismissAction: in-memory storage + read/write round-trip
 *   - 7 day memory integration (= dismissLog.filterRecentDismisses との連携)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 13 Half-life decay
 *   - Invariant 14 Cross-day memory (= 7 日 retention)
 *   - Invariant 32 Minimal Memory (= storage 限定、 cross-device 同期なし)
 *   - Invariant 39 No Penalty for Ignore (= dismiss 失敗時 silent)
 */

import { describe, it, expect } from "vitest";

import {
  DECAY_FACTOR,
  SILENT_CONSECUTIVE_DISMISS_THRESHOLD,
  SILENT_PERIOD_DAYS,
  applyDecay,
  isInLongSilence,
  resetConfidenceOnAccept,
} from "@/lib/plan/proposal/halfLifeDecay";
import {
  DISMISS_STORAGE_KEY,
  buildDismissLogEntry,
  createInMemoryDismissStorage,
  createStorageBackedDismissLogReader,
  readDismissesFromStorage,
  recordDismissToStorage,
} from "@/lib/plan/proposal/dismissAction";
import {
  filterRecentDismisses,
  wasRecentlyDismissed,
} from "@/lib/plan/proposal/dismissLog";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildProposal(id: string, reason: ProposedAnchor["reason"] = "pattern_repeat"): ProposedAnchor {
  return {
    id,
    reason,
    direction: "continue_pattern",
    confidence: "medium",
    draft: { title: "test" },
    source: {
      signalType: reason,
      evidenceCount: 3,
      generatedAt: "2026-05-21T00:00:00.000Z",
    },
    createdAt: "2026-05-21T00:00:00.000Z",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// halfLifeDecay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("halfLifeDecay constants", () => {
  it("DECAY_FACTOR = 0.85", () => {
    expect(DECAY_FACTOR).toBe(0.85);
  });

  it("SILENT_PERIOD_DAYS = 30", () => {
    expect(SILENT_PERIOD_DAYS).toBe(30);
  });

  it("SILENT_CONSECUTIVE_DISMISS_THRESHOLD = 3", () => {
    expect(SILENT_CONSECUTIVE_DISMISS_THRESHOLD).toBe(3);
  });
});

describe("applyDecay", () => {
  it("displayCount = 0 → no decay", () => {
    expect(applyDecay(1, 0)).toBe(1);
    expect(applyDecay(0.5, 0)).toBe(0.5);
  });

  it("displayCount = 1 → × 0.85", () => {
    expect(applyDecay(1, 1)).toBeCloseTo(0.85);
  });

  it("displayCount = 2 → × 0.7225", () => {
    expect(applyDecay(1, 2)).toBeCloseTo(0.7225);
  });

  it("displayCount = 5 → × ~0.444", () => {
    expect(applyDecay(1, 5)).toBeCloseTo(0.4437, 3);
  });

  it("negative displayCount → no decay (= defensive)", () => {
    expect(applyDecay(0.8, -1)).toBe(0.8);
  });
});

describe("resetConfidenceOnAccept", () => {
  it("returns 1", () => {
    expect(resetConfidenceOnAccept()).toBe(1);
  });
});

describe("isInLongSilence", () => {
  it("count < 3 → false", () => {
    expect(
      isInLongSilence(2, "2026-05-15T00:00:00.000Z", "2026-05-21T12:00:00.000Z"),
    ).toBe(false);
  });

  it("count >= 3 + within 30 days → true", () => {
    expect(
      isInLongSilence(3, "2026-05-15T00:00:00.000Z", "2026-05-21T12:00:00.000Z"),
    ).toBe(true);
  });

  it("count >= 3 but > 30 days ago → false (= silent 解除)", () => {
    expect(
      isInLongSilence(5, "2026-04-01T00:00:00.000Z", "2026-05-21T12:00:00.000Z"),
    ).toBe(false);
  });

  it("invalid ISO → false (= defensive)", () => {
    expect(isInLongSilence(5, "not-a-date", "2026-05-21T12:00:00.000Z")).toBe(false);
  });

  it("future lastDismissAt → false (= defensive)", () => {
    expect(
      isInLongSilence(5, "2026-06-01T00:00:00.000Z", "2026-05-21T12:00:00.000Z"),
    ).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dismissAction: pure builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDismissLogEntry", () => {
  it("constructs entry from proposal + timestamp", () => {
    const proposal = buildProposal("proposal_abc");
    const entry = buildDismissLogEntry({
      proposal,
      dismissedAt: "2026-05-21T12:00:00.000Z",
    });
    expect(entry).toEqual({
      proposalId: "proposal_abc",
      reason: "pattern_repeat",
      dismissedAt: "2026-05-21T12:00:00.000Z",
    });
  });

  it("preserves proposal.reason as entry.reason", () => {
    const proposal = buildProposal("p1", "lived_geography_centroid");
    const entry = buildDismissLogEntry({
      proposal,
      dismissedAt: "2026-05-21T00:00:00.000Z",
    });
    expect(entry.reason).toBe("lived_geography_centroid");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dismissAction: storage round-trip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("recordDismissToStorage + readDismissesFromStorage round-trip", () => {
  it("empty storage → []", () => {
    const storage = createInMemoryDismissStorage();
    expect(readDismissesFromStorage(storage)).toEqual([]);
  });

  it("write then read returns entries", () => {
    const storage = createInMemoryDismissStorage();
    const proposal = buildProposal("p1");
    recordDismissToStorage(storage, {
      proposal,
      dismissedAt: "2026-05-21T12:00:00.000Z",
    });
    const result = readDismissesFromStorage(storage);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      proposalId: "p1",
      reason: "pattern_repeat",
      dismissedAt: "2026-05-21T12:00:00.000Z",
    });
  });

  it("multiple writes append", () => {
    const storage = createInMemoryDismissStorage();
    recordDismissToStorage(storage, {
      proposal: buildProposal("p1"),
      dismissedAt: "2026-05-21T10:00:00.000Z",
    });
    recordDismissToStorage(storage, {
      proposal: buildProposal("p2"),
      dismissedAt: "2026-05-21T11:00:00.000Z",
    });
    const result = readDismissesFromStorage(storage);
    expect(result.map((e) => e.proposalId)).toEqual(["p1", "p2"]);
  });

  it("null storage → silent (= no throw)", () => {
    expect(() =>
      recordDismissToStorage(null, {
        proposal: buildProposal("p1"),
        dismissedAt: "2026-05-21T10:00:00.000Z",
      }),
    ).not.toThrow();
    expect(readDismissesFromStorage(null)).toEqual([]);
  });

  it("malformed storage → empty array (= defensive)", () => {
    const storage = createInMemoryDismissStorage("not-json{");
    expect(readDismissesFromStorage(storage)).toEqual([]);
  });

  it("non-array JSON in storage → empty array", () => {
    const storage = createInMemoryDismissStorage('{"not": "array"}');
    expect(readDismissesFromStorage(storage)).toEqual([]);
  });

  it("array with invalid entries → filters out invalid", () => {
    const valid = {
      proposalId: "p1",
      reason: "pattern_repeat",
      dismissedAt: "2026-05-21T00:00:00.000Z",
    };
    const storage = createInMemoryDismissStorage(
      JSON.stringify([valid, { invalid: true }, null, "bad"]),
    );
    const result = readDismissesFromStorage(storage);
    expect(result).toHaveLength(1);
    expect(result[0]!.proposalId).toBe("p1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// createStorageBackedDismissLogReader (= DismissLogReader 統合)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createStorageBackedDismissLogReader", () => {
  it("reads via storage", () => {
    const storage = createInMemoryDismissStorage();
    const proposal = buildProposal("p1");
    recordDismissToStorage(storage, {
      proposal,
      dismissedAt: "2026-05-21T00:00:00.000Z",
    });
    const reader = createStorageBackedDismissLogReader(storage);
    expect(reader.readAll()).toHaveLength(1);
  });

  it("null storage → reader returns []", () => {
    const reader = createStorageBackedDismissLogReader(null);
    expect(reader.readAll()).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL: 7 day memory integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("J-3 ↔ J-1c (= dismissLog filter) integration: 7 日 memory", () => {
  it("write today, query tomorrow → still 'recently dismissed'", () => {
    const storage = createInMemoryDismissStorage();
    recordDismissToStorage(storage, {
      proposal: buildProposal("p1"),
      dismissedAt: "2026-05-21T12:00:00.000Z",
    });
    const reader = createStorageBackedDismissLogReader(storage);
    const tomorrow = "2026-05-22T12:00:00.000Z";
    expect(wasRecentlyDismissed(reader.readAll(), "p1", tomorrow)).toBe(true);
  });

  it("write 6 days ago → still recent", () => {
    const storage = createInMemoryDismissStorage();
    recordDismissToStorage(storage, {
      proposal: buildProposal("p1"),
      dismissedAt: "2026-05-15T12:00:00.000Z",
    });
    expect(
      wasRecentlyDismissed(
        readDismissesFromStorage(storage),
        "p1",
        "2026-05-21T12:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("write 8 days ago → NOT recent (= 7 日 retention 越え)", () => {
    const storage = createInMemoryDismissStorage();
    recordDismissToStorage(storage, {
      proposal: buildProposal("p1"),
      dismissedAt: "2026-05-13T12:00:00.000Z",
    });
    expect(
      wasRecentlyDismissed(
        readDismissesFromStorage(storage),
        "p1",
        "2026-05-21T12:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("filterRecentDismisses keeps only 7-day window entries", () => {
    const storage = createInMemoryDismissStorage();
    recordDismissToStorage(storage, {
      proposal: buildProposal("recent"),
      dismissedAt: "2026-05-19T00:00:00.000Z",
    });
    recordDismissToStorage(storage, {
      proposal: buildProposal("old"),
      dismissedAt: "2026-05-10T00:00:00.000Z",
    });
    const filtered = filterRecentDismisses(
      readDismissesFromStorage(storage),
      "2026-05-21T12:00:00.000Z",
    );
    expect(filtered.map((e) => e.proposalId)).toEqual(["recent"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants exported sanity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DISMISS_STORAGE_KEY", () => {
  it("is versioned", () => {
    expect(DISMISS_STORAGE_KEY).toBe("aneurasync.plan.proposalDismiss.v1");
  });
});
