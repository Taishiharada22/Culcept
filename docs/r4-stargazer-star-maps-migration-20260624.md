# R4 — `stargazer_star_maps` schema extraction + idempotent migration draft（2026-06-24）

> 目的: clean production に足す唯一の gap schema `stargazer_star_maps` を正確に migration 化（draft）。production rows は移さない・apply しない。
> production read-only（link→index 抽出→即 unlink）+ 現コード由来の列導出。worktree=local main `8019e41f8`。

## 1. production read-only schema 抽出結果
- production(`aljavfujeqcwnqryjmhl`)に read-only link→`inspect db index-stats`→**即 unlink**（write/apply ゼロ・link 残置なし）。
- **抽出できたもの（Docker 不要・access token）**: index = **`stargazer_star_maps_pkey`（PK）+ `stargazer_star_maps_user_id_key`（user_id UNIQUE・scans 6516=onConflict 主経路）の 2 本のみ**（追加 index 無し）。
- **抽出できなかったもの（要 Docker `db dump` or psql＝本環境で不可）**: columns 型 / policies 本文 / FK / defaults / triggers。
  → これらは **現コード由来で導出**（CEO step 6「現コードが必要とする列だけで足りるか」を採用）。production exact-match が必要な場合は CEO 環境（Supabase Studio production SQL）で `information_schema.columns` / `pg_policies` を cross-check（B-7 rehabilitation 用・clean production には不要）。

## 2. `stargazer_star_maps` の必要列（現コード由来）
| 列 | 型 | 出自 | 必須理由 |
|---|---|---|---|
| `id` | uuid PK | requireBaseline.ts:30 `.select("id")` / profile | PK・select 対象 |
| `user_id` | uuid NOT NULL **UNIQUE** | 全 upsert の `onConflict:"user_id"` + 全 read の `.eq("user_id")` | **upsert に必須**・FK 親 |
| `core_star` | jsonb | observations upsert payload `{confidenceScore, coreTraits, resolvedType?}` | 書込 |
| `live_sky` | jsonb | observations upsert payload `{dimensions}` | 書込 |
| `axis_beliefs` | jsonb | expansion-log:45 `.select("axis_beliefs, created_at")` | read（vestigial・実体は stargazer_profiles 側・null 可だが列必須） |
| `core_traits` | jsonb | oracle:57 `.select("core_traits, observation_depth")` | read（vestigial・現コード未書込・null 可だが列必須＝42703 回避） |
| `observation_depth` | integer | oracle:57 / psyche-signature:84 | read（vestigial・現コード未書込・null 可だが列必須） |
| `created_at` | timestamptz default now() | expansion-log:45 | 構造 |
| `updated_at` | timestamptz default now() | 全 upsert payload | 書込 |

> profile/route.ts:159 は `.select("*")`＝上記全列で満たされる。

## 3. 現コード upsert payload との対応
- 3 つの upsert（observations:345 / :547 = `{user_id, core_star, live_sky, updated_at}` / :441 CF merge = `{user_id, live_sky, updated_at}`）全て `onConflict:"user_id"`。
- → **書込列 = user_id/core_star/live_sky/updated_at**。`axis_beliefs` は `profilePayload`（stargazer_profiles 用）で書かれ star_maps には書かれない（expansion-log の star_maps.axis_beliefs read は legacy・null）。
- **`core_traits`/`observation_depth` は現コードに writer ゼロ**（read のみ）。production legacy に実値があった列だが、clean production では null（select は通る・consumer は null 耐性）。

## 4. 必要最小 schema の判断（CEO step 6）
- **production の全 legacy 列を盲目復活させない**（CEO 方針: fashion/legacy archive・code-needed で足りる）。
- **現コードが read/write する 9 列のみ**を定義。vestigial 3 列（axis_beliefs/core_traits/observation_depth）は「select が 42703 で落ちない」ために列として必須だが null 許容（writer 無し）。
- 将来互換: 兄弟 stargazer_* と同じ id PK + user_id unique + FK CASCADE + owner-only RLS で、後から列追加（ADD COLUMN IF NOT EXISTS）が容易。

## 5. RLS / policy 方針
- 兄弟 `stargazer_core_star` と同形: **RLS enable + owner-only**（`auth.uid() = user_id`）の insert/select/update/delete 4 policy。
- FK `user_id → auth.users(id) ON DELETE CASCADE`（account 削除で孤児化させない・privacy）。

## 6. 作成した migration file
`supabase/migrations/20260624120000_stargazer_star_maps_clean_prod.sql`（**draft・未 apply**）。
- 冪等: `create table if not exists` + `add column if not exists` ×7 + DO-block 制約 guard（pkey/user_id_key/fkey）+ `enable row level security` + `drop policy if exists`→`create policy` ×4。
- drift 環境でも安全（既存 table なら列補完のみ・既存 policy は drop→再作成）。
- 適用先 = local main / staging（昇格前）。**production apply は B-7 + 別 CEO GO**。

## 7. 検証 / 留保
- 本 migration は **未 apply**（staging/production への push なし）。
- tsc/test は SQL-only 変更ゆえ不変（baseline 55 維持）。
- 留保: vestigial 3 列の production exact 型（特に `observation_depth` int vs numeric）は推定。clean production では null 運用で問題なし。production exact-match が要る場合は CEO Studio で cross-check（B-7 用）。

## 8. 次フェーズ（CEO GO 案件）
- staging へ本 migration を apply して smoke（login/baseline/observation upsert→star_maps row 生成→home 到達・profile/oracle/expansion-log/compatibility の select が 42703 なく動作）を検証。
- その後 staging 昇格 or 新 clean project へ反映（B-7 rehabilitation 方針②）。
- 本書時点では **apply しない**。
