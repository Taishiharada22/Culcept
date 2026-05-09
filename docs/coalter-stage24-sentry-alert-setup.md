# CoAlter Stage 2.4 Sentry Alert Setup Handoff

> **status**: CEO operator 参照書 / Claude 自律設定しない
> **由来**: Stage 2.4-D production-ready audit (`9df69549`) Production reflection 前の必須運用手順
> **CEO 厳守**: Production env 触らない / impl 修正なし / Claude 自律設定しない

---

## §0 本書の位置づけ

### 0.1 目的

Stage 2.4-D Production reflection 前の必須条件として、**Sentry alert 設定** を CEO operator が実行するための handoff doc。chat 内のみではなく **repo に永続化** して、後続 reflection / 運用フェーズの参照書とする。

### 0.2 範囲

| 項目 | 状態 |
|---|---|
| Sentry standard alert で 6 指標を直接 metric 化できない制約 (重要発見) | §1 で明記 |
| Issue Alert 設定 (urgent triggered / speech route exception) | §3 (CEO 既往完了) |
| Performance Transaction Alert 設定 (/api/coalter/speech p95 / 5xx rate) | §4 (CEO 既往完了) |
| Discover saved query 6 指標 (手動 review) | §5 仕様 + §6 click-by-click 手順 |
| Production reflection 前チェックリスト | §7 (Stage 2.4-D §8 継承 + alert 設定 12 項目) |
| Production env まだ触らない | §8 |
| Sentry alert 設定は CEO operator 作業 / Claude 自律設定しない | §0.4 |

### 0.3 関連 doc

- `docs/coalter-stage24-production-reflection.md` (Stage 2.4-D 集約 doc)
- `docs/decision-log.md` Stage 2.4-A/B/C/D entries

### 0.4 表現規約 (CEO/GPT 補正準拠、永続)

| 規約 | 内容 |
|---|---|
| **Sentry alert 設定は CEO operator 作業** | Claude 自律設定しない、本書は手順書 |
| **Production env 触らない** | env 反映は CEO 個別判断後の別 phase |
| **6 指標 standard alert 化できない** | impl 修正なしには不可、本書は代替案で覆う |

---

## §1 Sentry プロジェクト前提

### 1.1 開く Sentry URL

```
https://sentry.io/organizations/<your-org>/projects/culcept/
```

### 1.2 確認項目

| 項目 | 期待値 |
|---|---|
| Project | `culcept` (Vercel 連携で同期) |
| Environments | `vercel-preview` / `production` (Vercel env tag で自動付与) |
| Sentry SDK | `@sentry/nextjs` (既存) |
| 現在の latest Release | `9df69549` (Stage 2.4-D) |
| Telemetry 経路 | `Sentry.addBreadcrumb()` 経由 (`lib/coalter/presence/sentryTelemetry.ts:83`) |

### 1.3 Slack Integration (CEO 既往完了)

| 項目 | 値 |
|---|---|
| Slack workspace | Aneurasync |
| 通知先 channel | `#aneurasync-alerts` |
| Sentry Slack integration | Installed |
| Alert 通知先設定済 | `#aneurasync-alerts` |

---

## §2 Sentry standard alert の限界 (重要、本 phase の制約)

### 2.1 telemetry 構造

`lib/coalter/presence/sentryTelemetry.ts:83`:
```typescript
Sentry.addBreadcrumb({
  category: "coalter.pattern",
  message: "coalter.pattern.used",
  level: "info",
  data: { variant, state, mode, hasSecondary, speechSource, retries, latencyMs, validationFailed, fallbackReason }
});
```

`coalter.pattern.used` の 6 指標 (`fallbackReason="timeout"` rate / `validation_failed` rate / `latencyMs` p95 / `llm_error` rate / `rate_limited` rate / `retries=-1` rate) は全て **breadcrumb の `data` field**。

### 2.2 制約

- Sentry breadcrumb は **Issue 内 context** として保管される (event-attached)
- Sentry standard alert (Issue / Metric) では breadcrumb data field を直接 trigger 条件にできない
- **6 指標の直接 alert 化は impl 修正 (Sentry custom metric 送信) なしには不可**

### 2.3 対応方針 (3 段、本 phase 範囲)

| 段 | 内容 | 状態 |
|---|---|---|
| **A. 直接 Issue Alert** (urgent / exception) | §3 | ✅ CEO 既往完了 |
| **B. Performance Transaction Alert** (route p95 / 5xx) | §4 | ✅ CEO 既往完了 |
| **C. Discover saved query (代替: 定期手動 review)** | §5 / §6 | ☐ **CEO 次タスク** |
| **D. Sentry custom metric impl** | Stage 2.5 候補 | ✗ 本 phase scope 外 |

---

## §3 Issue Alert 設定済 (CEO 既往完了)

### 3.1 Alert 1: `coalter.urgent.triggered` warning rate

**目的**: urgent layer 起動 (rupture / dignity / safety / heat / asymmetric overload) 頻度監視

**設定** (CEO 完了):
- Project: `culcept`
- Conditions: warning level + message contains `coalter.urgent.triggered`
- Filter: environment=`production`
- Threshold:
  - warn: 5+ in 1h → `[CoAlter] Urgent triggered rate (warn 1h)`
  - red: 10+ in 15min → `[CoAlter] Urgent triggered rate (red 15min)`
- Action: Slack `#aneurasync-alerts` + Email

### 3.2 Alert 2: `/api/coalter/speech` exception / 5xx

**目的**: server-side error 自動 alert

**設定** (CEO 完了):
- Conditions: error level + transaction matches `/api/coalter/speech`
- Filter: environment=`production`
- Threshold:
  - warn: 5+ in 1h → `[CoAlter] speech route exception (warn 1h)`
  - red: 10+ in 15min → `[CoAlter] speech route exception (red 15min)`
- Action: Slack + Email

---

## §4 Performance Transaction Alert 設定済 (CEO 既往完了、partial proxy)

### 4.1 注意 (CEO directive)

`@sentry/nextjs` は API route を Transaction として自動 instrument。`/api/coalter/speech` の **route 全体 duration** が metric として利用可能。ただし **LLM call 単独 latency と同義ではない** (route は LLM call + retry + validator + return overhead を含む):
- route p95 ≈ LLM latency + 関連 server work
- 6 指標の `latencyMs` は **builder 内 LLM call 単独 latency** (`speechTypes.ts:135`)
- → **partial proxy として認識**

### 4.2 Alert 3: `/api/coalter/speech` p95 latency monitor

**設定** (CEO 完了):
- Metric: `transaction.duration` p95
- Filter: `transaction == /api/coalter/speech`、`environment == production`
- Threshold:
  - warn: p95 > 6000ms → `[CoAlter] /api/coalter/speech p95 (warn 6s)`
  - red: p95 > 10000ms → `[CoAlter] /api/coalter/speech p95 (red 10s)`
- Action: Slack + Email

### 4.3 Alert 4: `/api/coalter/speech` 5xx rate monitor

**設定** (CEO 完了):
- Metric: `http.status_code:>=500` failure rate
- Filter: `transaction == /api/coalter/speech`、`environment == production`
- Threshold:
  - warn: 5% over 1h → `[CoAlter] /api/coalter/speech 5xx rate (warn 5%)`
  - red: 10% over 15min → `[CoAlter] /api/coalter/speech 5xx rate (red 10%)`
- Action: Slack + Email

---

## §5 Discover saved query 設計 (6 種、CEO 次タスク)

### 5.1 共通設定

- **Dataset**: Errors (breadcrumbs are searchable in events) / Transactions (broader)
- **Project**: `culcept`
- **Environment**: `production` (review 時) / `vercel-preview` (動作確認時)
- **Time range**: Last 1 hour (default)

### 5.2 6 query の仕様

| Query | filter | 集計 | warn (1h) | red |
|---|---|---|---|---|
| **1. timeout rate** | `breadcrumbs.data.fallbackReason:timeout` | count() | > **5%** of total | > **10%** over 15min |
| **2. validation_failed rate** | `breadcrumbs.data.fallbackReason:validation_failed` | count() | > **10%** of total | > **20%** over 15min |
| **3. latencyMs p95** | `has:breadcrumbs.data.latencyMs` | p95 of `breadcrumbs.data.latencyMs` | > **5000ms** | > **8000ms** |
| **4. llm_error rate** | `breadcrumbs.data.fallbackReason:llm_error` | count() | > **5%** of total | > **10%** over 15min |
| **5. rate_limited rate** | `breadcrumbs.data.fallbackReason:rate_limited` | count() | > **1%** of total | > **5%** over 15min |
| **6. retries=-1 rate** | `breadcrumbs.data.retries:-1` | count() | > **5%** of total | > **10%** over 15min |

### 5.3 review cadence (CEO operator 担当)

- **daily review** (推奨、毎朝 09:00): 6 query 順次確認
- 異常検知時: warn → 24h 以内に手動調査、red → 即時 §6 rollback 検討
- Stage 2.4-B mini-smoke の既存 breadcrumb (2026-05-09 vercel-preview) で query 動作確認

### 5.4 Sentry search syntax 注意 (CEO 確認要件)

- 本書の filter syntax は **Sentry search 標準形式** (`field:value`)
- `breadcrumbs.data.X` の filter は Sentry version によって syntax が異なる可能性
- 動作確認時に query が結果を返さない場合は以下を試す:
  - `breadcrumb_data:X` (alternative syntax)
  - `has:breadcrumbs.data.X` (existence check)
  - Sentry Issues view で event を直接 inspect して field path を確認
- 解決しない場合は CEO に相談 → Stage 2.5 で custom metric impl を検討

---

## §6 Discover saved query 具体的クリック手順 (CEO がそのまま実行可)

### 6.1 共通の navigation 手順

```
1. Sentry にログイン
2. 上部 nav の [Discover] をクリック (or [Insights] > [Discover])
3. 右上 [+ New Query] ボタンをクリック → 新規 query 画面
```

### 6.2 各 query の click 手順

#### Query 1: `[CoAlter] Pattern timeout fallback (1h, daily review)`

```
[1] Search bar に以下を入力:
    breadcrumbs.data.fallbackReason:timeout

[2] [Y-Axis] dropdown:
    - 集計: count
    - field: (空、events count)

[3] [Display] dropdown:
    - Visualization: Time series

[4] [Time Range] dropdown:
    - Last 1 hour (default)

[5] [Filter] section に追加:
    - environment: production

[6] 右上 [Save As] をクリック
    Query name: [CoAlter] Pattern timeout fallback (1h, daily review)
    [Save]
```

#### Query 2: `[CoAlter] Pattern validation_failed (1h, daily review)`

Query 1 と同手順、Search bar のみ変更:
```
breadcrumbs.data.fallbackReason:validation_failed
```
Save name: `[CoAlter] Pattern validation_failed (1h, daily review)`

#### Query 3: `[CoAlter] Pattern LLM latency p95 (1h, daily review)`

```
[1] Search bar:
    has:breadcrumbs.data.latencyMs

[2] [Y-Axis] dropdown:
    - 集計: p95
    - field: breadcrumbs.data.latencyMs

[3] [Display]: Time series

[4] [Time Range]: Last 1 hour

[5] [Filter]: environment: production

[6] [Save As]:
    Query name: [CoAlter] Pattern LLM latency p95 (1h, daily review)
```

#### Query 4: `[CoAlter] Pattern llm_error fallback (1h, daily review)`

Query 1 と同手順、Search bar のみ:
```
breadcrumbs.data.fallbackReason:llm_error
```
Save name: `[CoAlter] Pattern llm_error fallback (1h, daily review)`

#### Query 5: `[CoAlter] Pattern rate_limited (1h, daily review)`

Query 1 と同手順、Search bar のみ:
```
breadcrumbs.data.fallbackReason:rate_limited
```
Save name: `[CoAlter] Pattern rate_limited (1h, daily review)`

#### Query 6: `[CoAlter] Pattern retries=-1 (1h, daily review)`

Query 1 と同手順、Search bar のみ:
```
breadcrumbs.data.retries:-1
```
Save name: `[CoAlter] Pattern retries=-1 (1h, daily review)`

### 6.3 動作確認手順 (各 query 作成後)

```
[1] [Time Range] を 2026-05-09 09:00-12:00 (UTC、Stage 2.4-B mini-smoke 時間帯) に変更
[2] Filter で environment: vercel-preview に切替
[3] 結果を確認:
    - Query 1 / 2 / 4 / 5: 0 件 (Stage 2.4-B で fallback 0 件、正常)
    - Query 3: 16 sample から p95 latency 取得 (期待: 4798ms 以下)
    - Query 6: 0 件 (Stage 2.4-B で retries=-1 0 件、正常)
[4] 結果が期待通りなら filter / time range を default に戻す
[5] 結果が空 (どの time range / environment でも) なら syntax 不一致疑い
    - alternative syntax (§5.4) を試す
    - Sentry Issues 直接 inspect で field path 確認
```

### 6.4 review 運用 (Save 後)

```
[Sentry > Discover > Saved Queries] に 6 query が並ぶ
daily 09:00 (推奨):
  1. 各 query を順に開く (時刻 default の Last 1 hour で)
  2. 結果を §5.2 threshold 表と照合
  3. warn 越え → 24h 以内に手動調査
  4. red 越え → §7 rollback 検討
  5. Slack #aneurasync-alerts に summary 投稿 (運用 procedure 候補)
```

---

## §7 Production reflection 前チェックリスト (Stage 2.4-D §8 継承 + alert 設定 12 項目)

### 7.1 Sentry alert 設定 12 項目 (本書範囲)

| # | 項目 | 状態 |
|---|---|---|
| 1 | Sentry project `culcept` Vercel 連携 | ✅ |
| 2 | Slack / Email integration 設定済 | ✅ (`#aneurasync-alerts` 設定) |
| 3 | §3.1 Urgent triggered Issue Alert (warn + red) | ✅ |
| 4 | §3.2 Speech route exception Issue Alert (warn + red) | ✅ |
| 5 | §4.2 Performance Transaction p95 Alert (warn + red、partial proxy) | ✅ |
| 6 | §4.3 5xx rate Metric Alert (warn + red) | ✅ |
| 7 | §5 Discover saved query × 6 作成 | ☐ **CEO 次タスク** |
| 8 | §6.3 Stage 2.4-B 既存 breadcrumb で query 動作確認 | ☐ |
| 9 | 通知先 test 配信確認 (Slack #aneurasync-alerts) | ☐ |
| 10 | synthetic event で alert 動作確認 | ☐ |
| 11 | §5.3 daily review cadence operator 担当確定 (CEO / dev team) | ☐ |
| 12 | red alert 受信時の rollback plan 周知済 (Stage 2.4-D §5) | ☐ |

### 7.2 Stage 2.4 全 phase 完了 (累積)

| # | 項目 | 状態 |
|---|---|---|
| 13 | Stage 2.3 Yellow PASS (Round 10) | ✅ |
| 14 | Stage 2.4-A1-3 routing spec | ✅ (`34067d98`) |
| 15 | Stage 2.4-A2 selector test PASS | ✅ (`e14682cd`) |
| 16 | Stage 2.4-B Yellow付きPASS | ✅ (`208494c7`) |
| 17 | Stage 2.4-C Yellow 付き観察ベース PASS | ✅ (`abb6f8db`) |
| 18 | Stage 2.4-D docs-only audit | ✅ (`9df69549`) |
| 19 | Production env で `NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT` **未設定** 確認 | ☐ |
| 20 | Production env で `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE` **未設定 or false** 確認 | ☐ |
| 21 | Production env vars 反映計画確認 (Stage 2.4-D §3.1) | ☐ |
| 22 | rollback / kill switch plan 周知 (Stage 2.4-D §5) | ☐ |

### 7.3 全 22 項目 ✅ → CEO 個別判断で Production reflection 実施可能

---

## §8 不変境界 (本書 + CEO 操作期間中、CEO 厳守)

- ✗ Production env 変更しない (本書は提案のみ、env 反映は CEO 個別判断後)
- ✗ Production reflection しない (CEO 個別判断、本書は前提条件のみ)
- ✗ main merge しない (CEO 判断保留)
- ✗ production context detector 実装しない (Gap 4、Stage 2.5 / 別 milestone)
- ✗ selectPattern / prompt 修正しない
- ✗ validator / model / max_tokens / timeout 変更しない
- ✗ **Claude が Sentry alert を自律設定しない** (CEO operator 担当)
- ✗ Sentry custom metric impl しない (Stage 2.5 候補)
- ✗ 追加 smoke しない

---

## §9 残課題 (本書範囲外、別 phase)

| 項目 | 残置先 |
|---|---|
| 6 指標の **直接** Metric Alert 化 (Sentry custom metric impl) | **Stage 2.5 候補**、Production reflection 後の運用改善 |
| Discover saved query の **自動 cadence 化** (alert 化) | Sentry plan 拡張 / 別 alert tool integration、別 task |
| review summary 自動投稿 (`#aneurasync-alerts` への daily summary bot) | 別 task |
| query syntax 検証 (CEO §6.3 動作確認次第) | 結果次第で本書 update / CEO 個別判断 |

---

## §10 改訂履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 0.1-draft | 2026-05-09 | Stage 2.4-D 後 Sentry alert handoff doc 初版起草。CEO 既往 4 alerts (Urgent / speech exception / route p95 / 5xx rate) + Slack `#aneurasync-alerts` integration 完了状態を反映。残 6 Discover saved query の click-by-click 手順 (§6) + Production reflection 前チェックリスト 22 項目 (§7) 含む。 6 指標 standard alert 化制約 (§2)、impl 修正なしの代替方針 (§2.3)、Stage 2.5 候補 (§9) 明記 |

---

**End of CoAlter Stage 2.4 Sentry Alert Setup Handoff v0.1-draft**
