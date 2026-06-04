import { describe, it, expect } from "vitest";
import {
  generateCandidates,
  buildGenerationContext,
  isTouchableForGeneration,
  isPreservedForGeneration,
} from "@/lib/plan/reality/candidate-generator";
import { evaluateCandidate } from "@/lib/plan/reality/candidate-evaluator";
import { rankCandidates } from "@/lib/plan/reality/best-action";
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

// ── A1-3-R1a: Repair overlap trim-only ──

function repairInput(specs: Array<{ id: string; startMin: number; endMin: number; governance: PlanItemGovernance }>): RealityInput {
  const dayNodes = specs.map((s) => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, importance: "normal" as const, hard: false }));
  const anchors: RealityInput["anchors"] = {};
  for (const s of specs) anchors[s.id] = { governance: s.governance, importance: "normal", sensitive: false };
  return { mode: "repair", dayNodes, anchors, seedTraces: [] };
}

describe("candidate-generator — A1-3-R1a Repair trim-only（生成）", () => {
  it("earlier=lower-priority(droppable) と later(movable) の重複 → A の end を B.start へ trim（1件・update のみ）", () => {
    const drafts = generateCandidates(repairInput([
      { id: "a", startMin: 540, endMin: 620, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 600, endMin: 660, governance: PLAIN_MOVABLE },
    ]));
    expect(drafts).toHaveLength(1);
    const d = drafts[0];
    expect("metrics" in d).toBe(false); // CandidateDraft（metrics 持たない）
    expect(d.changeSet.ops).toHaveLength(1);
    const op = d.changeSet.ops[0];
    expect(op.kind).toBe("update");
    expect(op.itemId).toBe("a"); // A のみ touch（B 不変）
    if (op.kind === "update") {
      expect(op.before).toMatchObject({ itemId: "a", startMin: 540, endMin: 620 });
      expect(op.after).toMatchObject({ itemId: "a", startMin: 540, endMin: 600 }); // start 固定・end のみ短縮
    }
  });

  it("重複なし → no candidate", () => {
    expect(generateCandidates(repairInput([
      { id: "a", startMin: 540, endMin: 600, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 660, endMin: 720, governance: PLAIN_MOVABLE },
    ]))).toEqual([]);
  });
  it("earlier が preserved(recovery) → no candidate（不可侵を切らない）", () => {
    expect(generateCandidates(repairInput([
      { id: "a", startMin: 540, endMin: 620, governance: RECOVERY_MOVABLE },
      { id: "b", startMin: 600, endMin: 660, governance: PLAIN_MOVABLE },
    ]))).toEqual([]);
  });
  it("両 touchable で優先度が同じ → no candidate（推測しない）", () => {
    expect(generateCandidates(repairInput([
      { id: "a", startMin: 540, endMin: 620, governance: PLAIN_MOVABLE },
      { id: "b", startMin: 600, endMin: 660, governance: PLAIN_MOVABLE },
    ]))).toEqual([]);
  });
  it("包含（A が B を完全包含）→ no candidate（defer）", () => {
    expect(generateCandidates(repairInput([
      { id: "a", startMin: 540, endMin: 700, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 600, endMin: 660, governance: PLAIN_MOVABLE },
    ]))).toEqual([]);
  });
  it("trim 後 duration ≤ 0（同 start）→ no candidate", () => {
    expect(generateCandidates(repairInput([
      { id: "a", startMin: 600, endMin: 660, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 600, endMin: 680, governance: PLAIN_MOVABLE },
    ]))).toEqual([]);
  });
  it("later が preserved・earlier が touchable → earlier のみ trim（preserved 不変）", () => {
    const drafts = generateCandidates(repairInput([
      { id: "a", startMin: 540, endMin: 620, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 600, endMin: 660, governance: RECOVERY_MOVABLE },
    ]));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].changeSet.ops[0].itemId).toBe("a");
  });
  it("mode が repair でない → no candidate", () => {
    const inp = repairInput([
      { id: "a", startMin: 540, endMin: 620, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 600, endMin: 660, governance: PLAIN_MOVABLE },
    ]);
    expect(generateCandidates({ ...inp, mode: "complete" })).toEqual([]);
  });
});

describe("candidate-generator — A1-3-R1a pipeline（generate→evaluate→rank・Gate-first）", () => {
  it("生成 trim 候補は safe で best / unsafe を並べても trim が best", () => {
    const inp = repairInput([
      { id: "a", startMin: 540, endMin: 620, governance: PLAIN_DROPPABLE },
      { id: "b", startMin: 600, endMin: 660, governance: PLAIN_MOVABLE },
    ]);
    const drafts = generateCandidates(inp);
    expect(drafts).toHaveLength(1);
    const cand = evaluateCandidate(drafts[0], buildGenerationContext(inp));
    expect(cand.metrics.feasible).toBe(true);
    expect(cand.metrics.recoveryProtected).toBe(true);
    expect(cand.metrics.deadlineSatisfied).toBe(true);
    expect(cand.metrics.wholePartCoherent).toBe(true);
    expect(rankCandidates([cand]).best?.candidate.id).toBe(cand.id);
    const unsafe = { ...cand, id: "unsafe", metrics: { ...cand.metrics, feasible: false } };
    expect(rankCandidates([cand, unsafe]).best?.candidate.id).toBe(cand.id);
  });
});
