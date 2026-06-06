# tsc baseline — 残 55 件 blocker ledger（read-only・実装なし）

> 2026-06-07 / **read-only 地図のみ・実装修正なし** / main HEAD `60ee0a9e` 時点 `--max-old-space-size=8192 npx tsc --noEmit` = **55 errors**。
> 累計 1114→55（−1059・95%減）後、**無判断 test-only safe は尽きた**ため自動 cleanup を停止し blocker ledger 段階へ。次に何を倒すかは CEO 判断に戻す。

---

## 0. 全体像
| カテゴリ | 件数 | 内容 |
|---|---|---|
| **A** test-only・小判断で直せる可能性 | **8** | mock の missing field / shape（値・構築の確認要） |
| **B** production source 変更要 | **16** | lib/app/components の型・logic 不整合（owning 機能の spec 込み） |
| **C** production export 追加要 | **1** | presenceTelemetry の TelemetryEvent 未 export |
| **D** spec / test expectation 判断要 | **8** | enum 意図 / assertion 意味 / signature 変更 / 名前空間除去 |
| **E** S5 / perspectiveEngine / core path | **22** | stargazer/alter route(15) + stargazer test(7) |
| **F** いま触らない | （= E + B の重い物に内包） | — |
| 計 | **55** | source 31（route 15 + 他 16）+ test 24 |

error code 分布: TS2322(17)・TS2339(13)・TS2345(4)・TS2739(3)・TS2353(3)・TS2741(2)・TS2367(2)・TS2305(2)・他 9。

---

## A. test-only・小判断で直せる可能性（8件・次の最有力候補群）
| cluster | 件数 | root cause | 直すなら | prod 挙動 | リスク |
|---|---|---|---|---|---|
| morningPipelineJourneyAnchors | 2 | mock の `priorPersistedEvents`(MorningPipelineInput に無し) + MorningPlan mismatch | `…morningPipelineJourneyAnchorsIntegration.test.ts` | なし | 中（extraneous か要確認 + MorningPlan 構築） |
| placeResolver HardAnchor | 2 | mock `{label,coords}` が segmentId/order/anchorScore 欠落 | `…placeResolver.test.ts` | なし | 中（order/anchorScore は resolver で**意味を持つ値**・assertion 依存を要確認） |
| planHistory / planHistoryRoundTrip PlanItem | 2 | mock が fixedStart/orderHint/sourceTurnIndex 欠落 | `…planHistory*.test.ts` | なし | 中（値の妥当性確認要） |
| rawRef（b3bFoundation / postSelectionFlow） | 2 | NormalizedPlaceCandidate mock が `rawRef`(PlacesRawRef=複合型) 欠落。b3b は更に 3 rename + 2 余剰 | `…b3bFoundation.test.ts` / `…postSelectionFlow.test.ts` | なし | 中〜高（PlacesRawRef 構築 + b3b は multi-field overhaul） |
- **GO/NO GO**: A は「test-only・prod 不変」だが、各々 **missing field の値/構築の妥当性** を 1 件ずつ確認してから（無判断 safe ではない）。assertion 依存があれば NO-GO。

## B. production source 変更要（16件・owning 機能の判断要）
| cluster | 件数 | root cause | 直すなら | prod 挙動 | リスク |
|---|---|---|---|---|---|
| tourState null | 4 | IIFE が `_cache`(TourStates\|null) を返し `Promise<TourStates>` と不一致 | `lib/tour/tourState.ts` | 可能性あり（return 値の非 null 化 refactor） | 中 |
| baseline OCCUPATION | 3 | `as const` heterogeneous tuple の flatMap 型推論（j unknown / label / readonly tuple） | `app/(immersive)/baseline/BaselineCollectionClient.tsx` | なし（型注釈） | 中（occupation 型に ripple） |
| skillTelemetry isAutoClose | 2 | query が `summary` 未 select なのに `r.summary` 参照＝**real bug**（autoClose 検出が動いていない） | `lib/ceo/skillTelemetry.ts` | **あり**（select に summary 追加で検出が動き出す） | 高（挙動変更） |
| generatePairInsight coreValues | 2 | `AlterGrowthSummary` に coreValues なし・loader 未設定＝**feature 半完成** | `lib/rendezvous/phase0/*` | あり（field 追加+loader） | 高（spec） |
| llmPlanExtractor "work" 比較 | 1 | category union に "work" なし（TS2367 no-overlap）＝dead/誤 logic | `lib/alter-morning/llmPlanExtractor.ts` | あり（logic） | 中 |
| morningPipeline SynthesisSource | 1 | SynthesisSource union が target field 型と不一致 | `lib/alter-morning/morningPipeline.ts` | 可能性あり | 中（comprehension 型 ripple） |
| journeyOriginPromotionTelemetry | 1 | `string` を StargazerEvent enum に代入 | `lib/alter-morning/search/journeyOriginPromotionTelemetry.ts` | あり | 中 |
| MorningMapView google | 1 | `Window.google` の global 重複宣言（別ファイルと構造同一名目別） | `components/home/morning/MorningMapView.tsx` ほか | なし（型統合） | 中（複数ファイル global） |
| origin onStartExploration | 1 | OriginWelcomeFlow に必須 prop 未渡し | `app/(culcept)/origin/OriginPageClient.tsx` | 可能性あり（prop 必須/optional の仕様） | 中（spec） |
- **GO/NO GO**: B は production source。各 owning 機能（tour/baseline/ceo/rendezvous/alter-morning/origin）の **spec 確認 + 実機 smoke** を伴うべき。skillTelemetry・generatePairInsight は**挙動/feature 判断**で特に慎重。

## C. production export 追加要（1件）
| cluster | 件数 | root cause | 直すなら | リスク |
|---|---|---|---|---|
| presenceExecutorTelemetryEmit | 1 | test が `TelemetryEvent` を import するが module が local 宣言で未 export | `lib/coalter/presence/telemetry.ts`(export 追加) or test 側で型自前定義 | 中（prod export 追加=API 表面変更） |
- **GO/NO GO**: production export 追加 = prod API 表面変更。owning（coalter presence）判断。test 側で型を自前定義する回避なら test-only だが型 fidelity 低下。

## D. spec / test expectation 判断要（8件）
| cluster | 件数 | root cause | リスク |
|---|---|---|---|
| ceoScenario | 3 | `MorningSession` 名前空間除去 + `normalizeLLMOutput` import/local 衝突 + pc implicit any（混在） | 中（型除去の後継 spec・複数原因） |
| domainRouter "schedule" | 1 | alternates の "schedule" が DailyDomain に無し | 中（削除 or 置換=test 意図判断） |
| planIntakeGate missingFields | 1 | assertion 中の `response.missingFields`(MorningProtocolResponse に無し・sufficiency へ移動) | 中（assertion 式編集・runtime 不変だが） |
| sceneWeighting arithmetic | 1 | TS2363 算術右辺が number でない | 中（要 context） |
| planner args | 1 | 関数 call が引数過多（signature 変更） | 中（call 意味） |
| b3c2RolloutIntegration | 1 | mock 関数の signature mismatch（HandoffCacheEntry 戻り型） | 中（mock 仕様） |
- **GO/NO GO**: D は test 期待値/enum 意図/signature の判断を伴う。owning 機能の意図確認後に個別 GO。

## E. S5 / perspectiveEngine / core path（22件・除外）
| cluster | 件数 | root cause |
|---|---|---|
| app/api/stargazer/alter/route.ts | 15 | A1-5-8/9 セッションが perspectiveEngine に**存在しないメンバ**（SearchTaskClassification / searchTaskClassification / SearchTask.explicit/confidence / personalityCtx / TrustLevel / ModeDecisionReason / protective・reactive never / 比較 / number）を参照。**route が未完配線 or 旧 API 参照**の疑い |
| stargazer test（conversationQualityAudit 5 / perspectiveEngine 1 / voiRefutation 1） | 7 | FactTag/QueryDomain/StargazerAxis の enum・export 乖離 |
- **GO/NO GO**: **NO-GO（本トラック外）**。core path・A1-5-x owning session の文脈確認が必須。特に route 15 は**機能的バグの可能性**（perspectiveEngine API 乖離）→ owning session に別途エスカレーション推奨。

## F. いま触らない
- E 全部（S5・core path）+ B のうち挙動変更を伴うもの（skillTelemetry の summary select / generatePairInsight の feature 追加）。

---

## 最終所見

### 最も安全な次候補 top 3
1. **morningPipelineJourneyAnchors priorPersistedEvents（A・1件）** — extraneous field なら除去で安全（entry/isWeekday と同型・要 1 件確認）。
2. **placeResolver / planHistory の mock missing field（A・4件）** — 現行型への field 補完。ただし order/anchorScore/fixedStart の値が assertion に影響しないことを 1 件ずつ確認（影響あれば NO-GO）。
3. **planIntakeGate の stale assertion（D寄りだが runtime 不変・1件）** — `response.missingFields`(常に undefined) を除いても値不変。ただし assertion 式編集のため CEO 確認。
- ※ いずれも「無判断 safe」ではなく **1 件ずつの確認 GO** を要する（だから自動 cleanup を止めた）。

### 逆に触るべきでないもの
- **E（S5 stargazer/alter route 15 + stargazer test 7）**: core path・owning session 文脈必須。route 15 は機能バグの可能性で**別途エスカレーション**。
- **B の skillTelemetry / generatePairInsight**: 挙動変更・feature 判断。
- **C presenceTelemetry**: prod export 追加。

### 「55 を baseline として一旦固定する」選択肢の是非
- **妥当（推奨度: 高）**。理由:
  - 大量・低リスクの債務（globals 970 + 明確 stale fixture）は既に解消済（95%減）。残 55 は (a) 評価中サブシステム（stargazer alter route / alter-morning / ceo / tour / rendezvous）の **owning 機能が触る時に spec 込みで直すのが自然** (b) 強制すると HARD GATE（prod/spec/挙動）に抵触。
  - 残 55 は型エラーのみで **runtime は SWC で型剥がし実行**（plan/alter-morning suite 全 PASS）＝機能的 blocker ではない（route 15 の perspectiveEngine 乖離を除く）。
  - CI で「新規 tsc エラーを増やさない」ガード（footprint 0 ルール）を維持すれば、baseline は自然減衰する。
- **留意**: route 15（perspectiveEngine 乖離）だけは type-only でなく**機能的に壊れている可能性**があるため、baseline 固定とは別に A1-5-x owning session へ確認を投げるのが望ましい。

### 次に進むなら
- 自動 cleanup は停止のまま。次トラックは **A の 1 件ずつ確認 GO**（top3 順）か、または **E route 15 を owning session にエスカレーション**（機能確認）か、を CEO が選択。それ以外は baseline 固定で別作業へ。
