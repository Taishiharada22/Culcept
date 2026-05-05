/**
 * OperationEnvelope (OP-2) — envelope structure + factory test
 *
 * 検証観点:
 *   1. `OperationSource` が 8 種を含む
 *   2. `wrapOperation` factory が envelope を生成 (= type / source / priority / confidence / provenance を含む)
 *   3. `trace` は optional
 *   4. 5 種 candidate 全てを wrap できる
 *   5. envelope.type が candidate.type を保持 (= generic narrowing)
 *
 * OP-2 規律:
 *   - dispatcher / legacyAdapter に **接続しない**
 *   - factory は pure function
 */

import { describe, it, expect } from "vitest";
import {
  wrapOperation,
  type OperationEnvelope,
  type OperationSource,
  type OperationConfidence,
  type OperationEnvelopeMeta,
} from "@/lib/alter-morning/comprehension/operationEnvelope";
import type {
  SetTargetDateOperationCandidate,
  AddTravelEdgeOperationCandidate,
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
  ResolvePlaceCandidateOperationCandidate,
  PlanOperationCandidate,
} from "@/lib/alter-morning/comprehension/planOperationCandidate";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

const UTTERANCE_PROV: Provenance = {
  source_type: "utterance",
  source_span: ["明日"],
  provenance_confidence: "high",
  from_utterance: true,
};

const INFERRED_PROV: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "low",
  from_utterance: false,
};

describe("OperationEnvelope (OP-2)", () => {
  it("OperationSource は 8 種を持つ", () => {
    const sources: OperationSource[] = [
      "llm_explicit",
      "llm_inferred",
      "regex_deterministic",
      "code_history",
      "code_location",
      "ui_action",
      "caller_request",
      "system_default",
    ];
    expect(sources).toHaveLength(8);
    expect(new Set(sources).size).toBe(8);
  });

  it("OperationConfidence は high / medium / low の 3 種", () => {
    const confs: OperationConfidence[] = ["high", "medium", "low"];
    expect(confs).toHaveLength(3);
  });

  it("wrapOperation が envelope を生成 (= candidate.type を保持)", () => {
    const op: SetTargetDateOperationCandidate = {
      type: "set_target_date",
      payload: { date: "tomorrow" },
    };
    const meta: OperationEnvelopeMeta = {
      source: "llm_explicit",
      priority: 700,
      confidence: "high",
      provenance: UTTERANCE_PROV,
    };
    const envelope = wrapOperation(op, meta);

    expect(envelope.type).toBe("set_target_date");
    expect(envelope.payload.date).toBe("tomorrow");
    expect(envelope.source).toBe("llm_explicit");
    expect(envelope.priority).toBe(700);
    expect(envelope.confidence).toBe("high");
    expect(envelope.provenance.source_type).toBe("utterance");
  });

  it("trace は optional (= 渡さない場合 undefined)", () => {
    const op: SetTargetDateOperationCandidate = {
      type: "set_target_date",
      payload: { date: "today" },
    };
    const envelope = wrapOperation(op, {
      source: "system_default",
      priority: 100,
      confidence: "low",
      provenance: INFERRED_PROV,
    });
    expect(envelope.trace).toBeUndefined();
  });

  it("trace を渡すと envelope に含まれる", () => {
    const op: AddTravelEdgeOperationCandidate = {
      type: "add_travel_edge",
      payload: {
        segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "08:00",
        matchedSpan: "東京駅から渋谷へ",
      },
    };
    const envelope = wrapOperation(op, {
      source: "regex_deterministic",
      priority: 600,
      confidence: "high",
      provenance: UTTERANCE_PROV,
      trace: {
        matchedSpan: "東京駅から渋谷へ",
        sourceTurnIndex: 0,
        ruleId: "fromToTravel",
      },
    });
    expect(envelope.trace?.matchedSpan).toBe("東京駅から渋谷へ");
    expect(envelope.trace?.ruleId).toBe("fromToTravel");
    expect(envelope.trace?.sourceTurnIndex).toBe(0);
  });

  it("5 種全 candidate を wrap できる (= generic 適合)", () => {
    const ops: PlanOperationCandidate[] = [
      { type: "set_target_date", payload: { date: "today" } },
      {
        type: "add_travel_edge",
        payload: {
          segmentOrigin: { label: "A", classification: "generic_category" },
          segmentDestination: { label: "B", classification: "generic_category" },
        },
      },
      {
        type: "set_journey_origin",
        payload: { kind: "unknown", reason: "no_baseline" },
      },
      {
        type: "set_journey_end",
        payload: { kind: "unknown", reason: "no_endpoint_signal" },
      },
      {
        type: "resolve_place_candidate",
        payload: { slot: "origin", label: "東京駅丸の内口" },
      },
    ];
    for (const op of ops) {
      const envelope = wrapOperation(op, {
        source: "llm_explicit",
        priority: 700,
        confidence: "medium",
        provenance: UTTERANCE_PROV,
      });
      expect(envelope.type).toBe(op.type);
      expect(envelope.source).toBe("llm_explicit");
    }
  });

  it("OperationEnvelope generic で候補の type narrowing が効く (= compile-time check)", () => {
    const op: SetJourneyOriginOperationCandidate = {
      type: "set_journey_origin",
      payload: {
        kind: "known_label_only",
        label: "自宅",
        source: "user_override",
      },
    };
    const envelope: OperationEnvelope<SetJourneyOriginOperationCandidate> = wrapOperation(op, {
      source: "ui_action",
      priority: 1000,
      confidence: "high",
      provenance: UTTERANCE_PROV,
    });
    // type narrowing: envelope.payload は JourneyAnchorState
    if (envelope.payload.kind === "known_label_only") {
      expect(envelope.payload.label).toBe("自宅");
    }
  });

  it("system_default source は priority 100 に紐づく (= OP-1 § 4.5 規律)", () => {
    const op: SetTargetDateOperationCandidate = {
      type: "set_target_date",
      payload: { date: "2026-05-05" },
    };
    const envelope = wrapOperation(op, {
      source: "system_default",
      priority: 100,
      confidence: "low",
      provenance: INFERRED_PROV,
    });
    expect(envelope.source).toBe("system_default");
    expect(envelope.priority).toBe(100);
  });

  it("ui_action source は priority 1000 に紐づく (= user 確定行為)", () => {
    const op: ResolvePlaceCandidateOperationCandidate = {
      type: "resolve_place_candidate",
      payload: { slot: "origin", label: "東京駅" },
    };
    const envelope = wrapOperation(op, {
      source: "ui_action",
      priority: 1000,
      confidence: "high",
      provenance: UTTERANCE_PROV,
    });
    expect(envelope.source).toBe("ui_action");
    expect(envelope.priority).toBe(1000);
  });

  it("Reuse: set_journey_end candidate の wrap も可能", () => {
    const op: SetJourneyEndOperationCandidate = {
      type: "set_journey_end",
      payload: {
        kind: "known_exact",
        label: "自宅",
        lat: 35.6812,
        lng: 139.7671,
        source: "registered_home",
      },
    };
    const envelope = wrapOperation(op, {
      source: "code_location",
      priority: 100,
      confidence: "low",
      provenance: INFERRED_PROV,
    });
    expect(envelope.type).toBe("set_journey_end");
    expect(envelope.priority).toBe(100);
  });
});
