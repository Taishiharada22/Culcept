# local SQL apply smoke — results（durable travel session tables）

> CEO GO「local SQL apply smoke」の実施記録。**local のみ・staging/production 非接触・push なし・migration 未追加**。
> 対象 draft: `docs/sql-drafts/t11-plan-travel-sessions-draft.sql`（設計: `docs/t11-sql-rls-durable-travel-state-design.md`）。

## 環境・方法（honesty）
- ★ **プロジェクトの local Supabase（`supabase start`）は起動不可**: 本 sandbox の **Docker daemon が無応答**（`docker info`/`docker ps` がハング）。よって `supabase start` は Docker 待ちで停止 → kill。
- 代替（Docker-free・rule 準拠）: **Homebrew postgresql@16 の ephemeral throwaway cluster**で apply smoke を実施。
  - `initdb --locale=C`（macOS の `FATAL: postmaster became multithreaded` 回避に `LC_ALL=C`）→ unix-socket・`listen_addresses=''`（TCP 非公開）で起動。
  - **Supabase auth stub**（mirror）: `auth.users(id uuid pk)` + `auth.uid() = nullif(current_setting('request.jwt.claim.sub',true),'')::uuid` + role `authenticated`/`anon`（draft の FK `auth.users(id)` と RLS `auth.uid()` を解決するため）。
  - draft を `psql -f` で apply → CHECK/RLS smoke → **cluster は trap で teardown（throwaway・永続/​reset なし）**。
- **未実施（別 GO）**: `supabase db reset`（破壊的・State Safety 禁止）/ staging・production apply / `supabase gen types` / `supabase/migrations/` への migration 追加。

## 結果（全 PASS）
| 検査 | 結果 |
|---|---|
| draft apply | ✅ **applied cleanly**（エラーなし） |
| RLS 有効 | ✅ `plan_travel_sessions` / `_inputs` / `_links` 全て `rowsecurity=true`・**policies=12**（3 table × CRUD 4） |
| CHECK: links `source='generated_maps_search'` | ✅ **rejected**（check constraint）＝generated は永続不可（recompute-only） |
| CHECK: links `generated=true` | ✅ **rejected**（check constraint）＝MVP 永続 row は非生成 |
| CHECK: links `inert=false` | ✅ **rejected**（check constraint）＝link は inert 固定 |
| CHECK: inputs `slot_key='red_line'` | ✅ **rejected**（check constraint）＝red_line は HOLD（private 別 table） |
| 正常 insert: links `manual_maps` / `manual_official` | ✅ 成功・stored `generated=false, inert=true` |
| 正常 insert: inputs `destination_area` / `budget_band` | ✅ 成功 |
| RLS owner-only: A が own session insert | ✅ |
| RLS owner-only: A は own のみ見える | ✅ A=2 件（自分所有） |
| RLS owner-only: **B は A の sessions を 0 件** | ✅ **0**（非 owner は読めない） |
| RLS owner-only: **B は A の inputs を 0 件** | ✅ **0**（owning session 経由 RLS） |
| RLS WITH CHECK: B が `owner_user_id=A` で insert | ✅ **rejected**（new row violates row-level security） |

## 結論
- **additive な DDL は clean に apply でき、CHECK 制約（generated_maps_search 排除・generated=false・inert=true・red_line HOLD）と owner-only RLS（auth.uid()=owner_user_id・owning session 経由・WITH CHECK）が設計どおり機能**することを実 Postgres 上で確認。
- 生成 link は永続不可・inert 固定・非 owner は read/write 不能、が DB レベルで強制される。

## caveats / open questions
1. **本 smoke は ephemeral throwaway cluster + 最小 auth stub**。**プロジェクトの local Supabase（実 `auth` schema・全既存 migration・GoTrue 連携）での apply smoke は、Docker が応答する環境で再実施が必要**（staging apply GO の前提）。
2. **generated types 未生成**（`supabase gen types`）。実 local apply 後に review（gate matrix §3）。
3. `updated_at` の auto-update trigger なし（writer/app 責務）— 既知 open（SQL draft 報告で受容済）。
4. value jsonb の内部 shape は DB 非強制（app/types/harness が honesty 強制）— 既知 open。
5. private red_line は `_private_inputs`（owner-only）別 GO。
6. migration は **`supabase/migrations/` に未追加**（draft は review-only のまま）。staging apply 時に migration 化 + CEO GO。

## 次の推奨（CEO 判断）
- Docker 応答環境で **プロジェクト local Supabase に対する apply smoke 再実施**（実 auth schema・RLS smoke）→ generated types review。
- その後 **staging apply（CEO migration GO）**→ real DB repository 実装（pure contract `TravelSessionRepositoryContract` を Supabase で具体化）→ server action persistence 配線（別 GO）。
- production deny 解除は最終 gate（`docs/t11-production-deny-release-preconditions-gate-matrix.md` の hard blocker 充足後）。
