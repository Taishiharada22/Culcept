# CoAlter Original Plan Completion Audit Docs

**Status**: Draft (docs-only、autonomous commit/push/PR 想定、merge は CEO 判断)
**Branch**: `docs/coalter-original-plan-completion-audit`
**Base**: `main` (HEAD `2e5ab1a4`、PR #119 merge 後)
**前提**: PR #102 / #103 / #104 / #106 / #107 / #109 / #110 / #111 / #112 / #113 / #114 / #115 / #116 / #117 / #118 / #119 merged 済 + 別 系統 PR #95 (layout production deploy 2026-05-10) 等
**生成日**: 2026-05-15

---

## §0 本 doc の目的と honest limitation

### 0.1 本 doc が確定するもの

- **CoAlter 全体計画 (movie だけでなく、master design / mainstream / layout / 3-mode / food / Step E 等)** に対する完了状態の正確な棚卸し
- **「provider foundation 完了 ≠ CoAlter 全体完了」「movie 中心 ≠ CoAlter 全体」の二重明確化**
- 「完了していないのに別領域 (Stargazer 等) へ pivot するのを構造的に防ぐ」公式記録
- 完了 / 未完了 / optional / 凍結 / CEO 判断待ち を全領域で分類

### 0.2 本 doc が確定しないもの

- 実装内容そのもの (本 doc は監査、実装は別 PR)
- 凍結解除タイミング (CEO 戦略判断)
- Pivot タイミング (CEO 戦略判断)
- 本 audit で未把握の sub-phase の internal 構造 (CEO 補足要)

### 0.3 本 doc 起草の動機 (claude 自己反省、二段階)

**第 1 段階**: 「provider 単体 observability saturation だから Stargazer 等へ pivot 推奨」と提示 → CEO + GPT 補正で「**完了してないのに別のところに目を向けるのは甚だバカ**」と指摘。

**第 2 段階 (本 audit doc 修正の動機)**: 当初 audit doc を movie 中心に書いた → CEO + GPT 補正で「**movie 偏重で CoAlter 全体の元計画を潰し切っていない**」と指摘。

→ 本 doc は CoAlter **全体 (movie 以外を含む)** の元計画 inventory を構造化する公式記録。

### 0.4 本 audit のソース doc 一覧

| ソース doc | 役割 |
|---|---|
| `docs/coalter-master-design.md` v1.1 | 全体原則、4 modes、5 layers、対象領域 |
| `docs/coalter-implementation-plan-mainstream.md` v0.1 | Step C / D / E 系統 (Bug-1/Bug-2/観測) |
| `docs/coalter-implementation-plan-layout.md` | Layout 5-Stage 系統 (UX / Pattern / Presence) |
| `docs/coalter-phase2-3mode-design.md` v0.3 | Phase 2 3-mode (decision/negotiate/clarify) |
| `docs/coalter-handoff-2026-05-11-stepd.md` v2 | 直近 progress snapshot (2026-05-11) |
| `docs/coalter-movie-three-stage-design.md` rev 3.2 | movie 三段式設計 |
| `docs/coalter-food-three-stage-design.md` rev 3 | food 三段式設計 |
| `docs/coalter-d2e3a-implementation-design-review.md` (PR #109) | D-2-e3-a provider foundation 設計 |
| `docs/coalter-d2e3-a1-real-connection-design-review.md` (PR #111) | D-2-e3-a1 real provider connection 設計 |
| `docs/coalter-bug1-emotion-retrieval-design.md` v0.2 | Bug-1 emotion retrieval (完了済参照) |
| `docs/coalter-integration-contract-2026-04-24.md` v0.1 rev 1 FIXED | P0 統合契約 |
| `docs/coalter-runtime-contract-2026-04-24.md` v0.1 FIXED | P1 runtime 契約 |
| `docs/coalter-core-ux-layered-presence.md` v1.1 | UX 層別 presence 設計 |

---

## §1 CoAlter 全体構造 (元計画の全体像)

### 1.1 CoAlter とは (Master Design v1.1 §1 より)

> 「2 人の関係・性格・履歴・今の会話・外部情報を統合して、2 人に最適な次の一手を出す **関係性支援 OS**」

- **対象 surface**: Talk (友人 DM) 限定。Rendezvous は対象外。
- **位置づけ**: A 専用 Alter / B 専用 Alter とは別レイヤーの **第 3 のレイヤー (二者間 AI)**

### 1.2 CoAlter の対象領域 (Master Design §1 より、5 領域)

| # | 領域 | 例 |
|---|---|---|
| 1 | **共同意思決定** | 映画 / 食事 / 旅行 / 予定調整 / プレゼント |
| 2 | **すれ違い整理** | 論点の可視化、感情と事実の分離 |
| 3 | **関係温度調整** | 気まずさの中立翻訳 |
| 4 | **共同振り返り** | 二人の会話パターンの長期観察 |
| 5 | **折衷案の生成** | 食い違い時の第三案 |

### 1.3 CoAlter の 4 mode (Master Design §5 / Phase 2 design v0.3 より)

| mode | トリガー | 動作 | 状態 |
|---|---|---|---|
| **decision** | 「何にする?」「どこ行く?」系 | 要約 → 論点整理 → Web 検索 → 候補提示 | Phase 1 完了 + Phase B (food) 完了 + 動作中 |
| **negotiate** | 好みが矛盾・膠着 | 利害分解 → パイ拡大 → 第三案生成 | Phase 2 設計確定 (rev v0.3、CEO 承認 2026-04-19) |
| **clarify** | すれ違い・誤解の兆候 | 論点の可視化 → 感情/事実分離 → 中立翻訳 | Phase 2 設計確定 |
| **reflect** | 「最近どうだっけ」振り返り | 過去の会話パターン要約 → 共有気づき | **Phase 3 後送り** (Phase 2 では触らない) |

### 1.4 CoAlter の 5 層 architecture (Master Design §3 より)

| Layer | 役割 |
|---|---|
| Layer 1: 個人理解 | データソース (AlterPersonality / 45 軸 / Stargazer 深層観測) |
| Layer 2: 関係理解 | 新規構築 (Fairness Ledger、interaction history 等) |
| Layer 3: 現在会話理解 | 膠着検出 (Ambiguity Engine、NVC、Intent Translation) |
| Layer 4: 外部世界接続 | Adaptive RAG (Web 検索、CRAG 品質ゲート) |
| Layer 5: 提案生成 | 出力構造 (Phase 1 出力カード固定テンプレート) |

### 1.5 CoAlter の 2 大実装系統 (mainstream + layout、handoff §3 より)

```
[① Layout 系統 (UI / Pattern / Presence)]
   └ Stage 0.5 / 1 / 2 / 3 / 4 + L4-pre 1〜3 全完了
   └ ✅ Production deploy 済 (2026-05-10、PR #95 squash merge `62dff94b`)

[② Mainstream 系統 (Bug-1 / Bug-2 / 観測)]
   ├ Step A 設計整理 ✅ 完了 (2026-04-24)
   ├ Step B M0 (Stage 1 Understand 共通基盤) ✅ 完了 (実装 + B-5 runtime shadow 並走着地)
   ├ Step C Bug-1 (emotion retrieval) ✅ 完了 (2026-05-11、CEO Option α 採用)
   ├ Step D Bug-2 三段式 (movie M1 Curate + M2 Resolve)
   │   ├ Step D-1 (= mainstream §3.2 D-2 = M1 Stage 2 Curate movie) ❌ 未着手 (handoff §3.2)
   │   └ Step D-2 (= mainstream §3.3 D-3 = M2 Stage 3 Resolve movie) ⚠ 部分着手 (provider foundation のみ)
   └ Step E 観測 (B-6 shadow → live canary → 本番 flip) ❌ 未着手

[③ Phase 2 3-mode body]
   └ ✅ 完了 + 凍結 (CEO 6.D 合格 2026-04-19)
```

### 1.6 私が PR #110-#119 でやったこと (位置づけ)

私が直近 9 PR でやってきたのは **Step D 内の特定 sub-tree** の準備工事:

```
Step D Bug-2 三段式 (mainstream §3)
   ├ D-1 = M0 Understanding common base ✅ 完了 (handoff Step B、別 work)
   ├ D-2 = M1 Stage 2 Curate movie ❌ 未着手 (handoff §3.2、別 work)
   └ D-3 = M2 Stage 3 Resolve movie
       ├ 元計画 §3.3: theaterResolver 3+1 段 fallback (公式 → eiga → Yahoo → EXA) → ⚠ 元計画は **provider 抽象化なしの直接 fetcher**
       └ **PR #109 で再設計**: provider-agnostic foundation (Anthropic / OpenAI / EXA SDK 抽象化) → "D-2-e3" 系列で実装
           ├ D-2-e3-a0 (PR #110、provider foundation) ✅
           ├ D-2-e3-a1 (PR #111 design + PR #112-#119 implementation)
           │   ├ a1-impl-1a (#112、scaffold) ✅
           │   ├ a1-impl-1b (#113、extractTheaters) ✅
           │   ├ a1-impl-1d (#114、cost estimate) ✅
           │   ├ a1-impl-1e (#115、SourceCandidate semantic separation) ✅
           │   ├ a1-impl-1f (#116、cache token observability) ✅
           │   ├ a1-impl-1g (#117、inference_geo) ✅
           │   ├ a1-impl-1h (#118、multi-model pricing) ✅
           │   ├ a1-impl-1i (#119、WebSearch error observability) ✅
           │   ├ a1-impl-1c (BudgetUsageProvider Supabase) ⛔ 凍結
           │   ├ a1-impl-2 (OpenAI scaffold) ⛔ 凍結
           │   └ a1-impl-3 (EXA scaffold) ⛔ 凍結
           ├ D-2-e3-a2 (env flag、flags.ts 追加) ⛔ 凍結
           ├ D-2-e3-a3 (movieOrchestrator wiring + F1 fallback) ⛔ 凍結
           └ D-2-e3-a4 (citation URL UI) ⛔ 凍結
```

→ **PR #110-#119 = "Step D-3 (Stage 3 Resolve) の provider 抽象化基盤" のみ完了**。Step D-2 (Stage 2 Curate) は **未着手**、Step D-3 内の runtime wiring (a3) も **凍結**、Step E (観測) も **未着手**。

→ **CoAlter 全体の中で完了しているのは ①Layout 系統 / ③Phase 2 3-mode / ②Step A・B・C / ②Step D-3 の provider foundation のみ**。

---

## §2 完了済み一覧 (CoAlter 全体)

### 2.1 ① Layout 系統 (UI / Pattern / Presence)

| 領域 | 状態 | 根拠 |
|---|---|---|
| Stage 0.5 (下位 doc 整理 + 整合追記) | ✅ 完了 | layout plan §3.5 |
| Stage 1 (preview 静的試作、L1-a 〜 L1-k) | ✅ 完了 | Daily Mode / Travel Mode 画面静的再現含む |
| Stage 2 (通常 executor 骨格、L2-a 〜 L2-m) | ✅ 完了 | modeReducer / shared memory store / 緊急介入 trigger / speechBuilder hook 等 |
| Stage 3 (preview E2E、L3-a 〜 L3-j) | ✅ 完了 | Daily / Travel Mode 1 サイクル E2E + CEO 観測フェーズ |
| Stage 4 (ChatClient 本実装、L4-a 〜 L4-m) | ✅ 完了 (CEO 承認後) | 上部レイヤー本番マウント / signal adapter 本番接続 / legacy CoAlterCard 退役 / a11y / production flip / legacy code 削除 |
| L4-pre 1 / 2 / 3 (production deploy 前準備) | ✅ 完了 | 2026-05-10 |
| **Production deploy** | ✅ **本番稼働中** | PR #95 squash merge `62dff94b`、3 旗 ON 反映済 |

### 2.2 ② Mainstream 系統 — 完了部分

| 領域 | 状態 | 根拠 |
|---|---|---|
| Step A 設計整理 | ✅ 完了 | handoff §2 Step A (2026-04-24) |
| **Step B M0 — Stage 1 Understand (共通基盤)** | ✅ 完了 | handoff §2 Step B rev 5、`lib/coalter/understanding/` 14 file / 132 tests PASS |
| - D-1-a 型定義 (`TwoPersonLensToday` / `ObservationBundle` / `PersonFusion` / `RelationalFusion` / `FairnessAdjustment`) | ✅ | mainstream §3.1 |
| - D-1-b ObservationBundle 収集 | ✅ | 5 source 全収集 |
| - D-1-c Fusion レイヤー | ✅ | personFusion / relationalFusion / fairnessAdjustment |
| - D-1-d todayReader (LLM 軽量プロンプト) | ✅ | `runUnderstanding(pairId): TwoPersonLensToday` entry point |
| - D-1-e flag / diagnostics 整合 | ✅ | `understandingLiveEnabled` flag (default OFF) |
| - B-5 runtime shadow 並走接続 | ✅ | `47d57a46` |
| **Step C Bug-1 — emotion retrieval** | ✅ 完了 (CEO Option α 採用 2026-05-11) | mainstream §2 |
| - Phase 1 EMOTION_TAG_LEXEMES 正本化 | ✅ | |
| - Phase 2 extractEmotionTags + 失敗独立 5 条文 | ✅ | |
| - Phase 3 decideSearch 再設計 + 3 系統テスト | ✅ | |
| - Phase 3B Layer 1 / 2-A / 2-B / 2-C | ✅ | (Layer 2-D food path narration は別 phase 凍結中) |

### 2.3 ② Mainstream 系統 — Step D 部分完了 (D-3 Provider Foundation のみ)

私が PR #110-#119 で完了させたのは **Step D-3 (Stage 3 Resolve) の provider 抽象化基盤**:

| sub-PR | sub-phase | 内容 | 観測 field |
|---|---|---|---|
| #110 | D-2-e3-a0 (pure foundation) | interface + ProviderSelector + safeProviderCall + citationNormalizer + budget guard | (foundation) |
| #111 | D-2-e3-a1 design review | 実接続 12 項目設計 + sub-phase 分解 | (design only) |
| #112 | a1-impl-1a scaffold | Anthropic provider mock-only scaffold | tokenInput / tokenOutput / searchCallCount |
| #113 | a1-impl-1b extractTheaters | P1 JSON parse + P2 conservative regex fallback | (theaters layer) |
| #114 | a1-impl-1d cost estimate | provider 単体 cost observability (initial) | costEstimateCents |
| #115 | a1-impl-1e source candidates | canonical Citation と SourceCandidate semantic 分離 | (sourceCandidates layer) |
| #116 | a1-impl-1f cache token | cache token observability + cost accuracy | tokenCacheCreate / tokenCacheRead |
| #117 | a1-impl-1g inference_geo | inference_geo observability + opt-in geoMultipliers hook | inferenceGeo |
| #118 | a1-impl-1h pricing multi-model | Opus 4.7/4.6/4.5 + Sonnet 4.6/4.5 + Haiku 4.5 (6 model) pricing | (multi-model pricing) |
| #119 | a1-impl-1i WebSearch error | WebSearch error observability (observability only、action なし) | webSearchErrorCount / webSearchLastErrorCode |

→ `ProviderRawDiagnostics` に 9 fields、Anthropic provider observability layer 実用的 saturation。
→ ただしこれは **Step D-3 内の provider foundation のみ**、wiring / citation UI / OpenAI / EXA / R6 fallback 等は未完了。

### 2.4 ③ Phase 2 3-mode body

| 領域 | 状態 | 根拠 |
|---|---|---|
| Phase 2 3-mode (decision / negotiate / clarify) body | ✅ 完了 + 凍結 | CEO 6.D 合格 2026-04-19、Phase 2 design v0.3 |
| - modeRouter | ✅ | RouterTrace 永続化 |
| - Pre-router gate / Post-router modifier | ✅ | |
| - negotiate narration builder | ✅ | |
| - clarify narration builder (neutralTranslation) | ✅ | 「言い換え」までで止める |
| - 凍結 6 項目 | ✅ | handoff §4.1 |

### 2.5 関連 完了部分

| 領域 | 状態 | 根拠 |
|---|---|---|
| Phase B foodOrchestrator / foodCatalog / foodRanker / bookingResolver | ✅ Commit 1-4 完了 | food-three-stage-design.md §0「Phase B 既存実装」 |
| catalog parser 強化 3 commit (`9a52bfba` / `f7f597e5` / `fcfc3d8b`) | ✅ main 反映済 (CEO「温存」確定 2026-05-11) | handoff §3 |
| `coalterDispatch` G6 (theme === "general" / "schedule" NONE 返し) | ✅ Phase 2 凍結 6 項目 | handoff §4.2 |

---

## §3 未完了一覧 (CoAlter 全体)

### 3.1 ② Mainstream 系統 — Step D 残作業

| sub-phase | 領域 | 状態 | 阻害条件 |
|---|---|---|---|
| **Step D-1 (mainstream §3.2 D-2 = M1 Stage 2 Curate movie)** | `lib/coalter/movie/curator.ts` 等の本体実装 | ❌ **未着手** | (CEO 承認後着手可能、handoff §3.2) |
| - D-2-a Query Derivation (`queryDerivation.ts`) | | ❌ | |
| - D-2-b Candidate pool + Soft Availability Filter (`candidatePool.ts`) | | ❌ | B1 構造 gate (`missing_where` hard drop なし) 担保要 |
| - D-2-c LLM Ranker with Personality-Rooted Narration (`curator.ts`) | | ❌ | narration 5 要素充足、固有情報率 ≥ 80%、lens 由来引用率 ≥ 70% |
| - D-2-d UI 連携 + kill switch (`movieCuratorLiveEnabled` flag) | | ❌ | |
| **Step D-2 (mainstream §3.3 D-3 = M2 Stage 3 Resolve movie)** | `lib/coalter/movie/theaterResolver.ts` 等 | ⚠ **部分** (provider foundation のみ完了、wiring + UI 未) | a1-impl-1c / a2 / a3 / a4 全凍結中 |
| - D-3-a theaterResolver 基盤 (3+1 段 fallback) | | ⚠ **provider 抽象化に置換中** (PR #109/#111 設計、wiring 凍結) | |
| - D-3-b adjacency table + Concentric Area Expansion | | ❌ 未着手 | |
| - D-3-c Tier fail state + 別作品再起動 narration | | ❌ 未着手 | |
| - D-3-d Stage 3 prefetch 投機実行 | | ❌ 未着手 | |
| - D-3-e flag / orchestrator 組込 + diagnostics (`COALTER_THREE_STAGE`) | | ❌ 未着手 | |
| **Step D-3 内 provider foundation 残** | | ⛔ 凍結中 | |
| - a1-impl-1c BudgetUsageProvider Supabase 実装 + `coalter_provider_cost_log` migration | | ⛔ | Supabase migration 要 |
| - a1-impl-2 OpenAI SDK wrapper | | ⛔ | npm dep `openai` 追加判断 + Business Terms verify |
| - a1-impl-3 EXA SDK wrapper | | ⛔ | ToS PDF verify + Path A/B 判断 |
| - D-2-e3-a2 env flag (`COALTER_THREE_STAGE_PROVIDER_CHAIN` 等) + `flags.ts` 拡張 | | ⛔ | a1-impl 完了後 |
| - D-2-e3-a3 `movieOrchestrator` extract + adapter wiring + F1 4-layer passthrough fallback + R6 (theaters=[] success 扱い) Option C | | ⛔ | a1-impl + a2 完了後 |
| - D-2-e3-a4 citation URL UI (Product Unit 連携) | | ⛔ | Product Unit 連携 |

### 3.2 ② Mainstream 系統 — Step E 観測 残

| sub-phase | 領域 | 状態 |
|---|---|---|
| Step E-1 B-6 shadow 観測 (understandingShadowMovie ON 並走) | | ⏳ Step D-1 完了後 (handoff §2 Step E) |
| Step E-2 live integration canary (D-3 完了後) | | ❌ Step D-3 完了後 |
| Step E-3 本番 flip 審議 (CEO 審議必須) | | ❌ E-2 合格後 |
| Sentry / logging / PII / no raw prompt policy | | ❌ Step E-0 で別 doc 詳細化予定 |
| Discover query / dashboard 設計 | | ❌ Step E-0 |
| Production rollout / allowlist / rollback playbook | | ❌ Step E-0 |

### 3.3 環境 / Operation 残

| 項目 | 状態 | 阻害条件 |
|---|---|---|
| 実 Anthropic API call | ⛔ 凍結中 | Anthropic Console enable + ANTHROPIC_API_KEY 設定 + production env (CEO 承認必須) |
| `ANTHROPIC_API_KEY` 環境管理 | ⛔ | env 反映 playbook + CEO 承認 |
| Anthropic Console Web Search enable (運用作業) | ⛔ | CEO + Build で admin enable |
| Supabase migration 要否判断 (`coalter_provider_cost_log` 等) | ⛔ | staging 先行 apply + schema review |
| `process.env` 参照 (a2 phase で必要) | ⛔ | a2 phase 着手時 |
| Production env 反映 (env 変数 set) | ⛔ | env 変更 playbook + CEO 承認 |

### 3.4 関連 別 phase 凍結中

| 領域 | 状態 | 阻害条件 |
|---|---|---|
| **Phase 3B Layer 2-D (food path narration)** | ⛔ 別 phase (CEO 判断保留中) | foodOrchestrator が narrationEnricher を呼ばない構造的制約 (handoff §3.3) |
| **Bug-1 narration 接続 効果再観測** | ⏳ Step D 完了後の Step E で同時実施 | Bug-2 解決で初めて movie path に rank>0 到達、emotion_signals が prose に反映可能 |
| **重複 commit 6 ペア整理** | 別 task (低優先度、機能影響ゼロ) | back-merge 起因 |
| **Bug-2 narration 接続** | ⏳ Step D 完了後の Step E | (handoff §3.3 同上) |

### 3.5 食事ドメイン — food 三段式 (food-three-stage-design.md)

| 状態 |
|---|
| ⚠ Phase B Commit 1-4 で foodCatalog / foodRanker / foodOrchestrator / bookingResolver は実装済 |
| ⚠ ただし **三段式 (Understand / Curate / Resolve) の枠で位置づけ直すこと** が design rev 3 で必要と明示 |
| ❌ S2 と S3 の責務境界が曖昧 (food-three-stage-design.md §0 問題 1) |
| ❌ Stage 1 Understand との接続が宣言のみ (foodOrchestrator が `TwoPersonLensToday` 入力契約にしていない) |
| ❌ 食事固有の二重制約 (営業時間 × 予約枠) 未設計 |
| → **food 三段式の本体実装は未着手** (movie 三段式と並走可能だが現時点 凍結中) |

### 3.6 D-2-e3 内 残 sub-phase (本 audit で詳細未把握、CEO 補足要)

| sub-phase | 推測 | 状態 |
|---|---|---|
| **D-2-e3-b** | (詳細不明) | ⛔ 未着手、CEO 補足要 |
| **D-2-e3-c** | (詳細不明) | ⛔ 未着手、CEO 補足要 |
| **D-2-e3-d** | M0 lens 実接続 (`engine.ts` touch、PR #111 §1.1 言及) | ⛔ 未着手 |
| **D-2-e3-e** | prefetch + diagnostics 仕上げ (PR #111 §1.1 言及) | ⛔ 未着手 |

---

## §4 Optional / 後回しでよいもの

### 4.1 Provider observability 拡張系 (incremental marginal value、CEO 凍結中)

| 項目 | 評価 |
|---|---|
| Cost estimate uncertainty band | optional、BudgetUsageProvider 実装後に活用先発生 |
| Token efficiency metric (`tokensPerSecond` / `cacheHitRatio` 等) | optional、a1-impl-2/3 着手後に比較軸として価値 |
| Citation-SourceCandidate 交差性 signal | optional、Anti-Hallucination Guard signal source、CEO 解釈境界 |
| WebSearch error per-code histogram | optional、PR #119 last error code 延長 |
| Cost Breakdown (per-component cost struct) | optional、explainability 強化、CEO 既却下 |
| Provider Capability Registry | 中長期足場、CEO 既却下 |
| Anti-Hallucination Guard (suspicious citation reject / filter) | optional、PR #115 sourceCandidates の応用、CEO 凍結中 |

### 4.2 並列作業 (Anthropic Primary とは独立)

| 項目 | 評価 |
|---|---|
| a1-impl-2 OpenAI scaffold | optional (Anthropic Primary 単独でも Production 採用可、PR #111 §6.1) |
| a1-impl-3 EXA scaffold | 同上 |

### 4.3 後送り phase

| 項目 | 状態 |
|---|---|
| **reflect mode (4 mode 目)** | Phase 3 後送り (Phase 2 では触らない、Phase 2 design v0.3 §0) |
| **個別チャネル (片側にだけ聞く本音引き出し路線)** | 「以降」側 (Phase 2 以降) |
| **Rendezvous への CoAlter 展開** | (Rendezvous は別 OS、CoAlter scope 外) |
| **新規ドメイン追加 (travel / activity)** | domain 軸は Phase B で別途進行する独立軸 |

---

## §5 凍結中項目 — 理由 + 凍結解除条件 + 解除後の実装順

### 5.1 凍結項目 一覧

| 凍結項目 | 凍結理由 (CEO 明示) | 凍結解除条件 | 解除後 sub-phase |
|---|---|---|---|
| 実 Anthropic API call | 本番接続 risk、Console enable 要 | Anthropic Console enable verify 完了 + CEO 承認 + key 配置 | Step D-3 a3 wiring + Step E |
| `ANTHROPIC_API_KEY` 参照 | secret 漏洩 risk | env 反映 playbook + CEO 承認 | a2 phase |
| `process.env` 参照 | 同上 | 同上 | a2 phase |
| Anthropic Console Web Search enable | 運用作業、admin 権限要 | CEO + Build で実施 | a3 着手前 |
| Supabase migration | DB schema 変更 risk | staging 先行 apply + schema review | a1-impl-1c |
| `BudgetUsageProvider` 実装 | Supabase 依存 | Supabase migration 完了後 | a1-impl-1c |
| env flag 追加 / `flags.ts` 修正 | runtime 切替 risk | a1-impl 完了後 | a2 phase |
| `movieOrchestrator` 修正 | 既存 4-layer pipeline への影響 | a1-impl + a2 完了後 | a3 phase |
| `ProviderSelector` 修正 | a3 wiring と並走 | a3 着手時 | a3 phase 内 |
| Production env 変更 | 本番反映 risk | rollback playbook + CEO 承認 | Step E-0 |
| Step E 開始 | 全前提完了後 | Step D-1 + D-2 + Step E-0 完了 | Step E |
| OpenAI scaffold (a1-impl-2) | npm dep 追加判断 | Business Terms verify + CEO judgment | a1-impl-2 (Anthropic Primary とは独立) |
| EXA scaffold (a1-impl-3) | ToS PDF verify 要 | ToS verify + Path A/B 判断 | a1-impl-3 |
| Anti-Hallucination Guard / suspicious citation reject / filter | CEO 凍結 (citation 信頼性は別 phase) | CEO 補足要 | (未定) |
| sourceCandidates UI 表示 | UI 設計未確定 | a4 citation UI design 確定後 | a4 |
| Phase 3B Layer 2-D (food path narration) | foodOrchestrator が narrationEnricher を呼ばない構造的制約 | CEO 判断 | 別 phase |
| **Step D-1 (Stage 2 Curate movie) 着手** | (handoff §3.2、未着手のまま) | CEO GO | mainstream §3.2 D-2-a〜d |
| **Step D-2 (Stage 3 Resolve movie) 着手** | (handoff §3.2、未着手のまま、provider foundation は別系列で進行) | CEO GO + provider 凍結事項解除順 | mainstream §3.3 D-3-a〜e + provider chain wiring |
| bug1 cleanup | 別 work track、本 audit 範囲外 | CEO 別 judgment | (別 work) |

### 5.2 凍結解除の典型 順序 (推奨実装順)

```
[現状: PR #119 merged、provider foundation (Anthropic 単体) 完了]
   ↓
[CEO 戦略判断 §A: provider foundation 経路で a3 wiring を進めるか、mainstream §3.2-3.3 の original D-2/D-3 plan を進めるか]
   ↓
   ├ Path α (provider foundation 経路): a1-impl-1c → a2 → a3 → a3 verify → Step E-0 → Step E
   └ Path β (mainstream original 経路): D-2 (Curate movie) → D-3 (Resolve movie) → Step E
   ↓
[Step D 全体完了]
   ↓
[食事ドメイン food 三段式 本体実装 (food-three-stage-design.md §6 差分)]
   ↓
[並列 (Anthropic Primary Production 採用後):]
   - a1-impl-2 OpenAI scaffold
   - a1-impl-3 EXA scaffold
   - a4 citation UI 実装 (Product Unit)
   - Phase 3B Layer 2-D food path narration (CEO 判断後)
   ↓
[CoAlter movie + food 全体完了 + Production observation]
   ↓
[Phase 3 reflect mode 開始判断]
```

→ **「provider foundation 完了 → 即 Production」ではない**。少なくとも 6-10 段階の sub-phase + CEO 凍結解除条件が必要。

---

## §6 CoAlter 全体 完了判定 (本 audit 結論)

### 6.1 領域別 完了状態

| 領域 | 状態 | 備考 |
|---|---|---|
| **CoAlter Layout 系統 (UI / Pattern / Presence)** | ✅ **完了** + Production deploy 済 | 2026-05-10 (PR #95) |
| **CoAlter Phase 2 3-mode body (decision / negotiate / clarify)** | ✅ **完了** + 凍結 | CEO 6.D 合格 2026-04-19 |
| **Step A 設計整理** | ✅ **完了** | 2026-04-24 |
| **Step B M0 Stage 1 Understand (共通基盤)** | ✅ **完了** | 14 file / 132 tests PASS |
| **Step C Bug-1 (emotion retrieval)** | ✅ **完了** | CEO Option α 採用 2026-05-11 |
| **Step D-3 Provider foundation (Anthropic 単体)** | ✅ **完了** (本 audit 範囲内、PR #110-#119) | 9 fields observability、Anthropic SDK 抽象化、mock-only |
| Phase B foodOrchestrator / foodCatalog / foodRanker / bookingResolver (Commit 1-4) | ✅ 完了 | (food 三段式枠で位置づけ直しは未) |
| **Step D-1 (Stage 2 Curate movie)** | ❌ **未着手** | handoff §3.2 |
| **Step D-2/D-3 (Stage 3 Resolve movie) 本体** | ⚠ **部分** (provider foundation のみ) | wiring / Resolve 本体 / R6 fallback / citation UI 未 |
| **Step E 観測 (B-6 shadow → live canary → 本番 flip)** | ❌ **未着手** | Step D 完了後 |
| **food 三段式 (Understand / Curate / Resolve) 本体** | ❌ **未着手** | (Phase B Commit 1-4 は実装済だが、三段式枠への位置づけ直しは未) |
| **reflect mode (4 mode 目)** | 後送り (Phase 3) | 設計確定済、実装未着手 |
| **Phase 3B Layer 2-D (food path narration)** | ⛔ 別 phase | CEO 判断保留中 |
| OpenAI / EXA scaffold (a1-impl-2/3) | ❌ optional + 凍結 | Anthropic Primary 単独で Production 可 |
| Citation URL UI (a4) | ❌ 凍結 | Product Unit 連携要 |

### 6.2 階層別 結論

| 階層 | 完了状態 |
|---|---|
| Provider foundation (PR #110-#119) | ✅ **完了** |
| **Movie runtime integration (a3 wiring)** | ❌ **未完了** |
| **CoAlter movie 完了** | ❌ **未完了** (Stage 2 Curate / Stage 3 Resolve 本体 + wiring + UI 残) |
| **CoAlter food 完了** | ❌ **未完了** (Phase B Commit 1-4 のみ、三段式本体未) |
| CoAlter normal mode 完了 (decision / negotiate / clarify) | ✅ **設計完了 + Phase 2 凍結** (実 movie/food 接続は別) |
| CoAlter reflect mode 完了 (4 mode 目) | ❌ **未着手** (Phase 3 後送り) |
| **CoAlter 全体 product-level 完了** | ❌ **未完了** |

### 6.3 結論 (再確認)

> **CoAlter は Layout 系統 / Phase 2 3-mode body / Step A・B・C / Step D-3 provider foundation のみ完了**。
>
> **Step D-1 (Stage 2 Curate movie) / Step D-2 残 (Stage 3 Resolve movie 本体 + wiring + UI) / Step E (観測) / food 三段式本体 / reflect mode は未完了**。
>
> **provider foundation 完了 ≠ CoAlter movie 完了 ≠ CoAlter 全体完了**。
>
> 別領域 (Stargazer 等) への pivot は **時期尚早**。

---

## §7 次にやるべき順番 (CoAlter 全体を完了に近づける観点)

### 7.1 CEO 確認不要で進めてよい候補 (autonomous docs-only execution)

| 項目 | scope |
|---|---|
| **本 audit doc** | `docs/coalter-original-plan-completion-audit.md` 1 file (本 PR、自律 commit/push/PR) |
| **CoAlter unblock checklist docs** | docs only、凍結解除条件 + CEO 判断要項一覧 |
| **CoAlter sequence proposal docs** | docs only、Path α / Path β 比較 |
| **Step D-1 (Stage 2 Curate movie) 着手前 design 再確認 docs** | docs only |
| **Step E-0 詳細 docs** (rollback playbook / Sentry / Discover query / no raw prompt policy) | docs only |
| **D-2-e3-b / c / d / e 詳細 audit docs** | docs only、本 audit で把握しきれていない sub-phase の inventory |
| **food 三段式 vs Phase B Commit 1-4 の差分 audit docs** | docs only |
| **Citation UI design draft docs (a4)** | docs only、Product Unit 連携前の draft、後で reviewer 修正前提 |

### 7.2 CEO 確認が必要な候補 (実装 / runtime / production)

| 項目 | CEO 判断 |
|---|---|
| 実 Anthropic API call / `ANTHROPIC_API_KEY` 参照 | env 配置 + Console enable 承認 |
| Anthropic Console Web Search enable (運用作業) | CEO + Build admin enable |
| Supabase migration `coalter_provider_cost_log` | staging 先行 apply 承認 |
| `BudgetUsageProvider` 実装 | a1-impl-1c 着手承認 |
| OpenAI npm dep 追加 + Business Terms verify | a1-impl-2 着手承認 |
| EXA ToS PDF verify + Path A/B 判断 | a1-impl-3 着手承認 |
| `flags.ts` / `movieOrchestrator` / `ProviderSelector` 修正 | a2 / a3 着手承認 |
| **Step D-1 (Stage 2 Curate movie) 着手** | CEO GO (未着手のため) |
| **Step D-2/D-3 mainstream 経路 vs provider foundation 経路の選択** | 戦略判断 |
| **food 三段式 本体実装** | CEO GO + 既存 foodOrchestrator との接続設計 |
| **Phase 3B Layer 2-D (food path narration)** | CEO 判断保留中 |
| Production env 変更 / Step E 開始 | 全前提完了 + CEO 承認 |
| merge | (本 PR を含む全 PR の最終 merge は CEO) |

### 7.3 CEO 戦略判断要項 (本 audit からの提示、優先順)

| # | 判断項目 | 影響 |
|---|---|---|
| 1 | **Step D-1 (Stage 2 Curate movie) 着手 vs Step D-2 残 (provider foundation 経路 a1-impl-1c → a2 → a3) のどちらを優先** | CoAlter movie 完了 path 選択 |
| 2 | mainstream §3.2-3.3 の original D-2/D-3 plan vs PR #109 provider foundation 経路 の整合性 (両者の relation 明確化) | 計画 整合性 |
| 3 | Anthropic Console Web Search enable + ANTHROPIC_API_KEY 配置タイミング | a3 wiring + Step E 着手前提 |
| 4 | Supabase migration `coalter_provider_cost_log` 適用タイミング | a1-impl-1c 着手前提 |
| 5 | OpenAI npm dep 追加判断 (Business Terms verify 完了) | a1-impl-2 着手判断 |
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

1. **本 audit doc を merge** (CoAlter 全体計画 vs 現状の差分を公式記録)
2. **CEO 判断要項 §7.3 から優先 1-3 項目選択**:
   - Path α 系 (provider foundation 経路): a1-impl-1c (BudgetUsageProvider) / a2 (env flag) / a3 (movieOrchestrator wiring)
   - Path β 系 (mainstream original 経路): Step D-1 (Stage 2 Curate movie) 着手
   - docs 系: §7.1 のいずれか (autonomous docs-only execution 可)
3. **Stargazer 等への pivot は CoAlter 全体完了まで保留** (本 audit 結論)

### 8.2 中期

- Path α / β いずれかで Step D 完了
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
- ❌ env flag 追加
- ❌ Production env 変更 / Step E 開始
- ❌ bug1 cleanup
- ❌ **Stargazer / Human OS 等 別領域 pivot** (本 audit 結論: CoAlter 全体未完了のため時期尚早)

---

## §10 verify 結果 (commit 前自己確認)

- ✅ docs-only (`docs/coalter-original-plan-completion-audit.md` 1 file 追加のみ)
- ✅ lib touch 0
- ✅ src touch 0
- ✅ tests touch 0
- ✅ package touch 0
- ✅ supabase/migrations touch 0
- ✅ Alter Morning 実 path touch 0 (本 file 内 言及は touch しないという meta 記述のみ)
- ✅ secrets 露出 0 (本 file 内 言及は token 名 reference のみ、actual value なし)
- ✅ 内容: 監査 / docs / plan に限定

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
