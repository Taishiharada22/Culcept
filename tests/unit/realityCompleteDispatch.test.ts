import { describe, it, expect } from "vitest";
import { generateCandidates, type GenerationContext } from "@/lib/plan/reality/candidate-generator";
import { buildSeedPlacements } from "@/lib/plan/reality/seed-placement";
import { evaluateCandidate } from "@/lib/plan/reality/candidate-evaluator";
import { rankCandidates } from "@/lib/plan/reality/best-action";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import type { PlanSeed } from "@/lib/plan/plan-seed";

function gov(p: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return { origin: "user", authority: "user_owned", flexibility: "movable", protectionReasons: ["tentative"], ...p };
}

function seed(over: Partial<PlanSeed> & { id: string }): PlanSeed {
  const base: PlanSeed = {
    id: over.id,
    userId: "u1",
    signal: "生の発話テキスト(raw)",
    confidence: 0.9,
    status: "active",
    source: "chat",
    capturedAt: "2026-06-05T00:00:00Z",
  };
  return { ...base, ...over };
}

type ExistingSpec = { id: string; startMin: number; endMin: number };

/** mode=complete の RealityInput（既存ノードは dayNodes・anchors 空→immovable 既定）。 */
function completeRealityInput(existing: readonly ExistingSpec[]): RealityInput {
  const dayNodes = existing.map((s) => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, importance: "normal" as const, hard: false }));
  return { mode: "complete", dayNodes, anchors: {}, seedTraces: [] };
}

/** evaluate 用の GenerationContext（既存ノードを GovernedNode 化）。 */
function ctxOf(existing: readonly ExistingSpec[]): GenerationContext {
  const nodes = existing.map((s) => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, importance: "normal" as const, hard: false, governance: gov() }));
  return { mode: "complete", nodes, touchable: [], preserved: [], goals: { seeds: [] } };
}

describe("A1-4-4a Complete dispatcher — generateCandidates の Complete 分岐", () => {
  it("Repair 既存挙動 不変: 重複 droppable<movable → trim candidate（completeInput なし）", () => {
    const input: RealityInput = {
      mode: "repair",
      dayNodes: [
        { id: "a", startMin: 540, endMin: 620, importance: "normal", hard: false },
        { id: "b", startMin: 600, endMin: 660, importance: "normal", hard: false },
      ],
      anchors: {
        a: { governance: gov({ flexibility: "droppable" }), importance: "normal", sensitive: false },
        b: { governance: gov({ flexibility: "movable" }), importance: "normal", sensitive: false },
      },
      seedTraces: [],
    };
    const drafts = generateCandidates(input);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].changeSet.ops[0].kind).toBe("update"); // trim（add でない）
  });

  it("Complete mode + completeInput なし → 候補 0", () => {
    expect(generateCandidates(completeRealityInput([{ id: "a", startMin: 540, endMin: 600 }]))).toHaveLength(0);
  });

  it("Complete mode + duration null placement（evidence なし）→ 候補 0", () => {
    const placements = buildSeedPlacements([seed({ id: "p1", actionShape: "full_go", confidence: 0.9 })]);
    const drafts = generateCandidates(completeRealityInput([{ id: "a", startMin: 540, endMin: 600 }]), undefined, {
      seedPlacements: placements,
      activeWindow: { startMin: 540, endMin: 720 },
    });
    expect(drafts).toHaveLength(0);
  });

  it("Complete mode + correction high evidence → Complete candidate（add op・end-to-end）", () => {
    const placements = buildSeedPlacements([seed({ id: "p1", actionShape: "full_go", confidence: 0.9 })]);
    const existing: ExistingSpec[] = [{ id: "a", startMin: 540, endMin: 600 }];
    const drafts = generateCandidates(completeRealityInput(existing), undefined, {
      seedPlacements: placements,
      durationEvidences: [{ seedRef: "p1", durationMin: 60, source: "correction", confidence: "high" }],
      activeWindow: { startMin: 540, endMin: 720 },
    });
    expect(drafts).toHaveLength(1);
    const op = drafts[0].changeSet.ops[0];
    expect(op.kind).toBe("add");
    if (op.kind === "add") {
      expect(op.after.startMin).toBe(600); // gap [600,720] 先頭
      expect(op.after.endMin).toBe(660); // 600 + 60
    }
    // evaluate + rank（test 内検証のみ）
    const candidate = evaluateCandidate(drafts[0], ctxOf(existing));
    expect(candidate.metrics.feasible).toBe(true);
    expect(candidate.metrics.recoveryProtected).toBe(true);
    expect(candidate.metrics.deadlineSatisfied).toBe(true);
    expect(candidate.metrics.wholePartCoherent).toBe(true);
    expect(rankCandidates([candidate]).best?.candidate.id).toBe(drafts[0].id);
  });

  it("Complete mode + seed_explicit high evidence → Complete candidate", () => {
    const placements = buildSeedPlacements([seed({ id: "p1", actionShape: "full_go", confidence: 0.9 })]);
    const drafts = generateCandidates(completeRealityInput([{ id: "a", startMin: 540, endMin: 600 }]), undefined, {
      seedPlacements: placements,
      durationEvidences: [{ seedRef: "p1", durationMin: 60, source: "seed_explicit", confidence: "high" }],
      activeWindow: { startMin: 540, endMin: 720 },
    });
    expect(drafts).toHaveLength(1);
  });

  it("Complete mode + prm_typical evidence → weak で候補化されない（候補 0）", () => {
    const placements = buildSeedPlacements([seed({ id: "p1", actionShape: "full_go", confidence: 0.9 })]);
    const drafts = generateCandidates(completeRealityInput([{ id: "a", startMin: 540, endMin: 600 }]), undefined, {
      seedPlacements: placements,
      durationEvidences: [{ seedRef: "p1", durationMin: 60, source: "prm_typical", confidence: "high" }],
      activeWindow: { startMin: 540, endMin: 720 },
    });
    expect(drafts).toHaveLength(0);
  });
});
