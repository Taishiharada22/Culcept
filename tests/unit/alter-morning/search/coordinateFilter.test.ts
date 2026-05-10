/**
 * coordinateFilter unit tests (B-3c-2 Commit 1, Layer A)
 */

import { describe, it, expect } from "vitest";
import { filterCandidatesByValidCoordinates } from "@/lib/alter-morning/search/coordinateFilter";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

function mk(
  placeId: string,
  lat: number,
  lng: number,
): NormalizedPlaceCandidate {
  return {
    placeId,
    displayName: `test ${placeId}`,
    address: "addr",
    coordinates: { lat, lng },
    distanceFromAnchor: null,
    category: null,
    chainToken: null,
    rawRef: { provider: "google_places", placeId },
  };
}

describe("filterCandidatesByValidCoordinates", () => {
  it("全 valid → 全通過、validCoordinates: true で mark", () => {
    const input = [mk("a", 35, 139), mk("b", 36, 140)];
    const result = filterCandidatesByValidCoordinates(input);
    expect(result.originalCount).toBe(2);
    expect(result.invalidCount).toBe(0);
    expect(result.filtered).toHaveLength(2);
    expect(result.filtered[0].validCoordinates).toBe(true);
    expect(result.filtered[1].validCoordinates).toBe(true);
  });

  it("一部 invalid → 一部除外、残りに validCoordinates: true mark", () => {
    const input = [
      mk("a", 35, 139),
      mk("b", NaN, 140), // invalid
      mk("c", 36, 140),
      mk("d", 0, 200), // invalid (lng 範囲外)
    ];
    const result = filterCandidatesByValidCoordinates(input);
    expect(result.originalCount).toBe(4);
    expect(result.invalidCount).toBe(2);
    expect(result.filtered).toHaveLength(2);
    expect(result.filtered.map((c) => c.placeId)).toEqual(["a", "c"]);
    expect(result.filtered.every((c) => c.validCoordinates === true)).toBe(true);
  });

  it("全 invalid → 空配列、invalidCount = originalCount", () => {
    const input = [mk("a", NaN, 139), mk("b", 36, Infinity)];
    const result = filterCandidatesByValidCoordinates(input);
    expect(result.originalCount).toBe(2);
    expect(result.invalidCount).toBe(2);
    expect(result.filtered).toHaveLength(0);
  });

  it("空入力 → 空出力", () => {
    const result = filterCandidatesByValidCoordinates([]);
    expect(result.originalCount).toBe(0);
    expect(result.invalidCount).toBe(0);
    expect(result.filtered).toHaveLength(0);
  });

  it("0,0 (赤道沖) は valid (= 既存 promote と対称)", () => {
    const result = filterCandidatesByValidCoordinates([mk("a", 0, 0)]);
    expect(result.invalidCount).toBe(0);
    expect(result.filtered).toHaveLength(1);
  });

  it("入力 array を mutate しない", () => {
    const input = [mk("a", 35, 139), mk("b", NaN, 140)];
    const before = JSON.stringify(input);
    filterCandidatesByValidCoordinates(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("通過 candidate は新 object (= 入力 ref と異なる、validCoordinates 注入のため)", () => {
    const input = [mk("a", 35, 139)];
    const result = filterCandidatesByValidCoordinates(input);
    expect(result.filtered[0]).not.toBe(input[0]);
    // ただし他 field は等価
    expect(result.filtered[0].placeId).toBe(input[0].placeId);
    expect(result.filtered[0].coordinates).toEqual(input[0].coordinates);
  });

  it("coordinates null (型強制を runtime で破った想定) → invalid", () => {
    const cand = mk("a", 35, 139);
    (cand as unknown as { coordinates: null }).coordinates = null;
    const result = filterCandidatesByValidCoordinates([cand]);
    expect(result.invalidCount).toBe(1);
    expect(result.filtered).toHaveLength(0);
  });
});
