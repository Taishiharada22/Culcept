# Phase 3-J Closeout Audit (= 計画上 phase の最後まで整理)

**作成日**: 2026-05-22
**承認**: CEO (= 2026-05-22 closeout integration 指示)
**範囲**: Phase 3-J 全 sub-phase (J-1 〜 J-7) + chore tsc carry-over fix の完了監査

---

## 0. Purpose / Philosophy

Phase 3-J = Aneurasync Past-Self-Reflection OS / Predictive Day Orchestration の **proposal 系** 全実装。
利用者本人の過去観測 (anchors + dismissEvents) から、 pure deterministic 経路で「気づきの提案」 を生成し、
Memory Chip metaphor で UI 表示する。

本 closeout の目的:
- 計画上の Phase 3-J を計画通り **最後まで** 整理する
- GitHub 復旧後に安全に PR 化できる **merge-readiness** を確立する
- 初期ユーザー獲得には進まない (= CEO 方針 2026-05-22 明示)
- K / L / M / N / Transport API / Arrival Risk Memory には進まない (= 永続制約)

---

## 1. Phase 3-J 全体の完了範囲

### 1.1 J-1 系列 (= 観測 proposal 生成 helper、 pure 関数群)

| sub-phase | commit | 内容 | 状態 |
|---|---|---|---|
| J-1a | `995f343f` | ProposedAnchor types + ProposalDirection + ProposalIntegrityContract | ✅ 完了 |
| J-1b | `0d16d9f5` | Self-Evidence + copy + lint + Evidence Tiered + Linguistic Mirror | ✅ 完了 |
| J-1c | `1066a779` | Entropy Budget + Onboarding Quietude + Theory-of-Mind Pause + TestOverrideContext + DismissLog reader | ✅ 完了 |
| J-1d | `3dbfc50b` | Reversibility + Anchor Verb + Latency Tolerance + ArrivalRiskMemoryReader interface | ✅ 完了 |
| J-1e | `b8cd7c83` | Self-Contradiction Detector + Day Mood v0 + Pattern Repetition Counter | ✅ 完了 |

### 1.2 J-2 〜 J-5 (= UI 部品 + 3 action path)

| sub-phase | commit | 内容 | 状態 |
|---|---|---|---|
| J-2 | `8ba80034` | Memory Chip + ProposalSheet UI + runtime No-AI-Subject check | ✅ 完了 |
| J-3 | `c3ff466b` | dismiss path + Half-Life Decay + 7 day memory integration | ✅ 完了 |
| J-4 | `cb36054e` | accept path + Quiet Undo Window (5 min subtle 撤回) | ✅ 完了 |
| J-5 | `7bb9b9ba` | modify path (proposalDraftToFormState + ProposalChip onModify wiring) | ✅ 完了 |

### 1.3 Integration branch merges (= main 着地済)

| commit | 内容 |
|---|---|
| `8ede126e` | merge Phase 3-J observation proposal helpers (= J-1 系列) into integration |
| `7e5f59d5` | merge Phase 3-J accept + modify path (= J-4 + J-5) into integration |

→ J-1 〜 J-5 は **integration branch 経由で main に着地済** (= 本 closeout 時点では既に master の history に含まれる)

### 1.4 J-6 系列 (= PlanClient 統合 + tab 接続、 frozen branch `feat/alter-plan-phase3-j6-tab-integration`)

| sub-phase | commit | 内容 | 状態 |
|---|---|---|---|
| J-6a | `378c0744` | computeProposals orchestration (pure helper、 UI 接続なし) | ✅ 完了 |
| J-6b | `17dac1df` | displayProposalAwareNotes + UI 露出修正 (AnchorDetailModal + SourceListModal) | ✅ 完了 |
| J-6c | `972243a6` | CalendarTab proposal chip 導線 (presentational only) | ✅ 完了 |
| J-6d | `f6b1ce66` | MapTab proposal hint 導線 (SelectedAnchorCard 末尾、 presentational only) | ✅ 完了 |
| J-6e-1 | `080b8ba9` | PlanClient で computeProposals 接続 (read-only display) | ✅ 完了 |
| J-6e-2 | `506bab48` | dismiss callback wiring (silent preference、 localStorage write only this key) | ✅ 完了 |
| J-6e-3 | `75f07dea` | accept transaction + Quiet Undo Window (ref guard + source.notes reload-safe suppression + subtle pending) | ✅ 完了 |
| J-6e-4 | `1e6a92a8` | modify + AddAnchorModal wiring (existing openAdd path 再利用) | ✅ 完了 |

### 1.5 J-7 (= limited smoke/audit)

| commit | 内容 | 状態 |
|---|---|---|
| `68d41d32` | J-7 limited smoke/audit PASS + branch 凍結記録 | ✅ 完了 |

### 1.6 Chore branch (= tsc carry-over fix、 frozen branch `chore/plan-proposalToAnchorInput-tsc-carryover`)

| commit | 内容 | 状態 |
|---|---|---|
| `43991b58` | docs(plan): correct J-6 branch base lineage record (frozen branch 不触) | ✅ 完了 |
| `bf25ec17` | test(plan): fix proposalToAnchorInput test helper 型 narrowing carry-over | ✅ 完了 |

---

## 2. 完了監査 (= 達成と保証)

### 2.1 9-gate proposal pipeline

`lib/plan/proposal/computeProposals.ts:349` で 9 gate stack を実装:

1. Onboarding Quietude (= Invariant 36、 利用初期 7 日 silent)
2. Theory-of-Mind Pause (= 24h dismiss 3+ で pause)
3. Sensitive 除外 (= Invariant 4 privacy first)
4. Signal extraction (= pattern_repeat、 同曜日 + 同 hour + 同 verb / one_off / 3+ 反復)
5. Dismiss filter (= 7 日 retention)
6. Reversibility gate (= score >= 50)
7. Self-Contradiction direction (= classifyDirection 内で処理)
8. Entropy Budget consumption + phase limit (= max 3pt/day)
9. Compliance check (= assertProposalCompliance type-lock)

→ 全 gate machine verified by unit tests (= `tests/unit/plan/proposal*.test.ts` 群)

### 2.2 5-layer accept dup defense

`PlanClient.tsx:240-292` で 5 層防御:

- L1: useRef synchronous guard (= `acceptingRef`、 React batching を超えて即時 reject)
- L2: useState UI 反映 (= `acceptingProposalIds`、 subtle pending 表示)
- L3: in-session suppression (= `inSessionAcceptedIds`、 accept 成功直後 chip 即除外)
- L4: source.notes 由来 suppression (= `extractAcceptedProposalIdsFromSources`、 reload-safe)
- L5: server-side idempotency なし (= 明示限界、 Phase 3-K で対応予定だが本 phase scope 外)

→ L1-L4 全層 unit test 完備、 L5 は documented limitation

### 2.3 SSR hydration safety

`PlanClient.tsx:162-175` で mount-deferred state pattern:

- `now` = `useState<Date | null>(null)` (= initial null、 server render 時に proposalsByDate 空)
- `dismissEvents` = `useState<ReadonlyArray<DismissLogEntry>>([])` (= initial empty)
- mount 後の `useEffect` で localStorage read + state 確定
- proposalsByDate `useMemo` は `if (!now) return {}` で SSR-safe

→ hydration mismatch 0、 unit/integration test で機械検証

### 2.4 Memory Chip 思想維持

`ProposalChip` (= `app/(culcept)/plan/components/ProposalChip.tsx`) で:

- dashed border 1px slate-300 (= 「まだ実体ではない」)
- italic slate-500 text
- 影なし
- hover で border 1px slate-400
- **警告色禁止 / pulse 禁止 / drop-shadow 禁止 / banner 禁止** (= Invariant 42)
- subtle pending UX (= opacity-60 + pointer-events-none + aria-busy のみ、 警告色なし)

→ grep test + Memory Chip Visual Style Specification 整合

### 2.5 localStorage write key 固定 (= 2 種のみ)

- `aneurasync.plan.proposalDismiss.v1` (= J-6e-2、 dismiss log)
- `aneurasync.plan.proposalUndo.v1` (= J-6e-3、 quiet undo)

→ J-6e-4 modify path は **書込しない** (= grep test で機械保証、 3 種目追加禁止維持)

### 2.6 Aneurasync 思想整合

- **「proposal が出にくいことが正しい設計」** (= Onboarding Quietude + pattern_repeat 閾値の意図)
- **accept / dismiss / modify は別 sentiment** (= localStorage key 分離、 source.notes trace 分離)
- **No Penalty for Ignore** (= Invariant 39、 dismiss 履歴の集計表示なし)
- **No-AI-Subject** (= runtime check で 「Alter が〜」 表現を proposal copy から除外)
- **観察 > 推論** (= Self-Contradiction Detector は observation 文化、 「いつもの〜」 系の判定文不採用)

→ 全項目 invariant 化、 unit test + grep test で機械検証

---

## 3. 未完了 / deferred 項目

### 3.1 Real UI smoke (= data gate 未成立、 これは FAIL ではない)

詳細は `docs/alter-plan-phase3-j-deferred-smoke-ledger.md` 参照。

- proposal chip visibility
- dismiss real UI smoke
- accept real UI smoke
- undo real UI smoke
- modify real UI smoke

### 3.2 K / L / M / N 未着手 (= CEO 永続制約、 本 phase scope 外)

- K: DayGraph 本実装
- L: Transport API
- M: Arrival Risk Memory
- N: Counter-Factual Bookmark

→ Phase 3 全体設計では予定されているが、 本 closeout 範囲外。 別 phase で立てる。

### 3.3 Phase 3 内の隣接 deferred 機能

- Transport API (= L 系列、 未着手)
- Arrival Risk Memory (= M 系列、 interface のみ J-1d で導入済、 本体未実装)
- Counter-Factual Bookmark (= N 系列、 未着手)
- FlowTab proposal 接続 (= J-6 scope 外、 Phase 3.5 預け)
- DayGraph Layer 配置 (= K 系列、 未着手)

---

## 4. CEO 永続制約 遵守確認

| 制約 | 状態 |
|---|---|
| TestOverrideContext を production path に入れない | ✅ 遵守 (= grep test 継続 PASS) |
| DB 直接 insert/update/delete なし | ✅ 遵守 (= API 経由のみ) |
| confirmedAt schema/API 変更なし | ✅ 遵守 (= schema 不触) |
| migration / env file / new dependency 変更なし | ✅ 遵守 |
| localStorage write key 2 種固定 | ✅ 遵守 (= grep test) |
| push / pull / fetch / gh なし | ✅ 遵守 (= 全 commit local のみ) |
| reset / restore / stash / branch delete なし | ✅ 遵守 (= Hook + log 確認) |
| frozen branch への追加 commit なし | ✅ 遵守 (= feat + chore 共に HEAD 不変) |
| dev fixture API 実装なし | ✅ 遵守 |
| K / L / M / N 着手なし | ✅ 遵守 |

---

## 5. 検証結果サマリ

| 観点 | 結果 |
|---|---|
| plan unit tests | **1463 / 1463 PASS** |
| J-6 範囲 affected tests | 93 / 93 PASS |
| tsc J-6e-4 surface (PlanClient + helpers + tests) | errors = 0 |
| tsc plan-area area-wide | 12 errors (= 全 pre-existing W1-Y 由来 carry-over、 本 phase introduce 0) |
| frozen branch HEAD 不変確認 | `feat` @ `68d41d32` + `chore` @ `bf25ec17` 共に不変 |
| 思想整合の機械検証 | 全 grep test PASS (= Memory Chip / 2 種 key 固定 / No-AI-Subject) |

---

## 6. 関連 docs

- `docs/alter-plan-phase3-predictive-day-orchestration-architecture.md` — Phase 3 設計書 (= 全 invariant の source of truth)
- `docs/alter-plan-phase3-j-deferred-smoke-ledger.md` — deferred smoke 項目 + 解消条件
- `docs/alter-plan-phase3-j-pr-runbook.md` — GitHub 復旧後の push/PR 手順
- `docs/decision-log.md` — 全 decision の正史 (= J-6 / J-7 / closeout entry)

---

## 7. 結論

**Phase 3-J は計画上の最後まで完了した**。 未完了項目はすべて:
- (a) data gate 未成立による real UI smoke deferred (= 設計上の正常挙動)、 または
- (b) CEO 永続制約による別 phase 預け (= K/L/M/N + Transport + Arrival Risk Memory)

である。 「やり残し」 ではなく 「計画通りの境界線」 で停止している。

GitHub 復旧後に PR 化することで、 Phase 3-J 全体が main に着地し、 次 phase (= K 以降 or 別軸) に進む整合状態となる。

