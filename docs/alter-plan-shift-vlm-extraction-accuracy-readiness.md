# SR VLM 抽出精度 / 本人行拾い readiness（mini design・docs-only）

- **日付**: 2026-06-05
- **branch**: `feat/plan-shift-import-productization`（ローカル・未 merge / 未 push）
- **状態**: **readiness / mini design のみ。実装は CEO 確認後**。本 doc は docs-only。
- **前提**: S-geo（幾何校正）+ Persist（校正恒久化）+ S-save（staging 保存・replace/conflict 保護）は凍結済。確認 UI・校正・保存の土台は固まっている。

---

## §0 目的・思想・スコープ境界

### 目的（CEO 方針）
プロダクトの本質は「元画像から **正しい本人行・正しい日付列・正しい勤務コード** を拾い、空欄・希望休・公休・勤務を取り違えない」こと。ここが弱いと、確認 UI / 保存パスがいくら強くてもユーザーは毎回修正する。

### 思想（最優先・誤読の扱い）
> **誤読をゼロにするのではなく、誤読しやすい箇所を人間確認に確実に回す。**

= Aneurasync の「読めたふりをしない」。具体原則:
- 不確実なセルは **unresolved / 要確認** にする（高 confidence を装わない）
- 本人行が怪しい場合は **止める**
- **空欄とコードを混同しない**（特に read-miss を空欄に化けさせない）

### スコープ境界（本トラックで扱う / 扱わない）
- **扱う**: 抽出パイプラインの失敗モード整理、誤読を review へ回す deterministic な仕掛け、本人行/空欄/confidence の安全側設計、評価の方法論。
- **扱わない（別ゲート）**: いきなり完全自動化、本人行の自動検出の本実装、production 有効化、保存パスの再設計、UI polish。
- **禁止（CEO 明示）**: いきなり実装 / VLM 再実行（連打）/ 保存再実行 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production / push·PR·deploy / raw画像·base64·VLM raw response の commit。

---

## §1 現状アーキテクチャ（事実・file:line 根拠）

### 1-1. 抽出フロー（action → VLM → cells）
1. `app/(culcept)/plan/_actions/extractShiftDraftAction.ts` … "use server"。flag/auth gate → Gemini adapter を DI → `runExtractShiftDraft()` 呼出。
2. client 前段 `lib/plan/shift/runDraftExtractionSubmit.ts` … crop 生成 → FormData → action 呼出。
3. `lib/plan/shift/draftExtractionPlanner.ts` … pure。daysInMonth を **chunk 分割**（既定境界 `[15]`）+ chunk 別 hardened prompt 構築。
4. `lib/plan/shift/draftExtractionAdapter.ts` … runtime orchestrator。chunk を直列に `extractChunk` 呼出 + merge 検証。
5. `lib/plan/shift/draftExtractionGeminiAdapterCore.ts` … 実 Gemini REST（`gemini-2.5-pro` / env `B1B_VLM_MODEL`）。split=2画像 / combined=1画像 + prompt。JSON → `DayKeyedShiftCell[]` を構造検証、coverage/duplicate/missing で **fail-hard**。
6. 戻り値 = `ShiftReviewCell[]`（`{day, date, rawCode, confidence}`・`shiftReviewClassification.ts:18-23`）。

### 1-2. VLM に渡す画像形式
- **split**（legacy）: header crop + personRow crop の **2 枚別画像**。VLM が 2 枚間の列対応を保持する必要があり drift しやすい。
- **combined**（現行推奨）: header（上）+ 本人行（下）を **同一 X 軸で縦結合した 1 枚**（`combinedDraftImage.ts`）。列対応問題を構造的に消す。狭い画像は 2x upscale、帯間に薄い grid 線ガイド。
- 画像は ObjectURL/Blob 由来の crop のみ。**raw画像/base64/dataURI は VLM 呼出の外に保持しない**。

### 1-3. combined / split の現状
- 正規化 `shiftDraftVlmInputMode.ts`: env `PLAN_SHIFT_VLM_INPUT_MODE` が `"split"` の時だけ split、それ以外 **combined 既定**。
- decision-log（2026-06-03）: **combined が複数月で列対応 drift を解消 → PASS**。split は 2 枚別画像で VLM が列対応を保持できない構造仮説を支持。**production は `PLAN_SHIFT_VLM_INPUT_MODE=combined` 必須**（mode mismatch は invalid_input）。

### 1-4. 本人行選択（手動 / 自動）
- **完全手動**（`AssistedRowSelector.tsx`）。tap で band を heuristic 提案 → ヘッダ帯 + 本人行帯 + 日列中心(2点) をハンドルで調整。**自動の本人行検出は無い**。
- crop 範囲 = `personRowBand`（full-width・y 範囲）。これが combined 画像の下段になる。

### 1-5. 本人行を間違える可能性（現状の構造）
- band を **隣接行にずらして描く**と、隣の人のシフトを「本人」として抽出する（silent。VLM は渡された crop を正直に読むだけ）。
- VLM は `rowLabel` を返す（prompt 出力 schema に含む）が、**現状この rowLabel を「本人（原田）」と突き合わせていない** → 行取り違えが review で警告化されない。
- crop の y 範囲が広い/狭いと、隣接行の文字が混入 or 本人行が切れる。

### 1-6. 日付列 drift の既解決範囲（抽出側）
- ※ S-geo の geometry 校正は **review の照合枠（hover box）** 用。ここで言う drift は **VLM が各セルを正しい日付に紐づける** 抽出側の話で別物。
- prompt で対策済（`shiftExtractionPrompt.ts` / `hardenedDayKeyedPrompt.ts`）:
  - **day-keyed**: 「ヘッダの日番号を読み、各セルをその日番号に紐づける。配列の順番/位置で推測しない」。
  - **前詰め禁止**: 「空セルの後続の値を左に詰めない」（`hardenedDayKeyedPrompt.ts:100`）。
  - **真下列だけ**: 「各セルはヘッダ dayNumber の真下の列だけを見る」（:101）。
  - **sequence 推測補完しない**: 「読めない時は confidence を下げる」（:102）。
  - **combined の X 軸一致** が 2 枚問題を消す。
  - **chunk 単位検証**（`draftExtractionAdapter.ts`）: chunk 範囲外/欠け/重複で fail-hard、cross-chunk で 1..daysInMonth coverage 完全必須。
- = B1a-v2（列レジストレーション）/ B1a-v3（空セル検出強化）で「失敗3モード（隣接同一併合 / 空セル skip / 前詰め shift）」を prompt で直撃済（`hardenedDayKeyedPrompt.ts:5`）。

### 1-7. 誤読しやすいコード（`shiftCodeDictionary.ts` HARADA_SPRIX 8 コード）
| code | 意味 | projectMode | 混同しやすい相手 |
|---|---|---|---|
| `H` | 公休 | day_indicator | `N`（縦長記号）/ 空欄 |
| `HREQ` | 希望休 | candidate | `H`（接頭一致）/ 長くて skip されやすい |
| `BD` | 休み | day_indicator | 勤務コード |
| `E` | 早番(06-14) | timed_event | **`E-18`（接頭一致・ハイフン落とし）** |
| `E-18` | 早番ロング(06-18) | timed_event | **`E`** |
| `N` | 夜勤(18-06翌) | timed_event | `H` |
| `L` | 遅番(14-22) | timed_event | （`I`/`1` フォント次第） |
| `G` | 日勤(09-17) | timed_event | — |
- **最危険 = `E` ↔ `E-18`**: 終業が 14:00 と 18:00 で 4 時間違う。ハイフン/数字を落とすと **高 confidence で誤読** され、現状の安全網（低 conf / 空欄隣接 / 未知コード）に **かからない**。

### 1-8. 空欄の扱い
- `computeEmptyDays`（`shiftReviewClassification.ts:29-33`）= `normalizeRawCode(rawCode) === ""` の日。
- projection（`shiftRosterProjection.ts`）: 空セルは **projection せず unresolved にもならず skip**（= 何も保存しない）。
- prompt: 「空セルは rawCode ""・空セルも全日出力」（`shiftExtractionPrompt.ts:42,60` / `hardenedDayKeyedPrompt.ts:99`）。
- **危険**: prompt は「読めない日も dayNumber を返し、rawCode を空 **または** 低 confidence」（`hardenedDayKeyedPrompt.ts:74`）。→ **read-miss（読めなかった）が rawCode "" + 高 confidence で返ると、真の空欄と区別できず silent に skip される**。空欄と read-miss の分離が現状の弱点。

### 1-9. confidence / unresolved の扱い
- `confidence` は **VLM が返す**（synthesize ではない・`shiftExtractionPrompt.ts:44`）。
- `isBlankRisk`（`shiftReviewClassification.ts:39-49`）= `confidence < 0.7`（既定）**または** 前後日が空欄。
- unresolved = projection の unknown_code 等（`shiftRosterProjection.ts`）= 辞書で解決できないコード。
- 保存前 gate（`classifyPreSave` :65-80）: **unresolved = hard block（保存停止）** / **blank-risk = soft（確認後 OK）** / 低 conf 単独で空欄隣接でなければ保存可（CEO 既定）。HREQ candidate は unresolved でも blank-risk 単独でもない。

### 1-10. 人間確認に回す現状の条件
- **hard（保存停止）**: missing_day / duplicate_day / unknown_code（`shiftDraftRiskModel.ts`）。
- **soft（確認推奨）**: blank_risk / adjacent_duplicate / suspicious_shift / low_confidence / chunk_boundary。
- 視覚: ShiftReviewGrid の amber dot（blank-risk）+ S-geo の hover 照合枠（原稿セル拡大）。

### 1-11. 追加 VLM 実行を防ぐ設計（連打防止）
- state machine gate: `extract_started` は **crop_review からのみ**受理（`devShiftDraftReducer.ts:71,139` の row_selected→crop_review→extracting 必須ゲート）。extracting 中の再 handleExtract は reducer が no-op。
- 失敗時: error state へ → 手動 retry のみ（**auto-retry なし**）。
- Gemini core は 429/503 等を分類（safe copy・raw response 非露出）。

---

## §2 失敗モード分類（捕捉済 vs silent）← 本 readiness の核心

| # | 失敗モード | 例 | 現状で捕捉？ | 危険度 |
|---|---|---|---|---|
| F1 | 列 drift / 前詰め | 空セル skip で全体が 1 日ずれる | prompt + chunk coverage で **概ね捕捉**（fail-hard / 全日出力強制） | 中（B1a-v2/v3 で対策済） |
| F2 | 未知コード | 辞書外の記号 | **hard block**（unresolved） | 低（止まる） |
| F3 | 低 confidence | VLM 自身が曖昧と申告 | **soft（amber）** | 低 |
| F4 | 空欄隣接の詰め疑い | 空欄の隣 | **soft（amber）** | 低 |
| **F5** | **高 conf の似コード誤読** | **`E`↔`E-18`、`H`↔`N`** | **❌ 捕捉できない（silent 保存）** | **高** |
| **F6** | **read-miss が空欄に化ける** | 読めなかったセルを rawCode "" + 高 conf | **❌ 区別できず silent skip** | **高** |
| **F7** | **本人行取り違え** | band が隣接行にずれ、隣の人のシフトを抽出 | **❌ rowLabel 未照合で silent** | **高** |

**結論**: F1-F4 は既に「止まる/光る」。**F5・F6・F7 が silent**（高 conf で間違い、または静かに欠落）。CEO の目標はこの 3 つを **review に回す** こと。**誤読を消すのではなく、F5/F6/F7 を「要確認」に変換する**のが本トラックの主眼。

---

## §3 改善方向（route uncertainty・surgical）

すべて **deterministic（追加 VLM なし）** を第一候補にする（連打防止と整合・cost/risk 増やさない）。

- **D1（F5 対策）辞書 confusable ペア → 常時 soft flag**: 辞書に「混同しやすいペア」（`E`↔`E-18`, `H`↔`N`, `H`↔`HREQ`）を宣言し、その値が出たセルは **confidence に関係なく soft「要確認」** にする。pure・VLM 不要。`E-18` を含む月は特に「E と E-18 を見比べてください」を促す。
- **D2（F6 対策）read-miss と空欄の分離**: 「読めなかった」を空欄に化けさせない。最小案 = prompt を「読めない日は rawCode "" に **せず**、`confidence` を明確に下げる（例 < 0.5）」へ寄せ、validator で「空欄なのに confidence が高すぎる/低すぎる」セルを soft 化。= 空欄は「自信を持って空欄」のみ skip、それ以外の "" は要確認。
- **D3（F7 対策）本人行 cross-check**: VLM の `rowLabel` を本人ラベル（辞書 `ownerLabel`「原田 大志」）と緩く突き合わせ、**不一致なら「本人行が怪しい」警告**（hard 寄り）。band 取り違えを review で止める。pure・既存 rowLabel 活用。
- **D4（review 誘導）要確認セルへの動線**: 既に S-geo の hover 照合枠がある。要確認セル（F2-F7）に **優先 jump / 並べ替え** を付け、人間が「光っている所だけ」を効率的に潰せるようにする（読めたふり防止の実効性）。
- **D5（測定）評価ハーネス**: 実シフト画像 + 正解 cells のラベル付き dataset で「**silent 誤読率**（高 conf で間違い & 未 flag）」を測る。これが本トラックの北極星指標（LLM judge harness と同型）。**実 VLM 実行は CEO ゲート**。

> 設計判断: D1/D3 が最小・最大効果（pure・即効・cost 0）。D2 は prompt + validator の小改修。D4 は UI、D5 は計測基盤。**まず D1+D3（silent → 要確認）から。**

---

## §4 実装分割案（surgical・段階）

| step | 内容 | 種別 | 依存 | VLM |
|---|---|---|---|---|
| **A0** | 失敗モード taxonomy を docs 確定（本 readiness の §2 を正式化） | docs | — | なし |
| **A1** | 辞書 confusable ペア宣言 + `detectDraftRisks` に `confusable_code` soft hint 追加（pure + test） | code(pure) | A0 | なし |
| **A2** | 本人行 cross-check: `rowLabel` vs `ownerLabel` 緩照合 → `person_row_mismatch` hint（pure + test） | code(pure) | A0 | なし |
| **A3** | read-miss/空欄分離: prompt 調整（読めない=低conf）+ validator soft 化（pure + test） | prompt+pure | A0 | なし（prompt 文字列のみ・実行は smoke gate） |
| **A4** | review 誘導: 要確認セルへの jump/並べ替え（既存 ShiftReviewGrid + S-geo zoom 活用） | UI | A1-A3 | なし |
| **A5** | 評価ハーネス: ラベル付き実画像 dataset + silent 誤読率計測（runner 構造のみ。実行は CEO gate） | docs+runner | A1-A3 | gate |

- 各 step は **commit せず diff preview 停止** → CEO GO の現行ワークフロー踏襲。
- **A1+A2 が最優先**（pure・cost 0・silent → 要確認 を直接実現）。A3 は prompt を触るので smoke で実 VLM 1 回検証（連打しない）。A5 は計測で、実 VLM 実行は別 GO。

---

## §5 test / smoke 方針

- **pure unit（追加 VLM なし）**: confusable 検出 / rowLabel 照合 / read-miss soft 化を `shiftDraftRiskModel` + 新 pure module で固定（既存 `shiftDraftRiskModel.test.ts` 系に追加）。
- **prompt contract test**: A3 の prompt 文字列が「読めない=低conf」を含むことを `hardenedDayKeyedPrompt.test.ts` 系で固定（実行はしない）。
- **render contract**: A4 の要確認 jump を renderToStaticMarkup で固定（jsdom 不使用の既存規約）。
- **live smoke（CEO gate）**: A3 / A5 の実 VLM は **1 回のみ**・失敗時は分類して停止・再実行は CEO 判断。staging のみ・保存しない（review 止め）。
- 既存テスト資産: `draftExtractionAdapter` / `draftExtractionPlanner` / `hardenedDayKeyedPrompt` / `shiftReviewClassification` / `shiftRosterProjection` / `shiftDraftRiskModel`（20+ 本）に追加する形で回帰を守る。tsc baseline 1112 維持。

---

## §6 禁止事項・ゲート（厳守）

- 禁止: いきなり実装 / VLM 再実行（連打）/ 保存再実行 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production / push·PR·deploy / raw画像·base64·VLM raw response の commit。
- 連打防止維持: **1 回実行・失敗時は分類して停止・再実行は CEO 判断**。
- production-enablement にまだ行かない理由: 確認 UI と保存は整ったが、**抽出精度の失敗モードがまだ製品化されていない**。F5/F6/F7（silent 誤読）を要確認に回す前に production に出すと、ユーザーが本番で誤読に遭遇する。

---

## §7 CEO が次に判断すること

1. **失敗モード taxonomy（§2）を正式採用するか**（F5/F6/F7 を主敵に置く合意）。
2. **着手順序**: 推奨は **A1（confusable）+ A2（本人行 cross-check）から**（pure・cost 0・silent→要確認）。A3（prompt）/A4（UI）/A5（計測）は後続。
3. **confusable ペアの確定**: `E`↔`E-18` / `H`↔`N` / `H`↔`HREQ` を「常時要確認」にする方針でよいか（過剰 flag と安全のバランス）。
4. **本人行 mismatch の強度**: rowLabel 不一致を **hard block（止める）** か **soft（強い警告）** か。
5. **評価ハーネス（A5）の実 VLM 実行可否**（cost/連打方針）。

---

## 付録: 主要 file:line 索引
- 抽出 action: `app/(culcept)/plan/_actions/extractShiftDraftAction.ts`
- planner（chunk）: `lib/plan/shift/draftExtractionPlanner.ts`
- adapter（merge 検証）: `lib/plan/shift/draftExtractionAdapter.ts`
- Gemini core: `lib/plan/shift/draftExtractionGeminiAdapterCore.ts`
- prompt: `lib/plan/shift/shiftExtractionPrompt.ts` / `lib/plan/shift/hardenedDayKeyedPrompt.ts`
- combined 画像: `lib/plan/shift/combinedDraftImage.ts` / mode: `lib/plan/shift/shiftDraftVlmInputMode.ts`
- 本人行選択: `app/(culcept)/plan/components/AssistedRowSelector.tsx`
- cell 分類/confidence/blank: `lib/plan/shift/shiftReviewClassification.ts`
- risk hint: `lib/plan/shift/shiftDraftRiskModel.ts`
- projection: `lib/plan/shift/shiftRosterProjection.ts`
- 辞書: `lib/plan/shift/shiftCodeDictionary.ts`
- 連打防止: `app/(culcept)/plan/dev-shift-draft/devShiftDraftReducer.ts` + `app/(culcept)/plan/components/useShiftDraftFlow.ts`
