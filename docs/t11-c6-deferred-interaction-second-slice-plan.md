# T11-C6 — Deferred Interaction Second Slice 計画（hotelDrop / earlyMorning・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only・CEO プロセス）。
**位置づけ**: C5/C5.1（ConnectionState 深化・routeChainBurden 集約・decomposition 完了）の次。C4 で延期した interaction を、深化した route-chain 状態の上で正しく実行する。
**スコープ**: 計画のみ。コード変更なし。実 route/place/weather API・solver・booking・readiness 実装・永続化・UI・M2 runtime・push なし。**C6 計画レポートで停止し C6-B/C/D 実装には着手しない**。

---

## §1 前提を疑う — 次は C6（延期 interaction 第二 slice）で正しいか

| 候補 | 評価 |
|---|---|
| **C6 延期 interaction 第二 slice** | **★ 採用**。C5/C5.1 で hotelDrop/earlyMorning が依存する BaggageState/luggage_drop_enables/dropAffordance/terminal/lock が深化済 → 局所 patch でなく route-chain 上の相互作用として正しく扱える |
| more ConnectionState/decomposition | `deriveRouteDecomposition` で分解済。さらなる細分は diminishing returns・interaction を阻害しない |
| more construct rollup | 直交・route 依存の延期 interaction を解錠しない |

**推奨 = C6**。C5 深化が build してきた到達点（directive ⑤）。hotelDrop は BaggageState+luggage_drop_enables+dropAffordance を、earlyMorning は terminal+checkout/last_departure lock+fatigue を消費でき、もはや walkingLoad 過剰依存しない（C5.1 意味論修正の恩恵）。

---

## §2 候補 interaction

| id | combiner | 依存（C5 深化状態） |
|---|---|---|
| **IX_hoteldrop_order_luggage** | gating(policy) | BaggageState / LuggageDropAffordance / `luggage_drop_enables` / before-after drop |
| **IX_earlymorning_terminal_sleepdebt** | superadditive | TerminalBurdenSpec / `checkout_window_lock`・`last_departure_lock` / fatigue・morningness |
| IX_cancel_weather | （fit 外） | RouteReliability.weatherVulnerability / reversibility → **T6 readiness** |
| ★C5-revealed: IX_last_departure_strand | threshold | `last_departure_lock` × 到着遅延(reliability) → stranding risk（**第二 sub-slice へ延期**） |

---

## §3 first C6 実装 set

**採用 2 件**: IX_hoteldrop_order_luggage（gating）+ IX_earlymorning_terminal_sleepdebt（superadditive）。

- **cancel_weather は fit-core に入れない**（GPT 合意・directive ④）: weatherVulnerability×reversibility×irreversible は「確認/blocker」= **T6 readiness 層**。fit-core では burdenFit に入れず、純粋・安全なら riskFlag/handoff marker のみ（§6）。
- **IX_last_departure_strand は C6 第二 sub-slice へ延期**（最小 slice = 2 件・superadditive と gating の代表）。

---

## §4 IX_hoteldrop_order_luggage セマンティクス

### policy 方式（drop 判定の単一権威・C5 reconciliation）
★ C5 の `deriveRouteObservations` は現状 `luggage_drop_enables` **単独**で auto-drop する（line 213）。GPT 要件は **ordering AND affordance** で初めて relief。→ **drop 判定を hotelDrop interaction の policy に一本化**:
```
hotelDropPolicy(routeChain) =
  ordering に luggage_drop_enables あり  AND  dropAffordance(locker∥hotel∥delivery) あり
```
C6-C で `deriveRouteObservations`/`deriveRouteDecomposition` の auto-drop を **ordering 単独→このpolicy** に置換（`baggageState.droppedState==="dropped"` の明示 drop は維持）。routeChainBurden は policy の drop 判定を反映（baggageBurden=0 化）。

### 効果と境界
- **burdenFit のみ修飾**（routeChainBurden の baggage 項を policy が消す＝下流 baggage 負荷低減）。
- **ordering+affordance が揃う時のみ** relief（affordance 無→relief 無）。
- **itinerary を solve/reorder しない**・**hotel-first route を schedule しない**・**booking/action authority を作らない**（ordering 状態を**読む**だけ）。
- 二重計上回避: drop 判定は routeChainBurden 派生で 1 回適用（別途 relief delta を足さない＝§7）。
- riskFlag/rationale（「荷物 drop で身軽」）は shared-safe。

---

## §5 IX_earlymorning_terminal_sleepdebt セマンティクス

### superadditive（早朝×terminal×疲労の積 EXCESS・C4 と同型）
```
early   = timeOfDayBand∈{early_morning} ∨ checkout_window_lock/last_departure_lock 由来の早発制約
terminal= TerminalBurden(security/check_in overhead)正規化
fatigue = FitContext.todayFatigueSpike ∨ (1−morningness)
excess  = K_EARLY × early × terminal × fatigue       // 積=全部高い時のみ大
```
- **burdenFit に excess を penalty**（★線形 terminal は routeChainBurden(C5)で既計上＝interaction は積の EXCESS のみ＝二重計上しない）。
- 高 fatigue×早朝×重 terminal で labelCap（excellent 不可）も可（過酷さの上限）= optional。
- **departure を schedule しない**・**実 train/flight availability を断定しない**（terminal/lock 状態を読むだけ）。
- 非発火: terminal burden 無 ∨ fatigue 文脈無 → no_fire（hallucinate しない）。
- confidence = min（early/terminal/fatigue の最弱）。

---

## §6 cancel_weather / irreversible commitment 境界

- **T6 readiness/confirmation 層に属す**（fit-core scoring でない）。
- fit-core では: RouteReliability.weatherVulnerability × reversibility(ordering relaxable) が高い時、**riskFlag/handoff marker のみ**（純粋・安全なら）。**burdenFit に入れない**。
- **禁止**: booking/cancellation logic・live weather/price/availability/cancellation-rules 断定・action authority。
- 第一 slice では **非実行**（riskFlag handoff の設計は T6 owning phase で）。

---

## §7 interaction 実行ルール

- interaction は**修飾子のみ**・新並列 component を作らない（components 6 キー不変）。
- **二重計上禁止**: hotelDrop は routeChainBurden 派生で drop を 1 回適用（別 relief を足さない）。earlyMorning は積の EXCESS のみ（線形 terminal は C5 済）。
- **routeChainBurden（集約）と decomposition（分解）を正しく使う**: earlyMorning の terminal は decomposition の terminalWalkingBurden 参照可・**walkingLoad に総負荷を入れない**（C5.1 厳守）。
- confidence = 最弱入力（min_of_inputs）。
- ordinary 欠落 → 非発火（hallucinate しない）。
- safety/irreversible 欠落 → fail-closed または confirmation marker（cancel_weather は T6 へ）。
- 非 opaque: K_EARLY/閾値/relief 係数を export。

---

## §8 privacy

- private mobility/fatigue/accessibility 懸念は **full に効くが shared に出さない**（C3/C4/C5 two-layer 踏襲）。例: private fatigue → earlyMorning の full-only 強化（private hardBlock/riskFlag or full-only delta）。
- shared 射影は shared-safe interaction 出力から再導出（`availableShared`/shared-safe confidence/signalBasis/labelCap・既存機構）。
- **confidence/available/signalBasis/reason/rationale/riskFlag に private 懸念の存在を漏らさない**（canary）。

---

## §9 golden tests（C6-D）

1. **hotelDrop**: `luggage_drop_enables` AND drop affordance 有 → 下流 baggage 負荷低減（burdenFit 改善）。
2. hotelDrop: **affordance 無 → relief 無**（policy 不発火）。
3. hotelDrop: **itinerary を solve/reorder しない**（ordering を読むだけ・順序確定しない）。
4. before-drop vs after-drop 負荷が distinct（C5 helper 維持）。
5. **earlyMorning**: 早朝×terminal×fatigue が superadditive/threshold（線形和でない）。
6. earlyMorning: terminal burden 無 ∨ fatigue 文脈無 → **非発火**。
7. last_departure/checkout/open_hours lock は **risk/constraint signal に効くが schedule しない**（routeLockSignals）。
8. **cancel_weather は readiness-facing**（fit-core で booking logic を持たない・burdenFit に入らない）。
9. **routeChainBurden が集約 route 負荷のまま**・**walkingLoad は歩行専用のまま**（C5.1 不変）。
10. interaction が新 component を作らない（6 キー）。
11. **private mobility/fatigue 懸念が full に効くが shared に漏れない**（canary）。
12. route/action authority を作らない・`hasFitActionAuthority` false。
13. confidence = 最弱入力。
14. ordinary 欠落 → hallucinate しない。
15. 既存 **34+29+16+17+25 route** 無改変 green・no fetch/API/DB/route/UI imports・tsc 55 不変。

---

## §10 実装スライス（承認後・additive・小バンドル）

| Scope | 内容 |
|---|---|
| **C6-A** | 本計画（docs-only） |
| **C6-B** | 純 interaction helper 追加（`fit-constructs-core.ts`: `execHotelDrop`/`execEarlyMorning` + combiner + confidence 連鎖 + 係数 export・**fit-core 非 import**）。WIRED_INTERACTIONS に 2 件追加 |
| **C6-C** | fit-core 統合: interaction pass に 2 件配線。**★ C5 reconciliation**: `deriveRouteObservations`/`deriveRouteDecomposition` の drop 判定を `luggage_drop_enables` 単独 → **hotelDropPolicy(ordering+affordance)** に置換（`baggageState.droppedState` 明示 drop は維持・C5 route tests 不変） |
| **C6-D** | golden tests（§9） |
| **C6-E** | closeout（decision-log + memory） |

**stop**: solver/itinerary/booking/readiness 実装はしない（別承認）。cancel_weather は T6 owning phase。

---

## §11 出力 + CEO 判断請求

- **推奨実装バンドル（承認後）**: C6-B+C+D を 1 commit（pure/additive/presence-gated/非 opaque/private 非漏洩/no authority）。検証: 新規 tests PASS・**既存 34+29+16+17+25 無改変 green**・tsc 55 不変・full suite teed・purity/import grep。
- guardrail: 実 route/place/weather API・solver・booking・readiness 実装なし。interaction 入力非供給=従来挙動。

### CEO 判断請求
1. 次 = **C6 延期 interaction 第二 slice** で良いか（vs more ConnectionState / more rollup）。
2. first set = **hotelDrop + earlyMorning**・**cancel_weather は T6 readiness 行き（fit-core 非実行）**・**last_departure_strand は第二 sub-slice 延期** で良いか。
3. **hotelDrop = policy 方式**（drop 判定=ordering+affordance を単一権威化・routeChainBurden 派生で 1 回反映・別 relief delta を足さない）で良いか。**C5 の auto-drop を policy に置換**する reconciliation に同意か。
4. **earlyMorning = 積の EXCESS のみ**（線形 terminal は C5 済・二重計上しない）で良いか。
5. 承認後 **C6-B/C/D bundle 実装** の GO。

実装は CEO 承認まで着手しない（T11-C6 計画レポートで停止）。
