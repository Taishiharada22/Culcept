# CoAlter D-2-e3 External Dependencies Design Review (provider-based revision)

**Status**: Draft (docs-only、provider-based 前提に revision)
**Branch**: `docs/coalter-d2e3-provider-based-revision`
**Base**: `main` (HEAD `049572e2`)
**前提**: PR #102 (Step D structural scaffold complete) + PR #103 (本 doc 旧版、direct fetch 前提) + PR #104 (source compliance 旧版、direct fetch 前提) merged 済
**本 doc PR の scope**: docs-only、**実装着手なし**。CEO 判断 (2026-05-12) で provider-based retrieval 優先方針が確定したため、PR #103 旧 doc を本 doc で revise する。
**生成日**: 2026-05-12

---

## §0 本 doc の目的と scope (revision)

### 0.1 PR #103 旧 doc からの変更点

| 旧 doc (direct fetch 前提) | 本 doc (provider-based 前提) |
|---|---|
| 4 theater fetcher を direct HTTP fetch (`safeFetch` 経由) で実装 | 4 fetcher の **interface 維持**、内部実装を **provider call** に置換 |
| 11 source (8 distributor + eiga + yahoo + EXA) compliance verify | provider 3-7 (Anthropic / OpenAI / EXA 等) compliance verify (詳細 → source compliance doc) |
| URL allowlist (8 distributor + 2 site direct site) | provider endpoint allowlist (api.anthropic.com / api.openai.com / api.exa.ai 等) |
| robots.txt / ToS / SSRF / size / type / rate limit / retry の direct fetch 用 design | provider 用 token budget / cost cap / rate limit / cache / 出典 URL 表示 design |
| direct scraping は Primary 経路 | direct scraping は **Annex A** に降格、stub のまま future candidate |
| Primary provider 未指定 (4 直接 fetcher) | Primary provider を **固定しない** (Anthropic / OpenAI / EXA の中から実装着手時に選定) |

### 0.2 維持する設計 (Step D scaffold 保護)

- `threeStagePipeline` (D-2-e1) の構造
- `TheaterResolverDeps` interface (4 fetcher DI)
- `CuratorLLMClient` interface (curator LLM)
- `CandidatePoolDeps` interface (3 source)
- B1/B2/B3 構造 gate
- `COALTER_THREE_STAGE` flag + adapter
- 4-layer pipeline 不変性

### 0.3 確定するもの (本 doc PR merge で凍結)

| 確定事項 | 影響 |
|---|---|
| provider-based retrieval を優先方針として採用 | D-2-e3-a 設計の方向確定 |
| Primary provider 非固定 (provider-agnostic 設計) | 実装着手時に選定可、契約 + 可用性 + cost 確認後 |
| curator (D-2-e3-b) と retrieval provider (D-2-e3-a) の分離 | 失敗時の切り分け容易、後で統合再検討 |
| direct fetcher 4 stub の維持 + Annex A 降格 | 将来 partnership 経由で復活 candidate |
| 出典 URL 表示必須 | UI 設計責任は Product Unit、設計時期は別 phase |

---

## §1 D-2-e3 全体図 (provider-based revision)

### 1.1 5 sub-phase 概要 (provider-based 前提)

```
D-2-e3-a  provider-based retrieval 実接続    [provider 1-3 個 + DI / 出典 URL]
   ↓
D-2-e3-b  CuratorLLMClient 実接続             [既存 runAI 流用 / cost / token / D-2-e3-a と分離]
   ↓
D-2-e3-c  provider-based candidate source     [ranking / EXA / Supabase 経由、direct scrape なし]
   ↓
D-2-e3-d  M0 lens 実接続                       [engine.ts touch 要 / 高 latency、変更なし]
   ↓
D-2-e3-e  prefetch wiring + diagnostics       [adapter 仕上げ / 観測値 fill、変更なし]
```

### 1.2 各 sub-phase の責務 (旧 doc との差分)

| Sub-phase | 旧責務 (direct fetch) | 新責務 (provider-based) | 差分 |
|---|---|---|---|
| **a** | 4 fetcher (official / eiga / yahoo / exa) direct HTTP fetch | TheaterFetcher interface を維持、provider client (Anthropic / OpenAI / EXA 等) で stub を置換 | 主要書換 |
| b | curator LLM client 接続 (`runAI` 経由) | 同じ (D-2-e3-a と分離、curator は narration 専念) | 変更なし、分離強調 |
| **c** | 3 source (ranking direct / EXA / personality_history) | rankingSource を provider 経由に書換、direct scrape なし | 主要書換 |
| d | M0 lens 注入 (engine.ts touch) | 同じ | 変更なし |
| e | prefetch + diagnostics 仕上げ | 同じ | 変更なし |

### 1.3 着手順 (provider-based、リスク低 → 高)

a → b → c → d → e の順序は **変更なし**。
ただし sub-phase a の internal complexity は **大幅減少** (provider client 1-3 個の wiring、HTML parser 4 種は不要)。

### 1.4 各 sub-phase で触ってよい file (provider-based 用)

| Sub-phase | 触ってよい file |
|---|---|
| **a** | `lib/coalter/movie/providers/` 配下 (新規) + `threeStageOrchestratorAdapter.ts` + tests |
| b | `lib/coalter/movie/curatorLLMClientImpl.ts` (新規) + `threeStageOrchestratorAdapter.ts` + tests |
| **c** | `lib/coalter/movie/sources/` 配下 (新規、provider 経由 source) + `threeStageOrchestratorAdapter.ts` + tests |
| d | `lib/coalter/engine.ts` + `lib/coalter/movieOrchestrator.ts` (input type 拡張) + `threeStageOrchestratorAdapter.ts` + tests |
| e | `threeStageOrchestratorAdapter.ts` のみ |

`lib/coalter/movie/fetchers/` directory は **新規作成しない** (provider-based なので不要)。
direct scrape を将来復活させる場合に新規作成 candidate (Annex A 参照)。

### 1.5 凍結線 (provider-based でも維持)

各 sub-phase は **以下に touch してはいけない** (旧 doc §1.3 維持):

- `lib/coalter/webConnector.ts`
- `lib/coalter/movieCatalog.ts`
- `lib/coalter/movieRanker.ts`
- `lib/coalter/narrationBuilder.ts` / `narrationEnricher.ts`
- `lib/coalter/foodOrchestrator.ts` / `coalterDispatch.ts` / `triggerDetection.ts`
- `lib/coalter/emotion/` / `understanding/` / `presence/` (全 directory)
- Alter Morning 系 file
- `lib/coalter/movieOrchestrator.ts` (a/b/c/e では touch なし、**d のみ input type 追加のみ touch 許可**)
- `lib/coalter/engine.ts` (**d のみ touch 許可**)

---

## §2 共通設計原則

### 2.1 DI 維持 (旧 doc §2.1 維持)

D-2-e1 / D-2-e2 で確立した DI 構造を維持:
- `TheaterResolverDeps` (4 fetcher) ← **provider 経由でも interface 維持**
- `CuratorLLMClient` (LLM) ← curator 専用、D-2-e3-a と分離
- `CandidatePoolDeps` (3 source) ← provider 経由
- `ThreeStagePipelineDeps` で集約

### 2.2 fail-open 既存方針継承 (旧 doc §2.2 維持)

provider 経由でも全 sub-module fail-open は変更なし:
- `theaterResolver.callFetcherFailOpen` (個別 provider client の throw 握り潰し)
- `candidatePool.callSourceFailOpen` (provider source 失敗 → 残り source で進行)
- `curator` (LLM throw / parse 失敗 → fallback narration)
- `areaExpansion` (resolver 失敗 → 次 area へ)
- `tierFailNarration` (Tier 2 fail → alt narration)

### 2.3 provider-agnostic 設計 (CEO 補正 2 反映)

| 項目 | 方針 |
|---|---|
| Primary provider 固定 | **しない** |
| provider 選定タイミング | 実装着手時 (契約 + API 可用性 + cost 確認後) |
| provider 切替え容易性 | DI 経由で provider client を置換可能 |
| Secondary fallback | Primary とは異なる provider (single point of failure 回避) |

### 2.4 curator と retrieval provider の分離 (CEO 補正 3 反映)

| 役割 | 担当 |
|---|---|
| curator | 2 人理解に基づく作品選定 + Personality-Rooted Narration |
| retrieval provider | 映画館・上映情報の取得 (theater listing) |

```
分離 (採用、本 doc):
  curator → top picks (作品タイトル等)
     ↓
  retrieval provider (別 LLM call or 別 API) → theater listing per pick

統合 (将来再検討):
  curator + retrieval を 1 LLM call で完結 (web search tool 付き)
  → 失敗時の切り分けが難しくなる risk、まずは分離で運用
```

### 2.5 観測可能性 (Sentry / Discover) (旧 doc §2.3 維持 + 拡張)

provider 別の観測指標を Step E-0-1 で set:
- 失敗率 (provider 別)
- latency 分布 (per-provider p50 / p95 / p99)
- cost (LLM token + retrieval call の provider 別集計)
- hallucination 指標 (出典 URL を user が click した後の bounce 率)
- diagnostics 6 field の分布

### 2.6 rollback 1-click (旧 doc §2.4 維持)

`COALTER_THREE_STAGE=false` + Production redeploy で即座に pre-D-2-e2 状態に復帰。
provider 単独障害は **Sentry alert + 該当 provider 自動 disable** (cool-down) で対応。

---

## §3 D-2-e3-a 設計: provider-based retrieval 実接続 (主要書換 section)

### 3.1 着手 gate (本 §3 全項目が CEO 承認されないと着手しない)

- §3.2 provider 選定 + endpoint allowlist
- §3.3 SSRF / protocol / timeout (provider call 用)
- §3.4 token budget / cost cap
- §3.5 cache 戦略
- §3.6 出典 URL 表示方針
- §3.7 第三者権利配慮
- §3.8 fail-open / fallback 戦略 (provider 3 段)
- §3.9 response parser 設計
- §3.10 Sentry alert (provider 別)
- §3.11 file 配置 + DI 設計

### 3.2 provider 選定 + endpoint allowlist

#### 3.2.1 provider 選定の基準 (実装着手時)

| 基準 | 重要度 | 評価方法 |
|---|---|---|
| 既存契約有無 | 高 | CEO + Build 既存契約調査 |
| commercial use 許容 | 高 | provider ToS 実確認 (source compliance doc §3) |
| web search / browse tool 可用性 | 高 | 該当 plan で利用可能か |
| precision (theater 検索結果の正確性) | 中 | A/B 比較 (実装着手後) |
| latency p99 | 中 | provider 実測 |
| per-event cost | 中 | rate card + 試算 |
| rate limit 上限 | 中 | provider plan |
| 出典 URL 出力 | 高 | ToS 内 attribution 条項 |

#### 3.2.2 候補 provider (固定なし)

source compliance doc §1.1 参照。本 doc では Primary を確定しない。

実装着手時の判定例:
- 既存契約 + 商用 OK + web search 可 → Primary candidate
- 既存契約のみ → Secondary fallback candidate
- 新規契約必要 → CEO 判断後 candidate

#### 3.2.3 endpoint allowlist (source compliance doc §4.2 引用)

provider 経由のみ、direct site への HTTP fetch なし:

```typescript
// lib/coalter/movie/providers/allowlist.ts (D-2-e3-a 着手時実装)
export const PROVIDER_ENDPOINT_ALLOWLIST = {
  anthropic: ["api.anthropic.com"],
  openai: ["api.openai.com"],
  exa: ["api.exa.ai"],
  // 他 P4-P7 は将来 candidate、現状 disable
};
```

allowlist 違反 → throw → fail-open + Sentry alert。

### 3.3 SSRF / protocol / timeout (provider call 用)

#### 3.3.1 protocol / DNS / IP

- protocol: **HTTPS のみ**
- hostname: allowlist 内 endpoint のみ
- DNS rebinding 対策: provider client が SDK 経由なら基本 SDK 内で対策、独自 HTTP client なら fetch 直前に IP 再 check
- redirect: **拒否** (provider API は redirect 不要)

#### 3.3.2 timeout (provider 別)

| Provider | timeout | 根拠 |
|---|---|---|
| Anthropic (Claude + web search) | **10s** | web search は重い、LLM round-trip 含む |
| OpenAI (gpt-4o + browse) | **10s** | 同上 |
| EXA | **5s** | 検索 API、軽量 |

各 provider call で個別 timeout。Stage 3 全体 budget は別途 prefetch (D-2-d) で管理。

#### 3.3.3 timeout 超過時

- throw → `theaterResolver.callFetcherFailOpen` で内部 catch → 次 provider (Secondary fallback) へ

### 3.4 token budget / cost cap (旧 §4.2 維持 + 拡張)

#### 3.4.1 token budget (provider 別)

| 項目 | 上限 |
|---|---|
| retrieval input token | 2000 (prompt + query) |
| retrieval output token | 1000 (theater listing + 出典 URL) |
| per-event total (curator + retrieval) | 7500 token (curator 5500 + retrieval 2000、上限 wiggle room あり) |

#### 3.4.2 cost cap (旧 §4.2 維持)

| 単位 | 上限 |
|---|---|
| per-event cost | curator + retrieval = ~$0.03 estimate |
| daily per-user | 50 events |
| daily global | 5000 events |
| monthly cost | **$500 cap** (curator + retrieval 合計、circuit breaker) |
| 月次 80% 到達 | CEO 通知 |
| 月次 95% 到達 | 自動 OFF |

#### 3.4.3 cost monitoring

provider 別 cost を Step E-0-1 で Discover query 化、daily review で監視。

### 3.5 cache 戦略 (旧 §7.2/7.3 拡張)

| 種別 | cache policy | TTL | storage |
|---|---|---|---|
| retrieval theater listing (per-title × per-area) | provider ToS 許容なら cache、未許容なら per-session のみ | 24h or per-session | Supabase table or in-memory (CEO 判断) |
| ranking source (provider 経由) | daily cache | 24h | Supabase table |
| LLM curator narration | per-session のみ (個別性高) | per-invocation | in-memory |

cache invalidation:
- per-session: 一 invocation 内のみ
- 24h: 自動 expire
- manual: CEO / Build 任意

### 3.6 出典 URL 表示方針 (CEO 補正 3 反映)

#### 3.6.1 必須要件

- 全 retrieval 結果に **source URL を含める**
- UI に「公式 site で確認」リンクを表示 (Product Unit と協議)
- LLM hallucination 対策: user が公式 site で再確認可能な状態を維持

#### 3.6.2 出典 URL の取得元

| Provider | source URL の取得方法 |
|---|---|
| Anthropic (web search tool) | tool response 内 citations / source URLs |
| OpenAI (web browse) | tool response 内 citations |
| EXA | search response 内 result URLs |

#### 3.6.3 表示 UI 設計 (別 phase で具体化)

- per-theater 行に 「[公式情報を確認 →]({url})」 link
- LLM 回答であることの **明示** (ユーザー誤解防止)
- 「情報が古い可能性」UI 注記 (cache 採用時)

→ Product Unit と協議、別 phase で UI 設計 PR。

### 3.7 第三者権利配慮

- provider が aggregate する third-party content (theater 名 / 上映時刻) の **出典は常に source URL で示す**
- Aneurasync は aggregator として振る舞い、original 情報源を user が確認できる状態を維持
- 第三者からの違反指摘を受けた場合の rollback playbook (§9 と接続)

### 3.8 fail-open / fallback 戦略 (provider 3 段)

```
Step 1: Primary provider call
   ↓ throw / timeout / rate limit
Step 2: Secondary provider fallback
   ↓ 同上
Step 3: Tertiary fallback (4-layer pipeline へ降ろす)
   = COALTER_THREE_STAGE は無効化される (本 invocation のみ)
   = 既存 4-layer pipeline で response
```

各層 fail-open、各層失敗で Sentry alert + 該当 provider 自動 disable (24h cool-down)。

### 3.9 response parser 設計

#### 3.9.1 provider response の構造

各 provider が返す response は形式異なる:
- Anthropic: structured tool response (content_blocks)
- OpenAI: function call / tool_use response
- EXA: structured JSON (results array)

#### 3.9.2 parser の責務

- provider response → `TheaterListing[]` (D-2-a 既存型) への変換
- source URL を `officialUrl` field に格納
- show times / area の抽出 (LLM の text response を parse)

#### 3.9.3 LLM hallucination 防御

- 出力に `<source_url>` がない → reject (hallucination 疑い)
- theater 名が空 → reject
- source URL が allowlist 外 domain → 警告 (cite はするが flag を立てる)
- 出力数が 0 → 空配列 (fail-open)

### 3.10 Sentry alert (provider 別、D-2-e3-a 関連)

| Alert | 閾値 |
|---|---|
| Primary provider 失敗率 > 30% | 1h window |
| Secondary provider 失敗率 > 30% | 1h window |
| 全 provider 失敗率 > 20% | 1h window | (緊急、CEO 通知) |
| provider timeout 比率 > 25% | 1h window |
| provider cost 月次 80% | monthly |
| provider cost 月次 95% | monthly | (緊急、自動 OFF) |
| hallucination 指標 (出典 URL 不在) > 10% | 1h window |
| 出典 URL allowlist 外 出力比率 > 5% | 1h window |

### 3.11 file 配置 + DI 設計

```
lib/coalter/movie/providers/                          ← 新規 directory (D-2-e3-a で実装)
  ├── allowlist.ts            (provider endpoint allowlist)
  ├── safeProviderCall.ts     (共通 HTTP/SDK wrapper、timeout / budget / SSRF)
  ├── providerSelector.ts     (Primary / Secondary 切替え、fallback 制御)
  ├── responseParser.ts       (provider response → TheaterListing[] 変換)
  ├── anthropicProvider.ts    (Anthropic Claude client、web search tool 経由)
  ├── openaiProvider.ts       (OpenAI client、web search / browse 経由) [optional、Primary 候補]
  └── exaProvider.ts          (EXA API client wrapper)

lib/coalter/movie/threeStageOrchestratorAdapter.ts    ← 修正 (D-2-e3-a で)
  resolverDeps の 4 stub:
    officialFetcher: stub のまま維持 (Annex A 降格)
    eigaFetcher:     stub のまま維持 (Annex A 降格)
    yahooFetcher:    stub のまま維持 (Annex A 降格)
    exaFetcher:      providerSelector("retrieval") に置換 (provider 経由)
  // 注: TheaterFetcher 4 個の interface は維持、4 つのうち 1 つを provider 経由に置換、
  //     残り 3 個は direct scrape future candidate のため stub のまま
```

#### 3.11.1 簡素化案 (Build 着手時の判断)

- 案 A: TheaterFetcher 4 fetcher のうち **exaFetcher のみ provider 経由**、他 3 個は stub のまま。SOURCE_ORDER で official→eiga→yahoo→exa の chain は維持 (3 段 stub 失敗 → exa 経由で確実取得)
- 案 B: 全 4 fetcher を **同じ provider client** にして、SOURCE_ORDER は cosmetic な順序のみ。
- 案 C: TheaterFetcher interface を 1 fetcher 化に再設計 (D-2-e3-a の sub-task として)

**CEO 判断ポイント**: 案 A / B / C のどれを採用するか。
**推奨**: 案 A (interface 完全維持、最小変更、direct scrape 復活時の互換性最大)

### 3.12 直接 HTML fetch を本 phase で行わない

PR #103 旧 §3.3〜3.11 の direct fetch 用 design (URL allowlist 11 domain / robots.txt / distributor partnership / HTML parse 等) は **本 phase 対象外**。
詳細は **Annex A** に降格。

---

## §4 D-2-e3-b 設計: 実 LLM 接続 (curator、retrieval と分離) (旧 §4 維持 + 強調)

### 4.1 着手 gate (旧 doc §4.1 維持)

- §4.2 cost 上限 (per-event / daily / monthly)
- §4.3 timeout
- §4.4 retry policy
- §4.5 failure fallback
- §4.6 token budget
- §4.7 prompt 制御
- §4.8 Sentry alert + cost monitoring
- §4.9 file 配置

### 4.2-4.9 内容 (旧 doc §4 全項目維持、変更なし)

旧 doc §4 のすべての項目を引用 (cost cap $500 / token budget / timeout 5000ms / fallback narration 等)。
変更なし、参照のみ。

### 4.10 retrieval (D-2-e3-a) との分離 (CEO 補正 3 強調)

- D-2-e3-a (retrieval provider) と D-2-e3-b (curator LLM) は **別 client** として実装
- DI で完全分離: `CuratorLLMClient` と `ProviderClient` は別 interface
- Anthropic を両方に使う場合でも、内部 client 構造は独立
- 失敗時の切り分け: provider error vs curator error を Sentry tag で分離

**将来統合の余地**: web search tool 付き LLM call で curator + retrieval を 1 call 完結する案は、本 phase では採用しない。安定運用後に A/B 比較で検討。

---

## §5 D-2-e3-c 設計: provider-based candidate source (主要書換 section)

### 5.1 着手 gate (旧 §5.1 を provider 用に書換)

- §5.2 ranking source 接続設計 (provider 経由、direct scrape なし)
- §5.3 exa source 接続設計 (D-2-e3-a の providerSelector を再利用 or 別 client)
- §5.4 personality_history source 接続設計 (Supabase、変更なし)
- §5.5 並列 timeout / fail-open priority
- §5.6 全 fail 時 UX
- §5.7 Sentry alert
- §5.8 file 配置

### 5.2 ranking source (provider 経由、direct scrape なし)

#### 5.2.1 旧設計 (direct scrape) → 新設計 (provider 経由)

| 旧 (PR #103 §5.2) | 新 (provider-based) |
|---|---|
| eiga.com / 映画.com の `https://eiga.com/now/` を direct HTTP scrape | provider に「現在日本で公開中の映画ランキング上位 N 件」を問い合わせ |
| HTML parse | provider response parse (JSON / text) |
| daily cache 24h (Supabase) | 同じく daily cache (provider ToS 許容範囲内) |

#### 5.2.2 provider 選定

D-2-e3-a の Primary provider を再利用 or 別 provider (例: ranking 専用に EXA、theater 検索専用に Anthropic)。
**CEO 判断ポイント**: ranking source も同一 provider に集約 vs source 別 provider 分散

### 5.3 EXA source

#### 5.3.1 D-2-e3-a と EXA client 共用 (推奨)

D-2-e3-a で `lib/coalter/movie/providers/exaProvider.ts` を実装する場合、D-2-e3-c でも同 client を再利用:

```typescript
// adapter で 2 sub-phase 横断
const exaClient = createExaProvider(...);
const candidatePoolDeps.exaSource = (query) => exaClient.search(query, "candidate");
const resolverDeps.exaFetcher = (input) => exaClient.search(input.title + " " + input.area, "theater");
```

cost / rate limit 集計が容易、契約 1 個で済む。

### 5.4 personality_history source (旧 §5.4 維持、変更なし)

Supabase query、external HTTP fetch なし。旧 doc §5.4 をそのまま維持。

### 5.5 並列 timeout / fail-open priority (旧 §5.5 維持)

```
const [ranking, exa, personality] = await Promise.all([
  callSourceFailOpen(rankingSource, query),    // provider 経由、3s
  callSourceFailOpen(exaSource, query),         // provider 経由、3s
  callSourceFailOpen(personalityHistorySource, query),  // Supabase、2s
]);
```

dedup は id key、`candidatePool.dedupById` の既存実装で対応。

### 5.6 全 fail 時 UX (旧 §5.6 維持)

curator placeholder → tier2_fail → altSignal で「別作品を探す」誘導。

### 5.7 Sentry alert (旧 §5.7 を provider 別に拡張)

| Alert | 閾値 |
|---|---|
| ranking provider source 失敗率 > 30% | 1h |
| exa source 失敗率 > 30% | 1h |
| personality_history 失敗率 > 30% | 1h |
| 全 3 source fail rate > 5% | 1h |
| pool 空 (curator placeholder) 比率 > 10% | 1h |

### 5.8 file 配置

```
lib/coalter/movie/sources/                  ← 新規 directory (D-2-e3-c)
  ├── rankingSource.ts                       (provider 経由、direct scrape なし)
  ├── exaSource.ts                           (D-2-e3-a の exaProvider 再利用)
  └── personalityHistorySource.ts            (Supabase、変更なし)
```

直接 HTML scrape (`https://eiga.com/now/` 等) は **本 phase 対象外**。Annex A 参照。

---

## §6 D-2-e3-d 設計: M0 lens 接続 (旧 §6 維持、変更なし)

旧 doc §6 を **完全維持**。engine.ts touch 承認 (CEO 補正で D-2-e3-d 限定許可)。
lens 不在時 fallback / 観測薄時 UX / Sentry alert / file 配置 すべて変更なし。

---

## §7 D-2-e3-e 設計: prefetch + diagnostics 仕上げ (旧 §7 維持、変更なし)

旧 doc §7 を **完全維持**。prefetch budget 500ms / cache invalidation per-session / diagnostics 6 field / Sentry alert / file 配置 すべて変更なし。

---

## §8 observation gear (旧 §8 + provider 別 alert 追加)

### 8.1 Sentry alert 一覧 (旧 11 件 + provider 別 4 件 = 15 件)

旧 doc §8.1 で示した 11 件 + 本 doc §3.10 で追加した provider 別 alert を統合:

| # | Alert | 閾値 | 出処 |
|---|---|---|---|
| 1-11 | (旧 doc §8.1 引用、theater fetcher / LLM / candidate source / lens / prefetch) | (旧 doc 通り) | (旧 doc) |
| **12** | hallucination 指標 (出典 URL 不在) > 10% | 1h | §3.10 |
| **13** | 出典 URL allowlist 外 出力比率 > 5% | 1h | §3.10 |
| **14** | provider cost 月次 80% | monthly | §3.4 |
| **15** | provider cost 月次 95% (自動 OFF) | monthly | §3.4 |

### 8.2 Discover saved query 一覧 (旧 8 件 + provider 別 2 件 = 10 件)

旧 doc §8.2 で示した 8 種 + 以下を追加:
- 出典 URL click rate (user が公式 site を再確認した比率、precision 補助指標)
- provider 別 latency / cost contribution

### 8.3 daily review 項目 (旧 §8.3 維持 + provider 関連追加)

旧 doc §8.3 + 以下:
- provider cost 月次累計 (vs $500 cap)
- 出典 URL click rate (precision 監視)
- provider 別 latency 分布

---

## §9 rollback playbook (旧 §9 維持、provider 用に拡張)

### 9.1 trigger (旧 §9.1 維持 + provider 関連)

- alert 自動検出: 旧 §9.1 alert + 本 §3.10 alert
- CEO 判断: incident review

### 9.2 rollback 手順 (旧 §9.2 維持)

env `COALTER_THREE_STAGE=false` + Production redeploy で 10-15 分以内に復帰。

### 9.3 provider 単独障害時 (本 doc 新規追加)

provider 全体停止ではなく、Primary provider のみ障害時:
- Primary を **disable** (in-memory flag、24h cool-down)
- Secondary が稼働継続 (single point of failure 回避)
- Sentry alert + CEO 通知
- 24h 後自動復帰 or CEO 手動復帰

### 9.4 rollback 後の確認 (旧 §9.3 維持)

4-layer pipeline 復帰確認 / caller 異常なし / 既存 D-1-d shadow 継続。

---

## §10 Step E 開始条件 (旧 §10 維持、provider 用に extend)

旧 doc §10 の 8 条件 + 以下:

| # | 条件 | 追加 |
|---|---|---|
| 9 | provider compliance verify 完了 (Primary + Secondary) | 本 doc §3 + source compliance doc §3 |
| 10 | 出典 URL 表示 UI 実装完了 | Product Unit |
| 11 | provider 月次 cost 監視 dashboard 完成 | Step E-0-1 |

合計 11 条件、全充足で Step E 開始可。

---

## §11 CEO 判断ポイント (本 doc PR review 時、provider 関連に書換、14 件)

| # | 論点 | 推奨 | 代替 | section |
|---|---|---|---|---|
| 1 | sub-phase 着手順 | a → b → c → d → e | 別順 (例: M0 lens を早期に通す) | §1.3 |
| 2 | Primary provider | 実装着手時に CEO + Build 既存契約調査後決定 | 本 doc PR で確定 (推奨せず) | §3.2 |
| 3 | Secondary provider | Primary と異なる provider | 同 provider の別 plan | §3.8 |
| 4 | provider 月次 cost cap | $500 (旧 §4.2 維持) | 別値 ($300 / $1000) | §3.4 |
| 5 | cache 戦略 (theater listing) | 24h cache (provider ToS 許容範囲内) or per-session | disabled | §3.5 |
| 6 | cache storage | Supabase table 新規 | in-memory のみ | §3.5 |
| 7 | 出典 URL 表示 UI 設計責任者 | Product Unit と協議 | Build 単独 | §3.6 |
| 8 | resolverDeps 4 fetcher 構造 | 案 A (exaFetcher のみ provider 経由、他 3 stub 維持) | 案 B (全 4 同 provider) / 案 C (interface 再設計) | §3.11.1 |
| 9 | curator (D-2-e3-b) と retrieval provider (D-2-e3-a) 分離 | 分離 (旧 doc § 維持、CEO 補正 3 反映) | 統合 (将来再検討) | §4.10 |
| 10 | ranking source provider | D-2-e3-a の Primary と同一 | 別 provider 分散 | §5.2.2 |
| 11 | engine.ts touch (D-2-e3-d 限定) | 承認 | 拒否 (M0 lens 別経路要設計) | §6 |
| 12 | M0 lens 不在時 fallback | placeholder lens fail-open | 4-layer pipeline fallback (sub-flag) | §6 |
| 13 | direct scraping を future で復活する条件 | provider precision 不足 or partnership 成立 | 完全廃止 (Annex A 削除) | Annex A |
| 14 | per-sub-phase PR 戦略 | 1 sub-phase = 1 PR | umbrella branch | §0 |

---

## §12 まだやらない (本 doc PR scope 外、明示)

### 12.1 本 doc PR で実装着手しないもの

- D-2-e3-a〜e 各 sub-phase 実装
- provider client コード実装 (`lib/coalter/movie/providers/` 配下)
- provider compliance verify の実 ToS fetch
- direct scraping 実装 (Annex A、本 phase 対象外)
- 実 LLM / API 接続
- M0 lens 実接続
- Production env 変更
- Sentry alert / Discover query の set 操作
- 出典 URL 表示 UI 実装
- canary 戦略の実行
- A/B 比較 framework 構築
- bug1 worktree cleanup

### 12.2 本 doc PR で書き留めるが別 PR で詳細化するもの

- provider snapshots の永続化方針 (source compliance doc §8)
- 出典 URL 表示 UI 設計 (Product Unit、別 doc)
- direct scraping 復活時の partnership 接触計画 (Annex A)

---

## Annex A: direct scraping (future candidate、現状 maintain なし)

### A.1 状態 (旧 PR #104 Annex A と統一)

CEO 判断 (2026-05-12) で **direct scraping は今すぐ進めない**。
future candidate として温存。

### A.2 復活条件

- provider-based retrieval の precision が許容範囲外と判明
- distributor との partnership / 個別合意成立
- provider cost が予算超過し、cost effective な代替が必要

### A.3 旧 §3 (D-2-e3-a direct fetcher 設計) の保留状態

PR #103 旧 §3 で起草された direct fetcher 設計:
- URL allowlist 11 domain (8 distributor + eiga + yahoo)
- SSRF / size / type / robots / rate limit / retry の direct fetch 用 design
- 4 fetcher (officialFetcher / eigaFetcher / yahooFetcher / exaFetcher) の独立 file 設計

これらは **保留**。`lib/coalter/movie/fetchers/` directory は **本 phase では作成しない**。
direct scrape 復活時に本 doc 更新 PR で再有効化。

### A.4 旧 §5 (D-2-e3-c direct ranking) の保留状態

PR #103 旧 §5.2 で起草された eiga.com / 映画.com の direct ranking scrape は **保留**。
本 phase では provider 経由 ranking で代替。

### A.5 旧 stub の維持

`lib/coalter/movie/threeStageOrchestratorAdapter.ts` の `resolverDeps` 4 stub:

```typescript
officialFetcher: async () => [],   // ← stub のまま (将来 partnership で復活)
eigaFetcher: async () => [],        // ← stub のまま
yahooFetcher: async () => [],       // ← stub のまま
exaFetcher: providerSelector(...)   // ← provider 経由で置換 (本 phase で実装、§3.11)
```

→ direct HTTP fetch を行う `fetcher` directly は **本 phase で実装しない**。
→ 将来 partnership 経由で 4 stub のうち 3 個を順次置換可能 (DI 維持により互換性あり)。

---

## 付録 A: 接続図 (provider-based 全体)

```
[PR #102: Step D structural scaffold complete (merged)]
   ↓
[PR #103: D-2-e3 external deps design review 旧 (merged、direct fetch 前提)]
   ↓
[PR #104: D-2-e3 source compliance review 旧 (merged、direct fetch 前提)]
   ↓ CEO 判断 (2026-05-12): provider-based retrieval 優先
   ↓
[本 PR: D-2-e3 provider-based revision (本 docs、2 file 更新)]
   ↓
[各 provider compliance verify (CEO + 法務 + Build)]
   ↓
[CEO 判断: provider 選定 (Primary + Secondary) + D-2-e3-a 着手 GO]
   ↓
[feat/coalter-d2e3a-provider-based branch + 実装 PR]
   ↓
[D-2-e3-b / c / d / e 順次]
   ↓
[Step E-0 (canary 準備)]
   ↓
[Step E (Production observation)]
```

---

## 付録 B: 凍結線 (handover §4.2 継承、本 doc 維持)

(旧 doc 付録 B と同一、provider-based でも touch ゼロ維持)

- `lib/coalter/webConnector.ts`
- `lib/coalter/movieCatalog.ts`
- `lib/coalter/movieRanker.ts`
- `lib/coalter/narrationBuilder.ts`
- `lib/coalter/narrationEnricher.ts`
- `lib/coalter/foodOrchestrator.ts`
- `lib/coalter/coalterDispatch.ts`
- `lib/coalter/triggerDetection.ts`
- `lib/coalter/emotion/` (全 directory)
- `lib/coalter/understanding/` (全 directory)
- `lib/coalter/presence/` (全 directory)
- Alter Morning 系 file (path-bounded grep 0 必須)

各 sub-phase 着手前に `git diff --name-only origin/main...HEAD -- <上記 file>` で 0 hits を verify する。

---

## 付録 C: 5 gate verify (旧 doc 付録 C 維持)

各 sub-phase で:
1. **typecheck**: 1099 baseline 維持
2. **vitest**: tests/unit/coalter 全 PASS
3. **build**: `npm run build` BUILD_EXIT=0
4. **凍結線 grep**: 付録 B file 全 0 touched
5. **Alter Morning grep**: 0 hits

---

## 付録 D: PR #103 旧 doc との対応関係

| PR #103 旧 section | 本 doc 対応 section | 変更内容 |
|---|---|---|
| §0 目的 / scope | §0 (revision を明示) | provider-based 前提に変更 |
| §1 全体図 (5 sub-phase) | §1 (sub-phase 名称維持、内容差替) | a / c を provider-based に書換 |
| §2 共通設計原則 | §2 (DI / fail-open / 観測 / rollback) + §2.3 provider-agnostic + §2.4 curator/retrieval 分離 | provider 関連原則追加 |
| §3 D-2-e3-a 設計: 4 theater fetcher (direct) | §3 D-2-e3-a 設計: provider-based retrieval (主要書換) | direct → provider |
| §4 D-2-e3-b 設計: 実 LLM | §4 (旧維持 + 分離強調) | retrieval と分離明示 |
| §5 D-2-e3-c 設計: 3 candidate source (direct) | §5 D-2-e3-c 設計: provider-based candidate source (書換) | ranking を provider 経由に |
| §6 D-2-e3-d 設計: M0 lens | §6 (旧維持) | 変更なし |
| §7 D-2-e3-e 設計: prefetch + diagnostics | §7 (旧維持) | 変更なし |
| §8 observation gear (11 alert / 8 query) | §8 (15 alert / 10 query に拡張) | provider 別 alert 追加 |
| §9 rollback playbook | §9 (旧維持 + provider 単独障害追加) | provider 単独障害対応追加 |
| §10 Step E 開始条件 (8) | §10 (11 条件に拡張) | provider verify 完了等追加 |
| §11 CEO 判断ポイント (12 件) | §11 (14 件に拡張) | provider 関連追加 |
| §12 まだやらない | §12 (provider client 実装含む) | provider 関連追加 |
| (新規) Annex A | Annex A direct scraping future candidate | 旧 §3 / §5 direct fetch を降格 |
| 付録 A 接続図 | 付録 A | provider 経由経路追加 |
| 付録 B 凍結線 | 付録 B (維持) | - |
| 付録 C 5 gate verify | 付録 C (維持) | - |
| (新規) 付録 D | 付録 D PR #103 対応関係 | 旧 doc との対応明示 |

PR #103 の **全 設計原則** は本 doc でも維持。direct fetch 部分のみ provider-based に書換、その他は維持。
