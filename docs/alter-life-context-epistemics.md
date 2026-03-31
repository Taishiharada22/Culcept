# Alter Life Context — エピステミック管理

## 原則
Life Context の蓄積で最も危険なのは「事実」「本人の主観」「AI仮説」の混同。
全ての保存データに4軸タグを付け、「わかったつもり」を構造的に防ぐ。

## 保存スキーマ

各 Life Context シグナルは `UnderstandingUnit` の Partial として保存。最低限以下を持つ:

| フィールド | 型 | 説明 |
|-----------|---|------|
| content | string | 理解の内容 |
| category | "person" / "environment" / "emotion" / "life_stage" | カテゴリ |
| source | EpistemicSource | 情報の出所 |
| temporality | Temporality | 時間スケール |
| confidence | number (0.0-1.0) | 確信度 |
| evidence_count | number | 裏付けとなる観測数 |
| last_confirmed | ISO date | 最後に確認された日時 |
| possibly_stale | boolean | 30日以上未確認 |

## Source 分類

| source | 定義 | 例 |
|--------|------|---|
| user_stated | ユーザーが明言 | 「一人暮らしです」 |
| user_implied | 発言から推定 | 「母が〜」→ 母親がいる |
| behavior_observed | 行動パターンから | 毎回深夜に相談 |
| alter_inferred | Alter が推論 | Cross-Context 分析結果 |
| contradicted | 矛盾が検出された | 前回と異なる発言 |

## Confidence ルール（Phase 1）

| 条件 | confidence |
|------|-----------|
| user_stated + 現在形 | 0.7-0.8 |
| user_stated + 過去形 | 0.3-0.4 |
| user_implied（人物の存在） | 0.5 |
| user_implied（環境・推測） | 0.3-0.6 |
| 単発言及（全般） | 最大 0.6 |
| 複数回確認 | 0.7-0.9（evidence_count に応じて） |

**旧 Phase 0 からの変更**: 単発言及の confidence を 0.7-0.95 → 0.3-0.6 に引き下げ。

## 過去形フィルタ

「昔」「以前」「前に〜した」「子供の頃」「学生時代」等を検出した場合:
- temporality を `"momentary"` に降格（現在の状況ではない）
- confidence を大幅に下げる（0.3 以下）

## 重複排除

### メッセージ内
- `seenContents` セットで同一 content の多重検出を防止
- 例: 「母が〜で母は〜」→ 1件のみ保存

### セッション間
- Phase 1 では analytics 側の集約クエリで処理（保存時の排除は行わない）
- 将来: 保存前に既存シグナルを照合し、evidence_count をインクリメント

## 危険な誤保存パターン

| パターン | リスク | 対策 |
|---------|--------|------|
| 「金がないから買わない」→ 経済的困窮 | 一時的な判断を長期状況と混同 | confidence 0.4、temporality "situational" |
| 「昔、転職を考えていた」→ 転職検討中 | 過去を現在と混同 | 過去形検出 → confidence 0.3 |
| 「実家に帰ります」→ 実家暮らし | 一時帰省を居住と混同 | 「暮らし/住」がない → temporality "momentary" |
| 「母音体系の違い」→ 母への言及 | 複合語の誤マッチ | 助詞パターン必須 |
| 友達の状況を話している → 本人の状況 | 主語の誤帰属 | Phase 2 で主語検出を追加（Phase 1 では対応不可） |

## canUseForDecision ルール

保存した理解を判断に使ってよい条件（既存 `canUseForDecision` 関数）:
1. confidence ≥ 0.4
2. evidence_count ≥ 2（alter_inferred の場合）
3. possibly_stale = false

**つまり単発の user_implied シグナルは判断には使えない。** 蓄積して evidence_count が上がった後に初めて判断根拠になる。
