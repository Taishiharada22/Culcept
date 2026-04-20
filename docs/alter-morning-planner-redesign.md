# Alter-Morning Planner 再設計

**策定**: 2026-04-18（CEO 承認）
**核感情**: 納得感（順 = 納得感 → 満足感 → 期待感 → 幸福感）
**期間**: 4週
**公開挙動**: 限定保守モード付き（全面停止しない）

---

## 1. 策定の背景

### CEO 実機判定 0 点（2026-04-18）
プラン生成時の具体的な壊れ:
- 「今からカフェで仕事」「サドヤでランチ」「18時ミーティング」の入力 → **22:00 ランチ** / **17:00 仕事 50分** / 移動 3h の破綻プラン
- 「カフェはサドヤの近くにして」→ 自宅から真逆のカフェを採用
- 「甲府駅周辺のチェーンのカフェ」→ hard 制約として扱われない

### 診断結果（一次原因）
| 症状 | 一次原因 |
|---|---|
| ランチ 22:00 押し出し | anchor-first 再構築が未実装。`planningEngine.ts` の push-out ロジックが window anchor を時刻制約無視で後ろに動かす |
| 真逆のカフェ | 1500m 距離制約が soft。0件時に `userArea` generic search へ fallback |
| 場所未確定で travel 確定 | low confidence でも `plan_presented` に遷移 |

### CEO の要求
> 最高品質。どのプランナーにも真似できない。期待感・満足感・納得感・幸福感すべてを満たす。

---

## 2. 固定方針（全てのコードでこれを守る）

> **LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。**

### 層ごとの責務
| 層 | 担当 | 責務 | やってはいけないこと |
|---|---|---|---|
| 1 | **LLM** | 自然言語の構造化（誰が/何を/どこで/いつ/誰と の意味抽出） | 確定時刻・確定 place・travel duration を LLM が決めない |
| 2 | **Logic** | Hard Constraint Solver（時間・距離・順序・移動可能性） | 「候補があれば採用」ではなく「制約違反は棄却」 |
| 3 | **Logic** | Deep Context Injection（Stargazer 軸 / HDM Phase / Origin / Relational Lens） | 深層データをプラン生成から切り離さない |
| 4 | **Logic** | Soft Preference Scoring（rhythm / relational fit / spatial flow / aesthetic coherence） | 単一解だけ出さず、Top-2 比較で選択肢を提供できる構造に |
| 5 | **LLM + template** | Why 生成（各セグメント・全体に1行 why） | 飾りとして扱わない。体験の本体 |
| 6 | **LLM + template** | Alter Narration（冷たいデータを Alter の声で温める） | 説明的すぎない。静かに気づかせる |

---

## 3. 4週構成

### Week 1: 壊れを止める（Step 6a + 6b）
目的: **壊れた確定プランを出さない**

#### 6a: Safety Gate + Travel Suppress + 率直保守メッセージ
- `morningProtocol.ts` の phase 遷移（clarifying → plan_presented）に以下を挿入:
  - unresolved place があるセグメントはないか
  - placeSearchHint があるのに near-anchor 検索 0 件でないか
  - `resolutionConfidence=low` のセグメントがないか
  - slot-targeted refinement が未解決でないか
- 違反時: plan_presented に行かず clarifying に留まる。1 問だけ sharp clarify
- travel 生成条件: 全セグメントが high/medium confidence でない限り挿入しない
- 保守メッセージは「何が未解決だから止めているか」を率直に提示（曖昧文禁止）

#### 6b: near/周辺 の hard 距離制約化
- `placeResolver.ts` `resolveNearAnchorPlaces` で 1500m 外候補を自動棄却
- 0 件なら `resolutionConfidence=low` を立てて 6a のゲートに引っかける
- `placeSearchHint` 経路では `userArea` generic fallback **禁止**

### Week 2: 構造再構築（anchor-first / origin / recommendation）+ Deep Context Injection
目的: **順序崩壊ゼロ + /baseline が効く + 「おすすめ」が機能する + 自分のことを分かってる感**

**CEO 指示（2026-04-18 W1 PASS 判定時）**: 構造 4 点を先に固めてから Deep Context Injection に進む。先に広げない。

#### W2 実装順序（固定）

##### W2-1: anchor-first deterministic planner
- LLM の `order` を捨て、3 パス構築:
  1. Pass 1: Hard anchor 配置（fixed_start, window_* を時系列配置）
  2. Pass 2: Flex anchor を gap に挿入
  3. Pass 3: Travel 生成（解決済み place のみ）
- `window_end` を尊重。push-out 禁止
- 短縮可能なのは `inferred duration` のみ

##### W2-2: start / end origin の優先順位修正
CEO 実機ケース2・3 で観測された: /baseline 起点と endpoint が尊重されていない。
- 起点優先順位: `explicit startPoint > currentLocation > todayOrigin > baseline home`
- endpoint 優先順位: `endpointAnchor > endAction > 帰宅 (baseline home)`
- ケース3（baseline=成田 → 成田駅周辺）が再現しない
- ケース2（終点把握）が再現しない

##### W2-3: recommendation path の明確化
CEO 実機ケース1で観測: 「おすすめ」が generic_place 扱いで recommendation が効かない。
- `RecommendationIntent` 型を定義（generic_place とは別経路）
- planner が recommendation intent を受ける分岐を追加
- 解決戦略: anchor 近傍 + カテゴリ + （将来）Stargazer 軸

##### W2-4: recommendation intent の検出
- LLM プロンプトに recommendation intent 抽出ルール追加
- 決定論 pre-classifier（「おすすめ」「どこかいいとこ」等）を前段に
- 既存 generic_place 経路との境界明確化

**→ ここで CEO 再検証。PASS なら下記に着手。**

##### W2-5: Deep Context Injection（CEO 承認後のみ）
以下を `PlanningContext` に統合:
- **Stargazer 軸**: 社交エネルギー / リスク姿勢 / 内向外向 / 疲労耐性
- **HDM Phase + Trust**: どこまで踏み込めるか
- **Origin 直近**: 今週の疲労度 / 好調モード / 崩れシグナル
- **Relational Lens**: 同行者ごとの関係温度・前後バッファ需要

`PlanningContext`:
```typescript
{
  energy_budget: number;        // 今日の総エネルギー見積
  social_budget: number;        // 社交に使える許容量
  preferred_rhythm: "front_loaded" | "back_loaded" | "paced";
  rupture_zones: TimeRange[];   // 崩れやすい時間帯
  companion_profiles: Map<string, RelationalHeat>;
}
```

### Week 3: Soft Preference Scoring
目的: **どのプランナーにも真似できない**

各候補プランに対してスコアリング:
- **rhythm fit**: 今日のエネルギーに対して過密でないか
- **relational fit**: 「先生」前に整え時間、「千ちゃん」前に休息バッファ
- **spatial flow**: 移動が疲労域に食い込まないか
- **aesthetic coherence**: セグメントの流れの美しさ

→ Top-1 採用 or Top-2 比較提示

### Week 4: Why 生成 + Alter Narration
目的: **納得感の本体**

各セグメント・全体に 1 行 why:
- セグメント: 「午後はミーティング前のバッファが欲しいタイプだから」
- 全体: 「今日は社交日だから、移動は最小化した」

P5 Reality Anchoring の「行動指示でなく自己理解からの着地」を継承。

---

## 4. 公開挙動: 限定保守モード

### plan を出してよい条件（全て満たす）
- [x] hard anchor が解けている
- [x] near / 周辺の拘束が解けている
- [x] major place が low confidence ではない
- [x] travel が解決済み place に基づいている

### plan を出してはいけない条件（いずれか該当）
- [ ] unresolved place がある
- [ ] near-anchor 検索 0 件
- [ ] `resolutionConfidence=low` のまま
- [ ] slot-targeted refinement が未解決
- [ ] anchor-first 再構築前に順序が崩れる（W1 中は該当しないが W2 まで継続）

### 違反時の挙動
- plan_presented に行かない
- travel suppress
- 1 問だけ sharp clarify
- 必要なら hard anchor だけの部分プラン表示

### 保守メッセージのトーン
率直に。「Alter がプラン能力を深めています」のような曖昧文は禁止。
- OK: 「サドヤ近くでカフェ候補が見つからなかった。もう少しエリアを広げていい？」
- OK: 「仕事の場所がまだ決まってない。候補を探す前に『どこか特定のカフェ』か『サドヤ近く』か教えて」
- NG: 「プランを調整中です」「Alter が学習中です」

---

## 5. 差別化の源泉（これが Aneurasync 固有）

| 資産 | 接続先 | W |
|---|---|---|
| Stargazer 深層観測（100問 / 10 次元） | Deep Context Injection / Soft Preference Scoring | W2-W3 |
| HDM Phase + Trust | 踏み込み水準調整 | W2 |
| Origin β 直近行動 | 疲労度・好調モード・崩れシグナル | W2 |
| Relational Lens | 同行者ごとの関係温度・前後バッファ | W2-W3 |
| P4 Counterfactual Live | 「このプランの流れで1日がどう変わるか」の内面投影 | 将来拡張 |
| P5 Reality Anchoring | Why 生成の土台（自己理解からの着地） | W4 |

これらは**既に完成している資産**。新規構築ではなく統合作業。

---

## 6. 完了判定

- W1: 壊れた確定プランが出なくなり、保守メッセージが率直に出ている ✅ **2026-04-18 CEO PASS**
- W2-1: anchor-first deterministic planner — LLM の `sequenceOrder` は advisory、clock/window が hard constraint ✅ **2026-04-19 実装完了**
  - `anchorFirstPlace()` 3 パス配置（Pass 1 hard clock / Pass 2 window gap-fit / Pass 3 flex cursor-walk）
  - window_end を HARD 化。shrink は inferred duration のみ。user 指定は不可侵
  - 配置不能は `cannotFitWindow` → `placementStatus="window_overflow"` → Safety Gate が blocker 付きで clarify
  - テスト: anchorFirstPlacer 8 + planReadinessGate 12（内 window_overflow 4 新規）+ ceoScenario 114 = 134/134 PASS
  - 22:00 ランチ再発防止 unit test 通過
- W2-2〜W2-4: /baseline 起点が尊重される / endpoint が尊重される / 「おすすめ」で recommendation 経路が発動
- W2-5 (Deep Context Injection): Stargazer 軸 / HDM / Origin / Relational Lens が PlanningContext に入っている（CEO 再検証 PASS 後着手）
- W3: 同じ入力に対して 2 候補が比較提示される
- W4: 各セグメントに 1 行 why が表示され、全体流れに why がある

---

## 7. 関連ドキュメント・コード位置

### ドキュメント
- `docs/decision-log.md` 2026-04-18 エントリ
- `docs/weekly-priorities.md` Week 1-4 タスク
- `docs/heart-dynamics-model-v1.md`（HDM 接続先）
- `docs/rendezvous-counselor-master-design.md`（Relational Lens の原典）

### 主要コード位置
- `lib/alter-morning/morningProtocol.ts` — phase 遷移（W1 対象）
- `lib/alter-morning/planningEngine.ts` — planner core（W1/W2 対象）
- `lib/alter-morning/placeResolver.ts` — 距離制約（W1 対象）
- `lib/alter-morning/llmDeltaParser.ts` — LLM delta 検出（現状 Step 5 完了）
- `lib/alter-morning/llmPlanExtractor.ts` — LLM 初期抽出（W2 で構造化のみに限定）
- （新規）`lib/alter-morning/planningContext.ts` — Deep Context Injection（W2）
- （新規）`lib/alter-morning/softPreferenceScorer.ts` — Soft Preference Scoring（W3）
- （新規）`lib/alter-morning/whyGenerator.ts` — Why 生成（W4）

---

**このドキュメントは今後の alter-morning 開発の北極星とする。逸脱は CEO 承認を要する。**
