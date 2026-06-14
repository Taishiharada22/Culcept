# T11-C4 — Interaction Execution / Veto Phase 計画（相互作用の実行・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only・CEO プロセス: 設計→監査→承認後 additive 実装）。
**位置づけ**: T11-C3（construct rollup 配線済・[`fit-core.ts`](../lib/shared/travel/fit-core.ts) で 9 construct→4 component）の次。registry の [`INTERACTION_REGISTRY`](../lib/shared/travel/fit-constructs.ts) を **既存 component / construct / hardBlock の修飾子**として実行する設計。C3 で意図的に延期した **perceivedSafety を veto_escalation として正しく扱う**。
**CEO/GPT 指示の核**: 「独立軸の総和では表せない fit（安全/夜/一人/雨/屋外/荷物×階段×混雑/終電/取消不能）を相互作用で。perceivedSafety は soft score に混ぜず veto_escalation で。新並列スコアを作らず・privacy/authority 境界を崩さず。」
**スコープ**: 計画のみ。コード変更なし。実 API/booking/price 断定/永続化/UI/solver/M2 runtime/Plan Intelligence/push なし。**C4 計画レポートで停止し T11-C4-B/C/D 実装には着手しない**。

---

## §1 前提を疑う — 次 microphase は interaction 実行で正しいか

| 候補 | 内容 | 評価 |
|---|---|---|
| **A interaction 実行** | INTERACTION_REGISTRY を component/hardBlock 修飾子として実行。perceivedSafety を veto_escalation で配線 | **★ 採用** |
| B ConnectionState 深掘り | A3.1 §6 の ~25 項目 connection 型拡充 | 直交・interaction を阻害しない（H_route construct は既登録）。非 critical |
| C さらに construct rollup | 残 ~690 指標を soft 配線 | **高価値 fit（安全 veto・荷物×階段×混雑の非線形）は soft でなく interaction でしか表せない**。soft 追加では届かない |

**推奨 = A**。理由: (1) C3 で construct が fit に効き始めた今、interaction は**その construct/component を修飾**できる（A→B→C の逆算順）。(2) perceivedSafety は C3 で「soft 先行は誤モデル化」として延期済 → **本 phase が正しい受け皿**。(3) 完璧 fit に必須の**非線形（superadditive）・条件発火（gating）・veto 昇格**は独立軸の和で表現不能 = interaction の本質。

---

## §2 first interaction set（GPT 案を安全側に 3 件へ絞る・理由付き）

**原則**: 第一 slice は**実行機構（combiner 適用・confidence 連鎖・missing・veto 昇格・privacy）を、combiner 種別を代表被覆する最小集合**で確立する。

| id | combiner | modifies | 採否 | 理由 |
|---|---|---|---|---|
| **IX_night_safety** | veto_escalation | hardBlock / riskFlag | **採用** | 本 phase の存在理由（perceivedSafety を veto で正しく）。安全最優先 |
| **IX_baggage_stairs_crowd** | superadditive | burdenFit | **採用** | 「独立軸の和で表せない」非線形の代表。荷物×階段×混雑 |
| **IX_rain_outdoor_fallback** | gating | burdenFit / hardBlock | **採用** | 条件発火（fallback 有無で veto 化）の代表 |
| IX_hoteldrop_order_luggage | gating(cross_object) | burdenFit | **延期** | **cross-object ordering**（hotel→destination の順序）。現 evaluateFit は**単一 entity 評価**で多 object 順序を持たない → solver/itinerary 文脈が要・ConnectionState(C) と合流 |
| IX_earlymorning_terminal_sleepdebt | superadditive | burdenFit | **延期** | 2 つ目の superadditive 例で機構重複・fast-follow（C4 第二 slice） |
| IX_cancel_weather | threshold | cancellationFlexibility/readiness | **延期** | 出力が「確認/blocker」= **T6 readiness 層**（fit component でない）。fit-core でなく T6 へ riskFlag 経由で接続する別設計 |

→ **3 件**（veto_escalation + superadditive + gating）。sign_flip は C3 で quietness valence として実行済（重複不要）。GPT「smaller set が safer なら調整・理由明記」に従う。

---

## §3 実行アーキテクチャ（fit-core のどこで・presence-gated・二層）

```
evaluateFit/evalParticipant/buildComponents:
  1. legacy components（+ C3 construct blend）を計算       ← 既存
  2. ★ interaction pass（新規・presence-gated）:
       for each wired interaction:
         inputs を収集（construct 指標 rollup / FitContext / subject）
         combiner を適用 → 修飾を産出（component 値修飾 / hardBlock / riskFlag・二層 full/shared）
  3. interaction 由来 hardBlock を hardBlocks に合流（visibility 付）
  4. deriveFitLabel（gate-first）を修飾後 component + 拡張 hardBlocks で実行  ← 既存
```
- **presence-gated**: interaction の入力（perceivedSafety 指標・weatherSeverity 等）が無ければ発火ゼロ → **C3 挙動と完全同一**（34+29+16 テスト不変）。
- **入力源**: `constructInput.entityIndicators`（perceivedSafety/baggageLoad/stairsSlopeLoad/outdoorExposure/fallbackRouteAvailability）× `FitContext`（timeOfDayBand/weatherSeverity/expectedCrowdLevel）× `subject`（relationship/solo）。
- ★ **perceivedSafety は WIRED_CONSTRUCTS に入れない**（soft 化しない）。指標は供給するが**消費は IX_night_safety のみ**（veto 経路）。

---

## §4 実行セマンティクス（combiner 別・confidence 連鎖・missing）

### §4.1 superadditive（IX_baggage_stairs_crowd → burdenFit）
```
b, st, cr ∈ [0,1]（荷物/階段/混雑 の負荷）
excess = K_SUPER × b × st × cr      // 積=全部高い時のみ大（線形の超過分）
burdenFit.valueFull -= excess（clamp）
confidence = min(b.conf, st.conf, cr.conf)
```
★ **線形分は C3 burdenFit（walkingLoad/stairsSlopeLoad/baggageLoad）で既計上 → interaction は積の EXCESS のみ加算（再計上しない）**（§7 二重計上防止の核）。`K_SUPER` は export（非 opaque）。

### §4.2 gating（IX_rain_outdoor_fallback → burdenFit / hardBlock）
```
w = weatherSeverity, o = outdoorExposure, f = fallbackRouteAvailability ∈ [0,1]
if w高 ∧ o高:
   f有 → burdenFit に mild penalty（fallback が緩和＝gate 開）
   f無 → strong penalty、かつ w が severe 閾値超 → FitHardBlock{reason:"season_or_weather_unavailable"}（既存 enum）
else → no modifier
confidence = min(w?,o,f の conf)
```

### §4.3 veto_escalation（IX_night_safety → hardBlock / riskFlag）★本 phase の核
```
timeOfDayBand ∈ {evening,night} のときのみ発火（day は無効＝昼夜分離）
s = perceivedSafety.nighttimeSafety（★daytimeSafety と平均しない）、c = s.confidence
floor は relationship で変調（solo / solo-female 文脈で慎重側に）
ladder:
  s 観測 ∧ s < SAFETY_VETO_FLOOR(例0.3) ∧ c≥MIN_CONF → FitHardBlock{reason:"safety_escalation"(★追加enum), visibility}   （明白な危険）
  s 観測 ∧ s < SAFETY_CAUTION_FLOOR(例0.5)            → RiskFlag{code:"night_safety_caution"} + burdenFit mild      （注意）
  s 未観測（fail-closed）∧ solo ∧ night               → RiskFlag{code:"night_safety_unknown"}（安全と断定させない・但し欠落だけで hardBlock しない）
  それ以外                                            → no modifier
```
- ★ **missing safety の fail-closed = 「安全と断定させない」=riskFlag**。欠落だけで一律 hardBlock すると夜の solo で全候補ブロック＝UX 破綻。明白な低安全（観測あり）のみ hardBlock。
- 新 `FitHardBlock.reason="safety_escalation"` を additive に追加（既存 enum 拡張・他 reason 不変）。

### §4.4 confidence 連鎖 / missing-data（全 interaction 共通）
- confidence = `min_of_inputs`（registry 指定・弱リンク）。低 confidence の veto は hardBlock でなく riskFlag に降格（誤 veto 防止）。
- ordinary 入力欠落 → interaction **非発火**（no_fire）または confidence 減。
- safety-critical 入力欠落 → §4.3 の fail-closed（安全と断定させない）。
- price/availability → 捏造しない（cancel_weather は本 slice 非配線）。
- non-opaque: K_SUPER / floor / penalty 係数を export。

---

## §5 hard / veto handling

- **perceivedSafety は soft score に混ぜない**（WIRED_CONSTRUCTS 非掲載）。経路は IX_night_safety の veto_escalation のみ（§4.3 ladder）。
- **night/solo/low-safety** → 明白低安全=hardBlock / 注意=riskFlag+mild penalty / 欠落=riskFlag（policy ladder）。**day は発火しない**（昼夜分離）。
- **accessibility chain break**（IX_step_continuity・将来）は **関連 hard constraint（user 車椅子等）が在るときのみ** hardBlock。本 slice 非配線。
- **allergy/diet は従来どおり hard constraint（L5）**・interaction score にしない。
- **budget/price 欠落は捏造しない**（cancel_weather 非配線・budgetFit 不触）。

---

## §6 privacy（C3 hardening を interaction に拡張）

- private な interaction 入力（例 user の solo-female 文脈・private な安全懸念）は **authoritative full に効くが shared に出さない**。
- interaction 修飾は **二層（full/shared）**: private 由来の component 修飾は valueFull のみ・valueShared 不変。private 由来 hardBlock/riskFlag は visibility=private。
- **shared 射影は shared-safe interaction 出力から再導出**: `toSharedFitView` が private hardBlock/riskFlag/mismatchReason を削除（既存機構）+ C3 の `availableShared`/shared-safe confidence/signalBasis を踏襲。
- **private 連続値が shared の confidence/availability/signalBasis/rationale/reason に出ない**（C3 で実証した 3 leak 修正を interaction 修飾後も維持）。
- EngineOnly/private canary 非漏洩（既存 assertNoEngineOnlyLeak + テキスト構造分離）。

---

## §7 二重計上防止

| 規則 | 実装 |
|---|---|
| **interaction は既存を修飾・新スコアを作らない** | modifies = component/construct/hardBlock（型で限定済・C2/C3） |
| **baggage×stairs×crowd は burdenFit を 1 回だけ** | ★線形分は C3 burden construct で計上済 → interaction は**積の EXCESS のみ**（§4.1）。個別負荷を再減算しない |
| crowd value ⊥ crowd burden | crowdNoiseVolatility は burden 側のみ・賑わい価値は trait 側（C3 既分離） |
| safety hardBlock を soft penalty で二重に効かせない | veto_escalation が hardBlock を出したら同 interaction の mild penalty は出さない（ladder 排他） |
| cancellation rigidity ⊥ irreversible commitment | cancel_weather 非配線（将来 T6 で別計上） |

---

## §8 実装スライス（承認後・additive・小バンドル規律）

| Scope | 内容 |
|---|---|
| **T11-C4-A** | 本計画（docs-only・本書） |
| **T11-C4-B** | 純 interaction 実行 helper（`fit-constructs-core.ts` に `executeInteraction(term, inputs)→Modifier`・combiner 実装 3 種・confidence 連鎖・fail-closed・**fit-core 非 import**）+ `FitHardBlock.reason` に `safety_escalation` 追加（additive enum）+ 係数 export |
| **T11-C4-C** | fit-core 統合: interaction pass（buildComponents 後・deriveFitLabel 前）・presence-gated・二層修飾・hardBlock/riskFlag 合流・perceivedSafety を **soft 化せず** interaction 入力に |
| **T11-C4-D** | golden tests（§9） |
| **T11-C4-E** | closeout（decision-log + memory） |

**stop**: 15 interaction 全実行はしない。第一 slice は 3 件（night_safety/baggage_stairs_crowd/rain_outdoor_fallback）。hoteldrop/earlymorning/cancel_weather は次 slice。

---

## §9 golden tests（C4-D）

1. **perceivedSafety 昼夜分離**: 同一 entity で day は IX_night_safety 不発火・night で発火（daytimeSafety と平均しない）。
2. **night 安全 veto/escalate**: night×solo×低 nighttimeSafety(観測) → blocked（safety_escalation hardBlock）。day では blocked にならない。
3. **private 安全 → full に効くが shared に出ない**: private 安全懸念で full が blocked/riskFlag・shared 射影に safety reason 非出現（canary）。
4. **rain/outdoor/fallback gating**: weather高×outdoor高×fallback無 → 強 penalty/blocked・fallback有 → mild（gate）。
5. **baggage×stairs×crowd superadditive**: 3 入力高 → burdenFit が線形和より低い（excess）・1 つでも低 → excess≈0（積）。**個別負荷を二重計上しない**（C3 burden と合算で過大にならない）。
6. **hotelDrop 延期の確認**: ordering 由来 baggage 除去は本 slice では interaction でなく C3 ordering/将来 solver（registry に id のみ）= 非実行を確認。
7. **earlymorning+terminal+fatigue**: 延期（次 slice）= 非実行を確認。
8. **cancel_weather**: 確認/blocker は T6 へ・fit-core で booking ロジックを持たない（非実行を確認）。
9. **interaction confidence = 最弱入力**（min_of_inputs）。
10. **ordinary 欠落 → interaction 非発火**（hallucinate しない）。
11. **safety-critical 欠落 → fail-closed**（安全と断定させず riskFlag・但し欠落のみで hardBlock しない）。
12. **新 component を作らない**（components は 6 標準キーのみ）。
13. **hasFitActionAuthority literal false 不変**。
14. **既存 34 fit + 29 registry + 16 rollup 無改変 green**・no fetch/API/DB/Supabase/route/UI imports・tsc 55 不変。

---

## §10 出力 + CEO 判断請求

- **推奨実装バンドル（承認後）**: T11-C4-B + C4-C + C4-D を 1 commit（pure/additive/presence-gated/非 opaque/private 非漏洩/no authority）。検証: 新規 tests PASS・**既存 34+29+16 無改変 green**・tsc 55 不変・full suite teed・purity/import/no-runtime-importer grep。
- guardrail: 実 API/booking/price 断定/永続化/UI/solver/M2 runtime なし。interaction 入力非供給時=C3 挙動。

### CEO 判断請求
1. 次 microphase = **interaction 実行(A)** で良いか（vs ConnectionState B / more rollup C）。
2. **first interaction 3 件**（night_safety / baggage_stairs_crowd / rain_outdoor_fallback）で良いか。**hoteldrop(cross-object/solver)・earlymorning(fast-follow)・cancel_weather(T6 readiness 行き)の延期**に同意か。
3. **veto_escalation ladder**（明白低安全=hardBlock / 注意=riskFlag / 欠落=riskFlag・欠落のみで hardBlock しない）で良いか。
4. **superadditive=積の EXCESS のみ**（線形は C3 で計上済・二重計上しない）方式で良いか。
5. `FitHardBlock.reason` に **`safety_escalation` を additive 追加**してよいか。
6. 承認後 **T11-C4-B/C/D bundle 実装** の GO。

実装は CEO 承認まで着手しない（T11-C4 計画レポートで停止）。
