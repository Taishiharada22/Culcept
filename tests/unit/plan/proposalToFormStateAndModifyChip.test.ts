/**
 * Phase 3-J-5: proposalDraftToFormState + ProposalChip onModify wiring
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-5 / §10.1 Smoke 5
 *
 * 検証対象:
 *   - proposalDraftToFormState: 全 field 変換 + sensitive 除外 + kind 分岐
 *   - ProposalChip / ProposalSheet module import + onModify wiring (= no DOM render)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 4 privacy first (= sensitive 除外)
 *   - Invariant 10 anchor を mutate しない
 *   - Invariant 37 Proposal Integrity Contract
 */

import { describe, expect, it } from "vitest";

import { proposalDraftToFormState } from "@/lib/plan/proposal/proposalToFormState";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildProposal(overrides: Partial<ProposedAnchor> = {}): ProposedAnchor {
  return {
    id: "proposal_test",
    reason: "pattern_repeat",
    direction: "continue_pattern",
    confidence: "medium",
    draft: { title: "カフェ", startTime: "14:00" },
    source: {
      signalType: "pattern_repeat",
      evidenceCount: 3,
      generatedAt: "2026-05-21T00:00:00.000Z",
    },
    createdAt: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// proposalDraftToFormState: 基本変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("proposalDraftToFormState — basic conversion", () => {
  it("title / startTime / endTime / locationText を form field に展開", () => {
    const proposal = buildProposal({
      draft: {
        title: "ジム",
        startTime: "07:00",
        endTime: "08:30",
        locationText: "渋谷",
      },
    });
    const form = proposalDraftToFormState(proposal);
    expect(form.title).toBe("ジム");
    expect(form.startTime).toBe("07:00");
    expect(form.endTime).toBe("08:30");
    expect(form.locationText).toBe("渋谷");
  });

  it("rigidity / locationCategory 展開", () => {
    const proposal = buildProposal({
      draft: {
        title: "通勤",
        rigidity: "hard",
        locationCategory: "office",
      },
    });
    const form = proposalDraftToFormState(proposal);
    expect(form.rigidity).toBe("hard");
    expect(form.locationCategory).toBe("office");
  });

  it("undefined field は form に渡さない (= partial)", () => {
    const proposal = buildProposal({
      draft: { title: "test" },
    });
    const form = proposalDraftToFormState(proposal);
    expect(form.title).toBe("test");
    expect("startTime" in form).toBe(false);
    expect("endTime" in form).toBe(false);
    expect("locationText" in form).toBe(false);
  });

  it("empty draft → empty form (+ kind 未設定)", () => {
    const proposal = buildProposal({ draft: {} });
    const form = proposalDraftToFormState(proposal);
    expect("kind" in form).toBe(false);
    expect("title" in form).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// anchorKind 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("proposalDraftToFormState — anchorKind 分岐", () => {
  it("one_off + date → kind/date 展開", () => {
    const proposal = buildProposal({
      draft: {
        title: "ランチ",
        startTime: "12:00",
        anchorKind: "one_off",
        date: "2026-05-22",
      },
    });
    const form = proposalDraftToFormState(proposal);
    expect(form.kind).toBe("one_off");
    expect(form.date).toBe("2026-05-22");
    expect("validFrom" in form).toBe(false);
  });

  it("recurring + validFrom/validUntil → kind/validity 展開、 selectedWeekdays は default", () => {
    const proposal = buildProposal({
      draft: {
        title: "ヨガ",
        startTime: "19:00",
        anchorKind: "recurring",
        validFrom: "2026-05-22",
        validUntil: "2026-08-22",
      },
    });
    const form = proposalDraftToFormState(proposal);
    expect(form.kind).toBe("recurring");
    expect(form.validFrom).toBe("2026-05-22");
    expect(form.validUntil).toBe("2026-08-22");
    expect("date" in form).toBe(false);
    // selectedWeekdays は form default (= []) に委ねる
    expect("selectedWeekdays" in form).toBe(false);
  });

  it("anchorKind 未設定 → kind 未設定 (= form default に委ねる)", () => {
    const proposal = buildProposal({
      draft: { title: "なんでも" },
    });
    const form = proposalDraftToFormState(proposal);
    expect("kind" in form).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL: sensitive 除外 (= Invariant 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("proposalDraftToFormState — sensitive 除外 (Invariant 4)", () => {
  it("proposal が sensitive を含む場合、 compliance assertion で throw (= 上流で防ぐ)", () => {
    const proposal = buildProposal({
      draft: {
        title: "通院",
        sensitiveCategory: "medical",
      },
    });
    // compliance assertion が pre-condition で throw
    expect(() => proposalDraftToFormState(proposal)).toThrow(/sensitiveExcluded/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mutation 検査 (= Invariant 10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("proposalDraftToFormState — no mutation", () => {
  it("input proposal を mutate しない", () => {
    const proposal = buildProposal({
      draft: {
        title: "カフェ",
        startTime: "14:00",
        anchorKind: "one_off",
        date: "2026-05-22",
      },
    });
    const frozen = JSON.stringify(proposal);
    proposalDraftToFormState(proposal);
    expect(JSON.stringify(proposal)).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ProposalChip / ProposalSheet onModify wiring (= module level)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ProposalChip / ProposalSheet onModify imports", () => {
  it("ProposalChip module exports ProposalChip function", async () => {
    const mod = await import("@/app/(culcept)/plan/components/ProposalChip");
    expect(mod.ProposalChip).toBeTypeOf("function");
  });

  it("ProposalSheet module exports ProposalSheet function", async () => {
    const mod = await import("@/app/(culcept)/plan/components/ProposalSheet");
    expect(mod.ProposalSheet).toBeTypeOf("function");
  });
});
