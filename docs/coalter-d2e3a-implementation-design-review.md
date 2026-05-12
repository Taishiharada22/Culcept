# CoAlter D-2-e3-a Provider-Agnostic Implementation Design Review

**Status**: Draft (docs-only、実装着手なし)
**Branch**: `docs/coalter-d2e3a-implementation-design-review`
**Base**: `main` (HEAD `f80b2fe6`、PR #107 merge 後)
**前提**: PR #102 (Step D structural scaffold complete) + PR #103/#104/#106/#107 (provider 設計 + verify) merged 済
**本 doc PR の scope**: docs-only、**実装着手なし**。D-2-e3-a (provider-based retrieval 実接続) の **実装設計** を docs として凍結する。interface / type / fallback chain / cost guard / citation normalizer / env flag の design 仕様を確定し、実装着手 PR の base にする。
**生成日**: 2026-05-12

---

## §0 本 doc の honest limitation

### 0.1 本 doc で確定するもの

- Provider Interface (`MovieRetrievalProvider` 等) の型 / 契約
- ProviderSelector の chain 構造 + 切替え logic
- safeProviderCall の timeout / retry / SSRF / budget guard
- citation normalizer の canonical schema + provider 別 mapping
- provider response schema の取り扱い
- 4-layer pipeline fallback 経路 (design 上の options)
- env flag / enable 条件 (実装は本 phase 対象外)
- D-2-e3-a 着手条件 + rollback path + Step E 開始条件

### 0.2 本 doc で確定しないもの (実装 phase で確定)

- 実コード (interface 実装 / provider client / response parser)
- 実 API 接続 (Anthropic / OpenAI / EXA endpoint)
- env 変更 (Production の env set 操作)
- Sentry alert / Discover query の set 操作
- 出典 URL 表示 UI 実装

### 0.3 GPT 補正 (2026-05-12) 4 点 反映

| # | 補正 | 本 doc 反映 |
|---|---|---|
| 1 | 「Anthropic Primary 固定」と書かない、**provider-agnostic architecture + Anthropic-first runtime preference** | §1.2 / §3 で表現を統一 |
| 2 | SPOF 影響を数値で断定しない (uptime / 月間 events / 障害分布 未確定)、定性的に記述 | §1.3 で数値断定を回避 |
| 3 | OpenAI は Secondary candidate として保持、**enable は OpenAI 契約細部 + cache 可否 + API key 運用確認後** | §3.2 / §9.3 |
| 4 | EXA は Tertiary candidate / **disabled stub**、ToS PDF + cache + data retention + attribution 確認後に enable 判断 | §3.2 / §9.3 |

---

## §1 採用方針

### 1.1 provider chain (案 D 採用、GPT 補正反映)

```
Primary (initial runtime preference): Anthropic Claude (web search tool)
   ↓ provider 障害時 fallback
Secondary candidate:                   OpenAI (gpt-4o + web search)
   ↓ provider 障害時 fallback
Tertiary candidate:                    EXA (search API)
   ↓ provider 障害時 fallback
Quaternary fallback:                   既存 4-layer pipeline (設計上の options、§8)
```

**重要**: 上記は **provider-agnostic architecture 内での runtime preference 順序** であり、固定構造ではない。
DI / env 経由で Primary / Secondary / Tertiary は **任意に切替え可能**。

### 1.2 各 provider の役割定義

| Tier | Provider | enabled by default | enable 条件 |
|---|---|---|---|
| Primary | Anthropic (Claude + web search) | YES (master flag ON 時) | Console で web search admin enable + PR #107 §3.1 条件充足 |
| Secondary | OpenAI (gpt-4o + web search) | **NO** (disabled stub) | OpenAI Business Terms manual verify 完了 + 契約 / API key 運用確認 + cache 可否確認 |
| Tertiary | EXA (search API) | **NO** (disabled stub) | EXA ToS PDF manual verify 完了 + cache + data retention + attribution 確認 |
| Quaternary | 既存 4-layer pipeline | YES (`COALTER_THREE_STAGE=false` で常時稼働、本 phase 設計の最終 fallback) | 既存稼働中、touch なし |

### 1.3 SPOF 緩和方針 (定性的、CEO 補正 2 遵守)

- 単一 provider 依存は障害時に CoAlter movie 経路が degraded する **構造的 risk** あり
- 本 design は **段階的 fallback chain** で provider 障害を吸収する設計とする
- runtime preference は env で動的切替え可能 (Primary 障害時に Secondary が enable 済ならば自動切替え)
- 両 provider 同時稼働 (Primary + Secondary が常時並列実行) は **overkill** として採用しない
  - Secondary は障害時のみ稼働、通常時は Primary のみが provider call を発行
  - これは **provider-agnostic interface 上の preference policy**、固定構造ではない
- **provider SLA / uptime / 月間 events / 障害分布の具体数値は本 doc では断定しない**
  - 推測ベースの数値断定は誤解を招く
  - Step E-0 で実測ベースで monitoring 設計 → 別 doc で確定

### 1.4 維持する設計 (Step D scaffold 保護)

- `threeStagePipeline` (D-2-e1) の構造
- `TheaterResolverDeps` interface (4 fetcher DI、internal は provider 経由でも適合)
- `CuratorLLMClient` interface
- `CandidatePoolDeps` interface
- B1/B2/B3 構造 gate
- `COALTER_THREE_STAGE` flag + adapter
- 4-layer pipeline 不変性

### 1.5 凍結線 (本 doc + 実装 phase 共通)

各 sub-phase は **以下に touch してはいけない** (PR #106 §1.5 維持):
- `lib/coalter/webConnector.ts` / `movieCatalog.ts` / `movieRanker.ts`
- `lib/coalter/narrationBuilder.ts` / `narrationEnricher.ts`
- `lib/coalter/foodOrchestrator.ts` / `coalterDispatch.ts` / `triggerDetection.ts`
- `lib/coalter/emotion/` / `understanding/` / `presence/` (全 directory)
- Alter Morning 系 file (path-bounded grep 0 必須)
- `lib/coalter/movieOrchestrator.ts` (D-2-e3-a では touch なし)
- `lib/coalter/engine.ts` (**D-2-e3-d のみ touch 許可**、D-2-e3-a では touch なし)

---

## §2 Provider Interface 設計

### 2.1 役割

provider-agnostic architecture の中核 interface。
各 provider 実装 (Anthropic / OpenAI / EXA) は本 interface を実装する。
adapter 側は provider 個別実装を **知らない** (DI 経由のみ参照)。

### 2.2 型定義 (本 phase で凍結)

```typescript
// lib/coalter/movie/providers/types.ts (新規、D-2-e3-a 実装着手時)

/** provider 識別子 (3 値固定、将来追加時のみ拡張可)。 */
export type ProviderId = "anthropic" | "openai" | "exa";

/**
 * 映画 retrieval provider interface。
 *
 * 各 provider 実装 (anthropicProvider / openaiProvider / exaProvider) は本 interface を実装する。
 * adapter は本 interface だけを参照、provider 個別実装に依存しない。
 */
export interface MovieRetrievalProvider {
  /** provider 識別子 (diagnostics 用) */
  readonly id: ProviderId;

  /**
   * provider が enable されているか。
   * - Anthropic: master flag `COALTER_THREE_STAGE=true` で true
   * - OpenAI: `COALTER_THREE_STAGE_OPENAI_ENABLED=true` で true
   * - EXA: `COALTER_THREE_STAGE_EXA_ENABLED=true` で true
   *
   * 各 provider 個別の verify 完了 + 契約確認後に env で enable される。
   */
  readonly enabled: boolean;

  /**
   * theater listing を retrieval する。
   * 失敗時は throw (fail-open は ProviderSelector 側で握り潰し)。
   */
  retrieve(input: ProviderRetrievalInput): Promise<ProviderRetrievalResult>;
}

/** provider への retrieval 入力。 */
export interface ProviderRetrievalInput {
  /** 作品 title */
  title: string;
  /** ユーザー指定 area */
  area: string;
  /** source hint (officialUrl / distributor、optional) */
  sourceHint?: {
    officialUrl?: string | null;
    distributor?: string | null;
  };
  /** retrieval 結果上限 (default: 5) */
  maxResults?: number;
}

/** provider response (canonical schema)。 */
export interface ProviderRetrievalResult {
  /** D-2-a 既存型 TheaterListing[] (theaterName / area / showtimes / officialUrl) */
  theaters: readonly TheaterListing[];
  /** canonical citations (§5 で詳述) */
  citations: readonly Citation[];
  /** どの provider が処理したか (diagnostics) */
  providerId: ProviderId;
  /** retrieval latency (ms) */
  latencyMs: number;
  /** provider raw diagnostics (observability、optional) */
  rawDiagnostics?: ProviderRawDiagnostics;
}

/** Citation canonical schema (Anthropic 仕様基準、§5)。 */
export interface Citation {
  /** 出典 URL (必須、UI 表示用) */
  url: string;
  /** 出典 title (必須、UI 表示用) */
  title: string;
  /** 引用テキスト snippet (optional、150 char 程度、tooltip / preview 用) */
  citedText?: string;
  /** source location hint (optional、character index range 等) */
  sourceLocationHint?: string;
}

/** provider raw diagnostics (observability 用、optional)。 */
export interface ProviderRawDiagnostics {
  tokenInput?: number;
  tokenOutput?: number;
  searchCallCount?: number;
  /** 推定 cost (USD cents、observability 用) */
  costEstimateCents?: number;
}
```

### 2.3 既存 TheaterFetcher interface との関係

D-2-a `TheaterFetcher` (4 fetcher DI) は **維持**:

```typescript
// 既存、touch なし
export type TheaterFetcher = (input: TheaterFetcherInput) => Promise<readonly TheaterListing[]>;
```

`MovieRetrievalProvider.retrieve()` を呼ぶ adapter wrapper を `TheaterFetcher` 形式で公開:

```typescript
// 概念図 (D-2-e3-a 実装時)
function providerAsTheaterFetcher(provider: MovieRetrievalProvider): TheaterFetcher {
  return async (input) => {
    const result = await provider.retrieve(input);
    return result.theaters;
  };
}
```

これにより `theaterResolver` (D-2-a) / `areaExpansion` (D-2-b) / `threeStagePipeline` (D-2-e1) は **touch なし** で provider 経由稼働可能。

---

## §3 ProviderSelector 設計

### 3.1 役割

provider chain (Primary → Secondary → Tertiary → Quaternary) の選択 + 失敗時 fallback。
runtime preference 順序を env / config で受取り、enable 済 provider のみで chain を構築する。

### 3.2 型定義 + logic

```typescript
// lib/coalter/movie/providers/providerSelector.ts (新規、D-2-e3-a 実装着手時)

/** provider chain 配置 (DI 経由で adapter から渡される)。 */
export interface ProviderChainConfig {
  /** Primary candidate (enabled でなければ skip) */
  primary: MovieRetrievalProvider;
  /** Secondary candidate (null = 無効、enabled でなければ skip) */
  secondary: MovieRetrievalProvider | null;
  /** Tertiary candidate (null = 無効) */
  tertiary: MovieRetrievalProvider | null;
}

/** provider chain 実行結果 (全 provider 失敗時は "quaternary" sentinel)。 */
export type ProviderSelectorResult =
  | { kind: "provider_success"; result: ProviderRetrievalResult }
  | { kind: "quaternary"; reason: "all_providers_failed" | "all_providers_disabled" };

/**
 * provider chain で順次 retrieve を試行する。
 *
 *   - enable 済 provider のみで chain を構築
 *   - 各 provider 失敗時は次 candidate へ自動切替え
 *   - 全 provider 失敗 → "quaternary" 返却 (adapter が 4-layer pipeline fallback or placeholder)
 *
 * 失敗 trigger: throw / timeout / rate limit / budget over。
 */
export async function selectAndRetrieve(
  input: ProviderRetrievalInput,
  config: ProviderChainConfig,
): Promise<ProviderSelectorResult> {
  const chain = [config.primary, config.secondary, config.tertiary]
    .filter((p): p is MovieRetrievalProvider => p !== null && p.enabled);

  if (chain.length === 0) {
    return { kind: "quaternary", reason: "all_providers_disabled" };
  }

  for (const provider of chain) {
    try {
      const result = await provider.retrieve(input);
      return { kind: "provider_success", result };
    } catch (err) {
      // Sentry log (provider 別) + 次 candidate へ
      // ※ ProviderId と error type で差分 alert
    }
  }
  return { kind: "quaternary", reason: "all_providers_failed" };
}
```

### 3.3 Anthropic-first runtime preference (CEO 補正 1)

- **default order**: `["anthropic", "openai", "exa"]` (Anthropic-first)
- env で順序変更可能: `COALTER_THREE_STAGE_PROVIDER_CHAIN=anthropic,openai,exa`
- 順序変更で Primary / Secondary / Tertiary が **動的に決まる** (provider-agnostic architecture)

### 3.4 provider 個別 enable

`config.primary` / `config.secondary` / `config.tertiary` の各 `provider.enabled` で個別判断。
adapter は env を読んで各 provider の `enabled` を決定:

```
Anthropic enabled = COALTER_THREE_STAGE master flag value
OpenAI    enabled = COALTER_THREE_STAGE_OPENAI_ENABLED (default false)
EXA       enabled = COALTER_THREE_STAGE_EXA_ENABLED (default false)
```

### 3.5 circuit breaker (cool-down)

連続失敗 N 回 (default N=5) で **該当 provider を 24h disable** (in-memory flag、Vercel serverless では process 単位):
- Sentry alert + CEO 通知
- 24h cool-down 後自動復帰
- CEO 手動復帰可

cross-instance での coordination (Redis 等) は本 phase scope 外、in-memory cool-down のみ。

---

## §4 safeProviderCall 設計

### 4.1 役割

各 provider client 内部の HTTP call wrapper:
- timeout 制御
- retry 制御
- rate limit / budget guard
- SSRF 防御 (allowlist 内 endpoint のみ)
- protocol whitelist (HTTPS のみ)

### 4.2 型定義 + logic

```typescript
// lib/coalter/movie/providers/safeProviderCall.ts (新規、D-2-e3-a 実装着手時)

export interface SafeProviderCallOptions {
  /** provider 別 timeout (ms) */
  timeoutMs: number;
  /** retry 最大回数 (5xx 受信時) */
  maxRetries: number;
  /** 1 回 retry あたりの backoff (ms、exponential) */
  retryBackoffMs: number;
  /** pre-call budget verify (USD、optional) */
  budgetCheckUsd?: number;
  /** allowlist 内 endpoint domain (SSRF 防御) */
  allowedEndpoints: readonly string[];
}

/**
 * provider call wrapper。
 *
 *   1. budget pre-check (cost cap 超過なら throw)
 *   2. timeout-wrapped call
 *   3. retry on 5xx (max retries 回、exponential backoff)
 *   4. 429 受信 → exponential backoff (1s → 2s → 4s)、max 3 回
 *   5. SSRF: call 内の HTTP request URL を allowlist で verify (SDK 利用なら SDK 側で対策)
 */
export async function safeProviderCall<T>(
  call: () => Promise<T>,
  options: SafeProviderCallOptions,
): Promise<T>;
```

### 4.3 timeout 仕様 (provider 別)

| Provider | timeout |
|---|---|
| Anthropic (Claude + web search) | 10s (LLM round-trip + search、web search docs 想定) |
| OpenAI (gpt-4o + web search) | 10s (同上) |
| EXA (search API) | 5s (検索 API、軽量) |

各 provider call で個別 timeout。Stage 3 全体 budget は D-2-d prefetch (既存) で管理。

### 4.4 retry policy

| Status | retry |
|---|---|
| 200 OK | 不要 |
| 3xx redirect | provider SDK が処理 (本実装層は redirect 未許可) |
| 4xx (400 / 401 / 404) | retry なし (resource 不在 / 認証 error) |
| 429 | exponential backoff (1s → 2s → 4s)、max 3 回 |
| 5xx | 1 回 retry (1s 後) |
| network error / timeout | retry なし (即 fail-open、ProviderSelector が次 provider へ) |

### 4.5 SSRF 防御

- protocol: **HTTPS のみ**
- hostname: §3.2 allowlist 内のみ (api.anthropic.com / api.openai.com / api.exa.ai)
- redirect: **拒否** (provider API は本来 redirect しない、redirect は攻撃 signal)
- DNS rebinding 対策: provider SDK 利用時は SDK 側、独自 HTTP 利用時は fetch 直前 IP 再 check

### 4.6 budget pre-check

```typescript
// 概念
const monthlyUsed = await getMonthlyUsageCents(); // cross-instance、Sentry / Discover 経由
if (monthlyUsed >= MONTHLY_CAP_CENTS) {
  throw new BudgetExceededError("monthly cap reached");
}
```

ただし cross-instance monitoring は本 phase scope 外、本 doc では interface 凍結のみ。

---

## §5 citation normalizer 設計

### 5.1 canonical schema (§2.2 `Citation` で確定)

- `url`: 必須、UI 表示用
- `title`: 必須、UI link text 用
- `citedText`: optional、150 char 程度の引用 snippet
- `sourceLocationHint`: optional、provider 別 location 情報

Anthropic 仕様を canonical schema base に採用 (verify 完了で最も明確)。

### 5.2 provider 別 mapping

#### 5.2.1 Anthropic citations → canonical (1:1)

```typescript
// lib/coalter/movie/providers/citationNormalizer.ts (新規、D-2-e3-a 実装着手時)

interface AnthropicRawCitation {
  url: string;
  title: string;
  cited_text: string;  // up to 150 char
  encrypted_index?: string;
}

export function normalizeAnthropicCitations(
  raw: AnthropicRawCitation[],
): Citation[] {
  return raw.map((c) => ({
    url: c.url,
    title: c.title,
    citedText: c.cited_text,
    sourceLocationHint: c.encrypted_index,
  }));
}
```

#### 5.2.2 OpenAI annotations → canonical

```typescript
interface OpenAIRawAnnotation {
  type: "url_citation";
  url: string;
  title: string;
  start_index: number;
  end_index: number;
}

export function normalizeOpenAICitations(
  annotations: OpenAIRawAnnotation[],
  rawText: string, // message.content
): Citation[] {
  return annotations.map((a) => ({
    url: a.url,
    title: a.title,
    citedText: rawText.slice(a.start_index, a.end_index).slice(0, 150),
    sourceLocationHint: `${a.start_index}-${a.end_index}`,
  }));
}
```

#### 5.2.3 EXA results → canonical

```typescript
interface ExaRawResult {
  url: string;
  title: string;
  text?: string;
  highlights?: string[];
}

export function normalizeExaCitations(results: ExaRawResult[]): Citation[] {
  return results.map((r) => ({
    url: r.url,
    title: r.title,
    citedText: r.highlights?.[0]?.slice(0, 150) ?? r.text?.slice(0, 150),
    sourceLocationHint: undefined,
  }));
}
```

### 5.3 UI 表示への影響 (provider 切替えで UI 揺れなし)

- UI は **canonical schema を表示**
- 「公式 site で確認」link は `citation.url` を使用
- link text は `citation.title`
- tooltip / preview は `citation.citedText` (optional、UI 設計次第)

provider 切替えで UI 仕様変動なし (Anthropic / OpenAI / EXA の差分は normalizer で吸収)。

---

## §6 cost / rate-limit guard 設計

### 6.1 budget cap (PR #103 §4.2 / PR #106 §3.4 維持 + 細分化)

| 単位 | 上限 |
|---|---|
| per-event input token | curator 4000 + retrieval 2000 = 6000 token / event |
| per-event output token | curator 1500 + retrieval 1000 = 2500 token / event |
| per-event provider call | curator 1 + retrieval 1 + fallback 1-2 = max 4 calls |
| daily per-user | 50 events |
| daily global | 5000 events |
| **monthly cost cap** | **\$500 USD** (curator + retrieval 合計、provider 横断) |
| monthly 80% 到達 (\$400) | CEO 通知 (Sentry alert) |
| monthly 95% 到達 (\$475) | **自動 OFF** (`COALTER_THREE_STAGE` 強制 false) |

### 6.2 provider 別 cost monitoring

- Discover query で provider 別 cost 集計
- Anthropic / OpenAI / EXA の cost 比率 + precision 比較
- 高 cost provider を Secondary 降格 (CEO 判断、Step E-0 で別 phase)

### 6.3 rate limit

- 各 provider 側 quota に従う (independent throttling は最小限)
- 429 受信時の挙動は §4.4 (exponential backoff)
- circuit breaker: 連続 5 回 429 で provider を 24h disable

### 6.4 cost / rate-limit storage

- per-session: in-memory (Vercel serverless では process 単位)
- daily / monthly: Supabase table or Sentry / Discover (cross-instance 集計)
- 本 phase は interface 凍結のみ、実装は別 PR

---

## §7 provider response schema

### 7.1 Anthropic response (web_search_tool_result)

```json
{
  "type": "web_search_tool_result",
  "tool_use_id": "srvtoolu_...",
  "content": [
    {
      "type": "web_search_result",
      "url": "https://eiga.com/movie/12345/",
      "title": "作品 X - eiga.com",
      "page_age": "May 11, 2026",
      "encrypted_content": "..."
    }
  ]
}
// + message.content の citations[]:
// [{ type: "web_search_result_location", url, title, encrypted_index, cited_text }]
```

→ `MovieRetrievalProvider.retrieve()` で `TheaterListing[]` + `Citation[]` に変換 (parser 別)。

### 7.2 OpenAI response (Responses API)

```json
{
  "output_text": "...",
  "output": [
    {
      "type": "web_search_call",
      "id": "...",
      "action": "search",
      "query": "..."
    },
    {
      "type": "message",
      "content": [
        { "type": "output_text", "text": "..." }
      ],
      "annotations": [
        {
          "type": "url_citation",
          "url": "https://eiga.com/movie/12345/",
          "title": "作品 X - eiga.com",
          "start_index": 100,
          "end_index": 250
        }
      ]
    }
  ]
}
```

### 7.3 EXA response

```json
{
  "results": [
    {
      "url": "https://eiga.com/movie/12345/",
      "title": "作品 X - eiga.com",
      "text": "...",
      "highlights": ["TOHOシネマズ渋谷で 19:00〜上映"],
      "publishedDate": "2026-05-11"
    }
  ]
}
```

### 7.4 共通変換 (provider 別 parser)

```typescript
// lib/coalter/movie/providers/responseParser.ts (新規、D-2-e3-a 実装着手時)

export function parseAnthropicResponse(raw: AnthropicResponse, input: ProviderRetrievalInput): ProviderRetrievalResult;
export function parseOpenAIResponse(raw: OpenAIResponse, input: ProviderRetrievalInput): ProviderRetrievalResult;
export function parseExaResponse(raw: ExaResponse, input: ProviderRetrievalInput): ProviderRetrievalResult;
```

各 parser:
1. `TheaterListing[]` を生成 (text / highlights から regex / LLM-aided extraction)
2. citations を canonical schema へ (§5)
3. provider 別 diagnostics を `rawDiagnostics` field へ

---

## §8 fallback to existing 4-layer pipeline 設計

### 8.1 fallback trigger

ProviderSelector が `"quaternary"` を返す条件:
- 全 enable 済 provider が失敗 (`all_providers_failed`)
- 全 provider disabled (`all_providers_disabled`)

これに加えて:
- master `COALTER_THREE_STAGE=false` 時は movieOrchestrator.ts 内で adapter が呼ばれない → 4-layer pipeline へ自然に流れる

### 8.2 fallback 実装 options (CEO 判断要)

ProviderSelector が `"quaternary"` を返した場合、adapter はどう振る舞うか:

| Option | 動作 | 利点 | 欠点 |
|---|---|---|---|
| **F1** ⭐推奨 | placeholder `MovieOrchestratorOutput` を返す (現状 D-2-e2 stub と同等) | 凍結線完全維持、最も simple | 全 provider 失敗時 user 体験 degraded |
| F2 | adapter から movieOrchestrator.ts 内の 4-layer pipeline entry へ recursive call (flag 一時 OFF) | user 体験 graceful degradation | movieOrchestrator.ts touch 必要、flag mutate logic 美しくない |
| F3 | 4-layer pipeline 部分を別 file に extract、両方から呼べるようにする | 構造美しい | extract = 凍結線違反、本 phase 不可 |

**推奨**: **Option F1** 採用 (本 phase)。
- 本 phase の主目的は **provider-agnostic interface 凍結**
- 全 provider 失敗時の真の 4-layer fallback (F2) は D-2-e3 後の別 phase で検討
- F1 でも `COALTER_THREE_STAGE=false` で 4-layer pipeline へ降ろせる (master kill switch、rollback path)

### 8.3 Option F1 の design 仕様

```typescript
// adapter 内擬似 code (D-2-e3-a 実装着手時)
async function runThreeStageScaffoldPath(input, startedTotal) {
  const retrievalResult = await selectAndRetrieve(retrievalInput, providerChainConfig);

  if (retrievalResult.kind === "quaternary") {
    // F1: placeholder を返す
    // (D-2-e2 stub と同等、Production で flag ON 時の最終 fallback)
    return adaptToPlaceholderOutput(input, startedTotal, /* hint: provider all failed */);
  }

  // provider success → 通常 path
  return adaptToMovieOrchestratorOutput(retrievalResult.result, input, startedTotal);
}
```

placeholder 返却時の挙動:
- `MovieOrchestratorOutput` 5 field shape 互換 (D-2-e2 同等)
- `ranked: []` / `primaryQuestion: null` / `diagnostics 7 field 全 0`
- `card`: placeholder narration (例: 「現在 retrieval に失敗中、しばらく後にもう一度お試しください」)
- Sentry alert: 全 provider 失敗 (CEO 通知)

→ user 体験は degraded だが、Production 全停止は回避される。
→ Sentry 経由で incident 検出 → CEO 手動 rollback (`COALTER_THREE_STAGE=false`) で 4-layer pipeline 復帰可能。

---

## §9 env flag / enable 条件

### 9.1 既存 flag (PR #102/#106 維持)

| Flag | default | 動作 |
|---|---|---|
| `COALTER_THREE_STAGE` | false | master kill switch、三段式起動 |

### 9.2 新規 env flag (本 phase で凍結、実装は D-2-e3-a 着手 PR)

| Flag | default | 動作 |
|---|---|---|
| `COALTER_THREE_STAGE_PROVIDER_CHAIN` | `anthropic` | provider preference 順 (comma-separated)、例: `anthropic,openai,exa` |
| `COALTER_THREE_STAGE_OPENAI_ENABLED` | **false** | OpenAI Secondary を enable (verify + 契約確認後) |
| `COALTER_THREE_STAGE_EXA_ENABLED` | **false** | EXA Tertiary を enable (verify + ToS PDF 確認後) |

### 9.3 各 provider の enable 条件 (GPT 補正 3 / 4 反映)

#### 9.3.1 Anthropic (Primary candidate)

- `COALTER_THREE_STAGE=true` (master flag)
- Anthropic Console (/settings/privacy) で web search admin enable
- PR #107 §3.1 PASS conditional の 5 条件充足:
  - (a) Aneurasync が Anthropic と commercial 契約
  - (b) web search tool が Console で enable 可能
  - (c) citation URL を CoAlter UI に表示 (法務要件、Product Unit 設計)
  - (d) cost cap (\$500/月) + rate limit 対策
  - (e) cache 戦略 CEO + 法務 判断

#### 9.3.2 OpenAI (Secondary candidate、disabled by default)

- `COALTER_THREE_STAGE_OPENAI_ENABLED=true`
- 以下全条件充足後にのみ enable:
  - OpenAI Business Terms / Services Agreement / Usage Policies の **manual verify 完了** (CEO + 法務、openai.com policy pages の WebFetch 不可のため)
  - 既存 OpenAI 契約 / API key 運用確認 (CEO + Build 内部 audit)
  - cache 可否確認 (Business Terms 内)
  - inline citation UI 実装合意 (Product Unit、clearly visible + clickable)

#### 9.3.3 EXA (Tertiary candidate、disabled stub by default)

- `COALTER_THREE_STAGE_EXA_ENABLED=true`
- 以下全条件充足後にのみ enable:
  - EXA ToS PDF (`/assets/Exa_Labs_Terms_of_Service.pdf`) の **manual verify 完了** (CEO + 法務)
  - cache 戦略確認
  - data retention / training 利用範囲確認 (query data + 取得 content の training 使用、personal info 除外)
  - attribution 表示要件確認

### 9.4 Production env 変更 規律

- 本 doc PR では env 変更しない
- D-2-e3-a 着手 PR でも、コードと test だけ commit、env 変更は別 step
- env 変更は **CEO 明示 GO + staging で動作 verify 後**
- Production env への反映は **Step E-0 完了後**

---

## §10 実 API 接続なし (本 phase)

### 10.1 本 phase で確定するもの

- interface / 型 (§2)
- ProviderSelector の chain logic (§3)
- safeProviderCall 仕様 (§4)
- citation normalizer (§5)
- cost guard (§6)
- response schema (§7)
- fallback 設計 (§8)
- env flag (§9)

### 10.2 本 phase で確定しないもの

- 実コード (interface / provider client / response parser の **実装**)
- 実 API 接続 (api.anthropic.com / api.openai.com / api.exa.ai)
- Anthropic / OpenAI / EXA への actual HTTP request

### 10.3 D-2-e3-a 実装 PR でも実 API 接続は **default stub**

D-2-e3-a 着手 PR では:
- interface 実装 + provider client コード書く
- ただし **provider client は default で disabled state**、actual HTTP call なし (stub `async () => ({ theaters: [], citations: [] })` 等)
- env を enable に切替えて初めて actual API call (CEO 明示 GO 後)

これは PR #102 / #106 で確立した「stub と real を明確に区別する」原則の継承。

---

## §11 D-2-e3-a 着手条件

### 11.1 既存条件 (PR #107 §7.3、5 件) 充足

1. Primary + Secondary provider が verified + PASS (or PASS conditional 条件充足)
2. §6 14 open question 全回答済
3. allowlist 確定
4. 出典 URL 表示 UI 設計 (Product Unit との合意)
5. CEO の D-2-e3-a 着手 GO 明示判断

### 11.2 本 doc 追加条件

6. Provider Interface 設計 (本 doc §2) review + 合意
7. ProviderSelector 設計 (本 doc §3) review + 合意
8. safeProviderCall 設計 (本 doc §4) review + 合意
9. citation normalizer 設計 (本 doc §5) review + 合意
10. cost guard 設計 (本 doc §6) review + 合意
11. fallback 設計 (本 doc §8 Option F1) review + 合意

### 11.3 着手 GO 判定

11 条件 **全充足** で D-2-e3-a 着手 GO。
新 branch (`feat/coalter-d2e3a-implementation` 想定) で実装着手。

---

## §12 rollback path

### 12.1 provider 単独障害 (層別自動 fallback)

```
Primary 失敗 → Secondary へ (Secondary enable 済の場合)
Secondary 失敗 → Tertiary へ (Tertiary enable 済の場合)
Tertiary 失敗 → Quaternary (Option F1: placeholder return)
```

Sentry alert + CEO 通知 (連続失敗時)。
24h cool-down 後自動復帰 or CEO 手動復帰。

### 12.2 三段式全停止 (master kill switch)

env `COALTER_THREE_STAGE=false` set + Production redeploy:
- 即座に movieOrchestrator.ts 内 flag check で 4-layer pipeline へ降ろされる
- 10-15 分以内に復帰
- コード revert 不要 (PR #103 §9.2 同等)

### 12.3 provider 個別 disable (緊急 cool-down)

env `COALTER_THREE_STAGE_OPENAI_ENABLED=false` 等:
- 該当 provider のみ即座に disable
- 他 provider は稼働継続
- redeploy 必要 (env 変更反映のため)

### 12.4 rollback playbook (Step E 運用時、Step E-0 で別 doc 化予定)

```
1. Sentry alert 受領 (provider 失敗率 / cost / latency)
2. CEO 判断 (該当 provider disable / 三段式全停止)
3. env 変更 (Vercel console)
4. Production redeploy
5. 4-layer pipeline / 三段式 (該当 provider disable 済) で稼働確認
6. incident report 起草
```

---

## §13 Step E 開始条件

PR #106 / #107 §10 維持 + 本 doc 追加:

| # | 条件 | verify |
|---|---|---|
| 1-8 | PR #106 §10 / PR #107 §10 既存条件 | 既存 doc 参照 |
| 9 | **D-2-e3-a 実装完了** (interface 実装 + provider client 凍結) + main merge | git log で commit verify |
| 10 | 出典 URL 表示 UI 実装完了 (Product Unit) | UI demo / staging で verify |
| 11 | provider 月次 cost 監視 dashboard 完成 | Discover dashboard URL 確認 |
| 12 | rollback playbook drill 完了 (staging で provider 別 disable 試行) | drill log |
| 13 | A/B 比較 framework (Step E-0-3、optional) | 別 doc |

全条件達成 + CEO の Step E 開始 GO で初めて Production canary 開始。

---

## §14 まだやらない (本 doc PR scope 外、明示)

### 14.1 本 doc PR で着手しないもの

- D-2-e3-a 実装 (interface / provider client / response parser の **コード**)
- provider client コード実装 (`lib/coalter/movie/providers/` 配下)
- 実 API 接続 (api.anthropic.com / api.openai.com / api.exa.ai)
- direct scraping 実装 (PR #106 Annex A 維持、本 phase 対象外)
- Production env 変更
- env flag 新規追加 (本 doc で凍結のみ、実装は別 PR)
- Sentry alert / Discover query の set 操作
- 出典 URL 表示 UI 実装
- A/B 比較 framework 構築
- Step E 開始
- bug1 worktree cleanup

### 14.2 本 doc PR で書き留めるが別 PR で詳細化するもの

- D-2-e3-a 実装 PR (本 doc が design base)
- 出典 URL 表示 UI 設計 PR (Product Unit、別 doc)
- Sentry alert / Discover query set PR (Step E-0-1)
- canary 戦略 plan PR (Step E-0-2)
- A/B 比較 framework 構築 PR (Step E-0-3、optional)
- rollback playbook drill PR (Step E-0)

---

## 付録 A: 本 doc が満たす CEO 指定項目 (15 項目) チェック

| # | CEO 指定 | 本 doc 反映 section |
|---|---|---|
| 1 | Provider interface | §2 (型定義 + 既存 TheaterFetcher 関係) |
| 2 | ProviderSelector | §3 (chain config + select logic + cool-down) |
| 3 | Anthropic-first runtime preference | §1.2 / §3.3 |
| 4 | OpenAI secondary candidate | §1.2 / §9.3.2 |
| 5 | EXA tertiary disabled candidate | §1.2 / §9.3.3 |
| 6 | safeProviderCall | §4 |
| 7 | timeout / retry / rate-limit / budget guard | §4.3 / §4.4 / §4.5 / §4.6 / §6 |
| 8 | citation normalizer | §5 |
| 9 | provider response schema | §7 |
| 10 | fallback to existing 4-layer pipeline | §8 (Option F1 推奨) |
| 11 | env flag / enable 条件 | §9 |
| 12 | no real API connection in this phase | §10 |
| 13 | D-2-e3-a 実装着手条件 | §11 (11 条件全充足) |
| 14 | rollback path | §12 |
| 15 | Step E 開始条件 | §13 (13 条件) |

---

## 付録 B: 接続図 (PR #102 〜 本 PR の流れ)

```
[PR #102: Step D structural scaffold complete]
   ↓
[PR #103: D-2-e3 external deps design review 旧 (direct fetch 前提)]
   ↓
[PR #104: D-2-e3 source compliance review framework (direct fetch 前提)]
   ↓ CEO 判断: provider-based retrieval 優先
   ↓
[PR #106: D-2-e3 provider-based revision]
   ↓
[PR #107: D-2-e3 provider verify update (Anthropic PASS conditional / OpenAI PARTIAL PASS / EXA AMBIG)]
   ↓ CEO 判断: 案 D + 4 補正
   ↓
[本 PR: D-2-e3-a provider-agnostic implementation design review]
   ↓ design 凍結
   ↓
[CEO 判断: D-2-e3-a 着手 GO (§11 11 条件全充足後)]
   ↓
[feat/coalter-d2e3a-implementation branch + 実装 PR]
   ↓
[D-2-e3-b / c / d / e 順次]
   ↓
[Step E-0 (Production reflection 前準備)]
   ↓
[Step E (Production observation 開始)]
```

---

## 付録 C: 凍結線 (handover §4.2 継承)

(PR #106 / #107 付録 B 維持、本 doc でも touch ゼロ)

- `lib/coalter/webConnector.ts`
- `lib/coalter/movieCatalog.ts`
- `lib/coalter/movieRanker.ts`
- `lib/coalter/narrationBuilder.ts` / `narrationEnricher.ts`
- `lib/coalter/foodOrchestrator.ts` / `coalterDispatch.ts` / `triggerDetection.ts`
- `lib/coalter/movieOrchestrator.ts` (本 phase で touch なし、D-2-e3-d のみ input type 拡張)
- `lib/coalter/engine.ts` (D-2-e3-d のみ touch)
- `lib/coalter/emotion/` / `understanding/` / `presence/` (全 directory)
- Alter Morning 系 file (path-bounded grep 0 必須)

---

## 付録 D: 5 gate verify (各実装 PR で必須、本 doc PR では docs-only)

1. **typecheck**: baseline 維持
2. **vitest**: tests/unit/coalter 全 PASS
3. **build**: `npm run build` BUILD_EXIT=0
4. **凍結線 grep**: 付録 C file 全 0 touched
5. **Alter Morning grep**: 0 hits

本 doc PR は docs-only のため、gate verify は (4) (5) のみ実施 + 報告。

---

## 付録 E: GPT 補正 (2026-05-12) との対応関係

| GPT 補正 | 本 doc 反映 | 検証 |
|---|---|---|
| 1. 「Primary 固定」NG → provider-agnostic + Anthropic-first runtime preference | §1.2 / §3 で表現を統一、provider 切替え可能性を明示 | claude 自身も「Primary 固定」と書いた表現を refine |
| 2. SPOF 影響を数値で断定しない | §1.3 で uptime / 月間 events / 障害分布の具体数値を **削除**、定性的記述に変更 | claude の前 turn での 0.1% / 5 events/月 等の断定を撤回 |
| 3. OpenAI Secondary 維持、enable は契約細部 + cache + API key 運用確認後 | §9.3.2 で enable 条件 4 件明示 | provider verify update doc (PR #107) と整合 |
| 4. EXA Tertiary disabled stub、ToS PDF + cache + data retention + attribution 確認後 enable | §9.3.3 で enable 条件 4 件明示 | provider verify update doc (PR #107) と整合 |

claude 自身の self-correction:
- 数値断定の性急さを認識、本 doc では定性的記述のみ採用
- 「Primary 固定」は provider-agnostic architecture と矛盾する表現として撤回
- design doc は provider 切替え自由度を最大化する方向で書き直し
