/**
 * Comprehension Normalizer (OP-2) — defensive default test
 *
 * 検証観点:
 *   1. input が null / undefined → 全 default
 *   2. journeyOrigin が null → DEFAULT (= kind: "unknown")
 *   3. journeyEnd が null → DEFAULT (= kind: "unknown")
 *   4. segments が undefined / null / [] → []
 *   5. 値あり → そのまま retain
 *   6. 部分的 input (= 一部 field のみ) → 不在 field は default で埋める
 *
 * OP-2 規律:
 *   - V2 fixture 専用
 *   - dispatcher / legacyAdapter に **接続しない**
 *   - 副作用なし、 pure function
 */

import { describe, it, expect } from "vitest";
import {
  normalizeComprehensionExtras,
  type NormalizedJourneyOrigin,
  type NormalizedJourneyEnd,
  type NormalizedSegment,
  type ComprehensionExtras,
} from "@/lib/alter-morning/comprehension/comprehensionNormalizer";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

const UTTERANCE_PROV: Provenance = {
  source_type: "utterance",
  source_span: ["自宅から始めて"],
  provenance_confidence: "high",
  from_utterance: true,
};

describe("normalizeComprehensionExtras (OP-2)", () => {
  it("input が null → 全 default で埋める", () => {
    const result = normalizeComprehensionExtras(null);
    expect(result.journeyOrigin.kind).toBe("unknown");
    expect(result.journeyOrigin.label).toBeNull();
    expect(result.journeyEnd.kind).toBe("unknown");
    expect(result.journeyEnd.label).toBeNull();
    expect(result.segments).toEqual([]);
  });

  it("input が undefined → 全 default で埋める", () => {
    const result = normalizeComprehensionExtras(undefined);
    expect(result.journeyOrigin.kind).toBe("unknown");
    expect(result.journeyEnd.kind).toBe("unknown");
    expect(result.segments).toEqual([]);
  });

  it("input が {} (= 空 object) → 全 default で埋める", () => {
    const result = normalizeComprehensionExtras({});
    expect(result.journeyOrigin.kind).toBe("unknown");
    expect(result.journeyEnd.kind).toBe("unknown");
    expect(result.segments).toEqual([]);
  });

  it("journeyOrigin が null → DEFAULT_JOURNEY_ORIGIN", () => {
    const result = normalizeComprehensionExtras({
      journeyOrigin: null,
      journeyEnd: null,
      segments: [],
    });
    expect(result.journeyOrigin.kind).toBe("unknown");
    expect(result.journeyOrigin.label).toBeNull();
    expect(result.journeyOrigin.confidence).toBe("low");
    expect(result.journeyOrigin.provenance.source_type).toBe("inferred");
  });

  it("journeyOrigin に値あり → そのまま retain (= explicit_day_origin)", () => {
    const explicit: NormalizedJourneyOrigin = {
      kind: "explicit_day_origin",
      label: "自宅",
      classification: "private_anchor",
      confidence: "high",
      provenance: UTTERANCE_PROV,
    };
    const result = normalizeComprehensionExtras({
      journeyOrigin: explicit,
      journeyEnd: null,
      segments: [],
    });
    expect(result.journeyOrigin.kind).toBe("explicit_day_origin");
    expect(result.journeyOrigin.label).toBe("自宅");
    expect(result.journeyOrigin.provenance.source_type).toBe("utterance");
  });

  it("journeyEnd が null → DEFAULT_JOURNEY_END", () => {
    const result = normalizeComprehensionExtras({
      journeyOrigin: null,
      journeyEnd: null,
      segments: [],
    });
    expect(result.journeyEnd.kind).toBe("unknown");
    expect(result.journeyEnd.label).toBeNull();
  });

  it("journeyEnd に値あり → そのまま retain (= explicit_day_end)", () => {
    const explicit: NormalizedJourneyEnd = {
      kind: "explicit_day_end",
      label: "自宅",
      classification: "private_anchor",
      confidence: "high",
      provenance: UTTERANCE_PROV,
    };
    const result = normalizeComprehensionExtras({
      journeyEnd: explicit,
    });
    expect(result.journeyEnd.kind).toBe("explicit_day_end");
    expect(result.journeyEnd.label).toBe("自宅");
  });

  it("segments が undefined → []", () => {
    const result = normalizeComprehensionExtras({
      segments: undefined,
    });
    expect(result.segments).toEqual([]);
  });

  it("segments が null → []", () => {
    const result = normalizeComprehensionExtras({
      segments: null,
    });
    expect(result.segments).toEqual([]);
  });

  it("segments に値あり → そのまま retain", () => {
    const seg: NormalizedSegment = {
      segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
      segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
      segmentDepartureTime: "08:00",
      segmentArrivalTime: null,
      transport: null,
      matchedSpan: "東京駅から渋谷へ",
    };
    const result = normalizeComprehensionExtras({
      segments: [seg],
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].segmentOrigin.label).toBe("東京駅");
    expect(result.segments[0].segmentDestination.label).toBe("渋谷");
    expect(result.segments[0].segmentDepartureTime).toBe("08:00");
  });

  it("部分的 input (= journeyOrigin のみ) → 残りは default", () => {
    const explicit: NormalizedJourneyOrigin = {
      kind: "explicit_day_origin",
      label: "ホテル",
      classification: "private_anchor",
      confidence: "high",
      provenance: UTTERANCE_PROV,
    };
    const result = normalizeComprehensionExtras({
      journeyOrigin: explicit,
    });
    expect(result.journeyOrigin.label).toBe("ホテル");
    expect(result.journeyEnd.kind).toBe("unknown");
    expect(result.segments).toEqual([]);
  });

  it("複数 segments を retain", () => {
    const segs: NormalizedSegment[] = [
      {
        segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "08:00",
        segmentArrivalTime: null,
        transport: null,
        matchedSpan: "東京駅から渋谷へ",
      },
      {
        segmentOrigin: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "新宿", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "12:00",
        segmentArrivalTime: null,
        transport: null,
        matchedSpan: "渋谷から新宿へ",
      },
    ];
    const result = normalizeComprehensionExtras({
      segments: segs,
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].segmentDestination.label).toBe("渋谷");
    expect(result.segments[1].segmentOrigin.label).toBe("渋谷");
  });

  it("normalizer は pure (= 入力 mutate しない)", () => {
    const input = {
      journeyOrigin: null,
      segments: [],
    };
    const result = normalizeComprehensionExtras(input);
    // 入力は変わらない
    expect(input.journeyOrigin).toBeNull();
    expect(input.segments).toEqual([]);
    // 結果は default で埋まる
    expect(result.journeyOrigin.kind).toBe("unknown");
  });

  it("出力型は ComprehensionExtras (= 全 field required)", () => {
    const result: ComprehensionExtras = normalizeComprehensionExtras(null);
    // type-level: 全 field required (= compile-time check)
    expect(result.journeyOrigin).toBeDefined();
    expect(result.journeyEnd).toBeDefined();
    expect(result.segments).toBeDefined();
  });
});
