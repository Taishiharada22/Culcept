# Weekly Priorities

## Week of 2026-04-18 〜 2026-05-16（Alter-Morning Planner 再設計 4週）

### 全社目標
**alter-morning planner の再設計完遂**。CEO 判定 0 点からの構造再構築。方針: C プラン 4週・限定保守モード付き（`docs/alter-morning-planner-redesign.md` 参照）。

### Build Unit — Week 1（2026-04-18 完了）🟢
壊れた確定プランを出さない。

#### Step 6a: Safety Gate + Travel Suppress + 率直保守メッセージ ✅
- [x] `morningProtocol.ts` の phase 遷移に unresolved-place / low-confidence / near-anchor-0件 ゲート挿入
- [x] travel 生成条件を「全セグ解決」に限定（`buildV2DayPlan` / Async）
- [x] 保守メッセージを率直化（曖昧文禁止、何が未解決か明示）
- [x] テスト追加（planReadinessGate 8 件）

#### Step 6b: hard 距離制約化 ✅
- [x] `placeResolver.ts` `placesApiToNearCandidate` で 1500m 外候補を自動棄却
- [x] 全件棄却時に `confidence=low` + `near_anchor_zero` reason に合流
- [x] `placeSearchHint` 経路の userArea fallback 無効化（placeType 未設定で resolveAnchors の generic 経路を通らない構造）
- [x] テスト追加（棄却 / low confidence / 座標欠落棄却）

**コミット**: `a9a791d7`（5 files, 583 insertions）

#### 完了判定
- [x] 壊れた確定プランが出なくなる
- [x] CEO 実機再検証で「22:00 ランチ」「真逆のカフェ」が再現しない
- **CEO PASS 判定**: 2026-04-18

### Build Unit — Week 2（2026-04-19 着手）🟡
anchor-first deterministic planner + start/end origin 修正 + recommendation path。

**CEO 指示（2026-04-18）**: Deep Context Injection は **構造 4 点を固めてから** 着手。先に広げない。

#### 背景（CEO 実機再検証で観測された 3 ケース）
1. ケース1: 移動が生成されない / 会食場所をサドヤで固定 / 「おすすめ」が generic_place 扱いで recommendation が効かない
2. ケース2: ある程度成功だが start / end origin が崩れている（終点を把握していない）
3. ケース3: /baseline で成田設定なのに成田駅周辺で出ない + 移動時間欠落 + recommendation 不発

#### Step W2-1: anchor-first deterministic planner ✅（2026-04-19 完了）
LLM の `sequenceOrder` を advisory に格下げし、clock / window を hard constraint にする 3 パス配置。
- [x] Pass 1: Hard clock anchor（`fixed_*`）を時刻順に占有、LLM order 無視
- [x] Pass 2: Window item を window.start 早い順で gap-fit。window.end は HARD、shrink は inferred duration のみ（buffer 10 分 / min 15 分）
- [x] Pass 3: 全 item を sequenceOrder 昇順で cursor-walk、narrativeLimit で順序保護
- [x] 配置不能は `cannotFitWindow` → `placementStatus="window_overflow"` → Safety Gate が blocker 付きで clarify
- [x] テスト完走: anchorFirstPlacer 8 + planReadinessGate 12 + ceoScenario 114 = 134/134 PASS
- **成果物**: `anchorFirstPlace()` in `lib/alter-morning/planningEngine.ts`, gate rule in `planReadinessGate.ts`

#### Step W2-2: start / end origin 優先順位修正 ✅（2026-04-19 完了）
CEO 実機ケース2・3 で観測: /baseline 起点と endpoint が尊重されていない。
- [x] 起点優先順位を明文化: explicit startPoint > currentLocation > todayOrigin > baseline home（2026-04-18 に実装済み）
- [x] endpoint: endpointAnchor > endAction("帰宅") / endpointType("home") > baseline home の順
- [x] `resolveEndpoint()` を `locationResolver.ts` に追加（6 source 区分: endpoint_anchor_resolved / endpoint_anchor_home / endpoint_anchor_label_only / end_action_home / baseline_home / none）
- [x] `buildV2DayPlanAsync` の buggy `returnDest = startPoint` semantic バグを除去、Routes API last-leg 精密計算を有効化（endpointCoords pass-through）
- [x] sync `buildV2DayPlan` の同 buggy 派生も除去（baseline home フォールバック）
- [x] テスト追加（locationResolver W2-2 ブロック 10 件、全 49 PASS）
- [x] ケース2（終点把握）再発防止: endpointAnchor が下流に届き、`returnDest` が endpoint 側から解決される
- **成果物**: `resolveEndpoint()` / `ResolvedEndpoint` in `lib/alter-morning/locationResolver.ts`, `AsyncPlanOptions.endpointCoords` in planningEngine.ts, `insertTravelItemsAsync(endpointCoords)` in travelTimeEngine.ts, `buildV2DayPlanAsync` wiring in morningProtocol.ts

#### Step W2-3: recommendation path の明確化 ✅（2026-04-19 完了）
CEO 実機ケース1で観測: 「おすすめ」が generic_place として扱われ recommendation が効かない。
- [x] `RecommendationIntent` 型を定義（generic_place とは別経路）— `lib/alter-morning/types.ts`
- [x] planner が recommendation intent を受ける分岐を追加 — `morningProtocol.ts` lazy import + dispatcher ループ
- [x] 解決戦略: anchor 近傍 + カテゴリ + （将来）Stargazer/Relational で候補を出す — `resolveRecommendationIntent` in `placeResolver.ts`（`anchor_proximity` / `category_only` 実装、`stargazer_weighted` / `relational_weighted` は type のみ予約）
- [x] テスト追加（intent 判別 / 候補生成経路）— `tests/unit/alter-morning/recommendationIntent.test.ts` 12 件 全 PASS
- **成果物**: `RecommendationIntent` / `RecommendationCandidate` / `RecommendationResolution` / `resolveRecommendationIntent()` / `inferPlaceCategoryFromActivity()` / `PlanSegment.recommendationIntent` + dispatcher
- **規律**: fail-open（API 未設定・エラー時に plan を止めない）、confidence ≤ medium（勝手に確定しない）、hard 距離フィルタ

#### Step W2-4: 「おすすめある？」を recommendation intent として検出 ✅（2026-04-19 完了）
CEO 3条件の方針で決定論 pre-classifier を LLM より先に置き、Turn 1 / Turn 2+ 双方で同じ意味論に揃える。
- [x] 決定論 pre-classifier 実装 — `lib/alter-morning/recommendationClassifier.ts`
  - 4分類: `recommendation_request` / `explicit_place` / `explicit_category` / `none`
  - 強 phrase（「オススメ教えて」「どこで食べよう」等）/ 弱 phrase（「おすすめ。」単独）を弁別、弱は疑問マーカー必須
  - 文言揺れ耐性（カタカナ・漢字・全角半角）、anchor/category/quality の hint 抽出
- [x] CEO 条件(1) emit 厳格化: explicit_place が検出された発話では recommendation を主役にしない
- [x] CEO 条件(2) pre-classifier を LLM より先に実行 — `llmDeltaParser.detectDelta` で LLM コール前に短絡
- [x] CEO 条件(3) Turn 1 / Turn 2+ 同一意味論 — `llmPlanExtractor.applyRecommendationClassifierToState` と `llmDeltaParser.buildRecommendationDelta` が同一ロジック
- [x] `applyFieldChange` に `recommendationIntent` case 追加（二重防御: place 付き seg への attach を拒否）
- [x] `clearField` に `recommendationIntent` case 追加
- [x] `applyDelta` add_segment 経路で `newSegment.recommendationIntent` を新 PlanSegment に伝播
- [x] `LLMRawSegment.recommendationIntent` を内部拡張フィールドとして追加（LLM JSON schema には含めない）
- [x] テスト追加: `recommendationClassifier` 31 件 / `recommendationDelta` 10 件 / `recommendationTurn1` 6 件 = 47/47 PASS
- [x] 全 alter-morning suite 820/821 PASS（1件失敗は Phase C-4 既存 outfit clarify copy — W2-4 スコープ外）
- **成果物**: `recommendationClassifier.ts` (~340 行), `buildRecommendationDelta`/`findTargetForRecommendation` in `llmDeltaParser.ts`, `applyRecommendationClassifierToState` in `llmPlanExtractor.ts`
- **規律**: LLM を呼ばずに決定論で短絡（pre-classifier の存在意義）、explicit の破壊禁止は二重防御（classifier 側 + applyFieldChange 側）

#### W2 チェックポイント（CEO 再検証）
ここで CEO 実機再検証 → PASS なら Deep Context Injection 着手。

#### Step W2-5: Deep Context Injection（CEO 承認後のみ着手）
- Stargazer 軸 / HDM Phase / Origin 直近 / Relational Lens を `PlanningContext` に統合
- 詳細は W2-1〜W2-4 完了後に再確認

### Build Unit — Week 3
Soft Preference Scoring。

### Build Unit — Week 4
Why 生成 + Alter Narration。

### W3-PR-7 merge 後 backlog（CEO 2026-04-22 指摘）
W3-PR-7 で「質問ループの基盤」はクリア。次工程は **確定条件の厳格化 + anchor-based search / recommendation 層**。
Morning 完成扱いにはなっていない。次 PR の粒度で扱う:

1. **plan 前倒し提示の抑制**（確定条件の厳格化）
   - 未確定 slot（pendingClarify 未解消）が残っている間、plan を confirmed に昇格しないだけでなく、**UI に全 items を出さない** モードを検討
   - 現状: provisional でも UI に 3 items 出てしまい「質問中なのに決まった感」が出る
   - 候補: 確定済み items のみ表示 / 未確定 items は grey スタブ / そもそも plan セクション自体を hide

2. **fixable 場所 / provisional 場所 の境界厳密化**
   - 「甲府駅周辺」「近場」「決めてない」のような vague 応答に対する正規化ルール
   - placeType 三層（exact_proper_noun / generic_category / vague）と plan 表示ポリシーの接続

3. **Anchor-based search / 同心円 / recommendation 分離**
   - 既知 anchor（自宅 / 前 event 終点）からの同心円検索
   - 店名 recommendation と fixable place の責務分離（現在は混在）
   - 「ランチはどのあたり？」→ 候補提示 → 本人選択の流れを構造化

**着手順**: 次セッションで CEO と粒度・優先度を確認してから分割設計。現時点では backlog 化のみ。

### W3-PR-8 — Strict Confirmation（2026-04-22 実装完了）✅
W3-PR-7 merge 後 backlog の (1) plan 前倒し抑制 + (2) fixable / provisional 境界厳密化 に応える UI-truth PR。新機能ゼロ、adapter と UI の整合のみ。設計書: `docs/alter-morning-strict-confirmation-design.md`（CEO レビュー済み rev 1）。

#### 構造問題の出自
W3-PR-7 merge（PR #15, commit 283cb2a4）で「provisional plan が UI 上で確定に見える」崩れを観測。震源は `legacyAdapter.eventToPlanItem`（L93-115）で sharpness を無視し、`place_ref` を text に漏洩。CEO 単一方針: **「検索を足すより先に、未確定を未確定のまま扱う」**。PR-9（Anchor-Based Search）の前提条件。

#### コミット構成（全 7 commit）
- **Commit 1** (`bacc48e9`): 型追加 — `ConfirmationState` / `WhereVagueSubKind` / `PlanItem` 拡張フィールド（optional）
- **Commit 2** (`8b6a098f`): `whereVagueClassifier.ts` + `normalizedPlanItem.ts`（deterministic、LLM 非依存）
- **Commit 3** (`a01df5e4`): adapter に sharpness 配線（`computeWhenSharpness` / `computeWhereSharpness` / `computeWhatSharpness` 貫通 + `needs_answer` 上書き + `normalizePlanItem` 出口）
- **Commit 4** (`a817ee1a`): `MorningPlanCard` slot 分離描画（`confirmationState` 別 border / HelpCircle icon / 「時間未確定」「場所未確定」「内容暫定」「店舗暫定」chip）
- **Commit 5** (`70e6ea52`): `anchorSearchGate.ts` PR-9 予約スタブ（throw stub + deterministic 発火条件を JSDoc に固定）
- **Commit 6** (`aa04bb02`): ユニットテスト 3 本（whereVagueClassifier / normalizedPlanItem / legacyAdapterSharpness）
- **Commit 7**: weekly-priorities.md 記録（本エントリ）+ tsc PASS + 1246/1246 PASS 確認

#### 成果
- **UI-truth 回復**: `PlanItem` → `NormalizedPlanItem` 経由で UI が `??` fallback 不要に
- **3-way vague 分類確定**: `anchor`（B：位置情報そのもの）/ `category_chain`（C：検索候補）/ `undecided`（A：clarify 必須）
- **PR-9 単一入口確定**: `shouldFireAnchorSearch()` に firing gate を集約（判断分散の禁止）
- **テスト**: whereVagueClassifier 20+ / normalizedPlanItem 10+ / legacyAdapterSharpness 5 = 35+ 件 新規追加、合計 1246 PASS
- **型**: tsc PR-8 ファイル群 error 0（既存 1043 行の error は PR-8 スコープ外）

#### 規律
- 新 LLM コール 0、新 DB 変更 0、新 API 追加 0（UI-truth PR の定義通り）
- `kind: "fixed" | "todo" | "travel"` は**変更禁止**（confirmationState とは直交）
- fixtures は包括的 defensive ではなく、テストごとに必要最小限の slot を埋める（provenance checker が span 存在を要求する制約を尊重）

#### 改訂 2 追加 commit（CEO preview FAIL 2026-04-22 → dialog-control 修復）
初稿 7 commit で PR #16 を preview に出した結果、CEO が 4 点 FAIL 判定:
1. 甲府駅周辺 / ランチが `confirmed` 風に描画（anchor が plan 昇格してしまう）
2. 「決めてない」が Where 回答として `place_ref` に入り plan 昇格
3. `primary_clarify == null` だけで phase=plan_presented に昇格（未解決 slot があっても）
4. `items=0` 契約違反に防御が無い

GPT 分析 + CEO 最終承認を受け、同 branch に dialog-control 修復 commit を追加:
- **Commit 8** (`7c0e1538`): `lib/alter-morning/planning/blockingSlots.ts` 追加 — `blockingForEvent` / `hasBlockingUnresolvedSlots`（phase 昇格正本）+ `whereClassifier.ts` の vague provisional fallback 凍結。anchor も blocking 化（PR-9 search 未実装のため）
- **Commit 9** (`4f4cfa41`): `legacyAdapter.decidePhase` を `hasBlockingUnresolvedSlots` 正本に差し替え。`primary_clarify == null` は二次防御に降格。`items=0` は dev/test throw / prod safe degrade（placeholder plan 合成禁止）
- **Commit 10** (`4d3d4904`): `answerBinder.ts` に undecided 語彙拒否（`isUndecidedWhereAnswer`）+ 単一 event invariant + bind 後 sharpness 再評価（observation ログ、「captured ≠ resolved」検出）
- **Commit 11** (`d2eb2fa2`): `blockingSlots.test.ts`（12 cases）/ `answerBinderUndecided.test.ts`（6 cases）
- **Commit 12**: 設計書 改訂 2 反映（§2.5 anchor blocking 注記 / §2.8 blocking 定義 + phase 昇格契約 / §3.6 captured vs resolved 最小版 / §4.1 参照表追記 / §10 breakdown 更新 / 付録 B 未決事項）+ 本エントリ

#### 改訂 2 の核判断
- **phase 昇格の正本を slot に置く**: `primary_clarify == null` を正本にすると clarify 生成の責任分散で事故る。`hasBlockingUnresolvedSlots` は Event schema から決定的に計算できるので信頼できる
- **captured vs resolved 最小版**: 完全な型分離（`CapturedAnswer` / `ResolvedSlotValue`）は次 PR へ。PR-8 では undecided 拒否 + invariant + 観測ログのみ
- **What vague は non-blocking**: CEO §9 回答 6（What 表示強化のみ、clarify 追加なし）と整合
- **items=0 二層化**: prod で throw すると UX が死ぬ。safe degrade で会話継続、dev/test は throw で契約違反を CI 検知

**次**: commit 12 push → PR #16 更新 → CEO 実機再検証 → PASS 確認後 PR-9（Anchor-Based Search）着手。

#### 改訂 3 Phase 0（CEO preview FAIL #2 — liveness 修復、設計のみ）
改訂 2 の commit 8-12 を preview に出した結果、CEO 第 2 FAIL 判定:
- 「甲府あたり → 甲府 → スタバ → 図書館」と回答しても同じ「朝の仕事はどのあたり？」質問が繰り返される（会話 memory 無し）
- provider 連続失敗で `items=0 clarifying` 経路が HTTP 500 を引き起こす
- **`primary_clarify == null` を正本にしない** は入ったが、**「会話を所有する者」が不在** で同じ層別パッチの失敗が 3 週間続いている構造欠陥が露呈

**CEO 方針（2026-04-22）**:
> 「常に、先を見通して思考しろ。鵜呑みにするな。迎合するな。甘い判断を下すな...スタート〜ゴールまでの論理的な構築が最優先。まずは、全ての実装を実機観測なしで、行う。全ての設計が終わらない限り、また同じ問題が起こる可能性が高い」

**Phase 0 スコープ（実装禁止、設計のみ）**:
- `docs/alter-morning-roadmap.md`（新規）— 北極星（map + pin + timeline）から逆算した PR-8〜PR-14 階段。各段階の「初めて可能になるもの」と依存関係を固定
- `docs/alter-morning-strict-confirmation-design.md` 改訂 3 追記 — §2.9 DialogState / §2.10 where staircase / §2.11 providerRecovery / §2.12 slot_switching / §3.7 型 / §3.8 reducer action / §3.9 taxonomy decision table / §3.10 PendingClarify 移行表 / §3.11 items=0 state-aware / §3.12 merge 条件（GPT 4 + 追加 6）/ §10 commit 13〜21 / 付録 C
- `docs/alter-morning-pr9-places-search-design.md`（新規骨子）— SearchQueryDraft → Places API query 変換 / NormalizedPlaceCandidate 型 / user selection フロー / 座標注入契約
- `docs/alter-morning-pr10-14-interface-reservation.md`（新規）— PR-10 transport / PR-11 who / PR-12 end time / PR-13 map pin / PR-14 timeline の型予約のみ

**改訂 3 の核判断（CEO 2026-04-22 承認案 γ）**:
- **DialogState を新設して会話を所有する単一 layer を作る**: gapResolver/answerBinder/legacyAdapter は consumer。書き込み口は reducer のみ
- **`search_handoff_blocking` は PR-8 では internal state only**: PR-9 未実装下で「近くのお店探そうか？」を user-facing に出すのは dead end。PR-9 merge で解放
- **slot_switching は deterministic**: 新時刻/新候補/新活動名を生成しない。gapResolver 既存優先順位に委譲
- **providerRecovery を phase authority の前で分岐**: items=0 ガードに到達させない、fake plan 合成禁止
- **PendingClarify を derived view 化**: session に永続化するのは DialogState のみ、PendingClarify は毎ターン derive
- **session schema version bump + reset**: migration せず beta ユーザーだけなので旧 session は捨てる
- **DIALOG_STATE_V2 feature flag**: 改訂 2 挙動を完全保存する kill switch
- **LLM prompt に DialogState 混入禁止**: reducer は rule-based、taxonomy も deterministic

**merge 条件（GPT 4 + 追加 6 = 10 条件）**:
- A1: phase=clarifying items=0 が 0 件 / A2: provider 失敗で 500 が 0 件 / A3: 初回 anchor で plan 昇格しない / A4: 同 slot 2 回 miss で遷移
- B1: LLM prompt 汚染 0 / B2: DialogState persist roundtrip / B3: version bump で旧 session reset / B4: taxonomy 14 ケース 1:1 / B5: state machine invariants / B6: narrowStep 単調増加

**Phase 0 規律**:
- 4 文書（roadmap / strict-confirmation rev 3 / pr9 骨子 / pr10-14 予約）を **CEO 承認取得前に commit 13 以降に着手しない**
- 文書に書かれていない型・関数・state を実装で追加しない
- 本 branch（`feature/alter-morning-v2-strict-confirmation`）の次 commit は **Phase 0 文書のみ**

### 実装規律
- 固定方針: 「LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。」
- 核感情: **納得感**
- 逸脱は CEO 承認を要する

### W3-PR-10 — Transport Staircase（Phase 1 + Phase 2）✅
**Phase 1（2026-04-22 前後 merge, PR #20）**: canonical edge model 導入。`TransportSegment[]` を domain truth として生成、flag OFF では byte-diff ゼロ。
**Phase 2（2026-04-23 完了, 本 branch）**: canonical segments を Path A の `PlanItem(kind="travel")` display cache として UI に再生成。

#### Phase 2 コミット構成
- **C1 (`c8914ea4`)**: display-first 監査 — R1=false 確認（builder に travel synthesis を混ぜない前提が崩れていないこと）
- **C2 (`56082721`)**: `synthesizeTravelItems(segments, events)` + `interleaveTravelItems(items, entries)` pure fn + 20 tests
- **C3a (`eca2f7bb`)**: `legacyAdapter` に travel interleave 接続（Path A extract）+ 5 tests
- **C3b (`578dcd2c`)**: `/api/stargazer/alter/selection` route に travel interleave 接続（Path A rebuild）+ 既存 selectionEndpoint test の items[] 期待値更新

#### Phase 2 核判断（CEO 承認範囲内）
- **Path A only / Path B 非接触**: 既存 `processMorningMessage` 経路は一切触らない
- **builder に travel synthesis を入れない**: `buildPlanAndSegmentsFromEvents` の T2 原則を守り、synthesize を独立 pure fn として切り出し
- **interleave は call-site 責務**: synthesize は entry pair を返すだけ。PlanItem[] 挿入は legacyAdapter / selection route 側
- **id parse しない**: `SynthesizedTravelEntry { afterEventId, item }` で side-channel、event_id に `__` が含まれても事故らない
- **deterministic id**: `travel__<fromEventId>__<toEventId>` (double underscore prefix で既存 `travel_` と machine-distinguishable)
- **flag OFF 完全不変**: `built.transportSegments !== undefined` だけを gate に使い、flag OFF では Phase 1 と byte-diff ゼロ
- **schema 変更なし**: 新規 field / 新規 key 追加ゼロ

#### 非スコープ（今回やらない、明示的に残す）
- client `regenerateTravel` の id 揺れ解消（Phase 3 以降）
- Path B (`processMorningMessage`) / persisted travel item との統合（Phase 3 以降）
- Routes API による実 duration / distance 計算（`durationMin = estimatedDurationMin ?? 0`）
- mode 推定（segment.mode をそのまま使用）

#### テスト
- `synthesizeTravelItems.test.ts`: 20/20 PASS
- `legacyAdapterTransportPhase2.test.ts`: 5/5 PASS
- `selectionEndpoint.test.ts`: 15/15 PASS（flag ON Path A 期待値 2→3 更新 = CEO 承認範囲内）
- alter-morning 全体: 1767/1767 PASS
- tsc: 影響範囲 clean

**次**: Phase 3（Routes API 連携 / client regenerateTravel id 統合 / Path B 統合）は CEO 判断待ち。現時点で Phase 2 スコープは閉じる。

---

## Week of 2026-03-14

### 全社目標
- AI 運営 OS の初期構築と運用開始

### 部門別優先事項

#### Chief of Staff
- [x] 運営基盤の構築（CLAUDE.md, agents, skills, docs）
- [ ] 初回の日次ブリーフィング実行

#### Product Unit
- [ ] 現在の機能一覧と優先順位の整理
- [ ] 次スプリントの計画立案

#### Research Unit
- [ ] 競合分析の初回レポート作成
- [ ] ユーザーインサイトの収集方針策定

#### Build Unit
- [ ] 現在の技術的負債の棚卸し
- [ ] CI/CD パイプラインの改善提案

#### Growth & Ops Unit
- [ ] オンボーディングフローの現状分析
- [ ] コンテンツ戦略の初回提案

---

### ステータス凡例
- 🟢 順調
- 🟡 要注意
- 🔴 ブロック中
