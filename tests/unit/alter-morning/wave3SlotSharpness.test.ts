/**
 * SlotSharpness — W3-PR-7 Commit 1
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §3.3
 *
 * カバレッジ:
 *   - computeWhenSharpness: fixed / vague / missing 網羅
 *   - computeWhereSharpness: exact_proper_noun/known_base=fixed、
 *                            chain_brand/generic/null=vague、null place_ref=missing
 *   - computeWhatSharpness: VAGUE_ACTIVITY_SET 判定、空文字=missing
 *   - 統合: "朝カフェ軽く作業" 相当（vague×vague×vague）→ gapResolver が ASK を出す
 */
import { describe, test, expect } from "vitest";

import {
  computeWhenSharpness,
  computeWhereSharpness,
  computeWhatSharpness,
  VAGUE_ACTIVITY_SET,
  utteranceProvenance,
  inferredProvenance,
  type WhenSlot,
  type WhereSlot,
  type WhatSlot,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

import { resolveGaps } from "@/lib/alter-morning/planning/gapResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkWhen(overrides: Partial<WhenSlot> = {}): WhenSlot {
  return {
    startTime: null,
    timeHint: null,
    provenance: inferredProvenance(),
    ...overrides,
  };
}
function mkWhere(overrides: Partial<WhereSlot> = {}): WhereSlot {
  return {
    place_ref: null,
    placeType: null,
    provenance: inferredProvenance(),
    ...overrides,
  };
}
function mkWhat(overrides: Partial<WhatSlot> = {}): WhatSlot {
  return {
    activity: "",
    activityCanonical: "",
    provenance: inferredProvenance(),
    ...overrides,
  };
}

function mkEvent(id: string, ov: Partial<Event> = {}): Event {
  return {
    event_id: id,
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: mkWhen(),
    where: mkWhere(),
    what: mkWhat(),
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...ov,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeWhenSharpness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeWhenSharpness", () => {
  test("startTime HH:mm → fixed", () => {
    expect(computeWhenSharpness(mkWhen({ startTime: "09:00" }))).toBe("fixed");
    expect(computeWhenSharpness(mkWhen({ startTime: "23:59" }))).toBe("fixed");
  });

  test("startTime 不正形式 → vague/missing にフォールバック", () => {
    // 9時 のような非正規形式は fixed 扱いしない（HH:mm のみ）
    expect(computeWhenSharpness(mkWhen({ startTime: "9時" }))).toBe("missing");
    expect(computeWhenSharpness(mkWhen({ startTime: "9:00" }))).toBe("missing"); // 1桁時
  });

  test("timeHint のみ → vague", () => {
    expect(computeWhenSharpness(mkWhen({ timeHint: "morning" }))).toBe("vague");
    expect(computeWhenSharpness(mkWhen({ timeHint: "evening" }))).toBe("vague");
  });

  test("両方 null → missing", () => {
    expect(computeWhenSharpness(mkWhen())).toBe("missing");
  });

  test("startTime 優先（timeHint 併存でも fixed）", () => {
    expect(
      computeWhenSharpness(mkWhen({ startTime: "12:00", timeHint: "noon" })),
    ).toBe("fixed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeWhereSharpness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeWhereSharpness", () => {
  test("place_ref null → missing", () => {
    expect(computeWhereSharpness(mkWhere())).toBe("missing");
  });

  test("place_ref 空文字 → missing", () => {
    expect(computeWhereSharpness(mkWhere({ place_ref: "" }))).toBe("missing");
    expect(computeWhereSharpness(mkWhere({ place_ref: "   " }))).toBe("missing");
  });

  test("placeType=exact_proper_noun → fixed", () => {
    expect(
      computeWhereSharpness(
        mkWhere({ place_ref: "東京駅", placeType: "exact_proper_noun" }),
      ),
    ).toBe("fixed");
  });

  test("placeType=known_base → fixed", () => {
    expect(
      computeWhereSharpness(
        mkWhere({ place_ref: "自宅", placeType: "known_base" }),
      ),
    ).toBe("fixed");
  });

  test("placeType=chain_brand → vague（CEO 2026-04-22）", () => {
    expect(
      computeWhereSharpness(
        mkWhere({ place_ref: "スタバ", placeType: "chain_brand" }),
      ),
    ).toBe("vague");
  });

  test("placeType=generic_place → vague", () => {
    expect(
      computeWhereSharpness(
        mkWhere({ place_ref: "カフェ", placeType: "generic_place" }),
      ),
    ).toBe("vague");
  });

  test("placeType=null（place_ref のみ） → vague", () => {
    expect(
      computeWhereSharpness(mkWhere({ place_ref: "ナゾの場所", placeType: null })),
    ).toBe("vague");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeWhatSharpness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeWhatSharpness", () => {
  test("activity 空文字 → missing", () => {
    expect(computeWhatSharpness(mkWhat())).toBe("missing");
    expect(computeWhatSharpness(mkWhat({ activity: "   " }))).toBe("missing");
  });

  test("VAGUE_ACTIVITY_SET 該当 → vague", () => {
    for (const v of ["仕事", "作業", "用事", "予定", "もろもろ", "雑務", "タスク"]) {
      expect(VAGUE_ACTIVITY_SET.has(v)).toBe(true);
      expect(
        computeWhatSharpness(mkWhat({ activity: v, activityCanonical: v })),
      ).toBe("vague");
    }
  });

  test("activityCanonical が vague 語に寄っていても vague", () => {
    expect(
      computeWhatSharpness(
        mkWhat({ activity: "仕事する", activityCanonical: "仕事" }),
      ),
    ).toBe("vague");
  });

  test("具体的な activity → fixed", () => {
    expect(
      computeWhatSharpness(
        mkWhat({ activity: "ランチ", activityCanonical: "ランチ" }),
      ),
    ).toBe("fixed");
    expect(
      computeWhatSharpness(
        mkWhat({ activity: "コーヒー", activityCanonical: "コーヒー" }),
      ),
    ).toBe("fixed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Integration: "朝カフェ軽く作業" 相当 — vague × vague × vague → ASK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("integration — vague trio → clarifying", () => {
  test("'朝カフェ軽く作業' (timeHint+generic_place+vague activity) → specific_time ASK", () => {
    // 朝 → timeHint=morning (When vague)
    // カフェ → generic_place (Where vague)
    // 作業 → VAGUE_ACTIVITY_SET (What vague)
    const ev = mkEvent("e1", {
      when: mkWhen({
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"]),
      }),
      where: mkWhere({
        place_ref: "カフェ",
        placeType: "generic_place",
        provenance: utteranceProvenance(["カフェ"]),
      }),
      what: mkWhat({
        activity: "作業",
        activityCanonical: "作業",
        provenance: utteranceProvenance(["作業"]),
      }),
    });

    const res = resolveGaps([ev]);

    // ASK が立つ（plan_presented に落ちない）
    expect(res.primary_clarify).not.toBeNull();

    // When vague は timeHint=morning で anchor 解決（09:00）できるため specific_time にはならず、
    // slot priority 順に次の non-fixed へ降りる。generic_place "カフェ" は grounded 未提供なら
    // defer_to_place_grounder（ASK にならない）。そのため What vague が primary になる。
    expect(res.primary_clarify!.kind).toBe("activity");
    expect(res.primary_clarify!.event_id).toBe("e1");
  });

  test("全 slot missing（空 event） → coarse_time_bucket", () => {
    const ev = mkEvent("e1");
    const res = resolveGaps([ev]);
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("coarse_time_bucket");
  });

  test("When fixed / Where vague / What fixed → place grounder へ defer（ASK なし）", () => {
    const ev = mkEvent("e1", {
      when: mkWhen({
        startTime: "09:00",
        provenance: utteranceProvenance(["9時"]),
      }),
      where: mkWhere({
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"]),
      }),
      what: mkWhat({
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"]),
      }),
    });
    const res = resolveGaps([ev]);
    // chain_brand は vague だが grounded 未提供なら defer_to_place_grounder
    expect(res.actions[0].type).toBe("defer_to_place_grounder");
    expect(res.primary_clarify).toBeNull();
  });
});
