# CoAlter Mirror Channel — E-2-1a Migration Runbook

**ステータス**: E-2-1a migration SQL apply 手順 (CEO 明示承認後、CEO が manual 実行)
**作成日**: 2026-05-20
**目的**: Phase E-2-1a で着地した migration SQL (`supabase/migrations/20260520120000_coalter_mirror_app_settings.sql`) を Production Supabase に safely apply するための CEO 用 runbook。**本 PR merge ≠ DB apply**、apply は別 step CEO 明示承認後の manual 操作。

---

## §0. ⚠️ 本 runbook を読む前提

- 本 migration の **PR merge は SQL ファイル着地のみ**、Production DB 変更を伴わない
- DB apply は **CEO 明示承認後の別 step**、CEO が手元で manual 実行
- apply が **未承認のまま実行された場合は構造的 incident** として扱う

### 0.1 CEO 4 補正 (2026-05-20、本 E-2-1a の前提として永続)

| # | 補正内容 | 反映先 |
|---|---|---|
| 1 | service_role は RLS を bypass する (Supabase canon)。本 table は "operator-only operation table"。RLS policy は anon/authenticated 経路向けのみ。 | migration SQL §1 + §6 + §7 + 本 runbook §3 |
| 2 | audit table は tamper-evident であり tamper-proof ではない。service_role / postgres owner では改ざん可能。DB-side defense として UPDATE/DELETE 禁止 trigger を追加。 | migration SQL §3 + §5 + 本 runbook §4 |
| 3 | SECURITY DEFINER function は `search_path = pg_catalog, public` を固定、副作用は audit insert / RAISE EXCEPTION のみ。 | migration SQL §4 + §5 |
| 4 | L1 env kill switch は env 削除 + **次回 Production deploy で反映** される恒久停止手段。**即時停止ではない**。即時停止は L3 (Supabase runtime flag、ただし client mount 反映タイミングは E-2-1b 設計次第)。 | 本 runbook §6 |

---

## §1. apply 前 prerequisite (CEO 確認項目)

CEO が以下すべてを確認してから apply に進む。1 つでも未達なら apply 禁止。

| # | prerequisite | 確認方法 |
|---|---|---|
| 1 | E-2-0 sequencing plan (PR #217) main 着地 | `git log origin/main --oneline | grep "E-2-0"` |
| 2 | E-2-1a PR main 着地 (本 PR が squash merge 済) | `git log origin/main --oneline | grep "E-2-1a"` |
| 3 | 本 runbook を CEO が **完読** | (CEO 自己宣言) |
| 4 | migration SQL を CEO が **content review** 済 (table schema / RLS / trigger 内容を理解) | `cat supabase/migrations/20260520120000_coalter_mirror_app_settings.sql` |
| 5 | Production DB backup (Supabase Studio で snapshot or pg_dump) | Supabase Dashboard → Database → Backups |
| 6 | Production DB の現在の migration history が clean (orphan migration なし) | `npx supabase migration list --linked` |
| 7 | CEO が apply の **明示文書承認** を decision-log に記録予定 | (apply 実行後に decision-log entry を追記) |

---

## §2. apply 手順 (CEO manual 実行)

### 2.1 apply コマンド (推奨: Supabase CLI)

```bash
# CEO 手元で実行 (Vercel CLI / Supabase CLI が link 済前提)
cd /Users/haradataishi/Culcept

# Step A: link 確認
npx supabase status --linked 2>&1 | grep "Project ref"
# 期待: aljavfujeqcwnqryjmhl (Production Supabase、canon `docs/coalter-supabase-ref-canon.md` 参照)

# Step B: pending migration 確認
npx supabase migration list --linked
# 期待: 20260520120000_coalter_mirror_app_settings.sql が pending として表示

# Step C: dry-run (Supabase CLI は本格的 dry-run なし、SQL を visually review)
cat supabase/migrations/20260520120000_coalter_mirror_app_settings.sql

# Step D: ⚠️ 本実行 (CEO 明示承認後、manual で確認の上で)
npx supabase db push --linked
# 確認 prompt が出るので "y" で進む
```

### 2.2 apply 失敗時の対応

| 失敗パターン | 対応 |
|---|---|
| network error / timeout | retry (Supabase CLI 経由)、3 回失敗で Supabase support 問い合わせ |
| migration syntax error | apply 失敗時点でロールバック (transaction が COMMIT 前で abort)、SQL fix → 新 PR |
| permission denied | Supabase 接続 role が postgres / service_role か確認 |
| migration が既に applied | (本 migration は new、起こり得ない。起こったら local migration history と Production の不整合を疑う) |

### 2.3 apply 後の post-verify (Supabase Studio で実行)

migration SQL §post-apply verify コメント部分 (file 末尾) の query を Supabase Studio SQL editor で実行:

```sql
-- table 存在確認
SELECT tablename FROM pg_tables
WHERE tablename IN ('app_settings', 'coalter_mirror_kill_switch_audit');
-- 期待: 2 行

-- initial row 確認
SELECT key, value, updated_at FROM app_settings
WHERE key = 'mirror_channel_enabled';
-- 期待: 1 行、value = {"enabled": true}

-- trigger 存在確認
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table IN ('app_settings', 'coalter_mirror_kill_switch_audit');
-- 期待: 3 trigger (audit_trigger, prevent_update, prevent_delete)

-- function 存在確認
SELECT proname FROM pg_proc
WHERE proname IN ('audit_mirror_kill_switch', 'prevent_audit_row_modify');
-- 期待: 2 行

-- immutability test (失敗するはず、本 query が期待通り ERROR で失敗を確認)
-- 注意: 本 test を実行する場合、audit に row があることが前提 (まだ kill switch flip 0 回ならテストできない)
-- INSERT INTO coalter_mirror_kill_switch_audit (action, new_state) VALUES ('enable', '{}'::jsonb);
-- UPDATE coalter_mirror_kill_switch_audit SET reason = 'tamper test' WHERE id = (SELECT id FROM coalter_mirror_kill_switch_audit LIMIT 1);
-- → 期待: ERROR: coalter_mirror_kill_switch_audit rows are immutable
```

### 2.4 apply 後の decision-log 記録

apply 完了後、CEO + Claude で decision-log に entry を追加:

```markdown
### 2026-MM-DD CoAlter Mirror Channel E-2-1a migration apply 実施
- **部門**: Build
- **決定内容**: E-2-1a migration (PR #XXX merged YYYY) を Production Supabase
  (aljavfujeqcwnqryjmhl) に CEO 明示承認後 manual apply 完了
- **apply 結果**:
  - app_settings + coalter_mirror_kill_switch_audit table 作成済
  - audit trigger / immutability trigger 動作確認済
  - initial row (mirror_channel_enabled = true) seed 済
- **承認**: CEO
- **ステータス**: 実行済、E-2-1b 起票可
```

---

## §3. service_role と RLS の関係 (CEO 補正 #1、永続 canon)

### 3.1 Supabase canon (Supabase 公式 docs 由来)

- Supabase の **`service_role` は RLS を bypass** する設計
- これは Supabase docs で明示されている canon、本 migration の RLS policy は **anon / authenticated 経路向け** のみ制御

### 3.2 本 migration での意味

| role | app_settings 操作 | audit table 操作 |
|---|---|---|
| `anon` | SELECT (key = mirror_channel_enabled のみ) | SELECT 不可 / 全 deny |
| `authenticated` | 同上 | 同上 |
| `service_role` | **RLS bypass、全操作可能** | **RLS bypass、ただし immutability trigger §5 で UPDATE/DELETE は ERROR** |
| `postgres` / superuser | RLS bypass、trigger DROP 可能、完全 access | RLS bypass、trigger DROP すれば改ざん可能 |

### 3.3 表現上の禁止 (canon、本 phase 永続)

| ❌ 禁止表現 | ✅ 正しい表現 |
|---|---|
| "RLS policy で service_role を制限する" | "service_role は RLS を bypass する (Supabase canon)、RLS policy は anon/authenticated 経路向け" |
| "service_role でも改ざん不能" | "通常経路では改ざん困難、service_role / postgres owner 権限では完全不可変ではない" |
| "本 table は完全に protected" | "operator-only operation table (service_role 経由 Supabase Studio で操作)、tamper-evident defense あり" |

---

## §4. audit table の tamper-evident vs tamper-proof (CEO 補正 #2、永続 canon)

### 4.1 防御 layer

| layer | 防御内容 | bypass 可能 role |
|---|---|---|
| **L-DB-1**: RLS policy | anon / authenticated 経路の access 制御 | service_role (RLS bypass、Supabase canon) |
| **L-DB-2**: UPDATE/DELETE 禁止 trigger | DB-side で audit row 改ざん試行を RAISE EXCEPTION | trigger DROP 可能な role (postgres owner / superuser) |
| **L-DB-3**: GRANT/REVOKE (本 migration §9) | public role からの権限剥奪 (defensive default) | service_role 含む granted privilege 持つ role |

### 4.2 tamper-evident vs tamper-proof

- **tamper-proof**: 任意 role でも改ざん不能 (cryptographic immutability、blockchain 等)
- **tamper-evident**: 通常経路では改ざん不能 OR 改ざんが「失敗する / 記録される」(本 migration の防御 level)

本 migration の audit table = **tamper-evident**。tamper-proof ではない。Postgres の根本仕様 (postgres owner は trigger を DROP 可能、行を直接編集可能) は変えられない。

### 4.3 追加防御策 (E-2-1a scope 外、E-3'+ 検討)

将来的に tamper-evident → tamper-proof 化したい場合の選択肢:
- audit row hash chain (前 row の hash を次 row に含める、cryptographic 連鎖)
- 外部 audit service (DataDog / Datalog 等への append-only stream)
- WORM storage (write-once-read-many) export

→ 本 phase では tamper-evident で十分、E-3' 以降で必要時に検討。

---

## §5. L1 kill switch の **正しい反映時間** (CEO 補正 #4、永続 canon)

### 5.1 Next.js + Vercel における NEXT_PUBLIC_ env の特性

- Next.js では `NEXT_PUBLIC_*` env は **`next build` 時に JavaScript bundle へ inline される** (Next.js 公式 canon)
- → env 値が **build 時に決定**、deploy artifact (HTML/JS) に焼き込まれる
- → **既存 deploy には env 削除が反映されない**

### 5.2 Vercel env 変更の影響範囲

- Vercel の env 変更は **既存 deployment には影響しない** (Vercel 公式 canon)
- → env 変更を反映するには **新 Production deploy が必要** (新 build artifact 作成)

### 5.3 L1 kill switch の正しい記述

```
L1 = env 削除 + 次回 Production deploy で反映される恒久停止手段
```

- L1 単体では **即時停止ではない**
- 次の Production deploy (manual or auto trigger) で新 build が作られ、env 削除が反映
- 反映時間 = env 削除完了から次 deploy build/promote までの時間 (Vercel ↔ GitHub integration の挙動次第、数分〜数十分)

### 5.4 L1 vs L3 の正しい使い分け (canon 更新)

| 観点 | L1 (env-level) | L3 (Supabase runtime flag) |
|---|---|---|
| 即時停止 | ❌ 不可 (next Production deploy 必要) | △ mount 時 (CEO-only でも既画面開いているなら page reload 必要、E-2-1b 設計次第) |
| 恒久停止 | ✅ (env 復元しない限り) | △ DB flag を戻せば即 revert |
| 用途 | **第二手 (恒久 OFF、次 deploy で確定)** | **第一手 (即時 OFF、新 session に反映)** |

### 5.5 即時停止の現実的選択肢 (E-2-α 期間)

- **CEO-only (E-2-α)**: L3 flip + page reload で実用上即時、L1 で確定
- **invited user (E-2-β 以降)**: L3 のみで全 user 即時停止は困難 (E-2-1b 設計次第、§後述)、L1 + L3 並行発動 + user 連絡

---

## §6. CEO が apply 後に確認する safety invariants

apply 完了後、Mirror runtime (E-2-1b 着地後) が動き出す前に以下を確認:

| invariant | 確認方法 |
|---|---|
| `app_settings` table 存在、initial row enabled=true | §2.3 query |
| audit table 存在、immutability trigger 動作 | §2.3 query + immutability test |
| RLS policy が anon SELECT を mirror_channel_enabled のみに制限 | Supabase Studio Authentication → RLS で policy 確認 |
| service_role connection で UPDATE 可能 (kill switch flip preparation) | Supabase Studio SQL editor で `UPDATE app_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'mirror_channel_enabled' RETURNING *;` (no-op だが access 確認) |
| 1 つの audit row が trigger で insert された (上記 UPDATE で) | `SELECT * FROM coalter_mirror_kill_switch_audit ORDER BY triggered_at DESC LIMIT 1;` |

---

## §7. rollback 手順 (apply 後に問題発覚した場合)

### 7.1 通常 rollback (kill switch flip で OFF にするだけ)

```sql
-- Supabase Studio SQL editor で実行
UPDATE app_settings
SET value = '{"enabled": false}'::jsonb
WHERE key = 'mirror_channel_enabled';
```

→ **destructive ではない**、kill switch ON 状態にするだけ。E-2-1b runtime が L3 false を読んで Mirror null return。

### 7.2 migration 取り消し rollback (destructive、CEO 明示承認必須)

万一 migration 自体に問題があり apply を取り消したい場合:

```sql
-- ⚠️ destructive operation、CEO 明示承認必須
DROP TRIGGER IF EXISTS prevent_audit_delete_trigger ON coalter_mirror_kill_switch_audit;
DROP TRIGGER IF EXISTS prevent_audit_update_trigger ON coalter_mirror_kill_switch_audit;
DROP TRIGGER IF EXISTS mirror_kill_switch_audit_trigger ON app_settings;
DROP FUNCTION IF EXISTS prevent_audit_row_modify();
DROP FUNCTION IF EXISTS audit_mirror_kill_switch();
DROP TABLE IF EXISTS coalter_mirror_kill_switch_audit;
DROP TABLE IF EXISTS app_settings;
```

→ **最終手段**。E-2-1b 未着地 (runtime が Supabase read していない) なら影響範囲なし。

---

## §8. 不可侵境界 (本 PR + apply 全期間、永続 canon)

| 項目 | 状態 |
|---|---|
| **本 PR merge 段階での Production DB apply** | **0 (永続禁止、apply は別 step CEO 明示承認後 manual)** |
| Production env / all-Preview env / Development env | **0 touch** (本 PR 全期間 + apply 段階でも) |
| canary scope env | **0** |
| `SUPABASE_SERVICE_ROLE_KEY` 任意 scope 追加投入 | **0** |
| runtime app code (`app/` / `lib/` / `components/` / `hooks/`) | **0 diff** (本 PR + E-2-1b PR 前) |
| E-2-1b runtime 実装 | **0** (E-2-1a apply 完了後の別 PR) |
| E-2-2 / E-2-3 / E-2-α 着手 | **0** |
| C-5 着手 | **0** |

---

**End of E-2-1a migration runbook.** apply は CEO 直接承認後の別 step。本 doc は永続 reference として `docs/` に保管。
