/**
 * Phase 3-K K-1c — GapNode generation tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.4 / §6.4
 *
 * 検証範囲:
 *   - empty day: start + 1 large gap + end
 *   - 通常 gap 生成
 *   - minGapMinutes 未満は skip
 *   - overlap event は running max endTime で集約
 *   - sensitiveProximity 集約
 *   - duration <= 0 は skip
 */

import { describe, expect, it } from "vitest";

import { buildGapNodes } from "@/lib/plan/dayGraph/gapNodes";
import { buildEndNode, buildStartNode } from "@/lib/plan/dayGraph/startEndNodes";
import type { EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATE = "2026-05-22";

function makeEventNode(overrides: Partial<EventNode> = {}): EventNode {
  return {
    id: "anchor_a",
    kind: "event",
    origin: "explicit",
    startTime: "14:00",
    endTime: "15:00",
    durationMin: 60,
    timeBucket: "afternoon",
    anchorId: "anchor_a",
    displayLabel: "test",
    title: "test",
    verb: "unknown",
    rigidity: "soft",
    latencyTolerance: "flexible",
    sensitive: false,
    overlapsWithNodeIds: [],
    ...overrides,
  };
}

const START = buildStartNode({ date: DATE });
const END = buildEndNode({ date: DATE });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Empty day (= GPT 補正 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGapNodes — empty day", () => {
  it("anchor 0 件 → start + 1 large gap + end", () => {
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.startTime).toBe("06:00");
    expect(gaps[0]!.endTime).toBe("23:00");
    expect(gaps[0]!.durationMin).toBe(17 * 60);
    expect(gaps[0]!.origin).toBe("implicit");
    expect(gaps[0]!.sensitiveProximity).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 通常 gap 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGapNodes — 通常パターン", () => {
  it("1 event → start→event の gap + event→end の gap (= 2 gaps)", () => {
    const ev = makeEventNode({ startTime: "14:00", endTime: "15:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [ev],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    expect(gaps.length).toBe(2);
    expect(gaps[0]!.startTime).toBe("06:00");
    expect(gaps[0]!.endTime).toBe("14:00");
    expect(gaps[0]!.durationMin).toBe(8 * 60);
    expect(gaps[1]!.startTime).toBe("15:00");
    expect(gaps[1]!.endTime).toBe("23:00");
    expect(gaps[1]!.durationMin).toBe(8 * 60);
  });

  it("2 events 間に gap (= 大 / 小)", () => {
    const e1 = makeEventNode({ id: "e1", anchorId: "e1", startTime: "10:00", endTime: "11:00" });
    const e2 = makeEventNode({ id: "e2", anchorId: "e2", startTime: "14:00", endTime: "15:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [e1, e2],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    // start→e1 + e1→e2 + e2→end = 3 gaps
    expect(gaps.length).toBe(3);
    expect(gaps[1]!.startTime).toBe("11:00");
    expect(gaps[1]!.endTime).toBe("14:00");
    expect(gaps[1]!.durationMin).toBe(3 * 60);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// minGapMinutes 未満は skip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGapNodes — minGapMinutes 閾値", () => {
  it("5 分 gap は default 30 分で skip", () => {
    const e1 = makeEventNode({ id: "e1", anchorId: "e1", startTime: "14:00", endTime: "15:00" });
    const e2 = makeEventNode({ id: "e2", anchorId: "e2", startTime: "15:05", endTime: "16:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [e1, e2],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    // start→e1 (8h) + e2→end (7h) = 2 gaps (e1→e2 は 5min で skip)
    expect(gaps.length).toBe(2);
    expect(gaps[0]!.startTime).toBe("06:00");
    expect(gaps[1]!.startTime).toBe("16:00");
  });

  it("minGapMinutes=10 にすれば 11 分 gap も含まれる", () => {
    const e1 = makeEventNode({ id: "e1", anchorId: "e1", startTime: "14:00", endTime: "15:00" });
    const e2 = makeEventNode({ id: "e2", anchorId: "e2", startTime: "15:11", endTime: "16:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [e1, e2],
      endNode: END,
      date: DATE,
      minGapMinutes: 10,
    });
    expect(gaps.length).toBe(3);
  });

  it("0 分 gap (= 連続) は skip", () => {
    const e1 = makeEventNode({ id: "e1", anchorId: "e1", startTime: "14:00", endTime: "15:00" });
    const e2 = makeEventNode({ id: "e2", anchorId: "e2", startTime: "15:00", endTime: "16:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [e1, e2],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    // start→e1 + e2→end (= 2 gaps、 e1→e2 0 分で skip)
    expect(gaps.length).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// overlap event の running max endTime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGapNodes — overlap event は running max で集約", () => {
  it("overlap 2 events → 1 block 扱い", () => {
    const e1 = makeEventNode({ id: "e1", anchorId: "e1", startTime: "14:00", endTime: "16:00" });
    const e2 = makeEventNode({ id: "e2", anchorId: "e2", startTime: "15:00", endTime: "15:30" }); // overlap
    const e3 = makeEventNode({ id: "e3", anchorId: "e3", startTime: "17:00", endTime: "18:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [e1, e2, e3],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    // start→e1 (8h) + 16:00→17:00 (1h) + e3→end (5h) = 3 gaps
    expect(gaps.length).toBe(3);
    expect(gaps[1]!.startTime).toBe("16:00");
    expect(gaps[1]!.endTime).toBe("17:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sensitiveProximity 集約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGapNodes — sensitiveProximity", () => {
  it("非 sensitive event → sensitiveProximity=false", () => {
    const ev = makeEventNode({ startTime: "14:00", endTime: "15:00", sensitive: false });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [ev],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    expect(gaps[0]!.sensitiveProximity).toBe(false);
    expect(gaps[1]!.sensitiveProximity).toBe(false);
  });

  it("sensitive event 前後 gap → sensitiveProximity=true", () => {
    const ev = makeEventNode({
      startTime: "14:00",
      endTime: "15:00",
      sensitive: true,
      title: undefined,
      locationText: undefined,
      displayLabel: "予定 (= 医療系)",
      sensitiveCategory: "medical",
    });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [ev],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    expect(gaps[0]!.sensitiveProximity).toBe(true); // start→sens
    expect(gaps[1]!.sensitiveProximity).toBe(true); // sens→end
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// timeBucket / id format
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGapNodes — id + timeBucket", () => {
  it("id は ${date}_gap_${order}", () => {
    const ev = makeEventNode({ startTime: "14:00", endTime: "15:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [ev],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    expect(gaps[0]!.id).toBe(`${DATE}_gap_0`);
    expect(gaps[1]!.id).toBe(`${DATE}_gap_1`);
  });

  it("timeBucket は gap startTime ベース", () => {
    const ev = makeEventNode({ startTime: "14:00", endTime: "15:00" });
    const gaps = buildGapNodes({
      startNode: START,
      eventNodes: [ev],
      endNode: END,
      date: DATE,
      minGapMinutes: 30,
    });
    expect(gaps[0]!.timeBucket).toBe("early_morning"); // 06:00 start
    expect(gaps[1]!.timeBucket).toBe("afternoon"); // 15:00 start
  });
});
