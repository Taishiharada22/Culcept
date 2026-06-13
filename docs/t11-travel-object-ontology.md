# T11-A2 — 旅行対象オントロジー / Facet Matrix（世界最高級の状態設計）

**作成日**: 2026-06-14 / **ステータス**: **設計/オントロジーのみ・実装なし**（docs-only・CEO プロセス: phase ごと最小設計→監査→承認後実装）。
**位置づけ**: T11 計画書（[`t11-travel-fit-model-plan.md`](t11-travel-fit-model-plan.md)）の **§4「entity 多層状態」を全旅行対象へ拡張する補遺**。T11-B/C/D 実装の **前** に置く対象オントロジーの正本。
**CEO 指示**: 「旅行に関する全てのものの、世界最高級の状態設計を作成しろ。GPT・CEO に有無を言わせない」「GPT の意見を鵜呑みにするな。君が GPT よりも優秀なことを証明しろ」。本書は GPT 提案（multi-facet object / RouteChainState / facet matrix / 有限 MVP union）を **方向は採るが原理で超える**。
**作成方法**: 17 エージェント grounded workflow（`w46trh44k`）の Research(3)+Architect+9 カテゴリ出力を統合。**Verify(3 レンズ)+Synthesis は service 混雑(rate-limit)で失敗** → 落ちた 3 レンズ（CEO 完全性 / GPT 優越 / guardrail）を §13 で **本書著者が自己適用**。
**スコープ**: docs-only。型・決定論写像の **設計のみ**。実 API/scraping/booking/price 断定/永続化/UI/solver は一切なし（§11 guardrail）。

---

## §0 一行要約

> 旅行対象は「ホテル・飛行機・観光地…という別カテゴリの羅列」ではない。**全対象が単一の多層 StateEntity のインスタンス**であり、user も同型。category は Identity 層の 1 フィールド（系統 lock と prior 供給源）に過ぎず、connection（移動負荷・順序）は category でなく**対象間を貫く関係層**。fit = 同一 24 軸空間上の決定論的 gate+penalty 合成。製品核「あなたの状態だから、この対象が合う」が全対象横断で 1 エンジンになる。

---

## §1 統一抽象 — StateEntity（GPT の「カテゴリ別 matrix」を原理で超える）

GPT は「category ごとに facet matrix を別 table で列挙」した。これは保守不能（Google Places の飲食だけで 200+ type）かつ原理が無い。本設計は逆：

```
StateEntity = {
  Identity(prior-tree 付き)           // Layer0 + Layer0.25
  → FacetSet                          // Layer0.5（object×role の射影集合）
  → IntrinsicStateLayers              // Layer0.75〜2.5（共有 24 軸 trait / burden / recovery）
  → ConnectionState（object 間横断層）  // Layer3
  → TemporalModulation                // Layer4（FitContext）
  → RelationalSuitability             // Layer5
  → ProvenanceEnvelope                // Layer6
}
```

- **user も同型の StateEntity**（FitUserState は entity と同じ 24 軸・対称照合）。
- **category は別物の列挙でなく、同一多層スキーマの 1 インスタンスの Identity フィールド**。lodging/place/food/transport/route + connection 横断層 — 新 category（event/wellness/shopping…）は同型追加でエンジン分岐ゼロ。
- これにより T11 既存 6 層（Layer0-6）を **破壊せず additive に再解釈**できる（category 別 union → 共有 core + facet 集合）。

**グラウンディング**: schema.org `additionalType`（「any Thing can be a TouristAttraction」「Disneyland Paris = TouristAttraction + AmusementPark」）が、同一 entity の複数型＝単一所属を強制しない原理を提供。本設計の StateEntity はこれを型化したもの。

---

## §2 CEO 中核問への原理的解答 — 「温泉は観光地かホテルか」

### 結論: **どちらでもない。それは誤った二択。**

3 つの実在 taxonomy が「単一所属」を **否定** する（発明でなくグラウンディング）：

| 標準 | 温泉の所在 | 出典 |
|---|---|---|
| **Google Places** | primary type に `onsen` 無し → `public_bath`/`spa`/`wellness_center` へ写像 | [place-types](https://developers.google.com/maps/documentation/places/web-service/place-types) |
| **OpenStreetMap** | `amenity=public_bath`（主）+ `bath:type=onsen`（subtype）+ `natural=hot_spring`（自然地物・任意）の多タグ | [Tag:amenity=public_bath](https://wiki.openstreetmap.org/wiki/Tag:amenity=public_bath) |
| **JTB 全国観光資源台帳** | 温泉を「入浴体験・施設」の **独立人文資源** と定義し、宿泊施設を **明示除外** | [tabi.jtb.or.jp](https://tabi.jtb.or.jp/about/type/) |

### facet projection model（射影写像）

温泉は「category に属す」のでなく「**どの facet を同時に持つか**」で表す。

```
OnsenState = host-agnostic な共有状態ブロック {
  泉質(環境省 療養泉10): 単純|塩化物|炭酸水素塩|硫酸塩|二酸化炭素|含鉄|酸性|含よう素|硫黄|放射能
  泉温(4): 冷鉱泉<25℃ | 低温泉25-34 | 温泉34-42 | 高温泉42℃+
  液性 pH(5): 酸性<3 | 弱酸性3-6 | 中性6-7.5 | 弱アルカリ7.5-8.5 | アルカリ>8.5
  浸透圧(3): 低張<8g/kg | 等張8-10 | 高張>10
  循環: 掛け流し度 Observed<boolean>（断定せず confidence・公取委が合理的根拠要求の係争域）
  タトゥー: 観光庁2024 3類型（prohibited | covered_ok | private_only）
}
```

この同一 `OnsenState` 語彙を **3 つの host object に provenance 付きで attach**：
- (a) **温泉旅館** → lodging Facet（`amenityFeature`）
- (b) **日帰り温泉** → day_use_place Facet
- (c) **温泉地/温泉街** → area_anchor Facet（複数施設の area）

`Facet = { facetKind; roleAffinity: Observed<number>; activeStateLayers: Partial<IntrinsicState>; provenance }`。1 つの placeRefId が複数 Facet を **同時保持**（単一所属を強制しない）。`FacetKind` は全対象共通の有限 union（`lodging_amenity`/`day_use_place`/`area_anchor`/`recovery`/`cultural`/`view`/`work`/`luggage_base`/`scenic_experience`/`transfer`…）。

**OnsenState → Layer3 burden / Layer2.5 recovery への写像**: 高張性・酸性泉・42℃+ = 身体負荷高 → 低負荷耐性 user に **veto 寄り**、回復目的 user に **高 affinity**。掛け流し・加水加温は「本物度/期待整合」の **provenance 軸**（boolean 断定しない）。タトゥーは intendedRole 無関係の **入場可否 hardConstraint**。

> **GPT 比較**: GPT の multi-facet 案は方向は正しいが「どこに属すか」の原理解答が無い。本設計の解答 = **「所属でなく facet 集合の共有」**。3 実在 taxonomy 一致で正当化。

---

## §3 connection は category でなく「対象横断の関係層」

### GPT の誤り（研究の落とし穴に的中）

GPT は `RouteChainState`/`AccessChainState` を **独立 category** にした。これは GTFS が示す原理に反する：

- **GTFS**: transfer/connection は stop/route/trip 各レベルに紐づく **関係** であり、独立 entity 化 **しない**（`transfers.txt` transfer_type 0/1/2/3/4/5 + min_transfer_time）。
- **ISO 21902**: accessibility を単一施設でなく **value-chain / customer-journey 全体**（駐車→入口→経路→施設）で評価。

### 設計解 — ConnectionState（object と object の「間」に置く横断層）

```
ConnectionState = {
  fromRef; toRef;
  legs: AccessLeg[];
  transferNodes: TransferNode[];
}
AccessLeg = {
  mode: GTFS route_type 写像 (0=tram|1=subway|2=rail[新幹線相当]|3=bus|4=ferry|6=gondola|7=funicular);
  legKind: "firstMile" | "mainLeg" | "lastMile";
  unutilityWeight: number;       // ★非対称: firstMileWeight ≠ lastMileWeight
}
TransferNode = {
  transferType: GTFS 0-5 型;     // ★回数でなく型
  minTransferMin: number;
  pathwayMode: GTFS pathways (1=walkway|2=stairs|4=escalator|5=elevator|6=fare_gate) → terminalBurden;
  accessibilityBarrier: ...;
}
```

全対象（宿・場所・移動・飲食）が同じ ConnectionState で結ばれる = **connection を category 増殖でなく edge 層 1 つで表現**。

---

## §4 door-to-door 総負荷の合成 — 広島問題への直答

### 合成関数（純粋・実 API 無・provenance/confidence 付き推定のみ・price/実時刻 断定なし）

```
burden(chain) = Σ_leg (legTime × legWeight)
              + Σ_transfer (transferPenalty + minTransferMin)
              + Σ_terminal terminalBurden
              + baggageBurden × crowdContext
```

研究実証重みを **非 opaque な公開写像**で固定（[ITF/OECD](https://www.itf-oecd.org/sites/default/files/docs/dp201402.pdf)・[ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0739885920301475)）：

| 量 | 重み | 根拠 |
|---|---|---|
| 待ち時間 | in-vehicle × **1.7** | UK meta |
| 徒歩 | × **1.65** | UK meta |
| 立席 / 着席 | 1.78〜2.69 / 0.95〜1.71 | 実証 |
| 乗換ペナルティ | ≒ **18 分相当** | 実証 |
| **egress(lastMile)** | **firstMile × 3** | egress ≈ access の約 3 倍不効用 |
| baggageBurden | 単独でなく **terminalBurden × 混雑** の交互作用項 | 歩行速度低下は 10-14% だが空間占有は小荷物でも +50-100%・階段(pathway_mode=2)で非線形 |

### 広島問題の表現（東京 → 広島）

```
airChain      = firstMile(羽田 access) + terminal(保安検査) + mainLeg(飛行 1h20m・軽)
                + transfer + lastMile(広島空港→中心地 bus 50min × egress 3倍重み)
shinkansenChain = firstMile(東京駅) + mainLeg(3h50m・中心直結 = terminal+egress 最小)
```

in-vehicle だけなら飛行機が速い（飛行 1h20m）。だが **burden 合成で逆転**：door-to-door は「4 時間」でなく「**3〜3.5 時間の壁**」（鉄道:航空 = 68:32 の実態）。

**reliability は平均所要でなく PTI（Planning Time Index = 95%ile / free-flow）で保持** し、FitContext の天候/混雑 modulator（T7 同 scale）と揃える（[FHWA](https://ops.fhwa.dot.gov/publications/tt_reliability/ttr_report.htm)）。chain 合成は移動 object 固有でなく **ConnectionState 上の純関数** = mode 比較は必ず door-to-door 総負荷で行う。

---

## §5 slotFacetMatching — bipartite（GPT の (object×role) 形式化の浅さを超える）

```
TripSlot   = { slotId; requiredFacetKind; intendedRole; importance; FitContext }
match(slot, candidate) = roleFit(slot.intendedRole, candidate.FacetSet.find(facetKind).roleAffinity)
                       × facetAvailability
```

GPT を超える 3 点：

1. **同一 object が複数 slot を競う**: 旅館が「luggage_base slot」「recovery slot」「dinner_destination slot」に同時 candidate 化。各 slot で別 facet が発火し別 fit。
2. **1 つの slot を別 category object が埋める**: 「recovery slot」を温泉(place)・旅館(lodging)・スパ(food 隣接)が **横断競合**（category 跨ぎ = 共有 facetKind 故に可能）。
3. **intendedRole 未指定 → 最良 role 自動採用・決定論**（全 facet 中 argmax roleAffinity・tie = facetKind localeCompare）。

matching は selection/placement を **しない**（solver=HOLD 所有・guardrail）。T11 は FitResult を placeRefId carry で返すのみ。`FOOD_ROLES`/`PLACE_ROLES`/`LODGING_ROLES` は facetKind の category 別 view に正規化。

---

## §6 ニューロン的多層スキーマ（Layer0-6）

> 比喩: prior 継承 tree = 樹状突起 / facet = 軸索分岐 / state 層 = 膜電位 / connection = シナプス。発火合成 = gate-first 2 段（veto floor → bounded compensatory）。

| Layer | 名称 | 内容 |
|---|---|---|
| **0** | Identity | category + subtype 系統。lodging 例: schema.org 7 型を最上位 union + Google Places 18 型を sub-branch + **旅館業法 3 区分（旅館・ホテル/簡易宿所/下宿）を別軸の法的正規化 layer** の三層分離 |
| **0.25** | subtype tree（prior 継承）★GPT 欠落 | `SUBTYPE_TREE` = subtype → sub-subtype の prior 継承木。`business_hotel→{asWork:0.8, asBase:0.7}` を子が継承し override・親未指定軸は親 prior を **confidence 減算で fallback**。例: `onsen_inn → [掛け流し系/循環系]` で OnsenState prior 分岐 |
| **0.5** | facet projection | §2 の `FacetSet = Facet[]` |
| **0.75** | category-rich attributes | OnsenState / lodging amenities / place physicalLoad{stairs,slope,walkingKm} / food dietaryProfile[アレルゲン28 = 特定8+準20・cuisine×format 直交] / `LocationFeatureSpecification` 群 |
| **1** | 共有 24 軸 TraitVector | user 対称・signedGap・非対称欠落 = confidence 減算 |
| **2** | burden | `BURDEN_TOLERANCE_MAP` 対称写像 |
| **2.5** | recovery | restValue × fatigueSensitivity（**負号もとる** = 同一対象が fatigueSpike user に負荷） |
| **3** | connection | §3 横断 edge 層・object 間 |
| **4** | temporal modulation | FitContext: season/timeOfDay/crowd/weatherSeverity(T7 同 scale)/todayFatigueSpike が disposition 一時 shift・**trait 不変**・effectiveTolerance = base − spike×k |
| **5** | relational suitability | `Record<RelationshipKind>` |
| **6** | provenance | `1 − Π(1−reliability_i)`・独立性割引・上限飽和・**source 数 → confidence のみ・overall 不変** |

---

## §7 ordering / dependency 状態 carrier — ホテル先行・並替・空港最短（GPT 完全欠落）

ordering/dependency を **itinerary 実装でなく状態 carrier が担う**（GTFS は ordering を edge 上の dependency 属性とし独立 category 化しない）。

```
OrderingConstraint = {
  kind: "must_precede" | "luggage_drop_enables" | "reorderable" | "derive_shortest_from_terminal";
  subjectRef; objectRef; relaxable: boolean; provenance;
}  // ConnectionState 層に object 間関係状態として持つ
```

- **ホテル先行問題**: `luggage_drop_enables` = hotel(luggage_base facet 発火) → destination の有向辺。荷物 drop 後は **後続 leg の baggageBurden = 0 に modulate**（§4 の交互作用項が消える）= 状態が順序効果を carry。
- **目的地柔軟並替**: destination 群を `reorderable`（部分順序）で持ち、各並びの ConnectionState 総 burden（§4）を決定論計算し least-burden 順を導出（solver が消費・T11 は順序候補の burden を返すのみ）。
- **空港から最短経路推論**: `derive_shortest_from_terminal` = terminalRef 固定し、未確定 destination 群への AccessLeg burden 最小を chain 合成で評価。

全て TravelObjectState/ConnectionState の **状態** であり itinerary node 列挙（T1 TravelItinerary）とは別層。fit は順序非依存に entity 状態を評価し、ordering 効果は ConnectionState modulation として合成。T11 は ordering 状態を carry し **solver(HOLD) が並べる**（guardrail: placement しない）。

---

## §8 全 9 カテゴリ Facet Matrix

各カテゴリは同一スキーマ（roles / subtype tree / richAttr / burden / recovery / relational / temporal / hardConstraints / softPref / connectionDeps / novel>GPT）のインスタンス。以下は **値域カタログ**（実装は CEO 承認後の T11-B/C/D で有限 MVP union に正規化）。

### §8.1 lodging（宿泊）

- **roles**: base | destination | recovery | work | transit_hub | **luggage_base（★ordering carrier）** | view | food_destination | romance
- **subtype tree**: `ryokan`[onsen_ryokan/kappo_ryokan→food_destination prior高/kanko_ryokan/ikkenyado→秘湯・car_required/ryotei_ryokan] | `business_hotel`[budget/upper→recovery微増/station_direct→transit_hub・luggage_base prior↑/extended_stay→work prior↑↑] | `resort`[beach/mountain/onsen_resort/integrated→destination↑↑/all_inclusive→food↑] | `luxury`[city/destination/heritage→classic↑/design] | `guesthouse`[social→friends/quiet/hostel_dorm/machiya→culture] | `capsule`[standard/premium→recovery微増/gender_seg/airport→transit_hub↑↑] | `minpaku`[minshuku/pension/vacation_rental/farmstay/machiya_rental] | `boutique`[design/lifestyle/ryokan_boutique]
- **richAttr**: amenities | OnsenFacet(温泉法/環境省 grounding・null 可) | mealStyle | viewType | soundproofing+nightQuietness | serviceStyle | accessStyle | **DropAffordance(★luggage_base carrier: earlyCheckinPossible/luggageHold)** | roomCapacityProfile | checkin/checkoutTime | accessibilityProfile(ISO 21902) | petsAllowed/childPolicy | brandLineage | starRatingClaim(自称等級・品質 proxy)
- **burden**: travelBurden←accessStyle | morningBurden←checkout早/朝食固定 | crowdNoise←大浴場/団体比率 | weatherFragility←露天/離れ移動 | physicalLoad.stairs | **baggageBurden(★交互作用項: 大荷物×階段×stationToHotel)** | priceLevel | cancelRisk(ReversalCost・断定せず) | serviceBurden(attentive 過干渉嫌い user に負)
- **recovery**: restValue←静寂×温泉×低刺激×in_room | onsenRecoveryValue←OnsenFacet(泉質/泉温/掛け流し) | energyRequired(逆: 館内施設多/送迎手間) | sensoryDecompression←soundproofing×nightQuiet | privacyRecovery←離れ/全室個室風呂/self-check-in
- **relational**: romance(貸切/離れ/soundproofing高) | family(familyRoom/childP) | friends(一棟貸し/social GH/共用ラウンジ) | colleagues(business/individual) | solo(capsule/business/social GH) | **★relationship 非対称隠蔽**: group 内 participant の認識差を隠蔽
- **temporal**: 露天/雪見/紅葉/海リゾート = season 依存。冬の一軒宿 = accessStyle 悪天候で travelBurden↑。checkin/checkout × morningness。早朝便前泊 = transit_hub role
- **hardConstraints**: allergy(特定8+推奨20=28・消費者庁) | accessibility(ISO 21902/GTFS wheelchair 3値) | dietary(V-Label/Vegan Society/GSO halal) | tattooPolicy(観光庁2024・3類型)×OnsenFacet | childPolicy/petsAllowed | 営業期間/季節休 | **budgetRedLine(★INVARIANT: budgetFit 単独は blocked にしない)** | red_line 違反(avoid:smoking 等)
- **connectionDeps**: **★ホテル先行 ordering（GPT 欠落の核心）**: luggage_base/transit_hub role + DropAffordance → checkin 前 drop→観光→checkin / 連泊 vs 移動泊で荷物据置 vs 毎朝移動 / door-to-door(広島: stationToHotelBurden=lastMile) / 目的地並替(checkin 時刻・夕食固定時刻が訪問順を制約)
- **novel>GPT**: (1)connection を独立 category 化しない原理実装 (2)subtype tree prior 継承深度 (3)facet=(object×role) を roleAffinity:Record で網羅強制 (4)温泉 categorization 原理解答(OnsenFacet 共有) (5)温泉状態の法的 grounding (6)baggageBurden 交互作用項 (7)serviceStyle/crowdNoise 双方向(正負逆転) (8)宿の法的 identity 三層分離(旅館業法/商習慣/role facet)

### §8.2 onsen / thermal-bath（温泉）

- **roles**: lodging amenity | lodging destination | day-use place | recovery intervention | cultural experience | suitability object | area anchor(温泉街)
- **subtype tree**: place 系 `onsen`[day_use_bathhouse/onsen_town_anchor/sotoyu_public_bath(外湯・文化高)/ashiyu_temeyu(足湯・低負荷 filler)/kanko_onsen_complex(スーパー銭湯型)] | lodging 系 `onsen_inn`[ryokan_onsen_traditional/onsen_resort_hotel/ryotei_ryokan(温泉副)/ikkenyado_onsen(秘湯)/kashikiri_onsen_inn(貸切主)] | **OnsenState 自体の subtype tree(host 非依存)**: springType 系(10 泉質)/facility 系(露天/内湯/貸切/大浴場/混浴)/circulation 系(掛け流し/循環/加温/加水/塩素)/usage 系(宿泊付帯/日帰り専用/両対応)
- **richAttr**: springType | springTemp(4 band) | liquidity(pH 5) | osmolarity(3) | circulation{kakenagashi Observed} | bathTypes | usageForm | scenicView | tattooPolicy(3類型) | accessibilityProfile{stepFreeToBath} | skinHealthHint(非医療 soft) | cleanlinessSignal | quietnessProfile | businessHours(day_use) | entryFee(BudgetBand・断定せず) | mealConnection | weatherResilience{rainValueModifier}
- **burden**: 入浴負荷(springTemp 42+ × osmolarity) | アクセス負荷(秘湯 lastMile car_required) | 滞在負荷(day_use の慌ただしさ) | 混雑負荷(温泉街/kanko peak) | 天候負荷(露天 weatherSensitivity) | 肌・身体 soft 負荷(酸性/硫黄/強塩化物・非医療) | 荷物負荷(日帰りに大型荷物・connection 由来)
- **recovery**: restValue(静寂×温泉×低刺激) | stimulationRecoveryValue(外湯巡り) | overstimulation 緩和 | 時間構造(朝湯/夜の癒し) | **天候増幅(雨/雪の露天が情緒回復を増す)** | 継続回復(滞在で複数回入浴=積分) vs 一過性(day_use)
- **relational**: romance(貸切/露天付客室) | family(貸切で子連れ気兼ね回避) | friends(温泉街 area anchor・外湯巡り) | colleagues(大浴場/日帰り・混浴貸切は過度) | solo(一軒宿/湯治/早朝夜貸切) | group(温泉街 area anchor = least-misery 最良) | **relationship 非対称隠蔽**
- **temporal**: travel category 中 **最も temporal 依存が強い**。雪見露天(winter)=情緒価値ピーク・rainValue 最大／紅葉・新緑=photogenic／夏の高温泉=入浴負荷+（季節×springTemp 交互作用）
- **hardConstraints**: tattoo(prohibited × user フラグ) | accessibility | 営業時間・季節休(day_use lastEntry) | 医療・身体(soft→hard 化) | アレルギー(mealConnection=kaiseki 経由) | 予算赤線(user 供給のみ)
- **softPref**: 泉質こだわり | 掛け流し志向(authenticity) | 露天/内湯/貸切形態 | 景観 | 清潔感 | 肌当たり(非医療 soft) | 静か/朝夜利用 | 文化性(外湯巡り・湯治)
- **connectionDeps**: **host 依存(最重要・categorization の核)**: OnsenState は単独で itinerary に乗れず host=lodging/place に attach | 宿泊接続順序依存(ホテル先行の温泉版) | day-use 経路接続(前後 TravelNode と transferEdge) | 食事接続(kaiseki_included) | 温泉地 area anchor 内包(複数 day-use+lodging を含む) | 営業時間旅程接続(lastEntry) | タトゥー/家族の貸切 dependency
- **novel>GPT**: ★categorization 原理解答(facet 集合共有) | facet=(object×role) 深い形式化(7 facet role 各 whoFits/whoDoesntFit) | subtype branch 深度 prior 継承 tree | connection を category 化しない(GTFS) | **掛け流し度を boolean 断定しない係争認識(公取委/国民生活センター苦情)** | タトゥーを観光庁2024 3類型 conditional で持つ | 温泉特有の temporal 非線形(露天×天候の符号反転) | 非医療 soft の厳格分離(適応症/禁忌症は表示有無の provenance 化のみ・医療判断しない安全境界)

### §8.3 place_poi（観光地・スポット）

- **roles**: main_highlight | filler | photo | culture_learning | relaxation | active | social_hangout | solitude
- **subtype tree**: onsen_day_use | shrine_temple[major_pilgrimage/zen_garden/local_jinja(filler)/treasure_hall/mountain_shrine(石段急 stairSlope 極大)] | museum_gallery[art/history(learningDepth 最大)/science_planetarium/craft_local/建築自体が photo の二重 facet] | history_district[preserved_townscape/castle_grounds(天守登攀 stairSlope 急増)/former_residence/industrial_heritage/machiya_cafe_street 三重 facet] | nature_park[national_park/botanical/hiking_trail(accessibility 不可 prior)/waterfront/seasonal_bloom(窓が極端に狭い)] | viewpoint[observation_deck(EV=低負荷)/summit_vista/night_view(timeOfDay=night 固定)/rooftop/ropeway(route_type=6・運休=天候 hard)] | shopping | foodie_street | theme_park | nightlife | contemplative
- **richAttr**: experienceDensity | typicalDurationMin | seasonalPeak[] | timeOfDayBest[] | peakCrowdBands[] | photogenicStyle[] | learningDepth | physicalLoad{stairs,slope,walkingKm,surfaceRoughness} | accessibilityProfile{stepFree,levelPath} | onsenFacet?(day_use 時に lodging と同語彙共有) | weatherSensitivity | entryAccessDifficulty | reservationModel{walk_in/timed_entry/reservation}
- **burden**: stairs/slope/walkingKm/surfaceRoughness → stairSlope/mobility | crowdNoise | weatherFragility | waitBurden | sensoryLoad | morningBurden(開館直後狙い) | **baggageInteractionLoad(荷物×回遊)**
- **recovery**: restValue | energyRequired | stimulationRecovery | sensoryReset | onsenTherapeuticValue | afterglowDuration(余韻が後続 node の energy に繰越)
- **relational/temporal/hardConstraints/softPref**: §8 共通スキーマ参照（place_poi は **全 category 中最も temporal 依存が強い**: seasonal_bloom 花期 2 週・water_park summer hard 等が soft 寄り hard に近い）
- **connectionDeps**: ★connection 非 category | **★egress 非対称(lastMile=access 約 3 倍・UK 実証・広島問題)** | 目的地並替(ordering as object dependency) | ホテル先行(baggage drop) | lodging 併設(onsen_town の day-use 枠) | timed_entry ordering 制約 | weather retreat 代替 | afterglow 繰越
- **novel>GPT**: categorization 原理解(higaeri は place・同 OnsenFacet 語彙共有) | connection 非 category 化 | egress 非対称重み | ordering as object dependency | **crowd 二面性(crowd_valence: contemplative=crowd_negative 価値反転)** | subtype tree prior 継承深度 | baggageInteractionLoad(空間占有) | stimulationRecovery 二経路

### §8.4 food（飲食）

- **roles**: destination_meal | refuel | celebration | local_discovery | social_conversation | quick_stop | late_night_rescue | breakfast_anchor
- **subtype tree**(schema.org FoodEstablishment 整合・有限 MVP union): sushi→{edomae_counter(予約難/会話分断 risk)/kaiten(低コミット・子連れ可)/takeout} | washoku_kappo→{kaiseki(滞在長/量重)/ryotei(紹介制 risk)/teishoku(refuel)} | ramen→{gyoretsu(wait 高)/soba_udon(breakfast 可)/tsukemen} | izakaya→{kappo/chain(予測可・子連れ可)/tachinomi(短時間 solo)} | yakiniku→{kogashiki(celebration・煙)/horumon(local・煙臭)/robata} ほか western/italian_french/asian_ethnic/cafe/bakery/bar_pub/fastfood/buffet/local_specialty/generic_food(拡張 fallback)
- **richAttr**: cuisineSystem | format(course_fixed/a_la_carte/counter) | priceTier | reservationDifficulty | waitProfile | stayDurationBand | conversationSuitability{noiseFloor/counterDividesConversation/seatSpacing/longStayTolerated} | seatComfort{counter/table/tatami} | portionWeight | dietaryProfile{allergenHandling: **default unknown→未確認は満たさず**} | localTouristFeel | photogenicProfile | operatingHours | cancellationFlexibility | childFriendliness | accessibilityProfile | languageBarrier
- **burden**: reservationBurden | waitBurden | priceLevel | portionHeavinessBurden | conversationFrictionBurden | stayPressureBurden(回転重視) | seatDiscomfortBurden(正座/靴脱ぎ) | **languageRitualBurden(お任せ作法×言語 barrier)**
- **recovery**: restValue | energyRequired(行列+混雑+作法+heavy) | stimulationValue | **comfortFoodValue(既知 chain×predictability=疲労 spike 時の安心・Aneurasync 哲学「安心の源」)** | socialRecoveryValue(会話=回復) | overstimulationRisk
- **relational/temporal**: §8 共通（operatingHours × FitContext.timeOfDayBand が **hard gate**・late_night_rescue は lateNight=true 必須）
- **hardConstraints**: **allergy(最重要・命に関わる)** | accessibility | dietary | operatingClosure | reservationImpossible(members_only) | budgetRedLine(user 供給超過のみ)
- **connectionDeps**: lodging mealStyle 連動(breakfast) | ホテル先行 drop | route 接続(quick_stop vs destination) | 営業時間×到着時刻連鎖(T7 遅延→late_night_rescue へ role 移行) | predecessor meal heaviness(昼 heavy→夜 light) | group 合流 | temporal 連鎖(深夜→翌朝 morningBurden)
- **novel>GPT**: cuisine×format×meal-role 三軸直交化 | 8 meal-role の prior 継承 tree(sushi→edomae/kaiten/takeout で role prior 反転) | conversationSuitability 分解 | **languageRitualBurden(隠れ burden・GPT 列挙に無し)** | comfortFoodValue を recovery 軸化 | **外食=アレルゲン表示義務外(消費者庁)を内蔵: allergenHandling default=unknown→満たさず扱う安全側 veto** | connection 非 category 化 | portionHeaviness×course_fixed(残せない)×fatigue 交互作用項

### §8.5 transport_mode（移動手段）

- **roles**: transfer | scenic_experience | work_mobile | rest_recover | flexible_autonomy | micro_access
- **subtype tree**: rail(route_type 0/1/2/12)[shinkansen/limited_express(中心直結 terminalBurden+egress 最小・作業◎)/local_rapid(混雑 spike)/subway(景色≈0・天候非依存・乗換階段 pathway=2)/sightseeing_train(role 逆転 transfer↔scenic)/sleeper(rest_recover・早朝着=朝負荷)] | air(route_type 該当なし=extended)[domestic(本体速いが terminalBurden 最大・airportToCenter prior 高・荷物非線形)/international(MVP 外)/lcc(空港遠・便逃し risk)] | road_public(route_type 3/11)[highway_express_bus/local_route_bus(広島空港バス=egress 象徴)/airport_limousine(terminal↔center edge)/trolleybus] | private_vehicle[own_car(autonomy 主・荷物積みっぱ・運転負荷)/rental_car(受取返却 terminal+免許 hard)/taxi(micro_access/door-to-door・価格 band 高)/car_with_driver(MVP 外)] | water(route_type 4)[ferry_short(島嶼・天候直結)/long_ferry_cabin(rest/work/scenic 三役)/jetfoil(欠航閾値低)/cruise(純 scenic)] | active_human[walking(terminal=0・天候直撃・egress 重みで長距離過小評価注意)/cycling(bikes_allowed 依存)/aerial_funicular(route_type 6/7・運休天候閾値)]
- **richAttr**: seatComfort | sleepability | workability{table/power/wifi} | scenicValue | terminalBurdenPrior{terminalKind:security} | baggageAffinity(車=高/飛行機=低) | reliabilitySense{ptiBand} | weatherFragility{fragileTo} | morningBurdenPrior | priceLevel/priceFlexibility | motionSicknessProneness | autonomyDegree | driverLoad(car/rental のみ非 null) | accessibilityProfile{stepFree}
- **burden**: terminalBurden(GTFS pathway) | **baggageBurden(空間占有 +50-100%)** | morningBurden | physicalLoad | **driverFatigue(car/rental 固有・他 mode に無い)** | reliabilityBurden(PTI=95%ile/free-flow) | motionSicknessBurden | cognitiveLoad(transferCount) | crowdNoiseBurden
- **recovery**: restValue(寝台/グリーン/個室で横臥) | scenicRestoration(車窓/船景=受動回復) | autonomyRelief(時刻表解放) | solitudeBuffer(個室一人時間) | arrivalFreshness(door-to-door 総負荷の逆)
- **relational/temporal/hardConstraints/softPref**: §8 共通（accessibility:step_free/bikes_allowed/license:drivers_license/sobriety:no_drive_if_drinking/medical:motion_sickness/capacity:group_over_vehicle/operating:seasonal_suspension/seatType:no_overnight_sitting/medical:pregnancy_late_term の hard 群）
- **connectionDeps**: **★最重要: transport_mode は route_chain に依存**し firstMile/lastMile/transferCount を持つ | egress 非対称(lastMile=firstMile×3) | ホテル先行 ordering(荷物 drop) | 目的地並替(空港から最短) | mode 間 transfer 依存(飛行機→空港バス→電車) | reliability の chain 合成 | accessibility の chain 横断(施設内 step-free と到達経路は別物・ISO 21902)
- **novel>GPT**: ★mode/chain 分離原理解答 | egress 非対称 | baggageBurden 交互作用項 | role 逆転を mode 状態に内包(観光列車 transfer↔scenic) | subtype prior 継承 tree | object 間 ordering を mode 負荷が駆動 | reliability を PTI percentile で持ち FitContext と同 scale(FHWA) | **driverFatigue を car/rental 固有の新 burden 軸として独立(GPT の汎用 burden に無し)**

### §8.6 route_chain / connection（移動連鎖 = 横断層）

- **roles**: connection_composer | mode_arbiter(door-to-door) | transfer_edge(typed) | terminal_burden_carrier | last_mile_egress | ordering_dependency_carrier | reliability_modulator | accessibility_chain
- **subtype tree**: single_mode_direct[walk_only/single_rail_direct(中心直結 prior)/single_bus_direct/single_drive(駐車+渋滞)] | multi_leg_surface[rail_transfer_chain(in-station 5⇄min-time 2 で荷物分岐)/rail_plus_lastmile_bus(広島型)/mixed_rail_walk/park_and_ride] | air_inclusive[air_with_airport_access(広島逆転の典型)/air_direct_hub(羽田/伊丹型 egress 小)/air_plus_rail_egress(成田 SkyAccess)/island_air_only] | ordering_dependent_chain[hotel_first_dropoff/destination_reorder/airport_shortest_path/luggage_locker_chain(宿非依存)] | accessibility_constrained_chain[step_free_required/level_boarding_required/minimal_transfer/assistance_dependent]
- **richAttr**: legComposition{firstMile/mainLeg[]/lastMile} | transferEdges{transferType 0/1/2} | terminalBurden{securityCheckOverheadMin} | baggageBurden{spatialOccupancy} | lastMileEgress{egressMode/egressMin/egressWeight} | airportToCenterBurden | stationToHotelBurden | hotelDropoffOption{earlyCheckIn} | arrivalToDestination{directnessAfterArrival} | destinationOrderImplications{sequencingState/reorderable} | reliability{planningTimeIndex} | waitBuffer{interLegSlackMin/tightConnection}
- **burden**: `doorToDoorTotalBurden = Σ(leg_time × inVehicle weight) + ...`（§4 合成関数） | terminalBurden | baggageBurden(非線形) | transferBurden(回数でなく型: min-time/timed=遅延接続 risk) | egressBurden(access の 3 倍非対称) | waitBufferBurden(乗換待ち≒in-vehicle 1.7倍) | reliabilityBurden(PTI/Buffer Index) | morningBurden
- **recovery**: scenicLegRecovery(車窓/フェリー/ロープウェイ) | lowTransferRestValue(直行/in-seat) | seatComfortRecovery | bufferSlackRecovery(余裕設計=焦りなし) | arrivalFreshness(egress 軽い=到着時消耗少)
- **relational/temporal**: §8 共通（group は least-misery=最も移動制約/荷物多/負荷耐性低い participant に合わせる）
- **hardConstraints**: accessibility:step_free_required(各ノード AND 連鎖) | level_boarding_required | no_stairs | assistance_unavailable | mobility:max_transfers/max_walk_exceeded | reliability:hard_deadline_at_risk(PTI で red_line) | budget:over_hard_ceiling(egress タクシー)
- **softPref**: fewer_transfers(型指定: in-seat/in-station) | scenic_leg | center_direct(egress 最小・広島問題の選好側) | seat_guaranteed | short_door_to_door | high_reliability | avoid:early_morning/airport_security | luggage_light_after_checkin(hotelDropoff) | wide_buffer
- **connectionDeps**: lodging 先行依存(hotelDropoffOption) | destination 並替依存(総 egress 最小) | 空港から最短経路推論 | transfer edge=object 間関係(route_chain は独立 object でない) | reliability 上流依存(weatherSeverity/crowd→PTI) | 荷物 base 依存(luggage_locker/宅配) | accessibility chain の連続性依存(一点でも not/unknown→全体 not) | **solver(HOLD) への引渡し**(route_chain facet は rank/place せず door-to-door burden を返すのみ)
- **novel>GPT**: ★連結を category から外す原理解答(GTFS) | egress 非対称重み(access の 3 倍) | door-to-door 総負荷の非 opaque 公開写像(transfer_penalty≒18分) | 型付き transfer ノード(回数でない・GTFS transfer_type) | baggageBurden 交互作用項 | ordering/dependency を route_chain facet が担う | reliability を PTI percentile で(平均所要前提でない) | accessibility を value-chain AND 連鎖で(ISO 21902・wheelchair boolean 1 個発想でない)

### §8.7 area / neighborhood（エリア・街）

- **roles**: container(含有 object) | transit hub/connection node | ambience/stay 環境 | area anchor/destination | luggage base/staging | recovery anchor
- **subtype tree**: base_area[central_business_district/mixed_residential/resort_base/compact_walkable_old_town(石畳坂道)] | transit_area[major_terminal/interchange_node/gateway_to_region(egress×3 の源)] | food_area[izakaya_yokocho/gourmet_district/market_food_street/local_eats] | quiet_area[residential_calm/nature_adjacent/temple_contemplative] | nightlife_area[entertainment_district/redlight_adjacent(safetyPerception 個人差大)/late_night_food_bar] | sightseeing_center[historic_core/cultural_museum_quarter/scenic_cluster/theme_zone] | onsen_town[traditional_resort/hot_spring_village_secluded(hitou)/modern_resort_town/day_use_cluster]
- **richAttr**: accessCentrality{rail/subway lineCount} | walkabilityProfile{walkScore/stairSlopeIndex} | crowdNoiseProfile{byTimeBand} | safetyPerception{daytime/nighttime 分離・体感} | containerDensity{lodging/food/sight count band} | ambienceTrait→Layer1(quietLively/natureUrban) | stagingViability{coinLockerAvail/earlyCheckinNorm} | onsenAnchorProfile?(onsen_town のみ){sourceCount/dayUse} | accessibilityProfile{stepFreeStreetLevel} | reliabilityProfile{accessPTI}
- **burden**: accessBurden | stairSlopeBurden(old_town) | crowdNoiseBurden | baggageStagingBurden | nightSafetyBurden(nightlife/redlight) | weatherFragility | navigationComplexity(major_terminal 駅内迷い) | sensoryOverload
- **recovery**: areaRestValue(quiet/onsen_town) | onsenAnchorRecovery | natureProximityRecovery | stimulationRecovery(歓楽街/food_area) | walkableDecompression | lowCrowdRecovery(オフピーク)
- **relational/temporal**: §8 共通（onsen_town は冬 restValue 増・nightlife は昼閑散夜 peak の時間帯依存が核）
- **hardConstraints**: accessibility:no_stairs/wheelchair(GTFS 3値) | tattoo(onsen_town 文脈・観光庁3類型) | 営業時間/季節休 | car_required area(秘湯) | **budget は hardConstraint 化しない(T11 §5.2 INVARIANT)**
- **softPref**: walkability | 静けさ(quietLively) | localPolished | photogenic | 夜の賑わい(nightOwl×nightlife) | 温泉密度(onsen_town) | access 利便(中心直結)
- **connectionDeps**: ★ホテル先行(area 内 lodging→荷物 drop→徒歩圏 place→夜 food) | 目的地並替(crowd 時間帯) | 空港→中心最短(area=gateway の egress×3) | route 接続(area 間=AccessChain) | **onsen facet 委譲(onsen_town の泉質/掛け流し/tattoo は含有 lodging/day-use に委譲)** | group 集合(area=base が集合 hub)
- **novel>GPT**: ★area を「container object」として定式化(状態を平均でなく含有 object 統計で) | categorization 原理解答(温泉街は area category で onsen-anchor facet を含む) | connection を area 間関係で持ち独立 category 化しない | object 間 sequencing/dependency を area が担う | subtype→sub-subtype prior 継承 tree | **safetyPerception の昼夜分離+体感(perception)明示(犯罪統計断定でなく footTrafficNight/litLevel proxy)** | crowd を burden 軸と trait 軸の二面で持ち二重計上回避 | recovery 符号反転の個人差(同一歓楽街が rest_to_recover に低・stimulation_to_recover に高)

### §8.8 activity_event（アクティビティ・イベント）

- **roles**: experience_core | seasonal_anchor | recovery_experience | thrill_experience | learning_experience | social_occasion | spectacle_view | filler_micro | lodging_attached
- **subtype tree**(二軸直交): experienceSystem(学び/スリル/癒し) × occurrenceType(常設/季節/祭/限定)。outdoor_active[water系(swimming hard-block)/mountain系(stairSlope veto・冬限定)/sky系(年齢体重 hard・weather 即中止)/ground系] | creative_workshop[craft/culinary(allergy hard 接続)/art/performance(cultural)] | guided_tour[walking/vehicle(transport facet 重複)/nature(夜間固定)/immersive(最少人数)] | seasonal_nature[bloom(season hard-window 数日〜2週・confidence 低)/snow/celestial(時間帯+天候+季節 三重 gate)/phenomenon(時刻精密)] | festival_matsuri[procession(crowd 最大・場所取り)/fire(花火・夜・場所取り数時間)/ritual/cultural_perform(予約席)] | entertainment_facility[thrill_park(年齢身長 hard)/family_park/indoor(天候避難先 facet)/show(予約席)] | limited_popup[exhibition(会期 hard-window)/collab/light_event/market(曜日時間帯固定)]
- **richAttr**: experienceSystem | occurrenceType{always/seasonal/festival_fixed} | typicalDurationMin | bookingRequirement | reservationLeadTime{same_day/days/weeks/months} | cancelPolicy | physicalLoad{intensity 1-5} | ageSuitability | bodyRequirement{swimming/weightLimit} | weatherDependency | seasonWindow{hardWindowStart} | timeOfDayBest{nightOnly} | groupSizeConstraint{minParticipants} | crowdProfile | dietaryProfile | accessibilityProfile | learningDepth | photogenicStyle
- **burden**: physicalLoad.intensity/stairs/slope/sustained | weatherDependency | crowdProfile.peakBands(祭/花火) | queue/spotReservation 待機 | timeOfDayBest mismatch | durationLoad(所要過多) | booking/cancel 心理 burden | sensoryLoad
- **recovery**: restValue(温泉体験/森林浴/座禅/陶芸没入) | stimulationRecovery(運動爽快/達成感) | achievementValue(登頂/完成品/技能) | aweValue(絶景/オーロラ/壮大な祭) | socialReplenishment(祭の一体感) | flowImmersion | **★recovery は負号もとる(同一体験が fatigueSpike 高 user には負荷)**
- **relational**: romance(二人完結) | family(年齢適性が支配) | friends(thrill/competition 高) | colleagues(安全側・過度な親密回避) | solo(soloAllowed=false で hard-block・最少催行人数) | **★relational×crowd 交互作用(romance は群衆で value 低)**
- **temporal**: **全カテゴリ中 temporal 依存が最も支配的**。①season: seasonWindow.hardWindow で成立可否が binary 化(桜=2週・花火=暦1日)・yearVariability 高は confidence 本質的低下=断定不可 ②timeOfDay: nightOnly
- **hardConstraints**: 年齢(minAge/maxAge・バンジー18未満/酒造20未満) | 身体(swimming 必須×非泳者/weightLimit/fitnessLevel) | accessibility(wheelchair=no) | アレルギー(料理教室/試食) | dietary(red_line) | 営業/開催(festival_fixed_date×日程不一致) | 催行最少人数 | 天候中止(cancelOnWeather×weatherSeverity)
- **softPref**: experienceSystem | learningDepth | photogenicStyle | typicalDuration×visitDurationBudget | timeOfDayBest×morningness/nightOwl | bookingRequirement 緩さ | host 付帯形態 | crowdProfile×crowdTolerance | achievementValue/aweValue×回復スタイル | cancelPolicy 柔軟性
- **connectionDeps**: **★temporal occupancy(時間占有依存・chunk で時間を確定占有)** | **★seasonal_anchor 逆転依存(季節/暦固定 object が旅程日付を規定し他 object が従属する逆方向 ordering)** | 予約順序依存(reservationLeadTime=months は先行確保) | place/lodging 併設依存 | weather contingency 依存(T7 rain 代替へ接続) | crowd 待機の前後依存(場所取り時間を直前 node として要求) | 同日複数 thrill 不可依存(fatigue 蓄積 veto)
- **novel>GPT**: experienceSystem×occurrenceType 二軸直交 subtype tree | **★temporal gate 昇格原則(他カテゴリで modulator の FitContext が本カテゴリでは成立可否の gate)** | recovery 符号反転動態(FitContext.todayFatigueSpike で動的切替) | 待機 burden 独立計上(場所取りを参加前消耗として・crowd を参加中/観覧待機 2 成分に分解) | seasonal_anchor 逆転依存 | host facet 両建て(温泉と同型に standalone と lodging/place 付帯 amenity の両建て) | bookingRequirement×cancelPolicy の心理 burden(ReversalCost) | **safety hardConstraint の missingData 安全側規約(年齢/身体/アレルギー/アクセシビリティ未確認時を「満たさず」扱い・false negative=見落とし禁止)**

### §8.9 support_reservation（支援・予約適格性）

- **roles**: luggage_relief | physiological_relief | supply_relief | cash_relief | connectivity_relief | rest_relief | information_relief | medical_relief | reservation_gate | ordering_anchor
- **subtype tree**: luggage_storage[coin_locker/manned/hotel_luggage_dropoff(★ordering_anchor の核)/delivery_service(手ぶら観光)/station_locker_app(予約 facet 交差)] | toilet_facility[public/multipurpose(accessibility facet)/nursing_room/commercial_borrowable] | convenience_supply[konbini(multi-relief: supply+cash+toilet+一部 medical)/drugstore/supermarket/kiosk] | cash_access[bank_atm/konbini_atm/currency_exchange/ic_charge] | connectivity_point[public_wifi/sim_esim/charging/coverage_note] | rest_spot[bench_plaza/rest_cafe(食でなく rest facet・滞在許容度が状態)/station_waiting/lounge_paid/shelter_indoor(weatherFragility 緩和)] | info_point | medical_point[pharmacy/drugstore_otc/clinic_reference(参照のみ・受診は範囲外)/first_aid] | reservation_lodging[instant/request_confirm/phone_only/season_locked] | reservation_dining[walk_in/recommended/required/referral_or_members(実質 block)] | reservation_activity[open/timed_entry(順序制約 strong)/capacity_limited/seasonal_lottery] | reservation_transit[free_seating/reserved_seat/limited_express_pass/pass_or_ticket_book]
- **richAttr**: reliefAxis | reliefValue | availabilityDensity | operatingWindow{is24h Observed} | accessibilityProfile{stepFree 3値} | cleanlinessHint | stayTolerance | **multiReliefBundle: reliefAxis[]（コンビニ=supply+cash+medical+toilet）** | reservationDifficulty{open/recommended/required/members_only} | cancelFlexibility{free/partial_fee/no_refund} | necessity{optional/recommended/required/trip_critical} | timedConstraint{hasTimedEntry} | cashRequiredHint | qualityProxy{source: tabelog/michelin/editorial} | provenance/confidenceByField(Layer6 継承)
- **burden**: absenceFriction(support が「無い」ことで増える負荷) | detourBurden(寄り道) | operatingWindowMiss(深夜 ATM 停止) | reservationFrictionBurden(phone_only) | reservationFailureRisk(capacity/lottery) | cancelRigidityBurden(no_refund) | baggageInteractionBurden | cashShortfallBurden | medicalShortfallBurden | orderingConstraintBurden(timed_entry)
- **recovery**: microRecoveryValue(rest_spot/カフェ/ラウンジ) | frictionRemovalValue(ロッカーで荷物を降ろす) | anxietyReductionValue(情報案内/Wi-Fi/ATM) | physiologicalReliefValue(トイレ/授乳室) | provisioningSecurityValue(コンビニ/薬局/現金確保) | reservationCertaintyValue(確保安心) | weatherShelterValue(雨天屋内退避)
- **relational/temporal**: §8 共通（solo は support が最も生命線=誰も荷物番できない／繁忙期で reservation difficulty 全 subtype 上昇）
- **hardConstraints**: accessibility:no_stairs/wheelchair/multipurpose_toilet_required | physiological:toilet_proximity_required(IBS/妊娠後期/人工肛門) | medical:pharmacy_access_required | allergy:emergency_med_access(アナフィラキシー既往) | cash:cash_only_destination×ATM_unavailable(支払い不能 block) | reservation:trip_critical_unsecurable | reservation:referral_or_members(一見お断り) | operating:venue_closed_in_window | nursing:infant_facility_required | accessibility:elevator_required(ベビーカー/車椅子)
- **softPref**: luggage:prefer_locker_near_station/prefer_hotel_dropoff | supply:prefer_konbini_density | cash:prefer_cashless_route | connectivity:prefer_own_data | rest:prefer_frequent_breaks/quiet_cafe/paid_lounge_comfort | information:prefer_self_navigation | reservation:prefer_flexible_cancel/advance_secure/walk_in_freedom
- **connectionDeps**: lodging 先行→luggage_dropoff→目的地並替 | reservation_transit 最終便→一日の終端固定 | timed_entry 券→周辺 object 並替 | luggage_relief→high-walk place 成立 | cash_relief→現金必須 object 成立 | connectivity_relief→reservation 確認連鎖 | information_relief→他 relief gateway | rest_relief→fatigue 蓄積後の place 成立
- **novel>GPT**: ★support を独立 category に昇格させず reliefAxis 上の「摩擦緩和 facet」として attach(GTFS) | reservation を booking 実装でなく「予約適格性 3 軸状態(difficulty/cancelFlexibility/necessity)」で持つ | ordering_anchor を独立 facet 化(宿/timed_entry/最終便/開店閉店 が sequencing を制約) | **burden の鏡像としての reliefValue(absenceFriction を下げる量=負号)** | multi-relief bundle(コンビニ一点で複数 reliefAxis) | baggageBurden を terminal/階段×混雑の交互作用項として設計し luggage_relief が区間限定でこの非線形項を消す | egress 非対称(last-mile support に高価値) | **support の失敗様式(欠落=摩擦増 soft)と reservation の失敗様式(不可=block 化 hard)の非対称を明示**

---

## §9 GPT を超える 8 点（証明）

1. **connection 独立 category 化を否定** し全対象横断 edge 層へ。GTFS/ISO 21902 実証で裏付け（GPT は研究の落とし穴に的中）。
2. **facet=(object×role) の浅い列挙を深化**: facetKind は全対象共通有限 union + 同一 object が複数 slot を競う + 1 slot を別 category object が横断で埋める bipartite matching へ。
3. **GPT 欠落の branch 深度**（subtype→sub-subtype prior 継承 tree = Layer0.25 SUBTYPE_TREE）を追加し低 confidence entity の fallback 継承を型化。
4. **GPT 欠落の object 間 dependency/ordering**（luggage_drop_enables/reorderable/derive_shortest_from_terminal）を ConnectionState 状態 carrier で担い itinerary 実装と分離。
5. **categorization 問題（温泉はどこ）に原理解答** = 「所属でなく facet 集合の共有」。3 実在 taxonomy（Google Places/OSM/JTB）一致で正当化。GPT は多 facet 列挙のみで原理が無い。
6. **door-to-door 合成を非 opaque 公開写像化**: egress 非対称（lastMile=firstMile×3）+ terminal×荷物交互作用 + PTI 信頼性の研究実証重み。GPT は対称 firstMile/lastMile。
7. **温泉状態を標準化済語彙で host-agnostic 共有ブロック化**: 環境省 10 泉質×泉温×液性×浸透圧×掛け流し confidence×タトゥー観光庁 3 類型（発明でなくグラウンディング）。
8. **全てを「category 別 matrix」でなく「単一多層 StateEntity のインスタンス + facet 射影」に統一** し user/entity 対称 24 軸で 1 エンジン化。

---

## §10 拡張性原則 — 無限列挙の罠を回避（CEO/GPT/研究 3 者一致）

1. **有限 core union**: subtype は schema.org LodgingBusiness 7 型を最上位 union。Google Places 180+型/OTA 数百型は「Layer0.75 category-rich の値域カタログ」として **参照に留め直写しない**（Places 飲食だけで 200 超→膨張回避）。
2. **拡張は 4 手段のみ・他層不変（全て additive）**: ①新 subtype 追加（SUBTYPE_TREE 子ノード）②新 facetKind 追加（FacetSet union）③新 category-rich field 追加（discriminated union branch）④新 FitContext modulator 追加。既存 fit 写像を破壊しない。
3. **未知の受け止め**: 全 field が `Observed<T> | {value:null; confidence:0; reason:"unobserved"}` で欠損を型区別。欠損 component は overall 合成除外 + 残 weight 再正規化（欠損 ≠ 不適合）。subtype 未知 → SUBTYPE_TREE 親 prior へ fallback + confidence 減算。
4. **将来全 category 受容**: Layer0 category は現状 5（lodging/place/food/transport/route）+ connection 横断層。新 category（event/wellness/shopping…）は同一多層スキーマのインスタンスとして同型追加 = **エンジン分岐ゼロ**。
5. **provenance/confidence/missingData を全層必須**: 「不確実なまま動く」を保証。価格・本物度・予約可否を断定せず状態のみ保持（guardrail 厳守）。

---

## §11 guardrail / 不変条件（T11 計画書 §8 と整合）

- **pure logic only**: 型と決定論写像の設計のみ。実 API/scraping/booking/route/weather API/price 断定/空室断定/実時刻断定 = **一切なし**。
- **additive・未配線**: T1〜T10 を変更しない。本書は docs。実装時も既存 fit 写像を破壊しない。
- **断定しない**: 掛け流し度・品質・予約可否・価格は `Observed` の confidence/provenance で持ち boolean/数値断定しない（公取委/国民生活センター 係争域の認識）。
- **安全側 missingData**: allergy/dietary/accessibility/年齢/身体 の **未確認は「満たさず」扱い**（false negative=見落としが命に関わる）。外食はアレルゲン表示義務外（消費者庁）を内蔵。
- **budget INVARIANT**: budgetFit 単独は blocked にしない（user 供給 red_line 超過のみ）。
- **private 非漏洩**: relationship 非対称認識は隠蔽。連続量の差分も `toSharedFitView` 二層で漏らさない（要素削除）。
- **non-opaque**: gate-first 2 段（veto floor → bounded compensatory）の weight/threshold を export。door-to-door 合成式・group 集約式を公開写像化。
- **authority 境界**: fit は scoring/説明のみ。**実行権限を一切生成しない**。route_chain facet は rank/place せず door-to-door burden を返すのみ → **solver(HOLD) が並べる**。

---

## §12 必須 golden tests（T11-D 実装時の受け入れ条件）

| # | 検証 | 期待 |
|---|---|---|
| 1 | **温泉 facet 射影** | 同一 OnsenState が ryokan(lodging Facet)/日帰り(day_use Facet)/温泉街(area_anchor Facet) に attach され category 昇格しない |
| 2 | **広島 door-to-door 逆転** | airChain(egress 50min×3) vs shinkansenChain(中心直結) で burden 合成が逆転（in-vehicle では飛行機速いのに） |
| 3 | **egress 非対称** | lastMile weight = firstMile weight × 3 が決定論で効く |
| 4 | **baggage 交互作用** | baggageBurden が terminalBurden×混雑 で非線形に増幅（単独 scalar でない） |
| 5 | **ホテル先行 ordering** | luggage_drop_enables 後の後続 leg baggageBurden=0 に modulate |
| 6 | **目的地並替** | reorderable destination 群の各並び総 burden を決定論計算し least-burden を返す（placement しない） |
| 7 | **subtype prior 継承** | subtype 未知 → SUBTYPE_TREE 親 prior fallback + confidence 減算 |
| 8 | **同一 object 複数 slot 競合** | 旅館が luggage_base/recovery/dinner_destination slot に同時 candidate・各 slot で別 facet 発火 |
| 9 | **category 横断 slot 充足** | recovery slot を温泉(place)/旅館(lodging) が横断競合 |
| 10 | **hard constraint veto** | tattoo prohibited × user フラグ / allergy 未確認 → veto floor（excellent 出さない） |
| 11 | **temporal gate 昇格** | activity_event の seasonWindow.hardWindow 外 → 成立不可 binary（他カテゴリでは modulator） |
| 12 | **recovery 符号反転** | 同一歓楽街/体験が rest_to_recover に低・stimulation_to_recover に高 |
| 13 | **provenance 不変** | source 多寡は confidence のみ変え overall 数値不変 |
| 14 | **private 非漏洩 canary** | relationship 非対称・連続量差分が shared view に出ない |
| 15 | **authority literal** | FitResult.authoritative=false / route_chain は burden 返すのみ・rank/place しない |
| 16 | **欠損≠不適合** | 欠損 component 除外 + 残 weight 再正規化（penalty にしない） |
| 17 | **決定論** | 同一入力 → 同一出力（tie=facetKind/placeRefId localeCompare） |

---

## §13 自己適用した 3 レンズ検証（Verify/Synthesis が rate-limit 失敗のため著者が手動適用）

workflow `w46trh44k` の Verify(3 レンズ)+Synthesis は service 混雑（rate-limit）で失敗。落ちた 3 レンズを本書著者が自己適用：

### レンズ A: CEO 完全性（「旅行に関する全てのもの」を網羅したか）
- ✅ 宿・温泉・観光地・飲食・移動・移動連鎖・エリア・アクティビティ/イベント・支援/予約 = **9 カテゴリ**を網羅。
- ✅ CEO の明示的問い全てに直答: 温泉 categorization(§2)・飲食店状態(§8.4 深掘り)・飛行機の隠れ負荷/広島 door-to-door(§4)・ホテル先行荷物問題(§7)・ニューロン多層分岐(§6)・目的地柔軟並替/空港最短(§7)。
- ⚠️ **未カバー（意図的・MVP 外を明記）**: 国際線(出入国審査)・MVP 外移動(trolleybus/car_with_driver/jetfoil 詳細)・shopping/wellness 独立 category = §10 の同型追加で吸収（エンジン分岐ゼロ）。

### レンズ B: GPT 優越（GPT に有無を言わせないか）
- ✅ §9 の 8 点が GPT の **誤り（RouteChain 独立 category 化）を研究グラウンディングで反証**し、GPT 欠落（branch 深度・object 間 ordering・categorization 原理・egress 非対称）を全て埋めた。
- ✅ GPT の正しい方向（multi-facet/有限 MVP union）は採用しつつ、**形式化の浅さ**（facet=(object×role) を bipartite matching へ・facetKind を全対象共通 union へ）を超えた。

### レンズ C: guardrail（pure/additive/断定しない/安全側/authority）
- ✅ §11 で全 guardrail を明示。実 API/booking/price 断定なし・未確認は「満たさず」・private 非漏洩・authority 境界・budget INVARIANT。
- ✅ 係争域（掛け流し度・品質 proxy）を boolean 断定せず confidence/provenance 化。医療判断しない安全境界（適応症/禁忌症は表示有無の provenance のみ）。

---

## §14 T11-B/C/D への接続（実装は CEO 承認後）

本書は **オントロジー/値域カタログ**。実装は次の通り（CEO GO 後）：

- **T11-B**: `fit-types.ts` に StateEntity/Facet/FacetKind/ConnectionState/AccessLeg/TransferNode/OrderingConstraint/SUBTYPE_TREE 型を **有限 MVP union** で起こす（本書の値域カタログを正規化）。
- **T11-C**: `fit-core.ts` に facet projection・slotFacetMatching・door-to-door burden 合成・gate-first deriveFitLabel を pure 実装（public export 4-5 symbol のみ）。
- **T11-D**: §12 の golden tests（17 件）。
- **未着手（HOLD）**: solver(placement)・実 entity 検索・M2 runtime・Plan Intelligence・UI。

> **CEO 判断請求**: 本オントロジー（9 カテゴリ・統一 StateEntity・facet 射影・connection 横断層・door-to-door 合成・ordering carrier・8 点優越・拡張性原則）を承認するか。承認後 T11-B/C/D を個別計画（broad roadmap 作らない）。

---

## 出典グラウンディング（発明でなく実在標準に接地）

- **GTFS Schedule Reference** — transfer_type 0-5 / route_type / location_type / pathways pathway_mode / wheelchair 3値: <https://gtfs.org/documentation/schedule/reference/>
- **schema.org** — LodgingBusiness/Accommodation/FoodEstablishment/TouristAttraction/LocationFeatureSpecification/additionalType: <https://schema.org/LodgingBusiness>
- **Google Places API place types** — lodging/food(cuisine×format)/wellness(public_bath・onsen 無し): <https://developers.google.com/maps/documentation/places/web-service/place-types>
- **OpenStreetMap** — amenity=public_bath + bath:type=onsen + natural=hot_spring 多タグ: <https://wiki.openstreetmap.org/wiki/Tag:amenity=public_bath>
- **旅館業法**（2018 改正・3 営業種別）: <https://www.mhlw.go.jp/content/11130500/001166334.pdf>
- **温泉法 + 環境省 鉱泉分析法指針**（療養泉 10 泉質・25℃/泉質基準）: <https://www.env.go.jp/nature/onsen/docs/shishin_bunseki/01.pdf>
- **観光庁 タトゥー対応ガイドライン**（2024・3 類型）: <https://www.mhlw.go.jp/content/11130500/001367826.pdf>
- **JTB 全国観光資源台帳**（24 資源タイプ・温泉=独立人文資源で宿泊除外）: <https://tabi.jtb.or.jp/about/type/>
- **食品表示法**（特定原材料 8 + 推奨 20 = 28・外食は義務外・消費者庁） / **EU FIC 1169/2011**（14 allergens） / **Codex Big-8+sesame**
- **ISO 21902:2021** Accessible tourism for all（value-chain 物理アクセシビリティ）: <https://www.iso.org/standard/72126.html>
- **FHWA Travel Time Reliability**（PTI=95%ile/free-flow・Buffer Index）: <https://ops.fhwa.dot.gov/publications/tt_reliability/ttr_report.htm>
- **不効用重み実証**（待ち×1.7・徒歩×1.65・乗換≒18分・egress≒access×3・荷物空間占有 +50-100%）: ITF/OECD・ScienceDirect meta
- **V-Label / Vegan Society / GSO 2055 halal** — diet hardConstraint 値域
- **広島 door-to-door 実態**（鉄道:航空=68:32・3-3.5 時間の壁）: 東洋経済・ITmedia
