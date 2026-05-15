# CoAlter Runtime Integration Priority — Decision Doc

**Status**: Draft (docs-only、autonomous commit/push/PR、merge は CEO 判断)
**Branch**: `docs/coalter-runtime-integration-priority-decision`
**Base**: `main` (HEAD `0d925e0c`、PR #120 merge 後)
**前提**: PR #120 audit doc v2 main 反映済
**生成日**: 2026-05-15

---

## §0 本 doc の目的と scope

### 0.1 本 doc が確定するもの

- PR #120 audit v2 を前提に、**CoAlter 全体を完了に近づけるための「次に実装すべき本流」を決める**
- 候補 A〜E を比較、推奨を 1 つ提示
- 自律進行可能 / CEO 判断必要 を分離

### 0.2 本 doc が確定しないもの

- **Stargazer pivot は対象外** (CEO directive: 「CoAlter を完成させる、別タスクに頭を向けない」)
- 具体的実装 (本 doc は decision、実装は別 PR)
- 凍結解除タイミング (CEO 戦略判断)

### 0.3 起草の動機

PR #120 audit v2 で:
- ✅ Provider foundation completed (PR #110-#119)
- ✅ Structural scaffold completed (PR #102)
- ❌ Runtime real connection incomplete
- ❌ Production observation incomplete
- ❌ CoAlter 全体 incomplete

→ 次に何を実装すれば CoAlter 完了に最も近づくか確定。

---

## §1 Source-of-truth (PR #120 audit v2 §0.5 継承)

| 優先度 | source | 反映 |
|---|---|---|
| **1 (最上位)** | main 上 merge 済 commit / PR | PR #102 / PR #110-#119 / PR #120 |
| 2 | 実 main 上の file 状態 | `lib/coalter/movie/` 12 file、`lib/coalter/movie/providers/` 配下、`flags.ts` |
| 3 | 最新 docs | PR #120 audit v2 等 |
| 4 | memory / handoff | 起草時点 snapshot、merge 後反映に上書きされる |
| 5 | 古い設計 doc | 参照のみ |

**Completion Ledger (本 doc 着手時点)**:

| PR | merge SHA | merged at | 内容 |
|---|---|---|---|
| PR #95 | `62dff94b` | 2026-05-10 | Layout 系統 production deploy |
| PR #102 | `dddfd664` | 2026-05-11 | Step D structural scaffold (D-1-a〜D-2-e2、10 commit) |
| PR #110 | (a0) | 2026-05-12 | Provider pure foundation |
| PR #111 | (design) | 2026-05-12 | D-2-e3-a1 design docs |
| PR #112-#119 | (a1-impl-1a〜1i) | 2026-05-12〜2026-05-15 | Anthropic provider observability 9 fields |
| **PR #120** | `0d925e0c` | 2026-05-15 | **Original plan completion audit v2** |

---

## §2 現在の CoAlter 状態 (PR #120 audit v2 §6.1 / §6.2 reflect)

### 2.1 Mode 別

| Mode | 状態 | 備考 |
|---|---|---|
| **Normal CoAlter (decision / negotiate / clarify)** | ✅ Phase 1 + Phase 2 3-mode body 完了 + 凍結 (CEO 6.D 合格 2026-04-19) | 仲介 / 折衷案 / 中立翻訳 設計確定 |
| **Daily Mode** | ⚠ Layout UI 完了 (Phase L1-e / L3-d) + Production deploy 済 | mode 単体 UI / 1 サイクル E2E 完了、但しドメイン本体 (food/movie の Daily 統合) 未 |
| **Travel Mode** | ⚠ Layout UI 完了 (Phase L1-f / L3-e) + Production deploy 済 | 同上、Travel 専用 retrieval 本体 未 |
| **Reflect mode (4 mode 目)** | ❌ Phase 3 後送り | (Phase 2 design v0.3 §0 で明示) |

### 2.2 Domain 別

| Domain | 状態 |
|---|---|
| **Movie** | ⚠ structural scaffold completed (PR #102) + provider foundation completed (PR #110-#119)、runtime real connection incomplete + Step E incomplete |
| **Food** | ⚠ Phase B Commit 1-4 completed (foodOrchestrator / foodCatalog / foodRanker / bookingResolver)、三段式本体 incomplete |
| **Travel** | ⚠ Layout UI completed、ドメイン本体 (travel-specific retrieval) 未 |
| **予定調整 / プレゼント / その他** | (本 audit 詳細未把握、CEO 補足要) |

### 2.3 Layer 別

| Layer | 状態 |
|---|---|
| L1 個人理解 (Stargazer 等) | ✅ 既存資産活用、CoAlter scope 内では touch なし |
| L2 関係理解 (Fairness Ledger 等) | ⚠ 設計確定、実 wiring 不明確 |
| L3 現在会話理解 (Ambiguity Engine / NVC / Intent Translation) | ✅ 既存活用 + Phase 2 3-mode body 完了 |
| L4 外部世界接続 (Adaptive RAG / Web 検索) | ⚠ movie domain structural scaffold + provider foundation 完了、food domain 既存実装 + 三段式枠 未 |
| L5 提案生成 | ✅ Phase 1 出力カード固定テンプレート 完了 |

### 2.4 Product-level 完了判定

> **CoAlter 全体 incomplete** (Movie runtime real connection / Step E / food 三段式本体 / reflect mode / D-2-e3-b/c/d/e 等)

---

## §3 次実装ルート候補 (CoAlter 内、Stargazer 等の別領域は対象外)

### 候補 A: PR #102 scaffold 経路 (existing scaffold flags ON path)

**内容**:
- PR #102 で完了済 structural scaffold (`movieCuratorLiveEnabled` / `threeStageEnabled` 両 flag default OFF) を **shadow → canary → live** で実 production に展開
- 既存 `lib/coalter/movie/curator.ts` / `theaterResolver.ts` 等を実 wiring で動かす
- mainstream §4 Step E-1 (B-6 shadow) → Step E-2 (live integration canary) → Step E-3 (本番 flip) の path

**何が必要か**:
1. `COALTER_MOVIE_CURATOR_LIVE` env で `movieCuratorLiveEnabled = true` 切替え
2. `COALTER_THREE_STAGE` env で `threeStageEnabled = true` 切替え
3. Step E-1 shadow observation 開始 (`understandingShadowMovie` 並走)
4. 5 人 canary → 段階 rollout
5. CEO 審議で本番 flip
6. PR #110-#119 provider foundation との **干渉 / 並走 / 切替え logic** 確定

**risk**:
- 既存 4-layer pipeline と structural scaffold の **並走 / 競合 / 切替え** が unclear
- PR #110-#119 provider foundation は **mock-only**、実 API 接続なし → flags ON でも実 retrieval は既存 path
- 観測のみで終わる可能性 (Step E-2 canary でデータ取れるが、実 ROI は別判断要)

**unblock 条件**:
- env 変更承認 (CEO + Build)
- Step E-0 (rollback playbook / Sentry / Discover query 等) 完了
- `understandingShadowMovie` flag 既に main 反映済 (handoff §2.3、`47d57a46`)

### 候補 B: PR #110-#119 provider foundation 経路 (real provider connection path)

**内容**:
- 実 Anthropic API 接続を movieOrchestrator に wiring
- `a1-impl-1c BudgetUsageProvider` → `a2 env flag` → `a3 movieOrchestrator wiring` → R6 (theaters=[] fallback) Option C → Step E

**何が必要か**:
1. **a1-impl-1c**: Supabase migration (`coalter_provider_cost_log` schema) + `BudgetUsageProvider` 実装
2. **a2**: `flags.ts` に `COALTER_THREE_STAGE_PROVIDER_CHAIN` / `OPENAI_ENABLED` / `EXA_ENABLED` 追加
3. **a3**: `movieOrchestrator` extract (`runFourLayerPipelineInternal`) + adapter wiring (provider chain + F1 fallback) + R6 (theaters=[] success 扱い) Option C
4. Anthropic Console Web Search enable (運用作業) + `ANTHROPIC_API_KEY` 配置
5. 実 Anthropic API call で staging verify
6. Step E-0 → Step E

**risk**:
- 凍結事項多数 (Supabase / env / API key / movieOrchestrator / flags / ProviderSelector / Console enable / Production env)
- 各凍結項目に **CEO 承認 + 運用 process** が必要
- mock → real 遷移時の cost 暴走 risk (PR #109 §R5)
- F1 fallback (4-layer passthrough) の latency 増 (PR #109 §R3)

**unblock 条件**:
- Anthropic Console + ANTHROPIC_API_KEY (CEO 承認)
- Supabase migration 承認
- npm dep 判断 (OpenAI optional)
- ToS PDF verify (EXA optional)
- a3 wiring CEO 承認
- Step E-0 完了

### 候補 C: Food 三段式本体実装 path

**内容**:
- Phase B Commit 1-4 (foodOrchestrator / foodCatalog / foodRanker / bookingResolver) は完了済
- 三段式 (Understand / Curate / Resolve) **枠で位置づけ直し** + 食事固有差分 (S2/S3 責務境界 / 二重制約) 実装

**何が必要か**:
1. `lib/coalter/food/queryDerivation.ts` (Stage 2 入口) — 既存 foodOrchestrator の入力契約変更
2. `lib/coalter/food/candidatePool.ts` (3 source 統合) — 既存 foodCatalog 再構成
3. `lib/coalter/food/curator.ts` (LLM Ranker) — 既存 foodRanker と統合
4. `lib/coalter/food/resolveStage.ts` (営業時間 × 予約枠 二重制約) — 既存 bookingResolver と統合
5. `lib/coalter/food/diagnostics.ts`
6. Stage 1 Understand 共通基盤 (Step B M0) との接続 — `TwoPersonLensToday` を foodOrchestrator 入力契約に追加
7. `COALTER_FOOD_THREE_STAGE` flag (default OFF)

**risk**:
- 既存 foodOrchestrator 動作中、不用意な変更は production 影響
- 食事固有の二重制約 (営業時間 × 予約枠 × 立地) 設計が複雑
- Phase 3B Layer 2-D (food path narration) の凍結条件と整合性要

**unblock 条件**:
- CEO 承認 (食事ドメイン三段式着手 GO)
- foodOrchestrator の `narrationEnricher` 接続問題解決 (Phase 3B Layer 2-D 凍結条件)
- `TwoPersonLensToday` の food 用 lens 設計

### 候補 D: a4 citation UI design docs (docs-only)

**内容**:
- `docs/` に新 design doc 起草:
  - canonical Citation を UI でどう表示するか
  - SourceCandidate UI 非露出 spec (PR #115 設計反映)
  - WebSearch error の UI 非表示方針 (PR #119 反映)
  - Citation Confidence (将来) のための UI hook
  - Product Unit 連携 spec、wireframe (text-based)
  - interaction flow
- code touch なし、tests 不要

**risk**:
- 低 (docs-only、code 影響なし)
- 単独 docs は Product Unit 合意なし → 後で reviewer 大幅修正要求 risk
- Stargazer 優先で Product Unit bandwidth ない場合、dock 不経済

**unblock 条件**:
- Product Unit との連携 timing (Stargazer 優先で競合可能性、CEO 戦略判断)

### 候補 E: CoAlter normal / daily / travel 側未完了 棚卸し深掘り (docs-only)

**内容**:
- `docs/` に depth audit:
  - normal mode (decision / negotiate / clarify) の implementation 詳細
  - Daily Mode の Layout UI と domain 接続 状態 (food / movie / その他)
  - Travel Mode の Layout UI と domain 本体 状態
  - movie 以外で実装不足の領域を grep + read で再確認

**risk**:
- 低 (docs-only)
- 本 audit と重複する可能性 → focus を「movie 以外の実装不足」に絞り、PR #120 audit との差分明確化要

**unblock 条件**:
- なし (即着手可)

---

## §4 各候補の比較表

| # | 候補 | 完了寄与 | CEO 判断必要度 | runtime risk | production risk | 既存 PR 整合性 | 即着手可? | やるべき順番 |
|---|---|---|---|---|---|---|---|---|
| A | PR #102 scaffold flags ON 経路 | **大** (movie real connection 進む) | **高** (env / production / CEO 承認 多数) | **中** (既存 4-layer と並走、競合 risk) | **高** (production rollout) | △ PR #110-#119 との関係 unclear | ❌ (env 等多数凍結) | **CEO 戦略判断後** (2 番目候補) |
| B | provider foundation a1-impl-1c → a3 wiring 経路 | **大** (movie real connection 進む) | **高** (Supabase / env / API key / movieOrchestrator / flags 多数承認) | **中** (R6 / F1 fallback / cost 暴走 risk) | **高** (production rollout) | ◎ PR #110-#119 を活用 | ❌ (凍結事項多数) | **CEO 戦略判断後** (1 番目候補) |
| C | Food 三段式本体実装 | **大** (food domain 完了に近づく) | **中** (CEO 着手承認 + Phase 3B 凍結条件) | **中** (既存 foodOrchestrator 動作中、変更 risk) | 中 | △ Phase 3B Layer 2-D との関係要確認 | ❌ (CEO 承認要) | **CEO 戦略判断後** (3 番目候補、movie と並列可能) |
| D | a4 citation UI design docs | **中** (将来 UI 実装の準備) | 低 (docs only、Product Unit 連携は別 timing) | なし | なし | ◎ PR #115/#119 反映 | ✅ 即着手可 (docs-only) | docs-only autonomous |
| E | normal/daily/travel 側 audit deep dive | **中** (PR #120 audit 補完、計画整合性向上) | 低 (docs only) | なし | なし | ◎ PR #120 補完 | ✅ 即着手可 (docs-only) | docs-only autonomous |

---

## §5 推奨 (CoAlter 内の次実装ルート、Stargazer 等は対象外)

### 5.1 短期推奨 (即着手可能、docs-only autonomous): **候補 E (normal/daily/travel 側 audit deep dive)**

理由:
- **PR #120 audit v2 は movie 中心の構造化に偏った可能性**、CEO 戦略判断材料として movie 以外の実装不足 (もしあれば) を明確化必要
- 即着手可、docs-only autonomous で CEO 承認待たずに進行可
- CEO 戦略判断 §6 の前段準備として価値最大
- 候補 D (a4 UI docs) よりも先 — UI 設計の前に「movie 以外で何が未着手か」確定すべき

### 5.2 中期推奨 (CEO 戦略判断後、実装着手): **候補 B または 候補 A**

候補 B (provider foundation a3 wiring) と 候補 A (PR #102 scaffold flags ON) は **CoAlter movie completion path の two-way alternatives**:

- **候補 B 推奨理由**: PR #110-#119 で構築した provider foundation を活用、cost observability / cache / multi-model / WebSearch error 等の **実 wiring が可能**、a3 wiring 完了で movie path の future-proof な real connection に到達
- **候補 A 弱点**: 既存 4-layer pipeline と structural scaffold の並走 / 切替え logic が unclear、PR #110-#119 と関係不明
- **ただし**: 候補 A は **PR #102 で既に scaffold 完了済**、enable のみで観測開始可能 → 短期 ROI 大、Step E shadow data 取得に直結

→ **CEO 戦略判断 §6 の最重要項**: B (future-proof) vs A (short ROI) のどちらを優先か

### 5.3 並列推奨 (movie 完了 path と独立): **候補 C (food 三段式本体)**

- foodOrchestrator は既に Phase B Commit 1-4 で実装済、三段式枠で位置づけ直しは **CEO 着手承認後 即実行可能**
- movie path と並列 (異なる sub-tree)、相互ブロックなし
- Phase 3B Layer 2-D (food path narration) 凍結条件解決を要

### 5.4 後置候補: **候補 D (a4 citation UI design docs)**

- 価値あるが、UI 実装は a4 phase でしか起きない
- Product Unit 連携要、Stargazer 優先で bandwidth 競合の可能性
- 候補 E / B / A / C の後に判断

---

## §6 自律進行可能 / CEO 判断必要 の分離

### 6.1 自律進行可能 (本 doc, 今後の docs)

| 項目 | scope |
|---|---|
| **本 decision doc** | 本 PR、docs-only autonomous commit/push/PR (merge は CEO) |
| **候補 E: normal/daily/travel 側 audit deep dive docs** | 即着手可、docs-only autonomous |
| **候補 D: a4 citation UI design docs** | docs only、Product Unit 連携は別 timing |
| **CoAlter unblock checklist docs** | docs only、凍結解除条件 + CEO 判断要項一覧 |
| **CoAlter sequence proposal docs** | docs only、Path α / Path β 比較深掘り |
| **Step E-0 詳細 docs** (rollback playbook / Sentry / Discover query / no raw prompt policy) | docs only |
| **D-2-e3-b / c / d / e 詳細 audit docs** | docs only |
| **food 三段式 vs Phase B Commit 1-4 差分 audit docs** | docs only |

### 6.2 CEO 判断必要 (実装 / runtime / production)

| 項目 | CEO 判断 | 候補 |
|---|---|---|
| 候補 A: PR #102 scaffold flags ON | 環境 flip + production rollout 承認 | 候補 A |
| 候補 B: 実 Anthropic API call / `ANTHROPIC_API_KEY` / `process.env` | env 配置 + Console enable 承認 | 候補 B |
| Anthropic Console Web Search enable (運用作業) | CEO + Build admin enable | 候補 A / B |
| Supabase migration `coalter_provider_cost_log` | staging 先行 apply 承認 | 候補 B (a1-impl-1c) |
| `BudgetUsageProvider` 実装 | a1-impl-1c 着手承認 | 候補 B |
| OpenAI npm dep 追加 + Business Terms verify | a1-impl-2 着手承認 | 候補 B optional |
| EXA ToS PDF verify + Path A/B 判断 | a1-impl-3 着手承認 | 候補 B optional |
| `flags.ts` / `movieOrchestrator` / `ProviderSelector` 修正 | a2 / a3 着手承認 | 候補 A / B |
| Food 三段式本体実装着手 | CEO GO + 既存 foodOrchestrator 接続設計 | 候補 C |
| Phase 3B Layer 2-D (food path narration) 凍結解除 | CEO 判断 | 候補 C |
| Production env 変更 / Step E 開始 | 全前提完了 + CEO 承認 | 候補 A / B |
| merge | (本 PR を含む全 PR の最終 merge は CEO) | 全候補 |

### 6.3 CEO 戦略判断要項 (本 doc からの提示、最重要 5)

| # | 判断項目 | 影響 |
|---|---|---|
| 1 | **候補 A (scaffold flags ON) vs 候補 B (provider foundation a3 wiring) のどちらを優先** | movie 完了 path 選択、最重要 |
| 2 | **候補 C (food 三段式本体実装) の並列着手判断** | food domain 完了 path |
| 3 | **PR #102 structural scaffold と PR #110-#119 provider foundation の runtime 接続関係** (movieOrchestrator 内で並走 / 競合 / 切替え) | 計画整合性 |
| 4 | **Step E-0 詳細化着手 timing** | Production rollout 準備 |
| 5 | **凍結事項の一括解除 vs 段階解除 戦略** | 着手速度 |

---

## §7 まだやらない (本 doc scope 外、明示)

- ❌ runtime 実装 (候補 A / B / C 全て本 doc では着手しない)
- ❌ 実 API 接続 / `ANTHROPIC_API_KEY` 参照 / `process.env` 参照
- ❌ env 変更 / Production env 変更
- ❌ Supabase migration / `BudgetUsageProvider` 実装
- ❌ `movieOrchestrator` / `flags` / `ProviderSelector` 修正
- ❌ Anthropic Console enable
- ❌ Step E 開始
- ❌ bug1 cleanup
- ❌ **Stargazer / Human OS 等 別領域 pivot** (CEO directive: 「CoAlter を完成させる、別タスクに頭を向けない」)
- ❌ 本 doc の merge (CEO 判断)

---

## §8 verify 結果 (commit 前自己確認)

- ✅ docs-only (`docs/coalter-runtime-integration-priority-decision.md` 1 file 追加のみ)
- ✅ lib touch 0
- ✅ src touch 0
- ✅ tests touch 0
- ✅ package touch 0
- ✅ supabase/migrations touch 0
- ✅ Alter Morning 実 path touch 0 (本 file 内 言及なし)
- ✅ secrets 値 露出 0 (token 名 reference のみ、actual value なし)
- ✅ 内容: 監査 / docs / plan に限定、Stargazer pivot 提案なし

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
