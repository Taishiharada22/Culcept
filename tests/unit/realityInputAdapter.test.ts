import { describe, it, expect } from "vitest";
import {
  parseHhmmToMin,
  anchorImportance,
  anchorGovernance,
  eventNodeToDayNode,
  gapNodeToGapInput,
  detectMode,
  seedToSourceTrace,
  draftItemToSnapshot,
  buildRealityInput,
} from "@/lib/plan/reality/integration/input-adapter";
import { isImmovable, isTentative } from "@/lib/plan/reality/authority";
import type { ExternalAnchor, OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayGraph, EventNode, GapNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { PlanSeed } from "@/lib/plan/plan-seed";
import type { DraftPlanItem } from "@/lib/plan/draft-plan";

function anchor(p: Partial<OneOffExternalAnchor> = {}): ExternalAnchor {
  return {
    id: "a1",
    userId: "u",
    title: "会議",
    startTime: "09:00",
    endTime: "10:00",
    rigidity: "hard",
    sourceId: "s",
    confirmedAt: "2026-01-01T00:00:00Z",
    anchorKind: "one_off",
    date: "2026-01-01",
    ...p,
  } as OneOffExternalAnchor;
}

function eventNode(p: Record<string, unknown> = {}): EventNode {
  return {
    kind: "event",
    id: "e1",
    origin: "explicit",
    startTime: "09:00",
    endTime: "10:00",
    durationMin: 60,
    timeBucket: "morning",
    anchorId: "a1",
    displayLabel: "予定",
    verb: "unknown",
    rigidity: "hard",
    latencyTolerance: "flexible",
    durationSource: "explicit",
    boundaryClipped: false,
    sensitive: false,
    overlapsWithNodeIds: [],
    ...p,
  } as unknown as EventNode;
}

function gapNode(p: Record<string, unknown> = {}): GapNode {
  return { kind: "gap", id: "g1", origin: "implicit", startTime: "10:00", endTime: "11:00", durationMin: 60, timeBucket: "morning", sensitiveProximity: false, ...p } as unknown as GapNode;
}

function dayGraph(attrs: Record<string, unknown> = {}, nodes: EventNode[] = []): DayGraph {
  return {
    snapshotId: "snap",
    attributes: { date: "2026-01-01", dayMood: "neutral", anchorCount: nodes.length, verbDistribution: {}, density: "balanced", timeBucketCoverage: [], hasOverlap: false, hasSensitive: false, ...attrs },
    nodes,
    edges: [],
    transitions: [],
  } as unknown as DayGraph;
}

function seed(p: Partial<PlanSeed> = {}): PlanSeed {
  return { id: "seed1", userId: "u", signal: "raw text", desiredAction: "企画を進める", confidence: 0.8, status: "active", source: "chat", capturedAt: "2026-01-01T00:00:00Z", ...p } as PlanSeed;
}

function draftItem(p: Partial<DraftPlanItem> = {}): DraftPlanItem {
  return { id: "d1", startTime: "09:00", endTime: "10:00", title: "T", origin: "seed", rigidity: "soft", confidence: 0.7, ...p } as DraftPlanItem;
}

describe("input-adapter — parseHhmmToMin", () => {
  it("parses HH:MM, rejects out-of-range / ISO", () => {
    expect(parseHhmmToMin("09:30")).toBe(570);
    expect(parseHhmmToMin("00:00")).toBe(0);
    expect(parseHhmmToMin("23:59")).toBe(1439);
    expect(parseHhmmToMin("24:00")).toBeNull();
    expect(parseHhmmToMin("9:5")).toBeNull();
    expect(parseHhmmToMin("2026-01-01T09:00:00Z")).toBeNull();
  });
});

describe("input-adapter — ExternalAnchor → governance / importance", () => {
  it("hard → import_locked/locked/hard_external (immovable)", () => {
    const g = anchorGovernance(anchor({ rigidity: "hard" }));
    expect(g).toEqual({ origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] });
    expect(isImmovable(g)).toBe(true);
  });
  it("soft non-sensitive → user_owned/movable/user_declared (movable, not tentative)", () => {
    const g = anchorGovernance(anchor({ rigidity: "soft" }));
    expect(g).toEqual({ origin: "imported", authority: "user_owned", flexibility: "movable", protectionReasons: ["user_declared"] });
    expect(isImmovable(g)).toBe(false);
    expect(isTentative(g)).toBe(false);
  });
  it("sensitive (even soft) → hard_external (protected)", () => {
    const g = anchorGovernance(anchor({ rigidity: "soft", sensitiveCategory: "medical" }));
    expect(g.protectionReasons).toContain("hard_external");
    expect(isImmovable(g)).toBe(true);
  });
  it("importance: hard→important, soft→normal, medical/exam/legal→catastrophic", () => {
    expect(anchorImportance(anchor({ rigidity: "hard" }))).toBe("important");
    expect(anchorImportance(anchor({ rigidity: "soft" }))).toBe("normal");
    expect(anchorImportance(anchor({ sensitiveCategory: "exam" }))).toBe("catastrophic");
  });
});

describe("input-adapter — DayGraph → DayNode / mode (privacy: no raw title)", () => {
  it("EventNode → DayNode; sensitive→critical, hard→high; bad time→null", () => {
    expect(eventNodeToDayNode(eventNode({ rigidity: "hard" }))).toEqual({ id: "e1", startMin: 540, endMin: 600, importance: "high", hard: true });
    expect(eventNodeToDayNode(eventNode({ rigidity: "soft", sensitive: true }))?.importance).toBe("critical");
    expect(eventNodeToDayNode(eventNode({ startTime: "bad" }))).toBeNull();
  });
  it("DayNode carries no raw title/location (structurally privacy-safe)", () => {
    const n = eventNodeToDayNode(eventNode({ sensitive: true }));
    expect(Object.keys(n ?? {}).sort()).toEqual(["endMin", "hard", "id", "importance", "startMin"]);
  });
  it("detectMode: empty→build, overlap→repair, packed→optimize, sparse→complete", () => {
    expect(detectMode(dayGraph({ anchorCount: 0 }))).toBe("build");
    expect(detectMode(dayGraph({ anchorCount: 2, hasOverlap: true }))).toBe("repair");
    expect(detectMode(dayGraph({ anchorCount: 5, density: "packed" }))).toBe("optimize");
    expect(detectMode(dayGraph({ anchorCount: 1, density: "sparse" }))).toBe("complete");
  });
  it("gapNodeToGapInput reads gap length + context", () => {
    const gi = gapNodeToGapInput(gapNode({ durationMin: 90 }), { nextTravelMin: 20, isBeforeImportant: false, inMealWindow: true, recoveryNeed: 0.2, energy: 0.6 });
    expect(gi.gapLengthMin).toBe(90);
    expect(gi.nextTravelMin).toBe(20);
  });
});

describe("input-adapter — PlanSeed / DraftPlanItem", () => {
  it("seed → SourceTrace (structured desiredAction, not raw signal)", () => {
    const t = seedToSourceTrace(seed({ signal: "RAW USER TEXT", desiredAction: "企画を進める" }));
    expect(t).toEqual({ kind: "seed", ref: "seed1", reason: "企画を進める", confidence: 0.8 });
    expect(t.reason).not.toContain("RAW");
  });
  it("draft item → tentative proposed snapshot", () => {
    const s = draftItemToSnapshot(draftItem({ origin: "seed", rigidity: "soft" }));
    expect(s.governance).toEqual({ origin: "alter_generated", authority: "proposed", flexibility: "movable", protectionReasons: ["tentative"] });
    expect(isTentative(s.governance!)).toBe(true);
    expect(s.startMin).toBe(540);
  });
});

describe("input-adapter — buildRealityInput (aggregate)", () => {
  it("aggregates dayNodes / governance / importance / active seeds", () => {
    const graph = dayGraph({ anchorCount: 1 }, [eventNode({ id: "e1", anchorId: "a1" })]);
    const anchors = [anchor({ id: "a1", rigidity: "hard" }), anchor({ id: "a2", rigidity: "soft" })];
    const seeds = [seed({ id: "s_active", status: "active" }), seed({ id: "s_done", status: "consumed" })];
    const input = buildRealityInput(graph, anchors, seeds);
    expect(input.mode).toBe("complete"); // balanced, anchorCount 1
    expect(input.dayNodes).toHaveLength(1);
    expect(input.anchorGovernance.a1.authority).toBe("import_locked");
    expect(input.anchorGovernance.a2.authority).toBe("user_owned");
    expect(input.anchorImportance.a1).toBe("important");
    expect(input.seedTraces).toHaveLength(1); // only active
    expect(input.seedTraces[0].ref).toBe("s_active");
  });

  it("empty day → build mode", () => {
    expect(buildRealityInput(dayGraph({ anchorCount: 0 }), [], []).mode).toBe("build");
  });
});
