/**
 * MorningMapView pure helpers (W3-PR-13 / C3)
 *
 * React render は jsdom 未導入のためテストしない（vitest.config は node 環境）。
 * 代わりに pin 抽出 / fail-safe 条件 / 同一点群判定 / bounds 計算を検証する。
 * Render 層は @vis.gl/react-google-maps への pass-through なのでロジックは薄い。
 */
import { describe, it, expect } from "vitest";
import {
  isValidCoord,
  extractPins,
  extractPinsFromPlanItems,
  isSamePointCluster,
  computeBounds,
} from "@/components/home/morning/MorningMapView";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
import type { PlanItem } from "@/lib/alter-morning/types";

// ─── 最小 event factory（検証対象の where.coordinates のみに集中） ───
function mkEvent(
  id: string,
  coordinates: { lat: number; lng: number } | null,
  place_ref: string | null = null,
): ComprehensionEvent {
  return {
    event_id: id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: { startTime: null, timeHint: null, provenance: { source_type: "utterance", source_span: [], provenance_confidence: "high", from_utterance: true } },
    where: {
      place_ref,
      placeType: null,
      coordinates,
      provenance: { source_type: "utterance", source_span: [], provenance_confidence: "high", from_utterance: true },
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: { source_type: "utterance", source_span: [], provenance_confidence: "high", from_utterance: true },
    },
    who: [],
    transport: null,
    certainty: "asserted",
  } as unknown as ComprehensionEvent;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 isValidCoord — fail-safe の最前線
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MorningMapView.isValidCoord", () => {
  it("§1.1 null / undefined を弾く", () => {
    expect(isValidCoord(null)).toBe(false);
    expect(isValidCoord(undefined)).toBe(false);
  });

  it("§1.2 NaN / Infinity を弾く", () => {
    expect(isValidCoord({ lat: NaN, lng: 0 })).toBe(false);
    expect(isValidCoord({ lat: 0, lng: Infinity })).toBe(false);
    expect(isValidCoord({ lat: -Infinity, lng: 0 })).toBe(false);
  });

  it("§1.3 緯度経度レンジ外を弾く", () => {
    expect(isValidCoord({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidCoord({ lat: -91, lng: 0 })).toBe(false);
    expect(isValidCoord({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidCoord({ lat: 0, lng: -181 })).toBe(false);
  });

  it("§1.4 有効な座標を通す（東京駅）", () => {
    expect(isValidCoord({ lat: 35.6812, lng: 139.7671 })).toBe(true);
  });

  it("§1.5 境界値を通す", () => {
    expect(isValidCoord({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidCoord({ lat: -90, lng: -180 })).toBe(true);
    expect(isValidCoord({ lat: 0, lng: 0 })).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 extractPins — events から有効な pin 群を抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MorningMapView.extractPins", () => {
  it("§2.1 coordinates が null の event を除外", () => {
    const events = [
      mkEvent("e1", null),
      mkEvent("e2", { lat: 35.68, lng: 139.76 }),
    ];
    const pins = extractPins(events);
    expect(pins).toHaveLength(1);
    expect(pins[0].id).toBe("e2");
  });

  it("§2.2 複数 event から順番を保って抽出", () => {
    const events = [
      mkEvent("a", { lat: 35.68, lng: 139.76 }, "東京駅"),
      mkEvent("b", { lat: 35.69, lng: 139.70 }, "新宿"),
      mkEvent("c", { lat: 35.66, lng: 139.73 }, "渋谷"),
    ];
    const pins = extractPins(events);
    expect(pins.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(pins[0].label).toBe("東京駅");
    expect(pins[2].label).toBe("渋谷");
  });

  it("§2.3 invalid 座標の event を除外", () => {
    const events = [
      mkEvent("ok", { lat: 35.68, lng: 139.76 }),
      mkEvent("nan", { lat: NaN, lng: 0 }),
      mkEvent("oob", { lat: 100, lng: 0 }),
    ];
    const pins = extractPins(events);
    expect(pins).toHaveLength(1);
    expect(pins[0].id).toBe("ok");
  });

  it("§2.4 place_ref 無しでも通す（label は null）", () => {
    const events = [mkEvent("e1", { lat: 35.68, lng: 139.76 }, null)];
    const pins = extractPins(events);
    expect(pins[0].label).toBeNull();
  });

  it("§2.5 空配列", () => {
    expect(extractPins([])).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 isSamePointCluster — 同一点群判定（4 桁精度 ≒ 11m）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MorningMapView.isSamePointCluster", () => {
  it("§3.1 全点が完全一致 → true", () => {
    const pins = [
      { id: "a", coord: { lat: 35.6812, lng: 139.7671 }, label: null },
      { id: "b", coord: { lat: 35.6812, lng: 139.7671 }, label: null },
    ];
    expect(isSamePointCluster(pins)).toBe(true);
  });

  it("§3.2 4 桁精度内の揺れ（11m 以内）→ true", () => {
    const pins = [
      { id: "a", coord: { lat: 35.68121, lng: 139.76711 }, label: null },
      { id: "b", coord: { lat: 35.68122, lng: 139.76713 }, label: null },
    ];
    expect(isSamePointCluster(pins)).toBe(true);
  });

  it("§3.3 5 桁目の差（〜100m オーダー）→ false", () => {
    const pins = [
      { id: "a", coord: { lat: 35.6812, lng: 139.7671 }, label: null },
      { id: "b", coord: { lat: 35.6912, lng: 139.7771 }, label: null }, // 約 1.4km 差
    ];
    expect(isSamePointCluster(pins)).toBe(false);
  });

  it("§3.4 空配列 → true（map 描画しないので実質問題なし）", () => {
    expect(isSamePointCluster([])).toBe(true);
  });

  it("§3.5 単一点 → true", () => {
    const pins = [{ id: "a", coord: { lat: 35.68, lng: 139.76 }, label: null }];
    expect(isSamePointCluster(pins)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 computeBounds — fitBounds 用矩形の計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MorningMapView.computeBounds", () => {
  it("§4.1 2 点から N/S/E/W を正確に算出", () => {
    const pins = [
      { id: "a", coord: { lat: 35.69, lng: 139.70 }, label: null },
      { id: "b", coord: { lat: 35.66, lng: 139.77 }, label: null },
    ];
    const b = computeBounds(pins);
    expect(b).not.toBeNull();
    expect(b!.north).toBe(35.69);
    expect(b!.south).toBe(35.66);
    expect(b!.east).toBe(139.77);
    expect(b!.west).toBe(139.70);
  });

  it("§4.2 3 点以上でも正しく min/max", () => {
    const pins = [
      { id: "a", coord: { lat: 35.69, lng: 139.70 }, label: null },
      { id: "b", coord: { lat: 35.66, lng: 139.77 }, label: null },
      { id: "c", coord: { lat: 35.71, lng: 139.73 }, label: null },
    ];
    const b = computeBounds(pins);
    expect(b!.north).toBe(35.71);
    expect(b!.south).toBe(35.66);
    expect(b!.east).toBe(139.77);
    expect(b!.west).toBe(139.70);
  });

  it("§4.3 空配列 → null", () => {
    expect(computeBounds([])).toBeNull();
  });

  it("§4.4 単一点でも矩形を返す（N=S, E=W）", () => {
    const pins = [{ id: "a", coord: { lat: 35.68, lng: 139.76 }, label: null }];
    const b = computeBounds(pins);
    expect(b).not.toBeNull();
    expect(b!.north).toBe(b!.south);
    expect(b!.east).toBe(b!.west);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 統合: MorningMapView の render 判定（mount するか否か）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MorningMapView render gate（実装と同じ判定ロジック）", () => {
  it("§5.1 pin 2 未満 → null return 相当（extractPins.length < 2）", () => {
    expect(extractPins([mkEvent("a", { lat: 35.68, lng: 139.76 })]).length).toBeLessThan(2);
    expect(extractPins([mkEvent("a", null)]).length).toBeLessThan(2);
    expect(extractPins([]).length).toBeLessThan(2);
  });

  it("§5.2 2 pin 以上で allSamePoint=true → defaultZoom fallback path", () => {
    const events = [
      mkEvent("a", { lat: 35.6812, lng: 139.7671 }),
      mkEvent("b", { lat: 35.68121, lng: 139.76712 }), // 4 桁精度で一致
    ];
    const pins = extractPins(events);
    expect(pins.length).toBeGreaterThanOrEqual(2);
    expect(isSamePointCluster(pins)).toBe(true);
  });

  it("§5.3 2 pin 以上で allSamePoint=false → fitBounds path", () => {
    const events = [
      mkEvent("a", { lat: 35.68, lng: 139.76 }),
      mkEvent("b", { lat: 35.70, lng: 139.80 }),
    ];
    const pins = extractPins(events);
    expect(pins.length).toBeGreaterThanOrEqual(2);
    expect(isSamePointCluster(pins)).toBe(false);
    expect(computeBounds(pins)).not.toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 extractPinsFromPlanItems — W3-PR-13 M5 fix
// v2 plan.items から pin 抽出ロジック。
// kind === "fixed" + location.lat/lng が valid な item のみが pin になる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 最小 PlanItem factory（pin 抽出に必要な field のみ） */
function mkPlanItem(opts: {
  id: string;
  kind: PlanItem["kind"];
  lat?: number | null;
  lng?: number | null;
  resolvedName?: string;
  label?: string;
}): PlanItem {
  const { id, kind, lat, lng, resolvedName, label } = opts;
  const hasLocation = lat !== undefined || lng !== undefined || resolvedName || label;
  return {
    id,
    kind,
    text: id,
    what: null,
    durationMin: 30,
    fixedStart: kind === "fixed",
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
    ...(hasLocation
      ? {
          location: {
            canonicalId: "test",
            label: label ?? "test",
            source: "user_explicit" as const,
            ...(typeof lat === "number" ? { lat } : {}),
            ...(typeof lng === "number" ? { lng } : {}),
            ...(resolvedName ? { resolvedName } : {}),
          },
        }
      : {}),
  } as PlanItem;
}

describe("§6 extractPinsFromPlanItems (M5 fix)", () => {
  it("§6.1 fixed item with valid lat/lng → pin に含まれる", () => {
    const items = [
      mkPlanItem({
        id: "seg_1",
        kind: "fixed",
        lat: 35.6587191,
        lng: 139.6997413,
        resolvedName: "スターバックス コーヒー 渋谷マークシティ店",
        label: "スターバックス",
      }),
    ];
    const pins = extractPinsFromPlanItems(items);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.id).toBe("seg_1");
    expect(pins[0]?.coord.lat).toBeCloseTo(35.6587191);
    expect(pins[0]?.coord.lng).toBeCloseTo(139.6997413);
    expect(pins[0]?.label).toBe("スターバックス コーヒー 渋谷マークシティ店");
  });

  it("§6.2 todo / travel / proposal は除外", () => {
    const items = [
      mkPlanItem({ id: "seg_fixed", kind: "fixed", lat: 35.68, lng: 139.76 }),
      mkPlanItem({ id: "seg_todo", kind: "todo", lat: 35.69, lng: 139.77 }),
      mkPlanItem({ id: "seg_travel", kind: "travel", lat: 35.70, lng: 139.78 }),
    ];
    const pins = extractPinsFromPlanItems(items);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.id).toBe("seg_fixed");
  });

  it("§6.3 location 欠損 / lat or lng 欠損は除外", () => {
    const items = [
      mkPlanItem({ id: "no_location", kind: "fixed" }),
      mkPlanItem({ id: "no_lat", kind: "fixed", lng: 139.76 }),
      mkPlanItem({ id: "no_lng", kind: "fixed", lat: 35.68 }),
      mkPlanItem({ id: "ok", kind: "fixed", lat: 35.68, lng: 139.76 }),
    ];
    const pins = extractPinsFromPlanItems(items);
    expect(pins.map((p) => p.id)).toEqual(["ok"]);
  });

  it("§6.4 lat/lng が範囲外 (NaN/Infinity/緯度経度範囲外) は除外", () => {
    const items = [
      mkPlanItem({ id: "nan_lat", kind: "fixed", lat: NaN, lng: 139.76 }),
      mkPlanItem({ id: "inf_lng", kind: "fixed", lat: 35.68, lng: Infinity }),
      mkPlanItem({ id: "lat_over_90", kind: "fixed", lat: 91, lng: 139.76 }),
      mkPlanItem({ id: "lng_under_-180", kind: "fixed", lat: 35.68, lng: -181 }),
      mkPlanItem({ id: "ok", kind: "fixed", lat: 35.68, lng: 139.76 }),
    ];
    const pins = extractPinsFromPlanItems(items);
    expect(pins.map((p) => p.id)).toEqual(["ok"]);
  });

  it("§6.5 label fallback chain: resolvedName → label → null", () => {
    const items = [
      mkPlanItem({
        id: "with_resolved",
        kind: "fixed",
        lat: 35.68,
        lng: 139.76,
        resolvedName: "Resolved Name",
        label: "Generic Label",
      }),
      mkPlanItem({
        id: "label_only",
        kind: "fixed",
        lat: 35.69,
        lng: 139.77,
        label: "Only Label",
      }),
    ];
    const pins = extractPinsFromPlanItems(items);
    expect(pins[0]?.label).toBe("Resolved Name");
    expect(pins[1]?.label).toBe("Only Label");
  });

  it("§6.6 CEO 観測ケース再現: スタバ + マック の 2 件で 2 pin 返る", () => {
    // server response (M5 Stage 3 canary 観測時) の plan.items を再現
    const items = [
      mkPlanItem({
        id: "seg_1",
        kind: "fixed",
        lat: 35.6587191,
        lng: 139.6997413,
        resolvedName: "スターバックス コーヒー 渋谷マークシティ店",
      }),
      mkPlanItem({
        id: "gf_proposal_xxx",
        kind: "todo",
        // proposal なので除外される
      }),
      mkPlanItem({
        id: "seg_2",
        kind: "fixed",
        lat: 35.689315799999996,
        lng: 139.7025099,
        resolvedName: "マクドナルド ＪＲ新宿南口店",
      }),
    ];
    const pins = extractPinsFromPlanItems(items);
    expect(pins).toHaveLength(2);
    expect(pins.map((p) => p.id)).toEqual(["seg_1", "seg_2"]);
    // この pins で fitBounds が動くこと
    expect(isSamePointCluster(pins)).toBe(false);
    expect(computeBounds(pins)).not.toBeNull();
  });

  it("§6.7 空配列入力 → 空配列出力", () => {
    expect(extractPinsFromPlanItems([])).toEqual([]);
  });
});
