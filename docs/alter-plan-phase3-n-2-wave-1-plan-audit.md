# Phase 3-N-2 Wave 1 Plan Audit (= P-001 focus ring 統一 + 連続 GO 判定)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 N-1 closeout 着地 + N-2 wave plan 提示指示)
**範囲**: wave 1 範囲確定 (= P-001 のみ) + 実装プロトコル (= 1 行修正の外科的緻密設計) + risk 評価 + CEO smoke 計画 + 連続 GO 判定
**前提**: N-1 closeout `8f1d7432` + 54 frozen branches + dev server localhost:3000 起動済

> 本 audit は **docs only**。 wave 1 範囲を最小実装に限定し、 low-risk 確認後、 wave 1 impl に連続 GO 判定する。 wave 1 impl 本体は別 branch + 別 commit。

---

## 0. CEO 方針 7 点との整合 (= 自律推論で確認)

CEO 補正 (= 2026-05-23 N-2 着手前):
> ①前提を疑う ②時間をかけて自律推論 ③シンプル + 論理的 ④外科的緻密 ⑤ゴール逆算 ⑥推論力 ⑦革新

| # | CEO 方針 | 本 audit の対応 |
|---|---|---|
| ① 前提を疑う | smoke PASS でも「変更不要」 で済ます場合あり | P-002 (= spacing) を 自律 (a) で何もしない判定 |
| ② 時間をかけて | wave 1 を 1 行に限定、 急がない | P-001 のみ採用、 他は wave 2+ |
| ③ シンプル + 論理 | 最小修正、 副作用なし | EventItem button の 1 行のみ |
| ④ 外科的緻密 | line 番号特定、 関連 test 影響評価 | L 402 のみ、 既存 test 影響 0 |
| ⑤ ゴール逆算 | /plan complete までの最短 path | wave 1 で「強い青 ring 解消」、 残 polish は wave 2+ |
| ⑥ 推論力 | 「polish」 の本質を理解 | focus-visible 採用 = mouse user に ring 不要、 keyboard user に必要 |
| ⑦ 革新 | wave 単位 + 3 次元 tag form | M phase で確立した slate-* 階調を「観測層 OS visual 規約」 として永続規約化 |

---

## 1. Wave 1 範囲確定

### 1.1 採用: P-001 (= focus ring 統一) のみ

**変更対象**:
- file: `app/(culcept)/plan/components/DayGraphTimeline.tsx`
- 行: L 402 (= EventItem の button class)

**変更 diff**:
```diff
- className="text-left w-full block focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-md"
+ className="text-left w-full block focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded-md"
```

**変更要素**:
1. `focus:ring-2` → `focus-visible:ring-2` (= mouse click 後 ring が出なくなる)
2. `focus:ring-indigo-300` → `focus-visible:ring-slate-300` (= 青 → 灰、 弱)

### 1.2 採用しない (= wave 1 範囲外)

| 候補 | 理由 |
|---|---|
| P-002 (= spacing 統一) | freeze 規約 (= M-2a/L-4a 文言)、 自律推奨 (a) 何もしない、 CEO 具体提案待ち |
| P-003 (= hint span 位置) | priority 低-中、 wave 2 候補 |
| P-004 (= 補助行 padding) | priority 低、 wave 2 候補 |
| P-005 (= Plan header tone) | priority 低-中、 別 audit 範囲 |
| P-006 (= Modal animation) | scope 中、 wave 2+ |
| P-007 (= Empty state copy) | priority 低-中、 wave 2+ |
| P-008 (= swipe boundary) | scope 中、 risk 中、 別 phase |

### 1.3 wave 1 が「最小」 である根拠

- 修正 file: 1 (= DayGraphTimeline.tsx のみ)
- 修正 line: 1 (= L 402 のみ)
- 関連 import: 変更なし
- 関連 hook / component: 変更なし
- 関連 test: 既存 0 影響 (= focus ring を直接 test していない)

---

## 2. 実装プロトコル (= 外科的緻密)

### 2.1 修正手順 (= 1 step)

1. `app/(culcept)/plan/components/DayGraphTimeline.tsx` L 402 の class 文字列を上記 diff で変更
2. tsc 確認 (= file 単独で 0 errors)
3. 全 plan tests 確認 (= 2625 PASS 維持)
4. backward compat 確認 (= focus ring 関連 grep test 無し → 既存 test 全 PASS)
5. 新規 regression test 追加 (= 「P-001 永続化」 のため):
   - `tests/unit/plan/dayGraphTimelineComponent.test.ts` に 1 case 追加
   - 「EventItem button が `focus-visible:ring-slate-300` を使う」 grep
6. commit

### 2.2 新規 regression test 設計

**目的**: P-001 の wave 1 修正を **永続規約化**、 将来 EventItem button class が `indigo-300` / `focus:ring` (= focus-visible なし) に戻らないことを機械保証。

**test 内容** (= file-level grep pattern):
```typescript
it("N-2 wave 1 P-001: EventItem button は focus-visible:ring-slate-300 を使う (= M phase visual 規約継承)", () => {
  // M-3c-ui で TransitionItem (L 526) が確立した slate-300 + focus-visible パターンと整合
  // K-3a で旧 indigo-300 (L 402) が EventItem に使われていたが、
  // N-2 wave 1 で slate-300 + focus-visible に統一 (= mouse user に ring 不要)
  expect(dayGraphContent).toMatch(
    /button[\s\S]*?className=\"[^\"]*focus-visible:ring-2 focus-visible:ring-slate-300/,
  );
  // 旧 indigo-300 / focus:ring (= focus-visible なし) パターンが消えていることも確認
  expect(dayGraphContent).not.toMatch(/focus:ring-indigo/);
});
```

**配置**: `tests/unit/plan/dayGraphTimelineComponent.test.ts` の既存 「Structural grep」 セクションに追加

### 2.3 影響範囲 (= 機械検証可能)

| 項目 | 影響 |
|---|---|
| 機能変更 | 0 (= visual のみ) |
| backward compat | 100% (= class 文字列のみ変更) |
| a11y | 改善 (= focus-visible で keyboard user のみ ring、 mouse user は ring 不要、 WCAG 2.1 推奨) |
| 既存 test | 0 影響 (= focus ring を直接 test していない) |
| 既存 K-3a / M-3c-ui invariants | 0 影響 |
| L / M phase | 0 影響 |
| frozen branches | 触らない |

---

## 3. Risk 評価

### 3.1 Risk Matrix

| Risk | level | 緩和策 |
|---|---|---|
| visual regression (= 既存 indigo 色を期待する箇所) | 低 | EventItem 内部の visual のみ、 EventItem 外部に影響なし |
| a11y regression (= keyboard user) | 低 | `focus-visible:` も keyboard で発火、 ring は引き続き表示 |
| user 混乱 (= 突然 ring 消える) | 低 | mouse click 後の ring は user にとって distracting、 消える方が UX 改善 |
| M phase 規約違反 | 0 | slate-* 階調と統一、 M phase visual 規約に整合 |
| freeze 規約違反 | 0 | M-2a/L-4a 文言は touch しない、 K-3a EventItem の class は polish 範囲 |

### 3.2 「ring を青で残す」 意義は無いか? (= 前提を疑う、 CEO 方針 ①)

| 観点 | 青 (indigo) を残す価値 | 自律分析 |
|---|---|---|
| brand color | indigo は Aneurasync brand 色か? | MEMORY.md で「indigo は AneurasyncHome の gradient (= from-indigo-500 to-purple-500) に使用」 = FAB / brand button で使う、 focus ring の color として固有意味は無し |
| 強調 | EventItem を「強調 click target」 として indigo を残す | TransitionItem も同等の click target だが slate-300 (= 統一規約) |
| 識別 | mouse user に「clickable」 を知らせる | mouse の cursor 自体が示す、 ring は重複 |

→ **「青で残す」 意義は無い、 slate-300 + focus-visible が思想整合**。

### 3.3 「focus-visible」 採用の意義 (= ⑦ 革新)

- `focus-visible:` は CSS Selectors Level 4 + WCAG 2.1 推奨
- mouse click 後の「stuck ring」 (= 「なぜ ring が出続けてる?」 の user 混乱) を解消
- keyboard user (= Tab / Enter) には引き続き ring 表示で a11y 維持
- 「観測の幕間」 思想と整合: 「観測しない時は何も主張しない」

---

## 4. CEO Smoke 計画 (= wave 1 専用)

### 4.1 smoke 確認項目 (= 5 件)

| # | 確認項目 | 期待挙動 |
|---|---|---|
| 1 | mouse で予定 card をクリック | **強い青 ring が出ない / 残らない** |
| 2 | Tab key で focus 移動 | EventItem button に slate-300 の弱 ring が出る |
| 3 | Enter / Space で予定 detail modal 起動 | 動作は変わらず modal 開く |
| 4 | TransitionItem (= 移動行) との視覚整合 | 両方 slate-300 で統一感 |
| 5 | 既存 MapTab / Calendar / Flow / Modal 動作 | 大きな崩れなし |

### 4.2 smoke 想定時間
- 5-10 分 (= 1 件あたり 1-2 分の sweep)

### 4.3 smoke FAIL 時の対応
- mouse click 後に ring が残る → 修正失敗、 class を Read で確認
- keyboard で ring 出ない → focus-visible の class を確認
- 視覚崩れ → revert (= 1 行戻すだけ)

---

## 5. 連続 GO 判定

### 5.1 判定 chart

| 判定軸 | 評価 |
|---|---|
| 危険境界 (= UI 構造 / 文言 / 警告色 / DB等) | 0 |
| 既存 file 改変範囲 | 1 file / 1 line |
| backward compat | 100% |
| 既存 tests への影響 | 0 |
| 思想整合性 (= M phase 規約) | high |
| ロールバック容易性 | 高 (= 1 行戻す) |
| 機械検証可能性 | 高 (= grep test 1 件追加) |
| CEO smoke 簡潔性 | 高 (= 5 件 / 5-10 分) |

### 5.2 結論

✅ **N-2 wave 1 impl 連続 GO**

理由:
- 全判定軸が low-risk
- 既存規約 (= freeze branches / 文言 / 階調) に整合
- 1 行修正 + 1 件 test 追加で完結
- CEO smoke 簡潔
- ロールバック容易

---

## 6. 実装着地予定

### 6.1 新規 branch

- `feat/alter-plan-phase3-n-2-wave-1-focus-ring-unify`

### 6.2 変更 file (= 2 件)

| file | 変更 |
|---|---|
| `app/(culcept)/plan/components/DayGraphTimeline.tsx` | L 402 の class 1 行修正 |
| `tests/unit/plan/dayGraphTimelineComponent.test.ts` | regression test 1 件追加 |

### 6.3 変更しない

- 他全 file
- frozen branches
- M-2a / L-4a 文言
- TransitionItem (= L 526、 既に slate-300)
- 他 polish 候補 (P-002〜P-008)

### 6.4 commit message プレビュー

```
feat(plan): Phase 3-N-2 Wave 1 — EventItem focus ring 統一 (= P-001、 indigo-300 → slate-300 + focus-visible)
```

---

## 7. CEO 判断項目 (= 報告で停止)

### 7.1 4 件の CEO 判断

1. **P-001 wave 1 impl 連続 GO 承認**: 本 audit 着地後、 1 行修正 + test 追加で連続実装するか
2. **新規 regression test 内容承認**: 提案した grep pattern で OK か
3. **CEO smoke 計画 5 件承認**: smoke 確認項目で十分か
4. **wave 1 完了後の進行**: wave 1 closeout audit に進むか / 他 polish も連続で扱うか

### 7.2 自律推奨 (= 一括)

| 項目 | 推奨 |
|---|---|
| wave 1 impl 連続 GO | ✅ 推奨 (= low-risk 全件達成) |
| regression test | 提案 pattern で OK |
| smoke 5 件 | 十分 |
| wave 1 完了後 | wave 1 closeout audit → CEO smoke → wave 2 plan の流れ |

---

## 8. 凍結 / 連続 OK / 禁止リスト

### 8.1 凍結対象

- 全 54 frozen branches
- 本 audit 着地後 frozen 予定 (= **55 frozen branches** 想定)

### 8.2 連続 OK

- `docs/alter-plan-phase3-n-2-wave-1-plan-audit.md` (= 本 commit)
- `docs/decision-log.md` 追記
- **次**: N-2 wave 1 impl (= 別 branch、 連続 GO 候補)

### 8.3 禁止

- frozen branches への追加 commit
- M phase の追加変更
- M-2a / L-4a 文言の変更
- TransitionItem (= L 526) への変更 (= 既に slate-300、 wave 1 範囲外)
- 他 polish 候補 (P-002〜P-008) の wave 1 で実施
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

## 9. CEO 報告 + 停止条件

### 9.1 本 audit の到達点

- wave 1 範囲確定 (= P-001 のみ)
- 1 行修正の外科的緻密設計
- 既存 tests 影響 0 / 機械検証可能性 high
- 新規 regression test 設計
- risk 評価 (= 全項目 low)
- CEO smoke 計画 (= 5 件 / 5-10 分)
- 連続 GO 判定 ✅
- CEO 判断 4 件

### 9.2 停止条件

以下のいずれかが発生した場合、 **即停止**:
- 1 行修正の範囲を超える変更が必要
- TransitionItem (= 既に slate-300) に variation 必要
- 新規 component / hook 追加
- M phase の追加変更
- M-2a / L-4a 文言の変更
- frozen branches への追加 commit
- 他 polish 候補 (P-002〜P-008) が wave 1 に混入
- 警告色 / icon / 警告文言 近接
- localStorage / DB / env / package / dependency 変更
- Deploy readiness / 別軸 pivot

---

**完了**: Phase 3-N-2 Wave 1 Plan Audit 着地。 wave 1 範囲 = P-001 のみ + 1 行修正 + regression test 1 件 + risk 全件 low + 連続 GO 判定 ✅。 次は N-2 wave 1 impl (= 別 branch、 連続 GO 候補)。
