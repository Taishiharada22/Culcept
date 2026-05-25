/**
 * Phase 3-J-6c: calendarProposalSelector pure helper + CalendarTab module import
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §10.1 Smoke 9
 *
 * 検証範囲:
 *   - selectFirstProposalForDate: date 単位の lookup + edge case
 *   - buildVariablesForProposal: caller map 優先 + draft fallback
 *   - CalendarTab モジュール import 検証 (= 構文 / 型 OK)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 17 Internal data disclosure only (= proposalId UI 非可視)
 *   - max 1 chip / day (= 先頭 1 件のみ選択)
 *   - presentational pure (= 副作用 / mutate なし)
 */

import { describe, expect, it } from "vitest";

import {
  buildVariablesForProposal,
  selectFirstProposalForDate,
} from "@/lib/plan/proposal/calendarProposalSelector";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function proposal(opts: Partial<ProposedAnchor> = {}): ProposedAnchor {
  return {
    id: opts.id ?? "proposal_test",
    reason: "pattern_repeat",
    direction: "continue_pattern",
    confidence: "medium",
    draft: opts.draft ?? { title: "カフェ", startTime: "14:00" },
    source: {
      signalType: "pattern_repeat",
      evidenceCount: 3,
      generatedAt: "2026-05-22T00:00:00.000Z",
    },
    createdAt: "2026-05-22T00:00:00.000Z",
    ...opts,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// selectFirstProposalForDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectFirstProposalForDate", () => {
  it("undefined map → null", () => {
    expect(selectFirstProposalForDate(undefined, "2026-05-22")).toBeNull();
  });

  it("empty map → null", () => {
    expect(selectFirstProposalForDate({}, "2026-05-22")).toBeNull();
  });

  it("key 不在 → null", () => {
    const map = { "2026-05-21": [proposal({ id: "p1" })] };
    expect(selectFirstProposalForDate(map, "2026-05-22")).toBeNull();
  });

  it("空 list → null", () => {
    const map = { "2026-05-22": [] as ReadonlyArray<ProposedAnchor> };
    expect(selectFirstProposalForDate(map, "2026-05-22")).toBeNull();
  });

  it("1 件 → その proposal", () => {
    const p = proposal({ id: "p1" });
    const map = { "2026-05-22": [p] };
    expect(selectFirstProposalForDate(map, "2026-05-22")).toBe(p);
  });

  it("複数件 → **先頭** のみ返す (= max 1 chip / day 規約)", () => {
    const p1 = proposal({ id: "p1" });
    const p2 = proposal({ id: "p2" });
    const p3 = proposal({ id: "p3" });
    const map = { "2026-05-22": [p1, p2, p3] };
    expect(selectFirstProposalForDate(map, "2026-05-22")).toBe(p1);
  });

  it("複数 date → 該当 date のみ", () => {
    const map = {
      "2026-05-21": [proposal({ id: "yesterday" })],
      "2026-05-22": [proposal({ id: "today" })],
      "2026-05-23": [proposal({ id: "tomorrow" })],
    };
    expect(selectFirstProposalForDate(map, "2026-05-22")?.id).toBe("today");
    expect(selectFirstProposalForDate(map, "2026-05-21")?.id).toBe("yesterday");
    expect(selectFirstProposalForDate(map, "2026-05-23")?.id).toBe("tomorrow");
  });

  it("入力 map を mutate しない (= pure)", () => {
    const map = { "2026-05-22": [proposal({ id: "p1" })] };
    const frozen = JSON.stringify(map);
    selectFirstProposalForDate(map, "2026-05-22");
    expect(JSON.stringify(map)).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildVariablesForProposal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildVariablesForProposal — draft fallback", () => {
  it("draft.title → variables.title", () => {
    const p = proposal({ draft: { title: "カフェ" } });
    const vars = buildVariablesForProposal(p);
    expect(vars.title).toBe("カフェ");
  });

  it("draft.locationText → variables.location", () => {
    const p = proposal({
      draft: { title: "ランチ", locationText: "新宿" },
    });
    const vars = buildVariablesForProposal(p);
    expect(vars.title).toBe("ランチ");
    expect(vars.location).toBe("新宿");
  });

  it("draft empty → variables 空 (= 0 entry)", () => {
    const p = proposal({ draft: {} });
    const vars = buildVariablesForProposal(p);
    expect(Object.keys(vars)).toHaveLength(0);
  });

  it("空文字 field は variable に入れない", () => {
    const p = proposal({ draft: { title: "" } });
    const vars = buildVariablesForProposal(p);
    expect(vars.title).toBeUndefined();
  });
});

describe("buildVariablesForProposal — caller map 優先", () => {
  it("caller map 提供 → 優先採用", () => {
    const p = proposal({
      id: "p1",
      draft: { title: "カフェ" },
    });
    const map = {
      p1: { title: "Café Latte", custom: "extra" },
    };
    const vars = buildVariablesForProposal(p, map);
    expect(vars.title).toBe("Café Latte");
    expect(vars.custom).toBe("extra");
  });

  it("caller map に proposalId 不在 → draft fallback", () => {
    const p = proposal({
      id: "p1",
      draft: { title: "カフェ" },
    });
    const map = { p_other: { title: "Other" } };
    const vars = buildVariablesForProposal(p, map);
    expect(vars.title).toBe("カフェ");
  });

  it("caller map / draft の両 case で mutate しない", () => {
    const p = proposal({ draft: { title: "カフェ" } });
    const map = { proposal_test: { title: "X" } };
    const frozen = JSON.stringify({ p, map });
    buildVariablesForProposal(p, map);
    expect(JSON.stringify({ p, map })).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CalendarTab module import (= 構文 / 型 OK)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab module import", () => {
  it("CalendarTab function が export されている", async () => {
    const mod = await import("@/app/(culcept)/plan/tabs/CalendarTab");
    expect(mod.CalendarTab).toBeTypeOf("function");
  });
});
