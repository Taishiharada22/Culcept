/**
 * modifyRouter contract tests — PR #41a Layer 3 audit
 *
 * CEO 2026-04-28 PR #41a Commit 4:
 *   modifyRouter.ts は orphan code (V2 path から呼ばれていない) で、既存 test は
 *   annotateTargetRefConfidence の最小ケースのみ。
 *
 *   Commit 5 で V2 wiring する前に、resolveTargetRef の **挙動を contract として
 *   凍結** し、edge case を網羅。これが PR #41b の merge logic の正本となる。
 *
 * 対象 4 戦略:
 *   1. time_bucket: 「朝/昼/午後/夜/ランチ/夕食」等から timeHint or startTime 逆引き
 *   2. activity: event.what.activity / activityCanonical の substring 部分一致
 *   3. place: event.where.place_ref の substring 部分一致
 *   4. ordinal: 「最初/最後/2つ目/ラスト」等から配列位置
 *
 *   優先順位は 1 > 2 > 3 > 4。最初にマッチした strategy が採用される。
 */

import { describe, it, expect } from "vitest";
import {
  resolveTargetRef,
  annotateTargetRefConfidence,
} from "@/lib/alter-morning/planning/modifyRouter";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Edge cases — 入力 0 件 / target_ref 空
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetRef — edge cases", () => {
  it("target_ref が空文字 → none", () => {
    const result = resolveTargetRef("", [mkEvent({ event_id: "e1" })]);
    expect(result.event_id).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.strategy).toBe("none");
  });

  it("existing が空配列 → none", () => {
    const result = resolveTargetRef("朝の予定", []);
    expect(result.event_id).toBeNull();
    expect(result.strategy).toBe("none");
  });

  it("既知の strategy にどれも該当しない → none + low confidence", () => {
    const result = resolveTargetRef(
      "宇宙船の予定",
      [mkEvent({ event_id: "e1", what: { activity: "コーヒー", activityCanonical: "カフェ", provenance: utteranceProvenance(["コーヒー"], "high") } })],
    );
    expect(result.event_id).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.strategy).toBe("none");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 1: time_bucket
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetRef — Strategy 1 time_bucket", () => {
  it("'朝の予定' + timeHint=morning event → 直接 timeHint 一致 (high)", () => {
    const events = [
      mkEvent({
        event_id: "e_morning",
        when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "high") },
      }),
      mkEvent({
        event_id: "e_evening",
        when: { startTime: null, timeHint: "evening", provenance: utteranceProvenance(["夜"], "high") },
      }),
    ];
    const result = resolveTargetRef("朝の予定", events);
    expect(result.event_id).toBe("e_morning");
    expect(result.confidence).toBe("high");
    expect(result.strategy).toBe("time_bucket");
  });

  it("'ランチ' + timeHint=noon event → noon 解決 (high)", () => {
    const events = [
      mkEvent({
        event_id: "e_noon",
        when: { startTime: null, timeHint: "noon", provenance: utteranceProvenance(["昼"], "high") },
      }),
    ];
    const result = resolveTargetRef("ランチを変える", events);
    expect(result.event_id).toBe("e_noon");
    expect(result.strategy).toBe("time_bucket");
  });

  it("'夕食' + timeHint=evening event → evening 解決 (high)", () => {
    const events = [
      mkEvent({
        event_id: "e_evening",
        when: { startTime: null, timeHint: "evening", provenance: utteranceProvenance(["夜"], "high") },
      }),
    ];
    const result = resolveTargetRef("夕食を変えたい", events);
    expect(result.event_id).toBe("e_evening");
    expect(result.strategy).toBe("time_bucket");
  });

  it("timeHint 未設定 + startTime=09:00 → deriveTimeHintFromStartTime fallback で morning", () => {
    const events = [
      mkEvent({
        event_id: "e_9am",
        when: {
          startTime: "09:00",
          timeHint: null, // timeHint 未設定
          provenance: utteranceProvenance(["9時"], "high"),
        },
      }),
    ];
    const result = resolveTargetRef("朝の予定を変える", events);
    expect(result.event_id).toBe("e_9am");
    expect(result.confidence).toBe("high");
    expect(result.strategy).toBe("time_bucket");
  });

  it("同 timeHint event 複数 → 最初の一致 + medium confidence", () => {
    const events = [
      mkEvent({ event_id: "e_a", when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "high") } }),
      mkEvent({ event_id: "e_b", when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "high") } }),
    ];
    const result = resolveTargetRef("朝の予定", events);
    expect(result.event_id).toBe("e_a"); // 最初
    expect(result.confidence).toBe("medium");
  });

  it.each([
    ["朝", "morning"],
    ["午前", "morning"],
    ["朝食", "morning"],
    ["モーニング", "morning"],
    ["昼", "noon"],
    ["ランチ", "noon"],
    ["昼食", "noon"],
    ["午後", "afternoon"],
    ["夕方", "evening"],
    ["夜", "evening"],
    ["夕食", "evening"],
    ["ディナー", "evening"],
    ["晩", "evening"],
  ] as const)(
    "time_bucket keyword '%s' → bucket=%s",
    (kw, expectedBucket) => {
      const events = [
        mkEvent({
          event_id: "e1",
          when: { startTime: null, timeHint: expectedBucket, provenance: utteranceProvenance([kw], "high") },
        }),
      ];
      const result = resolveTargetRef(kw, events);
      expect(result.event_id).toBe("e1");
      expect(result.strategy).toBe("time_bucket");
    },
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 2: activity 部分一致
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetRef — Strategy 2 activity match", () => {
  it("activity '打ち合わせ' を含む target_ref → activity 一致", () => {
    const events = [
      mkEvent({
        event_id: "e_meeting",
        what: { activity: "打ち合わせ", activityCanonical: "ミーティング", provenance: utteranceProvenance(["打ち合わせ"], "high") },
      }),
    ];
    const result = resolveTargetRef("打ち合わせの時間を変える", events);
    expect(result.event_id).toBe("e_meeting");
    expect(result.confidence).toBe("high");
    expect(result.strategy).toBe("activity");
  });

  it("activityCanonical 一致でも採用 (raw activity が違う表記でも OK)", () => {
    const events = [
      mkEvent({
        event_id: "e_lunch",
        what: { activity: "ご飯", activityCanonical: "ランチ", provenance: utteranceProvenance(["ご飯"], "high") },
      }),
    ];
    const result = resolveTargetRef("ランチを変える", events);
    // ランチ は time_bucket でもマッチするので strategy は time_bucket になる可能性
    // 戦略優先順序を確認するための test
    expect(result.event_id).toBe("e_lunch");
  });

  it("activity 部分一致なし → 次戦略へ fallthrough", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        what: { activity: "コーヒー", activityCanonical: "カフェ", provenance: utteranceProvenance(["コーヒー"], "high") },
      }),
    ];
    const result = resolveTargetRef("散歩を変える", events);
    expect(result.strategy).not.toBe("activity"); // 一致しない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 3: place 部分一致
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetRef — Strategy 3 place match", () => {
  it("place_ref 'サドヤ' を含む target_ref → place 一致", () => {
    const events = [
      mkEvent({
        event_id: "e_sadoya",
        where: { place_ref: "サドヤ", placeType: "exact_proper_noun", coordinates: null, provenance: utteranceProvenance(["サドヤ"], "high") },
      }),
    ];
    const result = resolveTargetRef("サドヤの予定を変える", events);
    expect(result.event_id).toBe("e_sadoya");
    expect(result.confidence).toBe("high");
    expect(result.strategy).toBe("place");
  });

  it("place_ref null → place strategy skip", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        where: { place_ref: null, placeType: null, coordinates: null, provenance: inferredProvenance() },
      }),
    ];
    const result = resolveTargetRef("どこかの予定", events);
    expect(result.strategy).not.toBe("place");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 4: ordinal (順序表現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetRef — Strategy 4 ordinal", () => {
  const events = [
    mkEvent({ event_id: "e1" }),
    mkEvent({ event_id: "e2" }),
    mkEvent({ event_id: "e3" }),
  ];

  it("'最初の' → events[0]", () => {
    const result = resolveTargetRef("最初の予定", events);
    expect(result.event_id).toBe("e1");
    expect(result.confidence).toBe("medium");
    expect(result.strategy).toBe("ordinal");
  });

  it("'1つ目' → events[0]", () => {
    const result = resolveTargetRef("1つ目を削除", events);
    expect(result.event_id).toBe("e1");
    expect(result.strategy).toBe("ordinal");
  });

  it("'最後の' → events[length-1]", () => {
    const result = resolveTargetRef("最後の予定", events);
    expect(result.event_id).toBe("e3");
    expect(result.strategy).toBe("ordinal");
  });

  it("'ラスト' → events[length-1]", () => {
    const result = resolveTargetRef("ラスト変える", events);
    expect(result.event_id).toBe("e3");
    expect(result.strategy).toBe("ordinal");
  });

  it("'2つ目' → events[1]", () => {
    const result = resolveTargetRef("2つ目の予定", events);
    expect(result.event_id).toBe("e2");
    expect(result.strategy).toBe("ordinal");
  });

  it("'2つ目' but events.length=1 → ordinal は match しないので none", () => {
    const single = [mkEvent({ event_id: "e1" })];
    const result = resolveTargetRef("2つ目の予定", single);
    expect(result.event_id).toBeNull();
    expect(result.strategy).toBe("none");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 戦略優先順位の確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetRef — 戦略優先順位 (1>2>3>4)", () => {
  it("time_bucket と ordinal の両方マッチ → time_bucket 優先", () => {
    const events = [
      mkEvent({
        event_id: "e_morning",
        when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "high") },
      }),
      mkEvent({
        event_id: "e_evening",
        when: { startTime: null, timeHint: "evening", provenance: utteranceProvenance(["夜"], "high") },
      }),
    ];
    // "最後の朝の予定" → 順序 (最後 = e_evening) よりも time_bucket (朝 = e_morning) 優先
    const result = resolveTargetRef("最後の朝の予定", events);
    expect(result.event_id).toBe("e_morning");
    expect(result.strategy).toBe("time_bucket");
  });

  it("activity と place 両方マッチ → activity 優先", () => {
    const events = [
      mkEvent({
        event_id: "e1",
        what: { activity: "サドヤ", activityCanonical: "ミーティング", provenance: utteranceProvenance(["サドヤ"], "high") },
        where: { place_ref: "別の場所", placeType: "exact_proper_noun", coordinates: null, provenance: utteranceProvenance(["別の場所"], "high") },
      }),
      mkEvent({
        event_id: "e2",
        what: { activity: "コーヒー", activityCanonical: "カフェ", provenance: utteranceProvenance(["コーヒー"], "high") },
        where: { place_ref: "サドヤ", placeType: "exact_proper_noun", coordinates: null, provenance: utteranceProvenance(["サドヤ"], "high") },
      }),
    ];
    // "サドヤの予定" → e1 が activity でマッチ (優先)
    const result = resolveTargetRef("サドヤの予定", events);
    expect(result.event_id).toBe("e1");
    expect(result.strategy).toBe("activity");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// annotateTargetRefConfidence (既存 contract の維持確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("annotateTargetRefConfidence — V2 wiring 前の挙動凍結", () => {
  it("turn_mode='create' は touch しない", () => {
    const ev = mkEvent({ turn_mode: "create", target_ref: null });
    expect(annotateTargetRefConfidence(ev, [])).toBe(ev);
  });

  it("target_ref_confidence 既設定なら touch しない (上書き禁止)", () => {
    const ev = mkEvent({
      turn_mode: "modify",
      target_ref: "朝",
      target_ref_confidence: "high",
    });
    expect(annotateTargetRefConfidence(ev, []).target_ref_confidence).toBe(
      "high",
    );
  });

  it("target_ref null → low confidence", () => {
    const ev = mkEvent({ turn_mode: "modify", target_ref: null });
    expect(annotateTargetRefConfidence(ev, []).target_ref_confidence).toBe(
      "low",
    );
  });

  it("target_ref + existing event 一致 → resolveTargetRef の confidence", () => {
    const existing = [
      mkEvent({
        event_id: "e_morning",
        when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "high") },
      }),
    ];
    const ev = mkEvent({ turn_mode: "modify", target_ref: "朝の予定" });
    const out = annotateTargetRefConfidence(ev, existing);
    expect(out.target_ref_confidence).toBe("high");
  });

  it("turn_mode='append' は touch しない (新規 event なので target_ref 不要)", () => {
    const ev = mkEvent({ turn_mode: "append", target_ref: null });
    expect(annotateTargetRefConfidence(ev, [])).toBe(ev);
  });
});
