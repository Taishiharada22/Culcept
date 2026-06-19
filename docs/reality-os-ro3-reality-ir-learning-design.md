# RO-3 — Reality IR 学習化 設計（docs-only・実装は RO-3 GO 後）

- **status**: 設計 v0.1（docs-only・**14-agent リサーチ Workflow + 敵対的検証 4 次元反映**）。**code 変更ゼロ・write 0・migration 0・DB/production 不接触**
- **CEO GO**: RO-3 設計着手（2026-06-20・RO-2 実装着地に続けて）
- **lineage**: RO-0（scope reset・「比較・更新学習」=①未実装と整理）→ RO-1（TaskRealityNode / ScheduledWorkBlock / TaskOutcome / 5 edge join 鍵）→ RO-2（leaveByLines / prepTime / Intervention Ladder / TriggerCondition）→ 本書。RO-1 `taskEdgePrep.ts:9-11` が「typed RealityGraphEdgeV0 / RealityDiff / snapshot 永続化は **RO-3 所管**」と明示委譲した未着手領域を確定する。
- **方法**: premise を実コードで検証（Ground 6 並列）→ 3 設計 spine 提案 → 統合 → 敵対的検証 4 次元（honesty / node-universe-phantom-edge / boundary / RO-1·2 非破壊）。検証 **15 mustFix（全 CONCERN・FAIL 0）** を §10 で反映（本文は反映後の正本）。
- **設計の粒度**: 大枠（RO-3）の中で D1〜D5 に小さく割る。**実装は RO-3 単位**（micro-phase に割らない）。
- **核心アーキテクチャ**: **"Two-Universe, Single-Frame"** — snapshot を 1 バイトも改変せず（`assertSameIdSet` guard を壊さず）、snapshot 内宇宙（ern/mv/cs）と snapshot 外宇宙（task/block）を `RealityFrameV0` 封筒で injected に束ね、2 宇宙跨ぎ typed edge を **phantom = 0** で成立させる。phantom edge は「作らない」でなく **`checkResolvable` で id 解決必須 → 作れない**。

---

## 0. GOAL（北極星）

> RealityGraphSnapshot を単発の現在状態で終わらせず、**前回状態との差分（RealityDiff）**を取り、Task / Movement / Event / Energy / Outcome / Correction を **typed edge** で接続し、ユーザー拒否/修正を **Correction Gradient** に分解し、次回判断に還流できる **Reality IR 学習ループの最小心臓部**を作る。単なる edge 型追加では弱い。

到達定義（RO-3 完了 = 全達成）: **edge / diff / classify / gradient / seam** の 5 構成を、全 pure（IO/Date/乱数/DB/migration なし）・RO-1/RO-2/RC2a-6 型を 1 バイトも改変せず・snapshot root を触らず・B1/PredictionLedger に **書かない口だけ**として確定する。

---

## 1. premise 検証結果（Ground・実コード接地）

| premise | 検証結果 | 証拠 |
|---|---|---|
| task/block は RealityGraphSnapshot に含まれる | **refuted（核心）** | `realityGraphSnapshot.ts:128-134` の node 集合は ern/mv/cs/decisionDebt/momentSnapshot のみ。`TaskRealityNode\|ScheduledWorkBlock` は snapshot に 0 hit・import すらされない。`momentSnapshot.nodeRefs`（`momentSnapshot.ts:112-114`）も eventRealityNodeIds+movementRealityIds の 2 種のみ |
| snapshot は安定 node id で diff 可能 | **partial** | 含む 3 ノード種別は canonical sort 済み（`realityGraphSnapshot.ts:280-282` localeCompare）・duplicate throw（:191-196）・2 層 id（`graphIdentity.ts:116,121`）で安定 diff 可。ただし node universe が task/block を欠くため diff は**不完全**（task/block 由来の変化は捕捉不能） |
| typed edge は未実装 | **confirmed** | repo 全体で `RealityGraphEdgeV0` の定義/実装 0。`taskEdgePrep.ts:9` が「本 RO は定義/実装しない（RO-3 所管）」と自認。存在するのは join 鍵契約のみ |
| RealityDiff / snapshot 永続は未実装 | **confirmed** | `RealityDiff\|snapshotDiff\|compareSnapshot` の実体 0。snapshot は永続 blob でなく毎回 derive（`realityGraphSnapshot.ts:8-9`）・prior/persist フックなし |
| 既存 correction 基盤を再利用できる | **partial（訂正あり）** | `NextDayPriorAdjustment`（`dayStateTypes.ts:136-141`）は per-field+contextKey+direction+confidenceDelta の唯一の graded 型。ただし **direction は `raise\|lower` の 2 値**（:139）であって triad ではない（§10-B で訂正） |
| PredictionLedger に task を載せられる | **refuted** | `PredictionTargetNodeKind`（`predictionLedgerTypes.ts:24`）は `day\|event\|movement` のみで **`task` を持たない**。task outcome 候補は v0 で un-typeable（§10-F で訂正） |

**核心の含意**: (1) task/block を snapshot に注入すると `assertSameIdSet`（`realityGraphSnapshot.ts:177-183`「材料が別 graph 由来の疑い」で throw）を壊す → snapshot は触らず frame 封筒で外側から束ねる。(2) diff の完全性は node universe の完全性に依存 → task/block を欠く宇宙の不完全性を `workLaneDiffable` で honest 宣言。(3) edge/diff/correction の正本素材は RO-1/RO-2 に既存 → reinvent せず import 流用。

---

## 2. nodeUniverseDecision — "Two-Universe, Single-Frame"

**最終決定 = snapshot 不変・injected workLane・id-only resolvable gate。**

### 2.1 なぜ snapshot を触らないか
`RealityGraphSnapshotV0` の node 集合は ern/mv/cs/decisionDebt/momentSnapshot のみ（`realityGraphSnapshot.ts:128-134`・検証済）で task/block を import すらしない。snapshot に task/block を注入しようとすると `assembleRealityGraph` の `assertSameIdSet`（:177-183 で throw）を壊す＝**停止条件違反**。よって snapshot 型は触らない。

### 2.2 RealityFrameV0（上位封筒）
RO-3 kernel 入力として両宇宙を injected で受ける：

```
RealityFrameV0 = {
  snapshot: RealityGraphSnapshotV0,        // 宇宙A（参照のみ・所有しない・改変しない）
  workLane: {                              // 宇宙B（snapshot 外）
    tasks: TaskRealityNodeV0[],
    blocks: ScheduledWorkBlockV0[],
    carryOverSignals: TaskCarryOverSignalV0[],
  },
  edges: RealityGraphEdgeV0[],             // §4-①で materialize
  diff: RealityDiffV0 | null,              // §4-②で生成
}
```

frame は snapshot を **参照で束ねるだけ**で型を改変しない。

### 2.3 phantom edge を「作らない」から「作れない」へ
全 edge の端点 id は `trn:`/`swb:`/`ern:`/`mv:` の deterministic id（既存採番関数）のみを取り、materialize 前に必ず `checkResolvable` で **「frame が実保持する宇宙A id 集合 ∪ 宇宙B id 集合」に解決できるか**照合。解決不能なら edge を生成せず、RO-1 `taskEdgeJoinReadiness`（`taskEdgePrep.ts:73-102`・検証済）の `ready=false` honest-null 規律を全 edge kind に一般化して unresolved に記録（捏造で埋めない）。

### 2.4 task_block の join 軸（★mustFix A 反映 — 実 accessor に訂正）
> **訂正前（v0.1 ドラフトの誤り）**: 「`task.placements[] ↔ block.sourceRefs.taskId` の 3 prefix 混在（trn:付き / 素taskId / swb:付き）→ normalizeTaskRef で trn: 正規化」。これは**事実誤認**だった。

**実 accessor（`taskEdgePrep.ts:37-39, 81-84` 検証済）**：
- `task_block` の**正方向 join** = `task.placements[]`（**swb: block ids**・`taskRealityNode.ts:62,161` が swb: prefix 強制）↔ `block.blockId`（swb:）。**両端 swb:・非対称なし・正規化不要**。`taskEdgeJoinReadiness` はこの方向（placements を block.blockId 集合と直接照合）で readiness を判定する。
- `block.sourceRefs.taskId`（**素 taskId**・prefix なし・`scheduledWorkBlock.ts:27,96` が `trn:` を strip）↔ `task.taskRealityNodeId`（trn:）は**別の逆方向 back-reference**。ここにのみ prefix 非対称があり、`normalizeTaskRef`（`trn:${block.sourceRefs.taskId}` 正規化）は**この逆 join に限定**して適用する。
- 両方向は一致を要求（`taskBlockJoinViolations`・`scheduledWorkBlock.ts:129-145` が cross-check）。よって `checkResolvable` は **両方向の membership を replicate**: `placements ⊆ frame.blockIds` **AND** `strip(block.sourceRefs.taskId) == task id`。片方でも欠ければ edge を生成せず unresolved に記録（dangling 防止・`scheduledWorkBlock.ts:142-143` の既存 dangling guard と同質）。
- `joinBasis` 文字列は監査用 trace として **`'placements↔block.blockId'`**（誤った `'placements↔sourceRefs.taskId'` を撤回）。

### 2.5 属性由来 endpoint・leaveByLines
- deadline/calendar_window/proposal は実体ノードを持たないので universe を持たせず、id に発生元 node を内包する合成 id（例 `deadline:${task.taskRealityNodeId}:${task.deadline.value}`）。`value=null`（`taskDeadlineJoinKey` が null 返す・`taskEdgePrep.ts:42-44`）なら edge を作らない。
- `leaveByLines` は id を持たない ern 内 embedded value（`eventRealityNode.ts:143`）なので edge 端点にせず `toId=親ern id` を再利用する **intra-node lens edge**（phantom node を作らない）。

### 2.6 スコープ外エスカレーション
task/block が graph root / `momentSnapshot.nodeRefs` に未配線という構造穴（RO-1 D1/D2 が同日追加・RC2a-6 に未配線）は frame 封筒が**暫定で橋渡し**するだけ。本来の正規配線（graph root か別 lane root への接続）要否は **RO-1 D1/D2 owning session への CEO 判断エスカレーション**として §11 に明記。frame は配線の代替でなく injected な橋渡し。

---

## 3. diffMechanism — RealityDiff（snapshot A vs B・5 bucket・node-id 背骨）

**単位 = node id**（`graphIdentity` の安定 id・canonical sort 済み配列 `realityGraphSnapshot.ts:280-282` を前提）。`diffSnapshots(a: RealityFrameV0 | null, b: RealityFrameV0): RealityDiffV0`。

### 3.1 5 bucket 判定
1. **added** = B に存在し A に不在の id（id 集合の差）。A=null（初回）なら B 全ノードが added・他 bucket は空（**変化を発明しない**）。
2. **removed** = A に存在し B に不在の id。
3. **changed** = 両 frame に存在する同 id ノードの `RealityAttribute.value` 差分のみ（裸値でなく attribute 単位）。confidence 揺れは noise なので value 不変なら changed にしない（捏造防止）。
4. **resolved** = changed の意味的サブクラス。`RealityAttribute.value` が null→non-null の**単調確定のみ**。
5. **collapsed** = changed の意味的サブクラス。feasibility/出発線の余地が悪化方向に縮小。

### 3.2 v0 で発火可能な resolved/collapsed トリガ（★mustFix C/D 反映 — dormant 明示）
- ✅ **live**: `leaveByLines` の出発線 unresolved→双解決（`leaveByLines.ts:74-78`）。**ただし §4-②の専用パス経由**（§3.4 参照）。
- ⛔ **dormant（v0 で構造的に発火不能・捕捉例として挙げない）**:
  - `movement etaKnown false→true`: `movementReality.ts:131` が `knownFalse` で false 固定・INV `:210`（「v0 は false のみ」）が `etaKnown=true` を throw。**v0 では起き得ない** → resolved bucket の捕捉例から除外し dormant 注記。
  - `ern.departureStatus 悪化`: `transportTypes.ts:42` で `MovementResolutionStatus` は二値 `unresolved|resolved`・`eventRealityNode.ts:104`「3-K では常に unresolved」。**unresolved より悪い状態が存在せず**・v0 で field がそこから動かない → collapsed bucket の捕捉例から除外し dormant 注記。
  - acceptance criteria は dormant トリガを発火対象にしない（「resolved captures null→non-null」を unreachable path で検証しない）。

### 3.3 graphBaseId-aware diff（★mustFix G 反映 — 「同日」でなく「同日 AND 同入力リビジョン」）
`graphBaseId`（`graphIdentity.ts:116` = `rgb:<subjectiveDate>:<viewerKey>:<fnv1a64Hex(canonicalSerialize(inputRevisionSet))>`）が A と B で**一致する時のみ**同日 minute 差分（A.minuteOfSubjectiveDay < B）として changed/resolved/collapsed を計算。不一致なら `crossDay=true` を立て changed/resolved/collapsed を空にし added/removed のみ。

> **訂正（honest 化）**: `graphBaseId` は `inputRevisionSet` の hash を畳み込むため、一致は **「同 subjective day **かつ** 同入力リビジョン」**を意味し、単なる「同日」ではない。同日でも入力が変わった（例: ユーザーが task を編集）2 snapshot は `graphBaseId` 不一致 → `crossDay=true` で changed/resolved/collapsed を失い added/removed のみになる。これは**過少報告（捏造ではない）**だが、ドラフトの「同日 minute 差分」という framing は不正確であり、この**抑制盲点を明示宣言**する。`graphBaseId` は `:116`、minute 層 id は `:121` の `buildSnapshotId`（`rgs:` prefix・別関数）であって 2 層 identity の minute 層根拠として引く際は関数名を明記する。

### 3.4 leaveByLines resolved の専用パス（★mustFix G 反映 — generic walk では捕捉不能）
`leaveByLines` は `EVENT_REALITY_ATTRIBUTE_KEYS` から**除外**されており（`eventRealityNode.ts:140-143`「per-attribute walk に乗らない」）、`whyUnresolved` は `ReadonlyArray<LeaveByUnresolvedReason>`（`leaveByLines.ts:40`）＝**配列**であって null/non-null の `RealityAttribute.value` ではない。よって汎用 value-monotonic walk では「双解決」を検出できない。resolved bucket は **leaveByLines 専用 diff パス**（`whyUnresolved` 配列の空化を検出）を持ち、「resolved は value-monotonic 規則で一律捕捉される」という主張は撤回する。

### 3.5 宇宙完全性の honest 制約
宇宙A（snapshot 由来）は full diff 可能だが宇宙B（task/block）は snapshot 外。両 frame が `workLane` を持つ時のみ workLane id 集合 diff を別レーン計算し universe フィールドで区別。片方でも workLane 欠落なら **`workLaneDiffable: false`** を diff に明記し「task/block の変化は見ていない」と宣言（沈黙で完全性を偽装しない＝premise partial への誠実な対処）。prior snapshot 永続なし・両 frame は injected。`diffId` は deterministic 文字列（`rdiff:${fromSnapshotId}:${toSnapshotId}`・乱数なし）。

---

## 4. components（5 構成）

### ① RealityGraphEdgeV0（typed・9 kind・dual-universe id-only endpoints）

```
interface RealityGraphEdgeV0 {
  readonly schemaVersion: 0;
  readonly edgeId: string;          // `redge:${kind}:${fromId}:${toId}` deterministic・乱数なし
  readonly kind: RealityEdgeKind;
  readonly from: RealityNodeRef;
  readonly to: RealityNodeRef;
  readonly joinBasis: string;       // join 鍵の出所文字列（監査可能・例 'placements↔block.blockId'）
  readonly resolvable: boolean;
  readonly evidenceRefs: readonly string[];
}
RealityNodeRef = { universe: 'snapshot'|'workLane'|'attribute'; kind: NodeRefKind; id: string }
```

`RealityEdgeKind` = 9 union: RO-1 `taskEdgePrep.TaskEdgeKind` の 5（task_block / task_deadline / block_calendar_window / task_carry_over / task_proposal）を **import して union 合成**（再定義しない）+ RO-3 新設 4（event_movement / event_leave_by_lines / intervention_outcome / correction_model_adjustment）。

`materializeEdges(frame): { edges; unresolved: EdgeJoinReadinessV0[] }` は (a) RO-1 の 5 accessor を呼んで端点 id を取り、(b) §2.4 の通り task_block 逆 join のみ `normalizeTaskRef` で prefix 揃え、(c) `checkResolvable`（task_block は両方向 membership）で両端実在照合後に push。
- **event_movement**（★mustFix E 反映）: `ern.sourceRefs.anchorId ↔ mv.sourceRefs.toAnchorId`（`feasibilityJudgment.ts:267,427`）を新 accessor で突合（両端 snapshot 宇宙）。**ただし** `mv.sourceRefs.toAnchorId` は `toNode?.anchorId ?? t.toNodeId`（`movementReality.ts:99`）で anchor lookup miss 時に **NODE id へ fallback**する。よって gate は `ern:<date>:<anchorId>`（`compileEventRealityNodes.ts:191`）を**再構成して ern-id membership を確認**し、対応 ern が frame に無い movement は **edge を生成せず unresolved に記録**（phantom edge を作らない）。

**invariants**: 端点は全て deterministic id（array index 非依存）。resolvable=false の kind は edge を生成せず `taskEdgeJoinReadiness` 出力を unresolved に転記。属性 endpoint は value=null なら edge 作らない。event_leave_by_lines は toId=親ern（intra-node lens・phantom node なし）。joinBasis 必須で全 edge 監査可能。pure・no-IO。

**deferred**: intervention_outcome edge は producer 実体が薄い（asked/ignored/acted の綴り不在・`InsightReaction` とは別レーン）。correction_model_adjustment edge も B1 未実装ゆえ dormant。両者は kind 定義と resolvable gate のみ確定し materialize 実体は最小化。

### ② RealityDiffV0（§3 の型）

```
interface RealityDiffV0 {
  readonly schemaVersion: 0;
  readonly diffId: string;
  readonly fromSnapshotId: string | null;
  readonly toSnapshotId: string;
  readonly fromGraphBaseId: string | null;
  readonly toGraphBaseId: string;
  readonly crossDay: boolean;
  readonly nodes: { added: RealityNodeRef[]; removed: RealityNodeRef[]; changed: NodeChangeV0[] };
  readonly resolved: readonly ResolvedRefV0[];
  readonly collapsed: readonly CollapsedRefV0[];
  readonly workLaneDiffable: boolean;
}
NodeChangeV0 = { ref: RealityNodeRef; field: string; from: unknown; to: unknown }
```

**invariants**: added/removed=id 集合の対称差。changed=value 差のみ（confidence noise 除外）。resolved=null→non-null 単調確定のみ（§3.4 leaveByLines 専用パス含む・dormant トリガ除外）。collapsed=feasibility/余地の悪化縮小のみ（dormant トリガ除外）。A=null は added のみ。crossDay=true（graphBaseId 不一致＝**同日同入力でない**）は changed/resolved/collapsed 空。workLaneDiffable=false 時は task/block 由来変化を捕捉しないと明示。pure・prior 永続なし・injected。

**deferred**: collapsed 判定（bandGapMin 減少 vs 再計算 noise の境界）の精緻化は最小実装では単調縮小のみ検出。

### ③ RealityChangeV0（上位 dispatch・既存 6 union を畳まず参照）

```
interface RealityChangeV0 {
  readonly target: RealityNodeRef;
  readonly lane: ChangeLane;           // task | event | movement | intervention
  readonly classifiedAs: string;
  readonly sourceVocab: SourceVocab;   // task_outcome | plan_drift | night_check | movement | ro3_intervention_outcome
  readonly evidenceRefs: readonly string[];
}
```

`classifyChange(diff, frame)` が diff の changed/resolved/collapsed bucket と各 lane の下位 vocab を読んで materialize。task→`TaskOutcomeKind`（completed/partial/skipped/blocked/carried_over・`taskOutcome.ts:21-27` 参照）。event→`NightCheckDriftSelection.driftType`（`dayStateTypes.ts:118`）と `PlanDriftType`（正本は anchor 側）。movement→departure_line_changed（diff の resolved/collapsed + leaveByLines 変化から導出）。intervention→新 asked/ignored/acted union。

**invariants**: RO-1 doc:252 二重正本回避を厳守＝6 既存 union を 1 巨大 union に畳まず join 鍵で参照（partial/progressed と time_changed/location_changed の意味次元を潰さない）。intervention の asked/ignored/acted は綴り不在（Ground 確認）ゆえ `InsightReaction`（accepted/denied/ignored/explored・`alterUnderstanding.ts:1255`）を流用せず `ro3_intervention_outcome` として明示新レーン化（`ignored` 部分重複は sourceVocab で分離）。pure。

**deferred**: intervention asked/ignored/acted の producer 実体は別 owning session 依存で dormant。

### ④ CorrectionGradientV0（★mustFix B 反映 — 別型隔離・shape 参考のみ）

```
interface CorrectionGradientV0 {
  readonly axis: CorrectionAxis;       // duration | energy | prep | route | deadline | cognitiveLoad
  readonly contextKey: string;         // '<shift>|<density>' pipe 形式（NextDayPriorAdjustment.contextKey:138 流用）
  readonly direction: 'lower' | 'match' | 'higher';   // ★net-new union（下記参照）
  readonly confidenceDelta: number;    // gradient magnitude channel
  readonly verdict: CorrectionVerdict | null;
  readonly basis: readonly string[];   // join 鍵 evidence 必須
}
```

> **訂正前（v0.1 ドラフトの誤り）**: 「`NextDayPriorAdjustment` quad を **field union 拡張だけ**で再利用し、direction に triad `lower|match|higher` を載せる」。これは型不整合だった。

**訂正**: 実物 `NextDayPriorAdjustment.direction` は **`raise|lower` の 2 値**（`dayStateTypes.ts:139`・producer `gradeNightCheck.ts:147-148` も raise/lower を emit）であって triad ではない。triad `lower|match|higher` は**別型 `UserCorrection.direction`**（`dayStateTypes.ts:99`）の値空間。よって `NextDayPriorAdjustment` の direction field を triad 化するには **widen が必須**であり「拡張だけで再利用」は不可能。
- 本設計は `CorrectionGradientV0` を**別型で隔離**し、direction は **level 系 axis（duration/energy/cognitiveLoad/prep）向けの net-new union**（値空間は `UserCorrection.direction:99` を参照するが、`NextDayPriorAdjustment` の「再利用」とは名乗らない）。
- `NextDayPriorAdjustment` quad に対しては **shape の参考（per-field+contextKey+direction+confidenceDelta の形）のみ**を取り、「並走型」であることを正直に明記（reinvent under a reuse label を回避）。
- accept/reject 系 axis（route/deadline）は PRM `CorrectionVerdict`（trust_more/suppress/adjust_direction/narrow_context・`memory-correction.ts:26-30`・VERDICT map `:43-`）を `verdict` に載せる。
- `decomposeCorrection(change, rejectReason): CorrectionGradientV0[]` は user 拒否/修正を 6 axis のどこを補正すべきかに分解。**過剰帰属禁止**: `rejectReason` に実 evidence のある axis にのみ `confidenceDelta` を載せ、evidence なし axis は触らない（`basis` に join 鍵 evidence 必須・捏造で全 axis に薄く撒かない）。

**axis 起源の二分**（既存 correction システムは交換不可・Ground 確認）:
- `energy ≈ energyLevel`（DayState `EstimateFieldKey`・System1・body-state level）と `duration ≈ durationBucket`（`ContextDimension`・**`dry-run-aggregation.ts:30,51` 所属**・**PRM 正本ではない**（★mustFix 引用訂正））は `mapToExistingAxis` で既存に透明写像。
- `prep / route / deadline / cognitiveLoad` は **net-new vocab**（premise refuted 尊重・型コメントで net-new 宣言・「既存軸」と偽らない）。

**deferred**: 1 拒否が複数 axis に帰属する時の `confidenceDelta` 配分は最小実装では単一最有力 axis のみ（希釈防止）。prep/route/deadline/cognitiveLoad の consumer は B1 未実装ゆえ honest dormant。

### ⑤ RealityLearningSignalV0 + buildRealityLearningSignal（pure kernel・seam-only・書かない）

```
interface RealityLearningSignalV0 {
  readonly edges: readonly RealityGraphEdgeV0[];
  readonly diff: RealityDiffV0;
  readonly changes: readonly RealityChangeV0[];
  readonly gradients: readonly CorrectionGradientV0[];
  readonly ledgerCandidates: readonly LedgerCandidateV0[];
  readonly unresolved: readonly EdgeJoinReadinessV0[];
}
LedgerCandidateV0 = {
  readonly targetNodeId: string;
  readonly targetNodeKind: PredictionTargetNodeKind | 'task_untypeable_v0';   // ★mustFix F 反映
  readonly outcome: TaskOutcomeKind;
  readonly observedAt: string;
  readonly learningSourceKind: 'correction' | 'drift';
  readonly sampleSizeContribution: number;
}
```

`buildRealityLearningSignal(a: RealityFrameV0 | null, b: RealityFrameV0): RealityLearningSignalV0` が ①②③④ を **1 回の pure 呼び出し**に束ねる学習ループの最小心臓部。

**★mustFix F 反映（targetNodeKind 欠落）**: `PredictionTargetNodeKind`（`predictionLedgerTypes.ts:24`）は `day|event|movement` のみで **`task` を持たない**。一方 RO-1 の `TaskLedgerSignalV0`（`taskOutcome.ts:77-82, 112`）の `targetNodeId` は trn: prefix の task id。よって **task 起源の `LedgerCandidateV0` は v0 では valid な kind を持てない**。本設計は：
- task 起源候補を **`'task_untypeable_v0'` と明示マーク**し、「`TaskLedgerSignalV0` の lossless な整形」とは**主張しない**（target enum が task を表現できない事実を隠さない）。
- `PredictionTargetNodeKind` への `task` 追加（widen）要否を **§11 openDecision にエスカレーション**（RO-3 は型改変を禁じているため、widen は B1/owning session 判断）。
- movement/event 起源候補は既存 kind で valid に typeable。

**invariants**: DB/localStorage/PredictionLedger に一切 write しない（関数戻り値のみ・seam=型の口だけ）。`ledgerCandidates` は RO-1 `applyTaskOutcome` が返す `ledgerSignal`（`TaskLedgerSignalV0`）+ `carryOverSignal` を frame から収集して整形するだけ（新語彙発明でなく materialize）。これは `PredictionLedger.learningCandidate{eligible, evidenceQuality, sampleSize, recencyDays}`（`predictionLedgerTypes.ts:108-113`（★引用訂正: :107→:108））と `PredictionCalibration{learningSourceKind, sampleSize, ...}`（:27-34・`learningSourceKind=correction|night_check|drift|mixed`:30）が将来 consume できる形に揃える＝口。eligible 判定（≥14 日 gate・**code 未実装の段階名**）・`PredictionEntry` materialize・calibration 焼き戻しは RO-3 でやらない（B1/RJ6 所管・`predictionLedgerTypes.ts` は型のみ runtime なし）。producer のみ consumer ゼロの **honest dormant**（現状 `nextDayPriorAdjustments` と同じ待機状態）。pure・injected・Date/乱数/IO なし。

**deferred**: 同一 task の複数 block outcome を二重カウントしない dedup 規律は seam 契約として明記するが実装は B1 側 gate に委譲。`ledgerSignal` を `PredictionEntry.actual` に materialize する接続実体は RJ6 所管。

---

## 5. edgeKinds（9 種・正誤訂正済み）

| kind | join 軸 | 出自 | 備考 |
|---|---|---|---|
| task_block | **`task.placements[]`(swb:) ↔ `block.blockId`(swb:)**・正規化不要 | RO-1 継承 | 逆 join `block.sourceRefs.taskId`(素)↔`task.taskRealityNodeId`(trn:) のみ normalizeTaskRef。checkResolvable は両方向 |
| task_deadline | `task.deadline.value`・null なら edge なし | RO-1 継承 | 合成 id endpoint |
| block_calendar_window | `block.sourceRefs.calendarWindowRef` | RO-1 継承 | |
| task_carry_over | `applyTaskOutcome` の carryOverSignal 口 | RO-1 継承 | trn: prefix・正規化不要 |
| task_proposal | `task.taskRealityNodeId` | RO-1 継承 | RO-4 前提 |
| event_movement | `ern.sourceRefs.anchorId ↔ mv.sourceRefs.toAnchorId`・**gate は `ern:<date>:<anchorId>` 再構成で membership 確認** | RO-3 新設 | 両端 snapshot 宇宙・toAnchorId fallback 対策 |
| event_leave_by_lines | intra-node lens・toId=親ern | RO-3 新設 | leaveByLines は id なし embedded value |
| intervention_outcome | asked/ignored/acted | RO-3 新設 | InsightReaction と別レーン・producer 薄く dormant |
| correction_model_adjustment | CorrectionGradient → target node | RO-3 新設 | B1 未実装ゆえ dormant |

---

## 6. innovations

1. **RealityFrameV0 上位封筒**: snapshot を 1 バイトも改変せず（`assertSameIdSet` guard を壊さず）task/block を injected workLane で frame レベルに束ね、2 宇宙 typed edge を成立させる。RC2a-6/RO-1/RO-2 型を不変に保つ。
2. **node-resolution（checkResolvable）gate で phantom edge を「作らない」から「作れない」に格上げ**: 端点が frame 実保持 id 集合に解決できない edge は構造的に生成不能。RO-1 `taskEdgeJoinReadiness` の honest-null 規律を全 9 edge kind に一般化（task_block は両方向 membership・event_movement は ern-id 再構成）。
3. **RealityDiff-first 背骨 + resolved/collapsed を changed の意味的サブクラス化**: `RealityAttribute` の pending→確定（leaveByLines unresolved→双解決）を resolved として捕捉し「不確実性の解消」を時系列の第一級イベントに昇格。
4. **graphBaseId-aware diff**: 同 graphBaseId（**同日 AND 同入力リビジョン**）時のみ minute 差分を changed として計算し、別日/別入力 snapshot は crossDay フラグで抑制。2 層 identity を diff の正当性 gate に転用（過少報告は honest 宣言）。
5. **Change/Outcome を 1 union に畳まず sourceVocab タグ付き上位 dispatch**: 6 既存 union を join 鍵参照で温存し意味次元を潰さない（RO-1 doc:252 二重正本回避を型で強制）。
6. **Correction Gradient の別型隔離 + axis 起源で値空間二分**: level 系は triad（`UserCorrection.direction:99` 値空間の net-new union）、accept/reject 系は PRM `CorrectionVerdict`。2 つの disjoint correction システムを統合せず、`NextDayPriorAdjustment` quad は **shape 参考のみ**（「再利用」と偽らず並走型と明記）。
7. **degenerate event_leave_by_lines edge**: id を持たない ern 内 embedded value を ern 自身を両端とする intra-node lens edge で運び、phantom node を作らずに出発線変化を diff に乗せる。
8. **workLaneDiffable フラグで diff の宇宙不完全性を honest 宣言**: task/block 由来変化を捕捉できない時に沈黙で完全性を偽装せず明示（premise partial への誠実な実装）。

---

## 7. boundaries

1. snapshot 型（`RealityGraphSnapshotV0`）と RO-1/RO-2 ノード型（`TaskRealityNodeV0`/`ScheduledWorkBlockV0`/`EventRealityNodeV0`/`MovementRealityV0`/`LeaveByLinesV0`/`TaskCarryOverSignalV0`/`TaskLedgerSignalV0`）を一切改変しない（import して読むのみ・frame 封筒で外側から束ねる）。
2. snapshot root（`assembleRealityGraph`）と `momentSnapshot.nodeRefs` に task/block を配線しない（`assertSameIdSet` guard を壊さない・正規配線要否は owning session への CEO エスカレーション）。
3. DB/migration/localStorage/Supabase/IO/Date/乱数を一切持たない（全 kernel pure・id は deterministic 文字列・両 snapshot は injected）。
4. PredictionLedger/PredictionEntry に書かない（seam=型の口だけ・eligible 判定/calibration 焼き戻し/PredictionEntry materialize は B1/RJ6 所管）。
5. RO-1 の 5 join 鍵（taskEdgePrep accessor）・carryOverSignal/ledgerSignal（taskOutcome）・`UserCorrection.direction` 値空間・PRM `CorrectionVerdict`・`PredictionLedger.learningCandidate` を import 流用し reinvent しない（**ただし `NextDayPriorAdjustment` は shape 参考のみ・「再利用」と名乗らない**）。
6. 6 既存 outcome/change union を 1 巨大 union に統合（merge/再定義）しない（上位 dispatch で join 鍵参照のみ）。
7. intervention asked/ignored/acted は `InsightReaction` を流用せず `ro3_intervention_outcome` として別レーン新設（重複正本化回避）。
8. 最小心臓部に絞る（過剰実装しない）: collapsed の意味的縮小チューニング・多軸 confidenceDelta 配分・dedup・intervention/correction producer 実体は最小化または後回し。

---

## 8. acceptanceCriteria

1. `materializeEdges` が 9 edge kind を全て型で表現し、端点が frame 実保持 id 集合に解決できない edge を一切生成しない（**phantom=0**）。解決不能は `unresolved: EdgeJoinReadinessV0[]` に `ready=false` で honest 記録。
2. **task_block edge は両方向 membership**（`placements ⊆ frame.blockIds` AND `strip(block.sourceRefs.taskId) == task id`）で resolve され、`normalizeTaskRef` は逆 join のみに適用される（正方向 placements↔blockId は正規化しない）。dangling edge を生成しない。
3. `RealityDiff` が A=null（初回）で added のみ・他 bucket 空（変化を発明しない）。graphBaseId 不一致（**同日同入力でない**）で crossDay=true かつ changed/resolved/collapsed 空。
4. changed が `RealityAttribute.value` 差のみで confidence 揺れを含めない。resolved が null→non-null 単調確定のみ（**leaveByLines は専用パス**で捕捉・generic walk に依存しない）。**dormant トリガ（etaKnown false→true / departureStatus 悪化）を発火対象にしない**。
5. workLane 片欠落時に `workLaneDiffable=false` を diff に明記（沈黙で完全性を偽装しない）。
6. `classifyChange` が 6 既存 union を 1 union に畳まず sourceVocab タグ付き `RealityChangeV0` で参照（意味次元を潰さない）。
7. `decomposeCorrection` が `CorrectionGradientV0` の direction を level 系=triad（net-new union）/ accept-reject 系=`CorrectionVerdict` に axis 起源で分岐し、energy/duration を `mapToExistingAxis` で既存に写像、prep/route/deadline/cognitiveLoad を net-new と型コメントで宣言。**`NextDayPriorAdjustment` を「再利用」と主張しない**（shape 参考のみ）。
8. `decomposeCorrection` が rejectReason に実 evidence のある axis にのみ confidenceDelta を載せ basis に join 鍵 evidence を必須化（過剰帰属しない）。
9. `buildRealityLearningSignal` が PredictionLedger/DB/localStorage に一切 write せず関数戻り値のみ（pure・seam-only・grep で write/Supabase/Date/乱数 0 hit）。**task 起源 ledgerCandidate を `'task_untypeable_v0'` で明示**（lossless 整形と偽らない）。
10. RO-1/RO-2/RC2a-6 型の改変が 0（git diff で snapshot/ノード型ファイル変更なし）。

---

## 9. auditPlan

- **contract-audit**: 各 interface（RealityGraphEdgeV0 / RealityDiffV0 / RealityChangeV0 / CorrectionGradientV0 / RealityLearningSignalV0 / LedgerCandidateV0）が RO-1 taskEdgePrep（5 accessor 戻り型）・taskOutcome（carryOver/ledger signal）・`UserCorrection.direction`/`NextDayPriorAdjustment` shape・PRM `CorrectionVerdict`・`PredictionLedger.learningCandidate`/`PredictionCalibration` と field 単位で整合するか検証。**direction の値空間出自（triad=`UserCorrection`:99 / raise|lower=`NextDayPriorAdjustment`:139）を取り違えないこと**・**task_block join basis が `placements↔block.blockId` であること**・**`targetNodeKind` に task が無く `'task_untypeable_v0'` で処理されること**を明示確認。流用元型の改変ゼロを git diff で確認。
- **coverage-audit**: 9 edge kind / 5 diff bucket / 4 ChangeLane / 6 CorrectionAxis が defined→materialize→returned→（seam で）渡せる形に到達するか Coverage Matrix で層横断検証。net-new 4 axis と intervention_outcome/correction_model_adjustment、**v0-dormant トリガ（etaKnown/departureStatus）**が honest dormant（producer あり/consumer ゼロ or unreachable）であることを明示確認。
- **signal-trace**: 単一 task の outcome（`applyTaskOutcome` の ledger/carryOver signal）が frame→materializeEdges（task_carry_over edge・両方向 resolve）→classifyChange（task lane）→decomposeCorrection（duration/energy axis）→buildRealityLearningSignal（LedgerCandidateV0・`'task_untypeable_v0'`）まで 1 本のシグナルとして欠落なく流れ、かつ PredictionLedger に write されない（seam 止まり）ことを end-to-end トレース。
- **orphan-audit**: checkResolvable で生成不能になった edge が unresolved に確実に転記され孤立しないこと、workLaneDiffable=false 時に task/block diff が明示宣言されること、CorrectionGradientV0/LedgerCandidateV0 が consumer ゼロでも seam 戻り値として到達可能（honest dormant ≠ orphan）であることを検証。RO-1 join 鍵 accessor の未使用孤立がないことも確認。

---

## 10. 敵対的検証 — 15 mustFix（全 CONCERN・FAIL 0）反映

アーキテクチャ（Two-Universe Single-Frame・checkResolvable・5-bucket diff・6-axis gradient・seam-only）は **健全（FAIL 0）**。grounding 詳細に外科的訂正が必要だった。15 mustFix は実質 7 系統に収斂（複数次元が同一中核欠陥を独立検出）。**本書 §2〜§9 は全て反映後の正本**。

### A. task_block join 記述の誤り（mustFix #1 / #7 / #12 / #14 — 全 4 次元が指摘・最頻出）
- **誤**: 「`task.placements[] ↔ block.sourceRefs.taskId` の 3 prefix 混在 → normalizeTaskRef で trn: 正規化」。
- **正**: 正方向 join = `task.placements[]`(swb:) ↔ `block.blockId`(swb:)（`taskEdgePrep.ts:81-84`・`taskRealityNode.ts:62`）で**両端 swb:・非対称なし・正規化不要**。`block.sourceRefs.taskId`(素)↔`task.taskRealityNodeId`(trn:) は**別の逆 join**で、ここにのみ非対称があり normalizeTaskRef を限定適用。`checkResolvable` は**両方向 membership を replicate**。joinBasis を `'placements↔block.blockId'` に訂正。
- **反映先**: §2.4 / §4-① / §5 / §8-2 / §9。

### B. CorrectionGradient.direction の出自誤り（mustFix #5 / #10 / #11 / #13 — 4 次元指摘）
- **誤**: 「`NextDayPriorAdjustment` quad を field union 拡張だけで再利用し direction に triad を載せる」。
- **正**: `NextDayPriorAdjustment.direction` は `raise|lower`（`dayStateTypes.ts:139`・producer `gradeNightCheck.ts:147-148`）。triad `lower|match|higher` は別型 `UserCorrection.direction`（:99）。`CorrectionGradientV0` を**別型隔離**し direction は net-new union（値空間は `UserCorrection`:99 参照）・`NextDayPriorAdjustment` は **shape 参考のみ**で「再利用」と名乗らない。§11 の widen-vs-別型 議論はこの非互換を前提に再構成。
- **反映先**: §4-④ / §6-6 / §7-5 / §8-7 / §11-2。

### C. movement etaKnown false→true を dormant 化（mustFix #3 一部 / #8）
- v0 で `etaKnown` は false 固定（`movementReality.ts:131,210`）→ この resolved トリガは**構造的に発火不能**。resolved bucket の捕捉例から除外し dormant 注記。
- **反映先**: §3.2 / §4-② / §8-4。

### D. departureStatus 悪化を dormant 化（mustFix #3 一部）
- `MovementResolutionStatus` は二値 `unresolved|resolved`・3-K で常に unresolved（`transportTypes.ts:42`・`eventRealityNode.ts:104`）→ 悪化方向が存在しない。collapsed bucket の捕捉例から除外し dormant 注記。
- **反映先**: §3.2 / §4-②。

### E. event_movement resolvable gate の明示（mustFix #9）
- `mv.sourceRefs.toAnchorId` は anchor miss 時に `t.toNodeId` へ fallback（`movementReality.ts:99`）→ gate は `ern:<date>:<anchorId>`（`compileEventRealityNodes.ts:191`）を再構成して ern-id membership を確認し、対応 ern が無い movement は edge を作らず unresolved に記録。
- **反映先**: §4-① / §5。

### F. LedgerCandidate.targetNodeKind 欠落（mustFix #2）
- `PredictionTargetNodeKind`（`predictionLedgerTypes.ts:24`）= `day|event|movement`・**task なし** → task 起源候補を `'task_untypeable_v0'` と明示マークし lossless 整形と偽らない。`PredictionTargetNodeKind` への task 追加要否を §11 にエスカレーション。
- **反映先**: §4-⑤ / §8-9 / §11-5。

### G. honest 詳細の訂正 3 件（mustFix #4 / #6 / #15）
- **#4 leaveByLines resolved 専用パス**: `leaveByLines` は `EVENT_REALITY_ATTRIBUTE_KEYS` 除外（`eventRealityNode.ts:140-143`）・`whyUnresolved` は配列 → generic value-monotonic walk で双解決を検出不能 → 専用 diff パスを明記し「一律捕捉」主張を撤回（§3.4）。
- **#6 graphBaseId は「同日 AND 同入力リビジョン」**: hash が `inputRevisionSet` を畳むため（`graphIdentity.ts:116`）、同日でも入力変更で crossDay=true・changed/resolved/collapsed を失う過少報告盲点を honest 宣言。minute 層 id は `:121` `buildSnapshotId`(rgs:) と関数名明記（§3.3）。
- **#15 off-by-one 引用の全数修正**: `learningCandidate` :107→**:108-113**・`InsightReaction` :1256→**:1255**・`durationBucket/ContextDimension` の所属を「PRM」→**`dry-run-aggregation.ts:30`**・`graphBaseId` 併記 :121 は `buildSnapshotId`。
- **反映先**: §3.3 / §3.4 / §4-③④⑤。

### honesty PASS（訂正不要だった健全点）
- core diff は**変化を捏造しない**（added=set-diff・A=null は added のみ・crossDay 抑制・confidence noise 除外・workLaneDiffable 宣言）。
- learning signal を**確定的に見せない**（confidenceDelta は delta channel・eligible/calibration は B1 に残す・honest dormant 宣言）。
- net-new vs existing axis の honest 宣言・`InsightReaction` を流用しない判断・seam が**構造的に write-proof**（`predictionLedgerTypes.ts` は runtime ゼロ・writer 不在）は全て健全。

---

## 11. openDecisions（CEO 判断）

1. **task/block の正規配線 vs frame 暫定**: graph root（`assembleRealityGraph`）/ `momentSnapshot.nodeRefs` に正規配線するか、frame 封筒の injected 暫定で恒久運用するか — RO-1 D1/D2 owning session への CEO 判断エスカレーション（frame は配線の代替でなく橋渡し・将来 injected vs snapshot 内の二重供給衝突リスク）。
2. **CorrectionGradientV0 別型隔離 vs NextDayPriorAdjustment widen**: 本設計は**別型隔離を採用**（direction 値空間が `raise|lower` と triad で非互換なため widen は dayState 既存 3-field 消費に影響）。ただし 2 型併存の管理コストあり。最終裁定は CEO。
3. **intervention asked/ignored/acted の producer 実体**: 介入後の本人反応観測をどこで生成するか、将来 `InsightReaction` との統合圧力にどう対処するか — 別 owning session 依存・現状 dormant。
4. **B1 gate（観測≥14 日）契約**: code 未実装の段階名であり、seam が正しく B1 接続契約を満たすかは B1 実装時まで確定不能。`LedgerCandidateV0.sampleSizeContribution` の dedup（同一 task の複数 block 二重カウント防止）を seam 側で明記するか B1 gate に委譲するか。
5. **PredictionTargetNodeKind への `task` 追加要否**: task 起源 ledgerCandidate が現状 un-typeable（§4-⑤）。`PredictionTargetNodeKind` を `task` で widen するか、task 起源は B1 で別扱いするか — 型改変ゆえ B1/owning session 判断（RO-3 は型を改変しない）。
6. **collapsed 判定の精緻度**: feasibility 余地の意味的縮小 vs 再計算 noise の境界 — 最小実装は単調縮小のみ検出。チューニングを観測前に決めるか後回しか。
7. **event drift の正本選択**: anchor 側（`PlanDriftType` 広い正本）と Night Check UI サブセット（`NightCheckDriftSelection`）のどちらを movement の departure_line_changed 導出 join 鍵にするか（取り違えると二重カウント）。

---

## 12. 実装 GO 判断（CEO 待ち）

本書は **docs-only 設計 v0.1**。実装（D1〜D5 の pure kernel + injected fixtures）は **CEO の RO-3 実装 GO 後**。RO-1/RO-2 と同じ規律で実装する: pure のみ・write 0・migration 0・production 不接触・大枠 RO-3 単位（micro-phase に割らない）・完了報告で進んだ部署明記・dev 表示を価値到達と報告しない。openDecisions のうち実装を阻害するもの（#1 配線方針・#2 別型確定）は実装着手前に CEO 確認、残（#4/#5/#6/#7）は B1/ETA フェーズで再訪可（実装阻害なし）。
