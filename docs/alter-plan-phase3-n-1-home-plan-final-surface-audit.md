# Phase 3-N-1 Home/Plan Final Surface Audit (= 全 Plan/Home 体験棚卸し + CEO smoke 計画)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 N completion audit `95d15ea6` 着地後、 「N-1 連続 OK if low-risk」 指示)
**範囲**: Plan + Home の全 user-facing surface を漏れなく棚卸し + CEO smoke 計画提示 + N-2 polish 候補リストの作成準備 (= CEO 判断材料)
**前提**: M phase 完了 + 52 frozen branches + 本 audit は **docs only** (= 実装に進まない)

> 本 audit は **棚卸し doc**。 実装 / polish / refactor には進まない。 CEO smoke で具体「気になった項目」 を直接拾うための **maximal surface inventory** を提供。

---

## 0. N-1 の責務 (= 自律推論で再確認)

### 0.1 N-1 の中心問い

> **「/plan + Home の user-facing surface すべてに、 polish 候補があるか?」**

### 0.2 N-1 で **やる** こと

| 項目 | 内容 |
|---|---|
| 全 surface 棚卸し | Home + Plan 全画面 / 全 component / 全 transition を漏れなく list 化 |
| CEO smoke 計画 | 各 surface で確認すべき具体項目を整理 |
| polish 候補の候補リスト準備 | smoke で拾う「気になった項目」 を整理する form |
| N-2 wave 計画準備 | 各 polish 候補に priority / scope / risk を付与する form |

### 0.3 N-1 で **やらない** こと

- 実装 (= N-2 以降)
- polish 候補の具体決定 (= CEO smoke 後)
- 大規模 refactor 提案
- M phase の追加変更
- 新規 component / hook 追加
- N-3 (= ALTER flow) / N-4 (= Counter-Factual/Pattern) の検討

---

## 1. Home + Plan 全 surface 棚卸し (= 漏れなき list)

### 1.1 surface 階層 (= top-level)

```
[AneurasyncHome]
├─ 全画面 visual
├─ navigation (= top bar / bottom tabs)
├─ zone-based UI (= Genome / Rendezvous / Plan etc)
└─ HomeSwipeContainer
    ↓ (= left swipe)
[Plan pane (= PlanClient with displayMode="pane")]
├─ Plan header
├─ tab segmented control (= カレンダー / リスト / 地図)
├─ FAB (= + 教える)
├─ + 教える / 📋 教えた予定
├─ tab content (= 3 tab)
│   ├─ MapTab
│   ├─ CalendarTab
│   └─ FlowTab
└─ Modal stack
    ├─ AddAnchorModal (= 予定追加)
    ├─ AnchorDetailModal (= 詳細)
    ├─ EditAnchorModal (= 編集)
    ├─ ProposalSheet (= 提案展開)
    └─ SourceListModal (= 取得元)
```

### 1.2 Home surface 詳細

#### 1.2.1 AneurasyncHome (= `app/AneurasyncHome.tsx`)

- 全画面 visual (= zone-based)
- ナビゲーション (= MAIN_NAV: ホーム / 観測 / Genome / Rendezvous / マイページ)
- swipe gesture trigger (= 左 swipe で Plan、 右 swipe で別 zone?)

**N-1 smoke 確認候補**:
- visual 完成度 (= spacing / typography / color)
- swipe affordance (= 「左 swipe で Plan へ行ける」 と user が気付くか)
- zone-based UI の整合性
- empty state / loading state
- a11y (= keyboard / screen reader)

#### 1.2.2 HomeSwipeContainer (= Phase 1 確立)

- Home → Plan pane への横 swipe
- Pane isolation (= CSS containing block)
- Modal Swipe Lock (= Modal open 時に swipe disable)

**N-1 smoke 確認候補**:
- swipe smoothness
- boundary 体験 (= edge で snap か bounce か)
- Modal open 時に swipe lock が効くか
- 戻る swipe (= Plan → Home) の体験
- swipe 速度 / animation polish

### 1.3 Plan surface 詳細

#### 1.3.1 PlanClient (= `app/(culcept)/plan/PlanClient.tsx`)

- displayMode prop (= "route" / "pane")
- Plan header
- tab segmented control (= pill style)
- ErrorState / LoadingState
- proposalsByDate / proposalTemplateVariables 渡し
- recentUndoRecords (= Quiet Undo Window)

**N-1 smoke 確認候補**:
- tab 切替の smoothness
- pill segmented control の visual
- ErrorState 文言 + visual
- LoadingState placeholder
- Plan header の copy / visual
- displayMode 差分 (= /plan vs /home swipe pane)

#### 1.3.2 MapTab (= L-4d / M-3c-ui 接続済)

- 地理 + 1 日の構造 + feasibility disclosure
- Google Maps + pin 表示
- DaySwitcher (= 前日/今日/翌日 切替)
- PlanMapView (= Google Maps + pins + polyline + legend)
- SelectedAnchorCard (= bottom card、 pin tap 後の詳細)
- DayGraphTimeline (= 1 日の構造 + movement display + feasibility disclosure)
- CategoryGrid (= 9 カテゴリ集計)
- UnresolvedAnchorsSection
- StaticAlterSuggestionCard
- FAB

**N-1 smoke 確認候補**:
- Map 描画速度 / loading state
- pin tap → bottom card transition
- DaySwitcher の visual / interaction
- 「あなたの地理」 header の copy
- legend / overlay の visual 配置
- empty state (= 「予定なし」 + baseline なし)
- 「詳細」 hint / feasibility disclosure 表示の polish (= M-3c-ui で smoke PASS 済、 但し全体統一感)
- pin / category color の整合
- transitions の smoothness

#### 1.3.3 CalendarTab (= Phase 2-A 月ビュー + L-4d-b1 + M-3d 接続済)

- 月 grid (= weekStrip + 月送り)
- selected day detail
- 各日 anchor list
- 月送り animation
- selected day timeline (= K-3b + L + M-3d disclosure)

**N-1 smoke 確認候補**:
- 月 grid の visual 完成度 (= cell 形状 / spacing)
- 月送り animation の smoothness
- selected day 切替の visual
- weekStrip の visual / interaction
- empty cell の見え方
- 「予定なし日」 の cell 表現
- 月送り時の selected date clamp 体験
- 「詳細」 disclosure の polish (= M-3d で smoke PASS 済)

#### 1.3.4 FlowTab (= Phase 2-B image thumbnail + L-4d-b2 + M-3d-bugfix 接続済)

- 7 日 list (= sticky header per day)
- 各日 anchor list (= time + title + sub + image thumbnail)
- 各日 timeline (= K-3c-ii compact + L + M-3d disclosure)
- empty day inline button (= 「予定なし ›」)
- FAB

**N-1 smoke 確認候補**:
- sticky header の visual 完成度
- 各日 anchor row の visual / image thumbnail
- empty day inline button の visual
- 「予定なし ›」 文言の中立性
- compact timeline の visual
- 7 日 scroll の smoothness
- 「詳細」 disclosure の polish (= M-3d-bugfix で smoke PASS 済)

### 1.4 Modal surface 詳細

#### 1.4.1 AddAnchorModal (= 予定追加)

- FAB tap で起動
- AnchorFormFields (= title / date / time / location / category 等)
- PlaceCandidatesPanel (= location 候補)
- 確定 button

**N-1 smoke 確認候補**:
- Modal animation (= 開閉)
- form layout / spacing
- 入力 field の visual
- error state / validation copy
- location 候補表示の polish
- 確定 button の visual
- Modal Swipe Lock 動作

#### 1.4.2 AnchorDetailModal (= 詳細閲覧)

- 既存 anchor tap で起動
- 詳細情報表示
- 編集 / 削除 button

**N-1 smoke 確認候補**:
- Modal animation
- 詳細情報の layout / typography
- action button の visual
- 編集 / 削除 confirmation 体験

#### 1.4.3 EditAnchorModal

- 詳細 modal の 「編集」 から起動
- form layout は AddAnchorModal と同
- 更新 button

**N-1 smoke 確認候補**:
- AddAnchorModal と同じ polish 観点

#### 1.4.4 ProposalSheet / ProposalChip (= 提案 hint)

- ProposalChip (= Memory Chip style hint)
- ProposalSheet (= 展開後の詳細)
- accept / modify / dismiss button
- Quiet Undo Window (= 「戻す」 link)

**N-1 smoke 確認候補**:
- Chip visual / 中立 tone
- Sheet 展開 animation
- 「戻す」 link visual
- accept transaction の visual feedback

#### 1.4.5 SourceListModal

- anchor 取得元 source 表示

**N-1 smoke 確認候補**:
- source list の visual
- empty state

---

## 2. 全画面遷移 (= user journey) 棚卸し

### 2.1 主要 user journey

| # | journey | 構成 |
|---|---|---|
| **J1** | Home → 左 swipe → Plan pane | AneurasyncHome → HomeSwipeContainer → PlanClient (= pane) |
| **J2** | /plan 直 URL | URL → PlanClient (= route) |
| **J3** | Plan tab 切替 | MapTab ⇄ CalendarTab ⇄ FlowTab |
| **J4** | 予定追加 | FAB tap → AddAnchorModal → 確定 → list update |
| **J5** | 予定詳細閲覧 | anchor tap → AnchorDetailModal |
| **J6** | 予定編集 | DetailModal → 編集 button → EditAnchorModal → 更新 |
| **J7** | 予定削除 | DetailModal → 削除 button → 確認 → 削除 |
| **J8** | 提案受諾 | ProposalChip tap → 受諾 → list update → 「戻す」 link |
| **J9** | feasibility disclosure 観測 | transition tap → 「詳細」 / 「閉じる」 → 補助行表示 |
| **J10** | 空き日タップ | FlowTab 「予定なし ›」 tap → AddAnchorModal (= 日 prefill) |
| **J11** | カテゴリ追加 | MapTab CategoryGrid 「+」 button → AddAnchorModal (= category prefill) |
| **J12** | Map pin tap | MapTab pin tap → SelectedAnchorCard 表示 |

### 2.2 各 journey の polish 観点

| journey | smoke 観点 |
|---|---|
| J1 | swipe smoothness / Plan pane の Map 描画タイミング / 戻る swipe 体験 |
| J3 | tab 切替 animation / each tab loading / disclosure state reset (= 「観測の幕間」) |
| J4 | Modal open animation / form 入力 friction / 確定 feedback |
| J5-J7 | Modal stack の depth / 確認 dialog の中立性 / 操作後 list update animation |
| J8 | Chip → accept → 「戻す」 link への transition smoothness |
| J9 | 「詳細」 hint discovery / tap target / 補助行の visual polish |
| J10 | empty day → 日 prefill での Modal 体験 |
| J11 | category 「+」 button visual / Modal の category prefill |
| J12 | pin tap → bottom card animation / map → list 遷移 |

---

## 3. CEO Visual Smoke 計画 (= 棚卸し based)

### 3.1 smoke 範囲 (= maximal)

CEO smoke は **3 stage** で進める提案:

| stage | 範囲 | 想定時間 |
|---|---|---|
| **stage 1** | Home + swipe + Plan 3 tab の visual sweep | 30-60 分 |
| **stage 2** | 主要 journey J1-J9 の操作 sweep | 30-60 分 |
| **stage 3** | Modal stack J5-J11 + edge cases | 30-60 分 |

### 3.2 stage 1: visual sweep

各画面で **「気になる項目」 を CEO が直接拾う**:

- 色味 / spacing / typography
- copy の中立性
- empty state / loading state
- icon / illustration
- micro-interaction

→ 候補が出るたびに list 化 (= N-2 polish 候補リスト)

### 3.3 stage 2: 主要 journey 操作

J1-J9 を順に体験、 「**動作の違和感**」 を拾う:

- transition smoothness
- 反応速度
- friction (= 余計な tap / 戸惑い)
- feedback (= 操作後の confirmation)

### 3.4 stage 3: Modal stack + edge cases

Modal の開閉 / 入れ子 / Modal Swipe Lock を確認、 edge cases:

- error state (= 失敗時)
- empty state (= データ 0)
- 入れ子 Modal (= 詳細 → 編集)
- offline (= 必要なら)
- a11y (= keyboard / VoiceOver)

### 3.5 smoke 出力 form

各候補項目を:

```
[surface] : [現状] : [気になった点] : [優先度 (= 高/中/低)] : [scope (= 小/中/大)] : [risk]
```

形式で記録 → N-2 wave 計画の素材

---

## 4. N-2 polish 候補リスト準備 (= form)

### 4.1 候補項目の整理 form

| ID | surface | 現状 | 気になった点 | priority | scope | risk |
|---|---|---|---|---|---|---|
| P-001 | (例) AneurasyncHome | spacing | 上余白が広すぎる | 中 | 小 | 低 |
| P-002 | ... | ... | ... | ... | ... | ... |

### 4.2 priority 基準 (= CEO 判断)

| priority | 基準 |
|---|---|
| 高 | user 第一印象 / 主要 journey の friction |
| 中 | 細部の polish / 美しさ |
| 低 | nice-to-have |

### 4.3 scope 基準

| scope | 基準 |
|---|---|
| 小 | 1 file / 数行変更 |
| 中 | 1-2 component / 一定 refactor |
| 大 | 構造変更 / 複数 component |

→ N-2 wave では **小 + 中 priority 高 / 中** を優先。 **大** scope は CEO 判断必要。

### 4.4 risk 基準

| risk | 基準 |
|---|---|
| 低 | backward compat 100%、 既存 file 改変小 |
| 中 | 一部既存 file 改変、 但し test で機械保証可 |
| 高 | 構造変更、 M phase の追加変更近接 |

→ **risk 高** は N-2 では取り上げず、 CEO 判断 + 別 audit。

---

## 5. N-2 wave 計画準備

### 5.1 wave 単位

- 1 wave = 1-2 polish 候補
- 1 wave は 1-3 日
- 各 wave で CEO smoke

### 5.2 wave の優先順

1. priority 高 + scope 小 + risk 低 (= 即実装可)
2. priority 高 + scope 中 + risk 低
3. priority 中 + scope 小-中 + risk 低
4. その他 (= CEO 判断)

### 5.3 wave 内で禁止

- 大規模 refactor
- 新 tab 追加
- M phase の追加変更
- 新 component / hook 追加 (= 必要時 CEO 承認)
- frozen branches への追加 commit
- N-3 / N-4 に近接する変更
- DB / env / package / dependency 変更
- localStorage / persist
- 警告色 / icon / 警告文言

---

## 6. 革新的アイデア (= N-1 棚卸し固有、 5 件)

### 6.1 革新 N-1-A: 「surface 階層」 を maximal で list 化

通常: polish 候補を engineer が提案
革新: 全 surface (= 画面 / component / journey) を **漏れなく list 化** してから CEO smoke
→ 「気付かなかった項目」 を構造的に拾えるよう、 棚卸しを精緻化

### 6.2 革新 N-1-B: 3 stage smoke (= visual / journey / modal/edge)

通常: 1 回の smoke で全部
革新: stage 分割で集中度↑ + 漏れ防止
→ CEO の認知負荷を分散、 「集中して観る」 ことで質的検証の精度↑

### 6.3 革新 N-1-C: candidate form を構造化 (= priority / scope / risk)

通常: 「polish 案」 のリスト
革新: 各候補に **priority / scope / risk** の 3 次元 tag
→ N-2 wave 計画で自動的に順序が決まる

### 6.4 革新 N-1-D: 「観測の幕間」 を全 journey で確認規約化

M phase で確立した「観測の幕間」 (= reset) を:
- tab 切替時 ✅ (= 既に確立)
- selectedDate 切替時 ✅
- week 切替時 ✅
- Plan ↔ Home swipe 時 → **確認必要** (= state preserve / reset の体験は適切か)

→ 全 journey で「観測の幕間」 体験を統一規約化。

### 6.5 革新 N-1-E: CEO smoke 「気になった項目」 のテンプレ化

CEO が直接拾う形式を form 化 → engineer が後で polish 案を整理しやすい
→ 「気になった」 を「polish 候補」 に変換する protocol を確立

---

## 7. CEO 判断項目 (= 報告で停止)

### 7.1 4 件の CEO 判断

1. **smoke stage の進め方**: 3 stage で進めるか、 連続 smoke か、 別の進め方か
2. **smoke の timing**: 即時 / 後日 / 段階的 (= stage ごとに別 session)
3. **N-2 wave 計画の優先順承認**: priority/scope/risk 基準 OK か
4. **本 audit の連続実装可能範囲**: 本 audit 着地 + smoke 結果待ち + CEO 判断 → N-1 closeout → N-2 wave 計画 (= 別 audit)

### 7.2 N-1 完了の条件

| 条件 | 内容 |
|---|---|
| 1 | 本棚卸し doc の完成 ✅ (= 本 commit) |
| 2 | CEO smoke 実施 ⏸️ |
| 3 | polish 候補リスト確定 ⏸️ (= smoke 後) |
| 4 | N-2 wave 計画 doc 作成 ⏸️ (= 別 audit、 CEO 判断後) |
| 5 | N-1 closeout audit ⏸️ (= 上記全完了後) |

---

## 8. 凍結 / 連続 OK / 禁止リスト

### 8.1 凍結対象

- 全 52 frozen branches (= 既存)
- 本 audit 着地後 frozen 予定

### 8.2 連続 OK (= 本 audit + CEO smoke 後 N-2 wave 計画 audit)

- `docs/alter-plan-phase3-n-1-home-plan-final-surface-audit.md` (= 本 commit)
- `docs/decision-log.md` 追記
- CEO smoke 実施
- smoke 結果に基づく N-2 wave 計画 audit (= 別 doc、 CEO 判断後)

### 8.3 禁止 (= 絶対に進まない)

- N-2 実装着手 (= wave 計画 audit + CEO 承認後)
- 大規模 refactor
- M phase の追加変更
- 新規 component / hook 追加
- frozen branches への追加 commit
- N-3 / N-4 の検討 (= 別 phase audit)
- Routes API / 実 API 連携
- Arrival Risk Memory (= 永続禁止)
- warning / recommendation / optimization 文言 (= 永続禁止)
- amber / orange / red / icon / badge
- localStorage / persist
- DB / env / package / dependency 変更
- Deploy readiness / 別軸 pivot (= /plan complete 前)
- fetch / push / gh / reset / restore / stash / branch delete

---

## 9. CEO 報告 + 停止条件

### 9.1 本 audit の到達点

- Home + Plan 全 surface 漏れなき list 化
- 12 主要 user journey 棚卸し
- 3 stage CEO smoke 計画提示
- polish 候補リスト form (= priority/scope/risk)
- N-2 wave 計画準備
- 革新的アイデア 5 件
- CEO 判断項目 4 件

### 9.2 報告事項

| 項目 | 内容 |
|---|---|
| 全 surface 棚卸し | Home + Plan 全画面 / component / Modal / journey |
| smoke 計画 | 3 stage (= visual / journey / modal+edge)、 各 30-60 分 |
| polish 候補 form | priority/scope/risk の 3 次元 tag |
| N-2 wave 単位 | 1 wave / 1-2 候補、 都度 CEO smoke |
| CEO 判断境界 | smoke 進め方、 timing、 wave 優先順承認、 N-1 closeout 認定 |

### 9.3 停止条件

以下のいずれかが発生した場合、 **即停止**:
- 実装着手 (= 本 audit は docs only)
- M phase の追加変更
- N-3 / N-4 の検討着手
- 大規模 refactor 提案
- 新規 component / hook 追加
- frozen branches への追加 commit
- N 項目の勝手な defer
- Arrival Risk / 警告文言 / amber/orange/red / icon 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- **Deploy readiness / 別軸 pivot** (= /plan complete 前)

---

**完了**: Phase 3-N-1 Home/Plan Final Surface Audit 着地。 全 surface 漏れなき list 化 (= AneurasyncHome / HomeSwipeContainer / PlanClient / 3 tab / Modal stack / 12 journey) + 3 stage CEO smoke 計画 + polish 候補 form + N-2 wave 計画準備 + 革新 5 件 + CEO 判断 4 件。 連続実装は本 audit までで停止、 CEO smoke 待ち。
