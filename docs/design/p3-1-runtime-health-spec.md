# P3-1: Runtime Health 4指標版 — 確定仕様

> Status: **仕様固定** (2026-04-08)
> Implementation: **2週間のデータ蓄積後** に collector/report を実装
> Grade: **まだ出さない**（指標の実測分布を見てから判断）

---

## 1. 4指標の定義

### 1-1. `contradictionFireRate`

| 項目 | 値 |
|------|---|
| 定義 | 期間内に、この軸を含む矛盾がユーザーの derived facts に出現した割合 |
| 計算式 | `contradictionFireCount / eligibleUserCount` |
| データ源 | `stargazer_analytics.metadata.derived_facts[]` のうち `sourceType === "contradiction"` かつ `sourceAxes` にこの軸を含むもの（**Alter パイプライン経路**） |
| 集計単位 | 軸 × 月（30日ローリング） |
| 暫定閾値 | `>= 0.05` で healthy（eligible ユーザーの 5% 以上で発火） |
| 備考 | `AxisCoverage.contradiction === false` の軸は `no_data`（ルール自体が存在しないため） |

### 1-2. `insightCardDisplayRate`

| 項目 | 値 |
|------|---|
| 定義 | 期間内に、この軸を参照するインサイトカードが Home で表示された割合 |
| 計算式 | `insightCardDisplayCount / eligibleUserCount` |
| データ源 | `stargazer_analytics` の `event_type = 'home_insight_displayed'` かつ `metadata.source_axes` にこの軸を含むもの（**Home Insights パイプライン経路** — Alter とは独立） |
| 集計単位 | 軸 × 月（30日ローリング） |
| 暫定閾値 | `>= 0.03` で healthy（eligible ユーザーの 3% 以上で表示） |
| 備考 | `AxisCoverage.insight === false` の軸は `no_data` |

### 1-3. `derivedFactContribution`

| 項目 | 値 |
|------|---|
| 定義 | 期間内に、この軸が derived fact の `sourceAxes` に含まれた回数（selectFacts 前の全候補） |
| 計算式 | `Σ (derived_facts[].sourceAxes にこの軸が含まれる回数)` |
| データ源 | `stargazer_analytics.metadata.derived_facts[]` の全エントリ（`includedInPrompt` の true/false 両方をカウント）（**Alter パイプライン経路**） |
| 集計単位 | 軸 × 月（30日ローリング） |
| 暫定閾値 | `>= 5` で healthy（月に5回以上候補に挙がる） |
| 備考 | `includedInPrompt` 修正（前提4修正）により、フィルタ前の全候補が記録されるようになった |

### 1-4. `derivedFactAdoptionRate`

| 項目 | 値 |
|------|---|
| 定義 | この軸を含む derived fact のうち、selectFacts を通過して prompt に採用された割合 |
| 計算式 | `(sourceAxes にこの軸を含む && includedInPrompt === true) / (sourceAxes にこの軸を含む全件)` |
| データ源 | `stargazer_analytics.metadata.derived_facts[]` の `includedInPrompt` フィールド（**Alter パイプライン経路**） |
| 集計単位 | 軸 × 月（30日ローリング） |
| 暫定閾値 | `>= 0.20` で healthy（候補の 20% 以上が採用される） |
| 備考 | `derivedFactContribution === 0` の場合は分母ゼロ → `no_data` |

---

## 2. ステータス体系（5値）

現行の4値（healthy / weak / ghost / frozen）に `no_data` を追加。

| ステータス | 意味 | 判定条件 |
|-----------|------|---------|
| `healthy` | 構造・runtime ともに十分 | Layer 1 合格 AND runtime 4指標が暫定閾値以上 |
| `weak` | 構造は接続されているが runtime が不十分 | Layer 1 合格 AND runtime 指標が閾値未達 |
| `ghost` | **構造的に未接続**（質問数0 or Registry未登録） | `questionCount === 0` or Registry 未登録 |
| `no_data` | 構造は接続済みだが **runtime データが未蓄積** | Layer 1 合格 AND runtime = null（collector 未実行 or データなし） |
| `frozen` | 凍結軸 | `isFrozenAxis(entry) === true` |

### `ghost` vs `no_data` の違い

- `ghost` = **構造的問題**。質問が1つもマップされていない。修正するにはコード変更が必要
- `no_data` = **時間的問題**。構造は接続されているが、まだユーザーデータが十分に蓄積されていない。待てば解決する

### `insufficient_sample` ガード

`eligibleUserCount < 10` の場合、runtime 指標は信頼できないため:
- ステータスを `no_data` に強制（`weak` に落とさない）
- `statusReason` に `"insufficient_sample (n=<count>)"` を記録
- 閾値判定はスキップ

---

## 3. データ経路マップ

```
Alter パイプライン (alter/route.ts POST)
├── derived_facts[] → contradictionFireRate (sourceType=contradiction)
├── derived_facts[] → derivedFactContribution (全 sourceAxes)
└── derived_facts[] → derivedFactAdoptionRate (includedInPrompt)

Home Insights パイプライン (home-insights/route.ts)
└── home_insight_displayed → insightCardDisplayRate (source_axes)
```

2つのパイプラインは独立して動作する。collector 実装時は両方のテーブルから集計する必要がある。

---

## 4. 集計パラメータ

| パラメータ | 暫定値 | 根拠 |
|-----------|--------|------|
| 集計期間 | 30日ローリング | 月次の安定した傾向を見るため |
| `eligibleUserCount` 定義 | 期間内に Stargazer 観測を1回以上完了したユーザー数 | 観測未実施ユーザーは母集団に含めない |
| `insufficient_sample` 閾値 | `< 10` | 統計的に意味のある率を出すための最低サンプル |
| 全暫定閾値 | 上記各指標を参照 | **実測分布を見て再校正する**。初回は保守的に低く設定 |

---

## 5. 今は実装しない範囲

| 項目 | 理由 |
|------|------|
| `positiveReactionRate` 軸レベル実装 | **CEO 禁止**。ユーザーの反応は軸レベルに帰属させられない |
| `runtimeScore` 算出 | grade 解禁前なので不要 |
| grade (`A/B/C/D/F` 等) | 実測分布を見てから判断 |
| Layer 2 cron | collector 実装後 |
| 閾値の自動調整 | 実測データが十分に蓄積されてから |
| `overall_score` (軸横断スコア) | grade と同時に解禁 |

---

## 6. 型の更新方針

現行 `RuntimeHealth` interface を仕様に合わせて更新する（collector 実装時）:

```typescript
// 現行 → 更新後
export interface RuntimeHealth {
  periodStart: string;
  periodEnd: string;
  eligibleUserCount: number;
  // 4指標
  contradictionFireCount: number;
  contradictionFireRate: number;
  insightCardDisplayCount: number;     // renamed: insightCardSelectedCount → insightCardDisplayCount
  insightCardDisplayRate: number;
  derivedFactContribution: number;
  derivedFactAdoptionRate: number;
  // 削除: positiveReactionRate (軸レベル実装禁止)
  // 削除: runtimeScore (grade解禁前は不要)
  sampleSize: number;                  // = eligibleUserCount（後方互換）
}
```

実際の型変更は **collector 実装時** に行う。今は仕様文書としてのみ固定。
