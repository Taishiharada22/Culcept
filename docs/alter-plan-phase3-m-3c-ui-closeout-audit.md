# Phase 3-M-3c-ui Closeout Audit (= MapTab-only Visual Smoke PASS + freeze)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-3c-ui MapTab-only 実装 @ `e5527f1b` の CEO visual smoke PASS)
**範囲**: M-3c-ui MapTab-only 実装の closeout + freeze 宣言 + 達成事項 + 残論点 + 次候補への接続
**前提**: M-3c-ui readiness audit @ `d3803f2b` + M-3c-ui MapTab-only 実装 @ `e5527f1b`

> 本 audit は **docs only**。 CEO smoke PASS の正式記録、 freeze 宣言、 達成事項の言語化、 残論点の deferred 化を行う。 closeout audit は M phase 全体の closeout (= M current-range closeout) とは別 doc。

---

## 0. CEO Visual Smoke 結果 (= 1 人 smoke、 2026-05-23)

### 0.1 PASS 確認項目 (= CEO + GPT 明示)

| # | 確認項目 | 結果 |
|---|---|---|
| 1 | MapTab の「1 日の構造」 で「詳細」 が見える | ✅ PASS |
| 2 | 「詳細」 を tap で「余白 N 分」 / 「不足 N 分」 表示 | ✅ PASS |
| 3 | 初期状態で余白/不足が表示されていない | ✅ PASS |
| 4 | hidden 時に余白/不足が押し出されていない | ✅ PASS |
| 5 | 「閉じる」 で補助行が消える | ✅ PASS |
| 6 | 見た目が警告に見えない | ✅ PASS |
| 7 | 「不足」 だけ強調されていない | ✅ PASS |
| 8 | amber / orange / red なし | ✅ PASS |
| 9 | icon / badge / warning box なし | ✅ PASS |
| 10 | CalendarTab / FlowTab には出ていない | ✅ PASS (= backward compat 100%) |
| 11 | 既存 MapTab / SelectedAnchorCard / 予定表示に大きな崩れなし | ✅ PASS |

### 0.2 機械検証との対応

| Smoke 確認 | 対応する機械検証 |
|---|---|
| ① 「詳細」 hint 表示 | `mapTabFeasibilityDisclosureWiring.test.ts §1` (= 「詳細」 / 「閉じる」 textual hint render コード存在) |
| ② tap で展開 | `§1` (= onClick / tabIndex / handleToggleDisclosure) |
| ③ 初期 hidden | `§3` (= useState(resetAllDisclosures)) + M-3c-pure-harden test §1 |
| ④ hidden 時 DOM 不在 | `§6` (= conditional render `canDisclose && isExpanded && feasibilityView`) |
| ⑤ 「閉じる」 collapse | `§1` (= expanded 時 hint 「閉じる」) + M-3c-pure adapter test §6 |
| ⑥ 警告に見えない | `§1` (= styling = K-3c-iii tier_2 text-xs italic text-slate-400) |
| ⑦ 余白/不足 同 styling | `§1` (= variant は data-attribute のみ、 class 違いなし) |
| ⑧ amber/orange/red なし | `§1` (= grep) |
| ⑨ icon/badge/warning box なし | `§1` (= FeasibilityDisclosureLine 内 bg-/border-/rounded-/svg/Icon grep) |
| ⑩ CalendarTab/FlowTab 出ない | `§4` (= 8 件 backward compat tests) |
| ⑪ 既存 UI 崩れなし | regression: 2498 → 2550 PASS (= 既存 file 改変 0) |

→ **11 項目全件 visual + 機械の二重保証**で PASS。

---

## 1. 達成事項 (= 永続規約 candidate)

### 1.1 構造的達成

| 達成 | 内容 |
|---|---|
| **三重防御の完成** | データ層 (= M-2a not_applicable 除外) + 状態層 (= expandedTransitionIndices) + 表示層 (= conditional DOM render) の 3 層で push 表示構造的不可能化 |
| **conditional DOM render 確立** | hidden 時に補助行を DOM に出さない (= CSS hidden / display:none / aria-hidden ではなく React conditional)。 screen reader / a11y ツリーにも完全不在 |
| **3 props セット AND 条件** | feasibilityDisplayByTransitionIndex + expandedTransitionIndices + onToggleFeasibilityDisclosure の 3 つ全件指定で UI 活性化、 1 つでも欠ければ backward compat 100% |
| **「詳細」 / 「閉じる」 textual hint 採用** | 中立 2 文字、 警告感 0、 発見性確保 (= smoke で実証) |
| **React lazy initial state pattern** | `useState(resetAllDisclosures)` で default hidden を機械保証、 mutation 攻撃面 0 |
| **`useEffect([selectedDate])` 自動 reset** | 「観測の幕間」 を localStorage 不使用で実現 |
| **observational disclosure 思想の UI 実装成立** | M-3b-pure の規範を画面まで貫徹、 「観測の主導権を user に渡す」 体験を実現 |

### 1.2 数値的達成

| 項目 | 値 |
|---|---|
| **M-3c-ui wiring tests** | **52 PASS** (= 0 fail) |
| **全 plan tests** | **2550 PASS** (= M-3c-pure-harden 着地時 2498 → +52) |
| **feasibility / DayGraphTimeline / MapTab / hook の tsc errors** | **0** |
| **baseline tsc errors** | unchanged (= 我々の touched files 0 errors) |
| K phase / L / M-1〜M-3c-pure-harden 既存 file 改変 | **0** |
| DB / env / package / dependency 変更 | **0** |
| 新規 fetch / endpoint / localStorage / runtime telemetry | **0** |

### 1.3 思想的達成 (= Aneurasync 中心問いとの接続)

> **「自分って、 そういう人間だったのか」**

M-3c-ui で:
- AI が「不足だ」 と指摘する pattern を **構造的に排除** (= push 表示が不可能)
- user が能動的に「詳細」 を tap した瞬間に観測体験が成立
- 「観測したくない時は tap しない」 を 100% 尊重 (= user agency 完全保証)
- 余白 / 不足 完全同 styling で偏見排除 (= ポジティブ偏見も作らない)

→ 「**第二の自己**」 として feasibility 観測を提供する設計が、 user の能動性を 1 度も奪わない形で成立。

---

## 2. freeze 宣言

### 2.1 freeze 対象 (= 触らない、 追加 commit 禁止)

- **`feat/alter-plan-phase3-m-3c-ui-maptab-only`** @ `e5527f1b`: **frozen**
- M-3c-ui readiness audit `docs/plan-phase3-m-3c-ui-readiness-audit` @ `d3803f2b`: frozen
- M-3c-pure-harden `feat/alter-plan-phase3-m-3c-pure-harden-empty-set-mutation` @ `399c5783`: frozen
- M-3c-pure (= superseded) `feat/alter-plan-phase3-m-3c-pure-per-transition-disclosure-adapter` @ `11312aa7`: superseded (= 個別 freeze せず)
- M-3c readiness audit `docs/plan-phase3-m-3c-readiness-audit` @ `db1ccd9d`: frozen
- M-3b-pure `feat/alter-plan-phase3-m-3b-pure-disclosure-state-machine` @ `0b560b55`: frozen
- M-3b readiness audit `docs/plan-phase3-m-3b-readiness-audit` @ `34d11a90`: frozen
- M-3a / M-2 / M-1 / L / K 全 freeze 維持

### 2.2 凍結 file (= M-3c-ui 範囲)

- `app/(culcept)/plan/components/DayGraphTimeline.tsx` (= 3 optional props + TransitionItem 拡張 + FeasibilityDisclosureLine)
- `app/(culcept)/plan/tabs/MapTab.tsx` (= feasibility hook + state + reset + handler)
- `app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay.ts` (= 新 hook)
- `tests/unit/plan/mapTabFeasibilityDisclosureWiring.test.ts` (= 新 test、 52 件)
- `tests/unit/plan/mapTabMovementDisplayWiring.test.ts` (= L-4d test 微修正分)

### 2.3 frozen branches 合計

- **48 frozen branches** (= 47 + 1 = M-3c-ui closeout audit branch を含めて)

### 2.4 凍結原則 (= 永続規約)

frozen branch への追加 commit は **絶対禁止**。 新規変更は別 branch + 別 PR (= 本 audit の場合は new closeout doc、 別ファイル) で対応。

---

## 3. 残論点 / Deferred (= 将来 audit 候補)

### 3.1 短期 deferred (= M-3d / M-3c-extend)

| 項目 | 内容 | 想定 phase |
|---|---|---|
| **CalendarTab disclosure 展開** | selected day の DayGraphTimeline に同 disclosure 機能 | M-3d (= 別 audit + CEO smoke) |
| **FlowTab disclosure 展開** | 7 日 view の各 timeline に disclosure (= density 問題大きい) | M-3d (= density guard 必要) |
| **density guard** | 1 日 transition 数 >= N で single-open mode 切替 | M-3c-extend (= 別 audit) |
| **N 人 visual smoke** | 1 人 smoke の質的範囲を広げる、 「不足」 体験の他者検証 | M-3c-extend (= smoke 拡張) |

### 3.2 中期 deferred (= M-4+)

| 項目 | 内容 | 想定 phase |
|---|---|---|
| **daily counts disclosure** | 「今日 余白 3 件 / 不足 1 件」 等の集計 disclosure | M-4 (= 別軸 audit、 集計警告化リスク要検証) |
| **progressive trust building** | 初回 / 2 回目 / 多日後で disclosure 体験を進化 | M-4 (= 学習 layer 追加) |
| **per-transition counts pattern** | 「過去 1 ヶ月の同 transition 統計」 等 | M-4+ (= 大規模設計) |

### 3.3 構造的 deferred (= 思想 / 長期)

| 項目 | 内容 | 想定 phase |
|---|---|---|
| **ambient indicator** | 「ここに観測あり」 を超控えめ dot 等で示唆 | M-5+ (= 警告化リスク大、 慎重 audit) |
| **集計 disclosure 別軸** | 個別 transition ではなく「自分の傾向」 を別 UI で見せる | M-5+ (= 別軸設計) |
| **共有モード制御** | 共有時に disclosure 非表示 | privacy 軸別 audit |
| **mobile gesture** | swipe で expand 等 | a11y 軸別 audit |

### 3.4 「やらない」 と決めた事項

| 項目 | 不採用理由 |
|---|---|
| 警告色 (= amber/orange/red) | Aneurasync 思想反 (= 警告化) |
| icon / badge / warning box | 警告感、 視覚 affordance 過剰 |
| hover-only trigger | mobile a11y 欠落 |
| localStorage / persist | 「観測の幕間」 設計と整合性確保 |
| アコーディオン animation | 不要、 simple conditional render で十分 |
| 「不足を指摘する」 文言 | Aneurasync 中心問いと逆 |

---

## 4. M-3c-ui の限界 (= 明示的に認識)

### 4.1 1 人 smoke の限界

- CEO 1 人で smoke → 「圧体験 0」 は CEO 個人の判定
- 他 user の体験は未検証 (= N 人 smoke は別 phase)
- 「圧体験」 は user の状況 / 心理状態で変動する可能性

### 4.2 「不足」 文言の影響範囲未確定

- M-2a で確立した「余白 N 分」 / 「不足 N 分」 は変更しない (= 設計違反)
- 「不足」 という日本語の感情負荷は user により異なる
- 文言テストは M-2 で完結扱い、 但し将来 M-4+ で再検討余地

### 4.3 mode 推定なし

- 全 transition で同様の disclosure 機能
- 「徒歩 vs 公共交通」 等の mode 別文言は出ない (= M-2a で除外)
- mode 推定 + 表示は M-5+ で別軸検討

### 4.4 1 日 transition 数の上限未制御

- 1 日 6+ transition の case では density guard 必要
- M-3c-ui 範囲では density 制御なし
- CalendarTab / FlowTab (= 7 日表示) への展開時に深刻化

### 4.5 user 学習の単発性

- 「初回 tap で発見 → 次回も tap」 の学習 loop は単発
- progressive trust building は M-4+ で別 phase

---

## 5. 思想 transmission (= M-3c-ui 永続規約 candidate)

1. **観測の主導権を user に渡す** (= M-3b 継承)
2. **default = 全 hidden 永続規約** (= M-3b N-fold lift)
3. **per-transition は M-3b-pure を N-fold lift** (= M-3c)
4. **tab/day 切替で reset** (= 「観測の幕間」)
5. **余白 / 不足 完全同 styling** (= 偏見 0)
6. **counts は disclosure しない** (= 集計警告化防止)
7. **永続 Set 定数を外部公開しない** (= M-3c-pure-harden)
8. **caller は always-function-call** (= harden)
9. **「pure 層は堅固、 UI に出す瞬間は別の危険境界」** (= M-3c-ui audit)
10. **最小 textual hint「詳細」 で発見性確保 + 警告化回避** (= smoke で実証)
11. **三重防御 (= データ層 + 状態層 + 表示層) で push 表示構造的不可能化** (= M-3c-ui)
12. **conditional DOM render** (= CEO 補正反映、 視覚 hidden 禁止)
13. **3 props セット AND 条件** で disclosure UI 活性化
14. **`useState(resetAllDisclosures)`** で default hidden 機械保証
15. **`useEffect([selectedDate])`** で 「観測の幕間」 自動 reset

---

## 6. M-3c-ui 達成の戦略的位置付け

### 6.1 Aneurasync ロードマップ上の位置

```
Plan tab (= 場所 + 時間 + 移動 + 余白/不足 観測)
  ├─ K phase: 時間構造観測 ✅
  ├─ L phase: 移動構造観測 ✅
  ├─ M phase: 余白/不足観測
  │   ├─ M-1: data layer ✅
  │   ├─ M-2: display layer ✅
  │   ├─ M-3a: pre-UI pipeline ✅
  │   ├─ M-3b: disclosure state machine ✅
  │   ├─ M-3c-pure-harden: per-transition adapter ✅
  │   └─ M-3c-ui: MapTab-only UI 接続 ✅ ← 本 closeout
  └─ N+: 別観測層 (= TBD)
```

### 6.2 「観測層 4 層構造」 の完成

- **K phase (= 時間)**: 1 日の構造観測 → 「いつ?」 への観測
- **L phase (= 移動)**: 移動文脈観測 → 「どこからどこへ?」 への観測
- **M phase (= 余白/不足)**: 時間余裕観測 → 「どれだけ余裕がある?」 への観測
- 各層 user 能動観測体験 (= M-3c-ui で確立)

### 6.3 「観測のメタ構造」 の確立

- **データ層** (= K/L/M-1/M-2/M-3a の pure pipeline)
- **状態層** (= M-3b-pure / M-3c-pure-harden の state machine)
- **表示層** (= L-4d / M-3c-ui の DayGraphTimeline 拡張)
- 各層の責務分離 + 三重防御 = 「観測層 pipeline の標準 template」 (= N 以降に継承可能)

---

## 7. 凍結後の禁止事項

frozen branch (= 48 件) への追加 commit は **絶対禁止**。 また以下も禁止:

- M-3c-ui の `e5527f1b` への追加 commit
- DayGraphTimeline / MapTab / `_useMapTabFeasibilityDisplay.ts` への disclosure 関連変更 (= 別 phase audit + 別 branch 必須)
- CalendarTab / FlowTab への feasibility 展開 (= M-3d phase、 別 audit + smoke 必須)
- 「不足 N 分」 を常時表示 (= 設計違反)
- density guard 無しでの Calendar/Flow 展開 (= UI 圧リスク)
- amber / orange / red / icon / badge / warning box (= 永続規約違反)
- localStorage / persist (= 永続規約違反)
- Arrival Risk Memory / warning / recommendation / optimization (= 永続規約違反)
- DB / env / package / dependency 変更 (= 別 phase)
- runtime telemetry sink / Counterfactual / Routes API (= 別 phase)
- fetch / push / gh / reset / restore / stash / branch delete (= state safety)

---

## 8. 次に進む path (= M current-range closeout で詳述)

### 8.1 短期次候補 (= 別 doc で深く比較)

| 候補 | 内容 | 評価軸 |
|---|---|---|
| **A. M-3d** | CalendarTab / FlowTab feasibility 展開 | density guard 整備必要、 N 人 smoke も必要 |
| **B. N phase** | M を完結扱い、 次観測層へ | M の活用度 vs 次の戦略インパクト |
| **C. 別軸 pivot** | Stargazer / Rendezvous 等の別領域 | CEO 上位方針 (= Stargazer 深層観測 / 初期 user 獲得) 整合 |
| **D. M-3c-ui 小改善** | density guard / N 人 smoke / progressive trust 等 | 完成度 vs 進展速度 |

詳細は次の **M current-range closeout audit** で深掘り。

### 8.2 本 closeout の position

- M-3c-ui MapTab-only **に限った** closeout
- M phase 全体の closeout (= M current-range) は別 doc
- 4 候補比較も別 doc で詳述

---

## 9. CEO 報告 + 停止条件

### 9.1 本 audit の到達点

- M-3c-ui visual smoke PASS の正式記録 (= 11 項目)
- freeze 宣言 (= `e5527f1b`)
- 達成事項の言語化 (= 三重防御 / conditional DOM render / textual hint 等)
- 残論点の deferred 化 (= M-3d / M-3c-extend / M-4+ / M-5+)
- M phase 全体への接続 (= 次 doc で詳述)

### 9.2 停止条件 (= 自律推論の境界)

以下のいずれかが発生した場合、 **即停止**:
- frozen branches (= 48 件) への追加 commit
- CalendarTab / FlowTab feasibility 展開実装
- 「不足 N 分」 常時表示
- amber / orange / red / icon / badge 追加
- Arrival Risk / warning / recommendation / optimization 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- Counterfactual / Routes API

---

**完了**: M-3c-ui MapTab-only closeout audit 着地。 smoke PASS 記録 + freeze 宣言 + 達成事項 + 残論点 deferred 化 + 次への接続点を明文化。 次は **M current-range closeout audit** で M-1〜M-3c-ui 全体の俯瞰 + 4 候補比較 + CEO 判断材料の提示。
