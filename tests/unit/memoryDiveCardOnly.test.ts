// tests/unit/memoryDiveCardOnly.test.ts
// 受け入れ基準 #4, #5 を検証
// #4: Memory Dive がカードのみで完走できる
// #5: AI補完失敗時でも結晶化まで進める
import { describe, it, expect } from "vitest";
import { createMemoryGem } from "@/lib/origin/v7/memoryDiveEngine";
import { needsAICompletion } from "@/lib/origin/v7/memoryDiveAI";
import type {
  MemoryDiveDraft,
  DiveSceneData,
  DiveSensesData,
  DiveEventsData,
  DiveInnerData,
  DiveRippleData,
} from "@/lib/origin/v7/types";

// ── Helpers ──

function makeCardOnlyScene(): DiveSceneData {
  return {
    year: 2010,
    month: 7,
    season: "summer",
    place: "", // no text — card only
    placeCard: "school",
    people: ["friend"],
    timeOfDay: "afternoon",
    atmosphere: "sunny",
  };
}

function makeCardOnlySenses(): DiveSensesData {
  return {
    sight: ["bright_light", "colors"],
    sightText: "",
    sound: ["laughter"],
    soundText: "",
    smell: [],
    smellText: "",
    temperature: "hot",
    touch: [],
    touchText: "",
  };
}

function makeCardOnlyEvents(): DiveEventsData {
  return {
    narrative: "", // empty — card only
    eventType: "everyday",
    intensity: 3,
    pivotalMoment: "", // empty
  };
}

function makeCardOnlyInner(): DiveInnerData {
  return {
    emotions: ["joy", "nostalgia"],
    thoughts: "", // empty
    unsaid: "", // empty
    unsaidTarget: null,
  };
}

function makeCardOnlyRipple(): DiveRippleData {
  return {
    impact: "", // empty — card only
    impactType: "belief_formed",
    counterfactual: "", // empty
    patternStarted: "", // empty
  };
}

function makeCardOnlyDraft(): MemoryDiveDraft {
  return {
    id: "test-draft-001",
    scene: makeCardOnlyScene(),
    senses: makeCardOnlySenses(),
    events: makeCardOnlyEvents(),
    inner: makeCardOnlyInner(),
    ripple: makeCardOnlyRipple(),
    currentPhase: "ripple",
    startedAt: "2026-03-30T00:00:00Z",
  };
}

// ═══════════════════════════════════════════════════════════════
// #4: Memory Dive がカードのみで完走できる
// ═══════════════════════════════════════════════════════════════
describe("Memory Dive card-only path", () => {
  it("createMemoryGem succeeds with card-only data (no text fields)", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    expect(gem!.id).toBeDefined();
    expect(gem!.diveId).toBe("test-draft-001");
  });

  it("derives title from placeCard when place text is empty", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    // Title should include "学校" from PLACE_CARDS[school].label
    expect(gem!.title).toContain("学校");
  });

  it("derives title from place text when provided (overrides placeCard)", () => {
    const draft = makeCardOnlyDraft();
    draft.scene.place = "渋谷の裏路地";
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    expect(gem!.title).toContain("渋谷の裏路地");
  });

  it("combines placeCard label + season in title", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    // Season uses raw ID "summer", placeCard resolves to "学校"
    expect(gem!.title).toContain("学校");
    expect(gem!.title).toContain("summer");
  });

  it("preserves all card selections in the gem", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    expect(gem!.scene.placeCard).toBe("school");
    expect(gem!.scene.season).toBe("summer");
    expect(gem!.scene.people).toEqual(["friend"]);
    expect(gem!.events.eventType).toBe("everyday");
    expect(gem!.inner.emotions).toEqual(["joy", "nostalgia"]);
    expect(gem!.ripple.impactType).toBe("belief_formed");
  });

  it("derives correct dominantEmotion from card selection", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    expect(gem!.dominantEmotion).toBe("joy"); // first emotion
  });

  it("computes lifePeriod from birthYear and scene year", () => {
    const draft = makeCardOnlyDraft();
    draft.scene.year = 2010;
    const gem = createMemoryGem(draft, 1995);

    expect(gem).not.toBeNull();
    // Age 15 → middle_school or high_school period
    expect(gem!.lifePeriod).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// #4 (cont): needsAICompletion correctly detects card-only state
// ═══════════════════════════════════════════════════════════════
describe("needsAICompletion detection", () => {
  it("returns true when all text fields are empty (pure card-only)", () => {
    const result = needsAICompletion(
      makeCardOnlyEvents(),
      makeCardOnlyInner(),
      makeCardOnlyRipple(),
    );
    expect(result).toBe(true);
  });

  it("returns false when most text fields are filled", () => {
    const events: DiveEventsData = {
      narrative: "放課後に友達と走り回っていた",
      eventType: "everyday",
      intensity: 3,
      pivotalMoment: "夕焼けに気づいた瞬間",
    };
    const inner: DiveInnerData = {
      emotions: ["joy"],
      thoughts: "このまま時間が止まればいいのに",
      unsaid: "",
      unsaidTarget: null,
    };
    const ripple: DiveRippleData = {
      impact: "あの頃の自由さを今も追いかけている",
      impactType: "belief_formed",
      counterfactual: "",
      patternStarted: "",
    };

    const result = needsAICompletion(events, inner, ripple);
    // 4 filled fields (narrative, pivotalMoment, thoughts, impact) >= 3 → false
    expect(result).toBe(false);
  });

  it("returns true when only 2 text fields are filled", () => {
    const events: DiveEventsData = {
      narrative: "何かが起きた",
      eventType: "surprise",
      intensity: 4,
      pivotalMoment: "",
    };
    const inner: DiveInnerData = {
      emotions: ["surprise"],
      thoughts: "驚いた",
      unsaid: "",
      unsaidTarget: null,
    };
    const ripple: DiveRippleData = {
      impact: "",
      impactType: "behavior_changed",
      counterfactual: "",
      patternStarted: "",
    };

    const result = needsAICompletion(events, inner, ripple);
    // 2 filled fields < 3 → true
    expect(result).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// #5: AI補完失敗時でも結晶化まで進める
// ═══════════════════════════════════════════════════════════════
describe("Crystallization without AI completion", () => {
  it("creates a valid gem from card-only data without any AI text", () => {
    // Simulates the path where AI fails and user clicks "このまま結晶化する"
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft);

    expect(gem).not.toBeNull();
    expect(gem!.title).toBeTruthy();
    expect(gem!.dominantEmotion).toBeTruthy();
    expect(gem!.createdAt).toBeTruthy();
  });

  it("creates gem with empty text fields (they remain empty)", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft);

    expect(gem).not.toBeNull();
    // Text fields are empty but gem is valid
    expect(gem!.events.narrative).toBe("");
    expect(gem!.inner.thoughts).toBe("");
    expect(gem!.ripple.impact).toBe("");
    // Card fields are populated
    expect(gem!.events.eventType).toBe("everyday");
    expect(gem!.ripple.impactType).toBe("belief_formed");
  });

  it("handles missing birthYear gracefully", () => {
    const draft = makeCardOnlyDraft();
    const gem = createMemoryGem(draft); // no birthYear

    expect(gem).not.toBeNull();
    expect(gem!.lifePeriod).toBeDefined();
  });

  it("handles scene with neither place text nor placeCard", () => {
    const draft = makeCardOnlyDraft();
    draft.scene.place = "";
    draft.scene.placeCard = null;
    const gem = createMemoryGem(draft);

    expect(gem).not.toBeNull();
    // Title still generated from season
    expect(gem!.title).toBeTruthy();
  });
});
