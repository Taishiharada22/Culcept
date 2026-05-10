/**
 * post-turn final reconcile — PR-50 Commit 11 (CEO 2026-04-30)
 *
 * 検証対象:
 *   route.ts の advanceDialogState (= dialogReducer TURN_CAPTURED) 後に
 *   reconcileDialogState を再実行する「post-turn finalization」 の論理。
 *
 * 真因 (CEO + GPT 共同確定 2026-04-30):
 *   adapter 内 reconcileDialogState が focus=null に整合した状態を、
 *   dialogReducer TURN_CAPTURED が prev.focus=null でも `targetEventId/targetSlot`
 *   から focus を新規作成する仕様 (lib/alter-morning/dialog/reducer.ts L487-492)
 *   により上書きしてしまう。CEO Preview 観測 2026-04-30 で focusCleared=true
 *   なのに dialogState.focus=where が残留する事象を解消する。
 *
 * 修正方針 (post-turn finalization):
 *   adapter reconcile = pipeline 内整合 (PR-50 Commit 9、維持)
 *   route final reconcile = 最終レスポンス前整合 (PR-50 Commit 11、追加)
 *   両者は二重防御、最終的に勝つのは route final reconcile。
 *
 * 不変条件 (本 commit が保証):
 *   final dialogState.focus は events 内で missing slot を持つ event の
 *   (event_id, slot) を指すか、null (全 fixed)。
 *
 * テスト 4 case (CEO 確定 2026-04-30):
 *   A. focus=where + event fully fixed → focus=null / stable / streak=0
 *   B. focus=where + event where vague → focus 維持
 *   C. reducer が focus=where を復活させた state → final focus は復活しない
 *      (CEO 観測ケース直接再現)
 *   D. focus=where resolved + 別 event missing slot → 次の missing に advance
 *
 * 実装: route.ts L2358-2372 (advanceDialogState 後に reconcileDialogState を
 * 再実行) で本テストの input/output 関係を担保する。本テストは reconcileDialogState
 * の post-turn シナリオでの挙動を直接 verify することで、route.ts wire の論理
 * 正当性を保証する。
 */

import { describe, it, expect } from "vitest";

import { reconcileDialogState } from "@/lib/alter-morning/planning/reconcileEffectiveEvents";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { DialogState } from "@/lib/alter-morning/dialog/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkFullyFixedEvent(overrides?: Partial<Event>): Event {
  return {
    event_id: "event_1",
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
      place_ref: "スターバックス コーヒー 渋谷ストリーム店",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.65, lng: 139.7 },
      provenance: utteranceProvenance(["スタバ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkWhereVagueEvent(overrides?: Partial<Event>): Event {
  // generic_place は computeWhereSharpness で "vague"
  return mkFullyFixedEvent({
    where: {
      place_ref: "渋谷",
      placeType: "generic_place",
      provenance: utteranceProvenance(["渋谷"], "high"),
    },
    ...overrides,
  });
}

function mkWhereMissingEvent(overrides?: Partial<Event>): Event {
  return mkFullyFixedEvent({
    where: {
      place_ref: null,
      placeType: null,
      provenance: utteranceProvenance([], "low"),
    },
    missing_semantic_critical: ["where"],
    ...overrides,
  });
}

function mkDialogStateWithFocus(
  eventId: string,
  slot: "when" | "where" | "what" | "who",
  semanticMissStreak = 1,
): DialogState {
  return {
    version: 1,
    focus: { event_id: eventId, slot, narrowStep: 0 },
    conversationStatus: "clarifying",
    capturedHistory: [
      {
        turnIndex: 1,
        capturedAt: new Date().toISOString(),
        focus: { event_id: eventId, slot, narrowStep: 0 },
        capture: {
          subKind: "other",
          extractedAnchor: null,
          extractedCategory: null,
          extractedChain: null,
          rawSpan: "9時を10時に変更",
        },
        progressDelta: "flat",
      },
    ],
    semanticMissStreak,
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
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case A: focus=where + event fully fixed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Case A: focus=where + event fully fixed", () => {
  it("focus=null, status=stable, semanticMissStreak=0", () => {
    const reducerOut = mkDialogStateWithFocus("event_1", "where", 1);
    const events = [mkFullyFixedEvent({ event_id: "event_1" })];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state).not.toBeNull();
    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
    expect(result.state!.semanticMissStreak).toBe(0);
  });

  it("capturedHistory は維持される (reducer の取り込み記録は消えない)", () => {
    const reducerOut = mkDialogStateWithFocus("event_1", "where");
    const events = [mkFullyFixedEvent()];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.state!.capturedHistory).toHaveLength(1);
    expect(result.state!.capturedHistory[0].turnIndex).toBe(1);
    expect(result.state!.capturedHistory[0].capture.rawSpan).toBe(
      "9時を10時に変更",
    );
  });

  it("複数 events 全 fixed → focus=null (1 件目で missing 探索が break しない)", () => {
    const reducerOut = mkDialogStateWithFocus("event_1", "where");
    const events = [
      mkFullyFixedEvent({ event_id: "event_1" }),
      mkFullyFixedEvent({
        event_id: "event_2",
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
      }),
    ];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case B: focus=where + event where vague
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Case B: focus=where + event where vague", () => {
  it("focus 維持、semanticMissStreak も維持 (Rule 4)", () => {
    const reducerOut = mkDialogStateWithFocus("event_1", "where", 1);
    const events = [mkWhereVagueEvent({ event_id: "event_1" })];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.focusCleared).toBe(false);
    expect(result.state!.focus).toEqual({
      event_id: "event_1",
      slot: "where",
      narrowStep: 0,
    });
    // Rule 4 では state を変更しないので streak も保持
    expect(result.state!.semanticMissStreak).toBe(1);
  });

  it("where missing でも focus 維持", () => {
    const reducerOut = mkDialogStateWithFocus("event_1", "where", 2);
    const events = [mkWhereMissingEvent({ event_id: "event_1" })];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.focusCleared).toBe(false);
    expect(result.state!.focus).not.toBeNull();
    expect(result.state!.focus!.slot).toBe("where");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case C: reducer 後の focus 復活シナリオ (CEO 観測再現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Case C: reducer 後 focus 復活シナリオ (CEO 観測 2026-04-30 再現)", () => {
  it("modify (時刻変更) 後の reducer 結果でも final で focus clear", () => {
    // CEO 観測ケース:
    //   1. user「9時を10時に変更」
    //   2. pipeline → operationDispatcher で event_1.when.startTime: 09:00 → 10:00
    //   3. adapter 内 reconcile → focus=null (events fully fixed)
    //   4. route.ts L2042 で morningSession.dialogState = focus=null state
    //   5. advanceDialogState (TURN_CAPTURED) で focus={event_1, where, 0} を新規作成
    //      ← ここで CEO 観測の「focus.where 残留」 が発生
    //   6. ★ post-turn final reconcile (本 commit) で再 clear
    //
    // reducer 後 state を直接表現:
    const reducerOutAfterTurnCaptured = mkDialogStateWithFocus(
      "event_1",
      "where",
      1, // semanticMissStreak: reducer が「9時を10時に変更」 を where 候補として
      //                       capture 失敗扱い (subKind=other, progressDelta=flat) → ++1
    );
    // pipeline 後の events (modify が apply 済、event_1.when.startTime=10:00、全 fixed)
    const events = [
      mkFullyFixedEvent({
        event_id: "event_1",
        when: {
          startTime: "10:00",
          timeHint: null,
          provenance: utteranceProvenance(["10時"], "high"),
        },
      }),
    ];

    // post-turn final reconcile (route.ts L2358-2372 の最終ステップ)
    const result = reconcileDialogState(reducerOutAfterTurnCaptured, events);

    // CEO 不変条件: focus は missing slot を指すか null
    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
    expect(result.state!.semanticMissStreak).toBe(0); // 再 reconcile でリセット
    // capturedHistory は reducer の取り込み記録として残る
    expect(result.state!.capturedHistory).toHaveLength(1);
  });

  it("transport 変更後の reducer 結果でも final で focus clear", () => {
    // CEO 観測 turn 2 (「電車」) の post-modify シナリオ:
    //   電車 → deterministic synth で modify { patch.transport: "電車" }
    //   → event_1.transport=電車 + 全 fixed
    //   → reducer が focus=where を作成しても final で clear
    const reducerOut = mkDialogStateWithFocus("event_1", "where", 1);
    const events = [
      mkFullyFixedEvent({
        event_id: "event_1",
        transport: "電車",
      }),
    ];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case D: focus=where resolved + 別 event missing slot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Case D: focus=where resolved + 別 event missing → advance", () => {
  it("focus を次の missing slot を持つ event に advance", () => {
    const reducerOut = mkDialogStateWithFocus("event_1", "where", 0);
    const events = [
      mkFullyFixedEvent({ event_id: "event_1" }), // 全 fixed
      mkWhereMissingEvent({ event_id: "event_2" }), // where missing
    ];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).not.toBeNull();
    expect(result.state!.focus!.event_id).toBe("event_2");
    expect(result.state!.focus!.slot).toBe("where");
    expect(result.state!.conversationStatus).toBe("clarifying");
    // advance 時 streak は 0 にリセット (新 slot 用)
    expect(result.state!.semanticMissStreak).toBe(0);
  });

  it("event_1 where vague + event_2 where vague → focus は event_1 維持 (Rule 4)", () => {
    // 既存 focus が依然 missing/vague slot を指している場合は advance しない
    const reducerOut = mkDialogStateWithFocus("event_1", "where", 1);
    const events = [
      mkWhereVagueEvent({ event_id: "event_1" }),
      mkWhereMissingEvent({ event_id: "event_2" }),
    ];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.focusCleared).toBe(false);
    expect(result.state!.focus!.event_id).toBe("event_1");
    expect(result.state!.focus!.slot).toBe("where");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 追加: focus event 消滅 (Rule 2) — CEO 抜け補強
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Edge: focus が指す event が消滅", () => {
  it("focus event が effectiveEvents に存在しない → focus=null", () => {
    const reducerOut = mkDialogStateWithFocus("event_deleted", "where", 1);
    const events = [mkFullyFixedEvent({ event_id: "event_1" })];

    const result = reconcileDialogState(reducerOut, events);

    expect(result.focusCleared).toBe(true);
    expect(result.state!.focus).toBeNull();
    expect(result.state!.conversationStatus).toBe("stable");
  });
});
