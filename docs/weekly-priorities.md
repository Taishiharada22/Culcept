# Weekly Priorities

## Week of 2026-04-18 〜 2026-05-16（Alter-Morning Planner 再設計 4週）

### 全社目標
**alter-morning planner の再設計完遂**。CEO 判定 0 点からの構造再構築。方針: C プラン 4週・限定保守モード付き（`docs/alter-morning-planner-redesign.md` 参照）。

### Build Unit — Week 1（2026-04-18 着手）
壊れた確定プランを出さない。

#### Step 6a: Safety Gate + Travel Suppress + 率直保守メッセージ 🔴
- [ ] `morningProtocol.ts` の phase 遷移に unresolved-place / low-confidence / near-anchor-0件 ゲート挿入
- [ ] `planningEngine.ts` の travel 生成条件を「全セグ解決」に限定
- [ ] 保守メッセージを率直化（曖昧文禁止、何が未解決か明示）
- [ ] テスト追加（保守ゲート / travel suppress / 率直文言）

#### Step 6b: hard 距離制約化 🔴
- [ ] `placeResolver.ts` `resolveNearAnchorPlaces` で 1500m 外候補を自動棄却
- [ ] 0件時に `resolutionConfidence=low` を立てる
- [ ] `placeSearchHint` 経路では `userArea` generic fallback 禁止
- [ ] テスト追加（棄却 / low confidence / fallback 禁止）

#### 完了判定
- 壊れた確定プランが出なくなる
- CEO 実機再検証で「22:00 ランチ」「真逆のカフェ」が再現しない

### Build Unit — Week 2
anchor-first 再構築 + Deep Context Injection。詳細は W1 完了後確定。

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
