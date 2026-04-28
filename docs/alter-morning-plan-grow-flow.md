# alter-morning 自然文 plan grow フロー (CEO 2026-04-29 時点)

**目的**: PR #41a + #41b-0 + #41b-1a + #41b-1b を統合した時点での、alter-morning における **自然言語による plan の生成・追加・修正フロー** を CEO に伝える。

---

## 1. 全体パイプライン

```
┌──────────────────────────────────────────────────────────────────────┐
│  User utterance                                                       │
│   例: "9時にスタバ" / "9時を10時に変更" / "このあと新宿でミーティング" │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L1: Comprehension Pipeline                                          │
│  - LLM が utterance を Event[] に変換                                 │
│  - 各 Event に turn_mode を付与: "create" / "modify" / "append"       │
│  - target_ref / change_scope を出力 (modify の場合)                   │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L1.5: applyDeterministicModifyIntent (PR #41a Commit 10)            │
│  - utterance pattern (「○時を△時に」 等) で modify 意図を補正検出     │
│  - LLM が turn_mode="create" を出した場合の safety net                │
│  - guard 発火条件: prior 1 件 + cur 1 件 + cur.turn_mode="create"      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L2: Pipeline (resolveGaps, solveTimeLine, groundPlaces, etc.)        │
│  - currentEvents 基準で primary_clarify を計算                        │
│  - 注: この時点では mergeEventFields 未実行 (= effectiveEvents 未確定) │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L3 (legacyAdapter): dispatchEventMerge (PR #41b-1a)                 │
│  - 各 cur event を turn_mode 別に dispatch:                           │
│    - modify  → applyModifyPatch (intentional update)                  │
│    - create  → mergeIntoPriorCreate (null-fill) or kept_as_new        │
│    - append  → kept_as_new (event_id 衝突時 rename)                   │
│  - 戻り値: effectiveEvents + dispatch[]                               │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L4 (legacyAdapter): reconcileGapStateFromEffectiveEvents (PR #41b-0)│
│  - effectiveEvents 基準で primary_clarify / pendingClarify を filter  │
│  - 「stale な質問」 (slot fixed なのに ASK が残る) を drop            │
│  - phase 再決定: events fully fixed → plan_presented                  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L5: Plan build (buildPlanAndSegmentsFromEvents)                     │
│  - PlanItem[] 生成 (fixed / todo / travel)                            │
│  - dayConditions.mainTransport を deriveDayTransport で導出           │
│  - transportSegments を再構築 (transport_v2 ON 環境)                  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│  L6: Trace emit (PII redact + env gate, PR #41a)                      │
│  - dispatchSummary / modifyResolutions / reconcile flags を含む       │
│  - response._debug.trace に乗る (CEO 実機観測用)                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
                 response (UI 描画) + session (DB 永続)
```

---

## 2. ケース別フロー

### Case A: 全く新しい状態 (Initial create) — Turn 1

**入力例**: 「明日9時にスタバでコーヒー」

```
LLM 出力 Event:
  {
    event_id: "event_1",
    turn_mode: "create",
    when:  { startTime: "09:00", ... },
    where: { place_ref: "スタバ", placeType: "chain_brand", ... },
    what:  { activity: "コーヒー", ... },
    target_ref: null,
    change_scope: null
  }

L1.5 guard: priorPersistedEvents 空 → no-op (reason="no_prior")

dispatchEventMerge:
  priorPersistedEvents=[] → cur をそのまま返す
  dispatch[0]: { action: "kept_as_new", cur_turn_mode: "create" }

reconcile:
  primary_clarify (where vague chain_brand) → preserved
  phase = "clarifying"

→ User に「スタバ、どの店舗？」 と clarify
→ Place selection で sticky session に持ち越し
→ Turn 2 で sticky な store 確定
```

**Key invariants**:
- `dispatchSummary.kept_as_new === 1`
- `dispatchSummary.merged_into_prior === 0`
- `priorEventCount === 0`

---

### Case B: 内容の修正 (modify) — Turn N

**入力例**: 「9時を10時に変更」

```
prior persisted Event (Turn N-1 確定):
  {
    event_id: "event_1",
    turn_mode: "create",
    when:  { startTime: "09:00", ... },
    where: { place_ref: "スターバックス TSUTAYA", placeType: "exact_proper_noun", ... },
    what:  { activity: "コーヒー", ... },
    transport: "電車"
  }

L1 LLM 出力 (typically):
  cur[0] = {
    event_id: "evt_new_X",
    turn_mode: "create",       ← LLM が弱く修正意図を取りこぼすケースあり
    when: { startTime: "10:00", ... },
    target_ref: null
  }

L1.5 guard (CEO PR #41a Commit 10):
  detectModifyIntent("9時を10時に変更") → isModifyIntent=true, suggestedNewStartTime="10:00"
  prior 1 件 + cur 1 件 + cur.turn_mode="create" → guard fires
  cur[0] を補正:
    turn_mode: "create" → "modify"
    target_ref: "9時の予定"
    target_ref_confidence: "medium"
    change_scope: "patch"
    when.startTime: "10:00" (suggestedNewStartTime override)

dispatchEventMerge (PR #41b-1a):
  cur[0].turn_mode === "modify" branch:
    resolveTargetRef("9時の予定", priorPersisted)
      → Strategy 1a explicit hour match → 9時 → event_1 (high confidence)
    targetIdx = 0 (event_1)
    applyModifyPatch(priorCopy[0], cur[0]):
      - event_id: "event_1" 維持
      - turn_mode: "create" 維持 (apply 後 modify は消える)
      - target_ref / change_scope: null clear
      - when.startTime: "09:00" → "10:00" ★ override
      - where: priorWhereLocked でも cur.where.place_ref null なので prior 維持
      - transport: "電車" 維持 (cur.transport null)
  dispatch[0]: { action: "modify_applied", target_event_id: "event_1", strategy: "time_bucket" }

reconcile:
  primary_clarify (もし pipeline で立っていれば) → effectiveEvents で when fixed なので drop
  phase = "plan_presented"

→ UI: 10:00 に更新された card を表示
→ pendingClarify = null
```

**Key invariants**:
- `dispatchSummary.modify_applied === 1`
- `modifyResolutions[0].applied === true`
- `persistedEvents[0].when.startTime === "10:00"`
- `persistedEvents[0].where.place_ref === "スターバックス TSUTAYA"` (不変)
- `persistedEvents[0].turn_mode === "create"` (prior 維持)
- `persistedEvents[0].target_ref === null` (clear)

#### Case B 派生: 移動手段変更

**入力**: 「移動手段を車に変更」

```
guard (or LLM 直接): turn_mode="modify", transport="車"
  ※ target_ref が不明な場合は "最初の予定" (priorPersisted.length===1 の fallback)

resolveTargetRef("最初の予定") → Strategy 4 ordinal "first" → event_1 (medium)
  または: target_ref="今日の予定" 等で ↑ では解決しないが、
  dispatch の single_event_fallback (PR #41b-1a Commit 4) で event_1 を target

applyModifyPatch:
  - transport: "電車" → "車" ★ override
  - その他不変

L5 plan build:
  deriveDayTransport(events) → events[0].transport="車" → mainTransport="car"
  transportSegments: 全 mode を car 系で再生成

→ UI: 🚗 car icon、車前提の duration で表示
```

---

### Case C: 新規で追加 (append) — Turn N

**入力例**: 「このあと新宿で高橋とミーティング」

```
prior persisted Events (Turn N-1):
  [{ event_id: "event_1", when: 09:00, where: スタバ, what: コーヒー }]

L1 LLM 出力 (typically 2 events):
  cur[0] = { event_id: "event_1", turn_mode: "create", when: 09:00, ... }   // 既存維持
  cur[1] = {
    event_id: "event_2",
    turn_mode: "append",
    when: { startTime: null, timeHint: "afternoon", ... },
    where: { place_ref: "新宿", placeType: null, ... },
    what: { activity: "ミーティング", ... },
    who: ["高橋"]
  }

L1.5 guard: cur 2 件 → no-op (reason="events_count_mismatch")

dispatchEventMerge (PR #41b-1a + PR #41b-1b):
  cur[0]: turn_mode="create"
    event_id="event_1" matches prior → mergeIntoPriorCreate
    dispatch[0]: { action: "merged_into_prior" }

  cur[1]: turn_mode="append"
    pushNewWithRename: event_id="event_2" は既存 (event_1) と衝突しないのでそのまま
    newEvents.push(cur[1])
    dispatch[1]: { action: "kept_as_new" }

  effectiveEvents = [merged_event_1, event_2] (2 件)

reconcile:
  primary_clarify: gapResolver 計算済み (cur 基準)
    - event_1: pass_through (全 fixed)
    - event_2: where_center clarify (新宿 anchor_alone vague)
  primary_clarify = event_2 where_center
  phase = "clarifying"

→ User に「新宿でのミーティング、どのあたり？」 と clarify
```

**Key invariants**:
- `dispatchSummary.merged_into_prior === 1`
- `dispatchSummary.kept_as_new === 1`
- `persistedEvents.length === 2`
- `persistedEvents[0].event_id === "event_1"` (不変)
- `persistedEvents[1].event_id === "event_2"` (追加)

#### Edge case: event_id 衝突 (PR #41b-1b 対応)

LLM が cur[1].event_id="event_1" (prior と衝突) を出した場合:

```
pushNewWithRename:
  collidesWith priorCopy → generateNonCollidingEventId([event_1]) → "event_2"
  newEvents.push({ ...cur[1], event_id: "event_2" })
```

これにより event_id 重複による data 上書きを防ぐ。

---

## 3. State machine (Phase 遷移)

```
                ┌─────────────┐
                │   initial   │
                └──────┬──────┘
                       │ Turn 1: create
                       ↓
                ┌─────────────┐    全 slot fixed     ┌─────────────────┐
                │  clarifying ├──────────────────────→│  plan_presented  │
                └──────┬──────┘                      └────────┬─────────┘
                       │                                      │
              clarify Q&A 継続                          confirm → completed
                       │
                       ↓
                ┌─────────────┐
                │  narrowing  │ (where 候補絞り込み中)
                └─────────────┘
```

**reconcile (PR #41b-0) の役割**:
- effectiveEvents 基準で stuck 状態を解消
- events fully fixed (sharpness) → plan_presented に昇格
- pendingClarify (target slot fixed) → drop

---

## 4. Trace 観測例

CEO が実機で 1 turn の trace を browser DevTools (Network tab → response payload → `morningProtocol._debug.trace`) で観測できる。

### Case B (modify): 「9時を10時に変更」

```json
{
  "sessionId": "ms_...",
  "turnIndex": 3,
  "currentEventCount": 1,
  "priorEventCount": 1,
  "mergedEventCount": 1,
  "modifyResolutions": [
    {
      "event_id": "evt_new_X",
      "target_ref_present": false,    ← apply 後 clear
      "resolved": {
        "target_event_id": "event_1",
        "confidence": "high",
        "strategy": "time_bucket"
      },
      "applied": true                  ← ★ PR #41b-1a で apply された
    }
  ],
  "dispatchSummary": {
    "modify_applied": 1,                ← ★ effective に反映された数
    "modify_unresolved_fallback_create": 0,
    "merged_into_prior": 0,
    "kept_as_new": 0
  },
  "modifyCandidate": true,             ← guard 発火
  "modifyCandidateReason": "applied",
  "reconcile": {
    "phaseChanged": true,              ← clarifying → plan_presented
    "primaryClarifyDropped": true,
    "pendingClarifyChanged": true,
    "focusCleared": false,
    "eventsFullyFixed": true
  }
}
```

### Case C (append): 「このあと新宿で...」

```json
{
  "currentEventCount": 2,
  "priorEventCount": 1,
  "mergedEventCount": 2,                ← ★ 2 件残る (旧 length-mismatch discard 廃止)
  "dispatchSummary": {
    "modify_applied": 0,
    "merged_into_prior": 1,             ← event_1 (既存) merged
    "kept_as_new": 1                    ← event_2 (新規) appended
  },
  "primaryClarifyKind": "where_center", ← event_2 の where 質問
  "primaryClarifyEventId": "event_2"
}
```

---

## 5. PR シリーズ実装範囲

| PR | 範囲 | merge 状態 |
|---|---|---|
| #40 | transport rendering 基盤 (5W1H + Journey 構造) | merged |
| #41 (#41a) | L0 trace + L1 schema turn_mode=append + L2 priorPlanForContext + L3 modifyRouter audit + Commit 6-10 deterministic modify guard | merged |
| #42 (#41b-0) | 3-layer reconcile from effectiveEvents (stuck pendingClarify 解消) | merged |
| **#43 (#41b-1a)** | **dispatchEventMerge + applyModifyPatch (Case 1, Case 2 完成)** | **CEO 検証中** |
| **#44 (#41b-1b)** | **append apply with event_id collision rename (Case 3 完成)** | **CEO 検証中** |
| #41b-1c (将来) | selective clarify 強化 (新 event 優先 priorityization) | 必要時 |

---

## 6. 残課題 / 既知の限界

1. **selective clarify (PR #41b-1c)**: prior と new で両方 missing slot がある場合、現状は CLARIFY_PRIORITY (kind 別 score) で選定。新 event を強制的に優先する logic は未実装。
   - 影響: Case 3 では prior が fully fixed なので問題なし。
   - 必要になったら priority bias を入れる。

2. **dialogState.focus の reconcile wire**: PR #41b-0 で `reconcileDialogState` 実装済だが、legacyAdapter は priorDialogState=null を渡している。route 層で reducer を回した後の state を渡すには別 PR が必要。
   - 影響: focus が stale でも reducer 経路で update される (実害は小さい)。

3. **複数 modify same turn**: 「9時を10時に変更、移動手段も車に」 のような複合 modify は、LLM が 1 つの modify event にまとめるか 2 つ出すかで挙動が変わる。dispatch は両方ハンドルできるが、user-facing test は未整備。

4. **transport_v2 flag**: transportSegments / 旅程詳細表示は flag ON 環境 (production preview など) のみ。test は flag OFF で実行されるため travel items の text 検証のみ。

---

## 7. CEO 実機 merge 条件 (3 ケース全通過)

「自然文 plan grow が完成」 の判定:

```
Case 1 「9時を10時に変更」:
  - persistedEvents[0].when.startTime === "10:00"
  - card 表示 10:00
  - dispatchSummary.modify_applied >= 1
  - modifyResolutions[0].applied === true

Case 2 「移動手段を車に変更」:
  - persistedEvents[0].transport === "車"
  - plan.dayConditions.mainTransport === "car"
  - travel items が 🚗 base
  - dispatchSummary.modify_applied >= 1

Case 3 「このあと新宿で高橋とミーティング」:
  - persistedEvents.length === 2
  - event_1 (元の予定) 不変
  - event_2 (新規) で 新宿 / ミーティング / 高橋
  - card に 2 つの予定が表示
  - dispatchSummary.kept_as_new >= 1
  - mergedEventCount === 2
```

3 ケース全通過 → CEO 判定で「PR #43 + PR #44 merge OK」 → main 取り込み → 自然文 plan grow 完成。
