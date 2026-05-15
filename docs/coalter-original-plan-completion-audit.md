# CoAlter Original Plan Completion Audit Docs

**Status**: Draft v2 (CEO + GPT 補正反映: PR #102 main 反映済 reality を最上位 source-of-truth に修正)
**Branch**: `docs/coalter-original-plan-completion-audit`
**Base**: `main` (HEAD `2e5ab1a4`、PR #119 merge 後)
**前提**: PR #102 / #103 / #104 / #106 / #107 / #109 / #110 / #111 / #112 / #113 / #114 / #115 / #116 / #117 / #118 / #119 merged 済 + 別 系統 PR #95 (layout production deploy 2026-05-10)
**生成日**: 2026-05-15
**rev 履歴**:
- v1 (2026-05-15): 初版 (movie 偏重 → CEO + GPT 補正で修正対象)
- v2 (2026-05-15): **PR #102 (`dddfd664`、2026-05-11) の D-1-a〜D-2-e2 = 10 commit が main 反映済を最上位 source-of-truth として反映**、handoff doc (PR #102 merge 前 snapshot) の「Step D-1 未着手」記述を main reality で上書き、Source-of-truth hierarchy / Completion Ledger / Taxonomy collision 表 / 「未着手」記載ルール を新規追加

---

## §0 本 doc の目的と honest limitation

### 0.1 本 doc が確定するもの

- **CoAlter 全体計画 (movie だけでなく、master design / mainstream / layout / 3-mode / food / Step E 等) に対する完了状態の正確な棚卸し**
- **「provider foundation 完了 ≠ CoAlter 全体完了」「movie 中心 ≠ CoAlter 全体」「PR #102 で structural scaffold 完了済 ≠ runtime real connection 完了」の三重明確化**
- 「完了していないのに別領域 (Stargazer 等) へ pivot するのを構造的に防ぐ」公式記録
- 完了 / 未完了 / optional / 凍結 / CEO 判断待ち を全領域で分類
- **記憶や印象ではなく main merge 済 reality を最上位正本とする source-of-truth hierarchy 確立**

### 0.2 本 doc が確定しないもの

- 実装内容そのもの (本 doc は監査、実装は別 PR)
- 凍結解除タイミング (CEO 戦略判断)
- Pivot タイミング (CEO 戦略判断)
- 本 audit で詳細未把握の sub-phase (D-2-e3-b / c / d / e 等) の internal 構造 (CEO 補足要)

### 0.3 本 doc 起草の動機 (claude 自己反省、三段階)

**第 1 段階**: 「provider 単体 observability saturation だから Stargazer 等へ pivot 推奨」と提示 → CEO + GPT 補正で「**完了してないのに別のところに目を向けるのは甚だバカ**」と指摘。

**第 2 段階**: 当初 audit doc を movie 中心に書いた → CEO + GPT 補正で「**movie 偏重で CoAlter 全体の元計画を潰し切っていない**」と指摘。

**第 3 段階 (v2 起草の動機)**: audit doc 内で「Step D-1 (Stage 2 Curate movie) 未着手」と handoff doc (2026-05-11) の記述を引用 → CEO + GPT 補正で「**PR #102 (`dddfd664`、merged 2026-05-11) で D-1-a〜D-2-e2 計 10 commit が main 反映済 = structural scaffold 完了済**、handoff doc は PR #102 merge **前** の snapshot、main の事実と矛盾」と指摘。

→ 本 doc v2 は **main merge 済 reality を最上位 source-of-truth とした正確な inventory**。

### 0.4 「未着手」記載ルール (CEO + GPT directive、新規追加)

**今後 audit doc 内で「未着手」「未完了」と書く場合は、必ず以下の順で照合する**:

```
1. main 上 merge 済 commit / PR 履歴 (`gh pr view <N>` + `git log origin/main`)
   ← 最上位正本
2. 実 main 上の file 状態 (`git ls-tree origin/main <path>`)
3. 最新 docs (生成日が最新のもの)
4. memory / handoff (生成時点 snapshot、その後の merge を反映していない可能性あり)
5. 古い設計 doc (参照のみ、最新事実ではない)
```

**ルール**:
- 「未着手」記載前に **必ず main の merge log + 実 file 存在を確認**
- handoff doc / memory に「未着手」とあっても、それは **handoff 起草時点の snapshot**、その後 merge された可能性を main 上で verify
- merge 済の事実は **記憶や印象に上書きされない構造化された source-of-truth** で確定

---

## §0.5 Source-of-truth Hierarchy (CEO + GPT directive 反映、最重要)

| 優先度 | source | 用途 | 例 |
|---|---|---|---|
| **1 (最上位)** | **main 上 merge 済 commit / PR** | 「何が完了したか」の **唯一正本** | `gh pr view 102` / `git log origin/main` |
| 2 | **実 main 上の file 状態** | 「現状コードがどうなっているか」の正本 | `git ls-tree origin/main lib/coalter/movie/` |
| 3 | **最新 docs** (生成日 latest) | 設計意図 / 計画 reference | `coalter-handoff-2026-05-11-stepd.md` v2 等 |
| 4 | **memory / handoff** (snapshot 時点) | 生成時点 snapshot、merge を反映していない可能性 | handoff doc §3.1 等 |
| 5 | 古い設計 doc | 参照のみ、上書き対象 | `coalter-implementation-plan-mainstream.md` 元番号体系 等 |

**判断順序**: 上から下へ降りる。上位 source で確定したら、下位 source の記述は **上書きされる前提**。

---

## §0.6 Completion Ledger (main 反映済 PR 履歴)

| PR | merge SHA | merged at | 内容 | 範囲 |
|---|---|---|---|---|
| **PR #95** (squash merge) | `62dff94b` | 2026-05-10 | Layout 系統 production deploy (Stage 0.5〜4 + L4-pre 1〜3) | Layout / UI / Pattern / Presence |
| **PR #102** | `dddfd664` | 2026-05-11 12:57 | **Step D structural scaffold (D-1-a〜D-2-e2、計 10 commit)** | Stage 2 Curate movie 基盤 + Stage 3 Resolve movie 基盤 + 三段式 grand kill switch |
| **PR #110** | (D-2-e3-a0) | (2026-05-12) | Provider pure foundation (interface + ProviderSelector + safeProviderCall + citationNormalizer + budget guard) | D-2-e3-a0 |
| **PR #111** | (D-2-e3-a1 design) | (2026-05-12) | 実接続全体設計 docs | D-2-e3-a1 design |
| **PR #112** | (a1-impl-1a) | (2026-05-12) | Anthropic mock-only scaffold | D-2-e3-a1-impl-1a |
| **PR #113** | (a1-impl-1b) | (2026-05-12) | extractTheaters (P1 JSON + P2 conservative) | D-2-e3-a1-impl-1b |
| **PR #114** | (a1-impl-1d) | (2026-05-12) | cost estimate initial | D-2-e3-a1-impl-1d |
| **PR #115** | (a1-impl-1e) | (2026-05-12) | SourceCandidate semantic separation | D-2-e3-a1-impl-1e |
| **PR #116** | (a1-impl-1f) | (2026-05-12) | cache token observability + cost accuracy | D-2-e3-a1-impl-1f |
| **PR #117** | (a1-impl-1g) | (2026-05-12) | inference_geo observability + opt-in geoMultipliers hook | D-2-e3-a1-impl-1g |
| **PR #118** | (a1-impl-1h) | (2026-05-15) | pricing multi-model (Opus / Sonnet / Haiku 6 model) | D-2-e3-a1-impl-1h |
| **PR #119** | (a1-impl-1i) | `2e5ab1a4` 2026-05-15 | WebSearch error observability (observability only、action なし) | D-2-e3-a1-impl-1i |
| **PR #120** (本 PR) | (audit docs) | (pending) | CoAlter Original Plan Completion Audit docs | docs-only |

(その他 別 系統 PR: #103 / #104 / #106 / #107 / #109 等は本 audit では individual に未列挙だが、CoAlter 関連 docs / 設計 PR)

---

## §0.7 Taxonomy Collision 整理 (重要、PR #102 で混在する 4 命名体系)

CoAlter movie 関連の sub-phase 命名には **複数の incompatible な taxonomy** が並走しており、混同すると `未着手 / 完了` 判定を歪める。本 audit doc v2 で以下を canonical に固定:

| Canonical 名 (本 doc 採用) | mainstream §3 元番号 | handoff §0.2 改名 | PR #102 commit 命名 | PR #109/#111 命名 | Phase 名 (三段式) | 状態 |
|---|---|---|---|---|---|---|
| **Stage 1 Understand 共通基盤** | mainstream §3.1 = **D-1** | handoff Step B | (PR #102 範囲外) | (範囲外) | M0 | ✅ PR (Step B 系列) で完了済 |
| **Stage 2 Curate movie** | mainstream §3.2 = **D-2** | handoff **Step D-1** | PR #102 **D-1-a / b / c / d** | (範囲外) | M1 | ✅ **PR #102 で structural scaffold 完了 (`dddfd664`、2026-05-11)** |
| **Stage 3 Resolve movie 基盤** | mainstream §3.3 = **D-3** | handoff **Step D-2** | PR #102 **D-2-a / b / c / d** | (範囲外) | M2 | ✅ **PR #102 で structural scaffold 完了** |
| **Stage 3 wiring scaffold** | (mainstream 元 plan には明示なし) | (handoff 範囲外) | PR #102 **D-2-e1** (threeStagePipeline / threeStageOrchestratorAdapter) | (前段) | M2 wiring | ✅ **PR #102 で完了** |
| **三段式 grand kill switch** | (mainstream §3.3.D-3-e 相当) | (handoff 範囲外) | PR #102 **D-2-e2** (`COALTER_THREE_STAGE` 環境 flag、default OFF) | (前段) | M2 flag | ✅ **PR #102 で完了** |
| **Real provider connection** | (mainstream 元 plan: theaterResolver 3+1 段 fallback 公式→eiga→Yahoo→EXA、生 fetcher) | (handoff 範囲外) | (範囲外) | PR #109/#111 **D-2-e3** = provider 抽象化に再設計 | M2 real | ⚠ **provider foundation のみ完了**、real wiring 未 |
| └ Provider foundation pure | | | | **D-2-e3-a0** (PR #110) | | ✅ 完了 |
| └ Real provider connection design | | | | **D-2-e3-a1 design** (PR #111) | | ✅ 完了 |
| └ Anthropic provider impl | | | | **D-2-e3-a1-impl-1a〜1i** (PR #112-#119) | | ✅ 完了 (mock-only observability、9 fields) |
| └ BudgetUsageProvider Supabase | | | | **a1-impl-1c** | | ⛔ 凍結中 |
| └ OpenAI scaffold | | | | **a1-impl-2** | | ⛔ 凍結中 |
| └ EXA scaffold | | | | **a1-impl-3** | | ⛔ 凍結中 |
| └ env flag 追加 | | | | **D-2-e3-a2** | | ⛔ 凍結中 |
| └ movieOrchestrator wiring + F1 fallback + R6 | | | | **D-2-e3-a3** | | ⛔ 凍結中 |
| └ citation URL UI | | | | **D-2-e3-a4** | | ⛔ 凍結中 |
| └ D-2-e3 other sub-phase (b / c / d / e) | | | | (本 audit 詳細未把握、CEO 補足要) | | ⛔ 未着手 |

**混乱を引き起こした主要因 (本 audit v1 で発生)**:
- 「Step D-1」を handoff doc の意味 (M1 Curate movie) と読みつつ、その後 PR #102 で「D-1-a〜D-2-e2」として完了済を見落とした
- handoff doc §3.2「Step D-1 (M1 Stage 2 Curate movie) ❌ 未着手」の記述を最新と思い込み、その下に PR #102 merge が起きていた事実を verify しなかった

→ **本 v2 で「Step D-1 (Stage 2 Curate movie) 未着手」記述を取消し**、PR #102 で完了済として再分類。

---

## §1 CoAlter 全体構造 (元計画の全体像、変更なし)

### 1.1 CoAlter とは (Master Design v1.1 §1)

> 「2 人の関係・性格・履歴・今の会話・外部情報を統合して、2 人に最適な次の一手を出す **関係性支援 OS**」

- **対象 surface**: Talk (友人 DM) 限定。Rendezvous は対象外。
- **位置づけ**: A 専用 Alter / B 専用 Alter とは別レイヤーの **第 3 のレイヤー (二者間 AI)**

### 1.2 CoAlter の対象領域 (5 領域、Master Design §1)

1. 共同意思決定 (映画 / 食事 / 旅行 / 予定調整 / プレゼント)
2. すれ違い整理 (論点の可視化、感情と事実の分離)
3. 関係温度調整 (気まずさの中立翻訳)
4. 共同振り返り (二人の会話パターンの長期観察)
5. 折衷案の生成 (食い違い時の第三案)

### 1.3 CoAlter の 4 mode (Master Design §5 / Phase 2 design v0.3)

| mode | 状態 |
|---|---|
| decision | ✅ Phase 1 完了 + Phase B (food) 完了 + 動作中 |
| negotiate | ✅ Phase 2 設計確定 (rev v0.3、CEO 承認 2026-04-19) |
| clarify | ✅ Phase 2 設計確定 |
| reflect | ❌ Phase 3 後送り |

### 1.4 2 大実装系統

```
[① Layout 系統 (UI / Pattern / Presence)] ✅ Production deploy 済 (2026-05-10、PR #95)

[② Mainstream 系統 (Bug-1 / Bug-2 / 観測)]
   ├ Step A 設計整理 ✅ 完了 (2026-04-24)
   ├ Step B M0 (Stage 1 Understand 共通基盤) ✅ 完了
   ├ Step C Bug-1 (emotion retrieval) ✅ 完了 (2026-05-11)
   ├ Step D Bug-2 三段式 (movie M1 Curate + M2 Resolve)
   │   ├ **PR #102 で structural scaffold (D-1-a〜D-2-e2) 完了 ✅ (2026-05-11)**
   │   └ D-2-e3 real provider connection (PR #110-#119 で foundation 完了、wiring 等は凍結中)
   └ Step E 観測 (B-6 shadow → live canary → 本番 flip) ❌ 未着手

[③ Phase 2 3-mode body] ✅ 完了 + 凍結 (CEO 6.D 合格 2026-04-19)
```

---

## §2 完了済み 一覧 (CoAlter 全体、main 反映済 source-of-truth で verify)

### 2.1 ① Layout 系統 ✅

| 領域 | 状態 | 根拠 |
|---|---|---|
| Stage 0.5 〜 4 + L4-pre 1〜3 全完了 | ✅ Production deploy 済 (2026-05-10) | PR #95 squash merge `62dff94b` |

### 2.2 ② Mainstream 系統 — Step A / B / C ✅

| 領域 | 状態 | 根拠 |
|---|---|---|
| Step A 設計整理 | ✅ 2026-04-24 | handoff §2 Step A |
| Step B M0 (Stage 1 Understand 共通基盤) | ✅ | `lib/coalter/understanding/` 14 file / 132 tests PASS、B-5 runtime shadow 並走着地 `47d57a46` |
| Step C Bug-1 (emotion retrieval) | ✅ 2026-05-11 (CEO Option α 採用) | mainstream §2、Phase 1/2/3 + 3B Layer 1/2-A/2-B/2-C 全 commit + main 反映 |

### 2.3 ② Mainstream 系統 — Step D structural scaffold ✅ (PR #102、最重要 補正点)

**PR #102 (`dddfd664`、2026-05-11 12:57:15) で以下 10 commit 全 main 反映済**:

| commit SHA | sub-phase | 内容 |
|---|---|---|
| `f32c9209` | **D-1-a** (Stage 2 Curate movie) | Query Derivation (`queryDerivation.ts` 179 行) |
| `f9208c55` | **D-1-b** (Stage 2 Curate movie) | Candidate Pool + Soft Availability Filter (`candidatePool.ts`) |
| `feece2ba` | **D-1-c** (Stage 2 Curate movie) | LLM Ranker with Personality-Rooted Narration (`curator.ts` 664 行) |
| `ab8fd8af` | **D-1-d** (Stage 2 Curate movie) | UI 連携 + kill switch `movieCuratorLiveEnabled` (`flags.ts` 追加) |
| `d103a612` | **D-2-a** (Stage 3 Resolve movie) | theaterResolver 基盤 (3+1 段 fallback、`theaterResolver.ts` 236 行) |
| `2d06a503` | **D-2-b** (Stage 3 Resolve movie) | adjacency table + Concentric Area Expansion (`adjacencyTable.ts` 197 行 + `areaExpansion.ts` 171 行) |
| `dd393e93` | **D-2-c** (Stage 3 Resolve movie) | Tier 2 Fail Narration (`tierFailNarration.ts` 181 行) |
| `089295ff` | **D-2-d** (Stage 3 Resolve movie) | Stage 3 Prefetch 投機的並列 fetch (`stage3Prefetch.ts` 191 行) |
| `318f009f` | **D-2-e1** (三段式本線 movie) | Structural scaffold (`threeStagePipeline.ts` 269 行 + `threeStageOrchestratorAdapter.ts`) |
| `6e1ec5f4` | **D-2-e2** (三段式本線 movie) | `COALTER_THREE_STAGE` grand kill switch (`flags.ts` 拡張、default OFF) |

→ **`lib/coalter/movie/` 配下 12 file (`adjacencyTable.ts` / `areaExpansion.ts` / `candidatePool.ts` / `curator.ts` / `diagnostics.ts` / `queryDerivation.ts` / `stage3Prefetch.ts` / `theaterResolver.ts` / `threeStageOrchestratorAdapter.ts` / `threeStagePipeline.ts` / `tierFailNarration.ts`) が main 反映済**

→ `flags.ts` に `movieCuratorLiveEnabled` (line 141) + `threeStageEnabled` (line 165) 共に追加済、両方 default OFF (= shadow / dormant 状態)。

**意義**:
- ✅ **Stage 2 Curate movie (D-1-a〜D-1-d) 本体実装完了** (mainstream §3.2 D-2 / handoff Step D-1)
- ✅ **Stage 3 Resolve movie 基盤 (D-2-a〜D-2-d) 本体実装完了** (mainstream §3.3 D-3 / handoff Step D-2)
- ✅ **三段式 structural scaffold + grand kill switch (D-2-e1, e2) 完了**
- ⚠ ただし **default OFF = 既存 4-layer pipeline と shadow 並走**、real production runtime に切替えるには env で true にする必要

### 2.4 ② Mainstream 系統 — D-2-e3 Provider Foundation ✅ (PR #110-#119)

PR #102 で structural scaffold 完了後、**D-2-e3 = real provider connection** として PR #109 で再設計、PR #110-#119 で実装。

| PR | sub-phase | 内容 | 観測 field |
|---|---|---|---|
| #110 | D-2-e3-a0 (pure foundation) | interface + ProviderSelector + safeProviderCall + citationNormalizer + budget guard | (foundation) |
| #111 | D-2-e3-a1 design review | 実接続 12 項目設計 + sub-phase 分解 | (design only) |
| #112 | a1-impl-1a scaffold | Anthropic mock-only scaffold | tokenInput / tokenOutput / searchCallCount |
| #113 | a1-impl-1b extractTheaters | P1 JSON + P2 conservative regex | (theaters layer) |
| #114 | a1-impl-1d cost estimate | cost observability initial | costEstimateCents |
| #115 | a1-impl-1e source candidates | canonical Citation と SourceCandidate semantic 分離 | (sourceCandidates layer) |
| #116 | a1-impl-1f cache token | cache token + cost accuracy | tokenCacheCreate / tokenCacheRead |
| #117 | a1-impl-1g inference_geo | inference_geo + opt-in geoMultipliers hook | inferenceGeo |
| #118 | a1-impl-1h pricing multi-model | Opus/Sonnet/Haiku 6 model pricing | (multi-model) |
| #119 | a1-impl-1i WebSearch error | WebSearch error observability (action なし) | webSearchErrorCount / webSearchLastErrorCode |

→ `lib/coalter/movie/providers/` 配下、`ProviderRawDiagnostics` に 9 fields、Anthropic provider mock-only observability **完了**。

### 2.5 ③ Phase 2 3-mode body ✅

| 領域 | 状態 |
|---|---|
| Phase 2 3-mode (decision / negotiate / clarify) body | ✅ 完了 + 凍結 (CEO 6.D 合格 2026-04-19、Phase 2 design v0.3) |

### 2.6 関連 完了部分

| 領域 | 状態 |
|---|---|
| Phase B foodOrchestrator / foodCatalog / foodRanker / bookingResolver Commit 1-4 | ✅ 完了 (food 三段式枠で位置づけ直しは未) |
| catalog parser 強化 3 commit (`9a52bfba` / `f7f597e5` / `fcfc3d8b`) | ✅ main 反映済 (CEO「温存」確定 2026-05-11) |
| `coalterDispatch` G6 (theme === "general" / "schedule" NONE 返し) | ✅ Phase 2 凍結 6 項目 |

---

## §3 未完了一覧 (CoAlter 全体)

### 3.1 ② Mainstream 系統 — Step D real connection 残

| sub-phase | 領域 | 状態 |
|---|---|---|
| **D-2-e3 real provider connection 残** | | |
| - a1-impl-1c BudgetUsageProvider Supabase 実装 | | ⛔ 凍結中 (Supabase migration 要) |
| - a1-impl-2 OpenAI SDK wrapper | | ⛔ 凍結中 (npm dep `openai` + Business Terms verify) |
| - a1-impl-3 EXA SDK wrapper | | ⛔ 凍結中 (ToS PDF verify + Path A/B) |
| - D-2-e3-a2 env flag (`COALTER_THREE_STAGE_PROVIDER_CHAIN` 等) + `flags.ts` 拡張 | | ⛔ 凍結中 |
| - D-2-e3-a3 `movieOrchestrator` extract + adapter wiring + F1 4-layer passthrough fallback + R6 (theaters=[]) Option C | | ⛔ 凍結中 |
| - D-2-e3-a4 citation URL UI (Product Unit 連携) | | ⛔ 凍結中 |
| **D-2-e3 内 残 sub-phase (本 audit 詳細未把握)** | | |
| - D-2-e3-b / c | (詳細不明、CEO 補足要) | ⛔ 未着手 |
| - D-2-e3-d | M0 lens 実接続 (`engine.ts` touch、PR #111 §1.1 言及) | ⛔ 未着手 |
| - D-2-e3-e | prefetch + diagnostics 仕上げ (PR #111 §1.1 言及) | ⛔ 未着手 |

### 3.2 ② Mainstream 系統 — Step E 観測 残

| sub-phase | 状態 |
|---|---|
| Step E-1 B-6 shadow 観測 (understandingShadowMovie ON 並走) | ⏳ Step D real connection 完了後 (handoff §2 Step E) |
| Step E-2 live integration canary (D-3 完了後) | ❌ Step D-3 完了後 |
| Step E-3 本番 flip 審議 (CEO 審議必須) | ❌ E-2 合格後 |
| Sentry / logging / PII / no raw prompt policy | ❌ Step E-0 別 doc |
| Discover query / dashboard 設計 | ❌ Step E-0 |
| Production rollout / allowlist / rollback playbook | ❌ Step E-0 |

### 3.3 環境 / Operation 残

| 項目 | 状態 |
|---|---|
| 実 Anthropic API call | ⛔ Anthropic Console enable + key + CEO 承認 |
| `ANTHROPIC_API_KEY` 環境管理 | ⛔ |
| Anthropic Console Web Search enable (運用作業) | ⛔ |
| Supabase migration 要否判断 (`coalter_provider_cost_log` 等) | ⛔ |
| `process.env` 参照 (a2 phase で必要) | ⛔ |
| Production env 反映 | ⛔ |
| **flags ON 切替** (`movieCuratorLiveEnabled` / `threeStageEnabled` / `COALTER_THREE_STAGE_PROVIDER_CHAIN`) | ⛔ structural scaffold 完了済だが default OFF、enable は別 phase |

### 3.4 関連 別 phase 凍結中

| 領域 | 状態 |
|---|---|
| Phase 3B Layer 2-D (food path narration) | ⛔ 別 phase (CEO 判断保留中) |
| Bug-1 / Bug-2 narration 接続 効果再観測 | ⏳ Step D real connection 完了後 |
| 重複 commit 6 ペア整理 | 別 task (低優先度) |

### 3.5 食事ドメイン food 三段式 残

| 状態 |
|---|
| ⚠ Phase B Commit 1-4 で foodCatalog / foodRanker / foodOrchestrator / bookingResolver は実装済 |
| ❌ 三段式 (Understand / Curate / Resolve) の枠で位置づけ直しは未 (food-three-stage-design.md §0) |
| ❌ S2 と S3 の責務境界が曖昧 |
| ❌ Stage 1 Understand との接続が宣言のみ |
| ❌ 食事固有の二重制約 (営業時間 × 予約枠) 未設計 |
| → **food 三段式の本体実装は未着手** |

### 3.6 reflect mode (4 mode 目)

| 状態 |
|---|
| ❌ Phase 3 後送り (Phase 2 design v0.3 §0 で明示) |

---

## §4 Optional / 後回しでよいもの

(変更なし、§4 v1 と同様)

- 4.1 Provider observability 拡張系 (Cost uncertainty band / Token efficiency / Cross-validation signal / per-code histogram / Cost Breakdown / Provider Capability Registry / Anti-Hallucination Guard) — 全て CEO 凍結中
- 4.2 並列作業 (OpenAI / EXA scaffold) — Anthropic Primary 単独で Production 可
- 4.3 後送り phase (reflect mode / 個別チャネル / Rendezvous CoAlter 展開 / 新規ドメイン)

---

## §5 凍結中項目 — 理由 + 凍結解除条件 + 解除後 実装順

(変更なし、§5 v1 と同様。一部 wording 補正)

### 5.1 凍結項目一覧

(v1 §5.1 と同様、表略)

### 5.2 凍結解除の典型 順序

```
[現状: PR #119 merged、provider foundation (Anthropic 単体) 完了]
   ↓
[PR #102 で Step D structural scaffold 完了済、main 反映済、flags default OFF]
   ↓
[CEO 戦略判断 §A: PR #102 scaffold 経路で flags ON にして production 走らせるか、PR #110-#119 provider foundation 経路で a3 wiring に進むか]
   ↓
   ├ Path α (PR #102 scaffold 経路): flags ON + Step E shadow → canary → live
   └ Path β (provider foundation 経路): a1-impl-1c → a2 → a3 → a3 verify → Step E-0 → Step E
   ↓
[Step D real connection 完了]
   ↓
[食事ドメイン food 三段式 本体実装]
   ↓
[並列: a1-impl-2/3 OpenAI/EXA scaffold + a4 citation UI + Phase 3B Layer 2-D food narration]
   ↓
[CoAlter movie + food 全体完了 + Production observation]
   ↓
[Phase 3 reflect mode 開始判断]
```

→ **「provider foundation 完了 → 即 Production」ではない**。少なくとも 6-10 段階の sub-phase + CEO 凍結解除条件が必要。

---

## §6 CoAlter 全体 完了判定 (本 audit 結論 v2)

### 6.1 領域別 完了状態 (main reality 反映)

| 領域 | 状態 | 備考 |
|---|---|---|
| **① CoAlter Layout 系統 (UI / Pattern / Presence)** | ✅ **完了** + Production deploy 済 | 2026-05-10 (PR #95) |
| **③ CoAlter Phase 2 3-mode body (decision / negotiate / clarify)** | ✅ **完了** + 凍結 | CEO 6.D 合格 2026-04-19 |
| **② Step A 設計整理** | ✅ **完了** | 2026-04-24 |
| **② Step B M0 Stage 1 Understand (共通基盤)** | ✅ **完了** | 14 file / 132 tests PASS |
| **② Step C Bug-1 (emotion retrieval)** | ✅ **完了** | CEO Option α 採用 2026-05-11 |
| **② Step D structural scaffold (D-1-a〜D-2-e2)** | ✅ **完了** | **PR #102 main 反映済 (`dddfd664`、2026-05-11)** |
| **② Step D D-2-e3 Provider foundation (PR #110-#119)** | ✅ **完了** (Anthropic 単体 9 fields observability、mock-only) | mock-only、real wiring 未 |
| Phase B foodOrchestrator / foodCatalog / foodRanker / bookingResolver Commit 1-4 | ✅ 完了 | food 三段式枠は未 |
| **② Step D D-2-e3 real connection (a3 wiring + a4 UI + Step E 等)** | ❌ **未完了** | 凍結中 |
| **② Step E 観測 (B-6 shadow → live canary → 本番 flip)** | ❌ **未着手** | |
| **food 三段式 (Understand / Curate / Resolve) 本体** | ❌ **未着手** | Phase B Commit 1-4 のみ |
| **reflect mode (4 mode 目)** | ❌ **後送り** (Phase 3) | |

### 6.2 階層別 結論 (v2 補正、CEO + GPT directive 反映)

| 階層 | 完了状態 |
|---|---|
| **Provider foundation (PR #110-#119)** | ✅ **completed** |
| **Step D structural scaffold (PR #102)** | ✅ **completed** ← v1 で間違い、v2 で訂正 |
| Movie runtime real connection (a3 wiring + flags ON + Step E) | ❌ **incomplete** |
| **CoAlter movie 完了** | ❌ **incomplete** |
| **CoAlter food 完了** | ❌ **incomplete** |
| CoAlter normal mode 完了 (decision / negotiate / clarify) | ✅ **completed (設計 + 3-mode body 凍結)** |
| CoAlter reflect mode 完了 (4 mode 目) | ❌ **incomplete (Phase 3 後送り)** |
| **CoAlter 全体 product-level 完了** | ❌ **incomplete** |

### 6.3 結論 (v2、CEO + GPT directive 反映)

> **Provider foundation: completed (PR #110-#119)**
> **Structural scaffold: completed (PR #102、`dddfd664`、2026-05-11)**
> **Runtime real connection: incomplete** (a3 wiring + flags ON + Step E 全て凍結中)
> **Production observation: incomplete** (Step E 未着手)
> **CoAlter 全体: incomplete** (food 三段式本体 / reflect mode / D-2-e3 残 等)
>
> 別領域 (Stargazer 等) への pivot は **時期尚早**、CoAlter 全体完了まで保留。

---

## §7 次にやるべき順番 (v2、PR #102 fact 反映後)

### 7.1 CEO 確認不要で進めてよい候補 (autonomous docs-only execution)

| 項目 | scope |
|---|---|
| **本 audit doc v2** | 本 PR #120、自律 commit/push/PR 完了 |
| **CoAlter unblock checklist docs** | docs only、凍結解除条件 + CEO 判断要項一覧 |
| **CoAlter sequence proposal docs** | docs only、Path α (PR #102 scaffold flags ON) / Path β (provider foundation a3 wiring) 比較 |
| **D-2-e3-b / c / d / e 詳細 audit docs** | docs only、本 audit で未把握の sub-phase inventory |
| **food 三段式 vs Phase B Commit 1-4 差分 audit docs** | docs only |
| **Citation UI design draft docs (a4)** | docs only |
| **Step E-0 詳細 docs** (rollback playbook / Sentry / Discover query / no raw prompt policy) | docs only |

### 7.2 CEO 確認が必要な候補 (実装 / runtime / production)

(v1 §7.2 と同様、wording 補正)

### 7.3 CEO 戦略判断要項 (v2 補正、最重要)

| # | 判断項目 | 影響 |
|---|---|---|
| 1 | **Path α (PR #102 scaffold 経路: flags ON で shadow → canary → live) vs Path β (provider foundation 経路: a1-impl-1c → a2 → a3) のどちらを優先** | CoAlter movie 完了 path 選択 (これが最重要) |
| 2 | PR #102 で完了した structural scaffold と PR #110-#119 provider foundation の **runtime 接続関係** (movieOrchestrator 内で並走 / 競合 / 切替えどうするか) | 計画 整合性 |
| 3 | Anthropic Console Web Search enable + ANTHROPIC_API_KEY 配置タイミング | a3 wiring + Step E 着手前提 |
| 4 | Supabase migration `coalter_provider_cost_log` 適用タイミング | a1-impl-1c 着手前提 |
| 5 | OpenAI npm dep 追加判断 | a1-impl-2 着手判断 |
| 6 | EXA ToS PDF verify 完了 + Path A/B 判断 | a1-impl-3 着手判断 |
| 7 | `flags.ts` / `movieOrchestrator` additive 拡張許可タイミング | a2 / a3 着手判断 |
| 8 | a4 citation UI design Product Unit 連携タイミング | a4 着手判断 |
| 9 | D-2-e3-b / c / d / e 詳細 (本 audit で未把握) の説明 | 計画 整合性 |
| 10 | food 三段式 本体実装着手タイミング | food 完了 path |
| 11 | Phase 3B Layer 2-D food path narration の凍結解除条件 | food narration 完了 |
| 12 | Anti-Hallucination Guard 凍結条件の明確化 | (将来 sub-phase) |
| 13 | Step E-0 着手 timing | Production rollout 準備 |
| 14 | reflect mode (Phase 3) 着手 timing | CoAlter 4 mode 完成 |

---

## §8 本 audit からの推奨

### 8.1 短期 (CEO 即判断可能)

1. **本 audit doc v2 を merge** (CoAlter 全体計画 vs main reality の差分を公式記録 + Source-of-truth hierarchy 確立)
2. **CEO 判断要項 §7.3 から優先 1-3 項目選択**:
   - **#1**: Path α / Path β 選択 (これが最重要)
   - 残りは docs / CEO 凍結解除 / 実装着手判断
3. **Stargazer 等への pivot は CoAlter 全体完了まで保留**

### 8.2 中期

- Path α / β いずれかで Step D real connection 完了
- food 三段式 本体実装
- Step E-0 詳細化 → Step E 開始

### 8.3 長期

- CoAlter movie + food + 4 mode 全体完了後に Stargazer 等 別領域 pivot 検討

---

## §9 まだやらない (本 doc scope 外、明示)

- ❌ lib / src / test / package / migration 変更
- ❌ provider 実装 / runtime 変更
- ❌ 実 API 接続 / `ANTHROPIC_API_KEY` 参照 / `process.env` 参照
- ❌ `movieOrchestrator` / `flags` / `ProviderSelector` 修正
- ❌ Supabase migration / `BudgetUsageProvider` 実装
- ❌ env flag 追加 / Production env 変更 / Step E 開始
- ❌ bug1 cleanup
- ❌ **Stargazer / Human OS 等 別領域 pivot** (本 audit 結論: CoAlter 全体未完了のため時期尚早)

---

## §10 verify 結果 (commit 前自己確認)

- ✅ docs-only (`docs/coalter-original-plan-completion-audit.md` 1 file のみ)
- ✅ lib touch 0
- ✅ src touch 0
- ✅ tests touch 0
- ✅ package touch 0
- ✅ supabase/migrations touch 0
- ✅ Alter Morning 実 path touch 0 (本 file 内 言及は meta-reference のみ)
- ✅ secrets 値 露出 0 (token 名 reference のみ、actual value なし)

---

## §11 v2 改訂で追加した主要構造

| § | 追加内容 | 動機 (CEO + GPT directive) |
|---|---|---|
| §0.4 | 「未着手」記載ルール | 「main merge 履歴と照合してから書く」を構造化 |
| §0.5 | Source-of-truth Hierarchy | main 上 merge 済 commit を最上位正本に固定 |
| §0.6 | Completion Ledger | PR #95 / #102 / #110-#119 / #120 を表で一覧化 |
| §0.7 | Taxonomy Collision 整理表 | mainstream §3 / handoff / PR #102 / PR #109-#111 の 4 命名体系混在を canonical 化 |
| §2.3 | Step D structural scaffold (PR #102) 完了 明示 | v1 で間違い → v2 で訂正、PR #102 の 10 commit 詳細 列挙 |
| §6.2 | 階層別結論 補正 | structural scaffold completed を追加 |

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
