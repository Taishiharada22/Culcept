# Live Reader Integration — 設計（**design only**・実装なし）

> 2026-06-09 / Build Unit / CEO 指示「fixture で通った RealityPipeline を実データに繋ぐため、実データをどう安全に読み `MemoryItem[]` と `WorldState` に組み立てるか設計確定。今回は **design only**」。
> **docs-only**。実 DB reader / Supabase query / route / dev preview / shadow 実行 / PlanClient / apply には進まない。
> 前提: R1–R5 + orchestration 完了（`7635edfe`）・deep audit（`1ebaf591`）。既存 reader: `supabase-prm-learning-event-reader.ts`（M1）・`supabase-prm-model-entry-reader.ts`（M3）。

---

## 0. ゴール（逆算）
`runRealityPipeline(input)` の入力 `{ memoryItems: MemoryItem[]; worldState: WorldState; permissionLevel; nowMs }` を、**実 PRM（M1/M2/M3）+ plan/context** から **owner-RLS・column-restricted・redacted・fail-open** に組み立てる経路を確定する。pipeline 本体・mapper は既存 pure を再利用（再実装しない）。

---

## 1. MemoryItem assembly

### 1.1 source → kind 写像（既存 pure mapper を再利用）
```
M1 prm_learning_events
  → [server-only reader] PrmLearningEventReadRow[]（column-restricted・acted_at 含む）
  → [pure] learningEventsToEpisodicMemory(rows)        → MemoryItem(episodic)[]

M3 prm_model_entries（user_visible ∧ 非 retracted・既存 readSecondSelfTendencies）
  → SecondSelfTendency[]
  → [pure] tendenciesToSemanticMemory                  → MemoryItem(semantic)[]
  → [pure] tendenciesToPreferenceMemory                → MemoryItem(preference)[]
  → [pure] tendenciesToProceduralMemory(adoption/deferral) → MemoryItem(procedural)[]
  → [pure] tendenciesToCorrectionRecords → correctionRecordsToMemory（direction_adjusted/context_refined のみ） → MemoryItem(correction)[]

M2 prm_review_decisions（user confirm/reject）  → **deferred**（reader 未構築）
```
**integration**: `assembleMemoryItems(client, userId): Promise<MemoryItem[]>`（server-only）= 上記を concat。

### 1.2 各 kind の供給状況と procedural 仮説化
- **episodic**: M1 の accept/dismiss/later イベント（occurredAtISO=acted_at）。
- **semantic / preference**: M3 review 済 tendency（leaning + evidence）。preference は context-bound tentative（trait 化しない）。
- **correction**: 現状 **M3 `user_correction` 由来の direction_adjusted / context_refined のみ**。`confirmed`（user M2 approve）と `rejected`（user M2 reject）は **M2 reader が無いため deferred**。
- **procedural（hypothesis のみ）**: M3 の adoption/deferral tendency から `accepted_only`/`stable` を grade（CEO 補正: accept≠成功・completed は **常に unknown**）。`confirmed` 昇格は M2 confirmed と join で得るため **M2 reader 構築まで confirmed=false 固定**。

### 1.3 suppressed / insufficient / emerging 除外（**二段**）
- **read 段**: M3 reader が `user_visible=true ∧ retracted_at IS NULL` で filter → **rejected/retracted は assembly に到達しない**。
- **synthesize 段**: `synthesizeMemory` が context 単位に集約し readiness 判定 → `deriveEmptyDayInput` が **usableContexts（ready∧非suppressed）のみ**採用・suppressed は **excludedContexts** へ。emerging/insufficient は不採用。
- ＝assembly は「全 MemoryItem を素直に作る」だけ。除外は **下流（synthesize/derive）が一元的に**行う（既に契約 test でロック済）。

### 1.4 必要な追加（reader 側・実装は後フェーズ）
- M1 reader に **`readEventRows(): PrmLearningEventReadRow[]`**（acted_at 含む column-restricted）を追加（episodic 用・既存は dry-run 集約向け）。
- M3 reader は既存 `readSecondSelfTendencies()` を再利用（追加不要）。

---

## 2. WorldState assembly

### 2.1 source → field 写像（consume・再実装しない）
```
WorldState {
  date           ← caller（route/script）が渡す
  nowMinute      ← caller が server 時刻から算出して渡す（pure 層は Date.now しない）
  context        ← buildDayContextSnapshot（contextBridge・既存）= ContextSnapshot{energy,weather,density}
  todaySchedule  ← 当日 plan items / DayGraph EventNode + authority.PlanItemGovernance → HardConstraint[]（label は粗く redact・protection=ProtectionReason）
  availableWindows ← DayGraph GapNode → AvailableWindow[]（meaning=classifyGap・既存 consume）
  mobility       ← MAP mobility belief から { typicalTravelBufferMin } の placeholder（無ければ null）
  permissionLevel← user 設定（または既定）。R5 PermissionLevel と構造互換
}
```
**integration**: `assembleWorldState(client, userId, date, nowMinute): Promise<WorldState>`（server-only）。

### 2.2 energy 正規化（**要注意**）
- InnerWeather `energyLevel` は **-1..1**、ContextSnapshot.energy は `Sourced<number>`。pipeline/empty-day は **0..1** 前提。
- **契約**: ContextSnapshot を作る **context 層が 0..1 に正規化済**であること。reader/WorldState は `worldStateEnergy` で **防御 clamp[0,1]** のみ（再正規化しない）。値域不一致を実装前に **実データで確認**（shadow フェーズの観測項目）。

### 2.3 欠損時の readiness（捏造しない）
- 各 source が fail-open（読めない field = null / 空）。`assessWorldState` が missing を flag → `partial`（窓あり一部欠損=neutral で組む）/ `insufficient`（窓なし=組めない）。
- pipeline は readiness を envelope.stopReasons に surface。**欠損を埋めて偽の現実を作らない**。

---

## 3. Security / Safety contract

| 項目 | 契約 |
|---|---|
| **owner-RLS** | 全 reader は **injected anon + auth.getUser() user_id** の RLS client。**service_role 前提にしない**。`.eq("user_id", userId)` 明示。 |
| **column-restricted select** | `PRM_*_READ_COLUMNS` 等で **context 列のみ**。raw / seedRef / source_ref / utterance / personality / trait / fixed_preference を **select しない**。handle は opaque。 |
| **return も redacted** | MemoryItem/WorldState は構造化 enum/数値/非断定文のみ。raw を持たない。pipeline envelope は要約のみ（redaction contract test 済）。 |
| **fail-open（read）** | source 読取失敗 → その field/items = null/[]（**crash しない・捏造しない**）→ readiness が partial/insufficient で surface。 |
| **fail-closed（write/apply）** | 本設計に **write/apply は含まない**（R5-4 gate）。reader は read-only（select/eq/is/order/limit のみ・insert/update/delete しない）。 |
| **certainty** | M3 CHECK + capCertainty で **high 構造的に不可能**。 |
| **deferred の明示** | M2 confirm/reject は reader 無 → correction confirmed/rejected と procedural confirmed は **取得しない**（false/欠落のまま・偽生成しない）。 |

---

## 4. Reader architecture

```
[server-only adapters]（import "server-only"・Supabase select のみ・owner-RLS）
  supabase-prm-learning-event-reader.readEventRows()   ← M1（追加 method）
  supabase-prm-model-entry-reader.readSecondSelfTendencies()  ← M3（既存）
  supabase-context-reader（contextBridge consume）      ← ContextSnapshot
  supabase-schedule-reader → HardConstraint[]            ← plan items + governance
  daygraph-windows-adapter → AvailableWindow[]           ← DayGraph GapNode（pure・gap を渡せば変換）
        │
        ▼
[server-only integration readers]
  assembleMemoryItems(client, userId): MemoryItem[]      ← M1 episodic + M3 semantic/preference/procedural/correction
  assembleWorldState(client, userId, date, nowMinute): WorldState
        │
        ▼
[pure] runRealityPipeline(input)                          ← 既存（再実装しない）
```
- **server-only boundary**: fetch する層のみ `import "server-only"`。pure mapper（learningEventsToEpisodicMemory 等）は **server-only でない**（既に pure・再利用）。
- **adapter per source**: 1 source = 1 adapter。**integration reader** が合成。
- **fixture/fake reader**（pure・no-DB）: `assembleMemoryItemsFromFixture` / `fakeWorldState` を用意し、unit/contract test と shadow の dry 検証に使う（既存 fake repo 群と同型）。
- **test strategy**: ①pure mapper = unit（済）②server-only reader = **injected fake client（構造 mock）** で unit（既存 supabase-prm-*-reader test と同型・実 DB なし）③integration reader = fake client で組立検証 ④pipeline 通し = fixture（済）。
- **staging shadow strategy**: 後フェーズで **guarded one-off tsx**（`reality-real-read-smoke.ts` 同型・GO flag・staging-ref allowlist・本番 denylist・service_role 検出 fatal・**read-only**）で `assembleMemoryItems`+`assembleWorldState`+`runRealityPipeline` を staging 実データに 1 回流し **redacted envelope を観測**（write 0）。

---

## 5. Stop gates（本設計の外・CEO 承認必須）
- 実 DB reader 実装（server-only Supabase reader の実装）
- staging shadow 実行
- dev preview route
- PlanClient 接続
- ChangeSet apply
- notification / native / production
- REALITY_ALTER_BRIDGE_LIVE enable
- user-facing 公開

## 6. 次フェーズ順序（推奨）
1. **reader implementation**（server-only adapters + integration reader + fixture fake + unit/contract test・**DB-reader gate**）
2. **staging shadow pipeline**（guarded tsx・read-only・envelope 観測・energy 値域確認）
3. **operator-only dev preview**（triple-guard route で envelope 観測・route gate）
4. **Alter bridge shadow validation**（A1-7-36 enable 手前・独立）
5. **apply 判断**（R5-4・shadow が実データ健全性を確認後・最終 gate）

---

## 7. 確定事項サマリ
- assembly は **既存 pure mapper を再利用**し、追加は M1 `readEventRows` + WorldState 用 adapter のみ。
- 除外（suppressed/emerging/insufficient）は **下流 synthesize/derive が一元処理**（assembly は素直に作る）。
- **M2 confirm/reject は deferred**（correction confirmed/rejected・procedural confirmed は取得しない・偽生成しない）。
- 全 reader **owner-RLS / column-restricted / read-only / fail-open / redacted / service_role 非前提**。
- energy `-1..1 vs 0..1` は **shadow で実値確認**（context 層が正規化する契約）。
