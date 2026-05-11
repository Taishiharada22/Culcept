/**
 * parseTargetDateProvenance.test.ts
 *
 * 検証カテゴリ:
 *   1. 不正値で undefined (= invalid だけ落とす、 raw 全体は reject しない設計)
 *   2. valid Provenance はそのまま return
 */

import { describe, test, expect } from "vitest";
import { parseTargetDateProvenance } from "@/lib/alter-morning/comprehension/l1Pipeline";

describe("parseTargetDateProvenance — invalid → undefined", () => {
  test("undefined → undefined", () => {
    expect(parseTargetDateProvenance(undefined)).toBeUndefined();
  });

  test("null → undefined", () => {
    expect(parseTargetDateProvenance(null)).toBeUndefined();
  });

  test("string (not object) → undefined", () => {
    expect(parseTargetDateProvenance("invalid")).toBeUndefined();
  });

  test("number (not object) → undefined", () => {
    expect(parseTargetDateProvenance(123)).toBeUndefined();
  });

  test("array (not object) → undefined", () => {
    expect(parseTargetDateProvenance([])).toBeUndefined();
  });

  test("invalid source_type (not in enum) → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_type: "invalid_type",
        source_span: [],
        provenance_confidence: "high",
        from_utterance: false,
      }),
    ).toBeUndefined();
  });

  test("missing source_type → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_span: [],
        provenance_confidence: "high",
        from_utterance: false,
      }),
    ).toBeUndefined();
  });

  test("invalid provenance_confidence → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_type: "utterance",
        source_span: ["明日"],
        provenance_confidence: "invalid",
        from_utterance: true,
      }),
    ).toBeUndefined();
  });

  test("source_span not array (= string) → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_type: "utterance",
        source_span: "明日",
        provenance_confidence: "high",
        from_utterance: true,
      }),
    ).toBeUndefined();
  });

  test("source_span 内に non-string → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_type: "utterance",
        source_span: ["明日", 123],
        provenance_confidence: "high",
        from_utterance: true,
      }),
    ).toBeUndefined();
  });

  test("from_utterance not boolean (= string) → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_type: "utterance",
        source_span: ["明日"],
        provenance_confidence: "high",
        from_utterance: "yes",
      }),
    ).toBeUndefined();
  });

  test("missing from_utterance → undefined", () => {
    expect(
      parseTargetDateProvenance({
        source_type: "utterance",
        source_span: ["明日"],
        provenance_confidence: "high",
      }),
    ).toBeUndefined();
  });
});

describe("parseTargetDateProvenance — valid → pass", () => {
  test("valid utterance Provenance", () => {
    const result = parseTargetDateProvenance({
      source_type: "utterance",
      source_span: ["明日"],
      provenance_confidence: "high",
      from_utterance: true,
    });
    expect(result).toEqual({
      source_type: "utterance",
      source_span: ["明日"],
      provenance_confidence: "high",
      from_utterance: true,
    });
  });

  test("valid inferred Provenance (= 空 source_span)", () => {
    const result = parseTargetDateProvenance({
      source_type: "inferred",
      source_span: [],
      provenance_confidence: "low",
      from_utterance: false,
    });
    expect(result?.source_type).toBe("inferred");
    expect(result?.source_span).toEqual([]);
  });

  test("valid baseline Provenance", () => {
    const result = parseTargetDateProvenance({
      source_type: "baseline",
      source_span: [],
      provenance_confidence: "medium",
      from_utterance: false,
    });
    expect(result?.source_type).toBe("baseline");
  });

  test("valid tool Provenance", () => {
    const result = parseTargetDateProvenance({
      source_type: "tool",
      source_span: [],
      provenance_confidence: "high",
      from_utterance: false,
    });
    expect(result?.source_type).toBe("tool");
  });

  test("複数 span の utterance Provenance", () => {
    const result = parseTargetDateProvenance({
      source_type: "utterance",
      source_span: ["明日", "渋谷"],
      provenance_confidence: "high",
      from_utterance: true,
    });
    expect(result?.source_span).toEqual(["明日", "渋谷"]);
  });
});
