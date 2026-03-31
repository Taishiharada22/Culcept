# Gemini × Aneurasync 協調 — 段階昇格条件

## 運用原則
- **自動昇格はしない**。条件を満たしたらCEOに提案する形式
- 最終承認はCEOが行う
- Gemini outputs are proposals, not truth.

---

## Phase A（現在）
**本番利用**: emotional_temperature, relational_context
**並走評価**: surface_intent（disagreement log）
**Shadow**: implied_meanings, unspoken_candidates

### Phase A → B 昇格条件

| 指標 | 合格ライン | 計測期間 |
|---|---|---|
| Phase 0 成功率 | ≥ 95% | 7日間 or 100件 |
| Phase 0 レイテンシ p50 | ≤ 1500ms | 7日間 |
| Phase 0 レイテンシ p95 | ≤ 3000ms | 7日間 |
| Alter全体レイテンシ増加 | ≤ +30% vs Phase 0 無効時 | 7日間 |
| surface_intent disagreement 一致率 | ≥ 70% | 100件 |
| 👎率（Phase A期間全体） | ≤ 15% | 50件以上の回答 |
| 不気味/決めつけ系フィードバック | ≤ 3件 | 全期間 |
| エラー率（500系） | ≤ 1% | 7日間 |

### 保留条件
- disagreement 一致率 50-70%: まだ surface_intent の精度が不十分
- レイテンシ p50 が 1500-2500ms: 許容範囲だが改善の余地あり
- フィードバック数が50件未満: サンプル不足

### 停止条件（即時）
- Phase 0 成功率 < 80%: Gemini API の不安定
- レイテンシ p95 > 5000ms: ユーザー体験の破壊
- 👎率 > 30%: 品質劣化
- 不気味/決めつけフィードバック ≥ 5件: 安全性の問題
- エラー率 > 5%: システム障害

---

## Phase B
**本番利用**: emotional_temperature, relational_context, **surface_intent（補助信号）**
**Shadow**: implied_meanings, unspoken_candidates

surface_intent を classifyQuestion/analyzeQueryContext の補助信号として限定使用。
既存ルールが優先、Gemini読解は不一致時の参考程度。

### Phase B → C 昇格条件

| 指標 | 合格ライン | 計測期間 |
|---|---|---|
| surface_intent 補助後の応答品質（👍率変化） | ≥ +5pt vs Phase A | 14日間 or 200件 |
| implied_meanings shadow 精度（後述の評価方法） | ≥ 60% 妥当率 | 100件の手動サンプリング |
| 👎率（Phase B期間） | ≤ 12% | 100件以上 |
| 不気味/決めつけフィードバック | ≤ 2件 | 全期間 |
| disagreement log: surface_intent と既存ルールの不一致で、Gemini側が正しかったケース | ≥ 30% of disagreements | 手動レビュー50件 |

**implied_meanings 妥当率の評価方法:**
shadow log から implied_meanings を抽出し、以下を手動判定:
- 妥当: 発話から自然に読み取れる含意
- 過剰: 発話に対して読み取りすぎ
- 的外れ: 発話と無関係な解釈

### 保留条件
- 👍率変化が ±3pt 以内: surface_intent の効果が不明瞭
- implied_meanings 妥当率 40-60%: 反証入力としてはまだリスキー

### 停止条件（即時）
- 👎率 > 25%: Phase A に戻す
- 不気味フィードバック ≥ 5件: surface_intent 利用を停止
- 応答品質が Phase A より悪化: 即時ロールバック

---

## Phase C
**本番利用**: emotional_temperature, relational_context, surface_intent
**反証入力**: **implied_meanings**（仮説プールの支持/反証証拠として使用）
**Shadow**: unspoken_candidates

implied_meanings を Aneurasync の仮説反証ループに接続。
理解資産への直接書き込みはしない。仮説の confidence 更新の参考にのみ使用。

### Phase C → D 昇格条件

| 指標 | 合格ライン | 計測期間 |
|---|---|---|
| implied_meanings による仮説更新の精度 | ≥ 70% 妥当 | 手動レビュー30件 |
| unspoken_candidates shadow の妥当率 | ≥ 50% | 手動レビュー30件 |
| 👎率 | ≤ 10% | 200件以上 |
| 不気味フィードバック | 0件 | 30日間 |
| MI Gate の deny 率変化 | ≤ +5pt vs Phase B | 30日間 |
| ユーザーリテンション（D7） | ≥ Phase B 水準 | 30日間 |

### 保留条件
- unspoken_candidates 妥当率 30-50%: まだ補助信号としても危険
- 仮説更新精度 50-70%: 改善の余地あり

### 停止条件（即時）
- 仮説が implied_meanings で誤って強化され、不気味な応答が発生: Phase B に戻す
- 👎率 > 20%: Phase B に戻す

---

## Phase D
**本番利用**: emotional_temperature, relational_context, surface_intent, implied_meanings（反証）
**補助信号**: **unspoken_candidates**（保存禁止・返答直結禁止）

unspoken_candidates を MI シグナルの候補入力としてのみ使用。
直接的な応答生成や理解資産書き込みには使わない。

### 安定運用条件

| 指標 | 合格ライン | 計測期間 |
|---|---|---|
| 👎率 | ≤ 8% | 30日間 |
| 不気味フィードバック | 0件 | 30日間 |
| 全体レイテンシ | Phase A 比 +50% 以内 | 30日間 |
| ユーザーリテンション | Phase A 以上 | 30日間 |

### 停止条件
- 不気味フィードバックが1件でも発生: unspoken_candidates の利用を即停止

---

## CEOへの提案フォーマット

条件を満たした場合、以下の形式で提案する:

```
## 昇格提案: Phase X → Phase Y

### 達成状況
| 条件 | 基準 | 実績 | 判定 |
|---|---|---|---|
| ... | ... | ... | ✅/❌ |

### リスク評価
- 未達条件: なし / あり（詳細）
- 注意すべきフィードバック: ...
- レイテンシ傾向: ...

### 推奨
昇格 / 保留 / 追加観測

### CEO判断項目
- [ ] 昇格承認
- [ ] 保留（理由: ）
- [ ] 停止（理由: ）
```

---

## 計測に使用するデータソース

| データ | テーブル / イベント |
|---|---|
| Phase 0 成功率 | `stargazer_analytics` event=`home_alter_judgment` → metadata.utterance_reading |
| レイテンシ | 同上 → metadata.utterance_reading.latency_ms |
| disagreement | `stargazer_analytics` event=`utterance_reading_disagreement` |
| 👍/👎率 | `stargazer_alter_feedback`（新設） |
| 不気味フィードバック | 同上（free_text のキーワード検出） |
| shadow log | `stargazer_analytics` event=`utterance_reading_shadow` |
| MI deny率 | `stargazer_analytics` event=`home_alter_insight_presented` + `stargazer_alter_reactions` |
| エラー率 | `stargazer_analytics` event=`home_alter_judgment` のエラーカウント |
