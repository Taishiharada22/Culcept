# Stage R4 Step 0 — 4 file Pre-flight Review (docs-only / read-only)

起草日: 2026-05-27
親 phase: migration-debt-phase → migration-debt-repair → Stage R4 (Scenario β 採用)
CEO 確定: 2026-05-27 (R4 Step 0 即起動、 4 file 全部 docs-only / read-only 精査)

---

## §0. 本 Step の scope

### scope に含まれる (= 本 doc で決める)

- production 未適用 **4 file** の SQL 完全レビュー (各 op 単位)
- 各 file の冪等性 / 副作用 / 依存関係 / rollback SQL の固定
- **適用順 (= Step 1-4) の確定**
- **各 Step 後の verify SQL の固定**
- **停止条件 (= 4 file 共通 + 各 file 固有) の固定**
- **schema_migrations への手動 INSERT 手順の確定**

### scope に含まれない (= 本 Step では実行しない)

- production への apply 実行 (= Step 1-5 で CEO 個別承認)
- staging への apply 実行 (= staging は既に reset で全 file 適用済)
- 既存 migration file の改変
- production data の操作

---

## §1. 4 file 詳細レビュー

### §1.1 File 1: `20260430100100_external_anchors.sql` (13.7 KB)

**目的**: Alter Plan ExternalAnchor + ExternalAnchorSource 物理モデル (= P3 全体 foundation)

**Operations (= 順序通り)**

| # | Operation | 種別 | 冪等性 | 副作用 |
|---|-----------|------|--------|--------|
| 1 | `CREATE TABLE IF NOT EXISTS external_anchor_sources` (= 8 column + 3 CHECK) | DDL | ✅ 冪等 (= IF NOT EXISTS) | table 作成のみ |
| 2 | `CREATE INDEX idx_external_anchor_sources_user_captured` | DDL | ❌ **非冪等** (= IF NOT EXISTS なし) | index 作成 |
| 3 | `CREATE INDEX idx_external_anchor_sources_stored_expiry` (= partial) | DDL | ❌ 非冪等 | partial index |
| 4 | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | DDL | ✅ 冪等 | RLS 有効化 |
| 5-8 | `CREATE POLICY … external_anchor_sources_owner_{select,insert,update,delete}` × 4 | DDL | ❌ 非冪等 | policy 作成 |
| 9 | `COMMENT ON TABLE / COLUMN` × 5 | metadata | ✅ 冪等 (= 上書き) | metadata |
| 10 | `CREATE TABLE IF NOT EXISTS external_anchors` (= 18 column + 6 CHECK + 1 FK) | DDL | ✅ 冪等 | table 作成 |
| 11-13 | `CREATE INDEX … user_date / user_validity / source` × 3 | DDL | ❌ 非冪等 | index 作成 |
| 14 | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | DDL | ✅ 冪等 | RLS 有効化 |
| 15-18 | `CREATE POLICY … external_anchors_owner_{select,insert,update,delete}` × 4 | DDL | ❌ 非冪等 | policy 作成 |
| 19 | `COMMENT ON TABLE / COLUMN` × 9 | metadata | ✅ 冪等 | metadata |

**冪等性**: 部分的に冪等 (= 初回 apply 専用)。 二回目 apply は INDEX / POLICY で `already exists` error。

**Side effects on existing data**: なし (= 全 DDL、 既存 row touch せず)

**Rollback**:
```sql
DROP TABLE IF EXISTS external_anchors CASCADE;
DROP TABLE IF EXISTS external_anchor_sources CASCADE;
```

**依存**: なし (= 独立、 base table)

**Application 依存** (= 後段の機能):
- P3 ICS import (`importIcsAnchorsAction`)
- P3 Google OAuth (`user_calendar_connections` 等は別 migration)
- File 2 `create_external_anchor_bundle` の base

---

### §1.2 File 2: `20260519100000_create_external_anchor_bundle.sql` (7.8 KB)

**目的**: source + anchors を 1 transaction で INSERT する atomic RPC

**Operations**

| # | Operation | 種別 | 冪等性 | 副作用 |
|---|-----------|------|--------|--------|
| 1 | `CREATE OR REPLACE FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB)` (= SECURITY INVOKER) | DDL | ✅ **完全冪等** (= OR REPLACE) | function 定義のみ |
| 2 | `REVOKE ALL ON FUNCTION … FROM PUBLIC` | DDL | ✅ 冪等 | 権限剥奪 |
| 3 | `GRANT EXECUTE ON FUNCTION … TO authenticated` | DDL | ✅ 冪等 | 権限付与 |
| 4 | `COMMENT ON FUNCTION` | metadata | ✅ 冪等 | metadata |

**冪等性**: **完全冪等** (= 何度 apply しても OR REPLACE で同 function 上書き、 GRANT/REVOKE も冪等)

**Side effects on existing data**: なし

**Rollback**:
```sql
DROP FUNCTION IF EXISTS create_external_anchor_bundle(UUID, JSONB, JSONB);
```

**依存**: File 1 (= `external_anchor_sources` + `external_anchors` table の事前存在)

**設計的特徴**:
- `SECURITY INVOKER` (= DEFINER 禁止、 RLS bypass しない)
- 冒頭で `auth.uid() <> p_user_id` を ERRCODE `42501` で明示拒否 (= 二重防御)
- function 内 validation なし (= DB CHECK / RLS に委譲、 SoT 一貫)

---

### §1.3 File 3: `20260430110100_plan_drift_events.sql` (12.4 KB)

**目的**: Plan drift イベントログ (= Wave 1 W1-5 append-only)

**Operations**

| # | Operation | 種別 | 冪等性 | 副作用 |
|---|-----------|------|--------|--------|
| 1 | `CREATE TABLE IF NOT EXISTS plan_drift_events` (= 14 column + 8 CHECK + 1 FK to auth.users) | DDL | ✅ 冪等 | table 作成 |
| 2-4 | `CREATE INDEX … user_created / target / user_pattern` × 3 | DDL | ❌ 非冪等 | index (うち 1 つ partial) |
| 5 | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | DDL | ✅ 冪等 | RLS 有効化 |
| 6-8 | `CREATE POLICY … plan_drift_events_owner_{select,insert,delete}` × 3 | DDL | ❌ 非冪等 | policy 作成 (UPDATE 意図的不在) |
| 9 | `COMMENT ON TABLE / COLUMN` × 10 | metadata | ✅ 冪等 | metadata |

**冪等性**: 部分的に冪等 (= 初回 apply 専用、 INDEX / POLICY で 2 回目 fail)

**Side effects on existing data**: なし

**Rollback**:
```sql
DROP TABLE IF EXISTS plan_drift_events CASCADE;
```

**依存**: なし (= polymorphic target、 FK 無し、 完全独立)

**Application 依存**: 現状 application code から `.from("plan_drift_events")` 参照 **0 件** (= readiness §2.2 で記録、 Wave 1 W1-5 系の追跡)。 production 上で apply しても application 動作影響なし。

**設計的特徴**:
- **append-only** (= UPDATE policy 意図的不在)
- target は polymorphic (FK 無し、 4 種類: external_anchor / plan_seed / draft_plan_item / outfit_calendar_item)
- target_snapshot で削除耐性

---

### §1.4 File 4: `20260520120000_coalter_mirror_app_settings.sql` (10 KB、 BEGIN-COMMIT で wrapped)

**目的**: CoAlter Mirror Channel kill switch L3 foundation (= app_settings + audit log + immutability triggers)

**Operations (= BEGIN ... COMMIT で wrapped、 部分失敗時は全 rollback)**

| # | Operation | 種別 | 冪等性 | 副作用 |
|---|-----------|------|--------|--------|
| 0 | `BEGIN;` | tx | — | transaction 開始 |
| 1 | `CREATE TABLE IF NOT EXISTS app_settings` | DDL | ✅ 冪等 | table 作成 |
| 2 | `COMMENT ON TABLE / COLUMN` × 4 | metadata | ✅ 冪等 | metadata |
| 3 | `INSERT INTO app_settings … ON CONFLICT (key) DO NOTHING` (= seed row `mirror_channel_enabled=true`) | DML | ✅ **冪等** (= ON CONFLICT) | seed row 1 つ |
| 4 | `CREATE TABLE IF NOT EXISTS coalter_mirror_kill_switch_audit` | DDL | ✅ 冪等 | audit table 作成 |
| 5 | `CREATE INDEX IF NOT EXISTS idx_mirror_kill_switch_audit_triggered_at` | DDL | ✅ **冪等** (= IF NOT EXISTS) | index |
| 6 | `COMMENT ON TABLE / COLUMN` × 3 | metadata | ✅ 冪等 | metadata |
| 7 | `CREATE OR REPLACE FUNCTION audit_mirror_kill_switch()` (= SECURITY DEFINER + search_path 固定) | DDL | ✅ 冪等 | function 定義 |
| 8 | `COMMENT ON FUNCTION` | metadata | ✅ 冪等 | metadata |
| 9 | `CREATE TRIGGER mirror_kill_switch_audit_trigger` | DDL | ❌ **非冪等** (= IF NOT EXISTS なし) | trigger 作成 |
| 10 | `CREATE OR REPLACE FUNCTION prevent_audit_row_modify()` | DDL | ✅ 冪等 | function 定義 |
| 11 | `COMMENT ON FUNCTION` | metadata | ✅ 冪等 | metadata |
| 12 | `CREATE TRIGGER prevent_audit_update_trigger` (BEFORE UPDATE) | DDL | ❌ 非冪等 | trigger |
| 13 | `CREATE TRIGGER prevent_audit_delete_trigger` (BEFORE DELETE) | DDL | ❌ 非冪等 | trigger |
| 14 | `ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY` | DDL | ✅ 冪等 | RLS |
| 15 | `ALTER TABLE coalter_mirror_kill_switch_audit ENABLE ROW LEVEL SECURITY` | DDL | ✅ 冪等 | RLS |
| 16 | `CREATE POLICY app_settings_anon_read_mirror_kill_switch` | DDL | ❌ 非冪等 | policy |
| 17 | `REVOKE ALL ON app_settings FROM public` | DDL | ✅ 冪等 | 権限 |
| 18 | `REVOKE ALL ON coalter_mirror_kill_switch_audit FROM public` | DDL | ✅ 冪等 | 権限 |
| 19 | `GRANT SELECT ON app_settings TO anon, authenticated` | DDL | ✅ 冪等 | 権限 |
| 20 | `COMMIT;` | tx | — | transaction 確定 |

**冪等性**: 部分的に冪等 (= 初回 apply 専用、 TRIGGER / POLICY で 2 回目 fail)。 ただし `BEGIN ... COMMIT` wrap により 部分失敗時は全 rollback (= **integrity 保証**)

**Side effects on existing data**:
- `INSERT INTO app_settings` で seed row 1 つ (= `mirror_channel_enabled = {"enabled": true}`)
- `ON CONFLICT DO NOTHING` で 2 回目 INSERT は no-op

**Rollback**:
```sql
DROP TABLE IF EXISTS coalter_mirror_kill_switch_audit CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP FUNCTION IF EXISTS audit_mirror_kill_switch() CASCADE;
DROP FUNCTION IF EXISTS prevent_audit_row_modify() CASCADE;
```
(= trigger も CASCADE で同時 drop)

**依存**: なし (= 独立)

**Application 依存**: CoAlter Mirror Channel kill switch L3 foundation。 production 上で Mirror がまだ動作開始していない (= Phase E-2-α 未着手) ため、 apply 時点で application 動作影響なし。 `enabled=true` seed は安全 (= Mirror が読みに来ない)。

**設計的特徴**:
- service_role は RLS bypass (= Supabase canon、 operator-only operation table として設計)
- audit は tamper-evident (= immutability trigger、 通常 SQL 経路で改ざん不能)
- SECURITY DEFINER function は `search_path` 固定 (= CEO 補正 #3 反映済)

---

## §2. 適用順 (= 確定)

### §2.1 採用順序 — **依存順** (= Scenario β、 readiness §4 整合)

| Step | File | 根拠 |
|------|------|------|
| **Step 1** | `20260430100100_external_anchors.sql` | base table (= P3 foundation)、 File 2 の前提 |
| **Step 2** | `20260519100000_create_external_anchor_bundle.sql` | File 1 依存、 完全冪等で確実 |
| **Step 3** | `20260430110100_plan_drift_events.sql` | 独立、 application 参照 0 件で影響なし |
| **Step 4** | `20260520120000_coalter_mirror_app_settings.sql` | 独立、 production Mirror 未稼働 |

### §2.2 timestamp 順との差分 (= 許容根拠)

timestamp 順は `20260430100100 → 20260430110100 → 20260519100000 → 20260520120000` (= Step 1 → 3 → 2 → 4)。 採用 (= 依存順) は Step 1 → 2 → 3 → 4。 schema_migrations は version 列を PK として持つが、 INSERT 順は順不同 (= `ORDER BY version` で読み出し時に history が並ぶ)。 したがって **適用順は依存順優先**、 **history 表示は version 順** で両立。

### §2.3 不採用順序とその理由

- **timestamp 順** (= 1 → 3 → 2 → 4): File 2 (bundle) を Step 3 後に置くと foundation 完成が遅れる。 P3 機能の base がアトミックに完成しない (= operator perception の劣化、 致命ではないが採用しない)
- **逆順 / random**: 依存違反 (= File 2 の前提 not satisfied)、 採用不可

---

## §3. 各 Step の確認 SQL

### §3.0 共通 Pre-flight SQL (= Step 1 着手直前、 全 4 file 不在再確認)

```sql
-- production 不在期待値再確認 (= w1z runbook §2 sanity check 拡張)
SELECT
  'external_anchor_sources' AS table_name,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'external_anchor_sources') AS exists
UNION ALL
SELECT 'external_anchors',
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'external_anchors')
UNION ALL
SELECT 'create_external_anchor_bundle (function)',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_external_anchor_bundle')
UNION ALL
SELECT 'plan_drift_events',
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'plan_drift_events')
UNION ALL
SELECT 'app_settings',
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'app_settings')
UNION ALL
SELECT 'coalter_mirror_kill_switch_audit',
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'coalter_mirror_kill_switch_audit');

-- 期待: 全 6 行 exists = false
```

**1 つでも `exists = true` なら**: 即停止 → CEO 報告 (= 別 process で部分 apply された可能性、 慎重判断)

### §3.1 Step 1 後 verify (`external_anchors.sql`)

```sql
-- 検証 1-1: 2 table 存在 + RLS 有効
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('external_anchor_sources', 'external_anchors')
ORDER BY tablename;
-- 期待: 2 行、 rls_enabled = true × 2

-- 検証 1-2: RLS policy 数 (= 4 × 2 table = 8)
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('external_anchor_sources', 'external_anchors')
GROUP BY tablename
ORDER BY tablename;
-- 期待: external_anchor_sources = 4, external_anchors = 4

-- 検証 1-3: CHECK 制約 (= external_anchors discriminated union)
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.external_anchors'::regclass
  AND contype = 'c'
ORDER BY conname;
-- 期待: anchor_kind_one_off_columns / anchor_kind_recurring_columns /
--       validity_window_order / recurrence_rule_length /
--       location_category check / rigidity check / sensitive_category check /
--       anchor_kind check / confidence check 等

-- 検証 1-4: indexes (= 2 + 3 = 5)
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('external_anchor_sources', 'external_anchors')
ORDER BY tablename, indexname;
-- 期待: external_anchor_sources_pkey + 2 idx_*、 external_anchors_pkey + 3 idx_*

-- 検証 1-5: schema_migrations INSERT 確認 (= 後で手動 INSERT、 §6 参照)
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260430100100';
-- 期待: 1 行
```

### §3.2 Step 2 後 verify (`create_external_anchor_bundle.sql`)

```sql
-- 検証 2-1: function 存在 + SECURITY mode
SELECT proname, prosecdef AS is_security_definer, pronargs AS arg_count
FROM pg_proc WHERE proname = 'create_external_anchor_bundle';
-- 期待: 1 行、 is_security_definer = false (= SECURITY INVOKER)、 arg_count = 3

-- 検証 2-2: permissions
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'create_external_anchor_bundle'
ORDER BY grantee;
-- 期待: authenticated = EXECUTE、 PUBLIC は REVOKE 済 (= 表示なし)

-- 検証 2-3: schema_migrations INSERT
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260519100000';
-- 期待: 1 行
```

### §3.3 Step 3 後 verify (`plan_drift_events.sql`)

```sql
-- 検証 3-1: table 存在 + RLS 有効
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'plan_drift_events';
-- 期待: 1 行、 rls_enabled = true

-- 検証 3-2: RLS policy 数 (= 3、 UPDATE 意図的不在)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'plan_drift_events'
ORDER BY policyname;
-- 期待: 3 行 (select / insert / delete)、 update 不在

-- 検証 3-3: CHECK 制約
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.plan_drift_events'::regclass AND contype = 'c'
ORDER BY conname;
-- 期待: target_type / drift_type / evidence_source / evidence_strength /
--       repetition_count / time_window_days /
--       target_snapshot_is_object / predicted_is_object / actual_is_object

-- 検証 3-4: indexes (= 3 + pkey = 4)
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'plan_drift_events'
ORDER BY indexname;
-- 期待: plan_drift_events_pkey + idx_*_user_created + idx_*_target + idx_*_user_pattern

-- 検証 3-5: schema_migrations INSERT
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260430110100';
-- 期待: 1 行
```

### §3.4 Step 4 後 verify (`coalter_mirror_app_settings.sql`)

```sql
-- 検証 4-1: 2 table 存在 + RLS 有効
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('app_settings', 'coalter_mirror_kill_switch_audit')
ORDER BY tablename;
-- 期待: 2 行、 rls_enabled = true × 2

-- 検証 4-2: seed row
SELECT key, value, updated_at FROM app_settings WHERE key = 'mirror_channel_enabled';
-- 期待: 1 行、 value = {"enabled": true}

-- 検証 4-3: trigger 存在 (= 3 個)
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name IN ('mirror_kill_switch_audit_trigger',
                       'prevent_audit_update_trigger',
                       'prevent_audit_delete_trigger')
ORDER BY trigger_name;
-- 期待: 3 行

-- 検証 4-4: function 存在 (= 2 個)
SELECT proname FROM pg_proc
WHERE proname IN ('audit_mirror_kill_switch', 'prevent_audit_row_modify')
ORDER BY proname;
-- 期待: 2 行

-- 検証 4-5: immutability test (= 失敗するべき、 read-only でも実行不可)
-- 注: production では実行不要。 staging で検証済 (= R3 完走で全 trigger 機能確認済)。

-- 検証 4-6: schema_migrations INSERT
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260520120000';
-- 期待: 1 行

-- 検証 4-7 (= 全体最終): 4 file 全部 schema_migrations
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20260430100100', '20260430110100',
                  '20260519100000', '20260520120000')
ORDER BY version;
-- 期待: 4 行
```

### §3.5 最終 staging-production 同期確認

```sql
-- production side で実行 (R4 完了確認):
SELECT COUNT(*) AS row_count FROM supabase_migrations.schema_migrations;
-- 期待: 177 (= staging と完全一致)
```

---

## §4. 停止条件

### §4.1 全 Step 共通停止条件

即停止 + CEO 報告:
1. Pre-flight SQL (§3.0) で `exists = true` が 1 つでも検出 → 部分 apply 既存兆候
2. SQL Editor で `ERROR:` が出力された (= ERRCODE 何でも)
3. verify SQL の期待値と実際値が乖離
4. `INSERT INTO supabase_migrations.schema_migrations` が duplicate key violation (= 既存 version 衝突)
5. CEO の中断判断 (= 任意のタイミングで)
6. session が一時切断 / SQL Editor が反応しない

### §4.2 各 Step 固有停止条件

#### Step 1 (`external_anchors.sql`) 固有

- `policy "external_anchor_sources_owner_*" already exists` → 二重 apply 兆候、 即停止 → §5.1 Rollback 検討
- `relation "external_anchor_sources" already exists` 警告 + index error → table のみ既存、 index 不在 = 修復不能、 即停止
- CHECK 制約 violation (= SQL 自体は INSERT しないので発生しないはず、 もし発生したら異常)

#### Step 2 (`create_external_anchor_bundle.sql`) 固有

- File 1 未適用状態で File 2 を apply → `relation "external_anchor_sources" does not exist` で fail → Step 1 完了確認漏れ、 即停止
- function 既存と動作差異 (= prosrc 比較で診断) → CEO 確認

#### Step 3 (`plan_drift_events.sql`) 固有

- File 1 と類似 (= INDEX / POLICY 非冪等)
- 単独で独立 apply 可能、 二重 apply 兆候時は即停止

#### Step 4 (`coalter_mirror_app_settings.sql`) 固有

- `BEGIN; ... COMMIT;` wrap により部分失敗時は **全 statement rollback** (= partial state 残らない)
- TRIGGER 既存検出 → 二重 apply 兆候、 即停止
- INSERT INTO app_settings の `ON CONFLICT DO NOTHING` で seed が既存 → 警告のみ、 継続可能

### §4.3 既存 runbook との関係

`docs/alter-plan-w1z-production-migration-apply-runbook.md` §4 Rollback の停止条件 + §3 verify SQL を基盤として、 本 Step 0 はその上に 4 file 専用の停止条件を追加する形。 重複箇所は本 doc を優先 (= 新しい)。

---

## §5. Rollback SQL

### §5.1 各 file 個別 rollback

**Step 1 rollback** (= `external_anchors.sql`):
```sql
DROP TABLE IF EXISTS external_anchors CASCADE;
DROP TABLE IF EXISTS external_anchor_sources CASCADE;
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260430100100';
```

**Step 2 rollback** (= `create_external_anchor_bundle.sql`):
```sql
DROP FUNCTION IF EXISTS create_external_anchor_bundle(UUID, JSONB, JSONB);
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260519100000';
```

**Step 3 rollback** (= `plan_drift_events.sql`):
```sql
DROP TABLE IF EXISTS plan_drift_events CASCADE;
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260430110100';
```

**Step 4 rollback** (= `coalter_mirror_app_settings.sql`):
```sql
DROP TABLE IF EXISTS coalter_mirror_kill_switch_audit CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP FUNCTION IF EXISTS audit_mirror_kill_switch() CASCADE;
DROP FUNCTION IF EXISTS prevent_audit_row_modify() CASCADE;
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260520120000';
```

### §5.2 全体 emergency rollback (= 4 file 全 undo)

```sql
-- File 4 (= app_settings + audit + triggers)
DROP TABLE IF EXISTS coalter_mirror_kill_switch_audit CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP FUNCTION IF EXISTS audit_mirror_kill_switch() CASCADE;
DROP FUNCTION IF EXISTS prevent_audit_row_modify() CASCADE;

-- File 3 (= plan_drift_events)
DROP TABLE IF EXISTS plan_drift_events CASCADE;

-- File 2 (= function)
DROP FUNCTION IF EXISTS create_external_anchor_bundle(UUID, JSONB, JSONB);

-- File 1 (= external_anchors + external_anchor_sources、 順序重要 = anchors → sources)
DROP TABLE IF EXISTS external_anchors CASCADE;
DROP TABLE IF EXISTS external_anchor_sources CASCADE;

-- schema_migrations cleanup
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20260430100100', '20260430110100',
                  '20260519100000', '20260520120000');
```

### §5.3 Rollback 実行条件

- ERROR 発生 + 状態が想定外 → CEO 判断後 Rollback
- 全 Step 完了後に application 不具合発覚 → CEO 判断後 Rollback
- 部分 apply で history mismatch 発生 → 該当 Step 単独 Rollback

---

## §6. schema_migrations への手動 INSERT 手順

Scenario β (= Dashboard 個別 SQL Editor) では、 SQL Editor から DDL apply 後に **手動で** `schema_migrations` への INSERT が必要。 CLI 経由 (`supabase db push`) と異なり、 自動 INSERT は発生しない。

### §6.1 各 Step apply 直後の INSERT 文

各 Step の SQL Editor 実行直後に同 Editor で実行:

**Step 1 INSERT**:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20260430100100',
  'external_anchors',
  '{}'::jsonb  -- 注: w1z runbook の慣例で空 jsonb。 詳細 statements は file に保存済。
);
```

**Step 2 INSERT**:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260519100000', 'create_external_anchor_bundle', '{}'::jsonb);
```

**Step 3 INSERT**:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260430110100', 'plan_drift_events', '{}'::jsonb);
```

**Step 4 INSERT**:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260520120000', 'coalter_mirror_app_settings', '{}'::jsonb);
```

### §6.2 INSERT 失敗時の対応

- `duplicate key value violates unique constraint "schema_migrations_pkey"` → version 既登録、 即停止 (= 別 process で apply 済の可能性、 CEO 報告)
- column type mismatch → schema_migrations の column 構造を staging で `SELECT * FROM information_schema.columns WHERE table_name = 'schema_migrations'` で再確認

### §6.3 statements column の値

w1z runbook 既存パターン: `statements = '{}'::jsonb` (= 空 jsonb で OK、 supabase CLI も同様の minimal INSERT)

詳細 statements は migration file (= repo) に保存済、 schema_migrations 上では version + name の trace のみ。

---

## §7. Step 0 完了基準

本 Step 0 は次の 5 条件すべて満たせば完了:

1. ✅ 4 file 全部の SQL を本 doc § 1 で完全レビュー
2. ✅ 適用順 (= 依存順、 Step 1→4) を §2 で確定
3. ✅ 各 Step の verify SQL を §3 で確定
4. ✅ 停止条件 (= 共通 + 各 file 固有) を §4 で確定
5. ✅ Rollback SQL (= 個別 + 全体) を §5 で確定 + schema_migrations 手動 INSERT を §6 で確定

→ **5 条件すべて満たした**。 本 doc は CEO レビュー → 承認 → R4 Step 1 (= production への実 apply) に進める状態。

---

## §8. 既存 runbook との差分 (= 補完情報)

`docs/alter-plan-w1z-production-migration-apply-runbook.md` は File 1 (`external_anchors.sql`) と File 2 (`create_external_anchor_bundle.sql`) の Dashboard SQL Editor 手順を 2 ファイル分提供している。 本 Step 0 doc は:

- ✅ 既存 runbook の File 1 / File 2 手順を継承
- ✅ File 3 / File 4 の新規詳細手順を追加
- ✅ 4 file 全体としての適用順・停止条件を統合
- ✅ Pre-flight (= §3.0) を 4 file 範囲に拡張

新規施策: なし (= 既存設計を素直に拡張)。

---

## §9. 関連 doc

- `docs/alter-plan-migration-debt-stage-r3-result.md` (前 Step 完了固定)
- `docs/alter-plan-migration-debt-stage-r4-production-apply-readiness.md` (R4 readiness、 本 Step 0 の親)
- `docs/alter-plan-w1z-production-migration-apply-runbook.md` (File 1 / File 2 の元手順)
- `docs/alter-plan-foundation-design.md` (File 1 / File 3 の設計根拠 §2.0-§2.5 / §11 / §12)
- `docs/alter-plan-w1y-rpc-atomicity-mini-design.md` (File 2 の設計根拠)
- `docs/coalter-aoo-phase-e2-0-sequencing.md` §5 / §6 (File 4 の設計根拠)
- `docs/coalter-aoo-phase-e2-1a-migration-runbook.md` (File 4 の既存 runbook、 内容包含)

---

## §10. CEO レビュー判断 4 点 (= Step 1 着手前)

1. **適用順** (= §2 依存順 Step 1→2→3→4): 採用 OK か (= timestamp 順との差分根拠 §2.2)
2. **verify SQL** (= §3): カバレッジ十分か、 過剰なら削減指示
3. **停止条件** (= §4): 抜けがないか、 緩い箇所はないか
4. **Rollback / schema_migrations 手動 INSERT** (= §5 / §6): w1z runbook 既存パターンと整合 OK か

→ 4 点 CEO 確定後、 R4 Step 1 (= File 1 apply、 SQL Editor 手順) に進む。
