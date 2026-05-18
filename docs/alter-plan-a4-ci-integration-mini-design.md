# Alter Plan A-4 — CI Integration Mini Design

**作成日**: 2026-05-18
**Status**: 採択（A-4 実装の起点）
**関連**: `docs/alter-plan-a2-rls-smoke.md` / `scripts/staging-smoke/a2-rls-api-smoke.ts`
**実装範囲**: 同一 PR (`feat/alter-plan-a4-ci-integration`) で着地

---

## 1. 目的

W1-X1〜W1-X3 で beta user 渡し前の機能完成度に到達した。
A-4 では **staging Supabase に対する RLS API smoke を GitHub Actions から実行可能**にすることで、開発の安全網（退行検知）を整える。

ただし、auto-trigger（PR push ごとに自動実行）は将来昇格判断。**初版は workflow_dispatch（手動 trigger）で安定確認** から始める（GPT 補正反映）。

---

## 2. 設計の核心（security best practice）

| # | 原則 | 機械的保証 |
|---|------|----------|
| 1 | secret は repository secrets ではなく **GitHub Environment secrets** に置く | `staging-smoke` Environment を作成 |
| 2 | Environment に **required reviewers** を設定 | CEO 承認なしで workflow 実行不可 |
| 3 | trigger は `workflow_dispatch` のみ | PR push で自動走らない（fork PR の secret 漏洩リスクを排除） |
| 4 | concurrency を `staging-smoke` group で 1 本化 | 並列 run による staging データの race 防止 |
| 5 | secret は workflow 内で `env:` 経由のみ | log には自動 redaction、明示的 echo 禁止 |
| 6 | artifact に secret を含めない | smoke 出力 (test_no/name/status/detail) のみ保存 |
| 7 | service_role / DB password / connection string / JWT secret は **絶対に設定しない** | docs で明示、smoke script の preflight guard で機械的拒否 |

---

## 3. Smoke Script 拡張（PATCH coverage）

既存 `scripts/staging-smoke/a2-rls-api-smoke.ts` は POST / GET / DELETE / no-JWT 401 を網羅。
A-4 で **PATCH /api/plan/anchor-items/[anchorId]** の 6 シナリオを追加：

| # | シナリオ | 期待 |
|---|---------|------|
| ❶ | User A の anchor を A が PATCH | 200 + title 更新 |
| ❷ | User B が User A の anchorId を PATCH | 404 (情報漏洩防止) |
| ❸ | 無認証 PATCH | 401 |
| ❹ | invalid patch (startTime 形式違反) | 422 |
| ❺ | anchorKind 変更 patch | 200 + existing kind 維持 |
| ❻ | id/userId/sourceId 改竄 patch | 200 + 元値維持 |

これらを既存 smoke flow に挿入。Pre/Post-cleanup は既存（test_no 18-20）を流用。

---

## 4. GitHub Actions Workflow（`.github/workflows/staging-smoke.yml`）

```yaml
name: Staging RLS API Smoke

on:
  workflow_dispatch:
    inputs:
      reason:
        description: "Why are you running this smoke?"
        required: false
        default: "manual verification"

concurrency:
  group: staging-smoke
  cancel-in-progress: false

jobs:
  smoke:
    runs-on: ubuntu-latest
    environment:
      name: staging-smoke
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
      STAGING_SUPABASE_PROJECT_REF: ${{ secrets.STAGING_SUPABASE_PROJECT_REF }}
      STAGING_USER_A_EMAIL: ${{ secrets.STAGING_USER_A_EMAIL }}
      STAGING_USER_A_PASSWORD: ${{ secrets.STAGING_USER_A_PASSWORD }}
      STAGING_USER_B_EMAIL: ${{ secrets.STAGING_USER_B_EMAIL }}
      STAGING_USER_B_PASSWORD: ${{ secrets.STAGING_USER_B_PASSWORD }}
      STAGING_API_BASE: http://localhost:3000
      PLAN_ROUTE_LIVE: "true"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - name: Start Next.js dev server (background)
        run: npm run dev > /tmp/dev.log 2>&1 &
      - name: Wait for dev server ready
        run: |
          for i in $(seq 1 60); do
            curl -sf http://localhost:3000 -o /dev/null && exit 0
            sleep 1
          done
          echo "dev server not ready"; cat /tmp/dev.log; exit 1
      - name: Run RLS API smoke
        id: smoke
        run: npx tsx scripts/staging-smoke/a2-rls-api-smoke.ts | tee /tmp/smoke.log
      - name: Upload smoke log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: staging-smoke-log
          path: /tmp/smoke.log
          retention-days: 14
```

**注意点**:
- `environment: staging-smoke` が **required reviewers ゲート**を発動
- secret は `env:` で個別に渡す（grep でも検索しやすい、典型エラー回避）
- `cancel-in-progress: false` で実行中の smoke を後続が殺さない
- secret は GitHub log で自動 redaction（`***` 表示）

---

## 5. CEO 必須操作（GitHub UI、A-4 完了の前提）

### Step 1. Environment 作成
1. Settings → Environments → "New environment"
2. 名前: **`staging-smoke`**

### Step 2. Required reviewers 設定
1. Environment ページの "Deployment protection rules"
2. ✅ "Required reviewers" → CEO (self) を追加
3. Save

### Step 3. Environment secrets 追加（7 件）
| Secret 名 | 取得元 |
|-----------|--------|
| `STAGING_SUPABASE_URL` | `.env.staging.local` から転記 |
| `STAGING_SUPABASE_ANON_KEY` | 同上 |
| `STAGING_SUPABASE_PROJECT_REF` | 同上 |
| `STAGING_USER_A_EMAIL` | 同上 |
| `STAGING_USER_A_PASSWORD` | 同上 |
| `STAGING_USER_B_EMAIL` | 同上 |
| `STAGING_USER_B_PASSWORD` | 同上 |

**🚫 絶対設定しない**: `SUPABASE_SERVICE_ROLE_KEY` / DB password / connection string / JWT secret

### Step 4. Workflow 実行（manual trigger）
1. Actions タブ → "Staging RLS API Smoke" を選択
2. "Run workflow" → branch (e.g. `main`) を選択 → "Run"
3. **CEO 自身が "Approve and run"** ボタンを押す（required reviewer ゲート）
4. workflow 実行開始

### Step 5. 出力確認
1. Workflow run page で "Run RLS API smoke" step の log を見る
2. Artifact `staging-smoke-log` をダウンロード可能（14 日保持）
3. **全 status が PASSED** なら A-4 PASS

---

## 6. Stage 2 昇格条件（auto-trigger 移行、別判断）

A-4 初版（workflow_dispatch）で **5 回連続成功 + CEO 判断** を満たしたら、auto-trigger 昇格を検討：

```yaml
on:
  workflow_dispatch:
    ...
  pull_request:
    paths:
      - "lib/plan/**"
      - "app/api/plan/**"
      - "scripts/staging-smoke/**"
      - ".github/workflows/staging-smoke.yml"
```

ただし auto-trigger 移行は **A-5 として別 PR / 別 CEO 判断**。本 wave では含めない。

---

## 7. やらない（A-4 範囲外）

- PR push 自動 trigger（Stage 2 で別判断）
- Vercel deploy 連携（CI と独立）
- migration / production / .env.local
- Vercel env 変更
- service_role / DB password / connection string
- Home / nav / 横スワイプ / W1-6 / W1-8 / W1-Y / RPC

---

## 8. ファイル構成

```
docs/alter-plan-a4-ci-integration-mini-design.md   # 新規
scripts/staging-smoke/a2-rls-api-smoke.ts          # 拡張: PATCH 6 シナリオ
.github/workflows/staging-smoke.yml                # 新規
docs/alter-plan-a2-rls-smoke.md                    # 更新: A-4 workflow へのリンク追記
```

---

## 9. 受容判定（DoD）

- ✅ smoke script に PATCH 6 シナリオ追加
- ✅ workflow_dispatch で実行可能
- ✅ Environment + required reviewer + concurrency 設定
- ✅ artifact に secret 含まれていない
- ✅ docs に CEO 操作手順
- ✅ Stage 2 昇格条件明文化
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `npx vitest run tests/unit/plan/` 全 PASS
- ✅ ローカル `npm run build` PASS

---

**結論**: A-4 で staging smoke の自動化基盤を整備。手動 trigger で安定確認した後、auto-trigger 昇格は A-5 で別判断。
