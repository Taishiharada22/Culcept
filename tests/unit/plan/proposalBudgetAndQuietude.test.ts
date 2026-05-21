/**
 * Phase 3-J-1c: Entropy Budget + Onboarding Quietude + Theory-of-Mind Pause + TestOverrideContext + DismissLog reader
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1c / §10.2 Smoke 16-25 / §10.5 Smoke 47
 *
 * 検証対象:
 *   - testOverrideContext: EMPTY frozen + type structure
 *   - onboardingQuietude: 3 phase classification + override + limit
 *   - entropyBudget: budget computation + state transitions + override
 *   - userStateInference: 24h window + threshold + override bypass
 *   - dismissLog: filter / count / wasRecentlyDismissed
 *   - production import 禁止 (= grep test)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 14 Cross-day memory (= 7 日 retention)
 *   - Invariant 20 Entropy Budget (= 認知負荷 point)
 *   - Invariant 36 Onboarding Quietude (= 初期 7 日 silent)
 *   - Invariant 38 Test Override Affordance (= production import 禁止)
 *   - Invariant 40 Theory-of-Mind Pause (= 24h dismiss 3+ → 24h pause)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  EMPTY_TEST_OVERRIDE_CONTEXT,
  type TestOverrideContext,
} from "@/lib/plan/proposal/testOverrideContext";
import {
  classifyOnboardingPhase,
  dailyProposalLimitForPhase,
  isProposalAllowed,
  type OnboardingPhase,
} from "@/lib/plan/proposal/onboardingQuietude";
import {
  DEFAULT_DAILY_BUDGET,
  PROPOSAL_LOAD_COST,
  canConsumeBudget,
  computeMaxDailyBudget,
  consumeBudget,
  initEntropyBudgetState,
  type ProposalLoadKind,
} from "@/lib/plan/proposal/entropyBudget";
import {
  inferUserStatePause,
  type DismissEvent,
} from "@/lib/plan/proposal/userStateInference";
import {
  countRecentDismisses,
  filterRecentDismisses,
  wasRecentlyDismissed,
  type DismissLogEntry,
} from "@/lib/plan/proposal/dismissLog";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// testOverrideContext
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TestOverrideContext", () => {
  it("EMPTY_TEST_OVERRIDE_CONTEXT is frozen", () => {
    expect(Object.isFrozen(EMPTY_TEST_OVERRIDE_CONTEXT)).toBe(true);
  });

  it("EMPTY has no overrides set (= production default)", () => {
    expect(EMPTY_TEST_OVERRIDE_CONTEXT.forceOnboardingPhase).toBeUndefined();
    expect(EMPTY_TEST_OVERRIDE_CONTEXT.forceEntropyBudget).toBeUndefined();
    expect(EMPTY_TEST_OVERRIDE_CONTEXT.forceReversibilityThreshold).toBeUndefined();
    expect(EMPTY_TEST_OVERRIDE_CONTEXT.forceRepetitionThreshold).toBeUndefined();
    expect(EMPTY_TEST_OVERRIDE_CONTEXT.bypassColdStartSilence).toBeUndefined();
    expect(EMPTY_TEST_OVERRIDE_CONTEXT.bypassUserStatePause).toBeUndefined();
  });

  it("can be constructed with partial overrides", () => {
    const ctx: TestOverrideContext = {
      forceOnboardingPhase: "normal_30d_plus",
      forceEntropyBudget: 10,
    };
    expect(ctx.forceOnboardingPhase).toBe("normal_30d_plus");
    expect(ctx.forceEntropyBudget).toBe(10);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// onboardingQuietude
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyOnboardingPhase", () => {
  it("Day 0-6 → quietude_0_7d", () => {
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-05-21" })).toBe(
      "quietude_0_7d",
    );
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-05-25" })).toBe(
      "quietude_0_7d",
    );
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-05-27" })).toBe(
      "quietude_0_7d",
    );
  });

  it("Day 7-29 → limited_8_30d", () => {
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-05-28" })).toBe(
      "limited_8_30d",
    );
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-06-15" })).toBe(
      "limited_8_30d",
    );
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-06-19" })).toBe(
      "limited_8_30d",
    );
  });

  it("Day 30+ → normal_30d_plus", () => {
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2026-06-20" })).toBe(
      "normal_30d_plus",
    );
    expect(classifyOnboardingPhase({ firstUseDate: "2026-05-21", now: "2027-01-01" })).toBe(
      "normal_30d_plus",
    );
  });

  it("testOverride.forceOnboardingPhase wins over date calculation", () => {
    // 0 日経過、 でも override で normal を強制
    const phase = classifyOnboardingPhase({
      firstUseDate: "2026-05-21",
      now: "2026-05-21",
      testOverride: { forceOnboardingPhase: "normal_30d_plus" },
    });
    expect(phase).toBe("normal_30d_plus");
  });

  it("invalid ISO returns quietude (= defensive)", () => {
    expect(classifyOnboardingPhase({ firstUseDate: "invalid", now: "2026-05-21" })).toBe(
      "quietude_0_7d",
    );
  });
});

describe("dailyProposalLimitForPhase", () => {
  it("quietude_0_7d → 0", () => {
    expect(dailyProposalLimitForPhase("quietude_0_7d")).toBe(0);
  });

  it("limited_8_30d → 1", () => {
    expect(dailyProposalLimitForPhase("limited_8_30d")).toBe(1);
  });

  it("normal_30d_plus → Infinity", () => {
    expect(dailyProposalLimitForPhase("normal_30d_plus")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("isProposalAllowed", () => {
  it("returns false for quietude", () => {
    expect(isProposalAllowed("quietude_0_7d")).toBe(false);
  });

  it("returns true for limited / normal", () => {
    expect(isProposalAllowed("limited_8_30d")).toBe(true);
    expect(isProposalAllowed("normal_30d_plus")).toBe(true);
  });

  it("all 3 phases covered (= exhaustive)", () => {
    const phases: OnboardingPhase[] = ["quietude_0_7d", "limited_8_30d", "normal_30d_plus"];
    phases.forEach((p) => {
      expect(typeof isProposalAllowed(p)).toBe("boolean");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// entropyBudget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROPOSAL_LOAD_COST", () => {
  it("single = 1pt, modify = 2pt, bulk = 3pt", () => {
    expect(PROPOSAL_LOAD_COST.single).toBe(1);
    expect(PROPOSAL_LOAD_COST.modify).toBe(2);
    expect(PROPOSAL_LOAD_COST.bulk).toBe(3);
  });

  it("table is frozen", () => {
    expect(Object.isFrozen(PROPOSAL_LOAD_COST)).toBe(true);
  });
});

describe("computeMaxDailyBudget", () => {
  it("default budget = 3", () => {
    expect(computeMaxDailyBudget({ recentDismissCount: 0 })).toBe(DEFAULT_DAILY_BUDGET);
    expect(computeMaxDailyBudget({ recentDismissCount: 2 })).toBe(DEFAULT_DAILY_BUDGET);
  });

  it("high dismiss rate (3+) → budget reduced to 2", () => {
    expect(computeMaxDailyBudget({ recentDismissCount: 3 })).toBe(2);
    expect(computeMaxDailyBudget({ recentDismissCount: 10 })).toBe(2);
  });

  it("testOverride.forceEntropyBudget wins", () => {
    expect(
      computeMaxDailyBudget({
        recentDismissCount: 10,
        testOverride: { forceEntropyBudget: 99 },
      }),
    ).toBe(99);

    expect(
      computeMaxDailyBudget({
        recentDismissCount: 0,
        testOverride: { forceEntropyBudget: 0 },
      }),
    ).toBe(0);
  });

  it("forceEntropyBudget = negative is clamped to 0", () => {
    expect(
      computeMaxDailyBudget({
        recentDismissCount: 0,
        testOverride: { forceEntropyBudget: -5 },
      }),
    ).toBe(0);
  });
});

describe("initEntropyBudgetState", () => {
  it("returns spent=0, remaining=max", () => {
    const state = initEntropyBudgetState({ recentDismissCount: 0 });
    expect(state.maxDailyBudget).toBe(3);
    expect(state.spentBudget).toBe(0);
    expect(state.remainingBudget).toBe(3);
  });
});

describe("canConsumeBudget / consumeBudget", () => {
  it("can consume single (1pt) from initial 3pt", () => {
    const state = initEntropyBudgetState({ recentDismissCount: 0 });
    expect(canConsumeBudget(state, "single")).toBe(true);
    const after = consumeBudget(state, "single");
    expect(after.spentBudget).toBe(1);
    expect(after.remainingBudget).toBe(2);
  });

  it("can consume modify (2pt) once", () => {
    const state = initEntropyBudgetState({ recentDismissCount: 0 });
    expect(canConsumeBudget(state, "modify")).toBe(true);
    const after = consumeBudget(state, "modify");
    expect(after.spentBudget).toBe(2);
    expect(after.remainingBudget).toBe(1);
  });

  it("can consume bulk (3pt) exactly once", () => {
    const state = initEntropyBudgetState({ recentDismissCount: 0 });
    expect(canConsumeBudget(state, "bulk")).toBe(true);
    const after = consumeBudget(state, "bulk");
    expect(after.spentBudget).toBe(3);
    expect(after.remainingBudget).toBe(0);
    expect(canConsumeBudget(after, "single")).toBe(false);
  });

  it("cannot consume single + bulk (= 4pt) from 3pt budget", () => {
    let state = initEntropyBudgetState({ recentDismissCount: 0 });
    state = consumeBudget(state, "single");  // spent 1, rem 2
    expect(canConsumeBudget(state, "bulk")).toBe(false);
  });

  it("immutable update (= original state unchanged)", () => {
    const state = initEntropyBudgetState({ recentDismissCount: 0 });
    consumeBudget(state, "single");
    expect(state.spentBudget).toBe(0); // 元 state は不変
  });

  it("all 3 load kinds covered (= exhaustive)", () => {
    const kinds: ProposalLoadKind[] = ["single", "modify", "bulk"];
    kinds.forEach((k) => {
      expect(PROPOSAL_LOAD_COST[k]).toBeGreaterThan(0);
    });
  });
});

describe("entropyBudget + dismiss interaction (= auto-scale)", () => {
  it("3+ recent dismisses → budget 2 → can consume single + single only", () => {
    let state = initEntropyBudgetState({ recentDismissCount: 5 });
    expect(state.maxDailyBudget).toBe(2);
    state = consumeBudget(state, "single"); // 1
    state = consumeBudget(state, "single"); // 2
    expect(canConsumeBudget(state, "single")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// userStateInference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDismissEvent(dismissedAt: string, proposalId = "proposal_x"): DismissEvent {
  return { dismissedAt, proposalId };
}

describe("inferUserStatePause — 24h window", () => {
  it("0 dismisses → not paused", () => {
    const result = inferUserStatePause({
      dismissEvents: [],
      now: "2026-05-21T12:00:00.000Z",
    });
    expect(result.recent24hDismissCount).toBe(0);
    expect(result.isPaused).toBe(false);
  });

  it("2 dismisses → not paused (= threshold not met)", () => {
    const result = inferUserStatePause({
      dismissEvents: [
        buildDismissEvent("2026-05-21T10:00:00.000Z"),
        buildDismissEvent("2026-05-21T11:00:00.000Z"),
      ],
      now: "2026-05-21T12:00:00.000Z",
    });
    expect(result.recent24hDismissCount).toBe(2);
    expect(result.isPaused).toBe(false);
  });

  it("3 dismisses within 24h → paused", () => {
    const result = inferUserStatePause({
      dismissEvents: [
        buildDismissEvent("2026-05-21T08:00:00.000Z"),
        buildDismissEvent("2026-05-21T10:00:00.000Z"),
        buildDismissEvent("2026-05-21T11:00:00.000Z"),
      ],
      now: "2026-05-21T12:00:00.000Z",
    });
    expect(result.recent24hDismissCount).toBe(3);
    expect(result.isPaused).toBe(true);
  });

  it("old dismisses outside 24h → not counted", () => {
    const result = inferUserStatePause({
      dismissEvents: [
        buildDismissEvent("2026-05-19T08:00:00.000Z"), // > 24h ago
        buildDismissEvent("2026-05-19T10:00:00.000Z"),
        buildDismissEvent("2026-05-19T11:00:00.000Z"),
      ],
      now: "2026-05-21T12:00:00.000Z",
    });
    expect(result.recent24hDismissCount).toBe(0);
    expect(result.isPaused).toBe(false);
  });

  it("future dismisses ignored (= defensive)", () => {
    const result = inferUserStatePause({
      dismissEvents: [
        buildDismissEvent("2026-05-22T08:00:00.000Z"), // future
      ],
      now: "2026-05-21T12:00:00.000Z",
    });
    expect(result.recent24hDismissCount).toBe(0);
    expect(result.isPaused).toBe(false);
  });

  it("testOverride.bypassUserStatePause forces isPaused = false", () => {
    const result = inferUserStatePause({
      dismissEvents: [
        buildDismissEvent("2026-05-21T08:00:00.000Z"),
        buildDismissEvent("2026-05-21T10:00:00.000Z"),
        buildDismissEvent("2026-05-21T11:00:00.000Z"),
      ],
      now: "2026-05-21T12:00:00.000Z",
      testOverride: { bypassUserStatePause: true },
    });
    expect(result.recent24hDismissCount).toBe(3);
    expect(result.isPaused).toBe(false);
  });

  it("invalid ISO now → not paused", () => {
    const result = inferUserStatePause({
      dismissEvents: [
        buildDismissEvent("2026-05-21T08:00:00.000Z"),
        buildDismissEvent("2026-05-21T10:00:00.000Z"),
        buildDismissEvent("2026-05-21T11:00:00.000Z"),
      ],
      now: "invalid",
    });
    expect(result.isPaused).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dismissLog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildLogEntry(proposalId: string, dismissedAt: string): DismissLogEntry {
  return { proposalId, reason: "pattern_repeat", dismissedAt };
}

describe("filterRecentDismisses — 7 day retention", () => {
  it("within 7 days included", () => {
    const entries: DismissLogEntry[] = [
      buildLogEntry("p1", "2026-05-15T00:00:00.000Z"),  // 6 days ago
      buildLogEntry("p2", "2026-05-21T00:00:00.000Z"),  // 0 days ago
    ];
    const recent = filterRecentDismisses(entries, "2026-05-21T12:00:00.000Z");
    expect(recent).toHaveLength(2);
  });

  it("older than 7 days excluded", () => {
    const entries: DismissLogEntry[] = [
      buildLogEntry("p1", "2026-05-10T00:00:00.000Z"),  // 11 days ago
      buildLogEntry("p2", "2026-05-13T00:00:00.000Z"),  // 8 days ago
    ];
    const recent = filterRecentDismisses(entries, "2026-05-21T12:00:00.000Z");
    expect(recent).toHaveLength(0);
  });

  it("invalid ISO excluded", () => {
    const entries: DismissLogEntry[] = [
      buildLogEntry("p1", "not-a-date"),
      buildLogEntry("p2", "2026-05-21T00:00:00.000Z"),
    ];
    const recent = filterRecentDismisses(entries, "2026-05-21T12:00:00.000Z");
    expect(recent).toHaveLength(1);
    expect(recent[0]!.proposalId).toBe("p2");
  });

  it("future events excluded", () => {
    const entries: DismissLogEntry[] = [
      buildLogEntry("p1", "2026-06-01T00:00:00.000Z"),  // future
    ];
    const recent = filterRecentDismisses(entries, "2026-05-21T12:00:00.000Z");
    expect(recent).toHaveLength(0);
  });

  it("custom retentionDays = 1 narrows window", () => {
    const entries: DismissLogEntry[] = [
      buildLogEntry("p1", "2026-05-21T00:00:00.000Z"),
      buildLogEntry("p2", "2026-05-19T00:00:00.000Z"),
    ];
    const recent = filterRecentDismisses(entries, "2026-05-21T12:00:00.000Z", 1);
    expect(recent.map((e) => e.proposalId)).toEqual(["p1"]);
  });
});

describe("wasRecentlyDismissed", () => {
  it("returns true for known recent proposal", () => {
    const entries = [buildLogEntry("p1", "2026-05-21T00:00:00.000Z")];
    expect(wasRecentlyDismissed(entries, "p1", "2026-05-21T12:00:00.000Z")).toBe(true);
  });

  it("returns false for unknown proposal", () => {
    const entries = [buildLogEntry("p1", "2026-05-21T00:00:00.000Z")];
    expect(wasRecentlyDismissed(entries, "p2", "2026-05-21T12:00:00.000Z")).toBe(false);
  });

  it("returns false for old proposal (> 7d)", () => {
    const entries = [buildLogEntry("p1", "2026-05-10T00:00:00.000Z")];
    expect(wasRecentlyDismissed(entries, "p1", "2026-05-21T12:00:00.000Z")).toBe(false);
  });
});

describe("countRecentDismisses", () => {
  it("counts recent dismisses", () => {
    const entries = [
      buildLogEntry("p1", "2026-05-15T00:00:00.000Z"),
      buildLogEntry("p2", "2026-05-21T00:00:00.000Z"),
      buildLogEntry("p3", "2026-05-10T00:00:00.000Z"),  // outside 7d
    ];
    expect(countRecentDismisses(entries, "2026-05-21T12:00:00.000Z")).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL: production import 禁止 (= grep test、 Invariant 38)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("testOverrideContext — production import 禁止", () => {
  const FORBIDDEN_DIRS = ["app", "components"];
  const TEST_OVERRIDE_IMPORT_PATTERNS = [
    /from\s+["']@\/lib\/plan\/proposal\/testOverrideContext["']/,
    /from\s+["']\.\.?\/.*testOverrideContext["']/,
    /require\(["']@\/lib\/plan\/proposal\/testOverrideContext["']\)/,
  ];

  function scanDirForViolations(dir: string): { file: string; line: number; content: string }[] {
    const violations: { file: string; line: number; content: string }[] = [];
    function recur(p: string) {
      let entries;
      try {
        entries = readdirSync(p);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
        const full = join(p, entry);
        let stats;
        try {
          stats = statSync(full);
        } catch {
          continue;
        }
        if (stats.isDirectory()) {
          recur(full);
        } else if (stats.isFile() && /\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
          let content;
          try {
            content = readFileSync(full, "utf-8");
          } catch {
            continue;
          }
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            for (const pattern of TEST_OVERRIDE_IMPORT_PATTERNS) {
              if (pattern.test(line)) {
                violations.push({ file: full, line: idx + 1, content: line.trim() });
              }
            }
          });
        }
      }
    }
    recur(dir);
    return violations;
  }

  for (const dir of FORBIDDEN_DIRS) {
    it(`no testOverrideContext import in ${dir}/`, () => {
      const violations = scanDirForViolations(dir);
      if (violations.length > 0) {
        const msg = violations
          .map((v) => `${v.file}:${v.line}: ${v.content}`)
          .join("\n");
        throw new Error(
          `[TestOverrideContext Production Import Violation] (Invariant 38):\n${msg}`,
        );
      }
    });
  }

  it("tests/ may import testOverrideContext (= permitted)", () => {
    // 本 test file 自体が import している事実が permission の 1 例
    expect(EMPTY_TEST_OVERRIDE_CONTEXT).toBeDefined();
  });
});
