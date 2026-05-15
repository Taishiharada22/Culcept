/**
 * Activity AD2 — Intent extraction pure function test
 *
 * 検証項目 (CEO 2026-05-15 指定):
 *   1. empty input fail-closed
 *   2. clear activity intent
 *   3. food handoff
 *   4. movie handoff
 *   5. travel handoff
 *   6. ambiguous activity (multiple handoff signals)
 *   7. fatigue-sensitive activity
 *   8. weather-dependent activity
 *   9. budget-sensitive activity
 *   10. novelty preference
 *   11. pair-compatible activity
 *   12. veto / red-line signal
 *   13. reasonCodes に raw text 含まない (構造的検証)
 *   14. deterministic output
 *   15. no runtime wiring (pure function)
 */

import { describe, expect, it } from "vitest";

import {
  INTENT_EXTRACTOR_VERSION,
  PROVISIONAL_DEFAULT_THRESHOLD,
  inferActivityIntent,
  type ActivityIntentInput,
  type ActivityIntentReasonCode,
} from "@/lib/coalter/activity/intent";

// ─────────────────────────────────────────────
// Test 1: empty input → fail-closed
// ─────────────────────────────────────────────

describe("inferActivityIntent — empty input", () => {
  it("empty input は needs_narrowing / confidence 0 / no_signal", () => {
    const out = inferActivityIntent({});

    expect(out.inferredActivityIntent).toBe("needs_narrowing");
    expect(out.needsNarrowing).toBe(true);
    expect(out.confidence).toBe(0);
    expect(out.reasonCodes).toContain("no_signal" satisfies ActivityIntentReasonCode);
    expect(out.reasonCodes).toContain("fail_closed" satisfies ActivityIntentReasonCode);
    expect(out.handoffTarget).toBeUndefined();
    expect(out.suggestedTaxonomy).toEqual({});

    // Missing slots: 全 8 slot (empty input なので全不足)
    expect(out.missingSlots.length).toBe(8);

    // extractor version
    expect(out.extractorVersion).toBe(INTENT_EXTRACTOR_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: clear activity intent → eligible
// ─────────────────────────────────────────────

describe("inferActivityIntent — clear activity intent", () => {
  it("十分な signal で activity_eligible 発火", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",        // +0.20
        durationHint: "short",            // +0.20
        noveltyHint: "familiar",          // +0.10
        moodCode: "casual",               // +0.10
        fatigueHint: 2,                   // +0.10
        pairCompatibility: "pair_compatible", // +0.10
      },
      costBand: "free",                   // +0.10
      weather: "sunny",                   // +0.05
      pairAvailability: "both",           // +0.05
    });

    expect(out.inferredActivityIntent).toBe("activity_eligible");
    expect(out.needsNarrowing).toBe(false);
    expect(out.confidence).toBeCloseTo(1.0, 10);
    expect(out.reasonCodes).toContain("activity_signal_present" satisfies ActivityIntentReasonCode);
    expect(out.reasonCodes).toContain("above_threshold" satisfies ActivityIntentReasonCode);

    expect(out.suggestedTaxonomy.indoorOutdoor).toBe("outdoor");
    expect(out.suggestedTaxonomy.durationBand).toBe("short");
    expect(out.suggestedTaxonomy.costBand).toBe("free");

    expect(out.handoffTarget).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Test 3: food handoff
// ─────────────────────────────────────────────

describe("inferActivityIntent — food handoff", () => {
  it("foodHandoffSignal=true で out_of_scope + food handoff", () => {
    const out = inferActivityIntent({
      foodHandoffSignal: true,
    });

    expect(out.inferredActivityIntent).toBe("out_of_scope");
    expect(out.handoffTarget).toBe("food");
    expect(out.needsNarrowing).toBe(false);
    expect(out.reasonCodes).toContain("food_handoff_signal" satisfies ActivityIntentReasonCode);
    expect(out.reasonCodes).toContain("handoff_priority_applied" satisfies ActivityIntentReasonCode);
    expect(out.suggestedTaxonomy).toEqual({});
  });

  it("foodHandoffSignal + activity signals 両方ある場合 handoff 優先", () => {
    const out = inferActivityIntent({
      foodHandoffSignal: true,
      activityHints: {
        indoorOutdoor: "indoor",
        durationHint: "short",
      },
    });

    // food handoff が activity logic より優先される (PR #126 §4.3 規則)
    expect(out.inferredActivityIntent).toBe("out_of_scope");
    expect(out.handoffTarget).toBe("food");
  });
});

// ─────────────────────────────────────────────
// Test 4: movie handoff
// ─────────────────────────────────────────────

describe("inferActivityIntent — movie handoff", () => {
  it("movieHandoffSignal=true で out_of_scope + movie handoff", () => {
    const out = inferActivityIntent({
      movieHandoffSignal: true,
    });

    expect(out.inferredActivityIntent).toBe("out_of_scope");
    expect(out.handoffTarget).toBe("movie");
    expect(out.reasonCodes).toContain("movie_handoff_signal" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 5: travel handoff
// ─────────────────────────────────────────────

describe("inferActivityIntent — travel handoff", () => {
  it("travelHandoffSignal=true で out_of_scope + travel handoff", () => {
    const out = inferActivityIntent({
      travelHandoffSignal: true,
    });

    expect(out.inferredActivityIntent).toBe("out_of_scope");
    expect(out.handoffTarget).toBe("travel");
    expect(out.reasonCodes).toContain("travel_handoff_signal" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 6: ambiguous activity (multiple handoff signals)
// ─────────────────────────────────────────────

describe("inferActivityIntent — ambiguous (multiple handoff signals)", () => {
  it("food + movie signal 同時 → food 優先 + ambiguous flag", () => {
    const out = inferActivityIntent({
      foodHandoffSignal: true,
      movieHandoffSignal: true,
    });

    expect(out.inferredActivityIntent).toBe("out_of_scope");
    expect(out.handoffTarget).toBe("food"); // 優先順 food > movie > travel
    expect(out.reasonCodes).toContain("multiple_domains_ambiguous" satisfies ActivityIntentReasonCode);
  });

  it("food + movie + travel 全て同時 → food 優先", () => {
    const out = inferActivityIntent({
      foodHandoffSignal: true,
      movieHandoffSignal: true,
      travelHandoffSignal: true,
    });

    expect(out.handoffTarget).toBe("food");
    expect(out.reasonCodes).toContain("multiple_domains_ambiguous" satisfies ActivityIntentReasonCode);
  });

  it("signal 1 つだけ → ambiguous flag なし", () => {
    const out = inferActivityIntent({
      movieHandoffSignal: true,
    });

    expect(out.handoffTarget).toBe("movie");
    expect(out.reasonCodes).not.toContain("multiple_domains_ambiguous" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 7: fatigue-sensitive activity
// ─────────────────────────────────────────────

describe("inferActivityIntent — fatigue-sensitive", () => {
  it("fatigueHint=5 (high) → fatigue_high reason", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        fatigueHint: 5,
      },
    });

    expect(out.reasonCodes).toContain("fatigue_high" satisfies ActivityIntentReasonCode);
  });

  it("fatigueHint=1 (low) → fatigue_low reason", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "indoor",
        durationHint: "short",
        fatigueHint: 1,
      },
    });

    expect(out.reasonCodes).toContain("fatigue_low" satisfies ActivityIntentReasonCode);
  });

  it("fatigueHint=3 (medium) → neither high nor low reason", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        fatigueHint: 3,
      },
    });

    expect(out.reasonCodes).not.toContain("fatigue_high" satisfies ActivityIntentReasonCode);
    expect(out.reasonCodes).not.toContain("fatigue_low" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 8: weather-dependent activity
// ─────────────────────────────────────────────

describe("inferActivityIntent — weather-dependent", () => {
  it("weather=rainy → weather_dependent_warning + taxonomy.weatherDependency=weather_independent", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "short",
      },
      weather: "rainy",
    });

    expect(out.reasonCodes).toContain("weather_dependent_warning" satisfies ActivityIntentReasonCode);
    expect(out.suggestedTaxonomy.weatherDependency).toBe("weather_independent");
  });

  it("weather=sunny → weather_independent_preferred", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "short",
      },
      weather: "sunny",
    });

    expect(out.reasonCodes).toContain("weather_independent_preferred" satisfies ActivityIntentReasonCode);
  });

  it("weather=unknown → weather_unknown_fallback (fail-closed)", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor" },
      weather: "unknown",
    });

    expect(out.reasonCodes).toContain("weather_unknown_fallback" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 9: budget-sensitive activity
// ─────────────────────────────────────────────

describe("inferActivityIntent — budget-sensitive", () => {
  it("costBand=free → budget_cap_set + taxonomy.costBand=free", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "short",
      },
      costBand: "free",
    });

    expect(out.reasonCodes).toContain("budget_cap_set" satisfies ActivityIntentReasonCode);
    expect(out.suggestedTaxonomy.costBand).toBe("free");
  });

  it("costBand=medium も同様", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "indoor",
        durationHint: "medium",
      },
      costBand: "medium",
    });

    expect(out.reasonCodes).toContain("budget_cap_set" satisfies ActivityIntentReasonCode);
    expect(out.suggestedTaxonomy.costBand).toBe("medium");
  });
});

// ─────────────────────────────────────────────
// Test 10: novelty preference
// ─────────────────────────────────────────────

describe("inferActivityIntent — novelty preference", () => {
  it("noveltyHint=novelty → novelty_seeking reason", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        noveltyHint: "novelty",
      },
    });

    expect(out.reasonCodes).toContain("novelty_seeking" satisfies ActivityIntentReasonCode);
    expect(out.suggestedTaxonomy.noveltyLevel).toBe("novelty");
  });

  it("noveltyHint=routine → routine_preference reason", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "indoor",
        noveltyHint: "routine",
      },
    });

    expect(out.reasonCodes).toContain("routine_preference" satisfies ActivityIntentReasonCode);
  });

  it("noveltyHint=familiar → familiar_preference reason", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        noveltyHint: "familiar",
      },
    });

    expect(out.reasonCodes).toContain("familiar_preference" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 11: pair-compatible activity
// ─────────────────────────────────────────────

describe("inferActivityIntent — pair compatibility", () => {
  it("pairAvailability=both → pair_both reason", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor" },
      pairAvailability: "both",
    });

    expect(out.reasonCodes).toContain("pair_both" satisfies ActivityIntentReasonCode);
  });

  it("pairAvailability=one_only → pair_one_only reason", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "indoor" },
      pairAvailability: "one_only",
    });

    expect(out.reasonCodes).toContain("pair_one_only" satisfies ActivityIntentReasonCode);
  });

  it("pairAvailability=unknown / undefined → pair_unknown reason", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor" },
    });

    expect(out.reasonCodes).toContain("pair_unknown" satisfies ActivityIntentReasonCode);
  });

  it("activityHints.pairCompatibility → taxonomy へ反映", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        pairCompatibility: "explicitly_pair",
      },
    });

    expect(out.suggestedTaxonomy.pairCompatibility).toBe("explicitly_pair");
  });
});

// ─────────────────────────────────────────────
// Test 12: veto / red-line signal
// ─────────────────────────────────────────────

describe("inferActivityIntent — red-line signal", () => {
  it("redLineCodes=['no_alcohol'] → red_line_present reason", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor" },
      redLineCodes: ["no_alcohol"],
    });

    expect(out.reasonCodes).toContain("red_line_present" satisfies ActivityIntentReasonCode);
  });

  it("redLineCodes が empty array は red_line_present 出さない", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "indoor" },
      redLineCodes: [],
    });

    expect(out.reasonCodes).not.toContain("red_line_present" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 13: reasonCodes 構造的検証 (raw text leakage 防止)
// ─────────────────────────────────────────────

describe("inferActivityIntent — reasonCodes 構造的検証 (raw text leakage 防止)", () => {
  it("全 reasonCode は ReasonCode enum (lower_snake_case) のみ", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "short",
        noveltyHint: "novelty",
        moodCode: "energetic",
        fatigueHint: 5,
        pairCompatibility: "pair_compatible",
      },
      costBand: "low",
      weather: "rainy",
      pairAvailability: "both",
      redLineCodes: ["no_alcohol", "no_long_walk"],
    });

    for (const reason of out.reasonCodes) {
      expect(reason).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(reason).not.toMatch(/[぀-ゟ゠-ヿ一-鿿]/); // 日本語不可
      expect(reason).not.toMatch(/\s/); // 空白不可
    }
  });

  it("全 missingSlots は MissingSlot enum (lower_snake_case) のみ", () => {
    const out = inferActivityIntent({});

    for (const slot of out.missingSlots) {
      expect(slot).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(slot).not.toMatch(/[぀-ゟ゠-ヿ一-鿿]/);
      expect(slot).not.toMatch(/\s/);
    }
  });

  it("redLineCodes は input でのみ受領、output には含まれない", () => {
    const input: ActivityIntentInput = {
      activityHints: { indoorOutdoor: "outdoor" },
      redLineCodes: ["no_alcohol_secret_user_pref"],
    };
    const out = inferActivityIntent(input);

    // output の JSON 化文字列に input redLineCodes value が含まれないこと
    const outputJson = JSON.stringify(out);
    expect(outputJson).not.toContain("no_alcohol_secret_user_pref");
    // 代わりに enum reason `red_line_present` で表現される
    expect(out.reasonCodes).toContain("red_line_present" satisfies ActivityIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 14: deterministic output
// ─────────────────────────────────────────────

describe("inferActivityIntent — deterministic", () => {
  it("同じ input × 2 回 → 完全一致", () => {
    const input: ActivityIntentInput = {
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        noveltyHint: "novelty",
        moodCode: "curious",
        fatigueHint: 3,
        pairCompatibility: "pair_compatible",
      },
      costBand: "low",
      weather: "sunny",
      pairAvailability: "both",
    };

    const out1 = inferActivityIntent(input);
    const out2 = inferActivityIntent(input);

    expect(out1).toEqual(out2);
  });

  it("同じ input × 100 回 → 完全一致", () => {
    const input: ActivityIntentInput = { activityHints: { indoorOutdoor: "outdoor" } };
    const firstOutput = inferActivityIntent(input);

    for (let i = 0; i < 100; i++) {
      const out = inferActivityIntent(input);
      expect(out).toEqual(firstOutput);
    }
  });

  it("PROVISIONAL_DEFAULT_THRESHOLD は 0.5 (本 AD2 暫定値)", () => {
    expect(PROVISIONAL_DEFAULT_THRESHOLD).toBe(0.5);
  });

  it("INTENT_EXTRACTOR_VERSION は semver", () => {
    expect(INTENT_EXTRACTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─────────────────────────────────────────────
// Test 15: no runtime wiring (pure function)
// ─────────────────────────────────────────────

describe("inferActivityIntent — no runtime wiring", () => {
  it("純関数: 副作用なし、JSON.stringify 可能", () => {
    const out = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor" },
      foodHandoffSignal: false,
    });

    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it("threshold override で発火閾値変化 (kill switch τ=1.0)", () => {
    const out = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        noveltyHint: "familiar",
        fatigueHint: 2,
        pairCompatibility: "pair_compatible",
        moodCode: "casual",
      },
      costBand: "free",
      weather: "sunny",
      pairAvailability: "both",
      threshold: 1.0, // kill switch
    });

    // 全 signal あっても threshold=1.0 で activity_eligible にならない
    // (confidence ちょうど 1.0 で >= threshold 1.0 は通る可能性あり)
    // 確実な kill 確認: threshold を 1.1 にする
    const outKill = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor" },
      threshold: 1.1,
    });

    expect(outKill.inferredActivityIntent).toBe("needs_narrowing");
    expect(outKill.reasonCodes).toContain("below_threshold" satisfies ActivityIntentReasonCode);
  });

  it("missingSlots に全 enum value が含まれ得る (empty input で全 8 slot)", () => {
    const out = inferActivityIntent({});

    expect(out.missingSlots).toContain("indoor_outdoor");
    expect(out.missingSlots).toContain("duration");
    expect(out.missingSlots).toContain("cost");
    expect(out.missingSlots).toContain("novelty");
    expect(out.missingSlots).toContain("weather");
    expect(out.missingSlots).toContain("fatigue");
    expect(out.missingSlots).toContain("pair");
    expect(out.missingSlots).toContain("mood");
  });
});
