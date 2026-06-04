import { describe, it, expect } from "vitest";
import { applyChangeSet, type CandidateDraft, type PlanNode } from "@/lib/plan/reality/candidate-evaluator";
import type { ChangeSet, ChangeOp, PlanItemSnapshot } from "@/lib/plan/reality/change-set";

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
