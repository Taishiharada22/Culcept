/**
 * A-1 Apply Precondition Checker（pure・no-write）unit。
 *   ChangeSet draft の apply 可能性を 1 関数で判定: stale / conflict / permission 再評価 / undoability /
 *   idempotency / confirmation / provenance。**apply しない・書かない**（判定のみ）。
 *
 * 設計: docs/reality-apply-readiness-audit.md（§3 G1–G7 / §5 A-1）。
 */
import { describe, it, expect } from "vitest";
import {
  evaluateApplyPrecondition,
  worldStateApplySignature,
  MAX_DRAFT_AGE_MS,
  type ApplyPreconditionInput,
} from "@/lib/plan/reality/permission/apply-precondition";
import type { ChangeSet, ChangeOp } from "@/lib/plan/reality/change-set";
import { validateUndoability } from "@/lib/plan/reality/change-set";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import type { HardConstraint } from "@/lib/plan/reality/empty-day/empty-day-input";
import { evaluatePermission } from "@/lib/plan/reality/permission/permission-gate";

const FORBIDDEN = /seed_?ref|utterance|personality|title|location|@[a-z]|\b\d{10,}\b/i;

const PROPOSED: PlanItemGovernance = { origin: "alter_generated", authority: "proposed", flexibility: "droppable", protectionReasons: ["tentative"] };

/** 2 ブロック add の健全 draft（after に startMin/endMin・provenance 付き）。 */
function draft(over: { ops?: readonly ChangeOp[]; sourceTraces?: ChangeSet["sourceTraces"]; id?: string } = {}): ChangeSet {
  const ops: readonly ChangeOp[] = over.ops ?? [
    { kind: "add", itemId: "draft:a", after: { itemId: "draft:a", startMin: 600, endMin: 660, title: "集中の時間", governance: PROPOSED } },
    { kind: "add", itemId: "draft:b", after: { itemId: "draft:b", startMin: 720, endMin: 780, title: "休息", governance: PROPOSED } },
  ];
  return {
    id: over.id ?? "draft:emptyday:2026-06-20:protect",
    ops,
    reason: "空白の日の組み方案（protect）",
    sourceTraces: over.sourceTraces ?? [{ kind: "prm", ref: "prm:1", reason: "観測根拠", confidence: 0.6 }],
  };
}

/** draft の 2 ブロックが収まる窓（9:00–14:00）・固定予定なしの live WS。 */
function ws(over: { todaySchedule?: readonly HardConstraint[] } = {}): WorldState {
  return {
    date: "2026-06-20",
    nowMinute: 540,
    todaySchedule: over.todaySchedule ?? [],
    availableWindows: [{ startMinute: 540, endMinute: 840, meaning: null }],
    context: null,
    mobility: null,
    permissionLevel: 3,
  };
}

/** 健全な freshness + idempotency 材料（caller が live WS の signature を渡す）。 */
function fresh(world: WorldState): Pick<ApplyPreconditionInput, "baseVersion" | "computedAtMs" | "nowMs" | "appliedSnapshot"> {
  return { baseVersion: worldStateApplySignature(world), computedAtMs: 1_000_000, nowMs: 1_000_000 + 1000, appliedSnapshot: { appliedChangeSetIds: [] } };
}

/** 完全に安全な apply（draft action・level 3・low risk・fresh・no conflict・provenance・undoable・snapshot）。 */
function safeInput(over: Partial<ApplyPreconditionInput> = {}): ApplyPreconditionInput {
  const world = over.liveWorldState ?? ws();
  return { draft: draft(), liveWorldState: world, level: 3, applyAction: "draft", flags: [], ...fresh(world), ...over };
}

describe("A-1 fully safe fixture → can_apply", () => {
  it("draft@level3・low risk・fresh・no conflict・provenance・undoable → canApply true", () => {
    const r = evaluateApplyPrecondition(safeInput());
    expect(r.canApply).toBe(true);
    expect(r.verdict).toBe("can_apply");
    expect(r.blockers).toEqual([]);
  });
});

describe("A-1 ① permission 再評価（propose allowed でも apply 不可）", () => {
  it("propose@level2 は allowed だが、apply(adjust_plan)@level2 は can_apply にならない", () => {
    expect(evaluatePermission({ action: "propose", flags: [], level: 2, governance: null, contextComplete: true }).verdict).toBe("allowed");
    const r = evaluateApplyPrecondition(safeInput({ applyAction: "adjust_plan", level: 2 }));
    expect(r.canApply).toBe(false);
    expect(r.verdict).toBe("blocked");
    expect(r.blockers).toContain("permission_blocked");
  });
});

describe("A-1 ② high risk never canApply", () => {
  it("高リスク（book + confirms_booking）は level5 でも canApply false", () => {
    const r = evaluateApplyPrecondition(safeInput({ applyAction: "book", flags: ["confirms_booking"], level: 5 }));
    expect(r.canApply).toBe(false);
    expect(r.requiredConfirmation).toBe(true);
  });
  it("高リスクは confirmation=confirmed でも auto can_apply にしない", () => {
    const r = evaluateApplyPrecondition(safeInput({ applyAction: "purchase", flags: ["purchase"], level: 5, confirmation: { confirmed: true } }));
    expect(r.canApply).toBe(false);
    expect(r.verdict).toBe("confirm_required");
  });
});

describe("A-1 ③ stale check", () => {
  it("baseVersion が live と不一致 → stale（canApply false）", () => {
    const r = evaluateApplyPrecondition(safeInput({ baseVersion: "STALE|s=|w=" }));
    expect(r.canApply).toBe(false);
    expect(r.verdict).toBe("stale");
    expect(r.blockers).toContain("stale_base_version");
  });
  it("draft が古すぎる（nowMs - computedAtMs > MAX）→ stale", () => {
    const world = ws();
    const r = evaluateApplyPrecondition(safeInput({ liveWorldState: world, baseVersion: worldStateApplySignature(world), computedAtMs: 0, nowMs: MAX_DRAFT_AGE_MS + 1, appliedSnapshot: { appliedChangeSetIds: [] } }));
    expect(r.verdict).toBe("stale");
    expect(r.blockers).toContain("stale_draft_age");
  });
});

describe("A-1 ④ live conflict check", () => {
  it("対象 window に固定予定が現れた → conflict（canApply false）", () => {
    const world = ws({ todaySchedule: [{ startMinute: 600, endMinute: 660, label: null, protection: "hard_external" }] });
    // baseVersion は **この conflicting live WS** に一致させ stale を分離（conflict のみを検証）。
    const r = evaluateApplyPrecondition(safeInput({ liveWorldState: world, baseVersion: worldStateApplySignature(world) }));
    expect(r.canApply).toBe(false);
    expect(r.verdict).toBe("conflict");
    expect(r.blockers).toContain("conflict_window_occupied");
    expect(r.blockers).toContain("conflict_immovable");
  });
});

describe("A-1 ⑤ idempotency", () => {
  it("idempotency snapshot 欠落 → insufficient_context（捏造せず止める）", () => {
    const world = ws();
    const r = evaluateApplyPrecondition({ draft: draft(), liveWorldState: world, level: 3, applyAction: "draft", flags: [], baseVersion: worldStateApplySignature(world), computedAtMs: 1000, nowMs: 2000 });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.blockers).toContain("missing_idempotency_snapshot");
  });
  it("既に同じ draft.id が applied-set に存在 → 二重 apply 不可（blocked）", () => {
    const world = ws();
    const r = evaluateApplyPrecondition(safeInput({ liveWorldState: world, appliedSnapshot: { appliedChangeSetIds: ["draft:emptyday:2026-06-20:protect"] }, baseVersion: worldStateApplySignature(world) }));
    expect(r.canApply).toBe(false);
    expect(r.blockers).toContain("already_applied");
  });
  it("freshness 材料欠落 → insufficient_context", () => {
    const world = ws();
    const r = evaluateApplyPrecondition({ draft: draft(), liveWorldState: world, level: 3, applyAction: "draft", appliedSnapshot: { appliedChangeSetIds: [] } });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.blockers).toContain("missing_freshness_inputs");
  });
});

describe("A-1 ④/⑥ undoability", () => {
  it("undoable draft → pass候補（undo_incomplete を出さない・can_apply）", () => {
    const d = draft();
    expect(validateUndoability(d).ok).toBe(true);
    expect(evaluateApplyPrecondition(safeInput({ draft: d })).blockers).not.toContain("undo_incomplete");
  });
  it("undo 不能な draft（remove の before snapshot 不完全）→ blocked", () => {
    const bad = draft({ ops: [{ kind: "remove", itemId: "x", before: { itemId: "x" } }] });
    const r = evaluateApplyPrecondition(safeInput({ draft: bad }));
    expect(r.canApply).toBe(false);
    expect(r.blockers).toContain("undo_incomplete");
  });
});

describe("A-1 ⑦ provenance / sourceTrace", () => {
  it("sourceTraces が空 → provenance_missing（blocker・canApply false）", () => {
    const r = evaluateApplyPrecondition(safeInput({ draft: draft({ sourceTraces: [] }) }));
    expect(r.canApply).toBe(false);
    expect(r.blockers).toContain("provenance_missing");
  });
});

describe("A-1 ⑥ confirmation", () => {
  it("elevated 確認必要（adjust_plan@level4）→ 未確認は confirm_required（canApply false）", () => {
    const r = evaluateApplyPrecondition(safeInput({ applyAction: "adjust_plan", level: 4 }));
    expect(r.verdict).toBe("confirm_required");
    expect(r.requiredConfirmation).toBe(true);
    expect(r.canApply).toBe(false);
  });
  it("elevated は confirmation=confirmed で can_apply（低/中リスクのみ・高リスクは別）", () => {
    const r = evaluateApplyPrecondition(safeInput({ applyAction: "adjust_plan", level: 4, confirmation: { confirmed: true } }));
    expect(r.canApply).toBe(true);
  });
});

describe("A-1 redaction — raw/PII/title を出さない", () => {
  it("draft に title/12桁数字があっても result に echo しない", () => {
    const leaky = draft({ ops: [{ kind: "add", itemId: "d", after: { itemId: "d", startMin: 600, endMin: 660, title: "ヨガ教室 010123456789", governance: PROPOSED } }] });
    const r = evaluateApplyPrecondition(safeInput({ draft: leaky }));
    const json = JSON.stringify(r);
    expect(json).not.toContain("ヨガ教室");
    expect(json).not.toContain("010123456789");
    expect(json).not.toMatch(FORBIDDEN);
  });
  it("worldStateApplySignature は label/title を含めない（PII 非搬送）", () => {
    const sig = worldStateApplySignature(ws({ todaySchedule: [{ startMinute: 600, endMinute: 660, label: "歯医者@新宿", protection: "hard_external" }] }));
    expect(sig).not.toContain("歯医者");
    expect(sig).not.toContain("新宿");
  });
});
