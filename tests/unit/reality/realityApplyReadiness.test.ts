/**
 * Apply Readiness Deep Audit / Preview Operation Hardening（2026-06-09・read-only・no-apply）。
 *
 * 監査: dev preview で観測している envelope / ChangeSet draft が「apply 判断に耐えるか」を pure に固定する。
 *   ① envelope contract（changeSetDraft は opCount のみ・id/op 内容を載せない）
 *   ② no-apply guarantee（draft mapper / pipeline は apply/write/commit を持たない・add の draft のみ）
 *   ③ apply readiness 不変条件（undoability / confirmation 境界 / 既知ギャップ = sourceTraces 空・synthetic itemId）
 *   ④ permission 再評価の証明（envelope の allowed(propose) は **apply 権限ではない**）
 *
 * 設計: docs/reality-apply-readiness-audit.md。実 apply / write / route / DB には一切踏み込まない（pure 検証のみ）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { proposalToChangeSetDraft } from "@/lib/plan/reality/permission/changeset-draft";
import {
  validateUndoability,
  changeSetRequiresConfirmation,
  affectedItemIds,
  type ChangeSet,
} from "@/lib/plan/reality/change-set";
import { evaluatePermission } from "@/lib/plan/reality/permission/permission-gate";
import type { EmptyDayProposal } from "@/lib/plan/reality/empty-day/empty-day-generator";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";

const REPO = process.cwd();
const readCode = (rel: string): string =>
  fs
    .readFileSync(path.join(REPO, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

/** 監査用の最小 proposal（draft mapper が消費する field のみ）。 */
function proposal(): EmptyDayProposal {
  return {
    tier: "protect",
    activeMinutes: 120,
    restMinutes: 180,
    strain: "low",
    blocks: [
      { kind: "focus_work", startMinute: 600, endMinute: 660 },
      { kind: "recovery", startMinute: 720, endMinute: 780 },
    ],
  } as unknown as EmptyDayProposal;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ① envelope contract ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Apply Readiness ① envelope contract — changeSetDraft は opCount のみ", () => {
  it("型: changeSetDraft は { opCount } のみ（id を持てない）", () => {
    const ok: RealityPipelineEnvelope["changeSetDraft"] = { opCount: 2 };
    expect(ok.opCount).toBe(2);
    // @ts-expect-error id は envelope summary に存在しない（client へ draft identity を渡さない）
    const leak: RealityPipelineEnvelope["changeSetDraft"] = { id: "draft:x", opCount: 2 };
    void leak;
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ② no-apply guarantee ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Apply Readiness ② no-apply guarantee — draft のみ・write/commit/apply なし", () => {
  it("draft mapper は **add の draft のみ**（remove/update を作らない）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    expect(cs.ops.length).toBe(2);
    expect(cs.ops.every((o) => o.kind === "add")).toBe(true);
  });
  it("draft の governance は proposed/droppable/tentative（確定でない）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    for (const op of cs.ops) {
      const g = (op as { after: { governance?: PlanItemGovernance } }).after.governance!;
      expect(g.authority).toBe("proposed");
      expect(g.flexibility).toBe("droppable");
      expect(g.protectionReasons).toContain("tentative");
    }
  });
  it("source-contract: changeset-draft.ts は DB/apply/write/commit を持たない", () => {
    const src = readCode("lib/plan/reality/permission/changeset-draft.ts");
    for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", "supabase", "server-only", "fetch(", "commit("]) {
      expect(src).not.toContain(banned);
    }
  });
  it("source-contract: reality-pipeline.ts は DB/apply/write/commit を持たない（pure 観測のみ）", () => {
    const src = readCode("lib/plan/reality/orchestration/reality-pipeline.ts");
    for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", "supabase", "server-only", "fetch("]) {
      expect(src).not.toContain(banned);
    }
  });
  it("source-contract: preview page は apply/write/PlanClient を持たない（実コード）", () => {
    const page = readCode("app/(culcept)/plan/dev-reality-pipeline/page.tsx");
    expect(page).not.toMatch(/\.insert\s*\(/);
    expect(page).not.toMatch(/\.update\s*\(/);
    expect(page).not.toMatch(/\.delete\s*\(/);
    expect(page).not.toMatch(/\.upsert\s*\(/);
    expect(page).not.toContain("PlanClient");
    expect(page).not.toMatch(/apply/i);
  });
  it("source-contract: preview client は presentational（fetch/button/onClick/useState/write なし）", () => {
    // 注: client は免責表示テキストに「apply / PlanClient 接続なし」を含むため、語ではなく **実装の有無**で判定する。
    const client = readCode("app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx");
    expect(client).not.toContain("fetch(");
    expect(client).not.toContain("<button");
    expect(client).not.toContain("onClick");
    expect(client).not.toContain("useState");
    expect(client).not.toMatch(/\.insert\s*\(/);
    expect(client).not.toMatch(/\.update\s*\(/);
    expect(client).not.toMatch(/\.delete\s*\(/);
    expect(client).not.toMatch(/\.upsert\s*\(/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ③ apply readiness 不変条件 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Apply Readiness ③ 不変条件 — undoability / confirmation / 既知ギャップ", () => {
  it("add draft は undoable（after snapshot に startMin/endMin が揃う）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    expect(validateUndoability(cs).ok).toBe(true);
  });
  it("proposed/droppable draft は即時確認不要（immovable/hard_external を触らない）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    expect(changeSetRequiresConfirmation(cs)).toBe(false);
  });
  it("既知ギャップ-1: draft.sourceTraces は空（apply は source trace を注入する必要がある）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    expect(cs.sourceTraces).toEqual([]); // INV-24 provenance は apply 側で補う前提
  });
  it("既知ギャップ-2: draft itemId は synthetic（real plan id でない → apply で mint/map が必要）", () => {
    const cs = proposalToChangeSetDraft(proposal(), "2026-06-20");
    for (const id of affectedItemIds(cs)) expect(id.startsWith("draft:")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ④ permission 再評価の証明 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ctx = { contextComplete: true, governance: null } as const;
const immovable: PlanItemGovernance = { origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] };

describe("Apply Readiness ④ permission 再評価 — envelope の allowed(propose) は apply 権限でない", () => {
  it("envelope が報告する propose@level2 は allowed（観測の権限）", () => {
    const v = evaluatePermission({ action: "propose", flags: [], level: 2, ...ctx });
    expect(v.verdict).toBe("allowed");
  });
  it("**同じ level2 で apply 相当（adjust_plan）は allowed にならない**（confirm/blocked）", () => {
    const v = evaluatePermission({ action: "adjust_plan", flags: [], level: 2, ...ctx });
    expect(v.verdict).not.toBe("allowed");
  });
  it("draft 書き込み（draft action）も level2 では allowed にならない", () => {
    const v = evaluatePermission({ action: "draft", flags: [], level: 2, ...ctx });
    expect(v.verdict).not.toBe("allowed");
  });
  it("高リスク flag は level に関わらず allowed にならない（confirm/blocked）", () => {
    for (const level of [3, 4, 5] as const) {
      const v = evaluatePermission({ action: "book", flags: ["confirms_booking"], level, ...ctx });
      expect(v.risk).toBe("high");
      expect(v.verdict).not.toBe("allowed");
    }
  });
  it("文脈不足は insufficient_context（捏造して進めない）", () => {
    const v = evaluatePermission({ action: "adjust_plan", flags: [], level: 5, contextComplete: false, governance: null });
    expect(v.verdict).toBe("insufficient_context");
  });
  it("固定予定（hard_external/immovable）を動かす adjust_plan は blocked", () => {
    const v = evaluatePermission({ action: "adjust_plan", flags: [], level: 5, contextComplete: true, governance: immovable });
    expect(v.verdict).toBe("blocked");
  });
});
