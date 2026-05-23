# Phase 3-N-2 Wave 2 Plan Audit (= 残候補棚卸し + P-009 発見 + wave 2 範囲確定 + 連続 GO 判定)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 wave 1 closeout `8449bb64` 着地後、 「wave 2 plan」 指示)
**範囲**: wave 1 残候補 7 件 (= P-002〜P-008) の詳細自律分析 + **新 P-009 発見 surface** + wave 2 範囲確定 (= 自律推奨) + 実装プロトコル + risk 評価 + CEO smoke 計画 + 連続 GO 判定
**前提**: wave 1 closeout audit `8449bb64` + 56 frozen branches + dev server localhost:3000 起動済 + 永続規約 24 件目確立済

> 本 audit は **docs only**。 wave 2 範囲を最小実装に限定し、 low-risk 確認後、 wave 2 impl に連続 GO 判定する。 wave 2 impl 本体は別 branch + 別 commit。

---

## 0. CEO 方針 7 点との整合 (= 自律推論で確認)

| # | CEO 方針 | 本 audit の対応 |
|---|---|---|
| ① 前提を疑う | wave 1 完了後の「他は polish 候補だけ」 という前提を疑う → **規約 24 違反**を 4-5 file で発見 |
| ② 時間をかけて | wave 1 残候補 + 新発見 P-009 を慎重に評価 |
| ③ シンプル + 論理 | P-009 は wave 1 と同 pattern (= focus ring 統一)、 視覚 + 規約整合性 |
| ④ 外科的緻密 | 各違反 line を特定、 影響評価 |
| ⑤ ゴール逆算 | /plan complete までの最短 path = 規約 24 を全 component に展開 |
| ⑥ 推論力 | 「polish 候補」 と「規約整合性違反」 を区別 |
| ⑦ 革新 | 永続規約 24 件目を「全 component に適用」 して観測層 OS visual 規約を完成 |

---

## 1. **重大発見**: 規約 24 違反 (= P-009 発見)

### 1.1 wave 1 で確立した規約 24

**永続規約 24** (= wave 1 closeout で正式記録):
- すべての focus ring は `focus-visible:` + `slate-300`
- `focus:` (= focus-visible なし) と brand color (= indigo, purple) は禁止
- `ring-offset-*` も「観測の幕間」 思想に合わない (= 「ring が前面に出る」 = 観測の主張)

### 1.2 違反 surface 一覧 (= 4 file / 7 箇所)

| file | line | 現状 class (= 違反) | 違反種別 |
|---|---|---|---|
| `app/(culcept)/plan/tabs/MapTab.tsx` | 1463 | `focus:ring-2 focus:ring-indigo-400` | **完全違反** (= `focus:` + indigo) |
| `app/(culcept)/plan/tabs/MapTab.tsx` | 1586 | 同上 | 完全違反 |
| `app/(culcept)/plan/tabs/FlowTab.tsx` | 566 | 同上 | 完全違反 |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | 516 | 同上 | 完全違反 |
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` | 342 | `focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1` | **部分違反** (= indigo + ring-offset) |
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` | 452 | 同上 | 部分違反 |
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` | 487 | 同上 | 部分違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 405 | 同上 | 部分違反 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | 499 | 同上 | 部分違反 |

→ **計 9 箇所**で規約 24 違反。 wave 1 で DayGraphTimeline L 402 を修正したが、 他 4 file 8 箇所が未対応。

### 1.3 違反の影響評価

| 観点 | 完全違反 (= MapTab/Flow/Calendar の card style) | 部分違反 (= PlaceCandidatesPanel/AnchorFormFields) |
|---|---|---|
| visual | 強い青 stuck ring (= mouse click 後残る) | 弱い青 ring (= focus-visible で keyboard のみ、 但し青) |
| UX | mouse user に「警告化」 リスク | mouse user 影響なし、 keyboard user 青 ring が残る |
| 思想整合 | ❌ 「観測の幕間」 違反、 「警告化」 リスク | ⚠️ slate-* 階調規約違反、 keyboard user に brand color |
| smoke 観察 | CEO smoke で気付かれる可能性高 | keyboard user の少なさで気付きにくい |

### 1.4 P-009 の正式提案

**P-009: 「観測層 OS visual 規約」 (= 規約 24) を全 plan component に適用**

| 項目 | 値 |
|---|---|
| priority | **高** (= 規約整合性、 思想保護) |
| scope | **中** (= 4 file 9 箇所の同 pattern 修正) |
| risk | **低** (= visual のみ、 機能不変、 既存 test 影響 0) |
| 出典 | **自律探索発見** (= wave 1 着地後の grep 確認で発見) |

---

## 2. 残候補 7 件の詳細自律分析

### 2.1 P-002: spacing 統一 (= GPT 指摘 2)

**現状**: 既に半角スペース統一済
**自律推奨**: **(a) 何もしない** (= freeze 規約遵守)
**wave 2 で扱うか**: ❌ **不採用** (= CEO 具体提案待ち)

### 2.2 P-003: DayGraphTimeline hint span 位置 (= ml-2)

**現状**:
```tsx
<span className="ml-2 text-xs italic text-slate-400" aria-hidden="true">
  {hintText}
</span>
```

**自律分析**:
- `ml-2` (= 0.5rem) は transition text と hint の隙間
- 視覚的に「移動 約 90 分 詳細」 が並ぶ
- polish 案 (= 4 通り):
  - (a) 現状維持 `ml-2`
  - (b) `ml-3` で隙間広げ (= visual separator 強化)
  - (c) `ml-4` で更に広げ
  - (d) visual separator 追加 (= `·` 等) → 但し icon 風要素なので **永続規約違反リスク**

**自律推奨**: (a) 現状維持 or (b) `ml-3` (= 小修正、 視覚分離強化)
**wave 2 で扱うか**: ⚠️ smoke 評価次第 (= CEO の意見必要)

### 2.3 P-004: FeasibilityDisclosureLine padding (= pl-8)

**現状**: `pl-8` (= 2rem) で transition より深い indent
**自律分析**:
- 視覚階層 (= event > transition > feasibility) の最深 indent
- polish 案: 現状で十分 (= 規約 24 階調と整合)
**自律推奨**: (a) 現状維持
**wave 2 で扱うか**: ❌ **不採用** (= 違和感なし)

### 2.4 P-005: Plan header copy tone 統一

**現状**: 各 tab で異なる header (= "あなたの地理" / "今日の予定" 等)
**自律分析**:
- header copy は各 tab の機能を表す自然な文言
- 統一は scope 中 (= 各 tab で書き換え + tests)
**自律推奨**: ⚠️ smoke 評価次第
**wave 2 で扱うか**: ⚠️ priority 低-中、 wave 3+ 候補

### 2.5 P-006: Modal animation polish

**現状**: Framer Motion 既存使用
**自律分析**:
- 各 Modal (= AddAnchorModal / AnchorDetailModal / etc) で動作が異なる
- 統一は scope 中-大 (= 5 Modal で animation 統一)
**自律推奨**: ⚠️ scope 大、 priority 低
**wave 2 で扱うか**: ❌ **不採用** (= wave 3+ 候補)

### 2.6 P-007: Empty state copy 統一

**現状調査結果**:
- CalendarTab L 467: `<p>予定なし</p>` (= text-slate-500)
- FlowTab L 442: `予定なし ›` (= button label)
- FlowTab L 397: `${label} · 予定なし` (= aria-label)
- MapTab: empty state は overlay 経由 (= 「今後の予定がまだありません」 等の adaptive 文言)

**自律分析**:
- **既に「予定なし」 ベースで統一感**
- 大きな polish 余地は限定的
- CalendarTab の plain text vs FlowTab の button `›` は意図的な差 (= 各 tab 機能差を反映)
- 統一は無理に行わない方が良い

**自律推奨**: (a) 現状維持 (= 既に統一感、 各 tab 機能差を尊重)
**wave 2 で扱うか**: ❌ **不採用 (= 自律推奨改訂)** — N-1 closeout 時の第 1 推奨だったが、 実態を確認した結果「polish 不要」 と判定

### 2.7 P-008: swipe boundary 体験

**現状**: HomeSwipeContainer の端での体験
**自律分析**:
- scope 中-大 (= swipe gesture handler の調整)
- risk 中 (= 既存 swipe 機能への影響)
**自律推奨**: ⚠️ scope/risk 大、 wave 3+ 候補
**wave 2 で扱うか**: ❌ **不採用**

### 2.8 候補評価まとめ

| ID | 候補 | wave 2 採否 | 理由 |
|---|---|---|---|
| P-002 | spacing 統一 | ❌ | CEO 具体提案待ち、 freeze 規約あり |
| P-003 | hint span 位置 | ⚠️ | smoke 評価次第、 wave 2 候補 |
| P-004 | 補助行 padding | ❌ | 違和感なし、 現状維持 |
| P-005 | Plan header tone | ❌ | wave 3+ |
| P-006 | Modal animation | ❌ | scope 中-大、 wave 3+ |
| P-007 | Empty state copy | ❌ | 既に統一感、 現状維持 (= 自律推奨改訂) |
| P-008 | swipe boundary | ❌ | wave 3+ |
| **P-009** | **規約 24 を全 component 適用** | ✅ **wave 2 採用候補** | 規約整合性、 priority 高、 risk 低 |

---

## 3. Wave 2 範囲確定 (= 自律推奨)

### 3.1 採用: P-009 のみ (= 最小、 規約整合性)

**変更対象** (= 4 file 9 箇所):

#### 3.1.1 完全違反 (= `focus:` + indigo) → 規約 24 へ統一

```diff
-className="...focus:outline-none focus:ring-2 focus:ring-indigo-400"
+className="...focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
```

対象:
- `MapTab.tsx` L 1463 (= 1 line)
- `MapTab.tsx` L 1586 (= 1 line)
- `FlowTab.tsx` L 566 (= 1 line)
- `CalendarTab.tsx` L 516 (= 1 line)

#### 3.1.2 部分違反 (= focus-visible + indigo + ring-offset) → 規約 24 へ統一

```diff
-focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1
+focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300
```

対象:
- `PlaceCandidatesPanel.tsx` L 342, 452, 487 (= 3 lines)
- `AnchorFormFields.tsx` L 405, 499 (= 2 lines)

**変更要素**:
1. `focus:ring-indigo-400` → `focus-visible:ring-slate-300` (= 完全違反箇所)
2. `focus-visible:ring-indigo-300 ring-offset-1` → `focus-visible:ring-slate-300` (= 部分違反箇所、 `ring-offset-1` も削除)

### 3.2 採用しない (= wave 2 範囲外)

| 候補 | 不採用理由 |
|---|---|
| P-002, P-005, P-006, P-008 | priority 低 / scope 中以上 / freeze 規約あり、 wave 3+ 候補 |
| P-003 | smoke 評価次第、 wave 2 plan 後の CEO smoke で判断 |
| P-004, P-007 | 自律分析で「polish 不要」 と判定 (= 現状維持) |

### 3.3 wave 2 が「最小」 である根拠

- 修正 file: 4 (= MapTab.tsx + FlowTab.tsx + CalendarTab.tsx + PlaceCandidatesPanel.tsx + AnchorFormFields.tsx → 5 file)
- 修正 line: 9 (= class 文字列のみ)
- 関連 import: 変更なし
- 機能変更: 0 (= visual のみ)
- 新規 component / hook 追加: 0
- 関連 test: 既存 0 影響 (= focus ring を直接 test していない)
- 規約 24 整合: 完了 (= 全 plan component で統一)

---

## 4. 実装プロトコル (= 外科的緻密)

### 4.1 修正手順 (= 9 step、 同 pattern)

各 file / line で:
1. 該当 class 文字列を上記 diff で変更
2. tsc 確認
3. 全 plan tests 確認 (= 2626 PASS 維持)
4. 新規 regression test 追加 (= 規約 24 を全 component に適用していることを機械保証):

### 4.2 新規 regression test 設計

**目的**: P-009 wave 2 修正を **永続規約化**、 将来 plan component で `focus:ring-indigo` / `focus-visible:ring-indigo` / `ring-offset` が再混入することを構造的に禁止。

**test 内容** (= 新規 test file 1 件 追加):

`tests/unit/plan/planComponentsFocusRingRegimeWiring.test.ts`:

```typescript
/**
 * Phase 3-N-2 wave 2 (= 2026-05-23): 「観測層 OS visual 規約」 を全 plan component に適用済を機械保証
 *
 * 規約 24 (= wave 1 で確立、 wave 2 で全展開):
 *   - すべての focus ring は focus-visible: + slate-300
 *   - focus: (= focus-visible なし) と brand color (= indigo, purple) は禁止
 *   - ring-offset-* も「観測の幕間」 思想に合わない
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const TARGET_FILES = [
  "app/(culcept)/plan/tabs/MapTab.tsx",
  "app/(culcept)/plan/tabs/FlowTab.tsx",
  "app/(culcept)/plan/tabs/CalendarTab.tsx",
  "app/(culcept)/plan/components/PlaceCandidatesPanel.tsx",
  "app/(culcept)/plan/components/AnchorFormFields.tsx",
  "app/(culcept)/plan/components/DayGraphTimeline.tsx",
];

describe("§N-2 wave 2: 規約 24 全 plan component 適用", () => {
  for (const path of TARGET_FILES) {
    const content = readFileSync(path, "utf-8");

    it(`${path}: focus:ring-indigo 不在 (= 完全違反禁止)`, () => {
      expect(content).not.toMatch(/focus:ring-indigo/);
    });

    it(`${path}: focus-visible:ring-indigo 不在 (= 部分違反禁止)`, () => {
      expect(content).not.toMatch(/focus-visible:ring-indigo/);
    });

    it(`${path}: focus-visible:ring-offset-* 不在 (= 「観測の幕間」 思想整合)`, () => {
      expect(content).not.toMatch(/focus-visible:ring-offset-\d/);
    });
  }
});
```

**配置**: 新規 test file `tests/unit/plan/planComponentsFocusRingRegimeWiring.test.ts`
**tests 数**: 6 file × 3 invariants = **18 tests**

### 4.3 影響範囲 (= 機械検証可能)

| 項目 | 影響 |
|---|---|
| 機能変更 | 0 (= visual のみ) |
| backward compat | 100% (= class 文字列のみ変更) |
| a11y | 改善 (= 全 component で focus-visible 統一) |
| 既存 test | 0 影響 (= focus ring を直接 test していない) |
| 既存 K-3a / L-4d / M-3c-ui invariants | 0 影響 |
| L / M phase | 0 影響 |
| frozen branches | 触らない |

---

## 5. Risk 評価

### 5.1 Risk Matrix

| Risk | level | 緩和策 |
|---|---|---|
| visual regression (= 既存 indigo 色を期待する箇所) | 低 | 全 component 同 pattern、 統一感↑ |
| a11y regression | 0 | focus-visible で keyboard a11y 維持 |
| user 混乱 | 低 | wave 1 で同様の修正済、 user は既に slate-* に慣れている |
| 既存 PlaceCandidatesPanel / AnchorFormFields の Modal 内挙動 | 低 | class 文字列のみ、 Modal 動作不変 |
| 「ring-offset」 削除の visual 違和感 | 低 | ring-offset は元々 brand color と組み合わせの装飾、 slate-300 では不要 |
| M phase 規約違反 | 0 | むしろ規約 24 を完成、 思想保護強化 |
| freeze 規約違反 | 0 | M-2a/L-4a 文言は touch しない |

### 5.2 「ring-offset を残す」 意義は無いか? (= 前提を疑う、 CEO 方針 ①)

| 観点 | ring-offset を残す価値 | 自律分析 |
|---|---|---|
| visual hierarchy | offset で「浮き」 効果 | brand color (= indigo) との組み合わせ前提、 slate-300 では弱すぎて意味なし |
| brand expression | brand identity 強化 | 「観測の幕間」 思想と矛盾 (= ring が前面に出る = 観測の主張) |
| a11y | ring 可視性向上 | slate-300 自体が WCAG 2.1 contrast を満たす |

→ **「ring-offset を残す」 意義は無い、 規約 24 完全準拠が思想整合**。

### 5.3 「9 箇所修正」 の risk 評価

| 観点 | 評価 |
|---|---|
| pattern 統一性 | 全 9 箇所が同 pattern (= focus ring の class 文字列のみ) |
| 修正の局所性 | 各 line 単位で独立 (= 1 箇所 revert しても他に影響なし) |
| ロールバック容易性 | 高 (= 9 line を 1 by 1 で revert 可能) |
| 機械検証 | 規約 24 違反の grep で 0 hit 確認 |

→ **9 箇所修正は scope 中、 risk 低、 規約整合性大幅向上**。

---

## 6. CEO Smoke 計画 (= wave 2 専用)

### 6.1 smoke 確認項目 (= 6 件)

| # | 確認項目 | 期待挙動 |
|---|---|---|
| 1 | MapTab で予定/カテゴリ card click | 強い青 stuck ring 出ない |
| 2 | FlowTab で予定 card click | 同上 |
| 3 | CalendarTab で予定 card click | 同上 |
| 4 | AddAnchorModal の入力 field focus / PlaceCandidatesPanel | 青 ring + offset が消える、 slate ring に変わる |
| 5 | EditAnchorModal の入力 field focus | 同上 |
| 6 | 全 component の Tab navigation で focus-visible ring 維持 | slate-300 で統一 |

### 6.2 smoke 想定時間
- 10-15 分 (= 1 件あたり 1-2 分の sweep)

### 6.3 smoke FAIL 時の対応
- mouse click 後に ring が残る → 該当 file の class 確認
- keyboard で ring 出ない → focus-visible class を確認
- 視覚崩れ → 該当 line revert

---

## 7. 連続 GO 判定

### 7.1 判定 chart

| 判定軸 | 評価 |
|---|---|
| 危険境界 (= 機能変更 / 文言 / 警告色 / DB等) | 0 |
| 既存 file 改変範囲 | 5 file / 9 line |
| backward compat | 100% |
| 既存 tests への影響 | 0 |
| 思想整合性 (= 規約 24 全展開) | **最高** |
| ロールバック容易性 | 高 (= 各 line 独立) |
| 機械検証可能性 | 高 (= 18 tests 追加) |
| CEO smoke 簡潔性 | 中 (= 6 件 / 10-15 分) |

### 7.2 結論

✅ **N-2 wave 2 impl 連続 GO**

理由:
- 全判定軸が low-risk
- wave 1 で確立した規約 24 の自然な拡張
- 5 file / 9 line + 18 tests で完結
- CEO smoke 簡潔
- ロールバック容易

---

## 8. 実装着地予定

### 8.1 新規 branch

- `feat/alter-plan-phase3-n-2-wave-2-focus-ring-regime-applied`

### 8.2 変更 file (= 6 件)

| file | 変更 |
|---|---|
| `app/(culcept)/plan/tabs/MapTab.tsx` | L 1463, 1586 (= 2 line) 規約 24 統一 |
| `app/(culcept)/plan/tabs/FlowTab.tsx` | L 566 (= 1 line) |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | L 516 (= 1 line) |
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` | L 342, 452, 487 (= 3 line) |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | L 405, 499 (= 2 line) |
| `tests/unit/plan/planComponentsFocusRingRegimeWiring.test.ts` | 新規 (= 18 tests) |

### 8.3 変更しない

- 他全 file
- frozen branches
- M-2a / L-4a 文言
- DayGraphTimeline (= wave 1 で適用済)
- 他 polish 候補 (P-002〜P-008)

### 8.4 commit message プレビュー

```
feat(plan): Phase 3-N-2 Wave 2 — 規約 24 を全 plan component に適用 (= P-009、 9 line 統一、 18 regression tests)
```

---

## 9. CEO 判断項目 (= 報告で停止)

### 9.1 5 件の CEO 判断

1. **P-009 wave 2 impl 連続 GO 承認**: 本 audit 着地後、 9 line + 18 tests 追加で連続実装するか
2. **新規 regression test file 内容承認**: 提案した 18 tests grep pattern で OK か
3. **「ring-offset を全削除」 承認**: 視覚的 offset を一切残さないことに合意か
4. **CEO smoke 計画 6 件承認**: 確認項目で十分か
5. **wave 2 完了後の進行**: wave 2 closeout audit → smoke → wave 3 plan の流れ承認

### 9.2 自律推奨 (= 一括)

| 項目 | 推奨 |
|---|---|
| wave 2 impl 連続 GO | ✅ 推奨 (= low-risk 全件達成、 規約整合性向上) |
| regression test | 提案 pattern で OK (= 6 file × 3 invariants = 18 tests) |
| ring-offset 全削除 | 推奨 (= 「観測の幕間」 思想整合) |
| smoke 6 件 | 十分 (= 全 plan component を網羅) |
| wave 2 完了後 | wave 2 closeout audit → CEO smoke → wave 3 plan の流れ |

---

## 10. 凍結 / 連続 OK / 禁止リスト

### 10.1 凍結対象

- 全 56 frozen branches
- 本 audit 着地後 frozen 予定 (= **57 frozen branches** 想定)

### 10.2 連続 OK

- `docs/alter-plan-phase3-n-2-wave-2-plan-audit.md` (= 本 commit)
- `docs/decision-log.md` 追記
- **次**: N-2 wave 2 impl (= 別 branch、 連続 GO 候補)

### 10.3 禁止

- frozen branches への追加 commit
- M phase の追加変更
- M-2a / L-4a 文言の変更
- DayGraphTimeline (= wave 1 適用済) の追加変更
- 他 polish 候補 (P-002〜P-008) の wave 2 で実施
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

---

## 11. CEO 報告 + 停止条件

### 11.1 本 audit の到達点

- 残候補 7 件詳細自律分析 (= P-002〜P-008、 各候補の wave 採否判定)
- **重大発見 P-009**: 規約 24 違反 4 file 9 箇所
- wave 2 範囲確定 (= P-009 のみ)
- 5 file / 9 line + 18 tests の実装プロトコル
- risk 評価 (= 全項目 low)
- CEO smoke 計画 (= 6 件 / 10-15 分)
- 連続 GO 判定 ✅
- CEO 判断 5 件

### 11.2 停止条件

以下のいずれかが発生した場合、 **即停止**:
- 9 line + 18 tests の範囲を超える変更が必要
- DayGraphTimeline (= wave 1 適用済) への追加変更
- 新規 component / hook 追加
- M phase の追加変更
- M-2a / L-4a 文言の変更
- frozen branches への追加 commit
- 他 polish 候補 (P-002〜P-008) が wave 2 に混入
- 警告色 / icon / 警告文言 近接
- localStorage / DB / env / package / dependency 変更
- Deploy readiness / 別軸 pivot

---

**完了**: Phase 3-N-2 Wave 2 Plan Audit 着地。 wave 2 範囲 = **P-009 規約 24 全 component 適用** (= 4 file 9 line + 18 tests) + 重大発見 surface + risk 全件 low + 連続 GO 判定 ✅ + CEO 判断 5 件。 次は N-2 wave 2 impl (= 別 branch、 連続 GO 候補)。
