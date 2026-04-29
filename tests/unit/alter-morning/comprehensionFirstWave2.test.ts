/**
 * Comprehension-First v1.3+ Wave 2 Contract Tests
 *
 * 設計書: docs/alter-morning-comprehension-first-wave2-design.md
 *
 * カバレッジ:
 *   - L1.0 Rule Pre-Parse (明示時刻 / 明示起点)
 *   - L2.3 Place Grounder (known_base / placeTable / ambiguous / unresolved)
 *   - L3.2 Faithfulness Checker (4 violation types)
 *   - L3.1 Narration stub (plan graph 従属)
 *   - L3 Expression Pipeline (retry / fallback)
 *   - E2E: L1 → L2 → L3 貫通（5 シナリオ）
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  type Event,
  resetEventCounter,
  utteranceProvenance,
  baselineProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import { runL1Pipeline } from "@/lib/alter-morning/comprehension/l1Pipeline";
import {
  extractExplicitTimes,
  extractExplicitStartPoints,
  preParseUtterance,
  formatHintsForPrompt,
} from "@/lib/alter-morning/comprehension/rulePreParse";
import { solveTimeLine } from "@/lib/alter-morning/planning/timeSolver";
import { groundPlace, groundPlaces } from "@/lib/alter-morning/planning/placeGrounder";
import {
  extractTimesFromNarration,
  extractProperNounsFromNarration,
  hasHedgeSomewhere,
  checkFaithfulness,
} from "@/lib/alter-morning/expression/faithfulnessChecker";
import {
  stubNarrate,
  serializePlanDeterministic,
  type NarrationProvider,
} from "@/lib/alter-morning/expression/narration";
import { runL3Pipeline } from "@/lib/alter-morning/expression/pipeline";

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
// L1.0 Rule Pre-Parse
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L1.0 extractExplicitTimes", () => {
  test("HH:mm 形式", () => {
    const out = extractExplicitTimes("09:00 に出発、12:30 ランチ");
    expect(out.map((o) => o.value)).toEqual(["09:00", "12:30"]);
  });

  test("日本語時刻: 9時 / 9時半 / 9時30分", () => {
    expect(extractExplicitTimes("9時に出発").map((o) => o.value)).toEqual(["09:00"]);
    expect(extractExplicitTimes("9時半に出発").map((o) => o.value)).toEqual(["09:30"]);
    expect(extractExplicitTimes("9時30分に出発").map((o) => o.value)).toEqual(["09:30"]);
  });

  test("混在: 9時30分 と 12:00", () => {
    const out = extractExplicitTimes("9時30分に起きて、12:00にランチ");
    expect(out.map((o) => o.value).sort()).toEqual(["09:30", "12:00"]);
  });

  test("不正時刻は除外", () => {
    expect(extractExplicitTimes("25:00").length).toBe(0);
    expect(extractExplicitTimes("9時99分").length).toBe(0);
  });

  test("重複なし (9時30分 を食ったら 9時 に再ヒットしない)", () => {
    const out = extractExplicitTimes("9時30分にランチ");
    expect(out.length).toBe(1);
    expect(out[0].value).toBe("09:30");
  });

  test("空/無時刻文字列", () => {
    expect(extractExplicitTimes("")).toEqual([]);
    expect(extractExplicitTimes("朝ごはん食べたい")).toEqual([]);
  });
});

describe("L1.0 extractExplicitStartPoints", () => {
  test("〜から 形式", () => {
    const out = extractExplicitStartPoints("自宅から出発");
    expect(out.map((o) => o.value)).toEqual(["自宅"]);
  });

  test("〜を出る 形式", () => {
    const out = extractExplicitStartPoints("家を出る");
    expect(out.map((o) => o.value)).toEqual(["自宅"]);
  });

  test("ホテル / 会社 / 実家", () => {
    expect(extractExplicitStartPoints("ホテルから").map((o) => o.value)).toEqual(["ホテル"]);
    expect(extractExplicitStartPoints("会社から").map((o) => o.value)).toEqual(["会社"]);
    expect(extractExplicitStartPoints("実家から").map((o) => o.value)).toEqual(["実家"]);
  });

  test("「家」と「自宅」は同一ラベル化", () => {
    const out1 = extractExplicitStartPoints("家から");
    const out2 = extractExplicitStartPoints("自宅から");
    expect(out1[0].value).toBe(out2[0].value);
    expect(out1[0].value).toBe("自宅");
  });

  test("曖昧発話は拾わない", () => {
    expect(extractExplicitStartPoints("朝ごはん食べたい")).toEqual([]);
    expect(extractExplicitStartPoints("カフェに行きたい")).toEqual([]);
  });

  test("複数起点は最前の 1 件のみ（label 重複抑制）", () => {
    const out = extractExplicitStartPoints("自宅からホテルから");
    expect(out.length).toBe(2); // 別 label は両方
  });
});

describe("L1.0 preParseUtterance + formatHintsForPrompt", () => {
  test("統合: 時刻と起点を返す", () => {
    const h = preParseUtterance("9時に自宅から出発");
    expect(h.explicit_times.map((t) => t.value)).toEqual(["09:00"]);
    expect(h.explicit_start_points.map((s) => s.value)).toEqual(["自宅"]);
  });

  test("formatHintsForPrompt 空 hint → 空文字", () => {
    expect(formatHintsForPrompt({ explicit_times: [], explicit_start_points: [], slot_opt_outs: [] })).toBe("");
  });

  test("formatHintsForPrompt 内容あり → prompt 注入可能な文字列", () => {
    const h = preParseUtterance("9時に自宅から");
    const prompt = formatHintsForPrompt(h);
    expect(prompt).toContain("明示時刻: 09:00");
    expect(prompt).toContain("明示起点: 自宅");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L2.3 Place Grounder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.3 groundPlace", () => {
  test("known_base (自宅) → resolved / user_baseline", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "自宅",
        placeType: "known_base",
        provenance: baselineProvenance(),
      },
    });
    const g = groundPlace(ev);
    expect(g.status).toBe("resolved");
    expect(g.selected?.source).toBe("user_baseline");
    expect(g.selected?.resolvedName).toBe("自宅");
  });

  test("known_base 推定 (「ホテル」単独、placeType 未指定) → resolved", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "ホテル",
        placeType: null,
        provenance: utteranceProvenance(["ホテル"]),
      },
    });
    const g = groundPlace(ev);
    expect(g.status).toBe("resolved");
  });

  test("placeTable ヒット (スタバ) → resolved / placeTable", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"]),
      },
    });
    const g = groundPlace(ev);
    expect(g.status).toBe("resolved");
    expect(g.selected?.source).toBe("placeTable");
    expect(g.selected?.resolvedName).toBe("スターバックス");
  });

  test("placeTable miss (サドヤ/架空固有名) → unresolved", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["サドヤ"]),
      },
    });
    const g = groundPlace(ev);
    expect(g.status).toBe("unresolved");
    expect(g.selected).toBeNull();
  });

  test("place_ref null → unresolved", () => {
    const g = groundPlace(mkEvent({ event_id: "event_1" }));
    expect(g.status).toBe("unresolved");
    expect(g.candidates).toEqual([]);
  });

  test("groundPlaces: 複数 event を一括処理", () => {
    const events = [
      mkEvent({
        event_id: "event_1",
        where: {
          place_ref: "自宅",
          placeType: "known_base",
          provenance: baselineProvenance(),
        },
      }),
      mkEvent({
        event_id: "event_2",
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"]),
        },
      }),
    ];
    const gs = groundPlaces(events);
    expect(gs).toHaveLength(2);
    expect(gs[0].status).toBe("resolved");
    expect(gs[1].status).toBe("resolved");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L3.2 Faithfulness Checker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L3.2 extractTimesFromNarration", () => {
  test("HH:mm / 日本語時刻", () => {
    const out = extractTimesFromNarration("9時にカフェ、12:30 にランチ、15時半 に帰宅");
    expect(out.sort()).toEqual(["09:00", "12:30", "15:30"]);
  });

  test("空/時刻なし", () => {
    expect(extractTimesFromNarration("")).toEqual([]);
    expect(extractTimesFromNarration("のんびり過ごす")).toEqual([]);
  });
});

describe("L3.2 extractProperNounsFromNarration", () => {
  test("カタカナ 2+ を抽出（一般語は除外）", () => {
    const out = extractProperNounsFromNarration("サドヤでコーヒー、マックでランチ");
    expect(out).toContain("サドヤ");
    expect(out).toContain("マック");
    // コーヒー・ランチは除外対象
    expect(out).not.toContain("コーヒー");
    expect(out).not.toContain("ランチ");
  });

  test("空", () => {
    expect(extractProperNounsFromNarration("")).toEqual([]);
  });
});

describe("L3.2 hasHedgeSomewhere", () => {
  test("hedge 語あり", () => {
    expect(hasHedgeSomewhere("9時あたりにカフェ")).toBe(true);
    expect(hasHedgeSomewhere("予定です")).toBe(true);
    expect(hasHedgeSomewhere("多分行く")).toBe(true);
  });

  test("hedge 語なし", () => {
    expect(hasHedgeSomewhere("9時にカフェ")).toBe(false);
  });
});

describe("L3.2 checkFaithfulness — 4 violation types", () => {
  const baseEvent = mkEvent({
    event_id: "event_1",
    when: {
      startTime: "09:00",
      timeHint: "morning",
      provenance: utteranceProvenance(["9時"]),
    },
    where: {
      place_ref: "自宅",
      placeType: "known_base",
      provenance: baselineProvenance(),
    },
    what: {
      activity: "朝食",
      activityCanonical: "朝食",
      provenance: utteranceProvenance(["朝食"]),
    },
  });

  function buildInput(narrationText: string, coveredIds: string[]) {
    const events = [baseEvent];
    const comp = {
      events,
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: true,
    };
    const timeline = solveTimeLine(events);
    const grounded = groundPlaces(events);
    return {
      narration_text: narrationText,
      covered_event_ids: coveredIds,
      comprehension: comp,
      timeline,
      grounded,
    };
  }

  test("event_not_covered: narration に event が出ない", () => {
    const v = checkFaithfulness(buildInput("何もしない", []));
    expect(v.some((x) => x.type === "event_not_covered")).toBe(true);
  });

  test("extra_time_in_text: plan にない時刻", () => {
    const v = checkFaithfulness(buildInput("9時に自宅で朝食、その後 22時に寝る", ["event_1"]));
    const offender = v.find((x) => x.type === "extra_time_in_text");
    expect(offender).toBeTruthy();
    expect(offender?.offender).toBe("22:00");
  });

  test("extra_place_in_text: plan にない固有名", () => {
    const v = checkFaithfulness(buildInput("9時にサドヤで朝食", ["event_1"]));
    expect(v.some((x) => x.type === "extra_place_in_text" && x.offender === "サドヤ")).toBe(true);
  });

  test("violation なし: plan 通り", () => {
    const v = checkFaithfulness(buildInput("9時に自宅で朝食。", ["event_1"]));
    expect(v).toEqual([]);
  });

  test("missing_tentative_hedge: tentative なのに断定", () => {
    const tentativeEv = { ...baseEvent, certainty: "tentative" as const };
    const comp = {
      events: [tentativeEv],
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: true,
    };
    const v = checkFaithfulness({
      narration_text: "9時に自宅で朝食。",
      covered_event_ids: ["event_1"],
      comprehension: comp,
      timeline: solveTimeLine([tentativeEv]),
      grounded: groundPlaces([tentativeEv]),
    });
    expect(v.some((x) => x.type === "missing_tentative_hedge")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L3.1 Narration stub
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L3.1 stubNarrate", () => {
  test("基本: 1 event を日本語文字列化", () => {
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: "morning",
        provenance: utteranceProvenance(["9時"]),
      },
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"]),
      },
      what: {
        activity: "作業",
        activityCanonical: "作業",
        provenance: utteranceProvenance(["作業"]),
      },
    });
    const out = stubNarrate({
      comprehension: {
        events: [ev],
        targetDate: "today",
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
      timeline: solveTimeLine([ev]),
      grounded: groundPlaces([ev]),
    });
    expect(out.text).toContain("9時");
    expect(out.text).toContain("スターバックス"); // resolved name を使う
    expect(out.text).toContain("作業");
    expect(out.covered_event_ids).toEqual(["event_1"]);
  });

  test("tentative には「あたり」と「（予定）」が付く", () => {
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "15:00",
        timeHint: "afternoon",
        provenance: utteranceProvenance(["15時"]),
      },
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"]),
      },
      what: {
        activity: "カフェ",
        activityCanonical: "カフェ",
        provenance: utteranceProvenance(["カフェ"]),
      },
      certainty: "tentative",
    });
    const out = stubNarrate({
      comprehension: {
        events: [ev],
        targetDate: "today",
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
      timeline: solveTimeLine([ev]),
      grounded: groundPlaces([ev]),
    });
    expect(out.text).toContain("あたり");
    expect(out.text).toContain("（予定）");
  });

  test("serializePlanDeterministic: / 区切りの最低限形式", () => {
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: "morning",
        provenance: utteranceProvenance(["9時"]),
      },
      where: {
        place_ref: "自宅",
        placeType: "known_base",
        provenance: baselineProvenance(),
      },
      what: {
        activity: "朝食",
        activityCanonical: "朝食",
        provenance: utteranceProvenance(["朝食"]),
      },
    });
    const out = serializePlanDeterministic({
      comprehension: {
        events: [ev],
        targetDate: "today",
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
      timeline: solveTimeLine([ev]),
      grounded: groundPlaces([ev]),
    });
    expect(out.text).toContain("09:00");
    expect(out.text).toContain("自宅");
    expect(out.metadata?.strategy).toBe("deterministic_fallback");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L3 Expression Pipeline — retry / fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L3 runL3Pipeline", () => {
  function buildBasicInput() {
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: "morning",
        provenance: utteranceProvenance(["9時"]),
      },
      where: {
        place_ref: "自宅",
        placeType: "known_base",
        provenance: baselineProvenance(),
      },
      what: {
        activity: "朝食",
        activityCanonical: "朝食",
        provenance: utteranceProvenance(["朝食"]),
      },
    });
    return {
      comprehension: {
        events: [ev],
        targetDate: "today",
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
      timeline: solveTimeLine([ev]),
      grounded: groundPlaces([ev]),
    };
  }

  test("attempt=0 成功: 初回 stub で violations なし", async () => {
    const res = await runL3Pipeline(buildBasicInput());
    expect(res.attempt).toBe(0);
    expect(res.violations).toEqual([]);
  });

  test("attempt=2 fallback: 常に hallucinate する provider", async () => {
    const hallucinator: NarrationProvider = {
      narrate: async () => ({
        text: "22時にサドヤで二次会",
        covered_event_ids: [],
        metadata: { strategy: "llm" },
      }),
    };
    const res = await runL3Pipeline(buildBasicInput(), hallucinator);
    expect(res.attempt).toBe(2);
    expect(res.narration.metadata?.strategy).toBe("deterministic_fallback");
  });

  test("attempt=1 成功: 1 回目失敗 / 2 回目で正しい出力", async () => {
    let call = 0;
    const provider: NarrationProvider = {
      narrate: async (input) => {
        call += 1;
        if (call === 1) {
          return {
            text: "22時にサドヤで会食",
            covered_event_ids: [],
            metadata: { strategy: "llm" },
          };
        }
        return stubNarrate(input);
      },
    };
    const res = await runL3Pipeline(buildBasicInput(), provider);
    expect(res.attempt).toBe(1);
    expect(res.violations).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E Contract: L1 → L2 → L3 貫通（5 シナリオ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("E2E Contract: L1 → L2 → L3 全層貫通", () => {
  test("S1 Happy path: 朝食＋ランチ 2 events で narration が vialation-free", async () => {
    const comp = runL1Pipeline({
      utterance: "9時に自宅で朝食、12:30にスタバでランチ",
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
              provenance: utteranceProvenance(["9時"]),
            },
            where: {
              place_ref: "自宅",
              placeType: "known_base",
              provenance: baselineProvenance(),
            },
            what: {
              activity: "朝食",
              activityCanonical: "朝食",
              provenance: utteranceProvenance(["朝食"]),
            },
            who: [],
            transport: null,
            certainty: "asserted",
            missing_semantic_critical: [],
            missing_solver_blockers: [],
          },
          {
            turn_mode: "create",
            target_ref: null,
            target_ref_confidence: null,
            change_scope: null,
            when: {
              startTime: "12:30",
              timeHint: "noon",
              provenance: utteranceProvenance(["12:30"]),
            },
            where: {
              place_ref: "スタバ",
              placeType: "chain_brand",
              provenance: utteranceProvenance(["スタバ"]),
            },
            what: {
              activity: "ランチ",
              activityCanonical: "昼食",
              provenance: utteranceProvenance(["ランチ"]),
            },
            who: [],
            transport: null,
            certainty: "asserted",
            missing_semantic_critical: [],
            missing_solver_blockers: [],
          },
        ],
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    const timeline = solveTimeLine(comp.events);
    const grounded = groundPlaces(comp.events);
    const res = await runL3Pipeline({ comprehension: comp, timeline, grounded });

    expect(res.attempt).toBe(0);
    expect(res.violations).toEqual([]);
    expect(res.narration.text).toContain("9時");
    expect(res.narration.text).toContain("自宅");
    expect(res.narration.text).toContain("スターバックス");
  });

  test("S2 Hallucinate rejection: 発話外 place が L1.2 で null 化、narration に出ない", async () => {
    const comp = runL1Pipeline({
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
              place_ref: "二藍", // 発話外 hallucinate
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
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    expect(comp.events[0].where.place_ref).toBeNull();

    const timeline = solveTimeLine(comp.events);
    const grounded = groundPlaces(comp.events);
    const res = await runL3Pipeline({ comprehension: comp, timeline, grounded });

    expect(res.narration.text).not.toContain("二藍");
  });

  test("S3 Tentative: hedge 語が自動で入る", async () => {
    const comp = runL1Pipeline({
      utterance: "15時あたりにカフェ行くかも",
      raw: {
        targetDate: "today",
        events: [
          {
            turn_mode: "create",
            target_ref: null,
            target_ref_confidence: null,
            change_scope: null,
            when: {
              startTime: "15:00",
              timeHint: "afternoon",
              provenance: utteranceProvenance(["15時"]),
            },
            where: {
              place_ref: "スタバ",
              placeType: "chain_brand",
              provenance: utteranceProvenance(["スタバ"]),
            },
            what: {
              activity: "カフェ",
              activityCanonical: "カフェ",
              provenance: utteranceProvenance(["カフェ"]),
            },
            who: [],
            transport: null,
            certainty: "tentative",
            missing_semantic_critical: [],
            missing_solver_blockers: [],
          },
        ],
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    const timeline = solveTimeLine(comp.events);
    const grounded = groundPlaces(comp.events);
    const res = await runL3Pipeline({ comprehension: comp, timeline, grounded });

    expect(res.attempt).toBe(0);
    expect(res.narration.text).toMatch(/あたり|予定|かも/);
  });

  test("S4 unresolved place: 発話固有名が辞書外でも narration に保持される", async () => {
    const comp = runL1Pipeline({
      utterance: "9時にサドヤでコーヒー",
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
              provenance: utteranceProvenance(["9時"]),
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
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    const timeline = solveTimeLine(comp.events);
    const grounded = groundPlaces(comp.events);
    expect(grounded[0].status).toBe("unresolved");

    const res = await runL3Pipeline({ comprehension: comp, timeline, grounded });
    expect(res.narration.text).toContain("サドヤ"); // 発話尊重
  });

  test("S5 Turn 2+ modify: 既存 event を差し替えた後も narration が整合", async () => {
    // Turn 1: 朝の予定を作る
    const turn1 = runL1Pipeline({
      utterance: "朝はカフェ",
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
              place_ref: null,
              placeType: null,
              provenance: inferredProvenance(),
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
        operations: [],
        startPoint: null,
        departureTime: null,
        goOut: true,
      },
    });

    // Turn 2 で「朝の予定をスタバに」：L1 は新 event を生成するが、modify としてマージされる想定。
    // Wave 2 では modify merge ロジックは L2.1 gapResolver の先で別モジュール担当。
    // ここでは「modify annotation + grounding で place が差し替わる形」を contract として検証。
    const modifyEv = mkEvent({
      event_id: "event_x",
      turn_mode: "modify",
      target_ref: "朝の予定",
      target_ref_confidence: "high",
      change_scope: "patch",
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"]),
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

    const merged = [
      { ...turn1.events[0], where: modifyEv.where }, // patch 適用
    ];
    const timeline = solveTimeLine(merged);
    const grounded = groundPlaces(merged);
    const res = await runL3Pipeline({
      comprehension: { ...turn1, events: merged },
      timeline,
      grounded,
    });

    expect(res.attempt).toBe(0);
    expect(res.violations).toEqual([]);
    expect(res.narration.text).toContain("スターバックス");
  });
});
