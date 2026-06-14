# T11-G2 Real Entity Retrieval / Entity State Provider Design（実 entity → StateEntity 変換・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **設計のみ・実装なし**（docs-only）。CEO ロードマップ「4→1→2」の **(2)**。
**手法**: ultracode workflow（Ground 3 + Design 4 + 敵対的 Verify 1 の 8 agents・実型 grep grounded）で並列設計 → **敵対的検証で不変違反 0 を確認** → 本書で統合（検証指摘 1 medium+5 low を反映）。
**核心（GPT 起点 + 自立深化）**: **Web 検索/レビュー/OTA = evidence source であって score ではない**。Aneurasync では必ず `evidence → Observed<T>(value+confidence+provenance) → entity state(TravelObjectState) → fit` に変換する。retrieval は **fit の前段・user-agnostic**で、rank/book/solver/M2/CoAlter/send/DB write を**しない**。

---

## §0 不変条件（全設計の上位制約・敵対的検証で実コード一致確認済）

| # | 不変 | 帰結 |
|---|---|---|
| INV-1 | evidence → `Observed` field → confidence/provenance → entity state → fit の**一方向**。source を直接 score にしない | retrieval は `Observed<T>` と entity 全体の `ProvenanceEnvelope{sources}` を**生産するだけ**。fit は後段別 pass |
| INV-2 | Web検索/レビュー/OTA = **evidence source**であって score でない | これらは `ProvenanceSource{kind,reliability,independent}` として `provenance.sources[]` に積まれ `aggregateFieldConfidence` 経由で **confidence にのみ**効く。生値は別の一次供給から |
| INV-3 | price/availability/cancellation/route/weather を **hallucinate しない** | 未供給 facet は `Observed={value:null,confidence:0,reason:"unobserved"}`。推定埋め禁止。route 派生は `RouteDerivedObservation`(provenance `derived_from_connection_state`・confidence≤0.85) |
| INV-4 | popularity/review_count は **confidence にのみ**効く・raw quality を上げない | review 数/★平均は `reliability`/`independent` 調整材料。`traits`/`roleAffinity`/`burden` の value に加算しない |
| INV-5 | retrieval は **rank/book/solver/M2/CoAlter/send しない・初期は DB write しない** | booking/availability-check/reservation handoff は retrieval の外。Tier4 は「handoff の境界線を引く」設計で retrieval 自身は handoff しない |
| INV-6 | entity data は shared 可・**user-fit は private**（fit は後段 server-side 別 pass） | retrieval 出力 visibility 既定 shared。**user 制約/選好/private context を query にも結果にも混ぜない**・user-agnostic |
| INV-7 | safety-critical unknown → **fail-closed** | allergen/accessibility/medical/`red_line` 未供給は `Observed.value=null` + `EntityHardProfile` を `TriState "unknown"`/`handling:"unknown"` のまま残す → 後段 `evaluateHardBlocks` がブロック・`MissingDataQuestion{reason:"safety_unknown"}` 昇格。"たぶん大丈夫"で埋めない |
| INV-8 | retrieval 出力に **fit score を含めない・no action/booking authority** | 出力型に FitResult/FitComponent/authoritative を載せない |
| INV-9 | 既存 `Observed<T>`/`FitProvenance`/`EvidenceRef`/`visibility`/`ProvenanceSource` に整合・新概念を作らない | `FitProvenance`(9値)・`ProvenanceSource.kind`(4値) を再利用・additive のみ |

> ★ **命名訂正（検証で確定）**: 仕様の `safety_critical` は型に**不在**。実在は `safety_unknown`(MissingDataQuestion.reason)・`safety_escalation`(FitHardBlock.reason)・fail-closed severity `red_line`/`hard`・`labelCap`。本書は INV-7 を「safety-critical unknown → fail-closed」と読み替え、実装トークンは `safety_unknown`/`red_line` を指す。

---

## §1 前提を疑う — 次は real entity retrieval design で正しいか

| 候補 | 評価 |
|---|---|
| **real entity retrieval design** | **★ 採用**（CEO「4→1→2」決定済・⭐CEO 核心「state を持たせ引き寄せる」の供給層・fit 土台は既存ゆえ retrieval が最後のピース） |
| server intake provider を先に integrate | (1) は実装済(G1)・integration は別 gate。retrieval は intake と直交（entity 側） |
| M2/Stargazer provider design | route/weather と同 enrichment tier・retrieval が先（評価対象 entity が無いと M2 personalization も効かない） |
| Turbopack root fix | 直交・別タスク |
| T11 凍結し Stargazer/Plan 本流へ | CEO 最優先は Stargazer だが Travel は side track として(2)まで進める決定。docs-only ゆえ runtime gate を開けない |

**推奨 = (2) docs-only design**。理由: ⭐CEO の「ホテル/旅券/場所に state を持たせ user 状態に近いものを引き寄せる」**評価エンジン（Unified StateEntity / Fit Model）は実装済**。欠けは「**state 付き実 entity を供給する層**」＝本 retrieval。これを純設計すれば、外部 API/予約は触れずに「Web 検索を score でなく evidence として state 化」する正本ができる。

---

## §2 entity retrieval 問題

- Fit engine は entity を評価できる（fit-core）が、**実 entity がまだ供給されていない**（dev fixture のみ）。
- lodging/place/food/transport/area/activity/support に **state（Observed 群）** が要る。
- ★ **source evidence を直接 score にしてはならない**（INV-1/2）。price/availability/cancellation/route/weather を **hallucinate してはならない**（INV-3）。popularity/review は **confidence にのみ**（INV-4）。

---

## §3 source surfaces（9種・供給可/主張不可・confidence・状態）

★ **retrieval source surface は slot 側 `ExtractionSurface`（軸C: user-slot 値の出所）とは直交する別軸**＝「entity 事実がどの外界供給源から来たか」。**両者を同一 union に混ぜない**（検証 #4 で確定）。entity-evidence の provenance は **`ProvenanceSource.kind`(explicit_user/editorial/aggregated/inferred) + `FitProvenance`(editorial/aggregated/inferred/default_assumed)** に閉じ、`ExtractionSurface` に `entity_retrieval` を**足さない**。`EvidenceRef` の「**参照のみ・本文非保持**」規律は踏襲（生 payload を entity に貼らない・正規化後の `Observed.value` のみ残す）。

| source | provenance 写像 | 供給してよい | **主張してはいけない** | 状態 |
|---|---|---|---|---|
| **S1 official site** | editorial・independent=false・reliability 高 | category/subtype・amenities・mealStyle/viewType・公称 onsenFacet・公称 hardProfile(あるときのみ yes/handled・無→unknown)・公示 priceBand | live availability・当日 price・cancellation 確定・route/weather・review 評判 | 🟡HOLD(WebFetch=Tier2) |
| **S2 user URL** | explicit_user + 解決先(official→editorial) | ユーザーが指した entity の解決(placeRefId)・S1 相当 facet | URL 先の未記載事項の推定 | 🟢Tier0 |
| **S3 Google Maps/Places** | aggregated・location/hours に強 | 位置(placeRefId/座標)・営業時間(→time lock)・category・accessibility 公開時 | price 断定・review を quality 化・availability | 🟡Tier1/2 |
| **S4 OTA/partner API** | aggregated | API が明示供給した priceBand/在庫(API 由来時のみ)・amenities | API 外の availability/price 捏造・scraping | 🔴Tier3 HOLD |
| **S5 booking/affiliate deep link** | — | **deep link は entity state に載せない**(検証#6)・retrieval **出力 envelope の handoff meta** に placeRefId 参照として置く | retrieval が予約に進む・URL 本文を entity に保持 | 🔴Tier4 HOLD |
| **S6 public web search** | inferred/aggregated・低信頼 | 候補発見の手掛かり・他 source 照合の補助 | 検索結果を直接 facet 値に・price/availability | 🟡Tier1 link のみ |
| **S7 review summaries** | aggregated・independent 寄り・低 reliability | **confidence のみ**(INV-4)・traits の確度補強(値は別 source) | hard truth 化・quality 値の加算・price | 🟡Tier2 read-only |
| **S8 manual/user-provided** | explicit_user | ユーザー手入力の候補/facet | — | 🟢Tier0 |
| **S9 future providers** | (additive) | 将来 tier | 各々独立 GO まで断定なし | 🔴HOLD |

---

## §4 entity categories（7 discriminator + 2 cross-facet）

retrieval は全 entity を `TravelObjectState.category` の**7値 1 つ**に分類（lodging/place/food/transport/area/activity/support）＋ **category でない 2 facet**:
- **onsen** = category でなく **`OnsenState` facet**（`onsenFacet` を lodging/place/area に付与）。ryokan+onsen=lodging+facet / 日帰り温泉=place+facet / 温泉街=area+facet。
- **route chain/connection** = category でなく **`RouteChainState`/`ConnectionState` relation 層**（A→B の legs/transfer/terminal）。単一 vehicle は transport(category)。
- **support** = locker/restroom/pharmacy/convenience/rest stop/rain shelter/ATM → `SupportRich.reliefAxis`+`necessity`(構造的・popularity で trip_critical 昇格禁止)。
**規則**: 1 entity=1 category（複合機能は primary・副次は別 support entity）・subtype は evidence 明示時のみ・迷ったら facet 優先・分類は記述で順位でない。

---

## §5 state conversion pipeline（raw evidence → TravelObjectState・user-agnostic・fail-closed）

```
[0 raw evidence(EvidenceRef・本文非保持)] → [1 extracted facts(pure parse・hallucination gate)]
→ [2 Observed<T> 構築(value|null+confidence+provenance+visibility)] → [3 confidence 付与(popularity→confidence のみ)]
→ [4 freshness tag(★retrieval 内部のみ)] → [5 missing 処理(omit・zero-fill しない)]
→ [6 safety unknown(fail-closed)] → [7 TravelObjectState 組立(category+rich+facet)]
```
- **Stage1 hallucination gate**: price/availability/cancellation/route timing/weather は **source 明示時のみ**抽出。欠如は欠如のまま。`inferred` は派生記述(review tone→quietness)に限り許可・上記 5 hard fact には禁止。
- **Stage2**: 観測有→`{value,confidence,provenance,visibility?}` / 無→`{value:null,confidence:0,reason:"unobserved"}`。**safety hard fact は Observed でなく `EntityHardProfile` の TriState/literal**(unknown=fail-closed)。
- **Stage3**: popularity/review→`ProvenanceSource[]`→`aggregateFieldConfidence`=`1−Π(1−eff_i)`(独立飽和・非独立×0.5・cap0.99)。**確度を上げるが生値を変えない**。
- **Stage4 freshness**: ★**検証#5 確定: 観測時刻を entity Observed（fit が読む状態）に載せない**（fit-core は時刻 API 不使用・決定論維持）。staleness は retrieval **内部メタ**に留め、出力 `Observed` には**減衰後 confidence のみ**反映（値は消さない）。
- **Stage5**: missing 非 safety field は **omit**(`value:null`/undefined)・zero-fill しない(asymmetric-missing)。decision-load 大なら `MissingDataQuestion{reason:"low_confidence"}` marker 同梱(retrieval 自身は聞かない)。
- **Stage6 fail-closed**: allergen/accessibility/medical/night-safety/last-departure strand の unknown は **blocking-eligible**。retrieval は **unknown を honest に残す**(yes/safe に矯正しない) → 後段 fail-closed gate が発火(`safety_unknown` question / `safety_escalation` block)。retrieval 自身は block しない(solver でない)が、block を可能にする信号を消さない。
- **Stage7**: `TravelObjectCore × CategoryRich × facet(onsenFacet・RouteChainState は別 emission)`。**fit score/booking authority/user-fit field なし**・user-agnostic・初期 DB write なし(in-memory `EntityCandidate`)。

---

## §6 evidence → state 例（★検証 medium 反映: time lock は OrderingConstraint）

| # | raw evidence | Observed field（target） | note |
|---|---|---|---|
| 1 | "JR○○駅 徒歩8分" | `burden.travelBurden`↑(+`LodgingRich.accessStyle`) | aggregated・`BURDEN_TOLERANCE_MAP`で mobilityTolerance へ。距離=burden evidence で score でない |
| 2 | "チェックイン 15:00〜" | ★**`OrderingConstraint{kind:checkin_window_lock}`（RouteChainState.ordering 層）**・`hardProfile` でない | editorial。retrieval は**時刻を carrier として転記するのみ・solver が並べる**(schedule しない) |
| 3 | "夕食付き（部屋食）" | `LodgingRich.mealStyle`+`roleAffinity.food_destination`↑ | editorial。role *capacity* を上げる |
| 4 | "天然温泉 大浴場あり" | **`onsenFacet:OnsenState`**+`recovery.restValue`↑ | aggregated。onsen=facet で category でない |
| 5 | レビュー"静かで落ち着く"×N | `traits.quietLively`(TraitValue) **medium confidence** | review tone→inferred・複数 review は **confidence のみ**上げる(値不変) |
| 6 | "無料キャンセル 3日前まで" | cancellation-flexibility fact(明示時のみ) | editorial。明示供給→可。欠如→unknown・**推定しない** |
| 7 | "屋外開催・雨天中止" | `burden.weatherFragility`↑+`ActivityRich.cancelOnWeatherAbove` | editorial。weather fragility=burden→weatherTolerance |
| 8 | "石段が急・階段多い" | `PlaceRich.physicalLoad.stairs`↑+`hardProfile.accessibility.noSteepSlope:TriState`+`burden.baggageBurden`↑ | accessibility=**TriState fail-closed** |
| 9 | "営業 9:00–17:00（火曜定休）" | ★**`OrderingConstraint{kind:open_hours_window_lock}`** | editorial。retrieval は時刻 carrier 転記のみ |
| 10 | "最終 ○○行 22:43" | `RouteChainState` connection→**route lock + last-departure strand risk** | aggregated/GTFS。strand=safety-class(Stage6)：不確実→unknown 保持→`safety_escalation` |
| 11 | "¥18,000〜/泊"(明示) | `priceBand:Observed<BudgetBand>`(+`priceLevel`) | ★**検証#2: BudgetBand は数値`{lo,hi}`・OTA 下限のみ供給なら hi を捏造せず lo=hi or hi 欠落**。budget fit input は明示供給時のみ |
| 12 | locker/pharmacy listing | `category:support`+`SupportRich.reliefAxis`+`necessity` | necessity 構造的・popularity 駆動でない |

**横断不変**: 全 value に provenance+EvidenceRef / 5 hard fact は明示供給行(6,7,10,11)のみ / popularity は confidence のみ(5) / safety unknown は fail-closed(8,10) / onsen(4)・route(10) は facet/relation。

---

## §7 confidence / provenance rules

- official=factual 高 / Maps=location・hours 高(供給時) / **reviews=低・hard truth でない** / **LLM 抽出 confidence は source truth でない**(抽出確度 ≠ 事実確度) / source count・popularity は **confidence のみ** / stale・unknown は confidence 下げる / **conflicting source → confidence 減 or `MissingDataQuestion`(勝手に断定しない)** / price・availability は hallucinate しない。
- ★ **検証#3: 2 つの confidence 層を混同しない** — **field 単位** `Observed.confidence=0`(未観測=null 形) と **entity 単位** `aggregateFieldConfidence` の **source 0 件=0.5**(neutral default) は別レイヤ。retrieval は前者を null 形・後者を `ProvenanceEnvelope.sources` の有無で表現。

## §10 privacy

- **entity data は shared 可**(plan 上の事実)。**user-fit は private**(後段 fit が `valueFull` で別処理)。
- **private user 制約を entity 説明に漏らさない**・retrieval は **user-agnostic**(query にも結果にも user 制約/選好を混ぜない)。
- fit matching は retrieval の**後段 server-side 別 pass**。retrieval 出力は user を含まない。

---

## §8 retrieval output contract（`EntityRetrievalResult`・設計のみ）

| ブロック | 内容 | 整合 |
|---|---|---|
| entity candidates | `EntityCandidate{placeRefId,entity:TravelObjectState}` の**順序なし集合**(配列順=rank と解釈禁止) | 既存 EntityCandidate 再利用 |
| entity state | 上記 entity の Observed 群(§5) | TravelObjectState |
| evidence refs | 各 facet の参照(本文非保持) | EvidenceRef 規律 |
| missing data questions | 埋まらなかった field の質問化(reason=low_confidence/safety_unknown) | MissingDataQuestion 整合 |
| confidence summary | entity/result 単位の confidence 集約(**raw quality と分離**) | aggregateFieldConfidence |
| source provenance | entity 全体の `ProvenanceEnvelope{sources}` | ProvenanceSource |
| **freshness** | ★**retrieval 内部メタ**(出力 Observed には confidence 減衰のみ・fit は読まない) | 検証#5 |
| **deep link handoff** | ★**envelope レベルの handoff meta**(placeRefId 参照のみ・**TravelObjectState に載せない**) | 検証#6 |
| **fit score** | **含めない**(別 pass) | INV-8 |
| **authority** | **no action/booking authority** | INV-8 |

## §9 boundaries（retrieval が跨がない線）

rank しない / book しない / live availability 断定しない(API が与えた時のみ) / itinerary solve しない / **M2 呼ばない** / **private user state 露出しない** / CoAlter しない / send-realtime しない / **初期設計 DB write しない** / scraping しない(初期は manual fixture provider) / fit score 型を import しない / deep link を踏まない。

---

## §11 MVP retrieval tiers（許可/HOLD）

| tier | 内容 | 状態 |
|---|---|---|
| **Tier0** user-provided candidates / URLs / manual | ユーザー手入力・貼付 URL の解決 | **🟢今許可**(外部アクセスなし・最初の実装対象) |
| **Tier1** safe search links / Maps URL のみ | 検索/Maps への**安全 link 生成のみ**(取得しない) | 🟢/🟡(link 生成は可・自動取得は Tier2) |
| **Tier2** official page + Maps/Places read-only 抽出 | WebFetch read-only で facet 抽出 | 🟡HOLD(外部アクセス=CEO 承認) |
| **Tier3** OTA/affiliate/partner API | 提携 API で price/在庫(API 由来時のみ) | 🟡HOLD(連携追加=CEO 承認) |
| **Tier4** live availability/pricing/reservation handoff | 予約直前リンク送客の境界 | 🔴HOLD(課金/予約=CEO 承認・retrieval 自身は handoff しない) |

→ **今許可 = Tier0**（manual/user-provided・外部アクセスなし）。Tier1 link 生成も可。Tier2-4 は各々独立 GO。

---

## §12 first implementation bundle（承認後・最小 pure スライス）

- **pure entity retrieval types only**: `EntityRetrievalResult` + 補助型（§8 ブロック）。既存 `Observed/TravelObjectState/EntityCandidate/ProvenanceEnvelope/EvidenceRef` 再利用・**additive**(既存型変更なし・freshness は出力 envelope の内部メタ・**ExtractionSurface 拡張なし**)。
- **manual fixture entity provider**（Tier0・user/manual 由来 entity を Observed 化）。
- **evidence-to-state normalizer helper**（raw fact → Observed・popularity→confidence・missing→omit・safety→fail-closed）。
- tests（§13）。**no live API / no scraping / no production / no DB / no booking / no fit score / no M2**。

## §13 tests（将来・受け入れ条件）

official→高 confidence factual / review→medium quietness(値不変) / **missing price→hallucinate しない** / missing cancellation→missing question / outdoor→weather fragility だが **live weather 断定なし** / station distance→access burden / support は evidence ある時のみ friction 減 / **popularity→confidence のみ(quality 不変)** / stale→confidence 減(値不変) / conflicting→confidence 減 or question / **time lock→OrderingConstraint(hardProfile でない)** / priceBand 数値レンジ(hi 捏造なし) / no fetch/API/DB/Supabase(pure phase) / no booking/calendar/send / **private user state 非漏洩** / fit score 非搭載 / tsc baseline 不変。

---

## §14 敵対的検証で解消した設計間不一致（実装前に一本化済）

| # | 論点 | 確定（本書の採用） |
|---|---|---|
| medium | time lock の着地先 | **`OrderingConstraint{kind:open_hours/checkin_window_lock}`**(relation 層)・hardProfile でない。retrieval は時刻 carrier 転記のみ |
| low-2 | priceBand | 数値 `{lo,hi}` range・OTA 下限のみは hi 捏造せず。`BudgetBand.confidence`(帯幅)と `Observed.confidence`(source)を分離 |
| low-3 | confidence 2 層 | field 0(未観測) ≠ entity 0.5(source 0 件 default) を混同しない |
| low-4 | ExtractionSurface 拡張 | **しない**。entity provenance は `ProvenanceSource`/`FitProvenance` に閉じる(user-slot 軸と混ぜない) |
| low-5 | freshness 出力 | **retrieval 内部メタのみ**・fit が読む Observed には confidence 減衰のみ(決定論維持) |
| low-6 | deep link 保持先 | **result envelope の handoff meta**・`TravelObjectState` に URL を載せない |

**敵対的検証の総合判定**: 4 設計とも不変条件に忠実・**invariant 違反/抜け道 0**（source→score 化なし・5 hard fact hallucinate なし・popularity→confidence only・rank/book/solve/M2/CoAlter/send/DB write なし・fit score 非混入・private 非漏洩・safety unknown fail-closed・既存 Observed/EvidenceRef/visibility 整合）。上記 6 点を一本化済みで配線可能水準。

---

## §15 Stop + CEO 判断請求

- 本書は **retrieval 設計のみ**。実装・外部 API・予約・本番なし。
- **推奨 first bundle = §12（pure types + Tier0 manual fixture provider + evidence-to-state normalizer + tests）**。Tier2-4(外部 API/予約) は各々独立 GO。

### CEO 判断請求
1. **「Web 検索/レビュー/OTA = evidence であって score でない」**（evidence→Observed→confidence→state→fit・popularity は confidence のみ）を retrieval の中核原則として承認するか。
2. **entity provenance は `ProvenanceSource`/`FitProvenance` に閉じ `ExtractionSurface` を拡張しない**（user-slot 軸と混ぜない）で良いか。
3. **time lock=OrderingConstraint / freshness=retrieval 内部 / deep link=envelope meta**（entity state に時刻/URL を載せない）で良いか。
4. **今許可は Tier0(manual/user-provided・外部アクセスなし)のみ**・Tier2-4 は HOLD で良いか。
5. 次フェーズ = §12 の **pure types + Tier0 fixture provider + normalizer 実装**（外部 API/scraping/予約/本番なし）で良いか。

実装は CEO 承認まで着手しない（G2 設計レポートで停止）。
