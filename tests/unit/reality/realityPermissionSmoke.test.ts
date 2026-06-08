/**
 * R5 Smoke — proposal → ChangeSet draft → permission gate end-to-end（pure・no-apply）。
 *   draft 化は提案にすぎず gate に渡す候補・高リスクは confirm/blocked・apply しない。
 */
import { describe, it, expect } from "vitest";
import { proposalToChangeSetDraft } from "@/lib/plan/reality/permission/changeset-draft";
import { evaluatePermission } from "@/lib/plan/reality/permission/permission-gate";
import type { EmptyDayProposal } from "@/lib/plan/reality/empty-day/empty-day-generator";

const proposal: EmptyDayProposal = { tier: "protect", blocks: [{ startMinute: 540, endMinute: 600, kind: "focus_work", band: "morning", memoryLeaning: null }], activeMinutes: 60, restMinutes: 0, strain: "low" };

describe("R5 smoke — proposal→draft→gate", () => {
  it("draft は候補にすぎない（add ops・apply されない）→ propose action として gate", () => {
    const cs = proposalToChangeSetDraft(proposal, "2026-06-20");
    expect(cs.ops).toHaveLength(1);
    // 「候補を提案する」= propose（low risk）→ level2 で allowed
    expect(evaluatePermission({ action: "propose", flags: [], level: 2, governance: null, contextComplete: true }).verdict).toBe("allowed");
  });
  it("候補を『予約確定』に進めるのは高リスク → 必ず confirm/blocked（自動にならない）", () => {
    expect(evaluatePermission({ action: "book", flags: ["confirms_booking", "first_time_place"], level: 5, governance: null, contextComplete: true }).verdict).toBe("confirm_required");
    expect(evaluatePermission({ action: "book", flags: ["confirms_booking"], level: 1, governance: null, contextComplete: true }).verdict).toBe("blocked");
  });
  it("文脈不足では何も進めない（insufficient_context）", () => {
    expect(evaluatePermission({ action: "propose", flags: [], level: 5, governance: null, contextComplete: false }).verdict).toBe("insufficient_context");
  });
});
