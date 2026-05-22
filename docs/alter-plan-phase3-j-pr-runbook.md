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

---

## 8. Diff Safety Addendum (= GitHub 復旧後の必須補強、 2026-05-22 追加)

### 8.0 本 addendum の動機 (= 「PR A/B/C のままで進めると危険」)

§2-§3 までの runbook は **「remote main が直接祖先 (= ancestral)」 という理想ケース** を前提にしている。
しかし local main が長く同期されていない場合、 remote main には過去 PR (= Phase 2-A〜2-I、 Phase 3-J-1〜J-5、 coalter #217-#220 等) が **squash merge** で着地している可能性が高い。

このとき、 frozen branches (= feat / chore / closeout) の history には **pre-squash original commits** が残っているため、 GitHub PR を作ると **巨大 diff として表示** される可能性がある。 これは 「本当の差分が大きい」 のではなく、 **「merge-base が古い位置で固定されているため」**。

本 addendum はこのリスクを機械的に検出し、 必要なら clean rebuild に分岐するための手順を定義する。

### 8.1 GitHub PR は three-dot diff で表示される

| 表記 | 意味 | 我々が見るタイミング |
|---|---|---|
| `A..B` (two-dot) | `git diff` では tree(A) と tree(B) の差分 (= 中身が同じなら 0) | local で `git diff` を打ったとき |
| `A...B` (three-dot) | `git diff` では merge-base(A,B) から B への差分 (= 「branch が追加した変更」) | **GitHub PR の "Files changed" タブ** |

→ GitHub PR の Files changed は **three-dot 表示**。 これが本 addendum の核心。

### 8.2 two-dot と three-dot が乖離する発火条件

```
過去に PR が squash merge されている
  ↓
remote main: 元 commits が消えて 1 個の squash commit Z に置換
  ↓
local feat: 元 commits (= A1, A2, A3, ...) が残ったまま
  ↓
merge-base(remote main, feat) = squash 以前の古い位置で固定
  ↓
two-dot:   tree 比較なので squash 後と一致 = 小さく見える
three-dot: merge-base から feat HEAD まで = 巨大に見える
  ↓
GitHub PR: three-dot 基準のため reviewer が混乱 + CI が過剰実行
```

→ 「squash merge が past PR で行われたか」 が判定軸。 GitHub 復旧後の fetch で remote main 状態を観測してから判定する。

### 8.3 GitHub 復旧後の必須診断コマンド (= 9 件、 §3 Phase 0.5 強化)

`git fetch origin main` 完了後、 **必ず以下 9 コマンドを順次実行** して観測値を確定:

```bash
# 1. two-dot diff (= tree 比較)
git diff --stat origin/main..feat/alter-plan-phase3-j6-tab-integration | tail -3

# 2. three-dot diff (= GitHub PR が表示する実体)
git diff --stat origin/main...feat/alter-plan-phase3-j6-tab-integration | tail -3

# 3. merge-base の SHA
git merge-base origin/main feat/alter-plan-phase3-j6-tab-integration

# 4. merge-base の identity (= 「いつの時点で分岐したか」)
git log --oneline -1 $(git merge-base origin/main feat/alter-plan-phase3-j6-tab-integration)

# 5. remote main の最近 commits (= 何が乗っているか)
git log origin/main --oneline --max-count=10

# 6. merge-base が origin/main HEAD 自体か (= 直接 ancestral 判定)
test "$(git merge-base origin/main feat/alter-plan-phase3-j6-tab-integration)" = "$(git rev-parse origin/main)" \
  && echo "ANCESTRAL: origin/main is direct ancestor of feat (= Scenario Z 候補)" \
  || echo "DIVERGED: origin/main is NOT direct ancestor of feat (= Scenario X or Y)"

# 7. tree-level content 等価チェック (= J-6/J-7 surface だけ抽出)
git diff origin/main..feat/alter-plan-phase3-j6-tab-integration -- 'lib/plan/*' 'app/(culcept)/plan/*' | wc -l

# 8. 真の J-6/J-7 範囲の commit list (= cherry-pick 候補)
git log --oneline 7e5f59d5..feat/alter-plan-phase3-j6-tab-integration

# 9. sensitive file が含まれるか (= 永続制約違反検出)
git diff origin/main...feat/alter-plan-phase3-j6-tab-integration --name-only \
  | grep -E "(supabase/migrations|package\.json|\.env|next\.config|tsconfig)" | head -10
```

### 8.4 Scenario 分類 (= 9 コマンド観測値から判定)

#### Scenario Z (= 理想、 既存 §2-§3 ルートで OK)

| 観測 | 値 |
|---|---|
| #6 ANCESTRAL? | `ANCESTRAL` |
| #1 two-dot | ~22 files |
| #2 three-dot | ~22 files (= 一致) |
| #9 sensitive | 0 件 |

→ **既存 §3 Phase 1-3 をそのまま実行**。 feat / chore / closeout を そのまま push、 PR A/B/C を順次作成。

#### Scenario X (= squash 履歴乖離、 clean rebuild 必須)

| 観測 | 値 |
|---|---|
| #6 ANCESTRAL? | `DIVERGED` |
| #1 two-dot | ~22 files (= 小) |
| #2 three-dot | **100+ files (= 巨大)** |
| #9 sensitive | 0 件 |

→ **既存 §3 ルート不可**。 §8.5 clean rebuild strategy へ分岐。

#### Scenario Y (= remote main 未取込、 PR stack 再設計)

| 観測 | 値 |
|---|---|
| #6 ANCESTRAL? | `ANCESTRAL` |
| #1 two-dot | **100+ files (= 巨大)** |
| #2 three-dot | 同上巨大 |
| #5 remote main | Phase 2-A〜J-5 / coalter 等が **見当たらない** |

→ remote main が真に古い。 Phase 2-A〜J-5 を含む PR stack の再設計が必要。 **CEO 別判断**。 J-6 単独の closeout 範囲を超えるため本 runbook scope 外。

#### Scenario W (= 永続制約違反検出、 push 停止)

| 観測 | 値 |
|---|---|
| #9 sensitive | **1 件以上** (= migration / package.json / .env / next.config / tsconfig) |

→ **push 停止**。 sensitive file が混入している。 CEO 判断、 通常は scope 外 PR として別 branch 整理。

### 8.5 Scenario X 発生時の Clean Rebuild Strategy

**原則**:
- frozen branches (= feat / chore / closeout) は **不触** (= 永続制約)
- 新 branch を `origin/main` から派生
- 必要な commits だけ **cherry-pick で複製** (= 新 SHA だが同 content)
- 元の sub-phase 粒度は維持 (= squash は GitHub UI の merge 設定で行う)

**手順** (= fetch 完了後の実行):

```bash
# Step 1: feat の clean 版を origin/main から派生
git checkout -b feat/plan-phase3-j6-clean origin/main
git cherry-pick 378c0744^..68d41d32
# ↑ J-6a (378c0744) の親〜J-7 (68d41d32) = 9 commits
# 各 cherry-pick 後に conflict 検出: git status で "working tree clean" 期待

# Step 2: chore の clean 版を feat clean の上に
git checkout -b chore/plan-tsc-carryover-clean feat/plan-phase3-j6-clean
git cherry-pick 43991b58 bf25ec17
# ↑ 2 commits

# Step 3: closeout の clean 版を chore clean の上に
git checkout -b docs/plan-phase3-j-closeout-clean chore/plan-tsc-carryover-clean
git cherry-pick 8399caf8
# ↑ 1 commit

# Step 4: 本 addendum 自身の clean 版を closeout clean の上に
git checkout -b docs/plan-phase3-j-pr-runbook-diff-safety-addendum-clean docs/plan-phase3-j-closeout-clean
git cherry-pick <本 addendum commit SHA>

# Step 5: 各 clean branch の new SHA を取得して decision-log に記録
git log feat/plan-phase3-j6-clean origin/main --oneline   # 9 new SHAs
git log chore/plan-tsc-carryover-clean feat/plan-phase3-j6-clean --oneline  # 2 new SHAs
git log docs/plan-phase3-j-closeout-clean chore/plan-tsc-carryover-clean --oneline  # 1 new SHA
git log docs/plan-phase3-j-pr-runbook-diff-safety-addendum-clean docs/plan-phase3-j-closeout-clean --oneline  # 1 new SHA

# Step 6: clean branches を push、 PR は clean branch を base に作成
git push -u origin feat/plan-phase3-j6-clean
git push -u origin chore/plan-tsc-carryover-clean
git push -u origin docs/plan-phase3-j-closeout-clean
git push -u origin docs/plan-phase3-j-pr-runbook-diff-safety-addendum-clean
# GitHub UI で PR を順次作成 (= 既存 §5 の template を使用、 branch 名だけ clean 版に変更)
```

**SHA tracking**:
- **frozen branch SHA** (= 68d41d32 / bf25ec17 / 8399caf8 + 本 addendum SHA) → **歴史的記録**として decision-log に残す
- **clean branch SHA** (= cherry-pick で生成された新 SHA) → **実 PR 着地**の SHA として decision-log に追記
- 両者を **明示的に区別**

**conflict 発生時**:
- 通常は 0 になる想定 (= 中身は同じ)
- もし conflict 発生 → **frozen branch は触らず CEO 判断**
- conflict resolution を clean branch 上だけで行う

### 8.6 push 前 STOP 条件 (= §8.3-§8.4 観測の結果による分岐ロック)

以下のいずれかに該当する場合は **push 停止** + **CEO 判断**:

| STOP 条件 | 発火源 |
|---|---|
| #2 three-dot が #1 two-dot より大きく乖離 (= 例 22 vs 155) | Scenario X 確定、 clean rebuild へ |
| #9 sensitive file 検出 | Scenario W、 sensitive を含む branch は push しない |
| #4 merge-base が予想外の SHA (= 例 b07eeab5 でなく更に古い) | 何かおかしい、 CEO 判断 |
| #5 remote main HEAD が想定外 (= 例 main が削除されている) | catastrophe、 CEO 判断 |
| `git fetch` 自体が error (= auth / network / GitHub down) | 復旧未完了、 CEO 再確認 |
| #8 commit list が 9 件でない | J-6/J-7 範囲が想定と異なる、 確認必要 |

→ いずれの STOP 条件でも **frozen branches 不触**、 **force push 禁止**、 **branch delete 禁止** を維持。

### 8.7 frozen branch 不触原則 (= 再確認)

clean rebuild に分岐したとしても以下は **不変**:

- ❌ `feat/alter-plan-phase3-j6-tab-integration` への追加 commit / rebase / delete / force push
- ❌ `chore/plan-proposalToAnchorInput-tsc-carryover` への追加 commit / rebase / delete / force push
- ❌ `docs/plan-phase3-j-closeout` への追加 commit / rebase / delete / force push
- ❌ `docs/plan-phase3-j-pr-runbook-diff-safety-addendum` (= 本 branch) への追加 commit (= 本 addendum commit 完了後は frozen 扱い)

→ frozen branches は **歴史的記録** として保持。 clean rebuild は **新 branch で同 content を複製**するだけ。

### 8.8 force push / reset / branch delete 禁止 (= 永続)

GitHub 復旧後も以下は **永続禁止**:

- ❌ `git push --force` (= 任意 branch 対象)
- ❌ `git push --force-with-lease` (= 同上)
- ❌ `git reset --hard` (= local でも禁止、 CLAUDE.md Rule 7)
- ❌ `git restore .` / `git checkout .` (= 同上)
- ❌ `git stash` / `git stash pop` / `git stash drop` (= CLAUDE.md Rule 7、 2026-04-01 事故由来)
- ❌ `git branch -D <frozen branch>` (= delete 禁止、 CEO 永続制約)
- ❌ `git clean -f` (= CLAUDE.md Rule 7)

### 8.9 関連 docs (= 本 addendum との交差参照)

- `docs/alter-plan-phase3-j-closeout-audit.md` — Phase 3-J 全 sub-phase 完了監査
- `docs/alter-plan-phase3-j-deferred-smoke-ledger.md` — Real UI smoke deferred 5 項目
- `docs/decision-log.md` — Diff Safety Addendum entry (= 本 addendum 着地時記録)
- `CLAUDE.md` — Rule 7 (State Safety) + Rule 8 (Work-Start Verification)

### 8.10 本 addendum 適用後の runbook 利用順

GitHub 復旧後の正しい順序:

1. CEO 復旧承認
2. **§3 Phase 0** 実行 (= fetch + remote main 同期)
3. **§8.3** 9 コマンド診断実行
4. **§8.4** Scenario 判定 (= Z / X / Y / W)
5. **§8.6** STOP 条件チェック
6. 分岐:
   - Z → **§3 Phase 1-3** をそのまま実行
   - X → **§8.5** clean rebuild strategy 経由で **§3 Phase 1-3** を clean branch で実行
   - Y → **CEO 別判断** (= 本 runbook scope 外)
   - W → **CEO 判断**、 sensitive 整理
7. **§3 Phase 4** 最終確認
8. **§7** 完了判定

---

