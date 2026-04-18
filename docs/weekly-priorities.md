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

#### Step W2-2: start / end origin 優先順位修正 🔴
CEO 実機ケース2・3 で観測: /baseline 起点と endpoint が尊重されていない。
- [ ] 起点優先順位を明文化: explicit startPoint > currentLocation > todayOrigin > baseline home
- [ ] endpoint: endpointAnchor > endAction > 帰宅（baseline home）の順
- [ ] ケース3（/baseline=成田 → 成田駅周辺）が再現しない
- [ ] ケース2（終点把握）が再現しない
- [ ] テスト追加（origin 優先順位 / endpoint 尊重）

#### Step W2-3: recommendation path の明確化 🔴
CEO 実機ケース1で観測: 「おすすめ」が generic_place として扱われ recommendation が効かない。
- [ ] `RecommendationIntent` 型を定義（generic_place とは別経路）
- [ ] planner が recommendation intent を受ける分岐を追加
- [ ] 解決戦略: anchor 近傍 + カテゴリ + （将来）Stargazer 軸 で候補を出す
- [ ] テスト追加（intent 判別 / 候補生成経路）

#### Step W2-4: 「おすすめある？」を recommendation intent として検出 🔴
- [ ] llmPlanExtractor / llmDeltaParser の LLM プロンプトに recommendation intent 抽出ルール追加
- [ ] 決定論 pre-classifier（「おすすめ」「どこかいいとこ」等のパターン）を前段に
- [ ] 既存 generic_place 経路と分離する境界を明確化
- [ ] テスト追加（判別精度）

#### W2 チェックポイント（CEO 再検証）
ここで CEO 実機再検証 → PASS なら Deep Context Injection 着手。

#### Step W2-5: Deep Context Injection（CEO 承認後のみ着手）
- Stargazer 軸 / HDM Phase / Origin 直近 / Relational Lens を `PlanningContext` に統合
- 詳細は W2-1〜W2-4 完了後に再確認

### Build Unit — Week 3
Soft Preference Scoring。

### Build Unit — Week 4
Why 生成 + Alter Narration。

### 実装規律
- 固定方針: 「LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。」
- 核感情: **納得感**
- 逸脱は CEO 承認を要する

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
