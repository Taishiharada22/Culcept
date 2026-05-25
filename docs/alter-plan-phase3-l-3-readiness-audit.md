# Phase 3-L-3 Readiness Audit (= read-only design review)

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= L-1/L-2 着地後、 L-3 実装は **まだ NO**)
**範囲**: L-3 着手前に必須確認の 7 論点 + L-3 細分化提案 + STOP 条件

> ⚠️ **本 audit は実装着手を意味しない**。 L-3 design 妥当性検証のみ。
> 実装着手は本 audit + CEO 別 review を経て改めて判断。

---

## 0. Purpose

L-1-pure / L-2-pure 着地後 (= `5e5c4c88` + `23fa6c8c`、 59 tests PASS、 既存 file 変更 0)、 次段階 L-3 (= cascade orchestration / DayGraph integration / telemetry / geocode privacy / UI 接続) は L-1/L-2 より一段リスクが上がる。

**特に GPT 指摘**:
> 「次の勝負は、 移動解決を DayGraph に**混ぜる**か、 **overlay** として外に置くか です。 ここを間違えると K で作った『computed projection』 の綺麗さが崩れるので、 L-3 前に必ず設計確認を挟むべき。」

本 audit はこの一点を含む 7 論点を read-only で構造化する。

---

## 1. K phase 設計の再確認 (= L-3 の前提)

L-3 整合性判断の base となる K phase の設計事実を fix する:

| 事実 | 場所 | 含意 |
|---|---|---|
| `MovementTransition.timingStatus` は `"unresolved"` 単一 literal で固定 | `lib/plan/dayGraph/dayGraphTypes.ts:231` | L-3 で widening 不可。 `Omit` composition は L-1 で確立済 |
| `MovementTransitionView.label` は **「→ 移動」 固定** | `lib/plan/dayGraph/dayGraphTimelinePresentation.ts:288` | K-3c-iii の Negative Capability、 「移動 約 30 分」 を出すには L-3+ で別 view 層が必要 |
| `buildDayGraph` は **同期 pure** | `lib/plan/dayGraph/buildDayGraph.ts` | `resolveDuration` は `async` なので「混ぜる」 と signature 改変必須 (= K 破壊) |
| `MovementTransition` は **locationText のみ** で動く (= lat/lng 一切なし) | `lib/plan/dayGraph/movementTransitions.ts:78-86` | L-3 で coords を持ち込むには **外部から注入** する layer が必要 |
| `ExternalAnchor` schema に **lat/lng 永続化なし** | `lib/plan/external-anchor.ts:33-57` | DB migration なしでは coords を持ち回せない。 MapTab は毎回 geocode で取り直し |
| `/api/plan/anchors/geocode` は **既存実装**、 `MapTab.tsx` から client fetch で利用 | `app/api/plan/anchors/geocode/route.ts` + `app/(culcept)/plan/tabs/_usePlanGeocode.ts` | L-3 で新規 API 追加なしに既存経路を再利用可能 (= 但し送信内容は再確認必須) |

→ **L-3 設計の構造的制約**:
- K の `buildDayGraph` を asynchronify するのは **禁止** (= K 破壊)
- coords を持ち込むには **既存 geocode 経路を再利用** する以外に新規 API 不要
- 「→ 移動」 表示は K-3c-iii と互換維持しつつ、 L-3+ で「移動 約 30 分」 を別 view 層で出す

---

## 2. 7 論点 audit

### 2.1 Cascade orchestrator 優先順位 (= GPT 質問 1)

**問**: `manual_user → heuristic → unresolved` の順で本当に良いか?

**Audit**:

| 順位 | provider | 根拠 (= 思想) | risk |
|---|---|---|---|
| 1 | `manual_user` | user 明示は最強信号 (= confidence "high"、 reason "user_explicit") | user が誤入力した場合に誤値を高 confidence で表示する可能性 → L-3+ で「user override 削除 UI」 が必要 |
| 2 | `heuristic_distance` | API なし、 cost 0、 mode 不明だが distance だけは確かに動く | sensitive_both / location_unknown は **caller 側で除外する責務** (= provider 内 guard 有り) |
| 3 | `unresolved` (= sentinel) | 全 fallback 失敗時の最終出口 | reason の選択が「諦めの種類」 を表現する telemetry primary key |

**判断**: **採用可**。 但し以下を audit で明示:

- L-3 cascade の実装は **state-less orchestrator** (= 各 provider の `resolveDuration` を順次呼び、 ok を見つけたら return)
- **Google Routes (= L-3+)** が将来追加された場合の優先順位: `manual_user → routes_api → heuristic → unresolved` を推奨 (= 高 confidence 優先、 cost は budget cap で別途制御)
- cascade 自体は **provider 配列を constructor で受け取る** factory pattern (= 順序を test で制御可能)

**Sub-論点 (= 別途検討)**: user override が古い (= 1 年前の入力) 場合、 信頼性が下がるか? → 「過去 1 年は high、 それ以前は medium」 等の age-based decay は L-3 の最小 scope に含めず、 L-3+ で検討。

---

### 2.2 Provider failure 時の挙動 (= GPT 質問 2)

**問**: heuristic null / provider exception / coords 欠落 / sensitive proximity / 全 provider unusable の各シナリオで何が起きるべきか?

**Audit**:

| failure シナリオ | 現状 (= L-1/L-2 着地時点) | L-3 cascade の振る舞い |
|---|---|---|
| `heuristic` が null を返す (= ≤0.2km / NaN coords) | provider は `{ ok: false, reason: "heuristic_failed" }` を返す | cascade は次の provider (= unresolved sentinel) へ |
| provider 内で **exception throw** | **未定義** (= L-2 で `throw` を catch していない) | **L-3 で必須実装**: try/catch で `{ ok: false, reason: "api_error" }` に変換、 telemetry に記録 |
| coords 欠落 (= fromCoords / toCoords undefined) | provider は `location_unknown` で unresolved | cascade はそのまま伝搬、 segment は unresolved |
| `sensitive_both` | provider 内 guard で `sensitive_proximity` 返却 | cascade は **early-exit** (= heuristic / routes_api を呼ばない)、 unresolved 確定 |
| 全 provider unusable (= all `health: "down"`) | **未定義** | **L-3 で必須実装**: cascade entry で全 provider の `health` を check、 全 down なら即 `no_provider_available` |

**判断**: cascade orchestrator は以下の 3 layer を持つ必要がある:

```
[cascade orchestrator]
  ↓ (1) early-exit gate
      - sensitive_both → unresolved "sensitive_proximity"
      - location_unknown → unresolved "location_unknown"
      - all providers down → unresolved "no_provider_available"
  ↓ (2) provider sequential try
      - manual_user → heuristic → ...
      - 各 provider call を try/catch で wrap (= exception → "api_error")
  ↓ (3) final fallback
      - 全 provider fail → unresolved "no_provider_available"
```

**L-3 必須テスト** (= 各 failure mode 単独 firing):
- 各 provider exception → `api_error` 出力
- early-exit gate 3 種
- cascade 順序 (= manual_user 成功時に heuristic が呼ばれない)
- final fallback (= 全 fail 時)

---

### 2.3 Safe telemetry: runtime sink vs type only (= GPT 質問 3)

**問**: telemetry を runtime で出すか、 まだ type only に留めるか? raw address / title / user_id / anchor_id を出さない保証は?

**Audit**:

L-1 で `MovementResolutionTelemetry` は **type 定義のみ着地済**。 PII-free 構造 (= title / locationText / coords / userId / anchorId は型に存在しない) は L-1 test で検証済。

L-3 で sink を作る場合の選択肢:

| 選択肢 | 実装範囲 | risk | 判断 |
|---|---|---|---|
| **A. runtime sink を作らない** (= L-3 では型のみ) | L-3 範囲は cascade 動作確認まで | 観測指標が無いまま L-3 終了、 後で再観測 cost | **推奨**。 L-3 は cascade の構造正しさを確認するだけ、 telemetry sink は L-4+ で別途 |
| **B. console.log のみ** (= dev only) | NODE_ENV=development で `console.log` | production で出さない保証が漏れる risk | 非推奨 |
| **C. server endpoint POST** (= 永続化) | 新 endpoint / DB table / migration | dependency / migration / env 全部入り | **L-3 範囲外、 別 wave** |
| **D. localStorage (= client only)** | localStorage で日次 buffer | localStorage 不使用原則違反 | **永続禁止** |

**判断**: **A 採用 (= runtime sink 作らない)**。 L-3 では `MovementResolutionTelemetry` 型は不変、 sink 実装は **L-4 以降の別 wave** で再 audit を経て決定。

**PII 漏洩防止の構造保証** (= 型レベルで既に保証済、 sink 実装時に追加で必要なもの):

- 型レベル: `MovementResolutionTelemetry` に title / locationText / coords / userId / anchorId フィールドなし (= L-1 test 検証済)
- sink 実装時に追加すべき: redaction assertion at sink boundary (= runtime に「想定外 field が混入していないか」 を check する gate)

---

### 2.4 DayGraph integration: 混ぜる vs overlay (= GPT 質問 4、 **最重要**)

**問**: K の `MovementTransition` をどう `MovementSegment` に昇格するか? K frozen types を触らずに済むか? `buildDayGraph` 後の overlay にするか? `buildDayGraph` 内部に入れるか?

**Audit** — K phase の構造事実から導出:

| 選択肢 | 実装 | K への影響 | 評価 |
|---|---|---|---|
| **A. 混ぜる (= mix)**: `buildDayGraph` 内で `MovementSegment` を直接生成 | `buildMovementTransitions` を `buildMovementSegments` に置き換え、 内部で cascade resolve | (1) `buildDayGraph` を **async** にする必要あり → K の同期 pure 性破壊<br>(2) `MovementTransition` type 削除 or extension → K phase frozen 違反<br>(3) `DayGraph.transitions` の型変更 → K phase test 全件影響 | **禁止**。 K 設計思想 (= computed projection / pure deterministic) を破壊する |
| **B. overlay (= 推奨)**: `buildDayGraph` 後段で `resolveMovementSegments(graph) → Map<transitionKey, MovementSegment>` を別 layer で計算 | 新 file `lib/plan/transport/movementSegmentOverlay.ts`、 `buildDayGraph` 無変更 | (1) K phase 完全無傷<br>(2) `buildDayGraph` の同期 pure 性維持<br>(3) `DayGraph.transitions` (= `MovementTransition[]`) は L-3 では touch せず、 L-3 は **追加 layer** として動く | **推奨**。 K の computed projection 思想を継承 |
| **C. 並行 build (= parallel)**: `buildDayGraph` と独立に `buildMovementSegments(anchors, date) → MovementSegment[]` を別 entry で持つ | 完全に独立 build pipeline | (1) `MovementTransition` と `MovementSegment` の対応 (= 同 transitionKey での join) を caller が管理する責務<br>(2) overlay よりさらに loose coupling | overlay の代替案、 但し caller の責務が重い |

**判断**: **B (overlay) を採用**。 GPT 指摘通り「K で作った computed projection の綺麗さ」 を継承する唯一の選択肢。

**Overlay 設計の概要** (= L-3 で実装する場合):

```typescript
// lib/plan/transport/movementSegmentOverlay.ts (= L-3 で新規作成、 本 audit ではまだ書かない)

import type { DayGraph, MovementTransition } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { MovementSegment, TransportResolutionProvider } from "./transportTypes";

interface OverlayInput {
  graph: DayGraph;
  /** anchorId → 解決済 coords (= caller が geocode 経由で取得) */
  coordsByAnchorId: ReadonlyMap<string, { lat: number; lng: number }>;
  providers: ReadonlyArray<TransportResolutionProvider>;
  // user override や cache 等は L-3+ で別オプション
}

interface OverlayResult {
  /** transition key (= fromNodeId_toNodeId) → MovementSegment */
  segmentsByTransitionKey: ReadonlyMap<string, MovementSegment>;
}

export async function resolveMovementSegmentOverlay(
  input: OverlayInput,
): Promise<OverlayResult>;
```

**Overlay 設計の利点**:
- `buildDayGraph` 無変更 (= K phase frozen)
- `MovementTransition` を read-only で消費し、 `MovementSegment` を追加生成 (= K type 拡張なし)
- caller は K の `transitions[]` と overlay の `segmentsByTransitionKey` を **両方持つ**、 表示時に join
- L-3 UI 接続時に「overlay の `MovementSegment` を読むか、 K の `MovementTransition` だけ読むか」 を flag で切替可能 (= feature gate)

**Overlay 設計の制約**:
- overlay は async (= cascade orchestrator が async)
- caller は overlay 完了前に loading state を持つ必要あり (= K-3c-iii の「→ 移動」 fallback を維持)

---

### 2.5 Geocode privacy 再確認 (= GPT 質問 5)

**問**: L-3 で geocode endpoint を能動的に呼ぶ必要があるか? 既存 coords がある時だけ resolve する設計にできるか? geocode を呼ぶ場合、 既存 privacy 方針内か?

**Audit** — 既存 endpoint の現状 fix:

| 既存事実 | 確認内容 |
|---|---|
| `/api/plan/anchors/geocode` は既に MapTab が能動的に呼んでいる | `app/(culcept)/plan/tabs/MapTab.tsx:197` |
| `ExternalAnchor` schema に lat/lng 永続化なし | `lib/plan/external-anchor.ts` |
| geocode endpoint は **sensitive blocking 済** (= sensitiveCategory 設定済 anchor は Places API スキップ) | `app/api/plan/anchors/geocode/route.ts:80-96` |
| rate limit 100/hour per user / dedupe / cache 流用済 | `app/api/plan/anchors/geocode/route.ts:128` |
| Places API に送信するのは **textQuery (= locationText) のみ**、 title/notes/userId/anchorId 等は送信しない | `app/api/plan/anchors/geocode/route.ts:14-16` |
| 解決結果は client side で in-memory only (= localStorage / sessionStorage / IndexedDB 不使用) | `app/(culcept)/plan/tabs/_usePlanGeocode.ts:17-20` |

**L-3 で必要な選択肢**:

| 選択肢 | 実装 | privacy 評価 |
|---|---|---|
| **A. 既存 coords が無い場合は unresolved にする** (= geocode を呼ばない) | overlay の caller が coords を渡せない transition は全て unresolved | privacy 影響 0、 但し resolution rate が低い (= MapTab 表示 anchor 以外は coords なし) |
| **B. 既存 geocode endpoint を能動的に呼ぶ** (= MapTab と同じ経路) | overlay の caller が geocode 呼出を担当、 transition 候補 anchor の locationText を batch で送る | **既存 privacy 方針内** (= sensitive blocking + rate limit 既存) だが、 「Plan 全体 anchor」 ではなく **「visible window 内 transition の両端 anchor」 に絞る** のが望ましい (= 既存 MapTab と同じ lazy 戦略) |
| **C. 専用 transport geocode endpoint を新設** | 新 API + new env / migration | **永続禁止** (= L-3 範囲外) |

**判断**: **B 採用、 但し条件付き**:

- (1) L-3 で geocode 呼出を行う場合、 **既存 endpoint** (`/api/plan/anchors/geocode`) を **再利用** する (= 新 endpoint 作らない)
- (2) 呼出対象は **visible window 内の transition 両端 anchor のみ** (= MapTab と同じ lazy 戦略)
- (3) sensitive anchor の coords は server 側で blocking 済 → overlay 側で「coords 取得失敗」 を `sensitive_proximity` に変換する mapping が必要
- (4) **既存 privacy 方針内か再確認** (= 補正 wording 採用): `docs/alter-plan-phase2-c-map-tab-mini-design.md` に L-3 利用追加が privacy 方針更新を要するか別途 review
- (5) **privacy policy 更新の要否** (= 補正 wording 採用): MapTab 既存利用 + 同 endpoint = 大半は不要。 但し「不要と断定せず」、 L-3 着手前に CEO + 法務 visibility で再確認

**L-3 implementation timing 判断**:

| Phase | geocode 利用 |
|---|---|
| L-3 (= 最小 scope) | **A 採用**: coords が外から渡された transition のみ resolve、 geocode 呼出は overlay 内では行わない (= caller の責任) |
| L-3+ (= integration with MapTab) | **B 採用**: MapTab が既に geocode で取得した coords を overlay に渡す pattern (= 既存 geocode 経路を再利用、 transport 専用呼出 0) |

→ **L-3 では geocode を能動的に呼ばない**、 caller が渡せる coords だけで resolve、 残りは全て unresolved。 L-3+ で MapTab integration 時に geocode 経路を共有。

---

### 2.6 UI 接続: 「移動 約 30 分」 を出すタイミング (= GPT 質問 6)

**問**: K-3c-iii の階層 2 に沿って「移動 約 30 分」 を出すタイミング? L-3 ではまだ UI なしにするか? UI は L-6 に回すべきか?

**Audit** — K-3c-iii の現状 fix:

- `MovementTransitionView.label` = **「→ 移動」 固定** (= Negative Capability)
- duration / mode を出していない (= 設計 §10 OK / NG wording 規約)
- L-3 で「移動 約 30 分」 を出すには **別 view 層** が必要

**選択肢**:

| Phase | UI 接続 | 評価 |
|---|---|---|
| **L-3 (= cascade only)** | UI 無変更、 overlay 内部で MovementSegment を生成するだけ、 K-3c-iii の「→ 移動」 表示は維持 | **推奨**。 cascade の構造正しさを test で確認するのが目的、 UI は触らない |
| **L-4 (= UI integration)** | `dayGraphTimelinePresentation.ts` を拡張して `MovementTransitionView` から `MovementSegmentView` への昇格 path を作成、 K-3c-iii 規約に従う | L-3 着地後に CEO 判断で着手 |
| **L-5+ (= refinement)** | 「移動 約 30 分 (= heuristic)」 等の confidence 表示、 user override UI | L-4 着地後に再 audit |

**判断**: **L-3 で UI 接続 NO**。 L-3 は cascade orchestrator + overlay の **構造正しさ確認**のみ、 UI 接続は L-4 以降で別途 audit。

K-3c-iii の **不変原則の継承** (= L-3 で破ってはならない):
- `MovementTransitionView.label` の固定文言「→ 移動」 を維持
- `sensitiveProximity` のままで blur / aura しない
- 「予定なし」 等の **絶対禁止文言** は引き続き使わない

---

### 2.7 L-3 最小 scope への細分化 (= GPT 質問 7)

**問**: cascade orchestrator のみ / telemetry type のみ / DayGraph integration なし / UI なし のように、 さらに細分化できるか?

**Audit**:

L-3 を以下の sub-phase に細分化する提案:

```
L-3a: Cascade orchestrator (= state-less factory)
       新 file: lib/plan/transport/cascadeOrchestrator.ts
       入力: provider[] + MovementResolutionInput
       出力: MovementResolutionResult
       implementation: try-sequential + early-exit + exception catch
       tests: 失敗系 5 種 + 順序 1 + happy 1

L-3b: Overlay layer (= MovementSegment 生成)
       新 file: lib/plan/transport/movementSegmentOverlay.ts
       入力: DayGraph + coordsByAnchorId + providers
       出力: segmentsByTransitionKey
       implementation: transitions[] を read-only で消費、 cascade を呼んで segment を Map に積む
       tests: K-3c-iii compatibility (= K view 不変) + overlay output 整合性

L-3c: Telemetry type 追加 (= type only)
       既存 file 拡張: lib/plan/transport/transportTypes.ts
       追加: 「telemetry sink interface」 type 定義のみ、 runtime 実装なし
       tests: type-level 露出確認

L-3d: K-3c-iii compatibility 検証 (= 非破壊保証)
       既存 K tests を全件 PASS 維持
       新 test: overlay 経由でも K 出力が無変更
       coverage: buildDayGraph + dayGraphTimelinePresentation + 既存 55 tests
```

**判断**: **L-3a → L-3b → L-3c → L-3d** の 4 sub-phase で進行を推奨。 各 sub-phase 着地で test PASS + decision-log entry を経て次へ。

**L-3 最小 (= L-3a + L-3d) のみで先行する選択肢**:
- L-3b (= overlay) を skip して L-3a (= cascade) のみで停止
- 利点: overlay 設計判断を更に挟める、 cascade の構造正しさだけ先に確認
- 欠点: cascade だけでは MovementSegment が DayGraph に届かない (= 観測閉路が未完成)
- → **L-3a + L-3b セット** が現実的最小、 L-3c/L-3d は更に分割可能

---

## 3. L-3 最小 scope (= 提案)

CEO 判断用に L-3 を以下の最小 scope に絞ることを提案:

| sub-phase | scope | tests | 既存 file 変更 |
|---|---|---|---|
| L-3a (= cascade only) | `cascadeOrchestrator.ts` 新規作成、 cascade-only pure 関数、 provider exception catch / early-exit / try-sequential | 失敗系 5 + 順序 1 + happy 1 = ~7 tests | **0** (= L-1/L-2 file 無変更、 K phase 無変更) |
| L-3b (= overlay only) | `movementSegmentOverlay.ts` 新規作成、 DayGraph + coordsByAnchorId + providers を受け、 segmentsByTransitionKey を返す | overlay 出力整合 + K-3c-iii 非破壊 = ~8 tests | **0** |
| **合計 (= L-3a + L-3b)** | 2 新 file + 2 test file | ~15 tests | **0** |

**禁止 (= L-3 範囲外、 L-4 以降)**:
- UI 変更
- geocode 能動呼出 (= coords は caller が渡す pattern)
- runtime telemetry sink
- localStorage / DB / env / migration / package / dependency
- Arrival Risk Memory
- mode 推定 (= mode は L-2 と同じく "unknown" 固定で渡す)

---

## 4. STOP 条件 (= L-3 実装着手前 必須クリア、 CEO 判断)

下記いずれかが満たされない場合 L-3 実装着手禁止:

| STOP 条件 | 確認方法 |
|---|---|
| `buildDayGraph` の async 化が **不要** であることを設計上担保 | overlay 採用 (= §2.4 判断 B) を CEO 承認 |
| 既存 geocode endpoint を L-3 で能動的に呼ばない | §2.5 判断 (= L-3 で geocode 呼出 NO、 caller が coords を渡す pattern) を CEO 承認 |
| `MovementResolutionTelemetry` の sink 実装は L-4+ で別 audit を経る | §2.3 判断 A (= L-3 では type only) を CEO 承認 |
| `MovementTransitionView` の「→ 移動」 固定文言を L-3 で touch しない | §2.6 判断 (= L-3 で UI 接続 NO) を CEO 承認 |
| K phase 既存 55 tests が L-3 着地後も全件 PASS | L-3d で必須検証 |
| L-3 で新 env / migration / package / dependency / API 追加が **0** | L-3 着地時の git diff で確認 |

---

## 5. 永続禁止 (= 本 audit 範囲)

L-3 実装着手 (= 本 audit は read-only docs only) **以前** に以下は永続禁止:

- ❌ L-3 実装
- ❌ geocode active call
- ❌ UI 変更
- ❌ DB / env / package / dependency 変更
- ❌ localStorage
- ❌ runtime telemetry sink 実装
- ❌ Arrival Risk Memory
- ❌ warning / recommendation / optimization 文言
- ❌ fetch / push / gh
- ❌ reset / restore / stash / branch delete
- ❌ frozen branches への commit

---

## 6. 次の CEO 判断 (= 本 audit 後)

| 判断ポイント | 選択肢 |
|---|---|
| **Q1**: §2.4 で overlay 採用は OK か? | YES / NO (= 再設計) / DEFER (= 更に audit 必要) |
| **Q2**: §2.5 で L-3 は geocode 呼出 NO は OK か? | YES / NO (= geocode 呼出も含む scope に拡大) |
| **Q3**: §2.3 で L-3 は telemetry sink なし (= type only) は OK か? | YES / NO (= sink も含む) |
| **Q4**: §2.6 で L-3 は UI 接続 NO は OK か? | YES / NO (= UI も含む) |
| **Q5**: §3 で L-3 を L-3a (= cascade only) + L-3b (= overlay only) に細分化する案は OK か? | YES / PARTIAL (= L-3a のみ先行) / NO (= 一括) |
| **Q6**: L-3a (= cascade) 着手承認? | YES (= L-3a 実装 GO) / NO (= 別軸 pivot) / 別 PARTIAL |

---

## 7. 関連 docs

- `docs/alter-plan-phase3-l-transport-design.md` v0.2 (= L 全体 design)
- `docs/alter-plan-phase3-l-0-readiness-audit.md` (= L-0 readiness、 wording 補正済)
- `docs/alter-plan-phase3-k-daygraph-design.md` (= K phase 設計、 L-3 で継承する制約)
- `docs/decision-log.md` (= 2026-05-22 wording 補正 + PARTIAL 採用 entry)

---

## 8. 着地条件

- **本 audit 着地と同時に** `docs/plan-phase3-l-3-readiness-audit` branch を **frozen 扱い** とする (= 16 frozen branches 計)
- 以後の commit 禁止
- 次は CEO 判断 (= §6) に基づき、 L-3a 実装 branch を別途切る (= 着手承認後)
