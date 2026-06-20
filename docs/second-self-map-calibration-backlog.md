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

## full-path activation 後の calibration 候補（2026-06-07・実データ後較正）
- ★**convergence 過敏（やや厳しめ）**: full-path ON で `余白30分 + 移動90分 + 夕方 + 高密度` の transition が「重なりやすい（convergence）」判定。buffer は正（sufficient）だが friction_high(実移動90分) + strain_high で conv high。仮説トーンゆえ非 blocking だが、`friction.levelThresholds.highMin`(0.67) / strain 蓄積係数 / convergence の factors≥2 条件が **やや敏感**な可能性。実データ（FP/FN・ユーザー納得感）後に friction_high 閾値 or convergence 条件を較正候補。
- 関連: full-path で friction が実 travel 由来になり、長距離移動が friction_high を立てやすい。徒歩短距離と車長距離の friction 差が適切かも実データで観測。

## Batch 2 energy activation 後の calibration 候補（2026-06-08）
### energy 自体（実測で安全と確認・較正は後）
- ★**energy は非常に保守的（過悲観でない）**: 実エンジン再現で energy=null(OFF)/1.0/0.5/0.0 を比較。packed 日は完全同一・moderate 日でも最悪 energy=0 で内部 step 1 つが moderate→high のみ（outlook/convergence/marker 不変）。`energyBudgetWeight=0.5`（最大 −25%）。
- calibration 候補: 実データ（ユーザーの energy 記録分布 + 納得感）後に、energy の効きが**弱すぎないか**（状態次元として体感に出るか）を観測。出なすぎるなら weight を 0.5→0.6〜0.7 へ慎重に。★**実データ無しで weight magic number を弄らない**（過適合回避）。

### ★Batch 3 で対応する baseline 所見（energy 非依存・full-path 自体の marker/copy/calibration 課題）
スクショ（6/8 packed・実在の日）が露呈。energy ではなく full-path baseline の課題。Batch 3 の主対象:
- **(A) strain 飽和**: 6/8 は peakStrain score=7.34 vs high 閾値 0.67×3=2.01（**3.6 倍**）→ 全 step が high。忙しい日に strain の**動的レンジが消失**し診断の情報量が落ちる。候補: score 倍率/budget/閾値の見直し、または strain に飽和カーブ（log 等）を入れて high の中の濃淡を取り戻す。★閾値の数値調整は実データ後（calibration_later）、構造（飽和カーブ）は code_now 候補。
- **(B) copy mismatch**: 「余白 145 分（buffer sufficient）」でも strain_high+friction_high の 2 factor で convergence marker が出て、見出し「**この前後は予定が重なりやすいかもしれません**」が余白と矛盾して見える（why 行 = explainConvergenceMarker は正直）。「重なりやすい」は本来 buffer_short の語。**factor 組合せ別に見出しを出し分ける**のが構造的修正（code_now 候補）。
- **(C) marker 密度**: 3/3 transition が全部フラグ → 「警告だらけ」の認知負荷。**情報を消すのでなく優先順位**（magnitude 最強のみ marker・他は控えめ／day-level に寄せる）。
- **(D) convergence magnitude**: marker は有無のみで強度を出していない（CEO 当初狙い「magnitude + recovery per-marker なぜ」）。**生数値なし・仮説トーン**で段階表現。recovery marker「ここは一息つけそうです」の uniform（per-marker なぜ不在）も対象。
- ★**red line**: いずれも生スコア非表示・仮説トーン・read-only 診断（最適化/予定変更しない）を維持。「重なりやすい」を別の嘘コピーに置換しない（factor に忠実な語へ）。
