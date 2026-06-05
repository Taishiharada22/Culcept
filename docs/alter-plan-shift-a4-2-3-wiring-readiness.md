# SR A4-2 / A4-3 — 実行時アーキテクチャ + wiring readiness（docs-only）

> 区分: **readiness（docs-only）**。**実装は CEO GO 後**。A4-1（pure core + 実証）は `03552611` / `2ad0234c` で着地済。
> 本書は A4 guard を **どこで・いつ動かすか**（runtime）と **どう review に出すか**（wiring）を確定する。

---

## 0. 位置づけ
- A4-1 で **pure core を実証済**: day28（VLM が "" と読んだ実セル）を content 0.951 で捕捉し P1 発火、真の白は ≤0.056（誤発火なし）。
- 残るは「verified metric を実 review 画面で動かす」配線。本書はその **runtime 決定 + UI wiring** を扱う。

## 1. runtime 決定（核心）

### 1.1 重要な気づき: pure metric は runtime 非依存
`computeCellContentStats(rgb: ArrayLike<number>)` は **連続 RGB 配列**を取るだけ。sharp の raw buffer でも、**Canvas `getImageData` の RGBA（alpha 除去）**でも同一に動く。→ サーバ sharp に縛られない。

### 1.2 sequencing の制約
- 抽出（VLM）→ **review 画面で geometry 校正（gridCalibration）** → の順。geometry は **抽出時点では未確定**、review でユーザが合わせる（既存 Persist-2/3）。
- ∴ A4 guard は **review 画面で・geometry 解決後に**動かすのが自然。抽出パイプライン（server action）には足さない。

### 1.3 採用案: **client Canvas（A 案・推奨）**
- ShiftReviewGrid は既に **`imageSrc`（原稿画像）+ 解決済 `geometry`（`cellCropRegion` で画像自然座標のセル領域）+ cells（rawCode）** を保持（grep 確認済: L76/161、`cellCropRegion` は gridLeft/colWidth/imageWidth で算出）。
- 手順: offscreen canvas に imageSrc を自然解像度で描画 → 各 day で `cellCropRegion(geometry, day)` の**内側領域**を `getImageData` → RGBA→RGB → `computeCellContentStats` → `cellContentScore` → `detectSourceMismatches`。
- 利点: **verified pure metric を無改変で再利用** / サーバ往復なし / 画像再送なし / geometry 校正に反応して再計算。
- 同一オリジン/データ URL の自作画像なので **canvas taint なし**（getImageData 可）。

### 1.4 不採用: server action（B 案）
- review → server に画像 + geometry 送信 → sharp → hints。**画像の再送/保管が必要**で配線が重い。client で足りるため不採用（必要時の代替として記録）。

## 2. geometry-timing（C1 緩和の具体化）
- guard 発火条件: **geometry が解決済**（`gridCalibrationApplied` or dayColumns 由来の有効 geometry）かつ imageSrc あり。
- 未校正 / imageW・H・dayCount mismatch（`gridCalibrationApplied=false` の不整合）時は **guard dormant（fail-open）** — 誤 geometry で flood させない。
- A4-1 検証で実証済: geometry がズレると正セルが 0.000 に落ちる → **確定 geometry でのみ作動**が必須。

## 3. A4-2 実装分割（client adapter）
- **A4-2a（pure 寄り・test 可）**: `cellContentFromImageData.ts` — 入力 = `ImageData`（or `{data, width, height}`）+ `CropRegion` + innerFraction → 内側矩形を切り出し RGBA→RGB → `computeCellContentStats` を呼ぶ薄い adapter。**DOM 非依存**（ImageData 型のみ）。synthetic ImageData で単体 test。
- **A4-2b（review 効果・dev smoke）**: ShiftReviewGrid に effect 追加 — imageSrc を offscreen canvas 描画 → 各 day region → A4-2a → `SourceCellSignal[]` → `detectSourceMismatches`。geometry 未解決なら skip。**この段は diff preview 停止**（UI 接触）。dev smoke で実画像の day28 系を確認。

## 4. A4-3 wiring（risk model + UI）
- `shiftDraftRiskModel.ts`: 新 soft `RiskKind = "source_mismatch"` を追加（**`HARD_KINDS` 非参加 = 保存 block しない**）。A4 hints を集約 → panel hint + day set。
- ShiftReviewGrid: `sourceMismatchDays` を **cell amber**（既存 blank_risk と同経路）+ panel に safe-copy（「原稿にコードが見える日があります。空欄になっていないか確認してください」）。
- A3 blank_risk（confidence 由来）と **相補表示**（重複日はまとめる）。render contract test。
- **この段も diff preview 停止**（risk model + UI 接触）。

## 5. リスクと緩和
| # | リスク | 緩和 |
|---|---|---|
| C1 | geometry 精度（支配的・実証済） | 確定 geometry でのみ作動・未解決は fail-open dormant |
| C2 | Canvas 値 ≠ sharp 値（色プロファイル等） | content 比率には軽微。A4-2b dev smoke で day28 再現確認。閾値は config |
| C3 | 内側領域 fraction | A4-1 で 0.62 が有効。adapter param 化し smoke で確定 |
| C4 | 性能（31× getImageData） | offscreen canvas 1 枚 + 31 小領域読取＝軽微。校正変更時のみ再計算（debounce） |
| C5 | 鉛筆書き/汚れ空白の誤発火 | 現サンプルに不在。別形式ロスター入手時に再 calibration（閾値 config 済） |

## 6. CEO 判断を仰ぐ点
| # | 論点 | 推奨 |
|---|---|---|
| **E1** | runtime | **client Canvas（A 案）**: verified metric 無改変・往復なし |
| **E2** | 発火タイミング | **geometry 解決後に自動**（校正変更で再計算・dormant fail-open） |
| **E3** | 内側 fraction | **0.62 既定**（A4-1 実証値）・param 化 |
| **E4** | severity | **soft 固定**（保存 block なし・A3/confusable と同方針） |
| **E5** | 分割 | A4-2a（pure adapter・commit 可）→ A4-2b（review effect・diff preview）→ A4-3（risk+UI・diff preview） |

## 7. scope / 非 scope / 禁止
- **scope**: review 画面で client Canvas により A4 guard を動かし soft hint を出す配線。
- **非 scope**: コード正誤判定 / 抽出パイプライン改変 / VLM 二重読み / read-miss の自動修正。
- **禁止**: 本 readiness 段階の実装（設計のみ）/ VLM 実行 / 保存・DB・production / push / raw 画像・base64 commit。

## 8. 結論
- A4 guard は **review 画面の client Canvas** で verified pure metric を無改変再利用するのが最善（往復なし・geometry 校正に反応・fail-open）。
- A4-2a（pure adapter）は commit 可、A4-2b / A4-3（UI/risk 接触）は diff preview 停止。**実装は E1-E5 の CEO 判断後**。
