import { describe, it, expect } from "vitest";

import type {
  AlterConfirmationAction,
  AlterConfirmationMeta,
  AlterConfirmationState,
} from "@/lib/plan/alter-confirmation";
import {
  canTransition,
  createInitialState,
  isTerminal,
  transition,
} from "@/lib/plan/alter-confirmation-state";

const META: AlterConfirmationMeta = {
  source: "draft",
  confidence: 0.8,
  reason: "test fixture",
  requiresUserApproval: true,
};

const FIXED_NOW = "2026-04-30T12:00:00.000Z";
const FIXED_LATER = "2026-05-01T00:00:00.000Z";

const ALL_ACTIONS: ReadonlyArray<AlterConfirmationAction> = [
  "accept",
  "edit",
  "reject",
  "snooze",
];
const NON_ACCEPT_ACTIONS: ReadonlyArray<AlterConfirmationAction> = [
  "edit",
  "reject",
  "snooze",
];
const ACTIVE_STATES: ReadonlyArray<AlterConfirmationState> = [
  "pending",
  "editing",
  "snoozed",
];
const TERMINAL_STATES: ReadonlyArray<AlterConfirmationState> = [
  "confirmed",
  "rejected",
];

describe("AlterConfirmation State Machine", () => {
  // ── createInitialState ──

  describe("createInitialState", () => {
    it("default は pending", () => {
      const s = createInitialState(META);
      expect(s.state).toBe("pending");
      expect(s.meta).toEqual(META);
    });

    it("editing を初期状態に指定できる", () => {
      const s = createInitialState(META, "editing");
      expect(s.state).toBe("editing");
      expect(s.meta).toEqual(META);
    });

    it.each(["confirmed", "rejected", "snoozed"] as AlterConfirmationState[])(
      "%s を初期状態にすると throw（action 経由でないと到達できない）",
      (s) => {
        expect(() => createInitialState(META, s)).toThrow();
      }
    );
  });

  // ── isTerminal ──

  describe("isTerminal", () => {
    it.each(TERMINAL_STATES)("%s は終端", (s) => {
      expect(isTerminal(s)).toBe(true);
    });

    it.each(ACTIVE_STATES)("%s は非終端", (s) => {
      expect(isTerminal(s)).toBe(false);
    });
  });

  // ── canTransition ──

  describe("canTransition", () => {
    it.each(ACTIVE_STATES)("%s から全 action 可能", (s) => {
      for (const a of ALL_ACTIONS) {
        expect(canTransition(s, a)).toBe(true);
      }
    });

    it.each(TERMINAL_STATES)("%s から全 action 不可", (s) => {
      for (const a of ALL_ACTIONS) {
        expect(canTransition(s, a)).toBe(false);
      }
    });
  });

  // ── transition: happy paths ──

  describe("transition — happy paths", () => {
    it("pending + accept → confirmed (decidedBy='accept')", () => {
      const s = transition(createInitialState(META), "accept", { now: FIXED_NOW });
      expect(s.state).toBe("confirmed");
      if (s.state === "confirmed") {
        expect(s.decidedBy).toBe("accept");
        expect(s.decidedAt).toBe(FIXED_NOW);
      }
    });

    it("pending + edit → editing (draft 反映)", () => {
      const s = transition(createInitialState(META), "edit", { draft: "draft-x" });
      expect(s.state).toBe("editing");
      if (s.state === "editing") {
        expect(s.draft).toBe("draft-x");
      }
    });

    it("pending + reject → rejected", () => {
      const s = transition(createInitialState(META), "reject", { now: FIXED_NOW });
      expect(s.state).toBe("rejected");
      if (s.state === "rejected") {
        expect(s.decidedBy).toBe("reject");
        expect(s.decidedAt).toBe(FIXED_NOW);
      }
    });

    it("pending + snooze → snoozed", () => {
      const s = transition(createInitialState(META), "snooze", { now: FIXED_NOW });
      expect(s.state).toBe("snoozed");
      if (s.state === "snoozed") {
        expect(s.decidedBy).toBe("snooze");
        expect(s.decidedAt).toBe(FIXED_NOW);
      }
    });

    it("editing + accept → confirmed (editing 中の draft を持ち越す)", () => {
      const editing = transition(createInitialState(META), "edit", {
        draft: { x: 1 },
      });
      const confirmed = transition(editing, "accept", { now: FIXED_NOW });
      expect(confirmed.state).toBe("confirmed");
      if (confirmed.state === "confirmed") {
        expect(confirmed.decidedBy).toBe("accept");
        expect(confirmed.draft).toEqual({ x: 1 });
      }
    });

    it("editing + edit → editing (idempotent、draft 更新)", () => {
      const e1 = transition(createInitialState(META), "edit", { draft: "a" });
      const e2 = transition(e1, "edit", { draft: "b" });
      expect(e2.state).toBe("editing");
      if (e2.state === "editing") {
        expect(e2.draft).toBe("b");
      }
    });

    it("editing + edit (draft 省略) → 既存 draft 保持", () => {
      const e1 = transition(createInitialState(META), "edit", { draft: "keep" });
      const e2 = transition(e1, "edit");
      expect(e2.state).toBe("editing");
      if (e2.state === "editing") {
        expect(e2.draft).toBe("keep");
      }
    });

    it("snoozed + accept → confirmed (時刻は新しい now)", () => {
      const snoozed = transition(createInitialState(META), "snooze", { now: FIXED_NOW });
      const confirmed = transition(snoozed, "accept", { now: FIXED_LATER });
      expect(confirmed.state).toBe("confirmed");
      if (confirmed.state === "confirmed") {
        expect(confirmed.decidedAt).toBe(FIXED_LATER);
      }
    });

    it("snoozed + snooze → snoozed (decidedAt 更新)", () => {
      const s1 = transition(createInitialState(META), "snooze", { now: FIXED_NOW });
      const s2 = transition(s1, "snooze", { now: FIXED_LATER });
      expect(s2.state).toBe("snoozed");
      if (s2.state === "snoozed") {
        expect(s2.decidedAt).toBe(FIXED_LATER);
      }
    });
  });

  // ── transition: terminal no-op ──

  describe("transition — terminal no-op (不変原則 2)", () => {
    it.each(ALL_ACTIONS)("confirmed + %s → 変化なし（参照同一）", (action) => {
      const confirmed = transition(createInitialState(META), "accept", {
        now: FIXED_NOW,
      });
      const next = transition(confirmed, action, { now: FIXED_LATER });
      expect(next).toBe(confirmed);
    });

    it.each(ALL_ACTIONS)("rejected + %s → 変化なし（参照同一）", (action) => {
      const rejected = transition(createInitialState(META), "reject", {
        now: FIXED_NOW,
      });
      const next = transition(rejected, action, { now: FIXED_LATER });
      expect(next).toBe(rejected);
    });
  });

  // ── 不変原則 1: confirmed への到達は accept のみ ──

  describe("不変原則 1 — confirmed への遷移は accept のみ（完全網羅）", () => {
    it.each(ACTIVE_STATES)(
      "%s から non-accept action では confirmed に到達しない",
      (startState) => {
        const start =
          startState === "pending"
            ? createInitialState(META)
            : startState === "editing"
              ? transition(createInitialState(META), "edit")
              : transition(createInitialState(META), "snooze", { now: FIXED_NOW });
        expect(start.state).toBe(startState);

        for (const action of NON_ACCEPT_ACTIONS) {
          const next = transition(start, action, { now: FIXED_NOW });
          expect(next.state).not.toBe("confirmed");
        }
      }
    );

    it("active state × accept でのみ confirmed 到達", () => {
      for (const startState of ACTIVE_STATES) {
        const start =
          startState === "pending"
            ? createInitialState(META)
            : startState === "editing"
              ? transition(createInitialState(META), "edit")
              : transition(createInitialState(META), "snooze", { now: FIXED_NOW });
        const next = transition(start, "accept", { now: FIXED_NOW });
        expect(next.state).toBe("confirmed");
      }
    });
  });

  // ── 不変原則 3: meta は遷移で変わらない ──

  describe("不変原則 3 — meta は遷移で変わらない", () => {
    it.each(ALL_ACTIONS)("%s 遷移で meta が同じ", (action) => {
      const next = transition(createInitialState(META), action, { now: FIXED_NOW });
      expect(next.meta).toEqual(META);
    });

    it("複数遷移を経ても meta が同じ", () => {
      const a = createInitialState(META);
      const b = transition(a, "edit", { draft: "x" });
      const c = transition(b, "snooze", { now: FIXED_NOW });
      const d = transition(c, "accept", { now: FIXED_LATER });
      expect(b.meta).toEqual(META);
      expect(c.meta).toEqual(META);
      expect(d.meta).toEqual(META);
    });
  });

  // ── now の inject (テスト用) ──

  describe("now の inject", () => {
    it("payload.now を渡せば decidedAt がそれになる", () => {
      const s = transition(createInitialState(META), "accept", { now: FIXED_NOW });
      if (s.state === "confirmed") {
        expect(s.decidedAt).toBe(FIXED_NOW);
      }
    });

    it("payload.now を渡さなければ now() を呼ぶ", () => {
      const before = Date.now();
      const s = transition(createInitialState(META), "accept");
      const after = Date.now();
      if (s.state === "confirmed") {
        const t = new Date(s.decidedAt).getTime();
        expect(t).toBeGreaterThanOrEqual(before);
        expect(t).toBeLessThanOrEqual(after);
      }
    });
  });
});
