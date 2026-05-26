# Stage R3 Bulk Audit Result — 既存 relation 前提操作の一括棚卸

起草日: 2026-05-27
親 phase: migration-debt-phase → migration-debt-repair → Stage R3
CEO 確定: 2026-05-27 (B base、 限定 bulk audit)

---

## §1. Method

走査範囲: `supabase/migrations/*.sql` (= **176 file**、 仕様文面の「177」 は概数)

対象 operation (相手 relation が既に存在することを前提とする全種):
- `ALTER TABLE <name>` (ADD/DROP/RENAME COLUMN、 ADD CONSTRAINT、 ALTER COLUMN TYPE、 RENAME TO 等)
- `UPDATE <name> SET` / `INSERT INTO <name>` / `DELETE FROM <name>`
- `CREATE [UNIQUE] INDEX ... ON <name>`
- `CREATE POLICY ... ON <name>`
- `CREATE [OR REPLACE] [CONSTRAINT] TRIGGER ... ON <name>`
- `COMMENT ON COLUMN <name>.col` / `COMMENT ON TABLE <name>`
- `DROP TABLE <name>` (= drift signal)

除外:
- `CREATE TABLE` 本体 (= 自前で relation を新規作成、 前提不要)
- `CREATE FUNCTION` / `CREATE TYPE` / `CREATE EXTENSION` (= relation 以外)
- `ALTER TABLE IF EXISTS …` / `DROP TABLE IF EXISTS …` (= idempotent guard)
- `DO $$ … END $$;` block 内の全 statement (= `IF EXISTS` guard 等で wrap されているため idempotent、 prereq 不要扱い)
- 行頭 `--` line comment
- `storage.*` schema (= Supabase built-in、 public schema 外)
- 既存 prereq 4 file (走査対象に含めるが、 既知 prereq として参照のみ):
  - `20251229000000_layer1_prereq_tables.sql`
  - `20251231000000_layer1_base_functions.sql`
  - `20260101000000_layer1_minimal_base.sql`
  - `20260324190000_user_style_vector_prereq.sql`

機械走査: Python regex で全 176 file を AST-light scan。 DO block は dollar-quoted tag (`$$` or `$tag$`) で region 検出してから offset mask、 その後で op-pattern を走査。 line comment も同様に mask。 詳細は本 doc 末尾 §7 (Method note) 参照。

---

## §2. Summary

| 指標 | 値 |
|------|---|
| 走査対象 migration | **176 file** |
| 対象 operation 総数 (= 抽出後) | **1,197 件** |
| 抽出された unique relation | **256 件** |
| `CREATE TABLE` を repo 内に持つ relation | **255 件** (1 件は `storage` schema 参照のため public CREATE 不在は仕様) |
| **prereq 必要 (= NO_CREATE)** | **1 件** |
| prereq 不要 (= CREATE 同一/先行 file or `IF EXISTS` idempotent wrap) | **254 件** |
| drift あり (rename / drop / type change、 全て `DO $$ IF EXISTS $$` guard 内) | **1 件 grouping** (= constellation→archetype rename 1 migration) |

要旨: 既知 8 件 (Layer 1 七つ + `user_style_vector`) の prereq 化 + 今回の **stargazer_axis_scores** のみで repo 全 migration の前提 relation は飽和する。 Layer 2 以降の bulk discovery は不要。

---

## §3. Prereq 必要一覧 (= 新規追加対象)

| # | Table | 最初の参照 migration | Operation | CREATE の有無 | CREATE 位置 | Historical-shape source | 推奨 prereq timestamp |
|---|-------|----------------------|-----------|---------------|------------|--------------------------|----------------------|
| 1 | `stargazer_axis_scores` | `20260407200000_frozen_axis_migration.sql` | `UPDATE` (× 2 block) | **無** | — | UPDATE 構造から完全推測可: `user_id uuid` + `axis_id text` + `score numeric`。 同一 user × axis を `WHERE user_id = … AND axis_id = …` で 1 行特定する用法。 production の Studio 手動 DDL が既存と推定。 application side では `lib/stargazer/microEMABridge.ts` 等が localStorage で同 schema を扱う (= shape 整合) | `20260407190000_stargazer_axis_scores_prereq.sql` |

### §3-A. `stargazer_axis_scores` shape 推測の根拠

- L18-36 (block 1): `UPDATE stargazer_axis_scores SET score = (COALESCE((SELECT score FROM stargazer_axis_scores AS ba WHERE ba.user_id = … AND ba.axis_id = 'boundary_awareness') * 0.7 + … (axis_id='boundary_respect') * 0.3, stargazer_axis_scores.score)) WHERE axis_id = 'boundary_awareness' AND EXISTS (… axis_id='boundary_respect' …);`
- L44-73 (block 2): 同形式で `axis_id IN ('control_tendency','pressure_risk','exclusivity_pressure')` を統合
- 確定 column:
  - `user_id` (UUID と推定、 join key)
  - `axis_id` (text、 boundary_awareness / boundary_respect / control_tendency / pressure_risk / exclusivity_pressure 等が観測値)
  - `score` (numeric / double precision、 0.0-1.0 系統と推定だが migration 内で範囲制約なし)
- PK 候補: `(user_id, axis_id)` (= 同 user × 同 axis を一意に subquery で参照しているため)
- 補助 column (optional): `updated_at timestamptz` (= 観測ログ系として一般的、 production shape 不明のため CREATE 文には含めず `IF NOT EXISTS` で最小形のみ保証)

推奨 prereq 文構造 (= 後段で別 file 起草):
```sql
CREATE TABLE IF NOT EXISTS "public"."stargazer_axis_scores" (
  user_id uuid NOT NULL,
  axis_id text NOT NULL,
  score double precision,
  PRIMARY KEY (user_id, axis_id)
);
```
※ production / staging には既存テーブル shape が存在するため、 `IF NOT EXISTS` でこの 1 file は no-op となる想定 (= Layer 1 prereq と同じ方針)。

---

## §4. Prereq 不要一覧 (= 既に正しく解決)

### §4-A. 既存 prereq でカバー済 (= 履歴上の手動 production 作成を補完済)

| Table | 最初の ALTER/INDEX 参照 | 補完した prereq | 状態 |
|-------|------------------------|------------------|------|
| `profiles` | 20260101000000 (同一 file 内 CREATE と共存) | 20251229000000 | OK |
| `app_admins` | — | 20251229000000 | OK |
| `notifications` | 20260101000000 | 20260101000000 (Layer 1 Minimal Base) | OK |
| `stargazer_profiles` | 20260101000000 | 20260101000000 | OK |
| `stargazer_observations` | 20260101000000 | 20260101000000 | OK |
| `stargazer_core_star` | 20260101000000 | 20260101000000 | OK |
| `stargazer_resolved_types` | 20260101000000 | 20260101000000 | OK |
| `stargazer_orbit_snapshots` | 20260101000000 | 20260101000000 | OK |
| `user_style_vector` | 20260324200000_rendezvous_appearance_expansion.sql | 20260324190000 | OK |

### §4-B. CREATE が同一 file 内で先行 or 同 file 内に併存

= 248 件。 全て CREATE TABLE が同 file 内に先頭 or 中盤に存在し、 全 ALTER/INDEX 系統がその後に書かれている (= 後続 statement の直前/直後で create が確定する Migration スタイル)。 個別列挙は省略。

### §4-C. CREATE が earlier timestamp の file に既存

= 約 6 件 (`user_style_vector` 等を含む)。 全て fresh reset 時に prior file で CREATE 済。

### §4-D. `IF EXISTS` / DO block で idempotent wrap

= 大量。 走査時に offset mask 済のため count せず。 代表例:
- `20260330200000_rename_constellation_to_archetype.sql`: 全 DROP COLUMN / RENAME COLUMN が `DO $$ IF EXISTS (SELECT 1 FROM information_schema.columns …) $$` で wrap (drift signal 1 件、 §5 で記述)
- `20260420100000_coalter_pair_onboarded.sql:21`: `DROP COLUMN IF EXISTS`
- `20260324200000_rendezvous_appearance_expansion.sql:38`: `DROP COLUMN IF EXISTS appearance_weight_mode`
- 他多数の `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` (= `IF EXISTS` 形ではないが column 追加の冪等性は確保)

### §4-E. `storage.*` schema 参照 (= public schema 外、 prereq 対象外)

| File | Operation |
|------|-----------|
| `20260324210000_talk_media.sql` | `INSERT INTO storage.buckets` + `CREATE POLICY … ON storage.objects` × 2 |
| `20260328100000_identity_verification_bucket.sql` | `INSERT INTO storage.buckets` |

両 file とも Supabase 標準 schema (`storage`) を参照しており、 public schema CREATE TABLE は不要。 fresh reset 時も Supabase migration init で storage schema が用意される前提。

---

## §5. Drift / Rename signals

### §5-A. 検出された drift

| File | 種別 | 詳細 | guard |
|------|------|------|------|
| `20260330200000_rename_constellation_to_archetype.sql` | RENAME COLUMN + DROP COLUMN | `stargazer_core_star` / `stargazer_orbit_snapshots` / `stargazer_resolved_types` の 6 column を `constellation_*` → `archetype_*` に rename + 旧 generated alias を drop | 全 statement が `DO $$ IF EXISTS (SELECT 1 FROM information_schema.columns WHERE …) … END $$;` 形 (= 完全 idempotent) |

`§3` の `stargazer_axis_scores` prereq 文字列定義への影響: **無し** (= 別 table)。

### §5-B. 検出されなかった drift

- `ALTER COLUMN … SET DATA TYPE …` (= 型変換): **0 件**
- `DROP TABLE` (`IF EXISTS` なし): **0 件** (= 一見 `20260430100000_coalter_memory_items_realtime.sql:22` で match したが、 内容は `-- ALTER PUBLICATION supabase_realtime DROP TABLE …` という rollback 手順を記した line comment であり、 実行されない)
- 別 file での同 column の reshape: **0 件**

### §5-C. drift impact 結論

Stage R3 prereq 設計に影響を与える drift は無い。 §3 で起案する 1 file 分のみで R3 push の前提条件は飽和する。

---

## §6. Recommended action

1. **§3 の 1 件分の prereq を 1 atomic commit で追加**
   - 新 file: `supabase/migrations/20260407190000_stargazer_axis_scores_prereq.sql`
   - 内容: `§3-A` 推奨 prereq 文構造 (= `CREATE TABLE IF NOT EXISTS public.stargazer_axis_scores (user_id, axis_id, score, PK)` のみ)
   - timestamp は `20260407200000` の直前 1 分。 既存の Layer 1 / user_style_vector 補完と完全 symmetric な命名・配置。
2. **staging を再 reset (CEO action)**
   - 既存 prereq 4 file + 今回 1 file = 計 5 prereq で fresh reset の前提を補完
3. **再 push 検証 (CEO action)**
   - `supabase db reset --linked` (staging) → 全 177 file (= 176 + 1) push → 完走確認
   - 完走したら同手順を production reset には適用せず、 staging 再 push のみで Stage R3 closeout 候補化
4. **残 drift signal の確認 (任意、 後段)**
   - constellation→archetype rename 1 件は idempotent wrap 済のため別途確認不要。 ただし production 上で `archetype_*` column が既に物理 rename 済か `constellation_*` のまま残っているかは別途確認推奨 (Stage R4 候補)

---

## §7. Method note (= 再現可能性のための補足)

機械走査スクリプトの実行手順 (本 doc 起草時に Python 3 で実行):

1. `find_create_tables(content)`: 全 file から `CREATE TABLE [IF NOT EXISTS] [schema.]name (` の正規表現で table 名と offset を抽出。
2. DO block mask: 各 file について `\bDO\s+\$([a-zA-Z_]*)\$` を先頭から走査、 対応する閉じ tag (`$$` または `$tag$`) を find、 その範囲を boolean mask で「DO block 内」とマーク。 入れ子なしを仮定 (= migration 内では入れ子 DO は実例無し)。
3. line comment mask: `re.finditer(r'--[^\n]*', orig)` で全 line comment 範囲を mask に追加。
4. 7 種類の op pattern を全 file で finditer:
   - ALTER TABLE (skip when group 1 = `IF EXISTS`)
   - UPDATE / INSERT INTO / DELETE FROM
   - CREATE [UNIQUE] INDEX (+ CONCURRENTLY / IF NOT EXISTS variants)
   - CREATE POLICY
   - CREATE [OR REPLACE] [CONSTRAINT] TRIGGER (BEFORE/AFTER/INSTEAD OF)
   - COMMENT ON COLUMN / COMMENT ON TABLE
   - DROP TABLE (skip IF EXISTS)
5. 各 op の offset を mask と照合し、 DO block 内 / comment 内 = 除外。
6. 各 op について `(file, line)` < `(create_file, create_line)` で先行 CREATE を確認。 該当なしを問題候補として収集。
7. `storage.*` および `auth.*` の system schema 参照を最終 filter で除外 (= public schema 外、 prereq 不要)。

問題候補 6 件すべてを §3 / §4-E に正規分類済。
