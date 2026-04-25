/**
 * selection endpoint — W3-PR-9 Commit 5a-2 unit tests
 *
 * 検証観点（reject scenarios + happy path）:
 *   1. missing_dialog_state: dialogState null
 *   2. no_active_presentation: activePresentation null
 *   3. target_event_mismatch: targetEventId 不一致
 *   4. query_fingerprint_stale: fingerprint 不一致
 *   5. invalid_place_id: placeId が candidates に無い
 *   6. status_not_presented: conversationStatus が clarifying 等
 *   7. event_not_found: reducer 受理するが event graph に無い
 *   8. happy path: dialogState 更新 + events 更新 + canonical response
 *   9. 400: shape 不正
 *  10. auth 失敗パススルー（checkStargazerTier が NextResponse を返す）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogState, PresentationContext } from "@/lib/alter-morning/dialog/types";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";
import { utteranceProvenance } from "@/lib/alter-morning/comprehension/eventSchema";
import { __setTransportV2Override } from "@/lib/alter-morning/dialog/flags";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

vi.mock("server-only", () => ({}));

const mockTierCheck = vi.fn();
vi.mock("@/lib/stargazer/tierGuard", () => ({
  checkStargazerTier: (...args: unknown[]) => mockTierCheck(...args),
}));

// NextResponse は動的 import で POST を呼ぶたびに必要なのでグローバル
import { NextResponse } from "next/server";
import { POST } from "@/app/api/stargazer/alter/selection/route";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkCandidate(id: string): NormalizedPlaceCandidate {
  return {
    placeId: id,
    displayName: `スタバ ${id} 店`,
    address: "山梨県甲府市",
    coordinates: { lat: 35.66, lng: 138.56 },
    distanceFromAnchor: 100,
    category: "cafe",
    chainToken: "starbucks",
    rawRef: { provider: "google_places", placeId: id },
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
      place_ref: "スタバ",
      placeType: "chain_brand",
      provenance: utteranceProvenance(["スタバ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "coffee",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: ["where"],
    missing_solver_blockers: [],
  };
}

function mkActivePresentation(
  targetEventId: string,
  queryFingerprint: string,
  candidates: NormalizedPlaceCandidate[],
): PresentationContext {
  return {
    targetEventId,
    queryFingerprint,
    candidates,
    presentedAtTurn: 3,
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
      anchorRegion: "甲府",
      categoryToken: null,
      chainToken: "starbucks",
      readyForHandoff: true,
    },
    activePresentation,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
    ...override,
  };
}

function mkRequest(body: unknown): Request {
  return new Request("http://localhost/api/stargazer/alter/selection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("POST /api/stargazer/alter/selection", () => {
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
  });

  it("auth 失敗時 (NextResponse) を pass-through する", async () => {
    const authFail = NextResponse.json({ error: "auth" }, { status: 401 });
    mockTierCheck.mockResolvedValueOnce(authFail);

    const res = await POST(mkRequest({}) as any);
    expect(res.status).toBe(401);
  });

  it("不正 shape は 400", async () => {
    const res = await POST(mkRequest({ foo: "bar" }) as any);
    expect(res.status).toBe(400);
  });

  it("無効 JSON は 400", async () => {
    const req = new Request(
      "http://localhost/api/stargazer/alter/selection",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      },
    );
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("dialogState null → reason=missing_dialog_state", async () => {
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          sessionId: "s1",
          phase: "clarifying",
          dialogState: null,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accepted: false, reason: "missing_dialog_state" });
  });

  it("activePresentation null → reason=no_active_presentation", async () => {
    const dialogState = mkPresentedDialogState(null);
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({ accepted: false, reason: "no_active_presentation" });
  });

  it("targetEventId 不一致 → reason=target_event_mismatch", async () => {
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [mkCandidate("p1")]),
    );
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_999",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({ accepted: false, reason: "target_event_mismatch" });
  });

  it("queryFingerprint 不一致 → reason=query_fingerprint_stale", async () => {
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [mkCandidate("p1")]),
    );
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp_old",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({
      accepted: false,
      reason: "query_fingerprint_stale",
    });
  });

  it("placeId が candidates に無い → reason=invalid_place_id", async () => {
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [mkCandidate("p1")]),
    );
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p_unknown",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({ accepted: false, reason: "invalid_place_id" });
  });

  it("status!=presented (activePresentation があっても) → reason=status_not_presented", async () => {
    // Note: activePresentation != null ⇔ status=presented は invariant なので
    // 通常は起き得ないが、client が不正 payload を送ってきた場合の防御として検証。
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [mkCandidate("p1")]),
      { conversationStatus: "clarifying" },
    );
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();
    expect(body).toEqual({ accepted: false, reason: "status_not_presented" });
  });

  it("reducer 受理 but event graph に無い → reason=event_not_found (no partial success)", async () => {
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_missing", "fp1", [mkCandidate("p1")]),
      {
        focus: { event_id: "event_missing", slot: "where", narrowStep: 2 },
      },
    );
    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_missing",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          // event_missing はリストに含まれない
          persistedEvents: [mkEvent("event_other")],
        },
      }) as any,
    );
    const body = await res.json();
    // all-or-nothing invariant: morningSession を返さない
    //   reducer は in-memory で進んだが破棄する。client は pre-request state を維持。
    //   これが崩れると dialogState と event のズレが恒久化する。
    expect(body).toEqual({ accepted: false, reason: "event_not_found" });
    expect(body.morningSession).toBeUndefined();
  });

  it("happy path: accepted=true, dialogState + persistedEvents が更新される", async () => {
    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          sessionId: "s1",
          phase: "clarifying",
          dialogState,
          persistedEvents: [mkEvent()],
          rawInputs: ["朝スタバ行く"], // pass-through 確認用
        },
      }) as any,
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.accepted).toBe(true);
    expect(body.morningSession).toBeDefined();

    // dialogState: stable へ遷移、activePresentation は null、missCount は 0
    const nextDs = body.morningSession.dialogState;
    expect(nextDs.conversationStatus).toBe("stable");
    expect(nextDs.activePresentation).toBe(null);
    expect(nextDs.zeroCandidateMissCount).toBe(0);

    // event: where が candidate で上書き
    const nextEvents: Event[] = body.morningSession.persistedEvents;
    expect(nextEvents).toHaveLength(1);
    expect(nextEvents[0].where.place_ref).toBe(candidate.displayName);
    expect(nextEvents[0].where.placeType).toBe("exact_proper_noun");
    expect(nextEvents[0].where.coordinates).toEqual(candidate.coordinates);
    expect(nextEvents[0].where.provenance.source_type).toBe("tool");
    expect(nextEvents[0].missing_semantic_critical).toEqual([]);

    // pass-through fields 保持
    expect(body.morningSession.sessionId).toBe("s1");
    expect(body.morningSession.phase).toBe("clarifying");
    expect(body.morningSession.rawInputs).toEqual(["朝スタバ行く"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3-PR-10 Transport Staircase — plan rebuild 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEventWithCoords(
  eventId: string,
  placeRef: string,
  coordinates: { lat: number; lng: number } | null,
  startTime = "10:00",
): Event {
  return {
    event_id: eventId,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime,
      timeHint: null,
      provenance: utteranceProvenance([startTime], "high"),
    },
    where: {
      place_ref: placeRef,
      placeType: coordinates ? "exact_proper_noun" : "chain_brand",
      coordinates,
      provenance: utteranceProvenance([placeRef], "high"),
    },
    what: {
      activity: "作業",
      activityCanonical: "work",
      provenance: utteranceProvenance(["作業"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: coordinates ? [] : ["where"],
    missing_solver_blockers: [],
  };
}

function mkPriorPlan(items: PlanItem[]): MorningPlan {
  return {
    date: "2026-04-22",
    items,
    dayConditions: {},
    createdAt: "2026-04-22T09:00:00Z",
    confirmed: false,
    status: "provisional",
  };
}

describe("POST /api/stargazer/alter/selection — PR-10 plan rebuild", () => {
  beforeEach(() => {
    mockTierCheck.mockReset();
    mockTierCheck.mockResolvedValue({
      userId: "user_1",
      tier: { level: "free" },
      allowed: true,
    });
    __setTransportV2Override(null);
  });

  afterEach(() => {
    __setTransportV2Override(null);
    vi.clearAllMocks();
  });

  it("flag OFF + plan in morningSession → response.morningSession.plan は含まれる（Phase 2 scope 1: items rebuild、travel なし）", async () => {
    // Phase 2 scope 1 (CEO 2026-04-26): plan rebuild は transportV2 flag 不問で
    // 常に走るように変更。flag OFF でも events 由来の items で plan を最新化する。
    // 旧契約「flag OFF で plan を含めない」は CEO 観測「TSUTAYA tap 後も Markcity が
    // 残る」の構造的原因だったため意図的に廃止。
    //
    // flag OFF の保証:
    //   - response.morningSession.plan は **含まれる**（priorPlan が存在すれば）
    //   - plan.items は events から rebuild された最新値
    //   - plan.transportSegments は **undefined**（travel 機能は flag ON 時のみ）
    //   - travel item は plan.items に含まれない（同上）
    __setTransportV2Override(false);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );
    const priorPlan = mkPriorPlan([
      {
        id: "event_1",
        kind: "fixed",
        text: "10:00 スタバ コーヒー",
        what: "コーヒー",
        startTime: "10:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        whenSharpness: "fixed",
        whereSharpness: "vague",
        whatSharpness: "fixed",
        whereVagueSubKind: "category_chain",
        confirmationState: "provisional",
      },
    ]);

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          sessionId: "s1",
          phase: "clarifying",
          dialogState,
          persistedEvents: [mkEvent()],
          plan: priorPlan,
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    // Phase 2 scope 1: plan は **含まれる**（rebuilt with items, no travel/transportSegments）
    expect(body.morningSession.plan).toBeDefined();
    expect(body.morningSession.plan).not.toBeNull();
    // priorPlan の不変 fields は維持（date / dayConditions / createdAt / confirmed / status）
    expect(body.morningSession.plan.date).toBe(priorPlan.date);
    // travel / transportSegments は flag OFF なので含まれない
    expect(body.morningSession.plan.transportSegments).toBeUndefined();
    const travelItems = (body.morningSession.plan.items as Array<{ kind: string }>)
      .filter((i) => i.kind === "travel");
    expect(travelItems).toHaveLength(0);
  });

  it("flag ON + coordinates-fixed events + plan in morningSession → rebuild で transportSegments 付与", async () => {
    __setTransportV2Override(true);

    const candidate = mkCandidate("p1");
    // candidate は lat:35.66, lng:138.56。selection で event_1 の coordinates がこれに更新される。
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );

    const priorPlan = mkPriorPlan([
      {
        id: "event_1",
        kind: "fixed",
        text: "10:00 スタバ コーヒー",
        what: "コーヒー",
        startTime: "10:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        whenSharpness: "fixed",
        whereSharpness: "vague",
        whatSharpness: "fixed",
        whereVagueSubKind: "category_chain",
        confirmationState: "provisional",
      },
    ]);

    // event_1 は chain_brand（coordinates null）、event_2 は coordinates 既定
    const events: Event[] = [
      mkEvent("event_1"),
      mkEventWithCoords(
        "event_2",
        "渋谷",
        { lat: 35.66, lng: 139.7 },
        "12:00",
      ),
    ];

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          sessionId: "s1",
          phase: "clarifying",
          dialogState,
          persistedEvents: events,
          plan: priorPlan,
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    expect(body.morningSession.plan).toBeDefined();

    const nextPlan: MorningPlan = body.morningSession.plan;
    // items は rebuild され、event_1 の text も新しい place_ref を反映する。
    // W3-PR-10 Phase 2: flag ON 経路では event items の間に travel item が interleave される。
    //   両端 coords 揃い（event_1 selection で獲得 / event_2 既定）→ 1 segment → 1 travel item
    //   期待: [event_1, travel(event_1→event_2), event_2]
    expect(nextPlan.items).toHaveLength(3);
    expect(nextPlan.items[0].id).toBe("event_1");
    expect(nextPlan.items[0].text).toContain(candidate.displayName);
    expect(nextPlan.items[1].kind).toBe("travel");
    expect(nextPlan.items[1].id.startsWith("travel__")).toBe(true);
    expect(nextPlan.items[1].id).toBe("travel__event_1__event_2");
    expect(nextPlan.items[2].id).toBe("event_2");
    // orderHint は 0..2 の連番で再付番される
    expect(nextPlan.items.map((i) => i.orderHint)).toEqual([0, 1, 2]);

    // transportSegments: event_1 が selection で coordinates 獲得、event_2 も coordinates 既定 →
    // 両端揃ったので 1 segment 生成
    expect(nextPlan.transportSegments).toBeDefined();
    expect(nextPlan.transportSegments).toHaveLength(1);
    expect(nextPlan.transportSegments![0].fromEventId).toBe("event_1");
    expect(nextPlan.transportSegments![0].toEventId).toBe("event_2");
    expect(nextPlan.transportSegments![0].mode).toBe("unknown");
    expect(nextPlan.transportSegments![0].source).toBe("default_walk");

    // date / dayConditions / createdAt / confirmed / status は priorPlan から温存
    expect(nextPlan.date).toBe("2026-04-22");
    expect(nextPlan.createdAt).toBe("2026-04-22T09:00:00Z");
    expect(nextPlan.confirmed).toBe(false);
    expect(nextPlan.status).toBe("provisional");
  });

  it("flag ON + 片方 coordinates 欠落 → transportSegments は空配列（heuristic 禁止 invariant）", async () => {
    __setTransportV2Override(true);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );

    const priorPlan = mkPriorPlan([]);

    // event_1 は selection で coordinates 獲得、event_2 は coordinates null のまま
    const events: Event[] = [
      mkEvent("event_1"),
      mkEventWithCoords("event_2", "未確定", null, "12:00"),
    ];

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          sessionId: "s1",
          phase: "clarifying",
          dialogState,
          persistedEvents: events,
          plan: priorPlan,
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    const nextPlan: MorningPlan = body.morningSession.plan;
    // coordinates 揃った pair が無いので segment は 0 件
    expect(nextPlan.transportSegments).toEqual([]);
  });

  it("flag ON + priorPlan なし → plan rebuild しない（plan は response に含まれない）", async () => {
    __setTransportV2Override(true);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          sessionId: "s1",
          phase: "clarifying",
          dialogState,
          persistedEvents: [mkEvent()],
          // plan なし
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    // priorPlan なし → rebuild も skip。plan key は response に現れない
    expect(body.morningSession.plan).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3-PR-10 positive-path nudge — alterFollowUp 発火ゲート
//   narrow trigger (conversationStarter.shouldAskNextPlace):
//     A. このターンで 1 件目 place が confirm された
//     B. まだ複数 place に到達していない
//     C. ユーザーが終了意思を示していない
//   さらに transportV2 flag ON user 限定。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("POST /api/stargazer/alter/selection — PR-10 alterFollowUp nudge", () => {
  beforeEach(() => {
    mockTierCheck.mockReset();
    mockTierCheck.mockResolvedValue({
      userId: "user_1",
      tier: { level: "free" },
      allowed: true,
    });
    __setTransportV2Override(null);
  });

  afterEach(() => {
    __setTransportV2Override(null);
    vi.clearAllMocks();
  });

  it("flag OFF + 1件目 place 確定 → alterFollowUp は emit されない", async () => {
    __setTransportV2Override(false);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    // flag OFF 契約: 観測対象外ユーザーに UX 変化を与えない
    expect(body.alterFollowUp).toBeUndefined();
    expect("alterFollowUp" in body).toBe(false);
  });

  it("flag ON + 1件目 place 確定 + 終了意思なし → alterFollowUp で固定文を emit", async () => {
    __setTransportV2Override(true);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
      {
        // capturedHistory は終了意思を含まない無害な履歴
        capturedHistory: [
          {
            capture: {
              rawSpan: "じゃあそこで",
              turnIndex: 2,
              slot: "where",
              kind: "place",
              normalizedValue: "スタバ",
              confidence: 0.8,
            },
          } as any,
        ],
      },
    );

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          // coordinates なしの event だけ → prev=0、selection で next=1（初の確定）
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    expect(body.alterFollowUp).toBeDefined();
    expect(body.alterFollowUp.text).toBe("このあと、どこか寄る？");
  });

  it("flag ON + 1件目 place 確定 but ユーザーが終了意思 → alterFollowUp 抑制", async () => {
    __setTransportV2Override(true);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
      {
        capturedHistory: [
          {
            capture: {
              rawSpan: "これだけでいい",
              turnIndex: 2,
              slot: "where",
              kind: "place",
              normalizedValue: "スタバ",
              confidence: 0.8,
            },
          } as any,
        ],
      },
    );

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    // 終了意思あり → Predicate C で抑制
    expect(body.alterFollowUp).toBeUndefined();
  });

  it("flag ON + 2件目 place 確定（prev=1, next=2） → alterFollowUp 抑制", async () => {
    __setTransportV2Override(true);

    const candidate = mkCandidate("p1");
    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [candidate]),
    );

    // 既に event_2 は coordinates 解決済み、event_1 が今回の selection で解決 →
    // prev=1(event_2), next=2(event_1+event_2)。justConfirmedFirstPlace=false。
    const events: Event[] = [
      mkEvent("event_1"),
      mkEventWithCoords(
        "event_2",
        "渋谷",
        { lat: 35.66, lng: 139.7 },
        "12:00",
      ),
    ];

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp1",
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: events,
        },
      }) as any,
    );
    const body = await res.json();

    expect(body.accepted).toBe(true);
    // Predicate A 不成立（prev=1, next=2） + Predicate B 成立 → 抑制
    expect(body.alterFollowUp).toBeUndefined();
  });

  it("flag ON + accepted=false（stale fingerprint） → alterFollowUp は付かない", async () => {
    __setTransportV2Override(true);

    const dialogState = mkPresentedDialogState(
      mkActivePresentation("event_1", "fp1", [mkCandidate("p1")]),
    );

    const res = await POST(
      mkRequest({
        turnIndex: 3,
        targetEventId: "event_1",
        queryFingerprint: "fp_old", // mismatch → reject
        selectedPlaceId: "p1",
        morningSession: {
          dialogState,
          persistedEvents: [mkEvent()],
        },
      }) as any,
    );
    const body = await res.json();

    // reject response は accepted=false + reason のみ。alterFollowUp は emit path に
    // 到達すらしない（return NextResponse.json は Step 7c より前の rejection で返る）。
    expect(body).toEqual({ accepted: false, reason: "query_fingerprint_stale" });
    expect(body.alterFollowUp).toBeUndefined();
  });
});
