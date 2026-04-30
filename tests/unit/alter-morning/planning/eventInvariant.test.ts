/**
 * Plan State Invariant Enforcement — PR-50 Commit 14 (CEO 2026-04-30)
 *
 * 合言葉: 「増殖は止める。でも、本物の別予定は潰さない」
 *
 * 検証範囲:
 *   - isGhostModifyEvent: turn_mode=modify + 全 slot missing → ghost 判定
 *   - dedupCanonicalEvents: same canonical event merge / 本物別予定保護
 *
 * 7 ケース (CEO 確定):
 *   1. ghost modify が removed
 *   2. same-time canonical duplicate が 1 件に merge
 *   3. different startTime → 別予定として保持
 *   4. different place → 別予定として保持
 *   5. different activity → 別予定として保持
 *   6. 「12時に新宿でランチ」 (本物 append) は merge されない
 *   7. ghost と本物 event 混在 → ghost のみ removed、本物は保持
 *
 * 加えて merge 方向の固定 (CEO + GPT 確定):
 *   - event_id は base 維持
 *   - place は exact_proper_noun / coordinates あり優先
 *   - transport は non-null 優先
 */

import { describe, it, expect } from "vitest";

import { isGhostModifyEvent } from "@/lib/alter-morning/planning/canonicalEventIdentity";
import { dedupCanonicalEvents } from "@/lib/alter-morning/planning/eventMergeDispatch";
import {
  utteranceProvenance,
  inferredProvenance,
  toolProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
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
      place_ref: "スタバ",
      placeType: "exact_proper_noun",
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

function mkGhostModify(eventId: string, transport?: string): Event {
  return {
    event_id: eventId,
    turn_mode: "modify",
    target_ref: "移動",
    target_ref_confidence: "high",
    change_scope: "patch",
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
    transport: transport ?? "車",
    certainty: "asserted",
    missing_semantic_critical: ["when", "where", "what"],
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isGhostModifyEvent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isGhostModifyEvent", () => {
  it("ghost modify (CEO 観測 event_4 / event_5) → true", () => {
    expect(isGhostModifyEvent(mkGhostModify("event_4"))).toBe(true);
  });

  it("turn_mode=create → false", () => {
    expect(isGhostModifyEvent(mkEvent({ turn_mode: "create" }))).toBe(false);
  });

  it("turn_mode=append → false", () => {
    expect(isGhostModifyEvent(mkEvent({ turn_mode: "append" }))).toBe(false);
  });

  it("turn_mode=modify + when.startTime あり → false (= 完全 ghost ではない)", () => {
    const e = mkGhostModify("evt");
    e.when = {
      startTime: "10:00",
      timeHint: null,
      provenance: utteranceProvenance(["10時"], "high"),
    };
    expect(isGhostModifyEvent(e)).toBe(false);
  });

  it("turn_mode=modify + place_ref あり → false", () => {
    const e = mkGhostModify("evt");
    e.where = {
      place_ref: "スタバ",
      placeType: "chain_brand",
      provenance: utteranceProvenance(["スタバ"], "high"),
    };
    expect(isGhostModifyEvent(e)).toBe(false);
  });

  it("turn_mode=modify + activity あり → false", () => {
    const e = mkGhostModify("evt");
    e.what = {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    };
    expect(isGhostModifyEvent(e)).toBe(false);
  });

  it("turn_mode=modify + place_ref が空白文字のみ → true", () => {
    const e = mkGhostModify("evt");
    e.where = {
      place_ref: "   ",
      placeType: null,
      provenance: inferredProvenance(),
    };
    expect(isGhostModifyEvent(e)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dedupCanonicalEvents — CEO 確定 7 ケース
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dedupCanonicalEvents: CEO 確定 7 ケース", () => {
  // Case 1: ghost を含む配列 → ghost が dedup でも除外される (実際には isGhostModifyEvent
  // で先に filter する想定だが、dedupCanonicalEvents は ghost をスルーする)
  // → 本 test は filter + dedup の組み合わせを想定したケース 7 で確認

  it("Case 2: same-time canonical duplicate → 1 件に merge", () => {
    // CEO 観測ケース: turn 5 で LLM が prior 再構築 (same canonical)
    const e1 = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6598, lng: 139.7004 },
        provenance: toolProvenance(),
      },
    });
    const e2 = mkEvent({
      event_id: "event_3", // LLM が re-extraction で別 id 採番
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6598, lng: 139.7004 },
        provenance: toolProvenance(),
      },
    });
    const result = dedupCanonicalEvents([e1, e2]);
    expect(result).toHaveLength(1);
    // base (= e1) の event_id が維持される
    expect(result[0].event_id).toBe("event_1");
  });

  it("Case 3: different startTime → 別予定として保持 (10:00 スタバ + 12:00 スタバ)", () => {
    // 同店舗で別時刻の明示予定 → 本物別予定、merge してはいけない
    const e1 = mkEvent({ event_id: "event_1", when: { startTime: "10:00", timeHint: null, provenance: utteranceProvenance(["10時"], "high") } });
    const e2 = mkEvent({ event_id: "event_2", when: { startTime: "12:00", timeHint: null, provenance: utteranceProvenance(["12時"], "high") } });
    const result = dedupCanonicalEvents([e1, e2]);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.event_id)).toEqual(["event_1", "event_2"]);
  });

  it("Case 4: different place → 別予定として保持 (10:00 スタバ + 10:00 サドヤ)", () => {
    const e1 = mkEvent({ event_id: "event_1" });
    const e2 = mkEvent({
      event_id: "event_2",
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const result = dedupCanonicalEvents([e1, e2]);
    expect(result).toHaveLength(2);
  });

  it("Case 5: different activity → 別予定として保持 (10:00 スタバ コーヒー + 10:00 スタバ ランチ)", () => {
    const e1 = mkEvent({ event_id: "event_1" });
    const e2 = mkEvent({
      event_id: "event_2",
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: utteranceProvenance(["ランチ"], "high"),
      },
    });
    const result = dedupCanonicalEvents([e1, e2]);
    expect(result).toHaveLength(2);
  });

  it("Case 6: 「12時に新宿でランチ」 (本物 append) は merge されない (= prior と canonical 不一致)", () => {
    // CEO 観測ケース: 本物の追加予定が誤って既存 event に吸収されないこと
    const prior = mkEvent({ event_id: "event_1" }); // 10:00 スタバ コーヒー
    const newAppend = mkEvent({
      event_id: "event_2",
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
    });
    const result = dedupCanonicalEvents([prior, newAppend]);
    expect(result).toHaveLength(2);
    expect(result[1].where.place_ref).toBe("新宿");
    expect(result[1].what.activity).toBe("ランチ");
  });

  it("Case 7: ghost と本物 event 混在 → 本物のみ保持 (filter + dedup の合流)", () => {
    // 実機の usage 想定: legacyAdapter で filter → dedup の順で適用される。
    // 本 test は filter 後の dedup 動作を確認 (ghost は filter で除外済み前提)。
    const real1 = mkEvent({ event_id: "event_1" });
    const real2 = mkEvent({
      event_id: "event_2",
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
    });
    const ghost1 = mkGhostModify("event_4");
    const ghost2 = mkGhostModify("event_5");

    // filter: ghost を除外
    const filtered = [real1, real2, ghost1, ghost2].filter(
      (e) => !isGhostModifyEvent(e),
    );
    expect(filtered).toHaveLength(2);

    // dedup: same canonical merge (ない)
    const dedupped = dedupCanonicalEvents(filtered);
    expect(dedupped).toHaveLength(2);
    expect(dedupped.map((e) => e.event_id)).toEqual(["event_1", "event_2"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// merge 方向の検証 (CEO + GPT 確定): event_id 維持 + place / transport 優先
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dedupCanonicalEvents: merge 方向 (CEO + GPT 確定)", () => {
  it("event_id は base (先) を維持 (capturedHistory / dialogState 参照保護)", () => {
    const base = mkEvent({ event_id: "event_base" });
    const dup = mkEvent({ event_id: "event_dup" });
    const result = dedupCanonicalEvents([base, dup]);
    expect(result).toHaveLength(1);
    expect(result[0].event_id).toBe("event_base");
  });

  it("place は exact_proper_noun を優先 (base が exact なら base 維持)", () => {
    const base = mkEvent({
      event_id: "e1",
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 139.7 },
        provenance: toolProvenance(),
      },
    });
    const dup = mkEvent({
      event_id: "e2",
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "chain_brand", // weak
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const result = dedupCanonicalEvents([base, dup]);
    expect(result).toHaveLength(1);
    expect(result[0].where.placeType).toBe("exact_proper_noun"); // base 維持
    expect(result[0].where.coordinates).toEqual({ lat: 35.66, lng: 139.7 });
  });

  it("transport: 後の duplicate が transport を持っていれば採用 (non-null 優先)", () => {
    const base = mkEvent({ event_id: "e1", transport: null });
    const dup = mkEvent({ event_id: "e2", transport: "電車" });
    const result = dedupCanonicalEvents([base, dup]);
    expect(result).toHaveLength(1);
    expect(result[0].event_id).toBe("e1"); // base 維持
    expect(result[0].transport).toBe("電車"); // non-null 優先
  });

  it("transport: base が non-null + duplicate が null → base の non-null が維持", () => {
    const base = mkEvent({ event_id: "e1", transport: "電車" });
    const dup = mkEvent({ event_id: "e2", transport: null });
    const result = dedupCanonicalEvents([base, dup]);
    expect(result).toHaveLength(1);
    expect(result[0].transport).toBe("電車");
  });
});
