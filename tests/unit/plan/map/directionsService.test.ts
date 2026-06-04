import { describe, expect, it } from "vitest";

import {
  flightArcPath,
  roadSegmentKey,
  toApiTravelMode,
} from "@/lib/plan/map/directionsService";

describe("toApiTravelMode (mode → Directions travelMode・FH 忠実)", () => {
  const maps = { TravelMode: { WALKING: "WALKING", DRIVING: "DRIVING", TRANSIT: "TRANSIT", BICYCLING: "BICYCLING" } };
  it("walk→WALKING / car・taxi→DRIVING / train・bus・shinkansen→TRANSIT / bicycle→BICYCLING", () => {
    expect(toApiTravelMode(maps, "walk")).toBe("WALKING");
    expect(toApiTravelMode(maps, "car")).toBe("DRIVING");
    expect(toApiTravelMode(maps, "taxi")).toBe("DRIVING");
    expect(toApiTravelMode(maps, "train")).toBe("TRANSIT");
    expect(toApiTravelMode(maps, "bus")).toBe("TRANSIT");
    expect(toApiTravelMode(maps, "shinkansen")).toBe("TRANSIT");
    expect(toApiTravelMode(maps, "bicycle")).toBe("BICYCLING");
  });
  it("flight→null(道路ルートにしない) / unknown→DRIVING", () => {
    expect(toApiTravelMode(maps, "flight")).toBeNull();
    expect(toApiTravelMode(maps, "unknown")).toBe("DRIVING");
  });
  it("TravelMode enum 無しでも文字列 fallback", () => {
    expect(toApiTravelMode({}, "walk")).toBe("WALKING");
  });
});

describe("flightArcPath (空路 bezier 弧)", () => {
  it("25点(steps=24+1)・端点は from/to・中央は垂直に膨らむ", () => {
    const from = { lat: 35, lng: 139 };
    const to = { lat: 43, lng: 141 };
    const arc = flightArcPath(from, to);
    expect(arc.length).toBe(25);
    expect(arc[0]).toEqual(from);
    expect(arc[24]).toEqual(to);
    expect(arc[12]!.lat).not.toBe((from.lat + to.lat) / 2);
  });
});

describe("roadSegmentKey (cache key・5桁量子化)", () => {
  it("from|to|mode を 5桁丸めで量子化", () => {
    expect(roadSegmentKey({ lat: 35.123456, lng: 139.7 }, { lat: 35.2, lng: 139.8 }, "DRIVING")).toBe(
      "35.12346,139.70000|35.20000,139.80000|DRIVING",
    );
  });
});
