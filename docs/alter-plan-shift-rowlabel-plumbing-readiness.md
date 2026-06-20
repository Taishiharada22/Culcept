# SR A2B-0 rowLabel plumbing readiness（mini design・docs-only）

- **日付**: 2026-06-05
- **branch**: `feat/plan-shift-import-productization`（ローカル・未 merge / 未 push）
- **状態**: **readiness / mini design のみ。実装は CEO 確認後**。docs-only。
- **前提**: A2A（`shiftPersonRowCheck` pure helper `crossCheckRowLabel`）は commit 済（`7e17ed59`）。本人行取り違え（F7）を warning へ回す pure 判定器は準備済。**ただし入力 `rowLabel` が review まで届いていない**。本 readiness はその配線（plumbing）を設計する。

---

## §0 目的・スコープ・思想

### 目的
VLM が読んだ行ラベル（`rowLabel`＝人名）を review の `crossCheckRowLabel` まで届け、**本人行を取り違えていないか（F7）を保存前の warning として出せる状態**にする。A2B-2（warning UI 本体）の前段。

### 思想（A2A から継承）
- 本人行取り違えは重大だが、`rowLabel` 自体も VLM 由来 → **いきなり hard block しない**。mismatch = high-priority warning まで（hard 化は smoke 後 CEO 判断）。
- **rowLabel は人名の短い文字列**。raw VLM response / base64 / 画像ではない。

### スコープ
- **やる**: rowLabel を抽出出力 → review（`ShiftReviewCell` / cells_loaded）まで運ぶ設計の確定。
- **やらない（A2B-2 / 別 GO）**: warning バナーの UI 実装本体、hard block 化。
- **禁止**: A2B 即実装 / prompt 変更 / VLM 再実行 / 保存再実行 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production / push·PR·deploy / raw画像·base64·VLM raw response の commit。

---

## §1 現状（file:line 根拠）— rowLabel はどこにあり、どこで消えるか

| 層 | 型 / 関数 | rowLabel | 根拠 |
|---|---|---|---|
| VLM prompt 出力 schema | — | `rowLabel: string`（人名・本人照合用） | `shiftExtractionPrompt.ts:45,82` |
| 抽出 contract（chunk 前） | `ExtractedShiftCell` | **あり** | `shiftExtractionContract.ts:22,107` |
| 本人行 filter | `filterByPersonRow(cells, personName)` | **使用**（`row.replace(/\s+/g,"").includes(target)`） | `shiftExtractionContract.ts:144-149` |
| day-keyed（chunk） | `DayKeyedShiftCell` | **あり**（`rowLabel: string`） | `shiftExtractionContract.ts:161-170` |
| adapter merge | `DayKeyedShiftCell[]` | あり | `draftExtractionAdapter.ts:124,197` |
| **review cell（正本）** | **`ShiftReviewCell`** = `{day,date,rawCode,confidence}` | **❌ なし（drop）** | `shiftReviewClassification.ts:18-23` |
| submit 戻り値 | `{kind:"cells"; cells: ShiftReviewCell[]}` | なし | `runDraftExtractionSubmit.ts:65` |
| cells_loaded state | `cells: ShiftReviewCell[]` | なし | reducer |
| projection（保存入力） | `extractedToCellReadings` = `{date,rawCode,rawColor}` | **使わない**（rowLabel 非参照） | `shiftExtractionContract.ts:130-138` |

**結論**: `rowLabel` は VLM 出力〜adapter まで存在し、**`DayKeyedShiftCell[]` → `ShiftReviewCell[]` への変換時に drop** される（review には届かない）。projection / 保存は元々 rowLabel を参照しない（= 既に save-safe）。

**ownerLabel の供給元**: 辞書 `dictionary.ownerLabel`（`shiftCodeDictionary.ts:219` = `"原田 大志"`）。`ShiftReviewGrid` は `dictionary` prop を受けるため、UI 側で `dictionary.ownerLabel` を直接参照できる。`personName`（filter 用）は planner の任意入力（`draftExtractionPlanner.ts:53,125,144`）。

---

## §2 CEO 提示 9 点の整理 + 設計案

### 1. rowLabel をどの型に残すか
**案A（推奨・最小）**: `ShiftReviewCell` に **`rowLabel?: string`（optional）** を追加。`cells_loaded.cells` を流れるため reducer 変更ゼロで review まで届く。optional ＝ 既存 fixture/test 非破壊。
**案B**: 単一 `detectedRowLabel?: string` を抽出結果に持たせ cells_loaded state に 1 個だけ保持。型は綺麗だが reducer state 変更が要る。
→ **案A 推奨**（plumbing 最小・reducer 非接触）。cross-check 用の代表値は §2-5 の helper で導出。

### 2. ShiftReviewCell に rowLabel? を追加するか
**Yes（案A）**。`{day,date,rawCode,confidence,rowLabel?}`。`rowLabel` は人名文字列のみ（raw VLM payload ではない）。

### 3. cells_loaded state に rowLabel が残るか
案A なら **cells に含まれて自動的に残る**（reducer は `selection: action.selection` / `cells` をそのまま持ち回るため変更不要）。

### 4. save payload / DB に rowLabel を混ぜないこと
**現状で既に save-safe**。projection（`extractedToCellReadings`→`projectShiftRoster`）は `{date,rawCode}` のみ参照し rowLabel を読まない。save payload（`buildShiftImportPlan` → RPC）にも rowLabel は載らない。
→ **A2B-1 の保証 test**: 「projection / save payload に rowLabel が混入しない」を contract で固定（rowLabel 付き cells を projection に通しても anchor/indicator に rowLabel が現れない）。

### 5. rowLabel mismatch warning の表示位置
cross-check 結果は **行全体で 1 件**（day-keyed ではない）→ 既存 risk panel（day 番号付き hint）とは別物。
→ **専用 warning バナー**（確認画面の grid 上部 or 保存 CTA 付近）を A2B-2 で新設。day-keyed risk panel には載せない。
- 代表 rowLabel は pure helper **`representativeRowLabel(cells)`**（最頻の非空 rowLabel）で導出 → `crossCheckRowLabel({ownerLabel: dictionary.ownerLabel, rowLabel})`。

### 6. missing rowLabel の扱い
`crossCheckRowLabel` が `status:"missing"`・`severity:"note"`・**block しない**を返す（A2A 済）。UI は **低優先 note**（または非表示）。warning にしない。

### 7. ownerLabel の供給元
`dictionary.ownerLabel`（"原田 大志"）。ShiftReviewGrid は既に `dictionary` を受け取るため追加 prop 不要。

### 8. raw VLM response 非保存
`rowLabel` は人名文字列のみ。**raw VLM JSON / base64 / 画像は carry しない**。型で `rowLabel?: string` に限定。A2B-1 test で「rowLabel に長大文字列/JSON を入れても保存に出ない」を保証（projection 非参照で自動的に satisfied）。

### 9. test 方針
- **A2B-1（pure / contract）**:
  - DayKeyed→ShiftReviewCell 変換が `rowLabel` を carry する（変換 helper の unit）。
  - `representativeRowLabel(cells)` pure（最頻非空・空/欠落で undefined・throw しない）。
  - projection / save payload に rowLabel が**混入しない**（contract）。
- **A2B-2（render contract）**:
  - mismatch → warning バナー表示・**保存 block しない**。
  - missing → note（または非表示）。match → バナーなし。
  - safe copy（error/誤/間違 不使用・既存契約整合）。

---

## §3 実装分割案（surgical・段階）

| step | 内容 | 種別 | VLM/DB/save |
|---|---|---|---|
| **A2B-0** | 本 readiness（docs） | docs | なし |
| **A2B-1** | `ShiftReviewCell.rowLabel?` 追加 + DayKeyed→ReviewCell 変換で carry + `representativeRowLabel` pure + **projection 非混入 contract** + unit（pure layer・commit 可） | code(pure/contract) | なし |
| **A2B-2** | ShiftReviewGrid に `crossCheckRowLabel` 接続 + warning バナー（mismatch=warning / missing=note / match=なし）+ render contract（**diff preview 停止**） | UI | なし |

- A2B-1 は pure/contract のみ → 検証 green で commit。A2B-2 は UI → diff preview 停止。
- **rowLabel を実際に VLM 出力から carry する**ため、変換点（DayKeyed→ReviewCell）の特定を A2B-1 冒頭で行う（runDraftExtractionSubmit / adapter / action のいずれか）。

---

## §4 安全境界（厳守）
- raw画像 / base64 / VLM raw response を保存しない・commit しない。
- save payload / DB に rowLabel を混ぜない（projection 非参照を contract で固定）。
- mismatch は **warning まで**（hard block 化は smoke 後 CEO 判断）。
- prompt 変更なし / VLM 再実行なし / production 非接触 / push なし。

## §5 CEO が次に判断すること
1. **案A（`ShiftReviewCell.rowLabel?` 追加）採用可否**（vs 案B 単一フィールド）。
2. 代表 rowLabel の導出方針（最頻非空でよいか）。
3. warning バナーの**表示位置**（grid 上部 / 保存 CTA 付近）。
4. A2B-1（pure/contract）→ A2B-2（UI）の順で進めてよいか。

---

## 付録: file:line 索引
- ShiftReviewCell 型: `lib/plan/shift/shiftReviewClassification.ts:18-23`
- rowLabel 保持型: `lib/plan/shift/shiftExtractionContract.ts`（ExtractedShiftCell:22 / DayKeyedShiftCell:161-170 / filterByPersonRow:144-149 / extractedToCellReadings:130-138）
- 変換/submit: `lib/plan/shift/runDraftExtractionSubmit.ts:65` / `lib/plan/shift/draftExtractionAdapter.ts`
- cross-check: `lib/plan/shift/shiftPersonRowCheck.ts`（A2A・commit 済）
- ownerLabel: `lib/plan/shift/shiftCodeDictionary.ts:219`
- projection: `lib/plan/shift/shiftRosterProjection.ts`
