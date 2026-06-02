import { describe, it, expect } from "vitest";
import {
  invertOp,
  invertChangeSet,
  affectedItemIds,
  isBulk,
  changeSetRequiresConfirmation,
  makeUndoEntry,
  isUndoable,
  DEFAULT_MIN_UNDO_WINDOW_MIN,
  type ChangeOp,
  type ChangeSet,
  type PlanItemSnapshot,
} from "@/lib/plan/reality/change-set";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";

function snap(itemId: string, p: Partial<PlanItemSnapshot> = {}): PlanItemSnapshot {
  return { itemId, startMin: 540, endMin: 600, title: itemId, ...p };
}

function gov(p: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return {
    origin: "alter_generated",
    authority: "proposed",
    flexibility: "movable",
    protectionReasons: ["tentative"],
    ...p,
  };
}

const cs = (id: string, ops: ChangeOp[], reason = "test"): ChangeSet => ({
  id,
  ops,
  reason,
  sourceTraces: [{ kind: "seed", reason, confidence: 0.8 }],
});

describe("reality/change-set — invertOp (atomic undo core)", () => {
  it("add ↔ remove", () => {
    const add: ChangeOp = { kind: "add", itemId: "x", after: snap("x") };
    expect(invertOp(add)).toEqual({ kind: "remove", itemId: "x", before: snap("x") });
    const remove: ChangeOp = { kind: "remove", itemId: "y", before: snap("y") };
    expect(invertOp(remove)).toEqual({ kind: "add", itemId: "y", after: snap("y") });
  });

  it("update swaps before/after", () => {
    const op: ChangeOp = {
      kind: "update",
      itemId: "z",
      before: snap("z", { startMin: 540 }),
      after: snap("z", { startMin: 600 }),
    };
    const inv = invertOp(op);
    expect(inv).toEqual({ kind: "update", itemId: "z", before: snap("z", { startMin: 600 }), after: snap("z", { startMin: 540 }) });
  });

  it("invertOp is an involution (op == invert∘invert)", () => {
    const ops: ChangeOp[] = [
      { kind: "add", itemId: "a", after: snap("a") },
      { kind: "remove", itemId: "b", before: snap("b") },
      { kind: "update", itemId: "c", before: snap("c", { startMin: 1 }), after: snap("c", { startMin: 2 }) },
    ];
    for (const op of ops) expect(invertOp(invertOp(op))).toEqual(op);
  });
});

describe("reality/change-set — invertChangeSet (bulk atomic undo)", () => {
  it("reverses op order and inverts each", () => {
    const set = cs("set1", [
      { kind: "add", itemId: "a", after: snap("a") },
      { kind: "update", itemId: "b", before: snap("b", { startMin: 1 }), after: snap("b", { startMin: 2 }) },
    ]);
    const inv = invertChangeSet(set);
    expect(inv.id).toBe("set1:undo");
    expect(inv.ops[0]).toEqual({ kind: "update", itemId: "b", before: snap("b", { startMin: 2 }), after: snap("b", { startMin: 1 }) });
    expect(inv.ops[1]).toEqual({ kind: "remove", itemId: "a", before: snap("a") });
    expect(inv.sourceTraces[0].kind).toBe("change_set");
  });

  it("double-invert restores original ops (round-trip)", () => {
    const set = cs("s", [
      { kind: "add", itemId: "a", after: snap("a") },
      { kind: "remove", itemId: "b", before: snap("b") },
    ]);
    expect(invertChangeSet(invertChangeSet(set)).ops).toEqual(set.ops);
  });
});

describe("reality/change-set — affected / bulk", () => {
  it("affectedItemIds dedupes", () => {
    const set = cs("s", [
      { kind: "add", itemId: "a", after: snap("a") },
      { kind: "update", itemId: "a", before: snap("a"), after: snap("a", { startMin: 700 }) },
      { kind: "add", itemId: "b", after: snap("b") },
    ]);
    expect(affectedItemIds(set).sort()).toEqual(["a", "b"]);
  });

  it("isBulk true for multiple ops", () => {
    expect(isBulk(cs("s", [{ kind: "add", itemId: "a", after: snap("a") }]))).toBe(false);
    expect(isBulk(cs("s", [
      { kind: "add", itemId: "a", after: snap("a") },
      { kind: "add", itemId: "b", after: snap("b") },
    ]))).toBe(true);
  });
});

describe("reality/change-set — permission boundary (INV-5)", () => {
  it("touching hard_external requires confirmation", () => {
    const set = cs("s", [
      { kind: "update", itemId: "m", before: snap("m", { governance: gov({ protectionReasons: ["hard_external"] }) }), after: snap("m", { governance: gov({ protectionReasons: ["hard_external"] }) }) },
    ]);
    expect(changeSetRequiresConfirmation(set)).toBe(true);
  });

  it("removing an import_locked item requires confirmation", () => {
    const set = cs("s", [{ kind: "remove", itemId: "i", before: snap("i", { governance: gov({ authority: "import_locked" }) }) }]);
    expect(changeSetRequiresConfirmation(set)).toBe(true);
  });

  it("plain movable proposal does not require confirmation", () => {
    const set = cs("s", [{ kind: "add", itemId: "a", after: snap("a", { governance: gov({ flexibility: "movable" }) }) }]);
    expect(changeSetRequiresConfirmation(set)).toBe(false);
  });

  it("ops without governance default to no-confirmation (unknown ⇒ not blocked here)", () => {
    const set = cs("s", [{ kind: "add", itemId: "a", after: snap("a") }]);
    expect(changeSetRequiresConfirmation(set)).toBe(false);
  });
});

describe("reality/change-set — Undo window (INV-24: 5min min, bulk session)", () => {
  it("single change → 5min minimum, not session-restorable", () => {
    const set = cs("s", [{ kind: "add", itemId: "a", after: snap("a") }]);
    const entry = makeUndoEntry(set, 100);
    expect(entry.undoableUntilMin).toBe(100 + DEFAULT_MIN_UNDO_WINDOW_MIN);
    expect(entry.sessionRestorable).toBe(false);
    expect(isUndoable(entry, 104)).toBe(true);
    expect(isUndoable(entry, 106)).toBe(false);
  });

  it("bulk Daily Plan → session window + sessionRestorable", () => {
    const set = cs("day", [
      { kind: "add", itemId: "a", after: snap("a") },
      { kind: "add", itemId: "b", after: snap("b") },
      { kind: "add", itemId: "c", after: snap("c") },
    ]);
    const entry = makeUndoEntry(set, 100);
    expect(entry.sessionRestorable).toBe(true);
    expect(entry.undoableUntilMin).toBeGreaterThan(100 + DEFAULT_MIN_UNDO_WINDOW_MIN);
    expect(isUndoable(entry, 100 + 600)).toBe(true); // still undoable hours later
  });

  it("entry carries the inverted (undo) change-set ready to apply", () => {
    const set = cs("s", [{ kind: "add", itemId: "a", after: snap("a") }]);
    const entry = makeUndoEntry(set, 0);
    expect(entry.inverted.ops[0].kind).toBe("remove");
  });
});
