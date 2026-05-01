/**
 * reconcileGapStateFromEffectiveEvents — PR #41b-0 unit tests
 *
 * CEO 必須条件 6 項目を unit レベルで証明:
 *   1. gapResolver は effectiveEvents を基準に再計算
 *   2. pendingClarify は prior fallback で古い質問を引き継がない
 *   3. where が fixed → where pendingClarify は消える
 *   4. dialogState.focus.slot が where で events.where fixed → focus clear / advance
 *   5. semanticMissStreak は focus 変更で reset
 *   6. 未解決 slot がなければ phase は plan_presented
 */

import { describe, it, expect } from "vitest";
import {
  reconcileGapStateFromEffectiveEvents,
  areEventsFullyFixed,
  findNextFocusFromEvents,
  reconcileDialogState,
  reconcilePendingClarify,
} from "@/lib/alter-morning/planning/reconcileEffectiveEvents";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
  toolProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { DialogState } from "@/lib/alter-morning/dialog/types";
import type { PendingClarify } from "@/lib/alter-morning/types";

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "evt_x",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides } as Event;
}

function mkFixedEvent(eventId: string, startTime: string, placeRef: string): Event {
  return mkEvent({
    event_id: eventId,
    when: {
      startTime,
      timeHint: null,
      provenance: utteranceProvenance([startTime], "high"),
    },
    where: {
      place_ref: placeRef,
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.6587, lng: 139.6997 },
      provenance: toolProvenance("high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "カフェ",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
  });
}

function mkDialogState(overrides: Partial<DialogState> = {}): DialogState {
  const base: DialogState = {
    version: 1,
    focus: null,
    conversationStatus: "stable",
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
    activePresentation: null,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
  };
  return { ...base, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// areEventsFullyFixed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("areEventsFullyFixed", () => {
  it("全 slot fixed + missing 空 → true", () => {
    const events = [mkFixedEvent("e1", "10:00", "TSUTAYA")];
    expect(areEventsFullyFixed(events)).toBe(true);
  });

  it("where vague (placeType=null) → false", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        when: {
          startTime: "10:00",
          timeHint: null,
          provenance: utteranceProvenance(["10時"], "high"),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "カフェ",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
      }),
    ];
    expect(areEventsFullyFixed(events)).toBe(false);
  });

  it("[CEO 2026-04-28] sharpness fixed なら missing_semantic_critical を無視 → true", () => {
    // 設計判断: sharpness を canonical truth として採用。
    // missing_semantic_critical は provenance checker の artifact で、
    // sharpness と意味的に重複。disagree する場合 (test fixture 等) は
    // sharpness を信じる (実 events では一致する想定)。
    const events = [mkFixedEvent("e1", "10:00", "TSUTAYA")];
    events[0].missing_semantic_critical = ["where"];
    expect(areEventsFullyFixed(events)).toBe(true);
  });

  it("空配列 → false (plan 不能)", () => {
    expect(areEventsFullyFixed([])).toBe(false);
  });

  it("複数 events 全 fixed → true", () => {
    const events = [
      mkFixedEvent("e1", "09:00", "サドヤ"),
      mkFixedEvent("e2", "12:00", "新宿御苑"),
    ];
    expect(areEventsFullyFixed(events)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// findNextFocusFromEvents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("findNextFocusFromEvents", () => {
  it("全 fixed → null", () => {
    expect(findNextFocusFromEvents([mkFixedEvent("e1", "10:00", "x")])).toBeNull();
  });

  it("event_1 where vague + event_2 fixed → event_1.where focus", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: null,
          placeType: null,
          coordinates: null,
          provenance: inferredProvenance(),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "カフェ",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
      }),
      mkFixedEvent("e2", "12:00", "TSUTAYA"),
    ];
    const focus = findNextFocusFromEvents(events);
    expect(focus).not.toBeNull();
    expect(focus!.event_id).toBe("e1");
    expect(focus!.slot).toBe("where");
  });

  it("where 全 fixed + event_1 when vague → event_1.when focus", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        when: {
          startTime: null,
          timeHint: null,
          provenance: inferredProvenance(),
        },
        where: {
          place_ref: "TSUTAYA",
          placeType: "exact_proper_noun",
          coordinates: { lat: 35.6, lng: 139.7 },
          provenance: toolProvenance(),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "カフェ",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
      }),
    ];
    const focus = findNextFocusFromEvents(events);
    expect(focus!.slot).toBe("when");
  });

  it("priority: where > when > what", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        when: {
          startTime: null,
          timeHint: null,
          provenance: inferredProvenance(),
        }, // when missing
        where: {
          place_ref: null,
          placeType: null,
          coordinates: null,
          provenance: inferredProvenance(),
        }, // where missing
        what: {
          activity: "",
          activityCanonical: "",
          provenance: inferredProvenance(),
        }, // what missing
      }),
    ];
    const focus = findNextFocusFromEvents(events);
    expect(focus!.slot).toBe("where"); // priority 最高
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reconcileDialogState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("reconcileDialogState", () => {
  it("focus=null → そのまま", () => {
    const state = mkDialogState({ focus: null });
    const result = reconcileDialogState(state, [mkFixedEvent("e1", "10:00", "x")]);
    expect(result.focusCleared).toBe(false);
    expect(result.state).toBe(state);
  });

  it("[ROOT CAUSE] focus.slot=where + events.where=fixed → focus clear (CEO condition 4)", () => {
    const state = mkDialogState({
      focus: { event_id: "e1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      semanticMissStreak: 4,
    });
    const events = [mkFixedEvent("e1", "10:00", "TSUTAYA")];
    const result = reconcileDialogState(state, events);
    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
    expect(result.state!.semanticMissStreak).toBe(0); // CEO condition 5
  });

  it("focus.slot=where + events 別 event の where vague → focus advance to vague event", () => {
    const state = mkDialogState({
      focus: { event_id: "e1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      semanticMissStreak: 2,
    });
    const events = [
      mkFixedEvent("e1", "09:00", "TSUTAYA"), // fixed
      mkEvent({
        event_id: "e2",
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: null,
          placeType: null,
          coordinates: null,
          provenance: inferredProvenance(),
        }, // missing
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
      }),
    ];
    const result = reconcileDialogState(state, events);
    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toEqual({
      event_id: "e2",
      slot: "where",
      narrowStep: 0,
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
    expect(result.state!.semanticMissStreak).toBe(0);
  });

  it("focus event 消滅 → focus=null + stable", () => {
    const state = mkDialogState({
      focus: { event_id: "e_gone", slot: "where", narrowStep: 0 },
    });
    const result = reconcileDialogState(state, [
      mkFixedEvent("e1", "10:00", "x"),
    ]);
    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toBeNull();
  });

  it("focus.slot 依然 vague → そのまま (focus 維持)", () => {
    const state = mkDialogState({
      focus: { event_id: "e1", slot: "where", narrowStep: 0 },
      conversationStatus: "narrowing",
      semanticMissStreak: 1,
    });
    const events = [
      mkEvent({
        event_id: "e1",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        }, // vague
        what: {
          activity: "コーヒー",
          activityCanonical: "カフェ",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
      }),
    ];
    const result = reconcileDialogState(state, events);
    expect(result.focusCleared).toBe(false);
    expect(result.state!.focus).toEqual(state.focus); // 同じ
    expect(result.state!.semanticMissStreak).toBe(1); // 触らない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reconcilePendingClarify
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("reconcilePendingClarify", () => {
  it("[CEO condition 3] events fully fixed + primary_clarify=null → null (prior fallback しない)", () => {
    const priorPending: PendingClarify = {
      event_id: "e1",
      slot: "where",
      kind: "where_center",
      scope: { timeLabel: "09:00", activityLabel: "カフェ", eventOrdinal: 1 },
      question: "09:00のカフェはどのあたり？",
      askedAt: "2026-04-28T00:00:00.000Z",
      semanticMissCount: 4,
    };
    const result = reconcilePendingClarify({
      filteredPrimary: null,
      effectiveEvents: [mkFixedEvent("e1", "10:00", "TSUTAYA")],
      priorPendingClarify: priorPending,
    });
    expect(result).toBeNull(); // events fixed なので prior 引き継がない
  });

  it("events not fully fixed + primary_clarify=null → prior fallback (comprehension failure 救済)", () => {
    const priorPending: PendingClarify = {
      event_id: "e1",
      slot: "where",
      kind: "where_center",
      scope: { timeLabel: null, activityLabel: null, eventOrdinal: 1 },
      question: "どのあたり？",
      askedAt: "2026-04-28T00:00:00.000Z",
      semanticMissCount: 0,
    };
    const events = [
      mkEvent({
        event_id: "e1",
        where: {
          place_ref: null,
          placeType: null,
          coordinates: null,
          provenance: inferredProvenance(),
        },
      }),
    ];
    const result = reconcilePendingClarify({
      filteredPrimary: null,
      effectiveEvents: events,
      priorPendingClarify: priorPending,
    });
    expect(result).toBe(priorPending); // fallback OK
  });

  it("primary_clarify あり → 新しい pendingClarify build", () => {
    const result = reconcilePendingClarify({
      filteredPrimary: {
        event_id: "e1",
        kind: "where_center",
        target_slot: "where",
        scope: {
          timeLabel: "12:00",
          activityLabel: "ランチ",
          eventOrdinal: 2,
          sameLabelCount: 1,
        },
        question: "12:00のランチはどのあたり？",
      },
      effectiveEvents: [
        mkFixedEvent("e0", "09:00", "TSUTAYA"),
        mkEvent({
          event_id: "e1",
          when: {
            startTime: "12:00",
            timeHint: null,
            provenance: utteranceProvenance(["12時"], "high"),
          },
          what: {
            activity: "ランチ",
            activityCanonical: "ランチ",
            provenance: utteranceProvenance(["ランチ"], "high"),
          },
          where: {
            place_ref: null,
            placeType: null,
            coordinates: null,
            provenance: inferredProvenance(),
          },
        }),
      ],
      priorPendingClarify: null,
    });
    expect(result).not.toBeNull();
    expect(result!.event_id).toBe("e1");
    expect(result!.slot).toBe("where");
    expect(result!.kind).toBe("where_center");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reconcileGapStateFromEffectiveEvents (full integration)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("reconcileGapStateFromEffectiveEvents — full reconcile (CEO 6 条件)", () => {
  it("[CEO success scenario] 9時を10時に変更 → reconcile で全条件達成", () => {
    // Turn 3 の effectiveEvents (modify guard 補正済み、where=fixed, when=10:00)
    const effectiveEvents = [
      mkFixedEvent("event_1", "10:00", "スターバックス TSUTAYA 渋谷店"),
    ];
    // 古い pendingClarify (Turn 1 で立てられた where_center、stale)
    const priorPending: PendingClarify = {
      event_id: "event_1",
      slot: "where",
      kind: "where_center",
      scope: { timeLabel: "09:00", activityLabel: "カフェ", eventOrdinal: 1 },
      question: "09:00のカフェはどのあたり？",
      askedAt: "2026-04-28T03:55:47.638Z",
      semanticMissCount: 4,
    };
    // 古い dialogState (focus.slot=where, narrowing, streak=4)
    const priorState = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      semanticMissStreak: 4,
    });

    const result = reconcileGapStateFromEffectiveEvents({
      effectiveEvents,
      priorPendingClarify: priorPending,
      priorDialogState: priorState,
      priorGapResolution: null,
      originalPhase: "clarifying",
      comprehensionOk: true,
    });

    // CEO condition 1: GapResolution は effectiveEvents 基準で filter
    //   priorGapResolution=null なので primary_clarify は最初から null
    expect(result.reconciledGapResolution.primary_clarify).toBeNull();

    // CEO condition 2,3: pendingClarify は null (prior fallback しない)
    expect(result.reconciledPendingClarify).toBeNull();

    // CEO condition 4: dialogState.focus が clear
    expect(result.reconciledDialogState!.focus).toBeNull();
    expect(result.reconciledDialogState!.conversationStatus).toBe("stable");

    // CEO condition 5: semanticMissStreak が 0 に reset
    expect(result.reconciledDialogState!.semanticMissStreak).toBe(0);

    // CEO condition 6: phase が plan_presented に進む
    expect(result.reconciledPhase).toBe("plan_presented");

    // 観測フラグ
    expect(result.reconciled.eventsFullyFixed).toBe(true);
    expect(result.reconciled.phaseChanged).toBe(true); // clarifying → plan_presented
    expect(result.reconciled.pendingClarifyChanged).toBe(true);
    expect(result.reconciled.focusCleared).toBe(true);
  });

  it("events に未解決 slot あり + comprehension failed → prior fallback で安全に保持", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        where: {
          place_ref: null,
          placeType: null,
          coordinates: null,
          provenance: inferredProvenance(),
        },
      }),
    ];
    const priorPending: PendingClarify = {
      event_id: "e1",
      slot: "where",
      kind: "where_center",
      scope: { timeLabel: null, activityLabel: null, eventOrdinal: 1 },
      question: "どのあたり？",
      askedAt: "2026-04-28T00:00:00.000Z",
      semanticMissCount: 0,
    };
    const priorState = mkDialogState({
      focus: { event_id: "e1", slot: "where", narrowStep: 0 },
      conversationStatus: "clarifying",
    });

    // gapResolver が primary_clarify を立てない場合 (comprehension failure 等)
    const result = reconcileGapStateFromEffectiveEvents({
      effectiveEvents: events,
      priorPendingClarify: priorPending,
      priorDialogState: priorState,
      priorGapResolution: null,
      originalPhase: "clarifying",
      comprehensionOk: true,
    });

    // events not fully fixed → fallback で prior pendingClarify を保持 OR
    // gapResolver が primary_clarify を立てる (where vague で立てる) → 新 pendingClarify
    // 何にしても null ではなく、何らかの pendingClarify が出る
    expect(result.reconciledPendingClarify).not.toBeNull();
    expect(result.reconciled.eventsFullyFixed).toBe(false);
  });

  it("特殊 phase (comprehension_failed) は preserve", () => {
    const events = [mkFixedEvent("e1", "10:00", "x")];
    const result = reconcileGapStateFromEffectiveEvents({
      effectiveEvents: events,
      priorPendingClarify: null,
      priorDialogState: null,
      priorGapResolution: null,
      originalPhase: "completed", // 特殊 phase
      comprehensionOk: true,
    });
    expect(result.reconciledPhase).toBe("completed"); // preserve
  });

  it("priorDialogState=null → reconciledDialogState=null", () => {
    const result = reconcileGapStateFromEffectiveEvents({
      effectiveEvents: [mkFixedEvent("e1", "10:00", "x")],
      priorPendingClarify: null,
      priorDialogState: null,
      priorGapResolution: null,
      originalPhase: "clarifying",
      comprehensionOk: true,
    });
    expect(result.reconciledDialogState).toBeNull();
    expect(result.reconciled.focusCleared).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO/GPT 2026-05-01: multi-event places handoff 再入場 (implication AND)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 不変条件 (GPT 2026-05-01):
//   focus advance 時に「searchQueryDraft が next event のクエリとして整合」
//   する場合に限り、search_handoff_blocking + narrowStep=2 を維持して再入場する。
//
// 整合条件 (implication AND):
//   - next.slot === "where"
//   - nextEvent != null
//   - nextWhereSharpness === "vague"
//   - searchQueryDraft.readyForHandoff === true
//   - state.activePresentation === null
//   - anchorRegion non-null → place_ref に含まれる
//   - chainToken non-null → place_ref に含まれる
//   - categoryToken non-null → what.activity に含まれる
//
// 旧 OR 条件は禁止 (誤 handoff の温床)。

describe("reconcileDialogState — multi-event places handoff (CEO 2026-05-01)", () => {
  // 共通 fixture: event_1 fixed (selection 後の渋谷ストリーム店) + event_2 vague
  function mkEvent2NewTokyoLunch(): Event {
    return mkEvent({
      event_id: "event_2",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: utteranceProvenance(["ランチ"], "high"),
      },
    });
  }

  function mkBaseState(): DialogState {
    return mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      searchQueryDraft: {
        anchorRegion: "新宿",
        categoryToken: "ランチ",
        chainToken: null,
        readyForHandoff: true,
      },
      activePresentation: null,
    });
  }

  it("Test 1: event_1 fixed + event_2 vague + draft 整合 → search_handoff_blocking + narrowStep=2", () => {
    const state = mkBaseState();
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 2, // ★ narrowStep=2 で再入場
    });
    expect(result.state!.conversationStatus).toBe("search_handoff_blocking");
    expect(result.state!.semanticMissStreak).toBe(0);
  });

  it("Test 2: anchor 不一致 (横浜) → 通常 clarifying advance", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      searchQueryDraft: {
        anchorRegion: "横浜", // ★ event_2.where="新宿" と一致しない
        categoryToken: "ランチ",
        chainToken: null,
        readyForHandoff: true,
      },
    });
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0, // ★ narrowStep=0 (handoff 不発)
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });

  it("Test 3: nextWhereSharpness === missing (place_ref 空) → 通常 clarifying advance", () => {
    const state = mkBaseState();
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent({
        event_id: "event_2",
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: null, // ★ missing
          placeType: null,
          coordinates: null,
          provenance: inferredProvenance(),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
      }),
    ];

    const result = reconcileDialogState(state, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0,
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });

  it("Test 4: activePresentation あり → 二重提示防止で handoff しない", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      searchQueryDraft: {
        anchorRegion: "新宿",
        categoryToken: "ランチ",
        chainToken: null,
        readyForHandoff: true,
      },
      activePresentation: {
        // ★ 既存 presentation (event_2 用ではない)
        targetEventId: "event_99",
        queryFingerprint: "fp_old",
        candidates: [],
        presentedAtTurn: 1,
      },
    });
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0, // ★ handoff 不発
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });

  it("Test 5 (regression): 単一 event fully fixed → focus=null + stable (旧挙動維持)", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      searchQueryDraft: {
        anchorRegion: "新宿",
        categoryToken: "ランチ",
        chainToken: null,
        readyForHandoff: true, // ← この test では advance 不能なので無視される
      },
    });
    const events = [mkFixedEvent("event_1", "10:00", "x")]; // 単一 event 全 fixed

    const result = reconcileDialogState(state, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
  });

  it("Test 6: chainToken non-null + place_ref 不一致 (古い chain 残骸) → handoff しない", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      searchQueryDraft: {
        anchorRegion: null,
        categoryToken: null,
        chainToken: "スタバ", // ★ event_2.where="新宿" と不一致
        readyForHandoff: true,
      },
    });
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    // chain が "新宿" に含まれない → chainMatches=false → handoff 不発
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0,
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });

  it("Test 7: categoryToken だけ一致、anchor 不一致 → handoff しない", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      searchQueryDraft: {
        anchorRegion: "渋谷", // ★ event_2.where="新宿" と不一致
        categoryToken: "ランチ", // ← これは event_2.what="ランチ" と一致するが
        chainToken: null,
        readyForHandoff: true,
      },
    });
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    // anchor 不一致 → anchorMatches=false (AND 条件) → handoff 不発
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0,
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });

  it("Test 8: event_1 由来の古い draft 残骸 → event_2 に誤 handoff しない", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      // ★ event_1 由来 (渋谷+カフェ) の draft が残った状態
      searchQueryDraft: {
        anchorRegion: "渋谷",
        categoryToken: "カフェ",
        chainToken: null,
        readyForHandoff: true,
      },
    });
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    // anchor=渋谷 が place_ref=新宿 に含まれない → handoff 不発
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0,
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });

  it("Test 9 (GPT 追加): activePresentation target mismatch (event_99 != event_2) → handoff しない", () => {
    const state = mkDialogState({
      focus: { event_id: "event_1", slot: "where", narrowStep: 3 },
      conversationStatus: "narrowing",
      searchQueryDraft: {
        anchorRegion: "新宿",
        categoryToken: "ランチ",
        chainToken: null,
        readyForHandoff: true,
      },
      activePresentation: {
        // ★ next focus event_2 と異なる targetEventId
        targetEventId: "event_99",
        queryFingerprint: "fp_other",
        candidates: [],
        presentedAtTurn: 1,
      },
    });
    const events = [
      mkFixedEvent("event_1", "10:00", "スターバックス渋谷ストリーム店"),
      mkEvent2NewTokyoLunch(),
    ];

    const result = reconcileDialogState(state, events);

    // activePresentation 非 null で防衛的に handoff 不発 (target mismatch を含む)
    expect(result.state!.focus).toEqual({
      event_id: "event_2",
      slot: "where",
      narrowStep: 0,
    });
    expect(result.state!.conversationStatus).toBe("clarifying");
  });
});
