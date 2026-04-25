/**
 * Phase 2 scope 3 — legacyAdapter field-level event merge
 *
 * 目的（CEO 2026-04-26）:
 *   「電車」入力で legacyAdapter が currentEvents (transport だけ持つ partial event)
 *   で priorPersistedEvents (startTime / where.coordinates / placeType を持つ canonical
 *   event) を **丸ごと置換** していたために、startTime と where.coordinates が
 *   消えていた問題を field-level merge で修正する。
 *
 * 不変条件 (CEO + GPT 合意):
 *   I1: event 同一性は event_id 一致 OR (startTime + place_ref) 一致 で判定
 *   I2: priorPersistedEvents は **field-level merge 経由で保持**（全置換しない）
 *   I3: null / undefined field で既存値を上書きしない
 *   I4: merge 後の events から plan rebuild + travel synthesize が走る
 *   I5: merge logic は event 数の不一致を defensive に処理
 *   I6: 既存 non-null 値の意図的更新は段階2 scope 外（null fill のみに限定）
 *
 * このファイルは failing test 先行で書かれる。実装後に PASS する。
 */

import { describe, it, expect } from "vitest";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
import { utteranceProvenance } from "@/lib/alter-morning/comprehension/eventSchema";

// 注: legacyAdapter から `mergeEventFields` を export する想定。実装はこれから。
import { mergeEventFields } from "@/lib/alter-morning/legacyAdapter";
import { buildPlanAndSegmentsFromEvents } from "@/lib/alter-morning/planning/planRebuild";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Turn 1〜2 で確立した canonical event (selection 後の確定状態を模す) */
function mkPriorEvent(opts: {
  event_id: string;
  startTime: string;
  placeRef: string;
  lat: number;
  lng: number;
  placeType?: string;
  transport?: string | null;
}): ComprehensionEvent {
  return {
    event_id: opts.event_id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: opts.startTime,
      timeHint: null,
      provenance: utteranceProvenance([opts.startTime], "high"),
    },
    where: {
      place_ref: opts.placeRef,
      placeType: opts.placeType ?? "exact_proper_noun",
      coordinates: { lat: opts.lat, lng: opts.lng },
      provenance: utteranceProvenance([opts.placeRef], "high"),
    },
    what: {
      activity: "滞在",
      activityCanonical: "滞在",
      provenance: utteranceProvenance(["滞在"], "high"),
    },
    who: [],
    transport: opts.transport ?? null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

/** Turn 3「電車」で fresh comprehension が返す partial event (event_id 不一致) */
function mkCurrentEventTransportOnly(opts: {
  event_id: string;
  transport: string;
}): ComprehensionEvent {
  return {
    event_id: opts.event_id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: utteranceProvenance([], "low"),
    },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: utteranceProvenance([], "low"),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: utteranceProvenance([], "low"),
    },
    who: [],
    transport: opts.transport,
    certainty: "asserted",
    missing_semantic_critical: ["where", "what"],
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 event_id 一致 merge（answerBinder 経路相当 / 同一性確実）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 event_id 一致 merge", () => {
  it("§1.1 event_id 一致 + currentEvent に transport のみ → transport 追加 + 既存 field 全保持", () => {
    const prior = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スターバックス コーヒー TSUTAYA 1F店",
      lat: 35.6587,
      lng: 139.6997,
    });
    const current = mkCurrentEventTransportOnly({
      event_id: "seg_1",
      transport: "電車",
    });

    const merged = mergeEventFields([current], [prior]);

    expect(merged).toHaveLength(1);
    expect(merged[0].event_id).toBe("seg_1");
    // I3: null で上書きされない
    expect(merged[0].when.startTime).toBe("09:00");
    expect(merged[0].where.place_ref).toBe("スターバックス コーヒー TSUTAYA 1F店");
    expect(merged[0].where.coordinates).toEqual({ lat: 35.6587, lng: 139.6997 });
    expect(merged[0].where.placeType).toBe("exact_proper_noun");
    expect(merged[0].what.activity).toBe("滞在");
    // I2: transport は追加される
    expect(merged[0].transport).toBe("電車");
    // missing_semantic_critical も既存 (空) を保持（current の ["where","what"] は捨てる）
    expect(merged[0].missing_semantic_critical).toEqual([]);
  });

  it("§1.2 event_id 一致 + currentEvent が full（startTime も持つ）→ current 値を採用", () => {
    // 「やっぱり 10 時で」のような意図的更新は段階2 scope 外だが、
    // current が non-null を持つ場合は current を尊重する（既存挙動）。
    // ただし I6 で scope 外と認識（test は将来の挙動を固定するための baseline）。
    const prior = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スタバ",
      lat: 35.0,
      lng: 139.0,
    });
    const current = mkPriorEvent({
      event_id: "seg_1",
      startTime: "10:00",
      placeRef: "マック",
      lat: 35.5,
      lng: 139.5,
      transport: "電車",
    });

    const merged = mergeEventFields([current], [prior]);

    expect(merged).toHaveLength(1);
    expect(merged[0].when.startTime).toBe("10:00");
    expect(merged[0].where.place_ref).toBe("マック");
    expect(merged[0].transport).toBe("電車");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 event_id 不一致 merge（fresh comprehension 経路 / GPT/CEO 懸念の核心）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 event_id 不一致 + (startTime, place_ref) 一致 merge", () => {
  it("§2.1 event_id 異なる + (startTime, place_ref) 一致 → 同一 event とみなして merge", () => {
    // priorPersistedEvents は seg_1 (bridge 由来) で event_N+1 と不一致
    // でも startTime + place_ref が同じなら同一 event とみなす
    const prior = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スターバックス コーヒー TSUTAYA 1F店",
      lat: 35.6587,
      lng: 139.6997,
    });
    // しかし current は startTime も where も null（電車だけ）
    // → startTime/place_ref 一致 fall back は使えない
    // → position fallback を使う
    const current = mkCurrentEventTransportOnly({
      event_id: "event_42",
      transport: "電車",
    });

    const merged = mergeEventFields([current], [prior]);

    // position fallback で merge される
    expect(merged).toHaveLength(1);
    expect(merged[0].when.startTime).toBe("09:00");
    expect(merged[0].where.coordinates).toEqual({ lat: 35.6587, lng: 139.6997 });
    expect(merged[0].transport).toBe("電車");
  });

  it("§2.2 event_id 異なる + (startTime, place_ref) 一致 (full event) → identity 一致 merge", () => {
    // full event 同士で startTime + place_ref が一致するケース
    const prior = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スターバックス コーヒー TSUTAYA 1F店",
      lat: 35.6587,
      lng: 139.6997,
    });
    const current: ComprehensionEvent = {
      ...mkPriorEvent({
        event_id: "event_42",
        startTime: "09:00",
        placeRef: "スターバックス コーヒー TSUTAYA 1F店",
        lat: 35.6587,
        lng: 139.6997,
        transport: "電車",
      }),
    };

    const merged = mergeEventFields([current], [prior]);

    expect(merged).toHaveLength(1);
    // 同一性が(startTime, place_ref) で確認できたので、 transport は current から merge
    expect(merged[0].transport).toBe("電車");
    expect(merged[0].when.startTime).toBe("09:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 position fallback（同一性が判定できないが events 数一致）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 position fallback merge", () => {
  it("§3.1 events 数一致 + 同一性判定不可 → index で merge", () => {
    const prior = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スタバ",
      lat: 35.6587,
      lng: 139.6997,
    });
    // transport だけの partial event（同一性判定の手掛かりが何もない）
    const current = mkCurrentEventTransportOnly({
      event_id: "event_99",
      transport: "電車",
    });

    const merged = mergeEventFields([current], [prior]);

    expect(merged).toHaveLength(1);
    // position 0 同士で merge
    expect(merged[0].when.startTime).toBe("09:00");
    expect(merged[0].where.place_ref).toBe("スタバ");
    expect(merged[0].transport).toBe("電車");
  });

  it("§3.2 events 数不一致（current 1 件 / prior 2 件）→ 各 prior の対応が取れず fallback 中止 → priorPersistedEvents をそのまま採用", () => {
    const prior1 = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スタバ",
      lat: 35.6587,
      lng: 139.6997,
    });
    const prior2 = mkPriorEvent({
      event_id: "seg_2",
      startTime: "11:00",
      placeRef: "マック",
      lat: 35.6893,
      lng: 139.7025,
    });
    const current = mkCurrentEventTransportOnly({
      event_id: "event_99",
      transport: "電車",
    });

    const merged = mergeEventFields([current], [prior1, prior2]);

    // I5 defensive: 数不一致は merge 不能 → priorPersistedEvents を全保持して current 破棄
    expect(merged).toHaveLength(2);
    expect(merged[0].when.startTime).toBe("09:00");
    expect(merged[1].when.startTime).toBe("11:00");
    // transport も prior が null なら null のまま（current は無視される）
    expect(merged[0].transport).toBeNull();
    expect(merged[1].transport).toBeNull();
  });

  it("§3.3 events 数一致（複数）→ 各 position で merge", () => {
    const prior1 = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スタバ",
      lat: 35.6587,
      lng: 139.6997,
    });
    const prior2 = mkPriorEvent({
      event_id: "seg_2",
      startTime: "11:00",
      placeRef: "マック",
      lat: 35.6893,
      lng: 139.7025,
    });
    const current1 = mkCurrentEventTransportOnly({
      event_id: "event_99",
      transport: "電車",
    });
    const current2 = mkCurrentEventTransportOnly({
      event_id: "event_100",
      transport: "電車",
    });

    const merged = mergeEventFields([current1, current2], [prior1, prior2]);

    expect(merged).toHaveLength(2);
    expect(merged[0].when.startTime).toBe("09:00");
    expect(merged[1].when.startTime).toBe("11:00");
    expect(merged[0].transport).toBe("電車");
    expect(merged[1].transport).toBe("電車");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 edge cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 edge cases", () => {
  it("§4.1 currentEvents 空 → priorPersistedEvents を返す（既存挙動）", () => {
    const prior = mkPriorEvent({
      event_id: "seg_1",
      startTime: "09:00",
      placeRef: "スタバ",
      lat: 35.6587,
      lng: 139.6997,
    });
    const merged = mergeEventFields([], [prior]);
    expect(merged).toEqual([prior]);
  });

  it("§4.2 priorPersistedEvents 空 → currentEvents をそのまま返す", () => {
    const current = mkCurrentEventTransportOnly({
      event_id: "event_1",
      transport: "電車",
    });
    const merged = mergeEventFields([current], []);
    expect(merged).toEqual([current]);
  });

  it("§4.3 両方空 → 空配列", () => {
    expect(mergeEventFields([], [])).toEqual([]);
  });

  it("§4.4 priorPersistedEvents undefined → currentEvents をそのまま返す", () => {
    const current = mkCurrentEventTransportOnly({
      event_id: "event_1",
      transport: "電車",
    });
    const merged = mergeEventFields([current], undefined);
    expect(merged).toEqual([current]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 round-trip (CEO 観測ケース完全再現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 round-trip (CEO 2026-04-26 観測ケース再現)", () => {
  it("§5.1 Turn 3「電車」で event_id mismatch + 全 field null でも startTime / where 維持", () => {
    // Turn 1+2: bridge 由来 + selection 完了済の canonical event
    const turn2Events = [
      mkPriorEvent({
        event_id: "seg_1",
        startTime: "09:00",
        placeRef: "スターバックス コーヒー TSUTAYA 1F店",
        lat: 35.6587,
        lng: 139.6997,
      }),
    ];
    // Turn 3「電車」: comprehension が fresh で event_N 採番、partial event
    const turn3CurrentEvents = [
      mkCurrentEventTransportOnly({ event_id: "event_42", transport: "電車" }),
    ];

    const merged = mergeEventFields(turn3CurrentEvents, turn2Events);

    // I1-I5 全部満たす
    expect(merged).toHaveLength(1);
    expect(merged[0].when.startTime).toBe("09:00");
    expect(merged[0].where.place_ref).toBe("スターバックス コーヒー TSUTAYA 1F店");
    expect(merged[0].where.coordinates).toEqual({ lat: 35.6587, lng: 139.6997 });
    expect(merged[0].where.placeType).toBe("exact_proper_noun");
    expect(merged[0].transport).toBe("電車");

    // CEO 観測「[時間未確定]」の根本症状: kind="todo" が出ないことを保証
    // → buildPlanAndSegmentsFromEvents の eventToPlanItem は startTime null だと
    // kind="todo"。startTime が "09:00" 維持されていれば kind="fixed"。
    expect(merged[0].when.startTime).not.toBeNull();
  });

  it("§5.2 連結検証 — mergeEventFields → buildPlanAndSegmentsFromEvents で plan items.startTime が消えない", () => {
    // 「時間消失」の真因 chain を実コード連結で立証:
    //   1. legacyAdapter.mergeEventFields → events に startTime 保持
    //   2. planRebuild.buildPlanAndSegmentsFromEvents → items[0].startTime = events[0].when.startTime
    //   3. items[0].kind === "fixed" (NOT "todo" / [時間未確定])
    const turn2Events = [
      mkPriorEvent({
        event_id: "seg_1",
        startTime: "09:00",
        placeRef: "スターバックス コーヒー TSUTAYA 1F店",
        lat: 35.6587,
        lng: 139.6997,
      }),
    ];
    const turn3CurrentEvents = [
      mkCurrentEventTransportOnly({ event_id: "event_42", transport: "電車" }),
    ];
    const merged = mergeEventFields(turn3CurrentEvents, turn2Events);

    const built = buildPlanAndSegmentsFromEvents({
      events: merged,
      enableTransportV2: true,
    });

    // plan items に startTime が残る = 「[時間未確定]」表示にならない
    expect(built.items.length).toBeGreaterThanOrEqual(1);
    const fixedItems = built.items.filter((i) => i.kind === "fixed");
    expect(fixedItems.length).toBeGreaterThanOrEqual(1);
    expect(fixedItems[0].startTime).toBe("09:00");
    // event_id は seg_1 を維持（mergeIntoPrior で prior の event_id 採用）
    expect(fixedItems[0].id).toBe("seg_1");
  });
});
