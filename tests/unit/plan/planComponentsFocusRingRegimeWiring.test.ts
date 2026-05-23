/**
 * Phase 3-N-2 wave 2 — 「観測層 OS visual 規約」 全 plan component 適用 regression
 *
 * 規約 24 (= wave 1 で確立、 wave 2 で全展開):
 *   - すべての focus ring は `focus-visible:` + `ring-slate-300`
 *   - `focus:` (= focus-visible なし) と brand color (= indigo, purple) は禁止
 *   - `ring-offset-*` も「観測の幕間」 思想に合わない (= ring が前面に出る = 観測の主張)
 *
 * 検証範囲 (= GPT 補正反映、 否定系 + 肯定系の二重 assertion):
 *
 *   各 file × 4 invariants:
 *     1. focus:ring-indigo 不在 (= 完全違反禁止)
 *     2. focus-visible:ring-indigo 不在 (= 部分違反禁止)
 *     3. focus-visible:ring-offset-* 不在 (= 「観測の幕間」 思想整合)
 *     4. **focus-visible:ring-slate-300 が存在** (= 肯定系、 focus ring 自体の消失を検知)
 *        GPT 補正 (= 2026-05-23): 「悪い class が無い」 だけだと、 focus ring 自体が
 *        消えても通る可能性がある → 肯定系 assertion 必須
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / network 不使用 / localStorage 不使用
 *   - 機能変更 0 (= visual 規約のみ機械保証)
 *   - K phase / L / M phase / wave 1 既存 invariants 影響 0
 *
 * 設計書:
 *   - docs/alter-plan-phase3-n-2-wave-2-plan-audit.md (= 73a7405d)
 *   - docs/alter-plan-phase3-n-2-wave-1-closeout-audit.md (= 8449bb64、 規約 24 確立)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Target files (= 規約 24 全展開対象、 6 file)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TARGET_FILES: ReadonlyArray<{ path: string; description: string }> = [
  {
    path: "app/(culcept)/plan/components/DayGraphTimeline.tsx",
    description: "DayGraphTimeline (= K-3a EventItem + M-3c-ui TransitionItem、 wave 1 で適用済)",
  },
  {
    path: "app/(culcept)/plan/tabs/MapTab.tsx",
    description: "MapTab (= 予定 / カテゴリ card、 wave 2 で適用)",
  },
  {
    path: "app/(culcept)/plan/tabs/FlowTab.tsx",
    description: "FlowTab (= 予定 card、 wave 2 で適用)",
  },
  {
    path: "app/(culcept)/plan/tabs/CalendarTab.tsx",
    description: "CalendarTab (= 予定 card、 wave 2 で適用)",
  },
  {
    path: "app/(culcept)/plan/components/PlaceCandidatesPanel.tsx",
    description: "PlaceCandidatesPanel (= AddAnchorModal 内、 wave 2 で適用)",
  },
  {
    path: "app/(culcept)/plan/components/AnchorFormFields.tsx",
    description: "AnchorFormFields (= AddAnchorModal/EditAnchorModal 内、 wave 2 で適用)",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-file invariants (= 各 file 4 assertions、 計 6 file × 4 = 24 tests)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

for (const { path, description } of TARGET_FILES) {
  describe(`N-2 wave 2 規約 24 適用: ${description}`, () => {
    const content = readFileSync(path, "utf-8");

    // ── 否定系 (= 違反 pattern の不在) ────────────────────────────────────

    it(`§1 ${path}: focus:ring-indigo 不在 (= 完全違反禁止)`, () => {
      // 「focus: + indigo」 (= focus-visible なし + brand color) は規約 24 違反
      expect(content).not.toMatch(/focus:ring-indigo/);
    });

    it(`§2 ${path}: focus-visible:ring-indigo 不在 (= 部分違反禁止)`, () => {
      // 「focus-visible + indigo」 (= keyboard a11y は OK だが brand color が残る) は規約 24 違反
      expect(content).not.toMatch(/focus-visible:ring-indigo/);
    });

    it(`§3 ${path}: focus-visible:ring-offset-* 不在 (= 「観測の幕間」 思想整合)`, () => {
      // ring-offset は brand color と組合せ前提の装飾、 slate-300 と組合せると思想違反
      // (= ring が前面に出る = 観測の主張) のため禁止
      expect(content).not.toMatch(/focus-visible:ring-offset-\d/);
    });

    // ── 肯定系 (= GPT 補正反映、 focus ring 自体の消失を検知) ───────────

    it(`§4 ${path}: focus-visible:ring-slate-300 が存在 (= 肯定系、 focus ring 自体の消失を検知)`, () => {
      // GPT 補正 (= 2026-05-23): 「悪い class が無い」 だけだと、 focus ring 自体が
      // 消えても通る可能性がある → 肯定系 assertion 必須
      //
      // 全 target file は user interactive な component (= card / button / input) を含み、
      // a11y のため少なくとも 1 つの focus-visible:ring-slate-300 を持つ必要がある。
      expect(content).toMatch(/focus-visible:ring-slate-300/);
    });
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-file 規約宣言 (= 規約 24 永続性の構造的保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("N-2 wave 2 規約 24 永続性宣言 (= 6 file 全件)", () => {
  it("全 target file が読込可能 (= file 削除や rename を検知)", () => {
    for (const { path } of TARGET_FILES) {
      expect(() => readFileSync(path, "utf-8")).not.toThrow();
    }
  });

  it("規約 24 は 6 file に適用 (= TARGET_FILES の数で永続管理)", () => {
    expect(TARGET_FILES.length).toBe(6);
  });
});
