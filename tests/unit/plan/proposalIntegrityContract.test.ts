/**
 * Phase 3-J-1a: Proposal Integrity Contract + types unit tests
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1a / §5 Proposal Integrity Contract
 *
 * 検証対象:
 *   - PROPOSAL_INTEGRITY_CONTRACT の 5 性質
 *   - assertProposalCompliance の 3 違反検出
 *   - ProposalDirection の 3 triad 値
 *   - ProposedAnchor / ProposalSource shape
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - sourceEvidenceRequired (= evidenceCount > 0)
 *   - sensitiveExcluded (= draft.sensitiveCategory != null は violation)
 *   - neverMutatesAnchor (= draft.id が 既存 anchor id なら violation)
 */

import { describe, it, expect } from "vitest";

import {
  assertProposalCompliance,
  PROPOSAL_INTEGRITY_CONTRACT,
  type ProposalIntegrityContract,
} from "@/lib/plan/proposal/proposalIntegrityContract";
import {
  isProposalDirection,
  type ProposalDirection,
} from "@/lib/plan/proposal/proposalDirection";
import type {
  ProposalConfidence,
  ProposalReason,
  ProposalSource,
  ProposedAnchor,
} from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildSampleProposal(overrides: Partial<ProposedAnchor> = {}): ProposedAnchor {
  const base: ProposedAnchor = {
    id: "proposal_test_1",
    reason: "pattern_repeat",
    direction: "continue_pattern",
    confidence: "medium",
    draft: {
      title: "カフェ",
      startTime: "14:00",
      rigidity: "soft",
      anchorKind: "one_off",
      date: "2026-05-22",
    },
    source: {
      signalType: "pattern_repeat",
      evidenceCount: 3,
      generatedAt: "2026-05-21T00:00:00.000Z",
    },
    createdAt: "2026-05-21T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROPOSAL_INTEGRITY_CONTRACT 5 性質
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROPOSAL_INTEGRITY_CONTRACT", () => {
  it("has all 5 properties literally true", () => {
    expect(PROPOSAL_INTEGRITY_CONTRACT.neverMutatesAnchor).toBe(true);
    expect(PROPOSAL_INTEGRITY_CONTRACT.userActionRequired).toBe(true);
    expect(PROPOSAL_INTEGRITY_CONTRACT.canBeIgnoredWithoutPenalty).toBe(true);
    expect(PROPOSAL_INTEGRITY_CONTRACT.sourceEvidenceRequired).toBe(true);
    expect(PROPOSAL_INTEGRITY_CONTRACT.sensitiveExcluded).toBe(true);
  });

  it("contract type is `true` literal (= cannot be reassigned to false at type level)", () => {
    // この test は compile-time の型 lock を runtime で擬似確認する。
    // TypeScript で `false` 代入を試みると型エラーになる (= 別 test framework で boot 不能)。
    const contract: ProposalIntegrityContract = PROPOSAL_INTEGRITY_CONTRACT;
    expect(contract.neverMutatesAnchor satisfies true).toBe(true);
    expect(contract.userActionRequired satisfies true).toBe(true);
    expect(contract.canBeIgnoredWithoutPenalty satisfies true).toBe(true);
    expect(contract.sourceEvidenceRequired satisfies true).toBe(true);
    expect(contract.sensitiveExcluded satisfies true).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// assertProposalCompliance: PASS cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assertProposalCompliance — PASS cases", () => {
  it("compliant proposal passes", () => {
    const proposal = buildSampleProposal();
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).not.toThrow();
  });

  it("proposal with draft.id = proposal-scoped id passes (= self-reference allowed)", () => {
    const proposal = buildSampleProposal({
      draft: {
        id: "proposal_xyz",
        title: "カフェ",
        startTime: "14:00",
        rigidity: "soft",
        anchorKind: "one_off",
        date: "2026-05-22",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).not.toThrow();
  });

  it("proposal with draft.id undefined passes", () => {
    const proposal = buildSampleProposal({
      draft: {
        title: "カフェ",
        startTime: "14:00",
        rigidity: "soft",
        anchorKind: "one_off",
        date: "2026-05-22",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).not.toThrow();
  });

  it("proposal with high confidence passes", () => {
    const proposal = buildSampleProposal({
      confidence: "high",
      source: {
        signalType: "pattern_repeat",
        evidenceCount: 7,
        generatedAt: "2026-05-21T00:00:00.000Z",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// assertProposalCompliance: VIOLATION cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assertProposalCompliance — sourceEvidenceRequired violations", () => {
  it("rejects evidenceCount = 0", () => {
    const proposal = buildSampleProposal({
      source: {
        signalType: "pattern_repeat",
        evidenceCount: 0,
        generatedAt: "2026-05-21T00:00:00.000Z",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /sourceEvidenceRequired/,
    );
  });

  it("rejects negative evidenceCount", () => {
    const proposal = buildSampleProposal({
      source: {
        signalType: "pattern_repeat",
        evidenceCount: -1,
        generatedAt: "2026-05-21T00:00:00.000Z",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /sourceEvidenceRequired/,
    );
  });
});

describe("assertProposalCompliance — sensitiveExcluded violations", () => {
  it("rejects medical sensitiveCategory in draft", () => {
    const proposal = buildSampleProposal({
      draft: {
        title: "通院",
        startTime: "10:00",
        rigidity: "hard",
        anchorKind: "one_off",
        date: "2026-05-22",
        sensitiveCategory: "medical",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /sensitiveExcluded/,
    );
  });

  it("rejects legal sensitiveCategory in draft", () => {
    const proposal = buildSampleProposal({
      draft: {
        title: "弁護士相談",
        startTime: "10:00",
        rigidity: "hard",
        anchorKind: "one_off",
        date: "2026-05-22",
        sensitiveCategory: "legal",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /sensitiveExcluded/,
    );
  });

  it("rejects exam / other sensitiveCategory in draft", () => {
    const examProposal = buildSampleProposal({
      draft: {
        title: "試験",
        startTime: "10:00",
        rigidity: "hard",
        anchorKind: "one_off",
        date: "2026-05-22",
        sensitiveCategory: "exam",
      },
    });
    expect(() => assertProposalCompliance(examProposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /sensitiveExcluded/,
    );

    const otherProposal = buildSampleProposal({
      draft: {
        title: "個人的な用事",
        startTime: "10:00",
        rigidity: "soft",
        anchorKind: "one_off",
        date: "2026-05-22",
        sensitiveCategory: "other",
      },
    });
    expect(() => assertProposalCompliance(otherProposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /sensitiveExcluded/,
    );
  });
});

describe("assertProposalCompliance — neverMutatesAnchor violations", () => {
  it("rejects draft.id pointing to existing anchor id (= not proposal-scoped)", () => {
    const proposal = buildSampleProposal({
      draft: {
        id: "anchor_existing_xyz",
        title: "カフェ",
        startTime: "14:00",
        rigidity: "soft",
        anchorKind: "one_off",
        date: "2026-05-22",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /neverMutatesAnchor/,
    );
  });

  it("rejects draft.id with arbitrary prefix that is not proposal_", () => {
    const proposal = buildSampleProposal({
      draft: {
        id: "ext_existing_xyz",
        title: "カフェ",
        startTime: "14:00",
        rigidity: "soft",
        anchorKind: "one_off",
        date: "2026-05-22",
      },
    });
    expect(() => assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT)).toThrow(
      /neverMutatesAnchor/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ProposalDirection — 3 triad
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ProposalDirection — Self-Direction Triad", () => {
  it("accepts all 3 triad values", () => {
    const directions: ProposalDirection[] = [
      "continue_pattern",
      "recover_pattern",
      "intentional_break_observed",
    ];
    directions.forEach((direction) => {
      const proposal = buildSampleProposal({ direction });
      expect(proposal.direction).toBe(direction);
    });
  });

  it("isProposalDirection accepts valid values", () => {
    expect(isProposalDirection("continue_pattern")).toBe(true);
    expect(isProposalDirection("recover_pattern")).toBe(true);
    expect(isProposalDirection("intentional_break_observed")).toBe(true);
  });

  it("isProposalDirection rejects invalid values", () => {
    expect(isProposalDirection("continue")).toBe(false);
    expect(isProposalDirection("recover")).toBe(false);
    expect(isProposalDirection("intentional_break")).toBe(false); // typo of real value
    expect(isProposalDirection("")).toBe(false);
    expect(isProposalDirection(null)).toBe(false);
    expect(isProposalDirection(undefined)).toBe(false);
    expect(isProposalDirection(123)).toBe(false);
    expect(isProposalDirection({})).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ProposedAnchor / ProposalSource / ProposalReason / ProposalConfidence shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ProposedAnchor shape", () => {
  it("has all required readonly fields with correct types", () => {
    const proposal = buildSampleProposal();
    expect(proposal.id).toBeTypeOf("string");
    expect(proposal.id.startsWith("proposal_")).toBe(true);
    expect(proposal.reason).toBeTypeOf("string");
    expect(proposal.direction).toBeTypeOf("string");
    expect(proposal.confidence).toMatch(/^(high|medium)$/);
    expect(proposal.draft).toBeTypeOf("object");
    expect(proposal.source).toBeTypeOf("object");
    expect(proposal.source.evidenceCount).toBeGreaterThan(0);
    expect(proposal.createdAt).toBeTypeOf("string");
  });

  it("draft is Partial<ExternalAnchor> (= optional fields allowed)", () => {
    const minimalProposal = buildSampleProposal({
      draft: {
        title: "minimal",
      },
    });
    expect(minimalProposal.draft.title).toBe("minimal");
    expect(minimalProposal.draft.startTime).toBeUndefined();
  });
});

describe("ProposalReason — exhaustive 4 values", () => {
  it("accepts all 4 reason values", () => {
    const reasons: ProposalReason[] = [
      "pattern_repeat",
      "lived_geography_centroid",
      "day_pattern",
      "unconfirmed_place_hint",
    ];
    reasons.forEach((reason) => {
      const proposal = buildSampleProposal({
        reason,
        source: {
          signalType: reason,
          evidenceCount: 3,
          generatedAt: "2026-05-21T00:00:00.000Z",
        },
      });
      expect(proposal.reason).toBe(reason);
      expect(proposal.source.signalType).toBe(reason);
    });
  });
});

describe("ProposalConfidence — 2 values (= no low)", () => {
  it("accepts high and medium", () => {
    const confidences: ProposalConfidence[] = ["high", "medium"];
    confidences.forEach((confidence) => {
      const proposal = buildSampleProposal({ confidence });
      expect(proposal.confidence).toBe(confidence);
    });
  });

  it("low confidence is not assignable (= compile-time check)", () => {
    // @ts-expect-error — "low" is not assignable to ProposalConfidence
    const invalidConfidence: ProposalConfidence = "low";
    // この test は compile-time の型 check が主目的、 runtime では string として通る
    expect(invalidConfidence).toBe("low");
  });
});

describe("ProposalSource shape", () => {
  it("has signalType / evidenceCount / generatedAt", () => {
    const source: ProposalSource = {
      signalType: "lived_geography_centroid",
      evidenceCount: 5,
      generatedAt: "2026-05-21T12:34:56.000Z",
    };
    expect(source.signalType).toBe("lived_geography_centroid");
    expect(source.evidenceCount).toBe(5);
    expect(source.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
