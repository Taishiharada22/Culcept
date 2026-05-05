/**
 * PlanOperationCandidate (OP-2) — type-level + structural test
 *
 * 検証観点:
 *   1. 5 種 candidate type が定義されている (= union)
 *   2. 各 candidate type が想定の payload shape を持つ
 *   3. 既存 `PlanOperation` (= 4 種) とは別 union (= isolation)
 *   4. exhaustive switch で 5 種を網羅できる (= TypeScript compiler check)
 *
 * OP-2 規律:
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - active runtime 影響ゼロ
 */

import { describe, it, expect } from "vitest";
import type {
  PlanOperationCandidate,
  PlanOperationCandidateType,
  SetTargetDateOperationCandidate,
  AddTravelEdgeOperationCandidate,
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
  ResolvePlaceCandidateOperationCandidate,
} from "@/lib/alter-morning/comprehension/planOperationCandidate";

describe("PlanOperationCandidate (OP-2)", () => {
  it("5 種 candidate type が PlanOperationCandidateType に列挙される", () => {
    const types: PlanOperationCandidateType[] = [
      "set_target_date",
      "add_travel_edge",
      "set_journey_origin",
      "set_journey_end",
      "resolve_place_candidate",
    ];
    expect(types).toHaveLength(5);
    expect(new Set(types).size).toBe(5); // 重複なし
  });

  it("set_target_date candidate を作成できる (= payload.date は relative or absolute)", () => {
    const op: SetTargetDateOperationCandidate = {
      type: "set_target_date",
      payload: { date: "tomorrow" },
    };
    expect(op.type).toBe("set_target_date");
    expect(op.payload.date).toBe("tomorrow");

    const opAbsolute: SetTargetDateOperationCandidate = {
      type: "set_target_date",
      payload: { date: "2026-05-06" },
    };
    expect(opAbsolute.payload.date).toBe("2026-05-06");
  });

  it("add_travel_edge candidate を作成できる (= segmentOrigin / Destination + departureTime)", () => {
    const op: AddTravelEdgeOperationCandidate = {
      type: "add_travel_edge",
      payload: {
        segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "08:00",
        matchedSpan: "東京駅から渋谷へ",
      },
    };
    expect(op.payload.segmentOrigin.label).toBe("東京駅");
    expect(op.payload.segmentDestination.label).toBe("渋谷");
    expect(op.payload.segmentDepartureTime).toBe("08:00");
  });

  it("set_journey_origin candidate (= JourneyAnchorState payload) を作成できる", () => {
    // unknown variant
    const opUnknown: SetJourneyOriginOperationCandidate = {
      type: "set_journey_origin",
      payload: { kind: "unknown", reason: "no_baseline" },
    };
    expect(opUnknown.payload.kind).toBe("unknown");

    // known_label_only variant
    const opLabelOnly: SetJourneyOriginOperationCandidate = {
      type: "set_journey_origin",
      payload: {
        kind: "known_label_only",
        label: "自宅",
        source: "user_override",
      },
    };
    expect(opLabelOnly.payload.kind).toBe("known_label_only");
    if (opLabelOnly.payload.kind === "known_label_only") {
      expect(opLabelOnly.payload.label).toBe("自宅");
    }

    // known_exact variant
    const opExact: SetJourneyOriginOperationCandidate = {
      type: "set_journey_origin",
      payload: {
        kind: "known_exact",
        label: "自宅",
        lat: 35.6812,
        lng: 139.7671,
        source: "registered_home",
      },
    };
    expect(opExact.payload.kind).toBe("known_exact");
  });

  it("set_journey_end candidate を作成できる", () => {
    const op: SetJourneyEndOperationCandidate = {
      type: "set_journey_end",
      payload: { kind: "unknown", reason: "no_endpoint_signal" },
    };
    expect(op.type).toBe("set_journey_end");
    expect(op.payload.kind).toBe("unknown");
  });

  it("resolve_place_candidate candidate を作成できる (= slot は origin/end/where)", () => {
    const opOrigin: ResolvePlaceCandidateOperationCandidate = {
      type: "resolve_place_candidate",
      payload: { slot: "origin", label: "東京駅丸の内口" },
    };
    expect(opOrigin.payload.slot).toBe("origin");

    const opEnd: ResolvePlaceCandidateOperationCandidate = {
      type: "resolve_place_candidate",
      payload: { slot: "end", label: "自宅" },
    };
    expect(opEnd.payload.slot).toBe("end");

    const opWhere: ResolvePlaceCandidateOperationCandidate = {
      type: "resolve_place_candidate",
      payload: {
        slot: "where",
        label: "渋谷スクランブルスクエア",
        coords: { lat: 35.658, lng: 139.7016 },
        placeId: "ChIJxyz123",
      },
    };
    expect(opWhere.payload.slot).toBe("where");
    expect(opWhere.payload.coords?.lat).toBe(35.658);
  });

  it("PlanOperationCandidate と既存 PlanOperation の type は重ならない (= isolation)", () => {
    // 既存 PlanOperation の 4 種 (= "append" / "modify" / "answer" / "noop")
    // は PlanOperationCandidateType に **含まれない**
    const candidateTypes: PlanOperationCandidateType[] = [
      "set_target_date",
      "add_travel_edge",
      "set_journey_origin",
      "set_journey_end",
      "resolve_place_candidate",
    ];
    const existingPlanOperationTypes = ["append", "modify", "answer", "noop"];
    for (const existingType of existingPlanOperationTypes) {
      expect(candidateTypes).not.toContain(existingType as PlanOperationCandidateType);
    }
  });

  it("exhaustive switch で 5 種 candidate を網羅できる (= compiler check)", () => {
    function classify(op: PlanOperationCandidate): string {
      switch (op.type) {
        case "set_target_date":
          return "date";
        case "add_travel_edge":
          return "travel";
        case "set_journey_origin":
          return "origin";
        case "set_journey_end":
          return "end";
        case "resolve_place_candidate":
          return "candidate";
        // exhaustiveness check: above 5 cases must cover all PlanOperationCandidate variants.
        // If a new type is added without case, TypeScript will flag this default.
        default: {
          const _exhaustive: never = op;
          return _exhaustive;
        }
      }
    }

    const op: PlanOperationCandidate = {
      type: "set_target_date",
      payload: { date: "today" },
    };
    expect(classify(op)).toBe("date");

    const op2: PlanOperationCandidate = {
      type: "add_travel_edge",
      payload: {
        segmentOrigin: { label: "A", classification: "generic_category" },
        segmentDestination: { label: "B", classification: "generic_category" },
      },
    };
    expect(classify(op2)).toBe("travel");
  });
});
