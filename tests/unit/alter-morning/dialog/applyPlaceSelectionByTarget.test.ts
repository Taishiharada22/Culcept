/**
 * applyPlaceSelectionByTarget unit test (B-3c-1 Commit 2)
 *
 * カバレッジ:
 *   1. event_where → 既存 applyPlaceSelection と byte-diff zero (= 必須 #5)
 *   2. journey_origin happy → applied_journey_origin (= known_exact promoted)
 *   3. journey_origin coordinates 不正 → blocked_journey_origin (= GPT 2nd 補正、必須 #2)
 *   4. journey_origin invalid_state → blocked_journey_origin (= idempotent)
 *   5. journey_end → rejected_target_kind (= 必須 #3、B-3e 未実装)
 *   6. exhaustive switch (= TS 型レベル + runtime never assertion)
 */

import { describe, it, expect } from "vitest";
import { applyPlaceSelectionByTarget } from "@/lib/alter-morning/dialog/applyPlaceSelectionByTarget";
import { applyPlaceSelection } from "@/lib/alter-morning/search/applyPlaceSelection";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";
import type { PresentationTarget } from "@/lib/alter-morning/dialog/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mockCandidate(
  overrides: Partial<NormalizedPlaceCandidate> = {},
): NormalizedPlaceCandidate {
  return {
    placeId: "place_marunouchi",
    displayName: "東京駅丸の内口",
    address: "東京都千代田区丸の内1丁目",
    coordinates: { lat: 35.681236, lng: 139.767125 },
    distanceFromAnchor: null,
    category: null,
    chainToken: null,
    rawRef: { provider: "google_places", placeId: "place_marunouchi" },
    ...overrides,
  };
}

function mockEvent(): Event {
  return {
    event_id: "evt-1",
    when: { start_time: "10:00", provenance: { source_type: "user", confidence: "high" } },
    where: {
      place_ref: "東京駅",
      placeType: "common_noun",
      coordinates: undefined,
      provenance: { source_type: "user", confidence: "high" },
    },
    what: { activity: "ミーティング", provenance: { source_type: "user", confidence: "high" } },
    who: undefined,
    transport: undefined,
    duration_min: undefined,
    missing_semantic_critical: ["where"],
    missing_solver_blockers: [],
  } as unknown as Event;
}

const knownLabelOnly: JourneyAnchorState = {
  kind: "known_label_only",
  label: "東京駅",
  source: "user_declared",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #1: event_where = 既存 applyPlaceSelection と同一動作 (必須 #5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1 event_where] 既存 applyPlaceSelection と byte-diff zero", () => {
  it("event_where target → applied_event_where + 既存 applyPlaceSelection と同一 events", () => {
    const events = [mockEvent()];
    const candidate = mockCandidate();
    const target: PresentationTarget = { kind: "event_where", eventId: "evt-1" };

    const dispatched = applyPlaceSelectionByTarget({
      target,
      candidate,
      events,
      targetEventId: "evt-1",
    });

    const expected = applyPlaceSelection({
      events,
      targetEventId: "evt-1",
      candidate,
    });

    expect(dispatched.kind).toBe("applied_event_where");
    if (dispatched.kind === "applied_event_where") {
      expect(dispatched.applied).toBe(expected.applied);
      expect(dispatched.events).toEqual(expected.events);
      expect(dispatched.candidate).toBe(candidate);
    }
  });

  it("event_where + 不在 targetEventId → applied=false", () => {
    const events = [mockEvent()];
    const candidate = mockCandidate();
    const target: PresentationTarget = {
      kind: "event_where",
      eventId: "missing-evt",
    };

    const result = applyPlaceSelectionByTarget({
      target,
      candidate,
      events,
      targetEventId: "missing-evt",
    });

    expect(result.kind).toBe("applied_event_where");
    if (result.kind === "applied_event_where") {
      expect(result.applied).toBe(false);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #2: journey_origin happy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2 journey_origin happy] coordinates ありで applied_journey_origin", () => {
  it("known_label_only + valid coords → applied_journey_origin (known_exact)", () => {
    const candidate = mockCandidate();
    const target: PresentationTarget = { kind: "journey_origin" };

    const result = applyPlaceSelectionByTarget({
      target,
      candidate,
      events: [], // 使われない
      targetEventId: "ignored",
      currentJourneyOrigin: knownLabelOnly,
    });

    expect(result.kind).toBe("applied_journey_origin");
    if (result.kind === "applied_journey_origin") {
      expect(result.promotedJourneyOrigin.kind).toBe("known_exact");
      expect(result.promotedJourneyOrigin.label).toBe("東京駅丸の内口");
      expect(result.promotedJourneyOrigin.source).toBe("user_override");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #3: journey_origin coordinates 不正 → blocked (GPT 2nd 補正、必須 #2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3 journey_origin blocked] GPT 2nd 補正 — coordinates 不正", () => {
  it("lat NaN → blocked_journey_origin, reason=missing_coordinates", () => {
    const candidate = mockCandidate({ coordinates: { lat: NaN, lng: 139.7 } });
    const result = applyPlaceSelectionByTarget({
      target: { kind: "journey_origin" },
      candidate,
      events: [],
      targetEventId: "ignored",
      currentJourneyOrigin: knownLabelOnly,
    });
    expect(result.kind).toBe("blocked_journey_origin");
    if (result.kind === "blocked_journey_origin") {
      expect(result.reason).toBe("missing_coordinates");
    }
  });

  it("lng 範囲外 → blocked_journey_origin", () => {
    const candidate = mockCandidate({ coordinates: { lat: 35.6, lng: 200 } });
    const result = applyPlaceSelectionByTarget({
      target: { kind: "journey_origin" },
      candidate,
      events: [],
      targetEventId: "ignored",
      currentJourneyOrigin: knownLabelOnly,
    });
    expect(result.kind).toBe("blocked_journey_origin");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #4: journey_origin invalid_state (idempotent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4 journey_origin invalid_state] idempotent 防御", () => {
  it("currentJourneyOrigin が known_exact → blocked_journey_origin, reason=invalid_state", () => {
    const result = applyPlaceSelectionByTarget({
      target: { kind: "journey_origin" },
      candidate: mockCandidate(),
      events: [],
      targetEventId: "ignored",
      currentJourneyOrigin: {
        kind: "known_exact",
        label: "自宅",
        lat: 35.0,
        lng: 139.0,
        source: "registered_home",
      },
    });
    expect(result.kind).toBe("blocked_journey_origin");
    if (result.kind === "blocked_journey_origin") {
      expect(result.reason).toBe("invalid_state");
    }
  });

  it("currentJourneyOrigin が undefined → blocked_journey_origin", () => {
    const result = applyPlaceSelectionByTarget({
      target: { kind: "journey_origin" },
      candidate: mockCandidate(),
      events: [],
      targetEventId: "ignored",
      currentJourneyOrigin: undefined,
    });
    expect(result.kind).toBe("blocked_journey_origin");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #5: journey_end → rejected_target_kind (必須 #3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#5 journey_end] B-3e 未実装 → rejected_target_kind", () => {
  it("target.kind === journey_end → rejected_target_kind, targetKind=journey_end", () => {
    const result = applyPlaceSelectionByTarget({
      target: { kind: "journey_end" },
      candidate: mockCandidate(),
      events: [],
      targetEventId: "ignored",
    });
    expect(result.kind).toBe("rejected_target_kind");
    if (result.kind === "rejected_target_kind") {
      expect(result.targetKind).toBe("journey_end");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #6: events 不変 (必須 #4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#6 events 不変] journey_origin path で events を mutate / 参照変更しない", () => {
  it("journey_origin applied → events 入力配列 完全不変", () => {
    const events = [mockEvent()];
    const eventsBefore = JSON.stringify(events);
    const candidate = mockCandidate();

    applyPlaceSelectionByTarget({
      target: { kind: "journey_origin" },
      candidate,
      events,
      targetEventId: "evt-1",
      currentJourneyOrigin: knownLabelOnly,
    });

    expect(JSON.stringify(events)).toBe(eventsBefore);
  });

  it("journey_origin blocked → events 完全不変", () => {
    const events = [mockEvent()];
    const eventsBefore = JSON.stringify(events);
    const candidate = mockCandidate({
      coordinates: { lat: NaN, lng: 139.7 },
    });

    applyPlaceSelectionByTarget({
      target: { kind: "journey_origin" },
      candidate,
      events,
      targetEventId: "evt-1",
      currentJourneyOrigin: knownLabelOnly,
    });

    expect(JSON.stringify(events)).toBe(eventsBefore);
  });

  it("journey_end rejected → events 完全不変", () => {
    const events = [mockEvent()];
    const eventsBefore = JSON.stringify(events);

    applyPlaceSelectionByTarget({
      target: { kind: "journey_end" },
      candidate: mockCandidate(),
      events,
      targetEventId: "evt-1",
    });

    expect(JSON.stringify(events)).toBe(eventsBefore);
  });
});
