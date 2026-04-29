/**
 * parsePlanOperations — PR-50 Commit 3
 *
 * 責務: LLM raw output (OPERATION_SCHEMA 形 = 全 field を null/値で持つ flat object)
 *       を `PlanOperation` discriminated union に変換する。
 *
 * test 観点:
 *   - 4 種 type (append / modify / answer / noop) すべての happy path
 *   - 不正 raw (type 不在、必須 field 不在、列挙外値) → null drop
 *   - parseEventDraft / parseEventPatch の境界条件
 *   - parsePlanOperations が drop element を log で記録しつつ通過
 */

import { describe, expect, it, vi } from "vitest";

import {
  parseEventDraft,
  parseEventPatch,
  parseOperation,
  parsePlanOperations,
} from "@/lib/alter-morning/comprehension/parsePlanOperations";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture builders (OPERATION_SCHEMA 形)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const provenance = {
  source_type: "utterance" as const,
  source_span: ["test"],
  provenance_confidence: "high" as const,
  from_utterance: true,
};

const validWhen = {
  startTime: "12:00",
  timeHint: null,
  provenance,
};
const validWhere = {
  place_ref: "新宿",
  placeType: "generic_place",
  provenance,
};
const validWhat = {
  activity: "ランチ",
  activityCanonical: "ランチ",
  provenance,
};
const validEventDraft = {
  when: validWhen,
  where: validWhere,
  what: validWhat,
  who: ["武藤"],
  transport: null,
  certainty: "asserted" as const,
};

function rawAppend(overrides?: Record<string, unknown>) {
  return {
    type: "append",
    eventDraft: validEventDraft,
    targetRef: null,
    patch: null,
    slot: null,
    value: null,
    reason: null,
    ...overrides,
  };
}

function rawModify(overrides?: Record<string, unknown>) {
  return {
    type: "modify",
    eventDraft: null,
    targetRef: "9時の予定",
    patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    slot: null,
    value: null,
    reason: null,
    ...overrides,
  };
}

function rawAnswer(overrides?: Record<string, unknown>) {
  return {
    type: "answer",
    eventDraft: null,
    targetRef: null,
    patch: null,
    slot: "where",
    value: "池袋",
    reason: null,
    ...overrides,
  };
}

function rawNoop(overrides?: Record<string, unknown>) {
  return {
    type: "noop",
    eventDraft: null,
    targetRef: null,
    patch: null,
    slot: null,
    value: null,
    reason: "acknowledgement",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseEventDraft
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseEventDraft", () => {
  it("happy path: 全 field 揃う raw → EventDraft", () => {
    const out = parseEventDraft(validEventDraft);
    expect(out).not.toBeNull();
    expect(out!.when.startTime).toBe("12:00");
    expect(out!.where.place_ref).toBe("新宿");
    expect(out!.what.activity).toBe("ランチ");
    expect(out!.who).toEqual(["武藤"]);
    expect(out!.transport).toBeNull();
    expect(out!.certainty).toBe("asserted");
  });

  it("null → null", () => {
    expect(parseEventDraft(null)).toBeNull();
  });

  it("非 object → null", () => {
    expect(parseEventDraft("string")).toBeNull();
    expect(parseEventDraft(123)).toBeNull();
  });

  it("when 不在 → null", () => {
    const { when: _omit, ...rest } = validEventDraft;
    expect(parseEventDraft(rest)).toBeNull();
  });

  it("who が array でない → null", () => {
    const broken = { ...validEventDraft, who: "not_array" };
    expect(parseEventDraft(broken)).toBeNull();
  });

  it("transport は string | null のみ受け付ける", () => {
    expect(parseEventDraft({ ...validEventDraft, transport: 123 })).toBeNull();
    expect(parseEventDraft({ ...validEventDraft, transport: "車" })).not.toBeNull();
    expect(parseEventDraft({ ...validEventDraft, transport: null })).not.toBeNull();
  });

  it("certainty が enum 外 → null", () => {
    expect(
      parseEventDraft({ ...validEventDraft, certainty: "wrong" }),
    ).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseEventPatch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseEventPatch", () => {
  it("when only patch → patch.when set, others undefined", () => {
    const out = parseEventPatch({
      when: { startTime: "10:00", endTime: null, timeHint: null },
      where: null,
      what: null,
      transport: null,
      who: null,
    });
    expect(out).not.toBeNull();
    expect(out!.when).toEqual({ startTime: "10:00", endTime: null, timeHint: null });
    expect(out!.where).toBeUndefined();
    expect(out!.what).toBeUndefined();
    expect(out!.transport).toBeUndefined();
    expect(out!.who).toBeUndefined();
  });

  it("transport string → patch.transport set", () => {
    const out = parseEventPatch({
      when: null,
      where: null,
      what: null,
      transport: "車",
      who: null,
    });
    expect(out).not.toBeNull();
    expect(out!.transport).toBe("車");
  });

  it("who array → patch.who set", () => {
    const out = parseEventPatch({
      when: null,
      where: null,
      what: null,
      transport: null,
      who: ["田中"],
    });
    expect(out).not.toBeNull();
    expect(out!.who).toEqual(["田中"]);
  });

  it("patch null → null (= modify_no_patch)", () => {
    expect(parseEventPatch(null)).toBeNull();
  });

  it("patch undefined → null", () => {
    expect(parseEventPatch(undefined)).toBeNull();
  });

  it("全 sub-field null → 空 patch object (validation 層で reject される)", () => {
    const out = parseEventPatch({
      when: null,
      where: null,
      what: null,
      transport: null,
      who: null,
    });
    expect(out).toEqual({});
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseOperation — type discriminator + per-type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseOperation: append", () => {
  it("happy path → AppendOperation", () => {
    const out = parseOperation(rawAppend());
    expect(out).not.toBeNull();
    if (out && out.type === "append") {
      expect(out.eventDraft.where.place_ref).toBe("新宿");
    } else {
      throw new Error("expected append operation");
    }
  });

  it("eventDraft 不在 → null", () => {
    const out = parseOperation(rawAppend({ eventDraft: null }));
    expect(out).toBeNull();
  });
});

describe("parseOperation: modify", () => {
  it("happy path → ModifyOperation", () => {
    const out = parseOperation(rawModify());
    expect(out).not.toBeNull();
    if (out && out.type === "modify") {
      expect(out.targetRef).toBe("9時の予定");
      expect(out.patch.when?.startTime).toBe("10:00");
    } else {
      throw new Error("expected modify operation");
    }
  });

  it("targetRef が string でない → null", () => {
    expect(parseOperation(rawModify({ targetRef: null }))).toBeNull();
    expect(parseOperation(rawModify({ targetRef: 123 }))).toBeNull();
  });

  it("patch null → null (= modify_no_patch)", () => {
    expect(parseOperation(rawModify({ patch: null }))).toBeNull();
  });
});

describe("parseOperation: answer", () => {
  it("happy path → AnswerOperation", () => {
    const out = parseOperation(rawAnswer());
    expect(out).not.toBeNull();
    if (out && out.type === "answer") {
      expect(out.slot).toBe("where");
      expect(out.value).toBe("池袋");
    } else {
      throw new Error("expected answer operation");
    }
  });

  it("slot enum 外 → null", () => {
    expect(parseOperation(rawAnswer({ slot: "invalid" }))).toBeNull();
  });

  it("value が string でない → null", () => {
    expect(parseOperation(rawAnswer({ value: null }))).toBeNull();
    expect(parseOperation(rawAnswer({ value: 123 }))).toBeNull();
  });

  it("5 種 enum slot すべて受け付ける", () => {
    for (const slot of ["when", "where", "what", "transport", "endpoint"] as const) {
      const out = parseOperation(rawAnswer({ slot, value: "x" }));
      expect(out).not.toBeNull();
    }
  });
});

describe("parseOperation: noop", () => {
  it("happy path with reason → NoopOperation", () => {
    const out = parseOperation(rawNoop());
    expect(out).not.toBeNull();
    if (out && out.type === "noop") {
      expect(out.reason).toBe("acknowledgement");
    } else {
      throw new Error("expected noop operation");
    }
  });

  it("reason null → reason field omitted", () => {
    const out = parseOperation(rawNoop({ reason: null }));
    expect(out).not.toBeNull();
    if (out && out.type === "noop") {
      expect(out.reason).toBeUndefined();
    } else {
      throw new Error("expected noop operation");
    }
  });

  it("reason enum 外 → reason field omitted (noop 自体は accept)", () => {
    const out = parseOperation(rawNoop({ reason: "invalid_reason" }));
    expect(out).not.toBeNull();
    if (out && out.type === "noop") {
      expect(out.reason).toBeUndefined();
    } else {
      throw new Error("expected noop operation");
    }
  });
});

describe("parseOperation: invalid", () => {
  it("type 不在 → null", () => {
    expect(parseOperation({ eventDraft: null })).toBeNull();
  });

  it("type が string でない → null", () => {
    expect(parseOperation({ type: 123 })).toBeNull();
  });

  it("unknown type → null", () => {
    expect(parseOperation({ type: "delete" })).toBeNull();
  });

  it("null / undefined / 非 object → null", () => {
    expect(parseOperation(null)).toBeNull();
    expect(parseOperation(undefined)).toBeNull();
    expect(parseOperation("string")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parsePlanOperations (array)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parsePlanOperations", () => {
  it("空配列 → 空配列", () => {
    expect(parsePlanOperations([])).toEqual([]);
  });

  it("4 種混在 → 全部 parse", () => {
    const out = parsePlanOperations([
      rawAppend(),
      rawModify(),
      rawAnswer(),
      rawNoop(),
    ]);
    expect(out).toHaveLength(4);
    expect(out.map((o) => o.type)).toEqual(["append", "modify", "answer", "noop"]);
  });

  it("不正 element は drop + warn log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = parsePlanOperations([
        rawAppend(),
        { type: "unknown_type" },
        rawNoop(),
      ]);
      expect(out).toHaveLength(2);
      expect(out.map((o) => o.type)).toEqual(["append", "noop"]);
      expect(warn).toHaveBeenCalledWith(
        "[alter-morning/comprehension] operation parse drop",
        expect.objectContaining({ index: 1 }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("全 element 不正 → 空配列", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = parsePlanOperations([null, { type: "x" }, "string"]);
      expect(out).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
  });
});
