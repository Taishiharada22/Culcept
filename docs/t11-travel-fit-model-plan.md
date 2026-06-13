# T11 計画書 — Travel Fit Model / State Matching（pure）

**作成日**: 2026-06-12 / **ステータス**: **計画/設計のみ・実装なし**（CEO プロセス: phase ごと最小計画→監査→承認後実装）。
**前提**: Travel pure engine T1〜T10 完成。本書は **M1 Travel Trait Space**（`travel-mode-plan-os-extension-design.md` §M1・user×entity 同一 24 軸）の本格 formalization + entity 多層化 + fit。
**レビュー反映**: 8 レンズ敵対的設計レビュー（62 findings・verdict=proceed_with_additions）の must/should を統合済み。閉じた致命的欠落: FitContext 型未定義 / fitLabel 導出未定義（opaque 混入）/ private 連続量の差分漏洩 / entity 状態の 24→7 軸縮退 / hard constraint(allergy 等) 欠落 / group 集約式未定義 / FitLabel 名前衝突。
**スコープ**: docs-only。実装は CEO 承認後 T11-B/C/D bundle。

---

## §1 前提を疑う — T11 = Fit Model で正しいか

| 候補 | pure | いま作る価値 | 判定 |
|---|---|---|---|
| A itinerary skeleton / 抽象 DAG | △（entity なしで空枠） | 低（entity を埋めるに fit が要・solver が作り直す） | 後 |
| B solver preflight | △ | 低（solver/places HOLD・fit が前提） | 後 |
| C T2 normalizer + T9 cleanup | ✅ | 低（polish・sub-scope） | 後 |
| D more after-action | ✅ | 低（T10 で十分） | 不要 |
| **★ T11 Fit Model / State Matching** | ✅（状態 + 決定論 fit・fixture entity 検証） | ★**最大の製品 gap・差別化の核** | **採用** |

**推奨採用**。理由: 初回 CEO 構想 core（状態を計算可能化し近い状態を引き寄せる）、競合 gap(d)「性格 state×宿/場所のなぜ合うか」は未出荷、**plan 生成器→現実マッチング OS** への転換、pure 実現可。
**訂正（レビュー）**: 「T10 学習×マッチの相乗」は T11 採用の即時根拠から**将来価値へ降格**（後述 §2 の T10 境界。AfterActionDeltaPayload は slot デルタのみで FitUserState trait/role に未到達＝T10→fit ループは型レベルで断線。橋渡しは T12 候補）。

---

## §2 定義

- **purpose**: ユーザー/グループ状態と旅行対象の**多層状態**を決定論で fit/mismatch/risk + 説明に変換する pure 層。
- **product value**: 「あなたの状態だからこの宿が合う/この観光地は合わない」を**説明付き**で出す（OTA の人気/条件一致を超える深さ）。
- **API**: `evaluateFit({ entity: TravelObjectState; subject: FitSubject; context: FitContext }): FitResult` / `evaluateFitBatch(entities, subject, context): FitResult[]`（placeRefId 安定 sort）/ `aggregateGroupFit` / `toSharedFitView`。全 pure・explicit。
- **authority**: fit は scoring/説明のみ。**実行権限を一切生成しない**（§5/§8 で構造担保）。
- **T9/T10/solver 境界**:
  - T3-T10 を**変更しない**（additive・独立 pure 層）。
  - T11 は after-action を**直接 consume しない**。FitUserState trait/role の更新（M2 / 新 delta kind 経由）は **T12 候補**（T11 スコープ外・provenance 構造のみ先に固める §3）。
  - 将来 **solver(HOLD)** が FitResult を consume して実 entity を itinerary に並べる（§4.5 型契約のみ）。
- **must not touch**: 実 hotel/flight/place 検索・scraping・price/空室断定・booking・route/weather API・永続化・M2 runtime・Plan Intelligence・UI・LLM・solver。

---

## §3 human / group 状態モデル（FitSubject + FitContext）

### §3.1 共通ラッパ（欠損 / 低確度 / 中立0 を型区別）
```
type FitProvenance = "explicit_user"|"form_input"|"profile_prior"|"relation_context"|"after_action"|"default_assumed";
type Observed<T> = { value: T; confidence: number /*0..1*/; provenance: FitProvenance; visibility: Visibility }
                 | { value: null; confidence: 0; reason: "unobserved" };
```
原則: 欠損 component は overall 合成から除外し残 weight 再正規化（欠損≠不適合）。source 多寡/人気は **confidence にのみ影響し overall 数値を変えない**（不変条件 §8）。

### §3.2 FitUserState（per participant）
- **負荷耐性（BurdenAxis・対称照合用）**: paceTolerance / mobilityTolerance / fatigueSensitivity / crowdTolerance / weatherTolerance / **stairSlopeTolerance**（M1「階段・坂負荷」軸対応）
- **時間**: morningness / nightOwl
- **資源**: budgetSensitivity / budgetBand?
- **選好（SharedTraitAxis・§4 Layer1 と同一軸で matchable）**: §3.4 参照
- **回復動態**: `recoveryStyle: "rest_to_recover"|"stimulation_to_recover"|"mixed"` / `overstimulationThreshold`
- **intendedRoles**: `IntendedRole[]`（entity を「何として扱うか」希望・§4 Layer2 と category 整合。各 `{ category, role, weight, confidence, provenance, visibility }`）★
- **★ hardConstraints（非交渉的・tolerance scalar から分離）**:
  ```
  interface FitHardConstraint { axis:"dietary"|"allergy"|"accessibility"|"medical"|"other"; descriptor:string;
    severity:"red_line"|"hard"; visibility:Visibility; provenance:FitProvenance }
  ```
  例 `allergy:shellfish` / `accessibility:no_stairs` / `dietary:vegetarian`。entity の対応 profile を侵せば §5 FitHardBlock で **fitLabel=blocked 強制**（trait 高でも上書き）。private hard constraint は authoritative fit に効くが shared では種別を出さず中立文のみ。

各 field は §3.1 `Observed<T>`。全 field に provenance 必須（後続更新可能な構造を先に固める）。relationship は per-participant に**置かず** group-level（§3.3）。

### §3.3 FitSubject
```
type RelationshipKind = "romance"|"family"|"friends"|"colleagues"|"solo";
type FitSubject = { kind:"solo"; user: FitUserState }
               | { kind:"group"; participants: { participantId:string; state:FitUserState }[]; relationship: RelationshipKind };
```
solo は内部的に participants 長 1 group へ正規化（§5 group 集約の最小ケース）。relationship 認識が participant 間で非対称な場合の隠蔽は §5。

### §3.4 SharedTraitAxis（user / entity 共通・M1 24 軸整合）
```
type SharedTraitAxis = "quietLively"|"natureUrban"|"classicTrendy"|"intimateSocial"|"minimalRich"
  |"calmStimulating"|"localPolished"|"noveltyFamiliar"|"aestheticPlain"|"onsenWaterQuality"|"photogenicStyle"|"learningDepth"; // …M1 4群を拡張
type TraitVector = Record<SharedTraitAxis, { value:number /*-1..1*/; confidence:number }>;
```
FitUserState と TravelObjectState.Layer1 が**同一 `TraitVector`** を持つ（M1 の対称共有空間＝「私たちって、そういう二人だったのか」の説明可能性の核）。traitFit helper は各軸 signedGap を返し、**user に在り entity に欠ける軸は distance 加算でなく confidence 減算**（非対称欠落の決定論扱い）。負荷耐性は trait でなく BurdenAxis（§3.2）で対称照合。

### §3.5 ★ FitContext（状態依存 modulator・CEO「細かく・状態依存」の核）
```
interface FitContext {
  tripMode: "daily"|"travel";
  tripIntent: "recovery"|"exploration"|"social"|"work"|"romance";
  season?: "spring"|"summer"|"autumn"|"winter"|"rainy";
  timeOfDayBand?: "early_morning"|"morning"|"midday"|"afternoon"|"evening"|"night";
  dayType?: "weekday"|"weekend"|"holiday";
  expectedCrowdLevel?: { value:number; confidence:number };
  weatherSeverity?: number;   // 0..1・★ T7 rain_or_weather と同一スケール・同一意味（将来二重定義しない）
  todayEnergy?: number;       // -1..1・base からの逸脱
  todayFatigueSpike?: number; // 0..1・★ T7 fatigue severity と同一スケール
  visitDurationBudgetMin?: number;
  budgetRedLine?: { maxHi:number; visibility:Visibility; ownerParticipantId:string|null };
}
```
**規約**: FitContext は disposition を一時 shift させる modulator。trait 値（fatigueSensitivity 等）は不変で、fit-core は `effectiveTolerance = baseTolerance − contextSpike*k` で当日値を導出。tripIntent は trait→component 寄与重みを変調（§5 importance）。**決定論入力・external lookup を一切起こさない**。user 状態の deep 源は M2(HOLD)・T11 は pure input。

---

## §4 旅行対象 状態モデル（TravelObjectState）— ★多層・最大限の状態

category 別 discriminated union + 共有 trait core。**全 field は `Observed<T>` 形**（confidence/provenance/visibility=entity は基本 shared）。

### Layer0 Identity（系統 lock）
`category: "lodging"|"place"|"food"|"transport"|"route"` + **subtype（category 別 as-const union・網羅 lock）**:
- LODGING_SUBTYPES = ryokan/business_hotel/resort/luxury/guesthouse/onsen_inn/boutique/capsule/minpaku
- PLACE_SUBTYPES = onsen/shrine_temple/art_museum/history_district/nature_park/viewpoint/shopping/foodie_street/theme_park/nightlife/contemplative
- FOOD_SUBTYPES / TRANSPORT_SUBTYPES / ROUTE_SUBTYPES …
- `SUBTYPE_TRAIT_PRIOR` / `SUBTYPE_ROLE_PRIOR`（as-const 写像）: 低 confidence entity で Layer1/2 欠落時 fallback + confidence 減算（例 business_hotel→{asWork:0.8, asBase:0.7}）。

### Layer0.5 ★ category-specific rich attributes（CEO 最重視・whyFits の実体）
discriminated union（各 field confidence 付き）:
- **lodging**: amenities(onsen/open_air_bath/sauna/private_bath)[] / onsenSpringType(simple/sulfur/bicarbonate/chloride/none) / mealStyle(in_room/dining/breakfast_only/none) / viewType(sea/mountain/garden/cityscape/none) / soundproofing / serviceStyle(attentive/standard/minimal) / accessStyle(walkable/shuttle/car_required) / dietaryProfile / accessibilityProfile
- **place**: experienceDensity / typicalDurationMin / seasonalPeak[] / timeOfDayBest[] / peakCrowdBands[] / photogenicStyle(nature/architecture/nightscape/food)[] / learningDepth / physicalLoad{stairs, slope, walkingKm}
- **food**: cuisine / dietaryProfile(allergens, vegetarian, halal …) / priceTier / atmosphere
- **transport/route**: mode / scenicValue / transfers / comfort

### Layer1 Shared traits（user 同一 `TraitVector`・matchable）
§3.4 の同一軸。traitFit はこの対称空間で計算。

### Layer2 ★ Role affinities（「何として扱うか」を entity 側で表現）
category 別 **Record（網羅強制）**:
- LODGING_ROLES = base/destination/recovery/romance/work/view_experience
- PLACE_ROLES = main_highlight/filler/photo/culture_learning/relaxation/active/social_hangout/solitude
- FOOD_ROLES = celebration/refuel/local_discovery/casual_meal/social_gathering
- TRANSPORT_ROLES = transfer/scenic_experience / ROUTE_ROLES = efficient/wander
`roleAffinity: Record<LodgingRole, {value:0..1; confidence}>`。fit は **user.intendedRole × entity.roleAffinity[role]** を主項（§5 roleFit）。

### Layer3 Burden/risk（user 耐性と対称写像 + importance）
travelBurden / morningBurden / weatherFragility / crowdNoise / priceLevel / priceFlexibility / cancelRisk / physicalLoad。
`BURDEN_TOLERANCE_MAP: Record<EntityBurdenAxis, UserToleranceAxis>`（travelBurden→mobilityTolerance, morningBurden→morningness, crowdNoise→crowdTolerance, weatherFragility→weatherTolerance, physicalLoad.stairs→stairSlopeTolerance）。burdenFit = Σ penalty(entityBurden, userTolerance)。

### Layer4 Recovery/energy
restValue / energyRequired。recoveryFit = restValue × fatigueSensitivity（context.todayFatigueSpike で増幅）。

### Layer5 Relational suitability
`Record<RelationshipKind, {value:0..1; confidence}>`（§3.3 と完全一致キー: romance/family/friends/colleagues/solo/group）。relationalFit = entity.Layer5[subject.relationship]。

### Layer6 Provenance/confidence
`sources: { kind:"explicit_user"|"editorial"|"aggregated"|"inferred"; reliability:0..1; independent:boolean }[]`（citation 風・本文非複製）+ `confidenceByField`。confidence は source 数の単調増加だが**独立性割引・上限飽和**（`1−Π(1−reliability_i)`・相関 source は割引）。**source 人気/数は質に直結させず confidence にのみ影響**。

### §4.3 burden(entity) と T6/T7 risk の境界
Layer3 burden = per-ENTITY 固有（この宿/場所がこの user に負荷か・PRE-itinerary）。T6 ConfirmationReason / T7 ContingencyTrigger = per-DECISION/per-ITINERARY（POST-solver）。**fit-core は readiness-types/contingency-types を import しない**。weather_fragile(entity)→T7 rain_or_weather severity への feed は将来 solver/上位層で（同値でない）。

### §4.5 Solver consumption contract（HOLD・型のみ）
`EntityCandidate{ placeRefId; entity:TravelObjectState }` / `RankedEntity{ placeRefId; fit:FitResult; rankWithinRole }`。将来 solver は fitLabel+roleFit/burdenFit で TravelNode slot を `entity.placeRefId===node.place.placeRefId` で keying・blocked は hard-exclude。**T11 は rank/place しない**（FitResult を返すのみ。selection/placement は solver(HOLD) 所有）。FitResult は placeRefId を carry。

---

## §5 fit 出力（FitResult・非 opaque・gate-first）

### §5.1 grade（名前衝突回避）
```
ENTITY_FIT_GRADES = ["excellent","good","stretch","poor","blocked"] as const; type EntityFitGrade = …;
```
★ proposal-types.ts `FitLabel`(["fit","stretch","conflict"]) と**別軸・別名・re-export/alias 禁止**（fit-core は proposal-types から FitLabel を import しない）。

### §5.2 hard gate（blocked は score 合成の外）
```
interface FitHardBlock { reason:"red_line_violation"|"intended_role_unsupported"|"budget_over_hard_ceiling"|"hard_constraint_violation"; visibility:Visibility; ownerParticipantId:string|null }
```
evaluateFit は**最初に** hardBlocks を算出し非空なら fitLabel="blocked"（components は参考値として算出するが label 判定に使わない）。**INVARIANT: budgetFit 単独は blocked にしない**（常に [0,1] soft penalty として合成のみ）。予算超過の blocked は user 供給の `FitContext.budgetRedLine` 経由のみ（entity.priceLevel score 由来でない）。FitHardConstraint(allergy/diet/accessibility) 違反 → hard_constraint_violation で blocked。

### §5.3 components（透明・再構成可能）
```
interface FitComponent { key:"roleFit"|"traitFit"|"burdenFit"|"recoveryFit"|"relationalFit"|"budgetFit";
  valueShared:number; valueFull:number;  // 二層（private 由来は shared 射影で valueShared に差替）
  weight:number; contribution:number; compensability:"compensatory"|"partial"|"veto";
  available:boolean; signalBasis:"observed"|"inferred_from_trait"|"default" }
```
不変条件: `sum(contribution) == overall`（再構成可能性）。trait 推論のみ（全 observed 欠如）→ fitLabel は **good 止まり**（excellent は intendedRole+burden の observed/explicit 根拠を要求）。

### §5.4 deriveFitLabel（2 段・閾値/weight は export＝非 opaque）
```
FIT_WEIGHTS = { roleFit:0.4, traitFit:0.3, relationalFit:0.2, budgetFit:0.1 } as const;
FIT_LABEL_THRESHOLDS = { excellent:0.8, good:0.6, stretch:0.4 } as const;
ROLE_FLOOR=0.25;
```
- **Stage1 gate-first（non-compensatory veto）**: hardBlock 非空、または veto component が hardFloor（burdenFit<0.2 / relationalFit<0.15 / roleFit<ROLE_FLOOR）を割れば blocked/poor cap を強制（他軸で覆らせない）。← **WSM masking 防止**（歩けない人×高負荷を平均で打ち消さない）。
- **Stage2 bounded compensatory**: `comfortGate=min(burdenFit, recoveryFit)`、`affinity=weightedMean(FIT_WEIGHTS)`、`overall=affinity*(0.5+0.5*comfortGate)`。閾値で grade。poor = hardBlock 無し ∧ (overall<0.4 ∨ floor 抵触)。
- **欠損**: available=false は合成除外し残 weight 再正規化（`w_i/Σ available w`）。availableWeightSum<0.5 → poor に落とさず confidence='low' + missingDataQuestions。
- **labelStability**: confidence を最良/最悪に振って label が割れるか → `"stable"|"fragile"`。fragile な決め手 field は missingDataQuestion へ昇格。

### §5.5 importance（flat 足し合わせ回避・M1「軸 importance×confidence」整合）
`ROLE_AXIS_IMPORTANCE: Record<IntendedRole, Partial<Record<...,number>>>`（asRecovery→{restValue:1.0, soundproofing:0.9, onsenWaterQuality:0.8, photogenicStyle:0.1}）。overall は `Σ(component×importance×confidence)/Σ(importance×confidence)`（公開写像表＝非 opaque）。

### §5.6 group 集約（least-misery aware・式固定）
```
type GroupAggregationStrategy = "least_misery"|"fairness_sequential"|"average";
overallScore = LM*min(per.overall) + (1−LM)*mean(per.overall);
LM = clamp(0.5 + 0.4*max(fairnessSensitivity), 0.5, 0.9);  // 全員 undefined → 0.6
MISERY_FLOOR=0.30; if min<FLOOR → groupLabel poor 強制 + mismatchReasons {participant_below_floor, participantId, score}
```
`GroupAggregateFit{ overallScore; worstParticipantId; worstScore; floorBreached; strategy; usedStrategy; aggregateShared; aggregateFull; loweredByPrivate }`。N-ary（>2 対応・min/argmin・tie は participantId localeCompare）。複数 slot 入力は fairness_sequential（ledger 出力）。`GroupConflict{ traitOrRole; favoredParticipantId; sacrificedParticipantId; severity; visibility }`。
**T4 comparison fairness との二重計算回避**: fit は per-ENTITY 適合、T4 は提案間公平。境界明記（§4.3 同様）。

### §5.7 出力 + privacy 射影
`FitResult{ authoritative:false; fitLabel:EntityFitGrade; components:FitComponent[]; hardBlocks:FitHardBlock[]; mismatchReasons; riskFlags; rationale:ViewerScopedRationale; whyFits; whyMayFail; perParticipantFit; groupAggregateFit; conflicts; confidence; labelStability; missingDataQuestions; placeRefId; subjectKind }`。
- **★ FitResult.authoritative は構造的に false 固定**（実行権限の正本でない）。fit-core は `hasFitActionAuthority(r): false`（戻り型 literal false）を export。**packet-core の executionAuthority に fit が混入しないこと**を grep/import test で固定。
- **★ toSharedFitView（二層 + 要素削除）**:
  1. rationale = ViewerScopedRationale（core-types import・再定義禁止）・forParticipant={}。
  2. FitComponent: valueFull→valueShared 差替・**valueFull を shared 射影から構造除去**。
  3. mismatchReasons/whyMayFail/whyFits/missingDataQuestions は各要素 `{ visibility; derivedFrom:"shared"|"private"; owner }` を持ち **derivedFrom==="private" は配列から要素削除**（counts 化でなく削除＝descriptor 漏洩を断つ）。
  4. groupAggregateFit: aggregateShared/aggregateFull 二系統・private 由来 least-misery 引下げは shared で引下げ前値（loweredByPrivate は full 専用）・worst も private 由来なら shared 非露出。
  5. riskFlags 各 flag に visibility・private 由来（fatigueSensitivity 等）は shared 射影で除去。
- **rationale top-K**: whyFits/whyMayFail は寄与絶対値 sort で top-2〜3 のみ shared・tentative（低 confidence）根拠は hedge 強制・private 由来は「内部要因あり」に縮約。
- **no action authority**（§8 で構造担保）。

---

## §6 最小安全スコープ

| Scope | 内容 |
|---|---|
| **T11-A** | 本計画 + 契約確定（docs-only・本書） |
| **T11-B** | pure types（`fit-types.ts`: FitUserState/FitContext/TravelObjectState[Layer0-6 union]/FitSubject/FitResult/FitComponent/FitHardBlock/FitHardConstraint/EntityFitGrade/各 as-const enum/subtype/role/写像表 const）。**after_action 不要**（slot は T2B 既存） |
| **T11-C** | 決定論 fit helpers（`fit-core.ts`: traitFit/roleFit/burdenFit/recoveryFit/relationalFit/budgetFit/deriveFitLabel[gate-first 2段]/aggregateGroupFit/aggregateFieldConfidence/missingData/rationale + evaluateFit/evaluateFitBatch/toSharedFitView/hasFitActionAuthority）。**public export はこの 4-5 symbol のみ・内部 helper は module-private** |
| **T11-D** | golden tests（`travelFit.test.ts`・§7） |
| **T11-E** | closeout（decision-log + memory） |

各スコープ: allowed=新規ファイルのみ・forbidden=他層変更/runtime/fetch/DB/Date.now/random/M2/solver/API/opaque scoring。stop=tsc 55 増 / 非決定論 / privacy 漏洩 / runtime import。**T11-B/C/D は同 guardrail で bundle 可**。

---

## §7 想定テスト（golden）

**core fit**: quiet user×quiet lodging→excellent（trait+role）/ mobility-sensitive×high-walk(burdenFit≈0.1)→trait=0.9 でも overall<0.4=poor（**相殺されない**・naive weighted-mean なら誤）/ morning-weak×early transport→morning_burden / food-focused×meal-forward→上昇 / 境界値(0.79/0.80・0.59/0.60・0.39/0.40)4 本。
**gate/blocked**: wheelchair-inaccessible×high-trait→blocked(veto) / shellfish-allergy×seafood→blocked(trait 高でも) / no-stairs×stairs-only→blocked / red_line 違反 entity→blocked(component 全高でも) / 全 component 低だが hardBlock 無し→poor(blocked でない) / budget-sensitive×expensive・赤線なし→poor 寄りだが**blocked にならない** / 明示 budget 赤線超過→blocked。
**role**: ★ 同一 lodging を asBase vs asDestination 希望→fit 変化 / 同一 transport(観光列車) を transfer vs scenic_experience→roleFit 逆転 / intendedRole 未指定→最良 role 自動採用・決定論 / category mismatch→roleFit=0+role_category_mismatch。
**context 状態依存**: dynamicState 無し→good / todayFatigueSpike=0.8→burdenFit 低下→stretch / summer-rainy vs autumn-fine→weather_fragile flag 変化 / weekend-midday vs weekday-morning→crowdFit 変化 / FitContext undefined→baseline trait のみ決定論。
**entity rich**: onsenSpringType=sulfur×onsen 選好高→traitFit 上昇 & rationale に spring type 出現 / 同一 ryokan で trait 静寂 vs 賑わい→asRecovery fit 逆転 / asRecovery vs asViewExperience→支配 component が restValue→viewType に変わり rationale 変化。
**group**: P1 quiet×P2 lively×lively 寄り lodging→conflicts{favored:P2, sacrificed:P1}・sacrificed=worst / average 高だが 1 人 floor 割れ→groupLabel poor・floorBreached=true / 3 人 group で 1 人 poor→worst がその 1 人 / fairnessSensitivity 高 participant 追加→overallScore が min 寄りに下がる / solo→groupAggregate.overall===perParticipant[0].overall・conflicts=[]。
**confidence/欠損**: 24 軸中 1 軸低 confidence→fit confidence は大きく下がらない / burdenFit 欠損→burden 抜き再正規化で poor 回避 / 全 component 欠損→excellent にならず low confidence+question / **source 数だけ差→components.raw/overall/fitLabel 完全一致(confidence のみ差)** / confidence 振って label 割れる→labelStability='fragile'+missingDataQuestion('label_unstable') / 独立 source3 > 相関 source5 の confidence。
**privacy/authority(canary)**: private avoid 有/無 2 回 evaluateFit→toSharedFitView の components/groupAggregate を deep-equal で **private 差分が shared 数値に現れない（連続値 canary）** / private red_line 由来 mismatch に CANARY 注入→shared JSON に CANARY 非出現・full には出現 / private intendedRole=asRomance を含む group fit で shared JSON に 'romance'/'asRomance' 非出現・本人 viewer 射影にのみ出現 / private hard constraint 由来 blocked が shared で種別非漏洩 / **fitLabel=excellent 全 component=1 でも hasFitActionAuthority が false（型レベルで true 不可能）** / EngineOnly canary（assertNoEngineOnlyLeak）。
**source-agnostic/arch**: participantId のみ・source kind 非使用 / fit-core が readiness-types/contingency-types/proposal-types(FitLabel) を import しない / public export 4-5 symbol のみ / 決定論/冪等 / no fetch-API-DB-route-UI imports（grep）。

---

## §8 安全ルール + 不変条件

- 実 hotel/flight/place 検索・scraping・price/空室断定・booking・route/weather API・永続化・M2 runtime・Plan Intelligence・UI なし。
- **fit explainable（非 opaque）**: weight/threshold/importance/集約式を **export（正本可視）**・components 再構成可能。
- **gate-first**: blocked は score 合成の外の hard gate。budgetFit 単独は blocked にしない。
- **fit ≠ 実行権限**: FitResult.authoritative=false 構造固定・hasFitActionAuthority(): false・packet executionAuthority に fit 非混入を test で固定。
- **source→confidence のみ**: source 数/人気は component.raw/overall に一切寄与せず confidence にのみ影響・confidence は overall 数値を変えない。
- **private 非漏洩**: toSharedFitView の二層+要素削除（連続量差分逆算・group least-misery 引下げ開示・descriptor 焼き込みを構造的に塞ぐ。assertNoEngineOnlyLeak は branded のみ検出ゆえテキスト構造分離が必須）。
- **FitContext 決定論**: external lookup 起こさない・T7 と同一スケール（二重定義しない）。

---

## §9 出力 + CEO 判断請求

- **承認後 bundle**: T11-B + T11-C + T11-D を 1 commit（pure/additive/未配線/非 opaque/private 非漏洩/no authority）。検証: 新規 tests PASS・tsc 55 不変・full suite teed・purity/import/runtime importer grep 0・diff scope clean・tree clean・push なし。
- **実装しない**（本ステップは T11-A 確定のみ）。次 phase は T11 完了後に T12 個別計画。

### CEO 判断請求
1. **T11 = Travel Fit Model / State Matching** 採用で良いか（§1）。
2. **多層 entity 状態（§4: subtype 系統 + Layer0.5 category-rich + M1 24 軸 trait + role affinity + burden 対称写像 + importance）** の方向で良いか（CEO「最大限の状態・平均でなく細かく」反映）。
3. **fit は非 opaque（gate-first 2 段・weight/threshold export・veto floor）** 方式で良いか（§5）。
4. **hard constraint(allergy/accessibility)・FitContext 状態依存・toSharedFitView 二層・EntityFitGrade 改名・group 集約式** を T11-B/C に含めて良いか。
5. 承認後 **T11-B/C/D bundle 実装**の GO。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
