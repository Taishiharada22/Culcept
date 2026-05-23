# Phase 3-N-1 Closeout Audit (= smoke PASS 記録 + polish 候補棚卸し + N-2 wave plan への接続)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-3d bugfix smoke PASS + N-1 棚卸し smoke 大きな問題なし、 「次に進む」 指示)
**範囲**: N-1 smoke PASS 9 項目の正式記録 + GPT 指摘 2 件 + 自律探索 polish 候補の棚卸し + 各候補の priority/scope/risk tag + N-2 wave 1 plan への接続点 + CEO 判断材料
**前提**: N-1 readiness audit `5c8600f2` + 53 frozen branches + dev server localhost:3000 起動済 (= flag 永続化)

> 本 audit は **docs only**。 N-1 を smoke PASS で closeout、 polish 候補を CEO 判断材料として整理する。 実装には進まない (= 次は N-2 wave 1 plan、 docs only audit)。

---

## 0. N-1 Smoke 結果 (= CEO + GPT 合議で確定)

### 0.1 smoke PASS 確認 (= 9 項目)

| # | 確認項目 | 結果 |
|---|---|---|
| 1 | CalendarTab selected day detail で「移動 約 90 分 詳細」 が表示 | ✅ PASS |
| 2 | Calendar month/grid に余白/不足/詳細が出ない | ✅ PASS (= 「month/grid 不変」 規約遵守) |
| 3 | リスト (= FlowTab) で「移動 約 90 分 詳細」 が表示 | ✅ PASS |
| 4 | FlowTab 前回問題 (= 「詳細」 欠落) 解消 | ✅ PASS (= M-3d-bugfix 効果実証) |
| 5 | MapTab で「移動 約 90 分 閉じる」「余白 20 分」 が表示 | ✅ PASS |
| 6 | 詳細 disclosure 開閉できる | ✅ PASS (= conditional render 動作) |
| 7 | 既存予定カード / FAB / Map / Calendar / Flow に大きな崩れなし | ✅ PASS (= backward compat 100%) |
| 8 | amber / orange / red なし | ✅ PASS |
| 9 | warning / recommendation / optimization 文言なし + icon/badge/warning box なし | ✅ PASS |

### 0.2 機械検証との対応 (= 二重保証成立)

| Smoke | 機械検証対応 |
|---|---|
| ① Calendar disclosure | `calendarTabFeasibilityDisclosureWiring.test.ts` |
| ② month/grid 不変 | `§10 month/grid 全件展開なし` (= 構造的確認) |
| ③ FlowTab disclosure | `flowTabFeasibilityDisclosureWiring.test.ts §3 bugfix regression` |
| ④ bugfix 効果 | M-3d-bugfix `98cd6b2a` |
| ⑤ MapTab disclosure | `mapTabFeasibilityDisclosureWiring.test.ts` |
| ⑥ 開閉 | M-3b-pure state machine + M-3c-pure-harden + adapter test |
| ⑦ backward compat | 各 tab wiring tests `§4 backward compat / 11. 他 tab 影響なし` |
| ⑧ 警告色なし | wiring tests `§9 警告色 / icon / amber/orange/red なし` |
| ⑨ 警告系文言なし + icon なし | 同上 |

→ **visual + 機械 の二重保証で N-1 範囲が完全成立**。

---

## 1. N-1 達成事項 (= 永続規約 candidate)

### 1.1 構造的達成

| 達成 | 内容 |
|---|---|
| **棚卸し doc 着地** | Home + Plan 全 surface 漏れなき list 化 (= N-1 readiness audit `5c8600f2`) |
| **3 stage smoke 計画** | visual / journey / modal+edge 各 30-60 分 (= 提案、 実施は CEO 判断) |
| **CEO smoke 実施** | M-3d bugfix + N-1 統合 smoke 9 項目 PASS |
| **polish 候補形式 (= 3 次元 tag)** | priority/scope/risk で wave 計画自動化 |
| **「月 grid 不変」 規約 検証成立** | Calendar month/grid に disclosure 不在 (= smoke 確認) |

### 1.2 数値的達成

| 項目 | 値 |
|---|---|
| smoke 確認項目 | **9 件全件 PASS** |
| 既存実装変更 | **0** (= 本 audit は docs only) |
| frozen branches | **53 件** (= 既存維持) |
| feasibility / DayGraphTimeline / MapTab / CalendarTab / FlowTab / hooks の tsc errors | **0** |

### 1.3 思想的達成

> 「自分って、 そういう人間だったのか」

N-1 smoke で 「**観測層 4 層構造の M 担当が user 画面で完全成立**」 が CEO 視点で確認:
- 3 tab すべてで disclosure UI 成立 (= MapTab/Calendar/Flow)
- AI 指摘 pattern 0 (= 警告文言/警告色/icon すべて不在)
- user 能動 expand のみで「余白/不足」 が見える (= agency 100%)
- 「観測の幕間」 体験 (= tab/day/week 切替で reset)

→ **「観測層 OS」 の M 担当が user 体験として実証された段階**。

---

## 2. Polish 候補棚卸し (= GPT 指摘 + 自律探索)

### 2.1 候補リスト (= 3 次元 tag 付き form)

| ID | surface | 現状 | 気になる点 | priority | scope | risk | 出典 |
|---|---|---|---|---|---|---|---|
| **P-001** | DayGraphTimeline EventItem (= 予定 card button) | `focus:ring-2 focus:ring-indigo-300` (= 青、 強) | 「青い focus ring が強すぎる可能性」 | 中 | 小 | 低 | **GPT 指摘 1** |
| **P-002** | M-2a / L-4a displayText | 「移動 約 90 分」 / 「余白 20 分」 / 「不足 N 分」 (= 半角スペース、 既に統一) | 「スペース表記を統一するか」 → 既に統一済、 但し更なる polish 余地 | 中 | 小 | **中-高** (= freeze 規約) | **GPT 指摘 2** |
| **P-003** | DayGraphTimeline hint span | `text-xs italic text-slate-400 ml-2` (= 「詳細」「閉じる」) | hint text の位置 / 視認性 | 低-中 | 小 | 低 | 自律探索 |
| **P-004** | FeasibilityDisclosureLine | `text-xs italic text-slate-400 pl-8` | 補助行の左 padding / 階層感 | 低 | 小 | 低 | 自律探索 |
| **P-005** | Plan header copy | (= 各 tab で異なる) | tab 切替時の header tone 統一 | 低-中 | 小 | 低 | 自律探索 |
| **P-006** | Modal animation | (= 各 Modal 既存) | 開閉 smoothness の polish | 低 | 中 | 低 | 自律探索 |
| **P-007** | Empty state copy | FlowTab 「予定なし ›」 等 | 中立 tone / 統一感 | 低-中 | 小 | 低 | 自律探索 |
| **P-008** | swipe boundary 体験 | HomeSwipeContainer | 端での snap vs bounce | 低-中 | 中 | 低-中 | 自律探索 |

### 2.2 P-001 (= GPT hint 1) の詳細

**現状**:
- DayGraphTimeline.tsx L 402 で EventItem の clickable button が `focus:ring-2 focus:ring-indigo-300` を持つ (= K-3a 由来、 M phase で touch していない)
- 一方、 私が M-3c-ui で追加した TransitionItem (= L 526) は `focus-visible:ring-2 focus-visible:ring-slate-300` (= 灰、 弱)

**diff**:
- EventItem: indigo-300 (= 青、 #a5b4fc 系)、 `focus:` (= 全 focus で発火、 mouse click 後も残る)
- TransitionItem: slate-300 (= 灰、 #cbd5e1 系)、 `focus-visible:` (= keyboard focus のみ発火、 mouse click では発火しない)

**polish 案**:
- A. **EventItem を `slate-300` に統一** + `focus-visible:` に変更 → TransitionItem と整合、 mouse user に強い ring が見えなくなる
- B. EventItem の indigo を維持、 ring 厚みを `ring-1` に薄くする
- C. focus-visible のみに変更 (= color は indigo 維持、 mouse click 後 ring が出ない)

**自律推奨**: **A** (= 統一 + focus-visible)
- 理由: M phase で確立した「観測層 OS の visual 階調」 (= K/L/M で slate-* を基調) と整合
- TransitionItem (= M-3c-ui 追加) と同 styling → 視覚一貫性
- mouse user に強い ring を見せない → 警告化リスク 0
- keyboard user には引き続き ring が見える (= a11y 維持)

**変更範囲** (= 外科的緻密):
- file 1: `app/(culcept)/plan/components/DayGraphTimeline.tsx` L 402
- 1 行修正: `focus:ring-2 focus:ring-indigo-300` → `focus-visible:ring-2 focus-visible:ring-slate-300`

### 2.3 P-002 (= GPT hint 2) の詳細

**現状**:
- M-2a feasibility:
  - `余白 ${view.slackMin} 分` → 「余白 20 分」
  - `不足 ${view.shortfallMin} 分` → 「不足 N 分」
- L-4a movement:
  - `移動 約 N 分` (= constant、 N は計算値)

**既に統一済の点**:
- 全て半角スペースで区切り
- 数値と「分」 の間にも半角スペース
- 「余白」 / 「不足」 / 「移動 約」 は同 styling tier (= K-3c-iii tier_2)

**GPT 「統一するか」 の解釈** (= 自律推論で 4 案):

| 案 | 内容 | 思想整合 |
|---|---|---|
| (a) 何もしない | 既に統一済、 視覚は OK | ✅ 安全 |
| (b) 「20 分」 → 「20分」 (= スペース削除) | コンパクト化 | ⚠️ 半角スペースは日本語数値表記の標準、 変更で読みづらくなる可能性 |
| (c) 「約 」 を「〜」 に置換: 「移動 〜 90 分」 | 簡潔化 | ❌ 思想違反 (= 「約」 = 確実性低、 「〜」 = 範囲、 意味が変わる) |
| (d) variant 間で文言を tier 揃える: 「移動 90 分 / 余白 20 分」 (= 「約」 削除) | 簡潔化 + tier 揃え | ⚠️ 「約」 は Mobility Truth Layer §0.2 の永続規約 (= 「中立的に表現」 の核) |

**自律推奨**: **(a) 何もしない**
- 理由: M-2a / L-4a の文言は思想を機械保証する freeze 規約 (= 「警告化しない」 / 「Mobility Truth Layer」)
- 既に半角スペースで統一されている
- 変更すると思想違反リスク (= 「約」 削除は Mobility Truth 違反)
- GPT 指摘は「確認の問い」 と解釈、 「変更必須」 ではない

**CEO 判断必要**:
- GPT が specific な polish 改善案を持っているなら、 その指摘を反映
- 但し M-2a / L-4a 文言の freeze 規約は維持

### 2.4 自律探索 P-003〜P-008 の概要

**P-003: hint span の位置**:
- 現状: TransitionItem 内に `<span className="ml-2 text-xs italic text-slate-400">詳細</span>`
- 観点: 「詳細」 が transition text の **直後** に来る (= 「移動 約 90 分 詳細」)
- polish 余地: ml-2 (= 0.5rem) を ml-3 か ml-4 に拡張、 視覚 separator を強化

**P-004: 補助行の階層感**:
- 現状: `pl-8` (= 2rem) で transition より深い indent
- polish 余地: indent 量の調整、 または視覚 separator (= `border-l` の極弱) 追加検討
- 但し border は警告化リスク → 慎重

**P-005: Plan header の tone 統一**:
- 現状: 各 tab で header が異なる ("あなたの地理" / "今日の予定" 等)
- polish 余地: tone 統一 / フォントサイズ揃え
- M phase 範囲外、 別 audit 候補

**P-006: Modal animation**:
- 既存 Framer Motion 使用 (= MEMORY.md 記載)
- polish 余地: 各 Modal の open/close transition 微調整

**P-007: Empty state copy**:
- FlowTab 「予定なし ›」、 「予定なし」 等
- polish 余地: 中立 tone 統一

**P-008: swipe boundary**:
- Home → Plan pane の端での体験
- 大規模、 別 phase 候補

### 2.5 wave 1 候補の自律推奨

**wave 1 候補 (= priority 中 + scope 小 + risk 低 から優先)**:

| 候補 | 採否 | 理由 |
|---|---|---|
| **P-001 (= focus ring 統一)** | ✅ **wave 1 採用候補** | GPT 指摘、 1 行修正、 思想整合、 risk 低 |
| P-002 (= spacing 統一) | ⏸️ **CEO 判断必要** | freeze 規約あり、 (a) 何もしない自律推奨、 但し GPT の具体提案待ち |
| P-003〜P-008 | ⏸️ smoke 後に詳細確定 | scope 小だが priority 低-中、 wave 2 以降 |

**wave 1 最小実装** (= P-001 のみ):
- file 1 / 1 行修正
- backward compat 100%
- tests 既存 + visual 検証
- CEO smoke で「強い青消えた」 を確認

---

## 3. N-2 wave 1 plan への接続点

### 3.1 N-2 wave 1 の責務 (= 自律推奨)

- **P-001 (= focus ring 統一)** を最初の wave として実装
- backward compat 100% 維持
- 既存 tests 全 PASS 維持
- CEO visual smoke で「青ring 強さ消えた」 を確認
- wave 完了で freeze、 wave 2 plan へ

### 3.2 N-2 wave 1 plan audit (= 次 doc) で確定すべき項目

1. wave 1 実装範囲確定 (= P-001 のみ / 他候補も含める / CEO 判断)
2. 各候補の 実装 protocol (= 何を / どこで / どう変える)
3. 既存 tests への影響評価
4. risk 評価 (= 永続規約への近接度)
5. CEO smoke 計画 (= wave 1 専用)
6. 連続実装可否判定 (= wave 1 が low-risk なら本 audit 後 連続 GO 可能)

### 3.3 wave 2 以降の候補

- P-002 (= spacing 統一): CEO 判断後
- P-003 (= hint position): wave 2 候補
- P-004 (= 補助行 padding): wave 2 候補
- P-005〜P-008: smoke で気になった度合い次第で priority 再評価

---

## 4. CEO 判断項目 (= 報告で停止)

### 4.1 5 件の CEO 判断

1. **P-001 (= focus ring 統一)** を wave 1 として進めるか
2. **P-002 (= spacing 統一)** の具体提案 (= GPT が specific な修正案を持っているか) / 自律推奨 (a) で進めるか
3. wave 1 を **P-001 のみ** にするか、 **他候補も含める** か
4. N-2 wave 1 plan audit (= 次 doc) を **連続 GO** で進めるか、 別 session か
5. wave 1 完了後の CEO smoke 計画 (= 即時 / 後日)

### 4.2 自律推奨 (= 一括)

| 項目 | 推奨 |
|---|---|
| wave 1 範囲 | **P-001 のみ** (= 最小、 risk 低、 1 行修正) |
| P-002 取扱 | **(a) 何もしない** + CEO 判断保留 (= freeze 規約遵守) |
| 連続 GO | ✅ N-2 wave 1 plan audit + 実装 connect で進める |
| smoke timing | wave 1 実装 commit 後の即 CEO 判断で smoke 計画 |

---

## 5. 凍結 / 連続 OK / 禁止リスト

### 5.1 凍結対象

- 全 53 frozen branches (= 既存)
- 本 audit 着地後 frozen 予定 (= **54 frozen branches** 想定)

### 5.2 連続 OK

- `docs/alter-plan-phase3-n-1-closeout-audit.md` (= 本 commit)
- `docs/decision-log.md` 追記
- **次**: N-2 wave 1 plan audit (= 別 doc、 docs only、 連続 GO 候補)
- その後: low-risk 判定後の N-2 wave 1 impl (= 別 branch)

### 5.3 禁止 (= 絶対に進まない)

- frozen branches への追加 commit
- M phase の追加変更
- N 項目の勝手な defer
- Counter-Factual / Pattern の勝手な scope 外化
- empty day ALTER flow の勝手な scope 外化
- 大規模 refactor
- 新規 tab / 新規 component 追加
- M-2a / L-4a 文言の変更 (= freeze 規約)
- Routes API / 実 API 連携 (= /plan complete 後)
- Arrival Risk Memory (= 永続禁止)
- warning / recommendation / optimization 文言 (= 永続禁止)
- amber / orange / red / icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更 (= .env.local の smoke flag は CEO 承認済例外)
- runtime telemetry sink
- **Deploy readiness / Stargazer pivot / 初期 user 獲得** (= /plan complete 後)
- fetch / push / gh / reset / restore / stash / branch delete

---

## 6. 思想 transmission (= N-1 closeout 永続規約 candidate)

1-20. (= 既存 M phase 完了規約継承)
21. **「polish 棚卸しは 3 次元 tag で機械化」** (= priority/scope/risk、 wave 計画自動化)
22. **「freeze 規約 (= 文言 / 階調) は polish で touch しない」** (= 思想保護)
23. **「GPT 指摘は『確認の問い』 として解釈、 必須変更とは限らない」** (= 自律推論で判定)

---

## 7. N-1 完了の条件 (= 確認)

| # | 条件 | 状態 |
|---|---|---|
| 1 | 棚卸し doc (= N-1 readiness audit) | ✅ `5c8600f2` |
| 2 | CEO smoke 実施 | ✅ M-3d bugfix + N-1 統合 smoke PASS |
| 3 | polish 候補リスト確定 | ✅ 本 audit (= 8 候補、 3 次元 tag) |
| 4 | N-2 wave 計画 doc 作成 | ⏸️ 次 (= 連続 GO 候補) |
| 5 | **N-1 closeout audit** | ✅ **本 commit で着地** |

→ **N-1 phase 完了**。 次は N-2 wave 1 plan audit。

---

## 8. CEO 報告 + 停止条件

### 8.1 本 audit の到達点

- smoke PASS 9 項目の正式記録
- polish 候補 8 件棚卸し (= GPT 指摘 2 件 + 自律探索 6 件)
- 3 次元 tag 付き form 確立
- wave 1 候補確定 (= **P-001 focus ring 統一** が自律推奨)
- CEO 判断 5 件
- N-2 wave 1 plan への接続点明文化

### 8.2 停止条件

以下のいずれかが発生した場合、 **即停止**:
- N-2 wave 1 impl 着手 (= 本 audit は docs only、 次 audit + 連続 GO 判定後)
- M phase の追加変更
- 大規模 refactor
- M-2a / L-4a 文言の変更
- 新規 tab / component 追加
- N 項目の自律 defer
- Counter-Factual / Pattern / empty day ALTER flow の自律 scope 外化
- Arrival Risk / 警告文言 / amber/orange/red / icon 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- **Deploy readiness / 別軸 pivot** (= /plan complete 前)

---

**完了**: Phase 3-N-1 Closeout Audit 着地。 smoke PASS 9 項目記録 + polish 候補 8 件棚卸し + GPT 指摘 2 件詳細分析 + wave 1 推奨 (= P-001 focus ring 統一) + 3 永続規約 + CEO 判断 5 件。 次は N-2 wave 1 plan audit (= 連続 GO 候補、 docs only)。
