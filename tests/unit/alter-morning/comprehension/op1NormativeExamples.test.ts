/**
 * OP-1 規範例 (= § 2.4 / § 2.5) — V2 schema fixture + normalizer test
 *
 * OP-1 design doc § 2.4 / § 2.5 の規範例を、 V2 schema fixture + normalizer
 * 通過後の internal type で検証する。 LLM 実呼び出しなし (= unit test、 deterministic)。
 *
 * 検証観点:
 *   1. § 2.4 「明日 8 時東京駅から渋谷へ」 → journeyOrigin.kind = "unknown"
 *      / segments[0] = 東京駅 → 渋谷 / 完全分離
 *   2. § 2.5 「明日は自宅から始めて、 8 時東京駅から渋谷へ」 → journeyOrigin.kind =
 *      "explicit_day_origin" + label = 自宅 / segments[0] = 東京駅 → 渋谷 / 完全分離
 *   3. PR #75 不変条件継承: segmentOrigin を journeyOrigin に絶対昇格しない
 *
 * OP-2 規律:
 *   - V2 schema fixture ベース (= LLM 実呼び出しなし)
 *   - active runtime に流れない
 *   - dispatcher / legacyAdapter に接続しない
 */

import { describe, it, expect } from "vitest";
import {
  L1_COMPREHENSION_V2_SCHEMA,
  JOURNEY_ORIGIN_SCHEMA,
  SEGMENT_SCHEMA,
} from "@/lib/alter-morning/comprehension/operationCandidateSchema";
import {
  normalizeComprehensionExtras,
  type ComprehensionExtras,
} from "@/lib/alter-morning/comprehension/comprehensionNormalizer";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

const INFERRED_PROV: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "low",
  from_utterance: false,
};

const UTTERANCE_PROV: Provenance = {
  source_type: "utterance",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: true,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2.4: 「明日 8 時東京駅から渋谷へ」 (= 明示 day-origin signal なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-1 § 2.4 規範例: 「明日 8 時東京駅から渋谷へ」", () => {
  // V2 schema fixture (= LLM が「正しく」 出した想定の出力)
  const v2Fixture = {
    targetDate: "tomorrow",
    events: [],
    operations: [],
    startPoint: null,
    departureTime: null,
    goOut: null,
    journeyOrigin: {
      kind: "unknown" as const,
      label: null,
      classification: null,
      confidence: "low" as const,
      provenance: INFERRED_PROV,
    },
    journeyEnd: {
      kind: "unknown" as const,
      label: null,
      classification: null,
      confidence: "low" as const,
      provenance: INFERRED_PROV,
    },
    segments: [
      {
        segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "08:00",
        segmentArrivalTime: null,
        transport: null,
        matchedSpan: "東京駅から渋谷へ",
      },
    ],
  };

  it("V2 fixture が L1_COMPREHENSION_V2_SCHEMA の required を満たす (= structural check)", () => {
    for (const field of L1_COMPREHENSION_V2_SCHEMA.required) {
      expect(v2Fixture).toHaveProperty(field);
    }
  });

  it("journeyOrigin.kind === 'unknown' (= 明示 day-origin signal なし)", () => {
    expect(v2Fixture.journeyOrigin.kind).toBe("unknown");
    expect(v2Fixture.journeyOrigin.label).toBeNull();
  });

  it("journeyEnd.kind === 'unknown' (= 明示 signal なし)", () => {
    expect(v2Fixture.journeyEnd.kind).toBe("unknown");
  });

  it("segments[0] が 東京駅 → 渋谷 (= segment-level、 day-level ではない)", () => {
    expect(v2Fixture.segments).toHaveLength(1);
    expect(v2Fixture.segments[0].segmentOrigin.label).toBe("東京駅");
    expect(v2Fixture.segments[0].segmentDestination.label).toBe("渋谷");
    expect(v2Fixture.segments[0].segmentDepartureTime).toBe("08:00");
  });

  it("normalizer 通過後 journeyOrigin.kind === 'unknown' を保持", () => {
    const extras = normalizeComprehensionExtras({
      journeyOrigin: v2Fixture.journeyOrigin,
      journeyEnd: v2Fixture.journeyEnd,
      segments: v2Fixture.segments,
    });
    expect(extras.journeyOrigin.kind).toBe("unknown");
    expect(extras.journeyOrigin.label).toBeNull();
  });

  it("normalizer 通過後 segments[0].segmentOrigin.label === '東京駅'", () => {
    const extras = normalizeComprehensionExtras({
      journeyOrigin: v2Fixture.journeyOrigin,
      journeyEnd: v2Fixture.journeyEnd,
      segments: v2Fixture.segments,
    });
    expect(extras.segments[0].segmentOrigin.label).toBe("東京駅");
  });

  it("【完全分離 assertion】 journeyOrigin.label !== segments[0].segmentOrigin.label", () => {
    const extras = normalizeComprehensionExtras({
      journeyOrigin: v2Fixture.journeyOrigin,
      journeyEnd: v2Fixture.journeyEnd,
      segments: v2Fixture.segments,
    });
    // PR #75 不変条件継承: 「X から Y へ」 だけでは journeyOrigin を埋めない
    expect(extras.journeyOrigin.label).toBeNull();
    expect(extras.segments[0].segmentOrigin.label).toBe("東京駅");
    // 「東京駅」 は segmentOrigin にあって journeyOrigin にない
    expect(extras.journeyOrigin.label).not.toBe(
      extras.segments[0].segmentOrigin.label,
    );
  });

  it("LLM が null を返した場合も normalizer が default で埋める (= defensive)", () => {
    // LLM が journeyOrigin を出さなかった想定 (= V2 schema で null 許容)
    const extras = normalizeComprehensionExtras({
      journeyOrigin: null,
      journeyEnd: null,
      segments: v2Fixture.segments,
    });
    expect(extras.journeyOrigin.kind).toBe("unknown");
    expect(extras.journeyEnd.kind).toBe("unknown");
    // segments は LLM 出力をそのまま retain
    expect(extras.segments[0].segmentOrigin.label).toBe("東京駅");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2.5: 「明日は自宅から始めて、 8 時東京駅から渋谷へ」 (= 明示 day-origin signal あり)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-1 § 2.5 規範例: 「明日は自宅から始めて、 8 時東京駅から渋谷へ」", () => {
  // V2 schema fixture
  const v2Fixture = {
    targetDate: "tomorrow",
    events: [],
    operations: [],
    startPoint: null,
    departureTime: null,
    goOut: null,
    journeyOrigin: {
      kind: "explicit_day_origin" as const,
      label: "自宅",
      classification: "private_anchor",
      confidence: "high" as const,
      provenance: {
        ...UTTERANCE_PROV,
        source_span: ["自宅から始めて"],
      },
    },
    journeyEnd: {
      kind: "unknown" as const,
      label: null,
      classification: null,
      confidence: "low" as const,
      provenance: INFERRED_PROV,
    },
    segments: [
      {
        segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "08:00",
        segmentArrivalTime: null,
        transport: null,
        matchedSpan: "東京駅から渋谷へ",
      },
    ],
  };

  it("V2 fixture が L1_COMPREHENSION_V2_SCHEMA の required を満たす", () => {
    for (const field of L1_COMPREHENSION_V2_SCHEMA.required) {
      expect(v2Fixture).toHaveProperty(field);
    }
  });

  it("journeyOrigin.kind === 'explicit_day_origin' (= 明示 signal 「自宅から始めて」)", () => {
    expect(v2Fixture.journeyOrigin.kind).toBe("explicit_day_origin");
    expect(v2Fixture.journeyOrigin.label).toBe("自宅");
    expect(v2Fixture.journeyOrigin.confidence).toBe("high");
    expect(v2Fixture.journeyOrigin.provenance.source_type).toBe("utterance");
  });

  it("journeyEnd.kind === 'unknown' (= 終点の明示 signal なし)", () => {
    expect(v2Fixture.journeyEnd.kind).toBe("unknown");
  });

  it("segments[0] が 東京駅 → 渋谷 (= segment-level、 journeyOrigin と独立)", () => {
    expect(v2Fixture.segments[0].segmentOrigin.label).toBe("東京駅");
    expect(v2Fixture.segments[0].segmentDestination.label).toBe("渋谷");
  });

  it("normalizer 通過後 journeyOrigin.kind === 'explicit_day_origin'", () => {
    const extras = normalizeComprehensionExtras({
      journeyOrigin: v2Fixture.journeyOrigin,
      journeyEnd: v2Fixture.journeyEnd,
      segments: v2Fixture.segments,
    });
    expect(extras.journeyOrigin.kind).toBe("explicit_day_origin");
    expect(extras.journeyOrigin.label).toBe("自宅");
  });

  it("【完全分離 assertion】 journeyOrigin.label === '自宅' / segments[0].segmentOrigin.label === '東京駅'", () => {
    const extras = normalizeComprehensionExtras({
      journeyOrigin: v2Fixture.journeyOrigin,
      journeyEnd: v2Fixture.journeyEnd,
      segments: v2Fixture.segments,
    });
    expect(extras.journeyOrigin.label).toBe("自宅");
    expect(extras.segments[0].segmentOrigin.label).toBe("東京駅");
    // day-level と segment-level は完全分離
    expect(extras.journeyOrigin.label).not.toBe(
      extras.segments[0].segmentOrigin.label,
    );
  });

  it("normalizer 通過後 internal type は ComprehensionExtras (= required)", () => {
    const extras: ComprehensionExtras = normalizeComprehensionExtras({
      journeyOrigin: v2Fixture.journeyOrigin,
      journeyEnd: v2Fixture.journeyEnd,
      segments: v2Fixture.segments,
    });
    // 全 field が required で取り出せる (= compile-time check)
    expect(extras.journeyOrigin).toBeDefined();
    expect(extras.journeyEnd).toBeDefined();
    expect(extras.segments).toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR #75 不変条件継承の構造的確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR #75 不変条件継承 (= segmentOrigin を journeyOrigin に即昇格しない)", () => {
  it("JOURNEY_ORIGIN_SCHEMA に segmentOrigin / segmentDestination 名の field がない (= 完全分離)", () => {
    const props = JOURNEY_ORIGIN_SCHEMA.properties as Record<string, unknown>;
    expect(props.segmentOrigin).toBeUndefined();
    expect(props.segmentDestination).toBeUndefined();
  });

  it("SEGMENT_SCHEMA に journeyOrigin / journeyEnd 名の field がない (= 完全分離)", () => {
    const props = SEGMENT_SCHEMA.properties as Record<string, unknown>;
    expect(props.journeyOrigin).toBeUndefined();
    expect(props.journeyEnd).toBeUndefined();
  });

  it("L1_COMPREHENSION_V2_SCHEMA で journeyOrigin と segments[0].segmentOrigin が独立 path", () => {
    const v2Props = L1_COMPREHENSION_V2_SCHEMA.properties;
    expect(v2Props.journeyOrigin).toBeDefined();
    expect(v2Props.segments).toBeDefined();
    // journeyOrigin と segments は別 properties
    expect(v2Props.journeyOrigin).not.toBe(v2Props.segments);
  });
});
