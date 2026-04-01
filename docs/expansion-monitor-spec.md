# Expansion Monitor — 運用基準仕様書

> CEO承認: 2026-04-01
> API: `GET /api/ceo/expansion-monitor`
> 閾値: `lib/stargazer/expansionTuning.ts`

---

## Health Grades 定義

| Grade | 意味 |
|-------|------|
| `healthy` | 基準内。対応不要 |
| `caution` | 基準ギリギリ。1-2週間の推移を見る |
| `needs_fix` | 基準外。閾値調整 or 質問見直しが必要 |
| `no_data` | データ不足。判定不能 |
| `critical` | 安全違反。即時調査 |

---

## 判定ルール

### completion（回答完了率）

| 条件 | Grade |
|------|-------|
| completionRate >= 80% | `healthy` |
| 60% <= completionRate < 80% | `caution` |
| completionRate < 60% | `needs_fix` |
| データなし | `no_data` |

> served = `raw_answers.expansionAnswer` が存在するセッション数
> answered = `axis_snapshots` に `exp_` レコードがあるユーザー日数

### lightness（日次の軽さ）

| 条件 | Grade |
|------|-------|
| 直近7日の p90 平均 <= 8問 | `healthy` |
| 8問 < p90 平均 <= 9問 | `caution` |
| p90 平均 > 9問 | `needs_fix` |
| データなし | `no_data` |

**維持目標:**
- p90 <= 8問/セッション
- p95 <= 9問/セッション

### responseTime（回答時間）

| 条件 | Grade |
|------|-------|
| 全軸の median が 1.5s〜6s の範囲内 | `healthy` |
| いずれかの軸が範囲外 | `caution` |
| データなし | `no_data` |

**目安:**
- median 3〜6秒: ちょうどよい
- median < 1.5秒: 直感押し（浅すぎる）
- median > 6秒: 質問が重い
- p90 > 10秒: 重い外れ値あり

### coreIsolation（core逆流チェック）

| 条件 | Grade |
|------|-------|
| expansion variant_id で core 軸の記録なし | `healthy` |
| 1件でもあり | `critical` |

---

## アラートカテゴリ

| category | level | 意味 | 対処 |
|----------|-------|------|------|
| `safety` | critical | 1日1問超過 / core逆流 | コード調査。即時修正 |
| `completion` | critical/warning | 回答完了率が基準外 | 質問UXの見直し。スキップ原因の調査 |
| `response_time` | warning | 回答時間が基準外 | 質問文の見直し（重すぎる/浅すぎる） |
| `lightness` | warning | セッションが重い | expansion混入頻度の見直し |
| `serving_bias` | warning | 出題が特定軸に偏っている | セレクタの優先度ロジック見直し |
| `release_bias` | warning | visible到達が特定軸に偏っている | 出題条件 or 質問の質の見直し |
| `under_served` | info | 出題されていない軸がある | 出題条件（EXPANSION_MIN_SESSIONS等）の緩和検討 |
| `low_growth` | warning | 出題済みだがvisible未到達 | 質問の質 or EXPANSION_EVIDENCE_PRECISION の見直し |
| `info` | info | 出題実績なし等 | 対象ユーザーの条件到達を待つ |

---

## 「育たないのか、出ていないのか」の切り分け

```
visibleRate が低い
  ├─ servedCount = 0 → category: under_served
  │   → 原因: 出題条件が厳しい / confidence が育っていない
  │   → 対処: EXPANSION_MIN_SESSIONS, NEAR_EMERGING_CONFIDENCE を緩和
  │
  └─ servedCount > 0 → category: low_growth
      → 原因: 質問の弁別力が低い / precision が育ちにくい
      → 対処: 質問文の改善 / EXPANSION_EVIDENCE_PRECISION を上げる
```

---

## 定点観測スケジュール

| 時点 | 見るもの | 判断 |
|------|---------|------|
| **1週間** | completionRate / lightness p90,p95 | 安全性の確認 |
| **2週間** | 軸別 servedCount / responseTime | 配信と体験の確認 |
| **1ヶ月** | visibleRate 軸間格差 / precision 育ち / healthGrades 全体 | 価値の確認 |

---

## 閾値一覧（expansionTuning.ts）

| パラメータ | 現在値 | 用途 |
|-----------|--------|------|
| `COMPLETION_RATE_HEALTHY` | 80 | 完了率 healthy 下限 |
| `COMPLETION_RATE_CAUTION` | 60 | 完了率 caution 下限 |
| `RESPONSE_TIME_TOO_FAST_MS` | 1500 | 直感押し判定 |
| `RESPONSE_TIME_IDEAL_MAX_MS` | 6000 | 質問重さ判定 |
| `RESPONSE_TIME_P90_HEAVY_MS` | 10000 | p90 重さ判定 |
| `LIGHTNESS_P90_TARGET` | 8 | p90 維持目標 |
| `LIGHTNESS_P95_TARGET` | 9 | p95 維持目標 |
| `AXIS_BIAS_RATIO_THRESHOLD` | 3 | 偏り warning 比率 |
| `HEAVY_SESSION_THRESHOLD` | 10 | 重いセッション判定 |
