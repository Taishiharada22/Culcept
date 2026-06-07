import { describe, it, expect } from "vitest";
import {
  detectMovement,
  haversineMeters,
  DEFAULT_MOVEMENT_DETECTOR_CONFIG,
  type PositionSample,
} from "@/lib/plan/mobility/movementEventDetector";

// 東京駅(FROM) / 東京タワー(TO)〜3.2km 離れた 2 anchor
const FROM = { lat: 35.6812, lng: 139.7671 };
const TO = { lat: 35.6586, lng: 139.7454 };
const ENROUTE = { lat: 35.67, lng: 139.756 }; // 両 geofence の外
const MIN = 60_000;

function s(atMin: number, p: { lat: number; lng: number }, accuracyM?: number): PositionSample {
  return { at: atMin * MIN, lat: p.lat, lng: p.lng, accuracyM };
}

describe("haversineMeters", () => {
  it("同点は 0m", () => {
    expect(haversineMeters(FROM, FROM)).toBeCloseTo(0, 5);
  });
  it("東京駅↔東京タワーは概ね 3km 台", () => {
    const d = haversineMeters(FROM, TO);
    expect(d).toBeGreaterThan(2500);
    expect(d).toBeLessThan(4000);
  });
});

describe("detectMovement — 検出不能ケース（捏造しない）", () => {
  it("minSamples 未満 → null", () => {
    expect(detectMovement([s(0, FROM)], { from: FROM, to: TO })).toBeNull();
  });
  it("両端とも geofence 観測なし → null", () => {
    // 道中だけ(両 geofence の外)の sample → 出発も到着も検出できない
    expect(detectMovement([s(0, ENROUTE), s(5, ENROUTE)], { from: FROM, to: TO })).toBeNull();
  });
  it("anchor 不在 → null（from/to 無し）", () => {
    expect(detectMovement([s(0, FROM), s(5, TO)], { from: null, to: null })).toBeNull();
  });
});

describe("detectMovement — high confidence（両端 + dwell + 密 + gap 健全）", () => {
  const samples = [s(0, FROM), s(5, ENROUTE), s(20, TO), s(24, { lat: TO.lat + 0.0003, lng: TO.lng })];
  const r = detectMovement(samples, { from: FROM, to: TO })!;

  it("出発 = from を出た時刻(5分)、到着 = to に入った時刻(20分)", () => {
    expect(r.actualDepartureAtMs).toBe(5 * MIN);
    expect(r.actualArrivalAtMs).toBe(20 * MIN);
  });
  it("所要 = 到着−出発 = 15分（derived）", () => {
    expect(r.actualDurationMin).toBe(15);
  });
  it("confidence = high / source = gps", () => {
    expect(r.confidence).toBe("high");
    expect(r.source).toBe("gps");
  });
  it("★出力に raw 座標(lat/lng)を含まない（derived only）", () => {
    expect(Object.keys(r).sort()).toEqual(
      ["actualArrivalAtMs", "actualDepartureAtMs", "actualDurationMin", "confidence", "source"].sort(),
    );
  });
});

describe("detectMovement — medium / low（疎・dwell 未確認）", () => {
  it("medium: 両端 + 正の所要だが dwell 未確認 & 非密(3点)", () => {
    const r = detectMovement([s(0, FROM), s(10, ENROUTE), s(20, TO)], { from: FROM, to: TO })!;
    expect(r.actualDurationMin).toBe(10);
    expect(r.confidence).toBe("medium");
  });
  it("low: 疎すぎて出発と到着が分離できない → 所要 null・low", () => {
    // FROM と TO の 2 点だけ: 最初の outside-from が TO 自身 → 出発≒到着 → 所要 null
    const r = detectMovement([s(0, FROM), s(40, TO)], { from: FROM, to: TO })!;
    expect(r.actualDurationMin).toBeNull();
    expect(r.confidence).toBe("low");
  });
});

describe("detectMovement — 安全フィルタ", () => {
  it("精度の悪い sample(accuracyM > maxAccuracyM)は除外される", () => {
    // 道中(ENROUTE)を accuracy 2000 で混ぜる → 除外され FROM/TO の 2 点扱い → 所要 null
    const r = detectMovement(
      [s(0, FROM, 50), s(5, ENROUTE, 2000), s(20, TO, 30)],
      { from: FROM, to: TO },
    )!;
    expect(r.actualDurationMin).toBeNull(); // ENROUTE が残っていれば 15 になるはず → null は除外の証拠
  });
  it("入力順が時刻逆でも内部で昇順整列して検出", () => {
    const r = detectMovement([s(24, { lat: TO.lat + 0.0003, lng: TO.lng }), s(20, TO), s(5, ENROUTE), s(0, FROM)], {
      from: FROM,
      to: TO,
    })!;
    expect(r.actualDepartureAtMs).toBe(5 * MIN);
    expect(r.actualArrivalAtMs).toBe(20 * MIN);
  });
  it("from 不在なら出発 null・到着のみ", () => {
    const r = detectMovement([s(0, ENROUTE), s(20, TO), s(24, TO)], { to: TO })!;
    expect(r.actualDepartureAtMs).toBeNull();
    expect(r.actualArrivalAtMs).toBe(20 * MIN);
    expect(r.actualDurationMin).toBeNull();
  });
});

describe("DEFAULT_MOVEMENT_DETECTOR_CONFIG", () => {
  it("maxAccuracyM は currentLocationGating と同じ 1000m", () => {
    expect(DEFAULT_MOVEMENT_DETECTOR_CONFIG.maxAccuracyM).toBe(1000);
  });
});
