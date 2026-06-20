# RO-9 — Task Store Persistence Design（docs-first・schema DRAFT のみ・DB migration 実行禁止）

- **status**: docs-first 設計（schema DRAFT + migration read plan + audit）。**DB migration 実行なし・Supabase write なし・production data 変更なし・Origin UI 接続なし・code 変更ゼロ**。停止条件を全評価し hard stop 非該当
- **CEO GO**: RO-9 GO（2026-06-20・RO-8 着地に続けて・裁定 9 点・**steps 1-3 のみ / 4-5 禁止**）
- **lineage**: RO-8（`CanonicalTaskV0` neutral task source + projection）→ 本 RO-9（`CanonicalTaskV0` を永続化する neutral task store の設計 + `daily_orbit_state` からの migration plan）。
- **CEO 方針反映**: migration は **A 寄り（残して移行）**。但し**今は production migration しない**。`daily_orbit_state`/`origin_profiles` を未来の task 正本にしない（Origin 削除予定・JSONB 強結合）。新 task source は **Origin から独立**。実装順 `1 schema design → 2 migration read plan → 3 dup/collision/data-loss audit → 4 CEO GO → 5 実行` のうち **RO-9 は 1-3 まで・4-5 禁止**。

---

## 0. GOAL（北極星）

> RO-8 の `CanonicalTaskV0` を保存する **neutral task store（Origin 非依存）**を設計し、`daily_orbit_state.entries[].tasks` からの migration / salvage plan を設計する。`TaskRealityNodeV0` は引き続き canonical task からの projection。**Origin UI / OrbitTask / daily_orbit_state を未来の正本にしない**。schema は DRAFT（CEO レビュー用）・**migration は実行しない**。

---

## 1. premise 検証（停止条件評価の基盤・実コード接地）

| premise | 検証 | 証拠 |
|---|---|---|
| 既存の user-task table がある（二重正本化リスク） | **否定** | migration の `task/plan` 系は plan_seeds（ActionShape/desired_date の **plan candidate seed**・別概念）/ plan_drift_events / plan_history 等で **user-todo table はゼロ**。OrbitTask（JSONB）が唯一の user-task |
| origin_profiles の RLS/ownership が明確 | **肯定** | `origin_profiles enable row level security`（origin_persistence:93）+ owner select/insert/update policy（:139/146/153）・`user_id uuid references auth.users(id) on delete cascade` |
| daily_orbit_state から task を安全に取り出せる | **肯定** | `daily_orbit_state` = `origin_profiles` の JSONB。`DailyOrbitStore = { entries: Record<"YYYY-MM-DD", DailyOrbitEntry> }`（types.ts:388-390）→ task path = `entries[<date>].tasks[]`（OrbitTask）。JSONB path で抽出可 |
| RLS schema の参照パターンがある | **肯定** | plan_seeds（plan_seeds_structured_only:82-93）= `ENABLE ROW LEVEL SECURITY` + owner select/insert/update/delete `auth.uid() = user_id`。canonical_tasks の DRAFT 参照 |

→ **停止条件の主要 4 件が非該当**（§9 で全評価）。docs-first 設計を進める。

---

## 2. canonical_tasks table DRAFT（**未適用・CEO レビュー用・実行禁止**）

> ⚠ これは **schema DRAFT**（design doc 内）であり migration ファイルではない。**適用しない**（CEO #7 禁止 / 実装順 step 4-5 は RO-9 範囲外）。table 名は `canonical_tasks`（`CanonicalTaskV0` と整合・plan_seeds[candidate seed] と別概念）。

```sql
-- DRAFT ONLY（RO-9 設計・未適用・DB migration はまだ禁止）
CREATE TABLE IF NOT EXISTS canonical_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- 新 canonical task id（= CanonicalTaskV0.taskId 正本）
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- salvage provenance（OrbitTask.id 等）。dedup 鍵・正本ではない（追跡用）
  source_task_id  text NOT NULL,
  source_kind     text NOT NULL DEFAULT 'daily_orbit'
                    CHECK (source_kind IN ('daily_orbit','manual','import')),
  text            text NOT NULL,
  completed       boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,
  carried_from    date,
  carry_count     integer NOT NULL DEFAULT 0 CHECK (carry_count >= 0),
  due_date        date,
  due_time        time,                          -- HH:mm（time without tz・JST 解釈は projection 側）
  recurrence      jsonb,                          -- {pattern, dayOfWeek?, dayOfMonth?, intervalDays?}
  motivation      text CHECK (motivation IS NULL OR motivation IN
                    ('impulse','obligation','investment','curiosity')),  -- TaskNature salvage
  completion_feel text CHECK (completion_feel IS NULL OR completion_feel IN
                    ('satisfying','relieved','just_done')),               -- CompletionTexture salvage
  tags            text[] NOT NULL DEFAULT '{}',
  parent_id       uuid REFERENCES canonical_tasks(id) ON DELETE SET NULL, -- subtask 1階層
  added_at        timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- re-import 重複防止: 同一 user の同一 source task は 1 行
  CONSTRAINT canonical_tasks_source_unique UNIQUE (user_id, source_kind, source_task_id),
  -- completed=true は completed_at を要求（honest・捏造でなく観測時刻）
  CONSTRAINT canonical_tasks_completed_at CHECK (NOT completed OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_canonical_tasks_user_due       ON canonical_tasks (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_canonical_tasks_user_completed ON canonical_tasks (user_id, completed);
CREATE INDEX IF NOT EXISTS idx_canonical_tasks_user_parent    ON canonical_tasks (user_id, parent_id);

ALTER TABLE canonical_tasks ENABLE ROW LEVEL SECURITY;  -- RLS 必須（plan_seeds パターン踏襲）
CREATE POLICY canonical_tasks_owner_select ON canonical_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY canonical_tasks_owner_insert ON canonical_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY canonical_tasks_owner_update ON canonical_tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY canonical_tasks_owner_delete ON canonical_tasks FOR DELETE USING (auth.uid() = user_id);

-- updated_at 自動更新（既存 set_origin_updated_at と同型・別 trigger 名 or 共通関数再利用）
CREATE TRIGGER canonical_tasks_updated_at BEFORE UPDATE ON canonical_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_origin_updated_at();
```

---

## 3. Field Mapping（`CanonicalTaskV0` ↔ canonical_tasks 列）

| `CanonicalTaskV0` | canonical_tasks 列 | 型 | 備考 |
|---|---|---|---|
| `taskId` | **`id`**（新 UUID） | uuid PK | 永続後の正本 id。projection は `trn:${id}` |
| （salvage 元 id） | **`source_task_id`** | text | OrbitTask.id 等。dedup・追跡用（正本でない） |
| `text` | `text` | text | |
| `completed` | `completed` | boolean | |
| `completedAt` | `completed_at` | timestamptz | |
| `carriedFrom` | `carried_from` | date | |
| `carryCount` | `carry_count` | integer | ≥0 |
| `dueDate` | `due_date` | date | |
| `dueTime` | `due_time` | time | HH:mm |
| `recurrence` | `recurrence` | jsonb | `{pattern,dayOfWeek?,dayOfMonth?,intervalDays?}` |
| `motivation` | `motivation` | text+CHECK | TaskNature salvage |
| `completionFeel` | `completion_feel` | text+CHECK | CompletionTexture salvage |
| `tags` | `tags` | text[] | |
| `parentId` | `parent_id` | uuid FK | **source parentId → 新 id 解決が要る**（§7 two-pass） |
| `addedAt` | `added_at` | timestamptz | |
| — | `created_at`/`updated_at` | timestamptz | DB 管理 |

**重要**: `CanonicalTaskV0.taskId` は永続後は **新 UUID（canonical_tasks.id）**を指す。OrbitTask.id は `source_task_id` に salvage provenance として保持（正本にしない＝CEO「OrbitTask を正本名にしない」）。

---

## 4. recurrence / carryOver / parentId handling

- **recurrence**: `jsonb`（`CanonicalTaskRecurrenceV0` をそのまま格納）。recurring 展開（subjectiveDate ごとの instance 生成）は **store ではなく projection/RD0 orchestration 側**（store は定義を保持・展開しない＝二重正本化回避）。
- **carryOver**: `carried_from`(date) + `carry_count`(int)。RO-1 `applyTaskOutcome` の carryOver 口に流せる。migration では OrbitTask.carriedFrom/carryCount をそのまま移送。
- **parentId（subtask 1階層）**: `parent_id uuid FK → canonical_tasks(id)`。OrbitTask.parentId は **source task id**ゆえ、migration は **two-pass**: ①全 task を insert（parent_id=NULL）②source parentId → 新 id を解決して UPDATE。循環/多階層は OrbitTask が 1階層のみ（types.ts:262）ゆえ無し。親が存在しない（dangling parentId）なら parent_id=NULL（honest・捏造しない）。

---

## 5. Migration Read Plan（`daily_orbit_state.entries[].tasks` → canonical_tasks・**read-only 設計・実行禁止**）

> ⚠ **実装しない**（CEO #7「daily_orbit_state を本番 task source として直接読む path を作らない」/ step 5 禁止）。以下は read plan の **設計**。

1. **source**: `origin_profiles.daily_orbit_state`（JSONB）→ `DailyOrbitStore.entries`（`Record<YYYY-MM-DD, DailyOrbitEntry>`）→ 各 `entry.tasks[]`（OrbitTask）。owner = `origin_profiles.user_id`。
2. **抽出**: user ごとに entries を走査し OrbitTask を収集。`entry` の date key は OrbitTask の文脈日付（dueDate と別・追加日 context）。
3. **写像**: OrbitTask → canonical_tasks 行（§3 mapping）。`source_task_id = OrbitTask.id`・`source_kind='daily_orbit'`・`id = gen_random_uuid()`。
4. **two-pass parent 解決**（§4）。
5. **冪等**: `UNIQUE(user_id, source_kind, source_task_id)` で re-run しても重複しない（ON CONFLICT DO NOTHING or DO UPDATE）。
6. **read-only / 非破壊**: `daily_orbit_state` は**読むだけ**（write/削除しない）。Origin データは migration 後も残る（A 案・データ保全）。
7. **実行は別途**（CEO migration GO 後・step 5）。RO-9 では read plan の設計のみ。

**安全制約**: migration runner は service_role でなく owner 文脈 or 管理 batch（RLS 準拠）。production data 変更ゆえ CEO 承認 + staging dry-run 必須（既存 RD3x-ACTIVATE の手順に倣う）。

---

## 6. RLS / Ownership Plan

- **ownership**: `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`（origin/plan_seeds と同型）。user 削除で task も cascade 削除。
- **RLS**: `ENABLE ROW LEVEL SECURITY` + owner-only の select/insert/update/delete（`auth.uid() = user_id`）。service_role 不使用（anon+auth・plan_seeds パターン）。
- **future sync**: 同一 user の複数デバイス → server 正本（origin が localStorage→server 移行済の方針を継承）。
- **deletion/archive**: hard delete（owner delete policy）or soft archive（`archived_at timestamptz` 追加案・openDecision）。
- **recurring expansion**: store は定義のみ・展開は projection 側（§4）。

---

## 7. Duplicate / ID Collision / Data Loss Risk Analysis（CEO 必須）

| リスク | 分析 | 対策 |
|---|---|---|
| **二重正本化（既存 table）** | user-todo table はゼロ（§1）。plan_seeds は candidate seed で別概念 | 新 `canonical_tasks` は競合しない。OrbitTask は salvage 元（正本にしない） |
| **id collision** | OrbitTask.id は client 生成（format 未確認・Date.now/random 系の可能性）。user 跨ぎ・date 跨ぎで衝突し得る | 新 table は **自前 `id uuid` PK**。OrbitTask.id は `source_task_id`(text) に保持・**dedup は `UNIQUE(user_id, source_kind, source_task_id)`**（user scope で一意化）。format 確認は migration impl で実施 |
| **re-import 重複** | migration 再実行で同 task が二重挿入 | `UNIQUE(user_id, source_kind, source_task_id)` + `ON CONFLICT DO NOTHING/UPDATE`（冪等） |
| **data loss** | OrbitTask の欠落属性（duration/load 等）は元々無い（捏造しない）。salvage 対象（text/due/completed/carry/recurrence/motivation/feel/tags/parent）は全列に写像 | A 案（残して移行）で daily_orbit_state は非破壊。新 table への移送が全 field 網羅（§3） |
| **dangling parentId** | OrbitTask.parentId が存在しない親を指す | two-pass で未解決は parent_id=NULL（honest） |
| **partial/中断 migration** | batch 途中失敗 | 冪等 UNIQUE + 再 run 安全。staging dry-run で件数検証 |
| **timezone（due_time）** | due_time は HH:mm（tz なし）。JST 解釈は projection 側 | store は naive time 保持・projection で `+09:00` 合成（RO-8 §4 と整合） |
| **Origin 削除との両立** | A 案で daily_orbit_state は残す（migration 後も読まない・本番 source は canonical_tasks） | Origin UI 削除と canonical_tasks は独立（依存方向ゼロ） |

---

## 8. Implementation Order（CEO #6・RO-9 は 1-3 のみ）

| step | 内容 | RO-9 |
|---|---|---|
| 1 | new neutral task store schema design | ✅ §2 |
| 2 | migration read plan | ✅ §5 |
| 3 | duplicate / id collision / data loss audit | ✅ §7 |
| 4 | **CEO migration GO** | ❌ 禁止（CEO 判断） |
| 5 | **migration 実行**（staging dry-run → production） | ❌ 禁止 |

---

## 9. 停止条件評価（CEO #8）

| 停止条件 | 評価 | 詳細 |
|---|---|---|
| 新 table が既存データと二重正本化 | **非該当** | user-todo table ゼロ・plan_seeds は別概念（§1） |
| daily_orbit_state から安全に task を取り出せない | **非該当** | JSONB `entries[].tasks[]` で抽出可・read-only 設計（§5） |
| RLS / user ownership が不明 | **非該当** | origin_profiles RLS + user_id ownership 確認（§1/§6） |
| recurrence / parent / carried の migration semantics が曖昧 | **非該当** | §4 で明確化（recurrence=jsonb 定義のみ・parent=two-pass・carried=列移送） |
| schema 変更が必要でそのまま実行しそう | **非該当** | schema は **DRAFT（doc 内）**・migration ファイル未作成・実行禁止を明記 |
| Origin 削除とデータ保全が両立しない | **非該当** | A 案（残して移行）で daily_orbit_state 非破壊・canonical_tasks は Origin 独立 |

→ **hard stop 非該当**。docs-first（schema DRAFT + read plan + audit）で着地。**migration 実行は CEO GO 後（step 4-5）**。

---

## 10. 検証（RO-9）

- **code 変更ゼロ / migration ファイル未作成**（schema は doc 内 DRAFT のみ）。
- **DB / Supabase / production 不接触**（read plan は設計・未実行）。
- tsc footprint 不変（51・新規コードなし）・既存 test 不変。
- RO-1〜8 型改変ゼロ。

---

## 11. openDecisions（CEO 判断）

1. **table 名**: `canonical_tasks`（推奨・CanonicalTaskV0 整合）vs `plan_tasks`（plan ドメイン整合・但し plan_seeds と紛らわしい）。
2. **migration GO（step 4）**: staging dry-run → production の実行タイミング。CEO 承認 + RD3x-ACTIVATE 手順。
3. **deletion 方針**: hard delete vs soft archive（`archived_at` 追加）。
4. **source_kind の将来値**: daily_orbit（salvage）/ manual（新 UI 入力）/ import（外部）。task 入力 UX（Origin 削除後の導線）と連動。
5. **due_time の tz**: naive time + projection JST 合成で確定（本設計）。タイムゾーン跨ぎ user は将来課題。
6. **recurring instance 永続**: 定義のみ store（本設計）vs 展開 instance も永続。後者は二重正本化リスクゆえ非推奨。
7. **migration runner**: owner 文脈 batch vs 管理 job。RLS 準拠・service_role 不使用を厳守。

**本 RO-9 は docs-first（schema DRAFT + read plan + audit）で確定。migration 実行は CEO GO（step 4-5）後。**
