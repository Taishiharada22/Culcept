# CoAlter D-2-e3 External Dependencies Design Review

**Status**: Draft (docs-only, design review)
**Branch**: `docs/coalter-d2e3-external-deps-review`
**Base**: `main` (HEAD `dddfd664`、PR #102 merge 後)
**前提**: Step D structural scaffold complete (D-1-a 〜 D-2-e2 計 10 commit / PR #102 merged)
**本 doc PR の scope**: docs-only。**実装着手なし**、外部接続設計を docs として固定する。
**生成日**: 2026-05-12

---

## §0 本 doc の目的と scope

### 0.1 目的

CoAlter movie domain 三段式本線 (D-2-e2 時点で structural scaffold complete) の **外部依存を実接続するための設計** を docs として固定する。

D-2-e3 は実 fetcher / 実 LLM / candidate source / M0 lens 接続を含む **高リスク phase**。**設計を先に凍結してから sub-phase 単位で実装する** ことで、SSRF / rate limit / robots / cost 暴走 / latency / failure cascading 等のリスクを管理する。

### 0.2 scope

- 4 sub-phase (a / b / c / d) の外部接続設計 + 1 sub-phase (e) の仕上げ設計
- SSRF 対策 / URL allowlist / timeout / content-size / content-type / robots / rate limit / retry / fail-open / Sentry alert / cost 上限 / M0 lens 接続方針 / candidate source 接続方針
- 各 sub-phase の **着手 gate** (この設計項目が固まらないと sub-phase 実装着手しない)
- rollback playbook
- Step E (Production observation) 開始条件

### 0.3 非 scope (本 doc では確定しない)

- 実装コード (各 sub-phase 別 branch / 別 PR で実装)
- Production env 変更
- Sentry / Discover の実際の set 操作 (Step E-0-1 で別途)
- canary 戦略の詳細具体化 (Step E-0-2 で別途)
- A/B 比較 framework 構築 (Step E-0-3、optional)

### 0.4 本 doc PR merge で確定するもの

| 確定事項 | 影響 |
|---|---|
| 各 sub-phase の責務境界 | 実装着手時の scope 線引き |
| 外部接続の安全境界 (allowlist / SSRF / size / type 等) | 実装着手時のチェックリスト |
| 各 sub-phase の着手 gate | CEO が「この sub-phase を始めて良いか」を判断する基準 |
| Sentry alert / Discover query / daily review 項目 | Step E-0-1 で set する観測 gear の仕様 |
| rollback playbook | incident 発生時の操作手順 |
| Step E 開始条件 | Step E 着手時の judgement 基準 |

---

## §1 D-2-e3 全体図

### 1.1 5 sub-phase 概要 + 着手順 (リスク低 → 高)

```
D-2-e3-a  4 theater fetcher 実接続     [外部 HTTP fetch / parse]
   ↓
D-2-e3-b  CuratorLLMClient 実接続       [既存 runAI 流用 / cost / token]
   ↓
D-2-e3-c  3 candidate source 実接続     [HTTP + EXA API + Supabase]
   ↓
D-2-e3-d  M0 lens 実接続                [engine.ts touch 要 / 高 latency]
   ↓
D-2-e3-e  prefetch wiring + diagnostics [adapter 仕上げ / 観測値 fill]
```

着手順の根拠:
- **a 先行**: theater fetcher は theaterResolver の既存 fail-open で多重防御済、最も独立性高い
- **b 次**: LLM は既存 runAI ライブラリで実績あり、コスト管理だけが論点
- **c 中間**: 3 source は internal (Supabase) + external (HTML scrape / EXA) 混在
- **d 高リスク**: engine.ts touch + lens 取得 latency 増 + 新規ペアでの不安定さ
- **e 最終**: 他 sub-phase 完了後の adapter 仕上げ

### 1.2 各 sub-phase の責務 (sub-phase 間で重複させない)

| Sub-phase | 責務 | 触ってよい file |
|---|---|---|
| a | `theaterResolver` deps stub → real 置換 | `lib/coalter/movie/fetchers/` 配下 (新規) + `threeStageOrchestratorAdapter.ts` + tests |
| b | `CuratorLLMClient` stub → real (`runAI` 経由) 置換 | `lib/coalter/movie/curatorLLMClientImpl.ts` (新規) + `threeStageOrchestratorAdapter.ts` + tests |
| c | `candidatePoolDeps` 3 source stub → real 置換 | `lib/coalter/movie/sources/` 配下 (新規) + `threeStageOrchestratorAdapter.ts` + tests |
| d | M0 lens 注入 (engine.ts touch、`MovieOrchestratorInput.lens` additive 追加) | `lib/coalter/engine.ts` + `lib/coalter/movieOrchestrator.ts` (input type 拡張のみ) + `threeStageOrchestratorAdapter.ts` + tests |
| e | prefetch wiring + diagnostics 6 field 実値 fill | `threeStageOrchestratorAdapter.ts` のみ |

### 1.3 全 sub-phase 共通の凍結線

各 sub-phase は **以下に touch してはいけない**:

- `lib/coalter/webConnector.ts` (parseMovieScreenings / NEAR_WINDOW / theater regex)
- `lib/coalter/movieCatalog.ts` (三段式 §11.A 禁触)
- `lib/coalter/movieRanker.ts` (`missing_where` hard drop L166)
- `lib/coalter/narrationBuilder.ts` / `narrationEnricher.ts`
- `lib/coalter/foodOrchestrator.ts` / `coalterDispatch.ts` / `triggerDetection.ts`
- `lib/coalter/emotion/` / `understanding/` / `presence/` (全 directory)
- Alter Morning 系 file (path-bounded grep 0 必須)
- `lib/coalter/movieOrchestrator.ts` (a/b/c/e では touch なし、**d のみ input type 追加のみ touch 許可**)
- `lib/coalter/engine.ts` (**d のみ touch 許可、他 sub-phase は touch なし**)

### 1.4 全 sub-phase 共通の制約

- `COALTER_THREE_STAGE` flag default OFF 維持
- Production env 変更なし
- console.info / telemetry / persistence 追加なし (各 sub-phase の Sentry / Discover は Step E-0-1 で別途)
- 5 gate (typecheck baseline / vitest / build / 凍結線 grep / Alter Morning grep) 必須
- 1 sub-phase = 1 PR、CEO 判断後に push GO

---

## §2 共通設計原則

### 2.1 DI 維持

D-2-e1 / D-2-e2 で確立した DI 構造を維持する:
- `TheaterResolverDeps` (4 fetcher)
- `CuratorLLMClient` (LLM)
- `CandidatePoolDeps` (3 source)
- `ThreeStagePipelineDeps` で集約

D-2-e3 では adapter で stub → real を inject するだけ。pipeline / pure logic 部分は touch なし。

### 2.2 fail-open 既存方針継承

各 sub-module で実装済の fail-open は touch なし:
- `theaterResolver.callFetcherFailOpen` (個別 fetcher の throw を握り潰し)
- `candidatePool.callSourceFailOpen` (個別 source の throw を握り潰し)
- `curator` (LLM throw / parse 失敗 → fallback narration)
- `areaExpansion` (resolver 失敗 → 次 area へ)
- `tierFailNarration` (Tier 2 fail → alt narration)

実 fetcher / 実 LLM / 実 source も同じ fail-open に乗る。

### 2.3 観測可能性 (Sentry / Discover)

各 sub-phase で observe するべき指標 (実 set は Step E-0-1):
- 失敗率 (per-source / per-fetcher)
- latency 分布 (p50 / p95 / p99)
- cost (LLM token / API call)
- diagnostics 6 field の分布

### 2.4 rollback 1-click

`COALTER_THREE_STAGE=false` + Production redeploy で即座に pre-D-2-e2 状態 (4-layer pipeline のみ稼働) に復帰。コード revert 不要。

---

## §3 D-2-e3-a 設計: 4 theater fetcher 外部接続

### 3.1 着手 gate (この §3 全項目が CEO 承認されないと D-2-e3-a 着手しない)

- §3.2 URL allowlist
- §3.3 SSRF 対策
- §3.4 timeout
- §3.5 content-size 制限
- §3.6 content-type whitelist
- §3.7 robots / ToS 確認
- §3.8 rate limit / retry policy
- §3.9 HTML 構造変動時 fail-open
- §3.10 Sentry alert
- §3.11 file 配置 + DI 設計

### 3.2 URL allowlist (per-fetcher)

| Source | Allowed URL pattern | 動的 / 静的 | 入力検証 |
|---|---|---|---|
| `officialFetcher` | candidate.officialUrl が source、入力時 allowlist 検証 (登録 distributor のみ) | 動的 (distributor 提供) | URL → hostname 抽出 → distributor allowlist 照合 |
| `eigaFetcher` | `https://eiga.com/movie/{id}/` の path pattern のみ | 静的 (固定 base) | path pattern 正規表現照合 |
| `yahooFetcher` | `https://movies.yahoo.co.jp/movie/{id}/` の path pattern のみ | 静的 (固定 base) | path pattern 正規表現照合 |
| `exaFetcher` | EXA API client 経由 (URL 直接接続なし) | 既存 API client | 不要 (API client 内部で control) |

#### 3.2.1 公式 fetcher 用 distributor allowlist (初期)

主要 distributor のみ初期登録 (合意 + 公開情報の範囲確認後)。
推奨初期 list:
- toho.co.jp (東宝)
- shochiku.co.jp (松竹)
- toei.co.jp (東映)
- sonypictures.jp (Sony Pictures Japan)
- warnerbros.co.jp (Warner Bros. Japan)
- disney.co.jp (Disney Japan)
- gaga.co.jp (ギャガ)
- bitters.co.jp (Bitters End)

各 distributor は ToS / robots.txt を別 doc (`docs/coalter-d2e3-source-compliance.md`) で永続化する (D-2-e3-a 着手前に作成)。

#### 3.2.2 allowlist 違反時の挙動

- `officialFetcher` に渡された URL が allowlist 外 → 空配列を返す (fail-open)、Sentry warning emit (SSRF 試行可能性)
- log は URL hostname のみ (full URL は PII / sensitive 可能性)

### 3.3 SSRF 対策

各 fetcher の HTTP fetch 前に必須:

1. **protocol whitelist**: `https:` のみ許可 (http: / ftp: / file: / data: 全拒否)
2. **hostname resolution**: DNS resolve 後の IP を以下 prefix で拒否
   - IPv4: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`
   - IPv6: `::1/128`, `fc00::/7` (ULA), `fe80::/10` (link-local), `::/128` (unspecified)
3. **localhost 文字列拒否**: hostname に `localhost`, `local.`, `internal.`, `.internal`, `.local` を含む場合拒否
4. **DNS rebinding 対策**: fetch 直前に再度 IP resolve、初回と異なる IP に解決された場合は拒否
5. **redirect 制限**: HTTP 3xx redirect は **最大 3 回**、各 redirect 先にも上記 1-4 を適用

#### 3.3.1 共通 wrapper 設計

各 fetcher は内部で `safeFetch(url, options)` という共通 wrapper を経由する想定:

```typescript
// lib/coalter/movie/fetchers/safeFetch.ts (新規、D-2-e3-a で実装)
async function safeFetch(url: string, options: SafeFetchOptions): Promise<SafeFetchResult>
//   1. protocol / hostname / DNS resolve check (SSRF 防御)
//   2. fetch with timeout + max content-size + content-type 検証
//   3. redirect は max 3、各 redirect 先も再 check
//   4. 失敗時は throw、caller (fetcher) の fail-open に倒れる
```

`safeFetch` は単独 unit test 対象 (mock HTTP + SSRF 各種 case)。

### 3.4 timeout (per-fetcher)

| Fetcher | timeout | 根拠 |
|---|---|---|
| `officialFetcher` | 5s | 公式 site は応答速度ばらつき大 |
| `eigaFetcher` | 5s | 構造化 HTML、parseしやすい |
| `yahooFetcher` | 5s | 同上 |
| `exaFetcher` | 5s | 既存 API client、API 側で timeout 制御 |

Tier 0 / Tier 1 で同 fetcher が複数回呼ばれる場合、各 invocation で個別 timeout (累積ではない)。Stage 3 全体 budget は別途 prefetch (D-2-d) で管理。

timeout 超過 → throw → theaterResolver `callFetcherFailOpen` で握り潰し → 次 source へ。

### 3.5 content-size 制限

| 種別 | 上限 | 根拠 |
|---|---|---|
| HTML body | **1 MB** (gzipped) / 4 MB (uncompressed) | 大半の映画情報ページは 500KB 未満 |
| JSON (EXA) | 256 KB | API response 上限 |

`safeFetch` 内で stream 読み込み中に size 監視、超過時 stream abort + throw。

#### 3.5.1 gzip bomb 対策

- compressed 1MB → uncompressed 4MB 超過 detection
- decompression 中に uncompressed size 監視

### 3.6 content-type whitelist

| Content-Type | 許可 fetcher |
|---|---|
| `text/html` | official / eiga / yahoo |
| `application/xhtml+xml` | official / eiga / yahoo |
| `application/json` | exa |
| その他 | **全 fetcher で拒否** |

charset は UTF-8 / Shift_JIS / EUC-JP のみ許可 (eiga / yahoo の日本語 HTML 想定)。

content-type spoofing (extension mismatch) 検出時は throw。

### 3.7 robots / ToS 確認方針

#### 3.7.1 確認手順

D-2-e3-a 着手前に `docs/coalter-d2e3-source-compliance.md` を別 doc で起草:
- 各 source (distributor / eiga / yahoo) の robots.txt 確認結果
- 各 source の ToS (利用規約) の scrape 関連条項抜粋
- legal team / CEO 確認結果 (該当する場合)
- 確認日時 + 確認者 (audit trail)

#### 3.7.2 拒否時の取扱

- robots.txt が `Disallow: /movie/*` 等で対象 path を禁止 → 該当 fetcher を **allowlist から除外**
- ToS が scrape 禁止 → 同上
- 不明 → CEO 判断要請、fetch しない

#### 3.7.3 公開情報 / 私的利用 / fair use の範囲

本実装は商用提供サービス (Aneurasync) 内の機能のため、公開ページの scrape でも distributor / source の合意が望ましい。
- distributor: 個別合意可能 (営業活動)
- eiga / yahoo: 一般公開情報の範囲、頻度を抑制 (§3.8 rate limit)
- CEO 最終判断ポイント (§11)

### 3.8 rate limit / retry policy

#### 3.8.1 per-domain rate limit

| Domain | rate cap | 単位 |
|---|---|---|
| eiga.com | 10 req/min | 全 Production trafic 合計 |
| movies.yahoo.co.jp | 10 req/min | 同上 |
| 各 distributor 公式 | 5 req/min/domain | 同上 |
| api.exa.ai | 既存 API rate (別途 monitor) | - |

実装: per-domain in-memory token bucket (Vercel serverless では process 永続なし → cross-invocation 制御不可)。
→ 代替: 各 invocation で同 domain への request を 1 回に制限 (sufficient for Step D 三段式設計、複数候補で同 domain には dedup cache 利用)。

#### 3.8.2 dedup cache (同一 invocation 内)

per-session in-memory cache (30s TTL):
- key: `(domain, path)`
- value: fetch result
- 効果: 同一作品の Tier 0 + Tier 1 が同 fetcher で重複した場合に skip

実装: adapter `runThreeStageScaffoldPath` 内で Map を持ち、resolverDeps inject 時に wrap。

#### 3.8.3 retry policy

| Status / Error | retry | 根拠 |
|---|---|---|
| 200 OK | - | 成功 |
| 3xx redirect | 自動追従 (max 3) | safeFetch 内 |
| 4xx (404 / 410 等) | **retry なし** | resource 不在、retry 無意味 |
| 429 Too Many Requests | exponential backoff (1s → 2s → 4s)、最大 3 回 | rate limit 緩和 |
| 5xx | 1 回 retry (1s 後) | 一時障害 |
| network error / timeout | **retry なし** (即 fail-open) | latency 累積回避 |

retry 中も timeout (§3.4) はリセットされず累積カウント。

### 3.9 HTML 構造変動時 fail-open

#### 3.9.1 parse 失敗の握り潰し

- 各 fetcher 内で regex / DOM parse 失敗 → throw
- `theaterResolver.callFetcherFailOpen` で内部 catch (既存)
- 結果: 空配列 → 次 source へ fallback (既存 B2 構造 gate)

#### 3.9.2 部分 parse の取扱

- HTML 全体は取れたが theater field だけ抽出失敗 → 当該 candidate を skip (空配列に倒す)
- 他 candidate は parse 続行 (1 page 内に複数 theater listing がある場合)

#### 3.9.3 alert (構造変動 detection)

`§3.10 Sentry alert` に統合。

### 3.10 Sentry alert (D-2-e3-a 関連、Step E-0-1 で set)

| Alert | 閾値 | reaction |
|---|---|---|
| 公式 fetcher 失敗率 > 30% | 1h window | HTML 構造変動疑い、parse regex 調査 |
| eiga fetcher 失敗率 > 30% | 1h window | 同上 |
| yahoo fetcher 失敗率 > 30% | 1h window | 同上 |
| exa fetcher 失敗率 > 30% | 1h window | API 障害可能性、EXA console 確認 |
| 4 fetcher 全 fail rate > 20% | 1h window | 緊急、SSRF or DNS 障害可能性、CEO 通知 |
| SSRF 試行検出 (allowlist 違反) | 即時 | **CEO + security 通知** |
| timeout 比率 > 25% | 1h window | latency / network 障害 |

### 3.11 file 配置 + DI 設計

```
lib/coalter/movie/fetchers/
  ├── safeFetch.ts          (共通 HTTP wrapper、SSRF / size / type)
  ├── officialFetcher.ts    (distributor 公式サイト parse)
  ├── eigaFetcher.ts        (eiga.com parse)
  ├── yahooFetcher.ts       (movies.yahoo.co.jp parse)
  ├── exaFetcher.ts         (EXA API client 経由)
  └── allowlist.ts          (URL allowlist / distributor 一覧)
```

D-2-e3-a で adapter (`threeStageOrchestratorAdapter.ts`) を修正、`resolverDeps` の 4 stub を上記 fetcher に置換。

---

## §4 D-2-e3-b 設計: 実 LLM 接続

### 4.1 着手 gate (この §4 全項目が CEO 承認されないと D-2-e3-b 着手しない)

- §4.2 cost 上限 (per-event / daily / monthly)
- §4.3 timeout
- §4.4 retry policy
- §4.5 failure fallback
- §4.6 token budget
- §4.7 prompt 制御
- §4.8 Sentry alert + cost monitoring
- §4.9 file 配置

### 4.2 cost 上限

| 単位 | 上限 | reaction |
|---|---|---|
| per-event input | 4000 tokens | prompt 構築時に pool を上位 N 件に truncate |
| per-event output | 1500 tokens | LLM 側 max_tokens で制御 |
| daily per-user | 50 events | 51 件目以降は 4-layer pipeline fallback (sub-flag 追加) — D-2-e3-b 着手時 CEO 判断 |
| daily global | 5000 events | 超過で **自動 OFF** (circuit breaker) |
| monthly cost | $500 cap (推定 $0.025/event × 20000 events) | 80% (= $400) で **CEO 通知**、95% (= $475) で **自動 OFF** |

cost 計算は input × $0.003/1K + output × $0.015/1K (Claude Sonnet 想定) ベース、実値は実 LLM 接続後 monitoring 必要。

### 4.3 timeout

- LLM call 全体: **5000ms**
- timeout → throw → curator の既存 fallback narration へ (D-1-c 実装)

curator は重要な path のため、tight にしすぎない。既存 D-1-d shadow で `runMovieCuratorShadow` が同 timeout 3500ms 使用、本実装は若干緩めの 5000ms を採用。

### 4.4 retry policy

- **retry なし** (timeout に倒れたら即 fallback、追加 latency 避ける)
- 429 受信時のみ exponential backoff (1s → 2s)、2 回失敗で fallback

### 4.5 failure fallback

- LLM throw / timeout / parse 失敗 → curator 内部 fallback narration (既存 D-1-c)
- post-event: Sentry log + Discover query で観測
- curator diagnostics の `llmCallSucceeded: false` + `fallbackUsed: true` で観測

### 4.6 token budget

```
system prompt: 800 tokens (curator.ts:buildSystemPrompt の固定文)
user prompt:   3200 tokens
  ├── lens 引用: 1000 tokens
  ├── query: 200 tokens
  ├── movieDomain (optional): 500 tokens
  └── candidate pool: 1500 tokens (上位 ~15 件、各 ~100 tokens)
response:      1500 tokens
─────────────────────────
total:         5500 tokens / event
```

pool が 15 件を超える場合は curator の入力時に truncation (D-2-e3-b 実装範囲、curator.ts 修正なし、adapter で前処理)。

### 4.7 prompt 制御

curator.ts の `buildSystemPrompt` / `buildUserPrompt` は **D-2-e3-b で touch なし** (D-1-c で凍結済、変更は別 phase)。
adapter は LLM client wrapper の作り方のみ変える。

### 4.8 Sentry alert + cost monitoring

| Alert | 閾値 | reaction |
|---|---|---|
| LLM 失敗率 > 15% | 1h window | LLM 接続障害 / prompt 問題 |
| LLM p99 latency > 8s | 1h window | LLM 高負荷 / model 変更 |
| daily cost > $20 (= $500/25日 想定 burst) | daily | CEO 通知 |
| monthly cost > $400 (80%) | monthly | CEO 通知 |
| monthly cost > $475 (95%) | monthly | **自動 OFF** + CEO 緊急通知 |

### 4.9 file 配置

```
lib/coalter/movie/curatorLLMClientImpl.ts   (新規、runAI → CuratorLLMClient wrapper)
```

D-2-e3-b で adapter を修正、`llmClient` stub を上記 wrapper に置換。

---

## §5 D-2-e3-c 設計: 3 candidate source

### 5.1 着手 gate

- §5.2 ranking source 接続設計
- §5.3 exa source 接続設計
- §5.4 personality_history source 接続設計
- §5.5 並列 timeout / fail-open priority
- §5.6 全 fail 時 UX
- §5.7 Sentry alert
- §5.8 file 配置

### 5.2 ranking source (映画.com / eiga.com)

#### 5.2.1 URL allowlist + SSRF

§3 の `safeFetch` を流用、URL pattern を ranking 用に拡張:
- `https://eiga.com/now/` (現在上映中ランキング)
- `https://eiga.com/coming/` (公開予定、必要に応じて)

§3.3 SSRF 対策 / §3.4 timeout (5s) / §3.5 content-size / §3.6 content-type / §3.7 robots / §3.8 rate limit 全て継承。

#### 5.2.2 cache 戦略

- daily cache (24h TTL): ranking は日 1 回更新で十分
- cache storage: in-memory (per-deploy) or Supabase table (`movie_ranking_cache`、新規) — D-2-e3-c 着手時 CEO 判断
- 推奨: Supabase table、deploy 跨りで cache 共有

#### 5.2.3 parse 失敗

- §3.9 fail-open 継承、空配列 → 他 source で進行

### 5.3 exa source

#### 5.3.1 既存 EXA API client 流用

(本 doc 起草時点で EXA client の具体位置は未確認、D-2-e3-c 着手時に調査)。
既存 `lib/coalter/webConnector.ts` の searchAndFilter 関連で EXA を使っている可能性。
**注意**: webConnector は凍結線、touch なし。EXA client は別 file / 別 import で利用する。

#### 5.3.2 search query 構築

- query は `MovieQuery` (D-1-a 出力) から構築:
  - `mood` + `weight` + `length_minutes_max` + `couple_fit_hints`
- `exclude` キーワード (veto_guard) は query 内で排除

#### 5.3.3 cost monitoring

- per-event 1 EXA call
- daily call count を Sentry / Discover で監視

### 5.4 personality_history source

#### 5.4.1 Supabase query 設計

```sql
-- 過去 90 日の coalter_proposal_quality_records から
-- theme='movie' で userAction='adopted' の作品を取得
SELECT card->>'candidates' AS adopted_candidates
FROM coalter_proposal_quality_records
WHERE
  theme = 'movie'
  AND userAction = 'adopted'
  AND created_at > now() - interval '90 days'
  AND (user_a = $user_a OR user_b = $user_a)
ORDER BY created_at DESC
LIMIT 50;
```

(実テーブル / column 名は D-2-e3-c 着手時に確認)。

#### 5.4.2 Stargazer profile 利用

- `profileA.interests` / `profileB.interests` から genre affinity を抽出
- `archetypeCode` を補助 signal として使う (curator が拾える)

#### 5.4.3 timeout

- Supabase query: **2s** (DB なので速い想定)

#### 5.4.4 新規ペア

- 履歴 0 件 / profile 観測薄 → 空配列を返す (fail-open)

### 5.5 並列 timeout / fail-open priority

```
const [ranking, exa, personality] = await Promise.all([
  callSourceFailOpen(rankingSource, query),    // 3s
  callSourceFailOpen(exaSource, query),         // 3s
  callSourceFailOpen(personalityHistorySource, query),  // 2s
]);
```

既存 `candidatePool.buildCandidatePool` の `Promise.all` 構造を維持。

優先順 (concat 順、既存):
1. ranking
2. exa
3. personality_history

dedup は id key で実装済 (`dedupById`)。

### 5.6 全 fail 時 UX

- 3 source 全 fail → pool 空 → curator placeholder (`(候補なし)`) → tier2_fail
- UI は「候補が見つかりませんでした、条件を変えてみてください」を表示 (既存 D-1-c 実装)
- alert: 全 source fail rate > 5% で監視 (§5.7)

### 5.7 Sentry alert

| Alert | 閾値 |
|---|---|
| 全 3 source fail rate > 5% | 1h window |
| ranking source fail rate > 30% | 1h window |
| exa source fail rate > 30% | 1h window |
| personality_history fail rate > 30% | 1h window |
| pool 空 (curator placeholder) 比率 > 10% | 1h window |

### 5.8 file 配置

```
lib/coalter/movie/sources/
  ├── rankingSource.ts             (eiga.com / 映画.com HTML scrape)
  ├── exaSource.ts                 (EXA API client wrapper)
  ├── personalityHistorySource.ts  (Supabase query)
  └── cache.ts                     (Supabase 経由 daily ranking cache、optional)
```

D-2-e3-c で adapter を修正、`candidatePoolDeps` の 3 stub を置換。

---

## §6 D-2-e3-d 設計: M0 lens 接続

### 6.1 着手 gate

- §6.2 engine.ts touch 承認
- §6.3 MovieOrchestratorInput 型拡張 (additive `lens?` field)
- §6.4 lens 取得 timeout
- §6.5 lens 不在時 fallback
- §6.6 lens 観測薄時 UX
- §6.7 Sentry alert
- §6.8 file 配置

### 6.2 engine.ts touch 承認 (CEO 判断要)

D-2-e3-d は engine.ts touch が **必須** (現状 `runMovieShadowUnderstanding` は shadow fire-and-forget、本流接続には await + lens 取得が必要)。

**CEO 判断ポイント 1**: engine.ts を D-2-e3-d 限定で凍結解除する。
他 sub-phase (a / b / c / e) では engine.ts touch なしを維持。

### 6.3 MovieOrchestratorInput 型拡張 (additive)

```typescript
export interface MovieOrchestratorInput {
  // ... 既存 7 field ...
  /**
   * [D-2-e3-d 2026-MM-DD] Stage 1 Understand 出力 (optional)。
   * - 不在時 (新規ペア / shadow disabled / 失敗) → adapter で placeholder lens fallback
   * - flag OFF 時は本 field を使わない (4-layer pipeline 不変性継承)
   */
  lens?: TwoPersonLensToday;
}
```

`movieOrchestrator.ts` は input field 追加のみ touch (additive)。
flag OFF 時の挙動は不変 (lens を読まずに 4-layer pipeline へ)。

### 6.4 lens 取得 timeout

- `collectLiveBundle` + `runUnderstanding` 合計: **10s**
- timeout → placeholder lens fallback (D-2-e2 同等)

engine.ts 側で `Promise.race` で lens を取得、timeout 時は undefined を `MovieOrchestratorInput.lens` に渡す。

### 6.5 lens 不在時 fallback

| 状況 | adapter の挙動 |
|---|---|
| `input.lens` undefined | placeholder lens (D-2-e2 と同等) で `runThreeStagePipeline` 起動 |
| `input.lens` 存在 | 実 lens を使用 |
| `understandingShadowMovie` flag OFF | engine.ts で lens 取得 skip → `input.lens` undefined → adapter で placeholder |

**CEO 判断ポイント 2**: lens 不在時の fallback 戦略
- (a) placeholder lens fail-open (推奨、現状 D-2-e2 と同等)
- (b) 4-layer pipeline へ自動 fallback (sub-flag 追加、`COALTER_THREE_STAGE_REQUIRES_LENS=true` 等)

推奨: (a) — UX 一貫性、(b) は 4-layer / 三段式 の output 揺れを生む。

### 6.6 lens 観測薄時 UX

- `understanding_confidence < 0.5` を「観測薄」と判定
- diagnostics に `lensConfidence: number` を追加 (D-2-e3-d で diagnostics 6 field → 7 field 拡張、または別 field 経由)
- 観測薄比率を Sentry / Discover で監視

curator の出力品質が落ちる可能性:
- G3 (5 要素必須) は満たすが、generic な内容になる
- G6 (lens 引用) coverage が低くなる
- → UI に「使うほどおふたりの理解が深まります」表示 (任意、別 phase)

### 6.7 Sentry alert

| Alert | 閾値 |
|---|---|
| lens 取得失敗率 > 20% | 1h window |
| lens 観測薄比率 > 50% | daily |
| lens 取得 p99 latency > 15s | 1h window |

### 6.8 file 配置

```
lib/coalter/engine.ts                       (touch、shadow → live 切替え)
lib/coalter/movieOrchestrator.ts           (touch、input.lens? additive 追加)
lib/coalter/movie/threeStageOrchestratorAdapter.ts  (touch、input.lens を使う)
```

new file 不要、既存 file の additive touch のみ。

---

## §7 D-2-e3-e 設計: prefetch wiring + diagnostics 仕上げ

### 7.1 着手 gate

- §7.2 prefetch budget
- §7.3 cache invalidation
- §7.4 diagnostics 6 field 実値 fill
- §7.5 Sentry alert
- §7.6 file 配置

### 7.2 prefetch budget

- **500ms cap** (Stage 3 expand cost 削減目的)
- 超過 → cache miss、Stage 3 expand 通常実行
- adapter で curator 完了直後に `prefetchStage3` を起動、`runThreeStagePipeline` に渡す

### 7.3 cache invalidation

- **per-session** (一 invocation 内のみ)
- 次 invocation で再 fetch (theater 上映情報は時間変動)
- 共有 cache (Vercel KV / Redis) は **採用しない** (一貫性問題回避、複雑度抑制)

### 7.4 diagnostics 6 field 実値 fill

D-2-e1 で field 確定済 (`ThreeStageDiagnostics` 6 field):
| Field | D-2-e3-e で fill する値 |
|---|---|
| `stage2CandidateRawCount` | `poolResult.diagnostics.rawTotal` |
| `stage2CandidateFilteredCount` | `poolResult.diagnostics.softFilterPassed` |
| `stage3PrefetchCacheHit` | adapter で実値 (true / false) |
| `stage3FallbackSourceUsed` | `areaResult.stage3FallbackSourceUsed` |
| `stage3AreaTier` | `areaResult.tier` |
| `stage3State` | `areaResult.state` |

`buildThreeStageDiagnostics` helper (D-2-e1 実装) で自動構築、adapter で渡す。

### 7.5 Sentry alert

| Alert | 閾値 |
|---|---|
| prefetch cache hit rate < 30% | 1h window | prefetch 効果不足、戦略再考 |
| diagnostics 欠落 (field null) | 即時 | adapter bug |

### 7.6 file 配置

```
lib/coalter/movie/threeStageOrchestratorAdapter.ts  (touch のみ、新規 file なし)
```

---

## §8 observation gear (Sentry alert / Discover query / daily review)

本 §8 は Step E-0-1 で **set 操作** する観測 gear の **仕様** を本 doc PR で固定する。
**set 操作 (Sentry alert 作成 / Discover saved query 作成 / Slack channel 設定) は本 doc PR では行わない**。

### 8.1 Sentry alert 一覧 (10 件、§3〜§7 集約)

| Alert | 閾値 | 出処 |
|---|---|---|
| 公式 fetcher 失敗率 > 30% | 1h | §3.10 |
| eiga / yahoo / exa fetcher 失敗率 > 30% | 1h | §3.10 (3 件、まとめて 1 行) |
| 4 fetcher 全 fail rate > 20% | 1h | §3.10 |
| SSRF 試行検出 | 即時 | §3.10 (緊急通知) |
| LLM 失敗率 > 15% | 1h | §4.8 |
| LLM monthly cost > 80% / 95% | monthly | §4.8 (2 段階) |
| 全 candidate source fail rate > 5% | 1h | §5.7 |
| lens 取得失敗率 > 20% | 1h | §6.7 |
| prefetch cache hit rate < 30% | 1h | §7.5 |

総数: 約 11 alert (実 set 数は Step E-0-1 で確定)。

### 8.2 Discover saved query 一覧 (8 件)

| Query | 用途 | 出処 |
|---|---|---|
| 三段式 daily summary | 日次レビュー (全 sub-phase 集約) | §8 |
| tier 別 success counts | tier 0/1/2 比率 | §1 / D-2-e1 diagnostics |
| source 別 contribution | fallback chain analysis | D-2-a diagnostics |
| LLM cost / call count | budget monitoring | §4 |
| prefetch effectiveness | cache hit rate | §7 |
| area expansion incidents | tier 2 fail cause | D-2-b diagnostics |
| candidate source contribution | 3 source 別 contribution | §5 |
| lens observation strength | lens confidence 分布 | §6 |

### 8.3 daily review 項目 (Step E 期間中の運用)

- alert 11 件の発生状況 (resolved / open)
- Discover query 8 種の値変化 (前日比 / 前週比)
- canary 段階 (staging / 1% / 10% / 50% / 100%) の進捗
- LLM cost 累積 (月次 budget 比)
- incident report (発生時のみ)
- CEO 確認事項 (次の段階に進む / rollback / 継続観測)

---

## §9 rollback playbook

### 9.1 trigger

- alert 自動検出 (automatic):
  - 緊急: SSRF 試行 / LLM cost 95% / 4 fetcher 全 fail
  - 重要: tier2FailRate > 40% / latency p99 > 30s
- CEO 判断 (manual): incident review / 観測指標悪化

### 9.2 rollback 手順

| Step | 操作 | 想定時間 |
|---|---|---|
| 1 | Vercel console で env `COALTER_THREE_STAGE` を `false` に set (or 削除) | 30s |
| 2 | Production redeploy (自動 or trigger) | 1-3 min |
| 3 | Sentry / Discover で 4-layer pipeline 経路再稼働を confirm | 5 min |
| 4 | engine.ts log で `useMovieV2 → 4-layer pipeline` 経路の invocation を 5 件確認 | 5 min |
| 5 | incident report 起草 (`docs/incidents/YYYY-MM-DD-d2e3-rollback.md`) | 30 min |

総 rollback 時間目安: **約 10-15 分** (Production redeploy が律速)。

### 9.3 rollback 後の確認事項

- 4-layer pipeline 復帰確認 (1 invocation でも `generateMovieProposalV2` 経由を confirm)
- caller (engine.ts) 異常なし (movie theme で正常 response 返却)
- 既存 D-1-d shadow path (`movieCuratorLiveEnabled`) は継続稼働 (touch なし)
- ユーザー報告 incident なし (Sentry / customer support 経由)

### 9.4 rollback 後の next step

- root cause analysis (RCA) → incident report 完成
- 該当 sub-phase の設計 / 実装 patch を別 PR で提出 (本 doc は base、修正は別 doc)
- CEO 判断で再 ON candidate

---

## §10 Step E 開始条件

Step E (本番観測) を開始するには **全条件** 満たす:

| # | 条件 | verify 方法 |
|---|---|---|
| 1 | D-2-e3-a〜e 全 sub-phase 完了 + main merge | `git log origin/main` で 5 commit / PR 確認 |
| 2 | 各 sub-phase の shadow 観測 1-2 週間以上完了 | Discover query で sub-phase ごとの diagnostics 集計 |
| 3 | Sentry alert 11 件 set 完了 | Sentry console |
| 4 | Discover saved queries 8 種 set 完了 | Discover console |
| 5 | canary 戦略合意 (staging → 1% → 10% → 50% → 100%) | CEO 承認 doc (`docs/coalter-stepE-canary-plan.md` 想定) |
| 6 | rollback playbook drill 完了 (staging で 1 回試行) | drill log doc |
| 7 | A/B 比較 framework (任意) | optional、Step E-0-3 |
| 8 | CEO の Step E 開始 GO 判断 | CEO 承認 |

これら全条件が揃ってから初めて `COALTER_THREE_STAGE=true` を Production で staging → canary → 全展開 する。

---

## §11 CEO 判断ポイント (本 docs PR review 時)

| # | 論点 | 推奨 | 代替 | section |
|---|---|---|---|---|
| 1 | sub-phase 着手順 | a → b → c → d → e (リスク低→高) | 別順 (例: M0 lens を早期に通す) | §1.1 |
| 2 | 公式 fetcher distributor allowlist 初期サイズ | minimal 8 distributor | 全 distributor permissive | §3.2.1 |
| 3 | robots / ToS 確認方針 | 別 doc `docs/coalter-d2e3-source-compliance.md` を D-2-e3-a 着手前に必須 | 各 sub-phase 着手時に確認 | §3.7 |
| 4 | LLM cost monthly cap | $500 / 自動 OFF 95% | 別値 (例: $1000) | §4.2 |
| 5 | LLM 5000ms timeout | 採用 | 別値 (3500ms / 7000ms) | §4.3 |
| 6 | ranking cache storage | Supabase table 採用 | in-memory のみ | §5.2.2 |
| 7 | engine.ts touch 承認 (D-2-e3-d 限定) | 承認 | 拒否 (M0 lens 別経路要設計) | §6.2 |
| 8 | M0 lens 不在時 fallback | (a) placeholder lens fail-open | (b) 4-layer pipeline fallback (sub-flag) | §6.5 |
| 9 | diagnostics に `lensConfidence` 追加 | 採用 (D-2-e3-d で additive) | 既存 6 field のみ | §6.6 |
| 10 | A/B 比較 framework 構築 | Step E-0-3 で構築 (推奨 optional) | skip | §10 |
| 11 | per-sub-phase PR 戦略 | 1 sub-phase = 1 PR (案 B) | umbrella branch (案 A) | §0 |
| 12 | local stepd worktree / branch cleanup | docs PR merge 後に提案 | 即時 cleanup | (本 doc 外) |

---

## §12 まだやらない (本 doc PR scope 外、明示)

### 12.1 本 doc PR で実装着手しないもの

- D-2-e3-a〜e 各 sub-phase 実装
- 実 fetcher / 実 LLM / 実 candidate source / M0 lens 実接続
- Sentry alert / Discover query / Slack alert の **set 操作**
- canary 戦略の **実行**
- A/B 比較 framework 構築
- Production env 変更
- 既存 D-1-d shadow path (`movieCuratorLiveEnabled`) の削除
- webConnector / movieCatalog / movieRanker 削除 (三段式 100% 後の candidate)
- bug1 worktree cleanup (CEO 別 phase で判断)

### 12.2 本 doc PR で書き留めるが別 doc で詳細化するもの

- `docs/coalter-d2e3-source-compliance.md` (robots / ToS 確認、§3.7)
- `docs/coalter-stepE-canary-plan.md` (canary 段階 / 期間、§10)
- `docs/incidents/` (rollback 時の incident report、§9)
- `docs/coalter-d2e3-ab-comparison-framework.md` (A/B 比較、§10、optional)

---

## 付録 A: Step D structural scaffold complete からの接続図

```
[Step D, merged via PR #102 (dddfd664)]
   ├── D-1-a queryDerivation
   ├── D-1-b candidatePool + Soft Availability Filter (B1)
   ├── D-1-c curator + LLM Ranker (G3/G4/G6)
   ├── D-1-d movieCuratorLiveEnabled shadow wiring
   ├── D-2-a theaterResolver (3+1 fallback chain, B2)
   ├── D-2-b adjacencyTable + areaExpansion (Tier 0/1/2)
   ├── D-2-c tierFailNarration (template only, B3)
   ├── D-2-d stage3Prefetch (投機並列 budget DI)
   ├── D-2-e1 threeStagePipeline + diagnostics + areaExpansion additive
   └── D-2-e2 COALTER_THREE_STAGE wiring + adapter
       → Step D structural scaffold complete

[本 doc PR (docs-only)]
   └── D-2-e3 外部接続設計 + Step E 開始条件 docs 凍結
       → 設計確定 (実装着手しない)

[次 phase (本 doc PR merge 後、別 branch / 別 PR)]
   ├── D-2-e3-a 4 theater fetcher 実接続    [feat/coalter-d2e3a-...]
   ├── D-2-e3-b 実 LLM 接続                 [feat/coalter-d2e3b-...]
   ├── D-2-e3-c 3 candidate source 実接続   [feat/coalter-d2e3c-...]
   ├── D-2-e3-d M0 lens 実接続              [feat/coalter-d2e3d-...]
   ├── D-2-e3-e prefetch + diagnostics 仕上げ [feat/coalter-d2e3e-...]
   └── Step E-0 (Production reflection 前準備、別 doc / 別 PR)
       └── Step E (Production observation 開始)
```

## 付録 B: 既存 凍結線 file (handover §4.2 継承)

D-2-e3 全 sub-phase で **touch ゼロ** を維持する file (D-2-e3-d の engine.ts のみ例外):

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

## 付録 C: 5 gate verify (各 sub-phase commit 前必須)

各 sub-phase で以下 5 gate を必ず verify:

1. **typecheck**: 1099 baseline 維持 (新規 file 0 error)
2. **vitest**: tests/unit/coalter 全 PASS
3. **build**: `npm run build` `BUILD_EXIT=0`
4. **凍結線 grep**: 付録 B file 全 0 touched
5. **Alter Morning grep**: `git diff --name-only origin/main...HEAD | grep -iE '(^|/)(alter-morning|alter)(/|$)|(^|/)morning'` 0 hits

5 gate 全 PASS の証跡を commit message に記載すること。
