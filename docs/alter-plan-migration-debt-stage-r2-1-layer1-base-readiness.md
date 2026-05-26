# Stage R2-1 — Layer 1 Core Base 補完 Migration 起草 Readiness

**起草日**: 2026-05-26
**起草者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → `migration-debt-repair` → Stage R2-redesign → R2-1
**現 branch**: `feat/migration-debt-phase-readiness`
**status**: CEO 承認待ち（着手前停止）
**先行**:
- Stage R1 audit 完了（prod-only 154 件確定）
- Stage R2-0 完了（Layer 1 候補確定 6 件、 CEO L1-standard 採用 2026-05-26）
**後続**:
- Stage R2-2-A 〜 Q（Layer 2 機能群、 17 sub-stage）
- Stage R2-3（Layer 3 small prefix）
- Stage R3（staging リセット + 一括 push 検証）

---

## §0 — Stage 定義 / 範囲

### 何をするか

Layer 1（core application base）6 件の **補完 migration file を起草** する。

具体的:
1. production から各 6 table の DDL を **個別** pg_dump -t で抽出（read-only）
2. 抽出結果を sanitize（OWNER / publication 行除去、 IF NOT EXISTS 保証）
3. 単一 migration file として起草: `supabase/migrations/20260101000000_layer1_core_base.sql`
4. 起草 file を commit
5. **staging 検証は Stage R3 で一括**（本 sub-stage では実施しない）

### 何をしないか

- ❌ Layer 2 / 3 の table に触らない
- ❌ staging に push しない
- ❌ production schema を変更しない（read-only 抽出のみ）
- ❌ 既存 172 migration file を delete / rename しない
- ❌ 個別 staging 検証しない（Stage R3 で一括）

### Layer 1 確定 6 件（CEO 採用 L1-standard 2026-05-26）

| # | name | `.from()` | files | category |
|---|---|---|---|---|
| 1 | profiles | 44 | 69 | core user |
| 2 | shops | 35 | 60 | core commerce |
| 3 | notifications | 13 | 28 | core notification（既知 Stage B1） |
| 4 | orders | 13 | 7 | core commerce |
| 5 | conversations | 5 | 16 | core messaging |
| 6 | messages | 3 | 90 | core messaging |

---

## §1 — 前提

### 1.1 確定事実（Stage R1 / R2-0 から）

- 6 件全てが **prod-only**（production 実在、 repo CREATE 文不在）
- 6 件全てが application code で active 利用中（.from() ≥ 3）
- 補完 file は `20260101*` 系で **既存 172 file より前置**
- application code 内 reference は全 lowercase `<table_name>` で query

### 1.2 補完 file の役割

- staging を完全初期化したとき（Stage R3）、 既存 172 file より前に apply される
- → Layer 1 6 table が staging に作成される
- → その後 172 file の中の ALTER / INDEX / FK 等が動作可能になる
- 例: `20260202100000_notification_preferences.sql` の `ALTER TABLE notifications ADD COLUMN data` が成功する

### 1.3 既存 environment（production）への安全性

- 全 CREATE 文に `IF NOT EXISTS` 必須
- production には既に 6 table 存在 → IF NOT EXISTS で no-op、 安全
- staging には存在しない → CREATE 実行、 期待動作

---

## §2 — 6 件の調査要件

### 2.1 各 table の DDL 構成要素（pg_dump -t 出力に含まれる）

`pg_dump --schema-only --no-owner --no-publications -t public."<name>"` で取得される内容:

| 要素 | 含まれるか | 用途 |
|---|---|---|
| `CREATE TABLE` | ✅ | core |
| column definitions（type / NOT NULL / DEFAULT） | ✅ | core |
| PRIMARY KEY | ✅ | core |
| FK references | ✅ | application FK 整合 |
| `CREATE INDEX` | ✅ | パフォーマンス |
| `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` | ✅ | RLS |
| `CREATE POLICY` | ✅ | RLS 制御 |
| `ALTER TABLE ... OWNER` | ❌（`--no-owner` で除去） | 環境差吸収 |
| publication 関連 | ❌（`--no-publications` で除去） | 環境差吸収 |

### 2.2 FK 依存の事前確認（Layer 1 内 / Layer 1 → 既存）

Layer 1 6 件の FK 依存関係は **pg_dump 出力後に確認**:
- Layer 1 内部の FK（例: messages → conversations）→ migration 内の table 順序を調整
- Layer 1 → auth.users（FK）→ supabase auth schema で必ず存在、 問題なし
- Layer 1 → 既存 172 file table の FK → このパターンは想定なし（Layer 1 が base のため）
- 既存 172 file → Layer 1 への FK → 期待される依存方向、 問題なし

### 2.3 想定 anomaly

- 6 件のうち、 column 名が application code と不一致のもの → 動作不全
- production 側の table に手動追加された column が application で期待されない → 想定外
- → DDL 抽出後、 各 table の column を application code（`.from().select(<columns>)`）と突合する検証は **Stage R3 staging push 後**に実施

---

## §3 — 手順（実行案、 CEO 承認後）

### Step 1: Pre-flight

```bash
git branch --show-current  # 期待: feat/migration-debt-phase-readiness
cat supabase/.temp/project-ref  # 期待: aljavfujeqcwnqryjmhl
```

### Step 2: production から 6 table の DDL を個別抽出

```bash
# eval で credential を env に取り出し（sanitize 強化適用）
eval "$(supabase db dump --linked --schema public --dry-run 2>/dev/null | grep -E '^export PG[A-Z]+=')"

# 出力 file
OUT=/tmp/r2-1-layer1-raw.sql
> "$OUT"

# 6 件を個別に pg_dump -t
for table in profiles shops notifications orders conversations messages; do
  echo "" >> "$OUT"
  echo "-- ============================" >> "$OUT"
  echo "-- table: $table" >> "$OUT"
  echo "-- ============================" >> "$OUT"
  pg_dump --schema-only --no-owner --no-publications \
    -t "public.\"$table\"" \
    >> "$OUT" 2>&1
done

# credential を unset
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

# 結果確認（行数 + size）
wc -l "$OUT"
du -h "$OUT"
```

**注意**:
- raw output は credential / OWNER 行 / publication 行を含む可能性
- 次 Step で sanitize

### Step 3: sanitize（OWNER / publication / SET 系の除去）

```bash
# sanitize: pg_dump preamble / comments / OWNER / publication 行を除去し、
# 純粋な CREATE TABLE + INDEX + RLS + POLICY のみ残す
OUT_CLEAN=/tmp/r2-1-layer1-clean.sql
> "$OUT_CLEAN"

# 詳細 sanitize は実装時に決定:
# - `--` で始まる comment 行は保持（context として有用）
# - `SET ...` / `SELECT pg_catalog.set_config(...)` は除去
# - `ALTER TABLE ... OWNER TO` は除去（既に --no-owner で除去済の想定だが念のため）
# - `CREATE PUBLICATION` / `ALTER PUBLICATION` は除去
# - `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS` に変換（pg_dump v17 が IF NOT EXISTS を出すか確認、 出さなければ sed で変換）
# - `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS` 同様
# - `CREATE POLICY` → `DROP POLICY IF EXISTS ... CASCADE; CREATE POLICY ...` の安全 pattern（既存 environment への影響回避）
```

### Step 4: 補完 migration file の構築

```bash
# 最終 file
FINAL=supabase/migrations/20260101000000_layer1_core_base.sql

# Header コメント
cat > "$FINAL" <<'HEADER'
-- =============================================================================
-- Layer 1 Core Application Base — 補完 migration
-- =============================================================================
-- 起草日: 2026-05-26
-- 親 phase: migration-debt-phase → migration-debt-repair → Stage R2-1
-- CEO 承認: 2026-05-26 (L1-standard 採用)
--
-- 6 table: profiles, shops, notifications, orders, conversations, messages
--
-- 起源:
--   production に Supabase Studio 経由で手動構築された base schema を
--   repo に補完するもの。pg_dump --schema-only --no-owner --no-publications
--   による個別 -t 抽出を sanitize して作成。
--
-- 安全性:
--   全 CREATE 文に IF NOT EXISTS 必須。production には既に table 存在のため
--   no-op、 staging（base 不在）には CREATE 実行。
--
-- 関連 doc:
--   docs/alter-plan-migration-debt-stage-r2-redesign-readiness.md §2.1
--   docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md
-- =============================================================================
HEADER

# sanitized SQL を append
cat "$OUT_CLEAN" >> "$FINAL"

# 確認
wc -l "$FINAL"
head -20 "$FINAL"
```

### Step 5: 構文確認（実行はしない）

```bash
# psql --syntax-check（実行はしない、 構文のみ）
# ※ psql には --syntax-check flag なし、 代替:
# - psql -c "BEGIN; ... ROLLBACK;" のような pattern でも production に接続するので NG
# - 代替: file を grep で簡易 check（`CREATE TABLE`、 `IF NOT EXISTS` 必須性）

grep -c "CREATE TABLE IF NOT EXISTS" supabase/migrations/20260101000000_layer1_core_base.sql
# 期待: 6

grep -c "CREATE INDEX IF NOT EXISTS" supabase/migrations/20260101000000_layer1_core_base.sql
# 期待: 多数（各 table の index 数）

grep -c "OWNER TO" supabase/migrations/20260101000000_layer1_core_base.sql
# 期待: 0
```

### Step 6: tmp file cleanup

```bash
rm -f /tmp/r2-1-layer1-raw.sql /tmp/r2-1-layer1-clean.sql
```

### Step 7: commit（CEO 承認後）

```bash
git add supabase/migrations/20260101000000_layer1_core_base.sql
git add docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md
git commit -m "<message>"
```

### Step 8: Stop R2-1 報告 + Stage R2-2-A 着手判断仰ぐ

---

## §4 — 補完 migration file 設計

### 4.1 ファイル名 / timestamp

- file: `supabase/migrations/20260101000000_layer1_core_base.sql`
- timestamp `20260101000000` は **既存最古 migration（`20260202010849`）より前置**
- Stage R2-2-A 以降の補完 file は `20260101010000`, `20260101020000`, ... と alphabetical 順で続ける

### 4.2 file 内 table 順序

FK 依存に従う順序（pg_dump -t 出力をそのまま順序維持で十分 / 確認は実装時）:
- conversations → messages（messages.conversation_id FK の可能性）
- profiles → orders（orders.user_id FK の可能性）
- profiles → notifications（同上）
- profiles → shops（shop owner FK の可能性）
- 上記 1-4 は **pg_dump 出力で判明**、 実装時に並び順を決定

### 4.3 RLS / POLICY の扱い

production の RLS が active なら、 補完 file にも `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` を含める。
ただし **既存 environment（production）には既に同名 policy がある可能性**:
- pg_dump 出力の `CREATE POLICY` をそのまま使うと既存と衝突 → error
- 対策: `DROP POLICY IF EXISTS ... CASCADE;` を `CREATE POLICY` 前に挿入（既存環境への安全 pattern）

または、 `CREATE POLICY IF NOT EXISTS` が PostgreSQL でサポートされていないため、 上記 DROP + CREATE pattern が必要。

### 4.4 expected file size

- 6 table × 各 50-100 行（CREATE TABLE + index + RLS + policy）= 300-600 行
- 過去経験では `notifications` の DDL は 30 行程度（前 forensic で確認）

---

## §5 — 不変原則

| # | 原則 | 違反検出方法 |
|---|---|---|
| 1 | **production schema を変更しない**（read-only のみ） | linked ref + SQL audit |
| 2 | **staging を touch しない** | linked ref に staging 不在 |
| 3 | **既存 172 migration file を delete / rename しない** | git diff |
| 4 | **補完 file は IF NOT EXISTS 必須** | grep |
| 5 | **OWNER / publication 行除去**（`--no-owner --no-publications` flag + grep 確認） | grep |
| 6 | **個別 -t 抽出のみ**（全 schema dump 禁止） | command audit |
| 7 | **credential を画面 / log に出さない**（sanitize 強化） | command output 確認 |
| 8 | **DROP POLICY IF EXISTS** で既存 policy 衝突回避 | grep |
| 9 | **自律 migration repair / push 禁止** | command log |
| 10 | tmp file cleanup（commit 前 / 後） | ls /tmp/r2-1-* |

---

## §6 — 開始条件 / Stop point

### 開始条件

- ✅ Stage R1 audit 完了（result doc 起草済 commit）
- ✅ Stage R1.5 result 起草済 commit（α-later 維持確定）
- ✅ Stage R2-redesign readiness §2 で Layer 1 6 件確定（CEO 2026-05-26）
- ✅ linked: aljavfujeqcwnqryjmhl（production, read-only）
- ✅ branch: feat/migration-debt-phase-readiness
- ✅ sanitize 強化適用済

### Stop point

| Stop | 位置 | CEO 判断対象 |
|---|---|---|
| **Stop J** | 本 readiness 起草完了直後 | Stage R2-1 着手 GO / 補正 / 中止 |
| **Stop R2-1** | 補完 file 起草完了直後 | 内容承認 + commit + Stage R2-2-A 着手判断 |

---

## §7 — Risk

| risk | 影響 | 緩和策 |
|---|---|---|
| pg_dump -t で FK 依存が含まれない | 後 INSERT で FK error | Stage R3 staging 検証で発覚、 R2 内で順序調整 |
| pg_dump v17 が `CREATE TABLE` に `IF NOT EXISTS` を含まない | production no-op が破綻 | sed で `CREATE TABLE "` → `CREATE TABLE IF NOT EXISTS "` 変換 |
| pg_dump v17 が `CREATE POLICY` に `IF NOT EXISTS` 同等 flag を含まない | 既存環境で重複 error | DROP POLICY IF EXISTS pattern を sed 挿入 |
| RLS が変則的（security_definer 関数依存） | clean environment で関数 missing | Stage R3 staging で発覚、 必要なら次 sub-stage で関数補完 |
| FK 先 table が Layer 2/3 にある | clean apply 不可 | 想定なし、 Layer 1 は base なので FK 先は auth.users のみと想定。 実装時に確認 |
| 補完 file が timestamp 衝突 | apply 順序破綻 | `20260101000000` は既存最古より前、 衝突なし |
| credential 漏洩 | sanitize 強化違反 | eval + unset、 raw 出力非表示 |
| 6 件中で FK 依存順序が複雑 | apply order error | pg_dump 出力後に DAG 分析、 order を調整 |

---

## §8 — 数字 / 事実 unify

| item | 値 |
|---|---|
| Layer 1 確定件数 | 6 |
| 補完 file 1 件起草 | `20260101000000_layer1_core_base.sql` |
| timestamp | 20260101000000 |
| 出典 DDL 取得方法 | pg_dump --schema-only --no-owner --no-publications -t public."<name>" |
| sanitize 適用 | OWNER / publication / SET 系除去 + IF NOT EXISTS 化 + DROP POLICY IF EXISTS pattern |
| 推定 file 行数 | 300-600 行 |
| staging 検証 | Stage R3 で一括（本 sub-stage では実施しない） |

---

**Stop J** — 本 readiness 起草完了。

CEO 判断仰ぐ:
- **A**: Stage R2-1 着手 GO（§3 Step 1-8 実行 → 補完 file 起草 → Stop R2-1）
- **B**: 補正後着手（手順 / sanitize 方針 / FK 順序 / 等）
- **C**: 一旦延期

判断後、 Stage R2-1 を実行 or 補正します。
