# CoAlter Movie Understanding Diagnostics — Read-only Retrieval API Preflight (A4-pre)

**作成日**: 2026-05-16
**ステータス**: **docs-only preflight、code 変更なし**
**起草 branch**: `docs/coalter-understanding-diagnostics-retrieval-a4-preflight`
**正本依存**:
- PR #146 (A2 redacted diagnostics buffer、`173b3a16`)
- PR #147 (A3 collector fan-out wiring、`beecefec`)
- `docs/coalter-step-e-pre-checklist-audit.md` §1.1 (E-1 shadow 観測)

## §0 本書の position

### §0.1 目的

A2 buffer + A3 fan-out で **redacted diagnostics events** を Preview env 内で memory-only に蓄積できるようになった。本書は、その buffer snapshot を **安全に取り出す read-only retrieval API (A4)** の **preflight / auth 設計** を整理する。

**重要 (CEO 2026-05-16)**:
- 本書は **docs-only preflight**。route 実装には進まない。
- A4 実装 (route 追加) は本 preflight の結論 + CEO 戦略判断後に **別 PR** で実施。
- 本書の merge は「A4 設計を main に保存」を意味するのみ、A4 実装着手判断ではない。

### §0.2 Source-of-truth Hierarchy

- **Tier 1**: `lib/coalter/understanding/redactedDiagnosticsBuffer.ts` (A2、PII firewall 仕様)
- **Tier 1**: `lib/coalter/understanding/diagnosticsFanout.ts` (A3、fan-out 仕様)
- **Tier 1**: `docs/coalter-step-e-pre-checklist-audit.md` (Step E-1 shadow 観測仕様)
- **Tier 2**: CEO 2026-05-16 指示 (Auto-merge lane / Stop-before-merge lane 定義)

### §0.3 制約 (docs-only)

- ❌ runtime 実装 / lib / src / tests / package / supabase/migrations 変更
- ❌ env / production / Vercel env 変更
- ❌ route / API / ChatClient / UpperLayerMount touch
- ❌ secrets value を本書に書く
- ❌ production 変更
- ✅ docs-only preflight 整理

---

## §1 A1-A5 timeline 内での A4 位置付け

| Phase | 内容 | 状態 | 本書での扱い |
|---|---|---|---|
| A1 | Preview env で `COALTER_UNDERSTANDING_SHADOW_MOVIE=true` (shadow 起動) | ✅ Preview env CEO 追加済 (smoke 後 rollback 別判断) | 前提 |
| A2 | redacted diagnostics buffer helper (PR #146) | ✅ MERGED | 前提 |
| A3 | collector fan-out wiring (PR #147) | ✅ MERGED | 前提 |
| **A4-pre (本書)** | **read-only retrieval API preflight / auth design** | ⏳ **本 PR** | **本書 scope** |
| A4-impl | retrieval API route 実装 | ❌ 未着手 (CEO 戦略判断必須) | 本書の結論を反映する別 PR |
| A4-env | Preview env に `COALTER_UNDERSTANDING_BUFFER_FANOUT=true` 追加 | ❌ 未着手 (CEO 別判断) | A4-impl 後 |
| A5 | Step E-1 gate 評価 (U1-U5 観測) | ❌ 未着手 (CEO 戦略判断必須) | A4 完了後 |
| A6+ | Step E-2 canary / E-3 本番 flip | ❌ 未着手 (CEO 戦略判断必須) | future |

→ **A4 は A2-A3 で蓄積された data を「人間が見られる」入口**を作る phase。

---

## §2 A4 API の目的 (CEO 9 項目)

1. A2 buffer snapshot を **安全に読む**
2. A3 fan-out 後の **動的 smoke** に使う (CEO 実機検証で「shadow が実際に動いているか」確認)
3. **Step E-1 判断材料** にする (U1-U5 観測指標を buffer 経由で取得)
4. **production observation rollout ではない** (Preview のみ、PII firewall 厳守)
5. read-only (write / mutate しない)
6. no DB / no Supabase (memory-only buffer、Vercel function process 内)
7. no external telemetry (Sentry / 外部 sink への送信なし)
8. CEO 戦略判断後のみ実装着手 (本 preflight は設計のみ)
9. rollback 容易 (route 削除 / env OFF で即停止)

---

## §3 絶対条件 (CEO 必須)

| 条件 | 設計反映 |
|---|---|
| **Preview-only** | env guard (`VERCEL_ENV === "preview"`)、production = 404 |
| **read-only** | GET only、POST/PUT/DELETE 不実装 |
| **no production exposure** | env guard + token guard 二重防御 (twin-layer guard) |
| **no write** | mutate 0、buffer は read only |
| **no DB** | Supabase / database 接続なし |
| **no storage** | localStorage / sessionStorage / cookie / file write なし |
| **no external telemetry** | Sentry / 外部 API への送信なし |
| **no raw text / PII** | A2 buffer の PII firewall で構造的に保証 (snapshot は redacted shape) |
| **no userId / pairId / threadId / message / URL / email** | A2 buffer scope 外、構造的に含まない |
| **no production env 変更 (本 PR)** | docs-only |
| **no secrets value 本書記載** | docs-only |

---

## §4 auth 設計 4 候補比較

### §4.1 候補一覧

| Option | 仕組み | メリット | 致命的問題 | 評価 |
|---|---|---|---|---|
| **A: Preview env + secret token header** | Vercel Preview env に token、`Authorization: Bearer` 検証 | production env に token 不在 → production 絶対動かない、HTTP standard、rollback 容易 | 1 secret 全員共有 (人別 audit 不可、許容範囲) | 🟢 **現実解 / 推奨** |
| B: admin-only session (Supabase) | Supabase auth admin role | 人別 audit、既存 auth | ❌ Supabase 接続 = CEO 禁止項目「DB / Supabase」抵触、Preview-only enforce 困難 (production も auth 通る) | 🔴 **致命** |
| C: local/dev only (NODE_ENV=development) | development env のみ動作 | secret 不要、production 絶対動かない | ❌ Vercel Preview は `NODE_ENV="production"` build、A4 目的不達 | 🔴 **致命** |
| D: no API, CLI-only inspection | direct require() で snapshot | API 露出ゼロ | ❌ Vercel serverless では別 process から buffer 不可、per-process isolation で技術的に不可能 | 🔴 **致命** |

### §4.2 各候補の深層分析

#### Option A 詳細 (推奨)

**仕組み**:
```typescript
// route 内:
const isPreview = process.env.VERCEL_ENV === "preview";
if (!isPreview) return new Response(null, { status: 404 });  // production = 404

const expectedToken = process.env.COALTER_DIAGNOSTICS_TOKEN_CURRENT;
if (!expectedToken) return new Response(null, { status: 404 });  // token 未設定 = 404

const authHeader = req.headers.get("authorization");
if (!authHeader) return new Response("Missing auth", { status: 401 });

const providedToken = authHeader.replace(/^Bearer\s+/i, "");
// timing-safe comparison
if (!timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken))) {
  return new Response("Invalid token", { status: 403 });
}

// Auth pass → buffer snapshot 返却
const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
return new Response(JSON.stringify({ snapshot, schemaVersion: "0.1.0" }), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, private",  // CDN caching 防止
  },
});
```

**メリット詳細**:
- production env に token 設定しない → production では `expectedToken === undefined` → 404 返却 → **production に存在自体を隠す**
- HTTP standard `Authorization: Bearer <token>` pattern
- rollback: `vercel env rm COALTER_DIAGNOSTICS_TOKEN_CURRENT preview` で即停止 (route は残るが 404 返却)
- 完全停止: route file 削除 + env 削除
- audit: Vercel logs で route access 1 行残る

**デメリット詳細**:
- 1 secret 全員共有 → 人別 audit 不可。ただし A4 目的 (動的 smoke + Step E-1 観測) では Claude/CEO 2 名のみ access 想定、許容範囲
- secret 漏洩 risk: 漏洩しても buffer = redacted shape (PII 不含)、被害軽微

**Token rotation 設計** (人間超越 Idea B):
- `COALTER_DIAGNOSTICS_TOKEN_CURRENT` + `COALTER_DIAGNOSTICS_TOKEN_PREVIOUS` の 2 token 受領
- rotation 時: NEW 設定 → CURRENT に昇格、CURRENT を PREVIOUS に降格、旧 PREVIOUS 削除
- rotation window 中は両 token 動作、client 更新猶予あり

#### Option B 詳細 (致命)

- Supabase auth = CEO 禁止項目「DB / Supabase」抵触
- admin role 判定で Preview/Production を区別できない (auth が pass すれば production でも動く)
- → **採用不可**

#### Option C 詳細 (致命)

- Vercel Preview environment は **`NODE_ENV="production"` で build** (Next.js production build)
- `NODE_ENV === "development"` は local dev server (`npm run dev`) のみ
- → Preview で A4 が動かない、A4 目的不達
- → **採用不可**

#### Option D 詳細 (致命)

- Vercel serverless function = **request 単位で短命 process**
- buffer は module-level singleton (per-process) = **request が終わると buffer 含む process が destroy or cold**
- 別 process / 外部 CLI から buffer に access する手段が技術的にない
- → **採用不可**

### §4.3 推奨

**Option A (Preview env + secret token header) を推奨**。CEO 想定と一致、現実解。

---

## §5 endpoint shape

### §5.1 候補

- **Path**: `/api/coalter/diagnostics/preview`
- **Method**: **GET only** (POST / PUT / DELETE 不実装)
- **Headers**:
  - `Authorization: Bearer <token>` (必須)
  - `Cache-Control: no-store, private` (response、CDN caching 防止)
- **Query params**: なし (将来 `?limit=10` 等の余地は残すが本 phase は全 snapshot 返却)
- **Body**: なし (GET)

### §5.2 Status code matrix

| 状態 | Status | Body | 意図 |
|---|---|---|---|
| Production env (or VERCEL_ENV !== "preview") | **404** | empty | route 存在自体を隠す (人間超越 Idea E) |
| Preview env + token 未設定 (server-side) | **404** | empty | A4 未 enable 時は存在を隠す |
| Preview env + `Authorization` header 不在 | **401** | `{"error": "missing_auth"}` | auth 必須を明示 |
| Preview env + token 不一致 | **403** | `{"error": "invalid_token"}` | 認証失敗 |
| Preview env + token 一致 | **200** | snapshot JSON | 正常 |
| 内部エラー | **500** | `{"error": "internal_error"}` (詳細含めず) | fail-closed |

→ 404 vs 401 vs 403 で **production への route 存在隠蔽** + **auth エラー明示** を両立。

### §5.3 CORS

- **CORS 設定なし** (本 API は同一 origin の admin 用のみ想定)
- Preflight request (OPTIONS) も 404 (production env で OPTIONS 来ても 404)

---

## §6 response shape

### §6.1 success response (200)

```typescript
interface DiagnosticsRetrievalResponse {
  /** Schema version (semver、forward compat) */
  schemaVersion: string;  // "0.1.0"
  /** Retrieval API version */
  retrievalApiVersion: string;
  /** Buffer name (A2 と一致) */
  bufferName: "coalter.movie.understanding_shadow_diagnostics";
  /** Buffer size at snapshot time */
  bufferSize: number;
  /** Event count returned */
  eventCount: number;
  /** Redacted events (A2 buffer shape、PII 構造的不含) */
  events: RedactedUnderstandingDiagnosticsEvent[];
  /** Process metadata (per-process isolation marker) */
  processMetadata: {
    /** Per-process sequence number range */
    minSequenceNumber: number | null;
    maxSequenceNumber: number | null;
  };
  /** Reason codes (enum、deterministic sort) */
  reasonCodes: ("read_only_retrieval" | "preview_env_only" | "auth_required" | "no_external_side_effect" | "no_storage_no_db" | "redacted_events_only")[];
}
```

### §6.2 PII forbidden field 構造的検証

| Field | A4 response に含まれるか |
|---|---|
| userId / user_id | ❌ 構造的に不含 (A2 PII_FORBIDDEN_FIELD_NAMES) |
| pairId / pair_id | ❌ |
| threadId / thread_id | ❌ |
| message / raw_message / userMessage | ❌ |
| URL / email / phone | ❌ |
| name / displayName | ❌ |
| ipAddress | ❌ |
| timestamp / createdAt / emittedAt | ❌ |
| pairHash | ❌ (A2 buffer scope 外、A3 transformer で drop) |
| bundle / talk_messages | ❌ |

### §6.3 schema version 付与の意義 (人間超越 Idea L)

- A4 client (CEO 手動 curl / 簡易 dashboard / 将来 admin UI) が schema 進化を追える
- A4 future minor update で `schemaVersion: "0.2.0"` 等に bump 可能

---

## §7 rollback

### §7.1 rollback layer

| Layer | 手段 | 速度 | 完全性 |
|---|---|---|---|
| **L1 (即座、最も浅い)** | Preview env から token 削除 (`vercel env rm COALTER_DIAGNOSTICS_TOKEN_CURRENT preview`) | 即座 | 一時停止 (route は残るが 404 返却) |
| **L2 (即座、buffer fan-out 停止)** | `vercel env rm COALTER_UNDERSTANDING_BUFFER_FANOUT preview` | 即座 | A3 fan-out 停止 (buffer に新 data 流れない) |
| **L3 (即座、shadow 停止)** | `vercel env rm COALTER_UNDERSTANDING_SHADOW_MOVIE preview` | 即座 | A1 shadow 自体を停止 |
| **L4 (PR 経由、完全削除)** | route file 削除 PR + merge + redeploy | 数分 | route 完全削除 |
| **L5 (revert、最深)** | A2 + A3 + A4 を revert | 数分 | 全 phase 取消 |

### §7.2 推奨 rollback order

1. 異常検知 → L1 (token 削除) で即座停止
2. 原因調査 → buffer に問題あれば L2 + L3
3. route 自体問題なら L4
4. 設計問題なら L5

---

## §8 A4 実装に進む停止条件

以下のいずれかが当てはまる場合、A4 実装 (route 追加) に進まず再設計:

| 停止条件 | 対応 |
|---|---|
| **auth が曖昧** (Option A 以外採用、または token 管理方針未確定) | 再 preflight |
| **Preview-only が保証できない** (env guard 設計不備) | 再 preflight |
| **production に露出する** (env guard 漏れ) | 再 preflight |
| **raw text / PII が必要になる** (A2 buffer scope 外の data) | A4 scope 縮小、または A5 / Step E-2 で別途検討 |
| **token 管理が曖昧** (rotation / 漏洩対応 未定義) | §4 rotation 設計を確定 |
| **route が複雑化する** (auth 以外のロジック追加、cache 等) | scope 縮小、最小 route のみ |
| **CEO 戦略判断未完了** | 待機 |

---

## §9 推奨案 (CEO 戦略判断請求)

### §9.1 推奨設計 (1 案)

**Option A: Preview-only + secret token header + GET read-only + production 404**

設計要約:
- **endpoint**: `GET /api/coalter/diagnostics/preview`
- **auth**: `Authorization: Bearer <token>` header
- **env**: `VERCEL_ENV === "preview"` + `COALTER_DIAGNOSTICS_TOKEN_CURRENT` 両方必須
- **status**: production 404 / preview no-auth 401 / preview invalid-token 403 / preview valid-token 200
- **response**: A2 buffer snapshot + metadata (schemaVersion 付与)
- **no DB / no external API / no Sentry / no console new emit**
- **rollback**: token 削除で即座、route 削除で完全

### §9.2 人間超越設計 12 アイデア (推奨案に組込)

| # | アイデア | 効果 |
|---|---|---|
| A | **Twin-layer guard** | env guard + token guard 二重 gate |
| B | **Token rotation friendly design** | CURRENT + PREVIOUS 2 token、rotation window 確保 |
| C | **Per-process rate limit** | 同 process 内 burst 防止 (簡易 counter) |
| D | **Response shape narrow** | A2 redacted shape + metadata、schema version |
| E | **404 vs 401 vs 403 distinction** | production 隠蔽 + auth エラー明示 両立 |
| F | **GET only** | read-only、POST/PUT/DELETE 不実装 |
| G | **No cookie auth** | Header-only、CSRF mitigation |
| H | **Token comparison: timing-safe** | `crypto.timingSafeEqual`、timing attack 防止 |
| I | **Response no caching** | `Cache-Control: no-store` |
| J | **Audit log via existing console** | 1 行 access log のみ、新規 telemetry 不使用 |
| K | **Buffer snapshot atomic copy** | A2 defensive copy で race condition 不在 |
| L | **Schema version in response** | future client が schema 進化を追える |

### §9.3 A4 実装 scope (推奨)

別 PR で:
- 新規 file: `app/api/coalter/diagnostics/preview/route.ts` (~80 行)
- 新規 file: `lib/coalter/understanding/diagnosticsRetrievalAuth.ts` (~100 行、token verify helper)
- 新規 tests: `tests/unit/coalter/understanding/diagnosticsRetrievalAuth.test.ts`
- 新規 tests: route 単体テスト (もし feasible)
- env 設定: CEO 実行 (`vercel env add COALTER_DIAGNOSTICS_TOKEN_CURRENT preview`)
- **Stop-before-merge lane** (route 追加 + auth 検証)

### §9.4 A4 実装に必要な CEO 戦略判断

1. **Option A 採用確認**: 推奨案で OK か
2. **token 生成方針**: 32+ char random hex (CEO 側で生成、Vercel env に投入)
3. **rotation 方針**: 1 token 開始 (CURRENT のみ) vs 2 token (CURRENT + PREVIOUS) 設計含めるか
4. **smoke 計画**: A4 merge 後、env flip → CEO 実機で curl → buffer snapshot 取得確認
5. **observation 期間**: どのくらいの期間 buffer に貯めて Step E-1 gate 評価するか

---

## §10 まだやらない (本 PR scope 外)

- ❌ A4 route 実装 (本書の結論 + CEO 戦略判断後、別 PR)
- ❌ `COALTER_UNDERSTANDING_BUFFER_FANOUT=true` env flip (A4 implementation 完了後)
- ❌ `COALTER_DIAGNOSTICS_TOKEN_CURRENT` env 追加 (CEO 実行、A4 implementation 完了後)
- ❌ retrieval API 追加
- ❌ telemetry / Sentry 実送信
- ❌ console diagnostics ON
- ❌ `COALTER_UNDERSTANDING_DIAGNOSTICS` 変更
- ❌ `COALTER_MOVIE_CURATOR_LIVE` / `COALTER_THREE_STAGE` 変更
- ❌ Production env / Vercel env 変更
- ❌ DB / Supabase / migration
- ❌ DD4 / Travel T6 / Activity AD5
- ❌ Movie Step E-1 gate 評価着手
- ❌ bug1 cleanup / Stargazer pivot
- ❌ Master Design 本体更新

---

## §11 verify (docs-only、本 PR の制約)

| 項目 | 確認 |
|---|---|
| docs-only | ✅ 本 file (`docs/coalter-diagnostics-retrieval-preflight-a4.md`) 新規追加のみ |
| lib / src / tests / package / supabase/migrations touch 0 | ✅ |
| env 変更なし | ✅ |
| route / API 実装なし | ✅ |
| secrets value を書かない | ✅ (token 例示なし、placeholder のみ) |
| production 変更なし | ✅ |

---

## §12 CEO 判断請求

1. **本 preflight docs merge 判断** (docs-only Auto-merge lane 該当見込み、CI green 後 Claude 自律 merge)
2. **§9 推奨案 (Option A) の採用判断**
3. **A4 実装着手 timing 判断** (本 preflight merge 後、別 PR で route 実装)
4. **token 生成 / rotation 方針** (CEO 側準備)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
