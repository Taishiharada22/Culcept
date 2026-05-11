# CoAlter D-2-e3 Source Compliance Review

**Status**: Draft (docs-only, framework + open questions)
**Branch**: `docs/coalter-d2e3-source-compliance`
**Base**: `main` (HEAD `88589692`、PR #103 merge 後)
**前提**: PR #102 (Step D structural scaffold complete) + PR #103 (D-2-e3 external deps design review、§3.7 で本 doc を着手 gate に指定) merged 済
**本 doc PR の scope**: docs-only、**実装着手なし**。D-2-e3-a (4 theater fetcher 実接続) の着手 gate (PR #103 §3.7) を満たすための compliance フレームワーク + 各 source の確認チェックリスト + open questions を docs として固定する。
**生成日**: 2026-05-12

---

## §0 本 doc の honest limitation (最初に明示する重要事項)

### 0.1 本 doc で確定するもの

- fetch 対象 source の **網羅 inventory**
- 各 source の **compliance チェックリスト template** (確認項目を明文化)
- **URL allowlist の構造** (per-source rule)
- **共通 safety constraints** (SSRF / size / type / timeout / retry / rate limit / user-agent / 失敗時挙動)
- **D-2-e3-a 着手可否判定 gate** (どの check が PASS しないと着手禁止か)
- **legal / CEO 確認 open questions** (本 doc PR review で CEO が答える論点)

### 0.2 本 doc で **確定しないもの** (=人間 reviewer の確認が必要)

- **各 source の robots.txt の実 fetch 結果**
  - 本 doc 内で「eiga.com の robots.txt は xxx を Disallow している」等の **断定は禁止**
  - robots.txt は時間で変動する。doc に書いた瞬間に古くなる
  - 確認は **人間 reviewer が PR review 時に実 fetch + 結果を本 doc に追記** する手順
- **各 source の ToS / 利用規約の scrape 関連条項の実確認**
  - 本 doc 内で「eiga.com ToS は商用 scrape を禁止している」等の **断定は禁止**
  - ToS は法的拘束力を持つ、人間 + 法務確認必須
  - 確認は **CEO / 法務確認担当が PR review 時に実 URL を読んで結果を本 doc に追記** する手順
- **distributor との合意有無**
  - 個別 distributor との partnership / 個別合意は CEO 判断 領域
  - 本 doc は確認すべき distributor の inventory のみを示す

### 0.3 結論: 本 doc は framework であって audit report ではない

- 本 doc PR merge **だけで** D-2-e3-a 着手は GO **しない**
- 本 doc が main に merge された後、**reviewer (CEO / 法務 / Build) が実確認** を行い、確認結果を **本 doc を更新する別 PR** で追記する
- すべての status field が `verified` になって初めて D-2-e3-a 着手 GO 候補となる

---

## §1 fetch 対象 source 一覧 (network inventory)

D-2-e3-a / D-2-e3-c で外部 HTTP fetch を行う source の網羅一覧。本 doc が compliance verify scope を確定する対象。

### 1.1 theater fetcher (D-2-e3-a、4 fetcher × 複数 domain)

| Fetcher | 接続先 domain (initial) | 用途 | fetch 頻度 (推定) |
|---|---|---|---|
| `officialFetcher` | distributor 公式 (§1.2 一覧) | candidate.officialUrl 経由で theater listing 取得 | per-event、1 候補 1 fetch |
| `eigaFetcher` | `eiga.com` | 作品 ID + theater listing fallback | per-event、1 候補 1 fetch |
| `yahooFetcher` | `movies.yahoo.co.jp` | 作品 + theater listing fallback | per-event、1 候補 1 fetch |
| `exaFetcher` | `api.exa.ai` | 最終 fallback (text 検索 + 抽出) | per-event、稀 (上記 3 段失敗時のみ) |

### 1.2 distributor 公式 site 初期 inventory (officialFetcher 用)

PR #103 §3.2.1 で示した初期 allowlist 候補。
本 doc PR で各 distributor の status を確認 (実確認は人間 reviewer)。

| # | Distributor | 想定 domain | robots.txt URL | ToS URL (推定) | partnership 有無 |
|---|---|---|---|---|---|
| 1 | 東宝 | `toho.co.jp` | `https://www.toho.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 2 | 松竹 | `shochiku.co.jp` | `https://www.shochiku.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 3 | 東映 | `toei.co.jp` | `https://www.toei.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 4 | Sony Pictures Japan | `sonypictures.jp` | `https://www.sonypictures.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 5 | Warner Bros. Japan | `warnerbros.co.jp` | `https://www.warnerbros.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 6 | Disney Japan | `disney.co.jp` | `https://www.disney.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 7 | ギャガ | `gaga.co.jp` | `https://www.gaga.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |
| 8 | Bitters End | `bitters.co.jp` | `https://www.bitters.co.jp/robots.txt` | (要確認) | (要 CEO 判断) |

**注**: 配給会社は作品ごとに **個別の宣伝 site** (e.g., `https://wwws.warnerbros.co.jp/avatar2/`) を立てることが多い。robots.txt は domain root だが、ToS は個別宣伝 site にも個別記載がある可能性。各作品の `candidate.officialUrl` 動的入力に対する allowlist 検証は domain-level で行う方針 (PR #103 §3.2.2)。

### 1.3 candidate source (D-2-e3-c、3 source)

| Source | 接続先 | compliance scope (本 doc) |
|---|---|---|
| `rankingSource` | `eiga.com` (or 映画.com 公開中ランキング page) | **本 doc scope 内** (HTTP scrape) |
| `exaSource` | `api.exa.ai` (commercial API) | **本 doc scope 内** (API ToS) |
| `personalityHistorySource` | Supabase (internal) | **本 doc scope 外** (内部 DB query、外部接続なし) |

### 1.4 LLM 接続 (D-2-e3-b、参考)

`runAI` 経由の Anthropic / OpenAI API は **本 doc scope 外** (commercial API、別 ToS で既存運用済)。
ただし PR #103 §4.2 で定義した cost cap / privacy 観点は CEO 別判断。

### 1.5 全 fetch URL inventory (sources を 1 表に集約)

| ID | Source | Domain | URL pattern (想定) | fetch type | 本 doc scope |
|---|---|---|---|---|---|
| T1-1 | officialFetcher | distributor (8+ domain、§1.2) | candidate.officialUrl (動的) | HTTP GET HTML | ✅ |
| T1-2 | eigaFetcher (theater) | eiga.com | `/movie/{id}/` | HTTP GET HTML | ✅ |
| T1-3 | yahooFetcher | movies.yahoo.co.jp | `/movie/{id}/` | HTTP GET HTML | ✅ |
| T1-4 | exaFetcher | api.exa.ai | (EXA API client 内) | HTTPS POST JSON | ✅ |
| C1 | rankingSource | eiga.com | `/now/` (or `/coming/`) | HTTP GET HTML | ✅ |
| C2 | exaSource | api.exa.ai | (EXA API client 内) | HTTPS POST JSON | ✅ |
| C3 | personalityHistorySource | Supabase | (DB query) | DB | ❌ (本 doc scope 外) |

→ 本 doc は **6 entry (T1-1 〜 T1-4 + C1 + C2)** の compliance verify を gate にする。

---

## §2 各 source compliance チェックリスト template (per-source row)

各 source 1 行ごとに以下を記録する。**全 field が verified になるまで D-2-e3-a 着手禁止**。

```
┌─────────────────────────────────────────────────────────────┐
│ Source ID:                                                  │
│ Domain:                                                     │
│ URL pattern:                                                │
│                                                             │
│ Check 1: robots.txt 確認                                    │
│   - robots.txt URL:                                         │
│   - User-agent 別 Disallow:                                 │
│   - 該当 path Disallow:                                     │
│   - 確認日:                                                 │
│   - 確認者:                                                 │
│   - 確認結果: [ ] PASS / [ ] BLOCK / [ ] AMBIGUOUS         │
│   - 注釈:                                                   │
│                                                             │
│ Check 2: ToS / 利用規約 scrape 関連条項確認                  │
│   - ToS URL:                                                │
│   - automated access / scrape 関連条項抜粋:                  │
│   - 商用利用関連条項抜粋:                                    │
│   - 確認日:                                                 │
│   - 確認者:                                                 │
│   - 確認結果: [ ] PASS / [ ] BLOCK / [ ] AMBIGUOUS         │
│   - 注釈:                                                   │
│                                                             │
│ Check 3: 公開情報範囲確認                                    │
│   - 対象 URL の認証要否:                                     │
│   - 公開情報 / 会員限定情報の判定:                           │
│   - 確認結果: [ ] PUBLIC / [ ] AUTH_REQUIRED               │
│                                                             │
│ Check 4: 個別合意 / partnership 確認 (distributor のみ)     │
│   - 接触先:                                                 │
│   - 合意有無:                                               │
│   - 合意範囲:                                               │
│   - 確認日:                                                 │
│   - 確認者: CEO                                             │
│   - 確認結果: [ ] AGREED / [ ] NO_CONTACT / [ ] DECLINED   │
│                                                             │
│ Check 5: 推奨 rate limit                                    │
│   - 確認に基づく推奨 rate (req/min):                         │
│   - 根拠 (robots.txt の Crawl-delay 等):                    │
│                                                             │
│ 総合判定: [ ] D-2-e3-a で fetch 可 / [ ] 保留 / [ ] 禁止   │
└─────────────────────────────────────────────────────────────┘
```

各 source ごとに本 template の row を §3 / §4 で個別に埋める。

---

## §3 各 source の compliance status (現状 = ALL UNVERIFIED)

### ⚠️ 警告

本 §3 の **全 source は現時点で `UNVERIFIED`** (claude による自動取得不可、また法的判断は必ず人間 + CEO 確認領域)。
本 doc PR review 時に **reviewer (CEO / 法務確認担当) が実 URL を fetch + 読解 + 本 doc を更新する別 PR** を出してから D-2-e3-a 着手可。

### 3.1 T1-1: officialFetcher (distributor 公式) — 8 distributor × 個別確認

各 distributor 個別に確認が必要。本 doc では template を示し、reviewer が確認結果を埋める。

```
Source ID: T1-1-1 (東宝)
Domain: toho.co.jp
URL pattern: candidate.officialUrl (動的、domain-level allowlist)

Check 1: robots.txt 確認
  - robots.txt URL: https://www.toho.co.jp/robots.txt
  - 確認結果: UNVERIFIED
  - 確認者: (PENDING)
  - 確認日: (PENDING)

Check 2: ToS 確認
  - ToS URL: (要確認)
  - 確認結果: UNVERIFIED

Check 3: 公開情報範囲
  - 確認結果: UNVERIFIED

Check 4: partnership / 個別合意
  - 確認結果: UNVERIFIED
  - 確認者: CEO

Check 5: 推奨 rate limit
  - 推奨: 5 req/min/domain (PR #103 §3.8.1)、確認後調整

総合判定: 保留 (全 check UNVERIFIED)
```

**同 template を残り 7 distributor (松竹 / 東映 / Sony / Warner / Disney / ギャガ / Bitters End) に複製。本 doc PR review 時に reviewer が更新。**

### 3.2 T1-2 / C1: eiga.com (theater + ranking)

```
Source ID: T1-2 (theater) + C1 (ranking)
Domain: eiga.com
URL pattern:
  - T1-2: https://eiga.com/movie/{id}/
  - C1:   https://eiga.com/now/ (and /coming/ if needed)

Check 1: robots.txt 確認
  - robots.txt URL: https://eiga.com/robots.txt
  - 確認結果: UNVERIFIED
  - 確認者: (PENDING)
  - 確認日: (PENDING)
  - 確認要請事項:
    * User-agent: * での Disallow path
    * /movie/* path の status
    * /now/, /coming/ path の status
    * Crawl-delay 指定有無
    * Sitemap reference

Check 2: ToS 確認
  - ToS URL: (要確認、eiga.com 利用規約 page)
  - 確認要請事項:
    * 自動取得 / scrape 関連条項
    * 商用利用関連条項
    * "screen scraping" / "data mining" 等のキーワード
  - 確認結果: UNVERIFIED

Check 3: 公開情報範囲
  - 確認結果: UNVERIFIED
  - 確認要請事項: target URL は会員不要で閲覧可能か (= 公開情報か)

Check 4: partnership / 個別合意
  - 現状: 接触なし (推定)
  - 確認結果: UNVERIFIED
  - 確認者: CEO

Check 5: 推奨 rate limit
  - 推奨: 10 req/min/domain (PR #103 §3.8.1)、確認後調整
  - robots.txt Crawl-delay があればそれに従う

総合判定: 保留 (全 check UNVERIFIED)
```

### 3.3 T1-3: movies.yahoo.co.jp

```
Source ID: T1-3
Domain: movies.yahoo.co.jp (LY Corporation)
URL pattern: https://movies.yahoo.co.jp/movie/{id}/

Check 1: robots.txt 確認
  - robots.txt URL: https://movies.yahoo.co.jp/robots.txt
  - 確認結果: UNVERIFIED
  - 確認者: (PENDING)
  - 確認日: (PENDING)
  - 確認要請事項:
    * User-agent: * での Disallow path
    * /movie/* path の status
    * Crawl-delay 指定有無

Check 2: ToS 確認
  - ToS URL: LY Corp 共通利用規約 + Yahoo!映画 個別規約 (要確認)
  - 確認要請事項:
    * automated access / scrape 関連条項
    * 商用利用関連条項
    * 検索エンジンクローラー以外への制限
  - 確認結果: UNVERIFIED
  - 注釈: 大手 portal は通常 ToS が厳格、慎重に確認

Check 3: 公開情報範囲
  - 確認結果: UNVERIFIED

Check 4: partnership
  - 現状: 接触なし (推定)
  - 確認者: CEO

Check 5: 推奨 rate limit
  - 推奨: 10 req/min/domain (PR #103 §3.8.1)
  - 大手 portal のため、保守的に設定する余地あり

総合判定: 保留 (全 check UNVERIFIED、ToS 厳格な可能性 → 慎重判断要)
```

### 3.4 T1-4 / C2: EXA API (api.exa.ai)

```
Source ID: T1-4 (fallback fetcher) + C2 (candidate source)
Domain: api.exa.ai
URL pattern: EXA API client 経由 (具体 endpoint は client 実装側)

Check 1: robots.txt 確認
  - 対象外 (API、commercial contract)

Check 2: ToS 確認
  - ToS URL: https://exa.ai/legal/terms-of-service (推定)
  - 確認要請事項:
    * API 利用範囲 / commercial use 可否
    * rate limit (API 側)
    * 取得データの再頒布 / cache 制約
    * 既存 API key 利用契約の確認 (CEO / Build)
  - 確認結果: UNVERIFIED
  - 確認者: (PENDING)
  - 注釈: 既存 EXA client が他 file で使われている (本 doc 起草時 lib/coalter で 1 file から import 確認)
    → 既存契約 / 既存利用範囲を Build が調査して確認

Check 3: 公開情報範囲
  - API のため対象外

Check 4: partnership / contract
  - 既存契約あり (推定、要確認)
  - 確認者: CEO / Build

Check 5: 推奨 rate limit
  - API 側 rate に従う (API key 別 plan)

総合判定: 保留 (既存 API key の契約範囲確認 + commercial use 確認待ち)
```

---

## §4 URL allowlist 最終案 (compliance verify 後に CEO 承認で確定)

### 4.1 設計原則

- **domain-level allowlist** (sub-path allowlist は別 layer で検証)
- **動的 URL (candidate.officialUrl) は domain 抽出 → allowlist 照合**
- **redirect 先も再 allowlist check** (PR #103 §3.3)
- 拒否時は **空配列 fail-open** + Sentry warning (SSRF 試行可能性)

### 4.2 allowlist 初期案 (§3 全 source verified 後に有効化)

```typescript
// lib/coalter/movie/fetchers/allowlist.ts (D-2-e3-a 着手後に実装、本 doc では仕様凍結のみ)

export const DOMAIN_ALLOWLIST = {
  // distributor 公式 (§3.1 で各 distributor compliance verify 後に追加)
  official: [
    "toho.co.jp",       // T1-1-1、compliance status 確認後に有効化
    "shochiku.co.jp",   // T1-1-2、同上
    "toei.co.jp",       // T1-1-3、同上
    "sonypictures.jp",  // T1-1-4、同上
    "warnerbros.co.jp", // T1-1-5、同上
    "disney.co.jp",     // T1-1-6、同上
    "gaga.co.jp",       // T1-1-7、同上
    "bitters.co.jp",    // T1-1-8、同上
  ],
  // movie info
  eiga: ["eiga.com"],          // T1-2 / C1、compliance status 確認後
  yahoo: ["movies.yahoo.co.jp"],// T1-3、同上
  // API
  exa: [], // EXA は API client 経由、URL allowlist 不要 (T1-4 / C2)
};
```

**注**: 上記 list は §3 で `UNVERIFIED` の status が `verified + PASS` に更新された domain **だけ** 有効化する。
verify 完了前の domain は **commented out** で記述、有効化は本 doc を更新する別 PR で行う。

### 4.3 sub-path / URL 構造制限 (各 fetcher 個別)

| Fetcher | URL pattern 制限 |
|---|---|
| officialFetcher | candidate.officialUrl の hostname が allowlist 内 + protocol https |
| eigaFetcher | `https://eiga.com/movie/{id}/` の path pattern (regex: `^/movie/\d+/?$`) |
| yahooFetcher | `https://movies.yahoo.co.jp/movie/{id}/` の path pattern |
| rankingSource (eiga.com) | `https://eiga.com/now/` のみ (初期、`/coming/` は別判断) |
| exaFetcher / exaSource | API client 内、URL 直接接続なし |

---

## §5 共通 safety constraints (PR #103 から引用 + extend)

### 5.1 PR #103 §3.3〜3.8 引用 (再記なし)

以下は PR #103 で凍結済、本 doc では参照のみ:
- §3.3 SSRF 対策 (protocol whitelist / IP filter / DNS rebinding 対策)
- §3.4 timeout (各 fetcher 5s)
- §3.5 content-size 制限 (1MB cap + gzip bomb 対策)
- §3.6 content-type whitelist (text/html / application/xhtml+xml / application/json)
- §3.7 robots / ToS 確認方針 (= 本 doc の §1〜4 で具体化)
- §3.8 rate limit / retry policy (per-domain rate / dedup cache / retry)

### 5.2 本 doc で追加する safety constraints (PR #103 で明示されていない項目)

#### 5.2.1 User-Agent 制御 (PR #103 で未明示)

| 項目 | 方針 |
|---|---|
| User-Agent string | identifying string を採用 (透明性): `Aneurasync-CoAlter/1.0 (+https://aneurasync.com/bot)` |
| 根拠 | robots.txt User-agent 指定への準拠、incident 発生時の問い合わせ受付 |
| 代替案 | generic browser UA を使用 (transparency なし) — **採用しない** (倫理 / コンプライアンス) |

**CEO 判断ポイント**: bot contact URL の設置 (`https://aneurasync.com/bot` 想定 page) → 別タスク、本 doc で要請のみ

#### 5.2.2 robots.txt 動的 fetch / cache (PR #103 で未明示)

| 項目 | 方針 |
|---|---|
| robots.txt 自動 fetch | **採用しない** (実装複雑度 vs benefit) |
| 代替 | 本 doc で human 確認した内容を allowlist 化、定期 audit (§7) |
| 根拠 | robots.txt は時間変動するが、commercial scraper は通常事前合意 + 定期 audit で運用 |

#### 5.2.3 IP block 検出 (PR #103 で未明示)

| 項目 | 方針 |
|---|---|
| 連続 4xx / 5xx 検出 | per-domain 連続失敗 N 回 (例: N=10) で **当該 fetcher を 24h cool-down** |
| 検出時 reaction | Sentry alert + 当該 fetcher を自動 disable (in-memory) |
| 復旧 | 24h 後自動復帰、または CEO 手動復帰 |

#### 5.2.4 fetch 範囲制限 (path / query depth)

| 項目 | 方針 |
|---|---|
| 1 candidate あたり最大 fetch 数 | 4 fetcher (= SOURCE_ORDER 1 巡) + Tier 1 area expansion 最大 N=5 = 計 **最大 20 fetch / candidate** |
| 1 invocation あたり最大 fetch 数 | top pick 1 件 + prefetch top N=3 件 = 計 **最大 80 fetch / invocation** (悪い場合) |
| 異常検出 | invocation あたり fetch > 100 で **alert + 自動 truncate** |

#### 5.2.5 Cookie / Session 戦略

| 項目 | 方針 |
|---|---|
| Cookie 送信 | **採用しない** (stateless fetch、login 不要) |
| Session 持続 | per-invocation のみ、cross-invocation で session 持続なし |
| referer | **送信しない** (privacy) |

---

## §6 legal / CEO 確認 open questions (本 doc PR review で答える論点)

reviewer / CEO が以下に答えて、答えを本 doc または別 doc に追記してから D-2-e3-a 着手可。

| # | 質問 | 答え先 |
|---|---|---|
| 1 | 各 distributor の robots.txt / ToS の実確認は誰が担当? (CEO / 法務 / Build) | CEO 判断 |
| 2 | distributor 公式 site への scrape は商用 service 内で許容されるか (一般的見解)? | CEO + 法務 |
| 3 | partnership / 個別合意なしで scrape する場合の legal risk 上限 (受け入れ可 / 不可)? | CEO + 法務 |
| 4 | eiga.com の ToS が商用 scrape を禁止していた場合の代替策 (allowlist 除外 / partnership 接触 / 別 source)? | CEO |
| 5 | Yahoo!映画 同上 | CEO |
| 6 | EXA API の既存契約は commercial movie scrape 用途を許容しているか (要 EXA 契約書確認)? | CEO + Build |
| 7 | User-Agent identifying string (`Aneurasync-CoAlter/1.0 (+https://aneurasync.com/bot)`) で bot contact page の設置可能か | CEO |
| 8 | robots.txt 違反 / ToS 違反検出時の自動 disable + 通知 flow (Slack / Email) | CEO |
| 9 | 定期 audit の頻度 (例: 月次 / 四半期) と担当 | CEO |
| 10 | distributor からの C&D / 苦情を受けた場合の即時 rollback playbook (PR #103 §9 と接続) | CEO |
| 11 | 法務確認のためのリーガル外部委託有無 (社外法律事務所への相談) | CEO |
| 12 | 確認した robots.txt / ToS の **永続化方法** (snapshot を repo 内に保管? blob storage? 別 service?) | CEO + Build |

---

## §7 D-2-e3-a 着手可否判定 gate (本 doc の核心)

### 7.1 gate 設計原則

- **全 source の §3 status field が `verified + PASS` (or `AGREED` for distributor)** になるまで D-2-e3-a 着手禁止
- **1 source でも `UNVERIFIED` / `BLOCK` の場合**:
  - 該当 source を allowlist から除外 (運用)、または
  - D-2-e3-a 着手延期 (compliance verify 完了まで)
- **§6 open questions が全て回答済み** であること

### 7.2 着手可否判定表 (本 doc PR review 時 + reviewer 更新 PR 時に埋める)

| Source ID | Domain | robots.txt | ToS | 公開範囲 | partnership | rate limit 確定 | 総合判定 |
|---|---|---|---|---|---|---|---|
| T1-1-1 (東宝) | toho.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-2 (松竹) | shochiku.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-3 (東映) | toei.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-4 (Sony) | sonypictures.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-5 (Warner) | warnerbros.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-6 (Disney) | disney.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-7 (ギャガ) | gaga.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-1-8 (Bitters) | bitters.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 5 req/min | **保留** |
| T1-2/C1 (eiga) | eiga.com | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 10 req/min | **保留** |
| T1-3 (Yahoo) | movies.yahoo.co.jp | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | 10 req/min | **保留** |
| T1-4/C2 (EXA) | api.exa.ai | N/A | UNVERIFIED | N/A | (existing key) | API-level | **保留** |

**現時点の総合判定**: **全 source 保留** → **D-2-e3-a 着手禁止**

### 7.3 着手 GO 条件

以下 4 条件が **全て** 満たされたら D-2-e3-a 着手 GO:

1. **§3 全 source の compliance status が `verified + PASS` (or `AGREED`)** に更新済
2. **§6 全 open question が回答済** で本 doc または別 doc に記録済
3. **§4.2 allowlist が確定 list として実装可能な状態**
4. **CEO の D-2-e3-a 着手 GO 明示判断**

### 7.4 部分 GO の余地 (1 source ずつ verify する場合)

仮に 1 source ずつ verify が進む場合 (e.g., eiga.com だけ先に PASS):
- D-2-e3-a 着手時 allowlist に eiga.com のみ含める
- 他 fetcher (official / yahoo) は **stub のまま維持** (D-2-e3-a の sub-sub-phase 分割)
- 各 source verify 完了で fetcher を 1 つずつ enable する flag を追加可

**CEO 判断ポイント**: 部分 GO 戦略を採用するか、全 source verify 完了後に一括着手するか。
推奨: 全 source verify 完了後に一括着手 (sub-phase 分割複雑度回避、§6 全回答後に着手 GO がシンプル)

---

## §8 監査 / 更新方針

### 8.1 定期 audit

- **四半期 (3 ヶ月)** ごとに本 doc を audit
- 担当: Build (技術側) + CEO (legal 側)
- 確認: robots.txt 変動 / ToS 変動 / partnership 状態 / fetch incident 発生履歴

### 8.2 不定期 audit triggers

- distributor から C&D / 苦情を受領 → 即時 audit + 該当 source disable
- robots.txt 違反 detection (Sentry alert) → 即時 audit
- 大手 portal (Yahoo / 公式) の ToS 改定告知 → 該当部分の確認

### 8.3 更新手順

1. 監査担当が本 doc の status field を更新
2. PR で merge
3. allowlist 変更が伴う場合は別実装 PR (lib/coalter/movie/fetchers/allowlist.ts) で反映
4. Production deploy で allowlist 反映

### 8.4 永続化 (CEO open question #12 への提案)

- robots.txt / ToS の snapshot を本 repo の `docs/coalter-d2e3-compliance-snapshots/` に保管 (proposal)
  - 例: `docs/coalter-d2e3-compliance-snapshots/eiga-robots-2026-05-12.txt`
  - 利点: git history で変動 audit 可能、blob storage 不要
  - 注意: ToS は 著作権 (引用 fair use 範囲) に注意

---

## §9 まだやらない (本 doc PR scope 外、明示)

### 9.1 本 doc PR で実装着手しないもの

- D-2-e3-a (4 theater fetcher 実接続)
- 実 HTTP fetch
- URL allowlist の **コード実装** (本 doc では仕様凍結のみ)
- robots.txt / ToS の **実 fetch** (claude による自動取得不可、人間 reviewer 確認領域)
- distributor / source operators との接触 (CEO 判断)
- 実 LLM / API 接続
- M0 lens 実接続
- Production env 変更
- Sentry alert / Discover query の set 操作
- bug1 worktree cleanup

### 9.2 本 doc PR で書き留めるが別 PR で詳細化するもの

- compliance snapshots の永続化方針 (CEO 判断後、別 doc / 別 storage 設計)
- distributor 接触 outcome 記録 (CEO outreach 完了後、別 doc)
- audit log 様式 (定期 audit 開始時、別 doc)

---

## 付録 A: 本 doc が満たす CEO 必須項目 (10 件) チェック

| # | CEO 必須項目 (judge 文面より) | 本 doc 反映 section |
|---|---|---|
| 1 | fetch 対象 source 一覧 | §1 |
| 2 | 各 source の robots.txt 確認結果 | §3 (template + UNVERIFIED status) |
| 3 | 各 source の ToS / scraping / automated access 関連条項確認 | §3 (template + UNVERIFIED status) |
| 4 | URL allowlist | §4 (最終案、status PASS 後有効化) |
| 5 | SSRF 対策 | §5.1 (PR #103 §3.3 引用) |
| 6 | content-size 制限 | §5.1 (PR #103 §3.5 引用) |
| 7 | content-type 制限 | §5.1 (PR #103 §3.6 引用) |
| 8 | timeout / retry / rate limit | §5.1 (PR #103 §3.4/3.8 引用) + §5.2.3 (IP block) + §5.2.4 (fetch 範囲) |
| 9 | legal / CEO 確認が必要な論点 | §6 (12 質問) |
| 10 | D-2-e3-a 着手可否の判定表 | §7 (GO 条件 + 判定表) |

---

## 付録 B: 接続図 (PR #103 設計 + 本 doc compliance gate)

```
[PR #102: Step D structural scaffold complete (merged)]
   ↓
[PR #103: D-2-e3 external deps design review (merged)]
   ↓ §3.7 robots / ToS 確認方針 = 本 doc が gate
   ↓
[本 doc PR: D-2-e3 source compliance review (本 PR)]
   ↓ §3 全 source UNVERIFIED → §6 open questions
   ↓
[reviewer 更新 PR: 各 source の compliance status を verified に更新]
   ↓ §7 全 source verified + PASS + §6 全回答済
   ↓
[CEO 判断: D-2-e3-a 着手 GO]
   ↓
[feat/coalter-d2e3a-theater-fetchers branch + 実装 PR]
   ↓
[D-2-e3-b / c / d / e 順次]
   ↓
[Step E-0]
   ↓
[Step E (Production observation)]
```

## 付録 C: claude による robots.txt / ToS 自動取得不可の明示

本 doc 起草時、claude は以下を **行っていない**:
- 各 source の robots.txt の実 HTTP fetch (network call なし)
- ToS / 利用規約 page の実 HTTP fetch
- 法的拘束力のある声明の発出

→ 本 doc の **全 status field が `UNVERIFIED`** であることは設計上の正常状態。
→ verify は **人間 reviewer (CEO / 法務 / Build) が PR review 時に実 URL を fetch + 読解 + 本 doc を更新する** 手順で行う。

claude が出来ない / やってはいけない事項を明示することは、本 doc の信頼性の核心 (D-2-e1 / D-2-e2 で確立した「stub と real を明確に区別する」原則と同精神)。
