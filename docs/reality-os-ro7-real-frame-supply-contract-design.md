# RO-7 — Real RealityFrame Supply Contract（**docs-only・停止条件該当で実装せず停止**）

- **status**: **docs-only supply contract**。CEO 裁定 #8 の**停止条件 #1（real task/block source 不在）+ #3（正本境界曖昧）に該当**したため、実装せず docs で停止し報告する。code 変更ゼロ。
- **CEO GO**: RO-7 GO（2026-06-20・RO-6 着地に続けて・裁定 8 点・**停止条件付き**）
- **lineage**: RO-1（TaskRealityNode/ScheduledWorkBlock・pure+injected）→ … → RO-6（synthetic fixture で dev preview）→ 本 RO-7（real frame supply の可否を確定）。
- **結論（先出し）**: real `RealityFrameV0` を**今は安全に供給できない**。snapshot 半分（ern/mv/cs）は real source があるが production 未配線、**workLane 半分（task/block）は real source が一切存在しない**。RO-4/5 proposal は task_proposal edge を tasks から得るため、real frame は proposal を生成できない。**焦って供給 helper を作ると phantom edge / 二重正本化（Origin OrbitTask との衝突）が起きる**（CEO #3 の警告どおり）。→ **docs-only で停止**。

---

## 1. 最初に疑った前提（CEO #3）と検証結果

| 疑った前提 | 検証結果（実コード） |
|---|---|
| dev-reality-pipeline が realityCore frame を作れる | **否定**。dev-reality-pipeline は Secretary OS 系統（WorldState）。realityCore frame は作らない（RO-6 で synthetic fixture を別途構築した） |
| real snapshot assembler 経路がある | **部分肯定**。`assembleRealityGraph` の caller は dogfoodPreview/operatorDayPreview/leaveByAssembly = **全て dev/preview**（production route ゼロ）。real anchor→compile chain は honest（RD0 §2・fake 禁止 enforce 済み）だが **production 未配線** |
| real task/block source がある | **否定（決定的）**。`buildTaskRealityNode`/`buildScheduledWorkBlock` の caller は test + RO-6 fixture + 自ファイルのみ。**non-test/non-fixture の real producer ゼロ**。task 永続 table なし。`TaskRealityNodeV0` を import する realityCore 外ファイル **ゼロ**（task は realityCore 内に完全に閉じる） |
| task の正本が明確 | **否定（曖昧）**。Origin に `OrbitTask`（`daily_orbit_state` table・`lib/origin/dailyOrbit/types`）という**別概念の task**が存在。TaskRealityNode とは別型・別 lineage。橋渡しは未決＋二重正本化リスク |

---

## 2. Real Source Inventory（CEO 必須）

| frame 構成要素 | real source | 状態 | 根拠 |
|---|---|---|---|
| **snapshot: eventRealityNodes (ern)** | `ExternalAnchorRepository.listAnchors(userId)` → `buildDayGraph` → `compileEventRealityNodes` | **real source あり・production 未配線**（dev のみ）。fake 禁止 enforce 済み（placeCertainty 常に unknown 等） | RD0 §1-2 / external-anchor-repository.ts:190 / compileEventRealityNodes.ts:94-119 |
| **snapshot: movementRealityNodes (mv)** | 同 anchor → `compileMovementReality` | 同上。routeKnown/etaKnown/leaveByKnown 常に knownFalse（欠測の明示） | RD0 §2 / movementReality.ts:123-128 |
| **snapshot: commitmentSignals (cs)** | 同 anchor → `compileCommitmentSignals` | 同上。companions→otherPeoplePossible 等 honest | RD0 §2 / commitmentSignal.ts:114-135 |
| **snapshot: momentSnapshot/decisionDebt/identity** | `deriveMomentSnapshot`/`deriveDecisionDebt`/`assembleRealityGraph` | real chain 動作可（RO-6 fixture で実証）。但し production caller ゼロ | RD0 §2 |
| **workLane: tasks (TaskRealityNodeV0)** | **なし** | **ABSENT**。producer ゼロ・DB table なし・realityCore 外 consumer ゼロ | git grep（§1） |
| **workLane: blocks (ScheduledWorkBlockV0)** | **なし** | **ABSENT**。producer ゼロ・DB table なし | git grep |
| **workLane: carryOverSignals** | `applyTaskOutcome`（real outcome 捕捉が前提） | **ABSENT**。real task outcome capture なし | taskOutcome.ts |
| （参考）Origin OrbitTask | `daily_orbit_state` table | **存在するが別型・別正本**。TaskRealityNode へは未配線・橋渡し未決 | TaskItem.tsx:12 / 20260326200000_daily_orbit_state.sql |

**核心**: snapshot 半分は「real だが未配線」、workLane 半分は「real source 不在」。**frame は半分しか real にできず、かつ RO-4/5 が必要とする task 側がゼロ**。

---

## 3. Synthetic（RO-6 fixture）vs Real Frame 差分表（CEO 必須）

| 観点 | RO-6 synthetic fixture | あるべき real frame |
|---|---|---|
| snapshot ノード | empty anchors の real compile chain（**event ゼロ**） | real anchor → ern/mv/cs（event あり） |
| subjectiveDate | 固定 `"2026-06-20"`（決定論） | server now → JST subjectiveDate（05:00 境界・recurring 展開） |
| viewerKey | `graphViewerKey("ro6-dev-preview")`（固定 synthetic） | `graphViewerKey(operator userId)`（owner-RLS） |
| inputRevisionSet | pending sentinel（dayStateRecord なし） | real recordRevision/dayGraphRevision/環境 等 |
| tasks | `ro6-demo`（synthetic・not_started→done で push 偽装） | **real task source が無い**（供給不能） |
| blocks | なし | **real block source が無い** |
| gradients | synthetic（duration lower） | real correction（decomposeCorrection の real 入力が必要・B1 系） |
| protect 根拠 | 常に空（event なし） | real collapsed event があれば発火 |
| 正直さ | **synthetic 明示**（dev fixture・実データでない） | real（但し task 欠落を honest に表明する必要） |

**警告**: synthetic→real の差は「データの中身」だけでなく **identity（subjectiveDate/viewerKey/inputRevisionSet/graphBaseId）の供給責務**にある。ここを揃えないと §5 の failure mode が顕在化する。

---

## 4. Integrity Conditions（frame supply が満たすべき整合・CEO #3 の core）

real frame を組む時、snapshot と workLane（task/block）が**同一 graph 由来**であることを保証しないと RO-3 diff/edge の意味が壊れる。

1. **同 subjectiveDate**: `snapshot.subjectiveDate === workLane の対象日`。task/block の date（`swb:<date>:<n>`）が snapshot の subjectiveDate と一致。不一致なら crossDay 扱いになり diff が壊れる（graphBaseId は `rgb:<subjectiveDate>:…`・graphIdentity.ts:116）。
2. **同 viewerKey**: snapshot の viewerKey（owner）と task/block の owner が同一 user。別 viewer の task を混ぜると identity が壊れる。
3. **同 inputRevisionSet 系**: graphBaseId は `inputRevisionSet` の hash を畳む（graphIdentity.ts:116）。同日でも入力リビジョンが違えば別 graphBaseId → RO-3 diff が crossDay で changed/resolved/collapsed を落とす（RO-3 §3.3）。task 編集が snapshot の inputRevisionSet に反映される設計でないと、task 変更が diff に出ない or 別 graph 扱いになる。
4. **task↔snapshot の anchorId 整合**: RO-4 protect は `task.sourceRefs.anchorId ↔ collapsed ern の anchorId`（RO-4 §4）。real task の anchorId が real snapshot の ern anchorId と同一名前空間でないと protect が永久空 or phantom。
5. **placements↔block の整合**: `task.placements`(swb:) が実在 block を指す（dangling なし）。block.sourceRefs.taskId が実在 task を指す（RO-4 両方向 checkResolvable）。real source が両方を整合させて供給する責務。
6. **phantom edge ゼロ**: 上記が崩れると materializeEdges が unresolved に落とす（捏造はしないが、edge が出ない＝proposal が空になる）。

---

## 5. Frame Supply Failure Modes（CEO 必須）

| failure mode | 原因 | honest な扱い（捏造しない） |
|---|---|---|
| **missing task source** | task/block の real producer 不在（現状） | frame の workLane を空にする（task を捏造しない）→ proposal ゼロ。これが**現在の状態** |
| **date mismatch** | task の date ≠ snapshot subjectiveDate | frame を組まず `null` + `missingSource/mismatch` を返す |
| **viewer mismatch** | task owner ≠ snapshot viewer | 同上（別 viewer の task を混ぜない） |
| **revision mismatch** | task 編集が inputRevisionSet に未反映 | diff が crossDay 扱い。honest に crossDay フラグ（RO-3 が既に処理） |
| **anchorId namespace 不整合** | task.sourceRefs.anchorId が ern anchorId と別系 | protect 永久空（honest 空・RO-4 §4 で既に honest 化） |
| **dangling placements/blocks** | 供給時に task/block が片方欠落 | checkResolvable が unresolved に落とす（phantom 作らない・RO-4） |
| **OrbitTask 二重正本化** | Origin OrbitTask を無理に TaskRealityNode に流用 | **やってはいけない**（別正本を混ぜると二重化）。橋渡しは別途明示設計が必要 |
| **synthetic 混入** | dev fixture を real path に紛れ込ませる | **禁止**（CEO #7）。real path は synthetic を import しない |

---

## 6. 設計のみ（**実装しない**）— `buildRealityFrameFromRealInputs` の契約 shape

停止条件該当のため**実装しない**。real task/block source が確定した将来フェーズで実装するための契約 shape だけ docs に残す：

```ts
// lib/plan/realityCore/realityFrameSupply.ts（※未実装・契約のみ）
export interface RealFrameInputsV0 {
  readonly snapshot: RealityGraphSnapshotV0;            // real anchor→compile chain 由来（injected）
  readonly tasks: ReadonlyArray<TaskRealityNodeV0>;     // real task source 由来（injected・現状は供給不能）
  readonly blocks: ReadonlyArray<ScheduledWorkBlockV0>;
  readonly carryOverSignals: ReadonlyArray<TaskCarryOverSignalV0>;
  readonly expected: { readonly subjectiveDate: string; readonly viewerKey: string }; // 整合検証の期待値
}
export interface FrameSupplyResultV0 {
  readonly frame: RealityFrameV0 | null;                // 整合 OK のときのみ非 null
  readonly missingSource: ReadonlyArray<string>;        // 欠落 source（"tasks" 等・honest）
  readonly mismatches: ReadonlyArray<string>;           // 整合違反（date/viewer/revision/dangling）
}
// buildRealityFrameFromRealInputs(inputs): FrameSupplyResultV0
//   §4 の整合条件を全検証 → 違反/欠落は honest に返し frame=null（捏造しない・synthetic を混ぜない）。
//   workLane が空でも frame は組める（honest 空・proposal ゼロ）。pure・injected・no-IO。
```

**実装しない理由（停止条件）**: 入力 `tasks` の real source が存在しない。helper を実装しても real な呼び出し元が無く、結局 synthetic を渡すしかない（CEO #7 違反）。よって helper は real task source 確定後に実装する。

---

## 7. 停止条件の該当（CEO #8）

| 停止条件 | 該当 | 詳細 |
|---|---|---|
| real task/block source が不明 | **✅ 該当** | TaskRealityNode/ScheduledWorkBlock の real producer ゼロ（決定的に不在） |
| snapshot と task/block の同日・同viewer・同revision整合が取れない | **✅ 該当（前提崩壊）** | task 自体が無いため整合以前の問題 |
| Secretary OS と realityCore の正本境界が曖昧 | **✅ 該当** | Origin OrbitTask（別正本）が存在し、task の real source をどこに置くか（OrbitTask 橋渡し / Secretary OS / 新規）が未決・二重正本化リスク |
| production data 接続が必要 | 部分該当 | snapshot real 化は production route 接続（RD0 の残作業）を要する |
| 既存型改変が必要 | 非該当 | 型改変は不要（契約は injected 入力で完結） |

→ **3 条件該当。実装せず docs-only supply contract で停止**（CEO #8 指示どおり）。

---

## 8. CEO への上申（unblock に必要な決定）

### 8.0 CEO 補足（2026-06-20）: Origin は削除予定
CEO 確認: **旧来の Origin（日記/自己探索/excavation 機能）は画面として削除予定**。`app/(culcept)/origin/` は巨大な journaling 機能で、`DailyOrbitSection`（todo）はその 1 レイヤー（`DailyOrbitEntry` の Layer 1: tasks）。**「使える部分は引っ張ってきてよいが Origin 画面自体は消す」**。
→ **推奨①の「Origin OrbitTask 橋渡し adapter」は撤回**。削除予定機能（Origin 画面）に依存する adapter は不適切。正しい道は **OrbitTask の*データモデル*を Origin 非依存の task source に salvage** する（画面に依存しない）。

### 8.1 OrbitTask → TaskRealityNode salvage 分析（実型・lib/origin/dailyOrbit/types.ts:240-265）
| TaskRealityNode 属性 | OrbitTask 対応 | salvage |
|---|---|---|
| deadline (ISO) | `dueDate`(YYYY-MM-DD) + `dueTime`(HH:mm) | ✅ 写像可 |
| completionStatus (6値) | `completed` + `carriedFrom` + `carryCount` | ✅ done/not_started/carried_over |
| carryOver signal | `carriedFrom`/`carryCount` | ✅ 良質な real 信号 |
| （recurrence） | `recurrence`(daily/weekly/…) | ✅ subjectiveDate 展開に使える |
| estimatedDuration | **なし** | ❌ honest-unknown（捏造しない） |
| cognitiveLoad | `nature`(TaskNature) がヒント程度 | ❌ honest-unknown |
| canSplit / canMove | `parentId`(subtask 1階層)のみ | ❌ honest-unknown |
| minimalProgress | なし（v0 null） | — |
| **placements / sourceRefs.anchorId** | **なし** | ❌ → **protect は anchor 無しで発火不可**・block も無し |

**含意**: OrbitTask は **push + task_proposal edge には十分**（completed→push / 全 task→task_proposal）だが、duration/load/split/move は honest-unknown、**anchor/block 不在ゆえ protect は永久空・easy は gradient 由来で task 非依存**。つまり salvage しても RO-4 の 3 stance のうち push が主、protect は別途 anchor 紐付けが要る。

### 8.2 修正後の選択肢（task の real source 設計・RO-8 候補）
1. **OrbitTask データモデル salvage 案（推奨・Origin 画面非依存）**: `DailyOrbitEntry.tasks`（OrbitTask）の **task データ層だけ**を Origin 画面から切り離し、realityCore 隣接の task source として再ホーム化（adapter は OrbitTask 型を import せず写像・二重正本化回避）。**利点**: real task データが既にある（dueDate/completed/carryover/recurrence）・Origin 画面削除と両立。**リスク**: `daily_orbit_state` table / 永続層の扱い（Origin 削除時に table を残す/移行する判断）・duration/load/anchor の欠落を honest-unknown で受ける。
2. **新規 task source 案（clean）**: TaskRealityNode 専用の入力を新設し 7 属性を捕捉。**利点**: 7 属性フル・anchor 紐付け可（protect 発火）。**リスク**: 新規 UI/データの実装コスト・Origin 削除後の空白期間。
3. **snapshot-only 先行案**: task を待たず event side だけ real 化。**proposal は task 無しで空**ゆえ価値出ない（非推奨）。

**推奨**: ①の **OrbitTask データモデル salvage**（Origin 画面非依存・docs-first・二重正本化回避最優先）。但し「前提を疑う」調査から: (a) `daily_orbit_state` 永続層を Origin 削除でどう扱うか、(b) OrbitTask の欠落属性（duration/load/anchor）を honest-unknown で受ける RO-4 proposal の質、(c) protect 発火に anchor 紐付け（OrbitTask↔anchor or block source）が別途要るか。

**本 RO-7 は docs-only supply contract で確定・停止。実装は CEO の task source 決定（Origin salvage 範囲含む）後。**
