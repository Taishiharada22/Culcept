/**
 * Phase 3-K K-1d — Attributes + View perspective tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.6 / §10 / §22.4
 *
 * 検証範囲:
 *   - computeDayGraphAttributes: verbDistribution / density / coverage / flags
 *   - inferDayMood 統合
 *   - viewForUser / viewForShared / applyDayGraphView
 *   - sensitive event の shared_view 置換
 *   - graph mutation 不可
 */

import { describe, expect, it } from "vitest";

import { computeDayGraphAttributes } from "@/lib/plan/dayGraph/dayGraphAttributes";
import {
  applyDayGraphView,
  viewForShared,
  viewForUser,
} from "@/lib/plan/dayGraph/dayGraphView";
import type {
  DayGraph,
  DayGraphAttributes,
  EventNode,
} from "@/lib/plan/dayGraph/dayGraphTypes";
import { buildEndNode, buildStartNode } from "@/lib/plan/dayGraph/startEndNodes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATE = "2026-05-22";

function makeAnchor(overrides: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: "a",
    userId: "u",
    title: "test",
    startTime: "14:00",
    endTime: "15:00",
    rigidity: "soft",
    sourceId: "s",
    confirmedAt: "2026-05-22T10:00:00.000Z",
    anchorKind: "one_off",
    date: DATE,
    ...overrides,
  } as ExternalAnchor;
}

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
// computeDayGraphAttributes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeDayGraphAttributes — empty + light + heavy", () => {
  it("empty: anchorCount=0, density=sparse, dayMood=recovery", () => {
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: [],
    });
    expect(attr.date).toBe(DATE);
    expect(attr.anchorCount).toBe(0);
    expect(attr.density).toBe("sparse");
    expect(attr.dayMood).toBe("recovery");
    expect(attr.hasOverlap).toBe(false);
    expect(attr.hasSensitive).toBe(false);
    expect(attr.timeBucketCoverage.length).toBe(0); // v1.2 §22.9 Array
  });

  it("1 anchor: density=sparse, dayMood=light", () => {
    const anchor = makeAnchor();
    const ev = makeEvent({ verb: "eat" });
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [anchor],
      eventNodes: [ev],
    });
    expect(attr.anchorCount).toBe(1);
    expect(attr.density).toBe("sparse");
    expect(attr.dayMood).toBe("light");
    expect(attr.verbDistribution.eat).toBe(1);
  });

  it("3 anchors: density=balanced", () => {
    const anchors = [
      makeAnchor({ id: "a", title: "test a" }),
      makeAnchor({ id: "b", title: "test b" }),
      makeAnchor({ id: "c", title: "test c" }),
    ];
    const evs = [
      makeEvent({ id: "a", anchorId: "a" }),
      makeEvent({ id: "b", anchorId: "b" }),
      makeEvent({ id: "c", anchorId: "c" }),
    ];
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors,
      eventNodes: evs,
    });
    expect(attr.anchorCount).toBe(3);
    expect(attr.density).toBe("balanced");
  });

  it("4+ anchors: density=packed", () => {
    const evs = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: `e${i}`, anchorId: `e${i}` }),
    );
    const anchors = evs.map((_, i) => makeAnchor({ id: `e${i}`, title: `t${i}` }));
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors,
      eventNodes: evs,
    });
    expect(attr.anchorCount).toBe(5);
    expect(attr.density).toBe("packed");
  });

  it("dayMood heavy: 5+ anchors", () => {
    const anchors = Array.from({ length: 5 }, (_, i) => makeAnchor({ id: `a${i}` }));
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors,
      eventNodes: [],
    });
    expect(attr.dayMood).toBe("heavy");
  });
});

describe("computeDayGraphAttributes — verbDistribution", () => {
  it("AnchorVerb 全 7 値が key として存在 (= v1.1 §22.4)", () => {
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: [],
    });
    expect(attr.verbDistribution.eat).toBe(0);
    expect(attr.verbDistribution.work).toBe(0);
    expect(attr.verbDistribution.rest).toBe(0);
    expect(attr.verbDistribution.move).toBe(0);
    expect(attr.verbDistribution.care).toBe(0);
    expect(attr.verbDistribution.social).toBe(0);
    expect(attr.verbDistribution.unknown).toBe(0);
  });

  it("多様 verb の count 集計", () => {
    const evs = [
      makeEvent({ id: "e1", anchorId: "e1", verb: "eat" }),
      makeEvent({ id: "e2", anchorId: "e2", verb: "eat" }),
      makeEvent({ id: "e3", anchorId: "e3", verb: "work" }),
      makeEvent({ id: "e4", anchorId: "e4", verb: "unknown" }),
    ];
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: evs,
    });
    expect(attr.verbDistribution.eat).toBe(2);
    expect(attr.verbDistribution.work).toBe(1);
    expect(attr.verbDistribution.unknown).toBe(1);
    expect(attr.verbDistribution.move).toBe(0);
  });
});

describe("computeDayGraphAttributes — timeBucketCoverage + flags", () => {
  it("複数帯にまたがる event → coverage に全帯", () => {
    const evs = [
      makeEvent({ id: "morning", anchorId: "m", timeBucket: "morning" }),
      makeEvent({ id: "noon", anchorId: "n", timeBucket: "noon" }),
      makeEvent({ id: "evening", anchorId: "ev", timeBucket: "evening" }),
    ];
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: evs,
    });
    expect(attr.timeBucketCoverage.length).toBe(3);
    expect(attr.timeBucketCoverage).toContain("morning");
    expect(attr.timeBucketCoverage).toContain("noon");
    expect(attr.timeBucketCoverage).toContain("evening");
    // K-1f-β: canonical order (= morning, noon, evening は順序固定)
    expect(attr.timeBucketCoverage).toEqual(["morning", "noon", "evening"]);
  });

  it("K-1f-β: timeBucketCoverage は canonical order (= early_morning → late_night)", () => {
    const evs = [
      makeEvent({ id: "n", anchorId: "n", timeBucket: "night" }),
      makeEvent({ id: "m", anchorId: "m", timeBucket: "morning" }),
      makeEvent({ id: "e", anchorId: "e", timeBucket: "early_morning" }),
      makeEvent({ id: "a", anchorId: "a", timeBucket: "afternoon" }),
    ];
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: evs,
    });
    // input 順 (night, morning, early_morning, afternoon) ではなく canonical 順
    expect(attr.timeBucketCoverage).toEqual([
      "early_morning",
      "morning",
      "afternoon",
      "night",
    ]);
  });

  it("hasOverlap: overlapsWithNodeIds 非空 → true", () => {
    const evs = [makeEvent({ overlapsWithNodeIds: ["other"] })];
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: evs,
    });
    expect(attr.hasOverlap).toBe(true);
  });

  it("hasSensitive: sensitive true → true", () => {
    const evs = [
      makeEvent({
        sensitive: true,
        title: undefined,
        locationText: undefined,
        displayLabel: "予定 (= 医療系)",
      }),
    ];
    const attr = computeDayGraphAttributes({
      date: DATE,
      anchors: [],
      eventNodes: evs,
    });
    expect(attr.hasSensitive).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// View perspective
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeGraphWithSensitive(): DayGraph {
  const start = buildStartNode({ date: DATE });
  const sensEv = makeEvent({
    id: "sens",
    anchorId: "sens",
    sensitive: true,
    title: undefined,
    locationText: undefined,
    displayLabel: "予定 (= 医療系)",
    sensitiveCategory: "medical",
  });
  const normalEv = makeEvent({
    id: "normal",
    anchorId: "normal",
    startTime: "16:00",
    endTime: "17:00",
    displayLabel: "カフェ",
    title: "カフェ",
    locationText: "渋谷",
  });
  const end = buildEndNode({ date: DATE });
  const attributes: DayGraphAttributes = {
    date: DATE,
    dayMood: "light",
    anchorCount: 2,
    verbDistribution: { eat: 0, work: 0, rest: 0, move: 0, care: 0, social: 0, unknown: 2 },
    density: "balanced",
    timeBucketCoverage: ["afternoon"], // v1.2 §22.9 Array
    hasOverlap: false,
    hasSensitive: true,
  };
  return {
    snapshotId: `daygraph:v1:${DATE}:sens,normal:06:00-23:00:gap30`,
    attributes,
    nodes: [start, sensEv, normalEv, end],
    edges: [
      { fromNodeId: start.id, toNodeId: sensEv.id, kind: "sequential" },
      { fromNodeId: sensEv.id, toNodeId: normalEv.id, kind: "sequential" },
      { fromNodeId: normalEv.id, toNodeId: end.id, kind: "sequential" },
    ],
    transitions: [],
  };
}

describe("viewForUser", () => {
  it("graph をそのまま返す (= displayLabel 既に安全)", () => {
    const g = makeGraphWithSensitive();
    const result = viewForUser(g);
    expect(result).toBe(g); // 参照同一
  });
});

describe("viewForShared — sensitive event の displayLabel 置換", () => {
  it("sensitive event → displayLabel='予定' + sensitiveCategory undefined", () => {
    const g = makeGraphWithSensitive();
    const shared = viewForShared(g);
    const sens = shared.nodes.find((n) => n.id === "sens");
    expect(sens).toBeDefined();
    if (sens && sens.kind === "event") {
      expect(sens.displayLabel).toBe("予定");
      expect(sens.sensitiveCategory).toBeUndefined();
    }
  });

  it("非 sensitive event は不変", () => {
    const g = makeGraphWithSensitive();
    const shared = viewForShared(g);
    const normal = shared.nodes.find((n) => n.id === "normal");
    if (normal && normal.kind === "event") {
      expect(normal.displayLabel).toBe("カフェ");
      expect(normal.title).toBe("カフェ");
    }
  });

  it("StartNode / EndNode は不変", () => {
    const g = makeGraphWithSensitive();
    const shared = viewForShared(g);
    const start = shared.nodes.find((n) => n.kind === "start");
    const end = shared.nodes.find((n) => n.kind === "end");
    expect(start).toBeDefined();
    expect(end).toBeDefined();
  });

  it("graph 自体を mutate しない (= 新 object 返す)", () => {
    const g = makeGraphWithSensitive();
    const before = JSON.stringify(g);
    viewForShared(g);
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe("applyDayGraphView — enum dispatch", () => {
  it("user_self → viewForUser", () => {
    const g = makeGraphWithSensitive();
    expect(applyDayGraphView(g, "user_self")).toBe(g);
  });

  it("shared_view → viewForShared", () => {
    const g = makeGraphWithSensitive();
    const r = applyDayGraphView(g, "shared_view");
    const sens = r.nodes.find((n) => n.id === "sens");
    if (sens && sens.kind === "event") {
      expect(sens.displayLabel).toBe("予定");
    }
  });
});
