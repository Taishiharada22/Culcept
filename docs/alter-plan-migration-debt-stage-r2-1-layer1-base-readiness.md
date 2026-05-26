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

### 対象 7 件（CEO 確定 5 回目、 2026-05-26、 L-A 2 + L-B 5 最小補完）

> 旧 6 件（L1-standard, profiles + shops + notifications + orders + conversations + messages）は L-A 2 件 / L-D 4 件 mix と判明 → 修正。
> 新 7 件 = L-A 2 件（Active + Blocker） + L-B 5 件（Stargazer Blocker）。

| # | Layer | name | 依存件数 | category |
|---|---|---|---|---|
| 1 | L-A | profiles | 7 (ALTER 6 + body 1) | core user |
| 2 | L-A | notifications | 2 (ALTER 1 + body 1) | core notification |
| 3 | L-B | stargazer_resolved_types | 6 | Stargazer |
| 4 | L-B | stargazer_core_star | 5 | Stargazer |
| 5 | L-B | stargazer_orbit_snapshots | 4 | Stargazer |
| 6 | L-B | stargazer_profiles | 3 | Stargazer |
| 7 | L-B | stargazer_observations | 2 | Stargazer |

#### L-D 4 件は今回対象外（後段）

- shops, orders, conversations, messages, drops は **non-blocker**
- 既に Step 1-3 で DDL 抽出済（`/tmp/r2-1-{shops,orders,conversations,messages}-table.sql`）だが、 本 sub-stage では使わない
- 別 sub-stage（後段）で application 機能再現用として補完するか判断

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

### Step 3: sanitize ルール表（CEO 補正 2026-05-26、 6 ルール確定）

#### 6 ルール

| # | 対象構文 | sanitize 方針 | 既存環境安全性 |
|---|---|---|---|
| **1** | `CREATE TABLE` | → `CREATE TABLE IF NOT EXISTS` に変換（pg_dump v17 で既に `IF NOT EXISTS` 付与済の場合は no-op） | production no-op、 staging で作成 |
| **2** | `CREATE INDEX` | → `CREATE INDEX IF NOT EXISTS` に変換 | production no-op、 staging で作成 |
| **3** | `ALTER TABLE ... ADD COLUMN` | → `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` に変換 | production no-op、 staging で追加 |
| **4** | `CREATE POLICY` | 存在確認 or `DROP POLICY IF EXISTS "<name>" ON "public"."<table>";` を**前置** | production: 既存と一致なら無害、 staging: 新規作成 |
| **5** | `ALTER TABLE ... ADD CONSTRAINT` | **`pg_constraint` catalog で existence check 後に追加**（**DO $$ EXCEPTION は第一候補にしない**、 CEO 補正） | production 既存 constraint と衝突回避 |
| **6** | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` | そのまま（idempotent） | production / staging で安全 |

#### ルール 5 詳細（pg_constraint existence check pattern）

```sql
-- 例: stargazer_core_star に PK を追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stargazer_core_star_pkey'
      AND conrelid = 'public.stargazer_core_star'::regclass
  ) THEN
    ALTER TABLE "public"."stargazer_core_star"
      ADD CONSTRAINT "stargazer_core_star_pkey" PRIMARY KEY (id);
  END IF;
END $$;
```

**注**: 上記は構造的に `DO $$ ... END $$` block を使うが、 これは `EXCEPTION` catch ではなく `IF NOT EXISTS` check pattern。CEO 補正の意図は「**EXCEPTION 例外捕捉ではなく、 catalog existence check ベース**」。

#### EXCEPTION を使うべき特殊ケース（提案、 要 CEO 判断）

以下は `pg_constraint` で対応できない特殊ケース。 該当した場合に限り EXCEPTION 採用:

| ケース | 理由 |
|---|---|
| 既存 constraint 名が pg_constraint で見つかるが、 定義が異なる | name only check では不十分、 構造比較が必要 |
| catalog 検索が複雑になりすぎる（partial index など） | コストパフォーマンス |

ただし、 **7 件の DDL は標準形** (PK + FK to auth.users + RLS + Policy) の想定。 7 件全てで catalog check で対応可能の見込み。

#### sanitize で除去する pg_dump 副産物

- `SET ...`（session 設定、 不要）
- `SELECT pg_catalog.set_config(...)`（同上）
- `ALTER TABLE ... OWNER TO`（`--no-owner` で除去済の想定、 grep で 0 確認）
- `CREATE PUBLICATION` / `ALTER PUBLICATION`（`--no-publications` で除去済）
- `\restrict` / `\unrestrict` の psql meta command（pg_dump v17 で出力されるため除去）

### Step 3.5: 7 件適用表（ルール × table マトリックス）

| table | R1 CT | R2 INDEX | R3 ADD COLUMN | R4 POLICY | R5 ADD CONSTRAINT | R6 ENABLE RLS |
|---|---|---|---|---|---|---|
| profiles | ✅ (1) | ✅ (5) | 要 raw 確認 (ALTER 5 件内訳) | ✅ (5) | 要 raw 確認 (PK/FK 数) | ✅ (1 件想定) |
| notifications | ✅ (1) | ✅ (4) | 要 raw 確認 (ALTER 3 件内訳) | ✅ (5) | 要 raw 確認 (PK 数) | ✅ |
| stargazer_resolved_types | ✅ (1) | 0 | 要 raw 確認 (ALTER 5 件内訳) | ✅ (3) | 要 raw 確認 | ✅ |
| stargazer_core_star | ✅ (1) | 0 | 要 raw 確認 (ALTER 4 件内訳) | ✅ (3) | 要 raw 確認 | ✅ |
| stargazer_orbit_snapshots | ✅ (1) | ✅ (1) | 要 raw 確認 (ALTER 4 件内訳) | ✅ (2) | 要 raw 確認 | ✅ |
| stargazer_profiles | ✅ (1) | 0 | 要 raw 確認 (ALTER 5 件内訳) | ✅ (3) | 要 raw 確認 | ✅ |
| stargazer_observations | ✅ (1) | ✅ (3) | 要 raw 確認 (ALTER 4 件内訳) | ✅ (2) | 要 raw 確認 | ✅ |

#### ALTER TABLE 30 件の内訳（要 raw 再確認）

ALTER TABLE 30 件には以下が混在の想定（標準 pg_dump 出力パターン）:
- `ADD CONSTRAINT ..._pkey PRIMARY KEY` （各 1 件 × 7 = 7 件）
- `ADD CONSTRAINT ..._fkey FOREIGN KEY ... REFERENCES "auth"."users"` （各 1 件 × 7 = 7 件、 auth.users 経由のみ）
- `ENABLE ROW LEVEL SECURITY` （各 1 件 × 7 = 7 件）
- その他（ADD COLUMN、 ALTER COLUMN、 OWNER 残存 等） = 残り 9 件 → **要 raw 確認**

**raw 確認が必要な不明点**:
1. ALTER 30 件の正確な内訳（PK / FK / RLS / ADD COLUMN / etc.）
2. POLICY 23 件の `WITH CHECK` / `USING` 句の構造（DROP POLICY IF EXISTS で安全に置換可能か）
3. INDEX 13 件の partial / unique / expression の有無（IF NOT EXISTS で対応可能か）

→ Step 4 sanitize 実施時に **個別 file を Read で 1 件ずつ確認**して確定する。 ここでは設計レベルで止める。

#### EXCEPTION 想定使用箇所

現状: **0 件想定**。pg_constraint catalog check で全 ADD CONSTRAINT を対応可能と判断。 ただし raw 確認で特殊ケースが見つかれば追記。

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

## §4 — 補完 migration file 設計（7 件最小補完）

### 4.1 ファイル名 / timestamp

- file: `supabase/migrations/20260101000000_layer1_minimal_base.sql`
- timestamp `20260101000000` は **既存最古 migration（`20260202010849`）より前置**
- 内容: L-A 2 件 + L-B 5 件 = 7 件の **最小 replay base**
- L-D 5 件は別 sub-stage（後段、 staging 機能再現用）

### 4.2 file 内 table 順序

**7 件相互依存なし**（全て auth.users 経由）→ 順序自由。 ただし慣例的に依存元 → 派生:

1. profiles（L-A、 最大 active）
2. notifications（L-A）
3. stargazer_profiles（Stargazer の user-level entity）
4. stargazer_observations
5. stargazer_core_star
6. stargazer_resolved_types
7. stargazer_orbit_snapshots

各 table block の中で:
- CREATE TABLE → ADD CONSTRAINT PK → ENABLE RLS → CREATE INDEX → CREATE POLICY → ADD CONSTRAINT FK の順
- これは pg_dump v17 標準出力順序

### 4.3 sanitize 詳細（§3 の 6 ルールを適用）

| 構文 | sanitize 後の形 |
|---|---|
| `CREATE TABLE "public"."<t>" (...)` | `CREATE TABLE IF NOT EXISTS "public"."<t>" (...)` |
| `CREATE INDEX "<i>" ON "public"."<t>" ...` | `CREATE INDEX IF NOT EXISTS "<i>" ON "public"."<t>" ...` |
| `ALTER TABLE "public"."<t>" ADD COLUMN ...` | `ALTER TABLE "public"."<t>" ADD COLUMN IF NOT EXISTS ...` |
| `CREATE POLICY "<p>" ON "public"."<t>" ...` | `DROP POLICY IF EXISTS "<p>" ON "public"."<t>";` + 改行 + `CREATE POLICY "<p>" ON "public"."<t>" ...` |
| `ALTER TABLE "public"."<t>" ADD CONSTRAINT "<c>" PRIMARY KEY (...)` | `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '<c>' AND conrelid = 'public.<t>'::regclass) THEN ALTER TABLE "public"."<t>" ADD CONSTRAINT "<c>" PRIMARY KEY (...); END IF; END $$;` |
| `ALTER TABLE "public"."<t>" ADD CONSTRAINT "<c>" FOREIGN KEY ...` | 同上の pg_constraint check pattern |
| `ALTER TABLE "public"."<t>" ENABLE ROW LEVEL SECURITY` | そのまま |

### 4.4 expected file size

- 7 table × 各 50-100 行（CREATE TABLE + sanitize-wrapped ALTER/INDEX/POLICY）= **約 400-700 行**
- 加えて header / footer 等で +50 行
- 想定: **約 500-800 行**

ただし sanitize で `DO $$` block が追加されるため、 raw DDL より若干膨らむ可能性あり。

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
