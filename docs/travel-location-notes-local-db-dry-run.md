# Travel / Location Notes — Local DB Dry-Run 結果（Phase D）

**作成日**: 2026-06-22
**ステータス**: ✅ local dry-run **成功** / staging・production apply **未実施**
**性質**: 検証記録（docs-only）。remote 非接触。

---

## 0. サマリ

Phase C / C-1 で設計した Travel / Location Notes の Supabase schema（migration 3 本）を
**ローカル Supabase（`supabase db reset`）に clean apply** し、owner-only RLS と
location_notes の公開 select policy を **RLS test 7/7 PASS** で検証した。

- migration apply: **3/3 clean**（エラーなし・NOTICE は冪等 `DROP ... IF EXISTS` ガードのみ）
- テーブル: **10 個すべて作成 + RLS enabled**
- RLS test: **7/7 PASS** → `ALL RLS TESTS PASSED`
- remote（staging / production）: **一切接触なし**

---

## 1. branch / HEAD

| 項目 | 値 |
|------|-----|
| branch | `claude/travel-connect-finish-20260621` |
| HEAD | `bc76abd7cd6d4f23f71fdd5f6cfa2df6267af970` |
| HEAD (short) | `bc76abd7c` |
| commit subject | `feat(travel): Phase D — Travel/Location Notes Supabase schema 実装（local dry-run済・RLS test 7/7 PASS・remote 未apply）` |

---

## 2. migration files

| ファイル | ドメイン | 主テーブル |
|----------|----------|-----------|
| `supabase/migrations/20260621100000_create_travel_core.sql` | D-1 Travel Core | travel_trips / travel_days / travel_photos / travel_reservations / travel_itinerary_items |
| `supabase/migrations/20260621100100_create_travel_movement_memories.sql` | D-2 Movement + Memories | travel_movement_legs / travel_memories |
| `supabase/migrations/20260621100200_create_location_notes.sql` | D-3 Location Notes | location_notes / location_note_saves / location_note_to_itinerary |

共通規約:
- 全テーブル `id uuid pk default gen_random_uuid()` / `user_id → auth.users(id) ON DELETE CASCADE` / `created_at`。
- soft delete テーブルは `updated_at`（`travel_set_updated_at()` trigger）+ `deleted_at`。
- hard delete テーブル（travel_movement_legs / saves / to_itinerary）は trigger・soft delete 列なし。
- 多態参照（hero_photo_id / photo_id / reservation_id / source_location_note_id）は `ON DELETE SET NULL`。
- 前方参照は migration 内 / migration 跨ぎで `ALTER TABLE ... ADD CONSTRAINT` により後付け。

---

## 3. local db reset 結果

実行:
```
supabase start            # local stack 起動（127.0.0.1、port 54321/54322 等）
supabase db reset         # 全 migration を空 DB に順次 apply（local のみ）
```

結果:
- `Applying migration 20260621100000_create_travel_core.sql ...` → OK
- `Applying migration 20260621100100_create_travel_movement_memories.sql ...` → OK
- `Applying migration 20260621100200_create_location_notes.sql ...` → OK
- 出力された NOTICE はすべて `policy/constraint/trigger ... does not exist, skipping`
  = 冪等化のための `DROP ... IF EXISTS`（空 DB なので skip）。**エラーではない**。
- `WARN: no files matched pattern: supabase/seed.sql` = seed 未使用（想定どおり）。
- 末尾の `Error status 502`（Restarting containers）は **reset 後のコンテナ health-check 一過性**。
  migration apply 自体は完了済み（後続の schema 検証・RLS test がすべて成功していることで裏付け）。

> 注: 起動時に旧 project（`aneurasync-x-ops`）の停止漏れコンテナが port 54322 を占有していたため、
> `supabase stop --project-id aneurasync-x-ops --no-backup` で停止 → `supabase start` し直して解消。

---

## 4. 10 tables + RLS enabled 確認

`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'travel_%' OR relname LIKE 'location_note%'`：

| table | RLS (relrowsecurity) |
|-------|----------------------|
| travel_trips | ✅ t |
| travel_days | ✅ t |
| travel_photos | ✅ t |
| travel_reservations | ✅ t |
| travel_itinerary_items | ✅ t |
| travel_movement_legs | ✅ t |
| travel_memories | ✅ t |
| location_notes | ✅ t |
| location_note_saves | ✅ t |
| location_note_to_itinerary | ✅ t |

**10/10 テーブル作成 + RLS 有効**。

---

## 5. RLS test 7/7 PASS

テストスクリプト: `supabase/tests/travel_location_notes_rls_test.sql`
実行: `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f ...`（local 54322 のみ）

方式: `auth.users` に test userA / userB を seed → 各テストブロック内で
`set_config('role','authenticated',true)` + `set_config('request.jwt.claims', {sub:...}, true)`
で各ユーザーになりすまし、RLS 配下の挙動を assert（失敗で `RAISE EXCEPTION`）。
末尾で test ユーザーを削除（cascade で全 test 行も消去・冪等）。

| # | テスト | 期待 | 結果 |
|---|--------|------|------|
| 1 | owner（userA）が authenticated role で自分の trip/day/item を insert+select | 自分の行が見える | ✅ PASS |
| 2 | userB が userA の private travel データ（trips / itinerary_items）を読む | 0 件（cross-user 遮断） | ✅ PASS |
| 3 | userB が userA の private/draft location_notes を読む | 0 件 | ✅ PASS |
| 4 | userB が userA の各種 status の note を読む | published+approved+未削除 の **1 件のみ** 可視 | ✅ PASS |
| 5 | self_memo を published で insert | check 制約で拒否（`check_violation`） | ✅ PASS |
| 6 | 同一 (user, note) を二重に save | unique 制約で拒否（`unique_violation`） | ✅ PASS |
| 7 | userB が userA の published note を update / delete | 0 行に作用（owner-only write） | ✅ PASS |

最終出力: **`ALL RLS TESTS PASSED`**

### 5.1 self_memo published 不可（TEST5）
`location_notes` の check 制約
`CHECK (source_type <> 'self_memo' OR status IN ('draft','private'))`
により、`source_type='self_memo'` かつ `status='published'` の insert は `check_violation` で拒否される。
→ 自分メモが誤って公開経路に乗ることを **DB レベルで防止**。

### 5.2 published+approved+not-deleted のみ cross-user visible（TEST4）
`location_notes` の select policy
`USING (auth.uid() = user_id OR (status='published' AND moderation_status='approved' AND deleted_at IS NULL))`
を検証。userA が作った
- published+approved（可視）
- published+pending（不可視）
- published+approved だが soft-deleted（不可視）
- reported（不可視）
の 4 種に対し、userB から見えるのは **published+approved+未削除 の 1 件のみ**であることを確認。
→ これが本ドメインで**唯一の cross-user 読取経路**。書込（insert/update/delete）は全テーブル owner-only。

> ★ 運用前提: published は Phase G（共有解禁）まで実運用しない＝当面 **実質 private のみ**。
> 本 migration は policy を「書く」だけで、公開 feed UI / moderation / report は Phase G で別途。

---

## 6. remote 不触確認

- `supabase/.temp/project-ref`: **absent 維持**（CLI は remote project に link していない）。
- 実行コマンドは `supabase start` / `supabase stop` / `supabase db reset` / `psql`（接続先 `127.0.0.1:54322`）のみ。
- **`supabase db push` は未実行**。staging / production への接続・apply は一切なし。
- 認証鍵・URL はすべて local stack（`127.0.0.1`）のもの。

---

## 7. `.temp` / `.branches` / env 未stage確認

- commit `bc76abd7c` の stage 対象は **4 ファイルのみ**:
  - `supabase/migrations/20260621100000_create_travel_core.sql`
  - `supabase/migrations/20260621100100_create_travel_movement_memories.sql`
  - `supabase/migrations/20260621100200_create_location_notes.sql`
  - `supabase/tests/travel_location_notes_rls_test.sql`
- `supabase/.temp/*`（cli-latest / *-version 等）の local churn は **stage せず除外**。
- `supabase/.branches/_current_branch`（local 生成物）も **stage せず除外**。
- `.env` 等の環境ファイル変更なし・未 stage。
- `git add` はファイル個別指定（State Safety Rule 準拠）。

---

## 8. staging / production apply 未実施

- 本 Phase D は **local dry-run のみ**。
- staging / production への apply は **別 GO**（CEO 明示承認案件）。前提ゲート:
  1. CEO 明示承認
  2. CLI を staging（`hjcrvndumgiovyfdacwc`）へ re-link（現状 unlinked）→ **production（`aljavfujeqcwnqryjmhl`）への誤 link/誤 push を二重確認で防止**
  3. backup 取得
  4. link 先二重確認 → staging 検証 → production
- local stack は本 close で `supabase stop` 済み（volume は保持・reset せず）。

---

## 9. 次フェーズ候補

- **Phase E-0（次着手）**: Calendar real-data connection の **設計 + Repository/DataSource 境界 skeleton**。
  - いきなり `CalendarTab.tsx` を実 DB に差し替えない。
  - まず「fixture を返す現状」を `TravelRepository`（DataSource 抽象）の背後に隠し、
    将来 Supabase 実装に差し替え可能な境界を作る（fixture 実装は維持・挙動不変）。
- Phase F 候補: API route（owner-scoped CRUD）+ server component fetch 配線。
- Phase G 候補: location_notes 公開（published）解禁 — moderation / report / 公開 feed UI。
- 別 GO: staging → production apply（§8）。

---

## 付録: 再現コマンド（local 限定）

```bash
# 起動
supabase start

# 全 migration を空 DB に apply（local のみ・remote 不触）
supabase db reset

# schema 確認
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At \
  -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'travel_%' OR relname LIKE 'location_note%' ORDER BY relname;"

# RLS test
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/travel_location_notes_rls_test.sql

# 停止（volume 保持）
supabase stop
```
