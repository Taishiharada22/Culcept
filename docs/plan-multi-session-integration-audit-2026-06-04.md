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

---

# Revision 2（2026-06-04・全セッション回答 + GPT レビュー反映）

各セッション（SH/NT/SB/FH）の回答受領 + GPT レビューを受け、 **実 git で再検証**した上で統合 plan を補正。 **統合実行は引き続き HOLD**（docs 補正 + final tip 再確認まで GO・merge 実行は CEO 最終 GO 待ち）。

## R2-1. ★ MapTab.tsx の事実訂正（GPT/FH の「FH×NT 衝突」は merge 機構上は誤り）
**git 検証結果（現 HEAD）:**
- `MapTab.tsx` を main 比で変更しているのは **FH のみ**（+1462/-30）。**NT は MapTab を一切変更していない**（LP/SH/SB も）。
- **`git merge-tree FH × NT` = ✅ 完全クリーン（衝突ゼロ）**。
- 5 本の overlap マトリクスに **MapTab は出現しない**（= 2 ブランチ同時変更ではない）。

→ FH の「1492 行乖離」は **FH の MapTab vs main**（main からの書換量）であり、**FH×NT の merge 衝突ではない**。**git merge は clean**。GPT が増幅した「MapTab で事故る/計画作り直し」の **merge 機構リスクは存在しない**。

**ただしアーキ判断は別軸で有効:** FH の 1462 行 MapTab は `lib/plan/transport`（/plan 正本層）をバイパスする大規模書換で、FH 自身が「§11.4 の CEO アーキ判断（表示哲学/正本置き場/MapTab アーキ）後に再適用」を推奨。 = **git 衝突ではなく「この実装を main に載せるかの製品判断」**。

**→ FH の確定扱い:**
- **FH docs 6 本**（`plan-map-handoff.md` / `plan-map-research-findings.md` / `plan-map-second-self-strategy.md` / `alter-plan-time-layers-mobility-design.md` / research raw json ×2）= 他と別ファイル・**衝突ゼロ → 統合に含める**。
- **FH `MapTab.tsx` code = 今は統合しない（HOLD）**。§11.4 の CEO アーキ決定後に、選定アーキ上へ UI/UX 資産（ガラス線/Lucide/MobilityLegCard/S1-A 永続化/所要時間比較）を再適用。safety tag `safety/preinteg-20260604b/frosty-hellman-b3305e → b69aa809` で保全。

## R2-2. ★ R5「喪失ゼロ証明」の訂正（FH HOLD と整合）
- **SH / NT / SB / LP**: `git rev-list <branch> ^integration` が **空**（= 全 commit 到達）を成功条件にする。
- **FH**: MapTab code を HOLD するため `rev-list FH ^integration` は**空にならないのが正**。 FH の成功条件は **「docs 6 本が integration に到達」+「MapTab code が safety tag `…b/frosty-hellman` で保全」**。 ＝「喪失ゼロ証明」と「FH HOLD」を両立。

## R2-3. ★ dirty 状態の正直な訂正
- 「5 worktree 全て clean」は**不正確**（私の cross-worktree `git -C` 読みはサンドボックスで空返し＝信頼不可。 各セッション自己申告を採用）。
- 正確: **統合対象の git-tracked ソースは各セッション clean**。 ただし:
  - **SH**: 統合対象外の dev-preview 2 file（`dev-month-grid/page.tsx` / `DevMonthGridClient.tsx`）未コミット。 統合に含めない。 safety tag では保全されない（不要なら放置・必要なら SH が退避）。
  - **NT**: `supabase/.temp/cli-latest`（scope-out・**絶対 add しない**）。
- → integration には**各セッションの tracked HEAD のみ**を使う。 上記 dirty は持ち込まない。

## R2-4. final tips（全セッション freeze 確認済）+ green
| | final tip | freeze | green（自己申告 / R1 で再検証）|
|---|---|---|---|
| SH | `a1024625` | ✅ 停止（以降 read-only）| tsc baseline +0 / 新規 60+ test PASS / full suite 未実行 |
| NT | `aeb5332c` | ✅ hold | tsc 1112 / vitest 15900 PASS |
| SB | `34cf967d` | ✅ 停止 | tsc 0 / vitest 15933 PASS |
| FH | `b69aa809` | ✅ 停止（docs-only 以降）| MapTab tsc0/eslint0 / full suite 未実行 |
| LP | `2b0637fb` | （ドライバー）| baseline 1116 維持 |
- safety tag: 初版 `…20260604/*` + 移動分 refresh `…20260604b/*`（FH=b69aa809・LP=2b0637fb）。 **統合直前に全 final tip を tag と再突合**。

## R2-5. CalendarTab union 確定仕様（SH invariant 反映）
- **週間モード = 既存週ビュー + LP outfit dashboard + 既存 day timeline**（3 要素保持）/ **月モード = SH MonthGridView**。 union のみ・片側選択禁止。
- **🔑 stack fix（freeze 根治）**: LP の `selectedDateObj = useMemo(...)` を**必ず残し**、 そこに SH の `viewMode`/月グリッドを graft。 SH の `new Date()` 直書きを採ると freeze 再発 → 禁止。
- **🔑 SH の月モード必須 6 配線を全部残す**: ①8 import（_monthGrid/MonthGridView/CalendarViewBody/CalendarViewToggle/calendarViewMode/monthGridChip/shiftAnchorChip/DayIndicatorBadge）②`viewMode` state + `DEFAULT_CALENDAR_VIEW_MODE` ③`showViewToggle = shouldShowCalendarViewToggle(PLAN_FLAGS.calendarMonthGridEnabled)` + `<CalendarViewToggle>` ④`monthGrid = useMemo(buildMonthGrid(...))` ⑤`monthGridProps`（特に `getAnchorChip: resolveShiftAnchorChip` と `dayIndicatorByIso`）⑥**week strip を `<CalendarViewBody>` で wrap**（外すと月が永遠に出ない）。
- **PLAN_FLAGS**: `calendarMonthGridEnabled` gate は **雑に外さず維持（default OFF）**。 在 app 取込入口（SR Step6/M5）未実装のため、 外すと「月は見えるが取り込めない行き止まり」。 **smoke 時のみ env で ON**、 本番常時表示は取込入口完成後に CEO 判断。
- union 後、 **SH に CalendarTab diff を co-review 依頼**（シフト半分の取りこぼしゼロ確認）。

## R2-6. PlanClient union 確定仕様（3-way: LP cosmetic + SH dayIndicator + NT compose）
- merge-tree: 真衝突は **SH×NT**。 LP の変更（calendar タブ背景色 cosmetic）は両者とクリーン。
- **SH 側 6 配線を残す**: `PlanDayIndicator`/`dayIndicatorsByDate` import / fetch state `dayIndicators` / `dayIndicatorByIso = useMemo` / CalendarTab・FlowTab へ `dayIndicatorByIso` を渡す（落とすと休み/希望休が grid から消える）。
- **NT 側を残す**: `composeTimelineEnabled` prop 受け / `shouldUseComposeSheet()` gating / compose sheet mount / `handleAddSuccess`（**保存後 `load()` で refetch・楽観 append しない**＝保存契約）。
- → render return から **両 UI 面（calendar view 面 / compose sheet 面）が消えていないこと**を diff 確認。 union 後 **SH + NT 両方に diff review 依頼**。

## R2-7. その他の shared union（全て加算的）
- `featureFlags.ts`: SH 3 key（`shiftImportSave`/`vlmInputMode`/`calendarMonthGridEnabled`）+ NT 1 key（`composeTimelineEnabled`）= **全 key distinct → 加算 union**。
- `external-anchor-input.ts`: SH 取込経路 + NT compose 経路（`composeToAnchorInput`/`planComposeSave`）= **型フィールド union + 生成経路両保持**。 NT 保存契約（edits=PATCH のみ / news=POST 1 回）厳守。
- `vitest.config.ts`: SB の `server-only`→stub alias 1 行 = **union**（他が触れば両 alias 保持）。
- `decision-log.md`: 3-way **全 entry union**（時系列保持）。

## R2-8. 修正版 統合シーケンス
```
Phase 0: final tip 再確認 / safety tag 突合 / scope-out dirty 確認 / 本 docs（Rev2）
Phase 1（integration worktree on main 9afdcaf9・各 merge 後 tsc/test + checkpoint tag）:
   SB full → NT full → LP full → SH full(手動 union) → FH **docs-only**（MapTab code は HOLD）
Phase 2: CalendarTab union（R2-5・flag gate 維持・smoke 時のみ ON）
Phase 3: PlanClient union（R2-6）
Phase 4: featureFlags / external-anchor-input / vitest.config / decision-log union（R2-7）
Phase 5: full verify（tsc/test/eslint/build/dev smoke）+ SH diff review + NT diff review + FH docs 確認 + CEO smoke
         + R5 喪失ゼロ証明（R2-2・FH は docs 到達 + MapTab tag 保全）
Phase 6: main 反映は CEO 最終 GO 後のみ
```

## R2-9. まだ GO してはいけないこと（再掲）
5 本丸ごと merge / FH MapTab code merge / main 反映 / PLAN_FLAGS gate 削除 / CalendarTab・PlanClient 片側採用 / R5 で FH も全 commit 到達と主張。

## R2-10. 次に GO してよいこと（本 Rev で実施済 + 残）
- 実施済: 本 docs Rev2 補正 / 全セッション回答の反映 / MapTab git 再検証 / final tip 確認。
- 残（実行 GO 後）: integration worktree 作成 → Phase 0-6。 + 各セッションへの diff review 依頼（CalendarTab→SH / PlanClient→SH+NT / docs→FH）。
