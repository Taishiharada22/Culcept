/**
 * B-3c-1 integration tests — journey_origin promotion path
 *
 * CEO/GPT 2026-05-03 設計提案 §10 + 9 必須条件:
 *   selection route の promotion path を end-to-end で検証。
 *   GPT 2nd 補正 (= coordinates 不正で blocked + activePresentation 維持) も網羅。
 *
 * 9 必須条件 カバー:
 *   #1 flag ON + public_poi → known_exact 昇格 (= Test #2)
 *   #2 GPT 2nd 補正: coords 不正 → 明示 reject + activePresentation 不変 (= Test #3)
 *   #3 coordinates あり時のみ昇格 (= Test #2 + #3)
 *   #4 events 不変 (= Test #4)
 *   #5 event_where 既存 flow 完全不変 (= Test #5)
 *   #6 generic/private/ambiguous skip (= 既存 PR #69 tests で網羅、本 file 範囲外)
 *   #7 travel segment 生成 (= Test #6 — flag transportV2 + planRebuild path)
 *   #8 flag OFF で挙動ゼロ (= Test #1)
 *   #9 Vercel SUCCESS は CI で確認、本 test 範囲外
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogState, PresentationContext } from "@/lib/alter-morning/dialog/types";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";
import type { MorningPlan } from "@/lib/alter-morning/types";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";
import { utteranceProvenance } from "@/lib/alter-morning/comprehension/eventSchema";
import {
  __setJourneyOriginGroundingOverride,
  __setTransportV2Override,
} from "@/lib/alter-morning/dialog/flags";
import { PLAN_ORIGIN_SENTINEL_EVENT_ID } from "@/lib/alter-morning/planning/gapResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

vi.mock("server-only", () => ({}));

const mockTierCheck = vi.fn();
vi.mock("@/lib/stargazer/tierGuard", () => ({
  checkStargazerTier: (...args: unknown[]) => mockTierCheck(...args),
}));

import { POST } from "@/app/api/stargazer/alter/selection/route";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkOriginCandidate(
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

function mkEventWhereCandidate(): NormalizedPlaceCandidate {
  return {
    placeId: "place_starbucks",
    displayName: "スターバックス渋谷店",
    address: "東京都渋谷区",
    coordinates: { lat: 35.66, lng: 139.7 },
    distanceFromAnchor: null,
    category: "cafe",
    chainToken: "starbucks",
    rawRef: { provider: "google_places", placeId: "place_starbucks" },
  };
}

function mkEvent(eventId = "event_1"): Event {
  return {
    event_id: eventId,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "10:00",
      timeHint: null,
      provenance: utteranceProvenance(["10時"], "high"),
    },
    where: {
      place_ref: "渋谷",
      placeType: "common_noun",
      provenance: utteranceProvenance(["渋谷"], "high"),
    },
    what: {
      activity: "ミーティング",
      activityCanonical: "meeting",
      provenance: utteranceProvenance(["ミーティング"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

function mkJourneyOriginPresentation(
  candidates: NormalizedPlaceCandidate[],
  fingerprint = "pf:v1|journey_origin|label=東京駅",
): PresentationContext {
  return {
    targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
    queryFingerprint: fingerprint,
    candidates,
    presentedAtTurn: 3,
    target: { kind: "journey_origin" },
  };
}

function mkJourneyEndPresentation(
  candidates: NormalizedPlaceCandidate[],
): PresentationContext {
  return {
    targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID, // sentinel placeholder
    queryFingerprint: "pf:v1|journey_end|label=帰宅",
    candidates,
    presentedAtTurn: 3,
    target: { kind: "journey_end" },
  };
}

function mkEventWherePresentation(
  candidates: NormalizedPlaceCandidate[],
  eventId = "event_1",
): PresentationContext {
  return {
    targetEventId: eventId,
    queryFingerprint: "pf:v1|anchor=渋谷|chain=starbucks",
    candidates,
    presentedAtTurn: 3,
    // target unspecified or event_where — both should work
    target: { kind: "event_where", eventId },
  };
}

function mkPresentedDialogState(
  activePresentation: PresentationContext | null,
  override: Partial<DialogState> = {},
): DialogState {
  return {
    version: 1,
    focus: {
      event_id: "event_1",
      slot: "where",
      narrowStep: 2,
    },
    conversationStatus: activePresentation
      ? "search_candidates_presented"
      : "clarifying",
    capturedHistory: [],
    semanticMissStreak: 0,
    providerFailureStreak: 0,
    lastGoodPlan: null,
    searchQueryDraft: {
      anchorRegion: null,
      categoryToken: null,
      chainToken: null,
      readyForHandoff: false,
    },
    activePresentation,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
    ...override,
  };
}

function mkMorningPlanWithKnownLabelOnly(
  label = "東京駅",
): MorningPlan {
  const journeyOrigin: JourneyAnchorState = {
    kind: "known_label_only",
    label,
    source: "user_declared",
  };
  return {
    date: "2026-05-03",
    items: [],
    dayConditions: { mainTransport: undefined } as any,
    journeyOrigin,
    journeyEnd: { kind: "unknown", reason: "no_endpoint_signal" },
  } as unknown as MorningPlan;
}

function mkRequest(body: unknown): Request {
  return new Request("http://localhost/api/stargazer/alter/selection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

beforeEach(() => {
  mockTierCheck.mockReset();
  mockTierCheck.mockResolvedValue({
    userId: "user_1",
    tier: { level: "free" },
    allowed: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  __setJourneyOriginGroundingOverride(null);
  __setTransportV2Override(null);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #1: 必須 #8 — flag OFF で production 挙動ゼロ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1 必須 #8] flag OFF: journey_origin selection は reject", () => {
  it("flag default false → reject with not_implemented_journey_anchor_promotion", async () => {
    __setJourneyOriginGroundingOverride(false);
    const presentation = mkJourneyOriginPresentation([mkOriginCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      accepted: false,
      reason: "not_implemented_journey_anchor_promotion",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #2: 必須 #1 #3 — flag ON + valid coords → known_exact 昇格
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2 必須 #1 #3] flag ON + valid coords → promoted", () => {
  it("happy path: known_label_only → known_exact + user_override", async () => {
    __setJourneyOriginGroundingOverride(true);
    const presentation = mkJourneyOriginPresentation([mkOriginCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(true);

    const promoted = body.morningSession?.plan?.journeyOrigin;
    expect(promoted).toBeDefined();
    expect(promoted.kind).toBe("known_exact");
    expect(promoted.label).toBe("東京駅丸の内口");
    expect(promoted.lat).toBeCloseTo(35.681236);
    expect(promoted.lng).toBeCloseTo(139.767125);
    expect(promoted.source).toBe("user_override");
  });

  it("activePresentation は clear される (= reducer 受理)", async () => {
    __setJourneyOriginGroundingOverride(true);
    const presentation = mkJourneyOriginPresentation([mkOriginCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    const body = await res.json();
    expect(body.accepted).toBe(true);
    expect(body.morningSession?.dialogState?.activePresentation).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #3: 必須 #2 — GPT 2nd 補正: coords 不正 → 明示 reject + activePresentation 維持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3 必須 #2 GPT 2nd 補正] coords 不正 → blocked + activePresentation 維持", () => {
  it("lat NaN → reason=journey_anchor_promotion_not_possible", async () => {
    __setJourneyOriginGroundingOverride(true);
    const badCandidate = mkOriginCandidate({
      coordinates: { lat: NaN, lng: 139.7 },
    });
    const presentation = mkJourneyOriginPresentation([badCandidate]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({
      accepted: false,
      reason: "journey_anchor_promotion_not_possible",
    });
  });

  it("blocked 時 morningSession は returned されない (= client は pre-request state 維持)", async () => {
    __setJourneyOriginGroundingOverride(true);
    const badCandidate = mkOriginCandidate({
      coordinates: { lat: NaN, lng: 0 },
    });
    const presentation = mkJourneyOriginPresentation([badCandidate]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    const body = await res.json();
    // morningSession を返さないことで client の activePresentation が維持される (= 半壊 UX 防止)
    expect(body.morningSession).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #4: 必須 #4 — events 不変
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4 必須 #4] journey_origin 経路で events は変更されない", () => {
  it("promotion 成功時 persistedEvents は完全不変", async () => {
    __setJourneyOriginGroundingOverride(true);
    const inputEvents = [mkEvent()];
    const inputEventsBefore = JSON.stringify(inputEvents);
    const presentation = mkJourneyOriginPresentation([mkOriginCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: inputEvents,
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    const body = await res.json();
    expect(body.accepted).toBe(true);
    expect(body.morningSession.persistedEvents).toEqual(inputEvents);
    // 入力 events も mutate なし
    expect(JSON.stringify(inputEvents)).toBe(inputEventsBefore);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #5: 必須 #5 — event_where 既存 flow 完全不変
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#5 必須 #5] event_where flow は完全不変 (= regression 0)", () => {
  it("event_where presentation + selection → 既存挙動 (= where slot 更新)", async () => {
    __setJourneyOriginGroundingOverride(true); // flag ON でも event_where は影響なし
    const presentation = mkEventWherePresentation([mkEventWhereCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_starbucks",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    const body = await res.json();
    expect(body.accepted).toBe(true);
    // events の where slot が更新されている (= 既存 applyPlaceSelection 経路)
    const updatedEvent = body.morningSession.persistedEvents.find(
      (e: Event) => e.event_id === "event_1",
    );
    expect(updatedEvent?.where?.place_ref).toBe("スターバックス渋谷店");
    expect(updatedEvent?.where?.placeType).toBe("exact_proper_noun");
  });

  it("event_where flow で plan.journeyOrigin は不変 (= origin に触らない)", async () => {
    __setJourneyOriginGroundingOverride(true);
    const presentation = mkEventWherePresentation([mkEventWhereCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const inputPlan = mkMorningPlanWithKnownLabelOnly();
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_starbucks",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: inputPlan,
        },
      }) as any,
    );
    const body = await res.json();
    expect(body.accepted).toBe(true);
    // journeyOrigin は known_label_only (= 入力のまま、event_where は origin に触らない)
    const origin = body.morningSession?.plan?.journeyOrigin;
    expect(origin?.kind).toBe("known_label_only");
    expect(origin?.label).toBe("東京駅");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #6: 必須 #3 — journey_end は flag 関係なく reject (= B-3e 未実装)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#6 必須 #3] journey_end は flag ON でも reject", () => {
  it("flag ON でも journey_end → not_implemented_journey_anchor_promotion", async () => {
    __setJourneyOriginGroundingOverride(true);
    const presentation = mkJourneyEndPresentation([mkOriginCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
          plan: mkMorningPlanWithKnownLabelOnly(),
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({
      accepted: false,
      reason: "not_implemented_journey_anchor_promotion",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #7: 必須 #7 — travel segment 生成 (= transportV2 flag ON の path)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#7 必須 #7] promotion 後 plan rebuild で travel segment 生成", () => {
  it("transportV2 flag ON + promotion → transportSegments に origin → first event", async () => {
    __setJourneyOriginGroundingOverride(true);
    __setTransportV2Override(true);
    const presentation = mkJourneyOriginPresentation([mkOriginCandidate()]);
    const dialogState = mkPresentedDialogState(presentation);
    // event に coords を持たせて travel segment が作られる条件を満たす
    const eventWithCoords: Event = {
      ...mkEvent(),
      where: {
        place_ref: "渋谷",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 139.7 },
        provenance: utteranceProvenance(["渋谷"], "high"),
      } as any,
    };
    const res = await POST(
      mkRequest({
        turnIndex: 4,
        targetEventId: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        queryFingerprint: presentation.queryFingerprint,
        selectedPlaceId: "place_marunouchi",
        morningSession: {
          dialogState,
          persistedEvents: [eventWithCoords],
          plan: { ...mkMorningPlanWithKnownLabelOnly(), items: [] },
        },
      }) as any,
    );
    const body = await res.json();
    expect(body.accepted).toBe(true);
    // transportSegments があり、HOME_TRAVEL_SENTINEL_ID から first event への segment 含む
    const segments = body.morningSession?.plan?.transportSegments;
    expect(segments).toBeDefined();
    expect(Array.isArray(segments)).toBe(true);
    const homeSegment = segments?.find(
      (s: { fromEventId: string }) => s.fromEventId === "__home__",
    );
    expect(homeSegment).toBeDefined();
    expect(homeSegment?.toEventId).toBe("event_1");
  });
});
