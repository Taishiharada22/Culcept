# T11 Travel Pure Foundation Closeout + Next Travel Branch Decision（Travel 純基盤凍結・次分岐・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: closeout + 次分岐判断のみ・実装なし（docs-only）。
**スコープ**: ★**本セッション = Travel Mode 専属**。Stargazer/平日 Plan 本流は**他セッション担当**ゆえ「戻る」選択肢に挙げない（**upstream 依存/HOLD gate としてのみ参照**）。next branch は Travel-only + アイデア積み増し。

## §1 Closeout summary（Travel 純基盤 = 完成）
| 層 | 成果 |
|---|---|
| T1-T10 pure engine | core types/slot/normalizer/proposal/comparison/fairness/decision/readiness/contingency/packet/T9 facade/after-action |
| T11 Fit Model | fit-core/構築子 registry(113/700)/C3 rollup/C4 interaction-veto/C5 route-chain・ConnectionState/C6-6.1/C7 cancelWeather readiness handoff |
| display tier | engine-consume(T-S/T-D 型壁)/PI projection/CoAlter cue |
| provider seam | input 供給/拒否・provenance・real_only/fail-closed・dev fixture provider・dev route integration |
| **(1) session/intake provider** | confirmed-real・hard/soft・missing/unconfirmed・slot-key aware |
| **(2) Tier0 entity retrieval** | evidence→TravelObjectState・source 非 score・hallucinate 防止・URL 非 read |
| **(A) retrieval-to-fit adapter** | entity→evaluateFit→ProposalFitInput・strict join・missing subject fail-closed・1:1・advisory |

**今完成**: provider→retrieval→fit の純接続まで貫通。**★重要発見**: itinerary DAG **型**（`TravelNode/TravelEdge/TravelDay/TravelItinerary/TravelCandidate/TravelCorePlan`）は **T1A で既存**だが、**fitted-entity pipeline と未接続**＝「複数 entity を旅程に composeする solver/合成層」が gap。
**HOLD のまま**: §4 全件。

## §2 現在の Travel 純 data flow
```
session/intake slots → getSessionIntakeTravelInput → TravelPlanEngineInput          [DONE・fixture/manual]
manual entity evidence → getManualEntityRetrievalCandidates → TravelObjectState       [DONE・Tier0 manual]
TravelObjectState + FitSubject → deriveProposalFitInputsFromRetrievedEntities → ProposalFitInput  [DONE・A]
ProposalFitInput → TravelPlanEngineInput.fit → runTravelPlanEngine → packet           [DONE・F]
packet → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues [DONE]
```
- **fixture/manual only**: 全 provider 入力。
- **未 production/live**: 本番 `/plan`・外部 source・M2 real user model・実 route/weather/place。
- ★ **未接続**: fitted entity → 旅程（`TravelItinerary` DAG）への合成（= 次分岐 B の対象）。

## §3 安全保証
unconfirmed slot は ready にならない / entity evidence は score でない / URL read・fetch なし / external source retrieval なし / price・availability 捏造なし / retrieval に private user state なし / **client packet に raw FitResult なし**（adapter bounded summary のみ）/ no action・booking authority / **fit は ranking/dominance を変えない（advisory）**/ 本番 `/plan` 非接触。

## §4 Travel HOLD gate（各々独立 GO）
Bundle 2 fit dominance/ranking / itinerary DAG solver / Tier1 safe links・Maps URL / Tier2 official・Maps read-only extraction / Tier3 OTA・API・affiliate / Tier4 live availability・pricing・reservation handoff / 実 route・weather・place API / 本番 `/plan` / CoAlter runtime・useCoAlter・/talk / booking・calendar / send・realtime・read receipt / DB・persistence / **M2・Stargazer runtime（upstream 依存としてのみ・本セッションで触れない）**。

## §5 次 Travel 分岐 比較
| 案 | 内容 | 評価 |
|---|---|---|
| A. Bundle 2 fit dominance/ranking design | fit を proposal ranking に効かせる | Travel 内で自然・だが entity 合成より小さい |
| **B. itinerary DAG / solver preflight design** | fitted entity を `TravelItinerary` に compose する合成モデル + solver 境界 | **★ 推奨**。高 fit な部品を「旅行として成立」させる最重要 gap・既存 DAG 型に接続・外部不要 |
| C. Tier1 safe links / Maps URL design | 検索/Maps への安全 link | 予約直前化寄り・旅程構造が先 |
| D. Tier2 official/Maps extraction | 外部 read-only 抽出 | 外部アクセス=CEO 承認 HOLD |
| E. UI preview polish | 見た目調整 | 優先度低 |
| F. production `/plan` integration | 本番接続 | まだ早い（外部/実 user model 未） |

## §6 推奨次フェーズ
**推奨 = B（itinerary DAG / solver preflight design・docs-only）**。
- **なぜ最重要 Travel-only ピースか**: 現状は **個別 entity の fit** まで（A）。だが旅行は「高 fit な entity の集合」でなく、**lodging+食+観光+移動+support+time lock+ordering+fallback+休息 を 1泊2日 の旅程構造に compose したもの**。★ DAG **型は T1A 既存**（`TravelItinerary`）だが fitted entity と**未接続**＝「どう旅程として成立させるか」の合成モデル + solver 境界が無い。B はこれを純設計（外部/本番/booking 不要）。
- **docs か実装か**: **まず docs-only preflight**（§7）。**solver は実装しない**。

## §7 itinerary DAG / solver preflight 設計（B 採用時の骨子・★既存型再利用）
**docs-only first・solver 未実装・route/place/weather API なし・booking なし・calendar write なし・ranking/dominance 変えない**。定義すべき:
- **itinerary node 型**: 既存 `TravelNode{startMin,endMin,place:PlaceRef,activityKind,fatigueLoad,nodeConfidence}` を再利用。**fitted entity(TravelObjectState) → node** の写像（placeRefId 参照・burden/recovery→fatigueLoad・fit confidence→nodeConfidence）。
- **edge/transition 型**: 既存 `TravelEdge{transport,durationMin,cost}` を `RouteChainState/ConnectionState` から導出。
- **time window / ordering lock**: 既存 `OrderingConstraint`（must_precede / luggage_drop_enables / checkin_window_lock / last_departure_lock / open_hours_window_lock / meal_time_lock）+ G2 `EntityRetrievalCandidate.timeLocks` を **node 制約 carrier** に（★solver が並べる・preflight は schedule しない）。
- **route-chain placeholder**: `RouteChainState` を edge の route 詳細 placeholder に（live route 引かない・派生 provenance）。
- **support / rest node**: support entity を `luggage_drop_enables` 等で anchor / 休息は recovery・`ArrivalFreshnessState` 由来の rest node（CEO「疲れた場合の短縮案」）。
- **fallback branch node**: 既存 `ContingencyPlan/FallbackAction`（switch_proposal/downgrade_to_easy/defer）を branch に（雨天→屋内）。
- **hard blocker propagation**: `FitHardBlock`/`red_line` を持つ entity は node 化不可（fail-closed 伝播）。
- **TravelProposal / TravelCandidate 境界接続**: `TravelProposal`(angle・場所前) + fitted entity → **solver(HOLD)** → 既存 `TravelCandidate{itinerary}`。solver がこの bridge。
- **fitSummary / readiness の供給**: fitSummary は **advisory**（node 選好/nodeConfidence・**authority でない**）・readiness は「どこまで commit してよいか」（solver は book しない）。★ **action/booking authority を産まない**。
- ★ **solver アルゴリズム自体は HOLD**（preflight は型/制約/境界の設計のみ・配置/scheduling/最適化は別 GO）。

## §8 検証 / Stop
- 最新: `482b1833`(A)→`525adaf2`(log)。tsc baseline **55**・full suite **21178 passed/1skip/0fail**・travel test **474**・本番 `/plan` 不変・tree clean・push なし。
- 本レポートで停止。次分岐は CEO 承認まで着手しない。

### CEO 判断請求
1. Travel 純基盤（T1-T11 + provider→retrieval→fit）完成を**凍結点**として承認するか。
2. **★発見=itinerary DAG 型は既存だが fitted entity と未接続（合成層が gap）** を認めるか。
3. 次 = **B（itinerary DAG / solver preflight design・docs-only・既存 TravelNode/TravelEdge/OrderingConstraint 再利用・solver は HOLD）** で良いか（vs A/C/D/E/F）。
4. §4 HOLD gate を各々独立 GO として維持・**Stargazer/Plan は本セッション対象外（upstream HOLD のみ）** で良いか。
5. B 採用時、§7 の骨子（node=fitted entity / edge=RouteChain / lock=OrderingConstraint+timeLocks / fallback=Contingency / fitSummary advisory・no authority / solver HOLD）で進めて良いか。
