# M1 prm_learning_events — Static Review + Local Smoke Plan（A1-7-12・**docs-only・apply しない**）

対象: `supabase/migrations/20260608120000_create_prm_learning_events.sql`（A1-7-11・draft）
設計: `docs/prm-migration-readiness-plan.md`（A1-7-10・M1）/ §10.11 / §10.12
状態: **静的レビュー + local smoke の手順書のみ**。**Supabase apply / db push / local reset / migration up の実行はしない**（別 GO）。

---

## A. 静的レビュー（thorough）

### A.1 Correctness（SQL が設計通りか）
- ✅ `CREATE TABLE IF NOT EXISTS prm_learning_events`・`id uuid pk default gen_random_uuid()`・`user_id uuid not null references auth.users(id) on delete cascade`。
- ✅ enum CHECK: action(accept/dismiss/later) / signal(adoption/non_adoption/deferral) / band(nullable・morning/afternoon/evening) / confidence_band(not null・high/medium/low) / source_kind(not null・seed_explicit/correction)。
- ✅ `duration_min CHECK (… >= 0)`（負値拒否）。`acted_at not null` / `captured_at not null default now()` / `expires_at`(nullable)。
- ✅ index: `(user_id, acted_at)` / `(user_id, expires_at) where expires_at is not null`。
- ✅ RLS: `enable row level security` + owner-only SELECT/INSERT/DELETE policy。**UPDATE policy なし**。

### A.2 Completeness（A1-7-10 M1 要件の充足）
| 要件 | 充足 |
|---|---|
| 源泉 signal log（events=raw facts） | ✅ action+context のみ・derived/model 列なし |
| owner-only RLS / service_role 非前提 / cross-user 不可 | ✅ `auth.uid()=user_id`・anon JWT 前提 |
| append-only | ✅ UPDATE policy 不在で RLS が更新拒否 |
| structured-only（raw/seedRef 非保存） | ✅ 列が存在しない（構造的に保存不能） |
| certainty high 不可 | ✅ certainty 列を持たない（M1 に該当概念なし・CHECK は M3） |
| personality/trait/fixed_preference なし | ✅ 列なし（文脈束縛 facts のみ） |
| index / TTL / rollback | ✅ index 2 本・expires_at・header に revert SQL |

### A.3 Edge cases / safety（findings・**全て非 blocker**）
1. **expires_at に default なし** → **app が insert 時に必ず設定する責務**（TTL window=policy 判断ゆえ schema に hardcode しない）。未設定の row は expire しない（蓄積）。→ 緩和: app insert で `now()+policy` を必ず設定 / 将来 schema default or sweep で補完可。**非 blocker**（events は aggregation 用・蓄積は後で sweep 可）。
2. **handle に index なし** → aggregation は `user_id` 単位 read ゆえ不要。per-handle 照会（dedup 等）が出たら index 追加。**非 blocker**。
3. **acted_at に範囲制約なし** → client 由来。異常 timestamp は recency を歪め得る。→ 緩和: app 側で acted_at を validate/clamp（aggregation も robust）。**非 blocker**。
4. **self-poisoning**（user が自分用に偽 event を insert 可） → RLS は owner-only ゆえ**自分のモデルのみ**汚染・cross-user 不可。M3 の review gate で偽 event は自動 fact 化しない。**非 blocker**（self-only・review-gated）。
5. **unique 制約なし**（同 handle/action の複数 row 可） → **正しい**（append-only log・user は再 action 可能）。**issue でない**。
6. **down は comment**（separate revert file でない） → Supabase CLI は native down なし。revert 時は別 revert migration を書く（header の DROP を実行）。新規 table ゆえ clean DROP。**非 blocker**（手順明記済）。

### A.4 Verdict
**M1 SQL は correct / complete / safe（用途=源泉 events log に対し）**。finding 6 件は全て非 blocker（app-insert 責務 / 将来 index / app validate / self-only / 設計通り / revert 手順）。**apply 可否の判断は CEO**（実行は別 GO）。

---

## B. Local Smoke Plan（**checklist・実行は別 GO・remote 触らない**）

> 目的: M1 を **local DB のみ**で apply し、schema/RLS/constraints/index/down を検証してから remote 判断に進む。本書は手順定義。**A1-7-12 では実行しない**（CEO が smoke 実行を承認した別 GO で実施）。

### B.0 前提（local-only guardrails）
- **local Supabase のみ**（`supabase start` の local DB）。**staging/production/remote は触らない・`supabase db push` 禁止**。
- 別 branch / 一時 DB 推奨（既存 local データに影響させない）。

### B.1 手順 + 期待結果
| # | 手順 | 期待 |
|---|---|---|
| 1 | `supabase start`（local）→ migration 適用（`supabase migration up` or `db reset`・**local 限定**） | M1 含む全 migration が local に apply・error なし |
| 2 | `\d prm_learning_events`（psql local） | columns/types/CHECK/FK が設計通り |
| 3 | RLS 確認（`\d+` / pg_policies） | RLS enabled・SELECT/INSERT/DELETE policy あり・**UPDATE policy なし** |
| 4a | 正常 INSERT（owner・valid enum） | 成功 |
| 4b | INSERT action='foo' | **reject**（CHECK） |
| 4c | INSERT confidence_band=NULL | **reject**（NOT NULL） |
| 4d | INSERT duration_min=-1 | **reject**（CHECK ≥0） |
| 4e | UPDATE 既存 row | **reject**（UPDATE policy なし＝append-only） |
| 4f | 別 user で SELECT | **0 rows**（owner-only RLS） |
| 4g | owner で自分の row DELETE | 成功（GDPR 削除） |
| 5 | index 確認（pg_indexes） | `idx_prm_learning_events_user_acted` / `…_active_expiry` あり |
| 6 | down 検証（header の DROP INDEX→DROP TABLE を local 実行） | clean DROP・残留なし |

### B.2 smoke PASS 条件 / FAIL 時
- **PASS**: 全 step が期待通り（特に 4b-4f の reject + 4f の RLS 0 rows + 4e の append-only）。
- **FAIL**: いずれか想定外 → migration draft 修正（A1-7-11 file を edit）→ 再 review → 再 smoke。**remote に進まない**。

### B.3 smoke 後の stop gate
- local smoke PASS → **CEO が実 SQL + smoke 結果を review** → 承認なら **remote/staging apply は更に別 GO**（production は更に別）。
- **local smoke の実行自体も CEO 承認（本 plan の承認）後**。A1-7-12 では手順定義のみ。

---

## C. しない（A1-7-12 の境界）
Supabase apply / db push / local reset / migration up の実行 / migration 編集 / M2・M3 作成 / route / Home / persistence / production / env / remote / PR。
