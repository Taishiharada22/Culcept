import { describe, expect, it } from "vitest";

import {
  ROUTE_MODE_COLORS,
  mapChipStateForLeg,
  mobilityChipPx,
  mobilityLegIconDataUri,
} from "@/lib/plan/map/routeMode";

describe("mobilityChipPx (状態別サイズ・FH 忠実)", () => {
  it("current=40 / past=26 / selected=34 / future=30 / plain=30", () => {
    expect(mobilityChipPx("current")).toBe(40);
    expect(mobilityChipPx("past")).toBe(26);
    expect(mobilityChipPx("selected")).toBe(34);
    expect(mobilityChipPx("future")).toBe(30);
    expect(mobilityChipPx("plain")).toBe(30);
  });
});

describe("mapChipStateForLeg (leg state → chip state・FH 忠実)", () => {
  it("done→past / current→current / previous・ahead→future", () => {
    expect(mapChipStateForLeg("done")).toBe("past");
    expect(mapChipStateForLeg("current")).toBe("current");
    expect(mapChipStateForLeg("previous")).toBe("future");
    expect(mapChipStateForLeg("ahead")).toBe("future");
  });
});

describe("mobilityLegIconDataUri (= mode 色チップ data URI)", () => {
  it("data:image/svg+xml を返す", () => {
    expect(mobilityLegIconDataUri("train", "current")).toMatch(/^data:image\/svg\+xml/);
  });
  it("past は薄灰(#94a3b8)・mode 不問", () => {
    const uri = decodeURIComponent(mobilityLegIconDataUri("train", "past"));
    expect(uri).toContain("#94a3b8");
  });
  it("current は glow リング(r=13.4)を持つ", () => {
    expect(decodeURIComponent(mobilityLegIconDataUri("car", "current"))).toContain('r="13.4"');
  });
  it("非 past は mode 色で塗る", () => {
    const uri = decodeURIComponent(mobilityLegIconDataUri("car", "future"));
    expect(uri).toContain(ROUTE_MODE_COLORS.car);
  });
});
