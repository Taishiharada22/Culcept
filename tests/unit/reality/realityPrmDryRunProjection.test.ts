/**
 * A1-7-3 PRM Dry-run Proposal Projection — pure projection 検証。
 *   TentativePatternReport → PrmDryRunProposal[]: low→blocked(certainty_low) / tentative+不足→blocked(evidence_insufficient) /
 *   tentative+十分→candidate(reviewRequired)、dismiss を「嫌い」/ accept を「好み確定」に変換しない（tendency framing）、
 *   counter-evidence/stillPossible/certainty 保持、未永続化（persisted=false）、review gate（reviewRequired=true）を証明する。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun, toPrmDryRunProposals, blockedReasonLabel } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

const HANDLE = "c1:" + "b".repeat(64);
function ev(action: CandidateActionKind, band: "morning" | "afternoon" | "evening") {
  return toDryRunLearningEvent({ handle: HANDLE, date: "2026-06-15", band, confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit" }, action);
}
function fixtureReport() {
  const evs = [
    ...Array.from({ length: 6 }, () => ev("dismiss", "evening")), // band evening: tentative, 6≥5 → candidate
    ...Array.from({ length: 3 }, () => ev("accept", "morning")), // band morning: tentative, 3<5 → blocked(insufficient)
    ev("accept", "afternoon"), ev("accept", "afternoon"), ev("dismiss", "afternoon"), ev("dismiss", "afternoon"), ev("later", "afternoon"), // band afternoon: mixed → low → blocked(certainty_low)
  ];
  return aggregateDryRunEvents(evs);
}
const proj = projectPrmDryRun(fixtureReport());
const band = (v: string) => proj.proposals.find((p) => p.sourceDimension === "band" && p.sourceValue === v)!;

describe("A1-7-3 projection rule — low→blocked / tentative+十分→candidate", () => {
  it("evening(6 dismiss・tentative≥5) → candidate / reviewRequired / blockedReason null", () => {
    const p = band("evening");
    expect(p.status).toBe("candidate");
    expect(p.reviewRequired).toBe(true);
    expect(p.blockedReason).toBeNull();
    expect(p.certainty).toBe("tentative");
  });
  it("morning(3 accept・tentative<5) → blocked(evidence_insufficient)", () => {
    const p = band("morning");
    expect(p.status).toBe("blocked");
    expect(p.blockedReason).toBe("evidence_insufficient");
  });
  it("afternoon(割れ) → blocked(certainty_low) / certainty low", () => {
    const p = band("afternoon");
    expect(p.status).toBe("blocked");
    expect(p.blockedReason).toBe("certainty_low");
    expect(p.certainty).toBe("low");
  });
  it("candidates は全て tentative かつ evidence≥5・counter/stillPossible 保持", () => {
    for (const c of proj.candidates) {
      expect(c.certainty).toBe("tentative");
      expect(c.evidenceCount).toBeGreaterThanOrEqual(5);
    }
    const e = band("evening");
    expect(e.stillPossible.length).toBeGreaterThan(0); // counter-hypotheses 保持
    expect(e.counterCount).toBe(0); // 6 dismiss = counter 0
  });
});

describe("A1-7-3 断定しない / 未永続化 / review gate", () => {
  it("dismiss を「嫌い」/ accept を「好み確定」に変換しない（tendency framing・要 review）", () => {
    expect(JSON.stringify(proj)).not.toMatch(/嫌い|好み確定|好き|dislike/);
    expect(band("evening").tentativeInterpretation).toContain("採用されにくい傾向"); // dismiss → tendency（not 嫌い）
    expect(band("evening").tentativeInterpretation).toContain("要 review");
    expect(band("morning").tentativeInterpretation).toContain("採用されやすい傾向"); // accept → tendency（not 好み確定）
  });
  it("projection persisted=false / assertsPersonality=false / kind markers / 全 proposal reviewRequired=true・assertsPreference=false", () => {
    expect(proj.kind).toBe("prm_dry_run_projection");
    expect(proj.persisted).toBe(false);
    expect(proj.assertsPersonality).toBe(false);
    for (const p of proj.proposals) {
      expect(p.kind).toBe("prm_dry_run_proposal");
      expect(p.reviewRequired).toBe(true);
      expect(p.assertsPreference).toBe(false);
    }
  });
  it("certainty は high にならない（全 proposal low|tentative）", () => {
    for (const p of proj.proposals) expect(["low", "tentative"]).toContain(p.certainty);
  });
  it("whyProposalOnly が humility / blockedReasonLabel が controlled", () => {
    expect(band("evening").whyProposalOnly).toContain("review");
    expect(blockedReasonLabel("certainty_low")).toContain("断定不可");
    expect(blockedReasonLabel("evidence_insufficient")).toContain("evidence 不足");
  });
  it("toPrmDryRunProposals === projection.proposals / pure deterministic", () => {
    const report = fixtureReport();
    expect(toPrmDryRunProposals(report)).toEqual(projectPrmDryRun(report).proposals);
    expect(projectPrmDryRun(report)).toEqual(projectPrmDryRun(report));
  });
});
