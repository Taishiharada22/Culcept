/**
 * When Slot Classifier tests — W3-PR-6 Commit 3
 *
 * カバレッジ:
 *   - FIXED: 明示 HH:mm
 *   - PROVISIONAL: timeHint anchor / category default
 *   - ASK: どちらもない
 *   - gapResolver 統合: sem==['when'] + category default → pass_through
 *   - gapResolver 統合: sem==['when'] + no anchor → specific_time clarify
 */
import { describe, test, expect, beforeEach } from "vitest";

import {
  classifyWhenSlot,
  lookupCategoryDefault,
  ACTIVITY_CATEGORY_DEFAULTS,
} from "@/lib/alter-morning/planning/whenClassifier";
import { resolveGaps } from "@/lib/alter-morning/planning/gapResolver";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    event_id: id,
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: null,
      timeHint: null,
      provenance: utteranceProvenance([], "low"),
    },
    where: {
      place_ref: null,
      placeType: null,
      provenance: utteranceProvenance([], "low"),
    },
    what: {
      activity: null,
      activityCanonical: null,
      provenance: utteranceProvenance([], "low"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  } as Event;
}

beforeEach(() => {
  resetEventCounter();
});

describe("classifyWhenSlot", () => {
  test("明示 HH:mm → FIXED/explicit", () => {
    const ev = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
    });
    const res = classifyWhenSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("fixed");
    if (res.kind === "fixed") {
      expect(res.source).toBe("explicit");
      expect(res.startTime).toBe("09:00");
    }
  });

  test("timeHint のみ → PROVISIONAL/hint（morning=09:00）", () => {
    const ev = mkEvent("e1", {
      when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "medium") },
    });
    const res = classifyWhenSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("provisional");
    if (res.kind === "provisional") {
      expect(res.source).toBe("hint");
      expect(res.startTime).toBe("09:00");
    }
  });

  test("activity='ランチ' → PROVISIONAL/category_default (12:00)", () => {
    const ev = mkEvent("e1", {
      what: { activity: "ランチ", activityCanonical: "ランチ", provenance: utteranceProvenance(["ランチ"], "high") },
    });
    const res = classifyWhenSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("provisional");
    if (res.kind === "provisional") {
      expect(res.source).toBe("category_default");
      expect(res.startTime).toBe("12:00");
    }
  });

  test("activity='ディナー' → PROVISIONAL/category_default (19:00)", () => {
    const ev = mkEvent("e1", {
      what: { activity: "ディナー", activityCanonical: "ディナー", provenance: utteranceProvenance(["ディナー"], "high") },
    });
    const res = classifyWhenSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("provisional");
    if (res.kind === "provisional") {
      expect(res.source).toBe("category_default");
      expect(res.startTime).toBe("19:00");
    }
  });

  test("activity 広義語（'カフェ'）は category default に入らない → ASK", () => {
    const ev = mkEvent("e1", {
      what: { activity: "カフェ", activityCanonical: "カフェ", provenance: utteranceProvenance(["カフェ"], "high") },
    });
    const res = classifyWhenSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("ask");
    if (res.kind === "ask") expect(res.reason).toBe("no_time_anchor");
  });

  test("すべて null → ASK/no_time_anchor", () => {
    const ev = mkEvent("e1");
    const res = classifyWhenSlot(ev, { events: [ev], index: 0 });
    expect(res.kind).toBe("ask");
  });
});

describe("lookupCategoryDefault", () => {
  test("辞書キー全件が HH:mm 形式である", () => {
    for (const [, time] of Object.entries(ACTIVITY_CATEGORY_DEFAULTS)) {
      expect(time).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  test("英字ケースは小文字化して照合", () => {
    const ev = mkEvent("e1", {
      what: { activity: "LUNCH", activityCanonical: "LUNCH", provenance: utteranceProvenance(["LUNCH"], "high") },
    });
    expect(lookupCategoryDefault(ev)).toBe("12:00");
  });
});

describe("gapResolver — When 三層 integration", () => {
  test("sem==['when'] + category default ('ランチ') → pass_through（ASK しない）", () => {
    const ev = mkEvent("e1", {
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "ランチ", activityCanonical: "ランチ", provenance: utteranceProvenance(["ランチ"], "high") },
      missing_semantic_critical: ["when"],
    });
    const res = resolveGaps([ev]);
    expect(res.primary_clarify).toBeNull();
  });

  test("sem==['when'] + 広義語 ('コーヒー') → specific_time clarify が立つ", () => {
    const ev = mkEvent("e1", {
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
      missing_semantic_critical: ["when"],
    });
    const res = resolveGaps([ev]);
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("specific_time");
  });
});
