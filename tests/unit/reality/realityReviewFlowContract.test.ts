/**
 * A1-7-7 PRM Review Flow Contract — pure contract 検証。
 *   candidate のみ reviewable（blocked は不可）・decision validation（未知/non-reviewable を弾く）・
 *   decision→PRM 効果（approve=entry 候補/reject=rejection/defer=変化なし）・proposal fingerprint を証明する。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import {
  isReviewableProposal,
  isReviewDecisionKind,
  validateReview,
  decisionEffect,
  proposalFingerprint,
} from "@/lib/plan/reality/learning/review-flow-contract";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

const HANDLE = "c1:" + "c".repeat(64);
function ev(action: CandidateActionKind, band: "morning" | "evening") {
  return toDryRunLearningEvent({ handle: HANDLE, date: "2026-06-15", band, confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit" }, action);
}
const proj = projectPrmDryRun(
  aggregateDryRunEvents([
    ...Array.from({ length: 6 }, () => ev("dismiss", "evening")), // candidate（tentative・6≥5）
    ...Array.from({ length: 3 }, () => ev("accept", "morning")), // blocked（tentative・3<5）
  ])
);
const candidate = proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === "evening")!;
const blocked = proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === "morning")!;

describe("A1-7-7 review flow contract", () => {
  it("isReviewableProposal: candidate→true / blocked→false（blocked は observation 止まり）", () => {
    expect(candidate.status).toBe("candidate");
    expect(blocked.status).toBe("blocked");
    expect(isReviewableProposal(candidate)).toBe(true);
    expect(isReviewableProposal(blocked)).toBe(false);
  });
  it("validateReview: candidate+valid→ok / blocked→not_reviewable / 未知 decision→unknown_decision", () => {
    expect(validateReview(candidate, "approve")).toEqual({ valid: true, reason: "ok" });
    expect(validateReview(blocked, "approve")).toEqual({ valid: false, reason: "not_reviewable" });
    expect(validateReview(candidate, "frobnicate")).toEqual({ valid: false, reason: "unknown_decision" });
  });
  it("isReviewDecisionKind: approve/reject/defer のみ true", () => {
    for (const d of ["approve", "reject", "defer"]) expect(isReviewDecisionKind(d)).toBe(true);
    expect(isReviewDecisionKind("delete")).toBe(false);
  });
  it("decisionEffect: approve→add_model_entry_candidate / reject→record_rejection / defer→no_model_change", () => {
    expect(decisionEffect("approve")).toBe("add_model_entry_candidate");
    expect(decisionEffect("reject")).toBe("record_rejection");
    expect(decisionEffect("defer")).toBe("no_model_change");
  });
  it("proposalFingerprint: dimension:value:dominantAction・seedRef/UUID を含まない", () => {
    expect(proposalFingerprint(candidate)).toBe("band:evening:dismiss");
    expect(proposalFingerprint(candidate)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});
