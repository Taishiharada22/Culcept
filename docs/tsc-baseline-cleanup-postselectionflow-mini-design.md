# tsc baseline — postSelectionFlow null 監査 + mini design

> 2026-06-07 / **read-only 監査 + 設計のみ・実装は CEO 判断後** / 対象: postSelectionFlow cluster（tsc 残 74 のうち）。
> CEO 指示: schema/parser/consumer/fixture を厳密突合・曖昧修正禁止。

---

## 0. 結論（先に）
- **これは production 型バグではない**。test fixture が `activity: null` を使っているが、**production は "" (空文字)** で「activity 未指定」を表す。
- **全 consumer が null と "" を falsy として同一扱い**（`!activity` / `?? ""`）→ `null → ""` は **runtime 挙動不変**。
- 前回 batch3 の「JSON schema は null 許容 vs TS string=prod 不整合」評価は**誤り**（誤って patch 用 WHAT_PATCH_SCHEMA を参照していた。test の文脈は WHAT_SLOT で schema/型とも string 必須）。
- **推奨 = 案A（test fixture `null → ""`）**。production-accurate・型不変・挙動不変。GO 可。

## 1. 監査結果（postSelectionFlow 13 件）
| 種別 | 件数 | 内容 |
|---|---|---|
| activity-null cluster | **12** | `what: { activity: null, activityCanonical: null }` の 6 ペア（lines 75-76, 142-143, 195-196, 249-250, 338-339, 398-399）。TS2322 `null not assignable to string` |
| 別件 | 1 | line 154: `rawRef` missing in NormalizedPlaceCandidate（mock multi-field stale・本 cluster 外・別途） |

→ 本 mini design の対象は **activity-null の 12 件**。rawRef(1) は別 mock-shape 案件。

## 2. schema / 型 / production / consumer の突合
| 層 | activity の扱い | 出典 |
|---|---|---|
| TS 型 `WhatSlot` | `activity: string`（必須・非 null） | eventSchema.ts:112 |
| JSON schema `WHAT_SLOT_SCHEMA`（**test の文脈=full what slot**） | `activity: { type: "string" }` required | structuredSchema.ts:103 |
| JSON schema `WHAT_PATCH_SCHEMA`（**patch/delta 専用・別構造**） | `activity: { type: ["string","null"] }` | structuredSchema.ts:274 |
| production 生成（LLM provider） | **`activity: ""`**（未指定時） | llmComprehensionProvider.ts:104 |
| production 生成（deterministic/synthetic） | canonical string / `?? ""` | deterministicOperationSynth:549 / syntheticEventBuilder:149 |
| production が null を設定する箇所 | **ゼロ**（全 lib 走査で該当なし） | — |
| test fixture | `activity: null` | postSelectionFlow.test.ts |

### consumer の activity 扱い（null/"" 同一扱いの証拠）
- `answerBinder.ts:519`: `if (!ev.what.activity || ev.what.activity.trim() === "")` → null も "" も falsy で「what missing」
- `provenanceChecker.ts:131`: `return !ev.what.activity || ev.what.activity.trim() === "";`
- `eventSchema.ts:459`: `(what.activity ?? "").trim()` → null は "" に正規化
- `operationDispatcher.ts:143`: `if (!d.what.activity || ...)` 
- `reconcileEffectiveEvents.ts:341`: `nextEvent?.what.activity ?? ""`
- `gapResolver.ts:357`: `ev.what.activity ?? ...`
→ **全 consumer が `!activity` / `?? ""` で防御**。null と "" を区別せず同一（=「未指定」）に扱う。

## 3. root cause
- test fixture は「what 未指定」を `activity: null` で表現しているが、**production は同じ状態を `activity: ""` で表現**する（型 `string` と整合）。
- WhatSlot 型は `string` 必須で**正しい**（production は常に string/"" を生成・null を生成しない）。
- consumer が `?? ""` / `!activity` で防御しているのは、過去 null fixture との後方互換的な over-defensive（実害なし）。
- ＝ **test fixture の null が production 実態（""）と乖離した stale 値**。型バグではない。

## 4. 修正候補 A/B/C
| 案 | 内容 | リスク | tsc 削減 | prod 挙動 |
|---|---|---|---|---|
| **A（推奨）** | test fixture の `activity: null` / `activityCanonical: null` → `""`（6 ペア=12 箇所） | **低**。production-accurate（production は ""）。consumer は null/"" 同一扱い→**挙動不変**。型不変。test 意図（what 未指定=missing_semantic_critical:["what"] は維持）不変 | **−12** | なし |
| B | TS 型 `WhatSlot.activity` を `string \| null` に | **中〜高（NO-GO）**。production は null を生成しないので型が実態より緩くなる（誤り）。consumer 型・他 WhatSlot 利用箇所に ripple。production source 変更。**仕様変更に相当** | −12（だが不正） | 型の意味変更 |
| C | test fixture を `undefined` / omit | **不可**。WhatSlot.activity は非 optional（必須）→ omit 不可。`undefined` も string 型に非代入 | — | — |

## 5. 推奨 = 案A
- production が「未指定 activity」を `""` で表す実態に test fixture を合わせる（null→""）。型は `string` のまま正しい。
- consumer が null/"" を同一扱いするため **runtime 挙動・test assertion の意味は不変**。
- これは「tsc を減らすためだけの置換」ではなく、**production 実態（""）への fixture 整合**（correctness 修正）。

## 6. 実装するなら（案A・CEO GO 後）
- **変更対象ファイル**: `tests/unit/alter-morning/postSelectionFlow.test.ts` のみ（test-only）。
- 6 ペアの `activity: null,` `activityCanonical: null,` → `activity: "",` `activityCanonical: "",`（12 箇所）。
- production source・型定義・schema は**不変**。
- tsc 削減見込み: **−12**（74→62）。rawRef(1) は対象外。
- production 挙動変更: **なし**。
- 検証: tsc before/after・source 不増・alter-morning vitest（postSelectionFlow が null/"" 同一扱いを確認）。

## 7. GO / NO GO 判断点
- ✅ **GO 条件（全て満たす）**: production は null を生成しない（確認済）/ consumer は null/"" 同一扱い（確認済）/ 型 `string` は production 実態と整合（変更不要）/ test 意図不変（missing_semantic_critical で what 未指定を表現・維持）/ S5・perspectiveEngine 不波及（alter-morning comprehension のみ）。
- ❌ **NO-GO だったら**: もし consumer が `activity === null` で特別分岐していたら（→ なかった）/ production が null を生成していたら（→ していない）/ 案B（型を string|null）を選ぶなら（仕様変更で NO-GO）。
- ★ CEO HARD GATE 照合: runtime consumer は string 前提でない（null/"" 防御）→ 案A は consumer 不接触で安全。null 許容（案B）は仕様変更=NO-GO。test 意味変更なし。S5 不波及。tsc-only でなく prod 実態整合。→ **案A は HARD GATE 全通過**。

## 8. 補足（別件）
- postSelectionFlow line 154 の `rawRef` missing（NormalizedPlaceCandidate mock）は activity-null と別原因（mock の必須 field 欠落 multi-field stale）。本 cluster GO 時に同梱するか別途かは CEO 判断（本 mini design は activity-null 12 件に限定）。
