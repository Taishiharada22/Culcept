/**
 * durationHeuristic — W3-PR-10 Scope A C2 境界テスト
 *
 * CEO 確定 (2026-04-24) テーブル:
 *   ≤ 0.2km: null
 *   ≤ 1km:   10分
 *   ≤ 3km:   15分
 *   ≤ 7km:   25分
 *   ≤ 15km:  40分
 *   ≤ 30km:  60分
 *   > 30km:  90分
 *
 * 非機能契約:
 *   - mode-free: signature に mode 引数がない
 *   - NaN / invalid coords は null
 *   - ≤ 0.2km でも number を返さない（fake duration 禁止）
 */

import { describe, test, expect } from "vitest";
import {
  estimateNeutralDurationMin,
  type Coords,
} from "@/lib/alter-morning/transport/durationHeuristic";

/**
 * 東京近辺から指定距離 km 東に離れた座標を作る。
 *
 * haversine と同じ Earth radius (6371km) を使って kmPerDegLng を導く。
 * 境界値（0.2km ちょうどなど）で haversine 計算と誤差が出ないよう、
 * ヒューリスティック実装と同じ定数系を使う必要がある。
 *   kmPerDegLng = (2π * R / 360) * cos(lat) ≒ 90.32 km at lat=35.6895°
 */
const EARTH_RADIUS_KM = 6371;
const BASE: Coords = { lat: 35.6895, lng: 139.6917 }; // 東京駅周辺

function coordsAtKmEast(km: number): Coords {
  const kmPerDegLng =
    ((2 * Math.PI * EARTH_RADIUS_KM) / 360) * Math.cos((BASE.lat * Math.PI) / 180);
  return { lat: BASE.lat, lng: BASE.lng + km / kmPerDegLng };
}

describe("estimateNeutralDurationMin — 境界ケース", () => {
  test("同一地点 (0km) → null（fake duration 禁止）", () => {
    const result = estimateNeutralDurationMin(BASE, BASE);
    expect(result).toBeNull();
  });

  test("≤ 0.2km 境界内 (0.15km) → null", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(0.15));
    expect(result).toBeNull();
  });

  test("≤ 0.2km 境界ちょうど (0.2km) → null", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(0.2));
    expect(result).toBeNull();
  });

  test("0.2km 直上 (0.25km) → 10分 (近距離 bin)", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(0.25));
    expect(result).toBe(10);
  });

  test("1km 境界 → 10分", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(0.95));
    expect(result).toBe(10);
  });

  test("3km 圏 → 15分", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(2.5));
    expect(result).toBe(15);
  });

  test("7km 圏 → 25分", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(5));
    expect(result).toBe(25);
  });

  test("15km 圏 → 40分", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(12));
    expect(result).toBe(40);
  });

  test("30km 圏 → 60分", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(25));
    expect(result).toBe(60);
  });

  test("30km 超 → 90分（上限固定）", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(50));
    expect(result).toBe(90);
  });

  test("100km 超でも 90分で clamp される", () => {
    const result = estimateNeutralDurationMin(BASE, coordsAtKmEast(150));
    expect(result).toBe(90);
  });
});

describe("estimateNeutralDurationMin — NaN / invalid 入力", () => {
  test("NaN lat → null", () => {
    const result = estimateNeutralDurationMin({ lat: NaN, lng: 139.7 }, BASE);
    expect(result).toBeNull();
  });

  test("NaN lng → null", () => {
    const result = estimateNeutralDurationMin(BASE, { lat: 35.7, lng: NaN });
    expect(result).toBeNull();
  });

  test("Infinity lat → null", () => {
    const result = estimateNeutralDurationMin(BASE, { lat: Infinity, lng: 139.7 });
    expect(result).toBeNull();
  });

  test("両端 NaN → null", () => {
    const result = estimateNeutralDurationMin(
      { lat: NaN, lng: NaN },
      { lat: NaN, lng: NaN },
    );
    expect(result).toBeNull();
  });
});

describe("estimateNeutralDurationMin — 境界値の step 単調性", () => {
  test("距離が段階をまたぐと duration が単調非減少", () => {
    const distances = [0.3, 0.9, 2, 5, 10, 20, 50];
    const results = distances.map((d) =>
      estimateNeutralDurationMin(BASE, coordsAtKmEast(d)),
    );
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1] ?? 0;
      const cur = results[i] ?? 0;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });
});
