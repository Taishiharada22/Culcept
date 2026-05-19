# Alter Plan A-5 — Staging Smoke Auto-Trigger Stage 2 Mini Design

**作成日**: 2026-05-19
**Status**: 採択（A-5 実装の起点）
**関連**: `docs/alter-plan-a4-ci-integration-mini-design.md`, `.github/workflows/staging-smoke.yml`
**実装範囲**: 同一 PR (`feat/alter-plan-a5-auto-trigger`) で着地

---

## 1. 目的

A-4 で **workflow_dispatch** による手動実行が安定運用に入った。
A-5 では **`pull_request` (paths-filter) trigger** を追加し、Plan 関連 PR の push で smoke が自動キックされる状態に昇格する。

ただし **Environment `staging-smoke` + required reviewers (CEO 承認) ゲートは継続発火**するため、auto-trigger でも CEO 承認なしには smoke は実行されない。これにより安全境界は A-4 から不変。

---

## 2. 設計の核心

| # | 原則 | 機械的保証 |
|---|------|----------|
| 1 | `workflow_dispatch` は維持（緊急手動実行手段） | 既存 trigger を残す |
| 2 | `pull_request` trigger 追加（paths-filter で Plan 関連のみ） | 他ストリーム (Coalter 等) PR 時の noise 排除 |
| 3 | **Environment ゲート維持** = CEO 承認なしには走らない | `environment: staging-smoke` + required reviewers |
| 4 | concurrency `staging-smoke` で 1 本化 | 並列 PR の staging race を物理回避 |
| 5 | secret は Environment secrets のみ、env: 経由で受け取り | 既存と同じ |
| 6 | service_role / DB password / connection string 不使用 | 既存と同じ |
| 7 | **初期は CEO が auto-trigger run を観察**、required reviewers 緩和は別 wave | 段階的安全 |

---

## 3. Path Filter 対象

Plan 機能の変更があった PR でのみ trigger:

```yaml
paths:
  - "lib/plan/**"
  - "app/api/plan/**"
  - "app/api/plan-items/**"  # 将来別 namespace に分けた場合の安全網
  - "app/(culcept)/plan/**"
  - "scripts/staging-smoke/**"
  - ".github/workflows/staging-smoke.yml"  # workflow 自体の変更時
```

これにより：
- ✅ Plan 関連 PR → 自動 smoke trigger（CEO 承認待ち）
- ✅ Coalter / Stargazer / Genome 等 PR → smoke を trigger しない

---

## 4. Stage 2 昇格後の運用フロー

```
[Developer / Claude が Plan 関連 PR push]
   ↓
[GitHub Actions が pull_request trigger 検出]
   ↓
[paths-filter で Plan 関連 確認]
   ↓
[concurrency group "staging-smoke" を取る（並列 PR は queue）]
   ↓
[Environment "staging-smoke" 保護で停止 — CEO 承認待ち]
   ↓
[CEO が GitHub UI で "Approve and run"]
   ↓
[smoke 実行: 18 行]
   ↓
[結果が PR の check status に反映]
```

**注意**: required reviewers ゲートにより CEO 承認なしには走らない。これは Stage 1 (workflow_dispatch) と同じ安全境界。

---

## 5. やらない（A-5 範囲外）

- **required reviewers 緩和**（A-6 で別判断、安定運用後）
- **fork PR 対応**（fork PR は default で secret を読めない、設計上対応不要）
- **Vercel deploy 連携**（CI と独立）
- migration / production / env / Vercel env / .env.local
- service_role / DB password / connection string / JWT secret
- W1-6 / W1-8 / Home / 横スワイプ

---

## 6. ファイル構成

```
docs/alter-plan-a5-auto-trigger-mini-design.md   # 新規
.github/workflows/staging-smoke.yml              # 拡張: pull_request trigger 追加
docs/alter-plan-a4-ci-integration-mini-design.md # 更新: Stage 2 着地反映
docs/alter-plan-a2-rls-smoke.md                  # 更新: 「PR push 時に CEO 承認待ち状態に入る」運用に変更
```

---

## 7. CEO への影響と確認事項

### CEO に追加で求める操作

**ゼロ**。A-4 で既に Environment + required reviewers を設定済み。A-5 ではその設定をそのまま再利用する。

### CEO が受ける変化

- Plan 関連 PR を作るたびに、Actions タブに smoke run が **CEO 承認待ち** で並ぶ
- 承認しないと smoke は走らない（GitHub のメール / Web UI 通知）
- 承認なしで PR を merge することも可能（lint-and-test と Vercel の通常 CI で十分なら）

### 観察期間

- 初期 (A-5 着地直後): CEO が auto-trigger run を毎回承認 → 観察 → 不要なら skip / merge
- 5 回連続成功 + CEO 判断後: A-6 で required reviewers 緩和を別判断（auto-run 化）

---

## 8. 受容判定（DoD）

- ✅ `.github/workflows/staging-smoke.yml` に `pull_request` (paths-filter) trigger 追加
- ✅ workflow_dispatch trigger は維持
- ✅ Environment / required reviewers / concurrency は不変
- ✅ docs にて Stage 2 着地 + 運用変化を明示
- ✅ `npx tsc --noEmit` 0 errors（workflow YAML は対象外、コードに影響なし）
- ✅ `npx vitest run tests/unit/plan/` 全 PASS（コードに影響なし）
- ✅ ローカル `npm run build` PASS

---

**結論**: A-5 で smoke が Plan 関連 PR push 時に自動キックされる状態に昇格。Environment 保護で安全境界は不変。required reviewers 緩和は A-6 で別判断。
