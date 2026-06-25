# HOME-SWIPE-PLAN-PARITY FIX（2026-06-25）

> Home 横スワイプの Plan pane を `/plan` route と同一表示にする。DB / production / migration 非接触・`/plan` 最新ロジック巻き戻しなし。
> worktree = local main `Culcept-main-reflect-20260604`（branch main・base `9a5c5e7ee`）。

## 1. 原因の最終確認
- `/plan` route（`app/(culcept)/plan/page.tsx`）は `PlanClient` に **alterTabEnabled / coalterPlanTabEnabled / LifeOps / Reality / shift / composeTimeline 等の表示制御 props** を渡していた → 5 タブ（カレンダー/リスト/マップ/バッテリー/CoAlter）+ LifeOps/Reality カードがフル表示。
- 一方 Home（`app/(culcept)/page.tsx`）の `HomeSwipeContainer` は pane を **`<PlanClient displayMode="pane" />`（props ゼロ）** で描画 → 全 prop が default（`alterTabEnabled=false` / `coalterPlanTabEnabled=false` 等）→ **3 タブ縮退**（バッテリー/CoAlter/LifeOps/Reality 非表示）。
- **production 差分・DB 欠落ではなく、Home 側の prop 未配線が単独原因**（CEO 判断と一致）。CalendarTab の中身（Travel 等）が pane でも一部出ていたのは、Calendar 表示が flag 非依存の既定タブだから。

## 2. 修正ファイル
| file | 変更 |
|---|---|
| `app/(culcept)/plan/planClientFeatureProps.ts` | **新規**。`buildPlanClientFeatureProps(supabase, userId, searchParams?)` = PlanClient の表示制御 props（displayMode 以外全て）の**単一真実源**。route の構築ロジックを verbatim 抽出。 |
| `app/(culcept)/plan/page.tsx` | helper 使用にリファクタ。LifeOps 計算 block + 明示 props 列挙を `buildPlanClientFeatureProps` 呼び出しに集約。`<PlanClient displayMode="route" {...featureProps} />`。**挙動不変**（同一ロジック）。 |
| `app/(culcept)/page.tsx` | `homeSwipeEnabled` block 内で `buildPlanClientFeatureProps(supabase, user.id)` を await し、`<PlanClient displayMode="pane" {...planFeatureProps} />` に展開。anon redirect + star_maps gate 通過済みの非匿名 user で呼ぶ。 |

## 3. route ⇄ pane props parity（同一 source of truth）
両者が `buildPlanClientFeatureProps` の戻り値を spread。差分は **`displayMode` のみ**（route="route" / pane="pane"）。
- 共有 props: `composeTimelineEnabled` / `lifeOpsCard` / `lifeOpsAction` / `lifeOpsActionResult` / `lifeOpsPendingDone` / `lifeOpsInputCategories` / `lifeOpsCadenceOptions` / `lifeOpsInputAction` / `lifeOpsInputResult` / `lifeOpsInputResultType` / `lifeOpsMoment` / `draftLiveEnabled` / `shiftDraftVlmInputMode` / `shiftImportSaveEnabled` / **`alterTabEnabled`** / `dayStateStorageEnabled` / **`coalterPlanTabEnabled`** / `viewerUserId` / `realityOsSurface`。
- → `visibleTabs`（PlanClient L306-313）が `alterTabEnabled ? TABS_WITH_ALTER : TABS` + coalter で決まるため、両経路で **5 タブ**に揃う。

### pane 固有の意図的差分（理由付き・退化ではない）
1. **`searchParams` を pane では未渡し**（`buildPlanClientFeatureProps(supabase, user.id)` の第3引数省略）。LifeOps の PRG feedback token（`lifeopsFb`/`lifeopsConfirm`/`lifeopsSrc`）は **`/plan` route の form 送信→redirect 専用**で、Home（`/`）には付かない。→ pane では **feedback toast のみ非表示**だが、**LifeOps card 本体は出る**（card は `computeLifeOpsMainlineModel` 由来で searchParams 非依存）。parity の主目的（カード/タブ表示）は満たす。
2. **LifeOps action（`submitLifeOpsMainlineFeedbackAction` 等）は `/plan` へ redirect する server action**。pane から送信すると `/plan` route へ遷移する（Home pane 内で完結しない）。これは action 側の既存仕様で、pane 表示の parity 目的には影響しない。完全な pane 内 PRG 化は別タスク（本 fix の scope 外）。
3. **`displayMode="pane"` の chrome 差**（header "Plan" / ALTER·PLAN eyebrow・ics/shift import entry の `!isPane` 非表示・subtitle 抑制）は PlanClient 既存の意図的 pane レイアウトで、タブ/カード可視性には無関係。

### 性能・安全
- `buildPlanClientFeatureProps` は **`homeSwipeEnabled` block 内でのみ await**＝OFF（本番既定）では計算ゼロ（従来 Home 挙動完全不変）。
- LifeOps 計算は `isLifeOpsMainlineAllowed`（staging 許可・production deny）gate 越え時のみ。pane でも同 gate。
- DB write / migration / production 接続なし（既存 server read 計算の移設のみ）。

## 4. `/plan` route 表示確認
- CEO が `/plan` 直 URL で **5 タブ（カレンダー/リスト/マップ/バッテリー/CoAlter）+ 最新 Plan 本体**を確認済み（本 fix 前）。本 fix は route を helper 経由に変えたのみで **props は同値**＝退化なし（tsc 55・plan test 6557 pass で裏付け）。

## 5. Home swipe pane 表示確認
- **コード上**: pane が route と同一 props を受け取り `visibleTabs` が 5 タブに揃う構造を確認。compile 健全（/ と /plan 正常応答・touched file tsc error 0）。
- **実機視覚（5 タブ/カード描画）**: `/` も `/plan` も auth 必須で **Claude はログイン不可**ゆえ未。**CEO が Home をハードリロード（Cmd+Shift+R）→ 横スワイプ**で pane に 5 タブが出ることを確認推奨。

## 6. Battery / CoAlter タブ確認（pane）
- `alterTabEnabled`（=`PLAN_ALTER_TAB_ENABLED`）/ `coalterPlanTabEnabled`（=`NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED`）を pane にも配線 → 両 flag ON（現 .env.local）で pane に **バッテリー + CoAlter タブ**が出る構造。実機確認は CEO（§5）。

## 7. LifeOps / Reality / Travel 等の表示確認
- LifeOps card / moment / 登録入口 = helper が route と同一 DTO を計算 → pane でも同等表示（gate 越え時）。
- Reality OS surface = `realityOsSurfaceProd` ON で同一 fixture VM → pane でも CoAlter タブ内に出る。
- Travel / Location Notes / Calendar/List/Map = タブ本体は flag 非依存 or 既存 props で不変 → 退化なし。

## 8. tsc / test
- **tsc = 55**（baseline 維持・touched file エラー 0・残 55 は既知 baseline の test-only）。
- **plan test = 397 files / 6557 tests passed・0 failed**（11 skip・退化ゼロ）。

## 9. 一時ファイル非 commit 確認
- `.env.local`（FULL-EXPERIENCE block）/ `.claude/launch.json`（cd 先変更）/ `node_modules` / `.next` は **commit 対象外**（gitignore + 本 commit は 3 ソースファイル + 本 docs のみ個別 add）。

## 10. 完了判定
- ✅ 原因確定（Home pane prop 未配線）・shared helper で route/pane parity 実装・tsc55・plan test green・compile 健全。
- 🔺 **実機 5 タブ視覚確認は CEO authed リロード待ち**（Claude ログイン不可）。
- production / DB / migration 非接触・`/plan` 最新ロジック巻き戻しなし・Home/Alter composer 巻き戻しなし。

---

## 11. 最終厳格監査（2026-06-25・CEO 依頼「/plan の logic/code が最新を保つか厳しく確認」）

### A. 私の parity 変更の adversarial 自己レビュー（regression ゼロ検証）
- `buildPlanClientFeatureProps` の **return キー = 19、`9a5c5e7ee` 時点の旧 `plan/page.tsx` が PlanClient に渡していた 19 props と完全一致（欠落 0・追加 0）**。`{...featureProps}` spread に余計な prop 漏れなし。`displayMode` のみ呼び出し側指定。→ **`/plan` route の挙動は退化していない**（tsc55・plan test 6557 pass で裏付け）。

### B. pane/route の isPane 分岐分類（PlanClient 全 6 箇所）
- 装飾（route/pane で差があってよい）: `containerClass`(L862 padding/bg)・eyebrow "ALTER·PLAN"(L902)・header title "Plan"↔"今日のプラン"(L908-920)・subtitle(L997)。
- **機能（parity すべき）**: ics 取り込み(L973)・シフト表 import(L986)。→ **CEO 報告の「取り込み・シフト表が pane に出ない」と完全一致**。

### C. /plan ロジック最新性・配線健全性
- tab files 最終更新 = **2026-06-24（`39df44a6b`）**＝昨日の最新（HOME-SURFACE-VERIFY と整合）。
- CoAlterTab は昨日の知性を**実 render**（L430 `<PlanIntelligenceLivePanel vm realityOsSurface>`・L432 `<PlanIntelligencePanel>`）＝import 死蔵でない。
- critical path（PlanClient/page.tsx/helper/CoAlterTab）に **throw/TODO/FIXME/stub/未実装 = 0**。
- shift entry は内部 flag `shiftImportEntryEnabled`（return null）で保護・`.env.local` で ON。

### D. 取り込み・シフト表が pane で出なかった**根本原因**（CEO 報告の解明）
- L973/L986 の `{!isPane && ...}` は **オーバーサイトでなく意図的な回避策**だった: ics の `IcsImportModal` と shift の `ShiftImportEntryInner` 配下 modal は **`registerHomeSwipeModalOpen`（HomeSwipe modal-lock）に未登録**（登録済みは AddAnchor/Edit/SourceList/AnchorDetail の 4 つだけ）。未登録 modal を pane で開くと横スワイプが disable されず、modal が pane と一緒に流れる UX バグになるため、trigger を pane で隠していた。

## 12. Phase 2 修正（取り込み・シフト表 parity・上記 D の正しい解法）
| file | 変更 |
|---|---|
| `app/(culcept)/plan/components/IcsImportModal.tsx` | `isOpen` 時に `registerHomeSwipeModalOpen()` を呼ぶ useEffect 追加（AddAnchorModal と同パターン）。 |
| `app/(culcept)/plan/components/ShiftImportEntryInner.tsx` | `open` 時に `registerHomeSwipeModalOpen()`。`open` は ShiftImportModal/ShiftDraftInApp 両経路を gate するので 1 箇所で両 modal を覆う。 |
| `app/(culcept)/plan/PlanClient.tsx` | ics 取り込み(旧 L973)/シフト表(旧 L986)の `!isPane` gate を除去 → **pane でも表示**。両 modal が lock 登録済になったので swipe 競合なし。header は flex-wrap ゆえ pane 幅でも折り返して収まる。 |
- shift は内部 `shiftImportEntryEnabled` flag で更に gate されるため、flag OFF（本番既定）では pane でも従来どおり null（UI 不変）。
- 検証: **tsc = 55**（touched file エラー 0）。**plan test = 397 files / 6557 passed / 0 failed（test-timeout=30s）**。`test-timeout` 既定 5s では `proposalPlanClientHelpers` の「PlanClient default export を `await import`」smoke が**並列負荷で timeout flake**（1↔2 件変動・単独実行は 2.1s で PASS・30s timeout で 0 failed）＝logic 退化でない（`home-swipe-modal-lock` は AddAnchorModal 経由で既に PlanClient のモジュールグラフ内→新規追加なし）。
- compile 健全（/・/plan 200・touched file コンパイルエラー 0）。実機 pane の取り込み/シフト表ボタン視覚確認は CEO authed リロード（Home swipe）待ち。

---
read-only DB（write/apply/migration/seed ゼロ）。production 非接続・origin/main push なし。
