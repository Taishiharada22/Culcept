# W1-Z Production Migration Apply Runbook (CEO Operation)

**作成日**: 2026-05-20
**Status**: 採択待ち (CEO 操作起点、本 PR merge 後実施)
**目的**: Production Supabase に Plan tables + W1-Y RPC function を apply し、Home swipe Plan pane の data layer を稼働させる
**所要時間**: 約 **5-10 分** (CEO Supabase Dashboard 操作のみ)
**前提**: PR #219 (Phase 1 UI 統合) merge 済 + 本 PR (Phase 1 完了 docs) merge 済

**関連**:
  - `docs/alter-plan-w1z-production-migration-decision.md` (W1-Z 判断資料、§11 Decision Tree)
  - `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` (本 PR の対、Phase 1 完了報告)
  - `docs/alter-plan-w1y-rpc-atomicity-mini-design.md` (W1-Y RPC 設計)
  - `docs/alter-plan-foundation-design.md` (Plan 全体設計、§2.1 / §11 / §12)

---

## 0. なぜ今 apply するか (CEO 判断材料)

### 現状 (2026-05-20、Phase 1 UI 統合 PASS 後)

| layer | 状態 | 影響 |
|-------|------|------|
| UI 統合 (Home → swipe → Plan pane) | ✅ Phase 1 PASS | direct swipe access 動作 |
| API gateway (`/api/plan/anchors`) | ✅ 動作 | 仕様通り |
| **Database layer (Production Supabase)** | **❌ Plan tables 不在** | **API GET 500、PlanClient ErrorState 表示** |

CEO 視覚 smoke (2026-05-20): "Plan title / tab は表示、ただし読み込みに失敗 / 500"。

### Apply で得られるもの

- Production Supabase に Plan tables + W1-Y RPC が apply される
- `/api/plan/anchors` GET が 200 返却 (anchor 0 件なら empty array)
- PlanClient ErrorState が消え、Plan empty state または summary 表示
- Home swipe Plan pane の **完全稼働**

### Apply しない場合の trade-off

`docs/alter-plan-w1z-production-migration-decision.md` §3 の選択肢 D (永続 fallback):
- code は動く (Repository に sequential fallback path 残存、`rpc_fallback` log で観測)
- ただし tables 不在では fallback path 自体も走らない (insert 先 table がない)
- → **D を選んでも Plan pane の 500 は解消しない**
- 結論: Phase 1 D-O-D 完全 PASS には W1-Z apply 必須

---

## 1. Apply 対象 migration (2 files)

`supabase/migrations/` 配下の以下 2 ファイルを Production Supabase に **この順序で** apply:

| # | file | 役割 | size | 冪等性 |
|---|------|------|------|--------|
| 1 | `20260430100000_external_anchors.sql` | Plan tables (`external_anchor_sources`, `external_anchors`) + RLS + indexes + CHECK 制約 | 13.7 KB | **部分的に冪等** (§1.1 注意) |
| 2 | `20260519100000_create_external_anchor_bundle.sql` | W1-Y RPC function (`create_external_anchor_bundle()`) | 7.8 KB | ✅ `CREATE OR REPLACE FUNCTION` で完全冪等 |

### apply 対象外 (本 runbook では扱わない)

| file | 理由 |
|------|------|
| `20260430110000_plan_drift_events.sql` | W1-6 領域、CEO 制約「W1-6 不触」、application code 参照 0 件 |
| 他全 migrations | Plan と無関係 |

### §1.1 冪等性の正確な扱い (GPT 補正 2026-05-20、PostgreSQL 構文事実)

**tables / indexes は冪等、policies は非冪等**:

| 構文 | file 1 (external_anchors.sql) | 冪等性 |
|------|--------------------------------|--------|
| `CREATE TABLE IF NOT EXISTS external_anchor_sources` (l.28) | `CREATE TABLE IF NOT EXISTS external_anchors` (l.122) | ✅ 冪等 |
| `CREATE INDEX IF NOT EXISTS idx_...` | 複数 | ✅ 冪等 |
| `CREATE POLICY "external_anchor_sources_owner_select"` 等 8 件 (l.87/91/95/100/245/249/253/258) | **`IF NOT EXISTS` なし、`DO $$` block guard なし** | ❌ **非冪等** |

**重要**: PostgreSQL 公式 `CREATE POLICY` 構文には **`IF NOT EXISTS` が存在しない** (https://www.postgresql.org/docs/current/sql-createpolicy.html)。本 migration file は `CREATE POLICY "..."` を直接呼ぶため、**同じ policy 名で重複 apply すると `policy "..." for relation "..." already exists` error で失敗**。

**運用方針**:
- 本 W1-Z apply は **Production 初回 apply 専用**。Pre-flight (§2) で policies 不在を確認してから実行
- もし途中 error で apply 失敗 → §4 Rollback で全 table を DROP CASCADE すれば policies も削除、再 apply 可能
- ⚠️ 既に手動で部分 apply 済の場合は CEO に通知 (§4 Rollback 後 fresh re-apply 推奨)

---

## 2. Pre-flight Checklist (apply 前、CEO 5 分)

apply 直前に確認:

| # | 確認項目 | 確認方法 |
|---|---------|----------|
| 1 | PR #219 (Phase 1 実装) が main に merge 済 | `git log origin/main --oneline \| head -5` |
| 2 | 本 PR (Phase 1 完了 docs) が main に merge 済 | (本 PR が merge されている時点で前提充足) |
| 3 | staging Supabase で 2 migrations が apply 済 (sanity) | staging Dashboard で `external_anchor_sources` table 存在確認 |
| 4 | Production Supabase で 2 tables / function が **不在** (collision 防止) | §4 verification SQL の事前実行で確認 |
| 5 | CEO が Production Supabase Dashboard へ access 可能 | https://supabase.com/dashboard で organization 切替 |
| 6 | 同時 deploy / 大規模操作なし | Vercel queue 空、Supabase 他作業なし |
| 7 | 本 runbook を最後まで読み終えた | 自己確認 |

### 1 行 SQL で Production state を sanity check (read-only)

```sql
-- Production Supabase Dashboard SQL Editor で実行 (read-only)
SELECT
  'external_anchor_sources table' AS check_item,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_anchor_sources') AS exists
UNION ALL
SELECT
  'external_anchors table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_anchors')
UNION ALL
SELECT
  'create_external_anchor_bundle function',
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_external_anchor_bundle');

-- 期待出力 (apply 前):
--   external_anchor_sources table | false
--   external_anchors table        | false
--   create_external_anchor_bundle function | false
```

→ すべて `false` なら apply 進行可能。1 つでも `true` ならば既に部分 apply 済 (差分確認要、CEO 判断)。

---

## 3. Apply 手順

### Step 1: external_anchors.sql apply

#### 3.1.1 Supabase Dashboard で SQL Editor を開く

1. https://supabase.com/dashboard を開く
2. **Production** project (`aljavfujeqcwnqryjmhl`) を選択
3. 左 nav → **SQL Editor** → "+ New query"

#### 3.1.2 file 内容を貼り付け

- local file: `supabase/migrations/20260430100000_external_anchors.sql`
- 内容 (13.7 KB) を全 copy → SQL Editor に paste
- 内容は **部分的に冪等** (§1.1 参照、tables / indexes は `CREATE TABLE/INDEX IF NOT EXISTS` で冪等、**policies は非冪等で初回 apply 専用**)
- ⚠️ 二回目 apply は `policy "..." already exists` error で失敗、§4 Rollback で再 set

#### 3.1.3 "Run" 実行

- 期待結果: `CREATE TABLE` × 2 / `CREATE INDEX` × N / `CREATE POLICY` × N / `ALTER TABLE` × 2 (ENABLE ROW LEVEL SECURITY) 等の成功メッセージ
- 想定時間: < 5 秒
- error が出たら **Step 4 rollback** へ

#### 3.1.4 検証 SQL を即実行

```sql
-- Production Supabase Dashboard SQL Editor
-- 検証 1: tables 存在 + RLS 有効
SELECT
  tablename,
  schemaname,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('external_anchor_sources', 'external_anchors');
-- 期待: 2 行、両方 rls_enabled = true

-- 検証 2: RLS policies 存在
SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS command
FROM pg_policies
WHERE tablename IN ('external_anchor_sources', 'external_anchors')
ORDER BY tablename, policyname;
-- 期待: 各 table に SELECT / INSERT / UPDATE / DELETE policy が複数存在
--   (user_id = auth.uid() ベースの RLS が strict 適用)

-- 検証 3: CHECK 制約 (discriminated union: one_off / recurring)
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'external_anchors'::regclass
  AND contype = 'c'  -- CHECK
ORDER BY conname;
-- 期待: anchor_kind に応じた CHECK 制約 (date NOT NULL when one_off 等) が複数

-- 検証 4: indexes 存在
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('external_anchor_sources', 'external_anchors')
ORDER BY tablename, indexname;
-- 期待: 各 table に primary key index + idx_*_user_* / idx_*_source_id 等
```

✅ **PASS 条件**: 検証 1-4 すべて期待通り → Step 2 へ

---

### Step 2: create_external_anchor_bundle.sql apply

#### 3.2.1 同じ SQL Editor で "+ New query"

(別 query tab 推奨、Step 1 と分離)

#### 3.2.2 file 内容を貼り付け

- local file: `supabase/migrations/20260519100000_create_external_anchor_bundle.sql`
- 内容 (7.8 KB) を全 copy → SQL Editor に paste
- 内容は idempotent (`CREATE OR REPLACE FUNCTION` + 末尾の `REVOKE` / `GRANT`)

#### 3.2.3 "Run" 実行

- 期待結果: `CREATE FUNCTION` 成功メッセージ + `REVOKE` + `GRANT` 完了
- 想定時間: < 3 秒
- error が出たら **Step 4 rollback** へ

#### 3.2.4 検証 SQL を即実行

```sql
-- Production Supabase Dashboard SQL Editor
-- 検証 5: function 存在 + SECURITY mode 確認
SELECT
  proname AS function_name,
  prosecdef AS is_security_definer,
  prokind AS function_kind,
  pronargs AS arg_count
FROM pg_proc
WHERE proname = 'create_external_anchor_bundle';
-- 期待出力 (1 行):
--   proname              = create_external_anchor_bundle
--   is_security_definer  = false (= SECURITY INVOKER、不変原則 1)
--   prokind              = f (function)
--   pronargs             = 3 (p_user_id, p_source, p_anchors)

-- 検証 6: function の grant 状態
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'create_external_anchor_bundle';
-- 期待: authenticated に EXECUTE 権限 (anon / public は不在)
```

✅ **PASS 条件**: 検証 5-6 すべて期待通り → Step 3 へ

---

### Step 3: Post-Apply End-to-End Smoke

#### 3.3.1 Production-equivalent Preview deploy で再 smoke

PR #219 用の Preview branch (`preview/plan-home-swipe-smoke`) に最新 main を merge して再 deploy:

```bash
# CEO local 操作
git checkout preview/plan-home-swipe-smoke
git pull origin main  # fast-forward to latest main (PR #219 + 本 PR merge 後)
git push
# Vercel auto re-deploy
```

#### 3.3.2 canonical Preview URL で smoke (`docs/alter-plan-home-swipe-visual-smoke.md` §2)

特に **Step 3 と Step 5 (Phase 1 完成形 smoke 手順)** で:

| check | apply 前 | apply 後 (期待) |
|-------|---------|----------------|
| `/api/plan/anchors` GET | 500 Internal error | **200 + `{ok:true, data:{sources:[], anchors:[]}}`** |
| PlanClient の表示 | "読み込みに失敗しました / 再試行" | **empty state ("まだ予定が登録されていません") + 「+ Alter に教える」** |
| "+ 教える" → AddAnchorModal → 登録 | (API 500 で操作不能) | **登録成功、Plan content に表示** |
| "📋 教えた予定" → SourceListModal | (空 or error) | **登録した source 一覧** |

#### 3.3.3 Network 監視 (DevTools)

```
Network filter:
- /api/plan/anchors  → GET 200 (apply 後)、POST/DELETE 動作
- hjcrvndumgiovyfdacwc → 0 hit (Alter staging 不在)
- aljavfujeqcwnqryjmhl → Production Supabase への request 確認
- /api/coalter / /api/talk → 0 hit (CoAlter 経路を踏まない)
```

#### 3.3.4 Console 監視 (DevTools)

```
Filter:
- [Mirror] / [CoAlter] → 0 error
- [Plan] → 通常運用範囲のみ
- rpc_fallback → 0 (apply 後、function 存在するので fallback 不要)
```

✅ **PASS 条件**: Step 3.3.1-3.3.4 すべて期待通り → **W1-Z apply 完了 + Phase 1 完全 PASS 認定**

---

## 4. Rollback 手順 (緊急時のみ、想定外 error 発生時)

apply で想定外 error が出た場合の戻し手順。**通常は不要** (idempotent design)、安全網。

### 4.1 Step 2 (RPC) rollback

```sql
-- Production Supabase Dashboard SQL Editor
DROP FUNCTION IF EXISTS create_external_anchor_bundle(UUID, JSONB, JSONB);

-- 検証: function 消滅
SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_external_anchor_bundle');
-- 期待: false
```

→ Repository の `shouldFallbackFromRpcError` で PGRST202 検出 → sequential fallback path に flow back。

### 4.2 Step 1 (tables) rollback (極めて慎重に)

⚠️ **WARNING**: rollback すると新規 user 作成の Plan data が**消滅**する。apply 直後 (data なし) のみ安全。

```sql
-- Production Supabase Dashboard SQL Editor
-- 既存 data 確認 (apply 直後なら 0 行のはず)
SELECT COUNT(*) AS source_count FROM external_anchor_sources;
SELECT COUNT(*) AS anchor_count FROM external_anchors;

-- 両方 0 を確認してから:
DROP TABLE IF EXISTS external_anchors CASCADE;
DROP TABLE IF EXISTS external_anchor_sources CASCADE;
-- CASCADE で関連 indexes / policies / constraints もすべて消える
```

→ Production が apply 前と完全に同じ状態に戻る。

### 4.3 rollback 後の運用継続

- Repository は引き続き `fallback path` (sequential + compensating delete) を試行
- ただし tables 不在では fallback path も table 不在 error で失敗
- → Plan pane は再び ErrorState 表示 (apply 前と同じ)
- 別途 root cause investigation 後、再 apply trial

---

## 5. やらないこと (制約再宣言)

### CEO 補正に基づく制約

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ Production env 変更 (Vercel env)
- ❌ all-Preview env 変更
- ❌ service_role / DB password / connection string 使用要求
- ❌ DraftPlan generator / W1-6 passive drift logging

### Migration 範囲の制約

- ❌ `20260430110000_plan_drift_events.sql` を同時 apply (W1-6 領域、CEO 制約)
- ❌ Plan 以外の migration (Stargazer / CoAlter / Origin 等) を同時 apply
- ❌ application code 変更 (本 runbook は migration apply のみ、本 PR は docs only)
- ❌ Vercel re-deploy を migration apply 中に triggering

### Apply 中の禁止

- ❌ CEO 1 人で apply 中、他のメンバーが同 Production project に SQL を実行
- ❌ Step 1 と Step 2 の間に他 SQL を実行 (順序保護)
- ❌ verification SQL の skip (順次確認必須)

---

## 6. Observation Period (apply 後 24-48h)

### 6.1 監視対象

| metric | 期待値 | 観測手段 |
|--------|--------|----------|
| `/api/plan/anchors` GET 200 率 | 100% (apply 後) | Sentry / Vercel logs |
| `/api/plan/anchors` POST 200 率 | 100% (CRUD 動作時) | Sentry / Vercel logs |
| `rpc_fallback` log 発火数 | 0 (function 存在するので) | structured log (Repository) |
| `orphan_source` log 発火数 | 0 (RPC は atomic) | structured log |
| Plan tables の row count 増加 | CEO テスト操作で実 row 追加可能 | Supabase Dashboard table view |

### 6.2 異常時の即時 action

| 観測 | 仮説 | action |
|------|------|--------|
| `/api/plan/anchors` GET が引き続き 500 | RLS / index missing | Step 1 検証 SQL を再実行、漏れ確認 |
| POST が 500 | RPC function 不在 or grant 不足 | Step 2 検証 SQL を再実行 |
| `rpc_fallback` 発火 | function 存在しない / PGRST202 返却 | Step 2 検証 SQL、pg_proc を確認 |
| 他 routes (Alter chat / Origin / etc.) が壊れた | Plan migration の副作用 | rollback 検討、root cause investigation |

---

## 7. 完了判定 (Done Criteria)

apply 成功の sign-off criteria:

- [ ] Step 1 (tables) apply 成功 + 検証 SQL 1-4 PASS
- [ ] Step 2 (RPC) apply 成功 + 検証 SQL 5-6 PASS
- [ ] Step 3 (Preview smoke) で `/api/plan/anchors` GET 200 / empty state 表示
- [ ] Step 3 (Preview smoke) で AddAnchorModal → 登録 → Plan content reflection
- [ ] Network DevTools で `aljavfujeqcwnqryjmhl` (Production) のみ、forbidden refs 0 hit
- [ ] Console で `[Mirror]` / `[CoAlter]` / `rpc_fallback` 0 error
- [ ] 24h 観測で異常なし

すべて満たしたら → **W1-Z apply 完了 + Phase 1 完全 PASS 認定**。

### 完了後の次フェーズ候補

| 候補 | 内容 |
|------|------|
| **W1-Z+ cleanup wave** (1 週観測後) | Repository の fallback path / orphan logger 削除 |
| **Phase 2-A: CalendarTab 月ビュー** | UI mock 寄せ、別 mini design 起票 |
| **Phase 2-B: FlowTab image thumbnail** | UI mock 寄せ、Phase 2-A 後 |
| **Phase 2-C: MapTab Google Maps integration** | API key 判断含む別 design |
| **Phase 3: 空き日 → ALTER 提案 flow** | Stargazer / Alter engine 接続設計後 |
| **production env 投入** | `PLAN_HOME_SWIPE_ENABLED=true` を Production scope に (CEO 判断、別 wave) |

---

## 8. 自立推論 — Beyond 設計の根拠

### 8.1 順序を厳守する根拠

**Step 1 (tables) → Step 2 (RPC) → Step 3 (smoke)** の順序は CEO mock 由来ではなく、PostgreSQL dependency:
- RPC function は `external_anchor_sources` / `external_anchors` を参照
- function を先に CREATE しようとすると `relation does not exist` error
- 順序逆転は **必ず失敗** する

### 8.2 idempotency を確認した根拠

両 file の冒頭を grep で確認 (read-only audit):
- `external_anchors.sql`: `CREATE TABLE IF NOT EXISTS` 使用
- `create_external_anchor_bundle.sql`: `CREATE OR REPLACE FUNCTION` 使用
- → 重複 apply で `relation already exists` error は出ない、安全網

### 8.3 検証 SQL を per-step に分離した根拠

- Step 1 失敗時に Step 2 を実行すると、Step 2 自体は function CREATE 成功するが table 参照 column 不在で runtime error
- per-step verify で **Step 1 失敗を即時検出**、Step 2 invocation を防ぐ
- fail-fast design

### 8.4 rollback の rollback (Step 2 → Step 1 順) を明示した根拠

- function は table に依存 → function を先に drop しないと、table drop CASCADE で function 参照不整合
- drop 順は apply 順の **逆順**

### 8.5 Observation 24-48h を設けた根拠

- RLS policy の strict 動作は実 user の操作で初めて検証可能
- Sentry / Vercel logs で異常 (RLS bypass attempt / 5xx spike) は 24h 以内に signal を出す
- 即時 PASS 判定ではなく、観測期間を経た sign-off

---

## 9. References

- `supabase/migrations/20260430100000_external_anchors.sql` (apply Step 1)
- `supabase/migrations/20260519100000_create_external_anchor_bundle.sql` (apply Step 2)
- `docs/alter-plan-w1z-production-migration-decision.md` §5 (apply 手順、本 runbook の原型)
- `docs/alter-plan-w1y-rpc-atomicity-mini-design.md` (W1-Y RPC 設計、SECURITY INVOKER の根拠)
- `docs/alter-plan-foundation-design.md` §2.0 / §2.1 / §11 / §12 (table 設計の不変原則)
- `docs/alter-plan-a2-rls-smoke.md` (staging RLS smoke、Production smoke の参考)
- `docs/alter-plan-home-swipe-visual-smoke.md` §2 (Step 3 で実施する Phase 1 smoke)
- `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` (本 PR の対、Phase 1 完了報告)
- Production Supabase project ref: **Vercel Production env (`NEXT_PUBLIC_SUPABASE_URL`) / Supabase Dashboard でログイン後 organization 切替時に CEO が直接確認**。本セッションは Alter Plan 専用のため、CoAlter 由来の canon docs は参照しない (作業線混線防止、GPT 補正 2026-05-20)

---

## 10. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 | W1-Z apply runbook 起票、Phase 1 PASS 後の最短 path を明文化 | CEO 判断待ち |

---

**End of Runbook**. CEO は §1 → §2 → §3 (Step 1-3) を順番に実行、§4 rollback は緊急時のみ、§6 observation で 24-48h 監視、§7 Done Criteria 全 PASS で sign-off。
