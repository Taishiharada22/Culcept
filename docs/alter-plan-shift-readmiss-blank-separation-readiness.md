# SR A3 readiness — read-miss / 空欄分離（「空欄に見えるけど本当に空欄なのか」）

> 区分: **readiness（docs-only）**。本書は設計の整理のみ。**prompt 変更・VLM 実行・保存・DB write は一切行わない**。
> 実装着手は CEO GO 後、別 commit。
> 前提 commit: A2B-2 `5cef45f3`（本人行 warning）まで着地。branch `feat/plan-shift-import-productization`。

---

## 0. 目的 / 位置づけ

A1（似たコード混同 = confusable）・A2（本人行 cross-check = rowLabel）に続く **F6 対策**。

- **F6（silent read-miss）**: VLM がセルを読めなかったとき、`rawCode: ""`（空欄）＋**高 confidence** で返すと、
  「本当に勤務が無い日（=正規の空欄）」と区別できないまま確認画面を通過する。
- これは「読めたふりをしない」という CEO 原則の直撃点。**誤読をゼロにするのではなく、読めなかった箇所を確実に人間確認へ回す**のが A3 のゴール。

本書は CEO 指定の 7 論点を、現状コードの根拠付きで整理し、判断を仰ぐ。

---

## 1. 現状の根拠（コード事実・file:line）

### 1.1 prompt は「空欄」を 2 状態でしか扱っていない
- `lib/plan/shift/shiftExtractionPrompt.ts`
  - L130: 「真下のセルが**空（何も書かれていない）なら rawCode を空文字 `""` に**」
  - L131: 「**空の日があるのは正常**（勤務が割り当てられていないだけ）。無理にコードを入れない」
  - L120: 「ある列の**日番号**が読み取れない場合は、その日の confidence を下げる」← これは **dayNumber 不明**の話で、**セル内容が判読不能**の話ではない。
- → prompt の状態は **(a) 読めたコード** と **(b) 空 `""`** の 2 つだけ。**「マークはあるが判読できない（read-miss）」の第3状態が無い**。
  read-miss に直面した VLM の選択肢は「`""` にする（=正規の空欄に化ける）」か「当て推量でコードを置く」かの二択しかない。

### 1.2 硬化 prompt の OR が逃げ道
- `lib/plan/shift/hardenedDayKeyedPrompt.ts`
  - L74: 「読めない日も dayNumber は返し、rawCode を**空または低 confidence**にする」← **OR**。`""` を許容している。
  - L102: 「読めない時は confidence を下げる」← 下げる指示はあるが、L74 の「空または」と併存し**強制力が弱い**。
- → read-miss が **高 conf の `""`** として出ても prompt 上は違反でない。これが F6 の構造的温床。

### 1.3 contract は read-miss を表す field を持たない
- `lib/plan/shift/shiftExtractionContract.ts`
  - `DayKeyedShiftCell = { day, rawCode, rowLabel, confidence? }`（L161-170）。
  - `validateDayKeyedCells`（L190-256）: `confidence` は有限数なら carry、無ければ持たない。
  - rawCode `""` は「空セルとして許容」（L19, L165）。**read-miss と true-blank を区別する signal が無い**。

### 1.4 confidence 欠落時の default 0.8 が low-conf 経路をすり抜ける
- `lib/plan/shift/assistedDraftToShiftReviewCells.ts`: `DEFAULT_CONFIDENCE = 0.8`。
  VLM が confidence を省略すると **0.8**（閾値 0.7 超）で埋まる。
- → confidence 省略の read-miss-blank は `low_confidence`（< 0.7）にも `isBlankRisk(conf)` にも**該当しない**。
  唯一 **空欄隣接（adjacency）** でしか拾えない（孤立した read-miss-blank は完全にすり抜ける）。

### 1.5 blank の 3 層処理が非整合
| 層 | 関数 / 定義 | 空欄の扱い | 駆動先 | 根拠 |
|---|---|---|---|---|
| confidence | VLM 出力 0..1、欠落時 0.8 | read-miss は本来低くすべきだが prompt が高 conf `""` を許容 | 下記 2 つ | §1.4 |
| `low_confidence`（risk model） | `conf < 0.7` | conf に依存（高 conf 空欄は不発火） | risk panel | `shiftDraftRiskModel.ts` L152-158 |
| `blank_risk`（risk model） | `normalizeRawCode("")` | **全空欄に soft 発火**（正規の休みでも flood） | risk panel | `shiftDraftRiskModel.ts` L160-167 |
| `suspicious_shift`（risk model） | 空欄の直後 [E+1, E+2] | 前詰めずれ窓 | risk panel | `shiftDraftRiskModel.ts` L169-177 |
| `isBlankRisk`（classification） | `conf<0.7` **OR** 空欄隣接 | **高 conf 孤立空欄は不発火** | amber dot + 保存 soft gate | `shiftReviewClassification.ts` L46-56 |
| `unresolved`（projection） | 非空 ∧ 辞書外 | 空欄は**絶対に unresolved でない**（= hard block しない） | hard block | `shiftReviewClassification.ts` L77-81 |

→ **2 つの blank 定義が食い違う**: risk model `blank_risk` は全空欄、classification `isBlankRisk` は低conf/隣接のみ。
   その結果、**高 conf の孤立 read-miss-blank** は amber dot（人の目に最も届く印）が**付かない**まま panel hint だけが出る。

---

## 2. 問題の核（F6 が逃げる経路の要約）

```
VLM が読めない
   │
   ├─ 「空または低conf」の OR（hardened L74）→ 高conf "" を選べる
   │
   ▼
rawCode="" + confidence 高（or 省略→0.8）
   │
   ├─ low_confidence: conf≥0.7 → 不発火
   ├─ isBlankRisk(amber): 高conf ∧ 孤立 → 不発火（人の目に届かない）
   └─ blank_risk(panel): 発火するが「全空欄」共通で flood、正規休みと区別不能
   ▼
確認画面を **真の空欄と同じ顔で通過**（= F6）
```

**最小・外科的な着眼点**: 下流の routing（`low_confidence` hint + `isBlankRisk` amber + 保存 soft gate）は **低 conf 空欄なら既に人間確認へ回せる**。
唯一の構造的欠陥は **上流（prompt）が read-miss を高 conf `""` で出すことを許している**点。
→ **prompt で read-miss を必ず低 conf に寄せ、`""` を「自信を持って空」専用に予約する**だけで、既存の下流機構が自動的に拾う。

---

## 3. CEO 指定 7 論点への設計

### 3.1 本当に空欄 vs 読めなくて空欄に化けた日 — どう区別するか
- **signal は confidence に一本化する**（第一案・最小）。
  - true-blank（明確に何も無い）= `rawCode: ""` ＋ **高** confidence。
  - read-miss（マークはあるが判読不能）= confidence を **必ず低く**（後述 0.3 目安）。`""` に**しない**ことを推奨（最も近い推定 or 明示マーク）。
- 完全自動判別は原理的に不可能（画像だけでは「薄い休み記号」と「真の空白」は曖昧）。
  → **VLM に自己申告させ（低 conf）、人間の source-of-truth review で確定**する設計を維持（`shiftReviewClassification.ts` 冒頭コメントの思想と一致）。

### 3.2 prompt 上で「読めない」は空欄ではなく低 confidence へ寄せるか
- **YES（推奨）**。現状 prompt の 2 状態に **第3状態を明示追加**する（実装は A3-impl・別 GO）:
  - 追加文言の骨子（案・未適用）:
    - 「セルに**何か書かれているが判読できない**場合は、`""`（空欄）に**しない**。最も近い推定コードを入れ、confidence を **0.3 以下**に**必ず**下げる。」
    - 「`""` は **自信を持って空（記入なし）と判断できる**セル専用。少しでも記入の気配があれば `""` を使わない。」
    - 硬化 prompt L74 の「空**または**低 confidence」を「**判読不能は低 confidence**（`""` は確実な空のみ）」へ**OR 解消**。
  - これにより read-miss は `low_confidence` + `isBlankRisk(conf)` に自動的に乗る（下流改修ほぼ不要）。
- **注意（過剰化の回避）**: 全空欄を低 conf にしてはいけない（正規の休みが flood する）。低 conf は **「気配があるが読めない」セル限定**。

### 3.3 blank-risk / confidence / unresolved の関係（整理）
- §1.5 表のとおり 3 軸は別物。A3 で**定義を整合させる**かが論点（D3）:
  - `unresolved`（hard）= 非空 ∧ 辞書外。**空欄は対象外**（不変・触らない）。
  - `confidence` = read-miss の主 signal（§3.2 で強化）。
  - `blank_risk`（soft, panel）= 現状「全空欄」。**flood を減らすなら「低 conf 空欄 ∨ 空欄隣接」に絞り**、classification `isBlankRisk` と**単一定義に寄せる**案（D3）。
- 目標形:
  - true-blank（高 conf・孤立）→ **印を出さない or 最弱**（正規の休みを邪魔しない）。
  - read-miss（低 conf）→ amber dot + low_confidence hint（**確実に人間確認へ**）。
  - read-miss 隣接の前詰めずれ → suspicious_shift（既存）。

### 3.4 空欄 / H / HREQ / BD / 勤務コードの混同防止
- 辞書は `""`（記入なし）/ `H`（公休）/ `HREQ`（希望休）/ `BD` / 勤務コードを別物として持つ（`shiftCodeDictionary.ts`）。
- **コード ↔ コード**の混同（H↔HREQ・H↔N・E↔E-18）は **A1A の confusable で既にカバー**（`HARADA_CONFUSABLE_PAIRS`）。A3 では触らない。
- **A3 が担うのは「空欄 ↔ マーク」の境界だけ**:
  - マーク（薄い H 等）→ `""` に化ける = **read-miss**。§3.2 の「気配があれば `""` にしない」で防ぐ。
  - `""` → 何かのコードに化ける = **当て推量**。§3.2 の「無理にコードを入れない」（既存 L131）+ 低 conf 自己申告で抑制。confident な誤コードは A1（confusable）/ unknown_code（hard）の領域で、A3 の対象外。
- **A3 scope の線引き**: A3 = **空欄境界（read-miss と true-blank の分離）のみ**。コード同士の判別精度は A1 の担当。

### 3.5 保存前にどこまで soft / hard にするか
- **read-miss = soft（推奨）**。hard にしない。
  - 根拠: read-miss は「確実に間違い」ではなく「確信が持てない」。**hard 化すると曖昧な空欄ごとに保存不能**になりフロー破壊。CEO 原則「不確実を surface し人間へ回す／読めたふりをしない／過剰 block しない」に整合。
  - 実体: 低 conf → `isBlankRisk` amber + `low_confidence` panel hint。保存 CTA は **active 維持**（A2B-2 と同じ非 hard 方針）。
- **unknown_code = hard（既存・不変）**: 辞書外コードは保存前解消必須（`shiftDraftRiskModel.ts` L82-86, `shiftReviewClassification.ts` L77-81）。A3 で触らない。
- **true-blank = pass**: 高 conf 空欄は block しない（正規の休み）。

### 3.6 test 方針（pure・VLM 不使用）
- **prompt contract test**（pure 文字列 assertion）:
  - `buildDayKeyedExtractionPrompt` / `buildHardenedDayKeyedPrompt` の出力に **第3状態文言**（read-miss→低conf、`""` は確実な空のみ）が含まれることを固定。
  - 既存「空セルは `""`」文言が**消えていない**ことも回帰固定（true-blank 経路を壊さない）。
- **risk model unit**（`shiftDraftRiskModel.test.ts` 拡張）:
  - 低 conf 空欄 → `low_confidence` + `blank_risk`（D3 採否で `blank_risk` 条件を更新）。
  - 高 conf 孤立空欄 → （D3 で「印なし/最弱」を選ぶなら）`blank_risk` 不発火を固定。
- **classification unit**（`shiftReviewClassification` 系）:
  - `isBlankRisk`: 低 conf 空欄 = true / 高 conf 孤立空欄 = false（D3 と整合）。
- **default confidence**（`assistedDraftToShiftReviewCells.test.ts`）:
  - confidence 欠落時の default を変更する場合のみ（D2）、その回帰を固定。
- **golden 不使用・VLM 不使用・保存不使用**を厳守（既存 risk model の golden-free 原則を踏襲）。

### 3.7 smoke 方針（gated・本書では実行しない）
- prompt 変更は**実画像での検証が必須** → **別 CEO GO の smoke**（A3-impl 後）。
- 検証対象: B1a の assisted-crop 既知画像（本人行）。
- 合格条件（案）:
  1. **判読不能セル**が低 conf で返り、amber + low_confidence で**人間確認に回る**（silent `""` にならない）。
  2. **正規の休み**は高 conf `""` で返り、確認画面を **flood させない**（過剰 amber が出ない）。
  3. coverage（missing/duplicate）に**退行が無い**。
  4. confident な誤コード（F5）は A1（confusable）の領域で、A3 smoke の合否に**含めない**。
- **本書では VLM を起動しない**（手順設計のみ）。raw 画像 / base64 / VLM raw response は **commit しない**。
- 補足（CEO 2026-06-05 指摘の延長）: rowLabel と同様、VLM が confidence を**頻繁に省略**する場合 §3.2 の効果が弱まるため、smoke で confidence の付与率も併せて観測する。

---

## 4. CEO 判断を仰ぐ点（A3-impl 着手前の gate）

| # | 論点 | 選択肢 | Claude 推奨 |
|---|---|---|---|
| **D1** | read-miss の signal 機構 | (A) **confidence 一本**（contract 変更なし・最小） / (B) 新 field（`illegible?`）or sentinel rawCode（明示だが contract + UI 改修） / (C) 両方 | **(A)**。下流が既に低 conf を routing。新 field は将来の別トラックに defer |
| **D2** | confidence 欠落時の default | (A) **0.8 維持** + prompt で confidence 付与を必須化 / (B) 空欄かつ欠落は低めに倒す | **(A)**。(B) は正規休みを flood するリスク。省略率は smoke で観測 |
| **D3** | `blank_risk`（panel soft）の発火条件 | (A) **全空欄維持** / (B) **「低conf空欄 ∨ 空欄隣接」に絞り** classification と単一定義へ | **(B)**（flood 削減・定義整合）。ただし**既存 test の挙動変更を伴う**ため CEO 判断 |
| **D4** | A3-impl の scope | (A) prompt + prompt-contract test のみ / (B) (A) + risk-model/classification 整合（D3） / (C) (B) + contract field（D1-B） | **(B)**。最小で F6 を塞ぎ、定義非整合も解消 |

---

## 5. scope / 非 scope / 禁止

### 5.1 A3 の scope（この phase で扱う）
- **空欄境界の分離のみ**: read-miss と true-blank を、prompt（自己申告低 conf）+ 下流 routing 整合で分ける。
- 変更想定ファイル（A3-impl・別 GO 後）: `shiftExtractionPrompt.ts` / `hardenedDayKeyedPrompt.ts`（prompt 文言）、必要なら `shiftDraftRiskModel.ts` / `shiftReviewClassification.ts`（D3 採否次第）、対応 test。

### 5.2 非 scope（A3 では触らない）
- コード ↔ コードの判別（confusable）= A1 の担当。
- 本人行 cross-check（rowLabel）= A2 の担当（A2B-2 で着地）。
- unknown_code の hard block ロジック（既存・不変）。
- 保存・projection・DB・external_anchors・plan_day_indicators。

### 5.3 本 readiness 段階での禁止（実行しない）
```
prompt 変更
VLM 再実行
保存再実行
DB write
PLAN_SHIFT_IMPORT_SAVE=true
production
push / PR / deploy
raw 画像 / base64 / VLM raw response の commit
```

---

## 6. 想定 sub-step 分割（A3-impl・各 step は CEO GO 後）

- **A3-1（pure prompt + contract test）**: prompt に第3状態文言を追加、`buildDayKeyedExtractionPrompt` / `buildHardenedDayKeyedPrompt` の contract test で固定。**VLM 不使用・保存不使用**。→ diff preview で停止。
- **A3-2（下流定義整合・D3 採用時のみ）**: `blank_risk` を「低conf空欄 ∨ 空欄隣接」に絞り、`isBlankRisk` と単一定義へ。既存 test 更新。
- **A3-3（gated smoke）**: 別 CEO GO で実画像 1 枚 smoke。§3.7 合格条件で判定。raw artefact は commit しない。

---

## 7. 結論

- F6 の核心は **prompt が read-miss を高 conf `""` で出すのを許している**こと（§1.2 OR）。
- 最小・外科的修正は **prompt で read-miss を低 conf に寄せ、`""` を確実な空に予約**する（§3.2）。下流の amber/low_confidence/soft-gate が自動で拾う。
- hard 化しない（read-miss = soft）。unknown_code の hard は不変。
- **本書は readiness（docs-only）。prompt 変更・VLM 実行はしない**。CEO の D1-D4 判断後に A3-1 から着手する。
