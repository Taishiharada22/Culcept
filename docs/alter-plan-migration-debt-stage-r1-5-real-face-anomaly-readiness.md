# Stage R1.5 — real_face_sessions Anomaly 単独調査 Readiness

**起草日**: 2026-05-26
**起草者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → `migration-debt-repair` → Stage R1.5
**現 branch**: `feat/migration-debt-phase-readiness`
**status**: CEO 承認待ち（着手前停止）
**先行**: Stage R1 audit 完了（154 件 prod-only + 1 件 anomaly 発覚）
**後続**: 復旧方針確定後、 Stage R2-redesign の Layer 3 / 別 anomaly track として統合

---

## §0 — Stage 定義 / 範囲

### 何をするか

`real_face_sessions` table の **「migration 履歴上 applied + production schema 不在」矛盾** を単独調査する。

具体的:
1. supabase_migrations.schema_migrations 内の `20260319100000` 行を確認
2. production 内の table 不在を再確認
3. 仮説別の検証
4. 復旧オプションを設計
5. CEO 判断仰ぐ

### 何をしないか

- ❌ **code / SQL 変更しない**
- ❌ **production に書き込まない**（read-only 調査のみ）
- ❌ **staging を touch しない**
- ❌ **migration repair / 再実行を自律実行しない**（仮説確定後、 CEO 判断のみ）
- ❌ 154 件の一般ケースを巻き込まない（別 track）

### scope 限定

- 対象: `real_face_sessions` table および `20260319100000_real_face_sessions.sql` migration のみ
- 周辺 anomaly（他に「applied 履歴 vs table 不在」があるか）の網羅調査は **Stage R1.5-b** として別途検討

---

## §1 — 既知事実（Stage R1 audit から）

| 確認項目 | 結果 |
|---|---|
| repo file 存在 | ✅ `supabase/migrations/20260319100000_real_face_sessions.sql` |
| repo file 内 CREATE 文 | ✅ `CREATE TABLE IF NOT EXISTS real_face_sessions (...)`（17 columns 想定） |
| 同 file 内 INDEX / RLS / POLICY | ✅ あり（idx_real_face_sessions_*、 4 policy） |
| production migration list | ✅ `20260319100000` REMOTE 列に timestamp（applied 済） |
| production schema 実在 | ❌ **不在**（psql `pg_tables` query で含まれない） |
| git history DROP TABLE | ❌ 0 件（grep 検索済） |
| 他 migration file での言及 | ❌ なし（この file のみ） |
| 同 commit 内の他 migration | ❌ `ae8fd889 Pre-production release` の中の 1 file（他 migration とは独立） |

---

## §2 — 仮説（4 案）

### 仮説 A: migration repair で applied フラグだけ立てた（最有力）

- 過去に何らかの理由で `20260319100000_real_face_sessions.sql` が apply エラーになった
- CEO または誰かが `supabase migration repair --status applied 20260319100000` を手動実行
- → schema_migrations に row だけ追加、 SQL は実行されず
- 結果: table 不在のまま applied 履歴のみ残存

**根拠**:
- DROP TABLE 痕跡なし
- file 内 SQL は valid（IF NOT EXISTS 等 safety guard あり）
- migration repair は実際の CEO operation log に該当する可能性

### 仮説 B: SQL 実行は成功したが、 後に手動 DROP

- migration apply は成功 → table 作成
- その後 Supabase Studio から手動 DROP TABLE
- DROP は repo に記録されず

**根拠**:
- migration list REMOTE 列に timestamp あり = apply 成功記録
- ただし DROP 操作が repo にも application code にも痕跡なし

### 仮説 C: migration 内 SQL が無効、 silent failure

- file 内 SQL に文法 error / 既存 object 衝突等で実行失敗
- ただし Supabase CLI が「成功」と記録
- 結果: schema_migrations に row、 table 不在

**根拠**:
- ありえる挙動だが、 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` は safe
- 他 file との衝突は確認していない

### 仮説 D: 別 schema で table 作成

- repo file の `CREATE TABLE` に schema prefix なし（`public.` 省略）
- search_path 次第で別 schema（例: `auth`）に作られた可能性
- production の `public` schema には不在だが、 他 schema にある？

**根拠**:
- repo file: `CREATE TABLE IF NOT EXISTS real_face_sessions (...)` ← schema prefix なし
- ただし migration 実行時の search_path は通常 `public` 優先

---

## §3 — 調査手順（実行案、 CEO 承認後）

### Step 1: schema_migrations 直接確認（read-only）

```bash
# linked が production であることを再確認
cat supabase/.temp/project-ref  # 期待: aljavfujeqcwnqryjmhl

# eval で credential を env に取り出し、 psql で schema_migrations 確認
eval "$(supabase db dump --linked --schema public --dry-run 2>/dev/null | grep '^export PG[A-Z]+=')"
psql -A -t -c "
  SELECT version, name, statements
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260319100000'
  LIMIT 1;
" > /tmp/r15-migration-row.txt
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

# 結果確認（要約のみ表示）
wc -l /tmp/r15-migration-row.txt
```

**判定**:
- `statements` column が NULL or empty → 仮説 A（migration repair）強化
- `statements` column に CREATE TABLE SQL 含む → 仮説 B/C/D へ

### Step 2: pg_class / information_schema で他 schema 確認

```bash
# 同様に env eval + psql
eval "$(supabase db dump --linked --schema public --dry-run 2>/dev/null | grep '^export PG[A-Z]+=')"
psql -A -t -c "
  SELECT n.nspname, c.relname, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relname = 'real_face_sessions';
" > /tmp/r15-other-schema-check.txt
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

wc -l /tmp/r15-other-schema-check.txt
```

**判定**:
- 結果 0 行 → 仮説 D 否定、 真不在確定
- 結果 1+ 行 → table は別 schema に存在 = 仮説 D 確定

### Step 3: application code での real_face_sessions 利用確認

```bash
# repo 内で table を query しているコードを確認
grep -rE "real_face_sessions" \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  app/ lib/ components/ 2>/dev/null \
  | head -20
```

**判定**:
- 利用 code が active → table 不在は application 障害
- 利用 code が dormant / dead → 廃止された可能性、 影響軽微

### Step 4: 仮説確定 + 復旧オプション提示

Step 1-3 結果を統合して仮説を確定 → §4 復旧オプションへ。

---

## §4 — 復旧オプション

### Option α: migration repair で applied フラグを reverted に戻す + 通常 apply

```bash
# CEO 手動実行
supabase migration repair --status reverted 20260319100000 --linked
# → schema_migrations から該当 row 削除

# その後 staging で検証してから production に push
supabase db push --linked
# → 20260319100000 を含む LOCAL only file 群が正規に apply される
```

**前提**:
- 仮説 A 確定（migration repair で applied だが SQL 未実行）
- application code が `real_face_sessions` を使っている = table 復活させたい

**注意**:
- repair は Stage R2-redesign / Stage R4 で行う production schema_migrations 整理と同じ操作
- 単独で先に実施するか、 全体作業の一部として実施するか CEO 判断

### Option β: 何もしない（dead feature として放置）

**前提**:
- application code が `real_face_sessions` を使っていない（dead code）
- table 不在で application が動いている = 必須でない

**前提が満たされる場合のみ採用可**

### Option γ: repo migration を削除（廃止確定）

```bash
# repo から file を削除
git rm supabase/migrations/20260319100000_real_face_sessions.sql

# schema_migrations から row も削除（CEO 手動）
supabase migration repair --status reverted 20260319100000 --linked
```

**前提**:
- application 機能廃止が CEO 確定済
- 廃止判断の根拠あり

---

## §5 — 不変原則（本 Stage 中）

| # | 原則 | 違反検出方法 |
|---|---|---|
| 1 | **production に書き込まない**（read-only のみ） | linked ref + SQL audit |
| 2 | **staging を touch しない** | linked ref に staging が出ないこと |
| 3 | **自律 migration repair / 再実行禁止** | command log audit |
| 4 | **154 件の一般ケースを巻き込まない** | scope 単独維持 |
| 5 | **dump-derived 一時 file は cleanup** | /tmp/r15-* 最終削除 |
| 6 | credential を画面 / log に出さない | sanitize 強化遵守 |
| 7 | 各 Step 完了報告は CEO へ | Stop 待機 |

---

## §6 — 開始条件 / Stop point

### 開始条件

- ✅ Stage R1 audit 完了（result doc 起草済）
- ✅ linked は production
- ✅ branch は `feat/migration-debt-phase-readiness`
- ✅ sanitize 強化適用済（credential 漏洩なし）

### Stop point

| Stop | 位置 | CEO 判断対象 |
|---|---|---|
| **Stop H** | 本 readiness 起草完了直後 | Stage R1.5 着手 GO / 補正 / 中止 |
| **Stop R1.5** | Step 1-3 完了 + 仮説確定 | Option α / β / γ 採用判断 |
| **（Stop R1.5-exec）** | （Option 実行時、 別 Stage で扱う） | 実 repair の CEO 直接実行 |

---

## §7 — Risk

| risk | 影響 | 緩和策 |
|---|---|---|
| Step 1 psql query で schema_migrations 表名が異なる | query error | `\dt supabase_migrations.*` で table 存在確認後 query |
| Option α 実行で他 LOCAL only file（5 件）も同時 push される | 想定外の schema 変更 | 単独 repair のみで止め、 LOCAL only push は Stage R3 で実施 |
| application code が active で使用中 | repair 未実施だと 500 error 継続 | Step 3 で利用確認、 active なら α 優先 |
| 廃止判断後の Option γ で他 dependency 残存 | FK / RLS / view が孤立 | grep で関連 object 確認、 file 削除前に impact 評価 |
| schema_migrations の他 row にも同種 anomaly | 単発と思って repair したら全体不整合 | Stage R1.5-b として別途網羅調査（提案） |

---

## §8 — Stage R1.5-b 提案（網羅調査、 optional）

本 Stage は `real_face_sessions` 1 件のみ。ただし、 **他にも「applied 履歴 vs table 不在」がないか**確認する選択肢:

```sql
-- production 内で、 schema_migrations に applied だが
-- repo の CREATE 文に対応する table が public schema に存在しない migration list
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE applied_at IS NOT NULL
  AND name LIKE '%table%'  -- or pattern matching
  -- AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND ...);
```

これは scope 拡大なので、 本 Stage R1.5 では実施せず、 別 Stage R1.5-b として CEO 判断で起こす。

---

## §9 — 数字 / 事実 unify

| item | 値 | 出典 |
|---|---|---|
| 調査対象 table | 1 件（real_face_sessions） | Stage R1 §5 |
| 関連 migration | 1 file（20260319100000_real_face_sessions.sql） | repo |
| repo CREATE 文 | あり | Stage R1 §7 |
| production migration list applied | YES | Stage R1 §7 |
| production schema 内存在 | NO | Stage R1 §7 |
| DROP 痕跡 | なし | git log -S |
| 仮説候補 | 4 案（A/B/C/D） | 本 doc §2 |
| 復旧 Option 候補 | 3 案（α/β/γ） | 本 doc §4 |

---

**Stop H** — 本 readiness 起草完了。

CEO 判断仰ぐ:
- **A**: Stage R1.5 着手 GO（§3 Step 1-4 実行 → Stop R1.5 で仮説確定 + Option 判断仰ぐ）
- **B**: 補正後着手（仮説 / 手順 / Option 追加・修正）
- **C**: 中止 / Stage R2-redesign に統合（real_face を Layer 3 の anomaly entry として吸収）

判断後、 Stage R1.5 を実行 or 統合します。
