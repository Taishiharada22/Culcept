/**
 * objectiveFunction — unit tests
 *
 * CEO方針 2026-04-17: hard anchor 絶対優先 / 距離ペナルティ /
 * 順序保持 / 往復ペナルティ / 近傍優先
 *
 * テストは以下を固定化する:
 *   1. haversineKm: 既知距離との一致
 *   2. computeDistancePenalty: 段階的な増加 (0 → 0.9)
 *   3. computeProximityBonus: 近距離ボーナス (0-0.2)
 *   4. computeDistanceImpact: 最近 anchor を選ぶ
 *   5. computeRoundTripPenalty: prev≈next で candidate 遠い → 減点
 *   6. detectOrderViolations: order順と startTime 順の不一致検出
 *   7. extractHardAnchors: anchorScore 閾値 + lat/lng 必須
 *   8. adjustCandidateScore: 総合補正
 */

import { describe, test, expect } from "vitest";
import {
  haversineKm,
  computeDistancePenalty,
  computeProximityBonus,
  computeDistanceImpact,
  computeRoundTripPenalty,
  detectOrderViolations,
  extractHardAnchors,
  adjustCandidateScore,
  HARD_ANCHOR_THRESHOLD,
  type HardAnchor,
  type LatLng,
} from "@/lib/alter-morning/objectiveFunction";

// ----------------------------------------------------------------
// 既知の座標 (日本国内)
// ----------------------------------------------------------------
// 甲府駅
const KOFU: LatLng = { lat: 35.6640, lng: 138.5685 };
// サドヤワイナリー (甲府市丸の内) — 甲府駅から ~0.3km
const SADOYA: LatLng = { lat: 35.6660, lng: 138.5663 };
// 増穂 (南巨摩郡富士川町) — 甲府から ~15km 南西
const MASUHO: LatLng = { lat: 35.5675, lng: 138.4795 };
// 新宿 — 甲府から ~110km 東
const SHINJUKU: LatLng = { lat: 35.6896, lng: 139.6917 };

// ----------------------------------------------------------------
// 1. Haversine
// ----------------------------------------------------------------

describe("haversineKm", () => {
  test("same point -> 0", () => {
    expect(haversineKm(KOFU, KOFU)).toBe(0);
  });

  test("甲府↔サドヤ is ~0.3km", () => {
    const km = haversineKm(KOFU, SADOYA);
    expect(km).toBeGreaterThan(0.1);
    expect(km).toBeLessThan(1);
  });

  test("甲府↔増穂 is ~15km (CEO example)", () => {
    const km = haversineKm(KOFU, MASUHO);
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(18);
  });

  test("甲府↔新宿 is ~100km", () => {
    const km = haversineKm(KOFU, SHINJUKU);
    expect(km).toBeGreaterThan(95);
    expect(km).toBeLessThan(115);
  });

  test("symmetric", () => {
    const ab = haversineKm(KOFU, MASUHO);
    const ba = haversineKm(MASUHO, KOFU);
    expect(Math.abs(ab - ba)).toBeLessThan(1e-6);
  });
});

// ----------------------------------------------------------------
// 2. computeDistancePenalty
// ----------------------------------------------------------------

describe("computeDistancePenalty", () => {
  test("<= 2km -> 0 (許容範囲)", () => {
    expect(computeDistancePenalty(0)).toBe(0);
    expect(computeDistancePenalty(1)).toBe(0);
    expect(computeDistancePenalty(2)).toBe(0);
  });

  test("2-10km -> 0 to 0.3 (線形)", () => {
    expect(computeDistancePenalty(6)).toBeCloseTo(0.15, 2);
    expect(computeDistancePenalty(10)).toBeCloseTo(0.3, 2);
  });

  test("10-30km -> 0.3 to 0.7 (不自然帯)", () => {
    expect(computeDistancePenalty(15)).toBeCloseTo(0.4, 1);
    expect(computeDistancePenalty(30)).toBeCloseTo(0.7, 2);
  });

  test(">30km -> 0.7 to 0.9 頭打ち", () => {
    expect(computeDistancePenalty(60)).toBeCloseTo(0.9, 2);
    expect(computeDistancePenalty(200)).toBeCloseTo(0.9, 2);
  });

  test("単調増加", () => {
    const ds = [0, 1, 5, 10, 15, 30, 60, 120];
    for (let i = 1; i < ds.length; i++) {
      expect(computeDistancePenalty(ds[i])).toBeGreaterThanOrEqual(
        computeDistancePenalty(ds[i - 1]),
      );
    }
  });
});

// ----------------------------------------------------------------
// 3. computeProximityBonus
// ----------------------------------------------------------------

describe("computeProximityBonus", () => {
  test("<= 0.5km -> 0.2 (強い優遇)", () => {
    expect(computeProximityBonus(0)).toBe(0.2);
    expect(computeProximityBonus(0.3)).toBe(0.2);
    expect(computeProximityBonus(0.5)).toBe(0.2);
  });

  test("0.5-2km -> 0.2 to 0 (弱まる)", () => {
    expect(computeProximityBonus(1.25)).toBeCloseTo(0.1, 2);
    expect(computeProximityBonus(2)).toBe(0);
  });

  test("> 2km -> 0", () => {
    expect(computeProximityBonus(5)).toBe(0);
    expect(computeProximityBonus(50)).toBe(0);
  });
});

// ----------------------------------------------------------------
// 4. computeDistanceImpact
// ----------------------------------------------------------------

describe("computeDistanceImpact", () => {
  const anchor1: HardAnchor = {
    segmentId: "a1",
    order: 0,
    anchorScore: 5,
    coords: SADOYA,
  };
  const anchor2: HardAnchor = {
    segmentId: "a2",
    order: 1,
    anchorScore: 5,
    coords: SHINJUKU,
  };

  test("最も近い anchor を選ぶ", () => {
    const impact = computeDistanceImpact(
      { coords: KOFU, baseScore: 0.8 },
      [anchor1, anchor2],
    );
    expect(impact.nearestAnchorId).toBe("a1");
    expect(impact.nearestKm).toBeLessThan(1);
  });

  test("no anchors -> no-op", () => {
    const impact = computeDistanceImpact(
      { coords: KOFU, baseScore: 0.8 },
      [],
    );
    expect(impact.penalty).toBe(0);
    expect(impact.proximityBonus).toBe(0);
  });

  test("candidate coords 欠落 -> no-op", () => {
    const impact = computeDistanceImpact(
      { baseScore: 0.8 },
      [anchor1],
    );
    expect(impact.penalty).toBe(0);
  });

  test("甲府 anchor + 増穂 candidate -> 不自然帯ペナルティ", () => {
    const impact = computeDistanceImpact(
      { coords: MASUHO, baseScore: 0.8 },
      [{ ...anchor1, coords: KOFU }],
    );
    expect(impact.nearestKm).toBeGreaterThan(12);
    expect(impact.penalty).toBeGreaterThan(0.3);
    expect(impact.proximityBonus).toBe(0);
  });

  test("甲府 anchor + サドヤ candidate -> 近傍ボーナス", () => {
    const impact = computeDistanceImpact(
      { coords: SADOYA, baseScore: 0.8 },
      [{ ...anchor1, coords: KOFU }],
    );
    expect(impact.penalty).toBe(0);
    expect(impact.proximityBonus).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------
// 5. computeRoundTripPenalty
// ----------------------------------------------------------------

describe("computeRoundTripPenalty", () => {
  test("nulls -> 0", () => {
    expect(computeRoundTripPenalty(null, null, null)).toBe(0);
    expect(computeRoundTripPenalty(KOFU, null, KOFU)).toBe(0);
  });

  test("prev/next 離れている -> 往復ではない", () => {
    // 甲府→新宿 のような長距離移動の中間は許容
    expect(computeRoundTripPenalty(KOFU, MASUHO, SHINJUKU)).toBe(0);
  });

  test("prev/next 近接 + candidate 遠い -> 減点", () => {
    // 甲府→増穂→甲府 (不自然な逆走)
    const pen = computeRoundTripPenalty(KOFU, MASUHO, SADOYA);
    expect(pen).toBeGreaterThan(0);
    expect(pen).toBeLessThanOrEqual(0.5);
  });

  test("prev/next 近接 + candidate 近傍 -> 減点なし", () => {
    // 甲府→サドヤ→甲府 (サドヤは甲府の近傍 < 1km) なら OK
    const pen = computeRoundTripPenalty(KOFU, SADOYA, KOFU);
    expect(pen).toBe(0);
  });
});

// ----------------------------------------------------------------
// 6. detectOrderViolations
// ----------------------------------------------------------------

describe("detectOrderViolations", () => {
  test("順序と時刻が一致 -> violations なし", () => {
    const anchors: HardAnchor[] = [
      { segmentId: "s1", order: 0, anchorScore: 5, startTime: "08:00" },
      { segmentId: "s2", order: 1, anchorScore: 5, startTime: "12:00" },
      { segmentId: "s3", order: 2, anchorScore: 5, startTime: "18:00" },
    ];
    expect(detectOrderViolations(anchors)).toEqual([]);
  });

  test("順序違反を検出 (朝マック→昼サドヤ ですが時刻が逆)", () => {
    const anchors: HardAnchor[] = [
      { segmentId: "s1", order: 0, anchorScore: 5, startTime: "12:00" }, // 「朝マック」なのに昼
      { segmentId: "s2", order: 1, anchorScore: 5, startTime: "08:00" }, // 「昼サドヤ」なのに朝
    ];
    const v = detectOrderViolations(anchors);
    expect(v).toHaveLength(1);
    expect(v[0].earlierSegmentId).toBe("s1");
    expect(v[0].laterSegmentId).toBe("s2");
  });

  test("startTime 欠落 anchor は無視", () => {
    const anchors: HardAnchor[] = [
      { segmentId: "s1", order: 0, anchorScore: 5 },
      { segmentId: "s2", order: 1, anchorScore: 5, startTime: "12:00" },
    ];
    expect(detectOrderViolations(anchors)).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 7. extractHardAnchors
// ----------------------------------------------------------------

describe("extractHardAnchors", () => {
  test("anchorScore 閾値未満を除外", () => {
    const anchors = extractHardAnchors([
      { id: "s1", order: 0, anchorScore: 2, resolvedLat: 35, resolvedLng: 138 },
      { id: "s2", order: 1, anchorScore: HARD_ANCHOR_THRESHOLD, resolvedLat: 35, resolvedLng: 138 },
    ]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].segmentId).toBe("s2");
  });

  test("lat/lng 未解決は除外", () => {
    const anchors = extractHardAnchors([
      { id: "s1", order: 0, anchorScore: 5 }, // lat/lng 未解決
      { id: "s2", order: 1, anchorScore: 5, resolvedLat: 35, resolvedLng: 138 },
    ]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].segmentId).toBe("s2");
  });

  test("order 昇順でソート", () => {
    const anchors = extractHardAnchors([
      { id: "s2", order: 1, anchorScore: 5, resolvedLat: 35, resolvedLng: 138 },
      { id: "s1", order: 0, anchorScore: 5, resolvedLat: 35, resolvedLng: 138 },
    ]);
    expect(anchors.map(a => a.segmentId)).toEqual(["s1", "s2"]);
  });

  // ━━ CEO方針 2026-04-17 P0: resolutionConfidence ゲート ━━
  //   high / undefined(legacy) のみ hard anchor 昇格。medium/low/unresolved は除外。
  //   根拠: medium を anchor にすると距離ペナルティの基点が不確かになり、
  //         「甲府ランチ→杉並カフェ」のような事故を誘発する。

  test("resolutionConfidence=high は anchor 化される", () => {
    const anchors = extractHardAnchors([
      {
        id: "s1", order: 0, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "high",
      },
    ]);
    expect(anchors).toHaveLength(1);
  });

  test("resolutionConfidence=medium は anchor 化されない（P0 ゲート）", () => {
    const anchors = extractHardAnchors([
      {
        id: "s1", order: 0, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "medium",
      },
    ]);
    expect(anchors).toHaveLength(0);
  });

  test("resolutionConfidence=low / unresolved は anchor 化されない", () => {
    const anchors = extractHardAnchors([
      {
        id: "s1", order: 0, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "low",
      },
      {
        id: "s2", order: 1, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "unresolved",
      },
    ]);
    expect(anchors).toHaveLength(0);
  });

  test("resolutionConfidence 未指定（legacy）は従来通り anchor 化される", () => {
    const anchors = extractHardAnchors([
      {
        id: "s1", order: 0, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        // resolutionConfidence を指定しない
      },
    ]);
    expect(anchors).toHaveLength(1);
  });

  test("複数混在: high のみ通る", () => {
    const anchors = extractHardAnchors([
      {
        id: "s_high", order: 0, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "high",
      },
      {
        id: "s_med", order: 1, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "medium",
      },
      {
        id: "s_low", order: 2, anchorScore: 5,
        resolvedLat: 35, resolvedLng: 138,
        resolutionConfidence: "low",
      },
    ]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].segmentId).toBe("s_high");
  });
});

// ----------------------------------------------------------------
// 8. adjustCandidateScore (統合)
// ----------------------------------------------------------------

describe("adjustCandidateScore", () => {
  test("CEO シナリオ: 甲府サドヤ anchor + マック候補(甲府) vs マック候補(増穂)", () => {
    const anchor: HardAnchor = {
      segmentId: "sadoya",
      order: 1,
      anchorScore: 5,
      coords: SADOYA,
      label: "サドヤ",
    };

    // 甲府駅前マック
    const kofuMac = adjustCandidateScore(
      { coords: KOFU, baseScore: 0.7, label: "マクドナルド甲府駅前" },
      { anchors: [anchor] },
    );
    // 増穂マック
    const masuhoMac = adjustCandidateScore(
      { coords: MASUHO, baseScore: 0.7, label: "マクドナルド増穂" },
      { anchors: [anchor] },
    );

    // 甲府マックの方が好まれる
    expect(kofuMac.adjustment).toBeGreaterThan(masuhoMac.adjustment);
    // 増穂マックは減点 (10km 超)
    expect(masuhoMac.adjustment).toBeLessThan(-0.3);
    // 甲府マックは近傍ボーナス
    expect(kofuMac.adjustment).toBeGreaterThan(0);
  });

  test("anchors 無し -> 補正なし", () => {
    const result = adjustCandidateScore(
      { coords: KOFU, baseScore: 0.7 },
      { anchors: [] },
    );
    expect(result.adjustment).toBe(0);
  });

  test("往復パターン -> 減点", () => {
    const prev: HardAnchor = {
      segmentId: "prev",
      order: 0,
      anchorScore: 5,
      coords: KOFU,
    };
    const next: HardAnchor = {
      segmentId: "next",
      order: 2,
      anchorScore: 5,
      coords: SADOYA, // 甲府近辺
    };
    const result = adjustCandidateScore(
      { coords: MASUHO, baseScore: 0.7 },
      { anchors: [prev, next], prevAnchor: prev, nextAnchor: next },
    );
    // 距離ペナルティ + 往復ペナルティ
    expect(result.breakdown.distancePenalty).toBeGreaterThan(0);
    expect(result.breakdown.roundTripPenalty).toBeGreaterThan(0);
    expect(result.adjustment).toBeLessThan(-0.4);
  });
});
