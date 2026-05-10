/**
 * dispatchEventMerge — append + same event_id (CEO 2026-05-01)
 *
 * 不変条件「same event_id is the same plan」:
 *   turn_mode に関わらず、cur.event_id が prior に存在するなら同一予定の更新
 *   (merged_into_prior) であり、新規追加 (kept_as_new) してはならない。
 *
 * scope (今回): dispatchEventMerge の append 分岐のみ。
 *   create / modify は既存 contract を維持。
 *
 * 必須 6 test (GPT 2026-05-01):
 *   1. append + same event_id + transport → events数1, transport反映, merged_into_prior
 *   2. append + same event_id + what → events数1, what反映, merged_into_prior
 *   3. append + new event_id → kept_as_new 維持 (regression)
 *   4. operation append fresh_id → kept_as_new 維持 (regression — bind 以外の append)
 *   5. multi-event 片方更新 + 他 event 不変
 *   6. where exact_proper_noun は priorWhereLocked で保持される
 */

import { describe, expect, test } from "vitest";
import {
  dispatchEventMerge,
  mergeIntoPriorCreate,
} from "@/lib/alter-morning/planning/eventMergeDispatch";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import { utteranceProvenance, toolProvenance } from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Live preview の Turn 1 後の event_1 を再現:
 *   - turn_mode="append" (operations path の eventDraftToEvent が hardcode)
 *   - where=exact_proper_noun + coordinates (selection 後)
 *   - what.activity="" (空文字、null ではない)
 *   - transport=null
 */
function mkEvent1AfterSelection(): Event {
  return {
    event_id: "event_1",
    turn_mode: "append",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"], "high"),
    },
    where: {
      place_ref: "スターバックス コーヒー 渋谷ストリーム店",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.657502, lng: 139.7024872 },
      provenance: toolProvenance("high"),
    },
    what: {
      activity: "", // ★ 空文字 (live trace 確認、null ではなく "")
      activityCanonical: "",
      provenance: utteranceProvenance([], "low"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: ["what"],
    missing_solver_blockers: [],
  };
}

/**
 * Branch A bindAnswerToSlot(transport) の戻り値を再現:
 *   - 同 event_id (event_1)
 *   - turn_mode="append" 維持 (bindAnswerToSlot は turn_mode を変更しない)
 *   - transport="電車" 追加
 */
function mkEvent1AfterTransportBind(): Event {
  return {
    ...mkEvent1AfterSelection(),
    transport: "電車",
  };
}

/**
 * Branch A bindAnswerToSlot(what) の戻り値を再現:
 *   - 同 event_id (event_1)
 *   - turn_mode="append" 維持
 *   - what.activity="ミーティング" 追加
 */
function mkEvent1AfterWhatBind(): Event {
  return {
    ...mkEvent1AfterSelection(),
    what: {
      activity: "ミーティング",
      activityCanonical: "ミーティング",
      provenance: utteranceProvenance(["ミーティング"], "high"),
    },
    missing_semantic_critical: [], // bind 後は what が埋まる
  };
}

/**
 * 完全に新しい予定 (operations path append 経由)。fresh event_id。
 */
function mkFreshAppendEvent(eventId = "event_2"): Event {
  return {
    event_id: eventId,
    turn_mode: "append",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "12:00",
      timeHint: null,
      provenance: utteranceProvenance(["12時"], "high"),
    },
    where: {
      place_ref: "新宿",
      placeType: "generic_place",
      provenance: utteranceProvenance(["新宿"], "high"),
    },
    what: {
      activity: "ランチ",
      activityCanonical: "ランチ",
      provenance: utteranceProvenance(["ランチ"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 必須 6 tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchEventMerge — append + same event_id (CEO 2026-05-01)", () => {
  test("Test 1: append + same event_id + transport → events数1, transport反映, merged_into_prior", () => {
    const prior = mkEvent1AfterSelection();
    const cur = mkEvent1AfterTransportBind();

    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior],
    });

    // events 増えない
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].event_id).toBe("event_1");

    // transport が反映されている
    expect(result.effectiveEvents[0].transport).toBe("電車");

    // dispatch action は merged_into_prior
    expect(result.dispatch).toHaveLength(1);
    expect(result.dispatch[0].action).toBe("merged_into_prior");
    expect(result.dispatch[0].cur_turn_mode).toBe("append");
    expect(result.dispatch[0].target_event_id).toBe("event_1");
  });

  test("Test 2: append + same event_id + what → events数1, what反映, merged_into_prior", () => {
    const prior = mkEvent1AfterSelection();
    const cur = mkEvent1AfterWhatBind();

    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior],
    });

    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].event_id).toBe("event_1");

    // what.activity が cur から prior に反映 (prior="" + cur="ミーティング" → "ミーティング")
    expect(result.effectiveEvents[0].what.activity).toBe("ミーティング");
    expect(result.effectiveEvents[0].what.activityCanonical).toBe("ミーティング");

    // dispatch
    expect(result.dispatch[0].action).toBe("merged_into_prior");
  });

  test("Test 3: append + new event_id (no collision) → kept_as_new 維持 (regression)", () => {
    const prior = mkEvent1AfterSelection();
    const cur = mkFreshAppendEvent("event_2"); // 別 event_id

    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior],
    });

    // 2 events
    expect(result.effectiveEvents).toHaveLength(2);
    expect(result.effectiveEvents[0].event_id).toBe("event_1");
    expect(result.effectiveEvents[1].event_id).toBe("event_2");

    // dispatch
    expect(result.dispatch).toHaveLength(1);
    expect(result.dispatch[0].action).toBe("kept_as_new");
  });

  test("Test 4: operations path append (fresh id, simulating eventDraftToEvent output) → kept_as_new", () => {
    // operations path は generateNonCollidingEventId で fresh id を発行する想定。
    // ここでは prior=[event_1] に対し cur=event_3 (event_2 をスキップした fresh id) を
    // 渡し、id 衝突しないことを確認する。
    const prior = mkEvent1AfterSelection();
    const cur = mkFreshAppendEvent("event_3");

    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior],
    });

    expect(result.effectiveEvents).toHaveLength(2);
    expect(result.dispatch[0].action).toBe("kept_as_new");
  });

  test("Test 5: multi-event 片方だけ更新, 他 event 不変", () => {
    const event1 = mkEvent1AfterSelection();
    const event2 = mkFreshAppendEvent("event_2"); // 別予定 (12:00 新宿 ランチ)

    // Branch A bind が event_1 のみ transport を更新するシナリオ
    const event1WithTransport = mkEvent1AfterTransportBind();

    const result = dispatchEventMerge({
      currentEvents: [event1WithTransport, event2], // event_2 は変化なし
      priorPersistedEvents: [event1, event2],
    });

    expect(result.effectiveEvents).toHaveLength(2);

    // event_1 が更新
    const eff1 = result.effectiveEvents.find((e) => e.event_id === "event_1");
    expect(eff1?.transport).toBe("電車");

    // event_2 は完全に同じ
    const eff2 = result.effectiveEvents.find((e) => e.event_id === "event_2");
    expect(eff2?.where.place_ref).toBe("新宿");
    expect(eff2?.what.activity).toBe("ランチ");
    expect(eff2?.transport).toBe(null);

    // dispatch
    const dispatch1 = result.dispatch.find((d) => d.cur_event_id === "event_1");
    const dispatch2 = result.dispatch.find((d) => d.cur_event_id === "event_2");
    expect(dispatch1?.action).toBe("merged_into_prior");
    // event_2 は同 id 衝突なので、これも merged_into_prior になる (cur と prior が同一の event_2)
    expect(dispatch2?.action).toBe("merged_into_prior");
  });

  test("Test 6: where exact_proper_noun は priorWhereLocked で保持される", () => {
    const prior = mkEvent1AfterSelection(); // where=exact_proper_noun (selection 確定)

    // Branch A bind が誤って where を上書きしようとするケース (例: undecided 表現が
    // bindAnswerToSlot を通過する regression を想定)
    const curWithDifferentWhere: Event = {
      ...prior,
      where: {
        place_ref: "別の場所",
        placeType: "generic_place",
        provenance: utteranceProvenance(["別の場所"], "high"),
      },
      transport: "電車",
    };

    const result = dispatchEventMerge({
      currentEvents: [curWithDifferentWhere],
      priorPersistedEvents: [prior],
    });

    expect(result.effectiveEvents).toHaveLength(1);

    // priorWhereLocked により where は prior 保持
    expect(result.effectiveEvents[0].where.place_ref).toBe(
      "スターバックス コーヒー 渋谷ストリーム店",
    );
    expect(result.effectiveEvents[0].where.placeType).toBe("exact_proper_noun");
    expect(result.effectiveEvents[0].where.coordinates).toEqual({
      lat: 35.657502,
      lng: 139.7024872,
    });

    // ただし transport は更新される (cur-wins)
    expect(result.effectiveEvents[0].transport).toBe("電車");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 補強: mergeIntoPriorCreate の挙動証明 (GPT 必須条件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mergeIntoPriorCreate — bind path slot update semantic", () => {
  test("prior.transport=null, cur.transport=電車 → 電車", () => {
    const prior = mkEvent1AfterSelection(); // transport=null
    const cur = mkEvent1AfterTransportBind(); // transport=電車

    const merged = mergeIntoPriorCreate(prior, cur);

    expect(merged.transport).toBe("電車");
  });

  test("prior.what.activity='', cur.what.activity=ミーティング → ミーティング", () => {
    const prior = mkEvent1AfterSelection(); // what.activity=""
    const cur = mkEvent1AfterWhatBind(); // what.activity="ミーティング"

    const merged = mergeIntoPriorCreate(prior, cur);

    expect(merged.what.activity).toBe("ミーティング");
    expect(merged.what.activityCanonical).toBe("ミーティング");
  });

  test("priorWhereLocked (exact_proper_noun) → cur.where が override されない", () => {
    const prior = mkEvent1AfterSelection(); // exact_proper_noun
    const cur: Event = {
      ...prior,
      where: {
        place_ref: "別の場所",
        placeType: "generic_place",
        provenance: utteranceProvenance(["別"], "high"),
      },
    };

    const merged = mergeIntoPriorCreate(prior, cur);

    expect(merged.where.place_ref).toBe(
      "スターバックス コーヒー 渋谷ストリーム店",
    );
    expect(merged.where.placeType).toBe("exact_proper_noun");
  });

  test("event_id は prior 維持 (cur が異なる event_id を持っていても無視)", () => {
    const prior = mkEvent1AfterSelection();
    const cur: Event = {
      ...prior,
      event_id: "event_999", // 不正な id
      transport: "電車",
    };

    const merged = mergeIntoPriorCreate(prior, cur);

    expect(merged.event_id).toBe("event_1"); // prior 維持
    expect(merged.transport).toBe("電車"); // transport は cur 採用
  });
});
