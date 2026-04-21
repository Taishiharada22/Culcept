/**
 * Comprehension-First v1.3+ Wave 1 Contract Tests
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md
 *
 * カバレッジ:
 *   - L1 Event Schema 基本性質
 *   - L1.2 Provenance Checker (hallucinate 降格 / 正規化一致 / spans 実在検査)
 *   - L2.1 Gap Resolver (semantic / solver_blocker 2 系統 / clarify 優先度)
 *   - L2.2 Time Solver (startTime anchor / timeHint 逆引き / 境界時刻 / violation)
 *   - Turn 2+ Modify Router (time_bucket / activity / place / ordinal)
 *   - L1 Pipeline 統合 (生 JSON → event_id 採番 → checker)
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  type Event,
  type Provenance,
  resetEventCounter,
  utteranceProvenance,
  baselineProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

import {
  normalizeForMatch,
  verifySpansInUtterance,
  demoteIfHallucinated,
  checkEvent,
} from "@/lib/alter-morning/comprehension/provenanceChecker";

import {
  runL1Pipeline,
} from "@/lib/alter-morning/comprehension/l1Pipeline";

import {
  parseHHmm,
  formatHHmm,
  resolveStartTimeAnchor,
  deriveTimeHintFromStartTime,
  solveTimeLine,
} from "@/lib/alter-morning/planning/timeSolver";

import {
  resolveGaps,
  resolveEventGap,
} from "@/lib/alter-morning/planning/gapResolver";

import {
  resolveTargetRef,
  annotateTargetRefConfidence,
} from "@/lib/alter-morning/planning/modifyRouter";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "event_x",
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
  return { ...base, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L1.2 Provenance Checker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L1.2 normalizeForMatch", () => {
  test("空白・句読点を削除し小文字化する", () => {
    expect(normalizeForMatch("朝は、サドヤで、")).toBe("朝はサドヤで");
    expect(normalizeForMatch("Hello World!")).toBe("helloworld");
    expect(normalizeForMatch("  ")).toBe("");
  });

  test("NFKC 半角/全角統一", () => {
    expect(normalizeForMatch("カフェ")).toBe(normalizeForMatch("カフェ"));
    expect(normalizeForMatch("サドヤ")).toBe(normalizeForMatch("ｻﾄﾞﾔ"));
  });
});

describe("L1.2 verifySpansInUtterance", () => {
  test("spans が utterance に全て含まれれば true", () => {
    expect(verifySpansInUtterance(["サドヤ"], "朝はサドヤでコーヒー")).toBe(true);
    expect(verifySpansInUtterance(["サドヤ", "コーヒー"], "朝はサドヤでコーヒー")).toBe(true);
  });

  test("spans のいずれかが含まれなければ false", () => {
    expect(verifySpansInUtterance(["二藍"], "朝はカフェで軽く")).toBe(false);
    expect(verifySpansInUtterance(["サドヤ", "二藍"], "朝はサドヤでコーヒー")).toBe(false);
  });

  test("spans が空配列なら false（utterance 申告なのに根拠なし＝嘘扱い）", () => {
    expect(verifySpansInUtterance([], "朝はサドヤ")).toBe(false);
  });

  test("utterance が空なら false", () => {
    expect(verifySpansInUtterance(["サドヤ"], "")).toBe(false);
  });

  test("句読点込みの発話でも正規化一致する", () => {
    expect(verifySpansInUtterance(["サドヤ"], "朝は、サドヤで、コーヒー。")).toBe(true);
  });
});

describe("L1.2 demoteIfHallucinated", () => {
  test("utterance 申告で spans が存在 → そのまま", () => {
    const prov = utteranceProvenance(["サドヤ"]);
    const out = demoteIfHallucinated(prov, "朝はサドヤで");
    expect(out).toBe(prov);
  });

  test("utterance 申告で spans が不在 → inferred に降格", () => {
    const prov = utteranceProvenance(["二藍"]);
    const out = demoteIfHallucinated(prov, "朝はカフェ");
    expect(out.source_type).toBe("inferred");
    expect(out.source_span).toEqual([]);
    expect(out.from_utterance).toBe(false);
  });

  test("baseline 申告は降格しない", () => {
    const prov = baselineProvenance();
    const out = demoteIfHallucinated(prov, "朝はカフェ");
    expect(out).toBe(prov);
  });
});

describe("L1.2 checkEvent", () => {
  test("発話外の hallucinate place を null にクリア", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "二藍",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["二藍"]),
      },
      what: {
        activity: "カフェ",
        activityCanonical: "カフェ",
        provenance: utteranceProvenance(["カフェ"]),
      },
      when: {
        startTime: "09:00",
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"]),
      },
    });

    const checked = checkEvent(ev, "朝はカフェで軽く");
    expect(checked.where.place_ref).toBeNull();
    expect(checked.where.provenance.source_type).toBe("inferred");
    expect(checked.missing_semantic_critical).toContain("where");
  });

  test("正当な utterance place は通過", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["サドヤ"]),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "カフェ",
        provenance: utteranceProvenance(["コーヒー"]),
      },
      when: {
        startTime: "09:00",
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"]),
      },
    });

    const checked = checkEvent(ev, "朝はサドヤでコーヒー");
    expect(checked.where.place_ref).toBe("サドヤ");
    expect(checked.missing_semantic_critical).toEqual([]);
  });

  test("baseline place は utterance に無くても降格しない", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "自宅",
        placeType: "known_base",
        provenance: baselineProvenance(),
      },
      what: {
        activity: "ゆっくり",
        activityCanonical: "休息",
        provenance: utteranceProvenance(["ゆっくり"]),
      },
      when: {
        startTime: null,
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"]),
      },
    });

    const checked = checkEvent(ev, "朝はゆっくり過ごす");
    expect(checked.where.place_ref).toBe("自宅");
    expect(checked.missing_semantic_critical).toEqual([]);
  });

  test("when/where/what すべて欠損 → missing_semantic_critical 3件", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const checked = checkEvent(ev, "何もない");
    expect(checked.missing_semantic_critical).toEqual(
      expect.arrayContaining(["when", "where", "what"]),
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L2.2 Time Solver
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.2 parseHHmm / formatHHmm", () => {
  test("正常形式", () => {
    expect(parseHHmm("09:00")).toBe(540);
    expect(parseHHmm("23:59")).toBe(23 * 60 + 59);
    expect(formatHHmm(540)).toBe("09:00");
    expect(formatHHmm(0)).toBe("00:00");
  });

  test("不正形式 → null", () => {
    expect(parseHHmm("24:00")).toBeNull();
    expect(parseHHmm("invalid")).toBeNull();
    expect(parseHHmm(null)).toBeNull();
    expect(formatHHmm(24 * 60)).toBeNull();
    expect(formatHHmm(-1)).toBeNull();
  });
});

describe("L2.2 deriveTimeHintFromStartTime (bug1Bug2Triage 互換)", () => {
  test("境界時刻 10:59 → morning", () => {
    expect(deriveTimeHintFromStartTime("10:59")).toBe("morning");
  });
  test("境界時刻 11:00 → noon", () => {
    expect(deriveTimeHintFromStartTime("11:00")).toBe("noon");
  });
  test("境界時刻 13:59 → noon", () => {
    expect(deriveTimeHintFromStartTime("13:59")).toBe("noon");
  });
  test("境界時刻 14:00 → afternoon", () => {
    expect(deriveTimeHintFromStartTime("14:00")).toBe("afternoon");
  });
  test("境界時刻 17:00 → evening", () => {
    expect(deriveTimeHintFromStartTime("17:00")).toBe("evening");
  });
  test("null / 不正 → null", () => {
    expect(deriveTimeHintFromStartTime(null)).toBeNull();
    expect(deriveTimeHintFromStartTime("invalid")).toBeNull();
  });
});

describe("L2.2 resolveStartTimeAnchor", () => {
  test("明示 startTime が優先", () => {
    const ev = mkEvent({
      when: {
        startTime: "10:30",
        timeHint: "afternoon",
        provenance: utteranceProvenance(["10:30"]),
      },
    });
    expect(resolveStartTimeAnchor(ev)).toBe("10:30");
  });

  test("timeHint から anchor", () => {
    const ev = mkEvent({
      when: {
        startTime: null,
        timeHint: "noon",
        provenance: utteranceProvenance(["昼"]),
      },
    });
    expect(resolveStartTimeAnchor(ev)).toBe("12:00");
  });

  test("両方 null → null", () => {
    expect(resolveStartTimeAnchor(mkEvent({}))).toBeNull();
  });
});

describe("L2.2 solveTimeLine", () => {
  test("単一 event が正常に解ける", () => {
    const tl = solveTimeLine([
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: "09:00",
          timeHint: "morning",
          provenance: utteranceProvenance(["9時"]),
        },
      }),
    ]);
    expect(tl.entries).toHaveLength(1);
    expect(tl.entries[0].startTime).toBe("09:00");
    expect(tl.entries[0].endTime).toBe("10:00");
    expect(tl.entries[0].violation).toBeNull();
    expect(tl.violations).toHaveLength(0);
  });

  test("2 events の正常系: overlap なし・transport 確保", () => {
    const tl = solveTimeLine([
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: "09:00",
          timeHint: "morning",
          provenance: utteranceProvenance(["9時"]),
        },
      }),
      mkEvent({
        event_id: "event_2",
        when: {
          startTime: "12:30",
          timeHint: "noon",
          provenance: utteranceProvenance(["12:30"]),
        },
      }),
    ]);
    expect(tl.violations).toHaveLength(0);
  });

  test("overlap_with_previous violation", () => {
    const tl = solveTimeLine([
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: "09:00",
          timeHint: "morning",
          provenance: utteranceProvenance(["9時"]),
        },
      }),
      mkEvent({
        event_id: "event_2",
        when: {
          startTime: "09:30",
          timeHint: "morning",
          provenance: utteranceProvenance(["9:30"]),
        },
      }),
    ]);
    const v = tl.violations.find((x) => x.event_id === "event_2");
    expect(v).toBeTruthy();
    expect(v?.violation).toBe("overlap_with_previous");
  });

  test("startTime 未決 → undetermined_startTime violation", () => {
    const tl = solveTimeLine([
      mkEvent({ event_id: "event_1" }),
    ]);
    expect(tl.entries[0].startTime).toBeNull();
    expect(tl.violations[0].violation).toBe("undetermined_startTime");
  });

  test("timeHint 逆引きで anchor 決定", () => {
    const tl = solveTimeLine([
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: null,
          timeHint: "morning",
          provenance: utteranceProvenance(["朝"]),
        },
      }),
    ]);
    expect(tl.entries[0].startTime).toBe("09:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L2.1 Gap Resolver
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.1 resolveEventGap", () => {
  test("semantic 空 / blocker 空 → pass_through", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: [],
      missing_solver_blockers: [],
    });
    const a = resolveEventGap(ev, { events: [ev], index: 0 });
    expect(a.type).toBe("pass_through");
  });

  test("semantic ≥ 2 → coarse_time_bucket", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["when", "where"],
    });
    const a = resolveEventGap(ev, { events: [ev], index: 0 });
    expect(a.type).toBe("clarify");
    if (a.type === "clarify") {
      expect(a.request.kind).toBe("coarse_time_bucket");
    }
  });

  test("semantic=[when] → specific_time", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["when"],
    });
    const a = resolveEventGap(ev, { events: [ev], index: 0 });
    if (a.type === "clarify") {
      expect(a.request.kind).toBe("specific_time");
    } else {
      throw new Error("expected clarify");
    }
  });

  test("semantic=[where] → defer_to_place_grounder (clarify せず)", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["where"],
    });
    const a = resolveEventGap(ev, { events: [ev], index: 0 });
    expect(a.type).toBe("defer_to_place_grounder");
  });

  test("modify / target_ref_confidence=low → target_ref_low clarify 最優先", () => {
    const ev = mkEvent({
      event_id: "event_1",
      turn_mode: "modify",
      target_ref: "予定",
      target_ref_confidence: "low",
      missing_semantic_critical: ["when"],
    });
    const a = resolveEventGap(ev, { events: [ev], index: 0 });
    if (a.type === "clarify") {
      expect(a.request.kind).toBe("target_ref_low");
    } else {
      throw new Error("expected clarify");
    }
  });

  test("tentative が連鎖 → tentative_chain clarify", () => {
    const ev1 = mkEvent({ event_id: "event_1", certainty: "tentative" });
    const ev2 = mkEvent({ event_id: "event_2", certainty: "tentative" });
    const a = resolveEventGap(ev1, { events: [ev1, ev2], index: 0 });
    if (a.type === "clarify") {
      expect(a.request.kind).toBe("tentative_chain");
    } else {
      throw new Error("expected clarify");
    }
  });
});

describe("L2.1 resolveGaps primary_clarify 優先度", () => {
  test("target_ref_low > coarse_time_bucket", () => {
    const evA = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["when", "where"],
    });
    const evB = mkEvent({
      event_id: "event_2",
      turn_mode: "modify",
      target_ref: "予定",
      target_ref_confidence: "low",
    });
    const out = resolveGaps([evA, evB]);
    expect(out.primary_clarify?.kind).toBe("target_ref_low");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 2+ Modify Router
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Modify Router resolveTargetRef", () => {
  test("time_bucket: '朝の予定' → startTime=09:00 event に high", () => {
    const events = [
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"]),
        },
        what: {
          activity: "カフェ",
          activityCanonical: "カフェ",
          provenance: utteranceProvenance(["カフェ"]),
        },
      }),
      mkEvent({
        event_id: "event_2",
        when: {
          startTime: "15:00",
          timeHint: null,
          provenance: utteranceProvenance(["15時"]),
        },
      }),
    ];
    const res = resolveTargetRef("朝の予定", events);
    expect(res.event_id).toBe("event_1");
    expect(res.confidence).toBe("high");
    expect(res.strategy).toBe("time_bucket");
  });

  test("activity: 'ランチ' → activity 一致", () => {
    const events = [
      mkEvent({
        event_id: "event_1",
        what: {
          activity: "ランチ",
          activityCanonical: "昼食",
          provenance: utteranceProvenance(["ランチ"]),
        },
      }),
    ];
    const res = resolveTargetRef("ランチ", events);
    expect(res.event_id).toBe("event_1");
  });

  test("place: 'サドヤの予定' → place_ref 一致", () => {
    const events = [
      mkEvent({
        event_id: "event_1",
        where: {
          place_ref: "サドヤ",
          placeType: "exact_proper_noun",
          provenance: utteranceProvenance(["サドヤ"]),
        },
      }),
    ];
    const res = resolveTargetRef("サドヤの予定", events);
    expect(res.event_id).toBe("event_1");
    expect(res.strategy).toBe("place");
  });

  test("ordinal: '最後の予定' → 末尾 event", () => {
    const events = [
      mkEvent({ event_id: "event_1" }),
      mkEvent({ event_id: "event_2" }),
      mkEvent({ event_id: "event_3" }),
    ];
    const res = resolveTargetRef("最後の予定", events);
    expect(res.event_id).toBe("event_3");
    expect(res.strategy).toBe("ordinal");
  });

  test("解決不能 → null / low", () => {
    const events = [mkEvent({ event_id: "event_1" })];
    const res = resolveTargetRef("存在しない何か", events);
    expect(res.event_id).toBeNull();
    expect(res.confidence).toBe("low");
  });
});

describe("Modify Router annotateTargetRefConfidence", () => {
  test("create mode はそのまま", () => {
    const ev = mkEvent({ event_id: "event_1", turn_mode: "create" });
    const out = annotateTargetRefConfidence(ev, []);
    expect(out).toBe(ev);
  });

  test("modify / confidence 未設定 → 解決結果を書き込む", () => {
    const existing = [
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"]),
        },
      }),
    ];
    const modifyEv = mkEvent({
      event_id: "event_2",
      turn_mode: "modify",
      target_ref: "朝の予定",
      target_ref_confidence: null,
    });
    const out = annotateTargetRefConfidence(modifyEv, existing);
    expect(out.target_ref_confidence).toBe("high");
  });

  test("modify / target_ref null → low", () => {
    const modifyEv = mkEvent({
      event_id: "event_1",
      turn_mode: "modify",
      target_ref: null,
      target_ref_confidence: null,
    });
    const out = annotateTargetRefConfidence(modifyEv, []);
    expect(out.target_ref_confidence).toBe("low");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L1 Pipeline 統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L1 Pipeline: runL1Pipeline", () => {
  test("event_id 採番 + checker 通過", () => {
    const result = runL1Pipeline({
      utterance: "朝はサドヤでコーヒー",
      raw: {
        targetDate: "today",
        events: [
          {
            turn_mode: "create",
            target_ref: null,
            target_ref_confidence: null,
            change_scope: null,
            when: {
              startTime: "09:00",
              timeHint: "morning",
              provenance: utteranceProvenance(["朝"]),
            },
            where: {
              place_ref: "サドヤ",
              placeType: "exact_proper_noun",
              provenance: utteranceProvenance(["サドヤ"]),
            },
            what: {
              activity: "コーヒー",
              activityCanonical: "カフェ",
              provenance: utteranceProvenance(["コーヒー"]),
            },
            who: [],
            transport: null,
            certainty: "asserted",
            missing_semantic_critical: [],
            missing_solver_blockers: [],
          },
        ],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].event_id).toBe("event_1");
    expect(result.events[0].where.place_ref).toBe("サドヤ");
    expect(result.events[0].missing_semantic_critical).toEqual([]);
  });

  test("hallucinate place が pipeline で null クリアされる", () => {
    const result = runL1Pipeline({
      utterance: "朝はカフェで軽く",
      raw: {
        targetDate: "today",
        events: [
          {
            turn_mode: "create",
            target_ref: null,
            target_ref_confidence: null,
            change_scope: null,
            when: {
              startTime: "09:00",
              timeHint: "morning",
              provenance: utteranceProvenance(["朝"]),
            },
            where: {
              place_ref: "二藍",
              placeType: "exact_proper_noun",
              provenance: utteranceProvenance(["二藍"]),
            },
            what: {
              activity: "カフェ",
              activityCanonical: "カフェ",
              provenance: utteranceProvenance(["カフェ"]),
            },
            who: [],
            transport: null,
            certainty: "asserted",
            missing_semantic_critical: [],
            missing_solver_blockers: [],
          },
        ],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    expect(result.events[0].where.place_ref).toBeNull();
    expect(result.events[0].missing_semantic_critical).toContain("where");
  });
});
