import { describe, it, expect } from "vitest";
import {
  buildPlaceAffinityReadiness,
  placeAffinityReasonLine,
  DEFAULT_PLACE_AFFINITY_CONFIG,
  type PlaceVisitProfile,
} from "@/lib/plan/compose/placeAffinityReadiness";
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";

function obs(destKey: string | null, redacted = false): MobilityObservation {
  return {
    mode: "walk",
    timeband: "morning",
    weekday: "weekday",
    originKey: redacted ? null : "home",
    destKey: redacted ? null : destKey,
    privacyClass: redacted ? "redacted" : "normal",
  };
}
function visits(destKey: string, n: number): MobilityObservation[] {
  return Array.from({ length: n }, () => obs(destKey));
}

describe("buildPlaceAffinityReadiness — readiness", () => {
  it("空 → not_enough", () => {
    expect(buildPlaceAffinityReadiness([]).status).toBe("not_enough");
  });
  it("★全体 < minTotal(8) → not_enough", () => {
    const r = buildPlaceAffinityReadiness([...visits("cafe", 3), ...visits("gym", 2)]);
    expect(r.status).toBe("not_enough");
    expect(r.totalVisits).toBe(5);
    expect(r.profiles).toHaveLength(0);
  });
  it("★redacted（sensitive）は除外（カウントしない）", () => {
    const r = buildPlaceAffinityReadiness([...visits("cafe", 8), obs(null, true), obs("clinic", true)]);
    expect(r.totalVisits).toBe(8); // redacted 2 件は除外
  });
  it("★destKey null は除外", () => {
    const r = buildPlaceAffinityReadiness([...visits("cafe", 8), obs(null)]);
    expect(r.totalVisits).toBe(8);
  });
});

describe("buildPlaceAffinityReadiness — profiles / strength", () => {
  it("★ready: visitCount 降順・minVisitsToList(2) 未満（単発）除外", () => {
    const r = buildPlaceAffinityReadiness([...visits("cafe", 5), ...visits("gym", 3), obs("oneoff")]);
    expect(r.status).toBe("ready");
    expect(r.totalVisits).toBe(9); // 単発も総数には入る
    expect(r.profiles.map((p) => p.placeKey)).toEqual(["cafe", "gym"]); // oneoff(1回) は profile から除外・降順
  });
  it("strength: habitual(≥10)/frequent(≥4)/occasional(2-3)", () => {
    const r = buildPlaceAffinityReadiness([...visits("home", 12), ...visits("cafe", 5), ...visits("park", 2)]);
    const by = (k: string) => r.profiles.find((p) => p.placeKey === k)!.strength;
    expect(by("home")).toBe("habitual");
    expect(by("cafe")).toBe("frequent");
    expect(by("park")).toBe("occasional");
  });
  it("config 既定（minTotal8/minVisits2/freq4/habitual10）", () => {
    expect(DEFAULT_PLACE_AFFINITY_CONFIG).toEqual({ minTotalForReady: 8, minVisitsToList: 2, frequentThreshold: 4, habitualThreshold: 10 });
  });
});

describe("placeAffinityReasonLine — 観測トーン・人格診断にしない", () => {
  const p = (strength: PlaceVisitProfile["strength"]): PlaceVisitProfile => ({ placeKey: "cafe", visitCount: 5, strength });
  it("habitual/frequent → 観測トーンの 1 行・occasional → null（沈黙）", () => {
    expect(placeAffinityReasonLine(p("habitual"))).toContain("よく行く");
    expect(placeAffinityReasonLine(p("frequent"))).toContain("ときどき");
    expect(placeAffinityReasonLine(p("occasional"))).toBeNull();
  });
  it("★人格語（好き/タイプ/性格）・数字・place 名を含まない", () => {
    const line = placeAffinityReasonLine(p("habitual"))!;
    expect(line).not.toMatch(/好き|タイプ|性格|[0-9]|cafe/);
  });
});
