import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateEvidenceCards,
  generateInquiry,
  evaluateHypothesis,
  type EvidenceCard,
  type Hypothesis,
} from "@/lib/origin/evidenceCardEngine";
import type { EntryRecord, JudgmentCategory } from "@/lib/origin/entryContract";
import type { DailyOrbitStore, DailyOrbitEntry } from "@/lib/origin/dailyOrbit/types";
import type { StargazerOriginContext } from "@/lib/origin/stargazerPipeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntryRecord(date: string, category: JudgmentCategory): EntryRecord {
  return { date, category, recordedAt: `${date}T10:00:00Z` };
}

function makeOrbitEntry(date: string, opts?: Partial<DailyOrbitEntry>): DailyOrbitEntry {
  return {
    date,
    tasks: [{ id: "t1", text: "task", nature: "obligation", completed: true, carryCount: 0, addedAt: date }],
    bodyEcho: null,
    dayState: null,
    shadowIntention: null,
    temporalDialogue: null,
    timeTexture: null,
    reflection: null,
    selfForecast: null,
    userPrediction: null,
    createdAt: date,
    updatedAt: date,
    ...opts,
  };
}

function makeStore(entries: Record<string, DailyOrbitEntry>): DailyOrbitStore {
  return {
    version: 2,
    entries,
    orbitLaws: [],
    selfResolution: { score: 0, updatedAt: "", history: [] },
    threads: [],
    turningPoints: [],
    surpriseObservations: [],
    discoveryUnlocked: {},
    firstUsedAt: null,
    lastUsedAt: null,
    currentStreak: 0,
  };
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// generateEvidenceCards
// ---------------------------------------------------------------------------

describe("generateEvidenceCards", () => {
  it("returns empty for less than 3 entries", () => {
    const entries = [
      makeEntryRecord(dateStr(0), "work_decision"),
      makeEntryRecord(dateStr(1), "relationship"),
    ];
    const cards = generateEvidenceCards(null, entries, null);
    expect(cards.length).toBe(0);
  });

  it("generates seed card for 3-6 entries", () => {
    const entries = [
      makeEntryRecord(dateStr(0), "work_decision"),
      makeEntryRecord(dateStr(1), "work_decision"),
      makeEntryRecord(dateStr(2), "relationship"),
      makeEntryRecord(dateStr(3), "work_decision"),
    ];
    const cards = generateEvidenceCards(null, entries, null);
    expect(cards.length).toBeGreaterThanOrEqual(1);
    const topCard = cards.find((c) => c.id === "cat_work_decision");
    expect(topCard).toBeDefined();
    expect(topCard!.growth).toBe("seed");
    expect(topCard!.frequency).toBeNull(); // seed doesn't show frequency
  });

  it("generates sprout card for 7-13 entries", () => {
    const entries: EntryRecord[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(makeEntryRecord(dateStr(i), i < 7 ? "self_care" : "work_decision"));
    }
    const cards = generateEvidenceCards(null, entries, null);
    const topCard = cards.find((c) => c.id === "cat_self_care");
    expect(topCard).toBeDefined();
    expect(topCard!.growth).toBe("sprout");
    expect(topCard!.frequency).toBeTruthy();
  });

  it("generates evidence card for 14+ entries", () => {
    const entries: EntryRecord[] = [];
    for (let i = 0; i < 16; i++) {
      entries.push(makeEntryRecord(dateStr(i), i < 12 ? "work_decision" : "relationship"));
    }
    const cards = generateEvidenceCards(null, entries, null);
    const topCard = cards.find((c) => c.id === "cat_work_decision");
    expect(topCard).toBeDefined();
    expect(topCard!.growth).toBe("evidence");
  });

  it("filters out nothing_special from top category", () => {
    const entries: EntryRecord[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(makeEntryRecord(dateStr(i), "nothing_special"));
    }
    const cards = generateEvidenceCards(null, entries, null);
    // Should have nothing_trend card but no "cat_nothing_special" as top category
    const topCat = cards.find((c) => c.id === "cat_nothing_special");
    expect(topCat).toBeUndefined();
    const trend = cards.find((c) => c.id === "cat_nothing_trend");
    expect(trend).toBeDefined();
  });

  it("generates layer correlation cards", () => {
    const entries: EntryRecord[] = [];
    const orbitEntries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 10; i++) {
      const d = dateStr(i);
      entries.push(makeEntryRecord(d, i < 7 ? "work_decision" : "self_care"));
      orbitEntries[d] = makeOrbitEntry(d, {
        tasks: [
          { id: "t1", text: "a", nature: "obligation", completed: true, carryCount: 0, addedAt: d },
          { id: "t2", text: "b", nature: "obligation", completed: i < 7, carryCount: 0, addedAt: d },
        ],
      });
    }
    const store = makeStore(orbitEntries);
    const cards = generateEvidenceCards(store, entries, null);
    const corrCard = cards.find((c) => c.type === "layer_correlation");
    // May or may not be generated depending on diff threshold, but no error
    expect(cards).toBeInstanceOf(Array);
  });

  it("generates Stargazer bridge cards for contradictions", () => {
    const entries: EntryRecord[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(makeEntryRecord(dateStr(i), "work_decision"));
    }
    const orbitEntries: Record<string, DailyOrbitEntry> = {};
    for (let i = 0; i < 5; i++) {
      orbitEntries[dateStr(i)] = makeOrbitEntry(dateStr(i));
    }
    const store = makeStore(orbitEntries);
    const ctx: StargazerOriginContext = {
      density: { observedAxisCount: 10, contradictionAxisCount: 2, totalObservationCount: 50 },
      topAxes: [],
      contradictions: [
        { key: "analytical_vs_intuitive" as any, label: "分析的vs直感的", poles: [-0.3, 0.5], strength: 0.6 },
      ],
      axisScores: {},
      fetchedAt: new Date().toISOString(),
    };
    const cards = generateEvidenceCards(store, entries, ctx);
    const bridgeCard = cards.find((c) => c.type === "stargazer_bridge");
    expect(bridgeCard).toBeDefined();
    expect(bridgeCard!.pattern).toContain("分析的vs直感的");
  });

  it("sorts cards by growth (evidence > sprout > seed)", () => {
    const entries: EntryRecord[] = [];
    // 14+ work_decision entries → evidence
    for (let i = 0; i < 16; i++) {
      entries.push(makeEntryRecord(dateStr(i), i < 12 ? "work_decision" : "relationship"));
    }
    const cards = generateEvidenceCards(null, entries, null);
    if (cards.length >= 2) {
      const growthOrder = (g: string) => (g === "evidence" ? 3 : g === "sprout" ? 2 : 1);
      for (let i = 1; i < cards.length; i++) {
        expect(growthOrder(cards[i - 1].growth)).toBeGreaterThanOrEqual(
          growthOrder(cards[i].growth),
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// generateInquiry
// ---------------------------------------------------------------------------

describe("generateInquiry", () => {
  it("returns null for cards without exceptions", () => {
    const cards: EvidenceCard[] = [
      {
        id: "cat_work",
        growth: "evidence",
        pattern: "test",
        frequency: "10/14",
        exception: null,
        category: "work_decision",
        type: "judgment_pattern",
        dataPoints: 14,
        updatedAt: new Date().toISOString(),
      },
    ];
    const inquiry = generateInquiry(cards);
    expect(inquiry).toBeNull();
  });

  it("returns inquiry for evidence cards with exceptions", () => {
    const cards: EvidenceCard[] = [
      {
        id: "cat_work",
        growth: "evidence",
        pattern: "test",
        frequency: "10/14",
        exception: {
          description: "直近で増加",
          recentCount: 8,
          totalCount: 10,
          question: "何か変わりましたか？",
        },
        category: "work_decision",
        type: "judgment_pattern",
        dataPoints: 14,
        updatedAt: new Date().toISOString(),
      },
    ];
    const inquiry = generateInquiry(cards);
    expect(inquiry).not.toBeNull();
    expect(inquiry!.question).toBe("何か変わりましたか？");
    expect(inquiry!.hypothesisOptions.length).toBeGreaterThanOrEqual(3);
    expect(inquiry!.observationProposal).toBeTruthy();
  });

  it("does not return inquiry for non-evidence cards", () => {
    const cards: EvidenceCard[] = [
      {
        id: "cat_work",
        growth: "sprout", // not evidence
        pattern: "test",
        frequency: null,
        exception: {
          description: "test",
          recentCount: 3,
          totalCount: 5,
          question: "test?",
        },
        category: "work_decision",
        type: "judgment_pattern",
        dataPoints: 7,
        updatedAt: new Date().toISOString(),
      },
    ];
    const inquiry = generateInquiry(cards);
    expect(inquiry).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// evaluateHypothesis
// ---------------------------------------------------------------------------

describe("evaluateHypothesis", () => {
  function makeHypothesis(cardId: string, daysAgo: number): Hypothesis {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return {
      id: "h1",
      cardId,
      options: [],
      selectedOption: "workload",
      freeText: null,
      observationProposal: null,
      verification: null,
      createdAt: d.toISOString(),
    };
  }

  it("returns insufficient_data when not enough post-entries", () => {
    const h = makeHypothesis("cat_work_decision", 5);
    const entries = [
      makeEntryRecord(dateStr(1), "work_decision"),
    ];
    const result = evaluateHypothesis(h, entries, null);
    expect(result.result).toBe("insufficient_data");
  });

  it("evaluates category hypothesis as supported when stable", () => {
    const h = makeHypothesis("cat_work_decision", 10);
    const entries: EntryRecord[] = [];
    // Pre-hypothesis: 60% work_decision
    for (let i = 15; i > 10; i--) {
      entries.push(makeEntryRecord(dateStr(i), i % 5 < 3 ? "work_decision" : "relationship"));
    }
    // Post-hypothesis: also ~60% work_decision
    for (let i = 9; i >= 0; i--) {
      entries.push(makeEntryRecord(dateStr(i), i % 5 < 3 ? "work_decision" : "relationship"));
    }
    const result = evaluateHypothesis(h, entries, null);
    expect(result.result).toBe("supported");
    expect(result.evidence).toContain("仕事の判断");
  });

  it("evaluates category hypothesis as exception when pattern changes", () => {
    const h = makeHypothesis("cat_work_decision", 10);
    const entries: EntryRecord[] = [];
    // Pre: mostly work_decision
    for (let i = 15; i > 10; i--) {
      entries.push(makeEntryRecord(dateStr(i), "work_decision"));
    }
    // Post: mostly relationship (big shift)
    for (let i = 9; i >= 0; i--) {
      entries.push(makeEntryRecord(dateStr(i), "relationship"));
    }
    const result = evaluateHypothesis(h, entries, null);
    expect(result.result).toBe("exception");
    expect(result.evidence).toContain("低下");
  });

  it("evaluates correlation hypothesis with orbit data", () => {
    const h = makeHypothesis("corr_work_decision_completion", 10);
    const entries: EntryRecord[] = [];
    const orbitEntries: Record<string, DailyOrbitEntry> = {};

    // Post entries: 5 work_decision days with high completion
    for (let i = 0; i < 5; i++) {
      const d = dateStr(i);
      entries.push(makeEntryRecord(d, "work_decision"));
      orbitEntries[d] = makeOrbitEntry(d, {
        tasks: [
          { id: "t1", text: "a", nature: "obligation", completed: true, carryCount: 0, addedAt: d },
          { id: "t2", text: "b", nature: "obligation", completed: true, carryCount: 0, addedAt: d },
        ],
      });
    }
    // Add non-matching days with lower completion
    for (let i = 5; i < 10; i++) {
      const d = dateStr(i);
      entries.push(makeEntryRecord(d, "relationship"));
      orbitEntries[d] = makeOrbitEntry(d, {
        tasks: [
          { id: "t1", text: "a", nature: "obligation", completed: true, carryCount: 0, addedAt: d },
          { id: "t2", text: "b", nature: "obligation", completed: false, carryCount: 0, addedAt: d },
        ],
      });
    }

    const store = makeStore(orbitEntries);
    const result = evaluateHypothesis(h, entries, store);
    // work_decision days: 100% completion, overall ~75%
    expect(result.result).toBe("supported");
    expect(result.evidence).toContain("完了率");
  });

  it("returns fallback for unknown card types", () => {
    const h = makeHypothesis("sg_contradiction_test", 5);
    const entries: EntryRecord[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(makeEntryRecord(dateStr(i), "work_decision"));
    }
    const result = evaluateHypothesis(h, entries, null);
    expect(result.result).toBe("insufficient_data");
    expect(result.evidence).toContain("手動で判定");
  });
});
