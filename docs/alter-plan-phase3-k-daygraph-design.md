# Phase 3-K DayGraph Layer 設計書

**作成日**: 2026-05-22
**承認**: CEO (= 2026-05-22 設計レビュー GO、 GPT 6 補正 + 私の自立推論 8 補強 反映後の v1.0)
**status**: 設計 docs only、 実装未着手 (= CEO 別承認待ち)
**version**: v1.0 (= 初版、 後 phase で改訂時は §15 history に記録)

---

## 0. Purpose / Philosophy

### 0.1 ゴールから逆算

```
最上位ゴール: ユーザーが「1 日の構造」 を一目で見える化する
  ↓
中間ゴール: anchors を 「start → events → movements → gaps → end」 の chain として表現
  ↓
3-K の deliverable: 上記 chain を計算する pure helper layer + 型定義 + 検証 invariant
  ↓
3-K で書かないもの: UI / DB / 永続化 / Transport API / Arrival Risk / 移動最適化 / LLM
```

### 0.2 設計原則

- **DayGraph = computed projection** (= 永続 entity ではない、 anchors から都度計算)
- **Pure deterministic** (= 同 input → 同 output、 mutation 不可)
- **観察 > 推論** (= Aneurasync 思想、 DayGraph は観察、 予測ではない)
- **Memory Chip metaphor compatible** (= implicit nodes は将来 UI で muted 表現想定)
- **LLM 不使用** (= Invariant 12)
- **anchor mutation 不可** (= Invariant 10)
- **Privacy first** (= sensitive redaction を型レベルで強制)

### 0.3 Layered DayGraph design (= 将来 L/M/N の予約)

```
Layer 0 (= 本書、 3-K):  Structural graph (= start / events / gaps / end + movement transitions)
Layer 1 (= 3-L):         Transport overlay (= MovementTransition に duration / mode 注入 → MovementSegment へ昇格)
Layer 2 (= 3-M):         Risk overlay (= MovementSegment + EventNode.latencyTolerance に risk attribute)
Layer 3 (= 3-N):         Counter-Factual alternative graph (= 代替版 DayGraph を比較)
```

各 layer は独立 build、 3-K は Layer 0 のみ。

---

## 1. Scope

### 1.1 IN scope (= 3-K で実装)

| 項目 | 内容 |
|---|---|
| `DayGraph` 型定義 | nodes (= 4 種: start/event/gap/end) + edges + transitions + day-level attributes |
| `buildDayGraph(input)` | anchors + date から `BuildDayGraphResult` を生成する pure orchestration |
| node generators | start / event / gap / end の各 pure helper |
| **MovementTransition** generator | event 間 location 変化検出 + placeholder transition 生成 |
| day attributes 計算 | density / timeBucket coverage / verbDistribution / dayMood (= 既存再利用) |
| `DayGraphIntegrityContract` | type-lock invariants (= cycle なし / 時系列順 / start 1 個 / end 1 個 等) |
| `DayGraphRedactionContract` | sensitive 情報漏洩防止の型強制 |
| `assertDayGraphCompliance` | 違反検出 helper |
| `BuildDayGraphResult` | `{ graph, warnings }` shape (= invalid anchor を黙って skip しない) |
| `viewForUser(graph)` / `viewForShared(graph)` | view perspective 別 redaction helper |
| `formatDayGraphAsAscii(graph, view)` | dev-only debug 可視化 (= 必ず redaction 適用) |
| unit tests | 全 helper + buildDayGraph 全体 + redaction test + representative fixtures |

### 1.2 OUT of scope (= 3-K では絶対やらない)

| 項目 | 後置場所 |
|---|---|
| Transport API 接続 | 3-L |
| MovementSegment 昇格 (= duration / mode / route 埋め) | 3-L |
| Arrival Risk Memory | 3-M |
| Departure Correction | 3-M |
| Counter-Factual alternative graph | 3-N |
| UI rendering (= CalendarTab / MapTab / FlowTab 改修) | 3.5 / 別 phase |
| PlanClient state 接続 | K-2 / 別 commit |
| DB persistence | 不要 (= computed projection) |
| migration / schema 変更 | 不要 |
| env / package.json / new dependency | 不要 |
| LLM 呼出 | 永続禁止 (= Invariant 12) |
| crypto module 使用 (= snapshotId は string key) | 永続 |

---

## 2. CEO 補正 6 件 + 私の自立補強 8 件 統合済

### 2.1 GPT 補正の反映

| 補正 | 反映先 |
|---|---|
| 1. MovementNode 時刻矛盾解消 | §4 Types — Movement を **MovementTransition** 別概念に分離。 nodes (= start/event/gap/end) は時刻必須維持 |
| 2. Empty day 統一 | §6 Build orchestration — empty anchors → start + 1 large gap + end (= 3 nodes) |
| 3. Start/End の boundary 化 | §5 StartNode/EndNode — observation boundary、 起床/就寝と断定しない。 `boundaryRationale` attribute |
| 4. Sensitive redaction 型強制 | §7 Redaction — `displayLabel` always-safe field + sensitive 時 title/locationText undefined + `DayGraphRedactionContract` |
| 5. Invalid anchor warnings | §8 Warnings — `BuildDayGraphResult = { graph, warnings[] }`、 6 warning kind |
| 6. snapshotId crypto なし | §9 snapshotId — deterministic string key、 version prefix で algorithm 進化対応 |
| 7. 実装前 actual code audit | §13 Pre-implementation audit checklist |

### 2.2 私の自立補強

| 補強 | 反映先 |
|---|---|
| A. `DayGraphView` concept | §10 View perspective — user view / shared view 別 redaction level |
| B. Time zone (= local time) 明示 | §4 Types — comment + `BoundaryRationale.timezone` 予約 |
| C. Test fixtures standardization | §11 Test fixtures — representative scenarios export |
| D. Cycle 検出 + 時系列順 verify | §12 DayGraphIntegrityContract |
| E. MovementTransition trigger 精緻化 | §6.3 Movement detection logic |
| F. 設計 doc version 履歴 | §15 Version history |
| G. K-2 placeholder section | §14 K-2 / 後 phase 預け |
| H. Exhaustive switch helper | §4.7 Helpers |

---

## 3. J-6 / J-7 frozen branches との接続点

### 3.1 直接接続 (= 3-K で実施するもの)

**なし**。 3-K は pure helper layer。 PlanClient 接続は K-2 / 別 phase。

### 3.2 間接接続 (= 既存資産を再利用)

| 既存資産 | 場所 | 3-K での扱い |
|---|---|---|
| `inferAnchorVerb` | `lib/plan/dayGraph/anchorVerbMap.ts` | EventNode の `verb` attribute 計算で再利用 |
| `inferDayMood` | `lib/plan/dayGraph/dayMood.ts` | DayGraphAttributes の `dayMood` で再利用 |
| `inferLatencyTolerance` | `lib/plan/dayGraph/latencyToleranceMap.ts` | EventNode の `latencyTolerance` (= optional、 3-M 活用予定) |
| `detectTimedAnchorOverlaps` | `lib/plan/anchorOverlap.ts` | EventNode の `overlapsWithNodeIds` 計算で再利用 |
| `anchorsForDay` | `app/(culcept)/plan/tabs/_helpers.ts` | 3-K の **入力前提** (= caller が呼んで expanded anchors を渡す)、 3-K 内では呼ばない |
| `ExternalAnchor` | `lib/plan/external-anchor.ts` | EventNode の source として参照 (= mutation 禁止) |

### 3.3 J 系との分離原則

- J-6 の proposalsByDate は **DayGraph と独立** (= 3-K は proposal を knowledge しない)
- proposal chip を DayGraph の event node に重ねる UI 接続は 3.5 で別途設計
- 3-K では DayGraph 単独で完結

---

## 4. Types (= 中核設計)

### 4.1 Node types (= 4 種、 Movement は node ではなく Transition)

```typescript
type DayGraphNodeKind = "start" | "event" | "gap" | "end";

interface DayGraphNodeBase {
  /** "{date}_{kind}_{order}" or anchor.id */
  readonly id: string;
  readonly kind: DayGraphNodeKind;
  /** anchor 由来 (= explicit) vs 計算生成 (= implicit) */
  readonly origin: "explicit" | "implicit";
  /** "HH:MM" local time、 anchor の local time に整合 */
  readonly startTime: string;
  /** "HH:MM" local time */
  readonly endTime: string;
  /** 分単位 (= endTime - startTime) */
  readonly durationMin: number;
  /** 時間帯 tag、 後の pattern detection で活用 */
  readonly timeBucket: TimeBucket;
}

type TimeBucket =
  | "early_morning"  // 05:00-08:00
  | "morning"        // 08:00-11:00
  | "noon"           // 11:00-14:00
  | "afternoon"      // 14:00-17:00
  | "evening"        // 17:00-20:00
  | "night"          // 20:00-23:00
  | "late_night";    // 23:00-05:00 (= 翌日跨ぎ含む)
```

### 4.2 StartNode / EndNode (= observation boundary)

```typescript
interface BoundaryRationale {
  /** 設定の出所 */
  readonly type: "default" | "user_override" | "future_observed";
  /** 将来 user 設定 phase で活用 (= 現状 undefined) */
  readonly note?: string;
  /** local time zone 想定 (= 将来 explicit 化予定) */
  readonly timezone: "local";
}

interface StartNode extends DayGraphNodeBase {
  readonly kind: "start";
  readonly origin: "implicit";  // 常に implicit
  /**
   * 観測の境界 (= 起床想定ではない、 表示 / 計算の左端)。
   * default "06:00"、 user 設定で override 可。
   */
  readonly boundaryRationale: BoundaryRationale;
}

interface EndNode extends DayGraphNodeBase {
  readonly kind: "end";
  readonly origin: "implicit";
  /**
   * 観測の境界 (= 就寝想定ではない、 表示 / 計算の右端)。
   * default "23:00"、 user 設定で override 可。
   */
  readonly boundaryRationale: BoundaryRationale;
}
```

### 4.3 EventNode (= anchor 由来、 redaction 強制)

```typescript
interface EventNode extends DayGraphNodeBase {
  readonly kind: "event";
  readonly origin: "explicit";  // 常に explicit
  readonly anchorId: string;
  /**
   * 常に安全な表示用ラベル (= sensitive なら "sensitive event"、 そうでなければ title)。
   * UI / debug 出力で必ずこれを使う。
   */
  readonly displayLabel: string;
  /**
   * Raw title (= sensitive===true なら **undefined** = field 自体が欠落)。
   * 非 sensitive な anchor の本来 title のみ保持。
   */
  readonly title?: string;
  /**
   * Raw locationText (= sensitive===true なら **undefined**)。
   */
  readonly locationText?: string;
  readonly locationCategory?: LocationCategory;
  readonly verb: AnchorVerb;
  readonly rigidity: AnchorRigidity;
  /** Optional、 3-M で活用予定。 3-K では計算のみ */
  readonly latencyTolerance?: LatencyTolerance;
  /** 機密フラグ。 true なら title/locationText は undefined */
  readonly sensitive: boolean;
  /** 同日他 EventNode との時刻 overlap (= detectTimedAnchorOverlaps 由来) */
  readonly overlapsWithNodeIds: ReadonlyArray<string>;
}
```

### 4.4 GapNode (= event 間の空白)

```typescript
interface GapNode extends DayGraphNodeBase {
  readonly kind: "gap";
  readonly origin: "implicit";
  /**
   * gap の前後 event の sensitive flag が「OR」 で true なら、
   * gap も「sensitive proximity」 として redaction 候補。
   * 3-K では flag のみ持つ、 redaction policy は §10 view で適用。
   */
  readonly sensitiveProximity: boolean;
}
```

短すぎる gap (= `MIN_GAP_MINUTES` 未満) は **GapNode 生成しない** (= natural padding として無視)。 default 30 分。

### 4.5 MovementTransition (= edge attribute、 node ではない ★GPT 補正 1)

```typescript
/**
 * 連続 EventNode の location 変化を表す transition。
 * 3-K では時刻 / duration / mode 未確定 (= "unresolved")。
 *
 * 3-L で MovementSegment に昇格時:
 *   - timingStatus: "resolved"
 *   - startTime / endTime / durationMin / mode / source 確定
 */
interface MovementTransition {
  /** transition の前 EventNode id */
  readonly fromNodeId: string;
  /** transition の後 EventNode id */
  readonly toNodeId: string;
  /** 3-K では常に "unresolved" */
  readonly timingStatus: "unresolved";
  /** location 比較で異なると判定された情報 (= sensitive なら undefined) */
  readonly fromLocationText?: string;
  readonly toLocationText?: string;
  /** sensitive flag 集約 (= 前後 EventNode どちらかが sensitive なら true) */
  readonly sensitiveProximity: boolean;
  // ★ 3-L で attribute 注入予約 (= 現状 undefined):
  //   readonly estimatedDurationMin?: number;
  //   readonly mode?: TransportMode;
  //   readonly durationSource?: DurationSource;
}
```

### 4.6 Top-level DayGraph + Edge

```typescript
interface DayGraphEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /** 現状 "sequential" のみ。 将来 "alternative" / "branch" を追加可能 */
  readonly kind: "sequential";
}

interface DayGraphAttributes {
  readonly date: string;                                          // "YYYY-MM-DD"
  readonly dayMood: DayMood;                                      // = 既存 inferDayMood
  readonly anchorCount: number;
  readonly verbDistribution: Readonly<Record<AnchorVerb, number>>;
  readonly density: "sparse" | "balanced" | "packed";
  readonly timeBucketCoverage: ReadonlySet<TimeBucket>;
  readonly hasOverlap: boolean;
  readonly hasSensitive: boolean;
}

interface DayGraph {
  /** 同 input → 同 string の deterministic cache key */
  readonly snapshotId: string;
  readonly attributes: DayGraphAttributes;
  readonly nodes: ReadonlyArray<DayGraphNode>;          // 時系列順 + cycle なし
  readonly edges: ReadonlyArray<DayGraphEdge>;
  readonly transitions: ReadonlyArray<MovementTransition>;  // ★ nodes と分離
}

type DayGraphNode = StartNode | EventNode | GapNode | EndNode;
```

### 4.7 Helpers (= exhaustive switch)

```typescript
/**
 * Discriminated union 網羅性を type level + runtime で verify。
 * 新 node kind を将来追加する際に compile-time error で抜けを検出。
 */
function exhaustiveDayGraphNodeKindCheck(kind: never): never {
  throw new Error(`exhaustive check failed for kind: ${JSON.stringify(kind)}`);
}
```

---

## 5. StartPoint / EndPoint の扱い (= GPT 補正 3)

### 5.1 意味の明示

- **NOT** 起床想定 / 就寝想定 (= 生活事実として断定しない)
- **YES** observation boundary / rendering boundary (= 表示 / 計算の境界)
- default "06:00" / "23:00" は **観測対象とする時間範囲の境界**
- user 設定で override 可、 将来は user の wake/sleep 観測から自動調整余地

### 5.2 BoundaryRationale で進化の余地を予約

```typescript
type: "default"           // 3-K では常にこれ
type: "user_override"     // 将来 user 設定 phase
type: "future_observed"   // 更に先、 Stargazer 連携で観測値由来
```

### 5.3 Options で override

```typescript
interface BuildDayGraphOptions {
  readonly startTime?: string;        // default "06:00"
  readonly endTime?: string;          // default "23:00"
  readonly minGapMinutes?: number;    // default 30
  readonly view?: DayGraphView;       // §10 view perspective
}
```

---

## 6. Build orchestration

### 6.1 Top-level signature

```typescript
function buildDayGraph(input: {
  anchors: ReadonlyArray<ExternalAnchor>;  // anchorsForDay で expand 済が前提
  date: string;                            // "YYYY-MM-DD"
  options?: BuildDayGraphOptions;
}): BuildDayGraphResult;

interface BuildDayGraphResult {
  readonly graph: DayGraph;
  readonly warnings: ReadonlyArray<DayGraphWarning>;
}
```

### 6.2 内部 step (= pure function chain)

```
1. validateAndNormalizeAnchors(anchors)
     → 有効 anchor[] + warnings[]
2. buildStartNode(date, options) → StartNode
3. buildEventNodes(validAnchors)  → EventNode[]
4. detectMovements(eventNodes)    → MovementTransition[]
5. buildGapNodes(eventNodes, startNode, endNode, minGapMinutes)
     → GapNode[]
6. buildEndNode(date, options)    → EndNode
7. sequenceNodes(start, events, gaps, end) → sorted nodes
8. buildEdges(sortedNodes) → DayGraphEdge[]
9. computeAttributes(eventNodes) → DayGraphAttributes
10. computeSnapshotId(date, anchorIds, options) → string
11. assertDayGraphCompliance(graph) → throw if violated
12. return { graph, warnings }
```

### 6.3 Movement detection logic (= ★私の補強 E)

```typescript
function shouldEmitMovementTransition(prev: EventNode, next: EventNode): boolean {
  const prevLoc = prev.locationText;  // sensitive なら undefined
  const nextLoc = next.locationText;

  // 両方 undefined or 等しい → 移動なし扱い
  if (prevLoc === nextLoc) return false;

  // 片方だけ undefined → 不明、 安全側で「移動あり」 と判定
  // sensitive で undefined になっているケースもこれで吸収
  if (prevLoc === undefined || nextLoc === undefined) return true;

  // 両方あって異なる → 移動あり
  return true;
}
```

### 6.4 Empty day (= ★GPT 補正 2)

anchor 0 件の日:
```
StartNode (06:00-06:00) → GapNode (06:00-23:00) → EndNode (23:00-23:00)
```

- 3 nodes 構成
- GapNode の durationMin = 1020 分 (= 17 時間)
- attributes.anchorCount = 0、 dayMood = "recovery"

---

## 7. Sensitive Redaction (= ★GPT 補正 4)

### 7.1 設計原則

- sensitive flag は **node attribute として持つ** (= 透明性)
- raw title / locationText は **sensitive===true なら field 自体が undefined** (= 漏洩源を物理的に排除)
- `displayLabel` (= 常に安全) を別 field で提供
- 全 debug 出力 / formatDayGraphAsAscii は **displayLabel のみを使う**

### 7.2 DayGraphRedactionContract

```typescript
interface DayGraphRedactionContract {
  /** sensitive node から raw title が undefined である */
  readonly sensitiveTitleHidden: true;
  /** sensitive node から raw locationText が undefined である */
  readonly sensitiveLocationHidden: true;
  /** displayLabel が常に存在 (= sensitive でも非 sensitive でも) */
  readonly displayLabelAlwaysPresent: true;
}

function assertRedactionCompliance(graph: DayGraph, contract: DayGraphRedactionContract): void;
```

### 7.3 displayLabel 生成 rule

```typescript
function buildDisplayLabel(anchor: ExternalAnchor): string {
  if (anchor.sensitiveCategory) {
    // Generic safe label、 anchor の中身を明かさない
    switch (anchor.sensitiveCategory) {
      case "medical": return "予定 (= 医療系)";
      case "legal":   return "予定 (= 法務系)";
      case "exam":    return "予定 (= 試験系)";
      case "other":   return "予定 (= 機密)";
    }
  }
  // 非 sensitive → anchor.title をそのまま
  return anchor.title;
}
```

### 7.4 Redaction test (= 永続検証)

```typescript
// 例: 「sensitive node の formatDayGraphAsAscii 出力に raw title が含まれない」
const sensitiveAnchor = { ..., title: "MRI 予約", sensitiveCategory: "medical" };
const result = buildDayGraph({ anchors: [sensitiveAnchor], date });
const ascii = formatDayGraphAsAscii(result.graph);
expect(ascii).not.toContain("MRI 予約");
expect(ascii).toContain("予定 (= 医療系)");
```

---

## 8. Warnings (= ★GPT 補正 5)

### 8.1 Warning shape

```typescript
type DayGraphWarningKind =
  | "invalid_time"             // startTime が parse 不能
  | "missing_date"             // one_off だが date undefined
  | "end_before_start"         // endTime < startTime
  | "unsupported_anchor_kind"  // 不明な anchorKind
  | "duplicate_anchor_id"      // 同 id を 2 個以上検出
  | "anchor_outside_boundary"; // anchor の時刻が options の boundary 外

interface DayGraphWarning {
  readonly kind: DayGraphWarningKind;
  /** 該当 anchor の id (= 特定可能な場合) */
  readonly anchorId?: string;
  /** 内部 detail、 dev console / Sentry 用。 **UI 露出禁止** */
  readonly detail: string;
}
```

### 8.2 Caller (= PlanClient) の責任

- warnings は **dev console / Sentry に流す**
- production UI には **表示しない** (= silent)
- warnings 配列が non-empty でも graph は graceful 描画継続

### 8.3 Anti-fragility 原則

- 1 個の invalid anchor で全 graph が消えない
- skip された anchor は warnings に必ず記録
- 残りの valid anchor で graph は完成

---

## 9. snapshotId (= ★GPT 補正 6、 crypto なし)

### 9.1 Deterministic string key

```typescript
function computeSnapshotId(input: {
  date: string;
  anchorIds: ReadonlyArray<string>;
  startTime: string;
  endTime: string;
  minGapMinutes: number;
}): string {
  const sortedIds = [...input.anchorIds].sort().join(",");
  return [
    "daygraph",
    "v1",                          // ★ algorithm version、 将来変更時 cache 自動 invalidate
    input.date,
    sortedIds,
    `${input.startTime}-${input.endTime}`,
    `gap${input.minGapMinutes}`,
  ].join(":");
}

// 例:
// "daygraph:v1:2026-05-22:anchor_a,anchor_b,anchor_c:06:00-23:00:gap30"
```

### 9.2 Properties

- crypto 不使用 (= new dependency 不要)
- 同 input → 同 string → React useMemo の key として使える
- 一意性は string concat と sort で保証 (= hash collision の理論的余地なし)
- "v1" prefix で algorithm 進化時の cache invalidation 可能

---

## 10. DayGraphView (= ★私の補強 A)

### 10.1 View perspective concept

```typescript
type DayGraphView =
  | "user_self"     // user 自身が見る (= sensitive 表示可、 ただし displayLabel 使用)
  | "shared_view";  // 他人と共有 (= sensitive 完全隠匿、 displayLabel すら出さない)
```

### 10.2 View 変換 helper

```typescript
function viewForUser(graph: DayGraph): DayGraph {
  // sensitive 含む全 node を displayLabel で表示
  // 3-K では graph をそのまま返す (= displayLabel 既に安全)
  return graph;
}

function viewForShared(graph: DayGraph): DayGraph {
  // sensitive node を完全に除外 / 代替表現に置換
  // 3-K では sensitive node を「予定」 generic placeholder に置換
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.kind === "event" && n.sensitive
        ? { ...n, displayLabel: "予定" }
        : n,
    ),
  };
}
```

### 10.3 使用想定

- 3-K では view 選択 helper を提供
- 用途は将来 Genome Card / 共有機能の DayGraph 表示で活用
- 3-K では UI で使わない (= helper の提供のみ)

---

## 11. Test Fixtures (= ★私の補強 C)

### 11.1 Representative scenarios

```typescript
// tests/fixtures/dayGraph/index.ts
export const HEAVY_DAY_ANCHORS: ExternalAnchor[] = [...];  // 5+ anchors
export const LIGHT_DAY_ANCHORS: ExternalAnchor[] = [...];  // 1-3 anchors
export const EMPTY_DAY_ANCHORS: ExternalAnchor[] = [];     // 0 anchors
export const SENSITIVE_DAY_ANCHORS: ExternalAnchor[] = [...]; // sensitive 含む
export const OVERLAP_DAY_ANCHORS: ExternalAnchor[] = [...];   // 時刻 overlap
export const MOVEMENT_DAY_ANCHORS: ExternalAnchor[] = [...]; // 場所変化
export const SINGLE_DAY_ANCHORS: ExternalAnchor[] = [...];   // 1 anchor
export const INVALID_DAY_ANCHORS: ExternalAnchor[] = [...];  // warnings 検証用
```

### 11.2 Export 目的

- 3-K test で再利用
- 将来 K-2 (= UI 統合 test) で同 fixture を再利用
- 「representative scenarios の真値」 として共有

---

## 12. DayGraphIntegrityContract (= ★私の補強 D)

### 12.1 Invariants

```typescript
interface DayGraphIntegrityContract {
  /** nodes は時系列順 (= startTime asc) */
  readonly nodesTimeOrdered: true;
  /** StartNode が必ず 1 個 */
  readonly singleStartNode: true;
  /** EndNode が必ず 1 個 */
  readonly singleEndNode: true;
  /** cycle なし (= 線形 graph) */
  readonly noCycle: true;
  /** EventNode の anchorId はすべて unique */
  readonly uniqueAnchorIds: true;
  /** edges は consecutive node の sequential 接続のみ */
  readonly edgesSequentialOnly: true;
  /** transitions の fromNodeId / toNodeId は EventNode の id を参照 */
  readonly transitionsReferenceEventNodes: true;
  /** snapshotId は deterministic 生成 */
  readonly snapshotIdDeterministic: true;
  /** redaction contract も同時に満たす */
  readonly redactionEnforced: true;
}

function assertDayGraphCompliance(graph: DayGraph, contract: DayGraphIntegrityContract): void;
```

### 12.2 違反時の挙動

- 違反検出 → throw Error (= internal bug、 production に出ない想定)
- production では `try/catch` で graceful degradation (= buildDayGraph が空 graph + warning を返す)

---

## 13. Pre-Implementation Audit Checklist (= ★GPT 補正 7)

実装 K-1a 着手前に **必ず以下を read-only で再 audit**:

### 13.1 ExternalAnchor 実 field

- [ ] `lib/plan/external-anchor.ts` の OneOffExternalAnchor / RecurringExternalAnchor 全 field
- [ ] `startTime` の正確な format (= "HH:mm" のみ or ISO 8601 も許容?)
- [ ] `endTime` 不在時の default duration 想定 (= 60 分? user 指定?)
- [ ] `sensitiveCategory` enum 全値 (= medical / legal / exam / other)
- [ ] `locationCategory` enum 全値
- [ ] `anchorKind` discriminant の正確な値

### 13.2 既存 helper 動作

- [ ] `anchorsForDay(anchors, date)` の戻り値 shape (= ExternalAnchor[] そのまま? 変換あり?)
- [ ] `detectTimedAnchorOverlaps(anchors)` の戻り値 (= Set<anchorId> 想定)
- [ ] `inferAnchorVerb({title, locationText})` の入力 shape
- [ ] `inferDayMood({anchors})` の入力 shape

### 13.3 不変 (= 既存 invariant)

- [ ] Invariant 4 (= sensitive 除外 / Privacy first)
- [ ] Invariant 10 (= anchor mutation 禁止)
- [ ] Invariant 12 (= LLM 不使用)
- [ ] Invariant 17 (= internal data only)

### 13.4 既存 test の参考

- [ ] `tests/unit/plan/anchorOverlap.test.ts` の helper 使用パターン
- [ ] `tests/unit/plan/dayGraph/dayMood.test.ts` (= 既存 inferDayMood test)
- [ ] proposalComputeProposals.test.ts の orchestration test pattern

---

## 14. K-2 / 後 phase 預け (= ★私の補強 G)

### 14.1 K-2 (= 別 commit、 3-K 着地後)

- PlanClient で `dayGraphByDate` を useMemo で計算
- CalendarTab / MapTab / FlowTab に DayGraph を渡す配線 (= read-only、 表示は別 commit)
- existing helper との非衝突確認

### 14.2 別 phase 預け (= 明示)

| 項目 | 預け phase |
|---|---|
| MovementSegment 昇格 (= duration / mode 注入) | 3-L |
| Arrival Risk Memory 連携 | 3-M |
| Departure Correction | 3-M |
| Counter-Factual alternative graph | 3-N |
| DayGraph UI rendering (= visual representation) | 3.5 / 別 phase |
| user 設定 boundary override UI | 3.5 / 別 phase |
| pattern detection on DayGraph (= 「いつも朝にやってる」 等) | 別 phase |
| DayGraph 間比較 (= 「先週と比べて」) | 別 phase |
| 永続 cache (= IndexedDB / SW) | 性能観測後判断 |

---

## 15. File structure + Commit 階段

### 15.1 新規 files (= 8 production + 7 test)

```
lib/plan/dayGraph/
├── dayGraphTypes.ts                  ← K-1a
├── dayGraphIntegrityContract.ts      ← K-1a
├── dayGraphRedactionContract.ts      ← K-1a (= sensitive redaction)
├── startEndNodes.ts                  ← K-1b
├── eventNodes.ts                     ← K-1b (= displayLabel 生成含む)
├── gapNodes.ts                       ← K-1c
├── movementTransitions.ts            ← K-1c (= GPT 補正 1: node ではない)
├── dayGraphAttributes.ts             ← K-1d
├── dayGraphView.ts                   ← K-1d (= view perspective)
├── buildDayGraph.ts                  ← K-1e (= orchestration)
└── formatDayGraphAsAscii.ts          ← K-1e (= dev-only debug、 redaction 強制)

tests/fixtures/dayGraph/
└── index.ts                          ← K-1e (= representative scenarios export)

tests/unit/plan/
├── dayGraphTypesAndContracts.test.ts ← K-1a
├── dayGraphStartEnd.test.ts          ← K-1b
├── dayGraphEventNodes.test.ts        ← K-1b
├── dayGraphGapNodes.test.ts          ← K-1c
├── dayGraphMovementTransitions.test.ts ← K-1c
├── dayGraphAttributesAndView.test.ts ← K-1d
├── buildDayGraph.test.ts             ← K-1e
└── dayGraphRedaction.test.ts         ← K-1e (= sensitive 漏洩防止検証)
```

### 15.2 Commit 階段 (= 5 commits)

| Commit | 範囲 | files (production / test) |
|---|---|---|
| **K-1a** | 型定義 + invariants | 3 / 1 |
| **K-1b** | start/end + event node generators | 2 / 2 |
| **K-1c** | gap + movement transitions | 2 / 2 |
| **K-1d** | attributes + view perspective | 2 / 1 |
| **K-1e** | buildDayGraph orchestration + debug ascii + redaction test | 2 + fixtures / 2 |

各 commit 単独で:
- `npx vitest run tests/unit/plan/dayGraph*.test.ts` PASS
- `npx tsc --noEmit` で K surface error 0
- plan unit tests 全 PASS (= regression 0)

### 15.3 Branch 戦略

- 新 branch: `feat/alter-plan-phase3-k-daygraph-foundation`
- base: **GitHub 復旧後の origin/main** (= addendum §8.5 に従う、 frozen branches 不触)
- 5 commits 順次積み
- K-1e 着地後、 別 phase で K-2 (= PlanClient 接続) を立てる

---

## 16. Aneurasync 思想整合確認

- ✅ **観察 > 推論**: DayGraph は観察された 1 日の構造、 予測ではない
- ✅ **No Penalty for Ignore**: DayGraph は表示するだけ、 推奨しない (= Invariant 39)
- ✅ **Privacy first**: sensitive を redaction contract で型強制 (= Invariant 4)
- ✅ **Memory Chip 思想**: implicit nodes は将来 UI で muted 表現想定 (= Invariant 42)
- ✅ **LLM 不使用**: 全 pure helper (= Invariant 12)
- ✅ **self-evidence**: 観測値のみ、 推論結論なし
- ✅ **anchor mutation 禁止**: 入力 anchor を変更しない (= Invariant 10)
- ✅ **internal data only**: warnings は UI 露出禁止 (= Invariant 17)

---

## 17. CEO 永続制約 遵守確認

| 制約 | 遵守 |
|---|---|
| K/L/M/N → K のみ着手 (= 設計のみ) | ✅ |
| Transport API 接続なし | ✅ |
| Arrival Risk Memory なし | ✅ |
| 遅刻学習なし | ✅ |
| 実移動ルート最適化なし | ✅ |
| DB migration なし | ✅ |
| confirmedAt schema/API 変更なし | ✅ |
| env / package.json / dependency 変更なし | ✅ |
| crypto module 等新 dependency なし | ✅ |
| UI 接続なし | ✅ |
| PlanClient 修正なし | ✅ |
| TestOverrideContext production 注入なし | ✅ |
| DB 直接 insert/update/delete なし | ✅ |
| Phase 3-J frozen branches (= feat / chore / closeout / addendum) への commit なし | ✅ |
| reset / restore / stash / branch delete なし | ✅ |
| force push なし | ✅ |
| LLM 呼出なし | ✅ |
| anchor mutation なし | ✅ |
| fetch / push / gh なし (= GitHub 復旧前) | ✅ |
| dev fixture API なし | ✅ |

---

## 18. やらないこと list (= 明示永続)

- 「予測 / 推奨 / 最適化」 系言語の混入 (= DayGraph は観察、 提案ではない)
- Memory Chip metaphor を破る視覚装飾の前提 (= UI は別 phase だが、 type design でも避ける)
- sensitive を hide ではなく tag で透明化の原則を破る
- 「Alter が〜」 表現 (= No-AI-Subject、 DayGraph 自体は静的 data だが念のため)
- DayGraph に「user の意図」 を inferene する logic (= 純粋構造のみ)

---

## 19. Version 履歴

| version | 日付 | 変更内容 | 承認 |
|---|---|---|---|
| v1.0 | 2026-05-22 | 初版。 GPT 6 補正 + Claude 自立 8 補強反映 | CEO 設計 GO |
| v1.1 | 2026-05-22 | 実装着手前 actual code audit 結果反映 (= 軽微 5 件補正、 下 §22) | CEO 実装 GO |
| **v1.2** | **2026-05-22** | **K-1f 補正: §22.8 durationSource + boundaryClipped 2 field / §22.9 JSON-safe output (= Set → Array)** | **CEO K-1f GO** |
| (将来) v2.0 | TBD | 3-L 接続点 (= MovementSegment 昇格仕様) 追記 | TBD |

---

## 22. v1.1 Audit 補正 (= 2026-05-22 actual code audit 反映)

実 code 精査の結果、 設計 v1.0 と実 helper / 既存 type の間で軽微差分 5 件を発見。 v1.1 で正式反映。

### 22.1 startTime / endTime の strict "HH:MM" 化

- **背景**: `ExternalAnchor.startTime` のコメントは「HH:mm 形式 or ISO 8601」 だが、 既存 helper (`anchorOverlap.ts:toMinutes`) は "HH:MM" / "HH:MM:SS" のみ accept、 ISO 8601 を **reject**
- **v1.1**: K 内部の time parser は **strict "HH:MM"** (= "HH:MM:SS" tolerant、 ISO 8601 reject)
- 既存 `toMinutes` の strict 仕様を流用 (= 再実装、 dependency 増やさない)
- ISO 8601 形式の入力は `invalid_time` warning として弾く

### 22.2 endTime 欠落時 `DEFAULT_EVENT_DURATION_MIN = 60`

- **背景**: `endTime?: string` (= optional)
- **v1.1**: `DEFAULT_EVENT_DURATION_MIN = 60` を K-1b で明示 export
- endTime 欠落時、 endTime = startTime + 60 分 (= 23:59 までで cap)
- 後 phase で configurable 化余地あり

### 22.3 locationCategory "unknown" は movement 判定に **使わない**

- **背景**: `LocationCategory` 8 値の 1 つに "unknown" あり
- **v1.1**: Movement detection は **`locationText` のみ**で判定 (= 設計 v1.0 §6.3 と整合)
- `locationCategory` は分類補助、 場所 identity ではない (= 「unknown カテゴリの home」 と 「unknown カテゴリの office」 が同じカテゴリだが異なる場所)

### 22.4 `verbDistribution` に "unknown" key を含める

- **背景**: `AnchorVerb` の 7 値の 1 つに "unknown" あり
- **v1.1**: `verbDistribution: Readonly<Record<AnchorVerb, number>>` の AnchorVerb は 7 値全て (= "unknown" 含む)
- すべての key が 0 で初期化、 集計時 increment

### 22.5 `latencyTolerance` は **required** に補正

- **背景**: `inferLatencyTolerance` は **常に値返す** (= default "flexible")
- **設計 v1.0 §4.3**: `latencyTolerance?: LatencyTolerance` (= optional)
- **v1.1**: `latencyTolerance: LatencyTolerance` (= **required**)
- EventNode 生成時に必ず inferLatencyTolerance を呼び、 値を必ず注入する
- 「未推論」 という状態は MVP では持たない (= "flexible" が default 推論結果)

### 22.6 out-of-bound event の扱い (= ★新規明示)

- StartNode boundary (default "06:00") より前の anchor、 EndNode boundary (default "23:00") より後の anchor の扱い
- **v1.1**: out-of-bound event は `anchor_outside_boundary` warning + **skip** (= node を生成しない)
- endTime のみ bound を超えるケース (= startTime in-bound、 endTime out-of-bound) は endTime を boundary に **clip** (= warning なし、 graph 形状維持)
- 後 phase で user override (= boundary 拡張) 可能

### 22.7 StartNode / EndNode の durationMin

- **v1.1 明示**: StartNode / EndNode は **「点」** として配置、 `startTime === endTime`、 `durationMin = 0`

---

## 22.8 K-1f-α: Duration Provenance (= 2 field 方式、 v1.2)

### 動機

EventNode が「endTime の由来」 を保持しないと、 3-L / 3-M / 3-N で **仮置きの 60 分を user 明示と同じ「事実」** として扱ってしまう。 これは Transport / Arrival Risk / Counter-Factual の精度を毀損する。

### 補正 (= CEO 確定 + Claude 自立補強)

3 値 enum (`explicit | assumed_default | clipped_boundary`) は orthogonal な 2 軸を混在させる欠陥。 正しい設計は **2 field 直交**:

```typescript
export type DurationSource = "explicit" | "assumed_default";

interface EventNode {
  ...
  /** anchor.endTime が明示か、 DEFAULT_EVENT_DURATION_MIN で補完されたか */
  readonly durationSource: DurationSource;
  /** endTime が observation boundary を超えて clip されたか (= durationSource とは別軸) */
  readonly boundaryClipped: boolean;
  ...
}
```

### 4 状態完全網羅 (= 全 case 後 phase で区別可能)

| anchor.endTime | endTime boundary 内 | endTime boundary 越 |
|---|---|---|
| 明示 | durationSource="explicit", boundaryClipped=false | durationSource="explicit", boundaryClipped=true |
| 欠落 | durationSource="assumed_default", boundaryClipped=false | durationSource="assumed_default", boundaryClipped=true |

### 後 phase での活用 (= L/M/N 接続点)

- **3-L** (Transport): `durationSource === "explicit"` の event は移動時間計算で正確に余白扱い、 `assumed_default` は弱信号として扱う
- **3-M** (Arrival Risk): `boundaryClipped === true` の event は「実は 21:00-25:00 の event を 23:00 まで観察した」 可能性を考慮、 後続予定への影響を保守的に評価
- **3-N** (Counter-Factual): 仮置きの 60 分を変えて alternative graph 生成する場合、 `durationSource === "assumed_default"` のみを対象に

### Display 規約

- `formatDayGraphAsAscii` 等の dev/UI は durationSource / boundaryClipped を **基本表示しない** (= 内部 attribute、 後 phase 向け)
- 必要な場合のみ debug 出力 (= 例 `formatDayGraphAsAscii(graph, { showInternalProvenance: true })`、 K では未実装)

### 実装範囲 (= K-1f-α commit)

- `dayGraphTypes.ts`: `DurationSource` type export + EventNode 2 field 追加
- `eventNodes.ts`: `normalizeAnchorTime` 戻り値に 2 field 追加 + `buildEventNodeFromAnchor` で注入
- tests: 4 状態 完全 case + orthogonal 確認 + 既存 test fixture 更新

---

## 22.9 K-1f-β: JSON-safe Output (= ReadonlyArray、 v1.2)

### 動機

`DayGraphAttributes.timeBucketCoverage: ReadonlySet<TimeBucket>` は `JSON.stringify` で空 object `{}` になり、 **data lost**。 後 phase で graph を serialize する場面 (= API / persistence / debug) で破綻。

### 補正

```typescript
interface DayGraphAttributes {
  ...
  /** canonical 順序の Array (= JSON-safe、 v1.2 §22.9) */
  readonly timeBucketCoverage: ReadonlyArray<TimeBucket>;
  ...
}
```

### Canonical order (= deterministic 順序保証)

```typescript
export const TIME_BUCKET_CANONICAL_ORDER: ReadonlyArray<TimeBucket> = [
  "early_morning",
  "morning",
  "noon",
  "afternoon",
  "evening",
  "night",
  "late_night",
] as const;
```

attribute 計算時、 内部 Set で集約 → canonical order に従って Array 化。 これにより同 input → 同 output (= snapshotId と同思想の deterministic)。

### 新 invariant: `jsonSafeOutput`

`DayGraphIntegrityContract` に 12 番目の invariant として追加:

```typescript
interface DayGraphIntegrityContract {
  ...
  /** graph object は JSON-safe (= Set / Map / function / symbol / bigint なし) */
  readonly jsonSafeOutput: true;
}
```

### 実装: `assertJsonSafeStructure`

`assertDayGraphCompliance` 内で graph を再帰的に traverse し、 Set / Map / function / symbol / bigint を検出 → throw `DayGraphIntegrityError("jsonSafeOutput", ...)`。

```typescript
function assertJsonSafeStructure(graph: DayGraph): void {
  function check(val: unknown, path: string): void {
    if (val === null || val === undefined) return;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return;
    if (val instanceof Set) throw new DayGraphIntegrityError("jsonSafeOutput", `Set at ${path}`);
    if (val instanceof Map) throw new DayGraphIntegrityError("jsonSafeOutput", `Map at ${path}`);
    if (Array.isArray(val)) { val.forEach((item, i) => check(item, `${path}[${i}]`)); return; }
    if (typeof val === "object") {
      for (const k of Object.keys(val)) check((val as Record<string, unknown>)[k], `${path}.${k}`);
      return;
    }
    throw new DayGraphIntegrityError("jsonSafeOutput", `non-JSON ${typeof val} at ${path}`);
  }
  check(graph, "graph");
}
```

将来の Set / Map 混入を **自動検出** (= 将来の Layer 1/2/3 attribute 追加時の regression 防止)。

### 実装範囲 (= K-1f-β commit)

- `dayGraphTypes.ts`: `TIME_BUCKET_CANONICAL_ORDER` export + `timeBucketCoverage` Array 化 + `jsonSafeOutput` invariant
- `dayGraphAttributes.ts`: Set → canonical-ordered Array 変換
- `dayGraphIntegrityContract.ts`: `assertJsonSafeStructure` 統合
- tests: `.has()` → `.includes()` 変換 + JSON round-trip test 追加 + Set 混入検出 test

---

## 20. 関連 docs

- `docs/alter-plan-phase3-j-closeout-audit.md` — Phase 3-J 完了監査 (= 3-K の前提)
- `docs/alter-plan-phase3-j-deferred-smoke-ledger.md` — deferred 5 項目 (= 3-K は新たな deferred を追加しない)
- `docs/alter-plan-phase3-j-pr-runbook.md` (= §8 Diff Safety Addendum 含む) — GitHub 復旧後の PR 手順
- `docs/decision-log.md` — Phase 3-K 着手 entry (= 別 commit で追記予定)
- `CLAUDE.md` — Rule 7 (State Safety) + Rule 8 (Work-Start Verification)
- `lib/plan/dayGraph/anchorVerbMap.ts` — 既存 verb 推論 (= 再利用)
- `lib/plan/dayGraph/dayMood.ts` — 既存 mood 推論 (= 再利用)
- `lib/plan/dayGraph/latencyToleranceMap.ts` — 既存 latency 分類 (= 3-K で optional 活用)
- `lib/plan/anchorOverlap.ts` — 既存 overlap 検出 (= 再利用)
- `app/(culcept)/plan/tabs/_helpers.ts` — 既存 anchorsForDay (= 入力前提)

---

## 21. CEO 判断ポイント

本設計 docs を以て:

1. **設計 GO** → K-1a 〜 K-1e の実装に進む (= 別 branch、 GitHub 復旧後の origin/main から派生)
2. **設計 NO-GO / 部分修正** → 本 v1.0 を v1.1 に改訂 (= 同 docs、 同 branch、 別 commit)
3. **更なる scope 縮小** → 革新補強の一部 (= 例 view perspective / fixtures export) を後 phase 預け
4. **更なる scope 拡大** → CEO 制約緩和必要 (= 但し永続禁止項目は不変)

実装着手は **CEO 別承認後**。 現時点で:
- ✅ docs-only commit (= 本ファイル + decision-log entry)
- ❌ 実装 commit なし
- ❌ frozen 4 branches への commit なし
- ❌ fetch / push / gh なし
- ❌ branch delete / reset / restore / stash なし

