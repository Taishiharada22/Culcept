import { describe, it, expect } from "vitest";
import { buildDevProposalSurfaceInput } from "@/app/(culcept)/plan/dev-reality-pipeline/devProposalSurfaceFixture";
import { previewProposalSurfaces } from "@/lib/plan/realityCore/proposalSurfacePreview";
import { proposalSurfaceViolations } from "@/lib/plan/realityCore/proposalSurface";

describe("RO-6 dev fixture — real compile chain runtime", () => {
  it("空 snapshot を real chain で組み RO-3→4→5 が通る", () => {
    const input = buildDevProposalSurfaceInput(new Date("2026-06-20T05:00:00.000Z"));
    const res = previewProposalSurfaces(input);
    expect(res.surfaces.length).toBe(1); // ro6-demo task 1 件
    const v = res.surfaces[0];
    expect(v.conceptKind).toBe("reaction_stance");
    expect(v.cards).toHaveLength(3);
    // easy(gradient) + push(task done) は根拠あり / protect は event なしで honest 空
    expect(v.cards.find((c) => c.stanceLabelKey === "easy_label")!.hasNoBasis).toBe(false);
    expect(v.cards.find((c) => c.stanceLabelKey === "push_label")!.hasNoBasis).toBe(false);
    expect(v.cards.find((c) => c.stanceLabelKey === "protect_label")!.hasNoBasis).toBe(true);
    expect(proposalSurfaceViolations(v)).toEqual([]);
    // leak-free
    const json = JSON.stringify(res.surfaces);
    for (const tok of ["proute:", "trn:", "anchor_", "gap_", "ern:"]) expect(json.includes(tok)).toBe(false);
  });
});
