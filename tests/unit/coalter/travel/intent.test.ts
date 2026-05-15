/**
 * CoAlter Travel Domain — Intent / Slot Extraction Tests (T2 phase)
 *
 * 正本:
 *   - lib/coalter/travel/intent.ts (本 PR T2)
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124)
 *
 * 16 test category × 32 individual tests:
 *   1. empty input fail-closed
 *   2. clear 1 泊国内 intent
 *   3. clear 2 泊国内 intent
 *   4. day trip clear (activity handoff)
 *   5. day trip extended (travel-light)
 *   6. overseas signal unsupported
 *   7. arbitrary long unsupported / 3 泊以上 unsupported
 *   8. destination missing
 *   9. duration missing
 *   10. budget sensitivity (3 sub: tight / moderate / ample)
 *   11. fatigue sensitivity (3 sub: transit / onSite / both + overnight floor warning)
 *   12. pair constraint (3 sub: together_all_time / flexible_split / unknown)
 *   13. weather / season signal (4 sub: weather + seasonal + typhoon + combo)
 *   14. intentReadiness 4 階層 (vague/exploratory/actionable/immediate)
 *   15. purpose signal (3 sub: relax / discover / celebrate)
 *   16. dayTripBoundary 3 sub (clear/extended/overnight_required)
 *   17. ambiguous travel vs activity handoff
 *   18. reasonCodes 構造的検証 (raw text 不入)
 *   19. deterministic (100 回連続呼出)
 *   20. no runtime wiring (JSON serializable + boundary)
 */

import { describe, expect, it } from "vitest";
import {
  inferTravelIntent,
  PROVISIONAL_DEFAULT_THRESHOLD,
  PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR,
  PROVISIONAL_OVERNIGHT_BUDGET_FLOOR_JPY,
  TRAVEL_INTENT_EXTRACTOR_VERSION,
  type TravelIntentInput,
  type TravelIntentOutput,
  type TravelIntentReasonCode,
  type TravelIntentMissingSlot,
} from "../../../../lib/coalter/travel/intent";

// ─────────────────────────────────────────────
// Helper: full hint input (close to high confidence)
// ─────────────────────────────────────────────

function makeFullInput(overrides: Partial<TravelIntentInput["travelHints"]> = {}): TravelIntentInput {
  return {
    travelHints: {
      destinationHint: "domestic_kanto",
      durationHint: "one_night",
      budgetHint: "moderate",
      transitFatigueHint: 3,
      onSiteFatigueHint: 3,
      purposeHint: "relax_recharge",
      seasonalHint: "off_season",
      weatherForecastHint: "clear",
      pairTogethernessHint: "together_all_time",
      intentReadinessHint: "actionable_planning",
      dayTripBoundaryHint: "overnight_required",
      ...overrides,
    },
  };
}

// ─────────────────────────────────────────────
// Test 1: empty input fail-closed
// ─────────────────────────────────────────────

describe("inferTravelIntent — empty input fail-closed", () => {
  it("全 input undefined → fail-closed + unclear_or_narrowing", () => {
    const out = inferTravelIntent({});
    expect(out.inferredTravelIntent).toBe("needs_narrowing");
    expect(out.travelScope).toBe("unclear_or_narrowing");
    expect(out.needsNarrowing).toBe(true);
    expect(out.confidence).toBe(0);
    expect(out.reasonCodes).toContain("no_signal" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("fail_closed" satisfies TravelIntentReasonCode);
    expect(out.missingSlots.length).toBeGreaterThan(0);
    expect(out.intentVersion).toBe(TRAVEL_INTENT_EXTRACTOR_VERSION);
  });

  it("travelHints={} → fail-closed", () => {
    const out = inferTravelIntent({ travelHints: {} });
    expect(out.inferredTravelIntent).toBe("needs_narrowing");
    expect(out.confidence).toBe(0);
    expect(out.reasonCodes).toContain("no_signal" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 2: clear 1 泊国内 intent
// ─────────────────────────────────────────────

describe("inferTravelIntent — clear 1 泊国内", () => {
  it("destination=domestic_kanto + duration=one_night + budget=moderate + 揃った signal → travel_eligible", () => {
    const out = inferTravelIntent(makeFullInput());
    expect(out.inferredTravelIntent).toBe("travel_eligible");
    expect(out.travelScope).toBe("overnight_one_night");
    expect(out.needsNarrowing).toBe(false);
    expect(out.confidence).toBeGreaterThanOrEqual(PROVISIONAL_DEFAULT_THRESHOLD);
    expect(out.reasonCodes).toContain("destination_domestic_specified" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("duration_one_night" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("budget_moderate" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("above_threshold" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("duration_one_night_inferred");
  });
});

// ─────────────────────────────────────────────
// Test 3: clear 2 泊国内 intent
// ─────────────────────────────────────────────

describe("inferTravelIntent — clear 2 泊国内", () => {
  it("duration=two_nights + 揃った signal → overnight_two_nights", () => {
    const out = inferTravelIntent(makeFullInput({ durationHint: "two_nights" }));
    expect(out.inferredTravelIntent).toBe("travel_eligible");
    expect(out.travelScope).toBe("overnight_two_nights");
    expect(out.reasonCodes).toContain("duration_two_nights" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("duration_two_nights_inferred");
  });
});

// ─────────────────────────────────────────────
// Test 4: day trip clear (activity handoff)
// ─────────────────────────────────────────────

describe("inferTravelIntent — day trip clear → activity handoff", () => {
  it("duration=day_trip + dayTripBoundary=clear_day_trip → out_of_scope_short + activity handoff", () => {
    const out = inferTravelIntent(
      makeFullInput({ durationHint: "day_trip", dayTripBoundaryHint: "clear_day_trip" }),
    );
    expect(out.inferredTravelIntent).toBe("out_of_scope_handoff");
    expect(out.travelScope).toBe("out_of_scope_short");
    expect(out.handoffTarget).toBe("activity");
    expect(out.reasonCodes).toContain("day_trip_boundary_clear" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("activity_handoff_signal" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 5: day trip extended (travel-light)
// ─────────────────────────────────────────────

describe("inferTravelIntent — day trip extended → travel-light scope", () => {
  it("duration=day_trip + dayTripBoundary=extended_day_trip → day_trip_excursion", () => {
    const out = inferTravelIntent(
      makeFullInput({ durationHint: "day_trip", dayTripBoundaryHint: "extended_day_trip" }),
    );
    expect(out.travelScope).toBe("day_trip_excursion");
    expect(out.reasonCodes).toContain("day_trip_boundary_extended" satisfies TravelIntentReasonCode);
  });

  it("duration=day_trip + dayTripBoundary=overnight_required → day_trip_excursion (帰宅困難)", () => {
    const out = inferTravelIntent(
      makeFullInput({ durationHint: "day_trip", dayTripBoundaryHint: "overnight_required" }),
    );
    expect(out.travelScope).toBe("day_trip_excursion");
    expect(out.reasonCodes).toContain("day_trip_boundary_overnight_required" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 6: overseas signal unsupported
// ─────────────────────────────────────────────

describe("inferTravelIntent — overseas signal unsupported", () => {
  it("destination=overseas → unsupported_overseas + fail-closed", () => {
    const out = inferTravelIntent(makeFullInput({ destinationHint: "overseas" }));
    expect(out.inferredTravelIntent).toBe("unsupported_future");
    expect(out.travelScope).toBe("unsupported_overseas");
    expect(out.handoffTarget).toBe("future_scope");
    expect(out.reasonCodes).toContain("destination_overseas_unsupported" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("unsupported_future_scope" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("fail_closed" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 7: arbitrary long / 3 泊以上 unsupported
// ─────────────────────────────────────────────

describe("inferTravelIntent — arbitrary long / 3 泊以上 unsupported", () => {
  it("duration=three_or_more_nights → unsupported_extended", () => {
    const out = inferTravelIntent(makeFullInput({ durationHint: "three_or_more_nights" }));
    expect(out.inferredTravelIntent).toBe("unsupported_future");
    expect(out.travelScope).toBe("unsupported_extended");
    expect(out.reasonCodes).toContain("duration_three_or_more_unsupported" satisfies TravelIntentReasonCode);
  });

  it("duration=arbitrary_long → unsupported_extended", () => {
    const out = inferTravelIntent(makeFullInput({ durationHint: "arbitrary_long" }));
    expect(out.inferredTravelIntent).toBe("unsupported_future");
    expect(out.travelScope).toBe("unsupported_extended");
    expect(out.reasonCodes).toContain("duration_arbitrary_long_unsupported" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 8: destination missing
// ─────────────────────────────────────────────

describe("inferTravelIntent — destination missing", () => {
  it("destination=unknown + 他は揃った → narrowing + missingSlots include 'destination'", () => {
    const out = inferTravelIntent(makeFullInput({ destinationHint: "unknown" }));
    expect(out.needsNarrowing).toBe(true);
    expect(out.missingSlots).toContain("destination" satisfies TravelIntentMissingSlot);
    expect(out.reasonCodes).toContain("destination_unknown" satisfies TravelIntentReasonCode);
  });

  it("destinationHint 完全不在 → missingSlots include 'destination'", () => {
    const out = inferTravelIntent({
      travelHints: { durationHint: "one_night", budgetHint: "moderate" },
    });
    expect(out.missingSlots).toContain("destination" satisfies TravelIntentMissingSlot);
  });
});

// ─────────────────────────────────────────────
// Test 9: duration missing
// ─────────────────────────────────────────────

describe("inferTravelIntent — duration missing", () => {
  it("duration=unknown → unclear_or_narrowing + missingSlots include 'duration'", () => {
    const out = inferTravelIntent(makeFullInput({ durationHint: "unknown" }));
    expect(out.travelScope).toBe("unclear_or_narrowing");
    expect(out.missingSlots).toContain("duration" satisfies TravelIntentMissingSlot);
    expect(out.reasonCodes).toContain("duration_unknown" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 10: budget sensitivity (3 sub)
// ─────────────────────────────────────────────

describe("inferTravelIntent — budget sensitivity", () => {
  it("budget=tight + 1 泊以上 → budget_floor_warning", () => {
    const out = inferTravelIntent(makeFullInput({ budgetHint: "tight" }));
    expect(out.reasonCodes).toContain("budget_tight" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("budget_floor_warning" satisfies TravelIntentReasonCode);
  });

  it("budget=moderate → budget_moderate reason、warning なし", () => {
    const out = inferTravelIntent(makeFullInput({ budgetHint: "moderate" }));
    expect(out.reasonCodes).toContain("budget_moderate" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).not.toContain("budget_floor_warning" satisfies TravelIntentReasonCode);
  });

  it("budget=ample → budget_ample reason", () => {
    const out = inferTravelIntent(makeFullInput({ budgetHint: "ample" }));
    expect(out.reasonCodes).toContain("budget_ample" satisfies TravelIntentReasonCode);
  });

  it("budget=unbounded → budget_unbounded reason", () => {
    const out = inferTravelIntent(makeFullInput({ budgetHint: "unbounded" }));
    expect(out.reasonCodes).toContain("budget_unbounded" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 11: fatigue sensitivity (transit vs onSite 分離 + floor warning)
// ─────────────────────────────────────────────

describe("inferTravelIntent — fatigue sensitivity (transit vs onSite)", () => {
  it("transit fatigue 1 + overnight → fatigue_overnight_floor_warning (移動軽すぎ)", () => {
    const out = inferTravelIntent(makeFullInput({ transitFatigueHint: 1 }));
    expect(out.reasonCodes).toContain("fatigue_transit_specified" satisfies TravelIntentReasonCode);
    expect(out.reasonCodes).toContain("fatigue_overnight_floor_warning" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("fatigue_floor_warning");
  });

  it("transit fatigue 3 + overnight → warning なし (floor 値以上)", () => {
    const out = inferTravelIntent(makeFullInput({ transitFatigueHint: PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR }));
    expect(out.reasonCodes).not.toContain("fatigue_overnight_floor_warning" satisfies TravelIntentReasonCode);
  });

  it("transit fatigue 5 + onSite fatigue 5 → combined=5", () => {
    const out = inferTravelIntent(makeFullInput({ transitFatigueHint: 5, onSiteFatigueHint: 5 }));
    expect(out.fatigueSignals.transitFatigue).toBe(5);
    expect(out.fatigueSignals.onSiteFatigue).toBe(5);
    expect(out.fatigueSignals.combined).toBe(5);
  });

  it("transit fatigue のみ → combined=transit", () => {
    const out = inferTravelIntent(makeFullInput({ transitFatigueHint: 4, onSiteFatigueHint: undefined }));
    expect(out.fatigueSignals.transitFatigue).toBe(4);
    expect(out.fatigueSignals.onSiteFatigue).toBeUndefined();
    expect(out.fatigueSignals.combined).toBe(4);
  });
});

// ─────────────────────────────────────────────
// Test 12: pair constraint
// ─────────────────────────────────────────────

describe("inferTravelIntent — pair constraint", () => {
  it("pair=together_all_time → pair_together_all_time reason", () => {
    const out = inferTravelIntent(makeFullInput({ pairTogethernessHint: "together_all_time" }));
    expect(out.reasonCodes).toContain("pair_together_all_time" satisfies TravelIntentReasonCode);
  });

  it("pair=flexible_split → pair_split_compatible reason + constraint", () => {
    const out = inferTravelIntent(makeFullInput({ pairTogethernessHint: "flexible_split" }));
    expect(out.reasonCodes).toContain("pair_split_compatible" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("pair_split_compatible");
  });

  it("pair=unknown → pair_unknown reason + missingSlots include 'pair'", () => {
    const out = inferTravelIntent(makeFullInput({ pairTogethernessHint: "unknown" }));
    expect(out.reasonCodes).toContain("pair_unknown" satisfies TravelIntentReasonCode);
    expect(out.missingSlots).toContain("pair" satisfies TravelIntentMissingSlot);
  });
});

// ─────────────────────────────────────────────
// Test 13: weather / season signal
// ─────────────────────────────────────────────

describe("inferTravelIntent — weather / seasonal signal", () => {
  it("weather=typhoon_warning → weather_risk_high constraint", () => {
    const out = inferTravelIntent(makeFullInput({ weatherForecastHint: "typhoon_warning" }));
    expect(out.reasonCodes).toContain("weather_typhoon_warning" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("weather_risk_high");
  });

  it("weather=heavy_rain → weather_risk_high constraint", () => {
    const out = inferTravelIntent(makeFullInput({ weatherForecastHint: "heavy_rain" }));
    expect(out.suggestedConstraints).toContain("weather_risk_high");
  });

  it("seasonal=spring_peak → seasonal_peak_warning constraint", () => {
    const out = inferTravelIntent(makeFullInput({ seasonalHint: "spring_peak" }));
    expect(out.reasonCodes).toContain("seasonal_peak_present" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("seasonal_peak_warning");
  });

  it("seasonal=off_season → off_season reason", () => {
    const out = inferTravelIntent(makeFullInput({ seasonalHint: "off_season" }));
    expect(out.reasonCodes).toContain("seasonal_off_present" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).not.toContain("seasonal_peak_warning");
  });
});

// ─────────────────────────────────────────────
// Test 14: intentReadiness 4 階層 (人間超越 Idea 5)
// ─────────────────────────────────────────────

describe("inferTravelIntent — intent readiness 4 階層", () => {
  it("readiness=vague_wish → readiness_vague_wish reason", () => {
    const out = inferTravelIntent(makeFullInput({ intentReadinessHint: "vague_wish" }));
    expect(out.reasonCodes).toContain("readiness_vague_wish" satisfies TravelIntentReasonCode);
  });

  it("readiness=exploratory → readiness_exploratory reason", () => {
    const out = inferTravelIntent(makeFullInput({ intentReadinessHint: "exploratory" }));
    expect(out.reasonCodes).toContain("readiness_exploratory" satisfies TravelIntentReasonCode);
  });

  it("readiness=actionable_planning → readiness_actionable_planning reason", () => {
    const out = inferTravelIntent(makeFullInput({ intentReadinessHint: "actionable_planning" }));
    expect(out.reasonCodes).toContain("readiness_actionable_planning" satisfies TravelIntentReasonCode);
  });

  it("readiness=immediate_planning → readiness_immediate_planning reason", () => {
    const out = inferTravelIntent(makeFullInput({ intentReadinessHint: "immediate_planning" }));
    expect(out.reasonCodes).toContain("readiness_immediate_planning" satisfies TravelIntentReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 15: purpose signal (人間超越 Idea 6)
// ─────────────────────────────────────────────

describe("inferTravelIntent — purpose signal", () => {
  it("purpose=relax_recharge → purpose_specified reason", () => {
    const out = inferTravelIntent(makeFullInput({ purposeHint: "relax_recharge" }));
    expect(out.reasonCodes).toContain("purpose_specified" satisfies TravelIntentReasonCode);
  });

  it("purpose=discover_new_place → purpose_specified reason", () => {
    const out = inferTravelIntent(makeFullInput({ purposeHint: "discover_new_place" }));
    expect(out.reasonCodes).toContain("purpose_specified" satisfies TravelIntentReasonCode);
  });

  it("purpose=celebrate_occasion → purpose_specified reason", () => {
    const out = inferTravelIntent(makeFullInput({ purposeHint: "celebrate_occasion" }));
    expect(out.reasonCodes).toContain("purpose_specified" satisfies TravelIntentReasonCode);
  });

  it("purpose=unknown → purpose_unknown + missingSlots include 'purpose'", () => {
    const out = inferTravelIntent(makeFullInput({ purposeHint: "unknown" }));
    expect(out.reasonCodes).toContain("purpose_unknown" satisfies TravelIntentReasonCode);
    expect(out.missingSlots).toContain("purpose" satisfies TravelIntentMissingSlot);
  });
});

// ─────────────────────────────────────────────
// Test 16: ambiguous travel vs activity handoff
// ─────────────────────────────────────────────

describe("inferTravelIntent — ambiguous travel vs activity", () => {
  it("activityHandoffSignal=true → out_of_scope_handoff + activity", () => {
    const out = inferTravelIntent({
      travelHints: { durationHint: "one_night" },
      activityHandoffSignal: true,
    });
    expect(out.inferredTravelIntent).toBe("out_of_scope_handoff");
    expect(out.handoffTarget).toBe("activity");
    expect(out.reasonCodes).toContain("activity_handoff_signal" satisfies TravelIntentReasonCode);
  });

  it("複数 handoff signal → ambiguous + activity 最優先", () => {
    const out = inferTravelIntent({
      activityHandoffSignal: true,
      dailyHandoffSignal: true,
      foodHandoffSignal: true,
    });
    expect(out.handoffTarget).toBe("activity");
    expect(out.reasonCodes).toContain("multiple_domains_ambiguous" satisfies TravelIntentReasonCode);
  });

  it("dailyHandoffSignal のみ → handoff = daily", () => {
    const out = inferTravelIntent({
      travelHints: { durationHint: "day_trip" },
      dailyHandoffSignal: true,
    });
    expect(out.handoffTarget).toBe("daily");
  });
});

// ─────────────────────────────────────────────
// Test 17: reasonCodes 構造的検証 (raw text 不入)
// ─────────────────────────────────────────────

describe("inferTravelIntent — reasonCodes structural safety", () => {
  it("reasonCodes は enum のみ、raw user text を含まない", () => {
    const out = inferTravelIntent(makeFullInput());
    // 各 reasonCode は string、固定 enum 形式 (lower_snake_case + alphabetic)
    for (const code of out.reasonCodes) {
      expect(typeof code).toBe("string");
      expect(code).toMatch(/^[a-z_]+$/);
    }
  });

  it("missingSlots は enum のみ", () => {
    const out = inferTravelIntent({});
    for (const slot of out.missingSlots) {
      expect(slot).toMatch(/^[a-z_]+$/);
    }
  });

  it("destinationSignals / durationSignals / budgetSignals は enum のみ", () => {
    const out = inferTravelIntent(makeFullInput());
    for (const s of out.destinationSignals) expect(s).toMatch(/^[a-z_]+$/);
    for (const s of out.durationSignals) expect(s).toMatch(/^[a-z_]+$/);
    for (const s of out.budgetSignals) expect(s).toMatch(/^[a-z_]+$/);
  });

  it("redLineCodes に潜在 PII を入れても output に raw 文字列が漏れない", () => {
    // caller 側が間違って raw text を入れたケース (本 fn は array length のみ確認)
    const out = inferTravelIntent({
      ...makeFullInput(),
      redLineCodes: ["potentially-pii-like-string", "another-suspicious-input"],
    });
    // output stringify に raw 文字列が含まれないこと
    const stringified = JSON.stringify(out);
    expect(stringified).not.toContain("potentially-pii-like-string");
    expect(stringified).not.toContain("another-suspicious-input");
    // ただし red_line_present は reason に入る (enum reason のみ)
    expect(out.reasonCodes).toContain("red_line_present" satisfies TravelIntentReasonCode);
    expect(out.suggestedConstraints).toContain("red_line_constraint_inferred");
  });
});

// ─────────────────────────────────────────────
// Test 18: deterministic (100 回連続呼出)
// ─────────────────────────────────────────────

describe("inferTravelIntent — deterministic", () => {
  it("同一 input 100 回呼出で完全同一 output (raw 一致)", () => {
    const input = makeFullInput();
    const baseline = JSON.stringify(inferTravelIntent(input));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(inferTravelIntent(input))).toBe(baseline);
    }
  });

  it("INTENT_VERSION は const string", () => {
    expect(TRAVEL_INTENT_EXTRACTOR_VERSION).toBe("0.1.0");
  });

  it("PROVISIONAL_DEFAULT_THRESHOLD は 0.5 (provisional 命名で明示)", () => {
    expect(PROVISIONAL_DEFAULT_THRESHOLD).toBe(0.5);
  });

  it("PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR は 3 (provisional 命名で明示)", () => {
    expect(PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR).toBe(3);
  });

  it("PROVISIONAL_OVERNIGHT_BUDGET_FLOOR_JPY は 10000 (provisional 命名で明示)", () => {
    expect(PROVISIONAL_OVERNIGHT_BUDGET_FLOOR_JPY).toBe(10000);
  });
});

// ─────────────────────────────────────────────
// Test 19: no runtime wiring (pure function 検証)
// ─────────────────────────────────────────────

describe("inferTravelIntent — no runtime wiring", () => {
  it("output は JSON serializable (構造的 PII 保存不能)", () => {
    const out = inferTravelIntent(makeFullInput());
    const json = JSON.stringify(out);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json) as TravelIntentOutput;
    expect(parsed.inferredTravelIntent).toBe("travel_eligible");
  });

  it("threshold override 可 (provisional 確定値ではない)", () => {
    // 全 dimension known の場合 confidence=1.0、threshold=1.01 で narrowing
    const outHigh = inferTravelIntent({ ...makeFullInput(), threshold: 1.01 });
    expect(outHigh.inferredTravelIntent).toBe("needs_narrowing");
    const outLow = inferTravelIntent({ ...makeFullInput(), threshold: 0.01 });
    expect(outLow.inferredTravelIntent).toBe("travel_eligible");
  });

  it("confidence is in 0-1 range", () => {
    const out = inferTravelIntent(makeFullInput());
    expect(out.confidence).toBeGreaterThanOrEqual(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
  });

  it("confidenceByDimension は dimension 別の 0-1", () => {
    const out = inferTravelIntent(makeFullInput());
    expect(out.confidenceByDimension).toBeDefined();
    const cbd = out.confidenceByDimension!;
    for (const dim of [
      cbd.destination,
      cbd.duration,
      cbd.budget,
      cbd.fatigue,
      cbd.pair,
      cbd.readiness,
      cbd.weather,
    ]) {
      expect(dim).toBeGreaterThanOrEqual(0);
      expect(dim).toBeLessThanOrEqual(1);
    }
    expect(cbd.overallGeometric).toBeGreaterThanOrEqual(0);
    expect(cbd.overallGeometric).toBeLessThanOrEqual(1);
  });

  it("dynamic import 可能 (call-site wiring 0、deferred 構造)", async () => {
    const mod = await import("../../../../lib/coalter/travel/intent");
    expect(typeof mod.inferTravelIntent).toBe("function");
    expect(mod.TRAVEL_INTENT_EXTRACTOR_VERSION).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 20: 人間超越 Idea 9 — confidence geometric mean (最弱 dimension 強調)
// ─────────────────────────────────────────────

describe("inferTravelIntent — confidence geometric mean (最弱 dimension 強調)", () => {
  it("1 dimension のみ signal → overall geometric < arithmetic", () => {
    // arithmetic = 1/7 ≈ 0.143、geometric mean (others=0 → epsilon=0.05) ≪ arithmetic
    const out = inferTravelIntent({
      travelHints: { destinationHint: "domestic_kanto" },
    });
    expect(out.confidenceByDimension).toBeDefined();
    const arithmetic = 1 / 7;
    expect(out.confidence).toBeLessThan(arithmetic);
  });

  it("全 dimension signal → overall ≈ 1", () => {
    const out = inferTravelIntent(makeFullInput());
    expect(out.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
