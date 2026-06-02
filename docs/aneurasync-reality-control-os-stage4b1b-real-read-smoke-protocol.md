# Reality Control OS — Stage 4-B-1B: Real Read Smoke Protocol / Adapter Execution Plan

> 起草: Build Unit / 2026-06-03 / **設計（手順）のみ・実装/実行しない・要 CEO 承認**
> 前段: 4-B-1（gated smoke core・commit 328994e6）＋ 4-B-1A（column-restricted adapter skeleton・commit b3924ea0）完了。
> GPT 監査（2026-06-03）「実 client 注入の前に Real Read Smoke Protocol を挟め」を独立推論で精密化。
> 🔴 本書では **実 Supabase client / createClient / service role / 実 DB read / route / UI / console / file / DB save / push / native / Routes** に一切進まない。

---

## 0. 目的と 1B→1C 分離（rule ⑤ 逆算）

**唯一のゴール**: 「CEO 1 アカウントに対する *単発* の実 column-restricted read を、raw が漏れない・blast radius 最小・完全 fail-closed で実行できる手順を確定する」。

GPT 指摘の核心 ——「**実 client を注入するコードは、書いた瞬間に実データ接触経路が生まれる**」—— を受け、段を 2 つに割る:

```
4-B-1B（本書）  Real Read Smoke Protocol = 条件 / 列 / 出力 / 失敗 / 検証 / 1C 変更プレビュー（コードなし）
4-B-1C（別承認） CEO 明示 GO 後、単発・dev-only の実 DB read smoke を 1 回だけ実行
```

本書を CEO が承認して初めて、4-B-1C（実 client 注入＋1 回読取）の可否判断に入る。

---

## 1. 実 DB read の実行条件（全て満たすときのみ・1 つでも欠ければ no-op）

- CEO **1 アカウントのみ**（`requestedUserId === allowedDevUserId`）
- **dev-only** / **production は必ず no-op**
- flag **default off** ／ **CEO 明示許可 flag 必須**
- **capability token 必須**（`{ devOnly: true }`）
- **単発手動**（dev harness / 手動起動のみ）
- **常時 shadow 禁止**（route / cron / UI / 自動・定期実行に繋がない）
- **population read 禁止**（複数ユーザー・全件走査を作らない）

> これらは既に `evaluateSmokeGate`（dev-runtime.ts）で実装・テスト済。4-B-1C は **gate を変えず** real client を注入するだけ。

---

## 2. 読む列（grounded: external_anchors 実列）

**許可列（これだけ SELECT する）**:
| 列 | 用途 | 出力に出すか |
|---|---|---|
| `id` | anchor 識別（内部） | ❌ 出さない（ephemeral `c{n}` 化） |
| `start_time` | mode/重複判定（内部） | ❌ 出さない（個別時刻禁止） |
| `end_time` | 同上 | ❌ 出さない |
| `rigidity` | importance/flexibility/hard（内部） | ❌（enum 化された importance のみ） |
| `sensitive_category` | sensitive boolean 判定（内部） | ❌ **絶対に出さない**（§3） |

**禁止列（SELECT に絶対含めない）**:
`title` / `location_text` / `location_category` / `external_uid` / `source_id` / `notes`(別テーブル) / `description` 等の自由文 / raw user text / **PlanSeed 関連（plan_seeds テーブルごと触れない）** / 第三者識別子。

- SELECT 句は **`ANCHOR_COLUMNS_SQL` 固定**（`"id, start_time, end_time, rigidity, sensitive_category"`）。`select("*")` 禁止（既存 `listAnchors` は使わない）。
- `buildDayGraph` を使わない（`ExternalAnchor[]`＝title/location を運ぶ raw 型）。`SafeDayGraphProjection` のみ。

---

## 3. `sensitive_category` の扱い（最重要・GPT 懸念 #1）

- **内部判定にのみ使用**: `sensitive: sensitive_category != null`（boolean 化）。**カテゴリ文字列（"medical"/"private" 等）を保持しない**。
- **出力・report・line・dev report に絶対に出さない**。
- ✅ **現状コードで既に構造的に保証済**（根拠）:
  - `projectToRealityInput`（dev-runtime-adapter.ts）は `sensitive` boolean のみ格納。category 文字列を捨てる。
  - `RealityInput` / `ShadowSummary` / `DevReportRedacted` に sensitive_category を載せる場所が型に無い。
  - テスト: `JSON.stringify(input)` に "medical" 不在。
- 4-B-1C 検証で再確認（returned object に category 文字列が出ないこと）。

---

## 4. 出力制限（counts/distributions のみ）

- 戻り値は **`assertRedacted` 済の redacted object のみ**。
- **出さないもの**: 個別時刻 / 実 ID / raw text / location / **sensitive_category** / 第三者名。
- **出してよいもの**: counts / distributions / mode / delivery / gate / invariant counts ＝ **`DevReportRedacted`**（最も集約された形）。4-B-1C の戻り値は `aggregateShadowReport([summary])`（個別 summary でなく集約）に限定する。

### 4.1 数値漏洩の盲点（GPT 懸念 #3 が露呈・rule ⑦）
- `assertRedacted` は **文字列のみ検査し、数値を見ない**（redaction-guard は string-leaf 走査）。
- ゆえに「時刻を `540`(分) のような **数値** で report に足す」と allowlist は捕捉**できない**。
- **不変条件（protocol）**: 出力型の数値フィールドは **counts のみ**（`runs`/`totalCandidates`/分布カウント等）。**時刻・分・継続時間・座標を出力型に持たせない**。
  - 現状 `ShadowSummary`/`DevReportRedacted` はこの不変条件を満たす（時刻数値フィールド無し）。4-B-1C で新フィールドを足す際は本条件を必ず守る。
  - 将来必要なら `assertNoDomainNumerics`（counts 以外の数値を検出）を追加検討（今は型設計で担保・rule ③ シンプル優先）。

---

## 5. Failure Behavior（全て fail-closed・raw なし）

| 失敗 | 挙動 | 返す code |
|---|---|---|
| flag 不正 / 欠落 | no-op | `FLAG_OFF` |
| user 不一致 | no-op | `OUT_OF_SCOPE_USER` |
| production | no-op | `PRODUCTION` |
| capability 欠落 | no-op | `NO_CAPABILITY` |
| query 失敗 | no-op | `ADAPTER_DEGRADED`（raw/stack を含めない） |
| redaction 失敗 | 出力破棄 | `REDACTION_BLOCKED` + `offendingCount` のみ |
| **予期せぬ列混入**（query が想定外フィールドを返す） | projection が無視（許可フィールドのみ読む） | — （混入は出力に影響しない） |

- error は **raw を含まない code のみ**。
- どの失敗でも **既存 UX を 1mm も変えない**（route/UI 非接続ゆえ構造的に不変）。

---

## 6. Tests / Verification（4-B-1C 実装時の必須チェックリスト）

- [ ] `select("*")` が使われない（real client 注入後も SELECT 句が `ANCHOR_COLUMNS_SQL` 固定）
- [ ] forbidden columns が SELECT されない
- [ ] **PlanSeed read が存在しない**（query は external_anchors のみ・plan_seeds に触れない）
- [ ] production / flag-off / user mismatch で **loader（実 client）が呼ばれない**（spy 0 回）
- [ ] returned object に **実 ID / title / location / sensitive_category / 個別時刻** が出ない（`JSON.stringify` 走査）
- [ ] returned object は **counts/distributions のみ**（`DevReportRedacted`）
- [ ] console / file / DB / push が **0 回**（spy）
- [ ] `assertRedacted` 失敗時は出力破棄（`REDACTION_BLOCKED`）
- [ ] 数値フィールドは counts のみ（時刻数値が無い）

> 4-B-1A の mock/spy テスト（13）は real client に差し替えても **同一アサーションが通る**こと（real client は `SupabaseLikeClient` を structural に満たす）。

---

## 7. 4-B-1C 分割（GPT 監査: a=wiring skeleton / b=実 read 実行）

GPT 指摘「実 client コードは書いた瞬間に実データ接触経路が生まれる」を受け、4-B-1C を 2 段に割る:

```
4-B-1C-a（実装済）  real read wiring skeleton。query 形＋境界契約を確定し mock/spy 検証。実 client 非 import・実 read なし
4-B-1C-b（要 CEO 明示 GO） 実 client 1 行注入＋CEO 1 アカウントの単発手動実 read smoke
```

### 7.1 Stage 4-B-1C-a 実装済（**実 DB read なし**・commit 後述）
- ✅ `lib/plan/reality/integration/dev-runtime-realsource.ts`（`import "server-only"`・barrel 非 export・**createClient/service role 非 import**）:
  - `UserContextClient`（RLS 適用 client の最小 interface。**service role を渡さない**前提）＋`DatedQuery`（eq×複数＋limit 終端）
  - `RealReadBounds { date; limit }`＝**date+limit 必須**（型で全期間・無制限を防ぐ）
  - `createDatedColumnRestrictedAnchorSource(client, bounds)`：query = `from(external_anchors).select(ANCHOR_COLUMNS_SQL).eq(user_id,uid).eq(date,day).limit(n)` → `projectToRealityInput`（4-B-1A 再利用・raw を運ばない）
- ✅ 証明（`tests/unit/realityDevRuntimeRealsource.test.ts`・8 tests）: select は許可列のみ・"*"でない・raw 列なし / user_id+date eq + limit 全付与（mock spy）/ date·limit 型必須 / raw 混入 row でも clean（渋谷/medical/実id 不在）/ gate fail で query 未発行 / seed メソッド不在
- ✅ vitest: `server-only` を test stub に alias（`tests/stubs/server-only.ts`・production 不変）。**全 15921 tests PASS**（回帰なし）
- ⏳ **4-B-1C-b（要 CEO 明示 GO）**: 実 user-context client（**service role でない**）を 1 行注入＋`bounds={date: today, limit}` で CEO 1 アカウントを **1 回だけ**読む。start_time の実フォーマット（ISO 等）→HH:MM 正規化もここ。戻り値は `aggregateShadowReport([summary])`＝`DevReportRedacted`（counts のみ）。route/cron/UI から呼ばない（常時化しない）

### 7.2 4-B-1C-a 禁止事項（厳守済）
実 DB read 実行 / service role / population read / 全期間 read / route·UI·PlanClient·Server Action 接続 / console·file / DB 保存 / push / PRM 実更新 / native / Routes / 自動予定変更 / PlanSeed 読取 —— **すべてなし**。

### 7.3 Stage 4-B-1C-b: **runner completed / real smoke execution NOT yet performed**
> 用語（CEO 指定・2026-06-03）: 完了したのは **4-B-1C-b runner / report contract**。**実 DB read smoke そのものは未実行**（real smoke execution not yet performed）。

**前提（実行者）**: 4-B-1C-b は「service role 禁止・RLS user context・CEO 本人の認証文脈・単発手動」ゆえ、**実行者は認証済みの CEO 本人**（サンドボックスの AI ではない）。AI は CEO の JWT/user id を持たず service role も使えないため、**実 read を自律実行しない/できない**。よって本段の AI 成果物は「安全を全てコードで強制した runner ＋構造的 redacted レポート」までで、**実行（実データ接触）は CEO の手動 1 回・未実施**。

- ✅ `lib/plan/reality/integration/dev-runtime-smoke.ts`（`server-only`・barrel 非 export・**createClient 非 import**）:
  - `runRealReadSmoke(deps)`: service_role 拒否 → gate → load 1 回 → `rowsRead`=count → runShadow → `assertRedacted`(summary ∧ aggregate) → `RealSmokeReport`
  - `RealSmokeReport`（**型で raw を排除**）= `{ status, code?, rowsRead(count), date, limit, recurringIncluded:false, serviceRoleUsed, redactionPass, report:DevReportRedacted }`。実 id/title/location/sensitive_category/個別時刻/raw row を**型に持たない**
- ✅ 証明（`tests/unit/realityDevRuntimeSmoke.test.ts`・9 tests）: report 構造が許可キーのみ / 実 anchor id 不在 / report は counts/distributions のみ / service_role→拒否&load 0 回 / gate fail→load 0 回 / source throw→raw なし / 全キーが GPT 許可集合の部分集合
- ✅ 構造的安全: `runRealReadSmoke` は非 test コードから呼ばれない＝**実 read 経路なし**。createClient を import しない
- ✅ **limit ≤ 50 強制**（CEO 固定条件）: `MAX_SMOKE_LIMIT=50`・`clampSmokeLimit` で query `.limit` と report echo の両方を `[1,50]` に clamp（>50 指定でも 50 しか読まない）

**CEO 固定条件 → コード強制箇所**:
| 固定条件 | 強制 |
|---|---|
| CEO 1 account / dev-only / production no-op / allowedDevUserId 一致 | `evaluateSmokeGate` |
| service role 禁止・user RLS のみ | `clientContext==="service_role"` → 拒否 |
| date 指定日 1 日 | `.eq("date", date)`（range 不可） |
| limit 必須・初回 ≤50 | 必須型 ＋ `clampSmokeLimit`（≤50） |
| one-off のみ・recurring 除外 | `.eq("date")` は date=null の recurring を除外・`recurringIncluded:false` |
| PlanSeed 不読 | table=external_anchors 固定・seed メソッドなし・seedTraces 強制空 |
| 許可列のみ | `ANCHOR_COLUMNS_SQL` 固定（"*"/raw 列なし） |
| 返却 RealSmokeReport のみ・raw 排除 | 型で id/title/location/sensitive_category/個別時刻/raw row を持たない |
| assertRedacted 失敗→破棄 | `redactionPass=false` → `status:"blocked"`・report は空 |

**CEO 手動実行レシピ（4-B-1C-b 実行＝初の実 Plan データ接触）**:
```ts
// dev-only の認証済みコンテキスト（例: CEO がログイン中の dev server action / dev script）で：
import { createDatedColumnRestrictedAnchorSource } from "@/lib/plan/reality/integration/dev-runtime-realsource";
import { runRealReadSmoke } from "@/lib/plan/reality/integration/dev-runtime-smoke";
// userClient = CEO 本人の RLS 文脈 client（service role でない・anon key + CEO JWT）
const ds = createDatedColumnRestrictedAnchorSource(userClient, { date: "<today>", limit: 50 });
const report = await runRealReadSmoke({
  gate: { nodeEnv: process.env.NODE_ENV, flagEnabled: <明示GO flag>, capability: "dev-only",
          requestedUserId: <CEO user id>, allowedDevUserId: <CEO user id> },
  dataSource: ds, clientContext: "user_rls", date: "<today>", limit: 50,
});
// report は RealSmokeReport（counts のみ）。これを CEO が貼れば AI が解釈する。console.log は CEO 判断。
```
- 1 回読んだら終了（常時化しない）。route/cron/UI から呼ばない。
- 戻り値 `RealSmokeReport` は構造的に redacted ゆえ、貼り付けても raw は出ない。

---

## 8. 実装禁止（4-B-1B で厳守）

実 Supabase client import / createClient / service role / 実 DB read / route / UI / PlanClient 接続 / console / file 出力 / DB 保存 / push / native / Routes / 自動予定変更 —— **すべて禁止**。本書は手順設計のみ。

---

## 9. CEO 判断ポイント

1. 本 4-B-1B protocol を承認するか（条件 / 列 / sensitive_category / 出力 / 失敗 / 検証 / 1C プレビューの確定）
2. 承認後、**4-B-1C**（real client wiring 1 ファイル追加＋CEO 1 アカウントの単発実 read smoke）に進んでよいか ——**ここで初めて実 Plan データに触れる**。要明示 GO
3. protocol をさらに精緻化 / 一旦停止

> GPT の段階分割に同意。実 client コードは「書いた瞬間に接触経路」ゆえ、本 protocol 承認を 1C の前提とする。
