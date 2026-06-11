# Life Ops — A-4-c36 Production Schema Apply Bundle（**docs-only 成果物・production execution は HOLD**）

> 2026-06-11。対象=**production（aljavfujeqcwnqryjmhl）**。c28 と同方式（Claude は bundle 整備のみ・production DB へ接続しない・
> service_role 不使用・sample insert なし・write smoke なし・UI enable なし・push/PR/merge なし）。
> APPLY SQL = c28 冪等化修正版（commit `b75583db`・sha1 `cea6169a50c60ee6e689379a2996e1851dc54f2f`・**production 向けの変更なし**）。
>
> ★**A-4-c37 訂正（CEO gate）**: 本 bundle は「**production apply bundle 準備済み。ただし production execution は CEO gate 未承認のため HOLD**」。
> 「CEO production schema apply GO を出せる状態」は強すぎる表現として撤回。PRE/APPLY/POST 全て CEO 承認まで未実行
> （§8 の PRE-1 は CEO が手動実行した read-only 1 クエリ＝finding 取得のみ・apply には進まない）。

## 実行順（CEO）
0. Dashboard の project ref が **aljavfujeqcwnqryjmhl（production）** であることを目視（staging hjcr… なら即中止）
1. **PRE-1〜4 のみ実行** → 結果貼付 → **CEO 判断（abort 条件 §4 を確認）**
2. 判断 OK なら **APPLY**（1 回）→ Success 確認
3. **POST-1〜7** → 結果貼付
4. **ROLLBACK は実行しない**（§5 の条件を満たす schema 事故時のみ・別判断）

## §1 PRE（preflight）

```sql
-- PRE-1: lifeops_structured_sources の不在 + 同名 object 残骸なし（期待: false, 0, 0, 0）
SELECT
  (SELECT to_regclass('public.lifeops_structured_sources') IS NOT NULL) AS table_exists,
  (SELECT count(*) FROM pg_proc WHERE proname='lifeops_structured_sources_set_updated_at') AS trigger_fn_count,
  (SELECT count(*) FROM pg_policies WHERE tablename='lifeops_structured_sources') AS policy_count,
  (SELECT count(*) FROM pg_indexes WHERE indexname='idx_lifeops_structured_sources_owner') AS index_count;
```
```sql
-- PRE-2: prm_learning_events の存在（feedback write 前提の棚卸し・どちらの結果も「報告」として valid）
SELECT to_regclass('public.prm_learning_events') IS NOT NULL AS prm_exists;
```
```sql
-- PRE-3: PRE-2 が true の場合のみ実行。prm の CHECK 状態（lifeops/done/completion を許容するか）
SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
WHERE conrelid='public.prm_learning_events'::regclass AND contype='c'
  AND conname IN ('prm_learning_events_source_kind_check','prm_learning_events_action_check','prm_learning_events_signal_check')
ORDER BY conname;
```
```sql
-- PRE-4: PRE-2 が true の場合のみ実行。prm row count（参考・production 実データの規模感）
SELECT count(*) AS prm_row_count FROM prm_learning_events;
```

## §2 APPLY
`supabase/migrations/20260611130000_create_lifeops_structured_sources.sql` 全文（c28 冪等化版・チャット掲示と同一）。
schema 作成のみ・data write なし。

## §3 POST（postflight）
POST-1: 列一覧（c28 と同じ・期待 13 列）／POST-2: forbidden columns（期待 0 行）／POST-3: RLS（true）+ 4 policies／
POST-4: CHECK 7 種／POST-5: trigger 1／POST-6: `SELECT count(*) FROM lifeops_structured_sources;`（期待 0）／
**POST-7: PRE-3 を再実行し prm prerequisite 状態を最終報告に含める**（SQL は c28 bundle / チャット掲示と同一）。

## §4 Abort 条件（PRE 後に 1 つでも該当 → APPLY せず停止・結果返送）
ref が production でない／staging だった／PRE-1 で table_exists=true や count≠0（**予期せぬ既存**→列一覧を取得して draft と突合・不一致なら停止）／
forbidden column 検出／RLS・policy 不整合／**prm prerequisite が不明のまま判断を要する場合**（PRE-2/3 の結果が読めない等）／
SQL bundle が c28 版と不一致（本 doc の sha と照合）。

## §5 ROLLBACK（**最後の手段**・通常は flag OFF/allowlist 除去で対応）
実行条件: schema 事故（apply 不整合）のみ。**`SELECT count(*) FROM lifeops_structured_sources;` が 0 でない場合は実行禁止**（実データ喪失）。
```sql
DROP TRIGGER IF EXISTS trg_lifeops_structured_sources_updated_at ON lifeops_structured_sources;
DROP FUNCTION IF EXISTS lifeops_structured_sources_set_updated_at();
DROP INDEX IF EXISTS idx_lifeops_structured_sources_owner;
DROP TABLE IF EXISTS lifeops_structured_sources;
```

## §6 prm prerequisite の判定（PRE-3/POST-7 の読み方）
- `source_kind_check` に `'lifeops'`／`action_check` に `'done'`／`signal_check` に `'completion'` が**含まれる**→ E 段（feedback write）の
  schema 前提は充足（staging c11 相当が適用済み）。
- 含まれない／prm_exists=false → **E 段の前に別 bundle**（M1 create + c11 CHECK 拡張）が必要＝P4 前の slice として起票。
  本 apply（lifeops_structured_sources）の可否には影響しない（P1-P3 は prm 不要）。

## §7 返送フォーマット
```
PRE-1: table_exists=… / fn=… / policy=… / idx=…
PRE-2: prm_exists=…
PRE-3: （3 CHECK の def そのまま or PRE-2=false でスキップ）
PRE-4: prm_row_count=…（or スキップ）
APPLY: Success（or エラー全文）
POST-1〜6: 列数=… / forbidden=0行 / rls=…+4policies / CHECK=…件 / trigger=… / row_count=…
POST-7: （PRE-3 と同形）
```

---

## §8 ★A-4-c36 PRE 実行 finding（2026-06-11・CEO 実行）— APPLY 中止
PRE-1 結果: **table_exists=true / trigger_fn=1 / policy=4 / index=1**。
→ `lifeops_structured_sources` は **production に既に存在**（数は c28 migration 出力と完全一致＝過去の `db push --linked` 等で適用済みの可能性大）。
→ bundle abort 条件「table_exists=true は予期せぬ既存→列突合・不一致なら停止」に該当 → **APPLY 実行せず停止**。
→ 次手: 既存 table の audit（§9・列 13/forbidden/CHECK/RLS/policy/**row_count**/prm prerequisite）で draft 完全一致を確認。
   一致 ∧ row_count=0 → P1 は既に充足（apply 不要）。不一致 or row_count>0 → 深掘り（後者は実データ稼働中＝rollback 禁止）。

## §9 既存 table audit（CEO 実行・apply の代わり・read-only）
APPLY を実行せず、以下を実行して結果貼付（POST-1〜6 と同形だが「既存物の検証」として）:
（A 列一覧 / B forbidden 0 行 / C RLS+4policy / D CHECK 7 種 / E trigger 1 / F **row_count** / G prm PRE-2〜4）
