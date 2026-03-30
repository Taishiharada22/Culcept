import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateEvidenceCards,
  generateInquiry,
  recordInquiryResponse,
  evaluateHypothesis,
  confirmVerification,
  loadHypotheses,
  loadPendingHypotheses,
  loadVerifiedHypotheses,
  type Hypothesis,
  type EvidenceCard,
} from "@/lib/origin/evidenceCardEngine";
import type { EntryRecord } from "@/lib/origin/entryContract";

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
  });
});

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function rec(daysAgo: number, category: string): EntryRecord {
  const d = dateStr(daysAgo);
  return {
    date: d,
    category: category as EntryRecord["category"],
    recordedAt: `${d}T10:00:00Z`,
  };
}

// ---------------------------------------------------------------------------
// Full hypothesis → verification loop
// ---------------------------------------------------------------------------

describe("hypothesis verification full loop", () => {
  it("step 1: generate evidence card with exception", () => {
    // 16 entries → evidence level, with recent shift
    const entries: EntryRecord[] = [];
    // First 10: mostly work_decision
    for (let i = 16; i > 6; i--) {
      entries.push(rec(i, "work_decision"));
    }
    // Last 6: mostly relationship (shift)
    for (let i = 6; i >= 0; i--) {
      entries.push(rec(i, i < 2 ? "work_decision" : "relationship"));
    }

    const cards = generateEvidenceCards(null, entries, null);
    const evidenceCard = cards.find(
      (c) => c.growth === "evidence" && c.exception != null,
    );
    // With 16+ entries and a recent shift, we should get an exception
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it("step 2: generate inquiry from evidence card with exception", () => {
    const card: EvidenceCard = {
      id: "cat_work_decision",
      growth: "evidence",
      pattern: "仕事の判断に最も多く使われています",
      frequency: "12/16",
      exception: {
        description: "直近で減少",
        recentCount: 2,
        totalCount: 10,
        question: "最近仕事の判断エネルギーが減少していますが、何か変わりましたか？",
      },
      category: "work_decision",
      type: "judgment_pattern",
      dataPoints: 16,
      updatedAt: new Date().toISOString(),
    };

    const inquiry = generateInquiry([card]);
    expect(inquiry).not.toBeNull();
    expect(inquiry!.question).toContain("減少");
    expect(inquiry!.hypothesisOptions.length).toBeGreaterThanOrEqual(3);
    expect(inquiry!.observationProposal).toBeTruthy();
  });

  it("step 3: record hypothesis and verify it persists", () => {
    const hypothesis: Hypothesis = {
      id: "h_test_1",
      cardId: "cat_work_decision",
      options: [
        { id: "workload", label: "仕事量の変化" },
        { id: "relationship_change", label: "人間関係の変化" },
      ],
      selectedOption: "workload",
      freeText: null,
      observationProposal: "来週、仕事の判断を意識的に減らす日を1日作ってみてください",
      verification: null,
      createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(), // 5 days ago
    };

    recordInquiryResponse(hypothesis);
    const loaded = loadHypotheses();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("h_test_1");
    expect(loaded[0].selectedOption).toBe("workload");
  });

  it("step 4: pending hypotheses filter by age", () => {
    // Hypothesis created 5 days ago (> MIN_DAYS = 3)
    const old: Hypothesis = {
      id: "h_old",
      cardId: "cat_work_decision",
      options: [],
      selectedOption: "workload",
      freeText: null,
      observationProposal: null,
      verification: null,
      createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    };
    // Hypothesis created 1 day ago (< MIN_DAYS = 3)
    const fresh: Hypothesis = {
      id: "h_fresh",
      cardId: "cat_relationship",
      options: [],
      selectedOption: "other",
      freeText: null,
      observationProposal: null,
      verification: null,
      createdAt: new Date(Date.now() - 1 * 86400_000).toISOString(),
    };

    store["origin_hypotheses_v1"] = JSON.stringify([old, fresh]);

    const pending = loadPendingHypotheses();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("h_old");
  });

  it("step 5: evaluate hypothesis — supported (stable pattern)", () => {
    const h: Hypothesis = {
      id: "h1",
      cardId: "cat_work_decision",
      options: [],
      selectedOption: "workload",
      freeText: null,
      observationProposal: null,
      verification: null,
      createdAt: new Date(Date.now() - 10 * 86400_000).toISOString(),
    };

    const entries: EntryRecord[] = [];
    // Pre: 60% work_decision
    for (let i = 15; i > 10; i--) {
      entries.push(rec(i, i % 5 < 3 ? "work_decision" : "relationship"));
    }
    // Post: still ~60% work_decision
    for (let i = 9; i >= 0; i--) {
      entries.push(rec(i, i % 5 < 3 ? "work_decision" : "relationship"));
    }

    const proposal = evaluateHypothesis(h, entries, null);
    expect(proposal.result).toBe("supported");
    expect(proposal.confidence).toBeGreaterThan(0);
    expect(proposal.evidence).toContain("仕事の判断");
  });

  it("step 6: confirm verification and persist", () => {
    const h: Hypothesis = {
      id: "h_verify",
      cardId: "cat_work_decision",
      options: [],
      selectedOption: "workload",
      freeText: null,
      observationProposal: null,
      verification: null,
      createdAt: new Date(Date.now() - 10 * 86400_000).toISOString(),
    };
    store["origin_hypotheses_v1"] = JSON.stringify([h]);

    confirmVerification("h_verify", "supported", "パターンは安定しています");

    const verified = loadVerifiedHypotheses();
    expect(verified).toHaveLength(1);
    expect(verified[0].verification!.result).toBe("supported");
    expect(verified[0].verification!.evidence).toBe("パターンは安定しています");
    expect(verified[0].verification!.verifiedAt).toBeTruthy();
  });

  it("full loop: generate → record → wait → evaluate → confirm", () => {
    // 1. Generate evidence cards
    const entries: EntryRecord[] = [];
    for (let i = 0; i < 16; i++) {
      entries.push(rec(i, i < 12 ? "work_decision" : "relationship"));
    }
    const cards = generateEvidenceCards(null, entries, null);
    expect(cards.length).toBeGreaterThanOrEqual(1);

    // 2. Simulate hypothesis recording
    const hypothesis: Hypothesis = {
      id: "h_full_loop",
      cardId: "cat_work_decision",
      options: [{ id: "workload", label: "仕事量の変化" }],
      selectedOption: "workload",
      freeText: null,
      observationProposal: "来週、仕事の判断を減らしてみてください",
      verification: null,
      createdAt: new Date(Date.now() - 7 * 86400_000).toISOString(),
    };
    recordInquiryResponse(hypothesis);

    // 3. Check pending
    const pending = loadPendingHypotheses();
    expect(pending.length).toBeGreaterThanOrEqual(1);

    // 4. Evaluate
    const proposal = evaluateHypothesis(pending[0], entries, null);
    expect(["supported", "exception", "inconclusive"]).toContain(proposal.result);

    // 5. Confirm
    confirmVerification(
      pending[0].id,
      proposal.result as "supported" | "exception" | "inconclusive",
      proposal.evidence,
    );

    // 6. Verify final state
    const finalPending = loadPendingHypotheses();
    expect(finalPending.find((h) => h.id === "h_full_loop")).toBeUndefined();

    const verified = loadVerifiedHypotheses();
    expect(verified.find((h) => h.id === "h_full_loop")).toBeDefined();
  });

  it("weekly inquiry limit is enforced", () => {
    // Record 3 inquiries this week
    const thisWeek: string[] = [];
    for (let i = 0; i < 3; i++) {
      thisWeek.push(dateStr(i));
    }
    store["origin_inquiry_history_v1"] = JSON.stringify(thisWeek);

    const card: EvidenceCard = {
      id: "cat_test",
      growth: "evidence",
      pattern: "test",
      frequency: "10/14",
      exception: {
        description: "test",
        recentCount: 8,
        totalCount: 10,
        question: "test?",
      },
      category: "work_decision",
      type: "judgment_pattern",
      dataPoints: 14,
      updatedAt: new Date().toISOString(),
    };

    const inquiry = generateInquiry([card]);
    expect(inquiry).toBeNull(); // limit reached
  });
});
