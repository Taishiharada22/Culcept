/**
 * Operation Candidate Schema (OP-2) — schema structure test
 *
 * 検証観点:
 *   1. JOURNEY_ORIGIN_SCHEMA / JOURNEY_END_SCHEMA / SEGMENTS_SCHEMA の structure
 *   2. PLAN_OPERATION_CANDIDATE_SCHEMA の type enum (= 5 種)
 *   3. L1_COMPREHENSION_V2_SCHEMA に新 field が含まれる
 *   4. V2 schema が active L1_COMPREHENSION_SCHEMA とは別 const (= isolation)
 *   5. L1_RESPONSE_FORMAT_V2 が strict: true
 *   6. day-level / segment-level 分離 (= field 名の独立性)
 *
 * OP-2 規律:
 *   - active L1_COMPREHENSION_SCHEMA / L1_RESPONSE_FORMAT は **不変**
 *   - V2 schema は **未接続** (= LLM 呼び出しから参照されない)
 */

import { describe, it, expect } from "vitest";
import {
  JOURNEY_ORIGIN_SCHEMA,
  JOURNEY_END_SCHEMA,
  SEGMENT_SCHEMA,
  SEGMENTS_SCHEMA,
  PLAN_OPERATION_CANDIDATE_SCHEMA,
  L1_COMPREHENSION_V2_SCHEMA,
  L1_RESPONSE_FORMAT_V2,
} from "@/lib/alter-morning/comprehension/operationCandidateSchema";
import {
  L1_COMPREHENSION_SCHEMA,
  L1_RESPONSE_FORMAT,
} from "@/lib/alter-morning/comprehension/structuredSchema";

describe("JOURNEY_ORIGIN_SCHEMA (OP-2)", () => {
  it("type は object、 additionalProperties: false", () => {
    expect(JOURNEY_ORIGIN_SCHEMA.type).toBe("object");
    expect(JOURNEY_ORIGIN_SCHEMA.additionalProperties).toBe(false);
  });

  it("kind enum は ['explicit_day_origin', 'unknown']", () => {
    const kindField = JOURNEY_ORIGIN_SCHEMA.properties.kind as {
      enum: readonly string[];
    };
    expect(kindField.enum).toEqual(["explicit_day_origin", "unknown"]);
  });

  it("label / classification は nullable", () => {
    const labelField = JOURNEY_ORIGIN_SCHEMA.properties.label as {
      type: readonly string[];
    };
    expect(labelField.type).toEqual(["string", "null"]);
    const classificationField = JOURNEY_ORIGIN_SCHEMA.properties.classification as {
      type: readonly string[];
    };
    expect(classificationField.type).toEqual(["string", "null"]);
  });

  it("confidence enum は ['high', 'medium', 'low']", () => {
    const confField = JOURNEY_ORIGIN_SCHEMA.properties.confidence as {
      enum: readonly string[];
    };
    expect(confField.enum).toEqual(["high", "medium", "low"]);
  });

  it("required に kind / label / classification / confidence / provenance を全部含む (= OpenAI strict mode)", () => {
    expect(JOURNEY_ORIGIN_SCHEMA.required).toEqual([
      "kind",
      "label",
      "classification",
      "confidence",
      "provenance",
    ]);
  });
});

describe("JOURNEY_END_SCHEMA (OP-2)", () => {
  it("kind enum は ['explicit_day_end', 'unknown'] (= journeyOrigin と異なる)", () => {
    const kindField = JOURNEY_END_SCHEMA.properties.kind as {
      enum: readonly string[];
    };
    expect(kindField.enum).toEqual(["explicit_day_end", "unknown"]);
  });

  it("required は journeyOrigin と同形 (= 5 field)", () => {
    expect(JOURNEY_END_SCHEMA.required).toEqual([
      "kind",
      "label",
      "classification",
      "confidence",
      "provenance",
    ]);
  });
});

describe("SEGMENT_SCHEMA / SEGMENTS_SCHEMA (OP-2)", () => {
  it("SEGMENT_SCHEMA に segmentOrigin / segmentDestination が必須", () => {
    expect(SEGMENT_SCHEMA.required).toContain("segmentOrigin");
    expect(SEGMENT_SCHEMA.required).toContain("segmentDestination");
  });

  it("SEGMENT_SCHEMA に segmentDepartureTime は nullable string", () => {
    const time = SEGMENT_SCHEMA.properties.segmentDepartureTime as {
      type: readonly string[];
    };
    expect(time.type).toEqual(["string", "null"]);
  });

  it("SEGMENTS_SCHEMA は array (= 空 [] で「該当なし」 を表現)", () => {
    expect(SEGMENTS_SCHEMA.type).toBe("array");
    expect(SEGMENTS_SCHEMA.items).toBe(SEGMENT_SCHEMA);
  });
});

describe("PLAN_OPERATION_CANDIDATE_SCHEMA (OP-2)", () => {
  it("strict mode 互換: additionalProperties: false", () => {
    expect(PLAN_OPERATION_CANDIDATE_SCHEMA.additionalProperties).toBe(false);
  });

  it("type enum が 新 5 種 (= 既存 PlanOperation の 4 種は含まない)", () => {
    const typeField = PLAN_OPERATION_CANDIDATE_SCHEMA.properties.type as {
      enum: readonly string[];
    };
    expect(typeField.enum).toEqual([
      "set_target_date",
      "add_travel_edge",
      "set_journey_origin",
      "set_journey_end",
      "resolve_place_candidate",
    ]);
    // 既存 PlanOperation の 4 種は含まない
    expect(typeField.enum).not.toContain("append");
    expect(typeField.enum).not.toContain("modify");
    expect(typeField.enum).not.toContain("answer");
    expect(typeField.enum).not.toContain("noop");
  });

  it("required は ['type', 'payload']", () => {
    expect(PLAN_OPERATION_CANDIDATE_SCHEMA.required).toEqual(["type", "payload"]);
  });
});

describe("L1_COMPREHENSION_V2_SCHEMA (OP-2)", () => {
  it("V2 schema は active L1_COMPREHENSION_SCHEMA と別 const (= isolation)", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA).not.toBe(L1_COMPREHENSION_SCHEMA);
  });

  it("V2 schema に journeyOrigin / journeyEnd / segments が含まれる", () => {
    const props = L1_COMPREHENSION_V2_SCHEMA.properties as Record<string, unknown>;
    expect(props.journeyOrigin).toBeDefined();
    expect(props.journeyEnd).toBeDefined();
    expect(props.segments).toBeDefined();
  });

  it("V2 schema の required に新 3 field が含まれる (= OpenAI strict mode 要件)", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("journeyOrigin");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("journeyEnd");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("segments");
  });

  it("V2 schema の required に既存 6 field も含まれる (= 互換性)", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("targetDate");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("events");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("operations");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("startPoint");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("departureTime");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("goOut");
  });

  it("V2 schema の additionalProperties: false (= strict mode 互換)", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA.additionalProperties).toBe(false);
  });

  it("V2 journeyOrigin と segmentOrigin の field 名が独立 (= PR #75 規律継承)", () => {
    const props = L1_COMPREHENSION_V2_SCHEMA.properties;
    // journeyOrigin (= day-level) と segments[0].segmentOrigin (= segment-level) は別 field
    expect(props.journeyOrigin).toBeDefined();
    expect(props.segments).toBeDefined();
    // segments の items は segmentOrigin / segmentDestination を持つ
    const segmentsItems = SEGMENT_SCHEMA.properties;
    expect(segmentsItems.segmentOrigin).toBeDefined();
    expect(segmentsItems.segmentDestination).toBeDefined();
    // journeyOrigin の properties には segmentOrigin が含まれない (= 完全分離)
    const journeyOriginProps = JOURNEY_ORIGIN_SCHEMA.properties as Record<
      string,
      unknown
    >;
    expect(journeyOriginProps.segmentOrigin).toBeUndefined();
    expect(journeyOriginProps.segmentDestination).toBeUndefined();
  });
});

describe("L1_RESPONSE_FORMAT_V2 (OP-2)", () => {
  it("strict: true で、 schema は L1_COMPREHENSION_V2_SCHEMA を参照", () => {
    expect(L1_RESPONSE_FORMAT_V2.json_schema.strict).toBe(true);
    expect(L1_RESPONSE_FORMAT_V2.json_schema.schema).toBe(L1_COMPREHENSION_V2_SCHEMA);
  });

  it("V2 response format の name は 'AlterMorningComprehensionV2'", () => {
    expect(L1_RESPONSE_FORMAT_V2.json_schema.name).toBe("AlterMorningComprehensionV2");
  });

  it("V2 response format は active L1_RESPONSE_FORMAT と別 const (= isolation)", () => {
    expect(L1_RESPONSE_FORMAT_V2).not.toBe(L1_RESPONSE_FORMAT);
    expect(L1_RESPONSE_FORMAT_V2.json_schema.schema).not.toBe(
      L1_RESPONSE_FORMAT.json_schema.schema,
    );
  });
});

describe("Fixture validation (OP-2 規範例 ベース)", () => {
  it("§ 2.4 規範例: journeyOrigin.kind = 'unknown' shape が schema に整合", () => {
    // 「明日 8 時東京駅から渋谷へ」 → journeyOrigin = unknown variant
    const fixture = {
      kind: "unknown" as const,
      label: null,
      classification: null,
      confidence: "low" as const,
      provenance: {
        source_type: "inferred" as const,
        source_span: [],
        provenance_confidence: "low" as const,
        from_utterance: false,
      },
    };
    // schema validation を構造 assertion で代替 (= ajv 不使用)
    expect(fixture.kind).toBe("unknown");
    expect(JOURNEY_ORIGIN_SCHEMA.required).toContain("kind");
    expect(JOURNEY_ORIGIN_SCHEMA.required).toContain("provenance");
    // fixture が schema の required を全部持っている
    for (const field of JOURNEY_ORIGIN_SCHEMA.required) {
      expect(fixture).toHaveProperty(field);
    }
  });

  it("§ 2.5 規範例: journeyOrigin.kind = 'explicit_day_origin' shape が schema に整合", () => {
    const fixture = {
      kind: "explicit_day_origin" as const,
      label: "自宅",
      classification: "private_anchor",
      confidence: "high" as const,
      provenance: {
        source_type: "utterance" as const,
        source_span: ["自宅から始めて"],
        provenance_confidence: "high" as const,
        from_utterance: true,
      },
    };
    expect(fixture.kind).toBe("explicit_day_origin");
    for (const field of JOURNEY_ORIGIN_SCHEMA.required) {
      expect(fixture).toHaveProperty(field);
    }
  });

  it("§ 2.4 規範例: segments[0] が schema に整合 (= 東京駅 → 渋谷)", () => {
    const fixture = {
      segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
      segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
      segmentDepartureTime: "08:00",
      segmentArrivalTime: null,
      transport: null,
      matchedSpan: "東京駅から渋谷へ",
    };
    for (const field of SEGMENT_SCHEMA.required) {
      expect(fixture).toHaveProperty(field);
    }
    expect(fixture.segmentOrigin.label).toBe("東京駅");
    expect(fixture.segmentDestination.label).toBe("渋谷");
  });
});
