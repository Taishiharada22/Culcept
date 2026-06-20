# Phase 3-L-4c Bridge Readiness Audit (= read-only、 pure pipeline helper まで連続 GO 可能と判定)

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= L-4a/L-4b 着地後、 「L-4c bridge readiness audit に進む。 audit 結果が pure helper / tests だけで済む low-risk 範囲なら連続実装 OK」 指示)
**範囲**: L-3 + L-4a/L-4b freeze 上に乗る L-4c bridge layer の責務分解 + low-risk 範囲判定

> 本 audit は **L-4c-pure (= pure pipeline helper) まで連続実装 GO** と結論する。
> ただし、 active geocode call / UI 接続 / MapTab/CalendarTab/FlowTab 改変 / runtime telemetry sink には **絶対に進まない**。

---

## 0. Purpose

L-4a/L-4b で「OverlayResult → MovementDisplayView」 への pure 変換が確立した。 次の論点は:

- caller (= 将来 UI 接続) が **どの input (= anchors + coords + providers) を渡せば、 一発で MovementDisplayResult を得られるか**

これを **pure pipeline helper** で提供する。 caller が個別に buildDayGraph / overlay / formatter を呼ぶ必要がなくなる。 UI 接続は本 helper を呼ぶだけで完結 (= 別 phase L-4d で実装、 本 L-4c では呼ばない)。

---

## 1. 既存資産の read-only 調査結果

### 1.1 ExternalAnchor schema (= `lib/plan/external-anchor.ts`)

```typescript
interface ExternalAnchorBase {
  id: string;
  userId: string;
  title: string;
  startTime: string;
  endTime?: string;
  locationText?: string;        // ← location 名のみ
  locationCategory?: LocationCategory;
  rigidity: AnchorRigidity;
  // ... (= lat / lng は schema 未追加)
}
```

→ **ExternalAnchor は coords を持たない**。 `locationText` のみ。 caller が別経路で coords を取得し、 anchorId → coords map に変換して渡す責任。

### 1.2 既存 geocode endpoint (= `app/api/plan/anchors/geocode/route.ts`)

Phase 2-C で実装済の **MapTab 専用 batch geocode**。 以下を既に守っている (= L-4c では一切呼ばない、 改変もしない):

- userId は auth.getUser() から取得 (= request body の userId 無視)
- sensitive anchor 外部送信禁止 (= sensitiveCategory 設定済 anchor は Places API 呼ばず unresolved)
- privacy-safe payload (= locationText のみ送信、 title/notes/userId 等は送信なし)
- rate limit (= per-user 100/hour)
- fail-open
- audit log は anchorId + outcome + duration のみ、 raw 値は log しない

**L-4c は本 endpoint を呼ばない**。 caller (= L-4d UI 接続層) が既存通り MapTab で resolve した結果を受け取り、 L-4c-pure helper に渡す pattern。

### 1.3 既存 buildDayGraph / overlay / formatter

| Layer | file | API | 同期 / 非同期 |
|---|---|---|---|
| K phase | `lib/plan/dayGraph/buildDayGraph.ts` | `buildDayGraph(input): BuildDayGraphResult` | **同期 pure** |
| L-3b/L-3c | `lib/plan/transport/movementSegmentOverlay.ts` | `resolveMovementSegmentOverlay(input): Promise<OverlayResult>` | **非同期 pure** (= provider が async) |
| L-4a | `lib/plan/transport/movementDisplayFormatter.ts` | `formatOverlayResultForDisplay(result): MovementDisplayResult` | **同期 pure** |
| L-4b | `lib/plan/transport/movementDisplayContract.ts` | `assertMovementDisplayResultCompliance(result): void` | **同期 pure** |

→ L-4c-pure pipeline は **これら 4 layer の合成のみ**。 既存 API は無変更、 新規 fetch / API call なし。

---

## 2. L-4c 全体責務分解

| Sub | 責務 | リスク | 着手方針 |
|---|---|---|---|
| **L-4c-pure** | anchors + coords + providers → MovementDisplayResult の pure pipeline helper | 低 (= no geocode active call, no UI, no telemetry sink) | **連続 GO** |
| L-4c-mapbridge | MapTab の geocode state → coordsByAnchorId map への変換 helper | 中 (= MapTab state shape 依存、 UI 隣接) | **停止** (= 別 audit) |
| L-4c-telemetry | overlay の tracingId を sink に流す経路 | 高 (= runtime sink 設計が必要) | **停止** (= L-4e 別 audit) |

### 2.1 L-4c-pure の核心 (= 本 audit の連続 GO 範囲)

caller が既に持っている `coordsByAnchorId: Map<string, {lat, lng}>` (= MapTab で resolve 済) を引数で受け取り、 pure に合成する。

入力に渡されない (= L-4c で touch しない):
- ❌ geocode endpoint の呼出
- ❌ MapTab state からの coords 取り出し
- ❌ ExternalAnchor schema への lat/lng 追加
- ❌ DB / env / package / dependency / API 追加
- ❌ UI コンポーネント
- ❌ runtime telemetry sink

---

## 3. L-4c-pure 設計

### 3.1 入力 type

```typescript
export interface MovementDisplayPipelineInput {
  /** buildDayGraph input — anchors / date / options */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  readonly date: string;
  readonly buildOptions?: BuildDayGraphOptions;

  /**
   * anchorId → coords の map (= caller 責任)。
   * 空 Map なら全 transition unresolved (= 構造的安全な default)。
   * **L-4c は geocode endpoint を呼ばない**、 caller が事前に resolve 済の値を渡す。
   */
  readonly coordsByAnchorId: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number }
  >;

  /** Cascade providers (= 配列順 = 試行順序) */
  readonly providers: ReadonlyArray<TransportResolutionProvider>;

  /** Manual override (= optional、 transitionIndex 別) */
  readonly overridesByTransitionIndex?: ReadonlyMap<number, ManualOverride>;

  /** Privacy class override (= optional) */
  readonly privacyClassByTransitionIndex?: ReadonlyMap<number, MovementPrivacyClass>;

  /** Opaque tracing id (= telemetry hook、 L-4 では unused / passthrough のみ) */
  readonly tracingId?: string;
}
```

### 3.2 出力 type

```typescript
export interface MovementDisplayPipelineResult {
  /** Display 出力 (= L-4a 通過済、 L-4b assertion 済) */
  readonly display: MovementDisplayResult;
  /** Build warnings (= K phase が出した non-fatal、 UI 露出禁止、 dev log のみ) */
  readonly buildWarnings: ReadonlyArray<DayGraphWarning>;
  /** Overlay 統計 (= caller の summary 用素材) */
  readonly overlayCounts: {
    readonly resolvedCount: number;
    readonly unresolvedCount: number;
    readonly internalErrorCount: number;
  };
  /** Opaque tracing id passthrough */
  readonly tracingId?: string;
}
```

### 3.3 挙動

```typescript
export async function runMovementDisplayPipeline(
  input: MovementDisplayPipelineInput,
): Promise<MovementDisplayPipelineResult> {
  // (1) K phase 同期 build
  const { graph, warnings } = buildDayGraph({
    anchors: input.anchors,
    date: input.date,
    options: input.buildOptions,
  });

  // (2) L-3 non-async overlay
  const overlay = await resolveMovementSegmentOverlay({
    graph,
    coordsByAnchorId: input.coordsByAnchorId,
    cascadeOptions: { providers: input.providers },
    overridesByTransitionIndex: input.overridesByTransitionIndex,
    privacyClassByTransitionIndex: input.privacyClassByTransitionIndex,
    tracingId: input.tracingId,
  });

  // (3) L-4a sync format
  const display = formatOverlayResultForDisplay(overlay);

  // (4) L-4b assertion (= privacy structural 出荷品質保証)
  assertMovementDisplayResultCompliance(display);

  return {
    display,
    buildWarnings: warnings,
    overlayCounts: {
      resolvedCount: overlay.resolvedCount,
      unresolvedCount: overlay.unresolvedCount,
      internalErrorCount: overlay.internalErrorCount,
    },
    ...(input.tracingId !== undefined ? { tracingId: input.tracingId } : {}),
  };
}
```

### 3.4 純度保証

- **入力 mutation 0** (= anchors / coordsByAnchorId / providers etc は readonly)
- **副作用 0** (= no DB, no API call, no localStorage, no fetch, no console.log)
- **既存 4 layer の合成のみ** (= 各 layer は既に純度確立済)
- **既存 4 layer 自身の挙動を変えない** (= 引数を pipe するだけ)

---

## 4. coords source 方針

### 4.1 L-4c では geocode endpoint を **絶対に呼ばない**

CEO 永続規約。 L-4c-pure は coords を**受け取るだけ**。 acquire の責任は caller。

### 4.2 coords が無い anchor は unresolved 維持

`coordsByAnchorId` から該当 anchor の coords が見つからない場合:
- overlay の `computeDefaultPrivacyClass` が `location_unknown` を返す
- cascade の early-exit で必ず unresolved
- L-4a で variant `"unresolved"` → "→ 移動" 表示

→ 「coords が無い → 安全に unresolved」 が構造的保証。

### 4.3 空 Map で全 transition unresolved

caller が `new Map()` を渡しても完全に動く (= test で確認)。 これは「MapTab を開かずに L-4c を呼ぶ」 場合の挙動を担保する。

---

## 5. bridge 設計 (= DayGraph / overlay / displayView の接続)

### 5.1 graph は mutate しない

L-3c で確立済の `assertImmutability` (= JSON snapshot 比較 + 配列 reference 同一性) が overlay 内で発火する。 L-4c-pure は同じ graph instance を overlay に渡すだけ、 mutate しない。

### 5.2 overlay は別 layer 維持

L-4c-pure は overlay の output を **そのまま** formatter に渡す。 中間で書き換えない。

### 5.3 display formatter は L-4a/L-4b をそのまま使う

L-4a の `formatOverlayResultForDisplay` を呼び、 L-4b の `assertMovementDisplayResultCompliance` を **出荷直前**に必ず通す。

---

## 6. Privacy

### 6.1 raw locationText / title / anchorId / nodeId を出さない

- buildDayGraph は K-3c-iii の sensitive redaction (= sensitiveCategory → locationText/title undefined) で既に守られている
- overlay は L-3c の `OverlaySegmentView` + `assertOverlayResultCompliance` で PII 不存在を機械保証
- display は L-4a の `MovementDisplayView` + L-4b の 6 invariants で PII 不存在を機械保証
- L-4c-pure pipeline は **上記 3 layer を「そのまま」 通すだけ**、 新たな PII 経路を作らない

### 6.2 transitionKey は ordinal 維持

L-3c で `transition_${index}` 単独に固定済。 L-4c-pure は overlay 出力をそのまま使うので transitionKey は ordinal のまま。

### 6.3 sensitive proximity は「移動」 のみ

K-3c-iii の sensitiveProximity flag → overlay で sensitive_both / cascade で必ず unresolved → L-4a variant "unresolved" → displayText "→ 移動"。 完全な privacy 保護が pipe を通っても維持される。

---

## 7. 実装可能 low-risk 範囲

| 項目 | 着手 |
|---|---|
| `runMovementDisplayPipeline` (= 4 layer 合成 pure helper) | ✅ |
| tests (= 各 fixture + 集計 + warnings + PII grep + immutability) | ✅ |
| `MovementDisplayPipelineInput / Result` type 定義 | ✅ |
| documentation | ✅ |
| ❌ active geocode call | NO |
| ❌ UI 変更 | NO |
| ❌ MapTab / CalendarTab / FlowTab 改変 | NO |
| ❌ ExternalAnchor schema 変更 | NO |
| ❌ DB / env / package / dependency 追加 | NO |
| ❌ runtime telemetry sink | NO |
| ❌ localStorage / Arrival Risk Memory | NO |

---

## 8. 停止条件 (= 連続 GO 着手前 必須クリア)

| STOP 条件 | 確認 |
|---|---|
| geocode endpoint を呼ぶ必要 | 0 (= L-4c は coords を受け取るだけ) |
| UI 変更が必要 | 0 (= pure helper のみ) |
| MapTab / CalendarTab / FlowTab を触る必要 | 0 |
| privacy 方針に関わる | 既存方針内 (= 新 PII 経路 0) |
| env / API / DB / package / dependency | 0 |
| telemetry sink が必要 | 0 (= tracingId passthrough のみ) |
| K phase / L-1/L-2/L-3/L-4a/L-4b 既存 file 変更 | 0 (= L-4c-pure は新 file のみ) |

→ **全 7 STOP 条件未抵触**。 L-4c-pure 連続実装 GO 判断成立。

---

## 9. CEO 判断ポイント (= L-4c-pure 着地後)

| Q | 内容 |
|---|---|
| Q1 | L-4c-pure 着地で十分か (= L-4c 範囲を本 commit で freeze するか) |
| Q2 | 次は L-4c-mapbridge (= MapTab state → coords map helper) か、 L-4d UI 接続か、 別軸 pivot か |
| Q3 | L-4d UI 接続前に CEO smoke (= preview で「移動 約 30 分」 表示を見る) を挟むか |

---

## 10. 関連 docs

- `docs/alter-plan-phase3-l-4-readiness-audit.md` (= L-4 全体責務分解)
- `docs/alter-plan-phase3-l-3-readiness-audit.md` (= L-3 overlay 設計)
- `docs/alter-plan-phase3-l-3-post-implementation-audit.md` (= L-3c 4 critical)
- `lib/plan/transport/movementSegmentOverlay.ts` (= L-3c)
- `lib/plan/transport/movementDisplayFormatter.ts` (= L-4a)
- `lib/plan/transport/movementDisplayContract.ts` (= L-4b)
- `app/api/plan/anchors/geocode/route.ts` (= Phase 2-C 既存 geocode、 L-4c では呼ばない)

---

## 11. 思想の transmission

1. **L-4c-pure は「合成のみ」 担当** — 既存 4 layer の純度を破壊せず、 caller の便利のために pipe する
2. **coords acquire は L-4c の責任外** — caller が事前に持っている前提、 L-4c-pure は受け取って使うだけ
3. **同期 / 非同期境界の維持** — buildDayGraph は同期、 overlay は非同期、 pipeline は async
4. **L-4b assertion は出荷品質保証** — pipeline の最終段で必ず通す
5. **危険境界の明確化** — geocode active call / UI 変更 / telemetry sink は本 audit で **絶対に進まない**と明示

L-4c-pure は「**pure 合成のみ**」 として確立する。 UI 接続 (= L-4d) はこの helper を呼ぶだけで成立する設計。
