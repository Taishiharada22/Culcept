import { describe, it, expect } from "vitest";
import {
  parseHhmmToMin,
  anchorImportance,
  anchorGovernance,
  anchorSensitive,
  eventNodeToDayNode,
  gapNodeToGapInput,
  detectMode,
  seedToSourceTrace,
  draftItemToSnapshot,
  buildRealityInput,
} from "@/lib/plan/reality/integration/input-adapter";
import { isImmovable, isTentative, hasProtection } from "@/lib/plan/reality/authority";
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
    kind: "event", id: "e1", origin: "explicit", startTime: "09:00", endTime: "10:00", durationMin: 60,
    timeBucket: "morning", anchorId: "a1", displayLabel: "予定", verb: "unknown", rigidity: "hard",
    latencyTolerance: "flexible", durationSource: "explicit", boundaryClipped: false, sensitive: false,
    overlapsWithNodeIds: [], ...p,
  } as unknown as EventNode;
}

function gapNode(p: Record<string, unknown> = {}): GapNode {
  return { kind: "gap", id: "g1", origin: "implicit", startTime: "10:00", endTime: "11:00", durationMin: 60, timeBucket: "morning", sensitiveProximity: false, ...p } as unknown as GapNode;
}

function dayGraph(attrs: Record<string, unknown> = {}, nodes: EventNode[] = []): DayGraph {
  return {
    snapshotId: "snap",
    attributes: { date: "2026-01-01", dayMood: "neutral", anchorCount: nodes.length, verbDistribution: {}, density: "balanced", timeBucketCoverage: [], hasOverlap: false, hasSensitive: false, ...attrs },
    nodes, edges: [], transitions: [],
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
    expect(parseHhmmToMin("23:59")).toBe(1439);
    expect(parseHhmmToMin("24:00")).toBeNull();
    expect(parseHhmmToMin("2026-01-01T09:00:00Z")).toBeNull();
  });
});

describe("input-adapter — 軸の分離（GPT 監査の核心）", () => {
  it("1. sensitive but NOT catastrophic — privacy ≠ importance", () => {
    // 美容院/休息/恋愛 等は sensitive('other') でも soft なら importance normal
    const a = anchor({ rigidity: "soft", sensitiveCategory: "other" });
    expect(anchorImportance(a)).toBe("normal"); // NOT catastrophic
    expect(anchorSensitive(a).sensitive).toBe(true); // privacy フラグは立つ
    // medical でも hint なしなら catastrophic にしない
    expect(anchorImportance(anchor({ rigidity: "soft", sensitiveCategory: "medical" }))).toBe("normal");
    // catastrophic は importanceHint でのみ
    expect(anchorImportance(anchor({ sensitiveCategory: "medical" }), { importanceHint: "catastrophic" })).toBe("catastrophic");
  });

  it("2. user-owned hard — origin user, authority user_owned, locked (immovable)", () => {
    const g = anchorGovernance(anchor({ rigidity: "hard" }), { sourceKind: "user_manual" });
    expect(g).toEqual({ origin: "user", authority: "user_owned", flexibility: "locked", protectionReasons: ["user_declared"] });
    expect(isImmovable(g)).toBe(true); // user_owned ∧ locked
  });

  it("3. imported hard — imported, import_locked, locked, hard_external", () => {
    const g = anchorGovernance(anchor({ rigidity: "hard" })); // default external_import
    expect(g).toEqual({ origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] });
    expect(isImmovable(g)).toBe(true);
  });

  it("4. soft but others/reservation → hard_external (確認必須)", () => {
    const g = anchorGovernance(anchor({ rigidity: "soft" }), { sourceKind: "user_manual", involvesOthers: true });
    expect(g.flexibility).toBe("movable"); // soft = 可動性は movable
    expect(hasProtection(g, "hard_external")).toBe(true); // だが他人絡みで確認必須
    expect(isImmovable(g)).toBe(true); // hard_external → 自動で動かさない
    // reservation も同様
    expect(hasProtection(anchorGovernance(anchor({ rigidity: "soft" }), { sourceKind: "user_manual", reservation: true }), "hard_external")).toBe(true);
  });

  it("user soft (no others/reservation) → movable, user_declared, NOT immovable", () => {
    const g = anchorGovernance(anchor({ rigidity: "soft" }), { sourceKind: "user_manual" });
    expect(g).toEqual({ origin: "user", authority: "user_owned", flexibility: "movable", protectionReasons: ["user_declared"] });
    expect(isImmovable(g)).toBe(false);
    expect(isTentative(g)).toBe(false);
  });
});

describe("input-adapter — DayGraph → DayNode / mode (privacy: 5. raw 漏れなし)", () => {
  it("EventNode → DayNode; importance from rigidity (NOT sensitive)", () => {
    expect(eventNodeToDayNode(eventNode({ rigidity: "hard" }))).toEqual({ id: "e1", startMin: 540, endMin: 600, importance: "high", hard: true });
    // sensitive でも importance は rigidity 由来（soft→normal、critical にしない）
    expect(eventNodeToDayNode(eventNode({ rigidity: "soft", sensitive: true }))?.importance).toBe("normal");
    expect(eventNodeToDayNode(eventNode({ startTime: "bad" }))).toBeNull();
  });
  it("5. DayNode carries no raw title/location (sensitive でも漏れない)", () => {
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
  });
});

describe("input-adapter — buildRealityInput (aggregate, separated axes)", () => {
  it("aggregates dayNodes / per-anchor axes / active seeds", () => {
    const graph = dayGraph({ anchorCount: 1 }, [eventNode({ id: "e1", anchorId: "a1" })]);
    const anchors = [anchor({ id: "a1", rigidity: "hard" }), anchor({ id: "a2", rigidity: "soft" })];
    const seeds = [seed({ id: "s_active", status: "active" }), seed({ id: "s_done", status: "consumed" })];
    const input = buildRealityInput(graph, anchors, seeds, {
      contextOf: (id) => (id === "a2" ? { sourceKind: "user_manual" } : {}),
    });
    expect(input.mode).toBe("complete");
    expect(input.dayNodes).toHaveLength(1);
    expect(input.anchors.a1.governance.authority).toBe("import_locked"); // imported hard
    expect(input.anchors.a2.governance.authority).toBe("user_owned"); // user soft
    expect(input.anchors.a1.importance).toBe("important");
    expect(input.anchors.a1.sensitive).toBe(false);
    expect(input.seedTraces).toHaveLength(1);
    expect(input.seedTraces[0].ref).toBe("s_active");
  });

  it("empty day → build mode", () => {
    expect(buildRealityInput(dayGraph({ anchorCount: 0 }), [], []).mode).toBe("build");
  });
});
