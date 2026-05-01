/**
 * operationDispatcher — PR-50 Commit 4
 *
 * 検証範囲 (CEO 必須条件 7 つに対応):
 *   1. accepted のみ operation path → caller 責務 (legacyAdapter test で検証)
 *   2. invalid → events fallback → caller 責務
 *   3. append は既存 event を上書きしない
 *   4. modify は target の指定 field (when / transport) のみ patch
 *   5. answer は pendingClarify あり時のみ bind (secondary safety path)
 *   6. noop は state を変更しない
 *   7. dispatch 後 reconcile → caller 責務
 *
 * 加えて:
 *   - 1 turn 複数 operation の順序 apply
 *   - ID collision rename (defensive)
 *   - bind 失敗時の defensive fallback (state 不変)
 *   - PR-46 contract: where / what / who は modify で touch しない
 */

import { describe, expect, it } from "vitest";

import { dispatchOperations } from "@/lib/alter-morning/planning/operationDispatcher";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";
import type { PendingClarify } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkPriorEvent(overrides?: Partial<Event>): Event {
  return {
    event_id: "event_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"], "high"),
    },
    where: {
      place_ref: "サドヤ",
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance(["サドヤ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: ["田中"],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkAppendOp(overrides?: Partial<PlanOperation & { type: "append" }>): PlanOperation {
  return {
    type: "append",
    eventDraft: {
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
      who: ["武藤"],
      transport: null,
      certainty: "asserted",
    },
    ...overrides,
  };
}

function mkPendingWhere(): PendingClarify {
  return {
    event_id: "event_1",
    slot: "where",
    kind: "where_center",
    scope: { timeLabel: "9時", activityLabel: "コーヒー", eventOrdinal: 1 },
    question: "どのあたり？",
    askedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 必須条件 6: noop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchOperations: noop", () => {
  it("noop だけ → effectiveEvents = priorPersistedEvents (state 不変)", () => {
    const prior = [mkPriorEvent()];
    const result = dispatchOperations({
      acceptedOperations: [{ type: "noop", reason: "acknowledgement" }],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toEqual(prior);
    expect(result.dispatch).toEqual([{ type: "noop", action: "noop" }]);
  });

  it("空 operations + 空 prior → 空 events", () => {
    const result = dispatchOperations({
      acceptedOperations: [],
      priorPersistedEvents: [],
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toEqual([]);
    expect(result.dispatch).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 必須条件 3: append が既存 event を上書きしない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchOperations: append", () => {
  it("空 prior + 1 append → effectiveEvents は新 event 1 件、id=event_1", () => {
    const result = dispatchOperations({
      acceptedOperations: [mkAppendOp()],
      priorPersistedEvents: [],
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].event_id).toBe("event_1");
    expect(result.effectiveEvents[0].turn_mode).toBe("append");
    expect(result.effectiveEvents[0].where.place_ref).toBe("新宿");
    expect(result.effectiveEvents[0].who).toEqual(["武藤"]);
  });

  it("既存 event_1 + append → priorは不変、append は event_2", () => {
    const prior = [mkPriorEvent()];
    const result = dispatchOperations({
      acceptedOperations: [mkAppendOp()],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toHaveLength(2);
    // prior は完全保持
    expect(result.effectiveEvents[0]).toEqual(prior[0]);
    // append は event_2 (id 衝突を回避)
    expect(result.effectiveEvents[1].event_id).toBe("event_2");
    expect(result.effectiveEvents[1].where.place_ref).toBe("新宿");
  });

  it("missing_semantic_critical の再計算: where null draft → ['where']", () => {
    const op: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: null,
          placeType: null,
          provenance: utteranceProvenance([], "low"),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
        who: [],
        transport: null,
        certainty: "asserted",
      },
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: [],
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents[0].missing_semantic_critical).toEqual([
      "where",
    ]);
  });

  it("複数 append → 連番 id (event_1, event_2)", () => {
    const result = dispatchOperations({
      acceptedOperations: [mkAppendOp(), mkAppendOp()],
      priorPersistedEvents: [],
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toHaveLength(2);
    expect(result.effectiveEvents.map((e) => e.event_id)).toEqual([
      "event_1",
      "event_2",
    ]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 必須条件 4: modify は target の指定 field (when / transport) のみ patch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchOperations: modify", () => {
  it("startTime patch → prior の when.startTime のみ更新、where/what/who 不変", () => {
    const prior = [mkPriorEvent()];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toHaveLength(1);
    const updated = result.effectiveEvents[0];
    expect(updated.event_id).toBe("event_1");
    expect(updated.when.startTime).toBe("10:00");
    // where / what / who は prior 維持 (PR-46 contract)
    expect(updated.where.place_ref).toBe("サドヤ");
    expect(updated.what.activity).toBe("コーヒー");
    expect(updated.who).toEqual(["田中"]);
    // target_ref / change_scope は clear
    expect(updated.target_ref).toBeNull();
    expect(updated.change_scope).toBeNull();
  });

  it("transport patch → prior の transport のみ更新", () => {
    const prior = [mkPriorEvent({ transport: null })];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "今日の予定",
      patch: { transport: "車" },
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents[0].transport).toBe("車");
    // when / where / what は prior 維持
    expect(result.effectiveEvents[0].when.startTime).toBe("09:00");
    expect(result.effectiveEvents[0].where.place_ref).toBe("サドヤ");
  });

  it("PR-46 contract: patch.where / patch.what / patch.who は touch しない", () => {
    const prior = [mkPriorEvent()];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "今日の予定",
      patch: {
        // 仮に LLM が患った patch を入れてきても、Commit 4 暫定で touch しない
        where: {
          place_ref: "別の場所",
          placeType: "generic_place",
        } as never,
        what: { activity: "別の活動" } as never,
        who: ["別人"],
      },
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    // where / what / who は prior 維持
    expect(result.effectiveEvents[0].where.place_ref).toBe("サドヤ");
    expect(result.effectiveEvents[0].what.activity).toBe("コーヒー");
    expect(result.effectiveEvents[0].who).toEqual(["田中"]);
  });

  it("single_event_fallback: targetRef 解決失敗でも prior 1 件なら apply", () => {
    const prior = [mkPriorEvent()];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "謎の予定",
      patch: { transport: "電車" },
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents[0].transport).toBe("電車");
    expect(result.dispatch[0].action).toBe("modify_single_event_fallback");
    expect(result.dispatch[0].strategy).toBe("single_event_fallback");
  });

  it("defensive: prior 複数 + targetRef 解決失敗 → state 不変 (modify_unresolved)", () => {
    const prior = [
      mkPriorEvent({ event_id: "event_1" }),
      mkPriorEvent({ event_id: "event_2" }),
    ];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "謎の予定",
      patch: { transport: "電車" },
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    // state 不変 (validation 層で reject されているはずだが defensive)
    expect(result.effectiveEvents).toEqual(prior);
    expect(result.dispatch[0].action).toBe("modify_unresolved");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 必須条件 5: answer (secondary safety path)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchOperations: answer (secondary safety path)", () => {
  it("pendingClarify=where + answer → bindAnswerToSlot で where を update", () => {
    const prior = [mkPriorEvent({
      where: {
        place_ref: null,
        placeType: null,
        provenance: utteranceProvenance([], "low"),
      },
      missing_semantic_critical: ["where"],
    })];
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: mkPendingWhere(),
    });
    expect(result.effectiveEvents[0].where.place_ref).toBe("池袋");
    expect(result.dispatch[0].action).toBe("answer_bound");
  });

  it("defensive: pendingClarify=null → state 不変 (answer_bind_skipped)", () => {
    const prior = [mkPriorEvent()];
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toEqual(prior);
    expect(result.dispatch[0].action).toBe("answer_bind_skipped");
  });

  it("bind 失敗 (where に「決めてない」) → state 不変 (answer_bind_failed)", () => {
    const prior = [mkPriorEvent({
      where: {
        place_ref: null,
        placeType: null,
        provenance: utteranceProvenance([], "low"),
      },
      missing_semantic_critical: ["where"],
    })];
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "決めてない",
    };
    const result = dispatchOperations({
      acceptedOperations: [op],
      priorPersistedEvents: prior,
      priorPendingClarify: mkPendingWhere(),
    });
    // bindAnswerToSlot が "決めてない" を reject → state 不変
    expect(result.effectiveEvents[0].where.place_ref).toBeNull();
    expect(result.dispatch[0].action).toBe("answer_bind_failed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1 turn 複数 operation の順序 apply
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchOperations: multi-operation ordering", () => {
  it("modify + append → prior が patch + 新 event が追加", () => {
    const prior = [mkPriorEvent()];
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    };
    const result = dispatchOperations({
      acceptedOperations: [modifyOp, mkAppendOp()],
      priorPersistedEvents: prior,
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toHaveLength(2);
    // 最初: prior が patch
    expect(result.effectiveEvents[0].event_id).toBe("event_1");
    expect(result.effectiveEvents[0].when.startTime).toBe("10:00");
    // 次: append (id 衝突回避で event_2)
    expect(result.effectiveEvents[1].event_id).toBe("event_2");
    expect(result.effectiveEvents[1].where.place_ref).toBe("新宿");
  });

  it("append + noop → noop は state を変更しない", () => {
    const result = dispatchOperations({
      acceptedOperations: [mkAppendOp(), { type: "noop" }],
      priorPersistedEvents: [],
      priorPendingClarify: null,
    });
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.dispatch.map((d) => d.action)).toEqual(["appended", "noop"]);
  });
});
