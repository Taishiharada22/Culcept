# SR A4 — source-cell visual consistency guard readiness（docs-only）

> 区分: **readiness（docs-only）**。設計のみ。**実装は CEO 判断後**。VLM は使わない（deterministic・画像のみ）。
> 動機: A3 read-miss messy smoke（`a90be12f`）で **day28 = 原稿「H」を VLM が "" + confidence 0.90 で出力**。
> confidence ベースの A3 net は発火せず。→ **VLM の confidence を信じず、原稿画像と抽出結果を直接突き合わせる** deterministic guard。

---

## 0. 前提・リスク・スコープ・なぜこれが最善か（CEO 要求の明示）

- **前提**: 取り込みの正確性を VLM の self-reported confidence に依存できない（実データで confident 誤読が発生）。原稿画像は確認画面まで保持されている（既存）。各日の cell 位置は既存 geometry（gridCalibration / `cellCropRegion`）で算出できる。
- **リスク**: 画像直接検査は **geometry 精度・背景テクスチャ・faint 文字（白セル赤H）** に敏感 → 閾値次第で false positive（flood）/ false negative（見逃し）。緩和を §4 に定義。
- **スコープ境界**: A4 = **source/result の存在不一致**を soft hint 化するだけ（**コードの正誤判定はしない**・hard block しない）。OCR 再実装や VLM 二重読みはしない。
- **なぜ最善か（最終目標＝世界最上級の取り込み体験）**: confident 誤読は confidence でも review の目視努力でも漏れる。**「原稿セルに何か見えるのに抽出が空欄」を機械が指し示す**ことで、人が見るべき1点に確実に誘導できる。これが「読めたふりを止める」原則の deterministic な実装。

---

## 1. 動機（day28 の実データ根拠）

| | 値 |
|---|---|
| 原稿 day28 | **H**（公休・白セルに薄い赤 H） |
| VLM 抽出 | **""**（空欄） |
| VLM confidence | **0.90**（高） |
| A3 net（confidence 由来） | **非発火**（高 conf 孤立空欄＝確実な休み扱い・D3） |

→ confidence は「読めなかった」と言っていない。必要なのは **source cell に視覚的存在があるのに rawCode が空欄** という **source/result mismatch** の画像由来検出。

---

## 2. 現状の足場（既存資産で組める根拠・file:line）

- **cell bbox**: `shiftGridGeometry.ts` の `cellCropRegion(geometry, day)`（L40）→ `x = gridLeft + (day-1)*colWidth` + 縦 `cropTop/cropHeight`（L44-51）。各日のセル領域を pixel で返す。
- **geometry 供給**: `ShiftGridGeometry`（gridLeft/colWidth/cropTop/cropHeight）。Persist 帯で `gridCalibration` 永続化済（座標のみ・raw 非保存）。`resolveEffectiveGeometry`（dayColumns / gridCalibration / effectiveGeometry の3層）。
- **pixel 分析**: `sharp`（依存済）で領域抽出 + チャネル統計（raw pixel / stats）。
- **hint 差込先**: `shiftDraftRiskModel.ts` の `detectDraftRisks` に新 `RiskKind = "source_mismatch"`（soft）を追加 → 既存 review panel / cell amber に乗る（blank_risk と同経路）。
- **確認画面**: ShiftReviewGrid は既に原稿画像インライン照合 + amber 表示の枠組みあり（A1B/A2B/A3）。

→ **新規は (a) per-cell content metric（IO・sharp）/ (b) mismatch 比較（pure）/ (c) risk model 統合**の3点のみ。

---

## 3. 設計

### 3.1 per-cell content metric（「視覚的存在」を測る）
各日の cell 領域（`cellCropRegion`）について、**背景（白〜オフホワイト＋紙テクスチャ）から有意に外れる pixel** を測る。
- **彩度ベース**（色付きセル: E=pink / N=blue / L=lightblue / G=green / BD=pink / E-18=pink）→ HSV の saturation が閾値超の pixel 比率。
- **赤文字ベース**（白セルの H / HREQ = 白背景に赤文字）→ 赤チャネル優位（R≫G,B）かつ低 luminance の pixel 比率（cell 中心の text 帯）。
- **複合 content score** = max(彩度比率, 赤文字比率) を 0..1 で返す。
- **texture 耐性**: cell の**中心矩形**（端の枠線・隣セル滲みを避ける内側 60-70%）だけサンプリング + 適応閾値（行全体の背景中央値を基準にする）。

### 3.2 mismatch ルール（非対称・primary に集中）
| ケース | 条件 | 判定 | 重要度 |
|---|---|---|---|
| **P1（最重要・day28）** | `rawCode==""` ∧ content score 高 | **source_mismatch（読み落とし疑い）** | ★ 最重要 |
| P2 | `rawCode` 非空 ∧ content score 極低（空っぽに見える） | source_mismatch（幻覚疑い） | 次点 |
| 整合 | `rawCode` 非空 ∧ content あり / `rawCode==""` ∧ content なし | flag なし | — |

- **本質は P1**（空欄なのに原稿に存在）。P2 は任意（false positive が出やすいので保守的 or 後回し）。
- **コードの正誤は判定しない**（P3「非空＋content」は「何かある」までしか言えない）。それは人の照合 + A1 confusable の領域。

### 3.3 severity / 表示
- **soft のみ**（`HARD_KINDS` 非参加・**保存 block しない**）。blank_risk と同列で review へ。
- cell amber + panel（「原稿にコードが見える日があります。空欄になっていないか確認してください」safe-copy）。
- A3 blank_risk（confidence 由来）と **相補**: A3=「VLM が低 conf」、A4=「VLM は高 conf だが画像に存在」。両方 soft で review に集約。

---

## 4. 課題と緩和（批判的）

| # | 課題 | 緩和 |
|---|---|---|
| C1 | **geometry 精度**: `cellCropRegion` が正しい bbox を返すには gridCalibration が正確に要る。ズレると全セル false mismatch | geometry が未校正/不整合なら guard を **skip（fail-open）**。校正済（dayColumns or gridCalibration 確定）時のみ作動。Persist の校正 UX を前提 |
| C2 | **背景テクスチャ**（紙質ノイズで偽 content） | cell 中心の内側矩形のみ + **行背景の中央値を基準にした適応閾値** + 彩度（テクスチャは低彩度）優先 |
| C3 | **白セル赤文字（faint H/HREQ）検出** | 赤チャネル特化（R−max(G,B) 比率）で薄い赤も拾う。閾値は smoke で調整 |
| C4 | **閾値キャリブレーション** | pure 層は **content score（数値）を受け取るだけ**。閾値は config（A4-1 では既定 + 上書き可）。smoke で実データ調整 |
| C5 | **false positive（flood）** | **P1 に絞る** + 閾値保守的 + soft のみ。flood する場合は閾値を上げる/中心サンプリング縮小。「全部疑わず、明確に存在するのに空欄」だけ |
| C6 | **BD（blank day コード）の扱い** | BD は**コード**（pink セル）。rawCode=="BD" なら整合。rawCode=="" かつ pink セル → P1 で拾う（正しく flag） |

---

## 5. 実装分割（pure 先行・各 step は CEO GO 後）

- **A4-1（pure・「pure/risk model だけで収まる」候補）**: `sourceCellConsistency.ts` — 入力 = `Array<{day, rawCode, contentScore}>` + config（閾値）→ 出力 = `SourceMismatchHint[]`（P1/P2・soft・safe-copy message）。**IO なし・throw しない・deterministic**。+ 単体 test（P1/P2/整合/閾値/safe-copy）。
- **A4-2（IO・dev smoke）**: sharp で source 画像 → `cellCropRegion(geometry, day)` ごとに content score を算出する pure-ish 関数（IO は sharp 読み取りのみ）。dev-only runner で **day28 ケース（H→""）を guard が P1 検出するか実画像検証**（VLM 不要・画像のみ）。
- **A4-3（wire）**: `shiftDraftRiskModel` に `source_mismatch`（soft）統合 + ShiftReviewGrid 表示（cell amber + panel）+ render contract。geometry 不正時 fail-open。

---

## 6. CEO 判断を仰ぐ点（実装着手前 gate）

| # | 論点 | 選択肢 | Claude 推奨 |
|---|---|---|---|
| **D1** | content metric | (A) 彩度＋赤文字 複合 / (B) 彩度のみ（H/HREQ 拾えず） | **(A)**（day28=赤H を拾うため赤文字検出必須） |
| **D2** | mismatch 方向 | (A) **P1 のみ**（空欄×存在） / (B) P1+P2（双方向） | **(A) で開始**（P2 は false positive 多・後追加） |
| **D3** | severity | soft 固定（保存 block しない） | **soft 固定**（A3/confusable と同方針） |
| **D4** | geometry 不正時 | fail-open（skip） / fail-closed（全 flag） | **fail-open**（誤校正で flood させない） |
| **D5** | 実装分割 | A4-1（pure）→ A4-2（IO smoke）→ A4-3（wire） | **採用**。A4-1 が pure のみなら commit 可・A4-2/3 は diff preview 停止 |

---

## 7. scope / 非 scope / 禁止

### scope
- 原稿セルの**視覚的存在 vs 抽出空欄**の deterministic 不一致検出（soft hint）。

### 非 scope
- コードの**正誤**判定（A1 confusable / 人の照合の領域）/ OCR 再実装 / VLM 二重読み / read-miss を「直す」こと（あくまで review へ回す）。

### 禁止
```
本 readiness 段階: 実装（設計のみ）
全般: VLM 実行 / 保存再実行 / DB write / PLAN_SHIFT_IMPORT_SAVE=true /
  production / push / PR / deploy / raw 画像・base64・VLM raw response commit
```

---

## 8. 結論

- A3（confidence 由来）が捕まえられない **confident 誤読（day28: H→""@0.90）** を、**画像側から deterministic に**捕まえる相補的安全網。
- 本質は **P1: rawCode="" なのに原稿セルに視覚的存在** の検出。soft で review に回す（保存 block なし）。
- 既存資産（`cellCropRegion` + gridCalibration + sharp + risk model）で組める。新規は metric（IO）+ 比較（pure）+ 統合の3点。
- **本書は readiness（docs-only）。実装は CEO の D1-D5 判断後**。pure の A4-1 から着手予定。
