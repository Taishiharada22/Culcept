import { describe, it, expect } from "vitest";
import { applyChangeSet, evaluateSafetyMetrics, evaluateCandidate, type CandidateDraft, type PlanNode } from "@/lib/plan/reality/candidate-evaluator";
import { buildGenerationContext, type GenerationContext } from "@/lib/plan/reality/candidate-generator";
import { rankCandidates } from "@/lib/plan/reality/best-action";
import type { ChangeSet, ChangeOp, PlanItemSnapshot } from "@/lib/plan/reality/change-set";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";

function node(id: string, startMin: number, endMin: number, governance?: PlanNode["governance"]): PlanNode {
  return { id, startMin, endMin, governance };
}
function cs(ops: ChangeOp[]): ChangeSet {
  return { id: "cs", ops, reason: "r", sourceTraces: [] };
}
function snap(itemId: string, startMin?: number, endMin?: number, extra: Partial<PlanItemSnapshot> = {}): PlanItemSnapshot {
  return { itemId, startMin, endMin, ...extra };
}

describe("candidate-evaluator — CandidateDraft は metrics/score/gate を持てない", () => {
  it("draft の key は id/changeSet/sourceTraces/proposedDisposition のみ", () => {
    const draft: CandidateDraft = { id: "d", changeSet: cs([]), sourceTraces: [], proposedDisposition: "confirm" };
    expect("metrics" in draft).toBe(false);
    expect(Object.keys(draft).sort()).toEqual(["changeSet", "id", "proposedDisposition", "sourceTraces"]);
    // @ts-expect-error metrics は CandidateDraft に構造的に存在しない（自己申告不能）
    const _m = draft.metrics;
    void _m;
  });
});

describe("candidate-evaluator — applyChangeSet supported ops", () => {
  it("add: ノードを追加", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "add", itemId: "b", after: snap("b", 600, 660) }]));
    expect(r.ok).toBe(true);
    expect(r.nodes.map((n) => n.id)).toEqual(["a", "b"]); // startMin 昇順
  });
  it("remove: 既存ノードを削除", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "remove", itemId: "a", before: snap("a", 540, 600) }]));
    expect(r.ok).toBe(true);
    expect(r.nodes).toEqual([]);
  });
  it("update: timing を更新", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "update", itemId: "a", before: snap("a", 540, 600), after: snap("a", 550, 610) }]));
    expect(r.ok).toBe(true);
    expect(r.nodes[0]).toMatchObject({ id: "a", startMin: 550, endMin: 610 });
  });
  it("空 ops → ok・不変", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([]));
    expect(r.ok).toBe(true);
    expect(r.nodes.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("candidate-evaluator — fail-closed（unsupported / unknown / 不整合）", () => {
  it("add of existing id → fail", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "add", itemId: "a", after: snap("a", 540, 600) }]));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain("add of existing");
  });
  it("remove of unknown id → fail", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "remove", itemId: "z", before: snap("z", 0, 1) }]));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain("unknown");
  });
  it("update of unknown id → fail", () => {
    const r = applyChangeSet([], cs([{ kind: "update", itemId: "z", before: snap("z", 0, 1), after: snap("z", 1, 2) }]));
    expect(r.ok).toBe(false);
  });
  it("incomplete after（timing 無し）→ fail", () => {
    const r = applyChangeSet([], cs([{ kind: "add", itemId: "b", after: snap("b") }]));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain("incomplete");
  });
  it("before mismatch（stale）→ fail", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "update", itemId: "a", before: snap("a", 100, 200), after: snap("a", 550, 610) }]));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain("before mismatch");
  });
  it("unsupported op → fail", () => {
    const bad = { kind: "split", itemId: "a" } as unknown as ChangeOp;
    const r = applyChangeSet([node("a", 540, 600)], cs([bad]));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain("unsupported");
  });
});

describe("candidate-evaluator — atomic / no mutation / no raw", () => {
  it("atomic: 1 op でも失敗すれば全体 fail・入力不変", () => {
    const input = [node("a", 540, 600)];
    const r = applyChangeSet(input, cs([
      { kind: "add", itemId: "b", after: snap("b", 600, 660) }, // valid
      { kind: "remove", itemId: "z", before: snap("z", 0, 1) }, // invalid → 全体 fail
    ]));
    expect(r.ok).toBe(false);
    expect(r.nodes.map((n) => n.id)).toEqual(["a"]); // 部分適用なし（b は入っていない）
  });
  it("入力 nodes / elements を mutate しない", () => {
    const input = [node("a", 540, 600), node("b", 600, 660)];
    const before = JSON.stringify(input);
    applyChangeSet(input, cs([{ kind: "update", itemId: "a", before: snap("a", 540, 600), after: snap("a", 550, 610) }]));
    expect(JSON.stringify(input)).toBe(before); // 入力不変
  });
  it("raw title を結果に持ち込まない", () => {
    const r = applyChangeSet([], cs([{ kind: "add", itemId: "b", after: snap("b", 600, 660, { title: "渋谷の田中皮膚科" }) }]));
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r.nodes);
    expect(json).not.toContain("渋谷");
    expect(json).not.toContain("title");
  });
  it("issues に raw を含めない", () => {
    const r = applyChangeSet([node("a", 540, 600)], cs([{ kind: "add", itemId: "a", after: snap("a", 540, 600, { title: "渋谷の病院" }) }]));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.issues)).not.toContain("渋谷");
  });
});

// ── A1-2-2: evaluateSafetyMetrics（one-sided conservative） ──

function gov(p: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return { origin: "user", authority: "user_owned", flexibility: "movable", protectionReasons: ["tentative"], ...p };
}
const RECOVERY = gov({ protectionReasons: ["recovery_core"] });
const IMPORT_LOCKED = gov({ origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] });
const PLAIN = gov({ protectionReasons: ["tentative"] });

interface NodeSpec {
  id: string;
  startMin: number;
  endMin: number;
  governance: PlanItemGovernance;
  hard?: boolean;
  importance?: "low" | "normal" | "high" | "critical";
}
function ctxFrom(specs: NodeSpec[]): GenerationContext {
  const dayNodes = specs.map((s) => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, importance: s.importance ?? ("normal" as const), hard: s.hard ?? false }));
  const anchors: RealityInput["anchors"] = {};
  for (const s of specs) anchors[s.id] = { governance: s.governance, importance: "normal", sensitive: false };
  return buildGenerationContext({ mode: "repair", dayNodes, anchors, seedTraces: [] });
}
const TRACE: SourceTrace = { kind: "seed", ref: "s1", reason: "目的", confidence: 0.8 };
function draft(ops: ChangeOp[], sourceTraces: readonly SourceTrace[] = []): CandidateDraft {
  return { id: "d", changeSet: { id: "cs", ops, reason: "r", sourceTraces: [TRACE] }, sourceTraces, proposedDisposition: "confirm" };
}

describe("evaluateSafetyMetrics — 非空性（genuinely safe → 全 true）", () => {
  it("空き時間に非重複追加・既存に触れない → 4 metric 全 true", () => {
    const ctx = ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }]);
    const m = evaluateSafetyMetrics(draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }]), ctx);
    expect(m).toEqual({ feasible: true, recoveryProtected: true, deadlineSatisfied: true, wholePartCoherent: true });
  });
  it("recovery_core node に触れず別所に add → recoveryProtected も true", () => {
    const ctx = ctxFrom([{ id: "r", startMin: 540, endMin: 600, governance: RECOVERY }]);
    const m = evaluateSafetyMetrics(draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }]), ctx);
    expect(m.recoveryProtected).toBe(true);
  });
});

describe("evaluateSafetyMetrics — apply 失敗/不明 → 全 false（保守）", () => {
  it("unknown remove（apply 失敗）→ 全 false", () => {
    const ctx = ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }]);
    const m = evaluateSafetyMetrics(draft([{ kind: "remove", itemId: "z", before: snap("z", 0, 1) }]), ctx);
    expect(m).toEqual({ feasible: false, recoveryProtected: false, deadlineSatisfied: false, wholePartCoherent: false });
  });
});

describe("evaluateSafetyMetrics — recoveryProtected（recovery_core を触ると false）", () => {
  it("recovery_core を remove → recoveryProtected false", () => {
    const ctx = ctxFrom([{ id: "r", startMin: 540, endMin: 600, governance: RECOVERY }]);
    expect(evaluateSafetyMetrics(draft([{ kind: "remove", itemId: "r", before: snap("r", 540, 600) }]), ctx).recoveryProtected).toBe(false);
  });
  it("recovery_core を update（移動/短縮）→ recoveryProtected false", () => {
    const ctx = ctxFrom([{ id: "r", startMin: 540, endMin: 600, governance: RECOVERY }]);
    expect(evaluateSafetyMetrics(draft([{ kind: "update", itemId: "r", before: snap("r", 540, 600), after: snap("r", 560, 600) }]), ctx).recoveryProtected).toBe(false);
  });
});

describe("evaluateSafetyMetrics — deadlineSatisfied（critical node を壊すと false）", () => {
  it("hard node を remove → deadlineSatisfied false", () => {
    const ctx = ctxFrom([{ id: "h", startMin: 540, endMin: 600, governance: PLAIN, hard: true }]);
    expect(evaluateSafetyMetrics(draft([{ kind: "remove", itemId: "h", before: snap("h", 540, 600) }]), ctx).deadlineSatisfied).toBe(false);
  });
  it("immovable(import_locked) node を update → deadlineSatisfied false", () => {
    const ctx = ctxFrom([{ id: "m", startMin: 540, endMin: 600, governance: IMPORT_LOCKED }]);
    expect(evaluateSafetyMetrics(draft([{ kind: "update", itemId: "m", before: snap("m", 540, 600), after: snap("m", 550, 610) }]), ctx).deadlineSatisfied).toBe(false);
  });
  it("critical 重要度 node を remove → deadlineSatisfied false", () => {
    const ctx = ctxFrom([{ id: "c", startMin: 540, endMin: 600, governance: PLAIN, importance: "critical" }]);
    expect(evaluateSafetyMetrics(draft([{ kind: "remove", itemId: "c", before: snap("c", 540, 600) }]), ctx).deadlineSatisfied).toBe(false);
  });
  it("soft/movable node を update（移動）しても deadlineSatisfied は true（過剰 flag しない）", () => {
    const ctx = ctxFrom([{ id: "s", startMin: 540, endMin: 600, governance: PLAIN }]); // movable・非 critical
    const m = evaluateSafetyMetrics(draft([{ kind: "update", itemId: "s", before: snap("s", 540, 600), after: snap("s", 560, 620) }]), ctx);
    expect(m.deadlineSatisfied).toBe(true); // soft は保護対象でない → deadline 破壊扱いしない
  });
});

describe("evaluateSafetyMetrics — feasible / wholePart（幾何・budget 違反 → false）", () => {
  it("overlap 発生 → feasible false", () => {
    const ctx = ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }]);
    expect(evaluateSafetyMetrics(draft([{ kind: "add", itemId: "b", after: snap("b", 550, 650) }]), ctx).feasible).toBe(false);
  });
  it("zero duration → feasible false", () => {
    const ctx = ctxFrom([]);
    expect(evaluateSafetyMetrics(draft([{ kind: "add", itemId: "b", after: snap("b", 600, 600) }]), ctx).feasible).toBe(false);
  });
  it("日境界外（end>1440）→ feasible も wholePart も false", () => {
    const ctx = ctxFrom([]);
    const m = evaluateSafetyMetrics(draft([{ kind: "add", itemId: "b", after: snap("b", 1400, 1500) }]), ctx);
    expect(m.feasible).toBe(false);
    expect(m.wholePartCoherent).toBe(false);
  });
});

// ── A1-2-3: evaluateCandidate（draft → BestActionCandidate） ──

describe("evaluateCandidate — 組立（safety=evaluator 由来 / subjective=中立 0 / instability=客観）", () => {
  it("safety metrics は evaluateSafetyMetrics と一致（self-report 不使用）", () => {
    const ctx = ctxFrom([{ id: "r", startMin: 540, endMin: 600, governance: RECOVERY }]);
    const d = draft([{ kind: "remove", itemId: "r", before: snap("r", 540, 600) }], [TRACE]);
    const cand = evaluateCandidate(d, ctx);
    const safety = evaluateSafetyMetrics(d, ctx);
    expect(cand.metrics.feasible).toBe(safety.feasible);
    expect(cand.metrics.recoveryProtected).toBe(safety.recoveryProtected);
    expect(cand.metrics.deadlineSatisfied).toBe(safety.deadlineSatisfied);
    expect(cand.metrics.wholePartCoherent).toBe(safety.wholePartCoherent);
  });
  it("未算出 metric は 0（slackHealth/contextSwitches/subjective・水増ししない）", () => {
    const ctx = ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }]);
    const cand = evaluateCandidate(draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }], [TRACE]), ctx);
    for (const k of ["goalAttainment", "rhythmFit", "slackHealth", "contextSwitches", "correctionMisalignment"] as const) {
      expect(cand.metrics[k]).toBe(0);
    }
    expect(cand.metrics.overpack).toBe(0); // A1-2-4a で算出。この候補は sparse ゆえ 0
  });
  it("instability は move+remove の客観 count（add は数えない）", () => {
    const ctx = ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }, { id: "x", startMin: 700, endMin: 760, governance: PLAIN }]);
    const cand = evaluateCandidate(draft([
      { kind: "update", itemId: "a", before: snap("a", 540, 600), after: snap("a", 545, 605) },
      { kind: "remove", itemId: "x", before: snap("x", 700, 760) },
      { kind: "add", itemId: "b", after: snap("b", 800, 860) },
    ], [TRACE]), ctx);
    expect(cand.metrics.instability).toBe(2);
  });
  it("id/changeSet/sourceTraces/proposedDisposition は draft 由来", () => {
    const d = draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }], [TRACE]);
    const cand = evaluateCandidate(d, ctxFrom([]));
    expect(cand.id).toBe(d.id);
    expect(cand.changeSet).toBe(d.changeSet);
    expect(cand.sourceTraces).toBe(d.sourceTraces);
    expect(cand.proposedDisposition).toBe("confirm");
  });
});

describe("evaluateCandidate — gate-first: gate-false 候補は best にならない（rankCandidates 検証）", () => {
  const safeCtx = () => ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }]);
  const safe = () => ({ ...evaluateCandidate(draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }], [TRACE]), safeCtx()), id: "safe" });

  it("feasible-false（overlap）→ best にならない", () => {
    const unsafe = { ...evaluateCandidate(draft([{ kind: "add", itemId: "b", after: snap("b", 550, 650) }], [TRACE]), safeCtx()), id: "unsafe" };
    const r = rankCandidates([unsafe, safe()]);
    expect(r.best?.candidate.id).toBe("safe");
    expect(r.rejected.map((x) => x.candidate.id)).toContain("unsafe");
  });
  it("recovery-false → best にならない", () => {
    const ctx = ctxFrom([{ id: "r", startMin: 540, endMin: 600, governance: RECOVERY }]);
    const unsafe = { ...evaluateCandidate(draft([{ kind: "remove", itemId: "r", before: snap("r", 540, 600) }], [TRACE]), ctx), id: "unsafe" };
    expect(rankCandidates([unsafe, safe()]).best?.candidate.id).toBe("safe");
  });
  it("deadline-false（hard 破壊）→ best にならない（高 score でも救済されない）", () => {
    const ctx = ctxFrom([{ id: "h", startMin: 540, endMin: 600, governance: PLAIN, hard: true }]);
    const unsafe = { ...evaluateCandidate(draft([{ kind: "remove", itemId: "h", before: snap("h", 540, 600) }], [TRACE]), ctx), id: "unsafe" };
    expect(rankCandidates([unsafe, safe()]).best?.candidate.id).toBe("safe");
  });
  it("wholePart-false（日境界外）→ best にならない", () => {
    const unsafe = { ...evaluateCandidate(draft([{ kind: "add", itemId: "b", after: snap("b", 1400, 1500) }], [TRACE]), ctxFrom([])), id: "unsafe" };
    expect(rankCandidates([unsafe, safe()]).best?.candidate.id).toBe("safe");
  });
});

describe("evaluateCandidate — A1-2-4a overpack（過密 penalty・保守・一方向）", () => {
  const packedCtx = () => ctxFrom([{ id: "big", startMin: 0, endMin: 1200, governance: PLAIN }]); // busy 1200/1440=0.83
  const sparseCtx = () => ctxFrom([{ id: "a", startMin: 540, endMin: 600, governance: PLAIN }]);

  it("sparse な日 → overpack 0（過密でない）", () => {
    const cand = evaluateCandidate(draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }], [TRACE]), sparseCtx());
    expect(cand.metrics.overpack).toBe(0);
  });
  it("明らかに過密（util>0.7）→ overpack>0（0..1 clamp）", () => {
    const cand = evaluateCandidate(draft([{ kind: "add", itemId: "s", after: snap("s", 1210, 1240) }], [TRACE]), packedCtx());
    expect(cand.metrics.overpack).toBeGreaterThan(0);
    expect(cand.metrics.overpack).toBeLessThanOrEqual(1);
  });
  it("apply 失敗 → overpack 0（不当に救わず・不当に罰さず）", () => {
    const cand = evaluateCandidate(draft([{ kind: "remove", itemId: "z", before: snap("z", 0, 1) }], [TRACE]), sparseCtx());
    expect(cand.metrics.overpack).toBe(0);
  });
  it("rank: 高 overpack の安全候補は 低 overpack 候補より下位", () => {
    const high = { ...evaluateCandidate(draft([{ kind: "add", itemId: "s", after: snap("s", 1210, 1240) }], [TRACE]), packedCtx()), id: "high" };
    const low = { ...evaluateCandidate(draft([{ kind: "add", itemId: "b", after: snap("b", 660, 720) }], [TRACE]), sparseCtx()), id: "low" };
    expect(high.metrics.overpack).toBeGreaterThan(low.metrics.overpack);
    expect(rankCandidates([high, low]).best?.candidate.id).toBe("low"); // 低 overpack が上位
  });
});
