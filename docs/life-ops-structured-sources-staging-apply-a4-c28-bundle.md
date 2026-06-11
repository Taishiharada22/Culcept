# Life Ops — A-4-c28 Staging Migration Apply Bundle（CEO 実行・SQL Editor・lifeops_structured_sources）

> 2026-06-11。**staging（hjcrvndumgiovyfdacwc）のみ**。c11 と同方式: CEO が Dashboard SQL Editor で単発実行
> （`db push` は未適用 draft（scoring_engine 等）巻き込みのため不採用・SQL Editor 実行ゆえ supabase_migrations history 未記録=既知）。
> Claude は CLI/psql を実行しない（役割分担 protocol）。**DB write smoke/UI/本線接続/production apply/push/PR/merge は禁止**。
> migration file 整合: working tree = c27 commit `074c5777`（diff 0・sha1 `edd1a07cf09529e6f45c3c365d5e790aaed9f296`）。

## 実行順
0. Dashboard 上部の project ref が **hjcrvndumgiovyfdacwc**（staging）であることを目視（production `aljavfujeqcwnqryjmhl` なら即中止）
1. PRE（1 statement）→ 結果貼り返し → **期待と不一致なら apply せず停止**
2. MIGRATION（c27 draft 全文・1 回だけ）→ "Success" 確認
3. POST-1〜6 → 結果貼り返し
4. 期待と不一致が出た場合のみ、Claude の判断確認の上で ROLLBACK

## Abort 条件
PRE で table_exists=true / 各 count≠0（既存物あり）／ref 不一致／MIGRATION でエラー → そこで停止し出力を返送（ROLLBACK は独断実行しない）。

## 期待値
- PRE: `table_exists=false, trigger_fn_count=0, policy_count=0, index_count=0`
- POST-1: 13 列（id/user_id/source_type/category_id/menu/due_at/last_completed_at/typical_interval_days/occurrence_key/confidence/status/created_at/updated_at）
- POST-2: **0 行**（forbidden column 不在）
- POST-3: rls_enabled=true・policy 4 行（owner_select/insert/update/delete）
- POST-4: CHECK 7 種以上（source_type/status/confidence/menu/interval/deadline_shape/cadence_shape）
- POST-5: trigger 1 行（trg_lifeops_structured_sources_updated_at）
- POST-6: row_count=0

## SQL 本体
PRE/POST/ROLLBACK はチャット提示と同一（本 doc は手順の正本・SQL はチャットにも全文掲示）。
MIGRATION = `supabase/migrations/20260611130000_create_lifeops_structured_sources.sql` 全文（c27 commit 版）。

## 結果フォーマット（CEO→返送）
```
PRE: table_exists=… / fn=… / policy=… / idx=…
MIGRATION: Success or エラー全文
POST-1: 列数=…（一覧 or screenshot 可）
POST-2: 0 行 or 検出列
POST-3: rls=… / policies=（4 行の policyname）
POST-4: CHECK 件数=…（conname 一覧）
POST-5: trigger=…
POST-6: row_count=…
```
