/**
 * runL1PipelineTargetDateProvenance.test.ts
 *
 * 検証カテゴリ:
 *   1. valid utterance provenance → result.targetDateProvenance 維持
 *   2. invalid utterance provenance (= span 不在 / 非日付) → undefined
 *   3. inferred → undefined (= -b strict mode)
 *   4. baseline / tool → そのまま pass
 *   5. priorEvents bypass mode でも checker が一貫して走る
 *   6. targetDateProvenance なし (= 旧 LLM 出力) → undefined、 既存 path 不変
 */

import { describe, test, expect } from "vitest";
import { runL1Pipeline } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { Event, Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

function makeBaseRaw(
  override: Partial<L1PipelineInput["raw"]> = {},
): L1PipelineInput["raw"] {
  return {
    targetDate: "today",
    events: [],
    operations: [],
    startPoint: null,
    departureTime: null,
    goOut: null,
    ...override,
  };
}

const utteranceProv = (over: Partial<Provenance> = {}): Provenance => ({
  source_type: "utterance",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: true,
  ...over,
});

describe("runL1Pipeline — targetDateProvenance checker integration", () => {
  test("valid utterance provenance + 日付 token → result.targetDateProvenance 維持", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "tomorrow",
        targetDateProvenance: utteranceProv({ source_span: ["明日"] }),
      }),
      utterance: "明日 渋谷",
    });
    expect(result.targetDateProvenance?.source_type).toBe("utterance");
    expect(result.targetDateProvenance?.source_span).toEqual(["明日"]);
  });

  test("invalid utterance provenance (= span 不在) → undefined", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: utteranceProv({ source_span: ["明日"] }),
      }),
      utterance: "渋谷でランチ",  // ← 「明日」 不在
    });
    expect(result.targetDateProvenance).toBeUndefined();
  });

  test("invalid utterance provenance (= 非日付 token) → undefined", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: utteranceProv({ source_span: ["私"] }),
      }),
      utterance: "私 渋谷",
    });
    expect(result.targetDateProvenance).toBeUndefined();
  });

  test("inferred → undefined (= -b strict mode で default today inferred 汚染防止)", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: {
          source_type: "inferred",
          source_span: [],
          provenance_confidence: "low",
          from_utterance: false,
        },
      }),
      utterance: "仕事",
    });
    expect(result.targetDateProvenance).toBeUndefined();
  });

  test("inferred + 日付 span でも undefined (= -b strict mode 維持)", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: {
          source_type: "inferred",
          source_span: ["明日"],
          provenance_confidence: "low",
          from_utterance: false,
        },
      }),
      utterance: "明日 仕事",
    });
    expect(result.targetDateProvenance).toBeUndefined();
  });

  test("baseline → そのまま pass (= touch しない)", () => {
    const prov: Provenance = {
      source_type: "baseline",
      source_span: [],
      provenance_confidence: "medium",
      from_utterance: false,
    };
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: prov,
      }),
      utterance: "仕事",
    });
    expect(result.targetDateProvenance).toBe(prov);
  });

  test("tool → そのまま pass", () => {
    const prov: Provenance = {
      source_type: "tool",
      source_span: [],
      provenance_confidence: "high",
      from_utterance: false,
    };
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: prov,
      }),
      utterance: "仕事",
    });
    expect(result.targetDateProvenance).toBe(prov);
  });

  test("priorEvents あり: events checker skip だが targetDateProvenance checker は走る (= 一貫性)", () => {
    const priorEvent = {
      event_id: "evt_1",
      turn_mode: "create" as const,
      when: {
        startTime: "09:00",
        endTime: null,
        timeHint: null,
        provenance: utteranceProv({ source_span: ["9時"] }),
      },
      where: {
        place_ref: "渋谷",
        placeType: "generic_place",
        coordinates: null,
        provenance: utteranceProv({ source_span: ["渋谷"] }),
      },
      what: {
        activity: "仕事",
        activityCanonical: "仕事",
        provenance: utteranceProv({ source_span: [] }),
      },
      who: [],
      transport: null,
      certainty: "asserted" as const,
      missing_semantic_critical: [],
    };
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: utteranceProv({ source_span: ["明日"] }),
      }),
      utterance: "渋谷でランチ",  // ← 「明日」 不在
      priorEvents: [priorEvent as unknown as Event],
    });
    // priorEvents bypass でも targetDateProvenance checker が走り、 span 不在で undefined
    expect(result.targetDateProvenance).toBeUndefined();
  });

  test("priorEvents なし: 通常 path で events checker + targetDateProvenance checker 両方走る", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "tomorrow",
        targetDateProvenance: utteranceProv({ source_span: ["明日"] }),
      }),
      utterance: "明日 渋谷",
    });
    expect(result.targetDateProvenance?.source_type).toBe("utterance");
  });

  test("targetDateProvenance なし (= 旧 LLM 出力 後方互換) → undefined、 raw 全体は valid", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        // targetDateProvenance なし
      }),
      utterance: "仕事",
    });
    expect(result.targetDateProvenance).toBeUndefined();
    expect(result.targetDate).toBe("today");
    expect(result.events).toEqual([]);
  });

  test("固有名詞汚染防止 (= 「明日香」 を utterance 申告) → undefined", () => {
    const result = runL1Pipeline({
      raw: makeBaseRaw({
        targetDate: "today",
        targetDateProvenance: utteranceProv({ source_span: ["明日香"] }),
      }),
      utterance: "明日香とランチ",
    });
    expect(result.targetDateProvenance).toBeUndefined();
  });
});
