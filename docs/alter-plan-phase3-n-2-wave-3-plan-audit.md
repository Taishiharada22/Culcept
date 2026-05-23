# Phase 3-N-2 Wave 3 Plan Audit (= 残候補 P-002〜P-008 再評価 + 新発見 P-010 surface + wave 3 範囲確定 + 連続 GO 判定)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 wave 2 closeout `41461b95` 着地後、 「wave 3 plan audit」 指示 + 前提 4 点)
**範囲**: wave 2 closeout 後の残候補 P-002〜P-008 の各 detailed 再評価 + **新発見 P-010 surface** (= 規約 24 の border 拡張) + wave 3 範囲確定 (= 自律推奨) + 実装プロトコル + risk 評価 + CEO smoke 計画 + 連続 GO 判定
**前提**: wave 2 closeout audit `41461b95` + 59 frozen branches + dev server localhost:3000 起動済 + 規約 24 全展開完成済

> 本 audit は **docs only**。 wave 3 範囲を最小実装に限定し、 low-risk 確認後、 wave 3 impl に連続 GO 判定する。 wave 3 impl 本体は別 branch + 別 commit。

---

## 0. CEO 方針 7 点 + 前提 4 点との整合 (= 自律推論で確認)

### 0.1 CEO 方針 7 点

| # | CEO 方針 | 本 audit の対応 |
|---|---|---|
| ① 前提を疑う | wave 2 完了後の「規約 24 は plan で完成」 という前提を疑う → **border surface に同 spirit 違反**を 11 箇所発見 |
| ② 時間をかけて | 残候補 7 件 + 新発見 P-010 を慎重に評価、 各候補の実態を再調査 |
| ③ シンプル + 論理 | P-010 は wave 2 と同 pattern (= focus 規約 24 spirit、 border 拡張) |
| ④ 外科的緻密 | 11 違反 line を特定、 影響評価 |
| ⑤ ゴール逆算 | /plan complete までの最短 path = 規約 24 の spirit を border まで完全展開 |
| ⑥ 推論力 | 「polish 候補」 と「規約 spirit 拡張」 を区別、 「border」 と「ring」 の違いを丁寧に分析 |
| ⑦ 革新 | 永続規約 24 を「ring 限定」 から「focus surface 全般」 へ自然拡張 |

### 0.2 CEO 前提 4 点 (= wave 2 closeout 時に明示)

| # | 前提 | 本 audit の対応 |
|---|---|---|
| ① brand color には戻さない | ✅ P-010 案でも brand color (= indigo) を slate に統一、 復活させない |
| ② slate 系 focus-visible 規約を維持 | ✅ wave 3 の修正方針 = `focus:` → `focus-visible:` + `slate-300` (= 規約 24 と同 pattern) |
| ③ wave 2 は visual-only closeout として閉じる | ✅ wave 2 範囲には触らない、 wave 3 は新 branch + 新 commit |
| ④ 他候補を混ぜず、 wave 3 は残候補 P-002〜P-008 の再評価から始める | ✅ §1 で P-002〜P-008 を各 detailed 再評価、 §2 で新発見 P-010 surface (= wave 2 が P-009 を surface したのと同 pattern) |

---

## 1. 残候補 P-002〜P-008 の各 detailed 再評価 (= CEO 明示順序通り)

### 1.1 P-002: M-2a/L-4a displayText spacing (= GPT 指摘 2)

**現状実態調査** (= grep + 文脈確認):
- M-2a/L-4a の displayText は `"移動 約 N 分"` 形式に固定 (= L 469)
- 既に半角スペース統一済 (= wave 2 plan で確認)
- 現在の class 適用: `<span aria-label={view.displayText}>{view.displayText}</span>` (= L 586, 592)

**自律推奨**: **(a) 何もしない** (= freeze 規約遵守、 既に統一済)
**wave 3 で扱うか**: ❌ **不採用** (= CEO 具体提案待ち、 wave 2 plan と同判定)

### 1.2 P-003: DayGraphTimeline hint span 位置 (= ml-2)

**現状実態調査**:
- L 517: `const hintText = isInteractive ? (expanded ? "閉じる" : "詳細") : null;`
- L 540-546: `<span className="ml-2 text-xs italic text-slate-400" aria-hidden="true">{hintText}</span>`

**polish 案 (= 4 通り、 wave 2 plan で評価済)**:
- (a) 現状維持 `ml-2`
- (b) `ml-3` で隙間広げ (= visual separator 強化)
- (c) `ml-4` で更に広げ
- (d) visual separator 追加 (= `·` 等) → 永続規約違反リスク

**自律推奨**: (a) 現状維持
**理由**: CEO smoke で「気になる」 指摘なし。 wave 2 closeout で「観測層 OS visual 規約」 が完成しており、 hint span は既に slate-* 階調と整合
**wave 3 で扱うか**: ❌ **不採用** (= 自律推奨改訂、 smoke 既に PASS で違和感報告なし)

### 1.3 P-004: FeasibilityDisclosureLine padding (= pl-8)

**現状実態調査**:
- L 587-588: `<div id={...} className="text-xs italic text-slate-400 pl-8" data-testid="day-graph-feasibility-disclosure">`
- `pl-8` (= 2rem) = transition より深い indent
- 視覚階層 (= event > transition > feasibility) の最深 indent

**自律推奨**: (a) 現状維持
**理由**: wave 2 plan と同判定。 規約 24 階調と整合、 視覚階層に意味あり
**wave 3 で扱うか**: ❌ **不採用** (= 違和感なし、 現状維持)

### 1.4 P-005: Plan header copy tone 統一

**現状実態調査** (= 各 tab header の実体):

| tab | header element | size | class | 内容 |
|---|---|---|---|---|
| MapTab | `<h2>` L 413 | text-sm | font-semibold text-slate-900 | `"あなたの地理"` |
| CalendarTab | `<h2>` L 286 | text-xl | font-semibold text-slate-900 | `formatJpYearMonth(currentMonth)` (= "2026年5月") |
| FlowTab | `<h3>` L 414 | text-sm | (TONE_CLASS by tone) | 各日 label (= 月日 + 曜日) |

**自律分析**:
- MapTab + FlowTab: `text-sm` で揃っている
- CalendarTab: `text-xl` で「月切替の主体」 (= 月 navigation UI 中心)
- これは各 tab の機能差を反映した **意図的な階層差**
- FlowTab の `TONE_CLASS.today = "text-indigo-700 font-semibold"` は brand accent で「今日」 を強調 (= 意図的、 規約 24 違反ではない = focus ring 文脈ではない)

**自律推奨**: (a) 現状維持
**理由**: 各 tab の機能性質 (= Map=地理参照 / Calendar=月 navigation / Flow=週 list) を反映した意図的差。 統一は機能性損なう
**wave 3 で扱うか**: ❌ **不採用** (= 意図的差、 統一非推奨)

### 1.5 P-006: Modal animation polish

**現状実態調査**:
- grep 結果: plan components 内に `motion.div` / `AnimatePresence` の直接記述なし
- 各 Modal (= AddAnchorModal / AnchorDetailModal / EditAnchorModal / SourceListModal) は HomeSwipeModalLock を register
- Modal animation 自体は別 library (= 共通 GlassmorphismCard / dialog 等) で管理されている可能性

**自律分析**:
- Modal animation は plan 範囲外の共通 component で管理
- 個別調整は scope 中-大 (= 共通 component 改変)
- frozen branch 規約遵守困難

**自律推奨**: (a) 現状維持
**wave 3 で扱うか**: ❌ **不採用** (= scope 中-大、 plan 範囲外)

### 1.6 P-007: Empty state copy 統一

**現状確認** (= wave 2 plan で評価済):
- CalendarTab L 467: `"予定なし"` (= text-slate-500)
- FlowTab L 442: `"予定なし ›"` (= button label)
- FlowTab L 397: `"${label} · 予定なし"` (= aria-label)
- MapTab: empty overlay で adaptive 文言

**自律推奨**: (a) 現状維持
**理由**: 既に「予定なし」 ベースで統一感、 各 tab 機能差を反映した適切な差異
**wave 3 で扱うか**: ❌ **不採用** (= wave 2 plan で確定済、 polish 不要)

### 1.7 P-008: swipe boundary 体験

**現状実態調査**:
- HomeSwipeContainer は plan 全体の swipe gesture を管理
- 各 Modal は `registerHomeSwipeModalOpen()` で swipe lock を register
- plan 自体は Phase 1 C3 (2026-05-20) で swipe lock 整合済

**自律分析**:
- swipe boundary 体験は HomeSwipeContainer 範囲 (= plan 外)
- scope 中-大 (= swipe gesture handler の調整)
- risk 中 (= 既存 swipe 機能への影響)

**自律推奨**: (a) 現状維持
**wave 3 で扱うか**: ❌ **不採用** (= plan 範囲外、 scope/risk 大)

### 1.8 残候補評価まとめ

| ID | 候補 | wave 3 採否 | 理由 |
|---|---|---|---|
| P-002 | M-2a/L-4a spacing | ❌ | 既に統一、 CEO 具体提案待ち |
| P-003 | hint span 位置 | ❌ | smoke PASS で違和感報告なし、 規約 24 と整合 |
| P-004 | 補助行 padding | ❌ | 視覚階層に意味あり、 違和感なし |
| P-005 | Plan header tone | ❌ | 各 tab 機能差を反映した意図的差、 統一非推奨 |
| P-006 | Modal animation | ❌ | plan 範囲外の共通 component、 scope 中-大 |
| P-007 | Empty state copy | ❌ | 既に統一感、 wave 2 plan で確定済 |
| P-008 | swipe boundary | ❌ | plan 範囲外、 scope/risk 中-大 |

→ **残候補 P-002〜P-008 は全て wave 3 不採用** (= 各候補の実態確認の結果、 polish 不要 or scope 外と判定)。

---

## 2. **新発見**: P-010 (= 規約 24 の border 拡張、 wave 2 P-009 surface と同 pattern)

### 2.1 自律探索 (= 前提を疑う、 CEO 方針 ①)

wave 2 で P-009 を surface したのと同じ手法 (= `focus:` + brand color grep) で、 **focus surface 全般** を再調査:
- 規約 24 は **focus ring** (= `focus-visible:ring-slate-300`) を確立
- しかし、 **focus border** (= `focus:border-*`) は規約対象外で残存
- spirit 上は同じ問題: 「観測の幕間」 = `focus:` (= focus-visible なし) で mouse click 後の visual 主張が残る

### 2.2 違反 surface 一覧 (= 2 file / 11 箇所)

| file | line | 現状 class (= 違反) | 違反種別 |
|---|---|---|---|
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 190 | `focus:border-indigo-400 focus:outline-none` | **完全違反** (= `focus:` + brand color) |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 202 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 213 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 286 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 350 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 404 | `focus:border-indigo-400 focus:outline-none` (multiline form) | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 437 | `focus:border-indigo-400 focus:outline-none` | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 448 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 463 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 525 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/ProposalChip.tsx` | 122 | `focus:border-slate-400 focus:outline-none` | **部分違反** (= `focus:` あり、 color は slate で OK) |

→ **計 11 箇所**で「focus surface に focus-visible: なし」 違反。 AnchorFormFields は brand color 復活、 ProposalChip は slate だが `focus:` (= focus-visible: なし) のため mouse click 後 stuck color が残る。

### 2.3 違反の影響評価

| 観点 | 完全違反 (= AnchorFormFields 10 箇所) | 部分違反 (= ProposalChip 1 箇所) |
|---|---|---|
| visual | mouse click 後 strong indigo border 残る | mouse click 後 slate-400 border 残る (= 弱い) |
| UX | mouse user に brand 主張 stuck | mouse user に弱い visual 主張 |
| 思想整合 | ❌ 「観測の幕間」 違反 + brand color 復活 | ⚠️ 「観測の幕間」 違反 (= focus: のみ、 color は OK) |
| smoke 観察 | input field focus 時に気付かれる | 影響範囲小 (= proposal chip の dashed border) |
| 規約 24 spirit | 違反 (= ring と border は同根: 「観測しない時は静か」) | 違反 |

### 2.4 P-010 の正式提案

**P-010: 規約 24 の border 拡張 (= focus surface 全般に「focus-visible: + slate-300」 原則を適用)**

| 項目 | 値 |
|---|---|
| priority | **高** (= 規約 spirit 整合性、 思想保護完成) |
| scope | **中** (= 2 file 11 箇所の同 pattern 修正) |
| risk | **低** (= visual のみ、 機能不変、 既存 test 影響 0) |
| 出典 | **自律探索発見** (= wave 2 着地後の grep 確認で発見、 wave 2 と同 pattern) |

### 2.5 規約 24 の自然拡張 (= 革新、 CEO 方針 ⑦)

**規約 24-extended**:
> すべての focus surface (= ring / border / outline) は `focus-visible:` + `slate-*` を使い、 `focus:` (= focus-visible なし) と brand color (= indigo, purple) を組み合わせない。

これにより:
- `focus:` の不使用 = mouse click 後の stuck visual 排除 (= 「観測の幕間」 完成)
- brand color の不使用 = focus 時の brand 主張排除 (= 「観測しない時は静か」)
- slate-* の使用 = WCAG 2.1 a11y 維持 + 規約 24 階調統一

---

## 3. Wave 3 範囲確定 (= 自律推奨)

### 3.1 採用: P-010 のみ (= 最小、 規約 spirit 拡張)

**変更対象** (= 2 file 11 箇所):

#### 3.1.1 完全違反 (= `focus:border-indigo-400`) → 規約 24-extended へ統一

```diff
-className="...focus:border-indigo-400 focus:outline-none..."
+className="...focus-visible:border-slate-300 focus:outline-none..."
```

対象:
- `AnchorFormFields.tsx` L 190 (= 1 line)
- `AnchorFormFields.tsx` L 202 (= 1 line)
- `AnchorFormFields.tsx` L 213 (= 1 line)
- `AnchorFormFields.tsx` L 286 (= 1 line)
- `AnchorFormFields.tsx` L 350 (= 1 line)
- `AnchorFormFields.tsx` L 404 (= 1 line、 multiline form)
- `AnchorFormFields.tsx` L 437 (= 1 line)
- `AnchorFormFields.tsx` L 448 (= 1 line)
- `AnchorFormFields.tsx` L 463 (= 1 line)
- `AnchorFormFields.tsx` L 525 (= 1 line)

#### 3.1.2 部分違反 (= `focus:border-slate-400`) → 規約 24-extended へ統一

```diff
-"cursor-pointer hover:border-slate-400 focus:border-slate-400 focus:outline-none"
+"cursor-pointer hover:border-slate-400 focus-visible:border-slate-400 focus:outline-none"
```

対象:
- `ProposalChip.tsx` L 122 (= 1 line)

**変更要素**:
1. `focus:border-indigo-400` → `focus-visible:border-slate-300` (= 完全違反箇所、 brand color → slate)
2. `focus:border-slate-400` → `focus-visible:border-slate-400` (= 部分違反箇所、 `focus:` → `focus-visible:`、 色は既に slate のため維持)
3. `focus:outline-none` は維持 (= ブラウザ標準 outline の上書きを保証する重要 class)

### 3.2 採用しない (= wave 3 範囲外)

| 候補 | 不採用理由 |
|---|---|
| P-002 | 既に統一、 CEO 具体提案待ち |
| P-003 | smoke PASS で違和感報告なし |
| P-004 | 視覚階層に意味あり、 違和感なし |
| P-005 | 各 tab 機能差反映、 統一非推奨 |
| P-006 | plan 範囲外の共通 component |
| P-007 | 既に統一感、 wave 2 plan で確定 |
| P-008 | plan 範囲外、 scope/risk 大 |

### 3.3 wave 3 が「最小」 である根拠

- 修正 file: 2 (= AnchorFormFields.tsx + ProposalChip.tsx)
- 修正 line: 11 (= class 文字列のみ)
- 関連 import: 変更なし
- 機能変更: 0 (= visual のみ)
- 新規 component / hook 追加: 0
- 関連 test: 既存 0 影響 (= focus border を直接 test していない)
- 規約 24-extended 整合: 完了 (= focus surface 全般を統一)

---

## 4. 実装プロトコル (= 外科的緻密)

### 4.1 修正手順 (= 11 step、 同 pattern)

各 file / line で:
1. 該当 class 文字列を上記 diff で変更
2. tsc 確認
3. 全 plan tests 確認 (= 2652 PASS 維持)
4. 既存 regression test (= `planComponentsFocusRingRegimeWiring.test.ts`) への影響 0 確認 (= ring と border は分離)
5. 新規 regression test 追加 (= 規約 24-extended を機械保証)

### 4.2 新規 regression test 設計

**目的**: P-010 wave 3 修正を **永続規約化**、 将来 plan component で `focus:border-*` / `focus-visible:border-indigo` 等の brand color focus border が再混入することを構造的に禁止。

**test 内容** (= 新規 test file 1 件 追加):

`tests/unit/plan/planComponentsFocusBorderRegimeWiring.test.ts`:

```typescript
/**
 * Phase 3-N-2 wave 3 (= 2026-05-23): 「観測層 OS visual 規約」 を focus border surface にも拡張
 *
 * 規約 24-extended (= wave 3 で確立):
 *   - すべての focus surface (= ring / border / outline) は focus-visible: + slate-*
 *   - focus: (= focus-visible なし) と brand color (= indigo, purple) の組合せ禁止
 *
 * 検証範囲 (= 否定系 + 肯定系の二重 assertion):
 *
 *   各 file × 3 invariants:
 *     1. focus:border-indigo 不在 (= 完全違反禁止)
 *     2. focus:border-slate 不在 (= 部分違反禁止、 focus-visible 不在の slate も禁止)
 *     3. **focus-visible:border-slate-* が存在** (= 肯定系、 focus border 自体の消失を検知)
 *        (P-010 修正対象 file のみ、 全 file に強制しない)
 *
 *   GPT 補正 (= wave 2 で確立): 「悪い class が無い」 だけでは focus border 自体が消えても通る → 肯定系 assertion 必須
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const TARGET_FILES = [
  "app/(culcept)/plan/components/AnchorFormFields.tsx",
  "app/(culcept)/plan/components/ProposalChip.tsx",
];

for (const path of TARGET_FILES) {
  describe(`N-2 wave 3 規約 24-extended 適用: ${path}`, () => {
    const content = readFileSync(path, "utf-8");

    it(`§1 ${path}: focus:border-indigo 不在`, () => {
      expect(content).not.toMatch(/focus:border-indigo/);
    });

    it(`§2 ${path}: focus:border-slate 不在 (= focus-visible 不在の slate も禁止)`, () => {
      expect(content).not.toMatch(/[^-]focus:border-slate/);
    });

    it(`§3 ${path}: focus-visible:border-slate-* 存在 (= 肯定系)`, () => {
      expect(content).toMatch(/focus-visible:border-slate-(300|400)/);
    });
  });
}

describe("N-2 wave 3 規約 24-extended 永続性宣言", () => {
  it("全 target file が読込可能", () => {
    for (const path of TARGET_FILES) {
      expect(() => readFileSync(path, "utf-8")).not.toThrow();
    }
  });

  it("規約 24-extended は 2 file に適用", () => {
    expect(TARGET_FILES.length).toBe(2);
  });
});
```

**配置**: 新規 test file `tests/unit/plan/planComponentsFocusBorderRegimeWiring.test.ts`
**tests 数**: 2 file × 3 invariants = 6 + 2 cross-file 宣言 = **8 tests**

### 4.3 影響範囲 (= 機械検証可能)

| 項目 | 影響 |
|---|---|
| 機能変更 | 0 (= visual のみ) |
| backward compat | 100% (= class 文字列のみ変更) |
| a11y | 改善 (= mouse user に stuck border 排除 + keyboard user 維持) |
| 既存 test | 0 影響 (= focus border を直接 test していない) |
| 既存 ring regime test (= wave 2 の 26 tests) | 0 影響 (= ring と border は分離 test) |
| 既存 K-3a / L-4d / M-3c-ui invariants | 0 影響 |
| L / M phase / wave 1 / wave 2 | 0 影響 |
| frozen branches | 触らない |

---

## 5. Risk 評価

### 5.1 Risk Matrix

| Risk | level | 緩和策 |
|---|---|---|
| visual regression (= 既存 indigo 色を期待する箇所) | 低 | wave 2 で card / button に同種修正適用済、 user は slate-* に慣れている |
| a11y regression | 0 | focus-visible で keyboard a11y 維持 (= 規約 24 完全準拠) |
| user 混乱 | 低 | wave 2 で同様の修正済、 user 経験は連続 |
| AddAnchorModal / EditAnchorModal の入力体験 | 低 | mouse click 後 stuck border 排除で改善、 keyboard で slate border 維持 |
| ProposalChip dashed border 体験 | 低 | proposal chip は読み取り中心、 focus 機会少 |
| 既存 form validation 連動 | 0 | class 文字列のみ、 validation は別 layer |
| M phase 規約違反 | 0 | むしろ規約 24-extended を完成、 思想保護強化 |
| freeze 規約違反 | 0 | wave 1/2 file は touch しない (= wave 3 file は別 file) |

### 5.2 「focus-visible:border-slate-300」 の妥当性 (= 前提を疑う、 CEO 方針 ①)

**選択肢の検討**:

| Option | 概要 | 評価 |
|---|---|---|
| A: `focus-visible:border-slate-300` | 規約 24 と同色、 統一感最大 | ✅ **推奨** (= 視覚階調の完全統一) |
| B: `focus-visible:border-indigo-400` | brand color を keyboard 限定で維持 | ❌ CEO 前提 「brand color には戻さない」 違反 |
| C: focus border 削除 | focus 時 border 変化なし、 ring に統一 | ⚠️ a11y で focus 不明瞭リスク (= input field では border が主 indicator) |
| D: `focus-visible:border-slate-400` | やや濃い slate | ⚠️ 既存規約は slate-300、 統一性損なう |

→ **Option A (= focus-visible:border-slate-300)** が CEO 前提 + 規約 24 spirit + a11y の三立解。

### 5.3 「focus:outline-none」 を維持する妥当性

`focus:outline-none` は **必須維持**:
- ブラウザ標準 outline の上書きを保証
- 削除すると native outline が残り、 visual ノイズが増加
- 規約 24 自体も `focus:outline-none focus-visible:ring-*` の組合せで成立

→ 維持。

### 5.4 「11 箇所修正」 の risk 評価

| 観点 | 評価 |
|---|---|
| pattern 統一性 | 全 11 箇所が同 pattern (= focus border の class 文字列のみ) |
| 修正の局所性 | 各 line 単位で独立 (= 1 箇所 revert しても他に影響なし) |
| ロールバック容易性 | 高 (= 11 line を 1 by 1 で revert 可能) |
| 機械検証 | 規約 24-extended の grep で 0 hit 確認 |

→ **11 箇所修正は scope 中、 risk 低、 規約整合性大幅向上**。

---

## 6. CEO Smoke 計画 (= wave 3 専用)

### 6.1 smoke 確認項目 (= 5 件)

| # | 確認項目 | 期待挙動 |
|---|---|---|
| 1 | AddAnchorModal の入力 field click → mouse 後 | 強い indigo border stuck 消える、 slate-300 border (= keyboard 時のみ) |
| 2 | AddAnchorModal の入力 field Tab key で focus | slate-300 border 出現 |
| 3 | EditAnchorModal の入力 field 動作 | 同上 (= mouse stuck 消える / keyboard で slate border) |
| 4 | ProposalChip click → mouse 後 | 強い slate-400 stuck border 消える |
| 5 | 全 plan tab で AddAnchorModal/EditAnchorModal 起動 + 入力動作 | 機能不変、 入力可能 |

### 6.2 smoke 想定時間
- 5-10 分 (= 1 件あたり 1-2 分の sweep)

### 6.3 smoke FAIL 時の対応
- mouse click 後 border 残る → 該当 file の class 確認
- keyboard で border 出ない → focus-visible class 確認
- 入力動作不能 → focus:outline-none を確認 (= 維持必須)
- 視覚崩れ → 該当 line revert

---

## 7. 連続 GO 判定

### 7.1 判定 chart

| 判定軸 | 評価 |
|---|---|
| 危険境界 (= 機能変更 / 文言 / 警告色 / DB等) | 0 |
| 既存 file 改変範囲 | 2 file / 11 line |
| backward compat | 100% |
| 既存 tests への影響 | 0 |
| 既存 wave 2 regression test への影響 | 0 (= ring と border は分離 test) |
| 思想整合性 (= 規約 24-extended 全展開) | **最高** |
| ロールバック容易性 | 高 (= 各 line 独立) |
| 機械検証可能性 | 高 (= 8 tests 追加) |
| CEO smoke 簡潔性 | 高 (= 5 件 / 5-10 分) |

### 7.2 結論

✅ **N-2 wave 3 impl 連続 GO**

理由:
- 全判定軸が low-risk
- wave 2 で確立した規約 24 の自然な border 拡張
- 2 file / 11 line + 8 tests で完結
- CEO smoke 簡潔 (= 5 件)
- ロールバック容易
- CEO 前提 4 点完全遵守

---

## 8. 実装着地予定

### 8.1 新規 branch

- `feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended`

### 8.2 変更 file (= 3 件)

| file | 変更 |
|---|---|
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | L 190, 202, 213, 286, 350, 404, 437, 448, 463, 525 (= 10 line) 規約 24-extended 統一 |
| `app/(culcept)/plan/components/ProposalChip.tsx` | L 122 (= 1 line) 同上 |
| `tests/unit/plan/planComponentsFocusBorderRegimeWiring.test.ts` | 新規 (= 8 tests) |

### 8.3 変更しない

- 他全 file
- frozen branches
- M-2a / L-4a 文言
- DayGraphTimeline / MapTab / FlowTab / CalendarTab / PlaceCandidatesPanel (= wave 2 適用済)
- 他 polish 候補 (P-002〜P-008)
- 既存 wave 2 regression test (= ring 用 26 tests、 別 file)

### 8.4 commit message プレビュー

```
feat(plan): Phase 3-N-2 Wave 3 — P-010 規約 24-extended (= focus border 規約拡張、 11 line 修正 + 8 regression tests)
```

---

## 9. CEO 判断項目 (= 報告で停止)

### 9.1 5 件の CEO 判断

1. **P-010 wave 3 impl 連続 GO 承認**: 本 audit 着地後、 11 line + 8 tests 追加で連続実装するか
2. **「規約 24-extended」 命名承認**: focus surface 全般に拡張する概念命名で OK か
3. **focus-visible:border-slate-300 採用承認**: Option A の妥当性 (= 規約 24 統一階調) で OK か
4. **CEO smoke 計画 5 件承認**: 確認項目で十分か
5. **wave 3 完了後の進行**: wave 3 closeout audit → smoke → wave 4 (= 残候補 or 新発見) plan の流れ承認

### 9.2 自律推奨 (= 一括)

| 項目 | 推奨 |
|---|---|
| wave 3 impl 連続 GO | ✅ 推奨 (= low-risk 全件達成、 規約 spirit 拡張) |
| 規約 24-extended 命名 | 推奨 (= ring/border/outline 全般に自然拡張) |
| Option A 採用 | 推奨 (= CEO 前提 + 規約 24 spirit + a11y 三立) |
| smoke 5 件 | 十分 (= 全違反箇所を網羅) |
| wave 3 完了後 | wave 3 closeout audit → CEO smoke → wave 4 plan or N-2 phase 完了判定の流れ |

---

## 10. 凍結 / 連続 OK / 禁止リスト

### 10.1 凍結対象

- 全 59 frozen branches
- 本 audit 着地後 frozen 予定 (= **60 frozen branches** 想定)

### 10.2 連続 OK

- `docs/alter-plan-phase3-n-2-wave-3-plan-audit.md` (= 本 commit)
- `docs/decision-log.md` 追記
- **次**: N-2 wave 3 impl (= 別 branch、 連続 GO 候補)

### 10.3 禁止

- frozen branches への追加 commit
- M phase の追加変更
- M-2a / L-4a 文言の変更
- DayGraphTimeline / MapTab / FlowTab / CalendarTab / PlaceCandidatesPanel (= wave 2 適用済) の追加変更
- 他 polish 候補 (P-002〜P-008) の wave 3 で実施
- 既存 wave 2 regression test (= 26 tests) への変更
- 大規模 refactor
- 新規 component / hook 追加
- Counter-Factual / Pattern / empty day ALTER flow の勝手な scope 外化
- Routes API / 実 API 連携
- Arrival Risk Memory (= 永続禁止)
- warning / recommendation / optimization 文言 (= 永続禁止)
- amber / orange / red / icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- **Deploy readiness / Stargazer pivot / 初期 user 獲得** (= /plan complete 後)
- fetch / push / gh / reset / restore / stash / branch delete
- **brand color (= indigo, purple) の focus context 復活** (= CEO 前提 ① 違反)
- **slate 系 focus-visible 規約からの離脱** (= CEO 前提 ② 違反)
- **wave 2 の visual-only closeout 性格破棄** (= CEO 前提 ③ 違反)

---

## 11. CEO 報告 + 停止条件

### 11.1 本 audit の到達点

- 残候補 P-002〜P-008 の各 detailed 再評価 (= 全 7 件不採用、 各理由 surface)
- **新発見 P-010**: 規約 24 の border 拡張、 2 file 11 箇所違反
- wave 3 範囲確定 (= P-010 のみ)
- 2 file / 11 line + 8 tests の実装プロトコル
- risk 評価 (= 全項目 low)
- CEO smoke 計画 (= 5 件 / 5-10 分)
- 連続 GO 判定 ✅
- CEO 判断 5 件
- 規約 24-extended 命名提案 (= ring→focus surface 全般)

### 11.2 CEO 前提 4 点との整合確認

| 前提 | 整合確認 |
|---|---|
| ① brand color には戻さない | ✅ Option A (= focus-visible:border-slate-300) で brand color → slate |
| ② slate 系 focus-visible 規約を維持 | ✅ wave 3 は規約 24-extended で focus-visible: + slate-* 統一 |
| ③ wave 2 は visual-only closeout として閉じる | ✅ wave 2 file は touch しない (= wave 3 は別 file) |
| ④ 他候補を混ぜず、 残候補 P-002〜P-008 の再評価から始める | ✅ §1 で 7 候補全 detailed 再評価、 §2 で新発見 P-010 surface (= wave 2 と同 pattern) |

### 11.3 停止条件

以下のいずれかが発生した場合、 **即停止**:
- 11 line + 8 tests の範囲を超える変更が必要
- wave 1/2 適用済 file への追加変更
- 新規 component / hook 追加
- M phase の追加変更
- M-2a / L-4a 文言の変更
- frozen branches への追加 commit
- 他 polish 候補 (P-002〜P-008) が wave 3 に混入
- 警告色 / icon / 警告文言 近接
- brand color の focus context 復活
- slate 系 focus-visible 規約からの離脱
- localStorage / DB / env / package / dependency 変更
- Deploy readiness / 別軸 pivot

---

**完了**: Phase 3-N-2 Wave 3 Plan Audit 着地。 残候補 P-002〜P-008 の各 detailed 再評価 (= 全 7 件不採用) + **新発見 P-010** (= 規約 24-extended、 focus border 拡張) + wave 3 範囲 = **P-010 のみ** (= 2 file 11 line + 8 tests) + risk 全件 low + 連続 GO 判定 ✅ + CEO 判断 5 件 + CEO 前提 4 点完全遵守。 次は N-2 wave 3 impl (= 別 branch、 連続 GO 候補)。
