# R5 — staging apply（`stargazer_star_maps`）+ smoke（2026-06-24）

> `stargazer_star_maps` migration を **staging のみ**に apply し schema 成立を確認。production 非接続・apply ゼロ。worktree=local main `94999f338`。

## 1. 安全確認（apply 前）
- link 状態: int-battery=staging のみ。main/integration/harness=link なし。production link どこにも無し。
- main worktree（star_maps file を持つ・local 201 migration）を **staging `hjcrvndumgiovyfdacwc`** に link。**三度の ref 二重確認**（staging である / production `aljavfujeqcwnqryjmhl` でない）。
- **pending = `20260624120000_stargazer_star_maps_clean_prod.sql` の 1 本だけ**（staging 適用済み 200 / local main 201 / 差分 1）。CEO「pending 複数なら STOP」を満たす（1 本のみ）。
- snapshot = migration list（200 applied + 1 pending）。migration は additive 冪等（DROP TABLE で可逆）。

## 2. apply 結果（staging のみ・`supabase db push`）
✅ **`Finished supabase db push`**（star_maps 1 本のみ適用）。
- **重要発見**: NOTICE が「`column "core_star/live_sky/axis_beliefs/core_traits/observation_depth/created_at/updated_at" already exists, skipping`」を示した＝**staging には既に `stargazer_star_maps` テーブル（同一列）が存在していた**（R2/R3 の audit で「staging 不在」と判定したのは、`inspect db table-stats` が**空テーブルを取りこぼした**ため＝drift で version 未記録だっただけ）。
- migration は冪等に動作: table/columns は skip（既存）、**version `20260624120000` を記録**、**owner-only policy 4 本を新規作成**（`policy does not exist, skipping`＝既存 policy 無し→DROP は no-op→CREATE が新規作成）。
- **検証的意義**: R4 の **code 由来の列推定（core_star/live_sky/axis_beliefs/core_traits/observation_depth/created_at/updated_at）が staging 実体と完全一致**したことの裏付け。

## 3. apply 後 read-only 確認
| 確認 | 結果 |
|---|---|
| migration 記録 | ✅ `20260624120000 \| 20260624120000`（Local+Remote 両列＝適用済み記録） |
| table 実在 | ✅ `public.stargazer_star_maps`（table-stats に出現・**0 rows**＝空・初回観測 upsert 待ち） |
| `user_id` UNIQUE | ✅ `stargazer_star_maps_user_id_key` 実在 |
| PRIMARY KEY | ✅ `stargazer_star_maps_pkey` 実在 |
| RLS + owner-only policy | ✅ ENABLE + insert/select/update/delete 4 policy を CREATE（db push エラーなし）。※policy 本文の psql 確認は Docker/password 要で未（CLI 不可・migration 成功で作成は確実） |
| index | ✅ PK + user_id unique の 2 本（追加 index 無し・production と同形） |

## 4. 42703 / 42P01 の不在（schema レベル確定）
- staging の star_maps は **全列実在**（core_traits/observation_depth/axis_beliefs も existing）→ `oracle.select("core_traits, observation_depth")` / `expansion-log.select("axis_beliefs, created_at")` 等が **42703（column does not exist）を出さない**。
- star_maps **table 実在** → `.from("stargazer_star_maps")` が **42P01（relation does not exist）を出さない**。
- → CEO の以前の staging smoke が「動いて見えた」のも、staging に star_maps が（drift で）在ったため。本 R5 で**正規 migration として記録**し、新 clean project でも再現可能になった（option ③ 対応）。

## 5. login/baseline/upsert smoke（authed 部分は CEO 環境）
- **schema レベル**: ✅ 成立（table/columns/unique/PK/RLS/policy 確認・0 rows・空起動 OK）。新規ユーザーの初回観測 upsert（onConflict:user_id）が成功する構造を満たす。
- **authed フロー実機**（login→baseline gate→初回観測保存→star_maps row 生成→home→/plan）: **Claude はログイン不可（認証情報入力 prohibited）**ゆえ未実施。**CEO が staging env（full `.env.local`）でブラウザログインして実機 smoke** を推奨（VIS-0A と同様）。schema は ready。

## 6. tsc / test
- R5 は **DB apply + docs のみ**でコード変更ゼロ（migration file は R4 で commit 済）。→ tsc 55 維持・test 不変（R4 から code delta なし）。

## 7. cleanup
- main worktree を **unlink**（staging link 残置せず・元の int-battery=staging のみ状態へ復帰）。production link どこにも無し。`.env.local`/`supabase/.temp` は commit 対象外。

## 8. 結論 / 次フェーズ
- **`stargazer_star_maps` は staging に正規 migration として記録され schema 成立**（PK/user_id unique/RLS/owner-only policy・0 rows・空起動 ready）。
- 「`stargazer_star_maps` 1本補完で clean production 成立」仮説は **schema レベルで確定**（authed 実機は CEO smoke 待ち）。
- **次（CEO GO 案件）**: (A) CEO が staging で authed smoke（login→baseline→観測→row→home/plan）。(B) clean production 実構築（staging 昇格 or 新 clean project へ migration 反映）= B-7 方針②・DB owner 同席。
- **production には apply していない**（staging のみ・db push against production ゼロ）。
