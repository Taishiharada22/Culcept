# Phase 3-J PR Runbook (= GitHub 復旧後の安全な push / PR 順序)

**作成日**: 2026-05-22
**承認**: CEO (= 2026-05-22 closeout runbook 整理指示)
**用途**: GitHub 操作禁止が解除された時に、 本 runbook の手順だけで安全に PR 化する

---

## 0. 前提

- 本 runbook 作成時点: `push / pull / fetch / gh` **すべて禁止中**
- 復旧時の判定権: CEO
- 復旧前にこの runbook を実行してはいけない
- 復旧時、 CEO 明示承認のもとで手順 1 から順に実行する

---

## 1. 現在の branch 状態

### 1.1 Branch 一覧 (= 2026-05-22 時点、 closeout 直前 state)

| Branch | HEAD | 状態 | 内容 |
|---|---|---|---|
| `feat/alter-plan-phase3-j6-tab-integration` | `68d41d32` | 🔒 frozen | J-6a 〜 J-7 (= 9 commits) |
| `chore/plan-proposalToAnchorInput-tsc-carryover` | `bf25ec17` | 🔒 frozen | docs lineage 補正 + test type fix (= 2 commits、 feat HEAD 上に積み) |
| `docs/plan-phase3-j-closeout` | (本 commit 着地時に確定) | active | 本 runbook + closeout audit + deferred ledger + decision-log entry (= N commits、 chore HEAD 上に積み) |

### 1.2 系譜 (= operational lineage)

```
main
 │
[main 系列の長い歴史]
 │
 b07eeab5 / b4ab331e 系 (= upstream historical root)
 │
[integration/plan-phase3-j-on-g-h-i 系列]
 ├ J-1 系列 merge (= 8ede126e)
 ├ J-2/3/4/5 merge (= 7e5f59d5)
 ├ Phase 2-G/H/I merge (= 4c7aac16 / 27a14503 / 67e5da89)
 │
 ↓ logical base = 7e5f59d5
 │
[feat/alter-plan-phase3-j6-tab-integration]
 ├ J-6a (378c0744)
 ├ J-6b (17dac1df)
 ├ J-6c (972243a6)
 ├ J-6d (f6b1ce66)
 ├ J-6e-1 (080b8ba9)
 ├ J-6e-2 (506bab48)
 ├ J-6e-3 (75f07dea)
 ├ J-6e-4 (1e6a92a8)
 └ J-7 (68d41d32) ← 🔒 feat frozen HEAD
       │
       ↓
[chore/plan-proposalToAnchorInput-tsc-carryover]
 ├ docs lineage 補正 (43991b58)
 └ test type fix (bf25ec17) ← 🔒 chore frozen HEAD
       │
       ↓
[docs/plan-phase3-j-closeout]
 ├ closeout audit doc
 ├ deferred smoke ledger doc
 ├ PR runbook doc (= 本 doc)
 └ decision-log closeout entry
```

---

## 2. PR 順序 (= 3 つの PR を順次)

### 2.1 PR #A: feat → main

**Branch**: `feat/alter-plan-phase3-j6-tab-integration` → `main`

**Title**: `feat(plan): Phase 3-J-6 — PlanClient proposal 系統合 (J-6a〜J-6e-4 + J-7 limited smoke/audit PASS)`

**Body (= 推奨)**:
```markdown
## Summary
- Phase 3-J-6 (= PlanClient proposal 系統合) 8 sub-phases + J-7 limited smoke/audit
- 9-gate proposal pipeline + 5-layer accept dup defense + SSR hydration safety
- Memory Chip 思想維持 (= 警告色 / pulse / drop-shadow なし、 subtle pending UX)
- localStorage write key 2 種固定 (proposalDismiss.v1 + proposalUndo.v1)

## Status
- plan unit tests: 1463 / 1463 PASS
- tsc J-6 surface: errors = 0
- J-7 **limited smoke/audit** PASS (= 「fully smoke PASS」 ではない)
- real-data proposal chip visibility smoke is **deferred** due to data gate not satisfied
  (Onboarding Quietude + pattern_repeat 条件、 これは FAIL ではない、 構造的に正常)

## Test plan
- [ ] CI: plan unit tests PASS
- [ ] CI: tsc J-6 surface error 0 確認
- [ ] Reviewer: docs/alter-plan-phase3-j-closeout-audit.md 確認
- [ ] Reviewer: docs/alter-plan-phase3-j-deferred-smoke-ledger.md 確認
- [ ] CEO: limited smoke/audit PASS wording 維持確認

## 永続制約遵守
- TestOverrideContext production path 注入なし
- DB 直接 insert/update/delete なし
- confirmedAt schema/API 変更なし
- migration / env / new dependency 変更なし

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Merge 方式**: GitHub UI で **squash merge** (= 9 commits → 1 commit on main)
- 既存 J-1〜J-5 と同じ pattern (= integration branch → main の squash)
- branch は frozen のため rebase / force push 不可

**着地後**: main に J-6 系列の squash commit 1 件追加。 frozen feat branch は GitHub 上に残るが、 本 PR で「実質取り込み完了」 扱い。

### 2.2 PR #B: chore → main

**Branch**: `chore/plan-proposalToAnchorInput-tsc-carryover` → `main`

**前提**: PR #A が main に着地した **後** に実行

**Title**: `chore(plan): J-6 branch base lineage 補正 + proposalToAnchorInput test helper 型 narrowing carry-over fix`

**Body (= 推奨)**:
```markdown
## Summary
- J-7 entry の 「main から直接派生」 表記補正 (= logical base は integration branch)
- J-6e-3 commit 75f07dea 由来の test helper 型 narrowing tsc carry-over を軽量修正
- runtime 変更なし、 production path 不触、 test 1 file のみ touch

## Status
- proposalToAnchorInput.test.ts tsc errors: 0 (= carry-over 解消)
- vitest: 12 / 12 PASS
- plan unit tests total: 1463 / 1463 PASS (= 回帰なし)

## Test plan
- [ ] CI: tsc carry-over error 解消確認
- [ ] CI: plan unit tests PASS
- [ ] Reviewer: production code (lib/plan/**) に diff 0 確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Merge 方式**: GitHub UI で **squash merge** (= 2 commits → 1 commit on main)

**着地後**: main に chore squash commit 1 件追加。 frozen chore branch は GitHub 上に残る。

### 2.3 PR #C: docs/plan-phase3-j-closeout → main

**Branch**: `docs/plan-phase3-j-closeout` → `main`

**前提**: PR #A + PR #B が main に着地した **後** に実行

**Title**: `docs(plan): Phase 3-J closeout — audit / deferred smoke ledger / PR runbook + decision-log`

**Body (= 推奨)**:
```markdown
## Summary
- Phase 3-J を計画上の最後まで整理する closeout 一式
- 3 docs file 追加 + decision-log entry 追加
- 初期ユーザー獲得には進まない (= CEO 方針)
- 「fully smoke PASS」 とは書かない wording 規約を docs 化

## 追加 docs
- `docs/alter-plan-phase3-j-closeout-audit.md` — 完了監査 + 永続制約遵守確認
- `docs/alter-plan-phase3-j-deferred-smoke-ledger.md` — deferred 5 項目 + 解消条件
- `docs/alter-plan-phase3-j-pr-runbook.md` — 本 runbook (= GitHub 復旧後手順)

## decision-log update
- Phase 3-J 全体 closeout entry 追加 (= J-7 PASS + Option B + Closeout 一括)

## Test plan
- [ ] Reviewer: 3 docs file の内容確認
- [ ] CEO: 「fully smoke PASS」 表現が存在しないこと grep 確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Merge 方式**: GitHub UI で **squash merge** または **regular merge** (= CEO 判断、 docs only のため squash 推奨)

---

## 3. 復旧時の手順 (= step-by-step)

### Step 1: 復旧確認 (= CEO 承認)

CEO が以下を明示承認するまで Step 2 以降を実行しない:

- ✅ push / pull / fetch / gh 操作の禁止解除
- ✅ 本 runbook の手順実行 GO

### Step 2: remote 同期確認 (= read-only)

```bash
# 復旧後の最初の操作。 まず remote 状態を read-only で確認。
git fetch --dry-run origin main
git remote -v
# 上記で何が起きるか確認してから fetch 実行
git fetch origin main
git log --oneline origin/main..HEAD --all | head -20  # ローカル先行 commit を表示
```

### Step 3: PR #A push

```bash
# feat branch を push
git push -u origin feat/alter-plan-phase3-j6-tab-integration
# GitHub UI で PR 作成 (= 上記 PR #A body 使用)
# CI 結果待ち
# CEO 承認後、 GitHub UI で squash merge
```

### Step 4: PR #B push (= PR #A merge 後)

```bash
# chore branch を push
git push -u origin chore/plan-proposalToAnchorInput-tsc-carryover
# GitHub UI で PR 作成 (= 上記 PR #B body 使用)
# CI 結果待ち
# CEO 承認後、 GitHub UI で squash merge
```

### Step 5: PR #C push (= PR #A + #B merge 後)

```bash
# closeout docs branch を push
git push -u origin docs/plan-phase3-j-closeout
# GitHub UI で PR 作成 (= 上記 PR #C body 使用)
# CEO レビュー
# CEO 承認後、 GitHub UI で squash merge
```

### Step 6: 最終確認

```bash
# main に 3 つの squash commit が着地したことを確認
git fetch origin main
git log origin/main --oneline --max-count=10
# decision-log の closeout entry が含まれていること確認
# Phase 3-J closeout 完了状態を docs/decision-log.md に追記 (= 別 PR、 復旧後の任意作業)
```

---

## 4. 失敗時 rollback

### PR #A が CI で fail した場合

- CEO に報告
- failure 内容を切り分け:
  - **本 branch 由来の真の regression** → 新 branch で fix PR を別途立てる (= frozen branch は触らない)
  - **CI 環境の問題** → CI 再走らせる
  - **pre-existing carry-over の表面化** → CEO 判断で許容 or 別 fix PR

### PR #B または #C で fail した場合

- 同上の切り分け
- frozen branch (`feat` / `chore`) には触らない (= 永続制約)
- 必要なら **新 branch** で追加 fix PR

### main への着地後の問題発覚

- revert PR を別途立てる (= main を直接触らない)
- 復旧時の禁止 list (= push --force / reset --hard) は **永続維持**

---

## 5. 復旧後の永続制約 (= push 解除後も継続)

- ❌ frozen branch (`feat/alter-plan-phase3-j6-tab-integration` + `chore/plan-proposalToAnchorInput-tsc-carryover`) を delete しない
- ❌ frozen branch を rebase しない
- ❌ frozen branch に force push しない
- ❌ main に force push しない (= 永続)
- ❌ stash / reset --hard / restore (= CLAUDE.md Rule 7 永続)
- ❌ TestOverrideContext production 注入
- ❌ DB 直接 insert/update/delete
- ❌ confirmedAt schema / API 変更
- ❌ dev fixture API 実装
- ❌ K / L / M / N 着手
- ❌ Transport API
- ❌ Arrival Risk Memory

---

## 6. 関連 docs

- `docs/alter-plan-phase3-j-closeout-audit.md` — closeout 監査本体
- `docs/alter-plan-phase3-j-deferred-smoke-ledger.md` — deferred 5 項目台帳
- `docs/alter-plan-phase3-predictive-day-orchestration-architecture.md` — Phase 3 設計書
- `docs/decision-log.md` — 全 decision 正史
- `CLAUDE.md` — Rule 7 (State Safety) + Rule 8 (Work-Start Verification)

---

## 7. 完了判定

本 runbook の Step 1 〜 Step 6 がすべて PASS し、 main の history に:
- J-6 系列 squash commit (= PR #A)
- chore carry-over fix squash commit (= PR #B)
- closeout docs squash commit (= PR #C)

が含まれた時点で、 **Phase 3-J 全体の main 着地完了**。 次 phase に進む整合状態となる。

