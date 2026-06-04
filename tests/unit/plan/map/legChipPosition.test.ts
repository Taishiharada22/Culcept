import { describe, expect, it } from "vitest";

import { legChipPosition } from "@/lib/plan/map/routeStyle";

describe("legChipPosition (チップを実 path 中点へ・FH 忠実)", () => {
  it("2点=平均(直線中点)", () => {
    expect(legChipPosition([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 });
  });
  it("3点以上=中央 index(道路 path 視覚中点)", () => {
    expect(
      legChipPosition([{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }, { lat: 9, lng: 9 }]),
    ).toEqual({ lat: 5, lng: 5 });
  });
  it("1点=その点", () => {
    expect(legChipPosition([{ lat: 7, lng: 8 }])).toEqual({ lat: 7, lng: 8 });
  });
});
