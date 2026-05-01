/**
 * validatePlanOperation — PR-50 unit tests (CEO 2026-04-30)
 *
 * 検証観点:
 *   - append: empty draft / target_ref 混入 reject
 *   - modify: empty patch / target unresolved reject
 *   - answer: pendingClarify 不在 / slot mismatch / empty value reject
 *   - noop: 常に accept
 *   - prior 1 件 single_event_fallback で modify accept
 */

import { describe, it, expect } from "vitest";
import {
  validatePlanOperation,
  validatePlanOperations,
} from "@/lib/alter-morning/comprehension/validateOperation";
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { PendingClarify } from "@/lib/alter-morning/types";

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
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
      coordinates: null,
      provenance: utteranceProvenance(["サドヤ"], "high"),
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

function mkPendingClarify(
  overrides: Partial<PendingClarify> = {},
): PendingClarify {
  return {
    event_id: "e1",
    slot: "where",
    kind: "where_center",
    scope: { timeLabel: "9時", activityLabel: "コーヒー", eventOrdinal: 1 },
    question: "どのあたり？",
    askedAt: new Date().toISOString(),
    semanticMissCount: 0,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperation - append
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validatePlanOperation — append", () => {
  it("[accepted] eventDraft に slot あり → accept", () => {
    const op: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "新宿",
          placeType: null,
          coordinates: null,
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
      },
    };
    const result = validatePlanOperation(op, {
      priorEvents: [],
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(true);
  });

  it("[reject] 全 slot 空 → append_empty_draft", () => {
    const op: PlanOperation = {
      type: "append",
      eventDraft: {
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
      },
    };
    const result = validatePlanOperation(op, {
      priorEvents: [],
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("append_empty_draft");
    }
  });

  it("[reject] LLM が誤って targetRef 混入 → append_with_target_ref", () => {
    const op = {
      type: "append" as const,
      eventDraft: {
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "新宿",
          placeType: null,
          coordinates: null,
          provenance: utteranceProvenance(["新宿"], "high"),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
        who: [],
        transport: null,
        certainty: "asserted" as const,
      },
      targetRef: "9時の予定", // ← schema 違反 (LLM ミス)
    } as unknown as PlanOperation;
    const result = validatePlanOperation(op, {
      priorEvents: [],
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("append_with_target_ref");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperation - modify
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validatePlanOperation — modify", () => {
  it("[accepted] prior 複数 + 解決可能 targetRef → accept", () => {
    const priorEvents = [
      mkEvent({
        event_id: "e1",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
      }),
      mkEvent({
        event_id: "e2",
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
      }),
    ];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00" } },
    };
    const result = validatePlanOperation(op, {
      priorEvents,
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(true);
  });

  it("[accepted] prior 1 件 → single_event_fallback で accept", () => {
    const priorEvents = [mkEvent({ event_id: "e1" })];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "今日の予定", // resolveTargetRef では解決しない文字列
      patch: { transport: "車" },
    };
    const result = validatePlanOperation(op, {
      priorEvents,
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(true);
  });

  it("[reject] patch 空 → modify_no_patch", () => {
    const priorEvents = [mkEvent({ event_id: "e1" })];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "今日の予定",
      patch: {},
    };
    const result = validatePlanOperation(op, {
      priorEvents,
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("modify_no_patch");
    }
  });

  it("[reject] prior 0 件 → modify_target_unresolved", () => {
    const op: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00" } },
    };
    const result = validatePlanOperation(op, {
      priorEvents: [],
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("modify_target_unresolved");
    }
  });

  it("[reject] prior 複数 + 解決不能 targetRef → modify_target_unresolved", () => {
    const priorEvents = [
      mkEvent({ event_id: "e1" }),
      mkEvent({ event_id: "e2" }),
    ];
    const op: PlanOperation = {
      type: "modify",
      targetRef: "存在しない予定",
      patch: { transport: "車" },
    };
    const result = validatePlanOperation(op, {
      priorEvents,
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("modify_target_unresolved");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperation - answer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validatePlanOperation — answer", () => {
  it("[accepted] pendingClarify あり + slot 一致 + value あり → accept", () => {
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const result = validatePlanOperation(op, {
      priorEvents: [mkEvent()],
      priorPendingClarify: mkPendingClarify({ slot: "where" }),
    });
    expect(result.accepted).toBe(true);
  });

  it("[reject] pendingClarify 不在 → answer_no_pending_clarify", () => {
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const result = validatePlanOperation(op, {
      priorEvents: [],
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("answer_no_pending_clarify");
    }
  });

  it("[reject] slot mismatch → answer_slot_mismatch", () => {
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const result = validatePlanOperation(op, {
      priorEvents: [mkEvent()],
      priorPendingClarify: mkPendingClarify({ slot: "when" }), // pending は when を聞いている
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("answer_slot_mismatch");
    }
  });

  it("[reject] value 空 → answer_empty_value", () => {
    const op: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "  ",
    };
    const result = validatePlanOperation(op, {
      priorEvents: [mkEvent()],
      priorPendingClarify: mkPendingClarify({ slot: "where" }),
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe("answer_empty_value");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperation - noop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validatePlanOperation — noop", () => {
  it("[accepted] noop は常に accept (副作用なし)", () => {
    const op: PlanOperation = { type: "noop", reason: "acknowledgement" };
    const result = validatePlanOperation(op, {
      priorEvents: [],
      priorPendingClarify: null,
    });
    expect(result.accepted).toBe(true);
  });

  it("[accepted] noop with no reason 指定でも accept", () => {
    const op: PlanOperation = { type: "noop" };
    const result = validatePlanOperation(op, {
      priorEvents: [mkEvent()],
      priorPendingClarify: mkPendingClarify(),
    });
    expect(result.accepted).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validatePlanOperations — 配列版
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validatePlanOperations — batch", () => {
  it("全 accept → allAccepted=true", () => {
    const ops: PlanOperation[] = [
      {
        type: "modify",
        targetRef: "今日の予定",
        patch: { transport: "車" },
      },
      { type: "noop", reason: "acknowledgement" },
    ];
    const result = validatePlanOperations(ops, {
      priorEvents: [mkEvent()],
      priorPendingClarify: null,
    });
    expect(result.allAccepted).toBe(true);
    expect(result.acceptedOperations).toHaveLength(2);
    expect(result.rejections).toHaveLength(0);
  });

  it("1 件 reject → allAccepted=false、rejections に reason", () => {
    const ops: PlanOperation[] = [
      {
        type: "modify",
        targetRef: "今日の予定",
        patch: {},
      }, // ← reject (modify_no_patch)
      { type: "noop" },
    ];
    const result = validatePlanOperations(ops, {
      priorEvents: [mkEvent()],
      priorPendingClarify: null,
    });
    expect(result.allAccepted).toBe(false);
    expect(result.acceptedOperations).toHaveLength(1); // noop のみ
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0].reason).toBe("modify_no_patch");
  });
});
