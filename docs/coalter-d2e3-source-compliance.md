# CoAlter D-2-e3 Source Compliance Review (provider verify update)

**Status**: Draft (docs-only、**provider verify 結果反映 update**)
**Branch**: `docs/coalter-d2e3-provider-verify-update`
**Base**: `main` (HEAD `31293370`、PR #102/#103/#104/#105/#106 merge 後)
**前提**: PR #106 (provider-based revision) merged 済
**本 doc PR の scope**: docs-only、**実装着手なし**。本 PR で **provider 一次調査結果** (Anthropic / OpenAI / EXA を WebFetch + GPT 補正 cross-check) を反映、PR #106 の起草時点 UNVERIFIED status を verified ベースの判定に書換える。
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
- 本 PR で **claude による WebFetch ベース一次調査** + GPT 補正 cross-check を反映 (詳細 §3)
- 全公式 page を取得できたわけではない (一部 403 / PDF 等)。**法的最終判断は CEO + 法務領域**、本 verify は **first-pass assessment**
- 本 doc PR merge **だけで** D-2-e3-a (provider-based) 着手 GO **にはならない**
- 未確認項目は CEO + 法務 + Build による manual verify が必要 (§3 / §6 で明示)

### 0.5 GPT 補正 (2026-05-12) と本 PR の反映方針

| 補正 | 反映 |
|---|---|
| OpenAI を「完全 UNVERIFIED」扱いから「**PARTIAL PASS / LEGAL AMBIG**」に格上げ | §3.2 で update (developers.openai.com の docs を claude 自身が WebFetch 検証済) |
| Anthropic を「PASS」ではなく「**PASS conditional**」に明示 | §3.1 で 5 条件を明示 |
| EXA は **AMBIG 維持** | §3.3 維持 |
| Primary provider 固定を **しない** (Anthropic / OpenAI 両方 Primary 候補、EXA Secondary) | §1.2 / §7 で明示 |

---

## §1 provider 候補 inventory (provider-based retrieval scope)

D-2-e3-a (theater listing 取得) + D-2-e3-c (candidate source) で利用候補となる **provider 一覧**。

### 1.1 provider 候補 7 種 (一次調査後 update)

| # | Provider | 種別 | 既存契約 (推定) | movie 検索適性 | 主用途案 | **一次調査判定** |
|---|---|---|---|---|---|---|
| P1 | **Anthropic** (Claude + web search tool) | LLM + 検索 | **✅ 既存** (`runAI` 経由、要確認) | ○ | **Primary 候補 (1)** | **PASS conditional** (§3.1) |
| P2 | **OpenAI** (gpt-4o + web search) | LLM + 検索 | (要 CEO 確認) | ○ | **Primary 候補 (2)** | **PARTIAL PASS / LEGAL AMBIG** (§3.2) |
| P3 | **EXA API** | semantic search | **✅ 既存** (`lib/coalter/webConnector.ts` 経由、要確認) | △ (汎用検索、theater 専用ではない) | **Secondary 候補** | **AMBIG** (§3.3、ToS PDF verify 待ち) |
| P4 | Google Programmable Search (CSE) | 検索 API | (要 CEO 確認) | ○ (Google 検索結果直接) | future candidate | (未調査) |
| P5 | Bing Web Search API | 検索 API | (要 CEO 確認) | ○ | future candidate | (未調査) |
| P6 | Perplexity API | LLM + 検索 | (要 CEO 確認) | ○ | future candidate | (未調査) |
| P7 | SerpAPI | 検索 wrapper | (要 CEO 確認) | ○ | future candidate (cost 高) | (未調査) |

### 1.2 provider 選定の方針 (Primary 非固定、provider-agnostic)

- **Primary 候補は Anthropic / OpenAI の 2 つ** (どちらか 1 つを実装着手時点で確定、または両方並走)
- **Secondary は EXA** (ToS PDF verify 完了後)
- **provider-agnostic interface** を先に設計 → DI で差し替え可能にする
- DI 構造 (TheaterFetcher interface) を維持
- direct scraping は Annex / future candidate のまま、本 phase では実装しない

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

## §3 各 provider compliance status (一次調査結果 update)

### ⚠️ 一次調査の限界

- 本 §3 の status は **claude による WebFetch ベース一次調査** + GPT 補正 cross-check の結果。
- **法的最終判断は CEO + 法務領域**、本 verify は first-pass assessment。
- 一部 verify (cache 条項 / 既存契約細部 / CoAlter 個別契約条件) は **manual verify 待ち**。

### 3.1 P1: Anthropic (Claude + web search tool) — **PASS conditional**

WebFetch 検証完了 source:
- `https://www.anthropic.com/legal/commercial-terms` (Commercial Terms、verify 済)
- `https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/web-search-tool` (web search tool docs、verify 済)
- `https://www.anthropic.com/legal/aup` (AUP、verify 済)

```
Provider ID: P1
Provider name: Anthropic Claude
Endpoint: api.anthropic.com

Check 1: 既存契約 / plan
  - 確認結果: PENDING (Aneurasync 内部 audit 待ち)
  - 想定: Aneurasync は既に `runAI` 経由で Anthropic を使っている
  - 確認要請: 既存 plan、web search tool が Console で enable 可能か (CEO + Build)

Check 2: 商用利用範囲
  - ToS URL: https://www.anthropic.com/legal/commercial-terms (確認済)
  - 確認結果: PASS — Commercial Terms §A.1 明示 "Customer may use Services 'to power products and services Customer makes available to its own customers and end users'"
  - 制約: §D.4 で競合 AI 製品構築 / 再販禁止 (CoAlter は competing AI ではないため抵触しない、要 CEO 確認)

Check 3: web search 利用可否
  - 確認結果: PASS conditional
  - tool name: web_search_20260209 (dynamic filtering 対応) / web_search_20250305 (basic)
  - model 対応: Claude Opus 4.7、Opus 4.6、Sonnet 4.6
  - **要件**: Organization admin が Claude Console (/settings/privacy) で web search を enable する必要あり

Check 4: cache 可否
  - 確認結果: AMBIG — Commercial Terms に caching の明示条項なし
  - docs に prompt caching (内部最適化) は明示、business-side cache (e.g., 24h cache of search results) の明示許諾は未記載
  - 確認要請: CEO + 法務 で cache 戦略を判断

Check 5: 出典表示 (CEO 補正 3 と整合)
  - 確認結果: **必須** — docs 明示
  - 引用: "When displaying API outputs directly to end users, citations must be included to the original source. If you are making modifications to API outputs, including by reprocessing and/or combining them with your own material before displaying them to end users, display citations as appropriate based on consultation with your legal team."
  - CoAlter UI に「公式 site で確認」リンク表示 必須

Check 6: 第三者権利
  - 確認結果: 配慮要 — AUP "Infringe, misappropriate, or violate the intellectual property rights of a third party" 禁止
  - citation 必須要件 (§Check 5) で自然に対応可能

Check 7: rate limit
  - 確認結果: plan 依存 + web search 個別 rate あり
  - エラーコード: too_many_requests / max_uses_exceeded / query_too_long / unavailable
  - tool parameter `max_uses` で per-request 上限制御可

Check 8: cost
  - 確認結果: 明確
  - Web search: $10 per 1,000 searches + standard input/output token cost
  - search results は input token としてカウント (token 重い、dynamic filtering で緩和可)
  - 月次予測: \$500/月 cap 内で運用可能 (50 events × 30 day × 1 search/event = 1,500 search ≈ \$15)

Check 9: data retention / training
  - 確認結果: PASS — Commercial Terms §B 明示
  - 引用: "Anthropic may not train models on Customer Content from Services"
  - opt-out 不要、自動的に training 不使用

Check 10: 違反時 sanction
  - 確認結果: §I.3.a 明示 — Customer の compliance / policies / use 制約違反、または法的問題時に Anthropic は suspension 可

Check 11: termination
  - 確認結果: §I.2 — 両方 with notice、Anthropic は material breach に 30-day cure period、または "prohibited by applicable law" で即時 termination

総合判定: **PASS conditional**
条件:
  (a) Aneurasync が Anthropic と commercial 契約 (Commercial Terms 適用)
  (b) web search tool が Console で enable 可能 (plan + admin 権限)
  (c) citation URL を CoAlter UI に表示 (法務要件)
  (d) cost cap ($500/月) + rate limit 対策 (max_uses パラメータ等)
  (e) cache 戦略は CEO + 法務 判断後
```

### 3.2 P2: OpenAI (gpt-4o + web search) — **PARTIAL PASS / LEGAL AMBIG**

WebFetch 検証完了 source (developers.openai.com、GPT 補正で発覚した別 domain):
- `https://developers.openai.com/api/docs/guides/tools-web-search` (web search docs、verify 済)
- `https://developers.openai.com/api/docs/guides/your-data` (data policy、verify 済)
- `https://developers.openai.com/api/docs/pricing` (pricing、verify 済)

WebFetch 失敗 source (要 manual verify):
- `https://openai.com/policies/business-terms/` (403 Cloudflare bot block)
- `https://openai.com/policies/services-agreement` (403)
- `https://openai.com/policies/usage-policies` (403)

```
Provider ID: P2
Provider name: OpenAI
Endpoint: api.openai.com

Check 1: 既存契約
  - 確認結果: PENDING (Aneurasync 内部 audit 待ち、CEO / Build)
  - 確認要請: OpenAI 契約 / API key 有無

Check 2: 商用利用範囲
  - 確認結果: AMBIG (ToS pages WebFetch 403、policy 細部 manual verify 必要)
  - 一般公知 / docs ベース推定: customer application integration は許容、ただし違法利用 / 第三者権利侵害禁止、Output 正確性は顧客責任
  - 確認要請: CEO + 法務が openai.com/policies/business-terms/ 等を manual verify

Check 3: web search 利用可否
  - 確認結果: PASS (developers.openai.com/api/docs/guides/tools-web-search で明示)
  - 利用 API: Responses API + Chat Completions API 両対応
  - response 構造: web_search_call output + message output (annotations[url_citation] に URL/title/character index)
  - rate limit: "uses the underlying model's tiered rate limits" (model 依存)

Check 4: cache 可否
  - 確認結果: AMBIG — developers.openai.com docs に明示なし
  - 確認要請: Business Terms / Services Agreement manual verify、cache 戦略は CEO + 法務 判断後

Check 5: 出典表示 (CEO 補正 3 と整合)
  - 確認結果: **必須** — docs 明示
  - 引用: "When displaying web results or information contained in web results to end users, inline citations must be made **clearly visible and clickable** in your user interface."
  - CoAlter UI に「公式 site で確認」リンクを明確に表示 + clickable 必須

Check 6: 第三者権利
  - 確認結果: AMBIG (Business Terms manual verify 必要)
  - 一般公知: 第三者権利侵害禁止、Output accuracy は顧客責任 (要 verify)

Check 7: rate limit
  - 確認結果: model tier 依存
  - web search 個別 rate: "Responses API web search uses the underlying model's tiered rate limits"

Check 8: cost
  - 確認結果: 明確
  - Web search: $10.00 / 1,000 calls (gpt-5, o-series reasoning models)
  - Non-reasoning preview: $25.00 / 1,000 calls
  - + standard model token costs
  - File search: $2.50 / 1,000 calls (参考)

Check 9: data retention / training
  - 確認結果: PASS — developers.openai.com/api/docs/guides/your-data で明示
  - 引用: "data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in to share data with us)"
  - 引用: "Your data is your data"
  - Zero Data Retention (ZDR) option 利用可: abuse monitoring logs から exclude、store parameter は false 強制
  - Abuse monitoring logs: default 30 day retention

Check 10: 違反時 sanction
  - 確認結果: AMBIG (Business Terms manual verify 必要)

Check 11: termination
  - 確認結果: AMBIG (Business Terms manual verify 必要)

総合判定: **PARTIAL PASS / LEGAL AMBIG**
確認済:
  - web search 機能あり (Responses API / Chat Completions API)
  - sourced citations あり (url_citation annotations)
  - **inline citations clearly visible + clickable 必須**
  - API data デフォルト training 不使用、opt-in 必要
  - ZDR option あり
  - Web search cost $10/1k calls (Anthropic と同価格)

未確認 (manual verify 必須):
  - CoAlter 用途での契約細部 (Business Terms / Services Agreement の policy page 取得不可)
  - cache 可否
  - 出典表示の technical 実装条件詳細
  - 既存 OpenAI 契約 / API key 運用 (Aneurasync 内部 audit)
  - provider 選定時の CEO 判断
```

### 3.3 P3: EXA API — **AMBIG** (Secondary 候補として強い、ToS PDF verify 待ち)

WebFetch 検証完了 source:
- `https://exa.ai/pricing` (pricing、verify 済)
- `https://exa.ai/docs` (API docs、verify 済)
- `https://exa.ai/privacy-policy` (privacy、verify 済)
- `https://exa.ai/` (home、ToS は PDF と判明)

WebFetch 失敗 / 未取得 source:
- `https://exa.ai/legal/terms-of-service` (404)
- `https://exa.ai/terms` (404)
- `https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf` (PDF、WebFetch 不向き、manual verify 必要)

```
Provider ID: P3
Provider name: EXA
Endpoint: api.exa.ai

Check 1: 既存契約
  - 確認結果: PENDING (Aneurasync 内部 audit 待ち)
  - 想定: Aneurasync は既に EXA を使っている (`lib/coalter/webConnector.ts` 経由)
  - 確認要請: 既存 plan / API key 運用、commercial movie use 用途確認

Check 2: 商用利用範囲
  - 確認結果: AMBIG (ToS PDF manual verify 必須)
  - Privacy Policy 明示: "B2B model where businesses are primary customers"、business 関係は customer agreements で別途 governance
  - 引用 (Privacy): "This Privacy Policy does not apply to content or other information that we process on behalf of customers of our business offerings"
  - 確認要請: ToS PDF (https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf) を CEO + 法務 が manual verify

Check 3: search API 利用範囲
  - 確認結果: PASS (docs / pricing で明示)
  - 提供 API: search / contents / answer / monitors / deep search / instant
  - 用途 (pricing 表): coding agents / chatbots / news monitoring 等が明示 → CoAlter movie retrieval と整合

Check 4: cache 可否
  - 確認結果: AMBIG (docs / pricing / privacy に明示なし)
  - 確認要請: ToS PDF manual verify

Check 5: 出典表示
  - 確認結果: AMBIG (privacy policy / docs に明示なし)
  - EXA は "publicly available data in response to your queries" を返す → 出典 URL 表示は推奨だが、必須要件は ToS PDF 確認要

Check 6: 第三者権利
  - 確認結果: 配慮要 (Privacy で明示)
  - 引用 (Privacy): EXA は "publicly accessible sources, including names, job titles, company affiliations and other information that is publicly available online (e.g., from articles, journals, websites, online directories)" から data を取得
  - Aneurasync 側で出典 URL 表示で第三者権利配慮を担保推奨

Check 7: rate limit
  - 確認結果: plan 別
  - Free: 1,000 req/month
  - Enterprise: "Custom rate limits (QPS)"
  - Pay-as-you-go の RPS は未記載、要 EXA 確認

Check 8: cost
  - 確認結果: 明確
  - Free: 1,000 req/month
  - Search: $7 / 1,000 requests
  - Deep Search: $12-15 / 1,000 requests
  - Contents: $1 / 1,000 pages
  - Monitors: $15 / 1,000 requests
  - Answer: $5 / 1,000 requests
  - Additional results beyond 10: $1 / 1,000 requests
  - AI page summaries: $1 / 1,000 pages
  - Enterprise: Custom pricing

Check 9: data retention / training
  - 確認結果: **要注意** (Privacy で明示)
  - 引用 (Privacy): EXA は query data + 取得 content を "train and fine-tune models that power our Services" に使用
  - 引用 (Privacy): "you should not input personal information in these fields or submit any personal information as Query Data"
  - → CoAlter から送る prompt は personal info (ペア名等) を除外する必要あり

Check 10: 違反時 sanction
  - 確認結果: AMBIG (ToS PDF manual verify)

Check 11: termination
  - 確認結果: AMBIG (ToS PDF manual verify)

総合判定: **AMBIG** (Secondary 候補として強い)
PASS 寄りの要素:
  - search API 提供、movie retrieval 用途整合
  - cost 明確、Free 1000 req/月 (試験用に十分)
  - 既存契約 (推定) → 採用 cost 低

BLOCK 寄りの要素 / 残課題:
  - ToS PDF 確認待ち
  - query data + 取得 content の training 使用に注意 (personal info 除外要)
  - cache 戦略未確認
  - 出典表示の必須性 未確認

Secondary 採用判断: ToS PDF + cache 戦略 + 出典表示要件 verify 後
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

### 7.2 着手可否判定表 (一次調査結果 update)

| Provider ID | Provider name | 契約 | 商用 use | web search 可否 | cache | 出典 | 第三者権利 | cost | data retention | **総合判定** |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Anthropic | PENDING (内部 audit) | PASS (§A.1) | PASS conditional (admin enable 要) | AMBIG | **必須** (docs 明示) | 配慮要 (AUP) | 明確 (\$10/1k searches) | PASS (§B "may not train") | **PASS conditional** |
| P2 | OpenAI | PENDING (内部 audit) | AMBIG (policy 取得不可) | PASS (Responses API / Chat Completions API) | AMBIG | **必須** (docs 明示、clearly visible + clickable) | AMBIG | 明確 (\$10/1k calls reasoning models) | PASS (default 不使用、ZDR 可) | **PARTIAL PASS / LEGAL AMBIG** |
| P3 | EXA | PENDING (内部 audit) | AMBIG (ToS PDF 待ち) | PASS (search/contents/answer API) | AMBIG | AMBIG (明示なし) | 配慮要 (Privacy 明示) | 明確 (\$7/1k search) | **要注意** (query data training 使用) | **AMBIG** |
| P4-P7 | Google CSE / Bing / Perplexity / SerpAPI | (将来 candidate、本 phase 対象外) | - | - | - | - | - | - | - | - |

**現時点の総合判定**:
- **Primary 候補 (Anthropic / OpenAI)**: いずれも条件付き利用可、CoAlter 用途での契約細部 + admin enable + UI 設計が D-2-e3-a 着手前必須
- **Secondary 候補 (EXA)**: ToS PDF + cache + 出典表示 verify 後採用判断
- **D-2-e3-a 着手はまだ禁止** (§7.3 5 条件未充足)

### 7.3 着手 GO 5 条件 (update)

以下 5 条件が **全て** 満たされたら D-2-e3-a 着手 GO:

1. **§3 で Primary provider 1 個 + Secondary provider 1 個** が `verified + PASS` (or `PASS conditional` で条件充足) に更新済
2. **§6 全 open question (14 件) が回答済**
3. **§4.2 allowlist が確定 list として実装可能な状態**
4. **出典 URL 表示 UI 設計 (Product Unit との合意)** 完了
5. **CEO の D-2-e3-a 着手 GO 明示判断**

### 7.4 部分 GO / 段階 GO の余地 (provider 別の verify 進度差を吸収)

仮に Anthropic だけ PASS conditional の条件充足、OpenAI / EXA まだ verify 中の場合:
- D-2-e3-a 着手時 allowlist に Anthropic のみ含める
- Secondary fallback として **4-layer pipeline へ降ろす** (provider 1 個依存、SPOF risk は Sentry で監視)
- 追加 verify 完了で Secondary を順次拡張 (OpenAI / EXA)

**推奨**: Primary + Secondary の 2 provider verified 後に着手 (single point of failure 回避)。
**provider-agnostic 設計** を先に作っておけば、provider 追加 / 切替えは DI 経由で容易。

### 7.5 provider-agnostic 実装設計の優先順 (D-2-e3-a 着手時)

```
Step 1: provider-agnostic interface 設計 (lib/coalter/movie/providers/)
   - allowlist.ts
   - safeProviderCall.ts (共通 HTTP wrapper、timeout / budget)
   - providerSelector.ts (Primary / Secondary 切替え、fallback)
   - responseParser.ts (provider 別 response → TheaterListing[] 変換)
   ↓
Step 2: 最初の provider client (CEO 選定後の Primary、Anthropic or OpenAI)
   ↓
Step 3: Secondary provider client (CEO 選定後)
   ↓
Step 4: 5 gate verify + main merge
```

interface 設計を先に固定 → provider 別実装は後追い、provider 切替え時の touch 範囲を最小化。

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
