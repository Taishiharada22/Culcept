/**
 * locationAnchorFactory (OP-3B) — pure factory test
 *
 * 検証観点:
 *   1. homeAnchor null → 空配列
 *   2. homeAnchor あり → 2 envelope (= origin + end round-trip default)
 *   3. origin envelope: source code_location / priority 100 / confidence low
 *   4. end envelope:    source code_location / priority 100 / confidence low / source = "default_round_trip"
 *   5. origin の payload は JourneyAnchorState (= toOriginState 通過後)
 *   6. end の payload は JourneyAnchorState で source = "default_round_trip"
 *   7. pure function (= input mutate なし、 deterministic)
 */

import { describe, it, expect } from "vitest";
import {
  locationAnchorFactory,
  type LocationAnchorInput,
} from "@/lib/alter-morning/comprehension/operationFactories/locationAnchorFactory";
import type { HomeAnchor } from "@/lib/alter-morning/planning/transportContext";

const HOME_REGISTERED: HomeAnchor = {
  lat: 35.6812,
  lng: 139.7671,
  label: "自宅",
  source: "registered_home",
};

const HOME_CURRENT: HomeAnchor = {
  lat: 35.6595,
  lng: 139.7005,
  label: "現在地",
  source: "current",
};

describe("locationAnchorFactory (OP-3B)", () => {
  it("homeAnchor が null → 空配列", () => {
    const result = locationAnchorFactory({ homeAnchor: null });
    expect(result).toEqual([]);
  });

  it("homeAnchor (registered_home) → 2 envelope (origin + end)", () => {
    const result = locationAnchorFactory({ homeAnchor: HOME_REGISTERED });
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("set_journey_origin");
    expect(result[1].type).toBe("set_journey_end");
  });

  it("origin envelope: source / priority / confidence", () => {
    const result = locationAnchorFactory({ homeAnchor: HOME_REGISTERED });
    const originEnv = result[0];
    expect(originEnv.source).toBe("code_location");
    expect(originEnv.priority).toBe(100);
    expect(originEnv.confidence).toBe("low");
    expect(originEnv.provenance.source_type).toBe("inferred");
  });

  it("origin envelope payload: known_exact + label / lat / lng 反映", () => {
    const result = locationAnchorFactory({ homeAnchor: HOME_REGISTERED });
    const payload = result[0].payload;
    expect(payload.kind).toBe("known_exact");
    if (payload.kind === "known_exact") {
      expect(payload.label).toBe("自宅");
      expect(payload.lat).toBe(35.6812);
      expect(payload.lng).toBe(139.7671);
      expect(payload.source).toBe("registered_home");
    }
  });

  it("end envelope: source / priority / confidence / payload.source = default_round_trip", () => {
    const result = locationAnchorFactory({ homeAnchor: HOME_REGISTERED });
    const endEnv = result[1];
    expect(endEnv.source).toBe("code_location");
    expect(endEnv.priority).toBe(100);
    expect(endEnv.confidence).toBe("low");
    expect(endEnv.payload.kind).toBe("known_exact");
    if (endEnv.payload.kind === "known_exact") {
      expect(endEnv.payload.label).toBe("自宅");
      expect(endEnv.payload.source).toBe("default_round_trip");
    }
  });

  it("homeAnchor (current 由来) → origin payload.source = current", () => {
    const result = locationAnchorFactory({ homeAnchor: HOME_CURRENT });
    expect(result).toHaveLength(2);
    const origin = result[0];
    if (origin.payload.kind === "known_exact") {
      expect(origin.payload.source).toBe("current");
      expect(origin.payload.label).toBe("現在地");
    }
  });

  it("trace.ruleId = 'locationAnchor'", () => {
    const result = locationAnchorFactory({ homeAnchor: HOME_REGISTERED });
    expect(result[0].trace?.ruleId).toBe("locationAnchor");
    expect(result[1].trace?.ruleId).toBe("locationAnchor");
  });

  it("sourceTurnIndex 反映", () => {
    const result = locationAnchorFactory({
      homeAnchor: HOME_REGISTERED,
      sourceTurnIndex: 5,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(5);
    expect(result[1].trace?.sourceTurnIndex).toBe(5);
  });

  it("input mutate しない (= pure)", () => {
    const input: LocationAnchorInput = { homeAnchor: { ...HOME_REGISTERED } };
    const snapshot = JSON.stringify(input);
    locationAnchorFactory(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const input: LocationAnchorInput = { homeAnchor: HOME_REGISTERED };
    const r1 = locationAnchorFactory(input);
    const r2 = locationAnchorFactory(input);
    expect(r1).toEqual(r2);
  });
});
