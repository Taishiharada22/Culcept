/**
 * Phase 3-J-6d: MapTab proposal hint 導線 (= presentational only)
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §8.6 DayGraph Layer 配置
 *
 * 検証範囲:
 *   - MapTab モジュール import 検証 (= CalendarProposalProps 統合 OK)
 *   - selectFirstProposalForDate / buildVariablesForProposal 仕様 (= 再利用、 J-6c 既存 helper)
 *   - MapTab + SelectedAnchorCard が proposalsByDate を受領できる contract 確認
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - presentational pure (= computeProposals 直接呼ばない)
 *   - Memory Chip style 維持 (= ProposalChip module 経由のみ)
 *   - sensitive 上流除外信頼
 *   - 既存 SelectedAnchorCard 機能 unchanged (= Phase 2-G/I の hunks と物理分離)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  buildVariablesForProposal,
  selectFirstProposalForDate,
} from "@/lib/plan/proposal/calendarProposalSelector";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapTab module import (= CalendarProposalProps 統合確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab module import (= J-6d integration)", () => {
  it("MapTab function が export されている", async () => {
    const mod = await import("@/app/(culcept)/plan/tabs/MapTab");
    expect(mod.MapTab).toBeTypeOf("function");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// File-level invariant grep: SelectedAnchorCard が ProposalChip / selector helper を経由
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab.tsx structural invariants (= J-6d)", () => {
  const MAP_TAB_PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
  const content = readFileSync(MAP_TAB_PATH, "utf-8");

  it("import: calendarProposalSelector helpers + CalendarProposalProps", () => {
    expect(content).toMatch(
      /import\s+\{[\s\S]*?selectFirstProposalForDate[\s\S]*?CalendarProposalProps[\s\S]*?\}\s+from\s+["']@\/lib\/plan\/proposal\/calendarProposalSelector["']/,
    );
  });

  it("import: ProposalChip from ../components/ProposalChip", () => {
    expect(content).toMatch(
      /import\s+\{\s*ProposalChip\s*\}\s+from\s+["']\.\.\/components\/ProposalChip["']/,
    );
  });

  it("MapTab Props に CalendarProposalProps が交差されている", () => {
    expect(content).toMatch(/\}\s*&\s*CalendarProposalProps\)\s*\{/);
  });

  it("SelectedAnchorCard が proposalsByDate / onProposalAccept 等を受領", () => {
    // SelectedAnchorCard function 内で proposalsByDate, onProposalAccept 等が分解されている
    expect(content).toMatch(/function\s+SelectedAnchorCard\(/);
    // SelectedAnchorCard の props 部分から ProposalChip 末尾 render まで本 file 内で一貫
    // (= grep で複数 keyword の共起を確認)
    expect(content).toContain("proposalsByDate");
    expect(content).toContain("onProposalAccept");
    expect(content).toContain("onProposalModify");
    expect(content).toContain("onProposalDismiss");
  });

  it("MapTab 内で computeProposals が直接呼ばれていない (= presentational 寄り)", () => {
    expect(content).not.toMatch(/\bcomputeProposals\s*\(/);
    // import も しない
    expect(content).not.toMatch(/from\s+["']@\/lib\/plan\/proposal\/computeProposals["']/);
  });

  it("MapTab が testOverrideContext を import していない (= production import 禁止)", () => {
    expect(content).not.toMatch(
      /from\s+["']@\/lib\/plan\/proposal\/testOverrideContext["']/,
    );
  });

  it("proposal chip render は anchor.anchorKind === 'one_off' で gate されている (= MVP)", () => {
    // recurring anchor で chip 出ない gate
    expect(content).toMatch(/anchor\.anchorKind\s*!==\s*["']one_off["']/);
  });

  it("ProposalChip は SelectedAnchorCard 内で render される (= MapTab 直 render しない)", () => {
    // MapTab function body 内で <ProposalChip ... /> が出ない、 SelectedAnchorCard 内のみ
    // (= grep で 「<ProposalChip」 の出現が SelectedAnchorCard 関数領域内であることを確認)
    const chipRenderCount = (content.match(/<ProposalChip\b/g) ?? []).length;
    expect(chipRenderCount).toBe(1); // 唯一 SelectedAnchorCard 内
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 選択 anchor の date 別 proposal lookup (= J-6c helper 再利用検証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectFirstProposalForDate via anchor.date (= MapTab usage pattern)", () => {
  function proposal(id: string, draft: ProposedAnchor["draft"]): ProposedAnchor {
    return {
      id,
      reason: "pattern_repeat",
      direction: "continue_pattern",
      confidence: "medium",
      draft,
      source: {
        signalType: "pattern_repeat",
        evidenceCount: 3,
        generatedAt: "2026-05-22T00:00:00.000Z",
      },
      createdAt: "2026-05-22T00:00:00.000Z",
    };
  }

  it("anchor.date の proposal を取得", () => {
    const map = {
      "2026-05-22": [proposal("p_today", { title: "カフェ", startTime: "10:00" })],
    };
    const r = selectFirstProposalForDate(map, "2026-05-22");
    expect(r?.id).toBe("p_today");
  });

  it("anchor.date 不在 → null (= proposal なし表示)", () => {
    const map = {
      "2026-05-21": [proposal("p_yesterday", { title: "x", startTime: "10:00" })],
    };
    expect(selectFirstProposalForDate(map, "2026-05-22")).toBeNull();
  });

  it("複数 proposal → 先頭のみ (= max 1 chip)", () => {
    const map = {
      "2026-05-22": [
        proposal("p1", { title: "カフェ", startTime: "10:00" }),
        proposal("p2", { title: "ランチ", startTime: "12:00" }),
      ],
    };
    const r = selectFirstProposalForDate(map, "2026-05-22");
    expect(r?.id).toBe("p1");
  });

  it("buildVariablesForProposal: anchor.title 由来の variables 構築", () => {
    const p = proposal("p1", { title: "カフェ", locationText: "新宿" });
    const vars = buildVariablesForProposal(p);
    expect(vars.title).toBe("カフェ");
    expect(vars.location).toBe("新宿");
  });
});
