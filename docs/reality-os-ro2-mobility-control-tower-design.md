# RO-2 — Mobility 管制塔骨 設計（docs-only・実装は RO-2 GO 後）

- **status**: 設計 v0.2（docs-only・**14-agent リサーチ + 敵対的検証 + CEO 裁定反映済み**）。**code 変更ゼロ・write 0・migration 0・DB/production 不接触**
- **CEO GO**: RO-2 設計着手（2026-06-20・RO-1 完了に続けて）
- **v0.2 CEO 裁定反映（2026-06-20）**: ①**矛盾修正**=movement steps（dormant 時未生成）と clarification step（ask・dormant の例外として生成）を分離 ②契約改訂 2 件**追認**（buffer-bucket 二段 / triggerCondition 構造化）③`buffer_floor=5 分`確定（0 は hard が危険側）④`LadderInterventionDecision` additive 別名分離 確定 ⑤昇格閾値 placeholder 維持 確定 ⑥ETA/RC4 接続・ALTER 表示・guarantee lint は RO-2 範囲外（但し `guarantee_language_forbidden` reasonCode は出す）
- **lineage**: RO-0（scope reset）→ RJ0 §4/§5/§6（PrepTime / leaveBy 二段 / Ladder）→ RJ0.1 §4/§5/§7（silent 復権 / InterventionStep / 順序不変条件）→ 本書
- **方法**: premise を実コードで検証（Ground 6並列）→ 3 設計 spine 提案 → 統合 → 敵対的検証 4 次元（honesty / reminder-app / boundary / RO-1非破壊）。検証 15 mustFix（全 CONCERN・FAIL 0）を §6 で反映。
- **設計の粒度**: 大枠（RO-2）の中で D1〜D6 に小さく割る。**実装は RO-2 単位**（micro-phase に割らない）。

---

## 0. GOAL（北極星）

> 単一 leaveBy を磨くことではない。**recommended / hard / wakeAt / prepareAt / Intervention Ladder を一体で pure 生成**し、「いつ動き出すべきか」「いつ準備すべきか」「いつ最終判断か」を出す管制塔の骨を確定する。配信・push・位置・予約支払い・DB write は一切しない。

到達定義（RO-2 完了 = 全達成）: 二段出発線 + 起動/準備派生 + 段階介入計画 + 構造化トリガ + RO-1 接続口を、**ETA 不在では honest-null/dormant、供給時は型を変えず live 化する骨**として確定。

---

## 1. premise 検証結果（Ground・実コード接地）

| premise | 検証結果 | 証拠 |
|---|---|---|
| leaveBy は現在単一値 | **confirmed** | `leaveByComputation.ts:93` 単一 `leaveByInstant`・grep で recommended/hard 0 hit |
| 「LSAT は percentile 分布を出すので 2 点読みでよい」 | **refuted（核心）** | `lsat.ts:177-184` `LsatResult` は**点推定**（`departByMin` 1 値）。`resolvePercentile:93-105` は単一スカラに collapse。**内部 percentile 曲線は存在しない** |
| ETA distribution が実在する | **refuted** | `movementReality.ts:131` `etaKnown` v0 hard-false 固定。`TravelTimeStats`(mean±sd) の**production 供給者ゼロ**（`computeLsat` の caller も全repo 0） |
| 既に live な departure HH:MM が別エンジンにある | **confirmed（重大）** | `departureLineTimestampHHMM`（RD3g-P2・本セッション）は `leaveByComputed.leaveByInstant`＝**leaveByAdapter の buffer-bucket 単一減算**（small5/medium15/large30・`leaveBySupply.ts:176`）由来。**LSAT とは別エンジン** |
| 位置・prep_state は未解禁 | **confirmed** | MomentState に位置 field なし・prep 観測なし |
| `leaveByKnown` は hard-false | **partial（訂正）** | RD2f/RD3d で `leaveByKnown⟹etaKnown` の ladder に緩和済み（`movementReality.ts:211-221`）。false 固定は `etaKnown` のみ |

**核心の含意**: 二段化を「存在しない LSAT 分布の 2 点読み」で作るのは**捏造**。かつ LSAT band を新設すると既存 buffer-bucket エンジン（`departureLineTimestampHHMM`）と**二重正本**になる。→ §2 で mechanism を訂正。

---

## 2. mechanismDecision（二段化の導出・dual-source 解消）

**二段化は既存 buffer-bucket エンジンで導く（LSAT 分布版は deferred）。** 理由:
- LSAT は点推定で分布を持たない（§1 refuted）。`TravelTimeStats`(sd) の供給者が 0 ＝ LSAT-band を live するには**新規 distribution supplier の構築が別途必須**。
- 一方、buffer-bucket エンジン（`leaveByAdapter` の `instantMinusMinutes(arrival, dur+bufMin)`）は**実 duration_confirmation 経由で到達可能**（RD3g-P2 で実証済み）。

**二段の作り方（同一 `arrivalTargetInstant` 共有・`LeaveByTimeContractV0:57-64` 無改造）**:
```
recommended = arrival − (durMin + buffer_large)   … 安全側（早い）≈ 既存 departureLineTimestampHHMM 線
hard        = arrival − (durMin + buffer_floor)    … 最終ライン（遅い）= floor buffer の新線
                                                     buffer_floor = 5 分（CEO v0.2 確定・0 は hard が危険側に寄りすぎ）
bandGapMin  = hard.departByMin − recommended.departByMin  … 使っている余白（分）
              catastrophic / missing / unresolved → bandGapMin = null または 0（band 縮退）
順序保証     buffer_large ≥ buffer_floor ⇒ recommended.time ≤ hard.time（RJ0.1 §7 不変条件・rj01.md:99 を単調性で数理保証）
```
**二重正本の解消（敵対的検証 N3/H1）**: 既存 `departureLineTimestampHHMM` ＝ **LeaveByLines.recommended 段**（同一 buffer-bucket エンジンゆえ矛盾しない）。hard / wakeAt / prepareAt / ladder が RO-2 の新規追加。`leaveByComputed`(LeaveByComputationV0) を LeaveByLines の**入力**にする（第三のエンジンを作らない）。

**LSAT 分布版は openDecision**: distribution-aware band（fat tail・critical-fractile）は `TravelTimeStats` 供給者が出来てから。rj0.md:79 の「LSAT percentile 2 点読み」は**契約改訂事項**として CEO 裁定（§10）。

---

## 3. 設計スライス D1〜D6

### D1 — LeaveByLinesV0（二段出発線・**sibling field・leaveBy 不変**）

**敵対的検証 N1 反映（最重大訂正）**: `eventRealityNode.ts:107-109` の `leaveBy: RealityAttribute<string>` を **in-place 置換しない**（置換すると `compileEventRealityNodes.ts:247`・`feasibilityJudgment.ts:327/339`・`momentSnapshot.ts:211`・EVENT_REALITY_ATTRIBUTE_KEYS walker の 5+ consumer が壊れる）。代わりに **新 sibling field** を additive 追加:

```ts
// EventRealityNodeV0 に additive 追加（leaveBy は不変・互換維持）
readonly leaveByLines: LeaveByLinesV0;

LeaveByLinesV0 = {
  recommended: RealityAttribute<string>,  // 安全側・buffer_large 線
  hard: RealityAttribute<string>,         // 最終ライン・buffer_floor 線（保証でない）
  wakeAt: RealityAttribute<string>,       // recommended − prepTime（D3）
  prepareAt: RealityAttribute<string>,    // recommended − prep 残量（D3）
  bandGapMin: number | null,              // hard−recommended の機械差分（debugOnly 参考）
  whyUnresolved: ReadonlyArray<LeaveByUnresolvedReason>,  // 既存 3 値再利用（eventRealityNode.ts:39）
}
```

不変条件:
1. ETA 入力未供給の間、全段 `status:"unknown"`・`value:null`・`bandGapMin:null`・`whyUnresolved` 先頭 = `eta_source_missing`（落とさない・rj0.md:83）
2. 両段 value≠null のとき `recommended ≤ hard` を**専用 validator `leaveByLinesViolations`** で機械検証（違反→両段 null + 診断）。**EVENT_REALITY_ATTRIBUTE_KEYS の per-attribute walk には leaveByLines を含めない**（4 内段を個別に walk・敵対的検証 B2 反映）。`leaveBy`（単一）は従来通り walk され surface 投影互換を維持
3. `hard` は「間に合う保証」でない: `displayPolicy:"notActionable"` + `reasonCodes:["guarantee_language_forbidden"]`（下流コピー lint は openDecision）
4. `compileEventRealityNodes` の leaveBy null ガードに**並んで** leaveByLines 4 段 null ガードを additive 追加（既存 `node.leaveBy.value` 読み〔:247-248〕は**変更しない**＝sibling ゆえ無傷）

deferred: `buffer_floor` の具体値（floor=0 か 5 か）と LSAT 分布版の critical-fractile は CEO gate（§10）。

### D2 — PrepTimeModelV0（heuristic・confidence ≤0.35・debugOnly）

```ts
PrepTimeModelV0 = RealityAttribute<number>  // heuristicAttribute で生成（新 factory 不要）
computePrepTimeV0(verb, timeBand, sleepQuality, weather, personalAdjust=0) → RealityAttribute<number>
// RJ0 §4 逐語(rj0.md:60-65): base(朝外出30-45/在宅10-15) + sleep短(+10) + 雨(+5) + 対人/formal(+5) + B1(v0=0)
```
不変条件: `heuristicAttribute`(`realityAttribute.ts:82-96`) が confidence を 0.35 に clamp・`status:"heuristic"`・`displayPolicy∈{debugOnly,notActionable}` を**型レベル強制**。**prepTime は wakeAt/prepareAt 派生入力にのみ供給**し、recommended/hard 生成関数の引数型から**構造的に排除**（hard line に heuristic を流さない・rj0.md:69,88）。昇格 ladder 閾値は placeholder（§10）。

### D3 — wakeAt / prepareAt（AND ゲート・偽生成しない）

```ts
wakeAt    = recommended.value≠null ∧ prepTime.value≠null のときのみ instantMinusMinutes 相当で派生・他は unknownAttribute
prepareAt = recommended.value≠null ∧ prep残量確定 のときのみ派生
```
不変条件: **recommended が null（=現状 ETA 未供給）なら prepTime が heuristic で来ても wakeAt/prepareAt は機械的に null**（prep 単独からの出発線生成を型組成順で禁止・rj0.md:88）。confidence は `min(recommended, prepTime)` を継ぎ heuristic（≤0.35）。

### D4 — Intervention Ladder（pure 生成・配信なし・**ladderDeliveryCeiling**・**movement / clarification 二系統**）

**CEO v0.2 矛盾修正（最重要）**: ladder の step を **2 系統**に分ける。dormant 規律は **movement 系のみ**に適用し、**clarification（ask）は dormant の例外**として生成可能にする。理由: 偽 deadline を作らない代わりに「分からないことを聞ける」必要があり、ask を dormant で殺すと「分からないから聞く」が死ぬ。

```ts
planInterventionLadder(ern, leaveByLines, prepTime, momentState) → InterventionStepV0[]   // pure・配信しない
// 返り値は 2 系統が混在し得る:
//   movement steps:      "wake" | "prepare" | "final_decision" | "fallback"  … 出発線が要る（recommended≠null 必須）
//   clarification steps: "ask"                                                … 出発線が組めない時の確認導線（recommended=null で生成）
InterventionStepV0 = {                       // 正本 = RJ0.1 §5(rj01.md:71-80)
  at: string | null,                         // clarification は時刻非依存ゆえ null 可
  stepClass: "movement" | "clarification",   // ★CEO v0.2: dormant 規律の適用区分
  interventionKind: "wake"|"prepare"|"final_decision"|"fallback"|"ask"|"three_options",
  messageType: …,                            // kind 従属・必ず行動導線（no-action step 禁止 INV-1）
  ladderDeliveryCeiling: DeliveryMode,        // ★敵対的検証 B1: 名前衝突回避（rename）。5 値（receptivity-gate.ts:25）
  permissionRequired: boolean,                // ActionKind+PermissionLevel+AUTONOMY_FLOOR 由来
  triggerCondition: TriggerConditionV0,       // D5
  reasonCodes: string[],
  targetNodeId: string,
}
```
不変条件:
1. **`ladderDeliveryCeiling` は `receptivity-gate.ts:25` の 5 値 DeliveryMode**（silent/on_open/push/urgent_push/permission_prompt）。**`interventionDecision.ts:48` の 3 値 `DeliveryModeCeiling`（none/passive_surface/active_prompt）を ladder から import 禁止**（敵対的検証 B1: 同名異義の衝突を rename で回避）
2. ceiling は配信上限であって介入意味でない・**実配信しない**（receptivity-gate を呼ばない・B2/R6 gate 未解禁）
3. **dormant 規律（CEO v0.2 訂正）**: `leaveByLines.recommended.value===null` の間、**movement 系**（wake/prepare/final_decision/fallback）は**未生成**（空配列でなく・rj0.md:105）。**clarification 系（ask）は例外として生成可能** — ask は出発線（deadline/leave-line）ではなく、偽生成を避けるための「分からないから聞く」確認導線。movement と ask は trigger 上**排他**: movement は recommended≠null を要し、ask は recommended=null（eta_source_missing / place 欠落）でこそ発火
4. plan-level「黙る判断」は step を生成せず別 enum `LadderInterventionDecision`（silent/observe）で記録（RJ0.1 §4・既存 DecisionKind を壊さず additive 別名分離・**CEO v0.2 確定**）

### D5 — Structured TriggerCondition（spine・partial-eval lattice・**window_state 追加**）

```ts
TriggerConditionV0 = {
  predicate: TriggerPredicate,
  evalStatus: "evaluable_now"|"deferred_by_gate"|"unknown",
  missingInputs: ReadonlyArray<MissingInputRef>,   // 既存再利用(momentSnapshot.ts)
  deferredByGate: ReadonlyArray<TriggerGate>,       // "location"|"prep_state"|"receptivity_b2_r6"
  humanReadable: string,
}
TriggerPredicate =                                  // 閉じた discriminated union（自由文禁止）
  | { kind:"time_at_or_after", ref:"wakeAt"|"prepareAt"|"hard"|"recommended" }
  | { kind:"window_state", window:("narrowing"|"closing"|"closed")[] }  // ★敵対的検証 R3 追加
  | { kind:"and"|"or", operands: TriggerPredicate[] }
  | { kind:"state_unmet", state: PrepStateRef }      // prep 未解禁・deferred のみ
  | { kind:"location_off_route"|"location_linger" }  // 位置未解禁・deferred のみ
```
**partial-evaluation lattice（3 値）**:
- **evaluable_now** = predicate が MomentState の evaluable-now field（`minutesUntilDeparture`/`interventionWindow`/`currentMode`/`timePressure`・**位置非依存 1 分精度・今 live**・`deriveMomentState.ts:114-181`）だけで判定可、かつ参照する出発線が value≠null
- **deferred_by_gate** = 位置/prep/push 依存 → predicate は型に存在するが評価せず `deferredByGate` に gate を積む（**捏造位置・捏造 prep で発火させない**）
- **unknown** = 参照入力欠落（wakeAt=null 等）→ `null は「発火」でなく「発火不能(cannot fire)」`・`missingInputs` に理由列挙

**敵対的検証 R3 反映（reminder-app 回避の核心）**: `window_state` predicate を**第一級 operand** にし、「出発線が近い」を MomentState.interventionWindow から**評価される状態**にする（センサー不要・今 live）。これで step は `time_at_or_after(wakeAt) ∧ window_state(narrowing|closing)` で発火でき、**ただの時刻リストから脱却**する。

**v0 評価器境界（敵対的検証 R1）**: v0 は **time_at_or_after + window_state + and/or のみ実評価**。`state_unmet`/`location_*` は**型に存在・eval は deferred**（`deferredByGate` 経由）。gate 解禁で predicate を書き換えず lattice の join で evalStatus を単調昇格。

### D6 — RO-1 Task 接続口（型変更ゼロ・join 鍵 read のみ）

不変条件:
1. **TaskRealityNodeV0/ScheduledWorkBlockV0 の値 field を増やさない**（移動・出発線正本は ern/MovementReality・task/block に spatial field なし・`canMove` は時刻枠 flag）
2. 唯一の additive = `TaskPlacementRiskFactor` union（`taskPlacementFeasibility.ts:37`）に **1 値 `needs_departure_before_window` 追加**（既存値不変・後方互換）。**この union を網羅 switch する全 consumer の exhaustiveness 波及を grep+tsc で全数確認**（敵対的検証）
3. 接続は read-only join: `ScheduledWorkBlock.sourceRefs.anchorId`（`placementKind:"anchored"`）→ ern.leaveByLines を読む純関数 `blockDepartureFeasibility(block, ern)`（block を mutate しない）。**anchored 化時のみ評価**（ern 不在の偽判定を防ぐ）
4. departure line は anchor 供給・task/block は下流参照のみ（RO-1 不変条件 1/5 を侵さない）

---

## 4. Ladder steps（段階介入計画）

| stepClass | kind | trigger（状態条件） | ladderDeliveryCeiling | 意味 |
|---|---|---|---|---|
| movement | **wake** | `time_at_or_after(wakeAt) ∧ window_state(open)` | on_open | 余白あるうち（窓 open）に「動き出す」 |
| movement | **prepare** | `time_at_or_after(prepareAt) ∧ window_state(open|narrowing)` | on_open | recommended 出発へ「準備開始」 |
| movement | **final_decision** | `time_at_or_after(hard) ∧ window_state(closing)` | push（上限のみ・実配信せず） | hard=最終ライン（保証でない・`guarantee_language_forbidden`） |
| movement | **fallback** | `time_at_or_after(hard) ∧ window_state(closed)` | on_open | hard 超過後の縮退案内（行動導線必須） |
| **clarification** | **ask** | `state_unmet(eta_source_missing) ∨ place 欠落`（= recommended=null） | on_open | 出発線が組めない時、偽 deadline でなく**本人に確認**。「分からないから聞く」を第一級判断に |

**dormant 規律（CEO v0.2）**: recommended=null の間、**movement 4 系は未生成**。**clarification（ask）は例外として生成**（dormant の声＝聞く）。recommended≠null になると movement が生成され ask は不要（trigger 排他）。

---

## 5. 革新（人間を超越しうる設計）

1. **状態条件介入（state-conditional-READY lattice・v0: time+window 評価器）**: ladder を「時刻 at だけ」でなく TriggerCondition の 3 値 lattice + `window_state` で発火。位置/prep/push 未解禁でも同一条件が gate 解禁で**書き換えなく evalStatus を昇格**（「何待ちか」を構造が肩代わり）。GPS を待たず**位置非依存で時間管制が今日成立**
2. **buffer gap 可視化（bandGapMin）**: recommended と hard の差を「現に使っている余白（分）」として機械差分で honest 露出。単一 leaveBy では原理的に見えない「どれだけ粘れるか／普段どれだけ余白を取る人か」を**捏造なしで第二の自己が観測可能化**
3. **Safety Floor を hard に焼き込む**: hard = floor buffer（学習が危険側に下げられない floor）。学習する recommended と学習しない hard を分離 ＝「慣れ（まあ大丈夫だろうバイアス）」が最終ラインを侵食しない**構造的防壁**
4. **dormant-by-honesty（型を変えず dormant→live）**: ETA 不在時の全段 null を「バグでなく正直な状態」として不変条件で機械保証。供給時に同じ型で live 化。prepTime を出発線に流入させない二重 guard（AND ゲート + 引数型排除）を**型と組成順で保証**（将来 ETA 配線時に偽生成を再導入する余地を構造で塞ぐ）
5. **silent を第一級判断として分離**: 「黙る」を no-action push 禁止と混同せず plan-level 判断として記録（RJ0.1 §4）・過剰介入を構造的に抑制

> 注（敵対的検証 H2）: LSAT 分布版を将来導入する際、recovery tier の percentile floor は `clampPercentile` の `PERCENTILE_MIN=0.5`（`lsat.ts:50`）で 0.5 が下限（0.0 ではない）。band 幅の上限はこの clamp に従う。

---

## 6. v0.1 で敵対的検証を反映した点（15 mustFix）

| 次元 | mustFix | 反映 |
|---|---|---|
| RO-1非破壊 | leaveBy in-place 置換は 5+ consumer 破壊 | **sibling field `leaveByLines`**・leaveBy 不変（D1） |
| honesty | LSAT band は既存 buffer-bucket エンジンと二重正本 | **buffer-bucket 統一**・既存 dev 線=recommended 段（§2） |
| honesty | recovery floor は 0.5（0.0 でない） | §5 注記 |
| honesty | 「caller=0」不正確（duration_confirmation 経由で到達可） | §1/§2 訂正（band は dev 到達可・LSAT-sd のみ dormant） |
| honesty | leaveByKnown は ladder 緩和済み | §1 訂正 |
| reminder-app | 「state-conditional 今日成立」を過大表示 | **「READY lattice・v0 time+window」に relabel**（D5/§5） |
| reminder-app | time-true step が full 条件成立を偽装し得る | **回帰テスト追加**（§8 受け入れ） |
| reminder-app | 「出発線が近い」が prose のまま | **`window_state` predicate 第一級化**（D5） |
| boundary | deliveryModeCeiling 名前衝突（3値 vs 5値） | **`ladderDeliveryCeiling` に rename**（D4） |
| boundary | leaveByLines は非 RealityAttribute・walker が暗黙 dark | **専用 `leaveByLinesViolations`**・KEYS walk 除外（D1） |
| boundary | node.leaveBy.value 直読み箇所の変更面 | sibling ゆえ**変更不要**（D1 で無傷） |
| boundary/RO-1 | buffer-band は rj0.md:79 の契約改訂 | **openDecision に明示**（§10） |
| RO-1非破壊 | triggerCondition string→struct は RJ0.1 §5 改訂 | **openDecision に明示**（§10） |
| RO-1非破壊 | 二重正本（leaveByComputed vs LeaveByLines）未整理 | **leaveByComputed を入力に・第三エンジン作らない**（§2） |
| RO-1非破壊 | 「ETA 配線で自動 live」は誤り（sd 供給者 0） | **buffer band は dev 到達可・LSAT-sd 版は供給者構築要**（§2/§10） |

---

## 7. 境界（停止条件）

- ETA 入力未供給の間は全段 null・**movement ladder 未生成**（dormant）・偽 deadline 禁止。**clarification（ask）は例外として生成可**（聞くことは捏造でない）
- prepTime は heuristic・hard line/強い文言/recommended 生成に**流さない**
- wakeAt/prepareAt は recommended ∧ prepTime 双解決時のみ・prep 単独生成禁止
- hard は保証でない（notActionable + guarantee_language_forbidden）
- **配信しない**: ladderDeliveryCeiling は上限表現のみ・receptivity-gate を呼ばない・push 実配信は B2/R6 gate
- 位置・prep_state 未解禁: predicate は型に存在させ deferredByGate に積み eval しない
- RO-1 型変更ゼロ（唯一 TaskPlacementRiskFactor に 1 値 additive）
- **pure 生成のみ**: production/外部送信/自動予定変更/予約支払い/external_anchors write/localStorage/Supabase/migration/DB write/Date・乱数・I/O **なし**
- **dev 表示だけで価値到達と報告しない**

---

## 8. 受け入れ基準（/goal）

- [ ] `leaveByLines` が **sibling additive**・`leaveBy` 型差分ゼロ・EVENT_REALITY_ATTRIBUTE_KEYS walk 互換（tsc + 走査 fixture PASS）
- [ ] ETA 未供給 fixture で全段 null・whyUnresolved 先頭 eta_source_missing・ladder 未生成
- [ ] buffer 二段 fixture（duration_confirmation 模擬）で `recommended ≤ hard`・catastrophic で band 幅 0 を `leaveByLinesViolations` が検証
- [ ] prepTime が heuristic/≤0.35/debugOnly・recommended/hard 生成関数の引数型に prepTime が**現れない**（コンパイル確認）
- [ ] recommended=null のとき wakeAt/prepareAt が必ず null（prepTime 非 null でも）
- [ ] InterventionStep の `ladderDeliveryCeiling` が 5 値 DeliveryMode（3 値 import なし）・各 step に行動導線 messageType
- [ ] **stepClass 分離（CEO v0.2）**: recommended=null fixture で movement 4 系は未生成・**ask（clarification）は生成**される。recommended≠null fixture で movement 生成・ask 不生成（trigger 排他）を機械検証
- [ ] **window_state predicate が MomentState.interventionWindow で evaluable_now 判定**・wakeAt=null で unknown(cannot-fire)・state_unmet/location_* は deferredByGate のみ
- [ ] **回帰テスト（reminder-app trap）**: 時刻 true ∧ prep/risk unknown の step が `deferredByGate` 非空を示し、full 条件成立を偽装しない
- [ ] RO-1 型差分ゼロ（git diff）・TaskPlacementRiskFactor 拡張の consumer exhaustiveness 不破壊（tsc PASS）・blockDepartureFeasibility read-only
- [ ] tsc footprint 0・全 fixture pure

---

## 9. 監査計画（/loop）

- **contract-audit**: LeaveByLinesV0/PrepTimeModelV0/InterventionStep/TriggerConditionV0 が RJ0 §4-6 + RJ0.1 §5/§7 逐語契約と field 一致。`ladderDeliveryCeiling`=5 値・interventionKind=6 値確認
- **coverage-audit**: 二段の defined→produced→consumed(ladder/RO-1)、ETA 未供給で dormant 停止、prepTime が hard line に非接続（negative coverage）
- **signal-trace**: `eta_source_missing` を whyUnresolved→reasonCodes→missingInputs まで honest-null 伝播。`bandGapMin` が debugOnly 止まり
- **orphan-audit**: deferred predicate（location/state_unmet）が「孤立コードでなく gate 解禁待ち」と識別
- **RO-1 回帰**: 型差分ゼロ・union 拡張の exhaustiveness 全数（grep+tsc）

---

## 10. openDecisions

### CEO 裁定済み（v0.2・2026-06-20）
1. **【契約改訂・追認】** 二段化を **buffer-bucket** で導く（rj0.md:79「LSAT percentile 2 点読み」を改訂）。LSAT 分布版は `TravelTimeStats`(sd) 供給者構築後の deferred 上位互換
2. **【契約改訂・追認】** `triggerCondition` を string（RJ0.1 §5）→ **構造化 TriggerConditionV0** に改訂（string DSL 廃止）
3. **buffer_floor = 5 分**（0 は hard が危険側）。hard は保証でないが Safety Floor として最低 5 分。catastrophic/missing/unresolved は bandGapMin=null または 0
4. **LadderInterventionDecision** は additive 別名分離（既存 DecisionKind を壊さない）
5. **prepTime/wakeAt 昇格閾値**は placeholder 維持（v0 は heuristic/≤0.35/debugOnly|notActionable）
6. **stepClass 分離**（movement dormant / ask 例外生成）— §D4/§4 で確定
7. **ETA(RC4) 接続・ALTER 表示・guarantee_language lint は RO-2 範囲外**（但し `guarantee_language_forbidden` reasonCode は出す）

### 残（ETA 供給フェーズで再訪・RO-2 実装の阻害ではない）
- p_hard の distribution-aware 版（critical-fractile Cu·Co）— LSAT 分布版導入時に確定（現 v0 は buffer_floor=5 分で足りる）
- ETA(RC4) 接続タイミングの順序（価値検証）— dormant ゆえ実装は阻害されない

---

## 11. 決定

- RO-2 を D1〜D6 の**設計 v0.2** として確定（docs-only・敵対的検証 15 + CEO 裁定反映済み）。
- mechanism = **buffer-bucket 二段**（`buffer_floor=5 分`・LSAT 分布版 deferred・dual-source 解消）。
- 核心訂正 = **leaveByLines は sibling additive**（leaveBy 不変）/ **window_state で reminder-app 回避** / **ladderDeliveryCeiling rename** / **movement·clarification 分離**（ask は dormant 例外）。
- **契約改訂 2 件 CEO 追認済み**（buffer-bucket 二段・triggerCondition 構造化）。openDecisions 1-7 裁定済み。
- 実装は RO-2 単位。実装 GO は CEO 判断（残 openDecisions は ETA 供給フェーズで再訪・実装阻害なし）。
- コード 0・write 0・migration 0。
