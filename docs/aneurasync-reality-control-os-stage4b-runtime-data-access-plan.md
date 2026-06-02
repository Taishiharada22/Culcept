# Reality Control OS — Stage 4-B: Runtime Data Access Plan（**設計のみ・実装未着手・要 CEO 承認**）

> 起草: Build Unit / 2026-06-03 / **実装しない**。本書は「初めて実ユーザーデータに触れる」前の最終データアクセス設計。
> 前段: Stage 4-A（preflight＋pure redaction guard、commit be89a845）完了。`docs/aneurasync-reality-control-os-runtime-preflight.md`。
> GPT 監査（2026-06-03）「Stage 4-B 実装はまだ NG。次は Runtime Data Access Plan を出せ」を受け、独立推論で精密化。
> 🔴 本書を承認するまで、実 runtime 接続・route/UI/PlanClient 接続・実データ読取・console/file 出力・DB 保存・push・native・Routes・自動予定変更には **一切進まない**。

---

## 0. ゴールと逆算（rule ⑤）

Stage 4-B の**唯一のゴール**: 「**redaction 境界が *実データ* で保たれる**ことを、最小 blast radius・完全 fail-closed で確認する」。
これ以外（精度・UX・配信・学習）は 4-B の目的ではない。ゴールから逆算すると、4-B は次の最小形に縮む:

> **CEO 自身の 1 アカウントの anchors+DayGraph のみを、dev-only flag 下で読み、入口で raw フィールドを捨て、kernel を通し、出力前に `assertRedacted` を強制し、redacted object を関数戻り値としてのみ返す。失敗は全て no-op。**

seeds・他ユーザー・本番 path・保存・表示は 4-B に含めない。

---

## 1. Call-site 候補（server-only / dev-only・client 厳禁）

| 候補 | 採否 | 理由 |
|---|---|---|
| **`lib/plan/reality/integration/dev-runtime.ts`（新規・dev-only entry）** | ✅ **唯一の 4-B call-site** | barrel から再 export しない。dev-only route/Server Action からのみ到達 |
| 専用 dev route（例 `app/api/_dev/reality-shadow/route.ts`） | △ 4-B-2 で検討 | flag 下でのみ。production で 404/no-op |
| `app/(culcept)/plan/PlanClient.tsx`（client） | ❌ **禁止** | client bundle/DOM に raw が出る経路を作らない |
| 既存 plan route / Server Action（本番 path） | ❌ 禁止 | 本番 path に shadow を混ぜない |
| cron / 通知 worker | ❌ 4-B 範囲外 | push 段階（Stage 5+） |

- **「誰が呼ぶか」と「誰のデータか」を分離**: 呼ぶのは dev harness/dev route。読むのは **CEO の 1 アカウントのみ**（§3）。
- production では call-site 自体が **構造的 no-op**（§2）。

---

## 2. Flag Gate（多層 fail-closed）

Stage 4-A §2 の 3 層を踏襲・確定:

```
層1 env flag       PLAN_FLAGS.realityShadowDevOnly  既定 false / production 強制 false
層2 module boundary dev-runtime.ts は integration barrel から再 export しない。
                   本番 import 経路が存在しない（tree-shake で本番 bundle に入らない）
層3 capability arg  接続関数は { devOnly: true } トークン引数を要求。production code から取得不能
```

- **fail-closed**: flag 欠損 / 不正 / `NODE_ENV==="production"` / capability 欠落 → **即 no-op（データを読まずに返す）**。
- **kill switch**: env 1 つで全停止。CEO 明示許可時のみ on。
- production no-op は **テストで証明**（§7）: production 環境変数下で data accessor が **一度も呼ばれない**ことを spy で検証。

---

## 3. Data Surface（最小・seeds 厳禁）

### 3.1 4-B-1 で読むのは anchors + DayGraph **のみ**

GPT 制約 #2/#3 を採用＋**入口側フィールド allowlist（rule ⑦ 上乗せ）**: 出力だけでなく **入口で raw フィールドを読まない**。

| 型 | 読むフィールド（allowlist） | **読まないフィールド（raw）** |
|---|---|---|
| `ExternalAnchor` | `id`(→ephemeral 化) / `startTime` / `endTime` / `rigidity` / `sensitiveCategory`(分類のみ) / `sourceId`(→分類) | **`title` / location / notes / 第三者名 / raw 本文** |
| `DayGraph`(EventNode/GapNode) | `kind` / `id`(→ephemeral) / `startTime` / `endTime` / `rigidity` / `durationMin` / `attributes`(counts/enum) | **event の title / location / 任意ラベル** |

- **PlanSeed / `desiredAction` / user text / location raw / 第三者名は読まない**（raw 性が高い。seeds は 4-B-2 へ分離）。
- 入口で raw を読まない ⇒ **RealityInput すら自由文を運ばない**（4-A の R1 内部型リスクを 4-B-1 では発生させない）。これは出力 redaction より一段強い。

### 3.2 「誰のデータ」= 単一被験者・同意・可逆（rule ⑦ 上乗せ）

- 最初の実データは **CEO 自身の 1 アカウント**のみ。population read をしない（blast radius 最小）。
- 明示 opt-in、いつでも撤回可能。dev user id を flag/設定で 1 つ指定し、それ以外は no-op。

---

## 4. Redaction Boundary（入口＋出口＋producer 自己表明）

| 層 | 規則 |
|---|---|
| 入口 | §3.1 のフィールド allowlist。raw フィールドを RealityInput に入れない |
| 内部 | `RealityInput` は内部型（4-B-1 では自由文なし）。**serialize/emit/log しない** |
| 出口 | 外に出るのは `ShadowSummary` / `DevReportRedacted` のみ |
| **producer 自己表明（上乗せ）** | dev-runtime は **return 前に `assertRedacted` を強制**。`clean=false` なら出力破棄し **redacted 縮退**（§6）。raw を絶対に返さない |

- 二重防御: 入口で raw を断ち（予防）、出口で allowlist 表明（検出）。どちらか単独に依存しない。
- 将来オプション（4-B-2+・今は未実装）: N-version redaction（独立再走査で不一致 abort）。

---

## 5. Output Policy（GPT 制約 #1 を確定）

- **console.log 禁止 / file 出力禁止 / DB 保存禁止 / UI 表示禁止**。
- **関数戻り値の redacted object のみ**（`ShadowSummary` / `DevReportRedacted`）。dev 観測は harness が戻り値を受け `assertRedacted` 通過後に counts を見る。
- **report に出せる文字列 = enum / code / count / `c{n}` / `INV-\d+` のみ**。free-form 禁止。
  - ✅ **既に達成**: 出力型に `reason` フィールドは存在しない（`reason` は内部 `SourceTrace` のみ）。`line` は **`formatShadowLine`（structured フィールドのみから生成、commit 本 PR）** に集約済 ＝ raw inline 補間経路を構造的に排除。`devReportLine` は counts のみ（grammar テスト済）。
- 表示・保存・送信は **Stage 4-C 以降で別承認**。

---

## 6. Failure Behavior（全失敗 fail-closed・raw なし）

| 失敗 | 挙動 | 返す情報 |
|---|---|---|
| flag 無/不正/production | no-op | `{ status: "noop", code: "FLAG_OFF" }`（raw なし） |
| capability 欠落 | no-op | `code: "NO_CAPABILITY"` |
| 対象が dev user でない | no-op | `code: "OUT_OF_SCOPE"` |
| adapter 失敗（時刻 parse 等） | 当該 node skip。全滅で no-op | `code: "ADAPTER_DEGRADED"` |
| kernel 失敗（例外） | catch→no-op | `code: "KERNEL_ERROR"`（stack/ raw を出さない） |
| **redaction 失敗（`assertRedacted.clean=false`）** | 出力破棄→縮退 | `code: "REDACTION_BLOCKED"`, `offendingCount`(path 数のみ) |
| データ欠損 | 部分続行 or no-op | `code: "PARTIAL"` |

- **error も raw を含まない redacted error code のみ**。`offendingPaths` の **件数**は出してよいが値は出さない。
- どの失敗でも **既存 DayGraph / 通知 / UI を 1mm も変えない**。

---

## 7. Test Plan（4-B 実装時に追加。今は計画）

| # | 検証 | 種別 |
|---|---|---|
| T1 | **production env で no-op**（data accessor が呼ばれない＝spy 0 回） | fail-closed |
| T2 | **flag off で no-op**（同上） | fail-closed |
| T3 | capability 欠落 / out-of-scope user で no-op | fail-closed |
| T4 | **raw injection が出力に出ない**（title/location を仕込んでも `JSON.stringify(out)` に不在） | redaction |
| T5 | **seeds 未読**（PlanSeed accessor が呼ばれない＝spy 0 回） | data surface |
| T6 | 入口フィールド allowlist（title/location が RealityInput に入らない） | redaction |
| T7 | **assertRedacted 未通過なら return しない**（縮退 code を返す） | producer 自己表明 |
| T8 | console/file/DB/push 未使用（spy/mock で 0 回） | output policy |
| T9 | adapter/kernel/flag 失敗で既存 UX 不変・raw なし | failure |

- T1/T2/T5/T8 は **「呼ばれないこと」の証明**（spy）＝静的に no-op を保証。

---

## 8. Stage 4-B が **やらないこと** / 次ゲート

- やらない: seeds 読取（4-B-2）・他ユーザー・本番 path・UI 表示・DB 保存・push・native・Routes・自動予定変更。
- **Stage 4-C ゲート（別承認）**: dev 観測で redaction/分布が健全と確認後、初めて「on-open 提案を UI に surface（opt-in・flag）」へ。そこで UX 変更が初めて発生 → CEO 承認必須。

---

## 9. 実装順序（承認後・各段 flag・可逆）

```
4-B-1  dev-runtime.ts（多層 gate）＋入口フィールド allowlist＋producer 自己表明
       → CEO 1 アカウントの anchors+DayGraph を dev-only で読み runShadow→assertRedacted→戻り値のみ
4-B-2  seeds 追加（自由文経路を guard 下で検証）＋N-version redaction 検討
4-C    on-open 提案 surface（UX 変更・別承認）
```

### 9.1 実装状況（2026-06-03）
- ✅ **4-B-1 core 実装済**（`lib/plan/reality/integration/dev-runtime.ts`・pure・**実 DB 未接続**）:
  - 多層 fail-closed gate（`evaluateSmokeGate`: production / flag-off / capability 欠落 / CEO 以外 user → no-op）
  - 依存注入 `RealityDataSource`（**seed 読取メソッド無し**＝型で seeds 不可。返り値 `RealityInput` に title/location 無し＝型で raw 不可）
  - 二重防御（gate pass 後のみ load／`seedTraces` 強制空）
  - producer 自己表明（`enforceRedaction`: `assertRedacted` 通過時のみ summary 返却。違反は破棄し `offendingCount` のみ）
  - barrel 非 export（module boundary）。supabase/route/UI を import しない
- ✅ **証明**（`tests/unit/realityDevRuntime.test.ts`・18 tests）: production/flag-off/out-of-scope で **loadForSmoke spy 0 回**（実データ未接触）/ seeds 自由文を返しても出力に出ない / source throw→raw なし ADAPTER_DEGRADED / 実 id→ephemeral / redaction 違反→blocked / **console.log/error/warn 0 回**
- ⏳ **未実装＝CEO の manual smoke 部分**: `RealityDataSource` の **実 column-restricted 実装**（§9.2）。私（sandbox）は実認証情報を持たず実 DB を読まない・自動実行しない

### 9.2 Stage 4-B-1A: Column-Restricted Adapter Skeleton（**実装済・実 Supabase 未接続**・commit 後述）
GPT 監査「実 DB read の前に column-restricted adapter を mock 検証せよ」を実装。既存 `listAnchors`（`select("*")`）も `buildDayGraph`（`ExternalAnchor[]`＝raw を運ぶ）も **使わない**。

- ✅ `lib/plan/reality/integration/dev-runtime-adapter.ts`（pure・**実 Supabase 非 import**・barrel 非 export）:
  - `ALLOWED_ANCHOR_COLUMNS`（id/start_time/end_time/rigidity/sensitive_category）/ `FORBIDDEN_ANCHOR_COLUMNS`（title/location_text/location_category/external_uid/source_id/notes）
  - `ColumnRestrictedAnchorRow` 型（許可列のみ。title/location は **型に存在しない**）
  - `SafeDayGraphProjection` 型（raw なし最小 dayNodes + mode。**real DayGraph を読まない**）
  - `SupabaseLikeClient` 最小 interface（実 Supabase を import せず注入可能に）
  - `projectToRealityInput`：許可列 → RealityInput（title/location 不在・seedTraces 空）
  - `createColumnRestrictedAnchorSource(client)`：SELECT は **ANCHOR_COLUMNS_SQL 固定**（"*"・raw 列を渡せない）/ table は **external_anchors 固定**（plan_seeds 不可）
- ✅ 証明（`tests/unit/realityDevRuntimeAdapter.test.ts`・13 tests）: ALLOWED∩FORBIDDEN=∅ / select 引数は許可列のみ・"*" でない・raw 列なし（mock spy）/ raw 混入 row でも projection は無視（「渋谷」不在）/ 実 id→ephemeral / seed メソッド不在 / adapter 出力が smoke→assertRedacted-clean
- ⏳ **未実装＝次段（要承認）**: `SupabaseLikeClient` の **実 client 注入**（実 column-restricted DB read）。`import "server-only"`、flag on＋capability＋CEO user＋dev のときのみ、**単発手動**（route/cron/UI から呼ばない＝常時 shadow 禁止）。start_time の実フォーマット（ISO 等）対応もここ。

---

## 10. CEO 判断ポイント

1. 本 Stage 4-B Runtime Data Access Plan を承認するか（call-site/flag/data surface/redaction/output/failure/test の確定）
2. 承認後、**4-B-1 実装**（dev-only・CEO 1 アカウント・anchors+DayGraph のみ・fail-closed・戻り値のみ）に進んでよいか ——**ここが初めて実データに触れる一線**
3. それとも plan をさらに精緻化 / 一旦停止

> 本書は設計提案。**実装は CEO 承認後**。GPT の順序（plan → 承認 → 実装）に同意。
