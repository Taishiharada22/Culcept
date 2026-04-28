/**
 * coalesceFragmentedEvents — CEO 2026-04-28 LLM 過剰分割防御
 *
 * 観測:
 *   入力: "9時に渋谷のスタバ" (fresh 1st turn)
 *   LLM 誤出力: [
 *     { when: 09:00, where: スタバ/chain_brand, what: コーヒー },
 *     { when: null,  where: 渋谷/generic_place, what: 移動 },
 *   ]
 *   結果: 候補 picker 出ない + clarify 渋谷の時刻 → UX 崩壊
 *
 * Coalescer は同パターンを deterministic に統合する。
 *
 * 観点:
 *   1. CEO 観測ケース正常動作
 *   2. 順序逆転ケース（[no-time, timed]）も統合
 *   3. multi-event plan は touch しない（両方 timed）
 *   4. 異 placeType 組合せは touch しない（false positive 抑制）
 *   5. place_ref が空文字 / null は touch しない
 *   6. 既に compound（"渋谷のスタバ"）になっていたら touch しない (idempotent)
 *   7. missing_semantic_critical 再計算
 *   8. event count != 2 は touch しない
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  coalesceFragmentedEvents,
  attachEventId,
} from "@/lib/alter-morning/comprehension/l1Pipeline";
import {
  type Event,
  resetEventCounter,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

beforeEach(() => {
  resetEventCounter();
});

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

describe("coalesceFragmentedEvents — CEO 2026-04-28 LLM split defense", () => {
  it("[ROOT CAUSE] merges timed-chain + no-time-region into single compound event", () => {
    const events: Event[] = [
      mkEvent({
        event_id: "event_1",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "カフェ",
          provenance: inferredProvenance(),
        },
      }),
      mkEvent({
        event_id: "event_2",
        when: {
          startTime: null,
          timeHint: null,
          provenance: inferredProvenance(),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
        what: {
          activity: "移動",
          activityCanonical: "",
          provenance: inferredProvenance(),
        },
        missing_semantic_critical: ["when", "what"],
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].event_id).toBe("event_1");
    expect(result[0].when.startTime).toBe("09:00");
    expect(result[0].where.place_ref).toBe("渋谷のスタバ");
    expect(result[0].where.placeType).toBe("chain_brand");
    // missing_semantic_critical: where が埋まっているので "where" は含まれない
    expect(result[0].missing_semantic_critical).not.toContain("where");
  });

  it("merges when order is reversed: [no-time-region, timed-chain]", () => {
    const events: Event[] = [
      mkEvent({
        event_id: "event_a",
        when: {
          startTime: null,
          timeHint: null,
          provenance: inferredProvenance(),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
      mkEvent({
        event_id: "event_b",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].event_id).toBe("event_b"); // timed event survives
    expect(result[0].where.place_ref).toBe("渋谷のスタバ");
  });

  it("does NOT merge when both events have time (legitimate multi-event plan)", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      }),
      mkEvent({
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(2);
  });

  it("does NOT merge when both events lack time", () => {
    const events: Event[] = [
      mkEvent({
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      }),
      mkEvent({
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(2);
  });

  it("does NOT merge when timed event is exact_proper_noun (already specific)", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スターバックス TSUTAYA 渋谷店",
          placeType: "exact_proper_noun",
          coordinates: null,
          provenance: utteranceProvenance(["スターバックス TSUTAYA 渋谷店"], "high"),
        },
      }),
      mkEvent({
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(2); // 既に specific なら touch しない
  });

  it("does NOT merge when no-time event is chain_brand (not a region)", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      }),
      mkEvent({
        where: {
          place_ref: "ドトール",
          placeType: "chain_brand", // 両方 chain → 別店舗の予定（merge しない）
          coordinates: null,
          provenance: utteranceProvenance(["ドトール"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(2);
  });

  it("is idempotent: already-compound place_ref is not re-merged", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "渋谷のスタバ", // 既に compound
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷のスタバ"], "high"),
        },
      }),
      mkEvent({
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    // chainPlace.includes(regionPlace) → "渋谷のスタバ".includes("渋谷") === true
    // → idempotent skip
    expect(result).toHaveLength(2);
    expect(result[0].where.place_ref).toBe("渋谷のスタバ");
  });

  it("does NOT merge when place_ref is null/empty", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: null,
          placeType: "chain_brand",
          coordinates: null,
          provenance: inferredProvenance(),
        },
      }),
      mkEvent({
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(2);
  });

  it("does NOT touch single-event arrays", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(1);
    expect(result).toBe(events); // identity preserved
  });

  it("does NOT touch 3+ event arrays", () => {
    const events: Event[] = [
      mkEvent({
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      }),
      mkEvent({
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "ランチ",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
      }),
      mkEvent({
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(3); // multi-event plan は触らない
  });

  it("preserves event_id, what, who, transport from the timed event", () => {
    const events: Event[] = [
      mkEvent({
        event_id: "event_42",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          coordinates: null,
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "作業",
          activityCanonical: "作業",
          provenance: utteranceProvenance(["作業"], "high"),
        },
        who: ["友達"],
        transport: "電車",
      }),
      mkEvent({
        event_id: "event_99",
        where: {
          place_ref: "渋谷",
          placeType: "generic_place",
          coordinates: null,
          provenance: utteranceProvenance(["渋谷"], "high"),
        },
      }),
    ];

    const result = coalesceFragmentedEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].event_id).toBe("event_42");
    expect(result[0].what.activity).toBe("作業");
    expect(result[0].who).toEqual(["友達"]);
    expect(result[0].transport).toBe("電車");
  });
});
