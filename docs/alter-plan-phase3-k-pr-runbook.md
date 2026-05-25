# Phase 3-K PR Runbook (= GitHub 復旧後の K 系 push / PR 手順)

**作成日**: 2026-05-22
**承認**: CEO (= 2026-05-22 K closeout docs 整理指示)
**用途**: GitHub 操作禁止が解除された時に、 本 runbook で K 系 6 frozen branches を安全に PR 化する

---

## 0. 前提

- 本 runbook 作成時点: `push / pull / fetch / gh` **すべて禁止中**
- 復旧時の判定権: CEO
- 復旧前にこの runbook を実行してはいけない
- 復旧時、 CEO 明示承認のもとで手順 1 から順に実行する
- J 系 runbook (= `docs/alter-plan-phase3-j-pr-runbook.md` + addendum §8 diff safety) の **延長**として位置付け

---

## 1. K 系 branch 一覧 (= 6 件、 K-1〜K-3c-iii)

| Branch | HEAD | 内容 |
|---|---|---|
| `feat/alter-plan-phase3-k-daygraph-foundation` | `12b6a8d0` | K-1 (= types + helpers + buildDayGraph + K-1f-α/β)、 9 commits |
| `feat/alter-plan-phase3-k2-planclient-integration` | `fd5a395b` | K-2 (= PlanClient wiring)、 2 commits |
| `feat/alter-plan-phase3-k3a-daygraph-timeline-component` | `38ea3b55` | K-3a (= component 単体)、 2 commits |
| `feat/alter-plan-phase3-k3b-calendartab-integration` | `d22d06f8` | K-3b (= CalendarTab integration)、 2 commits |
| `feat/alter-plan-phase3-k3c-maptab-flowtab-integration` | `b73afa3f` | K-3c-0/i/ii (= MapTab + FlowTab + window 拡張)、 3 commits |
| `feat/alter-plan-phase3-k3c-iii-visual-density-refinement` | `eeb0a3e6` | K-3c-iii (= visual density refinement + closeout)、 2 commits |

合計 **20 commits stack** (= 9 + 2 + 2 + 2 + 3 + 2)。

---

## 2. PR 順序 (= K 系 6 PRs、 J 系 push 完了後)

### 前提

J 系 PR 順序 (= `docs/alter-plan-phase3-j-pr-runbook.md` §2) が **完了している** こと:
- PR A: `feat/alter-plan-phase3-j6-tab-integration`
- PR B: `chore/plan-proposalToAnchorInput-tsc-carryover`
- PR C: `docs/plan-phase3-j-closeout`
- PR D: `docs/plan-phase3-j-pr-runbook-diff-safety-addendum`
- PR E: `docs/plan-phase3-k-daygraph-design` (= K design docs、 J 系完了後)

### K 系 PR 順序 (= 6 件、 stacked 構造)

| # | PR | Branch | base (= GitHub 復旧後の origin/main 想定) |
|---|---|---|---|
| **F** | K-1 foundation | `feat/alter-plan-phase3-k-daygraph-foundation` | origin/main (= 前 PR E 着地後) |
| **G** | K-2 wiring | `feat/alter-plan-phase3-k2-planclient-integration` | origin/main (= PR F 着地後) |
| **H** | K-3a component | `feat/alter-plan-phase3-k3a-daygraph-timeline-component` | origin/main (= PR G 着地後) |
| **I** | K-3b CalendarTab | `feat/alter-plan-phase3-k3b-calendartab-integration` | origin/main (= PR H 着地後) |
| **J** | K-3c MapTab+FlowTab | `feat/alter-plan-phase3-k3c-maptab-flowtab-integration` | origin/main (= PR I 着地後) |
| **K** | K-3c-iii visual density | `feat/alter-plan-phase3-k3c-iii-visual-density-refinement` | origin/main (= PR J 着地後) |
| **L** | K closeout docs | `docs/plan-phase3-k-closeout` (= 本 docs branch) | origin/main (= PR K 着地後) |

---

## 3. 復旧時必須診断 (= J 系 addendum §8 適用、 critical)

各 PR push 前に必ず以下を実行:

```bash
# 1. fetch + remote 同期
git fetch origin main

# 2. two-dot diff (= tree 比較)
git diff --stat origin/main..<target-branch>

# 3. three-dot diff (= GitHub PR 表示と一致、 merge-base..head)
git diff --stat origin/main...<target-branch>

# 4. merge-base 確認
git merge-base origin/main <target-branch>

# 5. merge-base が origin/main HEAD 自体か (= 直接 ancestral?)
test "$(git merge-base origin/main <target-branch>)" = "$(git rev-parse origin/main)" \
  && echo "ANCESTRAL" \
  || echo "DIVERGED"

# 6. 期待 commit list
git log --oneline origin/main..<target-branch>

# 7. sensitive file 検出
git diff origin/main...<target-branch> --name-only \
  | grep -E "(supabase/migrations|package\.json|\.env|next\.config|tsconfig)" | head -5
```

### Scenario 分類 (= J 系 addendum §8.4 と同 pattern)

| Scenario | 観測 | 対応 |
|---|---|---|
| **Z (= 理想)** | ANCESTRAL + 期待 commits + sensitive 0 | 既存 PR 順序通り push |
| **X (= squash 履歴乖離)** | DIVERGED + two-dot 小 + three-dot 巨大 | **clean rebuild 必須** (= 後述 §5) |
| **Y (= remote main 未取込)** | ANCESTRAL + 期待外 commits 大量 | PR stack 再設計、 **CEO 判断** |
| **W (= 永続制約違反検出)** | sensitive file 1+ 件 | **push 停止**、 CEO 判断 |

---

## 4. PR 各 body template

### PR F: K-1 foundation

```markdown
**Title**: feat(plan): Phase 3-K-1 — DayGraph Layer 0 foundation (= types + buildDayGraph + K-1f-α/β)

## Summary
- DayGraph Layer 0 foundation: types + Integrity/Redaction contracts + node generators + orchestration
- 4 種 node (= start/event/gap/end) + MovementTransition (= 別 transitions 配列、 K-1c)
- 2 field duration provenance (= durationSource × boundaryClipped、 K-1f-α)
- JSON-safe output (= ReadonlyArray + assertJsonSafeStructure invariant、 K-1f-β)
- DayGraphRedactionContract (= sensitive 三重防御)
- BuildDayGraphResult shape (= { graph, warnings })、 silent skip 廃止

## Status
- plan unit tests: 1690+ PASS
- tsc K-1 surface: errors = 0
- migration / env / package / dependency: 0
- LLM / crypto / new dependency: 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR G: K-2 wiring

```markdown
**Title**: feat(plan): Phase 3-K-2 — PlanClient に DayGraph 接続 (= UI 表示なし、 wiring のみ)

## Summary
- PlanClient で computeDayGraphMapForAnchors を useMemo 計算
- collectAnchoredDateStrings (= today + one_off date)
- tabs に optional prop として渡す (= 未使用、 K-3 で UI 接続)

## Status
- plan unit tests + tsc errors 0
- UI 不変 (= grep 機械検証)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR H: K-3a component

```markdown
**Title**: feat(plan): Phase 3-K-3a — DayGraphTimeline component 単体 (= pure presentational)

## Summary
- DayGraphTimeline component (= 'use client'、 pure presentational)
- presentation helper (= buildTimelineView + buildEndTimeHint)
- 5 革新採用: Memory Chip 階調 / Negative Capability / Sensitive redaction / durationSource hint / No Action UI
- CalendarTab 未統合 (= K-3b で接続)

## Status
- plan unit tests + tsc errors 0
- testing-library 不在のため module import + grep test pattern 採用

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR I: K-3b CalendarTab

```markdown
**Title**: feat(plan): Phase 3-K-3b — CalendarTab に DayGraphTimeline 静かに追加

## Summary
- CalendarTab selected day section に「1 日の構造」 timeline を静かに追加
- 既存 anchor list / proposal chip / FAB 完全不変
- onEventClick → 既存 onAnchorClick へ bridge

## Status
- plan unit tests + tsc errors 0
- CEO visual smoke PASS (= 2026-05-22)
- sensitive / event click smoke deferred

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR J: K-3c MapTab+FlowTab

```markdown
**Title**: feat(plan): Phase 3-K-3c — MapTab + FlowTab integration + visible window 拡張 + React.memo

## Summary
- K-3c-0: dayGraphByDate を today ± 7 day visible window に拡張 (= recurring-only / 空 day 含む)
- K-3c-i: MapTab SelectedAnchorCard 直後に timeline 追加 (= 場所→時間 bridge)
- K-3c-ii: FlowTab 各 day card に timeline 追加 + React.memo (= 7 timeline 性能担保)

## Status
- plan unit tests + tsc errors 0
- 既存 UI 完全不変 (= grep)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR K: K-3c-iii visual density

```markdown
**Title**: feat(plan): Phase 3-K-3c-iii — visual density refinement (compact empty day + 階調強化)

## Summary
- 階調 3 階層強化 (= Boundary/Gap slate-200 / Movement slate-300 / Event slate-400)
- Compact empty day (= 「予定なし · 06:00–23:00」、 FlowTab のみ)
- warnings あり日は誤表示防止 (= 通常 timeline fallback、 Negative Capability)
- CEO visual smoke PASS (= 2026-05-22)

## Status
- plan unit tests: 1787 PASS
- tsc K-3c-iii surface errors 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### PR L: K closeout docs

```markdown
**Title**: docs(plan): Phase 3-K closeout — audit + deferred ledger + PR runbook + decision-log

## Summary
- K phase 全体 closeout audit
- deferred 3 項目 (= sensitive / EventNode click / warnings あり日) ledger
- PR runbook (= 本 docs)
- decision-log K-3c-iii visual smoke PASS 記録

## Added docs
- docs/alter-plan-phase3-k-closeout-audit.md
- docs/alter-plan-phase3-k-deferred-smoke-ledger.md
- docs/alter-plan-phase3-k-pr-runbook.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## 5. Clean rebuild strategy (= Scenario X 発生時)

J 系 addendum §8.5 と同 pattern。 K 系も適用:

```bash
# Step 1: K-1 clean 版
git checkout -b feat/plan-phase3-k-clean origin/main
git cherry-pick 34c77602^..12b6a8d0   # = K-0 〜 K-1 closeout (= 9 commits)

# Step 2: K-2 clean
git checkout -b feat/plan-phase3-k2-clean feat/plan-phase3-k-clean
git cherry-pick 703487b3 fd5a395b      # = K-2 + closeout

# Step 3: K-3a clean
git checkout -b feat/plan-phase3-k3a-clean feat/plan-phase3-k2-clean
git cherry-pick 1fd40f5c 38ea3b55

# Step 4: K-3b clean
git checkout -b feat/plan-phase3-k3b-clean feat/plan-phase3-k3a-clean
git cherry-pick 29880573 d22d06f8

# Step 5: K-3c clean
git checkout -b feat/plan-phase3-k3c-clean feat/plan-phase3-k3b-clean
git cherry-pick 9ebb6ed9 b5648e3e b73afa3f

# Step 6: K-3c-iii clean
git checkout -b feat/plan-phase3-k3c-iii-clean feat/plan-phase3-k3c-clean
git cherry-pick 7fd40363 eeb0a3e6

# Step 7: K closeout docs clean
git checkout -b docs/plan-phase3-k-closeout-clean feat/plan-phase3-k3c-iii-clean
git cherry-pick <本 commit SHA>
```

---

## 6. 停止条件 (= 各 PR push 前)

| 条件 | 行動 |
|---|---|
| `git fetch` で error | CEO 判断、 復旧確認 |
| three-dot >> two-dot (= Scenario X) | clean rebuild へ分岐 |
| migration / env / package / next.config 含まれる (= Scenario W) | push 停止、 CEO 判断 |
| 期待 commits と一致しない | CEO 判断 |
| CI fail | 別 branch で fix PR (= frozen branch 不触) |
| reviewer 大規模変更要求 | CEO 判断、 別 branch で対応 |

---

## 7. 永続禁止 (= 復旧後も継続)

- ❌ `git push --force`
- ❌ `git reset --hard`
- ❌ frozen branch (= 11 件 J + K) の delete / rebase / force push
- ❌ main 直接 push
- ❌ TestOverrideContext production 注入
- ❌ DB 直接 insert/update/delete
- ❌ confirmedAt schema/API 変更
- ❌ dev fixture API 実装
- ❌ K-3+ / L / M / N 着手 (= CEO 別承認まで)
- ❌ Transport API 接続
- ❌ Arrival Risk Memory

---

## 8. 完了判定

J 系 7 PRs (= A-E) + K 系 7 PRs (= F-L) すべて main 着地で **Phase 3-J + 3-K 全体の main 着地完了**。 次 phase (= 3-L Transport design review 後の実装) に進む整合状態となる。
