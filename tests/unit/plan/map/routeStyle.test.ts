import { describe, expect, it } from "vitest";

import type { GmapsApi, GmapsMap } from "@/lib/shared/googleMapsLoader";
import { ROUTE_MODE_COLORS } from "@/lib/plan/map/routeMode";
import { buildGlassyLegLines, getRouteStyleForLeg } from "@/lib/plan/map/routeStyle";

describe("getRouteStyleForLeg (per-state ガラス style・FH 忠実)", () => {
  it("done = 灰点線(dashed)・glow なし・最下層 z=10", () => {
    const s = getRouteStyleForLeg("done", "car");
    expect(s.dashed).toBe(true);
    expect(s.animate).toBe(false);
    expect(s.color).toBe("#94a3b8");
    expect(s.zIndex).toBe(10);
  });
  it("current = mode 色・太(7)・animate=true・最前面 z=62", () => {
    const s = getRouteStyleForLeg("current", "car");
    expect(s.dashed).toBe(false);
    expect(s.animate).toBe(true);
    expect(s.weight).toBe(7);
    expect(s.color).toBe(ROUTE_MODE_COLORS.car);
    expect(s.zIndex).toBe(62);
  });
  it("previous/ahead = 静的(animate=false)・中間 z", () => {
    expect(getRouteStyleForLeg("previous", "train").animate).toBe(false);
    expect(getRouteStyleForLeg("previous", "train").zIndex).toBe(32);
    expect(getRouteStyleForLeg("ahead", "train").zIndex).toBe(22);
  });
});

describe("buildGlassyLegLines (3層ガラス / done=丸点線・fake maps)", () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }];
  const fakeMaps = {
    Polyline: class {
      constructor(_o: unknown) {}
      setMap() {}
    },
    SymbolPath: { CIRCLE: 0 },
  } as unknown as GmapsApi;
  const fakeMap = {} as GmapsMap;
  it("非 dashed(current) = glow+body+core の3本・glow 参照あり", () => {
    const r = buildGlassyLegLines(fakeMaps, fakeMap, path, getRouteStyleForLeg("current", "car"));
    expect(r.lines.length).toBe(3);
    expect(r.glow).not.toBeNull();
  });
  it("dashed(done) = 丸点線1本・glow=null", () => {
    const r = buildGlassyLegLines(fakeMaps, fakeMap, path, getRouteStyleForLeg("done", "car"));
    expect(r.lines.length).toBe(1);
    expect(r.glow).toBeNull();
  });
});
