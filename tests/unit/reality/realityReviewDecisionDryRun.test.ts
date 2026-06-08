/**
 * A1-7-8 Review Decision Dry-run Helper — pure 検証。
 *   approve/reject/defer→effect、blocked/未知 decision→fail-closed(invalid)、review 時点 snapshot 固定、
 *   reviewedAtISO 注入(Date.now 不使用)、persisted:false/非断定、batch 順序保持を証明する。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import { toReviewDecisionRecord, toReviewDecisionRecords } from "@/lib/plan/reality/learning/review-decision-dry-run";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

const HANDLE = "c1:" + "d".repeat(64);
function ev(action: CandidateActionKind, band: "morning" | "evening") {
  return toDryRunLearningEvent({ handle: HANDLE, date: "2026-06-15", band, confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit" }, action);
}
const proj = projectPrmDryRun(
  aggregateDryRunEvents([
    ...Array.from({ length: 6 }, () => ev("dismiss", "evening")), // candidate
    ...Array.from({ length: 3 }, () => ev("accept", "morning")), // blocked(insufficient)
  ])
);
const candidate = proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === "evening")!;
const blocked = proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === "morning")!;

describe("A1-7-8 toReviewDecisionRecord", () => {
  it("approve candidate → valid / effect add_model_entry_candidate / snapshot 固定 / persisted false / reviewRequired", () => {
    const r = toReviewDecisionRecord(candidate, "approve", "operator", "2026-06-15T09:00:00Z");
    expect(r.kind).toBe("review_decision_record");
    expect(r.valid).toBe(true);
    expect(r.decision).toBe("approve");
    expect(r.effect).toBe("add_model_entry_candidate");
    expect(r.proposalFingerprint).toBe("band:evening:dismiss");
    expect(r.snapshot.certainty).toBe("tentative"); // ≤ tentative（high なし）
    expect(r.snapshot.counterCount).toBe(0);
    expect(r.reviewedAtISO).toBe("2026-06-15T09:00:00Z");
    expect(r.persisted).toBe(false);
    expect(r.reviewRequired).toBe(true);
    expect(r.assertsPersonality).toBe(false);
  });
  it("reject → record_rejection / defer → no_model_change", () => {
    expect(toReviewDecisionRecord(candidate, "reject", "user").effect).toBe("record_rejection");
    expect(toReviewDecisionRecord(candidate, "defer", "user").effect).toBe("no_model_change");
  });
  it("blocked proposal の review → invalid(not_reviewable) / decision·effect null（fail-closed）", () => {
    const r = toReviewDecisionRecord(blocked, "approve", "operator");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("not_reviewable");
    expect(r.decision).toBeNull();
    expect(r.effect).toBeNull();
  });
  it("未知 decision → invalid(unknown_decision)", () => {
    const r = toReviewDecisionRecord(candidate, "delete", "operator");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("unknown_decision");
    expect(r.decision).toBeNull();
  });
  it("reviewedAtISO 注入(Date.now 不使用) / pure deterministic / seedRef·UUID 非出", () => {
    expect(toReviewDecisionRecord(candidate, "approve", "operator").reviewedAtISO).toBeNull();
    expect(toReviewDecisionRecord(candidate, "approve", "operator", "2026-06-15T10:00:00Z")).toEqual(
      toReviewDecisionRecord(candidate, "approve", "operator", "2026-06-15T10:00:00Z")
    );
    expect(JSON.stringify(toReviewDecisionRecord(candidate, "approve", "operator"))).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
  it("非断定: certainty high にならない / 嫌い·好み確定を含まない", () => {
    const json = JSON.stringify(toReviewDecisionRecord(candidate, "approve", "operator"));
    expect(json).not.toMatch(/嫌い|好み確定|"certainty":"high"/);
  });
  it("batch は順序保持（candidate valid / blocked invalid）", () => {
    const rs = toReviewDecisionRecords([
      { proposal: candidate, decision: "approve", reviewer: "operator" },
      { proposal: blocked, decision: "approve", reviewer: "operator" },
    ]);
    expect(rs[0]!.valid).toBe(true);
    expect(rs[1]!.valid).toBe(false);
  });
});
