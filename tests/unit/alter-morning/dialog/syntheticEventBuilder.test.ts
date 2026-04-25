/**
 * syntheticEventBuilder unit tests
 *
 * 検証観点:
 *   §1 buildSyntheticEventFromSegment(segment, hasPlaceAsk)
 *     - event_id = segment.id（ID resolver 不要 / CEO 指示）
 *     - hasPlaceAsk=true → missing_semantic_critical=["where"], certainty="tentative"
 *     - hasPlaceAsk=false → missing_semantic_critical=[], certainty="asserted"
 *     - resolved 座標が valid なら保持、欠損 / 範囲外なら null
 *     - placeType / place_ref / activity は segment から忠実に転写
 *     - provenance.confidence が resolutionConfidence から derive される
 *   §2 buildSyntheticEventsFromPlanState(planState)
 *     - missingFields の placeAsk:seg_X から該当 segment を blocking 化
 *     - placeAsk なし segment は non-blocking
 *     - segments 空 / null planState → 空配列
 *     - CEO 観測ケース完全再現
 */
import { describe, it, expect } from "vitest";
import {
  buildSyntheticEventFromSegment,
  buildSyntheticEventsFromPlanState,
} from "@/lib/alter-morning/dialog/syntheticEventBuilder";
import type { PlanSegment, PlanState } from "@/lib/alter-morning/planState";

// ─── 最小 PlanSegment factory（検証対象 field のみに集中） ───
function mkSegment(opts: {
  id: string;
  order?: number;
  activity?: string;
  activityCanonical?: string;
  place?: string;
  placeCanonical?: string;
  placeCategory?: string;
  placeType?: PlanSegment["placeType"];
  startTime?: string;
  resolvedLat?: number;
  resolvedLng?: number;
  resolutionConfidence?: PlanSegment["resolutionConfidence"];
}): PlanSegment {
  return {
    id: opts.id,
    order: opts.order ?? 1,
    activity: opts.activity ?? "滞在",
    activityCanonical: opts.activityCanonical,
    place: opts.place,
    placeCanonical: opts.placeCanonical,
    placeCategory: opts.placeCategory as PlanSegment["placeCategory"] | undefined,
    placeType: opts.placeType,
    startTime: opts.startTime,
    resolvedLat: opts.resolvedLat,
    resolvedLng: opts.resolvedLng,
    resolutionConfidence: opts.resolutionConfidence,
    timeConstraint: opts.startTime
      ? { type: "fixed_start", fixedTime: opts.startTime }
      : undefined,
    anchorScore: 4,
    companions: [],
    status: "tentative",
  } as PlanSegment;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 buildSyntheticEventFromSegment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 buildSyntheticEventFromSegment", () => {
  it("§1.1 placeAsk segment（confidence=low + resolved coords あり） — hard gate 用に missing_semantic_critical=[where] / coords は保持", () => {
    const seg = mkSegment({
      id: "seg_1",
      activity: "滞在",
      place: "渋谷のスタバ",
      placeCanonical: "スターバックス",
      placeType: "chain_brand",
      startTime: "09:00",
      resolvedLat: 35.6587191,
      resolvedLng: 139.6997413,
      resolutionConfidence: "low",
    });

    const ev = buildSyntheticEventFromSegment(seg, true);

    // 重要: ID resolver なし、segment.id を流用
    expect(ev.event_id).toBe("seg_1");
    expect(ev.turn_mode).toBe("create");
    expect(ev.target_ref).toBeNull();
    expect(ev.target_ref_confidence).toBeNull();
    expect(ev.change_scope).toBeNull();
    // hard gate の核心（missing_semantic_critical bookkeeping、placeType と二重 enforce）
    expect(ev.missing_semantic_critical).toEqual(["where"]);
    expect(ev.certainty).toBe("tentative");
    // place 情報は転写
    expect(ev.where.place_ref).toBe("渋谷のスタバ");
    expect(ev.where.placeType).toBe("chain_brand");
    // 座標は保持（map 描画で使う）
    expect(ev.where.coordinates).toEqual({ lat: 35.6587191, lng: 139.6997413 });
    expect(ev.where.provenance.provenance_confidence).toBe("low");
    expect(ev.where.provenance.source_type).toBe("utterance");
    // activity / 時刻
    expect(ev.what.activity).toBe("滞在");
    expect(ev.when.startTime).toBe("09:00");
  });

  it("§1.2 non-placeAsk segment（高 confidence） — non-blocking、coords あり", () => {
    const seg = mkSegment({
      id: "seg_2",
      activity: "ミーティング",
      place: "渋谷オフィス",
      placeType: "exact_proper_noun",
      startTime: "10:00",
      resolvedLat: 35.66,
      resolvedLng: 139.70,
      resolutionConfidence: "high",
    });

    const ev = buildSyntheticEventFromSegment(seg, false);

    expect(ev.missing_semantic_critical).toEqual([]);
    expect(ev.certainty).toBe("asserted");
    expect(ev.where.placeType).toBe("exact_proper_noun");
    expect(ev.where.provenance.provenance_confidence).toBe("high");
  });

  it("§1.3 resolved coords 完全欠損 → coordinates=null", () => {
    const seg = mkSegment({
      id: "seg_3",
      place: "どこか",
      placeType: "chain_brand",
      // resolvedLat / resolvedLng いずれも未設定
    });

    const ev = buildSyntheticEventFromSegment(seg, true);

    expect(ev.where.coordinates).toBeNull();
    // 他 field は通常通り
    expect(ev.event_id).toBe("seg_3");
    expect(ev.where.place_ref).toBe("どこか");
  });

  it("§1.4 resolved coords 部分欠損（lat のみ）→ coordinates=null", () => {
    const seg = mkSegment({
      id: "seg_4",
      place: "新宿マック",
      resolvedLat: 35.69,
      // resolvedLng 欠損
    });

    const ev = buildSyntheticEventFromSegment(seg, true);
    expect(ev.where.coordinates).toBeNull();
  });

  it("§1.5 NaN / Infinity の coords → coordinates=null（M5 isValidCoord と整合）", () => {
    const seg = mkSegment({
      id: "seg_5",
      place: "X",
      resolvedLat: NaN,
      resolvedLng: 139.7,
    });
    const ev = buildSyntheticEventFromSegment(seg, true);
    expect(ev.where.coordinates).toBeNull();
  });

  it("§1.6 place / activity 欠損 → null / 空文字で safe", () => {
    const seg = mkSegment({
      id: "seg_6",
      activity: "",
      // place 未設定
    });

    const ev = buildSyntheticEventFromSegment(seg, false);

    expect(ev.where.place_ref).toBeNull();
    expect(ev.what.activity).toBe("");
    expect(ev.what.activityCanonical).toBe("");
  });

  it("§1.7 startTime あり → when.startTime / provenance に span 入る", () => {
    const seg = mkSegment({ id: "seg_7", place: "P", startTime: "11:00" });
    const ev = buildSyntheticEventFromSegment(seg, true);
    expect(ev.when.startTime).toBe("11:00");
    expect(ev.when.provenance.source_span).toEqual(["11:00"]);
  });

  it("§1.8 startTime なし → when.startTime=null", () => {
    const seg = mkSegment({ id: "seg_8", place: "P" });
    const ev = buildSyntheticEventFromSegment(seg, true);
    expect(ev.when.startTime).toBeNull();
  });

  it("§1.9 resolutionConfidence=medium → provenance_confidence=medium、unresolved → low", () => {
    const segMedium = mkSegment({
      id: "seg_med",
      place: "P",
      resolutionConfidence: "medium",
    });
    const segUnresolved = mkSegment({
      id: "seg_unr",
      place: "P",
      resolutionConfidence: "unresolved",
    });
    const segUndefined = mkSegment({ id: "seg_undef", place: "P" });

    expect(
      buildSyntheticEventFromSegment(segMedium, true).where.provenance.provenance_confidence,
    ).toBe("medium");
    expect(
      buildSyntheticEventFromSegment(segUnresolved, true).where.provenance.provenance_confidence,
    ).toBe("low");
    // resolutionConfidence undefined → fallback medium
    expect(
      buildSyntheticEventFromSegment(segUndefined, true).where.provenance.provenance_confidence,
    ).toBe("medium");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 buildSyntheticEventsFromPlanState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkPlanState(opts: {
  segments?: PlanSegment[];
  missingFields?: string[];
}): PlanState {
  return {
    targetDate: "2026-04-25",
    targetDateLabel: "今日",
    timezone: "Asia/Tokyo",
    segments: opts.segments ?? [],
    goOut: true,
    status: "collecting",
    missingFields: opts.missingFields ?? [],
    transport: "car",
  } as PlanState;
}

describe("§2 buildSyntheticEventsFromPlanState", () => {
  it("§2.1 missingFields の placeAsk:seg_X が該当 segment を blocking 化、他 segment は non-blocking", () => {
    const plan = mkPlanState({
      segments: [
        mkSegment({ id: "seg_1", place: "渋谷のスタバ", placeType: "chain_brand", startTime: "09:00", resolvedLat: 35.6587, resolvedLng: 139.6997, resolutionConfidence: "low" }),
        mkSegment({ id: "seg_2", place: "新宿のオフィス", placeType: "exact_proper_noun", startTime: "10:00", resolvedLat: 35.69, resolvedLng: 139.70, resolutionConfidence: "high" }),
      ],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ"],
    });

    const events = buildSyntheticEventsFromPlanState(plan);

    expect(events).toHaveLength(2);
    expect(events[0].event_id).toBe("seg_1");
    expect(events[0].missing_semantic_critical).toEqual(["where"]);
    expect(events[0].certainty).toBe("tentative");
    expect(events[1].event_id).toBe("seg_2");
    expect(events[1].missing_semantic_critical).toEqual([]);
    expect(events[1].certainty).toBe("asserted");
  });

  it("§2.2 placeAsk が存在しない場合、全 segment が non-blocking", () => {
    const plan = mkPlanState({
      segments: [
        mkSegment({ id: "seg_1", place: "X", placeType: "exact_proper_noun" }),
      ],
      missingFields: [],
    });

    const events = buildSyntheticEventsFromPlanState(plan);

    expect(events).toHaveLength(1);
    expect(events[0].missing_semantic_critical).toEqual([]);
  });

  it("§2.3 placeConfirm:seg_X は対象外（confidence=medium 用、Phase 1 では blocking 化しない）", () => {
    const plan = mkPlanState({
      segments: [mkSegment({ id: "seg_1", place: "X" })],
      missingFields: ["placeConfirm:seg_1:X"],
    });

    const events = buildSyntheticEventsFromPlanState(plan);
    // placeConfirm は無視されるので、seg_1 は non-blocking
    expect(events[0].missing_semantic_critical).toEqual([]);
  });

  it("§2.4 segments 空配列 → 空配列", () => {
    const plan = mkPlanState({ segments: [] });
    expect(buildSyntheticEventsFromPlanState(plan)).toEqual([]);
  });

  it("§2.5 planState=null → 空配列", () => {
    expect(buildSyntheticEventsFromPlanState(null)).toEqual([]);
  });

  it("§2.6 planState=undefined → 空配列", () => {
    expect(buildSyntheticEventsFromPlanState(undefined)).toEqual([]);
  });

  it("§2.7 CEO 観測ケース完全再現（aneurasync 1c6ef878 / スタバ + マック の 2 件 placeAsk）", () => {
    // server response の planStateV2 を再現
    const plan = mkPlanState({
      segments: [
        mkSegment({
          id: "seg_1",
          activity: "滞在",
          place: "渋谷のスタバ",
          placeCanonical: "スターバックス",
          placeCategory: "cafe",
          placeType: "chain_brand",
          startTime: "09:00",
          resolvedLat: 35.6587191,
          resolvedLng: 139.6997413,
          resolutionConfidence: "low",
        }),
        mkSegment({
          id: "seg_2",
          activity: "滞在",
          place: "新宿のマック",
          placeCanonical: "マクドナルド",
          placeCategory: "fast_food",
          placeType: "chain_brand",
          startTime: "11:00",
          resolvedLat: 35.689315799999996,
          resolvedLng: 139.7025099,
          resolutionConfidence: "low",
        }),
      ],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ", "placeAsk:seg_2:新宿のマック"],
    });

    const events = buildSyntheticEventsFromPlanState(plan);

    expect(events).toHaveLength(2);
    // 両方とも blocking
    expect(events.map((e) => e.event_id)).toEqual(["seg_1", "seg_2"]);
    expect(events[0].missing_semantic_critical).toEqual(["where"]);
    expect(events[1].missing_semantic_critical).toEqual(["where"]);
    expect(events[0].certainty).toBe("tentative");
    expect(events[1].certainty).toBe("tentative");
    // placeType="chain_brand" → whereSharpness="vague" → blocking
    expect(events[0].where.placeType).toBe("chain_brand");
    expect(events[1].where.placeType).toBe("chain_brand");
    // 座標は保持（M5 map 描画と整合）
    expect(events[0].where.coordinates).toEqual({ lat: 35.6587191, lng: 139.6997413 });
    expect(events[1].where.coordinates).toEqual({ lat: 35.689315799999996, lng: 139.7025099 });
  });
});
