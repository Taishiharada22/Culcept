# Alter Plan A-1 — Staging Migration Smoke Pack

> Status: Draft / CEO 承認後に実行
> Date: 2026-05-17
> Prerequisite: A-0 完了（staging Supabase project 作成済み、`docs/staging-supabase-setup.md` 参照）
> Next: A-2（W1-4 real insert 実装）

---

## 0. 目的

A-0 完了後、CEO が **staging Supabase project に W1-3 / W1-5 migration を適用**し、適用結果を **schema / RLS / CHECK / index / append-only** の観点から smoke 確認する。

PASS なら A-2（W1-4 real insert 実装）へ進める。FAIL なら原因分析 + 修正（migration 修正は別 PR）。

---

## 1. A-1 で確認する不変原則（W1-3 / W1-5 由来）

| 不変原則 | 出所 | smoke 対象 |
|---|---|---|
| confirmed_at NOT NULL（未確認 confirmed 化禁止） | W1-3 | schema |
| anchor_kind discriminated union（one_off / recurring の混在禁止） | W1-3 | schema + behavior |
| raw_retention 整合（discarded ↔ path/expires NULL） | W1-3 | schema + behavior |
| validity_window_order（valid_until >= valid_from） | W1-3 | schema + behavior |
| recurrence_rule 長さ制限（≤ 500） | W1-3 | schema |
| ON DELETE CASCADE（source 削除で anchor 連鎖） | W1-3 | schema |
| user_id RLS 全 4 操作（SELECT / INSERT / UPDATE / DELETE） | W1-3 | schema（policy 存在 + 定義） |
| plan_drift_events 全 CHECK 9 種 | W1-5 | schema + behavior |
| **append-only**（plan_drift_events に UPDATE policy 不在） | W1-5b | **schema（policy 数 = 3）** |
| polymorphic target（FK なし、API 層で検証） | W1-5 | schema（target_type / target_id のみで FK なし） |
| target_snapshot JSONB object 制約 | W1-5 | schema + behavior |

---

## 2. 役割分担

| 役割 | 主体 |
|---|---|
| migration 適用の**実行** | **CEO** |
| smoke SQL の**起草** | Claude（本 PR） |
| smoke SQL の**実行** | **CEO**（Dashboard SQL Editor 推奨） |
| 結果 output の**解釈・PASS/FAIL 判定** | Claude + CEO |
| secret / DB password / connection string 管理 | **CEO のみ** |

### Claude が**しないこと**

- `supabase` CLI / `psql` を直接実行
- migration ファイルの内容を変更（merge 済、変更は別 PR）
- production への適用試行
- service_role / DB password / connection string を chat に貼ること
- `supabase/.temp/` 配下を編集

### Claude が**すること**

- 本 PR で smoke SQL を起草（schema-smoke + behavior-smoke）
- CEO の sanitized output を受け取り、設計と整合しているか検証
- FAIL があれば原因分析と修正案提示（修正は別 PR）

---

## 3. 適用方式（CEO が選択、推奨 Option 1）

### Option 1（推奨）: 別 git worktree で staging 専用 link

```bash
# CEO の shell のみ（値を Claude に渡さない）
cd /Users/haradataishi
git -C Culcept fetch origin
git -C Culcept worktree add ../culcept-staging origin/main
cd ../culcept-staging
supabase link --project-ref <STAGING_REF>   # 認証 prompt
supabase db push --linked                    # staging に migration 適用
```

メリット:
- 元 repo (`/Users/haradataishi/Culcept`) の `supabase/.temp/` を一切変更しない
- `git worktree remove ../culcept-staging` で完全ロールバック可能

### Option 2: Dashboard SQL Editor で手動適用

CEO が staging Dashboard → SQL Editor で以下を順次 Run:

1. `supabase/migrations/20260430100000_external_anchors.sql` の中身を貼り付け → Run
2. `supabase/migrations/20260430110000_plan_drift_events.sql` の中身を貼り付け → Run

メリット: CLI 誤操作リスクゼロ、最も視覚的。

### Option 3: psql 直接

```bash
# CEO の shell のみ。Claude には connection string を一切渡さない
export STAGING_DB_URL="postgres://postgres:...@db.<ref>.supabase.co:5432/postgres"
psql "$STAGING_DB_URL" -f supabase/migrations/20260430100000_external_anchors.sql
psql "$STAGING_DB_URL" -f supabase/migrations/20260430110000_plan_drift_events.sql
unset STAGING_DB_URL  # shell 履歴からも削除推奨
```

---

## 4. Smoke 実行順序

CEO は migration 適用後、以下を**この順序**で実行：

### Pre-step: staging Auth に test user を 1 人作成（A-1 必須）

Behavior smoke は FK (`auth.users`) 違反を回避するため、staging Auth に
実 test user を 1 人作成し、その UUID を smoke SQL に貼り付ける。

**Supabase hosted SQL Editor では `session_replication_role = replica` の
SET が権限不足で拒否される**（superuser-only パラメータ）。そのため
superuser-only な FK 一時無効化は使わず、実 test user UUID で FK を満たす方式
を採用する。

CEO 操作:

```
1. staging Dashboard → Authentication → Users → "Add user" (manual)
2. Email:        smoke-test@culcept.staging（dummy で OK）
3. Password:     Dashboard 自動生成 → CEO 保管（Claude には渡さない）
4. Confirm:      yes（or auto-confirm 設定で skip）
5. 作成された user の UUID をコピー（例: 550e8400-e29b-41d4-a716-...）
6. Claude に渡す sanitized output に「test user UUID = <UUID>」を含める
```

**test user UUID は public でも機密でもない**（test 専用、本人 user data なし）。
sanitized output と同列扱いで Claude に渡してよい。Email / Password は CEO のみ
保管、Claude に渡さない。

smoke 完了後も test user は staging に残してよい（A-1 再実行 / A-2 で再利用）。

### Step 1: Schema smoke（read-only、副作用ゼロ）

```
scripts/staging-smoke/alter-plan-w1-schema-smoke.sql
```

確認内容:
- テーブル 3 つ存在（external_anchor_sources / external_anchors / plan_drift_events）
- 各テーブルのカラム数と型
- CHECK constraint 一覧（計 21 件）
- index 一覧
- RLS enabled = true（全 3 テーブル）
- pg_policies で各テーブルの policy 数
- **plan_drift_events に UPDATE policy 不在**（append-only）
- COMMENT が設計書 §X.Y 参照を含む

### Step 2: Behavior smoke（transaction-scoped、ROLLBACK で副作用ゼロ）

```
scripts/staging-smoke/alter-plan-w1-behavior-smoke.sql
```

**実行前の必須操作**: SQL ファイル内の `<REPLACE_WITH_STAGING_TEST_USER_UUID>`
を、上記 Pre-step で作成した test user の UUID に置換してから Dashboard
SQL Editor で Run する。

含まれない方針（superuser-only 操作回避）:
- `SET LOCAL session_replication_role = replica` 等の Supabase hosted で
  権限拒否される設定変更は一切使わない
- FK は実 test user UUID で満たす

→ 完全に SELECT のみ、副作用ゼロ。

### Step 2: Behavior smoke（transaction-scoped、ROLLBACK で副作用ゼロ）

```
scripts/staging-smoke/alter-plan-w1-behavior-smoke.sql
```

確認内容:
- valid INSERT 2 種類が成功（one_off / recurring）
- 違反 INSERT が `check_violation` で reject される（10 ケース以上）
- 全テストが `DO $$ ... EXCEPTION $$;` で wrap、`RAISE NOTICE` で PASS/FAIL を出力

→ `BEGIN; ... ROLLBACK;` で完全に rollback、staging に実データ残さない。

---

## 5. RLS smoke の限界（重要）

**Dashboard SQL Editor は `postgres` superuser role で実行されるため、RLS は bypass される**。
psql で connection string 経由でも同様（postgres role）。

つまり：
- A-1 で確認するのは **RLS policy が**「**存在する**」「**正しい定義を持つ**」**こと**まで
- 実 user 文脈での RLS enforcement は確認できない

実 enforcement の verification は **A-2（W1-4 real insert）以降の API smoke で行う**:
- Supabase client（anon key 経由）→ `authenticated` role → `auth.uid()` が効く
- 異なる user_id で INSERT 試行 → 自分のデータしか書けないことを確認

このセクションを CEO・私（Claude）双方が認識した上で A-1 を実行する。

---

## 6. CEO が Claude に渡してよい sanitized output

| 種別 | 例 | 安全性 |
|---|---|---|
| テーブル一覧 | `external_anchor_sources / external_anchors / plan_drift_events` | ✅ |
| カラム情報 | `\d external_anchors` の出力 | ✅ |
| CHECK 制約一覧 | constraint name + definition | ✅ |
| index 一覧 | `\di+` の出力 | ✅ |
| RLS policy 一覧 | policy name + cmd + qual | ✅ |
| Behavior smoke の RAISE NOTICE 出力 | `TEST 1 PASSED: anchor_kind_one_off rejected validFrom` | ✅ |
| 件数 | `SELECT count(*) FROM external_anchors` 等 | ✅ |
| **staging 用 test user UUID**（Pre-step §4 で作成、test 専用、本人 data なし） | `550e8400-e29b-41d4-a716-...` | ✅ |

## 7. CEO が Claude に**絶対**渡してはいけない output

| 種別 | 理由 |
|---|---|
| Connection string（postgres://...） | DB password 埋め込み |
| DB password 単体 | postgres 最高権限 |
| service_role key | RLS bypass 可能 |
| 実 user_id UUID（既存 production user 由来） | プライバシー |
| migration 適用ログのうち、connection string や認証 token を含む生 output | 同上 |
| Sentry / log の生 trace（PII 混入可能性） | 同上 |

**sanitization の原則**: 値はマスクして種別だけ Claude に伝える（例: `postgres://***:***@db.<masked>.supabase.co:5432/postgres`）。

---

## 8. PASS / FAIL 判定基準

### 8.1 Schema smoke PASS 基準（全 yes で PASS）

- [ ] テーブル 3 件が `public` schema に存在
- [ ] `external_anchor_sources` のカラム数 = 11（id, user_id, source_type, original_filename, extracted_at, captured_at, raw_retention, raw_storage_path, raw_expires_at, notes, created_at）
- [ ] `external_anchors` のカラム数 = 19（base 13 + recurrence 6）
- [ ] `plan_drift_events` のカラム数 = 13
- [ ] CHECK 制約合計 = 21 件以上（W1-3 の 12 件 + W1-5 の 9 件）
- [ ] index 合計 ≥ 6 件（external_anchors 3 + sources 2 + drift 3 — partial 含む）
- [ ] 全 3 テーブルで `relrowsecurity = true`
- [ ] RLS policy 数:
  - `external_anchor_sources`: 4（SELECT / INSERT / UPDATE / DELETE）
  - `external_anchors`: 4（同上）
  - `plan_drift_events`: **3（SELECT / INSERT / DELETE のみ、UPDATE 不在）**
- [ ] `COMMENT ON TABLE plan_drift_events` に "APPEND-ONLY" を含む

### 8.2 Behavior smoke PASS 基準（全 yes で PASS）

- [ ] valid one_off INSERT が成功
- [ ] valid recurring INSERT が成功
- [ ] 違反 INSERT 11 ケース全てが `check_violation` で reject:
  - one_off + validFrom 設定
  - one_off + recurrenceRule 設定
  - recurring + date 設定
  - recurring + validFrom 欠落
  - recurring + recurrenceRule 欠落
  - validity_window_order 違反（valid_until < valid_from）
  - recurrence_rule 501 文字
  - rawRetention='discarded' + rawStoragePath 設定
  - rawRetention='stored' + rawStoragePath 欠落
  - target_snapshot に配列を設定（jsonb_typeof != 'object'）
  - confirmed_at NULL 試行（NOT NULL）
- [ ] 全テストの RAISE NOTICE 出力が `PASSED` を含む
- [ ] transaction が ROLLBACK で完了、staging DB に永続データなし

### 8.3 FAIL 時の対応

- 個別 CHECK が発火しない → migration の CHECK 定義に問題、別 PR で修正
- 全件発火しない → migration 全体未適用の可能性、CEO が migration 適用ログ再確認
- 予期しない table / column が出る → migration 順序の問題、または別 schema の混入

→ FAIL 時は A-2 着手 を停止、原因切り分けを別タスクで実施。

---

## 9. Rollback / Cleanup

### 9.1 Behavior smoke の rollback

各 transaction が `BEGIN; ... ROLLBACK;` で wrap されているため、smoke 実行**後**の staging DB に実データ残らない。明示的な cleanup 不要。

### 9.2 Migration を取り消したい場合（staging 限定）

A-1 で migration を staging に適用後、**スキーマを完全に戻したい**ケース：

```sql
-- staging Dashboard SQL Editor で実行（CEO 操作）
DROP TABLE IF EXISTS public.plan_drift_events CASCADE;
DROP TABLE IF EXISTS public.external_anchors CASCADE;
DROP TABLE IF EXISTS public.external_anchor_sources CASCADE;
```

これは staging 専用、production では絶対実行しない。`CASCADE` でビュー / 依存も削除される。

### 9.3 Worktree のクリーンアップ（Option 1 採用時）

```bash
cd /Users/haradataishi
git -C Culcept worktree remove ../culcept-staging
```

→ staging link 設定も削除される。

### 9.4 Staging project 自体の破棄

CEO が Dashboard → Project Settings → "Delete project"。
A-1 で何か致命的な問題が発覚した場合の最終手段。production には影響なし。

---

## 10. A-1 完了 checkpoint

CEO が以下すべてを yes と確認できれば A-1 完了：

- [ ] migration 適用が完了（Option 1/2/3 のいずれか）
- [ ] **Schema smoke の全 8 項目** PASS（§8.1）
- [ ] **Behavior smoke の全項目** PASS（§8.2）
- [ ] staging DB に実データ残っていない（behavior smoke ROLLBACK 後）
- [ ] 既存 production linked project に変更なし
- [ ] `.env.local` に変更なし
- [ ] Claude には sanitized output のみ渡した（connection string / password 等は渡していない）

すべて yes なら **A-2（W1-4 real insert）へ進める**。

---

## 11. A-2 への引き継ぎ

A-2 では以下に着手:

1. `origin/main` から新 branch (`feat/alter-plan-w14-real`) を切る
2. Supabase 実装の `ExternalAnchorRepository` を作成（既存の `MemoryExternalAnchorRepository` と同じ interface 実装）
3. API route (`app/api/plan/anchors/`) で create / list / delete を提供
4. Plan UI を Supabase に接続（feature flag 配下）
5. 実 API 経由の RLS smoke（user-scoped enforcement を確認、A-1 でできなかった部分）

A-1 完了が前提。Schema が staging に存在することが確定してから A-2 を着手する。

---

## Appendix A: Smoke ファイル

| ファイル | 用途 |
|---|---|
| `scripts/staging-smoke/alter-plan-w1-schema-smoke.sql` | 副作用ゼロの読み取り型 smoke |
| `scripts/staging-smoke/alter-plan-w1-behavior-smoke.sql` | transaction-scoped の CHECK 発火 smoke |

両方とも CEO の権限（postgres role）で実行。Claude は実行しない。

---

## Appendix B: 設計書との traceability

本 A-1 smoke で検証する不変原則は以下の設計書セクションに対応：

- `docs/alter-plan-foundation-design.md` §2.0 — Anchor / Seed 境界
- §2.1 — ExternalAnchor discriminated union
- §2.3 — PlanDriftEvent polymorphic target + targetSnapshot
- §4.2 — AlterConfirmation paused / terminal（A-1 範囲外）
- §11 — Privacy & Source Trace
- §12 — Validity / Exceptions Model

---

## まとめ

**A-1 = staging migration 適用 + smoke で schema/RLS/CHECK/index/append-only を非破壊検証する**。

不変条件：
- Claude は DB 操作を直接実行しない（migration / psql / db push / db reset）
- Behavior smoke は ROLLBACK で副作用ゼロ
- Schema smoke は read-only
- RLS の実 enforcement は A-2 で API 経由検証（A-1 では policy 存在のみ）
- sanitization 原則で secret を Claude に渡さない
