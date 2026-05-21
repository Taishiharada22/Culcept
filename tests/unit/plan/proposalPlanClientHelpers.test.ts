/**
 * Phase 3-J-6e-1: PlanClient proposal helpers + PlanClient module import
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §0.4 Phase 3 解決 3 軸
 *
 * 検証範囲:
 *   - computeFirstUseDateFromAnchors: 最古 confirmedAt 抽出 + edge cases
 *   - groupProposalsByDate: date 単位 grouping + 順序保持
 *   - PlanClient モジュール import 検証 (= 統合 OK)
 *   - File-level invariant grep (= PlanClient 設計遵守)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - pure (= 副作用 / mutate なし)
 *   - TestOverrideContext production import 禁止
 *   - callback (onProposalAccept/Modify/Dismiss) は J-6e-1 では未配線
 *   - localStorage write は J-6e-1 では発生しない (= read only)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  computeFirstUseDateFromAnchors,
  groupProposalsByDate,
} from "@/lib/plan/proposal/planClientProposalHelpers";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function anchor(opts: {
  id?: string;
  confirmedAt: string;
  title?: string;
  date?: string;
}): ExternalAnchor {
  return {
    id: opts.id ?? `anchor_${opts.confirmedAt}`,
    userId: "user_test",
    title: opts.title ?? "test",
    startTime: "10:00",
    rigidity: "soft",
    sourceId: "src_test",
    confirmedAt: opts.confirmedAt,
    anchorKind: "one_off",
    date: opts.date ?? "2026-05-22",
  } as ExternalAnchor;
}

function proposal(opts: {
  id?: string;
  date?: string;
}): ProposedAnchor {
  return {
    id: opts.id ?? "proposal_test",
    reason: "pattern_repeat",
    direction: "continue_pattern",
    confidence: "medium",
    draft: {
      title: "test",
      startTime: "10:00",
      anchorKind: "one_off",
      date: opts.date,
    } as ProposedAnchor["draft"],
    source: {
      signalType: "pattern_repeat",
      evidenceCount: 3,
      generatedAt: "2026-05-22T00:00:00.000Z",
    },
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}

const NOW_ISO = "2026-05-22T12:00:00.000Z";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeFirstUseDateFromAnchors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeFirstUseDateFromAnchors", () => {
  it("anchors 空 → nowIso の date 部分 fallback", () => {
    expect(computeFirstUseDateFromAnchors([], NOW_ISO)).toBe("2026-05-22");
  });

  it("1 anchor → その confirmedAt date", () => {
    const a = anchor({ confirmedAt: "2026-04-15T08:00:00.000Z" });
    expect(computeFirstUseDateFromAnchors([a], NOW_ISO)).toBe("2026-04-15");
  });

  it("複数 anchor → 最古 confirmedAt date", () => {
    const a1 = anchor({ id: "a1", confirmedAt: "2026-05-20T08:00:00.000Z" });
    const a2 = anchor({ id: "a2", confirmedAt: "2026-04-01T08:00:00.000Z" }); // oldest
    const a3 = anchor({ id: "a3", confirmedAt: "2026-05-10T08:00:00.000Z" });
    expect(computeFirstUseDateFromAnchors([a1, a2, a3], NOW_ISO)).toBe("2026-04-01");
  });

  it("confirmedAt 空文字の anchor は無視", () => {
    const a1 = anchor({ id: "a1", confirmedAt: "" });
    const a2 = anchor({ id: "a2", confirmedAt: "2026-04-15T08:00:00.000Z" });
    expect(computeFirstUseDateFromAnchors([a1, a2], NOW_ISO)).toBe("2026-04-15");
  });

  it("全 anchors の confirmedAt 空文字 → nowIso fallback", () => {
    const a1 = anchor({ id: "a1", confirmedAt: "" });
    expect(computeFirstUseDateFromAnchors([a1], NOW_ISO)).toBe("2026-05-22");
  });

  it("入力 anchors を mutate しない", () => {
    const a = anchor({ confirmedAt: "2026-04-15T08:00:00.000Z" });
    const frozen = JSON.stringify([a]);
    computeFirstUseDateFromAnchors([a], NOW_ISO);
    expect(JSON.stringify([a])).toBe(frozen);
  });

  it("nowIso 不正 → '1970-01-01' fallback (= defensive)", () => {
    expect(computeFirstUseDateFromAnchors([], "not-a-date")).toBe("1970-01-01");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// groupProposalsByDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("groupProposalsByDate", () => {
  it("空 list → 空 map", () => {
    expect(groupProposalsByDate([])).toEqual({});
  });

  it("1 proposal → 1 entry", () => {
    const p = proposal({ id: "p1", date: "2026-05-22" });
    const r = groupProposalsByDate([p]);
    expect(Object.keys(r)).toEqual(["2026-05-22"]);
    expect(r["2026-05-22"]).toHaveLength(1);
    expect(r["2026-05-22"]![0]!.id).toBe("p1");
  });

  it("複数 date → 複数 entry", () => {
    const p1 = proposal({ id: "p1", date: "2026-05-22" });
    const p2 = proposal({ id: "p2", date: "2026-05-23" });
    const p3 = proposal({ id: "p3", date: "2026-05-22" });
    const r = groupProposalsByDate([p1, p2, p3]);
    expect(r["2026-05-22"]).toHaveLength(2);
    expect(r["2026-05-23"]).toHaveLength(1);
  });

  it("同 date 内は入力順を維持 (= 上流 sort 順保持)", () => {
    const p1 = proposal({ id: "p1", date: "2026-05-22" });
    const p2 = proposal({ id: "p2", date: "2026-05-22" });
    const p3 = proposal({ id: "p3", date: "2026-05-22" });
    const r = groupProposalsByDate([p1, p2, p3]);
    expect(r["2026-05-22"]!.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("draft.date 不在 proposal は skip (= silent)", () => {
    const p1 = proposal({ id: "p1", date: undefined });
    const p2 = proposal({ id: "p2", date: "2026-05-22" });
    const r = groupProposalsByDate([p1, p2]);
    expect(Object.keys(r)).toEqual(["2026-05-22"]);
    expect(r["2026-05-22"]).toHaveLength(1);
  });

  it("入力 proposals を mutate しない", () => {
    const p = proposal({ id: "p1", date: "2026-05-22" });
    const frozen = JSON.stringify([p]);
    groupProposalsByDate([p]);
    expect(JSON.stringify([p])).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanClient module import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PlanClient module import (= J-6e-1 integration)", () => {
  it("PlanClient default export が関数として import 可", async () => {
    const mod = await import("@/app/(culcept)/plan/PlanClient");
    expect(mod.default).toBeTypeOf("function");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanClient file-level invariant grep
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PlanClient.tsx structural invariants (= J-6e-1)", () => {
  const PATH = "app/(culcept)/plan/PlanClient.tsx";
  const content = readFileSync(PATH, "utf-8");

  it("computeProposals が import されている", () => {
    expect(content).toMatch(
      /import\s+\{\s*computeProposals\s*\}\s+from\s+["']@\/lib\/plan\/proposal\/computeProposals["']/,
    );
  });

  it("planClientProposalHelpers helpers が import されている", () => {
    expect(content).toMatch(
      /import\s+\{[\s\S]*?computeFirstUseDateFromAnchors[\s\S]*?groupProposalsByDate[\s\S]*?\}\s+from\s+["']@\/lib\/plan\/proposal\/planClientProposalHelpers["']/,
    );
  });

  it("dismissAction read helpers が import されている", () => {
    expect(content).toMatch(
      /import\s+\{[\s\S]*?createStorageBackedDismissLogReader[\s\S]*?getBrowserDismissStorage[\s\S]*?\}\s+from\s+["']@\/lib\/plan\/proposal\/dismissAction["']/,
    );
  });

  it("TestOverrideContext は production import 禁止 (= 直接 import なし)", () => {
    expect(content).not.toMatch(
      /from\s+["']@\/lib\/plan\/proposal\/testOverrideContext["']/,
    );
  });

  it("CalendarTab に proposalsByDate prop が pass されている", () => {
    expect(content).toMatch(/<CalendarTab[\s\S]*?proposalsByDate=\{proposalsByDate\}/);
  });

  it("MapTab に proposalsByDate prop が pass されている", () => {
    expect(content).toMatch(/<MapTab[\s\S]*?proposalsByDate=\{proposalsByDate\}/);
  });

  it("FlowTab には proposalsByDate を渡さない (= J-6 scope 外)", () => {
    // FlowTab JSX block を抽出して proposalsByDate がないことを確認
    const flowMatch = content.match(/<FlowTab[\s\S]*?\/>/);
    expect(flowMatch).not.toBeNull();
    expect(flowMatch![0]).not.toContain("proposalsByDate");
  });

  it("accept / modify / dismiss callback は **未配線** (= J-6e-2/3/4 預け)", () => {
    // CalendarTab / MapTab JSX 内に onProposalAccept/Modify/Dismiss が渡されていない
    const calendarMatch = content.match(/<CalendarTab[\s\S]*?\/>/);
    const mapMatch = content.match(/<MapTab[\s\S]*?\/>/);
    expect(calendarMatch).not.toBeNull();
    expect(mapMatch).not.toBeNull();
    expect(calendarMatch![0]).not.toContain("onProposalAccept");
    expect(calendarMatch![0]).not.toContain("onProposalModify");
    expect(calendarMatch![0]).not.toContain("onProposalDismiss");
    expect(mapMatch![0]).not.toContain("onProposalAccept");
    expect(mapMatch![0]).not.toContain("onProposalModify");
    expect(mapMatch![0]).not.toContain("onProposalDismiss");
  });

  it("localStorage write を行う関数を import していない (= read only J-6e-1 規約)", () => {
    // recordDismissToStorage は write (= J-6e-2 範囲)
    expect(content).not.toMatch(
      /import[\s\S]*?recordDismissToStorage[\s\S]*?from\s+["']@\/lib\/plan\/proposal\/dismissAction["']/,
    );
    // recordUndoToStorage は J-6e-3 範囲
    expect(content).not.toMatch(
      /import[\s\S]*?recordUndoToStorage[\s\S]*?from\s+["']@\/lib\/plan\/proposal\/quietUndoWindow["']/,
    );
    // acceptProposal は J-6e-3 範囲
    expect(content).not.toMatch(
      /import[\s\S]*?acceptProposal[\s\S]*?from\s+["']@\/lib\/plan\/proposal\/acceptProposal["']/,
    );
  });
});
