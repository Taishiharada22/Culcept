/**
 * Phase 3-J-4: Accept Proposal + Quiet Undo Window unit tests
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-4 / §10.1 Smoke 4 / §10.5 Smoke 50
 *
 * 検証対象:
 *   - acceptProposal: notes prefix helpers + buildAcceptBundleInput + acceptProposal action (mock)
 *   - quietUndoWindow: storage round-trip + active window check + undo action (mock)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 10 データ汚染禁止 (= ProposedAnchor を mutate しない)
 *   - Invariant 32 Minimal Memory (= storage 限定)
 *   - Invariant 37 Proposal Integrity Contract (= compliance assertion 再検査)
 *   - Invariant 39 No Penalty for Ignore (= silent fallback)
 *   - Idea 28 Quiet Undo Window (= 5 分撤回)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as anchorFetch from "@/lib/plan/anchor-fetch";
import type {
  CreateAnchorBundleResult,
  DeleteAnchorSourceResult,
} from "@/lib/plan/anchor-fetch";
import {
  PROPOSAL_NOTES_PREFIX,
  acceptProposal,
  buildAcceptBundleInput,
  buildProposalNotes,
  extractProposalIdFromNotes,
  isProposalNotes,
} from "@/lib/plan/proposal/acceptProposal";
import { createInMemoryDismissStorage } from "@/lib/plan/proposal/dismissAction";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";
import {
  UNDO_STORAGE_KEY,
  UNDO_WINDOW_MS,
  buildUndoRecord,
  filterActiveUndos,
  findActiveUndoForProposal,
  isUndoWindowActive,
  readUndoRecords,
  recordUndoToStorage,
  removeUndoFromStorage,
  undoProposalAccept,
  type UndoRecord,
} from "@/lib/plan/proposal/quietUndoWindow";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildProposal(id = "proposal_abc"): ProposedAnchor {
  return {
    id,
    reason: "pattern_repeat",
    direction: "continue_pattern",
    confidence: "medium",
    draft: { title: "カフェ", startTime: "14:00" },
    source: {
      signalType: "pattern_repeat",
      evidenceCount: 3,
      generatedAt: "2026-05-21T00:00:00.000Z",
    },
    createdAt: "2026-05-21T00:00:00.000Z",
  };
}

function buildAnchorInput(): CreateExternalAnchorInput {
  return {
    title: "カフェ",
    startTime: "14:00",
    rigidity: "soft",
    sourceType: "manual",
    anchorKind: "one_off",
    date: "2026-05-22",
  } as CreateExternalAnchorInput;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// acceptProposal: notes prefix
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROPOSAL_NOTES_PREFIX + helpers", () => {
  it("prefix is the literal trace string", () => {
    expect(PROPOSAL_NOTES_PREFIX).toBe("alter-proposal:");
  });

  it("buildProposalNotes constructs prefixed string", () => {
    expect(buildProposalNotes("proposal_xyz")).toBe("alter-proposal:proposal_xyz");
  });

  it("isProposalNotes detects prefix", () => {
    expect(isProposalNotes("alter-proposal:proposal_abc")).toBe(true);
    expect(isProposalNotes("alter-proposal:")).toBe(true);
    expect(isProposalNotes("manual notes")).toBe(false);
    expect(isProposalNotes("")).toBe(false);
    expect(isProposalNotes(undefined)).toBe(false);
  });

  it("extractProposalIdFromNotes returns id portion", () => {
    expect(extractProposalIdFromNotes("alter-proposal:proposal_xyz")).toBe("proposal_xyz");
    expect(extractProposalIdFromNotes("alter-proposal:")).toBe("");
    expect(extractProposalIdFromNotes("manual notes")).toBeNull();
    expect(extractProposalIdFromNotes(undefined)).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildAcceptBundleInput
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAcceptBundleInput", () => {
  it("returns CreateSourceWithAnchorsInput with manual sourceType + trace notes", () => {
    const proposal = buildProposal("proposal_xyz");
    const anchor = buildAnchorInput();
    const bundle = buildAcceptBundleInput(proposal, anchor);
    expect(bundle.source.sourceType).toBe("manual");
    expect(bundle.source.notes).toBe("alter-proposal:proposal_xyz");
    expect(bundle.source.rawRetention).toBe("discarded");
    expect(bundle.anchors).toEqual([anchor]);
  });

  it("does not mutate input proposal", () => {
    const proposal = buildProposal();
    const frozen = JSON.stringify(proposal);
    buildAcceptBundleInput(proposal, buildAnchorInput());
    expect(JSON.stringify(proposal)).toBe(frozen);
  });

  it("compliance assertion throws when contract violated (= 0 evidence)", () => {
    const bad = buildProposal();
    const bad2: ProposedAnchor = {
      ...bad,
      source: { ...bad.source, evidenceCount: 0 },
    };
    expect(() => buildAcceptBundleInput(bad2, buildAnchorInput())).toThrow(
      /sourceEvidenceRequired/,
    );
  });

  it("compliance assertion throws when sensitive included in draft", () => {
    const bad = buildProposal();
    const bad2: ProposedAnchor = {
      ...bad,
      draft: { ...bad.draft, sensitiveCategory: "medical" },
    };
    expect(() => buildAcceptBundleInput(bad2, buildAnchorInput())).toThrow(
      /sensitiveExcluded/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// acceptProposal action (= API mocked)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("acceptProposal action", () => {
  let createSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createSpy = vi.spyOn(anchorFetch, "createAnchorBundle");
  });

  afterEach(() => {
    createSpy.mockRestore();
  });

  it("calls createAnchorBundle with built bundle on success", async () => {
    const success: CreateAnchorBundleResult = {
      ok: true,
      data: {
        source: { id: "src_1" } as never,
        anchors: [{ id: "anc_1" } as never],
      },
    };
    createSpy.mockResolvedValueOnce(success);

    const proposal = buildProposal("proposal_xyz");
    const anchor = buildAnchorInput();
    const result = await acceptProposal(proposal, anchor);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0]![0];
    expect((arg as { source: { sourceType: string; notes: string } }).source).toMatchObject({
      sourceType: "manual",
      notes: "alter-proposal:proposal_xyz",
    });
    expect(result.ok).toBe(true);
  });

  it("propagates failure result from createAnchorBundle", async () => {
    const failure: CreateAnchorBundleResult = {
      ok: false,
      status: 422,
      error: "validation",
    };
    createSpy.mockResolvedValueOnce(failure);

    const result = await acceptProposal(buildProposal(), buildAnchorInput());
    expect(result.ok).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// quietUndoWindow: constants + builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("quietUndoWindow constants", () => {
  it("UNDO_STORAGE_KEY is versioned", () => {
    expect(UNDO_STORAGE_KEY).toBe("aneurasync.plan.proposalUndo.v1");
  });

  it("UNDO_WINDOW_MS = 5 minutes", () => {
    expect(UNDO_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe("buildUndoRecord", () => {
  it("constructs immutable record", () => {
    const record = buildUndoRecord({
      proposalId: "proposal_a",
      anchorSourceId: "src_a",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    });
    expect(record).toEqual({
      proposalId: "proposal_a",
      anchorSourceId: "src_a",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isUndoWindowActive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isUndoWindowActive", () => {
  const record: UndoRecord = {
    proposalId: "p1",
    anchorSourceId: "src1",
    acceptedAt: "2026-05-21T12:00:00.000Z",
  };

  it("0 sec elapsed → active", () => {
    expect(isUndoWindowActive(record, "2026-05-21T12:00:00.000Z")).toBe(true);
  });

  it("3 min elapsed → active", () => {
    expect(isUndoWindowActive(record, "2026-05-21T12:03:00.000Z")).toBe(true);
  });

  it("5 min elapsed exactly → active (inclusive)", () => {
    expect(isUndoWindowActive(record, "2026-05-21T12:05:00.000Z")).toBe(true);
  });

  it("5 min 1 sec elapsed → not active", () => {
    expect(isUndoWindowActive(record, "2026-05-21T12:05:01.000Z")).toBe(false);
  });

  it("future now (= negative elapsed) → not active (= defensive)", () => {
    expect(isUndoWindowActive(record, "2026-05-21T11:59:00.000Z")).toBe(false);
  });

  it("invalid ISO → not active", () => {
    expect(isUndoWindowActive(record, "not-a-date")).toBe(false);
    expect(
      isUndoWindowActive({ ...record, acceptedAt: "invalid" }, "2026-05-21T12:00:00.000Z"),
    ).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage round-trip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readUndoRecords / recordUndoToStorage round-trip", () => {
  it("empty storage → []", () => {
    expect(readUndoRecords(createInMemoryDismissStorage())).toEqual([]);
  });

  it("write then read", () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));
    const result = readUndoRecords(storage);
    expect(result).toHaveLength(1);
    expect(result[0]!.proposalId).toBe("p1");
  });

  it("null storage → silent", () => {
    expect(() => recordUndoToStorage(null, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }))).not.toThrow();
    expect(readUndoRecords(null)).toEqual([]);
  });

  it("malformed storage → []", () => {
    const storage = createInMemoryDismissStorage("not-json{");
    expect(readUndoRecords(storage)).toEqual([]);
  });

  it("non-array JSON → []", () => {
    const storage = createInMemoryDismissStorage('{"x":1}');
    expect(readUndoRecords(storage)).toEqual([]);
  });

  it("filters invalid records", () => {
    const valid = {
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T00:00:00.000Z",
    };
    const storage = createInMemoryDismissStorage(JSON.stringify([valid, { invalid: true }, null]));
    expect(readUndoRecords(storage)).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// removeUndoFromStorage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("removeUndoFromStorage", () => {
  it("removes record by proposalId", () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T00:00:00.000Z",
    }));
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p2",
      anchorSourceId: "src2",
      acceptedAt: "2026-05-21T00:00:00.000Z",
    }));
    removeUndoFromStorage(storage, "p1");
    const remaining = readUndoRecords(storage);
    expect(remaining.map((r) => r.proposalId)).toEqual(["p2"]);
  });

  it("null storage → silent", () => {
    expect(() => removeUndoFromStorage(null, "p1")).not.toThrow();
  });

  it("removing non-existent proposalId → no-op", () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T00:00:00.000Z",
    }));
    removeUndoFromStorage(storage, "p_nonexistent");
    expect(readUndoRecords(storage)).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// findActiveUndoForProposal / filterActiveUndos
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("findActiveUndoForProposal", () => {
  it("returns active record within 5 min", () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));
    const found = findActiveUndoForProposal(storage, "p1", "2026-05-21T12:03:00.000Z");
    expect(found?.proposalId).toBe("p1");
  });

  it("returns null after 5 min", () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));
    const found = findActiveUndoForProposal(storage, "p1", "2026-05-21T12:10:00.000Z");
    expect(found).toBeNull();
  });

  it("returns null for unknown proposalId", () => {
    const storage = createInMemoryDismissStorage();
    expect(findActiveUndoForProposal(storage, "p_unknown", "2026-05-21T12:00:00.000Z")).toBeNull();
  });
});

describe("filterActiveUndos", () => {
  it("includes only active records", () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "active",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "old",
      anchorSourceId: "src2",
      acceptedAt: "2026-05-21T11:00:00.000Z",
    }));
    const active = filterActiveUndos(storage, "2026-05-21T12:03:00.000Z");
    expect(active.map((r) => r.proposalId)).toEqual(["active"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// undoProposalAccept (= API mocked)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("undoProposalAccept action", () => {
  let deleteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    deleteSpy = vi.spyOn(anchorFetch, "deleteAnchorSource");
  });

  afterEach(() => {
    deleteSpy.mockRestore();
  });

  it("no active record → no_active_undo", async () => {
    const storage = createInMemoryDismissStorage();
    const result = await undoProposalAccept(storage, "p_unknown", "2026-05-21T12:00:00.000Z");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_active_undo");
    }
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("active record + delete success → ok:true + record removed", async () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));
    deleteSpy.mockResolvedValueOnce({
      ok: true,
      data: { deletedSource: true, deletedAnchors: 1 },
    } as DeleteAnchorSourceResult);

    const result = await undoProposalAccept(storage, "p1", "2026-05-21T12:03:00.000Z");
    expect(result.ok).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith("src1");
    expect(readUndoRecords(storage)).toEqual([]);
  });

  it("active record + delete fail → ok:false + record preserved", async () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));
    deleteSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "server error",
    } as DeleteAnchorSourceResult);

    const result = await undoProposalAccept(storage, "p1", "2026-05-21T12:03:00.000Z");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("delete_failed");
    }
    expect(readUndoRecords(storage)).toHaveLength(1);
  });

  it("expired record → no_active_undo, no delete call", async () => {
    const storage = createInMemoryDismissStorage();
    recordUndoToStorage(storage, buildUndoRecord({
      proposalId: "p1",
      anchorSourceId: "src1",
      acceptedAt: "2026-05-21T12:00:00.000Z",
    }));

    const result = await undoProposalAccept(storage, "p1", "2026-05-21T12:10:00.000Z");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_active_undo");
    }
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
