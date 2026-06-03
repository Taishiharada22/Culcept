# Multi-Session Integration Audit & Plan（2026-06-04）

**Status:** read-only 監査完了 + 統合 plan 確定（**統合実行は CEO 明示 GO 待ち・未実行**）。
**Scope:** 5 並行セッションブランチを安全に統合するための衝突マップ・順序・解決方針・安全策の記録。
**最優先制約（CEO）:** **最新の状態を絶対に失わない。** 片側選択禁止・union 解決のみ。

> ⚠️ 本書時点で実施済みは **safety tag 作成 + 本 docs 保存のみ**。 merge / rebase / reset / clean / stash / force push / PR / source branch 編集 / CalendarTab・PlanClient 修正は **未実施**。

---

## 0. 結論（TL;DR）
- 5 セッション・累計 ~399 file 変更のうち、**真の code 衝突はわずか 2 ファイル**: `CalendarTab.tsx`(LP×SH) と `PlanClient.tsx`(SH×NT)。`decision-log.md` は append-only で union 自明。
- CEO 設計確定: **CalendarTab = 「週間/月」トグル**。週=既存週ビュー + LP(outfit dashboard) + 既存 day timeline / 月=SH 月グリッド。**両方保持・片側選択禁止**。
- 単独 main 投入は禁止（衝突先送り＝最新喪失リスク）。**main 起点の integration branch で 1 回の deliberate な統合**。
- **serene-bardeen は監査中に HEAD 移動＝稼働中**。統合実行前に安定点で停止が必要。

---

## 1. 復元用 safety tag（実施済・2026-06-04・push なし・local のみ）
各ブランチ HEAD を annotated tag で固定（recovery anchor。 統合検証完了まで削除しない）:

| tag | 指す commit | ブランチ |
|---|---|---|
| `safety/preinteg-20260604/loving-pike-fa227a` | `41dff714` | claude/loving-pike-fa227a |
| `safety/preinteg-20260604/plan-pdf-image-import` | `a1024625` | feat/plan-pdf-image-import |
| `safety/preinteg-20260604/nifty-turing-128e67` | `aeb5332c` | claude/nifty-turing-128e67 |
| `safety/preinteg-20260604/serene-bardeen-fd9a59` | `34cf967d` | claude/serene-bardeen-fd9a59（稼働中・移動後を捕捉）|
| `safety/preinteg-20260604/frosty-hellman-b3305e` | `8e120aee` | claude/frosty-hellman-b3305e |

- **merge 先 base = local `main` `9afdcaf9`**（origin/main `5a0c0f7e` は +348 遅れ・GitHub push 停止中で stale → 使わない）。

---

## 2. 統合対象ブランチ一覧

| 記号 | ブランチ | HEAD | main比 | file | 路線 | 監査中の安定性 |
|---|---|---|---|---|---|---|
| **LP** | claude/loving-pike-fa227a | 41dff714 | +114 | 142 | 着る物推薦 + cutout + Phase6 redirect | ✓ 不動 |
| **SH** | feat/plan-pdf-image-import | a1024625 | +70 | 138 | シフト月グリッド + PDF/画像取込 | ✓ 不動 |
| **NT** | claude/nifty-turing-128e67 | aeb5332c | +58 | 61 | Reality Control OS（適応窓）| ✓ 不動 |
| **SB** | claude/serene-bardeen-fd9a59 | 34cf967d | +26 | 51 | Reality Control OS（4-B-1C）| ⚠️ 稼働中（移動検知）|
| **FH** | claude/frosty-hellman-b3305e | 8e120aee | +16 | 7 | Plan-Map handoff（docs）| ✓ 不動 |

---

## 3. 衝突マップ（5 ブランチ横断・同時変更ファイル）

| ファイル | 触るブランチ | merge-tree（in-memory 3-way）|
|---|---|---|
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | **LP × SH** | 🔴 真の衝突（手動・union）|
| `app/(culcept)/plan/PlanClient.tsx` | LP・SH・NT | 🔴 衝突は **SH × NT のみ**（LP は全員とクリーン）|
| `docs/decision-log.md` | LP・SH・NT | 🟡 append-only → union 自明 |
| `lib/plan/featureFlags.ts` | SH・NT | ✅ 自動マージ可 |
| `lib/plan/external-anchor-input.ts` | SH・NT | ✅ 自動マージ可 |

**merge-tree ペア予測:**
- LP×SH → 🔴 CalendarTab + decision-log
- SH×NT → 🔴 PlanClient + decision-log
- LP×NT → ✅ code クリーン（decision-log のみ）
- NT×SB → ✅ 完全クリーン
- SB・FH は他のどのブランチとも**共有ファイルゼロ**（衝突なし）

→ **手動解決が要るのは CalendarTab(LP×SH) と PlanClient(SH×NT) の 2 箇所のみ。**

---

## 4. CalendarTab.tsx 解決方針（CEO 確定・union）

両者とも既存タブへの **additive 追加**（LP +65/-1・SH +85/-1、削除ほぼゼロ）:
- **SH 追加**: `CalendarViewToggle`（週⇄月）+ `viewMode` state + `buildMonthGrid`/`CalendarViewBody`/`MonthGridView` + `DayIndicatorBadge`（休/希望休）+ `resolveShiftAnchorChip`。`PLAN_FLAGS`/`calendarViewMode` で gating。
- **LP 追加**: `CalendarOutfitDashboard` + `timelineOpen` トグル + legacy-timeline div。

**CEO 確定の合成（union のみ・片側選択禁止）:**
```
CalendarTab = 「週間 / 月」トグル
  週間モード = 既存週ビュー + LP outfit dashboard + 既存 day timeline（DayGraphTimeline）  ← 3要素すべて保持
  月モード   = SH 月グリッド（MonthGridView）へ到達
```
- 衝突の性質は「import / state / return の隣接挿入」= 機械的。 両 import・両 state を残し、**return で viewMode 分岐に両機能を割り付ける**。
- **PLAN_FLAGS 取り扱い（制約 #8）**: トグルを「常時表示」化する前に、`PLAN_FLAGS` / `shouldShowCalendarViewToggle` / `DEFAULT_CALENDAR_VIEW_MODE` が**他に何を gating しているか**を必ず確認してから外す（雑に削除しない）。月グリッド本体接続(M3-b)の前提 flag も併せて確認。

## 4b. PlanClient.tsx 解決方針（SH × NT・LP 無関係）
- LP の PlanClient 変更（calendar タブ背景色 + subtitle 抑制＝cosmetic）は SH・NT 双方とクリーン。
- 実衝突は SH（month toggle gating）× NT（適応窓）→ 行 union マージ。
- decision-log.md は全ブランチの entry を union（時系列保持）。

---

## 5. 統合順序（低衝突 → 高衝突。手動解決を最後の 1 パスに集約）
```
base = main (9afdcaf9) から integration branch を新規作成
 ① FH (docs, 7file)        衝突ゼロ
 ② SB (Reality OS)         衝突ゼロ（※稼働中→停止確認後）
 ③ NT (Reality OS)         base/SB/FH/LP とクリーン
 ④ LP (着る物・私)         NT/SB/FH とクリーン（decision-log union のみ）
 ⑤ SH (シフト) 最後 ── SH の衝突を一括手動解決:
       CalendarTab.tsx = §4 の週間/月 union（両機能保持）
       PlanClient.tsx  = SH × NT 行 union
       decision-log.md = 全 union
 ⑥ 各段で tsc/test。 最後に full suite + CEO 実機 smoke。 ⑥ 完了まで main へ反映しない。
```

---

## 6. 単独 merge 案 vs 統合 branch 案（リスク比較）

| | 単独 merge（LP or SH を main 直）| 統合 branch（5 本 → integration → main）|
|---|---|---|
| CalendarTab 衝突 | 解消せず main 上に先送り。次ブランチ merge 時に moving target の main と衝突 | 安定 base 上で **1 回だけ** union 解決 |
| 最新状態の喪失リスク | 高（先送り・片側のみ main 化）| 低（両機能 union・元ブランチ無傷）|
| rollback | main を汚す | 元 5 ブランチ + safety tag 健全＝integration branch 破棄で即復帰 |
| 検証 | main が中間状態 | integration branch で full verify 後に main |
| 採否 | ❌ 禁止（CEO 方針）| ✅ 採用 |

---

## 7. 実行制約（CEO 指定 9 点・統合実行時に厳守）
1. safety tag 済（§1）
2. 本 plan を docs 保存（本書）
3. CEO 明示 GO 後に main 起点 integration branch で統合
4. source branch（LP/SH/NT/SB/FH）は編集しない
5. push / PR しない
6. rebase / reset / clean / stash / force push 禁止
7. CalendarTab は「週間/月」トグルで両機能を残す（union・片側選択禁止）
8. PLAN_FLAGS は雑に削らず、既存 gating を確認してから常時表示化
9. full verify + CEO smoke まで main 反映しない

---

## 8. 統合実行前の必須前提
- **serene-bardeen（SB）を安定点で停止**（監査中に HEAD 移動を検知）。停止後、SB の safety tag を最新 HEAD で更新してから ② に組み込む。
- 他 4 ブランチ（LP/SH/NT/FH）は不動を確認済。統合直前に再度全 HEAD を tag と突合する。

## 9. ドライバー推奨（CEO の問いへの回答）
- **本セッション（LP）が統合ドライバーを担うのが安全**。理由: ①全 5 ブランチの read-only 監査 + 衝突マップ + merge-tree 予測 + 本 plan を既に作成済（最深の統合コンテキスト保持）。②CalendarTab の union は LP(outfit) と SH(月グリッド) 両方の理解が必要で、両者を分析済。③単一ドライバー + 完全マップ = handoff 喪失リスク最小。④LP は安定 clean。
- **SH セッションの役割**: 月グリッド（月モード）の挙動 smoke 検証 + PlanClient(SH×NT) 解決の詳細確認 + 月モード配線の確認。
- 本 docs があるため、万一 SH 駆動に切り替える場合も完全 handoff 可能。

---

## Appendix — 検証コマンド（read-only・再現用）
- 衝突候補: `git diff --name-only main...<branch>` を 5 本分 union し、≥2 出現を抽出
- 衝突予測: `git merge-tree --write-tree --name-only <A> <B>`（exit≠0＝衝突）
- HEAD 突合: `git rev-parse --short <branch>` vs safety tag
