# Alter Plan A-2 — Staging RLS API Smoke 手順

**作成日**: 2026-05-17
**Status**: 運用ガイド（CEO 実行）
**関連**: `scripts/staging-smoke/a2-rls-api-smoke.ts`, `staging.env.example`
**前提**: A-1 完了（staging Supabase + migration apply 済み）

---

## 1. このスモークが検証すること

**ゴール**: `app/api/plan/anchors/` の API 経由で **RLS が物理層強制されている** ことを 2 user cross verification で実証する。

### 検証する不変原則

| # | 名称 | 検証方法 |
|---|------|---------|
| 認証境界 | 無認証で POST/GET/DELETE | すべて 401 |
| RLS read | User B から User A のデータが見えない | GET で空 list |
| RLS delete | User B が User A の source を削除できない | 200 + `deletedSource:false`（情報漏洩防止のため 404 にしない） |
| Information hiding | 「他人の source」と「存在しない source」を同一視 | DELETE 両ケースで同応答 |
| Cascade | source 削除で anchors も連動削除 | （A-2 では Repository unit test と DB CHECK で間接実証） |

### 検証「しない」もの（A-2 範囲外）

- migration 追加が必要な変更
- service_role / DB password / connection string
- production 環境
- W1-6 / W1-8 / Home の動作

---

## 2. 前提条件チェックリスト

| # | 項目 | 確認方法 |
|---|------|---------|
| 1 | A-1 schema/behavior smoke が全 PASS | `docs/alter-plan-a1-staging-smoke.md` |
| 2 | staging Supabase project が稼働中 | Supabase Dashboard で確認 |
| 3 | external_anchor_sources / external_anchors / plan_drift_events テーブル + RLS policy 8 本が apply 済み | A-1 schema smoke |
| 4 | Test user A (A-1 で使った `e71679b8-...` で OK) が staging に存在 | Authentication → Users |
| 5 | Test user B（新規）が staging に存在 | Authentication → Users で新規作成 |
| 6 | feat/alter-plan-w14-real branch 上で dev server を起動できる | git branch + npm run dev |

---

## 3. CEO 操作手順（順を追って）

### Step 1. Test user B を staging に作成（未作成なら）

1. staging Supabase Dashboard → Authentication → Users → "Add user"
2. **Email + password** で作成（既存 user A と同じ作成方法）
3. **Email confirmed** にチェック（confirm メール送らずに即有効化）
4. 作成された user の `id` を控える（後で confirm のみ、smoke 自体は email/password で sign in）

### Step 2. `.env.staging.local` を作成

```bash
cp staging.env.example .env.staging.local
```

`.env.staging.local` を編集して以下を埋める（**全項目必須**）：

```
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-public-key>
STAGING_USER_A_EMAIL=<user-a@example.com>
STAGING_USER_A_PASSWORD=<user-a-password>
STAGING_USER_B_EMAIL=<user-b@example.com>
STAGING_USER_B_PASSWORD=<user-b-password>
STAGING_API_BASE=http://localhost:3000
```

⚠️ **絶対書かない**:
- service_role key（anon key のみ）
- DB password / connection string
- production URL

`.env.staging.local` は `.env*.local` パターンで gitignored。コミットされない。

### Step 3. dev server を staging env で起動（Terminal A）

`.env.local` を **書き換えず**、dotenv-cli 経由で staging env を inject する：

```bash
npx dotenv -e .env.staging.local -- npm run dev
```

dev server が `http://localhost:3000` で立ち上がる。`@supabase/ssr` が staging URL を見るようになる。

⚠️ 起動 log で `NEXT_PUBLIC_SUPABASE_URL` が staging を指していることを確認。

### Step 4. Smoke 実行（Terminal B）

別ターミナルで：

```bash
npx tsx scripts/staging-smoke/a2-rls-api-smoke.ts
```

または `tsx` が env を読まない場合は明示的に：

```bash
npx dotenv -e .env.staging.local -- tsx scripts/staging-smoke/a2-rls-api-smoke.ts
```

### Step 5. 出力を確認

A-1 smoke と同じ format でテーブル出力：

```
test_no | name                                                      | status   | detail
─────────────────────────────────────────────────────────────────────────────────────
0       | SETUP: preflight + sign in                                 | PASSED   | API_BASE=http://localhost:3000
1       | SETUP: sign in user A & B (separate cookie stores)         | PASSED   | A=xxxxxxxx.. B=yyyyyyyy..
2       | PRE-CLEANUP: clear A and B data via API                    | PASSED   |
3       | User A: POST /api/plan/anchors → 200, data returned        | PASSED   | status=200 sourceId=...
4       | User A: GET sees own data only                             | PASSED   | sources=1 anchors=1
5       | User B: GET cannot see User A data                         | PASSED   | sources=0 anchors=0
6       | User B: DELETE on User A source → 200 + deletedSource:false| PASSED   | status=200 deletedSource=false
7       | User A: source still exists after B's failed DELETE        | PASSED   | sources=1
8       | No JWT: POST → 401                                         | PASSED   | status=401
9       | No JWT: GET → 401                                          | PASSED   | status=401
10      | No JWT: DELETE → 401                                       | PASSED   | status=401
11      | POST-CLEANUP: A and B data fully removed                   | PASSED   | a_sources=0 b_sources=0
─────────────────────────────────────────────────────────────────────────────────────
SUMMARY: 12 PASSED, 0 FAILED, 0 SKIPPED
```

---

## 4. PASS 判定基準

**A-2 RLS smoke PASS** = 以下すべて：

- exit code 0
- `SUMMARY` 行に `FAILED 0`
- 特に **test_no 5, 6, 7** が PASSED（RLS の核となる cross verification）
- 特に **test_no 8, 9, 10** が PASSED（auth gate）

**FAILED が 1 件でもある場合**:
- exit code 2 で終了
- A-2 PASS 判定保留
- 失敗 row の `detail` を CEO に共有 → 原因解析

---

## 5. 安全防御（script 内で自動 fail する条件）

下記いずれかが満たされた場合、smoke は **テスト実行前に即終了**：

| 条件 | 終了コード | メッセージ |
|------|-----------|-----------|
| 必須 env が未設定 | 1 | `Missing env: ...` |
| URL が staging / localhost / 127.0.0.1 を含まない | 1 | `PRODUCTION GUARD: ...` |
| ANON KEY 文字列に "service_role" を含む | 1 | `SECRET GUARD: ...` |
| sign in 失敗（email/password 不正） | 1 | `Sign-in failed for ...` |

これらは **fail-fast** 設計。production を間違って指定しても、API を一度も叩かずに止まる。

---

## 6. トラブルシューティング

### 「Sign-in failed」が出る

- staging Auth → Users で user の `Email confirmed at` が設定されているか確認
- password が正しいか確認（Reset password で再設定可能）

### test 3 が 422 になる

- migration が apply されているか確認（A-1 smoke）
- 特に `anchor_kind_one_off_columns` CHECK 制約が有効か

### test 5 で User B に User A のデータが見える

- **重大**: RLS policy が apply されていない可能性
- staging Dashboard → SQL Editor で:
  ```sql
  SELECT tablename, policyname FROM pg_policies
  WHERE tablename IN ('external_anchor_sources', 'external_anchors');
  ```
  8 row（各テーブル 4 policy）見えるはず

### test 8/9/10 が 200 / 500 になる

- API route の auth gate (`requireAuthenticatedUser`) が機能していない
- `lib/plan/api-helpers.ts` を確認

### dev server が `NEXT_PUBLIC_SUPABASE_URL=production` を見ている

- `.env.local` が staging を上書きしていないか確認
- `npx dotenv -e .env.staging.local -- npm run dev` を使う（`npm run dev` 単独だと `.env.local` が読まれる）

---

## 7. A-2 PASS 後の終了処理

CEO 判断で：

1. dev server (Terminal A) を Ctrl+C で停止
2. `.env.staging.local` はそのまま残す（次回 smoke で再利用）
3. Test user A / B は staging に残す（次の wave でも使う）

---

## 8. 次への接続

A-2 PASS 後の次の wave 候補（CEO 判断）:

- **A-3**: Vercel preview 環境（staging Supabase + smoke を CI 化）
- **A-4**: ephemeral Supabase test container を立てて完全 CI integration
- **W1-Y**: Postgres RPC `create_external_anchor_bundle()` migration で完全 atomicity 化
- **W1-5**: Plan UI / Plan 画面接続（Home 不変更）
- **W1-6**: passive drift logging（plan_drift_events 書き込み導線）
- **W1-8**: Home → Plan 導線

A-2 PASS は **凍結 branch ではない `feat/alter-plan-w14-real`** に対する PR mergeable 判定の前提条件。
