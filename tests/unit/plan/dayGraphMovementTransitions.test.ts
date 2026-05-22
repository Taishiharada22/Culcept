/**
 * Phase 3-K K-1c — MovementTransition tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.5 / §6.3 / §22.3
 *
 * 検証範囲:
 *   - shouldEmitMovementTransition 4 規則
 *   - buildMovementTransitions: timingStatus / location text / sensitiveProximity
 *   - sensitive 由来 transition の location redaction
 *   - 連続 2 つ未満なら空配列
 */

import { describe, expect, it } from "vitest";

import {
  buildMovementTransitions,
  shouldEmitMovementTransition,
} from "@/lib/plan/dayGraph/movementTransitions";
import type { EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeEvent(overrides: Partial<EventNode> = {}): EventNode {
  return {
    id: "e",
    kind: "event",
    origin: "explicit",
    startTime: "14:00",
    endTime: "15:00",
    durationMin: 60,
    timeBucket: "afternoon",
    anchorId: "e",
    displayLabel: "test",
    title: "test",
    locationText: "渋谷",
    verb: "unknown",
    rigidity: "soft",
    latencyTolerance: "flexible",
    durationSource: "explicit",
    boundaryClipped: false,
    sensitive: false,
    overlapsWithNodeIds: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// shouldEmitMovementTransition — 4 規則
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shouldEmitMovementTransition", () => {
  it("両方 undefined → false", () => {
    const a = makeEvent({ locationText: undefined });
    const b = makeEvent({ locationText: undefined });
    expect(shouldEmitMovementTransition(a, b)).toBe(false);
  });

  it("両方同じ location → false", () => {
    const a = makeEvent({ locationText: "渋谷" });
    const b = makeEvent({ locationText: "渋谷" });
    expect(shouldEmitMovementTransition(a, b)).toBe(false);
  });

  it("片方 undefined / 片方あり → true (= 安全側)", () => {
    const a = makeEvent({ locationText: undefined });
    const b = makeEvent({ locationText: "新宿" });
    expect(shouldEmitMovementTransition(a, b)).toBe(true);
    expect(shouldEmitMovementTransition(b, a)).toBe(true);
  });

  it("両方あって異なる → true", () => {
    const a = makeEvent({ locationText: "渋谷" });
    const b = makeEvent({ locationText: "新宿" });
    expect(shouldEmitMovementTransition(a, b)).toBe(true);
  });

  it("sensitive → sensitive (= 両方 locationText undefined) → false (= privacy 優先)", () => {
    const a = makeEvent({ sensitive: true, locationText: undefined });
    const b = makeEvent({ sensitive: true, locationText: undefined });
    expect(shouldEmitMovementTransition(a, b)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildMovementTransitions — 通常パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMovementTransitions — empty / single", () => {
  it("event 0 → []", () => {
    expect(buildMovementTransitions([])).toEqual([]);
  });

  it("event 1 → []", () => {
    expect(buildMovementTransitions([makeEvent()])).toEqual([]);
  });
});

describe("buildMovementTransitions — pair 検出", () => {
  it("2 event 場所違い → 1 transition", () => {
    const a = makeEvent({ id: "a", anchorId: "a", locationText: "渋谷" });
    const b = makeEvent({ id: "b", anchorId: "b", locationText: "新宿" });
    const ts = buildMovementTransitions([a, b]);
    expect(ts.length).toBe(1);
    expect(ts[0]!.fromNodeId).toBe("a");
    expect(ts[0]!.toNodeId).toBe("b");
    expect(ts[0]!.timingStatus).toBe("unresolved");
    expect(ts[0]!.fromLocationText).toBe("渋谷");
    expect(ts[0]!.toLocationText).toBe("新宿");
    expect(ts[0]!.sensitiveProximity).toBe(false);
  });

  it("2 event 同場所 → 0 transition", () => {
    const a = makeEvent({ id: "a", anchorId: "a", locationText: "渋谷" });
    const b = makeEvent({ id: "b", anchorId: "b", locationText: "渋谷" });
    expect(buildMovementTransitions([a, b])).toEqual([]);
  });

  it("3 events 連続 (= a→b 異 / b→c 同) → 1 transition", () => {
    const a = makeEvent({ id: "a", anchorId: "a", locationText: "渋谷" });
    const b = makeEvent({ id: "b", anchorId: "b", locationText: "新宿" });
    const c = makeEvent({ id: "c", anchorId: "c", locationText: "新宿" });
    const ts = buildMovementTransitions([a, b, c]);
    expect(ts.length).toBe(1);
    expect(ts[0]!.fromNodeId).toBe("a");
    expect(ts[0]!.toNodeId).toBe("b");
  });

  it("3 events 全異場所 → 2 transitions", () => {
    const a = makeEvent({ id: "a", anchorId: "a", locationText: "渋谷" });
    const b = makeEvent({ id: "b", anchorId: "b", locationText: "新宿" });
    const c = makeEvent({ id: "c", anchorId: "c", locationText: "原宿" });
    const ts = buildMovementTransitions([a, b, c]);
    expect(ts.length).toBe(2);
    expect(ts[0]!.fromNodeId).toBe("a");
    expect(ts[1]!.fromNodeId).toBe("b");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sensitive redaction (= RedactionContract sensitiveTransitionLocationHidden)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMovementTransitions — sensitive redaction", () => {
  it("sensitive → non-sensitive (= 片 undefined) → transition、 location 共に undefined", () => {
    const a = makeEvent({
      id: "a",
      anchorId: "a",
      sensitive: true,
      title: undefined,
      locationText: undefined,
      displayLabel: "予定 (= 医療系)",
    });
    const b = makeEvent({ id: "b", anchorId: "b", locationText: "新宿" });
    const ts = buildMovementTransitions([a, b]);
    expect(ts.length).toBe(1);
    expect(ts[0]!.sensitiveProximity).toBe(true);
    expect(ts[0]!.fromLocationText).toBeUndefined(); // sensitive 側 元から undefined
    expect(ts[0]!.toLocationText).toBeUndefined();   // redaction 適用
  });

  it("non-sensitive → sensitive → transition、 両 undefined に redact", () => {
    const a = makeEvent({ id: "a", anchorId: "a", locationText: "渋谷" });
    const b = makeEvent({
      id: "b",
      anchorId: "b",
      sensitive: true,
      title: undefined,
      locationText: undefined,
      displayLabel: "予定 (= 医療系)",
    });
    const ts = buildMovementTransitions([a, b]);
    expect(ts.length).toBe(1);
    expect(ts[0]!.sensitiveProximity).toBe(true);
    expect(ts[0]!.fromLocationText).toBeUndefined(); // 元 "渋谷" だが redact
    expect(ts[0]!.toLocationText).toBeUndefined();
  });

  it("sensitive → sensitive (= 両 undefined) → transition なし (= privacy 優先)", () => {
    const a = makeEvent({
      id: "a",
      anchorId: "a",
      sensitive: true,
      title: undefined,
      locationText: undefined,
      displayLabel: "予定 (= 医療系)",
    });
    const b = makeEvent({
      id: "b",
      anchorId: "b",
      sensitive: true,
      title: undefined,
      locationText: undefined,
      displayLabel: "予定 (= 法務系)",
    });
    expect(buildMovementTransitions([a, b])).toEqual([]);
  });
});
