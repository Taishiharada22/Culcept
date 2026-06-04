# SR S-geo-2 — day列中心 X capture UI readiness（assisted flow に 2 点指定を追加・設計のみ）

> 状態: **readiness / UI・状態設計（実装なし）**。`buildShiftGridGeometry`（S-geo-1）が要する
> `firstDayCenterX` / `lastDayCenterX` を、assisted flow でユーザーに **header 帯上の 2 点** として
> 指定させる UI・状態・gate・wire を設計する。**実装しない**（UI/ShiftDraftInApp/AssistedRowSelector/
> ShiftReviewGrid/SourceImageHighlight 変更・VLM 再実行・保存・DB・production・push 禁止）。
> 前提: S-geo-1（pure geometry model `buildShiftGridGeometry`・`c0780393`）。X 路線 = 案A-1（CEO 確定）。

---

## 0. 既存 assisted flow の調査結果（実コード trace）

### state machine（`devShiftDraftReducer` 6 種）
`idle → image_loaded → row_selected(+selection) → crop_review(+selection,year,month) → extracting → cells_loaded`。
`imageObjectUrl`（原画像 blob URL）は image_loaded 以降同一値を維持し **cells_loaded（review）まで引き継ぐ**。
`imageMeta` に `imageW/imageH`（原画像 px）。

### `useShiftDraftFlow`
- `targetMonthValue("YYYY-MM")` → `parseMonthInput` → year/month → `daysInMonth(year,month)` = **dayCount**（既に `handleExtract` で使用）。
- `onRowChange/onRowConfirm(selection)` → dispatch row_selected。`handlePrepareCrops`(row_selected→crop_review) で year/month 確定。

### `AssistedRowSelector`（Y 帯指定 UI）
- 原画像を fit-to-width 表示。tap で personRowBand を suggest。**Y のみ**（header/personRow 帯の上下を drag handle で調整・`clientToImageY`）。
- `editTarget: "header"|"personRow"`。validation = `validateSelection`（両帯 valid + ordering）。CTA「このヘッダとこの行を読み取る」は `ctaActive` 時のみ。
- **X 方向の指定機構が無い**（doc 明記「列方向は VLM に委ねる」）。`clientToImageX` 相当も無い。

### geometry 受け渡し経路（既存）
`ShiftDraftInApp`（**geometry を渡していない**）→ `ShiftImportModal`(geometry pass-through L115) → `ShiftReviewGrid`(L333) → `SourceImageHighlight`（原画像 px + scale）。

→ **cells_loaded 時点で揃うもの**: imageObjectUrl / imageW/H / personRowBand / dayCount。**唯一の欠落 = X（firstDayCenterX/lastDayCenterX）** ＝ S-geo-2 が追加。

---

## 1. どの画面/step で day1中心 / 月末日中心を指定させるか
- **assisted row selection step（`AssistedRowSelector` 上・帯指定と同じ画面）**。原画像が既に出ており、帯（Y）を指定する流れに **X の 2 点指定を追加**する。
- 「読み取る」（extract）の前に完了させる（geometry が cells_loaded で確実に揃う）。

## 2. header band 上か person row 上か
- **header band 上**（CEO 推奨）。日付ヘッダの**列中心**は視覚的に最も安定（勤務セルより数字列が明瞭）。day1 と月末日の 2 点から全列中心を `buildShiftGridGeometry` が決定論的に復元（VLM bbox 不使用）。

## 3. 既存 header/personRow band UI とどう共存させるか
- `editTarget` に **第 3 モード `"dayColumn"`** を追加（fieldset に「日列の中心」を 1 つ増やす）。または帯確定後の **サブ step**「日列の中心を指定」。
- `"dayColumn"` モード時: header 帯の上に **縦マーカー 2 本**（day1 中心 x / 月末日中心 x）を重畳表示。tap で順に置く（1 点目=day1、2 点目=月末日）+「やり直す」で再指定。
- 既存 Y 帯 overlay/handle は不変（X は別レイヤの縦線・別 testid）。`clientToImageX(clientX)` を `clientToImageY` と対称に追加（fit-to-width の aspect で px 換算）。

## 4. 2 点指定の状態名
- **`AssistedRowSelection` に任意 field `dayColumns?: { firstDayCenterX: number; lastDayCenterX: number }` を追加**（座標のみ・画像本体非依存ゆえ既存の「画像を持たない」契約・localStorage 永続化・fingerprint key をそのまま流用可）。
- 純 model に **`validateDayColumns(dayColumns, imageW)`** を追加（`0<=first<last<=imageW`）。CTA gate は `validateSelection`（Y）∧ `validateDayColumns`（X）の両立で active。
- 代替: 別型 `GridXSelection` に分離（疎結合）。**推奨は AssistedRowSelection 拡張**（永続化・再開復元を再利用でき最小）。

## 5. 2 点未完了時に読み取り/保存をどう止めるか
- 「読み取る」CTA（`AssistedRowSelector`）を **両帯 valid ∧ X 2 点完了** まで disabled（既存 `ctaActive` に X 条件を AND）。→ extract に進めない＝geometry 無しの import を作らない。
- 保存（review 後）は geometry に依存しない（geometry は review 照合用）。万一 review 時に geometry 構築失敗（X 欠落/invalid）でも **S3A-2-4 の「原稿を表示して照合」全体トグルに degrade**（枠無しだが機能・crash しない）。= extract gate が主・review は fail-soft。

## 6. dayCount は targetMonth から取るか
- **yes**。`daysInMonth(year, month)`（year/month は targetMonthValue 由来・crop_review で確定済）。`buildShiftGridGeometry` の `dayCount` にそのまま渡す（既存 handleExtract と同じ取り方）。

## 7. `buildShiftGridGeometry` に渡す入力
```
{ imageW: imageMeta.imageW, imageH: imageMeta.imageH,
  personRowBand: selection.personRowBand,
  dayCount: daysInMonth(year, month),
  firstDayCenterX: selection.dayColumns.firstDayCenterX,
  lastDayCenterX:  selection.dayColumns.lastDayCenterX }
```
（headerBand は cropTop/Height に使わない＝S-geo-1 契約どおり。任意で headerBand を渡してもよいが未使用。）

## 8. geometry をどこで保持するか
- **`ShiftDraftInApp` で cells_loaded 時に `buildShiftGridGeometry(...)` を呼び `geometry` を算出**（X は selection.dayColumns 経由で cells_loaded まで引き継がれる）。
- 状態に焼くより **review render 時に算出**（pure・安価）を推奨（state machine 変更を最小化）。`ok=false` なら geometry=undefined（degrade）。

## 9. ShiftImportModal / ShiftReviewGrid へどう渡すか
- `ShiftDraftInApp` の `<ShiftImportModal ... geometry={geometry} blankDays={...} />` に **geometry（+ blankDays）を追加で渡すだけ**（現状未指定）。
- `ShiftImportModal`→`ShiftReviewGrid`→`SourceImageHighlight` は **既存 pass-through**（変更不要）。`blankDays`（空日詰め補正）は projection の空セル日から導出して渡す。

## 10. ObjectURL lifecycle に影響しないこと
- X capture は **座標のみ**（新規 image/ObjectURL を作らない）。`imageObjectUrl` の lifecycle（hook 所有の revoke・cells_loaded 維持）は不変。X マーカーは既存画像表示の上に重畳するだけ。

## 11. fixture fallback / dev route への影響
- dev route（`DevShiftDraftClient`）は `HARADA_SPRIX_JULY_GEOMETRY` を渡す経路 **不変**（X capture を採用してもしなくてもよい）。
- 在app fixture modal（`ShiftImportEntryInner` の debug 経路）は geometry 未指定 **不変**（枠なし・debug 用途で許容）。
- S-geo-2 は **live 経路（ShiftDraftInApp）にのみ X capture + geometry を足す**。他経路は回帰なし。

## 12. test 方針
- **pure**: `validateDayColumns` の unit（境界・順序・範囲）。`buildShiftGridGeometry` は S-geo-1 で済（再利用）。
- **render contract**（`renderToStaticMarkup`・jsdom 不使用の既存規約）: `AssistedRowSelector` に dayColumn モード/マーカーの構造（testid）が出る・CTA が X 未完了で disabled（両帯 valid でも X 無しなら inactive）の構造固定。
- interaction（tap で X が入る）は静的 render では不可ゆえ **state/gate の構造**を固定（既存 band tap も同方針）。
- **raw 画像/base64/canvas を test に持ち込まない**。

## 13. 実装分割案（CEO 提示の 2A–2D に整合）
```
S-geo-2A: 本 readiness（UI/状態設計）                                   ← docs-only（本書）
S-geo-2B: capture state + render contract                              ← pure: AssistedRowSelection.dayColumns +
          validateDayColumns + AssistedRowSelector に dayColumn モード/マーカー/CTA gate + render contract test
S-geo-2C: geometry wire（ShiftDraftInApp が buildShiftGridGeometry を呼び
          geometry+blankDays を ShiftImportModal へ渡す）+ contract test
S-geo-2D: ShiftReviewGrid hover smoke（live 経路で実画像 → 2 点指定 → 枠表示を CEO 確認・staging 不要 = 保存しない）
```
- 各段 別 GO。2B は pure+contract（DB/VLM/save 非接触）、2C は UI wire（保存しない）、2D は目視 smoke（保存不要・読み取りのみ）。

---

## 14. 申し送り（独立判断・rule ②）
- **X gate は extract のみ**（保存は geometry 非依存）。review は geometry 失敗時 S3A-2-4 全体トグルに fail-soft（枠は enhancement・hard 依存にしない）。
- **`dayColumns` は AssistedRowSelection 拡張**を推奨（座標・画像非依存ゆえ既存の永続化/fingerprint/「画像を持たない」契約を壊さない）。`validateSelection` は Y 専用のまま保ち、X は別 `validateDayColumns` で分離（既存テスト不変）。
- **blankDays**: 照合枠の正確さ（空日詰め）に必要。projection の空セル日から導出して `SourceImageHighlight` まで渡す経路を 2C で確認（現状 live は未配線）。
- **2 点の意味**: day1 中心 = 1 日の**ヘッダ数字**列中心 / 月末日中心 = dayCount 日のヘッダ数字列中心（規則正しい・詰めなし）。描画時の詰め補正は `sourceColumnForDay(blankDays)` が担う（geometry はヘッダ基準）。

## 15. scope / 禁止
- 🟢 本 readiness = docs-only。
- 🔴 実装は **S-geo-2B 以降の別 GO**。UI/ShiftDraftInApp/AssistedRowSelector/ShiftReviewGrid/SourceImageHighlight 変更・VLM 再実行・保存・DB write・production・M3-c auto-open seam・push/PR・raw画像/base64/VLM raw commit は禁止。
- stage しない: `supabase/.temp/*` / `dev-month-grid/*` / `.env.local` / raw・crop・base64・VLM log / runner / demo。

## 16. CEO 判断点
1. 本 readiness 受理 or 補正。
2. X capture の置き方（**editTarget 第3モード** か **帯確定後サブ step** か）。推奨: editTarget 第3モード（同一画面・行き来が軽い）。
3. `dayColumns` を **AssistedRowSelection 拡張**（推奨）か別型か。
4. 受理なら **S-geo-2B（capture state + render contract・pure）GO**。
