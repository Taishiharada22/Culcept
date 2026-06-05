# SR A4-1 — source-cell consistency guard 実画像検証 所見

> 区分: **検証所見の記録**（A4-1 commit `03552611` の根拠）。VLM 不使用・sharp による deterministic 画像分析のみ。
> 目的: A4 guard が、A3 confidence net が捕まえられない **confident 誤読**（day28: 原稿コード → "" @0.90）を
>   画像側から deterministic に捕まえられるか / 真の空白を誤発火しないかを、CEO 提供の実ロスターで検証する。

---

## 0. 検証方法
- 対象: CEO 提供の July ロスター（実画像・1448×1086）。原田行 31 日。
- 手段: transcript から画像再抽出 → `cellContentMetric`（彩度 + 赤チャネル優位 + 暗インク）で各セル content score 算出 → `sourceCellConsistency.detectSourceMismatches`。**VLM は一切呼ばない**。
- rawCode: 抽出 smoke の出力（day28="" = 実際の失敗出力）。content: ground-truth 画像から算出。
  → これは A4 が守る実シナリオそのもの（「VLM が "" を出したが原稿には記号がある」）。

## 1. 結果

### 1.1 誤読の捕捉（最重要・PASS）
- **day28: content=0.951**（補正 geometry。crop 目視で水色 L セルを正捕捉）+ rawCode="" → **P1 `blank_with_content` 発火 ✓**。
- A3 net（confidence 由来）は同セルを発火できない（VLM は 0.90 の高 conf）。A4 は confidence を見ずに画像から捕捉。

### 1.2 metric の分離能（PASS）
- 色付きセル（BD/E/L/N/G/E-18/HREQ）: 30/31 が高スコア（0.3〜1.0）。
- 白セルの赤文字 H/HREQ: 赤チャネル優位（redness）+ 赤 pixel の彩度で検出。
- 清潔な白余白（表外）: **0.000**。

### 1.3 false-positive 耐性（白空白について PASS）
- 表内の明白な白領域 4 サンプル: **0.000 / 0.000 / 0.000 / 0.056** — 全て閾値 0.12 未満。
  → テクスチャのある grid 内白でも低スコア＝真の空白を誤発火しない（白空白について）。
- **CEO 提供 3 枚すべてが全セル彩色済み（blank セルなし）**。この roster family では「空欄 rawCode = 必ず read-miss」で、誤発火対象の空白自体が存在しない。

### 1.4 geometry が支配的リスク（C1 の実証）
- 初回 geometry（推定）で day31(E-18) が 0.000、day1(BD) が 0.098 と低出。crop 目視で「列ズレ」「9（公休数）列の巻き込み」と判明。
- 補正後 day31=0.979 に回復。→ **A4 の精度は geometry 精度に支配される**。
- 結論: 本番は **均一 colW 推定ではなく gridCalibration / dayColumns の確定値**を使い、geometry 不確実時は **fail-open（guard skip）**。これは readiness の C1 緩和そのもの。

## 2. 結論
- **A4 の核は実証された**: confident 誤読（day28）を画像から deterministic に捕捉し、清潔/テクスチャ白は誤発火しない。
- A4-1（pure: `cellContentMetric` + `sourceCellConsistency`）+ 25 unit tests を commit（`03552611`）。tsc baseline 1112 維持。

## 3. 残課題（wiring 前に詰める / CEO 判断）
1. **geometry 供給の確定**: A4-2 は `cellCropRegion(effectiveGeometry, day)` を使い、未校正時 fail-open。これが最重要前提（C1）。
2. **閾値の最終キャリブレーション**: 白空白は ≤0.056 で安全だが、**鉛筆書き/汚れ/罫線が濃い空白**を含む別形式ロスターが出たら誤発火率を再測定（このサンプルには存在しない）。閾値は config 化済（既定 high=0.12）。
3. **per-cell の正規化**: 一部の色セルが geometry jitter で低下。本番の確定 geometry なら解消見込みだが、A4-2 smoke で再確認。

## 4. scope / 禁止（本検証段階）
- 本検証は **読み取り専用**（VLM 不使用・保存/DB/production 非接触）。throwaway runner / crop は実行後削除（private-eval は git ignored）。
- A4-2（sharp IO content 抽出モジュール）/ A4-3（risk model + ShiftReviewGrid wiring）は **未着手・CEO 判断後**。
