# Stage R1 — Production Schema vs Repo CREATE Diff Audit Readiness

**起草日**: 2026-05-26（初版）
**補正日**: 2026-05-26（CEO 補正 — Step 1 data 流出 risk 排除 + 二段階分割）
**起草者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → small phase `migration-debt-repair`
**Stage 位置**: R1（最初の Stage、 read-only audit）
**現 branch**: `feat/migration-debt-phase-readiness`
**status**: CEO 承認待ち（着手前停止、 補正版）
**先行 phase**:
- `Migration Debt Repair Readiness` で **Option 1（不足 migration 補完）採用** が CEO 承認済
- 本 Stage はその第 1 歩、 不足対象を**全件洗い出す**ための read-only audit

### 補正履歴

- **2026-05-26 初版**: §2 で `supabase db dump --linked --schema public -f /tmp/r1-prod-schema.sql` を schema-only 前提で記述
- **2026-05-26 CEO 補正**: 上記前提は未検証 → data 流出 risk あり → §0 / §2 / §5 / §7 を補正
  - 二段階分割（table 名 diff → prod-only DDL 抽出）
  - dry-run 事前検証 Step を新設
  - pg_dump -t による個別抽出に変更
  - 「全 public schema dump 禁止」を不変原則に格上げ

---

## §0 — Stage 定義 / 範囲

### 何をするか

- production の **実際の public schema** と repo の **全 migration file の CREATE 文** を全突合する
- 「production にあるが repo の CREATE migration がない」object を**全件**リストアップする
- 結果を doc 化して Stage R2（補完 migration 起草）の入力にする

### 何をしないか

- ❌ **code / SQL 変更しない**
- ❌ **実 push しない**
- ❌ **production schema を touch しない**（read-only のみ）
- ❌ **staging を初期化しない**
- ❌ 補完 migration file の **起草もしない**（Stage R2 でやる）
- ❌ **production の public data を一括 dump しない**（CEO 補正 2026-05-26）
  - `supabase db dump --linked --schema public` が「schema-only」を保証する根拠は**未検証**
  - 一括 dump によりユーザー個人データが local /tmp に流出する risk を**排除**する
  - 代わりに **table 名 metadata のみ → prod-only 確定 table の DDL のみ**の二段階で取得

### 二段階方針（CEO 補正 2026-05-26）

```
第 1 段階: table 名 diff（data 非流出を絶対保証）
  ↓ Step 1-4
  ↓ prod-only table 名 list を確定
  ↓
第 2 段階: prod-only 確定 table のみ DDL 抽出（範囲限定）
  ↓ Step 5
  ↓ pg_dump -t <table_name> --schema-only による個別抽出
  ↓
doc 化
```

**全 public schema を一括 dump することは本 Stage の全 Step で禁止**。

### 対象 object 範囲

| object kind | Stage R1 対象 | 備考 |
|---|---|---|
| `TABLE` | ✅ **In scope** | 本 Stage の主目的 |
| `VIEW` / `MATERIALIZED VIEW` | ⚠️ Optional（補正提案） | scope 拡大は CEO 判断 |
| `FUNCTION` / `PROCEDURE` | ⏸ **Out of scope** | Stage R1.5 で別途検討 |
| `INDEX` | ⏸ **Out of scope** | table 突合後の派生 |
| `POLICY` (RLS) | ⏸ **Out of scope** | table 突合後の派生 |
| `TYPE` / `ENUM` | ⏸ **Out of scope** | Stage R1.5 で別途検討 |
| `TRIGGER` | ⏸ **Out of scope** | Stage R1.5 で別途検討 |
| `EXTENSION` | ⏸ **Out of scope** | repair scope 外（環境設定） |

**理由**: table が不足していると関連 INDEX / POLICY / TRIGGER も自動的に作れない（dependency error）。先に table を完全に揃え、 上に乗る object 群は Stage R1.5 以降で検証。

### Out of scope の object も「監査結果には記録」する

- 厳密な diff は table のみだが、 production schema dump 内の他 object 数（FUNCTION 何件、 POLICY 何件、 etc.）は count として記録
- これは Stage R1.5 着手判断の材料

---

## §1 — 前提（Migration Debt Repair Readiness の続き）

### 1.1 確定済の事実

- `notifications` table は production 手動作成と確定済（仮説確定、 前 readiness §3）
- 「削除済 migration」は否定済（git log 全期間で CREATE 0 件）
- repo 全 migration file 数: **172**
- production applied migrations: **168 timestamp**
- production public schema CREATE TABLE 数: **397**（前 readiness §10）

### 1.2 解明されていないこと

- production の **397 table のうち何 table が手動作成**か（本 Stage で確定）
- 同種 debt が table 以外（FUNCTION 等）にもあるか（Stage R1.5 範囲）

### 1.3 本 Stage 完了で得られる成果物

1. 「production にあるが repo にない table」の**完全な name list**
2. 各 table の `CREATE TABLE` SQL（production schema dump からの copy）
3. 「repo にあるが production にない table」の name list（4 timestamp / 6 file の expected diff の確認）
4. count summary（重複定義、 名前衝突、 IF NOT EXISTS の有無）
5. 監査結果サマリ doc（次 Stage R2 の入力）

---

## §2 — 監査手順（実行案、 CEO 承認後）

> **重要**: 本 §の手順は **CEO 補正 2026-05-26 により大幅再設計**。
> 二段階方針（第 1 段階 = table 名のみ / 第 2 段階 = prod-only 確定 table の DDL のみ）を厳守。
> 全 public schema dump は **どの Step でも実行しない**。

### Step 1: pg_dump invocation 事前検証（dry-run、 実行なし）

目的: `supabase db dump` が内部で叩く pg_dump の正確な flag set を確認する。
特に `--schema-only`（schema のみ、 data 非含有）相当の flag が確実に付くか目視確認する。

```bash
# linked が production であることを再確認
cat supabase/.temp/project-ref  # 期待: aljavfujeqcwnqryjmhl
git branch --show-current        # 期待: feat/migration-debt-phase-readiness

# dry-run で実行コマンドを表示（実行はしない）
supabase db dump --linked --schema public --dry-run 2>&1 | tee /tmp/r1-dryrun.txt
```

**判定**:
- `--schema-only` / `--no-data` 相当 flag を含む invocation が表示される → Step 2-A へ
- そうでない → **Step 1 結果を CEO に報告 + 別法選択**（Step 2-B / 2-C）

**禁止**:
- dry-run 結果に「実行コマンドは出るが flag が不明」の状態で本 dump を走らせない
- 「多分大丈夫」での実行は不可

### Step 2: table 名 list のみ取得（data 非流出を絶対保証）

prod-only 候補が確定するまでは **table 名 (metadata) しか取らない**。
以下の 3 案のうち、 Step 1 で確認した結果に基づいて 1 案選択:

#### Step 2-A: `pg_dump --schema-only -t <pattern>` を個別呼び出し（推奨）

dry-run で pg_dump invocation に connection string が含まれていた場合:

```bash
# dry-run 出力から pg_dump 実行コマンドを抽出（connection URL を含む）
# DB_URL の取得は Step 1 出力をベースに、 表示形式に合わせて grep / sed
# ※実装 detail は Step 1 結果を見て確定

# schema-only かつ table list のみ取得
pg_dump "$DB_URL" --schema-only --schema=public --no-owner --no-publications \
  | grep -E '^CREATE TABLE IF NOT EXISTS "public"\."[^"]+"' \
  | sed -E 's/^CREATE TABLE IF NOT EXISTS "public"\."([^"]+)".*/\1/' \
  | sort -u > /tmp/r1-prod-tables.txt

wc -l /tmp/r1-prod-tables.txt
```

**注意**:
- `--schema-only` flag 付きで実行するので data は dump されない
- pg_dump の output を直接 pipe で grep / sed 加工し、 **中間 schema file を作らない**
- 結果は table 名 list のみ（数百 row）

#### Step 2-B: `psql -c "SELECT tablename ..."` を経由（代替案）

local 環境に psql が installed されている場合:

```bash
# DB_URL を Step 1 dry-run 結果から取得
psql "$DB_URL" -A -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" \
  > /tmp/r1-prod-tables.txt

wc -l /tmp/r1-prod-tables.txt
```

**注意**:
- `pg_tables` は metadata view、 data は触らない
- 結果は table 名 list のみ

#### Step 2-C: Supabase CLI 経由が唯一可能な場合（最後の砦）

Step 1 で `--schema-only` flag が CLI 側で確認できず、 かつ pg_dump / psql 直接呼び出しも不可な場合:

- **本 Step は実行せず、 CEO に判断仰ぐ**
- 「production の何らかのデータが /tmp に書かれる可能性が排除できない」状態で **作業を進めない**
- Stage R1 を一時中断、 別 environment（例: staging を初期化済とする hypothetical scenario）で再設計

### Step 3: repo migration の CREATE TABLE 全リスト抽出（local、 production 非関与）

```bash
# repo 全 migration file から CREATE TABLE を抽出
# 注意点:
#   - `CREATE TABLE IF NOT EXISTS public.notifications (...)`
#   - `CREATE TABLE notifications (...)` (no IF NOT EXISTS、 no schema prefix)
#   - `CREATE TABLE IF NOT EXISTS "public"."notifications" (...)`
#   - 上記 3 form を網羅
grep -hE 'CREATE TABLE[[:space:]]+(IF NOT EXISTS[[:space:]]+)?("public"\.|public\.)?["a-zA-Z_]' \
  supabase/migrations/*.sql \
  | sed -E 's/.*CREATE TABLE[[:space:]]+(IF NOT EXISTS[[:space:]]+)?("?public"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?.*/\3/' \
  | sort -u > /tmp/r1-repo-tables.txt

# 件数確認
wc -l /tmp/r1-repo-tables.txt
```

**期待**: repo 全 172 file から確認できる table 名（数百 row 想定）。

### Step 4: 突合 diff（local file のみ、 production 非関与）

```bash
# production にあり repo にない（= 補完候補、 本 Stage の本命）
comm -23 /tmp/r1-prod-tables.txt /tmp/r1-repo-tables.txt > /tmp/r1-prod-only.txt
wc -l /tmp/r1-prod-only.txt

# repo にあり production にない（= production 未適用、 4 timestamp / 6 file 由来 expected）
comm -13 /tmp/r1-prod-tables.txt /tmp/r1-repo-tables.txt > /tmp/r1-repo-only.txt
wc -l /tmp/r1-repo-only.txt

# 両方にある（= 正常）
comm -12 /tmp/r1-prod-tables.txt /tmp/r1-repo-tables.txt > /tmp/r1-both.txt
wc -l /tmp/r1-both.txt
```

**期待**:
- `r1-prod-only.txt` = 補完が必要な table 名（数件〜十数件想定）
- `r1-repo-only.txt` = LOCAL only file 由来 expected（数件、 既知）
- `r1-both.txt` = 数百件（大多数）

**ここで第 1 段階完了**。prod-only table 名が確定。
**もし prod-only が極端に多い（例 50 件超）場合、 Step 5 へ進む前に CEO 中間報告**。

### Step 5: prod-only 確定 table のみ DDL 抽出（範囲限定、 第 2 段階）

prod-only に含まれる table のみを対象に、 `pg_dump -t` で個別 schema 抽出する。
**全 public schema を dump することは禁止**。

```bash
# 出力先
> /tmp/r1-missing-creates.sql

# prod-only table 名を一行ずつ読み、 個別に schema-only 抽出
while IFS= read -r table; do
  echo "-- ============================" >> /tmp/r1-missing-creates.sql
  echo "-- table: $table" >> /tmp/r1-missing-creates.sql
  echo "-- ============================" >> /tmp/r1-missing-creates.sql

  pg_dump "$DB_URL" --schema-only --no-owner --no-publications \
    -t "public.\"$table\"" \
    >> /tmp/r1-missing-creates.sql 2>&1
done < /tmp/r1-prod-only.txt

# 行数 / size 確認
wc -l /tmp/r1-missing-creates.sql
du -h /tmp/r1-missing-creates.sql
```

**重要**:
- `-t public."$table"` で抽出範囲を**当該 table のみ**に限定
- `--schema-only` で data 非含有
- `--no-owner` で OWNER 行除去（別 environment 移植性）
- `--no-publications` で publication 切り離し（環境差吸収）
- 抽出は **read-only**。production には一切書き込まない
- `r1-missing-creates.sql` は補完 migration（Stage R2 で起草）の素材

**fallback (Step 2-B 採用時)**:
- pg_dump が使えない場合、 psql で `\d+ "public"."$table"` または `pg_get_tabledef()` 拡張関数経由
- 詳細は Step 2 結果に応じて確定（Stop R1 で CEO 補正可能）

### Step 6: 結果を doc 化

新 doc `docs/alter-plan-migration-debt-stage-r1-result.md` に書く（テンプレは §3）:

- §1 audit 実施日時 + 採用 Step（2-A / 2-B / 2-C）
- §2 数値サマリ
  - production CREATE TABLE 総数
  - repo unique CREATE TABLE 総数
  - prod-only（補完候補）件数
  - repo-only 件数
  - both 件数
- §3 補完候補 table name list（alphabetical）
- §4 各 table の CREATE TABLE SQL（pg_dump -t 出力からコピー）
- §5 repo-only table name list（LOCAL only file 由来 expected との突合）
- §6 警告 / anomaly（あれば）
  - 同 table が複数 file で CREATE されている
  - production schema に CREATE TABLE 以外で table 化されている object（partition table 等）
- §7 Stage R2 への引き継ぎ事項

### Step 7: 一時 file cleanup

- `/tmp/r1-dryrun.txt` 削除
- `/tmp/r1-prod-tables.txt` 削除
- `/tmp/r1-repo-tables.txt` 削除
- `/tmp/r1-prod-only.txt` 削除
- `/tmp/r1-repo-only.txt` 削除
- `/tmp/r1-both.txt` 削除
- `/tmp/r1-missing-creates.sql` 削除（doc に内容コピー済）
- 確認: `ls /tmp/r1-* 2>&1` で empty 確認

**理由**: production からの抽出物を local disk に残さない。doc に必要な情報は全てコピー済。

### Step 8: Stop R1 報告

- 補完候補 table 件数 / name list / 数字サマリを CEO 報告
- 採用した Step（2-A / 2-B / 2-C）と理由
- 異常 / anomaly があれば明示
- Stage R2 readiness 起草着手 GO の判断仰ぐ

---

## §3 — 監査結果フォーマット（doc テンプレ）

Stage R1 完了時に新 doc 作成。フォーマット例:

```markdown
# Stage R1 Audit Result — Production vs Repo CREATE TABLE Diff

## §1 audit 実施日時 / 状態

- 実施日: 2026-05-XX
- linked: aljavfujeqcwnqryjmhl (production, read-only)
- branch: feat/migration-debt-phase-readiness
- 採用 Step: 2-A / 2-B / 2-C のいずれか + 採用理由
- Step 1 dry-run で確認した pg_dump invocation の flag set: ...
- Step 5 で使用した DDL 抽出方法: pg_dump -t / psql / etc.
- 一時 file は全て cleanup 済（/tmp/r1-* none）

## §2 数値サマリ

| 区分 | 件数 |
|---|---|
| production CREATE TABLE 総数 | XXX |
| repo unique CREATE TABLE 総数 | XXX |
| prod-only（補完候補） | XX |
| repo-only（LOCAL only 由来 expected） | X |
| both（正常） | XXX |

## §3 補完候補 table name list

- notifications (確定)
- table_A
- table_B
- ...

## §4 各 table の CREATE TABLE SQL

### notifications

```sql
CREATE TABLE IF NOT EXISTS "public"."notifications" (
    ...
);
```

### table_A

```sql
CREATE TABLE IF NOT EXISTS "public"."table_A" (
    ...
);
```

...

## §5 repo-only 表

| name | source migration file |
|---|---|
| ... | 20260430100000_external_anchors.sql |

LOCAL only file 由来 expected と一致するか確認。

## §6 警告 / anomaly

- ...

## §7 Stage R2 引き継ぎ

- 補完 file の名前: 20260101000000_initial_manual_tables.sql （提案）
- 補完 file 内 table 数: XX
- 補完 file 内 SQL 行数概算: XXX 行
- Stage R3 staging リセットで適用予定
```

---

## §4 — 出力成果物（本 Stage 完了時）

| # | 成果物 | 場所 | 必須 |
|---|---|---|---|
| 1 | audit 結果 doc | `docs/alter-plan-migration-debt-stage-r1-result.md` | ✅ 必須 |
| 2 | 補完候補 table name list | result doc §3 | ✅ 必須 |
| 3 | 各 table の CREATE TABLE SQL | result doc §4 | ✅ 必須 |
| 4 | 数値サマリ | result doc §2 | ✅ 必須 |
| 5 | repo-only 表 + 突合 | result doc §5 | ✅ 必須 |
| 6 | 警告 / anomaly | result doc §6 | ✅ 必須（空でも明示） |
| 7 | decision-log 記録 | `docs/decision-log.md` | ✅ 必須（Stage R1 着地時） |

---

## §5 — 不変原則（本 Stage 中）

| # | 原則 | 違反検出方法 |
|---|---|---|
| 1 | **docs 以外変更しない** | git diff で .ts/.tsx/.sql 変更ゼロ |
| 2 | **実 push しない** | command log audit |
| 3 | **production に書き込まない**（read-only のみ） | linked ref + SQL audit |
| 4 | **staging を touch しない** | linked ref に staging が出ないこと |
| 5 | **補完 migration file 起草しない**（Stage R2） | git status で migrations/ 新規追加なし |
| 6 | **自律 retry / repair / recovery 禁止** | command log audit |
| 7 | dump 由来の一時 file は doc コピー後 cleanup | /tmp/r1-* の最終削除 |
| 8 | 各 Step 完了報告は CEO へ | Stop R1 待機 |
| 9 | ⭐ **全 public schema を一括 dump しない**（CEO 補正 2026-05-26） | `--schema public -f` 形式の dump コマンド使用ゼロ |
| 10 | ⭐ **dump flag は dry-run で事前検証**（CEO 補正 2026-05-26） | Step 1 完了報告 |
| 11 | ⭐ **第 1 段階（table 名）と第 2 段階（DDL）を厳密分離**（CEO 補正 2026-05-26） | prod-only 確定前に DDL 抽出を開始しない |
| 12 | ⭐ **DB connection URL を /tmp に永続保存しない**（CEO 補正 2026-05-26） | Step 1 dry-run 結果のうち URL 部分は doc に含めず、 Step 7 cleanup で削除 |
| 13 | ⭐ **個別 table の DDL 抽出時は `-t public."$table"` で範囲限定**（CEO 補正 2026-05-26） | Step 5 command audit |

### 不変原則違反時の対応

- 違反検出時は**即停止 + CEO 報告**
- 自律で resolve しない
- 違反 evidence（command log / output file）を doc 化してから次の判断仰ぐ

---

## §6 — 開始条件 / CEO 承認 stop point

### 開始条件

- ✅ Migration Debt Repair Readiness（Option 1 採用）が CEO 承認済
- ✅ linked は production（`aljavfujeqcwnqryjmhl`）
- ✅ branch は `feat/migration-debt-phase-readiness`
- ✅ staging は partial state（1 file applied）のまま touch せず維持

### Stop point（本 Stage 内）

| Stop | 位置 | CEO 判断対象 |
|---|---|---|
| **Stop G** | 本 readiness 起草完了直後 | Stage R1 着手 GO / 補正 / 中止 |
| **Stop R1** | audit 完了 + result doc 起草完了直後 | 補完候補確定、 Stage R2 着手 GO 判断 |

### Stop G での判断材料

- 本 readiness 全体（§0-9、 **CEO 補正反映済**）
- 二段階方針（§0、 全 public dump 禁止 / 第 1 段階 table 名 / 第 2 段階 prod-only DDL）
- audit 手順（§2 Step 1-8、 dry-run 検証 → 3 案分岐 → 個別 DDL 抽出）
- 対象 object 範囲（§0、 table のみ in scope）
- 不変原則（§5、 13 項目、 ⭐ 5 項目は CEO 補正による格上げ）
- Risk 解消（§7.2、 dump 流出 risk が解消方針付きで明記）

### Stop R1 での判断材料

- audit 結果（補完候補 table 数 / name / SQL）
- 異常 / anomaly
- repo-only 突合の expected vs 実際の一致確認
- Stage R2 着手可否

---

## §7 — Risk / 補正可能性

### 7.1 補正可能性

- 本 readiness は initial 起草。CEO 補正歓迎:
  - 対象 object 範囲拡張（VIEW を in scope 化する等）
  - audit Step の追加（partition / inheritance 検出等）
  - 不変原則追加
  - dump file 保存先指定

### 7.2 Risk

| risk | 影響 | 緩和策 |
|---|---|---|
| ⭐ **`supabase db dump --linked --schema public` が schema-only でない** | production 個人 data が /tmp に流出 | **CEO 補正 2026-05-26**: 全 public dump 禁止、 Step 1 dry-run 事前検証、 pg_dump -t による個別抽出に変更 |
| ⭐ **dry-run 出力に connection URL が含まれる** | URL leak | Step 7 cleanup で `/tmp/r1-dryrun.txt` 削除、 doc には URL を含めず |
| ⭐ **Step 2-A/2-B が local 環境で実行不能**（pg_dump / psql 未 installed） | 第 1 段階が止まる | Step 2-C で CEO 判断仰ぐ（中断選択肢を明示） |
| schema dump に table 以外の noise が混在 | 抽出 grep が誤検出 | sed regex を厳密化、 結果を目視確認 |
| repo migration 内に `CREATE TABLE ... AS SELECT` がある | name 抽出パターン不一致 | 別 regex で再走、 anomaly 記録 |
| production schema dump の format が v2.75.0 で変化 | 抽出パターン更新必要 | 実行後 1 行 sample 確認 |
| 補完候補 table が **400 件以上** ある | scope 過大、 R2 起草難航 | Stop R1 で CEO 判断、 段階分割再設計 |
| repo-only diff が LOCAL only 6 file と一致しない | LOCAL only file の table 数勘違い | 6 file の CREATE TABLE 内訳を別途確認 |
| Step 5 個別 dump 中に table 名 escape が必要 | 特殊文字を含む table 名で error | `-t public."$table"` で `"` quote、 special chars 検出時は 1 件ずつ手動確認 |
| Step 5 で table 数が多い場合の所要時間 | 30+ table × 数秒 = 数分 | timeout 600000ms（10 分）、 進捗 print |
| 補完候補 table の CREATE SQL に **production-specific** な依存（OWNER、 publication 等）が混在 | 別 environment で再現性低下 | `--no-owner --no-publications` flag 必須、 Stage R2 で更に sanitize |

### 7.3 もし anomaly が大量に出た場合

- 例: 補完候補が 50 件以上、 同種 anomaly が 10 件以上
- Stop R1 で **Stage R1 を分割再起草**（R1a: table、 R1b: その他 object、 R1c: anomaly 個別調査）
- 強引に R2 に進まない

---

## §8 — 数字 / 事実 unify（Stage 起点で確定済）

| item | 値 | 出典 |
|---|---|---|
| production applied migrations | 168 timestamp | 前 readiness §2.4 |
| repo migration file 数 | 172 | 同上 |
| LOCAL only timestamp | 4 | 同上 |
| LOCAL only 実 file 数 | 6 | 同上 |
| production CREATE TABLE 総数（前 forensic） | 397 | 前 readiness §10 |
| production ref | aljavfujeqcwnqryjmhl | 訂正済 |
| staging ref | hjcrvndumgiovyfdacwc | 確定 |
| staging partial applied | 1 file（experiment_assignments） | Stop 2 |
| 仮説確定 | 手動作成（Supabase Studio） | 前 readiness §3.1 |

---

## §9 — Stage R1 → R2 引き継ぎ条件

Stage R2（補完 migration 起草）に進むための前提:

- ✅ 補完候補 table name list 確定
- ✅ 各 table の CREATE TABLE SQL 抽出済
- ✅ 補完 file の timestamp（提案: `20260101000000`）と名前（提案: `initial_manual_tables.sql`）の合意
- ✅ Stage R2 内で「OWNER 除去 / IF NOT EXISTS 保証 / publication 切り離し」の方針確定
- ✅ Stage R1 anomaly が解決済 or 明示的に R2 deferred

---

**Stop G** — 本 readiness 起草完了。

CEO 判断仰ぐ:
- **A**: Stage R1 着手 GO（本 readiness §2 手順をそのまま実行）
- **B**: 補正後着手（対象 object 範囲 / 手順 / 不変原則変更）
- **C**: 中止 / 別案検討（Option 1 採用は維持）
