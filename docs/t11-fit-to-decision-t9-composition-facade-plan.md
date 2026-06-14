# T11 Fit-to-Decision / T9 Composition Facade Plan（Fit→T9/packet 合成・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only）。
**位置づけ**: closeout（`docs/t11-fit-readiness-closeout-and-integration-boundary.md`）で判明した最大 gap
=「**Fit Model（T11）が T9 engine facade / PlanDecisionPacket に未合成・T9 が真の単一入口でない**」を、
authority / privacy / readiness / projection invariant を壊さず塞ぐ合成設計。
**スコープ**: 計画のみ。コード変更なし。**solver / itinerary 生成 / 場所検索 / route API / weather API / M2 runtime / UI / CoAlter / Plan Intelligence / booking は実装しない**。**本レポートで停止し実装に着手しない**。

---

## §1 前提を疑う — 次は Fit→T9 合成で正しいか

| 候補 | 評価 |
|---|---|
| **Fit-to-Decision / T9 composition** | **★ 採用**。closeout の中心 gap・単一入口化の前提・UI/CoAlter が consume を始める前に必須 |
| itinerary DAG / solver preflight | 後。solver は entity/place 解決を要し runtime gate 寄り。合成（pure）が先でないと「何を solver に渡すか」の出力契約が定まらない |
| UI / CoAlter integration preflight | 後。合成で**単一の安全な出力契約**が確定してからでないと consume 契約を書けない（時期尚早） |
| more fit rollup / rationale | 直交・diminishing returns（C3 で主要済み）。合成 gap が優先 |

**推奨 = Fit-to-Decision / T9 composition facade plan**。理由: (1) closeout で「Fit と chain が 2 入口・未合成」が確定。(2) solver も UI も「T9 の単一安全出力」を前提にするため、合成が**前提条件**。(3) pure のまま設計でき runtime gate を 1 つも開けない。

---

## §2 現在の gap（closeout 実測の再掲）

- **T9 `runTravelPlanEngine` は T3–T8 を compose するが T11 Fit を compose しない**（`engine.ts` は `fit-*` を import しない・検証済み）。
- Fit は `evaluateFit` / `toSharedFitView` / **`hasFitActionAuthority` = literal `false`** を持つ独立 pure subsystem。
- **Readiness は既に T9 内**（`engine.ts:33`）。後付け不要。
- **cancelWeather（C7）は T6 readiness に在るが `TravelPlanEngineInput` に未配線**（`assessReadiness` 呼び出しは `policy` のみ）。
- UI/CoAlter は中間層（`buildProposals`/`evaluateFit` 等）を**個別に直接呼んではいけない**。
- ★ **granularity 不一致（最重要）**: Fit は **entity（`TravelObjectState`）** を採点。T3/T4 の `TravelProposal` は **場所確定前の骨格**（entity 参照なし・`areaPlaceholder` は文字列のみ）。**T3/T4 時点に採点対象 entity は存在しない**。よって fit-core を proposal に潜らせることはできず、**fit evidence は呼び出し側が candidateId に対応づけて供給する純 input** でなければならない（fit が entity を捏造しない）。

---

## §3 合成ターゲット（単一の安全な出力）

将来の単一 pure 入口候補 = **`runTravelPlanEngine`（拡張）**。出力契約に fit を additive に載せる:

| 要素 | 配置 | 権限/可視性 |
|---|---|---|
| authoritative engine output | `PlanDecisionPacket`（authoritative=true） | 実行権限の正本 |
| shared / viewer packet | `buildSharedPacketView` / `buildViewerPacketView` | display 専用・executionAuthority 構造的 false |
| **fit summary** | packet に **optional additive field**（`fitSummary?`）。または packet 隣接の拡張 | advisory のみ・**executionAuthority に不参加** |
| readiness confirmation queue | 既存 `confirmationQueue`（C7 `weather_reversal_uncertainty` 含む） | needs_confirmation→nextAction=confirm |
| **cancelWeather evidence** | `TravelPlanEngineInput.cancelWeather?`（§6） | readiness-facing・fit 非経由 |
| diagnostics / missing-data questions | `EngineDiagnostics` + packet `questionQueue` に fit missing 由来を additive | informational |
| **no action authority from fit** | — | fit は packet のどの経路でも権限を産まない |

---

## §4 Fit が Decision にどう効くか（safe first approach）

### どの段で効かせるか
- 候補: T3 proposal 構築 / T4 comparison / T5 decision / T8 packet。
- **proposal は場所確定前 → T3 で entity 採点不可**。decision（T5）は comparison の dominance に従う純 logic。
- ∴ **fit は T4 comparison と T8 packet に、pure adapter 経由で入れる**のが唯一整合的。

### recommended safe first approach（段階導入）
- **Bundle 1（安全初手）= advisory 合成**: fit を **packet `fitSummary` + `comparison.summary`（二層 rationale）** に surface する。**dominance / paretoOptimal は変更しない**。
  - → fit input 供給時でも **ランキング順は不変**。fit は「説明・助言・risk/mismatch/質問」を足すだけ。
  - → 「fit mismatch can affect comparison/packet when supplied」を **summary + packet advisory** で満たし、かつ dominance を安定に保つ（最小リスク）。
- **Bundle 2+（将来・別 GO）= dominance 影響**: fit を **既存 count 語彙へ明示マップ**（例: fit grade poor/blocked → stretch 的シグナル）して dominance に効かせる。**opaque な並列 score を新設しない**。

### opaque scoring にしない方法
- comparison 契約は **counts / labels / ids のみ**（descriptor 非搭載＝privacy 構造防御）。fit も **EntityFitGrade（5 値ラベル）+ count（mismatch 数）** で載せ、**生 score・重みを契約に出さない**。重み/閾値は fit-core 側で既に export 済み（非 opaque）。
- fit が dominance に効く場合も「どの grade が stretch に何点寄与するか」を**透明な固定マップ**で定義（ANGLE_ROLE と同様の as-const）。

### mismatch / risk / missing question の surface
- mismatch: EntityFitGrade（excellent..blocked）+ どの component が低いか（roleFit/burdenFit 等のラベル・値は shared-safe のみ）。
- risk: fit hardBlock / labelCap（safety_escalation/strand 等）を **advisory risk flag** として packet に。
- missing question: fit の `missingDataQuestions` を packet `questionQueue` に additive（dedupe）。

### fit input 不在時の不変保証
- adapter は **fit input が無ければ no-op**。`comparison` / `decision` / `packet` は**現状と byte 同一**。
- → 「Absence of fit input preserves current engine behavior」を構造的に保証（T3–T8 既存 348 tests 不変）。

### no solver / itinerary
- adapter は entity を生成せず・place を解決せず・DAG を作らない。供給された `FitResult` を読むだけ。

---

## §5 Fit input source（純 input・捏造なし）

- fit evidence は呼び出し側が **candidateId に対応づけた `FitResult`（または entity 一式）** として供給:
  - `FitSubject`（solo/group）/ `FitUserState` / `TravelObjectState` / `routeInput`(RouteChainState) / `constructInput` / `FitContext`。
  - これらは **pure input**（M2 runtime / live route・weather・place data / UI・client 状態推論を経ない）。
- ★ **object quality を hallucinate しない**: entity が無ければ fit を捏造せず、その proposal の fit は **未供給（advisory なし）** とする。
- ★ **binding は caller の責務**（candidateId→FitResult）。adapter は source kind / provider を推論しない（slot 由来の participantId/owner と同じ非推論原則）。
- no M2 runtime / no live route・weather・place / no client inference / no hallucinated quality。

---

## §6 cancelWeather input flow（fit-core 非 producer）

1. `TravelPlanEngineInput.cancelWeather?: CancelWeatherEvidence` を **additive 追加**。
2. `engine.ts` の `assessReadiness({ decision, selected, policy, cancelWeather: input.cancelWeather })` に **thread**。
3. **fit-core は `CancelWeatherEvidence` を産出しない**。evidence は entity/route の純データから組む **専用 pure adapter**（必要時のみ・fit scoring ではない単純写像）が供給。
4. no weather API・no booking/cancellation 断定。
5. → cancelWeather は readiness-facing のまま `confirmationQueue` に乗り、`weather_reversal_uncertainty` → nextAction=confirm → **executionAuthority=false** を packet まで一貫させる（C7 既存経路）。

---

## §7 privacy / projection

- **full `FitResult` は authoritative packet に効いてよい**。
- **shared fit view は shared-safe 値から再導出**（`toSharedFitView`）。shared/viewer packet の fit summary は**必ず shared 由来から組み立て直す**（packet-core が各層 shared 射影を再組み立てするのと同型）。
- **private fit signal は confidence / availability / signalBasis / rationale / reason / riskFlag / packet field のいずれにも漏らさない**（fit deep-equal canary + packet 再組み立てで二重防御）。
- shared/viewer packet は **display 専用**（authoritative=false・executionAuthority 構造的 false）。
- projection は **executionAuthority を決して付与しない**。

---

## §8 authority rules

1. **Fit は実行権限を産まない**（`hasFitActionAuthority` literal false・fitSummary は advisory）。
2. **readiness authoritative 結果が propose/reserve/book を gate**（`hasActionAuthority`）。
3. **shared packet は権限を産まない**（executionAuthority 構造的 false）。
4. **cancelWeather 確認は booking 権限を止める**（needs_confirmation→confirm→executionAuthority false）。
5. **route/fit/weather 派生値は live availability を断定しない**（`derived_from_connection_state` provenance・欠落は question/fail-closed）。

---

## §9 double-counting rules

| 規則 | 実装方針 |
|---|---|
| fit burden ⊥ readiness confirmation | fit burdenFit=体験の重さ / readiness=commitment confirmation（別層別 consequence・C7 と同型） |
| rain_outdoor_fallback ⊥ cancelWeather | fit interaction（体験 burden）/ readiness（commitment）。adapter は両者を合算しない |
| routeChainBurden ⊥ lastDeparture strand | aggregate burden / strand risk（C6.1 分離維持） |
| walkingLoad ⊥ routeChainBurden | walking-only / door-to-door 集約（C5.1 分離維持） |
| **fit mismatch ⊥ proposal comparison** | fit grade を **stretchCount に黙って畳み込まない**。dominance に効かせる場合のみ**明示マップ**で（Bundle 2・別 GO） |
| fit score ⊥ 既存 decision score | 明示マップなき限り重複させない。Bundle 1 は dominance 不変＝重複ゼロ |

---

## §10 アーキテクチャ比較と推奨

| 案 | 内容 | 評価 |
|---|---|---|
| **A. Fit as pre-comparison signal** | fit を comparison の入力前処理として供給（adapter→comparison が読む） | **★ 推奨（最終形）**。adapter 経由・GPT lean 一致・comparison/packet に統合 |
| B. Fit as comparison modifier | comparison 出力（dominance/ranking）を fit で後段補正 | A の一部として **Bundle 2 で**（dominance 影響は別 GO）。単独先行は rank flip リスク |
| C. Fit as packet-only advisory | fit は packet にのみ・comparison 不接触 | **Bundle 1 の実体**（最安全）。ただし最終形は comparison にも届く A に寄せる |
| D. Fit as separate output next to packet | packet と別の第 2 output | **不採用**（GPT 明示: separate UI-only output にしない・単一出力原則を崩す） |

**推奨 = A（Fit as pre-comparison signal・pure adapter 経由）**。ただし**段階導入**:
- **Bundle 1 = A の安全サブセット（実質 C 相当）**: fit を **packet `fitSummary` + comparison.summary advisory** に。**dominance 不変**。
- **Bundle 2（別 GO）= A+B**: fit を**明示マップ**で dominance に効かせる。
- **D は採らない**。

---

## §11 実装スライス（承認後・additive・pure）

| Scope | 内容 |
|---|---|
| **F-A** | 本計画（docs-only） |
| **F-B** | pure adapter **型のみ**（`fit-decision-adapter-types.ts` 等: `ProposalFitInput{candidateId, fit:FitResult}` / `ProposalFitSummary` / packet `fitSummary?` additive field・engine input `fit?`/`cancelWeather?` additive） |
| **F-C** | pure adapter **helper**（`deriveProposalFitSummaries(comparison, fitByCandidate)`・shared は `toSharedFitView` 由来・fit input 不在時 no-op） |
| **F-D** | engine 入出力拡張（`TravelPlanEngineInput.fit?`/`cancelWeather?`・`runTravelPlanEngine` が adapter を compose・packet に fitSummary 載せ・**fit/cancelWeather 不在時 byte 同一**） |
| **F-E** | golden tests（§12） |
| **F-F** | closeout（decision-log + memory） |

**stop**: dominance 影響（Bundle 2）・solver・UI・CoAlter・Plan Intelligence・runtime・weather/route/place API は**別承認**。

---

## §12 将来実装の golden tests

1. **fit input 無 → 既存 T9 挙動 byte 同一**（comparison/decision/packet 不変）。
2. fit mismatch 供給 → **comparison.summary / packet fitSummary に反映**（Bundle 1 は dominance/pareto 不変）。
3. private fit signal → **authoritative packet に効くが shared packet に漏れない**（canary）。
4. shared fit rationale は **shared packet に出てよい**。
5. **fit は action authority を産まない**（fitSummary 有無で executionAuthority 不変）。
6. **cancelWeather が engine input 経由で readiness に届く**（`weather_reversal_uncertainty`→confirm→executionAuthority false）。
7. shared/viewer projection は **display 専用**（authoritative=false・executionAuthority false）。
8. **app/UI を import しない**・中間層を UI が直叩きしない契約（packet が唯一の consume 口）。
9. **no fetch/API/DB/Supabase/route/weather import**（adapter 純度）。
10. 既存 **348 travel tests 不変 green**。
11. **tsc baseline 55 不変**。
12. double-count なし（fit mismatch を stretchCount に黙って畳み込まない・fit ⊥ readiness）。

---

## §13 出力 + CEO 判断請求

- **推奨実装バンドル（承認後）**: **F-B+C+D+E を 1 commit**（pure/additive/adapter/fit 非 authority/private 非漏洩/fit・cancelWeather 不在時 byte 同一）。dominance 影響（Bundle 2）は含めない。
- guardrail: solver/UI/CoAlter/Plan Intelligence/runtime/weather/route/place API なし。fit-core/既存 chain 挙動不変。

### CEO 判断請求
1. 次 = **Fit-to-Decision / T9 composition facade** で良いか（vs solver / UI preflight / rollup）。
2. アーキテクチャ = **A（pre-comparison signal・pure adapter）/ Bundle 1 は dominance 不変の advisory（packet+summary）** で良いか（D 不採用）。
3. fit evidence は **caller が candidateId に対応づけて供給する純 input**（fit が entity を捏造しない・binding は caller 責務）で良いか。
4. **cancelWeather を `TravelPlanEngineInput.cancelWeather?` 経由で assessReadiness に thread**（fit-core 非 producer）で良いか。
5. packet に **`fitSummary?` を additive**（advisory・executionAuthority 不参加）で載せてよいか。
6. 承認後 **F-B/C/D/E bundle 実装**（dominance 影響は別 GO）の GO。

実装は CEO 承認まで着手しない（composition facade 計画レポートで停止）。
