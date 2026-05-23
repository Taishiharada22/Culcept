/**
 * Phase 3-N-2 wave 3 — 「観測層 OS visual 規約」 を focus border surface に拡張 (= 規約 24-extended)
 *
 * 規約 24-extended (= wave 3 で確立、 wave 1+2 の ring 規約を border に自然拡張):
 *   - すべての focus surface (= ring / border / outline) は `focus-visible:` + `slate-*`
 *   - `focus:` (= focus-visible なし) と brand color (= indigo, purple) の組合せ禁止
 *
 * 本質 (= CEO + GPT 補正、 2026-05-23):
 *   - brand color をやめる (= indigo / purple → slate)
 *   - `focus:` を `focus-visible:` にする (= mouse stuck visual 排除)
 *   - focus visibility を失わない (= keyboard a11y 維持)
 *   - 「slate-300 固定」 自体は目的化しない。 visibility 優先で 300/400 を選ぶ
 *
 * 検証範囲 (= 否定系 + 肯定系の二重 assertion、 wave 2 の GPT 補正パターン継承):
 *
 *   各 file × 4 invariants:
 *     1. focus:border-indigo 不在 (= 完全違反禁止、 brand color + focus: visibility なし)
 *     2. focus-visible:border-indigo 不在 (= 部分違反禁止、 brand color の keyboard 限定残留も禁止)
 *     3. focus:border-slate 不在 (= visibility なし slate も禁止、 「focus:」 自体が違反)
 *     4. **focus-visible:border-slate-* が存在** (= 肯定系、 GPT 補正反映)
 *
 *   wave 2 GPT 補正の継承: 「悪い class が無い」 だけだと border 自体が消えても通る
 *   → 肯定系 assertion (= focus-visible:border-slate-300 or slate-400) 必須
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / network 不使用 / localStorage 不使用
 *   - 機能変更 0 (= visual 規約のみ機械保証)
 *   - K phase / L / M phase / wave 1 / wave 2 既存 invariants 影響 0
 *   - 既存 ring regime test (= planComponentsFocusRingRegimeWiring.test.ts) 影響 0
 *
 * 設計書:
 *   - docs/alter-plan-phase3-n-2-wave-3-plan-audit.md (= 051662a9)
 *   - docs/alter-plan-phase3-n-2-wave-2-closeout-audit.md (= 41461b95、 規約 24 全展開完成)
 *   - docs/alter-plan-phase3-n-2-wave-1-closeout-audit.md (= 8449bb64、 規約 24 確立)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Target files (= 規約 24-extended border 拡張対象、 2 file)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TARGET_FILES: ReadonlyArray<{ path: string; description: string }> = [
  {
    path: "app/(culcept)/plan/components/AnchorFormFields.tsx",
    description:
      "AnchorFormFields (= AddAnchorModal/EditAnchorModal の form fields、 wave 3 で 10 line 修正)",
  },
  {
    path: "app/(culcept)/plan/components/ProposalChip.tsx",
    description:
      "ProposalChip (= dashed border の提案 chip、 wave 3 で 1 line 修正、 slate-400 維持)",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-file invariants (= 各 file 4 assertions、 計 2 file × 4 = 8 tests)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

for (const { path, description } of TARGET_FILES) {
  describe(`N-2 wave 3 規約 24-extended 適用: ${description}`, () => {
    const content = readFileSync(path, "utf-8");

    // ── 否定系 (= 違反 pattern の不在) ────────────────────────────────────

    it(`§1 ${path}: focus:border-indigo 不在 (= 完全違反禁止)`, () => {
      // 「focus: + indigo」 (= focus-visible なし + brand color) は規約 24-extended 違反
      expect(content).not.toMatch(/focus:border-indigo/);
    });

    it(`§2 ${path}: focus-visible:border-indigo 不在 (= 部分違反禁止)`, () => {
      // 「focus-visible + indigo」 (= keyboard a11y は OK だが brand color が残る) は規約 24-extended 違反
      expect(content).not.toMatch(/focus-visible:border-indigo/);
    });

    it(`§3 ${path}: focus:border-slate 不在 (= visibility なし slate も禁止)`, () => {
      // 「focus: + slate」 (= brand color は OK だが focus-visible: 不在で mouse stuck) も規約 24-extended 違反
      // CEO + GPT 補正: 本質は「focus: を focus-visible: にする」、 color 単独では十分でない
      expect(content).not.toMatch(/[^-]focus:border-slate/);
    });

    // ── 肯定系 (= GPT 補正反映、 focus border 自体の消失を検知) ──────────

    it(`§4 ${path}: focus-visible:border-slate-* が存在 (= 肯定系、 focus border 自体の消失を検知)`, () => {
      // GPT 補正 (= 2026-05-23): 「悪い class が無い」 だけだと、 focus border 自体が
      // 消えても通る可能性がある → 肯定系 assertion 必須
      //
      // 全 target file は user interactive な component (= input / select / button) を含み、
      // a11y のため少なくとも 1 つの focus-visible:border-slate-300 または slate-400 を持つ必要がある。
      //
      // CEO + GPT 補正: 「slate-300 固定」 自体は目的化しない、 visibility 優先で 300/400 を選ぶ
      expect(content).toMatch(/focus-visible:border-slate-(300|400)/);
    });
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-file 規約宣言 (= 規約 24-extended 永続性の構造的保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("N-2 wave 3 規約 24-extended 永続性宣言 (= 2 file 全件)", () => {
  it("全 target file が読込可能 (= file 削除や rename を検知)", () => {
    for (const { path } of TARGET_FILES) {
      expect(() => readFileSync(path, "utf-8")).not.toThrow();
    }
  });

  it("規約 24-extended は 2 file に適用 (= TARGET_FILES の数で永続管理)", () => {
    expect(TARGET_FILES.length).toBe(2);
  });
});
