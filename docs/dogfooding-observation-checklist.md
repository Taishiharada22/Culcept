# 創業者ドッグフーディング観測チェックリスト

> 目的: 4機能が「邪魔でないか」「戻ってくるか」を3日間で判定する

---

## 1. 機能別ログ・確認観点

### Experiment Engine（今週のチャレンジ）

| 観点 | ログソース | 見るもの |
|------|-----------|---------|
| 提案が表示されたか | `stargazer_experiment_metrics` event=viewed | viewed 件数 |
| スキップ率 | event=skipped / event=proposed | 即スキップ = 邪魔の兆候 |
| 報告率 | event=completed / event=accepted | 受けたのに報告なし = 忘れた or 面倒 |
| 驚きレベル | `stargazer_experiment_reports.surprise_level` | 1ばかり = 実験が浅い |
| would_repeat | 同上 | false = 二度とやりたくない |
| reflection 有無 | reflection IS NOT NULL | 自由記述を書くほど関与したか |

**最優先確認**: 「カードを見て即スキップ」が起きているか

### Decision Engine（判断相談）

| 観点 | ログソース | 見るもの |
|------|-----------|---------|
| 利用有無 | `stargazer_decision_log` | 1日1回以上使ったか |
| プリセット vs 自由入力 | same, input_type | 自由入力が出始めたら定着の兆候 |
| 納得感 | satisfaction_rating | 3以上が7割超えるか |
| ReasonTrace 展開率 | （フロント計測なし・体感） | 「なぜこの判断？」を開くか |
| 再利用 | 翌日も使ったか | 3日連続なら定着 |

**最優先確認**: 2日目以降に自発的に開くか

### Self vs Oracle（自己予測）

| 観点 | ログソース | 見るもの |
|------|-----------|---------|
| 予測入力率 | `stargazer_svo_sessions` | 開始/完了の差 = 離脱率 |
| 答え合わせ完了率 | verify 件数 | 翌日の答え合わせまで到達するか |
| Oracle正答率 | scenario.oracleCorrect | 50%未満 = モデル精度不足 |
| 驚き体験 | Oracle が当たった時のリアクション | 「当たってる」感が出るか |

**最優先確認**: 答え合わせまで戻ってくるか

### Daily Intervention（今日の状態推定）

| 観点 | ログソース | 見るもの |
|------|-----------|---------|
| 表示されたか | API呼び出しログ | エラー率 |
| 内容の的確さ | 体感フィードバック | 「合ってる」と感じるか |
| ReasonTrace 展開 | 体感 | 根拠を確認したくなるか |
| 邪魔感 | 体感 | 「毎日同じことを言われる」感 |

**最優先確認**: 読み飛ばされていないか

---

## 2. 3日後集計項目

### 定着指標（最重要）

| 指標 | 合格ライン | 計測方法 |
|------|-----------|---------|
| **3日連続 Engine ページ訪問** | 3/3 | アクセスログ or 体感 |
| **自発的再訪問** | Day 2-3 で催促なしに開く | 体感 |
| **Experiment スキップ率** | < 50% | metrics: skipped / proposed |
| **Decision 利用回数** | 3日で3回以上 | decision_log 件数 |
| **SvO 答え合わせ完了率** | > 50% | verify / predict 比率 |

### 品質指標

| 指標 | 合格ライン | 計測方法 |
|------|-----------|---------|
| Decision 納得感 | 平均 3.0 以上 | satisfaction_rating |
| Experiment 驚きレベル | 平均 2.0 以上 | surprise_level |
| Oracle 正答率 | > 50% | oracleCorrect 集計 |
| DailyIntervention 的中感 | 「だいたい合ってる」 | 体感 |

### 邪魔指標（赤信号）

| 兆候 | 判定 |
|------|------|
| Experiment を見て即スキップ | 提案内容 or 表示タイミングが悪い |
| Decision を1度も使わない日がある | 導線が弱い or 必要性を感じない |
| SvO の答え合わせに戻らない | 翌日の導線が弱い or 興味が薄い |
| DailyIntervention を読み飛ばす | 内容が浅い or 毎日同じ |
| Engine ページ自体を開かない | 機能群全体が刺さっていない |

---

## 3. 3日後の判定

| 結果 | 次のアクション |
|------|---------------|
| 3日連続訪問 + 邪魔兆候なし | 精度改善（BeliefSet充実 → Experiment精度向上） |
| 訪問するが一部機能スキップ | スキップされた機能の改善 or 削除検討 |
| 2日目以降訪問しない | Engine ページの価値提案自体を再設計 |

---

## 4. 今やらないこと

- avoidance / fixation パターン検出
- Layer 5（Human API）
- 通知・リマインダー
- 複数実験の同時提案
- ReasonTrace のフロント計測埋め込み
