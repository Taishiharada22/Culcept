# Stage R3 — Staging Replay Readiness（7 件最小補完 + 既存 172 push 検証）

**起草日**: 2026-05-26
**起草者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → `migration-debt-repair` → Stage R3
**現 branch**: `feat/migration-debt-phase-readiness`
**status**: CEO 承認待ち（着手前停止）
**先行**:
- Stage R1 audit 完了（154 件 prod-only）
- Stage R1.5（real_face_sessions anomaly）α-later 採用
- Stage R2-redesign 4 区分確定（L-A 2 + L-B 5 + L-D 5 + L-C 142）
- Stage R2-1 補完 file 完成（commit `86c6353d`、 `20260101000000_layer1_minimal_base.sql`、 469 行）
- sanitize 7 ルール全件適用検証 OK
**後続**:
- Stage R4: production schema_migrations 履歴調整（補完 file の applied フラグ立て）
- Stage R5: closeout + decision-log
- 元の Path β: staging に LOCAL only 6 file + P3-A-1 push 再開

---

## §0 — Stage 定義 / 範囲

### 何をするか

staging を完全リセット → 補完 file 1 + 既存 172 file = **173 file 一括 push** で migration replay が通ることを検証する。

具体的:
1. staging リセット（既存 partial state を完全除去）
2. supabase db push --linked で 173 file 一括 push
3. 7 件補完 table + 既存 172 migration が全て成功 → schema_migrations row 数 173 を確認
4. 主要 anomaly の自然修復確認（特に Stage B1 で失敗した `notification_preferences.sql`、 `real_face_sessions`）

### 何をしないか

- ❌ **production には触らない**（read-only access のみ、 push は staging のみ）
- ❌ **自律 retry / repair / recovery**（失敗時即停止、 CEO 報告）
- ❌ **migration file の編集**（補完 file 起草済、 既存 172 file はそのまま）
- ❌ **新規 migration 追加**（LOCAL only の 6 file は Stage R3 完了後の別 phase）
- ❌ **L-D 5 件 / L-C 142 件の追加補完**（本 Stage は 7 件最小補完のみ）

### 範囲限定

- 対象 environment: **staging のみ**
- 対象 file: 補完 file 1（commit 済）+ 既存 172 file = **173 file**
- 検証範囲: schema_migrations row 数 + 7 件 table 存在 + 主要 anomaly 修復確認

---

## §1 — 前提（Stage R1 〜 R2-1 から）

### 1.1 確定事実

- L-A 2 件 + L-B 5 件 = **7 件最小補完** で staging replay が通る理論
- L-D 5 件 + L-C 142 件は **non-blocker**（後続 172 migration が touch しない）
- 補完 file commit 済: `supabase/migrations/20260101000000_layer1_minimal_base.sql`
  - 7 ルール全件適用検証 OK
  - WARNING 0、 OWNER TO 0、 BEGIN/END $$ 16/16 ペア整合
- 既存 172 file は変更なし
- sanitize 方針: IF NOT EXISTS + DROP POLICY IF EXISTS + pg_constraint check + OWNER 除去 確定

### 1.2 過去 Stage B1 の失敗を解決する設計

| Stage B1 の失敗 | 本 Stage R3 での対処 |
|---|---|
| `notification_preferences.sql` で `notifications` table 不在 → 失敗 | 補完 file で `notifications` 先に作成 → 既存 file が ALTER 成功 |
| `real_face_sessions` applied 履歴 vs table 不在 anomaly | staging リセットで履歴クリア → `20260319100000_real_face_sessions.sql` が正規 apply で table 作成 |

### 1.3 期待される push 結果

- 全 173 file が成功 → schema_migrations row = 173
- 7 件 base table 作成: profiles, notifications, stargazer_{profiles, observations, core_star, resolved_types, orbit_snapshots}
- 残り 165 file（既存 172 - 7 件と重複しない 165）の各種 ALTER / INDEX / POLICY が成功
- 重複部分（既存 172 file 内の同名 INDEX / POLICY / CONSTRAINT）は **IF NOT EXISTS / DROP IF EXISTS / pg_constraint check で no-op**（補完 file が前置のため）

---

## §2 — staging リセット戦略

### 2.1 staging 現状

- 1 file 部分適用済（`20260202010849_experiment_assignments`、 Stage B1 で適用）
- auth.users: 2 ユーザー（テスト用、 残しても害なし）
- public schema: experiment_assignments 関連 table のみ存在

### 2.2 リセット Option（CEO 判断対象）

| Option | 内容 | 影響 | 推奨 |
|---|---|---|---|
| **Option 1**: Supabase Studio で project reset | 全 schema 完全初期化（auth user も消える） | clean、 ただし auth.users 2 user 消失 | ⭐ 最も確実 |
| **Option 2**: `migration repair --status reverted` で schema_migrations row 削除 + 手動 DROP TABLE experiment_assignments | application schema のみ初期化、 auth user 維持 | 部分 clean、 ただし sequencer 等の残骸が残る可能性 | 中程度 |
| **Option 3**: 既存 partial state の上に 173 file push | 衝突可能性あり（experiment_assignments が既存） | NG | 不採用 |

### 2.3 推奨 Option 1 採用根拠

- staging のテスト user 2 件は重要 data なし（migration 検証用に作られた）
- 完全 clean state で 173 file replay できる方が検証の信頼性が高い
- auth user は再作成可能（必要なら別途）

### 2.4 リセット手順（Option 1 採用時）

```
1. Supabase Studio (web UI) にログイン
2. Project Settings → General → Pause project（オプション、 安全側）
3. Project Settings → General → Reset project（or Delete + Recreate）
4. CLI 経由で再 link: supabase link --project-ref hjcrvndumgiovyfdacwc
5. 確認: supabase migration list --linked → 0 applied
```

**⚠️ Option 1 は CEO 手動操作領域**（web UI でのリセット）。AI は CLI のみで操作。

---

## §3 — push 手順（実行案、 CEO 承認後）

### Step 1: Pre-flight 確認

```bash
git branch --show-current  # 期待: feat/migration-debt-phase-readiness
cat supabase/.temp/project-ref  # 期待: production が link 中

# link 切替: production → staging
echo "" | supabase link --project-ref hjcrvndumgiovyfdacwc
cat supabase/.temp/project-ref  # 期待: hjcrvndumgiovyfdacwc
```

### Step 2: staging が完全初期化されたことを確認

```bash
supabase migration list --linked 2>&1 | head -10
# 期待: REMOTE 列が全て空（applied 0）
```

**判定**:
- REMOTE 全空 → リセット成功、 Step 3 へ
- REMOTE に何かある → リセット不完全、 即停止 + CEO 報告

### Step 3: dry-run で push 計画確認

```bash
supabase db push --linked --dry-run 2>&1 | tail -30
# 期待:
#   - 173 file の push 計画表示
#   - 順序: 20260101000000 (補完) → 20260202010849 → ... 既存 172 file
```

### Step 4: db push 実行（CEO 承認後の手動 GO）

```bash
echo "y" | supabase db push --linked 2>&1 | tee /tmp/r3-push.log
```

**期待**:
- 173 file 全成功
- "Finished supabase db push"

### Step 5: 失敗時の即停止

CEO 補正遵守:
- 自律 retry / repair / recovery 禁止
- 失敗 file 名 + error message を /tmp/r3-push.log で確認
- 即 CEO 報告

### Step 6: 検証（push 成功時）

```bash
# 1. schema_migrations row 数
eval "$(supabase db dump --linked --schema public --dry-run 2>/dev/null | grep -E '^export PG[A-Z]+=')"
PSQL=/opt/homebrew/opt/postgresql@17/bin/psql
$PSQL -A -t -c "SELECT COUNT(*) FROM supabase_migrations.schema_migrations;" > /tmp/r3-row-count.txt
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
echo "schema_migrations row: $(cat /tmp/r3-row-count.txt)"
# 期待: 173

# 2. 7 件 base table 存在確認
eval "$(supabase db dump --linked --schema public --dry-run 2>/dev/null | grep -E '^export PG[A-Z]+=')"
for t in profiles notifications stargazer_profiles stargazer_observations stargazer_core_star stargazer_resolved_types stargazer_orbit_snapshots; do
  $PSQL -A -t -c "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='$t' LIMIT 1;" > /tmp/r3-table-$t.txt
done
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
for t in profiles notifications stargazer_profiles stargazer_observations stargazer_core_star stargazer_resolved_types stargazer_orbit_snapshots; do
  exists=$([ -s "/tmp/r3-table-$t.txt" ] && echo "✅" || echo "❌")
  echo "  $t: $exists"
done

# 3. real_face_sessions 自然修復確認
$PSQL -A -t -c "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='real_face_sessions' LIMIT 1;" > /tmp/r3-rfs.txt
# 期待: 1 行（= table 存在 = Layer 4 anomaly 修復）

# 4. notification_preferences 適用確認 (Stage B1 障害源)
$PSQL -A -t -c "SELECT data FROM notifications LIMIT 0;" > /tmp/r3-nc.txt 2>&1
# 期待: error なし（= notifications.data column 存在）
```

### Step 7: 検証成功 → link 復帰

```bash
# link を production に戻す
echo "" | supabase link --project-ref aljavfujeqcwnqryjmhl
cat supabase/.temp/project-ref  # 期待: aljavfujeqcwnqryjmhl

# tmp file cleanup
rm -f /tmp/r3-*.txt /tmp/r3-push.log
```

### Step 8: Stop R3 報告

- 全 8 step の結果（成功 / 失敗）
- 補完 file の effective 確認
- Stage R4（production 履歴調整）着手 GO 判断仰ぐ

---

## §4 — 検証成功時の効果

### staging 完了状態

- public schema: 7 件 base + 既存 165 file 由来 table + L-D 5 + L-C 142 + 補完 + real_face_sessions = production と同等
- schema_migrations row: 173
- production と staging が **同一 schema** 状態

### migration 列の clean environment 再生可能性 復活

- ⭐ 任意の clean environment（new staging / dev / production replica） に対して `supabase db push` で再生可能
- migration debt 本体（base schema 不在）が解消

### 後続作業の解放

- Stage R4: production schema_migrations 履歴調整（補完 file の applied フラグ立て）
- Stage R5: closeout
- 元の Path β: staging に LOCAL only 6 file（P3-A-1 含む）push 再開

---

## §5 — 不変原則（本 Stage 中）

| # | 原則 | 違反検出方法 |
|---|---|---|
| 1 | **production schema を変更しない**（read-only のみ） | linked ref + SQL audit |
| 2 | **staging push は CEO 承認後の手動 GO 1 回のみ** | command log audit |
| 3 | **失敗時 retry / repair / recovery 自律実行禁止** | command log audit |
| 4 | **migration file を編集しない**（補完 file 起草済、 既存 172 file はそのまま） | git diff |
| 5 | **新規 migration 追加禁止**（LOCAL only 6 file は別 phase） | git status |
| 6 | **L-D / L-C の追加補完なし**（本 Stage は 7 件最小補完のみ） | -- |
| 7 | **credential を画面 / log に出さない**（sanitize 強化） | sed redact |
| 8 | **link 切替は最小限**（staging → production の戻りは検証完了後） | linked ref audit |
| 9 | **各 Step 完了報告は CEO へ** | Stop point 待機 |

---

## §6 — 開始条件 / Stop point

### 開始条件

- ✅ Stage R2-1 補完 file commit 済（`86c6353d`）
- ✅ sanitize 7 ルール全件適用検証 OK
- ✅ branch: `feat/migration-debt-phase-readiness`
- ✅ linked: production（read-only）
- ✅ 一時 file: 全 cleanup 済

### Stop point

| Stop | 位置 | CEO 判断対象 |
|---|---|---|
| **Stop L** | 本 readiness 起草完了直後 | リセット Option 確定 + Stage R3 着手 GO |
| **Stop R3-reset** | staging リセット完了直後 | リセット成功確認 + push 着手 GO |
| **Stop R3-push** | db push 完了直後（成功 or 失敗） | 検証 / 即報告判断 |
| **Stop R3-verify** | 検証完了 | Stage R4 着手 GO |
| **Stop R3-failure**（条件付き） | 失敗発生時 | 即停止 + CEO 報告 |

---

## §7 — Risk / 失敗時対応

### 7.1 Risk

| risk | 影響 | 対応 |
|---|---|---|
| 補完 file 内の `pg_constraint` check pattern が SQL error | push 停止、 補完 file 修正必要 | 即停止 + raw error 報告 + 補完 file 補正 |
| 既存 172 file の中で「補完 file が想定しない依存」が発覚 | partial apply | 即停止 + 該当 file 名 + error message 報告 |
| `real_face_sessions` の自然修復が動かない（schema_migrations 履歴側の問題） | Layer 4 anomaly 未解消 | Stage R1.5 に戻る、 別途 repair |
| L-C 142 件の中に 隠れ blocker | 何らかの ALTER / FK が想定外失敗 | 即停止 + 該当 file 名 + 当該 prod-only table を補完 list に追加検討 |
| staging リセットで Supabase Studio 障害 | リセット不能 | CEO 手動対応 |
| link 切替忘れで production に push の事故 | **重大** | Step 1 で必ず確認、 Step 7 で必ず production 戻し |

### 7.2 失敗時の標準対応

1. **即停止**: db push log を /tmp/r3-push.log に保存
2. **CEO 報告**: 失敗 file 名 + error message（sanitized） + 状態スナップショット
3. **link は staging のまま維持**（再試行の準備）
4. **自律 retry / repair / recovery 禁止**
5. CEO 判断 → 補完 file 補正 / L-C 追加 audit / etc.

### 7.3 production への意図しない影響回避

- **必須**: db push 前に必ず `cat supabase/.temp/project-ref` で staging（`hjcrvndumgiovyfdacwc`）確認
- production ref `aljavfujeqcwnqryjmhl` でない確認
- Step 1 で link 切替、 Step 7 で必ず復帰

---

## §8 — 数字 / 事実 unify

| item | 値 |
|---|---|
| 補完 file 数 | 1（`20260101000000_layer1_minimal_base.sql`） |
| 補完対象 table | 7 件（L-A 2 + L-B 5） |
| 既存 migration file 数 | 172 |
| push 予定 file 合計 | **173** |
| 補完 file 行数 | 469 行 |
| sanitize ルール | 7 (CREATE TABLE / INDEX / ADD COLUMN / POLICY / ADD CONSTRAINT / RLS / OWNER) |
| pg_constraint wrap | 16 件（PK 7 + FK 6 + UNIQUE 3） |
| DROP POLICY IF EXISTS | 23 件 |
| EXCEPTION 採用 | 0 件 |
| BEGIN/END $$ ペア | 16/16 |
| WARNING | 0 |
| staging ref | hjcrvndumgiovyfdacwc |
| production ref | aljavfujeqcwnqryjmhl |
| 期待 schema_migrations row（成功時） | 173 |

---

## §9 — Stage R3 → R4 引き継ぎ条件

Stage R4 着手の前提:
- ✅ Stage R3 全 8 step 成功
- ✅ schema_migrations row = 173
- ✅ 7 件 base table 存在
- ✅ real_face_sessions 自然修復確認
- ✅ notification_preferences 適用確認
- ✅ link production 復帰済
- ✅ tmp file cleanup 済

Stage R4 で行うこと（後段）:
- production schema_migrations に `20260101000000` の applied フラグを立てる
- `supabase migration repair --status applied 20260101000000 --linked` を CEO 手動実行
- production schema には変更を加えない（既に 7 件 table 存在のため）
- production / staging で schema_migrations 履歴が完全一致する状態にする

---

**Stop L** — 本 readiness 起草完了。

CEO 判断仰ぐ:
- **A**: Stage R3 着手 GO + リセット Option（1 / 2 / 3）確定 + Step 1 から実行
- **B**: 補正後着手（手順 / 検証 / リセット戦略変更）
- **C**: 一旦延期

判断後、 該当方針で進めます。
