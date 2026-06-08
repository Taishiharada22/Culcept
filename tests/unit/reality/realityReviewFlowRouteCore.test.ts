/**
 * A1-7-33 Review Flow Route Core — executeReviewDecision（fake M2/M3 repo・実 DB 0）。
 *   approve→M2+M3 / reject·defer→M2 のみ / blocked→fail-closed / not_found / unknown_decision /
 *   M2 fail→fail-closed / **M2 ok+M3 fail→partial failure 明示** / operator 固定 / redacted / M3 は review_decision_id 必須。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import { executeReviewDecision } from "@/lib/plan/reality/learning/review-flow-route-core";
import { FakePrmReviewDecisionRepository } from "@/lib/plan/reality/learning/fake-prm-review-decision-repository";
import { FakePrmModelEntryRepository } from "@/lib/plan/reality/learning/fake-prm-model-entry-repository";

const NOW = Date.parse("2026-06-15T10:00:00.000Z");
const NO_RAW = /raw|seed_?ref|utterance|personality|trait|fixed_preference/i;
function ev(handle: string, over: Partial<CandidateActionContext> = {}) {
  return toDryRunLearningEvent({ handle, date: "2026-06-15", band: "evening", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...over }, "dismiss", "2026-06-15T09:00:00.000Z");
}
const H = (c: string) => "c1:" + c.repeat(64);
// 5 evening dismiss（distinct handle）→ band:evening:dismiss candidate（tentative・evidence 5≥5）
function candidateProposals() {
  const events = ["a", "b", "c", "d", "e"].map((c) => ev(H(c)));
  return projectPrmDryRun(aggregateDryRunEvents(events)).proposals;
}
// 3 morning dismiss → band:morning:dismiss blocked（3<minCandidateEvidence 5）
function blockedProposals() {
  const events = ["a", "b", "c"].map((c) => ev(H(c), { band: "morning" }));
  return projectPrmDryRun(aggregateDryRunEvents(events)).proposals;
}
function repos() {
  return { m2: new FakePrmReviewDecisionRepository(), m3: new FakePrmModelEntryRepository() };
}
const FP = "band:evening:dismiss";

describe("A1-7-33 executeReviewDecision — approve/reject/defer・fail-closed・partial failure", () => {
  it("候補確認: band:evening:dismiss は candidate", () => {
    const p = candidateProposals().find((x) => `${x.sourceDimension}:${x.sourceValue}:${x.dominantAction}` === FP);
    expect(p?.status).toBe("candidate");
  });

  it("approve → M2 1 + M3 1（modelEntryCreated・M3 は review_decision_id=M2 id）", async () => {
    const { m2, m3 } = repos();
    const r = await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: FP, decision: "approve" }, m2, m3, nowMs: NOW });
    expect(r).toEqual({ ok: true, reviewed: true, decision: "approve", modelEntryCreated: true, reason: "ok", partialFailure: null });
    expect(m2.count).toBe(1);
    expect(m3.count).toBe(1);
    expect(m3.rows[0]!.review_decision_id).toBe("fake-review-0"); // reviewRequired: M2 id 経由
    expect(m2.rows[0]!.reviewer).toBe("operator"); // operator 固定
    expect(m2.rows[0]!.certainty).not.toBe("high");
    expect(JSON.stringify(r)).not.toMatch(NO_RAW);
    expect(JSON.stringify(r)).not.toContain("fake-review-0"); // id を return に出さない
  });

  it("reject → M2 1・M3 0", async () => {
    const { m2, m3 } = repos();
    const r = await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: FP, decision: "reject" }, m2, m3, nowMs: NOW });
    expect(r.reviewed).toBe(true);
    expect(r.modelEntryCreated).toBe(false);
    expect(m2.count).toBe(1);
    expect(m3.count).toBe(0);
  });
  it("defer → M2 1・M3 0", async () => {
    const { m2, m3 } = repos();
    await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: FP, decision: "defer" }, m2, m3, nowMs: NOW });
    expect(m2.count).toBe(1);
    expect(m3.count).toBe(0);
  });

  it("blocked proposal → fail-closed（not_reviewable）・M2 0", async () => {
    const { m2, m3 } = repos();
    const r = await executeReviewDecision({ proposals: blockedProposals(), rawRequest: { proposalFingerprint: "band:morning:dismiss", decision: "approve" }, m2, m3, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_reviewable");
    expect(m2.count).toBe(0);
    expect(m3.count).toBe(0);
  });
  it("proposal_not_found（不正 fingerprint）→ fail-closed・M2 0", async () => {
    const { m2, m3 } = repos();
    const r = await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: "band:nope:dismiss", decision: "approve" }, m2, m3, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("proposal_not_found");
    expect(m2.count).toBe(0);
  });
  it("unknown_decision → fail-closed", async () => {
    const { m2, m3 } = repos();
    const r = await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: FP, decision: "snooze" }, m2, m3, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unknown_decision");
    expect(m2.count).toBe(0);
  });

  it("M2 insert fail → fail-closed（m2_insert_failed）・M3 0", async () => {
    const { m2, m3 } = repos();
    m2.setFailNext(1);
    const r = await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: FP, decision: "approve" }, m2, m3, nowMs: NOW });
    expect(r).toEqual({ ok: false, reviewed: false, decision: "approve", modelEntryCreated: false, reason: "m2_insert_failed", partialFailure: null });
    expect(m3.count).toBe(0);
  });

  it("**partial failure**: M2 ok + M3 fail → reviewed:true・modelEntryCreated:false・partialFailure 明示", async () => {
    const { m2, m3 } = repos();
    m3.setFailNext(1);
    const r = await executeReviewDecision({ proposals: candidateProposals(), rawRequest: { proposalFingerprint: FP, decision: "approve" }, m2, m3, nowMs: NOW });
    expect(r).toEqual({ ok: true, reviewed: true, decision: "approve", modelEntryCreated: false, reason: "ok", partialFailure: "model_entry_insert_failed" });
    expect(m2.count).toBe(1); // M2 は確定（隠さない）
    expect(m3.count).toBe(0);
  });
});
