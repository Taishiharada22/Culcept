import { describe, it, expect } from "vitest";
import {
  generateCandidates,
  buildGenerationContext,
  isTouchableForGeneration,
  isPreservedForGeneration,
} from "@/lib/plan/reality/candidate-generator";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";

function gov(p: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return { origin: "user", authority: "user_owned", flexibility: "movable", protectionReasons: ["tentative"], ...p };
}
const IMPORT_LOCKED = gov({ origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] });
const HARD_EXTERNAL = gov({ origin: "imported", authority: "proposed", flexibility: "movable", protectionReasons: ["hard_external"] });
const RECOVERY_MOVABLE = gov({ flexibility: "movable", protectionReasons: ["recovery_core"] });
const PLAIN_MOVABLE = gov({ flexibility: "movable", protectionReasons: ["tentative"] });
const PLAIN_DROPPABLE = gov({ flexibility: "droppable", protectionReasons: ["tentative"] });

function input(p: Partial<RealityInput> = {}): RealityInput {
  return { mode: "repair", dayNodes: [], anchors: {}, seedTraces: [], ...p };
}
function nodeAndAnchor(id: string, governance: PlanItemGovernance, startMin = 540, endMin = 600) {
  return {
    dayNode: { id, startMin, endMin, importance: "normal" as const, hard: false },
    anchor: { governance, importance: "normal" as const, sensitive: false },
  };
}
function ctxOf(id: string, g: PlanItemGovernance) {
  const na = nodeAndAnchor(id, g);
  return buildGenerationContext(input({ dayNodes: [na.dayNode], anchors: { [id]: na.anchor } }));
}

describe("candidate-generator — A1-1 safe no-op（mode 未実装）", () => {
  it("generateCandidates は常に [] を返す", () => {
    expect(generateCandidates(input())).toEqual([]);
    const na = nodeAndAnchor("a", PLAIN_MOVABLE);
    expect(generateCandidates(input({ dayNodes: [na.dayNode], anchors: { a: na.anchor } }))).toEqual([]);
    expect(generateCandidates(input({ seedTraces: [{ kind: "seed", ref: "s", reason: "x", confidence: 0.5 }] }))).toEqual([]);
  });
});

describe("candidate-generator — GenerationContext: dayNode↔anchors.governance join", () => {
  it("node.governance は anchors[id].governance と一致", () => {
    const na = nodeAndAnchor("a", PLAIN_MOVABLE);
    const ctx = buildGenerationContext(input({ mode: "complete", dayNodes: [na.dayNode], anchors: { a: na.anchor } }));
    expect(ctx.nodes).toHaveLength(1);
    expect(ctx.nodes[0].governance).toEqual(PLAIN_MOVABLE);
    expect(ctx.mode).toBe("complete");
  });
  it("anchor governance 欠落 → 保守的 immovable → preserved（fail-closed）", () => {
    const dayNode = { id: "orphan", startMin: 540, endMin: 600, importance: "normal" as const, hard: false };
    const ctx = buildGenerationContext(input({ dayNodes: [dayNode], anchors: {} }));
    expect(ctx.preserved.map((n) => n.id)).toContain("orphan");
    expect(ctx.touchable.map((n) => n.id)).not.toContain("orphan");
  });
});

describe("candidate-generator — contract: 不可侵を勝手に touchable 化しない", () => {
  it("import_locked(immovable) → preserved・非 touchable", () => {
    const ctx = ctxOf("x", IMPORT_LOCKED);
    expect(ctx.preserved.map((n) => n.id)).toEqual(["x"]);
    expect(ctx.touchable).toEqual([]);
  });
  it("hard_external → preserved・非 touchable（movable でも）", () => {
    const ctx = ctxOf("x", HARD_EXTERNAL);
    expect(ctx.preserved.map((n) => n.id)).toEqual(["x"]);
    expect(ctx.touchable).toEqual([]);
  });
  it("recovery_core → preserved・非 touchable（movable でも cut/touch しない）", () => {
    const ctx = ctxOf("x", RECOVERY_MOVABLE);
    expect(ctx.preserved.map((n) => n.id)).toEqual(["x"]);
    expect(ctx.touchable).toEqual([]);
  });
  it("非保護 movable → touchable", () => {
    const ctx = ctxOf("x", PLAIN_MOVABLE);
    expect(ctx.touchable.map((n) => n.id)).toEqual(["x"]);
    expect(ctx.preserved).toEqual([]);
  });
});

describe("candidate-generator — touchable は repairTouchOrder 順（authority 消費）", () => {
  it("droppable が movable より先に並ぶ", () => {
    const a = nodeAndAnchor("mv", PLAIN_MOVABLE);
    const b = nodeAndAnchor("dr", PLAIN_DROPPABLE);
    const ctx = buildGenerationContext(input({ dayNodes: [a.dayNode, b.dayNode], anchors: { mv: a.anchor, dr: b.anchor } }));
    expect(ctx.touchable.map((n) => n.id)).toEqual(["dr", "mv"]); // droppable(0) → movable(2)
  });
});

describe("candidate-generator — authority 消費の整合 + goals", () => {
  it("isTouchableForGeneration === !isPreservedForGeneration（補集合）", () => {
    for (const g of [IMPORT_LOCKED, HARD_EXTERNAL, RECOVERY_MOVABLE, PLAIN_MOVABLE, PLAIN_DROPPABLE]) {
      expect(isTouchableForGeneration(g)).toBe(!isPreservedForGeneration(g));
    }
  });
  it("goals は kind=seed の trace のみ抽出", () => {
    const seed: SourceTrace = { kind: "seed", ref: "s1", reason: "カフェ", confidence: 0.7 };
    const prm: SourceTrace = { kind: "prm", ref: "p1", reason: "x", confidence: 0.5 };
    const ctx = buildGenerationContext(input({ seedTraces: [seed, prm] }));
    expect(ctx.goals.seeds).toEqual([seed]);
  });
});
