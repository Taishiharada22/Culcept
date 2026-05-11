# CoAlter D-2-e3 Source Compliance Review (provider-based revision)

**Status**: Draft (docs-only, framework + open questions、**provider-based 前提に revision**)
**Branch**: `docs/coalter-d2e3-provider-based-revision`
**Base**: `main` (HEAD `049572e2`、PR #102/#103/#104/#105 merge 後)
**前提**: PR #102 (Step D structural scaffold complete) + PR #103 (D-2-e3 external deps design review) + PR #104 (source compliance review、direct fetch 前提) merged 済
**本 doc PR の scope**: docs-only、**実装着手なし**。CEO 判断 (2026-05-12) で direct scraping から **provider-based retrieval 優先** への方針転換が確定したため、PR #104 の旧前提を本 doc で revise する。
**生成日**: 2026-05-12

---

## §0 本 doc の honest limitation (provider 採用後も法務 risk は残る)

### 0.1 CEO 判断 (2026-05-12) 概要

| 項目 | 判断 |
|---|---|
| direct scraping を今すぐ進めるか | **進めない** (Annex A に future candidate として温存) |
| provider-based retrieval (Anthropic / OpenAI / EXA 等) 優先 | **採用** |
| Primary provider 固定 | **しない** (provider-agnostic 設計、契約 + 可用性確認後に選定) |
| TheaterFetcher interface / threeStagePipeline / COALTER_THREE_STAGE scaffold | **維持** (Step D 成果保持) |
| direct fetcher 4 stub | **stub のまま維持** (将来 partnership 経由で復活 candidate) |
| curator と retrieval provider | **分離** (1 LLM call 統合は後で再検討) |
| 出典 URL 表示 | **必須方針** (UI に「公式 site で確認」リンク) |

### 0.2 「provider 経由なら法務 risk が消える」は誤り

CEO 補正 1 (重要):

| 誤った主張 | 正しい主張 |
|---|---|
| 「provider 経由なら法務 risk が全部消える」 | direct scraping より **確認範囲と運用 risk を下げる** が、**完全に消えるわけではない** |
| 「provider 側で全部吸収」 | provider 規約 / 商用利用 / cache / 出典表示 / 第三者権利への配慮は **残る** |

### 0.3 provider 経由でも残る compliance 論点

- provider 利用規約 (commercial use / cache / 出典表示 / 違反 sanction)
- provider 経由で取得する **third-party content の権利関係** (provider が aggregate した data の元 site の権利)
- provider 自身の API 利用範囲 (web search tool 利用可 plan か、月次 cost 上限)
- provider 違反検出時の sanction (account 停止 / IP block / 法的措置)
- data retention (user input が provider training に使われるか)

→ provider 1-3 個の **個別 ToS 確認** + **既存契約の plan 範囲確認** が必要。
→ direct scraping (11 source × 個別判断) と比べて確認 cost は格段に低い、が **ゼロではない**。

### 0.4 本 doc の限定

- 本 doc は **framework + checklist + open questions**、actual audit report ではない
- claude は provider ToS の実 fetch / 読解を **行わない** (network call なし、また法的判断は人間 + CEO 確認領域)
- 各 provider の compliance status は **`UNVERIFIED`** で起草
- 本 doc PR merge **だけで** D-2-e3-a (provider-based) 着手 GO **にはならない**
- verify は reviewer (CEO / 法務 / Build) が PR review 時に各 provider ToS を実確認 + 本 doc 更新 PR で行う

---

## §1 provider 候補 inventory (provider-based retrieval scope)

D-2-e3-a (theater listing 取得) + D-2-e3-c (candidate source) で利用候補となる **provider 一覧**。

### 1.1 provider 候補 7 種

| # | Provider | 種別 | 既存契約 (推定) | movie 検索適性 | 主用途案 |
|---|---|---|---|---|---|
| P1 | **Anthropic** (Claude + web search tool) | LLM + 検索 | **✅ 既存** (`runAI` 経由、要確認) | ○ | retrieval primary candidate |
| P2 | **OpenAI** (gpt-4o + web search / browse) | LLM + 検索 | (要 CEO 確認) | ○ | retrieval primary candidate |
| P3 | **EXA API** | semantic search | **✅ 既存** (`lib/coalter/webConnector.ts` 経由、要確認) | △ (汎用検索、theater 専用ではない) | secondary fallback |
| P4 | Google Programmable Search (CSE) | 検索 API | (要 CEO 確認) | ○ (Google 検索結果直接) | future candidate |
| P5 | Bing Web Search API | 検索 API | (要 CEO 確認) | ○ | future candidate |
| P6 | Perplexity API | LLM + 検索 | (要 CEO 確認) | ○ | future candidate |
| P7 | SerpAPI | 検索 wrapper | (要 CEO 確認) | ○ | future candidate (cost 高) |

### 1.2 provider 選定の方針 (CEO 補正 2: 固定しない)

- **Primary provider は実装着手時点で決定**: Anthropic / OpenAI / EXA のうち、契約 + API 可用性 + Web search 可否 + cost を確認後に選定
- 本 doc 起草時点では provider-agnostic 設計を維持
- DI 構造 (TheaterFetcher interface) を維持し、Primary provider 切替えを容易にする

### 1.3 fetch URL inventory (provider endpoint)

| Provider ID | Endpoint domain | URL pattern (想定) | fetch type | 本 doc scope |
|---|---|---|---|---|
| P1 | `api.anthropic.com` | `/v1/messages` (Claude API、web search tool 付き) | HTTPS POST JSON | ✅ |
| P2 | `api.openai.com` | `/v1/chat/completions` (gpt-4o + tools) | HTTPS POST JSON | ✅ |
| P3 | `api.exa.ai` | `/search` (semantic search) | HTTPS POST JSON | ✅ |
| P4 | `customsearch.googleapis.com` | `/customsearch/v1` | HTTPS GET JSON | optional (将来) |
| P5 | `api.bing.microsoft.com` | `/v7.0/search` | HTTPS GET JSON | optional (将来) |
| P6 | `api.perplexity.ai` | `/chat/completions` | HTTPS POST JSON | optional (将来) |
| P7 | `serpapi.com` | `/search` | HTTPS GET JSON | optional (将来) |

→ 本 doc は **3 entry (P1 + P2 + P3)** の compliance verify を gate にする。P4-P7 は将来 candidate。

### 1.4 内部 source (本 doc scope 外)

`personalityHistorySource` (D-2-e3-c で利用、Supabase query) は **内部 DB**、本 doc scope **外**。
LLM 接続 (D-2-e3-b、curator narration) は **本 doc scope 外** (commercial LLM API、既存運用済)。
ただし curator LLM と retrieval provider の **分離** は本 doc §6 の論点。

---

## §2 各 provider compliance チェックリスト template

各 provider 1 行ごとに以下を記録する。**全 field が verified になるまで D-2-e3-a 着手禁止**。

```
┌─────────────────────────────────────────────────────────────┐
│ Provider ID:                                                │
│ Provider name:                                              │
│ Endpoint:                                                   │
│                                                             │
│ Check 1: 既存契約 / plan                                    │
│   - 契約有無:                                               │
│   - plan name:                                              │
│   - 契約者 / 契約日:                                        │
│   - API key 保管場所:                                       │
│   - 確認結果: [ ] EXISTS / [ ] NOT_CONTRACTED              │
│                                                             │
│ Check 2: 商用利用範囲                                       │
│   - ToS URL:                                                │
│   - 商用利用条項抜粋:                                       │
│   - CoAlter (有償 service) 内での利用許容:                  │
│   - 確認結果: [ ] PASS / [ ] BLOCK / [ ] AMBIGUOUS         │
│                                                             │
│ Check 3: web search / browse / search API 利用可否          │
│   - 該当 plan で利用可能か:                                 │
│   - 利用範囲制限:                                           │
│   - 確認結果: [ ] AVAILABLE / [ ] NOT_AVAILABLE            │
│                                                             │
│ Check 4: 取得結果のキャッシュ可否                           │
│   - ToS 内 cache 関連条項:                                  │
│   - cache 期間制限 (24h / 30d / なし):                      │
│   - 確認結果: [ ] CACHE_OK / [ ] CACHE_LIMITED / [ ] CACHE_FORBIDDEN │
│                                                             │
│ Check 5: 出典表示の必要性                                   │
│   - ToS 内 attribution 条項:                                │
│   - 表示方法 (URL link / brand mark / text):                │
│   - 確認結果: [ ] REQUIRED / [ ] RECOMMENDED / [ ] NOT_REQUIRED │
│                                                             │
│ Check 6: 第三者権利への配慮                                 │
│   - provider が aggregate する third-party content の権利:  │
│   - user に表示する際の責任分担:                            │
│   - 違反時の指摘の有無:                                     │
│   - 確認結果: [ ] CLEAR / [ ] AMBIGUOUS                    │
│                                                             │
│ Check 7: rate limit                                         │
│   - per-minute:                                             │
│   - per-day:                                                │
│   - per-month:                                              │
│   - plan 別差分:                                            │
│                                                             │
│ Check 8: cost                                               │
│   - per-token / per-call / per-search の課金体系:           │
│   - 月次予測:                                               │
│   - 上限 cap 設定可否:                                      │
│   - 確認結果: [ ] AFFORDABLE / [ ] EXCESSIVE / [ ] AMBIGUOUS │
│                                                             │
│ Check 9: data retention / training use                      │
│   - user input が provider training に使われるか:           │
│   - opt-out 可否:                                           │
│   - 確認結果: [ ] OK / [ ] OPT_OUT_NEEDED / [ ] BLOCK      │
│                                                             │
│ Check 10: 違反時 sanction                                   │
│   - account 停止 / IP block / 法的措置:                     │
│   - rollback 可否:                                          │
│                                                             │
│ Check 11: termination / 仕様変更                            │
│   - provider 側 termination 条項:                           │
│   - API 仕様変更の通知方針:                                 │
│   - 移行猶予期間:                                           │
│                                                             │
│ 総合判定: [ ] D-2-e3-a で利用可 / [ ] 保留 / [ ] 禁止      │
└─────────────────────────────────────────────────────────────┘
```

各 provider ごとに本 template の row を §3 で個別に埋める。

---

## §3 各 provider compliance status (現状 = ALL UNVERIFIED)

### ⚠️ 警告

本 §3 の **全 provider は現時点で `UNVERIFIED`** (claude による自動 ToS fetch 不可、法的判断は人間 + CEO 確認領域)。
本 doc PR review 時に **reviewer (CEO / 法務 / Build) が実 ToS URL を読解 + 本 doc を更新する別 PR** を出してから D-2-e3-a 着手可。

### 3.1 P1: Anthropic (Claude + web search tool)

```
Provider ID: P1
Provider name: Anthropic Claude
Endpoint: api.anthropic.com

Check 1: 既存契約 / plan
  - 確認結果: UNVERIFIED
  - 想定: Aneurasync は既に `runAI` 経由で Anthropic を使っている (前 doc / 既存 lib/ai)
  - 確認要請: 既存 plan、web search tool 利用可能 plan か (要 CEO + Build 確認)

Check 2: 商用利用範囲
  - ToS URL: https://www.anthropic.com/legal/commercial-terms (推定、要確認)
  - 確認結果: UNVERIFIED
  - 確認要請: CoAlter (有償 service) 内での利用が "Customer Application" の範囲に入るか

Check 3: web search / browse 利用可否
  - 確認結果: UNVERIFIED
  - 確認要請: Claude API の web search tool が plan に含まれるか、別途 Tier upgrade 要か

Check 4: cache 可否
  - 確認結果: UNVERIFIED
  - 確認要請: ToS 内 cache 制約

Check 5: 出典表示
  - 確認結果: UNVERIFIED
  - 確認要請: Claude が返す source URL の表示要件 (ToS 内 attribution 条項)

Check 6: 第三者権利
  - 確認結果: UNVERIFIED
  - 確認要請: Claude が aggregate する third-party content の権利関係、Aneurasync 表示時の責任分担

Check 7: rate limit
  - plan 別差分 (要確認)

Check 8: cost
  - per-token cost (Anthropic 公開 rate card 参照)
  - web search tool 追加課金有無 (要確認)
  - 月次予測: D-2-e3-b の \$500/月 cap 内に収まるか

Check 9: data retention / training
  - 確認結果: UNVERIFIED
  - 確認要請: Commercial Terms 内 "Customer Data" 条項

Check 10: 違反時 sanction
  - 確認結果: UNVERIFIED

Check 11: termination
  - 確認結果: UNVERIFIED

総合判定: 保留 (全 check UNVERIFIED)
```

### 3.2 P2: OpenAI (gpt-4o + web search / browse)

```
Provider ID: P2
Provider name: OpenAI
Endpoint: api.openai.com

Check 1: 既存契約
  - 確認結果: UNVERIFIED
  - 確認要請: Aneurasync で OpenAI 契約有無 (CEO / Build)

Check 2: 商用利用範囲
  - ToS URL: https://openai.com/policies/business-terms/ (推定、要確認)
  - 補足: OpenAI Services Agreement (https://openai.com/policies/services-agreement/) も参照
  - 確認結果: UNVERIFIED
  - 確認要請: CoAlter (有償 service) 内での integration が "Customer Application" の範囲に入るか
  - 注釈 (CEO 補正): OpenAI 規約は API を customer application に統合する権利を認める一方、違法利用 / 第三者権利侵害は禁止、Output の正確性・適切性評価は顧客側責任とする

Check 3: web search / browse 利用可否
  - 確認結果: UNVERIFIED
  - 確認要請: gpt-4o の web search / browse 機能が plan で利用可能か

Check 4: cache 可否
  - 確認結果: UNVERIFIED

Check 5: 出典表示
  - 確認結果: UNVERIFIED

Check 6: 第三者権利
  - 確認結果: UNVERIFIED

Check 7: rate limit
  - plan 別差分 (要確認)

Check 8: cost
  - per-token cost (OpenAI 公開 rate card)

Check 9: data retention / training
  - 確認結果: UNVERIFIED
  - 補足: OpenAI Business Terms は API data の training 使用を default で除外する旨記載 (要確認)

Check 10: 違反時 sanction
  - 確認結果: UNVERIFIED

Check 11: termination
  - 確認結果: UNVERIFIED

総合判定: 保留 (全 check UNVERIFIED)
```

### 3.3 P3: EXA API

```
Provider ID: P3
Provider name: EXA
Endpoint: api.exa.ai

Check 1: 既存契約
  - 確認結果: UNVERIFIED
  - 想定: Aneurasync は既に EXA を使っている (`lib/coalter/webConnector.ts` 経由)
  - 確認要請: 既存 plan / API key

Check 2: 商用利用範囲
  - ToS URL: https://exa.ai/legal/terms-of-service (推定、要確認)
  - 確認結果: UNVERIFIED

Check 3: search API 利用範囲
  - 確認結果: UNVERIFIED
  - 確認要請: movie domain scrape / search 用途が plan で許容されるか

Check 4: cache 可否
  - 確認結果: UNVERIFIED
  - 確認要請: ToS 内 cache 制約

Check 5: 出典表示
  - 確認結果: UNVERIFIED
  - 確認要請: EXA が返す source URL の表示要件

Check 6: 第三者権利
  - 確認結果: UNVERIFIED
  - 確認要請: EXA が aggregate する third-party content の取り扱い

Check 7: rate limit
  - plan 別差分 (要確認、EXA dashboard)

Check 8: cost
  - per-call cost (要確認、EXA dashboard)

Check 9: data retention
  - 確認結果: UNVERIFIED

Check 10: 違反時 sanction
  - 確認結果: UNVERIFIED

Check 11: termination
  - 確認結果: UNVERIFIED

総合判定: 保留 (全 check UNVERIFIED)
```

### 3.4 P4-P7 (将来 candidate)

Google CSE / Bing / Perplexity / SerpAPI は **本 doc PR では UNVERIFIED 状態の保留** で、D-2-e3-a 着手時には対象外。Primary provider 選定後、不足があれば順次追加検討。

---

## §4 provider endpoint allowlist 最終案

### 4.1 設計原則

- **endpoint domain-level allowlist** (provider API のみ許可)
- **direct site への HTTP fetch は本 phase では行わない** (Annex A 参照)
- redirect 拒否 (provider API は redirect 不要、SSRF 防御強化)
- protocol whitelist: HTTPS のみ

### 4.2 allowlist 初期案 (§3 全 provider verified 後に有効化)

```typescript
// lib/coalter/movie/providers/allowlist.ts (D-2-e3-a 着手後に実装、本 doc では仕様凍結のみ)

export const PROVIDER_ENDPOINT_ALLOWLIST = {
  // Primary candidates (P1-P3、verify 後に有効化)
  anthropic: ["api.anthropic.com"],     // P1
  openai: ["api.openai.com"],           // P2
  exa: ["api.exa.ai"],                  // P3

  // Future candidates (P4-P7、現状 disable)
  googleCSE: ["customsearch.googleapis.com"],  // P4 (将来)
  bing: ["api.bing.microsoft.com"],            // P5 (将来)
  perplexity: ["api.perplexity.ai"],           // P6 (将来)
  serpapi: ["serpapi.com"],                    // P7 (将来)
};
```

**注**: 上記 list は §3 で verified + 契約確認後の provider **だけ** 有効化する。

### 4.3 direct site allowlist (Annex A 降格、本 phase では disable)

旧 PR #104 §4.2 で計画されていた distributor / eiga / yahoo allowlist は **本 phase scope 外** (Annex A 参照)。
将来 partnership 経由で direct fetch を復活する場合、本 doc を更新する別 PR で再設計。

---

## §5 共通 safety constraints (provider 利用版)

### 5.1 PR #103 §3.3〜3.8 引用 (provider 接続に適用)

PR #103 で凍結済の共通 safety constraints は **provider HTTP 接続にも適用**:
- §3.3 SSRF 対策 (protocol whitelist / IP filter / DNS rebinding 対策)
  - provider endpoint は固定 domain、allowlist 違反は throw
- §3.4 timeout (各 provider call 5-15s)
- §3.5 content-size 制限 (provider response size、JSON 256KB / LLM stream 制限)
- §3.6 content-type whitelist (application/json / text/event-stream)
- §3.7 robots / ToS 確認 (= 本 doc §3 で provider 別)
- §3.8 rate limit / retry policy (provider 側 quota に従う、独自 throttling は最小限)

### 5.2 provider-specific safety constraints

#### 5.2.1 token / cost budget (PR #103 §4.2 維持 + 拡張)

| 項目 | 上限 |
|---|---|
| per-event input token | 4000 (curator 用) + 2000 (retrieval 用) |
| per-event output token | 1500 (curator) + 1000 (retrieval) |
| per-event provider call | curator 1 + retrieval 1-2 (fallback 含む) |
| daily per-user | 50 events |
| daily global | 5000 events |
| monthly cost | \$500 cap (curator + retrieval 合計) |

#### 5.2.2 cache 戦略 (CEO open question 対象)

| 種別 | cache policy |
|---|---|
| LLM curator narration | per-session (一 invocation 内) |
| retrieval theater listing | 24h cache (provider ToS が許容する場合) or per-session |
| ranking source | daily cache (provider ToS 範囲内) |

cache storage: Supabase table (`movie_retrieval_cache` 新規) or in-memory (provider call 単位)。CEO 判断後に決定。

#### 5.2.3 出典 URL 表示 (CEO 補正 3: 必須方針)

- provider 経由で取得した theater listing には **常に source URL を含める**
- UI に「公式 site で確認」リンク表示 (Product Unit と協議、別 phase)
- LLM hallucination 対策: user が公式 site で再確認可能な状態を維持
- ToS で attribution 要求あり → UI に provider brand 表示 (例: "Powered by Anthropic / EXA")

#### 5.2.4 第三者権利への配慮

- provider が aggregate する third-party content (theater 名 / 上映時刻) の出典は **常に source URL で示す**
- Aneurasync は aggregator として振る舞い、original 情報源は user が確認できる状態を維持
- 違反指摘を受けた場合の rollback playbook (PR #103 §9 + 本 doc §8)

#### 5.2.5 fail-open 戦略 (provider 別)

```
Primary provider (1 個): timeout / throw → Secondary provider へ
Secondary provider:      同上 → Tertiary
Tertiary (= 4-layer pipeline fallback): 三段式無効化、既存 4-layer pipeline で response
```

provider 依存を **3 段で fail-open**、各層 ToS 違反検出時は自動 disable + Sentry alert。

#### 5.2.6 IP block / sanction 対応

- provider 側 sanction (account 停止 / IP block) は通常 provider plan 違反時のみ
- 違反検出 → 該当 provider を即時 disable (in-memory) + CEO 通知
- 24h cool-down or CEO 手動復帰

---

## §6 legal / CEO 確認 open questions (provider 前提に書換)

reviewer / CEO が以下に答えて、答えを本 doc または別 doc に追記してから D-2-e3-a 着手可。

| # | 質問 | 答え先 |
|---|---|---|
| 1 | Primary provider 選定基準は何か (cost / precision / latency / 既存契約 / web search 可否 の優先順位) | CEO |
| 2 | provider 1 個に依存する vs multi-provider fallback、どちらを採用するか | CEO + Build |
| 3 | Anthropic 既存契約の plan / web search tool 利用可否 | CEO + Build (既存契約調査) |
| 4 | OpenAI 既存契約有無 / 採用判断 | CEO |
| 5 | EXA 既存契約の commercial movie use / web search 用途の許容 | CEO + Build (既存契約調査) |
| 6 | 取得結果のキャッシュ期間 (per-session / 24h / disabled) | CEO + Product |
| 7 | 出典 URL 表示 UI の設計責任者 (Product / Build) と表示時期 | CEO + Product |
| 8 | provider 月次 cost cap (\$500 維持 or 別値) | CEO |
| 9 | precision 低下 (LLM hallucination / 古い theater 情報) 許容範囲 + Sentry alert 閾値 | CEO + Product |
| 10 | provider 違反検出 / ToS 違反時の rollback flow (PR #103 §9 と接続) | CEO |
| 11 | provider 仕様変更 / termination 時の追従責任者 | CEO + Build |
| 12 | data retention 許容範囲 (user input が provider training に入るか、opt-out 可否) | CEO + 法務 |
| 13 | curator 統合 vs 分離 (Claude case で 1 LLM call で完結 vs 分離 2 call) | CEO + Build |
| 14 | direct scraping の future candidate としての温存条件 (どうなったら復活検討するか) | CEO |

---

## §7 D-2-e3-a (provider-based) 着手可否判定 gate

### 7.1 gate 設計原則

- **§3 Primary candidate (P1-P3) 中、少なくとも 1 provider の status が `verified + PASS`** になるまで D-2-e3-a 着手禁止
- **§6 open questions が全て回答済** であること
- **Primary provider 1 個確定** + **Secondary fallback 1 個確定**
- **出典 URL 表示 UI 設計合意** (Product Unit と)

### 7.2 着手可否判定表 (本 doc PR review 時 + reviewer 更新 PR 時に埋める)

| Provider ID | Provider name | 契約 | 商用 use | web search 可否 | cache | 出典 | 第三者権利 | cost | data retention | 総合判定 |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Anthropic | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | **保留** |
| P2 | OpenAI | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | **保留** |
| P3 | EXA | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | **保留** |
| P4-P7 | Google CSE / Bing / Perplexity / SerpAPI | (将来 candidate、本 phase 対象外) | | | | | | | | - |

**現時点の総合判定**: **全 provider 保留** → **D-2-e3-a 着手禁止**

### 7.3 着手 GO 5 条件

以下 5 条件が **全て** 満たされたら D-2-e3-a 着手 GO:

1. **§3 で Primary provider 1 個 + Secondary provider 1 個** が `verified + PASS` に更新済
2. **§6 全 open question (14 件) が回答済**
3. **§4.2 allowlist が確定 list として実装可能な状態**
4. **出典 URL 表示 UI 設計 (Product Unit との合意)** 完了
5. **CEO の D-2-e3-a 着手 GO 明示判断**

### 7.4 部分 GO の余地 (1 provider のみ verify 完了の場合)

仮に Anthropic だけ verify PASS、OpenAI / EXA UNVERIFIED の場合:
- D-2-e3-a 着手時 allowlist に Anthropic のみ含める
- Secondary fallback として **4-layer pipeline へ降ろす** (provider 1 個依存、riskは Sentry で監視)
- 追加 verify 完了で Secondary を増やす

**推奨**: Primary + Secondary の 2 provider verified 後に着手 (single point of failure 回避)

---

## §8 監査 / 更新方針

### 8.1 定期 audit

- **四半期 (3 ヶ月)** ごとに本 doc を audit
- 担当: Build (技術側、provider 仕様変動追従) + CEO (legal 側、ToS 改定追従)
- 確認: provider plan 変動 / cost / rate limit / ToS 改定 / 出典表示要件変動

### 8.2 不定期 audit triggers

- provider から ToS 改定通知 → 即時 audit + 該当条項確認
- provider sanction 受領 (account 停止 / API key revoke) → 即時 audit + 該当 provider disable
- LLM hallucination incident (user 通報 / Sentry alert) → 出典 URL 表示の運用見直し
- provider 仕様変更 (web search tool 廃止等) → 該当 provider disable + Secondary に切替え

### 8.3 更新手順 (provider compliance update PR)

```bash
# 1. main 起点
git checkout -b docs/coalter-d2e3-provider-compliance-update-YYYY-MM-DD origin/main

# 2. docs/coalter-d2e3-source-compliance.md §3 を更新
#    各 provider の status field を verified に更新
#    確認結果 / 確認者 / 確認日 を記入

# 3. provider ToS snapshot 添付 (CEO 提案、snapshot 保管採用時)
mkdir -p docs/coalter-d2e3-provider-snapshots
# Anthropic ToS / OpenAI Terms / EXA ToS 等を保管

# 4. commit + push + PR
```

### 8.4 snapshot 永続化

provider ToS / Commercial Terms の snapshot を `docs/coalter-d2e3-provider-snapshots/` に保管 (CEO 判断後)。
- 利点: git history で改定 audit 可能
- 注意: ToS は 著作権 (引用 fair use 範囲) に注意

---

## §9 まだやらない (本 doc PR scope 外、明示)

### 9.1 本 doc PR で実装着手しないもの

- D-2-e3-a (provider-based retrieval 実接続)
- provider client コード実装 (`lib/coalter/movie/providers/` 配下)
- direct scraping 実装 (Annex A 降格、本 phase 対象外)
- Anthropic / OpenAI / EXA 等の **新規契約** (既存契約調査のみ)
- 実 LLM / API 接続
- M0 lens 実接続
- Production env 変更
- Sentry alert / Discover query の set 操作
- bug1 worktree cleanup

### 9.2 本 doc PR で書き留めるが別 PR で詳細化するもの

- provider snapshots の永続化方針 (CEO 判断後、別 doc / 別 storage)
- 出典 URL 表示 UI 設計 (Product Unit、別 doc)
- direct scraping を将来復活する場合の partnership 接触計画 (Annex A、CEO 判断後)

---

## Annex A: direct scraping (future candidate、現状 maintain なし)

### A.1 状態

CEO 判断 (2026-05-12) で **direct scraping は今すぐ進めない**。
ただし **完全廃止ではなく**、future candidate として温存する。

### A.2 復活条件 (CEO 判断後)

以下のいずれかで direct scraping を再検討:
- provider-based retrieval の precision が許容範囲外と判明
- distributor との partnership / 個別合意成立
- provider cost が予算超過し、cost effective な代替が必要

### A.3 旧 fetch 対象 source 一覧 (PR #104 §1 由来)

PR #104 §1 で起草された 11 source inventory は **保留**:

| # | Source | 状態 |
|---|---|---|
| T1-1-1 〜 T1-1-8 | distributor 公式 (東宝 / 松竹 / 東映 / Sony / Warner / Disney / ギャガ / Bitters End) | UNVERIFIED、本 phase 対象外 |
| T1-2/C1 | eiga.com | UNVERIFIED、本 phase 対象外 |
| T1-3 | movies.yahoo.co.jp | UNVERIFIED、本 phase 対象外 |

### A.4 旧 stub の維持

`lib/coalter/movie/threeStageOrchestratorAdapter.ts` の `resolverDeps` 4 stub:

```typescript
// 本 phase では provider client に置換予定、direct fetcher は維持 stub
officialFetcher: async () => [],   // ← stub のまま (将来 partnership で復活)
eigaFetcher: async () => [],
yahooFetcher: async () => [],
exaFetcher: async () => [],         // ← EXA は provider 経由 (§3 P3) で復活
```

→ direct HTTP fetch を行う `fetcher` directly は **本 phase で実装しない**。
→ provider 経由の retrieval が、TheaterFetcher interface (DI) を維持しつつ 4 stub の内側を置換する。

### A.5 旧 compliance verify worksheet (PR #104 §1.1〜1.2 由来)

PR #104 §1.1 (robots.txt 確認 11 entry) + §1.2 (EXA 契約確認) は本 phase **不要**。
direct scraping を future で復活する場合、PR #104 の worksheet を再活用可能。

### A.6 旧 URL allowlist (PR #104 §4.2 由来)

```
distributor 8 + eiga + yahoo = 10 domain の direct allowlist は本 phase 不要。
将来復活時は本 doc を更新する別 PR で再有効化。
```

---

## 付録 A: 本 doc が満たす CEO 必須項目チェック

| # | CEO 要請事項 (judge 文面より) | 本 doc 反映 section |
|---|---|---|
| 1 | 使用候補 provider 一覧 (OpenAI / Claude / EXA / その他 search API) | §1.1 (P1-P7) |
| 2 | 商用利用可否 | §3 (各 provider Check 2) |
| 3 | 取得結果のキャッシュ可否 | §3 (各 provider Check 4) + §5.2.2 |
| 4 | 出典表示の必要性 | §3 (各 provider Check 5) + §5.2.3 (必須方針) |
| 5 | レート制限 | §3 (各 provider Check 7) + §5.2.1 |
| 6 | コスト上限 | §3 (各 provider Check 8) + §5.2.1 |
| 7 | fallback 方針 | §5.2.5 |
| 8 | direct scraping を使わない場合の精度 risk | §5.2.3 (出典 URL 表示で緩和) + §6 (CEO 判断 9) |

---

## 付録 B: 接続図 (PR #102 〜 本 PR)

```
[PR #102: Step D structural scaffold complete (merged)]
   ↓
[PR #103: D-2-e3 external deps design review (merged、direct fetch 前提)]
   ↓
[PR #104: D-2-e3 source compliance review framework (merged、direct fetch 前提)]
   ↓ CEO 判断 (2026-05-12): provider-based retrieval 優先
   ↓
[本 PR: D-2-e3 provider-based revision (本 docs)]
   ↓ §3 全 provider UNVERIFIED → §6 open questions
   ↓
[reviewer 更新 PR: 各 provider の compliance status を verified に更新]
   ↓ §7 GO 5 条件達成
   ↓
[CEO 判断: D-2-e3-a (provider-based) 着手 GO]
   ↓
[feat/coalter-d2e3a-provider-based branch + 実装 PR]
   ↓
[D-2-e3-b / c / d / e 順次]
   ↓
[Step E-0]
   ↓
[Step E (Production observation)]
```

---

## 付録 C: claude による provider ToS 自動取得不可の明示

本 doc 起草時、claude は以下を **行っていない**:
- 各 provider の ToS / Commercial Terms / Services Agreement の実 HTTP fetch
- API documentation の実 fetch (rate limit / cost / web search tool 仕様確認)
- 既存 Aneurasync 内の provider 契約状態の確認 (1Password / Vercel env / Notion 等 access なし)
- 法的拘束力のある声明の発出

→ 本 doc の **全 provider status が `UNVERIFIED`** は設計上の正常状態。
→ verify は **人間 reviewer (CEO / 法務 / Build) が PR review 時に各 ToS URL を fetch + 読解 + 既存契約調査 + 本 doc を更新する** 手順で行う。

claude が出来ない / やってはいけない事項を明示することは、本 doc の信頼性の核心 (PR #104 §0.3 で確立した原則を維持)。

---

## 付録 D: PR #104 旧 doc との対応関係

| PR #104 旧 section | 本 doc 対応 section |
|---|---|
| §0 honest limitation | §0 (CEO 補正 1 反映、「provider 経由でも法務 risk 残る」明示) |
| §1 fetch 対象 source 一覧 (11 entry) | §1 provider 一覧 (3-7 entry) + Annex A.3 (旧 11 source 降格) |
| §2 compliance チェックリスト template | §2 (provider 用に書換、11 check) |
| §3 各 source compliance status (11 entry UNVERIFIED) | §3 (3 provider UNVERIFIED) + Annex A.5 (旧 worksheet 保留) |
| §4 URL allowlist | §4 provider endpoint allowlist + Annex A.6 (旧 direct allowlist 保留) |
| §5 共通 safety constraints (PR #103 引用 + extend) | §5 (provider 用に再構成) |
| §6 legal / CEO 確認 open questions (12 件) | §6 (provider 前提に書換、14 件) |
| §7 D-2-e3-a 着手可否判定 gate (4 GO 条件) | §7 (provider 前提に書換、5 GO 条件) |
| §8 監査 / 更新方針 | §8 (provider 仕様変動追従に書換) |
| §9 まだやらない | §9 (provider client 実装含む) |

PR #104 の **全 12 必須項目** は本 doc でも反映 (付録 A 参照)。
