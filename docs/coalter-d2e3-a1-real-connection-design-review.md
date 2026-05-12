# CoAlter D-2-e3-a1 Real Provider Connection Design Review

**Status**: Draft (docs-only、実装着手なし)
**Branch**: `docs/coalter-d2e3-a1-real-connection-design-review`
**Base**: `main` (HEAD `f8690be3`、PR #110 merge 後)
**前提**: PR #102 (Step D scaffold) + PR #103/#104/#106/#107/#109/#110 (D-2-e3 設計 + pure foundation) merged 済
**本 doc PR の scope**: docs-only、**実装着手なし**。D-2-e3-a1 (real provider connection) の **実接続設計** を docs として凍結する。CEO 指定 12 項目を全 cover、sub-phase 分解 (a1 / a2 / a3 / a4) を含む。
**生成日**: 2026-05-12

---

## §0 目的 / scope / 前提

### 0.1 本 doc で確定するもの

- D-2-e3-a1 の **sub-phase 分解** (a1 / a2 / a3 / a4、各 PR scope)
- 3 provider SDK wrapper 設計 (Anthropic / OpenAI / EXA)
- env flag + provider enable 条件 (PR #109 §9 凍結値の confirm)
- movieOrchestrator wiring 設計 (PR #109 §8 凍結値の確認)
- F1 fallback (4-layer passthrough) 実装方針 (PR #109 §8.3 確定)
- citation URL UI 設計 spec (Product Unit 着手前の凍結)
- cost cap / timeout / retry / rate limit per provider
- rollback playbook (Step E-0 着手前の整備)
- Risk assessment (本 phase 着手前の見落とし防止)

### 0.2 本 doc で確定しないもの

- 実コード (interface 実装 / provider client / SDK wiring)
- 実 API 接続 (api.anthropic.com / api.openai.com / api.exa.ai への HTTP 呼び出し)
- Production env 変更
- Sentry alert / Discover query の set 操作
- 出典 URL UI 実装 (Product Unit との別 phase で設計実装)
- A/B 比較 framework 構築

### 0.3 重要発見 (本 doc 起草中に確認)

| 項目 | 状態 |
|---|---|
| `@anthropic-ai/sdk` package | **v0.91.1 既に installed** (Anthropic Primary 着手で SDK 摩擦最小) |
| `openai` package | 未 installed → OpenAI Secondary 着手時に npm dep 追加要 |
| `exa-js` or 公式 SDK | 未 installed (webConnector で fetch ベース利用の可能性、要確認) |

→ Anthropic Primary 着手 (a1-1) は **最も摩擦低い**、OpenAI / EXA は SDK 追加判断 (CEO + Build) 必要。

### 0.4 設計原則 (PR #109 凍結値の継承)

- **provider-agnostic architecture** 維持 (PR #110 で `MovieRetrievalProvider` interface 凍結済)
- **Anthropic-first runtime preference** (default `COALTER_THREE_STAGE_PROVIDER_CHAIN=anthropic`)
- **OpenAI Secondary candidate** (default disabled)
- **EXA Tertiary disabled stub** (default disabled、ToS PDF verify 待ち)
- **F1 fallback = existing 4-layer result passthrough** (Production 第一候補、PR #109 §8.2 確定)
- **F2 (placeholder) は dev/test or emergency 最終手段** (Production 通常 fallback ではない)
- **UX 劣化禁止**: `COALTER_THREE_STAGE=true` 時に既存 4-layer より degraded しない (PR #109 §8.1)

---

## §1 全体図

### 1.1 sub-phase 分解 (CEO 12 項目を 4 group に整理、4 PR で実装)

```
[D-2-e3-a0 (PR #110 merged): pure foundation]
   ↓
[D-2-e3-a1 design (本 PR): 実接続全体設計 + sub-phase 分解]
   ↓
[D-2-e3-a1-impl: 3 provider SDK wrapper 実装]
   - Anthropic SDK wrapper (Primary、最優先)
   - OpenAI SDK wrapper (Secondary、enable 条件未充足 → disabled stub)
   - EXA SDK wrapper (Tertiary、enable 条件未充足 → disabled stub)
   - BudgetUsageProvider 実装 (Supabase or KV)
   ↓
[D-2-e3-a2: env flag 追加 + provider enable 条件設定]
   - COALTER_THREE_STAGE_PROVIDER_CHAIN / OPENAI_ENABLED / EXA_ENABLED
   - lib/coalter/flags.ts 拡張
   ↓
[D-2-e3-a3: movieOrchestrator wiring + 4-layer passthrough fallback]
   - movieOrchestrator extract (runFourLayerPipelineInternal)
   - adapter wiring (provider chain + F1 fallback)
   - 既存 4-layer output 互換性 test
   ↓
[D-2-e3-a4: citation URL UI 実装]
   - Product Unit と協議、別 phase で UI 実装
   - canonical schema 経由で provider 切替えに依存しない UI
   ↓
[D-2-e3-b / c / d / e: 残 sub-phase]
   ↓
[Step E-0 (Production reflection 前準備)]
   ↓
[Step E (Production observation 開始)]
```

### 1.2 各 sub-phase の sub-PR 分解 (推奨、CEO 判断 P0)

```
D-2-e3-a1-impl は更に 3 sub-PR に分解可:
   - a1-1: Anthropic SDK wrapper 実装 (Primary 単独着手、最摩擦最小)
   - a1-2: OpenAI SDK wrapper 実装 (npm dep "openai" 追加要、verify 完了後)
   - a1-3: EXA SDK wrapper 実装 (npm dep 追加要、ToS PDF verify 完了後)
```

これにより、各 provider の verify 完了タイミングに合わせて順次 enable 可能。
Primary 単独 (a1-1) でも本番採用可 (Secondary / Tertiary は disabled stub で動く)。

### 1.3 凍結線 (PR #109 §1.5 / §1.5.1 継承)

| File | 規律 |
|---|---|
| `lib/coalter/webConnector.ts` / `movieCatalog.ts` / `movieRanker.ts` | touch なし |
| `lib/coalter/narrationBuilder.ts` / `narrationEnricher.ts` | touch なし |
| `lib/coalter/foodOrchestrator.ts` / `coalterDispatch.ts` / `triggerDetection.ts` | touch なし |
| `lib/coalter/emotion/` / `understanding/` / `presence/` | touch なし |
| Alter Morning 系 file | touch なし (grep 0 必須) |
| `lib/coalter/movieOrchestrator.ts` | **D-2-e3-a3 のみ** additive refactor 許可 (logic touch なし、関数 extract + export 追加) |
| `lib/coalter/engine.ts` | D-2-e3-d のみ touch (D-2-e3-a1〜a4 は touch なし) |
| `lib/coalter/flags.ts` | **D-2-e3-a2 のみ** additive 拡張許可 (provider enable flag 追加) |

---

## §2 Group 1: Provider SDK Wrapper 設計

### 2.1 Anthropic SDK Wrapper

#### 2.1.1 import + 実装方針

```typescript
// lib/coalter/movie/providers/anthropicProvider.ts (新規、D-2-e3-a1-impl)

import Anthropic from "@anthropic-ai/sdk";  // ✅ 既存 v0.91.1
import type {
  MovieRetrievalProvider,
  ProviderRetrievalInput,
  ProviderRetrievalResult,
} from "./types";
import { safeProviderCall } from "./safeProviderCall";
import { normalizeAnthropicCitations } from "./citationNormalizer";

export class AnthropicMovieRetrievalProvider implements MovieRetrievalProvider {
  readonly id = "anthropic" as const;
  constructor(
    private readonly client: Anthropic,
    private readonly enabledFlag: boolean,  // env から caller が決定して inject
  ) {}
  get enabled(): boolean { return this.enabledFlag; }

  async retrieve(input: ProviderRetrievalInput): Promise<ProviderRetrievalResult> {
    return safeProviderCall(
      () => this.callClaudeWithWebSearch(input),
      {
        timeoutMs: 10_000,
        maxRetries: 1,  // 5xx 用、429 は別 path
        retryBackoffMs: 1_000,
        budgetCheckUsd: 500,
      },
    );
  }

  private async callClaudeWithWebSearch(input: ProviderRetrievalInput) {
    // Claude API + web search tool (web_search_20260209 or web_search_20250305)
    // PR #109 §3.10 で確定: max_uses で per-request 上限制御
    // allowed_domains で映画情報 site のみ許可 (citation 信頼度 UP)
    // ...
  }
}
```

#### 2.1.2 web search tool 設定 (PR #109 §3 確定値)

- tool name: `web_search_20260209` (dynamic filtering 対応) または `web_search_20250305` (basic)
- model: Claude Opus 4.7 / Opus 4.6 / Sonnet 4.6
- `max_uses`: 5 (per-request、cost 抑制)
- `allowed_domains`: 映画情報 site allowlist (eiga.com / yahoo / 公式 site 等、Step E-0 で list 確定)
- `user_location`: 入力 area から推定 (例: 渋谷 → Japan / Tokyo)

#### 2.1.3 Console enable 必須

- Anthropic Organization admin が Claude Console (/settings/privacy) で web search を enable
- Production deploy 前に CEO + Build で **必須 verify** (PR #107 §3.1 (b))

#### 2.1.4 cost monitoring

- web search: $10 / 1,000 searches (Anthropic 公開 rate)
- token: standard input/output rate (search results は input token)
- 月次 cost cap: $500 (PR #109 §6.1)、80% で CEO 通知、95% で auto OFF

### 2.2 OpenAI SDK Wrapper (Secondary、default disabled)

#### 2.2.1 import + 実装方針

```typescript
// lib/coalter/movie/providers/openaiProvider.ts (新規、D-2-e3-a1-impl の sub-PR a1-2)

import OpenAI from "openai";  // ❌ 未 installed、新規 npm dep 追加要
import type { MovieRetrievalProvider, ... } from "./types";
import { normalizeOpenAICitations } from "./citationNormalizer";

export class OpenAIMovieRetrievalProvider implements MovieRetrievalProvider {
  readonly id = "openai" as const;
  // ...
}
```

#### 2.2.2 web search API (developers.openai.com で verify 済、PR #107 §3.2)

- Responses API or Chat Completions API + tools
- response 内 `annotations[url_citation]` で citation 取得
- inline citation **clearly visible + clickable 必須** (法務要件、Production deploy 前必須)
- cost: $10 / 1000 calls (reasoning models)、$25 / 1000 calls (non-reasoning preview)

#### 2.2.3 npm dep 追加判断 (CEO 判断 P0)

- `openai` パッケージを package.json に追加
- version pinning (^4.x or 同等)
- security audit (npm audit)
- bundle size (Server-only、Vercel build 影響 限定的)

→ **CEO + Build 判断**: OpenAI 採用が確定するまで a1-2 着手しない、a1-1 (Anthropic 単独 Primary) で動くため必須でない

### 2.3 EXA SDK Wrapper / Client (Tertiary、default disabled)

#### 2.3.1 implementation choice

EXA は 2 path possible:

| Path | 内容 | trade-off |
|---|---|---|
| Path A | `exa-js` (公式 SDK) 利用 | npm dep 追加、SDK update 追従コスト |
| Path B | 直接 fetch ベース (既存 webConnector pattern) | dep 追加なし、self-maintain |

PR #109 §1.2 EXA 既存契約推定 + webConnector 経由利用の可能性 → **Path B (fetch ベース)** が摩擦最小。
ただし SDK 利用は contract 変動追従が容易 → **Path A** 推奨も妥当。

→ **CEO 判断 P0**: Path A vs B

#### 2.3.2 EXA 利用範囲 (PR #107 §3.3 verify 済)

- search API: $7 / 1,000 requests
- contents API: $1 / 1,000 pages
- monitors API: $15 / 1,000 requests (Step E-0 で考慮)

#### 2.3.3 enable 条件 (PR #107 §3.3 / PR #109 §9.3.3)

EXA Tertiary は以下 4 条件全充足後にのみ enable:
- ToS PDF (`/assets/Exa_Labs_Terms_of_Service.pdf`) manual verify 完了
- cache 戦略確認
- data retention / training 利用範囲確認 (query data + 取得 content が EXA training に使われる、personal info 除外要)
- attribution 表示要件確認

### 2.4 SDK import 範囲 (sub-phase 別)

| Sub-phase | 追加 SDK / dep | package.json 変更 |
|---|---|---|
| **a1-1** (Anthropic) | `@anthropic-ai/sdk` (既存 v0.91.1 利用) | 変更なし |
| **a1-2** (OpenAI) | `openai` (新規追加、^4.x 想定) | additive change |
| **a1-3** (EXA) | Path A: `exa-js` (新規追加) / Path B: なし (fetch ベース) | Path A: additive、Path B: 変更なし |
| BudgetUsageProvider | `@supabase/supabase-js` (既存) or 既存 KV / fetch | 変更なし (既存 dep 流用) |

---

## §3 Group 2: env Flag + Provider Enable 条件

### 3.1 env Flag 設計 (PR #109 §9.2 凍結値)

#### 3.1.1 既存 (PR #102 / #106 維持)

| Flag | default | 動作 |
|---|---|---|
| `COALTER_THREE_STAGE` | false | master kill switch、三段式起動 (D-2-e2 既存) |

#### 3.1.2 新規 (D-2-e3-a2 で `lib/coalter/flags.ts` に additive 追加)

| Flag | default | 動作 |
|---|---|---|
| `COALTER_THREE_STAGE_PROVIDER_CHAIN` | `"anthropic"` | provider preference 順 (comma-separated)、例: `"anthropic"`, `"anthropic,openai"`, `"anthropic,openai,exa"` |
| `COALTER_THREE_STAGE_OPENAI_ENABLED` | **false** | OpenAI Secondary を enable (verify + 契約確認後) |
| `COALTER_THREE_STAGE_EXA_ENABLED` | **false** | EXA Tertiary を enable (verify + ToS PDF 確認後) |

#### 3.1.3 flags.ts additive 拡張案

```typescript
// lib/coalter/flags.ts (D-2-e3-a2 で additive 追加)

// ... 既存 getter ...

get threeStageProviderChain(): string[] {
  const raw = process.env.COALTER_THREE_STAGE_PROVIDER_CHAIN ?? "anthropic";
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
},

get threeStageOpenAIEnabled(): boolean {
  return normalizeBool(process.env.COALTER_THREE_STAGE_OPENAI_ENABLED, false);
},

get threeStageEXAEnabled(): boolean {
  return normalizeBool(process.env.COALTER_THREE_STAGE_EXA_ENABLED, false);
},
```

### 3.2 Provider Enable 条件 (PR #109 §9.3 + verify 完了確認)

#### 3.2.1 Anthropic Primary candidate

- `COALTER_THREE_STAGE=true` (master flag)
- Anthropic Console (/settings/privacy) で **web search admin enable**
- PR #107 §3.1 PASS conditional 5 条件全充足:
  - (a) commercial 契約 ✅ (verified)
  - (b) Console enable 可能 → 内部 audit 必要
  - (c) citation URL を CoAlter UI に表示 → Product Unit 着手後
  - (d) cost cap + rate limit 対策 → 本 docs §3.3 / §3.4 で凍結
  - (e) cache 戦略 CEO + 法務 判断 → 未確定

#### 3.2.2 OpenAI Secondary candidate (default disabled)

- `COALTER_THREE_STAGE_OPENAI_ENABLED=true`
- 以下全条件充足後に enable:
  - **OpenAI Business Terms / Services Agreement / Usage Policies の manual verify 完了** (CEO + 法務、openai.com policy pages の WebFetch 不可のため)
  - 既存 OpenAI 契約 / API key 運用確認 (CEO + Build 内部 audit)
  - cache 可否確認 (Business Terms 内)
  - inline citation UI 実装合意 (Product Unit、clearly visible + clickable)

#### 3.2.3 EXA Tertiary candidate (default disabled stub)

- `COALTER_THREE_STAGE_EXA_ENABLED=true`
- 以下全条件充足後に enable:
  - EXA **ToS PDF** (`/assets/Exa_Labs_Terms_of_Service.pdf`) の manual verify 完了 (CEO + 法務)
  - cache 戦略確認
  - data retention / training 利用範囲確認
  - attribution 表示要件確認

### 3.3 Cost Cap (BudgetUsageProvider 実装、PR #109 §6.1 凍結値)

#### 3.3.1 BudgetUsageProvider 実装方針

```typescript
// lib/coalter/movie/providers/budgetUsageImpl.ts (新規、D-2-e3-a1-impl)

import type { BudgetUsageProvider } from "./safeProviderCall";
import { createClient } from "@/lib/supabase/server";  // 既存 helper

export class SupabaseBudgetUsageProvider implements BudgetUsageProvider {
  async getCurrentUsageUsd(): Promise<number> {
    const supabase = await createClient();
    // 当月 1 日以降の coalter_provider_cost_log から sum
    const { data, error } = await supabase
      .from("coalter_provider_cost_log")
      .select("cost_cents")
      .gte("created_at", startOfMonth());
    if (error || !data) return 0;
    return data.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0) / 100;
  }
}
```

#### 3.3.2 Supabase migration (新規 table)

```sql
-- coalter_provider_cost_log (D-2-e3-a1-impl で migration 追加)
CREATE TABLE coalter_provider_cost_log (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,  -- "anthropic" | "openai" | "exa"
  event_id text,              -- coalter session / invocation id (optional)
  cost_cents integer not null,
  token_input integer,
  token_output integer,
  search_call_count integer,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_coalter_provider_cost_log_created_at ON coalter_provider_cost_log (created_at);
CREATE INDEX idx_coalter_provider_cost_log_provider ON coalter_provider_cost_log (provider_id, created_at);
```

#### 3.3.3 cost log 書き込み

各 provider 実装が `retrieve()` 完了後に Supabase insert:
- `provider_id` / `cost_cents` (推定) / token / search_count
- fail-open: insert 失敗時は throw せず log のみ (cost monitoring の信頼性は best-effort)

### 3.4 Timeout / Retry / Rate Limit per Provider (PR #109 §4.3 / §4.4 凍結値)

| Provider | timeout | retry (5xx) | 429 backoff | budget pre-check |
|---|---|---|---|---|
| Anthropic | 10s | max 1 回 | exponential (1s→2s→4s)、max 3 回 | $500 monthly cap |
| OpenAI | 10s | max 1 回 | 同上 | 同上 |
| EXA | 5s | max 1 回 | 同上 | 同上 |

実装:
- `safeProviderCall` (PR #110 で実装済) の `options` で各 provider 個別 set
- timeout / budget は `safeProviderCall` で自動制御 (PR #110 verified)
- 429 backoff は各 provider 実装内で adapter 化 (provider 別 detection)

---

## §4 Group 3: MovieOrchestrator Wiring (PR #109 §8 凍結値)

### 4.1 movieOrchestrator extract (`runFourLayerPipelineInternal`)

#### 4.1.1 設計 (PR #109 §8.3.1 確定)

```typescript
// lib/coalter/movieOrchestrator.ts (D-2-e3-a3 で additive refactor)

export async function runFourLayerPipelineInternal(
  input: MovieOrchestratorInput,
  startedTotal: number,
): Promise<MovieOrchestratorOutput> {
  // 既存 4-layer pipeline body を完全に維持して関数化
  // logic は 1 文字も touch しない
  // ...
}

export async function generateMovieProposalV2(
  input: MovieOrchestratorInput,
): Promise<MovieOrchestratorOutput> {
  const startedTotal = Date.now();

  if (COALTER_FLAGS.threeStageEnabled) {
    return runThreeStageScaffoldPath(input, startedTotal);
  }

  // flag OFF: 既存挙動 = 4-layer pipeline
  return runFourLayerPipelineInternal(input, startedTotal);
}
```

#### 4.1.2 既存 4-layer output 互換性 test (PR #109 §8.6 必須)

- **8.6.1** 4-layer 既存 output 不変性テスト: refactor 前後で同一 output
- **8.6.2** adapter via 4-layer fallback の shape compatibility test
- **8.6.3** 互換性違反検出 test
- **8.6.4** 5 gate 強化 (movieOrchestrator.ts touch 時)

### 4.2 adapter wiring (provider chain 注入)

#### 4.2.1 設計

```typescript
// lib/coalter/movie/threeStageOrchestratorAdapter.ts (D-2-e3-a3 で実装更新)

async function runThreeStageScaffoldPath(
  input: MovieOrchestratorInput,
  startedTotal: number,
): Promise<MovieOrchestratorOutput> {
  // 1. provider chain config 構築 (env + DI)
  const chainConfig = buildProviderChainConfig();

  // 2. retrieval input 構築 (D-2-e1 互換)
  const retrievalInput = buildRetrievalInput(input);

  // 3. provider chain で retrieve
  const result = await selectAndRetrieve(retrievalInput, chainConfig);

  // 4. quaternary → F1: 4-layer passthrough
  if (result.kind === "quaternary") {
    emitProviderAllFailedAlert(result.reason);
    return runFourLayerPipelineInternal(input, startedTotal);
  }

  // 5. provider success → adapt
  return adaptToMovieOrchestratorOutput(result.result, input, startedTotal);
}
```

#### 4.2.2 buildProviderChainConfig (env-driven)

```typescript
function buildProviderChainConfig(): ProviderChainConfig {
  const chain = COALTER_FLAGS.threeStageProviderChain;  // env: ["anthropic", "openai", "exa"]
  const providers = chain.map(id => instantiateProvider(id));
  return {
    primary: providers[0],
    secondary: providers[1] ?? null,
    tertiary: providers[2] ?? null,
  };
}
```

### 4.3 F1 Passthrough Fallback (PR #109 §8.2 / §8.3 確定)

#### 4.3.1 trigger

- provider chain 全 fail (`all_providers_failed`)
- provider 全 disabled (`all_providers_disabled`、config 異常)

#### 4.3.2 動作

- `runFourLayerPipelineInternal(input, startedTotal)` を呼ぶ
- output は flag OFF 経路と完全互換
- Sentry critical alert (CEO 通知)
- user 体験 degraded **しない**

#### 4.3.3 F2 emergency (極稀)

- F1 自体も throw (4-layer pipeline 自体も break)
- placeholder `MovieOrchestratorOutput` 返却
- Sentry critical + CEO + Build 緊急通知

---

## §5 Group 4: Citation URL UI + Rollback

### 5.1 Citation URL UI 設計 spec (Product Unit と協議)

#### 5.1.1 必須要件 (法務、PR #107 / #109 §3.6)

- 全 retrieval 結果に source URL を表示
- 「公式 site で確認」link クリック可
- LLM hallucination 対策: user が公式 site で再確認可能な状態
- Anthropic + OpenAI 両 provider で attribution **必須** (ToS 明示)

#### 5.1.2 UI 設計案 (Product Unit と別 phase で実装)

| 要素 | 表示位置 | 内容 |
|---|---|---|
| theater listing item | per-theater 行内 | `[公式情報を確認 →]({url})` link |
| provider brand | card footer or tooltip | "Powered by Anthropic" (任意、ToS に応じる) |
| LLM 出力明示 | card header | "AI が web 検索した結果" 等 (誤解防止) |
| 情報鮮度注記 | card footer | "情報が古い可能性" (cache 採用時) |

#### 5.1.3 Product Unit assign タイミング

- D-2-e3-a1 着手前必須 (PR #109 §11 条件 4 / §11.4)
- UI design + 実装で 2-3 週間想定
- a3 (movieOrchestrator wiring) と並列実行可

### 5.2 Rollback Playbook (PR #109 §12 凍結値、Step E-0 で別 doc 詳細化)

#### 5.2.1 4 段階 rollback (PR #109 §12.1〜12.3 確定)

| Step | trigger | 動作 | 復帰時間 |
|---|---|---|---|
| 1. provider 単独障害 | 連続失敗 5 回 (rate-limit state) | 該当 provider を 24h cool-down、他 provider 稼働継続 | 自動、即時 |
| 2. provider 個別 disable (緊急) | CEO 判断 | env `COALTER_THREE_STAGE_*_ENABLED=false` + redeploy | 10-15 分 |
| 3. 三段式全停止 (master) | CEO 判断 | env `COALTER_THREE_STAGE=false` + redeploy → 4-layer pipeline へ | 10-15 分 |
| 4. F1 自体も break | 極稀、自動検出 | F2 placeholder + 緊急通知 | 即時 + CEO 手動対応 |

#### 5.2.2 staging で rollback drill 必須

- Step E-0 で drill 実行 (各 step 試行)
- drill log を `docs/coalter-stepE-rollback-drill-log.md` (別 PR) で永続化

---

## §6 Sub-phase 分解案 (推奨実装順、CEO 判断 P0)

### 6.1 推奨順序 (リスク低 → 高、依存最小化)

```
D-2-e3-a1-impl-1: Anthropic SDK wrapper (1-2 weeks)
  - 既存 @anthropic-ai/sdk 利用、npm dep 変更なし
  - default disabled stub で実装 → env で enable 切替え
  - 5 gate 全 PASS 必須
   ↓
D-2-e3-a2: env flag 拡張 (1 day)
  - lib/coalter/flags.ts に 3 getter additive 追加
  - 5 gate 必須
   ↓
D-2-e3-a3: movieOrchestrator wiring + 4-layer passthrough (1 week)
  - movieOrchestrator.ts に runFourLayerPipelineInternal extract
  - adapter wiring (provider chain + F1)
  - 既存 4-layer output 互換性 test (PR #109 §8.6)
   ↓ (Anthropic Primary 単独でも Production 稼働可、ここで partial GO 判断)
   ↓
[parallel possible]
   - D-2-e3-a1-impl-2: OpenAI SDK wrapper (npm dep "openai" 追加、Business Terms verify 完了後)
   - D-2-e3-a1-impl-3: EXA SDK wrapper (ToS PDF verify 完了後)
   - D-2-e3-a4: citation UI 実装 (Product Unit、a3 と並列)
   - D-2-e3-d: M0 lens 実接続 (engine.ts touch)
   - D-2-e3-e: prefetch + diagnostics 仕上げ
   ↓
Step E-0 (Production reflection 前準備)
   ↓
Step E (Production observation 開始)
```

### 6.2 並列実行可能性

| 並列可 | 並列不可 |
|---|---|
| a1-impl-1 (Anthropic) と a4 (UI 設計) | a3 (movieOrchestrator) は a1-impl-1 + a2 完了後 |
| a1-impl-2 (OpenAI) と a1-impl-3 (EXA) | a1-impl-1 (Anthropic) は最初に着手 (Primary 確定のため) |
| a4 (UI) と a3 (wiring) | a2 (env) は a1-impl-1 完了後 |

### 6.3 各 sub-PR の scope と着手 GO

| sub-PR | scope | 着手 GO 条件 |
|---|---|---|
| a1-impl-1 | Anthropic SDK wrapper + BudgetUsageProvider 実装 + migration | PR #107 §3.1 PASS conditional 5 条件中 (a)(b)(d) 充足、(c)(e) は a3 / a4 で並列 |
| a2 | flags.ts 拡張 | a1-impl-1 完了 |
| a3 | movieOrchestrator wiring + F1 | a1-impl-1 + a2 完了 + §8.6 test 方針合意 |
| a4 | citation UI 実装 | Product Unit assign 完了 (a3 と並列可) |
| a1-impl-2 | OpenAI SDK wrapper | PR #107 §3.2 manual verify 完了 + npm dep 追加 CEO GO |
| a1-impl-3 | EXA SDK wrapper | PR #107 §3.3 ToS PDF verify 完了 |

---

## §7 着手 GO 条件 (PR #109 §11 13 条件 + 本 doc 追加)

PR #109 §11 で 13 条件確定済。本 doc で更に追加:

| # | 条件 | 状態 (現時点) |
|---|---|---|
| 1-13 | PR #109 §11 既存 13 条件 | 設計系 8 件は PR #109/#110 merge で合意済、外部 audit 系 5 件 PENDING |
| 14 | sub-phase 分解 (a1-impl-1/a2/a3 等) 採用 review + 合意 | 本 doc PR で CEO 判断 |
| 15 | Anthropic SDK wrapper 設計 (§2.1) review + 合意 | 本 doc PR review |
| 16 | OpenAI / EXA SDK 追加判断 (§2.2 / §2.3) | CEO + Build 判断 |
| 17 | BudgetUsageProvider 実装方針 (§3.3) review + 合意 | 本 doc PR review |
| 18 | Supabase migration (`coalter_provider_cost_log`) 承認 | CEO 判断 |
| 19 | rollback drill 計画 (Step E-0) 合意 | Step E-0 phase で別途 |

→ 計 **19 条件全充足 + CEO 着手 GO 明示判断** で D-2-e3-a1-impl 着手 GO。

---

## §8 Risk Assessment (D-2-e3-a1 phase 着手前の見落とし防止)

### R1: Anthropic Console admin enable の依存

- Console での web search enable は Anthropic Organization admin 権限必要
- Aneurasync 内で admin 権限を持つ人が CEO 単独か、Build メンバーにも分散しているか確認
- enable 後の verify (実 API call で web search 結果取得) は staging で必須
- **影響度**: 中 (admin enable 失敗で Anthropic Primary 不可用 → SPOF risk 顕在化)
- **対応**: a1-impl-1 着手前に CEO + Build で admin enable verify 完了

### R2: Supabase migration 適用タイミング

- `coalter_provider_cost_log` 新規 table → migration 必須
- Production migration は CEO 明示 GO 必須 (CLAUDE.md「本番反映・課金変更・法務変更は必ず CEO 承認」)
- migration 前に Supabase schema review (RLS policy / index / column type)
- **影響度**: 中 (migration 失敗で BudgetUsageProvider 動作不可、cost cap が effective でなくなる)
- **対応**: a1-impl-1 着手前に migration review、staging で先行 apply

### R3: F1 fallback 時の latency 増

- provider 全失敗 → F1 (`runFourLayerPipelineInternal`) 呼び出し
- provider 試行 (10s × 3 = 30s) + 4-layer pipeline (5-15s) = 計 35-45s latency
- Vercel function timeout (60s default) を超える可能性
- **影響度**: 高 (timeout で user に 5xx error)
- **対応**:
  - provider 連続失敗時の早期 fallback (例: Primary 失敗後 5s 以内に Secondary skip して F1 直行)
  - Vercel function timeout を 90s に拡張 (Pro plan 必要)
  - provider timeout を 5-7s に短縮 (latency budget 確保)
  - → a3 wiring 設計時に詳細決定

### R4: provider response schema が想定と異なる

- D-2-e3-a0 (PR #110) の tests は全 mock、実 SDK response との contract verify 未着手
- 実 Anthropic web search response の `citations[]` 構造、`encrypted_content` 等の field
- 実 OpenAI Responses API の `annotations` 構造
- 実 EXA response の `highlights[]` / `text` field
- **影響度**: 中 (response parser 失敗で provider fallback、UX 影響は F1 で吸収)
- **対応**: a1-impl-1 で sample response fixture 取得 + parser test 追加 + staging で実 call verify

### R5: cost 暴走 (推定値と実際の divergence)

- 月次 cap $500 想定だが、実 token 使用量は web search の results 量で大きく変動
- 1 search で大量の page content が input token として加算 (Anthropic docs: search results は input token)
- 想定 50 events/月 × $0.025/event = $1.25/月 想定だが、実際は大幅超過の可能性
- **影響度**: 高 (CEO 想定外の cost 発生)
- **対応**:
  - staging で sample 100 events 実行、token 使用量実測
  - 実測値 > 想定の 2 倍なら cap 調整 or sub-phase 着手見直し

### R6: citation URL allowlist の運用

- Anthropic web search の `allowed_domains` 指定推奨
- 信頼できる映画情報 site のみ allowlist 入り
- ただし、初期 list が狭すぎると search 結果 0 件、広すぎると hallucination URL 表示 risk
- **影響度**: 中
- **対応**: PR #107 source compliance verify 結果から allowlist 初期 list 確定、Step E-0 で運用拡張

### R7: F1 fallback で 4-layer pipeline 結果が空の場合

- 4-layer pipeline は webConnector の searchAndFilter 経由、これも fail する可能性
- provider 全失敗 + 4-layer pipeline も 0 件 → ranked: [] の output
- **影響度**: 低 (既存 4-layer pipeline で同様、refactor で degradation しない)
- **対応**: §8.6.2 shape compatibility test で verify

### R8: Production env 反映の運用

- env 変更 → Vercel console で set → redeploy
- env 変更履歴は audit 必要 (CEO + Build で記録)
- 誤って `COALTER_THREE_STAGE_OPENAI_ENABLED=true` 等を verify 完了前に set してしまう risk
- **影響度**: 中 (法務 risk - 未 verify provider 起動)
- **対応**: env 変更 checklist + CEO 承認 process (`docs/coalter-env-change-playbook.md` 別 PR)

---

## §9 まだやらない (本 doc PR scope 外、明示)

### 9.1 本 doc PR で着手しないもの

- D-2-e3-a1-impl 各 sub-PR 実装 (Anthropic / OpenAI / EXA SDK wrapper)
- BudgetUsageProvider 実装コード
- Supabase migration (`coalter_provider_cost_log`)
- D-2-e3-a2 flags.ts 拡張
- D-2-e3-a3 movieOrchestrator extract + adapter wiring
- D-2-e3-a4 citation UI 実装
- 実 API 接続 (Anthropic / OpenAI / EXA endpoint)
- API key 参照 / 取得
- Production env 変更
- Sentry alert / Discover query の set 操作
- direct scraping 実装 (PR #106 Annex A 維持)
- bug1 worktree cleanup
- Step E 開始

### 9.2 本 doc PR で書き留めるが別 PR で詳細化するもの

- env 変更 playbook (`docs/coalter-env-change-playbook.md`)
- rollback drill log (`docs/coalter-stepE-rollback-drill-log.md`)
- A/B 比較 framework 構築 PR (Step E-0-3)
- D-2-e3-b / c / d / e 各 sub-phase 設計

---

## 付録 A: 接続図 (PR #102 〜 本 PR の流れ + 今後)

```
[PR #102: Step D scaffold complete (merged)]
   ↓
[PR #103/#104: D-2-e3 設計 旧 (direct fetch 前提、merged)]
   ↓
[PR #106: provider-based revision (merged)]
   ↓
[PR #107: provider verify update (Anthropic PASS conditional / OpenAI PARTIAL / EXA AMBIG、merged)]
   ↓
[PR #109: D-2-e3-a impl design review (CEO 補正反映後 merged)]
   ↓
[PR #110: D-2-e3-a0 pure foundation (merged)]
   ↓
[本 PR: D-2-e3-a1 real connection design review (docs-only)]
   ↓ design 凍結 + 着手 GO 19 条件
   ↓
[D-2-e3-a1-impl-1: Anthropic SDK wrapper (new PR)]
[D-2-e3-a2: env flag 拡張 (new PR)]
[D-2-e3-a3: movieOrchestrator wiring + F1 (new PR)]
[D-2-e3-a4: citation UI (Product Unit、new PR)]
   ↓ (Anthropic Primary 単独でも Production 採用可能、CEO partial GO 判断)
   ↓
[並列: a1-impl-2 (OpenAI) / a1-impl-3 (EXA) / D-2-e3-d (M0 lens) / D-2-e3-e (prefetch)]
   ↓
[Step E-0 (Production reflection 前準備)]
   ↓
[Step E (Production observation 開始)]
```

## 付録 B: 凍結線 (handover §4.2 / PR #109 §1.5 / 本 doc §1.3 継承)

(再記、各 sub-PR で gate verify 必須)

- `lib/coalter/webConnector.ts` / `movieCatalog.ts` / `movieRanker.ts` (常時 touch なし)
- `lib/coalter/narrationBuilder.ts` / `narrationEnricher.ts` (常時 touch なし)
- `lib/coalter/foodOrchestrator.ts` / `coalterDispatch.ts` / `triggerDetection.ts` (常時 touch なし)
- `lib/coalter/emotion/` / `understanding/` / `presence/` (常時 touch なし)
- Alter Morning 系 file (常時 grep 0 必須)
- `lib/coalter/movieOrchestrator.ts` (**D-2-e3-a3 のみ** additive refactor 許可)
- `lib/coalter/flags.ts` (**D-2-e3-a2 のみ** additive 拡張許可)
- `lib/coalter/engine.ts` (D-2-e3-d のみ touch、a1〜a4 は touch なし)

## 付録 C: 5 gate verify (各 sub-PR で必須、本 doc PR では docs-only)

1. **typecheck**: baseline 維持
2. **vitest**: tests/unit/coalter 全 PASS
3. **build**: `npm run build` BUILD_EXIT=0
4. **凍結線 grep**: 付録 B file 全 0 touched (該当 phase 例外を除く)
5. **Alter Morning grep**: 0 hits

本 doc PR は docs-only のため、gate verify は (4) (5) のみ実施 + 報告。
