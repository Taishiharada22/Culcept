/**
 * R5-2 ChangeSet Draft Mapper（pure）— proposal → ChangeSet draft（既存型 consume・apply しない・抽象ラベル・undo 可逆）。
 */
import { describe, it, expect } from "vitest";
import { proposalToChangeSetDraft } from "@/lib/plan/reality/permission/changeset-draft";
import { invertChangeSet } from "@/lib/plan/reality/change-set";
import type { EmptyDayBlock, EmptyDayProposal } from "@/lib/plan/reality/empty-day/empty-day-generator";

function block(startMinute: number, kind: EmptyDayBlock["kind"]): EmptyDayBlock {
  return { startMinute, endMinute: startMinute + 60, kind, band: "morning", memoryLeaning: null };
}
function proposal(over: Partial<EmptyDayProposal> = {}): EmptyDayProposal {
  return { tier: "protect", blocks: [block(540, "focus_work"), block(660, "recovery")], activeMinutes: 60, restMinutes: 60, strain: "low", ...over };
}
const LIFEOPS = /美容|予約|購入|店|ネイル|歯医者/;

describe("R5-2 proposalToChangeSetDraft", () => {
  it("add ops の ChangeSet draft・itemId deterministic・抽象ラベル(Life Ops 語なし)", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    expect(cs.ops).toHaveLength(2);
    expect(cs.ops.every((o) => o.kind === "add")).toBe(true);
    expect(cs.id).toBe("draft:emptyday:2026-06-20:protect");
    // deterministic（同入力→同 id）
    expect(proposalToChangeSetDraft(proposal(), "2026-06-20").ops[0]!.itemId).toBe(cs.ops[0]!.itemId);
    for (const o of cs.ops) {
      const title = o.kind === "add" ? o.after.title ?? "" : "";
      expect(title).not.toMatch(LIFEOPS); // 具体行動でない抽象ラベル
    }
  });
  it("governance は tentative/droppable/proposed（未確定候補）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    const gov = cs.ops[0]!.kind === "add" ? cs.ops[0]!.after.governance : undefined;
    expect(gov?.flexibility).toBe("droppable");
    expect(gov?.authority).toBe("proposed");
    expect(gov?.protectionReasons).toContain("tentative");
  });
  it("ChangeSet 型を consume → invertChangeSet で undo 可逆", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    const inv = invertChangeSet(cs);
    expect(inv.ops.every((o) => o.kind === "remove")).toBe(true); // add→remove
  });
  it("空 blocks → 空 ops", () => {
    expect(proposalToChangeSetDraft(proposal({ blocks: [] }), "2026-06-20").ops).toHaveLength(0);
  });
});
