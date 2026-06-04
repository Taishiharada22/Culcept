# シフト取り込み 保存フェーズ Readiness（確認画面 → 反映 → DB）

> 目的: 在app確認画面で承認したセルを `/plan`（external_anchors + plan_day_indicators）へ
> **本保存**する。**これは readiness のみ**。実保存・migration apply・flag ON は **CEO 承認後**。
> 現時点では `PLAN_SHIFT_IMPORT_SAVE=false` を絶対維持。

## 0. 現状（保存バックエンドは構築済み・有効化のみ未了）

| 部品 | 状態 |
|---|---|
| 保存 action `importShiftRosterAction`（real deps 結線） | ✅ 実装済 |
| orchestrator `runShiftImportSave`（gate chain・pure・単体 test 済） | ✅ |
| `executeShiftImportSave` → RPC repo → `import_shift_roster` RPC | ✅ |
| RPC migration（conflict-safe range-scoped replace・1 tx atomic） | ✅ **file 存在**（適用は別） |
| source_type + day_indicators migration | ✅ **file 存在**（適用は別） |
| 確認画面 save CTA（saveEnabled / onConfirm contract） | ✅ ShiftReviewGrid に契約あり |

**未了（＝有効化に必要な gated 作業）**:
1. migration 2 本を **staging DB に apply**（DB write・CEO 別承認）。
2. `saveEnabled` を ShiftDraftInApp に **server→prop 配線**（現状ハードコード false）。
3. ShiftDraftInApp で `onConfirm → importShiftRosterAction` を **配線**（現状 dormant）。
4. `PLAN_SHIFT_IMPORT_SAVE=true`（staging save smoke のみ・CEO 承認）。
5. ★ **production-deny gate の追加**（下記 §5・安全ギャップ）。

## 1. saveEnabled をどの flag で開けるか

- 2 段 gate:
  - **server flag** `PLAN_SHIFT_IMPORT_SAVE`（`isShiftImportSaveEnabled()` = `PLAN_FLAGS.shiftImportSave`）。
    action 側 `runShiftImportSave` step 0 で `!isEnabled()` → `disabled`（repo 未呼出＝DB write なし）。
  - **UI prop** `saveEnabled`（ShiftReviewGrid/ShiftImportModal）。true で保存 CTA active、false で disabled placeholder。
- 在app live flow で開けるには: ① `PLAN_SHIFT_IMPORT_SAVE=true`（server）② ShiftDraftInApp の `saveEnabled` を
  server→prop で true 化（現状ハードコード false）③ `onConfirm` を action に配線。三者が揃って初めて保存可能。
- **入口 / live VLM / 保存 の 3 flag は引き続き分離**（混ぜない）。

## 2. `PLAN_SHIFT_IMPORT_SAVE=true` の適用範囲

- **server-side のみ**（NEXT_PUBLIC_ なし）。action（`isShiftImportSaveEnabled`）が評価。
- true でも: 未認証 / year-month 不正 / **未確定セル（unresolved）** / 手動印 conflict / 同日 anchor∩indicator(duplicate)
  は **repo 未呼出 or 無保存**で safe error。＝確認を通った clean なセルのみ保存。
- 適用は **staging save smoke の一時 ON のみ**。production 常時 ON は別 gate。

## 3. `import_shift_roster` RPC / action の実行条件

`runShiftImportSave` の gate chain（順に通過した時のみ RPC へ）:
```
0. PLAN_SHIFT_IMPORT_SAVE=true（OFF → disabled・DB 未接触）
1. 認証 user（server auth.getUser・client 入力不信）
2. year/month 妥当 → server 側で半開 importRange 算出（client range 不信）
3. projection（server 側）→ unresolved あれば blocked（repo 未呼出で差し戻し）
4. executeShiftImportSave → RPC import_shift_roster（atomic）
```
- userId は **server auth のみ**。raw error は UI に **絶対 forward しない**（safe 定数 message のみ・raw は server log）。

## 4. staging DB のみであること

- 接続先は `supabaseServer()`＝`.env.local` の `NEXT_PUBLIC_SUPABASE_URL`（現状 **staging ref hjcr…**）。
- save smoke 前に **必ず staging ref を確認**（値非表示・ref 一致のみ）。
- production ref（alja…）が接続先になっていないことを起動前チェックで確認。

## 5. ★ production deny / staging allowlist（安全ギャップ・要対応）

**重要な発見**: extraction action（`runExtractShiftDraft`）は **staging allowlist + production deny を明示 gate** で持つが、
**保存パス（importShiftRoster / runShiftImportSave / RPC repo）には明示的な production-deny gate が無い**
（接続先 supabase=env 依存のみ）。

→ **推奨（保存フェーズ sub-step S-save-0）**: 保存 action に **extraction と同等の production-deny + staging-allowlist gate** を追加する
（`supabaseUrl.includes(STAGING_REF) && !includes(PRODUCTION_REF)` を満たさなければ `disabled`/`error`）。
これにより env 誤設定でも production への保存を**コードレベルで遮断**。env 確認だけに依存しない多重防御。

暫定（gate 追加前の smoke）: 起動前に staging ref を厳格確認 + `PLAN_SHIFT_IMPORT_SAVE` を smoke 中のみ ON。

## 6. cleanup SQL（staging・再 smoke 用）

- RPC は **range-scoped replace**（同月再取り込みで shift_image 由来を自動置換）。＝再 smoke は「同月再保存」で上書きされる。
- 明示 cleanup（テスト行を消す）は staging で:
  ```sql
  -- 注: 正確な table/column は migration で要確認。shift_image 由来 × user_id × importRange[start,end) のみ。
  delete from external_anchors
   where user_id = '<staging-user-uuid>'
     and source_origin = 'shift_image'         -- ← migration の origin 値を確認
     and date >= '2025-06-01' and date < '2025-07-01';
  delete from plan_day_indicators
   where user_id = '<staging-user-uuid>'
     and source_origin = 'shift_image'
     and date >= '2025-06-01' and date < '2025-07-01';
  ```
- **手動印（manual）由来は消さない**（RPC も shift_image 由来のみ削除）。
- cleanup 実行は **staging のみ・CEO 承認**。

## 7. 同月再取り込み replace / supersede の確認方法

- RPC = 「conflict-safe **range-scoped replace**」: 1 tx で
  ① user_id 一致 × **shift_image 由来** × importRange[start,end) を DELETE
  ② 新 anchors/day_indicators を INSERT（範囲外 date は書込前に RAISE＝孤児化防止）。
- **確認手順**: 同じ 2025年6月を 2 回保存 → 2 回目で 1 回目の shift_image 行が置換され、**重複しない**（summary の deleted/inserted counts で確認）。
- 手動で入れた休み（manual indicator）は **置換対象外**で残ることを確認。

## 8. `/plan` month grid への反映確認

- 保存後、`/plan` カレンダー（月 grid・`calendarMonthGridEnabled` ON 時）+ FlowTab(today..+6) に
  保存した勤務（external_anchors）・休み（plan_day_indicators）が **原稿どおりの日付・曜日**で出ることを確認。
- 勤務=timed event anchor（コード表示）/ 休み・希望休=day indicator（バッジ）。**M3-c auto-open は使わない**
  （保存後の自動月遷移は禁止・手動で対象月へ）。

## 9. 失敗時 rollback / cleanup

- RPC 本体は **1 トランザクション**＝途中失敗で **全 rollback**（真の atomic・部分保存なし）。
- action は throw せず `ShiftImportActionResult`（disabled/unauthenticated/invalid/unresolved/conflict/duplicate/error）で表現。
- conflict/duplicate/unresolved は **無保存**で確認画面へ差し戻し（DB 不変）。
- raw error は server log のみ（UI safe message）。失敗後の DB は元のまま（追加 cleanup 不要）。

## 10. save 後も raw画像 / base64 / VLM raw response を残さない

- 保存されるのは **cells → projection → anchors（date/title/start/end/rigidity）+ day_indicators** のみ。
- **画像 / base64 / dataURL / VLM raw response は DB に保存しない**（save input は cells のみ・image は client ObjectURL で DB 非経由）。
- action の `logDetail` は raw を **server log のみ**（UI/DB 非載せ）。
- commit にも raw 成果物を含めない（既存方針継続）。

## 11. 保存フェーズ sub-steps（各 CEO gate・readiness のみで実装しない）

```
S-save-0: production-deny + staging-allowlist gate を保存 action に追加（§5・安全多重防御）
S-save-1: migration 2 本（source_type+day_indicators / RPC）を staging に apply（DB write・別承認）
          ＋ apply 状態確認（supabase migration list / RPC 存在）
S-save-2: saveEnabled を server→prop で ShiftDraftInApp に配線 + onConfirm → importShiftRosterAction 配線
          （PLAN_SHIFT_IMPORT_SAVE=false の間は dormant・既存挙動不変）
S-save-3: unit/render contract（disabled/unresolved/conflict/duplicate/ok の各分岐・saveEnabled OFF で dormant）
S-save-4: staging save smoke（PLAN_SHIFT_IMPORT_SAVE=true・実2025年6月→保存→/plan 反映→replace 確認→cleanup）
          CEO in the loop。smoke 後 flag OFF へ戻す。
```

## 12. まだ禁止（保存フェーズ着手前）

```
PLAN_SHIFT_IMPORT_SAVE=true（readiness 段階では設定しない）
DB write / migration apply / import_shift_roster RPC 実行
production
M3-c auto-open seam / 保存成功後の月grid自動遷移
push / PR / GitHub / deploy
raw画像 / base64 / VLM raw response の commit
```

## 13. CEO に仰ぐ判断

1. 保存フェーズに進むか（次は **S-save-0: production-deny gate 追加**を推奨＝実保存前の安全多重防御）。
2. migration apply（S-save-1）は staging DB write のため **個別承認**が要る。
3. それとも先に hover per-cell highlight（geometry）等、保存前の別 UI を入れるか。
