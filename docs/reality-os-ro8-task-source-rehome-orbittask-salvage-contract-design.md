# RO-8 — Task Source Rehome / OrbitTask Salvage Contract（docs-first + pure canonical/projection・実 reader/migration なし）

- **status**: docs-first contract + pure canonical type/projection。**Origin UI 非依存・daily_orbit_state 直接依存なし・DB migration なし・production path なし**。停止条件を全評価し hard stop 非該当（実装は salvage reader/DB/migration を除いた pure 部分のみ）
- **CEO GO**: RO-8 GO（2026-06-20・RO-7 停止 → Origin 削除文脈を受けて・裁定 6 点・停止条件付き）
- **lineage**: RO-1（TaskRealityNodeV0・pure+injected・real source なし）→ RO-7（real frame supply 停止・task source 不在）→ 本 RO-8（task の **neutral canonical source** を設計し TaskRealityNode をその projection と位置づける）。
- **CEO 方針反映**: Origin（日記/自己探索）は画面削除予定。**Origin UI を未来の依存元にしない / `OrbitTask` を未来の正本名にしない / TaskRealityNode 専用 DB をいきなり作らない / `daily_orbit_state` に直接依存した本番 path を作らない**。OrbitTask の**データモデル・思想・既存データ**だけを salvage し、**neutral canonical task source へ再ホーム化**する。

---

## 0. GOAL（北極星）

> task の **neutral canonical source**（Origin 非依存）を設計し、`TaskRealityNodeV0` を**その canonical source からの projection** として扱う。OrbitTask から salvage できる属性・思想を引き継ぎ、欠ける属性は**捏造せず honest-unknown / future input** とする。実 reader / DB / migration はやらない（docs-first + pure 型/projection まで）。

到達定義: `CanonicalTaskV0`（neutral 型・OrbitTask を import しない）+ `projectCanonicalTaskToRealityNode`（pure・honest-unknown）を確定。daily_orbit_state の migration 候補を inventory（実行しない）。

---

## 1. Source Inventory（CEO 必須・実コード接地）

| 項目 | 実態 | 根拠 |
|---|---|---|
| OrbitTask の所在 | `lib/origin/dailyOrbit/types.ts:240-265`（`DailyOrbitEntry.tasks[]` の要素） | git grep |
| OrbitTask 永続層 | **専用 table なし**。`origin_profiles.daily_orbit_state`（**JSONB カラム**）に `DailyOrbitStore` 全体（entries/orbitLaws/threads/…）として保存。OrbitTask は `entries[].tasks[]` に埋没 | 20260326200000_daily_orbit_state.sql |
| read/write 経路 | **全て Origin UI コンポーネント**（DailyOrbitSection / CalendarView / TaskItem 等・`app/(culcept)/origin/_components/`） | git grep |
| localStorage 移行 | localStorage→server 移行済み（「サーバーを正とする」） | migration コメント |
| 他の task/todo 正本 | **なし**（OrbitTask / TaskRealityNode 以外に task/todo の型・正本ゼロ） | git grep（二重正本化チェック） |
| TaskRealityNode の real source | **なし**（RO-7 で確定・realityCore 内に閉じる） | RO-7 |

**含意**: salvage 元データは `origin_profiles.daily_orbit_state` JSONB に**Origin と強結合**して存在する。canonical source への移行は「JSONB から task 層を取り出す」作業を要する（DB 判断＝RO-8 では inventory のみ）。**他に競合する todo 正本は無い**ため、neutral canonical source は二重正本化しない。

---

## 2. OrbitTask Salvage 分析（属性 + 思想・実型接地）

### 2.1 属性 salvage（OrbitTask → canonical → TaskRealityNode）
| TaskRealityNode 属性 | OrbitTask フィールド | salvage | canonical での扱い |
|---|---|---|---|
| deadline (ISO) | `dueDate`(YYYY-MM-DD) + `dueTime`(HH:mm) | ✅ | `dueDate`/`dueTime` を保持・projection で ISO 合成 |
| completionStatus (6値) | `completed` + `carriedFrom` + `carryCount` | ✅ | `completed`/`carriedFrom`/`carryCount` 保持・projection で done/not_started 写像 |
| carryOver signal | `carriedFrom`/`carryCount` | ✅ 良質 | 保持（RO-1 carryOver 口に流せる） |
| minimalProgress | なし（v0 null） | — | — |
| estimatedDuration | **なし** | ❌ | **honest-unknown / future input**（捏造しない） |
| cognitiveLoad | `nature` がヒント程度 | ❌ | **honest-unknown**（nature は別 field で保持・将来 heuristic 余地・但し v0 は推論しない） |
| canSplit / canMove | `parentId`(subtask 1階層)のみ | ❌ | **honest-unknown**（parentId は保持・将来 split 推論余地） |
| placements / sourceRefs.anchorId | **なし** | ❌ | **honest-unknown**（anchor 紐付けは future input → protect 発火に別途要る） |

### 2.2 思想 salvage（OrbitTask 固有の rich signal・Aneurasync 哲学に沿う）
- **`TaskNature = "impulse" | "obligation" | "investment" | "curiosity"`**（`types.ts:9`）= タスクの**動機の本性**（なぜやるか）。判断原理・深層心理の観測信号。canonical に `motivation` として salvage。
- **`CompletionTexture = "satisfying" | "relieved" | "just_done"`**（`types.ts:25`）= 完了の**感触**。自己理解信号。canonical に `completionFeel` として salvage。
- `recurrence`（daily/weekly/…）= subjectiveDate 展開に使える。`tags` / `parentId`（subtask）も保持。

**これらは TaskRealityNode の 7 属性に無い**が、canonical source が保持すれば将来（cognitiveLoad 推論 / RO-4 proposal の動機反映 / 観測ループ）に活きる。**v0 projection では TaskRealityNode に流さず canonical に温存**（捏造しない・将来の入力）。

---

## 3. Canonical Task Shape（neutral・Origin 非依存・実装する）

```ts
// lib/plan/realityCore/canonicalTask.ts（neutral・OrbitTask を import しない・Origin 非依存）
export type TaskMotivation = "impulse" | "obligation" | "investment" | "curiosity"; // OrbitTask TaskNature を salvage（neutral 名）
export type CompletionFeel = "satisfying" | "relieved" | "just_done";                // OrbitTask CompletionTexture を salvage
export interface CanonicalTaskRecurrenceV0 { readonly pattern: "daily"|"weekly"|"weekdays"|"biweekly"|"monthly"|"custom"; readonly dayOfWeek?: number; readonly dayOfMonth?: number; readonly intervalDays?: number; }

export interface CanonicalTaskV0 {
  readonly schemaVersion: 0;
  readonly taskId: string;              // neutral id（trn: は projection で付与・ここでは付けない）
  readonly text: string;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly carriedFrom: string | null;  // YYYY-MM-DD
  readonly carryCount: number;
  readonly dueDate: string | null;       // YYYY-MM-DD
  readonly dueTime: string | null;       // HH:mm
  readonly recurrence: CanonicalTaskRecurrenceV0 | null;
  readonly motivation: TaskMotivation | null;   // 思想 salvage（深層観測信号・v0 は projection で流さず温存）
  readonly completionFeel: CompletionFeel | null; // 思想 salvage
  readonly tags: ReadonlyArray<string>;
  readonly parentId: string | null;      // subtask（1階層）
  readonly addedAt: string;
}
```

**規律**: OrbitTask 型を import しない（Origin 非依存）。`OrbitTask` を未来の正本名に固定しない（canonical 名は `CanonicalTaskV0`）。estimatedDuration/cognitiveLoad/canSplit/canMove/anchorId/placements は **canonical に持たない**（future input・捏造しない）。

---

## 4. Projection Contract（CanonicalTaskV0 → TaskRealityNodeV0・pure・honest-unknown・実装する）

```ts
// projectCanonicalTaskToRealityNode(task: CanonicalTaskV0, governance: {...injected}): TaskRealityNodeV0
```
写像（honest-unknown を守る）:
- **deadline**: `dueDate`+`dueTime` → JST ISO（`inferredAttribute`・user 入力ゆえ confirmed 寄り）。`dueDate` 無し → `unknownAttribute`（捏造しない）。
- **completionStatus**: `completed=true` → `done`（inferred confirmed）/ `carriedFrom≠null && !completed` → `not_started`（carried・evidence に carriedFrom）/ else → `not_started`。
- **estimatedDuration / cognitiveLoad / canSplit / canMove**: 全て `unknownAttribute`（**honest-unknown・捏造しない**）。
- **minimalProgress**: null（v0）。
- **placements**: `[]`（block source なし）。**sourceRefs**: `{ seedId: task.taskId }`（**anchorId は付けない**＝future input）。
- **changeEligibility / permissionLevel**: canonical source は governance を持たない → **caller injected の保守的 default**（projection の `governance` 引数・捏造でなく注入）。
- **taskRealityNodeId**: `trn:${task.taskId}`（RO-1 採番規約）。

**結果の性質**: deadline + completionStatus は real（salvage）/ duration・load・split・move・anchor は honest-unknown。→ RO-4 proposal は **push（completionStatus）+ task_proposal edge には十分**、**protect は anchor 無しで発火せず**（honest 空・RO-4 §4 が既に honest 化）、easy は gradient 由来で task 非依存。

**思想 field（motivation/completionFeel）は projection で TaskRealityNode に流さない**（TaskRealityNode に該当 field なし・捏造しない）。canonical に温存し将来 RO 階層が読む。

---

## 5. daily_orbit_state Migration 候補 Inventory（CEO 必須・**実行しない**）

`daily_orbit_state` は `origin_profiles` の JSONB。Origin 画面削除時の task データの扱いを 3 案で inventory（**DB 変更は RO-8 でしない**）:

| 案 | 内容 | 利点 | リスク/コスト |
|---|---|---|---|
| **A. 残して移行** | `daily_orbit_state.entries[].tasks` を新 canonical task table/store に migration し、Origin 画面だけ削除 | task データ保全・clean な新 source | migration 実装 + 新 table 設計（CEO 承認要・production migration） |
| **B. 一時 salvage read** | Origin 削除まで `daily_orbit_state` JSONB を read-only で salvage 読み（新 source へ徐々に移行） | 段階的・データ即時保全 | `daily_orbit_state` 依存が残る（Origin 削除と衝突しないよう read-only 限定・移行期間明示） |
| **C. 廃止して新規** | `daily_orbit_state` の task は捨て、canonical source を新規（ユーザーが入れ直す） | 最も clean・Origin 完全切断 | 既存 task データ喪失（ユーザー影響・CEO 判断要） |

**推奨の方向性（CEO 判断待ち）**: データ喪失を避けるなら **A（残して移行）** か **B（一時 salvage read）**。但し両者とも production DB 作業ゆえ **RO-8 では設計のみ**。canonical shape（§3）+ projection（§4）が確定すれば、A/B の移行先 shape が定まる。**どの案で進めるか + 新 task source の永続をどこに置くか（origin_profiles 流用 / 新 table / 別 store）は CEO 決定**。

---

## 6. 実装範囲（RO-8 で着地する pure 部分）

- ✅ **`lib/plan/realityCore/canonicalTask.ts`**: `CanonicalTaskV0` 型 + `projectCanonicalTaskToRealityNode`（pure・honest-unknown・governance injected）+ `canonicalTaskViolations`（INV）。
- ✅ unit tests（projection の honest-unknown・salvage 写像・思想温存）。
- ❌ **実装しない**（停止条件/CEO 規律）: OrbitTask→CanonicalTask salvage mapper（lib/origin import を要する＝Origin 依存）/ `daily_orbit_state` reader / 新 task DB / migration / production path / Origin UI 接続。

**OrbitTask→CanonicalTask salvage mapping は docs（§2）で確定し、実装は CEO の migration 案決定後**（Origin 依存を本番 path に入れないため）。

---

## 7. 停止条件評価（CEO #6）

| 停止条件 | 評価 | 詳細 |
|---|---|---|
| OrbitTask salvage で canonical task source が設計できない | **非該当** | §3 で設計可能（OrbitTask が明確な shape を与える） |
| daily_orbit_state 依存が強すぎて Origin削除と衝突 | **部分該当（実装のみ）** | 永続は JSONB on origin_profiles で Origin 結合。但し **docs-first 設計 + pure canonical/projection は Origin 非依存で可能**。実 reader/migration は実装せず inventory（§5）に留める＝衝突回避 |
| 新 task source が既存 todo と二重正本化 | **非該当** | 他の todo 正本ゼロ（§1）。OrbitTask は salvage 元（型 import せず）・TaskRealityNode は projection 先 |
| schema 変更 / production migration が必要 | **非該当（docs では）** | migration は inventory のみ（§5）・RO-8 で実行しない |
| 写像で欠損属性を捏造しそう | **非該当** | §4 projection は欠損を全て honest-unknown（捏造しない） |

→ **hard stop 非該当**。docs-first contract + **Origin 非依存の pure canonical/projection** を着地。実 salvage reader / DB / migration は CEO 判断後（§5）。

---

## 8. openDecisions（CEO 判断）

1. **migration 案（§5）**: A 残して移行 / B 一時 salvage read / C 廃止新規 のどれか。データ喪失リスクと clean さのトレードオフ。
2. **新 task source の永続先**: origin_profiles 流用 / 新 table / 別 store。production DB ゆえ CEO 承認 + migration GO 要。
3. **OrbitTask→CanonicalTask salvage mapper の実装タイミング**: migration 案決定後（Origin 依存を本番に入れない）。
4. **anchor 紐付け（protect 発火）**: canonical task に anchorId を future input として足すか（event 紐付けで RO-4 protect が発火）。別フェーズ。
5. **思想 field（motivation/completionFeel）の活用**: 将来どの RO 階層が読むか（cognitiveLoad 推論 / proposal 動機反映 / 観測ループ）。
6. **task 入力 UX**: Origin 削除後、ユーザーが task を入れる導線をどこに置くか（新 task source の UI・別 GO）。

**本 RO-8 は docs-first contract + pure canonical/projection で着地。実 salvage reader / DB / migration / 本番 path は CEO 決定後。**
