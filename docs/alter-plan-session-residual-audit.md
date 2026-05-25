# Alter Plan Session Residual Audit (= 本セッションで触った範囲の残課題監査)

**Status**: 監査結果報告 (= 着手前)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: **本セッションで触った alter plan 範囲のみ** (= CEO 指示 「他タスクには移行禁止」)

---

## 1. 監査範囲確定 (= 本セッションで実装した範囲)

| Phase | 内容 | 完了状態 |
|---|---|---|
| sub-phase 6 | EventCard refactor (= SourceIndicator + ExecutionLayerChip) | ✅ 完了 |
| sub-phase 7 | ImportedLockEscapeModal first-pass | ✅ 完了 (= first-pass、 実 trigger 接続は未着手) |
| sub-phase 8a | FlowTab 新 path 接続 (= LIST_NEW_TIMELINE_ENABLED flag 制御) | ✅ 完了 |
| sub-phase 8b (1〜12) | TimelineSpine + EventCard semantic tint + CategoryMeaning + transitions etc. | ✅ 完了 |
| sub-phase 8c (+ 2 corrective) | SummaryFooter (= 解釈レイヤーの器、 中立文体) | ✅ 完了 (= score 本計算は凍結) |
| List closeout audit doc | redesign 完了報告 (= docs only) | ✅ 完了 |
| Map spec audit v1→v3 | Map redesign spec (= CEO 画像分析統合 + 3 補正) | ✅ 完了 |
| Map impl readiness v1→v2 | Map 実装方針 + 3 補正 | ✅ 完了 |
| Map 9a-pre | adapter + types + flag + contract test | ✅ 完了 |
| Map 9a-impl (Step α/β/γ/δ + corrective + fix1/fix2) | shell + sheet + pin + panel + label | ✅ 完了 |
| Map 9b-1〜9b-6 (+ audit) | spatial binding / visual polish / layout / animation | ✅ 完了 |
| Map 9 closeout + corrective | flag 削除 + 旧 UI 削除 + 単一 path 化 + LIST flag true | ✅ 完了 (= 暫定固定あり) |

---

## 2. 🔴 P0: 緊急度高 — 暫定状態 / 設計負債

### 2.1 LIST_NEW_TIMELINE_ENABLED = true 暫定固定 (= List 正式 closeout 未着手)

- 現状: `lib/plan/list/featureFlags.ts` の `LIST_NEW_TIMELINE_ENABLED` を **`true` 固定** にした (= 9 closeout corrective)
- 問題: List 旧 UI code path が **FlowTab.tsx 内に残存** (= 11 件 flag 参照、 line 308 / 316 / 406 等)
- 影響: dead code が増、 保守負債、 List 正式 closeout で削除予定だが未着手
- 対応必要: List unit closeout (= 別 readiness、 別 PR)、 本セッション scope 外として残す

### 2.2 PlanClient.tsx 内 `_listFlagPlaceholder` dummy 参照

- 現状: 「LIST_NEW_TIMELINE_ENABLED は引き続き保持」 ために dummy 参照
- 問題: TypeScript の eslint-disable コメント付き、 醜い
- 対応: List unit closeout 時に削除可能 (= LIST flag 削除と同時)

### 2.3 MapTab.tsx 内 dead imports + dead props

- **dead imports** (= 9 closeout で MapTab function body simplify した結果 unused):
  - `GlassBadge` from glassmorphism-design
  - `isPlaceUnconfirmed` from locationConfirmationStatus
  - `detectTimedAnchorOverlaps` from anchorOverlap
  - `formatLocationDisplayParts` from anchor-detail-format
  - `pickCategoryIcon` from categoryIconMap
  - `pickCategoryColorClass` from categoryColorMap
  - `pickBrandIcon` from brandIconMap
  - `buildVariablesForProposal`, `selectFirstProposalForDate`, `CalendarProposalProps` from calendarProposalSelector
  - `selectActiveUndoForDate` from quietUndoWindow
  - `DayGraphTimeline` from components/DayGraphTimeline
  - `ProposalChip` from components/ProposalChip
  - `useMapTabMovementDisplay`, `useMapTabFeasibilityDisplay`
  - `applyDisclosureAction`, `getDisclosureStateForIndex`, `resetAllDisclosures`, `ExpandedTransitionIndices`
  - `CATEGORY_META`, `LOCATION_GROUP_ORDER`, `MAP_CATEGORY_MARKER`, `MAP_SENSITIVE_MARKER`, `SENSITIVE_LABEL`, `addDays`, `categoryFrequencyVoice`, `categoryOf`, `categoryTimeSignature`, `countOccurrences`, `formatJpDate`, `groupAnchorsByLocation`, `CategoryGroup`, `LocationCategory`, `LocationGroupKey`
- **dead props**:
  - `onAddRequest` (= 削除済み FAB / handleCategoryAdd で使われていた)
  - `proposalsByDate`, `proposalTemplateVariables`, `onProposalAccept`, `onProposalModify`, `onProposalDismiss`, `acceptingProposalIds`, `recentUndoRecords`, `onProposalUndo` (= 削除済み SelectedAnchorCard 経路)
  - `dayGraphByDate` (= 9 closeout でも明示的に backward compat と書いたが、 実 render 削除済み)
- 影響: TypeScript unused import warning、 bundle size 増、 認知負担
- 対応: 「9 closeout polish」 として import cleanup 必要

### 2.4 MapTab.tsx 内 dead helpers + 残コメント

- `orderById` 計算が残存 (= 旧 marker.label 用、 SVG embed 後 不要)
- 「Step γ / Step δ-corrective / 9a-impl / newMode 時のみ」 等のコメントが残っている (= 削除済みの分岐参照)

---

## 3. 🟡 P1: 機能補足 — Map first-pass の polish 残

### 3.1 9b-1 backlog (= 9b-1 採用時に CEO + GPT 認識)

- selected pin の title ラベルが pin から少し遠い時 spatial binding 弱い
  - → 9b-2 で部分対応 (= pin 真上寄り + Y clamp)
  - 残: 動的接続線 (= connector line) / icon-aware label color 等は未着手

### 3.2 9b-3 backlog (= visual polish)

- pin proportions 微調整 (= cafe/home redesign 済み、 他カテゴリは未点検)
- selected pin の visual differentiation (= scale+2 / stroke / zIndex / shadow) を CEO 「軽い」 で固定済み、 強化余地

### 3.3 9b-4 backlog (= layout)

- sheet open 時の panel hide 採用済み、 ただし「panel 縮退 (chevron 残)」 mode は未実装 (= Option β、 9b-4 で却下)

### 3.4 9b-5 deferred 8 件 (= placeholder/overlay text 統一、 9 closeout で部分対応)

- 9 closeout でも未完: PlanMapView 内 placeholder/overlay text:
  - 「地図の表示には API キーが設定されていません」 (= keyAvailable=false)
  - 「地図を読み込んでいます...」 (= script load 中)
  - 「あなたの地理を確認中...」 (= loading)
  - 「予定 + baseline を設定すると、 ここに並びます」 (= pin 0 + baseline 0)
  - 「予定を追加すると、 {baseline} の pin として並びます」 (= pin 0 + baseline あり)
  - 「予定は baseline 周辺の概算 pin として表示されます」 (= apiAvailable=false)
- map div aria-label: 「マップ (今日の予定の場所)」 に統一済み (= 9 closeout corrective で対応)
- 対応: 「9 closeout-2 text polish patch」 として CEO 判断後、 全 placeholder/overlay text を 「ピン」 「拠点」 「マップ」 等の natural Japanese に統一

### 3.5 9b-6 backlog (= animation)

- sheet open slide-up 実装済み
- 未着手: sheet close exit animation (= AnimatePresence 必要)、 pin tap scale animation
- 9 closeout で defer 確定、 polish 後段

---

## 4. 🟡 P2: List 知能・運用接続層 (= 8c で凍結)

### 4.1 SummaryFooter score 本計算

- 現状: SummaryFooter は **解釈レイヤーの器** として実装、 固定 SVG indicator + 中立文 1 行
- 凍結: 「数値スコア計算 / 実評価 / 推奨」 は 8c で凍結 (= GPT 補正 「箱だけ作って中身は次フェーズ」)
- 残: 実 score 計算 (= 場所間移動量 / category 多様性 / etc.) は別 phase

### 4.2 ExecutionLayer 本体

- 現状: ExecutionLayerChip (= source/execution の chip 表示) sub-phase 6 で実装
- 残: layer 本体 (= 何を実行するか、 どう接続するか) は未着手

### 4.3 ImportedLockEscape の trigger 接続

- 現状: ImportedLockEscapeModal first-pass (= 表示のみ、 sub-phase 7)
- 残: 実 trigger logic (= 何で modal が出るか、 lock 解除 flow、 reimport 等) は未着手

### 4.4 SourceIndicator full variant 運用

- 現状: chip-only variant + accepted Alter provenance 実装
- 残: full variant の運用シナリオ (= 詳細 sheet で由来表示) は仕様のみ、 接続未

### 4.5 List animation / micro interaction

- 現状: TimelineSpine static
- 残: pin tap / row select の animation polish

---

## 5. 🟡 P2: Map first-pass で凍結された内部接続

### 5.1 polyline strong/weak fallback (= readiness v2 §2.3.4 で 3-tier 定義)

- 現状: Polyline 強 (= 細い中立色 破線、 Google Maps native) のみ実装
- 未着手:
  - polyline 弱 (= API 不可時の fallback 線)
  - polyline 使えない時の代替表示
- これは 9 closeout で含まれず

### 5.2 sheet image slot β (= imageUrl 常に undefined)

- 現状: image slot は placeholder β (= 淡 category 背景 + 小 glyph) で 9a-impl 完了
- 凍結: 実 image 取り込み層は未着手 (= LLM / 外部ファイル import の本丸)

### 5.3 「ここへの経路」 CTA disabled 状態の改善

- 現状: lat/lng 不在 → 「経路を開けません (場所が未解決)」 disabled button
- 残: location 解決を促す UI (= 「住所を追加」 link 等)、 未着手

---

## 6. 🔴 P0/P1: Calendar (= 完全未着手)

CEO + GPT 「Plan 全体で Calendar が一番弱い」 指摘の通り:
- 本セッションで Calendar は **全く触っていない**
- shell 統合 (= useNewShell=true) で 「今日のプラン」 header が出るが、 中身は旧 CalendarTab
- mock fidelity / 機能再設計 完全未着手

---

## 7. 🔴 P0: 本セッション scope 外だが言及された未着手領域 (= GPT 監査整合)

### 7.1 LLM 実連携 (= GPT 監査 §1.A、 P2)

- 現状: meaning text は CategoryMeaning module の **deterministic** 生成 (= category × time × state)
- 未着手:
  - LLM による文脈解釈
  - 予定間の流れ統合
  - 履歴ベース再解釈
  - LLM safety gate
  - prompt versioning / fallback / cache / cost / observability
- 本セッション 8b-1 で 「Alter 観測由来」 と framing したが、 真の LLM 接続は未

### 7.2 外部ファイル取り込み (= GPT 監査 §1.B、 P3)

- 現状: 「imageUrl 常に undefined / fake 禁止」 規約のみ確立、 取り込み層なし
- 未着手:
  - PDF / CSV / ICS / image / docs 入力
  - 抽出 → Anchor / Event 変換
  - source provenance 格納
  - 差分更新
  - error / review UI
- 本セッション scope 外 (= CEO 「他タスク禁止」)

### 7.3 import / source 運用層 (= GPT 監査 §1.C)

- 現状: SourceIndicator で 「ユーザー入力 / Alter 提案受入」 の 2 系統 framing 済み
- 未着手:
  - 外部予定ソース安定同期
  - 同一予定突合
  - source authority / ownership 本運用
  - 監査可能履歴管理

---

## 8. 🟡 P0: 安全性 (= 9 closeout で得た教訓)

### 8.1 closeout の危険性

- 今回 closeout で **重大ミス 1 件** (= PlanMapView 内 newMode 分岐削除漏れ → 9b 全機能消失)
- corrective で復旧したが、 同種ミス予防策が必要

### 8.2 安全策候補

- closeout 前 「全 flag 統一 ON で smoke 確認」 → 全機能可視
- closeout 後 「全 tab + 全機能 visual smoke 必須」
- 「prop 削除前に全 caller 確認」 grep 必須

---

## 9. 📋 残課題 priority 一覧 (= CEO 判断仰ぐ用)

### 本セッション scope 内 (= alter plan)

| priority | 課題 | 工数 | 着手判断 |
|---|---|---|---|
| **P0** | MapTab.tsx dead imports / dead props / dead helpers cleanup | 小 | 「9 closeout polish」 として直ちに着手可 |
| **P0** | 残 commit (= corrective) の docs update + decision-log | 小 | 必須 |
| **P1** | 9b-5 deferred 8 件 (= placeholder/overlay text 統一) | 小 | 「9 closeout-2 text polish」 として CEO 判断 |
| **P1** | List 正式 closeout (= LIST_NEW_TIMELINE_ENABLED 削除 + 旧 UI 物理削除) | 中-大 | List unit closeout readiness + CEO 判断 |
| P2 | Map sheet exit animation / pin tap scale (= 9b-6 残) | 中 | CEO 判断後 |
| P2 | polyline 弱 fallback (= readiness v2 §2.3.4 完全実装) | 中 | CEO 判断後 |
| P3 | 「ここへの経路」 CTA disabled 状態 UI 改善 | 小 | CEO 判断後 |

### 本セッション scope 外 (= GPT 監査整合、 別 readiness 必要)

| priority | 課題 | 工数 |
|---|---|---|
| **P0** | Calendar 再設計 (= shell 統合済みだが中身未着手) | 大 |
| P2 | LLM 接続設計 (= meaning / summary / safety / fallback) | 巨大 |
| P3 | 外部ファイル import (= file format / extraction / provenance) | 巨大 |
| P3 | source 運用層 (= authority / ownership / 履歴) | 大 |

---

## 10. CEO 判断仰ぐ (= 残課題の進め方)

| Option | 内容 |
|---|---|
| **A. 直近 alter plan P0 cleanup** (= 推奨) | MapTab dead imports/props cleanup + decision-log update + corrective fix3 atomic commit。 List 正式 closeout は別 readiness |
| B. 「9 closeout-2 text polish」 直行 | placeholder/overlay text 統一を含む、 9b-5 deferred 全消化 |
| C. List 正式 closeout 着手 | LIST flag + 旧 FlowTab UI 完全削除、 List unit closeout |
| D. Map polish (= 9b-6 残 animation 等) | exit animation + pin tap scale 追加 |
| E. 監査結果のみ docs commit、 着手なし | 本 audit doc commit、 CEO 別判断待ち |

私の推奨: **A** (= P0 cleanup) → CEO 採用判定後、 P1 残課題 + List 正式 closeout 順次着手。

---

## 11. 不変原則 (= 全 課題で carry)

- 中立文体 (= 命令形 / 評価形容詞 / 推奨語 なし)
- 規約 24-extended (= focus-visible:border-slate-300)
- 絵文字 0 (= 全 SVG icon)
- imageUrl 常に undefined (= placeholder β 維持、 truth ない時 fake 禁止)
- 既存 frozen file 不触 (= googleMapsLoader.ts etc.)
- DB / env / package / dependency 変更禁止
- alter plan scope 限定 (= 他タスク移行禁止)

---

## 12. 設計書 references

- `docs/alter-plan-list-redesign-spec-audit.md` (= List spec)
- `docs/alter-plan-list-redesign-closeout-audit.md` (= List closeout 達成率)
- `docs/alter-plan-map-redesign-spec-audit.md` v3 (= Map spec)
- `docs/alter-plan-map-redesign-impl-readiness.md` v2 (= Map impl readiness)
- `docs/alter-plan-map-redesign-9b-readiness.md` (= 9b 計画)
- `docs/alter-plan-map-redesign-9-closeout-readiness.md` (= 9 closeout 計画)
- `docs/alter-plan-map-9b-5-string-audit.md` (= 文字列監査)
- `docs/decision-log.md` (= 全 決定履歴)

---

**結論**: 本セッションで触った範囲では、 主要 UI 骨格 (= List + Map) は完成、 ただし **dead code cleanup** + **deferred text polish** + **List 正式 closeout** が残課題。 Calendar / LLM / 外部ファイル import は本セッション scope 外。
