# RO-10 — Canonical Task Store Migration Readiness Pack（readiness 設計・DB apply 未実行）

- **status**: migration readiness pack（SQL draft + extraction plan + dry-run checklist + audit）。**production/staging apply なし・Supabase write なし・migration 実行なし・migration ファイル未作成・daily_orbit_state 不変・code 変更ゼロ**。停止条件全評価 hard stop 非該当
- **CEO GO**: RO-10 GO（2026-06-20・RO-9 着地に続けて・裁定 10 点・**readiness のみ / apply 禁止**）
- **lineage**: RO-8（CanonicalTaskV0）→ RO-9（canonical_tasks schema design）→ 本 RO-10（schema draft を **migration-ready** に精査 + dry-run 準備）。
- **CEO 裁定反映**: ①table=`canonical_tasks` 確定 ②**soft archive**（`archived_at` 追加）③source_kind=daily_orbit/manual/import ④due_time=time(JST 合成は projection) ⑤recurring instance 永続しない（recurrence 定義のみ）。
- **SQL draft**: [reality-os-ro10-canonical-task-migration.sql.draft](reality-os-ro10-canonical-task-migration.sql.draft)（`.sql.draft`・**supabase/migrations に置かない**・DO NOT APPLY）。

---

## 0. GOAL

> RO-9 の schema draft を **migration-ready SQL draft** に整え、staging/local dry-run に備える。**CEO migration GO（RO-9 step 4）なしに production/staging へ apply しない**。RO-10 は readiness（schema 最終確認 + extraction plan + dry-run checklist + audit）まで。

---

## 1. CEO 裁定の SQL draft 反映確認

| CEO 裁定 | 反映 | SQL draft 該当 |
|---|---|---|
| table=`canonical_tasks` | ✅ | `CREATE TABLE public.canonical_tasks` |
| soft archive | ✅ | `archived_at timestamptz` + `idx_canonical_tasks_user_active WHERE archived_at IS NULL` + hard delete policy は残すが主経路でない注記 |
| source_kind 3値 | ✅ | `CHECK (source_kind IN ('daily_orbit','manual','import'))` |
| due_time naive + JST projection | ✅ | `due_time time`（tz なし）・コメントで projection JST 合成明記 |
| recurring instance 永続しない | ✅ | `recurrence jsonb`（定義のみ）・instance table なし |

---

## 2. Schema 最終確認（曖昧 field ゼロ・停止条件 #1）

| field | 型 | 確定根拠 |
|---|---|---|
| id | uuid PK gen_random_uuid | CanonicalTaskV0.taskId 正本（新 UUID） |
| user_id | uuid FK auth.users cascade | ownership（origin/plan_seeds 同型） |
| source_task_id | text NOT NULL | salvage provenance・dedup 鍵 |
| source_kind | text+CHECK 3値 | CEO 確定 |
| text | text NOT NULL | OrbitTask.text |
| completed / completed_at | boolean / timestamptz | + CHECK(completed→completed_at) |
| carried_from / carry_count | date / int≥0 | carryOver |
| due_date / due_time | date / time | due_time naive |
| recurrence | jsonb | 定義のみ |
| motivation / completion_feel | text+CHECK | TaskNature/CompletionTexture salvage |
| tags | text[] DEFAULT '{}' | |
| parent_id | uuid self-FK SET NULL | subtask 1階層 |
| added_at | timestamptz NOT NULL | fallback=entry.createdAt |
| archived_at | timestamptz | soft archive |
| created_at / updated_at | timestamptz | DB 管理 + trigger |

→ **曖昧 field なし**（全 field 型・制約・由来確定）。停止条件 #1 非該当。

---

## 3. RLS / Ownership Audit（停止条件 #2）

- ✅ `ENABLE ROW LEVEL SECURITY`（plan_seeds パターン）。
- ✅ owner-only policy 4（select/insert/update/delete・`auth.uid() = user_id`）。
- ✅ `user_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`（user 削除で cascade）。
- ✅ service_role 不使用（anon+auth・owner-RLS）。
- ✅ insert/update は `WITH CHECK (auth.uid() = user_id)`（他 user への詐称防止）。
- **不安点なし**（plan_seeds/origin と同型の実績パターン）。停止条件 #2 非該当。

---

## 4. updated_at trigger 既存関数利用可否（停止条件 #3）

- **検証**: `public.set_origin_updated_at()`（origin_persistence:3-11）は `new.updated_at = now()` の **generic**（origin 固有ロジックなし）→ 技術的には再利用可能。
- **判断**: canonical_tasks は **Origin 非依存**ゆえ、命名結合を避け **neutral 関数 `public.set_canonical_task_updated_at()` を新設**（`CREATE OR REPLACE`・冪等）。set_origin_updated_at に依存しない（Origin 削除の影響を受けない）。
- → 停止条件 #3 非該当（既存関数は利用可能だが neutral 新設が clean）。

---

## 5. Extraction / Read Plan（daily_orbit_state → canonical_tasks・read-only・停止条件 #5）

- **source path**: `origin_profiles.daily_orbit_state -> 'entries' -> <YYYY-MM-DD> -> 'tasks'[]`（`DailyOrbitStore.entries` Record・types.ts:388）。
- **型揺れ吸収**（v1→v2 migration が core を normalize 済・store.ts:111-151）: 抽出は防御的（SQL draft [E1]）:
  - 必須欠落の防御: `id`/`text` 欠落 task は **除外**（dedup 鍵 / NOT NULL 列）。
  - default: `completed`→false / `carry_count`→0 / `tags`→'{}'。
  - **`added_at` fallback = `entry.createdAt`**（v1→v2 が createdAt 既定・honest・捏造でない）。
  - optional（completedAt/carriedFrom/dueDate/dueTime/nature/texture/recurrence/parentId）→ NULL（honest）。
- **read-only**: `SELECT` のみ・`daily_orbit_state` を**変更/削除しない**（A 案・非破壊）。停止条件 #5（欠損/型揺れ多い）→ 防御的 extraction で吸収可・**非該当**。

---

## 6. parentId Two-Pass Verification Plan（停止条件 #4）

- OrbitTask.parentId は **1階層のみ**（types.ts:262・nesting なし）→ 循環なし。
- **pass1**: 全 task を insert（`parent_id = NULL`・`_source_parent_id` を一時列 or staging table に保持）。
- **pass2**: `_source_parent_id → 新 id` を `(user_id, source_kind, source_task_id)` で解決し UPDATE（SQL draft [E3]）。
- **dangling**（親 source 不在）→ `parent_id` は NULL のまま（honest・捏造しない）。
- **検証項目**: ①pass2 後に `_source_parent_id` が非 NULL かつ `parent_id` NULL の件数 = dangling 数（期待値と照合）②自己参照（parent=self）の検出と除外 ③多階層（pass2 後も解決されない chain）の不在確認。
- → 安全に設計可能。停止条件 #4 非該当。

---

## 7. Migration Dry-Run Checklist（staging/local・apply 前）

> ⚠ dry-run は **staging/local**。**production apply は CEO GO 後のみ**。RO-10 では checklist 作成まで（実行しない）。

1. [ ] SQL draft を `supabase/migrations/<ts>_canonical_tasks.sql` へ rename（CEO GO 後のみ）。
2. [ ] staging で `CREATE TABLE` + RLS + trigger 適用（local/staging 限定）。
3. [ ] migration-check skill で RLS 漏れ・破壊的変更・依存順序を検証。
4. [ ] extraction [E2] audit を staging real data で実行 → total_tasks / skipped_no_id / skipped_no_text を記録。
5. [ ] extraction [E1] を staging で実行（INSERT は ON CONFLICT DO NOTHING）→ insert 件数 = total − skipped を照合。
6. [ ] dedup 検証: 同 [E1] を 2 回実行 → 2 回目 insert 0（冪等・UNIQUE 効く）。
7. [ ] parentId two-pass [E3] 実行 → dangling 件数を audit と照合。
8. [ ] RLS smoke: STAGING_USER_A で自分の task のみ read 可・他 user 不可・production-url reject。
9. [ ] projection 検証: canonical_tasks 行 → CanonicalTaskV0 → projectCanonicalTaskToRealityNode → taskRealityNodeViolations=[]。
10. [ ] rollback リハーサル: `DROP TABLE canonical_tasks CASCADE` で staging を戻せること（daily_orbit_state 無傷確認）。
11. [ ] CEO に dry-run 結果（件数/skip/dedup/dangling/RLS）報告 → **production apply GO 判断**。

---

## 8. Data-Loss / Dedup / ID-Collision Checklist

| 検証 | 期待 | 方法 |
|---|---|---|
| data loss（task 総数） | extraction 件数 + skip 件数 = source task 総数 | [E2] audit |
| skip（id/text 欠落） | skip 件数を honest に記録（捏造で埋めない） | [E2] FILTER |
| dedup（re-import） | 2 回目 insert 0 | UNIQUE(user_id,source_kind,source_task_id) + ON CONFLICT |
| id collision（user 跨ぎ） | source_task_id 衝突は user scope で隔離 | UNIQUE に user_id 含む・新 uuid PK |
| 全 field 移送 | salvage 対象 14 field 全列に写像 | [E1] 列対応（§RO-9 §3） |
| 欠落属性（duration 等） | 元々無い→列なし（捏造ゼロ） | canonical_tasks に該当列なし |
| daily_orbit_state 非破壊 | source 無変更 | read-only SELECT のみ |

---

## 9. Rollback / Abort Conditions

- **abort 条件**（dry-run で 1 つでも該当 → 中止・CEO 報告）:
  - extraction skip 率が異常に高い（id/text 欠落多発＝データ破損疑い）。
  - dedup が効かず重複 insert される（UNIQUE 制約不全）。
  - parentId two-pass で多階層/循環が検出（OrbitTask 1階層前提崩壊）。
  - RLS smoke で他 user task が見える（policy 不全）。
  - daily_orbit_state が変更される（read-only 破れ）。
- **rollback**: `DROP TABLE public.canonical_tasks CASCADE; DROP FUNCTION public.set_canonical_task_updated_at();`（staging のみ）。`daily_orbit_state` は read-only ゆえ rollback 対象外（元データ無傷）。

---

## 10. 停止条件評価（CEO #10）

| 停止条件 | 評価 |
|---|---|
| schema draft に曖昧な field が残る | **非該当**（§2 全 field 確定） |
| RLS policy に不安 | **非該当**（§3 plan_seeds 実績パターン） |
| updated_at trigger 関数が既存利用できない | **非該当**（§4 generic 再利用可・neutral 新設） |
| parentId two-pass が安全に設計できない | **非該当**（§6 1階層・dangling→NULL） |
| daily_orbit_state JSONB extraction で欠損/型揺れが多い | **非該当**（§5 防御的 extraction で吸収） |
| migration file で自動適用リスク | **非該当**（`.sql.draft`・docs 配下・**supabase/migrations に未配置**） |
| staging/production apply が必要 | **非該当**（RO-10 は readiness・apply は CEO GO 後） |

→ **hard stop 非該当**。readiness pack 着地。**DB apply 未実行**（migration ファイル未作成・SQL は `.sql.draft`）。

---

## 11. DB Apply 未実行の確認

- ✅ `supabase/migrations/` に新規 `.sql` ファイル **未作成**（auto-apply リスクゼロ）。
- ✅ SQL は `docs/reality-os-ro10-canonical-task-migration.sql.draft`（`.sql.draft` 拡張子・apply 対象外）。
- ✅ Supabase write / production / staging DB 不接触。daily_orbit_state 不変。
- ✅ code 変更ゼロ・tsc 51 不変・RO-1〜9 型改変ゼロ。

---

## 12. openDecisions（CEO 判断）

1. **migration GO（RO-9 step 4）**: SQL draft を `supabase/migrations/` へ昇格し staging dry-run → production apply の実行タイミング（RD3x-ACTIVATE 手順）。
2. **two-pass の `_source_parent_id` 保持方法**: 一時列（migration 後 DROP）vs staging table。dry-run で確定。
3. **task 入力 UX**（source_kind='manual'）: Origin 削除後の canonical task 入力導線（別 GO・canonical task 入力 UI は RO-10 禁止）。
4. **archive 自動化**: 完了 task の auto-archive 規則（即時 vs N 日後）。v0 は手動 archive。

**本 RO-10 は readiness pack（SQL draft + extraction + dry-run checklist + audit）で着地。production/staging apply は CEO migration GO 後。**
