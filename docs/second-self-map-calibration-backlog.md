# Second Self Map — Calibration Backlog（L3-c / L4-c・実データ後に較正）

> 2026-06-06 / CEO 方針: **固定値で運用 → 実データ蓄積後に較正**。現時点で tuning は実装しない（勘の調整を避ける）。
> 関連: `docs/second-self-map-l3b-mini-design.md` / `docs/second-self-map-l4b-closeout.md`（L4-c 方針）。

---

## 0. 原則
- κ / λ / K / threshold は **実 feedback・実 smoke・実使用データが十分溜まってから**較正する。
- 現時点では **固定値のまま運用**（下記）。tuning ロジックは実装しない。
- 較正は「勘の調整」でなく、実データの分布・誤り率に基づいて行う。

## 1. 現行固定値（運用中・凍結）
| param | 値 | 層 | 意味 |
|---|---|---|---|
| streakN | 2 | L3-a / L3-b-1 | explicitCorrection regime-change の連続数 |
| λ_leg | 0.5 | L3-a | legKey regime の pre-change 倍率 |
| λ_od | 0.7 | L3-b-1 | OD regime の倍率（leg より保守的） |
| K (streakK) | 4 | L3-b-2 | silent shift の recent 全一致数 |
| λ_silent | 0.8 | L3-b-2 | silent shift の倍率（最も緩い） |
| baselineMinTotal / minShare | 4 / 0.6 | L3-b-2 | silent の baseline 強度（not split） |
| κ {leg, context, global} | {3, 3, 1} | L4 | partial-pooling の shrinkage 強度（global は弱い seed） |

## 2. 較正時に見る指標（実データ後）
1. **selected / confirmation / explicitCorrection の比率** — 各信号がどれだけ発生するか。correction が稀なら L3-a/L3-b-1 の発火頻度が低い → streakN 見直し材料。
2. **false positive / false negative** — regime-change が「実際は変わっていないのに発火」（FP）/「変わったのに未発火」（FN）。λ/K/threshold の主較正軸。
3. **L3-b-2 silent shift は特に慎重に** — 最弱信号ゆえ FP が「勝手に忘れる地図」に直結。silent の FP 率を最優先で観測。配線前提が崩れたら配線判断を再考。
4. **belief の surface 率 / pooling 寄与** — L4 の κ が surface 過多/過少を生んでいないか（moderate+ surface の頻度）。
5. **観測蓄積量の分布** — legKey/OD あたりの観測数。cold-start（少数）が多ければ L4 の pooling 依存度が高い → κ_global の影響大。

## 3. 較正タスク（gated・実データ後）
- **L3-c**: streakN / λ_leg / λ_od / K / λ_silent / baseline 閾値 の較正。silent は特に慎重（FP 最優先）。
- **L4-c**: κ {leg, context, global} の較正。effSize 弱化が global-only over-surface を抑えているか確認。
- いずれも **実データ後に別 GO**。tuning ロジック（自動較正）は本バックログでは実装しない。

## 4. 状態
- 全 param は **§1 の固定値で main live / pure 着地**（L3-a/L3-b-1 live・L3-b-2 pure 未配線）。
- 較正は **保留**（実データ蓄積 + CEO 明示 GO まで）。次主フェーズ = Wave 2 Day Rehearsal。
