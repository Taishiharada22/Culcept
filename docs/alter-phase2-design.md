# Alter Understanding System — Phase 2 設計

## 目標
Phase 1 で「観測→記録→初歩的な反映」のパイプラインが完成した。
Phase 2 は「この AI は私を見ている」とユーザーが感じる体験を作る。

## Phase 1 → Phase 2 の質的転換

| Phase 1 | Phase 2 |
|---------|---------|
| シグナルを検知して記録する | 蓄積したシグナルから洞察を生成する |
| 単一ターンのパターン検出 | 複数セッションを跨いだパターン認識 |
| Life Context を保存する | 保存した Life Context を判断に使う |
| Micro Insight を1回提示する | 提示後のユーザー反応を学習する |
| followup を記録する | followup から判断精度を改善する |

## 4つの柱

### 1. Micro Insight v2 — 「気づき」の深化
Phase 1 では4種のシグナルを検知し収束で提示。Phase 2 では:
- **Cross-Session Convergence**: 異なるセッションのシグナルを結合
- **Reaction Learning**: 提示後のユーザー反応（受容/否定/無視）を記録し、次回の提示精度を向上
- **Contextual Timing**: emotional_load や会話の流れに応じた提示タイミングの最適化
- 詳細: `docs/alter-micro-insight-v2.md`

### 2. Life Context v2 — 「理解」の活用
Phase 1 では Life Context シグナルを抽出・保存。Phase 2 では:
- **Context-Aware Judgment**: 蓄積した人物・環境情報を判断に反映（「彼女との問題で前にも…」）
- **Evidence Accumulation**: 同一事実の複数回確認で confidence を上げる
- **Staleness Detection**: 30日以上未確認のコンテキストにフラグを立てる
- **Contradiction Detection**: 以前の情報と矛盾する新情報を検出
- 詳細: `docs/alter-life-context-v2.md`

### 3. Pattern Accumulation — 「傾向」の蓄積
Phase 1 にはなかった新機能:
- **Decision Pattern Tracking**: 同種の判断での一貫した傾向（いつも守り寄り、等）を記録
- **State Pattern**: 曜日・時間帯・季節ごとの心理状態パターン
- **Response Pattern**: どういう提示に対してどう反応するかのパターン
- 詳細: `docs/alter-pattern-accumulation.md`

### 4. Followup Integration — 「結果」の循環
Phase 1 の followup API（GET/POST）は記録のみ。Phase 2 では:
- **Outcome Feedback**: 「やった→よかった/後悔した」のフィードバックを次回の判断重みに反映
- **Regret Direction Learning**: 「やって後悔」vs「やらなくて後悔」の個人傾向を学習
- **Proactive Recall**: 類似状況で過去の結果を参照（「前に似た判断をしたとき…」）

## アーキテクチャ

```
┌───────────────────────────────────────────────┐
│                 Phase 2 追加層                  │
│                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Pattern  │ │ Context  │ │ Reaction     │   │
│  │ Store    │ │ Recall   │ │ Learning     │   │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       │            │              │            │
│       ▼            ▼              ▼            │
│  ┌─────────────────────────────────────┐       │
│  │     Accumulated Understanding       │       │
│  │  (パターン + コンテキスト + 反応)     │       │
│  └──────────────┬──────────────────────┘       │
└─────────────────┼──────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│          Phase 1 既存パイプライン          │
│  State → ForceBalance → ActionShape     │
│  MicroInsight → Prompt Injection        │
│  LifeContext → Fire-and-forget Save     │
└─────────────────────────────────────────┘
```

## DB スキーマ追加（提案）

### `stargazer_alter_patterns`
| column | type | 説明 |
|--------|------|------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| pattern_type | text | "decision" / "state" / "response" |
| pattern_key | text | パターンの識別子（例: "protect_tendency"） |
| observation_count | int | 観測回数 |
| pattern_data | jsonb | パターンの詳細データ |
| confidence | float | パターンの確信度 |
| last_observed | timestamptz | 最後に観測された日時 |
| created_at | timestamptz | 作成日時 |

### `stargazer_alter_context`
| column | type | 説明 |
|--------|------|------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| category | text | "person" / "environment" / "emotion" / "life_stage" |
| content | text | 理解の内容 |
| source | text | EpistemicSource |
| temporality | text | Temporality |
| confidence | float | 確信度 |
| evidence_count | int | 裏付け観測数 |
| last_confirmed | timestamptz | 最後に確認された日時 |
| possibly_stale | boolean | 30日以上未確認 |
| created_at | timestamptz | 作成日時 |

### `stargazer_alter_reactions`
| column | type | 説明 |
|--------|------|------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| insight_type | text | MicroInsightPresentationType |
| signal_types | text[] | 収束したシグナルのタイプ群 |
| reaction | text | "accepted" / "denied" / "ignored" / "explored" |
| response_text | text | ユーザーの反応テキスト（要約） |
| created_at | timestamptz | 作成日時 |

## 実装順序

1. **DB migration 作成** — 3テーブル追加（CEO承認後に実行）
2. **Life Context v2** — Context Recall + Evidence Accumulation（判断への直接的な影響が最も大きい）
3. **Pattern Accumulation** — Decision/State/Response パターンの記録開始
4. **Micro Insight v2** — Cross-Session + Reaction Learning
5. **Followup Integration** — Outcome Feedback + Regret Learning

## 成功基準

| 指標 | Phase 1 水準 | Phase 2 目標 |
|------|-------------|-------------|
| Micro Insight 注入率 | 未計測 | 相談3回目以降で30%+ |
| Insight 受容率 | 未計測 | 60%+（ignored < 30%） |
| followup 実行報告率 | 未計測 | 15%+ |
| Life Context 判断活用率 | 0%（保存のみ） | confidence≥0.5 のコンテキストを判断に参照 |
| ユーザー体感 | 「まあまあ答えてくれる」 | 「この AI は自分のことを覚えている」 |

## リスクと制約

| リスク | 対策 |
|--------|------|
| パターンの過学習（少数データで断定） | confidence ≥ 0.4 + evidence_count ≥ 2 のルールを堅持 |
| 古いコンテキストによる誤判断 | possibly_stale フラグ + 30日ルール |
| 分析の暴露（「あなたのパターンは…」） | Phase 1 の NG表現フィルタを継承 |
| DB クエリ増加によるレイテンシ | 判断に使うクエリは1-2本に制限、キャッシュ活用 |
