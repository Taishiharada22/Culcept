/**
 * Daily Dispatch DD2 — DomainRouter pure function test
 *
 * 検証項目 (CEO 2026-05-15 指定):
 *   1. empty / invalid request fail-closed
 *   2. clear food route
 *   3. clear movie route
 *   4. clear travel route
 *   5. clear activity route
 *   6. schedule route
 *   7. relationship/mediation route
 *   8. ambiguous food + activity
 *   9. ambiguous movie + food chain
 *   10. daily context with time slot
 *   11. fatigue / budget / weather influence
 *   12. progressive narrowing
 *   13. reasonCodes に raw text 含まない
 *   14. deterministic output
 *   15. no runtime wiring
 */

import { describe, expect, it } from "vitest";

import type {
  DailyDomain,
  DailyDomainRequest,
} from "@/lib/coalter/daily/types";
import {
  PROVISIONAL_CONFIDENCE_THRESHOLD,
  ROUTER_VERSION,
  routeDailyDomain,
  type DomainRouterHandoffReason,
  type DomainRouterReasonCode,
  type RouterDispatchTarget,
} from "@/lib/coalter/daily/domainRouter";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

/** Helper: produce a default DailyDomainRequest */
function makeRequest(overrides?: Partial<DailyDomainRequest>): DailyDomainRequest {
  const base: DailyDomainRequest = {
    domain: "food",
    context: {
      timeSlot: "evening",
      targetWindow: "tonight",
      isWeekend: false,
      pairAvailability: "both",
    },
    constraints: {},
    fairnessHints: { recentBias: 0, cooldownDomains: [] },
    routingReason: "explicit_keyword",
    inferRationale: {
      confidence: 0.8,
      signals: ["keyword_food_lexeme"],
      alternates: [],
    },
  };
  return { ...base, ...overrides };
}

// ─────────────────────────────────────────────
// Test 1: invalid request → fail-closed
// ─────────────────────────────────────────────

describe("routeDailyDomain — invalid request", () => {
  it("inferRationale 不在 → unknown / fail_closed", () => {
    const request = makeRequest();
    // simulate missing inferRationale via type assertion (compile-time enforced field、runtime null check 試験)
    const malformed = { ...request, inferRationale: undefined as unknown as DailyDomainRequest["inferRationale"] };
    const out = routeDailyDomain({ request: malformed });

    expect(out.selectedDomain).toBe("unknown" satisfies RouterDispatchTarget);
    expect(out.confidence).toBe(0);
    expect(out.needsNarrowing).toBe(true);
    expect(out.reasonCodes).toContain("fail_closed" satisfies DomainRouterReasonCode);
    expect(out.reasonCodes).toContain("request_invalid" satisfies DomainRouterReasonCode);
    expect(out.missingInputs).toContain("missing_infer_rationale");
    expect(out.routerVersion).toBe(ROUTER_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2-5: clear domain routes
// ─────────────────────────────────────────────

describe("routeDailyDomain — clear food route", () => {
  it("domain=food + high confidence → routed_to_food", () => {
    const out = routeDailyDomain({ request: makeRequest({ domain: "food" }) });

    expect(out.selectedDomain).toBe("food" satisfies RouterDispatchTarget);
    expect(out.needsNarrowing).toBe(false);
    expect(out.reasonCodes).toContain("routed_to_food" satisfies DomainRouterReasonCode);
    expect(out.reasonCodes).toContain("above_confidence_threshold" satisfies DomainRouterReasonCode);
    expect(out.confidence).toBeCloseTo(0.8, 10);
  });
});

describe("routeDailyDomain — clear movie route", () => {
  it("domain=movie + high confidence → routed_to_movie", () => {
    const request = makeRequest({
      domain: "movie",
      inferRationale: {
        confidence: 0.9,
        signals: ["keyword_movie_lexeme"],
        alternates: [],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("movie" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("routed_to_movie" satisfies DomainRouterReasonCode);
  });
});

describe("routeDailyDomain — clear travel route", () => {
  it("domain=travel + high confidence → routed_to_travel", () => {
    const request = makeRequest({
      domain: "travel",
      inferRationale: {
        confidence: 0.85,
        signals: ["keyword_travel_lexeme", "numNights_hint"],
        alternates: [],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("travel" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("routed_to_travel" satisfies DomainRouterReasonCode);
  });
});

describe("routeDailyDomain — clear activity route", () => {
  it("domain=activity + high confidence → routed_to_activity", () => {
    const request = makeRequest({
      domain: "activity",
      inferRationale: {
        confidence: 0.75,
        signals: ["keyword_activity_lexeme", "outdoor_hint"],
        alternates: [],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("activity" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("routed_to_activity" satisfies DomainRouterReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 6: schedule route (handoff)
// ─────────────────────────────────────────────

describe("routeDailyDomain — schedule handoff", () => {
  it("signal に schedule_* prefix → routed_to_schedule + handoffNote", () => {
    const request = makeRequest({
      domain: "activity", // DailyDomain は activity だが、signal は schedule
      inferRationale: {
        confidence: 0.7,
        signals: ["schedule_timing_question"],
        alternates: ["food"],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("schedule" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("routed_to_schedule" satisfies DomainRouterReasonCode);
    expect(out.reasonCodes).toContain("schedule_signal_detected" satisfies DomainRouterReasonCode);
    expect(out.handoffNotes).toHaveLength(1);
    expect(out.handoffNotes[0].fromDomain).toBe("activity" satisfies DailyDomain);
    expect(out.handoffNotes[0].toTarget).toBe("schedule" satisfies RouterDispatchTarget);
    expect(out.handoffNotes[0].reasonCode).toBe(
      "schedule_keyword_in_signals" satisfies DomainRouterHandoffReason,
    );
  });

  it("timing_* prefix も schedule にroute", () => {
    const request = makeRequest({
      inferRationale: { confidence: 0.7, signals: ["timing_window_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });
    expect(out.selectedDomain).toBe("schedule" satisfies RouterDispatchTarget);
  });
});

// ─────────────────────────────────────────────
// Test 7: relationship/mediation route
// ─────────────────────────────────────────────

describe("routeDailyDomain — relationship handoff", () => {
  it("signal に relationship_* prefix → routed_to_relationship + handoffNote", () => {
    const request = makeRequest({
      domain: "food",
      inferRationale: {
        confidence: 0.7,
        signals: ["relationship_mediation_lexeme"],
        alternates: [],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("relationship" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("routed_to_relationship" satisfies DomainRouterReasonCode);
    expect(out.reasonCodes).toContain("relationship_signal_detected" satisfies DomainRouterReasonCode);
    expect(out.handoffNotes).toHaveLength(1);
    expect(out.handoffNotes[0].toTarget).toBe("relationship" satisfies RouterDispatchTarget);
    expect(out.handoffNotes[0].reasonCode).toBe(
      "relationship_keyword_in_signals" satisfies DomainRouterHandoffReason,
    );
  });

  it("talk_about_* prefix も relationship にroute", () => {
    const request = makeRequest({
      inferRationale: { confidence: 0.7, signals: ["talk_about_recent_friction"], alternates: [] },
    });
    const out = routeDailyDomain({ request });
    expect(out.selectedDomain).toBe("relationship" satisfies RouterDispatchTarget);
  });

  it("mediation_* prefix も relationship にroute", () => {
    const request = makeRequest({
      inferRationale: { confidence: 0.7, signals: ["mediation_request_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });
    expect(out.selectedDomain).toBe("relationship" satisfies RouterDispatchTarget);
  });
});

// ─────────────────────────────────────────────
// Test 8-9: ambiguous (alternates present)
// ─────────────────────────────────────────────

describe("routeDailyDomain — ambiguous food + activity", () => {
  it("alternates.length >= 2 + confidence not high enough → needs_narrowing", () => {
    const request = makeRequest({
      domain: "food",
      inferRationale: {
        confidence: 0.55, // slightly above threshold 0.5 but below 0.5+0.3
        signals: ["keyword_food_lexeme"],
        alternates: ["activity", "schedule"],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("needs_narrowing" satisfies RouterDispatchTarget);
    expect(out.needsNarrowing).toBe(true);
    expect(out.reasonCodes).toContain("multiple_alternates_present" satisfies DomainRouterReasonCode);
    expect(out.missingInputs).toContain("ambiguous_alternates");
  });
});

describe("routeDailyDomain — ambiguous movie + food chain", () => {
  it("chainPosition with prevDomain food → chain_continuation", () => {
    const request = makeRequest({
      domain: "movie",
      inferRationale: {
        confidence: 0.85,
        signals: ["keyword_movie_lexeme", "chain_food_to_movie_pattern"],
        alternates: [],
      },
      chainPosition: { index: 1, total: 2, prevDomain: "food" },
      routingReason: "multi_domain_chain",
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("movie" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("chain_continuation" satisfies DomainRouterReasonCode);
    expect(out.reasonCodes).toContain("multi_domain_chain_routing" satisfies DomainRouterReasonCode);
  });

  it("food → travel chain transition は高 cost", () => {
    const request = makeRequest({
      domain: "travel",
      inferRationale: {
        confidence: 0.85,
        signals: ["keyword_travel_lexeme"],
        alternates: [],
      },
      chainPosition: { index: 1, total: 2, prevDomain: "food" },
    });
    const out = routeDailyDomain({ request });

    expect(out.reasonCodes).toContain("chain_transition_cost_high" satisfies DomainRouterReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 10: daily context with time slot
// ─────────────────────────────────────────────

describe("routeDailyDomain — daily context with time slot", () => {
  it("timeSlot=deepnight + domain=activity → narrowing (深夜 outdoor 推奨せず)", () => {
    const request = makeRequest({
      domain: "activity",
      context: {
        timeSlot: "deepnight",
        targetWindow: "tonight",
        isWeekend: false,
        pairAvailability: "both",
      },
      inferRationale: {
        confidence: 0.8,
        signals: ["keyword_activity_lexeme"],
        alternates: [],
      },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("needs_narrowing" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("deepnight_blocked_narrowing" satisfies DomainRouterReasonCode);
    expect(out.reasonCodes).toContain("context_conflict_narrowing" satisfies DomainRouterReasonCode);
  });

  it("timeSlot=evening + domain=activity → 通常 route", () => {
    const request = makeRequest({
      domain: "activity",
      context: {
        timeSlot: "evening",
        targetWindow: "tonight",
        isWeekend: false,
        pairAvailability: "both",
      },
      inferRationale: { confidence: 0.8, signals: ["keyword_activity_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("activity" satisfies RouterDispatchTarget);
    expect(out.needsNarrowing).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 11: fatigue / budget / weather influence
// ─────────────────────────────────────────────

describe("routeDailyDomain — context constraint influence", () => {
  it("energyBudget=1 + domain=activity → narrowing", () => {
    const request = makeRequest({
      domain: "activity",
      constraints: { energyBudget: 1 },
      inferRationale: { confidence: 0.8, signals: ["keyword_activity_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("needs_narrowing" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("energy_fatigue_conflict_narrowing" satisfies DomainRouterReasonCode);
  });

  it("energyBudget=1 + domain=travel → narrowing", () => {
    const request = makeRequest({
      domain: "travel",
      constraints: { energyBudget: 1 },
      inferRationale: { confidence: 0.8, signals: ["keyword_travel_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("needs_narrowing" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("energy_fatigue_conflict_narrowing" satisfies DomainRouterReasonCode);
  });

  it("energyBudget=1 + domain=food → 通常 route (food 自体は high fatigue 不要)", () => {
    const request = makeRequest({
      domain: "food",
      constraints: { energyBudget: 1 },
      inferRationale: { confidence: 0.8, signals: ["keyword_food_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("food" satisfies RouterDispatchTarget);
  });

  it("budgetCeiling / timeWindow は pass-through (router decision に影響しない)", () => {
    const request = makeRequest({
      domain: "food",
      constraints: {
        budgetCeiling: { lo: 5000, hi: 10000, confidence: 0.8 },
        timeWindow: { startISO: "2026-05-15T17:00:00+09:00", endISO: "2026-05-15T21:00:00+09:00" },
      },
      inferRationale: { confidence: 0.8, signals: ["keyword_food_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });

    // budget / timeWindow は router decision に直接影響しない、food 通常 route
    expect(out.selectedDomain).toBe("food" satisfies RouterDispatchTarget);
  });
});

// ─────────────────────────────────────────────
// Test 12: progressive narrowing
// ─────────────────────────────────────────────

describe("routeDailyDomain — progressive narrowing", () => {
  it("low confidence (below threshold) → needs_narrowing", () => {
    const request = makeRequest({
      inferRationale: { confidence: 0.3, signals: ["keyword_food_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request });

    expect(out.selectedDomain).toBe("needs_narrowing" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("below_confidence_threshold" satisfies DomainRouterReasonCode);
    expect(out.missingInputs).toContain("low_confidence");
  });

  it("confidenceThreshold=0.9 で kill switch 級 narrowing", () => {
    const request = makeRequest({
      inferRationale: { confidence: 0.8, signals: ["keyword_food_lexeme"], alternates: [] },
    });
    const out = routeDailyDomain({ request, confidenceThreshold: 0.9 });

    expect(out.selectedDomain).toBe("needs_narrowing" satisfies RouterDispatchTarget);
    expect(out.reasonCodes).toContain("below_confidence_threshold" satisfies DomainRouterReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 13: reasonCodes 構造的検証
// ─────────────────────────────────────────────

describe("routeDailyDomain — reasonCodes 構造的検証 (raw text leakage 防止)", () => {
  it("全 reasonCodes は enum (lower_snake_case) のみ", () => {
    const request = makeRequest({
      domain: "movie",
      inferRationale: {
        confidence: 0.85,
        signals: ["keyword_movie_lexeme", "schedule_irrelevant"],
        alternates: [],
      },
      chainPosition: { index: 1, total: 2, prevDomain: "food" },
      routingReason: "multi_domain_chain",
    });
    const out = routeDailyDomain({ request });

    for (const r of out.reasonCodes) {
      expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(r).not.toMatch(/[぀-ゟ゠-ヿ一-鿿]/);
      expect(r).not.toMatch(/\s/);
    }
    for (const m of out.missingInputs) {
      expect(m).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    for (const h of out.handoffNotes) {
      expect(h.reasonCode).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("signals value (e.g., 'keyword_food_secret_user_input') は output に含まれない", () => {
    const request = makeRequest({
      inferRationale: {
        confidence: 0.8,
        signals: ["keyword_food_secret_user_input"],
        alternates: [],
      },
    });
    const out = routeDailyDomain({ request });
    const outputJson = JSON.stringify(out);
    expect(outputJson).not.toContain("keyword_food_secret_user_input");
  });
});

// ─────────────────────────────────────────────
// Test 14: deterministic
// ─────────────────────────────────────────────

describe("routeDailyDomain — deterministic", () => {
  it("同じ input × 2 回 → 完全一致", () => {
    const request = makeRequest({
      domain: "activity",
      inferRationale: {
        confidence: 0.7,
        signals: ["keyword_activity_lexeme"],
        alternates: ["food"],
      },
    });
    const out1 = routeDailyDomain({ request });
    const out2 = routeDailyDomain({ request });
    expect(out1).toEqual(out2);
  });

  it("100 回連続呼出 完全一致", () => {
    const request = makeRequest();
    const first = routeDailyDomain({ request });
    for (let i = 0; i < 100; i++) {
      const out = routeDailyDomain({ request });
      expect(out).toEqual(first);
    }
  });

  it("PROVISIONAL_CONFIDENCE_THRESHOLD = 0.5 (本 DD2 暫定値)", () => {
    expect(PROVISIONAL_CONFIDENCE_THRESHOLD).toBe(0.5);
  });

  it("ROUTER_VERSION は semver", () => {
    expect(ROUTER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─────────────────────────────────────────────
// Test 15: no runtime wiring
// ─────────────────────────────────────────────

describe("routeDailyDomain — no runtime wiring", () => {
  it("純関数: 副作用なし、JSON serializable", () => {
    const request = makeRequest();
    const out = routeDailyDomain({ request });

    expect(() => JSON.stringify(out)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(out));
    expect(parsed.routerVersion).toBe(ROUTER_VERSION);
  });
});
